// Planlaegger ALLE godkendte, endnu ikke afsendte Facebook-elementer paa én gang.
//
// Hvert element afleveres til Meta med published=false og et
// scheduled_publish_time taget fra elementets eget laaste "dato"-felt.
// Meta holder opslaget og offentliggoer det selv paa tidspunktet. Du godkender
// altsaa én gang, og de fire gaar ud paa hver sin dato.
//
// Metas vindue er 10 minutter til 30 dage fra afsendelsen. Elementer udenfor
// springes over og rapporteres - de tvinges ikke ind, for "dato" er et laast
// felt og maa ikke bøjes for at passe ind i vinduet.
//
// Toerloeb er standard. Der sendes kun med --planlaeg.
//
//   FB_PAGE_ID       siden der planlaegges paa
//   FB_PAGE_TOKEN    system user-token, veksles til side-token pr. koersel
//
// Anden tilstand: --skriv-register <resultatfil> foejer resultaterne til
// publicering/register.json. Holdt adskilt, saa selve planlaegningen kan koere
// uden skriveadgang til repoet.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, sha256 } from './laas.mjs';
import { byggPayload, hentSidetoken, publicer as publicerNu } from './publicer-facebook.mjs';
import {
  registerSpaerre, forfald, forSentGrund, kravraekke, forSentRaekke,
  foejTilRegister, MAKS_FORSINKELSE_S, varighed,
} from './krav.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LAASE = 'publicering/laase';
const REGISTER = 'publicering/register.json';
const KRAV = 'krav-facebook.json';

// Metas graenser for scheduled_publish_time.
const MIN_SEK = 10 * 60;
const MAX_SEK = 30 * 24 * 60 * 60;

// Det udledte side-token er en hemmelighed, GitHub IKKE maskerer: kun
// registrerede secrets maskeres, og dette er afledt under koerslen.
// Fejltekster fra Meta ender i register.json, som ligger i et OFFENTLIGT repo.
// Derfor skal alt, der skrives derind, gennem skrub().
let sidetoken = null;

/** Fjerner alt der ligner et token fra en tekst, foer den gemmes eller logges. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [process.env.FB_PAGE_TOKEN, sidetoken].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(access_token"?\s*[:=]\s*"?)[^&\s",}]+/gi, '$1«udeladt»');
}

// Spaerren paa registret er den faelles i krav.mjs: afsendt, undervejs,
// fejlet eller stoppet. «PLANLAGT» hoerer med — et opslag, der ALLEREDE
// ligger hos Meta, maa aldrig oprettes igen. Det er den vigtigste spaerre paa
// denne kanal, fordi Meta holder opslaget frem i tiden, og en dublet dér ville
// gaa ud af sig selv paa dagen.

const laesRegister = () =>
  existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : [];

function tid(sek) {
  const d = new Date(sek * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Samler de elementer der skal planlaegges, og forklarer hvert fravalg. */
function udvaelg(nu) {
  const reg = laesRegister();
  const valgt = [];      // fremtidige: afleveres til Meta
  const indhent = [];    // datoen er passeret, men inden for vinduet: ud nu
  const forSent = [];    // uden for vinduet: stoppes
  const sprunget = [];

  for (const f of readdirSync(LAASE).filter((x) => x.endsWith('.json')).sort()) {
    const e = JSON.parse(readFileSync(join(LAASE, f), 'utf8'));
    const nr = e.element;

    if (e.kanal !== 'facebook') {
      sprunget.push([nr, `kanal er ${e.kanal}, ikke facebook`]); continue;
    }
    const spaerre = registerSpaerre(reg, nr);
    if (spaerre) { sprunget.push([nr, spaerre]); continue; }

    // Godkendelsen og laasen skal holde, foer elementet overhovedet overvejes.
    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    // ── TIDEN ────────────────────────────────────────────────────────────
    // Facebook er den ene kanal, hvor motoren afleverer opslaget til Meta
    // FREM I TIDEN. Derfor maa 24-timersreglen ikke bruges paa en maade, der
    // afviser et element, fordi det planlaegges flere dage foer sin dato: et
    // fremtidigt element er hverken forsinket eller for sent.
    //
    // Reglen gaelder fra det godkendte tidspunkt og fremefter:
    //
    //   fremtiden, 10 min - 30 dage ude  →  afleveres til Meta (som hidtil)
    //   fremtiden, over 30 dage ude      →  venter; Metas vindue naas senere
    //   fremtiden, under 10 min ude      →  venter; under Metas minimum
    //   passeret, inden for vinduet      →  INDHENTES: publiceres nu
    //   passeret, uden for vinduet       →  stoppes til manuel vurdering
    //
    // Indhentningen er svaret paa det, der kostede element 33, 34, 35 og 36:
    // workflowet var manuelt, datoen passerede, og Metas vindue lukkede sig
    // bag dem. De faldt paa gulvet uden at nogen kunne gribe dem. Nu gribes
    // de — med den eksisterende, godkendte publiceringsvej i
    // publicer-facebook.mjs, som sender opslaget med det samme.
    const { tilstand, naar } = forfald(e, nu, MAKS_FORSINKELSE_S);
    if (tilstand === 'ulaeselig') { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }

    if (tilstand === 'for_sent') {
      sprunget.push([nr, `${tid(naar)}: ${forSentGrund(e, naar, nu, MAKS_FORSINKELSE_S)}`]);
      forSent.push({ e, naar });
      continue;
    }
    if (tilstand === 'forfalden') {
      indhent.push({ e, naar });
      continue;
    }

    const om = naar - nu;
    if (om < MIN_SEK) {
      sprunget.push([nr, `dato er under 10 minutter ude (${tid(naar)}) — under Metas minimum. Gribes ved naeste koersel, naar tidspunktet er naaet`]);
      continue;
    }
    if (om > MAX_SEK) {
      sprunget.push([nr, `dato er ${Math.round(om / 86400)} dage ude — over Metas maksimum paa 30 dage. Afleveres naar den kommer inden for vinduet`]);
      continue;
    }
    valgt.push({ e, naar, om });
  }
  return { valgt, indhent, forSent, sprunget };
}

/**
 * Tager kravet FOER der sendes noget — baade paa det, der skal planlaegges, og
 * paa det, der skal indhentes. Se krav.mjs.
 *
 * Et opslag, der ER afleveret til Meta, men hvis registrering gik tabt, ville
 * ellers blive afleveret igen og gaa ud TO gange paa dagen. Kravet lukker det.
 */
export function tagKrav(nu = Math.floor(Date.now() / 1000)) {
  const { valgt, indhent, forSent, sprunget } = udvaelg(nu);
  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  foejTilRegister([
    ...forSent.map(({ e, naar }) => forSentRaekke(e, 'facebook', naar, MAKS_FORSINKELSE_S, nu)),
    ...valgt.map(({ e }) => kravraekke(e, 'facebook')),
    ...indhent.map(({ e }) => kravraekke(e, 'facebook')),
  ], REGISTER);
  writeFileSync(KRAV, JSON.stringify({
    planlaeg: valgt.map(({ e }) => e.element),
    indhent: indhent.map(({ e }) => e.element),
  }, null, 2) + '\n');
  console.log(`${valgt.length} til planlaegning hos Meta, ${indhent.length} til indhentning nu, ${forSent.length} stoppet.`);
  for (const { e, naar } of indhent) {
    console.log(`  indhentes: element ${e.element} forfaldt for ${varighed(nu - naar)} siden «${e.titel}»`);
  }
  return { valgt, indhent, forSent };
}

async function planlaeg({ toerloeb = true } = {}) {
  const nu = Math.floor(Date.now() / 1000);
  const medKrav = existsSync(KRAV);
  const krav = medKrav ? JSON.parse(readFileSync(KRAV, 'utf8')) : null;
  const { valgt: valgtNu, indhent: indhentNu, sprunget } = udvaelg(nu);
  // Findes kravfilen, er DEN sandheden: udvaelgelsen ville nu springe netop
  // disse over, fordi de staar som «PUBLICERING IGANG». Det er meningen.
  const fraNumre = (numre) => numre.map((nr) => {
    const fil = `${LAASE}/element-${String(nr).padStart(2, '0')}.json`;
    if (!existsSync(fil)) throw new Error(`kravet naevner element ${nr}, men ${fil} findes ikke`);
    const e = JSON.parse(readFileSync(fil, 'utf8'));
    if (e.kanal !== 'facebook') throw new Error(`element ${nr} er kanal ${e.kanal}, ikke facebook`);
    const naar = Math.floor(new Date(e.dato).getTime() / 1000);
    return { e, naar, om: naar - nu };
  });
  const valgt = medKrav ? fraNumre(krav.planlaeg) : valgtNu;
  const indhent = medKrav ? fraNumre(krav.indhent) : indhentNu;
  if (medKrav) console.log(`Kravfil fundet — ${valgt.length} til planlaegning, ${indhent.length} til indhentning.\n`);

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive planlagt.\n'
    : 'PLANLAEGGER hos Meta. Opslagene offentliggoeres af Meta paa hver sin dato.\n');

  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  if (!valgt.length && !indhent.length) {
    console.log('Intet at planlaegge og intet at indhente.');
    return [];
  }
  if (indhent.length) {
    console.log('── indhentes (datoen er passeret, men inden for vinduet) ──');
    for (const { e, naar } of indhent) {
      console.log(`  element ${String(e.element).padStart(2)}  forfaldt for ${varighed(nu - naar)} siden  «${e.titel}»`);
    }
    console.log('');
  }
  if (!valgt.length) console.log('Intet at planlaegge hos Meta.\n');

  if (valgt.length) console.log('── planlaegges hos Meta ──');
  for (const { e, naar, om } of valgt) {
    console.log(`  element ${String(e.element).padStart(2)}  ${tid(naar)}  (om ${Math.round(om / 86400)} dage)  «${e.titel}»`);
  }
  console.log('');

  const sideId = process.env.FB_PAGE_ID;
  const resultater = [];

  if (toerloeb) {
    for (const { e, naar } of valgt) {
      const { sti } = byggPayload({ ...e, side_id: sideId });
      console.log(`── element ${e.element} → ${sti} (planlagt til ${tid(naar)}) ──`);
      resultater.push({ element: e.element, versionslaas: e.versionslaas, toerloeb: true, planlagt_til: naar });
    }
    for (const { e } of indhent) {
      console.log(`── element ${e.element} → indhentes, publiceres NU ──`);
      await publicerNu(e, { dryRun: true });
      resultater.push({ element: e.element, versionslaas: e.versionslaas, toerloeb: true, indhentet: true });
    }
    return resultater;
  }

  if (!sideId) throw new Error('FB_PAGE_ID mangler i miljoeet.');
  const brugertoken = process.env.FB_PAGE_TOKEN;
  if (!brugertoken) throw new Error('FB_PAGE_TOKEN mangler i miljoeet.');
  // Samme veksling som ved direkte publicering: side-tokenet hentes pr. koersel
  // og opbevares aldrig.
  sidetoken = await hentSidetoken(sideId, brugertoken);

  for (const { e, naar } of valgt) {
    const { sti, body } = byggPayload({ ...e, side_id: sideId });
    const nyttelast = { ...body, published: false, scheduled_publish_time: naar, access_token: sidetoken };
    let post = { element: e.element, kanal: 'facebook', versionslaas: e.versionslaas,
                 status: 'PLANLAEGNING FEJLET', post_id: null, planlagt_til: naar,
                 tidspunkt: new Date().toISOString() };
    try {
      const r = await fetch(`${GRAPH}/${sti}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nyttelast),
      });
      const svar = await r.json();
      if (!r.ok) throw new Error(`Meta afviste: ${r.status} ${JSON.stringify(svar)}`);
      post = { ...post, status: 'PLANLAGT', post_id: svar.post_id ?? svar.id };
      console.log(`  OK    element ${e.element} planlagt til ${tid(naar)} (${post.post_id})`);
    } catch (err) {
      post.fejl = skrub(err.message).slice(0, 500);
      console.log(`  FEJL  element ${e.element}: ${post.fejl}`);
    }
    resultater.push(post);
  }

  // ── INDHENTNING ─────────────────────────────────────────────────────────
  // Datoen er passeret, men inden for vinduet. Metas planlaegning kan ikke
  // bruges (den kraever mindst 10 minutter ud i fremtiden), saa opslaget
  // sendes med det samme ad den eksisterende, godkendte vej i
  // publicer-facebook.mjs. Den efterregner laas, teksthash og godkendelse
  // igen, foer den sender noget — og ingen af dem lempes for at indhente.
  for (const { e, naar } of indhent) {
    const post = { element: e.element, kanal: 'facebook', versionslaas: e.versionslaas,
                   status: 'PUBLICERING FEJLET', post_id: null, indhentet: true,
                   godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString() };
    try {
      const r = await publicerNu(e, { dryRun: false });
      post.status = 'PUBLICERET';
      post.post_id = r.post_id ?? null;
      post.noter = `Indhentet: forfaldt for ${varighed(nu - naar)} siden og blev publiceret med det samme.`;
      console.log(`  OK    element ${e.element} indhentet og publiceret (${post.post_id})`);
    } catch (err) {
      post.fejl = skrub(err.message).slice(0, 500);
      post.noter = 'Indhentning fejlede. Udfaldet kan vaere uvist — se efter paa siden FOER nyt forsoeg.';
      console.log(`  FEJL  element ${e.element}: ${post.fejl}`);
    }
    resultater.push(post);
  }
  return resultater;
}

/** Laeser resultatfilen. Mangler den, naaede planlaegningen aldrig at svare. */
function laesResultat(fil) {
  if (!fil || !existsSync(fil)) {
    console.error('Ingen resultatfil — planlaegningen naaede aldrig at svare.');
    return null;
  }
  return JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
}

/** Foejer resultaterne til registret. Koeres i et separat trin med skriveadgang. */
function skrivRegister(fil) {
  const ægte = laesResultat(fil);
  if (ægte === null) return 1;
  if (!ægte.length) { console.log('Toerloeb — intet registreres.'); return 0; }
  const reg = laesRegister();
  reg.push(...ægte);
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2) + '\n');
  const ok = ægte.filter((r) => ['PLANLAGT', 'PUBLICERET'].includes(r.status)).length;
  console.log(`${ægte.length} post(er) skrevet i registret — ${ok} planlagt, ${ægte.length - ok} fejlet.`);
  return ægte.length - ok;
}

/** Doemmer uden at skrive. Skal koere EFTER at registret er committet. */
function statusKun(fil) {
  const ægte = laesResultat(fil);
  if (ægte === null) return 1;
  const fejlede = ægte.filter((r) => !['PLANLAGT', 'PUBLICERET'].includes(r.status));
  if (fejlede.length) {
    for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''}`);
    return fejlede.length;
  }
  console.log(`Alle ${ægte.length} element(er) staar som PLANLAGT eller PUBLICERET i registret.`);
  return 0;
}

// Modulet eksporterer tagKrav(), saa proever kan kalde den. Uden denne vagt
// ville et import koere en hel planlaegning.
const koertDirekte = import.meta.url === `file://${process.argv[1]}`;
const args = koertDirekte ? process.argv.slice(2) : [];
if (!koertDirekte) {
  // intet: filen er importeret, ikke startet
} else if (args[0] === '--tag-krav') {
  try { tagKrav(); process.exit(0); }
  catch (err) { console.error('FEJL:', err.message); process.exit(1); }
} else if (args[0] === '--skriv-register') {
  process.exit(skrivRegister(args[1]) > 0 ? 1 : 0);
} else if (args[0] === '--status-kun') {
  process.exit(statusKun(args[1]) > 0 ? 1 : 0);
} else {
  planlaeg({ toerloeb: !args.includes('--planlaeg') })
    .then((r) => {
      writeFileSync('resultat-planlaegning.json', JSON.stringify(r, null, 2) + '\n');
      const fejlede = r.filter((x) => x.status === 'PLANLAEGNING FEJLET').length;
      console.log(fejlede ? `\n${fejlede} element(er) fejlede.` : '\nFaerdig.');
      process.exit(fejlede > 0 ? 1 : 0);
    })
    .catch((err) => { console.error('FEJL:', skrub(err.message)); process.exit(1); });
}

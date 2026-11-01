// Publicerer de LinkedIn-elementer, hvis godkendte tidspunkt er naaet.
//
// LinkedIn kan ikke planlaegge. "lifecycleState" accepterer kun PUBLISHED ved
// oprettelse, og der findes ingen scheduledAt. Skal et opslag ud kl. 08.00,
// skal nogen kalde API'et kl. 08.00. Det er denne koersel.
//
// Samme model som publicer-instagram-planlagt: udvaelgelsen sker HER, og den
// faktiske publicering ligger i publicer-linkedin.mjs, som er uaendret. Den
// fil baerer destinationskontrollen og har tre proever paa sig; den roeres
// ikke for at tilfoeje planlaegning.
//
//   LI_ACCESS_TOKEN, LI_PERSON_URN, LI_TILLADT_URN   fra GitHub Secrets
//
// Spaerrer, i raekkefoelge:
//   1. kanal skal vaere linkedin
//   2. elementet maa ikke allerede staa som afsendt i registret
//   3. et tidligere fejlet forsoeg er en spaerre, ikke en invitation til at
//      proeve igen. Det kraever et menneske.
//   4. versionslaas, teksthash og godkendelse skal holde
//   5. dato skal vaere naaet. Intet gaar ud foer tid.
//   6. destinationskontrollen i publicer-linkedin.mjs, fem kontroller
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, sha256 } from './laas.mjs';
import { publicer } from './publicer-linkedin.mjs';
import {
  registerSpaerre, koeSpaerre, forfald, kravraekke, forSentRaekke, forSentGrund, foejTilRegister,
  laesRegister as laesReg, MAKS_FORSINKELSE_S,
} from './krav.mjs';

const LAASE = 'publicering/laase';
const REGISTER = 'publicering/register.json';
const KOE = 'publicering/koe.json';
const RESULTAT = 'resultat-linkedin.json';
const KRAV = 'krav-linkedin.json';

const laesRegister = () => laesReg(REGISTER);

const tid = (sek) => new Date(sek * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** Et access token maa aldrig ende i register.json, som ligger i et OFFENTLIGT repo. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [process.env.LI_ACCESS_TOKEN].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(Bearer\s+)[^\s"',}]+/gi, '$1«udeladt»')
          .replace(/(access_token"?\s*[:=]\s*"?)[^&\s",}]+/gi, '$1«udeladt»');
}

export function udvaelg(nu, { laase = LAASE, register, koe } = {}) {
  const reg = register ?? laesRegister();
  const k = koe ?? (existsSync(KOE) ? JSON.parse(readFileSync(KOE, 'utf8')) : []);
  const valgt = [], sprunget = [], forSent = [];

  for (const f of readdirSync(laase).filter((x) => x.endsWith('.json')).sort()) {
    const e = JSON.parse(readFileSync(join(laase, f), 'utf8'));
    const nr = e.element;
    if (e.kanal !== 'linkedin') { sprunget.push([nr, `kanal er ${e.kanal}, ikke linkedin`]); continue; }

    // Faelles spaerre: afsendt, undervejs, fejlet eller stoppet. Et uvist
    // udfald er en spaerre, ikke en invitation til at proeve igen.
    const spaerre = registerSpaerre(reg, nr);
    if (spaerre) { sprunget.push([nr, spaerre]); continue; }

    // Koeen skal sige «motor» og vaere enig med laasen. Se koeSpaerre.
    const kSpaerre = koeSpaerre(k, e, laase === LAASE ? `${LAASE}/${f}` : null, 'linkedin');
    if (kSpaerre) { sprunget.push([nr, kSpaerre]); continue; }

    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    // Tidspunktet. Hoejst en time efter det godkendte: et opslag, der kommer
    // halvanden time for sent, kan vaere forkert nu — og det skal et menneske
    // afgoere, ikke en sen automatik. Det stoppes og registreres som stoppet.
    const { tilstand, naar } = forfald(e, nu, MAKS_FORSINKELSE_S);
    if (tilstand === 'ulaeselig') { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }
    if (tilstand === 'fremtid') { sprunget.push([nr, `forfalder foerst ${tid(naar)}`]); continue; }
    if (tilstand === 'for_sent') {
      sprunget.push([nr, `${tid(naar)}: ${forSentGrund(e, naar, nu, MAKS_FORSINKELSE_S)}`]);
      forSent.push({ e, naar });
      continue;
    }

    valgt.push({ e, naar });
  }
  return { valgt, sprunget, forSent };
}

/**
 * Tager kravet FOER der sendes noget: skriver «PUBLICERING IGANG» i registret
 * og lister de elementer, publiceringsjobbet derefter maa sende. Koerer uden
 * net og uden token. Se krav.mjs for hvorfor.
 */
export function tagKrav(nu = Math.floor(Date.now() / 1000)) {
  const { valgt, sprunget, forSent } = udvaelg(nu);
  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  const raekker = [
    ...forSent.map(({ e, naar }) => forSentRaekke(e, 'linkedin', naar, MAKS_FORSINKELSE_S, nu)),
    ...valgt.map(({ e }) => kravraekke(e, 'linkedin')),
  ];
  foejTilRegister(raekker, REGISTER);
  writeFileSync(KRAV, JSON.stringify(valgt.map(({ e }) => e.element), null, 2) + '\n');
  console.log(`${valgt.length} element(er) kravet er taget paa, ${forSent.length} stoppet som for sent.`);
  for (const { e } of valgt) console.log(`  krav paa element ${e.element} «${e.titel}»`);
  return { valgt, forSent };
}

async function publicerEt(e) {
  const faelles = { element: e.element, kanal: 'linkedin', versionslaas: e.versionslaas,
    godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString(), registreret_af: 'motor' };
  try {
    const r = await publicer(e, { dryRun: false });
    console.log(`  element ${e.element}: publiceret, post ${r.post_id}`);
    return { ...faelles, status: 'PUBLICERET', post_id: r.post_id ?? null };
  } catch (err) {
    const besked = skrub(err.message);
    console.error(`  element ${e.element}: FEJLET — ${besked}`);
    return { ...faelles, status: 'PUBLICERING FEJLET', post_id: null, fejl: besked };
  }
}

/**
 * De elementer, kravet er taget paa. Findes kravfilen, er DEN sandheden:
 * udvaelgelsen ville nu springe netop disse over, fordi de staar som
 * «PUBLICERING IGANG» — det er hele meningen med kravet. Laasen, teksthashen,
 * godkendelsen, destinationen og billedet kontrolleres stadig for hvert
 * enkelt, i publicer().
 */
function fraKrav() {
  const numre = JSON.parse(readFileSync(KRAV, 'utf8'));
  const ud = [];
  for (const nr of numre) {
    const fil = join(LAASE, `element-${String(nr).padStart(2, '0')}.json`);
    if (!existsSync(fil)) throw new Error(`kravet naevner element ${nr}, men ${fil} findes ikke`);
    const e = JSON.parse(readFileSync(fil, 'utf8'));
    if (e.kanal !== 'linkedin') throw new Error(`element ${nr} er kanal ${e.kanal}, ikke linkedin`);
    ud.push({ e, naar: Math.floor(new Date(e.dato).getTime() / 1000) });
  }
  return ud;
}

async function koer({ toerloeb = true } = {}) {
  const nu = Math.floor(Date.now() / 1000);
  const medKrav = existsSync(KRAV);
  const { valgt, sprunget } = medKrav
    ? { valgt: fraKrav(), sprunget: [] }
    : udvaelg(nu);
  if (medKrav) console.log(`Kravfil fundet — publicerer de ${valgt.length} element(er), kravet er taget paa.\n`);

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive publiceret.\n'
    : 'PUBLICERER paa LinkedIn. Kun godkendt materiale, ordret som laast.\n');

  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  if (!valgt.length) { console.log('Intet forfaldent at publicere.'); return []; }

  console.log('── forfaldne ──');
  for (const { e, naar } of valgt) {
    console.log(`  element ${String(e.element).padStart(2)}  forfaldt ${tid(naar)}  «${e.titel}»`);
  }
  console.log('');

  const resultater = [];
  for (const { e, naar } of valgt) {
    if (toerloeb) {
      // Toerloeb koerer destinationskontrollen med, saa proeven er en rigtig
      // proeve. publicer() med dryRun sender intet.
      await publicer(e, { dryRun: true });
      resultater.push({ element: e.element, versionslaas: e.versionslaas, toerloeb: true, forfaldt: naar });
    } else {
      resultater.push(await publicerEt(e));
    }
  }
  return resultater;
}

/** Foejer resultaterne til registret. Separat trin, saa publicering kan koere uden skriveadgang. */
function skrivRegister(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil — publiceringen naaede aldrig at svare.'); return 1; }
  const aegte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  if (!aegte.length) { console.log('Toerloeb eller intet forfaldent — intet registreres.'); return 0; }
  const reg = laesRegister();
  reg.push(...aegte);
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2) + '\n');
  const ok = aegte.filter((r) => r.status === 'PUBLICERET').length;
  console.log(`${aegte.length} post(er) skrevet i registret — ${ok} publiceret, ${aegte.length - ok} fejlet.`);
  return aegte.length - ok;
}

/** Doemmer uden at skrive. Koeres EFTER registret er committet. */
function statusKun(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil.'); return 1; }
  const aegte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  const fejlede = aegte.filter((r) => r.status !== 'PUBLICERET');
  if (fejlede.length) {
    for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''}`);
    return fejlede.length;
  }
  console.log(aegte.length ? `Alle ${aegte.length} element(er) publiceret.` : 'Intet at doemme.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--tag-krav') {
    try { tagKrav(); process.exit(0); }
    catch (err) { console.error('FEJL:', err.message); process.exit(1); }
  } else if (args[0] === '--skriv-register') {
    process.exit(skrivRegister(args[1]) > 0 ? 1 : 0);
  } else if (args[0] === '--status-kun') {
    process.exit(statusKun(args[1]) > 0 ? 1 : 0);
  } else {
    koer({ toerloeb: !args.includes('--publicer') })
      .then((r) => {
        writeFileSync(RESULTAT, JSON.stringify(r, null, 2) + '\n');
        const fejlede = r.filter((x) => x.status === 'PUBLICERING FEJLET').length;
        console.log(fejlede ? `\n${fejlede} element(er) fejlede.` : '\nFaerdig.');
        process.exit(fejlede > 0 ? 1 : 0);
      })
      .catch((err) => { console.error('FEJL:', skrub(err.message)); process.exit(1); });
  }
}

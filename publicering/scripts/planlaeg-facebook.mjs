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
import { byggPayload, hentSidetoken } from './publicer-facebook.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LAASE = 'publicering/laase';
const REGISTER = 'publicering/register.json';

// Metas graenser for scheduled_publish_time.
const MIN_SEK = 10 * 60;
const MAX_SEK = 30 * 24 * 60 * 60;

/** Statusser der betyder "roer ikke elementet igen". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT'];

const laesRegister = () =>
  existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : [];

function tid(sek) {
  const d = new Date(sek * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Samler de elementer der skal planlaegges, og forklarer hvert fravalg. */
function udvaelg(nu) {
  const reg = laesRegister();
  const valgt = [];
  const sprunget = [];

  for (const f of readdirSync(LAASE).filter((x) => x.endsWith('.json')).sort()) {
    const e = JSON.parse(readFileSync(join(LAASE, f), 'utf8'));
    const nr = e.element;

    if (e.kanal !== 'facebook') {
      sprunget.push([nr, `kanal er ${e.kanal}, ikke facebook`]); continue;
    }
    const post = [...reg].reverse().find((x) => x.element === nr && AFSENDT.includes(x.status));
    if (post) {
      sprunget.push([nr, `staar som ${post.status} i registret`]); continue;
    }

    // Godkendelsen og laasen skal holde, foer elementet overhovedet overvejes.
    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    const naar = Math.floor(new Date(e.dato).getTime() / 1000);
    if (Number.isNaN(naar)) { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }
    const om = naar - nu;
    if (om < MIN_SEK) {
      sprunget.push([nr, om < 0
        ? `dato er passeret (${tid(naar)}) — publicér den enkeltvis i stedet`
        : `dato er under 10 minutter ude (${tid(naar)}) — under Metas minimum`]);
      continue;
    }
    if (om > MAX_SEK) {
      sprunget.push([nr, `dato er ${Math.round(om / 86400)} dage ude — over Metas maksimum paa 30 dage`]);
      continue;
    }
    valgt.push({ e, naar, om });
  }
  return { valgt, sprunget };
}

async function planlaeg({ toerloeb = true } = {}) {
  const nu = Math.floor(Date.now() / 1000);
  const { valgt, sprunget } = udvaelg(nu);

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive planlagt.\n'
    : 'PLANLAEGGER hos Meta. Opslagene offentliggoeres af Meta paa hver sin dato.\n');

  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  if (!valgt.length) {
    console.log('Intet at planlaegge.');
    return [];
  }

  console.log('── planlaegges ──');
  for (const { e, naar, om } of valgt) {
    console.log(`  element ${String(e.element).padStart(2)}  ${tid(naar)}  (om ${Math.round(om / 86400)} dage)  «${e.titel}»`);
  }
  console.log('');

  const sideId = process.env.FB_PAGE_ID;
  const resultater = [];

  if (toerloeb) {
    for (const { e, naar } of valgt) {
      const { sti, body } = byggPayload({ ...e, side_id: sideId });
      console.log(`── element ${e.element} → ${sti} ──`);
      console.log(JSON.stringify({ ...body, published: false, scheduled_publish_time: naar }, null, 2));
      resultater.push({ element: e.element, versionslaas: e.versionslaas, toerloeb: true, planlagt_til: naar });
    }
    return resultater;
  }

  if (!sideId) throw new Error('FB_PAGE_ID mangler i miljoeet.');
  const brugertoken = process.env.FB_PAGE_TOKEN;
  if (!brugertoken) throw new Error('FB_PAGE_TOKEN mangler i miljoeet.');
  // Samme veksling som ved direkte publicering: side-tokenet hentes pr. koersel
  // og opbevares aldrig.
  const sidetoken = await hentSidetoken(sideId, brugertoken);

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
      post.fejl = String(err.message).slice(0, 500);
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
  const ok = ægte.filter((r) => r.status === 'PLANLAGT').length;
  console.log(`${ægte.length} post(er) skrevet i registret — ${ok} planlagt, ${ægte.length - ok} fejlet.`);
  return ægte.length - ok;
}

/** Doemmer uden at skrive. Skal koere EFTER at registret er committet. */
function statusKun(fil) {
  const ægte = laesResultat(fil);
  if (ægte === null) return 1;
  const fejlede = ægte.filter((r) => r.status !== 'PLANLAGT');
  if (fejlede.length) {
    for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''}`);
    return fejlede.length;
  }
  console.log(`Alle ${ægte.length} element(er) staar som PLANLAGT i registret.`);
  return 0;
}

const args = process.argv.slice(2);
if (args[0] === '--skriv-register') {
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
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
}

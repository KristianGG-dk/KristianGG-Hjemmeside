// Publicerer godkendte Instagram-elementer, hvis tidspunkt er naaet.
//
// HVORFOR DEN SER ANDERLEDES UD END FACEBOOK
// Facebook kan holde et opslag for os: vi afleverer det med
// scheduled_publish_time, og Meta udgiver det paa dagen. Det kan Instagram
// ikke. Metas Content Publishing har intet scheduled_publish_time, og en
// mediecontainer udloeber efter 24 timer med status EXPIRED. Derfor kan
// containere ikke oprettes i forvejen, og derfor er det motoren selv, der
// vaagner paa tidspunktet og publicerer med det samme.
//
// Publicering er to trin plus ventetid:
//   1. POST /{ig-user-id}/media          opret container
//   2. GET  /{container-id}?status_code  vent til FINISHED
//   3. POST /{ig-user-id}/media_publish  udgiv
//
// GODKENDELSEN ER ABSOLUT
// Scriptet laeser det godkendte materiale og sender det ordret. Det omskriver
// aldrig tekst, vaelger aldrig et andet billede, aendrer aldrig hashtags, CTA,
// kanal eller tidspunkt - hverken ved fejl eller for at faa noget igennem.
// Holder laasen eller teksthashen ikke, publiceres der ikke.
//
// VED FEJL STOPPER DEN
// Ingen automatiske gentagne forsoeg. Lykkedes containeren, men fejlede
// udgivelsen, gemmes container-id'et i registret, saa et menneske kan se efter
// hos Meta, FOER der proeves igen. Ellers risikerer vi to opslag.
//
// Toerloeb er standard. Der sendes kun med --publicer.
//
//   IG_USER_ID         Instagram Business Account-id
//   IG_ACCESS_TOKEN    system user-token med Instagram-adgang
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, sha256 } from './laas.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LAASE = 'publicering/laase';
const REGISTER = 'publicering/register.json';

// Ventetid paa at containeren bliver klar. Meta behandler asynkront.
const POLL_FORSOEG = 20;
const POLL_PAUSE_MS = 3000;

/** Statusser der betyder "roer ikke elementet igen". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT'];

let sidetoken = null; // findes ikke paa dette spor, men holdes for skrub()

/** Fjerner alt der ligner en hemmelighed, foer noget logges eller gemmes. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [process.env.IG_ACCESS_TOKEN, sidetoken].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(access_token"?\s*[:=]\s*"?)[^&\s",}]+/gi, '$1«udeladt»');
}

const laesRegister = () =>
  existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : [];

const tid = (sek) => new Date(sek * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bygger det, der sendes. Intet sammensaettes - alt kommer fra laasen. */
export function byggContainer(e) {
  const body = { image_url: e.billede_url, caption: e.tekst };
  // Alt-teksten er et laast felt og foelger med, hvor API'et tager imod den.
  if (e.alt_tekst) body.alt_text = e.alt_tekst;
  return body;
}

async function graf(sti, body) {
  const r = await fetch(`${GRAPH}/${sti}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: process.env.IG_ACCESS_TOKEN }),
  });
  const svar = await r.json();
  if (!r.ok || svar.error) {
    const e = svar.error ?? {};
    throw new Error(`${sti} → ${r.status} ${skrub(e.message ?? 'ukendt fejl')}` +
      (e.code ? ` (code ${e.code})` : ''));
  }
  return svar;
}

async function containerStatus(id) {
  const u = new URL(`${GRAPH}/${id}`);
  u.searchParams.set('fields', 'status_code');
  u.searchParams.set('access_token', process.env.IG_ACCESS_TOKEN);
  const r = await fetch(u, { method: 'GET' });
  const svar = await r.json();
  if (svar.error) throw new Error(skrub(svar.error.message));
  return svar.status_code;
}

/** Samler de elementer der er forfaldne, og forklarer hvert fravalg. */
function udvaelg(nu) {
  const reg = laesRegister();
  const valgt = [], sprunget = [];

  for (const f of readdirSync(LAASE).filter((x) => x.endsWith('.json')).sort()) {
    const e = JSON.parse(readFileSync(join(LAASE, f), 'utf8'));
    const nr = e.element;
    if (e.kanal !== 'instagram') { sprunget.push([nr, `kanal er ${e.kanal}, ikke instagram`]); continue; }

    const post = [...reg].reverse().find((x) => x.element === nr && AFSENDT.includes(x.status));
    if (post) { sprunget.push([nr, `staar som ${post.status} i registret`]); continue; }

    // En tidligere fejl er en spaerre, ikke en invitation til at proeve igen.
    const sidste = [...reg].reverse().find((x) => x.element === nr);
    if (sidste && sidste.status === 'PUBLICERING FEJLET') {
      sprunget.push([nr, 'seneste forsoeg fejlede — kraever menneskelig stillingtagen foer nyt forsoeg']);
      continue;
    }

    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
      if (!e.billede_url) throw new Error('ingen billede_url i laasen');
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    const naar = Math.floor(new Date(e.dato).getTime() / 1000);
    if (Number.isNaN(naar)) { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }
    if (naar > nu) { sprunget.push([nr, `forfalder foerst ${tid(naar)}`]); continue; }

    valgt.push({ e, naar });
  }
  return { valgt, sprunget };
}

async function publicerEt(e) {
  const igId = process.env.IG_USER_ID;
  const body = byggContainer(e);
  const post = {
    element: e.element, kanal: 'instagram', versionslaas: e.versionslaas,
    status: 'PUBLICERING FEJLET', post_id: null, container_id: null,
    tidspunkt: new Date().toISOString(),
  };

  // 1. Container
  let container;
  try {
    container = await graf(`${igId}/media`, body);
    post.container_id = container.id;
  } catch (err) {
    post.fejl = skrub(err.message).slice(0, 500);
    console.log(`  FEJL  element ${e.element}: container ikke oprettet — ${post.fejl}`);
    return post;
  }

  // 2. Vent til den er klar
  try {
    for (let i = 0; i < POLL_FORSOEG; i++) {
      const s = await containerStatus(container.id);
      if (s === 'FINISHED') break;
      if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`containeren fik status ${s}`);
      if (i === POLL_FORSOEG - 1) throw new Error(`containeren blev ikke klar (sidst: ${s})`);
      await pause(POLL_PAUSE_MS);
    }
  } catch (err) {
    post.fejl = skrub(err.message).slice(0, 500);
    console.log(`  FEJL  element ${e.element}: ${post.fejl}`);
    return post;
  }

  // 3. Udgiv. Fejler dette, er udfaldet uvist - derfor ingen nye forsoeg.
  try {
    const ud = await graf(`${igId}/media_publish`, { creation_id: container.id });
    post.status = 'PUBLICERET';
    post.post_id = ud.id;
    console.log(`  OK    element ${e.element} publiceret (${post.post_id})`);
  } catch (err) {
    post.fejl = skrub(err.message).slice(0, 500);
    post.noter = 'Containeren blev oprettet, men udgivelsen fejlede. Udfaldet er uvist. '
               + 'Se efter paa Instagram FOER et nyt forsoeg — ellers risikeres to opslag.';
    console.log(`  FEJL  element ${e.element}: udgivelse fejlede — ${post.fejl}`);
    console.log('        containeren blev oprettet. Se efter paa Instagram foer nyt forsoeg.');
  }
  return post;
}

async function koer({ toerloeb = true } = {}) {
  const nu = Math.floor(Date.now() / 1000);
  const { valgt, sprunget } = udvaelg(nu);

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive publiceret.\n'
    : 'PUBLICERER paa Instagram. Kun godkendt materiale, ordret som laast.\n');

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

  if (toerloeb) {
    return valgt.map(({ e, naar }) => {
      const body = byggContainer(e);
      console.log(`── element ${e.element} → {ig-user-id}/media ──`);
      console.log(JSON.stringify(body, null, 2));
      return { element: e.element, versionslaas: e.versionslaas, toerloeb: true, forfaldt: naar };
    });
  }

  if (!process.env.IG_USER_ID) throw new Error('IG_USER_ID mangler i miljoeet.');
  if (!process.env.IG_ACCESS_TOKEN) throw new Error('IG_ACCESS_TOKEN mangler i miljoeet.');

  const resultater = [];
  for (const { e } of valgt) resultater.push(await publicerEt(e));
  return resultater;
}

/** Foejer resultaterne til registret. Separat trin, saa publicering kan koere uden skriveadgang. */
function skrivRegister(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil — publiceringen naaede aldrig at svare.'); return 1; }
  const ægte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  if (!ægte.length) { console.log('Toerloeb eller intet forfaldent — intet registreres.'); return 0; }
  const reg = laesRegister();
  reg.push(...ægte);
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2) + '\n');
  const ok = ægte.filter((r) => r.status === 'PUBLICERET').length;
  console.log(`${ægte.length} post(er) skrevet i registret — ${ok} publiceret, ${ægte.length - ok} fejlet.`);
  return ægte.length - ok;
}

/** Doemmer uden at skrive. Koeres EFTER registret er committet. */
function statusKun(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil.'); return 1; }
  const ægte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  const fejlede = ægte.filter((r) => r.status !== 'PUBLICERET');
  if (fejlede.length) {
    for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''} ${r.noter ?? ''}`);
    return fejlede.length;
  }
  console.log(ægte.length ? `Alle ${ægte.length} element(er) publiceret.` : 'Intet at doemme.');
  return 0;
}

const args = process.argv.slice(2);
if (args[0] === '--skriv-register') {
  process.exit(skrivRegister(args[1]) > 0 ? 1 : 0);
} else if (args[0] === '--status-kun') {
  process.exit(statusKun(args[1]) > 0 ? 1 : 0);
} else {
  koer({ toerloeb: !args.includes('--publicer') })
    .then((r) => {
      writeFileSync('resultat-instagram.json', JSON.stringify(r, null, 2) + '\n');
      const fejlede = r.filter((x) => x.status === 'PUBLICERING FEJLET').length;
      console.log(fejlede ? `\n${fejlede} element(er) fejlede.` : '\nFaerdig.');
      process.exit(fejlede > 0 ? 1 : 0);
    })
    .catch((err) => { console.error('FEJL:', skrub(err.message)); process.exit(1); });
}

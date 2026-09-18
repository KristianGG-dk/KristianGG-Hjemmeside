// Ikke-publicerende kontrol af Instagram-adgangen.
//
// Svarer paa fire spoergsmaal uden at roere en eneste byte paa Instagram:
//   1. Kan IG_USER_ID overhovedet tilgaas med tokenet?
//   2. Hvilken konto er det — username og id?
//   3. Hvad er tokenet for et, og hvornaar udloeber det?
//   4. Hvilke scopes baerer det faktisk, og raekker de til publicering senere?
//
// Der sendes UDELUKKENDE GET. Scriptet indeholder ingen POST, PUT eller DELETE,
// og oprettter hverken mediecontainere eller opslag. Bemaerk saerligt:
// /{ig-user-id}/media er et LISTE-endpoint naar det kaldes med GET - det er
// foerst POST til samme sti, der opretter en container. Vi kalder kun GET.
//
// Kraever i miljoeet:
//   IG_USER_ID         Instagram Business Account-id
//   IG_ACCESS_TOKEN    system user-token med Instagram-adgang
//
// Tokenet skrives ALDRIG ud - hverken i log, fejlbesked eller fil. Alle
// URL'er og svar skrubbes foer de logges. Der gemmes ingen raa Meta-svar.

const GRAPH = 'https://graph.facebook.com/v21.0';

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;

let fejl = 0;
let advarsler = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
const advar = (m) => { console.log(`  OBS   ${m}`); advarsler++; };
const info = (m) => console.log(`  ·     ${m}`);

/** Fjerner alt der ligner et token fra en tekst, foer den logges. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [TOKEN].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t
    .replace(/(access_token"?\s*[:=]\s*"?)[^&\s",}]+/gi, '$1«udeladt»')
    .replace(/(input_token=)[^&\s"']+/gi, '$1«udeladt»');
}

/** GET mod Graph. Der findes ingen skrivefunktion i dette script. */
async function hent(sti, params = {}) {
  const u = new URL(`${GRAPH}/${sti}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOKEN);
  let r, svar;
  try {
    r = await fetch(u, { method: 'GET' });
    svar = await r.json();
  } catch (err) {
    throw new Error(`netvaerksfejl mod ${sti}: ${skrub(err.message)}`);
  }
  if (!r.ok || svar.error) {
    const e = svar.error ?? {};
    // Kun Metas egen besked og koder gengives - aldrig hele svaret raat.
    throw new Error(
      `${sti} → ${r.status} ${skrub(e.message ?? 'ukendt fejl')}` +
      (e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '')
    );
  }
  return svar;
}

function tid(sekunder) {
  if (sekunder === 0 || sekunder === undefined || sekunder === null) return 'udloeber aldrig';
  const d = new Date(sekunder * 1000);
  const dage = Math.round((d - Date.now()) / 86400000);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC (om ca. ${dage} dage)`;
}

// To navnefamilier er i omloeb. Kilderne er uenige om hvilken der gaelder
// Facebook Login-sporet, saa vi spoerger tokenet i stedet for at gaette.
const FAMILIER = [
  { navn: 'nyere (instagram_business_*)', laes: 'instagram_business_basic',   skriv: 'instagram_business_content_publish' },
  { navn: 'aeldre (instagram_*)',         laes: 'instagram_basic',            skriv: 'instagram_content_publish' },
];
const STOETTE = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management'];

async function main() {
  const mangler = ['IG_USER_ID', 'IG_ACCESS_TOKEN'].filter((k) => !process.env[k]);
  if (mangler.length) {
    console.error(`Mangler i miljoeet: ${mangler.join(', ')}. Kontrol ikke mulig.`);
    process.exit(1);
  }
  console.log('Kontrollerer Instagram-adgang. Kun GET — intet oprettes, aendres eller slettes.');
  console.log(`Graph API ${GRAPH.split('/').pop()}. Tokenets laengde: ${TOKEN.length} tegn. Vaerdien logges ikke.\n`);

  // 1-2. Kan kontoen tilgaas, og hvilken er det
  console.log('── kontoen ──');
  let konto = null;
  try {
    konto = await hent(IG_USER_ID, { fields: 'id,username' });
    konto.id === IG_USER_ID
      ? ok('IG_USER_ID kan tilgaas med tokenet, og id stemmer')
      : nej(`id i svaret matcher ikke IG_USER_ID`);
    konto.username
      ? ok(`username: @${konto.username}`)
      : advar('ingen username i svaret — feltet kraever laeserettigheden');
  } catch (err) {
    nej(err.message);
  }

  // 3-4. Tokenets type, udloeb og faktiske scopes
  console.log('\n── tokenet ──');
  let scopes = [];
  try {
    // debug_token inspiceres med tokenet selv. Uden app-hemmelighed er
    // svaret mere sparsomt, men scopes og udloeb er med.
    const u = new URL(`${GRAPH}/debug_token`);
    u.searchParams.set('input_token', TOKEN);
    u.searchParams.set('access_token', TOKEN);
    const r = await fetch(u, { method: 'GET' });
    const svar = await r.json();
    if (svar.error) throw new Error(skrub(svar.error.message));
    const d = svar.data ?? {};

    d.type ? ok(`type: ${d.type}`) : advar('ingen type oplyst');
    d.is_valid ? ok('tokenet er gyldigt') : nej('tokenet er IKKE gyldigt');
    info(`udloeb: ${tid(d.expires_at)}`);
    if (d.data_access_expires_at !== undefined) {
      info(`dataadgang udloeber: ${tid(d.data_access_expires_at)}`);
    }
    scopes = d.scopes ?? [];
    info(`scopes: ${scopes.join(', ') || '(ingen oplyst)'}`);
  } catch (err) {
    nej(`kunne ikke inspicere tokenet: ${err.message}`);
  }

  // Hvilken navnefamilie baerer tokenet
  console.log('\n── rettigheder ──');
  let laeseScope = null, skriveScope = null;
  for (const f of FAMILIER) {
    const harLaes = scopes.includes(f.laes);
    const harSkriv = scopes.includes(f.skriv);
    if (harLaes || harSkriv) {
      info(`familie i brug: ${f.navn}`);
      if (harLaes) { ok(`laeserettighed ${f.laes}`); laeseScope = f.laes; }
      if (harSkriv) { ok(`publiceringsrettighed ${f.skriv}`); skriveScope = f.skriv; }
    }
  }
  if (!laeseScope && !skriveScope) {
    advar('ingen af de kendte Instagram-scopes staar paa tokenet');
    advar(`ledte efter: ${FAMILIER.flatMap((f) => [f.laes, f.skriv]).join(', ')}`);
  }
  for (const s of STOETTE) {
    info(`${s}: ${scopes.includes(s) ? 'til stede' : 'ikke til stede'}`);
  }

  // 5. Reel laeseadgang. GET mod /media LISTER medier - det opretter intet.
  console.log('\n── laeseadgang ──');
  try {
    const medier = await hent(`${IG_USER_ID}/media`, { limit: '1', fields: 'id,media_type,timestamp' });
    const n = (medier.data ?? []).length;
    ok(`kan laese kontoens medier (${n === 0 ? 'kontoen har ingen opslag endnu' : 'hentede 1 opslag'})`);
  } catch (err) {
    nej(err.message);
  }

  // Dom
  console.log('\n── sammenfatning ──');
  const laeseklar = fejl === 0;
  console.log(`  laeseadgang virker:        ${laeseklar ? 'JA' : 'NEJ'}`);
  console.log(`  klar til publicering:      ${skriveScope ? 'JA — ' + skriveScope : 'NEJ — publiceringsrettighed mangler'}`);
  if (!skriveScope) {
    console.log('  (publicering bygges foerst i en senere opgave og kraever den rettighed)');
  }

  console.log(fejl === 0
    ? `\nKONTROL: LAESEADGANG BESTAAET${advarsler ? ` — ${advarsler} ting at bemaerke` : ''}`
    : `\nKONTROL: ${fejl} FEJL — se ovenfor`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('UVENTET FEJL:', skrub(err.message));
  process.exit(1);
});

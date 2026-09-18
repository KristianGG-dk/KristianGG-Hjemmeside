// Én samlet, ikke-publicerende kontrol af Instagram-adgangen.
//
// Formaalet er at afgoere ÉN gang, om motorens Instagram-kanal kan bygges paa
// den adgang vi har - uden en kaede af testkoersler og uden et testopslag.
//
// Der sendes UDELUKKENDE GET. Scriptet indeholder ingen POST, PUT eller
// DELETE. Bemaerk saerligt:
//   /{ig-user-id}/media               GET lister medier. POST ville oprette en
//                                     container - det goer vi ikke.
//   /{ig-user-id}/content_publishing_limit
//                                     GET aflaeser kvoten. Metas egen
//                                     dokumentation kalder det en pre-flight-
//                                     kontrol. Den oprettter intet.
//
// Kraever i miljoeet:
//   IG_USER_ID         Instagram Business Account-id
//   IG_ACCESS_TOKEN    system user-token med Instagram-adgang
// Valgfrit, men giver en fyldigere og skarpere kontrol:
//   FB_PAGE_ID         bekraefter at IG-kontoen haenger paa vores side
//   FB_APP_ID, FB_APP_SECRET   giver granulaere scopes med target_ids
//
// Hemmeligheder skrives ALDRIG ud - hverken i log, fejlbesked eller fil. Alle
// URL'er og svar skrubbes, og der gemmes ingen raa Meta-svar: kun Metas egen
// besked og fejlkode gengives.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GRAPH = 'https://graph.facebook.com/v21.0';

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;

let fejl = 0;
let obs = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
const advar = (m) => { console.log(`  OBS   ${m}`); obs++; };
const info = (m) => console.log(`  ·     ${m}`);

/** Fjerner alt der ligner en hemmelighed fra en tekst, foer den logges. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [TOKEN, APP_SECRET].filter(Boolean)) {
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

// To navnefamilier er i omloeb, og kilderne er uenige om hvilken der gaelder
// Facebook Login-sporet. Vi spoerger tokenet i stedet for at gaette.
const FAMILIER = [
  { navn: 'nyere (instagram_business_*)', laes: 'instagram_business_basic', skriv: 'instagram_business_content_publish' },
  { navn: 'aeldre (instagram_*)',         laes: 'instagram_basic',          skriv: 'instagram_content_publish' },
];
const STOETTE = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management'];

/** Foerste billed-URL fra en eksisterende laasefil - det motoren faktisk sender. */
function repraesentativBilledeUrl() {
  try {
    for (const f of readdirSync('publicering/laase').filter((x) => x.endsWith('.json')).sort()) {
      const e = JSON.parse(readFileSync(join('publicering/laase', f), 'utf8'));
      if (e.billede_url) return { url: e.billede_url, kilde: f };
    }
  } catch { /* laesefejl haandteres af kalderen */ }
  return null;
}

async function main() {
  const mangler = ['IG_USER_ID', 'IG_ACCESS_TOKEN'].filter((k) => !process.env[k]);
  if (mangler.length) {
    console.error(`Mangler i miljoeet: ${mangler.join(', ')}. Kontrol ikke mulig.`);
    process.exit(1);
  }
  console.log('Samlet Instagram-kontrol. Kun GET — intet oprettes, aendres eller slettes.');
  console.log(`Graph API ${GRAPH.split('/').pop()}. Tokenets laengde: ${TOKEN.length} tegn. Vaerdien logges ikke.\n`);

  // ── 1. kontoen ──
  console.log('── kontoen ──');
  let konto = null;
  try {
    konto = await hent(IG_USER_ID, { fields: 'id,username' });
    konto.id === IG_USER_ID
      ? ok('IG_USER_ID kan tilgaas med tokenet, og id stemmer')
      : nej('id i svaret matcher ikke IG_USER_ID');
    konto.username ? ok(`username: @${konto.username}`) : advar('ingen username i svaret');
  } catch (err) {
    nej(err.message);
  }
  // Kontotype oplyses ikke altid paa dette spor. Vi proever og tolererer nej.
  try {
    const t = await hent(IG_USER_ID, { fields: 'account_type' });
    t.account_type ? ok(`kontotype: ${t.account_type}`) : info('kontotype ikke oplyst paa dette spor');
  } catch {
    info('kontotype ikke tilgaengelig paa dette spor — ikke en fejl');
  }

  // ── 2. forbindelsen ──
  console.log('\n── forbindelsen side ↔ Instagram ──');
  if (!FB_PAGE_ID) {
    advar('FB_PAGE_ID ikke i miljoeet — kan ikke bekraefte at kontoen haenger paa vores side');
  } else {
    try {
      const side = await hent(FB_PAGE_ID, { fields: 'name,instagram_business_account' });
      const knyttet = side.instagram_business_account?.id;
      ok(`siden hedder «${side.name}»`);
      if (!knyttet) {
        nej('siden har ingen tilknyttet Instagram-konto');
      } else if (knyttet === IG_USER_ID) {
        ok('siden er knyttet til NETOP denne Instagram-konto');
      } else {
        nej('siden er knyttet til en ANDEN Instagram-konto end IG_USER_ID');
      }
    } catch (err) {
      advar(`kunne ikke aflaese siden: ${err.message}`);
    }
  }

  // ── 3. tokenet ──
  console.log('\n── tokenet ──');
  let scopes = [], gran = [];
  try {
    // Med app-hemmelighed som inspektoer faar vi granulaere scopes med.
    const inspektoer = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : TOKEN;
    info(APP_ID && APP_SECRET ? 'inspiceret med app-legitimation — granulaere scopes tilgaengelige'
                              : 'inspiceret med tokenet selv — granulaere scopes kan mangle');
    const u = new URL(`${GRAPH}/debug_token`);
    u.searchParams.set('input_token', TOKEN);
    u.searchParams.set('access_token', inspektoer);
    const r = await fetch(u, { method: 'GET' });
    const svar = await r.json();
    if (svar.error) throw new Error(skrub(svar.error.message));
    const d = svar.data ?? {};
    d.type ? ok(`type: ${d.type}`) : advar('ingen type oplyst');
    d.is_valid ? ok('tokenet er gyldigt') : nej('tokenet er IKKE gyldigt');
    info(`udloeb: ${tid(d.expires_at)}`);
    if (d.data_access_expires_at !== undefined) info(`dataadgang udloeber: ${tid(d.data_access_expires_at)}`);
    scopes = d.scopes ?? [];
    gran = d.granular_scopes ?? [];
    info(`scopes: ${scopes.join(', ') || '(ingen oplyst)'}`);
  } catch (err) {
    nej(`kunne ikke inspicere tokenet: ${err.message}`);
  }

  // ── 4. rettighederne ──
  console.log('\n── rettighederne ──');
  let laeseScope = null, skriveScope = null, skrivGaelderKontoen = null;
  for (const f of FAMILIER) {
    if (scopes.includes(f.laes)) { ok(`laeserettighed ${f.laes}  (${f.navn})`); laeseScope = f.laes; }
    if (scopes.includes(f.skriv)) { ok(`publiceringsrettighed ${f.skriv}  (${f.navn})`); skriveScope = f.skriv; }
  }
  if (!laeseScope && !skriveScope) {
    advar('ingen af de kendte Instagram-scopes staar paa tokenet');
    advar(`ledte efter: ${FAMILIER.flatMap((f) => [f.laes, f.skriv]).join(', ')}`);
  }
  // Gaelder publiceringsrettigheden NETOP denne konto?
  if (skriveScope) {
    const g = gran.find((x) => x.scope === skriveScope);
    if (!g) {
      info(`${skriveScope}: ingen granulaer oplysning — kan ikke afgoere maalet herfra`);
    } else if (!g.target_ids) {
      ok(`${skriveScope} gaelder alle aktiver`); skrivGaelderKontoen = true;
    } else if (g.target_ids.includes(IG_USER_ID)) {
      ok(`${skriveScope} gaelder NETOP denne konto`); skrivGaelderKontoen = true;
    } else {
      nej(`${skriveScope} gaelder IKKE denne konto — kun andre aktiver`); skrivGaelderKontoen = false;
    }
  }
  for (const s of STOETTE) info(`${s}: ${scopes.includes(s) ? 'til stede' : 'ikke til stede'}`);

  // ── 5. laeseadgang ──
  console.log('\n── laeseadgang ──');
  try {
    const medier = await hent(`${IG_USER_ID}/media`, { limit: '1', fields: 'id,media_type,timestamp' });
    const n = (medier.data ?? []).length;
    ok(`kan laese kontoens medier (${n === 0 ? 'kontoen har ingen opslag endnu' : 'hentede 1 opslag'})`);
  } catch (err) {
    nej(err.message);
  }

  // ── 6. publiceringsforudsaetninger ──
  console.log('\n── publiceringsforudsaetninger ──');
  let kvoteLaest = false;
  try {
    const k = await hent(`${IG_USER_ID}/content_publishing_limit`, { fields: 'config,quota_usage' });
    const d = (k.data ?? [])[0] ?? {};
    kvoteLaest = true;
    ok('kvoten kan aflaeses — kontoen er et gyldigt publiceringsmaal');
    if (d.quota_usage !== undefined) info(`forbrugt i doegnet: ${d.quota_usage}`);
    if (d.config) info(`graense: ${d.config.quota_total ?? '?'} pr. ${d.config.quota_duration ?? '?'} sek.`);
  } catch (err) {
    nej(`kvoten kan ikke aflaeses: ${err.message}`);
  }

  // ── 7. billedet ──
  console.log('\n── billedet ──');
  // Instagram henter billedet serverside fra vores URL. Kan vi ikke hente det,
  // kan Meta heller ikke. At vi KAN, er staerk indikation - ikke bevis.
  let billedeOk = false;
  const b = repraesentativBilledeUrl();
  if (!b) {
    advar('ingen laasefil med billede_url at proeve med');
  } else {
    try {
      const r = await fetch(b.url, { method: 'GET' });
      const ct = r.headers.get('content-type') ?? '';
      if (r.ok && ct.startsWith('image/')) {
        billedeOk = true;
        ok(`billedet er offentligt hentbart (${r.status}, ${ct}) — kilde ${b.kilde}`);
      } else {
        nej(`billedet svarer ${r.status} ${ct || 'uden content-type'} — Meta ville heller ikke kunne hente det`);
      }
    } catch (err) {
      nej(`billedet kan ikke hentes: ${skrub(err.message)}`);
    }
  }

  // ── dom ──
  console.log('\n── dom ──');
  const laeseklar = fejl === 0;
  const publiceringsklar = Boolean(skriveScope) && skrivGaelderKontoen !== false && kvoteLaest && billedeOk;
  console.log(`  laeseadgang virker:                 ${laeseklar ? 'JA' : 'NEJ'}`);
  console.log(`  publiceringsrettighed paa tokenet:  ${skriveScope ? 'JA — ' + skriveScope : 'NEJ'}`);
  console.log(`  kvoten kan aflaeses:                ${kvoteLaest ? 'JA' : 'NEJ'}`);
  console.log(`  billedet kan hentes udefra:         ${billedeOk ? 'JA' : 'NEJ'}`);
  console.log(`  klar til at bygge publicering:      ${publiceringsklar ? 'JA' : 'NEJ'}`);
  console.log('');
  console.log('  Bemaerk: det sidste led kan kun bevises af den foerste rigtige,');
  console.log('  godkendte publicering — at containeren naar FINISHED, at Meta kan');
  console.log('  hente og validere billedet, og at media_publish accepteres.');

  console.log(fejl === 0
    ? `\nKONTROL: BESTAAET${obs ? ` — ${obs} ting at bemaerke` : ''}`
    : `\nKONTROL: ${fejl} FEJL — se ovenfor`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('UVENTET FEJL:', skrub(err.message));
  process.exit(1);
});

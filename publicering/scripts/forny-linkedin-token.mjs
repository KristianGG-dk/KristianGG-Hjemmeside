// Bytter en LinkedIn-autorisationskode til et access token og gemmer det.
//
// KOERER UDELUKKENDE I GITHUB ACTIONS. Client Secret ligger i Actions
// Secrets og roerer aldrig en browser eller en privat maskine.
//
// Rejsen:
//   LI_AUTH_CODE  ->  token  ->  hvem tilhoerer det?  ->  gem i LI_ACCESS_TOKEN
//
// FAIL CLOSED. Fejler ét trin, skrives der ingen hemmelighed, og kørslen
// stopper med fejl. Der publiceres aldrig noget herfra — scriptet roerer
// hverken koe, laase eller opslag.
//
// Kraeves i miljoeet:
//   LI_AUTH_CODE      koden fra callbacken, indsat af Kristian i browseren
//   LI_CLIENT_ID      offentlig
//   LI_CLIENT_SECRET  hemmelig, kun her
//   LI_TILLADT_URN    den ENESTE identitet der accepteres
//   GH_SECRETS_PAT    fine-grained PAT, dette ene repo, kun Secrets: write
//   GITHUB_REPOSITORY saettes af Actions

import { bevisEjer, DestinationAfvist } from './publicer-linkedin.mjs';

const TOKEN_ENDEPUNKT = 'https://www.linkedin.com/oauth/v2/accessToken';
const REDIRECT_URI = 'https://kristiangg.dk/oauth/linkedin/callback/';
const GH = 'https://api.github.com';
const OPBRUGT = 'opbrugt';

const env = process.env;
const noedvendig = (navn) => {
  const v = (env[navn] ?? '').trim();
  if (!v) throw new Error(`${navn} mangler. Fornyelsen stoppes.`);
  return v;
};

/** Skjuler en vaerdi for resten af koerslen. Actions maskerer den i al log. */
const maskér = (v) => { if (v) console.log(`::add-mask::${v}`); return v; };

/** Fjerner hemmeligheder fra en tekst, foer den logges. */
function skrub(s) {
  let t = String(s);
  for (const h of [env.LI_CLIENT_SECRET, env.GH_SECRETS_PAT, env.LI_AUTH_CODE].filter(Boolean)) {
    t = t.split(h).join('«udeladt»');
  }
  return t.replace(/("(?:access|refresh)_token"\s*:\s*")[^"]+/g, '$1«udeladt»');
}

// ── GitHub Secrets ──────────────────────────────────────────────────────────
// En hemmelighed skrives som en forseglet kasse mod repoets offentlige
// noegle. GitHub kan aabne den; ingen andre kan, heller ikke i transit.

async function ghKald(sti, valg = {}) {
  const r = await fetch(`${GH}/repos/${noedvendig('GITHUB_REPOSITORY')}${sti}`, {
    ...valg,
    headers: {
      Authorization: `Bearer ${noedvendig('GH_SECRETS_PAT')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(valg.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${sti} → ${r.status} ${skrub(await r.text())}`);
  return r.status === 204 ? null : r.json();
}

async function skrivHemmelighed(navn, vaerdi) {
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const noegle = await ghKald('/actions/secrets/public-key');
  const forseglet = sodium.crypto_box_seal(
    sodium.from_string(vaerdi),
    sodium.from_base64(noegle.key, sodium.base64_variants.ORIGINAL)
  );
  await ghKald(`/actions/secrets/${navn}`, {
    method: 'PUT',
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(forseglet, sodium.base64_variants.ORIGINAL),
      key_id: noegle.key_id,
    }),
  });
  console.log(`  gemt: ${navn}`);
}

// ── Selve fornyelsen ────────────────────────────────────────────────────────

export async function byt(hent = fetch) {
  const kode = noedvendig('LI_AUTH_CODE');
  if (kode === OPBRUGT) {
    throw new Error(
      'LI_AUTH_CODE er allerede brugt. Hent en ny kode paa ' +
      'https://kristiangg.dk/oauth/linkedin/ og indsaet den foerst.'
    );
  }
  maskér(kode);

  const r = await hent(TOKEN_ENDEPUNKT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: kode,
      redirect_uri: REDIRECT_URI,
      client_id: noedvendig('LI_CLIENT_ID'),
      client_secret: noedvendig('LI_CLIENT_SECRET'),
    }),
  });
  const svar = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LinkedIn afviste byttet: ${r.status} ${skrub(JSON.stringify(svar))}`);
  if (!svar.access_token) throw new Error(`Intet access_token i svaret: ${skrub(JSON.stringify(svar))}`);

  maskér(svar.access_token);
  maskér(svar.refresh_token);
  return svar;
}

/** Hvad LinkedIn FAKTISK returnerede. Ingen antagelser om fornyelse. */
export function beskrivSvar(svar) {
  const sek = Number(svar.expires_in) || 0;
  return {
    udloeber: new Date(Date.now() + sek * 1000).toISOString(),
    levetid_dage: Math.round(sek / 86400),
    scope: svar.scope ?? null,
    har_refresh_token: Boolean(svar.refresh_token),
    refresh_levetid_dage: svar.refresh_token_expires_in
      ? Math.round(Number(svar.refresh_token_expires_in) / 86400) : null,
  };
}

async function main() {
  console.log('\nFornyelse af LinkedIn-token. Der publiceres ikke noget.\n');

  const svar = await byt();
  const fakta = beskrivSvar(svar);
  console.log('── HVAD LINKEDIN SVAREDE ──');
  console.log(`  levetid        ${fakta.levetid_dage} dage (udloeber ${fakta.udloeber.slice(0, 10)})`);
  console.log(`  scope          ${fakta.scope ?? '(ikke oplyst)'}`);
  console.log(`  refresh_token  ${fakta.har_refresh_token ? `JA — varer ${fakta.refresh_levetid_dage} dage` : 'NEJ'}`);
  console.log(fakta.har_refresh_token
    ? '\n  → Appen HAR programmatisk fornyelse. Automatisk fornyelse kan bygges.'
    : '\n  → Appen har IKKE programmatisk fornyelse. Fornyelsen forbliver manuel,\n'
      + '    og vagthunden varsler inden udloeb.');

  // ── Identiteten afgoer alt. Foerst herefter skrives noget som helst. ──
  const tilladt = noedvendig('LI_TILLADT_URN');
  if (!tilladt.startsWith('urn:li:person:')) {
    throw new DestinationAfvist(
      `LI_TILLADT_URN er ikke en personprofil: "${tilladt}". ` +
      'Kun urn:li:person: accepteres. En organisationsside maa aldrig vaere maal.'
    );
  }
  const ejer = await bevisEjer(svar.access_token, tilladt);
  console.log(`\n── IDENTITET BEKRAEFTET ──\n  ${ejer.urn}${ejer.navn ? ` (${ejer.navn})` : ''}`);

  // ── Foerst nu gemmes noget ──
  console.log('\n── GEMMER ──');
  await skrivHemmelighed('LI_ACCESS_TOKEN', svar.access_token);
  await skrivHemmelighed('LI_PERSON_URN', ejer.urn);
  if (svar.refresh_token) await skrivHemmelighed('LI_REFRESH_TOKEN', svar.refresh_token);
  await skrivHemmelighed('LI_AUTH_CODE', OPBRUGT);

  // Metadata uden hemmeligheder, saa vagthunden kan varsle om udloeb.
  const { writeFileSync } = await import('node:fs');
  writeFileSync('publicering/linkedin-token.json', JSON.stringify({
    urn: ejer.urn,
    fornyet: new Date().toISOString(),
    ...fakta,
  }, null, 2) + '\n');
  console.log('  skrevet: publicering/linkedin-token.json (ingen hemmeligheder)');

  console.log('\nFAERDIG. Toerloeb er fortsat standard i publicer-linkedin.mjs.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('FEJL:', skrub(e.message)); process.exit(1); });
}

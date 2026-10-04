// Bytter en Google-autorisationskode til et refresh token og gemmer det.
//
// KOERER UDELUKKENDE I GITHUB ACTIONS. Client secret ligger i Actions
// Secrets og roerer aldrig en browser eller en privat maskine.
//
// Rejsen:
//   GBP_AUTH_CODE -> refresh token -> hvilken lokation? -> gem GBP_REFRESH_TOKEN
//
// Kun refresh tokenet gemmes. Access tokens lever en time og hentes frisk af
// publiceringen hver gang; de gemmes ingen steder.
//
// FAIL CLOSED. Fejler ét trin, skrives der ingen hemmelighed, og koerslen
// stopper med fejl. Der publiceres aldrig noget herfra.
//
// Kraeves i miljoeet:
//   GBP_AUTH_CODE            koden fra callbacken, indsat af Kristian
//   GBP_CLIENT_ID            offentlig
//   GBP_CLIENT_SECRET        hemmelig, kun her og i publiceringen
//   GBP_TILLADT_LOKATION     AFVENTER, eller den ENE lokation der accepteres
//   GH_SECRET_MANAGER_TOKEN  fine-grained PAT, dette repo, kun Secrets: write
//   GITHUB_REPOSITORY        saettes af Actions

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  TOKEN_ENDEPUNKT, REDIRECT_URI, SCOPE, SENTINEL, LOKATION_RX,
  DestinationAfvist, AdgangAfvist, skrub, maskId, findLokationer, bevisLokation,
} from './google-business.mjs';

const GH = 'https://api.github.com';
const OPBRUGT = 'opbrugt';
const PLADSHOLDERE = new Set([OPBRUGT, 'venter', 'afventer', 'todo', 'x', '-']);
export const METADATA = 'publicering/google-token.json';

const env = process.env;
const noedvendig = (navn) => {
  const v = (env[navn] ?? '').trim();
  if (!v) throw new Error(`${navn} mangler. Fornyelsen stoppes.`);
  return v;
};
const maskér = (v) => { if (v && env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${v}`); return v; };

// ── GitHub Secrets ──────────────────────────────────────────────────────────
// Samme vej som LinkedIn-fornyelsen: en forseglet kasse mod repoets
// offentlige noegle. GitHub kan aabne den; ingen andre kan.

async function ghKald(sti, valg = {}) {
  const r = await fetch(`${GH}/repos/${noedvendig('GITHUB_REPOSITORY')}${sti}`, {
    ...valg,
    headers: {
      Authorization: `Bearer ${noedvendig('GH_SECRET_MANAGER_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(valg.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${sti} → ${r.status} ${skrub(await r.text())}`);
  return r.status === 204 || r.status === 201 ? null : r.json();
}

async function skrivHemmelighed(navn, vaerdi) {
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const noegle = await ghKald('/actions/secrets/public-key');
  const forseglet = sodium.crypto_box_seal(
    sodium.from_string(vaerdi),
    sodium.from_base64(noegle.key, sodium.base64_variants.ORIGINAL),
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

// ── Koden ───────────────────────────────────────────────────────────────────

/** Fanger en pladsholder eller en halv kode, FOER Google kaldes. */
export function pruvKode(kode) {
  if (PLADSHOLDERE.has(kode.toLowerCase())) {
    throw new Error(
      `GBP_AUTH_CODE indeholder pladsholderen "${kode}", ikke en rigtig kode. ` +
      'Hent en paa https://kristiangg.dk/oauth/google/ og indsaet den i Settings > Secrets > GBP_AUTH_CODE foerst.',
    );
  }
  if (kode.length < 20) {
    throw new Error(`GBP_AUTH_CODE er kun ${kode.length} tegn. En Google-kode er laengere. Blev kun en del af den kopieret?`);
  }
}

export async function byt(hent = fetch) {
  const kode = noedvendig('GBP_AUTH_CODE');
  pruvKode(kode);
  maskér(kode);

  const r = await hent(TOKEN_ENDEPUNKT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: kode,
      redirect_uri: REDIRECT_URI,
      client_id: noedvendig('GBP_CLIENT_ID'),
      client_secret: noedvendig('GBP_CLIENT_SECRET'),
    }),
  });
  const svar = await r.json().catch(() => ({}));
  if (!r.ok) {
    const ekstra = svar?.error === 'invalid_grant'
      ? '\n  Koden er enten allerede brugt, udloebet (den lever kun faa minutter), eller fra et andet ' +
        'redirect_uri.\n  Hent en frisk paa https://kristiangg.dk/oauth/google/ og koer igen med det samme.'
      : svar?.error === 'redirect_uri_mismatch'
        ? `\n  Google Cloud skal have praecis dette redirect URI: ${REDIRECT_URI}`
        : '';
    throw new Error(`Google afviste byttet: ${r.status} ${skrub(svar?.error ?? '')} ${skrub(svar?.error_description ?? '')}${ekstra}`);
  }
  maskér(svar.access_token);
  maskér(svar.refresh_token);
  if (!svar.access_token) throw new Error('Intet access_token i svaret fra Google.');
  if (!svar.refresh_token) {
    throw new Error(
      'Google returnerede intet refresh token. Uden det kan motoren ikke koere uden login. ' +
      'Start forfra paa https://kristiangg.dk/oauth/google/ — startsiden beder om offline-adgang og samtykke.',
    );
  }
  const scopes = String(svar.scope ?? '').split(/\s+/);
  if (!scopes.includes(SCOPE)) {
    throw new Error(`Tokenet mangler scopet ${SCOPE}. Saet flueben ved Business Profile-adgangen i samtykkedialogen.`);
  }
  return svar;
}

/** Hvad Google FAKTISK returnerede. Ingen hemmeligheder. */
export function beskrivSvar(svar, nu = Date.now()) {
  const sek = Number(svar.refresh_token_expires_in) || 0;
  return {
    scope: svar.scope ?? null,
    refresh_tidsbegraenset: sek > 0,
    refresh_udloeber: sek > 0 ? new Date(nu + sek * 1000).toISOString() : null,
  };
}

/**
 * Bootstrap-valget. Kun én lokation, som Google selv viser, og som peger paa
 * kristiangg.dk, maa fastlaases automatisk. Alt andet kraever et menneske.
 */
export function vaelgVedBootstrap(kandidater) {
  if (!kandidater.length) {
    throw new DestinationAfvist('Kontoen har ingen Business Profile-lokationer, tokenet kan se. Intet fastlaases.');
  }
  if (kandidater.length > 1) {
    const liste = kandidater.map((k) => `    ${k.navn}  «${k.titel ?? 'uden titel'}»  ${k.website ?? ''}`).join('\n');
    throw new DestinationAfvist(
      `Tokenet kan se ${kandidater.length} lokationer. Bootstrap vaelger ikke paa Kristians vegne.\n${liste}\n` +
      '  Saet GBP_TILLADT_LOKATION til den rigtige (formen accounts/…/locations/…), ' +
      'hent en ny kode, og koer handlingen forny.',
    );
  }
  const k = kandidater[0];
  if (!/^https?:\/\/(?:www\.)?kristiangg\.dk(?:\/|$)/i.test(k.website ?? '')) {
    throw new DestinationAfvist(
      `Den eneste lokation («${k.titel ?? 'uden titel'}») har ikke kristiangg.dk som website (${k.website ?? 'intet'}). ` +
      'Den fastlaases ikke automatisk. Saet GBP_TILLADT_LOKATION manuelt, hvis den alligevel er rigtig.',
    );
  }
  if (!LOKATION_RX.test(k.navn)) throw new DestinationAfvist(`Uventet lokationsnavn fra Google: ${k.navn}`);
  return k;
}

/**
 * Kontroltilstand. Beviser roerfoeringen UDEN at kalde Google og UDEN at
 * bruge koden. En kode kan kun bruges én gang og lever faa minutter.
 */
async function kontroller() {
  console.log('\nKONTROL. Google kaldes ikke. Koden bruges ikke. Intet gemmes.\n');
  let fejl = 0;
  const ok = (m) => console.log(`  OK    ${m}`);
  const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };

  for (const navn of ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_TILLADT_LOKATION', 'GH_SECRET_MANAGER_TOKEN']) {
    const v = (env[navn] ?? '').trim();
    v ? ok(`${navn} til stede (${v.length} tegn)`) : nej(`${navn} mangler eller er tom`);
  }
  const id = (env.GBP_CLIENT_ID ?? '').trim();
  if (id && !id.endsWith('.apps.googleusercontent.com')) nej('GBP_CLIENT_ID ligner ikke et Google client ID (…apps.googleusercontent.com)');

  const t = (env.GBP_TILLADT_LOKATION ?? '').trim();
  if (t === SENTINEL) console.log(`  ·     GBP_TILLADT_LOKATION staar paa ${SENTINEL}. Brug handlingen bootstrap foerste gang.`);
  else if (t && !LOKATION_RX.test(t)) nej('GBP_TILLADT_LOKATION har hverken vaerdien AFVENTER eller formen accounts/…/locations/…');
  else if (t) ok(`GBP_TILLADT_LOKATION er fastlaast (${maskId(t)})`);

  const kode = (env.GBP_AUTH_CODE ?? '').trim();
  if (!kode) nej('GBP_AUTH_CODE mangler (opret den med vaerdien venter)');
  else {
    try { pruvKode(kode); ok(`GBP_AUTH_CODE ligner en rigtig kode (${kode.length} tegn)`); }
    catch { console.log(`  ·     GBP_AUTH_CODE er en pladsholder. Det er i orden nu; hent en rigtig kode foer bootstrap.`); }
  }

  if (env.GH_SECRET_MANAGER_TOKEN) {
    try {
      const n = await ghKald('/actions/secrets/public-key');
      n.key_id ? ok('PAT\'en kan laese repoets krypteringsnoegle') : nej('krypteringsnoeglen kom uden key_id');
      const liste = await ghKald('/actions/secrets?per_page=100');
      const navne = (liste.secrets ?? []).map((x) => x.name);
      for (const n2 of ['GBP_REFRESH_TOKEN', 'GBP_LOKATION']) {
        console.log(`  ·     ${n2}: ${navne.includes(n2) ? 'findes allerede' : 'oprettes ved foerste autorisation'}`);
      }
    } catch (e) {
      nej(`PAT'en duer ikke: ${skrub(e.message)}`);
    }
  }

  console.log(fejl === 0 ? '\nKONTROL: ALT PAA PLADS. Naeste skridt er en rigtig kode.' : `\nKONTROL: ${fejl} FEJL. Ret dem, foer du bruger en kode.`);
  if (fejl) process.exit(1);
}

async function forny(bootstrap) {
  console.log(bootstrap
    ? '\nFOERSTE AUTORISATION. Destinationen fastlaases. Der publiceres ikke noget.\n'
    : '\nFornyelse af Google-adgangen. Der publiceres ikke noget.\n');

  const tilladt = noedvendig('GBP_TILLADT_LOKATION');
  const foerstegang = tilladt === SENTINEL;
  // Afgoeres FOER koden bruges, saa en forkert handling ikke spilder koden.
  if (foerstegang && !bootstrap) {
    throw new DestinationAfvist(`GBP_TILLADT_LOKATION staar paa ${SENTINEL}. Brug handlingen bootstrap foerste gang.`);
  }
  if (bootstrap && !foerstegang) {
    throw new DestinationAfvist(
      'Destinationen er allerede fastlaast. Bootstrap afvises. Skal den laves om, ' +
      `saettes GBP_TILLADT_LOKATION manuelt tilbage til ${SENTINEL} foerst.`,
    );
  }
  if (!foerstegang && !LOKATION_RX.test(tilladt)) {
    throw new DestinationAfvist('GBP_TILLADT_LOKATION har ikke formen accounts/…/locations/….');
  }

  const svar = await byt();
  const fakta = beskrivSvar(svar);
  console.log('── HVAD GOOGLE SVAREDE ──');
  console.log(`  scope            ${fakta.scope}`);
  console.log(`  refresh token    ${fakta.refresh_tidsbegraenset
    ? `JA, men TIDSBEGRAENSET — udloeber ${fakta.refresh_udloeber.slice(0, 10)}`
    : 'JA, uden udloebsdato'}`);
  if (fakta.refresh_tidsbegraenset) {
    console.log('\n  → Appen staar formentlig i "Testing". Saa udloeber adgangen efter 7 dage.');
    console.log('    Saet Google Auth Platform > Audience > Publishing status til "In production".');
  }

  let valgt;
  if (foerstegang) {
    valgt = vaelgVedBootstrap(await findLokationer(svar.access_token));
    console.log('\n── DESTINATION FASTLAASES ──');
  } else {
    const m = tilladt.match(LOKATION_RX);
    const info = await bevisLokation(svar.access_token,
      { navn: tilladt, konto: `accounts/${m[1]}`, lokation: `locations/${m[2]}` });
    valgt = { navn: tilladt, ...info };
    console.log('\n── LOKATION BEKRAEFTET AF GOOGLE ──');
  }
  console.log(`  ${maskId(valgt.navn)}  «${valgt.titel ?? 'uden titel'}»  ${valgt.website ?? ''}`);
  console.log('  Kontrollér, at det er Kristian GG. Passer det ikke, saa slet GBP_REFRESH_TOKEN og stop.');

  // ── Foerst nu gemmes noget ──
  console.log('\n── GEMMER ──');
  await skrivHemmelighed('GBP_REFRESH_TOKEN', svar.refresh_token);
  await skrivHemmelighed('GBP_LOKATION', valgt.navn);
  if (foerstegang) await skrivHemmelighed('GBP_TILLADT_LOKATION', valgt.navn);
  await skrivHemmelighed('GBP_AUTH_CODE', OPBRUGT);

  // Metadata uden hemmeligheder og uden fulde id'er, saa vagthunden kan varsle.
  writeFileSync(METADATA, JSON.stringify({
    lokation: maskId(valgt.navn),
    titel: valgt.titel ?? null,
    fornyet: new Date().toISOString(),
    ...fakta,
  }, null, 2) + '\n');
  console.log(`  skrevet: ${METADATA} (ingen hemmeligheder)`);
  console.log('\nFAERDIG. Publiceringen henter selv et frisk access token ved hver koersel.\n');
}

// pathToFileURL, saa vagten ogsaa virker paa Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handling = (env.HANDLING ?? 'kontroller').toLowerCase();
  const veje = { kontroller, forny: () => forny(false), bootstrap: () => forny(true) };
  if (!veje[handling]) {
    console.error(`Ukendt handling: "${handling}". Brug kontroller, bootstrap eller forny.`);
    process.exit(1);
  }
  veje[handling]().catch((e) => {
    console.error(`FEJL${e instanceof DestinationAfvist ? ' (destination)' : e instanceof AdgangAfvist ? ' (adgang)' : ''}:`, skrub(e.message));
    process.exit(1);
  });
}

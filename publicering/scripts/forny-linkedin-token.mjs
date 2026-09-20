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
//   GH_SECRET_MANAGER_TOKEN    fine-grained PAT, dette ene repo, kun Secrets: write
//   GITHUB_REPOSITORY saettes af Actions

import { bevisEjer, DestinationAfvist } from './publicer-linkedin.mjs';

const TOKEN_ENDEPUNKT = 'https://www.linkedin.com/oauth/v2/accessToken';
const REDIRECT_URI = 'https://kristiangg.dk/oauth/linkedin/callback/';
const GH = 'https://api.github.com';
const OPBRUGT = 'opbrugt';
// Vaerdier der tydeligvis ikke er en rigtig kode. Fanges foer LinkedIn
// kaldes, saa fejlbeskeden siger, hvad der er galt, frem for LinkedIns
// intetsigende "authorization code not found".
const PLADSHOLDERE = new Set([OPBRUGT, 'venter', 'afventer', 'todo', 'x', '-']);

// Hoenen og aegget: destinationen skal vaere fastlaast, FOER der publiceres,
// men Kristians person-URN kan foerst kendes, naar han har autoriseret.
//
// SENTINEL er den vaerdi, LI_TILLADT_URN saettes til, indtil URN'en kendes.
// Kun naar den staar der praecis, maa "bootstrap" fastlaase destinationen ud
// fra den autorisation, Kristian netop har gennemfoert i sin egen browser og
// godkendt i GitHub. Derefter er den laast, og bootstrap virker ikke mere.
//
// Alternativet var at bruge to koder: én til at faa URN'en at vide, og én
// til den rigtige fornyelse. Det er ikke sikrere - det er bare besvaerligere.
const SENTINEL = 'urn:li:person:AFVENTER';

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
  for (const h of [env.LI_CLIENT_SECRET, env.GH_SECRET_MANAGER_TOKEN, env.LI_AUTH_CODE].filter(Boolean)) {
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
      Authorization: `Bearer ${noedvendig('GH_SECRET_MANAGER_TOKEN')}`,
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
  if (PLADSHOLDERE.has(kode.toLowerCase())) {
    throw new Error(
      `LI_AUTH_CODE indeholder pladsholderen "${kode}", ikke en rigtig kode. ` +
      'Hent en paa https://kristiangg.dk/oauth/linkedin/ og indsaet den i ' +
      'Settings > Secrets > LI_AUTH_CODE foerst.'
    );
  }
  if (kode.length < 40) {
    throw new Error(
      `LI_AUTH_CODE er kun ${kode.length} tegn. En LinkedIn-kode er betydeligt laengere. ` +
      'Blev kun en del af den kopieret?'
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
  if (!r.ok) {
    // "authorization code not found" daekker over tre forskellige ting, og
    // LinkedIn siger ikke hvilken. Derfor staar de alle tre her.
    const ekstra = /code not found|invalid_grant/i.test(JSON.stringify(svar))
      ? '\n  Koden er enten allerede brugt, udloebet (30 minutter), eller fra et ' +
        'andet redirect_uri.\n  Hent en frisk paa https://kristiangg.dk/oauth/linkedin/ ' +
        'og koer igen med det samme.'
      : '';
    throw new Error(`LinkedIn afviste byttet: ${r.status} ${skrub(JSON.stringify(svar))}${ekstra}`);
  }
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

/**
 * Kontroltilstand. Beviser, at hele roerfoeringen er paa plads, UDEN at
 * kalde LinkedIn og UDEN at bruge autorisationskoden.
 *
 * Den findes, fordi en rigtig kode er en knap ressource: den kan bruges én
 * gang og lever tredive minutter. Fejler opsaetningen foerst bagefter, er
 * koden spildt, og Kristian skal hele browserforloebet igennem igen.
 */
async function kontroller() {
  console.log('\nKONTROL. LinkedIn kaldes ikke. Koden bruges ikke. Intet gemmes.\n');
  let fejl = 0;
  const ok = (m) => console.log(`  OK    ${m}`);
  const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };

  // Hemmelighederne. Kun laengder og form vises, aldrig vaerdier.
  for (const navn of ['LI_CLIENT_ID', 'LI_CLIENT_SECRET', 'LI_TILLADT_URN', 'GH_SECRET_MANAGER_TOKEN']) {
    const v = (env[navn] ?? '').trim();
    v ? ok(`${navn} til stede (${v.length} tegn)`) : nej(`${navn} mangler eller er tom`);
  }

  const urn = (env.LI_TILLADT_URN ?? '').trim();
  if (urn && !urn.startsWith('urn:li:person:')) {
    nej(`LI_TILLADT_URN er ikke en personprofil: "${urn}". Kun urn:li:person: accepteres.`);
  } else if (urn === 'urn:li:person:AFVENTER') {
    console.log('  ·     LI_TILLADT_URN staar paa AFVENTER. Foerste rigtige fornyelse');
    console.log('        vil afvise og skrive din rigtige URN i loggen.');
  } else if (urn) {
    ok('LI_TILLADT_URN er en personprofil');
  }

  const kode = (env.LI_AUTH_CODE ?? '').trim();
  if (!kode) nej('LI_AUTH_CODE mangler');
  else if (PLADSHOLDERE.has(kode.toLowerCase())) {
    console.log(`  ·     LI_AUTH_CODE staar paa "${kode}" — en pladsholder, ikke en kode.`);
    console.log('        Det er i orden nu. Hent en rigtig kode foer fornyelsen.');
  } else if (kode.length < 40) {
    nej(`LI_AUTH_CODE er kun ${kode.length} tegn. Er kun en del kopieret?`);
  } else ok(`LI_AUTH_CODE ligner en rigtig kode (${kode.length} tegn)`);

  // Kan PAT'en faktisk skrive hemmeligheder? Kun GET — intet aendres.
  if (env.GH_SECRET_MANAGER_TOKEN) {
    try {
      const n = await ghKald('/actions/secrets/public-key');
      n.key_id ? ok(`PAT'en kan laese repoets krypteringsnoegle (key_id ${n.key_id})`)
               : nej('krypteringsnoeglen kom uden key_id');
      const liste = await ghKald('/actions/secrets?per_page=100');
      const navne = (liste.secrets ?? []).map((x) => x.name);
      ok(`PAT'en kan se ${navne.length} hemmeligheder`);
      for (const n2 of ['LI_ACCESS_TOKEN', 'LI_PERSON_URN']) {
        console.log(`  ·     ${n2}: ${navne.includes(n2) ? 'findes allerede' : 'oprettes ved foerste fornyelse'}`);
      }
    } catch (e) {
      nej(`PAT'en duer ikke: ${skrub(e.message)}`);
    }
  }

  console.log(fejl === 0
    ? '\nKONTROL: ALT PAA PLADS. Naeste skridt er en rigtig kode.'
    : `\nKONTROL: ${fejl} FEJL. Ret dem, foer du bruger en kode.`);
  if (fejl) process.exit(1);
}

async function forny(bootstrap = false) {
  console.log(bootstrap
    ? '\nFOERSTE AUTORISATION. Destinationen fastlaases. Der publiceres ikke noget.\n'
    : '\nFornyelse af LinkedIn-token. Der publiceres ikke noget.\n');

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

  const foerstegang = tilladt === SENTINEL;
  if (foerstegang && !bootstrap) {
    throw new DestinationAfvist(
      `LI_TILLADT_URN staar paa ${SENTINEL} og er dermed ikke fastlaast. ` +
      'Koer handlingen "bootstrap" for at fastlaase destinationen ud fra denne autorisation.'
    );
  }
  if (bootstrap && !foerstegang) {
    throw new DestinationAfvist(
      `Destinationen er allerede fastlaast til ${tilladt}. Bootstrap afvises. ` +
      'Skal den laves om, saettes LI_TILLADT_URN manuelt tilbage til sentinelvaerdien foerst.'
    );
  }

  let ejer;
  if (foerstegang) {
    // Vi kender ikke URN'en endnu, saa der er intet at sammenligne med.
    // Den kommer fra LinkedIns eget svar paa det token, Kristian netop har
    // udstedt i sin egen browser og godkendt i GitHub.
    const r = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${svar.access_token}` },
    });
    const hvem = await r.json().catch(() => ({}));
    if (!r.ok || !hvem?.sub) {
      throw new DestinationAfvist(
        `Kunne ikke aflaese identiteten (${r.status}). Uden den fastlaases ingen destination.`
      );
    }
    ejer = { urn: `urn:li:person:${hvem.sub}`, navn: hvem.name ?? null };
    console.log(`\n── DESTINATION FASTLAASES ──`);
    console.log(`  ${ejer.urn}${ejer.navn ? ` (${ejer.navn})` : ''}`);
    console.log('  Kontrollér, at navnet er Kristians eget — ikke en side og ikke');
    console.log('  Foreningen mod Familiebelastning. Passer det ikke, saa slet');
    console.log('  hemmelighederne og start forfra.');
  } else {
    ejer = await bevisEjer(svar.access_token, tilladt);
    console.log(`\n── IDENTITET BEKRAEFTET ──\n  ${ejer.urn}${ejer.navn ? ` (${ejer.navn})` : ''}`);
  }

  // ── Foerst nu gemmes noget ──
  console.log('\n── GEMMER ──');
  await skrivHemmelighed('LI_ACCESS_TOKEN', svar.access_token);
  await skrivHemmelighed('LI_PERSON_URN', ejer.urn);
  if (foerstegang) await skrivHemmelighed('LI_TILLADT_URN', ejer.urn);
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
  const handling = (env.HANDLING ?? 'kontroller').toLowerCase();
  const veje = { kontroller, forny: () => forny(false), bootstrap: () => forny(true) };
  if (!veje[handling]) {
    console.error(`Ukendt handling: "${handling}". Brug kontroller eller forny.`);
    process.exit(1);
  }
  veje[handling]().catch((e) => { console.error('FEJL:', skrub(e.message)); process.exit(1); });
}

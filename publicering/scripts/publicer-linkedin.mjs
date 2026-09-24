// Publicerer ét godkendt element til en LinkedIn-medlemsprofil via officiel
// LinkedIn REST API (Share on LinkedIn, scope w_member_social).
//
//   LI_ACCESS_TOKEN    OAuth access token, 60 dages levetid, fra GitHub Secrets
//   LI_PERSON_URN      urn:li:person:xxxx for profilen der publiceres fra
//   LI_TILLADT_URN     den ENESTE URN der maa publiceres til
//
// DESTINATIONSKONTROL — FAIL CLOSED
//
// Integrationen gaelder udelukkende Kristians personlige LinkedIn-profil.
// Foreningen mod Familiebelastning maa ikke indgaa: ingen side, ingen
// organization-URN, ingen credentials, ingen reserveloesning. Der genbruges
// ingen destinations-id'er fra andre projekter.
//
// Fem kontroller, alle skal bestaa, ellers publiceres der ikke:
//
//   1. LI_TILLADT_URN findes
//   2. LI_PERSON_URN er identisk med LI_TILLADT_URN
//   3. URN'en er en urn:li:person: — aldrig urn:li:organization:
//   4. /v2/userinfo bekraefter, at tokenet TILHOERER netop den person
//   5. versionslaas, teksthash og godkendelse som hidtil
//
// De to felter faar samme vaerdi, men laeses hver for sig. En aendring af det
// ene aendrer ikke det andet, og uoverensstemmelsen stopper publicering. Det
// er billigt og fanger netop den fejl, hvor nogen udskifter destinationen.
//
// Kontrol 4 er den eneste, der ikke kan snydes ved at rette en hemmelighed:
// de oevrige laeser vores egen konfiguration, den spoerger LinkedIn.
import { readFileSync } from 'node:fs';
import { beregnLaas, sha256 } from './laas.mjs';

const API = 'https://api.linkedin.com/rest/posts';
const USERINFO = 'https://api.linkedin.com/v2/userinfo';
const VERSION = '202509';
const PERSON_PRAEFIKS = 'urn:li:person:';

/** Kastes af destinationskontrollen. Egen type, saa den ikke forveksles. */
export class DestinationAfvist extends Error {
  constructor(m) { super(m); this.name = 'DestinationAfvist'; }
}

/**
 * Kontrol 1-3: vores egen konfiguration. Ingen netvaerk, ingen token.
 * Returnerer den URN, der maa publiceres til.
 */
export function pruvDestination(env = process.env) {
  const tilladt = (env.LI_TILLADT_URN ?? '').trim();
  const maal = (env.LI_PERSON_URN ?? '').trim();

  if (!tilladt) {
    throw new DestinationAfvist('LI_TILLADT_URN mangler. Uden en eksplicit tilladt destination publiceres der ikke.');
  }
  if (!maal) {
    throw new DestinationAfvist('LI_PERSON_URN mangler.');
  }
  if (maal !== tilladt) {
    throw new DestinationAfvist('LI_PERSON_URN svarer ikke til LI_TILLADT_URN. Destinationen er aendret siden godkendelsen.');
  }
  if (!maal.startsWith(PERSON_PRAEFIKS)) {
    throw new DestinationAfvist(
      `Destinationen er ikke en personprofil: "${maal}". ` +
      'Kun urn:li:person: er tilladt. En organisationsside maa aldrig vaere maal.'
    );
  }
  return maal;
}

/**
 * Kontrol 4: LinkedIn bekraefter selv, hvem tokenet tilhoerer.
 * Kraever scope "openid profile" ud over w_member_social.
 */
export async function bevisEjer(token, forventet, hent = fetch) {
  let r, svar;
  try {
    r = await hent(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
    svar = await r.json();
  } catch (err) {
    throw new DestinationAfvist(`Kunne ikke aflaese tokenets ejer: ${err.message}. Der publiceres ikke paa et ubekraeftet token.`);
  }
  if (!r.ok) {
    throw new DestinationAfvist(`/v2/userinfo svarede ${r.status}. Ejeren kan ikke bekraeftes, og saa publiceres der ikke.`);
  }
  if (!svar?.sub) {
    throw new DestinationAfvist('Svaret fra /v2/userinfo bar ingen sub. Ejeren kan ikke bekraeftes.');
  }
  const faktisk = `${PERSON_PRAEFIKS}${svar.sub}`;
  if (faktisk !== forventet) {
    throw new DestinationAfvist(
      `Tokenet tilhoerer ${faktisk}, men destinationen er ${forventet}. Publicering afvist.`
    );
  }
  return { urn: faktisk, navn: svar.name ?? null };
}

export function byggPayload(e, personUrn) {
  const post = {
    author: personUrn,
    commentary: e.tekst,            // ordret som låst
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (e.artikel_url) {
    post.content = { article: { source: e.artikel_url, title: e.titel, description: e.meta_description } };
  }
  return post;
}

export async function publicer(e, { dryRun = true } = {}) {
  // ── 1-3. Destinationen, foer alt andet ──────────────────────────────────
  // Hvor noget sendes hen, afgoeres foer hvad der sendes. Er destinationen
  // forkert, er indholdet ligegyldigt.
  const urn = pruvDestination();
  const token = process.env.LI_ACCESS_TOKEN;

  // ── 4. LinkedIn bekraefter ejeren ───────────────────────────────────────
  // I toerloeb springes trinnet over, hvis der ikke er et token — men findes
  // der ét, koeres kontrollen ogsaa i toerloeb, saa proeven er en rigtig proeve.
  if (token) {
    const ejer = await bevisEjer(token, urn);
    console.log(`  destination bekræftet: ${ejer.urn}${ejer.navn ? ` (${ejer.navn})` : ''}`);
  } else if (dryRun) {
    console.log('  destination: kontrol 1-3 bestået. Kontrol 4 sprunget over — intet token i tørløb.');
  } else {
    throw new Error('LI_ACCESS_TOKEN mangler i miljøet.');
  }

  // ── 5. Indholdet er det godkendte ───────────────────────────────────────
  const { laas } = beregnLaas(e);
  if (laas !== e.versionslaas) throw new Error(`Versionslås afviger (${laas} vs ${e.versionslaas}). Publicering stoppet.`);
  if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('Teksten svarer ikke til den godkendte hash. Publicering stoppet.');
  if (!e.godkendt_af || !e.godkendt_dato) throw new Error('Elementet bærer ingen godkendelse. Publicering stoppet.');
  if (e.kanal !== 'linkedin') throw new Error(`Elementet er mærket "${e.kanal}", ikke linkedin. Publicering stoppet.`);

  const payload = byggPayload(e, urn);
  if (dryRun) {
    console.log('TØRLØB — intet sendt. Ville POSTe til', API);
    console.log(JSON.stringify(payload, null, 2));
    return { dryRun: true, payload };
  }
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`LinkedIn afviste: ${r.status} ${await r.text()}`);
  return { post_id: r.headers.get('x-restli-id') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  publicer(e, { dryRun: !process.argv.includes('--publicer') })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
}

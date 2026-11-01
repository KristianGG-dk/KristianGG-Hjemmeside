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
const BILLEDER = 'https://api.linkedin.com/rest/images?action=initializeUpload';
const PERSON_PRAEFIKS = 'urn:li:person:';

// ── API-VERSIONEN ───────────────────────────────────────────────────────────
//
// LinkedIns versionerede REST-API kraever en «LinkedIn-Version»-header i
// formen AAAAMM. Versioner er aktive i omtrent et aar og lukkes derefter.
// Kaldes en lukket version, svarer LinkedIn 426 NONEXISTENT_VERSION — det
// skete 01-11-2026, hvor «202509» var staaet af:
//
//   initializeUpload svarede 426: {"status":426,"code":"NONEXISTENT_VERSION",
//   "message":"Requested version 20250901 is not active"}
//
// En haardkodet version er altsaa en tidsindstillet fejl. Derfor:
//
//   1. LI_API_VERSION i miljoeet vinder, hvis den er sat. Saa kan versionen
//      rettes uden en ny merge.
//   2. Ellers bruges STANDARD_VERSION herunder.
//   3. Svarer LinkedIn 426 alligevel, maales den aktive version mod API'et
//      (se proevVersion) og kaldet gentages én gang. En 426 er utvetydig:
//      den handler om versionen, ikke om indholdet eller adgangen.
//
// Versionen maales paa initializeUpload — netop det kald, der skal virke.
// Det er med vilje: et andet endepunkt kunne svare 404 for ALLE versioner,
// hvis det ikke findes i det versionerede API, og saa ville maalingen intet
// laere og blot udpege den nyeste kandidat. Maaler vi paa kaldet selv, er et
// ja et rigtigt ja.
//
// En initializeUpload, der lykkes, giver en engangsadresse, vi kan bruge med
// det samme. Lykkes den under maalingen, bruges netop det svar. Der oprettes
// INTET OPSLAG — hverken under maalingen eller under billedproeven.
const STANDARD_VERSION = process.env.LI_API_VERSION?.trim() || '202610';

/** Kandidater, nyeste foerst: denne maaned og de fjorten foregaaende. */
export function kandidatVersioner(nu = new Date()) {
  const ud = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() - i, 1));
    ud.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return ud;
}

/**
 * Ét forsoeg paa initializeUpload med én version.
 * Returnerer { aktiv, r, svar } — «aktiv» er falsk KUN ved en versionsfejl.
 */
async function initializeUpload(token, ejerUrn, version, hent) {
  const r = await hent(BILLEDER, {
    method: 'POST',
    headers: headere(token, version, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initializeUploadRequest: { owner: ejerUrn } }),
  });
  let svar = {};
  try { svar = await r.json(); } catch { /* tomt eller ikke-JSON svar */ }
  return { aktiv: !erVersionsfejl(r.status, svar), r, svar };
}

/** Er versionen aktiv? 426 = nej. Alt andet = ja. Opretter intet opslag. */
export async function erVersionAktiv(token, version, hent = fetch, ejerUrn = 'urn:li:person:ukendt') {
  return (await initializeUpload(token, ejerUrn, version, hent)).aktiv;
}

/** Headere til et versioneret kald. Samme sted for alle kald. */
export function headere(token, version, ekstra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
    ...ekstra,
  };
}

/** Er svaret en 426 om versionen? */
const erVersionsfejl = (status, krop) =>
  status === 426 || String(krop?.code ?? '') === 'NONEXISTENT_VERSION';

/** Billedet skal komme fra vores eget domaene. Intet andet hentes og sendes. */
const BILLED_VAERT = 'kristiangg.dk';
const BILLED_TYPER = ['image/jpeg', 'image/png'];
const BILLED_MAKS_BYTE = 10 * 1024 * 1024;

/** Kastes naar et godkendt billede ikke kan hentes eller lægges op. */
export class BilledeAfvist extends Error {
  constructor(m) { super(m); this.name = 'BilledeAfvist'; }
}

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

/**
 * Henter det godkendte billede fra kristiangg.dk.
 *
 * Billedet er en del af godkendelsen: «billede» og «alt_tekst» er laaste
 * felter. Kan det ikke hentes, er opslaget ikke det godkendte, og saa
 * publiceres der ikke. Ingen reserveloesning, intet andet billede, og aldrig
 * et opslag uden.
 */
export async function hentGodkendtBillede(url, hent = fetch) {
  let u;
  try { u = new URL(url); } catch { throw new BilledeAfvist(`billede_url er ikke en adresse: ${url}`); }
  if (u.protocol !== 'https:') throw new BilledeAfvist(`billede_url skal vaere https: ${url}`);
  if (u.hostname !== BILLED_VAERT && u.hostname !== `www.${BILLED_VAERT}`) {
    throw new BilledeAfvist(`billedet skal ligge paa ${BILLED_VAERT}, ikke ${u.hostname}`);
  }

  let r;
  try { r = await hent(u.href); }
  catch (err) { throw new BilledeAfvist(`billedet kunne ikke hentes: ${err.message}`); }
  if (!r.ok) throw new BilledeAfvist(`${u.href} svarede ${r.status}. Billedet findes ikke paa adressen.`);

  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!BILLED_TYPER.includes(type)) {
    throw new BilledeAfvist(`${u.href} svarede content-type «${type}». Kun ${BILLED_TYPER.join(' og ')}.`);
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new BilledeAfvist(`${u.href} svarede 0 byte.`);
  if (bytes.length > BILLED_MAKS_BYTE) {
    throw new BilledeAfvist(`billedet er ${bytes.length} byte, over graensen paa ${BILLED_MAKS_BYTE}.`);
  }
  return { bytes, type, url: u.href };
}

/**
 * Laegger billedet op og returnerer dets URN.
 *
 * To trin, som LinkedIns Images API foreskriver: initializeUpload giver en
 * engangsadresse og billedets URN, og derefter afleveres bytes paa adressen.
 *
 * OM METODEN PAA UPLOAD-ADRESSEN
 * Images API dokumenterer initializeUpload og selve URN'en entydigt, men
 * LinkedIns egne sider var ikke tilgaengelige herfra, da dette blev skrevet,
 * og de sekundaere kilder er uenige: Images API beskrives med PUT, mens den
 * aeldre Assets-vej brugte POST. Derfor gaettes der ikke: der sendes PUT, og
 * svarer adressen «metoden er ikke tilladt», sendes POST én gang. Hvilken af
 * dem der virkede, skrives i loggen, saa det kan laases naar det er set.
 * Virker ingen af dem, kastes der — og saa publiceres der intet.
 */
export async function uploadBillede(token, ejerUrn, billede, hent = fetch, version = STANDARD_VERSION,
                                    { nu = new Date(), log = (l) => console.log(l) } = {}) {
  // Foerst den version, vi regner med. Er den staaet af, maales de andre —
  // nyeste foerst — paa samme kald. Der gaettes ikke.
  let forsoegt = [version], brugtVersion = version, r, svar;
  try {
    ({ r, svar } = await initializeUpload(token, ejerUrn, version, hent));
    if (erVersionsfejl(r.status, svar)) {
      log(`  API-version ${version} er ikke aktiv (${svar?.code ?? r.status}). Maaler den aktive.`);
      let fundet = false;
      for (const v of kandidatVersioner(nu)) {
        if (v === version) continue;
        forsoegt.push(v);
        ({ r, svar } = await initializeUpload(token, ejerUrn, v, hent));
        if (!erVersionsfejl(r.status, svar)) { brugtVersion = v; fundet = true; log(`  aktiv API-version: ${v}`); break; }
        log(`  ${v}: ikke aktiv`);
      }
      if (!fundet) {
        throw new BilledeAfvist(
          `Ingen af de proevede API-versioner er aktive (${forsoegt.join(', ')}). ` +
          'Se LinkedIns versioneringsside og saet LI_API_VERSION i miljoeet «publicering».'
        );
      }
      log(`  SAET LI_API_VERSION=${brugtVersion} i miljoeet «publicering», saa maalingen ikke gentages.`);
    }
  } catch (err) {
    if (err instanceof BilledeAfvist) throw err;
    throw new BilledeAfvist(`initializeUpload fejlede: ${err.message}`);
  }
  if (!r.ok) throw new BilledeAfvist(`initializeUpload svarede ${r.status}: ${JSON.stringify(svar).slice(0, 300)}`);

  const adresse = svar?.value?.uploadUrl;
  const urn = svar?.value?.image;
  if (!adresse || !urn) {
    throw new BilledeAfvist(`initializeUpload bar hverken uploadUrl eller image: ${JSON.stringify(svar).slice(0, 300)}`);
  }

  let brugt = null, sidsteSvar = null;
  for (const metode of ['PUT', 'POST']) {
    let u;
    try {
      u = await hent(adresse, {
        method: metode,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': billede.type },
        body: billede.bytes,
      });
    } catch (err) {
      throw new BilledeAfvist(`upload med ${metode} fejlede: ${err.message}`);
    }
    if (u.ok) { brugt = metode; break; }
    sidsteSvar = `${metode} → ${u.status}`;
    // Kun «metoden er ikke tilladt» giver anledning til at proeve den anden.
    if (u.status !== 405 && u.status !== 501) break;
  }
  if (!brugt) throw new BilledeAfvist(`billedet kunne ikke lægges op (${sidsteSvar}).`);

  console.log(`  billede lagt op med ${brugt}: ${urn}`);
  return { urn, metode: brugt, version: brugtVersion };
}

export function byggPayload(e, personUrn, billedUrn = null) {
  const post = {
    author: personUrn,
    commentary: e.tekst,            // ordret som låst
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  // «content» kan baere ét af dem. Baerer elementet baade billede og artikel,
  // er godkendelsen tvetydig, og saa gaettes der ikke paa hvilken der menes.
  if (billedUrn && e.artikel_url) {
    throw new Error('Elementet har baade billede_url og artikel_url. LinkedIn kan kun baere ét. Publicering stoppet.');
  }
  if (billedUrn) {
    post.content = { media: { id: billedUrn, altText: e.alt_tekst } };
  } else if (e.artikel_url) {
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

  // ── 6. Billedet ─────────────────────────────────────────────────────────
  // Et opslag, der er godkendt med billede, maa ALDRIG gaa ud uden. «billede»
  // og «alt_tekst» er laaste felter, og billede_url er den adresse, det
  // godkendte motiv ligger paa. Mangler adressen, mens motivet er laast, er
  // godkendelsen ikke komplet — og saa publiceres der ikke.
  if (e.billede && !e.billede_url) {
    throw new Error(
      `Elementet er godkendt med motivet «${e.billede}», men baerer ingen billede_url. ` +
      'Et opslag godkendt med billede publiceres ikke som ren tekst. Publicering stoppet.'
    );
  }

  // ALLE versionerede kald i denne koersel bruger samme version. Lykkes
  // billedoplaegningen paa en anden version end standarden, foelger opslaget
  // med over paa den — ellers kunne de to komme til at bruge hver sin.
  let version = STANDARD_VERSION;

  let billedUrn = null;
  if (e.billede_url) {
    // Hentes ogsaa i toerloeb: saa er proeven en rigtig proeve paa, at
    // adressen svarer, og at det er et billede. Der lægges intet op.
    const billede = await hentGodkendtBillede(e.billede_url);
    console.log(`  billede hentet: ${billede.url} (${billede.type}, ${billede.bytes.length} byte)`);
    if (!dryRun) {
      const lagtOp = await uploadBillede(token, urn, billede, fetch, version);
      billedUrn = lagtOp.urn;
      version = lagtOp.version;
    }
  }
  console.log(`  API-version: ${version}`);

  const payload = byggPayload(e, urn, billedUrn);
  if (dryRun) {
    console.log('TØRLØB — intet sendt. Ville POSTe til', API);
    if (e.billede_url) {
      console.log('  (billedet er hentet og kontrolleret, men IKKE lagt op. I rigtig');
      console.log('   koersel saettes content.media.id til billedets URN.)');
    }
    console.log(JSON.stringify(payload, null, 2));
    return { dryRun: true, payload };
  }
  let r = await fetch(API, {
    method: 'POST',
    headers: headere(token, version, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  // Et opslag UDEN billede har ikke vaeret gennem versionsmaalingen i
  // uploadBillede. Faar det en 426, maales der ogsaa her — samme regel.
  if (r.status === 426 && !billedUrn) {
    console.log(`  API-version ${version} er ikke aktiv. Maaler den aktive.`);
    for (const v of kandidatVersioner()) {
      if (v === version) continue;
      r = await fetch(API, {
        method: 'POST',
        headers: headere(token, v, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (r.status !== 426) { console.log(`  aktiv API-version: ${v}. SAET LI_API_VERSION=${v}.`); break; }
    }
  }
  if (!r.ok) throw new Error(`LinkedIn afviste: ${r.status} ${await r.text()}`);
  return { post_id: r.headers.get('x-restli-id') };
}

/**
 * Beviser billedvejen UDEN at oprette et opslag.
 *
 * Henter det godkendte billede og lægger det op hos LinkedIn — og stopper
 * dér. Et billede, der ikke er knyttet til et opslag, er ikke synligt nogen
 * steder og er ikke en publicering. Formaalet er at afgoere, hvilken metode
 * upload-adressen tager imod, FOER det gaelder et rigtigt opslag.
 *
 *   node publicer-linkedin.mjs --billedproeve publicering/laase/element-41.json
 */
async function billedproeve(e) {
  console.log('BILLEDPROEVE — der oprettes INTET opslag.\n');
  const urn = pruvDestination();
  const token = process.env.LI_ACCESS_TOKEN;
  if (!token) throw new Error('LI_ACCESS_TOKEN mangler i miljøet.');
  const ejer = await bevisEjer(token, urn);
  console.log(`  destination bekræftet: ${ejer.urn}${ejer.navn ? ` (${ejer.navn})` : ''}`);
  if (!e.billede_url) throw new Error(`Element ${e.element} har ingen billede_url.`);

  const billede = await hentGodkendtBillede(e.billede_url);
  console.log(`  billede hentet: ${billede.url} (${billede.type}, ${billede.bytes.length} byte)`);
  // uploadBillede maaler selv versionen paa initializeUpload, hvis standarden
  // er staaet af. Det var netop det kald, der faldt 01-11-2026 med 426.
  const { urn: billedUrn, metode, version } = await uploadBillede(token, urn, billede, fetch, STANDARD_VERSION);

  console.log('');
  console.log(`BILLEDPROEVE BESTAAET. API-version ${version}, upload-adressen tog imod ${metode}.`);
  console.log(`Billedets URN: ${billedUrn}`);
  console.log('Der er ikke oprettet noget opslag. Billedet er ikke synligt for nogen.');
  console.log('');
  console.log(`Virker ${metode}, kan listen i uploadBillede() laases til kun ${metode}.`);
  if (version !== STANDARD_VERSION) {
    console.log('');
    console.log(`SKAL RETTES: STANDARD_VERSION i publicer-linkedin.mjs staar paa ${STANDARD_VERSION},`);
    console.log(`men ${version} er den aktive. Saet LI_API_VERSION=${version} i miljoeet`);
    console.log('«publicering», eller ret konstanten, saa maalingen ikke gentages ved hver koersel.');
  }
  return { billedproeve: true, version, metode, urn: billedUrn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const fil = argv.find((a) => !a.startsWith('--'));
  const e = JSON.parse(readFileSync(fil, 'utf8'));
  if (argv.includes('--billedproeve')) {
    billedproeve(e)
      .then(() => process.exit(0))
      .catch((err) => { console.error('BILLEDPROEVE FEJLEDE:', err.message); process.exit(1); });
  } else {
  publicer(e, { dryRun: !process.argv.includes('--publicer') })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
  }
}

// Paalidelig udloeser til publiceringen.
//
// HVORFOR DEN FINDES
// GitHubs cron er «best effort». Maalt 27/10-01/11 2026 koerte
// publicer-instagram-planlagt reelt hver 3.-6. time, ikke hvert kvarter.
// Med 24-timersvinduet bortfalder et godkendt opslag ikke laengere af den
// grund — men det gaar ud «engang paa dagen» i stedet for paa det godkendte
// tidspunkt. Denne funktion lukker den forskel.
//
// Netlify koerer den efter sin egen tidsplan, som faktisk holder, og den
// kalder GitHubs repository_dispatch. Resten er uaendret: workflowet tager
// kravet, efterregner laase og publicerer kun det, der er forfaldent.
//
// DEN PUBLICERER INTET SELV
// Den starter et workflow. Alle spaerrer ligger i motoren, ikke her: laas,
// teksthash, godkendelse, koe, register, billede og tidsvindue.
//
// UDEN TOKEN GOER DEN INTET
// Mangler GITHUB_DISPATCH_TOKEN, logger den det og stopper. Den fejler
// lukket, og sitet bygger uanset.
//
// HVORFOR DEN SER I KOEEN FOERST
// Et kvarters tidsplan ville ellers starte 192 koersler i doegnet, og de
// fleste ville finde ingenting. Funktionen henter koe.json fra det
// offentlige repo og kalder kun GitHub, naar noget faktisk er forfaldent
// inden for vinduet. Kan den ikke hente koeen, kalder den alligevel — den
// fejler i retning af at publicere, ikke af at tie.
//
// REN JAVASCRIPT MED VILJE
// Netlify tager imod TypeScript, men saa kan funktionen ikke koeres og
// proeves lokalt uden en oversaetter. Denne fil koerer som den er, og
// publicering/test/netlify-udloeser.test.mjs proever logikken.
const EJER = 'KristianGG-dk';
const REPO = 'KristianGG-Hjemmeside';
const KOE = `https://raw.githubusercontent.com/${EJER}/${REPO}/main/publicering/koe.json`;

/** Samme vindue som motoren: krav.mjs, MAKS_FORSINKELSE_S. */
export const VINDUE_S = 24 * 60 * 60;

/** Kanal i koeen → haendelsen, workflowet lytter paa. */
export const HAENDELSER = {
  instagram: 'publicer-instagram',
  linkedin: 'publicer-linkedin',
  // Google kom til 2. november. Kanalen manglede, og det var ikke en
  // teoretisk mangel: det foerste motorstyrede opslag efter at udloeseren
  // kom i drift er element 53, gbp, 4. november kl. 09.00 — netop det,
  // handlingsknappen lige er sat paa. Uden denne linje ville det gaa ud,
  // naar GitHubs cron fandt tid.
  //
  // Facebook staar med vilje IKKE her: den planlaegges hos Meta med
  // scheduled_publish_time og rammer sit tidspunkt af sig selv.
  // Kanalen «website» heller ikke: den udkommer ved Netlifys genopbygning.
  gbp: 'publicer-google',
};

/**
 * Hjerteslaget.
 *
 * Problemet det loeser: naar der intet er forfaldent, goer udloeseren
 * ingenting — og det er umuligt at se forskel paa «intet var forfaldent» og
 * «udloeseren er doed». Hele november maaned har der ikke vaeret ét
 * repository_dispatch i koerselshistorikken, og det kunne betyde begge dele.
 *
 * Nu sender den et livstegn, naar den alligevel ikke har andet at lave.
 * udloeser-hjerteslag.yml tager imod og goer intet andet end at eksistere i
 * historikken. Dermed kan baade vagthunden og et menneske se udefra, at
 * Netlify koerer, at tokenet virker, og at GitHub tager imod.
 */
export const HJERTESLAG = 'udloeser-hjerteslag';

/**
 * Hoejst ét hjerteslag i timen. Funktionen koerer hvert kvarter, og uden
 * denne spaerre ville der komme 96 koersler i doegnet i stedet for 24.
 *
 * Afgoeres af uret, ikke af gemt tilstand: funktionen er statsloes, og et
 * kvarters tidsplan rammer det foerste kvarter af hver time præcis én gang.
 */
export function erHjerteslagstid(nu) {
  return new Date(nu * 1000).getUTCMinutes() < 15;
}

/** Hvilke kanaler har noget forfaldent inden for vinduet? */
export function forfaldneKanaler(koe, nu) {
  const ud = new Set();
  for (const p of koe) {
    if (!HAENDELSER[p.kanal] || p.metode !== 'motor') continue;
    const naar = Math.floor(new Date(p.tidspunkt).getTime() / 1000);
    if (Number.isNaN(naar)) continue;
    if (naar <= nu && nu - naar <= VINDUE_S) ud.add(p.kanal);
  }
  return ud;
}

/** Starter ét workflow. 204 er GitHubs svar, naar det lykkes. */
export async function udloes(token, haendelse, hent = fetch, fra = 'netlify') {
  const r = await hent(`https://api.github.com/repos/${EJER}/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    // «fra» foelger med, saa et livstegn kan kendes fra et, nogen har sendt
    // i haanden. Uden det ville en manuel proeve se ud som en fungerende
    // udloeser — og det skete under fejlsoegningen 2. november.
    body: JSON.stringify({ event_type: haendelse, client_payload: { fra } }),
  });
  if (r.status === 204) return `${haendelse}: startet`;

  // GitHubs afvisning skal kunne handles paa. 403 og 404 betyder i praksis
  // det samme her: tokenet naaede frem, men maa ikke dette. GitHub svarer
  // 404 frem for 403 paa et token uden adgang, saa man ikke kan afsoege,
  // hvilke repoer der findes.
  const krop = await r.text();
  const raad = (r.status === 403 || r.status === 404)
    ? ' — tokenet mangler rettigheden til at starte workflows paa dette repo.'
      + ' Et fine-grained token skal have BAADE «Contents: Read and write» og'
      + ' «Actions: Read and write» paa KristianGG-Hjemmeside.'
      + ' Se dokumentation/paalidelig-udloeser.md.'
    : r.status === 401
      ? ' — tokenet er ugyldigt eller udloebet. Opret et nyt og laeg det i Netlify.'
      : '';
  return `${haendelse}: GitHub svarede ${r.status} ${krop}${raad}`;
}

/**
 * Selve koerslen. Adskilt fra Netlifys indgang, saa den kan proeves med
 * attrapper for baade koeen og GitHub.
 */
export async function koer({ token, nu = Math.floor(Date.now() / 1000), hent = fetch, log = console.log } = {}) {
  if (!token) {
    log('GITHUB_DISPATCH_TOKEN mangler i Netlifys miljoevariabler. Intet startet.');
    log('Se dokumentation/paalidelig-udloeser.md for de fire trin.');
    return { startet: [], grund: 'intet token' };
  }

  let kanaler;
  try {
    const r = await hent(KOE, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`koe.json svarede ${r.status}`);
    kanaler = forfaldneKanaler(await r.json(), nu);
  } catch (err) {
    // Kan koeen ikke laeses, ved vi ikke, om noget er forfaldent. Saa startes
    // begge kanaler: motoren springer selv alt over, der ikke skal ud.
    log(`Kunne ikke laese koeen (${err.message}). Starter begge kanaler for en sikkerhed.`);
    kanaler = new Set(Object.keys(HAENDELSER));
  }

  if (!kanaler.size) {
    if (!erHjerteslagstid(nu)) {
      log('Intet forfaldent inden for vinduet. Intet startet.');
      return { startet: [], grund: 'intet forfaldent' };
    }
    const svar = await udloes(token, HJERTESLAG, hent);
    log(`Intet forfaldent. Livstegn sendt: ${svar}`);
    return { startet: [], hjerteslag: svar, grund: 'intet forfaldent, livstegn sendt' };
  }

  const svar = [];
  for (const k of [...kanaler].sort()) svar.push(await udloes(token, HAENDELSER[k], hent));
  for (const l of svar) log(l);
  return { startet: [...kanaler].sort(), svar };
}

/**
 * Renser tokenet, foer det bruges.
 *
 * En vaerdi indsat i en brugerflade baerer ofte usynligt skidt med: et
 * efterstillet linjeskift fra et klip, et mellemrum, eller anfoerselstegn
 * fordi det «saa ud som en streng». GitHub svarer 401 Bad credentials paa
 * alle tre, og fejlen ligner et udloebet token.
 *
 * Det er ikke en teori: udloeseren svarede netop 401 med et token, der var
 * lagt rigtigt ind. Rensningen koster intet og fjerner hele den
 * fejlkategori. Et rigtigt token indeholder hverken mellemrum eller
 * anfoerselstegn, saa der kan intet gaa tabt.
 */
export function rensToken(raa) {
  if (typeof raa !== 'string') return '';
  return raa.trim().replace(/^["']+|["']+$/g, '').trim();
}

export default async () => {
  const r = await koer({ token: rensToken(process.env.GITHUB_DISPATCH_TOKEN) });
  return new Response(r.svar?.join('\n') ?? r.grund, { status: 200 });
};

// Hvert kvarter. Vinduet er et doegn, saa dette handler ikke om at naa inden
// for en graense — det handler om at ramme taet paa det godkendte tidspunkt.
// Et opslag godkendt til kl. 08.00 gaar ud mellem 08.00 og 08.15.
export const config = {
  schedule: '*/15 * * * *',
};

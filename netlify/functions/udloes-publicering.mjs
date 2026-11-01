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
};

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
export async function udloes(token, haendelse, hent = fetch) {
  const r = await hent(`https://api.github.com/repos/${EJER}/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: haendelse }),
  });
  return r.status === 204
    ? `${haendelse}: startet`
    : `${haendelse}: GitHub svarede ${r.status} ${await r.text()}`;
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
    log('Intet forfaldent inden for vinduet. Intet startet.');
    return { startet: [], grund: 'intet forfaldent' };
  }

  const svar = [];
  for (const k of [...kanaler].sort()) svar.push(await udloes(token, HAENDELSER[k], hent));
  for (const l of svar) log(l);
  return { startet: [...kanaler].sort(), svar };
}

export default async () => {
  const r = await koer({ token: process.env.GITHUB_DISPATCH_TOKEN });
  return new Response(r.svar?.join('\n') ?? r.grund, { status: 200 });
};

// Hvert kvarter. Vinduet er et doegn, saa dette handler ikke om at naa inden
// for en graense — det handler om at ramme taet paa det godkendte tidspunkt.
// Et opslag godkendt til kl. 08.00 gaar ud mellem 08.00 og 08.15.
export const config = {
  schedule: '*/15 * * * *',
};

// Udloeserens tilstand — laest udefra, uden hemmeligheder.
//
// HVORFOR DEN FINDES
// Den planlagte funktion skriver kun i Netlifys egen log, som ingen laeser.
// Naar noget ikke virker, er det eneste spor en manglende koersel i GitHub,
// og den kan skyldes tre vidt forskellige ting:
//
//   1. miljoevariablen er ikke naaet ud til funktionen (manglende deploy)
//   2. tokenet er der, men maa ikke starte workflows
//   3. der var simpelthen intet forfaldent
//
// Denne funktion skiller de tre ad paa ét kald:
//
//   curl https://kristiangg.dk/.netlify/functions/udloeser-status
//
// DEN AFSLOERER INTET
// Tokenet laeses aldrig ud. Der svares kun ja/nej til, om variablen er sat,
// og hvor mange tegn den fylder — nok til at se «tom streng» eller «klistret
// med anfoerselstegn omkring», og for lidt til at vaere til nogen nytte.
//
// DEN SENDER INTET
// Ingen dispatch, ingen publicering, ingen aendring. Et rent opslag.
// Livstegnet sendes af den planlagte funktion, ikke herfra — et offentligt
// endepunkt, der kunne starte workflows, ville vaere en aaben doer.
import { forfaldneKanaler, VINDUE_S, HAENDELSER, HJERTESLAG, erHjerteslagstid, rensToken } from './udloes-publicering.mjs';

const EJER = 'KristianGG-dk';
const REPO = 'KristianGG-Hjemmeside';
const KOE = `https://raw.githubusercontent.com/${EJER}/${REPO}/main/publicering/koe.json`;

export default async () => {
  const nu = Math.floor(Date.now() / 1000);
  const raat = process.env.GITHUB_DISPATCH_TOKEN;
  const token = rensToken(raat);

  const svar = {
    tid: new Date().toISOString(),
    token_sat: Boolean(token),
    token_laengde: token ? token.length : 0,
    // Baerer den gemte vaerdi usynligt skidt? Et efterstillet linjeskift,
    // et mellemrum eller anfoerselstegn giver alle 401 Bad credentials og
    // ligner et udloebet token. Her ses det i stedet.
    token_raa_laengde: raat ? raat.length : 0,
    token_renset: Boolean(raat) && raat !== token,
    token_form: token
      ? (/^github_pat_/.test(token) ? 'fine-grained (github_pat_)'
        : /^ghp_/.test(token) ? 'klassisk (ghp_)'
        : 'ADVARSEL: ukendt form — hverken github_pat_ eller ghp_')
      : null,
    vindue_timer: VINDUE_S / 3600,
    hjerteslag_haendelse: HJERTESLAG,
    hjerteslag_naeste_koersel: erHjerteslagstid(nu),
  };

  // Kan tokenet overhovedet naa GitHub? Et rent opslag, intet skrives.
  if (token) {
    try {
      const r = await fetch(`https://api.github.com/repos/${EJER}/${REPO}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      svar.github_svarede = r.status;
      svar.token_genkendt = r.status === 200;
      if (r.status === 401) svar.token_bemaerkning = 'ugyldigt eller udloebet token';
      if (r.status === 404) svar.token_bemaerkning = 'tokenet kan ikke se dette repo — forkert Resource owner eller Repository access';
    } catch (err) {
      svar.github_svarede = null;
      svar.token_bemaerkning = `kunne ikke naa GitHub: ${err.message}`;
    }
  }

  // Hvad siger koeen?
  try {
    const r = await fetch(KOE, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`koe.json svarede ${r.status}`);
    const koe = await r.json();
    svar.koe_laest = true;
    svar.forfaldne_kanaler = [...forfaldneKanaler(koe, nu)].sort();
    const fremtid = koe
      .filter((p) => HAENDELSER[p.kanal] && p.metode === 'motor')
      .map((p) => p.tidspunkt)
      .filter((t) => new Date(t).getTime() / 1000 > nu)
      .sort();
    svar.naeste_paa_motorkanal = fremtid[0] ?? null;
  } catch (err) {
    svar.koe_laest = false;
    svar.koe_fejl = err.message;
  }

  if (svar.token_renset) {
    svar.token_bemaerkning = `vaerdien bar ${svar.token_raa_laengde - svar.token_laengde} tegn `
      + 'mellemrum, linjeskift eller anfoerselstegn. De er fjernet her, men ret den gerne i Netlify.';
  }

  svar.dom = !svar.token_sat
    ? 'GITHUB_DISPATCH_TOKEN er IKKE sat i denne funktions miljoe. Er den lagt ind i Netlify, mangler der et nyt deploy: miljoevariabler bages ind ved deploy og naar ikke en allerede udrullet funktion.'
    : svar.token_genkendt === false
      ? `Tokenet er sat (${svar.token_laengde} tegn, ${svar.token_form}), men GitHub svarede `
        + `${svar.github_svarede}. ${svar.token_bemaerkning ?? ''} `
        + (svar.github_svarede === 401
          ? 'Et 401 betyder, at GitHub ikke genkender legitimationen: den er udloebet, '
            + 'tilbagekaldt, eller vaerdien er ufuldstaendig. Opret et nyt token og indsaet det paa ny.'
          : '').trim()
      : svar.forfaldne_kanaler?.length
        ? `Noget er forfaldent (${svar.forfaldne_kanaler.join(', ')}) — naeste planlagte koersel starter det.`
        : 'Alt ser rigtigt ud. Intet er forfaldent lige nu, saa udloeseren sender kun livstegn.';

  return new Response(JSON.stringify(svar, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

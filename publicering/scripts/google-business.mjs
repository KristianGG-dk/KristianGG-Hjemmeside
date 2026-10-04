// Google Business Profile — faelles byggesten for fornyelse, adgangskontrol
// og publicering. Ingen sideeffekter ved import. Intet netvaerk uden at et
// kald udtrykkeligt bedes om, og alle netvaerkskald tager en udskiftelig
// `hent`, saa proeverne kan koere uden net og uden token.
//
// DE TRE API'ER (officielle, aktuelle)
//   OAuth          https://oauth2.googleapis.com/token
//   Konti          GET  mybusinessaccountmanagement.googleapis.com/v1/accounts
//   Lokationer     GET  mybusinessbusinessinformation.googleapis.com/v1/{accounts/*}/locations
//                  GET  mybusinessbusinessinformation.googleapis.com/v1/{locations/*}
//   Opslag         POST mybusiness.googleapis.com/v4/{accounts/*/locations/*}/localPosts
//
// Opslag (localPosts) findes stadig kun i v4. Konti og lokationer er flyttet
// til de nye v1-API'er. Alle kraever scopet business.manage og intet andet.
//
// DESTINATIONEN
// Kontoen kontakt@kristiangg.dk kan have adgang til flere profiler. Det goer
// dem ikke til maal. Der publiceres kun til den ENE lokation, der staar i
// GBP_TILLADT_LOKATION, og kun naar Google selv bekraefter, at tokenet kan se
// netop den lokation under netop den konto. Se pruvDestination og bevisLokation.

export const SCOPE = 'https://www.googleapis.com/auth/business.manage';
export const AUTH_ENDEPUNKT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDEPUNKT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDEPUNKT = 'https://oauth2.googleapis.com/revoke';
export const REDIRECT_URI = 'https://kristiangg.dk/oauth/google/callback/';
export const KONTI = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
export const INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
export const OPSLAG = 'https://mybusiness.googleapis.com/v4';

/** Sentinelvaerdien: destinationen er endnu ikke fastlaast. */
export const SENTINEL = 'AFVENTER';

/** accounts/{tal}/locations/{tal} — den eneste form, der accepteres. */
export const LOKATION_RX = /^accounts\/(\d+)\/locations\/(\d+)$/;

// Platformens graenser for et opslag. PLATFORM-regler, ikke lov.
//   - Teksten maa hoejst vaere 1500 tegn (Googles graense for et opslag)
//   - Google fjerner opslag med telefonnumre i teksten ("phone stuffing").
//     Ring-knappen bruger profilens verificerede nummer i stedet
//   - Billeder skal vaere JPG eller PNG
export const MAKS_TEGN = 1500;
// Danske numre skrives "12345678", "12 34 56 78", "1234 5678" eller med +45.
// Punktum er bevidst udeladt som skilletegn: "12.10.2026" er en dato.
const TELEFON_RX = /\+45[\s-]?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}|(?<![\d.,])(?:\d{8}|\d{2} \d{2} \d{2} \d{2}|\d{4} \d{4})(?![\d.,])/;
const BILLEDE_RX = /^https:\/\/kristiangg\.dk\/[^\s?#]+\.(?:jpe?g|png)$/i;

/** Kastes, naar destinationen ikke kan bevises. Egen type, saa den kendes. */
export class DestinationAfvist extends Error {
  constructor(m) { super(m); this.name = 'DestinationAfvist'; }
}
/** Kastes, naar adgangen mangler, er udloebet eller tilbagekaldt. */
export class AdgangAfvist extends Error {
  constructor(m) { super(m); this.name = 'AdgangAfvist'; }
}

/**
 * Fjerner alt, der ligner en hemmelighed, foer noget logges eller gemmes.
 * Kendte vaerdier fra miljoeet skrubbes ordret; desuden Googles kendte
 * tokenformer, saa ogsaa et token, vi ikke kender paa forhaand, fanges.
 */
export function skrub(s, env = process.env) {
  let t = String(s);
  const kendte = ['GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_AUTH_CODE', 'GH_SECRET_MANAGER_TOKEN']
    .map((n) => (env[n] ?? '').trim()).filter((v) => v.length >= 6);
  for (const h of kendte) t = t.split(h).join('«udeladt»');
  return t
    .replace(/("(?:access|refresh|id)_token"\s*:\s*")[^"]+/g, '$1«udeladt»')
    .replace(/((?:access|refresh)_token=)[^&\s"]+/g, '$1«udeladt»')
    .replace(/ya29\.[\w.-]+/g, '«udeladt»')
    .replace(/1\/\/[\w.-]{20,}/g, '«udeladt»')
    .replace(/GOCSPX-[\w-]+/g, '«udeladt»')
    .replace(/4\/[\w.-]{20,}/g, '«udeladt»')
    .replace(/(Bearer\s+)\S+/gi, '$1«udeladt»');
}

/** Et id vises aldrig helt i loggen. Repoet er offentligt. */
export const maskId = (navn) => String(navn).replace(/\d{5,}/g, (d) => `${d.slice(0, 2)}…${d.slice(-2)}`);

const noedvendig = (env, navn) => {
  const v = (env[navn] ?? '').trim();
  if (!v) throw new AdgangAfvist(`${navn} mangler. Der publiceres ikke. Se dokumentation/google-business-profile.md.`);
  return v;
};

// ── Destinationen ───────────────────────────────────────────────────────────

/**
 * Kontrol 1-3: vores egen konfiguration. Ingen netvaerk, ingen token.
 * Returnerer { konto, lokation, navn } for den ENE tilladte lokation.
 */
export function pruvDestination(env = process.env) {
  const tilladt = (env.GBP_TILLADT_LOKATION ?? '').trim();
  const maal = (env.GBP_LOKATION ?? '').trim();
  if (!tilladt) throw new DestinationAfvist('GBP_TILLADT_LOKATION mangler. Uden en eksplicit tilladt destination publiceres der ikke.');
  if (tilladt === SENTINEL) {
    throw new DestinationAfvist(`GBP_TILLADT_LOKATION staar paa ${SENTINEL} og er ikke fastlaast. Koer "Forny Google-adgang" med handlingen bootstrap.`);
  }
  if (!maal) throw new DestinationAfvist('GBP_LOKATION mangler.');
  if (maal !== tilladt) throw new DestinationAfvist('GBP_LOKATION svarer ikke til GBP_TILLADT_LOKATION. Destinationen er aendret siden den blev fastlaast.');
  const m = tilladt.match(LOKATION_RX);
  if (!m) throw new DestinationAfvist('GBP_TILLADT_LOKATION har ikke formen accounts/{tal}/locations/{tal}.');
  return { navn: tilladt, konto: `accounts/${m[1]}`, lokation: `locations/${m[2]}` };
}

async function gJson(hent, url, valg = {}) {
  let r;
  try {
    r = await hent(url, valg);
  } catch (err) {
    throw new AdgangAfvist(`netvaerksfejl mod Google: ${skrub(err.message)}`);
  }
  const svar = await r.json().catch(() => ({}));
  return { r, svar };
}

/** Googles fejlobjekt som én kort, skrubbet linje. */
const gFejl = (r, svar) => `${r.status} ${skrub(svar?.error?.status ?? '')} ${skrub(svar?.error?.message ?? svar?.error_description ?? svar?.error ?? '')}`.replace(/\s+/g, ' ').trim();

/**
 * Henter alle sider af et list-kald. Stopper efter 20 sider, saa en fejl hos
 * Google ikke kan holde os i en uendelig loekke.
 */
async function alleSider(hent, url, token, felt) {
  const ud = [];
  let side = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(url);
    if (side) u.searchParams.set('pageToken', side);
    const { r, svar } = await gJson(hent, u, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new AdgangAfvist(`Google afviste adgangen (${gFejl(r, svar)}). Er API'et aktiveret, og er adgangen tilbagekaldt?`);
      throw new AdgangAfvist(`Google svarede ${gFejl(r, svar)}`);
    }
    ud.push(...(svar[felt] ?? []));
    side = svar.nextPageToken;
    if (!side) return ud;
  }
  throw new AdgangAfvist('for mange sider i svaret fra Google — stoppet');
}

/**
 * Alle lokationer, tokenet kan se, paa tvaers af konti. Bruges KUN ved
 * bootstrap og i adgangskontrollen — aldrig til at vaelge et maal ved
 * publicering.
 */
export async function findLokationer(token, hent = fetch) {
  const konti = await alleSider(hent, `${KONTI}?pageSize=20`, token, 'accounts');
  const ud = [];
  for (const k of konti) {
    const u = `${INFO}/${k.name}/locations?pageSize=100&readMask=name,title,websiteUri,storefrontAddress`;
    const lok = await alleSider(hent, u, token, 'locations');
    for (const l of lok) {
      const id = String(l.name ?? '').replace(/^locations\//, '');
      if (!/^\d+$/.test(id)) continue;
      ud.push({
        navn: `${k.name}/locations/${id}`,
        titel: l.title ?? null,
        website: l.websiteUri ?? null,
        by: l.storefrontAddress?.locality ?? null,
        konto: k.accountName ?? null,
        kontotype: k.type ?? null,
      });
    }
  }
  return ud;
}

/**
 * Kontrol 4: Google bekraefter, at tokenet kan se netop den tilladte lokation
 * under netop den tilladte konto. Det er den eneste kontrol, der ikke kan
 * snydes ved at rette en hemmelighed: de oevrige laeser vores egen
 * konfiguration, denne spoerger Google.
 */
export async function bevisLokation(token, dest, hent = fetch) {
  const u = `${INFO}/${dest.lokation}?readMask=name,title,websiteUri`;
  const { r, svar } = await gJson(hent, u, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404 || r.status === 403) {
    throw new DestinationAfvist(`Tokenet kan ikke se den fastlaaste lokation (${r.status}). Adgangen er fjernet, eller lokationen er en anden.`);
  }
  if (!r.ok) throw new AdgangAfvist(`Lokationen kunne ikke aflaeses: ${gFejl(r, svar)}`);
  if (svar.name !== dest.lokation) {
    throw new DestinationAfvist('Google svarede med en anden lokation end den fastlaaste.');
  }
  // Lokationen skal ligge under den fastlaaste konto, ikke blot vaere synlig.
  const liste = await alleSider(hent, `${INFO}/${dest.konto}/locations?pageSize=100&readMask=name`, token, 'locations');
  if (!liste.some((l) => l.name === dest.lokation)) {
    throw new DestinationAfvist('Lokationen ligger ikke under den fastlaaste konto.');
  }
  return { titel: svar.title ?? null, website: svar.websiteUri ?? null };
}

// ── Adgangen ────────────────────────────────────────────────────────────────

/**
 * Bytter refresh token til et kortlivet access token (ca. en time). Access
 * tokenet gemmes ALDRIG — det hentes frisk i hver koersel og doer med den.
 */
export async function hentAdgang(env = process.env, hent = fetch) {
  const krop = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: noedvendig(env, 'GBP_REFRESH_TOKEN'),
    client_id: noedvendig(env, 'GBP_CLIENT_ID'),
    client_secret: noedvendig(env, 'GBP_CLIENT_SECRET'),
  });
  const { r, svar } = await gJson(hent, TOKEN_ENDEPUNKT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: krop,
  });
  if (!r.ok) {
    const hvorfor = svar?.error === 'invalid_grant'
      ? 'Refresh tokenet er udloebet eller tilbagekaldt. Gennemfoer autorisationen igen paa https://kristiangg.dk/oauth/google/ og koer "Forny Google-adgang" med handlingen forny.'
      : svar?.error === 'invalid_client'
        ? 'Client ID eller client secret er forkert (GBP_CLIENT_ID / GBP_CLIENT_SECRET).'
        : 'Google afviste fornyelsen.';
    throw new AdgangAfvist(`${hvorfor} (${gFejl(r, svar)})`);
  }
  if (!svar.access_token) throw new AdgangAfvist('Google svarede uden access_token.');
  const scopes = String(svar.scope ?? '').split(/\s+/);
  if (svar.scope && !scopes.includes(SCOPE)) {
    throw new AdgangAfvist(`Tokenet mangler scopet ${SCOPE}. Gennemfoer autorisationen igen.`);
  }
  if (env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${svar.access_token}`);
  return svar.access_token;
}

// ── Opslaget ────────────────────────────────────────────────────────────────

/**
 * Platformens krav til den laaste version. Kaster med en liste over alt,
 * der ikke holder. Intet rettes — et opslag, der ikke kan sendes ordret,
 * sendes ikke.
 */
export function kontrollerOpslag(e) {
  const fejl = [];
  if (e.kanal !== 'gbp') fejl.push(`kanal er ${e.kanal}, ikke gbp`);
  if (typeof e.tekst !== 'string' || !e.tekst.trim()) fejl.push('ingen tekst i laasen');
  else {
    if ([...e.tekst].length > MAKS_TEGN) fejl.push(`teksten er ${[...e.tekst].length} tegn; Google tillader hoejst ${MAKS_TEGN}`);
    if (TELEFON_RX.test(e.tekst)) fejl.push('teksten indeholder et telefonnummer; Google fjerner saadanne opslag');
  }
  if (e.billede_url != null && !BILLEDE_RX.test(e.billede_url)) {
    fejl.push('billede_url skal vaere en https-adresse paa kristiangg.dk og ende paa .jpg, .jpeg eller .png');
  }
  if (!Array.isArray(e.links)) fejl.push('links skal vaere en liste');
  else if (e.links.length > 1) fejl.push(`et opslag kan kun have én knap, men laasen har ${e.links.length} links`);
  else if (e.links.length === 1 && !/^https:\/\//.test(e.links[0])) fejl.push('linket skal vaere https');
  if (fejl.length) throw new Error(fejl.join('; '));
}

/**
 * Bygger det, der sendes. Intet sammensaettes eller omskrives — alt kommer
 * ordret fra laasen. Et laast link bliver til knappen "Learn more".
 */
export function byggOpslag(e) {
  kontrollerOpslag(e);
  const krop = { languageCode: 'da', topicType: 'STANDARD', summary: e.tekst };
  if (e.billede_url) krop.media = [{ mediaFormat: 'PHOTO', sourceUrl: e.billede_url }];
  if (e.links.length === 1) krop.callToAction = { actionType: 'LEARN_MORE', url: e.links[0] };
  return krop;
}

/**
 * Sender opslaget. Returnerer { name, state, searchUrl }.
 * Et netvaerksbrud efter afsendelse giver et uvist udfald; kalderen skal
 * behandle det som "se efter, foer der proeves igen".
 */
export async function sendOpslag(token, dest, krop, hent = fetch) {
  const url = `${OPSLAG}/${dest.navn}/localPosts`;
  let r;
  try {
    r = await hent(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(krop),
    });
  } catch (err) {
    const e = new Error(`netvaerksfejl under afsendelse: ${skrub(err.message)}`);
    e.uvist = true;
    throw e;
  }
  const svar = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Google afviste opslaget: ${gFejl(r, svar)}`);
    e.uvist = r.status >= 500;
    throw e;
  }
  if (!svar.name) {
    const e = new Error('Google svarede uden navn paa opslaget');
    e.uvist = true;
    throw e;
  }
  return { name: svar.name, state: svar.state ?? null, searchUrl: svar.searchUrl ?? null };
}

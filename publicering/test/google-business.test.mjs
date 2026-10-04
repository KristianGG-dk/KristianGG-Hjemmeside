// Proever Google Business Profile-kanalen. Intet netvaerk, intet rigtigt
// token, ingen publicering: Google erstattes af en attrap, og GitHub roeres
// slet ikke.
//
//   node publicering/test/google-business.test.mjs
//
// Kanalen skal FAIL CLOSED. Derfor proever filen foerst og fremmest det, der
// SKAL afvises. Falske tokens bygges stykvis, saa hemmelighedsscanningen
// ikke fanger selve proeven.

import {
  pruvDestination, hentAdgang, bevisLokation, findLokationer, kontrollerOpslag, byggOpslag,
  sendOpslag, skrub, maskId, DestinationAfvist, AdgangAfvist, SCOPE,
} from '../scripts/google-business.mjs';
import { udvaelg, koer, MAKS_FORSINKELSE_S } from '../scripts/publicer-google.mjs';
import { pruvKode, byt, beskrivSvar, vaelgVedBootstrap } from '../scripts/forny-google-token.mjs';
import { scanTekst } from '../scripts/hemmelighedsscan.mjs';
import { beregnLaas, sha256 } from '../scripts/laas.mjs';

let bestaaet = 0, fejlet = 0;
const ok = (navn) => { console.log(`   ok   ${navn}`); bestaaet++; };
const nej = (navn, m) => { console.log(`  FEJL  ${navn} — ${m}`); fejlet++; };

async function afvises(navn, fn, type, stump) {
  try {
    await fn();
    nej(navn, 'blev IKKE afvist');
  } catch (e) {
    if (type && !(e instanceof type)) return nej(navn, `forkert fejltype: ${e.name}: ${e.message}`);
    if (stump && !e.message.includes(stump)) return nej(navn, `uventet besked: ${e.message}`);
    ok(navn);
  }
}
async function godtages(navn, fn) {
  try { await fn(); ok(navn); } catch (e) { nej(navn, `blev afvist: ${e.message}`); }
}
const sandt = (navn, b, m = '') => (b ? ok(navn) : nej(navn, m || 'forventning ikke opfyldt'));

// ── Attrapper ───────────────────────────────────────────────────────────────

const FALSK_REFRESH = '1/' + '/0' + 'g'.repeat(60);
const FALSK_ACCESS = 'ya' + '29.' + 'a'.repeat(60);
const FALSK_SECRET = 'GOC' + 'SPX-' + 's'.repeat(28);
const KONTO = 'accounts/111222333';
const LOK = 'locations/444555666';
const NAVN = `${KONTO}/${LOK}`;
const DEST = { navn: NAVN, konto: KONTO, lokation: LOK };

const MILJOE = {
  GBP_CLIENT_ID: '123-abc.apps.googleusercontent.com',
  GBP_CLIENT_SECRET: FALSK_SECRET,
  GBP_REFRESH_TOKEN: FALSK_REFRESH,
  GBP_TILLADT_LOKATION: NAVN,
  GBP_LOKATION: NAVN,
};

const svar = (status, krop) => ({ ok: status >= 200 && status < 300, status, json: async () => krop });

/**
 * En falsk Google. Ruter efter URL. `kald` husker alt, saa proeverne kan se,
 * om der blev forsoegt at sende et opslag.
 */
function falskGoogle(over = {}) {
  const kald = [];
  const hent = async (url, valg = {}) => {
    const u = String(url);
    kald.push({ url: u, metode: valg.method ?? 'GET', body: valg.body });
    if (over[u.split('?')[0]]) return over[u.split('?')[0]](u, valg);
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return svar(200, { access_token: FALSK_ACCESS, expires_in: 3599, scope: SCOPE, token_type: 'Bearer' });
    }
    if (u.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
      return svar(200, { accounts: [{ name: KONTO, accountName: 'Kristian GG', type: 'PERSONAL' }] });
    }
    if (u.startsWith(`https://mybusinessbusinessinformation.googleapis.com/v1/${KONTO}/locations`)) {
      return svar(200, { locations: [{ name: LOK, title: 'Kristian GG', websiteUri: 'https://kristiangg.dk/' }] });
    }
    if (u.startsWith(`https://mybusinessbusinessinformation.googleapis.com/v1/${LOK}`)) {
      return svar(200, { name: LOK, title: 'Kristian GG', websiteUri: 'https://kristiangg.dk/' });
    }
    if (u.startsWith(`https://mybusiness.googleapis.com/v4/${NAVN}/localPosts`)) {
      return svar(200, { name: `${NAVN}/localPosts/987`, state: 'LIVE', searchUrl: 'https://local.google.com/x' });
    }
    return svar(404, { error: { status: 'NOT_FOUND', message: 'ukendt i attrappen' } });
  };
  return { hent, kald, sendte: () => kald.filter((k) => k.metode === 'POST' && k.url.includes('/localPosts')) };
}

// ── Et godkendt Google-element ──────────────────────────────────────────────

function element(over = {}) {
  const tekst = over.tekst ?? 'Jeg holder åbent hus lørdag den 12.10.2026 kl. 10.00. Kom forbi.';
  const e = {
    element: 900, kanal: 'gbp', titel: 'Testopslag', meta_description: 'Testopslag',
    slug: 'element-900-test-gbp', slut_url: '(gbp-opslag, ingen URL foer publicering)',
    dato: '2026-10-07T09:00:00.000+02:00', kategorier: ['test'], billede: 'skovsti',
    alt_tekst: 'Skovsti', billede_url: 'https://kristiangg.dk/images/natur/skovsti-640.jpg',
    links: ['https://kristiangg.dk/priser/'], cta: 'Learn more', hashtags: [],
    tekst, tekst_sha256: sha256(tekst), brodtekst_sha256: sha256(tekst),
    godkendt_af: 'TESTFIXTUR', godkendt_dato: '2026-10-04',
    ...over,
  };
  if (!('versionslaas' in over)) e.versionslaas = beregnLaas(e).laas;
  return e;
}
const STI = 'publicering/laase/element-900.json';
const koePost = (over = {}) => ({ element: 900, kanal: 'gbp', tidspunkt: '2026-10-07T09:00:00.000+02:00', metode: 'motor', laasefil: STI, url: null, ...over });
const FORFALD = Math.floor(new Date('2026-10-07T09:00:00.000+02:00').getTime() / 1000);
const data = (o = {}) => ({ laase: [{ sti: STI, e: o.e ?? element() }], koe: o.koe ?? [koePost()], register: o.register ?? [] });

// ════════════════════════════════════════════════════════════════════════════
console.log('\nDestinationen — egen konfiguration (kontrol 1-3)\n');

await afvises('intet GBP_TILLADT_LOKATION', () => pruvDestination({ GBP_LOKATION: NAVN }), DestinationAfvist);
await afvises('GBP_TILLADT_LOKATION staar paa AFVENTER', () => pruvDestination({ GBP_TILLADT_LOKATION: 'AFVENTER', GBP_LOKATION: NAVN }), DestinationAfvist, 'bootstrap');
await afvises('intet GBP_LOKATION', () => pruvDestination({ GBP_TILLADT_LOKATION: NAVN }), DestinationAfvist);
await afvises('destination aendret efter fastlaasning', () => pruvDestination({ GBP_TILLADT_LOKATION: NAVN, GBP_LOKATION: `${KONTO}/locations/1` }), DestinationAfvist);
await afvises('forkert form (kun locations/…)', () => pruvDestination({ GBP_TILLADT_LOKATION: LOK, GBP_LOKATION: LOK }), DestinationAfvist);
await afvises('forkert form (stinavn smuglet ind)', () => pruvDestination({ GBP_TILLADT_LOKATION: `${NAVN}/../x`, GBP_LOKATION: `${NAVN}/../x` }), DestinationAfvist);
await godtages('den fastlaaste lokation', () => {
  const d = pruvDestination(MILJOE);
  if (d.konto !== KONTO || d.lokation !== LOK) throw new Error(JSON.stringify(d));
});

console.log('\nDestinationen — Google bekraefter (kontrol 4)\n');

await afvises('Google kender ikke lokationen (404)', () => bevisLokation(FALSK_ACCESS, DEST, falskGoogle({
  [`https://mybusinessbusinessinformation.googleapis.com/v1/${LOK}`]: () => svar(404, { error: { status: 'NOT_FOUND' } }),
}).hent), DestinationAfvist);
await afvises('tokenet har mistet adgangen til lokationen (403)', () => bevisLokation(FALSK_ACCESS, DEST, falskGoogle({
  [`https://mybusinessbusinessinformation.googleapis.com/v1/${LOK}`]: () => svar(403, { error: { status: 'PERMISSION_DENIED' } }),
}).hent), DestinationAfvist);
await afvises('Google svarer med en anden lokation', () => bevisLokation(FALSK_ACCESS, DEST, falskGoogle({
  [`https://mybusinessbusinessinformation.googleapis.com/v1/${LOK}`]: () => svar(200, { name: 'locations/1', title: 'Anden' }),
}).hent), DestinationAfvist);
await afvises('lokationen ligger ikke under den fastlaaste konto', () => bevisLokation(FALSK_ACCESS, DEST, falskGoogle({
  [`https://mybusinessbusinessinformation.googleapis.com/v1/${KONTO}/locations`]: () => svar(200, { locations: [{ name: 'locations/1' }] }),
}).hent), DestinationAfvist);
await afvises('netvaerket svigter', () => bevisLokation(FALSK_ACCESS, DEST, async () => { throw new Error('ECONNRESET'); }), AdgangAfvist);
await godtages('Google bekraefter den fastlaaste lokation', () => bevisLokation(FALSK_ACCESS, DEST, falskGoogle().hent));

console.log('\nAdgangen — refresh token til access token\n');

for (const mangler of ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN']) {
  await afvises(`${mangler} mangler`, () => hentAdgang({ ...MILJOE, [mangler]: '' }, falskGoogle().hent), AdgangAfvist, mangler);
}
await afvises('refresh tokenet er tilbagekaldt eller udloebet (invalid_grant)', () => hentAdgang(MILJOE, falskGoogle({
  'https://oauth2.googleapis.com/token': () => svar(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
}).hent), AdgangAfvist, 'kristiangg.dk/oauth/google');
await afvises('forkert client secret (invalid_client)', () => hentAdgang(MILJOE, falskGoogle({
  'https://oauth2.googleapis.com/token': () => svar(401, { error: 'invalid_client' }),
}).hent), AdgangAfvist, 'GBP_CLIENT_SECRET');
await afvises('tokenet mangler business.manage', () => hentAdgang(MILJOE, falskGoogle({
  'https://oauth2.googleapis.com/token': () => svar(200, { access_token: FALSK_ACCESS, scope: 'openid' }),
}).hent), AdgangAfvist, 'scopet');
await afvises('Google svarer uden access_token', () => hentAdgang(MILJOE, falskGoogle({
  'https://oauth2.googleapis.com/token': () => svar(200, { scope: SCOPE }),
}).hent), AdgangAfvist);
await afvises('netvaerket svigter ved fornyelse', () => hentAdgang(MILJOE, async () => { throw new Error('ETIMEDOUT'); }), AdgangAfvist);
await godtages('fornyelsen giver et access token og sender refresh tokenet korrekt', async () => {
  const g = falskGoogle();
  const t = await hentAdgang(MILJOE, g.hent);
  if (t !== FALSK_ACCESS) throw new Error('forkert token');
  const body = new URLSearchParams(String(g.kald[0].body));
  if (body.get('grant_type') !== 'refresh_token' || body.get('refresh_token') !== FALSK_REFRESH) throw new Error('forkert krop');
});

console.log('\nIngen laekager\n');

await godtages('Googles fejlsvar med ekko af hemmeligheder skrubbes', async () => {
  try {
    await hentAdgang(MILJOE, falskGoogle({
      'https://oauth2.googleapis.com/token': () => svar(400, { error: 'invalid_request', error_description: `bad ${FALSK_REFRESH} ${FALSK_SECRET} ${FALSK_ACCESS}` }),
    }).hent);
    throw new Error('blev ikke afvist');
  } catch (e) {
    for (const h of [FALSK_REFRESH, FALSK_SECRET, FALSK_ACCESS]) if (e.message.includes(h)) throw new Error('hemmelighed i fejlbeskeden');
  }
});
await godtages('skrub fjerner ukendte tokens af kendt form', () => {
  const t = skrub(`{"access_token":"x123","refresh_token":"y456"} Bearer abc ${FALSK_ACCESS} 4/0Ab${'c'.repeat(30)}`, {});
  if (/x123|y456|abc|ya29|4\/0Ab/.test(t)) throw new Error(t);
});
await godtages('id\'er afkortes i loggen', () => {
  if (maskId(NAVN).includes('111222333') || maskId(NAVN).includes('444555666')) throw new Error(maskId(NAVN));
});
await godtages('hemmelighedsscan fanger alle kendte former', () => {
  const t = [FALSK_SECRET, FALSK_REFRESH, FALSK_ACCESS, '"client_' + 'secret": "' + 'z'.repeat(20) + '"',
    'github_' + 'pat_' + 'q'.repeat(40), 'gh' + 'p_' + 'w'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----'].join('\n');
  const fund = scanTekst('x', t);
  if (fund.length !== 7) throw new Error(`fandt ${fund.length} af 7`);
  if (JSON.stringify(fund).includes(FALSK_SECRET)) throw new Error('vaerdien er med i fundet');
});
await godtages('hemmelighedsscan fanger ikke almindelig tekst', () => {
  const fund = scanTekst('x', 'GBP_CLIENT_SECRET mangler. ya29 er et praefiks. https://kristiangg.dk/oauth/google/ 1/2 kop');
  if (fund.length) throw new Error(JSON.stringify(fund));
});

console.log('\nPlatformens krav til opslaget\n');

await afvises('over 1500 tegn', () => kontrollerOpslag(element({ tekst: 'a'.repeat(1501) })), Error, '1500');
await afvises('telefonnummer i teksten (12 34 56 78)', () => kontrollerOpslag(element({ tekst: 'Ring 12 34 56 78' })), Error, 'telefon');
await afvises('telefonnummer i teksten (+45 12345678)', () => kontrollerOpslag(element({ tekst: 'Ring +45 12345678' })), Error, 'telefon');
await afvises('billede i webp', () => kontrollerOpslag(element({ billede_url: 'https://kristiangg.dk/images/natur/skovsti-640.webp' })), Error, 'billede');
await afvises('billede fra et andet domaene', () => kontrollerOpslag(element({ billede_url: 'https://example.com/a.jpg' })), Error, 'billede');
await afvises('to links, men kun én knap', () => kontrollerOpslag(element({ links: ['https://kristiangg.dk/a/', 'https://kristiangg.dk/b/'] })), Error, 'knap');
await afvises('forkert kanal', () => kontrollerOpslag(element({ kanal: 'facebook' })), Error, 'kanal');
await godtages('dato, klokkeslaet og postnummer er ikke et telefonnummer', () => kontrollerOpslag(element({ tekst: 'Lørdag 12.10.2026 kl. 10.00–16.30, Lumbyvej 17F, 5000 Odense C. 20.000 gange.' })));
await godtages('opslaget bygges ordret fra laasen', () => {
  const e = element();
  const k = byggOpslag(e);
  if (k.summary !== e.tekst || k.topicType !== 'STANDARD' || k.languageCode !== 'da') throw new Error(JSON.stringify(k));
  if (k.media?.[0]?.sourceUrl !== e.billede_url || k.media[0].mediaFormat !== 'PHOTO') throw new Error('billede');
  if (k.callToAction?.actionType !== 'LEARN_MORE' || k.callToAction.url !== e.links[0]) throw new Error('knap');
});
await godtages('uden link: ingen knap', () => {
  if ('callToAction' in byggOpslag(element({ links: [] }))) throw new Error('knap opfundet');
});

console.log('\nUdvaelgelsen — godkendelse, laas, koe og tid\n');

const grund = (r) => r.sprunget.map(([, g]) => g).join(' | ');
const ingen = (navn, r, stump) => sandt(navn, r.valgt.length === 0 && grund(r).includes(stump), grund(r) || 'blev valgt');
ingen('koeen siger manuel', udvaelg({ ...data({ koe: [koePost({ metode: 'manuel' })] }), nu: FORFALD + 60 }), 'manuel');
ingen('ingen koepost', udvaelg({ ...data({ koe: [] }), nu: FORFALD + 60 }), '0 gbp-poster');
ingen('koeen peger paa en anden laasefil', udvaelg({ ...data({ koe: [koePost({ laasefil: 'publicering/laase/element-901.json' })] }), nu: FORFALD + 60 }), 'peger paa');
ingen('koeens tidspunkt er ikke den godkendte dato', udvaelg({ ...data({ koe: [koePost({ tidspunkt: '2026-10-06T09:00:00.000+02:00' })] }), nu: FORFALD + 60 }), 'godkendte dato');
ingen('teksten er aendret efter godkendelsen', udvaelg({ ...data({ e: { ...element(), tekst: 'Noget andet' } }), nu: FORFALD + 60 }), 'hash');
ingen('versionslaasen afviger', udvaelg({ ...data({ e: element({ versionslaas: '0000000000000000' }) }), nu: FORFALD + 60 }), 'versionslaas');
ingen('ingen godkendelse', udvaelg({ ...data({ e: element({ godkendt_af: null }) }), nu: FORFALD + 60 }), 'godkendelse');
ingen('platformskrav brudt', udvaelg({ ...data({ e: element({ tekst: 'Ring 12345678' }) }), nu: FORFALD + 60 }), 'telefon');
ingen('tidspunktet er ikke naaet', udvaelg({ ...data(), nu: FORFALD - 60 }), 'forfalder foerst');
ingen('over et doegn for sent', udvaelg({ ...data(), nu: FORFALD + MAKS_FORSINKELSE_S + 60 }), 'over et doegn');
ingen('allerede publiceret', udvaelg({ ...data({ register: [{ element: 900, status: 'PUBLICERET' }] }), nu: FORFALD + 60 }), 'PUBLICERET');
ingen('seneste forsoeg fejlede', udvaelg({ ...data({ register: [{ element: 900, status: 'PUBLICERING FEJLET' }] }), nu: FORFALD + 60 }), 'fejlede');
sandt('andre kanaler roeres ikke', udvaelg({ laase: [{ sti: STI, e: element({ kanal: 'instagram' }) }], koe: [], register: [], nu: FORFALD + 60 }).valgt.length === 0);
sandt('godkendt, laast, i koeen og forfaldent: vaelges', udvaelg({ ...data({ register: [{ element: 900, status: 'AFVENTER DATO' }] }), nu: FORFALD + 60 }).valgt.length === 1);

console.log('\nKoerslen — fail closed foer afsendelse\n');

const stille = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

await godtages('toerloeb uden adgang: intet netvaerk, intet sendt', async () => {
  const g = falskGoogle();
  const r = await stille(() => koer({ toerloeb: true, env: {}, hent: g.hent, nu: FORFALD + 60, data: data() }));
  if (g.kald.length) throw new Error(`${g.kald.length} kald`);
  if (r.length !== 1 || !r[0].toerloeb) throw new Error(JSON.stringify(r));
});
await godtages('toerloeb med adgang: destinationen proeves, intet sendt', async () => {
  const g = falskGoogle();
  await stille(() => koer({ toerloeb: true, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() }));
  if (g.sendte().length) throw new Error('opslag sendt i toerloeb');
  if (!g.kald.some((k) => k.url.includes(LOK))) throw new Error('destinationen blev ikke proevet');
});
for (const [navn, env, type] of [
  ['publicering uden refresh token', { ...MILJOE, GBP_REFRESH_TOKEN: '' }, AdgangAfvist],
  ['publicering uden fastlaast destination', { ...MILJOE, GBP_TILLADT_LOKATION: 'AFVENTER' }, DestinationAfvist],
  ['publicering med aendret destination', { ...MILJOE, GBP_LOKATION: `${KONTO}/locations/1` }, DestinationAfvist],
]) {
  const g = falskGoogle();
  await afvises(navn, () => stille(() => koer({ toerloeb: false, env, hent: g.hent, nu: FORFALD + 60, data: data() })), type);
  sandt(`  … og intet opslag er sendt`, g.sendte().length === 0);
}
{
  const g = falskGoogle({ 'https://oauth2.googleapis.com/token': () => svar(400, { error: 'invalid_grant' }) });
  await afvises('publicering med tilbagekaldt adgang', () => stille(() => koer({ toerloeb: false, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() })), AdgangAfvist);
  sandt('  … og intet opslag er sendt', g.sendte().length === 0);
}
{
  const g = falskGoogle({ [`https://mybusinessbusinessinformation.googleapis.com/v1/${LOK}`]: () => svar(403, { error: { status: 'PERMISSION_DENIED' } }) });
  await afvises('publicering til en lokation, tokenet ikke kan se', () => stille(() => koer({ toerloeb: false, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() })), DestinationAfvist);
  sandt('  … og intet opslag er sendt', g.sendte().length === 0);
}

console.log('\nKoerslen — afsendelse og fejl\n');

await godtages('alt holder: publiceret, registreres med Googles id', async () => {
  const g = falskGoogle();
  const [r] = await stille(() => koer({ toerloeb: false, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() }));
  if (r.status !== 'PUBLICERET' || r.post_id !== '987' || r.kanal !== 'gbp') throw new Error(JSON.stringify(r));
  if (g.sendte().length !== 1) throw new Error('ikke praecis ét opslag');
  const krop = JSON.parse(g.sendte()[0].body);
  if (krop.summary !== element().tekst) throw new Error('teksten blev aendret undervejs');
  if (JSON.stringify(r).includes(FALSK_ACCESS)) throw new Error('token i registerposten');
});
await godtages('Google afviser (400): fejlet, ikke uvist', async () => {
  const g = falskGoogle({ [`https://mybusiness.googleapis.com/v4/${NAVN}/localPosts`]: () => svar(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad' } }) });
  const [r] = await stille(() => koer({ toerloeb: false, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() }));
  if (r.status !== 'PUBLICERING FEJLET' || r.noter) throw new Error(JSON.stringify(r));
});
await godtages('Google fejler (500): uvist udfald, se efter foer nyt forsoeg', async () => {
  const g = falskGoogle({ [`https://mybusiness.googleapis.com/v4/${NAVN}/localPosts`]: () => svar(503, { error: { status: 'UNAVAILABLE' } }) });
  const [r] = await stille(() => koer({ toerloeb: false, env: MILJOE, hent: g.hent, nu: FORFALD + 60, data: data() }));
  if (r.status !== 'PUBLICERING FEJLET' || !/uvist/i.test(r.noter ?? '')) throw new Error(JSON.stringify(r));
});
await godtages('netvaerksbrud under afsendelse: uvist udfald', async () => {
  const e = await sendOpslag(FALSK_ACCESS, DEST, byggOpslag(element()), async () => { throw new Error('socket hang up'); }).catch((x) => x);
  if (!e.uvist) throw new Error('ikke markeret uvist');
});

console.log('\nFoerstegangsautorisation\n');

const opsaet = (ekstra = {}) => Object.assign(process.env, {
  GBP_AUTH_CODE: '4/0A' + 'k'.repeat(70), GBP_CLIENT_ID: MILJOE.GBP_CLIENT_ID, GBP_CLIENT_SECRET: FALSK_SECRET,
}, ekstra);

await afvises('pladsholder i stedet for kode', () => pruvKode('venter'), Error, 'pladsholderen');
await afvises('halv kode', () => pruvKode('4/0Ab'), Error, 'tegn');
opsaet();
await afvises('Google giver intet refresh token', () => byt(async () => svar(200, { access_token: FALSK_ACCESS, scope: SCOPE })), Error, 'refresh token');
await afvises('brugeren fravalgte Business Profile i samtykket', () => byt(async () => svar(200, { access_token: FALSK_ACCESS, refresh_token: FALSK_REFRESH, scope: 'openid' })), Error, 'scopet');
await afvises('brugt eller udloebet kode', () => byt(async () => svar(400, { error: 'invalid_grant' })), Error, 'allerede brugt');
await afvises('forkert redirect URI i Google Cloud', () => byt(async () => svar(400, { error: 'redirect_uri_mismatch' })), Error, 'https://kristiangg.dk/oauth/google/callback/');
await godtages('koden byttes med det rigtige redirect URI', async () => {
  let krop;
  const s = await byt(async (_u, v) => { krop = new URLSearchParams(String(v.body)); return svar(200, { access_token: FALSK_ACCESS, refresh_token: FALSK_REFRESH, scope: SCOPE }); });
  if (krop.get('redirect_uri') !== 'https://kristiangg.dk/oauth/google/callback/' || krop.get('grant_type') !== 'authorization_code') throw new Error('krop');
  if (s.refresh_token !== FALSK_REFRESH) throw new Error('svar');
});
sandt('Testing-status opdages (tidsbegraenset refresh token)', beskrivSvar({ refresh_token_expires_in: 604799 }, 0).refresh_tidsbegraenset === true);
sandt('produktion: ingen udloebsdato', beskrivSvar({ scope: SCOPE }, 0).refresh_udloeber === null);

await afvises('bootstrap uden lokationer', () => vaelgVedBootstrap([]), DestinationAfvist);
await afvises('bootstrap med flere lokationer vaelger ikke selv', () => vaelgVedBootstrap([
  { navn: NAVN, website: 'https://kristiangg.dk/' }, { navn: `${KONTO}/locations/1`, website: 'https://kristiangg.dk/' }]), DestinationAfvist, 'vaelger ikke');
await afvises('bootstrap paa en profil, der ikke er kristiangg.dk', () => vaelgVedBootstrap([{ navn: NAVN, website: 'https://foreningen.dk/' }]), DestinationAfvist, 'kristiangg.dk');
await afvises('bootstrap paa domaene, der blot ligner', () => vaelgVedBootstrap([{ navn: NAVN, website: 'https://kristiangg.dk.evil.example/' }]), DestinationAfvist);
await godtages('bootstrap med én lokation paa kristiangg.dk', () => {
  if (vaelgVedBootstrap([{ navn: NAVN, website: 'https://kristiangg.dk/' }]).navn !== NAVN) throw new Error('forkert valg');
});
await godtages('findLokationer foelger sider paa tvaers af konti', async () => {
  const g = falskGoogle({
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts': (u) => svar(200, u.includes('pageToken=s2')
      ? { accounts: [{ name: 'accounts/2' }] }
      : { accounts: [{ name: KONTO }], nextPageToken: 's2' }),
    'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/2/locations': () => svar(200, { locations: [{ name: 'locations/7', title: 'B' }] }),
  });
  const l = await findLokationer(FALSK_ACCESS, g.hent);
  if (l.map((x) => x.navn).join() !== `${NAVN},accounts/2/locations/7`) throw new Error(JSON.stringify(l));
});

console.log(`\n  ${bestaaet} bestaaet, ${fejlet} fejlet\n`);
process.exit(fejlet ? 1 : 0);

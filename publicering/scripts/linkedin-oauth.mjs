// OAuth 2.0 for LinkedIn — Authorization Code Flow (3-legged).
//
// KOERES LOKALT PAA KRISTIANS MASKINE. Aldrig i GitHub Actions, aldrig paa en
// server. Client secret bruges kun her og forlader ikke maskinen.
//
//   node publicering/scripts/linkedin-oauth.mjs start
//   node publicering/scripts/linkedin-oauth.mjs byt
//
// Client ID og secret hentes fra LinkedIn Developer > Auth.
//
// SECRET'EN SKRIVES IKKE I KOMMANDOLINJEN.
// Scriptet spoerger om den, og terminalen ekkoer ikke, mens den tastes. Saa
// staar den hverken i shellens historik, i procestabellen eller paa skaermen.
// En "export LI_CLIENT_SECRET=..." ville ligge i ~/.bash_history bagefter.
//
// Client ID er ikke hemmeligt og maa gerne staa i miljoeet:
//   LI_CLIENT_ID       valgfrit. Spoerges der om, hvis den mangler.
//   LI_CLIENT_SECRET   valgfrit, men frarådes. Spoerges der om, hvis den mangler.
//
// HVORFOR TO TRIN
// Callbacken paa kristiangg.dk er en statisk side uden server. Den viser
// koden og stopper. Byttet kode->token kraever client secret, og en secret
// hoerer ikke hjemme paa et offentligt websted. Derfor: browseren henter
// koden, mennesket flytter den, maskinen bytter den.
//
// DESTINATIONEN
// Efter byttet spoerges /v2/userinfo om, HVEM tokenet tilhoerer. Det er den
// eneste kilde, der kan bevise det. Svarets sub bliver til den person-URN,
// motoren senere skal publicere til, og den skrives ud, saa Kristian kan
// laegge den i LI_PERSON_URN og i den eksplicitte tilladelsesliste.
//
// Kun urn:li:person:... accepteres. En urn:li:organization:... afvises her og
// igen ved publicering. Foreningen mod Familiebelastning maa ikke indgaa.

import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { stdin, stdout } from 'node:process';

const REDIRECT_URI = 'https://kristiangg.dk/oauth/linkedin/callback/';
const SCOPE = 'w_member_social openid profile';
const AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO = 'https://api.linkedin.com/v2/userinfo';
const STATE_FIL = new URL('./.li-state', import.meta.url);

let CLIENT_ID = process.env.LI_CLIENT_ID;
let CLIENT_SECRET = process.env.LI_CLIENT_SECRET;

/**
 * Laeser en linje uden at ekkoe den. Terminalen sattes i raa tilstand, saa
 * hvert tastetryk kommer hertil frem for til skaermen.
 *
 * Uden en terminal (rør, CI, editor-konsol) kastes der frem for at falde
 * tilbage til synlig indtastning — en secret maa ikke slippe ud, fordi
 * omgivelserne var anderledes end ventet.
 */
function laesSkjult(spoergsmaal) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      return reject(new Error(
        'Ingen terminal. Secret\'en kan ikke tastes skjult her — koer scriptet ' +
        'i et rigtigt terminalvindue.'
      ));
    }
    stdout.write(spoergsmaal);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buffer = '';
    const slut = (fn, arg) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', paaData);
      stdout.write('\n');
      fn(arg);
    };
    const paaData = (stykke) => {
      for (const tegn of stykke) {
        if (tegn === '\r' || tegn === '\n' || tegn === '\u0004') return slut(resolve, buffer);
        if (tegn === '\u0003') return slut(() => process.exit(130));   // ctrl-c
        if (tegn === '\u007f' || tegn === '\b') { buffer = buffer.slice(0, -1); continue; }
        if (tegn < ' ') continue;                                      // styretegn ignoreres
        buffer += tegn;
      }
    };
    stdin.on('data', paaData);
  });
}

/** Client ID er ikke hemmeligt. Den maa gerne ses, mens den tastes. */
async function sikrClientId() {
  if (CLIENT_ID) return;
  const rl = createInterface({ input: stdin, output: stdout });
  CLIENT_ID = (await rl.question('Client ID:     ')).trim();
  rl.close();
  if (!CLIENT_ID) throw new Error('Client ID er tom.');
}

async function sikrClientSecret() {
  if (CLIENT_SECRET) {
    console.log('  (bruger LI_CLIENT_SECRET fra miljøet — husk at den står i din historik,');
    console.log('   hvis du satte den med export)');
    return;
  }
  CLIENT_SECRET = (await laesSkjult('Client Secret: ')).trim();
  if (!CLIENT_SECRET) throw new Error('Client Secret er tom.');
  console.log('  (modtaget — vises ikke)');
}

/** Fjerner alt, der ligner en hemmelighed, foer noget logges. */
function skrub(s) {
  let t = String(s);
  for (const h of [CLIENT_SECRET, CLIENT_ID].filter(Boolean)) t = t.split(h).join('«udeladt»');
  return t.replace(/("access_token"\s*:\s*")[^"]+/g, '$1«udeladt»')
          .replace(/("refresh_token"\s*:\s*")[^"]+/g, '$1«udeladt»');
}

/** Et token vises aldrig helt — kun nok til at kunne kendes fra hinanden. */
const maske = (t) => `${t.slice(0, 6)}…${t.slice(-4)}  (${t.length} tegn)`;

async function start() {
  await sikrClientId();
  const { writeFileSync } = await import('node:fs');
  const state = randomBytes(24).toString('base64url');
  writeFileSync(STATE_FIL, state, { mode: 0o600 });

  const u = new URL(AUTH);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', REDIRECT_URI);
  u.searchParams.set('state', state);
  u.searchParams.set('scope', SCOPE);

  console.log('\nAabn denne adresse i den browser, hvor du er logget ind som DIG SELV');
  console.log('— ikke som en side, ikke som foreningen:\n');
  console.log(u.toString());
  console.log('\nGodkend. LinkedIn sender dig til callbacken, som viser code og state.');
  console.log('Koer derefter:  node publicering/scripts/linkedin-oauth.mjs byt\n');
}

async function byt() {
  // Hele forloebet er samtale med et menneske. Uden en terminal loeb
  // readline toer og processen sluttede med kode 0 uden en eneste linje —
  // en tavs succes, hvor intet var sket. Derfor stoppes der her i stedet.
  if (!stdin.isTTY) {
    throw new Error('Ingen terminal. Koer kommandoen i et rigtigt terminalvindue, ikke gennem et roer.');
  }
  const { readFileSync, unlinkSync, existsSync } = await import('node:fs');
  if (!existsSync(STATE_FIL)) throw new Error('Ingen gemt state. Koer "start" foerst.');
  const forventet = readFileSync(STATE_FIL, 'utf8').trim();

  const rl = createInterface({ input: stdin, output: stdout });
  const code = (await rl.question('code:          ')).trim();
  const state = (await rl.question('state:         ')).trim();
  rl.close();
  await sikrClientId();
  await sikrClientSecret();

  if (state !== forventet) {
    throw new Error('State stemmer ikke med den udstedte. Forloebet afvises. Start forfra.');
  }
  unlinkSync(STATE_FIL);

  const krop = new URLSearchParams({
    grant_type: 'authorization_code',
    code, redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
  });
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: krop,
  });
  const svar = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LinkedIn afviste byttet: ${r.status} ${skrub(JSON.stringify(svar))}`);

  const token = svar.access_token;
  if (!token) throw new Error(`Intet access_token i svaret: ${skrub(JSON.stringify(svar))}`);

  console.log('\n── TOKEN MODTAGET ──');
  console.log(`  access_token   ${maske(token)}`);
  console.log(`  udloeber om    ${svar.expires_in} sekunder (${Math.round(svar.expires_in / 86400)} dage)`);
  console.log(`  scope          ${svar.scope ?? '(ikke oplyst)'}`);

  // Dette afgoer spoergsmaalet om fornyelse. Dokumentationen kunne ikke naas;
  // svaret her er derimod definitivt for netop denne app.
  if (svar.refresh_token) {
    console.log(`  refresh_token  ${maske(svar.refresh_token)}`);
    console.log(`  refresh varer  ${svar.refresh_token_expires_in ?? '(ikke oplyst)'} sekunder`);
    console.log('\n  → Appen HAR programmatisk fornyelse. Motoren kan forny selv.');
  } else {
    console.log('  refresh_token  INTET I SVARET');
    console.log('\n  → Appen har IKKE programmatisk fornyelse. Du skal godkende paa ny,');
    console.log('    foer tokenet udloeber. Vagthunden skal varsle i god tid.');
  }

  // ── Destinationen bevises, ikke antages ──
  const u = await fetch(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
  const hvem = await u.json().catch(() => ({}));
  if (!u.ok) {
    console.log(`\n  ADVARSEL: kunne ikke aflaese identiteten (${u.status}).`);
    console.log(`  ${skrub(JSON.stringify(hvem))}`);
    console.log('  Scope "openid profile" mangler muligvis. Tokenet er gyldigt, men');
    console.log('  destinationen kan ikke bevises — og saa maa der ikke publiceres.');
    return;
  }
  const urn = `urn:li:person:${hvem.sub}`;
  console.log('\n── IDENTITET ──');
  console.log(`  navn           ${hvem.name ?? '(ikke oplyst)'}`);
  console.log(`  person-URN     ${urn}`);
  if (!hvem.sub) throw new Error('Svaret bar ingen sub. Destinationen kan ikke bevises.');

  console.log('\n── LAEG I GITHUB SECRETS ──');
  console.log('  LI_ACCESS_TOKEN      tokenet herover (vises ikke helt — hent det fra');
  console.log('                       terminalens svar, eller koer med --vis-token)');
  console.log(`  LI_PERSON_URN        ${urn}`);
  console.log(`  LI_TILLADT_URN       ${urn}   (samme vaerdi, men laest separat, saa en`);
  console.log('                       aendring af den ene ikke aendrer den anden)');
  console.log('\n  Kontrollér, at navnet herover er dit eget — ikke en side og ikke');
  console.log('  Foreningen mod Familiebelastning. Passer det ikke, saa stop her.\n');

  if (process.argv.includes('--vis-token')) {
    console.log('access_token:');
    console.log(token + '\n');
  }
}

const kommando = process.argv[2];
const handlinger = { start, byt };
if (!handlinger[kommando]) {
  console.error('Brug: linkedin-oauth.mjs start | byt [--vis-token]');
  process.exit(1);
}
handlinger[kommando]().catch((e) => { console.error('FEJL:', skrub(e.message)); process.exit(1); });

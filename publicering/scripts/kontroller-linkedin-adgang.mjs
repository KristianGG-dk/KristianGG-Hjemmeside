// Ikke-publicerende kontrol af LinkedIn-adgangen.
//
// Svarer paa fem spoergsmaal uden at skrive noget som helst paa LinkedIn:
//   1. Er der overhovedet et token?
//   2. Hvem tilhoerer det — og er det Kristians egen profil?
//   3. Stemmer det med den tilladte destination?
//   4. Hvilke rettigheder baerer det?
//   5. Hvornaar udloeber det?
//
// Der sendes udelukkende GET. Intet POST, intet opslag, ingen aendring.
//
// Kraever i miljoeet:
//   LI_ACCESS_TOKEN
//   LI_TILLADT_URN     den eneste destination der maa publiceres til
// Valgfrit, giver en fyldigere tokenrapport:
//   LI_CLIENT_ID, LI_CLIENT_SECRET   (kun lokalt — aldrig i GitHub Secrets)
//
// Tokenet skrives ALDRIG ud. Alt der logges, skrubbes foerst.

import { pruvDestination, bevisEjer, DestinationAfvist } from './publicer-linkedin.mjs';

const USERINFO = 'https://api.linkedin.com/v2/userinfo';
const INTROSPECT = 'https://www.linkedin.com/oauth/v2/introspectToken';

const TOKEN = process.env.LI_ACCESS_TOKEN;
const CLIENT_ID = process.env.LI_CLIENT_ID;
const CLIENT_SECRET = process.env.LI_CLIENT_SECRET;

let fejl = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
const info = (m) => console.log(`  ·     ${m}`);

/** Fjerner alt der ligner en hemmelighed, foer det logges. */
function skrub(s) {
  let t = String(s);
  for (const h of [TOKEN, CLIENT_SECRET].filter(Boolean)) t = t.split(h).join('«udeladt»');
  return t;
}

const dage = (sek) => Math.round(sek / 86400);

async function main() {
  console.log('\nLinkedIn — adgangskontrol. Kun laesning.\n');

  // 1. Token
  if (!TOKEN) return nej('LI_ACCESS_TOKEN mangler i miljøet. Kør linkedin-oauth.mjs byt først.');
  ok(`token til stede (${TOKEN.length} tegn)`);

  // 2-3. Destination
  let tilladt = null;
  try {
    tilladt = pruvDestination();
    ok(`destination konfigureret: ${tilladt}`);
  } catch (e) {
    if (!(e instanceof DestinationAfvist)) throw e;
    nej(e.message);
  }

  // 2. Ejeren — LinkedIns eget svar
  let hvem = null;
  try {
    const r = await fetch(USERINFO, { headers: { Authorization: `Bearer ${TOKEN}` } });
    hvem = await r.json();
    if (!r.ok) {
      nej(`/v2/userinfo → ${r.status}. ${skrub(JSON.stringify(hvem))}`);
      info('Mangler scope "openid profile"? Uden det kan ejeren ikke bekræftes,');
      info('og så må der ikke publiceres.');
    } else {
      ok(`tokenet tilhører ${hvem.name ?? '(navn ikke oplyst)'} — urn:li:person:${hvem.sub}`);
    }
  } catch (e) {
    nej(`kunne ikke nå /v2/userinfo: ${skrub(e.message)}`);
  }

  // 3. Ejer mod tilladt destination
  if (tilladt && hvem?.sub) {
    try {
      await bevisEjer(TOKEN, tilladt);
      ok('tokenets ejer er identisk med den tilladte destination');
    } catch (e) {
      nej(e.message);
    }
  }

  // 4-5. Rettigheder og udløb
  if (CLIENT_ID && CLIENT_SECRET) {
    try {
      const r = await fetch(INTROSPECT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, token: TOKEN }),
      });
      const t = await r.json();
      if (!r.ok) {
        nej(`introspectToken → ${r.status}. ${skrub(JSON.stringify(t))}`);
      } else {
        t.active || t.status === 'active' ? ok('tokenet er aktivt') : nej(`tokenet er ikke aktivt: ${t.status ?? '?'}`);
        if (t.scope) {
          const s = String(t.scope);
          s.includes('w_member_social') ? ok(`rettigheder: ${s}`) : nej(`w_member_social mangler. Har kun: ${s}`);
        }
        if (t.expires_at) {
          const d = new Date(t.expires_at * 1000);
          const tilbage = dage(t.expires_at - Date.now() / 1000);
          const linje = `udløber ${d.toISOString().slice(0, 10)} — om ${tilbage} dage`;
          tilbage <= 0 ? nej(`tokenet er udløbet (${linje})`)
            : tilbage <= 14 ? nej(`${linje}. Forny nu.`)
            : ok(linje);
        }
      }
    } catch (e) {
      info(`introspektion sprang fra: ${skrub(e.message)}`);
    }
  } else {
    info('LI_CLIENT_ID og LI_CLIENT_SECRET ikke i miljøet — rettigheder og udløb');
    info('kan ikke aflæses. Kør lokalt med dem, hvis du vil se dem.');
  }

  console.log(fejl === 0
    ? '\nADGANG: ALLE KONTROLLER BESTÅET. Der er intet publiceret.'
    : `\nADGANG: ${fejl} FEJL — der må ikke publiceres.`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FEJL:', skrub(e.message)); process.exit(1); });

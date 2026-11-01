// Ikke-publicerende kontrol af LinkedIn-adgangen.
//
// Svarer paa disse spoergsmaal uden at skrive noget som helst paa LinkedIn:
//   1. Er der overhovedet et token?
//   2. Er destinationen fastlaast — og ikke stadig sentinelvaerdien?
//   3. Hvem tilhoerer tokenet — og er det den fastlaaste destination?
//   4. Hvornaar udloeber det, ifoelge den fornyelse der udstedte det?
//
// I GitHub Actions sendes udelukkende GET mod /v2/userinfo. Intet opslag,
// ingen aendring.
//
// Kraever i miljoeet:
//   LI_ACCESS_TOKEN
//   LI_PERSON_URN, LI_TILLADT_URN   samme regler som i publisheren
//
// UDLOEB OG RETTIGHEDER
// Den loebende kontrol bruger IKKE introspektion. Det er besluttet
// 01-11-2026: client secret bliver i miljoeet linkedin-oauth og gives ikke
// til kontrolkoerslen. Udloebet aflaeses i stedet af
// publicering/linkedin-token.json, som fornyelsen skriver ud fra LinkedIns
// eget svar. Scopet w_member_social blev ogsaa skrevet dér ved fornyelsen.
//
// Introspektion (rettigheder og udloeb direkte fra LinkedIn) koeres kun,
// hvis LI_CLIENT_ID og LI_CLIENT_SECRET staar i miljoeet — det vil sige
// lokalt, eller hvis det senere besluttes at koere i linkedin-oauth.
//
// Tokenet skrives ALDRIG ud. Alt der logges, skrubbes foerst.

import { existsSync, readFileSync } from 'node:fs';
import { pruvDestination, bevisEjer, DestinationAfvist } from './publicer-linkedin.mjs';

const SENTINEL = 'urn:li:person:AFVENTER';
const METADATA = 'publicering/linkedin-token.json';

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
  if (!TOKEN) {
    nej('LI_ACCESS_TOKEN mangler. Der er aldrig gemt et token.');
    info('Kør workflowet «Forny LinkedIn-token» med handlingen bootstrap');
    info('(første gang) eller forny (senere) — ikke kontroller, som intet gemmer.');
  } else {
    ok(`token til stede (${TOKEN.length} tegn)`);
  }

  if ((process.env.LI_TILLADT_URN ?? '').trim() === SENTINEL) {
    nej(`LI_TILLADT_URN står stadig på ${SENTINEL}. Destinationen er ikke fastlåst — bootstrap er ikke gennemført.`);
  }

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
  if (TOKEN) try {
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

  // 4. Udløb ifølge fornyelsen. Ingen netværk.
  if (!existsSync(METADATA)) {
    nej(`${METADATA} findes ikke — der er ingen dokumenteret fornyelse, og udløbet kendes ikke.`);
  } else {
    try {
      const m = JSON.parse(readFileSync(METADATA, 'utf8'));
      info(`fornyet ${String(m.fornyet ?? '?').slice(0, 10)} for ${m.urn ?? '?'}`);
      if (m.urn && tilladt && m.urn !== tilladt) {
        nej('fornyelsens identitet svarer ikke til den tilladte destination');
      }
      const udl = Date.parse(m.udloeber);
      if (Number.isNaN(udl)) {
        nej('udløbsdatoen i metadatafilen kan ikke læses');
      } else {
        const tilbage = dage((udl - Date.now()) / 1000);
        const linje = `udløber ${m.udloeber.slice(0, 10)} — om ${tilbage} dage`;
        tilbage <= 0 ? nej(`tokenet er udløbet (${linje})`)
          : tilbage <= 14 ? nej(`${linje}. Forny nu.`)
          : ok(linje);
      }
      if (m.scope) {
        String(m.scope).includes('w_member_social')
          ? ok(`scope ved fornyelsen: ${m.scope}`)
          : nej(`w_member_social manglede ved fornyelsen. Scope: ${m.scope}`);
      }
    } catch (e) {
      nej(`${METADATA} kan ikke læses: ${e.message}`);
    }
  }

  // Introspektion — kun når client-oplysningerne står i miljøet (lokalt).
  if (TOKEN && CLIENT_ID && CLIENT_SECRET) {
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
    info('Introspektion springes over (besluttet: client secret bliver i linkedin-oauth).');
  }

  console.log(fejl === 0
    ? '\nADGANG: ALLE KONTROLLER BESTÅET. Der er intet publiceret.'
    : `\nADGANG: ${fejl} FEJL — der må ikke publiceres.`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((e) => { console.error('UVENTET FEJL:', skrub(e.message)); process.exit(1); });

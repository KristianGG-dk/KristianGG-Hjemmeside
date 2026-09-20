// Proever fornyelsen. Intet netvaerk: LinkedIn erstattes af en attrap, og
// GitHub roeres slet ikke. Der udstedes intet token og gemmes ingen
// hemmelighed.
//
//   node publicering/test/linkedin-fornyelse.test.mjs

import { byt, beskrivSvar } from '../scripts/forny-linkedin-token.mjs';

let bestaaet = 0, fejlet = 0;

// En kode i realistisk laengde. LinkedIns er langt over 40 tegn.
const RIGTIG_KODE = 'AQT' + 'b'.repeat(60);

const miljoe = (ekstra = {}) => Object.assign(process.env, {
  LI_AUTH_CODE: RIGTIG_KODE, LI_CLIENT_ID: 'id', LI_CLIENT_SECRET: 'hemmelig',
  LI_TILLADT_URN: 'urn:li:person:AbC123', GITHUB_REPOSITORY: 'x/y',
}, ekstra);

const svarer = (status, krop) => async () => ({
  ok: status === 200, status, json: async () => krop,
});

async function afvises(navn, fn, forventetStump) {
  try {
    await fn();
    console.log(`  FEJL  ${navn} — blev IKKE afvist`);
    fejlet++;
  } catch (e) {
    const ok = !forventetStump || e.message.includes(forventetStump);
    console.log(`  ${ok ? ' ok  ' : 'FEJL '} ${navn}${ok ? '' : ` — uventet besked: ${e.message}`}`);
    ok ? bestaaet++ : fejlet++;
  }
}

function paastand(navn, faktisk, forventet) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(forventet);
  console.log(`  ${ok ? ' ok  ' : 'FEJL '} ${navn}${ok ? '' : ` — fik ${JSON.stringify(faktisk)}`}`);
  ok ? bestaaet++ : fejlet++;
}

console.log('\nFornyelsen afviser\n');

miljoe({ LI_AUTH_CODE: 'opbrugt' });
await afvises('en allerede brugt kode', () => byt(svarer(200, {})), 'pladsholderen');

miljoe({ LI_AUTH_CODE: 'venter' });
await afvises('pladsholderen "venter"', () => byt(svarer(200, {})), 'pladsholderen');

miljoe({ LI_AUTH_CODE: 'AQTb_kun_en_stump' });
await afvises('en halvt kopieret kode', () => byt(svarer(200, {})), 'kun 17 tegn');

miljoe({ LI_AUTH_CODE: '' });
await afvises('en tom kode', () => byt(svarer(200, {})), 'LI_AUTH_CODE mangler');

miljoe({ LI_CLIENT_SECRET: '' });
await afvises('manglende client secret', () => byt(svarer(200, {})), 'LI_CLIENT_SECRET mangler');

miljoe();
await afvises('LinkedIn der svarer 400',
  () => byt(svarer(400, { error: 'invalid_grant' })), 'LinkedIn afviste byttet');

miljoe();
await afvises('LinkedIns intetsigende "code not found" forklares',
  () => byt(svarer(401, { error_description: 'Unable to retrieve access token: authorization code not found' })),
  'allerede brugt, udloebet');

miljoe();
await afvises('et svar uden access_token',
  () => byt(svarer(200, { expires_in: 5184000 })), 'Intet access_token');

console.log('\nFornyelsen godtager\n');

miljoe();
try {
  const s = await byt(svarer(200, { access_token: 'AQV_token', expires_in: 5184000, scope: 'w_member_social' }));
  console.log(s.access_token === 'AQV_token' ? '   ok   et gyldigt svar' : '  FEJL  et gyldigt svar');
  s.access_token === 'AQV_token' ? bestaaet++ : fejlet++;
} catch (e) {
  console.log(`  FEJL  et gyldigt svar — ${e.message}`);
  fejlet++;
}

console.log('\nSvaret beskrives, som det ER — ingen antagelser\n');

paastand('uden refresh_token',
  beskrivSvar({ expires_in: 5184000, scope: 'w_member_social' }).har_refresh_token, false);
paastand('med refresh_token',
  beskrivSvar({ expires_in: 5184000, refresh_token: 'r', refresh_token_expires_in: 31536000 }).har_refresh_token, true);
paastand('levetid i dage',
  beskrivSvar({ expires_in: 5184000 }).levetid_dage, 60);
paastand('refresh-levetid i dage',
  beskrivSvar({ expires_in: 1, refresh_token: 'r', refresh_token_expires_in: 31536000 }).refresh_levetid_dage, 365);

console.log(`\n  ${bestaaet} bestaaet, ${fejlet} fejlet\n`);
process.exit(fejlet ? 1 : 0);

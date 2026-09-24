// Proever destinationskontrollen. Intet netvaerk, intet token, ingen
// publicering: /v2/userinfo erstattes af en attrap.
//
//   node publicering/test/linkedin-destination.test.mjs
//
// Kontrollen skal FAIL CLOSED. Derfor proever denne fil foerst og fremmest
// det, der SKAL afvises. At det rigtige slipper igennem er kun én af tolv.

import { pruvDestination, bevisEjer, DestinationAfvist } from '../scripts/publicer-linkedin.mjs';

const MIG = 'urn:li:person:AbC123';
const FORENINGEN = 'urn:li:organization:99887766';

let bestaaet = 0, fejlet = 0;

function afvises(navn, fn) {
  try {
    fn();
    console.log(`  FEJL  ${navn} — blev IKKE afvist`);
    fejlet++;
  } catch (e) {
    const ok = e instanceof DestinationAfvist;
    console.log(`  ${ok ? ' ok  ' : 'FEJL '} ${navn}${ok ? '' : ` — forkert fejltype: ${e.name}`}`);
    ok ? bestaaet++ : fejlet++;
  }
}

async function afvisesAsync(navn, fn) {
  try {
    await fn();
    console.log(`  FEJL  ${navn} — blev IKKE afvist`);
    fejlet++;
  } catch (e) {
    const ok = e instanceof DestinationAfvist;
    console.log(`  ${ok ? ' ok  ' : 'FEJL '} ${navn}${ok ? '' : ` — forkert fejltype: ${e.name}`}`);
    ok ? bestaaet++ : fejlet++;
  }
}

function godtages(navn, fn) {
  try {
    fn();
    console.log(`   ok   ${navn}`);
    bestaaet++;
  } catch (e) {
    console.log(`  FEJL  ${navn} — blev afvist: ${e.message}`);
    fejlet++;
  }
}

console.log('\nKonfiguration (kontrol 1-3)\n');

afvises('intet LI_TILLADT_URN', () => pruvDestination({ LI_PERSON_URN: MIG }));
afvises('tomt LI_TILLADT_URN', () => pruvDestination({ LI_TILLADT_URN: '  ', LI_PERSON_URN: MIG }));
afvises('intet LI_PERSON_URN', () => pruvDestination({ LI_TILLADT_URN: MIG }));
afvises('destination aendret efter godkendelsen',
  () => pruvDestination({ LI_TILLADT_URN: MIG, LI_PERSON_URN: 'urn:li:person:EnAnden' }));
afvises('FORENINGENS side som maal',
  () => pruvDestination({ LI_TILLADT_URN: FORENINGEN, LI_PERSON_URN: FORENINGEN }));
afvises('organisation smuglet ind i begge felter',
  () => pruvDestination({ LI_TILLADT_URN: 'urn:li:organization:1', LI_PERSON_URN: 'urn:li:organization:1' }));
afvises('tom streng som URN', () => pruvDestination({ LI_TILLADT_URN: '', LI_PERSON_URN: '' }));
afvises('noget der hverken er person eller organisation',
  () => pruvDestination({ LI_TILLADT_URN: 'kristian', LI_PERSON_URN: 'kristian' }));

godtages('Kristians egen profil', () => {
  const u = pruvDestination({ LI_TILLADT_URN: MIG, LI_PERSON_URN: MIG });
  if (u !== MIG) throw new Error(`gav ${u}`);
});

console.log('\nEjerskab (kontrol 4)\n');

const svar = (status, krop) => async () => ({ ok: status === 200, status, json: async () => krop });

await afvisesAsync('tokenet tilhoerer en anden',
  () => bevisEjer('t', MIG, svar(200, { sub: 'EnHeltAnden', name: 'Nogen Andensen' })));
await afvisesAsync('userinfo svarer 401',
  () => bevisEjer('t', MIG, svar(401, { message: 'Invalid token' })));
await afvisesAsync('svar uden sub',
  () => bevisEjer('t', MIG, svar(200, { name: 'Kristian' })));
await afvisesAsync('netvaerket svigter',
  () => bevisEjer('t', MIG, async () => { throw new Error('ECONNRESET'); }));

try {
  const e = await bevisEjer('t', MIG, svar(200, { sub: 'AbC123', name: 'Kristian G. G. Dansted' }));
  if (e.urn !== MIG) throw new Error(`gav ${e.urn}`);
  console.log('   ok   tokenet tilhoerer Kristian');
  bestaaet++;
} catch (err) {
  console.log(`  FEJL  tokenet tilhoerer Kristian — blev afvist: ${err.message}`);
  fejlet++;
}

console.log(`\n  ${bestaaet} bestaaet, ${fejlet} fejlet\n`);
process.exit(fejlet ? 1 : 0);

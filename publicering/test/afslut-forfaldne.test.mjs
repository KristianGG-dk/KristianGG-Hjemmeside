// Proever oprydningen: hvilke forfaldne opslag lukkes, og hvilke roeres aldrig.
//
// Ingen filer, intet netvaerk: udvaelgelsen er ren og faar koe og register
// som argumenter.
//
//   node publicering/test/afslut-forfaldne.test.mjs
import assert from 'node:assert/strict';
import { udvaelg } from '../scripts/afslut-forfaldne.mjs';
import { registerSpaerre, AFSLUTTET, MAKS_FORSINKELSE_S } from '../scripts/krav.mjs';

let bestaaet = 0, fejlet = 0;
const proev = (navn, fn) => {
  try { fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};

const DATO = '2026-10-15T19:00:00+02:00';
const NAAR = new Date(DATO).getTime();
const NU = NAAR + 17 * 86400000;            // sytten dage efter, som element 33
const koe = (over = {}) => [{ element: 900, kanal: 'facebook', tidspunkt: DATO, metode: 'motor', laasefil: null, url: null, ...over }];
const reg = (status, over = {}) => [{ element: 900, kanal: 'facebook', status, tidspunkt: '2026-10-01T00:00:00.000Z', ...over }];
const kor = (k, r, nu = NU) => udvaelg({ koe: k, register: r, nu });

console.log('Lukkes: aldrig publiceret, vinduet udloebet');

for (const status of ['AFVENTER DATO', 'STOPPET FOR SENT']) {
  proev(`«${status}» og sytten dage for sent`, () => {
    const { luk } = kor(koe(), reg(status));
    assert.equal(luk.length, 1);
    assert.equal(luk[0].status, 'OPGIVET');
    assert.equal(luk[0].sidste_status_foer, status, 'den tidligere status skal bevares');
    assert.match(luk[0].noter, /17 dage/);
    assert.match(luk[0].noter, /aldrig afsendt/);
    assert.match(luk[0].noter, /ny godkendelse/, 'begrundelsen skal sige hvad der kraeves nu');
  });
}

proev('OPGIVET spaerrer derefter permanent — ingen nye forsoeg', () => {
  const { luk } = kor(koe(), reg('AFVENTER DATO'));
  const efter = [...reg('AFVENTER DATO'), luk[0]];
  assert.ok(registerSpaerre(efter, 900), 'et lukket element maa ikke kunne udvaelges igen');
  assert.equal(kor(koe(), efter).luk.length, 0, 'og det lukkes ikke én gang til');
});

proev('alle AFSLUTTET-statusser spaerrer', () => {
  for (const s of AFSLUTTET) assert.ok(registerSpaerre(reg(s), 900), s);
});

console.log('\nRoeres aldrig');

for (const [status, moenster] of [
  ['PUBLICERET', /afsendt/],
  ['PLANLAGT', /afsendt/],
  ['PLANLAGT MANUELT', /afsendt/],
  ['PUBLICERING IGANG', /uvist/],
  ['PUBLICERING FEJLET', /uvist/],
  ['PLANLAEGNING FEJLET', /uvist/],
]) {
  proev(`«${status}» lukkes ikke`, () => {
    const { luk, sprunget } = kor(koe(), reg(status));
    assert.equal(luk.length, 0);
    assert.match(sprunget.map(([, g]) => g).join(' '), moenster);
  });
}

proev('allerede afsluttet lukkes ikke igen', () => {
  const { luk, sprunget } = kor(koe(), reg('OPGIVET'));
  assert.equal(luk.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /allerede afsluttet/);
});

proev('website lukkes aldrig — HTTP-kontrollen afgoer', () => {
  const { luk, sprunget } = kor(koe({ kanal: 'website', url: 'https://kristiangg.dk/blog/x/' }), reg('AFVENTER DATO'));
  assert.equal(luk.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /HTTP-kontrollen/);
});

proev('uregistreret element lukkes ikke — vagthunden melder det', () => {
  const { luk, sprunget } = kor(koe(), []);
  assert.equal(luk.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /slet ikke registreret/);
});

console.log('\nVinduet');

proev('inden for vinduet: roeres ikke', () => {
  for (const sek of [0, 3600, MAKS_FORSINKELSE_S]) {
    const { luk, sprunget } = kor(koe(), reg('AFVENTER DATO'), NAAR + sek * 1000);
    assert.equal(luk.length, 0, `${sek} sekunder efter`);
    assert.match(sprunget.map(([, g]) => g).join(' '), /inden for vinduet/);
  }
});

proev('ét sekund over vinduet: lukkes', () => {
  assert.equal(kor(koe(), reg('AFVENTER DATO'), NAAR + (MAKS_FORSINKELSE_S + 1) * 1000).luk.length, 1);
});

proev('fremtidige opslag roeres ikke', () => {
  const { luk, sprunget } = kor(koe(), reg('AFVENTER DATO'), NAAR - 86400000);
  assert.equal(luk.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /forfalder foerst/);
});

proev('ulaeseligt tidspunkt lukkes ikke i stilhed', () => {
  const { luk, sprunget } = kor(koe({ tidspunkt: 'i oktober' }), reg('AFVENTER DATO'));
  assert.equal(luk.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /ulaeseligt tidspunkt/);
});

console.log('\nAlle fire kanaler kan lukkes');

proev('facebook, instagram, linkedin og gbp', () => {
  for (const kanal of ['facebook', 'instagram', 'linkedin', 'gbp']) {
    const { luk } = kor(koe({ kanal }), reg('AFVENTER DATO'));
    assert.equal(luk.length, 1, kanal);
    assert.equal(luk[0].kanal, kanal);
  }
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

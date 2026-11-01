// Proever spaerren mod dobbeltpublicering og 60-minutters-vinduet.
//
// Begge koerer paa udvaelgelsen i Instagram- og LinkedIn-sporet. Intet
// netvaerk, ingen publicering: der skrives midlertidige laase- og
// registerfiler, og udvaelg() kaldes direkte.
//
//   node publicering/test/krav.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beregnLaas, sha256 } from '../scripts/laas.mjs';
import { udvaelg as igUdvaelg } from '../scripts/publicer-instagram.mjs';
import { udvaelg as liUdvaelg } from '../scripts/publicer-linkedin-planlagt.mjs';
import { registerSpaerre, forfald, IGANG, FOR_SENT, MAKS_FORSINKELSE_S } from '../scripts/krav.mjs';

let bestaaet = 0, fejlet = 0;
const proev = (navn, fn) => {
  try { fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};

const DATO = '2026-11-05T19:00:00+01:00';
const FORFALD = Math.floor(new Date(DATO).getTime() / 1000);

function element(kanal = 'instagram', over = {}) {
  const e = {
    element: 900, kanal, titel: 'proeve', meta_description: 'proeve', slug: 'p',
    slut_url: '/p/', dato: DATO, kategorier: [], billede: 'motiv',
    alt_tekst: 'alt', links: [], cta: 'cta', hashtags: [],
    tekst: 'den godkendte tekst',
    billede_url: 'https://kristiangg.dk/images/natur/gaatur-640.jpg',
    godkendt_af: 'Kristian', godkendt_dato: '2026-11-01', ...over,
  };
  e.tekst_sha256 = sha256(e.tekst);
  e.brodtekst_sha256 = e.tekst_sha256;
  e.versionslaas = beregnLaas(e).laas;
  return e;
}

/** Koerer den rigtige udvaelgelse mod én laasefil og et register. */
function koer(e, register, nu = FORFALD + 60) {
  const rod = mkdtempSync(join(tmpdir(), 'krav-'));
  try {
    writeFileSync(join(rod, 'element-900.json'), JSON.stringify(e));
    const fn = e.kanal === 'linkedin' ? liUdvaelg : igUdvaelg;
    return fn(nu, { laase: rod, register });
  } finally { rmSync(rod, { recursive: true, force: true }); }
}

const raekke = (status, over = {}) => ({ element: 900, kanal: 'instagram', status, tidspunkt: '2026-11-05T18:05:00.000Z', ...over });

console.log('Et uvist udfald spaerrer — opslaget kan vaere gaaet ud');

proev('PUBLICERING IGANG spaerrer og siger hvorfor', () => {
  const { valgt, sprunget } = koer(element(), [raekke(IGANG)]);
  assert.equal(valgt.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /kan vaere gaaet ud/);
});

proev('PUBLICERING IGANG spaerrer ogsaa paa LinkedIn', () => {
  const { valgt } = koer(element('linkedin'), [raekke(IGANG, { kanal: 'linkedin' })]);
  assert.equal(valgt.length, 0);
});

proev('STOPPET FOR SENT spaerrer', () => {
  const { valgt, sprunget } = koer(element(), [raekke(FOR_SENT)]);
  assert.equal(valgt.length, 0);
  assert.match(sprunget.map(([, g]) => g).join(' '), /for sent/);
});

proev('PLANLAGT MANUELT spaerrer — det ligger i platformens planlaegger', () => {
  assert.equal(koer(element(), [raekke('PLANLAGT MANUELT')]).valgt.length, 0);
});

proev('IGANG efterfulgt af PUBLICERET spaerrer som publiceret', () => {
  const { sprunget } = koer(element(), [raekke(IGANG), raekke('PUBLICERET')]);
  assert.match(sprunget.map(([, g]) => g).join(' '), /staar som PUBLICERET/);
});

proev('AFVENTER DATO spaerrer IKKE — intet er afsendt', () => {
  assert.equal(koer(element(), [raekke('AFVENTER DATO')]).valgt.length, 1);
});

proev('tomt register spaerrer ikke', () => {
  assert.equal(koer(element(), []).valgt.length, 1);
});

console.log('\nHoejst en time efter det godkendte tidspunkt');

proev('ét minut efter: publiceres', () => {
  const { valgt, forSent } = koer(element(), [], FORFALD + 60);
  assert.equal(valgt.length, 1);
  assert.equal(forSent.length, 0);
});

proev('praecis 60 minutter efter: publiceres stadig', () => {
  assert.equal(koer(element(), [], FORFALD + MAKS_FORSINKELSE_S).valgt.length, 1);
});

proev('61 minutter efter: stoppes til manuel vurdering', () => {
  const { valgt, forSent, sprunget } = koer(element(), [], FORFALD + MAKS_FORSINKELSE_S + 60);
  assert.equal(valgt.length, 0, 'maa ikke publiceres');
  assert.equal(forSent.length, 1, 'skal registreres som stoppet');
  assert.match(sprunget.map(([, g]) => g).join(' '), /over graensen/);
});

proev('tre timer efter — som de syv foerste Instagram-opslag — stoppes', () => {
  const { valgt, forSent } = koer(element(), [], FORFALD + 3 * 3600);
  assert.equal(valgt.length, 0);
  assert.equal(forSent.length, 1);
});

proev('samme graense paa LinkedIn', () => {
  const { valgt, forSent } = koer(element('linkedin'), [], FORFALD + 2 * 3600);
  assert.equal(valgt.length, 0);
  assert.equal(forSent.length, 1);
});

proev('foer tidspunktet: hverken valgt eller stoppet', () => {
  const { valgt, forSent } = koer(element(), [], FORFALD - 60);
  assert.equal(valgt.length, 0);
  assert.equal(forSent.length, 0);
});

console.log('\nHjaelpefunktionerne hver for sig');

proev('forfald() navngiver de fire tilstande', () => {
  const e = { dato: DATO };
  assert.equal(forfald(e, FORFALD - 1).tilstand, 'fremtid');
  assert.equal(forfald(e, FORFALD).tilstand, 'forfalden');
  assert.equal(forfald(e, FORFALD + MAKS_FORSINKELSE_S + 1).tilstand, 'for_sent');
  assert.equal(forfald({ dato: 'ikke en dato' }, FORFALD).tilstand, 'ulaeselig');
});

proev('registerSpaerre() giver null, naar intet spaerrer', () => {
  assert.equal(registerSpaerre([], 900), null);
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

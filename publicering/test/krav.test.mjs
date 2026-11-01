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
import {
  registerSpaerre, koeSpaerre, forfald, sidsteFrist, harEgenFrist, varighed,
  IGANG, FOR_SENT, MAKS_FORSINKELSE_S,
} from '../scripts/krav.mjs';

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

/**
 * Koerer den rigtige udvaelgelse mod én laasefil, et register og en koe.
 * Koeen skal med: udvaelgelsen kontrollerer den nu (pause, se koeSpaerre),
 * og uden den ville proeverne falde paa, at element 900 ikke staar i den
 * rigtige koe.json.
 */
function koer(e, register, nu = FORFALD + 60, koe) {
  const rod = mkdtempSync(join(tmpdir(), 'krav-'));
  try {
    writeFileSync(join(rod, 'element-900.json'), JSON.stringify(e));
    const fn = e.kanal === 'linkedin' ? liUdvaelg : igUdvaelg;
    return fn(nu, {
      laase: rod,
      register,
      koe: koe ?? [{ element: 900, kanal: e.kanal, tidspunkt: e.dato, metode: 'motor', laasefil: null, url: null }],
    });
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

console.log('\nTidsvinduet: tidligst paa tidspunktet, senest et doegn efter');

// Kristians beslutning 01-11-2026. Hvert punkt paa hans egen liste.
for (const [navn, offset, skalVaelges] of [
  ['praecis paa det godkendte tidspunkt', 0, true],
  ['forsinket 59 minutter', 59 * 60, true],
  ['forsinket 6 timer', 6 * 3600, true],
  ['forsinket 23 timer og 59 minutter', 23 * 3600 + 59 * 60, true],
  ['forsinket praecis 24 timer — sidste tilladte', MAKS_FORSINKELSE_S, true],
  ['forsinket 24 timer og ét sekund', MAKS_FORSINKELSE_S + 1, false],
  ['forsinket 25 timer', 25 * 3600, false],
  ['forsinket 3 doegn', 3 * 86400, false],
]) {
  proev(navn, () => {
    const { valgt, forSent } = koer(element(), [], FORFALD + offset);
    assert.equal(valgt.length, skalVaelges ? 1 : 0);
    assert.equal(forSent.length, skalVaelges ? 0 : 1,
      skalVaelges ? 'maa ikke stoppes' : 'skal registreres som stoppet');
  });
}

proev('foer tidspunktet: hverken valgt eller stoppet — intet gaar ud foer tid', () => {
  const { valgt, forSent } = koer(element(), [], FORFALD - 1);
  assert.equal(valgt.length, 0);
  assert.equal(forSent.length, 0);
});

proev('samme graense paa LinkedIn', () => {
  assert.equal(koer(element('linkedin'), [], FORFALD + 23 * 3600).valgt.length, 1);
  assert.equal(koer(element('linkedin'), [], FORFALD + 25 * 3600).forSent.length, 1);
});

proev('motoren venter ikke: den vaelger ved foerste koersel efter tidspunktet', () => {
  // Et sekund efter er lige saa gyldigt som et doegn efter. Vinduet er en
  // graense, ikke en udsaettelse.
  assert.equal(koer(element(), [], FORFALD + 1).valgt.length, 1);
});

console.log('\nDansk sommer- og vintertid');

// Danmark skifter til vintertid soendag 25-10-2026 kl. 03.00 -> 02.00, og til
// sommertid soendag 29-03-2026. Et doegn er 86400 sekunder ogsaa hen over et
// skifte, fordi «dato» baerer sit eget offset og alt regnes paa oejeblikke.
for (const [navn, dato] of [
  ['vintertid (november, +01:00)', '2026-11-05T19:00:00+01:00'],
  ['sommertid (juli, +02:00)', '2026-07-05T19:00:00+02:00'],
  ['aftenen foer skiftet til vintertid', '2026-10-24T19:00:00+02:00'],
  ['aftenen efter skiftet til vintertid', '2026-10-25T19:00:00+01:00'],
  ['aftenen foer skiftet til sommertid', '2026-03-28T19:00:00+01:00'],
  ['aftenen efter skiftet til sommertid', '2026-03-29T19:00:00+02:00'],
]) {
  proev(navn, () => {
    const e = element('instagram', { dato });
    const naar = Math.floor(new Date(dato).getTime() / 1000);
    const koeMed = [{ element: 900, kanal: 'instagram', tidspunkt: dato, metode: 'motor', laasefil: null, url: null }];
    assert.equal(koer(e, [], naar + MAKS_FORSINKELSE_S, koeMed).valgt.length, 1, 'et doegn efter: tilladt');
    assert.equal(koer(e, [], naar + MAKS_FORSINKELSE_S + 1, koeMed).forSent.length, 1, 'ét sekund mere: for sent');
  });
}

proev('tidsskiftet aendrer ikke doegnets laengde', () => {
  // Natten mellem 24. og 25. oktober 2026 har 25 timer i dansk vaegtid.
  // Et element dateret loerdag kl. 19 maa publiceres til soendag kl. 19
  // DANSK TID — altsaa 86400 sekunder senere, ikke 90000.
  const foer = new Date('2026-10-24T19:00:00+02:00').getTime();
  const efter = new Date('2026-10-25T19:00:00+01:00').getTime();
  assert.equal((efter - foer) / 1000, 25 * 3600, 'der er 25 timer mellem de to aftener');
  const e = element('instagram', { dato: '2026-10-24T19:00:00+02:00' });
  const koeMed = [{ element: 900, kanal: 'instagram', tidspunkt: e.dato, metode: 'motor', laasefil: null, url: null }];
  assert.equal(koer(e, [], Math.floor(efter / 1000), koeMed).valgt.length, 0,
    'soendag kl. 19 er 25 timer efter og dermed for sent');
});

console.log('\nTidsfoelsomt indhold: en kortere frist end doegnet');

proev('gyldig_timer: 3 — fire timer efter er for sent', () => {
  const e = element('instagram', { gyldig_timer: 3 });
  assert.equal(koer(e, [], FORFALD + 2 * 3600).valgt.length, 1, 'to timer: tilladt');
  assert.equal(koer(e, [], FORFALD + 3 * 3600).valgt.length, 1, 'praecis tre timer: tilladt');
  const sent = koer(e, [], FORFALD + 4 * 3600);
  assert.equal(sent.valgt.length, 0);
  assert.equal(sent.forSent.length, 1);
  assert.match(sent.sprunget.map(([, g]) => g).join(' '), /egen kortere frist/);
});

proev('udloeber: et absolut klokkeslet', () => {
  const udloeber = '2026-11-05T21:00:00+01:00';   // to timer efter forfald
  const e = element('instagram', { udloeber });
  assert.equal(koer(e, [], FORFALD + 3600).valgt.length, 1, 'én time: inden for');
  assert.equal(koer(e, [], FORFALD + 2 * 3600 + 1).forSent.length, 1, 'ét sekund efter udloebet');
});

proev('den korteste frist vinder, naar begge felter er sat', () => {
  const e = element('instagram', { gyldig_timer: 10, udloeber: '2026-11-05T20:00:00+01:00' });
  assert.equal(koer(e, [], FORFALD + 2 * 3600).valgt.length, 0, 'udloeber efter én time, saa to timer er for sent');
});

proev('et udloeb FOER det godkendte tidspunkt stopper elementet', () => {
  const e = element('instagram', { udloeber: '2026-11-04T19:00:00+01:00' });
  assert.equal(koer(e, [], FORFALD).valgt.length, 0);
});

proev('felterne er frivillige: uden dem gaelder doegnet', () => {
  const e = element();
  assert.equal(e.gyldig_timer, undefined);
  assert.equal(e.udloeber, undefined);
  assert.equal(koer(e, [], FORFALD + 23 * 3600).valgt.length, 1);
});

proev('sidsteFrist() regner den korteste frist ud', () => {
  assert.equal(sidsteFrist({}, 1000), 1000 + MAKS_FORSINKELSE_S);
  assert.equal(sidsteFrist({ gyldig_timer: 2 }, 1000), 1000 + 7200);
  assert.equal(harEgenFrist({}), false);
  assert.equal(harEgenFrist({ gyldig_timer: 2 }), true);
  assert.equal(harEgenFrist({ udloeber: '2026-11-05T20:00:00+01:00' }), true);
});

proev('varighed() kan laeses af et menneske', () => {
  assert.equal(varighed(86400), '24 timer');
  assert.equal(varighed(3600), '1 time');
  assert.equal(varighed(60), '1 minut');
  assert.equal(varighed(3 * 3600 + 12 * 60), '3 timer og 12 minutter');
});

console.log('\nPause: koeen kan standse et element uden at roere godkendelsen');

const koePost = (over = {}) => ({
  element: 900, kanal: 'instagram', tidspunkt: DATO, metode: 'motor',
  laasefil: 'publicering/laase/element-900.json', url: null, ...over,
});

proev('metode «motor» og enig med laasen: intet spaerrer', () => {
  assert.equal(koeSpaerre([koePost()], element(), 'publicering/laase/element-900.json', 'instagram'), null);
});

proev('metode «pause» standser elementet', () => {
  const g = koeSpaerre([koePost({ metode: 'pause' })], element(), null, 'instagram');
  assert.match(g, /sat paa pause/);
});

proev('metode «manuel» standser elementet', () => {
  assert.match(koeSpaerre([koePost({ metode: 'manuel' })], element(), null, 'instagram'), /motoren roerer det ikke/);
});

proev('elementet skal staa i koeen', () => {
  assert.match(koeSpaerre([], element(), null, 'instagram'), /0 instagram-poster/);
});

proev('to poster paa samme element afvises', () => {
  assert.match(koeSpaerre([koePost(), koePost()], element(), null, 'instagram'), /2 instagram-poster/);
});

proev('koeens tidspunkt skal vaere laasens dato', () => {
  const g = koeSpaerre([koePost({ tidspunkt: '2026-11-06T19:00:00+01:00' })], element(), null, 'instagram');
  assert.match(g, /ikke den godkendte dato/);
});

proev('koeen skal pege paa netop denne laasefil', () => {
  const g = koeSpaerre([koePost({ laasefil: 'publicering/laase/element-001.json' })], element(),
    'publicering/laase/element-900.json', 'instagram');
  assert.match(g, /koeen peger paa/);
});

proev('pause virker gennem den rigtige udvaelgelse', () => {
  const e = element();
  const rod = mkdtempSync(join(tmpdir(), 'pause-'));
  try {
    writeFileSync(join(rod, 'element-900.json'), JSON.stringify(e));
    const paa = igUdvaelg(FORFALD + 60, { laase: rod, register: [], koe: [koePost()] });
    const af = igUdvaelg(FORFALD + 60, { laase: rod, register: [], koe: [koePost({ metode: 'pause' })] });
    assert.equal(paa.valgt.length, 1, 'uden pause: publiceres');
    assert.equal(af.valgt.length, 0, 'med pause: publiceres ikke');
    assert.equal(af.forSent.length, 0, 'pause er ikke «for sent»');
  } finally { rmSync(rod, { recursive: true, force: true }); }
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

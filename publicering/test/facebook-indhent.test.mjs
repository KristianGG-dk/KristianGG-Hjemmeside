// Proever Facebooks saerlige haandtering af 24-timersgraensen.
//
// Facebook er den ene kanal, hvor motoren afleverer opslaget til Meta FREM I
// TIDEN. Graensen maa derfor ikke afvise et element, fordi det planlaegges
// flere dage foer sin dato — og et element, hvis dato er passeret, skal
// gribes i stedet for at falde paa gulvet.
//
// Intet netvaerk, ingen publicering: udvaelgelsen koeres mod midlertidige
// laase-, koe- og registerfiler.
//
//   node publicering/test/facebook-indhent.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beregnLaas, sha256 } from '../scripts/laas.mjs';
import { MAKS_FORSINKELSE_S } from '../scripts/krav.mjs';

const SCRIPT = join(process.cwd(), 'publicering/scripts/planlaeg-facebook.mjs');
let bestaaet = 0, fejlet = 0;

const DATO = '2026-11-07T19:00:00+01:00';
const FORFALD = Math.floor(new Date(DATO).getTime() / 1000);

function element(over = {}) {
  const e = {
    element: 900, kanal: 'facebook', titel: 'proeve', meta_description: 'proeve',
    slug: 'p', slut_url: '/p/', dato: DATO, kategorier: [], billede: 'gaatur',
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
 * Koerer --tag-krav i en midlertidig kopi af repoets struktur og laeser, hvad
 * den ville planlaegge, indhente og stoppe. Scriptet laeser faste stier, saa
 * proeven skifter arbejdsmappe.
 */
function tagKrav(e, { nu = FORFALD + 60, register = [], koe } = {}) {
  const rod = mkdtempSync(join(tmpdir(), 'fb-'));
  try {
    mkdirSync(join(rod, 'publicering/laase'), { recursive: true });
    writeFileSync(join(rod, 'publicering/laase/element-900.json'), JSON.stringify(e));
    writeFileSync(join(rod, 'publicering/register.json'), JSON.stringify(register));
    writeFileSync(join(rod, 'publicering/koe.json'), JSON.stringify(koe ?? []));
    const ud = execFileSync('node', ['-e', `
      process.env.TZ = 'UTC';
      const m = await import(${JSON.stringify(SCRIPT)});
      const r = m.tagKrav(${nu});
      console.log('JSON:' + JSON.stringify({
        planlaeg: r.valgt.map((x) => x.e.element),
        indhent: r.indhent.map((x) => x.e.element),
        forSent: r.forSent.map((x) => x.e.element),
      }));
    `], { cwd: rod, encoding: 'utf8' });
    const linje = ud.split('\n').find((l) => l.startsWith('JSON:'));
    return { ...JSON.parse(linje.slice(5)), log: ud };
  } finally { rmSync(rod, { recursive: true, force: true }); }
}

const proev = (navn, fn) => {
  try { fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};

console.log('Fremtiden: Metas planlaegning er uroert');

proev('seks dage ude: afleveres til Meta, ikke stoppet', () => {
  const r = tagKrav(element(), { nu: FORFALD - 6 * 86400 });
  assert.deepEqual(r.planlaeg, [900]);
  assert.deepEqual(r.indhent, []);
  assert.deepEqual(r.forSent, [], '24-timersreglen maa ikke afvise et fremtidigt opslag');
});

proev('29 dage ude: stadig inden for Metas vindue', () => {
  assert.deepEqual(tagKrav(element(), { nu: FORFALD - 29 * 86400 }).planlaeg, [900]);
});

proev('31 dage ude: venter, men er ikke stoppet', () => {
  const r = tagKrav(element(), { nu: FORFALD - 31 * 86400 });
  assert.deepEqual(r.planlaeg, []);
  assert.deepEqual(r.forSent, [], 'for tidligt er ikke for sent');
  assert.match(r.log, /over Metas maksimum/);
});

proev('fem minutter ude: under Metas minimum, venter', () => {
  const r = tagKrav(element(), { nu: FORFALD - 300 });
  assert.deepEqual(r.planlaeg, []);
  assert.deepEqual(r.forSent, []);
  assert.match(r.log, /under Metas minimum/);
});

console.log('\nDatoen er passeret: opslaget gribes i stedet for at falde');

for (const [navn, offset, hvor] of [
  ['ét minut efter', 60, 'indhent'],
  ['59 minutter efter', 59 * 60, 'indhent'],
  ['6 timer efter', 6 * 3600, 'indhent'],
  ['23 timer og 59 minutter efter', 23 * 3600 + 59 * 60, 'indhent'],
  ['praecis 24 timer efter', MAKS_FORSINKELSE_S, 'indhent'],
  ['24 timer og ét sekund efter', MAKS_FORSINKELSE_S + 1, 'forSent'],
  ['tre doegn efter', 3 * 86400, 'forSent'],
]) {
  proev(navn, () => {
    const r = tagKrav(element(), { nu: FORFALD + offset });
    assert.deepEqual(r.planlaeg, [], 'Metas planlaegning kan ikke bruges bagud');
    assert.deepEqual(r[hvor], [900]);
    assert.deepEqual(r[hvor === 'indhent' ? 'forSent' : 'indhent'], []);
  });
}

proev('element 33 og 34 ville vaere grebet, havde reglen vaeret der', () => {
  // De forfaldt 15. og 16. oktober. Workflowet var manuelt, datoen passerede,
  // og Metas vindue lukkede sig bag dem. Inden for det foerste doegn ville de
  // nu vaere blevet indhentet.
  assert.deepEqual(tagKrav(element(), { nu: FORFALD + 12 * 3600 }).indhent, [900]);
});

console.log('\nEt opslag, der allerede ligger hos Meta, oprettes aldrig igen');

for (const status of ['PLANLAGT', 'PUBLICERET', 'PLANLAGT MANUELT', 'PUBLICERING IGANG', 'STOPPET FOR SENT']) {
  proev(`status «${status}» spaerrer`, () => {
    const r = tagKrav(element(), {
      nu: FORFALD + 3600,
      register: [{ element: 900, kanal: 'facebook', status, tidspunkt: '2026-11-07T18:05:00.000Z' }],
    });
    assert.deepEqual(r.planlaeg, []);
    assert.deepEqual(r.indhent, [], 'maa ikke indhentes, naar det allerede er afsendt eller uvist');
    assert.deepEqual(r.forSent, []);
  });
}

proev('PLANLAGT spaerrer ogsaa FOER datoen — ingen dublet hos Meta', () => {
  const r = tagKrav(element(), {
    nu: FORFALD - 6 * 86400,
    register: [{ element: 900, kanal: 'facebook', status: 'PLANLAGT', tidspunkt: '2026-11-01T00:00:00.000Z' }],
  });
  assert.deepEqual(r.planlaeg, []);
});

console.log('\nTidsfoelsomt indhold og andre kanaler');

proev('gyldig_timer: 2 — seks timer efter er for sent, ikke indhentet', () => {
  const r = tagKrav(element({ gyldig_timer: 2 }), { nu: FORFALD + 6 * 3600 });
  assert.deepEqual(r.indhent, []);
  assert.deepEqual(r.forSent, [900]);
});

proev('andre kanaler roeres ikke', () => {
  const r = tagKrav(element({ kanal: 'instagram' }), { nu: FORFALD + 3600 });
  assert.deepEqual(r.planlaeg, []);
  assert.deepEqual(r.indhent, []);
  assert.deepEqual(r.forSent, []);
});

proev('aendret tekst afvises, ogsaa ved indhentning', () => {
  const e = element();
  e.tekst = 'noget andet end det godkendte';
  const r = tagKrav(e, { nu: FORFALD + 3600 });
  assert.deepEqual(r.indhent, [], 'indhentning lemper ingen kontrol');
  assert.match(r.log, /teksten svarer ikke til den godkendte hash/);
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

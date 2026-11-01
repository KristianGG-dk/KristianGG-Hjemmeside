// Proever udvaelgelsen i publicer-linkedin-planlagt.mjs.
//
//   node publicering/test/linkedin-planlagt.test.mjs
//
// LinkedIn kan ikke planlaegge, saa motoren skal selv publicere paa
// tidspunktet. Det gaar galt paa to maader: den publicerer noget, den ikke
// maatte, eller den publicerer det samme to gange. Proeven daekker begge.
//
// Intet netvaerk. Ingen publicering. Den kalder kun udvaelg().
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { udvaelg } from '../scripts/publicer-linkedin-planlagt.mjs';
import { beregnLaas, sha256 } from '../scripts/laas.mjs';

let bestaaet = 0, fejlet = 0;
const FORFALD = Math.floor(new Date('2026-11-04T08:00:00.000+01:00').getTime() / 1000);

/** Et gyldigt, godkendt og laast LinkedIn-element. Laasen beregnes, ikke gaettet. */
function element(ekstra = {}) {
  const e = {
    element: 900, kanal: 'linkedin',
    titel: 'Test', meta_description: 'Test', slug: 'element-900-test',
    slut_url: '(linkedin-opslag, ingen URL foer publicering)',
    dato: '2026-11-04T08:00:00.000+01:00', kategorier: ['naturterapi'],
    billede: 'skovsti', alt_tekst: 'Smal skovsti mellem hoeje traeer paa Fyn',
    links: [], cta: 'Ingen', hashtags: [],
    tekst: 'En proevetekst.',
    godkendt_af: 'Kristian G. G. Dansted', godkendt_dato: '2026-10-25',
    ...ekstra,
  };
  e.tekst_sha256 ??= sha256(e.tekst);
  e.brodtekst_sha256 ??= e.tekst_sha256;
  e.versionslaas ??= beregnLaas(e).laas;
  return e;
}

/** Skriver elementet som eneste laasefil i en tom mappe og udvaelger. */
function koer(e, { nu = FORFALD + 60, register = [] } = {}) {
  const rod = mkdtempSync(join(tmpdir(), 'li-planlagt-'));
  try {
    writeFileSync(join(rod, 'element-900.json'), JSON.stringify(e));
    return udvaelg(nu, { laase: rod, register });
  } finally {
    rmSync(rod, { recursive: true, force: true });
  }
}

function sandt(navn, betingelse) {
  betingelse ? (bestaaet++, console.log(`  OK    ${navn}`))
             : (fejlet++, console.log(`  FEJL  ${navn}`));
}

function springes(navn, e, opt, moenster) {
  const { valgt, sprunget } = koer(e, opt);
  const grund = sprunget.map(([, g]) => g).join(' | ');
  const ok = valgt.length === 0 && moenster.test(grund);
  ok ? (bestaaet++, console.log(`  OK    ${navn}`))
     : (fejlet++, console.log(`  FEJL  ${navn} — valgt=${valgt.length} grund=«${grund}»`));
}

console.log('Det der SKAL publiceres');
sandt('godkendt, laast, forfaldent og ikke registreret: vaelges',
  koer(element()).valgt.length === 1);

console.log('\nTiden');
springes('forfalder foerst senere', element(), { nu: FORFALD - 60 }, /forfalder foerst/);
sandt('praecis paa sekundet: vaelges', koer(element(), { nu: FORFALD }).valgt.length === 1);
springes('ulaeselig dato', element({ dato: 'i morgen' }), {}, /ulaeseligt dato-felt/);

console.log('\nDubletspaerren');
for (const status of ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT']) {
  springes(`staar som ${status} i registret`, element(), { register: [{ element: 900, status }] },
    new RegExp(`staar som ${status}`));
}
springes('tidligere forsoeg fejlede: kraever et menneske', element(),
  { register: [{ element: 900, status: 'PUBLICERING FEJLET' }] },
  /seneste forsoeg fejlede/);
sandt('fejlet FOER en senere publicering spaerrer ikke paa ny',
  koer(element(), { register: [
    { element: 900, status: 'PUBLICERING FEJLET' },
    { element: 900, status: 'PUBLICERET' },
  ] }).valgt.length === 0);

console.log('\nIntegriteten');
springes('versionslaas aendret efter godkendelsen',
  element({ versionslaas: '0000000000000000' }), {}, /versionslaas afviger/);
springes('teksten aendret efter laasningen',
  (() => { const e = element(); e.tekst = 'Noget andet.'; return e; })(), {},
  /teksten svarer ikke til den godkendte hash/);
springes('ingen godkendelse', element({ godkendt_af: undefined }), {}, /baerer ingen godkendelse/);
// Laasen kan slet ikke beregnes uden et obligatorisk felt, saa den maa gives
// paa forhaand her. Udvaelgelsen skal afvise elementet, ikke udlede feltet.
springes('obligatorisk felt mangler', element({ cta: undefined, versionslaas: '0000000000000000' }), {},
  /AFVIST: Obligatoriske felter mangler: cta/);

console.log('\nKanalen');
springes('facebook-element', element({ kanal: 'facebook' }), {}, /kanal er facebook/);
springes('instagram-element', element({ kanal: 'instagram' }), {}, /kanal er instagram/);

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

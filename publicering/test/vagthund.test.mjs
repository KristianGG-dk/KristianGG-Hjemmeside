// Proever vagthundens skelnen mellem MANUEL og AUTOMATISK publicering.
//
//   node publicering/test/vagthund.test.mjs
//
// Baggrund. Vagthunden behandlede alle Instagram-elementer som automatiske.
// Element 36 (18-10-2026) er instagram med metode "manuel" og uden laasefil.
// Instagram-motoren udvaelger fra laasefiler og kan slet ikke se elementet,
// men vagthunden meldte alligevel FEJL: "den planlagte koersel har ikke gjort
// sit arbejde." Det var en paastand om en koersel, der aldrig skulle have
// vaeret der.
//
// Den anden halvdel af samme fejl: et forfaldent element med status
// "AFVENTER DATO" blev beskrevet som "planlagt i platformens brugerflade".
// AFVENTER DATO betyder, at intet er afleveret nogen steder. Element 33, 34
// og 35 stod netop saadan efter messen.
//
// Proeven koerer det rigtige script som en sort boks mod midlertidige
// koe- og registerfiler. Den roerer ikke repoets egne filer.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const VAGTHUND = resolve('publicering/scripts/vagthund.mjs');
const NU = '2026-10-20T08:00:00.000Z';   // efter alle forfald nedenfor

let bestaaet = 0, fejlet = 0;

/** Koer vagthunden mod én koepost og én registerraekke. Returnerer udskriften. */
function koer({ kanal, metode, status, tidspunkt, laasefil = null, url = null }) {
  const rod = mkdtempSync(join(tmpdir(), 'vagthund-'));
  try {
    mkdirSync(join(rod, 'publicering/laase'), { recursive: true });
    writeFileSync(join(rod, 'publicering/koe.json'), JSON.stringify(
      [{ element: 900, kanal, tidspunkt, metode, laasefil, url }]));
    writeFileSync(join(rod, 'publicering/register.json'), JSON.stringify(
      [{ element: 900, kanal, status, tidspunkt: '2026-10-01T00:00:00.000Z' }]));
    let ud, kode = 0;
    try {
      ud = execFileSync('node', [VAGTHUND, '--uden-net', '--nu', NU],
        { cwd: rod, encoding: 'utf8' });
    } catch (err) {
      ud = (err.stdout ?? '') + (err.stderr ?? '');
      kode = err.status ?? 1;
    }
    return { ud, kode };
  } finally {
    rmSync(rod, { recursive: true, force: true });
  }
}

function proev(navn, post, forventet) {
  const { ud, kode } = koer(post);
  const fejlede = kode !== 0;
  const problemer = [];

  if (forventet.fejl !== undefined && fejlede !== forventet.fejl)
    problemer.push(forventet.fejl ? 'forventede FEJL, fik ingen' : `forventede INGEN fejl, fik exit ${kode}`);
  for (const t of forventet.indeholder ?? [])
    if (!ud.includes(t)) problemer.push(`udskriften mangler «${t}»`);
  for (const t of forventet.indeholder_ikke ?? [])
    if (ud.includes(t)) problemer.push(`udskriften siger «${t}», og det maa den ikke`);

  if (problemer.length) {
    fejlet++;
    console.log(`  FEJL  ${navn}`);
    for (const p of problemer) console.log(`        ${p}`);
    console.log(ud.split('\n').filter((l) => l.includes('element 900')).map((l) => '        ' + l.trim()).join('\n'));
  } else {
    bestaaet++;
    console.log(`  OK    ${navn}`);
  }
}

console.log('Manuelle kanaler maa ALDRIG give alarm om en svigtet automatisk koersel');

// Det konkrete tilfaelde: element 36.
proev('instagram + manuel + AFVENTER DATO', {
  kanal: 'instagram', metode: 'manuel', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-18T09:30:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['Manuel publicering eller bekraeftelse mangler'],
  indeholder_ikke: ['planlagte koersel har ikke gjort sit arbejde', 'i platformens brugerflade', 'hos Meta'],
});

proev('gbp + manuel + AFVENTER DATO', {
  kanal: 'gbp', metode: 'manuel', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-14T09:00:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['Manuel publicering eller bekraeftelse mangler'],
  indeholder_ikke: ['planlagte koersel har ikke gjort sit arbejde'],
});

proev('linkedin + manuel + AFVENTER DATO', {
  kanal: 'linkedin', metode: 'manuel', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-13T08:00:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['Manuel publicering eller bekraeftelse mangler'],
  indeholder_ikke: ['planlagte koersel har ikke gjort sit arbejde'],
});

// Facebook med metode motor: motoren AFLEVERER til Meta, men Meta har aldrig
// kvitteret, saa laenge status er AFVENTER DATO. Det maa ikke se ud, som om
// opslaget ligger og venter hos Meta. Element 33, 34 og 35 stod saadan.
proev('facebook + motor + AFVENTER DATO (afleveret til ingen)', {
  kanal: 'facebook', metode: 'motor', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-15T19:00:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['intet er afleveret til platformen', 'Manuel publicering eller bekraeftelse mangler'],
  indeholder_ikke: ['hos Meta'],
});

console.log('\nAutomatiske kanaler SKAL give alarm, naar koerslen har svigtet');

proev('instagram + motor + AFVENTER DATO', {
  kanal: 'instagram', metode: 'motor', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-18T09:30:00.000+02:00', laasefil: 'publicering/laase/element-900.json',
}, {
  fejl: true,
  indeholder: ['planlagte koersel har ikke gjort sit arbejde'],
});

proev('gbp + motor + AFVENTER DATO', {
  kanal: 'gbp', metode: 'motor', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-14T09:00:00.000+02:00',
}, {
  fejl: true,
  indeholder: ['planlagte koersel har ikke gjort sit arbejde'],
});

console.log('\nAfleveret til platformen: paamindelse, ingen alarm');

proev('facebook + PLANLAGT (Meta har kvitteret)', {
  kanal: 'facebook', metode: 'motor', status: 'PLANLAGT',
  tidspunkt: '2026-10-15T19:00:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['planlagt hos Meta', 'Bekraeft selv'],
  indeholder_ikke: ['Manuel publicering eller bekraeftelse mangler'],
});

proev('linkedin + PLANLAGT MANUELT (ligger i platformens planlaegger)', {
  kanal: 'linkedin', metode: 'manuel', status: 'PLANLAGT MANUELT',
  tidspunkt: '2026-10-13T08:00:00.000+02:00',
}, {
  fejl: false,
  indeholder: ['planlagt i platformens brugerflade', 'Bekraeft selv'],
  indeholder_ikke: ['Manuel publicering eller bekraeftelse mangler', 'hos Meta'],
});

console.log('\nWebsite uden url kan ikke kontrolleres');

proev('website + motor + AFVENTER DATO uden url', {
  kanal: 'website', metode: 'motor', status: 'AFVENTER DATO',
  tidspunkt: '2026-10-02T07:00:00.000+02:00', laasefil: null, url: null,
}, {
  fejl: true,
  indeholder: ['website uden url i koeen'],
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

/* Den faelles driftsstruktur. Proever de egenskaber, hele pointen hviler paa:
   ingen dubletter, ingen genaabning af lukkede opgaver, ingen gentagne
   spoergsmaal til Kristian, og en synkronisering der kan koeres igen. */

import assert from 'node:assert/strict';
import {
  valider, opretEllerOpdater, luk, genaabn, maaSpoergeKristian, placer,
  findesAllerede, aabne, forAnsvarlig, AABNE, STATUSSER, ANSVARLIGE,
} from '../scripts/drift.mjs';
import { synkroniser, fundTilOpgave, iOrdenLukker } from '../scripts/synkroniser-drift.mjs';

let n = 0;
const proev = (navn, f) => { f(); n++; console.log('  ok', navn); };

const tomt = () => ({ version: 1, opdateret: null, opgaver: [] });
const grund = (over = {}) => ({
  id: 'T-1', titel: 'En opgave', ansvarlig: 'codex', prioritet: 'mellem',
  status: 'aaben', kilde: [{ type: 'proeve', ref: 1 }], naeste_handling: 'goer noget', ...over,
});

console.log('DRIFTSSTRUKTUR');

/* ── Validering ─────────────────────────────────────────────────────────── */

proev('en gyldig opgave slipper igennem', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  assert.deepEqual(valider(d), []);
});

proev('to opgaver med samme id fanges', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  d.opgaver.push(JSON.parse(JSON.stringify(d.opgaver[0])));
  assert.ok(valider(d).some((f) => /findes mere end én gang/.test(f)));
});

proev('en aaben opgave uden naeste handling fanges', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  d.opgaver[0].naeste_handling = null;
  assert.ok(valider(d).some((f) => /aaben uden naeste handling/.test(f)));
});

proev('en lukket opgave uden bevis fanges', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  d.opgaver[0].status = 'lukket';
  assert.ok(valider(d).some((f) => /lukket uden bevis/.test(f)));
});

proev('en afhaengighed til en ukendt opgave fanges', () => {
  const d = tomt(); opretEllerOpdater(d, grund({ afhaengigheder: ['findes-ikke'] }));
  assert.ok(valider(d).some((f) => /ukendt opgave/.test(f)));
});

proev('ukendt ansvarlig og status fanges', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  d.opgaver[0].ansvarlig = 'nogen';
  d.opgaver[0].status = 'maaske';
  const f = valider(d);
  assert.ok(f.some((x) => /ukendt ansvarlig/.test(x)));
  assert.ok(f.some((x) => /ukendt status/.test(x)));
});

/* ── Ingen dubletter, ingen genaabning ──────────────────────────────────── */

proev('samme id to gange giver én opgave', () => {
  const d = tomt();
  assert.equal(opretEllerOpdater(d, grund()).handling, 'oprettet');
  assert.equal(opretEllerOpdater(d, grund()).handling, 'uaendret');
  assert.equal(d.opgaver.length, 1);
});

proev('en uaendret opgave roeres ikke — ingen stoej i diffen', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  const foer = JSON.stringify(d.opgaver[0]);
  opretEllerOpdater(d, grund());
  assert.equal(JSON.stringify(d.opgaver[0]), foer);
});

proev('en LUKKET opgave genaabnes ikke af en synkronisering', () => {
  // Det var denne fejl, der fik afsluttede krav til at dukke op igen.
  const d = tomt(); opretEllerOpdater(d, grund());
  luk(d, 'T-1', 'bevis');
  const r = opretEllerOpdater(d, grund({ status: 'aaben', naeste_handling: 'goer det igen' }));
  assert.equal(r.handling, 'sprunget over (lukket)');
  assert.equal(d.opgaver[0].status, 'lukket');
});

proev('genaabning kraever en grund og bliver staaende i historikken', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  luk(d, 'T-1', 'bevis');
  assert.throws(() => genaabn(d, 'T-1', ''), /uden en grund/);
  genaabn(d, 'T-1', 'fejlen er tilbage');
  assert.equal(d.opgaver[0].status, 'aaben');
  assert.equal(d.opgaver[0].afslutning, null);
  const sidste = d.opgaver[0].historik.at(-1).hvad;
  assert.match(sidste, /genaabnet: fejlen er tilbage/);
  assert.match(sidste, /var lukket/, 'den tidligere lukning skal kunne efterproeves');
});

proev('en opgave kan ikke lukkes uden bevis', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  assert.throws(() => luk(d, 'T-1', ''), /uden bevis/);
});

proev('et menneskes prioritet overskrives ikke maskinelt', () => {
  const d = tomt(); opretEllerOpdater(d, grund({ prioritet: 'hoej' }));
  opretEllerOpdater(d, grund({ prioritet: 'lav' }), { af: 'synkronisering' });
  assert.equal(d.opgaver[0].prioritet, 'hoej');
  opretEllerOpdater(d, grund({ prioritet: 'lav' }), { af: 'kristian', tvingende: true });
  assert.equal(d.opgaver[0].prioritet, 'lav');
});

proev('kilder samles frem for at erstatte hinanden', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  opretEllerOpdater(d, grund({ kilde: [{ type: 'pr', ref: 109 }] }));
  assert.equal(d.opgaver[0].kilde.length, 2);
  opretEllerOpdater(d, grund({ kilde: [{ type: 'pr', ref: 109 }] }));
  assert.equal(d.opgaver[0].kilde.length, 2, 'den samme kilde maa ikke komme to gange');
});

proev('historikken foejes til, aldrig erstattet', () => {
  const d = tomt(); opretEllerOpdater(d, grund());
  opretEllerOpdater(d, grund({ naeste_handling: 'noget andet' }));
  luk(d, 'T-1', 'bevis');
  assert.ok(d.opgaver[0].historik.length >= 3);
  assert.equal(d.opgaver[0].historik[0].hvad, 'oprettet');
});

/* ── Spaerren mod at spoerge Kristian igen ──────────────────────────────── */

const BESL = { beslutninger: [{ emne: 'google-ads', beslutning: 'maa ikke aktiveres uden godkendelse', dato: '2026-11-02', kilde: 'dok' }] };

proev('en allerede truffet beslutning spoerges der ikke om igen', () => {
  const r = maaSpoergeKristian({ id: 'D2-google-ads-opstart', emne: 'google-ads', art: 'beslutning' }, { beslutninger: BESL });
  assert.equal(r.maa, false);
  assert.match(r.grund, /beslutningen findes allerede/);
});

proev('en merget PR lukker spoergsmaalet', () => {
  const r = maaSpoergeKristian({ id: 'X', art: 'godkendelse', pr: [109] }, { mergedePRer: [108, 109] });
  assert.equal(r.maa, false);
  assert.match(r.grund, /PR #109 er allerede merget/);
});

proev('noget allerede implementeret spoerges der ikke om', () => {
  const r = maaSpoergeKristian({ id: 'X', art: 'godkendelse' }, { implementeret: true });
  assert.equal(r.maa, false);
});

proev('en nyere groen produktionskontrol lukker spoergsmaalet', () => {
  const r = maaSpoergeKristian(
    { id: 'X', art: 'godkendelse', rejst: '2026-11-01T00:00:00Z', verificeres_af_produktionskontrol: true },
    { produktionskontrol: { tid: '2026-11-02T18:02:00Z', resultat: 'OK' } });
  assert.equal(r.maa, false);
  assert.match(r.grund, /nyere produktionskontrol/);
});

proev('en teknisk mangel er ikke et spoergsmaal til Kristian', () => {
  const r = maaSpoergeKristian({ id: 'X', art: 'teknisk' }, {});
  assert.equal(r.maa, false);
  assert.match(r.grund, /ikke noget, Kristian skal afgoere/);
});

proev('en rigtig beslutning naar frem til Kristian', () => {
  const r = maaSpoergeKristian({ id: 'noget-nyt', emne: 'noget-nyt', art: 'penge' }, { beslutninger: BESL });
  assert.equal(r.maa, true);
});

/* ── Placering hos den rigtige ──────────────────────────────────────────── */

proev('manglende indhold er Claudes, teknik er Codex, penge er Kristians', () => {
  assert.equal(placer({ art: 'indhold' }), 'claude');
  assert.equal(placer({ art: 'redaktionel' }), 'claude');
  assert.equal(placer({ art: 'teknisk' }), 'codex');
  assert.equal(placer({ art: 'adgang' }), 'kristian');
  assert.equal(placer({ art: 'penge' }), 'kristian');
  assert.equal(placer({}), 'codex', 'ukendt art falder til Codex, ikke til Kristian');
});

/* ── Vagthundens fund bliver til opgaver ────────────────────────────────── */

proev('samme forhold giver samme id, uanset ordlyd', () => {
  const a = fundTilOpgave({ omraade: 'Actions', tekst: 'Instagram koerte sidst for 9 timer siden' }, 'bekraeft');
  const b = fundTilOpgave({ omraade: 'Actions', tekst: 'Instagram koerte sidst for 14 timer siden' }, 'fejl');
  assert.equal(a.id, b.id, 'ellers vokser listen med én post pr. kontrol');
});

proev('et ukendt omraade bliver ikke til en opgave', () => {
  assert.equal(fundTilOpgave({ omraade: 'Noget', tekst: 'hvad som helst' }, 'fejl'), null);
});

proev('en vagthundfejl bliver til én opgave, ogsaa ved gentagne koersler', () => {
  const d = tomt();
  const vagthund = {
    fejl: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget for 40 timer siden' }],
    bekraeft_selv: [], i_orden: [],
  };
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund });
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund });
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund });
  assert.equal(d.opgaver.filter((o) => o.id === 'drift-netlify-byg').length, 1);
  assert.deepEqual(valider(d), []);
});

proev('et forhold i orden lukker opgaven med vagthundens eget bevis', () => {
  const d = tomt();
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget for 40 timer siden' }],
    bekraeft_selv: [], i_orden: [] } });
  assert.equal(d.opgaver[0].status, 'aaben');
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [], bekraeft_selv: [],
    i_orden: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget 2026-11-02 18:00 UTC' }] } });
  assert.equal(d.opgaver[0].status, 'lukket');
  assert.match(d.opgaver[0].afslutning.bevis, /vagthunden:/);
});

proev('en lukket opgave bliver ikke genaabnet af en ny synkronisering', () => {
  const d = tomt();
  opretEllerOpdater(d, grund({ id: 'drift-netlify-byg' }));
  luk(d, 'drift-netlify-byg', 'rettet og verificeret');
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget for 40 timer siden' }],
    bekraeft_selv: [], i_orden: [] } });
  assert.equal(d.opgaver[0].status, 'lukket', 'synkronisering maa ikke genaabne; det kraever genaabn()');
});

proev('en blokeret opgave staar ikke som noget, nogen kan gaa i gang med', () => {
  const d = tomt();
  opretEllerOpdater(d, grund({ id: 'A' }));
  opretEllerOpdater(d, grund({ id: 'B', afhaengigheder: ['A'] }));
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null });
  assert.equal(d.opgaver.find((o) => o.id === 'B').status, 'afventer-haendelse');
  luk(d, 'A', 'gjort');
  // Naar A er lukket, skal B ikke laengere vaere blokeret — men den skal
  // saettes manuelt i gang, ikke af synkroniseringen. Den aabner ikke noget.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null });
  assert.equal(d.opgaver.find((o) => o.id === 'B').status, 'afventer-haendelse');
});

/* ── Opslag ─────────────────────────────────────────────────────────────── */

proev('aabne og forAnsvarlig skiller rigtigt', () => {
  const d = tomt();
  opretEllerOpdater(d, grund({ id: 'A', ansvarlig: 'claude' }));
  opretEllerOpdater(d, grund({ id: 'B', ansvarlig: 'codex' }));
  opretEllerOpdater(d, grund({ id: 'C', ansvarlig: 'codex' }));
  luk(d, 'C', 'gjort');
  assert.equal(aabne(d).length, 2);
  assert.equal(forAnsvarlig(d, 'codex').length, 1);
  assert.ok(findesAllerede(d, 'A'));
  assert.equal(findesAllerede(d, 'C'), null, 'en lukket opgave findes ikke «allerede aaben»');
});

/* ── Det rigtige register ───────────────────────────────────────────────── */

proev('det rigtige drift/opgaver.json er gyldigt', async () => {
  const { laesOpgaver } = await import('../scripts/drift.mjs');
  assert.deepEqual(valider(laesOpgaver('drift/opgaver.json')), []);
});

proev('alle roller og statusser i registeret er kendte', async () => {
  const { laesOpgaver } = await import('../scripts/drift.mjs');
  for (const o of laesOpgaver('drift/opgaver.json').opgaver) {
    assert.ok(ANSVARLIGE.includes(o.ansvarlig));
    assert.ok(STATUSSER.includes(o.status));
  }
});

proev('ingen opgave hos Kristian uden at det er en rigtig beslutning', async () => {
  const { laesOpgaver, laesBeslutninger } = await import('../scripts/drift.mjs');
  const d = laesOpgaver('drift/opgaver.json');
  const b = laesBeslutninger('drift/beslutninger.json');
  for (const o of d.opgaver.filter((x) => x.ansvarlig === 'kristian' && AABNE.includes(x.status))) {
    // Den skal kunne begrundes: enten penge, adgang eller en beslutning, der
    // IKKE allerede staar i beslutningsregisteret som truffet.
    const truffet = b.beslutninger.find((x) => o.id.toLowerCase().includes(String(x.emne).toLowerCase())
      && !/maa ikke|uden godkendelse|ikke aktiveret/i.test(x.beslutning));
    assert.ok(!truffet, `${o.id} ligger hos Kristian, men beslutningen er allerede truffet: ${truffet?.beslutning}`);
  }
});


/* ── Skrivningen maa ikke larme ──────────────────────────────────────────
   «opdateret» aendrede sig ved hver koersel, saa en genkoersel altid gav en
   diff. Det larmer i historikken og faar gatens idempotenskontrol til at
   fejle uden grund. */

proev('skrivOpgaver roerer ikke filen, naar intet er aendret', async () => {
  const { skrivOpgaver, laesOpgaver } = await import('../scripts/drift.mjs');
  const { writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const sti = '/tmp/proeve-opgaver.json';
  const d = tomt();
  opretEllerOpdater(d, grund());
  writeFileSync(sti, JSON.stringify({ ...d, opdateret: '2026-01-01T00:00:00.000Z' }, null, 2) + '\n');

  const foer = readFileSync(sti, 'utf8');
  const r = skrivOpgaver(laesOpgaver(sti), sti);
  assert.equal(r.skrevet, false);
  assert.equal(readFileSync(sti, 'utf8'), foer, 'filen blev roert uden grund');

  const d2 = laesOpgaver(sti);
  opretEllerOpdater(d2, grund({ id: 'T-2' }));
  assert.equal(skrivOpgaver(d2, sti).skrevet, true);
  assert.notEqual(readFileSync(sti, 'utf8'), foer);
  rmSync(sti);
});

console.log(`\n${n} proever bestaaet i alt.`);

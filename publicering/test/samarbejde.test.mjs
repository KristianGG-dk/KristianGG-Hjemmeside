/* De fem scenarier. Her proeves SAMARBEJDET, ikke modulerne hver for sig.
   ============================================================================
   En groen proeve af et enkelt modul beviser ingenting om, at Claude, Codex,
   motoren og vagthunden faktisk taler sammen. Hvert scenarie herunder koerer
   hele kaeden igennem med attrapper for GitHub og driften.                  */

import assert from 'node:assert/strict';
import {
  laesOpgaver, opretEllerOpdater, luk, genaabn, valider, AABNE,
} from '../scripts/drift.mjs';
import { synkroniser } from '../scripts/synkroniser-drift.mjs';
import { issuesTilOpgaver, opgaveId, KVITTERING } from '../scripts/overdragelse.mjs';

let n = 0;
const proev = (navn, f) => { f(); n++; console.log('  ok', navn); };
const tomt = () => ({ version: 1, opdateret: null, opgaver: [] });
const BESL = { beslutninger: [] };

console.log('SAMARBEJDET — fem scenarier\n');

/* ══ A — Teknisk fejl hele vejen rundt ═══════════════════════════════════ */

proev('A: fejl → Codex → rettet → deploy verificeret → Claude kan se det', () => {
  const d = tomt();

  // 1. Vagthunden opdager, at Netlify ikke har bygget.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget for 40 timer siden' }],
    bekraeft_selv: [], i_orden: [] } });

  const o = d.opgaver.find((x) => x.id === 'drift-netlify-byg');
  assert.ok(o, 'fejlen blev ikke til en opgave');
  assert.equal(o.ansvarlig, 'codex', 'en teknisk fejl skal til Codex, ikke til Kristian');
  assert.equal(o.status, 'aaben');
  assert.ok(o.kilde.some((k) => k.type === 'vagthund'), 'opgaven mangler dokumenteret kilde');

  // 2. Vagthunden koerer igen, mens Codex arbejder. Ingen dublet.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [{ omraade: 'Netlify', tekst: 'sitet blev sidst bygget for 46 timer siden' }],
    bekraeft_selv: [], i_orden: [] } });
  assert.equal(d.opgaver.filter((x) => x.id === 'drift-netlify-byg').length, 1);

  // 3. Rettelsen er deployet, og vagthunden ser det. Opgaven lukkes med bevis.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [], bekraeft_selv: [],
    i_orden: [{ omraade: 'Netlify', tekst: 'produktionen koerer den samme commit som main (c223a85)' }] } });
  assert.equal(o.status, 'lukket');
  assert.match(o.afslutning.bevis, /c223a85/, 'beviset skal kunne efterproeves');

  // 4. Claude kan se resultatet: opgaven er ikke laengere aaben nogen steder.
  assert.equal(d.opgaver.filter((x) => AABNE.includes(x.status)).length, 0);
  assert.deepEqual(valider(d), []);
});

/* ══ B — Indholdsopgave med godkendelseskravet i behold ══════════════════ */

proev('B: Claude melder ind → opgaven staar i registeret → kvittering → godkendelse kraeves', () => {
  const d = tomt();
  const issue = {
    number: 200, state: 'open', title: 'Blogindlaeg om vinterterapi mangler',
    labels: [{ name: 'til-claude' }],
    body: 'Der er hul i kalenderen i uge 49.\n\n## Naeste handling\nSkriv udkast og laeg det i godkendelsespakken.',
  };

  const { kvitteringer } = synkroniser({
    opgaver: d, beslutninger: BESL, vagthund: null, issues: [issue] });

  const o = d.opgaver.find((x) => x.id === opgaveId(200));
  assert.ok(o, 'issuet blev ikke til en opgave');
  assert.equal(o.ansvarlig, 'claude');
  assert.equal(o.naeste_handling, 'Skriv udkast og laeg det i godkendelsespakken.',
    '«Naeste handling» fra issuet skal gaa igen i opgaven');

  // Kvitteringen er beviset paa, at overdragelsen er modtaget.
  assert.equal(kvitteringer.length, 1);
  assert.equal(kvitteringer[0].nummer, 200);
  assert.match(kvitteringer[0].krop, /optaget i det faelles opgaveregister/i);
  assert.ok(kvitteringer[0].krop.includes(KVITTERING), 'kvitteringen mangler sit maerke');

  // Koeres synkroniseringen igen, og issuet HAR faaet sin kvittering, skrives
  // der ikke en til. Ellers ville issuet fyldes med gentagelser.
  const r2 = synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null,
    issues: [{ ...issue, har_kvittering: true }], harKvittering: (i) => Boolean(i.har_kvittering) });
  assert.equal(r2.kvitteringer.length, 0);
  assert.equal(d.opgaver.length, 1, 'ingen dublet ved genkoersel');

  // Et LUKKET issue goer ikke opgaven faerdig — kun verificeret drift goer det.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null,
    issues: [{ ...issue, state: 'closed' }] });
  assert.equal(o.status, 'loest');
  assert.notEqual(o.status, 'lukket', 'et lukket issue er ikke en verificering');
});

/* ══ C — Et gammelt datagrundlag naevner en afsluttet opgave ═════════════ */

proev('C: afsluttet opgave genopstaar ikke, og Kristian spoerges ikke igen', () => {
  const d = tomt();

  // Opgaven blev lukket, da billedproeven bestod.
  opretEllerOpdater(d, {
    id: 'K1-linkedin-billedproeve', titel: 'LinkedIn-billedproeve',
    ansvarlig: 'codex', prioritet: 'hoej', status: 'aaben',
    kilde: [{ type: 'actions-run', ref: 41353997314 }], naeste_handling: 'koer proeven',
  });
  luk(d, 'K1-linkedin-billedproeve', 'bestod 2026-11-01 21:49, API-version 202610, PUT');

  // En gammel opgaveliste melder den ind igen — som et issue OG som et
  // vagthundfund. Ingen af delene maa genaabne den.
  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null, issues: [{
    number: 1, state: 'open', title: 'LinkedIn-billedproeve', labels: [{ name: 'til-codex' }],
    body: 'Billedproeven skal gennemfoeres.' }] });

  const gammel = d.opgaver.find((x) => x.id === 'K1-linkedin-billedproeve');
  assert.equal(gammel.status, 'lukket', 'den afsluttede opgave blev genaabnet');

  // Issuet bliver til sin EGEN opgave (issue-1) — den maa gerne findes, men
  // den gamle er stadig lukket og baerer sit bevis.
  assert.ok(gammel.afslutning.bevis.includes('202610'));

  // En faktisk NY fejl skal derimod kunne registreres — med revisionsspor.
  genaabn(d, 'K1-linkedin-billedproeve', 'billedupload fejler igen efter LinkedIns versionsskift 2026-12');
  assert.equal(gammel.status, 'aaben');
  const sidste = gammel.historik.at(-1).hvad;
  assert.match(sidste, /versionsskift/);
  assert.match(sidste, /var lukket/, 'den tidligere afslutning skal kunne efterproeves');
});

/* ══ D — Manglende livstegn ══════════════════════════════════════════════ */

proev('D: udloeseren svigter → Codex faar opgaven → rettelsen verificeres', () => {
  const d = tomt();

  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [{ omraade: 'Udloeser', tekst: 'sidste livstegn 2026-11-02 12:00 UTC — for 14 timer siden' }],
    bekraeft_selv: [], i_orden: [] } });

  const o = d.opgaver.find((x) => x.id === 'K4-paalidelig-udloeser');
  assert.ok(o, 'det manglende livstegn blev ikke til en opgave');
  assert.equal(o.ansvarlig, 'codex');
  assert.equal(o.prioritet, 'hoej', 'en FEJL skal have hoej prioritet');

  synkroniser({ opgaver: d, beslutninger: BESL, vagthund: {
    fejl: [], bekraeft_selv: [],
    i_orden: [{ omraade: 'Udloeser', tekst: 'den paalidelige udloeser er i drift: 3 af 12 koersler kom fra Netlify' }] } });
  assert.equal(o.status, 'lukket');
  assert.match(o.afslutning.bevis, /i drift/);
});

/* ══ E — En rigtig beslutning ════════════════════════════════════════════ */

proev('E: en rigtig beslutning vises én gang, og systemet gaar ikke videre selv', () => {
  const d = tomt();
  opretEllerOpdater(d, {
    id: 'D2-google-ads-opstart', titel: 'Google Ads kan oprettes',
    ansvarlig: 'kristian', prioritet: 'lav', status: 'afventer-kristian',
    kilde: [{ type: 'dokumentation', ref: 'dokumentation/google-ads.md' }],
    naeste_handling: 'Opret kontoen og giv mig AW-id og etiket.',
  });

  // Den staar hos Kristian, og den staar dér ÉN gang.
  const hos = d.opgaver.filter((x) => x.ansvarlig === 'kristian' && AABNE.includes(x.status));
  assert.equal(hos.length, 1);
  assert.ok(hos[0].naeste_handling, 'en beslutning uden beslutningsgrundlag kan ikke traeffes');
  assert.ok(hos[0].kilde.length, 'beslutningsgrundlaget skal kunne slaas op');

  // Gentagne synkroniseringer flytter den ikke og spoerger ikke igen.
  for (let i = 0; i < 3; i++) synkroniser({ opgaver: d, beslutninger: BESL, vagthund: null });
  assert.equal(d.opgaver.length, 1);
  assert.equal(d.opgaver[0].status, 'afventer-kristian');

  // Og systemet foretager sig intet: der er ingen opgave hos codex eller
  // motoren, der kunne gaa videre uden svaret.
  assert.equal(d.opgaver.filter((x) => x.ansvarlig !== 'kristian').length, 0);

  // Naar beslutningen ER truffet, spoerges der ikke igen.
  const medBeslutning = { beslutninger: [{
    emne: 'google-ads', beslutning: 'Opret kontoen', dato: '2026-11-05', kilde: 'chat' }] };
  synkroniser({ opgaver: d, beslutninger: medBeslutning, vagthund: {
    fejl: [], bekraeft_selv: [], i_orden: [] } });
  assert.deepEqual(valider(d), []);
});

/* ══ Det rigtige register taaler hele moellen ════════════════════════════ */

proev('det rigtige register overlever ti synkroniseringer uden at aendre sig', () => {
  const d = laesOpgaver('drift/opgaver.json');
  const foer = JSON.stringify(d.opgaver);
  for (let i = 0; i < 10; i++) {
    synkroniser({ opgaver: d, beslutninger: BESL, vagthund: { fejl: [], bekraeft_selv: [], i_orden: [] } });
  }
  assert.equal(JSON.stringify(d.opgaver), foer);
  assert.deepEqual(valider(d), []);
});

console.log(`\n${n} scenarier bestaaet.`);

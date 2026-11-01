// Proever for researchmotorens fase 1.
// ============================================================================
// Koerer uden netadgang. Adaptere og relevansfilter proeves direkte mod
// attrapper; vurderingen koeres som en sort boks mod en midlertidig fundfil,
// samme model som vagthund.test.mjs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adapter, gyldigDato, lavRelevans, tekst } from '../research/lib.mjs';

const HER = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HER, '..', 'research');
const kat = JSON.parse(fs.readFileSync(path.join(R, 'kilder.json'), 'utf8'));
const noter = [];
let fejl = 0;
const proev = (navn, fn) => { try { fn(); noter.push(navn); } catch (e) { fejl++; console.log('  x', navn, '\n    ', e.message); } };

proev('RSS-adapteren laeser titel, link, dato og resume', () => {
  const xml = `<rss><channel>
    <item><title>Skovbad og stress</title><link>https://a.dk/1</link>
      <pubDate>Fri, 31 Oct 2026 09:00:00 +0100</pubDate><description><![CDATA[Om <b>naturterapi</b>]]></description></item>
    <item><title>Noget andet</title><link>https://a.dk/2</link><pubDate>Thu, 30 Oct 2026 09:00:00 +0100</pubDate></item>
  </channel></rss>`;
  const p = adapter.rss(xml);
  assert.equal(p.length, 2);
  assert.equal(p[0].titel, 'Skovbad og stress');
  assert.equal(p[0].url, 'https://a.dk/1');
  assert.equal(p[0].dato.toISOString().slice(0, 10), '2026-10-31');
  assert.equal(p[0].resume, 'Om naturterapi', 'CDATA og markup skal vaere fjernet');
});

proev('Atom-poster laeses ogsaa', () => {
  const xml = `<feed><entry><title>Aandedraet og nervesystem</title>
    <link href="https://b.dk/x"/><updated>2026-10-29T10:00:00Z</updated><summary>Om vagus</summary></entry></feed>`;
  const p = adapter.rss(xml);
  assert.equal(p.length, 1);
  assert.equal(p[0].url, 'https://b.dk/x');
});

proev('Fremtidige datoer afvises — Crossref meldte aar 2121 i fase 0', () => {
  assert.equal(gyldigDato('2121-10-01'), null);
  assert.equal(gyldigDato('ikke en dato'), null);
  assert.ok(gyldigDato('2026-10-30') instanceof Date);
});

proev('Crossref-adapteren samler dato af date-parts og afviser fremtiden', () => {
  const j = JSON.stringify({ message: { items: [
    { title: ['Nature therapy'], DOI: '10/x', URL: 'https://doi.org/10/x', published: { 'date-parts': [[2026, 10, 2]] } },
    { title: ['Fremtiden'], DOI: '10/y', URL: 'https://doi.org/10/y', published: { 'date-parts': [[2121, 10, 1]] } } ] } });
  const p = adapter['api-crossref'](j);
  assert.equal(p[0].dato.toISOString().slice(0, 10), '2026-10-02');
  assert.equal(p[1].dato, null, 'aar 2121 maa ikke slippe igennem');
});

proev('medRxiv markeres som ikke fagfaellebedoemt', () => {
  const p = adapter['api-medrxiv'](JSON.stringify({ collection: [{ title: 'T', doi: '10/z', date: '2026-10-20', abstract: 'A' }] }));
  assert.equal(p[0].fagfaellebedoemt, false);
});

proev('Ordgraensen rammer ord, ikke tegnfoelger — genterapi er ikke terapi', () => {
  const rel = lavRelevans(kat.emneord);
  assert.equal(rel({ titel: 'Optogenetisk behandling', resume: 'genterapi til nethinden' }).relevant, false);
  assert.equal(rel({ titel: 'Stress og trivsel paa arbejdspladsen', resume: 'sygefravaer' }).relevant, true);
});

proev('Ét generisk ord alene kvalificerer aldrig', () => {
  const rel = lavRelevans(kat.emneord);
  const v = rel({ titel: 'Noget om stress', resume: 'intet andet' });
  assert.equal(v.relevant, false);
  assert.match(v.grund, /kun ét generisk ord/);
  assert.equal(rel({ titel: 'Stress og angst', resume: 'og soevn' }).relevant, true, 'to generiske skal raekke');
});

proev('Ét specifikt ord raekker', () => {
  const rel = lavRelevans(kat.emneord);
  const v = rel({ titel: 'Nyt studie om skovbad', resume: '' });
  assert.equal(v.relevant, true);
  assert.deepEqual(v.specifikke, ['skovbad']);
});

proev('Vetoet afviser de tvetydige fagord fra demonstrationen', () => {
  const rel = lavRelevans(kat.emneord);
  for (const [t, r] of [
    ['Drought Stress, Soil Salinity and Diesel Oil', 'biodegradation'],
    ['Stress and Periodontal Disease', 'tandkoed'],
    ['Germinability in Passiflora seeds under salt stress', ''],
    ['Forslag om stop for nye datacentre', 'regulering'],
    ['EU-aftale om veterinaerspoergsmaal', 'Det Europaeiske Faellesskab'],
  ]) {
    const v = rel({ titel: t, resume: r });
    assert.equal(v.relevant, false, `${t} skulle vaere afvist`);
    assert.match(v.grund, /udelukket af/);
  }
});

proev('De rigtige fund fra demonstrationen slipper stadig igennem', () => {
  const rel = lavRelevans(kat.emneord);
  for (const t of [
    'Mindfulness and forest bath for arterial hypertension',
    'Acute Effects of Two Slow-Paced Breathing Protocols on Heart Rate Variability',
    'How the Acute Psychosocial Stress Response Ends: Vagal Re-Engagement',
    'Intensive Interventions for Burnout, Stress and Occupational Well-Being',
  ]) assert.equal(rel({ titel: t, resume: '' }).relevant, true, `${t} skulle vaere beholdt`);
});

proev('tekst() afkoder entiteter — fejlen der ramte fase 0', () => {
  assert.equal(tekst('a &amp; b'), 'a & b');
  assert.equal(tekst('<p>Hej   der</p>'), 'Hej der');
});

proev('Ordforraadet er delt i specifikke, generiske og udelukkelsesord', () => {
  assert.ok(kat.emneord.specifikke.length > 20);
  assert.ok(kat.emneord.generiske.length > 10);
  assert.ok(kat.emneord.udelukkelsesord.ord.length > 10);
  const spec = new Set(kat.emneord.specifikke);
  for (const g of kat.emneord.generiske) assert.ok(!spec.has(g), `${g} staar baade som specifik og generisk`);
});

proev('Alle kilder har prioritet 1-4 og et kendt evidensniveau', () => {
  for (const k of kat.kilder) {
    assert.ok([1, 2, 3, 4].includes(k.prioritet), `${k.id} mangler gyldig prioritet`);
    assert.ok(kat.evidensniveauer[k.evidens], `${k.id} har ukendt evidensniveau ${k.evidens}`);
    assert.ok(k.metode === 'rss' || k.metode === 'sitemap' || adapter[k.metode], `${k.id} har ingen adapter til ${k.metode}`);
  }
});

proev('Fravalgte kilder baerer en begrundelse', () => {
  for (const f of kat.fravalgte || []) assert.ok(f.hvorfor && f.hvorfor.length > 20, `${f.id} mangler begrundelse`);
});

// ── vurderingen som sort boks ──────────────────────────────────────────────
proev('Vurderingen vaelger A naar en side allerede daekker emnet', () => {
  const uge = '1999-01';
  const fil = path.join(R, 'fund', `${uge}.json`);
  fs.mkdirSync(path.join(R, 'fund'), { recursive: true });
  fs.writeFileSync(fil, JSON.stringify({ uge, koert: new Date().toISOString(), kildestatus: [], antal: 1, fund: [
    { id: 'a', titelhash: 'b', kilde: 'europepmc', kildenavn: 'Europe PMC', prioritet: 4, evidens: 'primaer',
      titel: 'Nyt studie om skovbad og stress', url: 'https://doi.org/10/test', dato: '2026-10-30',
      resume: 'naturterapi og stress', emneord: ['skovbad', 'stress', 'naturterapi'] }] }, null, 2));
  try {
    const ud = execFileSync('node', [path.join(R, 'vurder.mjs'), uge], { encoding: 'utf8' });
    assert.match(ud, /\*\*A\./, 'forvalget skal vaere A, naar en side daekker emnet');
    assert.match(ud, /skovbad/);
    assert.match(ud, /Prioritet 4/);
  } finally { fs.unlinkSync(fil); }
});

proev('Engelske fund finder danske sider — aekvivalensgrupperne', () => {
  const uge = '1999-04';
  const fil = path.join(R, 'fund', `${uge}.json`);
  fs.mkdirSync(path.join(R, 'fund'), { recursive: true });
  fs.writeFileSync(fil, JSON.stringify({ uge, koert: new Date().toISOString(), kildestatus: [], antal: 2, fund: [
    { id: 'e', titelhash: 'f', kilde: 'europepmc', kildenavn: 'Europe PMC', prioritet: 4, evidens: 'primaer',
      titel: 'Slow-Paced Breathing and Heart Rate Variability', url: 'https://doi.org/10/b', dato: '2026-10-06',
      resume: '', emneord: ['slow-paced breathing', 'heart rate variability'] },
    { id: 'g', titelhash: 'h', kilde: 'europepmc', kildenavn: 'Europe PMC', prioritet: 4, evidens: 'primaer',
      titel: 'Ecotherapy as restorative healing', url: 'https://doi.org/10/a', dato: '2026-10-14',
      resume: '', emneord: ['ecotherapy'] }] }, null, 2));
  try {
    const ud = execFileSync('node', [path.join(R, 'vurder.mjs'), uge], { encoding: 'utf8' });
    assert.match(ud, /nervesystemet/, 'engelsk aandedraetsstudie skal finde den danske nervesystemside');
    assert.doesNotMatch(ud, /Ingen eksisterende side deler nok emner/, 'begge fund skulle finde en side');
    assert.match(ud, /\*\*A\./);
  } finally { fs.unlinkSync(fil); }
});

proev('Forsiden vinder ikke over en emneside', () => {
  const uge = '1999-05';
  const fil = path.join(R, 'fund', `${uge}.json`);
  fs.writeFileSync(fil, JSON.stringify({ uge, koert: new Date().toISOString(), kildestatus: [], antal: 1, fund: [
    { id: 'i', titelhash: 'j', kilde: 'europepmc', kildenavn: 'Europe PMC', prioritet: 4, evidens: 'primaer',
      titel: 'Mindfulness and forest bath', url: 'https://doi.org/10/c', dato: '2026-10-01',
      resume: '', emneord: ['forest bath', 'mindfulness'] }] }, null, 2));
  try {
    const ud = execFileSync('node', [path.join(R, 'vurder.mjs'), uge], { encoding: 'utf8' });
    const m = ud.match(/Naermeste side: (\S+)/);
    assert.ok(m, 'der skulle vaere et sidematch');
    assert.notEqual(m[1], '/', 'forsiden maa ikke vinde — den naevner alt');
    assert.match(m[1], /skovbad|naturterapi/, `forventede en skovbad-/naturterapiside, fik ${m[1]}`);
  } finally { fs.unlinkSync(fil); }
});

proev('Praeprint foerer til D og markeres', () => {
  const uge = '1999-02';
  const fil = path.join(R, 'fund', `${uge}.json`);
  fs.writeFileSync(fil, JSON.stringify({ uge, koert: new Date().toISOString(), kildestatus: [], antal: 1, fund: [
    { id: 'c', titelhash: 'd', kilde: 'medrxiv', kildenavn: 'medRxiv', prioritet: 4, evidens: 'praeprint',
      titel: 'Praeprint om et emne sitet ikke har', url: 'https://doi.org/10/pre', dato: '2026-10-28',
      resume: 'co-regulering i et nyt felt', emneord: ['co-regulering'] }] }, null, 2));
  try {
    const ud = execFileSync('node', [path.join(R, 'vurder.mjs'), uge], { encoding: 'utf8' });
    assert.match(ud, /\*\*D\./, 'praeprint uden daekkende side skal give D');
    assert.match(ud, /Praeprint/i);
  } finally { fs.unlinkSync(fil); }
});

proev('Tom uge siger det frem for at opfinde indhold', () => {
  const uge = '1999-03';
  const fil = path.join(R, 'fund', `${uge}.json`);
  fs.writeFileSync(fil, JSON.stringify({ uge, koert: new Date().toISOString(), kildestatus: [], antal: 0, fund: [] }, null, 2));
  try {
    const ud = execFileSync('node', [path.join(R, 'vurder.mjs'), uge], { encoding: 'utf8' });
    assert.match(ud, /Ingen vaesentlige nye emner/);
  } finally { fs.unlinkSync(fil); }
});

console.log('\nRESEARCHMOTOR — FASE 1\n' + '='.repeat(52) + '\n');
if (fejl) console.log(`FEJL (${fejl})\n`);
console.log('KONTROLLERET:');
for (const n of noter) console.log('  ·', n);
console.log('\nRESULTAT:', fejl ? 'FEJL FUNDET' : 'OK');
process.exit(fejl ? 1 : 0);

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

proev('Relevansfilteret frasorterer det, sitet ikke arbejder med', () => {
  const rel = lavRelevans(kat.emneord.ord);
  assert.equal(rel({ titel: 'Ny forskning i skovbad og stress', resume: '' }).relevant, true);
  assert.equal(rel({ titel: 'Landbrugsstoette til roedbeder', resume: 'EU' }).relevant, false);
  assert.deepEqual(rel({ titel: 'Angst og soevn', resume: '' }).ramte.sort(), ['angst', 'soevn']);
});

proev('tekst() afkoder entiteter — fejlen der ramte fase 0', () => {
  assert.equal(tekst('a &amp; b'), 'a & b');
  assert.equal(tekst('<p>Hej   der</p>'), 'Hej der');
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

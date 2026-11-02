/* Ét samlet overblik. Erstatter de separate rapporter.
   ============================================================================

   Kristian skal ikke laese tre lister, der siger det samme med forskellige
   ord. Denne skriver én, og den henter alt fra det faelles grundlag:

     drift/opgaver.json       hvem der skylder hvad
     drift/beslutninger.json  hvad der allerede er besluttet
     publicering/koe.json     hvad der staar for tur
     publicering/register.json hvad der er sket
     vagthundens --json       om driften er i orden lige nu (valgfrit)

   Fire afsnit, og ikke flere:

     FUNGERER            teknisk verificeret. Ikke «burde virke».
     ARBEJDES PAA        med ansvarlig og naeste handling.
     KRAEVER DIN BESLUTNING  kun det, systemet ikke selv kan afgoere.
     RISICI              kun det, der konkret kan ramme drift eller indtjening.

   Koeres:
     node publicering/scripts/status.mjs
     node publicering/scripts/status.mjs --vagthund /tmp/vagt.json
     node publicering/scripts/status.mjs --markdown                           */

import { readFileSync, existsSync } from 'node:fs';
import { laesOpgaver, laesBeslutninger, AABNE } from './drift.mjs';
import { HAENDELSER } from '../../netlify/functions/udloes-publicering.mjs';

const arg = process.argv.slice(2);
const md = arg.includes('--markdown');
const vi = arg.indexOf('--vagthund');
const vagtfil = vi !== -1 ? arg[vi + 1] : null;

const opgaver = laesOpgaver();
const beslutninger = laesBeslutninger();
const vagthund = vagtfil && existsSync(vagtfil) ? JSON.parse(readFileSync(vagtfil, 'utf8')) : null;
const koe = existsSync('publicering/koe.json') ? JSON.parse(readFileSync('publicering/koe.json', 'utf8')) : [];
const register = existsSync('publicering/register.json') ? JSON.parse(readFileSync('publicering/register.json', 'utf8')) : [];

const nu = new Date();
const H = (t) => (md ? `\n## ${t}\n` : `\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}\n`);
const P = (s) => (md ? `- ${s}` : `  ${s}`);
const ud = [];

ud.push(md ? `# Status for Kristian GG\n\n*${nu.toISOString().slice(0, 16).replace('T', ' ')} UTC*`
           : `STATUS FOR KRISTIAN GG — ${nu.toISOString().slice(0, 16).replace('T', ' ')} UTC`);

/* ── FUNGERER ────────────────────────────────────────────────────────────── */
ud.push(H('FUNGERER'));
const lukkede = opgaver.opgaver.filter((o) => o.status === 'lukket');
if (vagthund) {
  ud.push(P(`Vagthunden: **${vagthund.dom}** — ${vagthund.fejl.length} fejl, `
    + `${vagthund.bekraeft_selv.length} til egen bekraeftelse, ${vagthund.i_orden.length} i orden.`));
}
const publiceret = register.filter((r) => r.status === 'PUBLICERET').length;
ud.push(P(`Publiceringsmotoren: ${publiceret} opslag publiceret, ${koe.length} i koeen.`));
for (const o of lukkede.slice(-6)) {
  ud.push(P(`${o.titel} — ${o.afslutning.bevis.split('.')[0]}.`));
}
if (!lukkede.length) ud.push(P('(intet lukket endnu)'));

/* ── ARBEJDES PAA ────────────────────────────────────────────────────────── */
ud.push(H('ARBEJDES PAA'));
const igang = opgaver.opgaver
  .filter((o) => AABNE.includes(o.status) && o.ansvarlig !== 'kristian')
  .sort((a, b) => ['hoej', 'mellem', 'lav'].indexOf(a.prioritet) - ['hoej', 'mellem', 'lav'].indexOf(b.prioritet));
if (!igang.length) ud.push(P('(ingenting — alt er enten lukket eller hos dig)'));
for (const o of igang) {
  const frist = o.frist ? ` · frist ${o.frist}` : '';
  ud.push(P(`**${o.titel}**`));
  ud.push(P(`  ${o.ansvarlig} · ${o.status}${frist}`));
  ud.push(P(`  → ${o.naeste_handling}`));
}

/* ── KRAEVER DIN BESLUTNING ──────────────────────────────────────────────── */
ud.push(H('KRAEVER DIN BESLUTNING'));
const dine = opgaver.opgaver.filter((o) => AABNE.includes(o.status) && o.ansvarlig === 'kristian');
if (!dine.length) {
  ud.push(P('Ingenting. Alt, der kunne afgoeres uden dig, er afgjort.'));
}
for (const o of dine) {
  ud.push(P(`**${o.titel}**`));
  ud.push(P(`  → ${o.naeste_handling}`));
}

/* ── RISICI ──────────────────────────────────────────────────────────────── */
ud.push(H('RISICI'));
const risici = [];
if (vagthund?.fejl.length) {
  for (const f of vagthund.fejl) risici.push(`${f.omraade}: ${f.tekst}`);
}
// Et godkendt opslag, der forfalder inden for et doegn, og hvor kanalen ikke
// kan startes paalideligt, er en konkret risiko for at misse tidspunktet.
// Kun de kanaler, udloeseren FAKTISK styrer. «website» udkommer ved Netlifys
// genopbygning og «facebook» planlaegges hos Meta — ingen af dem afhaenger af
// udloeseren, og de hoerer derfor ikke hjemme i denne risiko.
const naeste = koe
  .filter((p) => p.metode === 'motor' && HAENDELSER[p.kanal] && new Date(p.tidspunkt) > nu)
  .sort((a, b) => a.tidspunkt.localeCompare(b.tidspunkt))[0];
if (naeste) {
  const timer = (new Date(naeste.tidspunkt) - nu) / 3600000;
  const udloeser = opgaver.opgaver.find((o) => o.id === 'K4-paalidelig-udloeser');
  if (timer < 48 && udloeser && udloeser.status !== 'lukket') {
    risici.push(`Naeste motorstyrede opslag er element ${naeste.element} (${naeste.kanal}) om `
      + `${Math.round(timer)} timer, og den paalidelige udloeser er endnu ikke verificeret. `
      + 'Opslaget bortfalder ikke — doegnvinduet daekker det — men det kan gaa ud for sent.');
  }
}
if (!risici.length) ud.push(P('Ingen kendte risici for drift, publicering eller indtjening.'));
for (const r of risici) ud.push(P(r));

/* ── Fodnote ─────────────────────────────────────────────────────────────── */
ud.push(md ? '\n---\n' : '\n' + '─'.repeat(66));
ud.push(md
  ? `*${opgaver.opgaver.length} opgaver i registeret, ${lukkede.length} lukket. `
    + `${beslutninger.beslutninger.length} beslutninger husket, saa du ikke spoerges igen. `
    + 'Kilde: `drift/opgaver.json` og `drift/beslutninger.json`.*'
  : `${opgaver.opgaver.length} opgaver (${lukkede.length} lukket) · `
    + `${beslutninger.beslutninger.length} huskede beslutninger · drift/opgaver.json`);

console.log(ud.join('\n'));

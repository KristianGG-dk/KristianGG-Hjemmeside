// Fase 1 — vurdering: hold ugens fund op mod sitet, og foreslaa hvad der skal ske.
// ============================================================================
//
// Motoren skal ikke bare finde nyheder. Den skal sige, om et fund hoerer til
// paa en side, der allerede findes — eller overhovedet hoerer til.
//
// Derfor er forvalget A: opdatér en eksisterende side. En ny artikel skal
// begrundes mod de sider, der allerede daekker emnet. Sitets svageste punkt er
// intern linkning til /til-dig/psykoterapi/ (se dokumentation/indholdsplan.md),
// og det bliver ikke bedre af at sprede vaerdien paa flere nye sider.
//
//   A  opdatér eksisterende side   — der findes en side, fundet styrker
//   B  ny artikel                  — emnet er relevant, ingen side daekker det
//   C  opslag paa LinkedIn/Facebook — aktuelt, men for tyndt til en side
//   D  afvent                      — dokumentationen baerer ikke endnu
//   E  ingen handling              — allerede daekket, tilfoejer intet
//
// Evidensniveauet afgoer, hvad et fund MAA foere til, ikke kun om det er
// interessant. Formidling og praeprint kan aldrig alene baere en ny side —
// de kan pege paa en primaerkilde, og det er den, der skal findes.
//
// Scriptet laeser kun. Det skriver intet til koe, register, laase eller
// indhold, og det godkender ingenting.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HER = path.dirname(fileURLToPath(import.meta.url));
const ROD = path.resolve(HER, '../..');
const FUND = path.join(HER, 'fund');
const kat = JSON.parse(fs.readFileSync(path.join(HER, 'kilder.json'), 'utf8'));
const ORD = kat.emneord.ord.map((o) => o.toLowerCase());

// ── sitets egne sider ──────────────────────────────────────────────────────
function sider() {
  const ud = [];
  const gaa = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { gaa(p); continue; }
      if (!f.name.endsWith('.md')) continue;
      const raa = fs.readFileSync(p, 'utf8');
      const fm = raa.match(/^---\n([\s\S]*?)\n---/);
      const hoved = fm ? fm[1] : '';
      if (/^draft:\s*true/m.test(hoved)) continue;
      const v = (n) => (hoved.match(new RegExp(`^${n}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1] || '';
      const rel = path.relative(path.join(ROD, 'content'), p).replace(/\\/g, '/');
      let url = '/' + rel.replace(/\.md$/, '/').replace(/_index\/$/, '');
      if (/^\/blog\//.test(url)) url = '/blog/' + (v('slug') || rel.split('/').pop().replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')) + '/';
      ud.push({ fil: rel, url, titel: v('title'), beskrivelse: v('description'),
        tekst: `${v('title')} ${v('description')} ${v('hero_title')} ${v('hero_subtitle')} ${raa.slice(hoved.length)}`.toLowerCase() });
    }
  };
  gaa(path.join(ROD, 'content'));
  return ud;
}

// Hvor godt daekker en side fundets emner? Vi taeller, hvor mange af fundets
// egne emneord siden ogsaa bruger — det er et groft maal, men det er aabent
// og kan efterproeves, og det er bedre end en uigennemsigtig lighedsscore.
function match(fund, s) {
  const ord = fund.emneord.length ? fund.emneord : ORD.filter((o) => `${fund.titel} ${fund.resume}`.toLowerCase().includes(o));
  if (!ord.length) return { score: 0, delte: [] };
  const delte = ord.filter((o) => s.tekst.includes(o));
  return { score: delte.length / ord.length, delte };
}

function beslut(f, bedste) {
  const svagKilde = f.evidens === 'formidling' || f.evidens === 'praeprint';
  if (bedste && bedste.score >= 0.75) {
    return svagKilde
      ? { valg: 'E', hvorfor: `${bedste.side.url} daekker allerede emnet, og ${f.evidens} kan ikke tilfoeje dokumentation. Fundet aendrer intet.` }
      : { valg: 'A', hvorfor: `${bedste.side.url} behandler emnet (${bedste.delte.join(', ')}). En primaerkilde fra ${f.kildenavn} kan styrke afsnittet frem for at blive en ny side.` };
  }
  if (bedste && bedste.score >= 0.4) {
    return { valg: 'A', hvorfor: `${bedste.side.url} er taettest paa (${bedste.delte.join(', ')}), men daekker kun delvist. Udbyg den side frem for at oprette en ny.` };
  }
  if (svagKilde) {
    return f.evidens === 'praeprint'
      ? { valg: 'D', hvorfor: 'Praeprint. Ikke fagfaellebedoemt og kan ikke baere en paastand. Afvent publicering, eller find primaerkilden.' }
      : { valg: 'C', hvorfor: `${f.kildenavn} er formidling, ikke dokumentation. Egner sig til et kort opslag — en side kraever en primaerkilde.` };
  }
  return { valg: 'B', hvorfor: `Ingen eksisterende side daekker emnet (bedste traef ${bedste ? Math.round(bedste.score * 100) + ' %' : 'ingen'}), og ${f.kildenavn} er ${f.evidens}. Kan baere en selvstaendig tekst.` };
}

// ── koersel ────────────────────────────────────────────────────────────────
const filer = fs.existsSync(FUND) ? fs.readdirSync(FUND).filter((f) => f.endsWith('.json')).sort() : [];
if (!filer.length) { console.error('Ingen fund at vurdere. Koer hent.mjs foerst.'); process.exit(1); }
const valgt = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) || filer[filer.length - 1].replace('.json', '');
const data = JSON.parse(fs.readFileSync(path.join(FUND, `${valgt}.json`), 'utf8'));
const S = sider();

const vurderet = data.fund.map((f) => {
  const traf = S.map((s) => ({ side: s, ...match(f, s) })).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  const bedste = traf[0];
  return { ...f, bedsteSide: bedste ? { url: bedste.side.url, titel: bedste.side.titel, score: Math.round(bedste.score * 100) } : null, ...beslut(f, bedste) };
});

const tael = (v) => vurderet.filter((x) => x.valg === v).length;
const L = [];
L.push(`## Research — uge ${valgt}`, '');
L.push(`${data.antal} nye relevante fund fra ${data.kildestatus.filter((k) => k.nye > 0).length} kilder.`,
       `A: ${tael('A')} · B: ${tael('B')} · C: ${tael('C')} · D: ${tael('D')} · E: ${tael('E')}`, '');

if (!vurderet.length) {
  L.push('**Ingen vaesentlige nye emner i denne uge.** Der produceres ikke indhold uden reel vaerdi.', '');
} else {
  for (const p of [1, 2, 3, 4]) {
    const g = vurderet.filter((v) => v.prioritet === p && v.valg !== 'E');
    if (!g.length) continue;
    L.push(`### Prioritet ${p} — ${kat.prioritering[p]}`, '');
    for (const v of g) {
      L.push(`**${v.valg}. ${v.titel}**`, '');
      L.push(`- Kilde: ${v.kildenavn} (${v.evidens})${v.dato ? `, ${v.dato}` : ''}`);
      L.push(`- ${v.url}`);
      if (v.bedsteSide) L.push(`- Naermeste side: ${v.bedsteSide.url} (${v.bedsteSide.score} % emneoverlap)`);
      L.push(`- Emner: ${v.emneord.join(', ')}`);
      L.push(`- **Vurdering:** ${v.hvorfor}`);
      if (v.evidens === 'praeprint') L.push('- ⚠ Praeprint — ikke fagfaellebedoemt. Maa ikke baere en paastand alene.');
      if (v.evidens === 'formidling') L.push('- ⚠ Formidling — maa ikke staa som dokumentation. Find primaerkilden.');
      L.push('');
    }
  }
  const e = vurderet.filter((v) => v.valg === 'E');
  if (e.length) { L.push(`### Ingen handling (${e.length})`, '');
    for (const v of e) L.push(`- ${v.titel} — ${v.hvorfor}`); L.push(''); }
}

L.push('### Kildestatus', '', '| Kilde | Prioritet | Status | Poster | Nye | Frasorteret | Gengangere |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const k of data.kildestatus) L.push(`| ${k.navn || k.id} | ${k.prioritet ?? '—'} | ${k.status} | ${k.poster ?? '—'} | ${k.nye ?? 0} | ${k.irrelevante ?? 0} | ${k.gengangere ?? 0} |`);
L.push('');
L.push('_Afsnittet er maskinskrevet af `publicering/research/vurder.mjs` og indsaettes i ugens godkendelsespakke. Intet heri er godkendt._');

const ud = L.join('\n');
if (process.argv.includes('--skriv')) {
  const f = path.join(HER, 'fund', `${valgt}-pakkeafsnit.md`);
  fs.writeFileSync(f, ud); process.stderr.write(`skrevet: ${f}\n`);
}
console.log(ud);

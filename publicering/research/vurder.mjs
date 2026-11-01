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
import { normaliser } from './lib.mjs';

const HER = path.dirname(fileURLToPath(import.meta.url));
const ROD = path.resolve(HER, '../..');
const FUND = path.join(HER, 'fund');
const kat = JSON.parse(fs.readFileSync(path.join(HER, 'kilder.json'), 'utf8'));

// Samme ordgraense som i relevansfilteret, saa et match betyder det samme
// de to steder.
function udtryk(ord) {
  const flugt = normaliser(ord).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
  return new RegExp(`(?<!\\p{L})${flugt}\\p{L}{0,3}(?!\\p{L})`, 'iu');
}
const SPEC = new Set((kat.emneord.specifikke || []).map(normaliser));

// Fund er ofte engelske, sitet er dansk. Uden aekvivalensgrupper finder
// «ecotherapy» aldrig /til-dig/naturterapi/, og motoren foreslaar en ny side
// dér, hvor den burde foreslaa en opdatering.
const GRUPPE = new Map();
for (const g of kat.emneord.aekvivalenter?.grupper || []) {
  const n = g.map(normaliser);
  for (const o of n) GRUPPE.set(o, n);
}
const ligner = (ord) => GRUPPE.get(normaliser(ord)) || [normaliser(ord)];

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
        normtitel: normaliser(`${v('title')} ${v('hero_title')}`),
        bred: url === '/' || /\/_index/.test(rel) || rel.endsWith('_index.md'),
        tekst: '', normkerne: normaliser(`${v('title')} ${v('description')} ${v('hero_title')} ${v('hero_subtitle')}`), normtekst: normaliser(`${v('title')} ${v('description')} ${v('hero_title')} ${v('hero_subtitle')} ${raa.slice(hoved.length)}`) });
    }
  };
  gaa(path.join(ROD, 'content'));
  return ud;
}

// Hvor godt daekker en side fundets emner?
//
// I demonstrationen gav ét emneord mod en side, der indeholdt det ord,
// 1 ÷ 1 = 100 %. Derfor stod der «100 % emneoverlap» paa naesten alt, og
// derfor «daekkede» blogindlaegget om viljestyrke et fund om en slange.
//
// Nu kraeves der et ABSOLUT overlap, ikke kun et forhold: mindst to delte
// ord, og mindst ét specifikt — eller tre generiske. Et specifikt ord vejer
// dobbelt. Rammer en side ikke det, er der intet match, og feltet staar tomt
// frem for at pege paa en tilfaeldig side.
const MIN_DELTE = 2;

function match(fund, s) {
  const ord = [...new Set((fund.emneord || []).map(normaliser))];
  if (!ord.length) return null;

  // Et emne taeller som delt, hvis siden bruger ET AF ordene i dets
  // aekvivalensgruppe — ikke kun praecis det ord, fundet brugte.
  const delte = [], iKerne = [], iTitel = [];
  for (const o of ord) {
    const varianter = ligner(o);
    if (varianter.some((v) => udtryk(v).test(s.normtekst))) {
      delte.push(o);
      if (varianter.some((v) => udtryk(v).test(s.normkerne))) iKerne.push(o);
      if (varianter.some((v) => udtryk(v).test(s.normtitel))) iTitel.push(o);
    }
  }
  if (!delte.length) return null;

  const spec = delte.filter((o) => SPEC.has(o));
  const specIKerne = iKerne.filter((o) => SPEC.has(o));

  // Et specifikt ord i sidens titel eller beskrivelse er et staerkt signal og
  // raekker alene. Ellers kraeves der absolut overlap, ikke bare et forhold:
  // det var 1 ÷ 1 = 100 %, der gjorde matchet meningsloest i foerste runde.
  const staerkt = specIKerne.length >= 1;
  if (!staerkt) {
    if (delte.length < MIN_DELTE) return null;
    if (!spec.length && delte.length < 3) return null;
  }

  const vaegt = spec.length * 2 + (delte.length - spec.length) + specIKerne.length;
  const maks = ord.filter((o) => SPEC.has(o)).length * 2 + ord.filter((o) => !SPEC.has(o)).length;
  return { score: maks ? Math.min(1, vaegt / maks) : 0, delte, specifikke: spec, antal: delte.length, staerkt,
    iTitel: iTitel.length, bred: !!s.bred };
}

function beslut(f, bedste) {
  const svagKilde = f.evidens === 'formidling' || f.evidens === 'praeprint';

  if (bedste) {
    if (svagKilde) {
      return { valg: 'E', hvorfor: `${bedste.side.url} daekker emnet (${bedste.delte.join(', ')}), og ${f.evidens} kan ikke tilfoeje dokumentation.` };
    }
    const hvor = bedste.staerkt ? 'behandler praecis dette emne' : bedste.score >= 0.7 ? 'behandler emnet' : 'er taettest paa, men daekker kun delvist';
    return { valg: 'A', hvorfor: `${bedste.side.url} ${hvor} — ${bedste.antal} delte emner (${bedste.delte.join(', ')}). En ${f.evidens === 'primaer' ? 'primaerkilde' : 'kilde'} fra ${f.kildenavn} kan styrke den side frem for at blive en ny.` };
  }

  // Intet sidematch. Hvad der saa maa ske, afgoeres af evidensniveauet.
  if (f.evidens === 'praeprint') return { valg: 'D', hvorfor: 'Praeprint, ikke fagfaellebedoemt, og ingen eksisterende side daekker emnet. Afvent publicering, eller find primaerkilden.' };
  if (f.evidens === 'formidling') return { valg: 'C', hvorfor: `${f.kildenavn} er formidling, ikke dokumentation. Kan baere et kort opslag — en side kraever en primaerkilde.` };
  if (f.evidens === 'fagmedie') return { valg: 'C', hvorfor: `${f.kildenavn} er fagmedie. Egner sig til et opslag; skal det blive en side, skal kilden bag findes foerst.` };
  return { valg: 'B', hvorfor: `Ingen eksisterende side deler mindst ${MIN_DELTE} emner med fundet, og ${f.kildenavn} er ${f.evidens}. Kan baere en selvstaendig tekst.` };
}

// ── koersel ────────────────────────────────────────────────────────────────
const filer = fs.existsSync(FUND) ? fs.readdirSync(FUND).filter((f) => f.endsWith('.json')).sort() : [];
if (!filer.length) { console.error('Ingen fund at vurdere. Koer hent.mjs foerst.'); process.exit(1); }
const valgt = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) || filer[filer.length - 1].replace('.json', '');
const data = JSON.parse(fs.readFileSync(path.join(FUND, `${valgt}.json`), 'utf8'));
const S = sider();

const vurderet = data.fund.map((f) => {
  // Rangering. En side, der baerer emnet i sin TITEL, slaar en side, der
  // blot naevner det i broedteksten. Forsiden og sektionsforsiderne naevner
  // alt og maa ikke vinde paa den konto — de rykkes bagerst ved lige stand.
  const traf = S.map((s) => { const m = match(f, s); return m ? { side: s, ...m } : null; })
    .filter(Boolean)
    .sort((a, b) => b.iTitel - a.iTitel || (a.bred - b.bred) || b.score - a.score || b.antal - a.antal);
  const bedste = traf[0];
  return { ...f, bedsteSide: bedste ? { url: bedste.side.url, titel: bedste.side.titel, score: Math.round(bedste.score * 100), antal: bedste.antal, delte: bedste.delte } : null, ...beslut(f, bedste) };
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
      if (v.bedsteSide) L.push(`- Naermeste side: ${v.bedsteSide.url} — ${v.bedsteSide.antal} delte emner (${v.bedsteSide.score} %)`);
      else L.push('- Ingen eksisterende side deler nok emner med fundet');
      L.push(`- Emner: ${v.emneord.join(', ')}${v.relevansgrund ? ` — ${v.relevansgrund}` : ''}`);
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
  // Pakkeafsnittet er AFLEDT output og hoerer ikke i fund/. Dér ligger kun
  // raadata som AAAA-UU.json, og vagten afviser med rette alt andet dér.
  const m = path.join(HER, 'pakkeafsnit');
  fs.mkdirSync(m, { recursive: true });
  const f = path.join(m, `${valgt}.md`);
  fs.writeFileSync(f, ud); process.stderr.write(`skrevet: ${f}\n`);
}
console.log(ud);

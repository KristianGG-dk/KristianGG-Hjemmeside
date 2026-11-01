// Fase 0 — afproevning af kandidatkilder.
// ============================================================================
//
// Hvorfor dette script findes:
//
// Udviklingsmiljoeet har ikke fri netadgang. WebFetch afvises af
// egress-politikken for stort set alle domaener — det er dokumenteret tre
// gange uafhaengigt i dette repo (dokumentation/api-undersoegelse.md,
// evidensregister.md, compliancekontrol.md) og bekraeftet igen 01-11-2026.
// En GitHub Actions-runner har derimod fri netadgang. Derfor koeres
// afproevningen dér og ikke i en Claude-session.
//
// Hvad scriptet GOER:
//   - henter hver kandidatkilde én gang
//   - maaler svar, format, antal poster, nyeste dato og opdateringstakt
//   - laeser robots.txt for hvert vaertsnavn og noterer, om stien er tilladt
//   - skriver en rapport
//
// Hvad scriptet ALDRIG goer:
//   - det roerer ikke koe, register, laase, indhold eller publicering
//   - det skriver intet til repoet af sig selv
//   - det bruger ingen hemmeligheder
//   - det afproever hver kilde én gang, sekventielt, med pause imellem
//
// Ingen nye afhaengigheder. package.json er produktionskode og roeres ikke,
// saa parsningen er bevidst regex-baseret frem for en XML-pakke. Det er
// rigeligt til en afproevning, hvor spoergsmaalet er «svarer kilden, og hvad
// er formatet» — ikke «kan vi parse hvert felt korrekt».

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HER = path.dirname(fileURLToPath(import.meta.url));
const UA = 'kristiangg.dk kildeafproevning (fase 0; kontakt kontakt@kristiangg.dk)';
const TIMEOUT_MS = 20000;
const PAUSE_MS = 1500;          // hoeflighed: ingen hamren paa en kilde
const robotsCache = new Map();

const sov = (ms) => new Promise((r) => setTimeout(r, ms));

async function hent(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept || '*/*' },
    });
    const krop = await r.text();
    return { ok: true, status: r.status, type: r.headers.get('content-type') || '', krop, ms: Date.now() - start, slutUrl: r.url };
  } catch (e) {
    return { ok: false, fejl: String(e.name === 'AbortError' ? `timeout efter ${TIMEOUT_MS} ms` : e.message), ms: Date.now() - start };
  } finally { clearTimeout(t); }
}

// robots.txt — én gang pr. vaertsnavn. Afproevningen skal vaere lovlig og
// hoeflig, ikke bare teknisk mulig.
async function robotsTillader(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    const r = await hent(`${u.origin}/robots.txt`, 'text/plain');
    robotsCache.set(u.host, r.ok && r.status === 200 ? r.krop : null);
    await sov(PAUSE_MS);
  }
  const txt = robotsCache.get(u.host);
  if (txt == null) return { kendt: false, tilladt: null, note: 'robots.txt kunne ikke hentes' };

  // Simpel laesning af den gruppe, der gaelder alle (*). Tilstraekkelig til en
  // afproevning; en egentlig indsamling boer bruge en rigtig robots-parser.
  const linjer = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let iStjerne = false; const forbud = [];
  for (const l of linjer) {
    const ua = l.match(/^User-agent:\s*(.+)$/i);
    if (ua) { iStjerne = ua[1].trim() === '*'; continue; }
    const d = l.match(/^Disallow:\s*(.*)$/i);
    if (d && iStjerne && d[1].trim()) forbud.push(d[1].trim());
  }
  const sti = u.pathname + (u.search || '');
  const ramt = forbud.find((f) => sti.startsWith(f));
  return { kendt: true, tilladt: !ramt, note: ramt ? `robots.txt forbyder ${ramt}` : 'tilladt i robots.txt' };
}

function bestemFormat(type, krop) {
  const t = (type || '').toLowerCase();
  const h = krop.slice(0, 400).toLowerCase();
  if (t.includes('json') || /^\s*[[{]/.test(krop)) return 'JSON';
  if (h.includes('<rss')) return 'RSS';
  if (h.includes('<feed')) return 'Atom';
  if (h.includes('<?xml') || t.includes('xml')) return 'XML';
  if (h.includes('<!doctype html') || h.includes('<html')) return 'HTML';
  return 'ukendt';
}

// Datoer ud af RSS/Atom/JSON. Bruges kun til at anslaa opdateringstakt.
function datoer(format, krop) {
  const ud = [];
  const skub = (s) => { const d = new Date(s); if (!isNaN(d)) ud.push(d); };
  if (format === 'RSS' || format === 'Atom' || format === 'XML') {
    for (const m of krop.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)</g)) skub(m[1].trim());
  } else if (format === 'JSON') {
    for (const m of krop.matchAll(/"(?:date|published|pubdate|created|issued|firstPublicationDate|sortDate)"\s*:\s*"([^"]{8,40})"/gi)) skub(m[1]);
    for (const m of krop.matchAll(/"date-parts"\s*:\s*\[\s*\[\s*(\d{4})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2}))?/g)) {
      skub(`${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3] || 1).padStart(2, '0')}`);
    }
  }
  return ud.sort((a, b) => b - a);
}

function antalPoster(format, krop) {
  if (format === 'RSS' || format === 'XML') return (krop.match(/<item[\s>]/g) || []).length;
  if (format === 'Atom') return (krop.match(/<entry[\s>]/g) || []).length;
  if (format === 'JSON') {
    const m = krop.match(/"(?:count|total|totalResults|hitCount|esearchresult)"\s*:\s*"?(\d+)/i);
    if (m) return Number(m[1]);
    const arr = krop.match(/"(?:results|items|records|value|collection)"\s*:\s*\[/);
    return arr ? (krop.match(/\},\s*\{/g) || []).length + 1 : null;
  }
  return null;
}

function takt(ds) {
  if (ds.length < 2) return { anslag: 'kan ikke anslaas', pr30: null, nyeste: ds[0] || null };
  const nu = Date.now();
  const pr30 = ds.filter((d) => nu - d < 30 * 864e5).length;
  const spring = [];
  for (let i = 0; i < Math.min(ds.length - 1, 20); i++) spring.push((ds[i] - ds[i + 1]) / 864e5);
  spring.sort((a, b) => a - b);
  const median = spring[Math.floor(spring.length / 2)];
  let anslag = 'sjaeldnere end maanedligt';
  if (median <= 1.5) anslag = 'dagligt eller oftere';
  else if (median <= 4) anslag = 'flere gange om ugen';
  else if (median <= 10) anslag = 'ugentligt';
  else if (median <= 35) anslag = 'maanedligt';
  return { anslag, pr30, nyeste: ds[0], medianDage: Math.round(median * 10) / 10 };
}

// ── koersel ────────────────────────────────────────────────────────────────
const kat = JSON.parse(fs.readFileSync(path.join(HER, 'kilder-kandidater.json'), 'utf8'));
const resultater = [];

for (const k of kat.kilder) {
  process.stderr.write(`afproever ${k.id} …\n`);
  const robots = await robotsTillader(k.url).catch(() => ({ kendt: false, tilladt: null, note: 'robots-opslag fejlede' }));
  const r = await hent(k.url, k.metode === 'api' ? 'application/json' : 'application/rss+xml, application/xml, */*');
  const post = { ...k, robots };
  if (!r.ok) {
    Object.assign(post, { virker: false, status: null, fejl: r.fejl, ms: r.ms });
  } else {
    const format = bestemFormat(r.type, r.krop);
    const ds = datoer(format, r.krop);
    const t = takt(ds);
    Object.assign(post, {
      virker: r.status >= 200 && r.status < 300 && format !== 'HTML' && format !== 'ukendt',
      status: r.status, type: r.type.split(';')[0], format, bytes: r.krop.length, ms: r.ms,
      poster: antalPoster(format, r.krop), nyeste: t.nyeste ? t.nyeste.toISOString().slice(0, 10) : null,
      pr30: t.pr30, takt: t.anslag, medianDage: t.medianDage ?? null,
      omdirigeret: r.slutUrl !== k.url ? r.slutUrl : null,
    });
  }
  resultater.push(post);
  await sov(PAUSE_MS);
}

// ── rapport ────────────────────────────────────────────────────────────────
const virker = resultater.filter((r) => r.virker);
const nu = new Date().toISOString().slice(0, 16).replace('T', ' ');
const L = [];
L.push(`# Fase 0 — afproevning af kandidatkilder`, '');
L.push(`Koert ${nu} UTC fra en GitHub Actions-runner.`, '');
L.push(`**${virker.length} af ${resultater.length} kandidater svarede brugbart.**`, '');
L.push('| Kilde | Land | Type | Status | Format | Poster | Nyeste | Pr. 30 dage | Takt | robots |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of resultater) {
  const ok = r.virker ? 'OK' : (r.status ? `${r.status}` : 'ingen svar');
  L.push(`| ${r.navn} | ${r.land} | ${r.type} | ${ok} | ${r.format || '—'} | ${r.poster ?? '—'} | ${r.nyeste || '—'} | ${r.pr30 ?? '—'} | ${r.takt || '—'} | ${r.robots.tilladt === null ? '?' : r.robots.tilladt ? 'ja' : 'NEJ'} |`);
}
L.push('');
L.push('## Kilder der ikke kunne bruges', '');
const daarlige = resultater.filter((r) => !r.virker);
if (!daarlige.length) L.push('Ingen.');
for (const r of daarlige) L.push(`- **${r.navn}** (\`${r.url}\`) — ${r.fejl || `HTTP ${r.status}, format ${r.format}`}`);
L.push('');
L.push('## Anbefalet overvaagningstakt', '');
L.push('Taktangivelsen er maalt paa kildens egne datoer, ikke gaettet. En kilde');
L.push('boer ikke hentes oftere, end den opdateres.', '');
for (const r of virker) L.push(`- **${r.navn}**: ${r.takt}${r.medianDage != null ? ` (median ${r.medianDage} dage mellem poster)` : ''} → hent ${r.takt === 'dagligt eller oftere' ? 'ugentligt, men gem alt' : 'ugentligt'}`);
L.push('');
L.push('_Rapporten er maskinskrevet af `publicering/research/fase0-afproev-kilder.mjs`._');

const rapport = L.join('\n');
fs.writeFileSync('fase0-rapport.md', rapport);
fs.writeFileSync('fase0-raa.json', JSON.stringify({ koert: new Date().toISOString(), resultater }, null, 2));

console.log('<<<FASE0-RAPPORT>>>');
console.log(rapport);
console.log('<<<SLUT>>>');
process.stderr.write(`\nFase 0: ${virker.length}/${resultater.length} kilder brugbare.\n`);

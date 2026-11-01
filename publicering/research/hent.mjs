// Fase 1 — indsamling og registrering af fund.
// ============================================================================
//
// Henter de kilder, fase 0 maalte som brugbare, normaliserer fundene til én
// form, frasorterer det irrelevante, fjerner gengangere mod tidligere uger og
// skriver ugens fund til publicering/research/fund/AAAA-UU.json.
//
// Den PUBLICERER intet, foreslaar intet og roerer hverken koe, register,
// laase eller indhold. Et fund er raamateriale — vurderingen sker i
// vurder.mjs, og godkendelsen hos Kristian.
//
// Hoeflighed mod kilderne er bygget ind, ikke en indstilling:
//   - sekventielt, med pause mellem hver forespoergsel
//   - ETag og Last-Modified gemmes og sendes med naeste gang, saa en kilde,
//     der intet har aendret, svarer 304 og slipper for at sende indholdet
//   - et sitemap foelges hoejst ét hop ned, og der hentes hoejst 15 sider
//     pr. kilde pr. uge
//   - User-Agent oplyser hvem vi er og hvordan vi kontaktes
//
// Historikken er varig: filerne i fund/ tilfoejes, aldrig overskrives. Samme
// princip som register.json, der er en haendelseslog og ikke en tilstand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { tekst, felt, gyldigDato, adapter, lavRelevans } from './lib.mjs';

const HER = path.dirname(fileURLToPath(import.meta.url));
const FUND = path.join(HER, 'fund');
const TILSTAND = path.join(HER, 'tilstand.json');   // ETag pr. kilde
const UA = 'kristiangg.dk researchmotor (ugentlig; kontakt kontakt@kristiangg.dk)';
const PAUSE = 1500;
const VINDUE_DAGE = Number(process.env.VINDUE_DAGE || 10);
const MAKS_SIDER = 15;        // sider hentet pr. sitemap-kilde pr. koersel
const TOERLOEB = process.argv.includes('--toerloeb');

const sov = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const kat = JSON.parse(fs.readFileSync(path.join(HER, 'kilder.json'), 'utf8'));
const relevans = lavRelevans(kat.emneord);
const tilstand = fs.existsSync(TILSTAND) ? JSON.parse(fs.readFileSync(TILSTAND, 'utf8')) : {};

async function hent(url, { etag, metode = 'GET' } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  const h = { 'User-Agent': UA };
  if (etag) h['If-None-Match'] = etag;
  try {
    const r = await fetch(url, { method: metode, signal: c.signal, redirect: 'follow', headers: h });
    return { ok: true, status: r.status, krop: r.status === 304 ? '' : await r.text(), etag: r.headers.get('etag') };
  } catch (e) { return { ok: false, fejl: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
}

// Sitemap: find adresser aendret inden for vinduet, og hent kun dem.
async function fraSitemap(k) {
  const r = await hent(k.url, { etag: tilstand[k.id]?.etag });
  await sov(PAUSE);
  if (r.status === 304) return { uaendret: true, poster: [] };
  if (!r.ok || r.status >= 400) return { fejl: r.ok ? `HTTP ${r.status}` : r.fejl, poster: [] };
  if (r.etag) tilstand[k.id] = { ...(tilstand[k.id] || {}), etag: r.etag };

  let xml = [r.krop];
  if (/<sitemapindex/i.test(r.krop)) {
    let boern = [...r.krop.matchAll(/<loc>([^<]+)</g)].map((m) => m[1].trim());
    if (k.kunSti) boern = boern.filter((b) => b.includes(k.kunSti));
    xml = [];
    for (const b of boern.slice(0, k.underfiler || 2)) {
      const c = await hent(b); await sov(PAUSE);
      if (c.ok && c.status < 400) xml.push(c.krop);
    }
  }

  // Stifilter. VIVE aendrede 257 adresser i demonstrationen, og de 15 nyeste
  // var medarbejderprofiler og rettede aeldre sider — ikke udgivelser. Loftet
  // bliver af hensyn til kilden; i stedet vaelges der blandt de rigtige stier.
  const graense = Date.now() - VINDUE_DAGE * 864e5;
  const kandidater = [];
  for (const x of xml) {
    for (const m of x.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = (m[1].match(/<loc>([^<]+)</) || [])[1];
      const lm = gyldigDato((m[1].match(/<lastmod>([^<]+)</) || [])[1] || '');
      if (!loc || !lm || lm.getTime() < graense) continue;
      if (k.stier && !k.stier.some((st) => loc.includes(st))) continue;
      kandidater.push({ url: loc.trim(), dato: lm });
    }
  }
  kandidater.sort((a, b) => b.dato - a.dato);

  const poster = [];
  for (const c of kandidater.slice(0, MAKS_SIDER)) {
    const sv = await hent(c.url); await sov(PAUSE);
    if (!sv.ok || sv.status >= 400) continue;
    const t = (sv.krop.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const d = (sv.krop.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1];
    poster.push({ titel: t ? tekst(t) : c.url, url: c.url, dato: c.dato, resume: d ? tekst(d) : '' });
  }
  return { poster, kandidater: kandidater.length };
}

// ── tidligere uger, til at fjerne gengangere ───────────────────────────────
fs.mkdirSync(FUND, { recursive: true });
const set = new Set();
for (const f of fs.readdirSync(FUND).filter((f) => f.endsWith('.json'))) {
  for (const p of JSON.parse(fs.readFileSync(path.join(FUND, f), 'utf8')).fund || []) { set.add(p.id); set.add(p.titelhash); }
}

// ── koersel ────────────────────────────────────────────────────────────────
const nu = new Date();
const uge = (() => { const d = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return `${d.getUTCFullYear()}-${String(Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7)).padStart(2, '0')}`; })();

const fund = [], kildestatus = [];
for (const k of kat.kilder) {
  if (k.afventer_bekraeftelse) { kildestatus.push({ id: k.id, status: 'sprunget over', note: k.note }); continue; }
  process.stderr.write(`henter ${k.id} …\n`);
  let poster = [], note = null, uaendret = false;

  if (k.metode === 'sitemap') {
    const r = await fraSitemap(k);
    poster = r.poster; note = r.fejl || (r.kandidater != null ? `${r.kandidater} adresser aendret i vinduet` : null); uaendret = !!r.uaendret;
  } else {
    const url = k.url.replace('__FRA__', new Date(Date.now() - VINDUE_DAGE * 864e5).toISOString().slice(0, 10))
                     .replace('__TIL__', nu.toISOString().slice(0, 10));
    const r = await hent(url, { etag: tilstand[k.id]?.etag });
    await sov(PAUSE);
    if (r.status === 304) uaendret = true;
    else if (!r.ok || r.status >= 400) note = r.ok ? `HTTP ${r.status}` : r.fejl;
    else {
      if (r.etag) tilstand[k.id] = { ...(tilstand[k.id] || {}), etag: r.etag };
      try {
        poster = adapter[k.metode](r.krop);
        // ODA kan ikke fritekstsoege paa tvaers af felter, saa sagerne hentes
        // bredt og skaeres til paa titlen her. Uden det kom datacenter- og
        // veterinaersager med i demonstrationen.
        if (k.efterfilter) {
          const foer = poster.length;
          poster = poster.filter((p) => k.efterfilter.some((f) => (p.titel || '').toLowerCase().includes(f.toLowerCase())));
          note = `${foer} sager hentet, ${poster.length} tilbage efter titelfilter`;
        }
      } catch (e) { note = `kunne ikke laeses: ${e.message}`; }
    }
  }

  let nye = 0, irrelevante = 0, gengangere = 0;
  for (const p of poster) {
    if (!p.titel || !p.url) continue;
    const rel = relevans(p);
    if (!rel.relevant) { irrelevante++; continue; }
    const id = hash(`${k.id}|${p.url}`);
    const titelhash = hash((p.titel || '').toLowerCase().replace(/\s+/g, ' ').trim());
    if (set.has(id) || set.has(titelhash)) { gengangere++; continue; }
    set.add(id); set.add(titelhash);
    fund.push({ id, titelhash, kilde: k.id, kildenavn: k.navn, prioritet: k.prioritet, evidens: k.evidens,
      titel: p.titel, url: p.url, dato: p.dato ? p.dato.toISOString().slice(0, 10) : null,
      resume: p.resume || '', emneord: rel.ramte, specifikke: rel.specifikke, generiske: rel.generiske, relevansgrund: rel.grund, fagfaellebedoemt: p.fagfaellebedoemt ?? null, fundet: nu.toISOString() });
    nye++;
  }
  kildestatus.push({ id: k.id, navn: k.navn, prioritet: k.prioritet, status: uaendret ? 'uaendret (304)' : note || 'ok',
    poster: poster.length, nye, irrelevante, gengangere });
}

fund.sort((a, b) => a.prioritet - b.prioritet || (b.dato || '').localeCompare(a.dato || ''));
const resultat = { uge, koert: nu.toISOString(), vindue_dage: VINDUE_DAGE, kildestatus, antal: fund.length, fund };

if (TOERLOEB) { console.log(JSON.stringify(resultat, null, 2)); }
else {
  fs.writeFileSync(path.join(FUND, `${uge}.json`), JSON.stringify(resultat, null, 2));
  fs.writeFileSync(TILSTAND, JSON.stringify(tilstand, null, 2));
}

process.stderr.write('\n');
for (const s of kildestatus) process.stderr.write(`  p${s.prioritet ?? '-'} ${String(s.id).padEnd(22)} ${s.status.padEnd(28)} nye ${s.nye ?? 0}\n`);
process.stderr.write(`\nUge ${uge}: ${fund.length} nye relevante fund.\n`);

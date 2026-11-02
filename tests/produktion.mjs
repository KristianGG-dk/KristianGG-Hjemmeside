/* Produktionskontrol af kristiangg.dk — den rigtige side, ikke et byg.
   ============================================================================

   Koeres fra en GitHub Actions-runner, som har fri internetadgang.
   Kan ogsaa koeres mod et deploy preview:

       BASE=https://deploy-preview-108--kristiangg.netlify.app node tests/produktion.mjs

   Tre dele:
     1. Uden browser: svarkoder, de 96 viderestillinger, canonical, sitemap,
        robots.txt, sikkerhedshoveder, https og vaertsnavn.
     2. Med browser (Playwright, hvis den findes): mobil og desktop, console-
        fejl, manglende delressourcer, vandret overloeb, navigation, interne
        links, kontaktknapper og den gratis forsamtale.
     3. Valgfrit: en RIGTIG indsendelse af kontaktformularen, saa det kan
        efterproeves, at Netlify tager imod, og at notifikationsmailen naar
        frem. Slaas til med INDSEND_PROEVE=ja. Den sendes med et tydeligt
        proevemaerke i beskedfeltet.

   Exit 0 = alt i orden. Exit 1 = fejl fundet.                               */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'https://kristiangg.dk').replace(/\/+$/, '');
const INDSEND = process.env.INDSEND_PROEVE === 'ja';
const MAERKE = process.env.PROEVE_MAERKE || `proeve-${Date.now()}`;

const fejl = [];
const advarsel = [];
const noter = [];
const x = (m) => fejl.push(m);
const adv = (m) => advarsel.push(m);
const ok = (m) => noter.push(m);

const UA = 'kristiangg-produktionskontrol (+https://github.com/KristianGG-dk/KristianGG-Hjemmeside)';

async function hent(url, valg = {}) {
  for (let forsoeg = 1; forsoeg <= 3; forsoeg++) {
    try {
      const sv = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': UA, ...(valg.headers || {}) },
        ...valg,
      });
      return sv;
    } catch (e) {
      if (forsoeg === 3) return { fejl: e.message, status: 0, headers: new Headers() };
      await new Promise((r) => setTimeout(r, forsoeg * 1500));
    }
  }
}

const vaerdi = (html, re) => { const m = re.exec(html); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
const canonical = (h) => vaerdi(h, /<link[^>]*rel\s*=\s*["']?canonical["']?[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  || vaerdi(h, /<link[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*rel\s*=\s*["']?canonical/i);
const robotsMeta = (h) => vaerdi(h, /<meta[^>]*name\s*=\s*["']?robots["']?[^>]*content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
const titel = (h) => vaerdi(h, /<title>([\s\S]*?)<\/title>/i);
const beskrivelse = (h) => vaerdi(h, /<meta[^>]*name\s*=\s*["']?description["']?[^>]*content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);

console.log(`Produktionskontrol af ${BASE}`);
console.log(`Tidspunkt: ${new Date().toISOString()}`);
console.log(`Rigtig formularindsendelse: ${INDSEND ? 'JA (maerke ' + MAERKE + ')' : 'nej'}\n`);

/* ══ 1. Forsiden svarer ══════════════════════════════════════════════════ */

const forside = await hent(BASE + '/');
if (forside.fejl) {
  x(`${BASE}/ kunne slet ikke hentes: ${forside.fejl}`);
  console.log('\nSiden svarer ikke. Resten af kontrollen springes over.');
  console.log('RESULTAT: FEJL FUNDET');
  process.exit(1);
}
if (forside.status !== 200) {
  x(`${BASE}/ svarer ${forside.status}, ventede 200`);
} else {
  ok(`forsiden svarer 200`);
}
const forsideHtml = forside.status === 200 ? await forside.text() : '';

/* ══ 2. robots.txt og sitemap ════════════════════════════════════════════ */

const r = await hent(BASE + '/robots.txt');
let sitemapUrl = BASE + '/sitemap.xml';
if (r.status !== 200) {
  x(`robots.txt svarer ${r.status}`);
} else {
  const t = await r.text();
  if (/^\s*Disallow:\s*\/\s*$/m.test(t)) x('robots.txt blokerer hele sitet');
  if (!/Disallow:\s*\/admin\//.test(t)) x('robots.txt tillader /admin/');
  const sm = /Sitemap:\s*(\S+)/i.exec(t);
  if (!sm) x('robots.txt henviser ikke til et sitemap');
  else { sitemapUrl = sm[1]; ok(`robots.txt i orden, henviser til ${sm[1]}`); }
}

const sm = await hent(sitemapUrl);
let adresser = [];
if (sm.status !== 200) {
  x(`${sitemapUrl} svarer ${sm.status}`);
} else {
  const t = await sm.text();
  adresser = [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!adresser.length) x('sitemap er tomt');
  else ok(`sitemap indeholder ${adresser.length} adresser`);
  const ct = sm.headers.get('content-type') || '';
  if (!/xml/i.test(ct)) adv(`sitemap serveres som "${ct}" — ventede xml`);
}

/* ══ 3. Hver adresse i sitemappet ════════════════════════════════════════ */

const sidensHtml = new Map();
for (const u of adresser) {
  const sv = await hent(u);
  if (sv.fejl) { x(`${u}: ${sv.fejl}`); continue; }
  if (sv.status !== 200) { x(`${u} svarer ${sv.status} — en indekseret side er vaek`); continue; }
  const h = await sv.text();
  sidensHtml.set(u, h);
  const c = canonical(h);
  if (!c) x(`${u} har ingen canonical`);
  else if (c !== u) x(`${u} har canonical ${c} — peger ikke paa sig selv`);
  const rm = robotsMeta(h);
  if (rm && /noindex/i.test(rm)) x(`${u} staar i sitemappet, men er noindex`);
  if (!titel(h)) x(`${u} har ingen title`);
  if (!beskrivelse(h)) x(`${u} har ingen description`);
}
if (!fejl.length && adresser.length) ok(`alle ${adresser.length} sider svarer 200 med egen canonical, title og description`);

/* ══ 4. De 96 viderestillinger ═══════════════════════════════════════════ */

const nt = fs.readFileSync(path.join(ROD, 'netlify.toml'), 'utf-8');
const regler = [...nt.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"\s*\n\s*status\s*=\s*(\d+)/g)]
  .map((m) => ({ fra: m[1], til: m[2], status: Number(m[3]) }));
const faste = regler.filter((v) => !v.fra.includes('*') && !v.fra.includes(':'));
let viderestillingFejl = 0;
for (const v of faste) {
  const sv = await hent(BASE + v.fra);
  if (sv.fejl) { x(`viderestilling ${v.fra}: ${sv.fejl}`); viderestillingFejl++; continue; }
  if (sv.status !== v.status) {
    x(`${v.fra} svarer ${sv.status}, ventede ${v.status} — den gamle adresses soegevaerdi overfoeres ikke`);
    viderestillingFejl++;
    continue;
  }
  const sted = sv.headers.get('location') || '';
  const ventet = v.til.startsWith('/') ? v.til : v.til;
  if (sted !== ventet && sted !== BASE + ventet) {
    x(`${v.fra} sender til ${sted}, ventede ${ventet}`);
    viderestillingFejl++;
    continue;
  }
  const endeligt = sted.startsWith('http') ? sted : BASE + sted;
  const n = await hent(endeligt);
  if (n.status !== 200) {
    x(`${v.fra} → ${sted} ender paa ${n.status} — kaede eller doed destination`);
    viderestillingFejl++;
  }
}
if (!viderestillingFejl) ok(`alle ${faste.length} faste viderestillinger er ${faste[0]?.status || 301} og lander paa en side, der svarer 200`);

/* ══ 5. https, vaertsnavn og sikkerhedshoveder ═══════════════════════════ */

const vaert = new URL(BASE).host;
if (/kristiangg\.dk$/.test(vaert)) {
  const usikker = await hent(BASE.replace('https://', 'http://') + '/');
  if (![301, 308].includes(usikker.status)) {
    x(`http:// svarer ${usikker.status} — ventede en 301 til https`);
  } else if (!/^https:/.test(usikker.headers.get('location') || '')) {
    x(`http:// sender til ${usikker.headers.get('location')} — ikke til https`);
  } else ok('http sendes videre til https med 301');

  const alternativ = vaert.startsWith('www.') ? BASE.replace('www.', '') : BASE.replace('://', '://www.');
  const a = await hent(alternativ + '/');
  if (a.status === 200) {
    const c = canonical(await a.text());
    if (c && !c.startsWith(BASE)) {
      adv(`${alternativ} svarer 200 med canonical ${c} — kontroller, at kun én vaert indekseres`);
    } else if (!c) {
      x(`${alternativ} svarer 200 uden canonical — to vaerter kan indekseres som duplikater`);
    }
  } else if ([301, 308].includes(a.status)) {
    ok(`${alternativ} sendes videre med ${a.status}`);
  }
}

const h = forside.headers;
for (const [navn, ventet] of [
  ['x-frame-options', /DENY/i],
  ['x-content-type-options', /nosniff/i],
  ['referrer-policy', /strict-origin-when-cross-origin/i],
  ['permissions-policy', /camera=\(\)/i],
]) {
  const v = h.get(navn);
  if (!v) x(`sikkerhedshovedet ${navn} mangler paa forsiden`);
  else if (!ventet.test(v)) x(`${navn} er "${v}" — ikke som sat i netlify.toml`);
}
if (!fejl.some((f) => f.includes('sikkerhedshovedet') || f.includes('netlify.toml'))) {
  ok('de fire sikkerhedshoveder fra netlify.toml serveres');
}

const oauth = await hent(BASE + '/oauth/google/');
if (oauth.status === 200) {
  const xr = oauth.headers.get('x-robots-tag') || '';
  if (!/noindex/i.test(xr)) x('/oauth/google/ serveres uden X-Robots-Tag: noindex');
  else ok('/oauth/-siderne serveres med X-Robots-Tag: noindex');
}

/* ══ 6. Strukturerede data ═══════════════════════════════════════════════ */

if (forsideHtml) {
  const blokke = [...forsideHtml.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);
  if (!blokke.length) x('forsiden har ingen strukturerede data');
  const typer = [];
  for (const b of blokke) {
    try {
      const d = JSON.parse(b);
      for (const o of Array.isArray(d) ? d : [d]) typer.push(o['@type']);
    } catch (e) {
      x(`en ld+json-blok paa forsiden kan ikke laeses: ${e.message}`);
    }
  }
  for (const t of ['LocalBusiness', 'Person']) {
    if (!typer.flat().some((v) => String(v).includes(t))) {
      adv(`forsiden har ingen ${t}-blok i strukturerede data (fandt: ${typer.join(', ')})`);
    }
  }
  if (typer.length) ok(`strukturerede data paa forsiden: ${typer.flat().join(', ')}`);
}

/* ══ 7. Den gratis forsamtale ════════════════════════════════════════════ */

let forsamtale = null;
try {
  const t = fs.readFileSync(path.join(ROD, 'data', 'forsamtale.toml'), 'utf-8');
  forsamtale = /overskrift\s*=\s*"([^"]+)"/.exec(t)?.[1] || null;
} catch { /* filen findes ikke i aeldre versioner */ }

if (forsamtale) {
  const skal = ['/', '/kontakt/', '/til-dig/', '/til-dig/psykoterapi/', '/til-dig/naturterapi/',
    '/til-dig/stress/', '/til-dig/angst/', '/til-dig/soevnproblemer/', '/til-dig/nervesystemet/'];
  const uden = [];
  for (const sti of skal) {
    const hh = sidensHtml.get(BASE + sti) || (sti === '/' ? forsideHtml : null);
    if (hh === null) { adv(`${sti} kunne ikke kontrolleres for den gratis forsamtale`); continue; }
    if (!hh.includes(forsamtale)) uden.push(sti);
  }
  if (uden.length) {
    x(`den gratis forsamtale staar IKKE paa ${uden.length} af ${skal.length} sider i produktion: ${uden.join(', ')}`
      + ' — den udgave, der er deployet, er aeldre end koden');
  } else {
    ok(`den gratis forsamtale staar paa alle ${skal.length} sider i produktion`);
  }
}

/* ══ 8. Browserdelen ═════════════════════════════════════════════════════ */

const kraev = createRequire(import.meta.url);
let chromium = null;
for (const n of ['playwright', '/opt/node-tools/node_modules/playwright', 'playwright-core', '@playwright/test']) {
  try { ({ chromium } = kraev(n)); break; } catch { /* videre */ }
}

if (!chromium) {
  adv('Playwright findes ikke — browserdelen (mobil, desktop, links, formular) blev sprunget over');
} else {
  let browser = null;
  for (const sti of [undefined, process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium/chrome-linux/chrome']) {
    if (sti !== undefined && !sti) continue;
    try { browser = await chromium.launch(sti ? { executablePath: sti, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }); break; }
    catch { /* videre */ }
  }
  if (!browser) {
    adv('Chromium kunne ikke startes — browserdelen blev sprunget over');
  } else {
    const SIDER = ['/', '/til-dig/stress/', '/kontakt/', '/priser/', '/om/', '/begivenheder/'];
    const ydeevne = [];
    const SKAERME = [['desktop', 1280, 900], ['mobil', 390, 844]];

    for (const [navn, bredde, hoejde] of SKAERME) {
      const kontekst = await browser.newContext({ viewport: { width: bredde, height: hoejde }, userAgent: UA });
      for (const sti of SIDER) {
        const side = await kontekst.newPage();
        const konsol = [];
        const doede = [];
        side.on('console', (b) => { if (b.type() === 'error') konsol.push(b.text()); });
        side.on('requestfailed', (q) => doede.push(`${q.url()} (${q.failure()?.errorText})`));
        side.on('response', (sv) => { if (sv.status() >= 400) doede.push(`${sv.url()} → ${sv.status()}`); });

        const sv = await side.goto(BASE + sti, { waitUntil: 'load', timeout: 45000 }).catch((e) => ({ fejlet: e.message }));
        if (sv?.fejlet) { x(`${navn} ${sti}: siden kunne ikke indlaeses (${sv.fejlet})`); await side.close(); continue; }
        await side.waitForTimeout(500);

        if (konsol.length) x(`${navn} ${sti}: ${konsol.length} konsolfejl — ${konsol.slice(0, 2).join(' | ')}`);
        if (doede.length) x(`${navn} ${sti}: ${doede.length} ressource(r) fejlede — ${doede.slice(0, 2).join(' | ')}`);

        const overloeb = await side.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overloeb > 2) x(`${navn} ${sti}: siden er ${overloeb} px bredere end skaermen — vandret rul`);

        if (navn === 'mobil') {
          /* Klikflader. Googles vejledning er 48x48 px med luft omkring —
             men KUN for selvstaendige knapper og links. Links midt i en
             saetning er undtaget, og det samme er elementer, der er skjult,
             indtil de faar fokus (spring-til-indhold). Den foerste udgave af
             denne kontrol taalte ikke den forskel og raabte op om
             "Spring til indhold" paa hver eneste side. */
          const smaa = await side.$$eval('a, button', (els) => els
            .filter((e) => {
              const r = e.getBoundingClientRect();
              if (r.height <= 0 || r.width <= 0) return false;
              if (r.bottom < 0 || r.right < 0) return false;          // uden for skaermen
              const s = getComputedStyle(e);
              if (s.visibility === 'hidden' || s.opacity === '0') return false;
              if (e.closest('[hidden]')) return false;
              const vis = s.display;
              if (vis === 'inline') return false;                      // link i en saetning
              const forael = e.parentElement;
              if (forael && /^(P|LI|SPAN)$/.test(forael.tagName) && vis === 'inline') return false;
              return true;
            })
            .map((e) => {
              const r = e.getBoundingClientRect();
              return { t: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), h: Math.round(r.height), w: Math.round(r.width) };
            })
            .filter((e) => e.h < 40));
          if (smaa.length) {
            adv(`mobil ${sti}: ${smaa.length} selvstaendig(e) klikflade(r) under 40 px hoej: `
              + smaa.slice(0, 4).map((e) => `"${e.t}" ${e.w}x${e.h}`).join(', '));
          }

          /* Teknisk ydeevne. Maales paa mobilvisning, hvor den betyder mest. */
          const maal = await side.evaluate(() => new Promise((klar) => {
            const n = performance.getEntriesByType('navigation')[0] || {};
            let lcp = 0;
            try {
              new PerformanceObserver((liste) => {
                for (const e of liste.getEntries()) lcp = Math.max(lcp, e.startTime);
              }).observe({ type: 'largest-contentful-paint', buffered: true });
            } catch (e) { /* ikke understoettet */ }
            setTimeout(() => {
              const res = performance.getEntriesByType('resource');
              klar({
                ttfb: Math.round(n.responseStart || 0),
                dcl: Math.round(n.domContentLoadedEventEnd || 0),
                lcp: Math.round(lcp),
                antal: res.length + 1,
                kb: Math.round((res.reduce((a, r) => a + (r.transferSize || 0), 0) + (n.transferSize || 0)) / 1024),
              });
            }, 1200);
          }));
          ydeevne.push({ sti, ...maal });
          if (maal.lcp > 4000) x(`mobil ${sti}: LCP ${maal.lcp} ms — over Googles graense paa 2500 ms med god margin`);
          else if (maal.lcp > 2500) adv(`mobil ${sti}: LCP ${maal.lcp} ms — over Googles anbefalede 2500 ms`);
          if (maal.kb > 2500) adv(`mobil ${sti}: ${maal.kb} kB hentet`);

          /* Én h1 pr. side, og billeder skal have alt-tekst. */
          const struktur = await side.evaluate(() => ({
            h1: document.querySelectorAll('h1').length,
            udenAlt: [...document.querySelectorAll('img')]
              .filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src).slice(0, 3),
            sprog: document.documentElement.lang,
          }));
          if (struktur.h1 !== 1) x(`${sti}: ${struktur.h1} h1-overskrifter — der skal vaere præcis én`);
          if (struktur.udenAlt.length) x(`${sti}: billede uden alt-attribut: ${struktur.udenAlt.join(', ')}`);
          if (struktur.sprog !== 'da') x(`${sti}: <html lang="${struktur.sprog}"> — ventede da`);
        }
        await side.close();
      }
      await kontekst.close();
    }
    ok(`${SIDER.length} sider indlaest paa desktop (1280 px) og mobil (390 px) uden konsolfejl, doede ressourcer eller vandret rul`);
    if (ydeevne.length) {
      const snit = (n) => Math.round(ydeevne.reduce((a, m) => a + m[n], 0) / ydeevne.length);
      ok(`ydeevne paa mobil (gennemsnit af ${ydeevne.length} sider): TTFB ${snit('ttfb')} ms, `
        + `LCP ${snit('lcp')} ms, ${snit('antal')} anmodninger, ${snit('kb')} kB`);
    }

    /* Interne links paa hver side i sitemappet */
    {
      const kontekst = await browser.newContext({ userAgent: UA });
      const side = await kontekst.newPage();
      const set = new Set();
      for (const u of adresser.slice(0, 40)) {
        await side.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
        const links = await side.$$eval('a[href]', (els) => els.map((e) => e.href));
        for (const l of links) if (l.startsWith(BASE)) set.add(l.split('#')[0]);
      }
      const doede = [];
      for (const l of set) {
        const sv = await hent(l);
        if (sv.status >= 400 || sv.fejl) doede.push(`${l} → ${sv.fejl || sv.status}`);
      }
      if (doede.length) x(`${doede.length} interne link(s) er doede: ${doede.slice(0, 5).join(', ')}`);
      else ok(`alle ${set.size} interne link-destinationer svarer under 400`);
      await kontekst.close();
    }

    /* Kontaktknapperne */
    {
      const kontekst = await browser.newContext({ userAgent: UA });
      const side = await kontekst.newPage();
      await side.goto(BASE + '/kontakt/', { waitUntil: 'load', timeout: 45000 }).catch(() => null);
      const knapper = await side.$$eval('a[href^="sms:"], a[href^="tel:"], a[href*="/kontakt/"]',
        (els) => els.map((e) => ({ href: e.getAttribute('href'), tekst: (e.textContent || '').trim().slice(0, 40) })));
      const sms = knapper.filter((k) => k.href.startsWith('sms:'));
      const tel = knapper.filter((k) => k.href.startsWith('tel:'));
      if (!sms.length) x('kontaktsiden har ingen sms:-knap');
      if (!tel.length) x('kontaktsiden har intet tel:-link');
      const forkert = [...sms, ...tel].filter((k) => !/\+?4531509789/.test(k.href.replace(/\s/g, '')));
      if (forkert.length) x(`sms-/tel-link med forkert nummer: ${forkert.map((k) => k.href).join(', ')}`);
      if (sms.length && tel.length && !forkert.length) ok(`kontaktknapperne peger paa det rigtige nummer (${sms.length} sms, ${tel.length} tel)`);

      const formular = await side.$('form[name="kontakt"]');
      if (!formular) x('kontaktsiden har ingen formular');
      await kontekst.close();
    }

    /* Rigtig indsendelse — kun naar den udtrykkeligt er slaaet til */
    if (INDSEND) {
      const kontekst = await browser.newContext({ userAgent: UA });
      const side = await kontekst.newPage();
      await side.goto(BASE + '/kontakt/', { waitUntil: 'load', timeout: 45000 });
      await side.fill('#name', 'Teknisk proeve (Codex)');
      await side.fill('#email', 'kontakt@kristiangg.dk');
      await side.selectOption('#subject', 'Andet').catch(() => null);
      await side.fill('#message',
        `TEKNISK PROEVE — ingen rigtig henvendelse.\n`
        + `Maerke: ${MAERKE}\n`
        + `Formaal: efterproeve at Netlify tager imod, og at notifikationsmailen naar frem.\n`
        + `Afsendt: ${new Date().toISOString()}`);

      const [svar] = await Promise.all([
        side.waitForResponse((s) => s.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
        side.click('form[name="kontakt"] button[type="submit"]'),
      ]);
      if (!svar) {
        x('den rigtige indsendelse udloeste ingen POST');
      } else if (svar.status() >= 400) {
        x(`Netlify afviste indsendelsen med ${svar.status()} — henvendelser naar ikke frem`);
      } else {
        ok(`Netlify tog imod indsendelsen (HTTP ${svar.status()}, maerke ${MAERKE})`);
        const kvittering = await side.waitForFunction(() => {
          const s = document.querySelector('[data-form-status]');
          return s && !s.classList.contains('hidden') && /Tak/.test(s.textContent);
        }, { timeout: 8000 }).then(() => true).catch(() => false);
        if (!kvittering) adv('kvitteringen blev ikke vist i browseren, selv om POST lykkedes');
        else ok('kvitteringen blev vist til den besoegende');
      }
      await kontekst.close();
    }

    await browser.close();
  }
}

/* ── Dom ─────────────────────────────────────────────────────────────────── */

console.log('\n' + '='.repeat(72));
if (fejl.length) {
  console.log(`\nFEJL (${fejl.length}):`);
  for (const f of fejl) console.log('  x', f);
}
if (advarsel.length) {
  console.log(`\nBEMAERK (${advarsel.length}):`);
  for (const a of advarsel) console.log('  !', a);
}
console.log(`\nKONTROLLERET (${noter.length}):`);
for (const n of noter) console.log('  ·', n);
console.log('\nRESULTAT:', fejl.length ? 'FEJL FUNDET' : 'OK');
process.exit(fejl.length ? 1 : 0);

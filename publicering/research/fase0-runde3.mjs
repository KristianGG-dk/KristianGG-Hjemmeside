// Fase 0, tredje runde.
// ============================================================================
// Tre spoergsmaal, som anden runde lod staa aabne:
//
//  A. Kan VIVE og Retsinformation overvaages, naar man foelger deres
//     sitemap-INDEKS ét hop ned til de underliggende filer?
//  B. Er <lastmod> i et sitemap paalidelig, eller staemples alle adresser
//     ens ved hver bygning? En dato, der ikke betyder noget, er vaerre end
//     ingen dato: den ville udloese falske fund hver uge.
//  C. Findes der en tilladt og stabil vej til Sundhedsstyrelsen?
//
// Om C: sst.dk svarede 429 paa alt i anden runde. Denne runde forsoeger IKKE
// at omgaa det. Ingen forfalsket User-Agent, ingen gentagne forsoeg, ingen
// omveje. Den proever hvert officielt vaertsnavn én gang med lang pause og
// noterer svaret. Bliver svaret 429 igen, er konklusionen, at kilden ikke kan
// overvaages maskinelt — ikke at vi skal proeve haardere.
//
// Hoeflighed er en forudsaetning, ikke en indstilling: hvert sitemap hentes
// én gang, stikproeven er lille, og der er pause mellem hver forespoergsel.

const UA = 'kristiangg.dk kildeafproevning (fase 0; kontakt kontakt@kristiangg.dk)';
const PAUSE = 2000;
const STIKPROEVE = 6;      // antal adresser pr. site i paalidelighedskontrollen
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

async function hent(url, metode = 'GET') {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { method: metode, signal: c.signal, redirect: 'follow', headers: { 'User-Agent': UA } });
    return { ok: true, status: r.status, krop: metode === 'GET' ? await r.text() : '', hoveder: r.headers };
  } catch (e) { return { ok: false, fejl: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
}

function udtrak(xml, tag) { return [...xml.matchAll(new RegExp(`<${tag}>([^<]+)<`, 'g'))].map((m) => m[1].trim()); }

// ── A + B: sitemap-indeks og datopaalidelighed ─────────────────────────────
async function undersoegSitemap(navn, indeksUrl) {
  const ud = { navn, indeksUrl, noter: [] };
  const i = await hent(indeksUrl);
  if (!i.ok || i.status >= 400) { ud.noter.push(`indeks kunne ikke hentes (${i.ok ? 'HTTP ' + i.status : i.fejl})`); return ud; }
  await sov(PAUSE);

  const erIndeks = /<sitemapindex/i.test(i.krop);
  ud.erIndeks = erIndeks;
  const boern = erIndeks ? udtrak(i.krop, 'loc') : [];
  ud.antalBoern = boern.length;

  // Foelg hoejst tre underfiler. Vi skal vide OM der er lastmod, ikke hente alt.
  const maal = erIndeks ? boern.slice(0, 3) : [indeksUrl];
  ud.underfiler = [];
  let alleDatoer = [], alleUrler = [];

  for (const b of maal) {
    const r = erIndeks ? await hent(b) : { ok: true, status: 200, krop: i.krop };
    if (erIndeks) await sov(PAUSE);
    if (!r.ok || r.status >= 400) { ud.underfiler.push({ url: b, fejl: r.ok ? `HTTP ${r.status}` : r.fejl }); continue; }
    const urler = udtrak(r.krop, 'loc');
    const datoer = udtrak(r.krop, 'lastmod').map((d) => new Date(d)).filter((d) => !isNaN(d));
    alleDatoer = alleDatoer.concat(datoer); alleUrler = alleUrler.concat(urler);
    ud.underfiler.push({ url: b, adresser: urler.length, medLastmod: datoer.length });
  }

  ud.adresserIAlt = alleUrler.length;
  ud.medLastmod = alleDatoer.length;

  if (alleDatoer.length) {
    const sorteret = [...alleDatoer].sort((a, b) => b - a);
    const unikke = new Set(alleDatoer.map((d) => d.toISOString().slice(0, 10)));
    const nu = Date.now();
    ud.datoer = {
      nyeste: sorteret[0].toISOString().slice(0, 10),
      aeldste: sorteret[sorteret.length - 1].toISOString().slice(0, 10),
      unikkeDage: unikke.size,
      fremtidige: alleDatoer.filter((d) => d > nu).length,
      // Staemples alt ens? Da er datoen bygningstidspunkt, ikke aendringstid.
      andelPaaNyesteDag: Math.round((alleDatoer.filter((d) => d.toISOString().slice(0, 10) === sorteret[0].toISOString().slice(0, 10)).length / alleDatoer.length) * 100),
    };
    ud.datoer.brugbar = ud.datoer.unikkeDage >= 5 && ud.datoer.andelPaaNyesteDag < 80 && ud.datoer.fremtidige === 0;
  } else ud.noter.push('ingen lastmod i de afproevede underfiler');

  // B: hold sitemappets dato op mod serverens egen Last-Modified paa et faa adresser.
  ud.stikproeve = [];
  if (alleUrler.length && alleDatoer.length) {
    const skridt = Math.max(1, Math.floor(alleUrler.length / STIKPROEVE));
    for (let k = 0; k < alleUrler.length && ud.stikproeve.length < STIKPROEVE; k += skridt) {
      const r = await hent(alleUrler[k], 'HEAD');
      await sov(PAUSE);
      ud.stikproeve.push({
        url: alleUrler[k].slice(0, 90),
        status: r.ok ? r.status : null,
        serverLastModified: r.ok ? (r.hoveder.get('last-modified') || null) : null,
        etag: r.ok ? (r.hoveder.get('etag') ? 'ja' : 'nej') : null,
        fejl: r.ok ? null : r.fejl,
      });
    }
    const medEtag = ud.stikproeve.filter((s) => s.etag === 'ja').length;
    const medLM = ud.stikproeve.filter((s) => s.serverLastModified).length;
    ud.noter.push(`stikproeve: ${medEtag}/${ud.stikproeve.length} svarer med ETag, ${medLM}/${ud.stikproeve.length} med Last-Modified`);
    if (medEtag || medLM) ud.noter.push('betinget hentning (If-None-Match / If-Modified-Since) er mulig — kilden belastes da kun ved faktisk aendring');
  }
  return ud;
}

// ── C: Sundhedsstyrelsen, tilladt vej ──────────────────────────────────────
async function undersoegSST() {
  const forsoeg = [
    { hvad: 'sst.dk forside',                     url: 'https://www.sst.dk/' },
    { hvad: 'sundhedsstyrelsen.dk forside',       url: 'https://sundhedsstyrelsen.dk/' },
    { hvad: 'sundhedsstyrelsen.dk robots.txt',    url: 'https://sundhedsstyrelsen.dk/robots.txt' },
    { hvad: 'sundhedsstyrelsen.dk sitemap',       url: 'https://sundhedsstyrelsen.dk/sitemap.xml' },
    { hvad: 'sundhedsstyrelsen.dk nyheder',       url: 'https://sundhedsstyrelsen.dk/da/nyheder' },
  ];
  const ud = [];
  for (const f of forsoeg) {
    const r = await hent(f.url);
    const post = { ...f, status: r.ok ? r.status : null, fejl: r.ok ? null : r.fejl };
    if (r.ok && r.status === 200) {
      post.bytes = r.krop.length;
      post.feeds = [...r.krop.matchAll(/<link[^>]+rel=["']?alternate["']?[^>]*>/gi)]
        .filter((m) => /application\/(rss|atom)\+xml/i.test(m[0]))
        .map((m) => (m[0].match(/href=["']([^"']+)["']/i) || [])[1]).filter(Boolean);
      if (/sitemap\.xml$/.test(f.url)) {
        post.adresser = (r.krop.match(/<loc>/g) || []).length;
        post.medLastmod = (r.krop.match(/<lastmod>/g) || []).length;
        post.erIndeks = /<sitemapindex/i.test(r.krop);
      }
      if (/robots\.txt$/.test(f.url)) post.sitemapsIRobots = [...r.krop.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    }
    ud.push(post);
    // Lang pause. 429 betyder «for mange» — vi skal ikke vaere en af dem.
    await sov(6000);
  }
  return ud;
}

// ── koersel ────────────────────────────────────────────────────────────────
process.stderr.write('A+B: VIVE …\n');
const vive = await undersoegSitemap('VIVE', 'https://www.vive.dk/sitemap.xml');
process.stderr.write('A+B: Retsinformation …\n');
const retsinfo = await undersoegSitemap('Retsinformation', 'https://www.retsinformation.dk/sitemap.xml');
process.stderr.write('C: Sundhedsstyrelsen …\n');
const sst = await undersoegSST();

const L = ['# Fase 0, tredje runde — sitemap-indeks, datopaalidelighed og Sundhedsstyrelsen', '',
  `Koert ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, ''];

L.push('## A. Sitemap-indeks fulgt ét hop ned', '');
L.push('| Kilde | Indeks | Underfiler | Afproevet | Adresser | Med lastmod |', '| --- | --- | --- | --- | --- | --- |');
for (const s of [vive, retsinfo]) {
  L.push(`| ${s.navn} | ${s.erIndeks ? 'ja' : 'nej'} | ${s.antalBoern ?? '—'} | ${s.underfiler?.length ?? 0} | ${s.adresserIAlt ?? '—'} | ${s.medLastmod ?? 0} |`);
}
L.push('');
L.push('## B. Er datoerne paalidelige?', '');
L.push('En dato, der staemples ens paa alt ved hver bygning, er ikke en aendringsdato.', '');
L.push('| Kilde | Nyeste | AEldste | Unikke dage | Andel paa nyeste dag | Fremtidige | Dom |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const s of [vive, retsinfo]) {
  const d = s.datoer;
  L.push(d ? `| ${s.navn} | ${d.nyeste} | ${d.aeldste} | ${d.unikkeDage} | ${d.andelPaaNyesteDag} % | ${d.fremtidige} | ${d.brugbar ? '**brugbar**' : '**ikke brugbar**'} |`
            : `| ${s.navn} | — | — | — | — | — | ingen lastmod |`);
}
L.push('');
for (const s of [vive, retsinfo]) {
  L.push(`**${s.navn}**`);
  for (const n of s.noter) L.push(`- ${n}`);
  for (const u of s.underfiler || []) L.push(`- underfil \`${u.url.slice(0, 80)}\`: ${u.fejl || `${u.adresser} adresser, ${u.medLastmod} med lastmod`}`);
  L.push('');
}

L.push('## C. Sundhedsstyrelsen — findes en tilladt vej?', '');
L.push('Hvert vaertsnavn er proevet **én gang** med lang pause. Intet forsoeg paa at', 'omgaa adgangsbegraensningen.', '');
L.push('| Hvad | Status | Feeds i HTML | Noter |', '| --- | --- | --- | --- |');
for (const f of sst) {
  const noter = [f.adresser != null ? `${f.adresser} adresser, ${f.medLastmod} med lastmod${f.erIndeks ? ', indeks' : ''}` : null,
                 f.sitemapsIRobots?.length ? `robots naevner ${f.sitemapsIRobots.length} sitemap(s)` : null,
                 f.fejl].filter(Boolean).join('; ');
  L.push(`| ${f.hvad} | ${f.status ?? 'ingen svar'} | ${f.feeds?.length ? f.feeds.join(', ') : '—'} | ${noter || '—'} |`);
}
L.push('', '_Maskinskrevet af `publicering/research/fase0-runde3.mjs`._');

const rapport = L.join('\n');
const fs = await import('node:fs');
fs.writeFileSync('fase0-runde3.md', rapport);
fs.writeFileSync('fase0-runde3.json', JSON.stringify({ vive, retsinfo, sst }, null, 2));
console.log('<<<FASE0-RUNDE3>>>');
console.log(rapport);
console.log('<<<SLUT>>>');

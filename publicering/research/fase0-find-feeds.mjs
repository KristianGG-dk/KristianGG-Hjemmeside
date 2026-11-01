// Fase 0, anden runde — feed-autodiscovery paa de domaener, der fejlede.
// ============================================================================
//
// Foerste runde afproevede gaettede feedadresser. Seks danske kilder gav 404.
// At gaette videre ville give flere 404'ere og opfinde adresser, der ikke
// findes. En websoegning fandt heller ingen officielle feeds for sst.dk,
// at.dk, vive.dk og nfa.dk — Sundhedsstyrelsen tilbyder nyhedsbrev paa mail.
//
// Derfor spoerger dette script sitene selv, paa den standardiserede maade:
//
//   1. <link rel="alternate" type="application/rss+xml"> i forsidens HTML
//      — den maade et site OFFICIELT oplyser, at det har et feed
//   2. Sitemap-henvisninger i robots.txt
//   3. Om /sitemap.xml findes, og hvor friske adresserne i den er
//
// Et sitemap er ikke et feed, men det har <lastmod> og kan bruges til
// aendringsdetektion, naar intet feed findes. Det er den lovlige vej:
// sitemappet er publiceret netop for at blive laest maskinelt.
//
// Scriptet hoster intet, skriver intet til repoet, bruger ingen
// hemmeligheder og henter hoejst tre sider pr. domaene.

const UA = 'kristiangg.dk kildeafproevning (fase 0; kontakt kontakt@kristiangg.dk)';
const PAUSE = 1500;
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

const DOMAENER = [
  { id: 'sst',             navn: 'Sundhedsstyrelsen',        forside: 'https://www.sst.dk/' },
  { id: 'sundhedsdata',    navn: 'Sundhedsdatastyrelsen',    forside: 'https://sundhedsdatastyrelsen.dk/' },
  { id: 'arbejdstilsynet', navn: 'Arbejdstilsynet',          forside: 'https://at.dk/' },
  { id: 'nfa',             navn: 'NFA — Arbejdsmiljoe',      forside: 'https://nfa.dk/' },
  { id: 'vive',            navn: 'VIVE',                     forside: 'https://www.vive.dk/' },
  { id: 'psykiatrifonden', navn: 'Psykiatrifonden',          forside: 'https://www.psykiatrifonden.dk/' },
  { id: 'altinget',        navn: 'Altinget',                 forside: 'https://www.altinget.dk/' },
  { id: 'retsinformation', navn: 'Retsinformation',          forside: 'https://www.retsinformation.dk/' },
];

async function hent(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'User-Agent': UA } });
    return { ok: true, status: r.status, krop: await r.text(), type: r.headers.get('content-type') || '' };
  } catch (e) { return { ok: false, fejl: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
}

const ud = [];
for (const d of DOMAENER) {
  process.stderr.write(`undersoeger ${d.id} …\n`);
  const post = { ...d, feeds: [], sitemaps: [], noter: [] };

  const f = await hent(d.forside);
  if (!f.ok) post.noter.push(`forsiden kunne ikke hentes: ${f.fejl}`);
  else if (f.status >= 400) post.noter.push(`forsiden gav HTTP ${f.status}`);
  else {
    // Officiel feed-oplysning i <head>
    for (const m of f.krop.matchAll(/<link[^>]+rel=["']?alternate["']?[^>]*>/gi)) {
      const tag = m[0];
      if (!/application\/(rss|atom)\+xml/i.test(tag)) continue;
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      const titel = (tag.match(/title=["']([^"']+)["']/i) || [])[1] || '';
      if (href) post.feeds.push({ url: new URL(href, d.forside).href, titel });
    }
    if (!post.feeds.length) post.noter.push('ingen <link rel="alternate"> med RSS/Atom i forsidens HTML');
  }
  await sov(PAUSE);

  const rob = await hent(new URL('/robots.txt', d.forside).href);
  if (rob.ok && rob.status === 200) {
    for (const m of rob.krop.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) post.sitemaps.push(m[1]);
    if (!post.sitemaps.length) post.noter.push('robots.txt naevner intet sitemap');
  } else post.noter.push('robots.txt kunne ikke hentes');
  await sov(PAUSE);

  const smUrl = post.sitemaps[0] || new URL('/sitemap.xml', d.forside).href;
  const sm = await hent(smUrl);
  if (sm.ok && sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.krop)) {
    const lastmod = [...sm.krop.matchAll(/<lastmod>([^<]+)</g)].map((m) => new Date(m[1])).filter((d) => !isNaN(d)).sort((a, b) => b - a);
    post.sitemap = {
      url: smUrl,
      indeks: /<sitemapindex/i.test(sm.krop),
      adresser: (sm.krop.match(/<loc>/g) || []).length,
      nyeste: lastmod[0] ? lastmod[0].toISOString().slice(0, 10) : null,
      medLastmod: lastmod.length,
    };
  } else post.noter.push(`sitemap ikke brugbart (${sm.ok ? `HTTP ${sm.status}` : sm.fejl})`);
  await sov(PAUSE);

  ud.push(post);
}

const L = ['# Fase 0, anden runde — feed-autodiscovery', '',
  `Koert ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
  'Spoergsmaalet er ikke «virker min gaettede adresse», men «oplyser sitet selv et feed».', '',
  '| Domaene | Officielle feeds i HTML | Sitemap | Adresser | Nyeste lastmod |',
  '| --- | --- | --- | --- | --- |'];
for (const p of ud) {
  L.push(`| ${p.navn} | ${p.feeds.length ? p.feeds.map((f) => `\`${f.url}\``).join('<br>') : '**ingen**'} | ${p.sitemap ? (p.sitemap.indeks ? 'indeks' : 'ja') : 'nej'} | ${p.sitemap?.adresser ?? '—'} | ${p.sitemap?.nyeste || '—'} |`);
}
L.push('', '## Noter pr. domaene', '');
for (const p of ud) { L.push(`**${p.navn}**`); for (const n of p.noter) L.push(`- ${n}`); if (p.sitemap) L.push(`- sitemap: ${p.sitemap.medLastmod} adresser med lastmod`); L.push(''); }
L.push('_Maskinskrevet af `publicering/research/fase0-find-feeds.mjs`._');

const rapport = L.join('\n');
await import('node:fs').then((fs) => { fs.writeFileSync('fase0-feeds.md', rapport); fs.writeFileSync('fase0-feeds.json', JSON.stringify(ud, null, 2)); });
console.log('<<<FASE0-FEEDS>>>');
console.log(rapport);
console.log('<<<SLUT>>>');

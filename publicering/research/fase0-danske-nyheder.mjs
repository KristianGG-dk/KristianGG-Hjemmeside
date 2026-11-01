// Fase 0, runde 3b — bredere soegning efter danske nyheds- og fagkilder.
// ============================================================================
// Anden runde viste, at ingen af de otte danske myndigheder og organisationer
// udgiver et feed. Det efterlader dansk daekning tynd. Denne runde undersoeger
// et bredere felt af danske nyheds- og fagmedier med samme metode, der virkede:
// vi gaetter ikke adresser, vi spoerger sitet, om det selv oplyser et feed.
//
// Og vi noejes ikke med at finde feedet — vi henter det og kontrollerer, at
// det faktisk kan laeses, hvor mange poster det baerer, og hvor friske de er.
// Et feed, der findes men staar stille, er ikke en kilde.
//
// Kildetype foelger med i listen. Et fagmedie og et dagblad er ikke det samme,
// og et dagblad er ikke en primaerkilde. Det skal kunne ses i resultatet, saa
// prioriteringen senere kan vaegte primaerkilder over medieomtale.
//
// Hoeflighed: hoejst tre forespoergsler pr. domaene plus én pr. fundet feed,
// sekventielt, med pause.

const UA = 'kristiangg.dk kildeafproevning (fase 0; kontakt kontakt@kristiangg.dk)';
const PAUSE = 1500;
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

// kildetype: fagmedie | dagblad | fagforening | myndighed | organisation | formidling
const DOMAENER = [
  { navn: 'Ugeskrift for Laeger',        url: 'https://ugeskriftet.dk/',              type: 'fagmedie',    emner: 'laegefaglig, forskning' },
  { navn: 'Dagens Medicin',              url: 'https://dagensmedicin.dk/',            type: 'fagmedie',    emner: 'sundhedsvaesen' },
  { navn: 'Sundhedspolitisk Tidsskrift', url: 'https://sundhedspolitisktidsskrift.dk/', type: 'fagmedie',  emner: 'sundhedspolitik' },
  { navn: 'Dansk Psykolog Forening',     url: 'https://www.dp.dk/',                   type: 'fagforening', emner: 'psykologi, psykisk sundhed' },
  { navn: 'Socialstyrelsen',             url: 'https://sbst.dk/',                     type: 'myndighed',   emner: 'socialt arbejde, udsatte' },
  { navn: 'Det Nationale Sorgcenter',    url: 'https://sorgcenter.dk/',               type: 'organisation', emner: 'sorg, paaroerende' },
  { navn: 'Information',                 url: 'https://www.information.dk/',          type: 'dagblad',     emner: 'samfundsdebat' },
  { navn: 'Politiken',                   url: 'https://politiken.dk/',                type: 'dagblad',     emner: 'samfundsdebat' },
  { navn: 'Kristeligt Dagblad',          url: 'https://www.kristeligt-dagblad.dk/',   type: 'dagblad',     emner: 'eksistens, trivsel' },
  { navn: 'TV 2',                        url: 'https://nyheder.tv2.dk/',              type: 'dagblad',     emner: 'samfundsdebat' },
  { navn: 'Mandag Morgen',               url: 'https://www.mm.dk/',                   type: 'fagmedie',    emner: 'arbejdsliv, politik' },
  { navn: 'Videncenter for Arbejdsmiljoe', url: 'https://www.arbejdsmiljoviden.dk/',  type: 'organisation', emner: 'arbejdsmiljoe, stress' },
  { navn: 'Psykiatrien — Region H',      url: 'https://www.psykiatri-regionh.dk/',    type: 'myndighed',   emner: 'psykiatri' },
  { navn: 'Laegemiddelstyrelsen',        url: 'https://laegemiddelstyrelsen.dk/',     type: 'myndighed',   emner: 'laegemidler' },
];

async function hent(url, metode = 'GET') {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { method: metode, signal: c.signal, redirect: 'follow', headers: { 'User-Agent': UA } });
    return { ok: true, status: r.status, krop: metode === 'GET' ? await r.text() : '', type: r.headers.get('content-type') || '' };
  } catch (e) { return { ok: false, fejl: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
}

// Henter et fundet feed og kontrollerer, at det kan laeses og er i live.
async function proevFeed(url) {
  const r = await hent(url);
  if (!r.ok || r.status >= 400) return { url, virker: false, note: r.ok ? `HTTP ${r.status}` : r.fejl };
  const erRss = /<rss|<feed/i.test(r.krop.slice(0, 600));
  if (!erRss) return { url, virker: false, note: `svarede ${r.status}, men er ikke RSS/Atom (${r.type.split(';')[0]})` };
  const poster = (r.krop.match(/<item[\s>]/g) || []).length || (r.krop.match(/<entry[\s>]/g) || []).length;
  const d = [...r.krop.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)</g)]
    .map((m) => new Date(m[1])).filter((x) => !isNaN(x) && x <= Date.now()).sort((a, b) => b - a);
  const pr30 = d.filter((x) => Date.now() - x < 30 * 864e5).length;
  return { url, virker: poster > 0, poster, nyeste: d[0] ? d[0].toISOString().slice(0, 10) : null, pr30 };
}

const ud = [];
for (const d of DOMAENER) {
  process.stderr.write(`undersoeger ${d.navn} …\n`);
  const post = { ...d, feeds: [], noter: [] };
  const f = await hent(d.url);
  await sov(PAUSE);

  if (!f.ok) post.noter.push(`forsiden kunne ikke hentes: ${f.fejl}`);
  else if (f.status >= 400) post.noter.push(`forsiden gav HTTP ${f.status}`);
  else {
    const fundne = [];
    for (const m of f.krop.matchAll(/<link[^>]+>/gi)) {
      const tag = m[0];
      if (!/rel=["']?alternate/i.test(tag) || !/application\/(rss|atom)\+xml/i.test(tag)) continue;
      let href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      // HTML-entiteter skal afkodes. Uden dette blev ?format=feed&amp;type=rss
      // sendt med &amp; i selve adressen, og Sundhedspolitisk Tidsskrift blev
      // fejlagtigt meldt ubrugelig i koerslen 01-11-2026.
      if (href) href = href.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"');
      if (href) fundne.push(new URL(href, d.url).href);
    }
    const unikke = [...new Set(fundne)].slice(0, 3);   // hoejst tre pr. domaene
    if (!unikke.length) post.noter.push('ingen <link rel="alternate"> med RSS/Atom i forsidens HTML');
    for (const u of unikke) { post.feeds.push(await proevFeed(u)); await sov(PAUSE); }
  }
  ud.push(post);
}

const virker = ud.filter((d) => d.feeds.some((f) => f.virker));
const L = ['# Fase 0, runde 3b — danske nyheds- og fagkilder', '',
  `Koert ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
  `**${virker.length} af ${ud.length} domaener oplyser et feed, der faktisk kan laeses.**`, '',
  'Feedene er ikke bare fundet — de er hentet og kontrolleret. Et feed, der', 'findes men staar stille, er ikke en kilde.', '',
  '| Kilde | Kildetype | Feed | Poster | Nyeste | Pr. 30 dage |', '| --- | --- | --- | --- | --- | --- |'];
for (const d of ud) {
  const g = d.feeds.find((f) => f.virker);
  L.push(g ? `| ${d.navn} | ${d.type} | \`${g.url}\` | ${g.poster} | ${g.nyeste || '—'} | ${g.pr30 ?? '—'} |`
           : `| ${d.navn} | ${d.type} | **ingen brugbar** | — | — | — |`);
}
L.push('', '## Noter', '');
for (const d of ud) {
  if (d.feeds.some((f) => f.virker) && !d.noter.length) continue;
  L.push(`**${d.navn}**`);
  for (const n of d.noter) L.push(`- ${n}`);
  for (const f of d.feeds.filter((x) => !x.virker)) L.push(`- \`${f.url}\`: ${f.note || 'ingen poster'}`);
  L.push('');
}
L.push('_Maskinskrevet af `publicering/research/fase0-danske-nyheder.mjs`._');

const rapport = L.join('\n');
const fs = await import('node:fs');
fs.writeFileSync('fase0-danske.md', rapport);
fs.writeFileSync('fase0-danske.json', JSON.stringify(ud, null, 2));
console.log('<<<FASE0-DANSKE>>>');
console.log(rapport);
console.log('<<<SLUT>>>');

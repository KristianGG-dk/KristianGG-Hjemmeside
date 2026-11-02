/* Hjemmesidens egne krav — kontrolleret paa det byggede site.
   ============================================================================

   Ingen browser, ingen netvaerk, ingen afhaengigheder. Koerer derfor i CI paa
   hver PR, hvor tests/kontaktformular.mjs (Playwright) ikke altid kan.

   Fire ting holdes fast:

     A. Den gratis forsamtale staar tydeligt OEVERST paa forsiden og paa
        ydelsessiderne — og staar der kun, hvor den faktisk er indgangen.
     B. Kontaktformularen kan modtage en henvendelse, og den kan naa frem.
     C. Konverteringsmaalingen er FORBEREDT, men IKKE AKTIVERET.
     D. Den optjente soegevaerdi er intakt: adresser, canonical, robots,
        sitemap og de 96 viderestillinger.

   Bygget skal findes i public/. Byg med:
       hugo --minify --buildFuture

   Bemaerk: hugo --minify fjerner anfoerselstegn omkring attributvaerdier og
   fjerner HTML-kommentarer. Alle udtryk herunder taaler begge former.        */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROD, 'public');
const BASE = 'https://kristiangg.dk';

const fejl = [];
const noter = [];
const x = (m) => fejl.push(m);
const ok = (m) => noter.push(m);

if (!fs.existsSync(PUB)) {
  console.error('public/ findes ikke. Byg foerst: hugo --minify --buildFuture');
  process.exit(2);
}

/* ── Hjaelpere ───────────────────────────────────────────────────────────── */

/* Sider, der kommer fra static/, er ikke Hugo-sider: /admin/ (Decap CMS) og
   /oauth/.../ (autorisationsflowene) har med vilje hverken canonical,
   description eller plads i sitemappet. De kopieres raat til public/ og
   kontrolleres derfor ikke som indholdssider. Opslaget sker i static/ selv,
   saa listen foelger med, hvis der kommer flere til. */
function fraStatic(relativ) {
  return fs.existsSync(path.join(ROD, 'static', relativ));
}

function sider() {
  const ud = [];
  (function gaa(d) {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      const s = fs.statSync(f);
      if (s.isDirectory()) gaa(f);
      else if (n === 'index.html' || n === '404.html') {
        const relativ = path.relative(PUB, f).split(path.sep).join('/');
        if (fraStatic(relativ)) continue;
        ud.push({ url: '/' + relativ.replace(/index\.html$/, ''), fil: f });
      }
    }
  })(PUB);
  return ud.sort((a, b) => a.url.localeCompare(b.url));
}

const laes = (f) => fs.readFileSync(f, 'utf-8');

// Attributvaerdi, med eller uden anfoerselstegn (minify fjerner dem).
function attr(html, navn, element = 'meta') {
  const re = new RegExp(
    `<${element}[^>]*\\b${navn}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s">]+))`,
    'gi');
  const ud = [];
  let m;
  while ((m = re.exec(html))) ud.push(m[1] ?? m[2] ?? m[3]);
  return ud;
}

function metaIndhold(html, navn) {
  const re = new RegExp(
    `<meta[^>]*\\bname\\s*=\\s*["']?${navn}["']?[^>]*>`, 'gi');
  const ud = [];
  let m;
  while ((m = re.exec(html))) {
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[0]);
    if (c) ud.push(c[1] ?? c[2] ?? c[3]);
  }
  return ud;
}

function canonical(html) {
  const re = /<link[^>]*\brel\s*=\s*["']?canonical["']?[^>]*>/gi;
  const ud = [];
  let m;
  while ((m = re.exec(html))) {
    const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[0]);
    if (h) ud.push(h[1] ?? h[2] ?? h[3]);
  }
  return ud;
}

const maalepunkter = (html) =>
  [...html.matchAll(/\bdata-konverter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi)]
    .map((m) => m[1] ?? m[2] ?? m[3]);

// Minimal TOML-laeser til de felter, filerne her faktisk bruger: strenge,
// booleans og lister af strenge. Ingen afhaengighed, og den ser kun paa de
// noegler, testen spoerger om.
function toml(fil) {
  const ud = {};
  let bord = ud;
  for (let linje of laes(fil).split(/\r?\n/)) {
    linje = linje.replace(/(^|\s)#.*$/, '').trim();
    if (!linje) continue;
    const b = /^\[([^\]]+)\]$/.exec(linje);
    if (b) {
      bord = ud;
      for (const del of b[1].split('.')) bord = (bord[del] ||= {});
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(linje);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === 'true' || v === 'false') v = v === 'true';
    else if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else v = v.replace(/^["']|["']$/g, '');
    bord[kv[1]] = v;
  }
  return ud;
}

const ALLE = sider();
const HTML = new Map(ALLE.map((s) => [s.url, laes(s.fil)]));
const hent = (u) => HTML.get(u);

/* ══ A. Den gratis forsamtale ════════════════════════════════════════════ */

const F = toml(path.join(ROD, 'data', 'forsamtale.toml'));

const SKAL_HAVE = ['/', '/kontakt/', '/til-dig/', '/til-dig/psykoterapi/',
  '/til-dig/naturterapi/', '/til-dig/stress/', '/til-dig/angst/',
  '/til-dig/soevnproblemer/', '/til-dig/nervesystemet/'];

// Hvor den IKKE maa staa. Erhvervssiderne saelger aftaler, kurserne har egen
// tilmelding, og /priser/ siger det allerede to gange. Begrundelserne staar
// i data/forsamtale.toml.
const MAA_IKKE = ['/priser/', '/kurser/', '/kurser/skovbad/', '/kurser/cash-stuffing/',
  '/begivenheder/', '/til-virksomheder/', '/til-kommuner/', '/til-organisationer/',
  '/blog/', '/om/'];

if (!F.overskrift || !F.tekst) {
  x('data/forsamtale.toml mangler overskrift eller tekst');
} else {
  for (const u of SKAL_HAVE) {
    const h = hent(u);
    if (!h) { x(`siden ${u} findes ikke i bygget`); continue; }
    if (!h.includes(F.overskrift)) {
      x(`${u} mangler blokken om den gratis forsamtale ("${F.overskrift}")`);
      continue;
    }
    // "OEVERST" maales i forhold til sidens egen overskrift, ikke til
    // begyndelsen af filen: headeren ligger foerst i DOM'en og har sin egen
    // SMS-knap i mobilmenuen.
    //
    // Tre krav: blokken staar EFTER <h1>, FOER den foerste sektion slutter
    // (altsaa i hero'en, over folden), og FOER hero'ens kontaktknapper.
    const pos = h.indexOf(F.overskrift);
    const h1 = h.search(/<h1[\s>]/i);
    const slutFoersteSektion = h.indexOf('</section>', h1 === -1 ? 0 : h1);
    if (h1 !== -1 && pos < h1) {
      x(`${u}: blokken staar foer sidens overskrift`);
    }
    if (slutFoersteSektion !== -1 && pos > slutFoersteSektion) {
      x(`${u}: blokken staar uden for hero'en — den er ikke oeverst paa siden`);
    }
    const knapUdtryk = /\bdata-konverter\s*=\s*["']?kontakt-/gi;
    let heroKnap = -1;
    let m;
    while ((m = knapUdtryk.exec(h))) {
      if (m.index > h1) { heroKnap = m.index; break; }
    }
    if (heroKnap !== -1 && pos > heroKnap) {
      x(`${u}: blokken staar efter hero'ens kontaktknapper — den skal laeses foer handlingen`);
    }
  }
  const forkert = MAA_IKKE.filter((u) => hent(u) && hent(u).includes(F.overskrift));
  if (forkert.length) {
    x(`blokken om den gratis forsamtale staar paa sider, hvor den ikke hoerer til: ${forkert.join(', ')}`
      + ' — se begrundelserne i data/forsamtale.toml');
  }
  if (!fejl.length) {
    ok(`den gratis forsamtale staar oeverst paa ${SKAL_HAVE.length} sider og ingen andre steder`);
  }

  // Ordlyden maa ikke komme i utakt med /priser/.
  const priser = laes(path.join(ROD, 'content', 'priser.md'));
  if (!/title:\s*Gratis forsamtale/.test(priser)) {
    x('kortet "Gratis forsamtale" findes ikke laengere i content/priser.md — '
      + 'blokken paa forsiden lover da noget, prislisten ikke bekraefter');
  } else if (!/price:\s*Gratis/.test(priser)) {
    x('kortet "Gratis forsamtale" paa /priser/ har ikke laengere prisen "Gratis"');
  } else {
    ok('/priser/ bekraefter stadig, at forsamtalen er gratis');
  }
  const varighed = String(F.varighed || '');
  if (varighed && !F.tekst.includes(varighed)) {
    x(`varighed "${varighed}" i data/forsamtale.toml staar ikke i teksten`);
  } else if (varighed && !priser.includes(varighed)) {
    x(`varigheden "${varighed}" staar ikke paa /priser/ — de to steder er i utakt`);
  } else if (varighed) {
    ok(`varigheden "${varighed}" er den samme i blokken og paa /priser/`);
  }

  // Der er ingen kalender paa sitet. Blokken maa ikke love en booking.
  for (const u of SKAL_HAVE) {
    const h = hent(u) || '';
    const i = h.indexOf(F.overskrift);
    if (i === -1) continue;
    if (/\bbook\b/i.test(h.slice(i, i + 1200))) {
      x(`${u}: blokken bruger ordet "book" — der er ingen onlinebooking paa sitet`);
    }
  }
}

/* ══ B. Kontaktformularen ════════════════════════════════════════════════ */

const medForm = ALLE.filter((s) => /<form[\s>]/i.test(hent(s.url)));
if (medForm.length !== 1 || medForm[0].url !== '/kontakt/') {
  x(`forventede én formular paa /kontakt/, fandt ${medForm.length}: ${medForm.map((s) => s.url).join(', ')}`);
} else {
  const h = hent('/kontakt/');

  for (const [re, hvad] of [
    [/data-netlify\s*=\s*["']?true/i, 'data-netlify="true"'],
    [/name\s*=\s*["']?form-name["']?[^>]*value\s*=\s*["']?kontakt/i, 'det skjulte form-name-felt'],
    [/data-netlify-honeypot\s*=\s*["']?bot-field/i, 'honeypot'],
    [/<form[^>]*\baction\s*=\s*["']?\/\S/i, 'en action, henvendelsen kan sendes til'],
  ]) {
    if (!re.test(h)) x(`formularen mangler ${hvad} — Netlify tager den da ikke imod`);
  }

  // Emnefeltet. Et TOMT subject betyder, at Netlify slet ikke sender
  // notifikationsmailen: henvendelsen gemmes, men naar aldrig frem. Det var
  // en rigtig fejl, og den maa ikke kunne komme igen.
  const emne = /<select[^>]*\bname\s*=\s*["']?subject["']?[^>]*>([\s\S]*?)<\/select>/i.exec(h);
  if (!emne) {
    x('feltet "subject" findes ikke i formularen — Netlify sender da ingen mail');
  } else {
    const valg = [...emne[1].matchAll(/<option[^>]*\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/gi)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? '');
    const antalOptions = (emne[1].match(/<option/gi) || []).length;
    if (valg.length !== antalOptions) {
      x(`${antalOptions - valg.length} option(s) i emnefeltet har slet ingen value — Netlify sender da ingen mail`);
    }
    const tomme = valg.filter((v) => !v.trim());
    if (tomme.length) {
      x(`${tomme.length} option(s) i emnefeltet har tom vaerdi — Netlify sender da ingen mail. `
        + 'Se kommentaren i layouts/partials/contact-form.html');
    } else if (valg.length) {
      ok(`emnefeltet har ${valg.length} valg, og ingen af dem er tomme — standard "${valg[0]}"`);
    }
  }

  const paakraevede = [...h.matchAll(/<(?:input|select|textarea)[^>]*\brequired\b[^>]*>/gi)]
    .map((m) => {
      const n = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[0]);
      return n ? (n[1] ?? n[2] ?? n[3]) : '(uden navn)';
    });
  const uventede = paakraevede.filter((n) => n !== 'email');
  if (uventede.length) {
    x(`flere felter end e-mail er paakraevede (${uventede.join(', ')}) — en mangelfuld henvendelse blokeres`);
  } else if (!paakraevede.includes('email')) {
    x('e-mail er ikke paakraevet — en henvendelse kan sendes, uden at der kan svares paa den');
  } else {
    ok('kun e-mail er paakraevet, og den ER paakraevet');
  }

  if (!/udfyldes/i.test(h) || !h.includes('*')) {
    x('formularen forklarer ikke, hvad stjernen betyder');
  } else {
    ok('stjernen er forklaret i formularen');
  }

  // Kvitteringssiden skal findes, og den maa ikke indekseres.
  const action = /<form[^>]*\baction\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(h);
  const maal = action ? (action[1] ?? action[2] ?? action[3]) : null;
  if (maal && maal.startsWith('/')) {
    if (!hent(maal)) {
      x(`formularens action peger paa ${maal}, som ikke findes i bygget — en henvendelse uden JavaScript lander paa en 404`);
    } else if (!metaIndhold(hent(maal), 'robots').some((v) => /noindex/i.test(v))) {
      x(`kvitteringssiden ${maal} er ikke noindex — den kan havne i soegeresultaterne`);
    } else {
      ok(`kvitteringssiden ${maal} findes og er noindex`);
    }
  }
}

/* ══ C. Konverteringsmaaling: forberedt, ikke aktiveret ══════════════════ */

const KONF = toml(path.join(ROD, 'hugo.toml'));
const K = KONF.params?.konvertering;
if (!K) {
  x('[params.konvertering] findes ikke i hugo.toml — maalingen er ikke forberedt');
} else if (K.aktiv !== false) {
  x('params.konvertering.aktiv er ikke false i hugo.toml. Maalingen skal vaere '
    + 'FORBEREDT, ikke aktiveret. Se dokumentation/konverteringsmaaling.md');
} else {
  ok('params.konvertering.aktiv = false — ingen maaler indlaeses');
}

// Samtykke. Naar maalingen en dag taendes, afgoer udbyderen, om der skal
// foreligge et ja: Plausible saetter ingen cookies, GA4 goer. Kontrollen
// staar her, saa en fremtidig aktivering ikke kan glemme den.
if (K) {
  if (!('samtykke_kraeves' in K)) {
    x('params.konvertering.samtykke_kraeves mangler i hugo.toml');
  } else if (K.udbyder === 'ga4' && K.samtykke_kraeves !== true) {
    x('udbyder = "ga4" kraever samtykke_kraeves = true — GA4 saetter cookies');
  } else {
    ok(`samtykke_kraeves = ${K.samtykke_kraeves} passer til udbyder "${K.udbyder || '(ingen)'}"`);
  }
}

// Samtykkebanneret og data-samtykke maa ikke findes, saa laenge maalingen er
// slukket. Dukker de op, er noget blevet aktiveret.
const medBanner = ALLE.filter((s) => /kgg-samtykke/.test(hent(s.url)));
const medAttribut = ALLE.filter((s) => /<html[^>]*\bdata-samtykke\b/i.test(hent(s.url)));
if (K && K.aktiv === false) {
  if (medBanner.length) x(`samtykkebanneret vises paa ${medBanner.length} side(r), selv om maalingen er slukket`);
  if (medAttribut.length) x(`data-samtykke staar paa ${medAttribut.length} side(r), selv om samtykke ikke kraeves`);
  if (!medBanner.length && !medAttribut.length) ok('intet samtykkebanner og ingen data-samtykke — intet vises for den besoegende');
}

const VAERTER = /plausible\.io|googletagmanager\.com|google-analytics\.com|gtag\/js|matomo|hotjar|clarity\.ms|connect\.facebook\.net|segment\.(?:io|com)|mixpanel/i;
const OPRETTER = /\bdataLayer\s*=|\bgtag\s*\(|\bfbq\s*\(|window\.plausible\s*=/;
const forurenet = [];
for (const s of ALLE) {
  const h = hent(s.url);
  if (VAERTER.test(h) || OPRETTER.test(h)) forurenet.push(s.url);
}
if (forurenet.length) {
  x(`en maaler er sluppet ind paa ${forurenet.length} side(r): ${forurenet.slice(0, 5).join(', ')}`);
} else {
  ok(`ingen af de ${ALLE.length} sider indlaeser eller opretter en maaler`);
}

// Opsamlingen i main.js maa kun LAESE window.plausible/dataLayer, aldrig
// oprette dem. Gjorde den det, var maalingen aktiveret ad bagdoeren.
const jsFiler = fs.existsSync(path.join(PUB, 'js'))
  ? fs.readdirSync(path.join(PUB, 'js')).filter((n) => n.endsWith('.js'))
  : [];
if (!jsFiler.length) {
  x('ingen JavaScript i public/js/ — opsamlingen er ikke bygget med');
} else {
  for (const n of jsFiler) {
    const j = laes(path.join(PUB, 'js', n));
    if (/(?:window\.)?(?:dataLayer|plausible)\s*=[^=]/.test(j)) {
      x(`${n} TILDELER window.dataLayer eller window.plausible — opsamlingen skal kun laese dem`);
    }
    if (VAERTER.test(j)) x(`${n} henviser til en maalervaert`);
  }
  const samlet = jsFiler.map((n) => laes(path.join(PUB, 'js', n))).join('\n');
  if (!/kggKonverter/.test(samlet)) {
    x('kggKonverter findes ikke i den byggede JavaScript — maalingen er ikke forberedt');
  } else {
    ok('opsamlingen (kggKonverter) er bygget med og laeser kun en maaler, der findes');
  }
}

const KRAEVEDE_PUNKTER = ['kontakt-sms', 'kontakt-mail', 'kontakt-telefon', 'formular-sendt'];
const paaKontakt = new Set(maalepunkter(hent('/kontakt/') || ''));
const mangler = KRAEVEDE_PUNKTER.filter((p) => !paaKontakt.has(p));
if (mangler.length) {
  x(`maalepunkter mangler paa /kontakt/: ${mangler.join(', ')}`);
} else {
  ok(`alle ${KRAEVEDE_PUNKTER.length} maalepunkter staar paa /kontakt/`);
}
const udenPunkter = ALLE.filter((s) => /kontakt-knapper|data-konverter/.test('') === false
  && /\bdata-konverter\b/.test(hent(s.url)) === false
  && /\bphone_sms|sms:\+/.test(hent(s.url)));
if (udenPunkter.length) {
  x(`sider med et SMS-link men uden maalepunkt: ${udenPunkter.map((s) => s.url).slice(0, 5).join(', ')}`);
} else {
  ok('hvert SMS-link paa sitet har et maalepunkt');
}

/* ══ D. Soegevaerdien ════════════════════════════════════════════════════ */

for (const s of ALLE) {
  const h = hent(s.url);
  const c = canonical(h);
  if (s.url === '/404.html') {
    if (c.length > 1) x('/404.html har mere end én canonical');
  } else if (c.length !== 1) {
    x(`${s.url} har ${c.length} canonical — der skal vaere præcis én`);
  } else {
    const ventet = BASE + s.url;
    if (c[0] !== ventet) x(`${s.url} har canonical ${c[0]}, ventede ${ventet}`);
  }
  const r = metaIndhold(h, 'robots');
  if (r.length !== 1) x(`${s.url} har ${r.length} robots-meta — der skal vaere præcis én`);
  const t = /<title>([\s\S]*?)<\/title>/i.exec(h);
  if (!t || !t[1].trim()) x(`${s.url} har ingen title`);
  const d = metaIndhold(h, 'description');
  if (!d.length || !d[0].trim()) x(`${s.url} har ingen description`);
}

const NOINDEX_VENTET = new Set(['/404.html', '/tak/', '/tak-for-koebet/']);
const noindex = ALLE
  .filter((s) => metaIndhold(hent(s.url), 'robots').some((v) => /noindex/i.test(v)))
  .map((s) => s.url);
const uventetNoindex = noindex.filter(
  (u) => !NOINDEX_VENTET.has(u) && !/^\/(categories|tags)\//.test(u));
if (uventetNoindex.length) {
  x(`sider er blevet noindex: ${uventetNoindex.join(', ')} — soegevaerdi gaar tabt`);
}
const mistetNoindex = [...NOINDEX_VENTET].filter((u) => hent(u) && !noindex.includes(u));
if (mistetNoindex.length) {
  x(`sider skal vaere noindex, men er det ikke: ${mistetNoindex.join(', ')}`);
}
if (!uventetNoindex.length && !mistetNoindex.length) {
  ok(`${ALLE.length} sider: præcis én canonical til sig selv, og noindex kun hvor det hoerer til`);
}

// Sitemap: alt indekserbart med, intet noindex med.
const sitemap = path.join(PUB, 'sitemap.xml');
if (!fs.existsSync(sitemap)) {
  x('sitemap.xml findes ikke');
} else {
  const loc = new Set([...laes(sitemap).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const indekserbare = ALLE
    .filter((s) => s.url !== '/404.html' && !noindex.includes(s.url))
    .map((s) => BASE + s.url);
  const udeladt = indekserbare.filter((u) => !loc.has(u));
  const forkert = [...loc].filter((u) => noindex.includes(u.replace(BASE, '')));
  if (udeladt.length) x(`sitemap mangler ${udeladt.length} side(r): ${udeladt.slice(0, 5).join(', ')}`);
  if (forkert.length) x(`sitemap indeholder noindex-sider: ${forkert.join(', ')}`);
  if (!udeladt.length && !forkert.length) ok(`sitemap: ${loc.size} adresser, alle indekserbare, ingen noindex`);
}

const robots = path.join(PUB, 'robots.txt');
if (!fs.existsSync(robots)) x('robots.txt findes ikke');
else {
  const r = laes(robots);
  if (!/Sitemap:\s*https:\/\/kristiangg\.dk\/sitemap\.xml/.test(r)) x('robots.txt henviser ikke til sitemap.xml');
  if (!/Disallow:\s*\/admin\//.test(r)) x('robots.txt tillader /admin/');
  if (/^\s*Disallow:\s*\/\s*$/m.test(r)) x('robots.txt blokerer hele sitet');
  if (!fejl.some((f) => f.includes('robots.txt'))) ok('robots.txt: /admin/ blokeret, sitemap henvist, resten aabent');
}

// De 96 viderestillinger. De baerer soegevaerdien fra de gamle adresser.
const nt = laes(path.join(ROD, 'netlify.toml'));
const blokke = [...nt.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"\s*\n\s*status\s*=\s*(\d+)/g)];
const antalBlokke = (nt.match(/^\[\[redirects\]\]/gm) || []).length;
if (antalBlokke !== 96) {
  x(`netlify.toml har ${antalBlokke} viderestillinger, ventede 96 — gamle adresser mister deres soegevaerdi`);
} else if (blokke.length !== 96) {
  x(`${96 - blokke.length} viderestilling(er) kunne ikke laeses — formen skal vaere from/to/status`);
} else {
  const ikke301 = blokke.filter((b) => b[3] !== '301').map((b) => b[1]);
  if (ikke301.length) x(`viderestillinger uden status 301: ${ikke301.join(', ')} — soegevaerdi overfoeres ikke`);
  const doede = blokke
    .filter((b) => b[2].startsWith('/') && !b[2].includes('*') && !b[2].includes(':') && !hent(b[2]))
    .map((b) => `${b[1]} → ${b[2]}`);
  if (doede.length) x(`viderestillinger peger paa sider, der ikke findes: ${doede.slice(0, 5).join(', ')}`);
  if (!ikke301.length && !doede.length) {
    ok('alle 96 viderestillinger er 301 og peger paa en side, der findes');
  }
}

/* ── Dom ─────────────────────────────────────────────────────────────────── */

console.log('\nHJEMMESIDEN (kristiangg.dk)\n' + '='.repeat(70) + '\n');
if (fejl.length) {
  console.log(`FEJL (${fejl.length}):`);
  for (const f of fejl) console.log('  x', f);
  console.log();
}
console.log('KONTROLLERET:');
for (const n of noter) console.log('  ·', n);
console.log('\nRESULTAT:', fejl.length ? 'FEJL FUNDET' : 'OK');
process.exit(fejl.length ? 1 : 0);

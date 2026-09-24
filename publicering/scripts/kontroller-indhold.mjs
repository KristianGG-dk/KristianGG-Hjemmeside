// Indholdskontrollen. Koerer i CI-gaten paa hver PR, efter versionslaasen.
//
// verificer.mjs passer paa, at det publicerede er det godkendte.
// Denne fil passer paa, at det godkendte kan taale at blive publiceret.
//
// Den LAESER og DOEMMER. Den skriver aldrig, og den retter aldrig en tekst.
//
//   FAIL    stopper merge. Kan ikke tilsidesaettes, heller ikke af en ordre.
//   REVIEW  stopper merge, indtil Kristians skriftlige stillingtagen staar i
//           laasefilen under "kontrol_stillingtagen".
//   ADVARSEL vises, men stopper ikke. Bruges kun for elementer godkendt foer
//           kontrollen blev indfoert (se indholdsregler.json "indfoert").
//
// Maskinen fanger kendte ord og moenstre. Den kan ikke afgoere, om et opslag
// som helhed skaber et forkert indtryk. Det skoen er Kristians, og det skal
// staa i laasefilen, ikke kun i en chat.
//
// Brug:
//   node publicering/scripts/kontroller-indhold.mjs            hele gaten
//   node publicering/scripts/kontroller-indhold.mjs --stempel publicering/laase/element-NN.json
//        udskriver det "kontrol"-objekt, der skal ind i laasefilen FOER godkendelse
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const RODEN = process.cwd();
const REGLER_STI = 'publicering/regler/indholdsregler.json';
const LAASE = 'publicering/laase';
const KOE = 'publicering/koe.json';
const REGISTER = 'publicering/register.json';
const PAKKER = 'publicering/pakker';

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// JavaScripts \b kender ikke æ, ø og å. Denne gør.
const GRAENSE = '(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))';
export const rx = (m, flag = 'giu') => new RegExp(m.replaceAll('\\b', GRAENSE), flag);

export function laesRegler(sti = REGLER_STI) {
  return JSON.parse(readFileSync(sti, 'utf8'));
}

// ── Tekst ────────────────────────────────────────────────────────────────
// Hele opslaget kontrolleres, ikke kun broedteksten: titel, beskrivelse,
// alt-tekst, CTA og hashtags kan hver for sig skabe et forkert indtryk.
export function samletTekst(e) {
  let brod = e.tekst ?? '';
  if (e.kanal === 'website' && e.kildefil && existsSync(e.kildefil)) {
    const md = readFileSync(e.kildefil, 'utf8');
    brod = md.split('---\n').slice(2).join('---\n');
  }
  return [e.titel, e.meta_description, brod, e.alt_tekst, e.cta, (e.hashtags ?? []).join(' ')]
    .filter(Boolean).join('\n\n');
}

function uddrag(tekst, idx, laengde) {
  const fra = Math.max(0, idx - 40), til = Math.min(tekst.length, idx + laengde + 40);
  return (fra ? '…' : '') + tekst.slice(fra, til).replace(/\s+/g, ' ').trim() + (til < tekst.length ? '…' : '');
}

function fund(tekst, moenster) {
  const ud = [];
  for (const m of tekst.matchAll(rx(moenster))) ud.push({ match: m[0], uddrag: uddrag(tekst, m.index, m[0].length) });
  return ud;
}

// ── Priser ───────────────────────────────────────────────────────────────
export function kendtePriser(sti) {
  if (!existsSync(sti)) return new Set();
  const s = readFileSync(sti, 'utf8');
  return new Set([...s.matchAll(/price:\s*"?(\d+)"?/g)].map((m) => Number(m[1])));
}

export function priserITekst(tekst) {
  return [...tekst.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:kr\.?|kroner|DKK)/gi)]
    .map((m) => ({ beloeb: Number(m[1].replaceAll('.', '')), match: m[0] }));
}

// ── Genbrug ──────────────────────────────────────────────────────────────
const ord = (t) => t.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
export function faellesNgram(a, b, n) {
  const g = (w) => { const s = new Set(); for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' ')); return s; };
  const A = g(ord(a)), B = g(ord(b));
  let c = 0; for (const x of A) if (B.has(x)) c++;
  return c;
}

// ── Kontrol af ét element ────────────────────────────────────────────────
// Returnerer en liste af fund: {niveau, omraade, type, regel, match, uddrag, grund, kilde}
export function kontrollerElement(e, regler, { priser, andre = [] } = {}) {
  const tekst = samletTekst(e);
  const ud = [];
  const tilfoej = (niveau, omraade, blok, f, grund, regel) =>
    ud.push({ niveau, omraade, type: blok.type, regel, match: f.match, uddrag: f.uddrag, grund, kilde: blok.kilde });

  for (const r of regler.titler.forbudte)
    for (const f of fund(tekst, r.moenster)) tilfoej('FAIL', 'titler', regler.titler, f, r.grund, r.moenster);

  for (const f of fund(tekst, regler.moms.moenster))
    tilfoej('FAIL', 'moms', regler.moms, f, 'Aldrig "ekskl. moms" paa en forbrugerpris for en momsfri ydelse', regler.moms.moenster);

  for (const p of priserITekst(tekst))
    if (!priser.has(p.beloeb))
      tilfoej('FAIL', 'pris', regler.pris, { match: p.match, uddrag: uddrag(tekst, tekst.indexOf(p.match), p.match.length) },
        `Beloebet ${p.beloeb} kr. findes ikke paa /priser/`, 'pris');

  const harEvidens = Array.isArray(e.evidens) && e.evidens.length > 0
    && e.evidens.every((x) => x.id && x.url && x.dokumenterer_ikke);
  const forskning = fund(tekst, regler.forskning.moenster);
  if (forskning.length && !harEvidens)
    tilfoej('FAIL', 'forskning', regler.forskning, forskning[0],
      'Forskning omtales, men laasefilen har ingen gyldig "evidens"-post (id, url, dokumenterer_ikke)', regler.forskning.moenster);

  for (const r of regler.effekt.moenstre)
    for (const f of fund(tekst, r.moenster)) tilfoej('REVIEW', 'effekt', regler.effekt, f, r.grund, r.moenster);

  if (!harEvidens)
    for (const r of regler.faktaudsagn.moenstre)
      for (const f of fund(tekst, r.moenster)) tilfoej('REVIEW', 'faktaudsagn', regler.faktaudsagn, f, r.grund, r.moenster);

  for (const a of andre) {
    if (a.kanal === e.kanal || a.element === e.element) continue;
    const n = faellesNgram(tekst, samletTekst(a), regler.genbrug.ngram);
    if (n > regler.genbrug.graense)
      ud.push({ niveau: 'REVIEW', omraade: 'genbrug', type: regler.genbrug.type, regel: `element-${a.element}`,
        match: `${n} faelles ${regler.genbrug.ngram}-ordssekvenser`, uddrag: `element ${e.element} (${e.kanal}) × element ${a.element} (${a.kanal})`,
        grund: 'Samme tekst paa flere kanaler uden reel kanaltilpasning', kilde: regler.genbrug.kilde });
  }
  return ud;
}

// En REVIEW er afklaret, naar laasefilen har en stillingtagen med samme
// omraade og samme fundne tekst, og med navn, dato og begrundelse.
export function afklaret(f, e) {
  return (e.kontrol_stillingtagen ?? []).some((s) =>
    s.omraade === f.omraade && s.match?.toLowerCase() === f.match.toLowerCase()
    && s.af && s.dato && s.begrundelse && s.beslutning === 'godkendt');
}

// Stemplet binder godkendelsen til praecis dette kontrolresultat. Aendres
// tekst, regler eller stillingtagen efter godkendelsen, afviger stemplet.
export function stempel(e, regler, ctx) {
  const fundne = kontrollerElement(e, regler, ctx)
    .map(({ niveau, omraade, regel, match }) => ({ niveau, omraade, regel, match: match.toLowerCase() }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const grundlag = JSON.stringify({ version: regler.version, tekst: sha256(samletTekst(e)), fundne, stillingtagen: e.kontrol_stillingtagen ?? [] });
  return { version: regler.version, resultat_sha256: sha256(grundlag).slice(0, 16) };
}

export const erNy = (e, regler) => (e.godkendt_dato ?? '9999') >= regler.indfoert;

// ── Sitefiler: titler gaelder overalt, ogsaa schema og /om/ ──────────────
function filerUnder(sti) {
  if (!existsSync(sti)) return [];
  if (statSync(sti).isFile()) return [sti];
  return readdirSync(sti).flatMap((f) => filerUnder(join(sti, f)));
}
export function kontrollerSitefiler(regler) {
  const ud = [];
  for (const fil of regler.sitefiler.flatMap(filerUnder).filter((f) => /\.(md|html|toml|ya?ml|json)$/.test(f))) {
    const t = readFileSync(fil, 'utf8');
    for (const r of regler.titler.forbudte)
      for (const f of fund(t, r.moenster)) ud.push({ fil, ...f, grund: r.grund });
  }
  return ud;
}

// ── Gaten ────────────────────────────────────────────────────────────────
function koer() {
  const regler = laesRegler();
  const priser = kendtePriser(regler.pris.priskilde);
  const filer = existsSync(LAASE) ? readdirSync(LAASE).filter((f) => f.endsWith('.json')).sort() : [];
  const elementer = filer.map((f) => ({ fil: join(LAASE, f), e: JSON.parse(readFileSync(join(LAASE, f), 'utf8')) }));
  const koe = existsSync(KOE) ? JSON.parse(readFileSync(KOE, 'utf8')) : [];
  // Elementer, der allerede staar i registret, var i gang foer kontrollen blev indfoert.
  const kendte = new Set((existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : []).map((r) => `${r.element}/${r.kanal}`));
  let stop = 0, advarsler = 0;
  const FAIL = (m) => { console.log(`  FAIL     ${m}`); stop++; };
  const REVIEW = (m) => { console.log(`  REVIEW   ${m}`); stop++; };
  const ADV = (m) => { console.log(`  ADVARSEL ${m}`); advarsler++; };
  const OK = (m) => console.log(`  OK       ${m}`);

  console.log(`Indholdskontrol, regelsaet ${regler.version}. Indfoert ${regler.indfoert}.`);

  // 1. Sitefiler
  console.log('\n── sitefiler (titler og kompetencer) ──');
  const site = kontrollerSitefiler(regler);
  site.length ? site.forEach((f) => FAIL(`${f.fil}: "${f.match}" — ${f.grund}\n             ${f.uddrag}`))
              : OK('ingen forbudte titler eller betegnelser i sitefilerne');

  // 2. Koeen: laas, dato, pakke
  console.log('\n── koeen ──');
  for (const k of koe) {
    const lf = elementer.find((x) => x.e.element === k.element && x.e.kanal === k.kanal);
    const ny = !kendte.has(`${k.element}/${k.kanal}`);
    if (!k.laasefil) {
      (ny ? FAIL : ADV)(`element ${k.element} (${k.kanal}) har ingen laasefil. Manuelle kanaler skal ogsaa laases`);
      continue;
    }
    if (!lf) { FAIL(`element ${k.element}: koeen peger paa ${k.laasefil}, som ikke findes`); continue; }
    if (new Date(k.tidspunkt).getTime() !== new Date(lf.e.dato).getTime())
      FAIL(`element ${k.element}: koeens tidspunkt ${k.tidspunkt} afviger fra den godkendte dato ${lf.e.dato}. En flytning kraever ny godkendelse`);
  }
  OK(`${koe.length} poster gennemgaaet`);

  // 3. Hvert element
  for (const { fil, e } of elementer) {
    const ny = erNy(e, regler);
    console.log(`\n── element ${e.element} (${e.kanal})${ny ? '' : '  [godkendt foer indfoerelsen]'} ──`);
    // Manuelle og sociale kanaler: teksten, der kopieres ud, skal vaere den laaste
    if (e.kanal !== 'website') {
      if (typeof e.tekst !== 'string') FAIL('laasefilen har ingen "tekst" — der er intet at kopiere eller publicere');
      else if (sha256(e.tekst) !== e.brodtekst_sha256) FAIL('"tekst" svarer ikke til brodtekst_sha256. Teksten er aendret efter laasningen');
    }
    const andre = elementer.map((x) => x.e).filter((a) => a.godkendelsespakke && a.godkendelsespakke === e.godkendelsespakke);
    const fundne = kontrollerElement(e, regler, { priser, andre });

    for (const f of fundne) {
      const linje = `[${f.type}] ${f.omraade}: "${f.match}" — ${f.grund}\n             ${f.uddrag}`;
      if (f.niveau === 'FAIL') (ny || ['titler', 'moms', 'pris'].includes(f.omraade) ? FAIL : ADV)(linje);
      else if (afklaret(f, e)) OK(`afklaret af ${e.kontrol_stillingtagen.find((s) => s.match?.toLowerCase() === f.match.toLowerCase()).af}: ${f.omraade} "${f.match}"`);
      else (ny ? REVIEW : ADV)(linje);
    }
    if (!fundne.length) OK('ingen fund');

    if (ny) {
      // Sporbarhed: pakken skal ligge i repoet og naevne laasen
      const p = e.godkendelsespakke ? join(PAKKER, e.godkendelsespakke) : null;
      if (!p || !existsSync(p)) FAIL(`godkendelsespakke "${e.godkendelsespakke}" findes ikke i ${PAKKER}/`);
      else if (!readFileSync(p, 'utf8').includes(e.versionslaas)) FAIL(`godkendelsespakken naevner ikke versionslaasen ${e.versionslaas}`);
      else OK(`sporbar til ${p}`);

      // Stemplet
      const s = stempel(e, regler, { priser, andre });
      if (!e.kontrol) FAIL('laasefilen mangler "kontrol"-stemplet. Koer --stempel foer godkendelse');
      else if (e.kontrol.resultat_sha256 !== s.resultat_sha256 || e.kontrol.version !== s.version)
        FAIL(`kontrolstemplet afviger (godkendt ${e.kontrol.resultat_sha256}, nu ${s.resultat_sha256}). Tekst, regler eller stillingtagen er aendret efter godkendelsen`);
      else OK(`kontrolstempel ${s.resultat_sha256}`);
    }
  }

  console.log(stop === 0
    ? `\nINDHOLDSKONTROL: BESTAAET${advarsler ? ` (${advarsler} advarsler paa aeldre elementer)` : ''}`
    : `\nINDHOLDSKONTROL: ${stop} STOP — ingen merge, ingen publicering`);
  process.exit(stop === 0 ? 0 : 1);
}

function koerStempel(sti) {
  const regler = laesRegler();
  const e = JSON.parse(readFileSync(sti, 'utf8'));
  const andre = readdirSync(LAASE).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(LAASE, f), 'utf8')))
    .filter((a) => a.godkendelsespakke && a.godkendelsespakke === e.godkendelsespakke);
  const ctx = { priser: kendtePriser(regler.pris.priskilde), andre };
  const fundne = kontrollerElement(e, regler, ctx);
  for (const f of fundne) console.log(`${f.niveau.padEnd(6)} [${f.type}] ${f.omraade}: "${f.match}" — ${f.grund}\n       ${f.uddrag}`);
  const aabne = fundne.filter((f) => f.niveau === 'FAIL' || !afklaret(f, e));
  console.log(aabne.length ? `\n${aabne.length} aabne fund. Elementet kan ikke godkendes endnu.` : '\nIngen aabne fund.');
  console.log(JSON.stringify({ kontrol: stempel(e, regler, ctx) }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--stempel');
  i > -1 ? koerStempel(process.argv[i + 1]) : koer();
}

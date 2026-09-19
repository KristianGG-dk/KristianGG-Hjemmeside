// Kontrollerer koblingen mellem et FAQ-svar og det blogindlaeg, det henviser
// til. Koeres foer godkendelse, sammen med de oevrige redaktionelle
// kontroller.
//
// Strukturen, Kristian fastlagde 19-09-2026:
//
//   spoergsmaal -> kort, brugbart FAQ-svar -> frivillig uddybning i bloggen
//   -> bloggen danner grundlag for flere forskellige SoMe-vinkler
//
// To ting kan gaa galt, og de trakker hver sin vej:
//
//   TILBAGEHOLDT   Svaret er for tyndt til at staa selv, saa den besoegende
//                  er tvunget til at klikke for at faa sit svar. Det maa
//                  aldrig ske. En FAQ er ikke en teaser.
//
//   GENTAGET       Svaret er saa fyldestgoerende, at blogindlaegget siger det
//                  samme igen. Saa konkurrerer de to om samme soegning, og
//                  laeseren faar intet nyt ved at klikke.
//
// Bloggen skal gaa videre: nuancer, eksempler, faglig forstaaelse, hvordan
// Kristian arbejder med det, relevante forskelle og sammenhaenge.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ord, ngram, N } from './tekstgentagelse.mjs';

const INDHOLD = 'content';
const KORT = 120;      // under dette staar svaret sjaeldent selv
const LANGT = 700;     // over dette begynder bloggen at gentage
const OVERLAP = 6;     // faelles ordsekvenser mellem svar og indlaeg

/** Alle markdownfiler under content/, rekursivt. */
function* filer(mappe) {
  for (const n of readdirSync(mappe, { withFileTypes: true })) {
    const sti = join(mappe, n.name);
    if (n.isDirectory()) yield* filer(sti);
    else if (n.name.endsWith('.md')) yield sti;
  }
}

/** Front matter laeses med en enkel linjeparser: kun q, a og laes_mere. */
function faqPoster(md) {
  const fm = md.split('---\n')[1] ?? '';
  const linjer = fm.split('\n');
  const start = linjer.findIndex((l) => l === 'faq:');
  if (start < 0) return [];
  const ud = [];
  let post = null;
  for (const l of linjer.slice(start + 1)) {
    if (l && !/^\s/.test(l)) break;                       // ny nøgle i roden
    const q = l.match(/^\s*-\s*q:\s*"(.*)"\s*$/);
    if (q) { post = { q: q[1] }; ud.push(post); continue; }
    if (!post) continue;
    const a = l.match(/^\s*a:\s*"(.*)"\s*$/);
    if (a) { post.a = a[1]; continue; }
    const m = l.match(/^\s*laes_mere:\s*"(.*)"\s*$/);
    if (m) post.laes_mere = m[1];
  }
  return ud.filter((p) => p.a);
}

/** Blogindlaeggets broedtekst, slaaet op paa slut-URL. */
function indlaeg(sti) {
  const slug = sti.replace(/^\/blog\/|\/$/g, '');
  for (const f of readdirSync(join(INDHOLD, 'blog'))) {
    if (!f.endsWith('.md')) continue;
    const md = readFileSync(join(INDHOLD, 'blog', f), 'utf8');
    const fm = md.split('---\n')[1] ?? '';
    const egen = fm.match(/^slug:\s*(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
    if ((egen || f.replace(/\.md$/, '')) === slug) {
      return md.split('---\n').slice(2).join('---\n');
    }
  }
  return null;
}

let fejl = 0, koblinger = 0;
console.log('FAQ-kobling — svaret skal staa selv, bloggen skal gaa videre\n');

for (const f of [...filer(INDHOLD)].sort()) {
  const md = readFileSync(f, 'utf8');
  const poster = faqPoster(md).filter((p) => p.laes_mere);
  if (!poster.length) continue;
  console.log(`── ${f.replace(INDHOLD + '/', '')}`);
  for (const p of poster) {
    koblinger++;
    const grunde = [];
    if (p.a.length < KORT) grunde.push(`svaret er ${p.a.length} tegn — for tyndt til at staa selv`);
    if (p.a.length > LANGT) grunde.push(`svaret er ${p.a.length} tegn — bloggen har intet tilbage at sige`);
    const krop = indlaeg(p.laes_mere);
    if (krop === null) {
      grunde.push(`indlaegget findes ikke: ${p.laes_mere}`);
    } else {
      const faelles = [...ngram(ord(p.a), N)].filter((g) => ngram(ord(krop), N).has(g));
      if (faelles.length > OVERLAP) {
        grunde.push(`${faelles.length} faelles ordsekvenser med indlaegget — det gentager svaret`);
      }
    }
    if (grunde.length) fejl++;
    console.log(`  ${grunde.length ? 'SE PAA' : '  ok  '}  ${String(p.a.length).padStart(3)} tegn  ${p.q}`);
    for (const g of grunde) console.log(`          ← ${g}`);
  }
}

console.log(`\n  ${koblinger} kobling(er), ${fejl} at se paa.`);
process.exit(fejl ? 1 : 0);

// Viser hvilke kanaler en godkendelsespakke daekker, og hvor materialet er ens.
//
// Formaalet er, at du kan se paa én skaerm hvad du godkender til hvad. Er
// teksten identisk paa tvaers af kanaler, skal den ikke godkendes to gange.
// Afviger en kanalversion, skal forskellen vaere synlig - ikke begravet i to
// filer, der ligner hinanden.
//
// Den laeser kun. Den aendrer intet og publicerer intet.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas } from './laas.mjs';

const LAASE = 'publicering/laase';

const laase = readdirSync(LAASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ fil: f, ...JSON.parse(readFileSync(join(LAASE, f), 'utf8')) }));

// Grupper paa godkendelsespakken. Uden pakke staar elementet for sig selv.
const pakker = new Map();
for (const l of laase) {
  const n = l.godkendelsespakke ?? '(ingen godkendelsespakke)';
  if (!pakker.has(n)) pakker.set(n, []);
  pakker.get(n).push(l);
}

let fejl = 0;

for (const [navn, elementer] of pakker) {
  console.log(`\n══ ${navn} ══`);
  console.log(`   ${elementer.length} kanalversion(er)\n`);

  // Materialets identitet afgoeres af teksthashen, ikke af oejemaal.
  const efterHash = new Map();
  for (const e of elementer) {
    const h = e.tekst_sha256 ?? e.brodtekst_sha256 ?? '(ingen hash)';
    if (!efterHash.has(h)) efterHash.set(h, []);
    efterHash.get(h).push(e);
  }

  for (const e of elementer) {
    let laasOk = '?';
    try { laasOk = beregnLaas(e).laas === e.versionslaas ? 'ok' : 'AFVIGER'; }
    catch { laasOk = 'KAN IKKE BEREGNES'; }
    if (laasOk !== 'ok') fejl++;
    const h = (e.tekst_sha256 ?? e.brodtekst_sha256 ?? '').slice(0, 12);
    console.log(`   element ${String(e.element).padStart(2)}  ${String(e.kanal).padEnd(9)} ` +
                `${String(e.dato ?? '').slice(0, 16).padEnd(17)} laas ${laasOk.padEnd(4)} tekst ${h}`);
    console.log(`              «${e.titel}»`);
  }

  console.log('');
  for (const [h, gruppe] of efterHash) {
    if (gruppe.length > 1) {
      const kanaler = gruppe.map((g) => `${g.kanal} (element ${g.element})`).join(', ');
      console.log(`   IDENTISK materiale paa ${gruppe.length} kanaler: ${kanaler}`);
      console.log(`              hash ${h.slice(0, 16)} — godkendes én gang`);
    }
  }
  const afvigende = [...efterHash.values()].filter((g) => g.length === 1);
  if (afvigende.length > 1) {
    console.log(`   ${afvigende.length} kanalversioner har HVER SIN tekst — hver skal godkendes for sig:`);
    for (const [e] of afvigende.map((g) => g)) {
      console.log(`              element ${e.element} (${e.kanal})`);
    }
  }
}

console.log(fejl
  ? `\n${fejl} laas stemmer ikke. Se efter foer godkendelse.`
  : '\nAlle laase stemmer.');
process.exit(fejl ? 1 : 0);

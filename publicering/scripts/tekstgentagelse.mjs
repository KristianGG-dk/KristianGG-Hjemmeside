// Maaler tekstligt overlap mellem tekster som faelles ordsekvenser.
//
// Hoerer sammen med det redaktionelle princip: elementer om samme emne skal
// bygge paa den samme faglige position, men have hver sin FUNKTION.
//
//   SoMe          skaber interesse
//   blog          folder emnet ud
//   landingsside  forklarer arbejdet og giver en vej til kontakt
//
// Enkelte faelles fagudtryk og adresselinjer er i orden. Hele saetninger, der
// gaar igen, er ikke: saa er tre tekster blevet den samme tekst tre steder,
// og Google ser tre sider, der konkurrerer om det samme.
//
// Koeres FOER godkendelse, paa de elementer der daekker samme emne:
//   node publicering/scripts/tekstgentagelse.mjs <fil> <fil> [<fil> ...]
//
// Tommelfingerregel: over ~20 faelles 6-ordssekvenser mellem to tekster er
// der noget at se paa. Maalingen doemmer ikke — den viser passagerne, saa man
// kan afgoere, om gentagelsen baerer noget.
import { readFileSync } from 'node:fs';

const ord = (t) => t
  .replace(/^---[\s\S]*?^---$/m, '')          // front matter
  .replace(/\{\{<[^>]*>\}\}/g, '')            // shortcodes
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // links
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/[#*_>|]/g, ' ')
  .toLowerCase().normalize('NFC')
  .split(/[^\wæøåÆØÅ-]+/).filter(Boolean);

const ngram = (a, n) => {
  const s = new Set();
  for (let i = 0; i + n <= a.length; i++) s.add(a.slice(i, i + n).join(' '));
  return s;
};

const N = 6;   // seks ord i traek = et saetningsled, ikke et fagudtryk
const filer = process.argv.slice(2);
const tekster = filer.map((f) => ({ navn: f.split('/').pop(), ord: ord(readFileSync(f, 'utf8')) }));

for (let i = 0; i < tekster.length; i++) {
  for (let j = i + 1; j < tekster.length; j++) {
    const a = ngram(tekster[i].ord, N), b = ngram(tekster[j].ord, N);
    const faelles = [...a].filter((g) => b.has(g));
    // Slaa overlappende fund sammen til laengste sammenhaengende passager.
    const passager = [];
    for (const g of faelles) {
      const sidste = passager[passager.length - 1];
      const gOrd = g.split(' ');
      if (sidste && sidste.endsWith(gOrd.slice(0, N - 1).join(' '))) {
        passager[passager.length - 1] = sidste + ' ' + gOrd[N - 1];
      } else passager.push(g);
    }
    console.log(`\n── ${tekster[i].navn}  ×  ${tekster[j].navn}`);
    console.log(`   ${faelles.length} faelles ${N}-ordssekvenser`);
    for (const p of passager.filter((p) => p.split(' ').length >= N)) {
      console.log(`   • "${p}"`);
    }
    if (!passager.length) console.log('   ingen');
  }
}

// CI-gate. Kører på hver PR. Skriver intet — dømmer kun.
// Exit 0 = grønt. Exit 1 = stop, ingen merge, ingen publicering.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, brodtekstHash, PAAKRAEVEDE_FELTER } from './laas.mjs';

const LAASE = 'publicering/laase';
const BYG = 'public';
let fejl = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };

function verificerElement(sti) {
  const e = JSON.parse(readFileSync(sti, 'utf8'));
  console.log(`\n── element ${e.element} (${e.kanal}) ──`);

  // 1. Alle obligatoriske felter til stede
  const mangler = PAAKRAEVEDE_FELTER.filter((f) => e[f] == null);
  mangler.length ? nej(`obligatoriske felter mangler: ${mangler.join(', ')}`)
                 : ok('alle obligatoriske felter til stede');

  // 2. Godkendelsen findes
  (e.godkendt_af && e.godkendt_dato) ? ok(`godkendt af ${e.godkendt_af} ${e.godkendt_dato}`)
                                     : nej('ingen godkendelse i låsefilen');

  // 3. Låsen stemmer med felterne
  try {
    const { laas } = beregnLaas(e);
    laas === e.versionslaas ? ok(`versionslås ${laas}`)
      : nej(`versionslås afviger — filen siger ${e.versionslaas}, felterne giver ${laas}`);
  } catch (err) { nej(err.message); }

  // 4. Brødteksten er den godkendte
  if (e.kanal === 'website') {
    if (!existsSync(e.kildefil)) return nej(`kildefil mangler: ${e.kildefil}`);
    const md = readFileSync(e.kildefil, 'utf8');
    const h = brodtekstHash(md);
    h === e.brodtekst_sha256 ? ok('brødtekst uændret siden godkendelsen')
      : nej(`brødtekst ÆNDRET — låst ${e.brodtekst_sha256.slice(0,16)}…, fundet ${h.slice(0,16)}…`);

    // 5. Front matter matcher de låste felter
    const fm = md.split('---\n')[1] ?? '';
    const felt = (k) => (fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '');
    felt('title') === e.titel ? ok('titel som låst') : nej(`titel afviger: "${felt('title')}"`);
    felt('description') === e.meta_description ? ok('meta description som låst') : nej('meta description afviger');
    felt('slug') === e.slug ? ok('slug som låst') : nej(`slug afviger: "${felt('slug')}"`);

    // 6. Byggeoutput på den godkendte URL
    const side = join(BYG, e.slut_url, 'index.html');
    if (!existsSync(side)) return nej(`siden findes ikke på den godkendte URL: ${e.slut_url}`);
    ok(`siden bygget på ${e.slut_url}`);
    const html = readFileSync(side, 'utf8');

    /index,\s*follow/.test(html) ? ok('meta robots index, follow') : nej('meta robots ikke index, follow');
    html.includes(`https://kristiangg.dk${e.slut_url}`) ? ok('canonical korrekt') : nej('canonical mangler eller forkert');
    html.includes(e.alt_tekst) ? ok('alt-tekst som låst') : nej('alt-tekst mangler eller afviger');
    html.includes(e.billede) ? ok(`billede ${e.billede} til stede`) : nej(`billede ${e.billede} mangler`);

    const artikel = html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? '';
    for (const l of e.links) {
      artikel.includes(l) ? ok(`link ${l}`) : nej(`låst link mangler: ${l}`);
    }
    // ingen uventede eksterne links
    const fundne = [...artikel.matchAll(/href=["']?(https?:\/\/[^"'\s>]+)/g)].map((m) => m[1]);
    const uventede = fundne.filter((l) => !e.links.includes(l));
    uventede.length ? nej(`uventede links i artiklen: ${uventede.join(', ')}`) : ok('ingen uventede links');

    for (const f of ['sitemap.xml', 'blog/index.html', 'blog/index.xml']) {
      const p = join(BYG, f);
      existsSync(p) && readFileSync(p, 'utf8').includes(e.slug) ? ok(`i ${f}`) : nej(`ikke i ${f}`);
    }
  }
}

const filer = readdirSync(LAASE).filter((f) => f.endsWith('.json')).sort();
if (!filer.length) { console.log('Ingen låsefiler — intet at verificere.'); process.exit(0); }
console.log(`Verificerer ${filer.length} element(er) mod deres versionslås.`);
for (const f of filer) verificerElement(join(LAASE, f));

console.log(fejl === 0
  ? '\nGATE: ALLE KONTROLLER BESTÅET'
  : `\nGATE: ${fejl} FEJL — ingen merge, ingen publicering`);
process.exit(fejl === 0 ? 0 : 1);

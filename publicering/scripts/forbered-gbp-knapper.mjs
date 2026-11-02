/* Handlingsknapper paa de tre Google-opslag — forberedt, ikke udfoert.
   ============================================================================

   Hvad knappen ER
   Google Business Profile har ét knapfelt pr. opslag: callToAction med en
   actionType og en url. Knappens TEKST kan ikke saettes — Google skriver selv
   "Laes mere" ved LEARN_MORE. Feltet cta i laasen ("Book en gratis
   telefonsamtale") er altsaa redaktionens formulering i broedteksten, ikke
   knappens etiket.

   Hvorfor de tre opslag ingen knap har i dag
   links er en TOM liste i alle tre laase, og google-business.mjs saetter kun
   callToAction, naar der er praecis ét link. Teknikken virker — der er bare
   ikke peget nogen steder hen.

   Hvorfor det ikke bare rettes
   links er et LAAST felt (laas.mjs, LAASTE_FELTER). Versionslaasen er en ren
   funktion af de godkendte felter og tildeles ikke af motoren. Aendrer man
   links og regner laasen om af sig selv, har man skrevet en godkendelse,
   ingen har givet. Derfor dette script: det goer intet uden baade --skriv og
   --godkendt-af, og det efterlader et spor i en rettelsespakke.

   Brug
     node publicering/scripts/forbered-gbp-knapper.mjs
         viser, hvad der ville ske: destination, ny laas, faerdig Google-krop.

     node publicering/scripts/forbered-gbp-knapper.mjs --skriv \
          --godkendt-af "Kristian G. G. Dansted"
         saetter linkene, regner laasene om og skriver rettelsespakken.

   Kontrollér bagefter:
     node publicering/scripts/verificer.mjs
     node publicering/scripts/kontroller-indhold.mjs                        */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beregnLaas } from './laas.mjs';
import { byggOpslag } from './google-business.mjs';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Destinationerne. Valgt efter hvad opslaget HANDLER om, ikke efter
   bekvemmelighed, saa den besoegende lander paa svaret og ikke paa forsiden.
   Kristian har navngivet dem selv 2. november 2026. */
export const FORSLAG = [
  { element: 53, url: 'https://kristiangg.dk/til-dig/naturterapi/',
    hvorfor: 'opslaget handler om naturterapi aaret rundt' },
  { element: 54, url: 'https://kristiangg.dk/til-dig/psykoterapi/',
    hvorfor: 'opslaget handler om psykoterapi og forsamtalen' },
  { element: 49, url: 'https://kristiangg.dk/kontakt/',
    hvorfor: 'opslaget er en opfordring til at tage kontakt' },
];

const laasesti = (nr) => path.join(ROD, 'publicering', 'laase', `element-${String(nr).padStart(2, '0')}.json`);
const sidesti = (url) => path.join(ROD, 'public', new URL(url).pathname.replace(/^\//, ''), 'index.html');

/** Ren funktion: hvad bliver resultatet af at saette linket? Intet skrives. */
export function beregn(laas, url, { findesSide = () => true } = {}) {
  const fejl = [];
  if (!/^https:\/\/kristiangg\.dk\//.test(url)) fejl.push(`${url} er ikke en https-adresse paa kristiangg.dk`);
  if (!url.endsWith('/')) fejl.push(`${url} mangler afsluttende skraastreg — Netlify ville svare 301, og knappen faar et ekstra hop`);
  if (!findesSide(url)) fejl.push(`${url} findes ikke i bygget — knappen ville pege paa en 404`);
  if (!Array.isArray(laas.links)) fejl.push('laasen har intet links-felt');
  else if (laas.links.length) fejl.push(`element ${laas.element} har allerede et link (${laas.links[0]}) — det roeres ikke`);

  if (fejl.length) return { fejl };

  const ny = { ...laas, links: [url] };
  const { laas: nyLaas } = beregnLaas(ny);
  ny.versionslaas = nyLaas;
  return { fejl: [], foer: laas.versionslaas, efter: nyLaas, element: ny, krop: byggOpslag(ny) };
}

/* ── Kommandolinje ───────────────────────────────────────────────────────── */

const erHoved = import.meta.url === `file://${process.argv[1]}`;
if (erHoved) {
  const arg = process.argv.slice(2);
  const skriv = arg.includes('--skriv');
  const i = arg.indexOf('--godkendt-af');
  const godkender = i !== -1 ? arg[i + 1] : null;

  if (skriv && !godkender) {
    console.error('--skriv kraever --godkendt-af "<navn>". Linket er et laast felt:\n'
      + 'laasen maa ikke regnes om uden en navngiven godkendelse.');
    process.exit(2);
  }

  const findesSide = (url) => fs.existsSync(sidesti(url));
  const harByg = fs.existsSync(path.join(ROD, 'public', 'index.html'));
  if (!harByg) {
    console.log('BEMAERK: public/ findes ikke, saa destinationerne kan ikke slaas op i bygget.');
    console.log('         Byg med «hugo --minify --buildFuture» for den fulde kontrol.\n');
  }

  const resultater = [];
  let fejl = 0;

  for (const f of FORSLAG) {
    const sti = laasesti(f.element);
    if (!fs.existsSync(sti)) { console.error(`x element ${f.element}: ${sti} findes ikke`); fejl++; continue; }
    const laas = JSON.parse(fs.readFileSync(sti, 'utf-8'));
    const r = beregn(laas, f.url, { findesSide: harByg ? findesSide : () => true });

    console.log(`Element ${f.element} — ${laas.titel}`);
    console.log(`  destination : ${f.url}`);
    console.log(`  hvorfor     : ${f.hvorfor}`);
    console.log(`  cta i laasen: «${laas.cta}»`);
    console.log('                (Google skriver selv knappens tekst. Ved LEARN_MORE staar der');
    console.log('                 «Laes mere» — cta-teksten er redaktionens, ikke knappens.)');
    if (r.fejl.length) {
      for (const m of r.fejl) console.log(`  x ${m}`);
      fejl++;
    } else {
      console.log(`  versionslaas: ${r.foer}  →  ${r.efter}`);
      console.log('  knap        :', JSON.stringify(r.krop.callToAction));
      resultater.push({ ...f, sti, laas, ...r });
    }
    console.log();
  }

  if (fejl) { console.log(`${fejl} element(er) kan ikke forberedes. Intet skrevet.`); process.exit(1); }

  if (!skriv) {
    console.log('='.repeat(72));
    console.log('INTET SKREVET. Dette var en visning.');
    console.log('Godkendes destinationerne, saettes de med:');
    console.log('  node publicering/scripts/forbered-gbp-knapper.mjs --skriv \\');
    console.log('       --godkendt-af "Kristian G. G. Dansted"');
    process.exit(0);
  }

  const dato = new Date().toISOString().slice(0, 10);
  for (const r of resultater) {
    fs.writeFileSync(r.sti, JSON.stringify(r.element, null, 2) + '\n');
    console.log(`skrevet: ${path.relative(ROD, r.sti)}`);
  }

  const pakke = path.join(ROD, 'publicering', 'pakker', 'rettelser-gbp-knapper.md');
  const linjer = [
    '# Rettelse: handlingsknap paa de tre Google-opslag',
    '',
    `Godkendt af ${godkender}, ${dato}.`,
    '',
    'Google Business Profile har ét knapfelt pr. opslag. De tre opslag blev',
    'godkendt med en tom links-liste og fik derfor ingen knap. Her saettes',
    'destinationen, og versionslaasen regnes om. Broedtekst, billede, dato og',
    'cta-feltet er uroert — kun links er aendret.',
    '',
    'Knappens tekst kan ikke saettes hos Google. Ved actionType LEARN_MORE',
    'skriver Google selv «Laes mere».',
    '',
    '| Element | Destination | Hvorfor | Laas foer | Laas efter |',
    '| --- | --- | --- | --- | --- |',
    ...resultater.map((r) => `| ${r.element} | \`${r.url}\` | ${r.hvorfor} | \`${r.foer}\` | \`${r.efter}\` |`),
    '',
  ];
  fs.writeFileSync(pakke, linjer.join('\n'));
  console.log(`skrevet: ${path.relative(ROD, pakke)}`);
  console.log('\nKoer nu:\n  node publicering/scripts/verificer.mjs\n  node publicering/scripts/kontroller-indhold.mjs');
}

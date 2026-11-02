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
import { foejTilRegister } from './krav.mjs';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Destinationerne. Valgt efter hvad opslaget HANDLER om, ikke efter
   bekvemmelighed, saa den besoegende lander paa svaret og ikke paa forsiden.
   Kristian har navngivet dem selv 2. november 2026. */
export const FORSLAG = [
  { element: 53, url: 'https://kristiangg.dk/til-dig/naturterapi/',
    hvorfor: 'opslaget handler om naturterapi aaret rundt' },
  { element: 54, url: 'https://kristiangg.dk/til-dig/psykoterapi/',
    hvorfor: 'opslaget handler om psykoterapi og forsamtalen' },
  { element: 49, url: 'https://kristiangg.dk/kurser/skovbad/',
    hvorfor: 'opslaget handler om skovbad for grupper — siden svarer paa, hvad det er' },
];

/** Rettelsespakken. Navnet foelger konventionen fra 2026-rettelser-45-51-52.md. */
export const PAKKE = '2026-rettelser-gbp-knapper.md';

/** Statusser, hvor opslaget endnu IKKE er sendt og derfor maa rettes. */
export const UROERT = ['AFVENTER DATO'];

const laasesti = (nr) => path.join(ROD, 'publicering', 'laase', `element-${String(nr).padStart(2, '0')}.json`);
const sidesti = (url) => path.join(ROD, 'public', new URL(url).pathname.replace(/^\//, ''), 'index.html');

/** Ren funktion: hvad bliver resultatet af at saette linket? Intet skrives. */
export function beregn(laas, url, { findesSide = () => true, pakke = PAKKE, dato = null, register = null } = {}) {
  const fejl = [];

  // Et allerede afsendt opslag maa ALDRIG roeres. Teksten staar hos Google,
  // og en ny laas ville hverken aendre den eller kunne naa den — den ville
  // blot faa registret og laasefilen til at sige noget forskelligt.
  if (register) {
    const mine = register.filter((r) => r.element === laas.element);
    const sidste = mine[mine.length - 1];
    if (sidste && !UROERT.includes(sidste.status)) {
      fejl.push(`element ${laas.element} har status «${sidste.status}» i registret og roeres ikke. `
        + 'Kun opslag, der endnu ikke er sendt, kan faa et link.');
    }
  }
  if (!/^https:\/\/kristiangg\.dk\//.test(url)) fejl.push(`${url} er ikke en https-adresse paa kristiangg.dk`);
  if (!url.endsWith('/')) fejl.push(`${url} mangler afsluttende skraastreg — Netlify ville svare 301, og knappen faar et ekstra hop`);
  if (!findesSide(url)) fejl.push(`${url} findes ikke i bygget — knappen ville pege paa en 404`);
  if (!Array.isArray(laas.links)) fejl.push('laasen har intet links-felt');
  else if (laas.links.length) fejl.push(`element ${laas.element} har allerede et link (${laas.links[0]}) — det roeres ikke`);

  if (fejl.length) return { fejl };

  // KUN links aendres blandt de laaste felter. godkendelsespakke og
  // godkendt_dato er IKKE laaste felter (se LAASTE_FELTER i laas.mjs) og
  // paavirker derfor ikke laasen — de er sporbarheden, ikke indholdet.
  //
  // kontroller-indhold.mjs kraever, at den pakke, elementet peger paa,
  // naevner elementets versionslaas. Peger den fortsat paa den gamle pakke,
  // fejler gaten. Derfor foelger pakkenavnet med her.
  const ny = { ...laas, links: [url], godkendelsespakke: pakke };
  if (dato) ny.godkendt_dato = dato;
  const { laas: nyLaas } = beregnLaas(ny);
  ny.versionslaas = nyLaas;
  // Noeglen hedder nyLaasefil, ikke element: «element» er NUMMERET alle andre
  // steder i motoren, og en laasefil under det navn blev spredt oven i
  // nummeret og endte i registret som «element: {objekt}».
  return { fejl: [], foer: laas.versionslaas, efter: nyLaas, nyLaasefil: ny, krop: byggOpslag(ny) };
}

/**
 * Registerraekkerne for en gennemfoert rettelse. Ren funktion, saa formen kan
 * proeves uden at skrive noget.
 *
 * Status forbliver «AFVENTER DATO», for det er sandt: opslaget er stadig ikke
 * sendt. En ny statusvaerdi ville vagthunden laese som «ukendt status».
 */
export function byggRegisterraekker(resultater, godkender, dato, nu = new Date()) {
  return resultater.map((r) => ({
    element: r.nr,
    kanal: 'gbp',
    versionslaas: r.efter,
    status: 'AFVENTER DATO',
    post_id: null,
    godkendt_tidspunkt: r.laas.dato,
    tidspunkt: nu.toISOString(),
    registreret_af: 'manuel',
    noter: `Handlingsknap tilfoejet. ${godkender} godkendte destinationen ${r.url} den ${dato}. `
      + 'Kun feltet links er aendret; tekst, billede, dato, tidspunkt og cta er uroerte. '
      + `Versionslaas ${r.foer} afloest af ${r.efter}. Pakke: ${PAKKE}.`,
  }));
}

/* ── Kommandolinje ───────────────────────────────────────────────────────── */

const erHoved = import.meta.url === `file://${process.argv[1]}`;
if (erHoved) {
  const arg = process.argv.slice(2);
  const skriv = arg.includes('--skriv');
  const i = arg.indexOf('--godkendt-af');
  const godkender = i !== -1 ? arg[i + 1] : null;
  const dato = new Date().toISOString().slice(0, 10);

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

  const registersti = path.join(ROD, 'publicering', 'register.json');
  const register = JSON.parse(fs.readFileSync(registersti, 'utf-8'));

  const resultater = [];
  let fejl = 0;

  for (const f of FORSLAG) {
    const sti = laasesti(f.element);
    if (!fs.existsSync(sti)) { console.error(`x element ${f.element}: ${sti} findes ikke`); fejl++; continue; }
    const laas = JSON.parse(fs.readFileSync(sti, 'utf-8'));
    const r = beregn(laas, f.url, {
      findesSide: harByg ? findesSide : () => true,
      pakke: PAKKE, dato, register,
    });

    const mine = register.filter((x) => x.element === f.element);
    const status = mine.length ? mine[mine.length - 1].status : '(ingen registerpost)';

    console.log(`Element ${f.element} — ${laas.titel}`);
    console.log(`  destination : ${f.url}`);
    console.log(`  hvorfor     : ${f.hvorfor}`);
    console.log(`  status      : ${status}`);
    console.log(`  tidspunkt   : ${laas.dato}  (uaendret)`);
    console.log(`  cta i laasen: «${laas.cta}»`);
    console.log('                (Google skriver selv knappens tekst. Ved LEARN_MORE staar der');
    console.log('                 «Laes mere» — cta-teksten er redaktionens, ikke knappens.)');
    if (r.fejl.length) {
      for (const m of r.fejl) console.log(`  x ${m}`);
      fejl++;
    } else {
      console.log(`  versionslaas: ${r.foer}  →  ${r.efter}`);
      console.log('  knap        :', JSON.stringify(r.krop.callToAction));
      resultater.push({ ...f, sti, laas, status, ...r, nr: f.element });
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

  /* ── 1. Laasefilerne ─────────────────────────────────────────────────── */
  for (const r of resultater) {
    fs.writeFileSync(r.sti, JSON.stringify(r.nyLaasefil, null, 2) + '\n');
    console.log(`skrevet: ${path.relative(ROD, r.sti)}`);
  }

  /* ── 2. Registret ────────────────────────────────────────────────────── */
  // Append-only. Den nye raekke baerer den NYE versionslaas, saa registret og
  // laasefilen siger det samme, og status er uaendret «AFVENTER DATO» — for
  // det er sandt: opslaget er stadig ikke sendt. En ny statusvaerdi ville
  // vagthunden laese som «ukendt status».
  const raekker = byggRegisterraekker(resultater, godkender, dato);
  foejTilRegister(raekker, registersti);
  console.log(`skrevet: publicering/register.json (+${raekker.length} raekker, append-only)`);

  /* ── 3. Rettelsespakken ──────────────────────────────────────────────── */
  const pakke = path.join(ROD, 'publicering', 'pakker', PAKKE);
  const linjer = [
    '# Rettelse: handlingsknap paa de tre Google-opslag',
    '',
    `Godkendt af ${godkender} **${dato}** i chat, med destinationen angivet`,
    'eksplicit for hvert element.',
    '',
    '| Element | Kanal | Tidspunkt | Destination | Teksthash | Versionslaas |',
    '| --- | --- | --- | --- | --- | --- |',
    ...resultater.map((r) => `| ${r.nr} | gbp | ${r.laas.dato} | \`${r.url}\` | \`${r.laas.brodtekst_sha256.slice(0, 16)}\` | \`${r.efter}\` |`),
    '',
    '## Hvad der er rettet',
    '',
    'Google Business Profile har ét knapfelt pr. opslag: `callToAction` med en',
    '`actionType` og en `url`. De tre opslag blev godkendt med en **tom**',
    '`links`-liste og fik derfor ingen knap. Her saettes destinationen.',
    '',
    '**Kun feltet `links` er aendret.** Broedtekst, titel, billede, alt-tekst,',
    'dato, tidspunkt, kategorier, hashtags og `cta` er ordret de samme som i',
    '`2026-uge-45-47.md`. Godkendelsen af teksterne fra 1. november 2026 staar',
    'ved magt og bortfalder ikke — teksthashene herover er uaendrede og kan',
    'sammenlignes med den oprindelige pakke.',
    '',
    '`godkendelsespakke` i de tre laasefiler peger nu paa denne fil, fordi',
    '`kontroller-indhold.mjs` kraever, at pakken naevner elementets',
    'versionslaas. Den oprindelige pakke naevner de gamle.',
    '',
    '## Knappens tekst',
    '',
    'Den kan ikke saettes. Ved `actionType: LEARN_MORE` skriver Google selv',
    '«Laes mere». Feltet `cta` i laasen er redaktionens formulering i',
    'broedteksten, ikke knappens etiket — de to er forskellige ting.',
    '',
    '## De tidligere versionslaase',
    '',
    '| Element | Foer | Efter |',
    '| --- | --- | --- |',
    ...resultater.map((r) => `| ${r.nr} | \`${r.foer}\` | \`${r.efter}\` |`),
    '',
    'Alle tre stod som `AFVENTER DATO` i registret, da rettelsen blev lavet.',
    'Intet af dem var publiceret, og intet er genpubliceret.',
    '',
  ];
  fs.writeFileSync(pakke, linjer.join('\n'));
  console.log(`skrevet: publicering/pakker/${PAKKE}`);
  console.log('\nKoer nu:\n  node publicering/scripts/verificer.mjs\n  node publicering/scripts/kontroller-indhold.mjs');
}

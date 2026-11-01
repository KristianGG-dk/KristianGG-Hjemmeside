// CI-gate. Kører på hver PR. Skriver intet — dømmer kun.
// Exit 0 = grønt. Exit 1 = stop, ingen merge, ingen publicering.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, brodtekstHash, sha256, PAAKRAEVEDE_FELTER } from './laas.mjs';
import { kontrollerOpslag } from './google-business.mjs';

const LAASE = 'publicering/laase';
const KOE = 'publicering/koe.json';
const BYG = 'public';

const koe = existsSync(KOE) ? JSON.parse(readFileSync(KOE, 'utf8')) : [];

/** Hvilket offset havde Danmark paa netop dette oejeblik? */
function dkOffset(d) {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Copenhagen', timeZoneName: 'longOffset',
  }).format(d);
  return s.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? null;
}
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

  // 2b. Tidspunktet. Motoren publicerer paa laasens "dato", og vagthunden
  // overvaager koeens "tidspunkt". Er de ikke samme oejeblik, overvaages ét
  // tidspunkt og publiceres paa et andet, og ingen af dem fejler.
  //
  // Offsettet kontrolleres mod Danmarks egen tid paa netop den dato. Alle
  // tidspunkter er skrevet i dansk vaegtid — 07:00 betyder syv om morgenen i
  // Odense. Staar der +02:00 paa en novemberdato, gaar opslaget ud en time
  // for tidligt, og intet andet ville fange det.
  {
    const d = new Date(e.dato);
    if (Number.isNaN(d.getTime())) {
      nej(`ulæseligt dato-felt: ${e.dato}`);
    } else {
      const anvendt = String(e.dato).match(/([+-]\d{2}:\d{2})$/)?.[1];
      const rigtigt = dkOffset(d);
      if (!anvendt) {
        nej(`dato mangler tidszone: ${e.dato}. Uden offset læses den som runnerens tid (UTC), ikke dansk tid.`);
      } else if (anvendt !== rigtigt) {
        nej(`dato har offset ${anvendt}, men Danmark havde ${rigtigt} den dag (${e.dato}) — opslaget ville gå ud på et andet klokkeslæt end godkendt`);
      } else {
        ok(`tidspunkt ${e.dato} er dansk tid (${rigtigt})`);
      }

      const iKoe = koe.filter((x) => x.element === e.element);
      if (!iKoe.length) {
        nej(`element ${e.element} står ikke i publicering/koe.json — vagthunden kan ikke se det`);
      } else if (new Date(iKoe[0].tidspunkt).getTime() !== d.getTime()) {
        nej(`køens tidspunkt (${iKoe[0].tidspunkt}) er ikke låsens dato (${e.dato})`);
      } else {
        ok('køens tidspunkt er låsens dato');
      }
    }
  }

  // 3. Låsen stemmer med felterne
  try {
    const { laas } = beregnLaas(e);
    laas === e.versionslaas ? ok(`versionslås ${laas}`)
      : nej(`versionslås afviger — filen siger ${e.versionslaas}, felterne giver ${laas}`);
  } catch (err) { nej(err.message); }

  // 4a. Sociale og manuelle kanaler: teksten, der sendes eller kopieres ud,
  // er den godkendte. tekst er ikke selv et låst felt, men brodtekst_sha256
  // er, og den skal være teksthashen. Så kan teksten ikke ændres efter
  // godkendelsen, uden at gaten ser det.
  if (e.kanal !== 'website') {
    if (typeof e.tekst !== 'string') nej('ingen tekst i låsefilen');
    else if (sha256(e.tekst) !== e.tekst_sha256) nej('tekst ÆNDRET — svarer ikke til tekst_sha256');
    else if (e.brodtekst_sha256 !== e.tekst_sha256) nej('brodtekst_sha256 er ikke teksthashen — teksten er ikke låst');
    else ok('tekst uændret siden godkendelsen');
  }

  // 4aa. Billedet skal findes paa den adresse, opslaget henviser til.
  //
  // Meta, Google og LinkedIn HENTER billedet fra kristiangg.dk. Peger
  // adressen paa en fil, der ikke udgives, svarer den 404, og opslaget
  // fejler hos platformen — ikke her, men paa publiceringsdagen.
  //
  // Alle tretten sociale laase for uge 45-47 pegede paa <motiv>-1350.jpg.
  // Ingen af motiverne findes i 1350 px; den stoerste jpg er 640 px. Gaten
  // kontrollerede, AT der stod en billedadresse, men aldrig at den foerte
  // nogen steder. Instagram 42 den 5. november ville have fejlet, og
  // Facebook-planlaegningen af 43, 48 og 52 ved hver sjette times koersel.
  //
  // Kontrollen sker mod byggeoutputtet, for det er det, Netlify udgiver.
  // Er der ikke bygget (lokal koersel), kontrolleres static/ i stedet, og
  // det siges ligeud.
  if (e.kanal !== 'website' && e.billede_url) {
    const rel = String(e.billede_url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '');
    const bygget = existsSync(BYG);
    const sti = bygget ? join(BYG, rel) : join('static', rel);
    if (existsSync(sti)) {
      ok(`billedet findes: ${rel}${bygget ? '' : ' (kontrolleret i static/, der er ikke bygget)'}`);
    } else {
      nej(`billedet findes IKKE: ${e.billede_url} → ${sti}. Platformen henter adressen selv og får 404, så opslaget fejler på publiceringsdagen.`);
    }
  }

  // 4b. Google Business Profile: platformens krav. Et opslag, der ikke kan
  // sendes ordret, skal stoppes her og ikke først på publiceringsdagen.
  if (e.kanal === 'gbp') {
    try { kontrollerOpslag(e); ok('opfylder Googles krav til et opslag'); }
    catch (err) { nej(`Google-krav: ${err.message}`); }
  }

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

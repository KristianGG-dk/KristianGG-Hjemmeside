// Publicerer godkendte Google Business Profile-elementer, naar deres
// tidspunkt er naaet.
//
// HVORFOR MOTOREN SELV VAAGNER
// Business Profile API'et kan ikke modtage et opslag med et fremtidigt
// udgivelsestidspunkt. Som ved Instagram er det derfor motoren, der vaagner
// paa tidspunktet og publicerer med det samme.
//
// HVAD DER SKAL HOLDE, FOER NOGET SENDES
//   1. Laasefilen er kanal gbp, og laas, teksthash og godkendelse holder
//   2. Koeen har elementet som gbp med metode "motor" og PRAECIS denne
//      laasefil, og koeens tidspunkt er laasens dato. Et element, der staar
//      som manuelt i koeen, roeres ikke - heller ikke hvis der findes en laas
//   3. Opslaget overholder platformens graenser (google-business.mjs)
//   4. Tidspunktet er naaet, men hoejst et doegn passeret. Et opslag, der
//      skulle have vaeret ude for laenge siden, kan vaere forkert nu; det
//      kraever et menneske, ikke en sen automatik
//   5. Destinationen er fastlaast, og Google bekraefter, at tokenet kan se
//      netop den lokation under netop den konto
// Fejler 1-4, springes elementet over med begrundelse. Fejler 5, sendes
// intet som helst, og koerslen fejler.
//
// GODKENDELSEN ER ABSOLUT
// Teksten sendes ordret. Intet omskrives, intet billede vaelges om, intet
// link tilfoejes. Holder noget ikke, publiceres der ikke.
//
// VED FEJL STOPPER DEN
// Ingen automatiske gentagne forsoeg. Et fejlet element springes over ved
// naeste koersel og kraever menneskelig stillingtagen. Ved uvist udfald
// (netvaerksbrud eller 5xx efter afsendelse) staar det i registret, at der
// skal ses efter paa profilen, FOER der proeves igen.
//
// Toerloeb er standard. Der sendes kun med --publicer.
//
//   GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN
//   GBP_TILLADT_LOKATION, GBP_LOKATION
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beregnLaas, sha256 } from './laas.mjs';
import {
  pruvDestination, hentAdgang, bevisLokation, byggOpslag, sendOpslag,
  DestinationAfvist, AdgangAfvist, skrub, maskId,
} from './google-business.mjs';

const LAASE = 'publicering/laase';
const KOE = 'publicering/koe.json';
const REGISTER = 'publicering/register.json';
export const RESULTAT = 'resultat-google.json';

/** Et forfaldent opslag publiceres kun automatisk inden for dette vindue. */
export const MAKS_FORSINKELSE_S = 24 * 60 * 60;

/** Statusser der betyder "roer ikke elementet igen". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT'];

const laesJson = (sti, standard) => (existsSync(sti) ? JSON.parse(readFileSync(sti, 'utf8')) : standard);
const tid = (sek) => new Date(sek * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/**
 * Samler de forfaldne elementer og forklarer hvert fravalg. Rent: laeser
 * kun det, den faar, saa den kan proeves uden filer.
 */
export function udvaelg({ laase, koe, register, nu }) {
  const valgt = [], sprunget = [];
  for (const { sti, e } of laase) {
    const nr = e.element;
    if (e.kanal !== 'gbp') continue;

    const post = [...register].reverse().find((x) => x.element === nr && AFSENDT.includes(x.status));
    if (post) { sprunget.push([nr, `staar som ${post.status} i registret`]); continue; }
    const sidste = [...register].reverse().find((x) => x.element === nr);
    if (sidste && ['PUBLICERING FEJLET', 'PLANLAEGNING FEJLET'].includes(sidste.status)) {
      sprunget.push([nr, 'seneste forsoeg fejlede — kraever menneskelig stillingtagen foer nyt forsoeg']);
      continue;
    }

    const k = koe.filter((x) => x.element === nr && x.kanal === 'gbp');
    if (k.length !== 1) { sprunget.push([nr, `AFVIST: ${k.length} gbp-poster i koeen, ventede én`]); continue; }
    if (k[0].metode !== 'motor') { sprunget.push([nr, `koeen siger metode "${k[0].metode}" — motoren roerer det ikke`]); continue; }
    if (k[0].laasefil !== sti) { sprunget.push([nr, `AFVIST: koeen peger paa ${k[0].laasefil}, ikke ${sti}`]); continue; }

    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst ?? '') !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (e.brodtekst_sha256 !== e.tekst_sha256) throw new Error('brodtekst_sha256 er ikke teksthashen');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
      byggOpslag(e);
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    const naar = Math.floor(new Date(e.dato).getTime() / 1000);
    const koeNaar = Math.floor(new Date(k[0].tidspunkt).getTime() / 1000);
    if (Number.isNaN(naar)) { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }
    if (naar !== koeNaar) { sprunget.push([nr, `AFVIST: koeens tidspunkt (${k[0].tidspunkt}) er ikke den godkendte dato (${e.dato})`]); continue; }
    if (naar > nu) { sprunget.push([nr, `forfalder foerst ${tid(naar)}`]); continue; }
    if (nu - naar > MAKS_FORSINKELSE_S) {
      sprunget.push([nr, `forfaldt ${tid(naar)} — over et doegn siden. Publiceres ikke automatisk; kraever menneskelig stillingtagen`]);
      continue;
    }
    valgt.push({ e, naar });
  }
  return { valgt, sprunget };
}

/** Laeser laasefilerne fra repoet. */
function laesLaase() {
  return readdirSync(LAASE).filter((x) => x.endsWith('.json')).sort()
    .map((f) => ({ sti: `${LAASE}/${f}`, e: JSON.parse(readFileSync(join(LAASE, f), 'utf8')) }));
}

async function publicerEt(token, dest, e, hent) {
  const post = {
    element: e.element, kanal: 'gbp', versionslaas: e.versionslaas,
    status: 'PUBLICERING FEJLET', post_id: null, tidspunkt: new Date().toISOString(),
  };
  try {
    const ud = await sendOpslag(token, dest, byggOpslag(e), hent);
    post.status = 'PUBLICERET';
    post.post_id = ud.name.split('/').pop();
    if (ud.state) post.google_state = ud.state;
    if (ud.searchUrl) post.url = ud.searchUrl;
    console.log(`  OK    element ${e.element} publiceret (${ud.state ?? 'ukendt state'})`);
  } catch (err) {
    post.fejl = skrub(err.message).slice(0, 500);
    if (err.uvist) {
      post.noter = 'Udfaldet er uvist. Se efter paa Business Profile FOER et nyt forsoeg — ellers risikeres to opslag.';
    }
    console.log(`  FEJL  element ${e.element}: ${post.fejl}`);
  }
  return post;
}

export async function koer({ toerloeb = true, env = process.env, hent = fetch, nu = Math.floor(Date.now() / 1000), data } = {}) {
  const kilde = data ?? { laase: laesLaase(), koe: laesJson(KOE, []), register: laesJson(REGISTER, []) };
  const { valgt, sprunget } = udvaelg({ ...kilde, nu });

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive publiceret.\n'
    : 'PUBLICERER paa Google Business Profile. Kun godkendt materiale, ordret som laast.\n');

  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  if (!valgt.length) { console.log('Intet forfaldent at publicere.'); return []; }

  console.log('── forfaldne ──');
  for (const { e, naar } of valgt) console.log(`  element ${String(e.element).padStart(2)}  forfaldt ${tid(naar)}  «${e.titel}»`);
  console.log('');

  // Destinationen og adgangen afgoeres FOER noget sendes, ogsaa i toerloeb,
  // naar adgangen findes - saa proeven er en rigtig proeve.
  const harAdgang = Boolean((env.GBP_REFRESH_TOKEN ?? '').trim());
  let dest = null, token = null;
  if (!toerloeb || harAdgang) {
    dest = pruvDestination(env);
    token = await hentAdgang(env, hent);
    const info = await bevisLokation(token, dest, hent);
    console.log(`Destination bekraeftet af Google: ${maskId(dest.navn)} «${info.titel ?? 'uden titel'}»\n`);
  }

  if (toerloeb) {
    return valgt.map(({ e, naar }) => {
      console.log(`── element ${e.element} → {lokation}/localPosts ──`);
      console.log(JSON.stringify(byggOpslag(e), null, 2));
      return { element: e.element, versionslaas: e.versionslaas, toerloeb: true, forfaldt: naar };
    });
  }

  const resultater = [];
  for (const { e } of valgt) resultater.push(await publicerEt(token, dest, e, hent));
  return resultater;
}

/** Foejer resultaterne til registret. Separat trin, saa publicering kan koere uden skriveadgang. */
export function skrivRegister(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil — publiceringen naaede aldrig at svare.'); return 1; }
  const ægte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  if (!ægte.length) { console.log('Toerloeb eller intet forfaldent — intet registreres.'); return 0; }
  const reg = laesJson(REGISTER, []);
  reg.push(...ægte);
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2) + '\n');
  const ok = ægte.filter((r) => r.status === 'PUBLICERET').length;
  console.log(`${ægte.length} post(er) skrevet i registret — ${ok} publiceret, ${ægte.length - ok} fejlet.`);
  return 0;
}

/** Doemmer uden at skrive. Koeres EFTER registret er committet. */
export function statusKun(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil.'); return 1; }
  const ægte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  const fejlede = ægte.filter((r) => r.status !== 'PUBLICERET');
  for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''} ${r.noter ?? ''}`);
  if (!fejlede.length) console.log(ægte.length ? `Alle ${ægte.length} element(er) publiceret.` : 'Intet at doemme.');
  return fejlede.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--skriv-register') process.exit(skrivRegister(args[1]));
  else if (args[0] === '--status-kun') process.exit(statusKun(args[1]) > 0 ? 1 : 0);
  else {
    koer({ toerloeb: !args.includes('--publicer') })
      .then((r) => {
        writeFileSync(RESULTAT, JSON.stringify(r, null, 2) + '\n');
        const fejlede = r.filter((x) => x.status === 'PUBLICERING FEJLET').length;
        console.log(fejlede ? `\n${fejlede} element(er) fejlede.` : '\nFaerdig.');
        process.exit(fejlede > 0 ? 1 : 0);
      })
      .catch((err) => {
        // Destination eller adgang: intet er sendt. Ingen resultatfil, saa
        // registret ikke faar en post, og elementet ikke spaerres - men jobbet
        // fejler, GitHub sender mail, og vagthunden melder det forfaldne.
        const art = err instanceof DestinationAfvist ? 'DESTINATION' : err instanceof AdgangAfvist ? 'ADGANG' : 'FEJL';
        console.error(`${art}: ${skrub(err.message)}\nIntet er sendt til Google.`);
        process.exit(1);
      });
  }
}

// Lukker forældede, aldrig publicerede opslag.
//
// HVORFOR
// Et opslag, hvis tidspunkt er passeret med mere end publiceringsvinduet, og
// som aldrig blev sendt, bliver aldrig sendt. Indtil nu blev det ved at ligge
// i koeen og give vagthunden noget at melde to gange om dagen i ugevis.
// Element 33 og 34 gjorde det i sytten dage.
//
// En alarm, man har læst femogtredive gange og ikke kan gøre noget ved, er
// ikke en alarm laengere. Den gør, at man holder op med at læse dem — og så
// forsvinder den rigtige alarm i mængden.
//
// Derfor lukkes de: der skrives en «OPGIVET»-raekke i registret med
// begrundelsen, og registerSpaerre() roerer dem aldrig igen.
//
// HISTORIKKEN BEVARES
// Registret er en append-only haendelseslog. Intet slettes, ingen
// publiceringsbeviser roeres, og koeposten bliver staaende. Man kan bagefter
// se baade hvad der var planlagt, hvad der skete, og hvorfor det blev
// opgivet.
//
// HVAD DER ALDRIG LUKKES AUTOMATISK
//
//   PUBLICERET, PLANLAGT, PLANLAGT MANUELT
//     Opslaget ER afsendt. At skrive OPGIVET ville vaere en usandhed.
//
//   PUBLICERING IGANG, PUBLICERING FEJLET, PLANLAEGNING FEJLET
//     Udfaldet er UVIST. Opslaget kan vaere gaaet ud. Det kraever et
//     menneske paa platformen, og et maskinelt «opgivet» ville skjule det.
//
//   website
//     Her afgoer HTTP-kontrollen i vagthunden sagen: svarer siden, er
//     indholdet ude. Et website-element, der IKKE svarer, er en rigtig
//     driftsfejl, og den skal ses — ikke lukkes.
//
//   alt inden for vinduet
//     Et element, der stadig kan publiceres lovligt, roeres ikke.
//
// Toerloeb er standard. Der skrives kun med --skriv.
import { readFileSync, existsSync } from 'node:fs';
import {
  laesRegister, sidsteStatus, foejTilRegister, varighed,
  AFSENDT, STOPPET, AFSLUTTET, OPGIVET, MAKS_FORSINKELSE_S,
} from './krav.mjs';

const KOE = 'publicering/koe.json';
const REGISTER = 'publicering/register.json';

const tid = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/**
 * Hvilke elementer skal lukkes? Ren funktion: laeser kun det, den faar.
 * Returnerer { luk, sprunget } med en begrundelse for hvert fravalg.
 */
export function udvaelg({ koe, register, nu = Date.now(), harLaas = () => false, maks = MAKS_FORSINKELSE_S }) {
  const luk = [], sprunget = [];
  for (const e of koe) {
    const nr = e.element;
    const sidste = sidsteStatus(register, nr);

    if (sidste === null) { sprunget.push([nr, 'slet ikke registreret — vagthunden melder det som fejl']); continue; }
    if (AFSLUTTET.includes(sidste)) { sprunget.push([nr, `allerede afsluttet (${sidste})`]); continue; }
    if (AFSENDT.includes(sidste)) { sprunget.push([nr, `${sidste} — opslaget er afsendt, og det lukkes ikke som opgivet`]); continue; }
    if (STOPPET.includes(sidste) && sidste !== 'STOPPET FOR SENT') {
      sprunget.push([nr, `${sidste} — udfaldet er uvist og kraever et menneske`]); continue;
    }
    if (e.kanal === 'website') { sprunget.push([nr, 'website — HTTP-kontrollen i vagthunden afgoer sagen']); continue; }

    const naar = new Date(e.tidspunkt).getTime();
    if (Number.isNaN(naar)) { sprunget.push([nr, `ulaeseligt tidspunkt: ${e.tidspunkt}`]); continue; }
    const forbi = Math.floor((nu - naar) / 1000);
    if (forbi <= maks) {
      sprunget.push([nr, forbi < 0
        ? `forfalder foerst ${tid(naar)}`
        : `forfaldt for ${varighed(forbi)} siden — stadig inden for vinduet paa ${varighed(maks)}`]);
      continue;
    }

    luk.push({
      element: nr,
      kanal: e.kanal,
      status: OPGIVET,
      post_id: null,
      godkendt_tidspunkt: e.tidspunkt,
      tidspunkt: new Date(nu).toISOString(),
      registreret_af: 'motor',
      sidste_status_foer: sidste,
      noter: `Opgivet automatisk. Det godkendte tidspunkt ${tid(naar)} blev passeret for `
           + `${varighed(forbi)} siden, og publiceringsvinduet er ${varighed(maks)}. `
           + `Seneste status var «${sidste}», saa opslaget blev aldrig afsendt. `
           + `${harLaas(nr) ? 'Laasefilen findes fortsat' : 'Der er ingen laasefil, saa motoren kunne ikke selv sende det'}. `
           + 'Skal det alligevel ud, kraever det en ny godkendelse og et nyt tidspunkt.',
    });
  }
  return { luk, sprunget };
}

function laesKoe() { return JSON.parse(readFileSync(KOE, 'utf8')); }
const harLaas = (nr) => existsSync(`publicering/laase/element-${String(nr).padStart(2, '0')}.json`);

function koer({ skriv = false, nu = Date.now() } = {}) {
  const { luk, sprunget } = udvaelg({
    koe: laesKoe(), register: laesRegister(REGISTER), nu, harLaas,
  });

  console.log(skriv
    ? 'AFSLUTTER forfaldne, aldrig publicerede opslag.\n'
    : 'TOERLOEB — intet skrives. Viser hvad der ville blive afsluttet.\n');

  if (sprunget.length) {
    console.log('── roeres ikke ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }

  if (!luk.length) { console.log('Intet at afslutte.'); return 0; }

  console.log('── afsluttes som OPGIVET ──');
  for (const r of luk) {
    console.log(`  element ${String(r.element).padStart(2)}  ${r.kanal.padEnd(10)} ${r.godkendt_tidspunkt.slice(0, 16)}  (var «${r.sidste_status_foer}»)`);
  }
  console.log('');

  if (!skriv) {
    console.log(`${luk.length} element(er) ville blive afsluttet. Koer med --skriv for at goere det.`);
    return 0;
  }
  foejTilRegister(luk, REGISTER);
  console.log(`${luk.length} raekke(r) skrevet i registret. Intet slettet; historikken staar.`);
  return luk.length;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--nu');
  koer({ skriv: args.includes('--skriv'), nu: i !== -1 ? new Date(args[i + 1]).getTime() : Date.now() });
}

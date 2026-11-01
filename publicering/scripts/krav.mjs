// Krav paa et element, FOER der sendes noget.
//
// HVORFOR
// Et vellykket «git push» loeser ikke dobbeltpublicering. Vinduet er dette:
//
//   1. motoren sender opslaget til platformen       ← opslaget ER ude
//   2. koerslen doer (runner tabt, job annulleret, netvaerk)
//   3. registreringen naaede aldrig at blive skrevet
//   4. naeste planlagte koersel ser et element uden registerpost
//   5. den publicerer det IGEN
//
// Push-gentagelsen fra PR #91 lukker det almindelige tilfaelde, hvor to
// koersler skriver samtidig. Den lukker IKKE dette: her bliver der aldrig
// pushet noget at gentage.
//
// LOESNINGEN ER AT TAGE KRAVET FOERST
// Foer der sendes noget, skrives en raekke med status «PUBLICERING IGANG»
// og den COMMITTES. Derefter sendes opslaget. Udfaldet skrives bagefter.
//
// Doer koerslen mellem 1 og 3, staar kravet tilbage i registret. Enhver
// senere koersel ser «PUBLICERING IGANG» som seneste status og roerer ikke
// elementet: udfaldet er uvist, og uvist betyder et menneske. Det er samme
// regel som for et fejlet forsoeg, og af samme grund.
//
// RETTIGHEDERNE HOLDER
// Kravet tages i et job UDEN netadgang og uden token, og selve publiceringen
// koerer uden skriveadgang til repoet. Det job, der kan skrive i repoet,
// taler aldrig med platformene — hverken foer eller efter.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

export const REGISTER = 'publicering/register.json';

/** Elementet er afsendt eller undervejs. Roer det ikke. */
export const AFSENDT = ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT'];

/** Et uvist eller afvist udfald. Kraever et menneske foer nyt forsoeg. */
export const STOPPET = ['PUBLICERING FEJLET', 'PLANLAEGNING FEJLET', 'PUBLICERING IGANG', 'STOPPET FOR SENT'];

export const IGANG = 'PUBLICERING IGANG';
export const FOR_SENT = 'STOPPET FOR SENT';

/** Hoejst en time efter det godkendte tidspunkt. Derefter et menneske. */
export const MAKS_FORSINKELSE_S = 60 * 60;

export const laesRegister = (sti = REGISTER) =>
  (existsSync(sti) ? JSON.parse(readFileSync(sti, 'utf8')) : []);

/** Seneste raekke for elementet, uanset status. */
export function sidsteStatus(register, nr) {
  const r = [...register].reverse().find((x) => x.element === nr);
  return r ? r.status : null;
}

/**
 * Faelles spaerre paa registret. Returnerer en begrundelse, hvis elementet
 * ikke maa roeres — ellers null.
 */
export function registerSpaerre(register, nr) {
  const afsendt = [...register].reverse().find((x) => x.element === nr && AFSENDT.includes(x.status));
  if (afsendt) return `staar som ${afsendt.status} i registret`;
  const sidste = sidsteStatus(register, nr);
  if (sidste === IGANG) {
    return 'et tidligere forsoeg naaede at tage kravet, men meldte aldrig tilbage. '
         + 'Opslaget kan vaere gaaet ud. Se efter paa platformen FOER nyt forsoeg';
  }
  if (sidste === FOR_SENT) {
    return 'stoppet som for sent — kraever menneskelig stillingtagen foer nyt forsoeg';
  }
  if (STOPPET.includes(sidste)) {
    return 'seneste forsoeg fejlede — kraever menneskelig stillingtagen foer nyt forsoeg';
  }
  return null;
}

/**
 * Er tidspunktet naaet, og er det ikke for laenge siden?
 *   { tilstand: 'fremtid' | 'forfalden' | 'for_sent', naar }
 */
export function forfald(e, nu, maks = MAKS_FORSINKELSE_S) {
  const naar = Math.floor(new Date(e.dato).getTime() / 1000);
  if (Number.isNaN(naar)) return { tilstand: 'ulaeselig', naar: null };
  if (naar > nu) return { tilstand: 'fremtid', naar };
  if (nu - naar > maks) return { tilstand: 'for_sent', naar };
  return { tilstand: 'forfalden', naar };
}

/**
 * Koeen skal vaere enig med laasen, og den skal sige «motor».
 *
 * HVORFOR OGSAA PAA LINKEDIN OG INSTAGRAM
 * De to spor laeste kun laasefiler og saa aldrig koeen. Derfor kunne et
 * element ikke saettes paa pause uden at aendre laasefilen — og en aendret
 * laasefil er en bortfaldet godkendelse. Google-sporet har altid kontrolleret
 * koeen; nu goer alle tre.
 *
 * Pause er dermed: saet «metode» til noget andet end «motor» i koe.json.
 * Laasen, teksthashen og godkendelsen er uroerte, og motoren roerer ikke
 * elementet, foer metoden saettes tilbage.
 *
 * Samtidig fanges det, ingen ellers fangede: at koeens tidspunkt og laasens
 * dato er gledet fra hinanden, saa vagthunden overvaager ét tidspunkt og
 * motoren publicerer paa et andet.
 */
export function koeSpaerre(koe, e, sti, kanal) {
  const k = koe.filter((x) => x.element === e.element && x.kanal === kanal);
  if (k.length !== 1) return `AFVIST: ${k.length} ${kanal}-poster i koeen, ventede én`;
  if (k[0].metode !== 'motor') {
    return `koeen siger metode "${k[0].metode}" — motoren roerer det ikke (sat paa pause)`;
  }
  if (sti && k[0].laasefil && k[0].laasefil !== sti) {
    return `AFVIST: koeen peger paa ${k[0].laasefil}, ikke ${sti}`;
  }
  const a = new Date(k[0].tidspunkt).getTime(), b = new Date(e.dato).getTime();
  // Er laasens egen dato ulaeselig, er det IKKE uenighed mellem koe og laas.
  // Den fejl hoerer til datokontrollen, som siger praecis hvad der er galt.
  // Hver kontrol melder om sit eget.
  if (Number.isNaN(b)) return null;
  if (Number.isNaN(a) || a !== b) {
    return `AFVIST: koeens tidspunkt (${k[0].tidspunkt}) er ikke den godkendte dato (${e.dato})`;
  }
  return null;
}

/** Kravraekken, der committes FOER der sendes noget. */
export function kravraekke(e, kanal) {
  return {
    element: e.element, kanal, versionslaas: e.versionslaas,
    status: IGANG, post_id: null,
    godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString(),
    registreret_af: 'motor',
    noter: 'Kravet er taget. Melder koerslen ikke tilbage, skal udfaldet afklares i haanden.',
  };
}

/** Raekken for et element, der forfaldt for laenge siden. */
export function forSentRaekke(e, kanal, naar, maks = MAKS_FORSINKELSE_S) {
  const min = Math.round((Math.floor(Date.now() / 1000) - naar) / 60);
  return {
    element: e.element, kanal, versionslaas: e.versionslaas,
    status: FOR_SENT, post_id: null,
    godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString(),
    registreret_af: 'motor',
    noter: `Forfaldt for ${min} minutter siden, graensen er ${Math.round(maks / 60)}. `
         + 'Et opslag, der kommer for sent, kan vaere forkert nu. Publiceres ikke automatisk.',
  };
}

/** Foejer raekker til registret. Append-only; intet overskrives. */
export function foejTilRegister(raekker, sti = REGISTER) {
  if (!raekker.length) return 0;
  const reg = laesRegister(sti);
  reg.push(...raekker);
  writeFileSync(sti, JSON.stringify(reg, null, 2) + '\n');
  return raekker.length;
}

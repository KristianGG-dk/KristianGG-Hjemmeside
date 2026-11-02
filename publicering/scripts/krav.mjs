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

/**
 * Hvor laenge efter det godkendte tidspunkt motoren stadig maa publicere.
 *
 * Kristians beslutning 01-11-2026: 24 timer. Den erstatter den tidligere
 * graense paa 60 minutter (krav 2 i issue #90).
 *
 * Baggrunden er maalt: GitHubs cron koerer reelt hver 3.-6. time, og med en
 * times graense ville de FLESTE godkendte opslag blive stoppet frem for
 * publiceret. Graensen var ikke problemet; udloeseren er. Et doegn giver
 * udloeseren luft nok til, at et godkendt opslag ikke bortfalder.
 *
 * Motoren venter ikke med vilje. Den publicerer ved FOERSTE gyldige koersel
 * efter det godkendte tidspunkt — vinduet er en graense, ikke en udsaettelse.
 *
 * Reglen staar HER og kun her. Google havde sin egen kopi paa 24 timer, og to
 * steder med samme regel bliver uenige med tiden.
 */
export const MAKS_FORSINKELSE_S = 24 * 60 * 60;

/**
 * «3 timer og 12 minutter». Til beskeder, der skal kunne laeses.
 *
 * Over to doegn skifter den til dage: «421 timer og 8 minutter» er korrekt,
 * men ingen laeser det som sytten dage. En besked, man skal regne paa, er
 * halvt spildt.
 */
export function varighed(sekunder) {
  const m = Math.round(Math.abs(sekunder) / 60);
  const t = Math.floor(m / 60), r = m % 60;
  if (t === 0) return `${m} minut${m === 1 ? '' : 'ter'}`;
  if (t > 48) {
    const d = Math.floor(t / 24), rt = t % 24;
    return rt === 0 ? `${d} dage` : `${d} dage og ${rt} time${rt === 1 ? '' : 'r'}`;
  }
  if (r === 0) return `${t} time${t === 1 ? '' : 'r'}`;
  return `${t} time${t === 1 ? '' : 'r'} og ${r} minut${r === 1 ? '' : 'ter'}`;
}

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
 * Tidsfoelsomt indhold: et element kan baere en KORTERE gyldighed end doegnet.
 *
 * Et arrangement, en tilmeldingsfrist eller en kampagnedag taaler ikke at gaa
 * ud et doegn for sent, selv om de fleste opslag goer. To maader, og de kan
 * bruges hver for sig eller sammen:
 *
 *   "gyldig_timer": 3            tre timer efter det godkendte tidspunkt
 *   "udloeber": "2026-11-05T12:00:00+01:00"   et absolut klokkeslet
 *
 * Felterne er FRIVILLIGE. Mangler de, gaelder doegnet. De indgaar IKKE i
 * versionslaasen, og de er ikke sat paa noget eksisterende element: skal et
 * godkendt opslag have et af dem, aftales det med Kristian og Claude foerst.
 *
 * Returnerer det sekund, hvor elementet senest maa publiceres.
 */
export function sidsteFrist(e, naar, maks = MAKS_FORSINKELSE_S) {
  const frister = [naar + maks];
  if (Number.isFinite(e.gyldig_timer) && e.gyldig_timer > 0) {
    frister.push(naar + Math.round(e.gyldig_timer * 3600));
  }
  if (e.udloeber) {
    const u = Math.floor(new Date(e.udloeber).getTime() / 1000);
    if (!Number.isNaN(u)) frister.push(u);
  }
  return Math.min(...frister);
}

/** Baerer elementet en kortere gyldighed end doegnet? Til beskeder. */
export function harEgenFrist(e) {
  return Boolean((Number.isFinite(e.gyldig_timer) && e.gyldig_timer > 0) || e.udloeber);
}

/**
 * Er tidspunktet naaet, og er det ikke for sent?
 *   { tilstand: 'ulaeselig' | 'fremtid' | 'forfalden' | 'for_sent', naar, frist }
 *
 * Graensen er inklusiv: PRAECIS 24 timer efter er stadig tillladt, og foerst
 * sekundet efter er for sent. «Sidste tilladte tidspunkt» betyder tilladt.
 *
 * Alle tider regnes paa absolutte oejeblikke. «dato» baerer selv sit danske
 * offset (+01:00 om vinteren, +02:00 om sommeren), og gaten kontrollerer, at
 * offsettet er Danmarks paa netop den dato. Derfor er sommertid haandteret
 * uden at motoren kender et tidszonenavn: et doegn er 86400 sekunder, ogsaa
 * hen over et tidsskifte.
 */
export function forfald(e, nu, maks = MAKS_FORSINKELSE_S) {
  const naar = Math.floor(new Date(e.dato).getTime() / 1000);
  if (Number.isNaN(naar)) return { tilstand: 'ulaeselig', naar: null, frist: null };
  const frist = sidsteFrist(e, naar, maks);
  if (naar > nu) return { tilstand: 'fremtid', naar, frist };
  if (nu > frist) return { tilstand: 'for_sent', naar, frist };
  return { tilstand: 'forfalden', naar, frist };
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

/** Hvorfor et element er for sent. Bruges baade i loggen og i registret. */
export function forSentGrund(e, naar, nu, maks = MAKS_FORSINKELSE_S) {
  const frist = sidsteFrist(e, naar, maks);
  const egen = frist < naar + maks;
  return `forfaldt for ${varighed(nu - naar)} siden. `
    + (egen
      ? `Elementet baerer sin egen kortere frist (${e.udloeber ? `udloeber ${e.udloeber}` : `gyldig_timer: ${e.gyldig_timer}`}), `
        + `og den udloeb for ${varighed(nu - frist)} siden.`
      : `Graensen er ${varighed(maks)}.`)
    + ' Publiceres ikke automatisk; kraever menneskelig stillingtagen.';
}

/** Raekken for et element, der forfaldt for sent. */
export function forSentRaekke(e, kanal, naar, maks = MAKS_FORSINKELSE_S, nu = Math.floor(Date.now() / 1000)) {
  return {
    element: e.element, kanal, versionslaas: e.versionslaas,
    status: FOR_SENT, post_id: null,
    godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString(),
    registreret_af: 'motor',
    noter: forSentGrund(e, naar, nu, maks),
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

/* Den faelles driftsstruktur — ét opgaveregister, ét beslutningsregister.
   ============================================================================

   HVORFOR DEN FINDES

   Claude, Codex, motoren og vagthunden arbejdede hver for sig. Det gav tre
   konkrete skader, som alle kan ses i historikken:

     1. Dobbeltarbejde. Den samme mangel blev beskrevet som en ny opgave hver
        gang nogen kiggede, fordi ingen kunne se, at den allerede var lukket.
     2. Gentagne spoergsmaal. Kristian blev bedt om at godkende noget, han
        havde godkendt en uge foer, fordi beslutningen kun stod i en samtale.
     3. Foraeldede krav. En opgaveliste sagde «gennemfoer OAuth», laenge efter
        at OAuth var gennemfoert og verificeret.

   LOESNINGEN ER IKKE ET NYT REGISTER

   De autoritative kilder findes allerede, og de bliver ikke erstattet:

     publicering/koe.json          hvad der SKAL ske
     publicering/register.json     hvad der ER sket (append-only)
     publicering/laase/            hvad der er godkendt, og laasen paa det
     publicering/pakker/           hvem der godkendte hvad hvornaar
     GitHub Actions                om maskineriet koerer
     /byg.json + produktionskontrol hvad der faktisk er i luften

   drift/opgaver.json er en AFLEDNING af dem, ikke en konkurrent. Derfor er
   synkroniseringen idempotent: den kan koeres igen og igen uden at skabe
   dubletter og uden at overskrive nyere oplysninger.

   drift/beslutninger.json er det ene sted, en beslutning fra Kristian bliver
   husket. Det er den fil, der goer, at han ikke bliver spurgt to gange.      */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const OPGAVER = 'drift/opgaver.json';
export const BESLUTNINGER = 'drift/beslutninger.json';

/** Hvem kan eje en opgave. Rollerne er adskilte med vilje. */
export const ANSVARLIGE = ['claude', 'codex', 'motor', 'vagthund', 'kristian'];

/**
 * Statusser.
 *
 * «afventer-haendelse» er den vigtigste af dem. Uden den bliver alt, der
 * venter paa en planlagt dato, enten meldt som en fejl eller glemt. Et
 * opslag, der skal ud 4. november, er hverken i orden eller i stykker — det
 * venter, og det skal kunne siges.
 */
export const STATUSSER = [
  'aaben',              // nogen skal gøre noget, ingen er gaaet i gang
  'igang',              // der arbejdes
  'afventer-kristian',  // kraever en beslutning, en adgang eller penge
  'afventer-haendelse',  // venter paa en dato eller en ekstern hændelse
  'loest',              // gjort, men endnu ikke verificeret i drift
  'lukket',             // gjort OG verificeret; baerer bevis
];

export const AABNE = ['aaben', 'igang', 'afventer-kristian', 'afventer-haendelse', 'loest'];
export const PRIORITETER = ['hoej', 'mellem', 'lav'];

const nuISO = () => new Date().toISOString();

/* ── Laesning og skrivning ───────────────────────────────────────────────── */

export function laes(sti, standard) {
  if (!existsSync(sti)) return standard;
  return JSON.parse(readFileSync(sti, 'utf8'));
}

export const laesOpgaver = (sti = OPGAVER) =>
  laes(sti, { version: 1, opdateret: null, opgaver: [] });

export const laesBeslutninger = (sti = BESLUTNINGER) =>
  laes(sti, { version: 1, beslutninger: [] });

/**
 * Skriver registeret — men kun hvis der FAKTISK er noget nyt.
 *
 * Uden den spaerre ville feltet «opdateret» aendre sig ved hver koersel, og
 * saa ville en genkoersel altid give en diff. Det ville baade larme i
 * historikken og faa gatens idempotenskontrol til at fejle uden grund.
 * Sammenligningen ser derfor bort fra tidsstemplet selv.
 */
export function skrivOpgaver(data, sti = OPGAVER) {
  const fejl = valider(data);
  if (fejl.length) throw new Error(`opgaveregisteret er ugyldigt:\n  ${fejl.join('\n  ')}`);

  const uden = (d) => JSON.stringify({ ...d, opdateret: null });
  if (existsSync(sti) && uden(JSON.parse(readFileSync(sti, 'utf8'))) === uden(data)) {
    return { ...data, skrevet: false };
  }

  data.opdateret = nuISO();
  writeFileSync(sti, JSON.stringify(data, null, 2) + '\n');
  return { ...data, skrevet: true };
}

/* ── Validering ──────────────────────────────────────────────────────────── */

export function valider(data) {
  const fejl = [];
  const set = new Set();
  for (const o of data.opgaver ?? []) {
    if (!o.id) { fejl.push('en opgave uden id'); continue; }
    if (set.has(o.id)) fejl.push(`${o.id}: findes mere end én gang`);
    set.add(o.id);
    if (!o.titel) fejl.push(`${o.id}: mangler titel`);
    if (!ANSVARLIGE.includes(o.ansvarlig)) fejl.push(`${o.id}: ukendt ansvarlig «${o.ansvarlig}»`);
    if (!STATUSSER.includes(o.status)) fejl.push(`${o.id}: ukendt status «${o.status}»`);
    if (!PRIORITETER.includes(o.prioritet)) fejl.push(`${o.id}: ukendt prioritet «${o.prioritet}»`);
    if (!Array.isArray(o.kilde) || !o.kilde.length) fejl.push(`${o.id}: mangler dokumenteret kilde`);
    if (AABNE.includes(o.status) && !o.naeste_handling) fejl.push(`${o.id}: aaben uden naeste handling`);
    if (o.status === 'lukket' && !o.afslutning?.bevis) fejl.push(`${o.id}: lukket uden bevis`);
    if (o.status !== 'lukket' && o.afslutning) fejl.push(`${o.id}: baerer afslutning, men er ikke lukket`);
    if (!Array.isArray(o.historik) || !o.historik.length) fejl.push(`${o.id}: mangler historik`);
    for (const a of o.afhaengigheder ?? []) {
      if (!(data.opgaver ?? []).some((x) => x.id === a)) fejl.push(`${o.id}: afhaenger af ukendt opgave «${a}»`);
    }
  }
  return fejl;
}

/* ── Idempotent sammenfoejning ───────────────────────────────────────────── */

/**
 * Opretter opgaven, hvis den ikke findes, og opdaterer den ellers.
 *
 * Reglerne, der goer den sikker at koere igen og igen:
 *
 *   - Samme id = samme opgave. Der opstaar aldrig en dublet.
 *   - En LUKKET opgave genaabnes ikke af en synkronisering. Det var praecis
 *     den fejl, der fik afsluttede krav til at dukke op igen som nye. Skal
 *     den genaabnes, sker det udtrykkeligt med genaabn().
 *   - Felter, et menneske har sat (ansvarlig, prioritet, frist), overskrives
 *     ikke af en maskinel opdatering, medmindre tvingende er sat.
 *   - Historikken foejes til, aldrig erstattet.
 *   - Aendrer intet sig, roeres opgaven ikke — saa en genkoersel giver ingen
 *     stoej i diffen.
 */
export function opretEllerOpdater(data, ny, { af = 'synkronisering', tvingende = false } = {}) {
  if (!ny.id) throw new Error('opgaven mangler id');
  const i = data.opgaver.findIndex((o) => o.id === ny.id);

  if (i === -1) {
    const o = {
      id: ny.id,
      titel: ny.titel,
      ansvarlig: ny.ansvarlig ?? 'codex',
      prioritet: ny.prioritet ?? 'mellem',
      frist: ny.frist ?? null,
      status: ny.status ?? 'aaben',
      kilde: ny.kilde ?? [],
      naeste_handling: ny.naeste_handling ?? null,
      afhaengigheder: ny.afhaengigheder ?? [],
      afslutning: null,
      historik: [{ tid: nuISO(), af, hvad: 'oprettet' }],
    };
    data.opgaver.push(o);
    return { handling: 'oprettet', opgave: o };
  }

  const o = data.opgaver[i];
  if (o.status === 'lukket' && !tvingende) {
    return { handling: 'sprunget over (lukket)', opgave: o };
  }

  const aendringer = [];
  const maaSaettes = tvingende
    ? ['titel', 'ansvarlig', 'prioritet', 'frist', 'status', 'naeste_handling']
    : ['titel', 'status', 'naeste_handling'];
  for (const f of maaSaettes) {
    if (ny[f] !== undefined && ny[f] !== null && JSON.stringify(ny[f]) !== JSON.stringify(o[f])) {
      aendringer.push(`${f}: ${JSON.stringify(o[f])} → ${JSON.stringify(ny[f])}`);
      o[f] = ny[f];
    }
  }
  // Kilder samles, saa en opgave baerer alle de beviser, den har faaet.
  for (const k of ny.kilde ?? []) {
    if (!o.kilde.some((x) => x.type === k.type && String(x.ref) === String(k.ref))) {
      o.kilde.push(k);
      aendringer.push(`kilde: +${k.type}/${k.ref}`);
    }
  }
  if (!aendringer.length) return { handling: 'uaendret', opgave: o };
  o.historik.push({ tid: nuISO(), af, hvad: aendringer.join('; ') });
  return { handling: 'opdateret', opgave: o, aendringer };
}

/** Lukker en opgave. Kraever et bevis — ellers er den ikke lukket, kun glemt. */
export function luk(data, id, bevis, { af = 'synkronisering' } = {}) {
  const o = data.opgaver.find((x) => x.id === id);
  if (!o) throw new Error(`ukendt opgave ${id}`);
  if (!bevis) throw new Error(`${id} kan ikke lukkes uden bevis`);
  if (o.status === 'lukket') return { handling: 'allerede lukket', opgave: o };
  o.status = 'lukket';
  o.naeste_handling = null;
  o.afslutning = { dato: nuISO(), bevis, af };
  o.historik.push({ tid: nuISO(), af, hvad: `lukket: ${bevis}` });
  return { handling: 'lukket', opgave: o };
}

/** Genaabner. Kun udtrykkeligt, og grunden bliver staaende i historikken. */
export function genaabn(data, id, grund, { af = 'vagthund' } = {}) {
  const o = data.opgaver.find((x) => x.id === id);
  if (!o) throw new Error(`ukendt opgave ${id}`);
  if (!grund) throw new Error(`${id} kan ikke genaabnes uden en grund`);
  const foer = o.afslutning;
  o.status = 'aaben';
  o.afslutning = null;
  o.naeste_handling = grund;
  o.historik.push({
    tid: nuISO(), af,
    hvad: `genaabnet: ${grund}` + (foer ? ` (var lukket ${foer.dato} paa «${foer.bevis}»)` : ''),
  });
  return { handling: 'genaabnet', opgave: o };
}

/* ── Spaerren mod at spoerge Kristian igen ───────────────────────────────── */

/**
 * Maa denne opgave laegges hos Kristian?
 *
 * Seks kontroller, i den raekkefoelge de billigst afviser. Returnerer
 * { maa: false, grund } hvis svaret allerede findes et sted i systemet.
 *
 * Det er den funktion, der forhindrer den mest irriterende fejl i hele
 * systemet: at blive bedt om at godkende noget, man har godkendt.
 */
export function maaSpoergeKristian(opgave, {
  beslutninger = { beslutninger: [] },
  mergedePRer = [],
  produktionskontrol = null,
  implementeret = false,
} = {}) {
  const emne = (opgave.emne ?? opgave.id ?? '').toLowerCase();

  const b = (beslutninger.beslutninger ?? []).find(
    (x) => x.emne && emne.includes(String(x.emne).toLowerCase()));
  if (b) return { maa: false, grund: `beslutningen findes allerede: «${b.beslutning}» (${b.dato}, ${b.kilde})` };

  for (const nr of opgave.pr ?? []) {
    if (mergedePRer.includes(Number(nr))) {
      return { maa: false, grund: `PR #${nr} er allerede merget` };
    }
  }

  if (implementeret) return { maa: false, grund: 'opgaven er allerede implementeret' };

  if (produktionskontrol && opgave.verificeres_af_produktionskontrol
      && produktionskontrol.tid > (opgave.rejst ?? '')
      && produktionskontrol.resultat === 'OK') {
    return { maa: false, grund: `en nyere produktionskontrol (${produktionskontrol.tid}) er groen` };
  }

  if (opgave.art && !['beslutning', 'godkendelse', 'adgang', 'penge', 'handling'].includes(opgave.art)) {
    return { maa: false, grund: `arten «${opgave.art}» er ikke noget, Kristian skal afgoere` };
  }

  return { maa: true };
}

/**
 * Hvem hoerer opgaven hjemme hos?
 *
 * Grundreglen fra masterprompten: manglende teknisk dokumentation er Codex'
 * opgave, manglende indhold er Claudes, og Kristian involveres kun, naar der
 * faktisk skal traeffes en beslutning eller gives en adgang.
 */
export function placer(fund) {
  if (fund.art === 'indhold' || fund.art === 'redaktionel') return 'claude';
  if (['beslutning', 'godkendelse', 'adgang', 'penge'].includes(fund.art)) return 'kristian';
  return 'codex';
}

/* ── Opslag ──────────────────────────────────────────────────────────────── */

export const aabne = (data) => data.opgaver.filter((o) => AABNE.includes(o.status));
export const forAnsvarlig = (data, hvem) => aabne(data).filter((o) => o.ansvarlig === hvem);

/** Findes der allerede en aaben opgave om samme forhold? */
export function findesAllerede(data, id) {
  const o = data.opgaver.find((x) => x.id === id);
  return o && AABNE.includes(o.status) ? o : null;
}

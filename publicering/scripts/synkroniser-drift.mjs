/* Synkroniserer det faelles opgaveregister med virkeligheden.
   ============================================================================

   Den laeser de autoritative kilder og retter drift/opgaver.json til, saa
   registeret siger det samme som systemet. Den erstatter ingen kilde — den
   afleder af dem.

   DEN VIGTIGSTE EGENSKAB ER, AT DEN KAN KOERES IGEN

   Koeres den to gange i traek, sker der ingenting anden gang. Det er ikke en
   bekvemmelighed: uden den egenskab ville hver koersel lave nye opgaver om de
   samme forhold, og det var praecis den fejl, der gjorde de gamle
   opgavelister ubrugelige.

   Tre spaerrer sikrer det:
     1. Faste id'er. Samme forhold giver samme id, altid.
     2. En LUKKET opgave genaabnes aldrig af en synkronisering.
     3. Felter, et menneske har sat, overskrives ikke maskinelt.

   KILDERNE

     vagthundens --json      tekniske fund i drift
     publicering/koe.json    hvad der venter, og hvornaar
     publicering/register.json  hvad der er sket
     drift/beslutninger.json beslutninger, saa Kristian ikke spoerges to gange
     GitHub Actions          om maskineriet koerer (valgfrit, kraever token)

   Toerloeb som standard. --skriv gemmer.                                   */

import { readFileSync, existsSync } from 'node:fs';
import {
  laesOpgaver, laesBeslutninger, skrivOpgaver, opretEllerOpdater, luk,
  maaSpoergeKristian, placer, findesAllerede, AABNE,
} from './drift.mjs';

/**
 * Vagthundens fund → en opgave med et FAST id.
 *
 * Nøglen er, at id'et udledes af forholdet, ikke af ordlyden. «Instagram
 * koerte sidst for 9 timer siden» og «... for 14 timer siden» er det samme
 * forhold og maa give den samme opgave — ellers vokser listen med én post
 * pr. kontrol.
 */
export function fundTilOpgave(fund, niveau) {
  const omr = fund.omraade.toLowerCase();
  const t = fund.tekst;

  const regler = [
    { naar: /^element (\d+)$/.test(omr), id: () => `drift-element-${omr.match(/\d+/)[0]}`,
      titel: () => `Element ${omr.match(/\d+/)[0]}: ${t.split('.')[0]}`, art: 'teknisk' },
    { naar: omr === 'actions', id: () => 'drift-actions-koersler',
      titel: () => 'Planlagte koersler er standset eller forsinket', art: 'teknisk' },
    { naar: omr === 'udloeser', id: () => 'K4-paalidelig-udloeser',
      titel: () => 'Den paalidelige udloeser: Netlify skal starte publiceringen paa klokkeslettet', art: 'teknisk' },
    { naar: omr === 'netlify', id: () => 'drift-netlify-byg',
      titel: () => 'Netlify bygger ikke, eller sitet svarer ikke', art: 'teknisk' },
    { naar: omr === 'linkedin', id: () => 'drift-linkedin-adgang',
      titel: () => 'LinkedIn-adgangen skal fornyes', art: 'adgang' },
    { naar: omr === 'google', id: () => 'drift-google-adgang',
      titel: () => 'Google Business Profile-adgangen skal fornyes', art: 'adgang' },
  ];
  const r = regler.find((x) => x.naar);
  if (!r) return null;

  return {
    id: r.id(),
    titel: r.titel(),
    art: r.art,
    status: niveau === 'fejl' ? 'aaben' : 'igang',
    prioritet: niveau === 'fejl' ? 'hoej' : 'mellem',
    naeste_handling: t,
    kilde: [{ type: 'vagthund', ref: `${fund.omraade}: ${t.slice(0, 120)}` }],
  };
}

/** Lukker en opgave, hvis vagthunden nu melder det samme forhold i orden. */
export function iOrdenLukker(fund) {
  const omr = fund.omraade.toLowerCase();
  if (omr === 'udloeser' && /er i drift|sidste livstegn/.test(fund.tekst)) {
    return { id: 'K4-paalidelig-udloeser', bevis: `vagthunden: ${fund.tekst}` };
  }
  if (omr === 'netlify' && /sitet blev sidst bygget|samme commit som main/.test(fund.tekst)) {
    return { id: 'drift-netlify-byg', bevis: `vagthunden: ${fund.tekst}` };
  }
  return null;
}

/* ── Selve synkroniseringen ──────────────────────────────────────────────── */

export function synkroniser({ opgaver, beslutninger, vagthund, mergedePRer = [], produktionskontrol = null }) {
  const haendelser = [];
  const noter = (h) => haendelser.push(h);

  // 1. Fejl og advarsler bliver til opgaver — hos den rigtige ansvarlige.
  for (const [niveau, liste] of [['fejl', vagthund?.fejl ?? []], ['bekraeft', vagthund?.bekraeft_selv ?? []]]) {
    for (const fund of liste) {
      const ny = fundTilOpgave(fund, niveau);
      if (!ny) continue;

      ny.ansvarlig = placer(ny);

      // Spaerren: skal det her overhovedet til Kristian?
      if (ny.ansvarlig === 'kristian') {
        const dom = maaSpoergeKristian(
          { ...ny, emne: ny.id, art: ny.art },
          { beslutninger, mergedePRer, produktionskontrol });
        if (!dom.maa) {
          ny.ansvarlig = 'codex';
          ny.naeste_handling = `${ny.naeste_handling} (ikke til Kristian: ${dom.grund})`;
          noter({ id: ny.id, hvad: `omplaceret til codex — ${dom.grund}` });
        }
      }

      const alleredeAaben = findesAllerede(opgaver, ny.id);
      const r = opretEllerOpdater(opgaver, ny, { af: 'vagthund' });
      noter({ id: ny.id, hvad: r.handling + (alleredeAaben ? ' (fandtes i forvejen — ingen dublet)' : '') });
    }
  }

  // 2. Forhold, der nu er i orden, lukkes — med vagthundens egen formulering
  //    som bevis. En opgave lukkes aldrig uden et.
  for (const fund of vagthund?.i_orden ?? []) {
    const l = iOrdenLukker(fund);
    if (!l) continue;
    const o = opgaver.opgaver.find((x) => x.id === l.id);
    if (!o || o.status === 'lukket') continue;
    luk(opgaver, l.id, l.bevis, { af: 'vagthund' });
    noter({ id: l.id, hvad: 'lukket paa vagthundens bevis' });
  }

  // 3. Afhaengigheder: en opgave, der venter paa en anden, maa ikke staa
  //    «aaben» og se ud som noget, nogen kan gaa i gang med.
  for (const o of opgaver.opgaver) {
    if (!AABNE.includes(o.status) || o.status !== 'aaben') continue;
    const blokeret = (o.afhaengigheder ?? []).filter((a) => {
      const d = opgaver.opgaver.find((x) => x.id === a);
      return d && d.status !== 'lukket';
    });
    if (blokeret.length) {
      opretEllerOpdater(opgaver, { id: o.id, status: 'afventer-haendelse' }, { af: 'synkronisering' });
      noter({ id: o.id, hvad: `afventer ${blokeret.join(', ')}` });
    }
  }

  return haendelser;
}

/* ── Kommandolinje ───────────────────────────────────────────────────────── */

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2);
  const skriv = arg.includes('--skriv');
  const i = arg.indexOf('--vagthund');
  const vagtfil = i !== -1 ? arg[i + 1] : null;

  const opgaver = laesOpgaver();
  const beslutninger = laesBeslutninger();
  const vagthund = vagtfil && existsSync(vagtfil) ? JSON.parse(readFileSync(vagtfil, 'utf8')) : null;
  if (!vagthund) {
    console.log('Ingen vagthundrapport angivet (--vagthund <fil>). Kun afhaengigheder afstemmes.');
  }

  const mergede = (process.env.MERGEDE_PRER ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  const h = synkroniser({ opgaver, beslutninger, vagthund, mergedePRer: mergede });

  console.log(`\nSYNKRONISERING — ${h.length} aendring(er)\n${'='.repeat(60)}`);
  if (!h.length) console.log('  Intet at rette. Registeret siger allerede det samme som systemet.');
  for (const x of h) console.log(`  ${x.id.padEnd(34)} ${x.hvad}`);

  if (skriv) {
    const r = skrivOpgaver(opgaver);
    console.log(r.skrevet
      ? '\ndrift/opgaver.json skrevet.'
      : '\ndrift/opgaver.json uaendret — intet skrevet.');
  } else {
    console.log('\nINTET SKREVET. Koer med --skriv for at gemme.');
  }
}

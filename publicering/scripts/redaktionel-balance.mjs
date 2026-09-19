// Redaktionel balancekontrol. Koeres FOER materialet gaar til godkendelse.
//
// Den er ikke en del af CI-gaten. Gaten passer paa, at en godkendt tekst ikke
// bliver aendret; denne passer paa, at teksten er den rigtige at faa godkendt.
// De to maa ikke blandes sammen: en stilkontrol, der kan stoppe en merge, vil
// foer eller siden blokere en tekst, Kristian har sagt god for.
//
// Princippet, Kristian fastlagde 19-09-2026:
//   Indhold skrives ud fra det, han laver, tilbyder og fagligt arbejder med.
//   Faglige, etiske og juridisk noedvendige afgraensninger skal med, naar de
//   er relevante, men de skal vaere proportionale. De maa ikke blive
//   hovedbudskabet, overskriften eller den gennemgaaende fortaelling,
//   medmindre emnet konkret kraever det.
//
// Kontrollen maaler, den doemmer ikke. Et flag betyder "se paa den her", ikke
// "den er forkert". Et opslag, der HANDLER om en afgraensning, kan godt vaere
// rigtigt — det skal bare vaere et bevidst valg og et faatal.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// Vendinger der flytter laeseren vaek fra Kristian: fravalg, begraensning,
// henvisning videre. Ordet "ikke" alene taeller ikke med — "det er ikke
// farligt" er en oplysning, ikke et fravalg.
const AFGRAENSNING = [
  /\bjeg (leverer|tilbyder|laver|giver|behandler|stiller) ikke\b/i,
  /\bjeg (kan|maa) ikke\b/i,
  /\bdet,? jeg ikke\b/i,
  /\bjeg er ikke (psykolog|laege|læge)\b/i,
  /\bhenvis(er|e|ning)\b/i,
  /\b(spoerg|spørg|tal med) din (laege|læge)\b/i,
  /\bgaa til (laegen|lægen)\b/i,
  /\bbedre dokumenteret end\b/i,
  /\bfoerstevalg|førstevalg\b/i,
  /\ber ikke (loesningen|løsningen|noget for dig)\b/i,
  /\bet plaster\b/i,
  /\bhoerer til (et andet sted|hos jer)\b/i,
  /\bikke er (mig|det,? jeg)\b/i,
  /\bjeg lover (ikke|ingenting)\b/i,
  /\bvaelge en anden|vælge en anden\b/i,
  /\bikke en (offentlig )?autorisation\b/i,
  /\bikke (en )?beskyttet titel\b/i,
];

const erAfgraensning = (afsnit) => AFGRAENSNING.some((r) => r.test(afsnit));

export function maal(tekst, titel = '') {
  const blokke = tekst.split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean);
  const overskrifter = blokke.filter((a) => /^#{1,6}\s/.test(a))
    .map((a) => a.replace(/^#{1,6}\s*/, ''));
  const afsnit = blokke.filter((a) => !/^#{1,6}\s/.test(a) && !/^\{\{</.test(a));
  if (!afsnit.length) return null;
  const flagede = afsnit.filter(erAfgraensning);
  // Indgangen er de to foerste afsnit: det er dem, laeseren moeder foerst,
  // og paa Instagram og Facebook ofte det eneste, der vises uden "mere".
  const indgang = afsnit.slice(0, 2).some(erAfgraensning);
  // Overskrifter vejer tungest. En titel, der handler om et fravalg, goer
  // fravalget til sidens aerinde, uanset hvor positiv broedteksten er —
  // og det er titlen, folk moeder i et soegeresultat og i et feed.
  const flagede_overskrifter = overskrifter.filter(erAfgraensning);
  return {
    afsnit: afsnit.length,
    afgraensende: flagede.length,
    andel: flagede.length / afsnit.length,
    negativ_indgang: indgang,
    negativ_titel: Boolean(titel) && erAfgraensning(titel),
    overskrifter: overskrifter.length,
    negative_overskrifter: flagede_overskrifter.length,
  };
}

const GRAENSE_ANDEL = 0.34;      // mere end en tredjedel af afsnittene
const GRAENSE_PAKKE = 0.25;      // mere end hvert fjerde element flaget

export function vurder(m) {
  const grunde = [];
  if (m.negativ_titel) grunde.push('TITLEN er en afgraensning');
  if (m.negative_overskrifter) {
    grunde.push(`${m.negative_overskrifter} af ${m.overskrifter} overskrifter afgraenser`);
  }
  if (m.negativ_indgang) grunde.push('indgangen er en afgraensning');
  if (m.andel > GRAENSE_ANDEL) grunde.push(`${Math.round(m.andel * 100)} % af afsnittene afgraenser`);
  return grunde;
}

// ── koersel ──────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const mapper = process.argv.slice(2);
  if (!mapper.length) mapper.push('publicering/laase');

  const emner = [];
  for (const m of mapper) {
    if (!existsSync(m)) { console.log(`  (springer over, findes ikke: ${m})`); continue; }
    for (const f of readdirSync(m).sort()) {
      const sti = join(m, f);
      if (f.endsWith('.json')) {
        const e = JSON.parse(readFileSync(sti, 'utf8'));
        if (!e.tekst) continue;                    // website: teksten ligger i kildefilen
        emner.push({ navn: `element ${e.element} (${e.kanal})`, tekst: e.tekst, titel: e.titel ?? '' });
      } else if (f.endsWith('.md') || f.endsWith('.txt')) {
        let t = readFileSync(sti, 'utf8');
        let titel = '';
        const dele = t.split(/^─+$/m);             // pakkefil: alt efter skillelinjen
        if (dele.length > 1) {
          t = dele.slice(1).join('\n');
        } else if (t.startsWith('---')) {
          titel = (t.split('---\n')[1] ?? '').match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? '';
          t = t.split('---\n').slice(2).join('---\n');
        }
        emner.push({ navn: basename(f), tekst: t.trim(), titel });
      }
    }
  }

  let flagede = 0;
  console.log(`Redaktionel balance — ${emner.length} element(er)\n`);
  for (const e of emner) {
    const m = maal(e.tekst, e.titel);
    if (!m) continue;
    const grunde = vurder(m);
    if (grunde.length) flagede++;
    console.log(
      `  ${grunde.length ? 'SE PAA' : '  ok  '}  ${e.navn.padEnd(34)}`
      + `${String(m.afgraensende).padStart(2)}/${String(m.afsnit).padEnd(2)} afsnit`
      + (grunde.length ? `   ← ${grunde.join('; ')}` : '')
    );
  }

  const andel = emner.length ? flagede / emner.length : 0;
  console.log(`\n  ${flagede} af ${emner.length} flaget (${Math.round(andel * 100)} %).`);
  if (andel > GRAENSE_PAKKE) {
    console.log(`  OVER GRAENSEN paa ${GRAENSE_PAKKE * 100} %. Materialet skriver for meget om det, Kristian ikke laver.`);
    process.exit(1);
  }
  console.log('  Inden for graensen.');
}

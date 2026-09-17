// Fælles låselogik. Bruges af både låseberegning og CI-verifikation.
// Låsen er en ren funktion af det godkendte publiceringsobjekt — den kan
// efterregnes af enhver og tildeles ikke af motoren.
import { createHash } from 'node:crypto';

/** Felter der ALTID skal være til stede. Mangler ét, er elementet ikke godkendt. */
export const PAAKRAEVEDE_FELTER = [
  'element', 'kanal', 'titel', 'meta_description', 'slug', 'slut_url',
  'dato', 'kategorier', 'billede', 'alt_tekst', 'links', 'cta',
  'hashtags', 'brodtekst_sha256',
];

/** Felter der indgår i låsen, i den rækkefølge kanonisk JSON sorterer dem. */
export const LAASTE_FELTER = [
  'titel', 'meta_description', 'slug', 'slut_url', 'dato', 'kategorier',
  'billede', 'alt_tekst', 'links', 'cta', 'hashtags', 'brodtekst_sha256',
];

export function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Brødtekstens hash: alt efter front matter, trimmet. */
export function brodtekstHash(markdown) {
  const dele = markdown.split('---\n');
  if (dele.length < 3) throw new Error('Kildefilen har ingen front matter');
  return sha256(dele.slice(2).join('---\n').trim());
}

/** Kanonisk JSON: sorterede nøgler, ingen whitespace. */
export function kanonisk(obj) {
  const sorteret = {};
  for (const k of Object.keys(obj).sort()) sorteret[k] = obj[k];
  return JSON.stringify(sorteret);
}

/**
 * Beregn versionslåsen over de låste felter.
 * Kaster hvis et påkrævet felt mangler — publicering skal stoppe, ikke udlede.
 */
export function beregnLaas(element) {
  const mangler = PAAKRAEVEDE_FELTER.filter(
    (f) => element[f] === undefined || element[f] === null
  );
  if (mangler.length) {
    throw new Error(
      `Obligatoriske felter mangler: ${mangler.join(', ')}. ` +
      'Elementet er ikke godkendt og må ikke publiceres.'
    );
  }
  const delmaengde = {};
  for (const f of LAASTE_FELTER) delmaengde[f] = element[f];
  return { laas: sha256(kanonisk(delmaengde)).slice(0, 16), kanonisk_form: kanonisk(delmaengde) };
}

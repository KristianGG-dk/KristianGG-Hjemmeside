// Proever indholdskontrollen. Intet netvaerk, ingen publicering.
//
//   node publicering/test/kontroller-indhold.test.mjs
//
// Kontrollen skal FAIL CLOSED. Derfor proever filen foerst og fremmest det,
// der SKAL fanges.
import { laesRegler, kontrollerElement, afklaret, stempel, rx, sha256 } from '../scripts/kontroller-indhold.mjs';

const regler = laesRegler();
const priser = new Set([1200, 1800, 3600]);
let bestaaet = 0, fejlet = 0;

const el = (tekst, ekstra = {}) => ({
  element: 900, kanal: 'facebook', titel: 'Test', meta_description: 'Test', alt_tekst: 'Sti i skoven',
  cta: 'Ingen', hashtags: [], tekst, godkendt_dato: '2026-10-01', ...ekstra,
});
const niveauer = (e, ctx = {}) => kontrollerElement(e, regler, { priser, ...ctx });

function fanges(navn, tekst, omraade, niveau, ekstra) {
  const f = niveauer(el(tekst, ekstra)).filter((x) => x.omraade === omraade && x.niveau === niveau);
  if (f.length) { bestaaet++; console.log(`  OK    fanget: ${navn}`); }
  else { fejlet++; console.log(`  FEJL  IKKE fanget: ${navn}`); }
}
function slipper(navn, tekst, ekstra) {
  const f = niveauer(el(tekst, ekstra));
  if (!f.length) { bestaaet++; console.log(`  OK    slipper igennem: ${navn}`); }
  else { fejlet++; console.log(`  FEJL  fejlagtigt fanget: ${navn} — ${f.map((x) => x.match).join(', ')}`); }
}

console.log('Titler og kompetencer (FAIL)');
fanges('RAB', 'Jeg er RAB-registreret psykoterapeut.', 'titler', 'FAIL');
fanges('grunduddannelse i DAT', 'Jeg har en grunduddannelse i dialektisk adfærdsterapi.', 'titler', 'FAIL');
fanges('Nordic Breath', 'Kom til Nordic Breath i skoven.', 'titler', 'FAIL');
fanges('forkert HEG-betegnelse', 'Jeg er Sanse & Naturbads instruktør.', 'titler', 'FAIL');
fanges('psykolog om sig selv', 'Jeg er psykolog og arbejder i Odense.', 'titler', 'FAIL');
fanges('i alt-teksten', 'Et roligt opslag.', 'titler', 'FAIL', { alt_tekst: 'Kristian, RAB-registreret' });

console.log('\nPris og moms (FAIL)');
fanges('pris der ikke findes', 'Tre timer koster 1.500 kr.', 'pris', 'FAIL');
fanges('ekskl. moms', 'Tre timer koster 1.800 kr. ekskl. moms.', 'moms', 'FAIL');
slipper('rigtig pris', 'Tre timer koster 1.800 kr.');

console.log('\nForskning uden kilde (FAIL)');
fanges('studie uden evidens', 'Et randomiseret forsøg fra 2018 undersøgte et program.', 'forskning', 'FAIL');
slipper('studie med evidens', 'Et randomiseret forsøg fra 2018 undersøgte et program.',
  { evidens: [{ id: 'E01', url: 'https://example.org/studie', dokumenterer_ikke: 'Kristians forløb' }] });

console.log('\nEffekt (REVIEW)');
fanges('helbredelse', 'Naturen kan helbrede.', 'effekt', 'REVIEW');
fanges('mange oplever', 'Mange oplever ro i skoven.', 'effekt', 'REVIEW');
fanges('antal sessioner', 'Typisk 6 sessioner.', 'effekt', 'REVIEW');
fanges('reducerer stress', 'Skovbad reducerer stress.', 'effekt', 'REVIEW');
fanges('giver ro', 'Åndedrættet giver ro.', 'effekt', 'REVIEW');
fanges('allerede efter', 'Allerede efter første gang.', 'effekt', 'REVIEW');
fanges('æøå ved ordgrænse', 'De fleste får det bedre.', 'effekt', 'REVIEW');
slipper('ordet helbred alene', 'Er du bekymret for dit helbred, så tal med din læge.');
slipper('beskrivelse af arbejdet', 'Vi går langsomt. Vi stopper undervejs. Du skal ikke fortælle mig noget.');

console.log('\nFaktaudsagn (REVIEW)');
fanges('kvantor', 'Det gør mange.', 'faktaudsagn', 'REVIEW');
fanges('procent', '31 procent har et højt stressniveau.', 'faktaudsagn', 'REVIEW');

console.log('\nGenbrug (REVIEW)');
{
  const t = 'Vi mødes et sted, vi har aftalt på forhånd. Så går vi langsomt og ikke langt. Vi taler undervejs, nogle gange meget og nogle gange næsten ikke, og vi stopper når der er noget at stoppe ved og lytter til vinden i toppen af træerne.';
  const f = niveauer(el(t), { andre: [el(t, { element: 901, kanal: 'instagram' })] }).filter((x) => x.omraade === 'genbrug');
  f.length ? (bestaaet++, console.log('  OK    fanget: samme tekst paa to kanaler')) : (fejlet++, console.log('  FEJL  IKKE fanget: samme tekst paa to kanaler'));
}

console.log('\nStillingtagen');
{
  const e = el('Mange oplever ro i skoven.');
  const f = niveauer(e).find((x) => x.omraade === 'effekt');
  const ufuldstaendig = { ...e, kontrol_stillingtagen: [{ omraade: 'effekt', match: 'mange oplever', beslutning: 'godkendt', af: 'Kristian' }] };
  !afklaret(f, ufuldstaendig) ? (bestaaet++, console.log('  OK    stillingtagen uden dato og begrundelse afvises'))
                              : (fejlet++, console.log('  FEJL  ufuldstaendig stillingtagen blev godtaget'));
  const fuld = { ...e, kontrol_stillingtagen: [{ omraade: 'effekt', match: 'Mange oplever', beslutning: 'godkendt', af: 'Kristian G. G. Dansted', dato: '2026-10-01', begrundelse: 'Test' }] };
  afklaret(f, fuld) ? (bestaaet++, console.log('  OK    fuld stillingtagen godtages'))
                    : (fejlet++, console.log('  FEJL  fuld stillingtagen blev afvist'));
}

console.log('\nStempel');
{
  const a = el('Vi går langsomt.');
  const b = el('Vi går langsomt!');
  const s1 = stempel(a, regler, { priser }), s2 = stempel(a, regler, { priser }), s3 = stempel(b, regler, { priser });
  s1.resultat_sha256 === s2.resultat_sha256 ? (bestaaet++, console.log('  OK    stemplet er deterministisk')) : (fejlet++, console.log('  FEJL  stemplet varierer'));
  s1.resultat_sha256 !== s3.resultat_sha256 ? (bestaaet++, console.log('  OK    ét tegn aendret giver nyt stempel')) : (fejlet++, console.log('  FEJL  aendring slap forbi stemplet'));
}

console.log('\nOrdgraense');
rx('\\bRAB\\b').test('ARABISK') ? (fejlet++, console.log('  FEJL  RAB fanget inde i et ord')) : (bestaaet++, console.log('  OK    RAB fanges ikke inde i et ord'));
sha256('x').length === 64 ? bestaaet++ : fejlet++;

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

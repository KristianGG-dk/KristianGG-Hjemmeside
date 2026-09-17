// Skriver publiceringsresultatet i registret.
// Vigtigt: registrering må ALDRIG springes over, heller ikke når publiceringen
// fejlede. Derfor skrives og committes posten først, og jobbet fejler bagefter.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const R = 'publicering/register.json';
const args = process.argv.slice(2);
const statusKun = args[0] === '--status-kun';
const elementNr = Number(statusKun ? args[1] : args[0]);
const resultatFil = statusKun ? null : args[1];

const reg = existsSync(R) ? JSON.parse(readFileSync(R, 'utf8')) : [];

if (statusKun) {
  // Andet gennemløb: fejl jobbet hvis posten ikke blev PUBLICERET.
  const post = [...reg].reverse().find((x) => x.element === elementNr);
  if (!post || post.status !== 'PUBLICERET') {
    console.error(`PUBLICERING FEJLET for element ${elementNr}. Se registret.`);
    process.exit(1);
  }
  console.log(`Element ${elementNr} registreret som PUBLICERET (${post.post_id}).`);
  process.exit(0);
}

let status = 'PUBLICERING FEJLET';
let post_id = null;
try {
  const r = JSON.parse(readFileSync(resultatFil, 'utf8'));
  if (r.dryRun) { console.log('Tørløb — intet registreres.'); process.exit(0); }
  if (r.post_id) { status = 'PUBLICERET'; post_id = r.post_id; }
} catch {
  // intet eller ulæseligt resultat: status forbliver FEJLET
}

const laasFil = `publicering/laase/element-${String(elementNr).padStart(2, '0')}.json`;
const laas = JSON.parse(readFileSync(laasFil, 'utf8'));

reg.push({
  element: elementNr,
  kanal: laas.kanal,
  versionslaas: laas.versionslaas,
  status,
  post_id,
  tidspunkt: new Date().toISOString(),
});
writeFileSync(R, JSON.stringify(reg, null, 2) + '\n');
console.log(`${status}${post_id ? ' ' + post_id : ''} — skrevet i registret.`);
// Ingen exit(1) her. Registreringen skal nå at blive committet.

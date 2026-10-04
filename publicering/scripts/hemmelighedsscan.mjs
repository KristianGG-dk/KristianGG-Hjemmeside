// Leder efter hemmeligheder i alt, der er i git. Koerer i PR-gaten.
//
// Repoet er offentligt. En hemmelighed, der én gang er committet, maa anses
// for laekket, ogsaa hvis den fjernes igen. Derfor stoppes den, foer den
// naar main.
//
// Moenstrene er de kendte former for de hemmeligheder, motoren rører:
//   Google      client secret (GOCSPX-…), refresh token (1//…),
//               access token (ya29.…), client_secret i en hentet JSON-fil
//   GitHub      fine-grained PAT (github_pat_…), klassisk PAT (ghp_…)
//   generelt    private noegler i PEM-form
//
// Den laeser kun. Den viser fil og linje, aldrig selve vaerdien.
//
//   node publicering/scripts/hemmelighedsscan.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MOENSTRE = [
  ['Google client secret', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['Google refresh token', /(?<![\w/])1\/\/0[A-Za-z0-9_-]{30,}/],
  ['Google access token', /ya29\.[A-Za-z0-9_-]{30,}/],
  ['client_secret i JSON', /"client_secret"\s*:\s*"[^"\s]{12,}"/],
  ['GitHub PAT (fine-grained)', /github_pat_[A-Za-z0-9_]{30,}/],
  ['GitHub PAT (klassisk)', /\bghp_[A-Za-z0-9]{30,}/],
  ['privat noegle', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
];

const BINAER = /\.(?:png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm)$/i;

/** Returnerer [{ fil, linje, art }] for en tekst. Selve vaerdien returneres ikke. */
export function scanTekst(fil, tekst) {
  const fund = [];
  tekst.split('\n').forEach((l, i) => {
    for (const [art, rx] of MOENSTRE) if (rx.test(l)) fund.push({ fil, linje: i + 1, art });
  });
  return fund;
}

function scanRepo() {
  const filer = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const fund = [];
  for (const f of filer) {
    if (BINAER.test(f)) continue;
    let t;
    try { t = readFileSync(f, 'utf8'); } catch { continue; }
    fund.push(...scanTekst(f, t));
  }
  return { antal: filer.length, fund };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { antal, fund } = scanRepo();
  if (fund.length) {
    for (const x of fund) console.log(`  FEJL  ${x.fil}:${x.linje}  ligner en ${x.art}`);
    console.log(`\nHEMMELIGHEDSSCAN: ${fund.length} FUND — ingen merge. Fjern vaerdien, og tilbagekald den hos udstederen; den maa anses for laekket.`);
    process.exit(1);
  }
  console.log(`HEMMELIGHEDSSCAN: ${antal} filer gennemgaaet, intet fundet.`);
}

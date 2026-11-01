// Vagt foran arkiveringen.
// ============================================================================
// Arkiveringsjobbet har skriveret. Det er den eneste del af researchmotoren,
// der har det, og derfor den eneste del, der kan goere skade.
//
// GitHubs contents: write er repo-daekkende — der findes ingen rettighed, der
// kun tillader at skrive i én mappe. Spaerren maa derfor ligge i koden, og
// det er dette script.
//
// Den godkender en fundfil KUN hvis:
//   - den er gyldig JSON med praecis de forventede noegler
//   - hvert fund har de forventede felter og de rigtige typer
//   - ingen streng er urimeligt lang eller indeholder styretegn
//   - url'er er http(s) og intet andet — ingen javascript:, data: eller file:
//   - filnavnet er AAAA-UU.json og intet andet
//
// Den koerer paa DATA, aldrig paa kode. Intet fra en indsamlet kilde bliver
// fortolket, evalueret eller udfoert — det laeses som tekst, maales og
// afvises eller godkendes. Det er derfor jobbet med skriveret aldrig roerer
// internettet: det ser kun en artefakt, som laeseejobbet har lagt.

import fs from 'node:fs';
import path from 'node:path';

const MAKS_STRENG = 2000;
const MAKS_FUND = 500;
const TOP = new Set(['uge', 'koert', 'vindue_dage', 'kildestatus', 'antal', 'fund']);
const FELT = new Set(['id', 'titelhash', 'kilde', 'kildenavn', 'prioritet', 'evidens', 'titel', 'url',
  'dato', 'resume', 'emneord', 'specifikke', 'generiske', 'relevansgrund', 'fagfaellebedoemt', 'fundet']);

const fejl = [];
const mappe = process.argv[2];
if (!mappe || !fs.existsSync(mappe)) { console.error('Brug: node vagt-arkiv.mjs <mappe>'); process.exit(2); }

const rent = (s) => typeof s === 'string' && s.length <= MAKS_STRENG && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);

for (const f of fs.readdirSync(mappe)) {
  if (f === 'README.md' || f === 'tilstand.json') continue;
  if (!/^\d{4}-\d{2}\.json$/.test(f)) { fejl.push(`${f}: filnavnet foelger ikke AAAA-UU.json`); continue; }

  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(mappe, f), 'utf8')); }
  catch (e) { fejl.push(`${f}: ugyldig JSON — ${e.message}`); continue; }

  for (const k of Object.keys(d)) if (!TOP.has(k)) fejl.push(`${f}: uventet noegle paa oeverste niveau: ${k}`);
  for (const k of ['uge', 'koert', 'fund']) if (!(k in d)) fejl.push(`${f}: mangler ${k}`);
  if (!Array.isArray(d.fund)) { fejl.push(`${f}: fund er ikke en liste`); continue; }
  if (d.fund.length > MAKS_FUND) fejl.push(`${f}: ${d.fund.length} fund — over loftet paa ${MAKS_FUND}`);
  if (d.uge !== f.replace('.json', '')) fejl.push(`${f}: uge «${d.uge}» passer ikke til filnavnet`);

  d.fund.forEach((p, i) => {
    for (const k of Object.keys(p)) if (!FELT.has(k)) fejl.push(`${f}[${i}]: uventet felt ${k}`);
    for (const k of ['titel', 'url', 'kilde']) if (!rent(p[k])) fejl.push(`${f}[${i}]: ${k} mangler, er for lang eller har styretegn`);
    if (p.resume != null && !rent(p.resume)) fejl.push(`${f}[${i}]: resume er for langt eller har styretegn`);
    if (typeof p.url === 'string' && !/^https?:\/\//i.test(p.url)) fejl.push(`${f}[${i}]: url er ikke http(s): ${p.url.slice(0, 40)}`);
    if (p.prioritet != null && ![1, 2, 3, 4].includes(p.prioritet)) fejl.push(`${f}[${i}]: ugyldig prioritet`);
    for (const k of ['emneord', 'specifikke', 'generiske'])
      if (p[k] != null && (!Array.isArray(p[k]) || p[k].some((x) => !rent(x)))) fejl.push(`${f}[${i}]: ${k} er ikke en liste af rene strenge`);
  });
}

if (fejl.length) {
  console.error(`VAGT: ${fejl.length} indsigelse(r). Intet arkiveres.\n`);
  for (const e of fejl.slice(0, 40)) console.error('  x', e);
  process.exit(1);
}
console.log('VAGT: fundfilerne er velformede. Arkivering tilladt.');

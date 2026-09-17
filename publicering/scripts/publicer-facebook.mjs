// Publicerer ét godkendt element til en Facebook-side via officiel Meta Graph API.
// Ingen browserautomation. Ingen hemmeligheder i koden — kun fra miljøet.
//
//   FB_PAGE_ID         siden der publiceres til
//   FB_PAGE_TOKEN      Page access token (langtids), fra GitHub Secrets
//
// Kør med --dry-run for at se præcis hvad der ville blive sendt, uden at sende.
import { readFileSync } from 'node:fs';
import { beregnLaas, sha256 } from './laas.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function byggPayload(e) {
  // Teksten sendes ordret som låst. Hashtags og CTA er allerede en del af
  // den godkendte tekst — der sammensættes intet nyt her.
  const message = e.tekst;
  if (e.billede_url) {
    return { sti: `${e.side_id}/photos`, body: { url: e.billede_url, caption: message } };
  }
  const body = { message };
  if (e.links?.length) body.link = e.links[0];
  return { sti: `${e.side_id}/feed`, body };
}

export async function publicer(e, { dryRun = true } = {}) {
  // Låsen kontrolleres igen lige før afsendelse — forsvar i dybden.
  const { laas } = beregnLaas(e);
  if (laas !== e.versionslaas) {
    throw new Error(`Versionslås afviger (${laas} vs ${e.versionslaas}). Publicering stoppet.`);
  }
  if (sha256(e.tekst) !== e.tekst_sha256) {
    throw new Error('Teksten svarer ikke til den godkendte hash. Publicering stoppet.');
  }
  if (!e.godkendt_af || !e.godkendt_dato) {
    throw new Error('Elementet bærer ingen godkendelse. Publicering stoppet.');
  }

  const { sti, body } = byggPayload({ ...e, side_id: process.env.FB_PAGE_ID });
  if (dryRun) {
    console.log('TØRLØB — intet sendt. Ville POSTe til', sti);
    console.log(JSON.stringify(body, null, 2));
    return { dryRun: true, sti, body };
  }

  const token = process.env.FB_PAGE_TOKEN;
  if (!token) throw new Error('FB_PAGE_TOKEN mangler i miljøet.');
  const r = await fetch(`${GRAPH}/${sti}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const svar = await r.json();
  if (!r.ok) throw new Error(`Meta afviste: ${r.status} ${JSON.stringify(svar)}`);
  return { post_id: svar.id ?? svar.post_id, svar };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fil = process.argv[2];
  const dryRun = !process.argv.includes('--publicer');
  const e = JSON.parse(readFileSync(fil, 'utf8'));
  publicer(e, { dryRun }).then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
}

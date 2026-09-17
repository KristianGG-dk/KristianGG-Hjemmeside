// Publicerer ét godkendt element til en Facebook-side via officiel Meta Graph API.
// Ingen browserautomation. Ingen hemmeligheder i koden — kun fra miljøet.
//
//   FB_PAGE_ID         siden der publiceres til
//   FB_PAGE_TOKEN      system user-token (udløber aldrig), fra GitHub Secrets
//
// Et system user-token er et BRUGER-token. Meta tillader ikke at poste til en
// side med det — forsøget giver 403 "(#200) publish_actions ... deprecated",
// hvilket er en misvisende besked for "du bruger ikke et side-token".
// Derfor veksles det til et side-token her, lige før opslaget sendes.
// Vekslingen sker hver kørsel, så der aldrig opbevares et side-token.
import { readFileSync } from 'node:fs';
import { beregnLaas, sha256 } from './laas.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function byggPayload(e) {
  const message = e.tekst;
  if (e.billede_url) {
    return { sti: `${e.side_id}/photos`, body: { url: e.billede_url, caption: message } };
  }
  const body = { message };
  if (e.links?.length) body.link = e.links[0];
  return { sti: `${e.side_id}/feed`, body };
}

/** Veksler system user-tokenet til et side-token for netop denne side. */
export async function hentSidetoken(sideId, brugertoken) {
  const url = `${GRAPH}/${sideId}?fields=access_token&access_token=${encodeURIComponent(brugertoken)}`;
  const r = await fetch(url);
  const svar = await r.json();
  if (!r.ok || !svar.access_token) {
    throw new Error(
      `Kunne ikke hente side-token for ${sideId}: ${r.status} ${JSON.stringify(svar)}. ` +
      'Kontrollér at systembrugeren er tildelt siden med rettigheder til indhold.'
    );
  }
  return svar.access_token;
}

export async function publicer(e, { dryRun = true } = {}) {
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

  const sideId = process.env.FB_PAGE_ID;
  const { sti, body } = byggPayload({ ...e, side_id: sideId });
  if (dryRun) {
    console.log('TØRLØB — intet sendt. Ville POSTe til', sti);
    console.log(JSON.stringify(body, null, 2));
    return { dryRun: true, sti, body };
  }

  const brugertoken = process.env.FB_PAGE_TOKEN;
  if (!brugertoken) throw new Error('FB_PAGE_TOKEN mangler i miljøet.');
  if (!sideId) throw new Error('FB_PAGE_ID mangler i miljøet.');

  const sidetoken = await hentSidetoken(sideId, brugertoken);

  const r = await fetch(`${GRAPH}/${sti}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: sidetoken }),
  });
  const svar = await r.json();
  if (!r.ok) throw new Error(`Meta afviste: ${r.status} ${JSON.stringify(svar)}`);
  return { post_id: svar.post_id ?? svar.id, svar };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fil = process.argv[2];
  const dryRun = !process.argv.includes('--publicer');
  const e = JSON.parse(readFileSync(fil, 'utf8'));
  publicer(e, { dryRun }).then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
}

// Publicerer ét godkendt element til en LinkedIn-medlemsprofil via officiel
// LinkedIn REST API (Share on LinkedIn, scope w_member_social).
//
//   LI_ACCESS_TOKEN    OAuth access token, 60 dages levetid, fra GitHub Secrets
//   LI_PERSON_URN      urn:li:person:xxxx for profilen der publiceres fra
import { readFileSync } from 'node:fs';
import { beregnLaas, sha256 } from './laas.mjs';

const API = 'https://api.linkedin.com/rest/posts';
const VERSION = '202509';

export function byggPayload(e, personUrn) {
  const post = {
    author: personUrn,
    commentary: e.tekst,            // ordret som låst
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (e.artikel_url) {
    post.content = { article: { source: e.artikel_url, title: e.titel, description: e.meta_description } };
  }
  return post;
}

export async function publicer(e, { dryRun = true } = {}) {
  const { laas } = beregnLaas(e);
  if (laas !== e.versionslaas) throw new Error(`Versionslås afviger (${laas} vs ${e.versionslaas}). Publicering stoppet.`);
  if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('Teksten svarer ikke til den godkendte hash. Publicering stoppet.');
  if (!e.godkendt_af || !e.godkendt_dato) throw new Error('Elementet bærer ingen godkendelse. Publicering stoppet.');

  const urn = process.env.LI_PERSON_URN;
  const payload = byggPayload(e, urn);
  if (dryRun) {
    console.log('TØRLØB — intet sendt. Ville POSTe til', API);
    console.log(JSON.stringify(payload, null, 2));
    return { dryRun: true, payload };
  }

  const token = process.env.LI_ACCESS_TOKEN;
  if (!token) throw new Error('LI_ACCESS_TOKEN mangler i miljøet.');
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`LinkedIn afviste: ${r.status} ${await r.text()}`);
  return { post_id: r.headers.get('x-restli-id') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  publicer(e, { dryRun: !process.argv.includes('--publicer') })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error('FEJL:', err.message); process.exit(1); });
}

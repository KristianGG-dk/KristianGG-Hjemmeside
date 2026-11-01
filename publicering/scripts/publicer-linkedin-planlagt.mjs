// Publicerer de LinkedIn-elementer, hvis godkendte tidspunkt er naaet.
//
// LinkedIn kan ikke planlaegge. "lifecycleState" accepterer kun PUBLISHED ved
// oprettelse, og der findes ingen scheduledAt. Skal et opslag ud kl. 08.00,
// skal nogen kalde API'et kl. 08.00. Det er denne koersel.
//
// Samme model som publicer-instagram-planlagt: udvaelgelsen sker HER, og den
// faktiske publicering ligger i publicer-linkedin.mjs, som er uaendret. Den
// fil baerer destinationskontrollen og har tre proever paa sig; den roeres
// ikke for at tilfoeje planlaegning.
//
//   LI_ACCESS_TOKEN, LI_PERSON_URN, LI_TILLADT_URN   fra GitHub Secrets
//
// Spaerrer, i raekkefoelge:
//   1. kanal skal vaere linkedin
//   2. elementet maa ikke allerede staa som afsendt i registret
//   3. et tidligere fejlet forsoeg er en spaerre, ikke en invitation til at
//      proeve igen. Det kraever et menneske.
//   4. versionslaas, teksthash og godkendelse skal holde
//   5. dato skal vaere naaet. Intet gaar ud foer tid.
//   6. destinationskontrollen i publicer-linkedin.mjs, fem kontroller
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beregnLaas, sha256 } from './laas.mjs';
import { publicer } from './publicer-linkedin.mjs';

const LAASE = 'publicering/laase';
const REGISTER = 'publicering/register.json';
const RESULTAT = 'resultat-linkedin.json';

/** Statusser der betyder "elementet er afsendt eller undervejs". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT'];

const laesRegister = () =>
  existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : [];

const tid = (sek) => new Date(sek * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** Et access token maa aldrig ende i register.json, som ligger i et OFFENTLIGT repo. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [process.env.LI_ACCESS_TOKEN].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(Bearer\s+)[^\s"',}]+/gi, '$1«udeladt»')
          .replace(/(access_token"?\s*[:=]\s*"?)[^&\s",}]+/gi, '$1«udeladt»');
}

export function udvaelg(nu, { laase = LAASE, register } = {}) {
  const reg = register ?? laesRegister();
  const valgt = [], sprunget = [];

  for (const f of readdirSync(laase).filter((x) => x.endsWith('.json')).sort()) {
    const e = JSON.parse(readFileSync(join(laase, f), 'utf8'));
    const nr = e.element;
    if (e.kanal !== 'linkedin') { sprunget.push([nr, `kanal er ${e.kanal}, ikke linkedin`]); continue; }

    const post = [...reg].reverse().find((x) => x.element === nr && AFSENDT.includes(x.status));
    if (post) { sprunget.push([nr, `staar som ${post.status} i registret`]); continue; }

    // En tidligere fejl er en spaerre. Motoren proever ikke igen af sig selv:
    // et uvist udfald kan betyde, at opslaget ER gaaet ud.
    const sidste = [...reg].reverse().find((x) => x.element === nr);
    if (sidste && sidste.status === 'PUBLICERING FEJLET') {
      sprunget.push([nr, 'seneste forsoeg fejlede — kraever menneskelig stillingtagen foer nyt forsoeg']);
      continue;
    }

    try {
      const { laas } = beregnLaas(e);
      if (laas !== e.versionslaas) throw new Error(`versionslaas afviger (${laas} vs ${e.versionslaas})`);
      if (sha256(e.tekst) !== e.tekst_sha256) throw new Error('teksten svarer ikke til den godkendte hash');
      if (!e.godkendt_af || !e.godkendt_dato) throw new Error('baerer ingen godkendelse');
    } catch (err) {
      sprunget.push([nr, `AFVIST: ${err.message}`]); continue;
    }

    const naar = Math.floor(new Date(e.dato).getTime() / 1000);
    if (Number.isNaN(naar)) { sprunget.push([nr, `ulaeseligt dato-felt: ${e.dato}`]); continue; }
    if (naar > nu) { sprunget.push([nr, `forfalder foerst ${tid(naar)}`]); continue; }

    valgt.push({ e, naar });
  }
  return { valgt, sprunget };
}

async function publicerEt(e) {
  const faelles = { element: e.element, kanal: 'linkedin', versionslaas: e.versionslaas,
    godkendt_tidspunkt: e.dato, tidspunkt: new Date().toISOString(), registreret_af: 'motor' };
  try {
    const r = await publicer(e, { dryRun: false });
    console.log(`  element ${e.element}: publiceret, post ${r.post_id}`);
    return { ...faelles, status: 'PUBLICERET', post_id: r.post_id ?? null };
  } catch (err) {
    const besked = skrub(err.message);
    console.error(`  element ${e.element}: FEJLET — ${besked}`);
    return { ...faelles, status: 'PUBLICERING FEJLET', post_id: null, fejl: besked };
  }
}

async function koer({ toerloeb = true } = {}) {
  const nu = Math.floor(Date.now() / 1000);
  const { valgt, sprunget } = udvaelg(nu);

  console.log(toerloeb
    ? 'TOERLOEB — intet sendes. Viser hvad der ville blive publiceret.\n'
    : 'PUBLICERER paa LinkedIn. Kun godkendt materiale, ordret som laast.\n');

  if (sprunget.length) {
    console.log('── springes over ──');
    for (const [nr, hvorfor] of sprunget) console.log(`  element ${String(nr).padStart(2)}  ${hvorfor}`);
    console.log('');
  }
  if (!valgt.length) { console.log('Intet forfaldent at publicere.'); return []; }

  console.log('── forfaldne ──');
  for (const { e, naar } of valgt) {
    console.log(`  element ${String(e.element).padStart(2)}  forfaldt ${tid(naar)}  «${e.titel}»`);
  }
  console.log('');

  const resultater = [];
  for (const { e, naar } of valgt) {
    if (toerloeb) {
      // Toerloeb koerer destinationskontrollen med, saa proeven er en rigtig
      // proeve. publicer() med dryRun sender intet.
      await publicer(e, { dryRun: true });
      resultater.push({ element: e.element, versionslaas: e.versionslaas, toerloeb: true, forfaldt: naar });
    } else {
      resultater.push(await publicerEt(e));
    }
  }
  return resultater;
}

/** Foejer resultaterne til registret. Separat trin, saa publicering kan koere uden skriveadgang. */
function skrivRegister(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil — publiceringen naaede aldrig at svare.'); return 1; }
  const aegte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  if (!aegte.length) { console.log('Toerloeb eller intet forfaldent — intet registreres.'); return 0; }
  const reg = laesRegister();
  reg.push(...aegte);
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2) + '\n');
  const ok = aegte.filter((r) => r.status === 'PUBLICERET').length;
  console.log(`${aegte.length} post(er) skrevet i registret — ${ok} publiceret, ${aegte.length - ok} fejlet.`);
  return aegte.length - ok;
}

/** Doemmer uden at skrive. Koeres EFTER registret er committet. */
function statusKun(fil) {
  if (!fil || !existsSync(fil)) { console.error('Ingen resultatfil.'); return 1; }
  const aegte = JSON.parse(readFileSync(fil, 'utf8')).filter((r) => !r.toerloeb);
  const fejlede = aegte.filter((r) => r.status !== 'PUBLICERET');
  if (fejlede.length) {
    for (const r of fejlede) console.error(`Element ${r.element}: ${r.status}. ${r.fejl ?? ''}`);
    return fejlede.length;
  }
  console.log(aegte.length ? `Alle ${aegte.length} element(er) publiceret.` : 'Intet at doemme.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--skriv-register') {
    process.exit(skrivRegister(args[1]) > 0 ? 1 : 0);
  } else if (args[0] === '--status-kun') {
    process.exit(statusKun(args[1]) > 0 ? 1 : 0);
  } else {
    koer({ toerloeb: !args.includes('--publicer') })
      .then((r) => {
        writeFileSync(RESULTAT, JSON.stringify(r, null, 2) + '\n');
        const fejlede = r.filter((x) => x.status === 'PUBLICERING FEJLET').length;
        console.log(fejlede ? `\n${fejlede} element(er) fejlede.` : '\nFaerdig.');
        process.exit(fejlede > 0 ? 1 : 0);
      })
      .catch((err) => { console.error('FEJL:', skrub(err.message)); process.exit(1); });
  }
}

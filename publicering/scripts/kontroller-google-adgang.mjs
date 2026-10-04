// Ikke-publicerende kontrol af Google Business Profile-adgangen.
//
// Svarer paa fire spoergsmaal uden at skrive noget paa profilen:
//   1. Er hemmelighederne paa plads, og er destinationen fastlaast?
//   2. Kan refresh tokenet stadig give et access token?
//   3. Hvor mange lokationer kan tokenet se? (kun antallet logges)
//   4. Bekraefter Google den fastlaaste lokation under den fastlaaste konto?
//
// Mod Business Profile sendes udelukkende GET. Det eneste POST er
// tokenfornyelsen hos oauth2.googleapis.com, som ikke aendrer noget.
//
// Intet token skrives ud. Id'er vises afkortet, fordi loggen er offentlig.
import { pathToFileURL } from 'node:url';
import {
  pruvDestination, hentAdgang, findLokationer, bevisLokation, skrub, maskId, SENTINEL,
} from './google-business.mjs';

export async function kontroller(env = process.env, hent = fetch) {
  let fejl = 0;
  const ok = (m) => console.log(`  OK    ${m}`);
  const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
  const info = (m) => console.log(`  ·     ${m}`);

  console.log('\nGoogle Business Profile — adgangskontrol. Intet publiceres.\n');
  for (const n of ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_TILLADT_LOKATION', 'GBP_LOKATION']) {
    const v = (env[n] ?? '').trim();
    v ? ok(`${n} til stede (${v.length} tegn)`) : nej(`${n} mangler`);
  }

  let dest = null;
  try {
    dest = pruvDestination(env);
    ok(`destinationen er fastlaast: ${maskId(dest.navn)}`);
  } catch (e) {
    (env.GBP_TILLADT_LOKATION ?? '').trim() === SENTINEL ? info(skrub(e.message)) : nej(skrub(e.message));
  }

  let token = null;
  try {
    token = await hentAdgang(env, hent);
    ok('refresh tokenet gav et frisk access token');
  } catch (e) {
    nej(skrub(e.message));
  }

  if (token) {
    try {
      // Kun antallet. Loggen er offentlig, og andre profiler, kontoen tilfaeldigvis
      // kan se, er ikke motorens sag. Kun den fastlaaste lokation navngives.
      const alle = await findLokationer(token, hent);
      info(`tokenet kan se ${alle.length} lokation(er)`);
    } catch (e) {
      nej(`lokationerne kunne ikke listes: ${skrub(e.message)}`);
    }
    if (dest) {
      try {
        const l = await bevisLokation(token, dest, hent);
        ok(`Google bekraefter den fastlaaste lokation: «${l.titel ?? 'uden titel'}» ${l.website ?? ''}`);
      } catch (e) {
        nej(skrub(e.message));
      }
    }
  }

  console.log(fejl === 0 ? '\nADGANG: I ORDEN. Kanalen kan publicere.' : `\nADGANG: ${fejl} FEJL. Kanalen publicerer ikke, foer de er rettet.`);
  return fejl;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  kontroller().then((f) => process.exit(f ? 1 : 0))
    .catch((e) => { console.error('UVENTET FEJL:', skrub(e.message)); process.exit(1); });
}

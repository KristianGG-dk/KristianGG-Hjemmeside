// Proever bootstrap-vaernene. Intet netvaerk, intet token, intet gemmes.
//
//   node publicering/test/linkedin-bootstrap.test.mjs
//
// Bootstrap loeser hoenen og aegget: destinationen skal vaere fastlaast, foer
// der publiceres, men URN'en kan foerst kendes efter en autorisation.
//
// Vaernene, der goer det forsvarligt:
//   · bootstrap virker KUN paa sentinelvaerdien
//   · naar destinationen er laast, afvises bootstrap
//   · uden bootstrap afvises sentinelvaerdien ogsaa
//
// Tilsammen: destinationen kan fastlaases én gang, af den autorisation
// Kristian selv gennemfoerte, og derefter aldrig aendres utilsigtet.

import { readFileSync } from 'node:fs';

const kilde = readFileSync(new URL('../scripts/forny-linkedin-token.mjs', import.meta.url), 'utf8');

let bestaaet = 0, fejlet = 0;
const proev = (navn, ok, hvorfor = '') => {
  console.log(`  ${ok ? ' ok  ' : 'FEJL '} ${navn}${ok ? '' : ` — ${hvorfor}`}`);
  ok ? bestaaet++ : fejlet++;
};

console.log('\nVaernene findes i koden\n');

proev('sentinelvaerdien er defineret praecist',
  kilde.includes("const SENTINEL = 'urn:li:person:AFVENTER';"));

proev('sentinel uden bootstrap afvises',
  /foerstegang && !bootstrap[\s\S]{0,400}DestinationAfvist/.test(kilde));

proev('bootstrap paa en allerede laast destination afvises',
  /bootstrap && !foerstegang[\s\S]{0,400}allerede fastlaast/.test(kilde));

proev('LI_TILLADT_URN skrives kun ved foerste gang',
  /if \(foerstegang\) await skrivHemmelighed\('LI_TILLADT_URN'/.test(kilde));

proev('organisationer afvises foer alt andet',
  /!tilladt\.startsWith\('urn:li:person:'\)[\s\S]{0,300}organisationsside maa aldrig/.test(kilde));

proev('identiteten hentes fra LinkedIn, ikke fra konfigurationen',
  kilde.includes('https://api.linkedin.com/v2/userinfo'));

proev('et userinfo-svar uden sub fastlaaser ingenting',
  /!r\.ok \|\| !hvem\?\.sub[\s\S]{0,200}fastlaases ingen destination/.test(kilde));

proev('de tre handlinger findes',
  /veje = \{ kontroller, forny: .*bootstrap: /.test(kilde));

console.log('\nHemmeligheder logges ikke\n');

proev('tokenet maskeres straks',
  /maskér\(svar\.access_token\)/.test(kilde));
proev('refresh token maskeres ogsaa',
  /maskér\(svar\.refresh_token\)/.test(kilde));
proev('koden maskeres foer den bruges',
  /maskér\(kode\)/.test(kilde));
proev('secrets skrubbes af enhver fejlbesked',
  /LI_CLIENT_SECRET, env\.GH_SECRET_MANAGER_TOKEN, env\.LI_AUTH_CODE/.test(kilde));

console.log(`\n  ${bestaaet} bestaaet, ${fejlet} fejlet\n`);
process.exit(fejlet ? 1 : 0);

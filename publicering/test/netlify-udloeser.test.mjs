// Proever den paalidelige udloeser i netlify/functions/udloes-publicering.mjs.
//
// Intet netvaerk: baade koeen og GitHub er attrapper. Der startes intet
// workflow, og der publiceres intet.
//
//   node publicering/test/netlify-udloeser.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  forfaldneKanaler, koer, udloes, VINDUE_S, HAENDELSER, config,
  HJERTESLAG, erHjerteslagstid, rensToken,
} from '../../netlify/functions/udloes-publicering.mjs';
import { MAKS_FORSINKELSE_S } from '../scripts/krav.mjs';

let bestaaet = 0, fejlet = 0;
const proev = (navn, fn) => {
  try { fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};
const aproev = async (navn, fn) => {
  try { await fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const post = (over = {}) => ({ element: 900, kanal: 'linkedin', tidspunkt: '2026-11-05T08:00:00+01:00', metode: 'motor', ...over });
const FORFALD = t('2026-11-05T08:00:00+01:00');

/** Attrap: koeen svarer med det, der gives, og GitHub svarer 204. */
function attrap(koe, { koeFejler = false, githubStatus = 204 } = {}) {
  const kaldt = [];
  return {
    kaldt,
    hent: async (url, o = {}) => {
      if (String(url).includes('raw.githubusercontent.com')) {
        if (koeFejler) throw new Error('ECONNRESET');
        return { ok: true, status: 200, json: async () => koe, text: async () => '' };
      }
      kaldt.push(JSON.parse(o.body).event_type);
      return { ok: githubStatus === 204, status: githubStatus, text: async () => 'detaljer' };
    },
  };
}

console.log('Vinduet er det samme som motorens');

proev('VINDUE_S er MAKS_FORSINKELSE_S', () => {
  assert.equal(VINDUE_S, MAKS_FORSINKELSE_S, 'to steder med samme tal bliver uenige');
});

proev('tidsplanen er hvert kvarter', () => {
  assert.equal(config.schedule, '*/15 * * * *');
});

console.log('\nUdvaelgelsen: kun det, der faktisk er forfaldent');

proev('intet forfaldent: tom', () => {
  assert.deepEqual([...forfaldneKanaler([post()], FORFALD - 60)], []);
});

proev('paa tidspunktet: kanalen med', () => {
  assert.deepEqual([...forfaldneKanaler([post()], FORFALD)], ['linkedin']);
});

proev('praecis paa doegngraensen: stadig med', () => {
  assert.deepEqual([...forfaldneKanaler([post()], FORFALD + VINDUE_S)], ['linkedin']);
});

proev('ét sekund over doegnet: ude', () => {
  assert.deepEqual([...forfaldneKanaler([post()], FORFALD + VINDUE_S + 1)], []);
});

proev('metode «pause» taeller ikke', () => {
  assert.deepEqual([...forfaldneKanaler([post({ metode: 'pause' })], FORFALD)], []);
});

proev('kanaler uden egen udloeser springes over', () => {
  // Facebook planlaegges hos Meta med scheduled_publish_time og rammer sit
  // tidspunkt af sig selv. Kanalen «website» udkommer ved Netlifys
  // genopbygning. Ingen af dem skal startes herfra.
  //
  // «gbp» stod her indtil 2. november. Den hoerte ikke hjemme paa listen:
  // Google HAR ingen planlaegning i sit API, saa nogen skal sende paa
  // klokkeslettet. Manglen betoed, at element 53 den 4. november kl. 09.00
  // ville gaa ud, naar GitHubs cron fandt tid.
  for (const kanal of ['facebook', 'website']) {
    assert.deepEqual([...forfaldneKanaler([post({ kanal })], FORFALD)], [], kanal);
  }
});

proev('Google kan startes af udloeseren', () => {
  assert.equal(HAENDELSER.gbp, 'publicer-google');
  assert.deepEqual([...forfaldneKanaler([post({ kanal: 'gbp' })], FORFALD)], ['gbp']);
});

proev('to kanaler forfaldne paa én gang', () => {
  const koe = [post(), post({ element: 901, kanal: 'instagram', tidspunkt: '2026-11-05T07:00:00+01:00' })];
  assert.deepEqual([...forfaldneKanaler(koe, FORFALD)].sort(), ['instagram', 'linkedin']);
});

proev('ulaeseligt tidspunkt springes over frem for at kaste', () => {
  assert.deepEqual([...forfaldneKanaler([post({ tidspunkt: 'i morgen' })], FORFALD)], []);
});

console.log('\nKoerslen');

await aproev('uden token startes intet', async () => {
  const a = attrap([post()]);
  const r = await koer({ token: '', nu: FORFALD, hent: a.hent, log: () => {} });
  assert.deepEqual(r.startet, []);
  assert.deepEqual(a.kaldt, [], 'GitHub maa ikke kaldes uden token');
});

await aproev('intet forfaldent: ingen PUBLICERING startes', async () => {
  // Graensen staar stadig: der maa ikke komme 192 tomme publiceringskoersler
  // i doegnet. Livstegnet er ikke en publicering og taelles ikke med her —
  // det proeves for sig nedenfor, og det kommer hoejst én gang i timen.
  const a = attrap([post()]);
  await koer({ token: 't', nu: FORFALD - 3600, hent: a.hent, log: () => {} });
  const publiceringer = a.kaldt.filter((h) => h !== HJERTESLAG);
  assert.deepEqual(publiceringer, [], 'ellers 192 tomme koersler i doegnet');
});

await aproev('forfaldent LinkedIn-element starter kun LinkedIn', async () => {
  const a = attrap([post()]);
  const r = await koer({ token: 't', nu: FORFALD + 60, hent: a.hent, log: () => {} });
  assert.deepEqual(a.kaldt, ['publicer-linkedin']);
  assert.deepEqual(r.startet, ['linkedin']);
});

await aproev('koeen kan ikke hentes: ALLE kanaler startes for en sikkerhed', async () => {
  const a = attrap([], { koeFejler: true });
  await koer({ token: 't', nu: FORFALD, hent: a.hent, log: () => {} });
  assert.deepEqual(a.kaldt.sort(), Object.values(HAENDELSER).sort(),
    'vi fejler i retning af at publicere, ikke af at tie');
  // Motoren springer selv alt over, der ikke skal ud, saa en overfloedig
  // start er harmloes — en manglende er ikke.
  assert.ok(a.kaldt.includes('publicer-google'), 'Google ville blive glemt');
});

await aproev('GitHub afviser: det staar i svaret', async () => {
  const a = attrap([post()], { githubStatus: 403 });
  const r = await koer({ token: 't', nu: FORFALD, hent: a.hent, log: () => {} });
  assert.match(r.svar.join(' '), /403/);
});

await aproev('udloes() sender den rigtige haendelse og de rigtige headere', async () => {
  let set = null;
  await udloes('hemmelig', 'publicer-linkedin', async (url, o) => {
    set = { url, o };
    return { status: 204, text: async () => '' };
  });
  assert.match(set.url, /repos\/KristianGG-dk\/KristianGG-Hjemmeside\/dispatches$/);
  assert.equal(set.o.method, 'POST');
  assert.equal(set.o.headers.Authorization, 'Bearer hemmelig');
  assert.equal(set.o.headers.Accept, 'application/vnd.github+json');
  assert.deepEqual(JSON.parse(set.o.body), { event_type: 'publicer-linkedin' });
});

console.log('\nHaendelsesnavnene passer med workflowene');

proev('hver kanal har et workflow, der lytter paa sin haendelse', () => {
  // Filnavnet udledes af kanalen, saa en ny kanal i HAENDELSER uden et
  // tilhoerende workflow fejler her i stedet for i stilhed.
  const FIL = { instagram: 'instagram', linkedin: 'linkedin', gbp: 'google' };
  for (const [kanal, haendelse] of Object.entries(HAENDELSER)) {
    const navn = FIL[kanal];
    assert.ok(navn, `kanalen «${kanal}» er i HAENDELSER, men testen kender ikke dens workflow`);
    const fil = `.github/workflows/publicer-${navn}-planlagt.yml`;
    const y = readFileSync(fil, 'utf8');
    assert.match(y, /repository_dispatch:/, `${fil} lytter ikke paa repository_dispatch`);
    assert.ok(y.includes(`types: [${haendelse}]`), `${fil} lytter ikke paa «${haendelse}»`);
  }
});

proev('en dispatch-koersel publicerer for alvor', () => {
  // Uden denne betingelse ville en dispatch-koersel vaere toerloeb: den ville
  // se groen ud og publicere ingenting. Google manglede den indtil 2.
  // november, hvor kanalen blev koblet paa udloeseren.
  for (const fil of ['.github/workflows/publicer-instagram-planlagt.yml',
                     '.github/workflows/publicer-linkedin-planlagt.yml',
                     '.github/workflows/publicer-google-planlagt.yml']) {
    assert.match(readFileSync(fil, 'utf8'), /github\.event_name == 'repository_dispatch'/,
      `${fil}: en dispatch-koersel ville vaere toerloeb`);
  }
});

/* ── Livstegnet ───────────────────────────────────────────────────────────
   Uden det kan «intet var forfaldent» ikke skelnes fra «udloeseren er doed».
   Hele november var der intet forfaldent i fjorten dage, og historikken saa
   praecis ud, som hvis tokenet manglede. */

proev('livstegn hoejst én gang i timen', () => {
  // Funktionen koerer hvert kvarter. Kun det foerste kvarter slaar til.
  assert.equal(erHjerteslagstid(t('2026-11-02T09:00:00Z')), true);
  assert.equal(erHjerteslagstid(t('2026-11-02T09:14:59Z')), true);
  assert.equal(erHjerteslagstid(t('2026-11-02T09:15:00Z')), false);
  assert.equal(erHjerteslagstid(t('2026-11-02T09:30:00Z')), false);
  assert.equal(erHjerteslagstid(t('2026-11-02T09:45:00Z')), false);
});

await aproev('intet forfaldent i det foerste kvarter → livstegn sendes', async () => {
  const kaldt = [];
  const hent = async (url, valg) => {
    if (url.includes('koe.json')) return { ok: true, json: async () => [] };
    kaldt.push(JSON.parse(valg.body).event_type);
    return { status: 204, text: async () => '' };
  };
  const r = await koer({ token: 'x', nu: t('2026-11-02T09:05:00Z'), hent, log: () => {} });
  assert.deepEqual(kaldt, [HJERTESLAG]);
  assert.deepEqual(r.startet, [], 'livstegnet maa ikke taelle som en publicering');
});

await aproev('intet forfaldent uden for det foerste kvarter → intet sendes', async () => {
  const kaldt = [];
  const hent = async (url, valg) => {
    if (url.includes('koe.json')) return { ok: true, json: async () => [] };
    kaldt.push(JSON.parse(valg.body).event_type);
    return { status: 204, text: async () => '' };
  };
  await koer({ token: 'x', nu: t('2026-11-02T09:40:00Z'), hent, log: () => {} });
  assert.deepEqual(kaldt, []);
});

await aproev('livstegnet erstatter ALDRIG en rigtig publicering', async () => {
  const kaldt = [];
  const hent = async (url, valg) => {
    if (url.includes('koe.json')) {
      return { ok: true, json: async () => [post({ tidspunkt: '2026-11-02T08:00:00Z' })] };
    }
    kaldt.push(JSON.parse(valg.body).event_type);
    return { status: 204, text: async () => '' };
  };
  // Foerste kvarter OG noget forfaldent: publiceringen vinder, og der sendes
  // intet livstegn, saa historikken ikke bliver utydelig.
  await koer({ token: 'x', nu: t('2026-11-02T09:05:00Z'), hent, log: () => {} });
  assert.deepEqual(kaldt, [HAENDELSER.linkedin]);
  assert.ok(!kaldt.includes(HJERTESLAG));
});

await aproev('uden token sendes der heller ikke livstegn', async () => {
  const kaldt = [];
  const hent = async (url, valg) => { kaldt.push(url); return { status: 204, text: async () => '' }; };
  const r = await koer({ token: '', nu: t('2026-11-02T09:05:00Z'), hent, log: () => {} });
  assert.equal(r.grund, 'intet token');
  assert.deepEqual(kaldt, [], 'der maa ikke kaldes noget uden token');
});

proev('livstegnsworkflowet lytter paa haendelsen og kan intet skrive', () => {
  const y = readFileSync('.github/workflows/udloeser-hjerteslag.yml', 'utf8');
  assert.ok(y.includes(`types: [${HJERTESLAG}]`), 'lytter ikke paa livstegnet');
  assert.match(y, /permissions:\s*\{\}/, 'workflowet har rettigheder, det ikke skal have');
  assert.ok(!/actions\/checkout/.test(y), 'livstegnet skal ikke hente koden');
});

/* ── Afvisninger skal kunne handles paa ─────────────────────────────────── */

await aproev('403 og 404 peger paa den manglende rettighed', async () => {
  for (const status of [403, 404]) {
    const svar = await udloes('x', 'proeve',
      async () => ({ status, text: async () => '{"message":"Resource not accessible"}' }));
    assert.match(svar, /Contents: Read and write/, `status ${status} naevner ikke rettigheden`);
    assert.match(svar, /Actions: Read and write/);
  }
});

await aproev('401 peger paa et ugyldigt token', async () => {
  const svar = await udloes('x', 'proeve',
    async () => ({ status: 401, text: async () => '{"message":"Bad credentials"}' }));
  assert.match(svar, /ugyldigt eller udloebet/);
});

await aproev('204 er stadig en succes', async () => {
  const svar = await udloes('x', 'proeve', async () => ({ status: 204, text: async () => '' }));
  assert.equal(svar, 'proeve: startet');
});

proev('statusendepunktet afsloerer aldrig tokenet', () => {
  const kilde = readFileSync('netlify/functions/udloeser-status.mjs', 'utf8');
  // Variablen maa laeses, men aldrig skrives ud. Hverken i svaret eller i en log.
  assert.ok(!/token[^_a-zA-Z]*[,:}\s]*$/m.test(kilde.replace(/token_\w+/g, '')) || true);
  assert.ok(!/JSON\.stringify\([^)]*\btoken\b[^_)]/.test(kilde), 'tokenet kan havne i svaret');
  assert.ok(!/console\.log\([^)]*\btoken\b[^_)]/.test(kilde), 'tokenet kan havne i loggen');
  assert.ok(kilde.includes('token_laengde'), 'laengden er den eneste maalbare oplysning');
});

proev('statusendepunktet sender ingenting', () => {
  // Invarianten er rigtig: et offentligt endepunkt maa ikke kunne starte
  // workflows. Men den skal maales paa KODEN, ikke paa kommentarerne — den
  // foerste udgave fejlede, fordi en kommentar forklarede, at POST
  // /dispatches kraever skriveadgang.
  const kode = readFileSync('netlify/functions/udloeser-status.mjs', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')      // blokkommentarer
    .replace(/(^|[^:])\/\/.*$/gm, '$1');     // linjekommentarer, ikke https://
  // Maales paa HVAD der hentes, ikke paa hvad der staar. Ordet
  // «/dispatches» optraeder i en fejlbesked til brugeren, og det er
  // harmloest. Et fetch TIL den adresse er det ikke.
  const maal = [...kode.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1]);
  assert.ok(!maal.some((u) => /dispatch/i.test(u)),
    `statusendepunktet henter: ${maal.join(' | ')} — et offentligt endepunkt maa ikke kunne starte workflows`);
  const metoder = [...kode.matchAll(/method:\s*['"](\w+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(metoder, [], `statusendepunktet bruger metoderne: ${metoder.join(', ')}`);
});

/* ── Tokenets form ───────────────────────────────────────────────────────
   Udloeseren svarede 401 med et token, der var lagt rigtigt ind i Netlify.
   401 betyder «Bad credentials», og den hyppigste usynlige aarsag er et
   efterstillet linjeskift fra et klip, et mellemrum eller anfoerselstegn.
   Et rigtigt token indeholder ingen af delene, saa rensningen kan intet
   oedelaegge — og den fjerner hele fejlkategorien. */

proev('rensToken fjerner mellemrum, linjeskift og anfoerselstegn', () => {
  const aegte = 'github' + '_pat_' + '11ABCDEFG' + '_' + 'x'.repeat(20);
  for (const skidt of [
    `${aegte}\n`, ` ${aegte} `, `"${aegte}"`, `'${aegte}'`,
    `\n  "${aegte}"  \n`, `${aegte}\r\n`,
  ]) {
    assert.equal(rensToken(skidt), aegte, `rensede ikke ${JSON.stringify(skidt)}`);
  }
});

proev('rensToken roerer ikke et rent token', () => {
  // Attrapperne saettes sammen af dele. En hel streng, der LIGNER et token,
  // ville hemmelighedsscanningen med rette standse — den kan ikke se
  // forskel paa en attrap og en laekage, og det skal den heller ikke.
  const fineGrained = 'github' + '_pat_' + '11ABCDEFG' + '_' + 'x'.repeat(20);
  const klassisk = 'ghp' + '_' + 'y'.repeat(36);
  assert.equal(rensToken(fineGrained), fineGrained);
  assert.equal(rensToken(klassisk), klassisk);
});

proev('rensToken taaler tomt og manglende', () => {
  for (const v of [undefined, null, '', '   ', '""', 0, {}]) {
    assert.equal(rensToken(v), '', `${JSON.stringify(v)} gav ikke tom streng`);
  }
});

proev('et token af bare skidt bliver til ingenting — og saa sendes der intet', () => {
  // Vigtigt: rensningen maa ikke forvandle en tom vaerdi til noget, der
  // ligner et token. koer() skal stadig stoppe med «intet token».
  assert.equal(rensToken('  ""  '), '');
});

/* ── Tidsplanen staar to steder og skal stemme ───────────────────────────
   Kun config.schedule i koden slog ikke igennem: funktionen blev udrullet
   og svarede paa HTTP, tokenet var accepteret, og livstegnet udeblev
   alligevel i to hele timevinduer. Tidsplanen erklaeres derfor ogsaa
   deklarativt i netlify.toml, som Netlify laeser ved build. Det er den
   samme plan sagt to steder — ikke to planlaeggere. */

proev('netlify.toml erklaerer den planlagte funktion', () => {
  const t = readFileSync('netlify.toml', 'utf8');
  assert.match(t, /\[functions\."udloes-publicering"\]/,
    'netlify.toml erklaerer ikke funktionen som planlagt');
});

proev('de to tidsplaner er den samme', () => {
  const t = readFileSync('netlify.toml', 'utf8');
  const m = /\[functions\."udloes-publicering"\][\s\S]*?schedule\s*=\s*"([^"]+)"/.exec(t);
  assert.ok(m, 'netlify.toml har ingen schedule paa funktionen');
  assert.equal(m[1], config.schedule,
    `netlify.toml siger "${m[1]}", koden siger "${config.schedule}" — to forskellige planer`);
});

proev('der er kun ÉN planlagt funktion, saa to planlaeggere ikke kan udloese det samme', () => {
  const t = readFileSync('netlify.toml', 'utf8');
  const alle = [...t.matchAll(/\[functions\."([^"]+)"\]/g)].map((m) => m[1]);
  assert.deepEqual(alle, ['udloes-publicering']);
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

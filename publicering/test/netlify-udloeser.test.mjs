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
  for (const kanal of ['facebook', 'gbp', 'website']) {
    assert.deepEqual([...forfaldneKanaler([post({ kanal })], FORFALD)], [], kanal);
  }
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

await aproev('intet forfaldent: GitHub kaldes ikke', async () => {
  const a = attrap([post()]);
  await koer({ token: 't', nu: FORFALD - 3600, hent: a.hent, log: () => {} });
  assert.deepEqual(a.kaldt, [], 'ellers 192 tomme koersler i doegnet');
});

await aproev('forfaldent LinkedIn-element starter kun LinkedIn', async () => {
  const a = attrap([post()]);
  const r = await koer({ token: 't', nu: FORFALD + 60, hent: a.hent, log: () => {} });
  assert.deepEqual(a.kaldt, ['publicer-linkedin']);
  assert.deepEqual(r.startet, ['linkedin']);
});

await aproev('koeen kan ikke hentes: begge startes for en sikkerhed', async () => {
  const a = attrap([], { koeFejler: true });
  await koer({ token: 't', nu: FORFALD, hent: a.hent, log: () => {} });
  assert.deepEqual(a.kaldt.sort(), ['publicer-instagram', 'publicer-linkedin'],
    'vi fejler i retning af at publicere, ikke af at tie');
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

proev('begge haendelser lyttes der paa', () => {
  for (const [kanal, haendelse] of Object.entries(HAENDELSER)) {
    const fil = `.github/workflows/publicer-${kanal === 'instagram' ? 'instagram' : 'linkedin'}-planlagt.yml`;
    const y = readFileSync(fil, 'utf8');
    assert.match(y, /repository_dispatch:/, `${fil} lytter ikke paa repository_dispatch`);
    assert.ok(y.includes(`types: [${haendelse}]`), `${fil} lytter ikke paa «${haendelse}»`);
  }
});

proev('en dispatch-koersel publicerer for alvor', () => {
  for (const fil of ['.github/workflows/publicer-instagram-planlagt.yml',
                     '.github/workflows/publicer-linkedin-planlagt.yml']) {
    assert.match(readFileSync(fil, 'utf8'), /github\.event_name == 'repository_dispatch'/,
      `${fil}: en dispatch-koersel ville vaere toerloeb`);
  }
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

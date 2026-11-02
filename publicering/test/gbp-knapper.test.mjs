/* Forberedelsen af handlingsknapperne paa de tre Google-opslag. */
import assert from 'node:assert/strict';
import { beregn, FORSLAG } from '../scripts/forbered-gbp-knapper.mjs';
import { beregnLaas } from '../scripts/laas.mjs';

let n = 0;
const proev = (navn, f) => { f(); n++; console.log('  ok', navn); };

const GRUND = {
  element: 53, kanal: 'gbp', titel: 'T', meta_description: 'M', slug: 's',
  slut_url: 'u', dato: '2026-11-04T09:00:00+01:00', kategorier: [],
  billede: 'b', alt_tekst: 'a', links: [], cta: 'c', hashtags: [],
  brodtekst_sha256: 'x'.repeat(64), tekst: 'tekst',
  billede_url: 'https://kristiangg.dk/images/natur/vintersol-skov-640.jpg',
  versionslaas: 'gammel',
};

console.log('GBP-KNAPPER');

proev('et gyldigt link giver en LEARN_MORE-knap', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/til-dig/naturterapi/');
  assert.deepEqual(r.fejl, []);
  assert.deepEqual(r.krop.callToAction,
    { actionType: 'LEARN_MORE', url: 'https://kristiangg.dk/til-dig/naturterapi/' });
});

proev('laasen regnes om og er ikke den gamle', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/');
  assert.notEqual(r.efter, r.foer);
  assert.equal(r.efter, beregnLaas(r.nyLaasefil).laas);
});

proev('kun links aendres — broedtekst, billede, dato og cta er uroert', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/');
  for (const f of ['tekst', 'billede', 'billede_url', 'dato', 'cta', 'titel', 'brodtekst_sha256']) {
    assert.equal(r.nyLaasefil[f], GRUND[f], `${f} blev aendret`);
  }
  assert.deepEqual(r.nyLaasefil.links, ['https://kristiangg.dk/kontakt/']);
});

proev('et fremmed domaene afvises', () => {
  const r = beregn({ ...GRUND }, 'https://example.com/noget/');
  assert.ok(r.fejl.some((m) => /kristiangg\.dk/.test(m)));
});

proev('http afvises', () => {
  const r = beregn({ ...GRUND }, 'http://kristiangg.dk/kontakt/');
  assert.ok(r.fejl.length);
});

proev('manglende afsluttende skraastreg afvises — ellers et ekstra 301-hop', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt');
  assert.ok(r.fejl.some((m) => /skraastreg/.test(m)));
});

proev('en side, der ikke findes i bygget, afvises', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/findes-ikke/', { findesSide: () => false });
  assert.ok(r.fejl.some((m) => /findes ikke i bygget/.test(m)));
});

proev('et element, der allerede har et link, roeres ikke', () => {
  const r = beregn({ ...GRUND, links: ['https://kristiangg.dk/priser/'] }, 'https://kristiangg.dk/kontakt/');
  assert.ok(r.fejl.some((m) => /allerede et link/.test(m)));
});

proev('to links kan ikke opstaa — Google tager kun én knap', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/');
  assert.equal(r.nyLaasefil.links.length, 1);
});

proev('forslaget daekker praecis element 49, 53 og 54', () => {
  assert.deepEqual(FORSLAG.map((f) => f.element).sort((a, b) => a - b), [49, 53, 54]);
  for (const f of FORSLAG) assert.match(f.url, /^https:\/\/kristiangg\.dk\/.*\/$/);
});


/* ── Skrivedelen ──────────────────────────────────────────────────────────
   Den var utestet, og det kostede: beregn() returnerede den nye laasefil
   under noeglen «element», og et spread lagde den oven i elementNUMMERET.
   Registret fik «element: {hele laasefilen}», og vagthunden meldte
   «element [object Object] staar i registret, men ikke i koeen». */

const { byggRegisterraekker, PAKKE, UROERT } = await import('../scripts/forbered-gbp-knapper.mjs');

const RESULTAT = {
  nr: 53,
  url: 'https://kristiangg.dk/til-dig/naturterapi/',
  laas: { ...GRUND, dato: '2026-11-04T09:00:00+01:00' },
  foer: 'gammel0000000000',
  efter: 'ny00000000000000',
};

proev('registerraekken baerer elementNUMMERET, ikke laasefilen', () => {
  const [r] = byggRegisterraekker([RESULTAT], 'Kristian G. G. Dansted', '2026-11-02');
  assert.equal(typeof r.element, 'number');
  assert.equal(r.element, 53);
});

proev('registerraekken har den NYE laas og uaendret status', () => {
  const [r] = byggRegisterraekker([RESULTAT], 'Kristian G. G. Dansted', '2026-11-02');
  assert.equal(r.versionslaas, 'ny00000000000000');
  assert.equal(r.status, 'AFVENTER DATO');
  assert.equal(r.kanal, 'gbp');
  assert.equal(r.post_id, null);
  assert.equal(r.godkendt_tidspunkt, '2026-11-04T09:00:00+01:00');
});

proev('raekken er sporbar: godkender, dato, destination, begge laase og pakken', () => {
  const [r] = byggRegisterraekker([RESULTAT], 'Kristian G. G. Dansted', '2026-11-02');
  for (const skal of ['Kristian G. G. Dansted', '2026-11-02', RESULTAT.url,
                      'gammel0000000000', 'ny00000000000000', PAKKE]) {
    assert.ok(r.noter.includes(skal), `noten mangler ${skal}`);
  }
});

proev('et afsendt opslag afvises — ingen genpublicering, ingen ny laas', () => {
  for (const status of ['PUBLICERET', 'PLANLAGT', 'PUBLICERING IGANG', 'PUBLICERING FEJLET', 'OPGIVET']) {
    const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/', {
      register: [{ element: 53, status }],
    });
    assert.ok(r.fejl.some((m) => m.includes(status)), `status ${status} blev ikke afvist`);
  }
});

proev('kun AFVENTER DATO slipper igennem', () => {
  assert.deepEqual(UROERT, ['AFVENTER DATO']);
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/', {
    register: [{ element: 53, status: 'AFVENTER DATO' }],
  });
  assert.deepEqual(r.fejl, []);
});

proev('det er den SENESTE registerpost, der afgoer', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/', {
    register: [{ element: 53, status: 'AFVENTER DATO' }, { element: 53, status: 'PUBLICERET' }],
  });
  assert.ok(r.fejl.some((m) => m.includes('PUBLICERET')));
});

proev('pakke og dato foelger med ind i den nye laasefil', () => {
  const r = beregn({ ...GRUND }, 'https://kristiangg.dk/kontakt/', { pakke: PAKKE, dato: '2026-11-02' });
  assert.equal(r.nyLaasefil.godkendelsespakke, PAKKE);
  assert.equal(r.nyLaasefil.godkendt_dato, '2026-11-02');
});

console.log(`\n${n} proever bestaaet i alt.`);

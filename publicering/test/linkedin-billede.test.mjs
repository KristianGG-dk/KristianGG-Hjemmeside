// Proever billedvejen paa LinkedIn og de to spaerrer omkring den.
//
// Intet netvaerk: fetch er en attrap. Der publiceres intet.
//
//   node publicering/test/linkedin-billede.test.mjs
import assert from 'node:assert/strict';
import {
  hentGodkendtBillede, uploadBillede, byggPayload, BilledeAfvist,
  kandidatVersioner, erVersionAktiv, headere,
} from '../scripts/publicer-linkedin.mjs';

let bestaaet = 0, fejlet = 0;
const proev = (navn, fn) => {
  try { fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};
const aproev = async (navn, fn) => {
  try { await fn(); bestaaet++; console.log('  OK   ', navn); }
  catch (e) { fejlet++; console.log('  FEJL ', navn, '\n        ', e.message); }
};

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const svar = ({ ok = true, status = 200, type = 'image/jpeg', bytes = BYTES, krop = null, headers = {} } = {}) => ({
  ok, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : headers[k] ?? null) },
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  json: async () => krop ?? {},
  text: async () => JSON.stringify(krop ?? {}),
});

const ELEMENT = {
  element: 41, kanal: 'linkedin', tekst: 'tekst', titel: 'titel',
  meta_description: 'beskrivelse', alt_tekst: 'Lav vintersol gennem bare traekroner',
  billede: 'vintersol-skov',
  billede_url: 'https://kristiangg.dk/images/natur/vintersol-skov-640.jpg',
};

console.log('Billedet skal komme fra vores eget domaene');

await aproev('fremmed vaert afvises', async () => {
  await assert.rejects(
    () => hentGodkendtBillede('https://andetsted.example/billede.jpg', async () => svar()),
    BilledeAfvist);
});

await aproev('http afvises', async () => {
  await assert.rejects(
    () => hentGodkendtBillede('http://kristiangg.dk/a.jpg', async () => svar()),
    BilledeAfvist);
});

await aproev('404 afvises', async () => {
  await assert.rejects(
    () => hentGodkendtBillede(ELEMENT.billede_url, async () => svar({ ok: false, status: 404 })),
    /svarede 404/);
});

await aproev('en HTML-side er ikke et billede', async () => {
  await assert.rejects(
    () => hentGodkendtBillede(ELEMENT.billede_url, async () => svar({ type: 'text/html' })),
    /content-type/);
});

await aproev('0 byte afvises', async () => {
  await assert.rejects(
    () => hentGodkendtBillede(ELEMENT.billede_url, async () => svar({ bytes: new Uint8Array(0) })),
    /0 byte/);
});

await aproev('et rigtigt jpeg accepteres', async () => {
  const b = await hentGodkendtBillede(ELEMENT.billede_url, async () => svar());
  assert.equal(b.type, 'image/jpeg');
  assert.equal(b.bytes.length, BYTES.length);
});

console.log('\nUploaden');

await aproev('initializeUpload uden uploadUrl afvises', async () => {
  await assert.rejects(
    () => uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
      async () => svar({ krop: { value: {} } })),
    /hverken uploadUrl eller image/);
});

await aproev('PUT virker — og POST proeves ikke', async () => {
  const kaldt = [];
  const r = await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    async (url, o = {}) => {
      kaldt.push(o.method ?? 'GET');
      if (String(url).includes('initializeUpload')) {
        return svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: 'urn:li:image:A' } } });
      }
      return svar({ status: 201 });
    });
  assert.equal(r.urn, 'urn:li:image:A');
  assert.equal(r.metode, 'PUT');
  assert.deepEqual(kaldt, ['POST', 'PUT'], 'kun initializeUpload og ét PUT');
});

await aproev('405 paa PUT → POST proeves én gang', async () => {
  const metoder = [];
  const r = await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    async (url, o = {}) => {
      if (String(url).includes('initializeUpload')) {
        return svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: 'urn:li:image:B' } } });
      }
      metoder.push(o.method);
      return o.method === 'PUT' ? svar({ ok: false, status: 405 }) : svar({ status: 201 });
    });
  assert.equal(r.metode, 'POST');
  assert.deepEqual(metoder, ['PUT', 'POST']);
});

await aproev('403 paa PUT → der proeves IKKE med POST, og der kastes', async () => {
  const metoder = [];
  await assert.rejects(() => uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    async (url, o = {}) => {
      if (String(url).includes('initializeUpload')) {
        return svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: 'urn:li:image:C' } } });
      }
      metoder.push(o.method);
      return svar({ ok: false, status: 403 });
    }), BilledeAfvist);
  assert.deepEqual(metoder, ['PUT'], 'en 403 er ikke en metodefejl');
});

console.log('\nAPI-versionen');

// Det faktiske svar fra koersel #5 den 01-11-2026.
const SVAR_426 = {
  ok: false, status: 426,
  headers: { get: () => null },
  json: async () => ({ status: 426, code: 'NONEXISTENT_VERSION', message: 'Requested version 20250901 is not active' }),
  text: async () => 'NONEXISTENT_VERSION',
  arrayBuffer: async () => new ArrayBuffer(0),
};

proev('kandidatlisten er AAAAMM, nyeste foerst, femten maaneder', () => {
  const k = kandidatVersioner(new Date('2026-11-01T00:00:00Z'));
  assert.equal(k.length, 15);
  assert.equal(k[0], '202611');
  assert.equal(k[1], '202610');
  assert.equal(k[14], '202509', 'den version, der faldt, er sidst paa listen');
  for (const v of k) assert.match(v, /^\d{6}$/);
});

proev('aarsskiftet regnes rigtigt', () => {
  const k = kandidatVersioner(new Date('2027-01-15T00:00:00Z'));
  assert.deepEqual(k.slice(0, 3), ['202701', '202612', '202611']);
});

await aproev('426 betyder «ikke aktiv»', async () => {
  assert.equal(await erVersionAktiv('t', '202509', async () => SVAR_426), false);
});

await aproev('403 betyder «aktiv» — versionen kontrolleres foer alt andet', async () => {
  assert.equal(await erVersionAktiv('t', '202610', async () => svar({ ok: false, status: 403 })), true);
});

/** initializeUpload svarer 426 for alle versioner i «doede». */
const medDoede = (doede, urnNavn = 'A') => async (url, o = {}) => {
  if (String(url).includes('initializeUpload')) {
    const v = o.headers['LinkedIn-Version'];
    return doede.includes(v) ? SVAR_426
      : svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: `urn:li:image:${urnNavn}` } } });
  }
  return svar({ status: 201 });
};

await aproev('doed standard: den aktive maales paa initializeUpload selv', async () => {
  const r = await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    medDoede(['202509', '202611']), '202509', { nu: new Date('2026-11-01T00:00:00Z'), log: () => {} });
  assert.equal(r.version, '202610', 'nyeste aktive efter den doede standard');
  assert.equal(r.urn, 'urn:li:image:A');
});

await aproev('fejlen fra koersel #5 praecis: 202509 doed, 202610 aktiv', async () => {
  const r = await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    medDoede(['202509', '202611']), '202509', { nu: new Date('2026-11-01T00:00:00Z'), log: () => {} });
  assert.equal(r.version, '202610');
});

await aproev('virker standarden, maales der ikke', async () => {
  const versioner = [];
  await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    async (url, o = {}) => {
      if (String(url).includes('initializeUpload')) {
        versioner.push(o.headers['LinkedIn-Version']);
        return svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: 'urn:li:image:B' } } });
      }
      return svar({ status: 201 });
    }, '202610', { log: () => {} });
  assert.deepEqual(versioner, ['202610'], 'kun ét kald, ingen maaling');
});

await aproev('ingen aktiv version: der kastes frem for at gaette', async () => {
  await assert.rejects(
    () => uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
      async () => SVAR_426, '202509', { log: () => {} }),
    (err) => {
      assert.ok(err instanceof BilledeAfvist);
      assert.match(err.message, /Ingen af de proevede API-versioner/);
      assert.match(err.message, /LI_API_VERSION/, 'fejlen skal sige hvad man goer');
      return true;
    });
});

await aproev('versionsheaderen foelger med initializeUpload', async () => {
  let set = null;
  await uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
    async (url, o = {}) => {
      if (String(url).includes('initializeUpload')) {
        set = o.headers['LinkedIn-Version'];
        return svar({ krop: { value: { uploadUrl: 'https://up.example/1', image: 'urn:li:image:V' } } });
      }
      return svar({ status: 201 });
    }, '202610');
  assert.equal(set, '202610');
});

proev('headere() saetter de tre, hvert versioneret kald skal have', () => {
  const h = headere('abc', '202610', { 'Content-Type': 'application/json' });
  assert.equal(h.Authorization, 'Bearer abc');
  assert.equal(h['LinkedIn-Version'], '202610');
  assert.equal(h['X-Restli-Protocol-Version'], '2.0.0');
  assert.equal(h['Content-Type'], 'application/json');
});

console.log('\nOpslaget');

proev('billedet havner i content.media med den godkendte alt-tekst', () => {
  const p = byggPayload(ELEMENT, 'urn:li:person:x', 'urn:li:image:A');
  assert.equal(p.content.media.id, 'urn:li:image:A');
  assert.equal(p.content.media.altText, ELEMENT.alt_tekst);
  assert.equal(p.commentary, ELEMENT.tekst);
});

proev('uden billede og uden artikel: intet content', () => {
  const { billede, billede_url, ...rent } = ELEMENT;
  assert.equal(byggPayload(rent, 'urn:li:person:x').content, undefined);
});

proev('baade billede og artikel er tvetydigt og stoppes', () => {
  assert.throws(
    () => byggPayload({ ...ELEMENT, artikel_url: 'https://kristiangg.dk/blog/a/' }, 'urn:li:person:x', 'urn:li:image:A'),
    /kun baere ét/);
});

console.log(`\n${bestaaet} bestaaet, ${fejlet} fejlet`);
process.exit(fejlet ? 1 : 0);

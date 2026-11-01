// Proever billedvejen paa LinkedIn og de to spaerrer omkring den.
//
// Intet netvaerk: fetch er en attrap. Der publiceres intet.
//
//   node publicering/test/linkedin-billede.test.mjs
import assert from 'node:assert/strict';
import {
  hentGodkendtBillede, uploadBillede, byggPayload, BilledeAfvist,
  kandidatVersioner, erVersionAktiv, proevVersion, aktivVersion, headere,
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

await aproev('403 betyder «aktiv» — versionen kontrolleres foer scope', async () => {
  assert.equal(await erVersionAktiv('t', '202610', async () => svar({ ok: false, status: 403 })), true);
});

await aproev('proevVersion finder den nyeste aktive og springer de doede over', async () => {
  const spurgt = [];
  const v = await proevVersion('t', {
    nu: new Date('2026-11-01T00:00:00Z'),
    hent: async (url, o = {}) => {
      const ver = o.headers['LinkedIn-Version'];
      spurgt.push(ver);
      return ['202611'].includes(ver) ? SVAR_426 : svar({ status: 200 });
    },
  });
  assert.equal(v, '202610');
  assert.deepEqual(spurgt, ['202611', '202610'], 'den stopper ved den foerste aktive');
});

await aproev('ingen aktiv version: der kastes frem for at gaette', async () => {
  await assert.rejects(() => proevVersion('t', { hent: async () => SVAR_426 }), /Ingen af de femten/);
});

await aproev('aktivVersion maaler kun, hvis standarden er doed', async () => {
  let kald = 0;
  const v = await aktivVersion('t', { hent: async () => { kald++; return svar({ status: 200 }); } });
  assert.match(v, /^\d{6}$/);
  assert.equal(kald, 1, 'virker standarden, spoerges der én gang');
});

await aproev('initializeUpload med doed version giver en forstaaelig fejl', async () => {
  await assert.rejects(
    () => uploadBillede('t', 'urn:li:person:x', { bytes: BYTES, type: 'image/jpeg' },
      async () => SVAR_426, '202509'),
    (err) => {
      assert.ok(err instanceof BilledeAfvist);
      assert.match(err.message, /NONEXISTENT_VERSION/);
      assert.match(err.message, /«202509» er ikke aktiv/);
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

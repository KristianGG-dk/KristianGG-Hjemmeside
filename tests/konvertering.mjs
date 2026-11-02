/* Konverteringsmaalingen — proevet i en rigtig browser.
   ============================================================================

   Maalingen er FORBEREDT, ikke aktiveret. Den skal alligevel proeves, for
   den dag den taendes, er det for sent at opdage, at samtykket ikke holdt,
   at en henvendelse blev taelt to gange, eller at en mailadresse slap med.

   Her proeves de fem krav, ét for ét:

     1. Primaer konvertering ved BEKRAEFTET indsendelse — ikke ved klik.
     2. Sekundaere handlinger for telefon, SMS og mail.
     3. Ingen personoplysninger forlader siden.
     4. Samtykke: intet sendes uden et ja; koe og kassation virker.
     5. Ingen dobbeltregistrering: pr. sidevisning og pr. session.

   Bygget skal findes i public/:  hugo --minify --buildFuture               */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROD, 'public');
const PORT = 4715;

const fejl = [];
const noter = [];
const x = (m) => fejl.push(m);
const ok = (m) => noter.push(m);

if (!fs.existsSync(path.join(PUB, 'kontakt/index.html'))) {
  console.log('KONVERTERING: public/kontakt/ findes ikke — byg foerst. Springes over.');
  process.exit(0);
}

const kraev = createRequire(import.meta.url);
let chromium;
for (const n of ['playwright', '/opt/node-tools/node_modules/playwright', 'playwright-core', '@playwright/test']) {
  try { ({ chromium } = kraev(n)); break; } catch { /* videre */ }
}
if (!chromium) {
  console.log('KONVERTERING: Playwright findes ikke her — testen springes over.');
  console.log('  tests/hjemmeside.mjs kontrollerer det samme statisk og koerer altid.');
  process.exit(0);
}

/* Serveren kan paa forlangende saette data-samtykke="kraeves" paa <html>.
   Det er netop det, hugo.toml goer, naar params.konvertering.samtykke_kraeves
   er true — saa kan samtykkevejen proeves uden at aendre konfigurationen. */
const TYPER = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(PUB, p);
  if (f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    let krop = fs.readFileSync(f);
    if (p.endsWith('.html') && u.searchParams.get('samtykke') === 'kraeves') {
      krop = Buffer.from(krop.toString('utf-8').replace(/<html lang=(["']?)da\1/i, '<html lang="da" data-samtykke="kraeves"'));
    }
    res.writeHead(200, { 'Content-Type': TYPER[path.extname(f)] || 'text/html; charset=utf-8' });
    res.end(krop);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  }
});
await new Promise((r) => srv.listen(PORT, r));

let browser = null;
for (const sti of [undefined, process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium/chrome-linux/chrome',
                   '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) {
  if (sti !== undefined && !sti) continue;
  try { browser = await chromium.launch(sti ? { executablePath: sti, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }); break; }
  catch { /* videre */ }
}
if (!browser) { console.log('KONVERTERING: Chromium kunne ikke startes — springes over.'); srv.close(); process.exit(0); }

const URL_KONTAKT = `http://localhost:${PORT}/kontakt/`;

/* Opsamler: en attrap-maaler, der ligner den rigtige. Lagt ind FOER sidens
   egne scripts, saa main.js finder den praecis som en rigtig maaler. */
async function nySide(kontekst, { samtykkeKraeves = false, medMaaler = true } = {}) {
  const side = await kontekst.newPage();
  if (medMaaler) {
    await side.addInitScript(() => {
      window.dataLayer = [];
      window.__sendt = [];
      document.addEventListener('kgg:konvertering', (e) => window.__sendt.push(e.detail));
    });
  } else {
    await side.addInitScript(() => {
      window.__sendt = [];
      document.addEventListener('kgg:konvertering', (e) => window.__sendt.push(e.detail));
    });
  }
  await side.goto(URL_KONTAKT + (samtykkeKraeves ? '?samtykke=kraeves' : ''), { waitUntil: 'load' });
  return side;
}

try {
  /* ── 1+2. Handlinger taelles, og den primaere foerst ved kvittering ──── */
  {
    const k = await browser.newContext();
    const side = await nySide(k);

    const foer = await side.evaluate(() => window.dataLayer.length);
    if (foer !== 0) x(`der blev taelt ${foer} konvertering(er), foer nogen gjorde noget`);

    /* Den FOERSTE kontakt-sms i DOM'en er mobilmenuens knap, som er skjult
       paa desktop. Playwright venter paa, at den bliver klikbar, og loeber
       toer. Der klikkes derfor paa den synlige. */
    const smsKnap = side.locator('a[data-konverter="kontakt-sms"]:visible').first();
    if (await smsKnap.count() === 0) {
      x('der er ingen synlig SMS-knap paa kontaktsiden');
    } else {
      await smsKnap.click({ noWaitAfter: true }).catch(() => null);
      await side.waitForTimeout(200);
      const efterSms = await side.evaluate(() => window.dataLayer.map((d) => d.event));
      if (!efterSms.includes('kontakt-sms')) x('et klik paa SMS-knappen taelles ikke');
      else ok('sekundaer handling: et klik paa den synlige SMS-knap taelles');
    }

    const telKnap = side.locator('a[data-konverter="kontakt-telefon"]:visible').first();
    if (await telKnap.count() > 0) {
      await telKnap.click({ noWaitAfter: true }).catch(() => null);
      await side.waitForTimeout(200);
      const t = await side.evaluate(() => window.dataLayer.map((d) => d.event));
      if (!t.includes('kontakt-telefon')) x('et klik paa telefonnummeret taelles ikke');
      else ok('sekundaer handling: et klik paa telefonnummeret taelles');
    }

    const vedKlik = await side.evaluate(() => window.dataLayer.filter((d) => d.event === 'formular-sendt').length);
    await side.fill('#email', 'proeve@example.dk');
    await side.click('form[name="kontakt"] button[type="submit"]');
    await side.waitForFunction(() => {
      const b = document.querySelector('[data-form-submit]');
      return b && /Sendt/.test(b.textContent);
    }, { timeout: 5000 }).catch(() => null);
    const efter = await side.evaluate(() => window.dataLayer.filter((d) => d.event === 'formular-sendt').length);
    if (vedKlik !== 0) x('den primaere konvertering var taelt, foer formularen blev sendt');
    else if (efter !== 1) x(`den primaere konvertering blev taelt ${efter} gange ved én bekraeftet indsendelse`);
    else ok('primaer konvertering: taelles én gang, og foerst naar Netlify har kvitteret');

    await k.close();
  }

  /* ── 3. Ingen personoplysninger ──────────────────────────────────────── */
  {
    const foerPii = fejl.length;
    const k = await browser.newContext();
    const side = await nySide(k);
    await side.goto(URL_KONTAKT + '?begivenhed=Skovbad%20med%20anna%40example.dk', { waitUntil: 'load' });
    await side.evaluate(() => {
      window.dataLayer = [];
      window.kggKonverter('kontakt-mail', {
        kanal: 'anna@example.dk ringer paa +45 31 50 97 89',
        besked: 'maa aldrig med',
        email: 'anna@example.dk',
      });
    });
    const sendt = await side.evaluate(() => window.dataLayer[0] || null);
    if (!sendt) {
      x('kggKonverter sendte intet, da den blev kaldt direkte');
    } else {
      const tekst = JSON.stringify(sendt);
      if (/@example\.dk/.test(tekst)) x(`en mailadresse slap med: ${tekst}`);
      if (/31\s?50\s?97\s?89/.test(tekst)) x(`et telefonnummer slap med: ${tekst}`);
      if ('besked' in sendt || 'email' in sendt) x(`en ikke-tilladt noegle slap med: ${Object.keys(sendt).join(', ')}`);
      if (/begivenhed=/.test(tekst)) x(`adresselinjens query slap med: ${tekst}`);
      if (fejl.length === foerPii) ok(`kun tilladte noegler sendes, og vaerdier renses: ${JSON.stringify(sendt)}`);
    }

    // Formularens egne felter maa aldrig vaere med i en konvertering.
    await side.goto(URL_KONTAKT, { waitUntil: 'load' });
    await side.fill('#email', 'hemmelig@example.dk');
    await side.fill('#message', 'Jeg har det skidt og mit nummer er 12345678');
    await side.evaluate(() => { window.dataLayer = []; });
    await side.click('form[name="kontakt"] button[type="submit"]');
    await side.waitForTimeout(800);
    const alt = await side.evaluate(() => JSON.stringify(window.dataLayer));
    if (/hemmelig@|skidt|12345678/.test(alt)) x(`formularens indhold slap med i maalingen: ${alt}`);
    else ok('formularens felter er ikke med i den primaere konvertering');

    await k.close();
  }

  /* ── 4. Samtykke ─────────────────────────────────────────────────────── */
  {
    const k = await browser.newContext();
    const side = await nySide(k, { samtykkeKraeves: true });

    const tilstand = await side.evaluate(() => ({
      kraeves: window.kggSamtykke.kraeves(),
      status: window.kggSamtykke.status(),
    }));
    if (!tilstand.kraeves) x('data-samtykke="kraeves" blev ikke opfanget af main.js');
    if (tilstand.status !== 'ukendt') x(`samtykkestatus er "${tilstand.status}" uden at nogen har svaret`);

    // Uden svar: intet maa sendes.
    await side.evaluate(() => { window.dataLayer = []; window.kggKonverter('kontakt-sms'); });
    let n = await side.evaluate(() => window.dataLayer.length);
    if (n !== 0) x(`${n} konvertering(er) blev sendt, selv om samtykke manglede`);
    else ok('samtykke kraeves: intet sendes, foer der er svaret');

    // Et ja skal frigive det, der stod i koe.
    await side.evaluate(() => window.kggSamtykke.giv());
    await side.waitForTimeout(100);
    const efterJa = await side.evaluate(() => window.dataLayer.map((d) => d.event));
    if (!efterJa.includes('kontakt-sms')) x('et ja frigav ikke den handling, der stod i koe');
    else ok('samtykke givet: det, der stod i koe, sendes');

    // Et nej skal kassere, ikke gemme.
    const k2 = await browser.newContext();
    const side2 = await nySide(k2, { samtykkeKraeves: true });
    await side2.evaluate(() => { window.dataLayer = []; window.kggKonverter('kontakt-telefon'); window.kggSamtykke.afvis(); });
    await side2.waitForTimeout(100);
    n = await side2.evaluate(() => window.dataLayer.length);
    if (n !== 0) x(`${n} konvertering(er) blev sendt efter et nej`);
    // Og efter et nej maa en ny handling heller ikke sendes.
    await side2.evaluate(() => window.kggKonverter('kontakt-mail'));
    await side2.waitForTimeout(100);
    n = await side2.evaluate(() => window.dataLayer.length);
    if (n !== 0) x(`en handling efter et nej blev alligevel sendt (${n})`);
    else ok('samtykke afvist: det ventende kasseres, og intet nyt sendes');

    // Valget huskes paa tvaers af sideskift.
    await side2.reload({ waitUntil: 'load' });
    const husket = await side2.evaluate(() => window.kggSamtykke.status());
    if (husket !== 'afvist') x(`samtykkevalget blev ikke husket efter genindlaesning (status "${husket}")`);
    else ok('samtykkevalget huskes efter genindlaesning');

    await k.close(); await k2.close();
  }

  /* ── 5. Ingen dobbeltregistrering ────────────────────────────────────── */
  {
    const k = await browser.newContext();
    const side = await nySide(k);

    await side.evaluate(() => {
      window.dataLayer = [];
      window.kggKonverter('kontakt-sms');
      window.kggKonverter('kontakt-sms');
      window.kggKonverter('kontakt-sms');
    });
    let n = await side.evaluate(() => window.dataLayer.filter((d) => d.event === 'kontakt-sms').length);
    if (n !== 1) x(`samme handling taeltes ${n} gange paa én sidevisning`);
    else ok('samme handling taelles hoejst én gang pr. sidevisning');

    // Den primaere konvertering maa ikke kunne taelles igen i samme session,
    // heller ikke efter en genindlaesning af kvitteringen.
    await side.evaluate(() => window.kggKonverter('formular-sendt'));
    let p = await side.evaluate(() => window.dataLayer.filter((d) => d.event === 'formular-sendt').length);
    if (p !== 1) x(`den primaere konvertering blev taelt ${p} gange foerste gang`);
    await side.reload({ waitUntil: 'load' });
    await side.evaluate(() => { window.dataLayer = []; window.kggKonverter('formular-sendt'); });
    p = await side.evaluate(() => window.dataLayer.length);
    if (p !== 0) x('den primaere konvertering blev taelt igen efter en genindlaesning i samme session');
    else ok('den primaere konvertering taelles hoejst én gang pr. browsersession');

    // Og i en NY session skal den kunne taelles igen — ellers mistes rigtige
    // henvendelser fra den samme person en anden dag.
    const k2 = await browser.newContext();
    const side2 = await nySide(k2);
    await side2.evaluate(() => { window.dataLayer = []; window.kggKonverter('formular-sendt'); });
    const p2 = await side2.evaluate(() => window.dataLayer.length);
    if (p2 !== 1) x('den primaere konvertering kan ikke taelles i en ny session — rigtige henvendelser mistes');
    else ok('en ny session kan taelle den primaere konvertering igen');

    await k.close(); await k2.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log('\nKONVERTERINGSMAALING\n' + '='.repeat(62) + '\n');
if (fejl.length) {
  console.log(`FEJL (${fejl.length}):`);
  for (const f of fejl) console.log('  x', f);
  console.log();
}
console.log('KONTROLLERET:');
for (const n of noter) console.log('  ·', n);
console.log('\nRESULTAT:', fejl.length ? 'FEJL FUNDET' : 'OK');
process.exit(fejl.length ? 1 : 0);

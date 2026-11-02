/* Kontaktformularen paa kristiangg.dk — naar henvendelsen faktisk frem?
   ============================================================================

   Baggrund — en fejl der kostede rigtige henvendelser:

   Feltet "subject" bruges af Netlify som emnelinje paa notifikationsmailen.
   Er vaerdien tom, sender Netlify SLET INGEN mail. Indsendelsen gemmes og ser
   helt normal ud under "Verified submissions", men den naar aldrig frem.

   Pladsholderen "Vaelg emne..." havde value="". Enhver henvendelse, hvor der
   ikke blev valgt et emne, forsvandt derfor lydloest.

   Denne test udfylder formularen som et menneske og kontrollerer, at
   subject aldrig kan vaere tom, og at en mangelfuld henvendelse — kun en
   e-mail, intet andet — stadig kan sendes.                                  */

/* Playwright ligger forskellige steder i forskellige miljoeer, og ESM
   finder ikke en global pakke via NODE_PATH. Derfor et opslag frem for en
   fast import: findes Playwright ikke, springes testen over frem for at
   fejle, saa en manglende udviklingsafhaengighed ikke ser ud som en fejl i
   formularen. Den statiske kontrol i tests/hjemmeside.mjs kraever ingen
   browser og koerer altid — ogsaa i CI. */
import { createRequire } from 'module';
const kraev = createRequire(import.meta.url);
let chromium;
for (const navn of ['playwright', '/opt/node-tools/node_modules/playwright', 'playwright-core', '@playwright/test']) {
  try { ({ chromium } = kraev(navn)); break; } catch { /* proev den naeste */ }
}
if (!chromium) {
  console.log('KONTAKTFORMULAR: Playwright findes ikke her — testen springes over.');
  console.log('  Kor "npm install -D playwright && npx playwright install chromium" for at kore den.');
  process.exit(0);
}
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const PORT = 4713;
const SIDE = '/kontakt/';

const fejl = [];
const noter = [];

const TYPER = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function server() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(PUB, p);
    if (f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPER[path.extname(f)] || 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    }
  });
}

const srv = server();
await new Promise((r) => srv.listen(PORT, r));
/* Browseren findes forskellige steder i forskellige miljoeer. Den
   hardkodede sti /opt/pw-browsers/chromium-1194/... gaelder kun én bestemt
   Playwright-version: faldt den vaek, fejlede testen som om formularen var
   i stykker. Nu proeves Playwrights egen opslagsmekanisme foerst, derefter
   PW_CHROMIUM fra miljoeet og til sidst de kendte stier. */
async function aabnBrowser() {
  const stier = [
    undefined,
    process.env.PW_CHROMIUM,
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  const fejl = [];
  for (const sti of stier) {
    if (sti !== undefined && !sti) continue;
    try {
      return await chromium.launch(sti ? { executablePath: sti } : {});
    } catch (e) {
      fejl.push(`${sti || 'Playwrights eget opslag'}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error('kunne ikke starte Chromium:\n  ' + fejl.join('\n  '));
}

const browser = await aabnBrowser();

try {
  const sidefil = path.join(PUB, 'kontakt/index.html');
  if (!fs.existsSync(sidefil)) {
    console.log('KONTAKTFORMULAR: siden findes ikke i public/ — testen springes over.');
    process.exit(0);
  }

  // --- 1. Ingen option i emnefeltet maa have en tom vaerdi ---
  {
    const side = await browser.newPage();
    await side.goto(`http://localhost:${PORT}${SIDE}`, { waitUntil: 'load' });

    const tomme = await side.$$eval('form[name="kontakt"] [name="subject"] option',
      (els) => els.filter((o) => !o.value.trim()).map((o) => o.textContent.trim()));
    if (tomme.length) {
      fejl.push(`emnefeltet har option(s) med tom vaerdi (${tomme.join(', ')}) `
              + '— Netlify sender da ingen mail. Se kommentaren i layouts/partials/contact-form.html.');
    } else {
      noter.push('ingen option i emnefeltet har en tom vaerdi');
    }

    const standard = await side.$eval('form[name="kontakt"] [name="subject"]', (s) => s.value);
    if (!standard.trim()) {
      fejl.push('emnefeltets standardvaerdi er tom — en henvendelse uden valgt emne udloeser ingen mail');
    } else {
      noter.push(`standardemnet er "${standard}" — aldrig tomt`);
    }
    await side.close();
  }

  // --- 2. En mangelfuld henvendelse skal kunne sendes ---
  // Kun e-mail er paakraevet: uden den kan der ikke foelges op. Alt andet maa
  // vaere tomt — henvendelsen skal frem, ogsaa selv om den er ufuldstaendig.
  {
    const side = await browser.newPage();
    await side.goto(`http://localhost:${PORT}${SIDE}`, { waitUntil: 'load' });
    await side.fill('#email', 'test@example.dk');

    const gyldig = await side.$eval('form[name="kontakt"]', (f) => f.checkValidity());
    const ugyldige = await side.$$eval('form[name="kontakt"] :invalid',
      (els) => els.filter((e) => e.name).map((e) => e.name));
    if (!gyldig) {
      fejl.push('en henvendelse med kun e-mail kan ikke sendes — browseren afviser: '
              + [...new Set(ugyldige)].join(', '));
    }

    const [req] = await Promise.all([
      side.waitForRequest((r) => r.method() === 'POST', { timeout: 5000 }).catch(() => null),
      side.click('form[name="kontakt"] button[type="submit"]'),
    ]);
    if (!req) {
      fejl.push('klik paa Send udloeste ingen POST — henvendelsen forlader aldrig browseren');
    } else {
      const krop = req.postData() || '';
      if (!/name="subject"[\s\S]{0,80}?\S/.test(krop) || /name="subject"\r?\n\r?\n\r?\n/.test(krop)) {
        fejl.push('POST-kroppen sender et tomt subject — Netlify sender da ingen mail');
      } else {
        noter.push('en henvendelse med kun e-mail sendes, og subject er udfyldt i POST-kroppen');
      }
    }
    await side.close();
  }

  // --- 3. Kun e-mail maa vaere paakraevet, og den skal vaere markeret ---
  {
    const side = await browser.newPage();
    await side.goto(`http://localhost:${PORT}${SIDE}`, { waitUntil: 'load' });
    const paakraevede = await side.$$eval('form[name="kontakt"] [required]',
      (els) => els.map((e) => e.name || e.id));
    const uventede = paakraevede.filter((n) => n !== 'email');
    if (uventede.length) {
      fejl.push(`flere felter end e-mail er paakraevede (${uventede.join(', ')}) `
              + '— en mangelfuld henvendelse bliver da blokeret');
    } else {
      noter.push('kun e-mail er paakraevet');
    }

    const umarkerede = await side.$$eval('form[name="kontakt"] [required]', (els) =>
      els.map((el) => {
        const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
        return (label?.textContent || '').includes('*') ? null : (el.name || el.id);
      }).filter(Boolean));
    if (umarkerede.length) {
      fejl.push(`paakraevet felt uden stjerne (${umarkerede.join(', ')}) — den besoegende kan ikke se, hvad der mangler`);
    }

    const forklaret = await side.$eval('form[name="kontakt"]', (f) =>
      /\*/.test(f.textContent) && /udfyldes/i.test(f.textContent));
    if (!forklaret) {
      fejl.push('formularen forklarer ikke, hvad stjernen betyder');
    } else if (!umarkerede.length) {
      noter.push('e-mailfeltet er markeret med *, og stjernen er forklaret i formularen');
    }
    await side.close();
  }

  // --- 4. Konverteringsmaalingen: forberedt, men ikke aktiveret ---
  // Maalepunkterne skal virke i en rigtig browser, OG der maa ikke findes en
  // maaler. Bliver params.konvertering.aktiv sat til true ved et uheld, eller
  // snige en maaler sig ind ad en anden vej, fejler testen her.
  {
    const side = await browser.newPage();

    // Ethvert kald ud af siden registreres. Der maa ingen vaere.
    const udgaaende = [];
    await side.route('**/*', (rute) => {
      const u = rute.request().url();
      if (!u.startsWith(`http://localhost:${PORT}`)) udgaaende.push(u);
      rute.continue();
    });

    await side.goto(`http://localhost:${PORT}${SIDE}`, { waitUntil: 'load' });

    const tilstand = await side.evaluate(() => ({
      harFunktion: typeof window.kggKonverter === 'function',
      harPlausible: typeof window.plausible !== 'undefined',
      harDataLayer: typeof window.dataLayer !== 'undefined',
      gtag: typeof window.gtag !== 'undefined',
      maalepunkter: [...document.querySelectorAll('[data-konverter]')]
        .map((e) => e.getAttribute('data-konverter')),
    }));

    if (!tilstand.harFunktion) {
      fejl.push('window.kggKonverter findes ikke — maalingen er ikke forberedt');
    }
    for (const [navn, tilstede] of [['window.plausible', tilstand.harPlausible],
                                    ['window.dataLayer', tilstand.harDataLayer],
                                    ['window.gtag', tilstand.gtag]]) {
      if (tilstede) {
        fejl.push(`${navn} findes — konverteringsmaalingen er AKTIVERET. `
                + 'Den skal vaere forberedt, ikke aktiv. Se params.konvertering i hugo.toml.');
      }
    }
    for (const kraevet of ['kontakt-sms', 'kontakt-mail', 'formular-sendt']) {
      if (!tilstand.maalepunkter.includes(kraevet)) {
        fejl.push(`maalepunktet data-konverter="${kraevet}" mangler paa kontaktsiden`);
      }
    }

    // Uden en maaler skal et kald vaere helt uden virkning — men hendelsen
    // paa document skal stadig komme, saa en fremtidig maaler kan lytte.
    const kald = await side.evaluate(() => {
      const set = [];
      document.addEventListener('kgg:konvertering', (e) => set.push(e.detail));
      try { window.kggKonverter('proeve'); } catch (e) { return { fejl: e.message }; }
      return { set };
    });
    if (kald.fejl) {
      fejl.push(`kggKonverter kaster uden en maaler: ${kald.fejl}`);
    } else if (!kald.set || kald.set.length !== 1) {
      fejl.push('kggKonverter udsender ingen kgg:konvertering-hendelse');
    } else {
      noter.push('kggKonverter virker, udsender hendelsen og har ingen maaler at sende til');
    }

    // Konverteringen maa foerst taelles, NAAR indsendelsen er lykkedes.
    const taeltFoer = await side.evaluate(() => {
      window.__taelt = [];
      document.addEventListener('kgg:konvertering', (e) => window.__taelt.push(e.detail));
      return window.__taelt.length;
    });
    await side.fill('#email', 'test@example.dk');
    await side.click('form[name="kontakt"] button[type="submit"]');
    await side.waitForFunction(() => {
      const b = document.querySelector('[data-form-submit]');
      return b && /Sendt/.test(b.textContent);
    }, { timeout: 5000 }).catch(() => null);
    const taelt = await side.evaluate(() => (window.__taelt || []).length);
    if (taeltFoer !== 0) {
      fejl.push('der var allerede taelt en konvertering, foer formularen blev sendt');
    } else if (taelt !== 1) {
      fejl.push(`en lykket indsendelse taelte ${taelt} konverteringer — der skal taelles én`);
    } else {
      noter.push('en lykket indsendelse taelles én gang, og foerst naar den er lykket');
    }

    if (udgaaende.length) {
      fejl.push('siden henter noget udefra: ' + [...new Set(udgaaende)].slice(0, 5).join(', ')
              + ' — en maaler eller et tredjepartsscript er sluppet ind');
    } else {
      noter.push('ingen udgaaende kald fra kontaktsiden — ingen maaler, intet tredjepartsscript');
    }

    await side.close();
  }

  // --- 5. Netlify skal kunne se formularen ---
  const html = fs.readFileSync(sidefil, 'utf-8');
  for (const [udtryk, hvad] of [
    [/data-netlify=["']?true/i, 'data-netlify="true"'],
    [/name=["']?form-name["']?[^>]*value=["']?kontakt/i, 'skjult form-name-felt'],
    [/data-netlify-honeypot=["']?bot-field/i, 'honeypot'],
  ]) {
    if (!udtryk.test(html)) fejl.push(`formularen mangler ${hvad} — Netlify registrerer den ikke`);
  }
  if (!fejl.length) noter.push('Netlify Forms: data-netlify, form-name og honeypot er paa plads');
} finally {
  await browser.close();
  srv.close();
}

console.log('\nKONTAKTFORMULAR (kristiangg.dk)\n' + '='.repeat(58) + '\n');
if (fejl.length) {
  console.log(`FEJL (${fejl.length}):`);
  for (const f of fejl) console.log('  x', f);
  console.log();
}
if (noter.length) {
  console.log('KONTROLLERET:');
  for (const n of noter) console.log('  ·', n);
  console.log();
}
console.log('RESULTAT:', fejl.length ? 'FEJL FUNDET' : 'OK');
process.exit(fejl.length ? 1 : 0);

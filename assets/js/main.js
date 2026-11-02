// NavDropdown — hover with 120ms close delay
(function () {
  document.querySelectorAll('[data-dropdown]').forEach(function (nav) {
    var trigger = nav.querySelector('[data-dropdown-trigger]');
    var panel = nav.querySelector('[data-dropdown-panel]');
    var arrow = nav.querySelector('[data-dropdown-arrow]');
    if (!trigger || !panel) return;
    var t;

    function open() {
      clearTimeout(t);
      panel.classList.remove('hidden');
      if (arrow) arrow.classList.add('rotate-180');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close() {
      t = setTimeout(function () {
        panel.classList.add('hidden');
        if (arrow) arrow.classList.remove('rotate-180');
        trigger.setAttribute('aria-expanded', 'false');
      }, 120);
    }

    nav.addEventListener('mouseenter', open);
    nav.addEventListener('mouseleave', close);
    trigger.addEventListener('focus', open);
    trigger.addEventListener('blur', close);
    panel.addEventListener('mouseenter', function () { clearTimeout(t); });
    panel.addEventListener('mouseleave', close);
  });
})();

// MobileMenu — hamburger toggle + accordion sections
(function () {
  var trigger = document.querySelector('[data-mobile-menu-trigger]');
  var menu = document.querySelector('[data-mobile-menu]');
  if (!trigger || !menu) return;

  var openIcon = trigger.querySelector('[data-open-icon]');
  var closeIcon = trigger.querySelector('[data-close-icon]');

  trigger.addEventListener('click', function () {
    var isOpen = trigger.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      menu.classList.add('hidden');
      if (openIcon) openIcon.classList.remove('hidden');
      if (closeIcon) closeIcon.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      menu.classList.remove('hidden');
      if (openIcon) openIcon.classList.add('hidden');
      if (closeIcon) closeIcon.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Close menu when a non-section link is clicked
  menu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      menu.classList.add('hidden');
      if (openIcon) openIcon.classList.remove('hidden');
      if (closeIcon) closeIcon.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    });
  });

  // Accordion sections inside mobile menu
  document.querySelectorAll('[data-mobile-section]').forEach(function (section) {
    var sectionTrigger = section.querySelector('[data-mobile-section-trigger]');
    var sectionPanel = section.querySelector('[data-mobile-section-panel]');
    if (!sectionTrigger || !sectionPanel) return;

    sectionTrigger.addEventListener('click', function () {
      var expanded = sectionTrigger.getAttribute('aria-expanded') === 'true';
      sectionPanel.classList.toggle('hidden', expanded);
      sectionTrigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      var arrow = sectionTrigger.querySelector('[data-mobile-arrow]');
      if (arrow) arrow.classList.toggle('rotate-180', !expanded);
    });
  });
})();

// FAQ bruger nu <details>/<summary> og har ingen JavaScript.
// Den gamle accordion-kode er fjernet: den skjulte svarene med
// class="hidden", saa de var utilgaengelige uden JavaScript.

// Forudfyld kontaktformularen, naar man kommer fra en begivenhed.
// Linket er /kontakt/?begivenhed=<titel og dato>#skriv.
//
// Emnet saettes kun til en vaerdi, der FAKTISK findes i feltet. Et ukendt
// emne ville efterlade select'en tom, og et tomt "subject" betyder, at
// Netlify slet ikke sender notifikationsmailen — samme fejl som den, der
// kostede rigtige henvendelser. Derfor opslaget i options frem for en
// direkte tildeling.
//
// Teksten saettes med .value, ikke innerHTML: en vaerdi fra adresselinjen
// bliver da aldrig fortolket som markup.
(function () {
  var form = document.querySelector('form[name="kontakt"]');
  if (!form) return;

  var navn;
  try {
    navn = new URLSearchParams(window.location.search).get('begivenhed');
  } catch (e) {
    return;
  }
  if (!navn) return;
  navn = navn.slice(0, 200).trim();
  if (!navn) return;

  var emne = form.querySelector('[name="subject"]');
  if (emne) {
    var oensket = 'Tilmelding til begivenhed';
    for (var i = 0; i < emne.options.length; i++) {
      if (emne.options[i].value === oensket) {
        emne.value = oensket;
        break;
      }
    }
  }

  var besked = form.querySelector('[name="message"]');
  if (besked && !besked.value.trim()) {
    besked.value = 'Jeg vil gerne tilmelde mig: ' + navn + '\n\n';
  }
})();

// Konverteringsmaaling — FORBEREDT, IKKE AKTIVERET.
// ============================================================================
// Hele maskineriet staar faerdigt her. Det maaler ingenting, fordi ingen
// maaler indlaeses: params.konvertering.aktiv er false i hugo.toml, og
// layouts/partials/konvertering.html udsender derfor kun en kommentar.
//
// Fem ting er loest her, ikke lovet:
//
//   1. PRIMAER KONVERTERING. "formular-sendt" taelles foerst, naar Netlify
//      har kvitteret for indsendelsen. Et klik paa knappen er ikke en
//      henvendelse.
//
//   2. SEKUNDAERE HANDLINGER. kontakt-sms, kontakt-telefon, kontakt-mail og
//      gratis-forsamtale-priser taelles paa klik.
//
//   3. INGEN PERSONOPLYSNINGER. Kun noeglerne i TILLADTE_NOEGLER sendes, og
//      hver vaerdi renses for mailadresser og telefonnumre, foer den
//      forlader siden. Formularens felter roeres aldrig. Stien tages fra
//      location.pathname UDEN query og fragment, saa et ?begivenhed=... fra
//      adresselinjen heller ikke kan slippe med.
//
//   4. INGEN DOBBELTREGISTRERING. Tre spaerrer: modulet binder kun én gang,
//      hvert navn taelles hoejst én gang pr. sidevisning, og den primaere
//      konvertering taelles hoejst én gang pr. browsersession (sessionStorage),
//      saa en genindlaesning af kvitteringen eller et dobbeltklik ikke
//      taeller to.
//
//   5. SAMTYKKE. Kraever den valgte maaler samtykke, saettes
//      params.konvertering.samtykke_kraeves = true. Saa saettes
//      data-samtykke="kraeves" paa <html>, og INTET sendes, foer der
//      foreligger et ja. Handlinger undervejs laegges i koe og sendes
//      foerst ved samtykke — afvises der, kasseres de. Valget huskes i
//      localStorage, og window.kggSamtykke er API'et for banneret i
//      layouts/partials/samtykke.html.
//
// Maalepunkterne er data-konverter i markup'en. Se
// dokumentation/konverteringsmaaling.md.
(function () {
  if (window.kggKonverter) return;   // spaerre 1: aldrig bundet to gange

  var NOEGLE = 'kgg-samtykke';
  var SESSION_NOEGLE = 'kgg-konvertering';
  var TILLADTE_NOEGLER = ['side', 'kanal'];
  var PRIMAER = 'formular-sendt';
  var KOE_MAKS = 20;

  // ── Samtykke ──────────────────────────────────────────────────────────
  var kraeves = document.documentElement.getAttribute('data-samtykke') === 'kraeves';

  function laes(lager, noegle) {
    try { return window[lager] ? window[lager].getItem(noegle) : null; } catch (e) { return null; }
  }
  function skriv(lager, noegle, vaerdi) {
    try { if (window[lager]) window[lager].setItem(noegle, vaerdi); } catch (e) { /* privat vindue */ }
  }

  // 'givet' | 'afvist' | 'ukendt'. Uden krav om samtykke er svaret altid ja.
  function status() {
    if (!kraeves) return 'givet';
    var v = laes('localStorage', NOEGLE);
    if (!v) return 'ukendt';
    try {
      var d = JSON.parse(v);
      return d && (d.svar === 'givet' || d.svar === 'afvist') ? d.svar : 'ukendt';
    } catch (e) { return 'ukendt'; }
  }

  var koe = [];

  function saet(svar) {
    if (svar !== 'givet' && svar !== 'afvist') return;
    skriv('localStorage', NOEGLE, JSON.stringify({ svar: svar, tid: new Date().toISOString(), version: 1 }));
    if (svar === 'givet') {
      var ventende = koe.splice(0, koe.length);
      udsend('kgg:samtykke-givet', {});
      for (var i = 0; i < ventende.length; i++) aflever(ventende[i].navn, ventende[i].d);
    } else {
      koe.length = 0;                       // det ventende kasseres, ikke gemmes
      udsend('kgg:samtykke-afvist', {});
    }
  }

  window.kggSamtykke = {
    kraeves: function () { return kraeves; },
    status: status,
    giv: function () { saet('givet'); },
    afvis: function () { saet('afvist'); },
    glem: function () { try { window.localStorage.removeItem(NOEGLE); } catch (e) {} },
  };

  // ── Rensning ──────────────────────────────────────────────────────────
  var MAIL = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/g;
  var TELEFON = /(?:\+?\d[\s.\-()]?){8,}/g;

  function rens(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v !== 'string') return undefined;
    return v.replace(MAIL, '[fjernet]').replace(TELEFON, '[fjernet]').slice(0, 120);
  }

  function pak(detaljer) {
    var d = { side: String(window.location.pathname || '/').slice(0, 120) };
    if (detaljer) {
      for (var i = 0; i < TILLADTE_NOEGLER.length; i++) {
        var n = TILLADTE_NOEGLER[i];
        if (!Object.prototype.hasOwnProperty.call(detaljer, n)) continue;
        var v = rens(detaljer[n]);
        if (v !== undefined) d[n] = v;
      }
    }
    return d;
  }

  function udsend(navn, d) {
    try { document.dispatchEvent(new CustomEvent(navn, { detail: d })); }
    catch (e) {
      try {
        var h = document.createEvent('CustomEvent');
        h.initCustomEvent(navn, false, false, d);
        document.dispatchEvent(h);
      } catch (e2) { /* ingen hendelser i denne browser */ }
    }
  }

  // ── Afsendelse ────────────────────────────────────────────────────────
  function aflever(navn, d) {
    if (typeof window.plausible === 'function') {
      try { window.plausible(navn, { props: d }); } catch (e) {}
    }
    if (Object.prototype.toString.call(window.dataLayer) === '[object Array]') {
      try {
        var h = { event: navn };
        for (var k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) h[k] = d[k]; }
        window.dataLayer.push(h);
      } catch (e) {}
    }
    // Udsendes altid, ogsaa uden maaler, saa en fremtidig modtager kan lytte
    // uden at denne fil skal aendres.
    udsend('kgg:konvertering', d.navn ? d : (function () {
      var m = { navn: navn };
      for (var k2 in d) { if (Object.prototype.hasOwnProperty.call(d, k2)) m[k2] = d[k2]; }
      return m;
    })());
  }

  var taeltPaaSiden = {};               // spaerre 2: én gang pr. sidevisning

  function alleredeTaltISession(navn) { // spaerre 3: én primaer pr. session
    if (navn !== PRIMAER) return false;
    return laes('sessionStorage', SESSION_NOEGLE) === PRIMAER;
  }

  function kggKonverter(navn, detaljer) {
    if (!navn || typeof navn !== 'string') return false;
    navn = navn.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    if (!navn) return false;
    if (taeltPaaSiden[navn]) return false;
    if (alleredeTaltISession(navn)) return false;

    taeltPaaSiden[navn] = true;
    if (navn === PRIMAER) skriv('sessionStorage', SESSION_NOEGLE, PRIMAER);

    var d = pak(detaljer);
    var svar = status();
    if (svar === 'afvist') return false;
    if (svar === 'ukendt') {
      if (koe.length < KOE_MAKS) koe.push({ navn: navn, d: d });
      return false;
    }
    aflever(navn, d);
    return true;
  }

  window.kggKonverter = kggKonverter;

  // Klik paa kontaktpunkterne. Formularens knap er undtaget: den maales
  // foerst, naar indsendelsen er lykkedes — se ContactForm nedenfor.
  var punkter = document.querySelectorAll('[data-konverter]');
  for (var i = 0; i < punkter.length; i++) {
    (function (el) {
      if (el.hasAttribute('data-form-submit')) return;
      el.addEventListener('click', function () {
        kggKonverter(el.getAttribute('data-konverter'));
      });
    })(punkter[i]);
  }
})();

// ContactForm — AJAX submission for Netlify forms
(function () {
  var form = document.querySelector('[data-netlify-ajax]');
  if (!form) return;
  var statusEl = form.querySelector('[data-form-status]');
  var submitBtn = form.querySelector('[data-form-submit]');

  function showStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'p-4 rounded-lg text-sm ' +
      (type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800');
    statusEl.classList.remove('hidden');
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);

    // Sikkerhedsnet: Netlify bruger feltet "subject" som emnelinje paa
    // notifikationsmailen, og en TOM vaerdi betyder, at der slet ingen mail
    // sendes — henvendelsen gemmes, men naar aldrig frem til indbakken.
    // Pladsholderen i formularen har derfor en rigtig vaerdi; det her fanger
    // tilfaelde, hvor feltet alligevel er tomt (gammel side i en aaben fane,
    // browser-autofyld, en fremtidig aendring af formularen).
    if (!String(data.get('subject') || '').trim()) {
      data.set('subject', 'Henvendelse uden emne');
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sender\u2026';
    }

    fetch(form.getAttribute('action') || '/', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: data,
    })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          showStatus('Tak for din besked! Jeg vender tilbage inden for 24 timer.', 'success');
          if (submitBtn) submitBtn.textContent = 'Sendt \u2713';
          // Konverteringen taelles FOERST her: naar Netlify har kvitteret.
          // Et klik paa knappen er ikke en henvendelse. Kun handlingens navn
          // sendes med — intet indhold fra formularen.
          if (typeof window.kggKonverter === 'function') {
            window.kggKonverter('formular-sendt');
          }
        } else {
          showStatus('Noget gik galt. Prøv igen eller ring til mig direkte.', 'error');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send besked'; }
        }
      })
      .catch(function () {
        showStatus('Netværksfejl. Tjek din forbindelse og prøv igen.', 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send besked'; }
      });
  });
})();

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

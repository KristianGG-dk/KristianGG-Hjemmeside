# Konverteringsmåling — forberedt, ikke aktiveret

Status pr. 2. november 2026: **alt ligger klar, intet måler.**

Der indlæses ingen måler, sendes intet netværkskald, sættes ingen cookie og
kræves intet samtykke. Besøgende på kristiangg.dk bliver ikke sporet.

Aktivering er to linjer i `hugo.toml`. Resten er bygget.

---

## Hvad der allerede er på plads

Målingen består af tre dele. De to første virker allerede. Den tredje er
bevidst slået fra.

### 1. Målepunkterne — i markup'en

Hvert element, der tæller som en konvertering, bærer `data-konverter`:

| Navn | Hvor | Hvad det betyder |
|---|---|---|
| `kontakt-sms` | kontaktknapperne, mobilmenuen | nogen åbner en SMS til Kristian |
| `kontakt-mail` | kontaktknapperne, footeren, begivenhedssiderne | nogen går til kontaktformularen |
| `kontakt-telefon` | kontaktknapperne, footeren | nogen trykker på nummeret |
| `gratis-forsamtale-priser` | blokken om den gratis forsamtale | nogen går videre til priserne derfra |
| `formular-sendt` | kontaktformularens knap | en henvendelse er **kommet igennem** |

Attributterne er inerte. De gør intet i sig selv.

Filer: `layouts/partials/kontakt-knapper.html`, `layouts/partials/header.html`,
`layouts/partials/footer.html`, `layouts/partials/contact-form.html`,
`layouts/partials/gratis-forsamtale.html`,
`layouts/begivenheder/single.html`.

### 2. Opsamlingen — i `assets/js/main.js`

`window.kggKonverter(navn)` afleverer til den måler, der **faktisk** findes:

* `window.plausible`, hvis den er indlæst
* `window.dataLayer`, hvis den findes som array
* og altid en `kgg:konvertering`-hændelse på `document`, så en fremtidig
  måler kan lytte uden at denne fil skal ændres

Findes ingen af dem — og det gør der ikke i dag — gør funktionen ingenting.

To ting er værd at bemærke:

* **`formular-sendt` tælles først, når Netlify har kvitteret.** Et klik på
  knappen er ikke en henvendelse.
* **Der sendes aldrig indhold med.** Kun handlingens navn og sidens sti.
  En besked, en mailadresse eller et telefonnummer forlader aldrig siden
  ad denne vej.

### 3. Afsenderen — slået fra

`layouts/partials/konvertering.html` udsender kun en HTML-kommentar, så længe
`params.konvertering.aktiv` er `false`.

---

## Sådan aktiveres målingen

**Afklar samtykke først.** Valget af udbyder afgør, om der skal indhentes
samtykke, og det skal være afgjort, før kontakten slås til:

| Udbyder | Cookies | Samtykkebanner | Databehandleraftale |
|---|---|---|---|
| Plausible | nej | nej, efter udbyderens egen vurdering — bør bekræftes af Kristians egen rådgiver | ja |
| GA4 | ja | ja | ja, og vurdering af overførsel til tredjeland |

Derefter, i `hugo.toml`:

```toml
[params.konvertering]
  aktiv = true
  udbyder = "plausible"      # eller "ga4"
  id = "kristiangg.dk"       # domænet hos Plausible, eller G-XXXXXXXXXX
```

Netlify bygger ved push, og målingen er i luften. Intet andet skal ændres.

**Begge veje er afprøvet.** Et prøvebyg med `plausible` lagde scriptet og
`window.plausible` på siden; et prøvebyg med `ga4` lagde
`googletagmanager.com/gtag/js?id=…` og `gtag("config", …)` på siden. Begge
prøvebyg blev kasseret, og `aktiv` står på `false`.

Vælges en anden udbyder end de to, skal `konvertering.html` udvides med en
gren mere. Opsamlingen i `main.js` behøver ikke ændres, hvis udbyderen
leverer `window.dataLayer` eller `window.plausible` — ellers lyt på
`kgg:konvertering`.

---

## Hvad der holder målingen slukket

`tests/hjemmeside.mjs` fejler, hvis en af disse ting bliver sand:

* `params.konvertering.aktiv` er ikke `false`
* en målervært (plausible.io, googletagmanager.com, google-analytics.com,
  matomo, hotjar, clarity, facebook, segment, mixpanel) optræder i en
  bygget side
* en side opretter `dataLayer`, kalder `gtag(` eller `fbq(`
* den byggede JavaScript **tildeler** `window.dataLayer` eller
  `window.plausible` i stedet for kun at læse dem
* et målepunkt mangler

`tests/kontaktformular.mjs` fejler desuden, hvis kontaktsiden i en rigtig
browser henter så meget som én ting udefra.

Testen er afprøvet mod det modsatte: med `aktiv = true` og GA4 fandt den
alle tre tegn og blev rød.

Den dag målingen SKAL aktiveres, skal forventningen i
`tests/hjemmeside.mjs` (afsnit C) vendes om — ellers er gaten rød. Det er
med vilje: aktivering skal være en beslutning, ikke et uheld.

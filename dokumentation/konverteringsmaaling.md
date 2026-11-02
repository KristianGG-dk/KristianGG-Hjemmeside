# Konverteringsmåling — teknisk færdig, ikke aktiveret

Status 2. november 2026: **alt er bygget og afprøvet. Intet måler.**

Der indlæses ingen måler, sendes intet netværkskald, sættes ingen cookie og
kræves intet samtykke. Besøgende på kristiangg.dk bliver ikke sporet.
Aktivering er nogle få linjer i `hugo.toml` — se afsnit 6.

---

## 1. De fem krav, og hvor de er løst

| Krav | Hvor | Afprøvet |
| --- | --- | --- |
| Primær konvertering ved **bekræftet** indsendelse | `assets/js/main.js`, ContactForm | `tests/konvertering.mjs` |
| Sekundære handlinger: telefon, SMS, mail | `data-konverter` i markup'en | `tests/konvertering.mjs` |
| Ingen personoplysninger fra formularen | hvidliste + rensning i `main.js` | `tests/konvertering.mjs` |
| Samtykke, når det kræves | `kggSamtykke` + `samtykke.html` + Consent Mode v2 | `tests/konvertering.mjs` |
| Ingen dobbeltregistrering | tre spærrer i `main.js` | `tests/konvertering.mjs` |

## 2. Målepunkterne

| Navn | Hvor | Hvad det betyder |
| --- | --- | --- |
| `formular-sendt` | kontaktformularens knap | **primær.** En henvendelse er kommet igennem |
| `kontakt-sms` | kontaktknapperne, mobilmenuen | nogen åbner en SMS |
| `kontakt-telefon` | kontaktknapperne, footeren | nogen trykker på nummeret |
| `kontakt-mail` | kontaktknapperne, footeren, begivenhedssiderne | nogen går til formularen |
| `gratis-forsamtale-priser` | blokken om den gratis forsamtale | nogen går videre til priserne derfra |

Attributterne er inerte. De gør intet i sig selv.

## 3. Den primære konvertering tælles rigtigt

`formular-sendt` sendes **først, når Netlify har kvitteret** for
indsendelsen — ikke når der klikkes. Et klik på en knap er ikke en
henvendelse, og en konto, der måler klik, optimerer mod klik.

Tre spærrer mod dobbelttælling:

1. **Modulet binder kun én gang.** `if (window.kggKonverter) return;`
2. **Hvert navn tælles højst én gang pr. sidevisning.**
3. **Den primære højst én gang pr. browsersession** (`sessionStorage`), så en
   genindlæsning af kvitteringen eller et dobbeltklik ikke tæller to.

En **ny** session kan tælle igen — ellers ville en rigtig henvendelse fra
samme person en anden dag gå tabt.

## 4. Ingen personoplysninger

Dette er håndhævet, ikke lovet:

- Kun nøglerne i `TILLADTE_NOEGLER` (`side`, `kanal`) sendes. Alt andet
  kasseres, også hvis nogen kalder `kggKonverter` med det.
- Hver værdi renses for mailadresser og telefonnumre, før den forlader
  siden.
- Stien tages fra `location.pathname` **uden** query og fragment, så
  `?begivenhed=...` fra adresselinjen heller ikke kan slippe med.
- Formularens felter røres aldrig.

Afprøvet med en besked, der indeholdt både en mailadresse og et
telefonnummer: det, der nåede måleren, var
`{"event":"kontakt-mail","side":"/kontakt/","kanal":"[fjernet] ringer paa [fjernet]"}`.

## 5. Samtykke

`params.konvertering.samtykke_kraeves` afgør, om der skal foreligge et ja.

| Udbyder | Cookies | Samtykke | Banner |
| --- | --- | --- | --- |
| Plausible | nej | efter udbyderens vurdering ikke nødvendigt — bør bekræftes af Kristians egen rådgiver | kun hvis `samtykke_kraeves = true` |
| GA4 | ja | ja | ja |

Når samtykke kræves:

- `data-samtykke="kraeves"` sættes på `<html>`, så `main.js` ved det, før
  noget kører.
- **Intet sendes før et svar.** Handlinger undervejs lægges i kø og sendes
  først ved et ja. Ved et nej kasseres de, og intet nyt sendes.
- Valget huskes i `localStorage` og overlever genindlæsning.
- **Plausible hentes slet ikke**, før der er sagt ja — scriptet er ikke på
  siden, ikke bare slået fra.
- **GA4** sættes til Consent Mode v2 `denied` på alle fire signaler, før
  `gtag.js` hentes, og opdateres først ved et ja.
- Banneret i `layouts/partials/samtykke.html` spærrer ikke siden. Man kan
  læse videre uden at svare — så måles der bare ingenting.

## 6. Sådan aktiveres det

**Afklar samtykke først.** Valget af udbyder afgør, om der skal indhentes
samtykke, og det skal være afgjort, før kontakten slås til.

```toml
[params.konvertering]
  aktiv = true
  udbyder = "plausible"      # eller "ga4"
  id = "kristiangg.dk"       # domænet hos Plausible, eller G-XXXXXXXXXX
  samtykke_kraeves = false   # SKAL være true ved ga4
  ads_id = ""                # AW-XXXXXXXXXX, kun hvis Google Ads skal have tallene
  ads_label = ""
```

**Alle fire veje er afprøvet i et prøvebyg og kasseret igen:** Plausible med
og uden samtykke, GA4 med Consent Mode, og GA4 med Google Ads
(`gtag("config","AW-…")` og `send_to:"AW-…/<etiket>"` lå korrekt på siden).

To ting følger med af sig selv:

- **Privatlivspolitikken retter sig selv.** `/privatliv/` siger i dag, at
  siden ikke bruger værktøjer til statistik. Teksten ligger i
  `layouts/shortcodes/maaling.html` og følger `params.konvertering`, så de
  to ikke kan komme i utakt. `tests/hjemmeside.mjs` fejler, hvis de gør.
- **Google Ads arver spærrerne.** Konverteringen til Ads sendes gennem den
  samme hændelse som alt andet og arver derfor samtykket, de to
  dobbeltspærrer og rensningen. Der findes ingen vej udenom.

**Gaten bliver rød ved aktivering.** `tests/hjemmeside.mjs` afsnit C kræver
i dag, at målingen er slukket. Forventningen skal vendes om samtidig. Det er
med vilje: aktivering skal være en beslutning, ikke et uheld.

## 7. Hvad der holder målingen slukket

`tests/hjemmeside.mjs` fejler, hvis:

- `params.konvertering.aktiv` ikke er `false`
- `udbyder = "ga4"` uden `samtykke_kraeves = true`
- en målervært optræder i en bygget side (plausible.io, googletagmanager,
  google-analytics, matomo, hotjar, clarity, facebook, segment, mixpanel)
- en side opretter `dataLayer`, kalder `gtag(` eller `fbq(`
- den byggede JavaScript **tildeler** `window.dataLayer` eller
  `window.plausible` i stedet for kun at læse dem
- samtykkebanneret eller `data-samtykke` dukker op
- `/privatliv/` og konfigurationen siger forskellige ting
- et målepunkt mangler

`tests/kontaktformular.mjs` fejler desuden, hvis kontaktsiden i en rigtig
browser henter så meget som én ting udefra.

Testene er afprøvet mod det modsatte: med `aktiv = true` og GA4 blev de røde
på alle tegn. De er ikke tomme.

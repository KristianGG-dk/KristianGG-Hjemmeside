# Google Ads — teknisk forberedt

Status 2. november 2026: **intet er oprettet, intet er aktiveret, intet koster penge.**
Hjemmesiden og målingen er klar. Det, der mangler, er en konto, to id'er og
Kristians beslutning.

Dette dokument er ikke en marketingplan. Det er den tekniske og
regelmæssige forberedelse: hvilke sider der kan tage imod trafik, hvad der
må og ikke må siges, hvad der skal måles, og hvad der skal udfyldes for at
tænde.

---

## 1. Hvad der allerede er på plads

| Krav til en annoncekonto | Status |
| --- | --- |
| Landingssider, der svarer på søgningen | ✔ ni sider, se afsnit 2 |
| Mobilvenlige sider | ✔ målt: ingen vandret rul, ingen konsolfejl, 390 px og 1280 px |
| Hurtige sider | ✔ målt i produktion: TTFB 101 ms, LCP 173 ms, 9 anmodninger, 40 kB |
| Fungerende kontaktvej | ✔ formular, SMS, telefon og mail, alle målt |
| Konverteringsstruktur | ✔ bygget og afprøvet, se afsnit 5 |
| Privatlivspolitik | ✔ og den opdaterer sig selv, når målingen tændes |
| Samtykke | ✔ bygget, se `konverteringsmaaling.md` |
| `gclid` ødelægger ikke canonical | ✔ canonical udregnes uden query — en annonceklik-adresse skaber ingen dublet |

Det sidste er værd at dvæle ved: Google Ads hænger `?gclid=...` på hver
adresse. Peger canonical på adressen *med* query, indekserer Google den som
en selvstændig side, og den optjente værdi spredes. Det gør den ikke her —
`layouts/partials/head.html` bruger `.Permalink`, og produktionskontrollen
efterprøver på hver eneste side, at canonical peger på siden selv.

## 2. Landingssider

Der oprettes **ingen** nye landingssider. Siderne findes, de er indekserede,
og de har optjent værdi. En kopi til annoncebrug ville konkurrere med dem.

| Annoncegruppe | Landingsside | Hvorfor den passer |
| --- | --- | --- |
| Psykoterapi | `/til-dig/psykoterapi/` | metodesiden, med FAQ om forskellen på psykolog og psykoterapeut |
| Stress | `/til-dig/stress/` | problemsiden, med «det, folk oftest beskriver» |
| Angst | `/til-dig/angst/` | problemsiden, med tydelig afgrænsning af, hvad han ikke er |
| Søvn | `/til-dig/soevnproblemer/` | problemsiden |
| Naturterapi | `/til-dig/naturterapi/` | egen arbejdsform, ikke samtaler flyttet udenfor |
| Skovbad | `/kurser/skovbad/` | hold, egen tilmelding |
| Priser | `/priser/` | til søgninger med «pris» og «hvad koster» |
| Erhverv | `/til-virksomheder/` | foredrag, workshops, trivsel |
| Kommuner | `/til-kommuner/` | borgerforløb, særforanstaltninger, vikardækning |

Alle ni har nu den gratis forsamtale øverst undtagen `/priser/` (som har
kortet «Gratis forsamtale · Start her») og erhvervssiderne (hvor en privat
forsamtale ikke er indgangen). Det er bevidst — se `gratis-forsamtale.md`.

## 3. Søgeord med købsintention

Kun søgninger, hvor nogen leder efter **en behandler i Odense eller på Fyn**.
Ikke «hvad er stress».

**Psykoterapi**
`psykoterapeut odense` · `psykoterapi odense` · `psykoterapeut fyn` ·
`samtaleterapi odense` · `terapeut odense` · `hypnoterapi odense` ·
`walk and talk terapi odense`

**Problemorienteret** (sættes i egne annoncegrupper, så annonceteksten kan
være præcis)
`hjælp til stress odense` · `stressforløb odense` · `hjælp til angst odense` ·
`terapi mod søvnproblemer odense`

**Natur**
`naturterapi fyn` · `naturterapi odense` · `skovbad fyn` · `skovbad odense` ·
`skovbadning fyn`

**Pris**
`hvad koster psykoterapi` · `pris psykoterapeut odense`

**Erhverv**
`foredrag trivsel fyn` · `stressworkshop virksomhed fyn` ·
`psykoterapeut vikar kommune`

Matchtype: start med **sætningsmatch**. Bredt match uden et modent
negativlistegrundlag er den hurtigste vej til spildte kroner på en lille
konto.

## 4. Negative søgeord

Den vigtigste liste. Uden den betaler en lille lokal konto for hele landets
nysgerrighed.

**Må aldrig udløse en annonce — faglig og juridisk grund**

`psykolog` · `psykologhjælp` · `autoriseret psykolog` · `psykolograpport` ·
`psykiater` · `læge` · `diagnose` · `udredning` · `medicin` · `recept` ·
`sygesikring` · `henvisning`

Begrundelsen står på hans egen side: *«Psykolog er en beskyttet titel … Jeg
er ikke psykolog og ikke læge. Jeg stiller ikke diagnoser og behandler ikke
sygdom.»* At byde på `psykolog` ville sælge noget, han ikke er, og det er
både en platformsrisiko og en markedsføringsretlig.

**Søger ikke en behandler**

`gratis` · `selvhjælp` · `app` · `test` · `quiz` · `symptomer` · `hvad er` ·
`betyder` · `wikipedia` · `pdf` · `øvelser` · `youtube` · `podcast`

**Søger uddannelse eller arbejde**

`uddannelse` · `psykoterapeutuddannelse` · `bliv psykoterapeut` · `kursus` ·
`studerende` · `praktik` · `job` · `ledig stilling` · `løn` · `cv` · `eksamen`

> Bemærk: `/priser/` har «Egenterapi for studerende». Ordet `studerende`
> ligger alligevel på negativlisten, fordi søgninger med det ord
> overvældende handler om at læse til psykoterapeut. Skal den ydelse
> markedsføres, sker det i en egen annoncegruppe med `egenterapi` som
> søgeord, ikke ved at lukke op for hele ordet.

**Ydelser der ikke tilbydes**

`parterapi` · `familieterapi` · `børn` · `barn` · `teenager` · `ungdom` ·
`misbrugsbehandling` · `alkoholbehandling` · `sexolog` · `coach uddannelse`

**Forkert geografi** (ud over geomålretningen, som sorteren det meste fra)

`københavn` · `aarhus` · `aalborg` · `esbjerg` · `online gratis`

## 5. Konverteringsstruktur

Den er allerede bygget. Se `konverteringsmaaling.md` for mekanikken.

| Handling | Rolle i Ads | Konverteringshandling | Tælling |
| --- | --- | --- | --- |
| `formular-sendt` | **primær** | «Henvendelse (formular)», kategori *Indsend kundeemneformular* | Én |
| `kontakt-telefon` | sekundær, kun observation | «Tryk på telefonnummer», kategori *Telefonopkald* | Én |
| `kontakt-sms` | sekundær, kun observation | «Tryk på SMS» | Én |
| `kontakt-mail` | sekundær, kun observation | «Gik til kontaktformularen» | Én |
| `gratis-forsamtale-priser` | ikke en konvertering | — | — |

**Kun den primære må indgå i budgivningen.** Sættes et klik på et
telefonnummer som konverteringsmål, optimerer Google mod klik, ikke mod
henvendelser, og en lille konto bliver hurtigt dyr uden at give flere
klienter.

`formular-sendt` tælles **først, når Netlify har kvitteret** — ikke ved
klik på knappen — og højst én gang pr. browsersession. Det er afprøvet i
`tests/konvertering.mjs`.

To veje ind i Ads:

1. **Via GA4** (anbefalet): markér `formular-sendt` som nøglehændelse i GA4
   og importér den i Ads. Intet ekstra på hjemmesiden.
2. **Direkte**: udfyld `ads_id` og `ads_label` i `hugo.toml`. Så sendes
   konverteringen gennem den samme hændelse som alt andet og arver dermed
   samtykket, dobbeltspærrerne og rensningen for personoplysninger. Der
   findes ingen vej udenom.

## 6. Geografisk målretning

- **Målret:** Odense med radius 30 km. Det dækker Fyn-oplandet, hvorfra
  nogen faktisk vil køre til Lumbyvej.
- **Tilføj som separat gruppe med eget bud:** resten af Fyn (Svendborg,
  Nyborg, Middelfart, Faaborg) — naturterapien foregår i landskabet, så
  afstanden betyder mindre dér.
- **Placeringsindstilling:** «Tilstedeværelse: personer i eller regelmæssigt
  i dit målretningsområde». Ikke «interesse» — den medtager hele landets
  søgninger efter «odense», og det er den dyreste enkeltfejl på en lokal
  konto.
- **Udeluk:** resten af Danmark og udlandet.
- Sproget sættes til dansk. Annoncetekst på dansk.

## 7. Hvad reglerne kræver

### Googles egne regler

Mental sundhed er en **følsom kategori** hos Google. Konsekvenserne er
konkrete:

- **Ingen remarketing.** Lister bygget af besøgende på terapisider udleder
  helbred af adfærd, og det er ikke tilladt. Det gælder også Customer Match.
- **Kun foruddefinerede målgrupper.** Geografi, in-market- og
  affinitetssegmenter kan bruges, fordi Google selv holder følsomme signaler
  ude af dem.
- **Demand Gen og Discovery** kan blive begrænset i følsomme kategorier.
  Hold kampagnen til **Søgenetværket**.
- **Annonceteksten må ikke antage en tilstand hos den, der ser den.**
  «Kæmper du med angst?» er en overtrædelse. «Psykoterapi i Odense —
  første samtale er gratis» er ikke.

Kilderne til dette afsnit er sekundære (se nederst). Googles egen
politikside bør slås op, inden kontoen oprettes.

### Danske regler

Markedsføring af sundhedsydelser er reguleret:

- Den skal være **saglig** og må ikke være urigtig, vildledende eller
  mangelfuld.
- Den må **ikke være lige så pågående eller forbrugsstimulerende** som
  markedsføring af almindelige varer. Begrundelsen er, at mennesker med
  helbredsbekymringer er særligt påvirkelige.
- **Levende billeder** er begrænsede. Video med markedsføring af
  sundhedsydelser på sociale medier er ikke tilladt, og tv-reklame er
  forbudt. Det udelukker YouTube-annoncer og videoannoncer på Meta — en
  tekstannonce på Søgenetværket er ikke berørt.
- Tilsynet føres af Styrelsen for Patientsikkerhed, og overtrædelser kan
  straffes med bøde eller påbud om at standse markedsføringen.

`stps.dk` kunne ikke hentes fra arbejdsmiljøet, så ovenstående bygger på
sekundære kilder. **Det bør bekræftes direkte hos Styrelsen for
Patientsikkerhed, før den første annonce går i luften** — især spørgsmålet
om, hvorvidt reglerne også omfatter ikke-autoriserede behandlere.

### Hans egne afgrænsninger

Annonceteksten skal kunne stå ved siden af det, siderne allerede siger:

- Han er **ikke psykolog og ikke læge**, stiller ikke diagnoser og behandler
  ikke sygdom. Ordet «behandling» i en annonce skal derfor bruges varsomt —
  «forløb», «samtaler» og «hjælp til» siger det samme uden at love noget
  klinisk.
- Trustpilot-scoren må gerne nævnes som almindelig tekst, men **aldrig
  markeres op som `aggregateRating`** — det er allerede respekteret i
  `data/business.toml`, og det gælder også annonceudvidelser.
- Priser i annoncer skal stemme med `/priser/`.

## 8. Sådan tændes det

1. Opret Google Ads-kontoen. Opret **ingen** kampagne endnu.
2. Opret konverteringshandlingen «Henvendelse (formular)». Notér `AW-…` og
   etiketten.
3. Vælg måler: Plausible (ingen cookies, intet banner) eller GA4 (cookies,
   banner, Consent Mode). Skal tallene direkte i Ads, er GA4 den korte vej.
4. Udfyld i `hugo.toml`:

   ```toml
   [params.konvertering]
     aktiv = true
     udbyder = "ga4"
     id = "G-XXXXXXXXXX"
     samtykke_kraeves = true
     ads_id = "AW-XXXXXXXXXX"
     ads_label = "<etiketten>"
   ```

5. Push. Netlify bygger. Privatlivspolitikken retter sig selv.
6. **Gaten bliver rød**, fordi `tests/hjemmeside.mjs` i dag kræver, at
   målingen er slukket. Vend forventningen i afsnit C. Det er med vilje:
   aktivering skal være en beslutning, ikke et uheld.
7. Kontrollér i Ads, at konverteringen registreres, før der sættes budget
   på. Først derefter oprettes kampagnen.

Intet af dette gør jeg uden din godkendelse, og intet af det koster noget,
før trin 7 er gennemført.

---

**Kilder til afsnit 7.** Googles politik for personaliseret annoncering og
følsomme kategorier er gengivet efter sekundære kilder, bl.a.
[Curve Compliance](https://www.curvecompliance.com/ad-account-rescue/google-ads-personalized-advertising-sensitive-health),
[PPC Land](https://ppc.land/google-tightens-demand-gen-and-discovery-ad-serving-for-sensitive-categories/)
og [WordStream](https://www.wordstream.com/blog/google-ads-sensitive-categories).
De danske regler er gengivet efter
[Styrelsen for Patientsikkerhed](https://stps.dk/sundhedsfaglig/tilsyn/tilsyn-med-markedsfoering-af-sundhedsydelser)
(kunne ikke hentes herfra),
[Ergoterapeutforeningen](https://www.etf.dk/Min-Karriere/For-dig-som-er/Privatpraktiserende/Regler-omkring-markedsfoering-af-sundhedsydelser)
og [vejledning VEJ nr 9319 af 26/06/2013](https://www.retsinformation.dk/eli/retsinfo/2013/9319/pdf).
Begge afsnit bør bekræftes ved kilden, før den første krone bruges.

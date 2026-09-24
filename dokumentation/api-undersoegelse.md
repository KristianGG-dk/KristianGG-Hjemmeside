# Kan LinkedIn og Google publiceres automatisk?

Teknisk undersøgelse, 19. september 2026. **Ingen produktionsændring foretaget.**
Bestilt af Kristian, som ville vide, om manuel publicering til LinkedIn og
Google Business Profile er en reel API-begrænsning eller blot noget, der ikke
er bygget.

## Forbehold, som skal læses først

Kristian bad om, at konklusionerne bygger på **aktuel officiel dokumentation**
fra LinkedIn/Microsoft og Google, og at der ikke gættes.

**Jeg kunne ikke læse den officielle dokumentation.** Miljøets netværkspolitik
afviser `learn.microsoft.com` og `developers.google.com` med 403 i
egress-proxyen. Det er afprøvet, ikke antaget.

Derfor er dokumentet delt i to slags udsagn, og de er mærket hver gang:

| | |
| --- | --- |
| **MÅLT** | Læst direkte i vores egen kildekode. Kan efterprøves af enhver med adgang til repoet. Dette er langt hovedparten af dokumentet. |
| **SØGT** | Fra søgeresultater, der refererer den officielle dokumentation. Det er andenhånds og **skal bekræftes mod den levende dokumentation**, før noget bygges på det. |

Der er en tredje og bedre vej, som er beskrevet til sidst: motoren har
allerede et mønster for **læsende adgangskontroller**, der spørger API'et selv
i stedet for at læse om det. Et API's eget svar rangerer over dokumentation.

---

# 1. Hvad motoren har i dag

**MÅLT.** Alle tal herunder er læst i repoet.

## LinkedIn er allerede halvt bygget

`publicering/scripts/publicer-linkedin.mjs` findes — 62 linjer, skrevet men
aldrig taget i brug.

```
POST https://api.linkedin.com/rest/posts
headers:  Authorization: Bearer <LI_ACCESS_TOKEN>
          LinkedIn-Version: 202509
          X-Restli-Protocol-Version: 2.0.0
payload:  { author: <LI_PERSON_URN>, commentary: <låst tekst>,
            visibility: PUBLIC, lifecycleState: PUBLISHED, ... }
```

Den kontrollerer versionslåsen, tekstens hash og godkendelsen, **før** den
sender noget, og tørløb er standard. Post-id'et læses ud af `x-restli-id`.

`publicer-social.yml` router allerede kanalen `linkedin` til scriptet, og
`LI_ACCESS_TOKEN` og `LI_PERSON_URN` er koblet til som hemmeligheder.

**Det, der mangler i scriptet:**

- **Billeder.** Scriptet kan tekst og et artikel-link. Alle Kristians
  LinkedIn-elementer har et billede. Det er den største kodemangel.
- **Ingen adgangskontrol.** Meta og Instagram har hver sit læsende
  `kontroller-*-adgang.mjs`. LinkedIn har ingen.
- **Ingen planlagt kørsel.** Instagram har `publicer-instagram-planlagt.yml`
  med cron. LinkedIn har kun den manuelt startede workflow.

## Google Business Profile er slet ikke bygget

Der findes intet `publicer-gbp.mjs`, ingen adgangskontrol, ingen workflow og
ingen hemmeligheder. Kanalen `gbp` optræder kun i køen og registret.

## Et hul, der rammer begge

**Ingen af de manuelle elementer har en låsefil.**

```
11 manuelle rækker i køen — 11 uden låsefil
kanaler:   linkedin, gbp
elementer: 2, 4, 5, 7, 9, 11, 13, 14, 26, 27, 28
```

Det er i dag korrekt: en låsefil er motorens kvittering for, at det, der
publiceres, er det godkendte — og når et menneske publicerer, er der intet at
kvittere for.

**Bliver kanalerne automatiske, vender det.** Så skal hvert element have en
låsefil, ellers kan motoren ikke verificere, hvad den er ved at sende. Det er
konkret arbejde: elleve låsefiler, bygget ud fra de allerede godkendte tekster.

Og så skærpes en kendt svaghed: gaten kontrollerer i dag kun brødteksten
**dybt for website-elementer**. For sociale elementer kontrolleres felterne og
låsen, men `tekst` er ikke et låst felt. Det er den åbne opgave om
`verificer.mjs`. I dag fanges en ændret social tekst af publiceringsscriptet og
vagthunden. Går to kanaler mere i drift, skal den fanges af gaten.

---

# 2. LinkedIn

## Personlig profil kontra organisationsside

**SØGT.** De to er forskellige produkter med hver sin adgangsvej:

| | Personlig profil | Organisationsside |
| --- | --- | --- |
| Scope | `w_member_social` | `w_organization_social` |
| Produkt | «Share on LinkedIn» | Community Management API |
| Adgang | selvbetjening i Developer Portal | kræver godkendelse |

Kristian publicerer fra sin **personlige profil**. Det er den lette vej, og
det er den, motorens script allerede er skrevet til.

## Er `w_member_social` nok?

**SØGT, skal bekræftes.** Søgeresultaterne peger på, at `w_member_social`
følger med produktet «Share on LinkedIn», og at det dækker oprettelse af
opslag via Posts API. Billeder kræver et ekstra trin:

```
POST https://api.linkedin.com/rest/images?action=initializeUpload
  → upload-URL + urn:li:image:...
  → billedet lægges på upload-URL'en
  → urn'en sættes ind i opslagets content
```

**Det er ikke bekræftet fra den officielle dokumentation**, om `w_member_social`
alene dækker billedtrinnet. Det skal afklares, før der bygges.

## Tokenets levetid er den reelle hage

**SØGT, og det vigtigste fund.** Et access token lever **60 dage**.
Programmatiske refresh tokens gives kun til godkendte
Marketing-Developer-Platform-partnere — ikke til en selvbetjenings-app.

Konsekvensen, hvis det står ved magt: **Kristian skal godkende på ny cirka
hver anden måned** og lægge et nyt token i GitHub Secrets. Ellers stopper
LinkedIn-publiceringen.

Det gør ikke automatisering meningsløs — seks opslag i kvartalet lagt op
automatisk mod ét login hver anden måned er stadig en gevinst. Men det skal
med i beslutningen, og vagthunden skal advare i god tid før udløb.

## Kategorisering

| Spørgsmål | Kategori |
| --- | --- |
| Kan API'et publicere tekst til en personlig profil? | **4 — kan implementeres nu**, scriptet findes |
| Kan det publicere billeder? | **3 — ikke bygget**, og scope skal bekræftes |
| Har vi adgang? | **2 — app og token mangler** |
| Kan motoren publicere på tidspunktet? | **3 — ikke bygget.** Mønstret findes i Instagram-workflowen |

**Ingenting falder i kategori 1.** Manuel LinkedIn-publicering er ikke en
API-begrænsning.

---

# 3. Google Business Profile

## Endepunktet

**SØGT.** Local Posts ligger stadig på v4:

```
POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/localPosts
```

Dele af v4 er udfaset til Account Management- og Business-Information-API'erne,
og `reportInsights` er flyttet til Business Performance API. **Local Posts selv
ser ud til at være på v4 endnu.** Det skal bekræftes.

Scope: `https://www.googleapis.com/auth/business.manage`.

## Adgang er porten, ikke koden

**SØGT, og det afgørende.** Business-Profile-API'erne kræver, at projektet
**godkendes via en ansøgningsformular**. Indtil da er kvoten **0 QPM** — alle
kald afvises.

Godkendelse gives til den, der kan påvise en legitim forretningsmæssig grund.
Anbefalingerne er en forretningsmailadresse på eget domæne og et levende
website. Kristian har begge dele: `kontakt@kristiangg.dk` og kristiangg.dk.

Behandlingstid er ikke oplyst i det, jeg kunne finde.

## Tidsplanlægning

**IKKE AFKLARET.** Jeg fandt ikke belæg for, om Local Posts understøtter
fremtidig planlægning via API'et. Jeg gætter ikke.

Det gør ikke noget for arkitekturen: motoren venter i forvejen til tidspunktet
for Instagram, fordi Meta ikke kan holde et Instagram-opslag. Samme mønster
dækker Google, uanset hvad svaret er.

## Kategorisering

| Spørgsmål | Kategori |
| --- | --- |
| Kan API'et oprette opslag med tekst, billede og CTA? | **3 — ikke bygget.** Endepunktet findes |
| Har vi adgang? | **2 — projekt ikke oprettet, adgang ikke ansøgt** |
| Kan post-id gemmes i registret? | **4 — motoren gør det allerede for Facebook og Instagram** |
| Kan vi kontrollere, at et opslag findes, så dubletter undgås? | **3 — `localPosts.list` og `.get` findes.** Ikke bygget |
| Understøtter Google planlægning? | **UAFKLARET — og ligegyldigt**, se ovenfor |

---

# 4. Slutarkitekturen

Målet, Kristian formulerede:

```
GODKENDT → versionslås → kø → automatisk publicering på rette kanal og
tidspunkt → API-kvittering → kontrol af faktisk publicering → PUBLICERET
```

Hvor langt hver kanal er i dag:

| | Lås | Kø | Auto | Post-id | Efterkontrol |
| --- | --- | --- | --- | --- | --- |
| **Website** | ✓ | ✓ | ✓ | — | ✓ gaten bygger og tjekker siden |
| **Facebook** | ✓ | ✓ | ✓ Meta holder | ✓ | delvis |
| **Instagram** | ✓ | ✓ | ✓ motoren venter | ✓ | ✓ |
| **LinkedIn** | ✗ | ✓ | ✗ | ✗ | ✗ |
| **Google** | ✗ | ✓ | ✗ | ✗ | ✗ |

Efterkontrollen — «findes opslaget faktisk?» — er svagest hele vejen rundt.
For Google er `localPosts.list` det stærkeste værktøj af dem alle, fordi den
kan aflæse, hvad der rent faktisk står på profilen. Det løser samtidig den fejl,
der blev opdaget i dag: element 2 stod som publiceret i registret uden at være
gået ud.

---

# 5. Det, Kristian skal gøre

Intet af det kræver kode. Uden disse trin kan der ikke bygges noget.

## LinkedIn — omkring 20 minutter

1. Gå til **linkedin.com/developers** og opret en app knyttet til en
   LinkedIn-side, han administrerer.
2. Under **Products**: tilføj **«Share on LinkedIn»**. Den er selvbetjening.
   Tilføj **ikke** Community Management API — den er til organisationssider og
   kræver godkendelse.
3. Under **Auth**: notér Client ID og Client Secret. Sæt redirect-URL til
   `https://kristiangg.dk/` (den bruges kun til at fange koden én gang).
4. Kør OAuth-forløbet én gang og bed om scope `w_member_social`. Resultatet er
   et **access token med 60 dages levetid**.
5. Hent sin egen **person-URN** (`urn:li:person:...`).
6. Læg i GitHub → Settings → Secrets → Actions:
   `LI_ACCESS_TOKEN` og `LI_PERSON_URN`. Begge felter findes allerede i
   workflowen.

**Sig til, hvis trin 4 og 5 skal laves som et lille lokalt script.** De er de
eneste, der ikke er ren klikken.

## Google — ansøgning, derefter ventetid

1. Opret et projekt i **Google Cloud Console** på kontoen, der ejer
   Business-profilen.
2. Udfyld **adgangsformularen til Business Profile API'erne**. Brug
   `kontakt@kristiangg.dk` og kristiangg.dk — det er præcis det, der efterspørges.
3. **Vent på godkendelse.** Indtil kvoten er over 0 QPM, virker intet.
4. Efter godkendelse: slå API'erne til i projektet, opret OAuth-klient, kør
   forløbet én gang med scope `business.manage`, og gem **refresh token** —
   Google giver, modsat LinkedIn, et refresh token til almindelige apps.
5. Find account-id og location-id med `accounts.list` og
   `accounts.locations.list`. Det kan motoren gøre for ham, så snart adgangen
   er der.
6. Læg i GitHub Secrets: `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`,
   `GBP_REFRESH_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`.

**Start her.** Godkendelsen tager tid, og alt andet kan bygges imens.

---

# 6. Anbefalet rækkefølge

**Først: læsende adgangskontroller.** Før der publiceres noget, bygges
`kontroller-linkedin-adgang.mjs` og `kontroller-gbp-adgang.mjs` efter samme
mønster som de to, der findes for Meta: udelukkende GET, ingen ændring, og
tokens skrubbes af al log.

De besvarer de spørgsmål, dokumentationen ikke kunne — fra API'et selv:

- Hvilke scopes bærer dette token faktisk?
- Hvornår udløber det?
- Hvad er person-URN'en, account-id'et, location-id'et?
- Kan vi se de opslag, der allerede ligger?

**Det er svaret på forbeholdet øverst.** Vi behøver ikke tro på en
søgeresultatopsummering. Vi spørger API'et og får et definitivt svar.

Derefter, i denne rækkefølge:

1. Ansøg om Google-adgang — den har ventetid
2. LinkedIn-app og token
3. Adgangskontroller for begge
4. Låsefiler til de elleve manuelle elementer
5. Styrk `verificer.mjs`, så en ændret social tekst fanges af gaten
6. Billedunderstøttelse i LinkedIn-scriptet
7. `publicer-gbp.mjs`
8. Planlagte workflows for begge
9. Efterkontrol: `localPosts.list` mod registret

Punkt 5 er ikke til forhandling. To kanaler mere i drift betyder to kanaler
mere, hvor en utilsigtet tekstændring kan nå ud, hvis gaten ikke fanger den.

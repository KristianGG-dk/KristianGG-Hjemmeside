# Google Business Profile — KristianGG Publiceringsmotor

Teknisk opsætning for automatisk publicering af opslag på **Kristian GG's
Google Business Profile**. Bygget 4. oktober 2026.

Reglerne for motoren står i [`publicering/PUBLICERING.md`](../publicering/PUBLICERING.md).
Denne fil beskriver, hvordan Google-kanalen virker, og hvordan den sættes op,
drives, tilbagekaldes og fejlsøges.

## Kort fortalt

```
Kristian godkender et opslag
  → låsefil (kanal gbp) + køpost (metode motor) kommer i repoet gennem PR-gaten
  → "Publicer planlagte Google-elementer" vågner hver halve time
  → bytter det gemte refresh token til et access token (lever en time, gemmes aldrig)
  → Google bekræfter, at tokenet kan se netop den fastlåste lokation
  → opslaget sendes ordret
  → resultatet skrives i register.json
```

Kristian logger **ikke** ind hos Google ved hver publicering. Det sker én gang
ved første autorisation og igen kun, hvis adgangen tilbagekaldes.

Den menneskelige godkendelse af **indholdet** er uændret. Motoren publicerer
kun det, der er godkendt, låst og lagt i køen. Automatikken gælder
tidspunktet, ikke indholdet.

## Arkitektur

| Del | Fil | Hvad den gør |
| --- | --- | --- |
| Byggesten | `publicering/scripts/google-business.mjs` | OAuth-konstanter, tokenfornyelse, destinationskontrol, platformskrav, afsendelse. Ingen sideeffekter ved import |
| Første autorisation | `publicering/scripts/forny-google-token.mjs` + `.github/workflows/forny-google-token.yml` | Bytter koden til et refresh token, fastlåser lokationen og gemmer begge som GitHub-hemmeligheder |
| Publicering | `publicering/scripts/publicer-google.mjs` + `.github/workflows/publicer-google-planlagt.yml` | Publicerer forfaldne, godkendte elementer. Cron hver halve time (`5,35`) |
| Adgangskontrol | `publicering/scripts/kontroller-google-adgang.mjs` + `.github/workflows/kontroller-google-adgang.yml` | Kun læsning. Svarer på, om kanalen kan publicere |
| Startside | `static/oauth/google/index.html` | Statisk. Sender Kristian til Google med state, offline-adgang og samtykke |
| Callback | `static/oauth/google/callback/index.html` | Statisk. Kontrollerer state og viser koden. Intet netværkskald |
| Gate | `publicering/scripts/verificer.mjs` | Teksthash og Googles platformkrav på hver PR |
| Hemmelighedsscan | `publicering/scripts/hemmelighedsscan.mjs` | Stopper en PR, der indeholder et Google- eller GitHub-token |
| Vagthund | `publicering/scripts/vagthund.mjs` | Fejl ved forfaldne motorelementer uden resultat og ved udløbende adgang |
| Prøver | `publicering/test/google-business.test.mjs` | 82 prøver uden net og uden token |

### Hvorfor sådan og ikke en server

Samme ræsonnement som for LinkedIn (se `dokumentation/linkedin-oauth.md`):

- Byttet af kode til token kræver client secret. En secret hører ikke hjemme
  på et offentligt websted, og en Netlify-funktion, der udsteder tokens, ville
  være en ny offentlig angrebsflade, som selv skulle have login.
- GitHub er allerede en autentificeret, 2FA-beskyttet og revisionslogget konsol,
  og motoren kører der i forvejen.
- Callbacken er derfor statisk. Den viser koden og stopper. Byttet sker i
  GitHub Actions, hvor secret'en ligger.

### Hvad der er genbrugt fra LinkedIn, og hvad der er anderledes

| | LinkedIn | Google |
| --- | --- | --- |
| Callback | statisk side | statisk side, samme mønster |
| Byttet | GitHub Actions, PAT skriver hemmeligheden | samme. Bruger PAT'en i miljøet `linkedin-oauth` |
| Hvad gemmes | access token (60 dage) | **kun refresh token**. Access tokens lever en time og hentes frisk ved hver kørsel |
| Fornyelse | manuel hver 60. dag | **automatisk ved hver kørsel**. Ingen manuel fornyelse i drift |
| Destination | person-URN fra `/v2/userinfo` | lokation `accounts/…/locations/…`, bekræftet af Business Information API |
| Scopes | `w_member_social openid profile` | **kun** `business.manage` |

Der bedes bevidst ikke om `openid` eller `email`. Destinationen bevises ud fra
den lokation, Google bekræfter at tokenet kan se, ikke ud fra en e-mailadresse.
Det giver færrest mulige rettigheder.

## API'erne

Kontrolleret mod Googles officielle referencedokumentation 04-10-2026.

| Formål | Kald | API |
| --- | --- | --- |
| Token | `POST https://oauth2.googleapis.com/token` | Google OAuth 2.0 |
| Konti | `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts` | My Business Account Management API |
| Lokationer | `GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{id}/locations?readMask=…` | My Business Business Information API |
| Én lokation | `GET https://mybusinessbusinessinformation.googleapis.com/v1/locations/{id}?readMask=…` | My Business Business Information API |
| Opslag | `POST https://mybusiness.googleapis.com/v4/accounts/{id}/locations/{id}/localPosts` | Google My Business API (v4.9) |

Opslag (`localPosts`) findes stadig kun i v4. Konti og lokationer er flyttet
til v1-API'erne. Alle tre API'er er aktiveret i projektet *KristianGG publicering*.

### Hvad der sendes

```json
{
  "languageCode": "da",
  "topicType": "STANDARD",
  "summary": "<tekst fra låsefilen, ordret>",
  "media": [{ "mediaFormat": "PHOTO", "sourceUrl": "<billede_url fra låsefilen>" }],
  "callToAction": { "actionType": "LEARN_MORE", "url": "<links[0] fra låsefilen>" }
}
```

`media` udelades, hvis låsen ikke har `billede_url`. `callToAction` udelades,
hvis `links` er tom. Intet tilføjes eller omskrives.

Kun **STANDARD**-opslag ("Nyheder") er understøttet. Begivenheder, tilbud og
produktopslag er ikke bygget. Produktopslag kan slet ikke oprettes gennem API'et.

### Platformens krav (PLATFORM, ikke lov)

Kontrolleres i PR-gaten (`verificer.mjs`) og igen lige før afsendelse:

| Krav | Hvorfor |
| --- | --- |
| Tekst højst 1.500 tegn | Googles grænse for et opslag |
| Intet telefonnummer i teksten | Google fjerner opslag med telefonnumre ("phone stuffing"). Ring-knappen bruger profilens verificerede nummer |
| Billede som `https://kristiangg.dk/….jpg/.jpeg/.png` | Google tager kun JPG og PNG. Brug `-640.jpg`-varianten, ikke `.webp` eller `.avif` |
| Højst ét link | Et opslag har én knap |

Telefonnumre genkendes som `12345678`, `12 34 56 78`, `1234 5678` og
`+45 …`. Datoer som `12.10.2026`, klokkeslæt og postnumre giver ikke falske fund.

## Destinationen fastlåses

Kontoen kontakt@kristiangg.dk kan have adgang til flere profiler. **Det gør dem
ikke til mål.** Der publiceres kun til den ene lokation i `GBP_TILLADT_LOKATION`.

### Fem kontroller før hver afsendelse — alle skal holde

1. `GBP_TILLADT_LOKATION` findes og er ikke `AFVENTER`
2. `GBP_LOKATION` er identisk med `GBP_TILLADT_LOKATION`. Felterne får samme
   værdi, men læses hver for sig, så en ændring af det ene stopper publicering
3. Værdien har præcis formen `accounts/{tal}/locations/{tal}`
4. **Google bekræfter**, at tokenet kan læse netop den lokation, og at den
   ligger under netop den konto
5. Versionslås, teksthash, godkendelse, køpost og platformskrav som for alle
   kanaler

Kontrol 4 er den vigtigste. De øvrige læser vores egen konfiguration. Kontrol 4
spørger Google, hvad tokenet faktisk har adgang til.

### Bootstrap — hønen og ægget

Lokationens id kendes først, når Kristian har autoriseret. Derfor bruges der en
sentinelværdi, ligesom ved LinkedIn:

```
GBP_TILLADT_LOKATION = AFVENTER    ← endnu ikke fastlåst
```

| Handling | `AFVENTER` står | Lokation fastlåst |
| --- | --- | --- |
| `bootstrap` | **fastlåser** ud fra Googles svar | **afvises** |
| `forny` | **afvises** | sammenligner og fortsætter |

Bootstrap fastlåser **kun automatisk**, hvis tokenet kan se **præcis én**
lokation, **og** den har `kristiangg.dk` som website. Ser tokenet flere
lokationer, vælger motoren ikke på Kristians vegne. Kørslen stopper og viser
kandidaterne. Kristian sætter så `GBP_TILLADT_LOKATION` til den rigtige og
kører `forny` med en ny kode.

Skal destinationen laves om senere, skal `GBP_TILLADT_LOKATION` manuelt sættes
tilbage til `AFVENTER` først.

## Hemmeligheder

Alle ligger som GitHub Actions-hemmeligheder (repo-niveau, samme som LinkedIn).
Intet ligger i git, i loggen eller i registret.

| Navn | Hvem sætter den | Hvorfor |
| --- | --- | --- |
| `GBP_CLIENT_ID` | Kristian, én gang | OAuth-klientens id. Ikke hemmeligt, men samlet med resten |
| `GBP_CLIENT_SECRET` | Kristian, én gang | **rører aldrig en browser eller en privat maskine** |
| `GBP_TILLADT_LOKATION` | Kristian sætter `AFVENTER`. Bootstrap fastlåser | den ENESTE lokation, der accepteres |
| `GBP_AUTH_CODE` | Kristian sætter `venter`. Indsætter koden ved autorisation | kortlivet. Workflowen sætter den til `opbrugt` |
| `GBP_REFRESH_TOKEN` | **workflowen** | Kristian rører den aldrig |
| `GBP_LOKATION` | **workflowen** | samme værdi som den tilladte, men læst separat |
| `GH_SECRET_MANAGER_TOKEN` | findes allerede, miljøet `linkedin-oauth` | fine-grained PAT, kun Secrets: write. Genbruges |

Workflowen "Forny Google-adgang" kører i miljøet `linkedin-oauth`, fordi PAT'en
ligger dér med Kristian som påkrævet godkender. Jobbet kan ikke køre uden hans
tryk, og PAT'en er ikke tilgængelig for andre workflows.

Publiceringen og adgangskontrollen kører i miljøet `publicering`, som er
begrænset til `main`.

### Ingen hemmelighed slipper ud

- Access tokens markeres med `::add-mask::` og gemmes ingen steder
- `skrub()` fjerner kendte værdier og Googles tokenformer (`ya29.`, `1//`,
  `GOCSPX-`, `4/…`, `Bearer …`) fra enhver fejlbesked, før den logges
- Adgangskontrollen logger kun **antallet** af profiler, kontoen kan se. Kun den
  fastlåste profil navngives
- Lokations- og konto-id'er afkortes i loggen (`44…66`), fordi repoet er offentligt.
  Eneste undtagelse: når bootstrap stopper ved flere kandidater, vises de fulde
  navne, så Kristian kan vælge. Et lokations-id er ikke en adgangsnøgle
- `publicering/google-token.json` indeholder kun dato, titel og afkortet id
- `hemmelighedsscan.mjs` stopper enhver PR med et Google- eller GitHub-token
  eller en `client_secret`-fil
- `.gitignore` udelukker `client_secret*.json`, som Google Cloud tilbyder at
  hente. **Hent den ikke.** Kopiér id og secret direkte over i GitHub

## Tokenfornyelse

**Der er intet at forny i drift.** Hver publiceringskørsel gør dette:

```
POST https://oauth2.googleapis.com/token
  grant_type=refresh_token, refresh_token, client_id, client_secret
→ access_token (ca. 1 time) — bruges i denne kørsel og glemmes
```

Refresh tokenet virker, indtil adgangen tilbagekaldes. Det kan holde op med at
virke, hvis:

| Årsag | Hvad sker der |
| --- | --- |
| **Appen står i "Testing"** | Google udsteder refresh tokens, der udløber efter **7 dage**. Se nedenfor |
| Kristian fjerner appens adgang | `invalid_grant`. Kanalen stopper |
| Seks måneder uden brug | `invalid_grant`. Sker ikke, så længe der publiceres |
| Over 100 refresh tokens for samme konto og klient | det ældste ugyldiggøres. Sker kun ved mange gentagne autorisationer |

Ved `invalid_grant` publiceres der ikke. Jobbet fejler med en besked, der
henviser til `https://kristiangg.dk/oauth/google/`.

### "Testing" eller "In production"

Projektet står i dag i **Audience → Testing**. Ifølge Googles OAuth-dokumentation
får et projekt med brugertypen *External* og status *Testing* udstedt refresh
tokens, der udløber efter 7 dage, medmindre der kun bedes om navn, e-mail og
profil. Her bedes der om `business.manage`, så reglen gælder.

Med Testing kan motoren altså kun køre en uge ad gangen. **For automatisk drift
skal Publishing status sættes til "In production".**

`business.manage` er et følsomt scope. En app i produktion uden Googles
verifikation viser en advarsel ("Google hasn't verified this app") ved
samtykket. Kristian klikker *Advanced → Go to KristianGG publicering*. Det er
forventet for en app, der kun bruges af ejeren selv. Grænsen er 100 brugere, og
her er der én.

Motoren opdager selv Testing-tilstanden: Google sender
`refresh_token_expires_in` med, når adgangen er tidsbegrænset. Det skrives i
`publicering/google-token.json`, og vagthunden varsler (advarsel, og fejl ved 3
dage eller mindre).

## Første autorisation — trin for trin

Forudsætning: OAuth-klienten er oprettet i Google Cloud med værdierne under
*Google Cloud*, og Publishing status er "In production".

**I GitHub → Settings → Secrets and variables → Actions → New repository secret:**

| Navn | Værdi |
| --- | --- |
| `GBP_CLIENT_ID` | Client ID fra Google Cloud |
| `GBP_CLIENT_SECRET` | Client secret fra Google Cloud |
| `GBP_TILLADT_LOKATION` | `AFVENTER` |
| `GBP_AUTH_CODE` | `venter` |

**Derefter:**

1. GitHub → Actions → **Forny Google-adgang** → Run workflow → `kontroller`.
   Godkend kørslen. Den skal ende med *ALT PAA PLADS*. Google kaldes ikke
2. Åbn `https://kristiangg.dk/oauth/google/`, indsæt Client ID, og klik
   **Godkend hos Google**. Log ind som kontakt@kristiangg.dk, og godkend
3. Callbacken viser en `code`. Kopiér den
4. GitHub → Secrets → `GBP_AUTH_CODE` → indsæt koden → Save
5. GitHub → Actions → **Forny Google-adgang** → Run workflow → `bootstrap`.
   Godkend kørslen **straks**, fordi koden kun lever få minutter
6. Læs loggen. Lokationens titel skal være Kristian GG
7. GitHub → Actions → **Kontroller Google-adgang** → Run workflow. Skal ende med
   *ADGANG: I ORDEN*

Derefter kører kanalen af sig selv.

## Et opslag til Google — fra godkendelse til publicering

1. **Låsefil** `publicering/laase/element-NN.json` med `kanal: "gbp"` og samme
   felter som de øvrige sociale kanaler: `tekst`, `tekst_sha256`,
   `brodtekst_sha256` (= `tekst_sha256`), `billede_url` (JPG/PNG på
   kristiangg.dk), `links` (nul eller ét), `slut_url: "(gbp-opslag, ingen URL
   foer publicering)"`, godkendelse, kontrolstempel og `versionslaas`
2. **Køpost** i `koe.json`: `kanal: "gbp"`, `metode: "motor"`,
   `laasefil: "publicering/laase/element-NN.json"` og `tidspunkt` = låsens `dato`
3. **Registerpost** `AFVENTER DATO`
4. PR → gaten (versionslås, teksthash, Googles krav, indholdskontrol,
   hemmelighedsscan, prøver) → merge

Motoren rører **kun** elementer, hvor køen siger `metode: "motor"`. De
eksisterende Google-elementer med `metode: "manuel"` (4, 9, 13, 28 og 32) er
uændrede og publiceres fortsat manuelt.

### Hvornår publicerer motoren ikke

| Situation | Hvad sker der |
| --- | --- |
| Låsen, teksthashen eller godkendelsen holder ikke | springes over, `AFVIST` i loggen |
| Køen siger `manuel`, peger på en anden fil, eller har et andet tidspunkt | springes over |
| Mere end et døgn forsinket | springes over. Et for sent opslag kan være forkert nu og kræver et menneske |
| Seneste forsøg fejlede | springes over, indtil et menneske har taget stilling |
| Adgang eller destination fejler | **intet sendes overhovedet**. Jobbet fejler, og GitHub sender mail |
| Google afviser opslaget (4xx) | `PUBLICERING FEJLET` i registret |
| Google fejler (5xx) eller netværket brydes under afsendelsen | `PUBLICERING FEJLET` med noten *udfaldet er uvist*. Se efter på profilen, før der prøves igen |

Der prøves aldrig igen af sig selv.

### Tørløb

Actions → **Publicer planlagte Google-elementer** → Run workflow med
`publicer` = false. Viser, hvad der ville blive sendt. Findes adgangen, prøves
destinationen også af, så tørløbet er en rigtig prøve.

## Sådan tilbagekaldes adgangen

**Stop kanalen med det samme:** Actions → *Publicer planlagte Google-elementer*
→ ⋯ → **Disable workflow**.

**Tilbagekald hos Google:** https://myaccount.google.com/permissions → *KristianGG
publicering* → **Remove access**. Alle tokens bliver ugyldige med det samme.

**Ryd op i GitHub:** sæt `GBP_REFRESH_TOKEN` til `tilbagekaldt`. Skal klienten
også nedlægges: Google Cloud → Clients → slet klienten, og slet
`GBP_CLIENT_SECRET`.

Efter en tilbagekaldelse fejler både publicering og adgangskontrol med en klar
besked. Der sendes intet.

## Prøver

```
node publicering/test/google-business.test.mjs
```

82 prøver, uden net og uden token. Google er erstattet af en attrap. Prøverne
dækker:

- destinationen: mangler, `AFVENTER`, ændret, forkert form, ukendt hos Google,
  mistet adgang, anden lokation, forkert konto, netværksfejl
- adgangen: manglende client id/secret/refresh token, `invalid_grant`,
  `invalid_client`, manglende scope, netværksfejl
- lækager: Googles fejlsvar med ekko af hemmeligheder, ukendte tokenformer,
  afkortede id'er, hemmelighedsscanningen
- platformskravene: længde, telefonnumre (og datoer, der ikke er det),
  billedformat, domæne, antal links
- udvælgelsen: manuel kø, manglende køpost, forkert låsefil, forkert tidspunkt,
  ændret tekst, ændret lås, manglende godkendelse, ikke forfalden, over et døgn
  for sent, allerede publiceret, tidligere fejl
- kørslen: tørløb uden adgang (intet netværk), tørløb med adgang (intet sendt),
  publicering uden adgang/destination, med ændret destination, tilbagekaldt
  adgang og en lokation, tokenet ikke kan se. **Intet opslag sendes i nogen af
  dem.** Desuden en vellykket publicering samt 4xx, 5xx og netværksbrud
- første autorisation: pladsholder, halv kode, intet refresh token, fravalgt
  scope, brugt kode, forkert redirect URI, Testing-tilstand, bootstrap med nul,
  flere, fremmed eller forklædt lokation, og sideinddeling

Prøverne kører på hver PR i `verificer.yml` sammen med LinkedIn-prøverne og
hemmelighedsscanningen.

## Fejlsøgning

| Besked | Betyder | Gør |
| --- | --- | --- |
| `GBP_TILLADT_LOKATION staar paa AFVENTER` | første autorisation er ikke gennemført | bootstrap |
| `Refresh tokenet er udloebet eller tilbagekaldt` | `invalid_grant` | autorisér igen og kør `forny`. Står appen i Testing, så sæt den i produktion først |
| `Client ID eller client secret er forkert` | `invalid_client` | ret `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` |
| `redirect_uri_mismatch` | Google Cloud har ikke præcis den rigtige adresse | se *Google Cloud* nedenfor. Afsluttende `/` skal med |
| `Google afviste adgangen (403 …)` ved lister | API'et er ikke aktiveret, eller kvoten er 0 | Google Cloud → APIs & Services. Alle tre API'er skal være aktiveret |
| `Tokenet kan ikke se den fastlaaste lokation` | adgangen til profilen er fjernet, eller kontoen er skiftet | kontrollér i Business Profile, at kontakt@kristiangg.dk stadig er ejer eller administrator |
| `Tokenet kan se N lokationer` | bootstrap vælger ikke selv | sæt `GBP_TILLADT_LOKATION`, hent ny kode, kør `forny` |
| `Google returnerede intet refresh token` | samtykket blev ikke vist på ny | start fra startsiden. Den beder om `prompt=consent` |
| `teksten indeholder et telefonnummer` | PLATFORM-krav | ny tekst, ny godkendelse, ny lås |
| `over et doegn siden` | motoren var nede, eller adgangen manglede | tag stilling: publicér manuelt, eller godkend en ny dato |

## Google Cloud

| Felt | Værdi |
| --- | --- |
| Application type | **Web application** |
| Name | `KristianGG publiceringsmotor` (vises kun i Google Cloud) |
| Authorized JavaScript origins | **skal stå tomt** |
| Authorized redirect URIs | `https://kristiangg.dk/oauth/google/callback/` |
| Audience → Publishing status | **In production** (ellers udløber adgangen efter 7 dage) |
| Data Access → scopes | `https://www.googleapis.com/auth/business.manage`, intet andet |

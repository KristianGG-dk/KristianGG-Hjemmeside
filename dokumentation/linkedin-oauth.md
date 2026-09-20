# LinkedIn OAuth — KristianGG Publiceringsmotor

Teknisk opsætning for automatisk publicering til **Kristians personlige
LinkedIn-profil**. Oprettet 20. september 2026.

## Afgrænsning — læses først

Denne integration vedrører **udelukkende Kristian GG / kristiangg.dk og
Kristians personlige LinkedIn-profil**.

**Foreningen mod Familiebelastning indgår ikke.** Ikke som side, ikke som
organization-URN, ikke som credentials, ikke som destination, ikke som
reserveløsning. Der genbruges ingen destinations-id'er fra andre projekter.

Kan destinationen ikke entydigt bevises at være Kristians personlige profil,
**publiceres der ikke**. Fail closed.

Developer-appen *KristianGG Publiceringsmotor* er tilknyttet siden *Kristian
GG*. **Den tilknytning gør ikke siden til publiceringsdestination.** LinkedIn
kræver, at en app er knyttet til en side; det er en administrativ binding, ikke
et mål. Målet er medlemsprofilen, og scopet er `w_member_social`.

## Flowet — browser og GitHub, ingen terminal

Fastlagt 20-09-2026. Motoren skal kunne administreres fra flere enheder;
Kristian må ikke være afhængig af én bestemt computer.

```
1.  kristiangg.dk/oauth/linkedin/   statisk startside. Genererer state,
                                    sender til LinkedIn
2.  LinkedIn                        Kristian godkender som sig selv
3.  callbacken                      sammenligner state, viser code
4.  GitHub → Secrets                Kristian indsætter koden i LI_AUTH_CODE
5.  GitHub → Actions                "Forny LinkedIn-token" → Run workflow
6.  workflowen                      bytter code→token SERVER-SIDE,
                                    bekræfter identitet, gemmer tokenet,
                                    rydder LI_AUTH_CODE
```

Trin 4 og 5 foregår på github.com og virker på en telefon. **Kristian
kopierer aldrig et token** — kun en kortlivet autorisationskode.

### Hvorfor GitHub og ikke en Netlify-funktion

En offentlig funktion skulle selv kunne godtgøre, at det er Kristian, og
ville dermed kræve sit eget login, sin egen session og sin egen
adgangskontrol — en administrationskonsol nummer to.

GitHub er allerede en autentificeret, 2FA-beskyttet, revisionslogget konsol,
der virker i enhver browser. Løsningen tilføjer derfor **ingen ny offentlig
endpoint**, intet token-udstedende API og ingen anden hemmelighedsbutik.

### Hvorfor koden går gennem en hemmelighed

Repoet er **offentligt**. Et `workflow_dispatch`-input står i kørslens
metadata, synligt for alle. En hemmelighed gør det ikke. Derfor indsættes
koden i `LI_AUTH_CODE` frem for i et felt.

### Hvorfor en PAT — og hvordan den er begrænset

`GITHUB_TOKEN` har **ingen `secrets`-rettighed**. Dens tilladelser dækker
actions, contents, issues, pull-requests og en håndfuld til, men ikke
hemmeligheder. Der findes ingen mindre privilegeret indbygget mekanisme til
at skrive en Actions-hemmelighed fra en workflow. Alternativet er en GitHub
App, som kræver en privat nøgle i en hemmelighed — samme rækkevidde, flere
bevægelige dele.

`GH_SECRET_MANAGER_TOKEN` er derfor en **fine-grained PAT**, afgrænset til dette ene
repo, med den ene rettighed *Secrets: read and write*.

Den ligger i miljøet **`linkedin-oauth`** med Kristian som **påkrævet
godkender**. To ting følger af det: jobbet kan ikke køre, uden at han trykker
godkend, og PAT'en er utilgængelig for alle andre workflows i repoet.

### Første kørsel fejlede — hvad den lærte os

Kørsel 1 den 20-09-2026 nåede frem til udvekslingen og fejlede der. Loggen
viste to ting:

```
GH_SECRETS_PAT:                     ← tom
FEJL: LinkedIn afviste byttet: 401
  "authorization code not found"
```

**Navnet var forkert.** Hemmeligheden hedder `GH_SECRET_MANAGER_TOKEN`.

**Koden var en pladsholder.** `LI_AUTH_CODE` stod på `venter` — den værdi,
hemmeligheden blev oprettet med.

**Review virkede.** Kørslen ventede 2 minutter og 25 sekunder på godkendelse
og fortsatte derefter. Der er intet self-review-problem, og den påkrævede
godkender bliver stående: en autorisationskode lever **tredive minutter**, så
ventetiden er ufarlig.

### Kontroltilstand

Workflowet har to handlinger, og **`kontroller` er standard**:

| | |
| --- | --- |
| `kontroller` | Beviser at rørføringen er på plads. Kalder **ikke** LinkedIn, bruger **ikke** koden, gemmer intet. Læser repoets krypteringsnøgle og hemmelighedernes **navne** via PAT'en. |
| `forny` | Den rigtige udveksling. |

Den findes, fordi en kode er en knap ressource: én gang, tredive minutter.
Fejler opsætningen først bagefter, er koden spildt, og hele browserforløbet
skal gås om.

Kontrollen viser **længder og navne, aldrig værdier**.

Pladsholdere — `venter`, `afventer`, `opbrugt`, `todo` — og enhver kode under
40 tegn afvises, **før** LinkedIn kaldes. LinkedIns eget intetsigende
*"code not found"* oversættes til de tre ting, det kan dække over: brugt,
udløbet, eller forkert redirect_uri.

### State og CSRF

Startsiden genererer en nonce, gemmer den i `sessionStorage` og sender den
med. Callbacken sammenligner. Stemmer den ikke, **vises koden ikke**.

Det afgørende lag ligger dog server-side: workflowen sammenligner tokenets
egen `sub` med `LI_TILLADT_URN`. Lokkes Kristian til at bruge en fremmed kode,
hører det resulterende token til **den anden**, identiteten matcher ikke, og
der gemmes ingenting.

### Den lokale vej er en reserveløsning

`publicering/scripts/linkedin-oauth.mjs` virker stadig og kan bruges den dag,
GitHub er nede, eller noget skal fejlsøges udenom. **Den er ikke den normale
driftsvej.**

### Callback-URL

```
https://kristiangg.dk/oauth/linkedin/callback/
```

Filen er `static/oauth/linkedin/callback/index.html` — statisk, uden for
Hugos indholdsstruktur, uden for sitemappet, uden for navigationen.

**Hvorfor statisk og ikke en funktion.** Byttet kode→token kræver client
secret. En secret hører ikke hjemme på et offentligt websted, og et offentligt
endepunkt, der udsteder tokens, er en ny angrebsflade uden modydelse. Samme
ræsonnement som da Netlify Functions blev fravalgt til selve motoren.

Siden foretager **ingen netværkskald overhovedet** — ingen fetch, ingen
analytics, ingen tredjepart. Afprøvet i Chromium i alle tre tilstande
(autorisation, afvisning, direkte åbning): nul eksterne requests.

`netlify.toml` sender `X-Robots-Tag: noindex, nofollow, noarchive`,
`Cache-Control: no-store` og `Referrer-Policy: no-referrer` for `/oauth/*`.
`robots.txt` blokerer bevidst **ikke** — en blokering dér ville forhindre
Google i at hente siden og dermed i at læse noindex.

## Scopes

| Scope | Hvorfor |
| --- | --- |
| `w_member_social` | Publicere på vegne af det autentificerede medlem. Følger med produktet «Share on LinkedIn». |
| `openid profile` | Aflæse **hvem** tokenet tilhører via `/v2/userinfo`. Uden det kan destinationen ikke bevises, og så må der ikke publiceres. |

`w_organization_social` bruges **ikke**. Det er til organisationssider og
kræver godkendelse.

## Sådan indtastes client ID og secret

**Secret'en skrives ikke i kommandolinjen.** Scriptet spørger om den, og
terminalen ekkoer ikke, mens den tastes. Så står den hverken i shellens
historik, i procestabellen eller på skærmen.

```
$ node publicering/scripts/linkedin-oauth.mjs byt
code:          AQTb…
state:         2MI3…
Client ID:     78abcdef123456
Client Secret:
  (modtaget — vises ikke)
```

Client ID er ikke hemmeligt og må gerne stå i miljøet som `LI_CLIENT_ID`.
Secret'en bør ikke: `export LI_CLIENT_SECRET=…` ender i `~/.bash_history`.
Står den alligevel i miljøet, bruger scriptet den og siger det højt.

**Uden en terminal stopper scriptet.** Det falder ikke tilbage til synlig
indtastning, fordi en secret ikke må slippe ud, blot fordi omgivelserne var
anderledes end ventet. Tidligere sluttede `byt` i den situation med kode 0 og
ingen besked — en tavs succes, hvor intet var sket. Det er lukket.

`state` er en engangsværdi. Den slettes, så snart den er brugt — også hvis
selve byttet derefter fejler. Så kør `start` igen.

## Hemmeligheder

| Navn | Hvor | Hvorfor |
| --- | --- | --- |
| `LI_CLIENT_ID` | GitHub Secrets | offentlig værdi, men holdes samlet med resten |
| `LI_CLIENT_SECRET` | GitHub Secrets | **rører aldrig en browser eller en privat maskine** |
| `LI_TILLADT_URN` | GitHub Secrets | den ENESTE identitet der accepteres. Sættes af Kristian |
| `LI_AUTH_CODE` | GitHub Secrets | kortlivet. Indsættes af Kristian, ryddes af workflowen |
| `GH_SECRET_MANAGER_TOKEN` | miljøet `linkedin-oauth` | fine-grained, dette repo, kun Secrets: write |
| `LI_ACCESS_TOKEN` | GitHub Secrets | **skrives af workflowen.** Kristian rører den aldrig |
| `LI_PERSON_URN` | GitHub Secrets | skrives af workflowen ud fra tokenets egen identitet |
| `LI_REFRESH_TOKEN` | GitHub Secrets | skrives kun, hvis LinkedIn faktisk returnerer ét |

`LI_PERSON_URN` og `LI_TILLADT_URN` får samme værdi, men læses hver for sig.
En ændring af den ene ændrer ikke den anden — og en uoverensstemmelse stopper
publicering. Det er billigt og fanger netop den fejl, hvor nogen kommer til at
udskifte destinationen.

Intet token og ingen secret skrives nogensinde i log. Scriptet maskerer tokens
(`AQVa…9f2x`) og skrubber secrets ud af enhver fejlbesked. Hele tokenet vises
kun, hvis man udtrykkeligt beder om det med `--vis-token`.

`publicering/scripts/.li-state` er i `.gitignore`.

## Tokenets levetid og fornyelse

LinkedIn Developer viser **TTL = 5.184.000 sekunder = 60 dage** for denne app.

**Om tokenet kan fornyes programmatisk, er ikke afgjort.** Jeg kunne ikke læse
den officielle dokumentation: miljøets netværkspolitik afviser
`learn.microsoft.com` med 403. Søgeresultater peger på, at programmatiske
refresh tokens er forbeholdt godkendte Marketing-Developer-Platform-partnere,
men det er andenhånds, og jeg gætter ikke.

**Svaret kommer gratis ved første bytte.** Tokenendepunktets svar indeholder
enten et `refresh_token` eller ikke. Scriptet skriver begge udfald ud i klar
tekst:

- **Med refresh token** → motoren kan forny selv, og der bygges en fornyelse.
- **Uden** → Kristian godkender på ny inden udløb. Tre browserskridt hver
  anden måned, ikke en blokering.

**Der er ikke bygget automatisk fornyelse.** Den ville hvile på en antagelse
om, hvad LinkedIn returnerer, og det afgøres først af den første rigtige
udveksling.

### Vagthunden varsler

`publicering/linkedin-token.json` bærer ingen hemmelighed — kun udløbsdatoen,
hvem tokenet tilhører, og om der er et refresh token. Vagthunden læser den:

| Tilbage | |
| --- | --- |
| over 14 dage | i orden |
| 14 dage eller mindre | advarsel |
| 3 dage eller mindre | **fejl** |
| udløbet | **fejl** — kanalen kan ikke publicere |

Hver besked bærer linket til startsiden. Findes filen ikke, er der aldrig
fornyet, og der varsles ikke.

Det er et definitivt svar for netop denne app — stærkere end dokumentationen,
fordi det er API'ets eget.

## Destinationskontrol og fail closed

**Implementeret 20-09-2026** i `publicer-linkedin.mjs`. Før da brugte den
blindt den URN, der stod i miljøet.

1. `LI_TILLADT_URN` skal findes. Mangler den → **stop**.
2. `LI_PERSON_URN` skal være identisk med `LI_TILLADT_URN` → ellers **stop**.
3. URN'en skal begynde med `urn:li:person:`. Alt andet, herunder
   `urn:li:organization:`, → **stop**.
4. Før publicering spørges `/v2/userinfo`. Tokenets `sub` skal give samme URN
   → ellers **stop**.
5. Først derefter kontrolleres versionslås, teksthash og godkendelse som i dag.
6. Enhver af de fem fejler → ingen publicering, fejl i registret, intet forsøg
   igen.

Punkt 4 er det vigtigste. De øvrige kontrollerer, hvad der står i vores egen
konfiguration; punkt 4 spørger LinkedIn, hvem tokenet **faktisk** tilhører.
Det er den eneste kontrol, der ikke kan snydes ved at rette en hemmelighed.

I tørløb springes punkt 4 over, hvis der ikke er et token — men findes der ét,
køres kontrollen også i tørløb, så prøven er en rigtig prøve.

### Afprøvet

```
node publicering/test/linkedin-destination.test.mjs
```

Fjorten prøver, hvoraf tolv er ting, der **skal afvises**: manglende tilladt
URN, tom URN, ændret destination, foreningens side som mål, en organisation
smuglet ind i begge felter, et token der tilhører en anden, `userinfo` der
svarer 401, et svar uden `sub`, og et netværk der svigter. Alle fjorten består.

End-to-end mod et prøveelement, der aldrig publiceres:

| Opsætning | Resultat |
| --- | --- |
| ingen destination | `LI_TILLADT_URN mangler. Uden en eksplicit tilladt destination publiceres der ikke.` |
| foreningens side som mål | `Destinationen er ikke en personprofil […] En organisationsside må aldrig være mål.` |
| destination ændret efter godkendelsen | `LI_PERSON_URN svarer ikke til LI_TILLADT_URN.` |
| korrekt destination | tørløb, intet sendt |

### Adgangskontrol

```
node publicering/scripts/kontroller-linkedin-adgang.mjs
```

Udelukkende GET. Svarer på, om der er et token, hvem det tilhører, om det
stemmer med den tilladte destination, hvilke rettigheder det bærer, og hvornår
det udløber. Advarer, når der er 14 dage eller mindre tilbage.

## Status

| | |
| --- | --- |
| Callback bygget og afprøvet | ✓ |
| OAuth-script skrevet | ✓ |
| Redirect-URL registreret hos LinkedIn | ✓ 20-09-2026 |
| Central browser/GitHub-administration | ✓ |
| Vagthund varsler om udløb | ✓ 14 / 3 / udløbet |
| Token udstedt | **nej — venter på Kristian** |
| Automatisk fornyelse | bevidst ikke bygget, se ovenfor |
| Destinationskontrol i publisher | ✓ fail closed, 14 prøver |
| Adgangskontrol (kun læsning) | ✓ |
| Billedunderstøttelse i publisher | ikke bygget |
| Planlagt kørsel for LinkedIn | ikke bygget |
| Låsefiler til LinkedIn-elementer | ikke bygget |

**Tørløb er fortsat standard i `publicer-linkedin.mjs`.** Der er ikke
publiceret noget, og ingen planlagte opslag er ændret.

## Det, der mangler for automatisk publicering med billeder

Naar tokenet er paa plads, er LinkedIn-kanalen stadig ikke automatisk. Fire
ting mangler, og de er uafhaengige af OAuth.

### 1. Billedunderstoettelse i publisheren

`publicer-linkedin.mjs` kan i dag **tekst og et artikel-link**. Alle Kristians
LinkedIn-elementer har et billede.

Et billede kraever tre kald frem for ét:

```
POST /rest/images?action=initializeUpload   → uploadUrl + urn:li:image:…
PUT  <uploadUrl>                            → selve billedfilen
POST /rest/posts                            → content.media.id = urn'en
```

**Uafklaret:** om `w_member_social` alene daekker billedtrinnet, eller om der
skal et scope mere til. Den officielle dokumentation kunne ikke naas
(`learn.microsoft.com` afvises af miljoeets netvaerkspolitik). Svaret kommer
ved foerste forsoeg — og det forsoeg maa vente paa, at der er et token.

Billederne ligger allerede offentligt paa kristiangg.dk, saa de kan hentes
uden videre.

### 2. Laasefiler til LinkedIn-elementerne

De syv LinkedIn-elementer — 2, 5, 7, 11, 14, 26, 27 — har **ingen laasefil**.
Det er korrekt i dag: naar et menneske publicerer, er der intet for motoren
at kvittere for.

Bliver kanalen automatisk, vender det. Hvert element skal have en laas, saa
gaten kan verificere, hvad der sendes. Teksterne findes allerede i
godkendelsespakkerne.

### 3. Gaten skal fange aendret social tekst

I dag kontrollerer `verificer.mjs` kun broedteksten **dybt for
website-elementer**. For sociale elementer kontrolleres felterne og laasen,
men `tekst` er ikke et laast felt.

En aendret social tekst fanges derfor foerst af publiceringsscriptet og
vagthunden — ikke af gaten. Med to kanaler mere i drift er det ikke godt nok.

**Dette punkt er ikke til forhandling**, og det skal laves foer den foerste
automatiske LinkedIn-publicering.

### 4. Planlagt koersel

Instagram har `publicer-instagram-planlagt.yml` med cron. LinkedIn har kun
den manuelt startede workflow. Moenstret findes og skal kopieres.

### Raekkefoelgen

```
token  →  gaten skaerpes (3)  →  laasefiler (2)  →  billeder (1)  →  cron (4)
```

Intet af det kraever ny godkendelse fra Kristian ud over den foerste rigtige
publicering, som **skal godkendes saerskilt**.

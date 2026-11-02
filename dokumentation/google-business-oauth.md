# Google Business Profile: hvorfor den ikke er forbundet, og hvad der mangler

Undersøgt 2. november 2026. Google Cloud er allerede sat op — det er ikke
dét, der mangler.

## Kort svar

**Ingen af de fem GBP-hemmeligheder findes i GitHub.** Autorisationsforløbet
er aldrig gennemført, så der er intet refresh token. Koden, workflowene og
alle kontroller er på plads og korrekte.

Bevis: `Kontroller Google-adgang` kørte for første gang nogensinde den 1.
november ([kørsel 41351014635](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/actions/runs/41351014635))
og meldte alle fem som manglende. Der findes heller ingen commit
`google: adgang fornyet`, som `Forny Google-adgang` ville have lavet.

## Det, der allerede fungerer — efterprøvet i koden

| | |
| --- | --- |
| Autorisations-URL | `scope=.../auth/business.manage`, `access_type=offline`, `prompt=consent`, `response_type=code` — alt korrekt |
| Redirect URI | `https://kristiangg.dk/oauth/google/callback/` — matcher det, Google Cloud har |
| Callbacksiden | `static/oauth/google/callback/index.html` findes og udgives til `public/oauth/google/callback/index.html`. Den læser `code` og `state`, sammenligner nonce mod `sessionStorage` og viser koden. Ingen hemmelighed rører siden |
| Kodeombytningen | Sender `client_secret`, kræver `refresh_token` i svaret, og **afviser et token uden `business.manage`** |
| Fornyelsen ved publicering | Bytter refresh token til et access token pr. kørsel, gemmer det ikke, og maskerer det i loggen |
| Destinationskontrollen | `GBP_TILLADT_LOKATION` skal være fastlåst og bekræftes af Google ved hver kørsel |
| Hemmeligheder i logs | `skrub()` og `::add-mask::`. Metadatafilen bærer kun maskerede id'er |

Alt dette er læst i koden og dækket af 93 automatiske prøver. **Intet af det
er afprøvet mod Google**, for der er ingen adgang at prøve med — det er
netop blokeringen.

## Fælden, jeg fandt og har gjort selvdiagnosticerende

Tre ting peger hver sin vej:

| | |
| --- | --- |
| `Forny Google-adgang` | environment **`linkedin-oauth`** |
| Publicering og adgangskontrol | environment **`publicering`** |
| `skrivHemmelighed()` i bootstrap | **repo-niveau** |

En hemmelighed i ét environment kan kun læses af job i netop det
environment. Lægger du `GBP_CLIENT_ID` i `publicering` — hvor alle de andre
publiceringshemmeligheder ligger, og hvor det derfor er nærliggende at lægge
den — kan autorisationen **ikke** se den, og fejlen lyder
`GBP_CLIENT_ID mangler`, som om den slet ikke var oprettet.

Den værre variant: opretter du `GBP_TILLADT_LOKATION` med værdien `AFVENTER`
inde i `publicering`, **skygger** den for den fastlåste værdi, bootstrap
skriver på repo-niveau. Publiceringen ser `AFVENTER` og siger "kør
bootstrap"; bootstrap ser den fastlåste værdi og siger "allerede fastlåst".
Et låst rum med nøglen på begge sider af døren.

**Derfor: GBP-hemmelighederne skal ligge på repo-niveau.** Så ser begge
miljøer dem, og det er også dér, bootstrap selv skriver.

`Forny Google-adgang` → handling `kontroller` siger det nu selv for hver
enkelt hemmelighed: om den er synlig for jobbet, om den findes på
repo-niveau, og hvad forskellen betyder.

## Testing-status: den anden blokering

Google udsteder refresh tokens, der **udløber efter 7 dage**, når appen står
i `Testing` med ekstern brugertype. Så selv et gennemført forløb ville dø en
uge senere, og automatisk publicering ville stoppe uden anden fejl end
`invalid_grant`.

Koden opdager det og siger det ved bootstrap — `refresh_tidsbegraenset` i
`publicering/google-token.json` — og vagthunden varsler på det.

Jeg har ikke kunnet bekræfte, om `business.manage` kræver Googles
verifikation, før produktion fjerner 7-dagesgrænsen. En kilde beskriver, at
grænsen kan bestå, mens appen står "In production" men afventer
verifikation. Det må vise sig; metadatafilen viser svaret ved næste
autorisation.

## Det, du skal gøre — i rækkefølge

### 1. Registrér scopet i Google Cloud (2 minutter)

Du skrev, at Data Access ikke viser nogen scopes. Tilføj det:

Google Auth Platform → **Data Access** → Add or remove scopes → indsæt
manuelt:

```
https://www.googleapis.com/auth/business.manage
```

Save. Uden det kan samtykkedialogen afvise anmodningen eller udstede et
token uden scopet — og koden afviser så tokenet, som den skal.

### 2. Sæt publiceringsstatus til produktion (1 minut)

Google Auth Platform → **Audience** → Publishing status → **In production**.

Det er dette, der fjerner 7-dagesgrænsen. Gør det **før** du henter koden, så
det refresh token, du får, er det varige.

### 3. Læg fire hemmeligheder i GitHub på **repo-niveau** (3 minutter)

Settings → Secrets and variables → **Actions** → fanen **Secrets** →
New repository secret. **Ikke** under Environments.

| Navn | Værdi |
| --- | --- |
| `GBP_CLIENT_ID` | klientens ID, slutter på `.apps.googleusercontent.com` |
| `GBP_CLIENT_SECRET` | klientens secret fra Google Cloud |
| `GBP_TILLADT_LOKATION` | præcis ordet `AFVENTER` |
| `GBP_AUTH_CODE` | præcis ordet `venter` |

De to sidste er pladsholdere med vilje: `AFVENTER` betyder "destinationen er
ikke fastlåst endnu", og bootstrap fastlåser den. `venter` fanges som
pladsholder, før Google kaldes, så en halv kode ikke spildes.

Ligger nogen af dem allerede inde i environment `publicering`, så **slet dem
dér** — ellers skygger de.

### 4. Kør kontrollen (1 minut, kalder ikke Google)

GitHub → Actions → **Forny Google-adgang** → Run workflow → handling
`kontroller`.

Den kalder ikke Google og bruger ikke koden. Den siger, hvad der er på
plads, hvor hver hemmelighed ligger, og hvad der mangler. **Gør dette før du
henter en kode** — en autorisationskode lever kun få minutter, og er
rørføringen forkert, er koden spildt.

Kræver dit tryk, fordi `linkedin-oauth` har dig som påkrævet godkender.

### 5. Hent koden og kør bootstrap (3 minutter, i træk)

1. <https://kristiangg.dk/oauth/google/> → indsæt Client ID → **Godkend hos
   Google**
2. Log ind som `kontakt@kristiangg.dk`, sæt flueben ved Business
   Profile-adgangen
3. Du lander på callbacken, som viser koden. Kopiér den
4. Settings → Secrets → `GBP_AUTH_CODE` → indsæt → Save
5. Actions → **Forny Google-adgang** → Run workflow → handling `bootstrap`

Gør 3–5 i træk. Koden lever kun få minutter.

Bootstrap bytter koden, får Google til at bekræfte lokationen, viser dig
hvilken profil den fandt, og gemmer `GBP_REFRESH_TOKEN`, `GBP_LOKATION` og
den fastlåste `GBP_TILLADT_LOKATION`. Du kopierer aldrig et token.

**Kontrollér profilnavnet, den viser.** Passer det ikke, så slet
`GBP_REFRESH_TOKEN` og stop.

### 6. Skift de tre Google-elementer til automatisk

Når kontrollen er grøn, er den sidste ændring én linje pr. element i
`publicering/koe.json`: `"metode": "manuel"` → `"metode": "motor"` for
element 49, 53 og 54. Sig til, så laver jeg den.

Rør **ikke** element 4, 9, 13, 28 og 32 — de er publiceret eller tabt, og
en ændring dér kunne sende et opslag ud, der allerede er ude.

## Hvad der ikke er galt

For at spare dig skærmbilleder: jeg har ikke fundet noget i vejen med
OAuth-klienten, redirect URI'en, callbacksiden, scopet i koden eller
token-håndteringen. Du skal **ikke** oprette en ny klient. Den eksisterende
kan bruges, og koden passer til den, som den er.

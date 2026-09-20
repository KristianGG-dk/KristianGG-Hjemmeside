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

## Flowet

```
1.  node linkedin-oauth.mjs start      lokalt. Genererer state, udskriver URL
2.  Kristian godkender i browseren     som sig selv, ikke som en side
3.  LinkedIn → callbacken              ?code=…&state=…
4.  Callbacken viser code + state      statisk side. Bytter intet. Sender intet.
5.  node linkedin-oauth.mjs byt        lokalt. State kontrolleres, kode byttes
6.  /v2/userinfo                       hvem tilhører tokenet? URN udledes
7.  Kristian lægger i GitHub Secrets   token + URN + tilladt URN
```

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

## Hemmeligheder

| Navn | Hvor | Hvorfor |
| --- | --- | --- |
| `LI_CLIENT_ID` | kun lokalt miljø | bruges i OAuth-forløbet |
| `LI_CLIENT_SECRET` | kun lokalt miljø | **må aldrig i repoet eller i GitHub Secrets.** Motoren har ikke brug for den — kun tokenudstedelsen har. |
| `LI_ACCESS_TOKEN` | GitHub Secrets | motorens adgang |
| `LI_PERSON_URN` | GitHub Secrets | den URN, der publiceres til |
| `LI_TILLADT_URN` | GitHub Secrets | den URN, der **må** publiceres til |

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
- **Uden** → Kristian godkender på ny inden udløb, og vagthunden skal varsle i
  god tid. Det er en administrativ opgave hver anden måned, ikke en blokering.

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
| Token udstedt | nej — og må ikke, før URL'en er registreret |
| Destinationskontrol i publisher | ✓ fail closed, 14 prøver |
| Adgangskontrol (kun læsning) | ✓ |
| Billedunderstøttelse i publisher | ikke bygget |
| Planlagt kørsel for LinkedIn | ikke bygget |
| Låsefiler til LinkedIn-elementer | ikke bygget |

**Tørløb er fortsat standard i `publicer-linkedin.mjs`.** Der er ikke
publiceret noget, og ingen planlagte opslag er ændret.

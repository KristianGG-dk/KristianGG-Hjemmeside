# Publiceringsmotoren — regler

Dette er den autoritative regelfil. Er der uenighed mellem denne fil og noget
andet i repoet, gælder denne. `LAES-MIG.md` er byggehistorik og
sikkerhedsbeskrivelse — den indeholder ikke regler.

## Den ufravigelige regel

**Intet publiceres uden Kristians godkendelse.**

Efter godkendelsen må motoren aldrig selv ændre tekst, billede, alt-tekst, CTA,
hashtags, kanal, dato eller tidspunkt. Heller ikke for at få et opslag igennem,
og heller ikke når noget fejler. Skal noget laves om, kræver det en ny
godkendelse og en ny lås.

Motoren udfører den tekniske handling. Den træffer ingen beslutning om indhold.

## Kanaler

| Kanal | Publicering | Hvem udløser | Planlægning |
| --- | --- | --- | --- |
| `website` | Hugo + Netlify | automatisk | Hugo udelader fremtidsdaterede indlæg; `genopbyg-planlagt` bygger på dagen |
| `facebook` | Meta Graph API | Kristian trykker | **Meta holder opslaget** via `scheduled_publish_time` |
| `instagram` | Meta Graph API | automatisk på tidspunktet | **motoren holder det selv** — se nedenfor |
| `linkedin` | manuelt i LinkedIns brugerflade | Kristian | manuelt |
| `gbp` | manuelt i Google Business Profile | Kristian | manuelt |

`linkedin` og `gbp` har ingen API-integration og får ingen. De planlægges i
platformenes egne brugerflader og **registreres** i motoren, så kø, register og
vagthund dækker dem på lige fod.

## Godkendelse på tværs af kanaler

Et indholdselement kan godkendes til flere kanaler i **samme
godkendelsespakke**. Feltet `godkendelsespakke` i låsefilen er det, der binder
dem sammen.

- Hver kanalversion har sin egen låsefil med sin egen `versionslaas`. Det er
  låsen, der registrerer præcis hvilken kanalversion der er godkendt
- Er materialet identisk på tværs af kanaler, er `tekst_sha256` det samme.
  Identiske hashes betyder identisk materiale — det skal ikke godkendes to gange
- Afviger en kanalversion, afviger hashen. Forskellen skal fremgå af
  godkendelsespakken, før den godkendes
- `publicering/scripts/godkendelsespakker.mjs` viser grupperingen: hvilke
  kanaler en pakke dækker, og hvor materialet er ens og hvor det afviger

En kanal er kun i spil, hvis der findes en godkendt låsefil for den. At et
element ligger på Facebook betyder ikke, at det skal på Instagram.

## Låsen

`versionslaas` er `sha256` over kanonisk JSON af de låste felter, afkortet til
16 tegn. Den kan efterregnes af enhver.

**Feltlisterne i `laas.mjs` må ikke ændres.** `LAASTE_FELTER` indgår i hashen,
så en ændring ugyldiggør samtlige eksisterende låse på én gang. Nye kanaler
skal passe ind i den eksisterende feltform. Felter uden mening for en kanal
udfyldes efter samme konvention som de øvrige, fx
`slut_url: "(instagram-opslag, ingen URL foer publicering)"`.

## Instagram-planlægning

Instagram kan **ikke** planlægges som Facebook, og det er ikke et valg.

Metas Content Publishing har intet `scheduled_publish_time`, og en
mediecontainer udløber efter **24 timer** med status `EXPIRED`. Containere kan
derfor ikke oprettes i forvejen.

Reglen er:

```
Kristians godkendelse
  → låst Instagram-version
  → køen
  → motorens planlagte kørsel vågner på tidspunktet
  → container oprettes og udgives i SAMME kørsel
```

Workflowet `Publicer planlagte Instagram-elementer` kører hver halve time og
publicerer det, der er forfaldent. GitHub kan forsinke planlagte kørsler, så et
opslag går ud på eller kort efter det godkendte tidspunkt.

Publiceringen er to trin plus ventetid: `POST /{ig-user-id}/media` opretter
containeren, `GET /{container-id}?fields=status_code` venter til `FINISHED`, og
`POST /{ig-user-id}/media_publish` udgiver.

Kilde: [Meta — Publish Content using the Instagram
Platform](https://developers.facebook.com/docs/instagram-platform/content-publishing/).

## Fejl

Fejler en publicering:

1. Fejlen registreres i `register.json`
2. Det godkendte materiale bliver stående uændret
3. Motoren prøver **ikke** igen af sig selv
4. Der publiceres ingen alternativ version, intet andet billede, ingen omskrevet
   tekst og ingen ændrede hashtags

Et fejlet element springes over ved næste kørsel og kræver menneskelig
stillingtagen, før der prøves igen.

**Ved uvist udfald stopper motoren.** Lykkedes containeren, men fejlede
udgivelsen, ved vi ikke, om Meta nåede at udgive. Container-id'et gemmes i
registret, og et menneske skal se efter på Instagram, før der prøves igen —
ellers risikeres to opslag.

## Kø og register

`koe.json` er **hvad der skal ske**: alle godkendte elementer med kanal,
tidspunkt, metode og låsefil.

`register.json` er **hvad der er sket**. Det er en hændelseslog:

- Poster tilføjes, aldrig overskrives eller slettes
- Et element kan have flere poster — fx `PLANLAGT MANUELT` efterfulgt af
  `PUBLICERET`. Forløbet skal kunne læses

Statusser:

| Status | Betydning |
| --- | --- |
| `AFVENTER DATO` | godkendt, ligger klar, tidspunktet er ikke nået |
| `PLANLAGT` | afleveret til Meta, som holder opslaget (kun Facebook) |
| `PLANLAGT MANUELT` | planlagt i platformens egen brugerflade |
| `PUBLICERET` | ude |
| `PUBLICERING FEJLET` | forsøgt, mislykkedes |
| `PLANLAEGNING FEJLET` | planlægning hos Meta mislykkedes |

Instagram bruger `AFVENTER DATO` → `PUBLICERET` eller `PUBLICERING FEJLET`.
`PLANLAGT` bruges ikke, fordi Meta ikke holder et Instagram-opslag.

## Vagthunden

Vagthunden sammenholder køen med registret to gange dagligt. Den **læser kun** —
den publicerer intet og ændrer intet.

Den skelner mellem tre ting:

- **FEJL** — noget er beviseligt galt. Jobbet fejler, GitHub sender mail
- **BEKRÆFT SELV** — bør ses efter, men kan ikke bevises herfra
- **i orden** — forventet tilstand

For kanaler, hvor platformen selv holder opslaget, kan vagthunden ikke se ind og
kan derfor kun påminde. **Instagram er en undtagelse:** da motoren selv
publicerer, ville en kørsel have efterladt en post i registret. Et forfaldent
Instagram-element uden resultat er derfor en **FEJL** — efter en times nåde for
forsinkelse hos GitHub.

## Secrets

Alle credentials hentes fra GitHub Environment `publicering`, begrænset til
`main` under *Deployment branches*. Intet ligger i git.

| Navn | Bruges af |
| --- | --- |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | Facebook-publicering og -planlægning |
| `FB_APP_ID`, `FB_APP_SECRET` | adgangskontrol, granulære scopes |
| `IG_USER_ID`, `IG_ACCESS_TOKEN` | Instagram-publicering |
| `LI_ACCESS_TOKEN`, `LI_PERSON_URN` | LinkedIn-klienten, ikke i brug |
| `NETLIFY_BUILD_HOOK` | daglig genopbygning af sitet |

Ingen tokenværdi må committes, logges, skrives i registret, gemmes i artefakter
eller optræde i en fejlbesked. Alle scripts, der rører et token, skrubber det
af både URL'er og fejltekster, før noget logges.

## Gaten

`verificer.yml` kører på hver PR mod `main` og kontrollerer alle låsefiler:
obligatoriske felter, godkendelse og versionslås. For `website` kontrolleres
desuden byggeoutputtet. Gaten bygger med `--buildFuture`, så fremtidsdaterede
indlæg også kan verificeres; produktionsbygget hos Netlify gør det ikke, og det
er netop dét, der gør planlægningen mulig.

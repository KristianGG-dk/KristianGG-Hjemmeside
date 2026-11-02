# Vagthunden: hvad den melder, og hvorfor

Vagthunden kører 09.30 og 19.30 dansk tid. Alarmkanalen er jobbets
exit-kode: fejler kørslen, sender GitHub mail til ejeren. Ingen mailserver,
ingen ekstra hemmelighed.

Den er en **driftskontrol**, ikke en huskeliste. Derfor gælder én regel over
alle andre:

> En alarm, man har læst femogtredive gange og ikke kan gøre noget ved, er
> ikke en alarm længere. Den gør, at man holder op med at læse dem — og så
> forsvinder den rigtige alarm i mængden.

Og modsat: **vagthunden må aldrig tie om en reel driftsfejl for at opnå grøn
status.** De to krav er grunden til, at den skelner så omhyggeligt mellem
statusser.

## De tre niveauer

| | Betyder | Konsekvens |
| --- | --- | --- |
| **FEJL** | Noget er beviseligt galt og kræver handling | Kørslen fejler, du får mail |
| **BEKRÆFT SELV** | Bør ses efter, men kan ikke bevises herfra | Ingen mail |
| **i orden** | Forventet tilstand, noteret for fuldstændighedens skyld | Ingen mail |

## Statusserne

Registret er en append-only hændelseslog. **Den sidste række for et element
afgør**, og intet slettes nogensinde.

| Status | Betydning | Vagthunden |
| --- | --- | --- |
| `PUBLICERET` | Ude, med `post_id` | i orden |
| `PLANLAGT` | Afleveret til Meta, som udgiver det selv | bekræft selv, derefter i orden — se nedenfor |
| `PLANLAGT MANUELT` | Lagt i platformens egen planlægger af et menneske | som `PLANLAGT` |
| `AFVENTER DATO` | Godkendt, intet afleveret endnu | i orden før tiden; FEJL hvis motoren svigtede |
| `PUBLICERING IGANG` | Kravet taget, men kørslen meldte aldrig tilbage | **FEJL** — udfaldet er uvist |
| `PUBLICERING FEJLET` | Forsøget fejlede | **FEJL** |
| `STOPPET FOR SENT` | Motoren stoppede det: over 24 timer forsinket | **FEJL** indtil sagen lukkes |
| `OPGIVET` | Endeligt afsluttet, aldrig publiceret | i orden, med begrundelsen |
| `ANNULLERET HOS META` | Det planlagte opslag er slettet hos Meta | i orden |

De to sidste er **afsluttende**: `registerSpaerre()` rører elementet aldrig
igen. Det er vigtigt — uden den spærre blev et lukket element udvalgt på ny
hver kørsel og fik en frisk `STOPPET FOR SENT`-række hver gang, og et
annulleret Meta-opslag med fremtidig dato ville blive afleveret igen.

## Automatisk afslutning

`publicering/scripts/afslut-forfaldne.mjs` kører før vagthunden, hver gang
den kører. Den skriver `OPGIVET` for et opslag, hvor **alle** disse gælder:

* det godkendte tidspunkt er passeret med mere end publiceringsvinduet
  (24 timer, `MAKS_FORSINKELSE_S` i `krav.mjs`)
* seneste status er `AFVENTER DATO` eller `STOPPET FOR SENT` — altså aldrig
  afsendt
* kanalen er ikke `website`

Begrundelsen skrives med: hvornår det forfaldt, hvor sent det er, hvad
status var før, og om der fandtes en låsefil. **Historikken bevares** — man
kan bagefter se både hvad der var planlagt, hvad der skete, og hvorfor det
blev opgivet.

### Hvad der aldrig lukkes automatisk

| | Hvorfor |
| --- | --- |
| `PUBLICERET`, `PLANLAGT`, `PLANLAGT MANUELT` | Opslaget **er** afsendt. `OPGIVET` ville være en usandhed |
| `PUBLICERING IGANG`, `PUBLICERING FEJLET`, `PLANLAEGNING FEJLET` | Udfaldet er **uvist**. Opslaget kan være gået ud; det kræver et menneske på platformen |
| `website` | HTTP-kontrollen afgør sagen. En side, der ikke svarer, er en rigtig driftsfejl og skal ses |
| Alt inden for vinduet | Et opslag, der stadig kan publiceres lovligt, røres ikke |

## Afleveret, men ubekræftet

`PLANLAGT` og `PLANLAGT MANUELT` betyder, at opslaget ligger hos platformen,
som udgiver det selv. Vagthunden kan ikke se ind i Meta, Google eller
LinkedIn og kan hverken bekræfte eller afvise, at det gik ud.

Den påmindede derfor om det — hver kørsel, i det uendelige. Element 24 fik
den samme påmindelse to gange om dagen i seksogtyve dage.

Efter **syv dage** antages opslaget udgivet og noteres som i orden. Det er en
**antagelse**, og den skrives som en antagelse. Intet registreres som
publiceret på den baggrund. Vil du have det stående som publiceret, skriver
du en række med status `PUBLICERET` og `post_id`.

## Kører maskinen overhovedet?

Den blinde vinkel indtil nu: vagthunden kontrollerede, om opslagene var
kommet ud — men ikke om **maskinen, der skal sende dem**, stadig kørte.
Standsede cron, ville den først melde noget, når et opslag var faldet
igennem, og da er det for sent.

Den ser nu efter, hvornår hvert planlagt workflow sidst kørte:

| Workflow | Advarsel | FEJL |
| --- | --- | --- |
| `publicer-instagram-planlagt` | 8 timer | 24 timer |
| `publicer-linkedin-planlagt` | 8 timer | 24 timer |
| `publicer-google-planlagt` | 8 timer | 24 timer |
| `planlaeg-alle` (cron hver 6. time) | 12 timer | 36 timer |
| `genopbyg-planlagt` (cron dagligt) | 30 timer | 50 timer |

FEJL-grænserne er sat efter, hvad der faktisk kan gå tabt: med et
publiceringsvindue på et døgn betyder et hul på over et døgn, at et godkendt
opslag kan falde helt igennem.

Grænserne er rummelige med vilje. GitHubs cron er "best effort" — målt
27/10–01/11 kørte Instagram-sporet reelt hver 3.–6. time, selv om cron siger
hvert kvarter. Kontrollen skal fange en kørsel, der er **standset**, ikke en
der er forsinket. Se `paalidelig-udloeser.md`.

Kræver `actions: read` og `GITHUB_TOKEN`. Køres vagthunden lokalt, findes de
ikke, og kontrollen springes over og siger det.

**Netlify** kontrolleres ad to veje: `genopbyg-planlagt` er den kørsel, der
udløser Netlify-builds, og for hvert website-element hentes den faktiske URL
over HTTP. Svarer siden, har Netlify udgivet den.

## Adgang og hemmeligheder

Vagthunden har **ingen** hemmeligheder — den har intet `environment`. Den kan
derfor ikke selv prøve et token. I stedet læser den de metadatafiler, som
fornyelserne skriver:

* `publicering/linkedin-token.json` — udløbsdato. Varsler som FEJL fra 14
  dage før, fordi fornyelsen er manuel.
* `publicering/google-token.json` — om adgangen er autoriseret, og om
  refresh tokenet er tidsbegrænset (appen i "Testing").

Et token, der er tilbagekaldt midt i sin levetid, opdages derfor først, når
en publicering fejler. Det er den ærlige grænse. `Kontroller social adgang`
og `Kontroller Google-adgang` prøver de rigtige tokens, men de startes i
hånden.

## Sådan lukker du en sag

Et stoppet eller fejlet opslag meldes, indtil der står et valg i registret.
Den sidste række for elementet afgør:

| Du vil | Status |
| --- | --- |
| Publicere det i hånden alligevel | `PUBLICERET` med `post_id` |
| Lade det falde | `OPGIVET` og en kort grund i `noter` |
| Slette et planlagt Meta-opslag | `ANNULLERET HOS META` — se `annuller-hos-meta.md` |
| Give det en ny dato | Ny godkendelse og ny låsefil — Claudes og din sag |

For forældede, aldrig publicerede opslag gør afslutteren det selv. De øvrige
kræver dit valg, fordi maskinen ikke kan vide, hvad du vil.

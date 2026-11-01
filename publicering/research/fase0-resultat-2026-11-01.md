# Fase 0 — måleresultat, 1. november 2026

Første runde kørt fra en GitHub Actions-runner kl. 17:28 UTC
([kørsel 41331543737](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/actions/runs/41331543737)).
Rapporten herunder er maskinskrevet af `fase0-afproev-kilder.mjs` og gengivet
uændret. Anden runde — feed-autodiscovery — kører på samme pull request.

**8 af 18 kandidater svarede brugbart.**

| Kilde | Land | Status | Format | Poster | Nyeste | Pr. 30 dage | Takt | robots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Videnskab.dk | DK | OK | RSS | 40 | 2026-11-01 | 41 | dagligt eller oftere | ja |
| DR — Indland | DK | OK | RSS | 20 | 2026-11-01 | 20 | dagligt eller oftere | ja |
| Folketinget Open Data | DK | OK | JSON | 5 | — | — | kan ikke anslås | ? |
| PubMed — E-utilities (skovbad) | INT | OK | JSON | 292 | — | — | kan ikke anslås | **NEJ** |
| PubMed — åndedræt | INT | OK | JSON | 5973 | — | — | kan ikke anslås | **NEJ** |
| Europe PMC — REST | INT | OK | JSON | 193 | 2026-10-13 | 1 | månedligt | ja |
| medRxiv — API | INT | OK | JSON | 30 | 2026-10-01 | 0 | dagligt eller oftere | ? |
| Crossref — works | INT | OK | JSON | 255 | 2121-10-01 | 47 | dagligt eller oftere | ? |
| Sundhedsstyrelsen — nyheder | DK | 429 | HTML | — | — | — | — | ? |
| Sundhedsstyrelsen — udgivelser | DK | 429 | HTML | — | — | — | — | ? |
| Sundhedsdatastyrelsen | DK | 404 | HTML | — | — | — | — | ja |
| Arbejdstilsynet | DK | 404 | HTML | — | — | — | — | ja |
| NFA | DK | 404 | HTML | — | — | — | — | ? |
| VIVE | DK | 404 | JSON | — | — | — | — | ja |
| Psykiatrifonden | DK | 404 | HTML | — | — | — | — | ja |
| Altinget — Sundhed | DK | 404 | JSON | — | — | — | — | ja |
| Retsinformation — søgning | DK | 200 | **HTML** | — | — | — | — | ja |
| Danmarks Statistik — StatBank | DK | 400 | JSON | — | — | — | — | ? |

## Fire forbehold ved målingen

Tallene skal ikke læses mere præcist, end de er.

**1. Crossref melder nyeste post 2121-10-01.** En dato 95 år ude i fremtiden.
Enten står der fremtidsdaterede poster i Crossrefs data, eller også opfanger
datoudtrækket et felt, der ikke er udgivelsesdatoen. Indsamlingen skal afvise
datoer i fremtiden, før den bruger dem til noget.

**2. Folketinget og PubMed viser ingen takt**, fordi deres svar ikke bærer
datoer i det format, scriptet leder efter. Kilderne virker — takten er bare
ikke målt.

**3. medRxiv viser «dagligt» men 0 poster på 30 dage.** Forespørgslen var
afgrænset til oktober, så målingen beskriver vinduet, ikke kilden.

**4. Folketingets 5 poster** er loftet i min egen forespørgsel (`$top=5`),
ikke kildens volumen.

## PubMed og robots.txt — det skal afklares

Afprøvningen melder **NEJ** på robots.txt for begge PubMed-forespørgsler.
NCBI's robots.txt afviser crawlere på `/entrez/`.

Det afgør ikke sagen. E-utilities er et dokumenteret API med sin egen
brugspolitik, og robots.txt regulerer crawlere, ikke API-klienter. Men jeg har
ikke læst NCBI's brugspolitik — den kunne ikke nås herfra — og vil derfor
**ikke** erklære brugen i orden.

Før PubMed indgår i fase 1 skal NCBI's *E-utilities Usage Guidelines* læses, og
der skal hentes en API-nøgle. Med nøgle er grænsen 10 forespørgsler i sekundet
mod 3 uden, og brugen bliver identificerbar. Indtil det er gjort, står PubMed
som **ikke afklaret** — ikke som brugbar.

## De seks danske 404'ere

Adresserne var gæt, og gættene var forkerte. En websøgning fandt heller ingen
officielle feeds for sst.dk, at.dk, vive.dk eller nfa.dk; Sundhedsstyrelsen
tilbyder nyhedsbrev på e-mail i stedet.

Jeg gætter ikke videre. Anden runde spørger i stedet sitene selv:
`<link rel="alternate">` i forsidens HTML, sitemap-henvisninger i robots.txt,
og om `/sitemap.xml` findes med brugbare `lastmod`-datoer. Et sitemap er ikke
et feed, men det er publiceret for at blive læst maskinelt og kan bære
ændringsdetektion, hvor intet feed findes.

**Sundhedsstyrelsens 429 er noget andet end de øvrige.** 429 betyder «for mange
forespørgsler» — ikke «findes ikke». Adressen kan være rigtig og svaret
skyldes botbeskyttelse. Den skal prøves igen med længere pause, før den
afskrives.

## Foreløbig vurdering

| | Kilde | Kvalitet | Aktualitet | Anbefalet takt |
| --- | --- | --- | --- | --- |
| Klar | Videnskab.dk | Formidling, ikke primærkilde — god til at opdage, dårlig som dokumentation | Daglig, frisk i dag | Ugentligt |
| Klar | DR Indland | Medie. Signal om samfundsdebat, aldrig dokumentation | Daglig, frisk i dag | Ugentligt |
| Klar | Europe PMC | Fagfællebedømt, primærkilde | Månedligt på dette søgeord | Ugentligt |
| Klar | Crossref | Metadata på tværs af forlag, primærkilde | Høj, men datoer skal renses | Ugentligt |
| Klar | medRxiv | **Præprint — ikke fagfællebedømt.** Må aldrig stå som dokumentation alene | Høj | Ugentligt |
| Klar | Folketinget Open Data | Officiel, lovgivning | Ikke målt | Ugentligt |
| Ikke afklaret | PubMed ×2 | Stærkeste forskningskilde | Ikke målt | Afventer brugspolitik + nøgle |
| Afventer runde 2 | 6 danske myndigheder/organisationer | Ville være de stærkeste danske kilder | — | — |
| Afvist | Retsinformation (gættet sti), DST StatBank (fejl i forespørgsel) | — | — | Forespørgslen skal bygges om |

**Den vigtigste mangel er dansk myndighedsdækning.** De kilder, der ville veje
tungest fagligt — Sundhedsstyrelsen, Arbejdstilsynet, NFA, VIVE — er netop dem,
der ikke svarede. Uden dem bliver dansk dækning medier og formidling, og det er
svagere end det, den redaktionelle linje kræver. Anden runde afgør, om de kan
nås ad anden vej.

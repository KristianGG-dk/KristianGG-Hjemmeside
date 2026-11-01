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

---

# Anden runde — feed-autodiscovery

Kørt kl. 17:33 UTC
([kørsel 41331911494](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/actions/runs/41331911494)).
Spørgsmålet var ikke «virker min gættede adresse», men «oplyser sitet selv et feed».

**Svaret er nej. Ingen af de otte danske domæner har et `<link rel="alternate">`
med RSS eller Atom i forsidens HTML.** Det er ikke mine gæt, der var dårlige —
kilderne udgiver ikke feeds.

| Domæne | Feed | Sitemap | Adresser | Nyeste lastmod | Brugbar? |
| --- | --- | --- | --- | --- | --- |
| Sundhedsdatastyrelsen | ingen | ja | 1.137 | 2026-10-29 | **Ja** — via lastmod |
| Psykiatrifonden | ingen | ja | 767 | 2026-10-30 | **Ja** — via lastmod |
| Altinget | ingen | ja | 30.039 | 2026-11-01 | **Ja** — via lastmod |
| Arbejdstilsynet | ingen | ja | 1.471 | **ingen** | Svag — intet lastmod |
| VIVE | ingen | indeks | 2 | ingen | Uafklaret — indeks skal følges |
| Retsinformation | ingen | indeks | 21 | ingen | Uafklaret — indeks skal følges |
| Sundhedsstyrelsen | — | — | — | — | **Nej** — 429 på alt |
| NFA | ingen | nej (404) | — | — | **Nej** — intet at hente |

## Hvad det betyder

**Sitemap-overvågning er vejen for dansk myndighedsindhold.** Et sitemap er
ikke et feed, men `<lastmod>` fortæller, hvornår en side sidst ændrede sig, og
sitemappet er netop publiceret for at blive læst maskinelt. Tre kilder kan
overvåges sådan i dag: Sundhedsdatastyrelsen, Psykiatrifonden og Altinget —
alle tre med lastmod inden for de seneste tre dage.

**Arbejdstilsynet har 1.471 adresser uden en eneste lastmod.** Ændring kan
derfor kun opdages ved at hente hver side og sammenligne indhold. Det er
tungt, og det nærmer sig crawling frem for at læse et publiceret indeks. Det
anbefales ikke uden at læse deres vilkår først.

**VIVE og Retsinformation har sitemap-indekser**, hvor lastmod ligger i de
underliggende filer. Det kræver ét ekstra hop og er sandsynligvis løsbart,
men er ikke afprøvet. Står som uafklaret.

**Sundhedsstyrelsen svarer 429 på alt** — forside, robots.txt og sitemap.
Det er konsekvent botbeskyttelse, ikke en tilfældig overbelastning. Siden kan
ikke overvåges maskinelt uden en aftale med dem. Deres nyhedsbrev på e-mail er
den vej, de selv anviser.

**NFA har hverken feed, robots.txt eller sitemap.** Intet at hente.

## Samlet kildeoversigt efter fase 0

| Niveau | Kilde | Kvalitet | Aktualitet | Takt |
| --- | --- | --- | --- | --- |
| Klar | Europe PMC | Fagfællebedømt, primærkilde | månedligt på søgeordet | ugentligt |
| Klar | Crossref | Primærkilde, tværgående metadata | høj (datoer skal renses) | ugentligt |
| Klar | Folketinget Open Data | Officiel, lovgivning | ikke målt | ugentligt |
| Klar | Videnskab.dk | Formidling — opdagelse, ikke dokumentation | daglig | ugentligt |
| Klar | DR Indland | Medie — signal om debat, aldrig dokumentation | daglig | ugentligt |
| Klar, med forbehold | medRxiv | **Præprint, ikke fagfællebedømt** | høj | ugentligt |
| Klar via sitemap | Sundhedsdatastyrelsen | Myndighed — stærk | lastmod 29-10 | ugentligt |
| Klar via sitemap | Psykiatrifonden | Organisation — god | lastmod 30-10 | ugentligt |
| Klar via sitemap | Altinget | Medie, politik og lovændringer | lastmod 01-11 | ugentligt |
| Ikke afklaret | PubMed ×2 | Stærkeste forskningskilde | — | afventer brugspolitik + API-nøgle |
| Ikke afklaret | VIVE, Retsinformation | Begge stærke | — | sitemap-indeks skal følges |
| Frarådes | Arbejdstilsynet | Stærk kilde, men kun ved crawling | — | — |
| Kan ikke | Sundhedsstyrelsen, NFA | Ville være stærkest | — | — |

**Ni kilder kan overvåges nu.** Seks direkte, tre gennem sitemap.

## Konsekvens for fase 1–4

Dansk myndighedsdækning bliver **svagere end forudsat**. Sundhedsstyrelsen —
den kilde, der vejer tungest i jeres evidensregister og compliancegrundlag —
kan ikke overvåges maskinelt. Arbejdstilsynet og NFA heller ikke på forsvarlig
vis.

Tre ting kan gøres ved det, og de udelukker ikke hinanden:

1. **Tilmeld Sundhedsstyrelsens nyhedsbrev** til en adresse, der arkiveres.
   Det er den kanal, de selv anviser, og den kan læses manuelt én gang om ugen.
2. **Følg sitemap-indekserne** for VIVE og Retsinformation. Ét ekstra hop,
   formentlig løsbart, og det ville give to stærke danske kilder tilbage.
3. **Accepter, at myndighedslaget er manuelt.** Motoren dækker forskning,
   politik og debat; myndighedsnyt kommer ind ad en anden vej.

Dette bør afgøres, før fase 1 bygges — ikke efter.

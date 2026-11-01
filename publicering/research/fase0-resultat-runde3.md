# Fase 0, tredje runde — resultat og endelig anbefaling

Kørt 1. november 2026 kl. 17:41–17:44 UTC
([kørsel 41332602333](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/actions/runs/41332602333)).
Tallene er maskinmålte og gengivet uændret.

## A. Sitemap-indekserne — begge virker

| Kilde | Indeks | Underfiler | Afprøvet | Adresser | Med lastmod |
| --- | --- | --- | --- | --- | --- |
| VIVE | ja | 2 | 2 | 21.585 | **21.585** |
| Retsinformation | ja | 21 | 3 | 20.007 | **20.000** |

Begge kilder er reddet. Ét hop ned i indekset var alt, der skulle til.

## B. Er datoerne pålidelige? Ja — begge

Det var den egentlige risiko. En dato, der stemples ens på alt ved hver
bygning, er ikke en ændringsdato og ville udløse falske fund hver uge.

| Kilde | Nyeste | Ældste | Unikke dage | Andel på nyeste dag | Fremtidige | Dom |
| --- | --- | --- | --- | --- | --- | --- |
| VIVE | 2026-11-01 | 2022-12-20 | **679** | **0 %** | 0 | **brugbar** |
| Retsinformation | 2026-10-31 | 2022-02-09 | **1.385** | **0 %** | 0 | **brugbar** |

679 og 1.385 forskellige dage spredt over fire år, ingen ophobning på den
nyeste dag, ingen fremtidige datoer. Det er ægte ændringsdatoer, ikke
bygningsstempler.

**VIVE svarer med ETag på 6 ud af 6 adresser i stikprøven.** Betinget
hentning med `If-None-Match` er derfor mulig: serveren svarer `304 Not
Modified`, når intet er ændret, og sender ikke indholdet igen. Kilden
belastes kun ved faktisk ændring. Det er den rigtige løsning på kravet om
ikke at overbelaste kilderne — bedre end bare at hente sjældnere.

Retsinformation sender hverken ETag eller `Last-Modified` på sine sider, men
sitemappet bærer brugbare datoer. Ændringsdetektion sker der.

## C. Sundhedsstyrelsen — kan ikke overvåges maskinelt

| Forsøg | Status |
| --- | --- |
| sst.dk forside | 429 |
| sundhedsstyrelsen.dk forside | 429 |
| sundhedsstyrelsen.dk robots.txt | 429 |
| sundhedsstyrelsen.dk sitemap | 429 |
| sundhedsstyrelsen.dk nyheder | 429 |

Fem forsøg, to officielle værtsnavne, seks sekunders pause imellem. **Alle
svarede 429.** Det er konsekvent adgangsbegrænsning, ikke overbelastning —
end ikke `robots.txt` udleveres.

Konklusionen er entydig: **Sundhedsstyrelsen kan ikke overvåges automatisk
på en tilladt måde.** En søgning fandt heller intet åbent API; den danske
API-oversigt har Lægemiddelstyrelsen, men ikke Sundhedsstyrelsen.

**Alternativet er deres eget nyhedsbrev.** Tilmeld en adresse, der arkiveres,
på `sundhedsstyrelsen.dk/da/nyheder/abonner`. Det er den kanal, de selv
anviser, og den gennemgås manuelt én gang om ugen sammen med
godkendelsespakken. Det er ikke en nødløsning — det er den dokumenterede vej.

## D. Fjorten danske nyheds- og fagmedier

**2 af 14 oplyser et feed, der faktisk kan læses.**

| Kilde | Kildetype | Feed | Poster | Nyeste | Pr. 30 dage |
| --- | --- | --- | --- | --- | --- |
| Ugeskrift for Læger | fagmedie | `https://ugeskriftet.dk/rss/forside` | 24 | 2026-10-30 | 24 |
| Lægemiddelstyrelsen | myndighed | `https://laegemiddelstyrelsen.dk/da/Feeds/rss-feed/` | 20 | 2026-10-30 | 20 |

### To grunde til at tallet er for lavt

**1. En fejl i mit eget script.** Feedadresser blev hentet fra HTML uden at
afkode entiteter, så `?format=feed&amp;type=rss` blev sendt med `&amp;` i
adressen. **Sundhedspolitisk Tidsskrift er derfor fejlagtigt meldt ubrugelig.**
Fejlen er rettet i `fase0-danske-nyheder.mjs`, og kilden skal prøves igen.

**2. Autodiscovery finder kun annoncerede feeds.** Politiken, Information,
TV 2 og Kristeligt Dagblad har efter al sandsynlighed feeds — de oplyser dem
bare ikke med `<link rel="alternate">` i forsidens HTML. Fraværet her betyder
«ikke annonceret», ikke «findes ikke». De skal findes på udgiverens egen
feedoversigt, ikke gættes.

Dansk Psykolog Forenings feed blev fundet, men var tomt. Videncenter for
Arbejdsmiljø svarede slet ikke.

---

# Endelig anbefaling til fase 1–4

## Kilder efter evidensniveau

Niveauet afgør, hvad en kilde må bruges til — ikke blot om den må bruges.

### Niveau 1 — primærkilder, må bære dokumentation

| Kilde | Adgang | Type | Takt |
| --- | --- | --- | --- |
| Retsinformation | sitemap, 20.000 datoer | lovgivning | ugentligt |
| Folketinget Open Data | API | lovforslag | ugentligt |
| Sundhedsdatastyrelsen | sitemap, 1.137 datoer | myndighed | ugentligt |
| Lægemiddelstyrelsen | RSS | myndighed | ugentligt |
| Europe PMC | API | fagfællebedømt forskning | ugentligt |
| Crossref | API | forskningsmetadata | ugentligt |

Crossref leverer metadata, ikke artikler. Et fund derfra skal følges til den
faktiske udgivelse, før det bruges.

### Niveau 2 — forskningsinstitution, stærk men sekundær

| Kilde | Adgang | Takt |
| --- | --- | --- |
| VIVE | sitemap + ETag, 21.585 datoer | ugentligt, betinget hentning |

### Niveau 3 — fagmedier, god indgang, svag dokumentation

Ugeskrift for Læger (RSS), Psykiatrifonden (sitemap).

### Niveau 4 — formidling og nyheder, signal om debat

Videnskab.dk, DR Indland, Altinget. **Må aldrig stå som dokumentation.** De
bruges til at opdage, hvad der rører sig — kilden bag skal findes.

### Særskilt — præprint

medRxiv. Ikke fagfællebedømt. Må aldrig bære en påstand alene og skal
markeres som præprint, hvis det overhovedet nævnes.

## Hvad der kræver manuel håndtering

**Sundhedsstyrelsen.** Nyhedsbrev til en arkiveret adresse, gennemgås
ugentligt. Den vigtigste enkeltkilde i jeres evidensregister, og den eneste
tilbageværende manuelle.

**PubMed.** Står stadig som ikke afklaret. `robots.txt` siger nej;
E-utilities er et dokumenteret API, men NCBI's brugspolitik er ikke læst, og
der er ingen API-nøgle. Afklares, før den tages i brug — ikke efter.

## Hvad der skal fravælges

| Kilde | Hvorfor |
| --- | --- |
| Arbejdstilsynet | 1.471 adresser, **nul** lastmod. Ændring kan kun ses ved at hente hver side — det er crawling, ikke indekslæsning |
| NFA | Hverken feed, robots.txt eller sitemap |
| Politiken, Information, TV 2, Kristeligt Dagblad, Mandag Morgen m.fl. | Ingen annonceret feed. Fravælges **foreløbigt** — kan tages op, hvis en feedadresse findes hos udgiveren |
| Danmarks Statistik StatBank | Forespørgslen var forkert bygget. Lav prioritet |

## Status på dansk dækning

Bekymringen fra anden runde er delvist afkræftet. Dansk dækning omfatter nu
**lovgivning** (Retsinformation, Folketinget), **myndighed**
(Sundhedsdatastyrelsen, Lægemiddelstyrelsen), **forskningsinstitution** (VIVE),
**fagmedie** (Ugeskrift for Læger, Psykiatrifonden) og **debat** (Altinget,
DR, Videnskab.dk).

Det hul, der står tilbage, er **Sundhedsstyrelsen og arbejdsmiljøområdet**
(Arbejdstilsynet, NFA). Det første løses med nyhedsbrevet. Det andet har
ingen teknisk løsning, der er værd at bygge.

**Tretten kilder kan overvåges automatisk.** Det er nok til at bygge fase 1.

---

## Efterprøvning af entitet-fejlen, 17:51 UTC

Rettelsen er kørt
([kørsel 41333177564](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/actions/runs/41333177564)).
Adressen sendes nu korrekt som `?format=feed&type=rss` uden `&amp;`.

**Resultatet er uændret: 2 af 14.**

Sundhedspolitisk Tidsskrift svarer på den rette adresse, og svaret *er* RSS —
men feedet indeholder **nul poster**. Begge varianter, rss og atom, er tomme.
Kilden er altså reelt ubrugelig, ikke ramt af min fejl.

Det samme gælder Dansk Psykolog Forening: feedet findes, men står tomt.

Rettelsen var alligevel værd at lave. Den fjernede en forkert forklaring, og
nu hviler konklusionen på kildens egen tilstand frem for på en fejl i mit
script. Men den ændrede ikke tallet, og Sundhedspolitisk Tidsskrift kan ikke
bruges.

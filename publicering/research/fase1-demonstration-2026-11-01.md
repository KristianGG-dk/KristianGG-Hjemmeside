# Fase 1 — demonstration med faktiske danske kilder

Kørt 1. november 2026 fra en GitHub Actions-runner
([kørsel på PR #85](https://github.com/KristianGG-dk/KristianGG-Hjemmeside/pull/85)).
Tallene er maskinmålte.

**Konklusionen først: motoren virker teknisk, men vurderer for dårligt til at
blive merget. Præcisionen er omkring 47 %. Det skal rettes først.**

## 1. Hvad motoren hentede

329 poster fra 13 kilder. 247 frasorteret som irrelevante, 5 gengangere,
**27 gik videre**.

| Kilde | Prioritet | Hentet | Nye | Frasorteret |
| --- | --- | --- | --- | --- |
| Retsinformation | 1 | 15 | 0 | 15 |
| Folketinget Open Data | 1 | 40 | 2 | 33 |
| Sundhedsdatastyrelsen | 1 | 4 | 0 | 4 |
| Lægemiddelstyrelsen | 1 | 20 | 0 | 20 |
| VIVE | 1 | 15 | 0 | 15 |
| Ugeskrift for Læger | 2 | 24 | 2 | 22 |
| Psykiatrifonden | 2 | 6 | 2 | 4 |
| Videnskab.dk | 3 | 40 | 6 | 34 |
| DR Indland | 3 | 20 | 0 | 20 |
| Altinget | 3 | 15 | 1 | 14 |
| Europe PMC | 4 | 25 | 8 | 17 |
| Crossref | 4 | 25 | 5 | 20 |
| medRxiv | 4 | 30 | 1 | 29 |

Alle 13 kilder svarede. Ingen fejl, ingen timeout, ingen 429.

## 2. Falske positive — omkring halvdelen

Af de 19 fund, motoren foreslog handling på, er **ni reelt relevante** og
**ti falske positive**.

### De ni rigtige

| Fund | Kilde | Hvorfor den holder |
| --- | --- | --- |
| Mindfulness and forest bath for arterial hypertension | Europe PMC | Skovbad, direkte i kernen |
| Acute Effects of Two Slow-Paced Breathing Protocols on HRV | Europe PMC | Åndedræt og autonom regulering, randomiseret |
| How the Acute Psychosocial Stress Response Ends — Vagal Re-Engagement | Europe PMC | Nervesystem og vagus |
| Intensive Interventions for Burnout, Stress and Occupational Well-Being | Europe PMC | Stress og arbejdsliv |
| Neural Oscillatory and Sympathetic Arousal During Mindfulness Meditation | Europe PMC | Arousal og nærvær |
| Autonomic recovery in yoga practitioners | Europe PMC | Autonom regulering, grænsetilfælde |
| Impact du stress professionnel sur la santé physique | Crossref | Arbejdsrelateret stress |
| Forskelsbehandling af mennesker med psykiatriske diagnoser | Psykiatrifonden | Dansk, relevant samfundsemne |
| Arbejdsmiljøet er udfordret på afdelingen | Ugeskrift for Læger | Arbejdsmiljø, grænsetilfælde |

### De ti forkerte

| Fund | Ramte ord | Hvad der gik galt |
| --- | --- | --- |
| Forslag om stop for nye **datacentre** | regulering | Generisk ord i helt andet felt |
| EU-aftale om **veterinærspørgsmål** med Færøerne | fællesskab | «Det Europæiske **Fællesskab**» |
| Optogenetisk behandling af **retinitis pigmentosa** | terapi | «gen**terapi**» — delstreng |
| **Drought Stress, Soil Salinity**, Diesel Oil i jord | stress | Plantefysiologi |
| Germinability i **Passiflora-frø**, salt stress | stress | Botanik |
| Rongban Tongmai granule, **atherosclerosis** | stress | Oxidativt stress, farmakologi |
| Stress and **Periodontal Disease** | stress | Tandkødssygdom |
| Psykologisk pleje efter **kemoterapi ved brystkræft** | depression | Perifert |
| **Psykiatrifondens ambassadører** | psykisk | Organisationsnyt, ikke fagligt |
| Organisational culture i **IT-sektoren** | stress | Svagt |

## 3. Fire fejl, og de er alle i min kode

**a. Delstrengssøgning uden ordgrænser.** «terapi» rammer inde i
«genterapi», «fællesskab» inde i «Det Europæiske Fællesskab». Ordene skal
matches som ord, ikke som tegnfølger.

**b. Ét generisk ord er nok til at slippe igennem.** «stress» alene lukker
plantefysiologi, tandkødssygdom og oxidativt stress ind. På engelsk
betyder *stress* noget helt andet i naturvidenskab end i psykologi.
Emneordene skal deles i **specifikke** (skovbad, naturterapi, nervesystem,
åndedræt, vagus) og **generiske** (stress, terapi, regulering, psykisk).
Et generisk ord alene må ikke være nok — der skal enten være et specifikt
ord, eller mindst to generiske i kombination.

**c. Sidematchet er degenereret.** Et fund med ét emneord mod en side, der
indeholder det ord, giver 1 ÷ 1 = **100 %**. Derfor står der «100 %
emneoverlap» på næsten alt, og derfor ender et slangevideo-fund med at
«være dækket af» blogindlægget om viljestyrke. Der skal kræves mindst to
delte ord i absolutte tal, før et sidematch overhovedet påstås — og uden
match skal feltet stå tomt frem for at pege på en tilfældig side.

Det er også derfor `/kurser/cash-stuffing/` optræder som nærmeste side for
psykiatriske emner. Siden nævner ordet «psykisk» én gang.

**d. To forespørgsler er for brede.** Crossref-søgningen
`nature therapy stress regulation` uden feltbegrænsning henter
plantevidenskab. Folketinget-forespørgslen henter de 40 senest opdaterede
sager uanset emne. Begge skal strammes ved kilden frem for at blive
sorteret bagefter.

## 4. En femte, som ikke er en fejl, men en begrænsning

**Prioritet 1-kilderne gav nul fund.** Retsinformation, VIVE,
Sundhedsdatastyrelsen og Lægemiddelstyrelsen leverede 54 poster, hvoraf
ingen var relevante.

For VIVE er forklaringen målbar: **257 adresser ændrede sig i vinduet, og
motoren så de 15 nyeste.** De 15 nyeste ændrede sider er ikke de 15 mest
relevante — det kan lige så godt være medarbejderprofiler eller
tilrettede ældre udgivelser. Loftet er der af hensyn til kilden, og det
skal blive, men udvælgelsen skal filtreres på sti, så kun
`/udgivelser/`-agtige adresser kommer i betragtning.

Det er den vigtigste enkeltrettelse: **de kilder, du prioriterer højest,
er dem, motoren i dag er dårligst til at læse.**

## 5. Hvad der virkede

- Alle 13 kilder svarede. Ingen fejl, ingen 429, ingen timeout
- 247 af 329 poster blev korrekt sorteret fra
- Gengangerfiltret fangede 5
- Fremtidige datoer blev afvist — ingen gentagelse af Crossrefs år 2121
- Præprint blev markeret og ført til D eller E, aldrig til en ny side
- Formidlingskilder kunne ikke udløse en ny side, kun C eller E
- Ét samlet afsnit i godkendelsespakkens form, ikke en ny rapport
- Prioritetsrækkefølgen holdt: 1 før 2 før 3 før 4

Rammen holder. Det er dømmekraften indeni, der er for grov.

## 6. Anbefaling

**Merg ikke PR #85 som den er.** Rettelserne a–d plus stifiltret er
afgrænsede og kan laves på samme gren, hvorefter demonstrationen køres igen
på de samme kilder. Først når præcisionen er oppe omkring 85 %, er motoren
værd at bruge tid på om ugen.

En motor, der leverer ti forkerte forslag ud af nitten, koster mere
opmærksomhed, end den sparer.

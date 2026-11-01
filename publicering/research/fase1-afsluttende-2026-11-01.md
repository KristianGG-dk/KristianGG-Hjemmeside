# Fase 1 — afsluttende demonstration og leverance

Kørt 1. november 2026 fra en GitHub Actions-runner, samme 13 kilder som den
første demonstration. Tallene er maskinmålte.

## Før og efter

| | Første kørsel | Efter rettelse |
| --- | --- | --- |
| Hentede poster | 329 | 311 |
| Gik videre | 27 | **15** |
| Heraf åbenlyst irrelevante | **10** | **0** |
| A — opdatér eksisterende side | 16 (næsten alle på fejlmatch) | **7** |
| B — ny artikel | 3 | 3 |
| C — opslag | 0 | 3 |
| D — afvent | 0 | 0 |
| E — ingen handling | 8 | 2 |
| Skønnet præcision | ~47 % | **~75 %** |

**Samtlige ti falske positive er væk**, og ingen nye er kommet til.

| Falsk positiv i første kørsel | Nu |
| --- | --- |
| Forslag om stop for nye datacentre | afvist — udelukkelsesord |
| EU-veterinæraftale med Færøerne | afvist — udelukkelsesord |
| Optogenetisk behandling af retinitis pigmentosa | afvist — udelukkelsesord |
| Drought Stress, Soil Salinity, dieselolie i jord | afvist — udelukkelsesord |
| Germinability i Passiflora-frø | afvist — udelukkelsesord |
| Rongban Tongmai granule, atherosclerosis | afvist — udelukkelsesord |
| Stress and Periodontal Disease | afvist — udelukkelsesord |
| Psykologisk pleje efter kemoterapi | frasorteret — ét generisk ord |
| Psykiatrifondens ambassadører | frasorteret — ét generisk ord |
| Organisational culture i IT-sektoren | frasorteret — ét generisk ord |

Crossref gik fra fem fund, alle forkerte, til **nul**. Folketinget fra 40
sager uden filter til 60 hentet, 6 tilbage efter titelfilter, 1 relevant.

## Sidematchene er nu rigtige

Det var den værste fejl: ét emneord gav 1 ÷ 1 = 100 %, så et slangevideo-fund
blev «dækket af» blogindlægget om viljestyrke.

| Fund | Nærmeste side |
| --- | --- |
| Slow-Paced Breathing og Heart Rate Variability | `/til-dig/nervesystemet/` |
| Slow Breathing Exercises hos hjertepatienter | `/til-dig/nervesystemet/` |
| Mindfulness and forest bath | `/begivenheder/skovbad-svanninge-bakker/` |
| Ecotherapy as Restorative Healing | `/blog/skovbad-walk-and-talk-naturterapi-forskellen/` |
| Nature based intervention, systematic review | `/blog/skovbad-walk-and-talk-naturterapi-forskellen/` |
| Burnout, Stress and Occupational Well-Being | `/til-dig/naturterapi/` |
| Mindfulness Meditation og arousal | `/begivenheder/mand-24-timer-uden-krav/` |

Alle syv peger på en side, hvor emnet faktisk hører hjemme. Ingen peger
længere på forsiden eller på `/kurser/cash-stuffing/`.

## Hvad der blev rettet

**1. Ordgrænser.** JavaScripts `\b` bygger på ASCII og opfører sig forkert
omkring æ, ø og å. Matchningen bruger nu Unicode-bogstavklassen med plads til
tre bøjningsbogstaver: «stress» rammer «stressen», men ikke «genterapi» for
«terapi». Danske bogstaver normaliseres på **begge** sider, så et match ikke
afhænger af, om kilden skriver «fællesskab» eller «faellesskab».

**2. Generiske søgeord.** 51 specifikke, 31 generiske, 38 udelukkelsesord.
Ét specifikt ord rækker. Ét generisk gør aldrig. Udelukkelsesordene er valgt
ud fra de faktiske falske positive — *drought stress*, *periodontal*,
*oxidative stress*, *datacenter*, *europæiske fællesskab*.

**3. Sidematch.** Absolut overlap i stedet for et forhold: mindst to delte
ord og mindst ét specifikt — eller tre generiske. Et specifikt ord i sidens
**titel** er et stærkt signal og rækker alene. Intet match → feltet står tomt
frem for at pege på en tilfældig side.

**4. For brede forespørgsler.** Crossref bruger `query.bibliographic` med
citerede fraser. Folketinget filtreres på titel, da ODA ikke kan fritekstsøge.

**5. Prioritet 1-kilderne.** Fem kilder har stifilter, så kun udgivelses- og
nyhedsstier kommer i betragtning. VIVE ændrede 141 adresser denne gang;
motoren ser kun dem under `/udgivelser/`, `/nyheder/` og `/publikationer/`.

**6. Ækvivalensgrupper — fundet undervejs.** Efter rettelse 1–4 faldt A til 1
og B steg til 9: fundene er engelske, sitet er dansk, og «ecotherapy» fandt
aldrig naturterapisiden. 17 grupper binder nu udtrykkene sammen. Og
rangeringen blev rettet, så en side med emnet i titlen slår en side, der blot
nævner det — ellers vandt forsiden, som nævner alt.

## Reelle begrænsninger

**Tre fund er stadig svage.** Lovforslaget om Produktregisteret handler om
kemikalier, ikke arbejdspsykologi. De to Videnskab.dk-artikler om kosttilskud
ramte på «søvn». De er klassificeret som B og C, ikke som noget, der skal
skrives — men de fylder i rapporten. Det er prisen for ikke at filtrere så
hårdt, at ægte fund forsvinder.

**Prioritet 1 gav næsten ingenting.** Ét fund fra Folketinget, nul fra
Retsinformation, VIVE, Sundhedsdatastyrelsen og Lægemiddelstyrelsen.
Stifiltrene virker, men i denne uge var der simpelthen ikke noget relevant.
Det kan også betyde, at stifiltrene er for snævre — det kan først afgøres
over nogle uger.

**Sundhedsdatastyrelsen gav 0 ændrede adresser.** Enten var der intet nyt,
eller også rammer stifilteret ved siden af. Skal ses efter om et par uger.

**Vinduet er 10 dage.** Et fund, der er ældre, kommer ikke med. Det er med
vilje, men det betyder, at motoren ikke kan indhente noget bagud.

## GitHub Actions og sikkerhed

| | |
| --- | --- |
| Workflow-rettigheder | `permissions: {}` på topniveau |
| `research`-jobbet | `contents: read` — henter fra internettet, kan intet skrive |
| `arkiver`-jobbet | `contents: write` — ser aldrig internettet, læser kun artefakten |
| Hemmeligheder | ingen refereret |
| Push-mål | `research/fund` — aldrig `main` |
| Vagt | `vagt-arkiv.mjs`, kører to gange: i læsejobbet og lige før committen |
| Sidste spærre | diff uden for `publicering/research/` afviser committen |
| Prøver | 19, alle uden netadgang, kører **før** indsamlingen |

Vagten afviser ukendte felter, styretegn, urimelige længder og url'er, der
ikke er `http(s)`. Den kører på **data, aldrig på kode** — intet fra en
indsamlet kilde bliver fortolket eller udført. Afprøvet mod en manipuleret
fil: den fangede både en `javascript:`-url og et indsmuglet felt.

Vagten stoppede desuden en rigtig kørsel, første gang den mødte rigtige data:
pakkeafsnittet lå fejlagtigt i `fund/`. Den havde ret, og filen blev flyttet.

Den eksisterende kæde er kørt efter hver ændring og er uændret: 60 sider,
GATE BESTÅET, indholdskontrol BESTÅET, vagthund ingen fejl, hemmelighedsscan
rent. Ingen eksisterende URL, redirect, canonical eller låsefil er rørt.

## Anbefaling

**PR #85 er klar til merge.**

Motoren frasorterer åbenlyst uvedkommende emner, håndterer tvetydige fagord,
peger på den rigtige eksisterende side frem for at foreslå nye, lader
evidensniveauet styre anbefalingen, og siger «ingen væsentlige nye emner»
frem for at opfinde relevans.

De tre svage fund er en skønssag, ikke en fejl. 15 fund om ugen, hvoraf
omkring tre er for tynde, er til at overskue på et kvarter — og det var
målet.

To ting bør ses efter om tre-fire uger, når der er flere ugers data:
om stifiltrene på prioritet 1 er for snævre, og om Sundhedsdatastyrelsen
reelt leverer noget.

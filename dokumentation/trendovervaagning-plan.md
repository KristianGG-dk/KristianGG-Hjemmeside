# Trendovervågning — analyse og implementeringsplan

Udarbejdet 1. november 2026 på bestilling af Kristian. **Ingen ændring af
produktionsmotoren er foretaget.** Fase 0 er godkendt og ligger i
`publicering/research/`; fase 1–4 afventer samlet stillingtagen.

Planen bygger på en gennemgang af hele repoet: 24 scripts i
`publicering/scripts/`, 12 workflows, 7 prøvefiler, regelgrundlaget i
`PUBLICERING.md` og `regler/indholdsregler.json`, samt de otte dokumenter i
`dokumentation/`.

---

## 1. Hvad der allerede findes

Motoren er væsentligt mere færdig, end opgavens ordlyd lægger op til.

| Område | Status | Hvor |
| --- | --- | --- |
| Godkendelseskæde | Komplet | `laase/` (38 låse), `koe.json`, `register.json`, `pakker/` |
| Compliance-motor | Komplet | `kontroller-indhold.mjs` + `regler/indholdsregler.json`, regler mærket LOV/INTERN med lovhenvisning |
| CI-gate | Komplet | `verificer.mjs` på hver PR |
| Afstemning kø mod register | Komplet | `vagthund.mjs`, 2× dagligt |
| Redaktionel kontrol | Komplet | `redaktionel-balance.mjs`, `tekstgentagelse.mjs`, `faq-kobling.mjs` |
| Publicering | Komplet | Facebook, Instagram, LinkedIn, GBP — hver med sin planlægningsmodel |
| Sporbarhed | Komplet | Hændelseslog, versionslåse, godkendelsespakker |

Compliance, godkendelsesstyring og teknisk publicering **skal ikke bygges om**.
De er på plads og skarpere end det, opgaven beskriver.

## 2. Det reelle hul

Der findes **ingen researchfunktion**. Ikke et script, ikke et feed, ikke en
kilde-log. Motoren publicerer godkendt materiale fejlfrit, men ved intet om
omverdenen.

Der mangler: indsamling, scoring, sammenhængsanalyse af sitet,
beslutningstrinnet opdatér-eller-nyt, og effektmåling.

**Ét fund er afgørende for designet.** `indholdsregler.json` kræver allerede, at
en låsefil bærer et `evidens`-felt `{id, url, dokumenterer_ikke}`, når teksten
omtaler forskning, og `kontroller-indhold.mjs` håndhæver det. **Ingen låsefil
bruger feltet i dag.** Krogen til research er hugget ud og aldrig brugt. Det er
dér, researchen skal hænges op — ikke i et nyt parallelt system.

## 3. Den afgørende tekniske begrænsning

Udviklingsmiljøet har **ikke** fri netadgang. Det er dokumenteret tre gange
uafhængigt i dette repo — `api-undersoegelse.md`, `evidensregister.md`,
`compliancekontrol.md` — og bekræftet igen 1. november 2026.

**GitHub Actions-runnere har derimod fri netadgang.** Det er netop derfor,
motoren blev bygget i Actions frem for som Netlify-funktioner; begrundelsen
står i `publicering/LAES-MIG.md`.

Deraf arkitekturen:

| Trin | Hvor | Kræver opsyn |
| --- | --- | --- |
| Indsamling, afduplikering, ændringsdetektion | GitHub Actions, ugentligt | Nej |
| Faglig vurdering, A–E-beslutning, udkast | Claude Code-session | Ja |
| Kontrol, godkendelse, publicering | Eksisterende motor | Nej |

En runner kan hente og sammenligne. Den kan ikke vurdere fagligt. Alternativet
— at lade Actions kalde et sprogmodel-API — kræver nøgle og løbende udgift og
anbefales ikke i første omgang.

## 4. Kristians otte tilføjelser, og hvordan de er indarbejdet

**1. Bredden.** Research dækker forskning, nyheder, samfundsdebat, lovændringer
og faglige tendenser. Kandidatlisten i `publicering/research/kilder-kandidater.json`
er inddelt i `myndighed`, `forskning`, `medie`, `organisation` og `lovgivning`,
så bredden kan måles og ikke skrider mod ét hjørne.

**2. Dansk først.** Kandidatlisten er 13 danske mod 5 internationale. De
internationale er rene forskningskilder (PubMed, Europe PMC, Crossref,
medRxiv), hvor dansk dækning ikke findes. Feltet `land` gør fordelingen
målbar, så dansk forrang kan håndhæves i scoringen frem for at være en hensigt.

**3. Ikke kun RSS.** Afprøvningen dækker tre adgangsformer: RSS/Atom-feeds,
officielle API'er (PubMed E-utilities, Europe PMC, Crossref, medRxiv,
Folketingets Open Data, Danmarks Statistik, Retsinformation) og — hvor intet
andet findes — stabile søgeendepunkter. Scriptet aflæser formatet selv frem
for at tro på kandidatlisten. Det læser desuden `robots.txt` for hvert
værtsnavn, så lovligheden afgøres før brugbarheden.

**4. Opdatér frem for at producere.** Fase 2 sammenholder hvert fund med
sitets eksisterende sider, før der foreslås noget. Beslutningen A–E træffes
med A (opdatér eksisterende) som forvalg, og forslag om en ny artikel skal
begrundes mod de sider, der allerede dækker emnet. `indholdsplan.md` viser
allerede, at intern linkning til `/til-dig/psykoterapi/` er sitets svageste
punkt — det er et argument for at styrke eksisterende sider frem for at sprede
værdien på flere nye.

**5. Permanent historik.** Hver kørsel skriver `publicering/research/fund/ÅÅÅÅ-UU.json`
med kilde, URL, dato, resumé, hash og vurdering. Filerne committes og slettes
aldrig — samme princip som `register.json`, der er en hændelseslog og ikke en
tilstand. Dermed kan enhver vurdering føres tilbage til sit grundlag.

**6. Ingen ekstra rapport.** Researchen får **ikke** sit eget dokument.
Fundene skrives ind i den eksisterende godkendelsespakke i
`publicering/pakker/ÅÅÅÅ-uge-NN.md` som et afsnit foran elementerne. Det er
den pakke, Kristian i forvejen gennemgår, og formatet er allerede bundet til
gaten gennem feltet `godkendelsespakke` i låsefilerne. Afsnittene A–G fra
opgaven lægges ind i pakkens form i stedet for ved siden af den.

**7. Faglighed over popularitet.** Scoringen vægter kildetype og
dokumentationsstyrke højere end omtale. En myndigheds- eller fagfællebedømt
kilde kan nå fuld score; en ren medieomtale kan ikke, uanset hvor meget
opmærksomhed den får. Et emne kan derfor ikke prioriteres på medieomtale
alene — det skal have en kilde bag sig.

**8. Ændringer mellem kørsler, uden støj.** Hvert fund får en hash. En kørsel
sammenlignes med alle tidligere uger, og kun noget nyt eller væsentligt ændret
kommer med. Ingen notifikation sendes for en uge uden nyt; rapporten skriver
«ingen væsentlige nye emner». Takten pr. kilde sættes efter den opdateringstakt,
fase 0 måler — en kilde hentes ikke oftere, end den opdateres.

## 5. Implementeringsplan

**Fase 0 — kildeafprøvning. Godkendt, bygget, afventer kørsel.**
`publicering/research/fase0-afproev-kilder.mjs` + kandidatliste + workflow.
Afprøver 18 kandidater: svar, format, antal poster, nyeste dato,
opdateringstakt og robots.txt. Rører intet i produktionsmotoren.

**Fase 1 — indsamling.** Ugentligt workflow henter de kilder, fase 0 godkendte,
normaliserer og afduplikerer mod tidligere uger, skriver `research/fund/`.
Kører uden opsyn. Publicerer intet.

**Fase 2 — vurdering.** Mekanisk score 1–5 på det målbare: kildetype,
aktualitet, emneoverlap med eksisterende sider, originalitet mod tidligere
fund. De kriterier, der kræver dømmekraft, udfyldes i en Claude-session.
Resultatet er en A–E-beslutning med begrundelse.

**Fase 3 — sammenhængsanalyse.** Læser `public/` efter bygning og finder
modstridende oplysninger, dobbeltindhold, manglende interne links og forældede
datoer. Rapporterer kun.

**Fase 4 — indarbejdning i godkendelsespakken.** Afsnit A–G skrives ind i den
eksisterende pakkeform. Ingen ny rapport.

**Fase 5 — effektmåling.** Afventer Search Console-adgang, som ikke findes i
repoet i dag (se `seo-migrationskontrol.md`).

## 6. Afhængigheder

| Behov | Status |
| --- | --- |
| Fri netadgang i Actions | Findes |
| Search Console API | Mangler — service account og ejerskabsbekræftelse |
| Sprogmodel-API i Actions | Kun hvis fase 2 skal køre uden opsyn. Frarådes nu |

## 7. Hvor meget manuelt arbejde det fjerner

Søgningen og frasorteringen — ikke vurderingen. I dag skal nogen selv opdage,
at der er kommet ny forskning. Efter fase 1–2 ligger ugens fund sorteret,
afduplikeret og forhåndsscoret. Anslået 2–4 timer om ugen. Den faglige dom og
godkendelsen forsvinder ikke, og bør ikke.

## 8. Test før drift

Hver fase får prøver i `publicering/test/` som de syv eksisterende. Fase 1 og 3
kører i tørløb mod faste testdata, så resultatet er forudsigeligt uden
netadgang. Ingen funktion kaldes automatiseret, før dens prøve består i CI.

**Den eksisterende gate skal bestå uændret hele vejen.** Researchen må ikke
kunne åbne en vej uden om godkendelsen. Et fund er et forslag — intet andet.

# SEO-migrationskontrol

19. september 2026. Gælder de problemorienterede sider og den tilhørende
omlægning af interne links og redirects.

## 1. Den eksisterende SEO-/søgemarkedsanalyse — ikke fundet

Opgaven forudsatte, at der findes en SEO-/søgemarkedsanalyse fra få dage
siden, og at den skulle bruges som baseline.

**Den er eftersøgt grundigt og er ikke fundet.** Jeg påstår derfor ikke, at
den er anvendt.

Hvad der er gennemsøgt:

| Sted | Resultat |
| --- | --- |
| Google Drive, fritekst på «SEO», «søgemarked», «søgeord», «keyword» | 0 træf |
| Google Drive, fritekst på «Search Console», «eksponeringer», «søgeintention», «kannibalisering» | kun vejledningen i, hvordan data trækkes |
| Drive-mappen «09 Strategi og godkendte beslutninger» | **tom** |
| Drive-mappen «07 Opportunity radar» | **tom** |
| Drive-mappen «06 Performance» | indeholder kun dokumentet «SÅDAN TRÆKKER DU SEARCH CONSOLE-DATA» — **selve eksporten er aldrig lagt op** |
| Repoet | ingen analysefiler |

Det er værd at bemærke, at implementeringspakkens eget manifest citerer
positionstal — psykoterapeut 5,7 · hypnose 5,7 · hypnose odense 10,1 ·
psykoterapeut odense 13,2 · `/om/` 2,9 · individuelle borgerforløb 148
eksponeringer. **Dataene har altså eksisteret**, men de ligger ikke i nogen
kilde, dette miljø kan nå. De stammer sandsynligvis fra en tidligere samtale.

**Konsekvens for arbejdet:** arkitekturvalgene er truffet på det, der kunne
måles direkte — redirect-kortet, det faktiske indhold, titler og intern
linkning — og ikke på trafikdata. Ét valg nedenfor ville have gavnet af
Search Console-data, og det er markeret.

**Anbefaling:** træk eksporten efter vejledningen i «06 Performance», og læg
den i mappen. Så kan valget efterprøves i stedet for at hvile på argumenter.

## 2. Hvad redirect-kortet afslørede

Sitets historie ligger i `netlify.toml`. To fund afgjorde arkitekturen:

```
/angst   og /angst/    →  301 →  /til-dig/psykoterapi/
/stress  og /stress/   →  301 →  /til-dig/nervesystemet/
```

Der **har altså været selvstændige sider** om angst og stress. Deres optjente
værdi er ledt videre til to sider, der handler om noget andet: en generisk
ydelsesside og en metodeside.

Derudover:

```
/hypnose-stress-odense  →  /til-dig/nervesystemet/
/stress-coaching        →  /til-dig/nervesystemet/
/hypnose-soevnproblemer →  /kurser/sov-bedre/
```

## 3. Arkitekturvalget, og hvorfor det ikke blev tre automatiske nye URL'er

Opgaven advarede mod at oprette tre URL'er, fordi de virker logiske.
Beslutningen er truffet område for område:

| Område | Fandtes der en side i forvejen? | Valg |
| --- | --- | --- |
| **Angst** | Nej. Kun `/kurser/eksamensangst/` (eksamensangst) og en `helps_with`-linje på psykoterapisiden | **Ny side.** Reelt hul, ingen at kannibalisere |
| **Søvn** | Kun `/kurser/sov-bedre/` — et **kursus**, ikke en terapiside. Anden søgeintention | **Ny side**, med tydelig krydslinkning til kurset og en FAQ, der forklarer forskellen |
| **Stress** | Ja. `/til-dig/nervesystemet/` havde titlen «Stressbehandling og nervesystem i Odense» | **Ny side + retitling.** Se nedenfor |

### Stress var den svære

`/til-dig/nervesystemet/` lovede i sin title en ydelse, som siden selv afviser
i brødteksten: *«Det er ikke en selvstændig ydelse.»* En søgende på
«stressbehandling Odense» landede altså på en side, der forklarer, at det, de
søgte, ikke kan bookes.

Derfor:

- `/til-dig/stress/` er oprettet som problemsiden
- `/til-dig/nervesystemet/`s title er ændret fra «Stressbehandling og
  nervesystem i Odense» til «Nervesystemet og ro – kropsligt arbejde i
  Odense», så de to ikke konkurrerer om samme forespørgsel
- URL, brødtekst, FAQ og metoder på nervesystemsiden er **uændrede**
- Siden har fået et nyt afsnit øverst, der sender videre til de tre
  problemsider

**Dette er det ene valg, der ville have gavnet af Search Console-data.** Uden
dem kan jeg ikke se, hvad `/til-dig/nervesystemet/` faktisk henter i dag på
stress-forespørgsler. Argumentet er indholdsbaseret, ikke måltal-baseret.
Ændringen er to linjer i front matter og kan rulles tilbage på et minut.

## 4. Redirects — 7 omdirigeret, 0 tilføjet, 0 fjernet

Antallet står uændret på **64**. Kun mål er ændret:

| Fra | Før | Nu | Begrundelse |
| --- | --- | --- | --- |
| `/angst`, `/angst/` | `/til-dig/psykoterapi/` | `/til-dig/angst/` | Gendanner den oprindelige hensigt. Den historiske side handlede om angst |
| `/stress`, `/stress/` | `/til-dig/nervesystemet/` | `/til-dig/stress/` | Samme |
| `/stress-coaching` | `/til-dig/nervesystemet/` | `/til-dig/stress/` | Stress-forespørgsel → stress-side |
| `/hypnose-stress-odense`, `/hypnose-stress-odense/` | `/til-dig/nervesystemet/` | `/til-dig/stress/` | Samme. Hypnose er omtalt som redskab på begge sider |

En 301 fører den optjente værdi med sig. Ændringen flytter den fra en side,
der ikke svarer på forespørgslen, til en der gør.

`/hypnose-soevnproblemer` → `/kurser/sov-bedre/` er **ikke** rørt. Forespørgslen
peger på et kursus, og kursussiden er et legitimt mål.

## 5. Migrationsrisiko

| Kontrol | Resultat |
| --- | --- |
| URL'er slettet | **0** |
| URL'er omdøbt | **0** |
| URL'er noindexet | **0** |
| Canonicals ændret | **0** — alle sider peger fortsat på sig selv |
| Redirects tilføjet/fjernet | **0** (7 fik nyt mål) |
| Nye URL'er | 3 |
| Sitemap | 41 → **44** |
| Sider med `index, follow` | 41 → **44** |
| `noindex, follow` (taksonomi) | 4, uændret |
| `noindex, nofollow` (`/tak/`, 404) | 2, uændret |
| Brudte interne links | **0** af 1.533 kontrollerede |
| Dublerede titles | **0** af 51 |
| Ugyldig JSON-LD | **0** af 76 blokke |

Ingen eksisterende side er fjernet eller gjort utilgængelig.

## 6. Kannibalisering

| Par | Risiko | Håndtering |
| --- | --- | --- |
| `/til-dig/stress/` ↔ `/til-dig/nervesystemet/` | **Var reel** | Nervesystemsidens title ændret, så de ikke deler forespørgsel |
| `/til-dig/angst/` ↔ `/til-dig/psykoterapi/` | Lav | Forskellige forespørgsler: «angst Odense» mod «psykoterapeut Odense». Krydslinket |
| `/til-dig/soevnproblemer/` ↔ `/kurser/sov-bedre/` | Moderat på «tankemylder» | Forskellig intention — terapi mod kursus. Begge sider siger forskellen eksplicit, og de linker til hinanden |
| `/til-dig/stress/` ↔ `/kurser/stop-stress/` | Lav | Kursus mod individuelt forløb |

## 7. Fund der ikke er rettet

Tre ting, der ligger uden for denne opgave, men bør kendes:

1. **`/tak/` står i sitemap.xml, men er `noindex`.** Modstridende signal.
   Bestod også før.
2. **Tre meta descriptions er over 165 tegn** og bliver klippet i
   søgeresultatet: `/til-dig/naturterapi/` (170), `/til-kommuner/` (178) og
   blogindlægget om viljestyrke (197). Alle er godkendt indhold og er ikke rørt.
3. **`/til-dig/psykoterapi/` indeholder «Jeg møder dig som et helt menneske»** —
   en af de klichéer, der blev fjernet fra `/om/` i den godkendte pakke. Den
   står stadig her. Godkendt indhold, ikke rørt uden besked.

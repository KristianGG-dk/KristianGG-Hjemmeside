# En pålidelig udløser til publiceringen

## Problemet

**Opdateret 1. november 2026:** grænsen er nu 24 timer, ikke 60 minutter. Se
`tidsvinduet.md`. Det mindsker risikoen for, at godkendte opslag bortfalder,
men det fjerner ikke behovet for en pålidelig udløser: Kristian ønsker
fortsat, at opslag forsøges publiceret tæt på deres godkendte tidspunkt.
Afsnittene nedenfor står som de blev målt.

**GitHubs cron kan ikke overholde det.** Den er «best effort»: planlagte
kørsler stilles i kø sammen med alle andres, og køen er lang på de runde
minutter. Målt 27/10–01/11 2026:

| Workflow | Cron siger | Kørte reelt |
| --- | --- | --- |
| `publicer-instagram-planlagt` | hvert kvarter | hver 3.–6. time |
| `genopbyg-planlagt` | 05:05 / 06:05 UTC | 10:23–13:10 UTC |
| `publicer-linkedin-planlagt` | hvert kvarter | ikke på cron siden 01-11 17:12 UTC |

De skæve minutter i cron-udtrykkene gjorde forsinkelsen mindre — de syv
første Instagram-opslag gik ud 45–212 minutter for sent i stedet for endnu
senere. Men de fjernede ikke køen.

Konsekvensen er konkret: **med 60-minutters-grænsen og cron som eneste
udløser vil de fleste opslag blive STOPPET i stedet for publiceret.**
Grænsen er ikke problemet. Udløseren er.

## Løsningen er skrevet — der mangler kun ét trin fra dig

`netlify/functions/udloes-publicering.mjs` er en planlagt Netlify-funktion.
Den kører hvert kvarter, ser i køen, og kalder GitHubs `repository_dispatch`,
**kun når noget faktisk er forfaldent inden for vinduet**. Gør den det,
starter `publicer-instagram-planlagt` eller `publicer-linkedin-planlagt`
med det samme, og et opslag godkendt til kl. 08.00 går ud mellem 08.00 og
08.15 i stedet for "engang på dagen".

Den publicerer intet selv. Alle spærrer ligger i motoren: lås, teksthash,
godkendelse, kø, register, billede og tidsvindue.

**Uden token gør den ingenting.** Mangler `GITHUB_DISPATCH_TOKEN`, skriver den
det i loggen og stopper. Sitet bygger uanset, og funktionen rører ikke
sitets sider.

### Hvorfor den ser i køen først

Et kvarters tidsplan ville ellers starte 192 kørsler i døgnet, og de fleste
ville finde ingenting. Funktionen henter `koe.json` fra det offentlige repo
og kalder kun GitHub, når der er noget at gøre. Kan den ikke hente køen,
kalder den alligevel — den fejler i retning af at publicere, ikke af at tie.

### Hvad det koster

Ingenting. Netlifys gratisplan rummer 125.000 funktionskald om måneden;
hvert kvarter er cirka 2.900. Repoet er offentligt, så GitHub Actions-minutter
er gratis. Der kommer ingen løbende udgift.

## Målt igen 2. november 2026 — og nu ser vagthunden det selv

Udløseren er stadig ikke i drift. Det kan måles udefra:

| Workflow | Cron siger | Kørte reelt 1.–2. november |
| --- | --- | --- |
| `publicer-instagram-planlagt` | hvert kvarter | 01:49, 09:40, 15:44, 21:13, 00:47, 06:53 — hul på 3–8 timer |
| `publicer-linkedin-planlagt` | hvert kvarter | 21:17, 00:55, 07:17 |
| `publicer-google-planlagt` | hvert kvarter | 06:40, 14:10, 19:04, 22:43, 02:14, 09:51 |

**Alle kørsler har `event: schedule`. Ingen har `repository_dispatch`.** Det
er beviset: Netlify-funktionen kalder ikke, og det gør den ikke, fordi
`GITHUB_DISPATCH_TOKEN` ikke er lagt ind.

Hidtil kunne man kun se det ved at læse Netlifys egen log, som ingen læser.
Vagthunden ser nu efter selv: findes der ingen `repository_dispatch`-kørsel
den seneste uge, siger den det med en advarsel og henviser hertil.

Det er en **advarsel**, ikke en fejl. Med døgnvinduet falder ingen opslag
igennem — de går bare ud, når GitHubs cron finder tid, målt 3–10 timer efter
det godkendte tidspunkt. Et opslag godkendt til kl. 08.00 gik ud kl. 11.40.

### Hvorfor der ikke findes en vej uden et token

Spørgsmålet er undersøgt, og svaret er nej:

- `repository_dispatch` og `workflow_dispatch` kræver begge et token. Der er
  ingen uautentificeret vej til at starte et workflow.
- Actions kan ikke starte sig selv igen. GitHub blokerer med vilje, at
  hændelser udløst af det indbyggede `GITHUB_TOKEN` starter nye kørsler —
  ellers kunne et workflow køre i ring.
- Kanalerne kan ikke overtage opgaven. Facebook kan planlægge hos Meta og
  gør det allerede. Instagram, LinkedIn og Google har ingen
  planlægningsfunktion i deres API'er — nogen skal sende på klokkeslættet.
- At lade Netlify publicere selv ville flytte alle adgangstokens fra GitHubs
  miljøbeskyttelse til Netlify. Det ville være en forringelse, ikke en
  løsning.

Ét token i Netlify er altså den mindste mulige afhængighed, ikke en genvej.

## Sådan ses det udefra, at udløseren lever

Indtil 2. november 2026 kunne man ikke se forskel på disse to tilstande:

- udløseren kører, men der var intet forfaldent
- udløseren er død

Begge ser ens ud: ingen `repository_dispatch` i kørselshistorikken. I
november var der intet forfaldent i fjorten dage i træk, så beviset var
værdiløst netop når man havde brug for det.

### Livstegnet

Udløseren sender nu `udloeser-hjerteslag` **én gang i timen**, når den
alligevel ikke har andet at lave. `udloeser-hjerteslag.yml` tager imod og
gør intet andet end at eksistere i historikken: ingen checkout, tomme
`permissions`, ingen adgang til noget.

En manglende kørsel er dermed et entydigt tegn på, at kæden
Netlify → token → GitHub er brudt. Vagthunden advarer efter 4 timer og
melder **FEJL** efter 12.

To ting er værd at bemærke:

- Livstegnet sendes **kun**, når intet er forfaldent. Er der noget at
  publicere, vinder publiceringen, og historikken forbliver entydig.
- Uden token sendes der **intet** — heller ikke livstegn. Det er med vilje:
  et manglende livstegn er netop symptomet på et manglende token.

### Statusendepunktet

```
curl https://kristiangg.dk/.netlify/functions/udloeser-status
```

Svarer med JSON og skiller de tre mulige årsager ad:

| Svar | Betyder |
| --- | --- |
| `token_sat: false` | variablen er ikke nået ud til funktionen — der mangler et deploy |
| `token_genkendt: false`, `github_svarede: 401` | tokenet er ugyldigt eller udløbet |
| `token_genkendt: false`, `github_svarede: 404` | tokenet kan ikke se dette repo — forkert *Resource owner* eller *Repository access* |
| `token_form: "ADVARSEL: omsluttet af anfoerselstegn"` | værdien er gemt med `"` omkring |
| alt grønt, `forfaldne_kanaler: []` | intet er forfaldent — udløseren sender kun livstegn |

**Den afslører intet.** Tokenet læses aldrig ud; der svares kun ja/nej og
med længden i tegn. **Den sender intet** — ingen dispatch, ingen
publicering. Et offentligt endepunkt, der kunne starte workflows, ville
være en åben dør.

## Kræver en ny miljøvariabel et nyt deploy?

**Ja.** Netlify bager miljøvariablerne ind, når et deploy bygges. En
funktion, der allerede er rullet ud, ser ikke en variabel, der er tilføjet
bagefter — uanset at den står rigtigt i brugerfladen.

Derfor: læg tokenet ind, og udløs så et deploy. Det sker af sig selv, når
en PR merges, og kan ellers startes fra
Actions → *Genopbyg site (planlagte indlaeg)* → Run workflow.

Statusendepunktet afgør spørgsmålet empirisk: svarer det `token_sat: false`
efter at tokenet er lagt ind, mangler der et deploy.

## Hvilke rettigheder skal tokenet have?

Dokumentationen er uklar på netop dette punkt, og `docs.github.com` kunne
ikke hentes fra arbejdsmiljøet. Fællesskabets rapporter peger i to
retninger: nogle siger **Contents: Read and write**, andre **Actions: Read
and write**, og flere rapporterer, at den ene alene ikke var nok.

Giv derfor tokenet **begge**. De er begrænset til dette ene repo, og ingen
af dem giver adgang til hemmeligheder.

Virker det ikke, siger udløseren nu selv hvorfor: på 403 og 404 skriver den
præcis hvilke to rettigheder der skal sættes, og det står i Netlifys
funktionslog og i statusendepunktets svar.

## Det ene trin, du selv skal gøre

Funktionen mangler kun et token. Fire skridt, cirka tre minutter.

**1. Opret tokenet.**
Gå til <https://github.com/settings/personal-access-tokens/new>.

* Token name: `netlify-udloeser`
* Resource owner: `KristianGG-dk`
* Expiration: vælg selv — sæt en påmindelse, for et udløbet token stopper
  udløseren uden at noget andet fejler
* Repository access: **Only select repositories** → `KristianGG-Hjemmeside`
* Permissions → Repository permissions → **Actions: Read and write**

Intet andet. Tokenet kan starte workflows og ikke andet. Kopiér det — det
vises kun én gang.

**2. Læg det i Netlify.**
Netlify → dit site → Site configuration → Environment variables → Add a
variable.

* Key: `GITHUB_DISPATCH_TOKEN`
* Value: tokenet fra trin 1
* Scopes: det er nok at vælge **Functions**

Læg det **ikke** i GitHub Secrets. Det hører hjemme hos planlæggeren, ikke
hos den, der bliver kaldt.

**3. Udløs et build.**
Funktionen kommer først med, når sitet er bygget efter dette. Enten venter du
på næste push, eller du trykker Deploys → Trigger deploy → Deploy site.

**4. Se at den kører.**
Netlify → Logs → Functions → `udloes-publicering`. Første kørsel kommer inden
for et kvarter. Står der «Intet forfaldent inden for vinduet», virker den —
der var blot ikke noget at gøre.

### Hvis du hellere vil undgå det

Du behøver ikke. Uden tokenet gælder cron og 24-timersvinduet, og et godkendt
opslag går ud samme dag — bare ikke på klokkeslættet. Funktionen ligger
inaktiv, indtil du giver den tokenet.

## De to andre muligheder

Begge er beskrevet, hvis du foretrækker dem.

**cron-job.org** (gratis). To jobs med metode POST, adressen nedenfor, de to
headere og kroppen. Ulempen er, at tokenet ligger hos en tredjepart.

**En maskine, der kører døgnet rundt.** En almindelig `crontab` med `curl`.
Mest kontrol, men kræver at maskinen er tændt.

## Kaldet, hvis du vil gøre det i hånden



Workflowene kan nu startes udefra med `repository_dispatch`. En planlægger,
der faktisk kører til tiden, kalder GitHub:

```
POST https://api.github.com/repos/KristianGG-dk/KristianGG-Hjemmeside/dispatches
Authorization: Bearer <token>
Accept: application/vnd.github+json
Content-Type: application/json

{"event_type": "publicer-instagram"}
```

De to hændelsesnavne er `publicer-instagram` og `publicer-linkedin`.
En kørsel startet sådan publicerer for alvor, ligesom en planlagt kørsel.

### Tokenet

Et **fine-grained personal access token**, afgrænset til dette ene
repository, med én rettighed:

* Repository permissions → **Actions: Read and write**

Intet andet. Tokenet kan starte workflows og ikke andet. Det skal ikke i
GitHub Secrets — det skal ligge hos planlæggeren.

Oprettes under
<https://github.com/settings/personal-access-tokens/new>.

### Hvilken planlægger

Tre muligheder, billigst først.

**1. cron-job.org** (gratis). Opret to jobs, hvert med metode POST, den
ovenstående adresse, de to headere og kroppen. Mindste interval er 1 minut.
Ulempe: tokenet ligger hos en tredjepart.

**2. En Netlify-funktion** (gratis på den plan, sitet allerede bruger).
Netlify har planlagte funktioner, og de kører pålideligt. Tokenet ligger i
Netlifys miljøvariabler, altså samme sted som resten af sitets
hemmeligheder. Det er den, jeg vil anbefale: ét sted mindre at holde øje med.

**3. En maskine, der kører døgnet rundt.** En almindelig `crontab` med
`curl`. Mest kontrol, men kræver, at maskinen er tændt.

### Hvor ofte

Hvert kvarter er rigeligt, og formålet er ikke længere at nå inden for en
grænse — det er at ramme tæt på det godkendte tidspunkt. Et kvarters
opløsning betyder, at et opslag godkendt til kl. 08.00 går ud mellem 08.00 og
08.15. Oftere koster kørsler uden at gøre noget godt: udvælgelsen springer alt
over, hvis tidspunktet ikke er nået.

## Indtil da

Cron-linjerne står stadig i workflowene og er ikke fjernet. De virker som
før — upålideligt. Så længe de er den eneste udløser, må du regne med, at
opslag bliver stoppet, og at vagthunden melder det.

Grænsen står ét sted: `MAKS_FORSINKELSE_S` i
`publicering/scripts/krav.mjs`. Den er nu 24 timer, og med den er risikoen
for bortfald lille selv på cron alene. Men et opslag, der er godkendt til
torsdag kl. 08, går så ud engang torsdag — ikke torsdag kl. 08. Det er
forskellen, en pålidelig udløser køber.

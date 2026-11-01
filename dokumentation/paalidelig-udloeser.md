# En pålidelig udløser til publiceringen

## Problemet

Kristian har besluttet, at LinkedIn og Instagram højst må publicere 60
minutter efter det godkendte tidspunkt (issue #90, krav 2). Ellers standses
opslaget og markeres til manuel vurdering.

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

## Løsningen

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

Hvert kvarter er rigeligt. Grænsen er 60 minutter, og et kvarters
opløsning giver fire chancer inden for den. Oftere koster kørsler uden at
gøre noget godt: udvælgelsen springer alt over, hvis tidspunktet ikke er
nået.

## Indtil da

Cron-linjerne står stadig i workflowene og er ikke fjernet. De virker som
før — upålideligt. Så længe de er den eneste udløser, må du regne med, at
opslag bliver stoppet, og at vagthunden melder det.

Hvis du hellere vil have sene opslag end stoppede opslag, er det grænsen,
der skal flyttes, ikke udløseren. Grænsen står ét sted:
`MAKS_FORSINKELSE_S` i `publicering/scripts/krav.mjs`.

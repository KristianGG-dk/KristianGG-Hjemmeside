# Tidsvinduet: hvornår må motoren publicere?

Kristians beslutning 1. november 2026. Den erstatter den tidligere grænse på
60 minutter (krav 2 i issue #90).

## Reglen

* Et opslag må **tidligst** publiceres på det godkendte tidspunkt.
* Det publiceres ved **første gyldige kørsel** derefter. Motoren venter ikke
  med vilje — vinduet er en grænse, ikke en udsættelse.
* **Præcis 24 timer** efter det godkendte tidspunkt er sidste tilladte
  tidspunkt. Grænsen er inklusiv: på sekundet er tilladt, et sekund senere er
  ikke.
* Derefter stoppes automatisk publicering, og opslaget registreres som
  `STOPPET FOR SENT` til manuel vurdering. Vagthunden melder det som FEJL,
  indtil du har taget stilling.

### Sådan lukker du en sag

Et stoppet opslag bliver meldt, hver gang vagthunden kører — to gange om
dagen — indtil der står et valg i registret. Tre veje, og den sidste række
for elementet afgør:

| Du vil | Status i `publicering/register.json` |
| --- | --- |
| Publicere det i hånden alligevel | `PUBLICERET` med `post_id` |
| Lade det falde | `OPGIVET` og en kort grund i `noter` |
| Give det en ny dato | Ny godkendelse og ny låsefil — det er Claudes og din sag, ikke motorens |

`OPGIVET` er en afsluttende status: vagthunden noterer den og tier.

Dette sker nu automatisk for forældede, aldrig publicerede opslag: se
«Automatisk afslutning» i `vagthunden.md`.

Element 33 og 34 var netop sådan et tilfælde. De forfaldt 15. og 16. oktober,
mens planlægningen stadig var manuel, og de kan ikke publiceres nu. Motoren
registrerede dem som stoppet, da den kørte 1. november, og de bliver meldt,
indtil du lukker dem.

Reglen står **ét sted**: `MAKS_FORSINKELSE_S` i
`publicering/scripts/krav.mjs`. Google havde tidligere sin egen kopi på 24
timer, og to steder med samme regel bliver uenige med tiden.

### Hvorfor et døgn

Målt 27/10–1/11 2026 kørte `publicer-instagram-planlagt` reelt hver 3.–6.
time, ikke hvert kvarter som cron siger. Med en times grænse ville de *fleste*
godkendte opslag blive stoppet frem for publiceret. Grænsen var ikke
problemet; udløseren er. Se `paalidelig-udloeser.md`.

## Dansk sommer- og vintertid

Alle tidspunkter i låsefilerne bærer deres eget danske offset — `+01:00` om
vinteren, `+02:00` om sommeren — og gaten kontrollerer, at offsettet er
Danmarks på netop den dato. Derfor regner motoren udelukkende på absolutte
øjeblikke og behøver ikke kende et tidszonenavn.

Én konsekvens er værd at forstå. Natten til den 25. oktober 2026 har 25 timer
i dansk vægtid. Et element dateret lørdag kl. 19 er derfor **for sent**
søndag kl. 19: der er gået 25 timer, ikke 24. Det er med vilje. Grænsen er et
døgn, ikke "samme klokkeslæt i morgen".

## Kanalerne

| Kanal | Hvordan vinduet bruges |
| --- | --- |
| **LinkedIn** | Motoren publicerer selv. Første kørsel inden for døgnet sender opslaget, med det godkendte billede. Derefter stoppet |
| **Instagram** | Som LinkedIn. Meta kan ikke holde et Instagram-opslag for os, og en mediecontainer udløber efter 24 timer |
| **Google** | Som LinkedIn, når integrationen er klar. Business Profile API'et kan ikke holde et opslag til senere |
| **Facebook** | **Særskilt.** Se nedenfor |

### Facebook

Facebook er den ene kanal, hvor motoren afleverer opslaget til Meta **frem i
tiden** med `scheduled_publish_time`. Grænsen må derfor ikke afvise et
element, fordi det planlægges flere dage før sin dato: et fremtidigt opslag er
hverken forsinket eller for sent.

Reglen gælder fra det godkendte tidspunkt og fremefter:

| Hvor datoen ligger | Hvad der sker |
| --- | --- |
| Fremtiden, 10 min – 30 dage ude | Afleveres til Meta, som holder det til dagen |
| Fremtiden, over 30 dage ude | Venter. Metas vindue nås ved en senere kørsel |
| Fremtiden, under 10 min ude | Venter. Under Metas minimum; gribes når tidspunktet er nået |
| Passeret, inden for vinduet | **Indhentes:** publiceres med det samme |
| Passeret, uden for vinduet | Stoppes til manuel vurdering |

Indhentningen bruger den eksisterende, godkendte vej i
`publicer-facebook.mjs`, som sender opslaget uden `scheduled_publish_time`.
Den efterregner lås, teksthash og godkendelse igen, før den sender noget — og
ingen kontrol lempes for at indhente.

Indhentningen er svaret på det, der kostede element 33, 34, 35 og 36:
workflowet var manuelt, datoen passerede, og Metas vindue lukkede sig bag
dem. De faldt på gulvet uden at nogen kunne gribe dem.

**Et opslag, der allerede ligger hos Meta, oprettes aldrig igen.** Status
`PLANLAGT` i registret spærrer elementet, også før datoen.

## Tidsfølsomt indhold: en kortere frist end døgnet

Et arrangement, en tilmeldingsfrist eller en kampagnedag tåler ikke at gå ud
et døgn for sent, selv om de fleste opslag gør. To frivillige felter giver
elementet en kortere gyldighed:

```json
"gyldig_timer": 3
"udloeber": "2026-11-05T12:00:00+01:00"
```

* `gyldig_timer` — så mange timer efter det godkendte tidspunkt.
* `udloeber` — et absolut klokkeslæt. Skal bære dansk offset.
* Begge må bruges sammen. **Den korteste frist vinder.**
* Mangler de, gælder døgnet.

Gaten kontrollerer, at de er velformede: `gyldig_timer` skal være et positivt
tal, `udloeber` skal være læselig, bære tidszone og ligge efter det godkendte
tidspunkt. En ulæselig dato ville ellers blive læst som "intet udløb" og give
elementet hele døgnet.

### De indgår ikke i versionslåsen

Med vilje. Lå de i låsen, ville det at sætte dem bortkaste godkendelsen —
samme problem som ved `billede_url`, hvor en ren størrelsesrettelse (PR #89)
ellers havde kostet alle femten godkendelser.

**Felterne er ikke sat på noget eksisterende element.** Skal et godkendt
opslag have et af dem, aftales det med Kristian og Claude først. Motoren
sætter dem ikke selv, og den ændrer ikke en godkendt tekst eller låsefil.

## Hvad der kontrolleres, før der publiceres forsinket

Et døgns vindue er ikke en ubetinget tilladelse. Før hvert enkelt opslag
sendes, kontrolleres det igen:

* Låsefilen findes stadig i `publicering/laase/`. Et tilbagekaldt element er
  flyttet til `publicering/laase-tilbagekaldt/`, og intet i motoren læser den
  mappe.
* Versionslåsen kan efterregnes af de låste felter.
* Teksten svarer til `tekst_sha256`, og `brodtekst_sha256` er teksthashen.
* `godkendt_af` og `godkendt_dato` findes.
* Køen siger `metode: motor` — ellers er elementet sat på pause.
* Køens tidspunkt er låsens dato.
* Billedet findes på sin adresse og er det låste motiv.
* Registret siger ikke, at elementet er afsendt, undervejs, fejlet eller
  stoppet.
* Eventuel egen frist er ikke udløbet.

Fejler én af dem, publiceres der ikke. Ingen af dem lempes, fordi opslaget er
forsinket.

## Vagthunden

Nådetiden, før vagthunden melder en svigtet kørsel, **følger** vinduet. Den
var en time, mens grænsen var en time. Var den ikke fulgt med, ville
vagthunden melde FEJL på et element, motoren stadig agter at publicere helt
lovligt. Den skal råbe op, når noget er galt — ikke når motoren arbejder som
aftalt.

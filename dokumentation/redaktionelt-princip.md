# Redaktionelt princip

Fastlagt af Kristian G. G. Dansted 19. september 2026. Gælder alt indhold i
motoren: hjemmeside, blog, Facebook, Instagram, LinkedIn, Google Business
Profile og senere kanaler.

## Princippet

Indhold skrives ud fra det, Kristian **laver, tilbyder og fagligt arbejder
med** — ikke ud fra det, han ikke laver.

Hovedvægten ligger på:

- hvad han arbejder med, og hvordan
- hvem tilbuddet kan være relevant for
- hans faglige tilgang
- psykoterapi, psykoterapi i naturen, naturterapi
- gruppe- og virksomhedsforløb

## Afgrænsninger

Faglige, etiske og juridisk nødvendige afgrænsninger skal med, når de er
relevante. De skal være **proportionale** og understøtte korrekt information.

De må ikke blive hovedbudskabet, overskriften eller den gennemgående
fortælling — medmindre emnet konkret kræver det.

Konkret betyder det:

| | |
| --- | --- |
| **Titlen** | må ikke handle om et fravalg. Det er titlen, folk møder i et søgeresultat. En side om søvn skal hedde noget om søvn, ikke noget om det, han ikke tilbyder. |
| **Indgangen** | de første to afsnit skal handle om emnet, ikke om en begrænsning. På Instagram og Facebook er de ofte det eneste, der vises uden at folde ud. |
| **Andelen** | en afgrænsning fylder et afsnit, ikke en tredjedel af teksten. |
| **Pakken** | højst hvert fjerde element må være flaget. Et enkelt opslag må gerne handle om en afgrænsning — flere på stribe gør fravalget til fortællingen. |

## Hvorfor det ikke er en lempelse af compliance

Compliance er en sikkerhedsramme. Den skal forhindre ulovlige, vildledende
eller udokumenterede udsagn.

Den skal **ikke** gøre kommunikationen unødigt defensiv eller systematisk
sende relevante potentielle klienter videre til andre tilbud.

Lov om markedsføring af sundhedsydelser § 2 kræver, at markedsføring er
saglig, og at urigtige, vildledende eller urimeligt mangelfulde angivelser
ikke bruges. Den kræver ikke, at man skriver om det, man ikke laver — den
kræver, at det, man skriver, er rigtigt og ikke mangler noget væsentligt.

To eksempler på forskellen:

- **Skal med.** En side om søvnproblemer, der ikke nævner CBT-I ved kronisk
  insomni, mangler noget væsentligt for læseren. Oplysningen bliver.
- **Skal ikke fylde.** At samme side hedder *"Det, jeg ikke tilbyder mod
  søvnløshed"* og bruger sine første to afsnit på det, er ikke et lovkrav.
  Det er en redaktionel vane.

## Kontrollen

`publicering/scripts/redaktionel-balance.mjs` måler det, før materialet går
til godkendelse.

```
node publicering/scripts/redaktionel-balance.mjs publicering/laase <pakkemappe>
```

Den læser låsefiler, pakkefiler og markdown, og flager på titel, overskrifter,
indgang og andel. Den **dømmer ikke** — et flag betyder "se på den her".

Kontrollen er bevidst **ikke** en del af CI-gaten. Gaten passer på, at en
godkendt tekst ikke bliver ændret bagefter. Denne passer på, at teksten er den
rigtige at få godkendt. En stilkontrol, der kan stoppe en merge, vil før eller
siden blokere noget, Kristian har sagt god for.

## Fast del af produktionen

Kontrollen køres, **før** en godkendelsespakke sendes til Kristian. Resultatet
skal stå i pakken, så han kan se fordelingen frem for at opdage den ved at
læse igennem.

Er et element flaget, er der to udveje: skriv det om, eller skriv i pakken,
hvorfor afgrænsningen er det rigtige ærinde for netop det element.

## Baggrund

Godkendelsespakken for uge 39–42 indeholdt tolv elementer. Fem af dem pegede
væk fra Kristian, og to af dem med den samme henvisning. Det var ikke et
lovkrav, og det var ikke et valg — det var en vane, der havde sat sig.

Kristian spurgte: *"hvorfor lave noget der viser væk fra mig"*. Det spørgsmål
er anledningen til denne side.

## Funktionsdeling mellem kanaler

Fastlagt af Kristian samme dag. Elementer om samme emne må gerne bygge på den
samme faglige position, men de skal have hver sin funktion:

| | Funktion |
| --- | --- |
| **SoMe** | skaber interesse |
| **Blog** | folder emnet ud |
| **Landingsside** | forklarer arbejdet og giver en naturlig vej til kontakt |

Gør de det samme, bliver tre tekster til den samme tekst tre steder — og
Google ser tre sider, der konkurrerer om den samme søgning.

`publicering/scripts/tekstgentagelse.mjs` måler det som fælles ordsekvenser:

```
node publicering/scripts/tekstgentagelse.mjs <fil> <fil> [<fil> ...]
```

Den viser de fælles passager frem for at give en karakter, så man selv kan
afgøre, om gentagelsen bærer noget. Adresselinjer og enkelte fagudtryk må
gerne gå igen.

Ved første måling af søvnmaterialet delte blogindlægget og landingssiden en
passage på 60 ord ordret plus hele CBT-I-afsnittet — 125 fælles sekvenser.
Efter omskrivningen: 2.

## FAQ → blog → SoMe

Fastlagt af Kristian 19-09-2026.

### Strukturen

```
spørgsmål → kort, brugbart FAQ-svar → frivillig uddybning i bloggen
          → bloggen danner grundlag for flere forskellige SoMe-vinkler
```

**FAQ'en skal altid give et selvstændigt, kort og overordnet svar.** Den
besøgende skal kunne få sit grundlæggende svar direkte i FAQ'en og må aldrig
være tvunget til at åbne et blogindlæg for at få det.

Findes der et relevant blogindlæg, tilføjes et naturligt link efter svaret:
*«Læs mere: …»*. Blogindlægget er en **frivillig uddybning**, aldrig stedet
hvor svaret ligger.

### De to fejl, der trækker hver sin vej

| | |
| --- | --- |
| **Tilbageholdt** | Svaret er for tyndt til at stå selv, så læseren tvinges til at klikke. En FAQ er ikke en teaser. |
| **Gentaget** | Svaret er så fyldestgørende, at blogindlægget siger det samme igen. Så konkurrerer de to om samme søgning, og læseren får intet nyt ved at klikke. |

### Hvad hver flade må

| Flade | Opgave |
| --- | --- |
| **FAQ** | Det grundlæggende svar. Kort, brugbart, færdigt. |
| **Blog** | Går videre: nuancer, eksempler, faglig forståelse, hvordan Kristian arbejder med problemstillingen, relevante forskelle og sammenhænge. |
| **SoMe** | Henter *forskellige vinkler* fra emnet. Ikke en kopi af FAQ'en og ikke et forkortet blogindlæg. |

Ét blogindlæg kan bære flere SoMe-opslag, netop fordi hvert opslag tager sin
egen vinkel.

### FAQ-banken er den redaktionelle pipeline

FAQ-samlingen er samtidig emnebank. Et FAQ-emne, der viser sig at have mere i
sig, bliver til et blogindlæg; de to kobles med intern linking; og indlægget
danner derefter grundlag for flere SoMe-opslag.

Feltet hedder `laes_mere` i FAQ-posten og tager blogindlæggets slut-URL.
`layouts/partials/faq-accordion.html` viser først linket, når indlægget rent
faktisk er bygget — så stien kan skrives ind, så snart indlægget er skrevet,
uden at nogen møder et dødt link.

### Kontrollen

```
node publicering/scripts/faq-kobling.mjs
```

Den gennemgår hver FAQ med et `laes_mere` og flager begge fejl: et svar under
120 tegn står sjældent selv, et over 700 tegn efterlader bloggen uden noget at
sige, og for mange fælles ordsekvenser mellem svar og indlæg betyder, at
indlægget gentager svaret.

Første kørsel 19-09-2026 fandt to:

- `/til-dig/psykoterapi/` — *«Kan vi mødes udenfor i stedet?»* var 68 tegn og
  sluttede med «Læs mere om naturterapi». En ren teaser.
- `/til-dig/naturterapi/` — *«Er naturterapi det samme som en samtale i
  klinikken?»* var 449 tegn og delte 35 ordsekvenser med indlægget. Bloggen
  gentog svaret.

Begge er rettet.

### Det permanente princip gælder fortsat

Indholdet tager primært udgangspunkt i, hvad Kristian arbejder med, hvordan
han arbejder, og de spørgsmål mennesker faktisk stiller ham — ikke i, hvad han
ikke tilbyder.

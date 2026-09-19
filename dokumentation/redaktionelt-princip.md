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

# Compliancekontrol — problemorienterede sider

Kontrolleret 19. september 2026 i forbindelse med `/til-dig/stress/`,
`/til-dig/angst/` og `/til-dig/soevnproblemer/`.

Samme forbehold som i evidensregisteret: `stps.dk` og `retsinformation.dk`
kunne ikke åbnes direkte fra udviklingsmiljøet (`EGRESS_BLOCKED`). Reglerne
er læst gennem søgeresultaternes referater. **En person bør bekræfte
lovhenvisningerne ved kilden før publicering.**

## Regelgrundlag der er kontrolleret

| Regelområde | Kilde | Hvad den siger |
| --- | --- | --- |
| Markedsføring af sundhedsydelser | Lov om markedsføring af sundhedsydelser § 2 | Markedsføring skal være **saglig**. Urigtige, vildledende eller **urimeligt mangelfulde** angivelser må ikke bruges |
| Hvem er omfattet | Samme lov | Gælder sundhedsydelser udført af **både autoriserede og ikke-autoriserede** — altså også registrerede psykoterapeuter |
| Tilsyn | Styrelsen for Patientsikkerhed | Fører tilsyn med markedsføring af sundhedsydelser. Tilsynet gælder markedsføringen, ikke den enkelte ikke-autoriserede behandlers faglighed |
| Levende billeder | Samme regelsæt | Må ikke bruges i markedsføring af sundhedsydelser undtagen på egen hjemmeside. **Ikke relevant — der er ingen video på sitet** |

Kilder: [eLov § 2](https://www.elov.dk/lov-om-markedsfoering-af-sundhedsydelser/paragraf/2/) ·
[Lov om markedsføring af sundhedsydelser](https://www.retsinformation.dk/eli/lta/2003/326) ·
[STPS: Saglighed i markedsføringen](https://stps.dk/sundhedsfaglig/tilsyn/tilsyn-med-markedsfoering-af-sundhedsydelser/saglighed-i-markedsfoeringen)

## Konkrete valg reglerne har afgjort

### Ingen løfter om effekt, varighed eller antal sessioner

| Formulering der IKKE er brugt | Hvad der står i stedet |
| --- | --- |
| «hjælper mod stress» | «Sådan arbejder jeg med det» |
| «du får det bedre» | «Om det hjælper dig, kan jeg ikke sige på forhånd» |
| et antal sessioner | «Hvor mange gange man kommer, er meget forskelligt» — Kristians egen godkendte formulering, genbrugt ordret på alle tre sider |
| «effektiv behandling» | «Psykoterapi er samtaler med et formål» |
| «regulerer dit nervesystem» som virkning | «Det er øvelser, man træner, ikke en behandling man modtager» |

### Den skarpe adskillelse §11 kræver

Alle tre sider skelner eksplicit mellem tre ting:

**A — dokumenteret viden.** Fx at CBT-I er førstevalg ved kronisk insomni.
Står med kilde og er ikke Kristians eget arbejde.

**B — Kristians arbejdsform.** Fx at han trækker på kognitiv adfærdsterapi.
`/til-dig/angst/` siger ligeud: *«Det er ikke det samme som et manualiseret
KAT-forløb i psykiatrien, og det skal du vide, når du sammenligner.»*

**C — individuelle muligheder.** Fx at nogle har lettere ved at begynde med
kroppen. Står som erfaring, aldrig som dokumenteret effekt.

### Titlen er ikke beskyttet — det står der

Alle tre sider fører til eller gentager, at psykoterapeut ikke er en beskyttet
titel, at FaDP-registreringen ikke er en offentlig autorisation, og at Kristian
hverken er psykolog eller læge. Det følger af sagligheds­kravet: at undlade det
ville være en urimeligt mangelfuld angivelse.

### Henvisning væk fra egen ydelse

Tre steder henviser siderne aktivt væk:

- **Stress:** fysiske symptomer hører til hos lægen først
- **Angst:** ved egentlige angstlidelser kan lægen udrede og henvise
- **Søvn:** *«Har du haft søvnbesvær i månedsvis, findes der en behandling, som
  er bedre dokumenteret end det, jeg laver»* — CBT-I, som Kristian ikke tilbyder

Det sidste er det tydeligste udslag af sagligheds­kravet i hele pakken: den
bedst dokumenterede behandling nævnes først, selvom den fører kunden væk.

### Ingen diagnosticering af læseren

Siderne beskriver, hvad folk **fortæller**, ikke hvad læseren fejler.
`helps_with`-listerne er formuleret som beskrivelser («Kan ikke falde ned om
aftenen»), ikke som symptomkriterier. Ingen selvtest, ingen scorer, ingen
«har du 5 af disse 8 tegn».

### Normale reaktioner patologiseres ikke

`/til-dig/stress/` siger direkte: *«Det er en helt almindelig reaktion, og den
er ikke et tegn på, at du er skrøbelig.»*
`/til-dig/angst/` siger: *«Det er ubehageligt, og det er ikke farligt i sig
selv.»*

## GDPR, cookies og tracking

| Kontrol | Resultat |
| --- | --- |
| Nye cookies | ingen |
| Ny tracking, pixels, analytics | ingen |
| Nye tredjepartsressourcer på besøgende sider | **0** — målt på det byggede HTML, ikke kun på skabelonerne |
| Eksterne kilde-links | 5 nye, alle almindelige `<a href>` til myndigheder og tidsskrifter, uden trackingparametre |
| Skrifttyper | serveres fra kristiangg.dk, ingen googleapis eller gstatic |
| Formularer | uændrede — ingen nye felter, ingen ny databehandling |

`identity.netlify.com` og `unpkg.com` indlæses fortsat på `/admin/`. Det er
CMS-siden, den er `Disallow`'et i `robots.txt`, og den er ikke rørt her.

## Samarbejdspartnere

Sektionen på `/om/` bruger betegnelsen **«Samarbejdspartnere»**, ikke «Faglige
samarbejdspartnere», jf. opgavens krav. Beskrivelsen lyder *«Jeg samarbejder
med foreningen om familier under belastning»* — den siger intet om godkendelse,
certificering eller dokumenteret effekt, og kan ikke læses sådan.

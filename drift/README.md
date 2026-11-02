# Én samlet arbejdsgang

Claude, Codex, publiceringsmotoren og vagthunden arbejdede hver for sig. Det
gav tre skader, som alle kan ses i historikken:

1. **Dobbeltarbejde.** Den samme mangel blev beskrevet som en ny opgave hver
   gang nogen kiggede, fordi ingen kunne se, at den allerede var lukket.
2. **Gentagne spørgsmål.** Kristian blev bedt om at godkende noget, han
   havde godkendt en uge før, fordi beslutningen kun stod i en samtale.
3. **Forældede krav.** En opgaveliste sagde «gennemfør OAuth» længe efter, at
   OAuth var gennemført og verificeret. Og «kør LinkedIn-billedprøven», som
   bestod 1. november kl. 21.49.

Denne mappe er svaret. Den indfører **ikke** et nyt register oven på de
eksisterende — den binder dem sammen.

## Hvem ejer hvilken sandhed

Hver type oplysning har præcis ét sted, den afgøres. De øvrige afleder.

| Oplysning | Autoritativ kilde |
| --- | --- |
| Hvad der **skal** ske | `publicering/koe.json` |
| Hvad der **er** sket | `publicering/register.json` (append-only) |
| Hvad der er **godkendt**, og låsen på det | `publicering/laase/*.json` |
| **Hvem** godkendte hvad hvornår | `publicering/pakker/*.md` |
| Tilbagekaldte godkendelser | `publicering/laase-tilbagekaldt/` |
| Om maskineriet **kører** | GitHub Actions |
| Hvad der faktisk er **i luften** | `/byg.json` + `tests/produktion.mjs` |
| Hvad Kristian har **besluttet** | `drift/beslutninger.json` |
| Hvem **skylder** hvad | `drift/opgaver.json` |

`drift/opgaver.json` er en **afledning**. Den må aldrig modsige en kilde, og
den erstatter ingen af dem. Derfor er synkroniseringen idempotent.

## Arbejdsdelingen

**Claude — indhold og planlægning.** Indholdsproduktion, redaktionel
kvalitet, SEO-indhold, godkendelsespakker, planlægning af kommende opslag,
forslag til forbedringer. Claude ændrer ikke teknisk kode, hemmeligheder,
workflows eller produktionsautomatisering.

**Codex — teknik og implementering.** Kodeændringer, fejlrettelser, GitHub
Actions, Netlify, integrationer, publiceringsmotor, tests,
produktionskontroller, sikkerhed, versionslåse og revisionsspor. Codex
implementerer og tester — beskriver ikke blot.

**Publiceringsmotoren — udførelse.** Udgiver godkendt indhold på godkendte
tidspunkter, respekterer versionslåse og kanalregler, undgår
dobbeltpublicering, registrerer de faktiske platformssvar og skelner mellem
planlagt, afleveret, publiceret, fejlet og ukendt.

**Vagthunden — kvalitetskontrol.** Sammenholder faktisk drift med registreret
status, opdager fejl og forsinkelser, finder modstridende oplysninger og
**afleverer** sine fund til opgaveregisteret. Den er ikke endnu en
projektleder: den opretter opgaver til Codex og Claude, og sender kun rigtige
beslutninger videre til Kristian.

## Opgaveregisteret

`drift/opgaver.json`. Hver opgave har id, titel, ansvarlig, prioritet,
eventuel frist, status, dokumenteret kilde, næste handling, afhængigheder og
— når den lukkes — et bevis.

Statusserne, og hvorfor der er seks:

| Status | Betyder |
| --- | --- |
| `aaben` | nogen skal gøre noget, ingen er gået i gang |
| `igang` | der arbejdes |
| `afventer-kristian` | kræver en beslutning, en adgang eller penge |
| `afventer-haendelse` | venter på en dato eller en ekstern hændelse |
| `loest` | gjort, men endnu ikke verificeret i drift |
| `lukket` | gjort **og** verificeret; bærer bevis |

`afventer-haendelse` er den vigtigste. Uden den bliver alt, der venter på en
planlagt dato, enten meldt som en fejl eller glemt. Et opslag, der skal ud
4. november, er hverken i orden eller i stykker — det venter.

### Tre regler, der gør registeret til at stole på

1. **Samme forhold = samme id.** Id'et udledes af forholdet, ikke af
   ordlyden. «Instagram kørte sidst for 9 timer siden» og «… for 14 timer
   siden» er den samme opgave.
2. **En lukket opgave genåbnes aldrig af en synkronisering.** Skal den
   genåbnes, sker det udtrykkeligt med `genaabn()`, og grunden bliver
   stående i historikken sammen med den tidligere lukning.
3. **Et menneskes felter overskrives ikke maskinelt.** Ansvarlig, prioritet
   og frist er dine; status og næste handling må maskinen rette.

Historikken slettes aldrig.

## Spærren mod at spørge Kristian to gange

Før noget må lægges hos Kristian, kontrollerer `maaSpoergeKristian()` seks
ting, i den rækkefølge de billigst afviser:

1. Findes beslutningen allerede i `drift/beslutninger.json`?
2. Er en PR, der dækker forholdet, allerede merget?
3. Er opgaven allerede implementeret?
4. Findes der en nyere, grøn produktionskontrol?
5. Er det overhovedet en beslutning — eller blot en manglende verificering?
6. Er arten noget, Kristian skal afgøre?

Falder én af dem ud, omplaceres opgaven til Codex, og grunden skrives i
næste handling. **Manglende teknisk dokumentation er Codex' opgave.
Manglende indhold er Claudes.** Kristian involveres kun, når der faktisk
kræves en beslutning, en godkendelse, en adgang eller penge.

## Overdragelsen

Der findes ingen direkte maskinel kanal mellem Claude og Codex. Overdragelsen
sker derfor gennem repoet, og den er først gennemført, når modtagelsen kan
efterprøves:

```
Vagthunden finder et forhold
  → synkroniser-drift.mjs giver det et fast id og en ansvarlig
  → opgaven står i drift/opgaver.json med kilde og næste handling
  → den ansvarlige arbejder, og PR'en nævner opgavens id
  → Kristian merger
  → produktionskontrollen verificerer
  → vagthunden melder forholdet i orden
  → synkroniseringen lukker opgaven med vagthundens egen formulering som bevis
  → status.mjs viser den under FUNGERER i næste overblik
```

En opgave er **ikke** overdraget, fordi nogen har skrevet det. Den er
overdraget, når den står i registeret med et id, en ansvarlig og en kilde —
og kvitteringen er, at den ansvarliges næste arbejde refererer det id.

## Claudes forbindelse — og dens grænse

**Grænsen, sagt lige ud:** jeg kan ikke verificere Claudes adgang fra mit
eget miljø. Jeg ved ikke, om Claude har GitHub-connectoren slået til. Derfor
er forbindelsen bygget, så den virker i begge tilfælde — og så det kan
*efterprøves*, hvilket af dem der gælder.

### At læse: virker uden nogen adgang

Repoet er offentligt. `drift/TIL-CLAUDE.md` skrives af synkroniseringen og
kan hentes af enhver:

```
https://raw.githubusercontent.com/KristianGG-dk/KristianGG-Hjemmeside/main/drift/TIL-CLAUDE.md
```

Den indeholder præcis det, Claude skal bruge: de opgaver, Claude ejer, de
beslutninger der allerede er truffet (så de ikke bliver spurgt om igen), hvad
der arbejdes på andre steder, og hvordan man afleverer. Intet andet.

### At aflevere: gennem issues, med kvittering

Et issue med en af tre etiketter bliver til en opgave i det fælles register:

| Etiket | Bruges til | Lander hos |
| --- | --- | --- |
| `til-codex` | en teknisk fejl eller mangel | Codex |
| `til-claude` | en indholdsopgave | Claude |
| `til-kristian` | en rigtig beslutning | Kristian |

Issues **uden** en af dem røres ikke. Det eksisterende #90 og alt andet står
urørt, indtil nogen bevidst sætter en etiket på.

En overskrift **Næste handling** i issuets tekst bliver opgavens næste
handling.

**Kvitteringen er beviset.** Når issuet er optaget i registeret, skriver
synkroniseringen en kommentar på det med opgavens id. Først dér er
overdragelsen gennemført. Står der ingen kvittering, er opgaven ikke
modtaget — uanset hvad nogen har skrevet. Kvitteringen skrives kun én gang;
genkørsler fylder ikke issuet med gentagelser.

Et **lukket issue lukker ikke opgaven.** Det sætter den til `loest`:
nogen mener sig færdig. Opgaven lukkes først, når driften er verificeret.

### Hvis Claude ikke kan oprette issues

Så skal Kristian gøre det — ét klik, med etiketten på. Det er den eneste
handling, der ikke kan automatiseres herfra, og den er dokumenteret som
sådan frem for skjult.

## Kommandoerne

```bash
# Hvad siger driften lige nu?
node publicering/scripts/vagthund.mjs --json > /tmp/vagt.json

# Ret registeret til, så det siger det samme som systemet
node publicering/scripts/synkroniser-drift.mjs --vagthund /tmp/vagt.json          # tørløb
node publicering/scripts/synkroniser-drift.mjs --vagthund /tmp/vagt.json --skriv

# Ét samlet overblik
node publicering/scripts/status.mjs --vagthund /tmp/vagt.json
node publicering/scripts/status.mjs --markdown
```

Synkroniseringen kan køres igen og igen. Anden gang sker der ingenting.

## Hvad der ikke må ske

Disse er ufravigelige og håndhæves af gaten, ikke af god vilje:

- Ingen ændring af godkendte opslagstekster eller publiceringstidspunkter
  uden ny godkendelse. Versionslåsen fanger det.
- Ingen automatisk publicering af ikke-godkendt indhold.
- Ingen dobbeltpublicering.
- Ingen aktivering af Google Ads eller annonceforbrug uden godkendelse.
- Ingen sletning af historik eller revisionsspor.
- Ingen eksponering af tokens eller personoplysninger.
  `hemmelighedsscan.mjs` standser det.
- Ingen merge uden Kristians godkendelse.

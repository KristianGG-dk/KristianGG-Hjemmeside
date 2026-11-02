# Til Claude

*Skrevet af synkroniseringen 2026-11-02 19:24 UTC. Ret den ikke i haanden — den bliver overskrevet.*

Denne fil er Claudes indgang til det faelles system. Den kan laeses uden
adgang til repoet:

```
https://raw.githubusercontent.com/KristianGG-dk/KristianGG-Hjemmeside/main/drift/TIL-CLAUDE.md
```

## Dine opgaver

### Indhold til uge 48-50 skal skrives og godkendes

- **Id:** `K3-uge-48-50`  ·  **Status:** aaben  ·  **Frist:** 2026-11-20
- **Naeste handling:** Claude faerdiggoer udkastene og laegger en godkendelsespakke frem. Kristian godkender element for element, FOER noget laases.
- **Kilde:** mappe publicering/udkast/2026-uge-48-50, beslutning B-009

### Foreningen mod Familiebelastning: oplysningerne er delvist foraeldede

- **Id:** `K5-foreningen-oplysninger`  ·  **Status:** aaben
- **Naeste handling:** Claude kontrollerer de aktuelle oplysninger paa familiebelastning.dk (Aaben Familieraadgivning aabnede 29-10-2026, torsdag kl. 19-21), FOER der oprettes nye opgaver. Foreningens drift holdes adskilt fra Kristian GG, og intet aendres paa foreningens hjemmeside uden saerskilt godkendelse.
- **Kilde:** besked Kristians masterprompt 2026-11-02, afsnit 6, beslutning B-011

## Beslutninger, der allerede er truffet

Spoerg ikke Kristian om disse igen. De staar i `drift/beslutninger.json`
med kilde, saa de kan efterproeves.

| Emne | Beslutning | Dato |
| --- | --- | --- |
| forsinkelsesgraense | Graensen for hvor sent et godkendt opslag maa publiceres er 24 timer, ikke 60 minutter. | 2026-11-01 |
| onlinebooking | Der er ingen onlinebooking paa sitet. Tid aftales efter den foerste telefonsamtale. | 2026-10 |
| konverteringsmaaling | Konverteringsmaalingen skal vaere teknisk faerdig, men IKKE aktiveret. Ingen maaler indlaeses, foer Kristian siger til. | 2026-11-02 |
| google-ads | Google Ads maa forberedes teknisk, men ingen konto, kampagne eller annonce maa aktiveres, og der maa ikke bruges penge uden udtrykkelig godkendelse. | 2026-11-02 |
| google-business-destinationer | Handlingsknapperne paa de tre Google-opslag peger paa: element 53 → /til-dig/naturterapi/, element 54 → /til-dig/psykoterapi/, element 49 → /kurser/skovbad/. | 2026-11-02 |
| uge-45-47 | Indholdet i godkendelsespakken for uge 45-47 er godkendt element for element, med beslutningen bundet til teksthashen. | 2026-11-01 |
| linkedin-billede | Element 41 maa ikke publiceres uden sit godkendte billede. Virker billedupload ikke, skal opslaget blokeres frem for at gaa ud som ren tekst. | 2026-11-01 |
| gratis-forsamtale | Den gratis forsamtale skal staa tydeligt oeverst paa forsiden og paa de relevante ydelsessider. | 2026-11-02 |
| merge | Ingen PR merges uden Kristians udtrykkelige godkendelse. Codex opretter og tester; Kristian merger. | 2026-11 |
| google-business-adgang | Google Business Profile-adgangen er autoriseret i produktion med scope business.manage og uden udloebsdato. OAuth skal IKKE gennemfoeres igen. | 2026-11-02 |
| foreningen-adskillelse | Foreningen mod Familiebelastning og Kristian GG's virksomhed holdes organisatorisk og datamaessigt adskilt. Ingen aendringer paa foreningens hjemmeside uden saerskilt godkendelse. | 2026-11-02 |

## Hvad der arbejdes paa andre steder

- **vagthund** · Google Business Profile: bekraeft knappens faktiske visning hos Google — afventer-haendelse
- **codex** · Den paalidelige udloeser: Netlify skal starte publiceringen paa klokkeslettet — afventer-haendelse
- **kristian** · Konverteringsmaalingen kan taendes, naar udbyder og samtykke er afklaret — afventer-kristian
- **kristian** · Google Ads kan oprettes, naar du vil bruge penge paa det — afventer-kristian
- **vagthund** · Netlify-credits kan standse produktionsbyg uden varsel — aaben

## Naar du er faerdig, eller finder noget

Overdragelsen gaar gennem GitHub Issues, fordi det er det eneste, baade du
og Codex med sikkerhed kan naa. Opret et issue i
`KristianGG-dk/KristianGG-Hjemmeside` med én af disse etiketter:

| Etiket | Bruges til | Lander hos |
| --- | --- | --- |
| `til-codex` | en teknisk fejl eller mangel | Codex |
| `til-claude` | en indholdsopgave | Claude |
| `til-kristian` | en rigtig beslutning | Kristian |

Skriv en overskrift **Naeste handling** i issuets tekst med én saetning om,
hvad der konkret skal goeres. Den bliver opgavens naeste handling.

Du faar en **kvittering** som en kommentar paa issuet, naar det er optaget i
registeret. Foerst dér er overdragelsen gennemfoert. Har du ikke faaet en
kvittering, er opgaven ikke modtaget.

**Hold dig til dit omraade.** Indhold, redaktionel kvalitet, SEO-tekst,
godkendelsespakker og planlaegning er dine. Kode, workflows, hemmeligheder
og produktionsautomatisering er Codex'. Se `drift/README.md`.


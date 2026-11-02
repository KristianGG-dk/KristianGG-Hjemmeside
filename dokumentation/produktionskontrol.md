# Produktionskontrol — hvad der faktisk er efterprøvet i luften

En grøn test beviser, at koden er rigtig. Den beviser ikke, at siden
virker. Dette er den anden halvdel.

## Hvorfor den kører i GitHub Actions

Arbejdsmiljøet har ingen udgående adgang til kristiangg.dk. En
GitHub-runner har fri internetadgang. Det er den eneste vej til at
efterprøve, hvad der rent faktisk er i luften.

```
# manuelt, mod produktion
Actions → Produktionskontrol → Run workflow

# mod et deploy preview
Run workflow → base: https://deploy-preview-108--kristiangg.netlify.app

# lokalt mod en hvilken som helst adresse
BASE=https://kristiangg.dk node tests/produktion.mjs
```

Den kører desuden **én gang i døgnet** kl. 06.37 UTC og ved hvert push til
en arbejdsgren.

Den **læser** kun. Eneste undtagelse er den rigtige formularindsendelse,
som skal slås til udtrykkeligt.

## Hvad den efterprøver

**Uden browser**

- forsiden svarer 200
- `robots.txt`: `/admin/` blokeret, sitemap henvist, sitet ikke spærret
- hver adresse i sitemappet: 200, egen canonical, title, description, ikke
  noindex
- hver fast viderestilling i `netlify.toml`: 301 til den rigtige adresse,
  som selv svarer 200 — altså ingen kæde og ingen død destination
- `http://` → 301 til https
- `www.` → 301
- de fire sikkerhedshoveder fra `netlify.toml`
- `X-Robots-Tag: noindex` på `/oauth/`
- strukturerede data på forsiden kan læses som JSON
- byggemærket `/byg.json`: hvornår, hvilken commit, hvilken kontekst
- den gratis forsamtale står på de ni sider, hvor den skal stå

**Med browser (Chromium, 1280 px og 390 px)**

- seks sider indlæses uden konsolfejl og uden døde delressourcer
- ingen vandret rul
- præcis én `h1` pr. side, alt-tekst på alle billeder, `lang="da"`
- klikflader under 32 px høje eller 24 px brede
- teknisk ydeevne: TTFB, LCP, antal anmodninger, hentede kB
- alle interne link-destinationer svarer under 400
- kontaktknapperne peger på det rigtige nummer

**Valgfrit: en rigtig indsendelse**

`indsend_proeve: ja` ved et manuelt kald, eller `[proeveindsendelse]` i
commit-beskeden ved et push. Den sender en tydeligt mærket teknisk prøve
gennem den rigtige formular, så det kan efterprøves, at Netlify tager imod,
og at notifikationsmailen når frem.

## Målt 2. november 2026

| | |
| --- | --- |
| Forsiden | 200 |
| Sitemap | 35 adresser, alle 200, alle med egen canonical, title og description |
| Viderestillinger | alle 94 faste er 301 og lander på en side, der svarer 200 |
| http og www | begge 301 |
| Sikkerhedshoveder | alle fire serveres |
| Strukturerede data | LocalBusiness og Person |
| Mobil og desktop | ingen konsolfejl, ingen døde ressourcer, intet vandret rul |
| Interne links | alle 38 destinationer under 400 |
| Kontaktknapper | 2 sms, 3 tel, alle med det rigtige nummer |
| **Ydeevne (mobil, snit af 6 sider)** | **TTFB 50 ms · LCP 237 ms · 9 anmodninger · 40 kB** |
| **Kontaktformularen** | **Netlify tog imod (HTTP 200), kvitteringen blev vist** |
| **Notifikationsmailen** | **afsendt 16:32:33, i indbakken 16:32:34 — ét sekund** |

LCP på 237 ms er omkring en tiendedel af Googles grænse på 2500 ms. Der er
intet at optimere på ydeevnen.

### Mailen, ordret

```
Fra:  formresponses@netlify.com
Til:  kontakt@kristiangg.dk
Emne: Andet

Navn:    Teknisk proeve (Codex)
Email:   kontakt@kristiangg.dk
Telefon:
Emne:    Andet
Besked:  TEKNISK PROEVE — ingen rigtig henvendelse.
         Maerke: proeve-41482237007
```

Hele kæden er dermed efterprøvet: browser → Netlify Forms → indbakke.
Emnefeltet var udfyldt, hvilket er det, der afgør, om Netlify overhovedet
sender mailen.

## Det, kontrollen fandt

**Produktionen var ikke opdateret.** Den gratis forsamtale manglede på alle
ni sider, selv om PR #107 var merget. Årsagen stod i indbakken: Netlify
havde sat produktionsbyg på pause, fordi kontoens credits var brugt op.
`genopbyg-planlagt.yml` meldte alligevel grønt, fordi build hooken svarer
2xx uanset.

Det er rettet to steder:

1. Byggemærket `/byg.json` gør forskellen synlig, og vagthunden læser det.
2. Genopbygningen blev kørt igen, da credits var genoprettet.

**For små klikflader.** «Eller ring»-nummeret og mailadressen var 20 px
høje — de mindste på hele sitet, lige under den primære handling. De er nu
40 px.

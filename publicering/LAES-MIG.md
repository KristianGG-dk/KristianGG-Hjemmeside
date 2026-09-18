# Publiceringsmotor — byggehistorik og sikkerhedsbeskrivelse

> **Reglerne står i [PUBLICERING.md](PUBLICERING.md).**
>
> Denne fil er en beretning om, hvordan motoren blev bygget, og hvilke
> sikkerhedsvalg der blev truffet undervejs. Den beskriver tilstanden på
> byggetidspunktet og vedligeholdes ikke som regelsæt. Er der uenighed mellem
> de to filer, gælder `PUBLICERING.md`.

Alt her er **additivt**. Ingen eksisterende fil på sitet er ændret.

## Hvorfor GitHub Actions og ikke Netlify Functions

Du foreslog en serverless broker. Jeg målte tre ting først:

| Fra Cowork-containeren | Resultat |
| --- | --- |
| `api.github.com` | **200 — nås** |
| `kristiangg.dk` | 403, egress afvist |
| `graph.facebook.com` | 403, egress afvist |
| `api.linkedin.com` | 403, egress afvist |

En Netlify-funktion ville ligge på kristiangg.dk. **Motoren ville ikke selv kunne
kalde den.** Den ville også være et internet-eksponeret publiceringsendpoint, der
selv skulle sikres — en ny angrebsflade uden modydelse.

GitHub Actions har fri netadgang, en formålsbygget krypteret secret-store, intet
indgående endpoint, og ligger allerede bag den PR-gate, du vil have. Derfor det.

## Filer

```
publicering/
  scripts/laas.mjs                 låselogik, delt af beregning og kontrol
  scripts/verificer.mjs            CI-gaten — læser, dømmer, skriver aldrig
  scripts/publicer-facebook.mjs    Meta Graph API v21.0
  scripts/publicer-linkedin.mjs    LinkedIn REST API, Share on LinkedIn
  scripts/registrer.mjs            skriver publiceringsregistret
  laase/element-01.json            element 1, lås 5e5b702d439b0bc8
  test/element-999-test.json       testfixtur, ikke et godkendt element
.github/workflows/
  verificer.yml                    PR-gate. permissions: contents: read
  publicer-social.yml              manuel start, tørløb som standard
```

## Låsen

`sha256(kanonisk JSON over alle låste felter)[:16]`, som du godkendte.

Låste felter: titel · meta description · slug · slut-URL · dato · kategorier ·
billede · alt-tekst · links · CTA · hashtags · sha256 af brødteksten.

`laas.mjs` kaster, hvis et obligatorisk felt mangler — publicering stopper frem
for at udlede feltet.

## Afprøvet

Gaten er kørt mod det rigtige repo med den rettede element 1. Nitten kontroller
bestået. Derefter fire manipulationsforsøg, alle fanget:

| Forsøg | Fanget som |
| --- | --- |
| Én sætning ændret i brødteksten | brødtekst ÆNDRET, hash afviger |
| Titel ændret efter godkendelsen | titel afviger |
| Ekstra link smuglet ind | uventede links + hash afviger |
| Obligatorisk felt fjernet fra låsen | obligatoriske felter mangler |

Publiceringsklienterne er kørt i tørløb. Vagten stoppede en manipuleret tekst
med `Teksten svarer ikke til den godkendte hash. Publicering stoppet.`

## Sikkerhed

Ingen hemmeligheder i koden. Klienterne læser kun fra miljøet, og workflowen
henter fra GitHub Secrets. `verificer.yml` kører `contents: read` og kan ikke
ændre det, den kontrollerer. `publicer-social.yml` starter aldrig af sig selv,
og tørløb er standard.

Publicering er idempotent: et element, der står som PUBLICERET i registret,
publiceres ikke igen.

## Billeder

Facebook og LinkedIn henter billedet fra en offentlig URL. Billederne ligger
allerede i repoet og serveres fra kristiangg.dk. Der skal ikke uploades noget,
og der er ikke brug for en billedtjeneste.

---

## Sikkerhedsgennemgang 17-09-2026 — tre fejl fundet og rettet

Materialet blev gennemgået fjendtligt efter opbygningen. Tre reelle fejl i den
første version. Alle er rettet og genafprøvet.

**A. Idempotens-vagten var inaktiv.** Trinnet "Allerede publiceret?" var skrevet
som `if [ -f "$R" ] && node -e "..."; then echo ...; fi`. Fejler `node`, bliver
betingelsen falsk, `fi` rammes, og **trinnet slutter med exit 0**. Advarslen blev
skrevet, og workflowet fortsatte. Et element kunne publiceres to gange.
Rettet: `node` kører nu direkte som trin, så exit 1 stopper jobbet. Afprøvet.

**B. Script injection via `inputs.element`.** Inputtet er af typen string og blev
interpoleret direkte i shell: `printf '%02d' "${{ inputs.element }}"`. En værdi
som `3"; kommando; #` ville køre. Rettet: inputtet går gennem `env`, og kun cifre
accepteres. Afprøvet med fire værdier.

**C. En fejlet publicering blev aldrig registreret.** `registrer.mjs` kaldte
`process.exit(1)` ved fejl, hvilket afbrød `run`-blokken, før registret blev
committet. En mislykket publicering forsvandt sporløst. Rettet: posten skrives og
committes først, og jobbet fejler bagefter i et separat trin.

**Desuden strammet:** workflowet er delt i to jobs. Publiceringen kører med
`contents: read` og kan ikke skrive i repoet. Kun registreringen har
`contents: write`, og den rører kun `register.json`. Top-level `permissions: {}`.

## Én ting du skal slå til i GitHub

`workflow_dispatch` lader den, der starter workflowet, vælge branch — og
workflowfilen hentes fra den valgte branch. En ændret branch kunne dermed få
secrets udleveret.

Beskyt det: repoet → *Settings* → *Environments* → `publicering` →
*Deployment branches* → begræns til `main`. Så udleveres secrets kun til kode,
der allerede er merget gennem PR-gaten.

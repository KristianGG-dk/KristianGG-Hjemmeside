# Den gratis forsamtale på sitet

Den gratis forsamtale er det første skridt ind i et forløb. Den stod
tidligere kun ét sted med fuld tydelighed — som kortet
«Gratis forsamtale · Start her» på `/priser/` — og ellers kun antydet:
«En kort telefonsamtale, uden beregning» som trin 2 under *Sådan kommer du i
gang* på forsiden, et godt stykke nede på siden.

Den står nu øverst, dér hvor den bliver læst.

## Hvor den står

| Side | Vises | Hvorfor |
|---|---|---|
| `/` | ja | forsiden |
| `/kontakt/` | ja | her står man med hånden på dørgrebet |
| `/til-dig/` og alle sider under den | ja | ydelsessiderne for privat terapi |
| `/priser/` | nej | har allerede kortet «Gratis forsamtale · Start her» **og** siger det i underrubrikken. To gange tæt på hinanden læses som pres frem for hjælp |
| `/kurser/`, `/kurser/skovbad/`, `/kurser/cash-stuffing/` | nej | hold med egen tilmelding. En gratis forsamtale er ikke vejen ind |
| `/begivenheder/` og enkeltbegivenheder | nej | har deres egen tilmelding |
| `/til-virksomheder/`, `/til-kommuner/`, `/til-organisationer/` | nej | sælger aftaler, ikke en privat forsamtale |
| `/blog/`, `/om/` | nej | artikler og baggrund, ikke ydelser |

## Hvordan den styres

Ordlyden står **ét** sted: `data/forsamtale.toml`. Den må ikke skrives ind i
en skabelon eller en indholdsfil.

Sektionslisten i samme fil afgør, hvor blokken vises af sig selv. Enhver
enkeltside kan afgøre det selv:

```yaml
---
gratis_forsamtale: true    # eller false
---
```

Front matter vinder altid over sektionslisten.

Skabelonen er `layouts/partials/gratis-forsamtale.html`. Den kaldes fra
hero'en i `layouts/index.html`, `layouts/_default/single.html`,
`layouts/_default/list.html`, `layouts/kurser/single.html`,
`layouts/kurser/skovbad.html` og `layouts/kontakt/single.html` — altid
mellem underrubrikken og kontaktknapperne, så den læses **før** handlingen.

## Hvad der holder den på plads

`tests/hjemmeside.mjs` fejler, hvis

* blokken mangler på en af de ni sider, hvor den skal stå
* den dukker op på en af de sider, hvor den ikke hører til
* den står før sidens `<h1>`, uden for hero'en eller efter hero'ens
  kontaktknapper — så er den ikke øverst længere
* kortet «Gratis forsamtale» forsvinder fra `/priser/`, eller prisen dér
  ikke længere er «Gratis» — så lover blokken noget, prislisten ikke
  bekræfter
* varigheden i `data/forsamtale.toml` ikke er den samme som på `/priser/`
* teksten kommer til at bruge ordet **book**. Der er ingen onlinebooking på
  sitet, og `/kontakt/` siger det udtrykkeligt. Blokken må ikke love en
  kalender, der ikke findes

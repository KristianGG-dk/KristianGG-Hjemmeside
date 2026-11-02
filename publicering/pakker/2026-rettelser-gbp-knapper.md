# Rettelse: handlingsknap paa de tre Google-opslag

Godkendt af Kristian G. G. Dansted **2026-11-02** i chat, med destinationen angivet
eksplicit for hvert element.

| Element | Kanal | Tidspunkt | Destination | Teksthash | Versionslaas |
| --- | --- | --- | --- | --- | --- |
| 53 | gbp | 2026-11-04T09:00:00+01:00 | `https://kristiangg.dk/til-dig/naturterapi/` | `12f69f791c635502` | `3db77d570cff2eaf` |
| 54 | gbp | 2026-11-10T09:00:00+01:00 | `https://kristiangg.dk/til-dig/psykoterapi/` | `2da74b795c7ffaf1` | `543990dac9046d10` |
| 49 | gbp | 2026-11-17T09:00:00+01:00 | `https://kristiangg.dk/kurser/skovbad/` | `35e4e14c8591b268` | `5ad86908654dc18a` |

## Hvad der er rettet

Google Business Profile har ét knapfelt pr. opslag: `callToAction` med en
`actionType` og en `url`. De tre opslag blev godkendt med en **tom**
`links`-liste og fik derfor ingen knap. Her saettes destinationen.

**Kun feltet `links` er aendret.** Broedtekst, titel, billede, alt-tekst,
dato, tidspunkt, kategorier, hashtags og `cta` er ordret de samme som i
`2026-uge-45-47.md`. Godkendelsen af teksterne fra 1. november 2026 staar
ved magt og bortfalder ikke — teksthashene herover er uaendrede og kan
sammenlignes med den oprindelige pakke.

`godkendelsespakke` i de tre laasefiler peger nu paa denne fil, fordi
`kontroller-indhold.mjs` kraever, at pakken naevner elementets
versionslaas. Den oprindelige pakke naevner de gamle.

## Knappens tekst

Den kan ikke saettes. Ved `actionType: LEARN_MORE` skriver Google selv
«Laes mere». Feltet `cta` i laasen er redaktionens formulering i
broedteksten, ikke knappens etiket — de to er forskellige ting.

## De tidligere versionslaase

| Element | Foer | Efter |
| --- | --- | --- |
| 53 | `0bd3551effd7b6d9` | `3db77d570cff2eaf` |
| 54 | `2e65cb491ef29b2e` | `543990dac9046d10` |
| 49 | `e2ad2ceb25c7b143` | `5ad86908654dc18a` |

Alle tre stod som `AFVENTER DATO` i registret, da rettelsen blev lavet.
Intet af dem var publiceret, og intet er genpubliceret.

# Tilbagekaldte låsefiler

Her ligger låsefiler, hvis godkendelse er bortfaldet, fordi en
publiceringsrelevant del skal rettes. **Ingen del af motoren læser denne
mappe.** Alle udvælgelser læser kun `publicering/laase/`.

Filerne bevares ordret som revisionsspor: de viser præcis, hvad der var
godkendt, og hvorfor det blev trukket tilbage. Den rettede version får en ny
låsefil i `publicering/laase/`, når Kristian har godkendt den igen.

| Fil | Tilbagekaldt | Grund |
| --- | --- | --- |
| `element-45-v1.json` | 01-11-2026 | Markdown (`##`) i teksten. Erstattes af 45 v2. |
| `element-51-v1.json` | 01-11-2026 | Prisen manglede Molsness' gebyrer (29 kr. + 3 kr. pr. ordre). |
| `element-52-v1.json` | 01-11-2026 | Samme, og teksten sagde, at 1.200 kr. dækker det hele. |

Køposten for hvert element står fortsat i `koe.json` med `"laasefil": null`
og et felt `"tilbagekaldt"`, så vagthunden og historikken kan se, hvad der
skete.

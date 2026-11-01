# Varig historik uden unødvendige skriverettigheder

Fase 1-indsamleren har i dag `permissions: contents: read`. Den kan altså
ikke skrive til repoet, og ugens fund overlever kun som artefakt — og
artefakter udløber. Historikken skal være varig, uden at den del af motoren,
der rører internettet, får adgang til at ændre noget.

## Hvorfor det ikke bare kan løses med en rettighed

GitHubs `contents: write` er **repo-dækkende**. Der findes ingen rettighed,
der siger «må kun skrive i `publicering/research/fund/`». Giver man jobbet
skriveret, kan det i princippet skrive hvor som helst — også i
`publicering/laase/`, hvor godkendelserne ligger.

Det er netop derfor, `verificer.mjs` og hele gaten er bygget som `read`.
Den linje skal ikke brydes for noget så lavt som en logfil.

## Anbefalet løsning: to job, hver med sin rettighed

Workflowet deles i to job i samme fil:

| Job | Rettighed | Hvad det gør | Rører internettet |
| --- | --- | --- | --- |
| `research` | `contents: read` | henter kilder, vurderer, skriver artefakt | **ja** |
| `arkiver` | `contents: write` | henter artefakt, committer JSON | **nej** |

Pointen er adskillelsen: **det job, der behandler data udefra, har ingen
skriveret. Det job, der har skriveret, ser aldrig internettet** — det læser
kun en artefakt, som det foregående job har lagt.

Et kompromitteret eller manipuleret svar fra en kilde kan derfor ikke komme
til at skrive i repoet. Det er den samme tankegang som i
`publicer-linkedin.mjs`, hvor destinationskontrollen ligger uden for den
kode, der taler med API'et.

## Tre spærrer oven i

**1. En vagt, der afviser alt uden for `fund/`.** Før `arkiver` committer,
kontrollerer et script, at diffen udelukkende rører
`publicering/research/fund/*.json` og `tilstand.json`. Rører den noget
andet — en låsefil, en køpost, en skabelon — fejler jobbet, og intet
committes. Det er den egentlige sikring; rettigheden er kun rammen.

**2. Aldrig til `main`.** `arkiver` pusher til en gren, `research/fund`, og
aldrig direkte til `main`. Grenbeskyttelse på `main` gør det til en regel,
ikke en vane.

**3. JSON valideres før commit.** En artefakt, der ikke kan parses, eller
som mangler felterne `uge`, `koert` og `fund`, committes ikke.

## Hvad det giver

Historikken bliver varig og sporbar: enhver anbefaling kan føres tilbage til
det fund, den hviler på, og til kilden og datoen bag. Samme princip som
`register.json` — poster tilføjes, aldrig overskrives.

Og den del af motoren, der er mest udsat — den, der henter fra fremmede
servere — bliver ved med ikke at kunne ændre noget som helst.

## Status

**Ikke bygget.** Dette er et forslag. Indsamleren kører fortsat som `read`
alene, og ugens fund ligger som artefakt, indtil Kristian har taget stilling.

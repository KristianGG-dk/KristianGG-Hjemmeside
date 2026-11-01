# Ugens fund

Én fil pr. uge, `AAAA-UU.json`. Filerne **tilfoejes, aldrig overskrives eller
slettes** — samme princip som `publicering/register.json`, der er en
haendelseslog og ikke en tilstand.

Det er dét, der goer en vurdering sporbar bagud: enhver anbefaling kan foeres
tilbage til det fund, den hviler paa, og til den kilde og dato, fundet kom fra.

`tilstand.json` er ikke historik. Den gemmer ETag pr. kilde, saa en kilde, der
intet har aendret, kan svare `304` og slippe for at sende indholdet igen.

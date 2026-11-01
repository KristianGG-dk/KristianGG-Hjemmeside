# Annullér et opslag, der ligger planlagt hos Meta

## Hvorfor dette er den ene fejl, motoren ikke kan spærre

Facebook er den eneste kanal, hvor Meta **holder** opslaget og udgiver det
selv på dagen. Alle motorens andre spærrer virker *før* afsendelsen: lås,
teksthash, godkendelse, kø, register, billede, tidsvindue. De virker, fordi
intet er sendt endnu.

Når opslaget først ligger hos Meta, er det ude af motorens hænder. Bliver
elementet derefter tilbagekaldt eller sat på pause, sker der ingenting her i
repoet — låsefilen flyttes til `publicering/laase-tilbagekaldt/`, køposten får
`laasefil: null` — **og opslaget går alligevel ud hos Meta.**

Vagthunden er derfor det eneste værn. Den melder FEJL med `post_id`,
tidspunktet og hvorfor ingen vil opslaget:

```
element 52  facebook: opslaget LIGGER HOS META som planlagt (123_456)
og gaar ud 2026-12-01 18:00 UTC, men koeen siger tilbagekaldt
(2026-11-01); laasefilen findes ikke. Meta udgiver det selv —
annullér det hos Meta, hvis det ikke skal ud.
```

Den kører 09.30 og 19.30 dansk tid, og en fejl sender mail.

## Sådan annullerer du det

### Nemmest: Metas egen brugerflade

Facebook → siden → Meta Business Suite → Indhold → Planlagte opslag. Find
opslaget, og slet det. Det er den vej, jeg vil anbefale: du ser opslaget, før
du sletter det.

### Med API'et, hvis du foretrækker det

`post_id` står i vagthundens besked og i `publicering/register.json`.

```
DELETE https://graph.facebook.com/v21.0/{post_id}?access_token={side-token}
```

Side-tokenet er ikke en hemmelighed, der ligger gemt — det veksles fra
`FB_PAGE_TOKEN` ved hver kørsel. Vil du gøre det i hånden, kan du hente det
sådan:

```
GET https://graph.facebook.com/v21.0/{side-id}?fields=access_token&access_token={FB_PAGE_TOKEN}
```

### Bagefter: skriv det i registret

Så vagthunden tier, og så historikken er sand. Tilføj en række til
`publicering/register.json`:

```json
{
  "element": 52,
  "kanal": "facebook",
  "status": "ANNULLERET HOS META",
  "post_id": "123_456",
  "tidspunkt": "2026-11-01T22:30:00.000Z",
  "noter": "Planlagt opslag slettet hos Meta, fordi elementet blev tilbagekaldt."
}
```

Statussen `ANNULLERET HOS META` er ikke `PLANLAGT`, så vagthundens kontrol
holder op med at melde fejl, og motorens spærrer regner elementet som
hverken afsendt eller på vej.

## Hvorfor motoren ikke sletter det selv

Den kunne. `DELETE /{post_id}` er ét kald, og `post_id` står i registret.

Jeg har ikke bygget det, og det er et bevidst valg. At slette et opslag hos
Meta er uigenkaldeligt og udadvendt, og det sker på et grundlag — "ingen vil
dette opslag" — som motoren udleder af, at en fil er flyttet. Var udledningen
forkert, ville motoren slette et opslag, du gerne ville have haft, og der er
ingen vej tilbage.

Opdagelsen er det, der manglede, og den er automatisk nu. Selve slettningen
er et menneskes beslutning, og den tager tre klik.

Skal det automatiseres alligevel, er det en lille opgave — men den skal have
samme sikkerhedskrav som publiceringen: krav før handling, registrering
bagefter, og tørløb som standard. Sig til.

## Erstatte frem for at annullere

Meta har ingen "erstat" på et planlagt opslag. Det er to handlinger: slet det
gamle, og lad motoren aflevere det nye.

Rækkefølgen er vigtig. Slet først hos Meta, skriv `ANNULLERET HOS META` i
registret, og lås derefter den nye version. Gør du det omvendt, står der
kortvarigt to opslag til samme dato — det gamle hos Meta og det nye på vej —
og det er netop den dobbeltpublicering, alt det andet er bygget til at
forhindre.

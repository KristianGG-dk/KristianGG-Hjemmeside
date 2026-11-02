/* Overdragelsen mellem Claude, Codex og vagthunden — gennem GitHub Issues.
   ============================================================================

   HVORFOR ISSUES OG IKKE NOGET FINERE

   Claude og Codex deler ingen maskinel kanal. Claude arbejder i sit eget
   miljoe og har ikke noedvendigvis skriveadgang til dette repo. Codex har
   adgang, men kan ikke naa Claude.

   Det eneste, begge med sikkerhed kan naa, er GitHub: repoet er offentligt,
   saa registrene kan LAESES af enhver uden adgang overhovedet, og et issue
   kan oprettes af den, der har adgang — Claude selv, Kristian eller Codex.

   Derfor er issues overdragelseskanalen. Et issue med en etiket bliver til
   en opgave i det faelles register, og opgaven faar en KVITTERING tilbage
   som en kommentar paa issuet. Foerst dér er overdragelsen gennemfoert.

   «Overdraget» betyder ikke, at nogen har skrevet det. Det betyder, at
   modtagelsen kan efterproeves.

   ETIKETTERNE

     til-codex    teknisk opgave. Oprettes af Claude eller Kristian.
     til-claude   indholdsopgave. Oprettes af Codex, vagthunden eller Kristian.
     til-kristian en rigtig beslutning. Oprettes kun, naar spaerren i
                  drift.mjs har sagt god for det.

   Et issue uden en af dem roeres ikke. Issue #90 og alt andet eksisterende
   er derfor urørt, indtil nogen bevidst saetter en etiket paa.               */

export const ETIKETTER = {
  'til-codex': 'codex',
  'til-claude': 'claude',
  'til-kristian': 'kristian',
};

/** Fast id. Issuenummeret er stabilt, saa den samme sag giver samme opgave. */
export const opgaveId = (nr) => `issue-${nr}`;

export const KVITTERING = '<!-- kvittering: optaget i drift/opgaver.json -->';

/**
 * Issues → opgaver. Ren funktion; henter intet og skriver intet.
 *
 * Returnerer baade opgaverne og de kvitteringer, der mangler at blive
 * skrevet, saa kalderen kan afgoere, om den vil skrive dem.
 */
export function issuesTilOpgaver(issues, { harKvittering = () => false } = {}) {
  const opgaver = [];
  const kvitteringer = [];

  for (const i of issues) {
    const navne = (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
    const etiket = navne.find((n) => ETIKETTER[n]);
    if (!etiket) continue;

    const id = opgaveId(i.number);
    const lukket = String(i.state).toLowerCase() === 'closed';

    opgaver.push({
      id,
      titel: i.title,
      ansvarlig: ETIKETTER[etiket],
      prioritet: navne.includes('hoej') ? 'hoej' : 'mellem',
      status: lukket ? 'loest' : 'aaben',
      kilde: [{ type: 'issue', ref: i.number }],
      naeste_handling: lukket
        ? 'Issuet er lukket. Afventer verificering, foer opgaven kan lukkes med bevis.'
        : (foersteHandling(i.body) ?? `Se issue #${i.number}.`),
      // Issues lukkes ikke af synkroniseringen. Et lukket issue betyder, at
      // nogen mener sig faerdig — ikke at det er verificeret i drift.
    });

    if (!lukket && !harKvittering(i)) {
      kvitteringer.push({
        nummer: i.number,
        krop: `${KVITTERING}\n\n**Optaget i det faelles opgaveregister som \`${id}\`.**\n\n`
          + `Ansvarlig: **${ETIKETTER[etiket]}** (fra etiketten \`${etiket}\`).\n\n`
          + 'Opgaven foelges nu i [`drift/opgaver.json`](../blob/main/drift/opgaver.json) '
          + 'og vises i den samlede status. Den lukkes foerst, naar den er verificeret '
          + 'i drift — ikke naar dette issue lukkes.\n\n'
          + 'Se [`drift/README.md`](../blob/main/drift/README.md) for arbejdsdelingen.',
      });
    }
  }
  return { opgaver, kvitteringer };
}

/** Foerste linje under en «Naeste handling»-overskrift, hvis den findes. */
export function foersteHandling(krop) {
  if (!krop) return null;
  // «Naeste» staves med TO tegn (ae), ikke ét. [æae] matchede «naste» og
  // «neste», men ikke det ord, der faktisk staar i issuet.
  const m = /(?:^|\n)#{1,6}\s*n(?:æ|ae|e)ste handling\s*\n+([^\n]+)/i.exec(krop);
  if (m) return m[1].trim();
  const foerste = String(krop).split('\n').map((l) => l.trim()).find(Boolean);
  return foerste ? foerste.slice(0, 200) : null;
}

/** Har issuet allerede faaet sin kvittering? Saa skrives der ikke en til. */
export const harKvitteringIKommentarer = (kommentarer) =>
  (kommentarer ?? []).some((k) => String(k.body ?? '').includes(KVITTERING));

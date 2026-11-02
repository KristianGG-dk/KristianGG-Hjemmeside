// Vagthund. Sammenholder koeen med registret og raaber op, naar noget ikke
// stemmer. Den publicerer intet, aendrer intet og har ingen skriveadgang.
//
// Baggrund: element 2 og 9 passerede deres godkendte dato uden at nogen
// opdagede det. Naar opslag ligger og venter paa at gaa ud af sig selv, staar
// ingen laengere og kigger paa en knap, der bliver groen.
//
//   publicering/koe.json        hvad der SKAL ske  (alle 15 godkendte elementer)
//   publicering/register.json   hvad der ER sket   (haendelseslog)
//   publicering/laase/*.json    integriteten af de elementer motoren selv sender
//
// Den skelner skarpt mellem tre ting:
//   FEJL      noget er beviseligt galt. Jobbet fejler, GitHub sender mail.
//   ADVARSEL  noget bør ses efter, men kan ikke bevises herfra. Fejler ikke.
//   INFO      forventet tilstand, noteret for fuldstaendighedens skyld.
//
// En alarm, der ikke kan bevise sin paastand, slukker man for efter tre dage.
// Derfor faar kun det beviselige lov at fejle jobbet.
//
// Flag:
//   --uden-net    spring HTTP-kontrollen af websider over (til lokal test)
//   --nu <iso>    lad som om klokken er noget andet (til test)
import { readFileSync, existsSync } from 'node:fs';
import { beregnLaas, sha256 } from './laas.mjs';
import { MAKS_FORSINKELSE_S, varighed, AFSLUTTET } from './krav.mjs';

const KOE = 'publicering/koe.json';
const REGISTER = 'publicering/register.json';

const args = process.argv.slice(2);
const udenNet = args.includes('--uden-net');
const nuArg = args.indexOf('--nu');
const NU = nuArg !== -1 ? new Date(args[nuArg + 1]) : new Date();

// --json goer udtraekket maskinlaesbart. Saa maa INTET andet staa paa stdout,
// eller kan modtageren ikke laese det. Prosaen daempes derfor her, og kun
// JSON-blokken til sidst skriver — gennem den gemte reference.
const jsonTilstand = args.includes('--json');
const rigtigLog = console.log;
if (jsonTilstand) console.log = () => {};

const fejl = [];
const advarsler = [];
const info = [];

const FEJL = (n, m) => fejl.push(`element ${String(n).padStart(2)}  ${m}`);
const ADVAR = (n, m) => advarsler.push(`element ${String(n).padStart(2)}  ${m}`);
const INFO = (n, m) => info.push(`element ${String(n).padStart(2)}  ${m}`);
// Kanalniveau: gaelder hele kanalen, ikke et enkelt element.
const K_FEJL = (k, m) => fejl.push(`${k.padEnd(10)}  ${m}`);
const K_ADVAR = (k, m) => advarsler.push(`${k.padEnd(10)}  ${m}`);
const K_INFO = (k, m) => info.push(`${k.padEnd(10)}  ${m}`);

/** Statusser der betyder "elementet er afsendt eller undervejs". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT', 'AFVENTER DATO'];
const FEJLEDE = ['PUBLICERING FEJLET', 'PLANLAEGNING FEJLET'];

/**
 * «PUBLICERING IGANG» betyder, at kravet blev taget, men koerslen aldrig
 * meldte tilbage. Opslaget KAN vaere gaaet ud. Det er det alvorligste, der
 * kan staa i registret, og det kraever et menneske paa platformen.
 *
 * «STOPPET FOR SENT» betyder, at motoren selv stoppede et opslag, fordi det
 * forfaldt for mere end en time siden. Det er ikke en fejl i motoren, men
 * opslaget er ikke gaaet ud, og nogen skal tage stilling.
 */
const UVIST = 'PUBLICERING IGANG';
const FOR_SENT = 'STOPPET FOR SENT';

/**
 * Statusser, der LUKKER en sag: AFSLUTTET fra krav.mjs. Listen staar ÉT sted,
 * fordi den baade skal spaerre for nye forsoeg (registerSpaerre) og tie her.
 * Var de to lister uenige, ville et lukket element enten blive udvalgt igen
 * eller meldt som «ukendt status».
 *
 * Et element med en af dem noteres som INFO med sin begrundelse. Historikken
 * er saaledes synlig, uden at der raabes op om den.
 */

/**
 * Hvor laenge et afleveret, ubekraeftet opslag giver en paamindelse.
 *
 * «PLANLAGT» og «PLANLAGT MANUELT» betyder, at opslaget ligger hos
 * platformen, som udgiver det selv. Vagthunden kan ikke se ind i Meta,
 * Google eller LinkedIn og kan derfor hverken bekraefte eller afvise, at det
 * gik ud. Den paamindede derfor om det — hver kaersel, i det uendelige.
 *
 * Element 24 har faaet den samme paamindelse to gange om dagen i seksogtyve
 * dage. Efter den fjerde er den ikke en paamindelse laengere, men stoej, og
 * stoej er det, der gør, at man holder op med at laese vagthunden.
 *
 * Efter denne frist antages opslaget udgivet og noteres som INFO. Det er en
 * ANTAGELSE, og den skrives som en antagelse — ikke som en bekraeftelse.
 * Intet registreres som publiceret paa den baggrund.
 */
const PAAMIND_DAGE = 7;

const dage = (ms) => Math.floor(ms / 86400000);
const dk = (d) => d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

async function sidenLever(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    return { ok: false, status: `netvaerksfejl: ${err.message}` };
  }
}

/** Laaser og teksthash skal holde for de elementer motoren selv sender. */
function kontrollerLaas(e) {
  if (!e.laasefil) return;
  if (!existsSync(e.laasefil)) {
    FEJL(e.element, `laasefilen mangler: ${e.laasefil}`);
    return;
  }
  let l;
  try {
    l = JSON.parse(readFileSync(e.laasefil, 'utf8'));
  } catch (err) {
    FEJL(e.element, `laasefilen kan ikke laeses: ${err.message}`);
    return;
  }
  try {
    const { laas } = beregnLaas(l);
    if (laas !== l.versionslaas) {
      FEJL(e.element, `versionslaasen afviger: beregnet ${laas}, gemt ${l.versionslaas}`);
    }
  } catch (err) {
    FEJL(e.element, `laasen kan ikke beregnes: ${err.message}`);
  }
  if (l.tekst && l.tekst_sha256 && sha256(l.tekst) !== l.tekst_sha256) {
    FEJL(e.element, 'teksten svarer ikke til den godkendte hash');
  }
  if (l.kanal !== e.kanal) {
    FEJL(e.element, `kanal i laasen (${l.kanal}) matcher ikke koeen (${e.kanal})`);
  }
}

async function main() {
  const koe = JSON.parse(readFileSync(KOE, 'utf8'));
  const register = existsSync(REGISTER) ? JSON.parse(readFileSync(REGISTER, 'utf8')) : [];

  console.log(`Vagthund. Klokken er ${dk(NU)}.`);
  console.log(`${koe.length} elementer i koeen, ${register.length} raekker i registret.\n`);

  const iKoe = new Set(koe.map((e) => e.element));
  for (const r of register) {
    if (!iKoe.has(r.element)) {
      FEJL(r.element, 'staar i registret, men ikke i koeen — koe og register er ude af trit');
    }
  }

  for (const e of koe) {
    kontrollerLaas(e);

    const raekker = register.filter((r) => r.element === e.element);
    if (!raekker.length) {
      FEJL(e.element, `${e.kanal}: slet ikke registreret`);
      continue;
    }

    const sidste = raekker[raekker.length - 1];
    const forfald = new Date(e.tidspunkt);
    const passeret = NU > forfald;
    const dageSiden = dage(NU - forfald);

    if (AFSLUTTET.includes(sidste.status)) {
      // Afsluttet. De faktiske tal staar med, saa man bagefter kan se HVORFOR
      // opslaget ikke blev publiceret — men det fylder ikke en alarm. Tallene
      // tages fra raekkens egne felter, ikke ved at skaere i prosaen.
      const dele = [];
      if (sidste.sidste_status_foer) dele.push(`var «${sidste.sidste_status_foer}»`);
      if (passeret) dele.push(`forfaldt ${dk(forfald)}, ${dageSiden} dage for sent`);
      if (sidste.registreret_af) dele.push(`lukket af ${sidste.registreret_af}`);
      INFO(e.element, `${e.kanal}: ${sidste.status.toLowerCase()}${dele.length ? ` (${dele.join('; ')})` : ''}`);
      continue;
    }
    if (sidste.status === UVIST) {
      FEJL(e.element, `${e.kanal}: «${UVIST}» — kravet blev taget ${dk(new Date(sidste.tidspunkt))}, men koerslen meldte aldrig tilbage. `
        + 'Opslaget kan vaere gaaet ud. Se efter paa platformen, og skriv udfaldet i registret, FOER der proeves igen.');
      continue;
    }
    if (sidste.status === FOR_SENT) {
      // Graensen staar ét sted, og beskeden skal sige den rigtige. Den sagde
      // «over en time», efter graensen var blevet et doegn — en besked, der
      // selv er forkert, er vaerre end ingen.
      //
      // Og alarmen skal kunne lukkes. Element 33 og 34 gik tabt i oktober og
      // kan ikke publiceres nu; uden en vej til at kvittere ville vagthunden
      // melde FEJL om dem to gange dagligt for altid, og saa holder man op
      // med at laese den. Seneste status afgoer, saa en raekke med et valg
      // lukker sagen.
      const alder = Math.floor((NU - forfald) / 1000);
      FEJL(e.element, `${e.kanal}: stoppet. Det forfaldt ${dk(forfald)} — for ${varighed(alder)} siden — `
        + `og graensen for automatisk publicering er ${varighed(MAKS_FORSINKELSE_S)}. `
        + 'Opslaget er IKKE gaaet ud. Publicér det i haanden, godkend et nyt tidspunkt, eller '
        + 'luk sagen med en registerraekke: status «OPGIVET» og en kort grund. '
        + 'Se dokumentation/tidsvinduet.md.');
      continue;
    }
    if (FEJLEDE.includes(sidste.status)) {
      FEJL(e.element, `${e.kanal}: seneste status er «${sidste.status}» og intet er lykkedes siden`);
      continue;
    }
    if (!AFSENDT.includes(sidste.status)) {
      FEJL(e.element, `${e.kanal}: ukendt status «${sidste.status}»`);
      continue;
    }
    if (sidste.status === 'PUBLICERET') {
      INFO(e.element, `${e.kanal}: publiceret`);
      continue;
    }
    if (!passeret) {
      INFO(e.element, `${e.kanal}: ${sidste.status.toLowerCase()}, forfalder ${dk(forfald)}`);
      continue;
    }

    // Herfra: datoen er passeret, og elementet staar ikke som publiceret.
    if (e.kanal === 'website') {
      if (!e.url) { FEJL(e.element, 'website uden url i koeen — kan ikke kontrolleres'); continue; }
      if (udenNet) { INFO(e.element, `website: HTTP-kontrol sprunget over (--uden-net)`); continue; }
      const svar = await sidenLever(e.url);
      svar.ok
        ? INFO(e.element, `website: siden er live (${e.url})`)
        : FEJL(e.element, `website: datoen passerede for ${dageSiden} dag(e) siden, og ${e.url} svarer ${svar.status}`);
      continue;
    }

    // Facebook, Google og LinkedIn holder selv opslaget, naar det er afleveret
    // til dem. Motoren kan ikke se ind i dem herfra, saa det kan ikke bevises —
    // kun paamindes om.
    //
    // Instagram og Google Business Profile med metode "motor" er undtagelsen:
    // der findes ingen scheduled_publish_time paa Instagram, og GBP-API'et
    // holder ikke et opslag for os. Motoren publicerer selv paa tidspunktet.
    // Staar et forfaldent element uden resultat, ligger det altsaa ingen
    // steder og venter — den planlagte koersel har svigtet.
    //
    // METODEN AFGOER, IKKE KANALEN. Et Instagram-element med metode "manuel"
    // har ingen laasefil, og Instagram-motoren udvaelger netop fra laasefiler.
    // Den kan derfor slet ikke behandle elementet, og en alarm om en svigtet
    // automatisk koersel ville vaere usand. Element 36 (18-10-2026) beviste
    // det: vagthunden meldte FEJL paa en koersel, der aldrig skulle have
    // vaeret der.
    if ((e.kanal === 'instagram' || e.kanal === 'gbp') && e.metode === 'motor') {
      // Her kan vi faktisk bevise noget. Havde koerslen gjort sit arbejde,
      // stod der en raekke i registret.
      //
      // Naadetiden FOELGER motorens eget publiceringsvindue. Den var en time,
      // mens graensen var en time. Med Kristians beslutning 01-11-2026 maa
      // motoren publicere i op til et doegn efter det godkendte tidspunkt, og
      // en times naade ville derfor melde FEJL paa et element, motoren stadig
      // agter at publicere helt lovligt. Vagthunden skal raabe op, naar noget
      // er galt — ikke naar motoren arbejder som aftalt.
      const NAADE_MS = MAKS_FORSINKELSE_S * 1000;
      if (NU - forfald > NAADE_MS) {
        FEJL(e.element, `${e.kanal}: forfaldt ${dk(forfald)} og er hverken publiceret eller fejlregistreret. Den planlagte koersel har ikke gjort sit arbejde.`);
      } else {
        ADVAR(e.element, `${e.kanal}: forfaldt ${dk(forfald)} for nylig — den planlagte koersel har endnu ikke meldt tilbage. Se efter igen om lidt.`);
      }
      continue;
    }

    // Resten skal publiceres eller bekraeftes af et menneske. STATUS afgoer
    // ordlyden, ikke kanalen og ikke metoden.
    //
    // "AFVENTER DATO" betyder, at intet er afleveret nogen steder: elementet
    // ligger kun i koeen. Siger vagthunden "planlagt i platformens
    // brugerflade" om det, paastaar den en handling, ingen har foretaget — og
    // saa ser et element, der er faldet paa gulvet, ud som et element, der
    // ligger og venter hos Meta.
    if (sidste.status === 'AFVENTER DATO') {
      ADVAR(e.element, `${e.kanal}: forfaldt ${dk(forfald)} — passeret for ${dageSiden} dag(e) siden, og intet er afleveret til platformen. Manuel publicering eller bekraeftelse mangler.`);
      continue;
    }

    // "PLANLAGT" saettes kun, naar Meta har kvitteret for at holde opslaget.
    // "PLANLAGT MANUELT" betyder, at nogen har lagt det i platformens egen
    // planlaegger. Ordlyden foelger derfor status, ikke metode.
    const hvor = sidste.status === 'PLANLAGT' ? 'hos Meta' : 'i platformens brugerflade';
    if (dageSiden > PAAMIND_DAGE) {
      // Se PAAMIND_DAGE. Platformen udgiver selv, og efter en uge er en
      // paamindelse blevet stoej. Antagelsen skrives som en antagelse.
      INFO(e.element, `${e.kanal}: planlagt ${hvor} til ${dk(forfald)} — ${dageSiden} dage siden. `
        + 'Antages udgivet af platformen; vagthunden kan ikke bekraefte det. '
        + 'Skal det staa som publiceret, skriv en raekke med status PUBLICERET og post_id.');
      continue;
    }
    ADVAR(e.element, `${e.kanal}: planlagt ${hvor} til ${dk(forfald)} — passeret for ${dageSiden} dag(e) siden. Bekraeft selv at opslaget er gaaet ud.`);
  }

  // ── OPSLAG, DER LIGGER HOS META UDEN AT NOGEN VIL DEM ───────────────────
  //
  // Meta HOLDER et planlagt opslag og udgiver det selv paa dagen. Bliver et
  // element tilbagekaldt eller sat paa pause, EFTER det er afleveret, sker
  // der ingenting her i repoet: laasefilen flyttes til laase-tilbagekaldt/,
  // koeposten faar laasefil: null — og opslaget gaar alligevel ud hos Meta.
  //
  // Motoren kan ikke forhindre det. Den kan kun sige det, og sige det med
  // post_id'et, saa opslaget kan findes og annulleres. Se
  // dokumentation/annuller-hos-meta.md.
  //
  // Dette er den ene fejl, hvor vagthunden er det eneste vaern: alle andre
  // spaerrer virker FOER afsendelsen, og denne ligger efter.
  for (const [el, r] of (() => {
    const sidst = new Map();
    for (const x of register) sidst.set(x.element, x);
    return [...sidst];
  })()) {
    if (r.status !== 'PLANLAGT') continue;
    const k = koe.find((e) => e.element === el);

    // Uden graensen nedenfor ville en oprydning i gamle laasefiler give alarm
    // om opslag, der gik ud for uger siden. Da er det «bekraeft selv»-
    // paamindelsen laengere oppe, der gaelder.
    // Tidspunktet kan komme tre steder fra, og de har hver sit format:
    // koeens ISO-streng, registrets planlagt_til i SEKUNDER, eller raekkens
    // eget tidsstempel. «r.planlagt_til * 1000 ?? ...» ville ikke virke:
    // undefined * 1000 er NaN, og ?? fanger kun null og undefined.
    const naar = k?.tidspunkt ? new Date(k.tidspunkt)
      : Number.isFinite(r.planlagt_til) ? new Date(r.planlagt_til * 1000)
      : new Date(r.tidspunkt);
    if (Number.isNaN(naar.getTime())) {
      FEJL(el, `${k?.kanal ?? r.kanal}: staar som PLANLAGT hos Meta, men intet laeseligt tidspunkt. Se efter i haanden.`);
      continue;
    }
    // Kun mens opslaget STADIG ligger og venter. Er datoen passeret, har Meta
    // allerede udgivet det, og saa er der intet at annullere.
    if (!(naar > NU)) continue;
    const laas = `publicering/laase/element-${String(el).padStart(2, '0')}.json`;
    const grunde = [];
    if (!k) grunde.push('elementet staar ikke laengere i koeen');
    else {
      if (k.tilbagekaldt) grunde.push(`koeen siger tilbagekaldt (${k.tilbagekaldt.dato ?? 'uden dato'})`);
      if (k.metode !== 'motor') grunde.push(`koeen siger metode «${k.metode}»`);
      if (!k.laasefil) grunde.push('koeposten har ingen laasefil');
    }
    if (!existsSync(laas)) grunde.push(`laasefilen ${laas} findes ikke`);
    if (grunde.length) {
      FEJL(el, `${k?.kanal ?? r.kanal}: opslaget LIGGER HOS META som planlagt (${r.post_id ?? 'uden post_id'}) `
        + `og gaar ud ${dk(naar)}, men ${grunde.join('; ')}. `
        + 'Meta udgiver det selv — annullér det hos Meta, hvis det ikke skal ud.');
    }
  }

  // ── KOERER DE PLANLAGTE KOERSLER OVERHOVEDET? ───────────────────────────
  //
  // Den blinde vinkel indtil nu. Vagthunden kontrollerede, om opslagene var
  // kommet ud — men ikke om MASKINEN, der skal sende dem, stadig koerer.
  // Standsede cron, ville den foerst melde noget, naar et opslag var faldet
  // igennem, og da er det for sent.
  //
  // Maalt 27/10-01/11 koerte Instagram-sporet reelt hver 3.-6. time, selv om
  // cron siger hvert kvarter. GitHubs cron er «best effort». Graenserne
  // herunder er derfor rummelige: de skal fange en koersel, der er STANDSET,
  // ikke en der er forsinket.
  //
  // FEJL-graensen er sat efter, hvad der faktisk kan gaa tabt. Med et
  // publiceringsvindue paa et doegn betyder et hul paa over et doegn, at et
  // godkendt opslag kan falde helt igennem. Det er en rigtig driftsfejl.
  //
  // Kraever GITHUB_TOKEN og actions: read. Koeres vagthunden lokalt, findes
  // de ikke, og kontrollen springes over og siger det.
  const KOERSLER = [
    ['publicer-instagram-planlagt.yml', 8, 24, 'Instagram-publiceringen'],
    ['publicer-linkedin-planlagt.yml', 8, 24, 'LinkedIn-publiceringen'],
    ['publicer-google-planlagt.yml', 8, 24, 'Google-publiceringen'],
    ['planlaeg-alle.yml', 12, 36, 'Facebook-planlaegningen (cron hver 6. time)'],
    ['genopbyg-planlagt.yml', 30, 50, 'Netlify-genopbygningen (cron én gang i doegnet)'],
  ];
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || udenNet) {
    K_INFO('Actions', udenNet
      ? 'koerselskontrol sprunget over (--uden-net)'
      : 'koerselskontrol sprunget over: GITHUB_TOKEN eller GITHUB_REPOSITORY mangler (lokal koersel)');
  } else {
    for (const [fil, advarTimer, fejlTimer, hvad] of KOERSLER) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/actions/workflows/${fil}/runs?per_page=1&status=completed`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
        if (!r.ok) { K_ADVAR('Actions', `${fil}: GitHub svarede ${r.status}. Kunne ikke kontrolleres.`); continue; }
        const k = (await r.json()).workflow_runs ?? [];
        if (!k.length) { K_ADVAR('Actions', `${fil}: ingen gennemfoerte koersler fundet.`); continue; }
        const sidst = new Date(k[0].created_at);
        const timer = (NU - sidst) / 3600000;
        const linje = `${hvad} koerte sidst ${dk(sidst)} — for ${varighed(timer * 3600)} siden`;
        if (timer > fejlTimer) {
          K_FEJL('Actions', `${linje}. Graensen er ${fejlTimer} timer. `
            + 'Koerslen er standset, og et godkendt opslag kan falde igennem. '
            + `Se https://github.com/${repo}/actions/workflows/${fil}`);
        } else if (timer > advarTimer) {
          K_ADVAR('Actions', `${linje}. Mere end ${advarTimer} timer. GitHubs cron er upaalidelig — se dokumentation/paalidelig-udloeser.md.`);
        } else {
          K_INFO('Actions', linje);
        }
      } catch (err) {
        K_ADVAR('Actions', `${fil}: kunne ikke kontrolleres (${err.message}).`);
      }
    }

    // ── VIRKER DEN PAALIDELIGE UDLOESER? ──────────────────────────────────
    //
    // netlify/functions/udloes-publicering.mjs starter publiceringen paa det
    // godkendte tidspunkt gennem repository_dispatch. Uden
    // GITHUB_DISPATCH_TOKEN i Netlify goer den ingenting — og den siger det
    // kun i Netlifys egen log, som ingen laeser.
    //
    // Foer kunne det kun ses indirekte: var der ingen repository_dispatch i
    // historikken, var udloeseren formentlig doed. Men det kunne lige saa vel
    // betyde, at der intet havde vaeret forfaldent. De to kunne ikke skilles
    // ad, og i november var der intet forfaldent i fjorten dage.
    //
    // Derfor livstegnet: udloeseren sender «udloeser-hjerteslag» én gang i
    // timen, naar den alligevel ikke har andet at lave, og
    // udloeser-hjerteslag.yml tager imod. En manglende koersel er nu et
    // entydigt tegn paa, at kaeden Netlify → token → GitHub er brudt.
    //
    // Graenserne: livstegnet kommer hver time. 4 timer er rigeligt til
    // Netlifys egen jitter, og 12 timer betyder, at et opslag i morgen tidlig
    // vil gaa ud for sent.
    try {
      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/udloeser-hjerteslag.yml/runs?per_page=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      if (r.status === 404) {
        K_INFO('Udloeser', 'livstegnsworkflowet findes endnu ikke paa main. Kontrollen begynder at virke, naar det er merget og Netlify har deployet.');
      } else if (!r.ok) {
        K_ADVAR('Udloeser', `GitHub svarede ${r.status}. Livstegnet kunne ikke kontrolleres.`);
      } else {
        // Kun livstegn FRA NETLIFY taeller. Et livstegn sendt i haanden under
        // fejlsoegning ser ellers ud som en fungerende udloeser — og det
        // skete 2. november, da GitHub-halvdelen af kaeden blev afproevet.
        const alle = (await r.json()).workflow_runs ?? [];
        const k = alle.filter((x) => /fra netlify/i.test(x.display_title ?? x.name ?? ''));
        if (alle.length && !k.length) {
          K_ADVAR('Udloeser', `der er ${alle.length} livstegn, men ingen FRA NETLIFY — `
            + `det seneste er «${alle[0].display_title ?? alle[0].name}». `
            + 'Kaeden Netlify → token → GitHub er altsaa ikke bevist. '
            + 'Slaa aarsagen op paa https://kristiangg.dk/.netlify/functions/udloeser-status');
        } else if (!k.length) {
          K_ADVAR('Udloeser', 'der er endnu aldrig kommet et livstegn. '
            + 'Enten er Netlify ikke deployet siden livstegnet blev tilfoejet, eller ogsaa naar udloeseren ikke GitHub. '
            + 'Slaa det op paa https://kristiangg.dk/.netlify/functions/udloeser-status');
        } else {
          const sidst = new Date(k[0].created_at);
          const timer = (NU - sidst) / 3600000;
          const linje = `sidste livstegn ${dk(sidst)} — for ${varighed(timer * 3600)} siden`;
          if (timer > 12) {
            K_FEJL('Udloeser', `${linje}. Livstegnet kommer hver time, saa kaeden Netlify → token → GitHub er brudt. `
              + 'Godkendte opslag gaar nu kun ud, naar GitHubs cron finder tid — maalt 3-10 timer for sent. '
              + 'Slaa aarsagen op paa https://kristiangg.dk/.netlify/functions/udloeser-status');
          } else if (timer > 4) {
            K_ADVAR('Udloeser', `${linje}. Livstegnet kommer normalt hver time.`);
          } else {
            K_INFO('Udloeser', linje);
          }
        }
      }
    } catch (err) {
      K_ADVAR('Udloeser', `livstegnet kunne ikke kontrolleres (${err.message}).`);
    }
  }

  // ── ER SIDEN OVERHOVEDET BYGGET? ────────────────────────────────────────
  //
  // Den anden blinde vinkel. genopbyg-planlagt.yml kalder Netlifys build
  // hook og melder groent, saa snart Netlify svarer 2xx. Men 2xx betyder kun
  // «kaldet er modtaget». Er produktionsbyg standset — fx fordi kontoens
  // credits er brugt op, som 2. november 2026 — svarer hooken stadig 2xx,
  // bygget sker aldrig, og workflowet er groent, mens siden staar stille.
  //
  // Det rammer ikke kun udseendet. Kanalen «website» publicerer ved at lade
  // Hugo bygge et fremtidsdateret indlaeg. Bygger Netlify ikke, udkommer
  // indlaegget ikke, uanset hvad registret siger.
  //
  // /byg.json skrives af layouts/index.byg.json ved hvert byg og baerer
  // byggetidspunkt og commit. Her sammenlignes det med main.
  if (udenNet) {
    K_INFO('Netlify', 'byggekontrol sprunget over (--uden-net)');
  } else {
    const GRAENSE_TIMER = 30;        // genopbygningen koerer én gang i doegnet
    const COMMIT_NAADE_TIMER = 3;    // et deploy maa gerne vaere et par timer undervejs
    // Tre forsoeg. Et enkelt netvaerksblip fra en runner maa ikke vaekke
    // nogen — men svarer sitet slet ikke tre gange i traek, ER det nede, og
    // saa er det netop dét, en vagthund er til for.
    let r = null;
    let sidsteFejl = null;
    for (let forsoeg = 1; forsoeg <= 3; forsoeg++) {
      try {
        r = await fetch('https://kristiangg.dk/byg.json', { headers: { 'Cache-Control': 'no-cache' } });
        break;
      } catch (err) {
        sidsteFejl = err;
        r = null;
        if (forsoeg < 3) await new Promise((k) => setTimeout(k, forsoeg * 2000));
      }
    }
    try {
      if (!r) {
        K_FEJL('Netlify', `kristiangg.dk svarede ikke paa tre forsoeg (${sidsteFejl?.message ?? 'ukendt fejl'}). `
          + 'Sitet kan vaere nede. Se https://app.netlify.com/ og kontroller, at domaenet svarer.');
      } else if (r.status === 404) {
        K_INFO('Netlify', 'byggemaerket /byg.json er endnu ikke deployet. Kontrollen begynder at virke efter naeste byg.');
      } else if (!r.ok) {
        K_ADVAR('Netlify', `/byg.json svarede ${r.status}. Byggetidspunktet kunne ikke kontrolleres.`);
      } else {
        const b = await r.json();
        const bygget = new Date(b.bygget);
        if (Number.isNaN(bygget.getTime())) {
          K_ADVAR('Netlify', `/byg.json har et ulaeseligt byggetidspunkt: ${String(b.bygget)}`);
        } else {
          const timer = (NU - bygget) / 3600000;
          const linje = `sitet blev sidst bygget ${dk(bygget)} — for ${varighed(timer * 3600)} siden`;
          if (timer > GRAENSE_TIMER) {
            K_FEJL('Netlify', `${linje}. Graensen er ${GRAENSE_TIMER} timer. `
              + 'Netlify bygger ikke laengere, selv om build hooken svarer. '
              + 'Et fremtidsdateret indlaeg paa kanalen «website» vil ikke udkomme. '
              + 'Se efter, om kontoens credits er brugt op: https://app.netlify.com/');
          } else {
            K_INFO('Netlify', linje);
          }

          // Er det den rigtige udgave, der er i luften?
          const hoved = process.env.GITHUB_SHA;
          if (hoved && b.commit && b.commit !== hoved) {
            // Hvor gammelt er main-hovedet? Er det nyt, er et deploy bare
            // undervejs, og det er ikke noget at raabe op om.
            let hovedAlder = null;
            if (token && repo) {
              try {
                const c = await fetch(`https://api.github.com/repos/${repo}/commits/${hoved}`,
                  { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
                if (c.ok) {
                  const d = await c.json();
                  const tid = d?.commit?.committer?.date;
                  if (tid) hovedAlder = (NU - new Date(tid)) / 3600000;
                }
              } catch (err) { /* uden alder meldes der ikke FEJL */ }
            }
            const kort = (x) => String(x).slice(0, 7);
            if (hovedAlder !== null && hovedAlder > COMMIT_NAADE_TIMER) {
              K_FEJL('Netlify', `produktionen koerer ${kort(b.commit)}, men main staar paa ${kort(hoved)}, `
                + `som blev lagt for ${varighed(hovedAlder * 3600)} siden. Deployet er ikke sket. `
                + 'Se efter, om produktionsbyg er sat paa pause: https://app.netlify.com/');
            } else {
              K_INFO('Netlify', `produktionen koerer ${kort(b.commit)}, main staar paa ${kort(hoved)} — et deploy er formentlig undervejs`);
            }
          } else if (b.commit && hoved) {
            K_INFO('Netlify', `produktionen koerer den samme commit som main (${String(hoved).slice(0, 7)})`);
          }
        }
      }
    } catch (err) {
      K_ADVAR('Netlify', `byggekontrollen kunne ikke gennemfoeres: ${err.message}`);
    }
  }

  // ── LinkedIn-tokenets udloeb ────────────────────────────────────────────
  // Tokenet lever omkring 60 dage. Loeber det ud, stopper LinkedIn-kanalen
  // uden at noget andet fejler - derfor varsles der i god tid.
  //
  // Filen baerer ingen hemmelighed, kun datoen og hvem tokenet tilhoerer.
  // Findes den ikke, er der aldrig fornyet, og saa er der intet at varsle om.
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    const STI = 'publicering/linkedin-token.json';
    if (existsSync(STI)) {
      const t = JSON.parse(readFileSync(STI, 'utf8'));
      const tilbage = dage(new Date(t.udloeber) - NU);
      const hvor = 'Forny paa https://kristiangg.dk/oauth/linkedin/';
      if (tilbage <= 0) {
        K_FEJL('LinkedIn', `tokenet udloeb ${dk(new Date(t.udloeber))}. Kanalen kan ikke publicere. ${hvor}`);
      } else if (tilbage <= 14) {
        // FEJL, ikke advarsel. Alarmkanalen er jobbets exit-kode: en advarsel
        // staar kun i en log, ingen aabner, saa foerste rigtige besked kom
        // tre dage foer udloebet. Tokenet udloeber 31-12, og tre dage foer er
        // mellem jul og nytaar. Fjorten dage er ogsaa den graense,
        // kontroller-linkedin-adgang.mjs allerede regner som en fejl.
        K_FEJL('LinkedIn', `tokenet udloeber om ${tilbage} dag(e). Forny nu. ${hvor}`);
      } else {
        K_INFO('LinkedIn', `token gyldigt ${tilbage} dage endnu (${t.urn})`);
      }
      if (t.har_refresh_token === false) {
        K_INFO('LinkedIn', 'appen har ingen programmatisk fornyelse — fornyelsen er manuel');
      }
    }
  } catch (err) {
    K_FEJL('LinkedIn', `kunne ikke laese tokenets udloeb: ${err.message}`);
  }

  // ── Google-adgangen ─────────────────────────────────────────────────────
  // Refresh tokenet har normalt ingen udloebsdato. Staar appen i "Testing",
  // udloeber det efter 7 dage, og saa siger Google det ved udstedelsen.
  // Filen baerer ingen hemmelighed og intet fuldt id.
  try {
    const STI = 'publicering/google-token.json';
    const hvor = 'Se dokumentation/google-business-profile.md, afsnittet om fornyelse.';
    const kommendeGbp = koe.filter((e) => e.kanal === 'gbp' && new Date(e.tidspunkt) > NU);
    const motorGbp = kommendeGbp.filter((e) => e.metode === 'motor');
    if (!existsSync(STI)) {
      // Tavshed her var selv en fejl: kanalen saa rask ud, fordi INTET
      // gbp-element stod som «motor». Men det planlagte workflow koerer 48
      // gange i doegnet og udfoerer intet, og hvert kommende Google-opslag
      // skal altsaa laegges op i haanden. Det skal staa i klartekst.
      if (motorGbp.length) {
        K_FEJL('Google', `${motorGbp.length} kommende element(er) skal publiceres af motoren, men adgangen er aldrig autoriseret. ${hvor}`);
      } else if (kommendeGbp.length) {
        K_ADVAR('Google', `adgangen er aldrig autoriseret (ingen google-token.json). `
          + `${kommendeGbp.length} kommende gbp-element(er) staar som «manuel» og skal laegges op i haanden: `
          + kommendeGbp.map((e) => `${e.element} (${String(e.tidspunkt).slice(0, 10)})`).join(', ')
          + `. ${hvor}`);
      } else {
        K_INFO('Google', `adgangen er ikke autoriseret, og der er ingen kommende gbp-elementer.`);
      }
    } else {
      const t = JSON.parse(readFileSync(STI, 'utf8'));
      if (t.refresh_tidsbegraenset && t.refresh_udloeber) {
        const tilbage = dage(new Date(t.refresh_udloeber) - NU);
        const m = `adgangen er tidsbegraenset (appen staar formentlig i "Testing")`;
        if (tilbage <= 0) K_FEJL('Google', `${m} og udloeb ${dk(new Date(t.refresh_udloeber))}. Kanalen kan ikke publicere. ${hvor}`);
        else if (tilbage <= 3) K_FEJL('Google', `${m} og udloeber om ${tilbage} dag(e). ${hvor}`);
        else K_ADVAR('Google', `${m} og udloeber om ${tilbage} dage. ${hvor}`);
      } else {
        K_INFO('Google', `adgang autoriseret ${String(t.fornyet).slice(0, 10)}, uden udloebsdato (${t.titel ?? t.lokation})`);
      }
    }
  } catch (err) {
    K_FEJL('Google', `kunne ikke laese adgangens metadata: ${err.message}`);
  }

  // ── Maskinlaesbart udtraek ───────────────────────────────────────────────
  //
  // Vagthunden er systemets kvalitetskontrol, ikke endnu en projektleder.
  // Den skal derfor kunne AFLEVERE sine fund til det faelles opgaveregister
  // frem for at skrive endnu en liste, nogen selv skal laese og handle paa.
  //
  // --json skriver fundene ud, som de er, uden prosaen. Formen er stabil, og
  // synkroniser-drift.mjs oversaetter dem til opgaver med faste id'er, saa
  // den samme mangel aldrig bliver til to opgaver.
  if (jsonTilstand) {
    const del = (linje) => {
      // «omraade  resten» eller «element NN  resten»
      const m = /^(element\s+\d+|\S+)\s{2,}([\s\S]*)$/.exec(linje);
      return m ? { omraade: m[1].trim(), tekst: m[2].trim() } : { omraade: '?', tekst: linje.trim() };
    };
    rigtigLog(JSON.stringify({
      tid: NU.toISOString(),
      fejl: fejl.map(del),
      bekraeft_selv: advarsler.map(del),
      i_orden: info.map(del),
      dom: fejl.length ? 'FEJL' : advarsler.length ? 'BEKRAEFT SELV' : 'ALT STEMMER',
    }, null, 2));
    process.exit(fejl.length ? 1 : 0);
  }

  const skriv = (titel, liste) => {
    if (!liste.length) return;
    console.log(`── ${titel} ──`);
    for (const l of liste) console.log(`  ${l}`);
    console.log('');
  };
  skriv('FEJL', fejl);
  skriv('BEKRAEFT SELV', advarsler);
  skriv('i orden', info);

  if (fejl.length) {
    console.log(`VAGTHUND: ${fejl.length} FEJL. Se ovenfor.`);
    process.exit(1);
  }
  console.log(advarsler.length
    ? `VAGTHUND: ingen fejl. ${advarsler.length} ting du selv skal bekraefte.`
    : 'VAGTHUND: alt stemmer.');
  process.exit(0);
}

main().catch((err) => { console.error('UVENTET FEJL:', err.message); process.exit(1); });

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
import { MAKS_FORSINKELSE_S, varighed } from './krav.mjs';

const KOE = 'publicering/koe.json';
const REGISTER = 'publicering/register.json';

const args = process.argv.slice(2);
const udenNet = args.includes('--uden-net');
const nuArg = args.indexOf('--nu');
const NU = nuArg !== -1 ? new Date(args[nuArg + 1]) : new Date();

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

    if (sidste.status === UVIST) {
      FEJL(e.element, `${e.kanal}: «${UVIST}» — kravet blev taget ${dk(new Date(sidste.tidspunkt))}, men koerslen meldte aldrig tilbage. `
        + 'Opslaget kan vaere gaaet ud. Se efter paa platformen, og skriv udfaldet i registret, FOER der proeves igen.');
      continue;
    }
    if (sidste.status === FOR_SENT) {
      FEJL(e.element, `${e.kanal}: stoppet, fordi det forfaldt ${dk(forfald)} og var over en time gammelt. `
        + 'Opslaget er IKKE gaaet ud. Publicér det i haanden, eller godkend et nyt tidspunkt.');
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
    ADVAR(e.element, `${e.kanal}: planlagt ${hvor} til ${dk(forfald)} — passeret for ${dageSiden} dag(e) siden. Bekraeft selv at opslaget er gaaet ud.`);
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

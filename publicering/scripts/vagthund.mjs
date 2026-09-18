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

/** Statusser der betyder "elementet er afsendt eller undervejs". */
const AFSENDT = ['PUBLICERET', 'PLANLAGT', 'PLANLAGT MANUELT', 'AFVENTER DATO'];
const FEJLEDE = ['PUBLICERING FEJLET', 'PLANLAEGNING FEJLET'];

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

    // Facebook, Google og LinkedIn holder selv opslaget. Motoren kan ikke se
    // ind i dem herfra, saa dette kan ikke bevises — kun paamindes om.
    //
    // Instagram er en undtagelse: Meta holder IKKE et Instagram-opslag for os.
    // Der er ingen scheduled_publish_time, saa motoren publicerer selv paa
    // tidspunktet. Staar et forfaldent Instagram-element uden resultat, ligger
    // det altsaa ingen steder og venter — den planlagte koersel har svigtet.
    if (e.kanal === 'instagram') {
      // Her kan vi faktisk bevise noget. Havde koerslen gjort sit arbejde,
      // stod der en raekke i registret. Den planlagte koersel gaar hver halve
      // time, saa vi giver en times naade for forsinkelse hos GitHub.
      const NAADE_MS = 60 * 60 * 1000;
      if (NU - forfald > NAADE_MS) {
        FEJL(e.element, `instagram: forfaldt ${dk(forfald)} og er hverken publiceret eller fejlregistreret. Den planlagte koersel har ikke gjort sit arbejde.`);
      } else {
        ADVAR(e.element, `instagram: forfaldt ${dk(forfald)} for nylig — den planlagte koersel har endnu ikke meldt tilbage. Se efter igen om lidt.`);
      }
      continue;
    }

    const hvor = e.metode === 'motor' ? 'hos Meta' : 'i platformens brugerflade';
    ADVAR(e.element, `${e.kanal}: planlagt ${hvor} til ${dk(forfald)} — passeret for ${dageSiden} dag(e) siden. Bekraeft selv at opslaget er gaaet ud.`);
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

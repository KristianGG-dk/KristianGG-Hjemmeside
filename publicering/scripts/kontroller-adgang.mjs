// Ikke-publicerende kontrol af Meta-adgangen.
//
// Svarer paa disse spoergsmaal uden at skrive noget som helst paa Facebook:
//   1. Hvilken identitet baerer tokenet, og hvilken type er det?
//   2. Udloeber det — og hvornaar?
//   3. Hvilke scopes har det, og gaelder de den rigtige side?
//   4. Hvilke opgaver (tasks) har systembrugeren paa siden?
//   5. Hvad baerer det udledte side-token af scopes?
//   6. Kan det aflaese sidens opslag?
//
// HVAD DER ER EN FEJL, OG HVAD DER BLOT SKAL BEMAERKES
// Motoren poster til /{side}/photos og /{side}/feed. Det kraever
// pages_manage_posts, pages_read_engagement og opgaven CREATE_CONTENT paa
// siden. Mangler noget af det, er det FEJL. At LAESE sidens feed kraever
// derimod en opgave mere (MODERATE eller MANAGE), og motoren laeser aldrig
// feedet. Fejler laesningen alene af den grund, meldes det som OBS, ikke
// som FEJL — ellers stopper kontrollen paa noget, motoren ikke bruger.
//
// Der sendes udelukkende GET. Intet POST, intet opslag, ingen aendring.
//
// Kraever i miljoeet:
//   FB_PAGE_ID       sidens numeriske id
//   FB_PAGE_TOKEN    tokenet der skal proeves
// Valgfrit, giver en fyldigere tokenrapport:
//   FB_APP_ID, FB_APP_SECRET
//
// Tokenet skrives ALDRIG ud. Alle URL'er skrubbes foer de logges, saa et
// token ikke kan slippe ud gennem en fejlbesked.

const GRAPH = 'https://graph.facebook.com/v21.0';

// Scopes motoren skal bruge for at poste. Se forklaringen oeverst.
const KRAEVEDE = ['pages_read_engagement', 'pages_manage_posts'];

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;

// Det udledte side-token er ogsaa en hemmelighed. Det deklareres her frem for
// inde i main(), saa skrub() kan naa det: kaldet der inspicerer det sender det
// som input_token, og en fejl derfra ville ellers baere det med ud i loggen.
let sideToken = null;

let fejl = 0;
let obs = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
const advar = (m) => { console.log(`  OBS   ${m}`); obs++; };
const info = (m) => console.log(`  ·     ${m}`);

/** Fjerner alt der ligner et token fra en tekst, foer den logges. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [TOKEN, APP_SECRET, sideToken].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(access_token=)[^&\s"']+/gi, '$1«udeladt»');
}

async function hentMed(token, sti, params = {}) {
  const u = new URL(`${GRAPH}/${sti}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  let r, svar;
  try {
    r = await fetch(u);
    svar = await r.json();
  } catch (err) {
    throw new Error(`netvaerksfejl mod ${sti}: ${skrub(err.message)}`);
  }
  if (!r.ok || svar.error) {
    const e = svar.error ?? {};
    const fejlen = new Error(
      `${sti} → ${r.status} ${skrub(e.message ?? JSON.stringify(svar))}` +
      (e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '')
    );
    fejlen.kode = e.code ?? null;
    throw fejlen;
  }
  return svar;
}

const hent = (sti, params) => hentMed(TOKEN, sti, params);

/** Inspicerer et token med debug_token. GET. Returnerer Metas data-felt. */
async function inspicer(inputToken) {
  const inspektoer = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : inputToken;
  const u = new URL(`${GRAPH}/debug_token`);
  u.searchParams.set('input_token', inputToken);
  u.searchParams.set('access_token', inspektoer);
  const svar = await (await fetch(u)).json();
  if (svar.error) throw new Error(skrub(svar.error.message));
  return svar.data ?? {};
}

/** Skriver om en rettighed gaelder netop vores side, ud fra granulaere scopes. */
function tjekGranulaer(d, kraevede, udfald) {
  for (const s of kraevede) {
    const g = (d.granular_scopes ?? []).find((x) => x.scope === s);
    if (!g) continue;
    const ids = g.target_ids;
    if (!ids) { info(`${s}: gaelder alle aktiver`); continue; }
    ids.includes(PAGE_ID)
      ? ok(`${s} gaelder side ${PAGE_ID}`)
      : udfald(`${s} gaelder IKKE side ${PAGE_ID} — kun ${ids.join(', ')}`);
  }
}

function tid(sekunder) {
  if (sekunder === 0 || sekunder === undefined || sekunder === null) return 'udloeber aldrig';
  const d = new Date(sekunder * 1000);
  const dage = Math.round((d - Date.now()) / 86400000);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC (om ca. ${dage} dage)`;
}

async function main() {
  const mangler = ['FB_PAGE_ID', 'FB_PAGE_TOKEN'].filter((k) => !process.env[k]);
  if (mangler.length) {
    console.error(`Mangler i miljoeet: ${mangler.join(', ')}. Kontrol ikke mulig.`);
    process.exit(1);
  }
  console.log(`Kontrollerer adgang til side ${PAGE_ID}. Kun GET — intet publiceres.`);
  console.log(`Tokenets laengde: ${TOKEN.length} tegn. Vaerdien logges ikke.\n`);

  // 1. Hvem er vi
  console.log('── identitet ──');
  try {
    const me = await hent('me', { fields: 'id,name' });
    ok(`tokenet tilhoerer «${me.name}» (id ${me.id})`);
  } catch (err) {
    nej(err.message);
  }

  // 2. Tokenets type, udloeb og scopes
  console.log('\n── tokenet ──');
  try {
    const d = await inspicer(TOKEN);

    d.type ? ok(`type: ${d.type}`) : nej('ingen type oplyst');
    d.is_valid ? ok('tokenet er gyldigt') : nej('tokenet er IKKE gyldigt');
    info(`udloeb: ${tid(d.expires_at)}`);
    if (d.data_access_expires_at !== undefined) {
      info(`dataadgang udloeber: ${tid(d.data_access_expires_at)}`);
    }

    // Motoren udleder et side-token med GET /{side}?fields=access_token og
    // sender POST til /{side}/photos eller /{side}/feed. Det kraever disse to.
    // pages_show_list bruges kun af /me/accounts, som motoren ikke kalder —
    // den blev tidligere krævet her og gav en falsk alarm.
    const kraevede = KRAEVEDE;
    const valgfrie = ['pages_show_list', 'pages_manage_metadata'];
    const scopes = d.scopes ?? [];
    info(`scopes: ${scopes.join(', ') || '(ingen)'}`);
    for (const s of kraevede) {
      scopes.includes(s) ? ok(`scope ${s}`) : nej(`scope mangler: ${s}`);
    }
    for (const s of valgfrie) {
      info(`scope ${s}: ${scopes.includes(s) ? 'til stede' : 'ikke til stede — bruges ikke af motoren'}`);
    }

    // Granulaere scopes afsloerer, om rettigheden gaelder netop denne side.
    tjekGranulaer(d, kraevede, nej);
  } catch (err) {
    nej(`kunne ikke inspicere tokenet: ${err.message}`);
  }

  // 3. Kan vi se siden — og kan vi udlede et side-token af den
  console.log('\n── siden ──');
  try {
    const side = await hent(PAGE_ID, { fields: 'id,name,category,access_token' });
    side.id === PAGE_ID ? ok(`side-id bekraeftet: ${side.id}`) : nej(`forkert id: ${side.id}`);
    ok(`sidens navn: «${side.name}»${side.category ? ` (${side.category})` : ''}`);
    if (side.access_token) {
      sideToken = side.access_token;
      ok('et side-token kan udledes af dette token');
    } else {
      info('intet side-token i svaret — tokenet er formentlig selv et side-token');
    }
  } catch (err) {
    nej(err.message);
  }

  // 4. Sidetildelingen: hvilke opgaver har systembrugeren paa siden?
  // /me/accounts med system user-tokenet viser hver tildelt side med dens
  // tasks. Det er Metas eget svar paa, hvad tildelingen i Business Manager
  // faktisk giver. Kraever pages_show_list. Kun GET.
  console.log('\n── sidetildeling ──');
  let opgaver = null;
  try {
    const konti = await hent('me/accounts', { fields: 'id,name,tasks', limit: '100' });
    const side = (konti.data ?? []).find((x) => x.id === PAGE_ID);
    if (!side) {
      nej(`side ${PAGE_ID} er ikke blandt de ${konti.data?.length ?? 0} sider, systembrugeren er tildelt`);
    } else {
      opgaver = side.tasks ?? [];
      info(`opgaver paa siden: ${opgaver.join(', ') || '(ingen)'}`);
      opgaver.includes('CREATE_CONTENT')
        ? ok('CREATE_CONTENT — systembrugeren maa oprette opslag (kraeves af motoren)')
        : nej('CREATE_CONTENT mangler — systembrugeren maa ikke oprette opslag paa siden');
      const kanLaese = opgaver.includes('MODERATE') || opgaver.includes('MANAGE');
      info(`MODERATE/MANAGE: ${kanLaese ? 'til stede' : 'ikke til stede'} — kraeves kun for at LAESE sidens feed`);
    }
  } catch (err) {
    info(`kunne ikke aflaese sidetildelingen: ${err.message}`);
    info('(er FB_PAGE_TOKEN selv et side-token, svarer /me/accounts ikke)');
  }

  // 5. Det udledte side-token: type, udloeb OG scopes. Det er DETTE token,
  // motoren poster med, saa det er dets rettigheder, der afgoer sagen.
  if (sideToken) {
    console.log('\n── det udledte side-token ──');
    try {
      const d = await inspicer(sideToken);
      info(`type: ${d.type ?? 'ukendt'}`);
      d.is_valid ? ok('side-tokenet er gyldigt') : nej('side-tokenet er IKKE gyldigt');
      info(`udloeb: ${tid(d.expires_at)}`);
      d.expires_at === 0
        ? ok('det udledte side-token udloeber ikke — egnet til CI')
        : info('det udledte side-token har et udloeb — se ovenfor');
      const scopes = d.scopes ?? [];
      info(`scopes: ${scopes.join(', ') || '(ingen)'}`);
      for (const s of KRAEVEDE) {
        scopes.includes(s) ? ok(`side-tokenet baerer ${s}`) : nej(`side-tokenet mangler ${s}`);
      }
      tjekGranulaer(d, KRAEVEDE, nej);
    } catch (err) {
      nej(`kunne ikke inspicere det udledte side-token: ${err.message}`);
    }
  }

  // 6. Laeseadgang til opslag. Bekraefter reel adgang uden at skrive.
  console.log('\n── laeseadgang ──');
  // Et bruger-token kan ikke laese en sides feed. Det skal vaere side-tokenet.
  if (!sideToken) {
    info('intet side-token kunne udledes ovenfor — laeseadgang kan ikke proeves');
  } else {
    try {
      const feed = await hentMed(sideToken, `${PAGE_ID}/feed`, { limit: '1', fields: 'id,created_time' });
      const n = (feed.data ?? []).length;
      ok(`kan laese sidens opslag med side-tokenet (${n === 0 ? 'siden har ingen opslag endnu' : 'hentede 1 opslag'})`);
    } catch (err) {
      // Fejl #10 med scopes paa plads, CREATE_CONTENT til stede og uden
      // MODERATE/MANAGE er netop det tilfaelde, hvor kun LAESNING mangler.
      const kunLaesning = err.kode === 10 && opgaver
        && opgaver.includes('CREATE_CONTENT')
        && !opgaver.includes('MODERATE') && !opgaver.includes('MANAGE');
      if (kunLaesning) {
        advar(err.message);
        advar('Feedet kan ikke laeses, fordi systembrugeren ikke har MODERATE eller MANAGE');
        advar('paa siden. Motoren laeser aldrig feedet, og publicering kraever kun');
        advar('CREATE_CONTENT, som er til stede. Ikke en publiceringsfejl.');
      } else {
        nej(err.message);
      }
    }
  }

  console.log(fejl === 0
    ? `\nKONTROL: BESTAAET — token, side og rettigheder til publicering er paa plads${obs ? ` (${obs} OBS-linjer)` : ''}`
    : `\nKONTROL: ${fejl} FEJL — se ovenfor`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('UVENTET FEJL:', skrub(err.message));
  process.exit(1);
});

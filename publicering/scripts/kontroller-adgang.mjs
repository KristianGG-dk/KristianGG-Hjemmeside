// Ikke-publicerende kontrol af Meta-adgangen.
//
// Svarer paa fire spoergsmaal uden at skrive noget som helst paa Facebook:
//   1. Hvilken identitet baerer tokenet, og hvilken type er det?
//   2. Udloeber det — og hvornaar?
//   3. Hvilke scopes har det, og gaelder de den rigtige side?
//   4. Kan det se siden og aflaese dens opslag?
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

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;

// Det udledte side-token er ogsaa en hemmelighed. Det deklareres her frem for
// inde i main(), saa skrub() kan naa det: kaldet der inspicerer det sender det
// som input_token, og en fejl derfra ville ellers baere det med ud i loggen.
let sideToken = null;

let fejl = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const nej = (m) => { console.log(`  FEJL  ${m}`); fejl++; };
const info = (m) => console.log(`  ·     ${m}`);

/** Fjerner alt der ligner et token fra en tekst, foer den logges. */
function skrub(s) {
  let t = String(s);
  for (const hemmelig of [TOKEN, APP_SECRET, sideToken].filter(Boolean)) {
    t = t.split(hemmelig).join('«udeladt»');
  }
  return t.replace(/(access_token=)[^&\s"']+/gi, '$1«udeladt»');
}

async function hent(sti, params = {}) {
  const u = new URL(`${GRAPH}/${sti}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOKEN);
  let r, svar;
  try {
    r = await fetch(u);
    svar = await r.json();
  } catch (err) {
    throw new Error(`netvaerksfejl mod ${sti}: ${skrub(err.message)}`);
  }
  if (!r.ok || svar.error) {
    const e = svar.error ?? {};
    throw new Error(
      `${sti} → ${r.status} ${skrub(e.message ?? JSON.stringify(svar))}` +
      (e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : '')
    );
  }
  return svar;
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
    const inspektoer = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : TOKEN;
    const u = new URL(`${GRAPH}/debug_token`);
    u.searchParams.set('input_token', TOKEN);
    u.searchParams.set('access_token', inspektoer);
    const r = await fetch(u);
    const svar = await r.json();
    if (svar.error) throw new Error(skrub(svar.error.message));
    const d = svar.data ?? {};

    d.type ? ok(`type: ${d.type}`) : nej('ingen type oplyst');
    d.is_valid ? ok('tokenet er gyldigt') : nej('tokenet er IKKE gyldigt');
    info(`udloeb: ${tid(d.expires_at)}`);
    if (d.data_access_expires_at !== undefined) {
      info(`dataadgang udloeber: ${tid(d.data_access_expires_at)}`);
    }

    const kraevede = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
    const scopes = d.scopes ?? [];
    info(`scopes: ${scopes.join(', ') || '(ingen)'}`);
    for (const s of kraevede) {
      scopes.includes(s) ? ok(`scope ${s}`) : nej(`scope mangler: ${s}`);
    }

    // Granulaere scopes afsloerer, om rettigheden gaelder netop denne side.
    const gran = d.granular_scopes ?? [];
    if (gran.length) {
      for (const s of kraevede) {
        const g = gran.find((x) => x.scope === s);
        if (!g) continue;
        const ids = g.target_ids;
        if (!ids) { info(`${s}: gaelder alle aktiver`); continue; }
        ids.includes(PAGE_ID)
          ? ok(`${s} gaelder side ${PAGE_ID}`)
          : nej(`${s} gaelder IKKE side ${PAGE_ID} — kun ${ids.join(', ')}`);
      }
    }
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

  // 4. Laeseadgang til opslag. Bekraefter reel adgang uden at skrive.
  console.log('\n── laeseadgang ──');
  try {
    const feed = await hent(`${PAGE_ID}/feed`, { limit: '1', fields: 'id,created_time' });
    const n = (feed.data ?? []).length;
    ok(`kan laese sidens opslag (${n === 0 ? 'siden har ingen opslag endnu' : 'hentede 1 opslag'})`);
  } catch (err) {
    nej(err.message);
  }

  // 5. Hvis et side-token kunne udledes: hvad er DET for et token
  if (sideToken) {
    console.log('\n── det udledte side-token ──');
    try {
      const inspektoer = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : sideToken;
      const u = new URL(`${GRAPH}/debug_token`);
      u.searchParams.set('input_token', sideToken);
      u.searchParams.set('access_token', inspektoer);
      const svar = await (await fetch(u)).json();
      if (svar.error) throw new Error(skrub(svar.error.message));
      const d = svar.data ?? {};
      info(`type: ${d.type ?? 'ukendt'}`);
      info(`udloeb: ${tid(d.expires_at)}`);
      d.expires_at === 0
        ? ok('det udledte side-token udloeber ikke — egnet til CI')
        : info('det udledte side-token har et udloeb — se ovenfor');
    } catch (err) {
      nej(`kunne ikke inspicere det udledte side-token: ${err.message}`);
    }
  }

  console.log(fejl === 0
    ? '\nKONTROL: ALT BESTAAET — token, side og rettigheder er paa plads'
    : `\nKONTROL: ${fejl} FEJL — se ovenfor`);
  process.exit(fejl === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('UVENTET FEJL:', skrub(err.message));
  process.exit(1);
});

// Fase 1 — rene funktioner, delt af hent.mjs og proeverne.
// Udskilt her, fordi de kan afproeves uden netadgang. Alt der roerer
// netvaerket bliver i hent.mjs.

const tekst = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const felt = (blok, navn) => { const m = blok.match(new RegExp(`<${navn}[^>]*>([\\s\\S]*?)</${navn}>`, 'i')); return m ? tekst(m[1]) : null; };

// Datoer i fremtiden er fejl i kilden, ikke nyheder. Crossref meldte aar 2121
// i fase 0. De afvises frem for at blive brugt.
function gyldigDato(s) { const d = new Date(s); return !isNaN(d) && d <= new Date(Date.now() + 864e5) ? d : null; }

// ── adaptere pr. metode ────────────────────────────────────────────────────
const adapter = {
  rss(krop) {
    const poster = [...krop.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)].map((m) => m[0]);
    return poster.map((p) => {
      const link = felt(p, 'link') || (p.match(/<link[^>]+href=["']([^"']+)/i) || [])[1];
      return { titel: felt(p, 'title'), url: link,
        dato: gyldigDato(felt(p, 'pubDate') || felt(p, 'published') || felt(p, 'updated') || felt(p, 'dc:date')),
        resume: (felt(p, 'description') || felt(p, 'summary') || '').slice(0, 400) };
    });
  },
  'api-europepmc'(krop) {
    const d = JSON.parse(krop);
    return (d.resultList?.result || []).map((r) => ({
      titel: r.title, url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
      dato: gyldigDato(r.firstPublicationDate), resume: (r.abstractText || r.journalTitle || '').slice(0, 400),
      fagfaellebedoemt: r.pubType !== 'preprint' }));
  },
  'api-crossref'(krop) {
    const d = JSON.parse(krop);
    return (d.message?.items || []).map((r) => {
      const p = r.published?.['date-parts']?.[0];
      return { titel: Array.isArray(r.title) ? r.title[0] : r.title, url: r.URL || (r.DOI ? `https://doi.org/${r.DOI}` : null),
        dato: p ? gyldigDato(`${p[0]}-${String(p[1] || 1).padStart(2, '0')}-${String(p[2] || 1).padStart(2, '0')}`) : null,
        resume: (Array.isArray(r['container-title']) ? r['container-title'][0] : '') || '' };
    });
  },
  'api-medrxiv'(krop) {
    const d = JSON.parse(krop);
    return (d.collection || []).map((r) => ({ titel: r.title, url: r.doi ? `https://doi.org/${r.doi}` : null,
      dato: gyldigDato(r.date), resume: (r.abstract || '').slice(0, 400), fagfaellebedoemt: false }));
  },
  'api-folketinget'(krop) {
    const d = JSON.parse(krop);
    return (d.value || []).map((r) => ({ titel: r.titel || r.titelkort, url: `https://www.ft.dk/samling/${r.periodeid}/`,
      dato: gyldigDato(r.opdateringsdato), resume: (r.resume || '').slice(0, 400) }));
  },
};

// Danske bogstaver skrives paa to maader. En kilde kan skrive «fællesskab»
// eller «faellesskab», «søvn» eller «soevn». Begge former normaliseres til
// ae/oe/aa paa BEGGE sider, foer der sammenlignes — ellers afhaenger et
// match af, hvordan kilden staver.
export function normaliser(s) {
  return (s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe');
}

// Ordgraense, der kan taale danske bogstaver.
//
// JavaScripts \b bygger paa ASCII og opfoerer sig forkert omkring ae, oe og aa.
// Her bruges Unicode-bogstavklassen i stedet, med plads til op til tre
// boejningsbogstaver bagpaa: «stress» rammer «stressen», men IKKE «genterapi»
// for «terapi» — og det var praecis den fejl, der lukkede optogenetisk
// genterapi ind i demonstrationen.
function udtryk(ord) {
  const flugt = normaliser(ord).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
  return new RegExp(`(?<!\\p{L})${flugt}\\p{L}{0,3}(?!\\p{L})`, 'iu');
}

// To stavemaader af samme ord er ét begreb, ikke to. «arbejdsmiljoe» og
// «arbejdsmiljø» bliver samme udtryk efter normaliseringen, saa stod de
// begge i registret, taalte de begge med — og ét begreb alene opfyldte
// kravet om to generiske ord. De elleve dubletstavemaader er fjernet fra
// registret, og her foldes listen alligevel, saa fejlen ikke kan komme
// tilbage, naar ordlisten udvides. Foerste forekomst er den, der vises.
function unikke(ord) {
  const set = new Map();
  for (const o of ord || []) if (!set.has(normaliser(o))) set.set(normaliser(o), o);
  return [...set.values()];
}

export function lavRelevans(emneord) {
  const spec = unikke(emneord.specifikke).map((o) => [o, udtryk(o)]);
  const gen = unikke(emneord.generiske).map((o) => [o, udtryk(o)]);
  const veto = unikke(emneord.udelukkelsesord?.ord).map((o) => [o, udtryk(o)]);
  const kraevSpec = emneord.regel?.specifikke_kraevet ?? 1;
  const kraevGen = emneord.regel?.generiske_kraevet ?? 2;

  return function relevans(p) {
    const h = normaliser(`${p.titel || ''} ${p.resume || ''}`);

    // Vetoet gaar foerst. Et tvetydigt fagord som «drought stress» eller
    // «periodontal» betyder, at ordet «stress» her ikke har med mennesker at
    // goere, og saa er resten af traefferne ligegyldige.
    const udelukket = veto.filter(([o, r]) => r.test(h)).map(([o]) => o);
    if (udelukket.length) return { relevant: false, grund: `udelukket af: ${udelukket.slice(0, 3).join(', ')}`, ramte: [], specifikke: [], generiske: [] };

    const s = spec.filter(([o, r]) => r.test(h)).map(([o]) => o);
    const g = gen.filter(([o, r]) => r.test(h)).map(([o]) => o);

    // Ét generisk ord alene kvalificerer aldrig. Det var dét, der lukkede
    // plantefysiologi og tandkoedssygdom ind.
    const relevant = s.length >= kraevSpec || g.length >= kraevGen;
    const grund = relevant
      ? (s.length ? `specifikt: ${s.slice(0, 3).join(', ')}` : `${g.length} generiske: ${g.slice(0, 3).join(', ')}`)
      : (g.length === 1 ? `kun ét generisk ord (${g[0]}) — for svagt alene` : 'ingen traef');

    return { relevant, grund, ramte: [...s, ...g].slice(0, 8), specifikke: s, generiske: g };
  };
}

export { tekst, felt, gyldigDato, adapter };

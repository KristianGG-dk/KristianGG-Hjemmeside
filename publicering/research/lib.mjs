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

export function lavRelevans(emneord) {
  const ORD = emneord.map((o) => o.toLowerCase());
  return function relevans(p) {
    const h = `${p.titel || ''} ${p.resume || ''}`.toLowerCase();
    const ramt = ORD.filter((o) => h.includes(o));
    return { relevant: ramt.length > 0, ramte: [...new Set(ramt)].slice(0, 6) };
  };
}

export { tekst, felt, gyldigDato, adapter };

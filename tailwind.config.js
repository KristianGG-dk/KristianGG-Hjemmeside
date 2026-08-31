/** @type {import('tailwindcss').Config} */
//
// Naturpalet. Kontrastværdier er efterprøvet mod WCAG 2.1 — se ændringsplanens
// afsnit 12. De gamle tokennavne (primary, accent, text-dark, text-muted,
// bg-cream) er bevaret med vilje og blot ommappet, så alle eksisterende
// skabeloner skifter udseende uden at skulle skrives om. Nye navne bruges i nyt
// markup.
//
module.exports = {
  content: [
    "./layouts/**/*.html",
    "./content/**/*.md",
  ],
  theme: {
    extend: {
      colors: {
        // ── ommappede, eksisterende navne ────────────────────────────────────
        primary: {
          DEFAULT: "#4A6240",   // mos — links og rammer. 6,20 på tåge (AA)
          dark:    "#3A4E33",
          light:   "#DDE4D6",   // flade, aldrig tekst
        },
        accent:        "#9C3E29", // hyben — kun handlinger
        "text-dark":   "#2C3A2E", // skovbund. 11,02 på tåge (AAA)
        "text-muted":  "#5A6857", // 5,45 på tåge (AA)
        "bg-cream":    "#F4F6F1", // morgentåge

        // ── nye, sigende navne ───────────────────────────────────────────────
        skovbund: { DEFAULT: "#2C3A2E", dyb: "#1E2921" },
        mos:      { DEFAULT: "#4A6240", dyb: "#3A4E33", lys: "#DDE4D6" },
        lav:      "#A8B79A",  // KUN streger og dekoration — falder som tekst
        birk:     "#E8E6DC",  // sektionsflade i stedet for hvid
        taage:    "#F4F6F1",
        hyben:    { DEFAULT: "#9C3E29", dyb: "#82331F" },
        "tekst-daempet": "#5A6857", // dæmpet brødtekst. 5,45 på tåge (AA)
      },
      fontFamily: {
        // Brødtekst. Karla indlæses kun når webfonts er slået til i hugo.toml;
        // ellers falder den ned på systemskrift uden layoutskift.
        sans: ["Karla", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        // Overskrifter — blød, organisk serif med Georgia som reserve.
        display: ["Fraunces", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

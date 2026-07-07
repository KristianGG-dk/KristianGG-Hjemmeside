import type { Config, Context } from "@netlify/edge-functions";

const ALLOWED = new Set(["DK", "SE", "NO", "FI", "IS", "FO"]);

// Static assets must always load — including those used by the block page itself
const STATIC = /\.(css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico|xml|txt|json|map)$/i;

export default async function geoBlock(request: Request, context: Context) {
  const { pathname } = new URL(request.url);

  // Pass through static assets, Netlify CMS, and internal Netlify paths
  if (STATIC.test(pathname) || pathname.startsWith("/admin") || pathname.startsWith("/.netlify")) {
    return context.next();
  }

  const country = context.geo?.country?.code ?? "";

  // Fail open: if geo data is unavailable, allow the request through
  if (!country || ALLOWED.has(country)) {
    return context.next();
  }

  return new Response(blockedPage(), {
    status: 451, // 451 Unavailable For Legal Reasons — standard for geo-restrictions
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config: Config = { path: "/*" };

function blockedPage(): string {
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Siden er ikke tilgængelig</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fafaf8;
      color: #1a1a2e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      padding: 3rem 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #1a7a6e; margin-bottom: 0.75rem; }
    p { color: #4a4a5a; line-height: 1.6; margin-bottom: 0.5rem; font-size: 0.95rem; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 1.5rem 0; }
    .small { font-size: 0.8rem; color: #8a8a9a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌍</div>
    <h1>Siden er geografisk begrænset</h1>
    <p>Dette website er kun tilgængeligt for besøgende fra de nordiske lande.</p>
    <hr>
    <p class="small">
      This website is only available to visitors from the Nordic region.<br>
      We apologise for any inconvenience.
    </p>
  </div>
</body>
</html>`;
}

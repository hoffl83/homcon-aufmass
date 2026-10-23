// Passwortschutz für die ganze Seite (Cloudflare Worker mit statischen Dateien, läuft vor jeder Auslieferung,
// siehe "run_worker_first" in wrangler.jsonc). Die App-Dateien liefert danach env.ASSETS aus.
// Passwort und Signaturschlüssel kommen aus den Secrets APP_PASSWORD und AUTH_SECRET
// (Cloudflare-Dashboard → Worker → Settings → Variables and Secrets), nie aus dem Repository.
// Nach erfolgreicher Anmeldung gilt ein signiertes Cookie 180 Tage; ohne Variablen bleibt die Seite gesperrt.

const COOKIE = "aufmass_auth", DAYS = 180;
// Für die Installation als App ohne Anmeldung erreichbar (enthalten keine Daten)
const OPEN = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/favicon.ico"];
const enc = new TextEncoder();

export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Vergleich in konstanter Zeit
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Cookie = "<Ablaufzeit ms>.<HMAC der Ablaufzeit>"
export async function validCookie(request, secret) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)aufmass_auth=(\d+)\.([0-9a-f]{64})/);
  if (!m || Number(m[1]) < Date.now()) return false;
  return same(await hmac(secret, m[1]), m[2]);
}

function loginPage(failed) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Aufmaß Heizlast – Anmeldung</title>
<style>
:root{--paper:#F7F6F2;--surface:#fff;--ink:#2E3133;--muted:#62686A;--line:#D9D4C9;--petrol:#5A6E61;--danger:#A8322A}
@media (prefers-color-scheme:dark){:root{--paper:#1E2122;--surface:#2E3133;--ink:#F7F6F2;--muted:#B4AFA5;--line:#44494B;--petrol:#93AA9A;--danger:#E8857B}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font:16px/1.5 "IBM Plex Sans",system-ui,sans-serif;padding:16px;box-sizing:border-box}
form{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:24px;width:min(360px,100%);display:grid;gap:14px;box-sizing:border-box}
h1{font-size:1.25rem;margin:0}p{margin:0;color:var(--muted);font-size:.9rem}
input{font:inherit;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink)}
button{font:inherit;font-weight:600;min-height:44px;border:0;border-radius:6px;background:var(--petrol);color:#fff;cursor:pointer}
.err{color:var(--danger)}
</style></head><body><form method="post" action="/login">
<h1>Aufmaß Heizlast</h1><p>Bitte mit dem Zugangspasswort anmelden.</p>
${failed ? '<p class="err" role="alert">Passwort falsch.</p>' : ""}
<input type="password" name="pw" autocomplete="current-password" aria-label="Passwort" placeholder="Passwort" required autofocus>
<button type="submit">Anmelden</button></form></body></html>`;
  return new Response(html, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handle(request, env, next) {
  const url = new URL(request.url);
  if (OPEN.includes(url.pathname)) return next();
  if (!env.APP_PASSWORD || !env.AUTH_SECRET)
    return new Response("Passwortschutz ist nicht eingerichtet: APP_PASSWORD und AUTH_SECRET in Cloudflare setzen.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

  if (url.pathname === "/login" && request.method === "POST") {
    const pw = String((await request.formData()).get("pw") || "");
    // Beide Seiten vorher hashen, damit der Vergleich nichts über die Länge verrät
    if (same(await hmac(env.AUTH_SECRET, "pw:" + pw), await hmac(env.AUTH_SECRET, "pw:" + env.APP_PASSWORD))) {
      const exp = String(Date.now() + DAYS * 864e5), sig = await hmac(env.AUTH_SECRET, exp);
      return new Response(null, { status: 303, headers: {
        "Location": "/", "Cache-Control": "no-store",
        "Set-Cookie": `${COOKIE}=${exp}.${sig}; Max-Age=${DAYS * 86400}; Path=/; Secure; HttpOnly; SameSite=Lax` } });
    }
    await new Promise(r => setTimeout(r, 1500)); // bremst Durchprobieren
    return loginPage(true);
  }

  const ok = await validCookie(request, env.AUTH_SECRET);
  // Prüfadresse für die App: ist die Anmeldung noch gültig?
  if (url.pathname === "/__auth") return new Response(null, { status: ok ? 204 : 401, headers: { "Cache-Control": "no-store" } });
  if (url.pathname === "/login" && ok) return new Response(null, { status: 303, headers: { "Location": "/" } });
  return ok ? next() : loginPage(false);
}

export default {
  fetch: (request, env) => handle(request, env, () => env.ASSETS.fetch(request)),
};

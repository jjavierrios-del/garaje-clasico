// Utilidades comunes: abrir la app sin guía ni internet, y un GitHub simulado en memoria
const path = require("path");
const fixture = (name) => path.join(__dirname, "fixtures", name);

async function openApp(page, { guide = false } = {}) {
  await page.route("**/api/rest_v1/page/summary/**", (r) => r.fulfill({ status: 404, body: "" }));
  if (!guide) await page.addInitScript(() => localStorage.setItem("guideSeen", "1"));
  await page.goto("/");
  await page.locator(".car").first().waitFor();
}

function fakeGitHub() {
  const files = {};
  const state = { tokens: new Set(["tok123"]), expiry: "" };
  let sha = 0;
  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url());
    const m = url.pathname.match(/^\/repos\/u\/garaje-datos(?:\/contents\/(.*))?$/);
    const h = { "access-control-allow-origin": "*", "content-type": "application/json" };
    // como GitHub con un token de caducidad fija; aquí la cabecera se deja leer
    if (state.expiry) Object.assign(h, { "github-authentication-token-expiration": state.expiry, "access-control-expose-headers": "github-authentication-token-expiration" });
    if (!m) return route.fulfill({ status: 404, headers: h, body: "{}" });
    if (!state.tokens.has((req.headers()["authorization"] || "").replace("Bearer ", ""))) return route.fulfill({ status: 401, headers: h, body: "{}" });
    const p = m[1] && decodeURIComponent(m[1]);
    if (!p) return route.fulfill({ headers: h, body: JSON.stringify({ private: true, permissions: { push: true } }) });
    if (req.method() === "GET") {
      if (p === "archivos") {
        const list = Object.keys(files).filter((k) => k.startsWith("archivos/")).map((k) => ({ name: k.slice(9) }));
        return route.fulfill({ status: list.length ? 200 : 404, headers: h, body: JSON.stringify(list) });
      }
      const f = files[p];
      if (!f) return route.fulfill({ status: 404, headers: h, body: "{}" });
      if ((req.headers()["accept"] || "").includes("raw")) return route.fulfill({ headers: { "access-control-allow-origin": "*" }, body: Buffer.from(f.content, "base64") });
      return route.fulfill({ headers: h, body: JSON.stringify({ sha: f.sha, encoding: "base64", content: f.content }) });
    }
    if (req.method() === "PUT") {
      const b = JSON.parse(req.postData()), f = files[p];
      if (f && b.sha !== f.sha) return route.fulfill({ status: 409, headers: h, body: "{}" });
      files[p] = { sha: "s" + ++sha, content: b.content };
      return route.fulfill({ status: 201, headers: h, body: "{}" });
    }
    route.fulfill({ status: 405, body: "" });
  };
  return { files, handler, state };
}

const isoDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const isoMonths = (m) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

module.exports = { openApp, fakeGitHub, fixture, isoDays, isoMonths };

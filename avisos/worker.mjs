// Garaje Clásico · servicio de avisos al móvil (Cloudflare Worker «avisos-garaje»)
//
// Cada móvil con los avisos activados manda aquí su suscripción y la lista de avisos de los
// próximos meses ya calculada (fecha + texto). Cada mañana a las 10:00 de Madrid se junta lo
// que toca ese día y se manda UNA notificación por móvil. La notificación va sin contenido:
// el móvil pregunta aquí el texto del día (/hoy). Así por Google/Apple no viaja ningún dato.
//
// No se guardan los datos del garaje: solo la suscripción y la lista de avisos (fecha y texto).
// Para apuntarse hay que tener acceso al repositorio privado de la sincronización (REPO): se
// comprueba con el mismo token de GitHub que ya usa la app. El token no se guarda.
//
// Configuración (wrangler.toml local, fuera de git):
//   KV «AVISOS»          → almacén de suscripciones y avisos
//   REPO (variable)      → «usuario/repositorio» de la sincronización, p. ej. jjavierrios-del/garaje-datos
//   VAPID_PRIVADA (secreto) → clave de firma de las notificaciones (JWK). Sin ella no se envía nada.
//   VAPID_CONTACTO (opcional) → dirección de contacto para los servicios de notificaciones
//   crons "0 8 * * *" y "0 9 * * *" (UTC) → las 10:00 de Madrid en verano y en invierno

const HORA_AVISO = 10;
const MAX_MOVILES = 10, MAX_AVISOS = 400, MAX_TEXTO = 160;
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const b64u = (buf) => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let t = ""; for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64uTexto = (t) => b64u(new TextEncoder().encode(t));
const deB64u = (t) => { const b = atob(String(t).replace(/-/g, "+").replace(/_/g, "/")); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
function endpointValido(u) {
  try { const x = new URL(u); return x.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; }
}
// Identificador del móvil: huella de su dirección de notificaciones (el móvil la calcula igual)
async function huella(txt) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)));
  let o = ""; for (let i = 0; i < 16; i++) o += h[i].toString(16).padStart(2, "0");
  return o;
}
// Fecha y hora de Madrid. HOY_PRUEBA y HORA_PRUEBA solo existen en las pruebas.
function ahoraMadrid(env) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { dia: env.HOY_PRUEBA || `${p.year}-${p.month}-${p.day}`, hora: env.HORA_PRUEBA !== undefined ? Number(env.HORA_PRUEBA) : Number(p.hour) % 24 };
}
const diaValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Solo puede apuntarse quien tenga acceso de escritura al repositorio privado de la sincronización
async function accesoValido(env, repo, token) {
  if (!env.REPO || repo !== env.REPO || typeof token !== "string" || token.length < 20 || token.length > 300) return false;
  try {
    const r = await fetch("https://api.github.com/repos/" + env.REPO, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "avisos-garaje", "X-GitHub-Api-Version": "2022-11-28" } });
    if (!r.ok) return false;
    const j = await r.json();
    return j.private === true && (!j.permissions || j.permissions.push === true);
  } catch { return false; }
}
// Limpia la lista que manda el móvil: solo fecha, clave y texto, con límites
function limpiarAvisos(lista) {
  if (!Array.isArray(lista)) return null;
  const out = [];
  for (const a of lista.slice(0, MAX_AVISOS)) {
    if (!a || !diaValido(a.dia) || typeof a.texto !== "string" || typeof a.clave !== "string") continue;
    out.push({ dia: a.dia, clave: a.clave.slice(0, 120), texto: a.texto.slice(0, MAX_TEXTO), coche: typeof a.coche === "string" ? a.coche.slice(0, 40) : "" });
  }
  return out;
}

async function registrar(request, env) {
  let b; try { b = await request.json(); } catch { return json({ error: "Petición no válida" }, 400); }
  const sub = b && b.sub;
  if (!sub || !endpointValido(sub.endpoint) || !sub.keys) return json({ error: "Suscripción no válida" }, 400);
  if (!(await accesoValido(env, b.repo, b.token))) return json({ error: "Sin acceso al repositorio de la sincronización" }, 403);
  const id = await huella(sub.endpoint), clave = "movil:" + id;
  if (request.method === "DELETE") { await env.AVISOS.delete(clave); await env.AVISOS.delete("hoy:" + id); return json({ ok: true }); }
  const avisos = limpiarAvisos(b.avisos);
  if (!avisos) return json({ error: "Lista de avisos no válida" }, 400);
  const prev = await env.AVISOS.get(clave, "json");
  if (!prev) {
    const n = (await env.AVISOS.list({ prefix: "movil:" })).keys.length;
    if (n >= MAX_MOVILES) return json({ error: "Hay demasiados móviles apuntados" }, 409);
  }
  // Se conservan los avisos ya enviados para no repetirlos (los semanales llevan la fecha en la clave)
  const { dia } = ahoraMadrid(env);
  const enviados = Object.fromEntries(Object.entries((prev && prev.enviados) || {}).filter(([, d]) => d >= restarDias(dia, 400)));
  await env.AVISOS.put(clave, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: sub.keys }, avisos, enviados, actualizado: new Date().toISOString() }));
  return json({ ok: true, id });
}
function restarDias(dia, n) { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

// Texto del día para el móvil que acaba de recibir el toque
async function textoHoy(url, env) {
  const id = url.searchParams.get("id") || "";
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: "id" }, 400);
  return json((await env.AVISOS.get("hoy:" + id, "json")) || { titulo: "Garaje Clásico", texto: "Tienes avisos pendientes en la app." });
}

// Firma VAPID y envío del toque (sin contenido)
async function preparaFirma(env) {
  if (!env.VAPID_PRIVADA) return null;
  let jwk; try { jwk = JSON.parse(env.VAPID_PRIVADA); } catch { return null; }
  const clave = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const xy = new Uint8Array(65); xy[0] = 4; xy.set(deB64u(jwk.x), 1); xy.set(deB64u(jwk.y), 33);
  const publica = b64u(xy), tokens = {};
  return async (endpoint) => {
    const aud = new URL(endpoint).origin;
    if (!tokens[aud]) {
      const cab = b64uTexto(JSON.stringify({ typ: "JWT", alg: "ES256" }));
      const cuerpo = b64uTexto(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_CONTACTO || "https://jjavierrios-del.github.io/garaje-clasico/" }));
      const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, new TextEncoder().encode(cab + "." + cuerpo));
      tokens[aud] = cab + "." + cuerpo + "." + b64u(firma);
    }
    return "vapid t=" + tokens[aud] + ", k=" + publica;
  };
}

// Cada mañana: junta lo que toca hoy en cada móvil y le manda un toque
async function avisosDelDia(env) {
  const { dia } = ahoraMadrid(env);
  const firmar = await preparaFirma(env);
  if (!firmar) return { enviados: 0, motivo: "sin clave" };
  let enviados = 0, borrados = 0;
  const lista = await env.AVISOS.list({ prefix: "movil:" });
  for (const k of lista.keys) {
    const m = await env.AVISOS.get(k.name, "json");
    if (!m || !m.sub || !endpointValido(m.sub.endpoint)) { await env.AVISOS.delete(k.name); continue; }
    m.enviados = m.enviados || {};
    const hoy = (m.avisos || []).filter((a) => a.dia === dia && !m.enviados[a.clave]);
    if (!hoy.length) continue;
    const id = k.name.slice(6), coches = [...new Set(hoy.map((a) => a.coche).filter(Boolean))];
    const texto = hoy.map((a) => a.texto).join(" · ");
    await env.AVISOS.put("hoy:" + id, JSON.stringify({ titulo: hoy.length === 1 ? "Garaje Clásico" : `Garaje Clásico · ${hoy.length} avisos`, texto, coche: coches.length === 1 ? coches[0] : "", dia }), { expirationTtl: 60 * 60 * 48 });
    try {
      const r = await fetch(m.sub.endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "normal", "Content-Length": "0", Authorization: await firmar(m.sub.endpoint) } });
      if (r.status === 404 || r.status === 410) { await env.AVISOS.delete(k.name); borrados++; continue; } // ese móvil ya no existe
      if (!r.ok) continue; // fallo del servicio: se reintenta en la otra hora programada o mañana
    } catch { continue; }
    for (const a of hoy) m.enviados[a.clave] = dia;
    await env.AVISOS.put(k.name, JSON.stringify(m));
    enviados++;
  }
  return { enviados, borrados };
}

export default {
  async scheduled(event, env, ctx) {
    // De las dos horas programadas (UTC), solo una es las 10:00 de Madrid
    const tarea = ahoraMadrid(env).hora === HORA_AVISO ? avisosDelDia(env) : Promise.resolve(null);
    if (ctx && ctx.waitUntil) ctx.waitUntil(tarea);
    return tarea;
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url), ruta = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (ruta === "/registro" && (request.method === "POST" || request.method === "DELETE")) return await registrar(request, env);
      if (ruta === "/hoy" && request.method === "GET") return await textoHoy(url, env);
      if (ruta === "/estado") return json({ ok: true, avisos: !!env.VAPID_PRIVADA, repo: !!env.REPO });
      return json({ error: "No encontrado" }, 404);
    } catch (e) { return json({ error: "Error del servidor" }, 500); }
  },
};
// Para las pruebas
export { avisosDelDia, limpiarAvisos, huella };

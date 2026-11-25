// Pruebas del servicio de avisos (avisos/worker.mjs) sin navegador: almacén y redes simulados
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");

const loadWorker = () => import(pathToFileURL(path.join(__dirname, "..", "avisos", "worker.mjs")).href);

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}
async function vapid() {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  return JSON.stringify(await crypto.subtle.exportKey("jwk", k.privateKey));
}
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/movil-1", keys: { p256dh: "x", auth: "y" } };
const TOKEN = "github_pat_bueno_0123456789";

// GitHub y el servicio de notificaciones de mentira
function fakeNet() {
  const pushes = [];
  const state = { pushStatus: 201 };
  const fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.github.com/repos/")) {
      const ok = (opts.headers?.Authorization || "") === "Bearer " + TOKEN && u.endsWith("/u/garaje-datos");
      return new Response(JSON.stringify({ private: true, permissions: { push: true } }), { status: ok ? 200 : 401 });
    }
    if (u.startsWith("https://fcm.googleapis.com/")) { pushes.push({ url: u, auth: opts.headers?.Authorization }); return new Response("", { status: state.pushStatus }); }
    throw new Error("red no prevista: " + u);
  };
  return { fetch, pushes, state };
}

let realFetch;
test.beforeEach(() => { realFetch = globalThis.fetch; });
test.afterEach(() => { globalThis.fetch = realFetch; });

test("servicio de avisos: solo admite móviles con acceso y manda un aviso al día con todo junto", async () => {
  const w = (await loadWorker()).default;
  const net = fakeNet(); globalThis.fetch = net.fetch;
  const env = { AVISOS: fakeKV(), REPO: "u/garaje-datos", VAPID_PRIVADA: await vapid(), HOY_PRUEBA: "2026-12-01", HORA_PRUEBA: "10" };
  const call = (method, ruta, body) => w.fetch(new Request("https://avisos.test" + ruta, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }), env);
  const avisos = [
    { dia: "2026-12-01", clave: "itvDate:c-seat124:2026-12-08:7", texto: "ITV del SEAT 124: vence en 7 días", coche: "c-seat124" },
    { dia: "2026-12-01", clave: "parado:c-w110:2026-10-31", texto: "Mercedes-Benz 200 D: lleva 30 días sin arrancar", coche: "c-w110" },
    { dia: "2026-12-08", clave: "itvDate:c-seat124:2026-12-08:0", texto: "ITV del SEAT 124: vence hoy", coche: "c-seat124" },
  ];

  // sin acceso al repositorio, o con otro repositorio, no entra
  expect((await call("POST", "/registro", { repo: "u/garaje-datos", token: "github_pat_malo_0000000000", sub: SUB, avisos })).status).toBe(403);
  expect((await call("POST", "/registro", { repo: "otro/repo", token: TOKEN, sub: SUB, avisos })).status).toBe(403);
  // una dirección que no es de un servicio de notificaciones tampoco
  expect((await call("POST", "/registro", { repo: "u/garaje-datos", token: TOKEN, sub: { ...SUB, endpoint: "https://malo.example/x" }, avisos })).status).toBe(400);
  const ok = await call("POST", "/registro", { repo: "u/garaje-datos", token: TOKEN, sub: SUB, avisos });
  expect(ok.status).toBe(200);
  const { id } = await ok.json();
  // el token no se guarda
  expect([...env.AVISOS.m.values()].join("")).not.toContain(TOKEN);

  // a las 9 no se manda nada; a las 10, un solo toque con los dos avisos del día
  expect(await w.scheduled({}, { ...env, HORA_PRUEBA: "9" })).toBeNull();
  expect(net.pushes).toHaveLength(0);
  expect(await w.scheduled({}, env)).toEqual({ enviados: 1, borrados: 0 });
  expect(net.pushes).toHaveLength(1);
  expect(net.pushes[0].auth).toMatch(/^vapid t=.+\..+\..+, k=B/);
  const hoy = await (await call("GET", "/hoy?id=" + id)).json();
  expect(hoy.titulo).toBe("Garaje Clásico · 2 avisos");
  expect(hoy.texto).toBe("ITV del SEAT 124: vence en 7 días · Mercedes-Benz 200 D: lleva 30 días sin arrancar");
  expect(hoy.coche).toBe(""); // son de dos vehículos: se abre la app sin entrar en ninguno

  // si se repite el temporizador ese día, no se vuelve a avisar; aunque el móvil mande otra vez la lista
  await call("POST", "/registro", { repo: "u/garaje-datos", token: TOKEN, sub: SUB, avisos });
  expect(await w.scheduled({}, env)).toEqual({ enviados: 0, borrados: 0 });

  // otro día: solo lo de ese día, y abre ese vehículo
  expect(await w.scheduled({}, { ...env, HOY_PRUEBA: "2026-12-08" })).toEqual({ enviados: 1, borrados: 0 });
  const hoy2 = await (await call("GET", "/hoy?id=" + id)).json();
  expect(hoy2).toMatchObject({ titulo: "Garaje Clásico", texto: "ITV del SEAT 124: vence hoy", coche: "c-seat124" });

  // si el móvil ya no existe (410), se borra
  await call("POST", "/registro", { repo: "u/garaje-datos", token: TOKEN, sub: SUB, avisos: [{ dia: "2026-12-09", clave: "x", texto: "Prueba" }] });
  net.state.pushStatus = 410;
  expect(await w.scheduled({}, { ...env, HOY_PRUEBA: "2026-12-09" })).toEqual({ enviados: 0, borrados: 1 });
  expect(await env.AVISOS.get("movil:" + id)).toBeNull();
});

test("servicio de avisos: darse de baja y límites de la lista", async () => {
  const mod = await loadWorker(), w = mod.default;
  const net = fakeNet(); globalThis.fetch = net.fetch;
  const env = { AVISOS: fakeKV(), REPO: "u/garaje-datos", VAPID_PRIVADA: await vapid(), HOY_PRUEBA: "2026-12-01", HORA_PRUEBA: "10" };
  const call = (method, body) => w.fetch(new Request("https://avisos.test/registro", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);
  await call("POST", { repo: "u/garaje-datos", token: TOKEN, sub: SUB, avisos: [{ dia: "2026-12-01", clave: "a", texto: "Hola" }] });
  expect((await env.AVISOS.list({ prefix: "movil:" })).keys).toHaveLength(1);
  expect((await call("DELETE", { repo: "u/garaje-datos", token: TOKEN, sub: SUB })).status).toBe(200);
  expect((await env.AVISOS.list({ prefix: "movil:" })).keys).toHaveLength(0);
  // la lista se recorta y se limpia
  const largo = mod.limpiarAvisos([{ dia: "2026-12-01", clave: "a", texto: "x".repeat(500) }, { dia: "mañana", clave: "b", texto: "y" }, { dia: "2026-12-02", clave: "c" }]);
  expect(largo).toHaveLength(1);
  expect(largo[0].texto).toHaveLength(160);
  expect(mod.limpiarAvisos(Array.from({ length: 1000 }, (_, i) => ({ dia: "2026-12-01", clave: "k" + i, texto: "t" })))).toHaveLength(400);
});

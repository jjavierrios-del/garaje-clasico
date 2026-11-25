// Avisos al móvil desde la app: se activan, se manda la lista de avisos y se pone al día con los cambios
const { test, expect } = require("@playwright/test");
const { openApp, fakeGitHub, isoDays } = require("./helpers");

// El navegador de pruebas no tiene notificaciones reales: se simulan el permiso y la suscripción
function fakePush() {
  window.Notification = { permission: "default", requestPermission: async () => "granted" };
  window.PushManager = function () {};
  let current = null;
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/movil-prueba", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "x", auth: "y" } }; }, async unsubscribe() { current = null; return true; } };
  const pushManager = { getSubscription: async () => current, subscribe: async () => (current = sub) };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager }), register: async () => ({}), addEventListener() {} } });
}

test("avisos al móvil: se activan con la sincronización y se ponen al día con los cambios", async ({ browser }) => {
  const gh = fakeGitHub();
  const calls = [];
  const ctx = await browser.newContext();
  await ctx.addInitScript(fakePush);
  await ctx.route("https://api.github.com/**", gh.handler);
  await ctx.route("https://avisos-garaje.jjavierrios.workers.dev/**", async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: JSON.parse(req.postData() || "{}") });
    route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  await openApp(p);

  // sin la sincronización no se pueden activar
  await p.click("#menuBtn");
  await p.click("#pushBtn");
  await expect(p.locator("#sheetBody")).toContainText("primero conecta «Compartir entre móviles»");
  await p.click("#pushSync");
  await p.fill("#y_repo", "u/garaje-datos");
  await p.fill("#y_token", "tok123");
  await p.click("#syncGo");
  await expect(p.locator("#syncState")).toHaveText("Sincronizado");

  // ITV dentro de 10 días en el primer vehículo
  await p.locator("[data-car]").first().click();
  await p.click("[data-dates]");
  await p.fill("#d_itv", isoDays(10));
  await p.click("#saveDates");
  await p.click('[data-go="garage"]');

  // activar
  await p.click("#menuBtn");
  await p.click("#pushBtn");
  await p.click("#pushGo");
  await expect(p.locator("#toast")).toHaveText("Avisos activados");
  const first = calls.find((c) => c.method === "POST");
  expect(first.url).toContain("/registro");
  expect(first.body).toMatchObject({ repo: "u/garaje-datos", token: "tok123", sub: { endpoint: "https://fcm.googleapis.com/fcm/send/movil-prueba" } });
  const itv = first.body.avisos.filter((a) => a.clave.startsWith("itvDate:"));
  // 30 días antes ya pasó: quedan 7 días antes y el mismo día; después, los lunes hasta que se renueve
  expect(itv.filter((a) => !a.clave.endsWith(":pend") && !/:pend:/.test(a.clave)).map((a) => [a.dia, a.texto.replace(/^ITV del .+?: /, "")])).toEqual([[isoDays(3), "vence en 7 días"], [isoDays(10), "vence hoy"]]);
  expect(itv[0].texto.startsWith("ITV del ")).toBe(true);
  const weekly = itv.filter((a) => a.clave.includes(":pend:"));
  expect(weekly.length).toBeGreaterThan(0);
  for (const a of weekly) { expect(a.dia > isoDays(10)).toBe(true); expect(new Date(a.dia + "T12:00:00").getDay()).toBe(1); }

  // la pantalla muestra lo próximo
  await p.click("#menuBtn");
  await expect(p.locator("#pushBtn")).toHaveText("Avisos en este móvil · activados");
  await p.click("#pushBtn");
  await expect(p.locator("#sheetBody")).toContainText("vence en 7 días");
  await p.click(".sheet-x");

  // un cambio (ITV renovada) se manda solo después de sincronizar
  const before = calls.filter((c) => c.method === "POST").length;
  await p.locator("[data-car]").first().click();
  await p.click("[data-dates]");
  await p.fill("#d_itv", isoDays(400));
  await p.click("#saveDates");
  await expect.poll(() => calls.filter((c) => c.method === "POST").length, { timeout: 15000 }).toBe(before + 1);
  const last = calls.filter((c) => c.method === "POST").pop();
  expect(last.body.avisos.some((a) => a.dia === isoDays(10) && a.clave.startsWith("itvDate:"))).toBe(false);

  // al tocar la notificación de un vehículo se abre su ficha
  const carId = last.body.avisos.find((a) => a.coche)?.coche || first.body.avisos.find((a) => a.coche).coche;
  await p.goto("/#coche=" + carId);
  await expect(p.locator("[data-dates]").first()).toBeVisible();

  // desactivar: se da de baja en el servicio
  await p.click("#menuBtn");
  await p.click("#pushBtn");
  await p.click("#pushOff");
  await expect(p.locator("#toast")).toHaveText("Avisos desactivados");
  expect(calls.some((c) => c.method === "DELETE" && c.body.sub?.endpoint)).toBe(true);
});

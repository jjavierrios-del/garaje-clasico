const { test, expect } = require("@playwright/test");
const { openApp, fixture, isoDays } = require("./helpers");

async function addPart(page, { name, car, location = "", barcode = "" }) {
  await page.click('[data-tab="stock"]');
  await page.click("#fab");
  await page.fill("#p_name", name);
  await page.selectOption("#p_car", car);
  if (location) await page.fill("#p_loc", location);
  if (barcode) await page.fill("#p_barcode", barcode);
  await page.click("#savePart");
  await expect(page.locator("#sheet")).toBeHidden();
}

test("cada repuesto dice dónde está guardado y el almacén se ordena por ubicación", async ({ page }) => {
  await openApp(page);
  await addPart(page, { name: "Filtro MANN W 920/7", car: "c-seat124", location: "Estantería 2, caja azul", barcode: "4011558709808" });
  await addPart(page, { name: "Bujía NGK BP6ES", car: "c-seat124" });
  await expect(page.locator(".row", { hasText: "Filtro MANN" }).locator(".loc")).toHaveText("Estantería 2, caja azul");
  await page.click('[data-sg="loc"]');
  await expect(page.locator(".section-head .eyebrow")).toHaveText(["Estantería 2, caja azul", "Sin ubicación"]);
  // la ubicación ya usada se propone al dar de alta otro repuesto
  await page.click("#fab");
  await expect(page.locator("#p_loc_list option")).toHaveAttribute("value", "Estantería 2, caja azul");
  await page.click(".sheet-x");
  // al escanear la caja, la app dice dónde está
  await page.click("[data-scan]");
  await page.setInputFiles("#scanFile", fixture("ean-4011558709808.png"));
  await expect(page.locator("#sheetBody .where")).toContainText("Está en Estantería 2, caja azul", { timeout: 15000 });
});

test("una salida suma los km, calcula el consumo y cuenta como arrancado", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-w126"]');
  await page.click("[data-km]");
  await page.fill("#km_now", "100000");
  await page.click("#saveKm");
  await page.click('[data-cartab="trips"]');
  await expect(page.locator(".due-row", { hasText: "Arrancarlo" })).toContainText("Sin registrar");
  await page.click("[data-new-trip]");
  await page.fill("#t_odo", "100150");
  await expect(page.locator("#t_dist")).toHaveValue("150");
  await page.fill("#t_liters", "15");
  await page.fill("#t_cost", "24,30");
  await page.click("#saveTrip");
  await expect(page.locator(".facts").first()).toContainText("100.150");
  const year = page.locator(".facts").nth(1);
  await expect(year).toContainText("Salidas1");
  await expect(year).toContainText("Km150");
  await expect(year).toContainText("L/10010,0");
  await expect(page.locator(".note", { hasText: "Gasolina este año" })).toContainText("24,30 €");
  await expect(page.locator(".due-row", { hasText: "Arrancarlo" })).toContainText("Arrancado hoy");
});

test("avisa si un vehículo lleva parado y se quita con «Arrancado hoy»", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-r11"]');
  await page.click('[data-cartab="trips"]');
  await page.click("[data-new-trip]");
  await page.fill("#t_date", isoDays(-45));
  await page.fill("#t_dist", "30");
  await page.click("#saveTrip");
  await expect(page.locator(".due-row", { hasText: "Arrancarlo" })).toContainText("Pronto");
  await page.click('[data-go="garage"]');
  const alert = page.locator("#avisos + .list .due-row", { hasText: "Arrancarlo" });
  await expect(alert).toContainText("Sin arrancar desde hace 45 días");
  // el plazo se puede cambiar por vehículo
  await alert.locator("[data-alert-car]").click();
  await expect(page.locator('[data-cartab="trips"]')).toHaveAttribute("aria-pressed", "true");
  await page.click("[data-idle-cfg]");
  await page.fill("#idleDays", "60");
  await page.click("#saveIv");
  await expect(page.locator(".due-row", { hasText: "Arrancarlo" })).toContainText("Al día");
  await page.click("[data-idle-cfg]");
  await page.fill("#idleDays", "30");
  await page.click("#saveIv");
  await page.click('[data-go="garage"]');
  await alert.locator("[data-run-car]").click();
  await expect(page.locator("#avisos + .list .due-row", { hasText: "Arrancarlo" })).toHaveCount(0);
});

test("la ficha en PDF reúne datos, mantenimiento e historial con lo gastado", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await openApp(page);
  await page.click('[data-car="c-w110"]');
  await page.click("[data-new-log]");
  await page.check('#l_tasks input[value="aceite"]');
  await page.fill("#l_title", "Cambio de aceite en el taller");
  await page.fill("#l_cost", "85,50");
  await page.click("#saveLog");
  await page.click('[data-cartab="info"]');
  await page.click("[data-print-car]");
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const report = page.locator("#print .report");
  await expect(report).toContainText("200 D");
  await expect(report).toContainText("MU-99367");
  await expect(report).toContainText("Bastidor");
  await expect(report).toContainText("Cambio de aceite en el taller");
  await expect(report.locator("tfoot")).toContainText("85,50 €");
  // al imprimir solo se ve la ficha
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#print")).toBeVisible();
  await expect(page.locator(".tabbar")).toBeHidden();
});

test("el micrófono dicta en las notas y, sin reconocimiento de voz, abre el teclado", async ({ page, browser }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: "cambio de aceite y filtro" }]] }); this.onend?.(); }, 50); }
      stop() {}
    };
  });
  await openApp(page);
  await page.click('[data-car="c-j54"]');
  await page.click("[data-new-log]");
  await page.fill("#l_notes", "Hecho en casa.");
  await page.click('[data-mic="l_notes"]');
  await expect(page.locator("#l_notes")).toHaveValue("Hecho en casa. Cambio de aceite y filtro");
  await page.click('[data-mic="l_title"]');
  await expect(page.locator("#l_title")).toHaveValue("Cambio de aceite y filtro");

  const other = await (await browser.newContext()).newPage();
  await other.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await openApp(other);
  await other.click('[data-car="c-j54"]');
  await other.click("[data-new-log]");
  await other.click('[data-mic="l_notes"]');
  await expect(other.locator("#toast")).toContainText("micrófono del teclado");
  await expect(other.locator("#l_notes")).toBeFocused();
});

const { test, expect } = require("@playwright/test");
const { openApp, fixture, isoDays, isoMonths } = require("./helpers");

async function addPart(page, { name, car, qty, min = "", barcode = "" }) {
  await page.click('[data-tab="stock"]');
  await page.click("#fab");
  await page.fill("#p_name", name);
  await page.selectOption("#p_car", car);
  await page.fill("#p_qty", String(qty));
  if (min) await page.fill("#p_min", String(min));
  if (barcode) await page.fill("#p_barcode", barcode);
  await page.click("#savePart");
  await expect(page.locator("#sheet")).toBeHidden();
}

test("registrar un trabajo descuenta la pieza y calcula el próximo aviso", async ({ page }) => {
  await openApp(page);
  await addPart(page, { name: "Filtro de aceite", car: "c-w126", qty: 3, min: 2 });
  await page.click('[data-tab="garage"]');
  await page.click('[data-car="c-w126"]');
  await page.click('[data-log-task="aceite"]');
  await page.fill("#l_date", isoMonths(-13));
  await page.fill("#l_km", "120000");
  await page.selectOption("#l_part", { index: 1 });
  await page.click("#l_add");
  await page.click("#saveLog");
  const row = page.locator(".due-row", { hasText: "Aceite y filtro" });
  await expect(row).toContainText("Vencido");
  await expect(page.locator(".facts")).toContainText("120.000");
  await page.click('[data-cartab="parts"]');
  await expect(page.locator(".row", { hasText: "Filtro de aceite" }).locator("output")).toHaveText("2");
  // con un intervalo de 24 meses deja de estar vencido
  await page.click('[data-cartab="maint"]');
  await page.click("[data-intervals]");
  await page.fill('[data-iv-m="aceite"]', "24");
  await page.click("#saveIv");
  await expect(row).toContainText("Al día");
});

test("las fechas de ITV generan aviso en el garaje y un calendario válido", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-e36"]');
  await page.click("[data-dates]");
  await page.fill("#d_itv", isoDays(10));
  await page.click("#saveDates");
  await page.click("[data-cal-car]");
  const ics = await page.evaluate(async () => (await fetch(document.querySelector("#sheetBody a.btn").href)).text());
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("DTSTART;VALUE=DATE:" + isoDays(10).replace(/-/g, ""));
  expect(ics).toContain("TRIGGER:-P6DT15H");
  await page.click(".sheet-x");
  await page.click('[data-go="garage"]');
  await expect(page.locator("#avisos + .list")).toContainText("ITV");
});

test("lista de la compra: reponer lo que baja del mínimo y lo apuntado", async ({ page }) => {
  await openApp(page);
  await addPart(page, { name: "Pastillas delanteras", car: "c-e36", qty: 1, min: 1 });
  await page.click('[data-sv="shop"]');
  await expect(page.locator(".list .row")).toHaveCount(1);
  await page.click("[data-new-shop]");
  await page.fill("#s_name", "Bidón de aceite 10W-40");
  await page.click("#saveShop");
  await expect(page.locator(".list .row")).toHaveCount(2);
  await page.click("[data-bought-part]");
  await page.click("#saveBought");
  await page.click("[data-bought-shop]");
  await page.click("#savePart");
  await expect(page.locator(".list .row")).toHaveCount(0);
});

test("escanear un código de barras desde una foto encuentra el repuesto", async ({ page }) => {
  await openApp(page);
  await addPart(page, { name: "Filtro MANN W 920/7", car: "c-seat124", qty: 1, barcode: "4011558709808" });
  await page.click("[data-scan]");
  await expect(page.locator("#scanner")).toBeVisible();
  await page.setInputFiles("#scanFile", fixture("ean-4011558709808.png"));
  await expect(page.locator("#sheetBody h2")).toHaveText("Filtro MANN W 920/7", { timeout: 15000 });
  await page.click("#scPlus");
  await expect(page.locator(".row", { hasText: "Filtro MANN" }).locator("output")).toHaveText("2");
});

test("fotos de la galería y documentos del vehículo", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-j54"]');
  await page.click('[data-cartab="info"]');
  await page.setInputFiles("#galleryInput", [fixture("coche.jpg"), fixture("coche.jpg")]);
  await expect(page.locator(".g-item")).toHaveCount(2);
  await page.click('[data-cartab="docs"]');
  await page.click("[data-new-doc]");
  await page.selectOption("#o_type", "Seguro");
  await page.fill("#o_exp", isoDays(20));
  await page.setInputFiles("#o_file", fixture("documento.pdf"));
  await page.click("#saveDoc");
  await expect(page.locator(".doc")).toHaveCount(1);
  await page.click('[data-cartab="maint"]');
  await expect(page.locator(".due-row", { hasText: "Seguro" }).first()).toContainText("Pronto");
});

const { test, expect } = require("@playwright/test");
const { openApp, fixture } = require("./helpers");

test("mapa del taller: marcar un sitio en la foto y encontrar ahí los repuestos", async ({ page }) => {
  await openApp(page);
  await page.click('[data-tab="stock"]');
  await page.click('[data-sv="map"]');
  await expect(page.locator(".empty h3")).toHaveText("El mapa del taller");
  await page.setInputFiles("#mapInput", fixture("coche.jpg"));
  await expect(page.locator("#sheetBody h2")).toHaveText("Estantería 1");

  // tocar la foto pone una marca y pide su nombre
  await page.locator("#mapBox img").click({ position: { x: 60, y: 40 } });
  await page.fill("#pinLabel", "Caja azul");
  await page.click("#pinOk");
  await expect(page.locator("#mapBox .pin")).toHaveCount(1);
  await expect(page.locator("#sheetBody > .list")).toContainText("Caja azul");
  await page.click(".sheet-x");
  await expect(page.locator(".map-card")).toContainText("1 sitio · 0 repuestos");

  // un repuesto con esa ubicación (da igual mayúsculas) se ve en el mapa
  await page.click('[data-sv="inv"]');
  await page.click("#fab");
  await expect(page.locator("#p_loc_list option")).toHaveAttribute("value", "Caja azul");
  await page.fill("#p_name", "Junta de culata");
  await page.fill("#p_loc", "caja azul");
  await page.click("#savePart");
  await page.click('[data-sg="loc"]');
  await page.click('[data-map-loc="caja azul"]');
  await expect(page.locator("#mapBox .pin.on")).toHaveCount(1);
  await expect(page.locator("#pinPanel")).toContainText("Junta de culata");

  // cambiar el nombre del sitio cambia la ubicación de sus repuestos
  await page.click("#pinRen");
  await page.fill("#pinLabel", "Cajón 3");
  await page.click("#pinOk");
  await expect(page.locator("#sheetBody > .list")).toContainText("Cajón 3");
  await page.click(".sheet-x");
  await expect(page.locator(".section-head .eyebrow")).toHaveText(["Cajón 3"]);
  await page.click('[data-part]');
  await page.click("#locMap");
  await expect(page.locator("#pinPanel")).toContainText("Junta de culata");
});

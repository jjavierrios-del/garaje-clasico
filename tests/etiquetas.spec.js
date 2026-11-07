const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

async function addPart(page, name, location) {
  await page.click('[data-tab="stock"]');
  await page.click('[data-sv="inv"]');
  await page.click("#fab");
  await page.fill("#p_name", name);
  await page.fill("#p_loc", location);
  await page.click("#savePart");
  await expect(page.locator("#sheet")).toBeHidden();
}

test("imprime etiquetas QR de los sitios y al escanearlas enseña lo que hay dentro", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await openApp(page);
  await addPart(page, "Filtro de aceite W 920", "Caja azul");
  await addPart(page, "Bujías NGK BP6ES", "Caja azul");
  await addPart(page, "Pastillas de freno", "Cajón 2");

  await page.click('[data-sv="map"]');
  await page.click("[data-qr-labels]");
  await expect(page.locator("#qrPrint")).toHaveText("Imprimir 2 etiquetas");
  await page.locator("label.check", { hasText: "Cajón 2" }).locator("input").uncheck();
  await expect(page.locator("#qrPrint")).toHaveText("Imprimir 1 etiqueta");
  await page.click("#qrPrint");
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const label = page.locator("#print .qr-label");
  await expect(label).toHaveCount(1);
  await expect(label).toContainText("Caja azul");

  // el QR impreso se lee con el escáner de la app
  const png = await page.evaluate(async () => {
    const svg = document.querySelector("#print .qr svg").outerHTML;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 480;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 480, 480);
    g.drawImage(img, 40, 40, 400, 400);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.click(".sheet-x");
  await page.click("[data-scan]");
  await page.setInputFiles("#scanFile", { name: "qr.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.locator("#sheetBody h2")).toHaveText("Caja azul", { timeout: 15000 });
  await expect(page.locator("#sheetBody .row")).toHaveCount(2);
  await expect(page.locator("#sheetBody")).toContainText("Bujías NGK BP6ES");
});

test("abrir el enlace de la etiqueta con la cámara del móvil abre el sitio", async ({ page }) => {
  await openApp(page);
  await addPart(page, "Junta de culata", "Estantería 2, balda alta");
  await page.goto("/#sitio=" + encodeURIComponent("Estantería 2, balda alta"));
  await expect(page.locator("#sheetBody h2")).toHaveText("Estantería 2, balda alta");
  await expect(page.locator("#sheetBody")).toContainText("Junta de culata");
  await expect(page).not.toHaveURL(/#sitio=/);
  // guardar un repuesto nuevo ya en ese sitio
  await page.click("#placeAdd");
  await expect(page.locator("#p_loc")).toHaveValue("Estantería 2, balda alta");
});

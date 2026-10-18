const { test, expect } = require("@playwright/test");
const { openApp, fakeGitHub, fixture } = require("./helpers");
const fs = require("fs");

test("copia de seguridad: se descarga y se restaura en otro móvil", async ({ page, browser }, info) => {
  await openApp(page);
  await page.click('[data-tab="stock"]');
  await page.click("#fab");
  await page.fill("#p_name", "Bujía NGK BKR6EK");
  await page.setInputFiles("#p_photo", fixture("coche.jpg"));
  await page.click("#savePart");
  await page.click('[data-tab="garage"]');
  await expect(page.locator(".backup")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-backup]")]);
  const file = info.outputPath("copia.json");
  await dl.saveAs(file);
  await expect(page.locator(".backup")).toHaveCount(0);
  const copia = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(copia.repuestos).toHaveLength(1);
  expect(Object.keys(copia.fotos)).toHaveLength(1);

  const other = await (await browser.newContext()).newPage();
  await openApp(other);
  await other.click("#menuBtn");
  await expect(other.locator("#importBtn")).toBeVisible();
  // Se pasa como búfer: Playwright no dispara «change» si la ruta lleva tildes.
  await other.setInputFiles("#importFile", { name: "copia.json", mimeType: "application/json", buffer: fs.readFileSync(file) });
  await other.click("#yes");
  await other.click('[data-tab="stock"]');
  await expect(other.locator(".row", { hasText: "Bujía NGK" })).toHaveCount(1);
  await expect(other.locator('.thumb[src^="blob:"]')).toHaveCount(1);
});

test("sincronización entre dos móviles con un repositorio privado", async ({ browser }) => {
  const gh = fakeGitHub();
  const phone = async () => {
    const ctx = await browser.newContext();
    await ctx.route("https://api.github.com/**", gh.handler);
    const p = await ctx.newPage();
    await openApp(p);
    return p;
  };
  const a = await phone();
  await a.click("#menuBtn");
  await a.click("#syncBtn");
  await a.fill("#y_repo", "u/garaje-datos");
  await a.fill("#y_token", "tok123");
  await a.click("#syncGo");
  await expect(a.locator("#syncState")).toHaveText("Sincronizado");
  await a.click('[data-tab="stock"]');
  await a.click("#fab");
  await a.fill("#p_name", "Junta de culata");
  await a.click("#savePart");
  await expect.poll(() => Object.keys(gh.files).length).toBeGreaterThan(0);
  await a.waitForTimeout(4500);

  await a.click("#menuBtn");
  await a.click("#syncBtn");
  await a.click("#syncLink");
  const link = (await a.textContent("#syncTxt")).trim();
  await a.click(".sheet-x");

  const b = await phone();
  await b.goto(link);
  await b.click("#syncYes");
  await expect(b.locator("#syncState")).toHaveText("Sincronizado");
  await b.click('[data-tab="stock"]');
  await expect(b.locator(".row", { hasText: "Junta de culata" })).toHaveCount(1);

  // un borrado en B llega a A
  await b.locator("[data-part]", { hasText: "Junta de culata" }).click();
  await b.click("#delPart");
  await b.click("#yes");
  await b.waitForTimeout(4500);
  await a.click("#menuBtn");
  await a.click("#syncBtn");
  await a.click("#syncNowBtn");
  await expect(a.locator("#toast")).toHaveText("Sincronizado");
  await a.click(".sheet-x");
  await expect(a.locator(".row", { hasText: "Junta de culata" })).toHaveCount(0);
});

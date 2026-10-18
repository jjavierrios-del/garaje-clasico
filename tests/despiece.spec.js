const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

test("cada despiece carga y enseña de dónde sale la referencia", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-cbf600"]');
  await page.click('[data-cartab="catalog"]');
  await expect(page.locator(".groups .row")).not.toHaveCount(0);
  await page.evaluate(() => document.querySelectorAll("details.group").forEach((d) => (d.open = true)));
  await page.click('[data-cat="c-cbf600~bujias"]');
  await expect(page.locator("#k_alt")).toHaveValue("NGK CR8EH-9");
  await expect(page.locator("#sheetBody a.shop")).toHaveAttribute("href", /manualslib/);
});

test("la búsqueda encuentra un código OEM escrito sin espacios", async ({ page }) => {
  await openApp(page);
  await page.click('[data-tab="search"]');
  await page.fill("#q", "15410mfjd02");
  await expect(page.locator("#results .row")).not.toHaveCount(0);
  await expect(page.locator("#results")).toContainText("Filtro de aceite");
});

test("los datos rápidos muestran los valores de referencia", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-cbf600"]');
  await expect(page.locator(".quick")).toContainText("10W-30");
  await page.click("[data-quick]");
  await page.fill("#q_presion", "2,25 / 2,5 bar");
  await page.click("#saveQuick");
  await expect(page.locator(".quick")).toContainText("2,25 / 2,5 bar");
});

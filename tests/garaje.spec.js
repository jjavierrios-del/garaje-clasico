const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

test("carga los 9 vehículos de la colección con sus matrículas", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".car")).toHaveCount(9);
  await expect(page.locator('[data-car="c-w110"] .plate')).toHaveText("MU-99367");
  await expect(page.locator('[data-car="c-w110"] img')).toHaveAttribute("src", "fotos/mercedes-200d.jpg");
});

test("filtra coches y motos", async ({ page }) => {
  await openApp(page);
  await page.click('[data-kind="moto"]');
  await expect(page.locator(".car")).toHaveCount(2);
  await page.click('[data-kind="coche"]');
  await expect(page.locator(".car")).toHaveCount(7);
});

test("un vehículo borrado no vuelve a aparecer al recargar", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-r11"]');
  await page.click('[data-cartab="info"]');
  await page.click("[data-edit-car]");
  await page.click("#delCar");
  await page.click("#yes");
  await expect(page.locator(".car")).toHaveCount(8);
  await page.reload();
  await page.locator(".car").first().waitFor();
  await expect(page.locator(".car")).toHaveCount(8);
});

test("la guía aparece la primera vez y no la siguiente", async ({ page }) => {
  await openApp(page, { guide: true });
  await expect(page.locator("#sheetBody h2")).toHaveText("Bienvenido al garaje");
  for (let i = 0; i < 7; i++) await page.click("#gNext");
  await expect(page.locator("#gNext")).toHaveText("Empezar");
  await page.click("#gNext");
  await expect(page.locator("#sheet")).toBeHidden();
  await page.reload();
  await page.locator(".car").first().waitFor();
  await expect(page.locator("#sheet")).toBeHidden();
});

const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

test("el botón ✕ y el gesto atrás cierran las hojas y vuelven al garaje", async ({ page }) => {
  await openApp(page);
  await page.click('[data-car="c-cbf600"]');
  await page.click('[data-cartab="catalog"]');
  await page.click('[data-web-cat="c-cbf600~filtro-aceite"]');
  await page.click(".sheet-x");
  await expect(page.locator("#sheet")).toBeHidden();
  await page.click('[data-web-cat="c-cbf600~filtro-aceite"]');
  await page.goBack();
  await expect(page.locator("#sheet")).toBeHidden();
  await expect(page.locator(".subtabs")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".cars")).toBeVisible();
});

test("la letra grande agranda el texto", async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  await page.click("#menuBtn");
  await page.click('[data-text-size="muy-grande"]');
  const after = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  expect(after).toBeGreaterThan(before);
});

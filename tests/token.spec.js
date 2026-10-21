const { test, expect } = require("@playwright/test");
const { openApp, fakeGitHub, isoDays } = require("./helpers");

async function connected(browser, gh, expires) {
  const ctx = await browser.newContext();
  await ctx.route("https://api.github.com/**", gh.handler);
  const p = await ctx.newPage();
  await openApp(p);
  await p.click("#menuBtn");
  await p.click("#syncBtn");
  await p.fill("#y_repo", "u/garaje-datos");
  await p.fill("#y_token", "tok123");
  if (expires) await p.fill("#y_exp", expires);
  await p.click("#syncGo");
  await expect(p.locator("#syncState")).toHaveText("Sincronizado");
  return p;
}

test("avisa un mes antes de que caduque el token y lo apunta en el calendario", async ({ browser }) => {
  const gh = fakeGitHub();
  const p = await connected(browser, gh, isoDays(20));
  await expect(p.locator("#tokenWarn")).toContainText("caduca en 20 días");
  await expect(p.locator("#tokenWarn")).not.toHaveClass(/crit/);
  // con más de 30 días no hay aviso
  await p.click("#menuBtn");
  await p.click("#syncBtn");
  await p.fill("#y_exp2", isoDays(200));
  await p.click("#saveExp");
  await p.click(".sheet-x");
  await expect(p.locator("#tokenWarn")).toHaveCount(0);
  // pero sí sale en el calendario de todos los vehículos
  await p.locator("[data-car]").first().click();
  await p.click("[data-dates]");
  await p.fill("#d_itv", isoDays(10));
  await p.click("#saveDates");
  await p.click('[data-go="garage"]');
  await p.click("[data-cal-all]");
  const ics = await p.evaluate(async () => (await fetch(document.querySelector("#sheetBody a.btn").href)).text());
  expect(ics).toContain("SUMMARY:Caduca el token de Garaje Clásico");
  expect(ics).toContain("DTSTART;VALUE=DATE:" + isoDays(200).replace(/-/g, ""));
});

test("si el token deja de valer, avisa en rojo y se renueva sin perder datos", async ({ browser }) => {
  const gh = fakeGitHub();
  const p = await connected(browser, gh);
  gh.state.tokens.delete("tok123");
  await p.click("#menuBtn");
  await p.click("#syncBtn");
  await p.click("#syncNowBtn");
  await expect(p.locator("#toast")).toContainText("El token no es válido");
  await p.click(".sheet-x");
  const warn = p.locator("#tokenWarn");
  await expect(warn).toHaveClass(/crit/);
  await expect(warn).toContainText("está cortada");

  gh.state.tokens.add("tok456");
  await warn.locator("[data-renew]").click();
  await expect(p.locator("#sheetBody a[href*='personal-access-tokens/new']")).toHaveAttribute("href", /target_name=u&expires_in=366&contents=write/);
  await p.fill("#r_token", "tok456");
  await p.click("#renewGo");
  await expect(p.locator("#sheetBody h2")).toHaveText("Enlace para el otro móvil");
  const link = (await p.textContent("#syncTxt")).trim();
  expect(JSON.parse(Buffer.from(link.split("#sync=")[1], "base64url").toString())).toMatchObject({ token: "tok456", expires: isoDays(366) });
  await p.click(".sheet-x");
  await expect(p.locator("#syncState")).toHaveText("Sincronizado");
  await expect(warn).toHaveCount(0);
});

test("toma la fecha de caducidad que da GitHub", async ({ browser }) => {
  const gh = fakeGitHub();
  gh.state.expiry = isoDays(10) + " 12:00:00 UTC";
  const p = await connected(browser, gh, isoDays(366));
  await expect(p.locator("#tokenWarn")).toContainText("caduca en 10 días");
});

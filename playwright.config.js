// Pruebas de la app en un navegador con tamaño de móvil. Ejecutar con: npm test
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  },
  webServer: { command: "node tests/server.js 4173", url: "http://localhost:4173/", reuseExistingServer: true },
});

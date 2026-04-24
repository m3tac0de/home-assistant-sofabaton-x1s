const { defineConfig } = require("@playwright/test");

const PORT = 4173;

module.exports = defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      scale: "css",
    },
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 520, height: 1700 },
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
  },
  webServer: {
    command: "node ./scripts/serve-playwright-fixtures.mjs",
    port: PORT,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

const { defineConfig } = require("@playwright/test");

const PORT = 4173;

// The server panel spec runs twice (docs/internal/server-panel-state-plan.md,
// decision 14): at a phone viewport with a touch pointer and at a desktop
// one, so a phone regression fails CI rather than a single narrow case.
const SERVER_PANEL = /server-panel\.spec\.js$/;

module.exports = defineConfig({
  testDir: "./tests/playwright",
  // The card baselines predate the named projects; keep their file names.
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-snapshotSuffix}{ext}",
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
  projects: [
    { name: "cards", testIgnore: SERVER_PANEL },
    { name: "server-panel-phone", testMatch: SERVER_PANEL, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "server-panel-desktop", testMatch: SERVER_PANEL, use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "node ./scripts/serve-playwright-fixtures.mjs",
    port: PORT,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

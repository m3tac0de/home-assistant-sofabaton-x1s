import { expect, test } from "@playwright/test";

// Visual baselines for the hand-rolled config-editor sections (styling options,
// group order, commands). ha-form is stubbed by the harness to render schema
// field names + current values, so these shots also guard schema construction.
// These baselines are the parity gate for the editor Lit port.

const HARNESS_URL = "/tests/playwright/fixtures/remote-card-harness.html";

async function mountEditor(page, scenario = "active", config = {}) {
  await page.goto(HARNESS_URL);
  await page.evaluate(
    async ({ scenarioName, nextConfig }) => {
      await window.__remoteCardHarness.mountEditor({
        scenario: scenarioName,
        config: nextConfig,
      });
    },
    { scenarioName: scenario, nextConfig: config },
  );
}

function editorLocator(page) {
  return page.locator("#mount");
}

test.describe("remote card editor harness", () => {
  test("captures collapsed editor overview baseline", async ({ page }) => {
    await mountEditor(page, "active");
    await expect(page.locator("ha-form").first()).toBeVisible();
    await expect(editorLocator(page)).toHaveScreenshot("remote-card-editor-overview.png");
  });

  test("captures expanded styling options baseline", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-styling-wrap .sb-exp-hdr").click();
    await expect(page.locator(".sb-styling-wrap .sb-exp")).not.toHaveClass(/sb-exp-collapsed/);
    await expect(page.locator(".sb-styling-wrap")).toHaveScreenshot("remote-card-editor-styling.png");
  });

  test("captures expanded group order baseline", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-layout-wrap .sb-exp-hdr").click();
    await expect(page.locator(".sb-layout-wrap .sb-exp")).not.toHaveClass(/sb-exp-collapsed/);
    await expect(page.locator(".sb-layout-wrap")).toHaveScreenshot("remote-card-editor-group-order.png");
  });

  test("captures expanded commands editor baseline", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-commands-wrap .sb-exp-hdr").click();
    await expect(page.locator(".sb-commands-wrap .sb-exp")).not.toHaveClass(/sb-exp-collapsed/);
    await expect(page.locator(".sb-commands-wrap")).toHaveScreenshot("remote-card-editor-commands.png");
  });

  test("moving a group down through the arrow controls fires config-changed", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-layout-wrap .sb-exp-hdr").click();

    const changes = [];
    await page.exposeFunction("__pushEditorChange", (detail) => changes.push(detail));
    await page.evaluate(() => {
      document.querySelector("sofabaton-virtual-remote-editor").addEventListener(
        "config-changed",
        (event) => window.__pushEditorChange(event.detail?.config ?? null),
      );
    });

    await page.locator(".sb-layout-wrap .sb-layout-row-order .sb-icon-btn:not([disabled])").first().click();

    await expect.poll(() => changes.length).toBeGreaterThan(0);
    const lastConfig = changes[changes.length - 1];
    expect(Array.isArray(lastConfig?.group_order) || Array.isArray(lastConfig?.layouts?.default?.group_order)).toBe(true);
  });
});

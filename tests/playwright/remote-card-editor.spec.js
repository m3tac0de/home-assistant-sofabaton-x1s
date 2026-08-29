import { expect, test } from "@playwright/test";

// Visual baselines for the hand-rolled config-editor sections (general options,
// styling options, group order). ha-form is stubbed by the harness to render schema
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

  test("captures expanded general options baseline", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-general-wrap .sb-exp-hdr").click();
    await expect(page.locator(".sb-general-wrap .sb-exp")).not.toHaveClass(/sb-exp-collapsed/);
    await expect(page.locator(".sb-general-wrap")).toHaveScreenshot("remote-card-editor-general-options.png");
  });

  test("captures general options with long press enabled (button list shown)", async ({ page }) => {
    await mountEditor(page, "active", { hold_repeat: { enabled: true, channel: false } });
    await page.locator(".sb-general-wrap .sb-exp-hdr").click();
    await expect(page.locator(".sb-general-wrap .sb-opt-long-press ha-form")).toBeVisible();
    await expect(page.locator(".sb-general-wrap")).toHaveScreenshot("remote-card-editor-general-options-long-press.png");
  });

  test("toggling the hold-to-repeat switch fires config-changed with the hold_repeat block", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-general-wrap .sb-exp-hdr").click();

    const changes = [];
    await page.exposeFunction("__pushLongPressChange", (detail) => changes.push(detail));
    await page.evaluate(() => {
      document.querySelector("sofabaton-virtual-remote-editor").addEventListener(
        "config-changed",
        (event) => window.__pushLongPressChange(event.detail?.config ?? null),
      );
    });

    await page.locator(".sb-general-wrap .sb-opt-long-press ha-switch").click();
    await expect.poll(() => changes.length).toBeGreaterThan(0);
    expect(changes[changes.length - 1]?.hold_repeat).toEqual({ enabled: true });
    await expect(page.locator(".sb-general-wrap .sb-opt-long-press ha-form")).toBeVisible();

    await page.locator(".sb-general-wrap .sb-opt-long-press ha-switch").click();
    await expect.poll(() => changes.length).toBeGreaterThan(1);
    expect("hold_repeat" in (changes[changes.length - 1] ?? {})).toBe(false);
  });

  test("background override switch materializes a color and drops it again when off", async ({ page }) => {
    await mountEditor(page, "active");
    await page.locator(".sb-styling-wrap .sb-exp-hdr").click();

    const changes = [];
    await page.exposeFunction("__pushStylingChange", (detail) => changes.push(detail));
    await page.evaluate(() => {
      document.querySelector("sofabaton-virtual-remote-editor").addEventListener(
        "config-changed",
        (event) => window.__pushStylingChange(event.detail?.config ?? null),
      );
    });

    await page.locator(".sb-styling-wrap .sb-opt-background ha-switch").click();
    await expect.poll(() => changes.length).toBeGreaterThan(0);
    expect(changes[changes.length - 1]?.background_override).toEqual([255, 255, 255]);
    expect("use_background_override" in (changes[changes.length - 1] ?? {})).toBe(false);
    await expect(page.locator(".sb-styling-wrap .sb-opt-background ha-form")).toBeVisible();

    await page.locator(".sb-styling-wrap .sb-opt-background ha-switch").click();
    await expect.poll(() => changes.length).toBeGreaterThan(1);
    expect("background_override" in (changes[changes.length - 1] ?? {})).toBe(false);
    await expect(page.locator(".sb-styling-wrap .sb-opt-background ha-form")).toHaveCount(0);
  });

  test("captures device layout with the shortcuts slot editor open", async ({ page }) => {
    // Icon must come from the harness ha-icon stub's glyph map.
    await mountEditor(page, "device_mode", {
      device_mode: {
        shortcuts: { 1: { left: { icon: "mdi:television-play", command_id: 13 } } },
      },
    });
    await page.locator(".sb-layout-wrap .sb-exp-hdr").click();
    // The harness assigns hass once, before setConfig; HA re-assigns it on
    // every state change, which is what kicks off integration detection.
    // Mirror one such re-assignment.
    await page.evaluate(() => {
      const editor = document.querySelector("sofabaton-virtual-remote-editor");
      editor.hass = editor.hass;
    });
    // Device selections exist only after the async x1s integration
    // detection resolves; selecting earlier gets reset to "default".
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector("sofabaton-virtual-remote-editor")
              ._editorIntegrationDomain,
        ),
      )
      .toBe("sofabaton_x1s");
    // Drive the layout selection directly (the ha-select stub has no menu):
    // a concrete device selection is what reveals the slot editor.
    await page.evaluate(() => {
      document
        .querySelector("sofabaton-virtual-remote-editor")
        ._onSelectLayout("device:1");
    });
    await expect(page.locator(".sb-shortcut-strip")).toBeVisible();
    await expect(page.locator(".sb-shortcut-slot.is-configured")).toHaveCount(1);

    // Opening the configured slot seeds the panel from the stored config.
    await page.locator(".sb-shortcut-slot").first().click();
    await expect(page.locator(".sb-shortcut-panel")).toBeVisible();
    await expect(page.locator(".sb-layout-wrap")).toHaveScreenshot(
      "remote-card-editor-device-shortcuts.png",
    );
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

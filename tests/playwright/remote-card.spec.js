import { expect, test } from "@playwright/test";

async function mountCard(page, scenario = "active", config = {}) {
  await page.goto("/tests/playwright/fixtures/remote-card-harness.html");
  await page.evaluate(
    async ({ scenarioName, nextConfig }) => {
      await window.__remoteCardHarness.mountCard({
        scenario: scenarioName,
        config: nextConfig,
      });
    },
    { scenarioName: scenario, nextConfig: config },
  );
}

function cardLocator(page) {
  return page.locator("#mount");
}

test.describe("remote card playwright harness", () => {
  test("captures powered-off visual baseline", async ({ page }) => {
    await mountCard(page, "powered_off");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-powered-off.png");
  });

  test("captures active visual baseline", async ({ page }) => {
    await mountCard(page, "active");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-active.png");
  });

  test("captures macros drawer visual baseline", async ({ page }) => {
    await mountCard(page, "active");
    await page.locator(".macroFavoritesButton").first().click();
    await expect(page.locator(".mf-overlay--macros")).toHaveClass(/open/);
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-macros-open.png");
  });

  test("captures favorites drawer visual baseline", async ({ page }) => {
    await mountCard(page, "active");
    await page.locator(".macroFavoritesButton").nth(1).click();
    await expect(page.locator(".mf-overlay--favorites")).toHaveClass(/open/);
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-favorites-open.png");
  });

  test("captures loading visual baseline", async ({ page }) => {
    await mountCard(page, "loading");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-loading.png");
  });

  test("captures activity menu visual baseline", async ({ page }) => {
    await mountCard(page, "active");
    await page.locator("ha-select").click();
    await expect(page.locator("ha-select")).toHaveAttribute("open", "");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-activity-menu-open.png");
  });

  test("captures reordered layout with macro favorites last", async ({ page }) => {
    await mountCard(page, "active", {
      group_order: ["dpad", "colors", "mid", "media", "macro_favorites", "activity", "nav", "abc"],
      show_activity: false,
      show_nav: false,
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-macros-last.png");
  });

  test("captures macros-only single-tab layout", async ({ page }) => {
    await mountCard(page, "active", {
      show_favorites_button: false,
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-macros-only.png");
  });

  test("captures favorites-only single-tab layout", async ({ page }) => {
    await mountCard(page, "active", {
      show_macros_button: false,
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-favorites-only.png");
  });

  test("captures volume-only middle cluster", async ({ page }) => {
    await mountCard(page, "active", {
      show_channel: false,
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-volume-only.png");
  });

  test("captures channel-only middle cluster", async ({ page }) => {
    await mountCard(page, "active", {
      show_volume: false,
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-channel-only.png");
  });

  test("captures macro favorites before activity row", async ({ page }) => {
    await mountCard(page, "active", {
      group_order: ["macro_favorites", "activity", "dpad", "nav", "mid", "media", "colors", "abc"],
    });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-layout-macros-before-activity.png");
  });

  test("opens one drawer at a time and closes on outside click", async ({ page }) => {
    await mountCard(page, "active");

    const macrosButton = page.locator(".macroFavoritesButton").first();
    const favoritesButton = page.locator(".macroFavoritesButton").nth(1);
    const macrosOverlay = page.locator(".mf-overlay--macros");
    const favoritesOverlay = page.locator(".mf-overlay--favorites");

    await macrosButton.click();
    await expect(macrosOverlay).toHaveClass(/open/);
    await expect(favoritesOverlay).not.toHaveClass(/open/);

    await favoritesButton.click();
    await expect(favoritesOverlay).toHaveClass(/open/);
    await expect(macrosOverlay).not.toHaveClass(/open/);

    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await expect(macrosOverlay).not.toHaveClass(/open/);
    await expect(favoritesOverlay).not.toHaveClass(/open/);
  });

  test("updates activity switching behavior", async ({ page }) => {
    await mountCard(page, "active");
    await page.locator("ha-select").click();
    await page.locator("ha-select").evaluate((node) => {
      const option = Array.from(node.shadowRoot.querySelectorAll(".option"))
        .find((entry) => entry.textContent.trim() === "Play Xbox");
      option.click();
    });

    await expect
      .poll(async () =>
        page.evaluate(() => window.__remoteCardHarness.getServiceCalls()),
      )
      .toContainEqual(
        expect.objectContaining({
          domain: "remote",
          service: "turn_on",
          data: expect.objectContaining({ activity: "Play Xbox" }),
        }),
      );

    await expect
      .poll(async () =>
        page.evaluate(() => window.__remoteCardHarness.getRemoteState()?.attributes?.current_activity),
      )
      .toBe("Play Xbox");
  });

  test("keeps activity row above drawer while the select menu is marked open", async ({ page }) => {
    await mountCard(page, "active");
    await page.locator(".macroFavoritesButton").first().click();
    await page.locator("ha-select").evaluate((node) => node.dispatchEvent(new Event("opened", { bubbles: true, composed: true })));

    const zIndices = await page.evaluate(() => {
      const activityRow = document.querySelector(".activityRow");
      const mfContainer = document.querySelector(".mf-container");
      return {
        activity: activityRow ? getComputedStyle(activityRow).zIndex : null,
        drawer: mfContainer ? getComputedStyle(mfContainer).zIndex : null,
      };
    });

    expect(zIndices).toEqual({ activity: "10", drawer: "9" });
  });

  test("shows hover and active state styling on macro tabs", async ({ page }) => {
    await mountCard(page, "active");
    const macrosButton = page.locator(".macroFavoritesButton").first();

    await macrosButton.hover();
    const isHovered = await macrosButton.evaluate((node) => node.matches(":hover"));
    expect(isHovered).toBe(true);

    await macrosButton.click();
    await expect(macrosButton).toHaveClass(/active-tab/);
  });

  test("respects group order and visibility overrides", async ({ page }) => {
    await mountCard(page, "active", {
      group_order: ["media", "activity", "macro_favorites", "dpad", "mid", "colors", "abc", "nav"],
      show_nav: false,
      show_colors: false,
    });

    const visibleGroups = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".layout-container > *"))
        .filter((node) => getComputedStyle(node).display !== "none")
        .map((node) => node.className),
    );

    expect(visibleGroups.slice(0, 5)).toEqual([
      "media media--play media--x1",
      "activityRow",
      "mf-container",
      "dpad",
      "mid mid--dual mid--x1",
    ]);
    expect(visibleGroups.some((name) => name.includes("row3"))).toBe(false);
    expect(visibleGroups.some((name) => name.includes("colors"))).toBe(false);
  });

  test("renders a single macro tab full width when favorites are hidden", async ({ page }) => {
    await mountCard(page, "active", {
      show_favorites_button: false,
    });

    await expect(page.locator(".macroFavoritesGrid")).toHaveClass(/single/);
    await expect(page.locator(".macroFavoritesButton:visible")).toHaveCount(1);
    await expect(page.locator(".macroFavoritesButton:visible").first()).toContainText("Macros >");
  });

  test("renders a single favorites tab full width when macros are hidden", async ({ page }) => {
    await mountCard(page, "active", {
      show_macros_button: false,
    });

    await expect(page.locator(".macroFavoritesGrid")).toHaveClass(/single/);
    await expect(page.locator(".macroFavoritesButton:visible")).toHaveCount(1);
    await expect(page.locator(".macroFavoritesButton:visible").first()).toContainText("Favorites >");
  });

  test("supports moving macro favorites ahead of the activity selector", async ({ page }) => {
    await mountCard(page, "active", {
      group_order: ["macro_favorites", "activity", "dpad", "nav", "mid", "media", "colors", "abc"],
    });

    const visibleGroups = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".layout-container > *"))
        .filter((node) => getComputedStyle(node).display !== "none")
        .map((node) => node.className),
    );

    expect(visibleGroups.slice(0, 2)).toEqual(["mf-container", "activityRow"]);
  });

  test("switches middle cluster into volume-only mode", async ({ page }) => {
    await mountCard(page, "active", {
      show_channel: false,
    });

    await expect(page.locator(".mid")).toHaveClass(/mid--volume/);
    await expect(page.locator(".mid")).not.toHaveClass(/mid--dual/);
  });

  test("switches middle cluster into channel-only mode", async ({ page }) => {
    await mountCard(page, "active", {
      show_volume: false,
    });

    await expect(page.locator(".mid")).toHaveClass(/mid--channel/);
    await expect(page.locator(".mid")).not.toHaveClass(/mid--dual/);
  });

  test("handles the hub x2 integration scenario without losing drawer content", async ({ page }) => {
    await mountCard(page, "hub_x2");

    await expect(page.locator(".abc")).toBeVisible();
    await page.locator(".macroFavoritesButton").first().click();
    await expect(page.locator(".mf-overlay--macros .drawer-btn")).toHaveCount(1);
    await expect(page.locator(".mf-overlay--macros")).toHaveClass(/open/);
    await expect(page.locator(".mf-overlay--favorites")).not.toHaveClass(/open/);
    await expect(page.locator(".mf-overlay--favorites .drawer-btn")).toHaveCount(1);
  });
});

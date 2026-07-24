import { expect, test } from "@playwright/test";

const HARNESS_URL = "/tests/playwright/fixtures/remote-card-harness.html";

async function mountCard(page, scenario = "active", config = {}) {
  await page.goto(HARNESS_URL);
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
  test("uses RTL Arabic UI without swapping the physical left and right keys", async ({ page }) => {
    await mountCard(page, "active", { show_automation_assist: true });
    await page.evaluate(() => {
      const card = document.querySelector("sofabaton-virtual-remote");
      card.hass = {
        ...card.hass,
        locale: { language: "ar-SA" },
      };
    });

    const card = page.locator("sofabaton-virtual-remote");
    await expect(card).toHaveAttribute("lang", "ar-sa");
    await expect(card).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".automationAssist__label")).toHaveText("التقاط الأزرار");

    const left = await page.locator(".dpad .area-left").boundingBox();
    const right = await page.locator(".dpad .area-right").boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left.x).toBeLessThan(right.x);
  });

  test("emits Home Assistant haptic events for core remote interactions", async ({ page }) => {
    await mountCard(page, "active");

    await page.evaluate(() => {
      window.__remoteCardHaptics = [];
      document.addEventListener(
        "haptic",
        (event) => {
          window.__remoteCardHaptics.push(event.detail ?? null);
        },
        true,
      );
    });

    await page.locator(".macroFavoritesButton").first().click();
    await page.locator(".dpad .key").first().click();

    await page.locator("ha-select").click();
    await page.locator("ha-select").evaluate((node) => {
      const option = Array.from(node.shadowRoot.querySelectorAll(".option"))
        .find((entry) => entry.textContent.trim() === "Play Xbox");
      option.click();
    });

    await expect
      .poll(async () => page.evaluate(() => window.__remoteCardHaptics))
      .toEqual(["light", "light", "light"]);
  });

  test("keeps the idle DOM lean and updates command feedback without a Lit render", async ({ page }) => {
    await mountCard(page, "active");

    const baseline = await page.evaluate(() => {
      const card = document.querySelector("sofabaton-virtual-remote");
      const root = card.shadowRoot;
      card.__renderAuditUpdates = 0;
      const original = card.performUpdate;
      card.performUpdate = function (...args) {
        this.__renderAuditUpdates += 1;
        return original.apply(this, args);
      };
      return {
        keyHosts: root.querySelectorAll("sb-key-button").length,
        legacyButtonCards: root.querySelectorAll("hui-button-card").length,
        assistModals: root.querySelectorAll(".sb-modal").length,
        closedDrawerItems: root.querySelectorAll(".mf-overlay .drawer-btn").length,
      };
    });

    expect(baseline).toEqual({
      keyHosts: 22,
      legacyButtonCards: 0,
      assistModals: 0,
      closedDrawerItems: 0,
    });

    await page.locator(".dpad .key").first().click();
    await expect(page.locator(".loadIndicator")).toHaveClass(/is-loading/);
    await page.waitForTimeout(1050);
    await expect(page.locator(".loadIndicator")).not.toHaveClass(/is-loading/);
    expect(
      await page.evaluate(
        () => document.querySelector("sofabaton-virtual-remote").__renderAuditUpdates,
      ),
    ).toBe(0);

    const nativeControl = page.locator(".dpad .sb-key-control").first();
    await expect(nativeControl).toHaveAttribute("aria-label", "Up");
    await nativeControl.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            window.__remoteCardHarness
              .getServiceCalls()
              .filter((call) => call.domain === "remote" && call.service === "send_command")
              .length,
        ),
      )
      .toBe(2);
  });

  test("centers native controls and keeps tab and drawer labels fully visible", async ({ page }) => {
    await mountCard(page, "active");

    const tabLabels = page.locator(".macroFavoritesButton .sb-key-control__label");
    await expect(tabLabels).toHaveText(["Macros >", "Favorites >"]);

    const closedGeometry = await page.evaluate(() => {
      const root = document.querySelector("sofabaton-virtual-remote").shadowRoot;
      const metrics = (hostSelector, contentSelector) => {
        const host = root.querySelector(hostSelector);
        const control = host.shadowRoot.querySelector(".sb-key-control");
        const content = host.shadowRoot.querySelector(contentSelector);
        const outer = control.getBoundingClientRect();
        const inner = content.getBoundingClientRect();
        return {
          centerX: Math.abs((outer.left + outer.right) / 2 - (inner.left + inner.right) / 2),
          centerY: Math.abs((outer.top + outer.bottom) / 2 - (inner.top + inner.bottom) / 2),
          fullyContained:
            inner.left >= outer.left - 0.5 &&
            inner.right <= outer.right + 0.5 &&
            inner.top >= outer.top - 0.5 &&
            inner.bottom <= outer.bottom + 0.5,
        };
      };
      return {
        upIcon: metrics(".dpad .area-up", "ha-icon"),
        favoritesTab: metrics(
          ".macroFavoritesButton:nth-child(2)",
          ".sb-key-control__label",
        ),
      };
    });

    expect(closedGeometry.upIcon.centerX).toBeLessThanOrEqual(1);
    expect(closedGeometry.upIcon.centerY).toBeLessThanOrEqual(1);
    expect(closedGeometry.upIcon.fullyContained).toBe(true);
    expect(closedGeometry.favoritesTab.centerX).toBeLessThanOrEqual(1);
    expect(closedGeometry.favoritesTab.centerY).toBeLessThanOrEqual(1);
    expect(closedGeometry.favoritesTab.fullyContained).toBe(true);

    await page.locator(".macroFavoritesButton").nth(1).click();
    await expect(tabLabels).toHaveText(["Macros >", "Favorites >"]);
    const favoriteNames = page.locator(".mf-overlay--favorites .drawer-btn .name");
    await expect(favoriteNames).toHaveText([
      "Netflix",
      "YouTube",
      "Plex",
      "Prime Video",
      "Disney+",
      "Spotify",
    ]);
    const drawerLabelsContained = await favoriteNames.evaluateAll((labels) =>
      labels.every((label) => {
        const button = label.closest(".drawer-btn");
        const outer = button.getBoundingClientRect();
        const inner = label.getBoundingClientRect();
        return (
          inner.left >= outer.left - 0.5 &&
          inner.right <= outer.right + 0.5 &&
          inner.top >= outer.top - 0.5 &&
          inner.bottom <= outer.bottom + 0.5 &&
          label.scrollWidth <= label.clientWidth &&
          label.scrollHeight <= label.clientHeight
        );
      }),
    );
    expect(drawerLabelsContained).toBe(true);
  });

  test("applies the selected theme radius to groups, keys, and drawer buttons", async ({ page }) => {
    await mountCard(page, "active", { theme: "Harness Square" });
    await page.locator(".macroFavoritesButton").first().click();

    const radii = await page.evaluate(() => {
      const card = document.querySelector("sofabaton-virtual-remote");
      const root = card.shadowRoot;
      const controlRadius = (host) =>
        getComputedStyle(host.shadowRoot.querySelector(".sb-key-control")).borderRadius;
      return {
        resolvedTheme: getComputedStyle(root.querySelector("ha-card"))
          .getPropertyValue("--sb-group-radius")
          .trim(),
        group: getComputedStyle(root.querySelector(".dpad")).borderRadius,
        key: controlRadius(root.querySelector(".dpad .area-up")),
        drawer: getComputedStyle(root.querySelector(".mf-overlay--macros .drawer-btn"))
          .borderRadius,
        segmentedTab: controlRadius(root.querySelector(".macroFavoritesButton")),
        colorPill: controlRadius(root.querySelector(".key--color")),
      };
    });

    expect(radii).toEqual({
      resolvedTheme: "6px",
      group: "6px",
      key: "6px",
      drawer: "6px",
      segmentedTab: "0px",
      colorPill: "999px",
    });
  });

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

  test("captures default-theme visual baseline", async ({ page }) => {
    await mountCard(page, "active", { theme: "" });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-default-theme.png");
  });

  test("captures shrunk narrow layout baseline", async ({ page }) => {
    await mountCard(page, "active", { max_width: 360, shrink: 20 });
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-shrunk-narrow.png");
  });

  test("captures custom favorites drawer baseline", async ({ page }) => {
    await mountCard(page, "active", {
      custom_favorites: [
        { name: "Netflix", icon: "mdi:play-circle", command_id: 601, device_id: 3 },
        { name: "Cinema Scene", action: { action: "perform-action", perform_action: "scene.turn_on" } },
      ],
    });
    await page.locator(".macroFavoritesButton").nth(1).click();
    await expect(page.locator(".mf-overlay--favorites")).toHaveClass(/open/);
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-custom-favorites-open.png");
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
      const activityRow = window.__remoteCardHarness.query(".activityRow");
      const mfContainer = window.__remoteCardHarness.query(".mf-container");
      return {
        activity: activityRow ? getComputedStyle(activityRow).zIndex : null,
        drawer: mfContainer ? getComputedStyle(mfContainer).zIndex : null,
      };
    });

    expect(zIndices).toEqual({ activity: "10", drawer: "9" });
  });

  test("shows consistent hover and pressed state layers on keys, tabs, and drawer buttons", async ({ page }) => {
    await mountCard(page, "active");
    const stateLayer = (locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node, "::before");
        return { opacity: style.opacity, background: style.backgroundColor };
      });
    const pressState = async (locator) => {
      const box = await locator.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const state = await stateLayer(locator);
      await page.mouse.up();
      return state;
    };

    const key = page.locator(".dpad .area-up .sb-key-control");
    expect((await stateLayer(key)).opacity).toBe("0");
    await key.hover();
    await expect.poll(async () => (await stateLayer(key)).opacity).toBe("1");
    const keyHover = await stateLayer(key);
    const keyPressed = await pressState(key);
    expect(keyPressed.opacity).toBe("1");
    expect(keyPressed.background).not.toBe(keyHover.background);

    const macrosButton = page.locator(".macroFavoritesButton").first();
    const tabControl = macrosButton.locator(".sb-key-control");
    await tabControl.hover();
    await expect.poll(async () => (await stateLayer(tabControl)).opacity).toBe("1");
    const tabHover = await stateLayer(tabControl);
    const tabPressed = await pressState(tabControl);
    await expect(macrosButton).toHaveClass(/active-tab/);

    const drawerButton = page.locator(".mf-overlay--macros .drawer-btn").first();
    await drawerButton.hover();
    await expect.poll(async () => (await stateLayer(drawerButton)).opacity).toBe("1");
    const drawerHover = await stateLayer(drawerButton);
    const drawerPressed = await pressState(drawerButton);

    expect(tabHover.background).toBe(keyHover.background);
    expect(drawerHover.background).toBe(keyHover.background);
    expect(tabPressed.background).toBe(keyPressed.background);
    expect(drawerPressed.background).toBe(keyPressed.background);
  });

  test("respects group order and visibility overrides", async ({ page }) => {
    await mountCard(page, "active", {
      group_order: ["media", "activity", "macro_favorites", "dpad", "mid", "colors", "abc", "nav"],
      show_nav: false,
      show_colors: false,
    });

    const visibleGroups = await page.evaluate(() =>
      window.__remoteCardHarness
        .queryAll(".layout-container > *")
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
      window.__remoteCardHarness
        .queryAll(".layout-container > *")
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

  test("automation assist on X2 subscribes to hub MQTT and opens the discovery modal", async ({ page }) => {
    await mountCard(page, "hub_x2", { show_automation_assist: true });

    // Pressing any key starts a capture session, which brings up the MQTT
    // subscription for the hub's `<mac>/up` topic.
    await page.locator(".dpad .key").first().click();

    // The subscription legitimately waits for the hub request queue to drain
    // (three key fetches at 3s gaps), so allow well beyond that.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.__remoteCardHarness
              .getMqttSubscriptions()
              .filter((sub) => !sub.unsubscribed)
              .map((sub) => sub.topic),
          ),
        { timeout: 20000 },
      )
      .toContain("AABBCC112233/up");

    // The capture itself lands in a persistent notification.
    const notification = await page.evaluate(() =>
      window.__remoteCardHarness
        .getServiceCalls()
        .find((call) => call.domain === "persistent_notification" && call.service === "create"),
    );
    expect(notification).toBeTruthy();

    // A remote keypress arriving over MQTT opens the device-detected modal.
    await page.evaluate(() => {
      window.__remoteCardHarness.pushMqttMessage(
        "AABBCC112233/up",
        JSON.stringify({ device_id: 7, key_id: 12 }),
      );
    });
    await expect(page.locator(".sb-modal")).toHaveClass(/open/);
    await expect(page.locator(".sb-modal__text")).toContainText("Device 7");
  });

  test("lazily renders hub x2 drawer content without losing it when opened", async ({ page }) => {
    await mountCard(page, "hub_x2");

    await expect(page.locator(".abc")).toBeVisible();
    await expect(page.locator(".mf-overlay .drawer-btn")).toHaveCount(0);
    await page.locator(".macroFavoritesButton").first().click();
    await expect(page.locator(".mf-overlay--macros .drawer-btn")).toHaveCount(1);
    await expect(page.locator(".mf-overlay--macros")).toHaveClass(/open/);
    await expect(page.locator(".mf-overlay--favorites")).not.toHaveClass(/open/);
    await expect(page.locator(".mf-overlay--favorites .drawer-btn")).toHaveCount(0);

    await page.locator(".macroFavoritesButton").nth(1).click();
    await expect(page.locator(".mf-overlay--favorites")).toHaveClass(/open/);
    await expect(page.locator(".mf-overlay--favorites .drawer-btn")).toHaveCount(1);
  });
});

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
    await expect(tabLabels).toHaveText(["Macros", "Favorites"]);

    const closedGeometry = await page.evaluate(() => {
      const root = document.querySelector("sofabaton-virtual-remote").shadowRoot;
      const metrics = (hostSelector, contentSelector) => {
        const host = root.querySelector(hostSelector);
        const control = host.shadowRoot.querySelector(".sb-key-control");
        const content = [...host.shadowRoot.querySelectorAll(contentSelector)]
          .filter((element) => !element.hidden);
        const outer = control.getBoundingClientRect();
        const contentRects = content.map((element) => element.getBoundingClientRect());
        const inner = {
          left: Math.min(...contentRects.map((rect) => rect.left)),
          right: Math.max(...contentRects.map((rect) => rect.right)),
          top: Math.min(...contentRects.map((rect) => rect.top)),
          bottom: Math.max(...contentRects.map((rect) => rect.bottom)),
        };
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
          ".sb-key-control__label, .sb-key-control__trailing-icon",
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
    await expect(tabLabels).toHaveText(["Macros", "Favorites"]);
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

  test("keeps narrow drawer tabs readable with the chevron at the logical inline end", async ({ page }) => {
    await mountCard(page, "active", { max_width: 230 });
    await page.locator("#mount").evaluate((mount) => {
      mount.style.width = "230px";
    });

    const tabGeometry = () => page.evaluate(() => {
      const card = document.querySelector("sofabaton-virtual-remote");
      const hosts = [...card.shadowRoot.querySelectorAll(".macroFavoritesButton")];
      return hosts.map((host) => {
        const control = host.shadowRoot.querySelector(".sb-key-control");
        const label = host.shadowRoot.querySelector(".sb-key-control__label");
        const icon = host.shadowRoot.querySelector(".sb-key-control__trailing-icon");
        const textRange = document.createRange();
        textRange.selectNodeContents(label);
        const text = textRange.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const cellRect = host.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        return {
          // The control carries the hover/press overlay, so it must fill the
          // whole tab cell (up to the 1px divider) or the highlight renders
          // as an inset band instead of covering the full button.
          controlCoversCell:
            Math.abs(controlRect.top - cellRect.top) <= 0.5 &&
            Math.abs(cellRect.bottom - controlRect.bottom) <= 0.5 &&
            Math.abs(controlRect.left - cellRect.left) <= 1.5 &&
            Math.abs(cellRect.right - controlRect.right) <= 1.5,
          direction: getComputedStyle(control).direction,
          text: label.textContent,
          labelClipped: label.scrollWidth > label.clientWidth + 0.5,
          iconName: icon.getAttribute("icon"),
          textLeft: text.left,
          textRight: text.right,
          iconLeft: iconRect.left,
          iconRight: iconRect.right,
        };
      });
    });

    const setLanguage = (language) => page.evaluate((lang) => {
      const card = document.querySelector("sofabaton-virtual-remote");
      card.hass = {
        ...card.hass,
        locale: { language: lang },
      };
    }, language);

    const [, ltr] = await tabGeometry();
    expect(ltr.direction).toBe("ltr");
    expect(ltr.labelClipped).toBe(false);
    expect(ltr.iconName).toBe("mdi:chevron-right");
    expect(ltr.iconLeft).toBeGreaterThanOrEqual(ltr.textRight - 0.5);

    await setLanguage("ar-SA");
    await expect(page.locator("sofabaton-virtual-remote")).toHaveAttribute("dir", "rtl");

    const [, rtl] = await tabGeometry();
    expect(rtl.direction).toBe("rtl");
    expect(rtl.labelClipped).toBe(false);
    expect(rtl.iconName).toBe("mdi:chevron-left");
    expect(rtl.iconRight).toBeLessThanOrEqual(rtl.textLeft + 0.5);

    // The widest tab labels across all shipped locales (nl "Favorieten",
    // en-GB "Favourites", ar "الماكرو"/"المفضلات") must render without an
    // ellipsis at the 230px minimum card width, at the shared tab font size.
    const worstCaseLocales = [
      ["nl-NL", ["Macro's", "Favorieten"]],
      ["en-GB", ["Macros", "Favourites"]],
      ["ar-SA", ["الماكرو", "المفضلات"]],
      ["en", ["Macros", "Favorites"]],
    ];
    const tabLabels = page.locator(".macroFavoritesButton .sb-key-control__label");
    for (const [locale, expectedLabels] of worstCaseLocales) {
      await setLanguage(locale);
      await expect(tabLabels).toHaveText(expectedLabels);
      for (const tab of await tabGeometry()) {
        expect(tab.labelClipped, `${locale} tab "${tab.text}" fits unclipped`).toBe(false);
        expect(tab.controlCoversCell, `${locale} tab "${tab.text}" hover surface fills the cell`).toBe(true);
      }
    }
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
        activitySelect: getComputedStyle(root.querySelector(".sb-activity-select"))
          .borderRadius,
      };
    });

    expect(radii).toEqual({
      resolvedTheme: "6px",
      group: "6px",
      key: "6px",
      drawer: "6px",
      segmentedTab: "0px",
      colorPill: "999px",
      activitySelect: "6px",
    });
  });

  test("mode toggle and selector fuse into one control with a flat meeting edge", async ({ page }) => {
    await mountCard(page, "device_mode", { theme: "Harness Square" });

    const corners = () => page.evaluate(() => {
      const root = document.querySelector("sofabaton-virtual-remote").shadowRoot;
      const pick = (el) => {
        const cs = getComputedStyle(el);
        return {
          topLeft: cs.borderTopLeftRadius,
          topRight: cs.borderTopRightRadius,
          bottomLeft: cs.borderBottomLeftRadius,
          bottomRight: cs.borderBottomRightRadius,
        };
      };
      return {
        toggle: pick(root.querySelector(".sb-mode-toggle")),
        select: pick(root.querySelector(".activityRow--with-toggle .sb-activity-select")),
      };
    });

    // LTR: toggle sits left, so its left corners carry the theme radius and
    // the meeting edge (toggle right / select left) is square.
    const ltr = await corners();
    expect(ltr.toggle).toEqual({ topLeft: "6px", bottomLeft: "6px", topRight: "0px", bottomRight: "0px" });
    expect(ltr.select).toEqual({ topLeft: "0px", bottomLeft: "0px", topRight: "6px", bottomRight: "6px" });

    // RTL: the row mirrors, the toggle sits visually right, and the fused
    // edge flips with it via the logical corner properties.
    await page.evaluate(() => {
      const card = document.querySelector("sofabaton-virtual-remote");
      card.hass = { ...card.hass, locale: { language: "ar-SA" } };
    });
    await expect(page.locator("sofabaton-virtual-remote")).toHaveAttribute("dir", "rtl");
    const rtl = await corners();
    expect(rtl.toggle).toEqual({ topRight: "6px", bottomRight: "6px", topLeft: "0px", bottomLeft: "0px" });
    expect(rtl.select).toEqual({ topRight: "0px", bottomRight: "0px", topLeft: "6px", bottomLeft: "6px" });
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

  test("renders status notices as an in-flow row above the selector, never as an overlay", async ({ page }) => {
    // The notice used to be a 12px, background-less absolute overlay on top
    // of the activity selector; it now occupies its own layout row with an
    // opaque tinted surface and body-sized text.
    for (const scenario of ["unavailable", "no_activities", "device_keymap_missing"]) {
      await mountCard(page, scenario);
      const notice = page.locator(".sb-notice");
      await expect(notice).toBeVisible();
      await expect(page.locator(".warn")).toHaveCount(0);
      const noticeBox = await notice.boundingBox();
      const selectBox = await page.locator("ha-select").boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(selectBox).not.toBeNull();
      expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(selectBox.y);
      const style = await notice.evaluate((node) => {
        const cs = getComputedStyle(node);
        return { fontSize: parseFloat(cs.fontSize), opacity: cs.opacity, position: cs.position, background: cs.backgroundColor };
      });
      expect(style.fontSize).toBeGreaterThanOrEqual(13);
      expect(style.opacity).toBe("1");
      expect(style.position).toBe("static");
      expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("captures unavailable notice visual baseline", async ({ page }) => {
    await mountCard(page, "unavailable");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-unavailable.png");
  });

  test("captures no-activities notice visual baseline", async ({ page }) => {
    await mountCard(page, "no_activities");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-no-activities.png");
  });

  test("captures device keymap missing notice visual baseline", async ({ page }) => {
    await mountCard(page, "device_keymap_missing");
    await expect(page.locator(".sb-notice")).toContainText("not cached yet");
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-device-keymap-missing.png");
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

  test("device-mode shortcuts row keeps slot positions and sends the device command", async ({ page }) => {
    // Icons must come from the harness ha-icon stub's glyph map.
    await mountCard(page, "device_mode", {
      device_mode: {
        open_device: 1,
        shortcuts: {
          1: {
            left: { icon: "mdi:television-play", command_id: 13 },
            right: { icon: "mdi:play-circle", command_id: 15 },
          },
        },
      },
    });

    const row = page.locator(".row3.shortcuts");
    await expect(row).toBeVisible();
    await expect(row.locator("sb-key-button")).toHaveCount(2);
    await expect(row.locator(".shortcut-spacer")).toHaveCount(1);

    // The middle slot is unconfigured: its cell stays empty, so the two
    // configured keys keep their outer-column positions.
    const left = await row.locator("sb-key-button").first().boundingBox();
    const right = await row.locator("sb-key-button").nth(1).boundingBox();
    expect(right.x - left.x).toBeGreaterThan(left.width * 1.5);

    // The aria label carries the command name resolved from the keymap.
    await expect(row.locator("sb-key-button .sb-key-control").first()).toHaveAttribute(
      "aria-label",
      "Input HDMI 1",
    );

    // Baseline before any interaction (a click would bake the pressed
    // overlay into the shot).
    await expect(cardLocator(page)).toHaveScreenshot("remote-card-device-shortcuts.png");

    await row.locator("sb-key-button").first().click();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.__remoteCardHarness
            .getServiceCalls()
            .filter((call) => call.domain === "remote" && call.service === "send_command")
            .map((call) => call.data),
        ),
      )
      .toEqual([{ entity_id: "remote.living_room", command: 13, device: 1 }]);
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
    const macrosTab = page.locator(".macroFavoritesButton:visible").first();
    await expect(macrosTab).toContainText("Macros");
    await expect(macrosTab.locator('ha-icon[icon="mdi:chevron-right"]')).toHaveCount(1);
  });

  test("renders a single favorites tab full width when macros are hidden", async ({ page }) => {
    await mountCard(page, "active", {
      show_macros_button: false,
    });

    await expect(page.locator(".macroFavoritesGrid")).toHaveClass(/single/);
    await expect(page.locator(".macroFavoritesButton:visible")).toHaveCount(1);
    const favoritesTab = page.locator(".macroFavoritesButton:visible").first();
    await expect(favoritesTab).toContainText("Favorites");
    await expect(favoritesTab.locator('ha-icon[icon="mdi:chevron-right"]')).toHaveCount(1);
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

  // ---------- long press (hold-to-repeat) ----------

  async function sendCommandCount(page) {
    return page.evaluate(
      () =>
        window.__remoteCardHarness
          .getServiceCalls()
          .filter((call) => call.domain === "remote" && call.service === "send_command")
          .length,
    );
  }

  async function holdKey(page, selector, ms) {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  test("long press off by default: holding volume sends exactly one command on release", async ({ page }) => {
    await mountCard(page, "active");
    await holdKey(page, "sb-key-button.mid-btn-volup", 1200);
    await page.waitForTimeout(300);
    expect(await sendCommandCount(page)).toBe(1);
  });

  test("long press on: holding volume repeats and the release adds nothing; a tap still sends once", async ({ page }) => {
    await mountCard(page, "active", { hold_repeat: { enabled: true } });

    // Hold ~1.2s: first repeat after the 400ms delay, then every 250ms
    // (400, 650, 900, 1150) = 4 sends; the release must not add a fifth.
    await holdKey(page, "sb-key-button.mid-btn-volup", 1200);
    const afterHold = await sendCommandCount(page);
    expect(afterHold).toBeGreaterThanOrEqual(3);
    expect(afterHold).toBeLessThanOrEqual(5);
    await page.waitForTimeout(1300);
    expect(await sendCommandCount(page)).toBe(afterHold);

    // A plain tap (shorter than the delay) still sends exactly once.
    await holdKey(page, "sb-key-button.mid-btn-volup", 100);
    await page.waitForTimeout(600);
    expect(await sendCommandCount(page)).toBe(afterHold + 1);
  });

  test("long press only repeats the selected groups; other keys never repeat", async ({ page }) => {
    await mountCard(page, "active", { hold_repeat: { enabled: true, volume: false } });

    // Volume deselected: one send on release.
    await holdKey(page, "sb-key-button.mid-btn-volup", 1000);
    await page.waitForTimeout(300);
    expect(await sendCommandCount(page)).toBe(1);

    // D-pad still selected: repeats.
    await holdKey(page, ".dpad sb-key-button.area-up", 1000);
    await page.waitForTimeout(300);
    const afterDpad = await sendCommandCount(page);
    expect(afterDpad).toBeGreaterThanOrEqual(3);

    // Mute is never a long-press key, whatever the config says.
    await holdKey(page, "sb-key-button.mid-btn-mute", 1000);
    await page.waitForTimeout(300);
    expect(await sendCommandCount(page)).toBe(afterDpad + 1);
  });

  test("long press with key capture on records the hold once, not once per repeat", async ({ page }) => {
    await mountCard(page, "active", {
      hold_repeat: { enabled: true },
      show_automation_assist: true,
    });

    await holdKey(page, "sb-key-button.mid-btn-volup", 1200);
    await page.waitForTimeout(300);
    expect(await sendCommandCount(page)).toBeGreaterThanOrEqual(3);

    const notifications = await page.evaluate(
      () =>
        window.__remoteCardHarness
          .getServiceCalls()
          .filter(
            (call) => call.domain === "persistent_notification" && call.service === "create",
          ).length,
    );
    expect(notifications).toBe(1);
  });

  test("a mouse hold that drifts off the button does not swallow the next keyboard activation", async ({ page }) => {
    await mountCard(page, "active", { hold_repeat: { enabled: true } });

    // Press, let it repeat, drag the cursor off the button, release there:
    // the hold stops on pointerleave and pointerup never reaches the button.
    const box = await page.locator("sb-key-button.mid-btn-volup").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.move(box.x + box.width + 80, box.y + box.height + 80, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const afterDrift = await sendCommandCount(page);
    expect(afterDrift).toBeGreaterThanOrEqual(2);

    // Enter on the focused control must send exactly once.
    await page.locator("sb-key-button.mid-btn-volup button").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await sendCommandCount(page)).toBe(afterDrift + 1);
  });

  // ---------- hub long-press bindings (transparent, cache-gated) ----------

  async function sendCommandCalls(page) {
    return page.evaluate(() =>
      window.__remoteCardHarness
        .getServiceCalls()
        .filter((call) => call.domain === "remote" && call.service === "send_command")
        .map((call) => call.data),
    );
  }

  test("hub binding: holding OK fires the long press once; a tap stays a short press", async ({ page }) => {
    await mountCard(page, "long_press");

    // The binding fires mid-hold (500ms) as the resolved pair, sent
    // favorites-style; the release must not add the short press on top.
    await holdKey(page, ".dpad sb-key-button.area-ok", 900);
    await page.waitForTimeout(300);
    let calls = await sendCommandCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ entity_id: "remote.living_room", command: 9, device: 4 });

    // A quick tap on the same button stays the plain short-press payload.
    // (Past the 450ms duplicate-event gate that follows the hold's release.)
    await page.waitForTimeout(400);
    await holdKey(page, ".dpad sb-key-button.area-ok", 100);
    await page.waitForTimeout(300);
    calls = await sendCommandCalls(page);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ command: 176, device: 101 });
  });

  test("holding a key without a binding stays one plain press on release", async ({ page }) => {
    await mountCard(page, "long_press");

    await holdKey(page, ".dpad sb-key-button.area-up", 900);
    await page.waitForTimeout(300);
    const calls = await sendCommandCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 174, device: 101 });
  });

  test("hold-to-repeat beats the hub binding on the same button", async ({ page }) => {
    await mountCard(page, "long_press", { hold_repeat: { enabled: true } });

    // VOL_UP carries a binding AND hold_repeat claims the volume group:
    // the explicit opt-in wins, so the hold repeats the plain short press
    // and the bound pair (command 6 on device 3) never goes out.
    await holdKey(page, "sb-key-button.mid-btn-volup", 1200);
    await page.waitForTimeout(300);
    const calls = await sendCommandCalls(page);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call).toMatchObject({ command: 182, device: 101 });
  });

  test("device mode: holding OK fires the device page's binding", async ({ page }) => {
    await mountCard(page, "long_press", { device_mode: { open_device: 1 } });
    await expect(page.locator(".dpad sb-key-button.area-ok")).toBeVisible();

    await holdKey(page, ".dpad sb-key-button.area-ok", 900);
    await page.waitForTimeout(300);
    const calls = await sendCommandCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 21, device: 1 });
  });

  test("official hub integration ignores the attribute: a hold stays a short press", async ({ page }) => {
    await mountCard(page, "hub_x2");

    // hub_x2 publishes long_press_keys for OK on purpose; the platform
    // gate must keep the feature dark anyway. The hub path also emits
    // request_* bootstrap traffic through send_command, so assert on the
    // send_assigned_key calls.
    await holdKey(page, ".dpad sb-key-button.area-ok", 900);
    // The hub command queue serializes the press behind the bootstrap
    // request_* traffic; poll until it drains.
    await expect
      .poll(async () => {
        const calls = await sendCommandCalls(page);
        return calls.filter(
          (call) => Array.isArray(call?.command) && call.command[0] === "type:send_assigned_key",
        ).length;
      })
      .toBe(1);
    // Every hub-path send carries a command LIST; the bound pair's numeric
    // favorites-style payload (command 9, device 8) must never appear.
    const calls = await sendCommandCalls(page);
    for (const call of calls) expect(Array.isArray(call.command)).toBe(true);
  });
});

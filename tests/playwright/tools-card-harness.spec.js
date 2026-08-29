import { expect, test } from "@playwright/test";

test.describe("tools-card browser harness", () => {
  test("drives every supported locale through the visible harness control", async ({ page }) => {
    await page.goto("/tests/tools-card-harness.html");
    const expected = [
      ["en", ["Hub", "Automation", "Backup"]],
      ["en-gb", ["Hub", "Automation", "Backup"]],
      ["de", ["Hub", "Automatisierung", "Backup"]],
      ["es", ["Hub", "Automatización", "Backup"]],
      ["fr", ["Hub", "Automatisation", "Sauvegarde"]],
      ["nl", ["Hub", "Automatisering", "Back-up"]],
      ["zh-hans", ["Hub", "自动化", "备份"]],
    ];

    expect(await page.evaluate(
      () => window.__toolsCardHarness.supportedLanguages,
    )).toEqual(expected.map(([language]) => language));

    for (const [language, labels] of expected) {
      await page.getByLabel("Language", { exact: true }).selectOption(language);
      await page.waitForFunction((wanted) => {
        const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
        const actual = [...(root?.querySelectorAll(".tab-btn-label") ?? [])]
          .map((label) => label.textContent?.trim());
        return JSON.stringify(actual) === JSON.stringify(wanted);
      }, labels);
    }

    expect(await page.evaluate(
      () => window.__toolsCardHarness.getUnhandledCalls(),
    )).toEqual([]);
  });

  test("compact controls do not clip at narrow width in any supported locale", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/tests/tools-card-harness.html?width=360");

    const languages = await page.evaluate(
      () => window.__toolsCardHarness.supportedLanguages,
    );
    const scenarios = ["1", "activities-capture", "backup-edit", "automation-events", "18", "21", "24"];
    const failures = [];

    for (const language of languages) {
      await page.evaluate(
        (value) => window.__toolsCardHarness.setLanguage(value),
        language,
      );
      for (const scenario of scenarios) {
        const clipped = await page.evaluate(async (scenarioId) => {
          await window.__toolsCardHarness.loadScenario(scenarioId);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const card = window.__toolsCardHarness.getCard();
          const roots = [];
          const visit = (root) => {
            roots.push(root);
            for (const element of root.querySelectorAll("*")) {
              if (element.shadowRoot) visit(element.shadowRoot);
            }
          };
          if (card?.shadowRoot) visit(card.shadowRoot);

          const failures = [];
          for (const root of roots) {
            for (const element of root.querySelectorAll("button, [role='tab'], .chip, .pill")) {
              const text = element.textContent?.replace(/\s+/g, " ").trim();
              if (!text || !element.getClientRects().length) continue;
              if (element.scrollWidth > element.clientWidth + 1) {
                failures.push({
                  text,
                  clientWidth: element.clientWidth,
                  scrollWidth: element.scrollWidth,
                });
              }
            }
          }
          return failures;
        }, scenario);

        if (clipped.length) failures.push({ language, scenario, clipped });
      }
    }

    expect(failures).toEqual([]);
  });

  test("switches locale, theme, and width while keeping a shareable URL", async ({ page }) => {
    await page.goto("/tests/tools-card-harness.html?width=320");

    await expect(page.getByLabel("Card width", { exact: true })).toHaveValue("360");

    await page.getByLabel("Language", { exact: true }).selectOption("nl");
    await page.waitForFunction(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      return [...(root?.querySelectorAll(".tab-btn-label") ?? [])]
        .some((label) => label.textContent?.trim() === "Automatisering");
    });

    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.getByLabel("Card width", { exact: true }).selectOption("360");

    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#active-language")).toHaveText("Nederlands");
    await expect(page.locator("#active-theme")).toHaveText("Dark");
    expect(await page.evaluate(
      () => document.documentElement.style.getPropertyValue("--harness-card-width"),
    )).toBe("360px");
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    const params = new URL(page.url()).searchParams;
    expect(params.get("scenario")).toBe("1");
    expect(params.get("lang")).toBe("nl");
    expect(params.get("theme")).toBe("dark");
    expect(params.get("width")).toBe("360");
  });

  test("applies Home Assistant base palette and fixture community themes the way HA does", async ({ page }) => {
    await page.goto("/tests/tools-card-harness.html?scenario=automation-events&theme=Caule%20Black%20Purple");

    // Fixture loaded: HA's real defaults replace the hand-picked palette and
    // the switcher lists the community themes (mode-aware ones twice).
    expect(await page.evaluate(() => window.__toolsCardHarness.themeFixtureLoaded)).toBe(true);
    const options = await page.evaluate(() => window.__toolsCardHarness.themeOptions);
    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining(["light", "dark", "Caule Black Purple", "Material You|light", "Material You|dark"]),
    );
    expect(await page.evaluate(() => document.getElementById("harness-fallback-palette").disabled)).toBe(true);

    const resolve = (cssValue) => page.evaluate((value) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, cssValue);

    // Flat theme from the URL: HA keeps darkMode=false for themes without
    // modes, the appearance is still detected as dark, and the theme's own
    // var() chains resolve over HA's base (secondary text -> --disabled-color).
    await expect(page.locator("#active-theme")).toHaveText("Caule Black Purple");
    expect(await page.evaluate(() => window.__toolsCardHarness.getThemeState()))
      .toMatchObject({ name: "Caule Black Purple", haDarkMode: false, appearance: "dark" });
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    expect(await resolve("var(--secondary-text-color)")).toBe("rgb(57, 57, 57)");
    expect(await resolve("var(--ha-card-background)")).toBe("rgb(25, 25, 25)");

    // Mode-aware theme: the dark block layers over HA's dark base vars and
    // hex values get an --rgb-* companion like processTheme generates.
    await page.getByLabel("Theme", { exact: true }).selectOption("Material You|dark");
    await expect(page.locator("#active-theme")).toHaveText("Material You · dark");
    expect(await page.evaluate(() => window.__toolsCardHarness.getThemeState()))
      .toMatchObject({ name: "Material You", haDarkMode: true, appearance: "dark" });
    expect(await page.evaluate(
      () => document.documentElement.style.getPropertyValue("--rgb-card-background-color"),
    )).toBe("");
    expect(await page.evaluate(
      () => window._harnessHass.themes,
    )).toMatchObject({ darkMode: true, theme: "Material You" });
    expect(new URL(page.url()).searchParams.get("theme")).toBe("Material You|dark");

    // HA default light: HA 2026 neutral ramp, and the inline theme vars are
    // cleared again.
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await expect(page.locator("#active-theme")).toHaveText("Light");
    expect(await resolve("var(--primary-text-color)")).toBe("rgb(20, 20, 20)");
    expect(await resolve("var(--secondary-text-color)")).toBe("rgb(94, 94, 94)");
    expect(await page.evaluate(() => document.documentElement.style.length)).toBe(
      await page.evaluate(() => [...document.documentElement.style].filter((name) => name === "--harness-card-width").length),
    );

    // Wallpaper theme: the view area paints --lovelace-background (the
    // theme's image) and the card gets the theme's backdrop blur.
    await page.getByLabel("Theme", { exact: true }).selectOption("visionos|dark");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".card-area")).backgroundImage))
      .toContain("night.jpg");
    expect(await page.evaluate(() => {
      const card = document.querySelector("sofabaton-control-panel");
      const haCard = card.shadowRoot.querySelector("ha-card");
      return getComputedStyle(haCard).backdropFilter;
    })).toMatch(/blur/);

    // HA default dark: the dark base vars only.
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    expect(await resolve("var(--primary-text-color)")).toBe("rgb(225, 225, 225)");
    expect(await resolve("var(--card-background-color)")).toBe("rgb(28, 28, 28)");
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  });

  test("restores a localized Automation Events scenario from URL state", async ({ page }) => {
    await page.goto(
      "/tests/tools-card-harness.html"
      + "?scenario=automation-events&lang=de&theme=light&width=900",
    );

    await expect(page.locator("#active-scenario-name"))
      .toHaveText("Events — configured actions");
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue("de");
    expect(await page.evaluate(
      () => document.documentElement.style.getPropertyValue("--harness-card-width"),
    )).toBe("900px");
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    await page.waitForFunction(() => {
      const card = document.querySelector("sofabaton-control-panel");
      const tab = card?.shadowRoot?.querySelector("sofabaton-wifi-commands-tab");
      return tab?.shadowRoot?.textContent?.includes("Hub-Ereignisse");
    });

    const result = await page.evaluate(() => ({
      calls: window.__toolsCardHarness.getCalls()
        .filter((call) => call.channel === "ws")
        .map((call) => call.message?.type),
      unhandled: window.__toolsCardHarness.getUnhandledCalls(),
    }));
    expect(result.calls).toContain("sofabaton_x1s/hub_event_actions/get");
    expect(result.calls).toContain("sofabaton_x1s/wifi_event/list");
    expect(result.unhandled).toEqual([]);
  });

  test("fails unknown websocket operations visibly", async ({ page }) => {
    await page.goto("/tests/tools-card-harness.html");
    await page.evaluate(async () => {
      try {
        await window.__toolsCardHarness.getCard()._snapshot.hass.callWS({
          type: "sofabaton_x1s/not_a_real_operation",
        });
      } catch (_error) {
        // Expected: the harness is deliberately strict.
      }
    });

    await expect(page.locator("#unhandled-api-count")).toHaveText("1 unhandled API call");
    const unhandled = await page.evaluate(
      () => window.__toolsCardHarness.getUnhandledCalls(),
    );
    expect(unhandled).toEqual([expect.objectContaining({
      channel: "ws",
      message: { type: "sofabaton_x1s/not_a_real_operation" },
    })]);
  });

  test("loads every scenario in English and Chinese without setup or API failures", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/tests/tools-card-harness.html");
    const scenarioIds = await page.evaluate(
      () => window.__toolsCardHarness.scenarioIds,
    );
    const failures = [];

    for (const language of ["en", "zh-hans"]) {
      await page.evaluate(
        (value) => window.__toolsCardHarness.setLanguage(value),
        language,
      );
      for (const scenarioId of scenarioIds) {
        const result = await page.evaluate(async (id) => {
          let error = null;
          try {
            await window.__toolsCardHarness.loadScenario(id);
          } catch (reason) {
            error = String(reason?.message ?? reason);
          }
          return {
            error,
            unhandled: window.__toolsCardHarness.getUnhandledCalls(),
          };
        }, scenarioId);
        if (result.error || result.unhandled.length) {
          failures.push({ language, scenarioId, ...result });
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("interactive scenarios reach the visible state promised by their labels", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("/tests/tools-card-harness.html?lang=zh-hans");

    const inspect = async (scenarioId) => page.evaluate(async (id) => {
      await window.__toolsCardHarness.loadScenario(id);
      const card = window.__toolsCardHarness.getCard();
      const root = card?.shadowRoot;
      const editor = root?.querySelector("sofabaton-activities-tab");
      const wifi = root?.querySelector("sofabaton-wifi-commands-tab");
      const backup = root?.querySelector("sofabaton-backup-tab");
      return {
        selectedTab: card?._snapshot?.selectedTab ?? null,
        selectedCacheSection: card?._snapshot?.selectedCacheSection ?? null,
        openEntity: card?._snapshot?.openEntity ?? null,
        staleData: card?._snapshot?.staleData ?? false,
        refreshSpinner: Boolean(root?.querySelector(".icon-btn.spinning")),
        editor: editor ? { kind: editor.kind, stage: editor._stage } : null,
        wifi: wifi ? {
          section: wifi.selectedSection,
          deviceKey: wifi._selectedDeviceKey,
          commandModal: wifi._activeCommandModal,
          createModalOpen: wifi._createDeviceModalOpen,
          deleteDeviceKey: wifi._deleteDeviceKey,
        } : null,
        backup: backup ? {
          section: backup.selectedSection,
          backupStatus: backup._backupProgress?.status ?? null,
          restoreStatus: backup._restoreProgress?.status ?? null,
          hasRestoreBundle: Boolean(backup._restoreBundle),
          editDetailKind: backup._editDetailKind ?? null,
        } : null,
      };
    }, scenarioId);

    expect(await inspect("8")).toMatchObject({
      selectedTab: "cache",
      selectedCacheSection: "devices",
    });
    expect(await inspect("9")).toMatchObject({
      selectedCacheSection: "devices",
      openEntity: "dev-7",
    });
    expect(await inspect("10")).toMatchObject({ staleData: true });
    expect(await inspect("11")).toMatchObject({
      selectedCacheSection: "devices",
      refreshSpinner: true,
    });
    expect(await inspect("activities-capture")).toMatchObject({
      editor: { kind: "activity" },
    });
    expect(await inspect("device-editor")).toMatchObject({
      editor: { kind: "device" },
    });
    expect(await inspect("backup-progress")).toMatchObject({
      backup: { section: "make", backupStatus: "running" },
    });
    expect(await inspect("backup-edit")).toMatchObject({
      backup: { section: "edit", editDetailKind: "activity" },
    });
    expect(await inspect("restore-selection")).toMatchObject({
      backup: { section: "restore", hasRestoreBundle: true },
    });
    expect(await inspect("restore-complete")).toMatchObject({
      backup: { section: "restore", restoreStatus: "success" },
    });
    expect(await inspect("automation-events")).toMatchObject({
      wifi: { section: "hub_events" },
    });
    expect(await inspect("18")).toMatchObject({
      wifi: { section: "wifi", deviceKey: null },
    });
    expect(await inspect("21")).toMatchObject({
      wifi: { deviceKey: "dev-lr" },
    });
    expect(await inspect("22")).toMatchObject({
      wifi: { deviceKey: "dev-lr", commandModal: "details" },
    });
    expect(await inspect("24")).toMatchObject({
      wifi: { deviceKey: null, createModalOpen: true },
    });
    expect(await inspect("25")).toMatchObject({
      wifi: { deviceKey: null, deleteDeviceKey: "dev-br" },
    });
  });

  test("the latest scenario wins when setup overlaps", async ({ page }) => {
    await page.goto("/tests/tools-card-harness.html");
    await page.evaluate(async () => {
      await Promise.allSettled([
        window.__toolsCardHarness.loadScenario("21"),
        window.__toolsCardHarness.loadScenario("24"),
      ]);
    });

    await expect(page.locator("#active-scenario-name")).toHaveText("24. Create device modal");
    expect(new URL(page.url()).searchParams.get("scenario")).toBe("24");
    expect(await page.evaluate(() => {
      const card = window.__toolsCardHarness.getCard();
      const wifi = card?.shadowRoot?.querySelector("sofabaton-wifi-commands-tab");
      return {
        selectedDeviceKey: wifi?._selectedDeviceKey ?? null,
        createModalOpen: wifi?._createDeviceModalOpen ?? false,
      };
    })).toEqual({ selectedDeviceKey: null, createModalOpen: true });
  });
});

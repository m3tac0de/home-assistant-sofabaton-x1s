import { expect, test } from "@playwright/test";

const POWER_ON = 0xC6;
const INPUT = 0xC5;
const POWER_OFF = 0xC7;
const DELAY = 0xFF;

async function mountActivityEditor(page) {
  await page.goto("/tests/tools-card-harness.html");
  await page.evaluate(async () => {
    await window.__toolsCardHarness.loadScenario("activities-capture");
    window.__toolsCardHarness.clearCalls();
  });
}

function isDelay(step) {
  return Number(step?.device_id ?? 0) === DELAY || Number(step?.command_id ?? 0) === DELAY;
}

function assertActivityMembershipInvariant(bundle, activityId) {
  const activity = bundle.activities.find(
    (candidate) => Number(candidate?.device?.device_id ?? 0) === activityId,
  );
  expect(activity, `activity ${activityId} exists`).toBeTruthy();

  const linked = [...new Set((activity.referenced_source_device_ids ?? []).map(Number))]
    .sort((left, right) => left - right);
  expect(activity.referenced_source_device_ids).toEqual(linked);

  const macro = (buttonId) => activity.macros.find((candidate) => Number(candidate.button_id) === buttonId);
  const heads = (buttonId) => (macro(buttonId)?.steps ?? []).filter((step) => !isDelay(step));
  const on = heads(198);
  const off = heads(199);
  const references = new Set();
  for (const slot of activity.favorite_slots ?? []) references.add(Number(slot.device_id ?? 0));
  for (const binding of activity.button_bindings ?? []) {
    references.add(Number(binding.device_id ?? 0));
    references.add(Number(binding.long_press_device_id ?? 0));
  }
  for (const row of activity.macros ?? []) {
    for (const step of (row.steps ?? []).filter((candidate) => !isDelay(candidate))) {
      const commandId = Number(step.command_id ?? 0);
      if (commandId !== INPUT && commandId !== POWER_ON && commandId !== POWER_OFF) {
        references.add(Number(step.device_id ?? 0));
      }
    }
  }
  references.delete(0);
  references.delete(activityId);

  const powerMembers = new Set([...on, ...off]
    .filter((step) => [INPUT, POWER_ON, POWER_OFF].includes(Number(step.command_id)))
    .map((step) => Number(step.device_id)));
  powerMembers.delete(0);
  expect(linked).toEqual([...powerMembers].sort((left, right) => left - right));
  for (const deviceId of references) {
    expect(powerMembers.has(deviceId), `referenced device ${deviceId} has power linkage`).toBe(true);
  }

  for (const deviceId of linked) {
    const count = (steps, commandId) => steps.filter(
      (step) => Number(step.device_id) === deviceId && Number(step.command_id) === commandId,
    ).length;
    expect(count(on, POWER_ON), `device ${deviceId} start power row`).toBe(1);
    expect(count(on, INPUT), `device ${deviceId} start input row`).toBe(1);
    expect(count(off, POWER_OFF), `device ${deviceId} shutdown row`).toBe(1);
  }
}

test.describe("tools-card activity editor harness", () => {
  test("adding a favorite through the UI links its device and repairs power macros", async ({ page }) => {
    await mountActivityEditor(page);

    await page.locator(".quick-access-head-actions .quick-access-add-btn").click();
    await page.locator("#sb-add-fav-device").selectOption("3");
    await page.locator("#sb-add-fav-command").selectOption("30");
    await page.locator(".dialog-footer .dialog-btn-primary").click();

    await expect(page.getByRole("button", { name: "Sync to Hub", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Sync to Hub", exact: true }).click();

    await expect.poll(async () => {
      const calls = await page.evaluate(() => window.__toolsCardHarness.getCalls());
      return calls.some(
        (call) => call.channel === "ws" && call.message?.type === "sofabaton_x1s/activity/sync",
      );
    }).toBe(true);

    const syncMessage = await page.evaluate(() => {
      const call = window.__toolsCardHarness.getCalls().find(
        (candidate) => candidate.channel === "ws"
          && candidate.message?.type === "sofabaton_x1s/activity/sync",
      );
      return call?.message ?? null;
    });

    expect(syncMessage).toBeTruthy();
    expect(syncMessage.activity_id).toBe(101);
    const edited = syncMessage.edited;
    const activity = edited.activities.find((candidate) => candidate.device?.device_id === 101);
    // The shortcut carries the referenced command's name — there is no
    // separate display name (the remote shows the command name verbatim).
    expect(activity.favorite_slots).toContainEqual(expect.objectContaining({
      device_id: 3,
      command_id: 30,
      name: "Home",
    }));
    expect(activity.referenced_source_device_ids).toEqual([1, 2, 3]);
    assertActivityMembershipInvariant(edited, 101);
  });

  test("editing and reordering a macro keeps a nonzero wait attached", async ({ page }) => {
    await mountActivityEditor(page);

    await page.getByRole("button", { name: "Edit steps", exact: true }).click();
    const waitInputs = page.locator(".step-wait-input");
    await expect(waitInputs).toHaveCount(2);
    await waitInputs.nth(0).fill("4");
    await waitInputs.nth(0).press("Tab");

    const sortable = page.locator("ha-sortable.quick-access-sortable");
    await expect(sortable).toHaveCount(1);
    await sortable.evaluate((element) => {
      element.dispatchEvent(new CustomEvent("item-moved", {
        detail: { oldIndex: 0, newIndex: 1 },
        bubbles: true,
        composed: true,
      }));
    });

    const bundle = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    const activity = bundle.activities.find((candidate) => candidate.device?.device_id === 101);
    const userMacro = activity.macros.find((candidate) => candidate.button_id === 3);
    expect(userMacro.steps.map((step) => [step.device_id, step.command_id, step.delay])).toEqual([
      [2, 21, undefined],
      [1, 11, undefined],
      [DELAY, DELAY, 8],
    ]);
    assertActivityMembershipInvariant(bundle, 101);
  });

  test("adding an individual button binding links the selected device", async ({ page }) => {
    await mountActivityEditor(page);

    await page.getByRole("button", { name: "Customize individual buttons", exact: false }).click();
    await page.locator(".quick-access-head .quick-access-add-btn").click();
    await page.locator("#sb-binding-device").selectOption("3");
    await page.locator("#sb-binding-command").selectOption("30");
    await page.locator(".dialog-footer .dialog-btn-primary").click();

    const bundle = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    const activity = bundle.activities.find((candidate) => candidate.device?.device_id === 101);
    expect(activity.button_bindings).toContainEqual(expect.objectContaining({
      device_id: 3,
      command_id: 30,
    }));
    expect(activity.referenced_source_device_ids).toEqual([1, 2, 3]);
    assertActivityMembershipInvariant(bundle, 101);

    const bindingRow = page.locator('[data-kind="binding"]').filter({ hasText: "Streamer" });
    await bindingRow.getByRole("button", { name: "Delete binding", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    const afterDelete = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    expect(afterDelete.activities.find((candidate) => candidate.device?.device_id === 101)
      .referenced_source_device_ids).toEqual([1, 2]);
    assertActivityMembershipInvariant(afterDelete, 101);
  });

  test("deleting a device's final favorite removes its power linkage", async ({ page }) => {
    await mountActivityEditor(page);

    await page.locator(".quick-access-head-actions .quick-access-add-btn").click();
    await page.locator("#sb-add-fav-device").selectOption("3");
    await page.locator("#sb-add-fav-command").selectOption("30");
    await page.locator(".dialog-footer .dialog-btn-primary").click();

    const favoriteRow = page.locator('[data-kind="favorite"]').filter({ hasText: "Home" });
    await favoriteRow.getByRole("button", { name: "Delete shortcut", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    const bundle = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    const activity = bundle.activities.find((candidate) => candidate.device?.device_id === 101);
    expect(activity.referenced_source_device_ids).toEqual([1, 2]);
    assertActivityMembershipInvariant(bundle, 101);
  });

  test("deleting a device's final macro step removes its power linkage", async ({ page }) => {
    await mountActivityEditor(page);

    await page.getByRole("button", { name: "Edit steps", exact: true }).click();
    await page.getByRole("button", { name: "Add step", exact: false }).click();
    await page.locator("#sb-step-device").selectOption("3");
    await page.locator("#sb-step-command").selectOption("30");
    await page.locator(".dialog-footer .dialog-btn-primary").click();

    let bundle = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    expect(bundle.activities.find((candidate) => candidate.device?.device_id === 101)
      .referenced_source_device_ids).toEqual([1, 2, 3]);

    const stepRow = page.locator("[data-step-index]").filter({ hasText: "Streamer" });
    await stepRow.getByRole("button", { name: "Delete step", exact: true }).click();

    bundle = await page.evaluate(() => window.__toolsCardHarness.getWorkingBundle());
    const activity = bundle.activities.find((candidate) => candidate.device?.device_id === 101);
    expect(activity.referenced_source_device_ids).toEqual([1, 2]);
    assertActivityMembershipInvariant(bundle, 101);
  });
});

test.describe("tools-card Hub list layout", () => {
  test("keeps narrow device rows compact with ellipsized names and visible counts", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/tests/tools-card-harness.html");
    await page.evaluate(async () => {
      await window.__toolsCardHarness.loadScenario("8");
      document.body.style.padding = "0";
      document.querySelector(".controls")?.remove();
      document.querySelector(".status-bar")?.remove();
      const layout = document.querySelector(".harness-layout");
      if (layout) layout.style.display = "block";

      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      const label = root?.querySelector(".entity-name-label");
      if (label) label.textContent = "Philips Hue 2 (192.168.2.162) Living Room Entertainment";
    });

    const metrics = await page.evaluate(() => {
      const card = document.querySelector("sofabaton-control-panel");
      const root = card?.shadowRoot;
      const body = root?.querySelector(".cache-panel-body");
      const row = root?.querySelector(".entity-summary");
      const label = root?.querySelector(".entity-name-label");
      const copy = root?.querySelector(".entity-name-copy");
      const count = root?.querySelector(".entity-count");
      const icon = root?.querySelector(".entity-name-icon");
      const meta = root?.querySelector(".entity-meta");
      if (!card || !body || !row || !label || !copy || !count || !icon || !meta) return null;

      const rowRect = row.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      const countRect = count.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const metaRect = meta.getBoundingClientRect();
      return {
        cardWidth: card.clientWidth,
        bodyWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        rowWidth: row.clientWidth,
        rowScrollWidth: row.scrollWidth,
        rowHeight: row.clientHeight,
        labelWidth: label.clientWidth,
        labelScrollWidth: label.scrollWidth,
        textOverflow: getComputedStyle(label).textOverflow,
        countText: count.textContent?.trim(),
        countDisplay: getComputedStyle(count).display,
        countBelowLabel: countRect.top >= labelRect.bottom - 0.5,
        iconCenterDelta: Math.abs(
          (iconRect.top + iconRect.height / 2) - (copyRect.top + copyRect.height / 2),
        ),
        metaInsideRow: metaRect.right <= rowRect.right + 0.5,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics.cardWidth).toBeLessThanOrEqual(320);
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyWidth);
    expect(metrics.rowScrollWidth).toBeLessThanOrEqual(metrics.rowWidth);
    expect(metrics.labelScrollWidth).toBeGreaterThan(metrics.labelWidth);
    expect(metrics.textOverflow).toBe("ellipsis");
    expect(metrics.countText).toMatch(/favs/);
    expect(metrics.countDisplay).toBe("block");
    expect(metrics.countBelowLabel).toBe(true);
    expect(metrics.iconCenterDelta).toBeLessThanOrEqual(0.5);
    expect(metrics.metaInsideRow).toBe(true);
    expect(metrics.rowHeight).toBeLessThanOrEqual(50);

    await page.getByText("Devices", { exact: true }).click();
    const deviceMetrics = await page.evaluate(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      const row = root?.querySelector(".entity-summary");
      const copy = root?.querySelector(".entity-name-copy");
      const label = root?.querySelector(".entity-name-label");
      const count = root?.querySelector(".entity-count");
      const icon = root?.querySelector(".entity-name-icon");
      if (!row || !copy || !label || !count || !icon) return null;
      label.textContent = "Philips Hue 2 (192.168.2.162) Living Room Entertainment";
      const copyRect = copy.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      return {
        rowHeight: row.clientHeight,
        labelWidth: label.clientWidth,
        labelScrollWidth: label.scrollWidth,
        textOverflow: getComputedStyle(label).textOverflow,
        countText: count.textContent?.trim(),
        countDisplay: getComputedStyle(count).display,
        iconCenterDelta: Math.abs(
          (iconRect.top + iconRect.height / 2) - (copyRect.top + copyRect.height / 2),
        ),
      };
    });

    expect(deviceMetrics).not.toBeNull();
    expect(deviceMetrics.labelScrollWidth).toBeGreaterThan(deviceMetrics.labelWidth);
    expect(deviceMetrics.textOverflow).toBe("ellipsis");
    expect(deviceMetrics.countText).toMatch(/cmd/);
    expect(deviceMetrics.countDisplay).toBe("block");
    expect(deviceMetrics.iconCenterDelta).toBeLessThanOrEqual(0.5);
    expect(deviceMetrics.rowHeight).toBeLessThanOrEqual(50);
  });

  test("ellipsizes long activity and device names in Backup edit details", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/tests/tools-card-harness.html");
    await page.evaluate(async () => {
      await window.__toolsCardHarness.loadScenario("backup-edit");
      document.body.style.padding = "0";
      document.querySelector(".controls")?.remove();
      document.querySelector(".status-bar")?.remove();
      const layout = document.querySelector(".harness-layout");
      if (layout) layout.style.display = "block";
    });

    const measureDetail = (kind) => page.evaluate(async ({ kind: detailKind }) => {
      const card = document.querySelector("sofabaton-control-panel");
      const backup = card?.shadowRoot?.querySelector("sofabaton-backup-tab");
      if (!card || !backup) return null;

      const id = detailKind === "activity" ? 101 : 1;
      backup._closeEditDetail();
      backup.requestUpdate();
      await backup.updateComplete;
      backup._openEditDetail(detailKind, id, "");
      backup.requestUpdate();
      await backup.updateComplete;

      const detail = backup.shadowRoot?.querySelector("sofabaton-edit-detail-view");
      await detail?.updateComplete;
      const root = detail?.shadowRoot;
      const row = root?.querySelector(".detail-title-row");
      const title = root?.querySelector(".detail-title");
      const actions = root?.querySelector(".detail-title-actions");
      const back = root?.querySelector(".back-btn");
      if (!row || !title || !actions || !back) return null;

      title.textContent = `${detailKind} — An exceptionally long living room entertainment system name that must never widen the card`;
      const rowRect = row.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const backRect = back.getBoundingClientRect();
      return {
        cardWidth: card.clientWidth,
        cardScrollWidth: card.scrollWidth,
        rowWidth: row.clientWidth,
        rowScrollWidth: row.scrollWidth,
        titleWidth: title.clientWidth,
        titleScrollWidth: title.scrollWidth,
        textOverflow: getComputedStyle(title).textOverflow,
        whiteSpace: getComputedStyle(title).whiteSpace,
        actionsInsideRow: actionsRect.right <= rowRect.right + 0.5,
        backInsideRow: backRect.left >= rowRect.left - 0.5,
      };
    }, { kind });

    for (const kind of ["activity", "device"]) {
      const metrics = await measureDetail(kind);
      expect(metrics).not.toBeNull();
      expect(metrics.cardWidth).toBeLessThanOrEqual(320);
      expect(metrics.cardScrollWidth).toBeLessThanOrEqual(metrics.cardWidth);
      expect(metrics.rowScrollWidth).toBeLessThanOrEqual(metrics.rowWidth);
      expect(metrics.titleScrollWidth).toBeGreaterThan(metrics.titleWidth);
      expect(metrics.textOverflow).toBe("ellipsis");
      expect(metrics.whiteSpace).toBe("nowrap");
      expect(metrics.actionsInsideRow).toBe(true);
      expect(metrics.backInsideRow).toBe(true);
    }
  });

  test("uses the full Automation label and hides device-detail nav icons on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/tests/tools-card-harness.html");

    const tabLabels = await page.evaluate(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      return [...(root?.querySelectorAll(".tabs .tab-btn-label") ?? [])]
        .map((label) => label.textContent?.trim());
    });
    expect(tabLabels).toContain("Automation");
    expect(tabLabels).not.toContain("Auto");

    const localeRequests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("/tools-card-locales/")) {
        localeRequests.push(`${url.pathname}${url.search}`);
      }
    });

    const translatedTabs = [
      ["nl-NL", ["Hub", "Automatisering", "Back-up"]],
      ["de-DE", ["Hub", "Automatisierung", "Backup"]],
      ["fr-FR", ["Hub", "Automatisation", "Sauvegarde"]],
      ["es-ES", ["Hub", "Automatización", "Backup"]],
      ["zh-Hans", ["Hub", "自动化", "备份"]],
    ];
    for (const [locale, expectedLabels] of translatedTabs) {
      await page.evaluate(({ language }) => {
        const card = window._harnessCard;
        card.hass = {
          ...(card._snapshot?.hass ?? {}),
          locale: { language },
        };
      }, { language: locale });
      await page.waitForFunction((expected) => {
        const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
        const labels = [...(root?.querySelectorAll(".tabs .tab-btn-label") ?? [])]
          .map((label) => label.textContent?.trim());
        return JSON.stringify(labels) === JSON.stringify(expected);
      }, expectedLabels);
      const metrics = await page.evaluate(async () => {
        const card = window._harnessCard;
        await card.updateComplete;
        const root = card.shadowRoot;
        const scroll = root?.querySelector(".tabs-scroll");
        return {
          labels: [...(root?.querySelectorAll(".tabs .tab-btn-label") ?? [])]
            .map((label) => label.textContent?.trim()),
          clientWidth: scroll?.clientWidth ?? 0,
          scrollWidth: scroll?.scrollWidth ?? 0,
        };
      });
      expect(metrics.labels).toEqual(expectedLabels);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
    expect(localeRequests).toEqual([
      "/custom_components/sofabaton_x1s/www/tools-card-locales/nl.js?v=81",
      "/custom_components/sofabaton_x1s/www/tools-card-locales/de.js?v=81",
      "/custom_components/sofabaton_x1s/www/tools-card-locales/fr.js?v=81",
      "/custom_components/sofabaton_x1s/www/tools-card-locales/es.js?v=81",
      "/custom_components/sofabaton_x1s/www/tools-card-locales/zh-hans.js?v=81",
    ]);

    await page.evaluate(async () => {
      const card = window._harnessCard;
      card.hass = {
        ...(card._snapshot?.hass ?? {}),
        locale: { language: "en" },
      };
      await card.updateComplete;
    });

    await page.evaluate(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      const automationTab = [...(root?.querySelectorAll(".tabs .tab-btn") ?? [])]
        .find((tab) => tab.textContent?.trim() === "Automation");
      automationTab?.click();
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      const automation = root?.querySelector("sofabaton-wifi-commands-tab");
      return automation?.shadowRoot?.querySelectorAll(".secondary-tab-btn-label").length === 2;
    });
    const automationSubTabLabels = await page.evaluate(() => {
      const root = document.querySelector("sofabaton-control-panel")?.shadowRoot;
      const automation = root?.querySelector("sofabaton-wifi-commands-tab");
      return [...(automation?.shadowRoot?.querySelectorAll(".secondary-tab-btn-label") ?? [])]
        .map((label) => label.textContent?.trim());
    });
    expect(automationSubTabLabels).toEqual(["Wifi Commands", "Events"]);

    const assertTextOnlyDetailNav = async () => {
      const icons = page.locator(".detail-section-nav-btn ha-icon");
      const labels = page.locator(".detail-section-nav-label");
      expect(await icons.count()).toBeGreaterThan(1);
      expect(await labels.count()).toBeGreaterThan(1);
      expect(await icons.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).display)))
        .toEqual(expect.arrayContaining(["none"]));
      expect((await icons.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).display === "none"))))
        .toBe(true);
      expect((await labels.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).display !== "none"))))
        .toBe(true);
    };

    await page.evaluate(() => window.__toolsCardHarness.loadScenario("device-editor"));
    await assertTextOnlyDetailNav();

    await page.evaluate(async () => {
      await window.__toolsCardHarness.loadScenario("backup-edit");
      const card = document.querySelector("sofabaton-control-panel");
      const backup = card?.shadowRoot?.querySelector("sofabaton-backup-tab");
      if (!backup) return;
      backup._closeEditDetail();
      backup.requestUpdate();
      await backup.updateComplete;
      backup._openEditDetail("device", 1, "");
      backup.requestUpdate();
      await backup.updateComplete;
    });
    await assertTextOnlyDetailNav();
  });
});

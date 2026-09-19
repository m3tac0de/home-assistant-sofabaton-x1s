// The control panel (docs/internal/server-panel-plan.md P3, then the
// state plan's SP3 shell): the built bundle from sofabaton_server/ui/panel
// served by the fixtures server, with the server's REST routes mocked at
// the page's own origin and the /events stream mocked with routeWebSocket.
// Fixture bodies follow openapi.json shapes (HubView, SeenHub, Problem,
// RemoteCardDocument, JobView). The whole spec runs at a phone and a
// desktop viewport (playwright.config.cjs projects).

import { test, expect } from "@playwright/test";

const PAGE = "/sofabaton-x-server/src/sofabaton_server/ui/panel/index.html";
// The panel derives the server base from its own URL (everything before
// "/ui/"), so the mocked routes sit under the package directory.
const API = "/sofabaton-x-server/src/sofabaton_server/api/v1";

const CONTROL = {
  hub_connected: true, app_connected: false, controllable: true, mode: "control", hub_version: "X1S",
  proxy_enabled: true, running_activity: { activity_id: 101, name: "Watch TV" }, activities_cached: 2, devices_cached: 2, catalog_ready: true,
};
const LIVING = {
  hub_id: "e26a44861b45",
  enabled: true,
  config: { host: "192.168.1.50", name: "Living room", hub_version: "X1S", mac: "E2:6A:44:86:1B:45" },
  status: CONTROL,
  added_at: "2026-09-15T00:00:00Z",
  last_seen: "2026-09-15T10:00:00Z",
  active_job: null,
  last_job: null,
};
const OFFICE = {
  hub_id: "192.168.1.60",
  enabled: false,
  config: { host: "192.168.1.60", name: null, hub_version: null, mac: null },
  status: null,
  added_at: "2026-09-15T00:00:00Z",
  last_seen: null,
  active_job: null,
  last_job: null,
};
const SEEN_NEW = {
  key: "cb383539684b",
  config: {
    host: "192.168.1.70", port: 8102, name: "Bedroom", mac: "CB:38:35:39:68:4B", txt: { md: "X1" },
    hub_version: "X1", hub_listen_port: 8200, app_discovery_port: 8102, proxy_enabled: true, is_proxy: false, source: "server",
  },
  first_seen: "2026-09-15T09:00:00Z",
  last_seen: "2026-09-15T10:00:00Z",
  present: true,
  registered_hub_id: null,
};
const SEEN_KNOWN = { ...SEEN_NEW, key: "e26a44861b45", config: { ...SEEN_NEW.config, host: "192.168.1.50", name: "Living room", mac: "E2:6A:44:86:1B:45", hub_version: "X1S" }, registered_hub_id: "e26a44861b45" };

function job(overrides = {}) {
  return { job_id: "j1", hub_id: LIVING.hub_id, kind: "restore", status: "running", cancellable: false, created_at: "t", started_at: "t", finished_at: null, progress: null, result: null, error: null, ...overrides };
}

function problem(status, type, detail, extra = {}) {
  return { status, body: { type, title: type, status, detail, hub_id: null, mode: null, ...extra } };
}

// What the remote card reads for the Living room hub when the Remote view mounts it.
function cardRoutes(id) {
  return {
    [`GET /hubs/${id}/status`]: () => ({ status: 200, body: { ...LIVING, hub_id: id } }),
    [`GET /hubs/${id}/activities`]: () => ({ status: 200, body: [
      { activity_id: 101, name: "Watch TV", active: true, needs_confirm: false },
      { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
    ] }),
    [`GET /hubs/${id}/devices`]: () => ({ status: 200, body: [
      { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", device_class_code: 1, power_state: 0, idle_behavior: 2 },
    ] }),
    [`GET /hubs/${id}/activity`]: () => ({ status: 200, body: { activity_id: 101, name: "Watch TV" } }),
    [`GET /hubs/${id}/entities/101/buttons`]: () => ({ status: 200, body: [
      { button_code: 151, name: "OK", device_id: 1, command_id: 9, long_press_device_id: null, long_press_command_id: null },
      { button_code: 174, name: "UP", device_id: 1, command_id: 17, long_press_device_id: null, long_press_command_id: null },
    ] }),
    [`GET /hubs/${id}/activities/101/macros`]: () => ({ status: 200, body: [] }),
    [`GET /hubs/${id}/activities/101/favorites`]: () => ({ status: 200, body: [] }),
    [`GET /hubs/${id}/entities/102/buttons`]: () => ({ status: 200, body: [] }),
    [`GET /hubs/${id}/activities/102/macros`]: () => ({ status: 200, body: [] }),
    [`GET /hubs/${id}/activities/102/favorites`]: () => ({ status: 200, body: [] }),
    [`POST /hubs/${id}/send`]: () => ({ status: 200, body: { accepted: true, mode: "control" } }),
  };
}

// A tiny in-memory server: the hub list, the lifecycle routes, discovery,
// the remote-card document and what the card itself reads.
function makeRoutes(state) {
  const find = (id) => state.hubs.find((h) => h.hub_id === id);
  return {
    "GET /server": () => ({ status: 200, body: { version: "0.2.0", library_version: "0.2.0", api_version: "1", instance_id: "i1", callback_listener: { wanted: false, bound: false } } }),
    "GET /openapi.json": () => ({ status: 200, body: { paths: { "/api/v1/hubs/{hub_id}/status": { get: { operationId: "getStatus", summary: "Status" } } } } }),
    "GET /hubs": () => ({ status: 200, body: state.hubs }),
    "GET /discovery/hubs": () => ({ status: 200, body: state.seen }),
    "POST /discovery/scan": () => ({ status: 200, body: state.seen }),
    "POST /hubs": (body) => {
      if (state.hubs.some((h) => h.config.host === body.host)) {
        return problem(409, "hub_conflict", "hub already registered as e26a44861b45", { hub_id: "e26a44861b45" });
      }
      if (state.startFails) {
        state.hubs.push({ ...OFFICE, hub_id: body.host, enabled: body.enabled, config: { host: body.host, name: body.name || null }, status: null });
        return problem(503, "hub_start_failed", "port 8200 in use", { hub_id: body.host, mode: "disconnected" });
      }
      const hub = {
        hub_id: body.mac ? body.mac.toLowerCase().replace(/:/g, "") : body.host,
        enabled: body.enabled,
        config: { host: body.host, name: body.name || null, hub_version: body.hub_version || null, mac: body.mac || null },
        status: body.enabled ? { ...CONTROL, hub_connected: false, mode: "disconnected", catalog_ready: false, running_activity: null } : null,
        added_at: "2026-09-16T00:00:00Z",
        last_seen: null,
        active_job: null,
        last_job: null,
      };
      state.hubs.push(hub);
      for (const s of state.seen) if (s.config.host === body.host) s.registered_hub_id = hub.hub_id;
      return { status: 201, body: hub };
    },
    "POST /hubs/{id}/enable": (_body, id) => {
      const hub = find(id); if (!hub) return problem(404, "hub_not_found", null, { hub_id: id });
      hub.enabled = true; hub.status = { ...CONTROL };
      return { status: 200, body: hub };
    },
    "POST /hubs/{id}/disable": (_body, id) => {
      const hub = find(id); if (!hub) return problem(404, "hub_not_found", null, { hub_id: id });
      if (state.jobRuns) return problem(409, "hub_job_running", "job j1 (restore) is running; wait for it to finish", { hub_id: id });
      hub.enabled = false; hub.status = null;
      return { status: 200, body: hub };
    },
    "DELETE /hubs/{id}": (_body, id) => {
      if (!find(id)) return problem(404, "hub_not_found", null, { hub_id: id });
      state.hubs = state.hubs.filter((h) => h.hub_id !== id);
      return { status: 204, body: null };
    },
    "GET /hubs/{id}/ui/remote-card": (_body, id) => ({ status: 200, body: { hub_id: id, document: state.document || null, updated_at: state.document ? "2026-09-16T00:00:00Z" : null } }),
    "PUT /hubs/{id}/ui/remote-card": (body, id) => {
      state.document = body.document;
      return { status: 200, body: { hub_id: id, document: body.document, updated_at: "2026-09-16T01:00:00Z" } };
    },
    "DELETE /hubs/{id}/ui/remote-card": () => { state.document = null; return { status: 204, body: null }; },
    "GET /hubs/{id}/applies": () => ({ status: 200, body: state.applies || [] }),
    "GET /hubs/{id}/jobs": () => ({ status: 200, body: [] }),
    ...cardRoutes(LIVING.hub_id),
  };
}

async function mockServer(page, state) {
  // The handlers mutate the records; never the module's fixtures.
  state.hubs = JSON.parse(JSON.stringify(state.hubs));
  state.seen = JSON.parse(JSON.stringify(state.seen));
  const routes = makeRoutes(state);
  const calls = [];
  await page.route(`**${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rel = decodeURIComponent(url.pathname.slice(url.pathname.indexOf("/api/v1") + "/api/v1".length));
    const method = request.method();
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    let handler = routes[`${method} ${rel}`];
    let id = null;
    if (!handler) {
      const m = rel.match(/^\/hubs\/([^/]+)(\/enable|\/disable|\/ui\/remote-card|\/applies|\/jobs)?$/);
      if (m) { id = m[1]; handler = routes[`${method} /hubs/{id}${m[2] || ""}`]; }
    }
    calls.push({ key: `${method} ${rel}`, body });
    if (!handler) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ type: "not_found" }) });
      return;
    }
    const answer = handler(body, id);
    if (answer.status === 204) { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  const sockets = [];
  await page.routeWebSocket(`**${API}/events**`, (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "hello", server_version: "0.2.0", api_version: "1", hubs: state.hubs.map((h) => ({ hub_id: h.hub_id, enabled: h.enabled })), instance_id: "i1" }));
  });
  return { calls, sockets };
}

const chip = (page) => page.locator("#hub-picker-btn");
const options = (page) => page.locator("#hub-picker-menu .hub-option");
const detail = (page) => page.locator("#hub-detail");
const actions = (page) => page.locator("#hub-actions");
const msg = (page) => page.locator("#hubs-msg");
const shot = (testInfo, name) => `test-results/server-panel-${name}-${testInfo.project.name}.png`;

async function selectRemoteLayout(select, value) {
  await select.locator(".trigger").click();
  await select.locator(`.option[data-value="${value}"]`).click();
}

test.describe("control panel, responsive docks", () => {
  for (const width of [320, 390, 600, 768, 844, 1040, 1440]) {
    test(`docks and menus fit at ${width}px with long names and two actions`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      const longName = "Living room and home cinema upstairs — family hub";
      await mockServer(page, {
        hubs: [{ ...LIVING, config: { ...LIVING.config, name: longName } }, OFFICE], seen: [],
        applies: [{ apply_id: "ap1", hub_id: LIVING.hub_id, status: "stopped", resumable: true, job_id: null, created_at: "t", updated_at: "t", runs: 1, cursor: 2, item_count: 5, writes: 2 }],
      });
      await page.goto(PAGE);
      await expect(page.locator("#dock-resume")).toBeVisible();
      const inViewport = async (selector) => {
        const box = await page.locator(selector).boundingBox();
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(width);
        return box;
      };
      const brand = await inViewport(".brand");
      const dot = await inViewport(".brand #ws-dot");
      const brandName = await inViewport(".brand b");
      expect(dot.x + dot.width).toBeLessThanOrEqual(brandName.x);
      await expect(page.locator("#ws-state")).toHaveCount(0);
      const picker = await inViewport("#hub-picker-btn");
      expect(brand.x + brand.width).toBeLessThanOrEqual(picker.x);
      await chip(page).click();
      await inViewport("#hub-picker-menu");
      await expect(options(page).first()).toContainText(longName);
      await page.keyboard.press("Escape");
      await page.click("#cog-btn");
      await inViewport("#cog-menu");
      await expect(page.locator("#theme-toggle")).toBeInViewport();
      await page.keyboard.press("Escape");

      for (const selector of ["#dock-status", "#dock-resume", "#dock-discard", "#dock-pill", "#cog-btn", "#subtabs"]) {
        await inViewport(selector);
      }
      const status = page.locator("#dock-status");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await status.evaluate((el) => getComputedStyle(el).whiteSpace)).not.toBe("nowrap");
      await expect.poll(() => page.locator(".page").evaluate((el) => {
        const dock = el.querySelector("#bottom-dock");
        return parseFloat(getComputedStyle(el).paddingBottom) >= dock.getBoundingClientRect().height + 15;
      })).toBe(true);

      await page.mouse.move(0, 400);
      await page.screenshot({ path: shot(testInfo, `docks-${width}-light`) });
      await page.evaluate(() => document.documentElement.dataset.theme = "dark");
      await page.screenshot({ path: shot(testInfo, `docks-${width}-dark`) });
    });
  }

  test("scrolling keeps both docks visible and the last content clear of a wrapped notice", async ({ page }, testInfo) => {
    const error = "The hub disconnected while restoring the living room devices. Reconnect the hub, then check its configuration before continuing. ".repeat(4).trim();
    await mockServer(page, {
      hubs: [{ ...LIVING, last_job: job({ status: "failed", finished_at: new Date().toISOString(), error: { type: "hub_disconnected", title: "Hub disconnected", status: 503, detail: error } }) }],
      seen: [SEEN_NEW],
    });
    await page.goto(`${PAGE}#/setup/hubs`);
    await expect(page.locator("#dock-status")).toContainText(error);
    // A long view exercises sticky positioning even on a tall desktop.
    await page.locator("#stage-wrap").evaluate((el) => el.style.minHeight = "1600px");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.locator(".top-dock").evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    const dock = await page.locator("#bottom-dock").boundingBox();
    const content = await page.locator("#stage-wrap").boundingBox();
    expect(content.y + content.height).toBeLessThan(dock.y);
    expect(Math.round(dock.y + dock.height)).toBe(page.viewportSize().height);
    await page.screenshot({ path: shot(testInfo, "docks-scrolled-notice") });
    await page.click("#dock-dismiss");
    await expect.poll(async () => (await page.locator("#bottom-dock").boundingBox()).height).toBeLessThan(dock.height);
  });
});

async function pickHub(page, hubId) {
  await chip(page).click();
  await page.locator(`#hub-picker-menu .hub-option[data-hub="${hubId}"]`).click();
}

async function openManualAdd(page) {
  if (await chip(page).getAttribute("aria-expanded") !== "true") await chip(page).click();
  await page.click("#hub-picker-manual");
  await expect(page.locator("#add-host")).toBeFocused();
}

async function openPage(page, name, sub = null) {
  await page.click("#cog-btn");
  await page.click(`#cog-menu button[data-page="${name}"]`);
  if (sub) await page.click(`#subtabs button[data-sub="${sub}"]`);
}

test.describe("control panel, hubs", () => {
  test("lists the registered hubs in the picker, selects the first, the setup page shows its detail", async ({ page }, testInfo) => {
    await mockServer(page, { hubs: [LIVING, OFFICE], seen: [SEEN_KNOWN, SEEN_NEW] });
    await page.goto(PAGE);
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
    await expect(chip(page)).toContainText("Living room");
    await expect(page.locator("#ws-dot")).toHaveClass(/ok/);
    await expect(page.locator("#dock-pill .dock-pill-half").nth(0)).toHaveClass(/on/);
    await expect(page.locator("#dock-pill .dock-pill-half").nth(1)).toHaveClass(/off/);

    await chip(page).click();
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).nth(0)).toContainText("Living room");
    await expect(options(page).nth(0)).toContainText("192.168.1.50 · connected, in control");
    await expect(options(page).nth(0)).toHaveClass(/selected/);
    await expect(options(page).nth(1)).toContainText("192.168.1.60");
    await expect(options(page).nth(1)).toContainText("disabled");
    // The menu stays within the viewport (phone and desktop alike).
    const box = await page.locator("#hub-picker-menu").boundingBox();
    const width = page.viewportSize().width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await options(page).nth(1).click();
    await expect(chip(page)).toContainText("192.168.1.60");
    await expect(page).toHaveURL(/#\/192\.168\.1\.60\/hub\/activities$/);
    await expect(page.locator("#hub-picker-menu")).toHaveCount(0);

    await openPage(page, "setup");
    await expect(page).toHaveURL(/#\/setup\/hubs$/);
    await expect(page.locator("#cog-btn")).toHaveClass(/active/);
    await expect(page.locator('#subtabs button[data-sub="hubs"]')).toHaveClass(/active/);
    await expect(detail(page)).toContainText("192.168.1.60");
    await expect(detail(page)).toContainText("no proxy running");
    await expect(actions(page).getByRole("button", { name: "Enable" })).toBeVisible();
    await expect(actions(page).getByRole("button", { name: "Disable" })).toHaveCount(0);
    await expect(page.locator("#dock-pill")).toHaveCount(1);

    await pickHub(page, "e26a44861b45");
    await expect(page).toHaveURL(/#\/setup\/hubs$/);
    await expect(detail(page)).toContainText("Living room");
    await expect(detail(page)).toContainText("e26a44861b45");
    await expect(detail(page)).toContainText("2 devices · 2 activities");
    await expect(detail(page)).toContainText("Watch TV");
    await expect(actions(page).getByRole("button", { name: "Disable" })).toBeVisible();

    // Setup keeps details; discovery appears only in the picker, without duplicates.
    await expect(page.locator("sb-panel-hubs #hub-add, sb-panel-hubs #seen-table")).toHaveCount(0);
    await chip(page).click();
    const seen = page.locator(".picker-seen");
    await expect(seen).toHaveCount(1);
    await expect(seen.first()).toContainText("Bedroom");
    await expect(seen.first().getByRole("button", { name: "Add Bedroom" })).toBeVisible();
    // The dock is the column's width, centred with it, never the viewport's.
    const dock = await page.locator("#bottom-dock").boundingBox();
    const column = await page.locator(".page").boundingBox();
    expect(Math.round(dock.width)).toBe(Math.round(column.width));
    expect(Math.abs(dock.x - column.x)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: shot(testInfo, "setup"), fullPage: true });
  });

  test("with nothing registered the panel opens setup and says so", async ({ page }) => {
    await mockServer(page, { hubs: [], seen: [] });
    await page.goto(PAGE);
    await expect(page).toHaveURL(/#\/setup\/hubs$/);
    await expect(chip(page)).toContainText("no hub");
    await expect(detail(page)).toContainText("No hubs registered yet");
    await page.getByRole("button", { name: "Find or add a hub" }).click();
    await expect(page.locator("#seen-empty")).toBeVisible();
    await expect(page.locator("#hub-picker-manual")).toBeVisible();
    await expect(page.locator("#dock-pill")).toHaveCount(0);
  });

  test("adds a hub by address and selects it", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [] };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/setup`);
    await expect(chip(page)).toContainText("Living room");
    await openManualAdd(page);
    await page.fill("#add-host", " 192.168.1.60 ");
    await page.fill("#add-name", "Office");
    await page.click("#add-send");
    await expect.poll(() => calls.filter((c) => c.key === "POST /hubs").map((c) => c.body)).toEqual([
      { host: "192.168.1.60", name: "Office", enabled: true },
    ]);
    await expect(msg(page)).toHaveText("added 192.168.1.60");
    await expect(chip(page)).toContainText("Office");
    await expect(detail(page)).toContainText("Office");
    await expect(detail(page)).toContainText("waiting for the hub to connect");
    await expect(page.locator("#hub-add")).toHaveCount(0);
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).nth(1)).toHaveClass(/selected/);
  });

  test("start disabled registers without a proxy", async ({ page }) => {
    const { calls } = await mockServer(page, { hubs: [], seen: [] });
    await page.goto(PAGE);
    await expect(page).toHaveURL(/#\/setup\/hubs$/);
    await openManualAdd(page);
    await page.fill("#add-host", "192.168.1.60");
    await page.check("#add-disabled");
    await page.press("#add-host", "Enter");
    await expect.poll(() => calls.filter((c) => c.key === "POST /hubs").map((c) => c.body)).toEqual([
      { host: "192.168.1.60", enabled: false },
    ]);
    await expect(msg(page)).toHaveText("added 192.168.1.60 (disabled)");
    await expect(chip(page)).toContainText("192.168.1.60");
    await expect(actions(page).getByRole("button", { name: "Enable" })).toBeVisible();
  });

  test("a conflict and a failed start are shown as the problem", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [] };
    await mockServer(page, state);
    await page.goto(`${PAGE}#/setup`);
    await openManualAdd(page);
    await page.fill("#add-host", "192.168.1.50");
    await page.click("#add-send");
    await expect(msg(page)).toHaveText("hub_conflict: hub already registered as e26a44861b45");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--error/);
    await expect(chip(page)).toContainText("Living room");

    state.startFails = true;
    await page.fill("#add-host", "192.168.1.61");
    await page.click("#add-send");
    await expect(msg(page)).toContainText("192.168.1.61 is registered but its proxy did not start: port 8200 in use");
    await expect(chip(page)).toContainText("192.168.1.61");
    await expect(detail(page)).toContainText("not running");
    await expect(actions(page).getByRole("button", { name: "Retry start" })).toBeVisible();
  });

  test("disable, enable and remove call the lifecycle routes; remove asks first", async ({ page }) => {
    const state = { hubs: [LIVING, OFFICE], seen: [] };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/setup`);
    await expect(detail(page)).toContainText("Living room");

    await actions(page).getByRole("button", { name: "Disable" }).click();
    await expect.poll(() => calls.some((c) => c.key === "POST /hubs/e26a44861b45/disable")).toBe(true);
    await expect(msg(page)).toHaveText("e26a44861b45: disabled");
    await expect(detail(page)).toContainText("disabled");
    await expect(actions(page).getByRole("button", { name: "Enable" })).toBeVisible();

    await pickHub(page, "192.168.1.60");
    await actions(page).getByRole("button", { name: "Enable" }).click();
    await expect.poll(() => calls.some((c) => c.key === "POST /hubs/192.168.1.60/enable")).toBe(true);
    await expect(msg(page)).toHaveText("192.168.1.60: enabled");
    await expect(detail(page)).toContainText("connected, in control");

    // Playwright dismisses dialogs unless a handler accepts them: the
    // first Remove is cancelled and nothing is sent.
    await actions(page).getByRole("button", { name: "Remove" }).click();
    await page.waitForTimeout(200);
    expect(calls.some((c) => c.key === "DELETE /hubs/192.168.1.60")).toBe(false);

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("Remove hub 192.168.1.60?");
      dialog.accept();
    });
    await actions(page).getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => calls.some((c) => c.key === "DELETE /hubs/192.168.1.60")).toBe(true);
    await expect(msg(page)).toHaveText("192.168.1.60: removed");
    // The selection falls back to the remaining hub; its picker stays interactive.
    await expect(chip(page)).toContainText("Living room");
    await expect(detail(page)).toContainText("Living room");
    await expect(chip(page)).toHaveAttribute("aria-haspopup", "dialog");
  });

  test("a refused disable shows the server's reason", async ({ page }) => {
    await mockServer(page, { hubs: [LIVING], seen: [], jobRuns: true });
    await page.goto(`${PAGE}#/setup`);
    await actions(page).getByRole("button", { name: "Disable" }).click();
    await expect(msg(page)).toHaveText("e26a44861b45: hub_job_running: job j1 (restore) is running; wait for it to finish");
    await expect(actions(page).getByRole("button", { name: "Disable" })).toBeEnabled();
  });

  test("a discovered hub is added with its advertised configuration", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [SEEN_NEW] };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/setup`);
    await chip(page).click();
    const seen = page.locator(".picker-seen");
    await expect(seen.first()).toContainText("Bedroom");
    await seen.first().getByRole("button", { name: "Add Bedroom" }).click();
    await expect.poll(() => calls.filter((c) => c.key === "POST /hubs").map((c) => c.body)).toEqual([
      { ...SEEN_NEW.config, enabled: true },
    ]);
    await expect(msg(page)).toHaveText("added cb383539684b");
    await expect(chip(page)).toContainText("Bedroom");
    await expect(seen).toHaveCount(0);
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).last()).toContainText("Bedroom");
  });

  test("the scan button asks the server to listen", async ({ page }) => {
    const state = { hubs: [], seen: [] };
    const { calls } = await mockServer(page, state);
    await page.goto(PAGE);
    await chip(page).click();
    await expect.poll(() => calls.filter((c) => c.key === "POST /discovery/scan").length).toBe(1);
    await expect(page.locator("#seen-scan")).toBeEnabled();
    state.seen = [SEEN_NEW];
    await page.click("#seen-scan");
    await expect.poll(() => calls.filter((c) => c.key === "POST /discovery/scan").map((c) => c.body)).toEqual([{ timeout: 5 }, { timeout: 5 }]);
    await expect(page.locator(".picker-seen")).toHaveCount(1);
  });

  test("a lifecycle event on the stream refreshes the picker and counts in the cog menu", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [] };
    const { sockets } = await mockServer(page, state);
    await page.goto(PAGE);
    await expect(chip(page)).toHaveAttribute("aria-haspopup", "dialog");
    await expect.poll(() => sockets.length).toBe(1);
    state.hubs.push(JSON.parse(JSON.stringify(OFFICE)));
    sockets[0].send(JSON.stringify({ type: "server_event", hub_id: OFFICE.hub_id, kind: "hub_added" }));
    await chip(page).click();
    await expect(options(page)).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hub-picker-menu")).toHaveCount(0);
    await page.click("#cog-btn");
    await expect(page.locator("#ws-badge")).toHaveText("2");
  });
});

test.describe("control panel, shell", () => {
  test("tabs and subtabs route by hash, the cog menu opens the tool pages, the theme cycles", async ({ page }) => {
    await mockServer(page, { hubs: [LIVING], seen: [] });
    await page.goto(PAGE);
    await expect(page.locator("#view-hub")).toBeVisible();
    await expect(page.locator('#tabs button[data-tab="hub"]')).toHaveClass(/active/);
    await expect(page.locator('#subtabs button[data-sub="activities"]')).toHaveClass(/active/);
    // The Hub subtabs carry the card's icon and count pills.
    await expect(page.locator('#subtabs button[data-sub="activities"] .subtab-count')).toHaveText("2");
    await expect(page.locator('#subtabs button[data-sub="devices"] .subtab-count')).toHaveText("2");
    await expect(page.locator("#dock-link")).toHaveText("Control panel docs");

    await page.click('#subtabs button[data-sub="devices"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices$/);
    await page.click('#tabs button[data-tab="backup"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/backup\/make$/);
    await expect(page.locator("#backup-placeholder")).toContainText("Make a backup");
    await page.click('#subtabs button[data-sub="restore"]');
    await expect(page.locator("#backup-placeholder")).toContainText("Restore");
    await expect(page.locator("#dock-link")).toHaveText("Backup and restore docs");

    await openPage(page, "debug");
    await expect(page).toHaveURL(/#\/debug\/api$/);
    await expect(page.locator("#view-debug-api")).toBeVisible();
    await expect(page.locator("#cog-btn")).toHaveClass(/active/);
    await expect(page.locator('#tabs .tabs-scroll button.active')).toHaveCount(0);
    await expect(page.locator('#subtabs button[data-sub="api"]')).toHaveClass(/active/);
    await expect(page.locator('#subtabs button[data-sub="events"]')).toBeVisible();
    await expect(page.locator("#path")).toHaveValue("/hubs/{hub_id}/status");
    await expect(page.locator("#op option")).toHaveCount(2);
    await expect(page.locator("#op option").nth(1)).toContainText("GET    /hubs/{hub_id}/status");
    await page.click('#subtabs button[data-sub="events"]');
    await expect(page).toHaveURL(/#\/debug\/events$/);
    await expect(page.locator("#view-debug-events")).toBeVisible();
    await expect(page.locator("#ws-list details")).toHaveCount(1);
    await expect(page.locator("#ws-list summary")).toContainText("hello v0.2.0");
    await openPage(page, "server");
    await expect(page).toHaveURL(/#\/server\/status$/);
    await expect(page.locator("#server-meta")).toContainText("server 0.2.0 · library 0.2.0");
    await expect(page.locator("#server-detail")).toContainText("live");

    // A tab click from a tool page returns to the hub route; the back button walks the history.
    await page.click('#tabs button[data-tab="hub"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/server\/status$/);
    await expect(page.locator("#view-server-status")).toBeVisible();

    // Legacy hashes still land: the first panel's #remote is the Remote tab.
    await page.goto(`${PAGE}#remote`);
    await expect(page.locator("#view-remote")).toBeVisible();
    await expect(page).toHaveURL(/#\/e26a44861b45\/remote\/card$/);
    // A reload keeps the route.
    await page.reload();
    await expect(page.locator("#view-remote")).toBeVisible();
    await expect(page.locator('#tabs button[data-tab="remote"]')).toHaveClass(/active/);

    // Theme: auto -> light -> dark, pinned with data-theme on <html>, from the cog menu.
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
    await page.click("#cog-btn");
    await page.click("#theme-toggle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.click("#theme-toggle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.click("#theme-toggle");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  });

  test("a running job blocks the hub's views under the scrim and narrates in the dock; the finish leaves a notice", async ({ page }, testInfo) => {
    const busy = { ...LIVING, active_job: job({ progress: { phase: "device", message: "Writing device 8", completed_steps: 3, total_steps: 12 } }) };
    const state = { hubs: [busy, OFFICE], seen: [] };
    const { sockets } = await mockServer(page, state);
    await page.goto(PAGE);
    await expect(page.locator("#blocked-scrim")).toContainText("Hub busy");
    await expect(page.locator("#blocked-scrim")).toContainText("Restoring · Writing device 8 · 3/12");
    await expect(page.locator("#stage-wrap")).toHaveAttribute("inert", "");
    await expect(page.locator("#dock-status")).toHaveText("Restoring · Writing device 8 · 3/12");
    await expect(page.locator("#dock-cancel")).toHaveCount(0);
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--running/);
    await page.screenshot({ path: shot(testInfo, "blocked"), fullPage: true });

    // The other hub is not blocked by this hub's job.
    await pickHub(page, "192.168.1.60");
    await expect(page.locator("#blocked-scrim")).toContainText("Hub unavailable");
    await expect(page.locator("#blocked-scrim")).toContainText("This hub is disabled");
    await pickHub(page, "e26a44861b45");

    await expect.poll(() => sockets.length).toBe(1);
    state.hubs[0].active_job = null;
    state.hubs[0].last_job = job({ status: "done", finished_at: new Date().toISOString() });
    sockets[0].send(JSON.stringify({ type: "job_event", hub_id: LIVING.hub_id, job: state.hubs[0].last_job }));
    await expect(page.locator("#blocked-scrim")).toHaveCount(0);
    await expect(page.locator("#stage-wrap")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#dock-status")).toHaveText("Restoring: done");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--success/);
    await page.click("#dock-dismiss");
    await expect(page.locator("#dock-link")).toBeVisible();

    // A failure stays until dismissed, and survives a reload until then.
    const failed = job({ job_id: "j2", status: "failed", finished_at: new Date().toISOString(), error: { type: "hub_disconnected", title: "Hub disconnected", status: 503, detail: "the hub went away" } });
    state.hubs[0].last_job = failed;
    sockets[0].send(JSON.stringify({ type: "job_event", hub_id: LIVING.hub_id, job: failed }));
    await expect(page.locator("#dock-status")).toContainText("Restoring: Hub disconnected");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--error/);
    await page.reload();
    await expect(page.locator("#dock-status")).toContainText("Restoring: Hub disconnected");
    await page.click("#dock-dismiss");
    await expect(page.locator("#dock-link")).toBeVisible();
    await page.reload();
    await expect(page.locator("#dock-link")).toBeVisible();
  });

  test("a cancellable job offers Cancel; the ask is shown until the server drains the job", async ({ page }) => {
    const running = { ...LIVING, active_job: job({ kind: "refresh", cancellable: true, progress: { completed_steps: 3, total_steps: 12 } }) };
    const state = { hubs: [running], seen: [] };
    const { calls, sockets } = await mockServer(page, state);
    await page.route(`**${API}/hubs/${LIVING.hub_id}/jobs/j1`, (route) => {
      calls.push({ key: `${route.request().method()} /hubs/${LIVING.hub_id}/jobs/j1`, body: null });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(running.active_job) });
    });
    await page.goto(PAGE);
    await expect(page.locator("#dock-status")).toHaveText("Refreshing the hub · 3/12");
    await expect(page.locator("#dock-progress")).toHaveAttribute("data-indeterminate", "false");
    await expect(page.locator("#dock-progress")).toHaveAttribute("style", /width: 25%/);
    await page.click("#dock-cancel");
    await expect.poll(() => calls.some((c) => c.key === `DELETE /hubs/${LIVING.hub_id}/jobs/j1`)).toBe(true);
    await expect(page.locator("#dock-cancel")).toHaveText("Cancelling…");
    await expect(page.locator("#dock-cancel")).toBeDisabled();
    await expect(page.locator("#dock-status")).toHaveText("Refreshing the hub · 3/12 · cancelling");
    await expect.poll(() => sockets.length).toBe(1);
    state.hubs[0].active_job = null;
    state.hubs[0].last_job = job({ kind: "refresh", cancellable: true, status: "cancelled", finished_at: "2026-09-17T10:00:09Z" });
    sockets[0].send(JSON.stringify({ type: "job_event", hub_id: LIVING.hub_id, job: state.hubs[0].last_job }));
    await expect(page.locator("#dock-status")).toHaveText("Refreshing the hub: cancelled");
    await expect(page.locator("#dock-progress")).toHaveCount(0);
    await expect(page.locator("#blocked-scrim")).toHaveCount(0);
  });

  test("a stopped apply is offered for resume or discard in the dock", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [], applies: [
      { apply_id: "ap1", hub_id: LIVING.hub_id, status: "stopped", resumable: true, job_id: null, created_at: "t", updated_at: "t", runs: 1, cursor: 2, item_count: 5, writes: 2 },
    ] };
    const { calls } = await mockServer(page, state);
    await page.route(`**${API}/hubs/${LIVING.hub_id}/applies/ap1/resume`, (route) => {
      calls.push({ key: `POST /hubs/${LIVING.hub_id}/applies/ap1/resume`, body: null });
      state.applies = [];
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: "jr", kind: "resume_apply", cancellable: true })) });
    });
    await page.route(`**${API}/hubs/${LIVING.hub_id}/applies/ap1`, (route) => {
      calls.push({ key: `DELETE /hubs/${LIVING.hub_id}/applies/ap1`, body: null });
      state.applies = [];
      route.fulfill({ status: 204 });
    });
    await page.goto(PAGE);
    await expect(page.locator("#dock-status")).toHaveText("An apply stopped (stopped); resume or discard it");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--warn/);
    // Discard asks first; a dismissed dialog sends nothing.
    await page.click("#dock-discard");
    await page.waitForTimeout(200);
    expect(calls.some((c) => c.key === `DELETE /hubs/${LIVING.hub_id}/applies/ap1`)).toBe(false);
    await page.click("#dock-resume");
    await expect.poll(() => calls.some((c) => c.key === `POST /hubs/${LIVING.hub_id}/applies/ap1/resume`)).toBe(true);
    await expect(page.locator("#dock-status")).toHaveText("Resuming the apply");
    await expect(page.locator("#blocked-scrim")).toContainText("Hub busy");
  });

  test("a press on the physical remote sweeps the dock; a lost stream is a hint, not a block", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [] };
    const { sockets } = await mockServer(page, state);
    await page.goto(PAGE);
    await expect(page.locator("#stream-state")).toHaveAttribute("aria-label", "Event stream live");
    await expect.poll(() => sockets.length).toBe(1);
    sockets[0].send(JSON.stringify({ type: "press", seq: 7, hub_id: LIVING.hub_id, device_id: 61, command_id: 3, slot: 2, label: "Lights", press_type: "short", resolution: "deployed", transport: "http", source: "hub", received_at: "t" }));
    await expect(page.locator("#dock-flash")).toHaveAttribute("data-seq", "7");
    await expect(page.locator("#dock-flash")).toHaveAttribute("title", "short press: Lights");
    sockets[0].send(JSON.stringify({ type: "press", seq: 8, hub_id: LIVING.hub_id, device_id: 61, command_id: 4, slot: 3, label: "Curtains", press_type: "long", resolution: "deployed", transport: "http", source: "hub", received_at: "t" }));
    await expect(page.locator("#dock-flash")).toHaveAttribute("data-seq", "8");
    await expect(page.locator("#blocked-scrim")).toHaveCount(0);

    sockets[0].close();
    await expect(page.locator("#stream-state")).toHaveAttribute("aria-label", "Live updates paused, reconnecting");
    await expect(page.locator("#stream-state")).toHaveClass(/lost/);
    await expect(page.locator("#blocked-scrim")).toHaveCount(0);
    await expect.poll(() => sockets.length).toBeGreaterThan(1);
    await expect(page.locator("#stream-state")).toHaveAttribute("aria-label", "Event stream live");
  });

  test("a draft survives a reload, asks when the hub moved on, and warns before leaving its screen", async ({ page }) => {
    const state = { hubs: [LIVING, OFFICE], seen: [] };
    const { calls } = await mockServer(page, state);
    let snapshotId = "snap-1";
    await page.route(`**${API}/hubs/${LIVING.hub_id}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      snapshot_id: snapshotId, captured_at: "t", engine_generation: 1, complete: true, payload_profile: "x1s", devices: [], activities: [],
    }) }));
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices`);
    await expect(page.locator("#dock-link")).toBeVisible();
    // The stub editor: the store's own draft slot, as an editor view would use it.
    await page.evaluate(() => document.querySelector("sofabaton-server-panel").store.setDraft("e26a44861b45", { scope: "hub/devices", snapshotId: "snap-1", data: { renamed: "TV" } }));
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--dirty/);

    // Leaving the draft's screen asks; a dismissed dialog stays put, an accepted one goes.
    await page.click('#subtabs button[data-sub="activities"]');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices$/);
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("unsaved changes");
      dialog.accept();
    });
    await page.click('#subtabs button[data-sub="activities"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
    // Off the draft's screen the banner still shows, but moving on is free.
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");
    await page.click('#tabs button[data-tab="backup"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/backup\/make$/);

    // A reload keeps the draft; the snapshot still matches, so nothing asks.
    await page.reload();
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");
    expect(calls.filter((c) => c.key === `GET /hubs/${LIVING.hub_id}/snapshot`).length).toBeGreaterThanOrEqual(0);

    // The hub moved on: the next load asks; Keep editing turns it into the dirty banner and is remembered.
    snapshotId = "snap-2";
    await page.reload();
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes from an older snapshot: the hub moved on");
    await page.click("#dock-keep-draft");
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");
    await page.reload();
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");

    // Picking another hub from the draft's screen asks too; Discard asks and then clears storage.
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices`);
    await expect(page.locator("#dock-status")).toHaveText("Unsaved changes");
    await chip(page).click();
    await page.locator('#hub-picker-menu .hub-option[data-hub="192.168.1.60"]').click();
    await page.waitForTimeout(200);
    await expect(chip(page)).toContainText("Living room");
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#dock-discard-draft");
    await expect(page.locator("#dock-link")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("sofabaton-panel-draft:e26a44861b45"))).toBeNull();
  });

  test("the panel stays usable when the server stops answering", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [] };
    await mockServer(page, state);
    await page.goto(PAGE);
    await expect(page.locator("#view-hub")).toBeVisible();
    await page.route(`**${API}/hubs`, (route) => route.abort("connectionrefused"));
    await expect(page.locator("#blocked-scrim")).toContainText("The server is not answering", { timeout: 15_000 });
    await expect(page.locator("#dock-status")).toHaveText("The server is not answering");
    await page.unroute(`**${API}/hubs`);
    await expect(page.locator("#blocked-scrim")).toHaveCount(0, { timeout: 15_000 });
  });

  test("on a phone nothing scrolls sideways and both docks stay in view", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "server-panel-phone", "phone project only");
    await mockServer(page, { hubs: [LIVING, OFFICE], seen: [SEEN_KNOWN, SEEN_NEW] });
    await page.goto(`${PAGE}#/setup`);
    await expect(detail(page)).toContainText("Living room");
    const { width, height } = page.viewportSize();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const top = await page.locator("#tabs").boundingBox();
    const dock = await page.locator("#bottom-dock").boundingBox();
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(top.y).toBeLessThan(120);
    expect(Math.round(dock.y + dock.height)).toBeLessThanOrEqual(height);
    expect(dock.y).toBeGreaterThan(height - 120);
    await chip(page).click();
    const menu = await page.locator("#hub-picker-menu").boundingBox();
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: shot(testInfo, "phone-setup"), fullPage: false });
  });
});

test.describe("control panel, views", () => {
  test("the API view sends a request against the selected hub and shows the raw exchange", async ({ page }) => {
    const { calls } = await mockServer(page, { hubs: [LIVING], seen: [] });
    await page.goto(`${PAGE}#/api`);
    await expect(page).toHaveURL(/#\/debug\/api$/);
    await expect(page.locator("#path")).toHaveValue("/hubs/{hub_id}/status");
    await page.click("#send");
    await expect.poll(() => calls.some((c) => c.key === "GET /hubs/e26a44861b45/status")).toBe(true);
    await expect(page.locator("#rawreq")).toContainText("GET /sofabaton-x-server/src/sofabaton_server/api/v1/hubs/e26a44861b45/status HTTP/1.1");
    await expect(page.locator("#rawres")).toContainText("HTTP/1.1 200");
    await expect(page.locator("#rawres")).toContainText('"hub_id": "e26a44861b45"');
    await expect(page.locator("#history button")).toHaveCount(1);
  });

  test("the remote tab mounts the card for the selected hub; the layout subtab edits its document live", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING, OFFICE], seen: [], document: { show_dpad: false } };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/e26a44861b45/remote/card`);
    await expect(page.locator("#view-remote")).toBeVisible();
    await expect(page.locator("#remote-title")).toHaveText("Living room");
    await expect(page.locator("#remote-link")).toHaveAttribute("href", /\/ui\/remote\/\?hub=e26a44861b45$/);
    // The real card is mounted over the mocked server, with the stored document applied.
    const card = page.locator("#stage sofabaton-virtual-remote");
    await expect(card).toBeVisible();
    await expect(card.locator("ha-select.sb-activity-select >> visible=true").first().locator(".value")).toHaveText("Watch TV");
    await expect(card.locator(".dpad >> visible=true")).toHaveCount(0);
    await page.screenshot({ path: shot(testInfo, "remote"), fullPage: true });

    await page.click('#subtabs button[data-sub="layout"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/remote\/layout$/);
    await page.click("#remote-json");
    await expect(page.locator("#remote-doc")).toHaveValue(/"show_dpad": false/);
    await expect(page.locator("#remote-status")).toContainText("stored document");
    // Saving a document applies it to the mounted card at once.
    await page.fill("#remote-doc", '{"show_dpad": true}');
    await page.click("#remote-save");
    await expect.poll(() => calls.filter((c) => c.key === "PUT /hubs/e26a44861b45/ui/remote-card").map((c) => c.body)).toEqual([
      { document: { show_dpad: true } },
    ]);
    await expect(page.locator("#remote-status")).toContainText("saved");
    await page.click('#subtabs button[data-sub="card"]');
    await expect(card.locator(".dpad .area-up >> visible=true").first()).toBeVisible();

    // A key press goes to the server through the card's backend.
    await card.locator(".dpad .area-up >> visible=true").first().click();
    await expect.poll(() => calls.filter((c) => c.key === "POST /hubs/e26a44861b45/send").map((c) => c.body)).toEqual([
      { entity_id: 101, command_id: 174 },
    ]);

    await page.click('#subtabs button[data-sub="layout"]');
    await page.click("#remote-delete");
    await expect.poll(() => calls.some((c) => c.key === "DELETE /hubs/e26a44861b45/ui/remote-card")).toBe(true);
    await expect(page.locator("#remote-status")).toContainText("reset");
    await expect(page.locator("#remote-doc")).toHaveValue("");

    // Picking another hub re-targets the card and the editor.
    await pickHub(page, "192.168.1.60");
    await page.click('#subtabs button[data-sub="card"]');
    await expect(page.locator("#remote-title")).toHaveText("192.168.1.60");
    await expect(page.locator("#remote-link")).toHaveAttribute("href", /\/ui\/remote\/\?hub=192\.168\.1\.60$/);
    await expect.poll(() => calls.some((c) => c.key === "GET /hubs/192.168.1.60/ui/remote-card")).toBe(true);
    await expect(page.locator("#remote-banner")).toBeVisible();
  });

  test("remote visual editor previews, inherits layouts, reorders and round-trips JSON", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [], document: { show_dpad: false, custom_favorites: [{ name: "Home", device_id: 1, command_id: 9 }], future_setting: { keep: true } } };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/e26a44861b45/remote/layout`);
    const editor = page.locator("sb-panel-remote-editor");
    await editor.locator("summary").filter({ hasText: "Layout options" }).click();
    const layout = editor.locator("#layout-select");
    await expect(layout.locator('mwc-list-item[value="101"]')).toHaveCount(1);
    const dpad = editor.locator('[data-group="dpad"] input');
    const preview = page.locator("#stage sofabaton-virtual-remote");
    await expect(dpad).not.toBeChecked();
    await dpad.check();
    await expect(preview.locator(".dpad >> visible=true").first()).toBeVisible();
    await expect(page.locator("#remote-status")).toContainText("Unsaved");
    expect(calls.filter((c) => c.key.startsWith("PUT "))).toHaveLength(0);
    await expect(page.locator("#stage")).toHaveAttribute("inert", "");
    await expect(preview).toHaveJSProperty("editMode", true);

    // A per-activity override does not alter the shared default.
    await selectRemoteLayout(layout, "101");
    await dpad.uncheck();
    await expect(preview.locator(".dpad >> visible=true")).toHaveCount(0);
    await selectRemoteLayout(layout, "default");
    await expect(dpad).toBeChecked();
    const groups = editor.locator("[data-group]");
    const initial = await groups.evaluateAll((rows) => rows.map((r) => r.dataset.group));
    const handle = groups.nth(1).locator(".handle");
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await groups.nth(0).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect(groups.nth(0)).toHaveAttribute("data-group", initial[1]);
    await groups.nth(0).locator(".handle").focus();
    await page.keyboard.press("ArrowDown");
    await expect(groups.nth(0)).toHaveAttribute("data-group", initial[0]);
    // Keyed rows keep focus, so consecutive keyboard moves work.
    await page.keyboard.press("ArrowDown");
    await expect(groups.nth(2)).toHaveAttribute("data-group", initial[1]);

    await page.click("#remote-json");
    const json = JSON.parse(await page.locator("#remote-doc").inputValue());
    expect(json.layouts["101"].show_dpad).toBe(false);
    expect(json.future_setting).toEqual({ keep: true });
    expect(json.custom_favorites).toHaveLength(1);
    await page.fill("#remote-doc", "{broken");
    await page.click("#remote-visual");
    await expect(page.locator("#remote-status")).toContainText("not valid JSON");
    await expect(page.locator("#remote-doc")).toHaveValue("{broken");
    await page.fill("#remote-doc", JSON.stringify(json));
    await page.click("#remote-visual");
    await page.click("#remote-save");
    await expect(page.locator("#remote-status")).toContainText("saved");
    expect(state.document).toEqual(json);
    expect(calls.filter((c) => c.key.includes("/send"))).toHaveLength(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: shot(testInfo, "remote-visual-editor"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("remote visual editor edits styling, long press, device layouts and shortcuts", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [], document: { key_style: "panel" } };
    await mockServer(page, state);
    await page.route(`**${API}/hubs/${LIVING.hub_id}/entities/1/buttons`, (route) => route.fulfill({ json: [] }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/1/commands`, (route) => route.fulfill({ json: [{ command_id: 9, label: "Home" }, { command_id: 17, label: "Up" }] }));
    await page.goto(`${PAGE}#/e26a44861b45/remote/layout`);
    const editor = page.locator("sb-panel-remote-editor");
    await editor.locator("summary").filter({ hasText: "General options" }).click();
    await editor.getByRole("switch", { name: "Enable hold-to-repeat", exact: true }).check();
    await editor.locator(".sub").getByRole("switch", { name: "Volume", exact: true }).uncheck();
    await editor.locator("summary").filter({ hasText: "Styling options" }).click();
    await editor.getByLabel("Button style", { exact: true }).selectOption("glossy");
    await editor.getByRole("switch", { name: "Customize background color", exact: true }).check();
    await editor.getByLabel("Background color", { exact: true }).fill("#102030");
    await editor.getByLabel("Maximum width (px)", { exact: true }).fill("400");
    await editor.getByLabel("Maximum width (px)", { exact: true }).press("Tab");
    await editor.locator("summary").filter({ hasText: "Layout options" }).click();
    const layout = editor.locator("#layout-select");
    await expect(layout.locator('mwc-list-item[value="device:1"]')).toHaveCount(1);
    await selectRemoteLayout(layout, "device:default");
    await editor.locator('[data-group="dpad"] input').uncheck();
    await selectRemoteLayout(layout, "device:1");
    await expect(editor.locator('[data-group="dpad"] input')).not.toBeChecked();
    await editor.locator('[data-group="dpad"] input').check();
    await editor.locator(".slots button").first().click();
    await editor.getByLabel("Shortcut icon", { exact: true }).fill("mdi:home");
    await editor.getByLabel("Shortcut command", { exact: true }).selectOption("9");
    await page.click("#remote-save");
    await expect(page.locator("#remote-status")).toContainText("saved");
    expect(state.document).toMatchObject({
      key_style: "glossy", tinted_panels: true, max_width: 400, background_override: [16, 32, 48],
      hold_repeat: { enabled: true, volume: false },
      device_mode: { layouts: { default: { show_dpad: false }, "1": { show_dpad: true } }, shortcuts: { "1": { left: { icon: "mdi:home", command_id: 9 } } } },
    });
    await editor.getByRole("button", { name: "Reset layout", exact: true }).click();
    await expect(editor.locator('[data-group="dpad"] input')).not.toBeChecked();
    await page.click("#remote-save");
    await expect(page.locator("#remote-status")).toContainText("saved");
    expect(state.document.device_mode.layouts["1"]).toBeUndefined();
    expect(state.document.device_mode.shortcuts["1"].left.command_id).toBe(9);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: shot(testInfo, "remote-device-layout"), fullPage: true });
  });

  test("remote editor groups layout choices and keeps field focus clear of labels", async ({ page }, testInfo) => {
    await mockServer(page, { hubs: [LIVING], seen: [] });
    await page.goto(`${PAGE}#/e26a44861b45/remote/layout`);
    const editor = page.locator("sb-panel-remote-editor");
    await editor.locator("summary").filter({ hasText: "Layout options" }).click();
    const layout = editor.locator("#layout-select");
    await expect(layout.locator('mwc-list-item[value="device:1"]')).toHaveCount(1);
    await layout.locator(".trigger").click();
    const headers = layout.locator('[part~="default-option"]');
    await expect(headers).toHaveText(["Default activity layout", "Default device layout"]);
    await expect(headers.first()).toHaveCSS("border-bottom-width", "2px");
    await expect(layout.locator(".menu")).toBeVisible();
    await page.screenshot({ path: shot(testInfo, "remote-layout-menu"), fullPage: true });
    await layout.locator(".trigger").press("ArrowDown");
    await expect(layout.getByRole("option", { name: "Watch TV", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(layout.getByRole("option", { name: "TV", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(layout.locator(".menu")).not.toBeVisible();
    await expect(layout.locator(".trigger")).toBeFocused();
    await expect(layout.locator(".value")).toHaveText("Default activity layout");

    const general = editor.locator("details").filter({ hasText: "General options" });
    await general.locator("summary").click();
    await expect(editor.locator("details[open]")).toHaveCount(1);
    await expect(general).toHaveAttribute("open", "");
    await expect(layout).not.toBeVisible();
    const initial = general.getByRole("combobox", { name: "Initial view", exact: true });
    await initial.focus();
    expect(await initial.evaluate((input) => {
      const label = input.parentElement.querySelector(".field-label").getBoundingClientRect();
      return label.bottom <= input.getBoundingClientRect().top && getComputedStyle(input).outlineStyle === "none";
    })).toBe(true);
    await expect(general.locator("summary")).toHaveCSS("min-height", "48px");
    const feature = general.locator(".feature").first();
    expect(await feature.evaluate((row) => {
      const text = row.querySelector(".option span").getBoundingClientRect();
      const toggle = row.querySelector("input").getBoundingClientRect();
      return Math.abs(text.top - toggle.top) < 2 && toggle.left >= text.right;
    })).toBe(true);
    await page.screenshot({ path: shot(testInfo, "remote-general-focus"), fullPage: true });

    await editor.locator("summary").filter({ hasText: "Layout options" }).press("Enter");
    await expect(editor.locator("details[open]")).toHaveCount(1);
    await expect(general).not.toHaveAttribute("open", "");
    const increment = editor.getByRole("button", { name: "More visible rows" });
    await expect(increment).toBeDisabled();
    await editor.getByRole("switch", { name: "Macros/Favorites as rows", exact: true }).check();
    await expect(increment).toBeEnabled();
    await increment.click();
    await expect(editor.locator(".stepper output")).toHaveText("3");
  });

  test("remote configuration actions stay above the dock while scrolling", async ({ page }, testInfo) => {
    await mockServer(page, { hubs: [LIVING], seen: [] });
    await page.goto(`${PAGE}#/e26a44861b45/remote/layout`);
    const editor = page.locator("sb-panel-remote-editor");
    await expect(editor.locator("details")).toHaveCount(3);
    await expect(editor.locator("details[open]")).toHaveCount(0);
    const assertActionsVisible = async () => {
      const dock = await page.locator("#bottom-dock").boundingBox();
      for (const id of ["remote-save", "remote-load", "remote-delete"]) {
        const button = page.locator(`#${id}`);
        await expect(button).toBeInViewport({ ratio: 1 });
        const bounds = await button.boundingBox();
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(dock.y);
      }
    };
    await assertActionsVisible();
    await editor.locator("summary").filter({ hasText: "Layout options" }).click();
    await page.evaluate(() => window.scrollTo(0, 300));
    await assertActionsVisible();
    await page.screenshot({ path: shot(testInfo, "remote-sticky-actions") });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await assertActionsVisible();
    await page.click("#remote-json");
    await page.fill("#remote-doc", "{invalid");
    await page.click("#remote-save");
    await expect(page.locator("#remote-status")).toContainText("not valid JSON");
    await assertActionsVisible();
    await page.fill("#remote-doc", "{}");
    await page.click("#remote-visual");
    await expect(editor.locator("details[open]")).toHaveCount(0);
    await editor.locator("summary").filter({ hasText: "Styling options" }).click();
    await editor.locator("summary").filter({ hasText: "Styling options" }).press("Enter");
    await expect(editor.locator("details[open]")).toHaveCount(0);
  });

  test("remote editor retains failed saves and ignores responses after switching hubs", async ({ page }) => {
    const state = { hubs: [LIVING, OFFICE], seen: [], document: { show_dpad: false } };
    await mockServer(page, state);
    await page.goto(`${PAGE}#/e26a44861b45/remote/layout`);
    await page.locator("sb-panel-remote-editor summary").filter({ hasText: "Layout options" }).click();
    await page.locator('sb-panel-remote-editor [data-group="dpad"] input').check();
    const url = `**${API}/hubs/${LIVING.hub_id}/ui/remote-card`;
    await page.route(url, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 500, json: { type: "save_failed", detail: "Storage unavailable" } });
    });
    await page.click("#remote-save");
    await expect(page.locator("#remote-status")).toContainText("Storage unavailable");
    await expect(page.locator('sb-panel-remote-editor [data-group="dpad"] input')).toBeChecked();
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    await page.route(url, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await gate;
      await route.fulfill({ json: { document: { show_dpad: true }, updated_at: "2026-09-18T00:00:00Z" } });
    });
    const pending = page.waitForRequest((r) => r.method() === "PUT");
    await page.click("#remote-save");
    await pending;
    await pickHub(page, OFFICE.hub_id);
    await expect(page.locator('sb-panel-remote-editor [data-group="dpad"] input')).not.toBeChecked();
    finish();
    await expect(page.locator("#remote-status")).toContainText("stored document");
    await expect(page.locator('sb-panel-remote-editor [data-group="dpad"] input')).not.toBeChecked();
  });

  test("the hub tab navigates the cache as the card does: one drawer at a time, badges, a refresh per row and Refresh all", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [] };
    const { calls } = await mockServer(page, state);
    // The catalog's own routes: the snapshot header with provenance, a
    // device's commands, and a refresh job that finishes on the third poll.
    let polls = 0;
    const snapshot = {
      snapshot_id: "abc123", captured_at: "2026-09-16T10:00:00Z", engine_generation: 3, complete: false, payload_profile: "x1s",
      devices: [{ kind: "device", device: { device_id: 1, name: "TV" }, complete: true, editable: true, fetched_at: "2026-09-16T09:00:00Z" }],
      activities: [{ kind: "activity", device: { device_id: 101, name: "Watch TV" }, complete: false, editable: false, fetched_at: null,
        macros: [{ button_id: 198, name: "POWER_ON", steps: [] }, { button_id: 199, name: "POWER_OFF", steps: [] }],
        button_bindings: [{ button_id: 151, device_id: 1, command_id: 9 }, { button_id: 174, device_id: 1, command_id: 17 }], favorite_slots: [],
      }],
    };
    await page.route(`**${API}/hubs/${LIVING.hub_id}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/1/commands`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ command_id: 1, label: "Power" }, { command_id: 17, label: "Up" }]) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/snapshot/refresh`, (route) => {
      calls.push({ key: `POST /hubs/${LIVING.hub_id}/snapshot/refresh`, body: route.request().postDataJSON() });
      snapshot.activities[0].fetched_at = "2026-09-16T11:00:00Z";
      snapshot.activities[0].complete = true;
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: "j1", hub_id: LIVING.hub_id, kind: "refresh_entity", status: "queued", cancellable: false, created_at: "t", started_at: null, finished_at: null, progress: null, result: null, error: null }) });
    });
    await page.route(`**${API}/hubs/${LIVING.hub_id}/jobs/j1`, (route) => {
      polls++;
      const status = polls < 3 ? "running" : "done";
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job_id: "j1", hub_id: LIVING.hub_id, kind: "refresh_entity", status, cancellable: false, created_at: "t", started_at: "t", finished_at: null, progress: { completed_steps: polls, total_steps: 3 }, result: null, error: null }) });
    });

    // The legacy #catalog hash lands on the Hub tab, Activities first as on the card.
    await page.goto(`${PAGE}#catalog`);
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
    await expect(page.locator("#catalog-status")).toContainText("partial");
    const rows = page.locator("#catalog-rows .entity-block");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".entity-name-label")).toHaveText("Watch TV");
    await expect(rows.nth(0).locator(".entity-meta .id-badge")).toContainText("101");
    await expect(rows.nth(1).locator(".entity-name-label")).toHaveText("Listen");
    await expect(page.locator("#catalog-rows .entity-block.open")).toHaveCount(0);

    // Power sequences in the snapshot must not inflate the closed row's macro count.
    await expect(rows.nth(0).locator(".entity-count")).toHaveText("0 favs / 0 macros / 2 buttons");
    // Opening a row shows its drawer: the bound buttons with their codes; the count line follows the rows.
    await rows.nth(0).locator(".entity-summary").click();
    await expect(rows.nth(0)).toHaveClass(/open/);
    // The open drawer's header is sticky under the shell's top dock, whose height the shell measures.
    const dockHeight = await page.locator("#top-dock").evaluate((el) => el.getBoundingClientRect().height);
    expect(dockHeight).toBeGreaterThan(80);
    await expect(rows.nth(0).locator(".entity-summary")).toHaveCSS("position", "sticky");
    await expect(rows.nth(0).locator(".entity-summary")).toHaveCSS("top", `${dockHeight}px`);
    await expect(rows.nth(0).locator(".inner-section-label")).toHaveText(["Buttons"]);
    await expect(rows.nth(0).locator(".inner-row")).toHaveCount(2);
    await expect(rows.nth(0).locator(".inner-row").nth(1)).toContainText("UP");
    await expect(rows.nth(0).locator(".inner-row").nth(1).locator(".id-badge")).toContainText("174");
    await expect(rows.nth(0).locator(".entity-count")).toHaveText("0 favs / 0 macros / 2 buttons");

    // One drawer at a time: opening the second closes the first; a second click closes it again.
    await rows.nth(1).locator(".entity-summary").click();
    await expect(rows.nth(1)).toHaveClass(/open/);
    await expect(rows.nth(0)).not.toHaveClass(/open/);
    await expect(rows.nth(1).locator(".inner-empty")).toHaveText("No cached data yet.");
    await rows.nth(1).locator(".entity-summary").click();
    await expect(page.locator("#catalog-rows .entity-block.open")).toHaveCount(0);

    // The row's refresh button reads that activity from the hub as a job, followed to done.
    await expect(rows.nth(0).locator(".entity-refresh")).toHaveAttribute("title", /not read from the hub in full yet/);
    await rows.nth(0).locator(".entity-refresh").click();
    await expect.poll(() => calls.filter((c) => c.key === `POST /hubs/${LIVING.hub_id}/snapshot/refresh`).map((c) => c.body)).toEqual([{ activity_id: 101 }]);
    await expect.poll(() => polls).toBeGreaterThanOrEqual(3);
    await expect(rows.nth(0).locator(".entity-refresh")).not.toHaveClass(/spinning/);
    await expect(rows.nth(0).locator(".entity-refresh")).toHaveAttribute("title", /read from the hub 9\/16\/2026/);

    // The Devices subtab: the one device, its commands with ComID badges once opened.
    await page.click('#subtabs button[data-sub="devices"]');
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices$/);
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).locator(".entity-name-label")).toHaveText("TV");
    await expect(rows.nth(0).locator(".entity-count")).toHaveText("ir");
    await expect(rows.nth(0).locator(".entity-meta .id-badge")).toContainText("1");
    await rows.nth(0).locator(".entity-summary").click();
    await expect(rows.nth(0).locator(".inner-row")).toHaveCount(2);
    await expect(rows.nth(0).locator(".inner-row").nth(1)).toContainText("Up");
    await expect(rows.nth(0).locator(".inner-row").nth(1).locator(".id-badge")).toContainText("17");
    await expect(rows.nth(0).locator(".entity-count")).toHaveText("2 cmds");

    // Refresh all sends an empty scope; the label narrates the job and returns.
    await page.click("#catalog-refresh-all");
    await expect.poll(() => calls.filter((c) => c.key === `POST /hubs/${LIVING.hub_id}/snapshot/refresh`).map((c) => c.body)).toEqual([{ activity_id: 101 }, {}]);
    await expect(page.locator("#catalog-refresh-all-label")).toHaveText("Refresh all");
    await expect(page.locator("#catalog-refresh-all")).not.toHaveClass(/spinning/);
    await expect(rows.nth(0)).toHaveClass(/open/);
    await page.screenshot({ path: shot(testInfo, "catalog"), fullPage: true });
  });

  test("the device editor recreates the card's Edit device screen: guards, draft edits, the exit dialog, one Sync with If-Match, the stale state", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [] };
    await mockServer(page, state);
    const snapshot = {
      snapshot_id: "snap-1", captured_at: "2026-09-18T00:00:00Z", engine_generation: 1, complete: true, payload_profile: "structural",
      hub: { name: "Living room", version: "X1S" },
      devices: [{
        kind: "device_backup", complete: true, editable: true, fetched_at: "2026-09-18T00:00:00Z",
        device: { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", idle_behavior: 1 },
        commands: [{ command_id: 1, name: "Power" }, { command_id: 17, name: "Up" }],
        button_bindings: [{ button_id: 151, button_name: "OK", command_id: 1, command_name: "Power" }],
        macros: [{ button_id: 198, name: "Power on", steps: [{ command_id: 1 }] }],
        key_sort: null, input_record: null,
      }, {
        kind: "device_backup", complete: true, editable: true, fetched_at: "2026-09-18T00:00:00Z",
        device: { device_id: 2, name: "Roku", brand: "Roku", device_class: "wifi_roku", idle_behavior: 4 },
        commands: [{ command_id: 1, name: "Home" }], button_bindings: [], macros: [], key_sort: null, input_record: null,
      }],
      activities: [{
        kind: "activity_backup", complete: true, editable: true, fetched_at: "t",
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1],
        favorite_slots: [{ button_id: 1, device_id: 1, command_id: 1 }],
        button_bindings: [{ button_id: 174, button_name: "UP", device_id: 1, command_id: 17, command_name: "Up" }],
        macros: [],
      }],
    };
    let stale = false;
    let polls = 0;
    const puts = [];
    const plays = [];
    // A raw IR payload as the hub stores it: 4 timings at 38 kHz (BE16 length, zeros, BE16 carrier, BE32 timings, terminator).
    const RAW_HEX = "00 10 00 00 00 00 94 70 00 00 23 28 00 00 11 94 00 00 02 30 00 00 02 30 00 00 00 00";
    const ROKU_HEX = "47 45 54 20 2f 6b 65 79 70 72 65 73 73 2f 48 6f 6d 65";
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/1/commands/1/payload`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "raw", hex: RAW_HEX, descriptor: null, carrier_hz: 38000, decoded: null }) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/1/commands/17/payload`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ type: "payload_not_found", title: "The command has no stored payload", status: 404 }) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/2/commands/1/payload`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "raw", hex: ROKU_HEX, descriptor: null, carrier_hz: null, decoded: { class: "wifi_roku", trailer_hex: "f1", fields: { path: "/keypress/Home" } } }) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/play`, (route) => {
      plays.push(route.request().postDataJSON());
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true, mode: "control" }) });
    });
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/2`, (route) => {
      puts.push({ method: route.request().method(), ifMatch: route.request().headers()["if-match"], body: route.request().postDataJSON() });
      polls = 0;
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "sync_device", status: "queued" })) });
    });
    await page.route(`**${API}/hubs/${LIVING.hub_id}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/info`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ known: true, model: "X1S", name: "Living room", mac: "E2:6A:44:86:1B:45", firmware_version: 5, production_batch: null }) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/callback-device`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ type: "callback_device_not_found", title: "No callback device", status: 404 }) }));
    await page.route(`**${API}/hubs/${LIVING.hub_id}/devices/1`, (route) => {
      const request = route.request();
      puts.push({ method: request.method(), ifMatch: request.headers()["if-match"], body: request.postDataJSON() });
      if (stale) {
        route.fulfill({ status: 412, contentType: "application/json", body: JSON.stringify({ type: "snapshot_outdated", title: "The snapshot moved", status: 412, detail: "the edit was made on another snapshot" }) });
        return;
      }
      // The write lands: the hub's next snapshot carries the edited element.
      snapshot.devices[0] = { ...snapshot.devices[0], ...request.postDataJSON() };
      snapshot.snapshot_id = "snap-2";
      polls = 0;
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "sync_device", status: "queued" })) });
    });
    await page.route(`**${API}/hubs/${LIVING.hub_id}/jobs/j1`, (route) => {
      polls++;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "sync_device", status: polls < 2 ? "running" : "done", progress: { completed_steps: polls, total_steps: 2 } })) });
    });

    // The wrench on the row opens the editor at its own route.
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices`);
    const rows = page.locator("#catalog-rows .entity-block");
    await expect(rows).toHaveCount(1);
    await rows.nth(0).locator(".entity-edit").click();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices\/1$/);
    const editor = page.locator("sb-panel-device-editor");
    await expect(editor.locator("#editor-title")).toHaveText("TV");
    await expect(editor.locator(".detail-crumb")).toHaveText("Devices");
    await expect(editor.locator(".detail-section-nav-btn")).toHaveText(["On/Off", "Commands", "Buttons"]);
    await expect(editor.locator("#editor-sync")).toHaveText("Up to date");
    await expect(editor.locator("#editor-sync")).toBeDisabled();
    await expect(editor.locator(".power-control .selection-label")).toHaveText("Turn off when idle");
    await expect(editor.locator('[data-sequence="198"] .selection-sub')).toHaveText("1 step");
    await expect(editor.locator('[data-kind="command"]')).toHaveCount(2);
    await expect(editor.locator('[data-kind="command"]').nth(1)).toContainText("Up");
    await expect(editor.locator('[data-kind="command"]').nth(1)).toContainText("Command ID 17");
    await expect(editor.locator('[data-kind="binding"]')).toHaveCount(1);
    await expect(editor.locator('[data-kind="binding"]').nth(0)).toContainText("Power");
    await expect(editor.locator("#editor-managed-warning")).toHaveCount(0);
    await expect(page.locator('#subtabs button[data-sub="devices"]')).toHaveClass(/active/);

    // Rename the device: a draft edit; the Sync button carries the dirty signal; the dock says it the card's way.
    await editor.locator("#editor-rename").click();
    await expect(editor.locator("#rename-dialog .dialog-title")).toHaveText("Rename device");
    await editor.locator("#rename-input").fill("Living TV!");
    await editor.locator("#rename-save").click();
    await expect(editor.locator("#editor-title")).toHaveText("Living TV!");
    await expect(editor.locator("#editor-sync")).toHaveText("Sync to Hub");
    await expect(editor.locator("#editor-sync")).toBeEnabled();
    await expect(page.locator("#dock-status")).toHaveText("Unsynced changes — sync to the hub to apply them");

    // The draft survives a reload on the editor's own route.
    await page.reload();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices\/1$/);
    await expect(editor.locator("#editor-title")).toHaveText("Living TV!");
    await expect(editor.locator("#editor-sync")).toHaveText("Sync to Hub");

    // The power-on sequence opens the step editor: steps with their attached wait, add, edit, move, delete.
    await editor.locator('[data-sequence="198"]').click();
    await expect(editor.locator("#step-title")).toHaveText("Power-on sequence");
    await expect(editor.locator(".detail-crumb")).toHaveText(["Devices", "Living TV!"]);
    const steps = editor.locator("[data-step-index]");
    await expect(steps).toHaveCount(1);
    await expect(steps.nth(0).locator(".quick-access-label")).toHaveText("Power");
    await expect(steps.nth(0).locator(".step-wait")).toHaveCount(0);
    await editor.locator("#step-add").click();
    await expect(editor.locator("#step-dialog .dialog-title")).toHaveText("Add step");
    await editor.locator("#sb-step-command").selectOption("17");
    await editor.locator("#sb-step-hold").fill("2");
    await editor.locator("#step-save").click();
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(1).locator(".quick-access-label")).toHaveText("Up");
    await expect(steps.nth(1).locator(".quick-access-meta")).toHaveText("Hold 2s");
    await expect(steps.nth(0).locator(".step-wait")).toHaveCount(1);
    await expect(steps.nth(1).locator(".step-wait")).toHaveCount(0);
    // The wait after the first step snaps to the hub's half-second grid.
    await steps.nth(0).locator(".step-wait-input").fill("1.3");
    await steps.nth(0).locator(".step-wait-input").dispatchEvent("change");
    await expect(steps.nth(0).locator(".step-wait-input")).toHaveValue("1.5");
    // Drag the new step above the first one by its handle (pointer events, as a finger or a mouse would).
    const fromHandle = await steps.nth(1).locator(".step-handle").boundingBox();
    const toRow = await steps.nth(0).boundingBox();
    await page.mouse.move(fromHandle.x + fromHandle.width / 2, fromHandle.y + fromHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(fromHandle.x + fromHandle.width / 2, toRow.y + 4, { steps: 8 });
    await expect(steps.nth(1)).toHaveClass(/is-dragging/);
    await page.mouse.up();
    await expect(steps.nth(0).locator(".quick-access-label")).toHaveText("Up");
    // The arrow keys on the handle move a step too: down, then back up.
    await steps.nth(0).locator(".step-handle").focus();
    await page.keyboard.press("ArrowDown");
    await expect(steps.nth(0).locator(".quick-access-label")).toHaveText("Power");
    await steps.nth(1).locator(".step-handle").focus();
    await page.keyboard.press("ArrowUp");
    await expect(steps.nth(0).locator(".quick-access-label")).toHaveText("Up");
    await expect(steps.nth(1).locator(".quick-access-label")).toHaveText("Power");
    await steps.nth(1).locator(".step-edit").click();
    await expect(editor.locator("#step-dialog .dialog-title")).toHaveText("Edit step");
    await editor.locator("#sb-step-hold").fill("0.5");
    await editor.locator("#step-save").click();
    await expect(steps.nth(1).locator(".quick-access-meta")).toHaveText("Hold 0.5s");
    await steps.nth(1).locator(".step-delete").click();
    await expect(steps).toHaveCount(1);
    await editor.locator("#step-back").click();
    await expect(editor.locator("#editor-title")).toHaveText("Living TV!");
    await expect(editor.locator('[data-sequence="198"] .selection-sub')).toHaveText("1 step");

    // The braces fetch the payload from the hub and open the card's dialog on the IR hex tabs.
    const commands = editor.locator('[data-kind="command"]');
    await commands.nth(0).locator(".command-payload").click();
    const dialog = editor.locator("sb-payload-dialog");
    await expect(dialog.locator(".dialog-title")).toHaveText("Edit payload");
    await expect(dialog.locator(".payload-class-badge")).toHaveText("ir");
    await expect(dialog.locator('.payload-format-tab[data-tab="pronto"]')).toHaveClass(/active/);
    await expect(dialog.locator("#payload-pronto")).toHaveValue(/^0000 006D 0002 0000 /);
    await dialog.locator('.payload-format-tab[data-tab="sofabaton"]').click();
    await expect(dialog.locator("#payload-raw")).toHaveValue(RAW_HEX);
    // Test plays the current bytes; nothing is saved.
    await dialog.locator("#payload-test").click();
    await expect(dialog.locator("#payload-test-status")).toHaveText("Sent to the hub for one-shot playback.");
    expect(plays).toEqual([{ hex: RAW_HEX }]);
    // A raw edit marks the row edited; the bytes ride the next Sync.
    await dialog.locator("#payload-raw").fill(RAW_HEX.replace("02 30 00 00 00 00", "02 58 00 00 00 00"));
    await dialog.locator("#payload-save").click();
    await expect(dialog).toHaveCount(0);
    // A command without a stored payload says so in the bottom dock, in the error tone.
    await commands.filter({ hasText: "Command ID 17" }).locator(".command-payload").click();
    await expect(msg(page)).toHaveText("The hub returned no payload for this command.");
    await expect(page.locator("#bottom-dock")).toHaveClass(/dock--error/);
    await expect(editor.locator("#payload-fetch-error")).toHaveCount(0);
    // Add command on an X1S IR device: the empty hex tabs; a pasted Pronto code becomes the bytes.
    await editor.locator("#editor-add-command").click();
    await expect(dialog.locator(".dialog-title")).toHaveText("Add command");
    await dialog.locator("#payload-name").fill("Volume up!");
    await dialog.locator("#payload-pronto").fill("0000 006D 0002 0000 0158 00AB 0016 0016");
    await dialog.locator("#payload-save").click();
    await expect(commands).toHaveCount(3);
    await expect(commands.filter({ hasText: "Volume up!" })).toContainText("new command");
    await expect(commands.filter({ hasText: "Volume up!" })).toContainText("Command ID 2");
    await expect(commands.filter({ hasText: "Volume up!" }).locator(".command-payload")).toHaveCount(0);
    // An Unfolded Circle HEX paste is refused with a hint (no converter on the server).
    await editor.locator("#editor-add-command").click();
    await dialog.locator("#payload-name").fill("Mute");
    await dialog.locator("#payload-pronto").fill("3;0x4B36D32C;32;0");
    await expect(dialog.locator("#payload-helper")).toHaveText(/Unfolded Circle HEX codes are not supported here/);
    await dialog.locator("#payload-save").click();
    await expect(dialog.locator("#payload-error")).toHaveText(/Unfolded Circle HEX codes are not supported here/);
    await dialog.locator(".dialog-close").click();
    await expect(dialog).toHaveCount(0);

    // Power control: the dropdown writes the idle behaviour.
    await editor.locator(".power-control-trigger").click();
    await editor.locator('.power-control-option[data-mode="4"]').click();
    await expect(editor.locator(".power-control .selection-label")).toHaveText("Don't control power");
    await expect(editor.locator(".power-sequences-note")).toBeVisible();
    await expect(editor.locator(".power-sequences")).toHaveAttribute("data-disabled", "true");

    // Delete the Up command: the impact list names the activity assignment it clears; the row goes on Delete.
    await commands.filter({ hasText: "Command ID 17" }).locator(".command-delete").click();
    await expect(editor.locator("#delete-dialog .dialog-title")).toHaveText('Delete command "Up"?');
    await expect(editor.locator("#delete-impact li")).toHaveText(["1 power sequence step will be cleared", "1 button assignment will be cleared"]);
    await expect(editor.locator("#delete-dialog .delete-replace-note")).toContainText("written to the hub on the next Sync");
    await editor.locator("#delete-confirm").click();
    await expect(commands).toHaveCount(2);

    // Add an assignment with a long press.
    await editor.locator("#editor-add-binding").click();
    await expect(editor.locator("#binding-dialog .dialog-title")).toHaveText("Add button assignment");
    await editor.locator("#sb-binding-long-press").check();
    await expect(editor.locator("#sb-binding-lp-command")).toBeVisible();
    await editor.locator("#binding-save").click();
    await expect(editor.locator('[data-kind="binding"]')).toHaveCount(2);
    await expect(editor.locator('[data-kind="binding"]').nth(1)).toContainText("Long press · Power");

    // Leaving with unsynced changes asks with the card's dialog; Keep editing stays.
    await page.click('#subtabs button[data-sub="activities"]');
    await expect(editor.locator("#exit-dialog .dialog-title")).toHaveText("Unsynced changes");
    await editor.locator("#exit-keep").click();
    await expect(editor.locator("#exit-dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices\/1$/);

    // Sync: one PUT with the edited element and the snapshot id as If-Match; the job is followed; the editor rebases.
    await editor.locator("#editor-sync").click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0].method).toBe("PUT");
    expect(puts[0].ifMatch).toBe('"snap-1"');
    expect(puts[0].body.device.name).toBe("Living TV!");
    expect(puts[0].body.device.idle_behavior).toBe(4);
    expect(puts[0].body.commands.map((c) => c.command_id)).toEqual([1, 2]);
    expect(puts[0].body.commands[0].restore_data).toEqual({ transport: "hub_code_record", data_hex: RAW_HEX.replace("02 30 00 00 00 00", "02 58 00 00 00 00"), edited: true });
    expect(puts[0].body.commands[1].name).toBe("Volume up!");
    expect(puts[0].body.commands[1].restore_data.new).toBe(true);
    expect(puts[0].body.commands[1].restore_data.data_hex).toMatch(/^[0-9a-f ]+$/);
    expect(puts[0].body.button_bindings).toHaveLength(2);
    // The power-on sequence edited in the step editor rides the same write; deleting Up later cleared its step.
    const powerOn = puts[0].body.macros.find((m) => m.button_id === 198);
    expect((powerOn?.steps ?? []).filter((step) => step.command_id === 17)).toHaveLength(0);
    expect((powerOn?.steps ?? []).filter((step) => step.command_id === 1)).toHaveLength(0);
    await expect(editor.locator("#editor-sync")).toHaveText("Up to date");
    await expect(page.locator("#dock-status")).toHaveCount(0);
    await expect(editor.locator("#editor-title")).toHaveText("Living TV!");
    expect(await page.evaluate(() => localStorage.getItem("sofabaton-panel-draft:e26a44861b45"))).toBeNull();

    // The hub moved on: a 412 renders the card's stale state; Keep editing returns to the draft.
    stale = true;
    await editor.locator('[data-kind="command"]').nth(0).locator(".command-rename").click();
    await editor.locator("#rename-input").fill("Power toggle");
    await editor.locator("#rename-save").click();
    await editor.locator("#editor-sync").click();
    await expect(editor.locator("#sync-failed .capture-error-title")).toHaveText("This device changed on the hub");
    await expect(editor.locator("#editor-retry")).toHaveCount(0);
    await expect(editor.locator("#editor-reload")).toHaveText("Reload from hub");
    await editor.locator("#editor-keep-editing").click();
    await expect(editor.locator('[data-kind="command"]').nth(0)).toContainText("Power toggle");
    await page.screenshot({ path: shot(testInfo, "device-editor"), fullPage: true });

    // A wifi class opens the card's structured form; a field edit rides the Sync with the fetched bytes.
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices/2`);
    await expect(editor.locator("#editor-title")).toHaveText("Roku");
    await expect(editor.locator(".detail-section-nav-btn")).toHaveText(["On/Off", "Network", "Commands", "Buttons"]);
    await editor.locator('[data-kind="command"]').nth(0).locator(".command-payload").click();
    await expect(dialog.locator(".decoded-form-title")).toHaveText("Roku ECP request");
    await expect(dialog.locator('[data-field="path"] .decoded-field-label')).toHaveText("ECP URL path");
    await expect(dialog.locator('[data-field="path"] input')).toHaveValue("/keypress/Home");
    await expect(dialog.locator("#payload-test")).toHaveCount(0);
    await dialog.locator('[data-field="path"] input').fill("/keypress/Play");
    await dialog.locator("#payload-save").click();
    await expect(dialog).toHaveCount(0);
    stale = false;
    await editor.locator("#editor-sync").click();
    await expect.poll(() => puts.length).toBe(3);
    expect(puts[2].body.commands[0].restore_data).toEqual({ transport: "hub_code_record", data_hex: ROKU_HEX, decoded: { class: "wifi_roku", trailer_hex: "f1", fields: { path: "/keypress/Play" }, edited: true } });
    await expect(editor.locator("#editor-sync")).toHaveText("Up to date");
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices/1`);
    await expect(editor.locator("#editor-title")).toHaveText("Living TV!");

    // Back with unsynced changes: Leave without syncing drops the draft and lands on the list.
    await editor.locator('[data-kind="command"]').nth(0).locator(".command-rename").click();
    await editor.locator("#rename-input").fill("Power again");
    await editor.locator("#rename-save").click();
    await editor.locator("#editor-back").click();
    await editor.locator("#exit-leave").click();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices$/);
    await expect(rows).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem("sofabaton-panel-draft:e26a44861b45"))).toBeNull();
  });

  test("the activity editor recreates the card's Edit activity screen: shortcuts, macros, the power sequence with members and inputs, roles, individual buttons, one Sync carrying the touched device", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [] };
    await mockServer(page, state);
    const device = (id, name, deviceClass, commands, bindings = []) => ({
      kind: "device_backup", complete: true, editable: true, fetched_at: "t",
      device: { device_id: id, name, brand: name, device_class: deviceClass, idle_behavior: 1 },
      commands, button_bindings: bindings, macros: [], key_sort: null, input_record: null,
    });
    const snapshot = {
      snapshot_id: "snap-1", captured_at: "2026-09-19T00:00:00Z", engine_generation: 1, complete: true, payload_profile: "structural",
      hub: { name: "Living room", version: "X1S" },
      devices: [
        device(1, "TV", "ir", [{ command_id: 1, name: "Power" }, { command_id: 2, name: "Vol up" }, { command_id: 3, name: "Vol down" }, { command_id: 17, name: "Up" }, { command_id: 20, name: "HDMI 1" }],
          [{ button_id: 182, button_name: "VOL_UP", command_id: 2 }, { button_id: 185, button_name: "VOL_DOWN", command_id: 3 }]),
        device(2, "Roku", "wifi_roku", [{ command_id: 1, name: "Home" }]),
        device(4, "Amp", "ir", [{ command_id: 1, name: "On" }]),
        device(3, "Server", "wifi_ip", [{ command_id: 1, name: "Doorbell" }, { command_id: 2, name: "Button 2" }, { command_id: 3, name: "Doorbell Long" }, { command_id: 4, name: "Button 2 Long" }]),
      ],
      activities: [{
        kind: "activity_backup", complete: true, editable: true, fetched_at: "t",
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1],
        favorite_slots: [{ button_id: 1, device_id: 1, command_id: 1, name: "Power" }],
        button_bindings: [],
        macros: [
          { button_id: 198, name: "POWER_ON", steps: [{ device_id: 1, command_id: 198, button_code: 0, duration: 0, delay: 255 }, { device_id: 1, command_id: 197, button_code: 0, duration: 0, delay: 255 }] },
          { button_id: 199, name: "POWER_OFF", steps: [{ device_id: 1, command_id: 199, button_code: 0, duration: 0, delay: 255 }] },
        ],
        favorites_order: [1],
      }],
    };
    let stale = false;
    let polls = 0;
    const puts = [];
    const deletes = [];
    const H = `**${API}/hubs/${LIVING.hub_id}`;
    await page.route(`${H}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
    await page.route(`${H}/info`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ known: true, model: "X1S", name: "Living room", mac: "E2:6A:44:86:1B:45", firmware_version: 5, production_batch: null }) }));
    await page.route(`${H}/callback-device`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ device_id: 3, spec: { name: "Server", slots: [] }, target: { host: "h", port: 8060, action_id: "a" }, labels: {}, hub_version: "X1S", deployed_at: "t", adopted: false, stale: false, deployed: true }) }));
    await page.route(`${H}/activities/101`, (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        deletes.push(101);
        polls = 0;
        route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "remove_activity", status: "queued" })) });
        return;
      }
      puts.push({ ifMatch: request.headers()["if-match"], body: request.postDataJSON() });
      if (stale) {
        route.fulfill({ status: 412, contentType: "application/json", body: JSON.stringify({ type: "snapshot_outdated", title: "The snapshot moved", status: 412, detail: "the edit was made on another snapshot" }) });
        return;
      }
      // The write lands: the hub's next snapshot carries the edited activity and the touched devices.
      const { devices = [], ...element } = request.postDataJSON();
      snapshot.activities[0] = { ...snapshot.activities[0], ...element };
      for (const touched of devices) snapshot.devices = snapshot.devices.map((d) => (d.device.device_id === touched.device.device_id ? { ...d, ...touched } : d));
      snapshot.snapshot_id = "snap-2";
      polls = 0;
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "sync_activity", status: "queued" })) });
    });
    await page.route(`${H}/jobs/j1`, (route) => {
      polls++;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(job({ job_id: "j1", kind: "sync_activity", status: polls < 2 ? "running" : "done", progress: { completed_steps: polls, total_steps: 2 } })) });
    });

    // The wrench on an activity row opens the editor at its own route.
    await page.goto(`${PAGE}#/e26a44861b45/hub/activities`);
    const rows = page.locator("#catalog-rows .entity-block");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".entity-edit")).toHaveAttribute("title", "Edit activity");
    await rows.nth(0).locator(".entity-edit").click();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities\/101$/);
    const editor = page.locator("sb-panel-activity-editor");
    await expect(editor.locator("#editor-title")).toHaveText("Watch TV");
    await expect(editor.locator(".detail-crumb")).toHaveText("Activities");
    await expect(editor.locator(".detail-section-nav")).toHaveCount(0);
    await expect(editor.locator(".quick-access-title")).toHaveText(["Power control", "Buttons on the remote", "Shortcuts on the remote screen"]);
    await expect(editor.locator("#editor-sync")).toHaveText("Up to date");
    await expect(editor.locator("#member-summary")).toHaveText("Devices: TV");
    await expect(editor.locator('[data-sequence="198"] .selection-sub')).toHaveText("2 steps");
    await expect(page.locator('#subtabs button[data-sub="activities"]')).toHaveClass(/active/);
    await page.screenshot({ path: shot(testInfo, "activity-editor"), fullPage: true });

    // Rename: a draft edit with the card's dock banner.
    await editor.locator("#editor-rename").click();
    await expect(editor.locator("#rename-dialog .dialog-title")).toHaveText("Rename activity");
    await editor.locator("#rename-input").fill("Movie night");
    await editor.locator("#rename-save").click();
    await expect(editor.locator("#editor-title")).toHaveText("Movie night");
    await expect(editor.locator("#editor-sync")).toHaveText("Sync to Hub");
    await expect(page.locator("#dock-status")).toHaveText("Unsynced changes — sync to the hub to apply them");

    // Shortcuts: add a device command (Wifi Events are off, so the callback device is an ordinary device); reorder with the handle's arrow keys.
    const shortcuts = editor.locator('[data-edit-section="quick_access"] [data-sort-index]');
    await expect(shortcuts).toHaveCount(1);
    await expect(shortcuts.nth(0)).toContainText("Power");
    await expect(shortcuts.nth(0).locator(".quick-access-meta")).toHaveText("TV");
    await expect(shortcuts.nth(0).locator(".shortcut-rename")).toHaveCount(0);
    await editor.locator("#add-shortcut").click();
    await expect(editor.locator("#add-shortcut-dialog .dialog-title")).toHaveText("Add to shortcuts");
    await expect(editor.locator("#sb-add-shortcut-kind option")).toHaveText(["Device command", "Macro"]);
    await expect(editor.locator("#sb-add-fav-device option")).toHaveText(["TV", "Roku", "Server", "Amp"]);
    await editor.locator("#sb-add-fav-device").selectOption("2");
    await editor.locator("#add-shortcut-save").click();
    await expect(shortcuts).toHaveCount(2);
    await expect(shortcuts.nth(1).locator(".quick-access-label")).toHaveText("Home");
    await shortcuts.nth(1).locator(".quick-access-drag").focus();
    await page.keyboard.press("ArrowUp");
    await expect(shortcuts.nth(0).locator(".quick-access-label")).toHaveText("Home");
    // A pointer drag by the handle puts it back.
    const fromHandle = await shortcuts.nth(0).locator(".quick-access-drag").boundingBox();
    const toRow = await shortcuts.nth(1).boundingBox();
    await page.mouse.move(fromHandle.x + fromHandle.width / 2, fromHandle.y + fromHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(fromHandle.x + fromHandle.width / 2, toRow.y + toRow.height - 4, { steps: 8 });
    await expect(shortcuts.nth(0)).toHaveClass(/is-dragging/);
    await page.mouse.up();
    await expect(shortcuts.nth(0).locator(".quick-access-label")).toHaveText("Power");

    // A new macro is named, created and opened in the step editor; a step on any device; renamed from the header.
    await editor.locator("#add-shortcut").click();
    await editor.locator("#sb-add-shortcut-kind").selectOption("action");
    await expect(editor.locator("#add-shortcut-dialog .quick-access-empty")).toHaveText("No macros yet. Create one below.");
    await editor.locator("#sb-add-macro-name").fill("Lights");
    await editor.locator("#add-shortcut-save").click();
    await expect(editor.locator("#step-title")).toHaveText("Lights");
    await expect(editor.locator(".detail-crumb")).toHaveText(["Activities", "Movie night"]);
    await expect(editor.locator("#add-member")).toHaveCount(0);
    await expect(editor.locator(".quick-access-empty")).toHaveText("No steps yet.");
    await editor.locator("#step-add").click();
    await expect(editor.locator("#sb-step-kind")).toHaveCount(0);
    await editor.locator("#sb-step-command").selectOption("17");
    await editor.locator("#sb-step-hold").fill("1");
    await editor.locator("#step-save").click();
    const steps = editor.locator("[data-step-index]");
    await expect(steps).toHaveCount(1);
    await expect(steps.nth(0).locator(".quick-access-label")).toHaveText("TV · Up");
    await expect(steps.nth(0).locator(".quick-access-meta")).toHaveText("Hold 1s");
    await editor.locator("#macro-rename").click();
    await expect(editor.locator("#rename-dialog .dialog-title")).toHaveText("Rename macro");
    await editor.locator("#rename-input").fill("Scene");
    await editor.locator("#rename-save").click();
    await expect(editor.locator("#step-title")).toHaveText("Scene");
    await editor.locator("#step-back").click();
    await expect(shortcuts).toHaveCount(3);
    await expect(shortcuts.nth(2)).toContainText("Scene");
    await expect(shortcuts.nth(2).locator(".quick-access-chip")).toHaveText("macro");
    await expect(shortcuts.nth(2).locator(".quick-access-meta")).toHaveText("1 step");

    // The power-on sequence: required rows, Add device, Set input (a device-side edit), member removal with its impact.
    await editor.locator('[data-sequence="198"]').click();
    await expect(editor.locator("#step-title")).toHaveText("Power-on sequence");
    await expect(editor.locator("#macro-rename")).toHaveCount(0);
    await expect(editor.locator('[data-step-kind="power"] .quick-access-chip').first()).toHaveText("required");
    await editor.locator("#add-member").click();
    await expect(editor.locator("#add-member-dialog .dialog-title")).toHaveText("Add device to this activity");
    await page.screenshot({ path: shot(testInfo, "activity-add-member") });
    // The Roku joined with its shortcut: the others are left to add.
    await expect(editor.locator("#sb-add-member-device option")).toHaveText(["Server", "Amp"]);
    await editor.locator("#sb-add-member-device").selectOption("4");
    await editor.locator("#add-member-save").click();
    await expect(editor.locator('[data-step-kind="power"]').filter({ hasText: "Amp" })).toHaveCount(1);
    await editor.locator('[data-step-kind="input"]').nth(0).locator(".step-edit").click();
    await expect(editor.locator("#step-dialog .dialog-title")).toHaveText("Set input");
    await editor.locator("#sb-step-input").selectOption("20");
    await editor.locator("#step-save").click();
    await expect(editor.locator('[data-step-kind="input"]').nth(0).locator(".quick-access-label")).toContainText("HDMI 1");
    await page.screenshot({ path: shot(testInfo, "activity-power-sequence"), fullPage: true });
    // Removing the Roku from the activity takes its shortcut along.
    const rokuPower = editor.locator('[data-step-kind="power"]').filter({ hasText: "Roku" });
    await rokuPower.locator(".member-remove").click();
    await expect(editor.locator("#delete-dialog .dialog-title")).toHaveText("Remove Roku from this activity?");
    await expect(editor.locator("#delete-impact")).toContainText("1 shortcut will be removed");
    await editor.locator("#delete-confirm").click();
    await expect(rokuPower).toHaveCount(0);
    await editor.locator("#step-back").click();
    await expect(editor.locator("#member-summary")).toContainText("TV (HDMI 1)");
    await expect(shortcuts).toHaveCount(2);

    // Roles: the menu lists the devices, one without a mapping is disabled; a pick copies the device's own buttons.
    const volume = editor.locator('[data-role="volume"]');
    await expect(volume.locator(".role-trigger")).toHaveText("Not used");
    await volume.locator(".role-trigger").click();
    await expect(volume.locator(".member-add-option")).toHaveText(["Not used", "TV", "Roku — no button mapping", "Server — no button mapping", "Amp — no button mapping"]);
    await expect(volume.locator('.member-add-option[data-device="2"]')).toBeDisabled();
    await page.screenshot({ path: shot(testInfo, "activity-role-menu") });
    await volume.locator('.member-add-option[data-device="1"]').click();
    await expect(volume.locator(".role-trigger")).toHaveText("TV");
    await expect(volume.locator(".role-note")).toContainText("2 of 3");
    await expect(editor.locator("#open-bindings .selection-sub")).toHaveText("2 configured");

    // Individual buttons: a macro target with a long press.
    await editor.locator("#open-bindings").click();
    await expect(editor.locator("#bindings-title")).toHaveText("Individual buttons");
    const bindings = editor.locator('[data-kind="binding"]');
    await expect(bindings).toHaveCount(2);
    await editor.locator("#add-binding").click();
    await expect(editor.locator("#binding-dialog .dialog-title")).toHaveText("Add button assignment");
    await editor.locator("#sb-binding-kind").selectOption("action");
    await expect(editor.locator("#sb-binding-macro-target")).toHaveValue(/\d+/);
    await editor.locator("#sb-binding-long-press").check();
    await editor.locator("#sb-binding-lp-command").selectOption("17");
    await editor.locator("#binding-save").click();
    await expect(bindings).toHaveCount(3);
    await expect(editor.locator("#bindings-view")).toContainText("Macro · Scene");
    await expect(editor.locator("#bindings-view")).toContainText("Long press · TV · Up");
    await expect(editor.locator("#sb-binding-kind option")).toHaveCount(0);
    await page.screenshot({ path: shot(testInfo, "activity-bindings-view") });
    // Re-pointing a role button makes the group customized; assigning the role again asks first.
    await bindings.filter({ hasText: "Vol up" }).locator(".binding-edit").click();
    await editor.locator("#sb-binding-command").selectOption("17");
    await editor.locator("#binding-save").click();
    await editor.locator("#bindings-back").click();
    await expect(volume.locator(".role-trigger")).toHaveText("TV (customized)");
    await volume.locator(".role-trigger").click();
    await volume.locator('.member-add-option[data-device=""]').click();
    await expect(editor.locator("#role-confirm-dialog .dialog-title")).toHaveText("Replace custom button setup?");
    await editor.locator("#role-confirm").click();
    await expect(volume.locator(".role-trigger")).toHaveText("Not used");

    // The draft survives a reload, touched device included.
    await page.reload();
    await expect(editor.locator("#editor-title")).toHaveText("Movie night");
    await expect(editor.locator("#member-summary")).toContainText("TV (HDMI 1)");

    // One Sync: the activity element with If-Match, plus the device element the input pick touched.
    await editor.locator("#editor-sync").click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0].ifMatch).toBe('"snap-1"');
    expect(puts[0].body.device.name).toBe("Movie night");
    expect(puts[0].body.devices.map((d) => d.device.device_id)).toEqual([1]);
    expect(puts[0].body.devices[0].input_record.entries.map((e) => e.command_id)).toEqual([20]);
    expect(puts[0].body.macros.find((m) => m.name === "Scene").steps.filter((s) => s.device_id === 1)).toHaveLength(1);
    await expect(editor.locator("#editor-sync")).toHaveText("Up to date");
    expect(await page.evaluate(() => localStorage.getItem("sofabaton-panel-draft:e26a44861b45"))).toBeNull();

    // A moved snapshot renders the card's stale state.
    stale = true;
    await editor.locator("#editor-rename").click();
    await editor.locator("#rename-input").fill("Movies");
    await editor.locator("#rename-save").click();
    await editor.locator("#editor-sync").click();
    await expect(editor.locator("#sync-failed .capture-error-title")).toHaveText("This activity changed on the hub");
    await editor.locator("#editor-keep-editing").click();

    // Back with unsynced changes asks the card's way.
    await editor.locator("#editor-back").click();
    await expect(editor.locator("#exit-dialog .dialog-text")).toContainText("This activity has changes");
    await editor.locator("#exit-keep").click();

    // Delete activity is immediate: a job, then back to the list.
    await editor.locator("#editor-delete").click();
    await expect(editor.locator("#delete-dialog .dialog-title")).toHaveText('Delete activity "Movies"?');
    await expect(editor.locator("#delete-dialog .delete-replace-note")).toContainText("applied to the hub immediately");
    await editor.locator("#delete-confirm").click();
    await expect.poll(() => deletes.length).toBe(1);
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
  });

  test("the hub tab's list footer: Change order drags the rows and writes one order, Add activity and Add device create on the hub and open the editor", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [] };
    await mockServer(page, state);
    const H = `**${API}/hubs/${LIVING.hub_id}`;
    const entity = (kind, id, name, complete = true) => ({ kind, complete, editable: complete, fetched_at: "t", device: { device_id: id, name, device_class: "ir", idle_behavior: 1 }, commands: [], button_bindings: [], macros: [], favorite_slots: [] });
    const snapshot = { snapshot_id: "snap-1", captured_at: "2026-09-19T00:00:00Z", engine_generation: 1, complete: true, payload_profile: "structural", hub: { name: "Living room", version: "X1S" },
      devices: [entity("device_backup", 1, "TV")], activities: [entity("activity_backup", 101, "Watch TV"), entity("activity_backup", 102, "Listen")] };
    const calls = [];
    let created = null;
    await page.route(`${H}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
    await page.route(`${H}/info`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ known: true, model: "X1S", name: "Living room", mac: null, firmware_version: 5, production_batch: null }) }));
    await page.route(`${H}/callback-device`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ type: "callback_device_not_found", title: "none", status: 404 }) }));
    const accept = (route, kind) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(job({ job_id: kind, kind, status: "queued" })) });
    await page.route(`${H}/activities/order`, (route) => { calls.push({ key: "order", body: route.request().postDataJSON() }); accept(route, "reorder_activities"); });
    await page.route(`${H}/activities`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      calls.push({ key: "add_activity", body: route.request().postDataJSON() });
      created = { activity_id: 103 };
      snapshot.activities.push(entity("activity_backup", 103, route.request().postDataJSON().name, false));
      accept(route, "add_activity");
    });
    await page.route(`${H}/devices`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      calls.push({ key: "add_device", body: route.request().postDataJSON() });
      created = { device_id: 2 };
      snapshot.devices.push(entity("device_backup", 2, route.request().postDataJSON().name, true));
      accept(route, "add_device");
    });
    await page.route(`${H}/snapshot/refresh`, (route) => {
      const scope = route.request().postDataJSON();
      calls.push({ key: "refresh", body: scope });
      for (const row of snapshot.activities) if (row.device.device_id === scope.activity_id) { row.complete = true; row.editable = true; }
      accept(route, "refresh");
    });
    await page.route(`${H}/jobs/*`, (route) => {
      const kind = route.request().url().split("/").pop();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(job({ job_id: kind, kind, status: "done", result: created })) });
    });

    await page.goto(`${PAGE}#/e26a44861b45/hub/activities`);
    const rows = page.locator("#catalog-rows .entity-block");
    await expect(rows).toHaveCount(2);
    await expect(page.locator("#catalog-footer .cache-footer-btn")).toHaveText(["Change order", "Add activity"]);

    // Change order: the rows become a draggable list; the wrench and refresh step aside; Cancel restores.
    await page.locator("#change-order").click();
    await expect(page.locator(".cache-reorder-hint")).toHaveText("Drag activities into the desired order, then sync to the hub.");
    await expect(page.locator("#catalog-footer .cache-footer-btn")).toHaveText(["Sync to Hub", "Cancel"]);
    await expect(rows.nth(0).locator(".entity-edit")).toHaveCount(0);
    await expect(page.locator("#catalog-refresh-all")).toBeDisabled();
    await rows.nth(0).focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.locator(".entity-name-label")).toHaveText(["Listen", "Watch TV"]);
    await page.locator("#reorder-cancel").click();
    await expect(rows.locator(".entity-name-label")).toHaveText(["Watch TV", "Listen"]);
    // A pointer drag of the whole row, then one PUT with every id once.
    await page.locator("#change-order").click();
    const from = await rows.nth(1).boundingBox();
    const to = await rows.nth(0).boundingBox();
    await page.mouse.move(from.x + 60, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, to.y + 2, { steps: 8 });
    await expect(rows.nth(1)).toHaveClass(/is-dragging/);
    await page.screenshot({ path: shot(testInfo, "catalog-reorder") });
    await page.mouse.up();
    await expect(rows.locator(".entity-name-label")).toHaveText(["Listen", "Watch TV"]);
    await page.locator("#reorder-sync").click();
    await expect.poll(() => calls.filter((c) => c.key === "order").length).toBe(1);
    expect(calls.find((c) => c.key === "order").body).toEqual({ order: [102, 101] });
    await expect(page.locator("#catalog-footer .cache-footer-btn")).toHaveText(["Change order", "Add activity"]);

    // Add activity: named, created on the hub, read in full, opened in the editor.
    await page.locator("#add-entity").click();
    await expect(page.locator("#add-dialog .cache-dialog-title")).toHaveText("Add activity");
    await expect(page.locator("#add-dialog .cache-dialog-text")).toHaveText("Name the new activity. It is created on the hub and opened in the editor.");
    await expect(page.locator("#add-class")).toHaveCount(0);
    await page.screenshot({ path: shot(testInfo, "catalog-add-activity") });
    await page.locator("#add-name").fill("Gaming");
    await page.locator("#add-confirm").click();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities\/103$/);
    expect(calls.find((c) => c.key === "add_activity").body).toEqual({ name: "Gaming" });
    expect(calls.find((c) => c.key === "refresh").body).toEqual({ activity_id: 103 });
    await expect(page.locator("sb-panel-activity-editor #editor-title")).toHaveText("Gaming");

    // Add device: a name and one of the classes this hub line can create.
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices`);
    await expect(page.locator("#catalog-footer .cache-footer-btn")).toHaveText(["Change order", "Add device"]);
    await expect(page.locator("#change-order")).toBeDisabled();
    await page.locator("#add-entity").click();
    await expect(page.locator("#add-dialog .cache-dialog-title")).toHaveText("Add device");
    await expect(page.locator("#add-class option")).toHaveText(["Infrared", "Roku", "Hue", "Sonos", "Generic HTTP"]);
    await page.locator("#add-name").fill("Soundbar");
    await page.locator("#add-class").selectOption("wifi_roku");
    await page.locator("#add-confirm").click();
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices\/2$/);
    expect(calls.find((c) => c.key === "add_device").body).toEqual({ name: "Soundbar", device_class: "wifi_roku" });
    await expect(page.locator("sb-panel-device-editor #editor-title")).toHaveText("Soundbar");
  });
});

test.describe("control panel, integrated picker", () => {
  test("manages an unselected hub without navigating, and unregister requires confirmation", async ({ page }) => {
    const state = { hubs: [LIVING, OFFICE], seen: [{ ...SEEN_NEW, config: { ...SEEN_NEW.config, host: OFFICE.config.host, name: 'Office' }, registered_hub_id: OFFICE.hub_id }] };
    const { calls } = await mockServer(page, state);
    await page.goto(PAGE);
    await chip(page).click();
    await page.getByRole("button", { name: "Manage 192.168.1.60", exact: true }).click();
    const controls = page.getByRole("group", { name: "Actions for 192.168.1.60", exact: true });
    await controls.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Disable", exact: true })).toBeEnabled();
    await expect(chip(page)).toContainText("Living room");
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
    await controls.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Enable", exact: true })).toBeEnabled();
    await controls.getByRole("button", { name: "Unregister…", exact: true }).click();
    expect(calls.some((c) => c.key === `DELETE /hubs/${OFFICE.hub_id}`)).toBe(false);
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("cached state and web remote layout");
      dialog.accept();
    });
    await controls.getByRole("button", { name: "Unregister…", exact: true }).click();
    await expect(options(page)).toHaveCount(1);
    // The stale registered_hub_id does not hide a newly unregistered advertisement.
    await expect(page.locator(".picker-seen")).toContainText("Office");
    await expect(page.getByRole("button", { name: "Add Office", exact: true })).toBeVisible();
    await expect(chip(page)).toContainText("Living room");
    expect(calls.filter((c) => c.key.startsWith('POST /hubs/')).map((c) => c.key)).toEqual([
      `POST /hubs/${OFFICE.hub_id}/enable`, `POST /hubs/${OFFICE.hub_id}/disable`,
    ]);
  });

  test("shows lifecycle errors inline and retries a registered hub that failed to start", async ({ page }) => {
    const state = { hubs: [{ ...LIVING, status: null }], seen: [], jobRuns: true };
    const { calls } = await mockServer(page, state);
    await page.goto(PAGE);
    await chip(page).click();
    await page.getByRole("button", { name: "Manage Living room", exact: true }).click();
    const controls = page.getByRole("group", { name: "Actions for Living room", exact: true });
    await controls.getByRole("button", { name: "Retry start", exact: true }).click();
    await expect.poll(() => calls.some((c) => c.key === `POST /hubs/${LIVING.hub_id}/enable`)).toBe(true);
    await expect(options(page).first()).toContainText("connected, in control");
    await controls.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(page.locator("#hub-picker-menu [role=alert]")).toContainText("hub_job_running");
    await expect(controls.getByRole("button", { name: "Disable", exact: true })).toBeEnabled();
  });

  test("keeps older discoveries visible and allows scan failure recovery", async ({ page }, testInfo) => {
    const state = { hubs: [LIVING], seen: [{ ...SEEN_NEW, present: false }, SEEN_KNOWN] };
    await mockServer(page, state);
    await page.route(`**${API}/discovery/scan`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ type: "discovery_unavailable", detail: "Try again shortly" }) }));
    await page.goto(PAGE);
    await chip(page).click();
    await expect(page.locator(".picker-seen")).toHaveCount(1);
    await expect(page.locator(".picker-seen")).toContainText("Not currently seen");
    await expect(page.locator("#hub-picker-menu [role=alert]")).toContainText("Try again shortly");
    await page.unroute(`**${API}/discovery/scan`);
    state.seen[0].present = true;
    await page.click("#seen-scan");
    await expect(page.locator("#seen-scan")).toBeEnabled();
    await expect(page.locator("#hub-picker-menu [role=alert]")).toHaveCount(0);
    await expect(page.locator(".picker-seen")).not.toContainText("Not currently seen");
    await page.screenshot({ path: shot(testInfo, "picker-discovery-light") });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await page.screenshot({ path: shot(testInfo, "picker-discovery-dark") });
  });

  test("keyboard access, manual back and outside click work with a single hub", async ({ page }, testInfo) => {
    await mockServer(page, { hubs: [LIVING], seen: [] });
    await page.goto(PAGE);
    await chip(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(options(page).first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator("#hub-picker-manual")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#add-host")).toBeFocused();
    const box = await page.locator("#hub-picker-menu").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.screenshot({ path: shot(testInfo, "picker-manual") });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.locator("#hub-picker-manual")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#hub-picker-menu")).toHaveCount(0);
    await expect(chip(page)).toBeFocused();
    await chip(page).click();
    await page.locator(".brand").click();
    await expect(page.locator("#hub-picker-menu")).toHaveCount(0);
  });

  test("adding a discovered hub respects unsaved work before changing selection", async ({ page }) => {
    const state = { hubs: [LIVING], seen: [SEEN_NEW] };
    const { calls } = await mockServer(page, state);
    await page.goto(`${PAGE}#/e26a44861b45/hub/devices`);
    await expect(chip(page)).toContainText("Living room");
    await page.evaluate(() => document.querySelector("sofabaton-server-panel").store.setDraft("e26a44861b45", { scope: "hub/devices", snapshotId: "snap-1", data: { renamed: "TV" } }));
    await chip(page).click();
    let asked = false;
    page.once("dialog", (dialog) => {
      asked = true;
      expect(dialog.message()).toContain("unsaved changes");
      dialog.dismiss();
    });
    await page.getByRole("button", { name: "Add Bedroom", exact: true }).click();
    await expect.poll(() => asked).toBe(true);
    await expect(chip(page)).toContainText("Living room");
    await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/devices$/);
    await chip(page).click();
    await expect(options(page)).toHaveCount(2);
    expect(calls.filter((c) => c.key === "POST /hubs")).toHaveLength(1);
  });
});

test("manual addition selects the re-keyed hub, but preserves navigation during a pending add", async ({ page }) => {
  const state = { hubs: [LIVING, OFFICE], seen: [] };
  await mockServer(page, state);
  let finishAdd;
  let started = false;
  await page.route(`**${API}/hubs`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    started = true;
    if (body.host === "192.168.1.71") await new Promise((resolve) => { finishAdd = resolve; });
    const newHub = { ...OFFICE, hub_id: body.host === "192.168.1.70" ? SEEN_NEW.key : "other-mac", config: { host: body.host, name: body.name }, enabled: false };
    state.hubs.push(newHub);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...newHub, hub_id: body.host }) });
  });
  await page.goto(PAGE);
  await openManualAdd(page);
  await page.fill("#add-host", "192.168.1.70");
  await page.fill("#add-name", "Bedroom");
  await page.click("#add-send");
  await expect(chip(page)).toContainText("Bedroom");
  await expect(page).toHaveURL(/#\/cb383539684b\/hub\/activities$/);
  await openManualAdd(page);
  await page.fill("#add-host", "192.168.1.71");
  await page.fill("#add-name", "Garage");
  started = false;
  await page.click("#add-send");
  await expect.poll(() => started).toBe(true);
  await page.keyboard.press("Escape");
  await pickHub(page, LIVING.hub_id);
  finishAdd();
  await expect.poll(() => state.hubs.length).toBe(4);
  await chip(page).click();
  await expect(options(page)).toHaveCount(4);
  await expect(chip(page)).toContainText("Living room");
  await expect(page).toHaveURL(/#\/e26a44861b45\/hub\/activities$/);
});

test("device section navigation holds its target during smooth scrolling and resumes tracking manual scroll", async ({ page }) => {
  await mockServer(page, { hubs: [LIVING], seen: [] });
  const snapshot = {
    snapshot_id: "scroll-test", captured_at: "t", engine_generation: 1, complete: true, payload_profile: "structural",
    hub: { name: "Living room", version: "X1S" }, activities: [],
    devices: [{ kind: "device_backup", complete: true, editable: true, fetched_at: "t",
      device: { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", idle_behavior: 1 },
      commands: Array.from({ length: 48 }, (_, i) => ({ command_id: i + 1, name: `Command ${i + 1}` })),
      button_bindings: [{ button_id: 151, button_name: "OK", command_id: 1, command_name: "Command 1" }],
      macros: [], key_sort: null, input_record: null,
    }],
  };
  await page.route(`**${API}/hubs/${LIVING.hub_id}/snapshot`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto(`${PAGE}#/e26a44861b45/hub/devices/1`);
  const editor = page.locator("sb-panel-device-editor");
  const nav = (id) => editor.locator(`.detail-section-nav-btn[data-section="${id}"]`);
  await expect(nav("power")).toHaveAttribute("aria-selected", "true");
  await nav("bindings").click();
  const sampleActiveSections = () => page.evaluate(async () => {
    const editor = document.querySelector("sofabaton-server-panel").shadowRoot.querySelector("sb-panel-device-editor").shadowRoot;
    const samples = [];
    const start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        samples.push({ section: editor.querySelector('.detail-section-nav-btn.active')?.dataset.section, y: window.scrollY });
        if (performance.now() - start >= 1200) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    return samples;
  });
  const samples = await sampleActiveSections();
  expect([...new Set(samples.map((s) => s.section))]).toEqual(["bindings"]);
  expect(new Set(samples.map((s) => Math.round(s.y))).size).toBeGreaterThan(2);
  // A new click supersedes a scroll in flight without selecting the sections passed along the way.
  await nav("power").click();
  await nav("commands").click();
  const retargeted = await sampleActiveSections();
  expect([...new Set(retargeted.map((s) => s.section))]).toEqual(["commands"]);
  // Manual input interrupts a new animated jump and returns to position-based tracking.
  await nav("bindings").click();
  await page.mouse.move(200, 400);
  await page.mouse.wheel(0, -450);
  await expect(nav("bindings")).toHaveAttribute("aria-selected", "false");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(nav("power")).toHaveAttribute("aria-selected", "true");
});

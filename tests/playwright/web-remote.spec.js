// The web remote page (docs/internal/web-remote-plan.md, R5): the built
// bundle from sofabaton_server/ui served by the fixtures server, with the
// server's REST routes mocked at the same origin and the /events stream
// mocked with routeWebSocket. Fixture bodies follow openapi.json shapes.

import { test, expect } from "@playwright/test";

const HUB = "E2:6A:44:86:1B:45";
const PAGE = "/sofabaton-x-server/src/sofabaton_server/ui/remote/index.html";
const API = "/api/v1";

const STATUS = {
  hub_id: HUB,
  enabled: true,
  config: { host: "192.168.1.50", name: "Living room" },
  status: {
    hub_connected: true,
    app_connected: false,
    controllable: true,
    mode: "control",
    hub_version: "x1s",
    proxy_enabled: true,
    running_activity: { activity_id: 101, name: "Watch TV" },
    activities_cached: 2,
    devices_cached: 2,
    catalog_ready: true,
  },
  added_at: "2026-09-15T00:00:00Z",
  last_seen: null,
};

function makeRoutes(state) {
  return {
    "GET /hubs": () => [STATUS],
    [`GET /hubs/${HUB}/ui/remote-card`]: () => ({ hub_id: HUB, document: state.document, updated_at: null }),
    [`GET /hubs/${HUB}/status`]: () => STATUS,
    [`GET /hubs/${HUB}/activities`]: () => [
      { activity_id: 101, name: "Watch TV", active: true, needs_confirm: false },
      { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
    ],
    [`GET /hubs/${HUB}/devices`]: () => [
      { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", device_class_code: 1, power_state: 0, idle_behavior: 2 },
      { device_id: 2, name: "Amp", brand: "Denon", device_class: "ir", device_class_code: 1, power_state: 1, idle_behavior: null },
    ],
    [`GET /hubs/${HUB}/activity`]: () => state.running,
    [`GET /hubs/${HUB}/entities/101/buttons`]: () => [
      { button_code: 151, name: "OK", device_id: 1, command_id: 9, long_press_device_id: null, long_press_command_id: null },
      { button_code: 174, name: "UP", device_id: 1, command_id: 17, long_press_device_id: null, long_press_command_id: null },
      { button_code: 175, name: "DOWN", device_id: 1, command_id: 18, long_press_device_id: 2, long_press_command_id: 5 },
    ],
    [`GET /hubs/${HUB}/activities/101/macros`]: () => [{ command_id: 200, label: "All On" }],
    [`GET /hubs/${HUB}/activities/101/favorites`]: () => [{ device_id: 1, command_id: 1, label: "Power" }],
    [`GET /hubs/${HUB}/entities/102/buttons`]: () => [{ button_code: 151, name: "OK", device_id: 2, command_id: 3 }],
    [`GET /hubs/${HUB}/activities/102/macros`]: () => [],
    [`GET /hubs/${HUB}/activities/102/favorites`]: () => [],
    [`POST /hubs/${HUB}/send`]: () => ({ accepted: true, mode: "control" }),
    [`POST /hubs/${HUB}/activities/102/start`]: () => ({ accepted: true, mode: "control" }),
    [`POST /hubs/${HUB}/activities/101/stop`]: () => ({ accepted: true, mode: "control" }),
  };
}

async function mockServer(page, state) {
  const routes = makeRoutes(state);
  const calls = [];
  await page.route(`**${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // The page derives the server base from its own URL (everything before
    // /ui/remote/), so the API sits under the package path, not the origin.
    const key = `${request.method()} ${decodeURIComponent(url.pathname.slice(url.pathname.indexOf(API) + API.length))}`;
    const body = request.postDataJSON ? request.postDataJSON() : null;
    calls.push({ key, body });
    const handler = routes[key];
    // A test can hold one route's answer (a promise it resolves later).
    if (state.holds && state.holds[key]) await state.holds[key];
    if (!handler) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ type: "not_found" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(handler(body)) });
  });
  const sockets = [];
  await page.routeWebSocket(`**${API}/events**`, (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "hello", server_version: "0.2.0", api_version: "1", hubs: [{ hub_id: HUB, enabled: true }], instance_id: "i1" }));
  });
  return { calls, sockets };
}

function card(page) {
  return page.locator("sofabaton-remote-web sofabaton-virtual-remote");
}

test.describe("web remote page", () => {
  test("without a hub parameter it lists the server's hubs", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(PAGE);
    const notice = page.locator("sofabaton-remote-web .notice");
    await expect(notice).toContainText("Open this page with ?hub=");
    await expect(notice.locator("a")).toHaveAttribute("href", `?hub=${encodeURIComponent(HUB)}`);
    await expect(notice).toContainText("Living room");
  });

  test("an unknown hub id names the known ones", async ({ page }) => {
    await mockServer(page, { document: null, running: null });
    await page.goto(`${PAGE}?hub=nope`);
    await expect(page.locator("sofabaton-remote-web .notice")).toContainText("No hub with id nope");
  });

  test("renders the card from the server, sends keys, follows the stream", async ({ page }) => {
    const state = { document: { show_dvr: false }, running: STATUS.status.running_activity };
    const { calls, sockets } = await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    await expect(page.locator("sofabaton-remote-web .foot")).toContainText("Living room");

    // The activity row shows the running activity through the shimmed ha-select.
    // The card keeps a second, hidden activity row for layout transitions.
    const select = remote.locator("ha-select.sb-activity-select >> visible=true").first();
    await expect(select).toBeVisible();
    await expect(select.locator(".value")).toHaveText("Watch TV");
    // The mdi shim renders SVG paths for the card's own icons.
    await expect(remote.locator("ha-icon svg path").first()).toHaveAttribute("d", /^M/);

    // A key press goes to POST /send in the running activity's scope
    // (the dpad UP key is command 174 on the activity page).
    await remote.locator(".dpad .area-up >> visible=true").first().click();
    await expect.poll(() => calls.filter((c) => c.key === `POST /hubs/${HUB}/send`).map((c) => c.body)).toEqual([
      { entity_id: 101, command_id: 174 },
    ]);

    // The stream moves the running activity; the select follows.
    await expect.poll(() => sockets.length).toBe(1);
    state.running = { activity_id: 102, name: "Listen" };
    sockets[0].send(JSON.stringify({
      type: "hub_event",
      hub_id: HUB,
      event: { seq: 2, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
    }));
    await expect(select.locator(".value")).toHaveText("Listen");

    // Choosing an activity from the shim's menu starts it on the server.
    await select.locator(".trigger").click();
    // The card clips the select host (overflow: hidden); the menu must
    // float clear of it or it is painted nowhere (IntersectionObserver
    // honours ancestor clipping, a plain visibility check does not).
    const option = select.locator(".option", { hasText: "Watch TV" });
    await expect(option).toBeInViewport({ ratio: 1 });
    await option.click();
    await expect.poll(() => calls.some((c) => c.key === `POST /hubs/${HUB}/activities/101/start`)).toBe(true);
    // A reference capture of the page for review (not a baseline).
    await page.screenshot({ path: "test-results/web-remote-page.png", fullPage: true });
  });

  test("activity changes never paint a default selector over the live remote", async ({ page }) => {
    let release;
    const state = { document: { layouts: { "102": { show_dpad: false } } }, running: STATUS.status.running_activity, holds: {} };
    const { sockets } = await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote.locator("ha-select.sb-activity-select .value").first()).toHaveText("Watch TV");
    await expect.poll(() => sockets.length).toBe(1);
    // Sample every painted frame, including the temporary animation layer.
    await remote.evaluate((element) => {
      element.dataset.labels = "[]";
      const labels = [];
      const sample = () => {
        for (const select of element.shadowRoot.querySelectorAll("ha-select.sb-activity-select")) {
          if (select.getBoundingClientRect().height) labels.push(select.shadowRoot.querySelector(".value").textContent);
        }
        element.dataset.labels = JSON.stringify(labels);
        if (!element.hasAttribute("data-stop-sampling")) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    state.holds[`GET /hubs/${HUB}/entities/102/buttons`] = new Promise((resolve) => { release = resolve; });
    state.running = { activity_id: 102, name: "Listen" };
    sockets[0].send(JSON.stringify({ type: "hub_event", hub_id: HUB, event: { seq: 2, kind: "activity_changed", payload: state.running } }));
    await expect(remote.locator(".dpad >> visible=true")).toHaveCount(0);
    await expect(remote.locator("ha-select.sb-activity-select .value").first()).toHaveText("Listen");
    release();
    await expect(remote.locator(".loadIndicator").first()).not.toHaveClass(/is-loading/);
    // Include the whole transition, rather than only checking its final state.
    await page.waitForTimeout(350);
    const labels = await remote.evaluate((element) => {
      element.setAttribute("data-stop-sampling", "");
      return JSON.parse(element.dataset.labels);
    });
    expect(labels).toContain("Listen");
    expect([...new Set(labels)].filter((label) => label !== "Watch TV" && label !== "Listen")).toEqual([]);
  });

  test("nothing alarming shows before the server's first answer", async ({ page }) => {
    let releaseStatus;
    const held = new Promise((resolve) => (releaseStatus = resolve));
    const state = {
      document: null,
      running: STATUS.status.running_activity,
      holds: { [`GET /hubs/${HUB}/status`]: held },
    };
    await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    const row = remote.locator(".activityRow >> visible=true").first();
    await expect(row.locator(".loadIndicator")).toHaveClass(/is-loading/);
    // Give any flash a chance to paint, then assert it never did.
    await page.waitForTimeout(300);
    await expect(page.locator("sofabaton-remote-web .banner")).toBeHidden();
    await expect(remote.locator(".sb-notice")).toHaveCount(0);
    await expect(remote.locator(".dpad .area-up >> visible=true").first()).toHaveClass(/disabled/);

    releaseStatus();
    await expect(row.locator("ha-select .value")).toHaveText("Watch TV");
    await expect(row.locator(".loadIndicator")).not.toHaveClass(/is-loading/);
    await expect(remote.locator(".sb-notice")).toHaveCount(0);
  });

  test("keys stay disabled and the indicator runs until the activity's keys arrive", async ({ page }) => {
    let releaseButtons;
    const held = new Promise((resolve) => (releaseButtons = resolve));
    const state = {
      document: null,
      running: STATUS.status.running_activity,
      holds: { [`GET /hubs/${HUB}/entities/101/buttons`]: held },
    };
    await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    const select = remote.locator("ha-select.sb-activity-select >> visible=true").first();
    await expect(select.locator(".value")).toHaveText("Watch TV");
    const up = remote.locator(".dpad .area-up >> visible=true").first();
    // Scoped to the shown row: the indicator itself is invisible when idle.
    const indicator = remote.locator(".activityRow >> visible=true").first().locator(".loadIndicator");
    // The catalog is in and the running activity is shown, but its key
    // page is still on its way: no button is enabled yet.
    await expect(up).toHaveClass(/disabled/);
    await expect(indicator).toHaveClass(/is-loading/);
    await expect(select).toBeEnabled();

    releaseButtons();
    await expect(up).not.toHaveClass(/disabled/);
    await expect(indicator).not.toHaveClass(/is-loading/);
  });

  test("the mode toggle's line follows the shimmed select's focus and open state", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    const row = remote.locator(".activityRow >> visible=true").first();
    const toggle = row.locator(".sb-mode-toggle");
    const trigger = row.locator("ha-select .trigger");
    const lit = (locator) =>
      // Chrome serializes the color first and "inset" last; the line
      // transitions over 180 ms, hence the polling below.
      locator.evaluate((el) => /inset/.test(getComputedStyle(el).boxShadow) && /-2px/.test(getComputedStyle(el).boxShadow));
    await expect(toggle).toBeVisible();
    await expect.poll(() => lit(toggle)).toBe(false);
    await expect.poll(() => lit(trigger)).toBe(false);

    // Mouse click opens the menu: field and toggle light together.
    await trigger.click();
    await expect.poll(() => lit(trigger)).toBe(true);
    await expect.poll(() => lit(toggle)).toBe(true);

    // Menu closed by Escape, field still focused (HA keeps it): both stay lit.
    await page.keyboard.press("Escape");
    await expect(row.locator("ha-select")).not.toHaveAttribute("open", "");
    await expect.poll(() => lit(trigger)).toBe(true);
    await expect.poll(() => lit(toggle)).toBe(true);

    // Focus leaves the field: both go dark.
    await remote.locator(".dpad .area-up >> visible=true").first().click();
    await expect.poll(() => lit(trigger)).toBe(false);
    await expect.poll(() => lit(toggle)).toBe(false);
  });

  test("the select's menu lines up under the trigger when the page is zoomed", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&zoom=1.5`);
    const select = card(page).locator("ha-select.sb-activity-select >> visible=true").first();
    await expect(select).toBeVisible();
    await select.locator(".trigger").click();
    const option = select.locator(".option", { hasText: "Listen" });
    await expect(option).toBeInViewport({ ratio: 1 });
    // The menu is fixed-positioned and placed by measurement, so a zoomed
    // ancestor must not skew it: same left edge and width as the trigger,
    // hanging just below it.
    const trigger = await select.locator(".trigger").boundingBox();
    const menu = await select.locator(".menu").boundingBox();
    expect(Math.abs(menu.x - trigger.x)).toBeLessThan(2);
    expect(Math.abs(menu.width - trigger.width)).toBeLessThan(2);
    expect(menu.y - (trigger.y + trigger.height)).toBeGreaterThan(2);
    expect(menu.y - (trigger.y + trigger.height)).toBeLessThan(12);
  });

  for (const zoom of [1, 1.5]) {
    for (const device of [false, true]) {
      test(`the bottom ${device ? "device" : "activity"} selector opens inside the card at zoom ${zoom}`, async ({ page }) => {
        const order = ["dpad", "nav", "mid", "media", "colors", "shortcuts", "macro_favorites", "activity"];
        await mockServer(page, {
          document: { group_order: order, device_mode: { layouts: { default: { group_order: order } } } },
          running: STATUS.status.running_activity,
        });
        await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&zoom=${zoom}${device ? "&device=1" : ""}`);
        const remote = card(page);
        const select = remote.locator("ha-select.sb-activity-select >> visible=true").first();
        await expect(select.locator(".value")).toHaveText(device ? "TV" : "Watch TV");
        await select.locator(".trigger").click();
        const trigger = await select.locator(".trigger").boundingBox();
        const menu = await select.locator(".menu").boundingBox();
        const bounds = await remote.locator("ha-card").boundingBox();
        expect(menu.y + menu.height).toBeLessThan(trigger.y);
        expect(menu.y).toBeGreaterThanOrEqual(Math.max(0, bounds.y));
        expect(Math.abs(menu.x - trigger.x)).toBeLessThan(2);
        expect(Math.abs(menu.width - trigger.width)).toBeLessThan(2);
        await expect(select.locator(".option").last()).toBeInViewport({ ratio: 1 });
        await select.locator(".trigger").press("Escape");
        await expect(select.locator(".menu")).not.toBeVisible();
      });
    }
  }

  test("a stored background override paints the card without Home Assistant", async ({ page }) => {
    await mockServer(page, {
      document: { use_background_override: true, background_override: [20, 20, 20] },
      running: STATUS.status.running_activity,
    });
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    await expect.poll(async () =>
      remote.evaluate((el) => {
        const root = el.shadowRoot?.querySelector("ha-card");
        return root ? getComputedStyle(root).backgroundColor : null;
      }),
    ).toBe("rgb(20, 20, 20)");
  });

  test("the hub id is matched the way the server spells it", async ({ page }) => {
    const { calls } = await mockServer(page, { document: null, running: STATUS.status.running_activity });
    // The mock lists the hub in colon form; the URL uses the compact form.
    await page.goto(`${PAGE}?hub=e26a44861b45`);
    await expect(card(page)).toBeVisible();
    await expect.poll(() => calls.some((c) => c.key === `GET /hubs/${HUB}/status`)).toBe(true);
  });

  test("the hub going away shows the banner and dark theme applies", async ({ page }) => {
    const state = { document: null, running: STATUS.status.running_activity };
    const { sockets } = await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&theme=dark`);
    await expect(card(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--card-background-color").trim());
    expect(bg).toBe("#1c1c1c");

    await expect.poll(() => sockets.length).toBe(1);
    STATUS.status.controllable = false;
    STATUS.status.mode = "observe";
    sockets[0].send(JSON.stringify({ type: "hub_event", hub_id: HUB, event: { seq: 3, kind: "status_changed", payload: { mode: "observe", previous_mode: "control" } } }));
    await expect(page.locator("sofabaton-remote-web .banner")).toBeVisible();
    await expect(page.locator("sofabaton-remote-web .banner")).toContainText("not controllable");
    STATUS.status.controllable = true;
    STATUS.status.mode = "control";
  });
});

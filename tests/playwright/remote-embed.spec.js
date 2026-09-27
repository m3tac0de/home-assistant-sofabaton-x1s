// The embeddable remote (docs/internal/remote-embed-plan.md, E1 + E2): the
// built bundle from sofabaton_server/ui/embed on a host page with its own
// palette, the server's REST routes mocked and the /events stream mocked
// with routeWebSocket. The script's own URL carries /ui/embed/, so the
// element derives the server base from it (decision 7) and the API sits
// under the package path. E5 adds the second-origin cases.

import { test, expect } from "@playwright/test";

const HUB = "E2:6A:44:86:1B:45";
const PAGE = "/tests/playwright/fixtures/remote-embed-host.html";
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
    "GET /server": () => ({ name: "sofabaton-x-server", version: "0.2.2", api_version: "1", api_path: API, hubs: 1, uptime_seconds: 1 }),
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
    ],
    [`GET /hubs/${HUB}/activities/101/macros`]: () => [],
    [`GET /hubs/${HUB}/activities/101/favorites`]: () => [],
    [`GET /hubs/${HUB}/entities/102/buttons`]: () => [{ button_code: 151, name: "OK", device_id: 2, command_id: 3 }],
    [`GET /hubs/${HUB}/activities/102/macros`]: () => [],
    [`GET /hubs/${HUB}/activities/102/favorites`]: () => [],
    [`POST /hubs/${HUB}/send`]: () => ({ accepted: true, mode: "control" }),
  };
}

// The mock plays the server's CORS rule itself (E5): a listed origin is
// echoed on every answer and its preflights are granted. The real server
// sends nothing for an unlisted origin, but Playwright's fulfill() fills a
// missing allow-origin header in with the request's origin, so the mock
// sends a value that matches no page instead: the browser rejects it the
// same way (a failed fetch). `state.listed` is read per request, so a test
// can list the origin midway.
async function mockServer(page, state) {
  const routes = makeRoutes(state);
  const calls = [];
  const cors = (request) => {
    const origin = request.headers().origin;
    if (!origin) return {};
    return { "Access-Control-Allow-Origin": state.listed ? origin : "http://unlisted.invalid", Vary: "Origin" };
  };
  await page.route(`**${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${decodeURIComponent(url.pathname.slice(url.pathname.indexOf(API) + API.length))}`;
    if (request.method() === "OPTIONS") {
      calls.push({ key, body: null, origin: url.origin });
      await route.fulfill({ status: 204, headers: {
        ...cors(request),
        "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE",
        "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "content-type",
      } });
      return;
    }
    const body = request.postDataJSON ? request.postDataJSON() : null;
    calls.push({ key, body, origin: url.origin });
    const handler = routes[key];
    if (!handler) {
      await route.fulfill({ status: 404, contentType: "application/json", headers: cors(request), body: JSON.stringify({ type: "not_found" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: cors(request), body: JSON.stringify(handler(body)) });
  });
  const sockets = [];
  await page.routeWebSocket(`**${API}/events**`, (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "hello", server_version: "0.2.2", api_version: "1", hubs: [{ hub_id: HUB, enabled: true }], instance_id: "i1" }));
  });
  return { calls, sockets };
}

const element = (page) => page.locator("sofabaton-remote");
const card = (page) => page.locator("sofabaton-remote sbx-virtual-remote");
const events = (page) => page.evaluate(() => window.__events);
const variable = (locator, name) => locator.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test.describe("embeddable remote", () => {
  test("renders the hub's card from the script's own server, sends keys, follows the stream", async ({ page }) => {
    const state = { document: null, running: STATUS.status.running_activity };
    const { calls, sockets } = await mockServer(page, state);
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    // The base came from the script URL: the API lives under the package path.
    expect(calls[0].key).toBe("GET /hubs");
    await expect.poll(events.bind(null, page)).toEqual([
      { type: "sofabaton-remote-ready", detail: { hub: HUB, name: "Living room" } },
    ]);
    const select = remote.locator("sbx-ha-select.sb-activity-select >> visible=true").first();
    await expect(select.locator(".value")).toHaveText("Watch TV");
    // Prefixed internals (E3): the remote's icons render through its own
    // shim while the host page's <ha-icon> and <ha-card> stay the host's.
    await expect(remote.locator("sbx-ha-icon svg path").first()).toHaveAttribute("d", /^M/);
    await expect(remote.locator("ha-icon, ha-card, sb-key-button")).toHaveCount(0);
    expect(await page.evaluate(() => {
      const icon = document.createElement("ha-icon");
      const hostCard = document.createElement("ha-card");
      document.body.append(icon, hostCard);
      return [icon.textContent, hostCard.dataset.host];
    })).toEqual(["host icon", "card"]);

    await remote.locator(".dpad .area-up >> visible=true").first().click();
    await expect.poll(() => calls.filter((c) => c.key === `POST /hubs/${HUB}/send`).map((c) => c.body)).toEqual([
      { entity_id: 101, command_id: 174 },
    ]);

    await expect.poll(() => sockets.length).toBe(1);
    state.running = { activity_id: 102, name: "Listen" };
    sockets[0].send(JSON.stringify({
      type: "hub_event",
      hub_id: HUB,
      event: { seq: 2, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
    }));
    await expect(select.locator(".value")).toHaveText("Listen");
    // Nothing leaked onto the page: the host's root keeps only its own variables.
    expect(await page.evaluate(() => document.documentElement.getAttribute("style"))).toBeNull();
    expect(await page.evaluate(() => document.getElementById("sofabaton-remote-web-palette"))).toBeNull();
    await page.screenshot({ path: "test-results/remote-embed-host.png", fullPage: true });
  });

  test("inherits the host's palette, derives the rgb twin, and fills the rest in dark because the host is dark", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}`);
    const host = element(page);
    await expect(card(page)).toBeVisible();
    expect(await variable(host, "--primary-color")).toBe("#ff6600");
    expect(await variable(host, "--card-background-color")).toBe("#202020");
    expect(await variable(host, "--rgb-primary-color")).toBe("255, 102, 0");
    expect(await variable(host, "--rgb-primary-text-color")).toBe("240, 240, 240");
    // The host's text is light, so the fill-ins are HA's dark ones.
    expect(await variable(host, "--secondary-text-color")).toBe("#9b9b9b");
    expect(await variable(host, "--divider-color")).toBe("rgba(225, 225, 225, 0.12)");
    expect(await host.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
    // The card's activity row paints with the host's accent through the shim.
    const accent = await card(page).locator("sbx-ha-select.sb-activity-select >> visible=true").first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--primary-color").trim());
    expect(accent).toBe("#ff6600");

    // A host that changes its variables after connect is picked up by refreshTheme().
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--primary-text-color", "#101010");
      document.documentElement.style.setProperty("--card-background-color", "#ffffff");
    });
    expect(await variable(host, "--secondary-text-color")).toBe("#9b9b9b");
    await host.evaluate((el) => el.refreshTheme());
    expect(await variable(host, "--secondary-text-color")).toBe("#5e5e5e");
    expect(await variable(host, "--rgb-primary-text-color")).toBe("16, 16, 16");
    expect(await host.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light");
  });

  test("theme=light pins the HA palette over the host's, and the attribute can change live", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&theme=light`);
    const host = element(page);
    await expect(card(page)).toBeVisible();
    expect(await variable(host, "--primary-color")).toBe("#009ac7");
    expect(await variable(host, "--card-background-color")).toBe("#ffffff");
    expect(await variable(host, "--rgb-primary-color")).toBe("0, 154, 199");
    await host.evaluate((el) => el.setAttribute("theme", "dark"));
    expect(await variable(host, "--card-background-color")).toBe("#1c1c1c");
    await host.evaluate((el) => el.removeAttribute("theme"));
    expect(await variable(host, "--primary-color")).toBe("#ff6600");
  });

  test("a config override replaces the server's layout and skips reading it", async ({ page }) => {
    const { calls } = await mockServer(page, { document: { show_dpad: true }, running: STATUS.status.running_activity });
    const config = encodeURIComponent(JSON.stringify({ show_dpad: false }));
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&config=${config}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    await expect(remote.locator("sbx-ha-select.sb-activity-select .value").first()).toHaveText("Watch TV");
    await expect(remote.locator(".dpad >> visible=true")).toHaveCount(0);
    expect(calls.some((c) => c.key === `GET /hubs/${HUB}/ui/remote-card`)).toBe(false);
    // Clearing the override reloads the server's layout, which has the d-pad.
    await element(page).evaluate((el) => el.removeAttribute("config"));
    await expect(card(page).locator(".dpad >> visible=true").first()).toBeVisible();
    expect(calls.some((c) => c.key === `GET /hubs/${HUB}/ui/remote-card`)).toBe(true);
  });

  test("an unknown hub shows a compact notice and fires the error event; fixing the attribute recovers", async ({ page }) => {
    await mockServer(page, { document: null, running: STATUS.status.running_activity });
    await page.goto(`${PAGE}?hub=nope`);
    const notice = page.locator("sofabaton-remote .notice");
    await expect(notice).toContainText("No hub with id nope");
    await expect.poll(events.bind(null, page)).toEqual([
      { type: "sofabaton-remote-error", detail: { code: "hub_not_found", message: "No hub with id nope is registered on this server." } },
    ]);
    await expect(card(page)).toHaveCount(0);
    await element(page).evaluate((el, hub) => el.setAttribute("hub", hub), HUB);
    await expect(card(page)).toBeVisible();
    await expect(notice).toBeHidden();
  });

  test("without a hub the notice says what to set", async ({ page }) => {
    await mockServer(page, { document: null, running: null });
    await page.goto(PAGE);
    await expect(page.locator("sofabaton-remote .notice")).toContainText("No hub id given");
    const seen = await events(page);
    expect(seen.map((e) => e.detail.code)).toEqual(["hub_missing"]);
  });

  test("a server the page cannot reach is named as such", async ({ page }) => {
    await page.route("**/api/v1/**", (route) => route.abort("connectionrefused"));
    await page.goto(`${PAGE}?hub=${encodeURIComponent(HUB)}&server=http://127.0.0.1:1/`);
    await expect(page.locator("sofabaton-remote .notice")).toContainText("did not answer");
    await expect.poll(async () => (await events(page)).map((e) => e.detail.code)).toEqual(["server_unreachable"]);
  });
});

// E5: the host page lives on http://localhost:4173, the script and the
// server on http://127.0.0.1:4173. Same fixtures server, a different origin
// for the browser, so every API call is a real cross-origin fetch and the
// module script itself only loads because the fixtures server sends `*`
// on it, as the real server does for /ui/embed/.
const HOST_ORIGIN = "http://localhost:4173";
const SERVER_ORIGIN = "http://127.0.0.1:4173";
const CROSS_PAGE = `${HOST_ORIGIN}/tests/playwright/fixtures/remote-embed-cross-origin.html`;

test.describe("embeddable remote on a second origin", () => {
  test("shows the allowed_origins notice until the origin is listed, then works fully", async ({ page }) => {
    const state = { document: null, running: STATUS.status.running_activity, listed: false };
    const { calls, sockets } = await mockServer(page, state);
    await page.goto(`${CROSS_PAGE}?hub=${encodeURIComponent(HUB)}`);
    const host = element(page);
    const notice = page.locator("sofabaton-remote .notice");
    // The script ran (the element upgraded), the reads were refused by the
    // browser, and the no-cors probe told the element the server is there.
    await expect(notice).toContainText("allowed_origins");
    await expect(notice).toContainText(HOST_ORIGIN);
    await expect.poll(async () => (await events(page)).map((e) => e.detail.code)).toEqual(["cross_origin_refused"]);
    await expect(card(page)).toHaveCount(0);
    expect(calls.map((c) => c.origin)).toEqual(calls.map(() => SERVER_ORIGIN));
    expect(calls.map((c) => c.key)).toEqual(["GET /hubs", "GET /server"]);

    // The user lists the origin on the server and the host calls reload().
    state.listed = true;
    await host.evaluate((el) => el.reload());
    const remote = card(page);
    await expect(remote).toBeVisible();
    await expect(notice).toBeHidden();
    await expect.poll(async () => (await events(page)).map((e) => e.type)).toEqual([
      "sofabaton-remote-error",
      "sofabaton-remote-ready",
    ]);
    const select = remote.locator("sbx-ha-select.sb-activity-select >> visible=true").first();
    await expect(select.locator(".value")).toHaveText("Watch TV");

    // A key press is a cross-origin POST. (Its CORS preflight is answered
    // inside Playwright's interception and never reaches page.route; the
    // server's preflight answer is covered by test_auth.py.)
    await remote.locator(".dpad .area-up >> visible=true").first().click();
    await expect.poll(() => calls.filter((c) => c.key === `POST /hubs/${HUB}/send`).map((c) => c.body)).toEqual([
      { entity_id: 101, command_id: 174 },
    ]);

    // The stream is not origin-bound and keeps the card current.
    await expect.poll(() => sockets.length).toBe(1);
    state.running = { activity_id: 102, name: "Listen" };
    sockets[0].send(JSON.stringify({
      type: "hub_event",
      hub_id: HUB,
      event: { seq: 2, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
    }));
    await expect(select.locator(".value")).toHaveText("Listen");

    // The host's variables win where set; the twin follows the host's colour.
    expect(await variable(host, "--primary-color")).toBe("#ff6600");
    expect(await variable(host, "--rgb-primary-color")).toBe("255, 102, 0");
    expect(await variable(host, "--secondary-text-color")).toBe("#9b9b9b");
  });

  test("a listed origin loads straight away and the stored layout comes from the server", async ({ page }) => {
    const state = { document: { show_dpad: false }, running: STATUS.status.running_activity, listed: true };
    const { calls } = await mockServer(page, state);
    await page.goto(`${CROSS_PAGE}?hub=${encodeURIComponent(HUB)}`);
    const remote = card(page);
    await expect(remote).toBeVisible();
    await expect(remote.locator(".dpad >> visible=true")).toHaveCount(0);
    expect(calls.some((c) => c.key === `GET /hubs/${HUB}/ui/remote-card` && c.origin === SERVER_ORIGIN)).toBe(true);
    expect((await events(page)).map((e) => e.type)).toEqual(["sofabaton-remote-ready"]);
  });
});

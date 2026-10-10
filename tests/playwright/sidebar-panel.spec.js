import { expect, test } from "@playwright/test";

// The "Sofabaton X" sidebar panel and the sidebar remote
// (docs/internal/sidebar-remote-plan.md), against the harness in
// tests/playwright/fixtures/sidebar-panel-harness.*.

const HARNESS = "/tests/playwright/fixtures/sidebar-panel-harness.html";
const PHONE = { width: 390, height: 844 };

async function open(page, query = "") {
  await page.goto(`${HARNESS}${query ? `?${query}` : ""}`);
  // The hub poll + the integration probe have settled once the mode button is up.
  await page.waitForFunction(() => {
    const remote = window.__sidebarHarness?.remote();
    return Boolean(remote?.entityId) && Boolean(remote.shadowRoot?.querySelector("[data-key]"));
  });
}

const panel = (page) => page.locator("sofabaton-x-panel");
const remote = (page) => page.locator("sofabaton-x-panel sofabaton-sidebar-remote");

test.use({ viewport: PHONE, hasTouch: true });

test.describe("sidebar panel", () => {
  test("unavailable hubs and missing remote entities never claim powered off or no configured hubs", async ({ page }) => {
    await open(page);
    await panel(page).locator(".hub").click();
    await panel(page).locator(".menu .mi").nth(2).click();
    await expect(remote(page).locator(".activity .name")).toHaveText("Hub unavailable");
    await expect(remote(page).locator(".app")).toHaveClass(/inert/);
    await panel(page).locator(".hub").click();
    await panel(page).locator(".menu .mi").nth(0).click();
    await expect(remote(page).locator(".activity .name")).toHaveText("Watch a movie");
    await page.evaluate(() => {
      const harness = window.__sidebarHarness;
      delete harness.hass.states[harness.remote().entityId];
      harness.push();
    });
    await expect(remote(page).locator(".notice")).toHaveText("The remote for this hub is unavailable.");
    await expect(panel(page).locator(".hub .name")).toHaveText("Souterrain");
    await page.goto(`${HARNESS}?hubs=0`);
    await expect(panel(page).locator(".content > .empty")).toHaveText("No Sofabaton hub is set up yet.");
  });

  test("Dutch drawer names and unknown-operation progress remain localized", async ({ page }) => {
    await open(page, "lang=nl");
    await expect(panel(page).locator(".tab.panel")).toHaveAccessibleName("Bedieningspaneel");
    await remote(page).locator(".pull").click();
    await expect(remote(page).getByRole("dialog")).toHaveAccessibleName("Favorieten");
    await remote(page).getByRole("tab", { name: "Macro's" }).click();
    await expect(remote(page).getByRole("dialog")).toHaveAccessibleName("Macro's");
    await remote(page).getByRole("button", { name: "Sluiten", exact: true }).click();
    await page.evaluate(() => {
      window.__sidebarHarness.remote().runtime = {
        kind: "operation_running", operation: "future_operation", label: "Backend label in English",
      };
    });
    await expect(remote(page).locator(".activity .eyebrow")).toHaveText("Bezig…");
  });

  test("a panel bundle failure explains that the Control Panel could not load", async ({ page }) => {
    await open(page, "lang=nl");
    await page.route("**/tools-card.js*", (route) => route.abort());
    await panel(page).locator(".tab.panel").click();
    await expect(panel(page).locator(".content > .empty")).toHaveText("Het bedieningspaneel kon niet worden geladen. Laad de pagina opnieuw om het nogmaals te proberen.");
    await expect(remote(page)).toBeVisible();
  });

  test("opens on the remote tab, shows the admin tabs, lists hubs in the header menu", async ({ page }) => {
    await open(page);
    await expect(panel(page).locator(".tab.remote")).toHaveClass(/active/);
    await expect(panel(page).locator(".tab.panel")).toBeVisible();
    // Phone + three hubs: the labelled strip does not fit, the tabs fall back to icons.
    await expect(panel(page).locator(".tabs")).toHaveClass(/compact/);
    await expect(panel(page).locator(".tab.remote .label")).toBeHidden();
    await expect(panel(page).locator(".hub .name")).toHaveText("Souterrain");
    await panel(page).locator(".hub").click();
    const items = panel(page).locator(".menu .mi");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveClass(/current/);
    await expect(items.nth(2).locator(".dot")).toHaveClass(/down/);
    await items.nth(1).click();
    await expect(panel(page).locator(".hub .name")).toHaveText("Living room");
    await expect(remote(page)).toHaveJSProperty("entityId", "remote.living_room");
  });

  test("the hub menu stays on top of the remote when the theme blurs the header", async ({ page }) => {
    await open(page, "header_blur=1");
    await panel(page).locator(".hub").click();
    const item = panel(page).locator(".menu .mi").nth(1);
    await expect(item).toBeVisible();
    // A real pointer click on the item (not a programmatic one) must reach it.
    await item.click();
    await expect(panel(page).locator(".hub .name")).toHaveText("Living room");
  });

  test("a non-admin gets a plain icon + label, no tabs", async ({ page }) => {
    await open(page, "admin=0");
    await expect(panel(page).locator(".tab")).toHaveCount(0);
    await expect(panel(page).locator(".title .label")).toHaveText("Virtual Remote");
    await expect(panel(page).locator(".tabs")).not.toHaveClass(/compact/);
    await expect(remote(page)).toBeVisible();
  });

  test("a wide header shows the tab labels; a single hub hides the hub picker", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await open(page);
    await expect(panel(page).locator(".tabs")).not.toHaveClass(/compact/);
    await expect(panel(page).locator(".tab.remote .label")).toHaveText("Virtual Remote");
    await expect(panel(page).locator(".tab.panel .label")).toHaveText("Control Panel");
    await expect(panel(page).locator(".hub")).toHaveCount(1);
    await open(page, "hubs=1");
    await expect(panel(page).locator(".hub")).toHaveCount(0);
    await expect(remote(page)).toHaveJSProperty("entityId", "remote.souterrain");
  });

  for (const [name, query] of [["menu button", ""], ["back arrow", "path=/control-panel"], ["single hub", "hubs=1"]]) {
    test(`the tab labels settle at every width (${name}), no flicker in the band where they drop`, async ({ page }) => {
      // The strip's share of the row and the labelled probe must both be the same width in
      // either mode; when one of them was not, the labels flickered endlessly in a 16px band.
      await page.setViewportSize({ width: 640, height: 800 });
      await page.goto(`${HARNESS}${query ? `?${query}` : ""}`);
      // `.toolbar .tabs`: the control panel subview has a tab strip of its own inside.
      await expect(panel(page).locator(".toolbar .tabs")).not.toHaveClass(/compact/);
      await page.evaluate(() => {
        const tabs = document.querySelector("sofabaton-x-panel").shadowRoot.querySelector(".toolbar .tabs");
        window.__compactFlips = 0;
        let last = tabs.classList.contains("compact");
        new MutationObserver(() => {
          const now = tabs.classList.contains("compact");
          if (now !== last) { window.__compactFlips += 1; last = now; }
        }).observe(tabs, { attributes: true, attributeFilter: ["class"] });
      });
      let dropped = false;
      for (let width = 640; width >= 340; width -= 6) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(100);
        const flips = await page.evaluate(() => { const n = window.__compactFlips; window.__compactFlips = 0; return n; });
        expect(flips, `compact flips at ${width}px`).toBeLessThanOrEqual(1);
        if (flips === 1) dropped = true;
      }
      expect(dropped).toBe(true);
      await expect(panel(page).locator(".toolbar .tabs")).toHaveClass(/compact/);
    });
  }

  test("X1S: unbound keys are ghosts, the rocker with every segment unbound fades as one", async ({ page }) => {
    await open(page);
    const r = remote(page);
    for (const id of [181, 183, 186, 193]) {
      await expect(r.locator(`[data-key="${id}"]`)).toHaveClass(/off/);
      await expect(r.locator(`[data-key="${id}"]`)).toHaveAttribute("aria-disabled", "true");
    }
    await expect(r.locator(".pill.ch")).toHaveClass(/off/);
    await expect(r.locator(".pill.vol")).not.toHaveClass(/off/);
    await expect(r.locator(".numtoggle")).toHaveCount(0);
    await expect(r.locator(".orbit")).toHaveCount(0);
    await expect(r.locator(".orbit.abc")).toHaveCount(0);
    await expect(r.locator(".media .pill.single [data-key='188']")).toHaveCount(1);
  });

  test("X2: pause, DVR/EXIT, A/B/C and the number pad flip", async ({ page }) => {
    await open(page, "hub=x2");
    const r = remote(page);
    await expect(r.locator(".media .pill [data-key='156']")).toHaveCount(1);
    await expect(r.locator(".media .pill [data-key='188']")).toHaveCount(1);
    await expect(r.locator(".orbit.dvr")).toHaveCount(1);
    await expect(r.locator(".orbit.exit")).toHaveCount(1);
    await expect(r.locator(".orbit.abc")).toHaveCount(3);
    await expect(r.locator("[data-key='157']")).toHaveCount(1);
    await r.locator(".numtoggle").click();
    await expect(r.locator(".wheel")).toHaveClass(/flipped/);
    await expect(r.locator(".numpad [data-key]")).toHaveCount(12);
    await expect(r.locator(".numpad [data-key='160']")).toHaveClass(/off/);
    await expect(r.locator(".numtoggle")).toBeHidden();
    await r.locator(".rockers").click({ position: { x: 5, y: 5 } });
    await expect(r.locator(".wheel")).not.toHaveClass(/flipped/);
  });

  test("re-attached (HA parks a background panel): one send per tap, and the layout still follows the size", async ({ page }) => {
    await open(page, "switch_ms=200");
    const r = remote(page);
    // HA detaches the panel element after a while in a background tab and
    // puts the same element back on return.
    await page.evaluate(() => {
      const element = window.__sidebarHarness.panel();
      const parent = element.parentNode;
      const next = element.nextSibling;
      element.remove();
      parent.insertBefore(element, next);
    });
    const calls = () => page.evaluate(() => window.__sidebarHarness.serviceCalls.map((c) => c.data));
    await r.locator("[data-key='176']").click();
    await expect.poll(calls).toEqual([{ entity_id: "remote.souterrain", command: 176, device: 101 }]);
    await page.waitForTimeout(300);
    expect(await calls()).toHaveLength(1);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(r.locator(".app")).toHaveClass(/landscape/);
  });

  test("a tap sends the key in the activity's scope; a held arrow repeats; a bound long-press fires its pair", async ({ page }) => {
    await open(page, "switch_ms=200");
    const r = remote(page);
    const calls = () => page.evaluate(() => window.__sidebarHarness.serviceCalls.map((c) => c.data));
    await r.locator("[data-key='176']").click();
    await expect.poll(calls).toEqual([{ entity_id: "remote.souterrain", command: 176, device: 101 }]);
    // Hold right for ~1s: the first repeat lands at 400ms, then every 250ms.
    // The arrow keys are quadrants of the disc: aim at the chevron, not the box centre (that is OK).
    const right = r.locator("[data-key='177'] ha-icon");
    const box = await right.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    const after = await calls();
    const repeats = after.filter((c) => c.command === 177).length;
    expect(repeats).toBeGreaterThanOrEqual(2);
    expect(repeats).toBeLessThanOrEqual(4);
    // Volume up carries a long-press binding on activity 101: holding sends the pair once, no repeat, no tap.
    const volup = r.locator("[data-key='182']");
    const vbox = await volup.boundingBox();
    await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    const pair = (await calls()).filter((c) => c.device === 2);
    expect(pair).toEqual([{ entity_id: "remote.souterrain", command: 22, device: 2 }]);
    expect((await calls()).filter((c) => c.command === 182)).toEqual([]);
  });

  // The tilt lighting (a gradient on the wheel disc / the rocker pill) fades out after
  // release. Its angle must stay on the pressed edge for the whole fade: clearing it with
  // the tilt attribute snapped the light to the default edge mid-fade and read as a flash.
  const LIGHT_CASES = [
    { name: "wheel", press: ".dir.up ha-icon", host: ".wheel", layer: ".disc" },
    { name: "wheel", press: ".dir.left ha-icon", host: ".wheel", layer: ".disc" },
    { name: "wheel", press: ".dir.right ha-icon", host: ".wheel", layer: ".disc" },
    { name: "wheel", press: ".dir.down ha-icon", host: ".wheel", layer: ".disc" },
    { name: "volume rocker", press: ".pill.vol .seg:first-child", host: ".pill.vol", layer: null },
    { name: "volume rocker", press: ".pill.vol .seg:last-child", host: ".pill.vol", layer: null },
  ];
  for (const c of LIGHT_CASES) {
    test(`${c.name} lighting keeps its direction while it fades after release (${c.press})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await open(page, "hub=x2");
      const r = remote(page);
      const host = r.locator(c.host);
      await r.locator(c.press).hover();
      await page.mouse.down();
      await expect(host).toHaveAttribute("data-tilt", /left|right|up|down/);
      const heldState = await host.evaluate((el, layer) => {
        for (const a of el.getAnimations({ subtree: true })) a.finish();
        const target = layer ? el.querySelector(layer) : el;
        const style = getComputedStyle(target, "::before");
        return { paint: style.backgroundImage, opacity: Number(style.opacity) };
      }, c.layer);
      expect(heldState.paint).not.toBe("none");
      expect(heldState.opacity).toBe(1);
      await page.mouse.up();
      await expect(host).not.toHaveAttribute("data-tilt");
      const fading = await host.evaluate((el, layer) => {
        for (const a of el.getAnimations({ subtree: true })) {
          a.pause();
          a.currentTime = Number(a.effect.getTiming().duration) / 2;
        }
        const target = layer ? el.querySelector(layer) : el;
        const style = getComputedStyle(target, "::before");
        return { paint: style.backgroundImage, opacity: Number(style.opacity) };
      }, c.layer);
      expect(fading.opacity).toBeGreaterThan(0);
      expect(fading.opacity).toBeLessThan(1);
      expect(fading.paint, "the fading light must not swing to another edge").toBe(heldState.paint);
      await host.evaluate((el) => {
        for (const a of el.getAnimations({ subtree: true })) a.finish();
      });
      await expect(host).toHaveCSS("transform", "none");
      const rested = await host.evaluate((el, layer) => {
        const target = layer ? el.querySelector(layer) : el;
        return getComputedStyle(target, "::before").opacity;
      }, c.layer);
      expect(rested).toBe("0");
    });
  }

  test("drawer items sink on press and ring above the sheet from the tap point; a drifted release sends nothing", async ({ page }) => {
    await open(page);
    const r = remote(page);
    const calls = () => page.evaluate(() => window.__sidebarHarness.serviceCalls.length);
    await r.locator(".pull").click();
    await expect(r.locator(".app")).toHaveClass(/open/);
    const tile = r.locator(".tile").first();
    // hover() waits for the sheet's slide-in to settle before the raw mouse.down below.
    await tile.hover();
    const box = await tile.boundingBox();
    // Press near the tile's right end: the ring must start there, a key's size, not from the whole tile.
    const x = box.x + box.width - 20;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(tile).toHaveClass(/pressed/);
    await page.mouse.up();
    await expect(tile).not.toHaveClass(/pressed/);
    const ring = await r.locator(".ring").first().evaluate((el) => {
      const b = el.getBoundingClientRect();
      const sheet = el.parentElement.querySelector(".sheet");
      return { z: Number(getComputedStyle(el).zIndex), sheetZ: Number(getComputedStyle(sheet).zIndex), w: el.offsetWidth, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    });
    expect(ring.z).toBeGreaterThan(ring.sheetZ);
    expect(ring.w).toBe(92);
    expect(Math.abs(ring.cx - x)).toBeLessThanOrEqual(2);
    expect(Math.abs(ring.cy - y)).toBeLessThanOrEqual(2);
    await expect.poll(calls).toBe(1);
    // A press that leaves the tile before release sinks and un-sinks without sending.
    await page.mouse.move(box.x + 10, y);
    await page.mouse.down();
    await expect(tile).toHaveClass(/pressed/);
    await page.mouse.move(box.x + 10, box.y + box.height + 60);
    await expect(tile).not.toHaveClass(/pressed/);
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect(await calls()).toBe(1);
    // The activity rows sink too.
    await r.locator(".close").click();
    await r.locator(".activity .text").click();
    const row = r.locator(".row", { hasText: "Watch TV" });
    await row.hover();
    const rb = await row.boundingBox();
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await expect(row).toHaveClass(/pressed/);
    // The release is the pick: the sheet closes and the rows go with it.
    await page.mouse.up();
    await expect(r.locator(".app")).not.toHaveClass(/open/);
    await expect(r.locator(".activity .eyebrow")).toContainText("Starting");
  });

  test("the activity picker starts an activity and the remote veils until the hub reports it", async ({ page }) => {
    await open(page, "switch_ms=700");
    const r = remote(page);
    await r.locator(".activity .text").click();
    await expect(r.locator(".segs .s.active")).toHaveText("Activities");
    await r.locator(".row", { hasText: "Watch TV" }).click();
    await expect(r.locator(".app")).toHaveClass(/busy/);
    await expect(r.locator(".activity .eyebrow")).toContainText("Starting");
    await expect(r.locator("[data-key='176']")).not.toBeEnabled({ timeout: 100 }).catch(() => {});
    await expect(r.locator(".app")).not.toHaveClass(/busy/, { timeout: 3000 });
    await expect(r.locator(".activity .name span").first()).toHaveText("Watch TV");
    // All off is the power disc beside the selector, not a row in the sheet.
    await expect(r.locator(".phead")).toHaveCount(0);
    await expect(r.locator(".power")).toHaveAttribute("aria-label", "All off");
    await r.locator(".power").click();
    await expect(r.locator(".app")).toHaveClass(/busy/);
    await expect(r.locator(".app")).not.toHaveClass(/busy/, { timeout: 3000 });
    await expect(r.locator(".activity .name span").first()).toHaveText("Powered Off");
    await expect(r.locator(".power")).toHaveCount(0);
  });

  test("device mode: pick a device, its commands sheet, the power key", async ({ page }) => {
    await open(page);
    const r = remote(page);
    await r.locator(".mode").click();
    await r.locator(".pull").click();
    await expect(r.locator(".segs .s.active")).toHaveText("Devices");
    await r.locator(".row", { hasText: "Television" }).click();
    await expect(r.locator(".activity .name span").first()).toHaveText("Television");
    await expect(r.locator(".power")).toBeVisible();
    await r.locator(".pull").click();
    await expect(r.locator(".phead .eyebrow")).toHaveText("Television");
    await expect(r.locator(".lrow")).toHaveCount(4);
    await r.locator(".filter input").fill("sleep");
    await expect(r.locator(".lrow")).toHaveCount(1);
    await r.locator(".lrow").click();
    const calls = await page.evaluate(() => window.__sidebarHarness.serviceCalls.map((c) => c.data));
    expect(calls).toEqual([{ entity_id: "remote.souterrain", command: 13, device: 1 }]);
    // The view is remembered per hub: reopening lands on that device again.
    await open(page);
    await expect(remote(page).locator(".activity .name span").first()).toHaveText("Television");
    await expect(remote(page).locator(".power")).toBeVisible();
    // ... and back to activities once the user flips the mode.
    await remote(page).locator(".mode").click();
    await open(page);
    await expect(remote(page).locator(".activity .eyebrow")).toContainText("Activity");
    await expect(remote(page).locator(".activity .name span").first()).toHaveText("Watch a movie");
  });

  test("the selector sheet is an Activities | Devices picker; a pick from the other tab switches the mode", async ({ page }) => {
    await open(page);
    const r = remote(page);
    // Activity mode: both tabs, Activities selected, the running activity marked.
    await r.locator(".activity .text").click();
    const tabs = r.locator(".segs [role='tab']");
    await expect(tabs).toHaveText(["Activities", "Devices"]);
    await expect(tabs.nth(0)).toHaveClass(/active/);
    await expect(r.locator(".row.current")).toHaveText(/Watch a movie/);
    // The Devices tab lists the devices (none marked yet); picking one puts the remote in device mode.
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(r.locator(".row.current")).toHaveCount(0);
    await r.locator(".row", { hasText: "Television" }).click();
    await expect(r.locator(".app")).not.toHaveClass(/open/);
    await expect(r.locator(".app")).toHaveAttribute("data-mode", "device");
    await expect(r.locator(".activity .name span").first()).toHaveText("Television");
    // Device mode: the selector opens on the Devices tab with that device marked.
    await r.locator(".activity .text").click();
    await expect(r.locator(".segs [role='tab']").nth(1)).toHaveClass(/active/);
    await expect(r.locator(".row.current")).toHaveText(/Television/);
    // Picking an activity from the first tab brings the remote back to activity mode.
    await r.locator(".segs [role='tab']").nth(0).click();
    await r.locator(".row", { hasText: "Watch TV" }).click();
    await expect(r.locator(".app")).toHaveAttribute("data-mode", "activity");
    await expect(r.locator(".activity .eyebrow")).toContainText("Starting");
    // The pull handle still opens Favorites | Macros in activity mode.
    await expect(r.locator(".app")).not.toHaveClass(/busy/, { timeout: 3000 });
    await r.locator(".pull").click();
    await expect(r.locator(".segs [role='tab']")).toHaveText(["Favorites", "Macros"]);
  });

  test("a long-running integration operation veils the remote with its label", async ({ page }) => {
    await open(page, "runtime=operation");
    const r = remote(page);
    await expect(r.locator(".app")).toHaveClass(/inert/);
    await expect(r.locator(".activity .eyebrow")).toContainText("Refreshing hub cache");
    await expect(panel(page).locator(".hub .dot")).toHaveClass(/busy/);
  });

  test("the Control Panel tab swaps in the control panel and the Virtual Remote tab brings the remote back", async ({ page }) => {
    await open(page);
    await panel(page).locator(".tab.panel").click();
    await expect(panel(page).locator("sofabaton-control-panel")).toHaveCount(1, { timeout: 15000 });
    await expect(panel(page).locator(".tab.panel")).toHaveClass(/active/);
    await expect(panel(page).locator(".tab.remote")).not.toHaveClass(/active/);
    await panel(page).locator(".tab.remote").click();
    await expect(remote(page)).toBeVisible();
    await expect(panel(page).locator(".tab.remote")).toHaveClass(/active/);
  });

  test.describe("subview paths", () => {
    test("/control-panel opens that tab with a back arrow in place of the menu button", async ({ page }) => {
      // Not open(): that waits for the remote's keys, and this path never shows the remote.
      await page.goto(`${HARNESS}?path=/control-panel`);
      await expect(panel(page).locator("sofabaton-control-panel")).toHaveCount(1, { timeout: 15000 });
      await expect(panel(page).locator(".tab.panel")).toHaveClass(/active/);
      await expect(panel(page).locator(".back")).toBeVisible();
      await expect(panel(page).locator("ha-menu-button")).toHaveCount(0);
      // Switching tabs inside the subview moves the URL to the other tab's path.
      // HA arrived here with a `from` entry: the switch keeps it, and back is one history step.
      await page.evaluate(() => window.history.replaceState({ from: "/lovelace/0" }, "", window.location.href));
      await panel(page).locator(".tab.remote").click();
      await expect(remote(page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/sofabaton-x/virtual-remote");
      expect(await page.evaluate(() => window.history.state)).toEqual({ from: "/lovelace/0" });
    });

    test("the back arrow at a root entry (fresh tab, deep link) replaces it with the default dashboard", async ({ page }) => {
      await open(page, "path=/virtual-remote");
      await page.evaluate(() => {
        window.history.replaceState({ root: true }, "", window.location.href);
        window.__nav = [];
        window.addEventListener("location-changed", (ev) => window.__nav.push({ path: window.location.pathname, detail: ev.detail }));
      });
      await panel(page).locator(".back").click();
      expect(await page.evaluate(() => window.__nav)).toEqual([{ path: "/", detail: { replace: true } }]);
      expect(await page.evaluate(() => window.history.state)).toEqual({ root: true });
    });

    test("/control-panel for a non-admin: the remote, and the panel bundle is never fetched", async ({ page }) => {
      const bundles = [];
      page.on("request", (request) => { if (request.url().includes("tools-card.js")) bundles.push(request.url()); });
      await open(page, "path=/control-panel&admin=0");
      await expect(remote(page)).toBeVisible();
      await expect(panel(page).locator("sofabaton-control-panel")).toHaveCount(0);
      await expect(panel(page).locator(".tab")).toHaveCount(0);
      expect(bundles).toEqual([]);
    });

    test("/virtual-remote for a non-admin: the remote, the back arrow, no tabs", async ({ page }) => {
      await open(page, "path=/virtual-remote&admin=0");
      await expect(remote(page)).toBeVisible();
      await expect(panel(page).locator(".back")).toBeVisible();
      await expect(panel(page).locator(".tab")).toHaveCount(0);
    });

    test("the plain path keeps the menu button and no back arrow", async ({ page }) => {
      await open(page);
      await expect(panel(page).locator("ha-menu-button")).toHaveCount(1);
      await expect(panel(page).locator(".back")).toHaveCount(0);
    });
  });

  test.describe("landscape", () => {
    test("a phone in landscape puts the wheel left of the key rows", async ({ page }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await open(page, "hub=x2");
      const r = remote(page);
      await expect(r.locator(".app")).toHaveClass(/landscape/);
      const wheel = await r.locator(".wheel-area").boundingBox();
      const rockers = await r.locator(".rockers").boundingBox();
      const activity = await r.locator(".activity").boundingBox();
      expect(wheel.x + wheel.width).toBeLessThanOrEqual(rockers.x + 1);
      expect(activity.width).toBeGreaterThan(wheel.width + rockers.width);
      // Every satellite stays inside the viewport.
      for (const sel of [".orbit.a", ".orbit.exit", ".numtoggle"]) {
        const box = await r.locator(sel).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(844);
      }
      await page.waitForTimeout(400);
      await expect(panel(page)).toHaveScreenshot("sidebar-x2-landscape-phone.png");
      // Beside the wheel the sheet opens to the full height of the remote.
      await r.locator(".pull").click();
      await expect(r.locator(".app")).toHaveClass(/open/);
      const app = await r.locator(".app").boundingBox();
      const sheet = await r.locator(".sheet").boundingBox();
      expect(Math.abs(sheet.height - app.height)).toBeLessThanOrEqual(1);
    });

    test("a panel narrower than the viewport (docked HA sidebar) never overflows the split", async ({ page }) => {
      await page.setViewportSize({ width: 1106, height: 560 });
      await open(page, "hub=x1s&width=830");
      const r = remote(page);
      await expect(r.locator(".app")).toHaveClass(/landscape/);
      const app = await r.locator(".app").boundingBox();
      expect(app.width).toBe(830);
      for (const sel of [".rockers", ".colors", ".media", ".wheel-wrap"]) {
        const box = await r.locator(sel).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(app.x);
        expect(box.x + box.width).toBeLessThanOrEqual(app.x + app.width + 0.5);
      }
      const keys = await r.locator(".rockers").boundingBox();
      const wheel = await r.locator(".wheel-wrap").boundingBox();
      const gaps = [wheel.x - app.x, keys.x - (wheel.x + wheel.width), app.x + app.width - (keys.x + keys.width)];
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    });

    test("a wide window stays portrait while the wheel fits, and splits once it would not", async ({ page }) => {
      await page.setViewportSize({ width: 1180, height: 760 });
      await open(page, "theme=dark");
      const r = remote(page);
      await expect(panel(page).locator(".tabs")).not.toHaveClass(/compact/);
      // Tall enough: the portrait column keeps a large wheel, so no split.
      await expect(r.locator(".app")).not.toHaveClass(/landscape/);
      const tall = await r.locator(".wheel-wrap").boundingBox();
      expect(tall.width).toBeGreaterThanOrEqual(240);
      await page.waitForTimeout(400);
      await expect(panel(page)).toHaveScreenshot("sidebar-x1s-landscape-wide.png");
      // Shorter: the portrait wheel would drop under the floor, the split kicks in.
      await page.setViewportSize({ width: 1180, height: 560 });
      await expect(r.locator(".app")).toHaveClass(/landscape/);
      await page.setViewportSize({ width: 1180, height: 760 });
      await expect(r.locator(".app")).not.toHaveClass(/landscape/);
      // Dragging the window through the threshold must never hang the page
      // (a layout flip that re-measured itself used to spin without yielding).
      for (let h = 640; h >= 540; h -= 4) {
        await page.setViewportSize({ width: 1180, height: h });
        await expect(page.evaluate(() => document.readyState)).resolves.toBe("complete");
      }
      for (let h = 540; h <= 640; h += 4) {
        await page.setViewportSize({ width: 1180, height: h });
        await expect(page.evaluate(() => 1)).resolves.toBe(1);
      }
      await expect(r.locator(".app")).not.toHaveClass(/landscape/);
    });
  });

  test.describe("baselines", () => {
    for (const [name, query] of [
      ["sidebar-x1s-light", ""],
      ["sidebar-x2-dark", "hub=x2&theme=dark"],
      ["sidebar-x1s-off", "scenario=off"],
    ]) {
      test(`captures ${name}`, async ({ page }) => {
        await open(page, query);
        await page.waitForTimeout(400);
        await expect(panel(page)).toHaveScreenshot(`${name}.png`);
      });
    }
  });
});

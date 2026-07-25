import test from "node:test";
import assert from "node:assert/strict";
import {
  RemoteCardStore,
  normalizeRemoteCardConfig,
} from "../../custom_components/sofabaton_x1s/www/src/state/remote-card-store";
import type { HassLike, RemoteCardConfig } from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";

const ENTITY = "remote.living_room";

// The store touches the window preview-activity cache (guarded on typeof
// window), so give Node a minimal one.
if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
  (globalThis as Record<string, unknown>).window = { dispatchEvent: () => true };
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

function createHass(options: {
  platform?: string;
  state?: Record<string, unknown> | null;
  calls?: ServiceCall[];
} = {}): HassLike {
  const platform = options.platform ?? "sofabaton_x1s";
  const calls = options.calls ?? [];
  return {
    states: options.state ? { [ENTITY]: options.state as never } : {},
    async callWS<T>(message: Record<string, unknown>) {
      if (String(message.type) === "config/entity_registry/get") {
        return { platform } as T;
      }
      return { ok: true } as T;
    },
    async callService(domain: string, service: string, data?: Record<string, unknown>) {
      calls.push({ domain, service, data: data ?? {} });
      return undefined;
    },
  };
}

function activeState(overrides: Record<string, unknown> = {}) {
  return {
    state: "on",
    attributes: {
      hub_version: "X1S",
      current_activity: "Watch a movie",
      current_activity_id: 101,
      load_state: "idle",
      activities: [
        { id: 101, name: "Watch a movie", state: "on" },
        { id: 102, name: "Play Xbox", state: "off" },
      ],
      assigned_keys: { 101: [151, 152, 174] },
      macro_keys: { 101: [{ command_id: 501, name: "Movie Night", device_id: 101 }] },
      favorite_keys: { 101: [{ command_id: 601, name: "Netflix", device_id: 3 }] },
      ...(overrides.attributes as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

function createStore(hass?: HassLike, config: Partial<RemoteCardConfig> = {}) {
  let changes = 0;
  const fired: Array<{ type: string; detail: unknown }> = [];
  const store = new RemoteCardStore(
    () => {
      changes += 1;
    },
    { fireEvent: (type, detail) => fired.push({ type, detail }) },
  );
  store.setConfig({ entity: ENTITY, ...config } as RemoteCardConfig);
  if (hass) store.setHass(hass);
  return { store, fired, changeCount: () => changes };
}

// ---------- config normalization ----------

test("config normalization fills legacy defaults and keeps user keys", () => {
  const normalized = normalizeRemoteCardConfig({ entity: ENTITY } as RemoteCardConfig);
  assert.equal(normalized.show_dpad, true);
  assert.equal(normalized.show_automation_assist, false);
  assert.equal(normalized.max_width, 360);
  assert.equal(normalized.shrink, 0);
  assert.deepEqual(normalized.custom_favorites, []);
  assert.equal(normalized.group_order?.[0], "activity");

  // User keys overwrite defaults; unknown keys survive round-trips.
  const custom = normalizeRemoteCardConfig({
    entity: ENTITY,
    show_nav: false,
    max_width: "80%",
    layouts: { "101": { show_mid: false } },
    some_future_key: 42,
  } as RemoteCardConfig);
  assert.equal(custom.show_nav, false);
  assert.equal(custom.max_width, "80%");
  assert.deepEqual(custom.layouts, { "101": { show_mid: false } });
  assert.equal(custom.some_future_key, 42);
});

test("setConfig requires an entity", () => {
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  assert.throws(() => store.setConfig({} as RemoteCardConfig));
});

// ---------- fingerprint gating ----------

test("identical hass states notify only once; attribute changes notify again", async () => {
  const state = activeState();
  const hass = createHass({ state });
  const { store, changeCount } = createStore();
  const before = changeCount();

  store.setHass(hass);
  await flush();
  assert.equal(changeCount(), before + 1);

  // Same content, new object identity: fingerprint suppresses the notify.
  store.setHass(createHass({ state: JSON.parse(JSON.stringify(state)) }));
  await flush();
  assert.equal(changeCount(), before + 1);

  // A real change (activity switch) notifies again.
  const switched = activeState({
    attributes: { current_activity: "Play Xbox", current_activity_id: 102 },
  });
  store.setHass(createHass({ state: switched }));
  await flush();
  assert.equal(changeCount(), before + 2);
});

// ---------- activity / preview state ----------

test("activity helpers resolve current/effective ids and labels", async () => {
  const { store } = createStore(createHass({ state: activeState() }));
  await flush();

  assert.equal(store.currentActivityId(), 101);
  assert.equal(store.currentActivityLabel(), "Watch a movie");
  assert.equal(store.activityNameForId(102), "Play Xbox");
  assert.equal(store.isActivityOn(101), true);
  assert.equal(store.isActivityOn(102), false);
  assert.equal(store.effectiveActivityId(), 101);
});

test("edit-mode preview selection drives the effective activity", async () => {
  const { store } = createStore(createHass({ state: activeState() }));
  await flush();
  store.setEditMode(true);
  store.setPreviewActivity("102");

  const derived = store.deriveRuntimeState();
  assert.equal(derived.activityId, 102);
  assert.equal(store.effectiveActivityId(), 102);

  // powered_off preview
  store.setPreviewActivity("powered_off");
  const off = store.deriveRuntimeState();
  assert.equal(off.activityId, null);
  assert.equal(off.isPoweredOff, true);
});

// ---------- runtime derivation ----------

test("deriveRuntimeState parses enabled buttons from the active assigned keys", async () => {
  const { store } = createStore(createHass({ state: activeState() }));
  await flush();

  const derived = store.deriveRuntimeState();
  assert.equal(derived.isUnavailable, false);
  assert.deepEqual(
    store.enabledButtons().map((entry) => entry.command),
    [151, 152, 174],
  );
  assert.equal(store.isEnabled(151), true);
  assert.equal(store.isEnabled(199), false);
  assert.equal(derived.selectState?.options.includes("Play Xbox"), true);
  assert.equal(derived.isPoweredOff, false);
  assert.equal(derived.macros.length, 1);
  assert.equal(derived.favorites.length, 1);
});

test("deriveRuntimeState fails open when assigned keys are absent", async () => {
  const state = activeState();
  (state.attributes as Record<string, unknown>).assigned_keys = {};
  const { store } = createStore(createHass({ state }));
  await flush();

  store.deriveRuntimeState();
  assert.equal(store.isEnabled(151), true); // fail-open
});

test("no-activities warning appears only while available and not loading", async () => {
  // Unavailable: no warning (the select is simply disabled).
  const unavailable = createStore(createHass({ state: { state: "unavailable", attributes: {} } }));
  await flush();
  const derivedUnavailable = unavailable.store.deriveRuntimeState();
  assert.equal(derivedUnavailable.isUnavailable, true);
  assert.equal(derivedUnavailable.noActivitiesMessage, "");

  // Available with zero activities and not loading: warn.
  const empty = createStore(
    createHass({ state: { state: "on", attributes: { activities: [], load_state: "idle" } } }),
  );
  await flush();
  const derivedEmpty = empty.store.deriveRuntimeState();
  assert.notEqual(derivedEmpty.noActivitiesMessage, "");
});

// ---------- actions ----------

test("sendCommand uses the x1s payload with the resolved device id", async () => {
  const calls: ServiceCall[] = [];
  const { store } = createStore(createHass({ state: activeState(), calls }));
  await flush();
  store.deriveRuntimeState(); // prime enabled-buttons cache

  await store.sendCommand(151);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].domain, "remote");
  assert.equal(calls[0].service, "send_command");
  assert.equal(calls[0].data.entity_id, ENTITY);
  assert.equal(calls[0].data.device, 101);
});

test("edit mode blocks command sends and activity switches", async () => {
  const calls: ServiceCall[] = [];
  const { store } = createStore(createHass({ state: activeState(), calls }));
  await flush();
  store.setEditMode(true);

  await store.sendCommand(151);
  await store.setActivity("Play Xbox");
  assert.equal(calls.length, 0);
});

test("setActivity switches and powers off via the x1s services", async () => {
  const calls: ServiceCall[] = [];
  const { store } = createStore(createHass({ state: activeState(), calls }));
  await flush();

  // Selecting the current activity is a no-op.
  await store.setActivity("Watch a movie");
  assert.equal(calls.length, 0);

  await store.setActivity("Play Xbox");
  assert.deepEqual(calls[0], {
    domain: "remote",
    service: "turn_on",
    data: { entity_id: ENTITY, activity: "Play Xbox" },
  });
  assert.equal(store.isLoadingActive(), true);

  await store.setActivity("Powered Off");
  assert.equal(calls[1].service, "turn_off");
  store.disconnected();
});

test("hub integration routes drawer items through typed send_command lists", async () => {
  const calls: ServiceCall[] = [];
  const state = activeState({ attributes: { hub_version: "X2" } });
  const { store } = createStore(createHass({ platform: "sofabaton_hub", state, calls }));
  await flush(); // integration probe resolves -> hub mode

  assert.equal(store.isHubIntegration(), true);
  assert.equal(store.isX2(), true);

  await store.sendDrawerItem("macros", 501, 101, null);
  const macroList = calls[calls.length - 1].data.command as string[];
  assert.equal(macroList.some((part) => part.includes("send_macro_key")), true);
  assert.equal(macroList.some((part) => part.includes("activity_id:101")), true);

  await store.sendDrawerItem("favorites", 601, 101, { device_id: 3 });
  const favList = calls[calls.length - 1].data.command as string[];
  assert.equal(favList.some((part) => part.includes("send_favorite_key")), true);
  assert.equal(favList.some((part) => part.includes("device_id:3")), true);
});

test("lovelace actions: perform-action, toggle, more-info, none", async () => {
  const calls: ServiceCall[] = [];
  const { store, fired } = createStore(createHass({ state: activeState(), calls }));
  await flush();

  await store.runLovelaceAction({
    action: "perform-action",
    perform_action: "scene.turn_on",
    target: { entity_id: "scene.movie" },
  });
  assert.deepEqual(calls[0], { domain: "scene", service: "turn_on", data: {} });

  await store.runLovelaceAction({ action: "toggle", entity_id: "light.tv" });
  assert.equal(calls[1].domain, "homeassistant");
  assert.equal(calls[1].data.entity_id, "light.tv");

  await store.runLovelaceAction({ action: "more-info", entity_id: "remote.living_room" });
  assert.deepEqual(fired[0], {
    type: "hass-more-info",
    detail: { entityId: "remote.living_room" },
  });

  await store.runLovelaceAction({ action: "none" });
  await store.runLovelaceAction({ action: "unsupported-whatever" });
  assert.equal(calls.length, 2);
});

test("load indicator: command pulse and activity loading windows", async () => {
  let changes = 0;
  const pulseStates: boolean[] = [];
  const store = new RemoteCardStore(
    () => {
      changes += 1;
    },
    {
      fireEvent: () => undefined,
      onCommandPulseChange: (active) => pulseStates.push(active),
    },
  );
  store.setConfig({ entity: ENTITY } as RemoteCardConfig);
  store.setHass(createHass({ state: activeState() }));
  await flush();

  assert.equal(store.isLoadingActive(), false);
  const beforePulse = changes;
  store.triggerCommandPulse();
  assert.equal(store.isLoadingActive(), true);
  assert.equal(changes, beforePulse, "a command pulse must not request a whole-card render");
  assert.deepEqual(pulseStates, [true]);

  store.startActivityLoading("Play Xbox");
  assert.equal(store.isLoadingActive(), true);
  store.stopActivityLoading();

  store.disconnected(); // clears timers so the test process exits promptly
});

test("deriveRuntimeState settles activity loading once the target is reached", async () => {
  const { store } = createStore(createHass({ state: activeState() }));
  await flush();

  store.startActivityLoading("Watch a movie"); // already the current activity
  store.deriveRuntimeState();
  assert.equal(store.isLoadingActive(), false);
  store.disconnected();
});

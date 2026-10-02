// The remote card's backend port (docs/internal/web-remote-plan.md, R2):
// the HA adapter reproduces the pre-port hass calls byte for byte, and the
// store drives any RemoteBackend through the same seam. The server adapter
// (R3) is written against exactly these expectations.

import assert from "node:assert/strict";
import test from "node:test";

import { HaRemoteBackend } from "../../remote-card/src/backend/ha-backend";
import type { HassLike } from "../../remote-card/src/backend/hass-types";
import type {
  RemoteBackend,
  RemoteSnapshot,
} from "../../remote-card/src/backend/remote-backend";
import { RemoteCardStore } from "../../remote-card/src/state/remote-card-store";

const ENTITY = "remote.living_room";

interface Call {
  kind: "ws" | "service";
  payload: unknown;
}

function createHass(options: {
  state?: RemoteSnapshot;
  platform?: string;
  keymap?: unknown;
  powerState?: unknown;
  powerThrows?: boolean;
  withoutCallService?: boolean;
}): { hass: HassLike; calls: Call[] } {
  const calls: Call[] = [];
  const hass: HassLike = {
    states: options.state ? { [ENTITY]: options.state as never } : {},
    async callWS<T>(message: Record<string, unknown>) {
      calls.push({ kind: "ws", payload: message });
      switch (message.type) {
        case "config/entity_registry/get":
          return { platform: options.platform } as T;
        case "sofabaton_x1s/device/keymap":
          return { keymap: options.keymap ?? null } as T;
        case "sofabaton_x1s/device/power_state":
          if (options.powerThrows) throw new Error("boom");
          return { power_state: options.powerState } as T;
        default:
          throw new Error(`unexpected ws ${String(message.type)}`);
      }
    },
  };
  if (!options.withoutCallService) {
    hass.callService = async (domain, service, data, target) => {
      calls.push({ kind: "service", payload: { domain, service, data, target } });
    };
  }
  return { hass, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("HA adapter: snapshot is the configured entity's state", () => {
  const state: RemoteSnapshot = { state: "on", attributes: { activities: [] } };
  const { hass } = createHass({ state });
  const backend = new HaRemoteBackend();
  backend.setHass(hass);
  assert.equal(backend.snapshot(), undefined, "no target yet");
  backend.setTarget(ENTITY);
  assert.equal(backend.snapshot(), state);
  assert.equal(backend.kind, "ha");
  assert.equal(backend.hass, hass);
});

test("HA adapter: probeIntegration maps the entity registry platform", async () => {
  for (const [platform, expected] of [
    ["sofabaton_x1s", "x1s"],
    ["sofabaton_hub", "hub"],
    ["broadlink", "unknown"],
    ["", "unknown"],
  ] as const) {
    const { hass, calls } = createHass({ platform });
    const backend = new HaRemoteBackend();
    backend.setHass(hass);
    backend.setTarget(ENTITY);
    assert.equal(await backend.probeIntegration(), expected, platform);
    assert.deepEqual(calls[0]?.payload, {
      type: "config/entity_registry/get",
      entity_id: ENTITY,
    });
  }
});

test("HA adapter: probeIntegration rejects without callWS or target", async () => {
  const backend = new HaRemoteBackend();
  backend.setTarget(ENTITY);
  await assert.rejects(() => backend.probeIntegration());
  const { hass } = createHass({ platform: "sofabaton_x1s" });
  backend.setHass(hass);
  backend.setTarget("");
  await assert.rejects(() => backend.probeIntegration());
});

test("HA adapter: sendCommand keeps the remote.send_command payload shape", async () => {
  const { hass, calls } = createHass({});
  const backend = new HaRemoteBackend();
  backend.setHass(hass);
  backend.setTarget(ENTITY);
  await backend.sendCommand(151, 8);
  assert.deepEqual(calls, [
    {
      kind: "service",
      payload: {
        domain: "remote",
        service: "send_command",
        data: { entity_id: ENTITY, command: 151, device: 8 },
        target: undefined,
      },
    },
  ]);
  // Non-numeric ids never reach the service (legacy remoteSendCommandData);
  // a null scope coerces to device 0 exactly as it always did.
  await backend.sendCommand("x", 8);
  assert.equal(calls.length, 1);
  await backend.sendCommand(151, null);
  assert.deepEqual((calls[1]?.payload as { data: unknown }).data, {
    entity_id: ENTITY,
    command: 151,
    device: 0,
  });
});

test("HA adapter: raw lists, activity start/stop use the legacy services", async () => {
  const { hass, calls } = createHass({});
  const backend = new HaRemoteBackend();
  backend.setHass(hass);
  backend.setTarget(ENTITY);
  await backend.sendRawCommandList(["request_basic_data"]);
  await backend.startActivity({ id: 101, name: "Watch TV" });
  await backend.stopActivity();
  assert.deepEqual(
    calls.map((call) => call.payload),
    [
      {
        domain: "remote",
        service: "send_command",
        data: { entity_id: ENTITY, command: ["request_basic_data"] },
        target: undefined,
      },
      {
        domain: "remote",
        service: "turn_on",
        data: { entity_id: ENTITY, activity: "Watch TV" },
        target: undefined,
      },
      { domain: "remote", service: "turn_off", data: { entity_id: ENTITY }, target: undefined },
    ],
  );
});

test("HA adapter: keymap and power state need the published entry id", async () => {
  const noEntry = createHass({ state: { state: "on", attributes: {} }, keymap: { buttons: [] } });
  const backend = new HaRemoteBackend();
  backend.setHass(noEntry.hass);
  backend.setTarget(ENTITY);
  assert.equal(await backend.deviceKeymap(3), null);
  assert.equal(await backend.devicePowerState(3), null);
  assert.equal(noEntry.calls.length, 0, "no fetch without entry_id");

  const withEntry = createHass({
    state: { state: "on", attributes: { entry_id: "e1" } },
    keymap: { buttons: [151], bindings: [], commands: [] },
    powerState: 1,
  });
  backend.setHass(withEntry.hass);
  assert.deepEqual(await backend.deviceKeymap(3), {
    keymap: { buttons: [151], bindings: [], commands: [] },
  });
  assert.equal(await backend.devicePowerState(3), 1);
  assert.deepEqual(
    withEntry.calls.map((call) => call.payload),
    [
      { type: "sofabaton_x1s/device/keymap", entry_id: "e1", device_id: 3 },
      { type: "sofabaton_x1s/device/power_state", entry_id: "e1", device_id: 3 },
    ],
  );
});

test("HA adapter: power state is strict 0/1 and null on any failure", async () => {
  const backend = new HaRemoteBackend();
  backend.setTarget(ENTITY);
  const state: RemoteSnapshot = { state: "on", attributes: { entry_id: "e1" } };
  for (const [raw, expected] of [
    [0, 0],
    [1, 1],
    [null, null],
    ["1", null],
    [2, null],
  ] as const) {
    backend.setHass(createHass({ state, powerState: raw }).hass);
    assert.equal(await backend.devicePowerState(3), expected, String(raw));
  }
  backend.setHass(createHass({ state, powerThrows: true }).hass);
  assert.equal(await backend.devicePowerState(3), null);
});

test("HA adapter: callService throws like the bare hass object did", async () => {
  const backend = new HaRemoteBackend();
  backend.setHass(createHass({ withoutCallService: true }).hass);
  backend.setTarget(ENTITY);
  await assert.rejects(() => backend.callService("remote", "turn_off"), TypeError);
});

// ---------- the store over an arbitrary backend ----------

interface FakeBackend extends RemoteBackend {
  targets: string[];
  sent: unknown[];
  listeners: Array<() => void>;
  state: RemoteSnapshot | undefined;
}

function createFakeBackend(state: RemoteSnapshot | undefined): FakeBackend {
  const fake: FakeBackend = {
    kind: "server",
    targets: [],
    sent: [],
    listeners: [],
    state,
    setTarget(target) {
      fake.targets.push(target);
    },
    snapshot() {
      return fake.state;
    },
    subscribe(listener) {
      fake.listeners.push(listener);
      return () => {
        fake.listeners = fake.listeners.filter((entry) => entry !== listener);
      };
    },
    async probeIntegration() {
      return "x1s";
    },
    async devicePowerState() {
      return 0;
    },
    async deviceKeymap() {
      return { keymap: { buttons: [151], bindings: [], commands: [], power_configured: true } as never };
    },
    async sendCommand(commandId, scopeId) {
      fake.sent.push({ sendCommand: [commandId, scopeId] });
    },
    async startActivity(activity) {
      fake.sent.push({ startActivity: activity });
    },
    async stopActivity() {
      fake.sent.push({ stopActivity: true });
    },
  };
  return fake;
}

const SNAPSHOT: RemoteSnapshot = {
  state: "on",
  attributes: {
    hub_version: "x1s",
    current_activity: "Watch TV",
    current_activity_id: 101,
    activities: [
      { id: 101, name: "Watch TV", state: "on" },
      { id: 102, name: "Listen", state: "off" },
    ],
    devices: [{ id: 8, name: "TV" }],
    assigned_keys: { "101": [151, 152] },
  },
};

test("store: a non-HA backend is targeted, probed, and read through the port", async () => {
  let changes = 0;
  const store = new RemoteCardStore(() => (changes += 1), { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend(SNAPSHOT);
  store.setBackend(backend);
  await flush();

  assert.deepEqual(backend.targets, [ENTITY]);
  assert.equal(backend.listeners.length, 1);
  assert.equal(store.backend, backend);
  assert.equal(store.hass, null, "no hass behind a non-HA backend");
  assert.equal(store.isHubIntegration(), false);
  assert.equal(store.hubVersion(), "X1S");
  assert.equal(store.currentActivityId(), 101);
  assert.deepEqual(
    store.activities().map((activity) => activity.name),
    ["Watch TV", "Listen"],
  );
  assert.equal(store.deviceModeAvailable(), true);
  assert.ok(changes >= 1);
});

test("store: sends resolve their scope and reach the backend port", async () => {
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend(SNAPSHOT);
  store.setBackend(backend);
  await flush();
  store.deriveRuntimeState();

  await store.sendCommand(151);
  await store.sendCustomFavoriteCommand(200, 8);
  await store.setActivity("Listen");
  await store.setActivity("Powered Off");
  assert.deepEqual(backend.sent, [
    { sendCommand: [151, 101] },
    { sendCommand: [200, 8] },
    { startActivity: { id: 102, name: "Listen" } },
    { stopActivity: true },
  ]);
});

test("store: backend change notifications re-derive, and disconnect unsubscribes", async () => {
  let changes = 0;
  const store = new RemoteCardStore(() => (changes += 1), { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend(SNAPSHOT);
  store.setBackend(backend);
  await flush();
  const before = changes;

  backend.state = {
    ...SNAPSHOT,
    attributes: { ...SNAPSHOT.attributes, current_activity: "Listen", current_activity_id: 102 },
  };
  backend.listeners.forEach((listener) => listener());
  await flush();
  assert.equal(store.currentActivityId(), 102);
  assert.ok(changes > before, "listener triggered onChange");

  store.disconnected();
  assert.equal(backend.listeners.length, 0);
  store.connected();
  assert.equal(backend.listeners.length, 1);
});

test("store: setHass installs the HA adapter and keeps the hass getter", async () => {
  const { hass, calls } = createHass({ state: SNAPSHOT, platform: "sofabaton_x1s" });
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  store.setHass(hass);
  await flush();
  assert.equal(store.hass, hass);
  assert.equal(store.backend?.kind, "ha");
  assert.deepEqual(calls[0]?.payload, { type: "config/entity_registry/get", entity_id: ENTITY });
  await store.sendCommand(151);
  assert.deepEqual(calls.at(-1)?.payload, {
    domain: "remote",
    service: "send_command",
    data: { entity_id: ENTITY, command: 151, device: 101 },
    target: undefined,
  });
});

test("store: a device keymap is refetched when the backend bumps its version, never otherwise", async () => {
  let keymapCalls = 0;
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend({
    ...SNAPSHOT,
    attributes: { ...SNAPSHOT.attributes, keymap_versions: { "8": 1 } },
  });
  backend.deviceKeymap = async () => {
    keymapCalls += 1;
    return { keymap: { buttons: [151], bindings: [], commands: [{ command_id: keymapCalls, name: `v${keymapCalls}` }], power_configured: true } as never };
  };
  store.setBackend(backend);
  await flush();
  store.setMode("device");
  store.setDevice(8);
  await flush();
  assert.equal(keymapCalls, 1);
  assert.equal(store.deviceKeymapState(8)?.commands[0]?.name, "v1");
  store.deriveRuntimeState();
  await flush();
  assert.equal(keymapCalls, 1, "same version: no refetch");

  backend.state = { ...SNAPSHOT, attributes: { ...SNAPSHOT.attributes, keymap_versions: { "8": 2 } } };
  backend.listeners.forEach((listener) => listener());
  await flush();
  store.deriveRuntimeState();
  await flush();
  assert.equal(keymapCalls, 2, "bumped version: refetched");
  assert.equal(store.deviceKeymapState(8)?.commands[0]?.name, "v2");
  assert.equal(store.deviceKeymapState(8)?.status, "ready", "the old keymap stayed on screen during the refetch");
});

test("store: a backend that cannot fetch a keymap yet leaves no spinner behind", async () => {
  let changes = 0;
  const store = new RemoteCardStore(() => (changes += 1), { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend(SNAPSHOT);
  backend.deviceKeymap = async () => null;
  store.setBackend(backend);
  await flush();
  store.setMode("device");
  store.setDevice(8);
  const before = changes;
  await flush();
  assert.equal(store.deviceKeymapState(8), null, "no entry cached");
  assert.ok(changes > before, "the store re-rendered after dropping the loading entry");
});

test("store: a keymap the backend cannot answer is retried with backoff, not in a loop", async () => {
  // CR-F4a-1: the card's onChange re-renders, and render re-derives state,
  // which asks for the keymap again. Without a backoff that is a fetch loop
  // paced only by the HTTP round trip while the hub is busy or offline.
  let calls = 0;
  let store: RemoteCardStore;
  store = new RemoteCardStore(() => { store?.deriveRuntimeState(); }, { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY });
  const backend = createFakeBackend(SNAPSHOT);
  backend.deviceKeymap = async () => { calls += 1; return null; };
  store.setBackend(backend);
  await flush();
  store.setMode("device");
  store.setDevice(8);
  for (let i = 0; i < 20; i += 1) {
    store.deriveRuntimeState();
    await flush();
  }
  assert.equal(calls, 1, "one fetch, then wait for the backoff");
  assert.equal(store.deviceKeymapState(8), null);
  store.disconnected();
});

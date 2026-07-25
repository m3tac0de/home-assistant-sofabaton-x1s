import test from "node:test";
import assert from "node:assert/strict";
import {
  AutomationAssistController,
  automationAssistSlug,
  normalizeHubMac,
  parseMqttPayload,
  type AutomationAssistHost,
} from "../../custom_components/sofabaton_x1s/www/src/state/automation-assist-controller";
import { AUTOMATION_ASSIST_SESSION_KEY } from "../../custom_components/sofabaton_x1s/www/src/remote-card-shared";
import type { HassLike } from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";

// Minimal window for the per-tab session state.
const win = ((globalThis as Record<string, unknown>).window ??= {
  dispatchEvent: () => true,
}) as Record<string, unknown>;

function resetSession() {
  delete win[AUTOMATION_ASSIST_SESSION_KEY];
}

interface Subscription {
  callback: (msg: unknown) => void;
  message: Record<string, unknown>;
  unsubscribed: boolean;
}

function createFakeHass(calls: Array<{ domain: string; service: string; data: Record<string, unknown> }> = []) {
  const subscriptions: Subscription[] = [];
  const hass: HassLike = {
    states: {},
    async callWS<T>() {
      return {} as T;
    },
    async callService(domain: string, service: string, data?: Record<string, unknown>) {
      calls.push({ domain, service, data: data ?? {} });
      return undefined;
    },
    connection: {
      subscribeMessage: async <T>(callback: (message: T) => void, message: Record<string, unknown>) => {
        const sub: Subscription = {
          callback: callback as (msg: unknown) => void,
          message,
          unsubscribed: false,
        };
        subscriptions.push(sub);
        return () => {
          sub.unsubscribed = true;
        };
      },
    },
  };
  return { hass, subscriptions, calls };
}

function createController(overrides: Partial<AutomationAssistHost> = {}) {
  const calls: Array<{ domain: string; service: string; data: Record<string, unknown> }> = [];
  const fake = createFakeHass(calls);
  let changeCount = 0;
  const host: AutomationAssistHost = {
    getHass: () => fake.hass,
    assistEnabled: () => true,
    entityId: () => "remote.living_room",
    isEditMode: () => false,
    isX2: () => true,
    isHubIntegration: () => false,
    hubMacAttribute: () => "AA:BB:CC:11:22:33",
    hubQueueIdle: () => true,
    requestHubBasicData: () => undefined,
    activities: () => [
      { id: 101, name: "Watch a movie", state: "on" },
      { id: 102, name: "Play Xbox", state: "off" },
    ],
    activityNameForId: (id) => (Number(id) === 101 ? "Watch a movie" : Number(id) === 102 ? "Play Xbox" : null),
    currentActivityId: () => 101,
    currentActivityLabel: () => "Watch a movie",
    resolveCommandDeviceId: (commandId, deviceId) =>
      deviceId != null ? Number(deviceId) : 101,
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
    },
    onChange: () => {
      changeCount += 1;
    },
    ...overrides,
  };
  const controller = new AutomationAssistController(host);
  return { controller, host, calls, subscriptions: fake.subscriptions, changeCount: () => changeCount };
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// ---------- pure helpers ----------

test("normalizeHubMac strips separators, uppercases, and rejects junk", () => {
  assert.equal(normalizeHubMac("aa:bb:cc:11:22:33"), "AABBCC112233");
  assert.equal(normalizeHubMac("AABBCC112233"), "AABBCC112233");
  assert.equal(normalizeHubMac("xy"), null);
  assert.equal(normalizeHubMac(""), null);
  assert.equal(normalizeHubMac(null), null);
});

test("parseMqttPayload accepts objects and JSON strings, rejects garbage", () => {
  assert.deepEqual(parseMqttPayload({ a: 1 }), { a: 1 });
  assert.deepEqual(parseMqttPayload('{"device_id": 3}'), { device_id: 3 });
  assert.equal(parseMqttPayload("not json"), null);
  assert.equal(parseMqttPayload(null), null);
});

test("automationAssistSlug produces stable ids", () => {
  assert.equal(automationAssistSlug("Vol Up!"), "vol_up");
  assert.equal(automationAssistSlug("  __Weird -- Name__ "), "weird_name");
  assert.equal(automationAssistSlug(""), "command");
});

// ---------- MQTT lifecycle ----------

test("activating subscribes to the hub topic; deactivating unsubscribes", async () => {
  resetSession();
  const { controller, subscriptions } = createController();

  controller.setActive(true);
  await flush();
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].message.topic, "AABBCC112233/up");
  assert.equal(controller.hubMac, "AABBCC112233");

  controller.setActive(false);
  await flush();
  assert.equal(subscriptions[0].unsubscribed, true);

  // Re-activating re-subscribes (fresh subscription).
  controller.setActive(true);
  await flush();
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions[1].unsubscribed, false);
  controller.setActive(false);
});

test("syncMqtt does not double-subscribe for the same topic", async () => {
  resetSession();
  const { controller, subscriptions } = createController();
  controller.setActive(true);
  await flush();
  controller.syncMqtt();
  controller.syncMqtt();
  await flush();
  assert.equal(subscriptions.length, 1);
  controller.setActive(false);
});

test("disconnected() unsubscribes the MQTT listener", async () => {
  resetSession();
  const { controller, subscriptions } = createController();
  controller.setActive(true);
  await flush();
  assert.equal(subscriptions[0].unsubscribed, false);

  controller.disconnected();
  assert.equal(subscriptions[0].unsubscribed, true);
});

test("non-X2 hubs never subscribe", async () => {
  resetSession();
  const { controller, subscriptions } = createController({ isX2: () => false });
  controller.setActive(true);
  await flush();
  assert.equal(subscriptions.length, 0);
  controller.setActive(false);
});

test("hub integration waits for an idle hub queue before subscribing", async () => {
  resetSession();
  let idle = false;
  const { controller, subscriptions } = createController({
    isHubIntegration: () => true,
    hubQueueIdle: () => idle,
  });
  controller.setActive(true);
  await flush();
  assert.equal(subscriptions.length, 0);

  idle = true;
  controller.syncMqtt();
  await flush();
  assert.equal(subscriptions.length, 1);
  controller.setActive(false);
});

// ---------- capture recording ----------

test("recordClick captures the command and sends the notification", async () => {
  resetSession();
  const { controller, calls } = createController();
  controller.setActive(true);
  await flush();

  controller.recordClick({
    label: "Vol Up",
    commandId: 174,
    commandType: "assigned",
    icon: "mdi:volume-plus",
  });

  assert.equal(controller.capture?.kind, "button");
  assert.equal(controller.capture?.commandId, 174);
  assert.equal(controller.capture?.deviceId, 101);
  assert.equal(controller.capture?.activityName, "Watch a movie");

  const notification = calls.find(
    (call) => call.domain === "persistent_notification" && call.service === "create",
  );
  assert.ok(notification, "persistent notification should be created");
  assert.match(String(notification!.data.message), /Vol Up/);
  controller.setActive(false);
});

test("recordClick auto-activates capture when assist is enabled", async () => {
  resetSession();
  const { controller } = createController();
  assert.equal(controller.active, false);

  controller.recordClick({ label: "Play", commandId: 179 });
  assert.equal(controller.active, true);
  assert.equal(controller.capture?.label, "Play");
  controller.setActive(false);
});

test("recordClick is inert in edit mode or with assist disabled", () => {
  resetSession();
  const editing = createController({ isEditMode: () => true });
  editing.controller.recordClick({ label: "X", commandId: 1 });
  assert.equal(editing.controller.capture, null);

  const disabled = createController({ assistEnabled: () => false });
  disabled.controller.recordClick({ label: "X", commandId: 1 });
  assert.equal(disabled.controller.capture, null);
});

test("observeActivityState records switches and power-off against the baseline", async () => {
  resetSession();
  const { controller } = createController();
  controller.setActive(true); // primes baseline at "Watch a movie"/101
  await flush();

  const capture = () => controller.capture as Record<string, unknown> | null;

  // No change: no capture.
  controller.observeActivityState({ currentLabel: "Watch a movie", activityId: 101, unavailable: false });
  assert.equal(capture(), null);

  // Switch: activity capture.
  controller.observeActivityState({ currentLabel: "Play Xbox", activityId: 102, unavailable: false });
  assert.equal(capture()?.kind, "activity");
  assert.equal(capture()?.activityId, 102);

  // Power off: power capture referencing the PREVIOUS activity id.
  controller.observeActivityState({ currentLabel: "Powered Off", activityId: null, unavailable: false });
  assert.equal(capture()?.kind, "power");
  assert.equal(capture()?.activityId, 102);

  // Unavailable clears the baseline: the next label is not a "change".
  controller.observeActivityState({ currentLabel: "Watch a movie", activityId: 101, unavailable: true });
  const captureBefore = controller.capture;
  controller.observeActivityState({ currentLabel: "Play Xbox", activityId: 102, unavailable: false });
  assert.equal(controller.capture, captureBefore);
  controller.setActive(false);
});

// ---------- status + modal ----------

test("statusText reflects edit mode, waiting, capture, and status message", () => {
  resetSession();
  const { controller } = createController();
  assert.match(controller.statusText(), /Waiting/i);

  const editing = createController({ isEditMode: () => true });
  assert.match(editing.controller.statusText(), /Edit mode/i);

  controller.setActive(true);
  controller.recordClick({ label: "Vol Up", commandId: 174 });
  assert.match(controller.statusText(), /Vol Up/);

  controller.setStatus("Custom status");
  assert.equal(controller.statusText(), "Custom status");
  controller.setActive(false);
});

test("an incoming MQTT press opens the modal with primed metadata", async () => {
  resetSession();
  const { controller, subscriptions } = createController();
  controller.setActive(true);
  await flush();

  subscriptions[0].callback({ payload: JSON.stringify({ device_id: 7, key_id: 12 }) });
  assert.equal(controller.mqttMatch, true);
  assert.equal(controller.modalOpen, true);
  assert.equal(controller.modalDeviceId, 7);

  const view = controller.modalViewState();
  assert.equal(view.open, true);
  assert.match(view.text, /Device 7/);
  assert.equal(view.showCreate, true);
  controller.setActive(false);
});

test("the session opt-out suppresses future modals", async () => {
  resetSession();
  const { controller, subscriptions } = createController();
  controller.setActive(true);
  await flush();

  subscriptions[0].callback({ payload: JSON.stringify({ device_id: 7, key_id: 12 }) });
  assert.equal(controller.modalOpen, true);

  controller.setModalOptOut(true);
  assert.equal(controller.modalOpen, false);

  subscriptions[0].callback({ payload: JSON.stringify({ device_id: 8, key_id: 3 }) });
  assert.equal(controller.modalOpen, false);
  controller.setActive(false);
});

test("garbage MQTT payloads are ignored", async () => {
  resetSession();
  const { controller, subscriptions, changeCount } = createController();
  controller.setActive(true);
  await flush();
  const before = changeCount();

  subscriptions[0].callback({ payload: "not json at all" });
  assert.equal(controller.mqttMatch, false);
  assert.equal(controller.modalOpen, false);
  assert.equal(changeCount(), before);
  controller.setActive(false);
});

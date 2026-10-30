/**
 * How Wifi Command presses reach Home Assistant, in the control panel
 * (docs/internal/wifi-webhook-transport-plan.md, wave 3): the path line and
 * the TCP flow to allow, the delivery pill and its dropdown (Test, the
 * failed test's guidance, the broker link, the method choice), the create
 * dialog's MQTT check, and the hub's broker form.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";
import { setToolsCardLanguage, TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";
import {
  deliveryAllowText,
  deliveryDocUrl,
  deliveryFailed,
  deliveryPathText,
  deployedTransport,
  formatCheckedAgo,
  formatLatency,
  targetHostPort,
  targetPort,
} from "../../custom_components/sofabaton_x1s/www/src/shared/utils/wifi-delivery";
import {
  DeliveryPillController,
  renderReadOnlyDeliveryPill,
  type DeliveryPillDevice,
} from "../../custom_components/sofabaton_x1s/www/src/components/delivery-pill";
import { HubBrokerFormController } from "../../custom_components/sofabaton_x1s/www/src/components/hub-broker-form";
import type {
  HubMqttLinkState,
  WifiDeliveryInfo,
} from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab") as {
  new (): HTMLElement;
};

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const maybeTemplate = template as { strings?: unknown[]; values?: unknown[] };
    const strings = maybeTemplate.strings ?? [];
    const values = maybeTemplate.values ?? [];
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += templateText(strings[index]);
      if (index < values.length) text += templateText(values[index]);
    }
    return text;
  }
  return "";
}

const LISTENER_INFO: WifiDeliveryInfo = {
  device_key: "lights",
  transport: "http",
  target: "http://192.168.2.50:8060",
  hub_ip: "192.168.2.123",
  delivery: { status: "delivered", transport: "http" },
};

const LINK: HubMqttLinkState = {
  available: true,
  ha_connected: true,
  ha_broker: { host: "core-mosquitto", port: 1883, tls: false },
  hub_connected: false,
  suggested_host: "192.168.2.50",
  suggested_port: 1883,
  ha_username: "ha",
  ha_login_available: true,
};

test("the path line and the flow to allow name the actual addresses", () => {
  setToolsCardLanguage("en");
  assert.equal(deployedTransport("http"), "http");
  // A device the 0.7.2 test releases deployed as Direct has no path any more.
  assert.equal(deployedTransport("webhook"), null);
  assert.equal(deployedTransport("bogus"), null);
  assert.equal(targetHostPort("https://192.168.2.50:8123"), "192.168.2.50:8123");
  assert.equal(targetHostPort("core-mosquitto:1883"), "core-mosquitto:1883");
  assert.equal(targetPort("http://192.168.2.50:8060"), "8060");

  assert.match(deliveryPathText(LISTENER_INFO), /listener at http:\/\/192\.168\.2\.50:8060/);
  assert.match(deliveryAllowText(LISTENER_INFO), /port 8060 on the Home Assistant host; with Docker, publish port 8060/);
  assert.equal(deliveryPathText({ transport: "webhook", target: "https://192.168.2.50:8123" }), "");
  const mqtt = { transport: "mqtt", target: "core-mosquitto:1883", hub_ip: "192.168.2.123" };
  assert.match(deliveryPathText(mqtt), /listens on core-mosquitto:1883/);
  assert.match(deliveryAllowText(mqtt), /same broker Home Assistant uses \(core-mosquitto:1883\)/);
  assert.match(deliveryDocUrl("mqtt"), /networking\.md#optional--mqtt-delivery-x2$/);
  assert.match(deliveryDocUrl("http"), /networking\.md#optional--wifi-commands-and-wifi-events$/);

  assert.equal(deliveryFailed({ status: "not_delivered" }), true);
  assert.equal(deliveryFailed({ status: "not_sent" }), true);
  assert.equal(deliveryFailed({ status: "delivered" }), false);
  assert.equal(deliveryFailed(null), false);
  assert.equal(formatLatency(1.234), "1.2");
});

// ── The delivery pill ────────────────────────────────────────────────────

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function makePill(callWS: (msg: Record<string, unknown>) => Promise<unknown>) {
  const host = {
    addController() {},
    removeController() {},
    requestUpdate() {},
    updateComplete: Promise.resolve(true),
    shadowRoot: null,
  };
  const pill = new DeliveryPillController(host as any);
  const picks: string[] = [];
  const busy: Array<boolean> = [];
  const device = (overrides: Partial<DeliveryPillDevice> = {}): DeliveryPillDevice => ({
    hass: { callWS, states: {} } as any,
    hubEntryId: "entry-1",
    deviceKey: "lights",
    onHub: true,
    transport: "http",
    pending: null,
    canSwitch: true,
    mqttAvailable: true,
    locked: false,
    onPick: (transport) => { picks.push(transport); },
    onBusy: (value) => { busy.push(value); },
    ...overrides,
  });
  return { pill, picks, busy, device };
}

test("the pill reads the stored delivery record (no hub exchange) and warns at rest", async () => {
  setToolsCardLanguage("en");
  const types: string[] = [];
  const failedInfo = { ...LISTENER_INFO, delivery: { status: "not_delivered", transport: "http" } };
  const { pill, device } = makePill(async (msg) => {
    types.push(String(msg.type));
    return failedInfo;
  });
  pill.renderPill(device());
  await settle();
  assert.deepEqual(types, ["sofabaton_x1s/command_config/delivery"]);
  assert.equal(pill.attention(), true);
  const closed = templateText(pill.renderPill(device()));
  assert.match(closed, /transport-pill delivery-pill http attention/);
  assert.match(closed, /aria-expanded="?false/);
  assert.doesNotMatch(closed, /delivery-pop/);

  // A device not on the hub yet has nothing stored to read, and never warns.
  const fresh = makePill(async (msg) => { types.push(String(msg.type)); return failedInfo; });
  types.length = 0;
  fresh.pill.renderPill(fresh.device({ onHub: false }));
  await settle();
  assert.deepEqual(types, []);
  assert.equal(fresh.pill.attention(), false);
});

test("the dropdown guides on failure and stays quiet on success", async () => {
  setToolsCardLanguage("en");
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  let info: WifiDeliveryInfo = { ...LISTENER_INFO, delivery: { status: "not_delivered", transport: "http" } };
  const { pill, device } = makePill(async () => info);
  pill.renderPill(device());
  await settle();
  pill.open = true;
  const failed = templateText(pill.renderPill(device()));
  assert.match(failed, new RegExp(S.title));
  assert.match(failed, /listener at http:\/\/192\.168\.2\.50:8060/);
  assert.match(failed, new RegExp(S.notDelivered));
  assert.match(failed, /Allow TCP from the hub \(192\.168\.2\.123\) to port 8060/);
  assert.match(failed, /Networking guide/);
  assert.match(failed, /Test again/);

  info = { ...LISTENER_INFO, delivery: { status: "delivered", latency_s: 0.42, checked_at: new Date().toISOString() } };
  await pill.reload();
  const ok = templateText(pill.renderPill(device()));
  assert.match(ok, /Test command received \(0\.4 s\)/);
  assert.doesNotMatch(ok, new RegExp(S.notDelivered));

  info = { ...LISTENER_INFO, delivery: { status: "delivered", latency_s: 0.3, via: "press" } };
  await pill.reload();
  // A real press measures nothing: the line names it without seconds.
  const press = templateText(pill.renderPill(device()));
  assert.match(press, /A button press arrived\./);
  assert.doesNotMatch(press, /0\.3 s/);

  info = { ...LISTENER_INFO, delivery: null };
  await pill.reload();
  const untested = templateText(pill.renderPill(device()));
  assert.match(untested, new RegExp(S.notTested));
  assert.match(untested, />Test</);

  // Before the first Sync: nothing to test.
  const fresh = makePill(async () => info);
  fresh.pill.renderPill(fresh.device({ onHub: false }));
  fresh.pill.open = true;
  const notOnHub = templateText(fresh.pill.renderPill(fresh.device({ onHub: false })));
  assert.match(notOnHub, new RegExp(S.notOnHub));
  assert.match(notOnHub, new RegExp(S.firstSyncMethod));
  assert.match(notOnHub, /delivery-test-btn"[^>]*disabled/);
});

test("Test presses through the backend; a failed MQTT test reads the broker link", async () => {
  setToolsCardLanguage("en");
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  const types: string[] = [];
  const http = makePill(async (msg) => {
    types.push(String(msg.type));
    if (msg.type === "sofabaton_x1s/command_config/test_delivery") return { status: "delivered", latency_s: 1.5 };
    return LISTENER_INFO;
  });
  http.pill.renderPill(http.device());
  await settle();
  types.length = 0;
  await http.pill.test();
  assert.deepEqual(types, ["sofabaton_x1s/command_config/test_delivery", "sofabaton_x1s/command_config/delivery"]);
  assert.equal(http.pill.lastTest?.status, "delivered");
  assert.equal(http.pill.busy, false);
  assert.deepEqual(http.busy, [true, false]);

  types.length = 0;
  const mqttInfo = { device_key: "lights", transport: "mqtt", target: "core-mosquitto:1883", hub_ip: "192.168.2.123", delivery: null };
  const mqtt = makePill(async (msg) => {
    types.push(String(msg.type));
    if (msg.type === "sofabaton_x1s/command_config/test_delivery") return { status: "not_delivered", transport: "mqtt" };
    if (msg.type === "sofabaton_x1s/hub_mqtt/status") return LINK;
    return mqttInfo;
  });
  const device = mqtt.device({ transport: "mqtt" });
  mqtt.pill.renderPill(device);
  await settle();
  await mqtt.pill.test();
  assert.ok(types.includes("sofabaton_x1s/hub_mqtt/status"));
  assert.equal(mqtt.pill.attention(), true);
  mqtt.pill.open = true;
  const text = templateText(mqtt.pill.renderPill(device));
  // The broken end of the link leads; the failed test shrinks to one line.
  assert.match(text, new RegExp(S.brokerNotConnected));
  assert.match(text, /delivery-broker-setup/);
  assert.match(text, /Home Assistant's broker: core-mosquitto:1883/);
  assert.doesNotMatch(text, /same broker Home Assistant uses/);
});

test("picking MQTT checks the broker link first; HTTP and Undo go straight to the host", async () => {
  setToolsCardLanguage("en");
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  let link: HubMqttLinkState = { ...LINK, hub_connected: false };
  const { pill, picks, device } = makePill(async (msg) => (msg.type === "sofabaton_x1s/hub_mqtt/status" ? link : LISTENER_INFO));
  pill.renderPill(device());
  await settle();
  pill.open = true;
  await pill.pick("mqtt");
  assert.deepEqual(picks, []);
  assert.equal(pill.picking, "blocked");
  const blocked = templateText(pill.renderPill(device()));
  assert.match(blocked, new RegExp(S.mqttHubNotConnected.replace("?", "\\?")));
  assert.match(blocked, /delivery-pick-setup/);
  assert.match(blocked, /delivery-use-http/);

  link = { ...LINK, ha_connected: false, hub_connected: true };
  await pill.pick("mqtt");
  assert.deepEqual(picks, []);
  assert.match(templateText(pill.renderPill(device())), new RegExp(S.mqttHaNotConnected));

  link = { ...LINK, hub_connected: true };
  await pill.pick("mqtt");
  assert.deepEqual(picks, ["mqtt"]);
  assert.equal(pill.picking, null);

  // A pending switch: the dashed pill, the note, and Undo picks the hub's method.
  const pending = device({ pending: "mqtt" });
  const text = templateText(pill.renderPill(pending));
  assert.match(text, /transport-pill delivery-pill mqtt pending/);
  assert.match(text, /Switches to MQTT on the next Sync\. Until then, button presses keep using HTTP\./);
  await pill.pick("http");
  assert.deepEqual(picks, ["mqtt", "http"]);
});

test("the method choice is an X2's; MQTT is greyed out without the integration", () => {
  setToolsCardLanguage("en");
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  const { pill, device } = makePill(async () => LISTENER_INFO);
  pill.renderPill(device({ canSwitch: false }));
  pill.open = true;
  assert.doesNotMatch(templateText(pill.renderPill(device({ canSwitch: false }))), /delivery-method/);
  const noMqtt = templateText(pill.renderPill(device({ mqttAvailable: false })));
  assert.match(noMqtt, /delivery-method/);
  assert.match(noMqtt, new RegExp(S.mqttNeedsIntegration));
  assert.match(noMqtt, /data-transport="?mqtt"?[^>]*disabled/);
});

test("a device row's pill is read-only and still warns", () => {
  const quiet = templateText(renderReadOnlyDeliveryPill({ transport: "http", pending: false, attention: false }));
  assert.match(quiet, /transport-pill http/);
  assert.doesNotMatch(quiet, /<button|attention|chevron/);
  assert.match(templateText(renderReadOnlyDeliveryPill({ transport: "mqtt", pending: true, attention: true })), /transport-pill mqtt pending attention/);
});

test("a check's time reads as relative time in the selected locale", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(formatCheckedAgo("2026-10-27T11:55:00Z", now, "en"), "5 minutes ago");
  assert.equal(formatCheckedAgo("2026-10-27T12:00:00Z", now, "en"), "now");
  assert.equal(formatCheckedAgo("", now, "en"), "");
  assert.equal(formatCheckedAgo("garbage", now, "en"), "");
});

function makeTab(callWS: (msg: Record<string, unknown>) => Promise<unknown>) {
  const element = new WifiCommandsTabElement() as any;
  element.hub = { entry_id: "entry-1", version: "X2" };
  element.hass = {
    callWS,
    states: { "remote.hub": { attributes: { entry_id: "entry-1" } } },
  };
  return element;
}

test("the Wifi Commands header pill offers the switch on an X2 and stores a pick for its Sync", async () => {
  const types: string[] = [];
  const tab = makeTab(async (msg) => {
    types.push(String(msg.type));
    if (msg.type === "sofabaton_x1s/command_devices/list") return { devices: tab._wifiDevices };
    return LISTENER_INFO;
  });
  tab.hub = { entry_id: "entry-1", version: "X2", broker_setup_available: true };
  tab._wifiDevices = [{ device_key: "lights", device_name: "Lights", deployed_device_id: 9, deployed_transport: "http", requested_transport: "http" }];
  tab._selectedDeviceKey = "lights";
  tab._renderDeliveryPill(tab._wifiDevices[0], false);
  tab._delivery.open = true;
  assert.match(templateText(tab._renderDeliveryPill(tab._wifiDevices[0], false)), /delivery-method/);
  // An X1 / X1S: the same pill, without the method choice.
  tab.hub = { entry_id: "entry-1", version: "X1S" };
  assert.doesNotMatch(templateText(tab._renderDeliveryPill(tab._wifiDevices[0], false)), /delivery-method/);

  types.length = 0;
  await tab._setDeviceTransport("lights", "mqtt");
  assert.equal(types[0], "sofabaton_x1s/command_config/set_transport");
  assert.ok(types.includes("sofabaton_x1s/command_devices/list"));
  assert.ok(types.includes("sofabaton_x1s/command_sync/progress"));
});

test("a deploy whose test press did not arrive says so in the dock", async () => {
  setToolsCardLanguage("en");
  const notices: Array<{ tone: string; label: string }> = [];
  const tab = makeTab(async (msg) => {
    if (msg.type === "sofabaton_x1s/command_sync/run") {
      return { status: "success", delivery: { status: "not_delivered", transport: "http" } };
    }
    if (msg.type === "sofabaton_x1s/command_devices/list") return { devices: tab._wifiDevices };
    return {};
  });
  tab.showCompletion = (notice: { tone: string; label: string }) => notices.push(notice);
  tab._wifiDevices = [{ device_key: "lights", device_name: "Lights", deployed_device_id: 9 }];
  tab._selectedDeviceKey = "lights";
  await tab._startCommandConfigSync();
  assert.deepEqual(notices, [{ tone: "error", label: TOOLS_CARD_STRINGS.wifiDelivery.syncedNotDeliveredDock }]);
});

test("new devices default to MQTT where it is offered; MQTT waits for the broker link", async () => {
  const plain = makeTab(async () => LINK);
  plain._openCreateDeviceModal();
  assert.equal(plain._newDeviceTransport, "http");
  assert.equal(plain._mqttChoiceBlocked(), false);

  const tab = makeTab(async () => LINK);
  tab._mqttAvailable = true;
  tab._openCreateDeviceModal();
  assert.equal(tab._newDeviceTransport, "mqtt");
  // The link is being read: Create waits.
  assert.equal(tab._mqttChoiceBlocked(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The hub has no broker: MQTT cannot be created until it is set up.
  assert.equal(tab._brokerForm.state.hub_connected, false);
  assert.equal(tab._mqttChoiceBlocked(), true);
  tab._brokerForm.state = { ...LINK, hub_connected: null };
  assert.equal(tab._mqttChoiceBlocked(), false);
});

function makeForm(callWS: (msg: Record<string, unknown>) => Promise<unknown>) {
  const host = { addController() {}, requestUpdate() {}, removeController() {}, updateComplete: Promise.resolve(true) };
  return new HubBrokerFormController(host as any, () => ({ callWS, states: {} }) as any);
}

test("the broker form prefills Home Assistant's broker and never sends its password", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const form = makeForm(async (msg) => {
    sent.push(msg);
    if (msg.type === "sofabaton_x1s/hub_mqtt/status") return LINK;
    return { ...LINK, hub_connected: true, connected: true };
  });
  await form.load("entry-1");
  let done: boolean | null = null;
  form.openFor("entry-1", { onDone: (connected) => { done = connected; } });
  assert.equal(form.open, true);
  assert.match(templateText(form.render()), /192\.168\.2\.50/);
  // Disconnected does not mean unconfigured: warn before replacing saved settings.
  assert.match(templateText(form.render()), /replaces any MQTT broker settings/);
  await form.submit();
  const setup = sent.find((msg) => msg.type === "sofabaton_x1s/hub_mqtt/setup")!;
  assert.deepEqual(setup, {
    type: "sofabaton_x1s/hub_mqtt/setup",
    entry_id: "entry-1",
    host: "192.168.2.50",
    port: 1883,
    use_ha_login: true,
  });
  assert.equal(done, true);
  assert.equal(form.state?.hub_connected, true);

  // Change: the hub has a broker that gets replaced.
  form.openFor("entry-1");
  assert.match(templateText(form.render()), /replaces any MQTT broker settings/);
});

test("the broker form refuses a host the hub cannot store before sending", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const form = makeForm(async (msg) => { sent.push(msg); return LINK; });
  form.state = { ...LINK, suggested_host: "" };
  form.openFor("entry-1");
  await form.submit();
  assert.equal(sent.length, 0);
  assert.match(templateText(form.render()), /Enter a valid IPv4 address for the broker/);
});

test("latency uses the selected locale and never turns missing data into zero", () => {
  for (const locale of ["de", "es", "fr", "nl"]) {
    setToolsCardLanguage(locale);
    assert.equal(formatLatency(0.84), "0,8", locale);
  }
  for (const locale of ["en", "en-GB", "zh-hans"]) {
    setToolsCardLanguage(locale);
    assert.equal(formatLatency(0.84), "0.8", locale);
  }
  assert.equal(formatLatency(null), "?");
  assert.equal(formatLatency(undefined), "?");
  assert.equal(formatLatency(Number.NaN), "?");
  assert.equal(formatLatency(0), "0.0");
  assert.equal(formatLatency(0.84, "bad_locale"), "0.8");
  setToolsCardLanguage("en");
});

test("an unsent test does not claim a delivery failure or prescribe firewall changes", async () => {
  setToolsCardLanguage("en");
  const notices: any[] = [];
  const tab = makeTab(async () => ({}));
  tab.showCompletion = (notice: unknown) => notices.push(notice);
  tab._announceDeployResult({ status: "not_sent" }, "Synced", "entry-1");
  assert.equal(notices[0].label, "Synced, but delivery could not be tested.");
  const { pill, device } = makePill(async () => ({ ...LISTENER_INFO, delivery: { status: "not_sent" } }));
  pill.renderPill(device());
  await settle();
  pill.open = true;
  const text = templateText(pill.renderPill(device()));
  assert.match(text, /Could not send the test command/);
  assert.doesNotMatch(text, /did not reach|allow TCP/i);
});

test("broker validation rejects invalid IPv4 octets and ports without sending", async () => {
  setToolsCardLanguage("en");
  let sent = false;
  const form = makeForm(async () => { sent = true; return {}; });
  form.state = LINK;
  for (const host of ["999.999.999.999", "192.168.001.1", "broker.local"]) {
    form.openFor("entry-1");
    (form as any)._host = host;
    await form.submit();
    assert.match(templateText(form.render()), /sb-broker-host-error/);
  }
  for (const port of [0, 65536, 1883.5, Number.NaN]) {
    form.openFor("entry-1");
    (form as any)._port = port;
    await form.submit();
    assert.match(templateText(form.render()), /sb-broker-port-error/);
    assert.match(templateText(form.render()), /1 to 65535/);
  }
  assert.equal(sent, false);
});

test("broker failures are localized from codes, with visible field errors and a safe fallback", async () => {
  for (const locale of ["de", "es", "fr", "nl", "zh-hans"]) {
    setToolsCardLanguage(locale);
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const cases: Array<[string, string, string | null]> = [
      ["broker_invalid_host", S.brokerHostRequired, "host"],
      ["broker_invalid_port", S.brokerPortInvalid, "port"],
      ["broker_username_too_long", S.brokerUsernameTooLong, "username"],
      ["broker_password_too_long", S.brokerPasswordTooLong, "password"],
      ["broker_credentials_too_long", S.brokerCredentialsTooLong, null],
      ["unknown", S.brokerFailed, null],
      ["invalid_format", S.brokerFailed, null],
      ["hub_no_answer", S.brokerNoAnswer, null],
    ];
    for (const [code, expected, field] of cases) {
      const form = makeForm(async () => { throw { code, message: "Backend diagnostic must not appear" }; });
      form.state = LINK;
      form.openFor("entry-1");
      (form as any)._useHaLogin = false;
      await form.submit();
      const text = templateText(form.render());
      assert.ok(text.includes(expected), `${locale}: ${code}`);
      assert.doesNotMatch(text, /Backend diagnostic/);
      if (field) assert.ok(text.includes(`sb-broker-${field}-error`));
    }
    // Stored HA credentials have no editable field: their error must remain visible.
    const form = makeForm(async () => { throw { code: "broker_password_too_long" }; });
    form.state = LINK;
    form.openFor("entry-1");
    await form.submit();
    assert.ok(templateText(form.render()).includes(S.brokerPasswordTooLong));
  }
  setToolsCardLanguage("en");
});

test("the replacement warning is present for connected, disconnected and unknown hubs", () => {
  setToolsCardLanguage("en");
  for (const status of [true, false, null]) {
    const form = makeForm(async () => ({}));
    form.state = { ...LINK, hub_connected: status };
    form.openFor("entry-1");
    assert.ok(templateText(form.render()).includes(TOOLS_CARD_STRINGS.wifiDelivery.brokerReplaceWarning));
  }
});

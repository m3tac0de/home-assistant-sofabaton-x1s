/**
 * The Matter buttons section of the Events subtab
 * (docs/internal/matter-events-plan.md D6): shown only when the backend
 * found this hub's Matter device, one line per button with the press types
 * it declares, writes through matter_events/set, and the press glow.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nothing } from "lit";
import "../../custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab";
import type { MatterEventsResponse } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab") as {
  new (): HTMLElement;
};

const ALL_TYPES = ["multi_press_1", "multi_press_2", "long_press", "long_release"];

const FOUND: MatterEventsResponse = {
  available: true,
  reason: null,
  device: { id: "dev1", name: "Matter device 4" },
  candidates: [],
  buttons: [
    { button: 1, name: "Lights", entity_id: "event.matter_button_1", event_types: ALL_TYPES },
    { button: 2, name: "Button 2", entity_id: "event.matter_button_2", event_types: ["multi_press_1"] },
  ],
  actions: { "1": { long_press: { action: "perform-action", perform_action: "light.toggle" } } },
};

function makeTab(callWS?: (msg: Record<string, unknown>) => Promise<unknown>) {
  const element = new WifiCommandsTabElement() as any;
  element.hub = { entry_id: "entry-1" };
  element.hass = {
    callWS: callWS ?? (async () => ({})),
    states: { "remote.hub": { attributes: { entry_id: "entry-1" } } },
  };
  return element;
}

function templateText(template: unknown): string {
  if (template === nothing || template == null) return "";
  if (typeof template === "string" || typeof template === "number") return String(template);
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (typeof template === "object") {
    const value = template as { strings?: unknown[]; values?: unknown[] };
    if (value.strings) {
      return value.strings.map((part, index) => String(part) + templateText(value.values?.[index])).join("");
    }
    // A directive result (keyed): its template sits among its values.
    if (Array.isArray(value.values)) return value.values.map(templateText).join("");
  }
  return "";
}

test("the section stays hidden until the backend finds the Matter device", () => {
  const tab = makeTab();
  assert.equal(tab._renderMatterEventsGroup(null), nothing);
  tab._applyMatterEventsResult({ available: false, reason: "no_matter_device" });
  assert.equal(tab._renderMatterEventsGroup(null), nothing);
  tab._applyMatterEventsResult({ available: false, reason: "hub_not_linked" });
  assert.equal(tab._renderMatterEventsGroup(null), nothing);
});

test("one line per button, in the hub's name, with only the declared press types", () => {
  const tab = makeTab();
  tab._applyMatterEventsResult(FOUND);
  const text = templateText(tab._renderMatterEventsGroup(null));
  assert.match(text, /Matter Buttons/);
  assert.match(text, /Lights/);
  assert.match(text, /pressed twice/);
  assert.match(text, /perform light\.toggle/);
  const second = templateText(tab._renderMatterButtonLine(FOUND.buttons![1], null));
  assert.match(second, /Button 2/);
  assert.doesNotMatch(second, /held|released|twice/);
});

test("the pill counts configured buttons and the unconfigured ones wait behind the expander", () => {
  const tab = makeTab();
  tab._applyMatterEventsResult(FOUND);
  const collapsed = templateText(tab._renderMatterEventsGroup(null));
  assert.match(collapsed, /1 of 2 configured/);
  assert.match(collapsed, /Lights/);
  assert.doesNotMatch(collapsed, /Button 2/);
  assert.match(collapsed, /Show 1 unconfigured/);
  tab._matterEventsShowUnconfigured = true;
  const expanded = templateText(tab._renderMatterEventsGroup(null));
  assert.match(expanded, /Button 2/);
  assert.doesNotMatch(expanded, /Show \d+ unconfigured/);
});

test("a stored action for a press type the button no longer declares does not count", () => {
  const tab = makeTab();
  tab._applyMatterEventsResult({
    ...FOUND,
    actions: { "2": { long_press: { action: "perform-action", perform_action: "light.toggle" } } },
  });
  assert.match(templateText(tab._renderMatterEventsGroup(null)), /0 of 2 configured/);
});

test("the action target reads the button and press type, and the title names both", () => {
  const tab = makeTab();
  tab._applyMatterEventsResult(FOUND);
  assert.equal(tab._actionForHubEventTarget({ kind: "matter", button: 1, eventType: "long_press" }).perform_action, "light.toggle");
  assert.equal(tab._actionForHubEventTarget({ kind: "matter", button: 1, eventType: "multi_press_1" }).perform_action, undefined);
  assert.equal(tab._hubEventEditorTitle({ kind: "matter", button: 1, eventType: "multi_press_2" }), "Lights, pressed twice");
});

test("saving writes the whole Matter map through matter_events/set", async () => {
  const sent: Record<string, unknown>[] = [];
  const tab = makeTab(async (msg) => {
    sent.push(msg);
    return { ...FOUND, actions: msg.actions };
  });
  tab._applyMatterEventsResult(FOUND);
  await tab._writeHubEventAction(
    { kind: "matter", button: 2, eventType: "multi_press_1" },
    { action: "perform-action", perform_action: "scene.turn_on" },
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "sofabaton_x1s/matter_events/set");
  const actions = sent[0].actions as Record<string, Record<string, { perform_action?: string }>>;
  assert.equal(actions["1"].long_press.perform_action, "light.toggle");
  assert.equal(actions["2"].multi_press_1.perform_action, "scene.turn_on");
  assert.equal(tab._matterAction(2, "multi_press_1").perform_action, "scene.turn_on");
});

test("an unsettled link offers the candidate Matter devices and saves the pick", async () => {
  const sent: Record<string, unknown>[] = [];
  const tab = makeTab(async (msg) => {
    sent.push(msg);
    return FOUND;
  });
  tab._applyMatterEventsResult({ available: false, reason: "ambiguous", candidates: [{ id: "dev1", name: "Matter device 4" }] });
  assert.match(templateText(tab._renderMatterEventsGroup(null)), /Which Matter device is this hub\?/);
  await tab._pickMatterDevice("dev1");
  assert.deepEqual(sent[0], { type: "sofabaton_x1s/matter_events/set", entry_id: "entry-1", device_id: "dev1" });
  assert.equal(tab._matterEvents.available, true);
});

test("a Matter press lights only its own press type", () => {
  const tab = makeTab();
  tab._applyMatterEventsResult(FOUND);
  const flash = {
    entryId: "entry-1",
    type: "matter",
    fromActivityId: null,
    toActivityId: null,
    matterButton: 1,
    matterEventType: "long_press",
    timestamp: 1,
    receivedAt: Date.now(),
  };
  const lit = templateText(tab._renderMatterButtonLine(FOUND.buttons![0], flash));
  assert.equal((lit.match(/wifi-ir-flash/g) ?? []).length, 1);
  const other = templateText(tab._renderMatterButtonLine(FOUND.buttons![1], flash));
  assert.doesNotMatch(other, /wifi-ir-flash/);
});

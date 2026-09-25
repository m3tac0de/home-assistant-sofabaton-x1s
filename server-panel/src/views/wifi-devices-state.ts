// The Wifi Devices view's pure helpers (docs/internal/server-panel-wifi-commands-plan.md,
// sections 3 and 6): the draft a device's detail view edits, the slot rules
// the card and the library enforce (mirrored so the view never sends what
// the server would refuse), the hard buttons a slot can claim, what a saved
// slot takes from its neighbours and from the hub's other Wifi Devices, the
// tile's meta line, the roster's status pill and the press matching behind
// the glow.

import type { WifiDeviceSpec, WifiDeviceView, WifiSlot } from "../panel-api";
import type { PressEvent } from "../panel-store";
import { supportsUnicodeNames } from "./device-editor-state";

/** The library's `WIFI_SLOT_COUNT`: shorts are commands 1..10, longs 11..20. */
export const WIFI_SLOT_COUNT = 10;
/** The card's name width. The library keeps 30, and the default long label is `<label> Long`, so 20 always fits. */
export const WIFI_NAME_MAX = 20;
/** The card's glow and the dock's sweep share this. */
export const PRESS_FLASH_MS = 720;
/** The key of the 0.2.0 callback device, which the list shows like any other. */
export const DEFAULT_DEVICE_KEY = "default";

/** The library's name for a slot nobody named; such a slot is the "Make Command" tile. */
export function defaultSlotLabel(slot: number): string {
  return `Button ${slot}`;
}

export interface WifiDraftSlot {
  label: string;
  /** A long-press label someone set through the API; null follows the label (`<label> Long`). */
  longLabel: string | null;
  /** A favorite in each of `activities`. */
  favorite: boolean;
  /** The hub button code bound to this command in each of `activities`; null for none. */
  button: number | null;
  /** The button's long press performs the slot's long record; means nothing without a button. */
  longPress: boolean;
  /** Where the favorite and the button apply; only meaningful while one of them is set. */
  activities: number[];
  /** The activity whose start performs this command (X1S, X2). */
  inputActivityId: number | null;
}

export function emptySlot(slot: number): WifiDraftSlot {
  return { label: defaultSlotLabel(slot), longLabel: null, favorite: false, button: null, longPress: false, activities: [], inputActivityId: null };
}

/** What the detail view edits; slots are always ten, hooks are 1-based slot numbers. */
export interface WifiDraft {
  name: string;
  slots: WifiDraftSlot[];
  powerOn: number | null;
  powerOff: number | null;
  inputs: number[];
}

function entityNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 255 ? n : null;
}

function slotNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= WIFI_SLOT_COUNT ? n : null;
}

export function draftFromSpec(spec: WifiDeviceSpec | null | undefined): WifiDraft {
  const rows = Array.isArray(spec?.slots) ? spec!.slots : [];
  const slots: WifiDraftSlot[] = [];
  for (let slot = 1; slot <= WIFI_SLOT_COUNT; slot++) {
    const row = rows[slot - 1];
    const label = String(row?.label ?? "").trim() || defaultSlotLabel(slot);
    const long = String(row?.long_label ?? "").trim();
    const button = entityNumber(row?.button);
    const favorite = Boolean(row?.favorite);
    const held = favorite || button !== null;
    const activities = held && Array.isArray(row?.activities) ? [...new Set(row!.activities!.map(entityNumber).filter((n): n is number => n !== null))].sort((a, b) => a - b) : [];
    slots.push({
      label,
      longLabel: long && long !== `${label} Long` ? long : null,
      favorite,
      button,
      longPress: Boolean(row?.long_press) && button !== null,
      activities,
      inputActivityId: entityNumber(row?.input_activity_id),
    });
  }
  const inputs = (Array.isArray(spec?.input_slots) ? spec!.input_slots : []).map(slotNumber).filter((n): n is number => n !== null);
  return {
    name: String(spec?.name ?? ""),
    slots,
    powerOn: slotNumber(spec?.power_on_slot),
    powerOff: slotNumber(spec?.power_off_slot),
    inputs: [...new Set(inputs)].sort((a, b) => a - b),
  };
}

/** The whole spec `PUT /wifi-devices/{key}` takes; an omitted field would be cleared, so nothing is omitted. */
export function specFromDraft(draft: WifiDraft): Omit<WifiDeviceSpec, "brand"> {
  return {
    name: draft.name.trim(),
    slots: draft.slots.map((slot): WifiSlot => {
      const held = slot.favorite || slot.button !== null;
      return {
        label: slot.label,
        long_label: slot.longLabel,
        favorite: slot.favorite,
        button: slot.button,
        long_press: slot.longPress && slot.button !== null,
        // A list left over from an earlier choice never travels (the card's issue #258 rule, the library's too).
        activities: held ? [...slot.activities].sort((a, b) => a - b) : [],
        input_activity_id: slot.inputActivityId,
      };
    }),
    power_on_slot: draft.powerOn,
    power_off_slot: draft.powerOff,
    input_slots: [...draft.inputs],
  };
}

export function draftsEqual(a: WifiDraft | null, b: WifiDraft | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The slot has somewhere to go: a favorite or a button (with their activities), a power role or an input. */
export function slotHasRole(draft: WifiDraft, index: number): boolean {
  const slot = draft.slots[index];
  const number = index + 1;
  return Boolean(slot) && (slot.favorite || slot.button !== null || slot.inputActivityId !== null || draft.powerOn === number || draft.powerOff === number || draft.inputs.includes(number));
}

/** A slot someone named or gave a role (the card's rule). `index` is 0-based, as the grid counts. */
export function isSlotConfigured(draft: WifiDraft, index: number): boolean {
  const slot = draft.slots[index];
  return Boolean(slot) && (slot.label !== defaultSlotLabel(index + 1) || slotHasRole(draft, index));
}

export function configuredCount(draft: WifiDraft): number {
  return draft.slots.filter((_slot, index) => isSlotConfigured(draft, index)).length;
}

/** The power lines and the input switch exist on X1S and X2; the X1 firmware ignores them. */
export function supportsPowerInput(hubVersion: string | null | undefined): boolean {
  return supportsUnicodeNames(hubVersion);
}

/** The card's `_sanitizeCommandName`: what the hub can store, 20 wide. */
export function sanitizeWifiName(hubVersion: string | null | undefined, value: unknown): string {
  const pattern = supportsUnicodeNames(hubVersion) ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu : /[^A-Za-z0-9 ]+/g;
  return String(value ?? "").replace(pattern, "").slice(0, WIFI_NAME_MAX);
}

/** Why a name cannot be saved, or null. `leadingSpace` is the card's message. */
export function nameProblem(value: string, messages: { required: string; leadingSpace: string }): string | null {
  if (!value.trim()) return messages.required;
  if (value.startsWith(" ")) return messages.leadingSpace;
  return null;
}

/** Rename a slot. A long label that only followed the old name keeps following. */
export function withSlotLabel(draft: WifiDraft, index: number, label: string): WifiDraft {
  return { ...draft, slots: draft.slots.map((slot, i) => (i === index ? { ...slot, label } : slot)) };
}

/** Point a power line at a slot (null clears it). A slot is a power command or an input, never both (the card's and the library's rule). */
export function withPowerSlot(draft: WifiDraft, kind: "on" | "off", slot: number | null): WifiDraft {
  const next: WifiDraft = { ...draft, [kind === "on" ? "powerOn" : "powerOff"]: slot };
  if (slot !== null) {
    next.inputs = draft.inputs.filter((n) => n !== slot);
    next.slots = draft.slots.map((row, i) => (i === slot - 1 && row.inputActivityId !== null ? { ...row, inputActivityId: null } : row));
  }
  return next;
}

/** The favorite and the button need an activity to apply in. */
export function activitiesEnabled(slot: Pick<WifiDraftSlot, "favorite" | "button">): boolean {
  return slot.favorite || slot.button !== null;
}

/** What the slot dialog edits; `input` is the card's "perform this command when an activity starts" switch. */
export interface SlotEdit {
  label: string;
  favorite: boolean;
  button: number | null;
  longPress: boolean;
  activities: number[];
  inputActivityId: number | null;
}

export function slotEditFrom(draft: WifiDraft, index: number): SlotEdit {
  const slot = draft.slots[index];
  return {
    label: isSlotConfigured(draft, index) && slot.label !== defaultSlotLabel(index + 1) ? slot.label : "",
    favorite: slot.favorite,
    button: slot.button,
    longPress: slot.longPress,
    activities: [...slot.activities],
    inputActivityId: slot.inputActivityId,
  };
}

/** The card's `_ensureDefaultAssignedActivity`: a favorite or a button with no activity takes the first one. */
export function withDefaultActivity(edit: SlotEdit, activityIds: number[]): SlotEdit {
  if (!activitiesEnabled(edit) || edit.activities.length || !activityIds.length) return edit;
  return { ...edit, activities: [activityIds[0]] };
}

/** The card's chip toggle: the last selected activity stays selected. */
export function withActivityToggled(edit: SlotEdit, activityId: number): SlotEdit {
  if (!activitiesEnabled(edit)) return edit;
  const has = edit.activities.includes(activityId);
  if (has && edit.activities.length > 1) return { ...edit, activities: edit.activities.filter((id) => id !== activityId) };
  return has ? edit : { ...edit, activities: [...edit.activities, activityId].sort((a, b) => a - b) };
}

/** The card's save (`_saveActiveCommandModal`): a button belongs to one slot and an
 *  activity has one input, so the saved slot takes them from its neighbours; an
 *  input is never a power command. */
export function withSlotSaved(draft: WifiDraft, index: number, edit: SlotEdit, options: { powerInput: boolean }): WifiDraft {
  const number = index + 1;
  const button = edit.button;
  const held = edit.favorite || button !== null;
  const inputActivityId = options.powerInput ? edit.inputActivityId : draft.slots[index].inputActivityId;
  const slots = draft.slots.map((slot, i): WifiDraftSlot => {
    if (i === index) {
      return { ...slot, label: edit.label.trim(), favorite: edit.favorite, button, longPress: edit.longPress && button !== null, activities: held ? [...edit.activities].sort((a, b) => a - b) : [], inputActivityId };
    }
    let next = slot;
    if (button !== null && slot.button === button) next = { ...next, button: null, longPress: false, activities: next.favorite ? next.activities : [] };
    if (inputActivityId !== null && slot.inputActivityId === inputActivityId) next = { ...next, inputActivityId: null };
    return next;
  });
  const isInput = inputActivityId !== null;
  return {
    ...draft,
    slots,
    powerOn: isInput && draft.powerOn === number ? null : draft.powerOn,
    powerOff: isInput && draft.powerOff === number ? null : draft.powerOff,
  };
}

/** The slot of this draft that holds `button` besides `index`, or that is `activityId`'s input; -1 for none. */
export function slotHoldingButton(draft: WifiDraft, button: number | null, index: number): number {
  return button === null ? -1 : draft.slots.findIndex((slot, i) => i !== index && slot.button === button);
}

export function slotHoldingInput(draft: WifiDraft, activityId: number | null, index: number): number {
  return activityId === null ? -1 : draft.slots.findIndex((slot, i) => i !== index && slot.inputActivityId === activityId);
}

/** Another of the hub's Wifi Devices whose stored spec claims `button` (the card clears it there on save). */
export function otherDeviceHoldingButton(devices: WifiDeviceView[], key: string, button: number | null): { device: WifiDeviceView; slotLabel: string } | null {
  if (button === null) return null;
  for (const device of devices) {
    if (device.key === key) continue;
    const row = (device.spec.slots ?? []).find((slot) => Number(slot.button) === button);
    if (row) return { device, slotLabel: row.label };
  }
  return null;
}

/** The specs to write after a sync so no other Wifi Device keeps claiming a button this draft took:
 *  left alone, that device's next sync would take the button back. */
export function buttonCleanups(devices: WifiDeviceView[], key: string, draft: WifiDraft): { device: WifiDeviceView; spec: Omit<WifiDeviceSpec, "brand"> }[] {
  const taken = new Set(draft.slots.map((slot) => slot.button).filter((b): b is number => b !== null));
  const out: { device: WifiDeviceView; spec: Omit<WifiDeviceSpec, "brand"> }[] = [];
  for (const device of devices) {
    if (device.key === key || device.stale || device.device_id == null) continue;
    const theirs = draftFromSpec(device.spec);
    if (!theirs.slots.some((slot) => slot.button !== null && taken.has(slot.button))) continue;
    const cleared: WifiDraft = { ...theirs, slots: theirs.slots.map((slot) => (slot.button !== null && taken.has(slot.button) ? { ...slot, button: null, longPress: false, activities: slot.favorite ? slot.activities : [] } : slot)) };
    out.push({ device, spec: specFromDraft(cleared) });
  }
  return out;
}

/** The card's Clear: back to an unnamed slot with no role. */
export function withSlotCleared(draft: WifiDraft, index: number): WifiDraft {
  const slot = index + 1;
  return {
    ...draft,
    slots: draft.slots.map((row, i) => (i === index ? emptySlot(slot) : row)),
    powerOn: draft.powerOn === slot ? null : draft.powerOn,
    powerOff: draft.powerOff === slot ? null : draft.powerOff,
    inputs: draft.inputs.filter((n) => n !== slot),
  };
}

// -- hard buttons (the card's HARD_BUTTON_ID_MAP and its groups) -------------------------------------

export interface HardButton {
  /** The card's key name; also the key of its `keyLabels` string. */
  name: string;
  code: number;
  group: "navigation" | "transport" | "media" | "abc" | "color";
  x2Only: boolean;
}

const hb = (name: string, code: number, group: HardButton["group"], x2Only = false): HardButton => ({ name, code, group, x2Only });

/** In the card's menu order. */
export const HARD_BUTTONS: readonly HardButton[] = [
  hb("up", 174, "navigation"), hb("down", 178, "navigation"), hb("left", 175, "navigation"), hb("right", 177, "navigation"),
  hb("ok", 176, "navigation"), hb("back", 179, "navigation"), hb("home", 180, "navigation"), hb("menu", 181, "navigation"),
  hb("volup", 182, "transport"), hb("voldn", 185, "transport"), hb("mute", 184, "transport"), hb("chup", 183, "transport"), hb("chdn", 186, "transport"),
  hb("play", 156, "media", true), hb("pause", 188, "media"), hb("rew", 187, "media"), hb("fwd", 189, "media"),
  hb("guide", 157, "media", true), hb("dvr", 155, "media", true), hb("exit", 154, "media", true),
  hb("a", 153, "abc", true), hb("b", 152, "abc", true), hb("c", 151, "abc", true),
  hb("red", 190, "color"), hb("green", 191, "color"), hb("yellow", 192, "color"), hb("blue", 193, "color"),
];

export function hardButtonByCode(code: number | null | undefined): HardButton | null {
  return code == null ? null : HARD_BUTTONS.find((button) => button.code === Number(code)) ?? null;
}

/** The buttons this hub's remote has: the X2's extra keys only on an X2. */
export function availableHardButtons(hubVersion: string | null | undefined): HardButton[] {
  const x2 = String(hubVersion ?? "").toUpperCase().includes("X2");
  return HARD_BUTTONS.filter((button) => x2 || !button.x2Only);
}

// -- the tile's meta line (the card's `_commandSlotMetaLabel`) ---------------------------------------

export type SlotMeta =
  | { kind: "unconfigured" }
  | { kind: "power"; on: boolean; off: boolean }
  | { kind: "input"; activityId: number | null }
  | { kind: "activities"; count: number };

export function slotMeta(draft: WifiDraft, index: number, options: { powerInput: boolean }): SlotMeta {
  const slot = draft.slots[index];
  const number = index + 1;
  if (!slotHasRole(draft, index)) return { kind: "unconfigured" };
  if (options.powerInput && !activitiesEnabled(slot)) {
    const on = draft.powerOn === number;
    const off = draft.powerOff === number;
    if (on || off) return { kind: "power", on, off };
    if (slot.inputActivityId !== null || draft.inputs.includes(number)) return { kind: "input", activityId: slot.inputActivityId };
  }
  return { kind: "activities", count: activitiesEnabled(slot) ? slot.activities.length : 0 };
}

// -- the roster ------------------------------------------------------------------------------------

export type StatusTone = "sync-ok" | "sync-error" | "sync-pending" | "sync-running";

export interface DeviceStatus {
  tone: StatusTone;
  label: string;
}

export function deviceStatus(device: WifiDeviceView, options: { deleting?: boolean } = {}): DeviceStatus {
  if (options.deleting) return { tone: "sync-running", label: "Deleting…" };
  if (device.stale) return { tone: "sync-error", label: "Missing from hub" };
  if (device.pending || device.device_id == null) return { tone: "sync-pending", label: "Pending" };
  return { tone: "sync-ok", label: "Synced" };
}

/** True when the device calls an address the server no longer answers on (a deployed address never moves in place). */
export function targetMoved(device: WifiDeviceView): boolean {
  const now = device.effective_destination;
  // An mqtt device calls no address, so none can have moved.
  if (!now || !device.target || device.device_id == null) return false;
  return now.host !== device.target.host || Number(now.port) !== Number(device.target.port);
}

/** Why an mqtt device's presses cannot arrive right now, or null. The broker is the operator's to
 *  set up (the server's command line, the Sofabaton app); the panel only says what it sees. */
export function mqttProblem(device: Pick<WifiDeviceView, "transport">, mqtt: { configured: boolean; connected: boolean; host: string | null; port: number | null; last_error: string | null } | null): string | null {
  if (device.transport !== "mqtt" || !mqtt) return null;
  if (!mqtt.configured) return "This device delivers its presses over MQTT, but the server has no broker (set one under Server settings > MQTT broker, or start it with --mqtt-host), so they cannot arrive.";
  if (!mqtt.connected) return `The server is not connected to the MQTT broker at ${mqtt.host}:${mqtt.port}${mqtt.last_error ? ` (${mqtt.last_error})` : ""}, so presses cannot arrive. It keeps trying.`;
  return null;
}

// -- the press glow ----------------------------------------------------------------------------------

/** The press still glows at `now` (the store stamps `at` with its own clock). */
export function pressIsFresh(press: PressEvent | null | undefined, now: number): press is PressEvent {
  if (!press) return false;
  const elapsed = now - press.at;
  return elapsed >= 0 && elapsed < PRESS_FLASH_MS;
}

/** The press belongs to this device: by key when the server sent one, by hub device id otherwise. */
export function pressMatchesDevice(press: PressEvent, device: Pick<WifiDeviceView, "key" | "device_id">): boolean {
  if (press.deviceKey) return press.deviceKey === device.key;
  return press.deviceId != null && device.device_id != null && press.deviceId === device.device_id;
}

/** ... and to this slot (0-based); a long press lights its short twin's tile. */
export function pressMatchesSlot(press: PressEvent, device: Pick<WifiDeviceView, "key" | "device_id">, index: number): boolean {
  return pressMatchesDevice(press, device) && press.slot === index + 1;
}

import test from "node:test";
import assert from "node:assert/strict";
import { nothing } from "lit";
import "../../custom_components/sofabaton_x1s/www/src/tabs/edit-detail-view";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";
import {
  forgetIrEmitterReads,
  irEmitterLastRead,
  irEmitterReadError,
  loadIrEmitterLastRead,
} from "../../custom_components/sofabaton_x1s/www/src/components/ir-emitter-pill";
import { renderCacheTab } from "../../custom_components/sofabaton_x1s/www/src/tabs/cache-tab";
import { decodeEmitters, withRepeater } from "../../remote-card/src/ir-emitters/emitter-routing";

// The IR pill in the Hub editor's device header (docs/internal/ir-emitter-pill-plan.md, IR3).

const EditDetailViewElement = customElements.get("sofabaton-edit-detail-view") as { new (): HTMLElement };
type EditorElement = HTMLElement & Record<string, any>;
const S = TOOLS_CARD_STRINGS.irEmitters;

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const value = template as { strings?: unknown[]; values?: unknown[] };
    return templateText(value.strings ?? []) + templateText(value.values ?? []);
  }
  return "";
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const PAIRED = [
  { kind: "remote", number: 1, name: "X2 Remote", online: true, port_cable: null },
  { kind: "repeater", number: 1, name: "Cabinet", online: true, port_cable: true },
  { kind: "repeater", number: 2, name: "Bedroom", online: false, port_cable: null },
];

function x2Bundle(extras: { a: number; b: number; c: number } | null = { a: 0, b: 0, c: 7 }, version = "X2"): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living Room", version },
    devices: [
      { device: { device_id: 1, name: "Television", device_class: "ir", extras }, commands: [{ command_id: 10, name: "Power" }] },
      { device: { device_id: 2, name: "Roku", device_class: "wifi_roku", extras }, commands: [] },
    ],
    activities: [],
  } as unknown as BackupBundlePayload;
}

interface Harness {
  element: EditorElement;
  calls: Array<Record<string, unknown>>;
  busy: Array<[boolean, string | null]>;
  changes: BackupBundlePayload[];
  host: Record<string, any>;
  setLocked(on: boolean): void;
}

function irEditor(options: { bundle?: BackupBundlePayload; status?: (msg: Record<string, unknown>) => unknown } = {}): Harness {
  forgetIrEmitterReads();
  const element = new EditDetailViewElement() as EditorElement;
  const bundle = options.bundle ?? x2Bundle();
  const baseline = structuredClone(bundle);
  element.bundle = bundle;
  element.kind = "device";
  element.entityId = 1;
  element.mode = "live";
  const calls: Array<Record<string, unknown>> = [];
  const busy: Array<[boolean, string | null]> = [];
  let locked = false;
  const hass = {
    states: {},
    callWS: async (msg: Record<string, unknown>) => {
      calls.push(msg);
      if (options.status) return options.status(msg);
      return msg.refresh
        ? { available: true, paired: PAIRED, read_at: 1000 }
        : { available: true, paired: null, read_at: null };
    },
  };
  const host = {
    hass: () => hass as any,
    hubEntryId: () => "entry-x2",
    baselineExtras: (deviceId: number) => {
      const block = (baseline.devices ?? []).find((entry) => entry.device?.device_id === deviceId)?.device as any;
      return block?.extras ?? null;
    },
    locked: () => locked,
    setBusy: (on: boolean, label: string | null) => { busy.push([on, label]); },
  };
  element.irEmitters = host;
  const changes: BackupBundlePayload[] = [];
  element.addEventListener("bundle-change", (event) => {
    changes.push((event as CustomEvent<{ bundle: BackupBundlePayload }>).detail.bundle);
  });
  return { element, calls, busy, changes, host, setLocked: (on) => { locked = on; } };
}

test("an X2 IR device carries the IR pill in the live editor; at rest only the last read is asked for", async () => {
  const { element, calls } = irEditor();
  const text = templateText(element._renderIrPill("device"));
  assert.match(text, /class="ir-pill/);
  assert.ok(text.includes(S.pill));
  assert.doesNotMatch(text, /ir-pop/);
  await flush();
  // Home Assistant's kept read, no hub exchange.
  assert.deepEqual(calls.map((msg) => [msg.type, msg.entry_id, msg.refresh]), [["sofabaton_x1s/ir_emitters/status", "entry-x2", false]]);
  // A second render asks nothing more.
  element._renderIrPill("device");
  await flush();
  assert.equal(calls.length, 1);
});

test("no IR pill off the X2, in the Backup editor, without the host, on a Wifi device or without the routing block", () => {
  const x1s = irEditor({ bundle: x2Bundle({ a: 0, b: 0, c: 7 }, "X1S") });
  assert.equal(x1s.element._renderIrPill("device"), nothing);
  const backup = irEditor();
  backup.element.mode = "backup";
  assert.equal(backup.element._renderIrPill("device"), nothing);
  const hostless = irEditor();
  hostless.element.irEmitters = null;
  assert.equal(hostless.element._renderIrPill("device"), nothing);
  const wifi = irEditor();
  wifi.element.entityId = 2;
  assert.equal(wifi.element._renderIrPill("device"), nothing);
  const bare = irEditor({ bundle: x2Bundle(null) });
  assert.equal(bare.element._renderIrPill("device"), nothing);
  const activity = irEditor();
  assert.equal(activity.element._renderIrPill("activity"), nothing);
});

test("opening reads the paired list with refresh, holds the hub lock while it runs, and keeps the read for the hub", async () => {
  const { element, calls, busy } = irEditor();
  element._renderIrPill("device");
  await flush();
  element._irPill.open = true;
  const reading = element._irPill.refresh();
  assert.equal(element._irPill.checking, true);
  assert.ok(templateText(element._renderIrPill("device")).includes(S.checking));
  await reading;
  assert.equal(element._irPill.checking, false);
  assert.deepEqual(calls.at(-1), { type: "sofabaton_x1s/ir_emitters/status", entry_id: "entry-x2", refresh: true });
  assert.deepEqual(busy, [[true, S.checking], [false, null]]);
  assert.deepEqual(irEmitterLastRead("entry-x2")?.paired?.map((row) => row.name), ["X2 Remote", "Cabinet", "Bedroom"]);
  const open = templateText(element._renderIrPill("device"));
  assert.ok(open.includes("Cabinet") && open.includes("Bedroom") && open.includes("X2 Remote"));
  assert.doesNotMatch(open, /attention/);
});

test("a pick is a pending edit of device.extras, and Undo restores the hub's bytes", async () => {
  const { element, changes } = irEditor();
  const baselineJson = JSON.stringify(element.bundle);
  element._renderIrPill("device");
  await flush();
  // Tick the offline repeater: a pending edit that turns the pill amber once the read lists it offline.
  const pill = () => element._irPill;
  await pill().refresh();
  element._setDeviceEmitters(1, withRepeater(decodeEmitters(0, 0, 7), 2, "all"), decodeEmitters(0, 0, 7), { a: 0, b: 0, c: 7 });
  assert.equal(changes.length, 1);
  assert.deepEqual((changes[0].devices[0].device as any).extras, { a: 0, b: 0b1100, c: 7 });
  const text = templateText(element._renderIrPill("device"));
  assert.match(text, /pending/);
  assert.match(text, /attention/);
  assert.ok(pill().attention());
  // Undo: the hub's own block again, so the whole bundle compares equal.
  element._setDeviceEmitters(1, decodeEmitters(0, 0, 7), decodeEmitters(0, 0, 7), { a: 0, b: 0, c: 7 });
  assert.equal(JSON.stringify(changes.at(-1)), baselineJson);
  assert.doesNotMatch(templateText(element._renderIrPill("device")), /pending/);
});

test("a refused read says why inside the dropdown and keeps the last rows; a locked hub is not asked", async () => {
  const refused = irEditor({
    status: (msg) => {
      if (msg.refresh) return Promise.reject({ code: "busy", message: "busy" });
      return { available: true, paired: PAIRED, read_at: 900 };
    },
  });
  refused.element._renderIrPill("device");
  await flush();
  refused.element._irPill.open = true;
  await refused.element._irPill.refresh();
  assert.equal(refused.element._irPill.error, "busy");
  const text = templateText(refused.element._renderIrPill("device"));
  assert.ok(text.includes(S.readBusy));
  assert.ok(text.includes(S.readKept));
  assert.ok(text.includes("Cabinet"));
  // The last read survived the refusal.
  assert.equal(irEmitterLastRead("entry-x2")?.readAt, 900);

  const locked = irEditor();
  locked.element._renderIrPill("device");
  await flush();
  locked.setLocked(true);
  // The host re-renders when its lock changes; the pill follows that render.
  locked.element._renderIrPill("device");
  await locked.element._irPill.refresh();
  assert.equal(locked.calls.filter((msg) => msg.refresh).length, 0);
  assert.equal(locked.element._irPill.error, "busy");
  assert.deepEqual(locked.busy, []);
});

test("read errors are worded by code", () => {
  assert.equal(irEmitterReadError("busy"), S.readBusy);
  assert.equal(irEmitterReadError("sync_in_progress"), S.readBusy);
  assert.equal(irEmitterReadError("unavailable"), S.readUnavailable);
  assert.equal(irEmitterReadError("no_answer"), S.readNoAnswer);
  assert.equal(irEmitterReadError("not_found"), S.readFailed);
});

test("the last read is asked for once per hub, and a refusal (not an X2) is remembered as none", async () => {
  forgetIrEmitterReads();
  let count = 0;
  const hass = { states: {}, callWS: async () => { count++; throw { code: "not_supported" }; } } as any;
  await Promise.all([loadIrEmitterLastRead(hass, "entry-x1s"), loadIrEmitterLastRead(hass, "entry-x1s")]);
  await loadIrEmitterLastRead(hass, "entry-x1s");
  assert.equal(count, 1);
  assert.deepEqual(irEmitterLastRead("entry-x1s"), { paired: null, readAt: null });
});

function cacheTab(irEmitterPaired: unknown, rows: Array<Record<string, unknown>>) {
  const noop = () => {};
  return templateText(renderCacheTab({
    loading: false, error: null,
    hub: { entry_id: "entry-x2", name: "Living Room", activities: [], devices_list: rows } as any,
    persistentCacheEnabled: true, refreshBusy: false, hubCommandBusy: false, activeRefreshLabel: null,
    selectedSection: "devices", openEntity: null, selectedHubProxyConnected: false, enablingPersistentCache: false,
    onEnablePersistentCache: noop, onSelectSection: noop, onToggleEntity: noop, clickAction: "none", onItemClick: noop,
    onRefreshEntry: noop, refreshAllSpinning: false, onRefreshAll: noop, onEditActivity: noop, onEditDevice: noop,
    reorderMode: false, reorderKind: "device", reorderIds: [], reorderSyncing: false, reorderError: null,
    onStartReorder: noop, onCancelReorder: noop, onReorderMove: noop, onSyncReorder: noop,
    addActivityOpen: false, addActivityBusy: false, addActivityError: null, onOpenAddActivity: noop, onCloseAddActivity: noop, onConfirmAddActivity: noop,
    addDeviceOpen: false, addDeviceBusy: false, addDeviceError: null, addDeviceClasses: [], hubVersion: "X2", addDeviceClass: "",
    onOpenAddDevice: noop, onCloseAddDevice: noop, onSelectAddDeviceClass: noop, onConfirmAddDevice: noop,
    addAppearance: { icon: null, colorId: null, open: false, tab: "icon" }, onAddAppearanceChange: noop,
    irEmitterPaired: irEmitterPaired as any,
  }));
}

test("a device row gets the read-only amber IR pill only when its routing needs attention", () => {
  const rows = [
    { id: 1, name: "Television", command_count: 1, device_class: "ir", emitters: [0, 0, 7] },
    { id: 2, name: "Soundbar", command_count: 1, device_class: "ir", emitters: [0, 0b1100, 0] },
  ];
  const amber = cacheTab(PAIRED, rows);
  assert.equal(amber.split("ir-pill ir-pill--ro").length - 1, 1);
  assert.ok(amber.includes(S.rowAttention));
  // No read yet: plain rows, no pill at all.
  assert.equal(cacheTab(null, rows).split("ir-pill").length - 1, 0);
  // All fine: no pill (most devices are IR).
  assert.equal(cacheTab(PAIRED, [rows[0]]).split("ir-pill").length - 1, 0);
  // Not an IR device: never.
  assert.equal(cacheTab(PAIRED, [{ ...rows[1], device_class: "bluetooth" }]).split("ir-pill").length - 1, 0);
});

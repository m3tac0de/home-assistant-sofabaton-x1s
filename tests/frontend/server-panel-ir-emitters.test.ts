// The server panel's IR pill (IR emitter pill plan, IR5): the read route,
// the last read per hub, refused reads worded with the card's lines, the
// device editor's pill (a pick edits device.extras in the working copy) and
// the catalog's read-only amber pill.

import assert from "node:assert/strict";
import test from "node:test";
import { nothing } from "lit";

import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { PanelApi } from "../../server-panel/src/panel-api";
import {
  forgetIrEmitterReads,
  irEmitterLastRead,
  irEmitterReadProblem,
  loadIrEmitterLastRead,
  readIrEmitters,
} from "../../server-panel/src/components/ir-emitter-pill";
import { SbPanelDeviceEditor, defineDeviceEditor } from "../../server-panel/src/views/device-editor";
import { SbPanelCatalog, defineCatalogView } from "../../server-panel/src/views/catalog-view";
import { decodeEmitters, withHub, withRepeater } from "../../remote-card/src/ir-emitters/emitter-routing";

const S = TOOLS_CARD_STRINGS.irEmitters;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PAIRED = [
  { kind: "remote", number: 1, name: "X2 Remote", online: true, port_cable: null },
  { kind: "repeater", number: 1, name: "Cabinet", online: true, port_cable: true },
  { kind: "repeater", number: 2, name: "Bedroom", online: false, port_cable: null },
];

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const value = template as { strings?: unknown[]; values?: unknown[] };
    return templateText(value.strings ?? []) + templateText(value.values ?? []);
  }
  return "";
}

/** A PanelApi on a fake fetch: `routes` answers by "METHOD /path?query". */
function fakeApi(routes: Record<string, (() => { status: number; body: unknown }) | undefined>) {
  const calls: string[] = [];
  const api = new PanelApi("http://host", async (url: string, init?: RequestInit) => {
    const route = `${init?.method ?? "GET"} ${url.slice("http://host/api/v1".length)}`;
    calls.push(route);
    const answer = routes[route]?.() ?? { status: 404, body: { type: "not_found", title: "Not found", status: 404 } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return { api, calls };
}

test("the read route: refresh=false is the server's last read, asked for once per hub; refresh=true reads the hub", async () => {
  forgetIrEmitterReads();
  const { api, calls } = fakeApi({
    "GET /hubs/x2/ir-emitters?refresh=false": () => ({ status: 200, body: { paired: PAIRED, read_at: 100 } }),
    "GET /hubs/x2/ir-emitters?refresh=true": () => ({ status: 200, body: { paired: PAIRED.slice(0, 2), read_at: 200 } }),
    "GET /hubs/x1s/ir-emitters?refresh=false": () => ({ status: 409, body: { type: "not_x2", title: "IR emitter routing exists on the X2 only", status: 409 } }),
  });
  await Promise.all([loadIrEmitterLastRead(api, "x2"), loadIrEmitterLastRead(api, "x2")]);
  await loadIrEmitterLastRead(api, "x2");
  assert.deepEqual(calls, ["GET /hubs/x2/ir-emitters?refresh=false"]);
  assert.equal(irEmitterLastRead("x2")?.paired?.length, 3);
  // Not an X2: nothing to warn from, remembered.
  await loadIrEmitterLastRead(api, "x1s");
  await loadIrEmitterLastRead(api, "x1s");
  assert.deepEqual(irEmitterLastRead("x1s"), { paired: null, readAt: null });
  assert.equal(calls.filter((call) => call.startsWith("GET /hubs/x1s")).length, 1);
  // The dropdown's read replaces the last one.
  const { read, error } = await readIrEmitters(api, "x2");
  assert.equal(error, null);
  assert.equal(read?.readAt, 200);
  assert.deepEqual(irEmitterLastRead("x2")?.paired?.map((row) => row.name), ["X2 Remote", "Cabinet"]);
});

test("a refused or unanswered read says why with the card's lines and keeps the last read", async () => {
  forgetIrEmitterReads();
  let answer: { status: number; body: unknown } = { status: 200, body: { paired: PAIRED, read_at: 100 } };
  const { api } = fakeApi({
    "GET /hubs/x2/ir-emitters?refresh=false": () => ({ status: 200, body: { paired: PAIRED, read_at: 100 } }),
    "GET /hubs/x2/ir-emitters?refresh=true": () => answer,
  });
  await loadIrEmitterLastRead(api, "x2");
  answer = { status: 200, body: { paired: null, read_at: null } };
  assert.equal((await readIrEmitters(api, "x2")).error, S.readNoAnswer);
  answer = { status: 409, body: { type: "hub_busy", title: "An app client holds the hub", status: 409 } };
  assert.equal((await readIrEmitters(api, "x2")).error, S.readUnavailable);
  answer = { status: 409, body: { type: "hub_job_running", title: "A job is running", status: 409 } };
  assert.equal((await readIrEmitters(api, "x2")).error, S.readBusy);
  answer = { status: 504, body: { type: "hub_timeout", title: "The hub did not answer", status: 504 } };
  assert.equal((await readIrEmitters(api, "x2")).error, S.readNoAnswer);
  assert.equal(irEmitterReadProblem({ ok: false, status: 500, statusText: "", headers: [], text: "", body: null }), S.readFailed);
  assert.equal(irEmitterLastRead("x2")?.readAt, 100, "the last read survives every refusal");
});

function x2Bundle(extras: { a: number; b: number; c: number } | null, version = "X2"): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living", version },
    devices: [{ kind: "device_backup", complete: true, device: { device_id: 1, name: "TV", device_class: "ir", extras }, commands: [], button_bindings: [], macros: [] }],
    activities: [],
  } as unknown as BackupBundlePayload;
}

function irDeviceEditor(options: { version?: string; extras?: { a: number; b: number; c: number } | null; offline?: boolean } = {}) {
  defineDeviceEditor();
  forgetIrEmitterReads();
  const version = options.version ?? "X2";
  const bundle = x2Bundle(options.extras === undefined ? { a: 0, b: 0, c: 7 } : options.extras, version);
  const { api, calls } = fakeApi({
    "GET /hubs/h/ir-emitters?refresh=false": () => ({ status: 200, body: { paired: PAIRED, read_at: 100 } }),
    "GET /hubs/h/ir-emitters?refresh=true": () => ({ status: 200, body: { paired: PAIRED, read_at: 200 } }),
  });
  const drafts: unknown[] = [];
  const editor = new SbPanelDeviceEditor() as unknown as Loose;
  editor.api = api;
  editor.store = { setDraft: (_hub: string, draft: unknown) => drafts.push(draft), discardDraft: () => drafts.push(null), noteResponse: () => false };
  editor.deviceId = 1;
  editor.ctx = { hub: { hub_id: "h", status: { hub_version: version } }, runtime: {}, gate: "pass", busy: null, interaction: { kind: "free" }, free: true, api };
  if (options.offline) editor.offlineBundle = bundle;
  editor._snapshot = { snapshot_id: "s1" };
  editor._stage = "editing";
  editor._baseline = bundle;
  editor._working = structuredClone(bundle);
  return { editor, calls, drafts };
}

test("the device editor shows the IR pill on an X2 IR device only, and its pick edits device.extras in the working copy", async () => {
  const { editor, calls, drafts } = irDeviceEditor();
  const text = templateText(editor._renderIrPill());
  assert.match(text, /id="[^"]*-ir-pill"/);
  assert.ok(text.includes(S.pill));
  editor._irOpen = true;
  const open = templateText(editor._renderIrPill());
  assert.match(open, /Command tests and raw IR playback/);
  assert.doesNotMatch(open, /Home Assistant/);
  editor._irOpen = false;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["GET /hubs/h/ir-emitters?refresh=false"]);
  // Tick the offline repeater: a working-copy edit (the draft slot follows), amber.
  editor._setIrRouting(withRepeater(decodeEmitters(0, 0, 7), 2, "all"));
  assert.deepEqual(editor._working.devices[0].device.extras, { a: 0, b: 0b1100, c: 7 });
  assert.equal(editor._dirty, true);
  assert.ok(drafts.length >= 1 && drafts.at(-1) !== null);
  const amber = templateText(editor._renderIrPill());
  assert.match(amber, /attention/);
  assert.match(amber, /pending/);
  // Undo: the hub's own block again; the element is clean.
  editor._setIrRouting(decodeEmitters(0, 0, 7));
  assert.equal(editor._dirty, false);
  assert.equal(drafts.at(-1), null);
  // A hub choice is just the bytes.
  editor._setIrRouting(withHub(decodeEmitters(0, 0, 7), "port1"));
  assert.deepEqual(editor._working.devices[0].device.extras, { a: 0, b: 0, c: 2 });
  // The read on open (here called directly; the trigger measures a real element).
  await editor._readIr();
  assert.deepEqual(calls.at(-1), "GET /hubs/h/ir-emitters?refresh=true");
  assert.equal(editor._irError, null);
  assert.equal(editor._irChecking, false);
});

test("no IR pill off the X2, offline, without the routing block, or on another class; a busy hub is not read", async () => {
  assert.equal(irDeviceEditor({ version: "X1S" }).editor._renderIrPill(), nothing);
  assert.equal(irDeviceEditor({ offline: true }).editor._renderIrPill(), nothing);
  assert.equal(irDeviceEditor({ extras: null }).editor._renderIrPill(), nothing);
  const bluetooth = irDeviceEditor();
  bluetooth.editor._working.devices[0].device.device_class = "bluetooth";
  assert.equal(bluetooth.editor._renderIrPill(), nothing);
  const busy = irDeviceEditor();
  busy.editor.ctx = { ...busy.editor.ctx, free: false };
  await busy.editor._readIr();
  assert.equal(busy.editor._irError, S.readBusy);
  assert.equal(busy.calls.filter((call: string) => call.includes("refresh=true")).length, 0);
});

test("a catalog row shows the read-only amber IR pill only when its routing needs attention", async () => {
  defineCatalogView();
  forgetIrEmitterReads();
  const { api } = fakeApi({ "GET /hubs/h/ir-emitters?refresh=false": () => ({ status: 200, body: { paired: PAIRED, read_at: 100 } }) });
  await loadIrEmitterLastRead(api, "h");
  const catalog = new SbPanelCatalog() as unknown as Loose;
  catalog.hub = { hub_id: "h", status: { hub_version: "X2" } };
  const entry = (emitters: unknown, deviceClass = "ir") => ({ kind: "device", id: 1, name: "TV", device: { device_id: 1, name: "TV", device_class: deviceClass, emitters }, activity: null, fetched_at: null, complete: true, counts: null });
  const amber = templateText(catalog._renderIrRowPill(entry([0, 0b1100, 7])));
  assert.match(amber, /ir-pill ir-pill--ro/);
  assert.match(amber, /attention/);
  assert.equal(catalog._renderIrRowPill(entry([0, 0, 7])), nothing);
  assert.equal(catalog._renderIrRowPill(entry(null)), nothing);
  assert.equal(catalog._renderIrRowPill(entry([0, 0b1100, 7], "bluetooth")), nothing);
  forgetIrEmitterReads();
  assert.equal(catalog._renderIrRowPill(entry([0, 0b1100, 7])), nothing, "no read yet: plain");
});

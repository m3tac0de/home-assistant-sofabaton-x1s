import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeEmitters,
  encodeEmitters,
  extrasOfRouting,
  isEmptyRouting,
  isRemoteOnly,
  isRepeaterOnly,
  repeaterChoice,
  routingFromExtras,
  routingFromTriple,
  routingHex,
  sameRouting,
  withHub,
  withRemote,
  withRepeater,
  HUB_CHOICES,
  REPEATER_CHOICES,
  type EmitterRouting,
} from "../../remote-card/src/ir-emitters/emitter-routing";
import {
  customHubMix,
  irEmitterAttention,
  irEmitterNote,
  irEmitterProblems,
  irEmitterRowAttention,
  irEmitterRows,
  normalizePaired,
  pickedRowCount,
  pickHubEmitters,
  pickRepeaterEmitters,
  toggleEmitterRow,
  type PairedEmitter,
} from "../../remote-card/src/ir-emitters/emitter-rules";
import { renderIrEmitterBody, renderIrEmitterPill, renderReadOnlyIrPill } from "../../remote-card/src/ir-emitters/emitter-dropdown";
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";

// The TypeScript twin of lib/emitter_routing.py: the tables mirror
// tests/lib/test_emitter_routing.py so the two read the bytes alike.

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const value = template as { strings?: unknown[]; values?: unknown[] };
    return templateText(value.strings ?? []) + templateText(value.values ?? []);
  }
  return "";
}

const REMOTE: PairedEmitter = { kind: "remote", number: 1, name: "X2 Remote", online: true, port_cable: null };
const CABINET: PairedEmitter = { kind: "repeater", number: 1, name: "Cabinet", online: true, port_cable: true };
const BEDROOM: PairedEmitter = { kind: "repeater", number: 2, name: "Bedroom", online: false, port_cable: false };

// -- routing bytes (the library's tables) -------------------------------------

test("the hub choice comes from the low three bits; any other mix is custom", () => {
  const table: Array<[number, string]> = [
    [0x00, "none"], [0x01, "builtin"], [0x02, "port1"], [0x04, "port2"], [0x07, "all"],
    [0x03, "custom"], [0x06, "custom"], [0x05, "custom"],
  ];
  for (const [c, hub] of table) {
    const decoded = decodeEmitters(0, 0, c);
    assert.equal(decoded.hub, hub, `c=${c}`);
    assert.equal(decoded.hubBits, c);
  }
});

test("remotes and repeaters decode by number", () => {
  // Remotes 1 and 5; repeater 1 all, repeater 2 built-in, repeater 4 port.
  const decoded = decodeEmitters(0x00, 0b10_00_01_11, 0b1000_1000 | 0x07);
  assert.equal(decoded.hub, "all");
  assert.deepEqual(decoded.remotes, [1, 5]);
  assert.deepEqual(decoded.repeaters, [[1, "all"], [2, "builtin"], [4, "port"]]);
  assert.equal(repeaterChoice(decoded, 3), null);
  assert.equal(repeaterChoice(decoded, 4), "port");
});

test("every mask round-trips and keeps the RF byte", () => {
  for (let b = 0; b < 256; b++) {
    for (let c = 0; c < 256; c++) {
      assert.deepEqual(encodeEmitters(decodeEmitters(0xa5, b, c)), [0xa5, b, c]);
    }
  }
});

test("each choice rewrites only its own bits", () => {
  const start = decodeEmitters(0x3c, 0x00, 0x03); // custom hub mix, an RF byte
  assert.equal(start.hub, "custom");
  assert.deepEqual(encodeEmitters(withHub(start, "all")), [0x3c, 0x00, 0x07]);
  assert.deepEqual(encodeEmitters(withRemote(withHub(start, "none"), 2, true)), [0x3c, 0x00, 0x10]);
  assert.deepEqual(encodeEmitters(withRepeater(start, 3, "port")), [0x3c, 0b10_0000, 0x03]);
  assert.deepEqual(encodeEmitters(withRepeater(withRepeater(start, 3, "all"), 3, null)), [0x3c, 0x00, 0x03]);
  assert.deepEqual(encodeEmitters(withRemote(withRemote(start, 1, true), 1, false)), encodeEmitters(start));
  // Every hub and repeater choice lands on its vendor bits.
  const plain = decodeEmitters(0, 0, 0);
  assert.deepEqual(HUB_CHOICES.map((choice) => encodeEmitters(withHub(plain, choice))[2]), [0x07, 0x01, 0x02, 0x04]);
  assert.deepEqual(REPEATER_CHOICES.map((choice) => encodeEmitters(withRepeater(plain, 2, choice))[1]), [0b1100, 0b0100, 0b1000]);
  assert.deepEqual(encodeEmitters(withRemote(plain, 5, true)), [0, 0, 0x80]);
});

test("the choices refuse what the mask cannot hold", () => {
  const plain = decodeEmitters(0, 0, 1);
  assert.throws(() => withHub(plain, "custom" as never), RangeError);
  assert.throws(() => withRemote(plain, 6, true), RangeError);
  assert.throws(() => withRemote(plain, 0, true), RangeError);
  assert.throws(() => withRepeater(plain, 0, "all"), RangeError);
  assert.throws(() => withRepeater(plain, 5, "all"), RangeError);
  assert.throws(() => withRepeater(plain, 1, "both" as never), RangeError);
});

test("empty, remote only and repeater only", () => {
  assert.equal(isEmptyRouting(decodeEmitters(0xff, 0, 0)), true); // the RF byte is no emitter
  assert.equal(isEmptyRouting(decodeEmitters(0, 0, 0x01)), false);
  assert.equal(isRemoteOnly(decodeEmitters(0, 0, 0x08)), true);
  assert.equal(isRemoteOnly(decodeEmitters(0, 0x01, 0x08)), false);
  assert.equal(isRemoteOnly(decodeEmitters(0, 0, 0x09)), false);
  assert.equal(isRepeaterOnly(decodeEmitters(0, 0x01, 0x00)), true);
  assert.equal(isRepeaterOnly(decodeEmitters(0, 0x01, 0x08)), false);
});

test("the bundle and row forms are checked; the hex matches the library's", () => {
  assert.equal(routingHex(decodeEmitters(0, 0x03, 0x0f)), "00030f");
  assert.deepEqual(extrasOfRouting(decodeEmitters(0, 0x03, 0x0f)), { a: 0, b: 3, c: 15 });
  assert.deepEqual(encodeEmitters(routingFromExtras({ a: 1, b: 2, c: 3 })!), [1, 2, 3]);
  assert.deepEqual(encodeEmitters(routingFromTriple([0, 0, 7])!), [0, 0, 7]);
  for (const bad of [null, undefined, "", {}, { a: 0, b: 0 }, { a: 0, b: 0, c: 256 }, { a: -1, b: 0, c: 1 }, { a: 0, b: 0.5, c: 1 }]) {
    assert.equal(routingFromExtras(bad), null, JSON.stringify(bad));
  }
  for (const bad of [null, [], [0, 0], [0, 0, 0, 0], [0, 0, "7"], [0, 300, 1]]) {
    assert.equal(routingFromTriple(bad), null, JSON.stringify(bad));
  }
  assert.equal(sameRouting(decodeEmitters(0, 0, 7), withHub(decodeEmitters(0, 0, 3), "all")), true);
  assert.equal(sameRouting(decodeEmitters(1, 0, 7), decodeEmitters(0, 0, 7)), false);
});

// -- what the pill says ----------------------------------------------------------

test("amber only for a picked offline repeater or a picked emitter that is no longer paired", () => {
  const paired = [REMOTE, CABINET, BEDROOM];
  // Hub all: nothing, whatever is paired or offline.
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0, 0x07), paired), []);
  // Cabinet (online) picked: fine; Bedroom (offline) picked: amber.
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0b11, 0x07), paired), []);
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0b1100, 0x07), paired), [
    { kind: "offline", target: "repeater", number: 2, name: "Bedroom" },
  ]);
  // Repeater 3 and remote 2 are not paired.
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0b11_0000, 0x10), paired), [
    { kind: "unpaired", target: "repeater", number: 3, name: null },
    { kind: "unpaired", target: "remote", number: 2, name: null },
  ]);
  // An offline remote is never amber (remotes sleep); remote only is a note.
  const sleeping = { ...REMOTE, online: false };
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0, 0x08), [sleeping]), []);
  assert.equal(irEmitterAttention(decodeEmitters(0, 0, 0x08), [sleeping]), false);
  // No read yet: the pill stays plain whatever the routing names.
  assert.deepEqual(irEmitterProblems(decodeEmitters(0, 0b11_0000, 0x10), null), []);
  assert.equal(irEmitterAttention(null, paired), false);
});

test("a device row warns from its emitters bytes and the last read", () => {
  assert.equal(irEmitterRowAttention([0, 0b1100, 0x07], [CABINET, BEDROOM]), true);
  assert.equal(irEmitterRowAttention([0, 0, 0x07], [CABINET, BEDROOM]), false);
  assert.equal(irEmitterRowAttention([0, 0b1100, 0x07], null), false);
  assert.equal(irEmitterRowAttention(undefined, [CABINET, BEDROOM]), false);
});

test("without the hub's emitters the routing gets a neutral note", () => {
  assert.equal(irEmitterNote(decodeEmitters(0, 0, 0x07)), null);
  assert.equal(irEmitterNote(decodeEmitters(0, 0, 0x03)), null); // custom still uses the hub
  assert.equal(irEmitterNote(decodeEmitters(0, 0, 0x08)), "remote_only");
  assert.equal(irEmitterNote(decodeEmitters(0, 0b01, 0x00)), "repeater_only");
  assert.equal(irEmitterNote(decodeEmitters(0, 0b01, 0x08)), "no_hub");
});

test("the rows are the hub, then repeaters, then remotes: paired ones plus picked ones the read did not list", () => {
  const routing = decodeEmitters(0, 0b11_0000, 0x07 | 0x10); // repeater 3 all, remote 2, hub all
  const rows = irEmitterRows(routing, [REMOTE, CABINET, BEDROOM]);
  assert.deepEqual(rows.map((row) => [row.key, row.picked, row.paired, row.online, row.choice]), [
    ["hub", true, true, true, "all"],
    ["repeater:1", false, true, true, null],
    ["repeater:2", false, true, false, null],
    ["repeater:3", true, false, null, "all"],
    ["remote:1", false, true, true, null],
    ["remote:2", true, false, null, null],
  ]);
  // Without a read only what the routing names shows, state unknown.
  assert.deepEqual(irEmitterRows(routing, null).map((row) => [row.key, row.paired]), [
    ["hub", true], ["repeater:3", null], ["remote:2", null],
  ]);
});

test("normalizePaired keeps well-formed rows within the routing numbers", () => {
  assert.equal(normalizePaired(null), null);
  assert.deepEqual(normalizePaired([
    { kind: "remote", number: 1, name: " X2 Remote ", online: true, port_cable: null },
    { kind: "repeater", number: 4, name: "Attic", online: 1 },
    { kind: "remote", number: 6, name: "Too far", online: true },
    { kind: "rf", number: 1, name: "Doorbell", online: true },
    null,
  ]), [
    { kind: "remote", number: 1, name: "X2 Remote", online: true, port_cable: null },
    { kind: "repeater", number: 4, name: "Attic", online: false, port_cable: null },
  ]);
});

test("ticking defaults to All, the last picked row stays, and picks never reach what the library refuses", () => {
  const hubOnly = decodeEmitters(0x5a, 0, 0x07);
  // The hub is the only pick: it stays.
  assert.equal(toggleEmitterRow(hubOnly, { kind: "hub", number: 0, picked: true }), null);
  // Ticking a repeater picks All; a remote is on or off.
  const withCabinet = toggleEmitterRow(hubOnly, { kind: "repeater", number: 1, picked: false })!;
  assert.deepEqual(encodeEmitters(withCabinet), [0x5a, 0b11, 0x07]);
  assert.equal(pickedRowCount(withCabinet), 2);
  const noHub = toggleEmitterRow(withCabinet, { kind: "hub", number: 0, picked: true })!;
  assert.deepEqual(encodeEmitters(noHub), [0x5a, 0b11, 0x00]);
  assert.equal(toggleEmitterRow(noHub, { kind: "repeater", number: 1, picked: true }), null);
  const hubBack = toggleEmitterRow(noHub, { kind: "hub", number: 0, picked: false })!;
  assert.equal(hubBack.hub, "all");
  assert.deepEqual(encodeEmitters(pickRepeaterEmitters(hubBack, 1, "port")), [0x5a, 0b10, 0x07]);
  assert.deepEqual(encodeEmitters(pickHubEmitters(hubBack, "port2")), [0x5a, 0b11, 0x04]);
  // A custom mix is replaced only by a pick.
  const custom = decodeEmitters(0, 0, 0x05);
  assert.equal(customHubMix(custom), "builtin_port2");
  assert.equal(customHubMix(decodeEmitters(0, 0, 0x03)), "builtin_port1");
  assert.equal(customHubMix(decodeEmitters(0, 0, 0x06)), "ports");
  assert.equal(customHubMix(hubOnly), null);
  assert.deepEqual(encodeEmitters(toggleEmitterRow(custom, { kind: "remote", number: 3, picked: false })!), [0, 0, 0x25]);
  assert.deepEqual(encodeEmitters(pickHubEmitters(custom, "builtin")), [0, 0, 0x01]);
});

test("random pick sequences keep the RF byte, a known hub choice (or the hub's own mix) and at least one emitter", () => {
  // The library refuses: a changed RF byte, hub bits outside 0/1/2/4/7
  // unless unchanged from the hub's, and no emitter at all.
  let seed = 7;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let run = 0; run < 400; run++) {
    const baseline = decodeEmitters(random(256), random(256), random(256) | 1);
    let routing: EmitterRouting = baseline;
    for (let step = 0; step < 25; step++) {
      const rows = irEmitterRows(routing, [REMOTE, CABINET, BEDROOM, { kind: "remote", number: 4, name: "Kitchen", online: true }]);
      const row = rows[random(rows.length)];
      const op = random(3);
      if (op === 0) {
        routing = toggleEmitterRow(routing, row) ?? routing;
      } else if (op === 1 && row.kind === "hub" && row.picked) {
        routing = pickHubEmitters(routing, HUB_CHOICES[random(HUB_CHOICES.length)]);
      } else if (op === 2 && row.kind === "repeater" && row.picked) {
        routing = pickRepeaterEmitters(routing, row.number, REPEATER_CHOICES[random(REPEATER_CHOICES.length)]);
      }
      const [a, b, c] = encodeEmitters(routing);
      const [baseA, , baseC] = encodeEmitters(baseline);
      assert.equal(a, baseA);
      assert.ok([0, 1, 2, 4, 7].includes(c & 7) || (c & 7) === (baseC & 7), `hub bits ${c & 7}`);
      assert.ok(!(b === 0 && c === 0), "an emitter stays picked");
    }
  }
});

// -- the template ------------------------------------------------------------------

const L = TOOLS_CARD_STRINGS.irEmitters;

function body(routing: EmitterRouting, baseline: EmitterRouting, paired: PairedEmitter[] | null, extra: Record<string, unknown> = {}) {
  return templateText(renderIrEmitterBody({
    idPrefix: "t",
    labels: L,
    routing,
    baseline,
    paired,
    open: true,
    menuStyle: "",
    checking: false,
    error: null,
    onToggle() {},
    onClose() {},
    onChange() {},
    onUndo() {},
    ...extra,
  }));
}

test("the dropdown lists the rows, the hints and the scope line", () => {
  const hub = decodeEmitters(0, 0, 0x07);
  const text = body(hub, hub, [REMOTE, CABINET, BEDROOM]);
  for (const part of [L.title, L.intro, L.sendFrom, L.hub, L.hubSub, "Cabinet", "Bedroom", "X2 Remote", L.all, L.builtin, L.port1, L.port2, L.lastOneHint, L.scope]) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(!text.includes(L.duplicateHint));
  assert.doesNotMatch(text, /ir-pending/);
  assert.doesNotMatch(text, /role="alert"/);
  // Two rows: the duplicate hint, not the last-one hint.
  const two = decodeEmitters(0, 0b11, 0x07);
  const twoText = body(two, hub, [REMOTE, CABINET, BEDROOM]);
  assert.ok(twoText.includes(L.duplicateHint));
  assert.ok(!twoText.includes(L.lastOneHint));
  assert.match(twoText, /ir-pending/);
  assert.ok(twoText.includes(L.pillPending));
  assert.ok(twoText.includes(L.undo));
});

test("the dropdown says what needs attention, notes remote only, and keeps a custom mix", () => {
  const hub = decodeEmitters(0, 0, 0x07);
  const amber = body(decodeEmitters(0, 0b1100, 0x07 | 0x10), hub, [REMOTE, CABINET, BEDROOM]);
  assert.ok(amber.includes(L.repeaterOffline("Bedroom")));
  assert.ok(amber.includes(L.notPairedTitle(L.remoteNumber(2))));
  assert.ok(amber.includes(L.notPaired));
  const remoteOnly = body(decodeEmitters(0, 0, 0x08), hub, [REMOTE]);
  assert.ok(remoteOnly.includes(L.remoteOnly(1)));
  assert.ok(remoteOnly.includes(L.remoteOnNote));
  assert.doesNotMatch(remoteOnly, /role="alert"/);
  const custom = decodeEmitters(0, 0, 0x03);
  const customText = body(custom, custom, null);
  assert.ok(customText.includes(L.hubCustom("builtin_port1")));
  assert.ok(customText.includes(L.hubCustomNote));
  // Checking and a failed read.
  assert.ok(body(hub, hub, null, { checking: true }).includes(L.checking));
  const failed = body(hub, hub, [REMOTE], { error: L.readBusy, onRetry() {} });
  assert.ok(failed.includes(L.readBusy));
  assert.ok(failed.includes(L.readKept));
  assert.ok(failed.includes(L.checkAgain));
});

test("the pill is plain, dashed when pending and amber when the rules say so", () => {
  const hub = decodeEmitters(0, 0, 0x07);
  const params = { idPrefix: "t", labels: L, baseline: hub, paired: [CABINET, BEDROOM], open: false, menuStyle: "", checking: false, error: null, onToggle() {}, onClose() {}, onChange() {}, onUndo() {} };
  const plain = templateText(renderIrEmitterPill({ ...params, routing: hub }));
  assert.match(plain, /class="ir-pill/);
  assert.doesNotMatch(plain, /pending|attention|ir-pop/);
  assert.match(templateText(renderIrEmitterPill({ ...params, routing: decodeEmitters(0, 0b11, 0x07) })), /pending/);
  const amber = templateText(renderIrEmitterPill({ ...params, routing: decodeEmitters(0, 0b1100, 0x07), open: true }));
  assert.match(amber, /attention/);
  assert.match(amber, /ir-pop/);
  const readOnly = templateText(renderReadOnlyIrPill({ labels: L, attention: true }));
  assert.match(readOnly, /ir-pill ir-pill--ro/);
  assert.match(readOnly, /attention/);
  assert.ok(readOnly.includes(L.rowAttention));
});

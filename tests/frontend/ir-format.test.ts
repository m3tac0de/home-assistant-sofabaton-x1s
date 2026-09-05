import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSofabatonBlob,
  detectIrPayloadFormat,
  formatHexForDisplay,
  isUcHexCode,
  parseProntoHex,
  parseSofabatonBlob,
  renderProntoHex,
  resolveUcPaste,
  unwrapUcCodesetRow,
} from "../../custom_components/sofabaton_x1s/www/src/shared/ir-format";

// Shared golden vectors, also consumed by tests/test_blob_decoders.py -
// converter divergence between the Python lib and this TS mirror fails
// one of the two suites.
const VECTORS: Array<{
  name: string;
  timings_us: number[];
  carrier_hz: number;
  stored_hex: string;
  rebuilt_hex: string;
  pronto_hex: string;
}> = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "ir-format-vectors.json"), "utf-8"),
).vectors;

test("golden vectors: parse stored blob, rebuild, render pronto", () => {
  for (const vector of VECTORS) {
    const parsed = parseSofabatonBlob(vector.stored_hex);
    assert.deepEqual(parsed.timingsUs, vector.timings_us, vector.name);
    assert.equal(parsed.carrierHz, vector.carrier_hz, vector.name);
    assert.equal(
      buildSofabatonBlob({ timingsUs: parsed.timingsUs, carrierHz: parsed.carrierHz }),
      vector.rebuilt_hex,
      vector.name,
    );
    assert.equal(
      renderProntoHex({ timingsUs: parsed.timingsUs, carrierHz: parsed.carrierHz }),
      vector.pronto_hex,
      vector.name,
    );
  }
});

test("golden vectors: pronto round-trips within quantization tolerance", () => {
  for (const vector of VECTORS) {
    const rt = parseProntoHex(vector.pronto_hex);
    assert.ok(
      Math.abs(rt.carrierHz - vector.carrier_hz) <= vector.carrier_hz * 0.005,
      `${vector.name} carrier`,
    );
    const cycleUs = 1_000_000 / vector.carrier_hz;
    vector.timings_us.forEach((ours, index) => {
      const reference = rt.timingsUs[index];
      assert.ok(
        Math.abs(ours - reference) <= Math.max(cycleUs + 1, reference * 0.005),
        `${vector.name} timing ${index}: ${ours} vs ${reference}`,
      );
    });
  }
});

test("sofabaton blob: declared block lengths win over the terminator slot", () => {
  // X1 learn captures never write the zero terminator; the slot holds stale
  // RAM from an earlier, longer capture (loopback bench 2026-09-03).
  const word = (v: number) => v.toString(16).padStart(8, "0");
  const words = [9000, 4500, 560, 40000].map(word).join("");
  const stale = parseSofabatonBlob("0010000000009470" + words + word(8954) + "00");
  assert.deepEqual(stale.timingsUs, [9000, 4500, 560, 40000]);
  assert.equal(stale.carrierHz, 38000);
  // declared span running past the real words (zero inside) -> terminator scan
  const overDeclared = parseSofabatonBlob("0018000000009470" + words + word(0));
  assert.deepEqual(overDeclared.timingsUs, [9000, 4500, 560, 40000]);
  // learned layout: pulse block + repeat block both belong to the signal
  const learned = parseSofabatonBlob("000c0004010094cf" + words + word(0));
  assert.deepEqual(learned.timingsUs, [9000, 4500, 560, 40000]);
  assert.equal(learned.carrierHz, 38095);
});

test("format detection", () => {
  const vector = VECTORS[0];
  assert.equal(detectIrPayloadFormat(vector.pronto_hex), "pronto");
  assert.equal(detectIrPayloadFormat(vector.stored_hex), "sofabaton");
  assert.equal(detectIrPayloadFormat(formatHexForDisplay(vector.stored_hex)), "sofabaton");
  assert.equal(detectIrPayloadFormat("P:Sony12 R:40000 D:1 F:18 MUL:2"), "descriptor");
  assert.equal(detectIrPayloadFormat("  p:NECx D:7 S:7 F:96 "), "descriptor");
  assert.equal(detectIrPayloadFormat("hello world"), "unknown");
  assert.equal(detectIrPayloadFormat(""), "unknown");
  // 4-hex-digit words that do NOT satisfy the pronto preamble stay sofabaton
  assert.equal(detectIrPayloadFormat("0011 2233 4455 6677 8899 aabb"), "sofabaton");
  // Unfolded Circle HEX: the semicolons make the shape exact
  assert.equal(detectIrPayloadFormat("3;0x4B36D32C;32;0"), "uc_hex");
  assert.equal(detectIrPayloadFormat(" 4 ; A90 ; 12 ; 2 "), "uc_hex");
  assert.equal(detectIrPayloadFormat("NEC;0x20DF10EF;32;0"), "uc_hex");
  assert.equal(detectIrPayloadFormat("3;0x4B36D32C;32"), "unknown");
  assert.equal(detectIrPayloadFormat("3;0xZZ;32;0"), "unknown");
});

// ── Unfolded Circle pastes (bare HEX codes and codeset CSV rows) ────────

test("uc: bare HEX code resolves to a backend conversion", () => {
  assert.deepEqual(resolveUcPaste("3;0x4B36D32C;32;0"), {
    name: null,
    kind: "uc_hex",
    code: "3;0x4B36D32C;32;0",
  });
  assert.equal(isUcHexCode("0000 006D 0002 0000 00AB 00AB 0015 06AE"), false);
  assert.equal(resolveUcPaste("0000 006D 0002 0000 00AB 00AB 0015 06AE"), null);
  assert.equal(resolveUcPaste("P:Sony12 R:40000 D:1 F:18"), null);
});

test("uc: codeset CSV rows unwrap with their name and format", () => {
  assert.deepEqual(unwrapUcCodesetRow('"Power-Toggle","HEX","3;0x4B36D32C;32;0"'), {
    name: "Power-Toggle",
    format: "HEX",
    code: "3;0x4B36D32C;32;0",
  });
  assert.deepEqual(resolveUcPaste('"Volume-Up","HEX","3;0x4BB640BF;32;0"'), {
    name: "Volume-Up",
    kind: "uc_hex",
    code: "3;0x4BB640BF;32;0",
  });
  const pronto = "0000 006D 0002 0000 00AB 00AB 0015 06AE";
  assert.deepEqual(resolveUcPaste(`"Power_Toggle","PRONTO","${pronto}"`), {
    name: "Power_Toggle",
    kind: "pronto",
    code: pronto,
  });
  // unquoted cells and a missing name column are fine too
  assert.deepEqual(resolveUcPaste("HEX,3;0x4B36D32C;32;0"), {
    name: null,
    kind: "uc_hex",
    code: "3;0x4B36D32C;32;0",
  });
  // the header row and rows whose code does not match their format are not pastes
  assert.equal(resolveUcPaste('"key","format","code"'), null);
  assert.equal(resolveUcPaste('"Power","HEX","0000 006D 0002 0000 00AB 00AB 0015 06AE"'), null);
  assert.equal(unwrapUcCodesetRow("3;0x4B36D32C;32;0"), null);
});

test("pronto parser rejects malformed input", () => {
  for (const bad of [
    "garbage",
    "0100 006D 0001 0000 00AB 00AB",
    "0000 0000 0001 0000 00AB 00AB",
    "0000 006D 0002 0000 00AB 00AB",
    "0000 006D 0000 0000",
    "0000 006D 0001 0000 0000 00AB",
  ]) {
    assert.throws(() => parseProntoHex(bad), /ir-format\//, bad);
  }
});

test("sofabaton parser rejects descriptive and legacy blobs", () => {
  // descriptive magic at [2:8]
  const descriptor = "001f" + "000011009470" + "aa".repeat(40);
  assert.throws(() => parseSofabatonBlob(descriptor), /descriptive/);
  // pre-2026-08-31 exporter framing reads carrier 0
  const legacy = "000003200000" + "00009470" + "00002328" + "00001194" + "00000000";
  assert.throws(() => parseSofabatonBlob(legacy), /carrier/);
});

test("odd timing counts pad with the default trailing gap", () => {
  const blob = buildSofabatonBlob({ timingsUs: [9000, 4500, 560], carrierHz: 38000 });
  const parsed = parseSofabatonBlob(blob);
  assert.deepEqual(parsed.timingsUs, [9000, 4500, 560, 40000]);
});

test("display formatting round-trips through the parser", () => {
  const vector = VECTORS[1];
  const spaced = formatHexForDisplay(vector.stored_hex);
  assert.match(spaced, /^([0-9a-f]{2} )+[0-9a-f]{2}$/);
  assert.deepEqual(parseSofabatonBlob(spaced).timingsUs, vector.timings_us);
});

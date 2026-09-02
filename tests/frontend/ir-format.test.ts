import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSofabatonBlob,
  detectIrPayloadFormat,
  formatHexForDisplay,
  parseProntoHex,
  parseSofabatonBlob,
  renderProntoHex,
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

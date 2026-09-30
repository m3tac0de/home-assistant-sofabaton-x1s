import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeWifiName } from "../../custom_components/sofabaton_x1s/www/src/shared/hub-names";
import { sanitizeWifiName as panelSanitizeWifiName } from "../../server-panel/src/views/wifi-devices-state";

// tests/fixtures/wifi-name-vectors.json is shared with the backend test
// (tests/test_hub_operations.py): a name the backend accepts passes the
// card's sanitizer unchanged, and one it refuses does not (CR-X4-1).
const { vectors } = JSON.parse(
  readFileSync(path.resolve("tests/fixtures/wifi-name-vectors.json"), "utf8"),
) as { vectors: Array<{ version: string; name: string; ok: boolean; why: string }> };

test("the card's Wifi name sanitizer agrees with the backend rule (CR-X4-1)", () => {
  for (const vector of vectors) {
    const kept = sanitizeWifiName(vector.version, vector.name) === vector.name;
    assert.equal(kept, vector.ok, `${vector.version} ${vector.why}`);
    assert.equal(panelSanitizeWifiName(vector.version, vector.name), sanitizeWifiName(vector.version, vector.name));
  }
});

test("Wifi names are cut to the hub's 20 characters", () => {
  assert.equal(sanitizeWifiName("X1S", "A".repeat(25)), "A".repeat(20));
});

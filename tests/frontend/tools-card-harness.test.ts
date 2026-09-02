import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  TOOLS_CARD_LOCALES,
} from "../../custom_components/sofabaton_x1s/www/src/control-panel-language-loader";

const ROOT = process.cwd();
const HARNESS_PATH = path.join(ROOT, "tests", "tools-card-harness.html");
const HARNESS = readFileSync(HARNESS_PATH, "utf8");

test("harness language selector stays aligned with emitted Control Panel locales", () => {
  const select = HARNESS.match(
    /<select id="harness-language">([\s\S]*?)<\/select>/,
  )?.[1];
  assert.ok(select, "language selector exists");

  const values = [...select.matchAll(/<option value="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(values, ["en", ...TOOLS_CARD_LOCALES]);
});

test("harness declares every Control Panel websocket operation used by the frontend", () => {
  const sourceFiles = [
    "custom_components/sofabaton_x1s/www/src/shared/api/control-panel-api.ts",
    "custom_components/sofabaton_x1s/www/src/state/control-panel-store.ts",
    "custom_components/sofabaton_x1s/www/src/tabs/backup-tab.ts",
    "custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab.ts",
  ];
  const operationPattern = /["'`](sofabaton_x1s\/[a-z0-9_/-]+)["'`]/gi;
  const sourceOperations = new Set<string>();
  for (const relative of sourceFiles) {
    const source = readFileSync(path.join(ROOT, relative), "utf8");
    for (const match of source.matchAll(operationPattern)) {
      if (!match[1].endsWith("/")) sourceOperations.add(match[1]);
    }
  }

  const harnessOperations = new Set(
    [...HARNESS.matchAll(operationPattern)].map((match) => match[1]),
  );
  const missing = [...sourceOperations]
    .filter((operation) => !harnessOperations.has(operation))
    .sort();

  assert.deepEqual(
    missing,
    [],
    `add explicit harness handling for: ${missing.join(", ")}`,
  );
});

test("harness frontend version follows its script URL instead of duplicating a release number", () => {
  assert.match(HARNESS, /id="tools-card-bundle"[\s\S]*?\?v=harness/);
  assert.match(
    HARNESS,
    /document\.getElementById\("tools-card-bundle"\)\.src/,
  );
  assert.doesNotMatch(
    HARNESS,
    /const TOOLS_FRONTEND_VERSION = "\d+"/,
  );
});

test("harness carries every scenario the contrast audit measures by default", () => {
  const audit = readFileSync(path.join(ROOT, "scripts", "audit-contrast.mjs"), "utf8");
  const block = audit.match(/const DEFAULT_SCENARIOS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(block, "audit declares DEFAULT_SCENARIOS");
  const wanted = [...block.matchAll(/^\s*"([^"]+)"/gm)].map((match) => match[1]);
  assert.ok(wanted.length > 0);
  const declared = new Set([...HARNESS.matchAll(/id:\s*"([^"]+)",\s*group:/g)].map((match) => match[1]));
  const numeric = new Set([...HARNESS.matchAll(/id:\s*(\d+),\s*group:/g)].map((match) => match[1]));
  const missing = wanted.filter((id) => !declared.has(id) && !numeric.has(id));
  assert.deepEqual(missing, [], `audit default scenarios missing from the harness: ${missing.join(", ")}`);
});

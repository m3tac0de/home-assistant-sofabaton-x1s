import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "dist", "tools-card-harness-site");
const BUILD_SCRIPT = path.join(
  ROOT,
  "scripts",
  "build-tools-card-harness-site.mjs",
);

test("Pages build publishes the harness and only its required runtime assets", () => {
  execFileSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      HARNESS_ASSET_VERSION: "test-commit-sha",
    },
    stdio: "pipe",
  });

  const index = readFileSync(path.join(OUTPUT_DIR, "index.html"), "utf8");
  const harness = readFileSync(
    path.join(OUTPUT_DIR, "tests", "tools-card-harness.html"),
    "utf8",
  );
  const publishedWww = path.join(
    OUTPUT_DIR,
    "custom_components",
    "sofabaton_x1s",
    "www",
  );

  assert.match(index, /\.\/tests\/tools-card-harness\.html/);
  assert.match(harness, /tools-card\.js\?v=test-commit-sha/);
  assert.doesNotMatch(harness, /tools-card\.js\?v=harness/);
  assert.equal(existsSync(path.join(publishedWww, "tools-card.js")), true);
  assert.deepEqual(
    readdirSync(path.join(publishedWww, "tools-card-locales")).sort(),
    ["de.js", "en-gb.js", "es.js", "fr.js", "nl.js", "zh-hans.js"],
  );
  assert.deepEqual(
    readdirSync(publishedWww).sort(),
    ["tools-card-locales", "tools-card.js"],
  );
});

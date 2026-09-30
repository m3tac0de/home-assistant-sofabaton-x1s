// Pyright as a "no new errors" gate (R7).
//
// The library and the server carry pyright errors that are type-level only
// (docs/internal/code-review-program: none is a runtime bug). They are
// recorded in pyright-baseline.json; this check fails when a change adds
// one, and says so when a change removes some.
//
//   npm run pyright:check      compare against the baseline (CI)
//   npm run pyright:baseline   rewrite the baseline after fixing errors
//
// Errors are matched by file, rule and message, counted, never by line, so
// unrelated edits that move code do not trip the gate. Pyright checks
// against the venv pyproject.toml names (.venv-py313): the server imports
// the installed `sofabaton`, so install the library from this tree first
// (pip install --no-deps .), as CI does with scripts/pyright-requirements.txt.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "pyright-baseline.json");
const update = process.argv.includes("--update");

function runPyright() {
  const run = spawnSync("npx", ["--no-install", "pyright", "--outputjson"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  try {
    return JSON.parse(run.stdout);
  } catch {
    console.error(run.stdout || "");
    console.error(run.stderr || "");
    console.error("pyright produced no JSON report");
    process.exit(2);
  }
}

function normalize(text) {
  // A message may carry an absolute path; the rest is stable.
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\\/g, "[\\\\/]");
  return text.split("\n")[0].replace(new RegExp(escaped, "gi"), "").trim();
}

function keyOf(diagnostic) {
  const file = relative(root, diagnostic.file).split("\\").join("/");
  return { file, rule: diagnostic.rule ?? "", message: normalize(diagnostic.message) };
}

const report = runPyright();
const errors = report.generalDiagnostics.filter((d) => d.severity === "error");
const current = new Map();
for (const diagnostic of errors) {
  const key = keyOf(diagnostic);
  const id = `${key.file}\u0000${key.rule}\u0000${key.message}`;
  const entry = current.get(id) ?? { ...key, count: 0, where: [] };
  entry.count += 1;
  entry.where.push(`${key.file}:${diagnostic.range.start.line + 1}`);
  current.set(id, entry);
}

if (update) {
  const entries = [...current.values()]
    .map(({ file, rule, message, count }) => ({ file, rule, message, count }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
  const doc = { pyright: report.version, errors: errors.length, entries };
  writeFileSync(baselinePath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`pyright baseline: ${errors.length} errors recorded (pyright ${report.version})`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const allowed = new Map(
  baseline.entries.map((e) => [`${e.file}\u0000${e.rule}\u0000${e.message}`, e.count]),
);
if (baseline.pyright !== report.version) {
  console.warn(`note: the baseline was written by pyright ${baseline.pyright}, this is ${report.version}`);
}

const added = [];
for (const [id, entry] of current) {
  const extra = entry.count - (allowed.get(id) ?? 0);
  if (extra > 0) added.push({ ...entry, extra });
}
let fixed = 0;
for (const [id, count] of allowed) fixed += Math.max(0, count - (current.get(id)?.count ?? 0));

if (added.length) {
  console.error(`pyright: ${added.reduce((n, e) => n + e.extra, 0)} new error(s) against pyright-baseline.json:\n`);
  for (const entry of added) {
    console.error(`  ${entry.rule}: ${entry.message}`);
    console.error(`    ${entry.extra} new; now at ${entry.where.join(", ")}`);
  }
  console.error("\nFix them, or, if an error is really expected, run npm run pyright:baseline and commit the file.");
  process.exit(1);
}
console.log(`pyright: ${errors.length} errors, none new (baseline ${baseline.errors}).`);
if (fixed) console.log(`${fixed} baseline error(s) are gone: run npm run pyright:baseline to lower the bar.`);

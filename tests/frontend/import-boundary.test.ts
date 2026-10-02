import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The frontend import policies (CR-X6-5), the counterpart of the library's
// boundary guard (tests/lib/test_library_boundary.py). One tsconfig program
// covers all three trees, so a cross-tree import type-checks and bundles;
// only this test notices it. Update the allowlists consciously (L-X1).
//
// L-A19: remote-card/src never imports the tools card or the panel (the
//   HACS remote-card.js and the npm embed would carry them).
// L-A20: the panel takes the tools card's pure helpers and strings, never a
//   template or CSS; templates and CSS are mirrored.

const ROOT = process.cwd();
const TOOLS_SRC = "custom_components/sofabaton_x1s/www/src";
const PANEL_SRC = "server-panel/src";
const REMOTE_SRC = "remote-card/src";

/** The tools-card modules the panel may import, and which of their value symbols.
 *  "*" admits any symbol: the module holds no template or CSS (checked below). */
const PANEL_ALLOWED: Record<string, "*" | string[]> = {
  "strings": "*",
  "shared/ha-context": "*",
  "shared/hub-names": "*",
  "shared/hub-rules": "*",
  "shared/ir-format": "*",
  "shared/utils/overlay-menu": "*",
  "tabs/backup-state": "*",
  // Renders the hub icon template too: only the pure picks.
  "shared/utils/control-panel-selectors": ["hubIcon", "creatableDeviceClasses"],
};

interface ImportRef {
  file: string;
  specifier: string;
  resolved: string;
  typeOnly: boolean;
  symbols: string[];
}

function sourceFiles(root: string): string[] {
  return readdirSync(path.resolve(ROOT, root), { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : entry.name.endsWith(".ts") ? [target] : [];
  });
}

function posix(value: string): string {
  return value.replaceAll("\\", "/");
}

function importsOf(file: string): ImportRef[] {
  const text = readFileSync(path.resolve(ROOT, file), "utf8");
  const refs: ImportRef[] = [];
  const add = (specifier: string, typeOnly: boolean, clause: string) => {
    if (!specifier.startsWith(".")) return;
    const resolved = posix(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), specifier)));
    const braces = clause.match(/\{([^}]*)\}/)?.[1] ?? "";
    const symbols = braces.split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("type "))
      .map((part) => part.split(/\s+as\s+/)[0].trim());
    const namespace = /\*\s+as\s+\w+/.test(clause) ? ["*"] : [];
    const defaultName = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    refs.push({ file: posix(file), specifier, resolved, typeOnly, symbols: [...symbols, ...namespace, ...(defaultName && !namespace.length ? [defaultName] : [])] });
  };
  for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)"/gms)) add(match[3], Boolean(match[1]), match[2]);
  for (const match of text.matchAll(/^import\s+"([^"]+)"/gm)) add(match[1], false, "");
  return refs;
}

test("remote-card/src imports neither the tools card nor the server panel (L-A19)", () => {
  const offending = sourceFiles(REMOTE_SRC)
    .flatMap(importsOf)
    .filter((ref) => ref.resolved.startsWith("custom_components/") || ref.resolved.startsWith("server-panel/"))
    .map((ref) => `${ref.file}: ${ref.specifier}`);
  assert.deepEqual(offending, []);
});

test("the tools card never imports the server panel", () => {
  const offending = sourceFiles(TOOLS_SRC)
    .flatMap(importsOf)
    .filter((ref) => ref.resolved.startsWith("server-panel/"))
    .map((ref) => `${ref.file}: ${ref.specifier}`);
  assert.deepEqual(offending, []);
});

test("the server panel takes only the tools card's pure helpers and strings (L-A20)", () => {
  const problems: string[] = [];
  for (const ref of sourceFiles(PANEL_SRC).flatMap(importsOf)) {
    if (!ref.resolved.startsWith(`${TOOLS_SRC}/`)) continue;
    const module = ref.resolved.slice(TOOLS_SRC.length + 1).replace(/\.ts$/, "");
    const allowed = PANEL_ALLOWED[module];
    if (!allowed) {
      problems.push(`${ref.file}: ${module} is not on the panel's allowlist`);
      continue;
    }
    if (ref.typeOnly) continue;
    // A whole module is lit-free (next test); a pinned one is taken symbol by symbol.
    for (const symbol of ref.symbols) {
      if (allowed !== "*" && !allowed.includes(symbol)) problems.push(`${ref.file}: ${symbol} from ${module} is not allowlisted`);
    }
  }
  assert.deepEqual(problems, []);
});

test("the tools-card modules the panel may take whole hold no template, CSS or element", () => {
  for (const [module, allowed] of Object.entries(PANEL_ALLOWED)) {
    if (allowed !== "*") continue;
    const text = readFileSync(path.resolve(ROOT, TOOLS_SRC, `${module}.ts`), "utf8");
    assert.doesNotMatch(text, /from\s+"lit(?:\/[^"]*)?"/, `${module} imports lit`);
    assert.doesNotMatch(text, /customElements\.define\s*\(/, `${module} defines an element`);
  }
});

test("the allowlist names modules that exist and that the panel still imports", () => {
  const used = new Set(sourceFiles(PANEL_SRC)
    .flatMap(importsOf)
    .filter((ref) => ref.resolved.startsWith(`${TOOLS_SRC}/`))
    .map((ref) => ref.resolved.slice(TOOLS_SRC.length + 1).replace(/\.ts$/, "")));
  assert.deepEqual(Object.keys(PANEL_ALLOWED).filter((module) => !used.has(module)), []);
});

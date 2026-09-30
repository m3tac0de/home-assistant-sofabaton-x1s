import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TOOLS_CARD_STRINGS_EN } from "../../custom_components/sofabaton_x1s/www/src/strings";
import { REMOTE_CARD_STRINGS_EN } from "../../remote-card/src/remote-card-strings";

// Every English leaf must have a reader in production code (CR-X7-1). The
// complete locales must carry every key, so an unread key costs each
// translator a string nobody sees. A leaf counts as read when its name occurs
// as a property access (`.name`) or a quoted key in a production source.
// Tables read by computed index are listed below with the reason.

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

function productionSource(roots: string[], excluded: RegExp): string {
  return roots
    .flatMap((root) => sourceFiles(path.resolve(root))
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !excluded.test(file.replaceAll("\\", "/"))))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function leafPaths(table: unknown, prefix = ""): string[] {
  if (table == null || typeof table !== "object") return [prefix];
  return Object.entries(table as Record<string, unknown>)
    .flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unreadLeaves(table: unknown, source: string, dynamicTables: string[]): string[] {
  return leafPaths(table).filter((leaf) => {
    if (dynamicTables.some((prefix) => leaf === prefix || leaf.startsWith(`${prefix}.`))) return false;
    const name = escapeRegExp(leaf.split(".").at(-1) ?? "");
    const reader = new RegExp(`\\.${name}\\b|["'\`]${name}["'\`]|[{,]\\s*${name}\\s*[,}]`);
    return !reader.test(source);
  });
}

test("every tools-card English string has a production reader (CR-X7-1)", () => {
  const source = productionSource(
    ["custom_components/sofabaton_x1s/www/src", "server-panel/src"],
    /\/www\/src\/(strings\.ts|control-panel-translations\/)/,
  );
  const dynamicTables = [
    // Indexed by the hub's device class.
    "deviceClassLabels",
    // Indexed by backend step kinds, phases and error codes.
    "backendState",
    // Indexed by keymap button names.
    "buttonNames",
    "wifiCommands.keyLabels",
  ];
  assert.deepEqual(unreadLeaves(TOOLS_CARD_STRINGS_EN, source, dynamicTables), []);
});

test("every remote-card English string has a production reader (CR-X7-1)", () => {
  const source = productionSource(
    ["remote-card/src", "server-panel/src"],
    /\/remote-card\/src\/(remote-card-strings\.ts|remote-card-translations\/)/,
  );
  const dynamicTables = [
    // Indexed by the layout's key ids.
    "keys",
  ];
  assert.deepEqual(unreadLeaves(REMOTE_CARD_STRINGS_EN, source, dynamicTables), []);
});

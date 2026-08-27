// Shortcuts row frontend tests (docs/internal/shortcuts-row-plan.md):
// slot config normalization + per-device reads, the group-order back-fill,
// the editor slot write/prune helper, and the editor UI plumbing (device-only
// group visibility, draft-until-valid writes, reset).

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GROUP_ORDER,
  DEVICE_LAYOUT_KEYS,
  deviceShortcutsFromConfig,
  normalizedGroupOrder,
  normalizedShortcutSlot,
  shortcutsRowEnabled,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-layout";
import {
  applyLayoutConfigPatch,
  applyShortcutSlotPatch,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-layout";
import { renderShortcutsRow } from "../../custom_components/sofabaton_x1s/www/src/sections/key-groups";
import { renderShortcutsEditor } from "../../custom_components/sofabaton_x1s/www/src/editor-sections/shortcuts";
import { SofabatonRemoteCardEditor } from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-element";
import type { RemoteCardConfig } from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";

// The editor dispatches window events for the preview-activity handshake;
// give Node a minimal window so setConfig/selection changes can run.
if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
  (globalThis as Record<string, unknown>).window = {
    dispatchEvent: () => true,
  };
}

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const maybeTemplate = template as { strings?: unknown[]; values?: unknown[] };
    const strings = maybeTemplate.strings ?? [];
    const values = maybeTemplate.values ?? [];
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += templateText(strings[index]);
      if (index < values.length) text += templateText(values[index]);
    }
    return text;
  }
  return "";
}

// ---------- config layer ----------

test("shortcuts group key sits last in the default order and back-fills old orders", () => {
  assert.equal(DEFAULT_GROUP_ORDER[DEFAULT_GROUP_ORDER.length - 1], "shortcuts");
  // A released group_order that predates the feature resolves with shortcuts
  // appended last — no migration.
  const legacy = ["dpad", "activity", "nav"];
  const normalized = normalizedGroupOrder(legacy);
  assert.equal(normalized[normalized.length - 1], "shortcuts");
  assert.deepEqual(normalized.slice(0, 3), legacy);
});

test("show_shortcuts is a device layout key, defaulting to shown", () => {
  assert.equal(DEVICE_LAYOUT_KEYS.includes("show_shortcuts" as never), true);
  assert.equal(shortcutsRowEnabled({}), true);
  assert.equal(shortcutsRowEnabled(null), true);
  assert.equal(shortcutsRowEnabled({ show_shortcuts: false }), false);
});

test("normalizedShortcutSlot requires BOTH a non-empty icon and a finite command id", () => {
  assert.deepEqual(normalizedShortcutSlot({ icon: "mdi:netflix", command_id: 7 }), {
    icon: "mdi:netflix",
    command_id: 7,
  });
  assert.equal(normalizedShortcutSlot({ icon: "", command_id: 7 }), null);
  assert.equal(normalizedShortcutSlot({ icon: "   ", command_id: 7 }), null);
  assert.equal(normalizedShortcutSlot({ icon: "mdi:cog" }), null);
  assert.equal(normalizedShortcutSlot({ icon: "mdi:cog", command_id: "x" }), null);
  assert.equal(normalizedShortcutSlot(null), null);
  assert.equal(normalizedShortcutSlot("mdi:cog"), null);
});

test("deviceShortcutsFromConfig reads only the addressed device and known slots", () => {
  const config = {
    entity: "remote.r",
    device_mode: {
      shortcuts: {
        "12": {
          left: { icon: "mdi:netflix", command_id: 7 },
          right: { icon: "mdi:cog", command_id: 15 },
          bogus: { icon: "mdi:x", command_id: 1 },
          middle: { icon: "", command_id: 3 }, // malformed -> unconfigured
        },
        "9": { left: { icon: "mdi:tv", command_id: 2 } },
      },
    },
  } as RemoteCardConfig;
  const slots = deviceShortcutsFromConfig(config, 12);
  assert.deepEqual(slots, {
    left: { icon: "mdi:netflix", command_id: 7 },
    right: { icon: "mdi:cog", command_id: 15 },
  });
  assert.deepEqual(deviceShortcutsFromConfig(config, 9).left, {
    icon: "mdi:tv",
    command_id: 2,
  });
  assert.deepEqual(deviceShortcutsFromConfig(config, 3), {});
  assert.deepEqual(deviceShortcutsFromConfig(config, null), {});
  // Layout layers never leak shortcut config (no inheritance): a hand-written
  // shortcuts key inside a layout layer is not what this reads.
  assert.deepEqual(
    deviceShortcutsFromConfig(
      { device_mode: { layouts: { default: { shortcuts: { left: {} } } } } },
      12,
    ),
    {},
  );
});

test("applyShortcutSlotPatch writes, overwrites, and prunes empty maps on delete", () => {
  const base = { entity: "remote.r" } as RemoteCardConfig;
  const written = applyShortcutSlotPatch(base, 12, "left", {
    icon: "mdi:netflix",
    command_id: 7,
  }).nextConfig;
  assert.deepEqual(written.device_mode, {
    shortcuts: { "12": { left: { icon: "mdi:netflix", command_id: 7 } } },
  });

  const overwritten = applyShortcutSlotPatch(written, 12, "left", {
    icon: "mdi:youtube",
    command_id: 8,
  }).nextConfig;
  assert.deepEqual(
    (overwritten.device_mode as Record<string, any>).shortcuts["12"].left,
    { icon: "mdi:youtube", command_id: 8 },
  );

  // Deleting the only slot prunes the device entry, the shortcuts map, and
  // the (otherwise empty) device_mode block.
  const cleared = applyShortcutSlotPatch(overwritten, 12, "left", null).nextConfig;
  assert.equal("device_mode" in cleared, false);

  // An invalid value behaves as delete, never storing a half-configured slot.
  const invalid = applyShortcutSlotPatch(base, 12, "middle", {
    icon: "",
    command_id: 3,
  }).nextConfig;
  assert.equal("device_mode" in invalid, false);

  // Deleting one slot leaves sibling slots and sibling devices alone.
  let multi = applyShortcutSlotPatch(base, 12, "left", {
    icon: "mdi:a",
    command_id: 1,
  }).nextConfig;
  multi = applyShortcutSlotPatch(multi, 12, "right", {
    icon: "mdi:b",
    command_id: 2,
  }).nextConfig;
  multi = applyShortcutSlotPatch(multi, 9, "left", {
    icon: "mdi:c",
    command_id: 3,
  }).nextConfig;
  const pruned = applyShortcutSlotPatch(multi, 12, "left", null).nextConfig;
  const shortcuts = (pruned.device_mode as Record<string, any>).shortcuts;
  assert.deepEqual(Object.keys(shortcuts["12"]), ["right"]);
  assert.deepEqual(shortcuts["9"].left, { icon: "mdi:c", command_id: 3 });
});

test("show_shortcuts prunes at its default and survives when load-bearing", () => {
  const on = applyLayoutConfigPatch({ entity: "remote.r" }, "device:12", {
    show_shortcuts: true,
  }).nextConfig;
  assert.equal("device_mode" in on, false);
  const off = applyLayoutConfigPatch({ entity: "remote.r" }, "device:12", {
    show_shortcuts: false,
  }).nextConfig;
  assert.equal(
    (off.device_mode as Record<string, any>).layouts["12"].show_shortcuts,
    false,
  );
});

// ---------- card render ----------

function slot(overrides: Record<string, unknown> = {}) {
  return {
    slot: "left" as const,
    icon: "mdi:netflix" as string | null,
    label: "Netflix",
    commandId: 7 as number | null,
    missing: false,
    ...overrides,
  };
}

test("shortcuts row renders configured slots as keys and holds empty cells as spacers", () => {
  const text = templateText(
    renderShortcutsRow(
      {
        editMode: false,
        disableAll: false,
        slots: [
          slot(),
          slot({ slot: "middle", icon: null, label: "", commandId: null }),
          slot({ slot: "right", icon: "mdi:cog", label: "Setup", commandId: 15 }),
        ],
        onPress: () => undefined,
      },
      true,
    ),
  );
  assert.equal(text.includes("row3 shortcuts"), true);
  assert.equal((text.match(/sb-key-button/g) || []).length / 2, 2);
  assert.equal(text.includes("shortcut-spacer"), true);
  assert.equal(text.includes("shortcut-ghost"), false);
});

test("shortcuts row edit preview renders ghosts for unconfigured slots; hidden rows render nothing", () => {
  const editText = templateText(
    renderShortcutsRow(
      {
        editMode: true,
        disableAll: false,
        slots: [
          slot({ icon: null, label: "", commandId: null }),
          slot({ slot: "middle", icon: null, label: "", commandId: null }),
          slot({ slot: "right", icon: null, label: "", commandId: null }),
        ],
        onPress: () => undefined,
      },
      true,
    ),
  );
  assert.equal((editText.match(/shortcut-ghost/g) || []).length, 3);
  const hidden = renderShortcutsRow(
    { editMode: false, disableAll: false, slots: [], onPress: () => undefined },
    false,
  );
  assert.equal(templateText(hidden), "");
});

test("a missing command renders the shortcut disabled instead of hiding it", () => {
  const text = templateText(
    renderShortcutsRow(
      {
        editMode: false,
        disableAll: false,
        slots: [slot({ missing: true })],
        onPress: () => undefined,
      },
      true,
    ),
  );
  assert.equal(text.includes(" disabled"), true);
});

// ---------- editor ----------

test("shortcuts editor lists commands, marks a vanished stored id, and offers Reset", () => {
  const params = {
    hass: null,
    slots: [
      { slot: "left" as const, icon: "mdi:netflix" },
      { slot: "middle" as const, icon: null },
      { slot: "right" as const, icon: null },
    ],
    openSlot: "left" as const,
    draftIcon: "mdi:netflix",
    draftCommandId: 999,
    commandsStatus: "ready" as const,
    commands: [
      { command_id: 7, name: "Netflix" },
      { command_id: 15, name: "Setup" },
    ],
    onToggleSlot: () => undefined,
    onDraftChanged: () => undefined,
    onReset: () => undefined,
  };
  const text = templateText(renderShortcutsEditor(params));
  assert.equal(text.includes("sb-shortcut-strip"), true);
  assert.equal(text.includes("sb-shortcut-panel"), true);
  assert.equal(text.includes("Reset"), true);
  // The stale stored command surfaces as a "(missing)" option, not a blank.
  const openPanelValues = JSON.stringify(
    (renderShortcutsEditor(params) as unknown as { values: unknown[] }).values,
    (_key, value) => (typeof value === "function" ? undefined : value),
  );
  assert.equal(openPanelValues.includes("(missing)"), true);
  // Unavailable commands render the note instead of the form.
  const missingText = templateText(
    renderShortcutsEditor({ ...params, commandsStatus: "cache_miss" as const }),
  );
  assert.equal(missingText.includes("sb-shortcut-note"), true);
});

test("editor lists the Shortcuts group for device selections only", () => {
  const editor = new SofabatonRemoteCardEditor() as unknown as Record<string, any>;
  editor.setConfig({ entity: "remote.r" });
  editor._layoutSelection = "default";
  assert.equal(editor._isEditorGroupVisible("shortcuts", false), false);
  editor._layoutSelection = "101";
  assert.equal(editor._isEditorGroupVisible("shortcuts", true), false);
  editor._layoutSelection = "device:default";
  assert.equal(editor._isEditorGroupVisible("shortcuts", false), true);
  editor._layoutSelection = "device:12";
  assert.equal(editor._isEditorGroupVisible("shortcuts", false), true);
});

test("editor draft writes config only once both fields are valid; reset deletes the slot", () => {
  const editor = new SofabatonRemoteCardEditor() as unknown as Record<string, any>;
  const changes: Array<Record<string, unknown>> = [];
  (editor as unknown as EventTarget).addEventListener("config-changed", (event) => {
    changes.push(
      (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config,
    );
  });
  editor.setConfig({ entity: "remote.r" });
  editor._layoutSelection = "device:12";
  editor._toggleShortcutSlot("left");
  assert.equal(editor._shortcutOpenSlot, "left");

  // Icon alone: draft only, nothing stored.
  editor._onShortcutDraftChanged("mdi:netflix", null);
  assert.equal(changes.length, 0);
  assert.equal("device_mode" in editor._config, false);

  // Both valid: written through, preview config fires.
  editor._onShortcutDraftChanged("mdi:netflix", 7);
  assert.equal(changes.length, 1);
  assert.deepEqual(
    (editor._config.device_mode as Record<string, any>).shortcuts["12"].left,
    { icon: "mdi:netflix", command_id: 7 },
  );

  // Reset deletes the slot and prunes the block.
  editor._resetShortcutSlot("left");
  assert.equal("device_mode" in editor._config, false);
  assert.equal(editor._shortcutDraftIcon, "");

  // Switching layouts closes the panel.
  editor._toggleShortcutSlot("middle");
  editor._onSelectLayout("device:9");
  assert.equal(editor._shortcutOpenSlot, null);
});

test("toggling a slot open seeds the draft from the stored slot", () => {
  const editor = new SofabatonRemoteCardEditor() as unknown as Record<string, any>;
  editor.setConfig({
    entity: "remote.r",
    device_mode: {
      shortcuts: { "12": { right: { icon: "mdi:cog", command_id: 15 } } },
    },
  });
  editor._layoutSelection = "device:12";
  editor._toggleShortcutSlot("right");
  assert.equal(editor._shortcutDraftIcon, "mdi:cog");
  assert.equal(editor._shortcutDraftCommand, 15);
  // Toggling the same slot again closes and clears.
  editor._toggleShortcutSlot("right");
  assert.equal(editor._shortcutOpenSlot, null);
  assert.equal(editor._shortcutDraftIcon, "");
});

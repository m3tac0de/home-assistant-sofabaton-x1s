import test from "node:test";
import assert from "node:assert/strict";
import { SofabatonRemoteCardEditor } from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-element";
import { renderCommandsEditorSection } from "../../custom_components/sofabaton_x1s/www/src/editor-sections/commands-editor";
import { renderStylingOptionsSection } from "../../custom_components/sofabaton_x1s/www/src/editor-sections/styling-options";
import { renderGroupOrderSection } from "../../custom_components/sofabaton_x1s/www/src/editor-sections/group-order";
import { DEFAULT_GROUP_ORDER } from "../../custom_components/sofabaton_x1s/www/src/remote-card-layout";
import { REMOTE_CARD_CSS } from "../../custom_components/sofabaton_x1s/www/src/remote-card-styles";
import type { HassLike } from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";
import type { RemoteCardConfig } from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";

// The editor dispatches window events for the preview-activity handshake;
// give Node a minimal window so setConfig/selection changes can run.
if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
  (globalThis as Record<string, unknown>).window = {
    dispatchEvent: () => true,
  };
}

function templateHasString(template: unknown, expected: string): boolean {
  if (typeof template === "string") return template.includes(expected);
  if (Array.isArray(template)) return template.some((value) => templateHasString(value, expected));
  if (template && typeof template === "object") {
    const maybeTemplate = template as { strings?: unknown[]; values?: unknown[] };
    return templateHasString(maybeTemplate.strings ?? [], expected)
      || templateHasString(maybeTemplate.values ?? [], expected);
  }
  return false;
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

// Tests poke the editor's private mutation methods (house style — see
// backup-tab.test.ts), so the handle is intentionally untyped.
type EditorHandle = Record<string, any> & {
  setConfig(config: RemoteCardConfig): void;
};

function createEditor(config: RemoteCardConfig): {
  editor: EditorHandle;
  changes: Array<Record<string, unknown>>;
} {
  const editor = new SofabatonRemoteCardEditor() as unknown as EditorHandle;
  const changes: Array<Record<string, unknown>> = [];
  (editor as unknown as EventTarget).addEventListener("config-changed", (event) => {
    changes.push((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config);
  });
  editor.setConfig(config);
  return { editor, changes };
}

// ---------- shell: config plumbing ----------

test("editor exposes the active locale direction on its host", () => {
  const { editor } = createEditor({ entity: "" });
  editor.hass = {
    states: {},
    locale: { language: "ar-SA" },
  } as HassLike;
  assert.equal((editor as unknown as HTMLElement).lang, "ar-sa");
  assert.equal((editor as unknown as HTMLElement).dir, "rtl");

  editor.hass = {
    states: {},
    locale: { language: "en-GB" },
  } as HassLike;
  assert.equal((editor as unknown as HTMLElement).dir, "ltr");
});

test("RTL card styling preserves the physical remote-control grid", () => {
  assert.match(REMOTE_CARD_CSS, /:host\(\[dir="rtl"\]\) \.dpad/);
  assert.match(REMOTE_CARD_CSS, /border-inline-start/);
  assert.doesNotMatch(REMOTE_CARD_CSS, /text-align: left !important/);
});

test("editor strips transient keys from incoming config and from fired configs", () => {
  const { editor, changes } = createEditor({
    entity: "remote.living_room",
    preview_activity: "101",
    commands: [{ name: "x" }],
    use_background_override: true,
    background_override: [10, 20, 30],
  } as RemoteCardConfig);

  assert.equal("preview_activity" in editor._config, false);
  assert.equal("commands" in editor._config, false);

  editor._setAutomationAssistEnabled(true);
  assert.equal(changes.length, 1);
  const fired = changes[0];
  assert.equal(fired.show_automation_assist, true);
  assert.equal(fired.entity, "remote.living_room");
  // The helper toggle never reaches the stored config.
  assert.equal("use_background_override" in fired, false);
  assert.equal("preview_activity" in fired, false);
  assert.equal("commands" in fired, false);
  // ...but the real background override survives.
  assert.deepEqual(fired.background_override, [10, 20, 30]);
});

test("merge handler wipes background_override when the toggle turns off", () => {
  const { editor, changes } = createEditor({
    entity: "remote.living_room",
    background_override: [10, 20, 30],
  });

  editor._mergeFormValue({ use_background_override: false });
  assert.equal(changes.length, 1);
  assert.equal("background_override" in changes[0], false);
});

test("merge handler is stable: identical values fire no config-changed", () => {
  const { editor, changes } = createEditor({
    entity: "remote.living_room",
    theme: "Midnight",
  });

  editor._mergeFormValue({ theme: "Midnight" });
  assert.equal(changes.length, 0);
});

test("entity change resets the layout selection to default", () => {
  const { editor, changes } = createEditor({ entity: "remote.living_room" });
  editor._layoutSelection = "101";

  editor._mergeFormValue({ entity: "remote.other" });
  assert.equal(editor._layoutSelection, "default");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].entity, "remote.other");
});

// ---------- shell: group order mutations ----------

test("moving a group by key swaps it with its visible neighbour", () => {
  const { editor, changes } = createEditor({ entity: "remote.living_room" });

  // Default order starts: activity, macro_favorites, ... — moving activity
  // down swaps it with macro_favorites.
  editor._moveGroupByKey("activity", +1);
  assert.equal(changes.length, 1);
  const order = changes[0].group_order as string[];
  assert.equal(order[0], "macro_favorites");
  assert.equal(order[1], "activity");
});

test("moving by key skips rows hidden for the current hub (abc on non-X2)", () => {
  const { editor, changes } = createEditor({ entity: "remote.living_room" });

  // colors is last visible on non-X2 (abc hidden): moving it down is a no-op.
  editor._moveGroupByKey("colors", +1);
  assert.equal(changes.length, 0);
});

test("reset on the default selection restores order and re-enables all groups", () => {
  const { editor, changes } = createEditor({
    entity: "remote.living_room",
    show_nav: false,
    group_order: ["colors", "dpad", "activity"],
  });

  editor._resetGroupOrder();
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].group_order, DEFAULT_GROUP_ORDER.slice());
  assert.equal(changes[0].show_nav, true);
  assert.equal(changes[0].mf_as_rows, false);
});

test("reset on an activity selection drops only that layout override", () => {
  const { editor, changes } = createEditor({
    entity: "remote.living_room",
    layouts: { "101": { show_nav: false }, "102": { show_mid: false } },
  });
  editor._layoutSelection = "101";

  editor._resetGroupOrder();
  assert.equal(changes.length, 1);
  const layouts = changes[0].layouts as Record<string, unknown>;
  assert.equal("101" in layouts, false);
  assert.deepEqual(layouts["102"], { show_mid: false });
});

// ---------- sections: template structure ----------

test("commands section renders the key-capture switch state and wifi pointer", () => {
  const on = renderCommandsEditorSection({
    expanded: true,
    automationAssistEnabled: true,
    onToggleExpanded: () => undefined,
    onSetAutomationAssist: () => undefined,
  });
  assert.equal(templateHasString(on, "sb-yaml-helper-row"), true);
  // The old "Wifi Commands moved" pointer is gone (removed 2026-07-21).
  assert.equal(templateHasString(on, "sb-commands-section-title"), false);
  assert.match(templateText(on), /Key capture/);

  const collapsed = renderCommandsEditorSection({
    expanded: false,
    automationAssistEnabled: false,
    onToggleExpanded: () => undefined,
    onSetAutomationAssist: () => undefined,
  });
  assert.equal(templateHasString(collapsed, "sb-exp-collapsed"), true);
});

test("styling section only offers the color picker while the override is on", () => {
  const base = { entity: "remote.living_room" };
  const schemaNames = (config: RemoteCardConfig): string[] => {
    const result = renderStylingOptionsSection({
      hass: null,
      config,
      expanded: true,
      onToggleExpanded: () => undefined,
      onValueChanged: () => undefined,
    });
    const collect = (template: unknown): string[] => {
      if (Array.isArray(template)) return template.flatMap(collect);
      if (template && typeof template === "object") {
        const record = template as { name?: string; values?: unknown[] };
        const own = typeof record.name === "string" ? [record.name] : [];
        return own.concat(collect(record.values ?? []));
      }
      return [];
    };
    return collect(result);
  };

  assert.equal(schemaNames(base).includes("background_override"), false);
  assert.equal(
    schemaNames({ ...base, use_background_override: true }).includes("background_override"),
    true,
  );
});

function groupOrderParams(overrides: Record<string, unknown> = {}) {
  return {
    hass: null,
    expanded: true,
    selection: "default",
    selectionOptions: [{ value: "default", label: "Default" }],
    selectionNote: "note",
    visibleOrder: ["activity", "macro_favorites", "dpad"],
    isEditorX2: false,
    asRows: false,
    visibleRows: 2,
    sortableReady: false,
    macroEnabled: true,
    favoritesEnabled: true,
    volumeEnabled: true,
    channelEnabled: true,
    mediaEnabled: true,
    dvrEnabled: true,
    isGroupEnabled: () => true,
    groupLabel: (key: string) => key,
    onToggleExpanded: () => undefined,
    onSelectLayout: () => undefined,
    onSetMacro: () => undefined,
    onSetFavorites: () => undefined,
    onSetVolume: () => undefined,
    onSetChannel: () => undefined,
    onSetMedia: () => undefined,
    onSetDvr: () => undefined,
    onSetGroupEnabled: () => undefined,
    onSetMfAsRows: () => undefined,
    onSetMfRowVisibleRows: () => undefined,
    onMoveGroupByKey: () => undefined,
    onMoveGroupByVisibleIndex: () => undefined,
    onResetGroupOrder: () => undefined,
    ...overrides,
  };
}

test("group order section renders up/down buttons until ha-sortable is ready", () => {
  const buttons = renderGroupOrderSection(groupOrderParams());
  assert.equal(templateHasString(buttons, "sb-move-wrap"), true);
  assert.equal(templateHasString(buttons, "ha-sortable"), false);

  const sortable = renderGroupOrderSection(groupOrderParams({ sortableReady: true }));
  assert.equal(templateHasString(sortable, "ha-sortable"), true);
  assert.equal(templateHasString(sortable, "sb-drag-handle"), true);
  assert.equal(templateHasString(sortable, "sb-move-wrap"), false);
});

test("group order section renders one order row per visible group", () => {
  const result = renderGroupOrderSection(groupOrderParams());
  const text = templateText(result);
  assert.equal(text.match(/sb-layout-row-order/g)?.length, 3);
  // The mf rows stepper reflects the disabled state when rows mode is off.
  assert.equal(templateHasString(result, " is-disabled"), true);
});

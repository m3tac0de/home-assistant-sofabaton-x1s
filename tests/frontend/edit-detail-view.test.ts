import test from "node:test";
import assert from "node:assert/strict";
import { LitElement } from "lit";
import {
  sanitizeBundleName,
  useLegacyTextField,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/edit-detail-view";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const EditDetailViewElement = customElements.get("sofabaton-edit-detail-view") as {
  new (): HTMLElement;
};

type EditorElement = HTMLElement & Record<string, any>;

function editorBundle(model: "X1" | "X1S" | "X2" = "X1S"): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living Room", version: model },
    devices: [
      {
        device: { device_id: 1, name: "Television", device_class: "ir" },
        commands: [{
          command_id: 10,
          name: "Power",
          restore_data: {
            transport: "hub_code_record",
            library_type: 0x0E,
            command_code: "00 00 00 00 00 10",
            data_hex: "aa bb cc",
          },
        }],
      },
      {
        device: { device_id: 2, name: "Roku", device_class: "wifi_roku", ip_address: "192.0.2.10" },
        commands: [{ command_id: 20, name: "Home" }],
      },
      {
        device: { device_id: 3, name: "Soundbar", device_class: "ir" },
        commands: [{ command_id: 30, name: "Volume Up" }],
      },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [1],
      favorite_slots: [{ button_id: 1, device_id: 1, command_id: 10, name: "Power" }],
      button_bindings: [],
      macros: [
        {
          button_id: 3,
          name: "Volume Combo",
          steps: [{ device_id: 1, command_id: 10, button_code: 0x4E0A, duration: 0, delay: 0xFF }],
        },
        {
          button_id: 198,
          name: "POWER_ON",
          steps: [
            { device_id: 1, command_id: 0xC6, button_code: 0, duration: 0, delay: 0xFF },
            { device_id: 1, command_id: 0xC5, button_code: 0, duration: 0, delay: 0xFF },
          ],
        },
        {
          button_id: 199,
          name: "POWER_OFF",
          steps: [{ device_id: 1, command_id: 0xC7, button_code: 0, duration: 0, delay: 0xFF }],
        },
      ],
    }],
  } as BackupBundlePayload;
}

function createEditor(
  model: "X1" | "X1S" | "X2" = "X1S",
  kind: "activity" | "device" = "activity",
): EditorElement {
  const element = new EditDetailViewElement() as EditorElement;
  element.bundle = editorBundle(model);
  element.kind = kind;
  element.entityId = kind === "activity" ? 101 : 1;
  element.mode = "backup";
  return element;
}

function controlEvent(value: string): Event {
  const control = { value };
  return { currentTarget: control, target: control } as unknown as Event;
}

function mutableControlEvent(value: string): { event: Event; control: { value: string } } {
  const control = { value };
  return { event: { currentTarget: control, target: control } as unknown as Event, control };
}

function collectBundleChanges(element: EditorElement): BackupBundlePayload[] {
  const changes: BackupBundlePayload[] = [];
  element.addEventListener("bundle-change", (event) => {
    changes.push((event as CustomEvent<{ bundle: BackupBundlePayload }>).detail.bundle);
  });
  return changes;
}

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const value = template as { strings?: unknown[]; values?: unknown[] };
    return templateText(value.strings ?? []) + templateText(value.values ?? []);
  }
  return "";
}

test("name input applies the model-specific sanitizer and 20-character cap", () => {
  const cases = [
    { model: "X1" as const, raw: "TV+ Room_é!42", expected: "TV Room42" },
    { model: "X1S" as const, raw: "TV+ Room_é!42", expected: "TV+ Room_é!42" },
    { model: "X2" as const, raw: "TV+ Room_é!42", expected: "TV+ Room_é!42" },
    { model: "X1S" as const, raw: "Ok/Select 😀", expected: "Ok/Select " },
  ];

  for (const { model, raw, expected } of cases) {
    const element = createEditor(model);
    element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
    const { event, control } = mutableControlEvent(raw);

    element._handleEditRenameDialogInput(event);

    assert.equal(control.value, expected);
    assert.equal(element._editRenameDialogDraft, expected);
    assert.equal(sanitizeBundleName(element.bundle, "A".repeat(35)), "A".repeat(30));
  }
});

test("rename Save emits the exact sanitized bundle while invalid input emits nothing", () => {
  const element = createEditor("X1");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };

  element._handleEditRenameDialogInput(controlEvent("!!!"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 0);
  assert.match(element._editRenameDialogError, /Enter a name/i);
  assert.equal(element._editRenameDialogOpen, true);

  element._handleEditRenameDialogInput(controlEvent("Movie+ Night"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].activities[0].device?.name, "Movie Night");
  assert.equal(element._editRenameDialogOpen, false);
});

test("rename Cancel clears transient state without mutating or emitting", () => {
  const element = createEditor();
  const original = structuredClone(element.bundle);
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
  element._editRenameDialogDraft = "Unsaved name";
  element._editRenameDialogError = "old error";

  element._closeEditRenameDialog();

  assert.deepEqual(element.bundle, original);
  assert.equal(changes.length, 0);
  assert.equal(element._editRenameDialogOpen, false);
  assert.equal(element._editRenameDialogDraft, "");
  assert.equal(element._editRenameDialogTarget, null);
  assert.equal(element._editRenameDialogError, "");
});

test("rename dialog supports both Home Assistant text-field implementations", () => {
  const element = createEditor();
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
  element._editRenameDialogDraft = "Watch TV";

  assert.equal(useLegacyTextField(), false);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-input/);

  customElements.define("ha-textfield", class extends LitElement {});
  assert.equal(useLegacyTextField(), true);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-textfield/);

  customElements.define("ha-input", class extends LitElement {});
  assert.equal(useLegacyTextField(), false);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-input/);
});

test("device IP Save rejects malformed IPv4 and commits a trimmed valid address", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "device_ip", deviceId: 2 };

  element._handleEditRenameDialogInput(controlEvent("192.168.1.256"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 0);
  assert.match(element._editRenameDialogError, /IPv4 address/i);
  assert.equal(element._editRenameDialogOpen, true);

  element._handleEditRenameDialogInput(controlEvent(" 198.51.100.7 "));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].devices[1].device?.ip_address, "198.51.100.7");
  assert.equal(element._editRenameDialogOpen, false);
});

test("the Network section offers the IP pencil in live mode too", () => {
  for (const mode of ["backup", "live"] as const) {
    const element = createEditor("X1S", "device");
    element.entityId = 2;
    element.mode = mode;
    const text = templateText(element._renderDeviceNetworkSection());
    assert.match(text, /192\.0\.2\.10/);
    assert.match(text, /Edit IP address/);
  }
});

test("clearing the device IP is a valid committed edit", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "device_ip", deviceId: 2 };
  element._editRenameDialogDraft = "   ";

  element._applyEditRenameDialog();

  assert.equal(changes.length, 1);
  assert.equal(changes[0].devices[1].device?.ip_address ?? "", "");
});

test("raw payload Save blocks invalid hex and normalizes tolerant valid input", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawSnapshot = "aa bb cc";
  element._payloadDialogRawDraft = "abc";

  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 0);
  assert.match(element._payloadDialogError, /even number of hex digits/i);
  assert.equal(element._payloadDialogOpen, true);

  element._handleRawPayloadInput(controlEvent("0xDE ad\nBE,ef"));
  assert.equal(element._payloadDialogError, "");
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 1);
  const command = changes[0].devices[0].commands?.find((row) => row.command_id === 10);
  assert.equal((command?.restore_data as Record<string, unknown>)?.data_hex, "de ad be ef");
  assert.equal(element._payloadDialogOpen, false);
});

test("raw payload Save does not emit when only formatting changed", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawSnapshot = "aa bb cc";
  element._payloadDialogRawDraft = "0xAA 0xBB 0xCC";

  element._applyCommandPayloadDialog();

  assert.equal(changes.length, 0);
  assert.equal(element._payloadDialogOpen, false);
});

test("decoded-field drafts preserve numeric, escaped, and CRLF wire shapes", () => {
  const element = createEditor("X1S", "device");
  assert.equal(element._draftToFieldValue("42", { numeric: true }), 42);
  assert.equal(element._draftToFieldValue("not-a-number", { numeric: true }), 0);
  assert.equal(element._draftToFieldValue("line\\nnext\\r", { escapedDisplay: true }), "line\nnext\r");
  assert.equal(element._draftToFieldValue("one\ntwo\r\nthree", { crlfOnWire: true }), "one\r\ntwo\r\nthree");
  assert.equal(element._fieldValueToDraft("one\r\ntwo", { escapedDisplay: true }), "one\\r\\ntwo");
});

test("macro timing conversion covers invalid, boundary, rounding, and saturation cases", () => {
  const element = createEditor();
  const cases: Array<[string, number]> = [
    ["", 0],
    ["-1", 0],
    ["0", 0],
    ["0.24", 0],
    ["0.25", 1],
    ["0.3", 1],
    ["0.5", 1],
    ["120", 240],
    ["127.5", 255],
    ["128", 255],
    ["NaN", 0],
    ["Infinity", 0],
  ];
  for (const [raw, expected] of cases) assert.equal(element._secondsToByte(raw), expected, raw);
  assert.equal(element._snapHalfSeconds("0.3"), "0.5");
  assert.equal(element._snapHalfSeconds("-2"), "0");
  assert.equal(element._snapHalfSeconds("999"), "127.5");
});

test("wait change snaps the control and emits the exact attached delay row", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  const { event, control } = mutableControlEvent("0.3");

  element._handleStepWaitChange({ index: 0 }, event);

  assert.equal(control.value, "0.5");
  assert.equal(changes.length, 1);
  const macro = changes[0].activities[0].macros?.find((row) => row.button_id === 3);
  assert.deepEqual(
    macro?.steps?.map((step) => [step.device_id, step.command_id, step.delay]),
    [[1, 10, 0xFF], [0xFF, 0xFF, 1]],
  );
});

test("macro step Save blocks incomplete input and commits a quantized valid step", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  element._stepDialogOpen = true;
  element._stepDialogEditIndex = null;
  element._stepKind = "command";
  element._stepDeviceId = 3;
  element._stepCommandId = null;
  element._stepHoldSeconds = "0.3";

  element._applyStep();
  assert.equal(changes.length, 0);
  assert.notEqual(element._stepError, "");
  assert.equal(element._stepDialogOpen, true);

  element._stepCommandId = 30;
  element._applyStep();
  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  const macro = activity.macros?.find((row) => row.button_id === 3);
  assert.deepEqual(
    macro?.steps?.filter((step) => step.device_id !== 0xFF).map((step) => [step.device_id, step.command_id, step.duration]),
    [[1, 10, 0], [3, 30, 1]],
  );
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._stepDialogOpen, false);
});

test("favorite Save blocks an incomplete selection and sanitizes the committed label", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._addFavoriteOpen = true;
  element._addFavoriteDeviceId = null;
  element._addFavoriteCommandId = null;
  element._addFavoriteName = "";

  element._applyAddFavorite();
  assert.equal(changes.length, 0);
  assert.notEqual(element._addFavoriteError, "");
  assert.equal(element._addFavoriteOpen, true);

  element._handleAddFavoriteDeviceChange(controlEvent("3"));
  element._handleAddFavoriteCommandChange(controlEvent("30"));
  element._handleAddFavoriteNameInput(controlEvent("Sound+bar! " + "X".repeat(30)));
  element._applyAddFavorite();

  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  const added = activity.favorite_slots?.find((slot) => slot.device_id === 3);
  assert.equal(added?.name, "Sound+bar! " + "X".repeat(19));
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._addFavoriteOpen, false);
});

test("binding Save blocks incomplete input and links a valid command target", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._bindingDialogOpen = true;
  element._bindingScope = "activity";
  element._bindingButtonId = 0xB0;
  element._bindingTargetKind = "command";
  element._bindingLongPressEnabled = false;
  element._bindingDeviceId = 3;
  element._bindingCommandId = null;

  element._applyBinding();
  assert.equal(changes.length, 0);
  assert.notEqual(element._bindingError, "");
  assert.equal(element._bindingDialogOpen, true);

  element._bindingCommandId = 30;
  element._applyBinding();
  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  assert.deepEqual(activity.button_bindings, [
    { button_id: 0xB0, button_name: "OK", device_id: 3, command_id: 30 },
  ]);
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._bindingDialogOpen, false);
});

// Start a live device editor with a blob-free command 10 (the structural
// cache carries no payloads), like the real Activities-tab bundle.
function createLiveDeviceEditor(): EditorElement {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  element.mode = "live";
  element.bundle.devices[0].commands[0] = { command_id: 10, name: "Power" };
  return element;
}

test("the Test button gates on IR; editing is offered for all classes", () => {
  const element = createEditor("X1S", "device");
  element.mode = "live";
  element.entityId = 1;
  assert.equal(element._liveDeviceIsIr(), true); // IR → Test available
  element.entityId = 2; // wifi_roku → no Test, but editing still works (below)
  assert.equal(element._liveDeviceIsIr(), false);
});

test("live command rename commits a name change", () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element._openDeviceCommandRenameDialog(10);
  assert.equal(element._editRenameDialogOpen, true);
  element._editRenameDialogDraft = "Power Toggle";
  element._applyEditRenameDialog();

  assert.equal(changes.length, 1);
  assert.equal((changes[0] as any).devices[0].commands[0].name, "Power Toggle");
  assert.equal(element._editRenameDialogOpen, false);
});

test("live payload editing works for a non-IR device via the structured form", async () => {
  const element = createEditor("X1S", "device");
  element.entityId = 2; // wifi_roku, command 20
  element.mode = "live";
  const changes = collectBundleChanges(element);
  element.fetchCommandPayload = async () => ({
    dataHex: "1e 6c 61 75 6e 63 68",
    decoded: { class: "wifi_roku", trailer_hex: "", fields: { path: "launch/1234" } },
  });

  await element._liveFetchAndOpenPayload(20);
  assert.equal(element._payloadDialogOpen, true);
  assert.equal(element._payloadDialogDecodedSnapshot.className, "wifi_roku");

  element._payloadDialogDecodedDrafts = { ...element._payloadDialogDecodedDrafts, path: "launch/9999" };
  element._applyCommandPayloadDialog();

  assert.equal(changes.length, 1);
  const command = (changes[0] as any).devices[1].commands[0];
  assert.equal(command.restore_data.decoded.edited, true);
  assert.equal(command.restore_data.decoded.fields.path, "launch/9999");
});

test("live payload edit fetches on demand, edits, and commits the edited marker", async () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  let fetchArgs: { deviceId: number; commandId: number } | null = null;
  element.fetchCommandPayload = async (deviceId: number, commandId: number) => {
    fetchArgs = { deviceId, commandId };
    return { dataHex: "0a 4f 22", decoded: null };
  };

  await element._liveFetchAndOpenPayload(10);
  assert.deepEqual(fetchArgs, { deviceId: 1, commandId: 10 });
  assert.equal(element._payloadDialogOpen, true);
  assert.equal(element._payloadDialogRawDraft, "0a 4f 22");
  // Merely fetching must not mark the bundle dirty.
  assert.equal(changes.length, 0);

  element._payloadDialogRawDraft = "de ad be ef";
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 1);
  const command = (changes[0] as any).devices[0].commands[0];
  assert.equal(command.restore_data.data_hex, "de ad be ef");
  assert.equal(command.restore_data.edited, true);
  assert.equal(element._payloadDialogOpen, false);
});

test("live payload edit with no change commits nothing", async () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });

  await element._liveFetchAndOpenPayload(10);
  element._applyCommandPayloadDialog(); // draft === snapshot
  assert.equal(changes.length, 0);
  assert.equal(element._payloadDialogOpen, false);
});

test("live payload Test plays the current draft via the host callback", async () => {
  const element = createLiveDeviceEditor();
  let played: string | null = null;
  element.testCommandPayload = async (hex: string) => { played = hex; };
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });

  await element._liveFetchAndOpenPayload(10);
  element._payloadDialogRawDraft = "de ad be ef";
  await element._runLivePayloadTest();

  assert.equal(played, "de ad be ef");
  assert.equal(element._payloadDialogTestStatus, "success");
});

test("live payload fetch failure surfaces an error and opens nothing", async () => {
  const element = createLiveDeviceEditor();
  element.fetchCommandPayload = async () => { throw new Error("hub busy"); };

  await element._liveFetchAndOpenPayload(10);
  assert.equal(element._payloadDialogOpen, false);
  assert.equal(element._payloadFetchError, "hub busy");
  assert.equal(element._payloadFetchingCommandId, null);
});

test("delete confirm copy matches the mode and delete kind", () => {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  element._confirmDeleteLabel = "Television";
  element._confirmDeleteTarget = { kind: "device", deviceId: 1 };

  // Backup mode: reaches the hub only via Replace restore.
  element.mode = "backup";
  let text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("Replace restore"));

  // Live mode, device delete: hits the hub immediately, no "backup" wording.
  element.mode = "live";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("applied to the hub immediately"));
  assert.ok(!text.includes("Replace restore"));
  assert.ok(!text.includes("loaded backup"));
  assert.ok(!text.includes("in the backup"));

  // Live mode, row-level (macro) delete: rides the next Sync.
  element.kind = "activity";
  element.entityId = 101;
  element._confirmDeleteTarget = { kind: "macro", activityId: 101, buttonId: 3 };
  element._confirmDeleteLabel = "Volume Combo";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("next Sync"));
  assert.ok(!text.includes("Replace restore"));
});

test("payload test hint shows only when editing an IR command", () => {
  const element = createLiveDeviceEditor(); // device 1 = ir
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawDraft = "0a 4f 22";
  let text = templateText(element._renderCommandPayloadDialog());
  assert.ok(text.includes("Verify a changed payload"));

  // Non-IR device (2 = wifi_roku): no Test, so the test hint is hidden.
  element.entityId = 2;
  element._payloadDialogTarget = { deviceId: 2, commandId: 20 };
  text = templateText(element._renderCommandPayloadDialog());
  assert.ok(!text.includes("Verify a changed payload"));
});

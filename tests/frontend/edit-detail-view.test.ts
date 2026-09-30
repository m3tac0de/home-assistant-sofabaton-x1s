import test from "node:test";
import assert from "node:assert/strict";
import { LitElement } from "lit";
import {
  editorErrorMessage,
  sanitizeBundleName,
  useLegacyTextField,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/edit-detail-view";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { secondsToByte } from "../../custom_components/sofabaton_x1s/www/src/shared/hub-rules";
import { draftToFieldValue, fieldValueToDraft } from "../../custom_components/sofabaton_x1s/www/src/tabs/edit-detail/payload-drafts";
import { TOOLS_CARD_STRINGS, setToolsCardLanguage } from "../../custom_components/sofabaton_x1s/www/src/strings";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";

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
  element._payload.open = true;
  element._payload.target = { deviceId: 1, commandId: 10 };
  element._payload.decodedSnapshot = null;
  element._payload.rawSnapshot = "aa bb cc";
  element._payload.rawDraft = "abc";

  element._payload.apply();
  assert.equal(changes.length, 0);
  assert.match(element._payload.error, /even number of hex digits/i);
  assert.equal(element._payload.open, true);

  element._payload.handleRawInput(controlEvent("0xDE ad\nBE,ef"));
  assert.equal(element._payload.error, "");
  element._payload.apply();
  assert.equal(changes.length, 1);
  const command = changes[0].devices[0].commands?.find((row) => row.command_id === 10);
  assert.equal((command?.restore_data as Record<string, unknown>)?.data_hex, "de ad be ef");
  assert.equal(element._payload.open, false);
});

test("payload dialog footer links the command payload documentation beside the error note", () => {
  const element = createEditor("X1S", "device");
  element._payload.open = true;
  element._payload.target = { deviceId: 1, commandId: 10 };
  element._payload.decodedSnapshot = null;
  element._payload.rawSnapshot = "aa bb cc";
  element._payload.rawDraft = "abc";

  let text = templateText(element._payload.render());
  assert.ok(text.includes("payload-doc-link"));
  assert.ok(text.includes("docs/command_payloads.md"));
  assert.ok(text.includes("Payload documentation"));
  assert.ok(!text.includes("payload-dialog-error"));

  element._payload.apply();
  text = templateText(element._payload.render());
  assert.ok(text.includes("payload-doc-link"));
  assert.ok(text.includes("payload-dialog-error"));
  assert.match(text, /even number of hex digits/i);
});

test("raw payload Save does not emit when only formatting changed", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._payload.open = true;
  element._payload.target = { deviceId: 1, commandId: 10 };
  element._payload.decodedSnapshot = null;
  element._payload.rawSnapshot = "aa bb cc";
  element._payload.rawDraft = "0xAA 0xBB 0xCC";

  element._payload.apply();

  assert.equal(changes.length, 0);
  assert.equal(element._payload.open, false);
});

test("decoded-field drafts preserve numeric, escaped, and CRLF wire shapes", () => {
  // Pure functions since the edit-detail split (R6, CR-F2-14).
  const field = (spec: Record<string, unknown>) => spec as never;
  assert.equal(draftToFieldValue("42", field({ numeric: true })), 42);
  assert.equal(draftToFieldValue("not-a-number", field({ numeric: true })), 0);
  assert.equal(draftToFieldValue("line\\nnext\\r", field({ escapedDisplay: true })), "line\nnext\r");
  assert.equal(draftToFieldValue("one\ntwo\r\nthree", field({ crlfOnWire: true })), "one\r\ntwo\r\nthree");
  assert.equal(fieldValueToDraft("one\r\ntwo", field({ escapedDisplay: true })), "one\\r\\ntwo");
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
  // The conversion is the shared rule (shared/hub-rules.ts, CR-X6-3) the panel uses too.
  for (const [raw, expected] of cases) assert.equal(secondsToByte(raw), expected, raw);
  assert.equal(element._snapHalfSeconds("0.3"), "0.5");
  assert.equal(element._snapHalfSeconds("-2"), "0");
  assert.equal(element._snapHalfSeconds("999"), "127.5");
});

test("wait change snaps the control and emits the exact attached delay row", () => {
  const element = createEditor();
  // A second step so index 0 isn't the last group (a last-group wait is
  // normalized to 0 and its control is never rendered).
  element.bundle.activities[0].macros![0].steps!.push(
    { device_id: 1, command_id: 10, button_code: 0x4E0A, duration: 0, delay: 0xFF },
  );
  const changes = collectBundleChanges(element);
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  const { event, control } = mutableControlEvent("0.3");

  element._handleStepWaitChange({ index: 0 }, event);

  assert.equal(control.value, "0.5");
  assert.equal(changes.length, 1);
  const macro = changes[0].activities[0].macros?.find((row) => row.button_id === 3);
  assert.deepEqual(
    macro?.steps?.map((step) => [step.device_id, step.command_id, step.delay]),
    [[1, 10, 0xFF], [0xFF, 0xFF, 1], [1, 10, 0xFF]],
  );
});

test("the attached-wait sub-row renders under every step except the last", () => {
  const element = createEditor();
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  const item = { index: 0, kind: "command", commandId: 10, deviceId: 1, label: "TV · Power", hold: 0, wait: 2 };
  assert.ok(templateText(element._renderMacroStepRow(item, 0, 2)).includes("step-wait"));
  assert.ok(!templateText(element._renderMacroStepRow(item, 1, 2)).includes("step-wait"));
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

test("favorite Save blocks an incomplete selection and commits the command's label", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._addFavoriteOpen = true;
  element._addFavoriteDeviceId = null;
  element._addFavoriteCommandId = null;

  element._applyAddFavorite();
  assert.equal(changes.length, 0);
  assert.notEqual(element._addFavoriteError, "");
  assert.equal(element._addFavoriteOpen, true);

  element._handleAddFavoriteDeviceChange(controlEvent("3"));
  element._handleAddFavoriteCommandChange(controlEvent("30"));
  element._applyAddFavorite();

  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  const added = activity.favorite_slots?.find((slot) => slot.device_id === 3);
  // A favorite has no name of its own: the remote shows it under the
  // referenced command's name, so the row carries that label verbatim.
  assert.equal(added?.name, "Volume Up");
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
  assert.equal(element._payload.liveDeviceIsIr(), true); // IR → Test available
  element.entityId = 2; // wifi_roku → no Test, but editing still works (below)
  assert.equal(element._payload.liveDeviceIsIr(), false);
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

  await element._payload.liveFetchAndOpen(20);
  assert.equal(element._payload.open, true);
  assert.equal(element._payload.decodedSnapshot.className, "wifi_roku");

  element._payload.decodedDrafts = { ...element._payload.decodedDrafts, path: "launch/9999" };
  element._payload.apply();

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

  await element._payload.liveFetchAndOpen(10);
  assert.deepEqual(fetchArgs, { deviceId: 1, commandId: 10 });
  assert.equal(element._payload.open, true);
  assert.equal(element._payload.rawDraft, "0a 4f 22");
  // Merely fetching must not mark the bundle dirty.
  assert.equal(changes.length, 0);

  element._payload.rawDraft = "de ad be ef";
  element._payload.apply();
  assert.equal(changes.length, 1);
  const command = (changes[0] as any).devices[0].commands[0];
  assert.equal(command.restore_data.data_hex, "de ad be ef");
  assert.equal(command.restore_data.edited, true);
  assert.equal(element._payload.open, false);
});

test("live payload edit with no change commits nothing", async () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });

  await element._payload.liveFetchAndOpen(10);
  element._payload.apply(); // draft === snapshot
  assert.equal(changes.length, 0);
  assert.equal(element._payload.open, false);
});

test("live payload Test plays the current draft via the host callback", async () => {
  const element = createLiveDeviceEditor();
  let played: string | null = null;
  element.testCommandPayload = async (hex: string) => { played = hex; };
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });

  await element._payload.liveFetchAndOpen(10);
  element._payload.rawDraft = "de ad be ef";
  await element._payload.runLiveTest();

  assert.equal(played, "de ad be ef");
  assert.equal(element._payload.testStatus, "success");
});

test("live payload fetch failure surfaces an error and opens nothing", async () => {
  const element = createLiveDeviceEditor();
  element.fetchCommandPayload = async () => { throw new Error("hub busy"); };

  await element._payload.liveFetchAndOpen(10);
  assert.equal(element._payload.open, false);
  assert.equal(element._payload.fetchError, "hub busy");
  assert.equal(element._payload.fetchingCommandId, null);
});

test("hub refusals in the live editor show localized copy, never [object Object] (CR-F2-1)", async () => {
  const E = TOOLS_CARD_STRINGS.errors;
  const element = createLiveDeviceEditor();
  element.fetchCommandPayload = async () => { throw { code: "no_response", message: "Hub did not respond" }; };
  await element._payload.liveFetchAndOpen(10);
  assert.equal(element._payload.fetchError, E.hubNoResponse);

  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });
  element.testCommandPayload = async () => { throw { code: "unavailable", message: "proxy client connected?" }; };
  await element._payload.liveFetchAndOpen(10);
  await element._payload.runLiveTest();
  assert.equal(element._payload.testError, E.hubNotReady);

  assert.equal(editorErrorMessage({ code: "duplicate_name", message: "exists" }, "wifi_event"), E.wifiEventNameTaken);
  assert.equal(editorErrorMessage({ code: "busy", message: "Hub is busy" }, "wifi_event"), E.anotherOperation);
  assert.equal(editorErrorMessage({ code: "invalid_blob", message: "bad" }, "hub_request"), E.payloadInvalid);
  assert.equal(editorErrorMessage(new Error("our own copy"), "hub_request"), "our own copy");
});

test("delete confirm copy matches the mode and delete kind", () => {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  element._confirmDeleteLabel = "Television";
  element._confirmDeleteTarget = { kind: "device", deviceId: 1 };

  // Backup mode: reaches the hub only when existing data is erased on restore.
  element.mode = "backup";
  let text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("Erase existing devices and activities"));

  // Live mode, device delete: hits the hub immediately, no "backup" wording.
  element.mode = "live";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("applied to the hub immediately"));
  assert.ok(!text.includes("Erase existing devices and activities"));
  assert.ok(!text.includes("loaded backup"));
  assert.ok(!text.includes("in the backup"));

  // Live mode, row-level (macro) delete: rides the next Sync.
  element.kind = "activity";
  element.entityId = 101;
  element._confirmDeleteTarget = { kind: "macro", activityId: 101, buttonId: 3 };
  element._confirmDeleteLabel = "Volume Combo";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("next Sync"));
  assert.ok(!text.includes("Erase existing devices and activities"));
});

test("payload test hint shows only when editing an IR command", () => {
  const element = createLiveDeviceEditor(); // device 1 = ir
  element._payload.open = true;
  element._payload.target = { deviceId: 1, commandId: 10 };
  element._payload.decodedSnapshot = null;
  element._payload.rawDraft = "0a 4f 22";
  let text = templateText(element._payload.render());
  assert.ok(text.includes("Verify a changed payload"));

  // Non-IR device (2 = wifi_roku): no Test, so the test hint is hidden.
  element.entityId = 2;
  element._payload.target = { deviceId: 2, commandId: 20 };
  text = templateText(element._payload.render());
  assert.ok(!text.includes("Verify a changed payload"));
});

function managedWifiBundle(): BackupBundlePayload {
  const bundle = editorBundle("X1S");
  bundle.devices = [
    ...(bundle.devices ?? []),
    {
      device: { device_id: 8, name: "Lights", device_class: "wifi_ip", brand: "m3-benchwifi-abc123" },
      commands: [{ command_id: 1, name: "Dim" }],
    },
  ];
  return bundle;
}

test("live editor locks a managed Wifi Device to read-only (rename kept, delete + sections gone)", () => {
  const element = new EditDetailViewElement() as EditorElement;
  element.bundle = managedWifiBundle();
  element.kind = "device";
  element.entityId = 8;
  element.mode = "live";

  assert.equal(element._isManagedWifiLiveDevice(), true);
  assert.deepEqual(element._editDetailSectionItems("device"), []);

  const body = templateText(element._renderManagedWifiLockNotice());
  assert.ok(body.includes("Managed by Wifi Commands"));

  const buttons = templateText(element._renderDetailRenameDeleteButtons("device"));
  assert.ok(buttons.includes("mdi:pencil")); // rename kept
  assert.ok(!buttons.includes("mdi:trash-can-outline")); // delete removed
});

test("live editor leaves an unmanaged device fully editable", () => {
  const element = new EditDetailViewElement() as EditorElement;
  element.bundle = managedWifiBundle();
  element.kind = "device";
  element.entityId = 2; // plain wifi_roku, no managed brand
  element.mode = "live";

  assert.equal(element._isManagedWifiLiveDevice(), false);
  assert.ok(element._editDetailSectionItems("device").length > 0);
  const buttons = templateText(element._renderDetailRenameDeleteButtons("device"));
  assert.ok(buttons.includes("mdi:trash-can-outline")); // delete present
});

test("the offline backup editor never locks a managed Wifi Device", () => {
  const element = new EditDetailViewElement() as EditorElement;
  element.bundle = managedWifiBundle();
  element.kind = "device";
  element.entityId = 8;
  element.mode = "backup"; // restore-time editing stays available

  assert.equal(element._isManagedWifiLiveDevice(), false);
  assert.ok(element._editDetailSectionItems("device").length > 0);
});

// ── Live command removal on every device ──────────────────────────────

test("live editor offers command delete on a regular device", () => {
  const element = createLiveDeviceEditor(); // device 1 = plain IR, live
  const row = templateText(element._renderDeviceCommandRow({ deviceId: 1, commandId: 10, label: "Power" }));
  assert.ok(row.includes("mdi:trash-can-outline"));
  assert.ok(row.includes(TOOLS_CARD_STRINGS.backup.deleteCommandAria));
});

test("live command delete mirrors the hub cascade but keeps activity membership", () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element._confirmDeleteTarget = { kind: "command", deviceId: 1, commandId: 10 };
  element._confirmDeleteLabel = "Power";
  element._confirmDelete();

  const next = changes.at(-1)!;
  const device = next.devices.find((d) => d.device?.device_id === 1)!;
  assert.deepEqual(device.commands?.map((c) => c.command_id), []);
  const act = next.activities.find((a) => a.device?.device_id === 101)!;
  // Favorite + user-macro step on (1, 10) are gone, like the hub's cascade …
  assert.deepEqual(act.favorite_slots, []);
  assert.deepEqual(act.macros?.find((m) => m.button_id === 3)?.steps, []);
  // … while membership (power rows + linked-device mirror) is untouched, so
  // the device sync's scope guard still accepts the activity.
  assert.deepEqual(act.referenced_source_device_ids, [1]);
  assert.equal(act.macros?.find((m) => m.button_id === 198)?.steps?.length, 2);
  assert.equal(act.macros?.find((m) => m.button_id === 199)?.steps?.length, 1);
  assert.equal(element._confirmDeleteTarget, null);
});

test("offline command delete still reconciles activity membership", () => {
  const element = createEditor("X1S", "device"); // backup mode, device 1
  const changes = collectBundleChanges(element);
  element._confirmDeleteTarget = { kind: "command", deviceId: 1, commandId: 10 };
  element._confirmDeleteLabel = "Power";
  element._confirmDelete();
  const act = changes.at(-1)!.activities.find((a) => a.device?.device_id === 101)!;
  assert.deepEqual(act.referenced_source_device_ids, []);
});

// ── IR8: payload editor format tabs ────────────────────────────────────

function irLiveEditor(model: "X1" | "X1S" | "X2" = "X1S"): EditorElement {
  const element = createEditor(model, "device");
  element.mode = "live";
  element.entityId = 1; // IR device
  return element;
}

// A real Sofabaton blob (Samsung VOLUME_UP double frame is overkill here;
// a short NEC fragment suffices) and its pronto rendering, produced by the
// shared converter so the test tracks the golden layout.
const IR_BLOB_HEX = "0010 000000009470 0000232800001194000002300000069a 00000000".replace(/\s/g, "");

test("IR payload opens on the pronto tab and renders pronto text", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  assert.equal(element._payload.prontoAvailable, true);
  assert.equal(element._payload.hexTab, "pronto");
  assert.match(element._payload.prontoDraft, /^0000 /);
  // sofabaton bytes remain the source of truth for Test/Save
  assert.match(element._payload.rawDraft.replace(/\s/g, ""), /^0010000000009470/);
});

test("editing pronto writes through to the sofabaton bytes", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  const pronto = element._payload.prontoDraft;
  // round-trip: feed the same pronto back through the pronto handler
  element._payload.handleProntoInput(controlEvent(pronto));
  assert.equal(element._payload.formatError, "");
  // declared length (0010) + zero format field survive; the carrier
  // re-quantizes through the pronto frequency word (38000 -> 38029), so
  // assert the structural prefix, not the exact carrier bytes.
  assert.match(element._payload.rawDraft.replace(/\s/g, ""), /^001000000000[0-9a-f]{4}/);
});

test("invalid pronto sets a format error and blocks save", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element._payload.handleProntoInput(controlEvent("0000 006D 0002 0000 00AB"));
  assert.notEqual(element._payload.formatError, "");
  const changes = collectBundleChanges(element);
  element._payload.apply();
  assert.equal(changes.length, 0); // save refused while format error stands
});

test("pasting pronto into the sofabaton tab morphs to the pronto tab", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element._payload.hexTab = "sofabaton";
  const pronto = "0000 006D 0002 0000 00AB 00AB 0015 06AE";
  element._payload.handleRawInput(controlEvent(pronto));
  assert.equal(element._payload.hexTab, "pronto");
  assert.equal(element._payload.prontoDraft, pronto);
});

test("a non-timing blob disables the pronto tab (sofabaton passthrough)", () => {
  const element = irLiveEditor();
  // descriptive P: blob body -> parseSofabatonBlob throws -> pronto off
  element._payload.openLive(1, 10, { dataHex: "00 11", decoded: null });
  assert.equal(element._payload.prontoAvailable, false);
  assert.equal(element._payload.hexTab, "sofabaton");
});

test("pasting a descriptor into an X2 IR payload morphs to descriptor mode", () => {
  const element = irLiveEditor("X2");
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element._payload.handleProntoInput(controlEvent("P:Sony12 R:40000 D:1 F:18 MUL:2"));
  assert.ok(element._payload.decodedSnapshot);
  assert.equal(element._payload.decodedSnapshot.className, "ir");
  assert.equal(element._payload.decodedDrafts.descriptor, "P:Sony12 R:40000 D:1 F:18 MUL:2");
});

test("a descriptor paste on a non-X2 hub is rejected, not applied", () => {
  const element = irLiveEditor("X1S");
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element._payload.handleProntoInput(controlEvent("P:Sony12 R:40000 D:1 F:18 MUL:2"));
  assert.equal(element._payload.decodedSnapshot, null); // stayed in hex mode
  assert.notEqual(element._payload.formatError, "");
});

// ── IR10: Unfolded Circle pastes ───────────────────────────────────────
// Detection is local; rendering goes through the host's convert callback
// (backend + infrared-protocols). The stub below plays the backend.

const UC_ONKYO = "3;0x4B36D32C;32;0";
const UC_RESPONSE = {
  format: "uc_hex" as const,
  timings_us: [9000, 4500, 560, 1690],
  carrier_hz: 38000,
  pronto_hex: "0000 006D 0002 0000 0156 00AB 0015 0040",
  sofabaton_hex: IR_BLOB_HEX,
  protocol: 3,
  protocol_name: "NEC",
  bits: 32,
  repeat: 0,
};
// `settle()` (declared below, hoisted) drains the microtask queue between steps.

test("pasting a UC HEX code converts through the host and lands on the pronto tab", async () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  const calls: string[] = [];
  element.convertForeignPayload = async (text: string) => {
    calls.push(text);
    return UC_RESPONSE;
  };
  element._payload.handleProntoInput(controlEvent(UC_ONKYO));
  // pending: the pasted code stays visible, Test/Save are fenced off
  assert.equal(element._payload.converting, true);
  assert.equal(element._payload.prontoDraft, UC_ONKYO);
  const changes = collectBundleChanges(element);
  element._payload.apply();
  assert.equal(changes.length, 0);
  assert.equal(element._payload.error, TOOLS_CARD_STRINGS.backup.ucHexConverting);
  await settle();
  assert.deepEqual(calls, [UC_ONKYO]);
  assert.equal(element._payload.converting, false);
  assert.equal(element._payload.formatError, "");
  assert.equal(element._payload.hexTab, "pronto");
  // the backend's sofabaton bytes are the truth; pronto is re-derived from them
  assert.equal(element._payload.rawDraft.replace(/\s/g, ""), IR_BLOB_HEX);
  assert.match(element._payload.prontoDraft, /^0000 /);
});

test("a UC HEX row on the sofabaton tab converts too and names a new command", async () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element._payload.addMode = true;
  element._payload.nameDraft = "";
  element._payload.hexTab = "sofabaton";
  const calls: string[] = [];
  element.convertForeignPayload = async (text: string) => {
    calls.push(text);
    return UC_RESPONSE;
  };
  element._payload.handleRawInput(controlEvent('"Volume-Up","HEX","3;0x4BB640BF;32;0"'));
  await settle();
  assert.deepEqual(calls, ["3;0x4BB640BF;32;0"]);
  assert.match(element._payload.nameDraft, /^Volume.Up$/);
  assert.equal(element._payload.hexTab, "pronto");
});

test("a UC codeset row with a PRONTO code unwraps locally without the host", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element.convertForeignPayload = null;
  const pronto = "0000 006D 0002 0000 00AB 00AB 0015 06AE";
  element._payload.handleProntoInput(controlEvent(`"Power_Toggle","PRONTO","${pronto}"`));
  assert.equal(element._payload.converting, false);
  assert.equal(element._payload.formatError, "");
  assert.equal(element._payload.hexTab, "pronto");
  assert.equal(element._payload.prontoDraft, pronto);
});

test("a UC code the backend refuses stays in the box with the refusal", async () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element.convertForeignPayload = async () => {
    throw { code: "uc_hex_unsupported_protocol", message: "JVC (6)" };
  };
  element._payload.handleProntoInput(controlEvent("6;0x1234;16;0"));
  await settle();
  assert.equal(element._payload.converting, false);
  assert.equal(element._payload.prontoDraft, "6;0x1234;16;0");
  assert.equal(
    element._payload.formatError,
    TOOLS_CARD_STRINGS.backup.ucHexUnsupported("JVC (6)"),
  );
  const changes = collectBundleChanges(element);
  element._payload.apply();
  assert.equal(changes.length, 0); // save refused while the error stands
});

test("a refusal message that is not a protocol label is not shown", async () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element.convertForeignPayload = async () => {
    throw { code: "uc_hex_unsupported_bits", message: "Traceback: something exploded!" };
  };
  element._payload.handleProntoInput(controlEvent("3;0x1234;16;0"));
  await settle();
  assert.equal(
    element._payload.formatError,
    TOOLS_CARD_STRINGS.backup.ucHexUnsupported(TOOLS_CARD_STRINGS.backup.ucHexUnknownProtocol),
  );
});

test("without a host converter a UC HEX code is refused, not applied", () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  element.convertForeignPayload = null;
  const before = element._payload.rawDraft;
  element._payload.handleProntoInput(controlEvent(UC_ONKYO));
  assert.equal(element._payload.converting, false);
  assert.equal(element._payload.formatError, TOOLS_CARD_STRINGS.backup.ucHexNoHost);
  assert.equal(element._payload.rawDraft, before);
});

test("typing over an in-flight conversion supersedes it", async () => {
  const element = irLiveEditor();
  element._payload.openLive(1, 10, { dataHex: IR_BLOB_HEX, decoded: null });
  let release: (value: typeof UC_RESPONSE) => void = () => {};
  element.convertForeignPayload = () => new Promise((resolve) => { release = resolve; });
  element._payload.handleProntoInput(controlEvent(UC_ONKYO));
  assert.equal(element._payload.converting, true);
  const pronto = "0000 006D 0002 0000 00AB 00AB 0015 06AE";
  element._payload.handleProntoInput(controlEvent(pronto));
  assert.equal(element._payload.converting, false);
  release(UC_RESPONSE);
  await settle();
  // the late result must not overwrite what the user typed afterwards
  assert.equal(element._payload.prontoDraft, pronto);
});

test("a UC HEX paste into the X2 descriptor field converts as well", async () => {
  const element = irLiveEditor("X2");
  await element._payload.openAdd(); // descriptor form
  const calls: string[] = [];
  element.convertForeignPayload = async (text: string) => {
    calls.push(text);
    return UC_RESPONSE;
  };
  element._payload.handleDecodedFieldInput(controlEvent(UC_ONKYO), "descriptor");
  await settle();
  assert.deepEqual(calls, [UC_ONKYO]);
  assert.equal(element._payload.decodedSnapshot, null); // hex mode now
  assert.equal(element._payload.hexTab, "pronto");
});

test("add-command on a non-X2 IR device opens the hex tabs, not the descriptor", async () => {
  const element = irLiveEditor("X1S");
  await element._payload.openAdd();
  assert.equal(element._payload.addMode, true);
  assert.equal(element._payload.decodedSnapshot, null); // hex mode
});

test("add-command on an X2 IR device opens the descriptor form", async () => {
  const element = irLiveEditor("X2");
  await element._payload.openAdd();
  assert.equal(element._payload.addMode, true);
  assert.ok(element._payload.decodedSnapshot);
  assert.equal(element._payload.decodedSnapshot.className, "ir");
});

// ── Payload-editor learn mode (IR9) ──────────────────────────────────
// The hub receiver is a listener (one window per attempt, cancel on the
// way out); the HA emitter is an inbox (backend ring replayed + pushed).
// Both land the captured Sofabaton bytes in the hex editor with a note.

type LearnEventSink = (event: Record<string, unknown>) => void;
type EmissionSink = (emissions: Record<string, unknown>[]) => void;

function learnHost(overrides: Partial<{
  available: boolean;
  consumers: unknown[];
  consumersFails: boolean;
  emissionsFails: boolean;
}> = {}) {
  const calls = {
    learnEvents: null as LearnEventSink | null,
    learnCancelled: 0,
    learnTimeout: 0,
    emissionSink: null as EmissionSink | null,
    emissionsUnsubscribed: 0,
    consumersCalls: 0,
  };
  const host = {
    learnFromHub: async (onEvent: LearnEventSink, timeoutS: number) => {
      calls.learnEvents = onEvent;
      calls.learnTimeout = timeoutS;
      return () => { calls.learnCancelled += 1; };
    },
    subscribeEmissions: async (onEvent: EmissionSink) => {
      if (overrides.emissionsFails) throw new Error("backend transport gone");
      calls.emissionSink = onEvent;
      return () => { calls.emissionsUnsubscribed += 1; };
    },
    consumers: async () => {
      calls.consumersCalls += 1;
      if (overrides.consumersFails) throw new Error("boom");
      return {
        available: overrides.available ?? true,
        emitter_entity_id: "infrared.x1_hub_ir_emitter",
        consumers: overrides.consumers ?? [
          { entry_id: "s1", domain: "samsung_infrared", title: "Samsung TV", entities: [{ entity_id: "remote.tv", name: "TV Remote" }] },
        ],
      };
    },
  };
  return { host, calls };
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function openLearnEditor(host: unknown): EditorElement {
  const element = createLiveDeviceEditor();
  element.irLearn = host;
  element._payload.openAddWithSnapshot(1, null);
  return element;
}

test("learn mode is offered only for live IR devices with a host facade", () => {
  const element = createLiveDeviceEditor();
  assert.equal(element._learnAvailable(), false); // no facade
  element.irLearn = learnHost().host;
  assert.equal(element._learnAvailable(), true);
  element.entityId = 2; // wifi_roku
  assert.equal(element._learnAvailable(), false);
  element.entityId = 1;
  element.mode = "backup";
  assert.equal(element._learnAvailable(), false);
});

test("entering learn mode opens the menu, subscribes the inbox and gates the HA option", async () => {
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);

  await element._learn.enter();
  await settle();

  assert.equal(element._learn.view, "menu");
  assert.equal(calls.consumersCalls, 1);
  assert.ok(calls.emissionSink, "inbox subscription opened with the menu");
  assert.equal(element._learn.haAvailable, true);
  assert.equal(element._learn.haOptionVisible(), true); // a consumer exists

  element._payload.close();
  assert.equal(element._learn.view, "off");
  assert.equal(calls.emissionsUnsubscribed, 1);
});

test("the HA option needs the emitter plus a consumer or a non-empty inbox", async () => {
  {
    const { host } = learnHost({ available: false });
    const element = openLearnEditor(host);
    await element._learn.enter();
    await settle();
    assert.equal(element._learn.haOptionVisible(), false);
    element._payload.close();
  }
  {
    const { host, calls } = learnHost({ consumers: [] });
    const element = openLearnEditor(host);
    await element._learn.enter();
    await settle();
    assert.equal(element._learn.haOptionVisible(), false);
    calls.emissionSink!([{ label: "ProntoHexCommand (abcd1234)", payload_hex: "aabb", when: "2026-09-02T10:00:00+00:00", count: 1 }]);
    assert.equal(element._learn.haOptionVisible(), true);
    element._payload.close();
  }
  {
    const { host } = learnHost({ consumersFails: true });
    const element = openLearnEditor(host);
    await element._learn.enter();
    await settle();
    assert.equal(element._learn.haAvailable, false);
    element._payload.close();
  }
});

test("removing the editor releases the hub window, the inbox and the ticker (CR-F2-4)", async () => {
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();
  await element._learn.startHubLearn();
  calls.learnEvents!({ state: "listening", timeout_s: 30 });
  assert.notEqual(element._learn.ticker, null);

  element.disconnectedCallback();

  assert.equal(calls.learnCancelled, 1);
  assert.equal(calls.emissionsUnsubscribed, 1);
  assert.equal(element._learn.ticker, null);
  assert.equal(element._learn.view, "off");
});

test("hub learn: listening countdown, then a learned payload lands in the hex editor", async () => {
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();

  await element._learn.startHubLearn();
  assert.equal(element._learn.view, "hub");
  assert.equal(element._learn.hubState, "arming");
  assert.equal(calls.learnTimeout, 60);

  calls.learnEvents!({ state: "listening", timeout_s: 30 });
  assert.equal(element._learn.hubState, "listening");
  assert.equal(element._learn.secondsLeft, 30);
  assert.equal(element._learn.hubLearnIsTerminal(), false);
  assert.equal(element._learn.formatCountdown(element._learn.secondsLeft), "0:30");

  calls.learnEvents!({ state: "learned", payload_hex: "0a4f22", carrier_hz: 38400, duration_count: 136 });
  assert.equal(element._learn.view, "off");
  assert.equal(element._payload.open, true);
  assert.equal(element._payload.rawDraft, "0a 4f 22");
  assert.equal(element._payload.decodedSnapshot, null);
  assert.match(element._learn.sourceNote, /136 timing values at 38\.4 kHz/);
  // The finished subscription is released exactly once.
  assert.equal(calls.learnCancelled, 1);
  // Inbox subscription is dropped with learn mode.
  assert.equal(calls.emissionsUnsubscribed, 1);

  element._payload.close();
  assert.equal(element._learn.sourceNote, "");
});

test("hub learn: carrier frequency follows the active locale", async () => {
  setToolsCardLanguage("de");
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();

  await element._learn.startHubLearn();
  calls.learnEvents!({ state: "learned", payload_hex: "0a4f22", carrier_hz: 38400, duration_count: 136 });
  assert.match(element._learn.sourceNote, /136 IR-Zeitwerte bei 38,4 kHz/);

  element._payload.close();
  setToolsCardLanguage("en");
});

test("hub learn: terminal outcomes stay on the hub view with a retry; cancel unsubscribes", async () => {
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();

  await element._learn.startHubLearn();
  calls.learnEvents!({ state: "listening", timeout_s: 60 });
  calls.learnEvents!({ state: "interrupted", interrupted_by: "ACK_READY (0x0160)" });
  assert.equal(element._learn.view, "hub");
  assert.equal(element._learn.hubState, "interrupted");
  assert.equal(element._learn.hubLearnIsTerminal(), true);
  assert.equal(calls.learnCancelled, 1);

  // Try again: a fresh window; a late event from the old one is ignored.
  const staleEvents = calls.learnEvents!;
  await element._learn.startHubLearn();
  assert.equal(element._learn.hubState, "arming");
  staleEvents({ state: "learned", payload_hex: "ff" });
  assert.equal(element._learn.hubState, "arming");
  assert.equal(element._payload.rawDraft, "");

  calls.learnEvents!({ state: "listening", timeout_s: 60 });
  element._learn.backToMenu();
  assert.equal(element._learn.view, "menu");
  assert.equal(calls.learnCancelled, 2); // cancelled the live window

  // A refused arm reads as its own structured state.
  await element._learn.startHubLearn();
  calls.learnEvents!({ state: "refused", error_code: "ir_learn_refused" });
  assert.equal(element._learn.hubState, "refused");
  assert.equal(element._learn.hubEvent.error_code, "ir_learn_refused");

  element._payload.close();
  assert.equal(element._learn.view, "off");
});

test("hub learn: a subscribe failure surfaces as an error state", async () => {
  const { host } = learnHost();
  host.learnFromHub = async () => { throw new Error("no socket"); };
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();

  await element._learn.startHubLearn();
  assert.equal(element._learn.hubState, "error");
  assert.equal(element._learn.hubEvent.error_code, "ir_learn_failed");
  element._payload.close();
});

test("localized learn views never render backend exception messages", async () => {
  setToolsCardLanguage("de");
  const { host } = learnHost({ emissionsFails: true });
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();
  assert.deepEqual(element._learn.emissionsError, { error_code: "ir_emissions_failed" });

  element._learn.view = "hub";
  element._learn.hubState = "error";
  element._learn.hubEvent = {
    state: "error",
    error_code: "ir_learn_failed",
    message: "backend transport gone",
  };
  const hubText = templateText(element._learn.renderHub());
  assert.match(hubText, /Anlernen fehlgeschlagen/);
  assert.doesNotMatch(hubText, /backend transport gone/);

  element._learn.view = "ha";
  const inboxText = templateText(element._learn.renderInbox());
  assert.match(inboxText, /Zuletzt gesendete IR-Befehle konnten nicht geladen werden/);
  assert.doesNotMatch(inboxText, /backend transport gone/);

  element._payload.close();
  setToolsCardLanguage("en");
});

test("inbox: new sends are judged against the ring as first seen, and Use adopts the payload", async () => {
  const { host, calls } = learnHost();
  const element = openLearnEditor(host);
  await element._learn.enter();
  await settle();

  const first = { label: "Samsung32Command (0123abcd)", command_repr: "Samsung32Command(address=7, command=2)", payload_hex: "aabb", when: "2026-09-02T10:00:00+00:00", count: 1, carrier_hz: 38000 };
  calls.emissionSink!([first]);
  assert.equal(element._learn.emissionIsNew(first), false); // already there when learn mode opened

  element._learn.openInbox();
  assert.equal(element._learn.view, "ha");

  const resent = { ...first, when: "2026-09-02T10:00:30+00:00", count: 2 };
  const fresh = { label: "ProntoHexCommand (deadbeef)", command_repr: "ProntoHexCommand(68 timings, 38000 Hz)", payload_hex: "ccdd", when: "2026-09-02T10:00:31+00:00", count: 1 };
  calls.emissionSink!([resent, fresh]);
  assert.equal(element._learn.emissionIsNew(resent), true); // count bump refreshed `when`
  assert.equal(element._learn.emissionIsNew(fresh), true);
  assert.equal(element._learn.emissions.length, 2);

  element._learn.useEmission(fresh);
  assert.equal(element._learn.view, "off");
  assert.equal(element._payload.rawDraft, "cc dd");
  assert.match(element._learn.sourceNote, /ProntoHexCommand\(68 timings, 38000 Hz\)/);
  assert.equal(calls.emissionsUnsubscribed, 1);

  // Adopting into the add dialog leaves Save's own checks intact: a
  // name is still required.
  element._payload.apply();
  assert.equal(element._payload.open, true);
  assert.match(element._payload.error, /name/i);
  element._payload.close();
});

test("inbox: time-ago labels follow the ticker clock", () => {
  const element = createLiveDeviceEditor();
  element._learn.now = Date.parse("2026-09-02T10:10:00Z");
  assert.equal(element._learn.timeAgo("2026-09-02T10:09:58+00:00"), "just now");
  assert.equal(element._learn.timeAgo("2026-09-02T10:09:20+00:00"), "40 s ago");
  assert.equal(element._learn.timeAgo("2026-09-02T09:58:00+00:00"), "12 min ago");
  assert.equal(element._learn.timeAgo("2026-09-02T07:10:00+00:00"), "3 h ago");
  assert.equal(element._learn.timeAgo("not a date"), "");
});

test("inbox: repr-less command classes fall back to the digest label so codes stay distinguishable", () => {
  const element = createLiveDeviceEditor();
  // Class with its own repr: the repr wins (carries address/command).
  assert.equal(
    element._learn.emissionDisplayName({ label: "Samsung32Command (0123abcd)", command_repr: "Samsung32Command(address=7, command=2)", payload_hex: "aa", when: "t", count: 1 }),
    "Samsung32Command(address=7, command=2)",
  );
  // No repr (backend sends the bare class name): show class + digest.
  assert.equal(
    element._learn.emissionDisplayName({ label: "SonyX700Command (9f1e2d3c)", command_repr: "SonyX700Command", payload_hex: "bb", when: "t", count: 1 }),
    "SonyX700Command (9f1e2d3c)",
  );
  // Missing repr entirely.
  assert.equal(
    element._learn.emissionDisplayName({ label: "ProntoHexCommand (deadbeef)", payload_hex: "cc", when: "t", count: 1 }),
    "ProntoHexCommand (deadbeef)",
  );
});


// ── Add command on a device created EMPTY (Hub tab "Add device") ────────

function emptyLiveDevice(deviceClass: string, model: "X1" | "X1S" | "X2" = "X1S"): EditorElement {
  const element = createEditor(model, "device");
  element.bundle = {
    ...element.bundle!,
    devices: [
      ...element.bundle!.devices,
      { device: { device_id: 9, name: "Fresh", device_class: deviceClass }, commands: [] },
    ],
  } as BackupBundlePayload;
  element.mode = "live";
  element.entityId = 9;
  return element;
}

test("add-command on an empty Roku device opens the Roku form instead of the template error", async () => {
  const element = emptyLiveDevice("wifi_roku");
  await element._payload.openAdd();
  assert.equal(element._payload.fetchError, "");
  assert.equal(element._payload.addMode, true);
  assert.equal(element._payload.decodedSnapshot?.className, "wifi_roku");
  assert.equal(element._payload.decodedDrafts.path, "keypress/");
});

test("add-command on an empty Wifi HTTP device opens the HTTP form with GET defaults", async () => {
  const element = emptyLiveDevice("wifi_ip");
  await element._payload.openAdd();
  assert.equal(element._payload.decodedSnapshot?.className, "wifi_ip");
  assert.equal(element._payload.decodedDrafts.method, "GET");
  assert.equal(element._payload.decodedDrafts.port, "80");
});

test("add-command on an empty MQTT device commits the device and allocated command id", async () => {
  const element = emptyLiveDevice("wifi_mqtt", "X2");
  const changes = collectBundleChanges(element);
  await element._payload.openAdd();
  assert.equal(element._payload.decodedSnapshot?.className, "wifi_mqtt");
  assert.equal(element._payload.decodedDrafts.device_id, "9");
  assert.equal(element._payload.decodedDrafts.command_id, "1");

  element._payload.nameDraft = "Toggle";
  element._payload.applyAdd({ deviceId: 9, commandId: 0 });

  assert.equal(changes.length, 1);
  const device = changes[0].devices.find((row) => row.device?.device_id === 9)!;
  const commands = device.commands ?? [];
  assert.equal(commands.length, 1);
  const row = commands[0] as { command_id: number; name: string; restore_data: Record<string, unknown> };
  assert.equal(row.command_id, 1);
  assert.equal(row.name, "Toggle");
  const decoded = row.restore_data.decoded as { class: string; fields: Record<string, unknown>; edited: boolean };
  assert.equal(decoded.class, "wifi_mqtt");
  assert.deepEqual(decoded.fields, { device_id: 9, command_id: 1 });
  assert.equal(decoded.edited, true);
  assert.equal(row.restore_data.new, true);
});

test("add-command on an empty IR device keeps the IR path (hex tabs on X1S)", async () => {
  const element = emptyLiveDevice("ir");
  await element._payload.openAdd();
  assert.equal(element._payload.addMode, true);
  assert.equal(element._payload.decodedSnapshot, null);
});

test("macro steps reorder from the keyboard, with or without ha-sortable (CR-F2-11)", () => {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  const device = element.bundle.devices[0];
  device.commands = [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Mute" }];
  device.macros = [{
    button_id: 0x5d,
    name: "Night",
    steps: [
      { device_id: 1, command_id: 10, duration: 0, delay: 0 },
      { device_id: 1, command_id: 11, duration: 0, delay: 0 },
    ],
  }];
  element._haSortableReady = false;
  element._macroEditor = { scope: "device", entityId: 1, buttonId: 0x5d, name: "Night" };
  const before = element._currentMacroStepItems().map((item: { label: string }) => item.label);
  assert.equal(before.length, 2);

  // The handle is focusable and named even without ha-sortable.
  const markup = templateText(element._renderMacroStepEditorView(element._macroEditor));
  assert.match(markup, /role="button"/);
  assert.ok(markup.includes(TOOLS_CARD_STRINGS.backup.reorderHandleAria(before[0])));

  element._reorderSteps(0, 1);
  const after = element._currentMacroStepItems().map((item: { label: string }) => item.label);
  assert.deepEqual(after, [before[1], before[0]]);
});

test("icon-only back and close buttons carry accessible names (CR-F2-11)", () => {
  const element = createLiveDeviceEditor();
  element._openDetailRenameDialog();
  const markup = templateText(element._renderEditRenameDialog());
  assert.ok(markup.includes(`aria-label="${TOOLS_CARD_STRINGS.common.closeAria}"`) || markup.includes(TOOLS_CARD_STRINGS.common.closeAria));
});

// ── Wifi Event targets through the live host facade (CR-F2-13) ─────

function wifiEvent(slot: number, name: string, deviceId: number | null = 9): Record<string, unknown> {
  return {
    slot_index: slot,
    name,
    long_press_enabled: false,
    action: {},
    long_press_action: {},
    command_id: slot + 1,
    long_press_command_id: slot + 1 + 25,
    device_id: deviceId,
    deployed: deviceId != null,
  };
}

function withEventsDevice(bundle: BackupBundlePayload): BackupBundlePayload {
  const next = structuredClone(bundle) as any;
  next.devices.push({
    kind: "device",
    complete: true,
    device: { device_id: 9, name: "Wifi Events", brand: "m3-haevents-hub1", device_class: "wifi_ip" },
    commands: Array.from({ length: 50 }, (_, index) => ({ command_id: index + 1, name: `Event ${index + 1}` })),
  });
  return next;
}

function liveActivityEditorWithEvents(host: Record<string, unknown>) {
  const element = createEditor("X1S", "activity");
  element.mode = "live";
  element.wifiEvents = host;
  return element;
}

test("a new Wifi Event shortcut is created through the host and added as a favorite", async () => {
  const created: string[] = [];
  const element = liveActivityEditorWithEvents({
    list: async () => [],
    create: async (name: string) => {
      created.push(name);
      return { event: wifiEvent(4, name), bundle: withEventsDevice(element.bundle) };
    },
    ensureGrafted: async () => null,
    enableLongPress: async () => {},
  });
  const changes = collectBundleChanges(element);
  element._wifiEventPrimary = { mode: "new", slot: null, name: "  Movie time " };

  await element._applyAddShortcutWifiEvent();

  assert.deepEqual(created, ["Movie time"]);
  assert.equal(element._addFavoriteError, "");
  const activity = (changes.at(-1) as any).activities.find((entry: any) => entry.device.device_id === 101);
  assert.ok(activity.favorite_slots.some((slot: any) => slot.device_id === 9 && slot.command_id === 5));
});

test("an existing Wifi Event shortcut grafts the events device instead of creating one", async () => {
  let grafts = 0;
  const element = liveActivityEditorWithEvents({
    list: async () => [],
    create: async () => { throw new Error("must not create"); },
    ensureGrafted: async () => { grafts += 1; return withEventsDevice(element.bundle); },
    enableLongPress: async () => {},
  });
  element._wifiEventsList = [wifiEvent(2, "Lights off")];
  const changes = collectBundleChanges(element);
  element._wifiEventPrimary = { mode: "existing", slot: 2, name: "" };

  await element._applyAddShortcutWifiEvent();

  assert.equal(grafts, 1);
  const activity = (changes.at(-1) as any).activities.find((entry: any) => entry.device.device_id === 101);
  assert.ok(activity.favorite_slots.some((slot: any) => slot.device_id === 9 && slot.command_id === 3));
});

test("a refused Wifi Event create keeps the dialog open with localized copy", async () => {
  const element = liveActivityEditorWithEvents({
    list: async () => [],
    create: async () => { throw { code: "duplicate_name", message: "A Wifi Event with this name already exists" }; },
    ensureGrafted: async () => null,
    enableLongPress: async () => {},
  });
  const changes = collectBundleChanges(element);
  element._wifiEventPrimary = { mode: "new", slot: null, name: "Movie time" };

  await element._applyAddShortcutWifiEvent();

  assert.equal(element._addFavoriteError, TOOLS_CARD_STRINGS.errors.wifiEventNameTaken);
  assert.equal(changes.length, 0);
  assert.equal(element._wifiEventBusy, false);
});

test("the new Wifi Event name input keeps only what the hub can store (CR-X4-1)", () => {
  const element = liveActivityEditorWithEvents({});
  let sel: { mode: string; slot: number | null; name: string } | null = null;
  const markup = element._renderWifiEventTargetFields({
    idPrefix: "t",
    sel: { mode: "new", slot: null, name: "" },
    onSelChange: (next: typeof sel) => { sel = next; },
  });
  assert.ok(markup);
  const input = { value: "Lights 💡 on" };
  // The input's @input handler is the one rendered for this field.
  const handler = findInputHandler(markup);
  handler({ target: input } as unknown as Event);
  assert.equal(input.value, "Lights  on");
  assert.equal(sel!.name, "Lights  on");
});

function findInputHandler(template: unknown): (event: Event) => void {
  const stack = [template];
  while (stack.length) {
    const node = stack.pop() as { strings?: string[]; values?: unknown[] } | unknown[] | null;
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    const { strings, values } = node as { strings?: string[]; values?: unknown[] };
    if (strings && values) {
      for (let index = 0; index < values.length; index += 1) {
        if (/@input=$/.test(strings[index]) && typeof values[index] === "function") {
          return values[index] as (event: Event) => void;
        }
      }
      stack.push(...values);
    }
  }
  throw new Error("no @input handler rendered");
}

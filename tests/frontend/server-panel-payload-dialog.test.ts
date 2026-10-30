import test from "node:test";
import assert from "node:assert/strict";

import { SbPayloadDialog, type PayloadSaveDetail } from "../../server-panel/src/views/payload-dialog";
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";

// The panel's payload dialog takes the card's wifi_ip rule (shared/wifi-ip-form.ts).

type Dialog = HTMLElement & Record<string, any>;

const REQUEST_TEXT = {
  host: "192.168.2.77",
  port: 80,
  method: "POST",
  path: "/launch/12",
  header: "",
  content_type: "application/json",
  body: "",
};

function wifiIpDialog(hubVersion: string, mode: "add" | "edit" = "edit"): Dialog {
  const dialog = new SbPayloadDialog() as unknown as Dialog;
  dialog.hubVersion = hubVersion;
  dialog.deviceClass = "wifi_ip";
  dialog.mode = mode;
  dialog.offline = true;
  dialog.snapshot = { className: "wifi_ip", fields: REQUEST_TEXT, trailerHex: "f1", edited: false };
  dialog._seed();
  return dialog;
}

function control(value: string): Event {
  const target = { value };
  return { currentTarget: target, target } as unknown as Event;
}

function saved(dialog: Dialog): PayloadSaveDetail[] {
  const details: PayloadSaveDetail[] = [];
  dialog.addEventListener("sb-payload-save", (event) => details.push((event as CustomEvent<PayloadSaveDetail>).detail));
  return details;
}

test("an offline edit to https hands the editor the whole URL record to replace", () => {
  const dialog = wifiIpDialog("X2");
  const details = saved(dialog);
  dialog._onFieldInput({ key: "scheme", label: "" }, control("https"));
  assert.equal(dialog._drafts.port, "443");
  dialog._save();

  assert.equal(details.length, 1);
  const url = { url: "https://192.168.2.77:443/launch/12", method: "POST", headers: [["Content-Type", "application/json"]], body: "" };
  assert.equal(details[0].replaceFields, true);
  assert.deepEqual(details[0].changedFields, url);
  const decoded = details[0].restoreData.decoded as Record<string, unknown>;
  assert.deepEqual(decoded.fields, url);
  assert.equal(decoded.trailer_hex, "");
});

test("an unchanged wifi_ip form saves nothing", () => {
  const dialog = wifiIpDialog("X2");
  const details = saved(dialog);
  let closed = false;
  dialog.addEventListener("sb-payload-close", () => { closed = true; });
  dialog._save();
  assert.equal(details.length, 0);
  assert.equal(closed, true);
});

test("the X1S dialog refuses a host name with the card's message", () => {
  const dialog = wifiIpDialog("X1S");
  const details = saved(dialog);
  dialog._onFieldInput({ key: "host", label: "" }, control("ha.example.com"));
  dialog._save();
  assert.equal(details.length, 0);
  assert.equal(dialog._error, TOOLS_CARD_STRINGS.decodedPayload.hostNeedsIpv4);
});

test("an add keeps request text at http and an IPv4 address", () => {
  const dialog = wifiIpDialog("X2", "add");
  const details = saved(dialog);
  dialog._name = "Launch";
  dialog._onFieldInput({ key: "body", label: "" }, control("{}"));
  dialog._save();
  assert.equal(details.length, 1);
  const decoded = details[0].restoreData.decoded as Record<string, unknown>;
  assert.deepEqual(decoded.fields, { ...REQUEST_TEXT, body: "{}" });
  assert.equal(decoded.trailer_hex, "f1");
});

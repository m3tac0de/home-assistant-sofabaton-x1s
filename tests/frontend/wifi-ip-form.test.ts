import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WifiIpFormError,
  buildWifiIpRecord,
  wifiIpDefaultPort,
  wifiIpDraftsChanged,
  wifiIpDraftsFromFields,
  wifiIpDraftsWithScheme,
  wifiIpRecordKind,
  wifiIpRequestPreview,
} from "../../custom_components/sofabaton_x1s/www/src/shared/wifi-ip-form";

// Shared vectors, also consumed by tests/test_wifi_ip_form_vectors.py: every
// expected record there round-trips through the library codec, so a form
// output the sync would refuse fails one of the two suites.
interface StoredRecord {
  fields: Record<string, unknown>;
  trailer_hex: string;
}

const VECTORS: Array<{
  name: string;
  is_x2: boolean;
  existing: boolean;
  original: StoredRecord;
  edits: Record<string, string>;
  expected?: StoredRecord;
  error?: string;
}> = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "wifi-ip-form-vectors.json"), "utf-8"),
).vectors;

for (const vector of VECTORS) {
  test(`wifi_ip form vector: ${vector.name}`, () => {
    const drafts = { ...wifiIpDraftsFromFields(vector.original.fields), ...vector.edits };
    const build = () =>
      buildWifiIpRecord(drafts, {
        original: { fields: vector.original.fields, trailerHex: vector.original.trailer_hex },
        existing: vector.existing,
        isX2: vector.is_x2,
      });
    if (vector.error) {
      assert.throws(build, (error: unknown) => error instanceof WifiIpFormError && error.code === vector.error);
      return;
    }
    const record = build();
    assert.deepEqual(record.fields, vector.expected!.fields);
    assert.equal(record.trailerHex, vector.expected!.trailer_hex);
  });
}

test("a URL record shows as the HTTP form, Content-Type in its own field", () => {
  assert.deepEqual(
    wifiIpDraftsFromFields({
      url: "https://ha.example.com/api/webhook/x?press=short",
      method: "POST",
      headers: [["X-Key", "1"], ["content-type", "application/json"], ["Content-Type", "text/plain"]],
      body: "{}",
    }),
    {
      scheme: "https",
      host: "ha.example.com",
      port: "",
      method: "POST",
      path: "/api/webhook/x?press=short",
      // Only the first Content-Type gets the field; a second stays a header.
      header: "X-Key: 1\r\nContent-Type: text/plain",
      content_type: "application/json",
      body: "{}",
    },
  );
});

test("a request-text command shows as the HTTP form at http", () => {
  const drafts = wifiIpDraftsFromFields({
    host: "192.168.2.77",
    port: 8060,
    method: "POST",
    path: "/launch/12",
    header: "X-A:1\r\nX-B:2",
    content_type: "",
    body: "",
  });
  assert.equal(drafts.scheme, "http");
  assert.equal(drafts.port, "8060");
  assert.equal(drafts.header, "X-A:1\r\nX-B:2");
});

test("the record kind follows the fields", () => {
  assert.equal(wifiIpRecordKind({ url: "http://a/", method: "GET", headers: [], body: "" }), "url");
  assert.equal(wifiIpRecordKind({ host: "1.2.3.4", port: 80 }), "text");
});

test("textarea line endings alone are no change", () => {
  const fields = { host: "1.2.3.4", port: 80, method: "GET", path: "/", header: "X-A:1\r\nX-B:2", content_type: "", body: "" };
  const drafts = wifiIpDraftsFromFields(fields);
  assert.equal(wifiIpDraftsChanged(fields, { ...drafts, header: "X-A:1\nX-B:2" }), false);
  assert.equal(wifiIpDraftsChanged(fields, { ...drafts, body: "x" }), true);
});

test("switching the protocol moves a default port along", () => {
  const drafts = { scheme: "http", port: "80" };
  assert.deepEqual(wifiIpDraftsWithScheme(drafts, "https"), { scheme: "https", port: "443" });
  assert.deepEqual(wifiIpDraftsWithScheme({ scheme: "https", port: "443" }, "http"), { scheme: "http", port: "80" });
  // Any other port is the user's and stays.
  assert.deepEqual(wifiIpDraftsWithScheme({ scheme: "http", port: "8123" }, "https"), { scheme: "https", port: "8123" });
});

test("a URL record on a hub the bundle cannot name stays editable", () => {
  // The record itself proves an X2; a missing hub version must not refuse it.
  const record = buildWifiIpRecord(
    { scheme: "https", host: "ha.example.com", port: "", method: "POST", path: "/x", header: "", content_type: "", body: "1" },
    {
      original: { fields: { url: "https://ha.example.com/x", method: "POST", headers: [], body: "" }, trailerHex: "" },
      existing: true,
      isX2: false,
    },
  );
  assert.deepEqual(record.fields, { url: "https://ha.example.com/x", method: "POST", headers: [], body: "1" });
});

test("an IPv6 host is bracketed in the URL", () => {
  const record = buildWifiIpRecord(
    { scheme: "http", host: "fd00::5", port: "8080", method: "GET", path: "/", header: "", content_type: "", body: "" },
    { original: null, existing: false, isX2: true },
  );
  assert.equal(record.fields.url, "http://[fd00::5]:8080/");
});

test("an empty host is refused", () => {
  assert.throws(
    () => buildWifiIpRecord({ scheme: "http", host: " ", port: "80", method: "GET", path: "/" }, { original: null, existing: false, isX2: true }),
    (error: unknown) => error instanceof WifiIpFormError && error.code === "host_required",
  );
});

test("the summary line shows the request as typed", () => {
  assert.deepEqual(
    wifiIpRequestPreview({ scheme: "http", host: "192.168.1.161", port: "8080", method: "post", path: "/jsonrpc" }),
    { method: "POST", url: "http://192.168.1.161:8080/jsonrpc" },
  );
  // An empty port and path read as the defaults, an empty method as GET; an
  // IPv6 host is bracketed.
  assert.deepEqual(wifiIpRequestPreview({ scheme: "https", host: "fd00::5", port: "", method: "", path: "" }), {
    method: "GET",
    url: "https://[fd00::5]/",
  });
  assert.equal(wifiIpRequestPreview({ scheme: "http", host: "a", path: "status" })?.url, "http://a/status");
  // A mistake stays visible rather than being repaired.
  assert.equal(wifiIpRequestPreview({ scheme: "http", host: "http://a", path: "/" })?.url, "http://http://a/");
  assert.equal(wifiIpRequestPreview({ scheme: "http", host: " ", path: "/" }), null);
});

test("an empty port shows its protocol's default", () => {
  assert.equal(wifiIpDefaultPort("http"), "80");
  assert.equal(wifiIpDefaultPort("HTTPS"), "443");
  assert.equal(wifiIpDefaultPort(undefined), "80");
});

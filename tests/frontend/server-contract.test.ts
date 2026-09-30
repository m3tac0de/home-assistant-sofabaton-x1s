import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The server wire contract on the client side (CR-X3-5). The panel and the
// web remote alias the types generated from sofabaton-x-server/openapi.json,
// so a reshaped schema fails the typecheck. These tests cover what types
// cannot: a stale generated file, and a route a client calls that the
// server no longer serves (the paths are strings).

const ROOT = process.cwd();
const OPENAPI = "sofabaton-x-server/openapi.json";
const GENERATED = "sofabaton-x-server/openapi.d.ts";
const PREFIX = "/api/v1";

// Calls that are not REST operations of the document.
const NOT_IN_DOCUMENT = new Set([
  "GET /api/v1/openapi.json", // the document itself (the panel's API view)
  "GET /api/v1/events", // the WebSocket stream
]);

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...tsFiles(rel));
    else if (entry.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

/** `/hubs/${encodeURIComponent(id)}/x?y=1` and `/hubs/{hub_id}/x` both as `/hubs/{}/x`. */
function normalize(route: string): string {
  return route
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "{}")
    .replace(/\{[^{}]+\}/g, "{}")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");
}

function documentRoutes(): Set<string> {
  const doc = JSON.parse(read(OPENAPI)) as { paths: Record<string, Record<string, unknown>> };
  const routes = new Set<string>();
  for (const [route, methods] of Object.entries(doc.paths)) {
    for (const method of Object.keys(methods)) routes.add(`${method.toUpperCase()} ${normalize(route)}`);
  }
  return routes;
}

interface Call {
  file: string;
  route: string;
}

function panelCalls(): Call[] {
  const calls: Call[] = [];
  const pattern = /\.request(?:<[^()]*?>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*(["`])([^"`]+)\2/g;
  for (const file of tsFiles("server-panel/src")) {
    for (const match of read(file).matchAll(pattern)) {
      // PanelApi._hub(id) stands for `hubs/${id}`.
      const route = match[3].replace(/^\/+/, "").replace(/^\$\{this\._hub\([^)]*\)\}/, "hubs/{}");
      calls.push({ file, route: `${match[1]} ${normalize(`${PREFIX}/${route}`)}` });
    }
  }
  return calls;
}

function remoteCalls(): Call[] {
  const calls: Call[] = [];
  const backend = "remote-card/src/backend/server-backend.ts";
  // `this.get(...)` / `this.post(...)` take a path under the backend's hub.
  for (const match of read(backend).matchAll(/this\.(get|post)(?:<[^()]*?>)?\(\s*`([^`]+)`/g)) {
    calls.push({ file: backend, route: `${match[1].toUpperCase()} ${normalize(`${PREFIX}/hubs/{}${match[2]}`)}` });
  }
  // Absolute reads built on the prefix (the hub list, server info, the stored layout).
  for (const file of [backend, "remote-card/src/remote-host.ts"]) {
    for (const match of read(file).matchAll(/(?:\$\{SERVER_API_PREFIX\}|\$\{api\})(\/[^`"'\s]*)`/g)) {
      if (match[1].includes("${path}")) continue; // the backend's url() helper, covered above
      calls.push({ file, route: `GET ${normalize(`${PREFIX}${match[1]}`)}` });
    }
  }
  return calls;
}

test("the generated server types match openapi.json", () => {
  const digest = createHash("sha256").update(read(OPENAPI).replace(/\r\n/g, "\n")).digest("hex");
  const recorded = /openapi\.json sha256: ([0-9a-f]{64})/.exec(read(GENERATED))?.[1];
  assert.equal(recorded, digest, `${GENERATED} is stale: run npm run gen:server-types`);
});

test("every route the server panel calls is in openapi.json", () => {
  const routes = documentRoutes();
  const calls = panelCalls();
  assert.ok(calls.length >= 60, `found only ${calls.length} panel calls; the pattern no longer matches`);
  const unknown = calls.filter((call) => !routes.has(call.route) && !NOT_IN_DOCUMENT.has(call.route));
  assert.deepEqual(unknown, []);
});

test("every route the web remote and the embed call is in openapi.json", () => {
  const routes = documentRoutes();
  const calls = remoteCalls();
  assert.ok(calls.length >= 12, `found only ${calls.length} remote calls; the patterns no longer match`);
  const unknown = calls.filter((call) => !routes.has(call.route) && !NOT_IN_DOCUMENT.has(call.route));
  assert.deepEqual(unknown, []);
});

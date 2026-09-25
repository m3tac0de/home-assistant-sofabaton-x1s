// The control panel's event stream (docs/internal/server-panel-plan.md,
// P3): the URL with the hub filter, the bounded buffer, the connection
// state, reconnecting while wanted and only then. Over a fake WebSocket.

import assert from "node:assert/strict";
import test from "node:test";

import { PanelStream, isHubRefreshTrigger, summarizeMessage } from "../../server-panel/src/panel-stream";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  open(): void {
    this.onopen?.({});
  }
  push(data: unknown): void {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drop(): void {
    this.onclose?.({});
  }
  close(): void {
    this.closed = true;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function make(options: { limit?: number; reconnectMs?: number } = {}) {
  FakeSocket.instances = [];
  return new PanelStream({ apiRoot: "http://host:8480/api/v1/", WebSocketImpl: FakeSocket, reconnectMs: options.reconnectMs ?? 5, limit: options.limit, now: () => "t" });
}

test("the stream dials /events under the API root, ws for http, with the hub filter", () => {
  const stream = make();
  assert.equal(stream.url(), "ws://host:8480/api/v1/events");
  stream.hubFilter = ["a", "b"];
  assert.equal(stream.url(), "ws://host:8480/api/v1/events?hub_id=a&hub_id=b");
  const secure = new PanelStream({ apiRoot: "https://home.example/sofabaton/api/v1", WebSocketImpl: FakeSocket });
  assert.equal(secure.url(), "wss://home.example/sofabaton/api/v1/events");
});

test("messages are parsed, kept up to the limit, and delivered to listeners", () => {
  const stream = make({ limit: 3 });
  const seen: string[] = [];
  stream.onMessage((m) => seen.push(String(m.data.type)));
  stream.start();
  const socket = FakeSocket.instances[0];
  socket.open();
  assert.equal(stream.connected, true);
  socket.push({ type: "hello" });
  socket.push({ type: "press", seq: 1 });
  socket.push("not json");
  socket.push({ type: "server_event" });
  assert.deepEqual(seen, ["hello", "press", "raw", "server_event"]);
  assert.deepEqual(stream.messages.map((m) => m.data.type), ["press", "raw", "server_event"]);
  assert.equal(stream.messages[1].data.raw, "not json");
  assert.equal(stream.messages[0].at, "t");
  stream.clear();
  assert.equal(stream.messages.length, 0);
});

test("a dropped socket reconnects while the stream is wanted; stop() ends that", async () => {
  const stream = make({ reconnectMs: 5 });
  const states: boolean[] = [];
  stream.onState((c) => states.push(c));
  stream.start();
  FakeSocket.instances[0].open();
  FakeSocket.instances[0].drop();
  assert.equal(stream.connected, false);
  await sleep(20);
  assert.equal(FakeSocket.instances.length, 2, "dialled again");
  FakeSocket.instances[1].open();
  assert.deepEqual(states, [true, false, true]);

  stream.stop();
  assert.equal(FakeSocket.instances[1].closed, true);
  assert.equal(stream.wanted, false);
  await sleep(20);
  assert.equal(FakeSocket.instances.length, 2, "no reconnect after stop()");
  assert.deepEqual(states, [true, false, true, false]);

  // restart() re-dials with the current filter.
  stream.hubFilter = ["x"];
  stream.start();
  stream.restart();
  assert.equal(FakeSocket.instances.length, 4);
  assert.equal(FakeSocket.instances[3].url, "ws://host:8480/api/v1/events?hub_id=x");
  stream.stop();
});

test("start() is idempotent while a socket is up", () => {
  const stream = make();
  stream.start();
  stream.start();
  assert.equal(FakeSocket.instances.length, 1);
  stream.stop();
});

test("summarizeMessage gives one line per frame type", () => {
  assert.equal(summarizeMessage({ type: "press", seq: 3, hub_id: "h", device_id: 9, slot: 2, press_type: "short", label: "Demo", resolution: "bound" }), 'press seq=3 h dev=9 slot=2 short "Demo" bound');
  assert.equal(summarizeMessage({ type: "hub_event", hub_id: "h", event: { kind: "activity_changed", seq: 4 } }), "hub_event h activity_changed seq=4");
  assert.equal(summarizeMessage({ type: "server_event", hub_id: "h", kind: "hub_added" }), "server_event h hub_added");
  assert.equal(summarizeMessage({ type: "job_event", hub_id: "h", job: { kind: "restore", status: "running", progress: { completed_steps: 2, total_steps: 5 } } }), "job_event h restore running 2/5");
  assert.equal(summarizeMessage({ type: "hello", server_version: "0.2.0", instance_id: "i", hubs: [{ hub_id: "a" }, { hub_id: "b" }] }), "hello v0.2.0 instance=i hubs=a,b");
  assert.equal(summarizeMessage({ type: "dropped", count: 7 }), "dropped 7");
  assert.equal(summarizeMessage({ type: "raw" }), "raw");
  assert.equal(summarizeMessage({}), "?");
});

test("only lifecycle-shaped frames ask for a hub reload", () => {
  assert.equal(isHubRefreshTrigger({ type: "server_event", kind: "hub_added" }), true);
  assert.equal(isHubRefreshTrigger({ type: "server_event", hub_id: "", kind: "update_check" }), false);
  assert.equal(isHubRefreshTrigger({ type: "hub_event", event: { kind: "catalog_ready" } }), true);
  assert.equal(isHubRefreshTrigger({ type: "hub_event", event: { kind: "status_changed" } }), true);
  assert.equal(isHubRefreshTrigger({ type: "hub_event", event: { kind: "activity_changed" } }), false);
  assert.equal(isHubRefreshTrigger({ type: "press" }), false);
  assert.equal(isHubRefreshTrigger({ type: "hello" }), false);
});

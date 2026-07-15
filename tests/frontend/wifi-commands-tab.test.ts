import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab";

const WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab") as {
  new (): HTMLElement;
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

type TestGlobals = typeof globalThis & {
  window?: { localStorage?: StorageLike };
  localStorage?: StorageLike;
};

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function installStorage() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  return storage;
}

function restoreGlobal(name: "window" | "localStorage", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  delete (globalThis as TestGlobals)[name];
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  restoreGlobal("window", originalWindowDescriptor);
  restoreGlobal("localStorage", originalLocalStorageDescriptor);
});

test("wifi commands persists the selected device detail view per hub", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "dev-2";

  (element as any)._persistSelectedDeviceSession();

  const persisted = JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}");
  assert.equal(persisted.deviceKey, "dev-2");
  assert.equal(Number.isFinite(Number(persisted.savedAt)), true);
});

test("wifi commands restores the selected device detail view when the device still exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" },
    { device_key: "dev-2", device_name: "Receiver" },
  ];

  (element as any)._restoreSelectedDeviceSession();

  assert.equal(element._selectedDeviceKey, "dev-2");
});

test("wifi commands does not wipe the persisted selection before restore has been attempted", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  // _selectedDeviceKey is still null and _deviceSessionRestoreTried is still
  // false — this mirrors the state on the first render after a reload, before
  // the async hub-load has had a chance to call _restoreSelectedDeviceSession.
  (element as any)._persistSelectedDeviceSession();

  assert.equal(
    globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"),
    JSON.stringify({ deviceKey: "dev-2", savedAt: JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}").savedAt }),
  );
});

test("wifi commands drops a stale selected device session when that device no longer exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "missing-device", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" },
  ];

  (element as any)._restoreSelectedDeviceSession();

  assert.equal(element._selectedDeviceKey, null);
  assert.equal(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"), null);
});

test("wifi commands save drops orphaned activities when favorite and button are off", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };

  const normalized = (element as any)._normalizeCommandsForStorage([
    { name: "Orphan", add_as_favorite: false, hard_button: "", activities: ["101", "102"] },
    { name: "Favorite", add_as_favorite: true, hard_button: "", activities: ["101"] },
    { name: "Button", add_as_favorite: false, hard_button: "red", activities: ["102"] },
  ]);

  assert.deepEqual(normalized[0].activities, []);
  assert.deepEqual(normalized[1].activities, ["101"]);
  assert.deepEqual(normalized[2].activities, ["102"]);
});

const LOADER_URL = new URL(import.meta.url, window.location.href);
const VERSION = LOADER_URL.searchParams.get("v") || "dev";
const INJECT_REMOTE = LOADER_URL.searchParams.get("inject_remote") !== "0";
const REMOTE_VERSION = LOADER_URL.searchParams.get("remote_v") || VERSION;
const LOAD_CACHE_KEY = "__sofabaton_card_loader_module_cache__";
const BOOT_CACHE_KEY = "__sofabaton_card_loader_boot_cache__";
const BOOT_CACHE_ID = `${VERSION}:${INJECT_REMOTE ? "remote" : "tools-only"}`;

function withVersion(url) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("v", VERSION);
  return u.toString();
}

function withRemoteVersion(url) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("v", REMOTE_VERSION);
  return u.toString();
}

function moduleLoadCache() {
  const windowWithCache = window;
  if (!(windowWithCache[LOAD_CACHE_KEY] instanceof Map)) {
    windowWithCache[LOAD_CACHE_KEY] = new Map();
  }
  return windowWithCache[LOAD_CACHE_KEY];
}

function bootPromiseCache() {
  const windowWithCache = window;
  if (!(windowWithCache[BOOT_CACHE_KEY] instanceof Map)) {
    windowWithCache[BOOT_CACHE_KEY] = new Map();
  }
  return windowWithCache[BOOT_CACHE_KEY];
}

function loadModuleScript(url) {
  const cache = moduleLoadCache();
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    (document.head || document.documentElement).appendChild(s);
  });

  cache.set(url, promise);
  return promise;
}

async function waitForCards() {
  const definitions = [customElements.whenDefined("sofabaton-control-panel")];
  if (INJECT_REMOTE) definitions.push(customElements.whenDefined("sofabaton-remote-card"));
  await Promise.all(definitions);
}

function dispatchRebuild() {
  const event = new Event("ll-rebuild", { bubbles: true, composed: true });
  document.dispatchEvent(event);
  window.dispatchEvent(new Event("ll-rebuild", { bubbles: true, composed: true }));
}

function queueRebuild() {
  dispatchRebuild();
  queueMicrotask(dispatchRebuild);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => dispatchRebuild());
  }
}

async function boot() {
  if (INJECT_REMOTE) {
    const remoteUrl = withRemoteVersion("/sofabaton_x1s/www/remote-card.js");
    await loadModuleScript(remoteUrl);
  }

  const toolsUrl = withVersion("/sofabaton_x1s/www/tools-card.js");
  await loadModuleScript(toolsUrl);
  await waitForCards();
  queueRebuild();
}

const bootCache = bootPromiseCache();
if (!bootCache.has(BOOT_CACHE_ID)) {
  bootCache.set(BOOT_CACHE_ID, boot().catch((error) => {
    bootCache.delete(BOOT_CACHE_ID);
    throw error;
  }));
}

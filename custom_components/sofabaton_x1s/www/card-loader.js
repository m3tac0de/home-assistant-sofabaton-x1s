const LOADER_URL = new URL(import.meta.url, window.location.href);
const VERSION = LOADER_URL.searchParams.get("v") || "dev";
const INJECT_REMOTE = LOADER_URL.searchParams.get("inject_remote") !== "0";

function withVersion(url) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("v", VERSION);
  return u.toString();
}

function loadModuleScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function boot() {
  if (INJECT_REMOTE) {
    const remoteUrl = withVersion("/sofabaton_x1s/www/remote-card.js");
    await loadModuleScript(remoteUrl);
  }

  const toolsUrl = withVersion("/sofabaton_x1s/www/tools-card.js");
  await loadModuleScript(toolsUrl);

  document.dispatchEvent(new Event("ll-rebuild", { bubbles: true, composed: true }));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

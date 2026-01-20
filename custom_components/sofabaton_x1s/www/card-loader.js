const LOADER_URL = new URL(import.meta.url, window.location.href);
const VERSION = LOADER_URL.searchParams.get("v") || "dev";

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
  const cardUrl = withVersion("/sofabaton_x1s/www/remote-card.js");
  await loadModuleScript(cardUrl);
  document.dispatchEvent(new Event("ll-rebuild", { bubbles: true, composed: true }));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

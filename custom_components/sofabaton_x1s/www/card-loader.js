console.warn("[cards-loader] loaded");

// Works reliably in module context:
const LOADER_URL = new URL(import.meta.url, window.location.href);
const VERSION = LOADER_URL.searchParams.get("v") || "dev";

console.warn("[cards-loader] LOADER_URL =", LOADER_URL.toString());
console.warn("[cards-loader] VERSION =", VERSION);

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
  console.warn("[cards-loader] loading:", cardUrl);

  await loadModuleScript(cardUrl);

  document.dispatchEvent(new Event("ll-rebuild", { bubbles: true, composed: true }));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

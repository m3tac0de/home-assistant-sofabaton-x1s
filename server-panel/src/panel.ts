// Entry for the control panel (docs/internal/server-panel-plan.md): the
// page sofabaton-x-server serves at /ui/. Installs the web remote's
// platform shims and palette, defines the remote card (the Remote view
// mounts it) and the panel's elements, and lets <sofabaton-server-panel>
// in index.html take over. Built by scripts/build-server-panel.mjs.

import { SofabatonRemoteCard } from "../../remote-card/src/remote-card-element";
import { TYPE, logPillsOnce } from "../../remote-card/src/remote-card-shared";
import { installRemoteWebShims } from "../../remote-card/src/shims/index";
import "../../remote-card/src/remote-card-translations";
import { definePanel } from "./panel-element";
import { defineApiView } from "./views/api-view";
import { defineBackupView } from "./views/backup-view";
import { defineCatalogView } from "./views/catalog-view";
import { defineEventsView } from "./views/events-view";
import { defineHubsView } from "./views/hubs-view";
import { defineRemoteView } from "./views/remote-view";
import { defineServerView } from "./views/server-view";

export function bootstrapServerPanel(): void {
  installRemoteWebShims();
  logPillsOnce();
  if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
  defineHubsView();
  defineCatalogView();
  defineRemoteView();
  defineApiView();
  defineEventsView();
  defineServerView();
  defineBackupView();
  definePanel();
}

if (typeof window !== "undefined" && typeof customElements !== "undefined") {
  bootstrapServerPanel();
}

// Bundle entry for the "Sofabaton X" sidebar panel (sidebar-panel.js): the
// panel shell and the sidebar remote (docs/internal/sidebar-remote-plan.md).
//
// Import order matters, as for remote-card.ts: the translations register
// themselves into remote-card-strings and must load from this entry, after
// the class modules.

import { SIDEBAR_PANEL_TAG, SofabatonXPanel } from "./sidebar/sidebar-panel-element";
import { SIDEBAR_REMOTE_TAG, SofabatonSidebarRemote } from "./sidebar/sidebar-remote-element";
import "./remote-card-translations";

if (!customElements.get(SIDEBAR_REMOTE_TAG)) customElements.define(SIDEBAR_REMOTE_TAG, SofabatonSidebarRemote);
if (!customElements.get(SIDEBAR_PANEL_TAG)) customElements.define(SIDEBAR_PANEL_TAG, SofabatonXPanel);

// Registration entry for the Sofabaton Virtual Remote card (Lit
// implementations: remote-card-element.ts / remote-card-editor-element.ts).
//
// Import order matters: remote-card-translations self-registers overlays into
// remote-card-strings and must load from this entry, after the class modules,
// to avoid the circular-import init-order bug documented in
// remote-card-translations/index.ts.

import { SofabatonRemoteCardEditor } from "./remote-card-editor-element";
import { SofabatonRemoteCard } from "./remote-card-element";
import { EDITOR, TYPE, logPillsOnce } from "./remote-card-shared";
import "./remote-card-translations";

interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  getEntitySuggestion?: (
    hass: { entities?: Record<string, { platform?: string } | undefined> },
    entityId: string,
  ) => { config: Record<string, unknown> } | null;
}

const win = window as unknown as { customCards?: CustomCardEntry[] };

logPillsOnce();

if (!customElements.get(EDITOR))
  customElements.define(EDITOR, SofabatonRemoteCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);

win.customCards = win.customCards || [];
if (!win.customCards.some((c) => c.type === TYPE)) {
  win.customCards.push({
    type: TYPE,
    name: "Sofabaton Virtual Remote",
    description:
      "A configurable remote for the Sofabaton X1, X1S and X2 integration.",
    // Card picker (HA 2026.6+): recommend this card for Sofabaton remote
    // entities, which is exactly what it binds to.
    getEntitySuggestion: (hass, entityId) => {
      if (!entityId.startsWith("remote.")) return null;
      const platform = String(hass?.entities?.[entityId]?.platform || "");
      if (platform !== "sofabaton_x1s" && platform !== "sofabaton_hub") return null;
      return { config: { type: `custom:${TYPE}`, entity: entityId } };
    },
  });
}

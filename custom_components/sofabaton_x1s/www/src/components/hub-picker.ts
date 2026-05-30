import { html } from "lit";

export function renderHubPicker(params: {
  visible: boolean;
  open: boolean;
  selectedLabel: string;
  hubs: Array<{ entry_id: string; name?: string }>;
  selectedEntryId: string | null;
  onToggle: () => void;
  onSelect: (entryId: string) => void;
}) {
  if (!params.visible) return null;
  return html`
    <div class="hub-picker" id="hub-picker-root">
      <button
        class="hub-picker-btn${params.open ? " is-open" : ""}"
        id="hub-picker-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded=${String(params.open)}
        @click=${params.onToggle}
      >
        <span class="chip-name">${params.selectedLabel}</span>
        <ha-icon class="chip-arrow" icon="mdi:chevron-up"></ha-icon>
      </button>
      ${params.open
        ? html`
            <div id="hub-picker-menu" class="hub-picker-menu" role="menu">
              ${params.hubs.map(
                (hub) => html`
                  <button
                    class="hub-option${hub.entry_id === params.selectedEntryId ? " selected" : ""}"
                    type="button"
                    role="menuitemradio"
                    aria-checked=${String(hub.entry_id === params.selectedEntryId)}
                    @click=${() => params.onSelect(hub.entry_id)}
                  >
                    ${hub.name || hub.entry_id}
                  </button>
                `,
              )}
            </div>
          `
        : null}
    </div>
  `;
}

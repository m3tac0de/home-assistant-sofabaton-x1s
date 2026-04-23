import { html } from "lit";

export function renderHubPicker(params: {
  visible: boolean;
  selectedLabel: string;
  hubs: Array<{ entry_id: string; name?: string }>;
  selectedEntryId: string | null;
  onOpen: () => void;
  onSelect: (entryId: string) => void;
}) {
  if (!params.visible) return null;
  return html`
    <button class="hub-picker-btn" id="hub-picker-btn" @click=${params.onOpen}>
      <span class="chip-label">Hub</span>
      <span class="chip-name">${params.selectedLabel}</span>
      <span class="chip-arrow">▼</span>
    </button>
    <dialog id="hub-picker-dialog" class="hub-picker-dialog">
      ${params.hubs.map(
        (hub) => html`
          <div
            class="hub-option${hub.entry_id === params.selectedEntryId ? " selected" : ""}"
            @click=${() => params.onSelect(hub.entry_id)}
          >
            ${hub.name || hub.entry_id}
          </div>
        `,
      )}
    </dialog>
  `;
}

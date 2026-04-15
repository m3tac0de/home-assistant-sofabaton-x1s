import { html } from "lit";

export function renderAccordionSection(params: {
  sectionId: string;
  title: string;
  count: number;
  isOpen: boolean;
  disabled: boolean;
  spinning: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  body: unknown;
}) {
  return html`
    <div class="accordion-section${params.isOpen ? " open" : ""}" id=${`acc-${params.sectionId}`}>
      <div class="acc-header" @click=${params.onToggle}>
        <span class="acc-title">${params.title}</span>
        <span class="badge">${params.count}</span>
        <span class="flex-spacer"></span>
        <span class="refresh-list-label">Refresh list</span>
        <button class="icon-btn${params.spinning ? " spinning" : ""}" ?disabled=${params.disabled} @click=${(event: Event) => { event.stopPropagation(); params.onRefresh(); }}>
          <ha-icon icon="mdi:refresh"></ha-icon>
        </button>
        <span class="chevron">▼</span>
      </div>
      ${params.isOpen ? html`<div class="acc-body" id=${`acc-body-${params.sectionId}`}>${params.body}</div>` : null}
    </div>
  `;
}

import { html, type TemplateResult } from "lit";

/**
 * Collapsible section chrome shared by the editor's Styling / Layout /
 * Automation Assist sections (the legacy sb-exp header + body markup).
 */
export function renderEditorExpander(params: {
  expanded: boolean;
  icon: string;
  title: string;
  onToggle: () => void;
  body: TemplateResult;
}): TemplateResult {
  const toggle = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.onToggle();
  };
  return html`
    <div class="sb-exp${params.expanded ? "" : " sb-exp-collapsed"}">
      <button
        type="button"
        class="sb-exp-hdr"
        aria-expanded=${String(params.expanded)}
        @click=${toggle}
      >
        <div class="sb-exp-hdr-left">
          <ha-icon icon=${params.icon}></ha-icon>
          <div class="sb-exp-title">${params.title}</div>
        </div>
        <ha-icon
          class="sb-exp-chevron"
          icon=${params.expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
        ></ha-icon>
      </button>
      <div class="sb-exp-body">${params.body}</div>
    </div>
  `;
}

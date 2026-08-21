import { html, nothing, type TemplateResult } from "lit";

/**
 * One editor option row: a bold label (optionally with a help link and a
 * description) and an ha-switch at the end, plus optional sub-controls
 * rendered below while the switch is on. Shared by the General Options and
 * Styling Options drawers so both read the same way; rows inside a
 * `.sb-opt-list` are separated by divider lines.
 */
export interface OptionRowParams {
  label: string;
  description?: string;
  checked: boolean;
  onSet: (enabled: boolean) => void;
  link?: { href: string; title: string; ariaLabel: string } | null;
  sub?: TemplateResult | typeof nothing;
  className?: string;
}

export function renderOptionRow(params: OptionRowParams): TemplateResult {
  const onSwitchChange = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.target as HTMLElement & { checked?: boolean };
    params.onSet(!!target.checked);
  };
  const onLabelClick = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.onSet(!params.checked);
  };
  return html`
    <div class="sb-opt-row ${params.className ?? ""}">
      <label class="sb-opt-head">
        <div class="sb-opt-main">
          <div class="sb-opt-label-wrap" @click=${onLabelClick}>
            <span class="sb-opt-label">${params.label}</span>
            ${params.link
              ? html`
                  <a
                    class="sb-opt-link"
                    href=${params.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title=${params.link.title}
                    aria-label=${params.link.ariaLabel}
                    @click=${(ev: Event) => ev.stopPropagation()}
                  >
                    <ha-icon icon="mdi:help-circle-outline"></ha-icon>
                  </a>
                `
              : nothing}
          </div>
          ${params.description
            ? html`<div class="sb-opt-desc">${params.description}</div>`
            : nothing}
        </div>
        <ha-switch .checked=${params.checked} @change=${onSwitchChange}></ha-switch>
      </label>
      ${params.sub ?? nothing}
    </div>
  `;
}

/** A plain row (no switch) holding one ha-form field, for the same list. */
export function renderFormRow(
  form: TemplateResult,
  className = "",
): TemplateResult {
  return html`<div class="sb-opt-row sb-opt-row--form ${className}">${form}</div>`;
}

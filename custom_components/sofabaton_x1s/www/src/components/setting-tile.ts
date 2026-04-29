import { html, nothing } from "lit";

export function renderSettingTile(params: {
  title: string;
  description: string;
  classes?: string;
  control: unknown;
  footerLabel?: string;
  footerClass?: string;
  onClick?: () => void;
}) {
  return html`
    <div
      class="setting-tile ${params.classes ?? ""}"
      @pointerdown=${(event: PointerEvent) => {
        const tile = event.currentTarget as HTMLElement;
        if (tile.classList.contains("disabled")) return;
        tile.classList.add("pressed");
      }}
      @pointerup=${(event: PointerEvent) => {
        (event.currentTarget as HTMLElement).classList.remove("pressed");
      }}
      @pointercancel=${(event: PointerEvent) => {
        (event.currentTarget as HTMLElement).classList.remove("pressed");
      }}
      @pointerleave=${(event: PointerEvent) => {
        (event.currentTarget as HTMLElement).classList.remove("pressed");
      }}
      @click=${params.onClick ?? nothing}
    >
      <div class="setting-tile-content">
        <div class="setting-tile-header">
          <div class="setting-title">${params.title}</div>
          ${params.control}
        </div>
        <div class="setting-description">${params.description}</div>
      </div>
      ${params.footerLabel
        ? html`<div class="setting-tile-footer ${params.footerClass ?? ""}">${params.footerLabel}</div>`
        : nothing}
    </div>
  `;
}

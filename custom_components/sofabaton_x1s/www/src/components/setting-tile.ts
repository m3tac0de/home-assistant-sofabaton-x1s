import { html, nothing } from "lit";

export function renderSettingTile(params: {
  title: string;
  description: string;
  classes?: string;
  control: unknown;
  footerLabel?: string;
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
      <div class="setting-tile-body">
        <div class="setting-title">
          ${params.title}
          ${params.footerLabel
            ? html`<span class="setting-global-tag">${params.footerLabel}</span>`
            : nothing}
        </div>
        <div class="setting-description">${params.description}</div>
      </div>
      <div class="setting-tile-control">${params.control}</div>
    </div>
  `;
}

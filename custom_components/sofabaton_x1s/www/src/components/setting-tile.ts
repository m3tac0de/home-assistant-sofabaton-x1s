import { html, nothing } from "lit";

export function renderSettingTile(params: {
  title: string;
  /** Text, or markup for a description with inline parts (a name chip). */
  description: unknown;
  classes?: string;
  control: unknown;
  onClick?: () => void;
  /** The whole tile is the control (no switch or select inside it). */
  button?: boolean;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    params.onClick?.();
  };
  return html`
    <div
      class="setting-tile ${params.classes ?? ""}"
      role=${params.button ? "button" : nothing}
      tabindex=${params.button ? "0" : nothing}
      aria-disabled=${params.button && !params.onClick ? "true" : nothing}
      @keydown=${params.button ? onKeyDown : nothing}
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
        <div class="setting-title">${params.title}</div>
        <div class="setting-description">${params.description}</div>
      </div>
      <div class="setting-tile-control">${params.control}</div>
    </div>
  `;
}

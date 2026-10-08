// The type choice of the editor dialogs (device command / macro / Wifi Event)
// as a segmented control: with two or three kinds a dropdown only hides them.
// The server panel rebuilds the same markup in its own editors; keep the two alike.

import { html, nothing } from "lit";

export function renderKindSegments<K extends string>(params: {
  id: string;
  ariaLabel: string;
  value: K;
  options: Array<{ value: K; label: string }>;
  /** Receives the click; the segment carries its kind in `value`, like a select would. */
  onChange: (event: Event) => void;
}) {
  if (params.options.length < 2) return nothing;
  return html`
    <div class="kind-seg" id=${params.id} role="group" aria-label=${params.ariaLabel}>
      ${params.options.map((option) => html`
        <button
          class="kind-seg-btn"
          type="button"
          value=${option.value}
          aria-pressed=${option.value === params.value ? "true" : "false"}
          @click=${(event: Event) => { if (option.value !== params.value) params.onChange(event); }}
        >${option.label}</button>
      `)}
    </div>
  `;
}

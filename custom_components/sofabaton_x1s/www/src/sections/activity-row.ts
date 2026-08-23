// Activity selector row for the Lit card (legacy buildActivityRow + the
// select-sync half of _update). In device mode the same row hosts the device
// dropdown; the optional mode-toggle button renders fused to the select's
// left edge (docs/internal/device-mode-plan.md §3).

import { html, nothing, type TemplateResult } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { repeat } from "lit/directives/repeat.js";
import { ref, type Ref } from "lit/directives/ref.js";
import {
  selectItemTagName,
  selectOpenEvents,
  selectCloseEvents,
  selectValueCompat,
} from "../remote-card-compat";
import type { HassLike } from "../remote-card-types";
import { listenersRef } from "./wire";

export interface ActivityRowOption {
  value: string;
  label: string;
}

export interface ModeToggleParams {
  icon: string;
  ariaLabel: string;
  onToggle: () => void;
}

export interface ActivityRowParams {
  hass: HassLike | null;
  visible: boolean;
  /** Entity unavailable: select disabled with no options. */
  unavailable: boolean;
  /** Plain strings keep the legacy value===label behavior (activity mode). */
  options: Array<string | ActivityRowOption>;
  selectLabel: string;
  resolvedValue: string;
  disabled: boolean;
  loading: boolean;
  /** Activity/device mode toggle; absent = no toggle rendered. */
  modeToggle?: ModeToggleParams | null;
  /** Menu currently open (the toggle mirrors the field's active line). */
  menuOpen?: boolean;
  onSelect: (ev: Event) => void;
  onMenuOpened: () => void;
  onMenuClosed: () => void;
  rowRef?: Ref<HTMLElement>;
  loadIndicatorRef?: Ref<HTMLElement>;
}

export function renderActivityRow(params: ActivityRowParams): TemplateResult {
  const itemTag = unsafeStatic(selectItemTagName());
  const options = params.unavailable ? [] : params.options;
  const optionObjects: ActivityRowOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  const wireSelectEvents = listenersRef((el) => {
    el.addEventListener("selected", params.onSelect as EventListener);
    el.addEventListener("change", params.onSelect as EventListener);
    selectOpenEvents().forEach((eventName) => {
      el.addEventListener(eventName, () => params.onMenuOpened(), true);
    });
    selectCloseEvents().forEach((eventName) => {
      el.addEventListener(eventName, () => params.onMenuClosed(), true);
    });
    el.addEventListener("change", () => params.onMenuClosed(), true);
    el.addEventListener("blur", () => params.onMenuClosed(), true);
  });

  const toggle = params.modeToggle
    ? html`
        <button
          type="button"
          class="sb-mode-toggle"
          aria-label=${params.modeToggle.ariaLabel}
          title=${params.modeToggle.ariaLabel}
          .disabled=${params.unavailable}
          @click=${(ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
            params.modeToggle!.onToggle();
          }}
        >
          <ha-icon icon=${params.modeToggle.icon}></ha-icon>
        </button>
      `
    : nothing;

  return html`
    <div
      class="activityRow${params.modeToggle ? " activityRow--with-toggle" : ""}${params.menuOpen ? " activityRow--menu-open" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
      ${params.rowRef ? ref(params.rowRef) : nothing}
    >
      ${toggle}
      <ha-select
        class="sb-activity-select"
        .label=${params.selectLabel}
        .hass=${params.hass}
        .value=${params.unavailable ? "" : selectValueCompat(params.resolvedValue, optionObjects)}
        .disabled=${params.unavailable || params.disabled}
        ${wireSelectEvents}
      >
        ${repeat(
          optionObjects,
          (option) => option.value,
          (option) => staticHtml`
            <${itemTag} .value=${option.value}>${option.label}</${itemTag}>
          `,
        )}
      </ha-select>
      <div
        class="loadIndicator${params.loading ? " is-loading" : ""}"
        ${params.loadIndicatorRef ? ref(params.loadIndicatorRef) : nothing}
      ></div>
    </div>
  `;
}

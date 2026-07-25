// Activity selector row for the Lit card (legacy buildActivityRow + the
// select-sync half of _update).

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
import { str } from "../remote-card-strings";
import type { HassLike } from "../remote-card-types";
import { listenersRef } from "./wire";

export interface ActivityRowParams {
  hass: HassLike | null;
  visible: boolean;
  /** Entity unavailable: select disabled with no options. */
  unavailable: boolean;
  options: string[];
  resolvedValue: string;
  disabled: boolean;
  loading: boolean;
  onSelect: (ev: Event) => void;
  onMenuOpened: () => void;
  onMenuClosed: () => void;
  rowRef?: Ref<HTMLElement>;
  loadIndicatorRef?: Ref<HTMLElement>;
}

export function renderActivityRow(params: ActivityRowParams): TemplateResult {
  const itemTag = unsafeStatic(selectItemTagName());
  const options = params.unavailable ? [] : params.options;
  const optionObjects = options.map((opt) => ({ value: opt, label: opt }));

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

  return html`
    <div
      class="activityRow"
      style=${params.visible ? "" : "display: none !important;"}
      ${params.rowRef ? ref(params.rowRef) : nothing}
    >
      <ha-select
        class="sb-activity-select"
        .label=${str().card.activitySelectLabel}
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

// Native panel controls over the HA card's configuration readers and writers.
// No simulated hass object or duplicate layout inheritance rules.
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { repeat } from "lit/directives/repeat.js";
import { mdiTune, mdiPalette, mdiSort, mdiChevronDown, mdiDotsHorizontal, mdiDragVerticalVariant } from "@mdi/js";
import type { RemoteBackend, RemoteSnapshot } from "../../../remote-card/src/backend/remote-backend";
import type { RemoteCardConfig } from "../../../remote-card/src/remote-card-types";
import {
  channelGroupEnabled, deviceModeEnabledInConfig, deviceShortcutsFromConfig, dvrGroupEnabled,
  favoritesButtonEnabled, isDeviceLayoutKey, keyStyleFromConfig, macrosButtonEnabled,
  mediaGroupEnabled, openDeviceFromConfig, parseDeviceLayoutKey, SHORTCUT_SLOTS,
  tintedPanelsFromConfig, volumeGroupEnabled, MIN_ROW_VISIBLE_ROWS, MAX_ROW_VISIBLE_ROWS, type ShortcutSlot,
} from "../../../remote-card/src/remote-card-layout";
import {
  applyLayoutConfigPatch, applyShortcutSlotPatch, channelTogglePatch, commandsEnabled, commandsTogglePatch,
  deviceToggleEnabledForEditor, deviceTogglePatch, dvrTogglePatch, editorActivitiesFromState,
  editorDevicesFromState, editorGroupVisible, favoriteDeviceNamesForEditor, favoriteDeviceNamesPatch, favoritesTogglePatch, MF_MENU_KEYS, groupEnabledPatch, groupLabel,
  groupOrderListForEditor, isGroupEnabled, layoutConfigForSelection, layoutSelectionNote, macroTogglePatch,
  mfAsRowsForEditor, mfAsRowsPatch, mfRowVisibleRowsForEditor, mfRowVisibleRowsPatch, moveVisibleGroup, numpadEnabledForEditor, numpadTogglePatch,
  powerEnabled, powerTogglePatch, resetEditorLayout, volumeTogglePatch,
} from "../../../remote-card/src/remote-card-editor-layout";
import {
  LONG_PRESS_GROUPS, longPressBlock, longPressEnabledPatch, longPressGroupsPatch,
  longPressSelectedGroups, longPressSettings,
} from "../../../remote-card/src/remote-card-long-press";
import { longPressGroupLabel } from "../../../remote-card/src/editor-sections/general-options";
import { str } from "../../../remote-card/src/remote-card-strings";
import { MDI_ICON_PATHS } from "../../../remote-card/src/shims/mdi-icons";
import { PANEL_BASE_CSS } from "../panel-styles";
import { PointerReorder } from "../pointer-reorder";

/** Icon names the bundle can draw, for the shortcut icon picker. */
const ICON_NAMES: readonly string[] = Object.keys(MDI_ICON_PATHS).sort();

export class SbPanelRemoteEditor extends LitElement {
  static properties = {
    config: { attribute: false }, backend: { attribute: false }, snapshot: { attribute: false },
    selection: { state: true }, _menu: { state: true }, _slot: { state: true }, _icon: { state: true }, _command: { state: true },
    _iconOpen: { state: true }, _iconActive: { state: true },
  };
  static styles = [PANEL_BASE_CSS, css`
    :host { display: block; min-width: 0; container-type: inline-size; }
    *, *::before, *::after { box-sizing: border-box; }
    details { border: 1px solid var(--sbp-line); border-radius: 12px; margin-top: 12px; }
    summary { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; min-height: 48px; font-size: 14px; font-weight: 600; list-style: none; border-radius: 12px; }
    summary::-webkit-details-marker { display: none; }
    details[open] > summary { background: var(--sbp-panel-2); border-radius: 12px 12px 0 0; }
    .mdi { display: block; width: 22px; height: 22px; fill: currentColor; flex: 0 0 auto; }
    .chevron { margin-left: auto; width: 20px; height: 20px; transition: transform 120ms; }
    details[open] .chevron { transform: rotate(180deg); }
    .body { padding: 8px 12px 12px; }
    .feature { padding: 10px 0; }
    .feature + .feature { border-top: 1px solid var(--sbp-line); }
    .option { display: flex; align-items: center; gap: 8px; margin: 0; padding: 6px 0; color: var(--sbp-text); font-size: 13px; text-transform: none; letter-spacing: 0; line-height: 1.3; cursor: pointer; }
    .option span { flex: 1; min-width: 0; }
    .option small { display: block; margin-top: 5px; font-size: 13px; font-weight: 400; color: var(--sbp-muted); line-height: 1.35; }
    .feature > .option { flex-direction: row-reverse; align-items: flex-start; padding: 0; gap: 12px; font-size: 14px; font-weight: 600; }
    input[type=checkbox] { appearance: none; box-sizing: border-box; width: 46px; height: 24px; flex: 0 0 auto; padding: 0; margin: 0; border: 1px solid var(--sbp-muted); border-radius: 20px; background: var(--sbp-input); cursor: pointer; }
    input[type=checkbox]::before { content: ""; display: block; height: 18px; width: 18px; border-radius: 50%; margin: 2px; background: var(--sbp-muted); box-shadow: 0 1px 2px #0002; transition: transform 120ms; }
    input[type=checkbox]:checked { background: rgba(var(--sbp-accent-rgb), .12); border-color: var(--sbp-accent); }
    input[type=checkbox]:checked::before { transform: translateX(22px); background: var(--sbp-accent); }
    input:disabled, .option:has(input:disabled) { opacity: .45; cursor: default; }
    button:focus-visible, summary:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: -3px; }
    input[type=checkbox]:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: 2px; }
    .sub { padding: 10px 0 0 16px; }
    .field { margin: 10px 0 0; }
    .feature > .field:first-child { margin-top: 0; }
    .field > label { display: block; margin: 0; padding: 10px 0 1px; border-radius: 4px 4px 0 0; background: var(--sbp-input); color: var(--sbp-muted); box-shadow: inset 0 -1px 0 var(--sbp-muted); font-size: 12px; text-transform: none; letter-spacing: 0; }
    .field-label { display: block; padding: 0 16px; line-height: 16px; }
    .field > label:focus-within { box-shadow: inset 0 -2px 0 var(--sbp-accent); }
    .field > label:focus-within .field-label { color: var(--sbp-accent); }
    .field input, .field select { display: block; box-sizing: border-box; min-width: 0; max-width: 100%; width: 100%; min-height: 30px; margin: 0; padding: 3px 16px 9px; border: 0; border-radius: 0; background: transparent; color: var(--sbp-text); font-size: 14px; line-height: 20px; outline: none; box-shadow: none; }
    .field select option { background: var(--sbp-panel); }
    .field input[type=color] { height: 36px; padding: 3px 16px 8px; }
    .field-help { margin: 6px 16px 0; font-size: 12px; color: var(--sbp-muted); line-height: 1.4; }
    .layout-card { border: 1px solid var(--sbp-line); border-radius: 12px; padding: 16px 10px 10px; }
    .layout-note { margin: 6px 0; text-align: end; font-size: 12px; color: var(--sbp-muted); line-height: 1.4; }
    ha-select { --sb-select-selected-text: var(--sbp-text); }
    ha-select::part(trigger) { border-radius: 4px 4px 0 0; }
    ha-select::part(label) { font-size: 11px; }
    ha-select::part(value), ha-select::part(option) { font-size: 14px; }
    ha-select::part(menu) { border-radius: 0 0 6px 6px; padding: 4px; z-index: 60; overscroll-behavior: contain; }
    ha-select::part(option) { min-height: 40px; padding: 10px 14px; border-radius: 4px; }
    ha-select::part(default-option) { background: rgba(var(--sbp-accent-rgb), .06); border-bottom: 2px solid rgba(var(--sbp-accent-rgb), .45); }
    ha-select::part(default-option):hover, ha-select::part(default-option):focus-visible { background: rgba(var(--sbp-accent-rgb), .14); }
    .group { display: flex; align-items: center; gap: 10px; background: var(--sbp-panel); min-height: 45px; padding: 4px 0; }
    .group + .group { border-top: 1px solid var(--sbp-line); }
    .group-options { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 10px; min-width: 0; }
    .group-options .option:only-child { grid-column: 1 / -1; }
    .handle { touch-action: none; user-select: none; cursor: grab; border: 0; background: transparent; padding: 4px; width: 28px; height: 32px; flex: 0 0 auto; color: var(--sbp-muted); }
    .handle .mdi { width: 20px; height: 20px; }
    .dragging { position: relative; z-index: 2; box-shadow: 0 8px 24px #0003; }
    .shifting { transition: transform 120ms ease; }
    .group { flex-wrap: wrap; }
    .menu-btn, .menu-spacer { width: 32px; height: 32px; flex: 0 0 auto; }
    .menu-btn { display: grid; place-items: center; padding: 0; border-radius: 10px; color: var(--sbp-muted); background: transparent; }
    .menu-btn .mdi { width: 20px; height: 20px; }
    .menu-btn[aria-expanded=true] { border-color: var(--sbp-accent); color: var(--sbp-accent); }
    .row-menu { flex: 1 0 100%; display: flex; flex-direction: column; gap: 4px; margin: 2px 0 4px; padding: 6px 10px; border: 1px solid var(--sbp-line); border-radius: 12px; background: color-mix(in srgb, var(--sbp-text) 3%, var(--sbp-panel)); }
    .rows-control { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; padding: 6px 10px; margin-top: 10px; border: 1px solid var(--sbp-line); border-radius: 12px; background: color-mix(in srgb, var(--sbp-text) 3%, var(--sbp-panel)); }
    .stepper { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--sbp-muted); }
    .stepper[aria-disabled=true] { opacity: .45; }
    .stepper button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; font-size: 22px; border-radius: 12px; background: transparent; }
    .stepper output { min-width: 24px; text-align: center; font-size: 14px; font-weight: 600; }
    .layout-footer { display: flex; justify-content: flex-end; margin-top: 10px; }
    .layout-footer button { border-radius: 12px; }
    /* Shortcuts row (device layouts): the HA card's slot strip and drop-out
       panel. The three mini buttons fill the row's second cell; the open
       slot's panel wraps below inside the same row, with a caret under the
       button that opened it. */
    .shortcut-strip { display: inline-flex; gap: 8px; min-width: 0; align-self: center; }
    .shortcut-slot { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; width: 40px; min-width: 26px; height: 30px; padding: 0; border: 1px dashed var(--sbp-muted); border-radius: 8px; background: color-mix(in srgb, var(--sbp-text) 5%, transparent); color: var(--sbp-accent); }
    .shortcut-slot.is-configured { border-style: solid; background: var(--sbp-panel); }
    .shortcut-slot.is-open { border-color: var(--sbp-accent); box-shadow: 0 0 0 1px var(--sbp-accent) inset; }
    .shortcut-slot.is-open::after { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: var(--sbp-accent); pointer-events: none; }
    .shortcut-slot ha-icon { --mdc-icon-size: 18px; }
    .shortcut-panel { flex: 1 0 100%; display: flex; flex-direction: column; gap: 10px; margin: 2px 0 4px; padding: 10px 12px; border: 1px solid var(--sbp-line); border-radius: 10px; background: color-mix(in srgb, var(--sbp-text) 4%, var(--sbp-panel)); }
    .shortcut-panel .field { margin: 0; }
    .shortcut-panel-footer { display: flex; justify-content: flex-end; }
    .shortcut-panel-footer button { border-radius: 12px; }
    .shortcut-note { font-size: 12px; color: var(--sbp-muted); line-height: 1.35; }
    .icon-picker { position: relative; }
    .icon-field { display: flex; align-items: center; gap: 8px; padding: 0 16px 0 12px; }
    .icon-field ha-icon, .icon-field .icon-blank { flex: 0 0 auto; width: 24px; height: 24px; --mdc-icon-size: 24px; color: var(--sbp-text); }
    .icon-field input { padding-left: 0; padding-right: 0; }
    .icon-options { position: absolute; top: 100%; left: 0; right: 0; z-index: 60; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; margin-top: 2px; padding: 4px; border: 1px solid var(--sbp-line); border-radius: 0 0 6px 6px; background: var(--sbp-panel); box-shadow: 0 8px 24px #0003; }
    .icon-option { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 8px 14px; border: 0; border-radius: 4px; background: transparent; color: var(--sbp-text); font-size: 14px; text-align: start; }
    .icon-option ha-icon { --mdc-icon-size: 22px; flex: 0 0 auto; }
    .icon-option:hover, .icon-option.is-active { background: rgba(var(--sbp-accent-rgb), .1); }
    .icon-option[aria-selected=true] { color: var(--sbp-accent); }
    .notice { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @container (max-width: 340px) { .group-options { gap: 6px; } .group { gap: 4px; } .group .option { gap: 5px; font-size: 12px; } .group input[type=checkbox] { width: 38px; } .group input[type=checkbox]:checked::before { transform: translateX(14px); } }
  `];

  config: Record<string, unknown> = {};
  backend: RemoteBackend | null = null;
  snapshot: RemoteSnapshot | undefined;
  selection = "default";
  /** Group row whose "..." options panel is folded out, if any. */
  private _menu: string | null = null;
  private _slot: ShortcutSlot | null = null;
  private _icon = "";
  private _command = "";
  /** Icon picker list open + keyboard-active row (shortcut panel). */
  private _iconOpen = false;
  private _iconActive = -1;
  private _keymaps = new Map<number, { status: "loading" | "ready" | "cache_miss" | "error"; commands: Array<{ command_id: number; name: string }> }>();
  private _announcement = "";
  private _sorter = new PointerReorder(
    () => Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-group]")),
    () => this.requestUpdate(),
    (from, to) => this._move(from, to),
    () => parseFloat(getComputedStyle(this).getPropertyValue("--top-dock-height")) || 0,
  );

  disconnectedCallback(): void { super.disconnectedCallback(); this._sorter.cancel(); }
  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("selection")) {
      this._sorter.cancel();
      this._closeSlot();
      this._menu = null;
    }
    if (changed.has("backend")) {
      this._keymaps.clear();
      this._closeSlot();
      this._sorter.cancel();
    }
    // Like the HA editor, a concrete device selection fetches its commands
    // up front so an opened slot shows the command list without a wait.
    if (changed.has("selection") || changed.has("backend")) {
      const id = parseDeviceLayoutKey(this.selection);
      if (id != null) void this._loadCommands(id);
    }
  }

  private _emit(config: Record<string, unknown>): void {
    this.config = config;
    this.dispatchEvent(new CustomEvent("document-changed", { detail: { document: config }, bubbles: true, composed: true }));
  }
  private _set(patch: Record<string, unknown>): void {
    const next = { ...this.config, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    this._emit(next);
  }
  private _device(patch: Record<string, unknown>): void {
    const block: Record<string, unknown> = { ...((this.config as Partial<RemoteCardConfig>).device_mode || {}), ...patch };
    for (const key of Object.keys(block)) if (block[key] === undefined) delete block[key];
    this._set({ device_mode: Object.keys(block).length ? block : undefined });
  }
  private _patch(patch: Record<string, unknown> | null): void {
    if (patch) this._emit(applyLayoutConfigPatch(this.config, this.selection, patch).nextConfig);
  }
  private _select(value: string): void {
    this._sorter.cancel();
    this.selection = value;
    this._closeSlot();
    this.dispatchEvent(new CustomEvent("layout-selected", { detail: { selection: value }, bubbles: true, composed: true }));
  }
  private _isX2(): boolean {
    return String(this.snapshot?.attributes?.hub_version || "").toUpperCase().includes("X2");
  }
  private _visible(key: string): boolean {
    return editorGroupVisible(this.config, this.selection, key, this._isX2());
  }
  private _move(from: number, to: number): void {
    const order = groupOrderListForEditor(this.config, this.selection);
    const visible = order.filter((key) => this._visible(key));
    const next = moveVisibleGroup(order, (key) => this._visible(key), from, to);
    if (!next) return;
    const handle = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    this._announcement = `${groupLabel(visible[from])} moved to position ${to + 1} of ${visible.length}`;
    this._patch({ group_order: next });
    // Moving a keyed DOM node still drops focus in some browsers.
    if (handle?.classList.contains("handle")) void this.updateComplete.then(() => handle.focus());
  }
  private _toggle(label: string, checked: boolean, set: (value: boolean) => void, description = "", disabled = false): TemplateResult {
    return html`<label class="option"><input type="checkbox" role="switch" aria-label=${label} .checked=${checked} ?disabled=${disabled}
      @change=${(event: Event) => set((event.target as HTMLInputElement).checked)}><span>${label}${description ? html`<small>${description}</small>` : nothing}</span></label>`;
  }
  private _selectField(label: string, value: string, options: Array<{ value: string; label: string }>, set: (value: string) => void): TemplateResult {
    return html`<div class="field"><label><span class="field-label">${label}</span><select aria-label=${label} @change=${(event: Event) => set((event.target as HTMLSelectElement).value)}>
      ${options.map((option) => html`<option value=${option.value} .selected=${option.value === value}>${option.label}</option>`)}</select></label></div>`;
  }

  private _heading(label: string, icon: string): TemplateResult {
    return html`<summary><svg class="mdi" viewBox="0 0 24 24" aria-hidden="true"><path d=${icon}></path></svg><span>${label}</span><svg class="mdi chevron" viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiChevronDown}></path></svg></summary>`;
  }

  private _groups(): TemplateResult {
    const c = this.config, s = this.selection, e = str().editor;
    const layout = layoutConfigForSelection(c, s);
    const device = isDeviceLayoutKey(s);
    const rows = mfAsRowsForEditor(c, s);
    const order = groupOrderListForEditor(c, s).filter((key) => this._visible(key));
    const toggle = (label: string, value: boolean, patch: (value: boolean) => Record<string, unknown> | null) => this._toggle(label, value, (v) => this._patch(patch(v)));
    // Shortcuts slots are strictly per device: the strip and its panel show
    // for a concrete "device:<id>" the devices list knows, never for the
    // "All devices" layer (shortcuts-row-plan.md).
    const slotDevice = parseDeviceLayoutKey(s);
    const slotsOn = slotDevice != null && editorDevicesFromState(this.snapshot).some((d) => Number(d.id) === slotDevice);
    const cells = (key: string) => {
      if (key === "shortcuts") return html`${toggle(groupLabel(key), isGroupEnabled(c, s, key), (v) => groupEnabledPatch(key, v))}${slotsOn ? this._slotStrip(slotDevice!) : nothing}`;
      if (device && (key === "macro_favorites" || key === "macros_row")) return html`${toggle(e.commands, commandsEnabled(c, s), commandsTogglePatch)}${toggle(e.power, powerEnabled(c, s), powerTogglePatch)}`;
      if (key === "macro_favorites") return html`${toggle(e.macros, macrosButtonEnabled(layout), macroTogglePatch)}${toggle(e.favorites, favoritesButtonEnabled(layout), favoritesTogglePatch)}`;
      if (key === "macros_row") return toggle(e.macros, macrosButtonEnabled(layout), macroTogglePatch);
      if (key === "favorites_row") return toggle(e.favorites, favoritesButtonEnabled(layout), favoritesTogglePatch);
      if (key === "mid") return html`${toggle(e.volume, volumeGroupEnabled(layout), volumeTogglePatch)}${toggle(e.channel, channelGroupEnabled(layout), channelTogglePatch)}`;
      // The DVR keys exist on the X2 only: the switch follows the HA editor's gate.
      if (key === "media") return html`${toggle(e.mediaControls, mediaGroupEnabled(layout), (v) => groupEnabledPatch("media", v))}${this._isX2() ? toggle(e.dvr, dvrGroupEnabled(layout), dvrTogglePatch) : nothing}`;
      // X2 only: the number pad behind the D-pad (numpad-plan.md), the same
      // second switch the HA editor carries; the server is never the
      // official integration, so the model is the whole gate.
      if (key === "dpad" && this._isX2()) return html`${toggle(groupLabel(key), isGroupEnabled(c, s, key), (v) => groupEnabledPatch(key, v))}${toggle(e.numpad, numpadEnabledForEditor(c, s), numpadTogglePatch)}`;
      return html`${toggle(groupLabel(key), isGroupEnabled(c, s, key), (v) => groupEnabledPatch(key, v))}
        ${key === "activity" && deviceModeEnabledInConfig(c) ? this._toggle(e.modeToggle, isGroupEnabled(c, s, key) && deviceToggleEnabledForEditor(c, s), (v) => this._patch(deviceTogglePatch(v)), "", !isGroupEnabled(c, s, key)) : nothing}`;
    };
    // The "..." options on a favorites row (combined or split): device names
    // on the favorites, only where the devices list can resolve them. As-rows
    // mode stays in its own control under the list.
    const menuAvailable = !device && editorDevicesFromState(this.snapshot).length > 0;
    const hasMenu = (key: string) => menuAvailable && MF_MENU_KEYS.has(key);
    const menu = (key: string) => html`<div class="row-menu" id=${`row-menu-${key}`}>
      ${toggle(e.favoriteDeviceNames, favoriteDeviceNamesForEditor(c, s), favoriteDeviceNamesPatch)}
    </div>`;
    const menuButton = (key: string) => {
      if (!hasMenu(key)) return menuAvailable ? html`<span class="menu-spacer" aria-hidden="true"></span>` : nothing;
      return html`<button class="menu-btn" type="button" aria-label=${e.rowOptions(groupLabel(key))} aria-expanded=${this._menu === key ? "true" : "false"} aria-controls=${`row-menu-${key}`}
        @click=${() => { this._menu = this._menu === key ? null : key; }}><svg class="mdi" viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiDotsHorizontal}></path></svg></button>`;
    };
    return html`
      ${repeat(order, (key) => key, (key, index) => html`
        <div data-group=${key} class="group ${this._sorter.state?.from === index ? "dragging" : this._sorter.state ? "shifting" : ""}" style=${`transform: ${this._sorter.transform(index) || "none"}`}>
          <div class="group-options">${cells(key)}</div>
          ${menuButton(key)}
          <button class="handle" type="button" aria-label=${`Move ${groupLabel(key)}`} title="Drag to reorder (arrow keys move the group)"
            @pointerdown=${(ev: PointerEvent) => this._sorter.start(ev, index)} @pointermove=${(ev: PointerEvent) => this._sorter.move(ev)}
            @pointerup=${(ev: PointerEvent) => this._sorter.end(ev)} @pointercancel=${(ev: PointerEvent) => this._sorter.cancel(ev)}
            @lostpointercapture=${(ev: PointerEvent) => this._sorter.cancel(ev)}
            @keydown=${(ev: KeyboardEvent) => { if (ev.key === "Escape") this._sorter.cancel(); if (ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); this._move(index, index + (ev.key === "ArrowUp" ? -1 : 1)); } }}><svg class="mdi" viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiDragVerticalVariant}></path></svg></button>
          ${this._menu === key && hasMenu(key) ? menu(key) : nothing}
          ${key === "shortcuts" && slotsOn && this._slot ? this._slotPanel(slotDevice!) : nothing}
        </div>`)}
      <div class="hint notice" role="status" aria-live="polite">${this._announcement}</div>
      <div class="rows-control">
        ${this._toggle(device ? e.commandsAsRows : e.macrosFavoritesAsRows, rows, (v) => {
          // As rows swaps the combined row for the macros/favorites pair; an
          // open "..." panel follows the favorites onto the replacing row.
          if (this._menu && MF_MENU_KEYS.has(this._menu)) this._menu = v ? "favorites_row" : "macro_favorites";
          this._patch(mfAsRowsPatch(v));
        })}
        <div class="stepper" aria-disabled=${!rows}><span>${e.visibleRows}</span>
          <button type="button" aria-label="Fewer visible rows" ?disabled=${!rows || mfRowVisibleRowsForEditor(c, s) <= MIN_ROW_VISIBLE_ROWS} @click=${() => this._patch(mfRowVisibleRowsPatch(mfRowVisibleRowsForEditor(c, s) - 1))}>−</button>
          <output aria-label=${e.visibleRows}>${mfRowVisibleRowsForEditor(c, s)}</output>
          <button type="button" aria-label="More visible rows" ?disabled=${!rows || mfRowVisibleRowsForEditor(c, s) >= MAX_ROW_VISIBLE_ROWS} @click=${() => this._patch(mfRowVisibleRowsPatch(mfRowVisibleRowsForEditor(c, s) + 1))}>+</button>
        </div>
      </div>
      <div class="layout-footer"><button type="button" @click=${() => { this._sorter.cancel(); this._emit(resetEditorLayout(c, s)); }}>${e.resetDefaultLayout}</button></div>`;
  }

  private async _loadCommands(id: number): Promise<void> {
    if (this._keymaps.has(id) || !this.backend) return;
    const backend = this.backend;
    this._keymaps.set(id, { status: "loading", commands: [] });
    this.requestUpdate();
    try {
      const response = await backend.deviceKeymap(id);
      if (this.backend !== backend) return;
      if (!response?.keymap) {
        this._keymaps.set(id, { status: "cache_miss", commands: [] });
      } else {
        const commands = (response.keymap.commands || [])
          .map((c) => ({ command_id: Number(c.command_id), name: String(c.name || "") }))
          .filter((c) => Number.isFinite(c.command_id) && c.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        this._keymaps.set(id, { status: "ready", commands });
      }
    } catch {
      if (this.backend !== backend) return;
      this._keymaps.set(id, { status: "error", commands: [] });
    }
    this.requestUpdate();
  }

  // ---------- Shortcuts row: slot strip + drop-out panel (HA editor parity) ----------

  private _closeSlot(): void {
    this._slot = null;
    this._icon = "";
    this._command = "";
    this._iconOpen = false;
    this._iconActive = -1;
  }
  private _toggleSlot(slot: ShortcutSlot): void {
    if (this._slot === slot) { this._closeSlot(); return; }
    const id = parseDeviceLayoutKey(this.selection)!;
    const stored = deviceShortcutsFromConfig(this.config, id)[slot];
    this._slot = slot;
    this._icon = stored?.icon ?? "";
    this._command = stored ? String(stored.command_id) : "";
    this._iconOpen = false;
    this._iconActive = -1;
    void this._loadCommands(id);
  }
  /**
   * Draft edit: the slot is written (and the preview updates) the moment
   * both fields are valid; an incomplete draft leaves the stored slot alone.
   */
  private _draft(icon: string, command: string): void {
    this._icon = icon;
    this._command = command;
    const id = parseDeviceLayoutKey(this.selection);
    const commandId = command !== "" && Number.isFinite(Number(command)) ? Number(command) : null;
    if (id == null || !this._slot || !icon.trim() || commandId == null) return;
    const next = applyShortcutSlotPatch(this.config, id, this._slot, { icon: icon.trim(), command_id: commandId }).nextConfig;
    if (JSON.stringify(next) !== JSON.stringify(this.config)) this._emit(next);
  }
  /** Reset clears the stored slot and the draft; the panel stays open. */
  private _resetSlot(): void {
    const id = parseDeviceLayoutKey(this.selection);
    if (id == null || !this._slot) return;
    this._icon = "";
    this._command = "";
    this._iconOpen = false;
    this._emit(applyShortcutSlotPatch(this.config, id, this._slot, null).nextConfig);
  }
  private _slotStrip(id: number): TemplateResult {
    const e = str().editor;
    const stored = deviceShortcutsFromConfig(this.config, id);
    const label = (slot: ShortcutSlot) => slot === "left" ? e.shortcutSlotLeft : slot === "middle" ? e.shortcutSlotMiddle : e.shortcutSlotRight;
    return html`<div class="shortcut-strip">${SHORTCUT_SLOTS.map((slot) => {
      const icon = stored[slot]?.icon ?? null;
      const open = this._slot === slot;
      return html`<button type="button" class="shortcut-slot ${icon ? "is-configured" : ""} ${open ? "is-open" : ""}" aria-label=${label(slot)} aria-expanded=${open ? "true" : "false"}
        @click=${() => this._toggleSlot(slot)}>${icon ? html`<ha-icon icon=${icon}></ha-icon>` : nothing}</button>`;
    })}</div>`;
  }
  private _slotPanel(id: number): TemplateResult {
    const e = str().editor;
    const keymap = this._keymaps.get(id);
    const status = keymap?.status ?? "loading";
    if (status !== "ready") {
      const note = status === "loading" ? e.shortcutsCommandsLoading
        : status === "cache_miss" ? "This device's commands are not cached yet. Refresh this device in the Hub tab, then retry."
        : "Could not load this device's commands. Retry when the hub is available.";
      return html`<div class="shortcut-panel"><div class="shortcut-note">${note}</div>
        ${status === "loading" ? nothing : html`<div class="shortcut-panel-footer"><button type="button" @click=${() => { this._keymaps.delete(id); void this._loadCommands(id); }}>Retry</button></div>`}</div>`;
    }
    // A stored command id the keymap no longer knows stays listed as
    // "(missing)" so the user can see and fix it instead of a blank field.
    const options = keymap!.commands.map((c) => ({ value: String(c.command_id), label: c.name }));
    if (this._command && !options.some((o) => o.value === this._command)) options.push({ value: this._command, label: e.shortcutCommandMissing(this._command) });
    return html`<div class="shortcut-panel">
      ${this._iconPicker()}
      <ha-select class="shortcut-command" .label=${e.shortcutCommand} .value=${this._command}
        @selected=${(ev: CustomEvent<{ value: string }>) => { ev.stopPropagation(); this._draft(this._icon, ev.detail.value); }}>
        ${options.map((o) => html`<mwc-list-item .value=${o.value}>${o.label}</mwc-list-item>`)}
      </ha-select>
      <div class="shortcut-panel-footer"><button type="button" @click=${() => this._resetSlot()}>${e.shortcutReset}</button></div>
    </div>`;
  }
  /**
   * The HA icon selector as a combo box: a text field with the icon drawn in
   * front of it and a filtered list of icons underneath. The list offers
   * the icons this bundle ships (the web remote renders only those); any
   * other mdi name can still be typed.
   */
  private _iconPicker(): TemplateResult {
    const e = str().editor;
    const icon = this._icon.trim();
    const query = icon.toLowerCase().replace(/^mdi:/, "");
    const matches = this._iconOpen ? ICON_NAMES.filter((name) => name.includes(query)).slice(0, 80) : [];
    const pick = (name: string) => { this._draft(`mdi:${name}`, this._command); this._iconOpen = false; this._iconActive = -1; };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!this._iconOpen) { this._iconOpen = true; this._iconActive = -1; return; }
        if (!matches.length) return;
        this._iconActive = ev.key === "ArrowDown" ? Math.min(matches.length - 1, this._iconActive + 1) : Math.max(0, this._iconActive - 1);
      } else if (ev.key === "Enter" && this._iconOpen && this._iconActive >= 0 && matches[this._iconActive]) {
        ev.preventDefault();
        pick(matches[this._iconActive]);
      } else if (ev.key === "Escape" && this._iconOpen) {
        ev.preventDefault();
        this._iconOpen = false;
        this._iconActive = -1;
      }
    };
    return html`<div class="icon-picker">
      <div class="field"><label><span class="field-label">${e.shortcutIcon}</span>
        <div class="icon-field">
          ${icon ? html`<ha-icon icon=${icon}></ha-icon>` : html`<span class="icon-blank" aria-hidden="true"></span>`}
          <input role="combobox" aria-label=${e.shortcutIcon} aria-autocomplete="list" aria-expanded=${this._iconOpen ? "true" : "false"} aria-controls="icon-options"
            autocomplete="off" spellcheck="false" .value=${live(this._icon)}
            @focus=${() => { this._iconOpen = true; this._iconActive = -1; }}
            @blur=${() => { this._iconOpen = false; this._iconActive = -1; }}
            @input=${(ev: Event) => { this._iconOpen = true; this._iconActive = -1; this._draft((ev.target as HTMLInputElement).value, this._command); }}
            @keydown=${onKey}>
        </div></label></div>
      ${matches.length ? html`<div class="icon-options" id="icon-options" role="listbox" aria-label=${e.shortcutIcon}>${matches.map((name, index) => html`
        <button type="button" role="option" class="icon-option ${index === this._iconActive ? "is-active" : ""}" aria-selected=${icon === `mdi:${name}` ? "true" : "false"}
          @pointerdown=${(ev: Event) => ev.preventDefault()} @click=${() => pick(name)}><ha-icon icon=${`mdi:${name}`}></ha-icon><span>mdi:${name}</span></button>`)}</div>` : nothing}
    </div>`;
  }

  render(): TemplateResult {
    const c = this.config as Partial<RemoteCardConfig>, e = str().editor;
    const devices = editorDevicesFromState(this.snapshot);
    const activities = editorActivitiesFromState(this.snapshot);
    const enabled = deviceModeEnabledInConfig(c);
    const longPress = longPressSettings(c);
    const selected = longPressSelectedGroups(c);
    const color = Array.isArray(c.background_override) ? c.background_override : [255, 255, 255];
    const hex = `#${color.map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, "0")).join("")}`;
    return html`
      <details name="remote-options">${this._heading(e.generalOptionsTitle, mdiTune)}<div class="body">
        <div class="feature">
          ${this._toggle(e.enableDeviceMode, enabled, (v) => { this._device({ enabled: v ? undefined : false, ...(!v ? { open_device: undefined } : {}) }); if (!v && isDeviceLayoutKey(this.selection)) this._select("default"); }, e.deviceModeDescription)}
          ${enabled ? html`${this._selectField(e.initialView, String(openDeviceFromConfig(c) ?? "current"), [{ value: "current", label: e.openOnCurrentActivity }, ...devices.map((d) => ({ value: String(d.id), label: d.name }))], (v) => this._device({ open_device: v === "current" ? undefined : Number(v) }))}<p class="field-help">${e.initialViewHelper}</p>` : nothing}
        </div>
        <div class="feature">
          ${this._toggle(e.longPress, longPress.enabled, (v) => this._set({ hold_repeat: longPressEnabledPatch(v) }), e.longPressDescription)}
          ${longPress.enabled ? html`<div class="sub">${LONG_PRESS_GROUPS.map((group) => this._toggle(longPressGroupLabel(group), selected.includes(group), (v) => this._set({ hold_repeat: longPressGroupsPatch(longPressBlock(c), v ? [...selected, group] : selected.filter((g) => g !== group)) })))}</div>` : nothing}
        </div>
      </div></details>
      <details name="remote-options">${this._heading(e.stylingOptions, mdiPalette)}<div class="body">
        <div class="feature"><div class="field"><label><span class="field-label">Maximum width (px)</span><input aria-label="Maximum width (px)" type="number" min="230" max="1200" step="5" .value=${live(String(c.max_width ?? 360))} @change=${(ev: Event) => { const input = ev.target as HTMLInputElement; if (input.value && input.checkValidity()) this._set({ max_width: input.valueAsNumber === 360 ? undefined : input.valueAsNumber }); }}></label></div></div>
        <div class="feature">${this._selectField(e.fieldLabels.key_style || "Key style", keyStyleFromConfig(c), [{ value: "flat", label: e.keyStyleFlat }, { value: "tinted", label: e.keyStyleTinted }, { value: "elevated", label: e.keyStyleElevated }, { value: "glossy", label: e.keyStyleGlossy }], (v) => this._set({ key_style: v === "flat" ? undefined : v, ...(c.key_style === "panel" ? { tinted_panels: true } : {}) }))}</div>
        <div class="feature">${this._toggle(e.tintedPanels, tintedPanelsFromConfig(c), (v) => this._set({ tinted_panels: v || undefined, ...(c.key_style === "panel" ? { key_style: undefined } : {}) }), e.tintedPanelsDescription)}</div>
        <div class="feature">
          ${this._toggle(e.fieldLabels.use_background_override, !!c.background_override, (v) => this._set({ background_override: v ? [255, 255, 255] : undefined, use_background_override: undefined }))}
          ${c.background_override ? html`<div class="field"><label><span class="field-label">Background color</span><input type="color" aria-label="Background color" .value=${live(hex)} @input=${(ev: Event) => { const value = (ev.target as HTMLInputElement).value; this._set({ background_override: [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) }); }}></label></div>` : nothing}
        </div>
      </div></details>
      <details name="remote-options">${this._heading(e.layoutOptions, mdiSort)}<div class="body"><div class="layout-card">
        <ha-select id="layout-select" .label=${e.layoutSelectLabel} .value=${this.selection}
          @selected=${(ev: CustomEvent<{ value: string }>) => { ev.stopPropagation(); this._select(ev.detail.value); }}>
          <mwc-list-item class="sb-option-default" .value=${"default"}>${e.defaultLayoutOption}</mwc-list-item>
          ${activities.map((a) => html`<mwc-list-item .value=${String(a.id)}>${a.name}</mwc-list-item>`)}
          ${enabled ? html`<mwc-list-item class="sb-option-default" .value=${"device:default"}>${e.allDevicesOption}</mwc-list-item>
            ${devices.map((d) => html`<mwc-list-item .value=${`device:${d.id}`}>${d.name}</mwc-list-item>`)}` : nothing}
        </ha-select>
        <p class="layout-note">${layoutSelectionNote(c, this.selection)}</p>
        ${this._groups()}
      </div></div></details>`;
  }
}

export function defineRemoteEditor(): void {
  if (!customElements.get("sb-panel-remote-editor")) customElements.define("sb-panel-remote-editor", SbPanelRemoteEditor);
}

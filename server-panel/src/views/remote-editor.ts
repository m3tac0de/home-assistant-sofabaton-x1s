// Native panel controls over the HA card's configuration readers and writers.
// No simulated hass object or duplicate layout inheritance rules.
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { repeat } from "lit/directives/repeat.js";
import { mdiTune, mdiPalette, mdiSort, mdiChevronDown, mdiDragVerticalVariant } from "@mdi/js";
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
  editorDevicesFromState, editorGroupVisible, favoritesTogglePatch, groupEnabledPatch, groupLabel,
  groupOrderListForEditor, isGroupEnabled, layoutConfigForSelection, layoutSelectionNote, macroTogglePatch,
  mfAsRowsForEditor, mfAsRowsPatch, mfRowVisibleRowsForEditor, mfRowVisibleRowsPatch, moveVisibleGroup,
  powerEnabled, powerTogglePatch, resetEditorLayout, volumeTogglePatch,
} from "../../../remote-card/src/remote-card-editor-layout";
import {
  LONG_PRESS_GROUPS, longPressBlock, longPressEnabledPatch, longPressGroupsPatch,
  longPressSelectedGroups, longPressSettings,
} from "../../../remote-card/src/remote-card-long-press";
import { longPressGroupLabel } from "../../../remote-card/src/editor-sections/general-options";
import { str } from "../../../remote-card/src/remote-card-strings";
import { PANEL_BASE_CSS } from "../panel-styles";
import { PointerReorder } from "../pointer-reorder";

export class SbPanelRemoteEditor extends LitElement {
  static properties = {
    config: { attribute: false }, backend: { attribute: false }, snapshot: { attribute: false },
    selection: { state: true }, _slot: { state: true }, _icon: { state: true }, _command: { state: true },
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
    .rows-control { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; padding: 6px 10px; margin-top: 10px; border: 1px solid var(--sbp-line); border-radius: 12px; background: color-mix(in srgb, var(--sbp-text) 3%, var(--sbp-panel)); }
    .stepper { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--sbp-muted); }
    .stepper[aria-disabled=true] { opacity: .45; }
    .stepper button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; font-size: 22px; border-radius: 12px; background: transparent; }
    .stepper output { min-width: 24px; text-align: center; font-size: 14px; font-weight: 600; }
    .layout-footer { display: flex; justify-content: flex-end; margin-top: 10px; }
    .layout-footer button { border-radius: 12px; }
    .slots { display: flex; gap: 8px; margin: 12px 0; }
    .slots button { flex: 1; min-width: 0; text-transform: capitalize; }
    .slots button[aria-pressed=true] { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), .1); }
    .slot-editor { border: 1px solid var(--sbp-line); padding: 12px; border-radius: 8px; }
    .slot-editor button { margin-top: 12px; }
    .notice { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @container (max-width: 340px) { .group-options { gap: 6px; } .group { gap: 4px; } .group .option { gap: 5px; font-size: 12px; } .group input[type=checkbox] { width: 38px; } .group input[type=checkbox]:checked::before { transform: translateX(14px); } }
  `];

  config: Record<string, unknown> = {};
  backend: RemoteBackend | null = null;
  snapshot: RemoteSnapshot | undefined;
  selection = "default";
  private _slot: ShortcutSlot | null = null;
  private _icon = "";
  private _command = "";
  private _keymaps = new Map<number, { status: string; commands: Array<{ command_id: number; name: string }> }>();
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
      this._slot = null;
    }
    if (changed.has("backend")) {
      this._keymaps.clear();
      this._slot = null;
      this._sorter.cancel();
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
    this._slot = null;
    this.dispatchEvent(new CustomEvent("layout-selected", { detail: { selection: value }, bubbles: true, composed: true }));
  }
  private _visible(key: string): boolean {
    return editorGroupVisible(this.config, this.selection, key, String(this.snapshot?.attributes?.hub_version || "").toUpperCase().includes("X2"));
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
    const cells = (key: string) => {
      if (device && (key === "macro_favorites" || key === "macros_row")) return html`${toggle(e.commands, commandsEnabled(c, s), commandsTogglePatch)}${toggle(e.power, powerEnabled(c, s), powerTogglePatch)}`;
      if (key === "macro_favorites") return html`${toggle(e.macros, macrosButtonEnabled(layout), macroTogglePatch)}${toggle(e.favorites, favoritesButtonEnabled(layout), favoritesTogglePatch)}`;
      if (key === "macros_row") return toggle(e.macros, macrosButtonEnabled(layout), macroTogglePatch);
      if (key === "favorites_row") return toggle(e.favorites, favoritesButtonEnabled(layout), favoritesTogglePatch);
      if (key === "mid") return html`${toggle(e.volume, volumeGroupEnabled(layout), volumeTogglePatch)}${toggle(e.channel, channelGroupEnabled(layout), channelTogglePatch)}`;
      if (key === "media") return html`${toggle(e.mediaControls, mediaGroupEnabled(layout), (v) => groupEnabledPatch("media", v))}${toggle(e.dvr, dvrGroupEnabled(layout), dvrTogglePatch)}`;
      return html`${toggle(groupLabel(key), isGroupEnabled(c, s, key), (v) => groupEnabledPatch(key, v))}
        ${key === "activity" && deviceModeEnabledInConfig(c) ? this._toggle(e.modeToggle, isGroupEnabled(c, s, key) && deviceToggleEnabledForEditor(c, s), (v) => this._patch(deviceTogglePatch(v)), "", !isGroupEnabled(c, s, key)) : nothing}`;
    };
    return html`
      ${repeat(order, (key) => key, (key, index) => html`
        <div data-group=${key} class="group ${this._sorter.state?.from === index ? "dragging" : this._sorter.state ? "shifting" : ""}" style=${`transform: ${this._sorter.transform(index) || "none"}`}>
          <div class="group-options">${cells(key)}</div>
          <button class="handle" type="button" aria-label=${`Move ${groupLabel(key)}`} title="Drag to reorder (arrow keys move the group)"
            @pointerdown=${(ev: PointerEvent) => this._sorter.start(ev, index)} @pointermove=${(ev: PointerEvent) => this._sorter.move(ev)}
            @pointerup=${(ev: PointerEvent) => this._sorter.end(ev)} @pointercancel=${(ev: PointerEvent) => this._sorter.cancel(ev)}
            @lostpointercapture=${(ev: PointerEvent) => this._sorter.cancel(ev)}
            @keydown=${(ev: KeyboardEvent) => { if (ev.key === "Escape") this._sorter.cancel(); if (ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); this._move(index, index + (ev.key === "ArrowUp" ? -1 : 1)); } }}><svg class="mdi" viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiDragVerticalVariant}></path></svg></button>
        </div>`)}
      <div class="hint notice" role="status" aria-live="polite">${this._announcement}</div>
      ${parseDeviceLayoutKey(s) != null ? this._shortcuts() : nothing}
      <div class="rows-control">
        ${this._toggle(device ? e.commandsAsRows : e.macrosFavoritesAsRows, rows, (v) => this._patch(mfAsRowsPatch(v)))}
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
    this._keymaps.set(id, { status: "Loading commands…", commands: [] });
    this.requestUpdate();
    try {
      const response = await backend.deviceKeymap(id);
      if (this.backend !== backend) return;
      const commands = (response?.keymap?.commands || []).map((c) => ({ command_id: Number(c.command_id), name: String(c.name || c.command_id) })).filter((c) => Number.isFinite(c.command_id));
      this._keymaps.set(id, { status: commands.length ? "" : "No cached commands available. Sync this hub's catalog and retry.", commands });
    } catch {
      if (this.backend !== backend) return;
      this._keymaps.set(id, { status: "Could not load commands. Retry when the hub is available.", commands: [] });
    }
    this.requestUpdate();
  }
  private _openSlot(slot: ShortcutSlot): void {
    const id = parseDeviceLayoutKey(this.selection)!;
    this._slot = this._slot === slot ? null : slot;
    const stored = deviceShortcutsFromConfig(this.config, id)[slot];
    this._icon = stored?.icon || "";
    this._command = stored ? String(stored.command_id) : "";
    if (this._slot) void this._loadCommands(id);
  }
  private _writeSlot(): void {
    const id = parseDeviceLayoutKey(this.selection);
    if (id == null || !this._slot || !this._icon.trim() || !this._command) return;
    this._emit(applyShortcutSlotPatch(this.config, id, this._slot, { icon: this._icon.trim(), command_id: Number(this._command) }).nextConfig);
  }
  private _shortcuts(): TemplateResult {
    const id = parseDeviceLayoutKey(this.selection)!;
    const stored = deviceShortcutsFromConfig(this.config, id);
    const keymap = this._keymaps.get(id);
    const commands = keymap?.commands || [];
    return html`<h3>Device shortcuts</h3><div class="slots">${SHORTCUT_SLOTS.map((slot) => html`
      <button type="button" aria-pressed=${this._slot === slot} @click=${() => this._openSlot(slot)}>${stored[slot] ? html`<ha-icon icon=${stored[slot]!.icon}></ha-icon>` : "+"} ${slot}</button>`)}</div>
      ${this._slot ? html`<div class="slot-editor">
        <div class="field"><label><span class="field-label">Icon (for example mdi:home)</span><input aria-label="Shortcut icon" placeholder="mdi:home" .value=${live(this._icon)} @input=${(ev: Event) => { this._icon = (ev.target as HTMLInputElement).value; this._writeSlot(); }}></label></div>
        ${this._selectField("Shortcut command", this._command, [{ value: "", label: "Choose a command" },
          ...(this._command && !commands.some((c) => String(c.command_id) === this._command) ? [{ value: this._command, label: `Command ${this._command} (stored)` }] : []),
          ...commands.map((c) => ({ value: String(c.command_id), label: c.name }))], (v) => { this._command = v; this._writeSlot(); })}
        ${keymap?.status ? html`<div class="hint">${keymap.status}</div>${keymap.status.startsWith("Loading") ? nothing : html`<button @click=${() => { this._keymaps.delete(id); void this._loadCommands(id); }}>Retry commands</button>`}` : nothing}
        <div class="hint">Both an icon and a command are needed to update this slot.</div>
        <button @click=${() => { this._emit(applyShortcutSlotPatch(this.config, id, this._slot!, null).nextConfig); this._icon = ""; this._command = ""; }}>Clear shortcut</button>
      </div>` : nothing}`;
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

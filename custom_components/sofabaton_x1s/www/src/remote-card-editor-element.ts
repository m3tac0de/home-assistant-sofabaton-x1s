// Lit config editor for the Sofabaton Virtual Remote card — the ported
// replacement for remote-card-legacy-editor.ts. Layout/config mutations
// delegate to the pure helpers in remote-card-editor-layout.ts; the sections
// render via editor-sections/*.

import { LitElement, html, nothing, unsafeCSS } from "lit";
import {
  LAYOUT_KEYS,
  channelGroupEnabled,
  deviceModeEnabledInConfig,
  dvrGroupEnabled,
  favoritesButtonEnabled,
  isDeviceLayoutKey,
  macrosButtonEnabled,
  mediaGroupEnabled,
  openDeviceFromConfig,
  volumeGroupEnabled,
} from "./remote-card-layout";
import {
  applyLayoutConfigPatch,
  channelTogglePatch,
  commandsEnabled,
  commandsTogglePatch,
  powerEnabled,
  powerTogglePatch,
  deviceStoredLayerKey,
  deviceToggleEnabledForEditor,
  deviceTogglePatch,
  dvrTogglePatch,
  editorActivitiesFromState,
  editorDevicesFromState,
  favoritesTogglePatch,
  groupEnabledPatch,
  groupLabel,
  groupOrderListForEditor,
  isGroupEnabled,
  layoutConfigForSelection,
  layoutSelectionNote,
  macroTogglePatch,
  mfAsRowsForEditor,
  mfAsRowsPatch,
  mfRowVisibleRowsForEditor,
  mfRowVisibleRowsPatch,
  moveVisibleGroup,
  volumeTogglePatch,
} from "./remote-card-editor-layout";
import { hubVersionFor, isX2Hub } from "./remote-card-compat";
import {
  remoteCardDirection,
  remoteCardLanguage,
  setRemoteCardLanguage,
  str,
} from "./remote-card-strings";
import { REMOTE_CARD_EDITOR_CSS } from "./remote-card-styles";
import {
  readPreviewActivity,
  writePreviewActivity,
} from "./remote-card-shared";
import type { HassLike, RemoteCardConfig } from "./remote-card-types";
import { renderGeneralOptionsSection } from "./editor-sections/general-options";
import {
  longPressBlock,
  longPressEnabledPatch,
  longPressGroupsPatch,
  longPressSelectedGroups,
  longPressSettings,
} from "./remote-card-long-press";
import {
  computeEditorFieldLabel,
  renderStylingOptionsSection,
} from "./editor-sections/styling-options";
import { renderGroupOrderSection } from "./editor-sections/group-order";

// Card-level settings whose absence means exactly this value (see
// normalizeRemoteCardConfig); the editor never stores them at their default.
const CARD_SETTING_DEFAULTS: Record<string, unknown> = {
  theme: "",
  max_width: 360,
  shrink: 0,
  show_automation_assist: false,
  background_override: null,
};

const ENTITY_FORM_SCHEMA = [
  {
    name: "entity",
    selector: {
      entity: {
        filter: [
          { domain: "remote", integration: "sofabaton_x1s" },
          { domain: "remote", integration: "sofabaton_hub" },
        ],
      },
    },
    required: true,
  },
];

// Sentinel select value for "no open_device configured" — the initial-view
// select always has a concrete selection, and device ids are numeric so the
// sentinel can never collide.
const OPEN_WITH_CURRENT = "current";

export class SofabatonRemoteCardEditor extends LitElement {
  static styles = unsafeCSS(REMOTE_CARD_EDITOR_CSS);

  private _hass: HassLike | null = null;
  private _config: RemoteCardConfig = { entity: "" };
  private _configInitialized = false;
  private _previewActivity: string | null = null;
  private _layoutSelection = "default";
  private _generalExpanded = false;
  private _stylingExpanded = false;
  private _layoutExpanded = false;
  private _editorIntegrationDomain: string | null = null;
  private _editorIntegrationEntityId: string | null = null;
  private _editorIntegrationDetectingFor: string | null = null;
  private _sortableDefinePending = false;

  // ---------- integration detection (x1s vs hub) ----------

  private async _ensureEditorIntegration(): Promise<void> {
    if (!this._hass?.callWS || !this._config?.entity) return;

    const entityId = String(this._config.entity);
    if (
      this._editorIntegrationEntityId === entityId &&
      this._editorIntegrationDomain
    )
      return;
    if (this._editorIntegrationDetectingFor === entityId) return;

    this._editorIntegrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS<{ platform?: string }>({
        type: "config/entity_registry/get",
        entity_id: entityId,
      });
      this._editorIntegrationDomain = String(entry?.platform || "");
      this._editorIntegrationEntityId = entityId;
    } catch (e) {
      this._editorIntegrationDomain = null;
      this._editorIntegrationEntityId = entityId;
    } finally {
      this._editorIntegrationDetectingFor = null;
    }
    this.requestUpdate();
  }

  private _isHubIntegrationForEditor(): boolean {
    return String(this._editorIntegrationDomain || "") === "sofabaton_hub";
  }

  /**
   * Positive x1s check for every device-mode affordance: an unknown or
   * undetected integration gets NO device UI (leakage prevention), not just
   * the official hub integration.
   */
  private _isX1sIntegrationForEditor(): boolean {
    return String(this._editorIntegrationDomain || "") === "sofabaton_x1s";
  }

  private _deviceModeEnabled(): boolean {
    return deviceModeEnabledInConfig(this._config);
  }

  /** Write back the device_mode block, dropping it entirely when empty. */
  private _withDeviceModeBlock(
    mutate: (block: Record<string, unknown>) => void,
  ): RemoteCardConfig {
    const next = { ...this._config };
    const block: Record<string, unknown> = { ...(next.device_mode || {}) };
    mutate(block);
    if (Object.keys(block).length) {
      next.device_mode = block;
    } else {
      delete next.device_mode;
    }
    return next;
  }

  private _setDeviceModeEnabled(enabled: boolean): void {
    this._config = this._withDeviceModeBlock((block) => {
      if (enabled) {
        // Absent = enabled (the default): keep saved configs clean.
        delete block.enabled;
      } else {
        block.enabled = false;
        delete block.open_device;
      }
    });
    if (!enabled && isDeviceLayoutKey(this._layoutSelection)) {
      this._layoutSelection = "default";
      this._setPreviewActivityForSelection("default");
    }
    this._fireChanged();
    this.requestUpdate();
  }

  private _setOpenDevice(value: string): void {
    if (value !== "" && !Number.isFinite(Number(value))) return;
    const next = this._withDeviceModeBlock((block) => {
      if (value === "") {
        delete block.open_device;
      } else {
        block.open_device = Number(value);
      }
    });
    if (JSON.stringify(next) === JSON.stringify(this._config)) return;
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }

  /** Initial-view select (General Options): the sentinel clears open_device. */
  private _onInitialViewChanged(raw: unknown): void {
    this._setOpenDevice(
      raw == null || raw === "" || raw === OPEN_WITH_CURRENT ? "" : String(raw),
    );
  }

  // ---------- long press ----------

  /** Write back the hold_repeat block, dropping it entirely when disabled. */
  private _setLongPressEnabled(enabled: boolean): void {
    if (enabled === longPressSettings(this._config).enabled) return;
    const next = { ...this._config };
    const block = longPressEnabledPatch(enabled);
    if (block) {
      next.hold_repeat = block;
    } else {
      delete next.hold_repeat;
    }
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }

  private _setLongPressGroups(selected: string[]): void {
    const next = {
      ...this._config,
      hold_repeat: longPressGroupsPatch(longPressBlock(this._config), selected),
    };
    if (JSON.stringify(next) === JSON.stringify(this._config)) return;
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }

  private _isEditorX2(): boolean {
    return isX2Hub(
      hubVersionFor(this._hass, this._config?.entity),
      this._isHubIntegrationForEditor(),
    );
  }

  // ---------- HA wiring ----------

  set hass(hass: HassLike) {
    this._hass = hass;
    const language =
      (hass as { locale?: { language?: string }; language?: string })?.locale
        ?.language ??
      (hass as { language?: string })?.language;
    setRemoteCardLanguage(language);
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();

    const entityId = String(this._config?.entity || "").trim();
    if (entityId) {
      if (
        this._editorIntegrationEntityId !== entityId &&
        this._editorIntegrationDetectingFor !== entityId
      ) {
        void this._ensureEditorIntegration();
      }
    }
    this.requestUpdate();
  }

  get hass(): HassLike | null {
    return this._hass;
  }

  setConfig(config: RemoteCardConfig): void {
    const incomingConfig: RemoteCardConfig = { ...(config || {}) };
    const isInitialEditorConfig = !this._configInitialized;
    this._configInitialized = true;

    if ("preview_activity" in incomingConfig) {
      delete incomingConfig.preview_activity;
    }

    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this._previewActivity = String(config?.preview_activity ?? "");
      writePreviewActivity(config?.entity, this._previewActivity);
    } else if (this._previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this._previewActivity = cached ?? "";
    }

    if (isInitialEditorConfig) {
      this._layoutSelection = "default";
      this._previewActivity = "";
      writePreviewActivity(config?.entity, "");
      window.dispatchEvent(
        new CustomEvent("sofabaton-preview-activity", {
          detail: { entity: config?.entity, previewActivity: "" },
        }),
      );
    }

    const nextEntity = String(incomingConfig?.entity || "");
    if (nextEntity !== String(this._editorIntegrationEntityId || "")) {
      this._editorIntegrationEntityId = null;
      this._editorIntegrationDomain = null;
      this._editorIntegrationDetectingFor = null;
    }

    if ("commands" in incomingConfig) delete incomingConfig.commands;

    const configUnchanged =
      !isInitialEditorConfig &&
      JSON.stringify(this._config || {}) === JSON.stringify(incomingConfig);

    this._config = incomingConfig;

    if (configUnchanged) return;

    if (!isInitialEditorConfig) {
      this._syncLayoutSelectionWithPreview();
    }
    this.requestUpdate();
  }

  // ---------- config mutation plumbing ----------

  private _fireChanged(): void {
    // Strip the helper toggle + transient fields before saving to HASS YAML.
    const finalConfig = { ...this._config };
    delete finalConfig.use_background_override;
    delete finalConfig.preview_activity;
    delete finalConfig.commands;

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: finalConfig },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Merge handler shared by the entity form and the styling form. */
  private _mergeFormValue(value: Record<string, unknown>): void {
    const newValue: RemoteCardConfig = { ...this._config, ...value };
    const entityChanged = newValue.entity !== this._config.entity;

    // 1. If the toggle is off, wipe the color data.
    if (newValue.use_background_override === false) {
      delete newValue.background_override;
    }

    // 2. Card-level hygiene: ha-form echoes its whole data object back, so
    // drop settings that merely restate their defaults (absent = default).
    for (const [key, defaultValue] of Object.entries(CARD_SETTING_DEFAULTS)) {
      if (newValue[key] === defaultValue) delete newValue[key];
    }

    // 3. STABILITY CHECK: only fire if something actually changed.
    if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;

    if (entityChanged) {
      const prevConfig = this._config;
      this._config = { ...prevConfig, entity: newValue.entity };
      this._layoutSelection = "default";
      this._setPreviewActivityForSelection("default");
      this._config = prevConfig;
      if (prevConfig?.entity) {
        writePreviewActivity(prevConfig.entity, "");
        window.dispatchEvent(
          new CustomEvent("sofabaton-preview-activity", {
            detail: { entity: prevConfig.entity, previewActivity: "" },
          }),
        );
      }
    }

    this._config = newValue;
    this._fireChanged();
    this.requestUpdate();
  }

  private _updateLayoutConfig(patch: Record<string, unknown>): void {
    const selection = this._layoutSelectionKey();
    const { nextConfig } = applyLayoutConfigPatch(this._config, selection, patch);
    this._config = nextConfig as RemoteCardConfig;
    this._fireChanged();
    this.requestUpdate();
  }

  private _setAutomationAssistEnabled(enabled: boolean): void {
    const next = { ...this._config };
    if (enabled) {
      next.show_automation_assist = true;
    } else {
      // Absent = disabled (the default).
      delete next.show_automation_assist;
    }
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }

  // ---------- layout selection / preview ----------

  private _layoutSelectionKey(): string {
    return this._layoutSelection ?? "default";
  }

  private _syncLayoutSelectionWithPreview(): void {
    const preview = this._previewActivity;
    if (preview == null || preview === "" || preview === "powered_off") {
      this._layoutSelection = "default";
      return;
    }
    this._layoutSelection = String(preview);
  }

  private _setPreviewActivityForSelection(selection: string): void {
    const nextPreview = selection === "default" ? "" : String(selection);
    if (this._previewActivity === nextPreview) return;
    this._previewActivity = nextPreview;
    writePreviewActivity(this._config?.entity, nextPreview);
    window.dispatchEvent(
      new CustomEvent("sofabaton-preview-activity", {
        detail: { entity: this._config?.entity, previewActivity: nextPreview },
      }),
    );
  }

  private _onSelectLayout(selection: string): void {
    if (selection === this._layoutSelectionKey()) return;
    this._layoutSelection = selection;
    this._setPreviewActivityForSelection(selection);
    this.requestUpdate();
  }

  // ---------- group order ----------

  private _isEditorGroupVisible(key: string, isEditorX2: boolean): boolean {
    if (!isEditorX2 && key === "abc") return false;
    const selection = this._layoutSelectionKey();
    const asRows = mfAsRowsForEditor(this._config, selection);
    if (isDeviceLayoutKey(selection)) {
      // Device layouts render ONE commands construct: the drawer row when
      // tabs, the macros_row slot when inline rows; favorites_row never.
      if (key === "macro_favorites") return !asRows;
      if (key === "macros_row") return asRows;
      if (key === "favorites_row") return false;
      return true;
    }
    if (key === "macro_favorites") return !asRows;
    if (key === "macros_row" || key === "favorites_row") return asRows;
    return true;
  }

  private _moveGroupByVisibleIndex(fromVisible: number, toVisible: number): void {
    const isEditorX2 = this._isEditorX2();
    const next = moveVisibleGroup(
      groupOrderListForEditor(this._config, this._layoutSelectionKey()),
      (key: string) => this._isEditorGroupVisible(key, isEditorX2),
      fromVisible,
      toVisible,
    );
    if (next) this._updateLayoutConfig({ group_order: next });
  }

  private _moveGroupByKey(groupKey: string, delta: number): void {
    const isEditorX2 = this._isEditorX2();
    const order = groupOrderListForEditor(this._config, this._layoutSelectionKey());
    const visibleOrder = order.filter((key: string) =>
      this._isEditorGroupVisible(key, isEditorX2),
    );

    const fromVisible = visibleOrder.indexOf(String(groupKey));
    if (fromVisible < 0) return;

    const toVisible = fromVisible + Number(delta);
    if (toVisible < 0 || toVisible >= visibleOrder.length) return;

    const toKey = visibleOrder[toVisible];
    const from = order.indexOf(String(groupKey));
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;

    const next = order.slice();
    const tmp = next[from];
    next[from] = next[to];
    next[to] = tmp;

    this._updateLayoutConfig({ group_order: next });
  }

  private _resetGroupOrder(): void {
    // Reset = "back to built-in defaults", stored as the ABSENCE of keys: the
    // relevant layer is deleted (or, for the base layout, its keys are), so
    // saved YAML shrinks instead of materializing the whole default set.
    const selection = this._layoutSelectionKey();
    let next: RemoteCardConfig;
    if (isDeviceLayoutKey(selection)) {
      next = this._withDeviceModeBlock((block) => {
        const layouts = {
          ...((block.layouts as Record<string, unknown> | undefined) || {}),
        };
        delete layouts[deviceStoredLayerKey(selection)];
        if (Object.keys(layouts).length) {
          block.layouts = layouts;
        } else {
          delete block.layouts;
        }
      });
    } else if (selection !== "default") {
      next = { ...this._config };
      const layouts = { ...(next.layouts || {}) };
      delete layouts[selection];
      if (Number.isFinite(Number(selection))) {
        delete layouts[String(Number(selection))];
      }
      if (Object.keys(layouts).length) {
        next.layouts = layouts;
      } else {
        delete next.layouts;
      }
    } else {
      next = { ...this._config };
      for (const key of LAYOUT_KEYS) {
        delete next[key];
      }
      if (next.layouts && typeof next.layouts === "object") {
        const layouts = { ...next.layouts };
        delete layouts.default;
        if (Object.keys(layouts).length) {
          next.layouts = layouts;
        } else {
          delete next.layouts;
        }
      }
    }
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }

  // ---------- render ----------

  render() {
    if (!this._hass) return nothing;

    const selection = this._layoutSelectionKey();
    const entityId = this._config?.entity;
    const remoteState = entityId && this._hass ? this._hass?.states?.[entityId] : null;
    const activities = remoteState ? editorActivitiesFromState(remoteState) : [];
    // Devices join the same selector (device-mode-plan.md §5.2): x1s
    // integration only, and only while the backend publishes the `devices`
    // attribute (persistent cache enabled).
    // Gating: positive x1s check, the devices attribute present (persistent
    // cache on), and the device_mode.enabled master switch (absent = on).
    const deviceCapable =
      Boolean(remoteState) &&
      this._isX1sIntegrationForEditor() &&
      editorDevicesFromState(remoteState).length > 0;
    const deviceModeEnabled = this._deviceModeEnabled();
    const devices =
      deviceCapable && deviceModeEnabled ? editorDevicesFromState(remoteState) : [];

    // "Initial view" (General Options drawer): current activity (default) or
    // a specific device; only offered while device mode is on.
    const openDevice = openDeviceFromConfig(this._config);
    const initialViewOptions = [
      { value: OPEN_WITH_CURRENT, label: str().editor.openOnCurrentActivity },
      ...devices.map((device: { id: unknown; name: string }) => ({
        value: String(device.id),
        label: device.name,
      })),
    ];
    const longPress = longPressSettings(this._config);
    // The two "Default ... layout" entries are styled as section heads; the
    // sections themselves separate activities from devices, so device names
    // carry no prefix.
    const selectionOptions = [
      {
        value: "default",
        label: str().editor.defaultLayoutOption,
        kind: "default" as const,
      },
      ...activities.map((activity: { id: unknown; name: string }) => ({
        value: String(activity.id),
        label: activity.name,
      })),
      ...(devices.length
        ? [
            {
              value: "device:default",
              label: str().editor.allDevicesOption,
              kind: "default" as const,
            },
            ...devices.map((device: { id: unknown; name: string }) => ({
              value: `device:${device.id}`,
              label: device.name,
            })),
          ]
        : []),
    ];
    if (!selectionOptions.some((option) => option.value === selection)) {
      this._layoutSelection = "default";
    }

    const isEditorX2 = this._isEditorX2();
    const layoutCfg = layoutConfigForSelection(this._config, this._layoutSelectionKey());
    const order = groupOrderListForEditor(this._config, this._layoutSelectionKey());
    const visibleOrder = order.filter((key: string) =>
      this._isEditorGroupVisible(key, isEditorX2),
    );

    // Drag-and-drop reorder via HA's <ha-sortable> (same mechanism as the
    // Control Panel card). HA loads the element lazily, so fall back to the
    // up/down buttons until it is defined and re-render once it arrives.
    const sortableReady = Boolean(customElements.get("ha-sortable"));
    if (!sortableReady && !this._sortableDefinePending) {
      this._sortableDefinePending = true;
      void customElements.whenDefined("ha-sortable").then(() => {
        this._sortableDefinePending = false;
        this.requestUpdate();
      });
    }

    // Scope the form data to its schema: ha-form echoes the whole data
    // object back on value-changed, so anything extra here would get merged
    // into the stored config.
    const entityFormData = {
      entity: this._config.entity || "",
    };

    return html`
      <div style="padding: 12px 0;">
        <ha-form
          .hass=${this._hass}
          .schema=${ENTITY_FORM_SCHEMA}
          .data=${entityFormData}
          .computeLabel=${computeEditorFieldLabel}
          @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown> }>) => {
            ev.stopPropagation();
            this._mergeFormValue(ev.detail.value);
          }}
        ></ha-form>
      </div>
      <div class="sb-general-wrap" style="padding: 0 0 12px 0;">
        ${renderGeneralOptionsSection({
          hass: this._hass,
          expanded: this._generalExpanded,
          onToggleExpanded: () => {
            this._generalExpanded = !this._generalExpanded;
            this.requestUpdate();
          },
          automationAssistEnabled: !!this._config.show_automation_assist,
          onSetAutomationAssist: (enabled) => this._setAutomationAssistEnabled(enabled),
          deviceMode: deviceCapable
            ? {
                enabled: deviceModeEnabled,
                openDevice: openDevice != null ? String(openDevice) : OPEN_WITH_CURRENT,
                options: initialViewOptions,
                onSetEnabled: (enabled) => this._setDeviceModeEnabled(enabled),
                onSetOpenDevice: (value) => this._onInitialViewChanged(value),
              }
            : null,
          longPress: {
            enabled: longPress.enabled,
            selected: longPressSelectedGroups(this._config),
            onSetEnabled: (enabled) => this._setLongPressEnabled(enabled),
            onSetSelected: (selected) => this._setLongPressGroups(selected),
          },
        })}
      </div>
      <div class="sb-styling-wrap" style="padding: 0 0 12px 0;">
        ${renderStylingOptionsSection({
          hass: this._hass,
          config: this._config,
          expanded: this._stylingExpanded,
          onToggleExpanded: () => {
            this._stylingExpanded = !this._stylingExpanded;
            this.requestUpdate();
          },
          onValueChanged: (value) => this._mergeFormValue(value),
        })}
      </div>
      <div class="sb-layout-wrap" style="padding: 0 0 12px 0;">
        ${renderGroupOrderSection({
          hass: this._hass,
          expanded: this._layoutExpanded,
          selection: this._layoutSelectionKey(),
          selectionOptions,
          selectionNote: layoutSelectionNote(this._config, this._layoutSelectionKey()),
          visibleOrder,
          isEditorX2,
          asRows: mfAsRowsForEditor(this._config, this._layoutSelectionKey()),
          visibleRows: mfRowVisibleRowsForEditor(this._config, this._layoutSelectionKey()),
          sortableReady,
          macroEnabled: macrosButtonEnabled(layoutCfg),
          favoritesEnabled: favoritesButtonEnabled(layoutCfg),
          volumeEnabled: volumeGroupEnabled(layoutCfg),
          channelEnabled: channelGroupEnabled(layoutCfg),
          mediaEnabled: mediaGroupEnabled(layoutCfg),
          dvrEnabled: dvrGroupEnabled(layoutCfg),
          isDeviceSelection: isDeviceLayoutKey(this._layoutSelectionKey()),
          commandsEnabled: commandsEnabled(this._config, this._layoutSelectionKey()),
          powerEnabled: powerEnabled(this._config, this._layoutSelectionKey()),
          showDeviceModeSwitch: devices.length > 0,
          deviceModeEnabled: deviceToggleEnabledForEditor(
            this._config,
            this._layoutSelectionKey(),
          ),
          isGroupEnabled: (key) =>
            isGroupEnabled(this._config, this._layoutSelectionKey(), key),
          groupLabel: (key) => groupLabel(key),
          onToggleExpanded: () => {
            this._layoutExpanded = !this._layoutExpanded;
            this.requestUpdate();
          },
          onSelectLayout: (value) => this._onSelectLayout(value),
          onSetMacro: (v) => this._updateLayoutConfig(macroTogglePatch(v)),
          onSetFavorites: (v) => this._updateLayoutConfig(favoritesTogglePatch(v)),
          onSetCommands: (v) => this._updateLayoutConfig(commandsTogglePatch(v)),
          onSetPower: (v) => this._updateLayoutConfig(powerTogglePatch(v)),
          onSetDeviceMode: (v) => this._updateLayoutConfig(deviceTogglePatch(v)),
          onSetVolume: (v) => this._updateLayoutConfig(volumeTogglePatch(v)),
          onSetChannel: (v) => this._updateLayoutConfig(channelTogglePatch(v)),
          onSetMedia: (v) => {
            const patch = groupEnabledPatch("media", v);
            if (patch) this._updateLayoutConfig(patch);
          },
          onSetDvr: (v) => this._updateLayoutConfig(dvrTogglePatch(v)),
          onSetGroupEnabled: (key, v) => {
            const patch = groupEnabledPatch(key, v);
            if (patch) this._updateLayoutConfig(patch);
          },
          onSetMfAsRows: (v) => this._updateLayoutConfig(mfAsRowsPatch(v)),
          onSetMfRowVisibleRows: (v) =>
            this._updateLayoutConfig(mfRowVisibleRowsPatch(v)),
          onMoveGroupByKey: (key, delta) => this._moveGroupByKey(key, delta),
          onMoveGroupByVisibleIndex: (from, to) =>
            this._moveGroupByVisibleIndex(from, to),
          onResetGroupOrder: () => this._resetGroupOrder(),
        })}
      </div>
    `;
  }
}

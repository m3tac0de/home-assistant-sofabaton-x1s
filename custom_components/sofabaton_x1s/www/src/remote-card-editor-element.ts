// Lit config editor for the Sofabaton Virtual Remote card — the ported
// replacement for remote-card-legacy-editor.ts. Layout/config mutations
// delegate to the pure helpers in remote-card-editor-layout.ts; the sections
// render via editor-sections/*.

import { LitElement, html, nothing, unsafeCSS } from "lit";
import {
  DEFAULT_GROUP_ORDER,
  DEFAULT_ROW_VISIBLE_ROWS,
  channelGroupEnabled,
  dvrGroupEnabled,
  favoritesButtonEnabled,
  macrosButtonEnabled,
  mediaGroupEnabled,
  volumeGroupEnabled,
} from "./remote-card-layout";
import {
  applyLayoutConfigPatch,
  channelTogglePatch,
  dvrTogglePatch,
  editorActivitiesFromState,
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
import { setRemoteCardLanguage, str } from "./remote-card-strings";
import { REMOTE_CARD_EDITOR_CSS } from "./remote-card-styles";
import {
  readPreviewActivity,
  writePreviewActivity,
} from "./remote-card-shared";
import type { HassLike, RemoteCardConfig } from "./remote-card-types";
import { renderCommandsEditorSection } from "./editor-sections/commands-editor";
import {
  computeEditorFieldLabel,
  renderStylingOptionsSection,
} from "./editor-sections/styling-options";
import { renderGroupOrderSection } from "./editor-sections/group-order";

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

export class SofabatonRemoteCardEditor extends LitElement {
  static styles = unsafeCSS(REMOTE_CARD_EDITOR_CSS);

  private _hass: HassLike | null = null;
  private _config: RemoteCardConfig = { entity: "" };
  private _configInitialized = false;
  private _previewActivity: string | null = null;
  private _layoutSelection = "default";
  private _stylingExpanded = false;
  private _layoutExpanded = false;
  private _commandsExpanded = false;
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

  private _isEditorX2(): boolean {
    return isX2Hub(
      hubVersionFor(this._hass, this._config?.entity),
      this._isHubIntegrationForEditor(),
    );
  }

  // ---------- HA wiring ----------

  set hass(hass: HassLike) {
    this._hass = hass;
    setRemoteCardLanguage(
      (hass as { locale?: { language?: string }; language?: string })?.locale
        ?.language ??
        (hass as { language?: string })?.language,
    );

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

    // 2. STABILITY CHECK: only fire if something actually changed.
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
    this._config = { ...this._config, show_automation_assist: !!enabled };
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
    const asRows = mfAsRowsForEditor(this._config, this._layoutSelectionKey());
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
    const selection = this._layoutSelectionKey();
    if (selection !== "default") {
      const next = { ...this._config };
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
      this._config = next;
      this._fireChanged();
      this.requestUpdate();
      return;
    }

    // Reset order AND turn all groups back on.
    const enabledDefaults = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_volume: true,
      show_channel: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      show_dvr: true,
      show_macros_button: true,
      show_favorites_button: true,
      mf_as_rows: false,
      mf_row_visible_rows: DEFAULT_ROW_VISIBLE_ROWS,
      group_order: DEFAULT_GROUP_ORDER.slice(),
    };

    const next = { ...this._config };
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...(next.layouts || {}),
        default: { ...defaultLayout, ...enabledDefaults },
      };
    } else {
      Object.assign(next, enabledDefaults);
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
    const activities =
      entityId && this._hass
        ? editorActivitiesFromState(this._hass?.states?.[entityId])
        : [];
    const selectionOptions = [
      { value: "default", label: str().editor.defaultLayoutOption },
      ...activities.map((activity: { id: unknown; name: string }) => ({
        value: String(activity.id),
        label: activity.name,
      })),
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

    const entityFormData = {
      ...this._config,
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      // Maintain the toggle state correctly
      use_background_override:
        this._config.use_background_override ??
        !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255],
      max_width: this._config.max_width ?? 360,
      group_order: this._config.group_order ?? DEFAULT_GROUP_ORDER.slice(),
      show_automation_assist: this._config.show_automation_assist ?? false,
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
          isGroupEnabled: (key) =>
            isGroupEnabled(this._config, this._layoutSelectionKey(), key),
          groupLabel: (key) => groupLabel(key),
          onToggleExpanded: () => {
            this._layoutExpanded = !this._layoutExpanded;
            this.requestUpdate();
          },
          onSelectLayout: (value) => this._onSelectLayout(value),
          onSetMacro: (v) =>
            this._updateLayoutConfig(
              macroTogglePatch(this._config, this._layoutSelectionKey(), v),
            ),
          onSetFavorites: (v) =>
            this._updateLayoutConfig(
              favoritesTogglePatch(this._config, this._layoutSelectionKey(), v),
            ),
          onSetVolume: (v) =>
            this._updateLayoutConfig(
              volumeTogglePatch(this._config, this._layoutSelectionKey(), v),
            ),
          onSetChannel: (v) =>
            this._updateLayoutConfig(
              channelTogglePatch(this._config, this._layoutSelectionKey(), v),
            ),
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
      <div class="sb-commands-wrap">
        ${renderCommandsEditorSection({
          expanded: this._commandsExpanded,
          automationAssistEnabled: !!this._config.show_automation_assist,
          onToggleExpanded: () => {
            this._commandsExpanded = !this._commandsExpanded;
            this.requestUpdate();
          },
          onSetAutomationAssist: (enabled) =>
            this._setAutomationAssistEnabled(enabled),
        })}
      </div>
    `;
  }
}

// Lit card element for the Sofabaton Virtual Remote — the ported replacement
// for the legacy SofabatonRemoteCard. State and actions live in
// RemoteCardStore, the assist/MQTT subsystem in AutomationAssistController;
// sections render the tree while this element keeps the imperative edges the
// legacy card had: per-card theming vars, group radius probing, drawer
// direction measuring, layering z-indexes, and the layout-change crossfade.

import { LitElement, html, nothing, css, unsafeCSS, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import {
  favoritesButtonEnabled,
  macrosButtonEnabled,
  mfAsRows,
  mfRowVisibleRows,
  normalizedGroupOrder,
  keyStyleFromConfig,
  powerButtonEnabled,
  tintedPanelsFromConfig,
} from "./remote-card-layout";
import { ensureHaElements } from "./remote-card-compat";
import {
  remoteCardDirection,
  remoteCardLanguage,
  setRemoteCardLanguage,
  str,
} from "./remote-card-strings";
import { REMOTE_CARD_CSS } from "./remote-card-styles";
import { rgbToCss, automationAssistLabelForKey } from "./remote-card-ui-helpers";
import { runtimeButtonVisibility } from "./remote-card-runtime-display";
import { drawerVisibilityState } from "./remote-card-drawer-display";
import { longPressEnabledForKey } from "./remote-card-long-press";
import {
  DRAWER_DIRECTION_RESET_MS,
  commandsOverlayMaxHeight,
  drawerDesiredHeight,
  drawerDirection,
  holdRepeatIndexOf,
  layeringZIndexes,
} from "./remote-card-gestures";
import { RemoteCardStore } from "./state/remote-card-store";
import { AutomationAssistController } from "./state/automation-assist-controller";
import { EDITOR } from "./remote-card-shared";
import type { HassLike, RemoteCardConfig } from "./remote-card-types";
import { renderActivityRow } from "./sections/activity-row";
import {
  renderAbc,
  renderColors,
  renderDpad,
  renderMedia,
  renderMid,
  renderNavRow,
  type KeyGroupsParams,
  type KeySpec,
} from "./sections/key-groups";
import {
  renderCommandsDrawer,
  renderCommandsItems,
  renderDrawerItems,
  renderFavoritesItems,
  renderInlineDrawerRow,
  renderMacroFavorites,
  renderPowerRow,
  type CommandsFilterParams,
  type MacroFavoritesParams,
  type PowerKeyParams,
} from "./sections/macro-favorites";
import { renderAssistModal, renderAssistRow } from "./sections/assist";

/** "#rgb" / "#rrggbb" -> "r,g,b" (HA's hex2rgb for --rgb-* companions). */
function hexToRgbTriplet(value: string): string | null {
  const hex = value.trim().slice(1);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(",");
}

export class SofabatonRemoteCard extends LitElement {
  static styles = [
    unsafeCSS(REMOTE_CARD_CSS),
    // The legacy wrappers were plain divs; custom-element hosts default to
    // inline, so pin the block display the layout expects.
    css`
      sb-key-button {
        display: block;
      }
    `,
  ];

  private readonly _store: RemoteCardStore;
  private readonly _assist: AutomationAssistController;

  private _haElementsReady = false;
  private _editMode = false;

  // Imperative-edge state (mirrors the legacy fields)
  private _drawerUp = false;
  private _drawerResetTimer: ReturnType<typeof setTimeout> | null = null;
  private _drawerContentResetTimer: ReturnType<typeof setTimeout> | null = null;
  private _closingDrawer: "macros" | "favorites" | "commands" | null = null;
  private _drawerMeasureSignature: string | null = null;
  private _drawerMeasurePending = false;
  private _appliedThemeVars: string[] = [];
  private _appliedThemeKey: string | null = null;
  private _lastGroupRadius: string | null = null;
  private _appliedSizingKey: string | null = null;
  private _lastLayeringKey: string | null = null;
  private _lastLayeringTargets: [HTMLElement | null, HTMLElement | null] = [null, null];
  private _layoutSignatureCache: string | null = null;
  private _layoutOverlayEl: HTMLElement | null = null;
  private _lastLayoutSignature: string | null = null;
  private _keymapLoading = false;

  // Activity select dedupe (legacy handleActivitySelect closure state)
  private _lastSelectedActivityValue: string | null = null;
  private _lastSelectedActivityAt = 0;

  private _onOutsidePointerDown: ((e: Event) => void) | null = null;
  private _onResize: (() => void) | null = null;
  private _onPreviewActivity: ((event: Event) => void) | null = null;

  private readonly _cardRef: Ref<HTMLElement> = createRef();
  private readonly _wrapRef: Ref<HTMLElement> = createRef();
  private readonly _layoutContainerRef: Ref<HTMLElement> = createRef();
  private readonly _activityRowRef: Ref<HTMLElement> = createRef();
  private readonly _loadIndicatorRef: Ref<HTMLElement> = createRef();
  private readonly _mfContainerRef: Ref<HTMLElement> = createRef();
  private readonly _macrosOverlayRef: Ref<HTMLElement> = createRef();
  private readonly _favoritesOverlayRef: Ref<HTMLElement> = createRef();
  private readonly _commandsOverlayRef: Ref<HTMLElement> = createRef();
  private readonly _macroFavoritesRowRef: Ref<HTMLElement> = createRef();

  constructor() {
    super();
    this._store = new RemoteCardStore(
      () => this.requestUpdate(),
      {
        fireEvent: (type, detail) => this._fireEvent(type, detail),
        onHubQueueDrained: () => {
          this._assist.syncMqtt();
          this.requestUpdate();
        },
        onCommandPulseChange: () => this._syncLoadIndicator(),
      },
    );
    this._assist = new AutomationAssistController({
      getHass: () => this._store.hass,
      assistEnabled: () => this._store.automationAssistEnabled(),
      entityId: () => String(this._store.config?.entity ?? ""),
      isEditMode: () => this._editMode,
      isX2: () => this._store.isX2(),
      isHubIntegration: () => this._store.isHubIntegration(),
      hubMacAttribute: () =>
        (this._store.remoteState()?.attributes as Record<string, unknown> | undefined)
          ?.hub_mac,
      hubQueueIdle: () => this._store.hubQueueIdle(),
      requestHubBasicData: () => this._store.hubRequestBasicData(),
      activities: () => this._store.activities(),
      activityNameForId: (id) => this._store.activityNameForId(id),
      currentActivityId: () => this._store.currentActivityId(),
      currentActivityLabel: () => this._store.currentActivityLabel(),
      resolveCommandDeviceId: (commandId, deviceId) =>
        this._store.resolveCommandDeviceId(commandId, deviceId),
      callService: (domain, service, data) =>
        this._store.callService(domain, service, data),
      onChange: () => this.requestUpdate(),
    });

    void ensureHaElements().then(() => {
      this._haElementsReady = true;
      this.requestUpdate();
    });
  }

  // ---------- HA card API ----------

  setConfig(config: RemoteCardConfig): void {
    this._store.setConfig(config);
    this._assist.resetActivityBaseline();
    this._drawerUp = false;
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._closingDrawer = null;
    this._drawerMeasureSignature = null;
    this._drawerMeasurePending = false;
  }

  set hass(hass: HassLike) {
    const language =
      (hass as { locale?: { language?: string }; language?: string })?.locale
        ?.language ?? (hass as { language?: string })?.language;
    const languageChanged = setRemoteCardLanguage(language);
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    this._store.setHass(hass);
    if (languageChanged) this.requestUpdate();
  }

  get hass(): HassLike | null {
    return this._store.hass;
  }

  set editMode(value: boolean) {
    this._editMode = !!value;
    this._store.setEditMode(this._editMode);
    if (this._editMode && this._assist.active) {
      this._assist.setActive(false);
    }
  }

  get editMode(): boolean {
    return this._editMode;
  }

  getCardSize(): number {
    return 12;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR);
  }

  static getStubConfig(): RemoteCardConfig {
    // Minimal on purpose: absent keys mean their defaults everywhere, so the
    // YAML a fresh card starts with is just the entity. setConfig() layers
    // the runtime defaults (normalizeRemoteCardConfig) either way.
    return { entity: "" };
  }

  // ---------- lifecycle ----------

  connectedCallback(): void {
    super.connectedCallback();
    this._store.connected();
    this._installOutsideCloseHandler();

    if (!this._onResize) {
      this._onResize = () => {
        if (!this._store.activeDrawer) return;
        this._updateDrawerDirection();
        this._syncLayering();
      };
    }
    window.addEventListener("resize", this._onResize, { passive: true });

    if (!this._onPreviewActivity) {
      this._onPreviewActivity = (event: Event) => {
        const detail = (event as CustomEvent<{ entity?: string; previewActivity?: string }>)
          ?.detail || {};
        const entity = this._store.config?.entity;
        if (detail.entity && entity && detail.entity !== entity) return;
        this._store.setPreviewActivity(detail.previewActivity ?? "");
        if (this._editMode) {
          this.requestUpdate();
        }
      };
    }
    window.addEventListener("sofabaton-preview-activity", this._onPreviewActivity);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._removeOutsideCloseHandler();
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
    if (this._onPreviewActivity) {
      window.removeEventListener("sofabaton-preview-activity", this._onPreviewActivity);
    }
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._store.disconnected();
    this._assist.disconnected();
  }

  private _fireEvent(type: string, detail: unknown = {}): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  // ---------- outside close (drawers + activity menu) ----------

  private _installOutsideCloseHandler(): void {
    if (this._onOutsidePointerDown) return;

    this._onOutsidePointerDown = (e: Event) => {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];

      if (this._store.activeDrawer) {
        const clickedInOverlay =
          (this._macrosOverlayRef.value && path.includes(this._macrosOverlayRef.value)) ||
          (this._favoritesOverlayRef.value && path.includes(this._favoritesOverlayRef.value)) ||
          (this._commandsOverlayRef.value && path.includes(this._commandsOverlayRef.value));
        const clickedInToggleRow =
          this._macroFavoritesRowRef.value && path.includes(this._macroFavoritesRowRef.value);

        if (!(clickedInOverlay || clickedInToggleRow)) {
          this._setActiveDrawer(null);
        }
      }

      if (this._store.activityMenuOpen) {
        const clickedInActivity =
          this._activityRowRef.value && path.includes(this._activityRowRef.value);
        if (!clickedInActivity) {
          this._store.activityMenuOpen = false;
          this._syncLayering();
        }
      }
    };

    document.addEventListener("pointerdown", this._onOutsidePointerDown, true);
  }

  private _removeOutsideCloseHandler(): void {
    if (!this._onOutsidePointerDown) return;
    document.removeEventListener("pointerdown", this._onOutsidePointerDown, true);
    this._onOutsidePointerDown = null;
  }

  // ---------- drawers ----------

  private _toggleDrawer(type: "macros" | "favorites" | "commands"): void {
    this._setActiveDrawer(this._store.activeDrawer === type ? null : type);
  }

  private _retainClosingDrawer(type: "macros" | "favorites" | "commands"): void {
    this._closingDrawer = type;
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._drawerContentResetTimer = setTimeout(() => {
      if (this._closingDrawer !== type) return;
      this._closingDrawer = null;
      this._drawerContentResetTimer = null;
      this.requestUpdate();
    }, DRAWER_DIRECTION_RESET_MS);
  }

  private _setActiveDrawer(type: "macros" | "favorites" | "commands" | null): void {
    const previous = this._store.activeDrawer;
    if (previous === type) return;

    if (previous) this._retainClosingDrawer(previous);
    if (type && this._closingDrawer === type) {
      this._closingDrawer = null;
      if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
      this._drawerContentResetTimer = null;
    }

    this._store.activeDrawer = type;
    this._drawerMeasurePending = Boolean(type);
    if (!type) this._scheduleDrawerDirectionReset();
    this._syncLayering();
    this.requestUpdate();
  }

  private _updateDrawerDirection(): void {
    if (!this._store.activeDrawer) return;
    const row = this._macroFavoritesRowRef.value;
    const isCommands = this._store.activeDrawer === "commands";
    const overlay = isCommands
      ? this._commandsOverlayRef.value
      : this._store.activeDrawer === "favorites"
        ? this._favoritesOverlayRef.value
        : this._macrosOverlayRef.value;
    if (!row || !overlay) return;

    const rowRect = row.getBoundingClientRect();
    const cardRect =
      this._cardRef.value &&
      typeof this._cardRef.value.getBoundingClientRect === "function"
        ? this._cardRef.value.getBoundingClientRect()
        : null;

    const nextUp =
      drawerDirection({
        // The commands drawer ignores the 350px cap and takes what the
        // viewport gives it (device-mode-plan.md §4.2).
        desired: drawerDesiredHeight(
          overlay.scrollHeight || 0,
          isCommands ? window.innerHeight : undefined,
        ),
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        cardTop: cardRect?.top ?? null,
        cardBottom: cardRect?.bottom ?? null,
        viewportHeight: window.innerHeight,
      }) === "up";

    if (isCommands) {
      overlay.style.maxHeight = `${commandsOverlayMaxHeight({
        up: nextUp,
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        cardTop: cardRect?.top ?? null,
        cardBottom: cardRect?.bottom ?? null,
        viewportHeight: window.innerHeight,
      })}px`;
    }

    if (nextUp !== this._drawerUp) {
      this._drawerUp = nextUp;
      this.requestUpdate();
    }
  }

  private _scheduleDrawerDirectionReset(): void {
    // Keep the current direction class during the close transition so the
    // drawer collapses in the same direction it opened.
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
    this._drawerResetTimer = setTimeout(() => {
      if (this._store.activeDrawer) return;
      if (this._drawerUp) {
        this._drawerUp = false;
        this.requestUpdate();
      }
    }, DRAWER_DIRECTION_RESET_MS);
  }

  private _syncLayering(): void {
    const activityRow = this._activityRowRef.value;
    let mfContainer = this._mfContainerRef.value;
    if (!activityRow || !mfContainer) return;

    // Device mode wraps the container in .commands-row (the power key's
    // row grid), which is the positioned ancestor and stacking context;
    // a z-index on the now-static container inside it is inert, so the
    // raise must land on the wrapper or an open drawer stays underneath
    // the selector whenever its group is ordered above the activity row.
    mfContainer =
      (mfContainer.closest(".commands-row") as HTMLElement | null) ?? mfContainer;

    const key = `${this._store.activityMenuOpen ? 1 : 0}:${this._store.activeDrawer || ""}`;
    const targets: [HTMLElement | null, HTMLElement | null] = [activityRow, mfContainer];
    if (
      this._lastLayeringKey === key &&
      this._lastLayeringTargets[0] === targets[0] &&
      this._lastLayeringTargets[1] === targets[1]
    ) {
      return;
    }

    const z = layeringZIndexes(
      Boolean(this._store.activityMenuOpen),
      Boolean(this._store.activeDrawer),
    );
    activityRow.style.zIndex = z.activity;
    mfContainer.style.zIndex = z.drawer;
    this._lastLayeringKey = key;
    this._lastLayeringTargets = targets;
  }

  // ---------- activity select ----------

  private _handleActivitySelect(ev: Event): void {
    if (this._editMode) return;
    const select = ev.target as HTMLElement & { value?: string };
    const value =
      (ev as CustomEvent<{ value?: string }>)?.detail?.value ?? select?.value;
    if (value == null) return;

    const now = Date.now();
    if (
      String(value) === this._lastSelectedActivityValue &&
      now - this._lastSelectedActivityAt < 250
    ) {
      return;
    }
    this._lastSelectedActivityValue = String(value);
    this._lastSelectedActivityAt = now;
    this._fireEvent("haptic", "light");
    Promise.resolve(this._store.setActivity(value)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[sofabaton-virtual-remote] Failed to set activity:", err);
    });
  }

  /**
   * Single stable entry point for the activity/device dropdown. The select's
   * listeners are wired ONCE per node (listenersRef), so the closure they
   * capture must not bake in the render-time mode — this delegate reads the
   * mode at event time instead.
   */
  private _handleSelect(ev: Event): void {
    // Mirror deriveRuntimeState's fallback: when the capability drops away
    // the card renders the activity dropdown even while _mode is "device".
    const deviceMode =
      this._store.mode() === "device" && this._store.deviceModeAvailable();
    if (deviceMode) {
      this._handleDeviceSelect(ev);
    } else {
      this._handleActivitySelect(ev);
    }
  }

  private _handleDeviceSelect(ev: Event): void {
    if (this._editMode) return;
    const select = ev.target as HTMLElement & { value?: string };
    const value =
      (ev as CustomEvent<{ value?: string }>)?.detail?.value ?? select?.value;
    if (value == null) return;

    // Same 250ms dedupe as the activity select (shared closure state is fine:
    // only one dropdown is rendered at a time).
    const now = Date.now();
    if (
      String(value) === this._lastSelectedActivityValue &&
      now - this._lastSelectedActivityAt < 250
    ) {
      return;
    }
    this._lastSelectedActivityValue = String(value);
    this._lastSelectedActivityAt = now;
    this._fireEvent("haptic", "light");
    const deviceId = String(value) === "" ? null : Number(value);
    this._store.setDevice(Number.isFinite(deviceId as number) ? deviceId : null);
  }

  private _handleModeToggle(): void {
    if (this._editMode) return;
    this._fireEvent("haptic", "light");
    this._setActiveDrawer(null);
    this._store.toggleMode();
  }

  private _syncLoadIndicator(): void {
    this._loadIndicatorRef.value?.classList.toggle(
      "is-loading",
      this._store.isLoadingActive() || this._keymapLoading,
    );
  }

  // ---------- theming (imperative, on the ha-card like the legacy) ----------

  private _applyLocalTheme(themeName: string | undefined): boolean {
    const root = this._cardRef.value;
    const hass = this._store.hass as
      | (HassLike & { themes?: { themes?: Record<string, Record<string, unknown>>; darkMode?: boolean } })
      | null;
    if (!root || !hass) return false;

    const bgOverrideCss = rgbToCss(this._store.config?.background_override);
    const themeDef = themeName ? hass.themes?.themes?.[themeName] : null;
    const themeMode = hass.themes?.darkMode ? "dark" : "light";
    const appliedKey = `${themeName || ""}||${bgOverrideCss}||${themeMode}||${JSON.stringify(themeDef ?? null)}`;
    if (this._appliedThemeKey === appliedKey) return false;

    for (const cssVar of this._appliedThemeVars) {
      root.style.removeProperty(cssVar);
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;
    // The group radius var was cleared with the rest; re-probe it below.
    this._lastGroupRadius = null;

    let vars: Record<string, unknown> | null = null;
    if (themeName) {
      const def = themeDef;
      if (def && typeof def === "object") {
        vars = def;

        // Support themes with modes (light/dark)
        const defWithModes = def as { modes?: Record<string, Record<string, unknown>> };
        if (defWithModes.modes && typeof defWithModes.modes === "object") {
          const mode = hass.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...(defWithModes.modes?.[mode] || {}) };
          delete (vars as { modes?: unknown }).modes;
        }

        for (const [k, v] of Object.entries(vars)) {
          if (v == null || (typeof v !== "string" && typeof v !== "number")) continue;
          const cssVar = k.startsWith("--") ? k : `--${k}`;
          root.style.setProperty(cssVar, String(v));
          this._appliedThemeVars.push(cssVar);
        }
        // HA parity (applyThemesOnElement/processTheme): every hex value
        // also gets an --rgb-<key> companion unless the theme ships one, so
        // rgba(var(--rgb-primary-color), …) rules follow the card theme
        // instead of the page theme.
        for (const [k, v] of Object.entries(vars)) {
          if (typeof v !== "string" || !v.startsWith("#")) continue;
          const key = k.startsWith("--") ? k.slice(2) : k;
          if (vars[`rgb-${key}`] !== undefined || vars[`--rgb-${key}`] !== undefined) continue;
          const triplet = hexToRgbTriplet(v);
          if (!triplet) continue;
          const cssVar = `--rgb-${key}`;
          root.style.setProperty(cssVar, triplet);
          this._appliedThemeVars.push(cssVar);
        }
      }
    }

    const themeBg =
      vars?.["ha-card-background"] ??
      vars?.["card-background-color"] ??
      vars?.["ha-card-background-color"] ??
      vars?.["primary-background-color"] ??
      null;

    const finalBg = bgOverrideCss || themeBg;

    // A background override can contradict the page theme's text colour
    // (black card on a light dashboard): the overlay/tint base derived from
    // --primary-text-color would land on the wrong side. The override is a
    // known RGB triple, so pick the base from its luminance; key tints,
    // hover/press overlays and the tinted key style read --sb-overlay-base
    // first (see remote-card-styles.ts).
    const override = this._store.config?.background_override;
    if (bgOverrideCss && Array.isArray(override) && override.length === 3) {
      const [r, g, b] = override.map((v) => Number(v) / 255);
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      root.style.setProperty("--sb-overlay-base", luminance < 0.4 ? "#ffffff" : "#000000");
      this._appliedThemeVars.push("--sb-overlay-base");
    }

    if (finalBg) {
      root.style.setProperty("--ha-card-background", String(finalBg));
      root.style.setProperty("--card-background-color", String(finalBg));
      root.style.setProperty("--ha-card-background-color", String(finalBg));
      root.style.setProperty("background", String(finalBg));
      root.style.setProperty("background-color", String(finalBg));
      this._appliedThemeVars.push(
        "--ha-card-background",
        "--card-background-color",
        "--ha-card-background-color",
        "background",
        "background-color",
      );
    } else {
      root.style.removeProperty("background");
      root.style.removeProperty("background-color");
    }
    return true;
  }

  private _updateGroupRadius(): void {
    const root = this._cardRef.value;
    if (!root) return;

    const cs = getComputedStyle(root);
    const candidates = [
      "--ha-card-border-radius",
      "--ha-control-border-radius",
      "--mdc-shape-medium",
      "--mdc-shape-small",
      "--mdc-shape-large",
    ];

    let radius = "";
    for (const name of candidates) {
      const v = (cs.getPropertyValue(name) || "").trim();
      if (v) {
        radius = v;
        break;
      }
    }
    if (!radius) radius = "18px";
    if (this._lastGroupRadius === radius) return;
    this._lastGroupRadius = radius;

    root.style.setProperty("--sb-group-radius", radius);
    if (!this._appliedThemeVars.includes("--sb-group-radius")) {
      this._appliedThemeVars.push("--sb-group-radius");
    }
  }

  private _applyHostSizing(): void {
    const mw = this._store.config?.max_width;
    const shrink = this._store.config?.shrink;
    const sizingKey = `${typeof mw}:${String(mw ?? "")}||${typeof shrink}:${String(shrink ?? "")}`;
    if (this._appliedSizingKey === sizingKey) return;
    this._appliedSizingKey = sizingKey;

    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }

    const shrinkNum =
      typeof shrink === "number" ? shrink : typeof shrink === "string" ? Number(shrink) : 0;
    if (!Number.isFinite(shrinkNum) || shrinkNum <= 0) {
      this.style.removeProperty("--remote-zoom");
    } else {
      // Map 0..100 -> zoom 1..0 (clamped). Keep a small floor to avoid 0.
      const z = Math.max(0.1, Math.min(1, 1 - shrinkNum / 100));
      this.style.setProperty("--remote-zoom", String(z));
    }
  }

  // ---------- layout-change crossfade ----------

  private _prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  private _clearLayoutOverlay(): void {
    if (this._layoutOverlayEl) {
      this._layoutOverlayEl.remove();
      this._layoutOverlayEl = null;
    }
  }

  private _maybeAnimateLayoutChange(nextSignature: string): void {
    const layoutContainer = this._layoutContainerRef.value;
    const wrap = this._wrapRef.value;
    if (!layoutContainer || !wrap) return;
    if (this._layoutSignatureCache == null) {
      this._layoutSignatureCache = nextSignature;
      return;
    }
    if (this._layoutSignatureCache === nextSignature) return;
    this._layoutSignatureCache = nextSignature;
    if (this._prefersReducedMotion()) {
      this._clearLayoutOverlay();
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const layoutRect = layoutContainer.getBoundingClientRect();
    if (!wrapRect.width || !layoutRect.width) return;

    this._clearLayoutOverlay();
    const overlay = document.createElement("div");
    overlay.className = "layout-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.top = `${layoutRect.top - wrapRect.top}px`;
    overlay.style.left = `${layoutRect.left - wrapRect.left}px`;
    overlay.style.width = `${layoutRect.width}px`;
    overlay.style.height = `${layoutRect.height}px`;
    overlay.appendChild(layoutContainer.cloneNode(true));
    wrap.appendChild(overlay);
    this._layoutOverlayEl = overlay;

    const cleanup = () => {
      if (this._layoutOverlayEl === overlay) {
        overlay.remove();
        this._layoutOverlayEl = null;
      }
    };
    overlay.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target === overlay) cleanup();
      },
      { once: true },
    );
    requestAnimationFrame(() => {
      overlay.classList.add("layout-overlay--fade");
    });
    setTimeout(cleanup, 320);
  }

  // ---------- render ----------

  render() {
    if (!this._haElementsReady || !this._store.config || !this._store.hass) {
      return nothing;
    }

    const store = this._store;
    const derived = store.deriveRuntimeState();
    const layoutConfig = derived.layoutConfig as Record<string, unknown>;
    this._lastLayoutSignature = derived.layoutSignature;

    const deviceMode = derived.mode === "device";
    this._keymapLoading = Boolean(derived.keymapLoading);

    // ----- side effects the legacy _update ran on every pass -----
    // Assist always observes the REAL activity state: in device mode the
    // derived label is a device name and must not fake activity changes.
    this._assist.observeActivityState({
      currentLabel: deviceMode
        ? this._store.currentActivityLabel()
        : derived.currentLabel,
      activityId: derived.activityId != null ? Number(derived.activityId) : null,
      unavailable: derived.isUnavailable,
    });
    if (!store.automationAssistEnabled() && this._assist.active) {
      this._assist.setActive(false);
    }
    this._assist.syncMqtt();

    const asRows = mfAsRows(layoutConfig);
    const macrosVisible = !deviceMode && macrosButtonEnabled(layoutConfig);
    const favoritesVisible = !deviceMode && favoritesButtonEnabled(layoutConfig);
    const macrosRowOn = asRows && macrosVisible;
    const favoritesRowOn = asRows && favoritesVisible;
    const showMacrosBtn = !asRows && macrosVisible;
    const showFavoritesBtn = !asRows && favoritesVisible;

    // Device mode: the macro/favorites construct becomes the Commands drawer.
    const commandsVisible = deviceMode && derived.showCommandsButton;
    const showCommandsDrawer = commandsVisible && !asRows;
    const commandsAsRow = commandsVisible && asRows;

    // Match the legacy disable expression exactly in activity mode (activity
    // loading, not the command pulse). Device mode disables only while the
    // entity is unavailable or no device is selected — device sends are safe
    // regardless of the hub's activity state.
    const disableAll = deviceMode
      ? derived.isUnavailable || (!this._editMode && derived.deviceId == null)
      : derived.isUnavailable ||
        store.activityLoadingActive() ||
        (!this._editMode && derived.isPoweredOff);

    // Mode switches close any drawer belonging to the other mode.
    if (
      (deviceMode &&
        (store.activeDrawer === "macros" || store.activeDrawer === "favorites")) ||
      (!deviceMode && store.activeDrawer === "commands")
    ) {
      this._retainClosingDrawer(store.activeDrawer!);
      this._scheduleDrawerDirectionReset();
      store.activeDrawer = null;
    }

    let drawerDisplayState: ReturnType<typeof drawerVisibilityState> | null = null;
    if (!deviceMode) {
      drawerDisplayState = drawerVisibilityState({
        activeDrawer: store.activeDrawer,
        showMacrosButton: showMacrosBtn,
        showFavoritesButton: showFavoritesBtn,
        editMode: this._editMode,
        macros: derived.macros,
        favorites: derived.favorites,
        customFavorites: derived.customFavorites,
        disableAllButtons: disableAll,
      });

      // Drawer forced closed by visibility changes
      if (drawerDisplayState.closedByVisibility) {
        if (store.activeDrawer) this._retainClosingDrawer(store.activeDrawer);
        this._scheduleDrawerDirectionReset();
      }
      store.activeDrawer = drawerDisplayState.nextActiveDrawer as
        | "macros"
        | "favorites"
        | null;
    } else if (store.activeDrawer === "commands" && !showCommandsDrawer) {
      this._retainClosingDrawer("commands");
      this._scheduleDrawerDirectionReset();
      store.activeDrawer = null;
    }

    const activeDrawerCount =
      store.activeDrawer === "macros"
        ? derived.macros.length
        : store.activeDrawer === "favorites"
          ? derived.favorites.length + derived.customFavorites.length
          : store.activeDrawer === "commands"
            ? derived.commands.length
            : 0;
    const drawerMeasureSignature = `${store.activeDrawer || ""}:${activeDrawerCount}:${derived.commandFilter}:${derived.layoutSignature}`;
    if (this._drawerMeasureSignature !== drawerMeasureSignature) {
      this._drawerMeasureSignature = drawerMeasureSignature;
      this._drawerMeasurePending = Boolean(store.activeDrawer);
    }

    const keyParams: KeyGroupsParams = {
      isX2: derived.isX2,
      buttonVisibility: runtimeButtonVisibility({
        isX2: derived.isX2,
        showVolume: derived.showVolume,
        showChannel: derived.showChannel,
        showMedia: derived.showMedia,
        showDvr: derived.showDvr,
      }),
      disableAll,
      editMode: this._editMode,
      isEnabled: (id) => store.isEnabled(id),
      onKeyPress: (spec, ev) => this._onKeyPress(spec, ev),
      holdRepeatForKey: (key) => longPressEnabledForKey(store.config, key),
      showVolume: derived.showVolume,
      showChannel: derived.showChannel,
      showMedia: derived.showMedia,
      showDvr: derived.showDvr,
    };

    const commandsFilter: CommandsFilterParams = {
      value: derived.commandFilter,
      placeholder: str().card.filterCommands,
      onInput: (value) => store.setCommandFilter(value),
    };

    const mfParams: MacroFavoritesParams = {
      visible: Boolean(drawerDisplayState?.showMF),
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      single: drawerDisplayState?.visibleCount === 1,
      macrosDisabled: Boolean(drawerDisplayState?.macrosDisabled),
      favoritesDisabled: Boolean(drawerDisplayState?.favoritesDisabled),
      activeDrawer: store.activeDrawer === "commands" ? null : store.activeDrawer,
      drawerUp: this._drawerUp,
      macros: derived.macros,
      favorites: derived.favorites,
      customFavorites: derived.customFavorites,
      currentActivityId: store.currentActivityId(),
      renderMacrosContent:
        store.activeDrawer === "macros" || this._closingDrawer === "macros",
      renderFavoritesContent:
        store.activeDrawer === "favorites" || this._closingDrawer === "favorites",
      containerRef: this._mfContainerRef,
      rowRef: this._macroFavoritesRowRef,
      macrosOverlayRef: this._macrosOverlayRef,
      favoritesOverlayRef: this._favoritesOverlayRef,
      onToggleMacros: () => this._toggleDrawer("macros"),
      onToggleFavorites: () => this._toggleDrawer("favorites"),
      onDrawerItem: ({ model, itemType, rawItem }) => {
        this._assist.recordClick({
          label: model.label,
          commandId: model.commandId,
          deviceId: model.deviceId,
          commandType: model.commandType,
          icon: model.icon,
        });
        store.triggerCommandPulse();
        void store.sendDrawerItem(itemType, model.commandId, model.deviceId, rawItem);
      },
      onCustomFavorite: ({ model, rawFavorite }) => {
        if (this._assist.active) {
          this._assist.setStatus(str().assist.notCaptured);
        }
        if (model.action) {
          void store.runLovelaceAction(model.action, rawFavorite);
          return;
        }
        if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) {
          return;
        }
        store.triggerCommandPulse();
        void store.sendCustomFavoriteCommand(model.commandId, model.deviceId);
      },
    };

    // Device-mode power key (plan §8.1): rendered only when the selected
    // device has power configured (backend gate, fail-closed) and the
    // layout has not hidden it. It docks on the commands strip: beside
    // the drawer bar, beside the filter in commands-as-rows mode, and
    // alone right-docked when the Commands strip is hidden. The edit
    // preview drops the data gate: previewing a device layout has no
    // real device selected, and the Power switch should visualize like
    // every other layout toggle (the key is inert in edit mode anyway).
    const powerVisible =
      deviceMode &&
      powerButtonEnabled(layoutConfig) &&
      (this._editMode || store.devicePowerConfigured());
    const powerParams: PowerKeyParams = {
      busy: store.powerBusy,
      disabled: disableAll,
      label: str().card.powerButton,
      onToggle: () => {
        void store.toggleDevicePower();
      },
    };

    const commandsParams = {
      visible: showCommandsDrawer,
      open: store.activeDrawer === "commands",
      disabled: disableAll,
      drawerUp: this._drawerUp,
      commands: derived.commands,
      renderContent:
        store.activeDrawer === "commands" || this._closingDrawer === "commands",
      emptyText: str().card.noCommands,
      tabLabel: str().card.commandsTab,
      filter: commandsFilter,
      onToggle: () => this._toggleDrawer("commands"),
      onCommand: (command: { command_id: number; name: string }) =>
        this._onCommandItem(command),
      containerRef: this._mfContainerRef,
      rowRef: this._macroFavoritesRowRef,
      overlayRef: this._commandsOverlayRef,
    };

    const sharedRows = mfRowVisibleRows(layoutConfig);
    // Volume/channel resolve show_mid as their legacy fallback themselves;
    // the mid row shows whenever either half is visible.
    const midEnabled = derived.showVolume || derived.showChannel;
    const mediaEnabled = derived.isX2
      ? derived.showMedia || derived.showDvr
      : derived.showMedia;

    // Order from the resolved layout itself — in device mode the layout came
    // through the device chain, which store.groupOrderList (activity-keyed)
    // must not re-resolve.
    const order = normalizedGroupOrder(layoutConfig.group_order);
    const keyStyle = keyStyleFromConfig(store.config);
    const tintedPanels = tintedPanelsFromConfig(store.config);
    const wrapClass = [
      "wrap",
      ...(keyStyle === "flat" ? [] : [`wrap--keys-${keyStyle}`]),
      ...(tintedPanels ? ["wrap--panels"] : []),
    ].join(" ");
    const groupTemplates: Record<string, () => unknown> = {
      activity: () =>
        Boolean(layoutConfig.show_activity) ? renderActivityRow({
          hass: store.hass,
          visible: true,
          unavailable: derived.isUnavailable,
          options: deviceMode
            ? (derived.deviceSelectState?.options ?? [])
            : (derived.selectState?.options ?? []),
          selectLabel: deviceMode
            ? str().card.deviceSelectLabel
            : str().card.activitySelectLabel,
          resolvedValue: deviceMode
            ? (derived.deviceSelectState?.resolvedValue ?? "")
            : (derived.selectState?.resolvedValue ?? ""),
          disabled: deviceMode
            ? Boolean(derived.deviceSelectState?.disabled)
            : Boolean(derived.selectState?.disabled),
          loading: store.isLoadingActive() || Boolean(derived.keymapLoading),
          modeToggle: derived.deviceModeAvailable
            ? {
                // Same icon pair as the control panel's Hub-tab subtabs.
                icon: deviceMode ? "mdi:audio-video" : "mdi:play-circle-outline",
                ariaLabel: deviceMode
                  ? str().card.switchToActivityMode
                  : str().card.switchToDeviceMode,
                // Inert in edit mode (the editor's layout selection drives
                // the previewed mode); rendered so the editor's Device mode
                // switch is visualized in the preview.
                onToggle: () => this._handleModeToggle(),
              }
            : null,
          menuOpen: Boolean(store.activityMenuOpen),
          onSelect: (ev) => this._handleSelect(ev),
          onMenuOpened: () => {
            store.activityMenuOpen = true;
            this._syncLayering();
            this.requestUpdate(); // row class mirrors the open menu
          },
          onMenuClosed: () => {
            store.activityMenuOpen = false;
            this._syncLayering();
            this.requestUpdate();
          },
          rowRef: this._activityRowRef,
          loadIndicatorRef: this._loadIndicatorRef,
        }) : nothing,
      macro_favorites: () =>
        deviceMode
          ? showCommandsDrawer
            ? renderCommandsDrawer({
                ...commandsParams,
                power: powerVisible ? powerParams : null,
              })
            : powerVisible && !commandsAsRow
              ? renderPowerRow(powerParams)
              : nothing
          : drawerDisplayState?.showMF
            ? renderMacroFavorites(mfParams)
            : nothing,
      macros_row: () =>
        deviceMode
          ? commandsAsRow
            ? renderInlineDrawerRow({
                kind: "commands",
                visible: true,
                visibleRows: sharedRows,
                items: renderCommandsItems({
                  commands: derived.commands,
                  onCommand: (command) => this._onCommandItem(command),
                }),
                itemCount: derived.commands.length,
                emptyText: str().card.noCommands,
                filter: commandsFilter,
                power: powerVisible ? powerParams : null,
              })
            : nothing
          : macrosRowOn
            ? renderInlineDrawerRow({
                kind: "macros",
                visible: true,
                visibleRows: sharedRows,
                items: renderDrawerItems(mfParams, derived.macros, "macros"),
                itemCount: derived.macros.length,
                emptyText: str().card.noMacros,
              })
            : nothing,
      favorites_row: () =>
        !deviceMode && favoritesRowOn ? renderInlineDrawerRow({
          kind: "favorites",
          visible: true,
          visibleRows: sharedRows,
          items: renderFavoritesItems(mfParams),
          itemCount: derived.customFavorites.length + derived.favorites.length,
          emptyText: str().card.noFavorites,
        }) : nothing,
      dpad: () => renderDpad(keyParams, Boolean(layoutConfig.show_dpad)),
      nav: () => renderNavRow(keyParams, Boolean(layoutConfig.show_nav)),
      mid: () => renderMid(keyParams, midEnabled),
      media: () => renderMedia(keyParams, mediaEnabled),
      colors: () => renderColors(keyParams, Boolean(layoutConfig.show_colors)),
      abc: () => renderAbc(keyParams, Boolean(layoutConfig.show_abc) && derived.isX2),
    };

    const warnText = derived.isUnavailable
      ? str().card.remoteUnavailable
      : derived.noActivitiesMessage;
    const assistEnabled = store.automationAssistEnabled();

    return html`
      <ha-card ${ref(this._cardRef)}>
        ${assistEnabled
          ? renderAssistModal({ visible: true, controller: this._assist })
          : nothing}
        <div class=${wrapClass} ${ref(this._wrapRef)}>
          ${assistEnabled
            ? renderAssistRow({ visible: true, controller: this._assist })
            : nothing}
          <div class="layout-container" ${ref(this._layoutContainerRef)}>
            ${repeat(
              order.filter((key) => key in groupTemplates),
              (key) => key,
              (key) => groupTemplates[key](),
            )}
            <div class="warn" style=${warnText ? "display: block;" : "display: none;"}>
              ${warnText}
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _onKeyPress(spec: KeySpec, ev?: Event): void {
    const deviceMode = this._store.mode() === "device";
    const targetDeviceId = deviceMode
      ? this._store.currentDeviceId()
      : (this._store.commandTarget(spec.id)?.activity_id ??
        this._store.currentActivityId());
    // A hold is one press for Key capture: record it on the first repeat
    // (the release tap of a hold that repeated is suppressed) and let the
    // later repeats only send, or every tick would create another
    // persistent notification.
    if (holdRepeatIndexOf(ev) <= 1) {
      this._assist.recordClick({
        label: automationAssistLabelForKey(spec.key, spec.color ? spec.key : spec.label),
        commandId: spec.cmd,
        deviceId: targetDeviceId ?? null,
        commandType: "assigned",
        icon: spec.color ? null : spec.icon || null,
        deviceMode,
        deviceName: deviceMode
          ? this._store.deviceNameForId(targetDeviceId)
          : null,
      });
    }
    this._store.triggerCommandPulse();
    void this._store.sendCommand(spec.cmd, targetDeviceId);
  }

  private _onCommandItem(command: { command_id: number; name: string }): void {
    const deviceId = this._store.currentDeviceId();
    if (deviceId == null) return;
    this._assist.recordClick({
      label: command.name,
      commandId: command.command_id,
      deviceId,
      commandType: "favorite",
      icon: null,
      deviceMode: true,
      deviceName: this._store.deviceNameForId(deviceId),
    });
    this._store.triggerCommandPulse();
    void this._store.sendCommand(command.command_id, deviceId);
  }

  protected updated(_changed: PropertyValues): void {
    const themeChanged = this._applyLocalTheme(String(this._store.config?.theme ?? ""));
    if (themeChanged || this._lastGroupRadius == null) this._updateGroupRadius();
    this._applyHostSizing();
    if (this._lastLayoutSignature != null) {
      this._maybeAnimateLayoutChange(this._lastLayoutSignature);
    }
    if (this._drawerMeasurePending) {
      this._drawerMeasurePending = false;
      this._updateDrawerDirection();
    }
    this._syncLayering();
    this._syncLoadIndicator();
  }
}

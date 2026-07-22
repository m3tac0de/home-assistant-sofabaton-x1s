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
  DEFAULT_GROUP_ORDER,
  favoritesButtonEnabled,
  macrosButtonEnabled,
  mfAsRows,
  mfRowVisibleRows,
} from "./remote-card-layout";
import { ensureHaElements } from "./remote-card-compat";
import { setRemoteCardLanguage, str } from "./remote-card-strings";
import { REMOTE_CARD_CSS } from "./remote-card-styles";
import { rgbToCss, automationAssistLabelForKey } from "./remote-card-ui-helpers";
import { runtimeButtonVisibility } from "./remote-card-runtime-display";
import { drawerVisibilityState } from "./remote-card-drawer-display";
import {
  DRAWER_DIRECTION_RESET_MS,
  drawerDesiredHeight,
  drawerDirection,
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
  renderDrawerItems,
  renderFavoritesItems,
  renderInlineDrawerRow,
  renderMacroFavorites,
  type MacroFavoritesParams,
} from "./sections/macro-favorites";
import { renderAssistModal, renderAssistRow } from "./sections/assist";

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
  private _closingDrawer: "macros" | "favorites" | null = null;
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
    setRemoteCardLanguage(
      (hass as { locale?: { language?: string }; language?: string })?.locale
        ?.language ?? (hass as { language?: string })?.language,
    );
    this._store.setHass(hass);
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
    return {
      entity: "",
      theme: "",
      background_override: null,
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_volume: true,
      show_channel: true,
      show_media: true,
      show_dvr: true,
      show_colors: true,
      show_abc: true,
      show_automation_assist: false,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
      shrink: 0,
      group_order: DEFAULT_GROUP_ORDER.slice() as unknown as string[],
    };
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
          (this._favoritesOverlayRef.value && path.includes(this._favoritesOverlayRef.value));
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

  private _toggleDrawer(type: "macros" | "favorites"): void {
    this._setActiveDrawer(this._store.activeDrawer === type ? null : type);
  }

  private _retainClosingDrawer(type: "macros" | "favorites"): void {
    this._closingDrawer = type;
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._drawerContentResetTimer = setTimeout(() => {
      if (this._closingDrawer !== type) return;
      this._closingDrawer = null;
      this._drawerContentResetTimer = null;
      this.requestUpdate();
    }, DRAWER_DIRECTION_RESET_MS);
  }

  private _setActiveDrawer(type: "macros" | "favorites" | null): void {
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
    const overlay =
      this._store.activeDrawer === "favorites"
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
        desired: drawerDesiredHeight(overlay.scrollHeight || 0),
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        cardTop: cardRect?.top ?? null,
        cardBottom: cardRect?.bottom ?? null,
        viewportHeight: window.innerHeight,
      }) === "up";

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
    const mfContainer = this._mfContainerRef.value;
    if (!activityRow || !mfContainer) return;

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

  private _syncLoadIndicator(): void {
    this._loadIndicatorRef.value?.classList.toggle(
      "is-loading",
      this._store.isLoadingActive(),
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
      }
    }

    const themeBg =
      vars?.["ha-card-background"] ??
      vars?.["card-background-color"] ??
      vars?.["ha-card-background-color"] ??
      vars?.["primary-background-color"] ??
      null;

    const finalBg = bgOverrideCss || themeBg;

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

    // ----- side effects the legacy _update ran on every pass -----
    this._assist.observeActivityState({
      currentLabel: derived.currentLabel,
      activityId: derived.activityId != null ? Number(derived.activityId) : null,
      unavailable: derived.isUnavailable,
    });
    if (!store.automationAssistEnabled() && this._assist.active) {
      this._assist.setActive(false);
    }
    this._assist.syncMqtt();

    const asRows = mfAsRows(layoutConfig);
    const macrosVisible = macrosButtonEnabled(layoutConfig);
    const favoritesVisible = favoritesButtonEnabled(layoutConfig);
    const macrosRowOn = asRows && macrosVisible;
    const favoritesRowOn = asRows && favoritesVisible;
    const showMacrosBtn = !asRows && macrosVisible;
    const showFavoritesBtn = !asRows && favoritesVisible;

    // Match the legacy disable expression exactly (activity loading, not the
    // command pulse).
    const disableAll =
      derived.isUnavailable ||
      store.activityLoadingActive() ||
      (!this._editMode && derived.isPoweredOff);

    const drawerDisplayState = drawerVisibilityState({
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

    const activeDrawerCount =
      store.activeDrawer === "macros"
        ? derived.macros.length
        : store.activeDrawer === "favorites"
          ? derived.favorites.length + derived.customFavorites.length
          : 0;
    const drawerMeasureSignature = `${store.activeDrawer || ""}:${activeDrawerCount}:${derived.layoutSignature}`;
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
      onKeyPress: (spec) => this._onKeyPress(spec),
      showVolume: derived.showVolume,
      showChannel: derived.showChannel,
      showMedia: derived.showMedia,
      showDvr: derived.showDvr,
    };

    const mfParams: MacroFavoritesParams = {
      visible: drawerDisplayState.showMF,
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      single: drawerDisplayState.visibleCount === 1,
      macrosDisabled: drawerDisplayState.macrosDisabled,
      favoritesDisabled: drawerDisplayState.favoritesDisabled,
      activeDrawer: store.activeDrawer,
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

    const sharedRows = mfRowVisibleRows(layoutConfig);
    const midEnabled =
      ((layoutConfig.show_mid as boolean | undefined) ?? true) &&
      (derived.showVolume || derived.showChannel);
    const mediaEnabled = derived.isX2
      ? derived.showMedia || derived.showDvr
      : derived.showMedia;

    const order = store.groupOrderList(derived.activityId);
    const groupTemplates: Record<string, () => unknown> = {
      activity: () =>
        Boolean(layoutConfig.show_activity) ? renderActivityRow({
          hass: store.hass,
          visible: true,
          unavailable: derived.isUnavailable,
          options: derived.selectState?.options ?? [],
          resolvedValue: derived.selectState?.resolvedValue ?? "",
          disabled: Boolean(derived.selectState?.disabled),
          loading: store.isLoadingActive(),
          onSelect: (ev) => this._handleActivitySelect(ev),
          onMenuOpened: () => {
            store.activityMenuOpen = true;
            this._syncLayering();
          },
          onMenuClosed: () => {
            store.activityMenuOpen = false;
            this._syncLayering();
          },
          rowRef: this._activityRowRef,
          loadIndicatorRef: this._loadIndicatorRef,
        }) : nothing,
      macro_favorites: () =>
        drawerDisplayState.showMF ? renderMacroFavorites(mfParams) : nothing,
      macros_row: () =>
        macrosRowOn ? renderInlineDrawerRow({
          kind: "macros",
          visible: true,
          visibleRows: sharedRows,
          items: renderDrawerItems(mfParams, derived.macros, "macros"),
          itemCount: derived.macros.length,
          emptyText: str().card.noMacros,
        }) : nothing,
      favorites_row: () =>
        favoritesRowOn ? renderInlineDrawerRow({
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
        <div class="wrap" ${ref(this._wrapRef)}>
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

  private _onKeyPress(spec: KeySpec): void {
    this._assist.recordClick({
      label: automationAssistLabelForKey(spec.key, spec.color ? spec.key : spec.label),
      commandId: spec.cmd,
      deviceId: this._store.commandTarget(spec.id)?.activity_id ?? null,
      commandType: "assigned",
      icon: spec.color ? null : spec.icon || null,
    });
    this._store.triggerCommandPulse();
    void this._store.sendCommand(
      spec.cmd,
      this._store.commandTarget(spec.id)?.activity_id ??
        this._store.currentActivityId(),
    );
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

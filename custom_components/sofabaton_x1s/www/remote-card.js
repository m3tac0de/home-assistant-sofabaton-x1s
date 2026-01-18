const TYPE = "sofabaton-virtual-remote";
const EDITOR = "sofabaton-virtual-remote-editor";

// Numeric IDs (for enabled_buttons)
const ID = {
  UP: 174, DOWN: 178, LEFT: 175, RIGHT: 177, OK: 176,
  BACK: 179, HOME: 180, MENU: 181,
  VOL_UP: 182, VOL_DOWN: 185, MUTE: 184,
  CH_UP: 183, CH_DOWN: 186,

  GUIDE: 157,      // X2
  DVR: 155,        // X2
  PLAY: 156,       // X2
  EXIT: 154,       // X2
  A: 153, B: 152, C: 151, // X2

  REW: 187, PAUSE: 188, FWD: 189,
  RED: 190, GREEN: 191, YELLOW: 192, BLUE: 193,
};

const POWERED_OFF_LABELS = new Set(["powered off", "powered_off", "off"]);

class SofabatonRemoteCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Select a Sofabaton remote entity");
    }

    // Defaults first, then user config overwrites
    this._config = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      theme: "",
      background_override: null,
      show_macro_favorites: true,
      max_width: 360,
      ...config,
    };

    this._activeDrawer = null;

    this._initPromise = this._initPromise || this._ensureHaElements();
    this._initPromise.then(() => {
      this._render();
      this._update();
    });
  }

  set hass(hass) {
    this._hass = hass;
    (this._initPromise || Promise.resolve()).then(() => this._update());
  }
  // ---------- State helpers ----------
  _remoteState() {
    return this._hass?.states?.[this._config?.entity];
  }

  _hubVersion() {
    return String(this._remoteState()?.attributes?.hub_version || "").toUpperCase();
  }

  _isX2() {
    return this._hubVersion().includes("X2");
  }

  _enabledButtons() {
    const remote = this._remoteState();
    const assignedKeys = remote?.attributes?.assigned_keys;
    const currentActivity = this._currentActivityId();

    if (assignedKeys && typeof assignedKeys === "object") {
      const raw =
        assignedKeys[String(currentActivity)]
        ?? assignedKeys[currentActivity]
        ?? [];
      const parsed = Array.isArray(raw)
        ? raw
            .map((entry) => ({
              command: Number(entry),
              activity_id: currentActivity,
            }))
            .filter((entry) => Number.isFinite(entry.command))
        : [];
      this._enabledButtonsInvalid = Array.isArray(raw) && parsed.length === 0;
      return parsed;
    }

    return [];
  }

  _isEnabled(id) {
    const enabled = this._enabledButtons();
    if (this._enabledButtonsInvalid) return true;
    if (!enabled.length) return true; // fail-open
    return enabled.some((entry) => entry.command === Number(id));
  }

  _commandTarget(id) {
    const enabled = this._enabledButtons();
    const match = enabled.find((entry) => entry.command === Number(id));
    return match || null;
  }

  _currentActivityId() {
    const remote = this._remoteState();
    const activityId = remote?.attributes?.current_activity_id;
    if (activityId != null) return Number(activityId);
    return null;
  }

  _activities() {
    const list = this._remoteState()?.attributes?.activities;
    if (!Array.isArray(list)) return [];
    return list
      .map((activity) => ({
        id: Number(activity?.id),
        name: String(activity?.name ?? ""),
        state: String(activity?.state ?? ""),
      }))
      .filter((activity) => Number.isFinite(activity.id) && activity.name);
  }

  _currentActivityLabel() {
    const remoteActivity = this._remoteState()?.attributes?.current_activity;
    if (remoteActivity) return String(remoteActivity);
    const activityId = this._currentActivityId();
    const match = this._activities().find((activity) => activity.id === activityId);
    return match?.name || "";
  }

  _isPoweredOffLabel(state) {
    const s = String(state || "").trim().toLowerCase();
    return POWERED_OFF_LABELS.has(s);
  }

  _isLoadingActive() {
    const isActivityLoading = Boolean(this._activityLoadActive);
    const isPulse = this._commandPulseUntil && Date.now() < this._commandPulseUntil;
    return isActivityLoading || isPulse;
  }

  _updateLoadIndicator() {
    if (!this._loadIndicator) return;
    const active = this._isLoadingActive();
    if (this._loadIndicatorActive === active) return;
    this._loadIndicatorActive = active;
    this._loadIndicator.classList.toggle("is-loading", active);
  }

  _triggerCommandPulse() {
    this._commandPulseUntil = Date.now() + 1000;
    this._updateLoadIndicator();
    clearTimeout(this._commandPulseTimeout);
    this._commandPulseTimeout = setTimeout(() => {
      this._updateLoadIndicator();
    }, 1000);
  }

  _startActivityLoading(target) {
    this._activityLoadTarget = String(target ?? "");
    this._activityLoadActive = true;
    this._activityLoadStartedAt = Date.now();
    this._updateLoadIndicator();
    clearTimeout(this._activityLoadTimeout);
    this._activityLoadTimeout = setTimeout(() => {
      if (this._activityLoadActive) {
        this._activityLoadActive = false;
        this._updateLoadIndicator();
      }
    }, 60000);
  }

  _stopActivityLoading() {
    if (!this._activityLoadActive) return;
    this._activityLoadActive = false;
    this._activityLoadTarget = null;
    this._activityLoadStartedAt = null;
    clearTimeout(this._activityLoadTimeout);
    this._updateLoadIndicator();
  }

  // ---------- Services ----------
  async _callService(domain, service, data) {
    await this._hass.callService(domain, service, data);
  }

  async _sendCommand(commandId, deviceId = null) {
  if (!this._hass || !this._config?.entity) return;

  // If deviceId isn't provided, fall back to enabled_buttons override (activity_id) or current_activity_id
  const resolvedDevice =
    deviceId != null
      ? Number(deviceId)
      : (this._commandTarget(commandId)?.activity_id ?? this._currentActivityId());

  if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) return;

  await this._callService("remote", "send_command", {
    entity_id: this._config.entity,
    command: Number(commandId),
    device: Number(resolvedDevice),
  });
}

  async _setActivity(option) {
    if (option == null || option === "") return;
    const selected = String(option);
    const current = this._currentActivityLabel();
    if (selected === current) return;

    this._pendingActivity = selected;
    this._pendingActivityAt = Date.now();
    this._startActivityLoading(selected);

    if (this._isPoweredOffLabel(selected)) {
      await this._callService("remote", "turn_off", {
        entity_id: this._config.entity,
      });
      return;
    }

    await this._callService("remote", "turn_on", {
      entity_id: this._config.entity,
      activity: selected,
    });
  }

  // ---------- Theme/background helpers (per-card) ----------
  _rgbToCss(rgb) {
    // color_rgb selector returns [r,g,b] in HA
    if (Array.isArray(rgb) && rgb.length >= 3) {
      const r = Number(rgb[0]);
      const g = Number(rgb[1]);
      const b = Number(rgb[2]);
      if ([r, g, b].some((n) => Number.isNaN(n))) return "";
      return `rgb(${r}, ${g}, ${b})`;
    }
    // (Sometimes) can be { r, g, b }
    if (rgb && typeof rgb === "object" && rgb.r != null && rgb.g != null && rgb.b != null) {
      const r = Number(rgb.r);
      const g = Number(rgb.g);
      const b = Number(rgb.b);
      if ([r, g, b].some((n) => Number.isNaN(n))) return "";
      return `rgb(${r}, ${g}, ${b})`;
    }
    return "";
  }

  _applyLocalTheme(themeName) {
    if (!this._root || !this._hass) return;

    const bgOverrideCss = this._rgbToCss(this._config?.background_override);
    const appliedKey = `${themeName || ""}||${bgOverrideCss}`;

    if (this._appliedThemeKey === appliedKey) return;

    // Remove previously applied vars/properties
    if (this._appliedThemeVars?.length) {
      for (const cssVar of this._appliedThemeVars) {
        this._root.style.removeProperty(cssVar);
      }
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;

    // Apply selected theme vars as CSS vars on the card only
    let vars = null;
    if (themeName) {
      const themes = this._hass.themes?.themes;
      const def = themes?.[themeName];
      if (def && typeof def === "object") {
        vars = def;

        // Support themes with modes (light/dark)
        if (def.modes && typeof def.modes === "object") {
          const mode = this._hass.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...(def.modes?.[mode] || {}) };
          delete vars.modes;
        }

        for (const [k, v] of Object.entries(vars)) {
          if (v == null || (typeof v !== "string" && typeof v !== "number")) continue;
          const cssVar = k.startsWith("--") ? k : `--${k}`;
          this._root.style.setProperty(cssVar, String(v));
          this._appliedThemeVars.push(cssVar);
        }
      }
    }

    // Determine background and force it to stick
    const themeBg =
      vars?.["ha-card-background"] ??
      vars?.["card-background-color"] ??
      vars?.["ha-card-background-color"] ??
      vars?.["primary-background-color"] ??
      null;

    const finalBg = bgOverrideCss || themeBg;

    if (finalBg) {
      this._root.style.setProperty("--ha-card-background", String(finalBg));
      this._root.style.setProperty("--card-background-color", String(finalBg));
      this._root.style.setProperty("--ha-card-background-color", String(finalBg));

      // Force actual background so it doesn't "revert"
      this._root.style.setProperty("background", String(finalBg));
      this._root.style.setProperty("background-color", String(finalBg));

      this._appliedThemeVars.push(
        "--ha-card-background",
        "--card-background-color",
        "--ha-card-background-color",
        "background",
        "background-color"
      );
    } else {
      // EXPLICIT REVERT: If no override or theme background exists, 
      // ensure the forced properties are cleared.
      this._root.style.removeProperty("background");
      this._root.style.removeProperty("background-color");
    }
  }

  _updateGroupRadius() {
    if (!this._root) return;

    const cs = getComputedStyle(this._root);
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
      if (v) { radius = v; break; }
    }
    if (!radius) radius = "18px";

    this._root.style.setProperty("--sb-group-radius", radius);

    // Track for cleanup on theme change
    this._appliedThemeVars = this._appliedThemeVars || [];
    if (!this._appliedThemeVars.includes("--sb-group-radius")) {
      this._appliedThemeVars.push("--sb-group-radius");
    }
  }

  // ---------- UI helpers ----------
  _setVisible(el, on) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }
  
  _installOutsideCloseHandler() {
    if (this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = true;

    this._onOutsidePointerDown = (e) => {
      // Nothing open -> nothing to do
      if (!this._activeDrawer) return;

      // Use composedPath so it works through shadow DOM + HA components
      const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
      

      const clickedInOverlay =
        path.includes(this._macrosOverlayEl) || path.includes(this._favoritesOverlayEl);

      // Also exempt the toggle row/buttons so clicking Macros/Favorites still toggles normally
      const clickedInToggleRow =
        path.includes(this._macroFavoritesRow) ||
        path.includes(this._macrosButtonWrap) ||
        path.includes(this._favoritesButtonWrap);

      if (clickedInOverlay || clickedInToggleRow ) return;

      // Clicked "somewhere else" -> close
      this._activeDrawer = null;
      this._applyDrawerVisuals();
    };

    // Capture phase so we catch taps even if inner components stop propagation
    document.addEventListener("pointerdown", this._onOutsidePointerDown, true);
  }

  _removeOutsideCloseHandler() {
    if (!this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = false;
    document.removeEventListener("pointerdown", this._onOutsidePointerDown, true);
    this._onOutsidePointerDown = null;
  }

  disconnectedCallback() {
    this._removeOutsideCloseHandler();
  }

  _toggleDrawer(type) {
    this._activeDrawer = (this._activeDrawer === type) ? null : type;
      this._applyDrawerVisuals();
  }

	_applyDrawerVisuals() {
    if (!this._macrosOverlayEl || !this._favoritesOverlayEl) return;

    const isMacro = this._activeDrawer === 'macros';
    const isFav = this._activeDrawer === 'favorites';

    this._macrosOverlayEl.classList.toggle('open', isMacro);
    this._favoritesOverlayEl.classList.toggle('open', isFav);

    this._macrosButtonWrap.classList.toggle('active-tab', isMacro); 
    this._favoritesButtonWrap.classList.toggle('active-tab', isFav);

    const anyOpen = isMacro || isFav;
    this._macroFavoritesRow.style.borderBottomLeftRadius = anyOpen ? "0" : "var(--sb-group-radius)";
    this._macroFavoritesRow.style.borderBottomRightRadius = anyOpen ? "0" : "var(--sb-group-radius)";
    this._macroFavoritesRow.style.transition = "border-radius 0.2s ease";
  }


  _mkHuiButton({ key, label, icon, id, cmd, extraClass = "", size = "normal" }) {
    const wrap = document.createElement("div");
    wrap.className = `key key--${size} ${extraClass}`.trim();
    wrap.addEventListener("click", () => {
      if (!wrap.classList.contains("disabled")) {
        this._triggerCommandPulse();
        this._sendCommand(cmd, (this._commandTarget(id)?.activity_id ?? this._currentActivityId()));
      }
    });

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: Boolean(label),
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: this._x2OnlyIds.has(id),
    });

    return wrap;
  }

  _mkColorKey({ key, id, cmd, color }) {
    const wrap = document.createElement("div");
    wrap.className = "key key--color";
    wrap.style.setProperty("--sb-color", color);
    wrap.addEventListener("click", () => {
      if (!wrap.classList.contains("disabled")) {
        this._triggerCommandPulse();
        this._sendCommand(cmd, (this._commandTarget(id)?.activity_id ?? this._currentActivityId()));
      }
    });

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    const bar = document.createElement("div");
    bar.className = "colorBar";
    wrap.appendChild(bar);

    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: false,
    });

    return wrap;
  }

    _mkActionButton({ label, icon, extraClass = "", onClick = null }) {
    const wrap = document.createElement("div");
    wrap.className = `macroFavoritesButton ${extraClass}`.trim();
    
      if (onClick) {
        wrap.addEventListener("click", (e) => {
            if (!wrap.classList.contains("disabled")) {
                onClick(e);
            }
        });
    }

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: true,
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    return { wrap, btn };
  }

    _mkDrawerButton(item, type) {

    const label = item.name || "Unknown";
    const command_id = Number(item?.command_id ?? item?.id);
    const fallbackDeviceId = this._currentActivityId();
    const device_id = Number(
      item?.device_id ?? item?.device ?? fallbackDeviceId
    );
    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;    btn.classList.add('drawer-btn');

    btn.setConfig({
      type: "button",
      show_name: true,
      show_icon: !!item.icon,
      name: label,
      icon: item.icon,
      
      card_mod: {
        style: `ha-card { height: 50px !important; font-size: 13px !important; }`
      },
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });
    
    // Manually handle click if tap_action config isn't enough (e.g. for custom pulse animation)
    btn.addEventListener("click", () => {
  if (!Number.isFinite(command_id) || !Number.isFinite(device_id)) return;
  this._triggerCommandPulse();
  this._sendCommand(command_id, device_id);

});

return btn;
  }

  async _ensureHaElements() {
    // These must exist before we call setConfig() on them
    await Promise.all([
      customElements.whenDefined("hui-button-card"),
      customElements.whenDefined("ha-select"),
      customElements.whenDefined("mwc-list-item").catch(() => {}), // optional
    ]);
  }

  // ---------- Render ----------
  _render() {
    if (this._root) return;

    this._keys = [];
    this._x2OnlyIds = new Set([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);

    const card = document.createElement("ha-card");
    this._root = card;

    const style = document.createElement("style");
    style.textContent = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;

        display: block;
      }

      ha-card {
        width: 100%;
        max-width: var(--remote-max-width);
        margin-left: auto;
        margin-right: auto;
      }

      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      ha-select { width: 100%; }

      .activityRow { 
        display: grid; 
        grid-template-columns: 1fr; 
        position: relative;
        z-index: 3;
      }

 	  .loadIndicator {
	    height: 4px;
	    width: 100%;
	    border-radius: 2px;
	    opacity: 0;
	    /* Use a transparent base with a bright highlight "shimmering" over it */
	    background: var(--primary-color, #03a9f4);
	    background-image: linear-gradient(
  		  90deg, 
		  transparent, 
		  rgba(255, 255, 255, 0.4), 
		  transparent
	    );
	    background-size: 200% 100%;
	    background-repeat: no-repeat;
	    transition: opacity 0.3s ease-in-out;
	    pointer-events: none;
	  }

	  .loadIndicator.is-loading {
	    opacity: 1; /* Increased from 0.45 for better visibility */
	    animation: sb-shimmer 1.5s infinite linear;
	  }

	  @keyframes sb-shimmer {
	    0% {
		  background-position: -200% 0;
	    }
	    100% {
		  background-position: 200% 0;
	    }
	  }

			.remote { 
        position: relative;
        z-index: 0; /* Base layer */
        display: grid; 
        gap: 12px; 
      }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

			.macroFavoritesGrid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important; 
        width: 100% !important;
      }
			.macroFavoritesButton {
        cursor: pointer;
        padding: 4px 0;
        display: block !important;
        transition: background 0.2s ease;
        --ha-card-box-shadow: none;
      }
      
      .macroFavoritesButton.active-tab hui-button-card {
         --primary-text-color: var(--primary-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
      .macroFavoritesButton hui-button-card {
        height: 22px;
        display: block;
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
      }

      /* Ensure taps go to the wrapper that has the click handler */
      .macroFavoritesButton > hui-button-card {
        pointer-events: none;
        -webkit-tap-highlight-color: transparent;
      }

			.macroFavorites {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
        overflow: hidden; 
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        position: relative;
        z-index: 4;
      }

			.mf-overlay {
        position: absolute;
        top: 100%; 
        left: 0;
        right: 0;
        z-index: 1; /* Lowered: Sits behind the buttons, above the remote body */
        
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
        
        max-height: 350px;
        overflow-y: auto;
        padding: 12px;
        margin-top: -1px; /* Overlaps the bottom border of the button row for a seamless look */
      }

			.mf-overlay.open {
        transform: scaleY(1);
        opacity: 1;
        pointer-events: auto;
      }

      .mf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

			.mf-container:has(.mf-overlay.open) .macroFavorites {
					border-bottom-left-radius: 0;
					border-bottom-right-radius: 0;
					transition: border-radius 0.2s ease;
			}

      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
      }

      .macroFavoritesButton hui-button-card {
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        --ha-card-border-color: transparent;
        --ha-card-background: transparent;
        --ha-card-border-radius: 0;
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          ". up ."
          "left ok right"
          ". down .";
        gap: 10px;
        align-items: center;
        justify-items: stretch;
      }
      .dpad .area-up { grid-area: up; }
      .dpad .area-left { grid-area: left; }
      .dpad .area-ok { grid-area: ok; }
      .dpad .area-right { grid-area: right; }
      .dpad .area-down { grid-area: down; }

      /* Back / Home / Menu row */
      .row3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      /* Mid: VOL rocker | Guide+Mute | CH rocker */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .col { display: grid; gap: 10px; align-content: start; }

      /* Center column alignment fix (X1: center mute; X2: guide top, mute bottom) */
      .midCenter {
        display: flex;
        flex-direction: column;
        gap: 10px;
        justify-content: center;
      }
      .midCenter.x2 {
        justify-content: space-between;
      }

      /* Media: X1 is 1 row; X2 is 2 rows */
      .media {
        padding: 12px;
        display: grid;
        gap: 10px;
        align-items: stretch;
      }
      .media.x1 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas: "rew pause fwd";
      }
      .media.x2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          "rew play fwd"
          "dvr pause exit";
      }
      .media .area-rew   { grid-area: rew; }
      .media .area-play  { grid-area: play; }
      .media .area-fwd   { grid-area: fwd; }
      .media .area-dvr   { grid-area: dvr; }
      .media .area-pause { grid-area: pause; }
      .media .area-exit  { grid-area: exit; }

      /* Colors + ABC blocks */
      .colors, .abc {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .colorsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key { width: 100%; position: relative; }
      .key.disabled,
      .macroFavoritesButton.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key { min-width: 0; position: relative; width: 100%; }
.key hui-button-card { min-width: 0; }

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
}

/* Fill wrapper */
.key:not(.key--color) hui-button-card {
  display: block;
  width: 100%;
  height: 100% !important;
}

/* Re-introduce relative sizing (scales with card width) */
.key--small  { transform: scale(0.82); transform-origin: center; }
.key--normal { transform: scale(0.92); transform-origin: center; }
.key--big    { transform: scale(1.00); transform-origin: center; }
.okKey       { transform: scale(1.06); transform-origin: center; }

/* Keep color keys as strips (not square) */
.key--color {
  aspect-ratio: auto;
  transform: none;
}
.key--color hui-button-card {
  height: 18px !important;
  width: 100%;
  display: block;
}

/* Color keys: overlay a pill/strip on top of the hui-button-card */

      .key--color hui-button-card { height: 18px; display:block; }
      .key--color .colorBar {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--sb-color);
        pointer-events: none;
      }

      .warn {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 10;
        font-size: 12px;
        opacity: .9;
        border-left: 3px solid var(--warning-color, orange);
        padding-left: 10px;
      }
    `;

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    // Activity selector (full width)
    this._activityRow = document.createElement("div");
    this._activityRow.className = "activityRow";

    this._activitySelect = document.createElement("ha-select");
    this._activitySelect.label = "Activity";

    const handleActivitySelect = (ev) => {
      if (this._suppressActivityChange) return;
      const value = ev?.detail?.value ?? ev?.target?.value ?? this._activitySelect.value;
      if (value != null) {
        Promise.resolve(this._setActivity(value)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sofabaton-hello-card] Failed to set activity:", err);
        });
      }
    };

    // ha-select has emitted both "selected" and "change" across versions.
    this._activitySelect.addEventListener("selected", handleActivitySelect);
    this._activitySelect.addEventListener("change", handleActivitySelect);

    this._activityRow.appendChild(this._activitySelect);
    this._loadIndicator = document.createElement("div");
    this._loadIndicator.className = "loadIndicator";
    this._activityRow.appendChild(this._loadIndicator);

    wrap.appendChild(this._activityRow);

    // Macro/Favorite quick actions
        const mfContainer = document.createElement("div");
    mfContainer.className = "mf-container";

    

    this._mfContainer = mfContainer;this._macroFavoritesRow = document.createElement("div");
    this._macroFavoritesRow.className = "macroFavorites";

    const macroFavoritesGrid = document.createElement("div");
    macroFavoritesGrid.className = "macroFavoritesGrid";

    const macrosButton = this._mkActionButton({
      label: "Macros >",
      onClick: () => this._toggleDrawer('macros')
    });
    this._macrosButtonWrap = macrosButton.wrap;
    this._macrosButton = macrosButton.btn;
    macroFavoritesGrid.appendChild(this._macrosButtonWrap);

    const favoritesButton = this._mkActionButton({
      label: "Favorites >",
      onClick: () => this._toggleDrawer('favorites')
    });
    this._favoritesButtonWrap = favoritesButton.wrap;
    this._favoritesButton = favoritesButton.btn;
    macroFavoritesGrid.appendChild(this._favoritesButtonWrap);

    this._macroFavoritesRow.appendChild(macroFavoritesGrid);
    mfContainer.appendChild(this._macroFavoritesRow);

		// Macros Overlay
    this._macrosOverlayEl = document.createElement("div");
    this._macrosOverlayEl.className = "mf-overlay mf-overlay--macros";
    this._macrosOverlayGrid = document.createElement("div");
    this._macrosOverlayGrid.className = "mf-grid";
    this._macrosOverlayEl.appendChild(this._macrosOverlayGrid);
    mfContainer.appendChild(this._macrosOverlayEl);

    // Favorites Overlay
    this._favoritesOverlayEl = document.createElement("div");
    this._favoritesOverlayEl.className = "mf-overlay mf-overlay--favorites";
    this._favoritesOverlayGrid = document.createElement("div");
    this._favoritesOverlayGrid.className = "mf-grid";
    this._favoritesOverlayEl.appendChild(this._favoritesOverlayGrid);
    mfContainer.appendChild(this._favoritesOverlayEl);
    
    wrap.appendChild(mfContainer);

    this._installOutsideCloseHandler();

    // Remote body
    const remote = document.createElement("div");
    remote.className = "remote";

    // D-pad
    this._dpadEl = document.createElement("div");
    this._dpadEl.className = "dpad";
    this._dpadEl.appendChild(this._mkHuiButton({ key: "up", label: "", icon: "mdi:chevron-up", id: ID.UP, cmd: ID.UP, extraClass: "area-up" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "left", label: "", icon: "mdi:chevron-left", id: ID.LEFT, cmd: ID.LEFT, extraClass: "area-left" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "ok", label: "OK", icon: "", id: ID.OK, cmd: ID.OK, extraClass: "area-ok okKey", size: "big" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "right", label: "", icon: "mdi:chevron-right", id: ID.RIGHT, cmd: ID.RIGHT, extraClass: "area-right" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "down", label: "", icon: "mdi:chevron-down", id: ID.DOWN, cmd: ID.DOWN, extraClass: "area-down" }));
    remote.appendChild(this._dpadEl);

    // Back / Home / Menu
    this._navRowEl = document.createElement("div");
    this._navRowEl.className = "row3";
    this._navRowEl.appendChild(this._mkHuiButton({ key: "back", label: "", icon: "mdi:arrow-u-left-top", id: ID.BACK, cmd: ID.BACK }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "home", label: "", icon: "mdi:home", id: ID.HOME, cmd: ID.HOME }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "menu", label: "", icon: "mdi:menu", id: ID.MENU, cmd: ID.MENU }));
    remote.appendChild(this._navRowEl);

    // Mid section: VOL | Guide+Mute | CH
    this._midEl = document.createElement("div");
    this._midEl.className = "mid";

    const volCol = document.createElement("div");
    volCol.className = "col";
    volCol.appendChild(this._mkHuiButton({ key: "volup", label: "", icon: "mdi:volume-plus", id: ID.VOL_UP, cmd: ID.VOL_UP }));
    volCol.appendChild(this._mkHuiButton({ key: "voldn", label: "", icon: "mdi:volume-minus", id: ID.VOL_DOWN, cmd: ID.VOL_DOWN }));
    this._midEl.appendChild(volCol);

    const centerCol = document.createElement("div");
    centerCol.className = "col midCenter";
    this._midCenterCol = centerCol;
    centerCol.appendChild(this._mkHuiButton({ key: "guide", label: "Guide", icon: "", id: ID.GUIDE, cmd: ID.GUIDE }));
    centerCol.appendChild(this._mkHuiButton({ key: "mute", label: "", icon: "mdi:volume-mute", id: ID.MUTE, cmd: ID.MUTE }));
    this._midEl.appendChild(centerCol);

    const chCol = document.createElement("div");
    chCol.className = "col";
    chCol.appendChild(this._mkHuiButton({ key: "chup", label: "", icon: "mdi:chevron-up", id: ID.CH_UP, cmd: ID.CH_UP }));
    chCol.appendChild(this._mkHuiButton({ key: "chdn", label: "", icon: "mdi:chevron-down", id: ID.CH_DOWN, cmd: ID.CH_DOWN }));
    this._midEl.appendChild(chCol);

    remote.appendChild(this._midEl);

    // Media cluster with X2 layout:
    this._mediaEl = document.createElement("div");
    this._mediaEl.className = "media x1";

    this._mediaEl.appendChild(this._mkHuiButton({ key: "rew", label: "", icon: "mdi:rewind", id: ID.REW, cmd: ID.REW, extraClass: "area-rew" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "play", label: "", icon: "mdi:play", id: ID.PLAY, cmd: ID.PLAY, extraClass: "area-play" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "fwd", label: "", icon: "mdi:fast-forward", id: ID.FWD, cmd: ID.FWD, extraClass: "area-fwd" }));

    this._mediaEl.appendChild(this._mkHuiButton({ key: "dvr", label: "DVR", icon: "", id: ID.DVR, cmd: ID.DVR, extraClass: "area-dvr" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "pause", label: "", icon: "mdi:pause", id: ID.PAUSE, cmd: ID.PAUSE, extraClass: "area-pause" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "exit", label: "Exit", icon: "", id: ID.EXIT, cmd: ID.EXIT, extraClass: "area-exit" }));

    remote.appendChild(this._mediaEl);

    // Colors row (colored bars, no text)
    this._colorsEl = document.createElement("div");
    this._colorsEl.className = "colors";
    const colorsGrid = document.createElement("div");
    colorsGrid.className = "colorsGrid";
    colorsGrid.appendChild(this._mkColorKey({ key: "red", id: ID.RED, cmd: ID.RED, color: "#d32f2f" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "green", id: ID.GREEN, cmd: ID.GREEN, color: "#388e3c" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "yellow", id: ID.YELLOW, cmd: ID.YELLOW, color: "#fbc02d" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "blue", id: ID.BLUE, cmd: ID.BLUE, color: "#1976d2" }));
    this._colorsEl.appendChild(colorsGrid);
    remote.appendChild(this._colorsEl);

    // A/B/C (X2)
    this._abcEl = document.createElement("div");
    this._abcEl.className = "abc";
    const abcGrid = document.createElement("div");
    abcGrid.className = "abcGrid";
    abcGrid.appendChild(this._mkHuiButton({ key: "a", label: "A", icon: "", id: ID.A, cmd: ID.A, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "b", label: "B", icon: "", id: ID.B, cmd: ID.B, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "c", label: "C", icon: "", id: ID.C, cmd: ID.C, size: "small" }));
    this._abcEl.appendChild(abcGrid);
    remote.appendChild(this._abcEl);

    wrap.appendChild(remote);

    // Warning
    this._warn = document.createElement("div");
    this._warn.className = "warn";
    this._warn.style.display = "none";
    wrap.appendChild(this._warn);

    card.appendChild(style);
    card.appendChild(wrap);
    this.appendChild(card);
  }

  _update() {
    if (!this._root || !this._config || !this._hass) return;

    // Apply per-card theme (and background) first
    this._applyLocalTheme(this._config?.theme);
    this._updateGroupRadius();

    // Apply per-card max width (centered via CSS)
    const mw = this._config?.max_width;
    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }

    const remote = this._remoteState();
    const isUnavailable = remote?.state === "unavailable";
    const loadState = remote?.attributes?.load_state;
    const activityId = this._currentActivityId();
    const activities = this._activities();
    const macroKeys = remote?.attributes?.macro_keys;
    const favoriteKeys = remote?.attributes?.favorite_keys;
    const macros = macroKeys && typeof macroKeys === "object"
      ? (macroKeys[String(activityId)] ?? macroKeys[activityId] ?? [])
      : [];
    const favorites = favoriteKeys && typeof favoriteKeys === "object"
      ? (favoriteKeys[String(activityId)] ?? favoriteKeys[activityId] ?? [])
      : [];

    const isX2 = this._isX2();

    // Center column alignment behavior
    if (this._midCenterCol) {
      this._midCenterCol.classList.toggle("x2", isX2);
    }

    // Media layout class toggles
    if (this._mediaEl) {
      this._mediaEl.classList.toggle("x2", isX2);
      this._mediaEl.classList.toggle("x1", !isX2);
    }

    // Activity select sync + Powered Off detection
    let isPoweredOff = false;
    const pendingActivity = this._pendingActivity;
    const pendingAge = this._pendingActivityAt
      ? Date.now() - this._pendingActivityAt
      : null;
    const pendingExpired = pendingAge != null && pendingAge > 15000;

    if (isUnavailable) {
      this._activitySelect.disabled = true;
      this._activitySelect.innerHTML = "";
      isPoweredOff = false;
      this._stopActivityLoading();
    } else {
      const options = ["Powered Off", ...activities.map((activity) => activity.name)];
      const current = this._currentActivityLabel() || "Powered Off";

      isPoweredOff = activityId == null || this._isPoweredOffLabel(current);
      if (pendingActivity && (pendingExpired || current === pendingActivity)) {
        this._pendingActivity = null;
        this._pendingActivityAt = null;
      }

      const sig = JSON.stringify(options);
      if (this._activityOptionsSig !== sig) {
        this._activityOptionsSig = sig;
        this._activitySelect.innerHTML = "";
        for (const opt of options) {
          const item = document.createElement("mwc-list-item");
          item.value = opt;
          item.textContent = opt;
          this._activitySelect.appendChild(item);
        }
      }

      // Prevent loops while syncing UI
      this._suppressActivityChange = true;
      if (pendingActivity && !pendingExpired && pendingActivity !== current) {
        this._activitySelect.value = pendingActivity;
      } else {
        this._activitySelect.value = current;
      }
      this._suppressActivityChange = false;

      this._activitySelect.disabled = options.length <= 1;

      const currentActivity = this._currentActivityLabel();
      if (this._activityLoadActive && this._activityLoadTarget) {
        const targetIsOff = this._isPoweredOffLabel(this._activityLoadTarget);
        if ((targetIsOff && isPoweredOff) || currentActivity === this._activityLoadTarget) {
          this._stopActivityLoading();
        }
      }
    }

    if (!isUnavailable && activities.length === 0 && loadState !== "loading") {
      this._warn.style.display = "block";
      this._warn.textContent = "No activities found in remote attributes.";
    } else {
      this._warn.style.display = "none";
    }

    // Visibility toggles (user config)
    this._setVisible(this._activityRow, this._config.show_activity);
this._setVisible(this._mfContainer, this._config.show_macro_favorites);

// If macro/favorites are hidden, close any open drawer
if (!this._config.show_macro_favorites && this._activeDrawer) {
  this._activeDrawer = null;
}

    this._setVisible(this._dpadEl, this._config.show_dpad);
    this._setVisible(this._navRowEl, this._config.show_nav);
    this._setVisible(this._midEl, this._config.show_mid);
    this._setVisible(this._mediaEl, this._config.show_media);
    this._setVisible(this._colorsEl, this._config.show_colors);

    // ABC: must be enabled in config AND X2
    this._setVisible(this._abcEl, this._config.show_abc && isX2);

    if (this._macrosButton) {
      this._macrosButton.hass = this._hass;
      
      const macrosEnabled = macros.length > 0; 
      this._macrosButtonWrap.classList.toggle("disabled", isUnavailable || !macrosEnabled);
    }

    if (this._favoritesButton) {
      this._favoritesButton.hass = this._hass;
      
      const favoritesEnabled = favorites.length > 0;
      this._favoritesButtonWrap.classList.toggle("disabled", isUnavailable || !favoritesEnabled);
    }

		// POPULATE MACROS (Only if data changed)
    const macroSig = JSON.stringify(macros);
    if (this._macroDataSig !== macroSig && this._macrosOverlayGrid) {
        this._macroDataSig = macroSig;
        this._macrosOverlayGrid.innerHTML = "";
        macros.forEach(macro => {
            const btn = this._mkDrawerButton(macro, 'macros');
            btn.hass = this._hass;
            this._macrosOverlayGrid.appendChild(btn);
        });
    }

    // POPULATE FAVORITES (Only if data changed)
    const favSig = JSON.stringify(favorites);
    if (this._favDataSig !== favSig && this._favoritesOverlayGrid) {
        this._favDataSig = favSig;
        this._favoritesOverlayGrid.innerHTML = "";
        favorites.forEach(fav => {
            const btn = this._mkDrawerButton(fav, 'favorites');
            btn.hass = this._hass;
            this._favoritesOverlayGrid.appendChild(btn);
        });
    }

    this._applyDrawerVisuals();

    // Update all keys: hass + enabled/disabled + X2-only visibility
    for (const k of this._keys) {
      k.btn.hass = this._hass;

      // Hide X2-only buttons on X1/X1S
      if (k.isX2Only) {
        this._setVisible(k.wrap, isX2);
      }

      // Disable all buttons if Powered Off
      const enabled = !isUnavailable && !isPoweredOff && this._isEnabled(k.id);
      k.wrap.classList.toggle("disabled", !enabled);
    }

    if (remote?.state === "unavailable") {
      this._warn.style.display = "block";
      this._warn.textContent = "Remote is unavailable (possibly because the Sofabaton app is connected).";
    }

    this._updateLoadIndicator();
  }

  getCardSize() {
    return 12;
  }

  static getConfigElement() {
    return document.createElement(EDITOR);
  }

  static getStubConfig(hass) {
    return {
      entity: "",
      theme: "",
      background_override: null,
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      show_macro_favorites: true,
      max_width: 360,
    };
  }
}

// Editor
class SofabatonHelloCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  _render() {
    if (!this._hass) return;

    if (!this._form) {
      const form = document.createElement("ha-form");
      form.hass = this._hass;

      form.computeLabel = (schema) => {
        const labels = {
          entity: "Select a Sofabaton Remote Entity",
          theme: "Apply a theme to the card",
          use_background_override: "Customize background color",
          background_override: "Select Background Color",
          show_activity: "Activity Selector",
          show_dpad: "Direction Pad",
          show_nav: "Back/Home/Menu Keys",
          show_mid: "Volume/Channel Rockers",
          show_media: "Media Playback Controls",
          show_colors: "Red/Green/Yellow/Blue",
          show_abc: "A/B/C Buttons (X2 only)"
        ,
          show_macro_favorites: "Macros/Favorites Buttons",
          max_width: "Maximum Card Width (px)"};
        return labels[schema.name] || schema.name;
      };

      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const newValue = { ...ev.detail.value };
        
        // 1. If toggle is off, wipe the color data
        if (newValue.use_background_override === false) {
          delete newValue.background_override;
        }

        // 2. STABILITY CHECK: Only fire if something actually changed
        if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;

        this._config = newValue;
        this._fireChanged();
      });

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px 0";
      wrapper.appendChild(form);
      this.appendChild(wrapper);
      this._form = form;
    }

    // Determine if we should show the color picker
    const showColorPicker = this._config.use_background_override || !!this._config.background_override;

    this._form.schema = [
      { name: "entity", selector: { entity: { domain: "remote", integration: "sofabaton_x1s" } }, required: true },
      {
        type: "expandable",
        title: "Styling Options",
        icon: "mdi:palette",
        schema: [
          // We removed the 'grid' type here so items stack vertically
          { name: "theme", selector: { theme: {} } },
          { 
            name: "max_width", 
            selector: { number: { min: 0, max: 1200, step: 10, unit_of_measurement: "px" } } 
          },
          { name: "use_background_override", selector: { boolean: {} } },
          ...(showColorPicker ? [{ name: "background_override", selector: { color_rgb: {} } }] : []),
        ]
      },
      {
        type: "expandable",
        title: "Button Visibility",
        icon: "mdi:eye-settings",
        schema: [
          {
            type: "grid",
            name: "",
            schema: [
              { name: "show_activity", selector: { boolean: {} } },
              { name: "show_dpad", selector: { boolean: {} } },
              { name: "show_nav", selector: { boolean: {} } },
              { name: "show_mid", selector: { boolean: {} } },
              { name: "show_media", selector: { boolean: {} } },
              { name: "show_colors", selector: { boolean: {} } },
              { name: "show_abc", selector: { boolean: {} } },
              { name: "show_macro_favorites", selector: { boolean: {} } },
            ]
          }
        ]
      }
    ];

    this._form.data = {
      ...this._config,
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      // Maintain the toggle state correctly
      use_background_override: this._config.use_background_override ?? !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255],
      show_activity: this._config.show_activity ?? true,
      show_dpad: this._config.show_dpad ?? true,
      show_nav: this._config.show_nav ?? true,
      show_mid: this._config.show_mid ?? true,
      show_media: this._config.show_media ?? true,
      show_colors: this._config.show_colors ?? true,
      show_abc: this._config.show_abc ?? true,
      show_macro_favorites: this._config.show_macro_favorites ?? true,
      max_width: this._config.max_width ?? 360,
    };
  }

  _fireChanged() {
    // 3. CLEANUP: Strip out the helper toggle before saving to HASS YAML
    const finalConfig = { ...this._config };
    delete finalConfig.use_background_override;

    this.dispatchEvent(
      new CustomEvent("config-changed", { 
        detail: { config: finalConfig }, 
        bubbles: true, 
        composed: true 
      })
    );
  }
}

if (!customElements.get(EDITOR)) customElements.define(EDITOR, SofabatonHelloCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TYPE)) {
  window.customCards.push({
    type: TYPE,
    name: "Sofabaton Virtual Remote",
    description: "A configurable remote for the unofficial Sofabaton X1, X1S and X2 integration.",
  });
}

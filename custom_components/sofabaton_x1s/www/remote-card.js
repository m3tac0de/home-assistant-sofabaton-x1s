const TYPE = "sofabaton-hello-card";
const EDITOR = "sofabaton-hello-card-editor";

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

// Command names (what the backend expects for remote.send_command)
const CMD = {
  UP: "UP", DOWN: "DOWN", LEFT: "LEFT", RIGHT: "RIGHT", OK: "OK",
  BACK: "BACK", HOME: "HOME", MENU: "MENU",
  VOL_UP: "VOL_UP", VOL_DOWN: "VOL_DOWN", MUTE: "MUTE",
  CH_UP: "CH_UP", CH_DOWN: "CH_DOWN",

  GUIDE: "GUIDE",
  DVR: "DVR",
  PLAY: "PLAY",
  EXIT: "EXIT",
  A: "A", B: "B", C: "C",

  REW: "REW", PAUSE: "PAUSE", FWD: "FWD",
  RED: "RED", GREEN: "GREEN", YELLOW: "YELLOW", BLUE: "BLUE",
};

const POWERED_OFF_LABELS = new Set(["powered off", "powered_off", "off"]);

class SofabatonRemoteCard extends HTMLElement {
  setConfig(config) {
    if (!config?.entity) throw new Error("Select a Sofabaton remote entity");

    // Defaults for visibility toggles (show everything by default)
    this._config = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      theme: "",
      background_override: null, // color_rgb selector returns [r,g,b]
      ...config,
    };

    this._render();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
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
    const list = this._remoteState()?.attributes?.enabled_buttons;
    return Array.isArray(list) ? list.map((n) => Number(n)) : [];
  }

  _isEnabled(id) {
    const enabled = this._enabledButtons();
    if (!enabled.length) return true; // fail-open
    return enabled.includes(Number(id));
  }

  _activitySelectEntityId() {
    return this._remoteState()?.attributes?.activity_select_entity_id || null;
  }

  _activitySelectState() {
    const selId = this._activitySelectEntityId();
    return selId ? this._hass?.states?.[selId] : null;
  }

  _loadState() {
    return String(this._remoteState()?.attributes?.load_state || "").toLowerCase();
  }

  _currentActivityLabel(sel) {
    const remoteActivity = this._remoteState()?.attributes?.current_activity;
    return String(remoteActivity ?? sel?.state ?? "");
  }

  _isPoweredOffLabel(state) {
    const s = String(state || "").trim().toLowerCase();
    return POWERED_OFF_LABELS.has(s);
  }

  _isLoadingActive() {
    const isLoading = this._loadState() === "loading";
    const isActivityLoading = Boolean(this._activityLoadActive);
    const isPulse = this._commandPulseUntil && Date.now() < this._commandPulseUntil;
    return isLoading || isActivityLoading || isPulse;
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

  async _setActivity(option) {
    const selId = this._activitySelectEntityId();
    if (!selId || option == null) return;

    this._pendingActivity = String(option);
    this._pendingActivityAt = Date.now();
    this._startActivityLoading(option);

    await this._callService("select", "select_option", {
      entity_id: selId,
      option,
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

  _mkHuiButton({ key, label, icon, id, cmd, extraClass = "", size = "normal" }) {
    const wrap = document.createElement("div");
    wrap.className = `key key--${size} ${extraClass}`.trim();
    wrap.addEventListener("click", () => {
      if (!wrap.classList.contains("disabled")) {
        this._triggerCommandPulse();
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
        action: "call-service",
        service: "remote.send_command",
        target: { entity_id: this._config.entity },
        data: { command: [cmd] },
      },
    });

    wrap.appendChild(btn);

    this._keys.push({
      key,
      id,
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
      }
    });

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "call-service",
        service: "remote.send_command",
        target: { entity_id: this._config.entity },
        data: { command: [cmd] },
      },
    });

    wrap.appendChild(btn);

    const bar = document.createElement("div");
    bar.className = "colorBar";
    wrap.appendChild(bar);

    this._keys.push({
      key,
      id,
      wrap,
      btn,
      isX2Only: false,
    });

    return wrap;
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
      }

      .wrap { padding: 12px; display: grid; gap: 12px; }
      ha-select { width: 100%; }

      .activityRow { display: grid; grid-template-columns: 1fr; gap: 0; align-items: center; }

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

      .remote { display: grid; gap: 12px; }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
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
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }

      /* Mid: VOL rocker | Guide+Mute | CH rocker */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
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
        grid-template-columns: repeat(3, 1fr);
        grid-template-areas: "rew pause fwd";
      }
      .media.x2 {
        grid-template-columns: repeat(3, 1fr);
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
      .colorsGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key { width: 100%; position: relative; }
      .key.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* sizing */
      .key--small hui-button-card { height: 44px; display:block; }
      .key--normal hui-button-card { height: 52px; display:block; }
      .key--big hui-button-card { height: 60px; display:block; }
      .okKey hui-button-card { height: 60px; }

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

    // Remote body
    const remote = document.createElement("div");
    remote.className = "remote";

    // D-pad
    this._dpadEl = document.createElement("div");
    this._dpadEl.className = "dpad";
    this._dpadEl.appendChild(this._mkHuiButton({ key: "up", label: "", icon: "mdi:chevron-up", id: ID.UP, cmd: CMD.UP, extraClass: "area-up" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "left", label: "", icon: "mdi:chevron-left", id: ID.LEFT, cmd: CMD.LEFT, extraClass: "area-left" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "ok", label: "OK", icon: "", id: ID.OK, cmd: CMD.OK, extraClass: "area-ok okKey", size: "big" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "right", label: "", icon: "mdi:chevron-right", id: ID.RIGHT, cmd: CMD.RIGHT, extraClass: "area-right" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "down", label: "", icon: "mdi:chevron-down", id: ID.DOWN, cmd: CMD.DOWN, extraClass: "area-down" }));
    remote.appendChild(this._dpadEl);

    // Back / Home / Menu
    this._navRowEl = document.createElement("div");
    this._navRowEl.className = "row3";
    this._navRowEl.appendChild(this._mkHuiButton({ key: "back", label: "", icon: "mdi:arrow-u-left-top", id: ID.BACK, cmd: CMD.BACK }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "home", label: "", icon: "mdi:home", id: ID.HOME, cmd: CMD.HOME }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "menu", label: "", icon: "mdi:menu", id: ID.MENU, cmd: CMD.MENU }));
    remote.appendChild(this._navRowEl);

    // Mid section: VOL | Guide+Mute | CH
    this._midEl = document.createElement("div");
    this._midEl.className = "mid";

    const volCol = document.createElement("div");
    volCol.className = "col";
    volCol.appendChild(this._mkHuiButton({ key: "volup", label: "", icon: "mdi:volume-plus", id: ID.VOL_UP, cmd: CMD.VOL_UP }));
    volCol.appendChild(this._mkHuiButton({ key: "voldn", label: "", icon: "mdi:volume-minus", id: ID.VOL_DOWN, cmd: CMD.VOL_DOWN }));
    this._midEl.appendChild(volCol);

    const centerCol = document.createElement("div");
    centerCol.className = "col midCenter";
    this._midCenterCol = centerCol;
    centerCol.appendChild(this._mkHuiButton({ key: "guide", label: "Guide", icon: "", id: ID.GUIDE, cmd: CMD.GUIDE }));
    centerCol.appendChild(this._mkHuiButton({ key: "mute", label: "", icon: "mdi:volume-mute", id: ID.MUTE, cmd: CMD.MUTE }));
    this._midEl.appendChild(centerCol);

    const chCol = document.createElement("div");
    chCol.className = "col";
    chCol.appendChild(this._mkHuiButton({ key: "chup", label: "", icon: "mdi:chevron-up", id: ID.CH_UP, cmd: CMD.CH_UP }));
    chCol.appendChild(this._mkHuiButton({ key: "chdn", label: "", icon: "mdi:chevron-down", id: ID.CH_DOWN, cmd: CMD.CH_DOWN }));
    this._midEl.appendChild(chCol);

    remote.appendChild(this._midEl);

    // Media cluster with X2 layout:
    this._mediaEl = document.createElement("div");
    this._mediaEl.className = "media x1";

    this._mediaEl.appendChild(this._mkHuiButton({ key: "rew", label: "", icon: "mdi:rewind", id: ID.REW, cmd: CMD.REW, extraClass: "area-rew" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "play", label: "", icon: "mdi:play", id: ID.PLAY, cmd: CMD.PLAY, extraClass: "area-play" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "fwd", label: "", icon: "mdi:fast-forward", id: ID.FWD, cmd: CMD.FWD, extraClass: "area-fwd" }));

    this._mediaEl.appendChild(this._mkHuiButton({ key: "dvr", label: "DVR", icon: "", id: ID.DVR, cmd: CMD.DVR, extraClass: "area-dvr" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "pause", label: "", icon: "mdi:pause", id: ID.PAUSE, cmd: CMD.PAUSE, extraClass: "area-pause" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "exit", label: "Exit", icon: "", id: ID.EXIT, cmd: CMD.EXIT, extraClass: "area-exit" }));

    remote.appendChild(this._mediaEl);

    // Colors row (colored bars, no text)
    this._colorsEl = document.createElement("div");
    this._colorsEl.className = "colors";
    const colorsGrid = document.createElement("div");
    colorsGrid.className = "colorsGrid";
    colorsGrid.appendChild(this._mkColorKey({ key: "red", id: ID.RED, cmd: CMD.RED, color: "#d32f2f" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "green", id: ID.GREEN, cmd: CMD.GREEN, color: "#388e3c" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "yellow", id: ID.YELLOW, cmd: CMD.YELLOW, color: "#fbc02d" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "blue", id: ID.BLUE, cmd: CMD.BLUE, color: "#1976d2" }));
    this._colorsEl.appendChild(colorsGrid);
    remote.appendChild(this._colorsEl);

    // A/B/C (X2)
    this._abcEl = document.createElement("div");
    this._abcEl.className = "abc";
    const abcGrid = document.createElement("div");
    abcGrid.className = "abcGrid";
    abcGrid.appendChild(this._mkHuiButton({ key: "a", label: "A", icon: "", id: ID.A, cmd: CMD.A, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "b", label: "B", icon: "", id: ID.B, cmd: CMD.B, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "c", label: "C", icon: "", id: ID.C, cmd: CMD.C, size: "small" }));
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

    const remote = this._remoteState();
    const sel = this._activitySelectState();

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

    const selId = this._activitySelectEntityId();
    if (!selId || !sel) {
      this._activitySelect.disabled = true;
      this._activitySelect.innerHTML = "";
      isPoweredOff = false;
      this._stopActivityLoading();

      this._warn.style.display = "block";
      this._warn.textContent = "Activity select not found (activity_select_entity_id missing?).";
    } else {
      const options = Array.isArray(sel.attributes?.options) ? sel.attributes.options : [];
      const current = sel.state || "";

      isPoweredOff = this._isPoweredOffLabel(current);
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

      this._activitySelect.disabled = false;
      this._warn.style.display = "none";

      const currentActivity = this._currentActivityLabel(sel);
      if (
        this._activityLoadActive
        && this._activityLoadTarget
        && currentActivity
        && currentActivity === this._activityLoadTarget
      ) {
        this._stopActivityLoading();
      }
    }

    // Visibility toggles (user config)
    this._setVisible(this._activityRow, this._config.show_activity);
    this._setVisible(this._dpadEl, this._config.show_dpad);
    this._setVisible(this._navRowEl, this._config.show_nav);
    this._setVisible(this._midEl, this._config.show_mid);
    this._setVisible(this._mediaEl, this._config.show_media);
    this._setVisible(this._colorsEl, this._config.show_colors);

    // ABC: must be enabled in config AND X2
    this._setVisible(this._abcEl, this._config.show_abc && isX2);

    // Update all keys: hass + enabled/disabled + X2-only visibility
    for (const k of this._keys) {
      k.btn.hass = this._hass;

      // Hide X2-only buttons on X1/X1S
      if (k.isX2Only) {
        this._setVisible(k.wrap, isX2);
      }

      // Disable all buttons if Powered Off
      const enabled = !isPoweredOff && this._isEnabled(k.id);
      k.wrap.classList.toggle("disabled", !enabled);
    }

    if (remote?.state === "unavailable") {
      this._warn.style.display = "block";
      this._warn.textContent = "Remote is unavailable (often because the Sofabaton app is connected).";
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
    const remotes = Object.keys(hass.states).filter((eid) => eid.startsWith("remote."));
    return {
      entity: remotes[0] || "",
      theme: "",
      background_override: null,
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
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

      form.schema = [
        { name: "entity", selector: { entity: { domain: "remote", integration: "sofabaton_x1s" } }, required: true },
        { name: "theme", selector: { theme: {} } },

        // Background override (for translucent themes)
        { name: "background_override", selector: { color_rgb: {} } },

        // Visibility toggles
        { name: "show_activity", selector: { boolean: {} } },
        { name: "show_dpad", selector: { boolean: {} } },
        { name: "show_nav", selector: { boolean: {} } },
        { name: "show_mid", selector: { boolean: {} } },
        { name: "show_media", selector: { boolean: {} } },
        { name: "show_colors", selector: { boolean: {} } },
        { name: "show_abc", selector: { boolean: {} } },
      ];

      form.addEventListener("value-changed", (ev) => {
        this._config = { ...this._config, ...ev.detail.value };
        this._fireChanged();
      });

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px 0";
      wrapper.appendChild(form);
      this.appendChild(wrapper);

      this._form = form;
    }

    this._form.data = {
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      background_override: this._config.background_override ?? null,

      show_activity: this._config.show_activity ?? true,
      show_dpad: this._config.show_dpad ?? true,
      show_nav: this._config.show_nav ?? true,
      show_mid: this._config.show_mid ?? true,
      show_media: this._config.show_media ?? true,
      show_colors: this._config.show_colors ?? true,
      show_abc: this._config.show_abc ?? true,
    };
  }

  _fireChanged() {
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })
    );
  }
}

if (!customElements.get(EDITOR)) customElements.define(EDITOR, SofabatonHelloCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TYPE)) {
  window.customCards.push({
    type: TYPE,
    name: "Sofabaton Remote Card",
    description: "Remote layout + native Lovelace button styling (hui-button-card) + per-card theme + configurable visibility.",
  });
}

const remoteEntityId = "remote.living_room";

const COMMAND_IDS = [
  151, 152, 153, 154, 155, 156, 157,
  174, 175, 176, 177, 178, 179, 180, 181,
  182, 183, 184, 185, 186, 187, 188, 189,
  190, 191, 192, 193,
];

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Self-styling like the real ha-card (shadow root + :host styles + slot), so
// it renders identically whether it sits in light DOM (legacy card) or inside
// the Lit card's shadow tree.
class HaCardStub extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        *, :host { box-sizing: border-box; }
        :host {
          display: block;
          background: #fff;
          border-radius: var(--ha-card-border-radius, 18px);
          border: 1px solid #dbdbdb;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.06),
            0 12px 24px rgba(0, 0, 0, 0.04);
        }
      </style>
      <slot></slot>
    `;
  }
}

const iconSvg = (paths, { viewBox = "0 0 24 24", fill = "none", stroke = "currentColor", strokeWidth = "2", linecap = "round", linejoin = "round" } = {}) =>
  `<svg viewBox="${viewBox}" width="100%" height="100%" aria-hidden="true" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}">${paths}</svg>`;

const ICONS = {
  "mdi:arrow-up-bold": iconSvg(`<path d="M12 5l-6 7h4v7h4v-7h4z" fill="currentColor" stroke="none"></path>`),
  "mdi:arrow-down-bold": iconSvg(`<path d="M12 19l6-7h-4V5h-4v7H6z" fill="currentColor" stroke="none"></path>`),
  "mdi:arrow-left-bold": iconSvg(`<path d="M5 12l7 6v-4h7v-4h-7V6z" fill="currentColor" stroke="none"></path>`),
  "mdi:arrow-right-bold": iconSvg(`<path d="M19 12l-7-6v4H5v4h7v4z" fill="currentColor" stroke="none"></path>`),
  "mdi:chevron-up": iconSvg(`<path d="M6 15l6-6 6 6"></path>`),
  "mdi:chevron-down": iconSvg(`<path d="M6 9l6 6 6-6"></path>`),
  "mdi:chevron-left": iconSvg(`<path d="M15 6l-6 6 6 6"></path>`),
  "mdi:chevron-right": iconSvg(`<path d="M9 6l6 6-6 6"></path>`),
  "mdi:arrow-u-left-top": iconSvg(`<path d="M9 9l-4 4 4 4"></path><path d="M5 13h8a5 5 0 015 5v1"></path>`),
  "mdi:home": iconSvg(`<path d="M4 11.5L12 5l8 6.5" fill="currentColor" stroke="none"></path><path d="M7 11v8h4v-5h2v5h4v-8" fill="currentColor" stroke="none"></path>`),
  "mdi:home-outline": iconSvg(`<path d="M4 11.5L12 5l8 6.5"></path><path d="M7 10.5V19h10v-8.5"></path>`),
  "mdi:menu": iconSvg(`<path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path>`),
  "mdi:volume-plus": iconSvg(`<path d="M5 10h4l5-4v12l-5-4H5z"></path><path d="M18 10v4"></path><path d="M16 12h4"></path>`),
  "mdi:volume-minus": iconSvg(`<path d="M5 10h4l5-4v12l-5-4H5z"></path><path d="M16 12h4"></path>`),
  "mdi:volume-mute": iconSvg(`<path d="M5 10h4l5-4v12l-5-4H5z"></path><path d="M17 10l4 4"></path><path d="M21 10l-4 4"></path>`),
  "mdi:chevron-up-circle-outline": iconSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M8 14l4-4 4 4"></path>`),
  "mdi:chevron-down-circle-outline": iconSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M8 10l4 4 4-4"></path>`),
  "mdi:rewind": iconSvg(`<path d="M11 7l-6 5 6 5z" fill="currentColor" stroke="none"></path><path d="M19 7l-6 5 6 5z" fill="currentColor" stroke="none"></path>`),
  "mdi:pause": iconSvg(`<path d="M9 7h2v10H9z" fill="currentColor" stroke="none"></path><path d="M13 7h2v10h-2z" fill="currentColor" stroke="none"></path>`),
  "mdi:pause-circle-outline": iconSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M10 9v6"></path><path d="M14 9v6"></path>`),
  "mdi:fast-forward": iconSvg(`<path d="M5 7l6 5-6 5z" fill="currentColor" stroke="none"></path><path d="M13 7l6 5-6 5z" fill="currentColor" stroke="none"></path>`),
  "mdi:play-circle-outline": iconSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none"></path>`),
  "mdi:television-play": iconSvg(`<rect x="4" y="6" width="16" height="11" rx="2"></rect><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"></path><path d="M9 20h6"></path>`),
  "mdi:play-circle": iconSvg(`<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"></circle><path d="M10 8l6 4-6 4z" fill="#fff" stroke="none"></path>`),
};

const iconFallback = (name) => {
  if (name?.includes("alpha-a")) return "A";
  if (name?.includes("alpha-b")) return "B";
  if (name?.includes("alpha-c")) return "C";
  if (name?.includes("circle")) return "•";
  return "";
};

class HaIconStub extends HTMLElement {
  // Render into shadow DOM like the real ha-icon. Light-DOM rendering would
  // mutate Lit's cloned template fragments during the importNode upgrade
  // (attributeChangedCallback fires mid-clone), shifting lit-html's node
  // indexes and mis-binding every part after the icon.
  static get observedAttributes() {
    return ["icon"];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  _render() {
    const icon = this.getAttribute("icon") || "";
    this._shadow.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1em;
          height: 1em;
          color: inherit;
        }
      </style>
      ${ICONS[icon] || `<span style="font-size:0.95em;line-height:1;">${iconFallback(icon)}</span>`}
    `;
  }
}

class MwcListItemStub extends HTMLElement {
  get value() {
    return this.getAttribute("value") || "";
  }

  set value(next) {
    this.setAttribute("value", next == null ? "" : String(next));
  }
}

// Shadow DOM like the real hui-button-card: the button chrome must travel
// with the element into any render root, and light-DOM writes would corrupt
// Lit template clones during upgrade.
class HuiButtonCardStub extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  set hass(value) {
    this._hass = value;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    const cfg = this._config || {};
    const icon = cfg.show_icon && cfg.icon
      ? `<span class="button-card-icon">${ICONS[cfg.icon] || `<span style="font-size:0.95em">${iconFallback(cfg.icon)}</span>`}</span>`
      : "";
    const name = cfg.show_name ? `<span class="button-card-name">${cfg.name || ""}</span>` : "";
    this._shadow.innerHTML = `
      <style>
        *, :host { box-sizing: border-box; }
        :host {
          display: block;
          width: 100%;
          height: 100%;
          --ha-card-background: #ffffff;
          --ha-card-border-width: 1px;
          --ha-card-border-color: #dbdbdb;
          --ha-card-border-radius: 22px;
          --ha-card-box-shadow: none;
        }
        .button-card-main {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 100%;
          min-height: 100%;
          min-width: 0;
          padding: 0 10px;
          border-radius: var(--ha-card-border-radius);
          border: var(--ha-card-border-width) solid var(--ha-card-border-color);
          background: var(--ha-card-background);
          box-shadow: var(--ha-card-box-shadow);
          color: inherit;
          font: inherit;
          text-align: center;
        }
        .button-card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.2em;
          height: 1.2em;
          line-height: 1;
          color: var(--primary-color);
        }
        .button-card-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
      <div class="button-card-main">${icon}${name}</div>
    `;
  }
}

class HaSelectStub extends HTMLElement {
  constructor() {
    super();
    this._observer = new MutationObserver(() => this._syncOptions());
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
        }
        .label {
          font-size: 12px;
          color: #6f7890;
          line-height: 1.2;
        }
        .trigger {
          width: 100%;
          border: 0;
          background: #f6f6f6;
          border-radius: 10px;
          min-height: 112px;
          padding: 18px 20px 16px 22px;
          color: var(--primary-text-color, #202124);
          font: inherit;
          text-align: left;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-rows: auto auto;
          gap: 10px 10px;
          cursor: pointer;
          box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.55);
        }
        .trigger[disabled] {
          cursor: default;
          opacity: 0.85;
        }
        .value {
          font-size: 27px;
          line-height: 1.1;
          color: #111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caret {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
          width: 30px;
          height: 30px;
          color: #777;
        }
        .menu {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% - 2px);
          display: none;
          background: #fff;
          border-radius: 0 0 24px 24px;
          border: 1px solid #dadada;
          border-top: 0;
          box-shadow:
            0 2px 0 rgba(0, 0, 0, 0.08),
            0 16px 28px rgba(0, 0, 0, 0.14);
          padding: 6px 0 12px;
          overflow: hidden;
          z-index: 40;
        }
        :host([open]) .menu {
          display: block;
        }
        .option {
          width: calc(100% - 18px);
          margin: 0 auto;
          border: 0;
          background: transparent;
          color: #202124;
          text-align: left;
          font: inherit;
          font-size: 26px;
          line-height: 1.25;
          padding: 18px 28px;
          border-radius: 8px;
          cursor: pointer;
        }
        .option:hover,
        .option[data-selected="true"] {
          background: #ededed;
        }
        .option + .option {
          margin-top: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .menu {
            transition: none;
          }
        }
      </style>
      <button class="trigger" type="button">
        <span class="label"></span>
        <span class="value"></span>
        <span class="caret">${iconSvg(`<path d="M7 10l5 5 5-5z" fill="currentColor" stroke="none"></path>`, { stroke: "none" })}</span>
      </button>
      <div class="menu" role="listbox"></div>
    `;
    this._labelEl = this._shadow.querySelector(".label");
    this._valueEl = this._shadow.querySelector(".value");
    this._trigger = this._shadow.querySelector(".trigger");
    this._menu = this._shadow.querySelector(".menu");
  }

  static get observedAttributes() {
    return ["label"];
  }

  connectedCallback() {
    this._labelEl.textContent = this.label || "";
    this._trigger.addEventListener("click", () => {
      if (this.disabled) return;
      if (this.hasAttribute("open")) {
        this._closeMenu();
      } else {
        this._openMenu();
      }
    });
    this._trigger.addEventListener("blur", () => {
      if (this.hasAttribute("open")) this._closeMenu();
    });
    this._observer.observe(this, { childList: true });
    this._syncOptions();
  }

  disconnectedCallback() {
    this._observer.disconnect();
  }

  attributeChangedCallback() {
    this._labelEl.textContent = this.label || "";
  }

  get label() {
    return this._label || "";
  }

  set label(value) {
    this._label = value == null ? "" : String(value);
    this.setAttribute("label", this._label);
    if (this._labelEl) this._labelEl.textContent = this._label;
  }

  get value() {
    return this._value ?? "";
  }

  set value(next) {
    this._value = next == null ? "" : String(next);
    this._renderValue();
    this._renderOptions();
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(next) {
    if (next) {
      this.setAttribute("disabled", "");
    } else {
      this.removeAttribute("disabled");
    }
    if (this._trigger) this._trigger.disabled = Boolean(next);
  }

  _syncOptions() {
    const current = this.value;
    const items = Array.from(this.children).filter((child) => !child.hasAttribute("data-ha-select-internal"));
    this._options = items.map((item) => ({
      value: item.value || item.textContent || "",
      label: item.textContent || "",
    }));
    if (this._options.some((option) => option.value === current)) {
      this._value = current;
    } else if (this._options.length) {
      this._value = this._options[0].value;
    } else {
      this._value = "";
    }
    this._renderValue();
    this._renderOptions();
  }

  _renderValue() {
    if (this._valueEl) this._valueEl.textContent = this.value || "";
  }

  _renderOptions() {
    if (!this._menu) return;
    this._menu.innerHTML = "";
    for (const option of this._options || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.textContent = option.label;
      button.dataset.selected = String(option.value === this.value);
      button.addEventListener("click", () => {
        this._value = option.value;
        this._renderValue();
        this._renderOptions();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.dispatchEvent(new CustomEvent("selected", { detail: { value: this.value }, bubbles: true, composed: true }));
        this._closeMenu();
      });
      this._menu.appendChild(button);
    }
  }

  _openMenu() {
    this.setAttribute("open", "");
    this.dispatchEvent(new Event("opened", { bubbles: true, composed: true }));
  }

  _closeMenu() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("closed", { bubbles: true, composed: true }));
  }
}

class HaFormStub extends HTMLElement {
  set hass(value) {
    this._hass = value;
  }

  get schema() {
    return this._schema || [];
  }

  set schema(value) {
    this._schema = Array.isArray(value) ? value : [];
    this._render();
  }

  get data() {
    return this._data || {};
  }

  set data(value) {
    this._data = value && typeof value === "object" ? value : {};
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _rowsFor(schema, depth = 0) {
    return (schema || [])
      .map((entry) => {
        if (Array.isArray(entry?.schema)) {
          const inner = this._rowsFor(entry.schema, depth + 1);
          const title = entry.title || entry.name || "";
          return `<div class="form-group"><div class="form-group-title">${title}</div>${inner}</div>`;
        }
        const label =
          typeof this.computeLabel === "function"
            ? this.computeLabel(entry)
            : entry?.name || "";
        const value = this._data?.[entry?.name];
        const shown =
          value === undefined || value === null
            ? ""
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
        return `<div class="form-row"><span class="form-label">${label}</span><span class="form-value">${shown}</span></div>`;
      })
      .join("");
  }

  _render() {
    this.innerHTML = `
      <style>
        .form-stub { display: grid; gap: 4px; font-size: 14px; }
        .form-stub .form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 6px 10px; border: 1px solid #dadada; border-radius: 8px; background: #fafafa; }
        .form-stub .form-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .form-stub .form-value { color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .form-stub .form-group { border: 1px dashed #c4c4c4; border-radius: 8px; padding: 6px; display: grid; gap: 4px; }
        .form-stub .form-group-title { font-weight: 700; font-size: 12px; color: #666; padding: 0 4px; }
      </style>
      <div class="form-stub">${this._rowsFor(this._schema)}</div>
    `;
  }
}

class HaSwitchStub extends HTMLElement {
  // Shadow DOM for the same reason as HaIconStub: never mutate light DOM
  // inside Lit-cloned fragments.
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (!this._wired) {
      this._wired = true;
      this.addEventListener("click", () => {
        this.checked = !this.checked;
        this.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    this._render();
  }

  get checked() {
    return this.hasAttribute("checked");
  }

  set checked(next) {
    if (next) {
      this.setAttribute("checked", "");
    } else {
      this.removeAttribute("checked");
    }
    this._render();
  }

  _render() {
    const on = this.checked;
    this._shadow.innerHTML = `
      <style>
        :host { display: inline-flex; cursor: pointer; }
      </style>
      <span style="width:34px;height:18px;border-radius:9px;background:${on ? "#4c78a8" : "#c4c4c4"};position:relative;display:inline-block;transition:none;">
        <span style="position:absolute;top:2px;left:${on ? "18px" : "2px"};width:14px;height:14px;border-radius:50%;background:#fff;"></span>
      </span>
    `;
  }
}

if (!customElements.get("ha-card")) customElements.define("ha-card", HaCardStub);
if (!customElements.get("ha-icon")) customElements.define("ha-icon", HaIconStub);
if (!customElements.get("mwc-list-item")) customElements.define("mwc-list-item", MwcListItemStub);
if (!customElements.get("hui-button-card")) customElements.define("hui-button-card", HuiButtonCardStub);
if (!customElements.get("ha-select")) customElements.define("ha-select", HaSelectStub);
if (!customElements.get("ha-form")) customElements.define("ha-form", HaFormStub);
if (!customElements.get("ha-switch")) customElements.define("ha-switch", HaSwitchStub);

const scenarios = {
  powered_off: {
    platform: "sofabaton_x1s",
    states: {
      [remoteEntityId]: {
        state: "off",
        attributes: {
          hub_version: "X1S",
          current_activity: "Powered Off",
          current_activity_id: null,
          load_state: "idle",
          activities: [
            { id: 101, name: "Watch a movie", state: "off" },
            { id: 102, name: "Play Xbox", state: "off" },
            { id: 103, name: "Play Playstation 5", state: "off" },
            { id: 104, name: "Play Switch 2", state: "off" },
            { id: 105, name: "Play Steamdeck", state: "off" },
          ],
          assigned_keys: {
            101: COMMAND_IDS,
            102: COMMAND_IDS,
          },
          macro_keys: {
            101: [{ command_id: 501, name: "Movie Night", device_id: 101 }],
          },
          favorite_keys: {
            101: [{ command_id: 601, name: "Netflix", device_id: 3 }],
          },
        },
      },
    },
  },
  active: {
    platform: "sofabaton_x1s",
    states: {
      [remoteEntityId]: {
        state: "on",
        attributes: {
          hub_version: "X1S",
          current_activity: "Watch a movie",
          current_activity_id: 101,
          load_state: "idle",
          activities: [
            { id: 101, name: "Watch a movie", state: "on" },
            { id: 102, name: "Play Xbox", state: "off" },
            { id: 103, name: "Play Playstation 5", state: "off" },
            { id: 104, name: "Play Switch 2", state: "off" },
            { id: 105, name: "Play Steamdeck", state: "off" },
          ],
          assigned_keys: {
            101: COMMAND_IDS,
            102: [174, 175, 176, 177, 178, 179, 180, 181, 187, 188, 189],
          },
          macro_keys: {
            101: [
              { command_id: 501, name: "test macro 1", device_id: 101 },
              { command_id: 502, name: "test macro 2", device_id: 101 },
            ],
          },
          favorite_keys: {
            101: [
              { command_id: 600, name: "0", device_id: 3 },
              { command_id: 601, name: "1", device_id: 3 },
              { command_id: 602, name: "2", device_id: 3 },
              { command_id: 603, name: "3", device_id: 3 },
              { command_id: 604, name: "4", device_id: 3 },
              { command_id: 605, name: "5", device_id: 3 },
            ],
          },
        },
      },
    },
  },
  loading: {
    platform: "sofabaton_x1s",
    states: {
      [remoteEntityId]: {
        state: "on",
        attributes: {
          hub_version: "X1S",
          current_activity: "Watch a movie",
          current_activity_id: 101,
          load_state: "loading",
          activities: [
            { id: 101, name: "Watch a movie", state: "on" },
            { id: 102, name: "Play Xbox", state: "off" },
          ],
          assigned_keys: {
            101: COMMAND_IDS,
          },
          macro_keys: {
            101: [{ command_id: 501, name: "Movie Night", device_id: 101 }],
          },
          favorite_keys: {
            101: [{ command_id: 601, name: "Netflix", device_id: 3 }],
          },
        },
      },
    },
  },
  hub_x2: {
    platform: "sofabaton_hub",
    states: {
      [remoteEntityId]: {
        state: "on",
        attributes: {
          hub_version: "X2",
          hub_mac: "AA:BB:CC:11:22:33",
          current_activity: "Movie Time",
          current_activity_id: 201,
          load_state: "idle",
          activities: [
            { id: 201, name: "Movie Time", state: "on" },
            { id: 202, name: "Retro Gaming", state: "off" },
          ],
          assigned_keys: {
            201: COMMAND_IDS,
          },
          macro_keys: {
            201: [{ command_id: 701, name: "Cinema Mode", activity_id: 201 }],
          },
          favorite_keys: {
            201: [{ command_id: 801, name: "Plex", device_id: 8 }],
          },
        },
      },
    },
  },
};

const harnessState = {
  card: null,
  config: null,
  scenarioName: null,
  scenario: null,
  hass: null,
  serviceCalls: [],
  wsCalls: [],
  mqttSubscriptions: [],
};

function createHass(scenario) {
  const hass = {
    states: clone(scenario.states),
    themes: {
      themes: {
        "Harness Midnight": {
          "--primary-color": "#4c78a8",
          "--primary-text-color": "#202124",
          "--secondary-text-color": "#56708b",
          "--disabled-text-color": "#bfccd9",
          "--divider-color": "#d8d8d8",
          "--ha-card-background": "#ffffff",
          "--card-background-color": "#ffffff",
          "--primary-background-color": "#fafafa",
          "--secondary-background-color": "#ffffff",
          "--input-fill-color": "#f4f4f4",
        },
      },
    },
    async callWS(message) {
      harnessState.wsCalls.push(clone(message));
      if (message?.type === "config/entity_registry/get") {
        return { platform: scenario.platform };
      }
      return { ok: true };
    },
    connection: {
      // Enough of hass.connection for the Automation Assist MQTT flows:
      // records subscriptions; tests push messages via pushMqttMessage().
      subscribeMessage: async (callback, message) => {
        const sub = {
          topic: String(message?.topic || ""),
          callback,
          unsubscribed: false,
        };
        harnessState.mqttSubscriptions.push(sub);
        return () => {
          sub.unsubscribed = true;
        };
      },
    },
    async callService(domain, service, data, target) {
      harnessState.serviceCalls.push({ domain, service, data: clone(data), target: clone(target) });
      const remoteState = hass.states[remoteEntityId];
      if (!remoteState) return;
      if (domain === "remote" && service === "turn_on") {
        const activity = String(data?.activity || "");
        const match = (remoteState.attributes.activities || []).find((entry) => entry.name === activity);
        remoteState.state = "on";
        remoteState.attributes.current_activity = activity;
        remoteState.attributes.current_activity_id = match ? Number(match.id) : remoteState.attributes.current_activity_id;
      } else if (domain === "remote" && service === "turn_off") {
        remoteState.state = "off";
        remoteState.attributes.current_activity = "Powered Off";
        remoteState.attributes.current_activity_id = null;
      }
      if (harnessState.card) harnessState.card.hass = hass;
    },
  };
  return hass;
}

async function ensureRemoteCardLoaded() {
  if (customElements.get("sofabaton-virtual-remote")) return;
  await import("/custom_components/sofabaton_x1s/www/remote-card.js");
}

function defaultConfig() {
  return {
    entity: remoteEntityId,
    theme: "Harness Midnight",
    max_width: 460,
    show_activity: true,
    show_dpad: true,
    show_nav: true,
    show_mid: true,
    show_media: true,
    show_colors: true,
    show_abc: true,
    show_macros_button: true,
    show_favorites_button: true,
    custom_favorites: [],
  };
}

async function mountCard({ scenario = "active", config = {} } = {}) {
  await ensureRemoteCardLoaded();
  const mount = document.querySelector("#mount");
  mount.innerHTML = "";

  harnessState.scenarioName = scenario;
  harnessState.scenario = clone(scenarios[scenario]);
  harnessState.serviceCalls = [];
  harnessState.wsCalls = [];
  harnessState.config = { ...defaultConfig(), ...clone(config) };
  harnessState.hass = createHass(harnessState.scenario);

  const card = document.createElement("sofabaton-virtual-remote");
  card.setConfig(harnessState.config);
  card.hass = harnessState.hass;
  mount.appendChild(card);
  harnessState.card = card;

  await new Promise((resolve) => setTimeout(resolve, 50));
  return card;
}

async function mountEditor({ scenario = "active", config = {} } = {}) {
  await ensureRemoteCardLoaded();
  const mount = document.querySelector("#mount");
  mount.innerHTML = "";

  harnessState.scenarioName = scenario;
  harnessState.scenario = clone(scenarios[scenario]);
  harnessState.serviceCalls = [];
  harnessState.wsCalls = [];
  harnessState.config = { ...defaultConfig(), ...clone(config) };
  harnessState.hass = createHass(harnessState.scenario);

  // HA assigns hass before calling setConfig on config editors; the editor's
  // _render() short-circuits without hass, so the order matters here.
  const editor = document.createElement("sofabaton-virtual-remote-editor");
  editor.hass = harnessState.hass;
  editor.setConfig(harnessState.config);
  mount.appendChild(editor);
  harnessState.card = editor;

  await new Promise((resolve) => setTimeout(resolve, 100));
  return editor;
}

async function updateScenarioState(patch) {
  if (!harnessState.hass) throw new Error("No harness hass available");
  const next = typeof patch === "function" ? patch(clone(harnessState.hass.states[remoteEntityId])) : patch;
  harnessState.hass.states[remoteEntityId] = {
    ...harnessState.hass.states[remoteEntityId],
    ...next,
    attributes: {
      ...harnessState.hass.states[remoteEntityId].attributes,
      ...(next?.attributes || {}),
    },
  };
  if (harnessState.card) harnessState.card.hass = harnessState.hass;
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// Query inside the mounted card regardless of render root: the legacy card
// renders into light DOM, the Lit card into its shadow root.
function cardRoot() {
  const card = harnessState.card;
  if (!card) return document;
  return card.shadowRoot || card;
}

window.__remoteCardHarness = {
  mountCard,
  mountEditor,
  updateScenarioState,
  query: (selector) => cardRoot().querySelector(selector),
  queryAll: (selector) => Array.from(cardRoot().querySelectorAll(selector)),
  getMqttSubscriptions: () =>
    harnessState.mqttSubscriptions.map((sub) => ({
      topic: sub.topic,
      unsubscribed: sub.unsubscribed,
    })),
  pushMqttMessage: (topic, payload) => {
    harnessState.mqttSubscriptions
      .filter((sub) => !sub.unsubscribed && sub.topic === topic)
      .forEach((sub) => sub.callback({ topic, payload }));
  },
  getServiceCalls: () => clone(harnessState.serviceCalls),
  getWsCalls: () => clone(harnessState.wsCalls),
  getRemoteState: () => clone(harnessState.hass?.states?.[remoteEntityId] || null),
};

await ensureRemoteCardLoaded();

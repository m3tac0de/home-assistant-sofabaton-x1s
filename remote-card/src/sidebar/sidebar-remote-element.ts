// The sidebar remote (docs/internal/sidebar-remote-plan.md): a mobile-first
// view over the remote card's store. Everything the dashboard card knows
// (activities, device mode, keymaps, bound keys, activity loading, drawers,
// long-press bindings, the HA backend) is read from RemoteCardStore; this
// element only decides how it looks and how a finger drives it.

import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import type { HassLike } from "../backend/hass-types";
import { ID, NUMPAD_KEY_IDS, powerButtonEnabled } from "../remote-card-layout";
import { customFavoriteButtonModel, drawerButtonModel } from "../remote-card-render-models";
import { remoteCardDirection, remoteCardLanguage, setRemoteCardLanguage, str } from "../remote-card-strings";
import { runtimeButtonVisibility } from "../remote-card-runtime-display";
import type { RemoteCardConfig } from "../remote-card-types";
import { LAST_DEVICE_STORAGE_PREFIX, RemoteCardStore } from "../state/remote-card-store";
import { sidebarBusyState, type SidebarRuntimeState } from "./sidebar-busy";
import { SidebarPressController } from "./sidebar-press";
import { wantsLandscape } from "./sidebar-layout";
import { sidebarRemoteStyles } from "./sidebar-remote-styles";
import { applySidebarTheme } from "./sidebar-remote-theme";

export const SIDEBAR_REMOTE_TAG = "sofabaton-sidebar-remote";

type SheetPane = "favorites" | "macros" | "commands" | "activities" | "devices";

/** Spec key per hub key id (the press controller resolves on these). */
const KEY_BY_ID: Record<number, string> = {
  [ID.UP]: "up", [ID.DOWN]: "down", [ID.LEFT]: "left", [ID.RIGHT]: "right", [ID.OK]: "ok",
  [ID.BACK]: "back", [ID.HOME]: "home", [ID.MENU]: "menu",
  [ID.VOL_UP]: "volup", [ID.VOL_DOWN]: "voldn", [ID.MUTE]: "mute",
  [ID.CH_UP]: "chup", [ID.CH_DOWN]: "chdn", [ID.GUIDE]: "guide",
  [ID.REW]: "rew", [ID.PLAY]: "play", [ID.PAUSE]: "pause", [ID.FWD]: "fwd",
  [ID.DVR]: "dvr", [ID.EXIT]: "exit", [ID.A]: "a", [ID.B]: "b", [ID.C]: "c",
  [ID.RED]: "red", [ID.GREEN]: "green", [ID.YELLOW]: "yellow", [ID.BLUE]: "blue",
  [ID.NUM_1]: "num1", [ID.NUM_2]: "num2", [ID.NUM_3]: "num3", [ID.NUM_4]: "num4", [ID.NUM_5]: "num5",
  [ID.NUM_6]: "num6", [ID.NUM_7]: "num7", [ID.NUM_8]: "num8", [ID.NUM_9]: "num9",
  [ID.NUM_0]: "num0", [ID.NUM_DASH]: "numdash", [ID.NUM_ENTER]: "numenter",
};

const NUMPAD_ORDER: Array<{ id: number; label: string }> = [
  { id: ID.NUM_1, label: "1" }, { id: ID.NUM_2, label: "2" }, { id: ID.NUM_3, label: "3" },
  { id: ID.NUM_4, label: "4" }, { id: ID.NUM_5, label: "5" }, { id: ID.NUM_6, label: "6" },
  { id: ID.NUM_7, label: "7" }, { id: ID.NUM_8, label: "8" }, { id: ID.NUM_9, label: "9" },
  { id: ID.NUM_DASH, label: "−" }, { id: ID.NUM_0, label: "0" }, { id: ID.NUM_ENTER, label: "E" },
];

/** Device-class icon for the drawers (the hub's class names are free text). */
function deviceClassIcon(deviceClass: unknown): string {
  const cls = String(deviceClass ?? "").toLowerCase();
  if (cls.includes("wifi") || cls.includes("wi-fi") || cls.includes("network")) return "mdi:wifi";
  if (cls.includes("bluetooth") || cls.includes("bt")) return "mdi:bluetooth";
  return "mdi:remote";
}

/** The sidebar remote's fixed card config: the view has no layout options. */
/** Per entity, the view the remote was last on: "device" or "activity". The
 *  device itself is the store's own last-device memory, so the dashboard card
 *  and the sidebar share it. */
const VIEW_STORAGE_PREFIX = "sofabaton_x1s:sidebar:view:";

function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the remote just opens on the activity */
  }
}

/** The device to reopen, when the last view on this entity was that device. */
export function rememberedOpenDevice(entity: string): number | null {
  if (readStored(`${VIEW_STORAGE_PREFIX}${entity}`) !== "device") return null;
  const id = Number(readStored(`${LAST_DEVICE_STORAGE_PREFIX}${entity}`));
  return Number.isFinite(id) ? id : null;
}

function sidebarConfig(entity: string): RemoteCardConfig {
  const openDevice = rememberedOpenDevice(entity);
  return {
    entity,
    hold_repeat: { enabled: true },
    show_favorite_device_names: true,
    show_automation_assist: false,
    max_width: 0,
    // The store reopens this device once the capability resolves (its
    // open_device path, built for the card's configured opening view).
    ...(openDevice != null ? { device_mode: { open_device: openDevice } } : {}),
  } as RemoteCardConfig;
}

export class SofabatonSidebarRemote extends LitElement {
  static styles = sidebarRemoteStyles;

  private readonly _store: RemoteCardStore;
  private _hass: HassLike | null = null;
  private _entityId = "";
  private _runtime: SidebarRuntimeState = null;
  private _lastThemesRef: unknown = undefined;
  private _press: SidebarPressController | null = null;
  /** Landscape split, only when the portrait wheel would be too small (sidebar-layout.ts). */
  private _landscape = false;
  private _sizeObserver: ResizeObserver | null = null;
  /** The rows have been measured once; after that only the ResizeObserver re-measures. */
  private _layoutMeasured = false;
  private _sheet: SheetPane | null = null;
  private _lastDrawer: "favorites" | "macros" = "favorites";
  private _numpadOpen = false;
  private _numpadPageKey = "";
  private _outsideTap: ((ev: Event) => void) | null = null;

  constructor() {
    super();
    this._store = new RemoteCardStore(() => this.requestUpdate(), {
      fireEvent: (type, detail) =>
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
      onHubQueueDrained: () => this.requestUpdate(),
      onCommandPulseChange: () => this.requestUpdate(),
    });
  }

  // ---------- host API ----------

  set hass(value: HassLike) {
    this._hass = value;
    const language = value?.locale?.language ?? value?.language;
    if (setRemoteCardLanguage(language)) this.requestUpdate();
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    this._store.setHass(value);
    const themes = value?.themes;
    if (themes !== this._lastThemesRef) {
      this._lastThemesRef = themes;
      this.updateComplete.then(() => this._applyTheme());
    }
  }

  get hass(): HassLike | null {
    return this._hass;
  }

  /** The remote entity of the selected hub ("" = none). */
  set entityId(value: string) {
    const next = String(value ?? "");
    if (next === this._entityId) return;
    this._entityId = next;
    this._sheet = null;
    this._numpadOpen = false;
    if (next) {
      this._store.setConfig(sidebarConfig(next));
      // The panel sets `hass` before the entity; the integration probe the
      // store ran then had no target, so run it again now that it has one.
      if (this._hass) this._store.setHass(this._hass);
    }
    this.requestUpdate();
  }

  get entityId(): string {
    return this._entityId;
  }

  /** The hub's runtime state from the panel's poll (long-running operations). */
  set runtime(value: SidebarRuntimeState) {
    this._runtime = value;
    this.requestUpdate();
  }

  get runtime(): SidebarRuntimeState {
    return this._runtime;
  }

  get store(): RemoteCardStore {
    return this._store;
  }

  // ---------- lifecycle ----------

  connectedCallback(): void {
    super.connectedCallback();
    this._store.connected();
    this._outsideTap = (ev: Event) => {
      if (!this._numpadOpen) return;
      const path = ev.composedPath();
      const wheel = this.renderRoot.querySelector(".wheel-wrap");
      if (wheel && !path.includes(wheel)) {
        this._numpadOpen = false;
        this.requestUpdate();
      }
    };
    this.addEventListener("pointerdown", this._outsideTap);
    this.addEventListener("keydown", this._onKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._store.disconnected();
    this.removeEventListener("keydown", this._onKeydown);
    this._press?.dispose();
    this._press = null;
    if (this._outsideTap) this.removeEventListener("pointerdown", this._outsideTap);
    this._sizeObserver?.disconnect();
    this._sizeObserver = null;
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Escape") return;
    if (this._sheet) { this._openSheet(null); ev.preventDefault(); }
    else if (this._numpadOpen) { this._numpadOpen = false; this.requestUpdate(); ev.preventDefault(); }
  };

  protected firstUpdated(): void {
    // The shadow root, not `.app`: the first render may be the no-hub
    // notice, and a later render swaps the whole tree.
    this._press = new SidebarPressController(this.renderRoot, {
      resolve: (el) => {
        const id = Number((el as HTMLElement).dataset.key);
        if (!Number.isFinite(id)) return null;
        return { id, key: KEY_BY_ID[id] ?? String(id) };
      },
      hasLongPress: (id) => this._store.longPressAvailableForButton(id, this._scopeFor(id)),
      isEnabled: (id) => this._keyEnabled(id),
      onTap: (id, el, at) => this._send(id, el, at),
      onRepeat: (id, _index, el, at) => this._send(id, el, at),
      onLongPress: (id, el, at) => this._sendLongPress(id, el, at),
      onPressed: (el, pressed) => this._setPressed(el, pressed),
      haptic: () => this.dispatchEvent(new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true })),
    });
    this._applyTheme();
    if (typeof ResizeObserver !== "undefined") {
      this._sizeObserver = new ResizeObserver(() => this._measureLayout());
      this._sizeObserver.observe(this);
    }
  }

  protected updated(_changed: PropertyValues): void {
    if (this._lastThemesRef === undefined) this._applyTheme();
    // Never re-measure from inside the update cycle once the rows are known:
    // a measurement that depended on the layout it just produced would
    // re-render forever without yielding, which locks the browser up. The
    // host's size only changes from outside, so the observer owns it.
    if (!this._layoutMeasured) this._measureLayout();
  }

  /** Portrait unless the portrait wheel would be too small; measured from the
   *  rows whose heights are the same in both layouts (sidebar-layout.ts). */
  private _measureLayout(): void {
    const root = this.renderRoot;
    const remote = root.querySelector(".remote") as HTMLElement | null;
    const pull = root.querySelector(".pull") as HTMLElement | null;
    if (!remote || !pull) return;
    const rows = [".activity", ".nav", ".media", ".rockers", ".colors"]
      .map((sel) => root.querySelector(sel) as HTMLElement | null)
      .filter((el): el is HTMLElement => el != null);
    if (rows.length < 5) return;
    const cs = getComputedStyle(remote);
    this._layoutMeasured = true;
    const landscape = wantsLandscape({
      width: this.clientWidth,
      height: this.clientHeight,
      fixedRows: rows.map((el) => el.offsetHeight),
      pull: pull.offsetHeight,
      gap: parseFloat(cs.rowGap) || 0,
      pad: parseFloat(cs.paddingTop) || 0,
    }, this._landscape);
    if (landscape !== this._landscape) {
      this._landscape = landscape;
      this.requestUpdate();
    }
  }

  private _applyTheme(): void {
    if (!this.isConnected) return;
    applySidebarTheme(this, this.renderRoot as ShadowRoot);
  }

  // ---------- sending ----------

  private _scopeFor(id: number): number | null {
    const store = this._store;
    if (store.mode() === "device") return store.currentDeviceId();
    return (store.commandTarget(id)?.activity_id as number | null | undefined) ?? store.currentActivityId();
  }

  private _keyEnabled(id: number): boolean {
    if (this._busy().inert) return false;
    return this._store.isEnabled(id);
  }

  private _control(request: Promise<void>, el?: Element | null): void {
    request.catch(() => {
      this._store.controlFailed();
      this._flagFailure(el ?? null);
    });
  }

  private _send(id: number, el: Element, at?: { x: number; y: number }): void {
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendCommand(id, this._scopeFor(id)), el);
  }

  private _sendLongPress(id: number, el: Element, at?: { x: number; y: number }): void {
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendLongPress(id, this._scopeFor(id)), el);
  }

  /** The transmit ring: a thin accent circle expanding out of the key. On
   *  the wheel's quadrants (a quarter of the disc each) it starts where the
   *  finger was, at a key's size, not from the whole quadrant. */
  private _ring(el: Element | null, failed = false, at?: { x: number; y: number }): void {
    const app = this.renderRoot.querySelector(".app") as HTMLElement | null;
    if (!app || !el) return;
    const base = app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const quadrant = el.classList.contains("dir");
    // 92px: the bare keys' press pill, so the wheel's ring matches theirs
    const d = quadrant ? 92 : Math.max(r.width, r.height) * 1.1;
    const cx = quadrant && at ? at.x : r.left + r.width / 2;
    const cy = quadrant && at ? at.y : r.top + r.height / 2;
    const ring = document.createElement("div");
    ring.className = failed ? "ring err" : "ring";
    ring.style.cssText = `left:${cx - base.left - d / 2}px;top:${cy - base.top - d / 2}px;width:${d}px;height:${d}px`;
    app.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove());
    setTimeout(() => ring.remove(), 1500);
  }

  /** A refused send: a red ring on the key and the panel's hub dot flashes red. */
  private _flagFailure(el: Element | null): void {
    this._ring(el, true);
    this.dispatchEvent(new CustomEvent("sidebar-remote-failed", { bubbles: true, composed: true }));
    this.requestUpdate();
  }

  private _setPressed(el: Element, pressed: boolean): void {
    el.classList.toggle("pressed", pressed);
    const dir = (el as HTMLElement).dataset.dir;
    const wheel = this.renderRoot.querySelector(".wheel") as HTMLElement | null;
    if (dir && wheel) {
      if (pressed) wheel.dataset.tilt = dir;
      else delete wheel.dataset.tilt;
    }
    const pill = el.closest(".pill") as HTMLElement | null;
    if (pill) {
      if (pressed) {
        const segs = [...pill.children].filter((c) => (c as HTMLElement).offsetParent !== null || getComputedStyle(c).display !== "none");
        const i = segs.indexOf(el);
        pill.dataset.tilt = segs.length === 1 ? "center" : segs.length === 2 ? ["left", "right"][i] : ["left", "center", "right"][i];
      } else {
        delete pill.dataset.tilt;
      }
    }
  }

  // ---------- state ----------

  private _busy() {
    const derived = this._store.deriveRuntimeState();
    const s = str();
    return sidebarBusyState({
      mode: derived.mode,
      isUnavailable: derived.isUnavailable,
      activityLoading: this._store.activityLoadingActive(),
      loadPending: derived.loadPending,
      isPoweredOff: derived.isPoweredOff,
      pendingActivity: derived.selectState?.resolvedValue ?? null,
      deviceId: derived.deviceId ?? null,
      runtime: this._runtime,
      strings: {
        starting: s.sidebar.starting,
        poweringOff: s.sidebar.poweringOff,
        working: s.sidebar.working,
        appConnected: s.sidebar.appConnected,
        operations: s.sidebar.operations,
        off: s.card.poweredOff,
      },
    });
  }

  /** Open a sheet pane (or close with null); the pull handle, pickers and audits use it. */
  openSheet(pane: SheetPane | null): void {
    this._openSheet(pane);
  }

  private _openSheet(pane: SheetPane | null): void {
    if (pane === "favorites" || pane === "macros") this._lastDrawer = pane;
    const opening = pane != null && this._sheet == null;
    this._sheet = pane;
    this.requestUpdate();
    if (opening) {
      // Keyboard users land on the close button; Escape closes.
      void this.updateComplete.then(() => (this.renderRoot.querySelector(".sheet .close") as HTMLElement | null)?.focus({ preventScroll: true }));
    }
  }

  private _togglePull(): void {
    const deviceMode = this._store.mode() === "device";
    if (!deviceMode) return this._openSheet(this._lastDrawer);
    // No device picked yet: the first thing to do is pick one.
    this._openSheet(this._store.currentDeviceId() == null ? "devices" : "commands");
  }

  private _toggleNumpad(): void {
    this._numpadOpen = !this._numpadOpen;
    this.requestUpdate();
  }

  private _pickActivity(label: string): void {
    this._openSheet(null);
    this.dispatchEvent(new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true }));
    this._control(this._store.setActivity(label));
  }

  private _pickDevice(id: number): void {
    this._openSheet(null);
    this._store.setDevice(id);
    this._rememberView();
  }

  private _rememberView(): void {
    if (this._entityId) writeStored(`${VIEW_STORAGE_PREFIX}${this._entityId}`, this._store.mode());
  }

  private _toggleMode(): void {
    this._store.toggleMode();
    this._rememberView();
    this._sheet = null;
    this._numpadOpen = false;
    this.requestUpdate();
  }

  private _power(): void {
    const el = this.renderRoot.querySelector(".power");
    const store = this._store;
    // Device mode: the device's power toggle. Activity mode: all off.
    this._control(store.mode() === "device" ? store.toggleDevicePower() : store.setActivity(str().card.poweredOff), el);
  }

  // ---------- render ----------

  protected render(): TemplateResult {
    if (!this._entityId) {
      return html`<div class="app"><div class="remote"><div class="sp"></div><div class="notice">${str().sidebar.noHubs}</div><div class="sp"></div></div></div>`;
    }
    const store = this._store;
    const derived = store.deriveRuntimeState();
    const s = str();
    const deviceMode = derived.mode === "device";
    const busy = this._busy();
    const isX2 = derived.isX2;
    const vis = runtimeButtonVisibility({
      isX2,
      showVolume: true,
      showChannel: true,
      showMedia: true,
      showDvr: true,
    });

    // Number pad: X2, any keypad key bound on the current page; resets on page change.
    const numpadAvailable = isX2 && store.anyKeyBound(NUMPAD_KEY_IDS);
    const pageKey = `${derived.mode}:${deviceMode ? (derived.deviceId ?? "") : (derived.activityId ?? "")}`;
    if (!numpadAvailable || pageKey !== this._numpadPageKey) this._numpadOpen = false;
    this._numpadPageKey = pageKey;

    // Device mode: the device's power key (as the card). Activity mode: the
    // same disc is "all off", shown while an activity is running.
    const showPower = deviceMode
      ? powerButtonEnabled(null) && store.devicePowerConfigured()
      : store.currentActivityId() != null;
    const powerLabel = deviceMode ? s.card.powerButton : s.sidebar.allOff;
    const modeAvailable = store.deviceModeAvailable();
    const currentName = deviceMode
      ? (store.deviceNameForId(derived.deviceId) ?? s.card.selectDevice)
      : derived.selectState?.resolvedValue || derived.currentLabel || s.card.poweredOff;
    const eyebrow = busy.label ?? (deviceMode ? s.card.deviceSelectLabel : s.card.activitySelectLabel);

    const off = (id: number) => !store.isEnabled(id);
    // A key with a long-press binding on this page holds instead of repeating: mark it, quietly.
    const key = (id: number, cls: Record<string, boolean>, body: TemplateResult | string, extra: Record<string, unknown> = {}) => html`
      <button
        class=${classMap({ ...cls, off: off(id) })}
        data-key=${id}
        data-dir=${(extra.dir as string | undefined) ?? nothing}
        aria-label=${s.keys[KEY_BY_ID[id]] ?? String(id)}
        aria-disabled=${off(id) ? "true" : nothing}
        type="button"
      >${body}</button>`;
    const icon = (name: string) => html`<ha-icon .icon=${name}></ha-icon>`;

    const allOff = (...ids: number[]) => ids.every(off);
    const playPause = isX2
      ? html`<div class=${classMap({ pill: true, off: allOff(ID.PLAY, ID.PAUSE) })}>${key(ID.PLAY, { seg: true }, icon("mdi:play-outline"))}${key(ID.PAUSE, { seg: true }, icon("mdi:pause"))}</div>`
      : html`<div class=${classMap({ pill: true, single: true, off: allOff(ID.PAUSE) })}>${key(ID.PAUSE, { seg: true }, icon("mdi:play-pause"))}</div>`;

    return html`
      <div class=${classMap({ app: true, landscape: this._landscape, inert: busy.inert, busy: busy.busy, pick: busy.reason === "no-device" || busy.reason === "off", "powered-off": busy.reason === "off", open: this._sheet != null })} data-mode=${derived.mode}>
        <main class="remote" aria-busy=${busy.busy ? "true" : "false"}>
          <div class="activity">
            ${modeAvailable
              ? html`<button class="round mode" type="button" title=${s.sidebar.modeToggle} aria-label=${s.sidebar.modeToggle} @click=${this._toggleMode}>
                  ${icon(deviceMode ? "mdi:audio-video" : "mdi:play-circle-outline")}
                </button>`
              : nothing}
            <button class="text" type="button" @click=${() => this._openSheet(deviceMode ? "devices" : "activities")} aria-haspopup="dialog">
              <span class="eyebrow">${eyebrow}${busy.busy ? "…" : ""}</span>
              <span class="name"><span>${currentName}</span>${icon("mdi:chevron-down")}<span class="spin"></span></span>
            </button>
            ${showPower
              ? html`<button class=${classMap({ round: true, power: true, busy: deviceMode && store.powerBusy })} type="button" aria-label=${powerLabel} title=${powerLabel} @click=${this._power}>
                  ${icon("mdi:power")}
                </button>`
              : nothing}
            <span class="bar"></span>
          </div>

          ${derived.noActivitiesMessage ? html`<div class="notice">${derived.noActivitiesMessage}</div>` : nothing}

          <div class="sp"></div>
          <div class=${classMap({ "wheel-area": true, "has-orbit": isX2 })}>
            <div class=${classMap({ "wheel-wrap": true, flipped: this._numpadOpen })}>
              <div class=${classMap({ wheel: true, flipped: this._numpadOpen })}>
                <div class="face face-wheel">
                  <div class="disc"></div>
                  <div class="dirs">
                    ${key(ID.UP, { dir: true, up: true }, icon("mdi:chevron-up"), { dir: "up" })}
                    ${key(ID.LEFT, { dir: true, left: true }, icon("mdi:chevron-left"), { dir: "left" })}
                    ${key(ID.RIGHT, { dir: true, right: true }, icon("mdi:chevron-right"), { dir: "right" })}
                    ${key(ID.DOWN, { dir: true, down: true }, icon("mdi:chevron-down"), { dir: "down" })}
                  </div>
                  ${key(ID.OK, { ok: true }, "OK")}
                </div>
                ${numpadAvailable
                  ? html`<div class="numpad face face-pad">
                      ${NUMPAD_ORDER.map((n, i) => html`<button class=${classMap({ off: off(n.id) })} style="--i:${i}" data-key=${n.id} type="button" aria-label=${s.keys[KEY_BY_ID[n.id]] ?? n.label}>${n.label}</button>`)}
                    </div>`
                  : nothing}
              </div>
              ${numpadAvailable
                ? html`<button class="numtoggle" type="button" aria-label=${s.sidebar.numberPad} aria-pressed=${this._numpadOpen ? "true" : "false"} @click=${this._toggleNumpad}>${icon("mdi:dialpad")}</button>`
                : nothing}
              ${vis.dvr ? key(ID.DVR, { orbit: true, dvr: true }, "DVR") : nothing}
              ${vis.exit ? key(ID.EXIT, { orbit: true, exit: true }, "EXIT") : nothing}
              ${isX2 ? key(ID.A, { orbit: true, abc: true, a: true }, "A") : nothing}
              ${isX2 ? key(ID.B, { orbit: true, abc: true, b: true }, "B") : nothing}
              ${isX2 ? key(ID.C, { orbit: true, abc: true, c: true }, "C") : nothing}
            </div>
          </div>
          <div class="sp"></div>

          <div class="bare nav">
            ${key(ID.BACK, { seg: true }, icon("mdi:arrow-u-left-top"))}
            ${key(ID.HOME, { seg: true }, icon("mdi:home-outline"))}
            ${key(ID.MENU, { seg: true }, icon("mdi:menu"))}
          </div>

          <div class="bare media">
            ${key(ID.REW, { seg: true }, icon("mdi:rewind-outline"))}
            ${playPause}
            ${key(ID.FWD, { seg: true }, icon("mdi:fast-forward-outline"))}
          </div>


          <div class="rockers">
            <div class=${classMap({ pill: true, vol: true, off: allOff(ID.VOL_DOWN, ID.MUTE, ID.VOL_UP) })}>
              ${key(ID.VOL_DOWN, { seg: true }, "−")}
              ${key(ID.MUTE, { seg: true, lbl: true }, html`${icon("mdi:volume-mute")}<small>VOL</small>`)}
              ${key(ID.VOL_UP, { seg: true }, "+")}
            </div>
            <div class=${classMap({ pill: true, ch: true, off: vis.guide ? allOff(ID.CH_DOWN, ID.GUIDE, ID.CH_UP) : allOff(ID.CH_DOWN, ID.CH_UP) })}>
              ${key(ID.CH_DOWN, { seg: true }, "−")}
              ${vis.guide
                ? key(ID.GUIDE, { seg: true, lbl: true }, html`${icon("mdi:television-guide")}<small>CH</small>`)
                : html`<div class="seg lbl deco" aria-hidden="true">${icon("mdi:television-guide")}<small>CH</small></div>`}
              ${key(ID.CH_UP, { seg: true }, "+")}
            </div>
          </div>

          <div class="colors">
            ${key(ID.RED, { red: true }, "")}${key(ID.GREEN, { green: true }, "")}${key(ID.YELLOW, { yellow: true }, "")}${key(ID.BLUE, { blue: true }, "")}
          </div>

          <div class="sp"></div>
        </main>

        <button class="pull" type="button" aria-label=${deviceMode ? s.sidebar.pullHandleCommands : s.sidebar.pullHandle} @click=${this._togglePull}>
          <span class="grip"></span>
          <span class="knob">${icon("mdi:chevron-up")}</span>
        </button>

        <div class="scrim" @click=${() => this._openSheet(null)}></div>
        ${this._renderSheet(derived, deviceMode)}
      </div>
    `;
  }

  private _renderSheet(derived: ReturnType<RemoteCardStore["deriveRuntimeState"]>, deviceMode: boolean): TemplateResult {
    const s = str();
    const pane = this._sheet;
    const headed = pane === "activities" || pane === "devices" || pane === "commands";
    const icon = (name: string) => html`<ha-icon .icon=${name}></ha-icon>`;
    const close = html`<button class="close" type="button" aria-label=${s.sidebar.close} @click=${() => this._openSheet(null)}>${icon("mdi:close")}</button>`;
    const title = pane === "devices" ? s.sidebar.devices : pane === "commands" ? s.card.commandsTab : s.sidebar.activities;
    const eyebrow = pane === "commands" ? (this._store.deviceNameForId(derived.deviceId) ?? "") : "";
    return html`
      <div class="sheet" role="dialog" aria-modal="true" aria-hidden=${pane ? "false" : "true"} aria-label=${title}>
        <div class="grip"></div>
        ${headed
          ? html`<div class="phead"><div class="titles">${eyebrow ? html`<span class="eyebrow">${eyebrow}</span>` : nothing}<span>${title}</span></div>${close}</div>`
          : html`<div class="segs"><div class="ctl" role="tablist">
              <button class=${classMap({ s: true, active: pane === "favorites" })} role="tab" type="button" @click=${() => this._openSheet("favorites")}>${icon("mdi:star-outline")}${s.card.favoritesTab}</button>
              <button class=${classMap({ s: true, active: pane === "macros" })} role="tab" type="button" @click=${() => this._openSheet("macros")}>${icon("mdi:playlist-play")}${s.card.macrosTab}</button>
            </div>${close}</div>`}
        ${pane === "commands"
          ? html`<label class="filter">${icon("mdi:magnify")}<input type="search" .value=${derived.commandFilter} placeholder=${s.card.filterCommands} @input=${(ev: Event) => this._store.setCommandFilter((ev.target as HTMLInputElement).value)} /></label>`
          : nothing}
        <div class="body">${pane ? this._renderPane(pane, derived, deviceMode) : nothing}</div>
      </div>
    `;
  }

  private _renderPane(pane: SheetPane, derived: ReturnType<RemoteCardStore["deriveRuntimeState"]>, _deviceMode: boolean): TemplateResult {
    const s = str();
    const store = this._store;
    const icon = (name: string) => html`<ha-icon .icon=${name}></ha-icon>`;
    const devices = store.devices();
    const classOf = (deviceId: number) => deviceClassIcon(devices.find((d) => d.id === deviceId)?.device_class);
    const fallbackDevice = store.currentActivityId();

    if (pane === "favorites") {
      const favorites = (derived.favorites as Array<Record<string, unknown>>).map((raw) => ({ raw, model: drawerButtonModel(raw, "favorites", fallbackDevice) }));
      const custom = (derived.customFavorites as Array<Record<string, unknown>>).map((raw) => ({ raw, model: customFavoriteButtonModel(raw, fallbackDevice) }));
      if (!favorites.length && !custom.length) return html`<div class="empty">${s.card.noFavorites}</div>`;
      return html`<div class="grid">
        ${favorites.map(({ raw, model }) => html`
          <button class="tile" type="button" @click=${(ev: Event) => this._drawerItem("favorites", model, raw, ev.currentTarget as Element)}>
            <span class="ic">${icon(model.icon ?? classOf(model.deviceId))}</span>
            <span class="t"><b>${model.label}</b><small>${store.deviceNameForId(model.deviceId) ?? ""}</small></span>
          </button>`)}
        ${custom.map(({ model }) => html`
          <button class="tile" type="button" @click=${(ev: Event) => this._customFavorite(model, ev.currentTarget as Element)}>
            <span class="ic">${icon(model.icon ?? classOf(model.deviceId))}</span>
            <span class="t"><b>${model.label}</b><small>${store.deviceNameForId(model.deviceId) ?? ""}</small></span>
          </button>`)}
      </div>`;
    }
    if (pane === "macros") {
      const macros = (derived.macros as Array<Record<string, unknown>>).map((raw) => ({ raw, model: drawerButtonModel(raw, "macros", fallbackDevice) }));
      if (!macros.length) return html`<div class="empty">${s.card.noMacros}</div>`;
      return html`<div class="list">
        ${macros.map(({ raw, model }) => html`
          <button class="lrow" type="button" @click=${(ev: Event) => this._drawerItem("macros", model, raw, ev.currentTarget as Element)}>
            <ha-icon class="li" .icon=${model.icon ?? "mdi:playlist-play"}></ha-icon>
            <span class="t"><b>${model.label}</b></span>
            <ha-icon class="chev" .icon=${"mdi:chevron-right"}></ha-icon>
          </button>`)}
      </div>`;
    }
    if (pane === "commands") {
      const commands = derived.commands;
      const deviceIcon = classOf(derived.deviceId ?? -1);
      if (!commands.length) return html`<div class="empty">${derived.keymapLoading ? s.sidebar.working : s.card.noCommands}</div>`;
      return html`<div class="list">
        ${commands.map((command) => html`
          <button class="lrow" type="button" @click=${(ev: Event) => this._command(command.command_id, ev.currentTarget as Element)}>
            <ha-icon class="li" .icon=${deviceIcon}></ha-icon>
            <span class="t"><b>${command.name}</b></span>
            <ha-icon class="chev" .icon=${"mdi:chevron-right"}></ha-icon>
          </button>`)}
      </div>`;
    }
    if (pane === "devices") {
      return html`<div class="rows">
        ${devices.map((device) => html`
          <button class=${classMap({ row: true, current: device.id === derived.deviceId })} type="button" @click=${() => this._pickDevice(device.id)}>
            <span class="ic">${icon(deviceClassIcon(device.device_class))}</span>
            <span class="name">${device.name}</span>
            <span class="st"></span>
          </button>`)}
      </div>`;
    }
    // activities (all off is the power disc beside the selector)
    const currentId = store.currentActivityId();
    return html`<div class="rows">
      ${derived.activities.map((activity) => html`
        <button class=${classMap({ row: true, current: activity.id === currentId })} type="button" @click=${() => this._pickActivity(activity.name)}>
          <span class="ic">${icon("mdi:movie-open-outline")}</span>
          <span class="name">${activity.name}</span>
          <span class="st"></span>
        </button>`)}
    </div>`;
  }

  private _drawerItem(itemType: "favorites" | "macros", model: ReturnType<typeof drawerButtonModel>, raw: Record<string, unknown>, el: Element): void {
    this._store.triggerCommandPulse();
    this._ring(el);
    this._control(this._store.sendDrawerItem(itemType, model.commandId, model.deviceId, raw), el);
  }

  private _customFavorite(model: ReturnType<typeof customFavoriteButtonModel>, el: Element): void {
    this._store.triggerCommandPulse();
    this._ring(el);
    this._control(this._store.sendCustomFavoriteCommand(model.commandId, model.deviceId), el);
  }

  private _command(commandId: number, el: Element): void {
    this._store.triggerCommandPulse();
    this._ring(el);
    this._control(this._store.sendCommand(commandId, this._store.currentDeviceId()), el);
  }
}

import { LitElement, css, html, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { renderSecondaryTabShell, renderSecondaryViewBody, secondaryTabStyles } from "../components/secondary-tab";
import { operationProgressStyles, renderOperationProgress } from "../components/operation-progress";
import type { ControlPanelHubState, HassLike, WifiPressEvent } from "../shared/ha-context";
import { entityForHub, proxyClientConnected, remoteAttrsForHub } from "../shared/utils/control-panel-selectors";
import {
  findRunningWifiDevice,
  selectedDeviceOwnsPendingSync,
  shouldFinalizeWifiHubLoad,
} from "./wifi-commands-state";
import { TOOLS_CARD_STRINGS } from "../strings";

const SLOT_COUNT = 10;
const INPUT_ICON = "mdi:video-input-hdmi";
const WIFI_COMMANDS_DOCS_URL = TOOLS_CARD_STRINGS.wifiCommands.docsUrl;

const ID = {
  UP: 174,
  DOWN: 178,
  LEFT: 175,
  RIGHT: 177,
  OK: 176,
  BACK: 179,
  HOME: 180,
  MENU: 181,
  VOL_UP: 182,
  VOL_DOWN: 185,
  MUTE: 184,
  CH_UP: 183,
  CH_DOWN: 186,
  GUIDE: 157,
  DVR: 155,
  PLAY: 156,
  EXIT: 154,
  A: 153,
  B: 152,
  C: 151,
  REW: 187,
  PAUSE: 188,
  FWD: 189,
  RED: 190,
  GREEN: 191,
  YELLOW: 192,
  BLUE: 193,
} as const;

const HARD_BUTTON_ICONS: Record<string, string> = {
  up: "mdi:arrow-up-bold",
  down: "mdi:arrow-down-bold",
  left: "mdi:arrow-left-bold",
  right: "mdi:arrow-right-bold",
  ok: "mdi:check-circle-outline",
  back: "mdi:arrow-u-left-top",
  home: "mdi:home-outline",
  menu: "mdi:menu",
  volup: "mdi:volume-plus",
  voldn: "mdi:volume-minus",
  mute: "mdi:volume-mute",
  chup: "mdi:chevron-up-circle-outline",
  chdn: "mdi:chevron-down-circle-outline",
  guide: "mdi:television-guide",
  dvr: "mdi:record-rec",
  play: "mdi:play-circle-outline",
  exit: "mdi:close-circle-outline",
  rew: "mdi:rewind",
  pause: "mdi:pause-circle-outline",
  fwd: "mdi:fast-forward",
  red: "mdi:circle",
  green: "mdi:circle",
  yellow: "mdi:circle",
  blue: "mdi:circle",
  a: "mdi:alpha-a-circle-outline",
  b: "mdi:alpha-b-circle-outline",
  c: "mdi:alpha-c-circle-outline",
};

const DEFAULT_KEY_LABELS: Record<string, string> = TOOLS_CARD_STRINGS.wifiCommands.keyLabels;

const HARD_BUTTON_ID_MAP: Record<string, number> = {
  up: ID.UP,
  down: ID.DOWN,
  left: ID.LEFT,
  right: ID.RIGHT,
  ok: ID.OK,
  back: ID.BACK,
  home: ID.HOME,
  menu: ID.MENU,
  volup: ID.VOL_UP,
  voldn: ID.VOL_DOWN,
  mute: ID.MUTE,
  chup: ID.CH_UP,
  chdn: ID.CH_DOWN,
  guide: ID.GUIDE,
  dvr: ID.DVR,
  play: ID.PLAY,
  exit: ID.EXIT,
  rew: ID.REW,
  pause: ID.PAUSE,
  fwd: ID.FWD,
  red: ID.RED,
  green: ID.GREEN,
  yellow: ID.YELLOW,
  blue: ID.BLUE,
  a: ID.A,
  b: ID.B,
  c: ID.C,
};

const X2_ONLY_HARD_BUTTON_IDS = new Set<number>([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);
const DEFAULT_ACTION = { action: "perform-action" };
const WIFI_SECTION_ROW = [{ id: "wifi", label: TOOLS_CARD_STRINGS.wifiCommands.sectionLabel, icon: "mdi:wifi", passive: true }] as const;

type PressType = "short" | "long";
type ActiveModal = "details" | "action" | null;
type HubEventKey = "power_off" | "redundant_off" | "activity_start";

const HUB_EVENT_ROWS: Array<{ key: HubEventKey; label: string; icon: string }> = [
  { key: "power_off", label: TOOLS_CARD_STRINGS.wifiCommands.hubEventPowerOff, icon: "mdi:power" },
  { key: "redundant_off", label: TOOLS_CARD_STRINGS.wifiCommands.hubEventRedundantOff, icon: "mdi:power-off" },
  { key: "activity_start", label: TOOLS_CARD_STRINGS.wifiCommands.hubEventActivityStart, icon: "mdi:play-circle-outline" },
];

interface WifiCommandAction {
  action: string;
  perform_action?: string;
  service?: string;
  target?: Record<string, unknown>;
  entity_id?: string | string[];
  device_id?: string | string[];
  area_id?: string | string[];
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
  navigation_path?: string;
  url_path?: string;
}

interface WifiCommandSlot {
  name: string;
  add_as_favorite: boolean;
  hard_button: string;
  long_press_enabled: boolean;
  is_power_on: boolean;
  is_power_off: boolean;
  input_activity_id: string;
  activities: string[];
  action: WifiCommandAction;
  long_press_action: WifiCommandAction;
}

interface SyncState {
  status: string;
  current_step: number;
  total_steps: number;
  message: string;
  commands_hash: string;
  managed_command_hashes: string[];
  sync_needed: boolean;
}

interface WifiDeviceSummary extends SyncState {
  device_key: string;
  device_name: string;
  configured_slot_count: number;
  deployed_device_id?: number | null;
  commands?: Array<Record<string, unknown>>;
  power_on_command_id?: number | null;
  power_off_command_id?: number | null;
}

class SofabatonWifiCommandsTab extends LitElement {
  private static readonly _DEVICE_SESSION_KEY_PREFIX = "sofabaton_x1s:wifi_commands:selected_device:";

  // Matches the dock wipe (and the slot/card glow keyframes) at 720ms.
  private static readonly _IR_FLASH_DURATION_MS = 720;

  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    setHubCommandBusy: { attribute: false },
    refreshControlPanelState: { attribute: false },
    lastWifiPress: { attribute: false },
    hubCommandBusy: { type: Boolean },
    hubCommandBusyLabel: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    blockedTitle: { type: String },
    blockedMessage: { type: String },
    _commandsData: { state: true },
    _wifiDevices: { state: true },
    _selectedDeviceKey: { state: true },
    _configLoadedForEntryId: { state: true },
    _commandConfigLoading: { state: true },
    _deviceListLoading: { state: true },
    _syncState: { state: true },
    _commandSyncLoading: { state: true },
    _commandSyncRunning: { state: true },
    _commandSyncDeviceKey: { state: true },
    _activeCommandSlot: { state: true },
    _activeCommandModal: { state: true },
    _confirmClearSlot: { state: true },
    _commandSaveError: { state: true },
    _activeCommandActionTab: { state: true },
    _syncWarningOpen: { state: true },
    _syncWarningOptOut: { state: true },
    _advancedOptionsOpen: { state: true },
    _commandEditorDrafts: { state: true },
    _shortSelectorVersion: { state: true },
    _longSelectorVersion: { state: true },
    _createDeviceModalOpen: { state: true },
    _newDeviceName: { state: true },
    _deviceMutationError: { state: true },
    _deleteDeviceKey: { state: true },
    _deletingDeviceKey: { state: true },
    _creatingDevice: { state: true },
    _maxWifiDevices: { state: true },
    _hubEventActions: { state: true },
    _devicePowerPickerKind: { state: true },
    _activeHubEventKey: { state: true },
    _hubEventDraft: { state: true },
    _hubEventSelectorVersion: { state: true },
    _hubEventSaveError: { state: true },
  };

  static styles = [secondaryTabStyles, operationProgressStyles, css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --tools-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --tools-radius-md: var(--ha-card-border-radius, 12px);
      --tools-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --tools-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --tools-radius-pill: 999px;
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow: hidden; }
    .tab-panel--detail { padding: 0; }
    .list-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; }
    .list-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 16px 16px; }
    .detail-view { min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; }
    .sticky-header, .sticky-footer { position: sticky; z-index: 2; background: var(--ha-card-background, var(--card-background-color)); }
    .sticky-header { padding: 12px 16px; }
    .sticky-header { top: 0; border-bottom: 1px solid var(--divider-color); }
    .sticky-footer { bottom: 0; border-top: 1px solid var(--divider-color); padding: 0; }
    .detail-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
    .detail-title-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
    .detail-title-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .detail-title { font-size: 18px; font-weight: 700; color: var(--primary-text-color); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .back-btn, .list-action-btn, .detail-sync-btn, .device-delete-btn { border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); background: transparent; color: var(--primary-text-color); font: inherit; }
    .back-btn, .list-action-btn, .detail-sync-btn { padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .back-btn { display: inline-flex; align-items: center; gap: 8px; }
    .list-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; column-gap: 16px; row-gap: 8px; }
    .list-header-copy { min-width: 0; }
    .list-header-copy .section-subtitle { margin-top: 0; }
    .list-header-action { grid-column: 2; grid-row: 1; align-self: start; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .device-list { display: grid; gap: 6px; }
    .device-card { position: relative; width: 100%; max-width: 100%; box-sizing: border-box; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); padding: 9px 10px 9px 12px; background: var(--secondary-background-color, var(--ha-card-background)); text-align: left; display: flex; align-items: center; gap: 10px; cursor: pointer; overflow: hidden; box-shadow: none; transition: border-color 120ms ease, background-color 120ms ease; }
    .device-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
    .device-card.pending-delete { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 45%, var(--divider-color)); }
    /* Wifi command press glow — a soft one-shot primary-color ring on
       the device card (list view) or the slot tile (detail view) when
       the matching command is pressed on the physical remote. Same
       720ms timing as the dock wipe and the same color language, so
       the three signals read as one feature. */
    .wifi-ir-flash {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      box-shadow:
        inset 0 0 0 2px color-mix(in srgb, var(--primary-color) 75%, transparent),
        inset 0 0 14px color-mix(in srgb, var(--primary-color) 22%, transparent),
        0 0 14px color-mix(in srgb, var(--primary-color) 30%, transparent);
      opacity: 0;
      animation: wifiIrGlow 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards;
    }
    @keyframes wifiIrGlow {
      0% { opacity: 0; }
      18% { opacity: 1; }
      80% { opacity: 0.7; }
      100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .wifi-ir-flash { animation: none; opacity: 0; }
    }
    .device-card:hover, .back-btn:hover, .list-action-btn:hover, .detail-sync-btn:hover, .device-delete-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .device-card-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
    .device-card-lead { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .device-card-lead ha-icon { --mdc-icon-size: 20px; }
    .device-card-name { flex: 1; font-size: 13px; font-weight: 700; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .device-card-meta { font-size: 12px; color: var(--secondary-text-color); display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; margin-left: auto; flex-shrink: 0; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 700; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); white-space: nowrap; flex: 0 0 auto; }
    .status-pill.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); color: #2e7d32; }
    .status-pill.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); color: var(--error-color, #db4437); }
    .status-pill.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); color: var(--primary-color); }
    .status-pill.sync-pending { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 40%, var(--divider-color)); color: var(--warning-color, #f59e0b); }
    .status-pill.sync-ok { background: color-mix(in srgb, #48b851 16%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-error { background: color-mix(in srgb, var(--error-color, #db4437) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-running { background: color-mix(in srgb, var(--primary-color) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-pending { background: color-mix(in srgb, var(--warning-color, #f59e0b) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill ha-icon { --mdc-icon-size: 18px; }
    .device-status-pill { min-width: 0; }
    .device-status-pill-label { min-width: 0; }
    .device-card-count { white-space: nowrap; font-size: 12px; color: var(--primary-text-color); flex-shrink: 0; }
    .device-card-count-strong { font-weight: 700; }
    .device-card-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: 4px; }
    .device-delete-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; color: var(--secondary-text-color); flex: 0 0 auto; }
    .device-delete-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
      background: transparent;
    }
    .device-delete-btn:disabled:hover {
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .list-action-btn:disabled,
    .detail-sync-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .list-action-btn:disabled:hover,
    .detail-sync-btn:disabled:hover {
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .detail-sync-btn.detail-sync-btn--state-ok {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    .detail-sync-btn.detail-sync-btn--state-ok:disabled {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    .empty-state-card { border: 1px dashed var(--divider-color); border-radius: var(--tools-radius-md); padding: 18px; color: var(--secondary-text-color); line-height: 1.5; }
    .device-power-lines { margin-bottom: 2px; }
    .device-power-options { display: grid; gap: 8px; }
    .device-power-option {
      border: 1px solid var(--divider-color);
      border-radius: var(--tools-radius-sm);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .device-power-option:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .device-power-option.active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
      color: var(--primary-color);
    }
    .hub-events { display: grid; gap: 6px; margin-top: 6px; }
    .hub-event-lines { list-style: none; margin: 2px 0 0; padding: 0; display: grid; gap: 6px; }
    .hub-event-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 13px; line-height: 1.5; color: var(--primary-text-color); }
    .hub-event-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; align-self: center; }
    .hub-event-icon ha-icon { --mdc-icon-size: 16px; }
    .hub-event-icon.power-on { color: #2e7d32; }
    .hub-event-icon.power-off { color: #c62828; }
    .hub-event-action-link:disabled { cursor: default; opacity: 0.5; color: var(--secondary-text-color); }
    .hub-event-clear:disabled { cursor: default; opacity: 0.42; }
    .hub-event-text { min-width: 0; }
    .hub-event-action-link {
      display: inline;
      border: 0;
      background: transparent;
      padding: 0;
      margin: 0;
      font: inherit;
      font-weight: 700;
      font-style: italic;
      color: var(--primary-text-color);
      cursor: pointer;
      text-decoration: underline dotted;
      text-underline-offset: 3px;
    }
    .hub-event-action-link:hover { color: var(--primary-color); }
    .hub-event-clear {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      width: 18px;
      height: 18px;
      margin-left: 4px;
      padding: 0;
      border: 1px solid var(--divider-color);
      border-radius: 50%;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .hub-event-clear:hover { border-color: var(--primary-color); color: var(--primary-text-color); }
    .hub-event-clear ha-icon { --mdc-icon-size: 12px; }
    @media (max-width: 640px) {
      .hub-event-lines { gap: 10px; }
      /* Multi-line sentences: pin the icon to the first text line so the
         wrapped text hangs cleanly next to it, and give the inline action
         link / clear button finger-sized targets. */
      .hub-event-line { align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.65; }
      .hub-event-icon { align-self: flex-start; margin-top: 3px; }
      .hub-event-icon ha-icon { --mdc-icon-size: 18px; }
      .hub-event-action-link { padding: 2px 0; text-underline-offset: 4px; }
      .hub-event-clear { width: 24px; height: 24px; margin-left: 6px; }
      .hub-event-clear ha-icon { --mdc-icon-size: 14px; }
      .device-power-lines { padding: 2px 2px 0; }
    }
    .bottom-dock-status {
      width: 100%;
      min-height: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border: 0;
      border-radius: 0;
      background: var(--ha-card-background, var(--card-background-color));
      padding: 10px 16px;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 14px;
      line-height: 1.35;
      text-align: center;
    }
    .bottom-dock-status > span:last-child { min-width: 0; }
    .dock-status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 auto;
      background: color-mix(in srgb, var(--divider-color) 78%, var(--secondary-text-color));
    }
    .dock-status-indicator.status-success { background: #48b851; }
    .dock-status-indicator.status-warning { background: var(--warning-color, #f59e0b); }
    .dock-status-indicator.status-error { background: var(--error-color, #db4437); }
    .dock-status-indicator.status-progress { background: var(--primary-color); }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .blocked-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .blocked-state-title {
      color: var(--primary-text-color);
      font-size: 16px;
      font-weight: 700;
    }
    .blocked-state-sub {
      max-width: 340px;
      font-size: 13px;
    }
    .acc-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .section-title-wrap { display: flex; align-items: center; gap: 8px; }
    .section-subtitle, .dialog-note, .dialog-footer-note, .slot-confirm-sub, .sync-message, .sync-warning-text, .empty-hint { color: var(--secondary-text-color); }
    .section-subtitle { font-size: 13px; line-height: 1.5; }
    .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-lg); background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 82%, transparent); }
    .sync-row.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); }
    .sync-row.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); }
    .sync-row.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); }
    .sync-message-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
    .sync-message { font-size: 13px; line-height: 1.4; }
    .sync-doc-link { color: var(--primary-color); font-weight: 600; text-decoration: none; }
    .sync-doc-link:hover { text-decoration: underline; }
    .list-view .sticky-footer { border-top: none; }
    .wifi-max-devices-note { display: flex; justify-content: center; padding: 8px 16px 4px; font-size: 13px; color: var(--secondary-text-color); }
    .sync-btn, .dialog-btn, .slot-action-btn, .sync-static { border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); padding: 8px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .sync-btn, .dialog-btn, .slot-action-btn, .activity-chip, .checkbox-row, .slot-btn, .icon-btn, .action-tab { cursor: pointer; }
    .sync-btn:hover, .dialog-btn:hover, .slot-action-btn:hover, .activity-chip:hover, .action-tab:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .sync-btn-primary, .dialog-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .sync-static { opacity: 0.65; cursor: default; }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-md); min-height: 108px; cursor: pointer; padding: 0; text-align: left; display: flex; flex-direction: column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
    .slot-btn:hover { border-color: var(--primary-color); }
    .slot-btn.slot-empty .slot-main { gap: 12px; align-items: center; justify-content: center; flex-direction: column; min-height: 100%; width: 100%; padding: 0; text-align: center; }
    .slot-btn.slot-confirming {
      justify-content: center;
      padding: 0px 12px;
      gap: 6px;
      min-height: 0;
      height: 100%;
    }
    .slot-main { position: relative; display: flex; align-items: flex-start; gap: 8px; padding: 14px 12px 10px; min-width: 0; width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; }
    .slot-name, .dialog-title, .slot-confirm-title { color: var(--primary-text-color); font-weight: 700; }
    .slot-name { font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
    .slot-text-wrap { min-width: 0; flex: 1; text-align: left; }
    .slot-meta { margin-top: 3px; font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
    .slot-favorite { color: var(--error-color); display: inline-flex; }
    .slot-favorite ha-icon { --mdc-icon-size: 14px; }
    .slot-meta-icon { color: var(--state-icon-color); display: inline-flex; }
    .slot-meta-icon.warning { color: var(--error-color, #db4437); }
    .slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
    .slot-actions { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; z-index: 1; }
    .slot-flag,
    .slot-clear { width: 26px; height: 26px; min-width: 26px; border-radius: var(--tools-radius-sm); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; padding: 0; opacity: 0.9; }
    .slot-flag { cursor: default; }
    .slot-flag.power-on { color: #2e7d32; border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color)); }
    .slot-flag.power-off { color: #c62828; border-color: color-mix(in srgb, #c62828 35%, var(--divider-color)); }
    .slot-flag.power-both { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 35%, var(--divider-color)); }
    .slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
    .slot-clear ha-icon { --mdc-icon-size: 16px; }
    .slot-flag ha-icon { --mdc-icon-size: 14px; }
    .slot-clear { cursor: pointer; }
    .slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
    .slot-action-btn:hover { border-color: var(--primary-color); background: var(--ha-card-background, var(--card-background-color)); }
    .slot-action-btn:active { transform: translateY(1px); }
    .slot-confirm-title { font-size: 15px; line-height: 1.2; margin: 0; }
    .slot-confirm-sub { font-size: 12px; line-height: 1.3; margin: 0; }
    .slot-confirm-actions { display: flex; gap: 8px; margin-top: 2px; }
    .slot-btn.slot-confirming .dialog-btn {
      min-height: 40px;
      min-width: 72px;
      padding: 0 10px;
      font-size: 13px;
    }
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--tools-radius-lg); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; flex: 1; }
    .dialog-close,
    .icon-btn {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--divider-color);
      border-radius: var(--tools-radius-sm);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease;
    }
    .dialog-close:hover,
    .icon-btn:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }
    .dialog-close:active,
    .icon-btn:active {
      transform: translateY(1px);
    }
    .dialog-close:focus-visible,
    .icon-btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent);
    }
    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      /* Match the remote card's HA form theming fix. HA frontend controls can
         fall back to a light default when --ha-color-form-background is absent. */
      --ha-color-form-background: var(
        --input-fill-color,
        var(
          --secondary-background-color,
          color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black)
        )
      );
      --ha-color-form-background-hover: var(--ha-color-form-background);
    }
    .dialog-note {
      border: 1px solid color-mix(in srgb, var(--info-color, var(--primary-color)) 42%, var(--divider-color));
      border-radius: var(--tools-radius-md);
      padding: 12px;
      background: color-mix(in srgb, var(--info-color, var(--primary-color)) 12%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
      line-height: 1.45;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .dialog-note::before {
      content: "";
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--info-color, var(--primary-color)) 22%, transparent);
      flex: 0 0 18px;
      margin-top: 1px;
    }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .dialog-footer-note { min-height: 18px; font-size: 13px; color: var(--error-color, #db4437); }
    .config-block { display: grid; gap: 14px; }
    .config-group { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-md); background: color-mix(in srgb, var(--ha-card-background, transparent) 92%, #000); }
    .advanced-toggle { width: fit-content; border: 0; background: transparent; color: var(--secondary-text-color); padding: 0; display: inline-flex; align-items: center; gap: 6px; text-align: left; font: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
    .advanced-toggle:hover { color: var(--primary-text-color); }
    .advanced-toggle-copy { display: block; }
    .advanced-toggle ha-icon { --mdc-icon-size: 18px; transition: transform 120ms ease; }
    .advanced-toggle.expanded ha-icon { transform: rotate(180deg); }
    .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
    .checkbox-row { width: 100%; box-sizing: border-box; border: 0; background: transparent; padding: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 2px; font-size: 13px; cursor: pointer; color: inherit; text-align: left; }
    .checkbox-row[disabled] { cursor: default; opacity: 0.6; }
    .checkbox-row.active .checkbox-icon { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
    .checkbox-left { display: contents; }
    .checkbox-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; text-align: left; }
    .checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display: flex; align-items: center; justify-content: center; transition: background-color 120ms ease, border-color 120ms ease; }
    .checkbox-icon ha-icon { --mdc-icon-size: 16px; }
    .checkbox-icon.input { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, var(--ha-card-background, transparent)); }
    .checkbox-copy > span:first-child { font-size: 14px; line-height: 1.35; }
    .checkbox-subtext { min-height: 1.35em; font-size: 12px; line-height: 1.35; color: var(--secondary-text-color); white-space: normal; }
    .button-conflict-hint { font-size: 12px; line-height: 1.35; color: var(--warning-color, var(--secondary-text-color)); padding: 2px 0 4px; }
    .checkbox-row ha-switch { align-self: center; }
    .checkbox-row.nested-control { padding-left: 36px; }
    .input-selector-wrap.nested-control { box-sizing: border-box; padding-left: 36px; }
    .activities-label, .warning-label, .action-helper { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); }
    .activities-label.disabled { opacity: 0.55; }
    .input-selector-wrap[disabled] { opacity: 0.6; pointer-events: none; }
    .activity-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .activity-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; font: inherit; }
    .activity-chip.active, .action-tab.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); color: var(--primary-color); }
    .activity-chip.disabled,
    .activity-chip:disabled,
    .activity-chip.disabled.active,
    .activity-chip:disabled.active {
      opacity: 0.45;
      cursor: default;
      border-color: var(--divider-color);
      background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000);
      color: inherit;
      pointer-events: none;
    }
    .activity-chip.disabled:hover,
    .activity-chip:disabled:hover,
    .activity-chip.disabled.active:hover,
    .activity-chip:disabled.active:hover {
      border-color: var(--divider-color);
      background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000);
      color: inherit;
    }
    .action-tabs { display: flex; gap: 8px; }
    .action-tab { border: 1px solid var(--divider-color); border-radius: 999px; padding: 7px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .action-selector-wrap[hidden] { display: none; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--primary-text-color); }
    .warning-optout { display: flex; align-items: center; gap: 10px; }
    .dialog-body ha-input,
    .dialog-body ha-textfield,
    .dialog-body ha-selector {
      width: 100%;
      --mdc-select-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-select-hover-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-select-idle-line-color: var(--divider-color);
      --mdc-select-hover-line-color: var(--primary-color);
      --mdc-select-focused-line-color: var(--primary-color);
      --mdc-select-label-ink-color: var(--secondary-text-color);
      --mdc-select-ink-color: var(--primary-text-color);
      --mdc-theme-on-surface: var(--primary-text-color);
      --mdc-theme-text-primary-on-background: var(--primary-text-color);
      --mdc-theme-primary: var(--primary-color);
    }
    .dialog-body ha-input {
      --ha-input-padding-top: 0;
      --ha-input-padding-bottom: 0;
    }
    @media (max-width: 640px) {
      .command-grid { grid-template-columns: 1fr; }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small { width: 100%; max-height: 100%; border-radius: 0 0 var(--tools-radius-lg) var(--tools-radius-lg); }
      .dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
      .list-header { grid-template-columns: 1fr; }
      .list-header-action { grid-column: 1; grid-row: auto; width: 100%; }
      .list-header-action > .detail-sync-btn,
      .list-header-action > .list-action-btn { width: 100%; justify-content: center; }
      .detail-title-row { gap: 8px; }
      .detail-title-main { min-width: 0; flex: 1; }
      .detail-title-actions { gap: 6px; min-width: max-content; }
      .detail-sync-btn, .list-action-btn { flex: 0 0 auto; white-space: nowrap; }
      .device-card { align-items: center; gap: 10px; padding: 10px 12px; }
      .device-card-main { align-items: center; flex-direction: row; gap: 10px; }
      .device-card-name { flex: 1; }
      .device-card-meta { margin-left: auto; flex-wrap: nowrap; gap: 8px; }
      .device-card-count { font-size: 12px; }
      .device-status-pill { padding: 6px; min-width: 32px; justify-content: center; }
      .device-status-pill-label { display: none; }
      .sync-row { align-items: flex-start; flex-direction: column; }
    }
  `];

  declare hass: HassLike | null;
  declare hub: ControlPanelHubState | null;
  setHubCommandBusy?: ((busy: boolean, label?: string | null, entryId?: string) => void) | null;
  refreshControlPanelState?: (() => Promise<void> | void) | null;
  hubCommandBusy = false;
  hubCommandBusyLabel: string | null = null;
  declare loading: boolean;
  declare error: string | null;
  blockedTitle: string | null = null;
  blockedMessage: string | null = null;
  lastWifiPress: WifiPressEvent | null = null;
  private _irFlashClearTimer: ReturnType<typeof setTimeout> | null = null;
  private _irFlashClearForReceivedAt: number | null = null;

  private _commandsData: WifiCommandSlot[] = this._normalizeCommandsForStorage([]);
  private _wifiDevices: WifiDeviceSummary[] = [];
  private _selectedDeviceKey: string | null = null;
  private _configLoadedForEntryId: string | null = null;
  private _commandConfigLoading = false;
  private _deviceListLoading = false;
  private _syncState: SyncState = this._defaultSyncState();
  private _commandSyncLoading = false;
  private _commandSyncRunning = false;
  private _commandSyncDeviceKey: string | null = null;
  private _commandSyncPollTimer: number | null = null;
  private _activeCommandSlot: number | null = null;
  private _activeCommandModal: ActiveModal = null;
  private _confirmClearSlot: number | null = null;
  private _commandSaveError = "";
  private _activeCommandActionTab: PressType = "short";
  private _syncWarningOpen = false;
  private _syncWarningOptOut = false;
  private _advancedOptionsOpen = false;
  private _commandEditorDrafts: Record<number, WifiCommandSlot> = {};
  private _shortSelectorVersion = 0;
  private _longSelectorVersion = 0;
  private _createDeviceModalOpen = false;
  private _newDeviceName = "";
  private _deviceMutationError = "";
  private _deleteDeviceKey: string | null = null;
  private _deletingDeviceKey: string | null = null;
  private _creatingDevice = false;
  private _maxWifiDevices = 5;
  private _hubEventActions: Record<HubEventKey, WifiCommandAction> = this._defaultHubEventActions();
  private _devicePowerPickerKind: "on" | "off" | null = null;
  private _activeHubEventKey: HubEventKey | null = null;
  private _hubEventDraft: WifiCommandAction | null = null;
  private _hubEventSelectorVersion = 0;
  private _hubEventSaveError = "";
  private _hubEventActionsLoading = false;
  private _deviceSessionRestoreTried = false;
  connectedCallback() {
    super.connectedCallback();
    void this._ensureLoadedForCurrentHub();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearPollTimer();
    if (this._irFlashClearTimer) {
      clearTimeout(this._irFlashClearTimer);
      this._irFlashClearTimer = null;
      this._irFlashClearForReceivedAt = null;
    }
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) this._deviceSessionRestoreTried = false;
    if (changed.has("hub") || changed.has("hass")) void this._ensureLoadedForCurrentHub();
    if (changed.has("hub") || changed.has("_selectedDeviceKey")) this._persistSelectedDeviceSession();
    this._scheduleSyncPoll();
    this.renderRoot
      .querySelectorAll<HTMLElement>("ha-selector[data-hide-action-type='1']")
      .forEach((element) => this._hideUiActionTypeSelector(element));
  }

  private _useLegacyTextField() {
    return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
  }

  protected render() {
    if (this.loading) return html`<div class="state">Loading...</div>`;
    if (this.error) return html`<div class="state error">${this.error}</div>`;
    if (!this.hub) return html`<div class="state">No hubs found.</div>`;
    if (this.blockedTitle && this.blockedMessage) {
      return html`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">${this.blockedTitle}</div>
            <div class="blocked-state-sub">${this.blockedMessage}</div>
          </div>
        </div>
      `;
    }

    const selectedDevice = this._selectedWifiDevice();
    if (!selectedDevice) {
      return html`
        <div class="tab-panel">
          ${renderSecondaryTabShell({
            connected: true,
            items: [...WIFI_SECTION_ROW],
            selectedId: "wifi",
            shellClassName: "secondary-view-shell--edge",
            content: renderSecondaryViewBody({
              connected: true,
              padded: false,
              scroll: false,
              className: "list-view",
              content: this._renderDeviceListView(),
            }),
          })}
          ${this._renderDetailsModal()}
          ${this._renderActionModal()}
          ${this._renderSyncWarningModal()}
          ${this._renderCreateDeviceModal()}
          ${this._renderDeleteDeviceModal()}
          ${this._renderHubEventActionModal()}
        </div>
      `;
    }
    const remoteUnavailable = this._remoteUnavailable();
    const syncRunning = this._syncState.status === "running";

    return this._renderSelectedDeviceView({
      selectedDevice,
      remoteUnavailable,
      syncRunning,
    });
  }

  private _renderSelectedDeviceView({
    selectedDevice,
    remoteUnavailable,
    syncRunning,
  }: {
    selectedDevice: WifiDeviceSummary;
    remoteUnavailable: boolean;
    syncRunning: boolean;
  }) {
    const externallyLocked = this._hubCommandLocked() && !this._selectedDeviceOwnsPendingSync();
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._goBackToDeviceList}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title">${selectedDevice.device_name}</div>
              </div>
              <div class="detail-title-actions">
                ${this._renderSyncActionButton({ remoteUnavailable, syncRunning, externallyLocked })}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            ${remoteUnavailable
              ? nothing
              : syncRunning
                ? renderOperationProgress({
                    mode: "wifi-deploy",
                    title: TOOLS_CARD_STRINGS.wifiCommands.deployingTitle,
                    message: String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncInProgress),
                  })
                : html`
                    ${this._renderDevicePowerRows()}
                    <div class="command-grid">
                      ${(() => {
                        const press = this._activeWifiPressFlash();
                        return this._commandsList().map((command, idx) => this._renderSlot(command, idx, press));
                      })()}
                    </div>
                  `}
          </div>
        </div>
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderCreateDeviceModal()}
        ${this._renderDeleteDeviceModal()}
        ${this._renderDevicePowerPickerModal()}
      </div>
    `;
  }

  private _renderDeviceListView() {
    const canAdd = this._wifiDevices.length < this._maxWifiDevices;
    const irFlash = this._activeWifiPressFlash();
    return html`
      <div class="list-scroll">
        <div class="list-header">
          <div class="list-header-copy">
            <div class="section-subtitle">${TOOLS_CARD_STRINGS.wifiCommands.sectionSubtitle}</div>
          </div>
          <div class="list-header-action">
            <button class="detail-sync-btn" ?disabled=${!canAdd || this._hubCommandLocked() || this._creatingDevice} @click=${this._openCreateDeviceModal}>
              ${TOOLS_CARD_STRINGS.wifiCommands.addDevice}
            </button>
          </div>
        </div>
        ${this._wifiDevices.length ? html`
          <div class="device-list">
            ${this._wifiDevices.map((device) => html`
              <div
                class="device-card ${device.device_key === this._deletingDeviceKey ? "pending-delete" : ""}"
                role="button"
                tabindex=${this._deletingDeviceKey === device.device_key ? -1 : 0}
                aria-disabled=${String(device.device_key === this._deletingDeviceKey)}
                @click=${device.device_key === this._deletingDeviceKey ? null : () => this._selectWifiDevice(device.device_key)}
                @keydown=${device.device_key === this._deletingDeviceKey ? null : ((event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._selectWifiDevice(device.device_key); } })}
              >
                <div class="device-card-main">
                  <span class="device-card-lead"><ha-icon icon="mdi:wifi"></ha-icon></span>
                  <div class="device-card-name">${device.device_name}</div>
                  <div class="device-card-meta">
                    <span class="status-pill device-status-pill ${this._deviceStatusTone(device)}">
                      <ha-icon icon=${this._deviceStatusIcon(device)}></ha-icon>
                      <span class="device-status-pill-label">${this._deviceStatusLabel(device)}</span>
                    </span>
                    <span class="device-card-count"><span class="device-card-count-strong">${Number(device.configured_slot_count || 0)}</span> slot${Number(device.configured_slot_count || 0) === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div class="device-card-actions">
                  <button class="device-delete-btn" title="Delete Wifi Device" ?disabled=${this._hubCommandLocked() || device.device_key === this._deletingDeviceKey} @click=${(event: Event) => this._promptDeleteDevice(device.device_key, event)}>
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                </div>
                ${irFlash && this._pressMatchesDevice(irFlash, device)
                  ? keyed(irFlash.receivedAt, html`<div class="wifi-ir-flash" aria-hidden="true"></div>`)
                  : nothing}
              </div>
            `)}
          </div>
        ` : html`<div class="empty-state-card">No Wifi Devices configured yet. Add one to start assigning command slots.</div>`}
        ${this._renderHubEventsSection()}
        <div class="sticky-footer">
          ${!canAdd ? html`<div class="wifi-max-devices-note">Maximum number of devices reached</div>` : nothing}
        </div>
      </div>
    `;
  }

  private _configuredCommandOptions() {
    return this._commandsList()
      .map((command, idx) => ({ command, idx }))
      .filter(({ command, idx }) => this._isCommandConfigured(command, idx))
      .map(({ command, idx }) => ({
        value: String(idx + 1),
        label: String(command.name || "").trim() || `Command ${idx + 1}`,
      }));
  }

  private _devicePowerSelectorValue(kind: "on" | "off") {
    const flagKey = kind === "on" ? "is_power_on" : "is_power_off";
    const idx = this._commandsList().findIndex((command) => Boolean(command[flagKey]));
    return idx >= 0 ? String(idx + 1) : "__none__";
  }

  private async _setDevicePowerTarget(kind: "on" | "off", targetIdx: number) {
    const flagKey = kind === "on" ? "is_power_on" : "is_power_off";
    if (this._devicePowerSelectorValue(kind) === (targetIdx >= 0 ? String(targetIdx + 1) : "__none__")) return;
    const next = this._commandsList().map((command, idx) => {
      if (idx === targetIdx) {
        // Power and Activity-input roles stay mutually exclusive (matches the
        // previous editor behavior where enabling one cleared the other).
        return this._cloneCommandSlot({ ...command, [flagKey]: true, input_activity_id: "" });
      }
      return command[flagKey] ? this._cloneCommandSlot({ ...command, [flagKey]: false }) : command;
    });
    await this._setCommands(next);
  }

  private _devicePowerCommandName(kind: "on" | "off") {
    const value = this._devicePowerSelectorValue(kind);
    if (value === "__none__") return "";
    const option = this._configuredCommandOptions().find((item) => item.value === value);
    return option?.label || `Command ${value}`;
  }

  private _closeDevicePowerPicker = () => {
    this._devicePowerPickerKind = null;
  };

  private _devicePowerRowDefs() {
    return [
      { kind: "on" as const, label: TOOLS_CARD_STRINGS.wifiCommands.devicePowerOnLabel },
      { kind: "off" as const, label: TOOLS_CARD_STRINGS.wifiCommands.devicePowerOffLabel },
    ];
  }

  private _renderDevicePowerRows() {
    if (!this._supportsPowerInputConfig()) return nothing;
    const disabled = this._hubCommandLocked();
    return html`
      <ul class="hub-event-lines device-power-lines">
        ${this._devicePowerRowDefs().map(({ kind, label }) => {
          const commandName = this._devicePowerCommandName(kind);
          const configured = Boolean(commandName);
          return html`
            <li class="hub-event-line">
              <span class="hub-event-icon ${kind === "on" ? "power-on" : "power-off"}"><ha-icon icon="mdi:power"></ha-icon></span>
              <span class="hub-event-text">
                ${label},
                <button
                  class="hub-event-action-link"
                  ?disabled=${disabled}
                  @click=${() => { this._devicePowerPickerKind = kind; }}
                >
                  ${configured
                    ? TOOLS_CARD_STRINGS.wifiCommands.devicePowerPerform(commandName)
                    : TOOLS_CARD_STRINGS.wifiCommands.hubEventDoNothing}</button>${configured ? html`<button
                      class="hub-event-clear"
                      title=${TOOLS_CARD_STRINGS.wifiCommands.hubEventClearTitle}
                      ?disabled=${disabled}
                      @click=${() => { void this._setDevicePowerTarget(kind, -1); }}
                    ><ha-icon icon="mdi:close"></ha-icon></button>` : nothing}.
              </span>
            </li>
          `;
        })}
      </ul>
    `;
  }

  private _renderDevicePowerPickerModal() {
    if (!this._supportsPowerInputConfig()) return nothing;
    const kind = this._devicePowerPickerKind;
    if (!kind) return nothing;
    const row = this._devicePowerRowDefs().find((item) => item.kind === kind);
    if (!row) return nothing;
    const current = this._devicePowerSelectorValue(kind);
    const pick = async (targetIdx: number) => {
      this._devicePowerPickerKind = null;
      await this._setDevicePowerTarget(kind, targetIdx);
    };
    return html`
      <div class="modal-backdrop" @click=${this._closeDevicePowerPicker}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${row.label}</div>
            <button class="dialog-close" @click=${this._closeDevicePowerPicker}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">${TOOLS_CARD_STRINGS.wifiCommands.devicePowerHint}</div>
            <div class="device-power-options">
              <button class="device-power-option ${current === "__none__" ? "active" : ""}" @click=${() => { void pick(-1); }}>
                ${TOOLS_CARD_STRINGS.wifiCommands.devicePowerNothing}
              </button>
              ${this._configuredCommandOptions().map((option) => html`
                <button class="device-power-option ${current === option.value ? "active" : ""}" @click=${() => { void pick(Number(option.value) - 1); }}>
                  ${option.label}
                </button>
              `)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _defaultHubEventActions(): Record<HubEventKey, WifiCommandAction> {
    return {
      power_off: { ...DEFAULT_ACTION },
      redundant_off: { ...DEFAULT_ACTION },
      activity_start: { ...DEFAULT_ACTION },
    };
  }

  private async _loadHubEventActions(force = false) {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    if (this._hubEventActionsLoading && !force) return;
    this._hubEventActionsLoading = true;
    try {
      const result = await this.hass.callWS<{ actions?: Record<string, unknown> }>({
        type: "sofabaton_x1s/hub_event_actions/get",
        entity_id: entityId,
      });
      const raw = result?.actions || {};
      this._hubEventActions = {
        power_off: this._normalizeCommandAction(raw.power_off),
        redundant_off: this._normalizeCommandAction(raw.redundant_off),
        activity_start: this._normalizeCommandAction(raw.activity_start),
      };
    } catch (_error) {
      this._hubEventActions = this._defaultHubEventActions();
    } finally {
      this._hubEventActionsLoading = false;
    }
  }

  private _hubEventActionText(action: WifiCommandAction) {
    if (!this._commandHasCustomAction(action)) return TOOLS_CARD_STRINGS.wifiCommands.hubEventDoNothing;
    return TOOLS_CARD_STRINGS.wifiCommands.hubEventPerform(this._commandActionDetails(action).service);
  }

  private async _resetHubEventAction(key: HubEventKey) {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    const nextActions = { ...this._hubEventActions, [key]: { ...DEFAULT_ACTION } };
    try {
      const result = await this.hass.callWS<{ actions?: Record<string, unknown> }>({
        type: "sofabaton_x1s/hub_event_actions/set",
        entity_id: entityId,
        actions: nextActions,
      });
      const raw = result?.actions || nextActions;
      this._hubEventActions = {
        power_off: this._normalizeCommandAction(raw.power_off),
        redundant_off: this._normalizeCommandAction(raw.redundant_off),
        activity_start: this._normalizeCommandAction(raw.activity_start),
      };
    } catch (_error) {
      // Keep the current state if the reset fails; the editor still works.
    }
  }

  private _openHubEventEditor(key: HubEventKey) {
    this._activeHubEventKey = key;
    this._hubEventDraft = this._normalizeCommandAction(this._hubEventActions[key]);
    this._hubEventSaveError = "";
    this._hubEventSelectorVersion += 1;
  }

  private _closeHubEventEditor = () => {
    this._activeHubEventKey = null;
    this._hubEventDraft = null;
    this._hubEventSaveError = "";
  };

  private _saveHubEventAction = async () => {
    const key = this._activeHubEventKey;
    const entityId = String(this._entityId() || "").trim();
    if (!key || !entityId || !this.hass?.callWS) return;
    const nextActions = {
      ...this._hubEventActions,
      [key]: this._normalizeCommandAction(this._hubEventDraft),
    };
    try {
      const result = await this.hass.callWS<{ actions?: Record<string, unknown> }>({
        type: "sofabaton_x1s/hub_event_actions/set",
        entity_id: entityId,
        actions: nextActions,
      });
      const raw = result?.actions || nextActions;
      this._hubEventActions = {
        power_off: this._normalizeCommandAction(raw.power_off),
        redundant_off: this._normalizeCommandAction(raw.redundant_off),
        activity_start: this._normalizeCommandAction(raw.activity_start),
      };
      this._closeHubEventEditor();
    } catch (error) {
      this._hubEventSaveError = String((error as Error)?.message || "Unable to save Action");
    }
  };

  private _renderHubEventsSection() {
    return html`
      <div class="hub-events">
        <div class="section-title-wrap">
          <div class="acc-title">${TOOLS_CARD_STRINGS.wifiCommands.hubEventsTitle}</div>
        </div>
        <div class="section-subtitle">${TOOLS_CARD_STRINGS.wifiCommands.hubEventsSubtitle}</div>
        <ul class="hub-event-lines">
          ${HUB_EVENT_ROWS.map((row) => {
            const action = this._hubEventActions[row.key];
            const configured = this._commandHasCustomAction(action);
            return html`
              <li class="hub-event-line">
                <span class="hub-event-icon"><ha-icon icon=${row.icon}></ha-icon></span>
                <span class="hub-event-text">
                  ${row.label},
                  <button class="hub-event-action-link" @click=${() => this._openHubEventEditor(row.key)}>
                    ${this._hubEventActionText(action)}</button>${configured ? html`<button
                        class="hub-event-clear"
                        title=${TOOLS_CARD_STRINGS.wifiCommands.hubEventClearTitle}
                        @click=${() => { void this._resetHubEventAction(row.key); }}
                      ><ha-icon icon="mdi:close"></ha-icon></button>` : nothing}.
                </span>
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }

  private _renderHubEventActionModal() {
    const key = this._activeHubEventKey;
    if (!key) return nothing;
    const row = HUB_EVENT_ROWS.find((item) => item.key === key);
    if (!row) return nothing;
    return html`
      <div class="modal-backdrop" @click=${this._closeHubEventEditor}>
        <div class="dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${row.label}</div>
            <button class="dialog-close" @click=${this._closeHubEventEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">${TOOLS_CARD_STRINGS.wifiCommands.hubEventModalNote}</div>
            <div class="config-block">
              <div class="action-helper">${TOOLS_CARD_STRINGS.wifiCommands.selectTriggeredAction}</div>
              <div class="action-selector-wrap">
                ${keyed(this._hubEventSelectorVersion, html`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${TOOLS_CARD_STRINGS.wifiCommands.action}
                    .value=${this._normalizeCommandAction(this._hubEventDraft)}
                    @value-changed=${(event: CustomEvent) => {
                      this._hubEventDraft = this._normalizeCommandAction(event.detail?.value);
                      this._hubEventSaveError = "";
                    }}
                  ></ha-selector>
                `)}
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._hubEventSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeHubEventEditor}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveHubEventAction}>${TOOLS_CARD_STRINGS.wifiCommands.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderCreateDeviceModal() {
    if (!this._createDeviceModalOpen) return nothing;
    return html`
      <div class="modal-backdrop" @click=${this._closeCreateDeviceModal}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.addDevice}</div>
            <button class="dialog-close" @click=${this._closeCreateDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._useLegacyTextField()
              ? html`
                  <ha-textfield
                    id="sb-new-device-name"
                    .label=${"Device name"}
                    .maxLength=${20}
                    .value=${this._newDeviceName}
                    .disabled=${this._creatingDevice}
                    @input=${(event: Event) => {
                      const input = event.currentTarget as HTMLElement & { value: string };
                      const value = this._sanitizeWifiDeviceName(input.value);
                      input.value = value;
                      this._newDeviceName = value;
                      this._deviceMutationError = "";
                    }}
                    @change=${(event: Event) => {
                      const input = event.currentTarget as HTMLElement & { value: string };
                      const value = this._sanitizeWifiDeviceName(input.value);
                      input.value = value;
                      this._newDeviceName = value;
                      this._deviceMutationError = "";
                    }}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void this._createWifiDevice(); } }}
                  ></ha-textfield>
                `
              : html`
                  <ha-input
                    id="sb-new-device-name"
                    type="text"
                    .label=${"Device name"}
                    .maxlength=${20}
                    .value=${this._newDeviceName}
                    .disabled=${this._creatingDevice}
                    @input=${(event: Event) => {
                      const input = event.currentTarget as HTMLElement & { value: string };
                      const value = this._sanitizeWifiDeviceName(input.value);
                      input.value = value;
                      this._newDeviceName = value;
                      this._deviceMutationError = "";
                    }}
                    @change=${(event: Event) => {
                      const input = event.currentTarget as HTMLElement & { value: string };
                      const value = this._sanitizeWifiDeviceName(input.value);
                      input.value = value;
                      this._newDeviceName = value;
                      this._deviceMutationError = "";
                    }}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void this._createWifiDevice(); } }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" ?disabled=${this._creatingDevice} @click=${this._closeCreateDeviceModal}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" ?disabled=${this._creatingDevice} @click=${this._createWifiDevice}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCreate}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderDeleteDeviceModal() {
    const device = this._wifiDevices.find((item) => item.device_key === this._deleteDeviceKey);
    if (!device) return nothing;
    return html`
      <div class="modal-backdrop" @click=${this._closeDeleteDeviceModal}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.deleteModalTitle}</div>
            <button class="dialog-close" @click=${this._closeDeleteDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">${TOOLS_CARD_STRINGS.wifiCommands.deleteModalBody(device.device_name)}</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteDeviceModal}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._deleteWifiDevice}>${TOOLS_CARD_STRINGS.wifiCommands.deleteModalDelete}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSlot(command: WifiCommandSlot, idx: number, irFlash: WifiPressEvent | null = null) {
    const isConfirming = this._confirmClearSlot === idx;
    const configured = this._isCommandConfigured(command, idx);
    const flashOverlay = irFlash && this._pressMatchesSlot(irFlash, idx)
      ? keyed(irFlash.receivedAt, html`<div class="wifi-ir-flash" aria-hidden="true"></div>`)
      : nothing;
    if (isConfirming) {
      return html`
        <div class="slot-btn slot-confirming">
            <div class="slot-confirm-title">${TOOLS_CARD_STRINGS.wifiCommands.clearSlotTitle}</div>
          <div class="slot-confirm-sub">${TOOLS_CARD_STRINGS.wifiCommands.clearSlotSubtitle}</div>
          <div class="slot-confirm-actions">
            <button class="dialog-btn" @click=${() => { this._confirmClearSlot = null; }}>${TOOLS_CARD_STRINGS.wifiCommands.clearSlotNo}</button>
            <button class="dialog-btn dialog-btn-primary" @click=${() => this._clearSlot(idx)}>${TOOLS_CARD_STRINGS.wifiCommands.clearSlotYes}</button>
          </div>
          ${flashOverlay}
        </div>
      `;
    }

    if (!configured) {
      return html`
        <button class="slot-btn slot-empty" @click=${() => this._openCommandEditor(idx)}>
          <div class="slot-main">
            <div style="font-size:28px;color:var(--secondary-text-color)">+</div>
            <div class="slot-name">${TOOLS_CARD_STRINGS.wifiCommands.makeCommand}</div>
          </div>
          ${flashOverlay}
        </button>
      `;
    }

    const details = this._commandSlotSummaryDetails(command);
    const metaLabel = this._commandSlotMetaLabel(command);
    const unconfiguredCommand = this._isUnconfiguredCommand(command);

    return html`
      <div class="slot-btn">
        <div class="slot-actions">
          ${this._supportsPowerInputConfig() && command.is_power_on && command.is_power_off
            ? html`<span class="slot-flag power-both" title="Power ON and OFF command"><ha-icon icon="mdi:power"></ha-icon></span>`
            : this._supportsPowerInputConfig() && command.is_power_on
              ? html`<span class="slot-flag power-on" title="Power ON command"><ha-icon icon="mdi:power"></ha-icon></span>`
              : this._supportsPowerInputConfig() && command.is_power_off
                ? html`<span class="slot-flag power-off" title="Power OFF command"><ha-icon icon="mdi:power"></ha-icon></span>`
                : nothing}
          ${this._supportsPowerInputConfig() && this._hasInputActivity(command)
            ? html`<span class="slot-flag" title=${this._inputFlagTitle(command)}><ha-icon icon=${INPUT_ICON}></ha-icon></span>`
            : nothing}
          <button class="slot-clear" @click=${(event: Event) => { event.stopPropagation(); this._confirmClearSlot = idx; }}><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <button class="slot-main" @click=${() => this._openCommandEditor(idx)}>
          <span class="slot-text-wrap">
            <span class="slot-name">${String(command.name || "").trim() || `Command ${idx + 1}`}</span>
            <span class="slot-meta">
              ${command.add_as_favorite ? html`<span class="slot-favorite"><ha-icon icon="mdi:heart"></ha-icon></span>` : nothing}
              ${command.hard_button ? html`<span class="slot-meta-icon"><ha-icon icon=${this._commandSlotIcon(command.hard_button)} style=${this._commandSlotIconColor(command.hard_button) ? `color:${this._commandSlotIconColor(command.hard_button)}` : ""}></ha-icon></span>` : nothing}
              ${command.long_press_enabled ? html`<span class="slot-meta-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>` : nothing}
              ${unconfiguredCommand ? html`<span class="slot-meta-icon warning"><ha-icon icon="mdi:alert-circle"></ha-icon></span>` : nothing}
              <span>${metaLabel}</span>
            </span>
          </span>
        </button>
        <button class="slot-action-btn" @click=${(event: Event) => { event.stopPropagation(); this._openCommandActionEditor(idx); }}>
          ${details.commandSummary === TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured ? TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured : `> ${details.service}`}
        </button>
        ${flashOverlay}
      </div>
    `;
  }

  private _renderDetailsModal() {
    if (this._activeCommandModal !== "details" || !Number.isInteger(this._activeCommandSlot)) return nothing;
    const draft = this._activeCommandDraft();
    if (!draft) return nothing;
    const slotIndex = Number(this._activeCommandSlot);
    const activities = this._editorActivities();
    const selectedActivities = new Set((draft.activities || []).map((id) => String(id)));
    const hasMappedButton = Boolean(String(draft.hard_button || "").trim());
    const activitySelectionEnabled = this._activitySelectionEnabled(draft);
    const inputSelectionEnabled = this._hasInputActivity(draft);
    const inputActivityValue = this._selectorValueForInputActivity(draft);
    const hasActivities = activities.length > 0;

    return html`
      <div class="modal-backdrop" @click=${this._closeOnBackdrop}>
        <div class="dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.commandSlotTitle(slotIndex)}</div>
            <button class="dialog-close" @click=${this._closeCommandEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Create a Command in this slot. Give it a name and decide which Activities to apply it to. The name will appear on your remote's display, in the mobile app, and as the Wifi Command's sensor status.
            </div>
            <div class="config-block">
              <div class="config-group">
                ${this._useLegacyTextField()
                  ? html`
                      <ha-textfield
                        id="sb-command-display-name"
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.commandDisplayName}
                        .maxLength=${20}
                        .value=${draft.name}
                        @input=${(event: Event) => {
                          const input = event.currentTarget as HTMLElement & { value: string };
                          const value = this._sanitizeCommandName(input.value);
                          if (input.value !== value) input.value = value;
                        }}
                        @change=${(event: Event) => {
                          const input = event.currentTarget as HTMLElement & { value: string };
                          const value = this._sanitizeCommandName(input.value);
                          input.value = value;
                          this._updateActiveCommandDraft({ name: value });
                          this._commandSaveError = "";
                        }}
                      ></ha-textfield>
                    `
                  : html`
                      <ha-input
                        id="sb-command-display-name"
                        type="text"
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.commandDisplayName}
                        .maxlength=${20}
                        .value=${draft.name}
                        @input=${(event: Event) => {
                          const input = event.currentTarget as HTMLElement & { value: string };
                          const value = this._sanitizeCommandName(input.value);
                          if (input.value !== value) input.value = value;
                        }}
                        @change=${(event: Event) => {
                          const input = event.currentTarget as HTMLElement & { value: string };
                          const value = this._sanitizeCommandName(input.value);
                          input.value = value;
                          this._updateActiveCommandDraft({ name: value });
                          this._commandSaveError = "";
                        }}
                      ></ha-input>
                    `}
                ${this._supportsPowerInputConfig() ? html`
                <button
                  class="advanced-toggle ${this._advancedOptionsOpen ? "expanded" : ""}"
                  @click=${() => {
                    this._advancedOptionsOpen = !this._advancedOptionsOpen;
                  }}
                  aria-expanded=${String(this._advancedOptionsOpen)}
                >
                  <span class="advanced-toggle-copy">
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.advanced}</span>
                  </span>
                  <ha-icon icon="mdi:chevron-down"></ha-icon>
                </button>
                ` : nothing}
                ${this._advancedOptionsOpen && this._supportsPowerInputConfig() ? html`
                  <div class="advanced-panel">
                    <button class="checkbox-row ${inputSelectionEnabled ? "active" : ""}" ?disabled=${!hasActivities} @click=${() => {
                      this._toggleInputActivityRow();
                    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon input"><ha-icon icon=${INPUT_ICON}></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>${TOOLS_CARD_STRINGS.wifiCommands.activityInput}</span>
                          <span class="checkbox-subtext">${hasActivities ? this._inputActivityReplacementLabel() : TOOLS_CARD_STRINGS.wifiCommands.noActivitiesForHub}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${inputSelectionEnabled}
                        .disabled=${!hasActivities}
                        @click=${(event: Event) => event.stopPropagation()}
                        @change=${(event: Event) => this._handleInputActivitySwitchChange(event)}
                      ></ha-switch>
                    </button>
                    <div class="input-selector-wrap nested-control" ?disabled=${!inputSelectionEnabled}>
                      <ha-selector
                        .hass=${this.hass}
                        .selector=${{ select: { mode: "dropdown", options: activities.map((activity) => ({ value: String(activity.id), label: activity.name })) } }}
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.activityInputLabel}
                        .value=${inputActivityValue}
                        .disabled=${!inputSelectionEnabled || !hasActivities}
                        @value-changed=${(event: CustomEvent) => this._handleInputActivityChanged(event)}
                      ></ha-selector>
                    </div>
                  </div>
                ` : nothing}
              </div>
              <div class="config-group">
                <button class="checkbox-row ${draft.add_as_favorite ? "active" : ""}" @click=${() => {
                  this._toggleFavoriteRow();
                }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:heart"></ha-icon></span>
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.favorite}</span>
                  </span>
                  <ha-switch
                    .checked=${draft.add_as_favorite}
                    @click=${(event: Event) => event.stopPropagation()}
                    @change=${(event: Event) => this._handleFavoriteSwitchChange(event)}
                  ></ha-switch>
                </button>
                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "None" }, ...this._editorAvailableHardButtonOptions().map((option) => ({ value: option.value, label: option.label }))] } }}
                  .label=${TOOLS_CARD_STRINGS.wifiCommands.physicalButtonAssignment}
                  .value=${this._selectorValueForButton(draft)}
                  @value-changed=${(event: CustomEvent) => this._handleHardButtonChanged(event)}
                ></ha-selector>
                ${this._hardButtonReplacementLabel() ? html`<div class="button-conflict-hint">${this._hardButtonReplacementLabel()}</div>` : nothing}
                <button class="checkbox-row nested-control ${hasMappedButton && draft.long_press_enabled ? "active" : ""}" ?disabled=${!hasMappedButton} @click=${() => {
                  this._toggleLongPressRow();
                }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.enableLongPress}</span>
                  </span>
                  <ha-switch
                    .checked=${hasMappedButton && draft.long_press_enabled}
                    .disabled=${!hasMappedButton}
                    @click=${(event: Event) => event.stopPropagation()}
                    @change=${(event: Event) => this._handleLongPressSwitchChange(event)}
                  ></ha-switch>
                </button>
                <div class="activities-label ${activitySelectionEnabled ? "" : "disabled"}">${TOOLS_CARD_STRINGS.wifiCommands.applyToActivities}</div>
                <div class="activity-chip-row">
                  ${activities.length ? activities.map((activity) => html`
                    <button
                      class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""} ${activitySelectionEnabled ? "" : "disabled"}"
                      ?disabled=${!activitySelectionEnabled}
                      @click=${(event: Event) => this._toggleActivity(activity.id, event)}
                    >
                      ${activity.name}
                    </button>
                  `) : html`<div class="empty-hint">${TOOLS_CARD_STRINGS.wifiCommands.noActivitiesForHub}</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandEditor}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>${TOOLS_CARD_STRINGS.wifiCommands.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderActionModal() {
    if (this._activeCommandModal !== "action" || !Number.isInteger(this._activeCommandSlot)) return nothing;
    const draft = this._activeCommandDraft();
    if (!draft) return nothing;
    const activeTab = this._activeCommandActionTabKey();
    return html`
      <div class="modal-backdrop" @click=${this._closeOnBackdrop}>
        <div class="dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.commandSlotActionTitle(Number(this._activeCommandSlot))}</div>
            <button class="dialog-close" @click=${this._closeCommandActionEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              ${TOOLS_CARD_STRINGS.wifiCommands.actionModalNote}
            </div>
            <div class="config-block">
              ${draft.long_press_enabled ? html`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>${TOOLS_CARD_STRINGS.wifiCommands.shortPress}</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>${TOOLS_CARD_STRINGS.wifiCommands.longPress}</button>
                </div>
              ` : nothing}
              <div class="action-helper">${activeTab === "long" ? TOOLS_CARD_STRINGS.wifiCommands.selectLongPressAction : TOOLS_CARD_STRINGS.wifiCommands.selectTriggeredAction}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${keyed(this._shortSelectorVersion, html`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${TOOLS_CARD_STRINGS.wifiCommands.action}
                    .value=${this._commandActionForPress(draft, "short")}
                    @value-changed=${(event: CustomEvent) => this._handleActionChanged("short", event.detail?.value)}
                  ></ha-selector>
                `)}
              </div>
              <div class="action-selector-wrap" ?hidden=${!draft.long_press_enabled || activeTab !== "long"}>
                ${keyed(this._longSelectorVersion, html`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${TOOLS_CARD_STRINGS.wifiCommands.action}
                    .value=${this._commandActionForPress(draft, "long")}
                    @value-changed=${(event: CustomEvent) => this._handleActionChanged("long", event.detail?.value)}
                  ></ha-selector>
                `)}
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandActionEditor}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>${TOOLS_CARD_STRINGS.wifiCommands.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSyncWarningModal() {
    if (!this._syncWarningOpen) return nothing;
    return html`
      <div class="modal-backdrop" @click=${() => { this._syncWarningOpen = false; }}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.syncWarningTitle}</div>
            <button class="dialog-close" @click=${() => { this._syncWarningOpen = false; }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text sync-warning-text">
              ${TOOLS_CARD_STRINGS.wifiCommands.syncWarningBody}<br /><br />
              ${TOOLS_CARD_STRINGS.wifiCommands.syncWarningBody2}
            </div>
            <label class="warning-optout">
              <input type="checkbox" .checked=${this._syncWarningOptOut} @change=${(event: Event) => { this._syncWarningOptOut = (event.currentTarget as HTMLInputElement).checked; }} />
              <span>${TOOLS_CARD_STRINGS.wifiCommands.syncWarningOptOut}</span>
            </label>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => { this._syncWarningOpen = false; }}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._confirmSyncWarning}>${TOOLS_CARD_STRINGS.wifiCommands.syncWarningStart}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  private async _ensureLoadedForCurrentHub() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || !this.hass?.callWS) return;
    if (this._configLoadedForEntryId !== entryId) {
      this._configLoadedForEntryId = null;
      this._selectedDeviceKey = null;
      this._wifiDevices = [];
      this._commandsData = this._normalizeCommandsForStorage([]);
      this._syncState = this._defaultSyncState();
      this._hubEventActions = this._defaultHubEventActions();
    }
    if (this._configLoadedForEntryId === entryId && !this._deviceListLoading && !this._commandConfigLoading && !this._commandSyncLoading) return;
    const entityId = String(this._entityId() || "").trim();
    const deviceListLoaded = await this._loadWifiDevices(true);
    if (!shouldFinalizeWifiHubLoad({ entryId, entityId, deviceListLoaded })) return;
    await this._loadHubEventActions(true);
    if (!this._deviceSessionRestoreTried && !this._selectedDeviceKey) {
      this._deviceSessionRestoreTried = true;
      this._restoreSelectedDeviceSession();
    }
    if (this._selectedDeviceKey) {
      await this._loadCommandConfigFromBackend(true);
      await this._loadCommandSyncProgress(true);
    }
    this._configLoadedForEntryId = entryId;
  }

  private _deviceSessionStorageKey(): string | null {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId) return null;
    return `${SofabatonWifiCommandsTab._DEVICE_SESSION_KEY_PREFIX}${entryId}`;
  }

  private _persistSelectedDeviceSession() {
    const key = this._deviceSessionStorageKey();
    if (!key) return;
    // Avoid wiping the persisted selection on the first render after a hub
    // change — at that point the in-memory key is still null because the
    // async restore hasn't run yet. Without this guard, a reload while in
    // the detail view always drops the user back on the device list.
    if (!this._deviceSessionRestoreTried && !this._selectedDeviceKey) return;
    try {
      const deviceKey = String(this._selectedDeviceKey || "").trim();
      if (!deviceKey) {
        window.localStorage?.removeItem(key);
        return;
      }
      window.localStorage?.setItem(key, JSON.stringify({
        deviceKey,
        savedAt: Date.now(),
      }));
    } catch {
      // Ignore localStorage failures.
    }
  }

  private _restoreSelectedDeviceSession() {
    const key = this._deviceSessionStorageKey();
    if (!key) return;
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { deviceKey?: unknown };
      const deviceKey = String(parsed?.deviceKey || "").trim();
      if (!deviceKey) {
        window.localStorage?.removeItem(key);
        return;
      }
      if (!this._wifiDevices.some((device) => String(device.device_key || "").trim() === deviceKey)) {
        window.localStorage?.removeItem(key);
        return;
      }
      this._selectedDeviceKey = deviceKey;
    } catch {
      try {
        window.localStorage?.removeItem(key);
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  private _entityId() {
    return entityForHub(this.hass, this.hub);
  }

  private _remoteAttrs() {
    return remoteAttrsForHub(this.hass, this.hub);
  }

  private _remoteUnavailable() {
    const entityId = this._entityId();
    return !!entityId && this.hass?.states?.[entityId]?.state === "unavailable";
  }

  private _hubVersion() {
    return String(this._remoteAttrs()?.hub_version || this.hub?.version || "").toUpperCase();
  }

  private _supportsUnicodeCommandNames() {
    const version = this._hubVersion();
    return version.includes("X2") || version.includes("X1S");
  }

  private _supportsPowerInputConfig() {
    // The X1 hub collapses activity-transition wifi callbacks to a single
    // power-on + input callback regardless of how many callback devices the
    // activity holds (live-hub-testing.md, 2026-07-17), so the power/input
    // configuration is hidden for X1 hubs. Unknown versions keep the full UI.
    const version = this._hubVersion();
    return !(version.includes("X1") && !version.includes("X1S"));
  }

  private _sanitizeCommandName(value: unknown) {
    const pattern = this._supportsUnicodeCommandNames()
      ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu
      : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }

  private _sanitizeWifiDeviceName(value: unknown) {
    return this._sanitizeCommandName(value);
  }

  // entryId is captured by callers when their operation starts so busy
  // set/clear pairs stay scoped to that hub even if the hub picker moves on
  // before the operation's finally runs.
  private _setSharedHubCommandBusy(busy: boolean, label: string | null = null, entryId?: string) {
    const key = (entryId ?? String(this.hub?.entry_id || "")).trim() || undefined;
    this.setHubCommandBusy?.(busy, label, key);
    this.dispatchEvent(new CustomEvent("sofabaton-hub-command-busy-changed", {
      detail: { busy, label, entryId: key ?? null },
      bubbles: true,
      composed: true,
    }));
  }

  private async _refreshControlPanelState() {
    await this.refreshControlPanelState?.();
  }

  private _hubCommandLocked() {
    return Boolean(this.hubCommandBusy || this._runningWifiDevice());
  }

  private _effectiveHubCommandLabel() {
    const runningDevice = this._runningWifiDevice();
    if (runningDevice) {
      const deviceName = String(runningDevice.device_name || "").trim();
      return deviceName ? TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceNamed(deviceName) : TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceFallback;
    }
    return String(this.hubCommandBusyLabel || "").trim() || "Hub command in progress...";
  }

  private _runningWifiDevice() {
    const selectedDevice = this._selectedWifiDevice();
    return findRunningWifiDevice(
      this._wifiDevices,
      this._selectedDeviceKey,
      this._syncState.status,
      selectedDevice?.device_name || "",
    );
  }

  private _selectedDeviceOwnsPendingSync() {
    return selectedDeviceOwnsPendingSync({
      selectedDeviceKey: this._selectedDeviceKey,
      commandSyncRunning: this._commandSyncRunning,
      commandSyncDeviceKey: this._commandSyncDeviceKey,
    });
  }

  private _defaultSyncState(): SyncState {
    return {
      status: "idle",
      current_step: 0,
      total_steps: 0,
      message: "Idle",
      commands_hash: "",
      managed_command_hashes: [],
      sync_needed: false,
    };
  }

  private _selectedWifiDevice() {
    return this._wifiDevices.find((device) => device.device_key === this._selectedDeviceKey) || null;
  }

  private _normalizeCommandAction(action: unknown): WifiCommandAction {
    if (Array.isArray(action)) {
      const first = action.find((item) => item && typeof item === "object");
      const normalized = first || DEFAULT_ACTION;
      if (normalized && typeof normalized === "object" && "action" in normalized) return { ...(normalized as WifiCommandAction) };
      return { ...(normalized as Record<string, unknown>), ...DEFAULT_ACTION } as WifiCommandAction;
    }
    if (action && typeof action === "object") {
      const normalized = action as WifiCommandAction;
      return normalized.action ? { ...normalized } : { ...normalized, ...DEFAULT_ACTION };
    }
    return { ...DEFAULT_ACTION };
  }

  private _commandSlotDefault(idx: number): WifiCommandSlot {
    return {
      name: `Command ${idx + 1}`,
      add_as_favorite: true,
      hard_button: "",
      long_press_enabled: false,
      is_power_on: false,
      is_power_off: false,
      input_activity_id: "",
      activities: [],
      action: { ...DEFAULT_ACTION },
      long_press_action: { ...DEFAULT_ACTION },
    };
  }

  private _normalizePowerCommandId(value: unknown) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1 || num > SLOT_COUNT) return null;
    return num;
  }

  private _derivePowerCommandIds(nextCommands: unknown) {
    let powerOnCommandId: number | null = null;
    let powerOffCommandId: number | null = null;
    if (Array.isArray(nextCommands)) {
      nextCommands.forEach((item, idx) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (Boolean(record.is_power_on)) powerOnCommandId = idx + 1;
        if (Boolean(record.is_power_off)) powerOffCommandId = idx + 1;
      });
    }
    return { powerOnCommandId, powerOffCommandId };
  }

  private _validActivityIdSet(): Set<string> | null {
    const list = this._editorActivities();
    if (!list.length) return null;
    return new Set(list.map((activity) => String(activity.id)));
  }

  private _normalizeCommandsForStorage(
    nextCommands: unknown,
    powerOnCommandId: unknown = null,
    powerOffCommandId: unknown = null,
  ): WifiCommandSlot[] {
    const normalizedPowerOnId = this._normalizePowerCommandId(powerOnCommandId);
    const normalizedPowerOffId = this._normalizePowerCommandId(powerOffCommandId);
    const validActivityIds = this._validActivityIdSet();
    return Array.from({ length: SLOT_COUNT }, (_, idx) => {
      const item = Array.isArray(nextCommands) ? nextCommands[idx] ?? {} : {};
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const rawInputActivityId = String(record.input_activity_id ?? "");
      const inputActivityId =
        validActivityIds && rawInputActivityId && !validActivityIds.has(rawInputActivityId)
          ? ""
          : rawInputActivityId;
      const addAsFavorite =
        record.add_as_favorite === undefined ? this._commandSlotDefault(idx).add_as_favorite : Boolean(record.add_as_favorite);
      const hardButton = String(record.hard_button ?? "");
      // The activities selection only exists for favorites and hard-button
      // bindings; the editor hides (without clearing) it when both are off.
      // Drop the orphaned list at save time so it cannot silently pull the
      // wifi device into activities on deploy (issue #258).
      const activitiesActive = addAsFavorite || Boolean(hardButton.trim());
      const rawActivities =
        activitiesActive && Array.isArray(record.activities)
          ? record.activities.map((id) => String(id)).filter((id) => id !== "")
          : [];
      const activities = validActivityIds
        ? rawActivities.filter((id) => validActivityIds.has(id))
        : rawActivities;
      return {
        ...this._commandSlotDefault(idx),
        name: this._sanitizeCommandName(record.name ?? `Command ${idx + 1}`),
        add_as_favorite: addAsFavorite,
        hard_button: hardButton,
        long_press_enabled: Boolean(record.long_press_enabled) && Boolean(String(record.hard_button ?? "").trim()),
        is_power_on: normalizedPowerOnId === idx + 1,
        is_power_off: normalizedPowerOffId === idx + 1,
        input_activity_id: inputActivityId,
        activities,
        action: this._normalizeCommandAction(record.action),
        long_press_action: this._normalizeCommandAction(record.long_press_action),
      };
    });
  }

  private _commandsList() {
    return this._commandsData.map((slot, idx) => ({
      ...this._commandSlotDefault(idx),
      ...slot,
      action: this._normalizeCommandAction(slot.action),
      long_press_action: this._normalizeCommandAction(slot.long_press_action),
    }));
  }

  private _cloneCommandSlot(slot: Partial<WifiCommandSlot> | null | undefined): WifiCommandSlot {
    return {
      name: this._sanitizeCommandName(slot?.name ?? ""),
      add_as_favorite: Boolean(slot?.add_as_favorite),
      hard_button: String(slot?.hard_button ?? ""),
      long_press_enabled: Boolean(slot?.long_press_enabled) && Boolean(String(slot?.hard_button ?? "").trim()),
      is_power_on: Boolean(slot?.is_power_on),
      is_power_off: Boolean(slot?.is_power_off),
      input_activity_id: String(slot?.input_activity_id ?? ""),
      activities: Array.isArray(slot?.activities) ? slot.activities.map((id) => String(id)).filter((id) => id !== "") : [],
      action: this._normalizeCommandAction(slot?.action),
      long_press_action: this._normalizeCommandAction(slot?.long_press_action),
    };
  }

  private async _loadCommandConfigFromBackend(force = false) {
    const entityId = String(this._entityId() || "").trim();
    const entryId = String(this.hub?.entry_id || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !entryId || !this.hass?.callWS) return;
    if (this._commandConfigLoading && !force) return;
    if (!deviceKey) return;
    this._commandConfigLoading = true;
    try {
      const result = await this.hass.callWS<{ commands?: unknown[]; power_on_command_id?: number | null; power_off_command_id?: number | null }>({
        type: "sofabaton_x1s/command_config/get",
        entity_id: entityId,
        device_key: deviceKey,
      });
      this._commandsData = this._normalizeCommandsForStorage(
        result?.commands || [],
        result?.power_on_command_id,
        result?.power_off_command_id,
      );
      this._configLoadedForEntryId = entryId;
    } catch (_error) {
      this._commandsData = this._normalizeCommandsForStorage([]);
    } finally {
      this._commandConfigLoading = false;
    }
  }

  private async _loadCommandSyncProgress(force = false) {
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    if (!deviceKey) return;
    if (this._commandSyncLoading && !force) return;
    this._commandSyncLoading = true;
    try {
      const result = await this.hass.callWS<Partial<SyncState>>({
        type: "sofabaton_x1s/command_sync/progress",
        entity_id: entityId,
        device_key: deviceKey,
      });
      this._syncState = {
        status: String(result?.status || "idle"),
        current_step: Number(result?.current_step || 0),
        total_steps: Number(result?.total_steps || 0),
        message: String(result?.message || "Idle"),
        commands_hash: String(result?.commands_hash || ""),
        managed_command_hashes: Array.isArray(result?.managed_command_hashes)
          ? result.managed_command_hashes.map((item) => String(item || "")).filter(Boolean)
          : [],
        sync_needed: Boolean(result?.sync_needed),
      };
      if (deviceKey) {
        this._wifiDevices = this._wifiDevices.map((device) =>
          device.device_key === deviceKey
            ? {
                ...device,
                ...this._syncState,
              }
            : device,
        );
      }
    } catch (_error) {
      this._syncState = {
        ...this._defaultSyncState(),
        message: "Unable to load sync status",
      };
    } finally {
      this._commandSyncLoading = false;
    }
  }

  private async _loadWifiDevices(force = false) {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return false;
    if (this._deviceListLoading && !force) return false;
    this._deviceListLoading = true;
    try {
      const result = await this.hass.callWS<{ devices?: WifiDeviceSummary[]; max_devices?: number }>({
        type: "sofabaton_x1s/command_devices/list",
        entity_id: entityId,
      });
      this._wifiDevices = Array.isArray(result?.devices) ? result.devices : [];
      if (this._selectedDeviceKey && this._syncState.status !== "idle") {
        this._wifiDevices = this._wifiDevices.map((device) =>
          device.device_key === this._selectedDeviceKey
            ? {
                ...device,
                ...this._syncState,
              }
            : device,
        );
      }
      this._maxWifiDevices = Number(result?.max_devices || 5);
      if (this._selectedDeviceKey && !this._wifiDevices.some((device) => device.device_key === this._selectedDeviceKey)) {
        this._selectedDeviceKey = null;
        this._commandsData = this._normalizeCommandsForStorage([]);
        this._syncState = this._defaultSyncState();
      }
      return true;
    } catch (_error) {
      return false;
    } finally {
      this._deviceListLoading = false;
    }
  }

  private async _setCommands(nextCommands: WifiCommandSlot[]) {
    const { powerOnCommandId, powerOffCommandId } = this._derivePowerCommandIds(nextCommands);
    const normalized = this._normalizeCommandsForStorage(nextCommands, powerOnCommandId, powerOffCommandId);
    this._commandsData = normalized;
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (entityId && this.hass?.callWS) {
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_config/set",
          entity_id: entityId,
          device_key: deviceKey,
          commands: normalized,
          power_on_command_id: powerOnCommandId ?? undefined,
          power_off_command_id: powerOffCommandId ?? undefined,
        });
      } catch (_error) {
        // Keep the local staged state even if backend persistence fails temporarily.
      }
      await this._loadWifiDevices(true);
      await this._loadCommandSyncProgress(true);
    }
  }

  private _ensureCommandDraft(slotIdx: number | null) {
    if (!Number.isInteger(slotIdx)) return null;
    const idx = Number(slotIdx);
    if (!this._commandEditorDrafts[idx]) {
      this._commandEditorDrafts[idx] = this._cloneCommandSlot(this._commandsList()[idx] || this._commandSlotDefault(idx));
    }
    return this._commandEditorDrafts[idx];
  }

  private _activeCommandDraft() {
    return this._ensureCommandDraft(this._activeCommandSlot);
  }

  private _updateActiveCommandDraft(patch: Partial<WifiCommandSlot>) {
    if (!Number.isInteger(this._activeCommandSlot)) return null;
    const idx = Number(this._activeCommandSlot);
    const current = this._ensureCommandDraft(idx);
    if (!current) return null;
    const next = { ...current, ...patch };
    this._commandEditorDrafts = { ...this._commandEditorDrafts, [idx]: this._cloneCommandSlot(next) };
    return this._commandEditorDrafts[idx];
  }

  private _activeCommandActionTabKey(): PressType {
    const draft = this._activeCommandDraft();
    if (!draft?.long_press_enabled) return "short";
    return this._activeCommandActionTab === "long" ? "long" : "short";
  }

  private _setActiveCommandActionTab(tab: PressType) {
    this._activeCommandActionTab = tab === "long" ? "long" : "short";
  }

  private _commandActionForPress(slot: Partial<WifiCommandSlot> | null | undefined, pressType: PressType = "short") {
    return this._normalizeCommandAction(pressType === "long" ? slot?.long_press_action : slot?.action);
  }

  private _commandActionDetails(action: unknown) {
    const normalized = this._normalizeCommandAction(action);
    const explicitService = String(normalized.perform_action || normalized.service || "").trim();
    const service = explicitService || "perform-action";
    const entityIds = normalized.target?.entity_id;
    const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : entityIds ? [entityIds] : [];
    const suffix = (value: unknown) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const parts = text.split(".");
      return (parts[parts.length - 1] || text).trim();
    };
    const actionSuffix = suffix(service);
    const entitySuffix = ids.length ? suffix(ids[0]) : "";
    return {
      service,
      entities: ids.length ? ids.join(", ") : "No target entity",
      commandSummary:
        explicitService && actionSuffix && entitySuffix
          ? `${actionSuffix} ${entitySuffix}`
          : explicitService && actionSuffix
            ? actionSuffix
            : TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured,
    };
  }

  private _commandHasCustomAction(action: unknown) {
    const details = this._commandActionDetails(action);
    return details.service !== "perform-action" || details.entities !== "No target entity";
  }

  private _commandSlotSummaryDetails(command: WifiCommandSlot) {
    const shortDetails = this._commandActionDetails(command.action);
    if (shortDetails.commandSummary !== TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured) return shortDetails;
    if (!command.long_press_enabled) return shortDetails;
    const longDetails = this._commandActionDetails(command.long_press_action);
    return longDetails.commandSummary !== TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured ? longDetails : shortDetails;
  }

  private _commandSaveValidationMessage(slot: WifiCommandSlot | null = null) {
    const draft = slot || this._activeCommandDraft();
    if (!draft) return "";
    if (!String(draft.name ?? "").length || String(draft.name).startsWith(" ")) {
      return "Command name must start with a non-space character.";
    }
    return "";
  }

  private _saveActiveCommandModal = async () => {
    if (!Number.isInteger(this._activeCommandSlot)) return;
    const idx = Number(this._activeCommandSlot);
    const draft = this._activeCommandDraft();
    if (!draft) return;
    const validationMessage = this._commandSaveValidationMessage(draft);
    if (validationMessage) {
      this._commandSaveError = validationMessage;
      return;
    }
    const next = this._commandsList().slice();
    next[idx] = this._cloneCommandSlot(draft);
    if (next[idx].is_power_on) {
      next.forEach((slot, slotIdx) => {
        if (slotIdx !== idx && slot.is_power_on) next[slotIdx] = this._cloneCommandSlot({ ...slot, is_power_on: false });
      });
    }
    if (next[idx].is_power_off) {
      next.forEach((slot, slotIdx) => {
        if (slotIdx !== idx && slot.is_power_off) next[slotIdx] = this._cloneCommandSlot({ ...slot, is_power_off: false });
      });
    }
    const inputActivityId = String(next[idx].input_activity_id || "").trim();
    if (inputActivityId) {
      next.forEach((slot, slotIdx) => {
        if (slotIdx !== idx && String(slot.input_activity_id || "").trim() === inputActivityId)
          next[slotIdx] = this._cloneCommandSlot({ ...slot, input_activity_id: "" });
      });
    }
    const hardButton = String(next[idx].hard_button || "").trim();
    if (hardButton) {
      next.forEach((slot, slotIdx) => {
        if (slotIdx !== idx && String(slot.hard_button || "").trim() === hardButton)
          next[slotIdx] = this._cloneCommandSlot({ ...slot, hard_button: "", long_press_enabled: false, long_press_action: { ...DEFAULT_ACTION } });
      });
      await this._clearButtonFromOtherDevices(hardButton, String(this._selectedDeviceKey || ""));
    }
    this._commandSaveError = "";
    delete this._commandEditorDrafts[idx];
    this._commandEditorDrafts = { ...this._commandEditorDrafts };
    this._activeCommandModal = null;
    this._activeCommandSlot = null;
    await this._setCommands(next);
  };

  private _commandActionRefreshKey(action: unknown) {
    const normalized = this._normalizeCommandAction(action);
    const normalizeIdValue = (value: unknown) =>
      Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean).sort() : value ? [String(value)] : [];
    const target = normalized.target || {};
    try {
      return JSON.stringify({
        action: String(normalized.action || "").trim(),
        service: String(normalized.perform_action || normalized.service || "").trim(),
        target_entity_id: normalizeIdValue(target.entity_id || normalized.entity_id || normalized.data?.entity_id || normalized.service_data?.entity_id),
        target_device_id: normalizeIdValue(target.device_id || normalized.device_id || normalized.data?.device_id || normalized.service_data?.device_id),
        target_area_id: normalizeIdValue(target.area_id || normalized.area_id || normalized.data?.area_id || normalized.service_data?.area_id),
        navigation_path: String(normalized.navigation_path || "").trim(),
        url_path: String(normalized.url_path || "").trim(),
      });
    } catch (_error) {
      return "";
    }
  }

  private _handleActionChanged(pressType: PressType, nextValue: unknown) {
    const previousValue = this._commandActionForPress(this._activeCommandDraft(), pressType);
    const normalized = this._normalizeCommandAction(nextValue);
    this._updateActiveCommandDraft(pressType === "long" ? { long_press_action: normalized } : { action: normalized });
    this._commandSaveError = "";
    if (this._commandActionRefreshKey(previousValue) !== this._commandActionRefreshKey(normalized)) {
      if (pressType === "long") this._longSelectorVersion += 1;
      else this._shortSelectorVersion += 1;
    }
  }

  private _editorHardButtonOptions() {
    const group = (keys: string[], title: string) =>
      keys.filter((key) => DEFAULT_KEY_LABELS[key]).map((key) => ({
        value: key,
        label: `${title} - ${DEFAULT_KEY_LABELS[key]}`,
      }));
    return [
      ...group(["up", "down", "left", "right", "ok", "back", "home", "menu"], "Navigation"),
      ...group(["volup", "voldn", "mute", "chup", "chdn"], "Transport"),
      ...group(["play", "pause", "rew", "fwd", "guide", "dvr", "exit"], "Media"),
      ...group(["a", "b", "c"], "ABC"),
      ...group(["red", "green", "yellow", "blue"], "Color"),
    ];
  }

  private _editorAvailableHardButtonOptions() {
    const showX2Keys = this._hubVersion().includes("X2");
    return this._editorHardButtonOptions().filter((option) => {
      const id = HARD_BUTTON_ID_MAP[String(option.value || "")];
      if (!Number.isFinite(id)) return false;
      if (X2_ONLY_HARD_BUTTON_IDS.has(id) && !showX2Keys) return false;
      return true;
    });
  }

  private _selectorValueForButton(draft: WifiCommandSlot) {
    return draft.hard_button ? String(draft.hard_button) : "__none__";
  }

  private _activitySelectionEnabled(slot: WifiCommandSlot | null | undefined) {
    return Boolean(slot?.add_as_favorite) || Boolean(String(slot?.hard_button || "").trim());
  }

  private _hasInputActivity(slot: WifiCommandSlot | null | undefined) {
    return Boolean(String(slot?.input_activity_id || "").trim());
  }

  private _defaultEditorActivityId() {
    const firstActivity = this._editorActivities()[0];
    return firstActivity ? String(firstActivity.id) : "";
  }

  private _ensureDefaultAssignedActivity() {
    const draft = this._activeCommandDraft();
    if (!draft || !this._activitySelectionEnabled(draft) || draft.activities.length > 0) return;
    const fallbackActivity = this._defaultEditorActivityId();
    if (!fallbackActivity) return;
    this._updateActiveCommandDraft({ activities: [fallbackActivity] });
  }

  private _selectorValueForInputActivity(draft: WifiCommandSlot) {
    return this._hasInputActivity(draft) ? String(draft.input_activity_id) : this._defaultEditorActivityId();
  }

  private _activityName(activityId: string) {
    const match = this._editorActivities().find((activity) => String(activity.id) === String(activityId));
    return match?.name || `Activity ${activityId}`;
  }

  private _inputFlagTitle(command: WifiCommandSlot) {
    const activityId = String(command.input_activity_id || "").trim();
    return activityId ? `Input for ${this._activityName(activityId)}` : "Input command";
  }

  private _isUnconfiguredCommand(command: WifiCommandSlot) {
    return (
      !this._activitySelectionEnabled(command) &&
      !command.is_power_on &&
      !command.is_power_off &&
      !this._hasInputActivity(command)
    );
  }

  private _commandSlotMetaLabel(command: WifiCommandSlot) {
    const activityCount = Array.isArray(command.activities) ? command.activities.length : 0;
    const activitiesLabel = activityCount === 1 ? "Activity" : "Activities";
    const assignmentEnabled = this._activitySelectionEnabled(command);
    const powerInput = this._supportsPowerInputConfig();
    if (this._isUnconfiguredCommand(command)) return "Unconfigured command";
    if (powerInput && !assignmentEnabled && command.is_power_on && command.is_power_off) return "Power ON and OFF command";
    if (powerInput && !assignmentEnabled && command.is_power_on) return "Power ON command";
    if (powerInput && !assignmentEnabled && command.is_power_off) return "Power OFF command";
    if (powerInput && !assignmentEnabled && this._hasInputActivity(command)) return `Input for ${this._activityName(command.input_activity_id)}`;
    return `in ${activityCount} ${activitiesLabel}`;
  }

  private _toggleFavoriteRow() {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    this._updateActiveCommandDraft({ add_as_favorite: !draft.add_as_favorite });
    if (!draft.add_as_favorite) this._ensureDefaultAssignedActivity();
    this._commandSaveError = "";
  }

  private _handleFavoriteSwitchChange(event: Event) {
    const checked = Boolean((event.currentTarget as HTMLInputElement).checked);
    this._updateActiveCommandDraft({ add_as_favorite: checked });
    if (checked) this._ensureDefaultAssignedActivity();
    this._commandSaveError = "";
  }

  private _inputActivityReplacementSlot(activityId: string) {
    if (!Number.isInteger(this._activeCommandSlot) || !activityId) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      if (String(commands[idx].input_activity_id || "").trim() === activityId) return { index: idx, slot: commands[idx] };
    }
    return null;
  }

  private _inputActivityReplacementLabel() {
    const draft = this._activeCommandDraft();
    const activityId = String(draft?.input_activity_id || "").trim();
    if (!activityId) return TOOLS_CARD_STRINGS.wifiCommands.activityInputHint;
    const replacement = this._inputActivityReplacementSlot(activityId);
    if (!replacement) return TOOLS_CARD_STRINGS.wifiCommands.activityInputHint;
    const name = String(replacement.slot.name || "").trim() || `Command ${replacement.index + 1}`;
    return TOOLS_CARD_STRINGS.wifiCommands.activityInputReplaces(name, this._activityName(activityId));
  }

  private _hardButtonConflictInfo(buttonId: string) {
    if (!buttonId || !Number.isInteger(this._activeCommandSlot)) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const currentDeviceKey = String(this._selectedDeviceKey || "");
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      if (String(commands[idx].hard_button || "").trim() === buttonId) {
        const name = String(commands[idx].name || "").trim() || `Command ${idx + 1}`;
        return { deviceName: this._selectedWifiDevice()?.device_name || "this device", slotName: name, isSameDevice: true, deviceKey: currentDeviceKey };
      }
    }
    for (const device of this._wifiDevices) {
      if (device.device_key === currentDeviceKey || !Array.isArray(device.commands)) continue;
      for (let idx = 0; idx < device.commands.length; idx += 1) {
        if (String(device.commands[idx]?.hard_button || "").trim() === buttonId) {
          const name = String(device.commands[idx]?.name || "").trim() || `Command ${idx + 1}`;
          return { deviceName: device.device_name, slotName: name, isSameDevice: false, deviceKey: device.device_key };
        }
      }
    }
    return null;
  }

  private _hardButtonReplacementLabel() {
    const draft = this._activeCommandDraft();
    const buttonId = String(draft?.hard_button || "").trim();
    if (!buttonId) return "";
    const conflict = this._hardButtonConflictInfo(buttonId);
    if (!conflict) return "";
    if (conflict.isSameDevice) return `Replaces "${conflict.slotName}" on this button`;
    return `Replaces "${conflict.slotName}" from ${conflict.deviceName}`;
  }

  private _toggleLongPressRow() {
    const draft = this._activeCommandDraft();
    const hasMappedButton = Boolean(String(draft?.hard_button || "").trim());
    if (!draft || !hasMappedButton) return;
    const nextEnabled = !draft.long_press_enabled;
    this._updateActiveCommandDraft({ long_press_enabled: nextEnabled });
    if (!nextEnabled) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
  }

  private _handleLongPressSwitchChange(event: Event) {
    const checked = Boolean((event.currentTarget as HTMLInputElement).checked);
    this._updateActiveCommandDraft({ long_press_enabled: checked });
    if (!checked) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
  }

  private _handleHardButtonChanged(event: CustomEvent) {
    const rawValue = event.detail?.value ?? (event.currentTarget as { value?: unknown })?.value ?? "";
    const mapped = String(rawValue ?? "");
    const hasButton = mapped !== "__none__" && mapped !== "None";
    const nextMapped = hasButton ? mapped : "";
    this._updateActiveCommandDraft({
      hard_button: nextMapped,
      long_press_enabled: hasButton ? Boolean(this._activeCommandDraft()?.long_press_enabled) : false,
      long_press_action: hasButton ? this._commandActionForPress(this._activeCommandDraft(), "long") : this._normalizeCommandAction(null),
    });
    if (hasButton) this._ensureDefaultAssignedActivity();
    if (!hasButton) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
    const selector = event.currentTarget as { value?: unknown };
    if (selector) {
      requestAnimationFrame(() => {
        const slotIndex = Number.isInteger(this._activeCommandSlot) ? Number(this._activeCommandSlot) : 0;
        selector.value = this._selectorValueForButton(this._activeCommandDraft() || this._commandSlotDefault(slotIndex));
      });
    }
  }

  private _commandSlotIcon(hardButton: string) {
    return hardButton ? HARD_BUTTON_ICONS[String(hardButton)] || "mdi:gesture-tap-button" : "mdi:gesture-tap-button";
  }

  private _commandSlotIconColor(hardButton: string) {
    const key = String(hardButton || "");
    if (key === "red") return "#ef4444";
    if (key === "green") return "#22c55e";
    if (key === "yellow") return "#facc15";
    if (key === "blue") return "#3b82f6";
    return "";
  }

  private _editorActivities() {
    const list = this._remoteAttrs()?.activities;
    if (!Array.isArray(list)) return [];
    return list
      .map((activity) => ({
        id: Number((activity as { id?: unknown }).id),
        name: String((activity as { name?: unknown }).name ?? ""),
      }))
      .filter((activity) => Number.isFinite(activity.id) && activity.name);
  }

  private _isCommandConfigured(command: WifiCommandSlot, idx: number) {
    const defaults = this._commandSlotDefault(idx);
    return (
      String(command.name || "").trim() !== String(defaults.name) ||
      Boolean(command.add_as_favorite) !== Boolean(defaults.add_as_favorite) ||
      Boolean(command.hard_button) ||
      Boolean(command.long_press_enabled) ||
      Boolean(command.is_power_on) ||
      Boolean(command.is_power_off) ||
      Boolean(String(command.input_activity_id || "").trim()) ||
      (Array.isArray(command.activities) && command.activities.length > 0) ||
      this._commandHasCustomAction(command.action) ||
      (Boolean(command.long_press_enabled) && this._commandHasCustomAction(command.long_press_action))
    );
  }

  private _openCommandEditor(slotIndex: number) {
    this._confirmClearSlot = null;
    this._activeCommandModal = "details";
    this._activeCommandSlot = Number(slotIndex);
    this._activeCommandActionTab = "short";
    this._advancedOptionsOpen = false;
    this._commandSaveError = "";
    const draft = this._ensureCommandDraft(slotIndex);
    if (draft && this._activitySelectionEnabled(draft) && draft.activities.length === 0) this._ensureDefaultAssignedActivity();
  }

  private _openCommandActionEditor(slotIndex: number) {
    this._confirmClearSlot = null;
    this._activeCommandModal = "action";
    this._activeCommandSlot = Number(slotIndex);
    this._activeCommandActionTab = "short";
    this._commandSaveError = "";
    this._shortSelectorVersion += 1;
    this._longSelectorVersion += 1;
    this._ensureCommandDraft(slotIndex);
  }

  private _closeCommandEditor = () => {
    if (Number.isInteger(this._activeCommandSlot)) {
      delete this._commandEditorDrafts[Number(this._activeCommandSlot)];
      this._commandEditorDrafts = { ...this._commandEditorDrafts };
    }
    this._commandSaveError = "";
    this._advancedOptionsOpen = false;
    this._activeCommandModal = null;
    this._activeCommandSlot = null;
  };

  private _closeCommandActionEditor = () => {
    if (Number.isInteger(this._activeCommandSlot)) {
      delete this._commandEditorDrafts[Number(this._activeCommandSlot)];
      this._commandEditorDrafts = { ...this._commandEditorDrafts };
    }
    this._commandSaveError = "";
    this._activeCommandModal = null;
    this._activeCommandSlot = null;
  };

  private _closeOnBackdrop = () => {
    if (this._activeCommandModal === "action") this._closeCommandActionEditor();
    else this._closeCommandEditor();
  };

  private _toggleActivity(activityId: number, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this._activitySelectionEnabled(this._activeCommandDraft())) return;
    const current = new Set((this._activeCommandDraft()?.activities || []).map((id) => String(id)));
    const idKey = String(activityId);
    if (current.has(idKey) && current.size > 1) current.delete(idKey);
    else current.add(idKey);
    this._updateActiveCommandDraft({ activities: Array.from(current) });
    this._commandSaveError = "";
  }

  private _setInputActivityEnabled(enabled: boolean) {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    const fallbackActivity = this._defaultEditorActivityId();
    this._updateActiveCommandDraft({
      input_activity_id: enabled ? (String(draft.input_activity_id || "").trim() || fallbackActivity) : "",
      is_power_on: enabled ? false : draft.is_power_on,
      is_power_off: enabled ? false : draft.is_power_off,
    });
    this._commandSaveError = "";
  }

  private _toggleInputActivityRow() {
    const draft = this._activeCommandDraft();
    if (!draft || !this._editorActivities().length) return;
    this._setInputActivityEnabled(!this._hasInputActivity(draft));
  }

  private _handleInputActivitySwitchChange(event: Event) {
    const checked = Boolean((event.currentTarget as HTMLInputElement).checked);
    if (!this._editorActivities().length) return;
    this._setInputActivityEnabled(checked);
  }

  private _handleInputActivityChanged(event: CustomEvent) {
    const rawValue = event.detail?.value ?? (event.currentTarget as { value?: unknown })?.value ?? "";
    this._updateActiveCommandDraft({ input_activity_id: String(rawValue ?? "") });
    this._commandSaveError = "";
  }

  private async _clearSlot(idx: number) {
    const next = this._commandsList();
    next[idx] = this._commandSlotDefault(idx);
    this._confirmClearSlot = null;
    await this._setCommands(next);
  }

  private async _clearButtonFromOtherDevices(buttonId: string, currentDeviceKey: string) {
    if (!buttonId || !this.hass?.callWS) return;
    const entityId = String(this._entityId() || "").trim();
    if (!entityId) return;
    for (const device of this._wifiDevices) {
      if (device.device_key === currentDeviceKey || !Array.isArray(device.commands)) continue;
      const conflictIdx = device.commands.findIndex((cmd) => String(cmd?.hard_button || "").trim() === buttonId);
      if (conflictIdx === -1) continue;
      const slots = this._normalizeCommandsForStorage(device.commands, device.power_on_command_id, device.power_off_command_id);
      const cleared = slots.map((slot, i) =>
        i === conflictIdx ? this._cloneCommandSlot({ ...slot, hard_button: "", long_press_enabled: false, long_press_action: { ...DEFAULT_ACTION } }) : slot
      );
      const { powerOnCommandId, powerOffCommandId } = this._derivePowerCommandIds(cleared);
      const normalized = this._normalizeCommandsForStorage(cleared, powerOnCommandId, powerOffCommandId);
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_config/set",
          entity_id: entityId,
          device_key: device.device_key,
          commands: normalized,
          power_on_command_id: powerOnCommandId ?? undefined,
          power_off_command_id: powerOffCommandId ?? undefined,
        });
      } catch (_error) {
        // Best-effort cross-device cleanup; current device save still proceeds.
      }
    }
  }

  private _syncStatusTone(status: string) {
    if (status === "failed") return "sync-error";
    if (status === "success") return "sync-ok";
    if (status === "running") return "sync-running";
    if (status === "pending") return "sync-pending";
    return "";
  }

  private _syncStatusIcon(remoteUnavailable: boolean) {
    if (remoteUnavailable || this._syncState.status === "failed") return "mdi:alert-circle-outline";
    if (this._syncState.status === "running") return "mdi:progress-clock";
    return "mdi:information-outline";
  }

  private _syncMessage(remoteUnavailable: boolean) {
    if (remoteUnavailable) return TOOLS_CARD_STRINGS.wifiCommands.syncMessageRemoteUnavailable;
    if (this._syncState.status === "running") return String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncInProgress);
    if (this._syncState.status === "failed") return String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncMessageFailed);
    if (this._syncState.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncMessageNeeded;
    if (this._syncState.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.syncMessageUpToDate;
    return TOOLS_CARD_STRINGS.wifiCommands.syncMessageIdle;
  }

  private _syncMessageShort(remoteUnavailable: boolean) {
    if (remoteUnavailable) return TOOLS_CARD_STRINGS.wifiCommands.syncShortUnavailable;
    if (this._syncState.status === "running") return TOOLS_CARD_STRINGS.wifiCommands.syncShortRunning;
    if (this._syncState.status === "failed") return TOOLS_CARD_STRINGS.wifiCommands.syncShortFailed;
    if (this._syncState.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncShortNeeded;
    if (this._syncState.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.syncShortUpToDate;
    return TOOLS_CARD_STRINGS.wifiCommands.syncShortIdle;
  }

  private _deviceStatusLabel(device: WifiDeviceSummary) {
    if (device.device_key === this._deletingDeviceKey) return TOOLS_CARD_STRINGS.wifiCommands.deviceDeleting;
    if (device.status === "running") return TOOLS_CARD_STRINGS.wifiCommands.syncShortRunning;
    if (device.status === "failed") return TOOLS_CARD_STRINGS.wifiCommands.syncShortFailed;
    if (device.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncShortNeeded;
    if (device.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.deviceSynced;
    return TOOLS_CARD_STRINGS.wifiCommands.deviceSynced;
  }

  private _deviceStatusIcon(device: WifiDeviceSummary) {
    if (device.device_key === this._deletingDeviceKey) return "mdi:progress-clock";
    if (device.status === "failed") return "mdi:alert-circle-outline";
    if (device.status === "running") return "mdi:progress-clock";
    if (device.sync_needed) return "mdi:sync-alert";
    return "mdi:check-circle-outline";
  }

  private _deviceStatusTone(device: WifiDeviceSummary) {
    if (device.device_key === this._deletingDeviceKey) return "sync-pending";
    if (device.status === "failed") return "sync-error";
    if (device.status === "running") return "sync-running";
    if (device.sync_needed) return "sync-pending";
    return "sync-ok";
  }

  private _syncDockTone(remoteUnavailable: boolean, externallyLocked: boolean) {
    if (remoteUnavailable || this._syncState.status === "failed") return "status-error";
    if (this._syncState.status === "running" || externallyLocked) return "status-progress";
    if (this._syncState.sync_needed) return "status-warning";
    return "status-success";
  }

  private _renderSyncMessage(remoteUnavailable: boolean, externallyLocked = false) {
    const message = externallyLocked ? this._effectiveHubCommandLabel() : this._syncMessage(remoteUnavailable);
    if (remoteUnavailable || this._syncState.status !== "failed") return message;
    return html`${message} <a class="sync-doc-link" href=${WIFI_COMMANDS_DOCS_URL} target="_blank" rel="noreferrer">${TOOLS_CARD_STRINGS.wifiCommands.seeDocumentation}</a>`;
  }

  private _renderStatusDock(message: unknown, tone: string) {
    return html`
      <div class="bottom-dock-status">
        <span class="dock-status-indicator ${tone}"></span>
        <span>${message}</span>
      </div>
    `;
  }

  private _renderSyncActionButton({
    remoteUnavailable,
    syncRunning,
    externallyLocked,
  }: {
    remoteUnavailable: boolean;
    syncRunning: boolean;
    externallyLocked: boolean;
  }) {
    const label = remoteUnavailable
      ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonUnavailable
      : syncRunning
        ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonSyncing
        : externallyLocked
          ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonBusy
          : this._syncState.sync_needed
            ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonSyncToHub
            : TOOLS_CARD_STRINGS.wifiCommands.actionButtonUpToDate;
    const disabled = remoteUnavailable || syncRunning || externallyLocked || !this._syncState.sync_needed;
    const classes = `detail-sync-btn${!disabled && this._syncState.sync_needed ? " sync-btn-primary" : ""}${!remoteUnavailable && !syncRunning && !externallyLocked && !this._syncState.sync_needed ? " detail-sync-btn--state-ok" : ""}`;
    return html`<button class=${classes} ?disabled=${disabled} @click=${disabled ? null : this._runCommandConfigSync}>${label}</button>`;
  }

  private _selectWifiDevice(deviceKey: string) {
    this._selectedDeviceKey = String(deviceKey || "").trim();
    void this._loadCommandConfigFromBackend(true);
    void this._loadCommandSyncProgress(true);
  }

  private _goBackToDeviceList = () => {
    this._selectedDeviceKey = null;
    this._commandsData = this._normalizeCommandsForStorage([]);
    if (this._syncState.status !== "running") {
      this._syncState = this._defaultSyncState();
    }
    // Clear the stored selection unconditionally. We can't rely on the
    // `updated()` persist hook for this — when the back-click update
    // happens to coincide with a parent re-render that sends a new hub
    // reference (common, since `hub` is rebuilt from a snapshot),
    // `_deviceSessionRestoreTried` is reset to false in the same cycle
    // and the persist guard skips the removeItem. Next remount would
    // then restore the stale detail view.
    const key = this._deviceSessionStorageKey();
    if (key) {
      try {
        window.localStorage?.removeItem(key);
      } catch {
        // Ignore localStorage failures.
      }
    }
  };

  private _openCreateDeviceModal = () => {
    if (this._hubCommandLocked()) return;
    this._newDeviceName = "";
    this._deviceMutationError = "";
    this._createDeviceModalOpen = true;
  };

  private _closeCreateDeviceModal = () => {
    this._createDeviceModalOpen = false;
    this._deviceMutationError = "";
  };

  private async _createWifiDevice() {
    const entityId = String(this._entityId() || "").trim();
    const deviceName = this._sanitizeWifiDeviceName(this._newDeviceName);
    if (!entityId || !this.hass?.callWS) return;
    if (this._hubCommandLocked()) return;
    if (!deviceName) {
      this._deviceMutationError = TOOLS_CARD_STRINGS.wifiCommands.createDeviceNameRequired;
      return;
    }
    this._creatingDevice = true;
    const busyEntryId = String(this.hub?.entry_id || "").trim();
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.createDeviceBusy, busyEntryId);
    try {
      const payload = await this.hass.callWS<{ device_key?: string }>({
        type: "sofabaton_x1s/command_device/create",
        entity_id: entityId,
        device_name: deviceName,
      });
      this._closeCreateDeviceModal();
      await this._loadWifiDevices(true);
      this._selectWifiDevice(String(payload?.device_key || ""));
    } catch (error) {
      this._deviceMutationError = String((error as Error)?.message || TOOLS_CARD_STRINGS.wifiCommands.createDeviceFailed);
    } finally {
      this._creatingDevice = false;
      this._setSharedHubCommandBusy(false, null, busyEntryId);
    }
  }

  private _promptDeleteDevice(deviceKey: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this._hubCommandLocked()) return;
    this._deviceMutationError = "";
    this._deleteDeviceKey = deviceKey;
  }

  private _closeDeleteDeviceModal = () => {
    this._deleteDeviceKey = null;
    this._deviceMutationError = "";
  };

  private _deleteWifiDevice = async () => {
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._deleteDeviceKey || "").trim();
    if (!entityId || !deviceKey || !this.hass?.callWS) return;
    if (this._hubCommandLocked()) return;
    this._closeDeleteDeviceModal();
    this._deletingDeviceKey = deviceKey;
    const busyEntryId = String(this.hub?.entry_id || "").trim();
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.deleteDeviceBusy, busyEntryId);
    try {
      await this.hass.callWS({
        type: "sofabaton_x1s/command_device/delete",
        entity_id: entityId,
        device_key: deviceKey,
      });
      if (this._selectedDeviceKey === deviceKey) this._goBackToDeviceList();
      await this._loadWifiDevices(true);
      await this._refreshControlPanelState();
    } catch (error) {
      this._deviceMutationError = String((error as Error)?.message || TOOLS_CARD_STRINGS.wifiCommands.deleteDeviceFailed);
      this._deleteDeviceKey = deviceKey;
    } finally {
      this._deletingDeviceKey = null;
      this._setSharedHubCommandBusy(false, null, busyEntryId);
    }
  };

  private _commandSyncWarningStorageKey(entityId: string) {
    return `sofabaton_x1s:sync_warning_optout:${String(entityId || "").trim()}`;
  }

  private _commandSyncWarningOptedOut(entityId: string) {
    try {
      return window.localStorage?.getItem(this._commandSyncWarningStorageKey(entityId)) === "1";
    } catch (_error) {
      return false;
    }
  }

  private _setCommandSyncWarningOptOut(entityId: string, optedOut: boolean) {
    try {
      if (optedOut) window.localStorage?.setItem(this._commandSyncWarningStorageKey(entityId), "1");
      else window.localStorage?.removeItem(this._commandSyncWarningStorageKey(entityId));
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  private _confirmSyncWarning = async () => {
    const entityId = String(this._entityId() || "").trim();
    if (entityId && this._syncWarningOptOut) this._setCommandSyncWarningOptOut(entityId, true);
    this._syncWarningOpen = false;
    await this._startCommandConfigSync();
  };

  private _runCommandConfigSync = async () => {
    if (this._commandSyncRunning || this._hubCommandLocked()) return;
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId) return;
    if (!deviceKey) return;
    if (this._commandSyncWarningOptedOut(entityId)) {
      await this._startCommandConfigSync();
      return;
    }
    this._syncWarningOptOut = false;
    this._syncWarningOpen = true;
  };

  private async _startCommandConfigSync() {
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !this.hass?.callService) return;
    this._syncState = {
      ...this._syncState,
      status: "running",
      current_step: 0,
      total_steps: Number(this._syncState.total_steps || 0),
      message: TOOLS_CARD_STRINGS.wifiCommands.startSync,
      sync_needed: true,
    };
    this._commandSyncRunning = true;
    this._commandSyncDeviceKey = deviceKey;
    this._wifiDevices = this._wifiDevices.map((device) =>
      device.device_key === deviceKey
        ? {
            ...device,
            ...this._syncState,
            status: "running",
          }
        : device,
    );
    const busyEntryId = String(this.hub?.entry_id || "").trim();
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceFallback, busyEntryId);
    try {
      await this.hass.callService("sofabaton_x1s", "sync_command_config", { entity_id: entityId, device_key: deviceKey });
      await this._refreshControlPanelState();
    } catch (error) {
      this._syncState = {
        ...this._syncState,
        status: "failed",
        message: String((error as Error)?.message || TOOLS_CARD_STRINGS.wifiCommands.syncFailedToStart),
      };
      this._wifiDevices = this._wifiDevices.map((device) =>
        device.device_key === deviceKey
          ? {
              ...device,
              ...this._syncState,
            }
          : device,
      );
    } finally {
      this._commandSyncRunning = false;
      this._commandSyncDeviceKey = null;
      await this._loadWifiDevices(true);
      await this._loadCommandSyncProgress(true);
      await this._refreshControlPanelState();
      this._setSharedHubCommandBusy(false, null, busyEntryId);
    }
  }

  private _scheduleSyncPoll() {
    const runningDevice = this._runningWifiDevice();
    const selectedDeviceRunning = this._syncState.status === "running";
    if ((!selectedDeviceRunning && !runningDevice) || this._remoteUnavailable()) {
      this._clearPollTimer();
      return;
    }
    if (this._commandSyncPollTimer != null) return;
    this._commandSyncPollTimer = window.setTimeout(async () => {
      this._commandSyncPollTimer = null;
      if (selectedDeviceRunning && this._selectedDeviceKey) {
        await this._loadCommandSyncProgress(true);
      } else {
        await this._loadWifiDevices(true);
      }
    }, 1000);
  }

  private _clearPollTimer() {
    if (this._commandSyncPollTimer != null) {
      window.clearTimeout(this._commandSyncPollTimer);
      this._commandSyncPollTimer = null;
    }
  }

  /** Active press for the current hub, while still inside the 720ms flash
   *  window. Returns null otherwise. Side-effect: schedules a single
   *  setTimeout to drop the overlay once the window closes so the slot
   *  / device-card DOM stays clean and the next press cleanly remounts
   *  via the `keyed(receivedAt, ...)` wrapper. */
  private _activeWifiPressFlash(): WifiPressEvent | null {
    const press = this.lastWifiPress;
    if (!press) return null;
    const entryId = this.hub?.entry_id ?? null;
    if (!entryId || press.entryId !== entryId) return null;
    const elapsed = Date.now() - press.receivedAt;
    if (elapsed < 0 || elapsed >= SofabatonWifiCommandsTab._IR_FLASH_DURATION_MS) return null;
    if (this._irFlashClearForReceivedAt !== press.receivedAt) {
      if (this._irFlashClearTimer) clearTimeout(this._irFlashClearTimer);
      this._irFlashClearForReceivedAt = press.receivedAt;
      this._irFlashClearTimer = setTimeout(() => {
        this._irFlashClearTimer = null;
        this._irFlashClearForReceivedAt = null;
        this.requestUpdate();
      }, SofabatonWifiCommandsTab._IR_FLASH_DURATION_MS - elapsed + 16);
    }
    return press;
  }

  /** True when the press belongs to the given hub device id. Used both
   *  for the device-card glow (list view) and to gate the slot glow
   *  (detail view), so we never flash a slot on the wrong device. */
  private _pressMatchesDevice(
    press: WifiPressEvent,
    device: WifiDeviceSummary | null | undefined,
  ): boolean {
    if (!device || press.deviceId == null) return false;
    const deployedId = device.deployed_device_id;
    if (typeof deployedId !== "number") return false;
    return deployedId === press.deviceId;
  }

  /** True when the press targets the slot at `idx` of the currently
   *  selected device. Matches by command_index (authoritative — the
   *  same index the hub uses to dispatch the HTTP callback). */
  private _pressMatchesSlot(press: WifiPressEvent, idx: number): boolean {
    if (press.commandIndex == null) return false;
    if (press.commandIndex !== idx) return false;
    return this._pressMatchesDevice(press, this._selectedWifiDevice());
  }

  private _hideUiActionTypeSelector(actionSelector: HTMLElement) {
    const hideInNode = (node: ParentNode | null | undefined) => {
      if (!node || typeof node.querySelectorAll !== "function") return;
      node.querySelectorAll(".dropdown").forEach((dropdown) => {
        const element = dropdown as HTMLElement;
        element.style.display = "none";
        element.setAttribute("aria-hidden", "true");
      });
    };

    const tryHide = () => {
      [actionSelector, actionSelector.shadowRoot].forEach((node) => {
        hideInNode(node);
        const uiAction = node?.querySelector?.("ha-selector-ui_action");
        if (uiAction) {
          hideInNode(uiAction);
          hideInNode((uiAction as HTMLElement).shadowRoot);
          const editorInLight = uiAction.querySelector?.("hui-action-editor");
          if (editorInLight) {
            hideInNode(editorInLight);
            hideInNode((editorInLight as HTMLElement).shadowRoot);
          }
          const editorInShadow = (uiAction as HTMLElement).shadowRoot?.querySelector?.("hui-action-editor");
          if (editorInShadow) {
            hideInNode(editorInShadow);
            hideInNode((editorInShadow as HTMLElement).shadowRoot);
          }
        }
      });
    };

    [0, 50, 150, 350, 700].forEach((delay) => {
      window.setTimeout(() => tryHide(), delay);
    });
  }
}

if (!customElements.get("sofabaton-wifi-commands-tab")) {
  customElements.define("sofabaton-wifi-commands-tab", SofabatonWifiCommandsTab);
}



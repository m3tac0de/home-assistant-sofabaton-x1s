import { LitElement, css, html, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import type { ControlPanelHubState, HassLike } from "../shared/ha-context";
import { entityForHub, proxyClientConnected, remoteAttrsForHub } from "../shared/utils/control-panel-selectors";

const SLOT_COUNT = 10;
const INPUT_ICON = "mdi:video-input-hdmi";

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

const DEFAULT_KEY_LABELS: Record<string, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  ok: "OK",
  back: "Back",
  home: "Home",
  menu: "Menu",
  volup: "Vol +",
  voldn: "Vol -",
  mute: "Mute",
  chup: "Ch +",
  chdn: "Ch -",
  guide: "Guide",
  dvr: "DVR",
  play: "Play",
  exit: "Exit",
  rew: "Rewind",
  pause: "Pause",
  fwd: "Fast Forward",
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
  a: "A",
  b: "B",
  c: "C",
};

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

const X2_ONLY_HARD_BUTTON_IDS = new Set([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);
const DEFAULT_ACTION = { action: "perform-action" };

type PressType = "short" | "long";
type ActiveModal = "details" | "action" | null;

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
}

class SofabatonWifiCommandsTab extends LitElement {
  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    setHubCommandBusy: { attribute: false },
    refreshControlPanelState: { attribute: false },
    hubCommandBusy: { type: Boolean },
    hubCommandBusyLabel: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    _commandsData: { state: true },
    _wifiDevices: { state: true },
    _selectedDeviceKey: { state: true },
    _configLoadedForEntryId: { state: true },
    _commandConfigLoading: { state: true },
    _deviceListLoading: { state: true },
    _syncState: { state: true },
    _commandSyncLoading: { state: true },
    _commandSyncRunning: { state: true },
    _activeCommandSlot: { state: true },
    _activeCommandModal: { state: true },
    _confirmClearSlot: { state: true },
    _commandSaveError: { state: true },
    _activeCommandActionTab: { state: true },
    _syncWarningOpen: { state: true },
    _syncWarningOptOut: { state: true },
    _hubVersionModalOpen: { state: true },
    _hubVersionModalSelectedVersion: { state: true },
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
  };

  static styles = css`
    :host { display: flex; flex: 1; min-height: 0; }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow: hidden; }
    .list-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; margin: -16px; }
    .list-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 16px 16px; }
    .detail-view { min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; margin: -16px; }
    .sticky-header, .sticky-footer { position: sticky; z-index: 2; background: var(--ha-card-background, var(--card-background-color)); }
    .sticky-header { padding: 12px 16px; }
    .sticky-header { top: 0; border-bottom: 1px solid var(--divider-color); }
    .sticky-footer { bottom: 0; border-top: 1px solid var(--divider-color); padding: 0; }
    .detail-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
    .detail-title-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
    .detail-title { font-size: 18px; font-weight: 700; color: var(--primary-text-color); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .back-btn, .list-action-btn, .detail-sync-btn, .device-delete-btn { border: 1px solid var(--divider-color); border-radius: 10px; background: transparent; color: var(--primary-text-color); font: inherit; }
    .back-btn, .list-action-btn, .detail-sync-btn { padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .back-btn { display: inline-flex; align-items: center; gap: 8px; }
    .list-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; column-gap: 16px; row-gap: 8px; }
    .list-header-copy { min-width: 0; }
    .list-header-copy .acc-title { display: block; }
    .list-header-copy .section-subtitle { margin-top: 8px; }
    .list-header-action { grid-column: 2; grid-row: 1; align-self: start; }
    .device-list { display: grid; gap: 10px; }
    .device-card { width: 100%; max-width: 100%; box-sizing: border-box; border: 1px solid var(--divider-color); border-radius: 18px; padding: 10px 14px; background: var(--ha-card-background, var(--card-background-color)); text-align: left; display: flex; align-items: center; gap: 14px; cursor: pointer; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .device-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
    .device-card.pending-delete { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 45%, var(--divider-color)); }
    .device-card:hover, .back-btn:hover, .list-action-btn:hover, .detail-sync-btn:hover, .device-delete-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .device-card-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 16px; }
    .device-card-lead { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .device-card-lead ha-icon { --mdc-icon-size: 20px; }
    .device-card-name { font-size: 14px; font-weight: 700; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .device-card-meta { font-size: 12px; color: var(--secondary-text-color); display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; margin-left: auto; }
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
    .device-card-count { white-space: nowrap; font-size: 13px; color: var(--primary-text-color); }
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
    .empty-state-card { border: 1px dashed var(--divider-color); border-radius: 14px; padding: 18px; color: var(--secondary-text-color); line-height: 1.5; }
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
    .hub-version-warn-btn { width: 100%; border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 45%, var(--divider-color)); border-radius: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--warning-color, #ff9800) 10%, transparent); color: var(--primary-text-color); text-align: left; font: inherit; font-weight: 600; cursor: pointer; }
    .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--divider-color); border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 82%, transparent); }
    .sync-row.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); }
    .sync-row.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); }
    .sync-row.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); }
    .sync-message-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
    .sync-message { font-size: 13px; line-height: 1.4; }
    .sync-btn, .dialog-btn, .slot-action-btn, .sync-static { border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .sync-btn, .dialog-btn, .slot-action-btn, .activity-chip, .checkbox-row, .slot-btn, .icon-btn, .version-chip, .action-tab { cursor: pointer; }
    .sync-btn:hover, .dialog-btn:hover, .slot-action-btn:hover, .activity-chip:hover, .version-chip:hover, .action-tab:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .sync-btn-primary, .dialog-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .sync-static { opacity: 0.65; cursor: default; }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: left; display: flex; flex-direction: column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
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
    .slot-clear { width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; padding: 0; opacity: 0.9; }
    .slot-flag { cursor: default; }
    .slot-flag.power-on { color: #2e7d32; border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color)); }
    .slot-flag.power-off { color: #c62828; border-color: color-mix(in srgb, #c62828 35%, var(--divider-color)); }
    .slot-flag.power-both { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 35%, var(--divider-color)); }
    .slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
    .slot-clear ha-icon { --mdc-icon-size: 16px; }
    .slot-flag ha-icon { --mdc-icon-size: 14px; }
    .slot-clear { cursor: pointer; }
    .slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
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
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
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
      border-radius: 10px;
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
      border-radius: 12px;
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
    .config-group { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--divider-color); border-radius: 14px; background: color-mix(in srgb, var(--ha-card-background, transparent) 92%, #000); }
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
    .checkbox-icon.power-on { color: #2e7d32; background: color-mix(in srgb, #2e7d32 18%, var(--ha-card-background, transparent)); }
    .checkbox-icon.power-off { color: #c62828; background: color-mix(in srgb, #c62828 18%, var(--ha-card-background, transparent)); }
    .checkbox-icon.input { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, var(--ha-card-background, transparent)); }
    .checkbox-copy > span:first-child { font-size: 14px; line-height: 1.35; }
    .checkbox-subtext { min-height: 1.35em; font-size: 12px; line-height: 1.35; color: var(--secondary-text-color); white-space: normal; }
    .checkbox-row ha-switch { align-self: center; }
    .checkbox-row.nested-control { padding-left: 36px; }
    .input-selector-wrap.nested-control { box-sizing: border-box; padding-left: 36px; }
    .activities-label, .warning-label, .action-helper { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); }
    .activities-label.disabled { opacity: 0.55; }
    .input-selector-wrap[disabled] { opacity: 0.6; pointer-events: none; }
    .activity-chip-row, .version-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .activity-chip, .version-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; font: inherit; }
    .activity-chip.active, .version-chip.active, .action-tab.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); color: var(--primary-color); }
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
    .dialog-body ha-textfield,
    .dialog-body ha-selector {
      width: 100%;
      --input-fill-color: var(--ha-color-form-background);
      --mdc-theme-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-hover-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-disabled-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, black);
      --mdc-text-field-idle-line-color: var(--divider-color);
      --mdc-text-field-hover-line-color: var(--primary-color);
      --mdc-text-field-focused-line-color: var(--primary-color);
      --mdc-text-field-label-ink-color: var(--secondary-text-color);
      --mdc-text-field-ink-color: var(--primary-text-color);
      --mdc-text-field-input-text-color: var(--primary-text-color);
      --text-field-hover-color: var(--primary-text-color);
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
    @media (max-width: 640px) {
      .command-grid { grid-template-columns: 1fr; }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small { width: 100%; max-height: 100%; border-radius: 0 0 16px 16px; }
      .dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
      .list-header { grid-template-columns: 1fr; }
      .list-header-action { grid-column: 1; grid-row: auto; width: 100%; }
      .list-header-action > .detail-sync-btn { width: 100%; justify-content: center; }
      .detail-title-row { gap: 8px; }
      .detail-title-main { min-width: 0; flex: 1; }
      .detail-sync-btn { flex: 0 0 auto; max-width: 44%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .device-card { align-items: center; gap: 10px; padding: 10px 12px; }
      .device-card-main { align-items: center; flex-direction: row; gap: 10px; }
      .device-card-name { flex: 1; }
      .device-card-meta { margin-left: auto; flex-wrap: nowrap; gap: 8px; }
      .device-card-count { font-size: 12px; }
      .device-status-pill { padding: 6px; min-width: 32px; justify-content: center; }
      .device-status-pill-label { display: none; }
      .sync-row { align-items: flex-start; flex-direction: column; }
    }
  `;

  declare hass: HassLike | null;
  declare hub: ControlPanelHubState | null;
  setHubCommandBusy?: ((busy: boolean, label?: string | null) => void) | null;
  refreshControlPanelState?: (() => Promise<void> | void) | null;
  hubCommandBusy = false;
  hubCommandBusyLabel: string | null = null;
  declare loading: boolean;
  declare error: string | null;

  private _commandsData: WifiCommandSlot[] = this._normalizeCommandsForStorage([]);
  private _wifiDevices: WifiDeviceSummary[] = [];
  private _selectedDeviceKey: string | null = null;
  private _configLoadedForEntryId: string | null = null;
  private _commandConfigLoading = false;
  private _deviceListLoading = false;
  private _syncState: SyncState = this._defaultSyncState();
  private _commandSyncLoading = false;
  private _commandSyncRunning = false;
  private _commandSyncPollTimer: number | null = null;
  private _activeCommandSlot: number | null = null;
  private _activeCommandModal: ActiveModal = null;
  private _confirmClearSlot: number | null = null;
  private _commandSaveError = "";
  private _activeCommandActionTab: PressType = "short";
  private _syncWarningOpen = false;
  private _syncWarningOptOut = false;
  private _hubVersionModalOpen = false;
  private _hubVersionModalSelectedVersion = "X1";
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

  connectedCallback() {
    super.connectedCallback();
    void this._ensureLoadedForCurrentHub();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearPollTimer();
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub") || changed.has("hass")) void this._ensureLoadedForCurrentHub();
    this._scheduleSyncPoll();
    this.renderRoot
      .querySelectorAll<HTMLElement>("ha-selector[data-hide-action-type='1']")
      .forEach((element) => this._hideUiActionTypeSelector(element));
  }

  protected render() {
    if (this.loading) return html`<div class="state">Loading…</div>`;
    if (this.error) return html`<div class="state error">${this.error}</div>`;
    if (!this.hub) return html`<div class="state">No hubs found.</div>`;
    if (proxyClientConnected(this.hass, this.hub)) {
      return html`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">Wifi Commands unavailable</div>
            <div class="blocked-state-sub">Wifi Commands cannot be used while the Sofabaton app is connected to the hub through the proxy.</div>
          </div>
        </div>
      `;
    }

    const selectedDevice = this._selectedWifiDevice();
    if (!selectedDevice) {
      return html`
        <div class="tab-panel">
          ${this._renderDeviceListView()}
          ${this._renderDetailsModal()}
          ${this._renderActionModal()}
          ${this._renderSyncWarningModal()}
          ${this._renderHubVersionModal()}
          ${this._renderCreateDeviceModal()}
          ${this._renderDeleteDeviceModal()}
        </div>
      `;
    }
    const remoteUnavailable = this._remoteUnavailable();
    const syncRunning = this._syncState.status === "running";
    const syncMessage = this._syncMessage(remoteUnavailable);

    return this._renderSelectedDeviceView({
      selectedDevice,
      remoteUnavailable,
      syncRunning,
      syncMessage,
    });

    return html`
      <div class="tab-panel">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <button class="back-btn" @click=${this._goBackToDeviceList}>
                <ha-icon icon="mdi:arrow-left"></ha-icon>
              </button>
              <div class="detail-title">${selectedDevice.device_name}</div>
            </div>
          </div>
          <div class="detail-scroll">
            ${this._hubVersionConfident() ? nothing : html`
              <button class="hub-version-warn-btn" @click=${this._openHubVersionModal}>
                Your hub may be miss-versioned. Click here to fix it.
              </button>
            `}
        ${this._hubVersionConfident() ? nothing : html`
          <button class="hub-version-warn-btn" @click=${this._openHubVersionModal}>
            ⚠️ Your hub may be miss-versioned! Click here to fix it.
          </button>
        `}
        <div class="sync-row ${syncTone}">
          <div class="sync-message-wrap">
            <span class="status-pill ${syncTone}">
              <ha-icon icon=${this._syncStatusIcon(remoteUnavailable)}></ha-icon>
              <span>${this._syncMessageShort(remoteUnavailable)}</span>
            </span>
            <div class="sync-message">${syncMessage}</div>
          </div>
          ${remoteUnavailable ? nothing : syncRunning ? html`<div class="sync-static">Syncing…</div>` : this._syncState.sync_needed ? html`
            <button class="sync-btn sync-btn-primary" ?disabled=${this._commandSyncRunning} @click=${this._runCommandConfigSync}>Sync to Hub</button>
          ` : nothing}
        </div>
        ${remoteUnavailable ? nothing : html`
          <div class="command-grid">
            ${this._commandsList().map((command, idx) => this._renderSlot(command, idx))}
          </div>
        `}
          </div>
        </div>
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderHubVersionModal()}
        ${this._renderCreateDeviceModal()}
        ${this._renderDeleteDeviceModal()}
      </div>
    `;
  }

  private _renderSelectedDeviceView({
    selectedDevice,
    remoteUnavailable,
    syncRunning,
    syncMessage,
  }: {
    selectedDevice: WifiDeviceSummary;
    remoteUnavailable: boolean;
    syncRunning: boolean;
    syncMessage: string;
  }) {
    const externallyLocked = this._hubCommandLocked() && !this._commandSyncRunning;
    const syncDockMessage = externallyLocked ? this._effectiveHubCommandLabel() : syncMessage;
    return html`
      <div class="tab-panel">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._goBackToDeviceList}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title">${selectedDevice.device_name}</div>
              </div>
              ${this._renderSyncActionButton({ remoteUnavailable, syncRunning, externallyLocked })}
            </div>
          </div>
          <div class="detail-scroll">
            ${this._hubVersionConfident() ? nothing : html`
              <button class="hub-version-warn-btn" @click=${this._openHubVersionModal}>
                Your hub may be miss-versioned. Click here to fix it.
              </button>
            `}
            ${remoteUnavailable ? nothing : html`
              <div class="command-grid">
                ${this._commandsList().map((command, idx) => this._renderSlot(command, idx))}
              </div>
            `}
          </div>
          <div class="sticky-footer">
            ${this._renderStatusDock(syncDockMessage, this._syncDockTone(remoteUnavailable, externallyLocked))}
          </div>
        </div>
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderHubVersionModal()}
        ${this._renderCreateDeviceModal()}
        ${this._renderDeleteDeviceModal()}
      </div>
    `;
    return html`
      <div class="tab-panel">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <button class="back-btn" @click=${this._goBackToDeviceList}>
                <ha-icon icon="mdi:arrow-left"></ha-icon>
              </button>
              <div class="detail-title">${selectedDevice.device_name}</div>
            </div>
          </div>
          <div class="detail-scroll">
            ${this._hubVersionConfident() ? nothing : html`
              <button class="hub-version-warn-btn" @click=${this._openHubVersionModal}>
                Your hub may be miss-versioned. Click here to fix it.
              </button>
            `}
            ${remoteUnavailable ? nothing : html`
              <div class="command-grid">
                ${this._commandsList().map((command, idx) => this._renderSlot(command, idx))}
              </div>
            `}
          </div>
          <div class="sticky-footer">
            <button
              class="bottom-dock-trigger ${!remoteUnavailable && !syncRunning && this._syncState.sync_needed ? "interactive" : ""}"
              ?disabled=${remoteUnavailable || syncRunning || !this._syncState.sync_needed}
              @click=${!remoteUnavailable && !syncRunning && this._syncState.sync_needed ? this._runCommandConfigSync : null}
            >
            <div class="bottom-dock">
              <div class="bottom-dock-main">
                <div class="bottom-dock-copy">${syncMessage}</div>
              </div>
              <div class="bottom-dock-actions">
                ${remoteUnavailable ? nothing : syncRunning ? html`<div class="sync-static">Syncingâ€¦</div>` : this._syncState.sync_needed ? html`
                  <button class="sync-btn sync-btn-primary" ?disabled=${this._commandSyncRunning} @click=${this._runCommandConfigSync}>Sync to Hub</button>
                ` : html`
                  <span class="status-pill ${syncTone}">
                    <ha-icon icon=${this._syncStatusIcon(remoteUnavailable)}></ha-icon>
                    <span>${shortSyncMessage}</span>
                  </span>
                `}
              </div>
            </div>
          </div>
        </div>
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderHubVersionModal()}
        ${this._renderCreateDeviceModal()}
        ${this._renderDeleteDeviceModal()}
      </div>
    `;
  }

  private _renderDeviceListView() {
    const canAdd = this._wifiDevices.length < this._maxWifiDevices;
    return html`
      <div class="list-view">
        <div class="list-scroll">
          <div class="list-header">
            <div class="list-header-copy">
              <div class="acc-title">WIFI DEVICES</div>
              <div class="section-subtitle">Choose a Wifi Device to edit its command slots, or add a new one.</div>
            </div>
            <div class="list-header-action">
              <button class="detail-sync-btn" ?disabled=${!canAdd || this._hubCommandLocked() || this._creatingDevice} @click=${this._openCreateDeviceModal}>
                Add Wifi Device
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
                </div>
              `)}
            </div>
          ` : html`<div class="empty-state-card">No Wifi Devices configured yet. Add one to start assigning command slots.</div>`}
        </div>
        <div class="sticky-footer">
          ${this._renderStatusDock(this._listDockLabel(canAdd), this._listDockTone(canAdd))}
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
            <div class="dialog-title">Add Wifi Device</div>
            <button class="dialog-close" @click=${this._closeCreateDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <ha-textfield
              .label=${"Device name"}
              .maxLength=${20}
              .value=${this._newDeviceName}
              @input=${(event: Event) => {
                const input = event.currentTarget as HTMLInputElement;
                const value = this._sanitizeWifiDeviceName(input.value);
                input.value = value;
                this._newDeviceName = value;
                this._deviceMutationError = "";
              }}
              @change=${(event: Event) => {
                const input = event.currentTarget as HTMLInputElement;
                const value = this._sanitizeWifiDeviceName(input.value);
                input.value = value;
                this._newDeviceName = value;
                this._deviceMutationError = "";
              }}
              @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void this._createWifiDevice(); } }}
            ></ha-textfield>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" ?disabled=${this._creatingDevice} @click=${this._closeCreateDeviceModal}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" ?disabled=${this._creatingDevice} @click=${this._createWifiDevice}>Create</button>
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
            <div class="dialog-title">Delete Wifi Device?</div>
            <button class="dialog-close" @click=${this._closeDeleteDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">Delete "${device.device_name}" from the hub and remove its saved command-slot configuration?</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteDeviceModal}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._deleteWifiDevice}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSlot(command: WifiCommandSlot, idx: number) {
    const isConfirming = this._confirmClearSlot === idx;
    const configured = this._isCommandConfigured(command, idx);
    if (isConfirming) {
      return html`
        <div class="slot-btn slot-confirming">
          <div class="slot-confirm-title">Clear command slot?</div>
          <div class="slot-confirm-sub">Resets configuration.</div>
          <div class="slot-confirm-actions">
            <button class="dialog-btn" @click=${() => { this._confirmClearSlot = null; }}>No</button>
            <button class="dialog-btn dialog-btn-primary" @click=${() => this._clearSlot(idx)}>Yes</button>
          </div>
        </div>
      `;
    }

    if (!configured) {
      return html`
        <button class="slot-btn slot-empty" @click=${() => this._openCommandEditor(idx)}>
          <div class="slot-main">
            <div style="font-size:28px;color:var(--secondary-text-color)">+</div>
            <div class="slot-name">Make Command</div>
          </div>
        </button>
      `;
    }

    const details = this._commandSlotSummaryDetails(command);
    const metaLabel = this._commandSlotMetaLabel(command);
    const unconfiguredCommand = this._isUnconfiguredCommand(command);

    return html`
      <div class="slot-btn">
        <div class="slot-actions">
          ${command.is_power_on && command.is_power_off
            ? html`<span class="slot-flag power-both" title="Power ON and OFF command"><ha-icon icon="mdi:power"></ha-icon></span>`
            : command.is_power_on
              ? html`<span class="slot-flag power-on" title="Power ON command"><ha-icon icon="mdi:power"></ha-icon></span>`
              : command.is_power_off
                ? html`<span class="slot-flag power-off" title="Power OFF command"><ha-icon icon="mdi:power"></ha-icon></span>`
                : nothing}
          ${this._hasInputActivity(command)
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
          ${details.commandSummary === "No Action configured" ? "No Action configured" : `> ${details.service}`}
        </button>
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
            <div class="dialog-title">Command Slot ${slotIndex + 1}</div>
            <button class="dialog-close" @click=${this._closeCommandEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Create a Command in this slot. Give it a name and decide which Activities to apply it to. The name will appear on your remote’s display, in the mobile app, and as the Wifi Command's sensor status.
            </div>
            <div class="config-block">
              <div class="config-group">
                <ha-textfield
                  .label=${"Command Display Name"}
                  .maxLength=${20}
                  .value=${draft.name}
                  @input=${(event: Event) => {
                    const input = event.currentTarget as HTMLInputElement;
                    const value = this._sanitizeCommandName(input.value);
                    if (input.value !== value) input.value = value;
                  }}
                  @change=${(event: Event) => {
                    const input = event.currentTarget as HTMLInputElement;
                    const value = this._sanitizeCommandName(input.value);
                    input.value = value;
                    this._updateActiveCommandDraft({ name: value });
                    this._commandSaveError = "";
                  }}
                ></ha-textfield>
                <button
                  class="advanced-toggle ${this._advancedOptionsOpen ? "expanded" : ""}"
                  @click=${() => {
                    this._advancedOptionsOpen = !this._advancedOptionsOpen;
                  }}
                  aria-expanded=${String(this._advancedOptionsOpen)}
                >
                  <span class="advanced-toggle-copy">
                    <span>Advanced</span>
                  </span>
                  <ha-icon icon="mdi:chevron-down"></ha-icon>
                </button>
                ${this._advancedOptionsOpen ? html`
                  <div class="advanced-panel">
                    <button class="checkbox-row ${draft.is_power_on ? "active" : ""}" @click=${() => {
                      this._togglePowerCommandRow("on");
                    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon power-on"><ha-icon icon="mdi:power"></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>Set as Power ON command</span>
                          <span class="checkbox-subtext">${this._powerReplacementLabel("on")}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${draft.is_power_on}
                        @click=${(event: Event) => event.stopPropagation()}
                        @change=${(event: Event) => this._handlePowerCommandSwitchChange("on", event)}
                      ></ha-switch>
                    </button>
                    <button class="checkbox-row ${draft.is_power_off ? "active" : ""}" @click=${() => {
                      this._togglePowerCommandRow("off");
                    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon power-off"><ha-icon icon="mdi:power"></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>Set as Power OFF command</span>
                          <span class="checkbox-subtext">${this._powerReplacementLabel("off")}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${draft.is_power_off}
                        @click=${(event: Event) => event.stopPropagation()}
                        @change=${(event: Event) => this._handlePowerCommandSwitchChange("off", event)}
                      ></ha-switch>
                    </button>
                    <button class="checkbox-row ${inputSelectionEnabled ? "active" : ""}" ?disabled=${!hasActivities} @click=${() => {
                      this._toggleInputActivityRow();
                    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon input"><ha-icon icon=${INPUT_ICON}></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>Set as Activity input</span>
                          <span class="checkbox-subtext">${hasActivities ? "Command called as part of Activity startup sequence" : "No activities available for this hub."}</span>
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
                        .label=${"Activity to apply the input to"}
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
                    <span>Set as Favorite</span>
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
                  .label=${"Physical Button Assignment"}
                  .value=${this._selectorValueForButton(draft)}
                  @value-changed=${(event: CustomEvent) => this._handleHardButtonChanged(event)}
                ></ha-selector>
                <button class="checkbox-row nested-control ${hasMappedButton && draft.long_press_enabled ? "active" : ""}" ?disabled=${!hasMappedButton} @click=${() => {
                  this._toggleLongPressRow();
                }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>
                    <span>Enable long-press</span>
                  </span>
                  <ha-switch
                    .checked=${hasMappedButton && draft.long_press_enabled}
                    .disabled=${!hasMappedButton}
                    @click=${(event: Event) => event.stopPropagation()}
                    @change=${(event: Event) => this._handleLongPressSwitchChange(event)}
                  ></ha-switch>
                </button>
                <div class="activities-label ${activitySelectionEnabled ? "" : "disabled"}">Apply to these Activities</div>
                <div class="activity-chip-row">
                  ${activities.length ? activities.map((activity) => html`
                    <button
                      class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""} ${activitySelectionEnabled ? "" : "disabled"}"
                      ?disabled=${!activitySelectionEnabled}
                      @click=${(event: Event) => this._toggleActivity(activity.id, event)}
                    >
                      ${activity.name}
                    </button>
                  `) : html`<div class="empty-hint">No activities available for this hub.</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandEditor}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>Save</button>
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
            <div class="dialog-title">Command Slot ${Number(this._activeCommandSlot) + 1} Action</div>
            <button class="dialog-close" @click=${this._closeCommandActionEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Run an Action whenever the command is performed. Configuring an Action is optional; you can create your own automations that trigger from the Wifi Commands sensor.
            </div>
            <div class="config-block">
              ${draft.long_press_enabled ? html`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>Short press</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>Long press</button>
                </div>
              ` : nothing}
              <div class="action-helper">${activeTab === "long" ? "Select Long-Press Action" : "Select Triggered Action"}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${keyed(this._shortSelectorVersion, html`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${"Action"}
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
                    .label=${"Action"}
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
              <button class="dialog-btn" @click=${this._closeCommandActionEditor}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>Save</button>
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
            <div class="dialog-title">Sync commands to hub?</div>
            <button class="dialog-close" @click=${() => { this._syncWarningOpen = false; }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text sync-warning-text">
              This sync can run for several minutes. During this process, other interactions with the hub are blocked.<br /><br />
              At the end of deployment, the physical remote will be force-resynced. It is recommended to finish your full Wifi Commands setup first, then sync once.
            </div>
            <label class="warning-optout">
              <input type="checkbox" .checked=${this._syncWarningOptOut} @change=${(event: Event) => { this._syncWarningOptOut = (event.currentTarget as HTMLInputElement).checked; }} />
              <span>Don’t show this warning again for this remote.</span>
            </label>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => { this._syncWarningOpen = false; }}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._confirmSyncWarning}>Start sync</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderHubVersionModal() {
    if (!this._hubVersionModalOpen) return nothing;
    return html`
      <div class="modal-backdrop" @click=${() => { this._hubVersionModalOpen = false; }}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Unknown hub version</div>
            <button class="dialog-close" @click=${() => { this._hubVersionModalOpen = false; }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">
              We couldn’t automatically detect your hub model. Select the correct version below — the change takes effect immediately, no restart needed.
            </div>
            <div class="version-chip-row">
              ${["X1", "X1S", "X2"].map((version) => html`
                <button class="version-chip ${this._hubVersionModalSelectedVersion === version ? "active" : ""}" @click=${() => { this._hubVersionModalSelectedVersion = version; }}>
                  ${version}
                </button>
              `)}
            </div>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => { this._hubVersionModalOpen = false; }}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._submitHubVersionModal}>Confirm</button>
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
    }
    if (this._configLoadedForEntryId === entryId && !this._deviceListLoading && !this._commandConfigLoading && !this._commandSyncLoading) return;
    await this._loadWifiDevices(true);
    if (this._selectedDeviceKey) {
      await this._loadCommandConfigFromBackend(true);
      await this._loadCommandSyncProgress(true);
    }
    this._configLoadedForEntryId = entryId;
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

  private _hubVersionConfident() {
    return this._remoteAttrs()?.hub_version_confident !== false;
  }

  private _supportsUnicodeCommandNames() {
    const version = this._hubVersion();
    return version.includes("X2") || version.includes("X1S");
  }

  private _sanitizeCommandName(value: unknown) {
    const pattern = this._supportsUnicodeCommandNames()
      ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu
      : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }

  private _sanitizeWifiDeviceName(value: unknown) {
    return this._sanitizeCommandName(value);
  }

  private _setSharedHubCommandBusy(busy: boolean, label: string | null = null) {
    this.setHubCommandBusy?.(busy, label);
    this.dispatchEvent(new CustomEvent("sofabaton-hub-command-busy-changed", {
      detail: { busy, label },
      bubbles: true,
      composed: true,
    }));
  }

  private async _refreshControlPanelState() {
    await this.refreshControlPanelState?.();
  }

  private _hubCommandLocked() {
    return Boolean(this.hubCommandBusy);
  }

  private _effectiveHubCommandLabel() {
    return String(this.hubCommandBusyLabel || "").trim() || "Hub command in progress…";
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

  private _normalizeCommandsForStorage(
    nextCommands: unknown,
    powerOnCommandId: unknown = null,
    powerOffCommandId: unknown = null,
  ): WifiCommandSlot[] {
    const normalizedPowerOnId = this._normalizePowerCommandId(powerOnCommandId);
    const normalizedPowerOffId = this._normalizePowerCommandId(powerOffCommandId);
    return Array.from({ length: SLOT_COUNT }, (_, idx) => {
      const item = Array.isArray(nextCommands) ? nextCommands[idx] ?? {} : {};
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        ...this._commandSlotDefault(idx),
        name: this._sanitizeCommandName(record.name ?? `Command ${idx + 1}`),
        add_as_favorite:
          record.add_as_favorite === undefined ? this._commandSlotDefault(idx).add_as_favorite : Boolean(record.add_as_favorite),
        hard_button: String(record.hard_button ?? ""),
        long_press_enabled: Boolean(record.long_press_enabled) && Boolean(String(record.hard_button ?? "").trim()),
        is_power_on: normalizedPowerOnId === idx + 1,
        is_power_off: normalizedPowerOffId === idx + 1,
        input_activity_id: String(record.input_activity_id ?? ""),
        activities: Array.isArray(record.activities) ? record.activities.map((id) => String(id)).filter((id) => id !== "") : [],
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
    if (!entityId || !this.hass?.callWS) return;
    if (this._deviceListLoading && !force) return;
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
            : "No Action configured",
    };
  }

  private _commandHasCustomAction(action: unknown) {
    const details = this._commandActionDetails(action);
    return details.service !== "perform-action" || details.entities !== "No target entity";
  }

  private _commandSlotSummaryDetails(command: WifiCommandSlot) {
    const shortDetails = this._commandActionDetails(command.action);
    if (shortDetails.commandSummary !== "No Action configured") return shortDetails;
    if (!command.long_press_enabled) return shortDetails;
    const longDetails = this._commandActionDetails(command.long_press_action);
    return longDetails.commandSummary !== "No Action configured" ? longDetails : shortDetails;
  }

  private _commandSaveValidationMessage(slot: WifiCommandSlot | null = null) {
    const draft = slot || this._activeCommandDraft();
    if (!draft) return "";
    if (!String(draft.name ?? "").length || String(draft.name).startsWith(" ")) {
      return "Command name must start with a non-space character.";
    }
    if (
      !draft.add_as_favorite &&
      !String(draft.hard_button || "").trim() &&
      !draft.is_power_on &&
      !draft.is_power_off &&
      !this._hasInputActivity(draft)
    ) {
      return "Set a power command, input activity, add as favorite, or map to button before saving.";
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
        label: `${title} • ${DEFAULT_KEY_LABELS[key]}`,
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
    if (this._isUnconfiguredCommand(command)) return "Unconfigured command";
    if (!assignmentEnabled && command.is_power_on && command.is_power_off) return "Power ON and OFF command";
    if (!assignmentEnabled && command.is_power_on) return "Power ON command";
    if (!assignmentEnabled && command.is_power_off) return "Power OFF command";
    if (!assignmentEnabled && this._hasInputActivity(command)) return `Input for ${this._activityName(command.input_activity_id)}`;
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

  private _powerReplacementSlot(kind: "on" | "off") {
    if (!Number.isInteger(this._activeCommandSlot)) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      const isMatch = kind === "on" ? Boolean(commands[idx].is_power_on) : Boolean(commands[idx].is_power_off);
      if (isMatch) return { index: idx, slot: commands[idx] };
    }
    return null;
  }

  private _powerReplacementLabel(kind: "on" | "off") {
    const draft = this._activeCommandDraft();
    if (kind === "on" && draft?.is_power_on) return "Command called as part of device power on sequence";
    if (kind === "off" && draft?.is_power_off) return "Command called as part of device power off sequence";
    const replacement = this._powerReplacementSlot(kind);
    if (!replacement) return `No current ${kind} command set`;
    const name = String(replacement.slot.name || "").trim() || `Command ${replacement.index + 1}`;
    return `Replaces "${name}" as the ${kind} command`;
  }

  private _setPowerCommandFlag(kind: "on" | "off", enabled: boolean) {
    if (!Number.isInteger(this._activeCommandSlot)) return;
    const key = kind === "on" ? "is_power_on" : "is_power_off";
    const idx = Number(this._activeCommandSlot);
    const nextDrafts = { ...this._commandEditorDrafts };
    if (enabled) {
      Object.entries(nextDrafts).forEach(([draftIdx, draft]) => {
        if (Number(draftIdx) !== idx && draft) {
          nextDrafts[Number(draftIdx)] = this._cloneCommandSlot({ ...draft, [key]: false });
        }
      });
    }
    const current = this._ensureCommandDraft(idx);
    if (!current) return;
    nextDrafts[idx] = this._cloneCommandSlot({
      ...current,
      [key]: enabled,
      input_activity_id: enabled ? "" : current.input_activity_id,
    });
    this._commandEditorDrafts = nextDrafts;
    this._commandSaveError = "";
  }

  private _togglePowerCommandRow(kind: "on" | "off") {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    this._setPowerCommandFlag(kind, !Boolean(kind === "on" ? draft.is_power_on : draft.is_power_off));
  }

  private _handlePowerCommandSwitchChange(kind: "on" | "off", event: Event) {
    const checked = Boolean((event.currentTarget as HTMLInputElement).checked);
    this._setPowerCommandFlag(kind, checked);
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
    if (remoteUnavailable) return "Remote entity unavailable. Is the app connected?";
    if (this._syncState.status === "running") {
      const total = Number(this._syncState.total_steps || 0);
      const current = Number(this._syncState.current_step || 0);
      const progress = total > 0 ? ` (${Math.min(current, total)}/${total})` : "";
      return `${String(this._syncState.message || "Sync in progress")}${progress}`;
    }
    if (this._syncState.status === "failed") return String(this._syncState.message || "Last sync failed.");
    if (this._syncState.sync_needed) return "Command config changes need to be synced to the hub.";
    if (this._syncState.status === "success") return "Hub command configuration is up to date.";
    return "No sync needed.";
  }

  private _syncMessageShort(remoteUnavailable: boolean) {
    if (remoteUnavailable) return "Unavailable";
    if (this._syncState.status === "running") return "Syncing";
    if (this._syncState.status === "failed") return "Sync failed";
    if (this._syncState.sync_needed) return "Sync needed";
    if (this._syncState.status === "success") return "Up to date";
    return "Idle";
  }

  private _deviceStatusLabel(device: WifiDeviceSummary) {
    if (device.device_key === this._deletingDeviceKey) return "Deleting…";
    if (device.status === "running") return "Syncing";
    if (device.status === "failed") return "Sync failed";
    if (device.sync_needed) return "Sync needed";
    if (device.status === "success") return "Synced";
    return "Synced";
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

  private _listDockLabel(canAdd: boolean) {
    if (this._creatingDevice) return "Creating Wifi Device…";
    if (this._hubCommandLocked()) return this._effectiveHubCommandLabel();
    if (!canAdd) return `Maximum of ${this._maxWifiDevices} Wifi Devices reached`;
    return "Add Wifi Device";
  }

  private _listDockTone(canAdd: boolean) {
    if (this._creatingDevice || this._hubCommandLocked()) return "status-progress";
    if (!canAdd) return "status-warning";
    return "status-success";
  }

  private _syncDockTone(remoteUnavailable: boolean, externallyLocked: boolean) {
    if (remoteUnavailable || this._syncState.status === "failed") return "status-error";
    if (this._syncState.status === "running" || externallyLocked) return "status-progress";
    if (this._syncState.sync_needed) return "status-warning";
    return "status-success";
  }

  private _renderStatusDock(message: string, tone: string) {
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
      ? "Unavailable"
      : syncRunning
        ? "Syncing…"
        : externallyLocked
          ? "Busy"
          : this._syncState.sync_needed
            ? "Sync to Hub"
            : "Up to Date";
    const disabled = remoteUnavailable || syncRunning || externallyLocked || !this._syncState.sync_needed;
    const classes = `detail-sync-btn${!disabled && this._syncState.sync_needed ? " sync-btn-primary" : ""}`;
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
    this._syncState = this._defaultSyncState();
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
      this._deviceMutationError = "Device name is required.";
      return;
    }
    this._creatingDevice = true;
    this._setSharedHubCommandBusy(true, "Creating Wifi Device…");
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
      this._deviceMutationError = String((error as Error)?.message || "Unable to create Wifi Device");
    } finally {
      this._creatingDevice = false;
      this._setSharedHubCommandBusy(false);
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
    this._setSharedHubCommandBusy(true, "Deleting Wifi Device…");
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
      this._deviceMutationError = String((error as Error)?.message || "Unable to delete Wifi Device");
      this._deleteDeviceKey = deviceKey;
    } finally {
      this._deletingDeviceKey = null;
      this._setSharedHubCommandBusy(false);
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
      message: "Starting sync",
      sync_needed: true,
    };
    this._commandSyncRunning = true;
    this._wifiDevices = this._wifiDevices.map((device) =>
      device.device_key === deviceKey
        ? {
            ...device,
            ...this._syncState,
            status: "running",
          }
        : device,
    );
    this._setSharedHubCommandBusy(true, "Syncing Wifi Device…");
    try {
      await this.hass.callService("sofabaton_x1s", "sync_command_config", { entity_id: entityId, device_key: deviceKey });
    } catch (error) {
      this._syncState = {
        ...this._syncState,
        status: "failed",
        message: String((error as Error)?.message || "Sync failed to start"),
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
      await this._loadWifiDevices(true);
      await this._loadCommandSyncProgress(true);
      await this._refreshControlPanelState();
      this._setSharedHubCommandBusy(false);
    }
  }

  private _scheduleSyncPoll() {
    if (this._syncState.status !== "running" || this._remoteUnavailable()) {
      this._clearPollTimer();
      return;
    }
    if (this._commandSyncPollTimer != null) return;
    this._commandSyncPollTimer = window.setTimeout(async () => {
      this._commandSyncPollTimer = null;
      await this._loadCommandSyncProgress(true);
    }, 1000);
  }

  private _clearPollTimer() {
    if (this._commandSyncPollTimer != null) {
      window.clearTimeout(this._commandSyncPollTimer);
      this._commandSyncPollTimer = null;
    }
  }

  private _openHubVersionModal = () => {
    this._hubVersionModalSelectedVersion = this._hubVersion() || "X1";
    this._hubVersionModalOpen = true;
  };

  private _submitHubVersionModal = async () => {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    await this.hass.callWS({
      type: "sofabaton_x1s/hub/set_version",
      entity_id: entityId,
      version: this._hubVersionModalSelectedVersion,
    });
    this._hubVersionModalOpen = false;
  };

  private _hideUiActionTypeSelector(actionSelector: HTMLElement) {
    const hideInNode = (node: ParentNode | null | undefined) => {
      if (!node || typeof node.querySelectorAll !== "function") return;
      node.querySelectorAll(".dropdown").forEach((dropdown) => {
        const element = dropdown as HTMLElement;
        element.style.display = "none";
        element.setAttribute("aria-hidden", "true");
      });
      node.querySelectorAll("ha-selector-select, ha-control-select, ha-formfield").forEach((element) => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.textContent?.includes("Perform action")) {
          htmlElement.style.display = "none";
          htmlElement.setAttribute("aria-hidden", "true");
        }
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

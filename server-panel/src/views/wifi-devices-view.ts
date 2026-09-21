// The Wifi Commands tab's Wifi Devices subtab (docs/internal/server-panel-wifi-commands-plan.md,
// section 3): the HA control panel card's Wifi Devices, over the server's
// `/wifi-devices` routes. The roster, the create and delete dialogs, the
// detail view with its ten command slots, Sync to Hub, and the press glow.
// What the card has and this does not: Actions (the server relays a press
// on the event stream, the client decides), so a slot tile has no action
// button and is about half as tall. The slot dialog is the card's: name,
// the activity input, favorite, physical button with its long press, and
// the activities they apply to (plan section 6). The card's strings are
// imported where the wording carries over.

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import {
  mdiAlertCircle,
  mdiAlertCircleOutline,
  mdiAlphaACircleOutline,
  mdiAlphaBCircleOutline,
  mdiAlphaCCircleOutline,
  mdiArrowDownBold,
  mdiArrowLeft,
  mdiArrowLeftBold,
  mdiArrowRightBold,
  mdiArrowULeftTop,
  mdiArrowUpBold,
  mdiCheckCircleOutline,
  mdiChevronDown,
  mdiChevronDownCircleOutline,
  mdiChevronUpCircleOutline,
  mdiCircle,
  mdiClose,
  mdiCloseCircleOutline,
  mdiFastForward,
  mdiGestureTapButton,
  mdiHeart,
  mdiHomeOutline,
  mdiMenu,
  mdiPauseCircleOutline,
  mdiPencilOutline,
  mdiPlayCircleOutline,
  mdiPlus,
  mdiPower,
  mdiProgressClock,
  mdiRecordRec,
  mdiRewind,
  mdiTelevisionGuide,
  mdiTimerSandFull,
  mdiTrashCanOutline,
  mdiVideoInputHdmi,
  mdiVolumeMinus,
  mdiVolumeMute,
  mdiVolumePlus,
  mdiWifi,
} from "@mdi/js";

import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";

import { problemText, type ApiResponse, type CallbackListener, type JobView, type PanelApi, type WifiDeviceList, type WifiDeviceView } from "../panel-api";
import type { HubContext } from "../panel-context";
import { PANEL_BASE_CSS } from "../panel-styles";
import { EDITOR_CSS } from "./editor-styles";
import {
  PRESS_FLASH_MS,
  WIFI_NAME_MAX,
  activitiesEnabled,
  availableHardButtons,
  buttonCleanups,
  configuredCount,
  defaultSlotLabel,
  deviceStatus,
  draftFromSpec,
  draftsEqual,
  hardButtonByCode,
  isSlotConfigured,
  nameProblem,
  otherDeviceHoldingButton,
  pressIsFresh,
  pressMatchesDevice,
  pressMatchesSlot,
  sanitizeWifiName,
  slotEditFrom,
  slotHoldingButton,
  slotHoldingInput,
  slotMeta,
  specFromDraft,
  supportsPowerInput,
  targetMoved,
  withActivityToggled,
  withDefaultActivity,
  withPowerSlot,
  withSlotCleared,
  withSlotSaved,
  type SlotEdit,
  type WifiDraft,
} from "./wifi-devices-state";

const S = TOOLS_CARD_STRINGS.wifiCommands;
const A = TOOLS_CARD_STRINGS.activities;

// Where the card speaks of Home Assistant Actions, the panel speaks of the event stream.
const T = {
  subtitle: "Use Wifi Commands to put buttons on your physical remote that call this server. Every press arrives as a press event on the event stream. Choose a Wifi Device to edit its command slots, or add a new one.",
  slotDescription: "Create a Command in this slot. Give it a name and decide which activities to apply it to. The name will appear on your remote's display, in the mobile app, and on every press event.",
  deleteBody: (name: string) => `Delete "${name}" from the hub? The hub removes it from every activity that uses it.`,
  deleteReferenced: "Activities still use this device. Deleting it removes those favorites, buttons and macro steps too.",
  deleteAnyway: "Delete anyway",
  transportHttpHint: "The hub calls this server directly over your network.",
  renameTitle: "Rename Wifi Device",
  cleanupFailed: (name: string, why: string) => `Synced, but ${name} still claims a button this device took (${why}). Sync ${name} to settle it.`,
  redeploy: "Redeploy",
  staleNotice: "The hub no longer has this device (it was deleted in the app, or the hub was reset). Redeploy writes it again from what the server kept. Bindings in activities are gone and need to be made again.",
  pendingNotice: "An earlier write to this device was interrupted. The server settles it the next time it is synced or the server starts.",
  movedNotice: (was: string, now: string) => `This device calls ${was}, but the server now answers on ${now}. A deployed address cannot be moved: delete the device and add it again to use the new one.`,
  listenerDown: (port: string) => `The server's callback listener is not running${port ? ` (port ${port})` : ""}, so presses cannot arrive.`,
  listenerRetry: "Retry",
  callsBack: (where: string) => `Presses call ${where} and arrive on the event stream.`,
  x1Note: "An X1 hub fires its power and input callbacks on its own, so those options are not shown.",
  leaveBody: "This Wifi Device has changes that are not on the hub yet. Sync them now, or leave and lose them.",
};

const BUTTON_ICONS: Record<string, string> = {
  up: mdiArrowUpBold, down: mdiArrowDownBold, left: mdiArrowLeftBold, right: mdiArrowRightBold, ok: mdiCheckCircleOutline,
  back: mdiArrowULeftTop, home: mdiHomeOutline, menu: mdiMenu, volup: mdiVolumePlus, voldn: mdiVolumeMinus, mute: mdiVolumeMute,
  chup: mdiChevronUpCircleOutline, chdn: mdiChevronDownCircleOutline, guide: mdiTelevisionGuide, dvr: mdiRecordRec,
  play: mdiPlayCircleOutline, exit: mdiCloseCircleOutline, rew: mdiRewind, pause: mdiPauseCircleOutline, fwd: mdiFastForward,
  red: mdiCircle, green: mdiCircle, yellow: mdiCircle, blue: mdiCircle,
  a: mdiAlphaACircleOutline, b: mdiAlphaBCircleOutline, c: mdiAlphaCCircleOutline,
};
const BUTTON_COLORS: Record<string, string> = { red: "#ef4444", green: "#22c55e", yellow: "#facc15", blue: "#3b82f6" };
const BUTTON_GROUP_TITLES = { navigation: S.navigationGroup, transport: S.transportGroup, media: S.mediaGroup, abc: S.abcGroup, color: S.colorGroup } as const;

export const WIFI_DEVICES_VIEW_TAG = "sb-panel-wifi-devices";

interface CreateState { name: string; transport: string; busy: boolean; error: string }
interface DeleteState { key: string; busy: boolean; error: string; referenced: boolean }
interface SlotEditState { index: number; edit: SlotEdit; advanced: boolean; error: string }
interface ActivityOption { id: number; name: string }

function icon(path: string, cls = ""): TemplateResult {
  return html`<svg class="mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;
}

function jobFailure(job: JobView | null): string | null {
  if (!job) return "the job could not be followed";
  if (job.status === "done") return null;
  const problem = job.error;
  return problem ? [problem.title || problem.type, problem.detail].filter(Boolean).join(": ") : job.status;
}

export class SbPanelWifiDevices extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    deviceKey: { attribute: false },
    _list: { state: true },
    _activities: { state: true },
    _listener: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _draft: { state: true },
    _create: { state: true },
    _delete: { state: true },
    _slotEdit: { state: true },
    _rename: { state: true },
    _powerPicker: { state: true },
    _confirmClear: { state: true },
    _leave: { state: true },
    _working: { state: true },
    _syncError: { state: true },
    _flashTick: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    EDITOR_CSS,
    css`
      /* -- the roster (the card's .list-header / .device-card rules) --------------------------- */
      .list-header { display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: 16px; row-gap: 8px; margin-bottom: 14px; }
      .list-header-copy { flex: 1 1 240px; min-width: 0; }
      .section-subtitle { font-size: 13px; line-height: 1.5; color: var(--sbp-muted); }
      .list-header-action { flex: 0 0 auto; margin-left: auto; align-self: flex-start; }
      .device-list { display: grid; gap: 6px; }
      .device-card { position: relative; width: 100%; max-width: 100%; border: 1px solid var(--sbp-line); border-radius: 12px; padding: 9px 10px 9px 12px; background: var(--sbp-panel-2); text-align: left; display: flex; align-items: center; gap: 10px; cursor: pointer; overflow: hidden; transition: border-color 120ms ease, background-color 120ms ease; }
      .device-card:hover { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .device-card:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: 1px; }
      .device-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
      .device-card-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 8px; }
      .device-card-lead { color: var(--sbp-muted); display: inline-flex; flex: 0 0 auto; }
      .device-card-copy { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
      .device-card-name { font-size: 13px; font-weight: 700; line-height: 1.15; color: var(--sbp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .device-card-count { font-size: 10px; line-height: 1.05; color: var(--sbp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .device-card-meta { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; min-width: 0; }
      .status-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 700; border: 1px solid var(--sbp-line); background: var(--sbp-panel); white-space: nowrap; flex: 0 0 auto; }
      .status-pill .mdi { width: 18px; height: 18px; }
      .status-pill.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--sbp-line)); color: color-mix(in srgb, #2e7d32 40%, var(--sbp-text)); background: color-mix(in srgb, #48b851 16%, var(--sbp-panel)); }
      .status-pill.sync-error { border-color: color-mix(in srgb, var(--sbp-err) 35%, var(--sbp-line)); color: color-mix(in srgb, var(--sbp-err) 40%, var(--sbp-text)); background: color-mix(in srgb, var(--sbp-err) 12%, var(--sbp-panel)); }
      .status-pill.sync-running { border-color: color-mix(in srgb, var(--sbp-accent) 35%, var(--sbp-line)); color: color-mix(in srgb, var(--sbp-accent) 40%, var(--sbp-text)); background: color-mix(in srgb, var(--sbp-accent) 12%, var(--sbp-panel)); }
      .status-pill.sync-pending { border-color: color-mix(in srgb, var(--sbp-warn) 40%, var(--sbp-line)); color: color-mix(in srgb, var(--sbp-warn) 30%, var(--sbp-text)); background: color-mix(in srgb, var(--sbp-warn) 12%, var(--sbp-panel)); }
      .transport-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; border: 1px solid var(--sbp-line); color: var(--sbp-muted); background: var(--sbp-panel); white-space: nowrap; flex: 0 0 auto; text-transform: uppercase; }
      .transport-pill.mqtt { border-color: color-mix(in srgb, var(--sbp-accent) 40%, var(--sbp-line)); color: var(--sbp-accent); }
      .device-delete-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--sbp-line); border-radius: 10px; color: var(--sbp-muted); cursor: pointer; flex: 0 0 auto; margin-left: 4px; }
      .device-delete-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .device-delete-btn:disabled { opacity: 0.42; cursor: default; }
      .empty-state-card { border: 1px dashed var(--sbp-line); border-radius: 12px; padding: 18px; color: var(--sbp-muted); line-height: 1.5; font-size: 13px; }
      .wifi-max-devices-note { display: flex; justify-content: center; padding: 12px 16px 4px; font-size: 13px; color: var(--sbp-muted); }
      .wifi-state { padding: 24px 16px; text-align: center; font-size: 13px; color: var(--sbp-muted); }
      .wifi-notice { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; border: 1px solid color-mix(in srgb, var(--sbp-warn) 40%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 10%, var(--sbp-panel)); color: var(--sbp-text); }
      .wifi-notice.error { border-color: color-mix(in srgb, var(--sbp-err) 40%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-err) 10%, var(--sbp-panel)); }
      .wifi-notice .mdi { width: 18px; height: 18px; margin-top: 1px; color: var(--sbp-warn); }
      .wifi-notice.error .mdi { color: var(--sbp-err); }
      .wifi-notice-copy { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .wifi-notice .btn { flex: 0 0 auto; padding: 5px 10px; font-size: 12px; }
      .wifi-notices { display: grid; gap: 8px; }
      .wifi-notices:empty { display: none; }

      /* -- the press glow (the card's .wifi-ir-flash, same 720 ms as the dock's sweep) ---------- */
      .wifi-ir-flash { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--sbp-accent) 75%, transparent), inset 0 0 14px color-mix(in srgb, var(--sbp-accent) 22%, transparent), 0 0 14px color-mix(in srgb, var(--sbp-accent) 30%, transparent); opacity: 0; animation: wifiIrGlow 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards; }
      @keyframes wifiIrGlow { 0% { opacity: 0; } 18% { opacity: 1; } 80% { opacity: 0.7; } 100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .wifi-ir-flash { animation: none; opacity: 0; } }

      /* -- the detail view ---------------------------------------------------------------------- */
      .detail-scroll { padding: 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .detail-title-btn { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; cursor: pointer; color: var(--sbp-text); }
      .detail-title-btn .mdi { color: var(--sbp-muted); opacity: 0; transition: opacity 120ms ease; }
      .detail-title-btn:hover .mdi, .detail-title-btn:focus-visible .mdi { opacity: 1; }
      .detail-title-btn .detail-title { width: auto; }
      .device-power-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .hub-event-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 13px; line-height: 1.5; color: var(--sbp-text); }
      .hub-event-icon { display: inline-flex; flex: 0 0 auto; align-self: center; color: var(--sbp-muted); }
      .hub-event-icon.power-on { color: #2e7d32; }
      .hub-event-icon.power-off { color: #c62828; }
      .hub-event-text { min-width: 0; }
      .hub-event-action-link { display: inline; font: inherit; font-weight: 700; font-style: italic; color: var(--sbp-text); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; white-space: normal; }
      .hub-event-action-link:hover { text-decoration-color: var(--sbp-accent); }
      .hub-event-clear { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; width: 18px; height: 18px; margin-left: 4px; border: 1px solid var(--sbp-line); border-radius: 50%; color: var(--sbp-muted); cursor: pointer; }
      .hub-event-clear:hover { border-color: var(--sbp-accent); color: var(--sbp-text); }
      .hub-event-clear .mdi { width: 12px; height: 12px; }
      .device-power-options { display: grid; gap: 8px; }
      .device-power-option { border: 1px solid var(--sbp-line); border-radius: 10px; color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 600; text-align: left; padding: 10px 12px; cursor: pointer; white-space: normal; transition: border-color 120ms ease, background-color 120ms ease; }
      .device-power-option:hover { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .device-power-option.active { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.14); }

      /* The card's slot tile without its action button: about half the height, so all ten fit a screen. */
      .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .slot-btn { position: relative; border: 1px solid var(--sbp-line); border-radius: 12px; min-height: 58px; text-align: left; display: flex; align-items: stretch; overflow: hidden; background: var(--sbp-panel); color: var(--sbp-text); }
      .slot-btn:hover { border-color: var(--sbp-accent); }
      button.slot-btn { cursor: pointer; width: 100%; }
      .slot-btn.slot-empty { align-items: center; justify-content: center; gap: 8px; color: var(--sbp-muted); border-style: dashed; }
      .slot-btn.slot-empty .slot-plus { font-size: 20px; line-height: 1; }
      .slot-btn.slot-empty .slot-index { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); }
      .slot-btn.slot-empty .slot-name { font-size: 13px; color: var(--sbp-muted); }
      .slot-main { display: flex; align-items: center; gap: 8px; padding: 9px 12px; min-width: 0; width: 100%; cursor: pointer; text-align: left; color: inherit; }
      .slot-index { flex: 0 0 auto; width: 20px; font-size: 11px; font-weight: 700; color: var(--sbp-muted); font-variant-numeric: tabular-nums; }
      .slot-text-wrap { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .slot-name { font-size: 14px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sbp-text); }
      .slot-meta { font-size: 11.5px; color: var(--sbp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; min-width: 0; }
      .slot-meta .mdi { width: 13px; height: 13px; }
      .slot-meta-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .slot-favorite { color: var(--sbp-err); display: inline-flex; }
      .slot-meta-icon { display: inline-flex; }
      .slot-meta-icon.warning { color: var(--sbp-err); }
      .slot-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; padding-right: 8px; }
      .slot-flag, .slot-clear { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--sbp-line); background: var(--sbp-panel); color: var(--sbp-muted); display: inline-flex; align-items: center; justify-content: center; }
      .slot-flag .mdi { width: 14px; height: 14px; }
      .slot-flag.power-on { color: #2e7d32; border-color: color-mix(in srgb, #2e7d32 35%, var(--sbp-line)); }
      .slot-flag.power-off { color: #c62828; border-color: color-mix(in srgb, #c62828 35%, var(--sbp-line)); }
      .slot-flag.power-both { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 35%, var(--sbp-line)); }
      .slot-flag.input { color: var(--sbp-accent); border-color: color-mix(in srgb, var(--sbp-accent) 35%, var(--sbp-line)); }
      .slot-clear { cursor: pointer; }
      .slot-clear:hover { border-color: var(--sbp-accent); color: var(--sbp-text); }
      .slot-btn.slot-confirming { align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px 8px 12px; }
      .slot-confirm-title { font-size: 13px; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .slot-confirm-actions { display: flex; gap: 6px; flex: 0 0 auto; }
      .slot-confirm-actions .dialog-btn { padding: 6px 10px; }
      .callback-line { font-size: 12px; line-height: 1.5; color: var(--sbp-muted); overflow-wrap: anywhere; }
      .callback-line code { font-family: var(--sbp-mono); font-size: 11.5px; }

      /* -- dialogs -------------------------------------------------------------------------------- */
      .dialog-note { border: 1px solid color-mix(in srgb, var(--sbp-accent) 42%, var(--sbp-line)); border-radius: 12px; padding: 12px; background: color-mix(in srgb, var(--sbp-accent) 10%, var(--sbp-panel)); color: var(--sbp-text); font-size: 13px; line-height: 1.45; }
      .wifi-field { display: flex; flex-direction: column; gap: 4px; margin: 0; text-transform: none; letter-spacing: 0; }
      .wifi-field-label { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--sbp-muted); }
      .wifi-input { width: 100%; padding: 9px 10px; border: 1px solid var(--sbp-line); border-radius: 8px; background: var(--sbp-input); color: var(--sbp-text); font: inherit; font-size: 13.5px; }
      .wifi-input:focus { outline: none; border-color: var(--sbp-accent); }
      .advanced-toggle { width: fit-content; color: var(--sbp-muted); display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; cursor: pointer; }
      .advanced-toggle:hover { color: var(--sbp-text); }
      .advanced-toggle .mdi { width: 18px; height: 18px; transition: transform 120ms ease; }
      .advanced-toggle.expanded .mdi { transform: rotate(180deg); }
      .checkbox-row { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 10px; font-size: 13px; cursor: pointer; color: inherit; text-align: left; white-space: normal; margin: 0; text-transform: none; letter-spacing: 0; }
      .checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--sbp-line); display: flex; align-items: center; justify-content: center; color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.14); }
      .checkbox-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .checkbox-copy > span:first-child { font-size: 14px; line-height: 1.35; color: var(--sbp-text); }
      .checkbox-subtext { font-size: 12px; line-height: 1.35; color: var(--sbp-muted); }
      .config-block { display: grid; gap: 14px; }
      .config-group { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--sbp-line); border-radius: 12px; background: color-mix(in srgb, var(--sbp-panel) 92%, #000); }
      .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
      .checkbox-row.disabled { cursor: default; opacity: 0.6; }
      .checkbox-row.nested-control, .wifi-field.nested-control { padding-left: 36px; }
      .checkbox-icon.plain { color: var(--sbp-text); background: color-mix(in srgb, var(--sbp-panel) 88%, #000); }
      .checkbox-row.active .checkbox-icon.plain { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.2); }
      select.wifi-input { cursor: pointer; }
      select.wifi-input:disabled { cursor: default; opacity: 0.6; }
      .button-conflict-hint { font-size: 12px; line-height: 1.35; color: var(--sbp-warn); padding: 0 0 2px; }
      .activities-label { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--sbp-muted); }
      .activities-label.disabled { opacity: 0.55; }
      .activity-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .activity-chip { border: 1px solid var(--sbp-line); border-radius: 999px; background: color-mix(in srgb, var(--sbp-panel) 90%, #000); color: var(--sbp-text); padding: 6px 12px; font: inherit; cursor: pointer; }
      .activity-chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .activity-chip.active { background: rgba(var(--sbp-accent-rgb), 0.2); border-color: var(--sbp-accent); color: var(--sbp-accent); }
      .activity-chip:disabled, .activity-chip:disabled.active { opacity: 0.45; cursor: default; border-color: var(--sbp-line); background: color-mix(in srgb, var(--sbp-panel) 90%, #000); color: var(--sbp-text); }
      .empty-hint { font-size: 13px; color: var(--sbp-muted); }
      .transport-choice { display: flex; flex-direction: column; gap: 8px; }
      .transport-choice-label { font-size: 12px; font-weight: 700; color: var(--sbp-muted); }
      .transport-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--sbp-line); border-radius: 10px; cursor: pointer; margin: 0; text-transform: none; letter-spacing: 0; }
      .transport-option.selected { border-color: var(--sbp-accent); }
      .transport-option input { width: auto; margin-top: 2px; accent-color: var(--sbp-accent); }
      .transport-option-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .transport-option-name { font-size: 13px; font-weight: 700; color: var(--sbp-text); }
      .transport-option-hint, .transport-choice-note { font-size: 12px; color: var(--sbp-muted); }

      @container (max-width: 480px) {
        .command-grid { grid-template-columns: 1fr; gap: 8px; }
        .device-card { padding: 10px 12px; }
        .device-status-pill { padding: 6px; min-width: 32px; justify-content: center; }
        .device-status-pill-label { display: none; }
        .slot-btn { min-height: 52px; }
        .slot-flag, .slot-clear { width: 32px; height: 32px; }
        .detail-title-btn .mdi { opacity: 1; }
      }
    `,
  ];

  api!: PanelApi;
  ctx: HubContext | null = null;
  /** The open device's key (the route's fourth segment); null shows the roster. */
  deviceKey: string | null = null;

  private _list: WifiDeviceList | null = null;
  /** The hub's activities, for the slot dialog's chips and its input select. */
  private _activities: ActivityOption[] = [];
  private _listener: CallbackListener | null = null;
  private _loading = false;
  private _error: string | null = null;
  /** The detail view's working copy; null until the device is loaded. */
  private _draft: WifiDraft | null = null;
  private _draftFor: string | null = null;
  private _create: CreateState | null = null;
  private _delete: DeleteState | null = null;
  private _slotEdit: SlotEditState | null = null;
  private _rename: { name: string; error: string } | null = null;
  private _powerPicker: "on" | "off" | null = null;
  private _confirmClear: number | null = null;
  /** The pending move behind the "Unsynced changes" dialog. */
  private _leave: (() => void) | null = null;
  /** A job this view started and follows: the text the header's button shows. */
  private _working: string | null = null;
  private _syncError: string | null = null;
  private _flashTick = 0;

  private _loadedFor: string | null = null;
  private _lastJobId: string | null = null;
  private _flashTimer: ReturnType<typeof setTimeout> | null = null;
  private _flashFor: number | null = null;
  private _reportedDirty = false;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = null;
    this._flashFor = null;
    this._reportDirty(false);
  }

  // -- state ---------------------------------------------------------------------------------

  private get _hubId(): string | null {
    return this.ctx?.hub?.hub_id ?? null;
  }

  private get _hubVersion(): string | null {
    return this.ctx?.hub?.status?.hub_version ?? this.ctx?.hub?.config?.hub_version ?? null;
  }

  private get _locked(): boolean {
    return Boolean(this._working) || (this.ctx ? !this.ctx.free : false);
  }

  private get _devices(): WifiDeviceView[] {
    return this._list?.devices ?? [];
  }

  private get _device(): WifiDeviceView | null {
    return this.deviceKey ? this._devices.find((device) => device.key === this.deviceKey) ?? null : null;
  }

  private get _transports(): string[] {
    return this._list?.transports?.length ? this._list.transports : ["http"];
  }

  hasUnsyncedChanges(): boolean {
    const device = this._device;
    return Boolean(device && this._draft && this._draftFor === device.key && !draftsEqual(this._draft, draftFromSpec(device.spec)));
  }

  /** The shell asks before it moves away (another tab, another hub); the dialog finishes the move. */
  askToLeave(then: () => void): void {
    if (!this.hasUnsyncedChanges()) {
      then();
      return;
    }
    this._leave = then;
  }

  private _reportDirty(dirty: boolean): void {
    if (dirty === this._reportedDirty) return;
    this._reportedDirty = dirty;
    this.dispatchEvent(new CustomEvent("sb-view-dirty", { bubbles: true, composed: true, detail: { dirty } }));
  }

  private _say(text: string, ok: boolean): void {
    this.dispatchEvent(new CustomEvent("sb-message", { bubbles: true, composed: true, detail: { text, ok } }));
  }

  private _navigate(key: string | null): void {
    this.dispatchEvent(new CustomEvent("sb-navigate", { bubbles: true, composed: true, detail: { tab: "wifi", sub: "devices", item: key ?? undefined } }));
  }

  // -- lifecycle -------------------------------------------------------------------------------

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) {
      const hubId = this._hubId;
      if (hubId !== this._loadedFor) {
        this._loadedFor = hubId;
        this._lastJobId = this.ctx?.hub?.last_job?.job_id ?? null;
        this._list = null;
        this._activities = [];
        this._draft = null;
        this._draftFor = null;
        this._error = null;
        this._syncError = null;
        this._create = this._delete = this._slotEdit = this._rename = null;
        this._powerPicker = null;
        this._confirmClear = null;
        if (hubId) void this._load();
      } else {
        // A job that ended elsewhere (the activity editor in another tab, the API
        // console) may have moved a device or its usage: re-read once per job.
        const jobId = this.ctx?.hub?.last_job?.job_id ?? null;
        if (jobId && jobId !== this._lastJobId) {
          this._lastJobId = jobId;
          if (!this._working) void this._load();
        }
      }
    }
    if (changed.has("deviceKey") || changed.has("_list")) this._adoptDraft();
    this._scheduleFlashEnd();
  }

  protected updated(): void {
    this._reportDirty(this.hasUnsyncedChanges());
    // A key the hub no longer has (deleted elsewhere, an old bookmark): back to the roster.
    if (this.deviceKey && this._list !== null && !this._device && !this._working) this._navigate(null);
  }

  /** The draft follows the open device; a reload keeps unsynced edits and rebases a clean one. */
  private _adoptDraft(): void {
    const device = this._device;
    if (!device) {
      if (!this.deviceKey) {
        this._draft = null;
        this._draftFor = null;
      }
      return;
    }
    if (this._draftFor !== device.key) {
      this._draft = draftFromSpec(device.spec);
      this._draftFor = device.key;
      this._syncError = null;
      this._confirmClear = null;
    }
  }

  private async _load(): Promise<void> {
    const hubId = this._hubId;
    if (!hubId) return;
    this._loading = this._list === null;
    try {
      const [list, activities, listener] = await Promise.all([this.api.wifiDevices(hubId), this.api.activities(hubId), this.api.callbackListener()]);
      if (this._loadedFor !== hubId) return;
      if (!list.ok || !list.body) {
        this._error = problemText(list);
        return;
      }
      this._error = null;
      const dirty = this.hasUnsyncedChanges();
      this._list = list.body;
      if (activities.ok && activities.body) this._activities = activities.body.map((a) => ({ id: a.activity_id, name: a.name })).filter((a) => Number.isInteger(a.id) && a.name);
      this._listener = listener.ok ? listener.body : this._listener;
      // A clean working copy follows the server; unsynced edits stay the user's.
      if (!dirty) this._draftFor = null;
    } catch (err) {
      if (this._loadedFor === hubId) this._error = String(err);
    } finally {
      this._loading = false;
    }
  }

  /** Start a job, follow it, reload. Resolves with the finished job, or null with the error said. */
  private async _runJob(label: string, start: () => Promise<ApiResponse<JobView>>): Promise<{ job: JobView | null; error: string | null }> {
    const hubId = this._hubId;
    if (!hubId) return { job: null, error: "no hub" };
    this._working = label;
    try {
      const started = await start();
      if (started.status !== 202 || !started.body) return { job: null, error: problemText(started) };
      const job = await this.api.followJob(hubId, started.body.job_id);
      if (job) this._lastJobId = job.job_id;
      return { job, error: jobFailure(job) };
    } catch (err) {
      return { job: null, error: String(err) };
    } finally {
      this._working = null;
    }
  }

  // -- the press glow ----------------------------------------------------------------------------

  private _activePress() {
    const press = this.ctx?.runtime?.lastPress ?? null;
    return pressIsFresh(press, Date.now()) ? press : null;
  }

  /** One re-render when the glow ends, so the overlay leaves the DOM (the card's clear timer). */
  private _scheduleFlashEnd(): void {
    const press = this._activePress();
    if (!press || this._flashFor === press.at) return;
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashFor = press.at;
    this._flashTimer = setTimeout(() => {
      this._flashTimer = null;
      this._flashFor = null;
      this._flashTick += 1;
    }, Math.max(0, PRESS_FLASH_MS - (Date.now() - press.at)) + 16);
  }

  private _flash(matches: boolean, at: number): TemplateResult | typeof nothing {
    return matches ? (keyed(at, html`<div class="wifi-ir-flash" aria-hidden="true"></div>`) as TemplateResult) : nothing;
  }

  // -- create ------------------------------------------------------------------------------------------

  private _openCreate = (): void => {
    if (this._locked) return;
    this._create = { name: "", transport: this._transports[0], busy: false, error: "" };
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>("#wifi-new-name")?.focus());
  };

  private _closeCreate = (): void => {
    if (!this._create?.busy) this._create = null;
  };

  private _submitCreate = async (): Promise<void> => {
    const state = this._create;
    const hubId = this._hubId;
    if (!state || !hubId || state.busy) return;
    const name = sanitizeWifiName(this._hubVersion, state.name);
    const problem = nameProblem(name, { required: S.createDeviceNameRequired, leadingSpace: S.commandNameLeadingSpace });
    if (problem) {
      this._create = { ...state, error: problem };
      return;
    }
    this._create = { ...state, busy: true, error: "" };
    const { job, error } = await this._runJob(S.createDeviceBusy, () => this.api.createWifiDevice(hubId, specFromDraft({ ...draftFromSpec(null), name }), state.transport));
    if (error) {
      this._create = { ...state, busy: false, error: `${S.createDeviceFailed}: ${error}` };
      await this._load();
      return;
    }
    this._create = null;
    await this._load();
    const key = typeof job?.result?.key === "string" ? job.result.key : null;
    if (key) this._navigate(key);
  };

  // -- delete ------------------------------------------------------------------------------------------

  private _promptDelete(key: string, event: Event): void {
    event.stopPropagation();
    if (this._locked) return;
    this._delete = { key, busy: false, error: "", referenced: false };
  }

  private _closeDelete = (): void => {
    if (!this._delete?.busy) this._delete = null;
  };

  private _submitDelete = async (): Promise<void> => {
    const state = this._delete;
    const hubId = this._hubId;
    if (!state || !hubId || state.busy) return;
    this._delete = { ...state, busy: true, error: "" };
    this._working = S.deleteDeviceBusy;
    let error: string | null = null;
    try {
      const started = await this.api.removeWifiDevice(hubId, state.key, state.referenced);
      if (started.status === 409 && (started.body as unknown as { type?: string } | null)?.type === "callback_device_referenced") {
        // The first answer names the activities; a second press deletes anyway.
        const detail = (started.body as unknown as { detail?: string }).detail ?? "";
        this._delete = { ...state, busy: false, referenced: true, error: detail };
        return;
      }
      if (started.status !== 202 || !started.body) {
        error = problemText(started);
      } else {
        const job = await this.api.followJob(hubId, started.body.job_id);
        if (job) this._lastJobId = job.job_id;
        error = jobFailure(job);
      }
    } catch (err) {
      error = String(err);
    } finally {
      this._working = null;
    }
    if (error) {
      this._delete = { ...state, busy: false, error: `${S.deleteDeviceFailed}: ${error}` };
      await this._load();
      return;
    }
    const wasOpen = this.deviceKey === state.key;
    this._delete = null;
    if (wasOpen) {
      this._draft = null;
      this._draftFor = null;
    }
    await this._load();
    if (wasOpen) this._navigate(null);
  };

  // -- the detail view's edits ------------------------------------------------------------------------------

  private _edit(next: WifiDraft): void {
    this._draft = next;
    this._syncError = null;
  }

  private get _powerInput(): boolean {
    return supportsPowerInput(this._hubVersion);
  }

  private _activityName(id: number | null): string {
    if (id === null) return "";
    return this._activities.find((a) => a.id === id)?.name ?? TOOLS_CARD_STRINGS.common.activityFallback(id);
  }

  private _openSlot(index: number): void {
    const draft = this._draft;
    if (!draft || this._locked) return;
    this._confirmClear = null;
    const edit = withDefaultActivity(slotEditFrom(draft, index), this._activities.map((a) => a.id));
    this._slotEdit = { index, edit, advanced: false, error: "" };
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>("#wifi-slot-name")?.focus());
  }

  private _closeSlot = (): void => {
    this._slotEdit = null;
  };

  /** A change in the slot dialog; a favorite or a button that just appeared takes the first activity (the card's default). */
  private _patchSlot(patch: Partial<SlotEdit>): void {
    const state = this._slotEdit;
    if (!state) return;
    let edit: SlotEdit = { ...state.edit, ...patch };
    if (edit.button === null) edit = { ...edit, longPress: false };
    edit = withDefaultActivity(edit, this._activities.map((a) => a.id));
    this._slotEdit = { ...state, edit, error: "" };
  }

  private _saveSlot = (): void => {
    const state = this._slotEdit;
    const draft = this._draft;
    if (!state || !draft) return;
    const label = sanitizeWifiName(this._hubVersion, state.edit.label);
    const problem = nameProblem(label, { required: S.commandNameLeadingSpace, leadingSpace: S.commandNameLeadingSpace });
    if (problem) {
      this._slotEdit = { ...state, error: problem };
      return;
    }
    this._edit(withSlotSaved(draft, state.index, { ...state.edit, label }, { powerInput: this._powerInput }));
    this._slotEdit = null;
  };

  private _clearSlot(index: number): void {
    if (this._draft) this._edit(withSlotCleared(this._draft, index));
    this._confirmClear = null;
  }

  private _pickPower(kind: "on" | "off", slot: number | null): void {
    this._powerPicker = null;
    if (this._draft) this._edit(withPowerSlot(this._draft, kind, slot));
  }

  private _openRename = (): void => {
    if (!this._draft || this._locked) return;
    this._rename = { name: this._draft.name, error: "" };
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>("#wifi-rename")?.select());
  };

  private _saveRename = (): void => {
    const state = this._rename;
    if (!state || !this._draft) return;
    const name = sanitizeWifiName(this._hubVersion, state.name);
    const problem = nameProblem(name, { required: S.createDeviceNameRequired, leadingSpace: S.commandNameLeadingSpace });
    if (problem) {
      this._rename = { ...state, error: problem };
      return;
    }
    this._edit({ ...this._draft, name: name.trim() });
    this._rename = null;
  };

  // -- sync, redeploy, leave ----------------------------------------------------------------------------------

  private _sync = async (): Promise<boolean> => {
    const device = this._device;
    const draft = this._draft;
    const hubId = this._hubId;
    if (!device || !draft || !hubId || this._locked) return false;
    this._syncError = null;
    // A button this draft took from another Wifi Device is cleared from that device's spec too (the
    // card does the same on save); left there, that device's next sync would take the button back.
    const cleanups = buttonCleanups(this._devices, device.key, draft);
    const { error } = await this._runJob(S.actionButtonSyncing, () => this.api.updateWifiDevice(hubId, device.key, specFromDraft(draft)));
    if (error) {
      this._syncError = error;
      await this._load();
      return false;
    }
    // The server's record is the new baseline.
    this._draftFor = null;
    for (const cleanup of cleanups) {
      const result = await this._runJob(S.syncingDeviceNamed(cleanup.device.spec.name), () => this.api.updateWifiDevice(hubId, cleanup.device.key, cleanup.spec));
      if (result.error) this._say(T.cleanupFailed(cleanup.device.spec.name, result.error), false);
    }
    await this._load();
    return true;
  };

  private _redeploy = async (): Promise<void> => {
    const device = this._device;
    const hubId = this._hubId;
    if (!device || !hubId || this._locked) return;
    this._syncError = null;
    const { error } = await this._runJob(`${T.redeploy}…`, () => this.api.redeployWifiDevice(hubId, device.key));
    if (error) this._syncError = error;
    await this._load();
  };

  private _back = (): void => {
    this.askToLeave(() => this._navigate(null));
  };

  private _leaveWithoutSync = (): void => {
    const then = this._leave;
    this._leave = null;
    this._draft = null;
    this._draftFor = null;
    this._reportDirty(false);
    then?.();
  };

  private _leaveAfterSync = async (): Promise<void> => {
    const then = this._leave;
    this._leave = null;
    if (await this._sync()) then?.();
  };

  private _retryListener = async (): Promise<void> => {
    try {
      const response = await this.api.retryCallbackListener();
      if (response.ok && response.body) this._listener = response.body;
      this._say(response.ok && response.body?.bound ? "The callback listener is running." : `The callback listener could not start${response.body?.last_error ? `: ${String(response.body.last_error)}` : ""}.`, Boolean(response.ok && response.body?.bound));
    } catch (err) {
      this._say(String(err), false);
    }
  };

  // -- render: shared bits -----------------------------------------------------------------------------------------

  private _renderTransportPill(device: WifiDeviceView): TemplateResult | typeof nothing {
    // With one transport on offer every device is HTTP and the pill is noise (the card's rule).
    if (this._transports.length < 2 && device.transport === "http") return nothing;
    return html`<span class="transport-pill ${device.transport}" title=${S.transportPillDeployedTitle}>${device.transport}</span>`;
  }

  private _renderListenerNotice(): TemplateResult | typeof nothing {
    const listener = this._listener;
    if (!listener || !listener.wanted || listener.bound) return nothing;
    const port = listener.port != null ? String(listener.port) : "";
    return html`<div class="wifi-notice error" id="wifi-listener-notice">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${T.listenerDown(port)}${listener.last_error ? ` ${String(listener.last_error)}` : ""}</span><button class="btn" type="button" @click=${this._retryListener}>${T.listenerRetry}</button></div>`;
  }

  // -- render: the roster ---------------------------------------------------------------------------------------------

  private _renderList(): TemplateResult {
    const devices = this._devices;
    const max = this._list?.max_devices ?? 5;
    const canAdd = devices.length < max;
    const press = this._activePress();
    return html`
      <div class="list-view" id="wifi-device-list">
        <div class="list-header">
          <div class="list-header-copy"><div class="section-subtitle">${T.subtitle}</div></div>
          <div class="list-header-action">
            <button class="quick-access-add-btn" id="wifi-add" type="button" ?disabled=${!canAdd || this._locked || this._list === null} @click=${this._openCreate}>${icon(mdiPlus)}<span>${S.addDeviceButton}</span></button>
          </div>
        </div>
        <div class="wifi-notices">${this._renderListenerNotice()}</div>
        ${this._error ? html`<div class="wifi-notice error" id="wifi-error">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${this._error}</span></div>` : nothing}
        ${this._loading
          ? html`<div class="wifi-state">${TOOLS_CARD_STRINGS.common.loading}</div>`
          : devices.length
            ? html`<div class="device-list">
                ${devices.map((device) => {
                  const deleting = this._delete?.busy === true && this._delete.key === device.key;
                  const status = deviceStatus(device, { deleting });
                  const statusIcon = status.tone === "sync-ok" ? mdiCheckCircleOutline : status.tone === "sync-error" ? mdiAlertCircleOutline : mdiProgressClock;
                  const open = (): void => { if (!deleting) this._navigate(device.key); };
                  return html`
                    <div class="device-card" role="button" data-key=${device.key} tabindex=${deleting ? -1 : 0} aria-disabled=${String(deleting)}
                      @click=${open}
                      @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}>
                      <div class="device-card-main">
                        <span class="device-card-lead">${icon(mdiWifi)}</span>
                        <div class="device-card-copy">
                          <div class="device-card-name">${device.spec.name}</div>
                          <div class="device-card-count">${S.configuredSlots(configuredCount(draftFromSpec(device.spec)))}</div>
                        </div>
                        <div class="device-card-meta">
                          ${this._renderTransportPill(device)}
                          <span class="status-pill device-status-pill ${status.tone}">${icon(statusIcon)}<span class="device-status-pill-label">${status.label}</span></span>
                        </div>
                      </div>
                      <button class="device-delete-btn" type="button" title=${S.deleteDeviceAria} aria-label=${S.deleteDeviceAria} ?disabled=${this._locked || deleting} @click=${(event: Event) => this._promptDelete(device.key, event)}>${icon(mdiTrashCanOutline)}</button>
                      ${this._flash(Boolean(press && pressMatchesDevice(press, device)), press?.at ?? 0)}
                    </div>`;
                })}
              </div>`
            : this._error
              ? nothing
              : html`<div class="empty-state-card" id="wifi-empty">${S.emptyDevices}</div>`}
        ${!canAdd ? html`<div class="wifi-max-devices-note">${S.maximumDevices}</div>` : nothing}
      </div>
    `;
  }

  // -- render: the detail view -------------------------------------------------------------------------------------------

  private _renderSyncButton(device: WifiDeviceView): TemplateResult {
    if (device.stale) {
      return html`<button class="detail-sync-btn sync-btn-primary" id="wifi-redeploy" type="button" ?disabled=${this._locked} @click=${this._redeploy}>${this._working ?? T.redeploy}</button>`;
    }
    const dirty = this.hasUnsyncedChanges();
    if (this._working) return html`<button class="detail-sync-btn" id="wifi-sync" type="button" disabled>${this._working}</button>`;
    if (!dirty) return html`<button class="detail-sync-btn detail-sync-btn--state-ok" id="wifi-sync" type="button" disabled>${S.actionButtonUpToDate}</button>`;
    return html`<button class="detail-sync-btn sync-btn-primary" id="wifi-sync" type="button" ?disabled=${this._locked || device.device_id == null} @click=${() => void this._sync()}>${S.actionButtonSyncToHub}</button>`;
  }

  private _renderPowerLines(draft: WifiDraft): TemplateResult | typeof nothing {
    if (!supportsPowerInput(this._hubVersion)) return nothing;
    const rows: { kind: "on" | "off"; label: string; slot: number | null }[] = [
      { kind: "on", label: S.devicePowerOnLabel, slot: draft.powerOn },
      { kind: "off", label: S.devicePowerOffLabel, slot: draft.powerOff },
    ];
    return html`
      <ul class="device-power-lines" id="wifi-power-lines">
        ${rows.map(({ kind, label, slot }) => html`
          <li class="hub-event-line">
            <span class="hub-event-icon ${kind === "on" ? "power-on" : "power-off"}">${icon(mdiPower)}</span>
            <span class="hub-event-text">${label},
              <button class="hub-event-action-link" type="button" data-power=${kind} ?disabled=${this._locked} @click=${() => { this._powerPicker = kind; }}>${slot !== null ? S.devicePowerPerform(draft.slots[slot - 1].label) : S.hubEventDoNothing}</button>${slot !== null
                ? html`<button class="hub-event-clear" type="button" title=${S.hubEventClearTitle} aria-label=${S.hubEventClearTitle} ?disabled=${this._locked} @click=${() => this._pickPower(kind, null)}>${icon(mdiClose)}</button>`
                : nothing}.
            </span>
          </li>`)}
      </ul>`;
  }

  private _renderSlot(draft: WifiDraft, index: number, flash: TemplateResult | typeof nothing): TemplateResult {
    const slot = index + 1;
    if (this._confirmClear === index) {
      return html`
        <div class="slot-btn slot-confirming" data-slot=${slot}>
          <div class="slot-confirm-title">${S.clearSlotTitle}</div>
          <div class="slot-confirm-actions">
            <button class="dialog-btn" type="button" @click=${() => { this._confirmClear = null; }}>${S.clearSlotNo}</button>
            <button class="dialog-btn dialog-btn-primary" type="button" data-confirm-clear @click=${() => this._clearSlot(index)}>${S.clearSlotYes}</button>
          </div>
          ${flash}
        </div>`;
    }
    if (!isSlotConfigured(draft, index)) {
      return html`<button class="slot-btn slot-empty" type="button" data-slot=${slot} ?disabled=${this._locked} @click=${() => this._openSlot(index)}><span class="slot-index">${slot}</span><span class="slot-plus">+</span><span class="slot-name">${S.makeCommand}</span>${flash}</button>`;
    }
    const row = draft.slots[index];
    const powerInput = this._powerInput;
    const isOn = powerInput && draft.powerOn === slot;
    const isOff = powerInput && draft.powerOff === slot;
    const isInput = powerInput && (row.inputActivityId !== null || draft.inputs.includes(slot));
    const meta = slotMeta(draft, index, { powerInput });
    const metaLabel = meta.kind === "unconfigured" ? S.unconfiguredCommand
      : meta.kind === "power" ? (meta.on && meta.off ? S.powerBothCommand : meta.on ? S.powerOnCommand : S.powerOffCommand)
      : meta.kind === "input" ? (meta.activityId !== null ? S.inputFor(this._activityName(meta.activityId)) : S.inputCommand)
      : S.inActivities(meta.count);
    const button = hardButtonByCode(row.button);
    const name = row.label !== defaultSlotLabel(slot) ? row.label : TOOLS_CARD_STRINGS.common.commandFallback(slot);
    const where = activitiesEnabled(row) ? row.activities.map((id) => this._activityName(id)).join(", ") : "";
    return html`
      <div class="slot-btn" data-slot=${slot}>
        <button class="slot-main" type="button" ?disabled=${this._locked} title=${where} @click=${() => this._openSlot(index)}>
          <span class="slot-index">${slot}</span>
          <span class="slot-text-wrap">
            <span class="slot-name">${name}</span>
            <span class="slot-meta">
              ${row.favorite ? html`<span class="slot-favorite">${icon(mdiHeart)}</span>` : nothing}
              ${button ? html`<span class="slot-meta-icon" data-button=${button.name} style=${BUTTON_COLORS[button.name] ? `color:${BUTTON_COLORS[button.name]}` : ""}>${icon(BUTTON_ICONS[button.name] ?? mdiGestureTapButton)}</span>` : nothing}
              ${row.longPress ? html`<span class="slot-meta-icon" data-long-press>${icon(mdiTimerSandFull)}</span>` : nothing}
              ${meta.kind === "unconfigured" ? html`<span class="slot-meta-icon warning">${icon(mdiAlertCircle)}</span>` : nothing}
              <span class="slot-meta-label">${metaLabel}</span>
            </span>
          </span>
        </button>
        <div class="slot-actions">
          ${isOn && isOff
            ? html`<span class="slot-flag power-both" title=${S.powerBothCommand}>${icon(mdiPower)}</span>`
            : isOn
              ? html`<span class="slot-flag power-on" title=${S.powerOnCommand}>${icon(mdiPower)}</span>`
              : isOff
                ? html`<span class="slot-flag power-off" title=${S.powerOffCommand}>${icon(mdiPower)}</span>`
                : nothing}
          ${isInput ? html`<span class="slot-flag input" title=${row.inputActivityId !== null ? S.inputFor(this._activityName(row.inputActivityId)) : S.inputCommand}>${icon(mdiVideoInputHdmi)}</span>` : nothing}
          <button class="slot-clear" type="button" aria-label=${S.clearSlotTitle} title=${S.clearSlotTitle} ?disabled=${this._locked} @click=${() => { this._confirmClear = index; }}>${icon(mdiClose)}</button>
        </div>
        ${flash}
      </div>`;
  }

  private _renderDetail(device: WifiDeviceView, draft: WifiDraft): TemplateResult {
    const press = this._activePress();
    const target = `${device.target.host}:${device.target.port}`;
    const now = device.effective_destination ? `${device.effective_destination.host}:${device.effective_destination.port}` : "";
    return html`
      <div class="tab-panel--detail" id="wifi-device-detail" data-key=${device.key}>
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" id="wifi-back" type="button" aria-label="Back to the Wifi Devices" @click=${this._back}>${icon(mdiArrowLeft)}</button>
                <button class="detail-title-btn" id="wifi-rename-open" type="button" title=${T.renameTitle} ?disabled=${this._locked || device.stale} @click=${this._openRename}><span class="detail-title">${draft.name}</span>${icon(mdiPencilOutline)}</button>
                ${this._renderTransportPill(device)}
              </div>
              <div class="detail-title-actions">${this._renderSyncButton(device)}</div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="wifi-notices">
              ${this._syncError ? html`<div class="wifi-notice error" id="wifi-sync-error">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${S.syncMessageFailed} ${this._syncError}</span></div>` : nothing}
              ${device.stale ? html`<div class="wifi-notice error" id="wifi-stale">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${T.staleNotice}</span></div>` : nothing}
              ${device.pending && !device.stale ? html`<div class="wifi-notice" id="wifi-pending">${icon(mdiProgressClock)}<span class="wifi-notice-copy">${T.pendingNotice}</span></div>` : nothing}
              ${targetMoved(device) ? html`<div class="wifi-notice" id="wifi-moved">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${T.movedNotice(target, now)}</span></div>` : nothing}
              ${this._renderListenerNotice()}
            </div>
            ${this._renderPowerLines(draft)}
            <div class="command-grid" id="wifi-slots">
              ${draft.slots.map((_slot, index) => this._renderSlot(draft, index, this._flash(Boolean(press && pressMatchesSlot(press, device, index)), press?.at ?? 0)))}
            </div>
            <div class="callback-line" id="wifi-callback-line">${T.callsBack(target)}${device.device_id != null ? html` DevID <code>${device.device_id}</code>.` : nothing}${supportsPowerInput(this._hubVersion) ? nothing : html` ${T.x1Note}`}</div>
          </div>
        </div>
      </div>
    `;
  }

  // -- render: dialogs ------------------------------------------------------------------------------------------------------

  private _nameInput(id: string, value: string, label: string, disabled: boolean, onInput: (value: string) => void, onEnter: () => void): TemplateResult {
    return html`
      <label class="wifi-field">
        <span class="wifi-field-label">${label}</span>
        <input class="wifi-input" id=${id} type="text" autocomplete="off" maxlength=${WIFI_NAME_MAX} .value=${value} ?disabled=${disabled}
          @input=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            const clean = sanitizeWifiName(this._hubVersion, input.value);
            if (input.value !== clean) input.value = clean;
            onInput(clean);
          }}
          @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }} />
      </label>`;
  }

  private _renderCreateDialog(): TemplateResult | typeof nothing {
    const state = this._create;
    if (!state) return nothing;
    const transports = this._transports;
    return html`
      <div class="modal-backdrop" @click=${this._closeCreate}>
        <div class="dialog small" id="wifi-create-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${S.addDevice}</div><button class="dialog-close" type="button" aria-label=${S.createModalCancel} @click=${this._closeCreate}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            ${this._nameInput("wifi-new-name", state.name, S.deviceName, state.busy, (name) => { this._create = { ...state, name, error: "" }; }, () => void this._submitCreate())}
            ${transports.length > 1
              ? html`<div class="transport-choice">
                  <div class="transport-choice-label">${S.transportLabel}</div>
                  ${transports.map((option) => html`
                    <label class="transport-option ${state.transport === option ? "selected" : ""}">
                      <input type="radio" name="wifi-new-transport" .checked=${state.transport === option} ?disabled=${state.busy} @change=${() => { this._create = { ...state, transport: option }; }} />
                      <span class="transport-option-copy"><span class="transport-option-name">${option.toUpperCase()}</span><span class="transport-option-hint">${option === "http" ? T.transportHttpHint : S.transportMqttHint}</span></span>
                    </label>`)}
                  <div class="transport-choice-note">${S.transportLockedNote}</div>
                </div>`
              : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id="wifi-create-error">${state.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" ?disabled=${state.busy} @click=${this._closeCreate}>${S.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="wifi-create-submit" type="button" ?disabled=${state.busy} @click=${() => void this._submitCreate()}>${state.busy ? S.createDeviceBusy : S.createModalCreate}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private _renderDeleteDialog(): TemplateResult | typeof nothing {
    const state = this._delete;
    const device = state ? this._devices.find((row) => row.key === state.key) : null;
    if (!state || !device) return nothing;
    return html`
      <div class="modal-backdrop" @click=${this._closeDelete}>
        <div class="dialog small" id="wifi-delete-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${S.deleteModalTitle}</div><button class="dialog-close" type="button" aria-label=${S.createModalCancel} @click=${this._closeDelete}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <div class="dialog-text">${T.deleteBody(device.spec.name)}</div>
            ${state.referenced ? html`<div class="wifi-notice" id="wifi-delete-referenced">${icon(mdiAlertCircleOutline)}<span class="wifi-notice-copy">${T.deleteReferenced}</span></div>` : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id="wifi-delete-error">${state.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" ?disabled=${state.busy} @click=${this._closeDelete}>${S.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-danger" id="wifi-delete-submit" type="button" ?disabled=${state.busy} @click=${() => void this._submitDelete()}>${state.busy ? S.deleteDeviceBusy : state.referenced ? T.deleteAnyway : S.deleteModalDelete}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private _renderSlotDialog(): TemplateResult | typeof nothing {
    const state = this._slotEdit;
    const draft = this._draft;
    const device = this._device;
    if (!state || !draft || !device) return nothing;
    const edit = state.edit;
    const activities = this._activities;
    const hasActivities = activities.length > 0;
    const chipsEnabled = activitiesEnabled(edit);
    const inputOn = edit.inputActivityId !== null;
    const setInput = (on: boolean): void => {
      if (!hasActivities) return;
      this._patchSlot({ inputActivityId: on ? edit.inputActivityId ?? activities[0].id : null });
    };
    // What this save takes from elsewhere, said before it happens (the card's two hints).
    const inputHolder = slotHoldingInput(draft, edit.inputActivityId, state.index);
    const inputHint = !hasActivities ? S.noActivitiesForHub
      : inputHolder >= 0 ? S.activityInputReplaces(draft.slots[inputHolder].label, this._activityName(edit.inputActivityId))
      : S.activityInputHint;
    const buttonHolder = slotHoldingButton(draft, edit.button, state.index);
    const otherHolder = buttonHolder < 0 ? otherDeviceHoldingButton(this._devices, device.key, edit.button) : null;
    const buttonHint = buttonHolder >= 0 ? S.replacesOnButton(draft.slots[buttonHolder].label)
      : otherHolder ? S.replacesFromDevice(otherHolder.slotLabel, otherHolder.device.spec.name)
      : "";
    const keyLabels = S.keyLabels as Record<string, string>;
    const buttons = availableHardButtons(this._hubVersion).filter((button) => keyLabels[button.name]);
    return html`
      <div class="modal-backdrop" @click=${this._closeSlot}>
        <div class="dialog" id="wifi-slot-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${S.commandSlotTitle(state.index)}</div><button class="dialog-close" type="button" aria-label=${S.createModalCancel} @click=${this._closeSlot}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <div class="dialog-note">${T.slotDescription}</div>
            <div class="config-block">
              <div class="config-group">
                ${this._nameInput("wifi-slot-name", edit.label, S.commandDisplayName, false, (label) => this._patchSlot({ label }), this._saveSlot)}
                ${this._powerInput
                  ? html`
                      <button class="advanced-toggle ${state.advanced ? "expanded" : ""}" id="wifi-slot-advanced" type="button" aria-expanded=${String(state.advanced)} @click=${() => { this._slotEdit = { ...state, advanced: !state.advanced }; }}><span>${S.advanced}</span>${icon(mdiChevronDown)}</button>
                      ${state.advanced
                        ? html`<div class="advanced-panel">
                            <label class="checkbox-row ${inputOn ? "active" : ""} ${hasActivities ? "" : "disabled"}">
                              <span class="checkbox-icon">${icon(mdiVideoInputHdmi)}</span>
                              <span class="checkbox-copy"><span>${S.activityInput}</span><span class="checkbox-subtext" id="wifi-slot-input-hint">${inputHint}</span></span>
                              <input class="sb-switch" id="wifi-slot-input" type="checkbox" .checked=${inputOn} ?disabled=${!hasActivities} @change=${(event: Event) => setInput((event.currentTarget as HTMLInputElement).checked)} />
                            </label>
                            <label class="wifi-field nested-control">
                              <span class="wifi-field-label">${S.activityInputLabel}</span>
                              <select class="wifi-input" id="wifi-slot-input-activity" ?disabled=${!inputOn || !hasActivities} @change=${(event: Event) => this._patchSlot({ inputActivityId: Number((event.currentTarget as HTMLSelectElement).value) })}>
                                ${activities.map((activity) => html`<option value=${String(activity.id)} ?selected=${(edit.inputActivityId ?? activities[0]?.id) === activity.id}>${activity.name}</option>`)}
                              </select>
                            </label>
                          </div>`
                        : nothing}`
                  : nothing}
              </div>
              <div class="config-group">
                <label class="checkbox-row ${edit.favorite ? "active" : ""}">
                  <span class="checkbox-icon plain">${icon(mdiHeart)}</span>
                  <span class="checkbox-copy"><span>${S.favorite}</span></span>
                  <input class="sb-switch" id="wifi-slot-favorite" type="checkbox" .checked=${edit.favorite} @change=${(event: Event) => this._patchSlot({ favorite: (event.currentTarget as HTMLInputElement).checked })} />
                </label>
                <label class="wifi-field">
                  <span class="wifi-field-label">${S.physicalButtonAssignment}</span>
                  <select class="wifi-input" id="wifi-slot-button" @change=${(event: Event) => { const value = (event.currentTarget as HTMLSelectElement).value; this._patchSlot({ button: value ? Number(value) : null }); }}>
                    <option value="" ?selected=${edit.button === null}>${S.none}</option>
                    ${buttons.map((button) => html`<option value=${String(button.code)} ?selected=${edit.button === button.code}>${BUTTON_GROUP_TITLES[button.group]} - ${keyLabels[button.name]}</option>`)}
                  </select>
                </label>
                ${buttonHint ? html`<div class="button-conflict-hint" id="wifi-slot-button-hint">${buttonHint}</div>` : nothing}
                <label class="checkbox-row nested-control ${edit.button !== null && edit.longPress ? "active" : ""} ${edit.button === null ? "disabled" : ""}">
                  <span class="checkbox-icon plain">${icon(mdiTimerSandFull)}</span>
                  <span class="checkbox-copy"><span>${S.enableLongPress}</span></span>
                  <input class="sb-switch" id="wifi-slot-long-press" type="checkbox" .checked=${edit.button !== null && edit.longPress} ?disabled=${edit.button === null} @change=${(event: Event) => this._patchSlot({ longPress: (event.currentTarget as HTMLInputElement).checked })} />
                </label>
                <div class="activities-label ${chipsEnabled ? "" : "disabled"}">${S.applyToActivities}</div>
                <div class="activity-chip-row" id="wifi-slot-activities">
                  ${hasActivities
                    ? activities.map((activity) => html`<button class="activity-chip ${chipsEnabled && edit.activities.includes(activity.id) ? "active" : ""}" type="button" data-activity=${activity.id} ?disabled=${!chipsEnabled} @click=${() => { if (this._slotEdit) this._slotEdit = { ...this._slotEdit, edit: withActivityToggled(this._slotEdit.edit, activity.id), error: "" }; }}>${activity.name}</button>`)
                    : html`<div class="empty-hint">${S.noActivitiesForHub}</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id="wifi-slot-error">${state.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${this._closeSlot}>${S.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="wifi-slot-save" type="button" @click=${this._saveSlot}>${S.save}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private _renderRenameDialog(): TemplateResult | typeof nothing {
    const state = this._rename;
    if (!state) return nothing;
    const close = (): void => { this._rename = null; };
    return html`
      <div class="modal-backdrop" @click=${close}>
        <div class="dialog small" id="wifi-rename-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${T.renameTitle}</div><button class="dialog-close" type="button" aria-label=${S.createModalCancel} @click=${close}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">${this._nameInput("wifi-rename", state.name, S.deviceName, false, (name) => { this._rename = { name, error: "" }; }, this._saveRename)}</div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${state.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${close}>${S.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="wifi-rename-save" type="button" @click=${this._saveRename}>${S.save}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private _renderPowerPicker(): TemplateResult | typeof nothing {
    const kind = this._powerPicker;
    const draft = this._draft;
    if (!kind || !draft) return nothing;
    const close = (): void => { this._powerPicker = null; };
    const current = kind === "on" ? draft.powerOn : draft.powerOff;
    const options = draft.slots.map((slot, index) => ({ slot: index + 1, label: slot.label })).filter((row) => isSlotConfigured(draft, row.slot - 1));
    return html`
      <div class="modal-backdrop" @click=${close}>
        <div class="dialog small" id="wifi-power-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${kind === "on" ? S.devicePowerOnLabel : S.devicePowerOffLabel}</div><button class="dialog-close" type="button" aria-label=${S.createModalCancel} @click=${close}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <div class="dialog-note">${S.devicePowerHint}</div>
            <div class="device-power-options">
              <button class="device-power-option ${current === null ? "active" : ""}" type="button" @click=${() => this._pickPower(kind, null)}>${S.devicePowerNothing}</button>
              ${options.map((option) => html`<button class="device-power-option ${current === option.slot ? "active" : ""}" type="button" data-slot=${option.slot} @click=${() => this._pickPower(kind, option.slot)}>${option.label}</button>`)}
            </div>
          </div>
        </div>
      </div>`;
  }

  private _renderLeaveDialog(): TemplateResult | typeof nothing {
    if (!this._leave) return nothing;
    const close = (): void => { this._leave = null; };
    const device = this._device;
    return html`
      <div class="modal-backdrop" @click=${close}>
        <div class="dialog small" id="wifi-leave-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${A.exitUnsyncedTitle}</div><button class="dialog-close" type="button" aria-label=${A.syncKeepEditing} @click=${close}>${icon(mdiClose)}</button></div>
          <div class="dialog-body"><div class="dialog-text">${T.leaveBody}</div></div>
          <div class="dialog-footer">
            <button class="btn btn-danger" id="wifi-leave-discard" type="button" @click=${this._leaveWithoutSync}>${A.exitWithoutSync}</button>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${close}>${A.syncKeepEditing}</button>
              <button class="dialog-btn dialog-btn-primary" id="wifi-leave-sync" type="button" ?disabled=${this._locked || !device || device.stale} @click=${() => void this._leaveAfterSync()}>${A.exitSyncNow}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  render(): TemplateResult {
    if (!this.ctx?.hub) return html`<div class="wifi-state">${TOOLS_CARD_STRINGS.common.noHubsFound}</div>`;
    const device = this._device;
    let body: TemplateResult;
    if (this.deviceKey && device && this._draft) body = this._renderDetail(device, this._draft);
    else if (this.deviceKey && this._list === null) body = html`<div class="wifi-state">${this._error ?? TOOLS_CARD_STRINGS.common.loading}</div>`;
    else body = this._renderList();
    return html`${body}${this._renderCreateDialog()}${this._renderDeleteDialog()}${this._renderSlotDialog()}${this._renderRenameDialog()}${this._renderPowerPicker()}${this._renderLeaveDialog()}`;
  }

}

export function defineWifiDevicesView(): void {
  if (!customElements.get(WIFI_DEVICES_VIEW_TAG)) customElements.define(WIFI_DEVICES_VIEW_TAG, SbPanelWifiDevices);
}

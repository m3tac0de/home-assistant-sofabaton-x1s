import { LitElement, css, html, nothing } from "lit";
import { renderSecondaryTabContent, renderSecondaryTabShell, secondaryTabStyles, type SecondaryTabItem } from "../components/secondary-tab";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  BackupSectionId,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError } from "../shared/utils/control-panel-selectors";
import { operationProgressStyles, renderOperationProgress } from "../components/operation-progress";
import { TOOLS_CARD_STRINGS } from "../strings";
import {
  assertBackupBundleRestoreCompatible,
  activityQuickAccessItems,
  type BackupCommandDecodedBlock,
  type BackupDeviceCommandItem,
  type BackupSelectionOption,
  type DecodableCommandClass,
  type DecodedFieldSpec,
  backupDeviceOptions,
  bundleActivityOptions,
  bundleDeviceClass,
  bundleDeviceOptions,
  commandDecodedBlock,
  DECODED_CLASS_FORM_SPECS,
  deviceCommandItems,
  deviceIpAddress,
  pruneBackupBundle,
  reconcileRestoreSelection,
  reorderBundleActivities,
  reorderBundleActivityQuickAccess,
  reorderBundleDevices,
  renameBundleActivity,
  renameBundleActivityFavorite,
  renameBundleActivityMacro,
  renameBundleDevice,
  renameBundleDeviceCommand,
  renameBundleHub,
  updateBundleDeviceIp,
  updateCommandDecodedFields,
  validateBackupBundle,
} from "./backup-state";

type BackupScope = "whole_hub" | "individual_devices";
type BackupEditTargetKind = "activity" | "device";
type BackupQuickAccessKind = "macro" | "favorite";
type BackupRenameDialogTarget =
  | { kind: "detail"; entityKind: BackupEditTargetKind; entityId: number }
  | { kind: "macro"; activityId: number; buttonId: number }
  | { kind: "favorite"; activityId: number; buttonId: number }
  | { kind: "command"; deviceId: number; commandId: number }
  | { kind: "device_ip"; deviceId: number }
  | { kind: "hub_name" };

// Device classes whose `ip_address` lives in the device head and is
// the source of truth for the device's network address. wifi_ip is
// deliberately excluded: it ships its IP inside each command blob,
// editable via the per-command structured-payload form.
const IP_HEAD_DEVICE_CLASSES = new Set(["wifi_hue", "wifi_roku", "wifi_sonos"]);

const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const BACKUP_SECTION_ITEMS: SecondaryTabItem<BackupSectionId>[] = [
  { id: "make", icon: "mdi:content-save-move-outline", label: "Make" },
  { id: "edit", icon: "mdi:pencil-box-outline", label: "Edit" },
  { id: "restore", icon: "mdi:database-import-outline", label: "Restore" },
];

class SofabatonBackupTab extends LitElement {
  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    cacheHub: { attribute: false },
    setHubCommandBusy: { attribute: false },
    refreshControlPanelState: { attribute: false },
    hubCommandBusy: { type: Boolean },
    hubCommandBusyLabel: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    persistentCacheEnabled: { type: Boolean },
    selectedHubProxyConnected: { type: Boolean },
    blockedTitle: { type: String },
    blockedMessage: { type: String },
    selectedSection: { attribute: false },
    setSelectedSection: { attribute: false },
    _backupScope: { state: true },
    _backupDeviceIds: { state: true },
    _backupError: { state: true },
    _backupProgress: { state: true },
    _restoreError: { state: true },
    _restoreSuccess: { state: true },
    _restoreProgress: { state: true },
    _restoreMode: { state: true },
    _restoreBundle: { state: true },
    _restoreFilename: { state: true },
    _restoreActivityIds: { state: true },
    _restoreManualDeviceIds: { state: true },
    _loadedBackupEntryId: { state: true },
    _backupHydrating: { state: true },
    _editBundle: { state: true },
    _editFilename: { state: true },
    _editError: { state: true },
    _editDetailKind: { state: true },
    _editDetailId: { state: true },
    _editDetailNameDraft: { state: true },
    _editRenameDialogOpen: { state: true },
    _editRenameDialogDraft: { state: true },
    _editRenameDialogError: { state: true },
    _editRenameDialogTarget: { state: true },
    _editRenameDialogDecodedDrafts: { state: true },
    _editRenameDialogDecodedSnapshot: { state: true },
    _decodedFormExpanded: { state: true },
    _editBundleDirty: { state: true },
    _haSortableReady: { state: true },
  };

  static styles = [secondaryTabStyles, operationProgressStyles, css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --backup-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --backup-radius-md: var(--ha-card-border-radius, 12px);
      --backup-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --backup-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --backup-radius-pill: calc(var(--ha-card-border-radius, 12px) * 999);
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
      line-height: 1.6;
    }
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
    .backup-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .backup-body {
      gap: 12px;
    }
    .restore-body {
      gap: 12px;
    }

    .header-primary-btn {
      flex: 0 0 auto;
      min-width: 114px;
      min-height: 42px;
      padding: 0 18px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 75%, white 10%);
      background: color-mix(in srgb, var(--primary-color) 20%, white 80%);
      color: var(--primary-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .header-primary-btn:hover:not(:disabled) {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 24%, white 76%);
    }
    .header-primary-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .backup-action-row {
      display: flex;
      justify-content: flex-start;
    }
    .backup-drawer-sub { color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
    .backup-section-title { color: var(--primary-text-color); font-size: 13px; font-weight: 700; }

    .backup-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .restore-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .backup-scope-group { display: grid; gap: 8px; }
    ha-radio-group.scope-form--md {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
      --ha-radio-option-active-color: var(--primary-color);
      --ha-radio-option-checked-background-color: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    ha-radio-group.scope-form--md ha-radio-option {
      min-width: 0;
    }
    @media (max-width: 380px) {
      ha-radio-group.scope-form--md { grid-template-columns: 1fr; }
    }
    .compat-radio-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .compat-radio-option {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .compat-radio-option:hover {
      border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
    }
    .compat-radio-option.selected {
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .compat-radio-option.disabled {
      opacity: 0.58;
      cursor: default;
    }
    .compat-radio-option-label {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }
    @media (max-width: 380px) {
      .compat-radio-group { grid-template-columns: 1fr; }
    }
    .compat-choice {
      width: 18px;
      height: 18px;
      margin: 0;
      flex: 0 0 auto;
      accent-color: var(--primary-color);
    }

    .backup-devices-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .backup-devices-head-main {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .backup-selected-count {
      color: var(--primary-color);
      font-size: 12px;
      font-weight: 700;
    }
    .backup-link-btn {
      border: none;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .backup-link-btn:disabled { opacity: 0.48; cursor: default; }

    .selection-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
      min-height: 0;
    }
    .backup-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .restore-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .edit-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .selection-list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
    .backup-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .restore-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .edit-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .selection-empty {
      padding: 16px 14px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .selection-group-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .selection-group-header:first-child { border-top: none; }
    .edit-config-view .selection-group-header {
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
    }
    .selection-row {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .selection-row:first-child { border-top: none; }
    .selection-row ha-checkbox { flex: 0 0 auto; }
    .selection-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1 1 auto;
    }
    .selection-label {
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
    }
    .selection-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      margin-left: 8px;
    }
    .selection-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }

    .edit-body { padding-top: 0; padding-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-content: normal; }
    .edit-config-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
    .edit-selection-row {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .edit-selection-row:first-child { border-top: none; }
    .edit-selection-row:hover {
      background: color-mix(in srgb, var(--primary-color) 6%, transparent);
    }
    .edit-order-sortable { display: block; }
    .edit-order-sortable-container { display: block; }
    /* Inside a sortable wrapper, ":first-child" of the row would not match
       (the row's parent is the wrapper, not the list). Re-strip the border
       on the first row of each wrapped group so groups still read cleanly. */
    .edit-order-sortable-container .edit-selection-row:first-child { border-top: none; }
    .edit-row-drag {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
      padding: 2px;
      margin-left: -4px;
    }
    .edit-row-drag:active { cursor: grabbing; }
    .edit-row-drag ha-icon { --mdc-icon-size: 18px; }
    .selection-chevron {
      color: var(--secondary-text-color);
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .selection-chevron ha-icon { --mdc-icon-size: 18px; }
    .tab-panel--detail { padding: 0; }
    .detail-view {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow: hidden;
    }
    .sticky-header {
      position: sticky;
      z-index: 2;
      background: var(--ha-card-background, var(--card-background-color));
    }
    .sticky-header { top: 0; border-bottom: 1px solid var(--divider-color); padding: 12px 16px; }
    .detail-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .detail-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }
    .detail-title-main {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .detail-title-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .detail-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--primary-text-color);
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Match the Wifi Commands tab's detail-view back button so the
       affordance is identical across the card: padded pill with a
       bold label-weight, content-sized (not a fixed square). */
    .back-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .back-btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .edit-detail-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      padding: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .edit-detail-copy {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }
    .edit-field-group {
      display: grid;
      gap: 8px;
    }
    .edit-field-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .edit-field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .edit-row-input {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      border-radius: var(--backup-radius-sm);
      padding: 4px 10px;
      outline: none;
    }
    .edit-row-input:focus { border-color: var(--primary-color); }
    .edit-support-card {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .icon-btn, .dialog-close {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease;
    }
    .icon-btn:hover:not(:disabled),
    .dialog-close:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }
    .icon-btn:active,
    .dialog-close:active { transform: translateY(1px); }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 16px; }
    .quick-access-section {
      display: grid;
      gap: 12px;
    }
    .quick-access-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .quick-access-title {
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 700;
    }
    .quick-access-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }
    .quick-access-list {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .quick-access-sortable {
      display: block;
    }
    .quick-access-sortable-container {
      display: block;
    }
    .quick-access-sortable-item {
      display: block;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      user-select: none;
      -webkit-user-select: none;
    }
    .quick-access-sortable-item:first-child {
      border-top: none;
    }
    .quick-access-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    /* Variant for rows that don't carry a drag handle (e.g. Device commands,
       which have no concept of ordering). Drop the leading column so the
       label sits flush with the row padding. */
    .quick-access-row--no-drag {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .quick-access-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .quick-access-label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .quick-access-label {
      min-width: 0;
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .quick-access-chip {
      flex: 0 0 auto;
      border-radius: var(--backup-radius-pill);
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 74%, transparent);
    }
    .quick-access-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.4;
    }
    .quick-access-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .quick-access-drag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
    }
    .quick-access-drag:active {
      cursor: grabbing;
    }
    .quick-access-empty {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .dialog-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 12px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .dialog-btn:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .dialog-btn-primary {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--backup-radius-lg); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog.medium { width: min(640px, calc(100vw - 36px)); }
    /* "Advanced" foldout that wraps the structured-payload form
       inside the Change Command dialog. Mirrors the Wifi Commands
       command-config popup so the affordance reads the same way
       across the card. */
    .advanced-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .advanced-toggle {
      width: fit-content;
      border: 0;
      background: transparent;
      color: var(--secondary-text-color);
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-align: left;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
    }
    .advanced-toggle:hover { color: var(--primary-text-color); }
    .advanced-toggle-copy { display: block; }
    .advanced-toggle ha-icon { --mdc-icon-size: 18px; transition: transform 120ms ease; }
    .advanced-toggle.expanded ha-icon { transform: rotate(180deg); }
    .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
    .decoded-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .decoded-form-head { display: flex; flex-direction: column; gap: 2px; }
    .decoded-form-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
    }
    .decoded-form-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.4;
    }
    .decoded-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .decoded-field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .decoded-field-input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      color: var(--primary-text-color);
      background: var(--ha-color-form-background, var(--secondary-background-color));
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 10px;
    }
    .decoded-field-input:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .decoded-field-input--multiline {
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      resize: vertical;
      min-height: 60px;
      white-space: pre;
    }
    /* Escaped wire-string fields are conceptually one long string with
       visible \\n escapes. Wrap on the textarea edge rather than
       overflowing horizontally, and break long URL-like tokens so the
       string never runs off the right side. */
    .decoded-field-input--escaped {
      white-space: pre-wrap;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .decoded-field-helper {
      font-size: 11px;
      color: var(--secondary-text-color);
      line-height: 1.35;
    }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; flex: 1; color: var(--primary-text-color); }
    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      --ha-color-form-background: var(
        --input-fill-color,
        var(
          --secondary-background-color,
          color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black)
        )
      );
      --ha-color-form-background-hover: var(--ha-color-form-background);
    }
    .dialog-body ha-input,
    .dialog-body ha-textfield {
      width: 100%;
    }
    .dialog-body ha-input {
      --ha-input-padding-top: 0;
      --ha-input-padding-bottom: 0;
    }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .dialog-footer-note { min-height: 18px; font-size: 13px; color: var(--error-color, #db4437); }

    .status-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
    }
    .status-box.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { display: inline-flex; color: inherit; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }

    .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
    .primary-btn, .secondary-btn {
      border-radius: var(--backup-radius-md);
      padding: 10px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .primary-btn {
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 16%, var(--ha-card-background, var(--card-background-color)));
    }
    .secondary-btn {
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      background: transparent;
    }
    .primary-btn:hover:not(:disabled), .secondary-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .primary-btn:disabled, .secondary-btn:disabled { opacity: 0.48; cursor: default; transform: none; }

    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid var(--divider-color);
      font-size: 12px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }

    .backup-complete-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--divider-color));
      border-radius: var(--backup-radius-xl);
      padding: 28px 18px;
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 14%, transparent), transparent 44%),
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
    }
    .backup-complete-icon {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      border-radius: var(--backup-radius-pill);
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .backup-complete-icon ha-icon { --mdc-icon-size: 30px; }
    .backup-complete-title {
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 700;
    }
    .backup-complete-sub {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }

    .backup-downloaded-note,
    .backup-expired-note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .backup-downloaded-note {
      color: var(--success-color, #43a047);
    }
    .backup-expired-note {
      color: var(--warning-color, #ff9800);
    }
    .backup-downloaded-note ha-icon,
    .backup-expired-note ha-icon {
      --mdc-icon-size: 16px;
    }

    .mode-option-btn {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      padding: 8px 14px;
    }
    .restore-action-row {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 10px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .restore-action-row .primary-btn { flex: 0 0 auto; }
    .filename-btn {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input[type="file"] { display: none; }

    /* Compact hub-name row on the Edit overview. Hub name is only
       applied at restore time when the user chooses to wipe the hub,
       so it earns a single thin row instead of its own card. */
    .edit-hub-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, black);
      font-size: 13px;
      min-width: 0;
    }
    .edit-hub-name-label {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }
    .edit-hub-name-value {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }
    .edit-hub-name-row .icon-btn {
      flex: 0 0 auto;
      padding: 2px;
    }
    .edit-hub-name-row .icon-btn ha-icon { --mdc-icon-size: 18px; }

    /* Unsaved-changes indicators.
       .edit-unsaved-chip is the compact pill used in the detail
       sticky-header next to the title. .edit-unsaved-banner is the
       wider notice on the overview page above the action row.
       .primary-btn--unsaved decorates the Download button with a
       dot when there are pending edits. */
    .edit-unsaved-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      padding: 2px 8px 2px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 999px;
      color: var(--warning-color, #f59e0b);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
    }
    .edit-unsaved-chip::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
    }
    .edit-unsaved-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 10%, transparent);
      color: var(--primary-text-color);
      font-size: 13px;
      line-height: 1.4;
    }
    .edit-unsaved-banner ha-icon {
      --mdc-icon-size: 18px;
      color: var(--warning-color, #f59e0b);
      flex: 0 0 auto;
    }
    .primary-btn--unsaved::after {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-left: 8px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
      vertical-align: middle;
    }

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
      .quick-access-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }
      .quick-access-actions {
        justify-content: flex-end;
      }
      .edit-field-row,
      .restore-action-row {
        align-items: stretch;
        flex-direction: column;
      }
      .detail-title-actions {
        gap: 6px;
        min-width: max-content;
      }
      .restore-action-row > .primary-btn,
      .restore-action-row > .secondary-btn {
        width: 100%;
      }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small {
        width: min(100vw, 100%);
        max-height: calc(100vh - max(env(safe-area-inset-top), 8px));
        border-radius: var(--backup-radius-xl) var(--backup-radius-xl) 0 0;
      }
      .dialog-footer {
        flex-direction: column;
        align-items: stretch;
      }
      .dialog-footer-actions {
        width: 100%;
      }
      .dialog-footer-actions .dialog-btn {
        flex: 1 1 0;
      }
      .dialog-footer-note {
        min-height: 0;
      }
    }
  `];

  hass: HassLike | null = null;
  hub: ControlPanelHubState | null = null;
  cacheHub: CacheHubState | null = null;
  setHubCommandBusy?: (busy: boolean, label?: string | null) => void;
  refreshControlPanelState?: () => Promise<unknown>;
  hubCommandBusy = false;
  hubCommandBusyLabel: string | null = null;
  loading = false;
  error: string | null = null;
  persistentCacheEnabled = false;
  selectedHubProxyConnected = false;
  blockedTitle: string | null = null;
  blockedMessage: string | null = null;
  selectedSection: BackupSectionId = "make";
  setSelectedSection: (section: BackupSectionId) => void = () => {};

  private _backupScope: BackupScope = "whole_hub";
  private _backupDeviceIds: number[] = [];
  private _backupError: string | null = null;
  private _backupProgress: BackupProgressEvent | null = null;
  private _restoreError: string | null = null;
  private _restoreSuccess: string | null = null;
  private _restoreProgress: BackupProgressEvent | null = null;
  private _restoreMode: "replace" | "merge" = "merge";
  private _restoreBundle: BackupBundlePayload | null = null;
  private _restoreFilename = "";
  private _restoreActivityIds: number[] = [];
  private _restoreManualDeviceIds: number[] = [];
  private _progressUnsub: (() => void) | null = null;
  private _loadedBackupEntryId = "";
  private _backupHydrating = false;
  // Op-ids the user has already acknowledged (via Complete, error
  // dismiss, etc.). The sync function skips re-applying terminal
  // status for any op in this set, so subscription events or stale
  // server snapshots cannot snap the view back to a "complete" or
  // "failed" view the user has already moved past. Cleared opportunistically
  // when the op stops appearing in the server snapshot.
  private _acknowledgedOpIds: Set<string> = new Set();
  private _editBundle: BackupBundlePayload | null = null;
  private _editFilename = "";
  private _editError: string | null = null;
  private _editDetailKind: BackupEditTargetKind | null = null;
  private _editDetailId: number | null = null;
  private _editDetailNameDraft = "";
  private _editRenameDialogOpen = false;
  private _editRenameDialogDraft = "";
  private _editRenameDialogError = "";
  private _editRenameDialogTarget: BackupRenameDialogTarget | null = null;
  // Whether the structured-payload form is expanded inside the
  // rename dialog. Defaults to collapsed because payload editing is
  // an advanced use case — most users only want to rename. Reset on
  // every dialog open / close so each session starts collapsed.
  private _decodedFormExpanded = false;

  // True when `_editBundle` has user-made changes that have not yet
  // been downloaded. Flipped on by every edit handler (rename, reorder,
  // decoded payload, IP, etc.) and on session restore (those ARE
  // unsaved edits). Flipped off by `_downloadEditedBundle` and by
  // any path that loads a fresh bundle from file. Drives the
  // "Unsaved" indicators in the Edit overview and detail header.
  private _editBundleDirty = false;
  // Per-field text drafts for the structured-payload editor that shows
  // inside the rename dialog when the target command is in a decodable
  // class. Keyed by the spec's `key`. Empty for non-command targets and
  // for command targets without a decoded block.
  private _editRenameDialogDecodedDrafts: Record<string, string> = {};
  // Snapshot of the decoded block at dialog-open time, used to:
  //   (a) skip the bundle update entirely when nothing changed, and
  //   (b) decide whether to render the structured-payload form.
  private _editRenameDialogDecodedSnapshot: BackupCommandDecodedBlock | null = null;
  private _haSortableReady = Boolean(customElements.get("ha-sortable"));
  private readonly _backupScopeRadioName = `sofabaton-backup-scope-${Math.random().toString(36).slice(2)}`;
  private _editSessionRestoreTried = false;
  // entry_id of the hub the currently-loaded restore bundle was picked
  // against. Used to detect hub-picker switches and drop a bundle that is no
  // longer valid for the now-selected hub.
  private _restoreHubEntryId: string | null = null;
  private static readonly _EDIT_SESSION_TTL_MS = 60 * 60 * 1000;
  private static readonly _EDIT_SESSION_KEY_PREFIX = "sofabaton.backup-edit-session.v1.";

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this._haSortableReady) {
      void customElements.whenDefined("ha-sortable").then(() => {
        this._haSortableReady = true;
      });
    }
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) {
      void this._syncBackupOperationState();
      // Hub identity changed — re-attempt restore against the new hub's session.
      this._editSessionRestoreTried = false;
      // A loaded restore bundle is hub-specific: it was validated against the
      // previously-selected hub's firmware version when the file was picked.
      // Carrying it across a hub switch would let the user sidestep the
      // newer-hub-onto-older-hub guard (e.g. open an X2 bundle on an X2, then
      // switch the picker to an X1 and hit Start restore). Drop any pending
      // bundle when the entry_id actually changes from one real hub to another
      // so the user is forced to re-pick the file against the new hub.
      const nextEntryId = String(this.hub?.entry_id || "").trim() || null;
      if (this._restoreHubEntryId && nextEntryId !== this._restoreHubEntryId) {
        this._resetRestoreBundleForHubSwitch();
      }
      this._restoreHubEntryId = nextEntryId;
    }
    if (changed.has("cacheHub") && this.cacheHub && !this._backupDeviceIds.length) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
    // Only attempt to restore the saved edit session when the user is
    // already viewing the Edit section. Otherwise restoring an in-memory
    // bundle (and possibly an open detail view) would yank the user away
    // from whatever tab/section they actually had open.
    if (
      !this._editSessionRestoreTried
      && this.hub
      && this.selectedSection === "edit"
      && !this._editBundle
    ) {
      this._editSessionRestoreTried = true;
      this._restoreEditSession();
    }
    if (
      changed.has("_editBundle")
      || changed.has("_editFilename")
      || changed.has("_editDetailKind")
      || changed.has("_editDetailId")
    ) {
      this._persistEditSession();
    }
  }

  private _editSessionStorageKey(): string | null {
    const entryId = this.hub?.entry_id;
    if (!entryId) return null;
    return `${SofabatonBackupTab._EDIT_SESSION_KEY_PREFIX}${entryId}`;
  }

  private _persistEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    try {
      if (!this._editBundle) {
        window.localStorage.removeItem(key);
        return;
      }
      const payload = {
        savedAt: Date.now(),
        filename: this._editFilename || "",
        bundle: this._editBundle,
        detail: this._editDetailKind && this._editDetailId != null
          ? { kind: this._editDetailKind, id: this._editDetailId }
          : null,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // localStorage can throw (quota, privacy mode, etc.) — fail silently.
    }
  }

  private _clearEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  /**
   * Wipe the in-memory edit draft AND the persisted session.
   * Called when the user starts a new backup or restore so they don't return
   * to the Edit tab and mistake a stale draft for the file they just produced.
   */
  private _discardEditSession() {
    this._editBundle = null;
    this._editFilename = "";
    this._editError = null;
    this._editBundleDirty = false;
    this._closeEditDetail();
    this._clearEditSession();
  }

  private _restoreEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        savedAt?: number;
        filename?: string;
        bundle?: unknown;
        detail?: { kind?: BackupEditTargetKind; id?: number } | null;
      };
      const savedAt = Number(parsed?.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > SofabatonBackupTab._EDIT_SESSION_TTL_MS) {
        window.localStorage.removeItem(key);
        return;
      }
      const bundle = validateBackupBundle(parsed.bundle);
      this._editBundle = bundle;
      this._editFilename = typeof parsed.filename === "string" ? parsed.filename : "";
      if (parsed.detail && parsed.detail.kind && Number.isFinite(Number(parsed.detail.id))) {
        this._editDetailKind = parsed.detail.kind;
        this._editDetailId = Number(parsed.detail.id);
      }
      // A restored session was already an in-progress edit by definition.
      // Surface it as dirty so the user sees the same warning they'd see
      // if they were still mid-edit when they walked away.
      this._editBundleDirty = true;
    } catch {
      // Corrupt or incompatible — drop it so we don't keep failing.
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  protected render() {
    if (this.loading) {
      return html`<div class="tab-panel"><div class="state">Loading backup tools…</div></div>`;
    }
    if (this.error) {
      return html`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return html`<div class="tab-panel"><div class="state">${TOOLS_CARD_STRINGS.backup.selectHub}</div></div>`;
    }
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

    if (this.selectedSection === "edit" && this._editDetailKind && this._editDetailId != null) {
      const detailTitle = this._selectedEditTitle();
      if (detailTitle) {
        return this._renderEditDetailView({
          kind: this._editDetailKind,
          title: detailTitle,
        });
      }
    }

    return html`
      <div class="tab-panel">
        ${renderSecondaryTabShell({
          items: BACKUP_SECTION_ITEMS,
          selectedId: this.selectedSection,
          onSelect: (section) => this.setSelectedSection(section),
          connected: true,
          shellClassName: "backup-panel secondary-view-shell--edge",
          content:
            this.selectedSection === "make"
              ? this._renderBackupSectionContent()
              : this.selectedSection === "edit"
                ? this._renderEditSectionContent()
                : this._renderRestoreSectionContent(),
        })}
      </div>
    `;
  }

  private _renderBackupSectionContent() {
    const devices = backupDeviceOptions(this.cacheHub);
    const wholeHub = this._backupScope === "whole_hub";
    const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
    const isRunning = this._isProgressRunning(this._backupProgress);
    const isSuccess = String(this._backupProgress?.status || "") === "success";
    const allDevicesSelected = devices.length > 0 && this._backupDeviceIds.length === devices.length;
    const summary = this._backupResultSummary(this._backupProgress?.backup);

    return html`
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "backup-body",
        content: html`
            <div class="backup-drawer-sub">
              ${isRunning
                ? TOOLS_CARD_STRINGS.backup.creatingSubtitle
                : isSuccess
                  ? TOOLS_CARD_STRINGS.backup.readySubtitle
                  : TOOLS_CARD_STRINGS.backup.chooseSubtitle}
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub
              ? this._renderStatus("warning", "mdi:database-off-outline", TOOLS_CARD_STRINGS.backup.enablePersistentCache)
              : nothing}
            ${this._backupError
              ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError)
              : nothing}
            ${isRunning && this._backupProgress
              ? this._renderProgressCard(this._backupProgress, "backup")
              : isSuccess
                ? (() => {
                    const hasBundle = !!this._backupProgress?.backup;
                    const wasDownloaded = !!this._backupProgress?.backup_downloaded;
                    const expired = !!this._backupProgress?.backup_expired;
                    return html`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">${TOOLS_CARD_STRINGS.backup.completedTitle}</div>
                    <div class="backup-complete-sub">${summary}</div>
                    ${expired
                      ? html`<div class="backup-expired-note">
                          <ha-icon icon="mdi:clock-alert-outline"></ha-icon>
                          ${TOOLS_CARD_STRINGS.backup.expired}
                        </div>`
                      : wasDownloaded
                        ? html`<div class="backup-downloaded-note">
                            <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                            ${TOOLS_CARD_STRINGS.backup.downloaded}
                          </div>`
                        : nothing}
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!hasBundle} @click=${this._downloadLatestBackup}>
                        ${wasDownloaded ? TOOLS_CARD_STRINGS.backup.downloadAgain : TOOLS_CARD_STRINGS.backup.downloadBackup}
                      </button>
                      <button class="secondary-btn" @click=${() => void this._completeBackupResult()}>${TOOLS_CARD_STRINGS.backup.complete}</button>
                    </div>
                  </div>
                `;
                  })()
                : html`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    ${this._renderScopeGroup({
                      value: this._backupScope,
                      disabled: this._backupLocked() || !this.cacheHub,
                      options: [
                        { value: "whole_hub", label: TOOLS_CARD_STRINGS.backup.entireHub },
                        { value: "individual_devices", label: TOOLS_CARD_STRINGS.backup.selectedDevices },
                      ],
                      onChange: (next) => this._setBackupScope(next),
                    })}
                  </div>
                  ${!wholeHub ? html`
                    <div class="backup-devices-head">
                      <div class="backup-devices-head-main">
                        <div class="backup-section-title">${TOOLS_CARD_STRINGS.backup.devicesToInclude}</div>
                        <div class="backup-selected-count">${TOOLS_CARD_STRINGS.backup.selectedCount(this._backupDeviceIds.length)}</div>
                      </div>
                      <button class="backup-link-btn" ?disabled=${this._backupLocked() || !this.cacheHub} @click=${this._toggleAllBackupDevices}>
                        ${allDevicesSelected ? TOOLS_CARD_STRINGS.backup.deselectAll : TOOLS_CARD_STRINGS.backup.selectAll}
                      </button>
                    </div>
                    <div class="selection-card">
                      <div class="selection-list">
                        ${devices.length
                          ? devices.map((device) => html`
                              <div
                                class="selection-row"
                                @click=${() => {
                                  if (this._backupLocked() || !this.cacheHub) return;
                                  this._setBackupDevice(device.id, !selectedDeviceIds.includes(device.id));
                                }}
                              >
                                ${this._renderCheckboxControl({
                                  checked: selectedDeviceIds.includes(device.id),
                                  disabled: this._backupLocked() || !this.cacheHub,
                                  onChange: (checked) => this._setBackupDevice(device.id, checked),
                                })}
                                <span class="selection-main">
                                  <span class="selection-label">${device.label}</span>
                                </span>
                                ${device.meta ? html`<span class="selection-meta">${device.meta}</span>` : nothing}
                              </div>
                            `)
                          : html`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noDevicesAvailable}</div>`}
                      </div>
                    </div>
                  ` : nothing}
                  <div class="backup-action-row">
                    <button
                      class="primary-btn header-primary-btn"
                      ?disabled=${this._backupActionDisabled()}
                      @click=${() => void this._runBackup()}
                    >
                      ${isRunning ? TOOLS_CARD_STRINGS.backup.working : TOOLS_CARD_STRINGS.backup.startBackup}
                    </button>
                  </div>
                  </div>
                `}
        `,
      })}
    `;
  }

  private _renderEditSectionContent() {
    const bundle = this._editBundle;
    const activityOptions = bundleActivityOptions(bundle);
    const deviceOptions = bundleDeviceOptions(bundle);
    return html`
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "edit-body",
        content: html`
            ${this._editError ? this._renderStatus("error", "mdi:alert-circle-outline", this._editError) : nothing}
            <input id="edit-file-input" type="file" accept=".json,application/json" @change=${this._handleEditFilePicked} />
            ${bundle ? html`
              ${this._renderEditOverview({
                activityOptions,
                deviceOptions,
              })}
            ` : html`
              <div class="edit-config-view">
                <div class="backup-drawer-sub">
                  ${TOOLS_CARD_STRINGS.backup.editLoadPrompt}
                </div>
                <div class="restore-action-row">
                  <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || TOOLS_CARD_STRINGS.backup.chooseBackupFile}</button>
                </div>
              </div>
            `}
            ${this._renderEditRenameDialog()}
        `,
      })}
    `;
  }

  private _renderEditOverview(params: {
    activityOptions: BackupSelectionOption[];
    deviceOptions: BackupSelectionOption[];
  }) {
    const activitiesSortable = this._haSortableReady && params.activityOptions.length > 1;
    const devicesSortable = this._haSortableReady && params.deviceOptions.length > 1;
    const renderActivityRows = () => params.activityOptions.map((option) =>
      this._renderEditCollectionRow(
        option,
        () => this._openEditDetail("activity", option.id, option.label),
        activitiesSortable,
      ));
    const renderDeviceRows = () => params.deviceOptions.map((option) =>
      this._renderEditCollectionRow(
        option,
        () => this._openEditDetail("device", option.id, option.label),
        devicesSortable,
      ));
    const hubName = String(this._editBundle?.hub?.name ?? "").trim();
    return html`
      <div class="edit-config-view">
        <div class="backup-drawer-sub">
          ${TOOLS_CARD_STRINGS.backup.editLoadPrompt}
          ${this._haSortableReady
            ? TOOLS_CARD_STRINGS.backup.reorderHint
            : ""}
        </div>
        <div class="edit-hub-name-row" title="Hub name is only applied at restore time when the user opts to wipe the hub.">
          <span class="edit-hub-name-label">${TOOLS_CARD_STRINGS.backup.hubName}</span>
          <span class="edit-hub-name-value">${hubName || TOOLS_CARD_STRINGS.backup.hubNameNotSet}</span>
          <button
            class="icon-btn"
            @click=${this._openHubNameRenameDialog}
            aria-label=${TOOLS_CARD_STRINGS.backup.renameHub}
          >
            <ha-icon icon="mdi:pencil"></ha-icon>
          </button>
        </div>
        <div class="selection-card">
          <div class="selection-list">
            ${params.activityOptions.length
              ? html`
                  <div class="selection-group-header">${TOOLS_CARD_STRINGS.backup.activities}</div>
                  ${activitiesSortable
                    ? html`
                        <ha-sortable
                          class="edit-order-sortable"
                          draggable-selector=".edit-selection-row"
                          handle-selector=".edit-row-drag"
                          animation="180"
                          @item-moved=${this._handleEditActivityOrderSort}
                        >
                          <div class="edit-order-sortable-container">
                            ${renderActivityRows()}
                          </div>
                        </ha-sortable>
                      `
                    : renderActivityRows()}
                `
              : html`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noActivitiesInFile}</div>`}
            ${params.deviceOptions.length
              ? html`
                  <div class="selection-group-header">${TOOLS_CARD_STRINGS.backup.devices}</div>
                  ${devicesSortable
                    ? html`
                        <ha-sortable
                          class="edit-order-sortable"
                          draggable-selector=".edit-selection-row"
                          handle-selector=".edit-row-drag"
                          animation="180"
                          @item-moved=${this._handleEditDeviceOrderSort}
                        >
                          <div class="edit-order-sortable-container">
                            ${renderDeviceRows()}
                          </div>
                        </ha-sortable>
                      `
                    : renderDeviceRows()}
                `
              : html`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noDevicesInFile}</div>`}
          </div>
        </div>
        ${this._editBundleDirty
          ? html`
              <div class="edit-unsaved-banner" role="status">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${TOOLS_CARD_STRINGS.backup.unsavedChanges}<strong>${TOOLS_CARD_STRINGS.backup.downloadEditedBackupStrong}</strong>${TOOLS_CARD_STRINGS.backup.unsavedChangesSuffix}</span>
              </div>
            `
          : nothing}
        <div class="restore-action-row">
          <button
            class="primary-btn${this._editBundleDirty ? " primary-btn--unsaved" : ""}"
            @click=${this._downloadEditedBundle}
          >${TOOLS_CARD_STRINGS.backup.downloadEditedBackup}</button>
          <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || TOOLS_CARD_STRINGS.backup.chooseBackupFile}</button>
        </div>
      </div>
    `;
  }

  private _renderEditCollectionRow(
    option: BackupSelectionOption,
    onSelect: () => void,
    showDragHandle: boolean,
  ) {
    return html`
      <button class="edit-selection-row" @click=${onSelect}>
        ${showDragHandle
          ? html`
              <span
                class="edit-row-drag"
                aria-hidden="true"
                @click=${(event: Event) => event.stopPropagation()}
              >
                <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
              </span>
            `
          : nothing}
        <span class="selection-main">
          <span class="selection-label">${option.label}</span>
        </span>
        ${option.meta ? html`<span class="selection-meta">${option.meta}</span>` : nothing}
        <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
      </button>
    `;
  }

  private _renderEditDetailView(params: {
    kind: BackupEditTargetKind;
    title: string;
  }) {
    const activityQuickAccess = params.kind === "activity" && this._editDetailId != null
      ? activityQuickAccessItems(this._editBundle, this._editDetailId)
      : [];
    const deviceCommands = params.kind === "device" && this._editDetailId != null
      ? deviceCommandItems(this._editBundle, this._editDetailId)
      : [];
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._closeEditDetail}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title">${params.title}</div>
                ${this._editBundleDirty
                  ? html`<span class="edit-unsaved-chip" title="You have unsaved changes. Download the backup to save them.">Unsaved</span>`
                  : nothing}
                <div class="detail-title-actions">
                  <button class="icon-btn" @click=${this._openDetailRenameDialog} aria-label=${`Rename ${params.kind}`}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            ${params.kind === "activity"
              ? this._renderActivityQuickAccessSection(activityQuickAccess)
              : html`
                  ${this._renderDeviceNetworkSection()}
                  ${this._renderDeviceCommandsSection(deviceCommands)}
                `}
          </div>
        </div>
        ${this._renderEditRenameDialog()}
      </div>
    `;
  }

  /**
   * "Network" section shown above Commands in the Device detail view
   * for hue / roku / sonos devices, where the IP address lives on the
   * device head and the hub uses it to build Host headers / addressing
   * at replay time. wifi_ip devices are deliberately excluded — their
   * IP lives inside each command blob and is edited per-command via
   * the structured-payload form.
   */
  private _renderDeviceNetworkSection() {
    if (this._editDetailId == null || !this._editBundle) return nothing;
    const deviceId = Number(this._editDetailId);
    const deviceClass = bundleDeviceClass(this._editBundle, deviceId) ?? "";
    if (!IP_HEAD_DEVICE_CLASSES.has(deviceClass)) return nothing;
    const ip = deviceIpAddress(this._editBundle, deviceId);
    return html`
      <div class="quick-access-section">
        <div class="quick-access-head">
          <div class="quick-access-title">Network</div>
          <div class="quick-access-sub">
            The device's IP address lives in the device record. The hub uses it to address the device at replay time (Host header for Hue / Sonos, base URL for Roku).
          </div>
        </div>
        <div class="quick-access-list">
          <div class="quick-access-sortable-container">
            <div class="quick-access-sortable-item">
              <div class="quick-access-row quick-access-row--no-drag">
                <div class="quick-access-main">
                  <div class="quick-access-label-row">
                    <div class="quick-access-label">${ip ?? "(not set)"}</div>
                    <div class="quick-access-chip">ip</div>
                  </div>
                  <div class="quick-access-meta">IPv4 dotted-decimal address</div>
                </div>
                <div class="quick-access-actions">
                  <button
                    class="icon-btn"
                    @click=${() => this._openDeviceIpRenameDialog(deviceId)}
                    aria-label="Edit IP address"
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderDeviceCommandsSection(items: BackupDeviceCommandItem[]) {
    if (this._editDetailId == null) return nothing;
    return html`
      <div class="quick-access-section">
        <div class="quick-access-head">
          <div class="quick-access-title">Commands</div>
          <div class="quick-access-sub">
            Use the pencil to rename a command. Names update everywhere the command is referenced.
          </div>
        </div>
        ${items.length
          ? html`
              <div class="quick-access-list">
                <div class="quick-access-sortable-container">
                  ${items.map((item) => this._renderDeviceCommandRow(item))}
                </div>
              </div>
            `
          : html`<div class="quick-access-empty">This Device does not currently have any commands.</div>`}
      </div>
    `;
  }

  private _renderDeviceCommandRow(item: BackupDeviceCommandItem) {
    return html`
      <div class="quick-access-sortable-item" data-kind="command" data-command-id=${item.commandId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">command</div>
            </div>
            <div class="quick-access-meta">
              Command ID ${item.commandId}
            </div>
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openDeviceCommandRenameDialog(item.commandId)}
              aria-label="Rename command"
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderActivityQuickAccessSection(items: ReturnType<typeof activityQuickAccessItems>) {
    if (this._editDetailId == null) return nothing;
    const rows = items.map((item) => this._renderActivityQuickAccessRow(item));
    return html`
      <div class="quick-access-section">
        <div class="quick-access-head">
          <div class="quick-access-title">Macros and Favorites</div>
          <div class="quick-access-sub">
            ${this._haSortableReady
              ? "Drag the handle to reorder Macros and Favorites inside the Activity."
              : "Drag support is unavailable here, so use the move buttons to reorder Macros and Favorites."}
          </div>
        </div>
        ${items.length
          ? html`
              <div class="quick-access-list">
                ${this._haSortableReady
                  ? html`
                      <ha-sortable
                        class="quick-access-sortable"
                        draggable-selector=".quick-access-sortable-item"
                        handle-selector=".quick-access-drag"
                        animation="180"
                        @item-moved=${this._handleActivityQuickAccessSort}
                      >
                        <div class="quick-access-sortable-container">
                          ${rows}
                        </div>
                      </ha-sortable>
                    `
                  : rows}
              </div>
            `
          : html`<div class="quick-access-empty">This Activity does not currently contain any Macros or Favorites.</div>`}
      </div>
    `;
  }

  private _renderActivityQuickAccessRow(item: ReturnType<typeof activityQuickAccessItems>[number]) {
    return html`
      <div class="quick-access-sortable-item" data-kind=${item.kind} data-button-id=${item.buttonId}>
        <div class="quick-access-row">
          <div class="quick-access-drag" aria-hidden="true">
            <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
          </div>
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${item.kind}</div>
            </div>
            <div class="quick-access-meta">
              ${item.kind === "macro"
                ? `Quick-access slot ${item.buttonId}`
                : `Favorite command ${item.commandId || "?"} on device ${item.deviceId || "?"} · slot ${item.buttonId}`}
            </div>
          </div>
          <div class="quick-access-actions">
            ${this._haSortableReady ? nothing : html`
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, -1)}
                aria-label="Move up"
              >
                <ha-icon icon="mdi:chevron-up"></ha-icon>
              </button>
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, 1)}
                aria-label="Move down"
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            `}
            <button
              class="icon-btn"
              @click=${() => this._openQuickAccessRenameDialog(item.kind, item.buttonId)}
              aria-label=${`Rename ${item.kind}`}
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _bundleSupportsUnicodeNames() {
    const version = String(this._editBundle?.hub?.version || "").toUpperCase();
    return version.includes("X2") || version.includes("X1S");
  }

  private _sanitizeBundleName(value: unknown) {
    const pattern = this._bundleSupportsUnicodeNames()
      ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu
      : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }

  private _useLegacyTextField() {
    return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
  }

  private _renderEditRenameDialog() {
    if (!this._editRenameDialogOpen || !this._editRenameDialogTarget) return nothing;
    const label = this._editRenameDialogLabel();
    const decoded = this._editRenameDialogDecodedSnapshot;
    // Expand the dialog only when the structured-payload form is in
    // play; the simple rename keeps its compact look.
    const dialogSizeClass = decoded ? "medium" : "small";
    return html`
      <div class="modal-backdrop" @click=${this._closeEditRenameDialog}>
        <div class="dialog ${dialogSizeClass}" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${label}</div>
            <button class="dialog-close" @click=${this._closeEditRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._useLegacyTextField()
              ? html`
                  <ha-textfield
                    id="sb-backup-edit-name"
                    .label=${this._editRenameFieldLabel()}
                    .maxLength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyEditRenameDialog(); } }}
                  ></ha-textfield>
                `
              : html`
                  <ha-input
                    id="sb-backup-edit-name"
                    type="text"
                    .label=${this._editRenameFieldLabel()}
                    .maxlength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyEditRenameDialog(); } }}
                  ></ha-input>
                `}
            ${decoded ? this._renderAdvancedPayloadFoldout(decoded.className) : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._editRenameDialogError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeEditRenameDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyEditRenameDialog}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Mirror the Wifi-Commands "Advanced" foldout: the structured-
   * payload editor is rarely needed (renames are the common case),
   * so it sits behind a collapsed toggle. Open / close persists for
   * the current dialog session; close resets it back to collapsed.
   */
  private _renderAdvancedPayloadFoldout(className: DecodableCommandClass) {
    const expanded = this._decodedFormExpanded;
    return html`
      <div class="advanced-section">
        <button
          class="advanced-toggle ${expanded ? "expanded" : ""}"
          type="button"
          @click=${() => { this._decodedFormExpanded = !this._decodedFormExpanded; }}
          aria-expanded=${String(expanded)}
        >
          <span class="advanced-toggle-copy">
            <span>Advanced</span>
          </span>
          <ha-icon icon="mdi:chevron-down"></ha-icon>
        </button>
        ${expanded ? html`
          <div class="advanced-panel">
            ${this._renderDecodedPayloadForm(className)}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderDecodedPayloadForm(className: DecodableCommandClass) {
    const spec = DECODED_CLASS_FORM_SPECS[className];
    if (!spec) return nothing;
    return html`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">${spec.title}</div>
          ${spec.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}
        </div>
        ${spec.fields.map((field) => this._renderDecodedField(field))}
      </div>
    `;
  }

  private _renderDecodedField(field: DecodedFieldSpec) {
    const value = this._editRenameDialogDecodedDrafts[field.key] ?? "";
    const onInput = (event: Event) => this._handleDecodedFieldInput(event, field.key);
    const multilineClass = field.escapedDisplay
      ? "decoded-field-input--multiline decoded-field-input--escaped"
      : "decoded-field-input--multiline";
    return html`
      <label class="decoded-field">
        <span class="decoded-field-label">${field.label}</span>
        ${field.multiline
          ? html`
              <textarea
                class="decoded-field-input ${multilineClass}"
                rows="4"
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              ></textarea>
            `
          : html`
              <input
                class="decoded-field-input"
                type=${field.numeric ? "number" : "text"}
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              />
            `}
        ${field.helper ? html`<span class="decoded-field-helper">${field.helper}</span>` : nothing}
      </label>
    `;
  }

  private _editRenameDialogLabel() {
    const target = this._editRenameDialogTarget;
    if (!target) return "Rename";
    if (target.kind === "detail") {
      return target.entityKind === "activity" ? "Rename Activity" : "Rename Device";
    }
    if (target.kind === "macro") return "Rename Macro";
    if (target.kind === "favorite") return "Rename Favorite";
    if (target.kind === "device_ip") return "Edit IP address";
    if (target.kind === "hub_name") return "Rename Hub";
    return "Change Command";
  }

  /** Per-target label & max length used by the dialog's primary text input. */
  private _editRenameFieldLabel(): string {
    return this._editRenameDialogTarget?.kind === "device_ip" ? "IP address" : "Name";
  }

  private _editRenameFieldMaxLength(): number {
    // "255.255.255.255" is 15 chars; everything else uses the
    // historical hub-name cap of 20.
    return this._editRenameDialogTarget?.kind === "device_ip" ? 15 : 20;
  }

  /**
   * Diff each spec field against the open-dialog snapshot. Returns a
   * record of fields that changed (mapped back through the wire-format
   * coercion in `_draftToFieldValue`), or `null` when nothing changed
   * and the bundle should be left untouched.
   */
  private _collectChangedDecodedFields(
    snapshot: BackupCommandDecodedBlock,
  ): Record<string, unknown> | null {
    const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
    if (!spec) return null;
    const changed: Record<string, unknown> = {};
    let touched = false;
    for (const field of spec.fields) {
      const draft = this._editRenameDialogDecodedDrafts[field.key] ?? "";
      const original = this._fieldValueToDraft(snapshot.fields[field.key], field);
      if (draft === original) continue;
      changed[field.key] = this._draftToFieldValue(draft, field);
      touched = true;
    }
    return touched ? changed : null;
  }

  /**
   * Convert a draft string from a form control to the value shape the
   * decoder expects. `numeric` fields become numbers; `crlfOnWire`
   * fields get `\n` line endings normalized to `\r\n` so the wire
   * round-trip stays exact even though the browser textarea hides the
   * `\r`. Everything else passes through verbatim.
   */
  private _draftToFieldValue(draft: string, field: DecodedFieldSpec): unknown {
    if (field.numeric) {
      const numeric = Number(draft);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    if (field.escapedDisplay) {
      // Inverse of the display escape in `_fieldValueToDraft`. We do
      // NOT touch lone backslashes — body_block content in observed
      // Hue / Sonos commands never contains literal `\` text, and
      // honoring `\\` would force the user to double-escape ordinary
      // backslashes in pasted JSON.
      let result = draft.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      // If the user pressed Enter inside the textarea, that produces
      // a real LF in the input value. Keep it — they meant a newline,
      // and the next render will re-escape it for display. The above
      // replace order means typed `\n` text wins over rendered LF,
      // which is what we want.
      return result;
    }
    if (field.crlfOnWire) {
      return draft.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    }
    return draft;
  }

  private _handleDecodedFieldInput = (event: Event, fieldKey: string) => {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    this._editRenameDialogDecodedDrafts = {
      ...this._editRenameDialogDecodedDrafts,
      [fieldKey]: input.value,
    };
  };

  private _handleEditRenameDialogInput = (event: Event) => {
    const input = event.currentTarget as HTMLElement & { value: string };
    // Name-style targets get the historical sanitizer (printable set
    // limited to what the X1 / X1S firmware accepts in stored labels).
    // The `device_ip` target needs `.` characters and is constrained by
    // its own IPv4 validation at save time, so it passes through raw.
    if (this._editRenameDialogTarget?.kind === "device_ip") {
      this._editRenameDialogDraft = input.value;
    } else {
      const value = this._sanitizeBundleName(input.value);
      input.value = value;
      this._editRenameDialogDraft = value;
    }
    this._editRenameDialogError = "";
  };

  private _openDetailRenameDialog = () => {
    if (!this._editDetailKind || this._editDetailId == null) return;
    this._editRenameDialogTarget = {
      kind: "detail",
      entityKind: this._editDetailKind,
      entityId: this._editDetailId,
    };
    this._editRenameDialogDraft = this._selectedEditTitle();
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  };

  private _openHubNameRenameDialog = () => {
    if (!this._editBundle) return;
    this._editRenameDialogTarget = { kind: "hub_name" };
    this._editRenameDialogDraft = this._sanitizeBundleName(String(this._editBundle.hub?.name ?? ""));
    this._editRenameDialogError = "";
    this._editRenameDialogDecodedSnapshot = null;
    this._editRenameDialogDecodedDrafts = {};
    this._editRenameDialogOpen = true;
  };

  private _openDeviceIpRenameDialog(deviceId: number) {
    const normalizedId = Number(deviceId);
    this._editRenameDialogTarget = { kind: "device_ip", deviceId: normalizedId };
    this._editRenameDialogDraft = deviceIpAddress(this._editBundle, normalizedId) || "";
    this._editRenameDialogError = "";
    // Device-IP dialog never carries the decoded-payload form — make
    // sure stale snapshot state from a prior command edit can't leak
    // in and accidentally widen the dialog.
    this._editRenameDialogDecodedSnapshot = null;
    this._editRenameDialogDecodedDrafts = {};
    this._editRenameDialogOpen = true;
  }

  private _openDeviceCommandRenameDialog(commandId: number) {
    if (this._editDetailId == null) return;
    const deviceId = Number(this._editDetailId);
    const normalizedCommandId = Number(commandId);
    this._editRenameDialogTarget = { kind: "command", deviceId, commandId: normalizedCommandId };
    const item = deviceCommandItems(this._editBundle, deviceId).find(
      (entry) => entry.commandId === normalizedCommandId,
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    // Hydrate per-field text drafts from the current decoded block.
    // For commands that are not in a decodable class, this snapshot
    // is null and the dialog renders the name-only form.
    const decoded = commandDecodedBlock(this._editBundle, deviceId, normalizedCommandId);
    this._editRenameDialogDecodedSnapshot = decoded;
    this._editRenameDialogDecodedDrafts = decoded
      ? this._initialDecodedDrafts(decoded)
      : {};
    // Advanced payload editing starts collapsed every time, so the
    // dialog reads as a simple "Change Command" form by default.
    this._decodedFormExpanded = false;
    this._editRenameDialogOpen = true;
  }

  private _initialDecodedDrafts(decoded: BackupCommandDecodedBlock): Record<string, string> {
    const spec = DECODED_CLASS_FORM_SPECS[decoded.className];
    if (!spec) return {};
    const drafts: Record<string, string> = {};
    for (const field of spec.fields) {
      drafts[field.key] = this._fieldValueToDraft(decoded.fields[field.key], field);
    }
    return drafts;
  }

  private _fieldValueToDraft(value: unknown, field: DecodedFieldSpec): string {
    if (value == null) return "";
    if (field.numeric) return String(Number(value) || 0);
    const stringValue = String(value);
    if (field.escapedDisplay) {
      // Surface the wire `\n` / `\r` characters as their two-char
      // escape sequences so the user can see and edit the literal
      // string. `_draftToFieldValue` performs the reverse on save.
      return stringValue.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    return stringValue;
  }

  private _openQuickAccessRenameDialog(kind: BackupQuickAccessKind, buttonId: number) {
    if (this._editDetailId == null) return;
    this._editRenameDialogTarget = kind === "macro"
      ? { kind: "macro", activityId: this._editDetailId, buttonId }
      : { kind: "favorite", activityId: this._editDetailId, buttonId };
    const item = activityQuickAccessItems(this._editBundle, this._editDetailId).find(
      (entry) => entry.kind === kind && entry.buttonId === Number(buttonId),
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }

  private _closeEditRenameDialog = () => {
    this._editRenameDialogOpen = false;
    this._editRenameDialogDraft = "";
    this._editRenameDialogError = "";
    this._editRenameDialogTarget = null;
    this._editRenameDialogDecodedDrafts = {};
    this._editRenameDialogDecodedSnapshot = null;
    this._decodedFormExpanded = false;
  };

  private _openEditFilePicker = () => {
    this.renderRoot.querySelector<HTMLInputElement>("#edit-file-input")?.click();
  };

  private _handleEditFilePicked = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._editError = null;
    try {
      const text = await file.text();
      const bundle = validateBackupBundle(JSON.parse(text));
      this._editBundle = bundle;
      this._editFilename = file.name;
      // Fresh load from disk — no user edits yet.
      this._editBundleDirty = false;
      this._closeEditDetail();
    } catch (error) {
      this._editBundle = null;
      this._editFilename = "";
      this._editBundleDirty = false;
      this._closeEditDetail();
      this._editError = formatError(error);
    } finally {
      if (input) input.value = "";
    }
  };

  /**
   * Commit a mutated bundle from any edit handler. Centralizes the
   * "this counts as a user edit" decision so loaders (file pick,
   * session restore, discard) can keep using the direct
   * `this._editBundle = ...` assignment to bypass the dirty flag.
   */
  private _commitEditBundleEdit(next: BackupBundlePayload) {
    this._editBundle = next;
    this._editBundleDirty = true;
  }

  private _applyActivityRename(activityId: number, name: string) {
    if (!this._editBundle) return;
    this._commitEditBundleEdit(renameBundleActivity(this._editBundle, activityId, name));
  }

  private _applyDeviceRename(deviceId: number, name: string) {
    if (!this._editBundle) return;
    this._commitEditBundleEdit(renameBundleDevice(this._editBundle, deviceId, name));
  }

  private _openEditDetail(kind: BackupEditTargetKind, id: number, name: string) {
    this._editDetailKind = kind;
    this._editDetailId = Number(id);
    this._editDetailNameDraft = this._sanitizeBundleName(name);
  }

  private _closeEditDetail = () => {
    this._editDetailKind = null;
    this._editDetailId = null;
    this._editDetailNameDraft = "";
    this._closeEditRenameDialog();
  };

  private _selectedEditTitle() {
    if (!this._editBundle || !this._editDetailKind || this._editDetailId == null) return "";
    const options = this._editDetailKind === "activity"
      ? bundleActivityOptions(this._editBundle)
      : bundleDeviceOptions(this._editBundle);
    return options.find((option) => option.id === this._editDetailId)?.label || "";
  }

  private _applyEditDetailRename() {
    const next = this._sanitizeBundleName(this._editDetailNameDraft);
    if (!next || !this._editDetailKind || this._editDetailId == null) return;
    if (this._editDetailKind === "activity") this._applyActivityRename(this._editDetailId, next);
    else this._applyDeviceRename(this._editDetailId, next);
    this._editDetailNameDraft = next;
  }

  private _applyEditRenameDialog = () => {
    const target = this._editRenameDialogTarget;
    if (!target || !this._editBundle) return;
    // The IP dialog runs through its own validation / save path; it
    // does not share the name-sanitizer's empty-string guard because
    // an empty IP is the legitimate "no IP set" shape for the wire.
    if (target.kind === "device_ip") {
      const draft = this._editRenameDialogDraft.trim();
      if (draft && !IPV4_PATTERN.test(draft)) {
        this._editRenameDialogError = "Enter a dotted-decimal IPv4 address (e.g. 192.168.1.42), or clear the field to remove the IP.";
        return;
      }
      this._commitEditBundleEdit(updateBundleDeviceIp(this._editBundle, target.deviceId, draft));
      this._closeEditRenameDialog();
      return;
    }
    const next = this._sanitizeBundleName(this._editRenameDialogDraft);
    if (!next) {
      this._editRenameDialogError = "Enter a name to continue.";
      return;
    }
    if (target.kind === "detail") {
      this._editDetailNameDraft = next;
      if (target.entityKind === "activity") this._applyActivityRename(target.entityId, next);
      else this._applyDeviceRename(target.entityId, next);
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "hub_name") {
      this._commitEditBundleEdit(renameBundleHub(this._editBundle, next));
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "macro") {
      this._commitEditBundleEdit(renameBundleActivityMacro(this._editBundle, target.activityId, target.buttonId, next));
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "command") {
      let nextBundle = renameBundleDeviceCommand(this._editBundle, target.deviceId, target.commandId, next);
      // If the dialog rendered the structured-payload form, diff each
      // field against the snapshot and only push the bundle update when
      // at least one value changed. This keeps `edited: true` off
      // pristine rows (which would otherwise force the restore path
      // through a re-encode + round-trip verify for no reason).
      const snapshot = this._editRenameDialogDecodedSnapshot;
      if (snapshot) {
        const changedFields = this._collectChangedDecodedFields(snapshot);
        if (changedFields) {
          nextBundle = updateCommandDecodedFields(
            nextBundle,
            target.deviceId,
            target.commandId,
            changedFields,
          );
        }
      }
      this._commitEditBundleEdit(nextBundle);
      this._closeEditRenameDialog();
      return;
    }
    this._commitEditBundleEdit(renameBundleActivityFavorite(this._editBundle, target.activityId, target.buttonId, next));
    this._closeEditRenameDialog();
  };

  private _moveActivityQuickAccessItem(index: number, delta: -1 | 1) {
    if (!this._editBundle || this._editDetailId == null) return;
    const items = activityQuickAccessItems(this._editBundle, this._editDetailId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
      this._editBundle,
      this._editDetailId,
      nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId })),
    ));
  }

  private _moveQuickAccessByIdentity(kind: BackupQuickAccessKind, buttonId: number, delta: -1 | 1) {
    if (!this._editBundle || this._editDetailId == null) return;
    const items = activityQuickAccessItems(this._editBundle, this._editDetailId);
    const index = items.findIndex((item) => item.kind === kind && item.buttonId === Number(buttonId));
    if (index === -1) return;
    this._moveActivityQuickAccessItem(index, delta);
  }

  private _handleEditActivityOrderSort = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    this._reorderEditTopLevel(event, "activity");
  };

  private _handleEditDeviceOrderSort = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    this._reorderEditTopLevel(event, "device");
  };

  private _reorderEditTopLevel(event: Event, kind: BackupEditTargetKind) {
    if (!this._editBundle) return;
    const sortableEvent = event as CustomEvent<{ oldIndex?: number; newIndex?: number }>;
    const oldIndex = Number(sortableEvent.detail?.oldIndex);
    const newIndex = Number(sortableEvent.detail?.newIndex);
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    const current = kind === "activity"
      ? bundleActivityOptions(this._editBundle)
      : bundleDeviceOptions(this._editBundle);
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= current.length || newIndex >= current.length) return;
    const nextOptions = [...current];
    const [moved] = nextOptions.splice(oldIndex, 1);
    if (!moved) return;
    nextOptions.splice(newIndex, 0, moved);
    const orderedIds = nextOptions.map((option) => option.id);
    this._commitEditBundleEdit(kind === "activity"
      ? reorderBundleActivities(this._editBundle, orderedIds)
      : reorderBundleDevices(this._editBundle, orderedIds));
  }

  private _handleActivityQuickAccessSort = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!this._editBundle || this._editDetailId == null) return;
    const sortableEvent = event as CustomEvent<{ oldIndex?: number; newIndex?: number }>;
    const oldIndex = Number(sortableEvent.detail?.oldIndex);
    const newIndex = Number(sortableEvent.detail?.newIndex);
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    const items = activityQuickAccessItems(this._editBundle, this._editDetailId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(oldIndex, 1);
    if (!moved) return;
    nextItems.splice(newIndex, 0, moved);
    this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
      this._editBundle,
      this._editDetailId,
      nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId })),
    ));
  };

  private _downloadEditedBundle = async () => {
    if (!this._editBundle || !this.hass || !this.hub) return;
    const base = this._editFilename.replace(/\.json$/i, "") || "sofabaton_backup";
    const filename = `${base}_edited.json`;
    // Stash the bundle server-side and download it via the same signed
    // /api/sofabaton_x1s/backup/download/{op_id} path the Make screen
    // uses. A blob URL would not be picked up by the HA mobile apps'
    // WebView download delegates, so mobile users would get nothing.
    let operationId = "";
    try {
      const result = await this.api().stashEditedBackup(this.hub.entry_id, this._editBundle, filename);
      operationId = String(result?.operation_id || "");
    } catch (error) {
      this._editError = formatError(error);
      return;
    }
    if (!operationId) {
      this._editError = "Failed to prepare edited backup for download.";
      return;
    }
    const path = `/api/sofabaton_x1s/backup/download/${encodeURIComponent(operationId)}`;
    let url = path;
    try {
      const signed = await this.hass.callWS<{ path: string }>({
        type: "auth/sign_path",
        path,
        expires: 600,
      });
      if (signed?.path) url = signed.path;
    } catch (error) {
      console.error("[sofabaton] auth/sign_path failed", error);
      this._editError = formatError(error);
      return;
    }
    const anchor = document.createElement("a");
    anchor.target = "_blank";
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent("click"));
    document.body.removeChild(anchor);
    // The download is the explicit "I'm done" signal — end the edit session
    // so a stale draft doesn't reappear next time the user opens the tab.
    this._clearEditSession();
    // Clearing the dirty flag here (not on session clear) keeps the
    // user's edits marked as in-progress even if they navigated away
    // and came back via session restore — the only thing that
    // "commits" their work is the download itself.
    this._editBundleDirty = false;
  };

  private _renderRestoreSectionContent() {
    const isRunning = this._isProgressRunning(this._restoreProgress);
    const isSuccess = String(this._restoreProgress?.status || "") === "success";
    const activityOptions = bundleActivityOptions(this._restoreBundle);
    const deviceOptions = bundleDeviceOptions(this._restoreBundle);
    const restoreSelection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds,
    });
    const totalRestoreOptions = activityOptions.length + deviceOptions.length;
    const totalRestoreSelected = this._restoreActivityIds.length + restoreSelection.selectedDeviceIds.length;
    const allRestoreSelected = totalRestoreOptions > 0 && totalRestoreSelected === totalRestoreOptions;

    return html`
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "restore-body",
        content: html`
            <div class="backup-drawer-sub">
              ${isRunning
                ? "The hub is restoring your backup."
                : isSuccess
                  ? "Your restore has completed."
                  : "Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on."}
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : nothing}
            ${isRunning && this._restoreProgress
              ? this._renderProgressCard(this._restoreProgress, "restore")
              : isSuccess
                ? html`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Restore completed</div>
                    <div class="backup-complete-sub">The selected Activities and Devices were restored to the hub.</div>
                    <div class="action-row">
                      <button class="primary-btn" @click=${() => void this._completeRestoreResult()}>Complete</button>
                    </div>
                  </div>
                `
                : nothing}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            ${!isRunning && !isSuccess && this._restoreBundle ? html`
              <div class="restore-config-view">
                <div class="backup-devices-head">
                  <div class="backup-devices-head-main">
                    <div class="backup-section-title">Items to restore</div>
                    <div class="backup-selected-count">${totalRestoreSelected} selected</div>
                  </div>
                  <button class="backup-link-btn" ?disabled=${this._restoreLocked()} @click=${allRestoreSelected ? this._clearRestoreSelection : this._selectAllRestoreItems}>
                    ${allRestoreSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div class="selection-card">
                  <div class="selection-list">
                    ${activityOptions.length
                      ? html`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => html`
                          <div
                            class="selection-row"
                            @click=${() => {
                              if (this._restoreLocked()) return;
                              this._setRestoreActivity(activity.id, !this._restoreActivityIds.includes(activity.id));
                            }}
                          >
                            ${this._renderCheckboxControl({
                              checked: this._restoreActivityIds.includes(activity.id),
                              disabled: this._restoreLocked(),
                              onChange: (checked) => this._setRestoreActivity(activity.id, checked),
                            })}
                            <span class="selection-main">
                              <span class="selection-label">${activity.label}</span>
                            </span>
                            ${activity.meta ? html`<span class="selection-meta">${activity.meta}</span>` : nothing}
                          </div>
                        `)}
                      `
                      : html`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length
                      ? html`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => {
                          const forced = restoreSelection.forcedDeviceIds.includes(device.id);
                          return html`
                            <div
                              class="selection-row ${forced ? "locked" : ""}"
                              @click=${() => {
                                if (forced || this._restoreLocked()) return;
                                this._setRestoreDevice(device.id, !restoreSelection.selectedDeviceIds.includes(device.id));
                              }}
                            >
                              ${this._renderCheckboxControl({
                                checked: restoreSelection.selectedDeviceIds.includes(device.id),
                                disabled: forced || this._restoreLocked(),
                                onChange: (checked) => this._setRestoreDevice(device.id, checked),
                              })}
                              <span class="selection-main">
                                <span class="selection-label">${device.label}</span>
                              </span>
                              ${device.meta ? html`<span class="selection-meta">${forced ? `${device.meta} · linked` : device.meta}</span>` : nothing}
                            </div>
                          `;
                        })}
                      `
                      : html`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
                <div class="backup-scope-group">
                  <div
                    class="selection-row"
                    @click=${() => {
                      if (this._restoreLocked()) return;
                      this._restoreMode = this._restoreMode === "replace" ? "merge" : "replace";
                    }}
                  >
                    ${this._renderCheckboxControl({
                      checked: this._restoreMode === "replace",
                      disabled: this._restoreLocked(),
                      onChange: (checked) => {
                        this._restoreMode = checked ? "replace" : "merge";
                      },
                    })}
                    <span class="selection-main">
                      <span class="selection-label">Erase existing Devices and Activities</span>
                    </span>
                  </div>
                </div>
                <div class="restore-action-row">
                  <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
                  <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : !isRunning && !isSuccess ? html`
              <div class="restore-action-row">
                <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : nothing}
        `,
      })}
    `;
  }

  private _renderStatus(tone: "warning" | "error" | "success", icon: string, message: string) {
    return html`
      <div class="status-box ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
  }

  private _renderScopeGroup<T extends string>(params: {
    value: T;
    disabled: boolean;
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    onChange: (value: T) => void;
  }) {
    const isOption = (raw: unknown): raw is T =>
      typeof raw === "string" && params.options.some((option) => option.value === raw);
    return html`
      <div class="compat-radio-group" role="radiogroup" aria-disabled=${params.disabled ? "true" : "false"}>
        ${params.options.map((option) => html`
          <label
            class="compat-radio-option ${option.value === params.value ? "selected" : ""} ${params.disabled || !!option.disabled ? "disabled" : ""}"
          >
            <input
              class="compat-choice compat-choice--radio"
              type="radio"
              name=${this._backupScopeRadioName}
              .value=${option.value}
              .checked=${option.value === params.value}
              ?disabled=${params.disabled || !!option.disabled}
              @change=${(event: Event) => {
                const target = event.currentTarget as HTMLInputElement;
                if (target.checked && isOption(target.value) && target.value !== params.value) {
                  params.onChange(target.value);
                }
              }}
            />
            <span class="compat-radio-option-label">${option.label}</span>
          </label>
        `)}
      </div>
    `;
  }

  private _renderCheckboxControl(params: {
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
    stopClick?: boolean;
  }) {
    const stopClick = params.stopClick !== false;
    if (customElements.get("ha-checkbox")) {
      return html`
        <ha-checkbox
          .checked=${params.checked}
          ?disabled=${params.disabled}
          @click=${stopClick ? ((event: Event) => event.stopPropagation()) : (() => {})}
          @change=${(event: Event) => {
            const target = event.currentTarget as { checked?: boolean };
            params.onChange(!!target.checked);
          }}
        ></ha-checkbox>
      `;
    }
    return html`
      <input
        class="compat-choice compat-choice--checkbox"
        type="checkbox"
        .checked=${params.checked}
        ?disabled=${params.disabled}
        @click=${stopClick ? ((event: Event) => event.stopPropagation()) : (() => {})}
        @change=${(event: Event) => {
          const target = event.currentTarget as HTMLInputElement;
          params.onChange(!!target.checked);
        }}
      />
    `;
  }

  private _renderProgressCard(progress: BackupProgressEvent, mode: "backup" | "restore") {
    return renderOperationProgress({
      mode,
      title: mode === "backup" ? TOOLS_CARD_STRINGS.progress.backupTitle : TOOLS_CARD_STRINGS.progress.restoreTitle,
      message: String(progress.message || "Working…"),
    });
  }

  private _backupLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
  }

  private _restoreLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._restoreProgress) || this._isProgressRunning(this._backupProgress);
  }

  private _isProgressRunning(progress: BackupProgressEvent | null) {
    return !!progress && ["pending", "running"].includes(String(progress.status || ""));
  }

  private _setBackupScope(scope: BackupScope) {
    this._backupScope = scope;
    if (!this._backupDeviceIds.length && this.cacheHub) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
  }

  private _setBackupDevice(deviceId: number, checked: boolean) {
    const next = new Set(this._backupDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._backupDeviceIds = [...next].sort((left, right) => left - right);
  }

  private _toggleAllBackupDevices = () => {
    const devices = backupDeviceOptions(this.cacheHub);
    const allIds = devices.map((device) => device.id);
    this._backupDeviceIds = this._backupDeviceIds.length === allIds.length ? [] : allIds;
  };

  private _setRestoreActivity(activityId: number, checked: boolean) {
    const next = new Set(this._restoreActivityIds);
    if (checked) next.add(activityId);
    else next.delete(activityId);
    this._restoreActivityIds = [...next].sort((left, right) => left - right);
  }

  private _setRestoreDevice(deviceId: number, checked: boolean) {
    const next = new Set(this._restoreManualDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._restoreManualDeviceIds = [...next].sort((left, right) => left - right);
  }

  private _selectAllRestoreItems = () => {
    const activities = bundleActivityOptions(this._restoreBundle).map((activity) => activity.id);
    const devices = bundleDeviceOptions(this._restoreBundle).map((device) => device.id);
    this._restoreActivityIds = activities;
    this._restoreManualDeviceIds = devices;
  };

  private _clearRestoreSelection = () => {
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
  };

  private _backupActionDisabled() {
    if (this._backupLocked()) return true;
    if (!this.hub || !this.hass || !this.cacheHub || !this.persistentCacheEnabled) return true;
    if (String(this._backupProgress?.status || "") === "success") return true;
    if (this._backupScope === "whole_hub") return false;
    return this._backupDeviceIds.length === 0;
  }

  private _restoreActionDisabled(selectedDeviceIds: number[]) {
    if (this._restoreLocked()) return true;
    if (!this.hub || !this.hass || !this._restoreBundle) return true;
    return selectedDeviceIds.length === 0 && this._restoreActivityIds.length === 0;
  }

  private api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }

  private async _runBackup() {
    if (!this.hub) return;
    this._backupError = null;
    this._backupProgress = null;
    this._discardEditSession();
    const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
    this.setHubCommandBusy?.(true, "Starting backup…");
    try {
      const start = await this.api().startBackupExport(this.hub.entry_id, deviceIds);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "backup");
    } catch (error) {
      this._backupError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }

  private async _runRestore() {
    if (!this.hub || !this._restoreBundle) return;
    const selection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds,
    });
    const filtered = pruneBackupBundle({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      selectedDeviceIds: selection.selectedDeviceIds,
    });
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._discardEditSession();
    this.setHubCommandBusy?.(true, "Starting restore…");
    try {
      const start = await this.api().startBackupRestore(this.hub.entry_id, filtered, this._restoreMode);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "restore");
    } catch (error) {
      this._restoreError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }

  private async _subscribeToOperation(operationId: string, kind: "backup" | "restore") {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      // ``transient: true`` is the orchestrator's signal that this is a
      // pre-flight failure — no wire writes happened and the op is
      // about to be dismissed server-side. Surface the message as an
      // ephemeral error chip but do NOT update _backupProgress /
      // _restoreProgress; those drive the "failed view" render and
      // would otherwise leave a stale failed card stuck on screen.
      const transient = Boolean((payload as { transient?: boolean })?.transient);
      if (transient && payload.status === "failed") {
        const opId = String(payload.operation_id || operationId || "").trim();
        if (opId) this._acknowledgedOpIds.add(opId);
        if (kind === "backup") {
          this._backupError = String(payload.error || payload.message || "Backup failed.");
        } else {
          this._restoreError = String(payload.error || payload.message || "Restore failed.");
        }
        this.setHubCommandBusy?.(false, null);
        this._teardownProgressSubscription();
        return;
      }
      if (kind === "backup") {
        this._backupProgress = payload;
        if (payload.status === "success") {
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the operation state is already known.
          }
        }
      } else {
        this._restoreProgress = payload;
        if (payload.status === "success") {
          this._restoreSuccess = "Restore completed.";
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          this._restoreError = String(payload.error || payload.message || "Restore failed.");
          this.setHubCommandBusy?.(false, null);
        }
      }
      if (!this._isProgressRunning(payload)) {
        this._teardownProgressSubscription();
      }
    });
    this._progressUnsub = unsubscribe;
  }

  private _teardownProgressSubscription() {
    const unsub = this._progressUnsub;
    this._progressUnsub = null;
    if (unsub) {
      try { unsub(); } catch { /* ignore */ }
    }
  }

  private _openFilePicker() {
    this.renderRoot.querySelector<HTMLInputElement>("#restore-file-input")?.click();
  }

  private async _handleFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._restoreError = null;
    this._restoreSuccess = null;
    try {
      const text = await file.text();
      const bundle = validateBackupBundle(JSON.parse(text));
      assertBackupBundleRestoreCompatible(bundle, this.hub?.version);
      this._restoreBundle = bundle;
      this._restoreFilename = file.name;
      this._restoreMode = "merge";
      this._restoreActivityIds = bundleActivityOptions(bundle).map((activity) => activity.id);
      this._restoreManualDeviceIds = bundleDeviceOptions(bundle).map((device) => device.id);
    } catch (error) {
      this._restoreBundle = null;
      this._restoreFilename = "";
      this._restoreActivityIds = [];
      this._restoreManualDeviceIds = [];
      this._restoreError = formatError(error);
    } finally {
      if (input) input.value = "";
    }
  }

  private async _downloadLatestBackup() {
    const operationId = this._backupProgress?.operation_id;
    if (!operationId || !this.hass) return;
    const filename = String(this._backupProgress?.filename || "sofabaton_backup.json");
    const path = `/api/sofabaton_x1s/backup/download/${encodeURIComponent(operationId)}`;
    let url = path;
    try {
      const signed = await this.hass.callWS<{ path: string }>({
        type: "auth/sign_path",
        path,
        // Generous expiry. The 60s default created a flaky window where
        // slow user interactions or share-sheet handoffs could let the
        // signature expire before the WebView delegate fetched it.
        expires: 600,
      });
      if (signed?.path) url = signed.path;
    } catch (error) {
      console.error("[sofabaton] auth/sign_path failed", error);
      return;
    }
    // Replicates HA's own fileDownload helper (used by HA core for
    // backup / diagnostics / camera snapshot downloads). Attached anchor,
    // target=_blank, default bubbling click. The HA mobile apps'
    // WebView delegates intercept the response via Content-Disposition.
    const anchor = document.createElement("a");
    anchor.target = "_blank";
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent("click"));
    document.body.removeChild(anchor);
    // No clearBackupResult call here: the browser's download fetch is
    // async on the network thread, and racing the registry cleanup
    // against it would (and did) cause the view to 410 the request
    // before the bytes were read. The server marks the bundle as
    // downloaded and schedules its own short TTL after successfully
    // serving the response. The push subscription will update
    // _backupProgress.backup_downloaded for us when that happens.
  }

  private _backupResultSummary(bundle: BackupBundlePayload | null | undefined) {
    const activityCount = Array.isArray(bundle?.activities) ? bundle.activities.length : 0;
    const deviceCount = Array.isArray(bundle?.devices) ? bundle.devices.length : 0;
    return `${activityCount} Activities and ${deviceCount} Devices backed up`;
  }

  private _resetBackupComposer = () => {
    this._backupError = null;
    this._backupProgress = null;
    this._backupScope = "whole_hub";
    this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
  };

  private async _completeBackupResult() {
    const operationId = String(this._backupProgress?.operation_id || "").trim();
    this._backupError = null;
    if (operationId) {
      this._acknowledgedOpIds.add(operationId);
      try {
        await this.api().clearBackupResult(operationId);
      } catch (error) {
        this._backupError = formatError(error);
      }
    }
    try {
      await this.refreshControlPanelState?.();
    } catch {
      // Ignore refresh failures here; local state still resets and the next
      // normal poll will reconcile the view.
    }
    this._resetBackupComposer();
  }

  private _resetRestoreComposer = () => {
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._restoreMode = "merge";
  };

  // Drop the picked-but-not-yet-started restore bundle and its UI-side
  // selection. Server-side state (an in-progress restore, success/failure
  // results) is not touched — that's reconciled by _syncBackupOperationState
  // against the new hub.
  private _resetRestoreBundleForHubSwitch() {
    this._restoreBundle = null;
    this._restoreFilename = "";
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
    this._restoreMode = "merge";
    this._restoreError = null;
    this._restoreSuccess = null;
  }

  private async _completeRestoreResult() {
    // Mirror of _completeBackupResult: drop the server-side op record
    // before clearing local state so the next sync cannot snap the
    // success view back. Records the op_id in the acknowledged set as
    // a belt-and-braces measure against any in-flight subscription
    // event that lands between the dismiss call and the local reset.
    const operationId = String(this._restoreProgress?.operation_id || "").trim();
    if (operationId) {
      this._acknowledgedOpIds.add(operationId);
      try {
        await this.api().clearRestoreResult(operationId);
      } catch (error) {
        this._restoreError = formatError(error);
      }
    }
    try {
      await this.refreshControlPanelState?.();
    } catch {
      // Local reset still happens; next poll reconciles.
    }
    this._resetRestoreComposer();
  }

  private async _syncBackupOperationState() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || !this.hass) return;
    if (this._loadedBackupEntryId === entryId && this._backupHydrating) return;
    const activeOperation = this.hub?.active_backup_operation || null;
    const activeOperationId = this._isProgressRunning(activeOperation)
      ? String(activeOperation?.operation_id || "").trim()
      : "";
    const localOperationId = String(
      this._backupProgress?.operation_id || this._restoreProgress?.operation_id || "",
    ).trim();
    const localProgressRunning =
      this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
    if (
      this._loadedBackupEntryId === entryId &&
      this._progressUnsub &&
      !!activeOperationId &&
      localProgressRunning &&
      localOperationId === activeOperationId
    ) {
      return;
    }
    this._loadedBackupEntryId = entryId;
    this._backupHydrating = true;
    this._teardownProgressSubscription();
    try {
      const state = await this.api().getBackupState(entryId);
      const rawBackup = state?.backup_export || null;
      const rawRestore = state?.backup_restore || null;
      // Drop ops the user has already acknowledged. The id sticks in
      // the ack set just long enough for the cleared server state to
      // propagate; we evict it here once the server no longer reports
      // the op so the set cannot grow unbounded over a long session.
      const backupId = String(rawBackup?.operation_id || "").trim();
      const restoreId = String(rawRestore?.operation_id || "").trim();
      const liveIds = new Set<string>();
      if (backupId) liveIds.add(backupId);
      if (restoreId) liveIds.add(restoreId);
      for (const ackId of [...this._acknowledgedOpIds]) {
        if (!liveIds.has(ackId)) this._acknowledgedOpIds.delete(ackId);
      }
      const backupSnapshot =
        backupId && this._acknowledgedOpIds.has(backupId) ? null : rawBackup;
      const restoreSnapshot =
        restoreId && this._acknowledgedOpIds.has(restoreId) ? null : rawRestore;
      this._backupProgress = backupSnapshot;
      this._restoreProgress = restoreSnapshot;
      this._backupError =
        String(this._backupProgress?.status || "") === "failed"
          ? String(this._backupProgress?.error || this._backupProgress?.message || "Backup failed.")
          : null;
      this._restoreError =
        String(this._restoreProgress?.status || "") === "failed"
          ? String(this._restoreProgress?.error || this._restoreProgress?.message || "Restore failed.")
          : null;
      this._restoreSuccess =
        String(this._restoreProgress?.status || "") === "success" ? "Restore completed." : null;
      const active = state?.active_operation || null;
      if (active && String(active.kind || "") === "backup_export" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Backup in progress…"));
        await this._subscribeToOperation(active.operation_id, "backup");
      } else if (active && String(active.kind || "") === "backup_restore" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Restore in progress…"));
        await this._subscribeToOperation(active.operation_id, "restore");
      } else {
        this.setHubCommandBusy?.(false, null);
      }
    } catch {
      // Ignore hydration failures; the tab can still start a fresh operation.
    } finally {
      this._backupHydrating = false;
    }
  }

}

if (!customElements.get("sofabaton-backup-tab")) {
  customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
}


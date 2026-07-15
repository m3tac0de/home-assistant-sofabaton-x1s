import { LitElement, html, nothing } from "lit";
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
import { backupTabStyles } from "./backup-tab-styles";
import {
  type BackupEditTargetKind,
  sanitizeBundleName,
  useLegacyTextField,
} from "./edit-detail-view";
import {
  assertBackupBundleRestoreCompatible,
  type BackupSelectionOption,
  backupDeviceOptions,
  bundleActivityOptions,
  bundleDeviceOptions,
  bundleEditableDeviceOptions,
  pruneBackupBundle,
  reconcileRestoreSelection,
  renameBundleHub,
  reorderBundleActivities,
  reorderBundleDevices,
  validateBackupBundle,
} from "./backup-state";

type BackupScope = "whole_hub" | "individual_devices";

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
    _editBundleDirty: { state: true },
    _haSortableReady: { state: true },
    _hubRenameOpen: { state: true },
    _hubRenameDraft: { state: true },
    _hubRenameError: { state: true },
  };

  static styles = [secondaryTabStyles, operationProgressStyles, backupTabStyles];

  hass: HassLike | null = null;
  hub: ControlPanelHubState | null = null;
  cacheHub: CacheHubState | null = null;
  // entryId scopes the shared busy state to the hub the operation was started
  // on, so a completion arriving after a hub-picker switch cannot set or clear
  // another hub's busy notice.
  setHubCommandBusy?: (busy: boolean, label?: string | null, entryId?: string) => void;
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
  // Which entity's detail view is open. Everything below the entity
  // list — sections, sub-views, dialogs — lives in the extracted
  // <sofabaton-edit-detail-view> element; this host only tracks the
  // selection (persisted with the edit session).
  private _editDetailKind: BackupEditTargetKind | null = null;
  private _editDetailId: number | null = null;
  // True when `_editBundle` has user-made changes that have not yet
  // been downloaded. Flipped on by every edit handler (rename, reorder,
  // decoded payload, IP, etc.) and on session restore (those ARE
  // unsaved edits). Flipped off by `_downloadEditedBundle` and by
  // any path that loads a fresh bundle from file. Drives the
  // "Unsaved" indicators in the Edit overview and detail header.
  private _editBundleDirty = false;
  // Hub rename dialog (edit overview) — the entity-level rename
  // machinery moved into the detail element with everything else.
  private _hubRenameOpen = false;
  private _hubRenameDraft = "";
  private _hubRenameError = "";
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
      || changed.has("_editBundleDirty")
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
        dirty: this._editBundleDirty,
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
        dirty?: boolean;
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
      // Restore the dirty flag as it was persisted: a file opened but not
      // yet edited stays clean, while a session with pending edits comes
      // back marked unsaved. (Older sessions saved before `dirty` existed
      // are treated as clean — they predate any edit anyway.)
      this._editBundleDirty = Boolean(parsed.dirty);
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

    // The whole detail environment (device + activity sections, the
    // bindings/macro sub-views, and every dialog they open) lives in the
    // extracted edit-detail element. This host only decides WHICH entity
    // is open and owns the bundle + persistence; the element renders the
    // rest and reports edits back through bundle-change.
    if (this.selectedSection === "edit" && this._editDetailKind && this._editDetailId != null) {
      const detailTitle = this._selectedEditTitle();
      if (detailTitle) {
        return html`
          <sofabaton-edit-detail-view
            .bundle=${this._editBundle}
            .kind=${this._editDetailKind}
            .entityId=${this._editDetailId}
            .dirty=${this._editBundleDirty}
            mode="backup"
            @bundle-change=${this._handleDetailBundleChange}
            @close=${this._closeEditDetail}
          ></sofabaton-edit-detail-view>
        `;
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
    const deviceOptions = bundleEditableDeviceOptions(bundle);
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
            ${this._renderHubRenameDialog()}
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


  // Detail-view transient state (open menus/dialogs, sub-views) lives in
  // the edit-detail element and resets itself when kind/entityId change,
  // so opening and closing here is just entity selection.
  private _openEditDetail(kind: BackupEditTargetKind, id: number, _name: string) {
    this._editDetailKind = kind;
    this._editDetailId = Number(id);
  }

  private _closeEditDetail = () => {
    this._editDetailKind = null;
    this._editDetailId = null;
  };

  private _handleDetailBundleChange = (event: CustomEvent<{ bundle: BackupBundlePayload }>) => {
    // The element already ran the HA-action prune sweep; this host owns
    // the "counts as a user edit" semantics (dirty flag + persistence
    // via updated()).
    this._editBundle = event.detail.bundle;
    this._editBundleDirty = true;
  };

  // ── Hub rename (edit overview) ──────────────────────────────────────
  // The entity/command rename machinery moved into the detail element;
  // the hub name is the one rename that opens from the overview, so it
  // keeps a minimal dialog here with the same look and name rules.
  private _openHubNameRenameDialog = () => {
    if (!this._editBundle) return;
    this._hubRenameDraft = sanitizeBundleName(this._editBundle, String(this._editBundle.hub?.name ?? ""));
    this._hubRenameError = "";
    this._hubRenameOpen = true;
  };

  private _closeHubRenameDialog = () => {
    this._hubRenameOpen = false;
    this._hubRenameDraft = "";
    this._hubRenameError = "";
  };

  private _handleHubRenameInput = (event: Event) => {
    const input = event.currentTarget as HTMLElement & { value: string };
    const value = sanitizeBundleName(this._editBundle, input.value);
    input.value = value;
    this._hubRenameDraft = value;
    this._hubRenameError = "";
  };

  private _applyHubRename = () => {
    if (!this._editBundle) return;
    const next = sanitizeBundleName(this._editBundle, this._hubRenameDraft);
    if (!next) {
      this._hubRenameError = "Enter a name to continue.";
      return;
    }
    this._commitEditBundleEdit(renameBundleHub(this._editBundle, next));
    this._closeHubRenameDialog();
  };

  private _renderHubRenameDialog() {
    if (!this._hubRenameOpen) return nothing;
    return html`
      <div class="modal-backdrop" @click=${this._closeHubRenameDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Rename Hub</div>
            <button class="dialog-close" @click=${this._closeHubRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${useLegacyTextField()
              ? html`
                  <ha-textfield
                    id="sb-backup-hub-name"
                    .label=${"Name"}
                    .maxLength=${20}
                    .value=${this._hubRenameDraft}
                    @input=${this._handleHubRenameInput}
                    @change=${this._handleHubRenameInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyHubRename(); } }}
                  ></ha-textfield>
                `
              : html`
                  <ha-input
                    id="sb-backup-hub-name"
                    type="text"
                    .label=${"Name"}
                    .maxlength=${20}
                    .value=${this._hubRenameDraft}
                    @input=${this._handleHubRenameInput}
                    @change=${this._handleHubRenameInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyHubRename(); } }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._hubRenameError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeHubRenameDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyHubRename}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _selectedEditTitle() {
    if (!this._editBundle || !this._editDetailKind || this._editDetailId == null) return "";
    const options = this._editDetailKind === "activity"
      ? bundleActivityOptions(this._editBundle)
      : bundleDeviceOptions(this._editBundle);
    return options.find((option) => option.id === this._editDetailId)?.label || "";
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
    const totalRestoreSelected = restoreSelection.selectedActivityIds.length + restoreSelection.selectedDeviceIds.length;
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
                        ${activityOptions.map((activity) => {
                          // Forced in by another activity's chain reference
                          // (e.g. its power-off starts this one) — locked,
                          // mirroring linked devices below.
                          const forcedActivity = restoreSelection.forcedActivityIds.includes(activity.id);
                          return html`
                          <div
                            class="selection-row ${forcedActivity ? "locked" : ""}"
                            @click=${() => {
                              if (forcedActivity || this._restoreLocked()) return;
                              this._setRestoreActivity(activity.id, !this._restoreActivityIds.includes(activity.id));
                            }}
                          >
                            ${this._renderCheckboxControl({
                              checked: restoreSelection.selectedActivityIds.includes(activity.id),
                              disabled: forcedActivity || this._restoreLocked(),
                              onChange: (checked) => this._setRestoreActivity(activity.id, checked),
                            })}
                            <span class="selection-main">
                              <span class="selection-label">${activity.label}</span>
                            </span>
                            ${activity.meta
                              ? html`<span class="selection-meta">${forcedActivity ? `${activity.meta} · linked` : activity.meta}</span>`
                              : forcedActivity
                                ? html`<span class="selection-meta">linked</span>`
                                : nothing}
                          </div>
                        `;
                        })}
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
    const entryId = this.hub.entry_id;
    this.setHubCommandBusy?.(true, "Starting backup…", entryId);
    try {
      const start = await this.api().startBackupExport(entryId, deviceIds);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "backup", entryId);
    } catch (error) {
      this._backupError = formatError(error);
      this.setHubCommandBusy?.(false, null, entryId);
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
      // Expanded set: includes activities forced in by chain references.
      selectedActivityIds: selection.selectedActivityIds,
      selectedDeviceIds: selection.selectedDeviceIds,
    });
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._discardEditSession();
    const entryId = this.hub.entry_id;
    this.setHubCommandBusy?.(true, "Starting restore…", entryId);
    try {
      const start = await this.api().startBackupRestore(entryId, filtered, this._restoreMode);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "restore", entryId);
    } catch (error) {
      this._restoreError = formatError(error);
      this.setHubCommandBusy?.(false, null, entryId);
    }
  }

  private async _subscribeToOperation(operationId: string, kind: "backup" | "restore", entryId: string) {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      // The subscription is keyed by operation id only, so events keep
      // arriving after a hub-picker switch. Shared busy updates stay safe
      // (scoped by entryId); instance display state must not be touched
      // while another hub is selected — it re-hydrates on switch-back.
      const staleHub = String(this.hub?.entry_id || "").trim() !== entryId;
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
        if (!staleHub) {
          if (kind === "backup") {
            this._backupError = String(payload.error || payload.message || "Backup failed.");
          } else {
            this._restoreError = String(payload.error || payload.message || "Restore failed.");
          }
        }
        this.setHubCommandBusy?.(false, null, entryId);
        this._teardownProgressSubscription();
        return;
      }
      if (kind === "backup") {
        if (!staleHub) this._backupProgress = payload;
        if (payload.status === "success") {
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          if (!staleHub) this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the operation state is already known.
          }
        }
      } else {
        if (!staleHub) this._restoreProgress = payload;
        if (payload.status === "success") {
          if (!staleHub) this._restoreSuccess = "Restore completed.";
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          if (!staleHub) this._restoreError = String(payload.error || payload.message || "Restore failed.");
          this.setHubCommandBusy?.(false, null, entryId);
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
      // Rapid hub-picker switches can interleave two hydrations; a late
      // response for a hub that is no longer selected must not overwrite
      // the current hub's view (the switch already queued its own sync).
      if (String(this.hub?.entry_id || "").trim() !== entryId) return;
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
        this.setHubCommandBusy?.(true, String(active.message || "Backup in progress…"), entryId);
        await this._subscribeToOperation(active.operation_id, "backup", entryId);
      } else if (active && String(active.kind || "") === "backup_restore" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Restore in progress…"), entryId);
        await this._subscribeToOperation(active.operation_id, "restore", entryId);
      } else {
        this.setHubCommandBusy?.(false, null, entryId);
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


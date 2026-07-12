// tests/frontend/activity-diff.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// custom_components/sofabaton_x1s/www/src/strings.ts
var TOOLS_CARD_STRINGS = {
  docs: {
    wifiCommandsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    backupUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/backup.md",
    blobsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/blobs.md"
  },
  tabs: {
    cache: "Hub",
    wifiCommands: "Wifi Commands",
    wifiShort: "Wifi",
    backup: "Backup",
    blobs: "Blobs",
    settings: "Settings",
    logs: "Logs"
  },
  tabDocs: {
    wifi_commands: "Wifi Commands documentation",
    backup: "Backup documentation",
    blobs: "Blobs documentation"
  },
  backend: {
    unavailableTitle: "Backend not available",
    unavailableCopy: "Waiting for the Sofabaton X integration to finish starting...",
    versionMismatchTitle: "Refresh required to update the Sofabaton Control Panel card",
    versionMismatchCopy: "This dashboard is still using an older cached version of the Sofabaton Control Panel card than the one now running in Home Assistant. Refresh or reopen the dashboard/browser before using the control panel again so the updated card can load.",
    backendExpects: "Backend expects",
    cardLoaded: "Card loaded",
    unknownVersion: "unknown",
    refreshingCache: "Refreshing cache...",
    hubCommandInProgress: "Hub command in progress..."
  },
  hubUnavailable: {
    title: "Hub unavailable",
    copy: "This hub is not connected, so the control panel is unavailable until the hub reconnects."
  },
  settings: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    unknownHubName: "Unknown",
    activities: "Activities",
    devices: "Devices",
    persistentCacheTitle: "Persistent Cache",
    persistentCacheDescription: "Store activity and device data locally for faster access.",
    persistentCacheFooter: "GLOBAL",
    hexLoggingTitle: "Hex Logging",
    hexLoggingDescription: "Log raw hex traffic between hub, integration, and app.",
    proxyTitle: "Proxy",
    proxyDescription: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
    wifiDeviceTitle: "WiFi Device",
    wifiDeviceDescription: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
    findRemoteTitle: "Find Remote",
    findRemoteDescription: "Make the remote beep so you can locate it.",
    syncRemoteTitle: "Sync Remote",
    syncRemoteDescription: "Push the latest configuration to the physical remote."
  },
  cache: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    persistentCacheOffTitle: "Persistent cache is off",
    persistentCacheOffCopy: "Turn it on to browse cached activities and devices, and to unlock Backup and Blobs workflows that depend on it.",
    enablingPersistentCache: "Enabling...",
    enablePersistentCache: "Enable persistent cache",
    devIdBadge: "DevID",
    favIdBadge: "FavID",
    comIdBadge: "ComID",
    activityFallback: (id) => `Activity ${id}`,
    deviceFallback: (id) => `Device ${id}`,
    favoriteFallback: (commandId) => `Favorite ${commandId}`,
    macroFallback: (commandId) => `Macro ${commandId}`,
    activityCounts: (favorites, macros, buttons) => `${favorites} favs / ${macros} macros / ${buttons} btns`,
    deviceCommandCount: (count) => `${count} cmds`,
    favorites: "Favorites",
    macros: "Macros",
    buttons: "Buttons",
    noCachedData: "No cached data yet.",
    noCachedCommands: "No cached commands.",
    staleBanner: "Cache was updated externally. Refresh to see latest data.",
    refresh: "Refresh",
    activities: "Activities",
    devices: "Devices",
    refreshList: "Refresh list",
    refreshAll: "Refresh all",
    editActivity: "Edit activity",
    editDevice: "Edit device"
  },
  logs: {
    loading: "Loading log stream...",
    empty: "No log lines captured for this hub yet.",
    liveConsole: "Live Console"
  },
  cacheRefresh: {
    label: "Refresh all",
    running: "Refreshing\u2026",
    starting: "Starting hub cache refresh\u2026",
    working: "Reading your hub's configuration\u2026",
    done: "Hub cache refreshed."
  },
  progress: {
    homeAssistant: "Home Assistant",
    sofabatonHub: "Sofabaton Hub",
    working: "Working...",
    backupTitle: "Creating backup",
    restoreTitle: "Restoring backup"
  },
  blobs: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    sections: {
      fetch: "Fetch",
      test: "Test",
      save: "Save"
    },
    fetchCacheDisabled: "Enable persistent cache in the Hub tab before using Fetch.",
    selectOne: "Select one",
    device: "Device",
    command: "Command",
    fetchNoCommands: "This device has no cached commands yet. Refresh that device from the Hub tab first.",
    fetchNoRecords: "The hub returned no blob records for this request.",
    commandFallback: (commandId) => `Command ${commandId}`,
    unknown: "unknown",
    cmdBadge: (commandId) => `Cmd ${commandId}`,
    blobViewMode: "Blob view mode",
    descriptor: "Descriptor",
    hex: "Hex",
    rawBlob: "Raw Blob",
    copied: "Copied",
    copy: "Copy",
    test: "Test",
    testing: "Testing...",
    noIrDevices: "No IR devices found in the cache. Refresh devices from the Hub tab first.",
    irDevice: "IR device",
    save: "Save",
    saving: "Saving...",
    commandName: "Command name"
  },
  activities: {
    loading: "Loading activities...",
    selectHub: "Select a hub to edit its activities.",
    activityFallback: (id) => `Activity ${id}`,
    // Guard panels (§4.1), rendered inside the editor view.
    appConnectedTitle: "The Sofabaton app is connected",
    appConnectedBody: "Close the Sofabaton app to edit the hub configuration.",
    operationRunningTitle: "Another operation is running",
    operationRunningBody: "Wait for the current backup, restore, or sync to finish, then try again.",
    // Capture flow (§4.2).
    captureTitle: "Reading your hub",
    captureMessage: "Reading your hub's configuration\u2026",
    captureMessageWithStep: (current, total) => `Reading your hub's configuration\u2026 (device ${current} of ${total})`,
    captureFailedTitle: "Couldn't read the hub",
    captureFailedBody: "The hub stopped responding before we finished reading it.",
    retry: "Retry",
    back: "Back",
    // Cache-sourced capture (blob-free structural bundle).
    capturingFromCache: (kind) => `Loading ${kind} from the hub cache\u2026`,
    needsRefreshTitle: "Refresh the hub cache to edit",
    needsRefreshBody: (kind) => `This ${kind} isn't in the local hub cache yet. Refresh the hub cache (a few seconds) to load it into the editor.`,
    // Session restore banner (§4.6).
    // Live-mode edit header (§4.3).
    notSyncedChip: "Not synced",
    notSyncedTooltip: "Changes are local until you press Sync.",
    reviewChanges: "Review changes",
    sync: "Sync",
    discard: "Discard",
    // Review dialog (§4.4).
    reviewTitle: "Review changes",
    reviewEmpty: "No changes to sync yet.",
    reviewSyncNow: "Sync now",
    reviewKeepEditing: "Keep editing",
    reviewDiscardAll: "Discard all changes",
    reviewAppliesEverywhere: "applies everywhere",
    reviewAppliesEveryActivity: "applies to every activity",
    // Sync flow (§4.5).
    syncingTitle: "Syncing to your hub",
    syncingMessage: "Writing your changes to the hub\u2026",
    syncSuccess: "Synced to hub.",
    syncPlanSummary: (count) => `${count} hub ${count === 1 ? "write" : "writes"}`,
    syncFailedTitle: "Sync didn't finish",
    syncFailedStep: (step) => `The hub stopped at: ${step}`,
    syncStaleTitle: (kind) => `This ${kind} changed on the hub`,
    syncStaleBody: (kind) => `The ${kind} was edited on the hub since you loaded it, so your changes can't be safely applied. Reload the hub's current version to continue \u2014 your unsaved edits will be discarded.`,
    syncRetry: "Retry sync",
    syncReload: "Reload from hub",
    syncKeepEditing: "Keep editing",
    exitUnsyncedTitle: "Unsynced changes",
    exitUnsyncedBody: (kind) => `This ${kind} has changes that have not been synced to the hub. Sync them now, or leave without syncing and discard the local edit.`,
    exitSyncNow: "Sync now",
    exitWithoutSync: "Leave without syncing",
    // Discard confirmation.
    discardConfirmTitle: "Discard all changes?",
    discardConfirmBody: (kind) => `This throws away every edit you've made to this ${kind} and returns to the captured state.`,
    discardConfirmCancel: "Keep editing",
    discardConfirmConfirm: "Discard changes",
    // Review-list section titles + entry templates (activity-diff.ts).
    review: {
      sectionDevices: "Devices",
      sectionStart: "When it starts",
      sectionButtons: "Buttons",
      sectionShortcuts: "Shortcuts",
      sectionEnd: "When it ends",
      sectionDeviceWide: "Device-wide changes",
      deviceAdded: (name) => `Added "${name}" to this activity.`,
      deviceRemoved: (name) => `Removed "${name}" from this activity.`,
      inputChanged: (device, input) => `"${device}" input changed to ${input}.`,
      inputCleared: (device) => `"${device}" input cleared.`,
      startReordered: "Start sequence reordered.",
      roleNowControls: (group, device) => `${group} now control "${device}".`,
      roleCustomized: (group) => `${group} customized.`,
      roleCleared: (group) => `${group} no longer assigned.`,
      shortcutAdded: (name) => `Added "${name}".`,
      shortcutRemoved: (name) => `Removed "${name}".`,
      shortcutRenamed: (oldName, newName) => `Renamed "${oldName}" \u2192 "${newName}".`,
      shortcutsReordered: "Reordered shortcuts.",
      idleChanged: (device, label) => `"${device}" idle behavior \u2192 ${label}.`,
      commandRenamed: (oldName, newName, device) => `Renamed command "${oldName}" \u2192 "${newName}" on "${device}".`,
      roleGroups: {
        volume: "Volume buttons",
        navigation: "Navigation buttons",
        playback: "Playback buttons",
        channels: "Channel buttons"
      },
      idleShort: {
        0: "not set",
        1: "turns off when idle",
        2: "never switches off",
        3: "stays on",
        4: "not managed by the hub"
      }
    },
    // Review-list section titles + entry templates for the live *device*
    // editor (activity-diff.ts, diffDeviceForReview).
    deviceReview: {
      sectionPower: "Power",
      sectionButtons: "Buttons",
      sectionMacros: "Macros",
      powerControlChanged: (label) => `Automatic power control \u2192 ${label}.`,
      powerOnChanged: "Power-on sequence updated.",
      powerOffChanged: "Power-off sequence updated.",
      macroAdded: (name) => `Added macro "${name}".`,
      macroRemoved: (name) => `Removed macro "${name}".`,
      macroRenamed: (oldName, newName) => `Renamed macro "${oldName}" \u2192 "${newName}".`,
      macroChanged: (name) => `Edited macro "${name}".`,
      bindingBound: (button, command) => `"${button}" now sends "${command}".`,
      bindingCleared: (button) => `"${button}" no longer bound.`
    }
  },
  backup: {
    loading: "Loading backup tools...",
    selectHub: "Select a hub to manage backups.",
    creatingSubtitle: "The hub is creating your backup.",
    readySubtitle: "Your backup is ready.",
    chooseSubtitle: "Choose what to include in this backup.",
    enablePersistentCache: "Enable persistent cache to choose backup contents from the card.",
    completedTitle: "Backup completed",
    expired: "Backup expired. Start a new backup to download again.",
    downloaded: "Downloaded",
    downloadAgain: "Download again",
    downloadBackup: "Download backup",
    complete: "Complete",
    entireHub: "Entire hub",
    selectedDevices: "Selected devices",
    devicesToInclude: "Devices to include",
    selectedCount: (count) => `${count} selected`,
    deselectAll: "Deselect all",
    selectAll: "Select all",
    noDevicesAvailable: "No devices available.",
    working: "Working",
    startBackup: "Start backup",
    editLoadPrompt: "Load a backup file, then choose an Activity or Device to edit.",
    chooseBackupFile: "Choose backup file",
    reorderHint: " Drag the handle on any row to reorder Activities and Devices.",
    hubName: "Hub name",
    hubNameNotSet: "(not set)",
    renameHub: "Rename Hub",
    activities: "Activities",
    noActivitiesInFile: "This backup file has no activities.",
    devices: "Devices",
    noDevicesInFile: "This backup file has no devices.",
    unsavedChanges: "Unsaved changes. Click ",
    downloadEditedBackupStrong: "Download edited backup",
    unsavedChangesSuffix: " to save them to a file.",
    downloadEditedBackup: "Download edited backup",
    deleteActivityTitle: (name) => `Delete activity "${name}"?`,
    deleteDeviceTitle: (name) => `Delete device "${name}"?`,
    deleteCommandTitle: (name) => `Delete command "${name}"?`,
    deleteFavoriteTitle: (name) => `Delete shortcut "${name}"?`,
    deleteMacroTitle: (name) => `Delete macro "${name}"?`,
    deleteCascadeIntro: "Removing this also clears its references elsewhere in the backup:",
    deleteSimpleBody: "This removes it from the loaded backup.",
    deleteImpactActivities: (count) => `${count} ${count === 1 ? "activity references" : "activities reference"} it`,
    deleteImpactFavorites: (count) => `${count} shortcut${count === 1 ? "" : "s"} will be removed`,
    deleteImpactMacroSteps: (count) => `${count} sequence step${count === 1 ? "" : "s"} will be removed`,
    deleteReplaceNote: "Deletions reach the hub only with a Replace restore.",
    deleteCancel: "Cancel",
    deleteConfirm: "Delete",
    deleteActivityAria: "Delete activity",
    deleteDeviceAria: "Delete device",
    deleteCommandAria: "Delete command",
    addFavoriteTitle: "Add command shortcut",
    addFavoriteDevice: "Device",
    addFavoriteCommand: "Command",
    addFavoriteName: "Display name",
    addFavoriteAdd: "Add",
    addFavoriteCancel: "Cancel",
    addFavoriteNoDevices: "This backup has no devices with commands to add.",
    addFavoriteNoCommands: "This device has no commands to add.",
    buttonBindingsTitle: "Button bindings",
    buttonBindingsActivitySub: "Bind remote buttons to a device's command within this Activity.",
    buttonBindingsDeviceSub: "Bind remote buttons to this Device's own commands.",
    buttonBindingsEmpty: "No button bindings configured.",
    addBinding: "Add binding",
    bindingButton: "Button",
    bindingTargetDevice: "Device",
    bindingCommand: "Command",
    bindingEnableLongPress: "Enable long-press binding",
    bindingLongPressDevice: "Long-press device",
    bindingLongPressCommand: "Long-press command",
    bindingIncomplete: "Choose a button and target first.",
    bindingNoButtons: "Every button on this hub model is already bound.",
    bindingNoCommands: "This device has no commands to bind.",
    bindingNoDevices: "This backup has no devices with commands to bind.",
    bindingAdd: "Add",
    bindingSave: "Save",
    bindingCancel: "Cancel",
    bindingDialogAddTitle: "Add button binding",
    bindingDialogEditTitle: (name) => `Edit ${name} binding`,
    bindingLongPressMeta: (label) => `Long press \xB7 ${label}`,
    deleteBindingTitle: (name) => `Delete ${name} binding?`,
    deleteBindingAria: "Delete binding",
    deleteImpactBindings: (count) => `${count} button binding${count === 1 ? "" : "s"} will be cleared`,
    macrosTitle: "Macros",
    macrosDeviceSub: "Edit the command sequences this device plays, including its power on / off.",
    macroPowerChip: "power",
    powerSetupTitle: "Power",
    powerSetupDeviceSub: "How the hub manages this device's power for Activities, and the sequences it sends to switch it on and off.",
    powerSetupActivitySub: "The startup and shutdown sequence this Activity runs.",
    powerOnLabel: "Power-on sequence",
    powerOffLabel: "Power-off sequence",
    // Automatic-power dropdown (device only). One hub byte encodes the whole
    // "Power On/Off Setup" + "Idle Behavior" story, so it is one selector here.
    powerControlTitle: "Automatic power control",
    powerControlUnset: "Not captured",
    powerControlUnsetSub: "This backup predates power-control capture. Pick an option to set it, or restore as-is to keep the legacy value.",
    powerControlDisabled: "Don't control power",
    powerControlDisabledSub: "The hub never switches this device on or off. The sequences below are ignored.",
    powerControlAutoOff: "Turn off when idle",
    powerControlAutoOffSub: "Recommended. Powers the device off when no Activity needs it.",
    powerControlStayOn: "Stay on between Activities",
    powerControlStayOnSub: "Skips the wait to power back on; still turns off with the remote's Off button.",
    powerControlAlwaysOn: "Always stay on",
    powerControlAlwaysOnSub: "The hub powers it on but never switches it off automatically.",
    powerSequencesDisabledNote: "Power control is off, so these sequences aren't used. Switch it on above to edit them.",
    inputStepTitle: "Set input",
    inputStepCommand: "Input command",
    inputStepNone: "\u2014 no input \u2014",
    macroStepsCount: (count) => `${count} step${count === 1 ? "" : "s"}`,
    noMacroSteps: "No steps yet.",
    addStep: "Add step",
    stepDialogAddTitle: "Add step",
    stepDialogEditTitle: "Edit step",
    stepDevice: "Device",
    stepCommand: "Command",
    stepHoldSeconds: "Hold (seconds, 0 = click)",
    holdLabel: (seconds) => `Hold ${seconds}s`,
    stepAdd: "Add",
    stepSave: "Save",
    stepCancel: "Cancel",
    stepNoCommands: "This device has no commands.",
    stepWaitAria: "Wait after this step (seconds)",
    stepWaitLabel: "Delay",
    stepWaitUnit: "s",
    renameMacroAria: "Rename macro",
    deleteStepAria: "Delete step",
    editStepAria: "Edit step",
    newMacroName: "Macro",
    shortcutChipCommand: "command",
    shortcutChipAction: "macro",
    shortcutRenameAria: (kind) => kind === "macro" ? "Rename macro" : "Rename shortcut",
    shortcutDeleteAria: (kind) => kind === "macro" ? "Delete macro" : "Delete shortcut",
    powerSectionTitle: "Power",
    powerActivitySub: "Each device the Activity uses powers on here. Pick its input and adjust the timing.",
    powerInputLabel: "Input",
    powerInputNone: "\u2014 none \u2014",
    powerDelayLabel: "Delay (s)",
    powerNoDevices: "No devices yet. Add a favorite, binding, or macro that uses one.",
    powerOnSequence: "Power-on sequence",
    powerOffSequence: "Power-off sequence",
    powerSequenceSub: "Reorder steps, add your own commands or waits. Required device steps can be reordered but not removed.",
    macroRenameAria: "Rename macro",
    editStepsAria: "Edit steps",
    crumbActivities: "Activities",
    crumbDevices: "Devices",
    // Activity-detail copy.
    activityRemoveDeviceTitle: (name) => `Remove ${name} from this activity?`,
    activityRunningTitle: "Buttons on the remote",
    activityRunningSub: "Which device each remote button controls in this activity.",
    activityShortcutsTitle: "Shortcuts on the remote screen",
    activityShortcutsSubSortable: "Commands and macros shown on the remote's screen. Drag the handle to reorder.",
    activityShortcutsSubStatic: "Commands and macros shown on the remote's screen. Use the move buttons to reorder.",
    activityShortcutsEmpty: "No shortcuts yet. Add a command or a macro.",
    // Role-based button assignment (Phase B).
    roleVolume: "Volume buttons control",
    roleNavigation: "Navigation and OK control",
    rolePlayback: "Playback buttons control",
    roleChannels: "Channel buttons control",
    roleNotUsed: "Not used",
    roleCustom: "Custom",
    roleCustomized: (name) => `${name} (customized)`,
    roleMappedNote: (bound, total) => `${bound} of ${total} buttons mapped`,
    roleOptionNoMapping: (name) => `${name} \u2014 no button mapping`,
    roleMenuAria: (roleLabel) => `Choose a device for: ${roleLabel}`,
    roleConfirmTitle: "Replace custom button setup?",
    roleConfirmBody: "This group has button assignments that don't come from a single device's standard mapping. Assigning it here replaces them.",
    roleConfirmReplace: "Replace",
    roleConfirmCancel: "Cancel",
    customizeButtonsToggle: "Customize individual buttons",
    bindingsViewTitle: "Individual buttons",
    bindingsConfiguredCount: (count) => `${count} configured`,
    bindingsNoneConfigured: "None customized",
    // Unified "add to shortcuts" flow.
    addShortcutButton: "Add",
    addShortcutTitle: "Add to shortcuts",
    addShortcutKindLabel: "Type",
    shortcutKindCommand: "Device command",
    shortcutKindAction: "Macro",
    shortcutKindHa: "Home Assistant action",
    macroTargetLabel: "Macro",
    macroTargetCreateNew: "Create new macro",
    macroTargetNoExisting: "No macros yet. Create one below.",
    addShortcutActionName: "Name",
    addShortcutActionHelper: "You'll pick the steps next.",
    // Home Assistant actions (Phase D).
    haActionDialogTitle: "Add Home Assistant action",
    haActionNameLabel: "Name",
    haActionNameHelper: "Shown on the remote; Home Assistant receives it when the shortcut is pressed.",
    haActionBindingNameHelper: "Shown on the remote; Home Assistant receives it when the button is pressed.",
    haActionAddressLabel: "Home Assistant address",
    haActionAddressHelper: "IPv4 address (and optional :port) where the hub can reach this Home Assistant on your network. The wifi-commands listener answers there.",
    haActionNameRequired: "Enter a name.",
    haActionInvalidAddress: "Enter the address as IPv4 or IPv4:port, e.g. 192.168.1.10:8060.",
    haActionNoSlots: "No free slots \u2014 the shared device-id space is full.",
    haActionAdd: "Add",
    haActionCancel: "Cancel",
    haActionChip: "HA action"
  },
  wifiCommands: {
    docsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    sectionLabel: "Wifi Devices",
    deployingTitle: "Deploying Wifi Commands",
    sectionSubtitle: "Choose a Wifi Device to edit its command slots, or add a new one.",
    addDevice: "Add Wifi Device",
    syncingDeviceFallback: "Syncing Wifi Device...",
    syncingDeviceNamed: (deviceName) => `Syncing ${deviceName}...`,
    syncInProgress: "Sync in progress",
    startSync: "Starting sync",
    syncFailedToStart: "Sync failed to start",
    syncMessageRemoteUnavailable: "Remote entity unavailable. Is the app connected?",
    syncMessageFailed: "Last sync failed.",
    syncMessageNeeded: "Command config changes need to be synced to the hub.",
    syncMessageUpToDate: "Hub command configuration is up to date.",
    syncMessageIdle: "No sync needed.",
    syncShortUnavailable: "Unavailable",
    syncShortRunning: "Syncing",
    syncShortFailed: "Sync failed",
    syncShortNeeded: "Sync needed",
    syncShortUpToDate: "Up to date",
    syncShortIdle: "Idle",
    deviceDeleting: "Deleting...",
    deviceSynced: "Synced",
    seeDocumentation: "See documentation",
    actionButtonUnavailable: "Unavailable",
    actionButtonSyncing: "Syncing...",
    actionButtonBusy: "Busy",
    actionButtonSyncToHub: "Sync to Hub",
    actionButtonUpToDate: "Up to Date",
    createDeviceBusy: "Creating Wifi Device...",
    createDeviceNameRequired: "Device name is required.",
    createDeviceFailed: "Unable to create Wifi Device",
    deleteDeviceBusy: "Deleting Wifi Device...",
    deleteDeviceFailed: "Unable to delete Wifi Device",
    createModalCancel: "Cancel",
    createModalCreate: "Create",
    deleteModalTitle: "Delete Wifi Device?",
    deleteModalBody: (deviceName) => `Delete "${deviceName}" from the hub and remove its saved command-slot configuration?`,
    deleteModalDelete: "Delete",
    clearSlotTitle: "Clear command slot?",
    clearSlotSubtitle: "Resets configuration.",
    clearSlotNo: "No",
    clearSlotYes: "Yes",
    makeCommand: "Make Command",
    noActionConfigured: "No Action configured",
    commandSlotTitle: (slotIndex) => `Command Slot ${slotIndex + 1}`,
    commandSlotActionTitle: (slotIndex) => `Command Slot ${slotIndex + 1} Action`,
    commandDisplayName: "Command Display Name",
    advanced: "Advanced",
    powerOn: "Set as Power ON command",
    powerOff: "Set as Power OFF command",
    activityInput: "Set as Activity input",
    noActivitiesForHub: "No Activities available for this hub.",
    activityInputLabel: "Activity to apply the input to",
    favorite: "Set as Favorite",
    physicalButtonAssignment: "Physical Button Assignment",
    enableLongPress: "Enable long-press",
    applyToActivities: "Apply to these Activities",
    actionModalNote: "Run an Action whenever the command is performed. Configuring an Action is optional; you can create your own automations that trigger from the Wifi Commands sensor.",
    shortPress: "Short press",
    longPress: "Long press",
    selectLongPressAction: "Select Long-Press Action",
    selectTriggeredAction: "Select Triggered Action",
    action: "Action",
    save: "Save",
    syncWarningTitle: "Sync commands to hub?",
    syncWarningBody: "This sync can run for several minutes. During this process, other interactions with the hub are blocked.",
    syncWarningBody2: "At the end of deployment, the physical remote will be force-resynced. It is recommended to finish your full Wifi Commands setup first, then sync once.",
    syncWarningOptOut: "Don't show this warning again for this remote.",
    syncWarningStart: "Start sync",
    keyLabels: {
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
      c: "C"
    }
  }
};

// node_modules/@lit-labs/ssr-dom-shim/lib/element-internals.js
var ElementInternalsShim = class ElementInternals {
  get shadowRoot() {
    return this.__host.__shadowRoot;
  }
  constructor(_host) {
    this.ariaActiveDescendantElement = null;
    this.ariaAtomic = "";
    this.ariaAutoComplete = "";
    this.ariaBrailleLabel = "";
    this.ariaBrailleRoleDescription = "";
    this.ariaBusy = "";
    this.ariaChecked = "";
    this.ariaColCount = "";
    this.ariaColIndex = "";
    this.ariaColIndexText = "";
    this.ariaColSpan = "";
    this.ariaControlsElements = null;
    this.ariaCurrent = "";
    this.ariaDescribedByElements = null;
    this.ariaDescription = "";
    this.ariaDetailsElements = null;
    this.ariaDisabled = "";
    this.ariaErrorMessageElements = null;
    this.ariaExpanded = "";
    this.ariaFlowToElements = null;
    this.ariaHasPopup = "";
    this.ariaHidden = "";
    this.ariaInvalid = "";
    this.ariaKeyShortcuts = "";
    this.ariaLabel = "";
    this.ariaLabelledByElements = null;
    this.ariaLevel = "";
    this.ariaLive = "";
    this.ariaModal = "";
    this.ariaMultiLine = "";
    this.ariaMultiSelectable = "";
    this.ariaOrientation = "";
    this.ariaOwnsElements = null;
    this.ariaPlaceholder = "";
    this.ariaPosInSet = "";
    this.ariaPressed = "";
    this.ariaReadOnly = "";
    this.ariaRelevant = "";
    this.ariaRequired = "";
    this.ariaRoleDescription = "";
    this.ariaRowCount = "";
    this.ariaRowIndex = "";
    this.ariaRowIndexText = "";
    this.ariaRowSpan = "";
    this.ariaSelected = "";
    this.ariaSetSize = "";
    this.ariaSort = "";
    this.ariaValueMax = "";
    this.ariaValueMin = "";
    this.ariaValueNow = "";
    this.ariaValueText = "";
    this.role = "";
    this.form = null;
    this.labels = [];
    this.states = /* @__PURE__ */ new Set();
    this.validationMessage = "";
    this.validity = {};
    this.willValidate = true;
    this.__host = _host;
  }
  checkValidity() {
    console.warn("`ElementInternals.checkValidity()` was called on the server.This method always returns true.");
    return true;
  }
  reportValidity() {
    return true;
  }
  setFormValue() {
  }
  setValidity() {
  }
};

// node_modules/@lit-labs/ssr-dom-shim/lib/events.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f3) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f3.call(receiver, value) : f3 ? f3.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f3) {
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f3 : kind === "a" ? f3.call(receiver) : f3 ? f3.value : state.get(receiver);
};
var _Event_cancelable;
var _Event_bubbles;
var _Event_composed;
var _Event_defaultPrevented;
var _Event_timestamp;
var _Event_propagationStopped;
var _Event_type;
var _Event_target;
var _Event_isBeingDispatched;
var _a;
var _CustomEvent_detail;
var _b;
var isCaptureEventListener = (options) => typeof options === "boolean" ? options : options?.capture ?? false;
var NONE = 0;
var CAPTURING_PHASE = 1;
var AT_TARGET = 2;
var BUBBLING_PHASE = 3;
var EventTarget = class {
  constructor() {
    this.__eventListeners = /* @__PURE__ */ new Map();
    this.__captureEventListeners = /* @__PURE__ */ new Map();
  }
  addEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    let eventListeners = eventListenersMap.get(type);
    if (eventListeners === void 0) {
      eventListeners = /* @__PURE__ */ new Map();
      eventListenersMap.set(type, eventListeners);
    } else if (eventListeners.has(callback)) {
      return;
    }
    const normalizedOptions = typeof options === "object" && options ? options : {};
    normalizedOptions.signal?.addEventListener("abort", () => this.removeEventListener(type, callback, options));
    eventListeners.set(callback, normalizedOptions ?? {});
  }
  removeEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    const eventListeners = eventListenersMap.get(type);
    if (eventListeners !== void 0) {
      eventListeners.delete(callback);
      if (!eventListeners.size) {
        eventListenersMap.delete(type);
      }
    }
  }
  dispatchEvent(event) {
    const composedPath = [this];
    let parent = this.__eventTargetParent;
    if (event.composed) {
      while (parent) {
        composedPath.push(parent);
        parent = parent.__eventTargetParent;
      }
    } else {
      while (parent && parent !== this.__host) {
        composedPath.push(parent);
        parent = parent.__eventTargetParent;
      }
    }
    let stopPropagation = false;
    let stopImmediatePropagation = false;
    let eventPhase = NONE;
    let target = null;
    let tmpTarget = null;
    let currentTarget = null;
    const originalStopPropagation = event.stopPropagation;
    const originalStopImmediatePropagation = event.stopImmediatePropagation;
    Object.defineProperties(event, {
      target: {
        get() {
          return target ?? tmpTarget;
        },
        ...enumerableProperty
      },
      srcElement: {
        get() {
          return event.target;
        },
        ...enumerableProperty
      },
      currentTarget: {
        get() {
          return currentTarget;
        },
        ...enumerableProperty
      },
      eventPhase: {
        get() {
          return eventPhase;
        },
        ...enumerableProperty
      },
      composedPath: {
        value: () => composedPath,
        ...enumerableProperty
      },
      stopPropagation: {
        value: () => {
          stopPropagation = true;
          originalStopPropagation.call(event);
        },
        ...enumerableProperty
      },
      stopImmediatePropagation: {
        value: () => {
          stopImmediatePropagation = true;
          originalStopImmediatePropagation.call(event);
        },
        ...enumerableProperty
      }
    });
    const invokeEventListener = (listener, options, eventListenerMap) => {
      if (typeof listener === "function") {
        listener(event);
      } else if (typeof listener?.handleEvent === "function") {
        listener.handleEvent(event);
      }
      if (options.once) {
        eventListenerMap.delete(listener);
      }
    };
    const finishDispatch = () => {
      currentTarget = null;
      eventPhase = NONE;
      return !event.defaultPrevented;
    };
    const captureEventPath = composedPath.slice().reverse();
    target = !this.__host || !event.composed ? this : null;
    const retarget = (eventTargets) => {
      tmpTarget = this;
      while (tmpTarget.__host && eventTargets.includes(tmpTarget.__host)) {
        tmpTarget = tmpTarget.__host;
      }
    };
    for (const eventTarget of captureEventPath) {
      if (!target && (!tmpTarget || tmpTarget === eventTarget.__host)) {
        retarget(captureEventPath.slice(captureEventPath.indexOf(eventTarget)));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? AT_TARGET : CAPTURING_PHASE;
      const captureEventListeners = eventTarget.__captureEventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    const bubbleEventPath = event.bubbles ? composedPath : [this];
    tmpTarget = null;
    for (const eventTarget of bubbleEventPath) {
      if (!target && (!tmpTarget || eventTarget === tmpTarget.__host)) {
        retarget(bubbleEventPath.slice(0, bubbleEventPath.indexOf(eventTarget) + 1));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? AT_TARGET : BUBBLING_PHASE;
      const captureEventListeners = eventTarget.__eventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    return finishDispatch();
  }
};
var EventTargetShimWithRealType = EventTarget;
var enumerableProperty = { __proto__: null };
enumerableProperty.enumerable = true;
Object.freeze(enumerableProperty);
var EventShim = (_a = class Event {
  constructor(type, options = {}) {
    _Event_cancelable.set(this, false);
    _Event_bubbles.set(this, false);
    _Event_composed.set(this, false);
    _Event_defaultPrevented.set(this, false);
    _Event_timestamp.set(this, Date.now());
    _Event_propagationStopped.set(this, false);
    _Event_type.set(this, void 0);
    _Event_target.set(this, void 0);
    _Event_isBeingDispatched.set(this, void 0);
    this.NONE = NONE;
    this.CAPTURING_PHASE = CAPTURING_PHASE;
    this.AT_TARGET = AT_TARGET;
    this.BUBBLING_PHASE = BUBBLING_PHASE;
    if (arguments.length === 0)
      throw new Error(`The type argument must be specified`);
    if (typeof options !== "object" || !options) {
      throw new Error(`The "options" argument must be an object`);
    }
    const { bubbles, cancelable, composed } = options;
    __classPrivateFieldSet(this, _Event_cancelable, !!cancelable, "f");
    __classPrivateFieldSet(this, _Event_bubbles, !!bubbles, "f");
    __classPrivateFieldSet(this, _Event_composed, !!composed, "f");
    __classPrivateFieldSet(this, _Event_type, `${type}`, "f");
    __classPrivateFieldSet(this, _Event_target, null, "f");
    __classPrivateFieldSet(this, _Event_isBeingDispatched, false, "f");
  }
  initEvent(_type, _bubbles, _cancelable) {
    throw new Error("Method not implemented.");
  }
  stopImmediatePropagation() {
    this.stopPropagation();
  }
  preventDefault() {
    __classPrivateFieldSet(this, _Event_defaultPrevented, true, "f");
  }
  get target() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get currentTarget() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get srcElement() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get type() {
    return __classPrivateFieldGet(this, _Event_type, "f");
  }
  get cancelable() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f");
  }
  get defaultPrevented() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f") && __classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get timeStamp() {
    return __classPrivateFieldGet(this, _Event_timestamp, "f");
  }
  composedPath() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? [__classPrivateFieldGet(this, _Event_target, "f")] : [];
  }
  get returnValue() {
    return !__classPrivateFieldGet(this, _Event_cancelable, "f") || !__classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get bubbles() {
    return __classPrivateFieldGet(this, _Event_bubbles, "f");
  }
  get composed() {
    return __classPrivateFieldGet(this, _Event_composed, "f");
  }
  get eventPhase() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? _a.AT_TARGET : _a.NONE;
  }
  get cancelBubble() {
    return __classPrivateFieldGet(this, _Event_propagationStopped, "f");
  }
  set cancelBubble(value) {
    if (value) {
      __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
    }
  }
  stopPropagation() {
    __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
  }
  get isTrusted() {
    return false;
  }
}, _Event_cancelable = /* @__PURE__ */ new WeakMap(), _Event_bubbles = /* @__PURE__ */ new WeakMap(), _Event_composed = /* @__PURE__ */ new WeakMap(), _Event_defaultPrevented = /* @__PURE__ */ new WeakMap(), _Event_timestamp = /* @__PURE__ */ new WeakMap(), _Event_propagationStopped = /* @__PURE__ */ new WeakMap(), _Event_type = /* @__PURE__ */ new WeakMap(), _Event_target = /* @__PURE__ */ new WeakMap(), _Event_isBeingDispatched = /* @__PURE__ */ new WeakMap(), _a.NONE = NONE, _a.CAPTURING_PHASE = CAPTURING_PHASE, _a.AT_TARGET = AT_TARGET, _a.BUBBLING_PHASE = BUBBLING_PHASE, _a);
Object.defineProperties(EventShim.prototype, {
  initEvent: enumerableProperty,
  stopImmediatePropagation: enumerableProperty,
  preventDefault: enumerableProperty,
  target: enumerableProperty,
  currentTarget: enumerableProperty,
  srcElement: enumerableProperty,
  type: enumerableProperty,
  cancelable: enumerableProperty,
  defaultPrevented: enumerableProperty,
  timeStamp: enumerableProperty,
  composedPath: enumerableProperty,
  returnValue: enumerableProperty,
  bubbles: enumerableProperty,
  composed: enumerableProperty,
  eventPhase: enumerableProperty,
  cancelBubble: enumerableProperty,
  stopPropagation: enumerableProperty,
  isTrusted: enumerableProperty
});
var CustomEventShim = (_b = class CustomEvent extends EventShim {
  constructor(type, options = {}) {
    super(type, options);
    _CustomEvent_detail.set(this, void 0);
    __classPrivateFieldSet(this, _CustomEvent_detail, options?.detail ?? null, "f");
  }
  initCustomEvent(_type, _bubbles, _cancelable, _detail) {
    throw new Error("Method not implemented.");
  }
  get detail() {
    return __classPrivateFieldGet(this, _CustomEvent_detail, "f");
  }
}, _CustomEvent_detail = /* @__PURE__ */ new WeakMap(), _b);
Object.defineProperties(CustomEventShim.prototype, {
  detail: enumerableProperty
});
var EventShimWithRealType = EventShim;
var CustomEventShimWithRealType = CustomEventShim;

// node_modules/@lit-labs/ssr-dom-shim/lib/css.js
var _a2;
var CSSRuleShim = (_a2 = class CSSRule {
  constructor() {
    this.STYLE_RULE = 1;
    this.CHARSET_RULE = 2;
    this.IMPORT_RULE = 3;
    this.MEDIA_RULE = 4;
    this.FONT_FACE_RULE = 5;
    this.PAGE_RULE = 6;
    this.NAMESPACE_RULE = 10;
    this.KEYFRAMES_RULE = 7;
    this.KEYFRAME_RULE = 8;
    this.SUPPORTS_RULE = 12;
    this.COUNTER_STYLE_RULE = 11;
    this.FONT_FEATURE_VALUES_RULE = 14;
    this.__parentStyleSheet = null;
    this.cssText = "";
  }
  get parentRule() {
    return null;
  }
  get parentStyleSheet() {
    return this.__parentStyleSheet;
  }
  get type() {
    return 0;
  }
}, _a2.STYLE_RULE = 1, _a2.CHARSET_RULE = 2, _a2.IMPORT_RULE = 3, _a2.MEDIA_RULE = 4, _a2.FONT_FACE_RULE = 5, _a2.PAGE_RULE = 6, _a2.NAMESPACE_RULE = 10, _a2.KEYFRAMES_RULE = 7, _a2.KEYFRAME_RULE = 8, _a2.SUPPORTS_RULE = 12, _a2.COUNTER_STYLE_RULE = 11, _a2.FONT_FEATURE_VALUES_RULE = 14, _a2);

// node_modules/@lit-labs/ssr-dom-shim/index.js
globalThis.Event ??= EventShimWithRealType;
globalThis.CustomEvent ??= CustomEventShimWithRealType;
var attributes = /* @__PURE__ */ new WeakMap();
var attributesForElement = (element) => {
  let attrs = attributes.get(element);
  if (attrs === void 0) {
    attributes.set(element, attrs = /* @__PURE__ */ new Map());
  }
  return attrs;
};
var ElementShim = class Element extends EventTargetShimWithRealType {
  constructor() {
    super(...arguments);
    this.__shadowRootMode = null;
    this.__shadowRoot = null;
    this.__internals = null;
  }
  get attributes() {
    return Array.from(attributesForElement(this)).map(([name, value]) => ({
      name,
      value
    }));
  }
  get shadowRoot() {
    if (this.__shadowRootMode === "closed") {
      return null;
    }
    return this.__shadowRoot;
  }
  get localName() {
    return this.constructor.__localName;
  }
  get tagName() {
    return this.localName?.toUpperCase();
  }
  setAttribute(name, value) {
    attributesForElement(this).set(name, String(value));
  }
  removeAttribute(name) {
    attributesForElement(this).delete(name);
  }
  toggleAttribute(name, force) {
    if (this.hasAttribute(name)) {
      if (force === void 0 || !force) {
        this.removeAttribute(name);
        return false;
      }
    } else {
      if (force === void 0 || force) {
        this.setAttribute(name, "");
        return true;
      } else {
        return false;
      }
    }
    return true;
  }
  hasAttribute(name) {
    return attributesForElement(this).has(name);
  }
  attachShadow(init) {
    const shadowRoot = { host: this };
    this.__shadowRootMode = init.mode;
    if (init && init.mode === "open") {
      this.__shadowRoot = shadowRoot;
    }
    return shadowRoot;
  }
  attachInternals() {
    if (this.__internals !== null) {
      throw new Error(`Failed to execute 'attachInternals' on 'HTMLElement': ElementInternals for the specified element was already attached.`);
    }
    const internals = new ElementInternalsShim(this);
    this.__internals = internals;
    return internals;
  }
  getAttribute(name) {
    const value = attributesForElement(this).get(name);
    return value ?? null;
  }
};
var HTMLElementShim = class HTMLElement extends ElementShim {
};
var HTMLElementShimWithRealType = HTMLElementShim;
globalThis.litServerRoot ??= Object.defineProperty(new HTMLElementShimWithRealType(), "localName", {
  // Patch localName (and tagName) to return a unique name.
  get() {
    return "lit-server-root";
  }
});
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
var CustomElementRegistry = class {
  constructor() {
    this.__definitions = /* @__PURE__ */ new Map();
    this.__reverseDefinitions = /* @__PURE__ */ new Map();
    this.__pendingWhenDefineds = /* @__PURE__ */ new Map();
  }
  define(name, ctor) {
    if (this.__definitions.has(name)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`'CustomElementRegistry' already has "${name}" defined. This may have been caused by live reload or hot module replacement in which case it can be safely ignored.
Make sure to test your application with a production build as repeat registrations will throw in production.`);
      } else {
        throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the name "${name}" has already been used with this registry`);
      }
    }
    if (this.__reverseDefinitions.has(ctor)) {
      throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the constructor has already been used with this registry for the tag name ${this.__reverseDefinitions.get(ctor)}`);
    }
    ctor.__localName = name;
    this.__definitions.set(name, {
      ctor,
      // Note it's important we read `observedAttributes` in case it is a getter
      // with side-effects, as is the case in Lit, where it triggers class
      // finalization.
      //
      // TODO(aomarks) To be spec compliant, we should also capture the
      // registration-time lifecycle methods like `connectedCallback`. For them
      // to be actually accessible to e.g. the Lit SSR element renderer, though,
      // we'd need to introduce a new API for accessing them (since `get` only
      // returns the constructor).
      observedAttributes: ctor.observedAttributes ?? []
    });
    this.__reverseDefinitions.set(ctor, name);
    this.__pendingWhenDefineds.get(name)?.resolve(ctor);
    this.__pendingWhenDefineds.delete(name);
  }
  get(name) {
    const definition = this.__definitions.get(name);
    return definition?.ctor;
  }
  getName(ctor) {
    return this.__reverseDefinitions.get(ctor) ?? null;
  }
  upgrade(_element) {
    throw new Error(`customElements.upgrade is not currently supported in SSR. Please file a bug if you need it.`);
  }
  async whenDefined(name) {
    const definition = this.__definitions.get(name);
    if (definition) {
      return definition.ctor;
    }
    let withResolvers = this.__pendingWhenDefineds.get(name);
    if (!withResolvers) {
      withResolvers = promiseWithResolvers();
      this.__pendingWhenDefineds.set(name, withResolvers);
    }
    return withResolvers.promise;
  }
};
var CustomElementRegistryShimWithRealType = CustomElementRegistry;
var customElements = new CustomElementRegistryShimWithRealType();

// node_modules/@lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t3, e3, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t3, this.t = e3;
  }
  get styleSheet() {
    let t3 = this.o;
    const s4 = this.t;
    if (e && void 0 === t3) {
      const e3 = void 0 !== s4 && 1 === s4.length;
      e3 && (t3 = o.get(s4)), void 0 === t3 && ((this.o = t3 = new CSSStyleSheet()).replaceSync(this.cssText), e3 && o.set(s4, t3));
    }
    return t3;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t3) => new n("string" == typeof t3 ? t3 : t3 + "", void 0, s);
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t3) => t3 instanceof CSSStyleSheet ? t3 : t3.styleSheet);
  else for (const e3 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e3.cssText, s4.appendChild(o6);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t3) => t3 : (t3) => t3 instanceof CSSStyleSheet ? ((t4) => {
  let e3 = "";
  for (const s4 of t4.cssRules) e3 += s4.cssText;
  return r(e3);
})(t3) : t3;

// node_modules/@lit/reactive-element/node/reactive-element.js
var { is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object;
var l = globalThis;
l.customElements ??= customElements;
var p = l.trustedTypes;
var d = p ? p.emptyScript : "";
var u = l.reactiveElementPolyfillSupport;
var f = (t3, s4) => t3;
var b = { toAttribute(t3, s4) {
  switch (s4) {
    case Boolean:
      t3 = t3 ? d : null;
      break;
    case Object:
    case Array:
      t3 = null == t3 ? t3 : JSON.stringify(t3);
  }
  return t3;
}, fromAttribute(t3, s4) {
  let i4 = t3;
  switch (s4) {
    case Boolean:
      i4 = null !== t3;
      break;
    case Number:
      i4 = null === t3 ? null : Number(t3);
      break;
    case Object:
    case Array:
      try {
        i4 = JSON.parse(t3);
      } catch (t4) {
        i4 = null;
      }
  }
  return i4;
} };
var m = (t3, s4) => !h(t3, s4);
var y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
  static addInitializer(t3) {
    this._$Ei(), (this.l ??= []).push(t3);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t3, s4 = y) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t3) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t3, s4), !s4.noAccessor) {
      const i4 = /* @__PURE__ */ Symbol(), e3 = this.getPropertyDescriptor(t3, i4, s4);
      void 0 !== e3 && r2(this.prototype, t3, e3);
    }
  }
  static getPropertyDescriptor(t3, s4, i4) {
    const { get: e3, set: h3 } = o2(this.prototype, t3) ?? { get() {
      return this[s4];
    }, set(t4) {
      this[s4] = t4;
    } };
    return { get: e3, set(s5) {
      const r4 = e3?.call(this);
      h3?.call(this, s5), this.requestUpdate(t3, r4, i4);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t3) {
    return this.elementProperties.get(t3) ?? y;
  }
  static _$Ei() {
    if (this.hasOwnProperty(f("elementProperties"))) return;
    const t3 = c2(this);
    t3.finalize(), void 0 !== t3.l && (this.l = [...t3.l]), this.elementProperties = new Map(t3.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(f("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(f("properties"))) {
      const t4 = this.properties, s4 = [...n2(t4), ...a(t4)];
      for (const i4 of s4) this.createProperty(i4, t4[i4]);
    }
    const t3 = this[Symbol.metadata];
    if (null !== t3) {
      const s4 = litPropertyMetadata.get(t3);
      if (void 0 !== s4) for (const [t4, i4] of s4) this.elementProperties.set(t4, i4);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t4, s4] of this.elementProperties) {
      const i4 = this._$Eu(t4, s4);
      void 0 !== i4 && this._$Eh.set(i4, t4);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t3) {
    const s4 = [];
    if (Array.isArray(t3)) {
      const e3 = new Set(t3.flat(1 / 0).reverse());
      for (const t4 of e3) s4.unshift(c(t4));
    } else void 0 !== t3 && s4.push(c(t3));
    return s4;
  }
  static _$Eu(t3, s4) {
    const i4 = s4.attribute;
    return false === i4 ? void 0 : "string" == typeof i4 ? i4 : "string" == typeof t3 ? t3.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t3) => this.enableUpdating = t3), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t3) => t3(this));
  }
  addController(t3) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t3), void 0 !== this.renderRoot && this.isConnected && t3.hostConnected?.();
  }
  removeController(t3) {
    this._$EO?.delete(t3);
  }
  _$E_() {
    const t3 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i4 of s4.keys()) this.hasOwnProperty(i4) && (t3.set(i4, this[i4]), delete this[i4]);
    t3.size > 0 && (this._$Ep = t3);
  }
  createRenderRoot() {
    const t3 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t3, this.constructor.elementStyles), t3;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t3) => t3.hostConnected?.());
  }
  enableUpdating(t3) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t3) => t3.hostDisconnected?.());
  }
  attributeChangedCallback(t3, s4, i4) {
    this._$AK(t3, i4);
  }
  _$ET(t3, s4) {
    const i4 = this.constructor.elementProperties.get(t3), e3 = this.constructor._$Eu(t3, i4);
    if (void 0 !== e3 && true === i4.reflect) {
      const h3 = (void 0 !== i4.converter?.toAttribute ? i4.converter : b).toAttribute(s4, i4.type);
      this._$Em = t3, null == h3 ? this.removeAttribute(e3) : this.setAttribute(e3, h3), this._$Em = null;
    }
  }
  _$AK(t3, s4) {
    const i4 = this.constructor, e3 = i4._$Eh.get(t3);
    if (void 0 !== e3 && this._$Em !== e3) {
      const t4 = i4.getPropertyOptions(e3), h3 = "function" == typeof t4.converter ? { fromAttribute: t4.converter } : void 0 !== t4.converter?.fromAttribute ? t4.converter : b;
      this._$Em = e3;
      const r4 = h3.fromAttribute(s4, t4.type);
      this[e3] = r4 ?? this._$Ej?.get(e3) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t3, s4, i4, e3 = false, h3) {
    if (void 0 !== t3) {
      const r4 = this.constructor;
      if (false === e3 && (h3 = this[t3]), i4 ??= r4.getPropertyOptions(t3), !((i4.hasChanged ?? m)(h3, s4) || i4.useDefault && i4.reflect && h3 === this._$Ej?.get(t3) && !this.hasAttribute(r4._$Eu(t3, i4)))) return;
      this.C(t3, s4, i4);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t3, s4, { useDefault: i4, reflect: e3, wrapped: h3 }, r4) {
    i4 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t3) && (this._$Ej.set(t3, r4 ?? s4 ?? this[t3]), true !== h3 || void 0 !== r4) || (this._$AL.has(t3) || (this.hasUpdated || i4 || (s4 = void 0), this._$AL.set(t3, s4)), true === e3 && this._$Em !== t3 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t3));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t4) {
      Promise.reject(t4);
    }
    const t3 = this.scheduleUpdate();
    return null != t3 && await t3, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t5, s5] of this._$Ep) this[t5] = s5;
        this._$Ep = void 0;
      }
      const t4 = this.constructor.elementProperties;
      if (t4.size > 0) for (const [s5, i4] of t4) {
        const { wrapped: t5 } = i4, e3 = this[s5];
        true !== t5 || this._$AL.has(s5) || void 0 === e3 || this.C(s5, void 0, i4, e3);
      }
    }
    let t3 = false;
    const s4 = this._$AL;
    try {
      t3 = this.shouldUpdate(s4), t3 ? (this.willUpdate(s4), this._$EO?.forEach((t4) => t4.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t3 = false, this._$EM(), s5;
    }
    t3 && this._$AE(s4);
  }
  willUpdate(t3) {
  }
  _$AE(t3) {
    this._$EO?.forEach((t4) => t4.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t3)), this.updated(t3);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t3) {
    return true;
  }
  update(t3) {
    this._$Eq &&= this._$Eq.forEach((t4) => this._$ET(t4, this[t4])), this._$EM();
  }
  updated(t3) {
  }
  firstUpdated(t3) {
  }
};
g.elementStyles = [], g.shadowRootOptions = { mode: "open" }, g[f("elementProperties")] = /* @__PURE__ */ new Map(), g[f("finalized")] = /* @__PURE__ */ new Map(), u?.({ ReactiveElement: g }), (l.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/lit-html/node/lit-html.js
var t2 = globalThis;
var i2 = (t3) => t3;
var s2 = t2.trustedTypes;
var e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t3) => t3 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = void 0 === t2.document ? { createTreeWalker: () => ({}) } : document;
var c3 = () => l2.createComment("");
var a2 = (t3) => null === t3 || "object" != typeof t3 && "function" != typeof t3;
var u2 = Array.isArray;
var d2 = (t3) => u2(t3) || "function" == typeof t3?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m2 = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g2 = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t3) => (i4, ...s4) => ({ _$litType$: t3, strings: i4, values: s4 });
var T = x(1);
var b2 = x(2);
var w = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t3, i4) {
  if (!u2(t3) || !t3.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i4) : i4;
}
var N = (t3, i4) => {
  const s4 = t3.length - 1, e3 = [];
  let n4, l3 = 2 === i4 ? "<svg>" : 3 === i4 ? "<math>" : "", c4 = v;
  for (let i5 = 0; i5 < s4; i5++) {
    const s5 = t3[i5];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m2 : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g2) : c4 === $ || c4 === g2 ? c4 = p2 : c4 === _ || c4 === m2 ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t3[i5 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e3.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i5 : x2);
  }
  return [V(t3, l3 + (t3[s4] || "<?>") + (2 === i4 ? "</svg>" : 3 === i4 ? "</math>" : "")), e3];
};
var S2 = class _S {
  constructor({ strings: t3, _$litType$: i4 }, e3) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t3.length - 1, d3 = this.parts, [f3, v2] = N(t3, i4);
    if (this.el = _S.createElement(f3, e3), P.currentNode = this.el.content, 2 === i4 || 3 === i4) {
      const t4 = this.el.content.firstChild;
      t4.replaceWith(...t4.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t4 of r4.getAttributeNames()) if (t4.endsWith(h2)) {
          const i5 = v2[a3++], s4 = r4.getAttribute(t4).split(o3), e4 = /([.?@])?(.*)/.exec(i5);
          d3.push({ type: 1, index: l3, name: e4[2], strings: s4, ctor: "." === e4[1] ? I : "?" === e4[1] ? L : "@" === e4[1] ? z : H }), r4.removeAttribute(t4);
        } else t4.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t4));
        if (y2.test(r4.tagName)) {
          const t4 = r4.textContent.split(o3), i5 = t4.length - 1;
          if (i5 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i5; s4++) r4.append(t4[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t4[i5], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t4 = -1;
        for (; -1 !== (t4 = r4.data.indexOf(o3, t4 + 1)); ) d3.push({ type: 7, index: l3 }), t4 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t3, i4) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t3, s4;
  }
};
function M(t3, i4, s4 = t3, e3) {
  if (i4 === E) return i4;
  let h3 = void 0 !== e3 ? s4._$Co?.[e3] : s4._$Cl;
  const o5 = a2(i4) ? void 0 : i4._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t3), h3._$AT(t3, s4, e3)), void 0 !== e3 ? (s4._$Co ??= [])[e3] = h3 : s4._$Cl = h3), void 0 !== h3 && (i4 = M(t3, h3._$AS(t3, i4.values), h3, e3)), i4;
}
var k = class {
  constructor(t3, i4) {
    this._$AV = [], this._$AN = void 0, this._$AD = t3, this._$AM = i4;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t3) {
    const { el: { content: i4 }, parts: s4 } = this._$AD, e3 = (t3?.creationScope ?? l2).importNode(i4, true);
    P.currentNode = e3;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i5;
        2 === r4.type ? i5 = new R(h3, h3.nextSibling, this, t3) : 1 === r4.type ? i5 = new r4.ctor(h3, r4.name, r4.strings, this, t3) : 6 === r4.type && (i5 = new W(h3, this, t3)), this._$AV.push(i5), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e3;
  }
  p(t3) {
    let i4 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t3, s4, i4), i4 += s4.strings.length - 2) : s4._$AI(t3[i4])), i4++;
  }
};
var R = class _R {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t3, i4, s4, e3) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t3, this._$AB = i4, this._$AM = s4, this.options = e3, this._$Cv = e3?.isConnected ?? true;
  }
  get parentNode() {
    let t3 = this._$AA.parentNode;
    const i4 = this._$AM;
    return void 0 !== i4 && 11 === t3?.nodeType && (t3 = i4.parentNode), t3;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t3, i4 = this) {
    t3 = M(this, t3, i4), a2(t3) ? t3 === A || null == t3 || "" === t3 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t3 !== this._$AH && t3 !== E && this._(t3) : void 0 !== t3._$litType$ ? this.$(t3) : void 0 !== t3.nodeType ? this.T(t3) : d2(t3) ? this.k(t3) : this._(t3);
  }
  O(t3) {
    return this._$AA.parentNode.insertBefore(t3, this._$AB);
  }
  T(t3) {
    this._$AH !== t3 && (this._$AR(), this._$AH = this.O(t3));
  }
  _(t3) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t3 : this.T(l2.createTextNode(t3)), this._$AH = t3;
  }
  $(t3) {
    const { values: i4, _$litType$: s4 } = t3, e3 = "number" == typeof s4 ? this._$AC(t3) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e3) this._$AH.p(i4);
    else {
      const t4 = new k(e3, this), s5 = t4.u(this.options);
      t4.p(i4), this.T(s5), this._$AH = t4;
    }
  }
  _$AC(t3) {
    let i4 = C.get(t3.strings);
    return void 0 === i4 && C.set(t3.strings, i4 = new S2(t3)), i4;
  }
  k(t3) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i4 = this._$AH;
    let s4, e3 = 0;
    for (const h3 of t3) e3 === i4.length ? i4.push(s4 = new _R(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i4[e3], s4._$AI(h3), e3++;
    e3 < i4.length && (this._$AR(s4 && s4._$AB.nextSibling, e3), i4.length = e3);
  }
  _$AR(t3 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t3 !== this._$AB; ) {
      const s5 = i2(t3).nextSibling;
      i2(t3).remove(), t3 = s5;
    }
  }
  setConnected(t3) {
    void 0 === this._$AM && (this._$Cv = t3, this._$AP?.(t3));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t3, i4, s4, e3, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t3, this.name = i4, this._$AM = e3, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t3, i4 = this, s4, e3) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t3 = M(this, t3, i4, 0), o5 = !a2(t3) || t3 !== this._$AH && t3 !== E, o5 && (this._$AH = t3);
    else {
      const e4 = t3;
      let n4, r4;
      for (t3 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e4[s4 + n4], i4, n4), r4 === E && (r4 = this._$AH[n4]), o5 ||= !a2(r4) || r4 !== this._$AH[n4], r4 === A ? t3 = A : t3 !== A && (t3 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e3 && this.j(t3);
  }
  j(t3) {
    t3 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t3 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t3) {
    this.element[this.name] = t3 === A ? void 0 : t3;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t3) {
    this.element.toggleAttribute(this.name, !!t3 && t3 !== A);
  }
};
var z = class extends H {
  constructor(t3, i4, s4, e3, h3) {
    super(t3, i4, s4, e3, h3), this.type = 5;
  }
  _$AI(t3, i4 = this) {
    if ((t3 = M(this, t3, i4, 0) ?? A) === E) return;
    const s4 = this._$AH, e3 = t3 === A && s4 !== A || t3.capture !== s4.capture || t3.once !== s4.once || t3.passive !== s4.passive, h3 = t3 !== A && (s4 === A || e3);
    e3 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t3), this._$AH = t3;
  }
  handleEvent(t3) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t3) : this._$AH.handleEvent(t3);
  }
};
var W = class {
  constructor(t3, i4, s4) {
    this.element = t3, this.type = 6, this._$AN = void 0, this._$AM = i4, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t3) {
    M(this, t3);
  }
};
var j = t2.litHtmlPolyfillSupport;
j?.(S2, R), (t2.litHtmlVersions ??= []).push("3.3.2");
var B = (t3, i4, s4) => {
  const e3 = s4?.renderBefore ?? i4;
  let h3 = e3._$litPart$;
  if (void 0 === h3) {
    const t4 = s4?.renderBefore ?? null;
    e3._$litPart$ = h3 = new R(i4.insertBefore(c3(), t4), t4, void 0, s4 ?? {});
  }
  return h3._$AI(t3), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i3 = class extends g {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t3 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t3.firstChild, t3;
  }
  update(t3) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t3), this._$Do = B(r4, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i3._$litElement$ = true, i3["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i3 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i3 });
(s3.litElementVersions ??= []).push("4.2.2");

// custom_components/sofabaton_x1s/www/src/tabs/backup-state.ts
var INTERNAL_POWER_MACRO_BUTTON_IDS = /* @__PURE__ */ new Set([198, 199]);
function compareByHubOrder(left, right) {
  return left.sortKey - right.sortKey || left.id - right.id;
}
function readSortKey(block) {
  const value = Number(block?.sort);
  return Number.isFinite(value) ? value : 0;
}
function bundleDeviceOptions(bundle) {
  return [...bundle?.devices ?? []].map((device) => {
    const block = device?.device;
    const id = Number(block?.device_id || 0);
    return {
      id,
      sortKey: readSortKey(block),
      label: String(block?.name || `Device ${id}`),
      meta: String(block?.device_class || "").trim() || void 0
    };
  }).filter((option) => option.id > 0).sort(compareByHubOrder).map(({ id, label, meta }) => ({ id, label, meta }));
}
function normalizeHubVersion(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("X1S")) return "X1S";
  if (normalized.includes("X2")) return "X2";
  if (normalized.includes("X1")) return "X1";
  return null;
}
function updateActivity(bundle, activityId, updater) {
  const normalizedId = Number(activityId);
  return {
    ...bundle,
    activities: (bundle.activities ?? []).map((activity) => {
      if (Number(activity?.device?.device_id || 0) !== normalizedId) return activity;
      return updater(activity);
    })
  };
}
function updateDeviceCommandLabel(bundle, deviceId, commandId, name) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const trimmed = String(name ?? "").trim();
  const next = {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          return { ...command, name: trimmed };
        })
      };
    })
  };
  return refreshHaActionCallback(next, normalizedDeviceId, normalizedCommandId);
}
function commandLabelFor(bundle, deviceId, commandId) {
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const command = (device?.commands ?? []).find((entry) => Number(entry?.command_id || 0) === Number(commandId));
  return String(command?.name || "").trim();
}
function favoriteLabel(bundle, row) {
  const explicit = String(row?.name || "").trim();
  if (explicit) return explicit;
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  const derived = commandLabelFor(bundle, deviceId, commandId);
  if (derived) return derived;
  return `Favorite ${Number(row?.button_id || 0) || "?"}`;
}
function sortByButtonId(rows) {
  return [...rows ?? []].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}
function isEditableActivityMacro(row) {
  const buttonId = Number(row?.button_id || 0);
  const normalizedName = String(row?.name || "").trim().toUpperCase();
  if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(buttonId)) return false;
  if (normalizedName === "POWER_ON" || normalizedName === "POWER_OFF") return false;
  return true;
}
function activityQuickAccessItems(bundle, activityId) {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const items = [];
  for (const row of sortByButtonId(activity.macros).filter(isEditableActivityMacro)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "macro",
      activityId: Number(activityId),
      buttonId,
      label: String(row?.name || `Macro ${buttonId}`)
    });
  }
  for (const row of sortByButtonId(activity.favorite_slots)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "favorite",
      activityId: Number(activityId),
      buttonId,
      label: favoriteLabel(bundle, row),
      deviceId: Number(row?.device_id || 0) || void 0,
      commandId: Number(row?.command_id || 0) || void 0
    });
  }
  return items.sort((left, right) => left.buttonId - right.buttonId);
}
function renameBundleActivityFavorite(bundle, activityId, buttonId, name) {
  const normalizedButtonId = Number(buttonId);
  const trimmed = String(name ?? "").trim();
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const row = (activity?.favorite_slots ?? []).find((entry) => Number(entry?.button_id || 0) === normalizedButtonId);
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  let nextBundle = bundle;
  if (deviceId > 0 && commandId > 0) {
    nextBundle = updateDeviceCommandLabel(nextBundle, deviceId, commandId, trimmed);
  }
  return updateActivity(nextBundle, activityId, (current) => ({
    ...current,
    favorite_slots: (current.favorite_slots ?? []).map((entry) => Number(entry?.button_id || 0) === normalizedButtonId ? { ...entry, name: trimmed } : entry)
  }));
}
function deviceCommandItems(bundle, deviceId) {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId
  );
  if (!device) return [];
  const items = [];
  for (const row of device.commands ?? []) {
    const commandId = Number(row?.command_id || 0);
    if (commandId <= 0) continue;
    const label = String(row?.name || "").trim() || `Command ${commandId}`;
    items.push({ deviceId: normalizedDeviceId, commandId, label });
  }
  return items.sort((left, right) => left.commandId - right.commandId);
}
var IDLE_BEHAVIOR_AUTO_OFF = 1;
function deviceIdleBehavior(bundle, deviceId) {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device?.device) return null;
  const raw = device.device.idle_behavior ?? device.device.power_mode;
  if (raw == null) return null;
  const mode = Number(raw);
  return Number.isFinite(mode) ? mode & 255 : null;
}
function updateBundleDeviceIdleBehavior(bundle, deviceId, mode) {
  const normalizedId = Number(deviceId);
  const normalizedMode = Number(mode) & 255;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, idle_behavior: normalizedMode }
      };
    })
  };
}
function renameBundleDeviceCommand(bundle, deviceId, commandId, name) {
  return updateDeviceCommandLabel(bundle, Number(deviceId), Number(commandId), String(name ?? "").trim());
}
function stepMatchesCommand(step, deviceId, commandId) {
  return Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === commandId;
}
var MACRO_DELAY_SENTINEL = 255;
function isMacroDelayStep(step) {
  return Number(step?.device_id || 0) === MACRO_DELAY_SENTINEL || Number(step?.command_id || 0) === MACRO_DELAY_SENTINEL;
}
function filterMacroSteps(steps, shouldRemove) {
  const list = steps ?? [];
  const result = [];
  for (let index = 0; index < list.length; index += 1) {
    if (shouldRemove(list[index])) {
      while (index + 1 < list.length && isMacroDelayStep(list[index + 1])) {
        index += 1;
      }
      continue;
    }
    result.push(list[index]);
  }
  return result;
}
function nextQuickAccessButtonId(activity) {
  let max = 0;
  const consider = (value) => {
    if (value > 0 && !INTERNAL_POWER_MACRO_BUTTON_IDS.has(value) && value > max) max = value;
  };
  for (const slot of activity.favorite_slots ?? []) consider(Number(slot?.button_id || 0));
  for (const macro of activity.macros ?? []) consider(Number(macro?.button_id || 0));
  return max + 1;
}
function addBundleActivityFavorite(bundle, activityId, deviceId, commandId, name) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  if (dId <= 0 || cId <= 0) return bundle;
  const trimmed = String(name ?? "").trim();
  const next = updateActivity(bundle, activityId, (activity) => {
    const slot = {
      button_id: nextQuickAccessButtonId(activity),
      device_id: dId,
      command_id: cId,
      name: trimmed
    };
    return { ...activity, favorite_slots: [...activity.favorite_slots ?? [], slot] };
  });
  return reconcileActivityPowerMacros(next, Number(activityId));
}
var POWER_ON_MACRO_BUTTON_ID = 198;
var POWER_OFF_MACRO_BUTTON_ID = 199;
var DEVICE_POWER_ON_REF_COMMAND = 198;
var DEVICE_POWER_OFF_REF_COMMAND = 199;
var DEVICE_INPUT_REF_COMMAND = 197;
var POWER_STEP_DEFAULT_DELAY = 255;
function powerStep(deviceId, commandId, duration = 0) {
  return {
    device_id: Number(deviceId),
    command_id: commandId,
    button_code: 0,
    duration: duration & 255,
    delay: POWER_STEP_DEFAULT_DELAY
  };
}
function activityPowerDeviceIds(activity) {
  const ids = /* @__PURE__ */ new Set();
  for (const macro of activity.macros ?? []) {
    const buttonId = Number(macro?.button_id || 0);
    if (buttonId !== POWER_ON_MACRO_BUTTON_ID && buttonId !== POWER_OFF_MACRO_BUTTON_ID) continue;
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step)) continue;
      const command = Number(step?.command_id || 0);
      if (command === DEVICE_POWER_ON_REF_COMMAND || command === DEVICE_INPUT_REF_COMMAND || command === DEVICE_POWER_OFF_REF_COMMAND) {
        const deviceId = Number(step?.device_id || 0);
        if (deviceId > 0) ids.add(deviceId);
      }
    }
  }
  return ids;
}
function activityUsageDeviceIds(activity) {
  const selfId = Number(activity?.device?.device_id || 0);
  const ids = /* @__PURE__ */ new Set();
  const add = (value) => {
    const id = Number(value || 0);
    if (id > 0 && id !== selfId) ids.add(id);
  };
  for (const slot of activity.favorite_slots ?? []) add(slot?.device_id);
  for (const binding of activity.button_bindings ?? []) {
    add(binding?.device_id);
    add(binding?.long_press_device_id);
  }
  for (const macro of activity.macros ?? []) {
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step) || isPowerRefStep(step)) continue;
      add(step?.device_id);
    }
  }
  return ids;
}
function activityMemberDeviceIds(activity) {
  const ids = activityPowerDeviceIds(activity);
  for (const id of activityUsageDeviceIds(activity)) ids.add(id);
  return [...ids].sort((left, right) => left - right);
}
function reconcilePowerMacroSteps(existingSteps, members, refCommands) {
  const memberSet = new Set(members);
  const { prefix, groups } = groupMacroSteps(existingSteps);
  const kept = flattenMacroGroups(prefix, groups.filter((group) => {
    const deviceId = Number(group.head?.device_id || 0);
    return deviceId > 0 ? memberSet.has(deviceId) : true;
  }));
  const out = [...kept];
  const memberOrder = new Map(members.map((id, index) => [id, index]));
  const findRef = (deviceId, command) => out.findIndex(
    (step) => !isMacroDelayStep(step) && stepMatchesCommand(step, deviceId, command)
  );
  const indexAfterGroupAt = (headIndex) => {
    let index = headIndex + 1;
    while (index < out.length && isMacroDelayStep(out[index])) index += 1;
    return index;
  };
  const insertIndexFor = (deviceId, command) => {
    if (command === DEVICE_POWER_ON_REF_COMMAND) {
      const inputIndex = findRef(deviceId, DEVICE_INPUT_REF_COMMAND);
      if (inputIndex >= 0) return inputIndex;
    }
    if (command === DEVICE_INPUT_REF_COMMAND) {
      const powerIndex = findRef(deviceId, DEVICE_POWER_ON_REF_COMMAND);
      if (powerIndex >= 0) return indexAfterGroupAt(powerIndex);
    }
    const myOrder = memberOrder.get(deviceId) ?? members.length;
    const laterIndex = out.findIndex((step) => {
      if (isMacroDelayStep(step) || !isPowerRefStep(step)) return false;
      const otherOrder = memberOrder.get(Number(step?.device_id || 0));
      return otherOrder != null && otherOrder > myOrder;
    });
    return laterIndex >= 0 ? laterIndex : out.length;
  };
  for (const deviceId of members) {
    for (const command of refCommands) {
      const present = out.some(
        (step) => Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === command
      );
      if (!present) out.splice(insertIndexFor(deviceId, command), 0, powerStep(deviceId, command));
    }
  }
  return out;
}
function reconcileActivityPowerMacros(bundle, activityId, extraMemberIds = []) {
  return updateActivity(bundle, activityId, (activity) => {
    const selfId = Number(activity?.device?.device_id || 0);
    const memberSet = new Set(activityMemberDeviceIds(activity));
    for (const id of extraMemberIds) {
      const extraId = Number(id || 0);
      if (extraId > 0 && extraId !== selfId) memberSet.add(extraId);
    }
    const members = [...memberSet].sort((left, right) => left - right);
    const macros = [...activity.macros ?? []];
    const ensure = (buttonId, name, refCommands) => {
      const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === buttonId);
      const existing = index >= 0 ? macros[index] : null;
      if (!existing && members.length === 0) return;
      const steps = reconcilePowerMacroSteps(existing?.steps, members, refCommands);
      const next = {
        ...existing ?? {},
        button_id: buttonId,
        name: existing?.name ?? name,
        steps
      };
      if (index >= 0) macros[index] = next;
      else macros.push(next);
    };
    ensure(POWER_ON_MACRO_BUTTON_ID, "POWER_ON", [DEVICE_POWER_ON_REF_COMMAND, DEVICE_INPUT_REF_COMMAND]);
    ensure(POWER_OFF_MACRO_BUTTON_ID, "POWER_OFF", [DEVICE_POWER_OFF_REF_COMMAND]);
    return { ...activity, macros, referenced_source_device_ids: members };
  });
}
function reconcileActivityMembershipChange(before, after, activityId) {
  const aId = Number(activityId);
  const beforeActivity = (before.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId
  );
  const afterActivity = (after.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId
  );
  if (!afterActivity) return after;
  const beforeUsage = beforeActivity ? activityUsageDeviceIds(beforeActivity) : /* @__PURE__ */ new Set();
  const afterUsage = activityUsageDeviceIds(afterActivity);
  const lost = new Set([...beforeUsage].filter((deviceId) => !afterUsage.has(deviceId)));
  if (lost.size === 0) return reconcileActivityPowerMacros(after, aId);
  const pruned = updateActivity(after, aId, (activity) => ({
    ...activity,
    referenced_source_device_ids: (activity.referenced_source_device_ids ?? []).filter(
      (deviceId) => !lost.has(Number(deviceId))
    ),
    macros: (activity.macros ?? []).map((macro) => ({
      ...macro,
      steps: filterMacroSteps(
        macro.steps,
        (step) => isPowerRefStep(step) && lost.has(Number(step?.device_id || 0))
      )
    }))
  }));
  return reconcileActivityPowerMacros(pruned, aId);
}
function findBundleActivity(bundle, activityId) {
  return (bundle?.activities ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(activityId)
  );
}
function activityMemberViews(bundle, activityId) {
  const activity = findBundleActivity(bundle, activityId);
  if (!bundle || !activity) return [];
  const members = activityMemberDeviceIds(activity).filter((id) => !isHaActionDeviceId(bundle, id));
  const memberSet = new Set(members);
  const macroFor = (buttonId) => (activity.macros ?? []).find((macro) => Number(macro?.button_id || 0) === buttonId);
  const powerOn = macroFor(POWER_ON_MACRO_BUTTON_ID);
  const powerOff = macroFor(POWER_OFF_MACRO_BUTTON_ID);
  const order = [];
  const push = (value) => {
    const id = Number(value || 0);
    if (id > 0 && memberSet.has(id) && !order.includes(id)) order.push(id);
  };
  for (const step of powerOn?.steps ?? []) {
    if (!isMacroDelayStep(step) && isPowerRefStep(step)) push(step?.device_id);
  }
  for (const step of powerOff?.steps ?? []) {
    if (!isMacroDelayStep(step) && isPowerRefStep(step)) push(step?.device_id);
  }
  for (const id of members) push(id);
  return order.map((deviceId) => {
    const onSteps = (powerOn?.steps ?? []).filter(
      (step) => !isMacroDelayStep(step) && Number(step?.device_id || 0) === deviceId
    );
    const powersOn = onSteps.some(
      (step) => Number(step?.command_id || 0) === DEVICE_POWER_ON_REF_COMMAND
    );
    const inputStep = onSteps.find(
      (step) => Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND
    );
    const inputOrdinal = Number(inputStep?.duration || 0);
    const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === inputOrdinal);
    const powersOff = (powerOff?.steps ?? []).some(
      (step) => !isMacroDelayStep(step) && stepMatchesCommand(step, deviceId, DEVICE_POWER_OFF_REF_COMMAND)
    );
    return {
      deviceId,
      deviceName: deviceNameFor(bundle, deviceId),
      powersOn,
      inputOrdinal,
      inputCommandId: input?.commandId ?? null,
      inputCommandName: input?.name || (inputOrdinal > 0 ? `Input ${inputOrdinal}` : null),
      powersOff
    };
  });
}
function addActivityMemberDevice(bundle, activityId, deviceId) {
  const dId = Number(deviceId);
  const aId = Number(activityId);
  if (dId <= 0 || dId === aId || !findDevice(bundle, dId)) return bundle;
  const activity = findBundleActivity(bundle, aId);
  if (!activity) return bundle;
  if (activityMemberDeviceIds(activity).includes(dId)) return bundle;
  return reconcileActivityPowerMacros(bundle, aId, [dId]);
}
function findDevice(bundle, deviceId) {
  return (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
}
function inputEntryOrdinal(entry) {
  return Number(entry?.input_index ?? entry?.ordinal ?? 0);
}
function deviceInputEntries(bundle, deviceId) {
  const device = findDevice(bundle, deviceId);
  const entries = device?.input_record?.entries ?? [];
  return entries.map((entry) => ({
    commandId: Number(entry?.command_id || 0),
    ordinal: inputEntryOrdinal(entry),
    name: String(entry?.name || entry?.label || "").trim()
  })).filter((entry) => entry.commandId > 0).sort((left, right) => left.ordinal - right.ordinal);
}
function isPowerRefStep(step) {
  const command = Number(step?.command_id || 0);
  return command === DEVICE_INPUT_REF_COMMAND || command === DEVICE_POWER_ON_REF_COMMAND || command === DEVICE_POWER_OFF_REF_COMMAND;
}
function groupMacroSteps(steps) {
  const prefix = [];
  const groups = [];
  for (const step of steps ?? []) {
    if (isMacroDelayStep(step)) {
      if (groups.length === 0) prefix.push(step);
      else groups[groups.length - 1].trailing.push(step);
    } else {
      groups.push({ head: step, trailing: [] });
    }
  }
  return { prefix, groups };
}
function flattenMacroGroups(prefix, groups) {
  const out = [...prefix];
  for (const group of groups) out.push(group.head, ...group.trailing);
  return out;
}
function groupWait(group) {
  return group.trailing.length > 0 ? Number(group.trailing[0]?.delay || 0) : 0;
}
function activityMacroStepItems(bundle, activityId, buttonId) {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const head = group.head;
    const wait = groupWait(group);
    const deviceId = Number(head?.device_id || 0);
    const commandId = Number(head?.command_id || 0);
    const deviceName = deviceNameFor(bundle, deviceId);
    if (commandId === DEVICE_POWER_ON_REF_COMMAND || commandId === DEVICE_POWER_OFF_REF_COMMAND) {
      const verb = commandId === DEVICE_POWER_ON_REF_COMMAND ? "Power on" : "Power off";
      return { index, kind: "power", commandId, deviceId, label: `${verb} \xB7 ${deviceName}`, hold: 0, wait, protected: true };
    }
    if (commandId === DEVICE_INPUT_REF_COMMAND) {
      const ordinal = Number(head?.duration || 0);
      const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === ordinal);
      const inputLabel = input?.name || (ordinal > 0 ? `Input ${ordinal}` : "no input");
      return { index, kind: "input", commandId: input?.commandId ?? null, deviceId, label: `Input \xB7 ${deviceName}: ${inputLabel}`, hold: 0, wait, protected: true };
    }
    return {
      index,
      kind: "command",
      commandId,
      deviceId,
      label: `${deviceName} \xB7 ${commandNameOrFallback(bundle, deviceId, commandId)}`,
      hold: Number(head?.duration || 0),
      wait
    };
  });
}
var SHARED_BUTTON_CATALOG = [
  { code: 174, name: "Up", group: "Navigation" },
  { code: 178, name: "Down", group: "Navigation" },
  { code: 175, name: "Left", group: "Navigation" },
  { code: 177, name: "Right", group: "Navigation" },
  { code: 176, name: "OK", group: "Navigation" },
  { code: 180, name: "Home", group: "Navigation" },
  { code: 179, name: "Back", group: "Navigation" },
  { code: 181, name: "Menu", group: "Navigation" },
  { code: 182, name: "Volume Up", group: "Volume & Channel" },
  { code: 185, name: "Volume Down", group: "Volume & Channel" },
  { code: 184, name: "Mute", group: "Volume & Channel" },
  { code: 183, name: "Channel Up", group: "Volume & Channel" },
  { code: 186, name: "Channel Down", group: "Volume & Channel" },
  { code: 187, name: "Rewind", group: "Transport" },
  { code: 188, name: "Pause", group: "Transport" },
  { code: 189, name: "Forward", group: "Transport" },
  { code: 190, name: "Red", group: "Colour" },
  { code: 191, name: "Green", group: "Colour" },
  { code: 192, name: "Yellow", group: "Colour" },
  { code: 193, name: "Blue", group: "Colour" }
];
var X2_EXTRA_BUTTON_CATALOG = [
  { code: 153, name: "A", group: "Extra" },
  { code: 152, name: "B", group: "Extra" },
  { code: 151, name: "C", group: "Extra" },
  { code: 154, name: "Exit", group: "Extra" },
  { code: 155, name: "DVR", group: "Extra" },
  { code: 156, name: "Play", group: "Extra" },
  { code: 157, name: "Guide", group: "Extra" }
];
var BUTTON_NAME_BY_CODE = new Map(
  [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG].map((entry) => [entry.code, entry.name])
);
function bundleButtonCatalog(bundle) {
  if (normalizeHubVersion(bundle?.hub?.version) === "X2") {
    return [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG];
  }
  return [...SHARED_BUTTON_CATALOG];
}
function buttonName(code) {
  return BUTTON_NAME_BY_CODE.get(Number(code)) ?? `Button 0x${Number(code).toString(16).toUpperCase()}`;
}
function deviceNameFor(bundle, deviceId) {
  const device = (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  return String(device?.device?.name || "").trim() || `Device ${Number(deviceId)}`;
}
function commandNameOrFallback(bundle, deviceId, commandId) {
  return commandLabelFor(bundle, deviceId, commandId) || `Command ${Number(commandId)}`;
}
function sortBindingsByButtonId(rows) {
  return [...rows ?? []].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}
function deviceButtonBindingItems(bundle, deviceId) {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId);
  if (!device) return [];
  const items = [];
  for (const row of sortBindingsByButtonId(device.button_bindings)) {
    const buttonId = Number(row?.button_id || 0);
    const commandId = Number(row?.command_id || 0);
    if (buttonId <= 0 || commandId <= 0) continue;
    const item = {
      buttonId,
      buttonName: buttonName(buttonId),
      commandId,
      shortPressLabel: commandNameOrFallback(bundle, normalizedDeviceId, commandId)
    };
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpCommandId > 0) {
      item.longPress = {
        commandId: lpCommandId,
        label: commandNameOrFallback(bundle, normalizedDeviceId, lpCommandId)
      };
    }
    items.push(item);
  }
  return items;
}
function upsertBindingRow(rows, row) {
  const buttonId = Number(row.button_id || 0);
  const next = (rows ?? []).filter((entry) => Number(entry?.button_id || 0) !== buttonId);
  next.push(row);
  return sortBindingsByButtonId(next);
}
var ACTIVITY_ROLE_GROUPS = [
  "volume",
  "navigation",
  "playback",
  "channels"
];
var ROLE_GROUP_BUTTON_IDS = {
  volume: [182, 185, 184],
  navigation: [174, 178, 175, 177, 176, 179, 180, 181],
  playback: [156, 188, 187, 189],
  channels: [183, 186]
};
function roleGroupButtons(bundle, group) {
  const catalog = new Set(bundleButtonCatalog(bundle).map((entry) => entry.code));
  return ROLE_GROUP_BUTTON_IDS[group].filter((code) => catalog.has(code));
}
function deviceRoleBindings(bundle, deviceId, group) {
  const device = findDevice(bundle, Number(deviceId));
  const groupIds = new Set(roleGroupButtons(bundle, group));
  const byButton = /* @__PURE__ */ new Map();
  for (const row of device?.button_bindings ?? []) {
    const buttonId = Number(row?.button_id || 0);
    if (groupIds.has(buttonId) && Number(row?.command_id || 0) > 0) byButton.set(buttonId, row);
  }
  return byButton;
}
function activityRoleAssignments(bundle, activityId) {
  const activity = findBundleActivity(bundle, activityId);
  return ACTIVITY_ROLE_GROUPS.map((group) => {
    const buttons = roleGroupButtons(bundle, group);
    const totalCount = buttons.length;
    const groupSet = new Set(buttons);
    const bound = (activity?.button_bindings ?? []).filter(
      (row) => groupSet.has(Number(row?.button_id || 0)) && Number(row?.device_id || 0) > 0
    );
    const unused = {
      group,
      state: "unused",
      deviceId: null,
      deviceName: null,
      boundCount: 0,
      totalCount
    };
    if (!bundle || !activity || bound.length === 0) return unused;
    const selfId = Number(activity.device?.device_id || 0);
    const targetIds = /* @__PURE__ */ new Set();
    for (const row of bound) {
      targetIds.add(Number(row?.device_id || 0));
      const lpDeviceId = Number(row?.long_press_device_id || 0);
      if (lpDeviceId > 0) targetIds.add(lpDeviceId);
    }
    const [only] = [...targetIds];
    if (targetIds.size !== 1 || only === selfId) {
      return { group, state: "custom", deviceId: null, deviceName: null, boundCount: bound.length, totalCount };
    }
    const mapped = deviceRoleBindings(bundle, only, group);
    const exact = bound.length === mapped.size && bound.every((row) => {
      const ref = mapped.get(Number(row?.button_id || 0));
      if (!ref) return false;
      if (Number(row?.command_id || 0) !== Number(ref?.command_id || 0)) return false;
      const rowLp = Number(row?.long_press_command_id || 0);
      const refLp = Number(ref?.long_press_command_id || 0);
      if (rowLp !== refLp) return false;
      return rowLp === 0 || Number(row?.long_press_device_id || 0) === only;
    });
    return {
      group,
      state: exact ? "device" : "customized",
      deviceId: only,
      deviceName: deviceNameFor(bundle, only),
      boundCount: bound.length,
      totalCount
    };
  });
}
function setActivityRoleDevice(bundle, activityId, group, deviceId) {
  const aId = Number(activityId);
  const buttons = roleGroupButtons(bundle, group);
  const groupSet = new Set(buttons);
  const mapped = deviceId != null && Number(deviceId) > 0 ? deviceRoleBindings(bundle, Number(deviceId), group) : null;
  const next = updateActivity(bundle, aId, (activity) => {
    let rows = (activity.button_bindings ?? []).filter(
      (row) => !groupSet.has(Number(row?.button_id || 0))
    );
    if (mapped) {
      const dId = Number(deviceId);
      for (const buttonId of buttons) {
        const ref = mapped.get(buttonId);
        if (!ref) continue;
        const row = {
          button_id: buttonId,
          button_name: buttonName(buttonId),
          device_id: dId,
          command_id: Number(ref.command_id)
        };
        const lpCommandId = Number(ref?.long_press_command_id || 0);
        if (lpCommandId > 0) {
          row.long_press_device_id = dId;
          row.long_press_command_id = lpCommandId;
        }
        rows = upsertBindingRow(rows, row);
      }
    }
    return { ...activity, button_bindings: rows };
  });
  return reconcileActivityMembershipChange(bundle, next, aId);
}
var HA_ACTION_LIBRARY_TYPE = 28;
var HA_IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
function isHaActionHostEntry(entry) {
  return Boolean(entry?.ha_action_host);
}
function isHaActionDeviceId(bundle, deviceId) {
  return (bundle?.devices ?? []).some(
    (entry) => isHaActionHostEntry(entry) && Number(entry?.device?.device_id || 0) === Number(deviceId)
  );
}
function normalizeHaActionName(value) {
  return String(value ?? "").trim().replace(/_/g, " ");
}
function haActionCallbackPath(deviceId, name) {
  return `/launch/ha/${Number(deviceId)}/${encodeURIComponent(name)}/short`;
}
function asciiHexBytes(text) {
  const out = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 127) throw new Error(`non-ASCII character in callback text: ${text[index]}`);
    out.push(code);
  }
  return out;
}
function renderHaActionDataHex(target, path) {
  const text = `POST ${path} HTTP/1.1\r
Host:${target.host}:${target.port}\r
Content-Type:application/x-www-form-urlencoded\r
\r
`;
  const textBytes = asciiHexBytes(text);
  const ipBytes = target.host.split(".").map((part) => Number(part) & 255);
  const bytes = [
    ...ipBytes,
    target.port >> 8 & 255,
    target.port & 255,
    textBytes.length >> 8 & 255,
    textBytes.length & 255,
    ...textBytes
  ];
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
function haActionCommandCodeHex(commandId) {
  const code = 2e4 + (Number(commandId) & 255) & 281474976710655;
  const hex = code.toString(16).padStart(12, "0");
  return hex.replace(/(..)(?=.)/g, "$1 ");
}
function buildHaActionCommandRow(deviceId, commandId, name, target) {
  const path = haActionCallbackPath(deviceId, name);
  return {
    command_id: commandId,
    name,
    restore_data: {
      transport: "hub_code_record",
      library_type: HA_ACTION_LIBRARY_TYPE,
      command_code: haActionCommandCodeHex(commandId),
      data_hex: renderHaActionDataHex(target, path),
      decoded: {
        class: "wifi_ip",
        fields: {
          host: target.host,
          port: target.port,
          method: "POST",
          path,
          header: "",
          content_type: "application/x-www-form-urlencoded",
          body: ""
        },
        trailer_hex: "",
        edited: false
      }
    }
  };
}
function refreshHaActionCallback(bundle, deviceId, commandId) {
  if (!isHaActionDeviceId(bundle, deviceId)) return bundle;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((entry) => {
      if (!isHaActionHostEntry(entry) || Number(entry?.device?.device_id || 0) !== Number(deviceId)) {
        return entry;
      }
      return {
        ...entry,
        commands: (entry.commands ?? []).map((row) => {
          if (Number(row?.command_id || 0) !== Number(commandId)) return row;
          const decoded = row?.restore_data?.decoded;
          const host = String(decoded?.fields?.host || "");
          const port = Number(decoded?.fields?.port || 0);
          if (!HA_IPV4_PATTERN.test(host) || port <= 0) return row;
          const name = normalizeHaActionName(String(row?.name || ""));
          return buildHaActionCommandRow(Number(deviceId), Number(commandId), name, { host, port });
        })
      };
    })
  };
}

// custom_components/sofabaton_x1s/www/src/tabs/activity-diff.ts
var R2 = TOOLS_CARD_STRINGS.activities.review;
var POWER_ON_MACRO_BUTTON_ID2 = 198;
var POWER_OFF_MACRO_BUTTON_ID2 = 199;
var SECTION_ORDER = [
  "devices",
  "start",
  "buttons",
  "shortcuts",
  "end",
  "device_wide"
];
function diffActivityForReview(baseline, edited, activityId) {
  const buckets = {
    devices: [],
    start: [],
    buttons: [],
    shortcuts: [],
    end: [],
    device_wide: []
  };
  if (!baseline || !edited) return [];
  const baseMembers = activityMemberViews(baseline, activityId);
  const editMembers = activityMemberViews(edited, activityId);
  const baseById = new Map(baseMembers.map((member) => [member.deviceId, member]));
  const editById = new Map(editMembers.map((member) => [member.deviceId, member]));
  diffMembership(buckets, baseById, editById);
  diffStart(buckets, baseline, edited, activityId, baseById, editById);
  diffButtons(buckets, baseline, edited, activityId);
  diffShortcuts(buckets, baseline, edited, activityId);
  diffEnd(buckets, baseById, editById);
  diffDeviceWide(buckets, baseline, edited, editMembers);
  return SECTION_ORDER.map((section) => ({ section, entries: buckets[section] })).filter((group) => group.entries.length > 0);
}
var DEVICE_SECTION_ORDER = ["power", "buttons", "macros"];
function rawDeviceMacros(bundle, deviceId) {
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(deviceId)
  );
  const rows = /* @__PURE__ */ new Map();
  for (const macro of device?.macros ?? []) {
    const buttonId = Number(macro?.button_id || 0);
    if (buttonId > 0) rows.set(buttonId, macro);
  }
  return rows;
}
function macroStepsSignature(macro) {
  return JSON.stringify(macro?.steps ?? []);
}
function diffDeviceForReview(baseline, edited, deviceId) {
  const D = TOOLS_CARD_STRINGS.activities.deviceReview;
  const buckets = {
    power: [],
    buttons: [],
    macros: []
  };
  if (!baseline || !edited) return [];
  const idleBefore = deviceIdleBehavior(baseline, deviceId);
  const idleAfter = deviceIdleBehavior(edited, deviceId);
  if (idleBefore !== idleAfter) {
    const label = R2.idleShort[Number(idleAfter ?? 0)] ?? String(idleAfter);
    buckets.power.push({ text: D.powerControlChanged(label) });
  }
  const baseMacros = rawDeviceMacros(baseline, deviceId);
  const editMacros = rawDeviceMacros(edited, deviceId);
  for (const [buttonId, text] of [
    [POWER_ON_MACRO_BUTTON_ID2, D.powerOnChanged],
    [POWER_OFF_MACRO_BUTTON_ID2, D.powerOffChanged]
  ]) {
    if (macroStepsSignature(baseMacros.get(buttonId)) !== macroStepsSignature(editMacros.get(buttonId))) {
      buckets.power.push({ text });
    }
  }
  const isPower = (id) => id === POWER_ON_MACRO_BUTTON_ID2 || id === POWER_OFF_MACRO_BUTTON_ID2;
  for (const [buttonId, macro] of editMacros) {
    if (isPower(buttonId)) continue;
    const before = baseMacros.get(buttonId);
    const name = String(macro?.name || `Macro ${buttonId}`);
    if (!before) {
      buckets.macros.push({ text: D.macroAdded(name) });
      continue;
    }
    const renamed = String(before?.name || "") !== String(macro?.name || "");
    const stepsChanged = macroStepsSignature(before) !== macroStepsSignature(macro);
    if (renamed) buckets.macros.push({ text: D.macroRenamed(String(before?.name || ""), name) });
    if (stepsChanged) buckets.macros.push({ text: D.macroChanged(name) });
  }
  for (const [buttonId, macro] of baseMacros) {
    if (isPower(buttonId) || editMacros.has(buttonId)) continue;
    buckets.macros.push({ text: D.macroRemoved(String(macro?.name || `Macro ${buttonId}`)) });
  }
  const baseBindings = new Map(deviceButtonBindingItems(baseline, deviceId).map((item) => [item.buttonId, item]));
  const editBindings = new Map(deviceButtonBindingItems(edited, deviceId).map((item) => [item.buttonId, item]));
  for (const [buttonId, item] of editBindings) {
    const before = baseBindings.get(buttonId);
    const changed = !before || before.commandId !== item.commandId || (before.longPress?.commandId ?? null) !== (item.longPress?.commandId ?? null);
    if (changed) buckets.buttons.push({ text: D.bindingBound(item.buttonName, item.shortPressLabel) });
  }
  for (const [buttonId, item] of baseBindings) {
    if (!editBindings.has(buttonId)) buckets.buttons.push({ text: D.bindingCleared(item.buttonName) });
  }
  return DEVICE_SECTION_ORDER.map((section) => ({ section, entries: buckets[section] })).filter((group) => group.entries.length > 0);
}
function diffMembership(buckets, baseById, editById) {
  for (const [deviceId, member] of editById) {
    if (!baseById.has(deviceId)) buckets.devices.push({ text: R2.deviceAdded(member.deviceName) });
  }
  for (const [deviceId, member] of baseById) {
    if (!editById.has(deviceId)) buckets.devices.push({ text: R2.deviceRemoved(member.deviceName) });
  }
}
function diffStart(buckets, baseline, edited, activityId, baseById, editById) {
  for (const [deviceId, member] of editById) {
    const before = baseById.get(deviceId);
    if (!before) continue;
    if ((member.inputCommandId ?? null) !== (before.inputCommandId ?? null)) {
      buckets.start.push({
        text: member.inputCommandId != null && member.inputCommandName ? R2.inputChanged(member.deviceName, member.inputCommandName) : R2.inputCleared(member.deviceName)
      });
    }
  }
  const baseOrder = powerSequenceOrder(baseline, activityId);
  const editOrder = powerSequenceOrder(edited, activityId);
  if (baseOrder.length === editOrder.length && baseOrder.join(",") !== editOrder.join(",")) {
    buckets.start.push({ text: R2.startReordered });
  }
}
function powerSequenceOrder(bundle, activityId) {
  return activityMacroStepItems(bundle, activityId, POWER_ON_MACRO_BUTTON_ID2).map((step) => Number(step.deviceId ?? 0)).filter((id) => id > 0);
}
function diffButtons(buckets, baseline, edited, activityId) {
  const baseRoles = new Map(activityRoleAssignments(baseline, activityId).map((role) => [role.group, role]));
  const editRoles = new Map(activityRoleAssignments(edited, activityId).map((role) => [role.group, role]));
  for (const group of ACTIVITY_ROLE_GROUPS) {
    const before = baseRoles.get(group);
    const after = editRoles.get(group);
    if (!after) continue;
    const changed = !before || before.state !== after.state || (before.deviceId ?? null) !== (after.deviceId ?? null);
    if (!changed) continue;
    const label = R2.roleGroups[group] ?? group;
    if (after.state === "unused") {
      buckets.buttons.push({ text: R2.roleCleared(label) });
    } else if (after.state === "device" && after.deviceName) {
      buckets.buttons.push({ text: R2.roleNowControls(label, after.deviceName) });
    } else {
      buckets.buttons.push({ text: R2.roleCustomized(label) });
    }
  }
}
function shortcutIdentity(item) {
  if (item.kind === "favorite" && item.deviceId != null && item.commandId != null) {
    return `favorite:${item.deviceId}:${item.commandId}`;
  }
  return `${item.kind}:${item.buttonId}`;
}
function diffShortcuts(buckets, baseline, edited, activityId) {
  const base = activityQuickAccessItems(baseline, activityId);
  const edit = activityQuickAccessItems(edited, activityId);
  const baseById = new Map(base.map((item) => [shortcutIdentity(item), item]));
  const editById = new Map(edit.map((item) => [shortcutIdentity(item), item]));
  for (const [id, item] of editById) {
    if (!baseById.has(id)) buckets.shortcuts.push({ text: R2.shortcutAdded(item.label) });
  }
  for (const [id, item] of baseById) {
    if (!editById.has(id)) buckets.shortcuts.push({ text: R2.shortcutRemoved(item.label) });
  }
  for (const [id, item] of editById) {
    const before = baseById.get(id);
    if (before && before.label !== item.label) {
      buckets.shortcuts.push({ text: R2.shortcutRenamed(before.label, item.label) });
    }
  }
  const baseIds = base.map(shortcutIdentity);
  const editIds = edit.map(shortcutIdentity);
  if (baseIds.length === editIds.length && baseIds.length > 0 && [...baseIds].sort().join(",") === [...editIds].sort().join(",") && baseIds.join(",") !== editIds.join(",")) {
    buckets.shortcuts.push({ text: R2.shortcutsReordered });
  }
}
function diffEnd(_buckets, _baseById, _editById) {
}
function diffDeviceWide(buckets, baseline, edited, editMembers) {
  for (const member of editMembers) {
    const before = deviceIdleBehavior(baseline, member.deviceId);
    const after = deviceIdleBehavior(edited, member.deviceId);
    if (before !== after) {
      const label = R2.idleShort[Number(after ?? 0)] ?? String(after);
      buckets.device_wide.push({ text: R2.idleChanged(member.deviceName, label), global: true });
    }
  }
  for (const device of bundleDeviceOptions(edited)) {
    const deviceId = device.id;
    const before = new Map(deviceCommandItems(baseline, deviceId).map((cmd) => [cmd.commandId, cmd.label]));
    const after = deviceCommandItems(edited, deviceId);
    for (const cmd of after) {
      const prev = before.get(cmd.commandId);
      if (prev != null && prev !== cmd.label) {
        buckets.device_wide.push({ text: R2.commandRenamed(prev, cmd.label, device.label), global: true });
      }
    }
  }
}

// tests/frontend/activity-diff.test.ts
var ACTIVITY_ID = 101;
function baseBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { entry_id: "hub-1", name: "Living Room", version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "Television", device_class: "ir", sort: 1 },
        commands: [
          { command_id: 10, name: "Power" },
          { command_id: 11, name: "Volume Up" },
          { command_id: 12, name: "Input HDMI1" }
        ],
        button_bindings: [{ button_id: 176, command_id: 10, long_press_command_id: 11 }],
        input_record: { entries: [{ command_id: 12, input_index: 1, name: "Input HDMI1" }] }
      },
      {
        device: { device_id: 2, name: "Soundbar", device_class: "ir", sort: 2 },
        commands: [
          { command_id: 20, name: "Power" },
          { command_id: 21, name: "Volume Up" },
          { command_id: 22, name: "Volume Down" },
          { command_id: 23, name: "Mute" }
        ],
        button_bindings: [
          { button_id: 182, command_id: 21 },
          { button_id: 185, command_id: 22 },
          { button_id: 184, command_id: 23 }
        ]
      },
      {
        device: { device_id: 3, name: "Streamer", device_class: "ir", sort: 3 },
        commands: [
          { command_id: 30, name: "Home" },
          { command_id: 31, name: "Play" }
        ],
        button_bindings: []
      }
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity", sort: 1 },
        referenced_source_device_ids: [1, 2],
        favorite_slots: [
          { button_id: 1, device_id: 1, command_id: 10, name: "TV Power" },
          { button_id: 2, device_id: 2, command_id: 20, name: "Bar Power" }
        ],
        macros: [
          { button_id: 198, name: "POWER_ON", steps: [
            { device_id: 1, command_id: 198, button_code: 0, duration: 1, delay: 255 },
            { device_id: 1, command_id: 197, button_code: 0, duration: 1, delay: 255 },
            { device_id: 2, command_id: 198, button_code: 0, duration: 0, delay: 255 }
          ] },
          { button_id: 199, name: "POWER_OFF", steps: [
            { device_id: 1, command_id: 199, button_code: 0, duration: 0, delay: 255 }
          ] }
        ],
        button_bindings: [
          { button_id: 182, button_name: "Volume Up", device_id: 2, command_id: 21 },
          { button_id: 176, button_name: "OK", device_id: 1, command_id: 10 }
        ]
      }
    ]
  };
}
function sections(groups) {
  return groups.map((group) => group.section);
}
function allText(groups) {
  return groups.flatMap((group) => group.entries.map((entry) => entry.text)).join(" | ");
}
test("diffActivityForReview returns an empty list for an unchanged bundle", () => {
  const base = baseBundle();
  assert.deepEqual(diffActivityForReview(base, structuredClone(base), ACTIVITY_ID), []);
});
test("diffActivityForReview reports an added device under the Devices section", () => {
  const base = baseBundle();
  const edited = addActivityMemberDevice(base, ACTIVITY_ID, 3);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("devices"), true);
  assert.match(allText(groups), /Added "Streamer"/);
});
test("diffActivityForReview reports an added shortcut under the Shortcuts section", () => {
  const base = baseBundle();
  const edited = addBundleActivityFavorite(base, ACTIVITY_ID, 3, 31, "Play");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("shortcuts"), true);
  assert.match(allText(groups), /Added "Play"/);
});
test("diffActivityForReview reports a shortcut rename", () => {
  const base = baseBundle();
  const edited = renameBundleActivityFavorite(base, ACTIVITY_ID, 2, "Soundbar Power");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.match(allText(groups), /Renamed "Bar Power" → "Soundbar Power"/);
});
test("diffActivityForReview reports a shortcut reorder despite positional button_ids", () => {
  const base = baseBundle();
  const edited = structuredClone(base);
  const activity = edited.activities.find(
    (a3) => Number(a3.device?.device_id) === ACTIVITY_ID
  );
  activity.favorite_slots = [
    { button_id: 1, device_id: 2, command_id: 20, name: "Bar Power" },
    { button_id: 2, device_id: 1, command_id: 10, name: "TV Power" }
  ];
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.match(allText(groups), /Reordered/);
  assert.doesNotMatch(allText(groups), /Added|Removed/);
});
test("diffActivityForReview flags idle-behavior changes as device-wide/global", () => {
  const base = baseBundle();
  const edited = updateBundleDeviceIdleBehavior(base, 1, IDLE_BEHAVIOR_AUTO_OFF);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  const deviceWide = groups.find((group) => group.section === "device_wide");
  assert.ok(deviceWide, "expected a device_wide group");
  assert.equal(deviceWide.entries.every((entry) => entry.global === true), true);
  assert.match(allText(groups), /"Television" idle behavior/);
});
test("diffActivityForReview flags command renames as device-wide/global", () => {
  const base = baseBundle();
  const edited = renameBundleDeviceCommand(base, 1, 10, "Power Toggle");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  const deviceWide = groups.find((group) => group.section === "device_wide");
  assert.ok(deviceWide, "expected a device_wide group");
  assert.match(allText(groups), /Renamed command "Power" → "Power Toggle" on "Television"/);
});
test("diffActivityForReview reports a role reassignment under the Buttons section", () => {
  const base = baseBundle();
  const edited = setActivityRoleDevice(base, ACTIVITY_ID, "volume", 2);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("buttons"), true);
});
function deviceAllText(groups) {
  return groups.flatMap((group) => group.entries.map((entry) => entry.text)).join(" | ");
}
test("diffDeviceForReview returns an empty list for an unchanged bundle", () => {
  const base = baseBundle();
  assert.deepEqual(diffDeviceForReview(base, structuredClone(base), 1), []);
});
test("diffDeviceForReview reports idle-behavior changes under Power", () => {
  const base = baseBundle();
  const edited = updateBundleDeviceIdleBehavior(base, 1, IDLE_BEHAVIOR_AUTO_OFF);
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["power"]);
  assert.match(deviceAllText(groups), /Automatic power control/);
});
test("diffDeviceForReview reports binding changes under Buttons", () => {
  const base = baseBundle();
  const edited = structuredClone(base);
  edited.devices[0].button_bindings = [{ button_id: 176, command_id: 11 }];
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["buttons"]);
  assert.match(deviceAllText(groups), /"OK" now sends "Volume Up"/);
});
test("diffDeviceForReview reports cleared bindings under Buttons", () => {
  const base = baseBundle();
  const edited = structuredClone(base);
  edited.devices[0].button_bindings = [];
  const groups = diffDeviceForReview(base, edited, 1);
  assert.match(deviceAllText(groups), /"OK" no longer bound/);
});
test("diffDeviceForReview reports power sequence and macro edits", () => {
  const base = structuredClone(baseBundle());
  base.devices[0].macros = [
    { button_id: 198, name: "PWRON", steps: [] },
    { button_id: 30, name: "Movie Mode", steps: [] }
  ];
  const edited = structuredClone(base);
  edited.devices[0].macros[0].steps = [{ device_id: 1, command_id: 10, button_code: 0, duration: 0, delay: 255 }];
  edited.devices[0].macros[1].name = "Cinema Mode";
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["power", "macros"]);
  assert.match(deviceAllText(groups), /Power-on sequence updated/);
  assert.match(deviceAllText(groups), /Renamed macro "Movie Mode" → "Cinema Mode"/);
});

import type { TabId } from "./shared/ha-context";

// Localizable user-facing strings for the Sofabaton Control Panel card.
//
// English is the complete reference table. Translation tables are deep-partial
// overlays: missing values fall back to English, including regional locales
// (for example, "nl-BE" falls back to "nl").
//
// Deliberately keep protocol identifiers, Home Assistant service names,
// documentation URLs, hub-provided labels, and log contents out of this table.
export const TOOLS_CARD_STRINGS_EN = {
  common: {
    cancel: "Cancel",
    save: "Save",
    complete: "Complete",
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    homeAssistantUnavailable: "Home Assistant is not available",
    homeAssistantContextUnavailable: "Home Assistant context is unavailable",
    unknownError: "Unknown error",
    unknownErrorWithLogs: "Unknown error (check Home Assistant logs)",
    commandFallback: (id: number | string) => `Command ${id}`,
    buttonFallback: (id: number | string) => `Button ${id}`,
    deviceFallback: (id: number | string) => `Device ${id}`,
    activityFallback: (id: number | string) => `Activity ${id}`,
    macroFallback: (id: number | string) => `Macro ${id}`,
    favoriteFallback: (id: number | string) => `Favorite ${id}`,
    inputFallback: (id: number | string) => `Input ${id}`,
    noInput: "no input",
  },
  card: {
    connectivityAria: "Connectivity",
    hubShort: "HUB",
    appShort: "APP",
    brand: (version: string) => `SOFABATON CONTROL PANEL - v${version}`,
    wifiDeviceFallback: "Wifi device",
    wifiCommandFallback: "Wifi command",
    irLongPress: (device: string, command: string) => `${device} • ${command} (long press)`,
    irPress: (device: string, command: string) => `${device} • ${command}`,
    previewDescription: "Tools, cache, backups, logs & automations for your hub",
    editorHeight: "Card height",
    editorHeightHint: "Controls how much of the activity/device lists is visible. Default: 600 px.",
    pickerName: "Sofabaton Control Panel",
    pickerDescription:
      "A control panel for Sofabaton hub tools, cache, logs, settings, and Wi-Fi commands.",
  },
  docs: {
    wifiCommandsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    backupUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/backup.md",
  },
  tabs: {
    cache: "Hub",
    wifiCommands: "Automation",
    backup: "Backup",
    settings: "Settings",
    logs: "Logs",
  },
  tabDocs: {
    wifi_commands: "Automation documentation",
    backup: "Backup documentation",
  } satisfies Partial<Record<TabId, string>>,
  dock: {
    unsyncedChanges: "Unsynced changes — sync to the hub to apply them",
  },
  backend: {
    unavailableTitle: "Backend not available",
    unavailableCopy: "Waiting for the Sofabaton X integration to finish starting...",
    versionMismatchTitle: "Refresh required to update the Sofabaton Control Panel card",
    versionMismatchCopy:
      "This dashboard is still using an older cached version of the Sofabaton Control Panel card than the one now running in Home Assistant. Refresh or reopen the dashboard/browser before using the control panel again so the updated card can load.",
    backendExpects: "Backend expects",
    cardLoaded: "Card loaded",
    unknownVersion: "unknown",
    refreshingCache: "Refreshing cache...",
    hubCommandInProgress: "Hub command in progress...",
  },
  hubUnavailable: {
    title: "Hub unavailable",
    copy: "This hub is not connected, so the control panel is unavailable until the hub reconnects.",
  },
  availability: {
    operationRunning: "Operation running",
    working: "Working...",
    appConnectedOnlyLogs: "Only Logs is available while the Sofabaton app is connected.",
    hubCommandInProgress: "Hub command in progress...",
    refreshingCache: "Refreshing cache...",
    unavailable: "Unavailable",
    refreshDashboard: "Refresh the dashboard to load the updated Sofabaton Control Panel card.",
    automationUnavailable: "Automation unavailable",
    backupUnavailable: "Backup unavailable",
    automationBlockedByProxy:
      "Automation cannot be used while the Sofabaton app is connected to the hub through the proxy.",
    backupBlockedByProxy:
      "Backup cannot be used while the Sofabaton app is connected to the hub through the proxy.",
  },
  buttonNames: {
    0x97: "C",
    0x98: "B",
    0x99: "A",
    0x9a: "Exit",
    0x9b: "Dvr",
    0x9c: "Play",
    0x9d: "Guide",
    0xae: "Up",
    0xaf: "Left",
    0xb0: "Ok",
    0xb1: "Right",
    0xb2: "Down",
    0xb3: "Back",
    0xb4: "Home",
    0xb5: "Menu",
    0xb6: "Vol Up",
    0xb7: "Ch Up",
    0xb8: "Mute",
    0xb9: "Vol Down",
    0xba: "Ch Down",
    0xbb: "Rew",
    0xbc: "Pause",
    0xbd: "Fwd",
    0xbe: "Red",
    0xbf: "Green",
    0xc0: "Yellow",
    0xc1: "Blue",
    0xc6: "Power On",
    0xc7: "Power Off",
  } as Record<number, string>,
  errors: {
    backupProgressNoSocket: "Backup progress is unavailable without a websocket connection",
    logsNoSocket: "Live logs are unavailable without a websocket connection",
    wifiPressNoSocket: "Wifi press events are unavailable without a websocket connection",
    hubEventsNoSocket: "Hub events are unavailable without a websocket connection",
    anotherOperation: "Another hub operation is already running.",
    noHubSelected: "No hub selected.",
    noHubSelectedLong: "No hub is selected.",
    cacheRefreshFailed: "Cache refresh failed.",
    syncFailed: "Sync failed.",
    activityIdMissing: "The hub did not return the new activity id.",
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
    // Draft copy — tweak freely. Shown directly under the Persistent Cache row.
    hubClickActionTitle: "Hub Tab Clicks",
    hubClickActionDescription:
      "Choose what happens when you click a command, favorite, macro, or button in the Hub tab lists.",
    hubClickActionFooter: "GLOBAL",
    hubClickActionOptionNone: "Do nothing",
    hubClickActionOptionSend: "Send the command",
    hubClickActionOptionCopy: "Copy the command",
    hexLoggingTitle: "Hex Logging",
    hexLoggingDescription: "Log raw hex traffic between hub, integration, and app.",
    proxyTitle: "Proxy",
    proxyDescription: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
    wifiDeviceTitle: "WiFi Device",
    wifiDeviceDescription: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
    findRemoteTitle: "Find Remote",
    findRemoteDescription: "Make the remote beep so you can locate it.",
    syncRemoteTitle: "Sync Remote",
    syncRemoteDescription: "Push the latest configuration to the physical remote.",
  },
  cache: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    persistentCacheOffTitle: "Persistent cache is off",
    persistentCacheOffCopy:
      "Turn it on to browse cached activities and devices, and to unlock Backup workflows that depend on it.",
    enablingPersistentCache: "Enabling...",
    enablePersistentCache: "Enable persistent cache",
    activityFallback: (id: number) => `Activity ${id}`,
    deviceFallback: (id: number) => `Device ${id}`,
    favoriteFallback: (commandId: number) => `Favorite ${commandId}`,
    macroFallback: (commandId: number) => `Macro ${commandId}`,
    activityCounts: (favorites: number, macros: number, buttons: number) =>
      `${favorites} ${favorites === 1 ? "fav" : "favs"} / ${macros} ${macros === 1 ? "macro" : "macros"} / ${buttons} ${buttons === 1 ? "button" : "buttons"}`,
    deviceCommandCount: (count: number) =>
      `${count} ${count === 1 ? "cmd" : "cmds"}`,
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
    editDevice: "Edit device",
    changeOrder: "Change order",
    addActivity: "Add Activity",
    reorderSync: "Sync to hub",
    reorderCancel: "Cancel",
    reorderHint: "Drag activities into the desired order, then sync to the hub.",
    reorderDevicesHint: "Drag devices into the desired order, then sync to the hub.",
    reorderSyncing: "Writing the new order to the hub…",
    addActivityTitle: "Add Activity",
    addActivityBody: "Name the new activity. It is created on the hub and opened in the editor.",
    addActivityPlaceholder: "Activity name",
    addActivityCancel: "Cancel",
    addActivityConfirm: "Create",
    addActivityCreating: "Creating…",
    reorderingActivities: "Reordering activities…",
    reorderingDevices: "Reordering devices…",
    creatingActivity: "Creating activity…",
  },
  // Hub-tab row clicks ("send the command" / "copy the command" modes).
  hubClick: {
    notificationTitle: "🛠️ Automation Assist",
    contextActivity: "Activity",
    contextDevice: "Device",
    kindLabels: {
      favorite: "Favorite",
      macro: "Macro",
      button: "Button",
      command: "Command",
    } as Record<"favorite" | "macro" | "button" | "command", string>,
    lovelaceHeading: "Lovelace Button Code",
    lovelaceHint: "Copy this to your Dashboard YAML:",
    actionHeading: "Service Call (Automation)",
    actionHint: "Use this in your Scripts or Automations:",
    noRemoteEntity: "The hub's remote entity is unavailable.",
    copied: (label: string) => `Copied "${label}" to notifications.`,
    sendTooltip: "Click to send this command to the hub",
    copyTooltip: "Click to copy this command to a notification",
  },
  logs: {
    loading: "Loading log stream...",
    empty: "No log lines captured for this hub yet.",
    liveConsole: "Live Console",
  },
  cacheRefresh: {
    label: "Refresh all",
    running: "Refreshing…",
    starting: "Starting hub cache refresh…",
    working: "Reading your hub's configuration…",
    done: "Hub cache refreshed.",
  },
  progress: {
    homeAssistant: "Home Assistant",
    sofabatonHub: "Sofabaton Hub",
    working: "Working...",
    backupTitle: "Creating backup",
    restoreTitle: "Restoring backup",
  },
  backendState: {
    operationBackup: "Creating backup",
    operationRestore: "Restoring backup",
    operationCacheRefresh: "Refreshing hub cache",
    operationEntitySync: "Syncing with hub",
    operationWifiDeploy: "Syncing Wifi Commands",
    working: "Working…",
    step: (current: number, total: number) => `Step ${current} of ${total}`,
    backupPreparing: "Preparing backup…",
    backupDevice: (id: number) => `Backing up device ${id}…`,
    backupActivity: (id: number) => `Backing up activity ${id}…`,
    backupFinalizing: "Finalizing backup…",
    restoreValidating: "Validating backup…",
    restoreErasing: "Erasing the destination hub…",
    restoreDevice: (id: number) => `Restoring device ${id}…`,
    restoreActivity: (id: number) => `Restoring activity ${id}…`,
    restoreHub: "Restoring hub settings…",
    restoreCache: "Refreshing the restored hub cache…",
    cachePreparing: "Preparing hub cache refresh…",
    cacheDevice: (id: number) => `Refreshing device ${id}…`,
    cacheActivity: (id: number) => `Refreshing activity ${id}…`,
    cacheFinalizing: "Finalizing hub cache…",
    entityChecking: "Checking for changes on the hub…",
    entityWriting: "Applying changes to the hub…",
    entityRefreshing: "Refreshing the cached hub state…",
    entityComplete: "Synced to hub.",
    wifiSyncing: "Syncing Wifi Commands…",
  },
  activities: {
    loading: "Loading activities...",
    selectHub: "Select a hub to edit its activities.",
    activityFallback: (id: number) => `Activity ${id}`,
    // Guard panels (§4.1), rendered inside the editor view.
    appConnectedTitle: "The Sofabaton app is connected",
    appConnectedBody: "Close the Sofabaton app to edit the hub configuration.",
    operationRunningTitle: "Another operation is running",
    operationRunningBody: "Wait for the current backup, restore, or sync to finish, then try again.",
    // Capture flow (§4.2).
    captureTitle: "Reading your hub",
    captureMessage: "Reading your hub's configuration…",
    captureMessageWithStep: (current: number, total: number) =>
      `Reading your hub's configuration… (device ${current} of ${total})`,
    captureFailedTitle: "Couldn't read the hub",
    captureFailedBody: "The hub stopped responding before we finished reading it.",
    retry: "Retry",
    back: "Back",
    // Cache-sourced capture (blob-free structural bundle).
    capturingFromCache: (kind: "activity" | "device") => `Loading ${kind} from the hub cache…`,
    needsRefreshTitle: "Refresh the hub cache to edit",
    needsRefreshBody: (kind: "activity" | "device") =>
      `This ${kind} isn't in the local hub cache yet. Refresh the hub cache to load it into the editor. This may take a few minutes, depending on the size of your hub configuration.`,
    // Session restore banner (§4.6).
    // Live-mode edit header (§4.3). The header mirrors the Wifi command
    // editor: a single stateful Sync button (no dirty chip, no review/discard).
    syncToHub: "Sync to Hub",
    syncUpToDate: "Up to date",
    // Immediate entity delete (executed on the hub right away).
    deletingTitle: (kind: "activity" | "device") => `Deleting ${kind}`,
    deletingMessage: (kind: "activity" | "device") => `Removing this ${kind} from the hub…`,
    // Sync flow (§4.5).
    syncingTitle: "Syncing to your hub",
    syncingMessage: "Writing your changes to the hub…",
    wifiEventsPhaseMessage: "Deploying Wifi Events to the hub first… this can take a minute the first time.",
    syncSuccess: "Synced to hub.",
    syncPlanSummary: (count: number) => `${count} hub ${count === 1 ? "write" : "writes"}`,
    syncFailedTitle: "Sync didn't finish",
    syncFailedStep: (step: string) => `The hub stopped at: ${step}`,
    syncStaleTitle: (kind: "activity" | "device") => `This ${kind} changed on the hub`,
    syncStaleBody: (kind: "activity" | "device") =>
      `The ${kind} was edited on the hub since you loaded it, so your changes can't be safely applied. Reload the hub's current version to continue — your unsaved edits will be discarded.`,
    syncRetry: "Retry sync",
    syncReload: "Reload from hub",
    syncKeepEditing: "Keep editing",
    exitUnsyncedTitle: "Unsynced changes",
    exitUnsyncedBody: (kind: "activity" | "device") =>
      `This ${kind} has changes that have not been synced to the hub. Sync them now, or leave without syncing and discard the local edit.`,
    exitSyncNow: "Sync now",
    exitWithoutSync: "Leave without syncing",
    // Dismiss label reused by the sync-success / delete-error banners.
    discardConfirmCancel: "Keep editing",
    // Review-list section titles + entry templates (activity-diff.ts).
    review: {
      sectionDevices: "Devices",
      sectionStart: "When it starts",
      sectionButtons: "Buttons",
      sectionShortcuts: "Shortcuts",
      sectionEnd: "When it ends",
      sectionDeviceWide: "Device-wide changes",
      deviceAdded: (name: string) => `Added "${name}" to this activity.`,
      deviceRemoved: (name: string) => `Removed "${name}" from this activity.`,
      inputChanged: (device: string, input: string) => `"${device}" input changed to ${input}.`,
      inputCleared: (device: string) => `"${device}" input cleared.`,
      startReordered: "Start sequence reordered.",
      roleNowControls: (group: string, device: string) => `${group} now control "${device}".`,
      roleCustomized: (group: string) => `${group} customized.`,
      roleCleared: (group: string) => `${group} no longer assigned.`,
      shortcutAdded: (name: string) => `Added "${name}".`,
      shortcutRemoved: (name: string) => `Removed "${name}".`,
      shortcutRenamed: (oldName: string, newName: string) => `Renamed "${oldName}" → "${newName}".`,
      shortcutsReordered: "Reordered shortcuts.",
      idleChanged: (device: string, label: string) => `"${device}" idle behavior → ${label}.`,
      commandRenamed: (oldName: string, newName: string, device: string) =>
        `Renamed command "${oldName}" → "${newName}" on "${device}".`,
      roleGroups: {
        volume: "Volume buttons",
        navigation: "Navigation buttons",
        playback: "Playback buttons",
        channels: "Channel buttons",
      } as Record<string, string>,
      idleShort: {
        0: "not set",
        1: "turns off when idle",
        2: "never switches off",
        3: "stays on",
        4: "not managed by the hub",
      } as Record<number, string>,
    },
    // Review-list section titles + entry templates for the live *device*
    // editor (activity-diff.ts, diffDeviceForReview).
    deviceReview: {
      sectionPower: "On/Off",
      sectionNetwork: "Network",
      sectionButtons: "Buttons",
      sectionMacros: "Macros",
      powerControlChanged: (label: string) => `Automatic power control → ${label}.`,
      powerOnChanged: "Power-on sequence updated.",
      powerOffChanged: "Power-off sequence updated.",
      macroAdded: (name: string) => `Added macro "${name}".`,
      macroRemoved: (name: string) => `Removed macro "${name}".`,
      macroRenamed: (oldName: string, newName: string) => `Renamed macro "${oldName}" → "${newName}".`,
      macroChanged: (name: string) => `Edited macro "${name}".`,
      bindingBound: (button: string, command: string) => `"${button}" now sends "${command}".`,
      bindingCleared: (button: string) => `"${button}" no longer bound.`,
      ipChanged: (ip: string) => `IP address → ${ip}.`,
      ipCleared: "IP address cleared.",
    },
  },
  backup: {
    sectionMake: "Make",
    sectionEdit: "Edit",
    sectionRestore: "Restore",
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
    restoreCompletedTitle: "Restore completed",
    restoreCompletedSubtitle: "The selected Activities and Devices were restored to the hub.",
    restoreCompletedStatus: "Restore completed.",
    restoreCompletedSuccessfully: "Restore completed successfully.",
    backupCompletedSuccessfully: "Backup completed successfully.",
    wifiDeviceDeployedSuccessfully: "Wifi Device deployed successfully.",
    restoreRunningSubtitle: "The hub is restoring your backup.",
    restoreFinishedSubtitle: "Your restore has completed.",
    restoreChooseSubtitle:
      "Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on.",
    itemsToRestore: "Items to restore",
    eraseExisting: "Erase existing Devices and Activities",
    startRestore: "Start restore",
    startingBackup: "Starting backupâ€¦",
    startingRestore: "Starting restoreâ€¦",
    backupFailed: "Backup failed.",
    restoreFailed: "Restore failed.",
    backupInProgress: "Backup in progressâ€¦",
    restoreInProgress: "Restore in progressâ€¦",
    failedPrepareDownload: "Failed to prepare edited backup for download.",
    enterName: "Enter a name to continue.",
    renameDialogTitle: "Rename Hub",
    linked: "linked",
    hubNameRestoreOnlyAria: "Hub name is only applied at restore time when the user opts to wipe the hub.",
    entireHub: "Entire hub",
    selectedDevices: "Selected devices",
    devicesToInclude: "Devices to include",
    selectedCount: (count: number) => `${count} selected`,
    backupResultSummary: (activities: number, devices: number) =>
      `${activities} ${activities === 1 ? "Activity" : "Activities"} and ${devices} ${devices === 1 ? "Device" : "Devices"} backed up`,
    activityMeta: (favorites: number, macros: number) =>
      `${favorites} ${favorites === 1 ? "favorite" : "favorites"} · ${macros} ${macros === 1 ? "macro" : "macros"}`,
    linkedDevices: (count: number) =>
      `${count} linked ${count === 1 ? "device" : "devices"}`,
    deselectAll: "Deselect all",
    selectAll: "Select all",
    noDevicesAvailable: "No devices available.",
    working: "Working",
    startBackup: "Start backup",
    editLoadPrompt: "Load a backup file, then choose an Activity or Device to edit.",
    chooseBackupFile: "Choose backup file",
    reorderHint: " Drag the handle on any row to reorder Activities and Devices.",
    macroStepsSortableHelp:
      "Drag to reorder. Each step plays a command; set the wait that follows it on the right.",
    macroStepsHelp:
      "Each step plays a command; set the wait that follows it on the right.",
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
    deleteActivityTitle: (name: string) => `Delete activity "${name}"?`,
    deleteDeviceTitle: (name: string) => `Delete device "${name}"?`,
    deleteCommandTitle: (name: string) => `Delete command "${name}"?`,
    deleteFavoriteTitle: (name: string) => `Delete shortcut "${name}"?`,
    deleteMacroTitle: (name: string) => `Delete macro "${name}"?`,
    deleteCascadeIntro: "Removing this also clears its references elsewhere in the backup:",
    deleteSimpleBody: "This removes it from the loaded backup.",
    deleteImpactActivities: (count: number) =>
      `${count} ${count === 1 ? "activity references" : "activities reference"} it`,
    deleteImpactFavorites: (count: number) =>
      `${count} shortcut${count === 1 ? "" : "s"} will be removed`,
    deleteImpactMacroSteps: (count: number) =>
      `${count} sequence step${count === 1 ? "" : "s"} will be removed`,
    deleteImpactPowerSteps: (count: number) =>
      `${count} power sequence step${count === 1 ? "" : "s"} will be cleared`,
    deleteReplaceNote:
      'Deletions are applied to the hub only when "Erase existing Devices and Activities" is enabled during restore.',
    // Live-edit variants: deletions here act on the hub, not a backup file.
    deleteCascadeIntroLive: "Deleting this also removes its references on the hub:",
    deleteSimpleBodyLive: "This removes it.",
    deleteImmediateNote: "This is applied to the hub immediately.",
    deleteSyncNote: "This change is written to the hub on the next Sync.",
    deleteCancel: "Cancel",
    deleteConfirm: "Delete",
    deleteActivityAria: "Delete activity",
    deleteDeviceAria: "Delete device",
    deleteCommandAria: "Delete command",
    addFavoriteTitle: "Add command shortcut",
    addFavoriteDevice: "Device",
    addFavoriteCommand: "Command",
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
    bindingDialogEditTitle: (name: string) => `Edit ${name} binding`,
    bindingLongPressMeta: (label: string) => `Long press · ${label}`,
    deleteBindingTitle: (name: string) => `Delete ${name} binding?`,
    deleteBindingAria: "Delete binding",
    deleteImpactBindings: (count: number) =>
      `${count} button binding${count === 1 ? "" : "s"} will be cleared`,
    macrosTitle: "Macros",
    macrosDeviceSub: "Edit the command sequences this device plays, including its power on / off.",
    macroPowerChip: "on/off",
    // These headings name the hub's switching *behaviour*, not the electrical
    // supply. Translating the bare noun "Power" led every catalogue to the
    // wattage word (Voeding / Stromversorgung / Alimentación / Alimentation),
    // which reads as a PSU spec — or, in nl/es/fr, as nutrition. Keep the
    // English explicit so the behaviour is what gets translated.
    powerSetupTitle: "Power control",
    powerSetupDeviceSub:
      "How the hub switches this device on and off during Activities, and the commands it sends to do it.",
    powerSetupActivitySub: "The startup and shutdown sequence this Activity runs.",
    powerOnLabel: "Power-on sequence",
    powerOffLabel: "Power-off sequence",
    // Automatic-power dropdown (device only). One hub byte encodes the whole
    // "Power On/Off Setup" + "Idle Behavior" story, so it is one selector here.
    powerControlTitle: "Automatic power control",
    powerControlUnset: "Not captured",
    powerControlUnsetSub:
      "This backup predates power-control capture. Pick an option to set it, or restore as-is to keep the legacy value.",
    powerControlDisabled: "Don't control power",
    powerControlDisabledSub: "The hub never switches this device on or off. The sequences below are ignored.",
    powerControlAutoOff: "Turn off when idle",
    powerControlAutoOffSub: "Recommended. Powers the device off when no Activity needs it.",
    powerControlStayOn: "Stay on between Activities",
    powerControlStayOnSub: "Skips the wait to power back on; still turns off with the remote's Off button.",
    powerControlAlwaysOn: "Always stay on",
    powerControlAlwaysOnSub: "The hub powers it on but never switches it off automatically.",
    powerSequencesDisabledNote:
      "Power control is off, so these sequences aren't used. Switch it on above to edit them.",
    inputStepTitle: "Set input",
    inputStepCommand: "Input command",
    inputStepNone: "— no input —",
    macroStepsCount: (count: number) => `${count} step${count === 1 ? "" : "s"}`,
    noMacroSteps: "No steps yet.",
    addStep: "Add step",
    stepDialogAddTitle: "Add step",
    stepDialogEditTitle: "Edit step",
    stepDevice: "Device",
    stepCommand: "Command",
    stepHoldSeconds: "Hold (seconds, 0 = click)",
    holdLabel: (seconds: string) => `Hold ${seconds}s`,
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
    shortcutRenameAria: (kind: "macro" | "favorite") =>
      kind === "macro" ? "Rename macro" : "Rename shortcut",
    shortcutDeleteAria: (kind: "macro" | "favorite") =>
      kind === "macro" ? "Delete macro" : "Delete shortcut",
    powerSectionTitle: "Power control",
    powerActivitySub: "Each device the Activity uses powers on here. Pick its input and adjust the timing.",
    powerInputLabel: "Input",
    powerInputNone: "— none —",
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
    activityRemoveDeviceTitle: (name: string) => `Remove ${name} from this activity?`,
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
    roleCustomized: (name: string) => `${name} (customized)`,
    roleMappedNote: (bound: number, total: number) =>
      `${bound} of ${total} ${total === 1 ? "button" : "buttons"} mapped`,
    roleOptionNoMapping: (name: string) => `${name} — no button mapping`,
    roleMenuAria: (roleLabel: string) => `Choose a device for: ${roleLabel}`,
    roleConfirmTitle: "Replace custom button setup?",
    roleConfirmBody:
      "This group has button assignments that don't come from a single device's standard mapping. Assigning it here replaces them.",
    roleConfirmReplace: "Replace",
    roleConfirmCancel: "Cancel",
    customizeButtonsToggle: "Customize individual buttons",
    bindingsViewTitle: "Individual buttons",
    bindingsConfiguredCount: (count: number) => `${count} configured`,
    bindingsNoneConfigured: "None customized",
    // Unified "add to shortcuts" flow.
    addShortcutButton: "Add",
    addShortcutTitle: "Add to shortcuts",
    addShortcutKindLabel: "Type",
    shortcutKindCommand: "Device command",
    shortcutKindAction: "Macro",
    shortcutKindWifiEvent: "Wifi Event",
    macroTargetLabel: "Macro",
    macroTargetCreateNew: "Create new macro",
    macroTargetNoExisting: "No macros yet. Create one below.",
    wifiEventTargetLabel: "Wifi Event",
    wifiEventTargetCreateNew: "Create new Wifi Event…",
    wifiEventNameLabel: "Event name",
    wifiEventNameHelper: "The event is staged now and deployed to the hub when you press Sync; attach an action to it in Automation → Events.",
    wifiEventDeploying: "Staging the Wifi Event…",
    wifiEventNoneYet: "No Wifi Events yet. Create one below.",
    wifiEventNeedsSync: (name: string) => `${name} (needs sync)`,
    wifiEventCreateFailed: "Creating the Wifi Event failed — it stays staged and will retry on the next create.",
    wifiEventNameRequired: "Enter a name for the new Wifi Event.",
    wifiEventBindingLongPressNote: "Long press fires this event's long-press action. Configure it in Automation → Events.",
    addShortcutActionName: "Name",
    addShortcutActionHelper: "You'll pick the steps next.",
    addShortcutCommandHelper: "The shortcut shows up under the command's name.",
    unsaved: "Unsaved",
    unsavedTooltip: "You have unsaved changes. Download the backup to save them.",
    renameKind: (kind: "activity" | "device") => `Rename ${kind}`,
    managedWifiTitle: "Managed by Wifi Commands",
    managedWifiIntro: "This device was deployed from the Wifi Commands tab.",
    managedWifiBody:
      "Its commands, power, input, and button assignments are configured there â€” editing them here would be overwritten on the next sync.",
    managedWifiRename:
      "You can still rename it here; the new name stays in sync with your Wifi Commands configuration.",
    detailPower: "On/Off",
    detailNetwork: "Network",
    detailCommands: "Commands",
    detailButtons: "Buttons",
    detailSectionsAria: "Detail sections",
    editBindingAria: "Edit binding",
    editIpAria: "Edit IP address",
    networkDescription:
      "The device's IP address lives in the device record. The hub uses it to address the device at replay time (Host header for Hue / Sonos, base URL for Roku).",
    ipv4Description: "IPv4 dotted-decimal address",
    addCommand: "Add command",
    addCommandTitle: "Add Command",
    editPayloadTitle: "Edit Payload",
    commandsLiveHelp:
      "Use the pencil to rename a command and the braces to fetch its payload from the hub and edit it. Deleting commands stays in Backup â†’ Edit.",
    commandsBackupHelp:
      "Use the pencil to rename a command (names update everywhere it is referenced) and the braces to edit its payload.",
    newCommandChip: "new command",
    commandChip: "command",
    buttonChip: "button",
    ipChip: "ip",
    thisItem: "this item",
    noDeviceCommands: "This Device does not currently have any commands.",
    renameCommandAria: "Rename command",
    commandId: "Command ID",
    editPayloadAria: "Edit payload",
    fetchEditCommandAria: "Fetch and edit this command's payload",
    moveUpAria: "Move up",
    moveDownAria: "Move down",
    deviceClass: "Device class",
    name: "Name",
    nameHelper: "Shown on the remote and in every command picker.",
    verifyPayloadLive:
      "Verify a changed payload before saving: Test plays the current bytes on the hub without saving. Save folds the payload into the device's next Sync.",
    verifyPayloadBackup:
      "Verify a changed payload before trusting it: Test plays the bytes on the hub without saving. Save here only once the payload does what you expect.",
    test: "Test",
    sendingToHub: "Sending to the hubâ€¦",
    sentToHub: "Sent to the hub for one-shot playback.",
    testFailed: "Test failed.",
    rawPayload: "Raw payload",
    rawPayloadDescription:
      "No structured editor exists for this device class; the bytes below are replayed to the hub verbatim on restore.",
    payloadHex: "Payload (hex bytes)",
    payloadHexHelper: "Byte pairs like \"0a 4f 22\"; whitespace and 0x prefixes are tolerated.",
    rename: "Rename",
    renameActivity: "Rename Activity",
    renameDevice: "Rename Device",
    renameMacro: "Rename Macro",
    renameFavorite: "Rename Favorite",
    renameCommand: "Rename Command",
    ipAddress: "IP address",
    noPayloadReturned: "The hub returned no payload for this command.",
    noTemplateCommand:
      "This device has no commands to use as a template â€” add its first command with the Sofabaton app.",
    newCommandNameRequired: "Enter a name for the new command.",
    descriptiveIrRequired:
      "Enter a descriptive IR payload starting with P: (e.g. P:Sony12 R:40000 D:1 F:18).",
    payloadHexRequired:
      "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).",
    noFreeCommandSlot: "This device has no free command slot left.",
    nothingToTest: "Nothing to test yet.",
    ipv4Required:
      "Enter a dotted-decimal IPv4 address (e.g. 192.168.1.42), or clear the field to remove the IP.",
    steps: "Steps",
    buttonCatalog: {
      up: "Up",
      down: "Down",
      left: "Left",
      right: "Right",
      ok: "OK",
      home: "Home",
      back: "Back",
      menu: "Menu",
      volumeUp: "Volume Up",
      volumeDown: "Volume Down",
      mute: "Mute",
      channelUp: "Channel Up",
      channelDown: "Channel Down",
      rewind: "Rewind",
      pause: "Pause",
      forward: "Forward",
      red: "Red",
      green: "Green",
      yellow: "Yellow",
      blue: "Blue",
      exit: "Exit",
      dvr: "DVR",
      play: "Play",
      guide: "Guide",
      navigation: "Navigation",
      volumeChannel: "Volume & Channel",
      transport: "Transport",
      colour: "Colour",
      extra: "Extra",
      unknown: (code: string) => `Button 0x${code}`,
    },
    powerOn: "Power on",
    powerOff: "Power off",
    powerStepLabel: (verb: string, device: string) => `${verb} · ${device}`,
    inputStepLabel: (device: string, input: string) => `Input · ${device}: ${input}`,
    macroTargetLabelText: (name: string) => `Macro · ${name}`,
  },
  hub: {
    loading: "Loading…",
    unknown: "Unknown",
    connectionStatusAria: "Hub connection status",
    hubConnected: "Hub connected",
    hubNotConnected: "Hub not connected",
    appConnected: "App connected",
    appNotConnected: "App not connected",
    version: "Version",
    ipAddress: "IP Address",
    activities: "Activities",
    devices: "Devices",
    integrationVersion: "Integration version",
    firmwareVersion: (version: string | number) => `FW: v${version}`,
    productVersion: (version: string) => `Sofabaton ${version}`,
  },
  decodedPayload: {
    httpTitle: "HTTP request",
    httpSubtitle:
      "Edits replay through the hub's wifi_ip writer. Host, port, and Content-Length are derived; you do not set them here.",
    hostIpv4: "Host (IPv4)",
    hostExample: "e.g. 192.168.2.77",
    port: "Port",
    httpMethod: "HTTP method",
    httpMethodExample: "e.g. GET, POST",
    path: "Path",
    extraHeaders: "Extra headers",
    extraHeadersHelper: "One header per line. Host and Content-Length are added automatically.",
    contentType: "Content type",
    body: "Body",
    rokuTitle: "Roku ECP request",
    ecpPath: "ECP URL path",
    ecpPathExample: "e.g. /launch/12 or /keypress/Home",
    hueTitle: "Hue REST request",
    sonosTitle: "Sonos UPnP request",
    bodyBlockSubtitle: "Body block is injected verbatim between Host headers and the network write.",
    urlPath: "URL path",
    bodyBlock: "Body block (raw wire string)",
    bodyBlockHelper:
      "Single literal string sent to the device. Newlines are shown as \\n. You own the Content-Length value â€” it must match the body byte count.",
    irTitle: "Descriptive IR payload",
    irSubtitle:
      "Edits replay through the hub's descriptive-IR writer. Only descriptive-protocol payloads (P:â€¦ D:â€¦ F:â€¦) are decodable; raw learned-IR payloads are not editable here.",
    descriptor: "Descriptor",
    descriptorExample: "e.g. P:Sony12 R:40000 D:1 F:18 MUL:2",
    invalidObject: "Backup file must contain a JSON object.",
    invalidBundle: "Backup file is not a Sofabaton hub bundle.",
    invalidSchema: (expected: number, actual: unknown) =>
      `Backup file schema_version must be ${expected} (got ${String(actual)}).`,
    structuralBundle:
      "This file is a structural cache bundle (no command payloads); it cannot be edited or restored. Export a full backup instead.",
    missingArrays: "Backup file is missing devices or activities arrays.",
    missingSourceModel:
      "Backup file is missing its source hub model, so compatibility cannot be verified.",
    unknownDestinationModel:
      "The destination hub model is unknown, so restore compatibility cannot be verified.",
    incompatibleModels: (source: string, destination: string) =>
      `This backup was created on a Sofabaton ${source} hub and cannot be restored onto a Sofabaton ${destination} hub.`,
  },
  wifiCommands: {
    docsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    sectionLabel: "Wifi Devices",
    deployingTitle: "Deploying Wifi Commands",
    sectionSubtitle:
      "Use Wifi Commands to run Home Assistant Actions from buttons on your physical remote. Choose a Wifi Device to edit its command slots, or add a new one.",
    addDeviceButton: "Add",
    addDevice: "Add Wifi Device",
    deleteDeviceAria: "Delete Wifi Device",
    emptyDevices: "No Wifi Devices configured yet. Add one to start assigning command slots.",
    maximumDevices: "Maximum number of devices reached",
    configuredSlots: (count: number) => `${count} slot${count === 1 ? "" : "s"}`,
    unableSaveAction: "Unable to save Action",
    hubCommandInProgress: "Hub command in progress...",
    idle: "Idle",
    unableLoadSyncStatus: "Unable to load sync status",
    noTargetEntity: "No target entity",
    commandNameLeadingSpace: "Command name must start with a non-space character.",
    navigationGroup: "Navigation",
    transportGroup: "Volume & Channel",
    mediaGroup: "Playback",
    abcGroup: "ABC",
    colorGroup: "Color",
    inputCommand: "Input command",
    inputFor: (activity: string) => `Input for ${activity}`,
    activitySingular: "Activity",
    activityPlural: "Activities",
    unconfiguredCommand: "Unconfigured command",
    powerBothCommand: "Power ON and OFF command",
    powerOnCommand: "Power ON command",
    powerOffCommand: "Power OFF command",
    thisDevice: "this device",
    replacesOnButton: (slot: string) => `Replaces "${slot}" on this button`,
    replacesFromDevice: (slot: string, device: string) =>
      `Replaces "${slot}" from ${device}`,
    none: "None",
    commandSlotDescription:
      "Create a Command in this slot. Give it a name and decide which Activities to apply it to. The name will appear on your remote's display, in the mobile app, and as the Wifi Command's sensor status.",
    syncingDeviceFallback: "Syncing Wifi Device...",
    syncingDeviceNamed: (deviceName: string) => `Syncing ${deviceName}...`,
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
    deviceName: "Device name",
    createDeviceNameRequired: "Device name is required.",
    createDeviceFailed: "Unable to create Wifi Device",
    deleteDeviceBusy: "Deleting Wifi Device...",
    deleteDeviceFailed: "Unable to delete Wifi Device",
    createModalCancel: "Cancel",
    createModalCreate: "Create",
    deleteModalTitle: "Delete Wifi Device?",
    deleteModalBody: (deviceName: string) => `Delete "${deviceName}" from the hub and remove its saved command-slot configuration?`,
    deleteModalDelete: "Delete",
    clearSlotTitle: "Clear command slot?",
    clearSlotSubtitle: "Resets configuration.",
    clearSlotNo: "No",
    clearSlotYes: "Yes",
    makeCommand: "Make Command",
    noActionConfigured: "No Action configured",
    commandSlotTitle: (slotIndex: number) => `Command Slot ${slotIndex + 1}`,
    commandSlotActionTitle: (slotIndex: number) => `Command Slot ${slotIndex + 1} Action`,
    commandDisplayName: "Command Display Name",
    advanced: "Advanced",
    activityInput: "Perform this command when an Activity starts",
    activityInputHint: "The command is set as the Activity's input on the hub, so it runs during the Activity's startup sequence.",
    activityInputReplaces: (slotName: string, activityName: string) => `Replaces "${slotName}" when ${activityName} starts`,
    noActivitiesForHub: "No Activities available for this hub.",
    activityInputLabel: "Activity that performs this command",
    devicePowerOnLabel: "When the hub turns this device ON",
    devicePowerOffLabel: "When the hub turns this device OFF",
    devicePowerNothing: "Nothing",
    devicePowerHint: "Runs as part of this device's power sequence in your Activities. Synced to the hub.",
    devicePowerPerform: (commandName: string) => `perform ${commandName}`,
    hubEventsTitle: "Hub Events",
    hubEventsSubtitle: "Perform a Home Assistant Action when the hub changes state. These run in Home Assistant only and are never synced to the hub.",
    hubEventPowerOff: "When the hub is switched OFF",
    hubEventRedundantOff: "When OFF is pressed while the hub is already OFF",
    hubEventActivityStart: "When any Activity starts",
    hubEventActivityStops: "and when one stops",
    hubEventActivityStopModalTitle: "When any Activity stops",
    hubEventDoNothing: "do nothing",
    hubEventPerform: (service: string) => `perform ${service}`,
    hubEventClearTitle: "Reset to do nothing",
    hubEventModalNote: "Choose the Action to perform when this happens. Clear the Action to do nothing.",
    wifiCommandsTabLabel: "Wifi Commands",
    eventsTabLabel: "Events",
    wifiEventsTitle: "Wifi Events",
    wifiEventsSubtitle:
      "Events created from the activity editor. Pressing one on the remote fires its Home Assistant Action here (these also update the Wifi Commands sensor).",
    wifiEventsEmpty: "No Wifi Events yet. Create them from the activity editor's Add dialogs (shortcuts, buttons, and macro steps).",
    wifiEventRowPress: (name: string) => `When ${name} is pressed`,
    wifiEventRowLongPress: "and when it's long-pressed",
    wifiEventModalTitle: (name: string) => `When ${name} is pressed`,
    wifiEventLongModalTitle: (name: string) => `When ${name} is long-pressed`,
    wifiEventLongPressToggleTitle: "Enable long press",
    wifiEventNeedsSyncBadge: "needs sync",
    wifiEventRetrySync: "Retry sync",
    wifiEventDeleteTitle: "Delete Wifi Event",
    wifiEventDeleteConfirmTitle: (name: string) => `Delete "${name}"?`,
    wifiEventDeleteScanning: "Checking what references this event…",
    wifiEventDeleteNoRefs: "Nothing on the hub references this event.",
    wifiEventDeleteRefs: (favorites: number, bindings: number, steps: number) =>
      `The hub will also remove ${favorites} shortcut${favorites === 1 ? "" : "s"} and ${bindings} button assignment${bindings === 1 ? "" : "s"} that reference it, and the step is removed from ${steps} macro${steps === 1 ? "" : "s"} (a macro left with no steps is removed).`,
    wifiEventDeleteConfirm: "Delete",
    wifiEventDeleteFailed: "Deleting the Wifi Event failed.",
    activityEventsTitle: "Activity Events",
    activityEventsSubtitle:
      "Perform a Home Assistant Action when a specific Activity starts or stops. Switching between Activities stops the old one and starts the new one.",
    activityEventStarts: (name: string) => `When ${name} starts`,
    activityEventStops: "and when it stops",
    activityEventStartModalTitle: (name: string) => `When ${name} starts`,
    activityEventStopModalTitle: (name: string) => `When ${name} stops`,
    activityEventFallbackName: (id: string) => `Activity ${id}`,
    noActivitiesForEvents: "No Activities on this hub yet.",
    favorite: "Set as Favorite",
    physicalButtonAssignment: "Physical Button Assignment",
    enableLongPress: "Enable long-press",
    applyToActivities: "Apply to these Activities",
    actionModalNote:
      "Run an Action whenever the command is performed. Configuring an Action is optional; you can create your own automations that trigger from the Wifi Commands sensor.",
    shortPress: "Short press",
    longPress: "Long press",
    selectLongPressAction: "Select Long-Press Action",
    selectTriggeredAction: "Select Triggered Action",
    action: "Action",
    save: "Save",
    syncWarningTitle: "Sync commands to hub?",
    syncWarningBody:
      "This sync can run for several minutes. During this process, other interactions with the hub are blocked.",
    syncWarningBody2:
      "At the end of deployment, the physical remote will be force-resynced. It is recommended to finish your full Wifi Commands setup first, then sync once.",
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
      c: "C",
    } as Record<string, string>,
  },
} as const;

export type ToolsCardStrings = typeof TOOLS_CARD_STRINGS_EN;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer Args) => any
    ? (...args: Args) => string
    : T[K] extends string
      ? string
      : T[K] extends number
        ? number
        : T[K] extends boolean
          ? boolean
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

type DeepTranslation<T> = {
  [K in keyof T]-?: T[K] extends (...args: infer Args) => any
    ? (...args: Args) => string
    : T[K] extends string
      ? string
      : T[K] extends number
        ? number
        : T[K] extends boolean
          ? boolean
          : T[K] extends object
            ? DeepTranslation<T[K]>
            : T[K];
};

export type ToolsCardTranslation = DeepPartial<ToolsCardStrings>;
export type CompleteToolsCardTranslation = DeepTranslation<ToolsCardStrings>;

const TRANSLATIONS: Record<string, ToolsCardTranslation> = {};
let currentLanguage = "en";
let currentStrings: ToolsCardStrings = TOOLS_CARD_STRINGS_EN;

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, overlay: DeepPartial<T> | undefined): T {
  if (!isPlainObject(overlay)) return base;
  const out: any = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject((base as any)?.[key])) {
      out[key] = deepMerge((base as any)[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function resolveTranslation(language: string): ToolsCardTranslation | null {
  const lang = String(language || "").toLowerCase();
  if (!lang) return null;
  if (TRANSLATIONS[lang]) return TRANSLATIONS[lang];
  const base = lang.split(/[-_]/)[0];
  return base && TRANSLATIONS[base] ? TRANSLATIONS[base] : null;
}

/** Register or replace a control-panel translation table. */
export function registerToolsCardTranslation(
  language: string,
  translation: ToolsCardTranslation,
) {
  const lang = String(language || "").toLowerCase();
  if (!lang) return;
  TRANSLATIONS[lang] = translation;
  if (currentLanguage === lang || currentLanguage.split(/[-_]/)[0] === lang) {
    const active = resolveTranslation(currentLanguage);
    currentStrings = active
      ? deepMerge(TOOLS_CARD_STRINGS_EN, active)
      : TOOLS_CARD_STRINGS_EN;
  }
}

/**
 * Select the Home Assistant language. Returns true when the active language
 * changed so the host card can request a render.
 */
export function setToolsCardLanguage(language: unknown): boolean {
  const lang = String(language || "en").toLowerCase();
  if (lang === currentLanguage) return false;
  currentLanguage = lang;
  const translation = resolveTranslation(lang);
  currentStrings = translation
    ? deepMerge(TOOLS_CARD_STRINGS_EN, translation)
    : TOOLS_CARD_STRINGS_EN;
  return true;
}

/** The currently selected locale code, normalized to lowercase. */
export function toolsCardLanguage(): string {
  return currentLanguage;
}

function valueAtPath(path: PropertyKey[]): any {
  let value: any = currentStrings;
  for (const key of path) value = value?.[key as any];
  return value;
}

const proxyCache = new Map<string, any>();

function liveStringsProxy(path: PropertyKey[]): any {
  const cacheKey = path.map(String).join(".");
  const cached = proxyCache.get(cacheKey);
  if (cached) return cached;

  const proxy = new Proxy(() => undefined, {
    get(_target, property) {
      const value = valueAtPath([...path, property]);
      if (typeof value === "function" || isPlainObject(value)) {
        return liveStringsProxy([...path, property]);
      }
      return value;
    },
    apply(_target, _thisArg, args) {
      const value = valueAtPath(path);
      return typeof value === "function" ? value(...args) : undefined;
    },
    ownKeys() {
      const value = valueAtPath(path);
      return isPlainObject(value) ? Reflect.ownKeys(value) : [];
    },
    getOwnPropertyDescriptor(_target, property) {
      const value = valueAtPath(path);
      if (!isPlainObject(value) || !(property in value)) return undefined;
      return { configurable: true, enumerable: true };
    },
  });
  proxyCache.set(cacheKey, proxy);
  return proxy;
}

/**
 * Backwards-compatible live view of the active table. Nested references remain
 * live, so `const S = TOOLS_CARD_STRINGS.backup` also follows locale changes.
 */
export const TOOLS_CARD_STRINGS: ToolsCardStrings = liveStringsProxy([]);

/** Explicit accessor for new code and tests. */
export function toolsStr(): ToolsCardStrings {
  return TOOLS_CARD_STRINGS;
}

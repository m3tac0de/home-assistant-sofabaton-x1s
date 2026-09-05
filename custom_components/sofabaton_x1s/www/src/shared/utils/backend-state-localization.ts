import type { BackupProgressEvent } from "../ha-context";
import { TOOLS_CARD_STRINGS } from "../../strings";

type BackendOperation =
  | "backup_export"
  | "backup_restore"
  | "cache_refresh"
  | "entity_sync"
  | "wifi_deploy";

export type BackendErrorSurface = "device_create" | "ir_learn" | "ir_emissions" | "ir_convert";

/**
 * The `ir_payload/convert` rejection carries the refused protocol as its
 * message (e.g. `JVC (6)`, `NEC with 16 bits`). That is an identifier, not
 * prose, so it may be interpolated - but only when it looks like one.
 */
function conversionDetail(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = (value as Record<string, unknown>).message;
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return /^[A-Za-z0-9_ ()-]{1,40}$/.test(trimmed) ? trimmed : null;
}

type ProgressLike = Partial<BackupProgressEvent> & {
  current_step?: number | null;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedErrorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return /^[a-z][a-z0-9_.-]*$/.test(code) ? code : null;
}

/**
 * Pull a stable machine-readable code out of either one of our event payloads
 * or Home Assistant's WebSocket rejection shape. Prose is intentionally not
 * treated as a code: backend exception messages must never become UI copy.
 */
export function backendErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = value as Record<string, unknown>;
  const direct = normalizedErrorCode(error.error_code) ?? normalizedErrorCode(error.code);
  if (direct) return direct;
  return error.error && error.error !== value ? backendErrorCode(error.error) : null;
}

/**
 * Translate structured backend failures at the UI boundary. Unknown codes
 * use localized generic copy rather than leaking their English `message`.
 */
export function localizeBackendError(value: unknown, surface: BackendErrorSurface): string {
  if (surface === "device_create") {
    const code = backendErrorCode(value);
    if (code === "busy" || code === "another_operation") {
      return TOOLS_CARD_STRINGS.errors.anotherOperation;
    }
    if (code === "no_hub_selected") return TOOLS_CARD_STRINGS.errors.noHubSelectedLong;
    if (code === "not_found") return TOOLS_CARD_STRINGS.errors.selectedHubUnavailable;
    if (code === "device_id_missing") return TOOLS_CARD_STRINGS.errors.deviceIdMissing;
    if (code === "invalid_name") return TOOLS_CARD_STRINGS.errors.deviceNameInvalid;
    if (code === "unsupported_class") return TOOLS_CARD_STRINGS.errors.deviceTypeUnsupported;
    return TOOLS_CARD_STRINGS.errors.deviceCreateFailed;
  }

  const S = TOOLS_CARD_STRINGS.backup;
  if (surface === "ir_emissions") return S.learnHaUnavailable;
  if (surface === "ir_convert") {
    const code = backendErrorCode(value);
    if (code === "uc_hex_invalid") return S.ucHexInvalid;
    if (code === "uc_hex_unsupported_protocol" || code === "uc_hex_unsupported_bits") {
      return S.ucHexUnsupported(conversionDetail(value) ?? S.ucHexUnknownProtocol);
    }
    if (code === "uc_hex_unrepresentable") return S.ucHexUnrepresentable;
    if (code === "unavailable") return S.ucHexUnavailable;
    return S.ucHexFailed;
  }

  const event = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const state = String(event?.state || "").trim().toLowerCase();
  const code = backendErrorCode(value);
  if (
    state === "refused"
    || code === "ir_learn_refused"
    || code === "unavailable"
    || code === "busy"
    || code === "operation_locked"
  ) {
    return S.learnHubRefused;
  }
  if (code === "ir_learn_no_payload" || code === "no_payload") {
    return S.learnHubNoPayload;
  }
  return S.learnHubFailed;
}

function progressStep(progress: ProgressLike): string | null {
  const total = positiveInteger(progress.total_steps);
  if (!total) return null;
  const rawCurrent = Number(progress.current_step ?? progress.completed_steps ?? 0);
  const current = Math.min(total, Math.max(1, Number.isFinite(rawCurrent) ? Math.trunc(rawCurrent) : 1));
  return TOOLS_CARD_STRINGS.backendState.step(current, total);
}

/**
 * `phase` values the Wifi Commands deploy pipeline reports (hub.py's
 * `_set_command_sync_progress` calls) mapped to their string keys. Anything
 * missing here falls back to the hub's own English message, so adding a
 * pipeline stage degrades gracefully instead of going silent.
 */
type WifiPhaseKey =
  | "wifiStarting" | "wifiReadingDevice" | "wifiEnablingDevice" | "wifiDisablingDevice"
  | "wifiValidatingActivities" | "wifiCreatingDevice" | "wifiDeletingDevice"
  | "wifiAddingToActivities" | "wifiApplyingFavorites" | "wifiApplyingBindings"
  | "wifiRefreshingMaps" | "wifiResyncingRemote" | "wifiUpdatedInPlace"
  | "wifiAlreadyCurrent" | "wifiDeviceRemoved" | "wifiComplete";

/**
 * `step_kind` values the live entity-sync engine reports for its write walk
 * (proxy_activity_sync's `_progress_step_kind`) mapped to their string keys.
 * An unmapped kind falls back to the engine's English step label, then to
 * the generic "Applying changes" copy — a step kind added on one side
 * degrades gracefully instead of going silent.
 */
type EntityStepKey =
  | "entityStepActivityRename" | "entityStepBindingDelete" | "entityStepBindingWrite"
  | "entityStepCommandAdd" | "entityStepCommandDelete" | "entityStepCommandPayload"
  | "entityStepCommandRename" | "entityStepDeviceIp" | "entityStepDeviceRename"
  | "entityStepFavoriteAdd" | "entityStepFavoriteDelete" | "entityStepFavoriteOrder"
  | "entityStepIdleBehavior" | "entityStepInputsWrite" | "entityStepMacroDelete"
  | "entityStepMacroPowerOn" | "entityStepMacroPowerOff" | "entityStepMacroCustom"
  | "entityStepMemberReplay" | "entityStepRemoteSync";

export const ENTITY_SYNC_STEP_KINDS: Record<string, EntityStepKey> = {
  activity_rename: "entityStepActivityRename",
  binding_delete: "entityStepBindingDelete",
  binding_write: "entityStepBindingWrite",
  command_add: "entityStepCommandAdd",
  command_delete: "entityStepCommandDelete",
  command_payload: "entityStepCommandPayload",
  command_rename: "entityStepCommandRename",
  device_ip: "entityStepDeviceIp",
  device_rename: "entityStepDeviceRename",
  favorite_add: "entityStepFavoriteAdd",
  favorite_delete: "entityStepFavoriteDelete",
  favorite_order: "entityStepFavoriteOrder",
  idle_behavior: "entityStepIdleBehavior",
  inputs_write: "entityStepInputsWrite",
  macro_delete: "entityStepMacroDelete",
  macro_write_power_on: "entityStepMacroPowerOn",
  macro_write_power_off: "entityStepMacroPowerOff",
  macro_write_custom: "entityStepMacroCustom",
  member_replay: "entityStepMemberReplay",
  remote_sync: "entityStepRemoteSync",
};

/**
 * `step_kind` values the Wifi in-place deploy pipeline reports for its write
 * walk (wifi_inplace_plan steps, refined by `_progress_step_kind`), mapped to
 * their string keys. The command steps take the user's own command label via
 * `step_name`. Shortcut/binding kinds shared with the entity-sync engine
 * reuse its strings. Unmapped kinds fall back to the pipeline's English step
 * label, so both sides can grow independently.
 */
type WifiStepKey =
  | "wifiStepCommandAdd" | "wifiStepCommandPayload" | "wifiStepCommandRename"
  | "wifiStepCommandDelete" | "wifiStepPowerConfig" | "wifiStepInputConfig"
  | "wifiStepInputSelect" | "wifiStepActivityJoin" | "wifiStepActivityLeave"
  | "wifiStepHeadCommit" | "wifiStepBindingWrite"
  | "entityStepFavoriteAdd" | "entityStepFavoriteDelete" | "entityStepBindingDelete";

export const WIFI_INPLACE_STEP_KINDS: Record<string, WifiStepKey> = {
  command_add: "wifiStepCommandAdd",
  command_payload: "wifiStepCommandPayload",
  command_rename: "wifiStepCommandRename",
  command_delete: "wifiStepCommandDelete",
  wifi_power_config: "wifiStepPowerConfig",
  wifi_input_config: "wifiStepInputConfig",
  member_replay: "wifiStepInputSelect",
  member_replay_join: "wifiStepActivityJoin",
  membership_remove: "wifiStepActivityLeave",
  wifi_head_commit: "wifiStepHeadCommit",
  favorite_add: "entityStepFavoriteAdd",
  favorite_delete: "entityStepFavoriteDelete",
  binding_delete: "entityStepBindingDelete",
  binding_write: "wifiStepBindingWrite",
};

export const WIFI_DEPLOY_PHASES: Record<string, WifiPhaseKey> = {
  starting: "wifiStarting",
  reading_device: "wifiReadingDevice",
  enabling_device: "wifiEnablingDevice",
  disabling_device: "wifiDisablingDevice",
  validating_activities: "wifiValidatingActivities",
  creating_device: "wifiCreatingDevice",
  deleting_device: "wifiDeletingDevice",
  adding_to_activities: "wifiAddingToActivities",
  applying_favorites: "wifiApplyingFavorites",
  applying_bindings: "wifiApplyingBindings",
  refreshing_maps: "wifiRefreshingMaps",
  resyncing_remote: "wifiResyncingRemote",
  updated_in_place: "wifiUpdatedInPlace",
  already_current: "wifiAlreadyCurrent",
  device_removed: "wifiDeviceRemoved",
  complete: "wifiComplete",
};

function normalizeOperation(value: unknown): BackendOperation | null {
  const operation = String(value || "").trim().toLowerCase();
  if (operation === "backup_export") return "backup_export";
  if (operation === "backup_restore") return "backup_restore";
  if (operation === "cache_refresh") return "cache_refresh";
  if (operation === "activity_sync" || operation === "device_sync" || operation === "entity_sync") {
    return "entity_sync";
  }
  if (operation === "wifi_deploy" || operation === "command_sync") return "wifi_deploy";
  return null;
}

export function localizeBackendOperationLabel(operationValue: unknown): string {
  const S = TOOLS_CARD_STRINGS.backendState;
  switch (normalizeOperation(operationValue)) {
    case "backup_export": return S.operationBackup;
    case "backup_restore": return S.operationRestore;
    case "cache_refresh": return S.operationCacheRefresh;
    case "entity_sync": return S.operationEntitySync;
    case "wifi_deploy": return S.operationWifiDeploy;
    default: return TOOLS_CARD_STRINGS.availability.operationRunning;
  }
}

export function localizeBackendOperationDetail(
  operationValue: unknown,
  currentStep?: number | null,
  totalSteps?: number | null,
): string {
  const operation = normalizeOperation(operationValue);
  const step = progressStep({ current_step: currentStep, total_steps: totalSteps });
  if (step) return step;
  return operation === "wifi_deploy"
    ? TOOLS_CARD_STRINGS.backendState.wifiSyncing
    : TOOLS_CARD_STRINGS.backendState.working;
}

/**
 * Localize structured operational progress. Error events use the companion
 * `localizeBackendError` adapter above; logs and hub-provided labels remain
 * diagnostic data rather than translated UI copy.
 */
export function localizeBackendProgress(
  progress: ProgressLike | null | undefined,
  operationOverride?: BackendOperation,
): string {
  const S = TOOLS_CARD_STRINGS.backendState;
  if (!progress) return S.working;

  const operation = operationOverride ?? normalizeOperation(progress.kind);
  const phase = String(progress.phase || "").trim().toLowerCase();
  const deviceId = positiveInteger(progress.current_device_id);
  const activityId = positiveInteger(progress.current_activity_id);

  switch (operation) {
    case "backup_export":
      if (phase === "preparing") return S.backupPreparing;
      if (phase === "device" && deviceId) return S.backupDevice(deviceId);
      if (phase === "activity" && activityId) return S.backupActivity(activityId);
      if (phase === "finalizing" || phase === "completed" || phase === "complete") return S.backupFinalizing;
      break;
    case "backup_restore":
      if (phase === "validation") return S.restoreValidating;
      if (phase === "erase") return S.restoreErasing;
      if (phase === "device" && deviceId) return S.restoreDevice(deviceId);
      if (phase === "activity" && activityId) return S.restoreActivity(activityId);
      if (phase === "hub") return S.restoreHub;
      if (phase === "cache_warm") return S.restoreCache;
      break;
    case "cache_refresh":
      if (phase === "preparing") return S.cachePreparing;
      if (phase === "device" && deviceId) return S.cacheDevice(deviceId);
      if (phase === "activity" && activityId) return S.cacheActivity(activityId);
      if (phase === "finalizing" || phase === "completed" || phase === "complete") return S.cacheFinalizing;
      break;
    case "entity_sync": {
      if (phase === "stale_check" || phase === "plan") return S.entityChecking;
      if (phase === "writing") {
        const stepKey = ENTITY_SYNC_STEP_KINDS[String(progress.step_kind || "").trim().toLowerCase()];
        const entry = stepKey ? S[stepKey] : undefined;
        const stepLabel = typeof entry === "function"
          ? entry(positiveInteger(progress.step_device_id))
          : entry;
        // Unknown or absent step kind (older backend, new engine step):
        // the engine's own English label still beats the generic copy.
        const label = stepLabel
          || String(progress.message || "").trim()
          || S.entityWriting;
        // The write walk emits one step at a time (0-based, before the
        // write), so a compact counter shows the walk advancing.
        const total = positiveInteger(progress.total_steps);
        const rawCurrent = Number(progress.current_step ?? progress.completed_steps ?? NaN);
        if (total && Number.isFinite(rawCurrent)) {
          const current = Math.min(total, Math.max(1, Math.trunc(rawCurrent) + 1));
          return `${label} (${current}/${total})`;
        }
        return label;
      }
      if (phase === "settling") return S.entitySettling;
      if (phase === "cache_refresh") return S.entityRefreshing;
      if (phase === "completed" || phase === "complete") return S.entityComplete;
      break;
    }
    case "wifi_deploy": {
      const stage = WIFI_DEPLOY_PHASES[phase];
      if (stage) {
        // The in-place baseline read is the one long stage: it reports one
        // step per activity it reads off the hub. Append a compact,
        // language-neutral counter so it visibly advances instead of looking
        // hung on the phase label. Every other phase is a single step, where
        // a counter says nothing.
        if (stage === "wifiReadingDevice") {
          const total = positiveInteger(progress.total_steps);
          const rawCurrent = Number(progress.current_step ?? progress.completed_steps ?? 0);
          if (total && Number.isFinite(rawCurrent) && rawCurrent >= 1) {
            return `${S[stage]} (${Math.min(total, Math.trunc(rawCurrent))}/${total})`;
          }
        }
        return S[stage];
      }
      // The in-place planner's write steps have no fixed phase; they report
      // a structured step_kind (plus the user's own command label) that is
      // localized here. The pipeline's English label stays the fallback for
      // kinds this card does not know yet.
      const stepKey = WIFI_INPLACE_STEP_KINDS[String(progress.step_kind || "").trim().toLowerCase()];
      if (stepKey) {
        const entry = S[stepKey];
        const rawName = typeof progress.step_name === "string" ? progress.step_name.trim() : "";
        const label = typeof entry === "function" ? entry(rawName || null) : entry;
        // In-place step progress is already 1-based (current_step is set to
        // the step being written), unlike the entity-sync walk.
        const total = positiveInteger(progress.total_steps);
        const rawCurrent = Number(progress.current_step ?? progress.completed_steps ?? NaN);
        if (total && Number.isFinite(rawCurrent) && rawCurrent >= 1) {
          return `${label} (${Math.min(total, Math.trunc(rawCurrent))}/${total})`;
        }
        return label;
      }
      const message = String(progress.message || "").trim();
      if (message) return message;
      return progressStep(progress) || S.wifiSyncing;
    }
    default:
      break;
  }

  return progressStep(progress) || S.working;
}

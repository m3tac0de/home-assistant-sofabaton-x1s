import type {
  BackupProgressEvent,
  ControlPanelRuntimeState,
} from "../ha-context";
import { TOOLS_CARD_STRINGS } from "../../strings";

type BackendOperation =
  | "backup_export"
  | "backup_restore"
  | "cache_refresh"
  | "entity_sync"
  | "wifi_deploy";

type ProgressLike = Partial<BackupProgressEvent> & {
  current_step?: number | null;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function progressStep(progress: ProgressLike): string | null {
  const total = positiveInteger(progress.total_steps);
  if (!total) return null;
  const rawCurrent = Number(progress.current_step ?? progress.completed_steps ?? 0);
  const current = Math.min(total, Math.max(1, Number.isFinite(rawCurrent) ? Math.trunc(rawCurrent) : 1));
  return TOOLS_CARD_STRINGS.backendState.step(current, total);
}

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
 * Localize only structured operational progress. Backend exceptions, logs,
 * hub-provided labels, and unknown payloads deliberately remain outside this
 * adapter so diagnostic text is never mistranslated or hidden.
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
    case "entity_sync":
      if (phase === "stale_check" || phase === "plan") return S.entityChecking;
      if (phase === "writing") return S.entityWriting;
      if (phase === "cache_refresh") return S.entityRefreshing;
      if (phase === "completed" || phase === "complete") return S.entityComplete;
      break;
    case "wifi_deploy":
      return progressStep(progress) || S.wifiSyncing;
    default:
      break;
  }

  return progressStep(progress) || S.working;
}

export function localizeRuntimeOperation(runtime: ControlPanelRuntimeState): {
  label: string;
  detail: string;
} {
  return {
    label: localizeBackendOperationLabel(runtime.operation),
    detail: localizeBackendOperationDetail(
      runtime.operation,
      runtime.current_step,
      runtime.total_steps,
    ),
  };
}

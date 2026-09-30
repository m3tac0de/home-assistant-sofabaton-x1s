// Name rules and editor messages the edit-detail view shares with its hosts (R6, CR-F2-14).

import type { BackupBundlePayload } from "../../shared/ha-context";
import { hubSupportsUnicodeNames, sanitizeEntityName } from "../../shared/hub-names";
import { localizeBackendError } from "../../shared/utils/backend-state-localization";

// ── Name rules shared with the host ─────────────────────────────────
// The hub-rename dialog stays in backup-tab (it opens from the edit
// overview, outside any detail view), so the name-sanitizing rules are
// exported functions over the bundle instead of private methods.

// ── Name rules shared with the host ─────────────────────────────────
// The hub-rename dialog stays in backup-tab (it opens from the edit
// overview, outside any detail view), so the name-sanitizing rules are
// exported functions over the bundle instead of private methods.

export function bundleSupportsUnicodeNames(bundle: BackupBundlePayload | null): boolean {
  return hubSupportsUnicodeNames(bundle?.hub?.version);
}

/** Descriptive (`P:`) IR payloads are an X2-only hub capability. */
export function bundleIsX2(bundle: BackupBundlePayload | null): boolean {
  return String(bundle?.hub?.version || "").toUpperCase().includes("X2");
}

export function sanitizeBundleName(bundle: BackupBundlePayload | null, value: unknown): string {
  return sanitizeEntityName(bundle?.hub?.version, value);
}

/**
 * A failure's text for an editor status line. Our own code throws Errors
 * with localized messages; a hub or store refusal arrives as HA's
 * `{ code, message }` rejection and is localized by its code, never shown
 * as backend prose (CR-F2-1, L-T5).
 */
export function editorErrorMessage(error: unknown, surface: "hub_request" | "wifi_event"): string {
  if (error instanceof Error) return error.message;
  return localizeBackendError(error, surface);
}

export function useLegacyTextField(): boolean {
  return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
}

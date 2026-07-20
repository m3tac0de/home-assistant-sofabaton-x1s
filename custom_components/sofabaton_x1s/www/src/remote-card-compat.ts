// HA version-compat and hub-capability helpers shared by the remote card and
// its config editor (previously duplicated on both classes). Everything here
// is a pure function over (hass, config) or the custom-elements registry.

import type { HassLike } from "./remote-card-types";

/** Uppercased hub_version attribute of the configured remote entity ("" if unknown). */
export function hubVersionFor(hass: HassLike | null | undefined, entityId: unknown): string {
  const resolved = String(entityId || "").trim();
  if (!resolved) return "";
  return String(
    (hass?.states?.[resolved]?.attributes as Record<string, unknown> | undefined)?.hub_version || "",
  ).toUpperCase();
}

/** sofabaton_hub (the X2 integration) is always an X2; otherwise go by hub_version. */
export function isX2Hub(hubVersion: string, hubIntegration: boolean): boolean {
  if (hubIntegration) return true;
  return hubVersion.includes("X2");
}

// True for X1S and X2 hubs, which encode button labels as UTF-16-LE and
// therefore correctly display any Unicode character in the Sofabaton app.
// X1 hubs encode labels as ASCII (dropping non-ASCII), so umlauts would appear
// garbled in the app even though routing still works.
export function supportsUnicodeCommandNames(hubVersion: string, hubIntegration: boolean): boolean {
  return isX2Hub(hubVersion, hubIntegration) || hubVersion.includes("X1S");
}

export function sanitizeCommandName(value: unknown, allowUnicode: boolean): string {
  const pattern = allowUnicode ? /[^\p{L}\p{N} ]+/gu : /[^A-Za-z0-9 ]+/g;
  return String(value ?? "")
    .replace(pattern, "")
    .slice(0, 20);
}

// ---------- ha-select internals compat ----------
// Newer HA builds replace <mwc-list-item> inside <ha-select> with
// <ha-dropdown-item> (web-awesome based), which also renames the open/close
// events and matches options by label instead of value.

export function selectItemTagName(): string {
  return customElements.get("ha-dropdown-item")
    ? "ha-dropdown-item"
    : "mwc-list-item";
}

export function selectOpenEvents(): string[] {
  return customElements.get("ha-dropdown-item") ? ["wa-open"] : ["opened"];
}

export function selectCloseEvents(): string[] {
  return customElements.get("ha-dropdown-item") ? ["wa-close"] : ["closed"];
}

/** The string to assign to ha-select's value: ha-dropdown-item matches by label. */
export function selectValueCompat(
  value: unknown,
  options: Array<{ value?: unknown; label?: unknown }> = [],
): string {
  const resolvedValue = String(value ?? "");
  const useDropdownItems = Boolean(customElements.get("ha-dropdown-item"));
  if (!useDropdownItems) return resolvedValue;

  const selectedOption = options.find(
    (option) => String(option?.value ?? "") === resolvedValue,
  );
  return selectedOption
    ? String(selectedOption.label ?? selectedOption.value ?? "")
    : resolvedValue;
}

export function setSelectValueCompat(
  selectEl: { value?: string } | null | undefined,
  value: unknown,
  options: Array<{ value?: unknown; label?: unknown }> = [],
): void {
  if (!selectEl) return;
  selectEl.value = selectValueCompat(value, options);
}

/** Elements the card calls setConfig()/value on must be defined before render. */
export async function ensureHaElements(): Promise<void> {
  const dropdownItemTag = selectItemTagName();
  await Promise.all([
    customElements.whenDefined("hui-button-card"),
    customElements.whenDefined("ha-select"),
    customElements.whenDefined(dropdownItemTag).catch(() => {}), // optional
  ]);
}

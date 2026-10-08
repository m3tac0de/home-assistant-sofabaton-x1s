// Hold arbitration for the sidebar remote (docs/internal/sidebar-remote-plan.md).
//
// A held key means exactly one thing. The sidebar remote repeats the
// directional, volume and channel keys by default, like the physical
// remote; a hub long-press binding on the key overrides that (the
// dashboard card has the opposite precedence because hold-repeat is an
// explicit opt-in there). Everything else is a plain tap. Pure function;
// the pointer wiring lives in sidebar-press.ts.

export type SidebarHoldKind = "long-press" | "repeat" | "tap";

/** Spec keys that repeat while held when no long-press binding claims them. */
export const SIDEBAR_REPEAT_KEYS: ReadonlySet<string> = new Set([
  "up",
  "down",
  "left",
  "right",
  "volup",
  "voldn",
  "chup",
  "chdn",
]);

export function sidebarHoldKind(key: string, hasLongPressBinding: boolean): SidebarHoldKind {
  if (hasLongPressBinding) return "long-press";
  return SIDEBAR_REPEAT_KEYS.has(key) ? "repeat" : "tap";
}

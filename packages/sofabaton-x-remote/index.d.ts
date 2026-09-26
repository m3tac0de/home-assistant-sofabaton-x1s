// Types for sofabaton-x-remote: the Sofabaton remote card as a web
// component for your own dashboard, talking to sofabaton-x-server.
// Importing the package defines <sofabaton-remote> (a side effect).

export type SofabatonRemoteTheme = "inherit" | "light" | "dark";

export type SofabatonRemoteErrorCode =
  | "server_missing"
  | "server_unreachable"
  | "cross_origin_refused"
  | "mixed_content"
  | "hub_missing"
  | "hub_not_found"
  | "server_too_old";

export interface SofabatonRemoteReadyDetail {
  /** The hub id as the server spells it. */
  hub: string;
  /** The hub's name on the server, if it has one. */
  name: string | null;
}

export interface SofabatonRemoteErrorDetail {
  code: SofabatonRemoteErrorCode;
  /** The one-line notice the element shows. */
  message: string;
}

/**
 * `<sofabaton-remote hub="..." server="...">`. Attributes and properties
 * mirror each other; `config` is also settable as an object.
 */
export class SofabatonRemote extends HTMLElement {
  /** The hub id, in any MAC spelling. Required. */
  hub: string;
  /** The server's base URL without `/api/v1` (for example `http://nas:8480`). Required in this package. */
  server: string;
  /** `inherit` (default): the host page's CSS variables; `light` / `dark`: the Home Assistant palette. */
  theme: SofabatonRemoteTheme;
  /** BCP 47 language tag; defaults to the browser's. */
  lang: string;
  /** Open in device mode on this device id. */
  device: number | null;
  /** A layout override (the document the control panel stores); null uses the server's saved layout. */
  config: Record<string, unknown> | null;
  /** The hub id as the server spells it, once loaded. */
  readonly hubId: string | null;
  /** Re-run the theme fill-in after the host page changed its CSS variables. */
  refreshTheme(): void;
  /** Resolve the hub and load again (after the origin was listed or the server came back). */
  reload(): void;
}

/** The element's tag name. */
export const EMBED_TAG: "sofabaton-remote";

/** The oldest sofabaton-x-server this package works with. */
export const MIN_SERVER_VERSION: string;

declare global {
  interface HTMLElementTagNameMap {
    "sofabaton-remote": SofabatonRemote;
  }
  interface HTMLElementEventMap {
    "sofabaton-remote-ready": CustomEvent<SofabatonRemoteReadyDetail>;
    "sofabaton-remote-error": CustomEvent<SofabatonRemoteErrorDetail>;
  }
}

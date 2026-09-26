# sofabaton-x-remote

The Sofabaton remote card as a web component for your own dashboard.
`<sofabaton-remote>` talks directly to
[sofabaton-x-server](https://pypi.org/project/sofabaton-x-server/): it
switches activities, sends every key the hub maps, opens macros,
favourites and device mode, and follows the server's event stream, so a
key pressed on the physical remote shows up on your page.

It is the same card the Home Assistant integration ships. If your
dashboard *is* Home Assistant, use the HACS card instead.

## Setup in three steps

1. **List your dashboard's origin on the server.** Browser pages on
   another origin may only call the server when that origin is in its
   `allowed_origins` setting: control panel → Server settings → Access,
   or `--allowed-origin http://dash:3000`. Exact scheme, host and port,
   no path. The element tells you this, with the origin to add, when the
   server refuses it.
2. **Load the element.** Either bundle it:

   ```js
   import "sofabaton-x-remote";
   ```

   or, with no build step, from a CDN:

   ```html
   <script type="module" src="https://cdn.jsdelivr.net/npm/sofabaton-x-remote@0/dist/sofabaton-remote.js"></script>
   ```

   A server also serves its own copy at `<server>/ui/embed/sofabaton-remote.js`,
   which needs no `server` attribute and never gets out of step with it.
3. **Place it.**

   ```html
   <sofabaton-remote hub="e26a44861b45" server="http://nas:8480"></sofabaton-remote>
   ```

   The hub id is `hub_id` from `GET /api/v1/hubs` (the hub's MAC, any
   spelling). The layout is the one saved for that hub in the control
   panel (Remote → Layout).

## Attributes and properties

| attribute / property | meaning |
| --- | --- |
| `hub` (required) | hub id, any MAC spelling |
| `server` (required) | the server's base URL without `/api/v1` |
| `theme` | `inherit` (default), `light`, `dark` |
| `lang` | BCP 47 language tag; defaults to the browser's |
| `device` | open in device mode on this device id |
| `config` | a layout override as JSON (attribute) or an object (property); replaces the saved layout for this embed |

Methods: `refreshTheme()` re-runs the theme fill-in after your page
changed its variables; `reload()` resolves the hub and loads again.

Events (bubbling, composed): `sofabaton-remote-ready` with
`{hub, name}`, `sofabaton-remote-error` with `{code, message}` where the
code is one of `server_missing`, `server_unreachable`,
`cross_origin_refused`, `mixed_content`, `hub_missing`, `hub_not_found`,
`server_too_old`. The message is the one-line notice the element shows in
place of the card.

## Theme

By default the element inherits your page: it reads the Home Assistant
palette variables (`--primary-color`, `--primary-text-color`,
`--card-background-color`, `--divider-color`, ...) from where it sits and
fills in Home Assistant's defaults only for the ones you do not define.
Whether those defaults are the light or the dark set follows your page:
light text or a dark card background means dark. The `--rgb-*`
companions the card uses for tints are derived from your colours, so you
do not have to define them.

Two rules:

- **Define your variables before the element connects**, or call
  `refreshTheme()` after you change them: a value the element filled in
  stays until then.
- `theme="light"` or `theme="dark"` pins the whole Home Assistant palette
  instead, whatever the page defines.

The element sizes to its container and has no background of its own.

## Compatibility

The package declares the oldest server it works with
(`MIN_SERVER_VERSION`, `0.2.2`, the release that added `allowed_origins`)
and shows "server too old" below it. Newer servers are accepted.

## Limits

- **https page, http server:** the browser blocks the calls (mixed
  content). Put the server behind TLS (a reverse proxy, or its
  `--tls-cert`) and use the https address.
- **A public website calling a LAN server** is subject to Chrome's
  Private Network Access: the server answers the preflight, but the page
  must be https and Chrome asks the user for permission.
- The element is control-only: it never writes to the server and needs
  no token. Anyone who can open your page can use the remote.

## Licence

MIT. Bundles [Lit](https://lit.dev) (BSD-3-Clause) and the icon paths
from [@mdi/js](https://github.com/Templarian/MaterialDesign-JS)
(Pictogrammers Free License); see `THIRD_PARTY_NOTICES.md`.

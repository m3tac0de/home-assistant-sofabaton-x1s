# Web remote

For your first control test, follow [Getting started](getting-started.md#3-try-the-web-remote).
To edit hub configuration, see [Managing your hubs](managing-hubs.md).

## Open the remote

Use **Remote → Card** in the control panel, or open
`http://<server>:8480/ui/remote/` for a standalone remote. Choose a hub
and bookmark the resulting page. You can add it to a phone's home screen
or embed it in a dashboard that can display a URL, including Hubitat,
openHAB, Node-RED dashboards and Home Assistant's iframe card.

Use the remote to start activities, send commands and use favorites or
macros. Device mode lets you control an individual configured device.
Close the official Sofabaton app to let the server send commands.

## Customize the layout

Open **Remote → Layout** in the control panel for general options,
styling, default and per-activity or per-device layouts, and device
shortcuts. Choose which key groups appear, their order, hold-to-repeat
and key style. Drag the handles to reorder groups, or focus a handle and
use the arrow keys.

The preview updates as you edit and does not send commands to the hub.
**Save** stores the layout on the server for that hub; reload other open
web remotes to pick it up. It changes the browser remote's layout, not
the physical remote's button assignments.

**Reset to defaults** deletes the hub's stored layout. Unsaved edits are
local to the current view and are not retained after switching hubs or
reloading the page.

Enable **Show device names** in the favorites layout options to label
favorites with their device, useful when several devices have a command
with the same name. This is off by default (`show_favorite_device_names`
in the layout document).

## X2 number pad

On X2, a small dialpad button in the Direction Pad opens the number pad
when the selected activity or device has number keys bound. It includes
0–9, dash and Enter. Tap outside the pad to return to the direction keys.
Bound keys support their configured long-press assignments.

**Number pad** in the layout options controls its visibility per layout
(`show_numpad`, enabled by default). If the Direction Pad is hidden, the
number pad appears on its own. X1/X1S and selections without number-key
bindings do not show it. Assign keys through **Hub → Devices** or
**Hub → Activities**, synchronize, then return to the remote to use them.

## Dashboard links and display options

The page needs the hub in the URL: `/ui/remote/?hub=<hub id>`, the id
included in the link after selecting a hub. Without it, or with an unknown id, the page
lists the registered hubs as links. Optional parameters: `lang=<bcp47>`
(the card's language; the browser's by default), `device=<device id>`
(open in device mode on that device), `zoom=<factor>` for a wall panel,
and `theme=light|dark` to pin a theme (the system setting by default).
The page carries the Home Assistant default palette, so it looks like
the card on a default Home Assistant dashboard; other themes are not
available outside Home Assistant.

## Advanced layout options

The **JSON** editor remains available for custom favourites and advanced
options, or to paste the Home Assistant card's YAML converted to JSON.
Switching between editors preserves additional configuration keys.
The layout accepts the Home Assistant card's configuration keys except
`entity`, `theme` and Home Assistant actions. Custom favourites that call
a Home Assistant action are dropped; those that name a hub command stay.
For programmatic configuration, see the
[remote layout API](api-reference.md#web-remote-configuration).

**Icons.** The page bundles the icons the card itself uses plus a set of
common `mdi:` names for favourites and shortcuts; an icon outside that
set renders as a neutral dot.

## Network access

**The remote needs no token or sign-in**, also after you
[set up access](running-server.md#set-up-access). It only reads the hub's
state and uses control calls (start and stop an activity, send a
command), which stay free so a phone, wall panel or dashboard keeps
working with nothing to configure. Its layout is saved from the control
panel, which has your sign-in.

That also means anyone who can open the page can use the remote. Keep
the server on your trusted LAN, or put it behind a reverse proxy that
authenticates (see
[Behind a reverse proxy](running-server.md#behind-a-reverse-proxy-tls)); do not
port-forward it.

Framing the page in a dashboard needs no server setting. Only a page on
another origin that calls the server's API itself (a dashboard with its
own buttons, or the embeddable element below) needs that origin listed
in `allowed_origins`; see [Browser origins](running-server.md#browser-origins).

## Embed the remote in your own dashboard

Instead of framing the page, a dashboard can place the card itself: the
server serves the remote as a web component,
`<sofabaton-remote>`, that sizes to its container, inherits the page's
colours and talks to the server directly.

1. **List the dashboard's origin.** Add it under **Server settings →
   Access → Browser origins** (or `--allowed-origin http://dash:3000`):
   exact scheme, host and port, no path. Until it is listed, the element
   shows a notice naming the origin to add.
2. **Load the script** from the server, and place the element:

   ```html
   <script type="module" src="http://nas:8480/ui/embed/sofabaton-remote.js"></script>
   <sofabaton-remote hub="e26a44861b45"></sofabaton-remote>
   ```

   The hub id is `hub_id` from `GET /api/v1/hubs` (the MAC, any
   spelling); the element finds the server from the script's own URL.
   The layout is the one saved for the hub under **Remote → Layout**.

Attributes: `hub` (required), `theme` (`inherit`, the default, or
`light` / `dark` for the Home Assistant palette), `lang`, `device` (open
in device mode on that device id), `config` (a layout override as JSON),
and `server` to point at another server. It fires
`sofabaton-remote-ready` and `sofabaton-remote-error` (with a `code` and
the notice text) and has `refreshTheme()` and `reload()` methods. With
`theme="inherit"` the element uses the page's `--primary-color`,
`--primary-text-color`, `--card-background-color` and the other Home
Assistant palette variables where the page defines them and fills in
the defaults elsewhere, light or dark depending on the page's own text
and background colours. Define your variables before the element
connects, or call `refreshTheme()` after changing them.

For a dashboard with a build step there is the same element on npm as
[`sofabaton-x-remote`](https://www.npmjs.com/package/sofabaton-x-remote)
(`import "sofabaton-x-remote"`, then the element with a `server`
attribute); its README has the details. The server's own copy at
`/ui/embed/` never gets out of step with the server, so prefer it when
the dashboard can load a script from the server.

Two limits: an https dashboard cannot call an http server (the browser
blocks mixed content; put the server behind TLS), and a public website
calling a LAN server is subject to Chrome's Private Network Access
(the page must be https and the user is asked for permission). The
element is control-only and needs no token; anyone who can open the
dashboard can use the remote.

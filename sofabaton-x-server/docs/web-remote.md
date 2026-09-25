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

The server has no built-in authentication. Keep it on your trusted
LAN, or put it behind a reverse proxy that authenticates (see
[Behind a reverse proxy](running-server.md#behind-a-reverse-proxy-tls)); do not
port-forward it.

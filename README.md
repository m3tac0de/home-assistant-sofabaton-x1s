# Sofabaton X - Home Assistant Custom Integration

Bi-directional control of your Sofabaton **X1**, **X1S** and **X2** hub, from Home Assistant, using **100% local APIs**.

[![HACS Badge](https://img.shields.io/badge/HACS-Default-green.svg)](https://github.com/hacs/integration)
![Version](https://img.shields.io/github/v/release/m3tac0de/home-assistant-sofabaton-x1s) ![Total Downloads](https://img.shields.io/github/downloads/m3tac0de/home-assistant-sofabaton-x1s/latest/total)

> This integration is powered by a [standalone Python library](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofabaton-x) for the Sofabaton hub protocol.  
> It is also available on [PyPI](https://pypi.org/project/sofabaton-x/).

## Start here

- 🚀 **Quick start**: install + add your hub
- 🕹️ **Dashboard cards**: Sofabaton Virtual Remote & Sofabaton Control Panel
- 🤖 **Home Assistant → Sofabaton**: send commands with `remote.send_command` or the Sofabaton Virtual Remote; find the required IDs using Virtual Remote key capture or the Control Panel.
- ⚡ **Sofabaton → Home Assistant**: turn physical remote button presses into Home Assistant Actions with **Automation → Wifi Commands**; see the [`Wifi Commands guide`](docs/wifi_commands.md).
- 🔄 **Fully local backup and restore**: "Backup" via the Control Panel card, see [`docs/backup.md`](docs/backup.md)
- 💾 **Store, share and generate IR codes**: command payloads via the Hub tab's device editor, see [`docs/command_payloads.md`](docs/command_payloads.md)
- 🌐 **Networking / VLANs / ports / iOS quirks**: see [`docs/networking.md`](docs/networking.md)
- 🪵 **Useful logs & diagnostics**: see [`docs/logging.md`](docs/logging.md)

---

## 🚀 Quick start

⚠️ **Make sure the Sofabaton app is not connected to the hub during installation.**

1. **Install via HACS** (recommended) or manually (see Installation).
2. **Restart Home Assistant**.
3. **Add your hubs**

   Go to **Settings → Devices & Services**.
   - Your Sofabaton hubs appear at the top of the page, shortly after HA has fully started. **Add** them and follow the flow.
   - If automatic discovery fails (VLAN / mDNS), see [networking docs](docs/networking.md) or add manually.
   - To add manually:  
      Go to **Settings → Devices & Services → Add integration** → search **Sofabaton X** and follow the flow.

### X2 discovery

X2 hubs are discovered automatically, just like X1 and X1S. To opt out, add this to
`configuration.yaml` and restart HA:

```yaml
sofabaton_x1s:
  enable_x2_discovery: false
```

---

## 🔌 What this integration does

This integration establishes a direct and sustained connection with a Sofabaton hub, leveraging APIs intended for the Sofabaton app.
Sofabaton hubs allow **only one client connection at a time**. To enable this integration and using the app at the same time, this integration works by acting as a **local proxy**:

1. connects to your _real_ hub (physical device)
2. exposes a _virtual_ hub so the **official Sofabaton app** can still connect
3. lets Home Assistant send commands reliably via a single “writer” at a time

When the official app is connected to the proxy, HA entities that can send commands become **unavailable** (intentional: prevents competing writes and weird app behavior).

---

## ✨ Features

- 🛰 **X1, X1S, and X2 support** — automatic discovery and support for multiple hubs.
- 🔌 **Home Assistant and the Sofabaton app together** — the built-in local proxy lets the official app share hub access with Home Assistant.
- 🖥️ **Live hub editing** — manage Activities, Devices, commands, button assignments, power behavior, shortcuts, and macros from the Control Panel.
- ⚙️ **Home Assistant → Sofabaton** — send device commands, start or switch Activities, and power off the hub.
- 💎 **Sofabaton → Home Assistant** — respond to physical remote buttons, Hub Events, and Activity Events with Home Assistant Actions or your own automations.
- 🔄 **Local backup and restore** — restore a whole hub or selected Devices, including supported moves to newer hub models. See the [`backup guide`](docs/backup.md).
- 💾 **Command payload tools** — retrieve, test, edit, generate, save, and share IR command payloads. See the [`command payload guide`](docs/command_payloads.md).
- 🧰 **Maintenance and diagnostics** — persistent cache, live hub logs, Find Remote, and configurable network listeners and ports.

---

## ✅ Requirements

- Home Assistant **2026.x** or newer
- A Sofabaton **X1**, **X1S** or **X2** hub
- HA must be able to **open TCP ports** (hub connects back to the proxy)
- HA must be able to **open UDP ports** (optional; only if you want the official app to connect while HA is running)

> **Networking guide:** VLANs, firewalls, containers, iOS/Android discovery quirks → [`docs/networking.md`](docs/networking.md)

---

## 🔧 Installation

⚠️ **Make sure the Sofabaton app is not connected to the hub during installation.**

### Option 1 – HACS (recommended)

1. Open **HACS**
2. Search **Sofabaton X** and install
3. **Restart Home Assistant**
4. Go to **Settings → Devices & Services**
5. If discovered, click **Add/Configure**  
   If not: **Add integration** → search **Sofabaton X** → enter IP manually

### Option 2 – Manual

1. Create: `config/custom_components/sofabaton_x1s/`
2. Copy the contents of `custom_components/sofabaton_x1s/` from this repo into that folder
3. **Restart Home Assistant**
4. Add via **Settings → Devices & services**

---

## 📋 Entities you’ll get

> This documentation uses markup such as `select.<hub>_activity`, where `<hub>` is your hub's name as configured in Home Assistant — for example, `select.living_room_activity`.

- **Remote**:
  - `remote.<hub>_remote`  
    Used for automations (`remote.send_command`). Unavailable while the official app is connected to the proxy.

- **Select**:
  - `select.<hub>_activity`  
    Options = `Powered off` + all activities. Selecting activates it. Unavailable while app is connected.

- **Switches**
  - `switch.<hub>_proxy_enabled`  
    Enables/disables proxy advertising + UDP binding (does not interrupt active sessions).
  - `switch.<hub>_hex_logging`  
    Enables deep protocol logging for diagnostics (see logging docs).
  - `switch.<hub>_wifi_device`  
    Enables/disables the listener for Wifi Commands. Disabled by default, enabled automatically when deploying Wifi Commands to the hub.

- **Sensors**
  - `binary_sensor.<hub>_hub_connected` (is the hub connected/disconnected to the integration)
  - `binary_sensor.<hub>_app_connected` (is the official app connected to the proxy)
  - `sensor.<hub>_activity` (current activity; stays accurate regardless of where it changed, **always available**)
  - `sensor.<hub>_recorded_keypress` (ready-to-copy replay payloads from app button presses)
  - `sensor.<hub>_index` (diagnostic: activities/devices/commands/macros/favorites)
  - `sensor.<hub>_wifi_commands` (updates on Wifi Command key presses)

- **Buttons**
  - `button.<hub>_find_remote`
  - `button.<hub>_resync_remote` (triggers a configuration re-sync of the physical remote)
  - `button.<hub>_volume_up`, `button.<hub>_mute`, … (dynamic availability by activity)

- **Text**
  - `text.<hub>_ip_address` (disabled by default)  
    Editable hub IP stored in config. Useful when you must pin or override the hub IP.

---

## 🕹️ Dashboard card - Sofabaton Virtual Remote

This integration includes the **Sofabaton Virtual Remote** Lovelace card.

- Repo + docs: https://github.com/m3tac0de/sofabaton-virtual-remote
- The card is designed to work with **this integration** and the **official X2 integration**.

> This integration auto-deploys the card. You DO NOT have to install it separately.
> The card is also available as a separate HACS frontend plugin.
> This integration automatically stops deploying the card as soon as it detects that the card is installed through HACS (a reboot of Home Assistant is required).

<img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-01.png" width="220"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-02.png" width="220"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-03.png" width="220">

## 🖥️ Dashboard card — Sofabaton Control Panel

The **Sofabaton Control Panel** is bundled with the integration and is its main interface for hub configuration, automation hooks, backups, and diagnostics. When multiple hubs are configured, use the selector in the card header to choose which hub to manage.

Find it in the dashboard card picker, or add it manually:

```yaml
type: custom:sofabaton-control-panel
card_height: 700
```

### What the tabs do

- **Hub** — browse and refresh Activities and Devices. Create, edit, reorder, or delete them; manage Activity membership, inputs, power sequences, button assignments, shortcuts and macros; and edit Device power behavior, commands, IP addresses, and command payloads. See the [`command payload guide`](docs/command_payloads.md).
- **Automation** — configure **Wifi Commands** that respond to physical remote buttons, or attach Home Assistant Actions to **Hub Events** and **Activity Events**. See the [`Wifi Commands and Events guide`](docs/wifi_commands.md).
- **Backup** — create whole-hub or selected-Device backups, edit backup files offline, and selectively restore content to the same hub or a supported newer model. See the [`backup guide`](docs/backup.md).
- **Settings and Logs** — manage persistent cache, proxy and Wifi listener settings, diagnostic logging, Find Remote, and physical remote sync; inspect live hub logs when troubleshooting.

Live edits are reviewed before syncing. The card also prevents conflicting writes while the Sofabaton app or another hub operation is active.

<img height="250" alt="Control Panel: Hub tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/control-panel-hub-tab.png" /> <img height="250" alt="Control Panel: Automation, Wifi Commands sub-tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/wifi-commands-devices.png" /> <img height="250" alt="Control Panel: Automation, Events sub-tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/automation-events.png" /> <img height="250" alt="Control Panel: Backup, Make sub-tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/control-panel-backup-tab.png" />

---

## ⚡ Automations — Sofabaton → Home Assistant

Turn physical remote button presses and hub events into Home Assistant Actions.

### Wifi Commands: respond to physical button presses

Configure **Automation → Wifi Commands** in the Control Panel to bring physical remote button presses into Home Assistant. You can create up to 5 Wifi Devices per hub, each with 10 command slots.

Each command can run a Home Assistant Action directly. Every press also updates `sensor.<hub>_wifi_commands`, so configuring an Action is optional: you can instead trigger your own automations and inspect the command, Wifi Device, and short- or long-press type.

> Actions can be added, changed, or removed without syncing. A first deployment or fallback replacement can take several minutes; later command-configuration changes normally use a targeted in-place sync and finish in seconds.

<img height="250" alt="Wifi Devices list" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/wifi-commands-devices.png" /> <img height="250" alt="Automation Events" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/automation-events.png" /> <img height="250" alt="Command slot: configuring an Action" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/wifi-commands-slot-action.png" />

### Events: react to Hub and Activity Events

Under **Automation → Events**, attach Home Assistant Actions to changes reported by the hub:

- **Hub Events** — when any Activity starts, when the hub is switched off, or when Off is pressed while the hub is already off.
- **Activity Events** — separate start and stop hooks for every Activity. When switching directly between Activities, the old Activity stops before the new one starts.

Event Actions run entirely in Home Assistant. They require no Wifi Device or command slots and are never synced to the hub.

Full setup guide → [`docs/wifi_commands.md`](docs/wifi_commands.md)

---

## 🤖 Automations — Home Assistant → Sofabaton

Send commands from Home Assistant through your Sofabaton hub, using the `remote.<hub>_remote` entity.

### Send a command

**In the context of the current Activity** — the command is resolved against whatever Activity is currently active:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: "VOL_UP"
```

Common built-in commands include:
`UP, DOWN, LEFT, RIGHT, OK, HOME, BACK, MENU, VOL_UP, VOL_DOWN, MUTE, CH_UP, CH_DOWN, REW, PAUSE, FWD, RED, GREEN, YELLOW, BLUE, POWER_OFF`

**Directly to a Device or Activity by ID** — the current Activity is **not** used; the supplied Device or Activity ID is targeted directly. IDs share the same range: **Devices start at 1**, **Activities at 101**.

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 12
  device: 3
```

### Start or switch to an Activity

```yaml
action: remote.turn_on
target:
  entity_id: remote.<hub>_remote
data:
  activity: Watch a movie
```

### Power off

```yaml
action: remote.turn_off
target:
  entity_id: remote.<hub>_remote
```

### Finding the required IDs

- **Using the Sofabaton Virtual Remote (recommended)** — add the **Virtual Remote card** to your dashboard and enable its **[Automation Assist > Key capture](https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md)** feature. This gives you IDs and ready-to-use YAML as Notifications in your Home Assistant side bar.
- **Using the Sofabaton Control Panel** — add the **Control Panel card** to your dashboard. When you enable **persistent cache** you can use a UI to navigate your Devices and Activities and see all relevant IDs.

---

## 🆘 Troubleshooting

- 🌐 **Discovery / VLAN / firewall / iOS app can’t find proxy:** see [`docs/networking.md`](docs/networking.md)
- 🪵 **Need actionable logs for an issue report:** see [`docs/logging.md`](docs/logging.md)
- 🐞 **If you need support or have a request, [please open an issue here](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).**

---

## License

MIT © 2026 m3tac0de

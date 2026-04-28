# Sofabaton X1/X1S/X2 – Home Assistant Custom Integration

Bi-directional control of your Sofabaton **X1**, **X1S** and **X2** hub, from Home Assistant, using **100% local APIs**.

> **X2 discovery is disabled by default!** Enable it in `configuration.yaml` (see below).  
> There is also an **official X2 integration** (MQTT-based): https://github.com/yomonpet/ha-sofabaton-hub

---

## Start here

- 🚀 **Quick start**: install + add your hub
- 🕹️ **Dashboard cards**: Sofabaton Virtual Remote & Sofabaton Control Panel
- 🤖 **Send key presses to the hub**: `remote.send_command`, Sofabaton Virtual Remote, Sofabaton Control Panel, “recorded keypress”
- ⚡ **Receive key presses from the hub**: "Wifi Commands" via the Control Panel card, see [`docs/wifi_commands.md`](docs/wifi_commands.md)
- 🌐 **Networking / VLANs / ports / iOS quirks**: see [`docs/networking.md`](docs/networking.md)
- 🪵 **Useful logs & diagnostics**: see [`docs/logging.md`](docs/logging.md)

---

## 🚀 Quick start

1. **Install via HACS** (recommended) or manually (see Installation).
2. **Restart Home Assistant**.
3. Go to **Settings → Devices & Services**. Your Sofabaton hubs appear at the top of the page. **Add** them and follow the flow.
   - Discovery via mDNS should show your hubs automatically.
   - If discovery fails (VLAN / mDNS), see networking docs or add manually.
   - ⚠️**iOS users:** please see the networking docs

   To add manually:
   Go to **Settings → Devices & Services → Add integration** → search **Sofabaton X1S** (listing name) and follow the flow.

### X2 discovery (opt-in)

Add to `configuration.yaml`, then restart HA:

```yaml
sofabaton_x1s:
  enable_x2_discovery: true
```

---

## 🔌 What this integration does

This integration establishes a direct and sustained connection with a Sofabaton hub, leveraging APIs intended for the Sofabaton app.
Sofabaton hubs allow **only one client connection at a time**. To enable this integration and using the app at the same time, this integration works by acting as a **local proxy**:

1. connects to your _real_ hub (physical device)
2. exposes a _virtual_ hub so the **official Sofabaton app** can still connect
3. lets Home Assistant send commands reliably via a single “writer” at a time

When the official app is connected to the proxy, HA entities that can send commands become **unavailable** (intentional: prevents competing writes and weird app behavior).

<details>
<summary><b>How the proxy works (conceptually)</b></summary>

- The _real_ hub is discovered via mDNS.
- The integration starts a bundled Python proxy (`custom_components/sofabaton_x1s/lib/x1_proxy.py`).
- The proxy connects to the real hub and **also** advertises a virtual `_x1hub._udp.local.`.
- When the official app connects, it sends a **CALL_ME** packet to the proxy’s UDP listener. The proxy opens a TCP session back into the app (8100–8110 range).  
  While that session is active, HA “writer” entities become unavailable.

The proxy adds a TXT flag so Home Assistant ignores the virtual advertisement and doesn’t overwrite the real hub IP.
For full networking details, see → [`docs/networking.md`](docs/networking.md)

</details>

---

## ✨ Features

- 🛰 **Automatic discovery** of Sofabaton hubs (X2 discovery opt-in)
- 🧩 **Multiple hubs** supported
- 🎛 **Activity select** entity (`select.<hub>_activity`)
- 🔘 **Dynamic button entities** that match your **currently active activity**
- ⚙️ **Send key presses**: entity (`remote.<hub>_remote`) per hub for scripts/automations. Use the dashboard cards to retrieve the codes you need.
- 💎 **Receive key presses**: “Wifi Commands” configured via the Control Panel card, trigger Actions directly from key presses on the physical remote
- 🔔 **Find Remote** diagnostic button (buzzer)
- 🟢 **Sensors** for activity, connectivity, app connection, recorded keypress, wifi commands
- 🛰 **Proxy can be disabled** per device (stop advertising/binding for the official app)
- 🪵 **Live Hub Logs** tab in the Control Panel card for real-time diagnostics

> This documentation uses markup such as `select.<hub>_activity`, where `<hub>` is your hub's name as configured in Home Assistant — for example, `select.living_room_activity`.

---

## ✅ Requirements

- Home Assistant **2025.x** or newer
- A Sofabaton **X1**, **X1S** or **X2** hub
- HA must be able to **open TCP ports** (hub connects back to the proxy)
- HA must be able to **open UDP ports** (optional; only if you want the official app to connect while HA is running)

> **Networking guide:** VLANs, firewalls, containers, iOS/Android discovery quirks → [`docs/networking.md`](docs/networking.md)

---

## 🔧 Installation

### Option 1 – HACS (recommended)

1. Open **HACS**
2. Search **Sofabaton X1S** and install (works for X1/X1S/X2)
3. **Restart Home Assistant**
4. Go to **Settings → Devices & Services**
5. If discovered, click **Add/Configure**  
   If not: **Add integration** → search **Sofabaton X1S** → enter IP, name and hub version manually

### Option 2 – Manual

1. Create: `config/custom_components/sofabaton_x1s/`
2. Copy the contents of `custom_components/sofabaton_x1s/` from this repo into that folder
3. **Restart Home Assistant**
4. Add via **Settings → Devices & services**

---

## 📋 Entities you’ll get

- **Remote**: `remote.<hub>_remote`  
  Used for automations (`remote.send_command`). Unavailable while the official app is connected to the proxy.

- **Select**:
  - `select.<hub>_activity`  
    Options = `Powered off` + all activities. Selecting activates it. Unavailable while app is connected.
  - `select.<hub>_hub_version` (disabled by default)  
    Force-override the version of the hub in the integration's configuration. Do not use unless certain a correction is required.

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

This integration supports the **Sofabaton Virtual Remote** Lovelace card.

- Repo + docs: https://github.com/m3tac0de/sofabaton-virtual-remote
- The card is designed to work with **this integration** and the **official X2 integration**.

> This integration auto-deploys the card. You DO NOT have to install it separately.
> The card is also available as a separate HACS frontend plugin.
> This integration automatically stops deploying the card as soon as it detects that the card is installed through HACS (a reboot of Home Assistant is required).

<img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-01.png" width="220"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-02.png" width="220"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-03.png" width="220">

## 🖥️ Dashboard card - Sofabaton Control Panel

This integration adds the **Sofabaton Control Panel** Lovelace card to your Home Assistant.
Find it in the Cards selection menu, or add it manually using the following YAML:

```
type: custom:sofabaton-control-panel
```

The Control Panel card is the central management UI for the integration. Its main features are:

- **Wifi Commands** — Configure and deploy Wifi Devices and their commands (see below). Up to 5 Wifi Devices per hub.
- **Persistent Cache** — Enable **persistent cache** in the **Setting** tab so data retrieved from the hub survives a restart. With persistent cache enabled, traffic between hub and integration becomes minimal, making the integration faster and more reliable.
- **Navigate and update Cache** — With persistent cache enabled the Cache tab is available. Navigate your Activities and Devices for their IDs and update the cache whenever required.
- **Logs** — live streaming of hub log output for real-time diagnostics.

<img height="180" alt="image" src="https://github.com/user-attachments/assets/1577a745-058a-4951-aa9f-9ae217d45465" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/f435ea51-dbfa-4f79-8a41-1ae240872431" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/a6470a7e-7ee9-48e7-8c18-3a75ece218f8" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/7fae9569-484a-4eb6-9d58-edae9541d876" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/2d9ac19d-17a4-4d7d-afa4-5173ce814f85" />

---

## 🤖 Automations

### Receive key presses from the hub

The **Wifi Commands** feature lets you trigger Home Assistant Actions directly from physical button presses on the remote.

Configure up to 5 Wifi Devices per hub (10 command slots each) via the **Control Panel** card's Wifi Commands tab. Each command can:

- run a Home Assistant Action immediately when pressed
- participate in activity startup/shutdown sequences (power on/off, input switching)

> Actions can be added, changed, or removed at any time without resyncing to the hub. Only structural changes (command names, button assignments, activities) require a sync, which takes several minutes.

Full setup guide → [`docs/wifi_commands.md`](docs/wifi_commands.md)

<img height="180" alt="image" src="https://github.com/user-attachments/assets/ecd17007-3645-4ea6-ad28-53b1287370aa" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/c225a472-7a22-4dbb-91dd-5a23df1fbc3f" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/cbc0a2e1-635b-4b7c-804d-e0e67051b643" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/16015586-a4c4-4f7c-99b8-51d5af71b35c" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/ead35c29-9a53-4906-a7af-c65009bba3fc" />  
<img height="180" alt="image" src="https://github.com/user-attachments/assets/bb737cf5-1d8e-41bd-95ea-b003e191b7d6" />
<img height="180" alt="image" src="https://github.com/user-attachments/assets/0fb3629a-dd97-4ccd-ab1b-caed75014a84" />

---

### Send a command in the context of the current activity

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: "VOL_UP"
```

Common built-in commands include:
`UP, DOWN, LEFT, RIGHT, OK, HOME, BACK, MENU, VOL_UP, VOL_DOWN, MUTE, CH_UP, CH_DOWN, REW, PAUSE, FWD, RED, GREEN, YELLOW, BLUE, POWER_OFF`

### Send a command directly to a device/activity by ID

In this mode the integration **does not** use the current activity — it targets the given entity ID directly.  
IDs share the same range: **devices start at 1**, **activities at 101**.

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

---

## 🧰 Finding IDs (recommended workflow)

### 1) Using Sofabaton Virtual Remote (recommended)

The easiest way to retrieve the needed IDs is to add the **Virtual Remote card** to your dashboard, and enable its feature **[Automation Assist > Key capture](https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md)**.
This will give you IDs and ready-to-use YAML as Notifications in your Home Assistant side bar.

### 2) Using Sofabaton Control Panel

Another good way to retrieve the IDs is to add the **Control Panel card** to your dashboard. When you enable **persistent cache** you can use a UI to navigate your Devices and Activities and see all relevant IDs.

### 3) Recorded Keypress sensor

Use the official Sofabaton app connected to the **virtual hub**, press a button in the app's virtual remote, then read:

- `sensor.<hub>_recorded_keypress`

It contains ready-to-copy `remote.send_command` payloads.

Tip: to see live updates while pressing buttons, use Settings → Developer Tools → Template:

```yaml
{% set command_data = state_attr('sensor.[YOUR_HUB_NAME]_recorded_keypress', 'example_remote_send_command') %}
action: {{ command_data.action }}
data:
  command: {{ command_data.data.command }}
  device: {{ command_data.data.device }}
target:
  entity_id: {{ command_data.target.entity_id }}
```

---

## 🆘 Troubleshooting

- 🌐 **Discovery / VLAN / firewall / iOS app can’t find proxy:** see [`docs/networking.md`](docs/networking.md)
- 🪵 **Need actionable logs for an issue report:** see [`docs/logging.md`](docs/logging.md)
- 🐞 **If you need support or have a request, [please open an issue here](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).**

---

## License

MIT © 2026 m3tac0de

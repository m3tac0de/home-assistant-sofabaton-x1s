# Sofabaton X1/X1S/X2 – Home Assistant Custom Integration

Bi-directional control of your Sofabaton **X1**, **X1S** and **X2** hub, from Home Assistant, using **100% local APIs**.

> **X2 discovery is disabled by default!** Enable it in `configuration.yaml` (see below).  
> There is also an **official X2 integration** (MQTT-based): https://github.com/yomonpet/ha-sofabaton-hub

---

## Start here

- 🚀 **Quick start**: install + add your hub
- 🕹️ **Dashboard card**: Sofabaton Virtual Remote
- 🤖 **Send key presses to the hub**: `remote.send_command`, “recorded keypress”, “index” + fetch action
- ⚡ **Receive key presses from the hub**: Sofabaton Virtual Remote, "Wifi Commands"
- 🌐 **Networking / VLANs / ports / iOS quirks**: see [`docs/networking.md`](docs/networking.md)
- 🪵 **Useful logs & diagnostics**: see [`docs/logging.md`](docs/logging.md)

---

## 🚀 Quick start

1. **Install via HACS** (recommended) or manually (see Installation).
2. **Restart Home Assistant**.
3. Go to **Settings → Devices & Services**. Your Sofabaton hubs appear at the top of the page. **Add** them and follow the flow.
   - Discovery via mDNS should show your hubs automatically.
   - If discovery fails (VLAN / mDNS), see networking docs or add manually.

    To add manually:
    Go to **Settings → Devices & Services → Add integration** → search **Sofabaton X1S** (listing name) and follow the flow.  

### X2 discovery (opt-in)

Add to `configuration.yaml`, then restart HA:

```yaml
sofabaton_x1s:
  enable_x2_discovery: true
```

---

## ⚙️ What this integration does

This integration establises a direct and sustained connection with a Sofabaton hub, leveraging APIs intended for the Sofabaton app.
Sofabaton hubs allow **only one client connection at a time**. To enable this integration and using the app at the same time, this integration works by acting as a **local proxy**:

1. connects to your *real* hub (physical device)
2. exposes a *virtual* hub so the **official Sofabaton app** can still connect
3. lets Home Assistant send commands reliably via a single “writer” at a time

When the official app is connected to the proxy, HA entities that can send commands become **unavailable** (intentional: prevents competing writes and weird app behavior).

<details>
<summary><b>How the proxy works (conceptually)</b></summary>

- The *real* hub is discovered via mDNS.
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
- ⚙️ **Send key presses** (`remote.<hub>_remote`) per hub for scripts/automations
- 💎 **Receive key presses**: "Wifi Commands" configured via the UI, trigger Actions directly from key presses on the physical remote
- 🔔 **Find Remote** diagnostic button (buzzer)
- 🟢 **Sensors** for activity, connectivity, app connection, recorded keypress, wifi commands
- 🧪 **Diagnostic “Index” sensor** for command lists/macros/favorites
- 🛰 **Proxy can be disabled** per device (stop advertising/binding for the official app)

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

## ⚙️ Entities you’ll get

- **Remote**: `remote.<hub>_remote`  
  Used for automations (`remote.send_command`). Unavailable while the official app is connected to the proxy.

- **Select**: `select.<hub>_activity`  
  Options = `Powered off` + all activities. Selecting activates it. Unavailable while app is connected.

- **Switches**
  - `switch.<hub>_proxy_enabled`  
    Enables/disables proxy advertising + UDP binding (does not interrupt active sessions).
  - `switch.<hub>_hex_logging`  
    Enables deep protocol logging for diagnostics (see logging docs).
  - `switch.<hub>_wifi_device`  
    Enables/disables the listener for Wifi Commands. Disabled by default, enabled automically when deploying Wifi Commands to the hub.

- **Sensors**
  - `binary_sensor.<hub>_hub_connected` (connected/disconnected)
  - `binary_sensor.<hub>_app_connected` (official app connected to proxy)
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

## 🕹️ Dashboard card (Sofabaton Virtual Remote)

This integration supports the **Sofabaton Virtual Remote** Lovelace card.

- Repo + docs: https://github.com/m3tac0de/sofabaton-virtual-remote
- The card is designed to work with **this integration** and the **official X2 integration**.

> This integration auto-deploys the card. You DO NOT have to install it separately.
> The card is also available as a separate HACS frontend plugin. It's recommended you install it that way, so it can be updated separately from this integration.
> This integration automatically stops deploying the card as soon as it detects that the card is installed through HACS (a reboot of Home Assistant is required).


---

## 🤖 Automations

### Wifi Commands: Receive key presses from the hub and trigger an automation.

In the Sofabaton Virtual Remote card's configuration editor, under **Automation Assist > Wifi Commands** 10 slots are available for custom commands.
1. **Make a new command**: Give it a name, assign it to a physical button and/or make it a favorite. Decide which Activities to deploy it to.
2. **Configure an Action** to run whenever a key with the new command is pressed. These Actions run within the Home Assistant backend, the card is only there for configuration. **Configuring an Action is optional**: all Wifi Commands update status in `sensor.<hub>_wifi_commands`, so automations can be built to trigger from it.
3. **Sync to hub** once configuration is completed. This will deploy the configuration directly to the hub.    

  >    - Synchronization may take several minutes. During this time all other interactions with the hub are blocked.
  >    - Once configuration is successfully deployed to the hub, the physical remote is instructed to synchronize, which may take another few minutes to complete.
  >    - Due to the above, it is best to create a complete configuration before deploying to the hub. **Note that Actions can be modified without the need to resync; you can add/remove and change them at any time**.

<img height="180" alt="image" src="https://github.com/user-attachments/assets/79f2d841-e4ef-4252-9a62-e2c7ef577f88" />  
<img height="180" alt="image" src="https://github.com/user-attachments/assets/de132346-40ca-422e-a5e9-abb7efce6433" />  
<img height="180" alt="image" src="https://github.com/user-attachments/assets/ead35c29-9a53-4906-a7af-c65009bba3fc" />  
<img height="180" alt="image" src="https://github.com/user-attachments/assets/7bdad456-f637-43c6-8c50-9c3ccaad6990" />  
<img height="180" alt="image" src="https://github.com/user-attachments/assets/45e2f748-44f2-48c6-bc70-abee75ad30cf" />

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

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 12
  device: 3
```

In this mode the integration **does not** use the current activity — it targets the given entity ID directly.  
IDs share the same range: **devices start at 1**, **activities at 101**.

---

## 🧰 Finding IDs (recommended workflow)

### 1) Using Sofabaton Virtual Remote (recommended)

The easiest way to retrieve the needed IDs is to add the **Virtual Remote card** to your dashboard, and enable its feature **Automation Assist > Key capture**.
This will give you IDs and ready-to-use YAML as Notifications in your Home Assistant side bar.


### 2) Recorded Keypress sensor

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

### 3) Index sensor + fetch action (best for exploring full command lists)

The hub can have a lot of commands; fetching everything on every startup is slow/noisy, so it’s on-demand.

Check: `sensor.<hub>_index` (Settings → Developer Tools → States). You will see your devices and activities, along with their respective `end_id` values.

Run the action **in UI mode at least once** (Settings → Developer Tools → Actions) so you can select the hub:

In the fetch action, device is the Home Assistant Device for your hub (pick it from the UI dropdown). ent_id is the Sofabaton entity id (device/activity id on the hub).
```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e  # select hub in UI mode
  ent_id: 5                                 # the ID of a device or activity
```

Then check: `sensor.<hub>_index` again for the populated mappings, and use those IDs with `remote.send_command`.

For a full guide, see [`docs/fetch_command.md`](docs/fetch_command.md)

---

## 🆘 Troubleshooting

- 🌐 **Discovery / VLAN / firewall / iOS app can’t find proxy:** see [`docs/networking.md`](docs/networking.md)
- 🪵 **Need actionable logs for an issue report:** see [`docs/logging.md`](docs/logging.md)
- 🐞 **If you need support or have a request, [please open an issue here](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).**

---

## License

MIT © 2026 m3tac0de

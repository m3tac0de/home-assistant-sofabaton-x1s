# Sofabaton X1S – Home Assistant Custom Integration

Control your Sofabaton **X1S** hub directly from Home Assistant using 100% local APIs.

This integration uses a small proxy that:

1. connects to your *real* X1S hub (the physical one),
2. exposes a *virtual* hub so the official Sofabaton app can still connect (the Sofabaton hub allows a single client at time only),
3. enables any command to be sent directly from Home Assistant

Because the Sofabaton X1S hub only allows **one client at a time**, the proxy sits in the middle and lets HA “see” the hub while still allowing the official app to connect.

---

## Features

- 🛰 **mDNS discovery** of Sofabaton hubs
- 🧩 **Multiple hubs** supported 
- 🎛 **Activity select** entity:
  - shows all available activities
  - first option is “Powered off”
  - selecting an activity activates it
  - becomes unavailable when the official app is connected to the proxy
- 🔘 **Dynamic button entities**:
  - one fixed set of HA button entities
  - they change availability based on the **currently active activity**
  - only buttons actually enabled for that activity are available
  - become unavailable when a proxy client (official app) is connected
- 🟢 **Connection sensors**:
  - “hub connected” (are we connected to the physical hub?)
  - “app connected” / “proxy client connected” (is the official app using our virtual hub?)
- 🧪 **Diagnostic “Index” sensor**:
  - shows current activity
  - lists activities and devices
  - lists cached buttons for each activity/device
  - lists cached commands for each device (after you fetch them)
  - shows `loading` when we’re actively retrieving commands
- ⚙️ **Configurable proxy ports** (global options)
- 🛠 **Actions**
  - to fetch commands for a specific device/activity and send any command mapped to any device or activity.
  - because key maps are both slow to retrieve from the hub, and static at the same time (until you change configuration through the official app), we do not need to retrieve these key maps all the time. We can just do it once (using the fetch Action), look at the mapping, and then use the send_key action using those values.

---

## How it works (conceptually)

- The *real* hub is discovered via mDNS → we get IP, port, MAC, name, TXT.
- The integration starts a Python proxy (bundled in `custom_components/sofabaton_x1s/lib/x1_proxy.py`).
- The proxy connects to the real hub and **also** advertises a *virtual* `_x1hub._udp.local.`.
- The proxy is enabled by default. You can disable it from the device’s “Configuration” panel in HA.
- When the real Sofabaton app connects to our virtual hub, the integration temporarily goes into “read-only” mode and your HA entities become unavailable (this is intentional).

We add a small TXT flag to the virtual hub so Home Assistant **ignores** our own advertisement and doesn’t overwrite the real hub’s IP.

---

### Networking

This integration follows the same 3-step flow as the official Sofabaton app:

1. **mDNS / Bonjour** – the hub advertises `_x1hub._udp.local.`. Home Assistant (and the bundled proxy) listen for this. If your hub is on another VLAN and mDNS isn’t forwarded, discovery won’t work. In that case, use the manual IP/port option in the config flow.
2. **CALL_ME (UDP)** – after discovery, the client sends a small “call me” message to the hub’s advertised UDP port (typically `8102`). This tells the hub “here is where you can reach me”.
3. **TCP connect-back** – the hub then opens a **TCP** connection back to the client/proxy. This means the hub must be able to reach **Home Assistant** on the proxy’s listen port. The proxy binds to a base port (configurable in the integration options) and will try up to 32 ports starting from the value provided by you.

So, if you use VLANs / firewalls:

- allow **mDNS** from hub → HA (or forward it)
- allow **UDP** from HA → hub on the Sofabaton port (e.g. `8102`)
- allow **TCP** from hub → HA on the proxy port (the one you configured in the integration)

If discovery works but the entities never go “connected to hub”, it’s usually that last rule: the hub cannot open the TCP back to HA.

---

## Requirements

- Home Assistant 2024.x or newer (async config flow, options flow)
- A Sofabaton **X1S** hub on the same network, advertising `_x1hub._udp.local.`
- Your HA instance must be able to open UDP and TCP ports (for the proxy’s listening ports)

---

## Installation

### Option 1 – HACS (recommended)

1. Open **HACS → Integrations → … → Custom repositories**.
2. Add your repo URL  
   `https://github.com/m3tac0de/home-assistant-sofabaton-x1s`  
   and select **Integration**.
3. Install **Sofabaton X1S** from HACS.
4. **Restart Home Assistant.**
5. Go to **Settings → Devices & services → Add integration** and search for **Sofabaton X1S**.
6. Pick the hub from the list of discovered hubs.
7. Done.

> HACS looks for `custom_components/sofabaton_x1s/` in this repo. The integration lives there.

---

### Option 2 – Manual

1. Create the folder  
   `config/custom_components/sofabaton_x1s/`
2. Copy all files from this repo’s `custom_components/sofabaton_x1s/` into that folder.
3. **Restart Home Assistant.**
4. Add the integration via **Settings → Devices & services**.

---

## Configuration flow (what you’ll see)

1. HA discovers `Sofabaton X1S`.
2. You start the integration.
3. The integration lists all `_x1hub._udp.local.` hubs it can see.
4. You pick your hub by **name** (and optionally IP/port).
5. Global proxy options are shown (proxy base port, hub-listen base). Defaults usually work.
6. The integration creates:
   - 1 device (“\<your hub name\>”)
   - activity select
   - connection sensors
   - button entities
   - diagnostic “index” sensor

If the hub was already configured, the flow will just say “already configured” and won’t create a second one.

---

## Entities

You should see (names simplified):

- **Select**: `select.<hub>_activity`
  - options = `Powered off` + all activities from hub
  - selecting an item sends `activate` to hub
  - becomes unavailable when the official app is connected

- **Binary/normal sensors**:
  - `binary_sensor.<hub>_hub_status` → `connected` / `disconnected` is the physical hub connected to us
  - `binary_sensor.<hub>_app_connected` → `connected` / `disconnected` is the official app connected to our proxy
  - `sensor.<hub>_index` (diagnostic) → `ready` / `loading` / `offline`
    - attributes: activities, devices, buttons per entity, commands per entity

- **Buttons**:
  - `button.<hub>_volume_up`
  - `button.<hub>_volume_down`
  - `button.<hub>_mute`
  - … plus the other Sofabaton button codes
  - availability depends on the **currently active activity**

---

## Actions

This integration exposes **services/actions** so you can send any Sofabaton key to any of your devices or activities.

The Sofabaton hub distinguishes between **Devices** and **Activities**. Both can have **Buttons** and **Commands**:

- **Buttons** = the fixed, well-known button IDs (volume up, mute, d-pad, etc.).
- **Commands** = the long, device-specific list that comes from the hub (some devices have 100+). Activities only have commands if you configured them in the Sofabaton app.

With the `send_key` action you can do (pseudo):

```text
send_key(<DEVICE_OR_ACTIVITY_ID>, <BUTTON_OR_COMMAND_ID>)
```

To find out what the IDs are, use the **Index** sensor. You can see it in **Developer Tools → States → `sensor.<your_hub_name>_index`**.
Because retrieving commands for a device can be slow, the integration does **not** fetch all commands automatically. Use the **fetch** action/service to populate the sensor for a specific device or activity.

The diagnostic sensor then shows you which commands are available for which entity in a readable format:

```yaml
commands:
  "3 (Denon AVR)":
    - code: 11
      name: Sleep
    - code: 55
      name: Set Disco Mode
  "102 (Watch a Movie)":
    - code: 1
      name: Power On
```

---

## License

MIT © 2025 m3tac0de
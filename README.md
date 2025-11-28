# Sofabaton X1/X1S – Home Assistant Custom Integration

Control your Sofabaton **X1** or **X1S** hub directly from Home Assistant using 100% local APIs.

**Compatibility note:** the X1 and X1S share the same local API surface. The integration is developed and tested primarily on the X1S, but X1 users should see identical behavior; please report any differences you encounter.

This integration:

1. connects to your *real* X1/X1S hub (the physical one),
2. exposes a *virtual* hub so the official Sofabaton app can still connect (the Sofabaton hub allows a single client at a time only),
3. enables any command to be sent directly from Home Assistant

Because the Sofabaton X1/X1S hub only allows **one client at a time**, the integration sits in the middle and lets HA “see” the hub while still allowing the official app to connect.
So essentially: this integration is a proxy service for the Sofabaton X1/X1S hub and Home Assistant is an internal client to that proxy.

---

## Features

- 🛰 **Automatic discovery** of Sofabaton hubs
- 🧩 **Multiple hubs** supported 
- 🎛 **Activity select** entity:
  - shows all available activities
  - first option is “Powered off”
  - selecting an activity activates it
  - becomes unavailable when the official app is connected to the proxy (to prevent unexpected behavior in the app)
- 🔘 **Dynamic button entities**:
  - one fixed set of HA button entities, mimicking all hard buttons of the physical remote
  - functionality relative to the **currently active activity**
  - only buttons actually enabled for that activity are available
  - become unavailable when a proxy client (official app) is connected (to prevent unexpected behavior in the app)
- ⚙️ **Remote entity**:
  - one HA remote entity per configured hub
  - used in your automations and scripts to send any command to any device or activity
  - used in combination with the **Index sensor entity** and the `sofabaton_x1s.fetch_device_commands` Action
- 🛠 **Action**
  - to fetch commands for a specific device/activity
  - because key maps are both slow to retrieve from the hub, and static at the same time (until you change configuration through the official app), we do not need to retrieve these key maps all the time. We can just do it once (using the fetch Action), look at the mapping, and then use remote.send_command using those values.
- 🧪 **Diagnostic “Index” sensor**:
  - lists activities and devices
  - lists cached commands for each device (after you fetch them) and buttons for activities
  - shows `loading` when we’re actively retrieving commands
- 🔔 **Find Remote diagnostic button**:
  - triggers the hub’s “find my remote” buzzer directly from Home Assistant
  - available while the proxy can issue commands (when the official app is not connected)
- 🟢 **Sensors**:
  - “activity” (shows the current Activity)
  - “recorded_keypress” (shows how to replay the most recently pressed button in the Sofabaton app, while it is connected to the virtual hub)
  - “hub connected” (are we connected to the physical hub?)
  - “app connected” (is the official app using our virtual hub?)
  - sensors maintain state accurately, regardless of how that state is set. So whether you change activity through Home Assistant, the official app, the physical remote or something like Alexa; the sensors will reflect accurate state.
- 🛰 **X1/X1S Proxy**:
  - although enabled by default, the proxy capability (the ability for the official app to connect while this integration is running) can be disabled in device settings (it will then no longer advertise and bind to a UDP port)

---

## How it works (conceptually)

- The *real* hub is discovered via mDNS → we get IP, port, MAC, name, TXT.
- The integration starts a Python proxy (bundled in `custom_components/sofabaton_x1s/lib/x1_proxy.py`).
- The integration connects to the real hub and **also** advertises a *virtual* `_x1hub._udp.local.`.
- When the real Sofabaton app wants to control the virtual hub, it first sends a **CALL_ME** packet to the proxy's UDP listener (broadcast for iOS, unicast is fine for Android). The proxy then opens the TCP session **back into the app** on a port in the 8100–8110 range. While that session is active, your HA entities that can send commands become unavailable (this is intentional, we're preventing unexpected behavior in the app by allowing only a single "writer" at a time).

We add a small TXT flag to the virtual hub so Home Assistant **ignores** our own advertisement and doesn’t overwrite the real hub’s IP.

---

### Networking

For a deeper walkthrough (multiple hubs, VLANs, firewalls, containers, and mobile app quirks), see [`docs/networking.md`](docs/networking.md).

This integration follows the same 3-step flow as the official Sofabaton app:

1. **mDNS / Bonjour** – the hub advertises `_x1hub._udp.local.`. Home Assistant (and the bundled proxy) listen for this. If your hub is on another VLAN and mDNS isn’t forwarded, discovery won’t work. In that case, use the manual IP/port option in the config flow.
2. **CALL_ME (UDP)** – after discovery, the client sends a small “call me” message to the hub’s advertised UDP port (typically `8102`). This tells the hub “here is where you can reach me”.
3. **TCP connect-back** – the hub then opens a **TCP** connection back to the client/proxy. This means the hub must be able to reach **Home Assistant** on the proxy’s listen port. The proxy binds to a base port (configurable in the integration options) and will try up to 32 ports starting from the value provided by you.

So, if you use VLANs / firewalls:

- allow **mDNS** from hub → HA (or forward it)
- allow **UDP** from HA → hub on the Sofabaton port (`8102` is the standard port on these devices)
- allow **TCP** from hub → HA on the proxy port (the one you configured in the integration)

If discovery works but the entities never go “connected to hub”, it’s usually that last rule: the hub cannot open the TCP back to HA.
Also keep in mind that as soon as a client is connected to the physical hub, the hub stops mDNS advertising. So if this integration is connected and running with "proxy" disabled, the official app will not find it. And vice versa, the integration cannot see the hub if the official app is connected directly to it.

### Upgrading note: single UDP listener on 8102 for all configured hubs

This integration now uses one UDP listener for both CALL_ME and the broadcast capabilities needed for iOS, shared across all configured hubs. New installs default this listener to `8102` so Android and iOS discovery both work. If you previously overrode the **Proxy UDP base port** (for example, to `9102` which was the previous default), consider changing it to `8102`. Using a different UDP port applies to all hubs and may prevent the iOS app from discovering the proxy.

---

## Requirements

- Home Assistant 2024.x or newer (async config flow, options flow)
- A Sofabaton **X1** or **X1S** hub on the same network, advertising `_x1hub._udp.local.`
- Your HA instance must be able to open TCP ports (so the real hub can connect to our integration)
- Your HA instance must be able to open UDP ports (optional; only if you want the official app to be able to connect to the hub while this integration is running)

---

## Installation

### Option 1 – HACS (recommended)

1. Open **HACS → Integrations**.
2. Search for **Sofabaton X1S** and download it (the listing name uses X1S but works for both X1 and X1S hubs).
3. **Restart Home Assistant.**
4. Go to **Settings → Devices & Services.**
5. You should see **Sofabaton X1/X1S** discovered automatically. Click **Add/Configure**.
6. Confirm the discovered hub or choose manual entry to provide its IP and port.

If not discovered automatically: Click **Add Integration**, search for **Sofabaton X1S** (works for both hub models), and enter the IP/Port manually.

---

### Option 2 – Manual

1. Create the folder  
   `config/custom_components/sofabaton_x1s/`
2. Copy all files from this repo’s `custom_components/sofabaton_x1s/` into that folder.
3. **Restart Home Assistant.**
4. Add the integration via **Settings → Devices & services**.

---

## Configuration flow (what you’ll see)

1. HA discovers `Sofabaton X1/X1S` via mDNS and asks you to confirm, **or** you start the flow manually.
2. If you started the flow manually, you provide the hub’s IP, port, and a name for the entry.
3. Global proxy options are shown (proxy base port, hub-listen base). Defaults usually work.
6. The integration creates:
   - 1 device (“\<your hub name\>”)
   - activity select
   - connection sensors
   - button entities
   - diagnostic “index” sensor
   - remote entity
   - proxy switch
   - 1 "Action"

If the hub was already configured, the flow will just say “already configured” and won’t create a second one.

---

## Entities

You should see:

- **Remote**: `remote.<hub>_remote`
  - Power activities on/off
  - send any command to any device or activity
  - becomes unavailable when the official app is connected

- **Select**: `select.<hub>_activity`
  - options = `Powered off` + all activities from hub
  - selecting an item sends `activate` to hub
  - becomes unavailable when the official app is connected

- **Switch**: 
  - `switch.<hub>_proxy_enabled`
    - switches proxy capability of the integration on and off (mDNS advertising and UDP port binding)
    - note that active connections are not interupted when proxy is switched off, it will just stop accepting new ones
  - `switch.<hub>_hex_logging`
	- when this is switched on, and you enable debug logging for the integration, all communication between hub and client is now dropped in the Home Assistant log.
	- useful for improving the integration

- **Binary/normal sensors**:
  - `binary_sensor.<hub>_hub_status` → `connected` / `disconnected` is the physical hub connected to us
  - `binary_sensor.<hub>_app_connected` → `connected` / `disconnected` is the official app connected to our proxy
  - `sensor.<hub>_index` (diagnostic) → `ready` / `loading` / `offline`
    - attributes: activities, currect_activity, devices, buttons per device and activity, commands per device and activity
    - also keeps a small history of app-sourced `OP_REQ_ACTIVATE` events with decoded labels and a ready-to-copy `remote.send_command` payload for automations
  - `sensor.<hub>_activity`→ Shows the current activity, or `Powered Off` if none is active. Maintains accurate state regardless of how the Activity was changed (through Home Assistant, the physical remote, the official app).

- **Buttons**:
  - `button.<hub>_find_remote` (added as a "Diagnostic" button)
  
  - `button.<hub>_volume_up`
  - `button.<hub>_volume_down`
  - `button.<hub>_mute`
  - … plus the other Sofabaton button codes
  - availability depends on the **currently active activity**

---

## Remote

This integration exposes a **Home Assistant `remote` entity** for every Sofabaton hub you add.

That remote:

- shows the **current activity**
- can switch between activities or power them down
- can be used to send any command to any device or activity

So you can do this in an automation or in Developer Tools:

```yaml
service: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: "VOL_UP"
```

Which will then send the Volume Up command to the hub in the context of the current activity.
Available commands are:
UP, DOWN, LEFT, RIGHT, OK, HOME, BACK, MENU, VOL_UP, VOL_DOWN, MUTE, CH_UP, CH_DOWN, REW, PAUSE, FWD, RED, GREEN, YELLOW, BLUE, POWER_ON, POWER_OFF

Things to know:

- if there is no current activity ("powered off"), sending commands in this way will fail
- when the official Sofabaton app connects to our virtual hub, the remote becomes unavailable (same as the select/buttons)

### Advanced: send to a specific device

Sometimes you want to send a command directly to a device (or activity) by its numeric ID. You can do that with the same HA service:

```yaml
service: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: "55"   # numeric command id
  device: 3       # entity id on the hub (devices start at 1, activities at 101)
```

In this mode we **don’t** look at the current activity — we send straight to that entity on the hub.
There is no difference here between a device and an activity, they exist in the same ID range (devices start at 1, activities at 101).
You only need to know the IDs of your devices and activities, and then the command IDs for each of them.

---

## Fetching commands (Index sensor)

The Sofabaton hub can have a *lot* of device commands. Fetching all of them on every startup would be slow and noisy, so the integration doesn’t do that automatically.

Instead we have:

- a **diagnostic sensor**: `sensor.<hub>_index`
  - shows currect actvity
  - shows activities, devices
  - shows buttons we already have cached
  - can also show **commands** per device/activity
  - shows `loading` while we’re fetching
  
Go to `Developer Tools → States → sensor.<hub>_index` to see the contents of the sensor.

- a **fetch service/action**: you call it to tell the integration “go to the hub, get me all commands for this device/activity, and put them on the Index sensor”.

After you call the fetch service, the Index sensor will look something like this:

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

Use this to discover the numeric command IDs you want to send with `remote.send_command` (advanced form with `device:`).

That way we stay fast in normal operation, but you can still explore everything the hub knows.

---

## License

MIT © 2025 m3tac0de.

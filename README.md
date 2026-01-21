# Sofabaton X1/X1S/X2 – Home Assistant Custom Integration

Control your Sofabaton **X1**, **X1S** and **X2** hub directly from Home Assistant using 100% local APIs.

**Compatibility note:** the X1, X1S and X2 share the same local API surface. The integration is developed and tested primarily on the X1S and X2, but X1 users should see identical behavior; please report any differences you encounter. 

**X2 discovery is disabled by default!**, enable in configuration.yaml. There is an [`official integration`](https://github.com/yomonpet/ha-sofabaton-hub) for the X2.

This integration:

1. connects to your *real* X1/X1S/X2 hub (the physical one),
2. exposes a *virtual* hub so the official Sofabaton app can still connect (the Sofabaton hub allows a single client at a time only),
3. enables any command to be sent directly from Home Assistant

Because the Sofabaton X1/X1S/X2 hub only allows **one client at a time**, the integration sits in the middle and lets HA “see” the hub while still allowing the official app to connect.
So essentially: this integration is a proxy service for the Sofabaton X1/X1S/X2 hub and Home Assistant is an internal client to that proxy.

**Also, it has a card for your dashboard!**

<img width="400" height="404" alt="image" src="https://github.com/user-attachments/assets/ab0db5df-1969-49ff-a1a0-88d52654709e" />
<img width="400" alt="image" src="https://github.com/user-attachments/assets/2a8627cb-3c42-4a2d-bd22-2ad4108916e1" />

---

## Features

- 🛰 **Automatic discovery** of Sofabaton hubs
- 🧩 **Multiple hubs** supported
- 🟢 **Virtual remote** for your dashboard
  - plays nice with your themes
  - configure entirely via the UI
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
- 🔔 **Find Remote diagnostic button**:
  - triggers the hub’s “find my remote” buzzer directly from Home Assistant
  - available while the proxy can issue commands (when the official app is not connected)
- 🟢 **Sensors**:
  - “activity” (shows the current Activity)
  - “recorded keypress” (shows how to replay the most recently pressed button in the Sofabaton app, while it is connected to the virtual hub)
  - “hub connected” (are we connected to the physical hub?)
  - “app connected” (is the official app using our virtual hub?)
  - sensors maintain state accurately, regardless of how that state is set. So whether you change activity through Home Assistant, the official app, the physical remote or something like Alexa; the sensors will reflect accurate state.
- 🧪 **Diagnostic “Index” sensor**:
  - used in combination with the “fetch_device_commands” Action to retrieve the commands the hub knows about
- 🛰 **X1/X1S/X2 Proxy**:
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

1. **mDNS / Bonjour** – the hub advertises `_x1hub._udp.local.` (X1/X1S) or `_sofabaton_hub._udp.local.` (X2). Home Assistant (and the bundled proxy) listen for this. If your hub is on another VLAN and mDNS isn’t forwarded, discovery won’t work. In that case, use the manual IP/port option in the config flow.
2. **CALL_ME (UDP)** – after discovery, the client sends a small “call me” message to the hub’s advertised UDP port (typically `8102`). This tells the hub “here is where you can reach me”.
3. **TCP connect-back** – the hub then opens a **TCP** connection back to the client/proxy. This means the hub must be able to reach **Home Assistant** on the proxy’s listen port. The proxy binds to a base port (configurable in the integration options) and will try up to 32 ports starting from the value provided by you.

So, if you use VLANs / firewalls:

- allow **mDNS** from hub → HA (or forward it)
- allow **UDP** from HA → hub on the Sofabaton port (`8102` is the standard port on these devices)
- allow **TCP** from hub → HA on the proxy port (the one you configured in the integration)

If discovery works but the entities never go “connected to hub”, it’s usually that last rule: the hub cannot open the TCP back to HA.
Also keep in mind that as soon as a client is connected to the physical hub, the hub stops mDNS advertising. So if this integration is connected and running with "proxy" disabled, the official app will not find it. And vice versa, the integration cannot see the hub if the official app is connected directly to it.

> ### Upgrading note: single UDP listener on 8102 for all configured hubs
> 
> This integration now uses one UDP listener for both CALL_ME and the broadcast capabilities needed for iOS, shared across all configured hubs. New installs default this listener to `8102` so Android and iOS discovery both work. If you previously overrode the **Proxy > > UDP base port** (for example, to `9102` which was the previous default), consider changing it to `8102`. Using a different UDP port applies to all hubs and may prevent the iOS app from discovering the proxy.

---

## Requirements

- Home Assistant 2025.x or newer
- A Sofabaton **X1**, **X1S** or **X2** hub on the same network
- Your HA instance must be able to open TCP ports (so the real hub can connect to our integration)
- Your HA instance must be able to open UDP ports (optional; only if you want the official app to be able to connect to the hub while this integration is running)

### X2 discovery (opt-in)

This integration supports the X2 hub in the same way that it supports the X1 and X1S hubs; a direct TCP based connection is sustained between Sofabaton hub and integration, leveraging APIs intended for the Sofabaton app.
[The official integration](https://github.com/yomonpet/ha-sofabaton-hub) for the X2 uses MQTT to achieve similar functionality, and the use case for running both integrations at the same time is very limited (although that is perfectly possible and has no negative impact).

For that reason automatic discovery of X2 hubs is disabled by default. To enable discovery of X2 hubs, add the following to Home Assistant's `configuration.yaml` and restart Home Assistant after making the change.

```yaml
sofabaton_x1s:
  enable_x2_discovery: true
```

With the flag enabled, X2 hubs will show the normal discovery confirmation.

---

## Installation

### Option 1 – HACS (recommended)

1. Open **HACS → Integrations**.
2. Search for **Sofabaton X1S** and download it (the listing name uses X1S but works for X1, X1S and X2 hubs).
3. **Restart Home Assistant.**
4. Go to **Settings → Devices & Services.**
5. You should see **Sofabaton X1/X1S** discovered automatically. Click **Add/Configure**.
6. Confirm the discovered hub or choose manual entry to provide its IP and hub version.

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

1. HA discovers `Sofabaton X1/X1S/X2` via mDNS and asks you to confirm, **or** you start the flow manually.
2. If you started the flow manually, you provide the hub’s IP, hub version, and a name for the entry.
3. Global proxy options are shown (proxy base port, hub-listen base). Defaults usually work.

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
	- when this is switched on, all communication between hub and client is now available in logs via "Diagnostic download".
	- sharing your logs is useful for improving the integration

- **Binary/normal sensors**:
  - `binary_sensor.<hub>_hub_status` → `connected` / `disconnected` is the physical hub connected to us
  - `binary_sensor.<hub>_app_connected` → `connected` / `disconnected` is the official app connected to our proxy
  - `sensor.<hub>_index` (diagnostic) → `ready` / `loading` / `offline`
    - attributes: activities, devices and their command codes and macros
  - `sensor.<hub>_activity`→ Shows the current activity, or `Powered Off` if none is active. Maintains accurate state regardless of how the Activity was changed (through Home Assistant, the physical remote, the official app).
  - `sensor.<hub>_recorded_keypress` → Shows the codes needed to replay the most recently pressed button in the Sofabaton app.

- **Buttons**:
  - `button.<hub>_find_remote` (added as a "Diagnostic" button)

  - `button.<hub>_volume_up`
  - `button.<hub>_volume_down`
  - `button.<hub>_mute`
  - … plus the other Sofabaton button codes
  - availability depends on the **currently active activity**

- **Text entity**:
  - `text.<hub>_hub_ip_address` (added as a "Configuration" entity)
    - Editable text box that shows the IP address of the physical hub as it's stored in configuration.
    - Enables manual changing of the hub's IP address in the integration's configuration. The proxy will instantly restart with the new configuration after changes have been made.
    - This entity is disabled by default! If your hub is configured through automatic discovery (you never manually had to enter the IP address of your hub), your hub's IP changes will continue to be automatically picked up by the integration and there should be no need to manually intervene.

---

## Lovelace card

A custom card is added to Home Assistant as part of this integration.

To use it in your dashboard, click **Add card** in your dashboard. Search for **Sofabaton Virtual Remote** and add it.

To instead add the card manually, do:
```yaml
type: custom:sofabaton-virtual-remote
entity: remote.<hub>_remote
```

> ### Important information about this card
> This card is made to be compatible with both this integration as well as the official X2 integration. For that reason, the card is spun off as a separate HACS frontend plugin.
> You can find its home [here](https://github.com/m3tac0de/sofabaton-virtual-remote). This is also the best place to go for documentation and support.
> The card, for now, is automatically deployed by this integration, you do not have to install it separately. This is likely to change after the card is added as a default repository in HACS, for which it is currently in queue. This integration will then facilitate a smooth transition to the separately installed plugin.
> 
> Even now, if you were the install the card separately, this integration will automatically stop deploying the card itself.


## Remote

This integration exposes a **Home Assistant `remote` entity** for every Sofabaton hub you add.

That remote:

- shows the **current activity**
- can switch between activities or power them down
- can be used to send any command to any device or activity
- becomes unavailable when the app is connected to the virtual hub

So you can do this in an automation or in Developer Tools:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: "VOL_UP"
```

Which will then send the Volume Up command to the hub in the context of the current activity.
Available commands are:
UP, DOWN, LEFT, RIGHT, OK, HOME, BACK, MENU, VOL_UP, VOL_DOWN, MUTE, CH_UP, CH_DOWN, REW, PAUSE, FWD, RED, GREEN, YELLOW, BLUE, POWER_OFF

You can also directly send any command to any device or activity, you just need to know the IDs for them.

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 12
  device: 3
```
In this mode we **don’t** look at the current activity — we send straight to that entity on the hub.
There is no difference here between a device and an activity, they exist in the same ID range (devices start at 1, activities at 101).

### Retrieving command and device IDs

You have two ways to find the numeric `device` and `command` values used by `remote.send_command`:

1. **Recorded keypress sensor (recommended for quick use)**: `sensor.<hub>_recorded_keypress`
   - Shows the most recently pressed button when you use the official Sofabaton app against the virtual hub.
   - Includes ready-to-copy `remote.send_command` payloads for both the corresponding device and activity command.
   - Most convenient when you want to capture a single button press and replay it in an automation.
2. **Index sensor**: `sensor.<hub>_index`
   - Run the fetch service/action to populate commands for a device or activity.
   - Best when you need to explore the full command list for a device or build several automations at once.

Either sensor gives you the IDs you need to target specific devices or activities when sending commands.

---

## Recorded commands (Recorded Keypress sensor)

Whenever you connect the Sofabaton app to the virtual hub, the integration can see what commands the app is sending to the hub.
In the `recorded_keypress sensor` we record the most recently performed command, so you can replay that easily in your own automation etc.

Go to `Developer Tools → States → sensor.<hub>_recorded_keypress` to see the contents of the sensor.
It contains a ready to paste remote.send_command.

Note that in this view it does not automatically update every time you press a key.

You can do this: Go to `Developer Tools → Template` and paste this into the Template editor (update for the correct hub name):

```yaml
{% set command_data = state_attr('sensor.[YOUR_HUB_NAME]_recorded_keypress', 'example_remote_send_command') %}
action: {{ command_data.action }}
data:
  command: {{ command_data.data.command }}
  device: {{ command_data.data.device }}
target:
  entity_id: {{ command_data.target.entity_id }}
```
Now connect your Sofabaton app to the virtual hub and you'll see ready to paste updates as you press buttons in the app.


## Fetching commands (Index sensor)

The Sofabaton hub can have a *lot* of device commands. Fetching all of them on every startup would be slow and noisy, so the integration doesn’t do that automatically.

Instead we have:

- a **diagnostic sensor**: `sensor.<hub>_index`
  - shows activities, devices and their commands and macros
  - shows `loading` while we’re fetching
  
Go to `Developer Tools → States → sensor.<hub>_index` to see the contents of the sensor.

- a **fetch service/action**: you call it to tell the integration “go to the hub, get me all commands for this device/activity, and put them on the Index sensor”.


> Use `sofabaton_x1s.fetch_device_commands` in `Developer Tools → Actions` in **UI Mode!**
> At least once. In this mode you can use a dropdown to select your hub.
> This gets you the ID that you need, so that the Action knows which one of your hubs to target.

```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e  # <- this will be different for you! Use the hub select dropdown in UI mode!
  ent_id: 5

```

After you call the fetch action, the Index sensor will look something like this:

```yaml
activities:
  "103":
    name: Play Switch 2
    active: false
    macros:
      - name: Dim all lights
        command: 1
      - name: Order a pizza
        command: 5
    favorites:
      - name: Exit
        command: 2
        device: 1
      - name: "0"
        command: 3
        device: 3
devices:
  "1":
    brand: AWOL Vision
    name: AWOLVision LTV-3500
    commands:
      - name: Brightness
 		command: 1
      - name: Exit
    	command: 2
      - name: Guide
    	command: 3
        
```

Use this to discover the numeric command IDs you want to send with `remote.send_command` (advanced form with `device:`).

Based on the above, to trigger the "Guide" command on the "AWOLVision LTV-3500", you would do:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 3
  device: 1
```

And to trigger the Order a Pizza macro, you would do:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 5
  device: 103
```

---

## License

MIT © 2025 m3tac0de.

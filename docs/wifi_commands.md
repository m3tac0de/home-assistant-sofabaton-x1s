# Trigger Home Assistant from the remote and hub

This guide covers activity flowing from Sofabaton into Home Assistant. Wifi Commands and Wifi Events turn remote interactions into Home Assistant Actions, while Hub and Activity Events respond to state transitions. To control the hub from your own dashboards, automations, or scripts, see the [remote entity guide](remote_entity.md).

These features are configured in the **Automation** tab of the Sofabaton Control Panel. The tab has two sub-tabs:

- **Wifi Commands** creates managed hub devices whose commands call Home Assistant over HTTP or, on supported X2 setups, MQTT.
- **Events** configures Actions for hub state changes, individual Activity transitions, and named Wifi Events placed inside Activities.

Actions run in Home Assistant. The Control Panel is only the configuration interface; it does not need to remain open.

## ◇ Choose a trigger type

Choose the option that matches what should trigger Home Assistant:

- To run a Home Assistant Action from a remote button, shortcut, or macro, use a **Wifi Event**.
- To add a reusable group of Home Assistant controls to the remote as a device, use **Wifi Commands**.
- To run an Action when the hub turns off or an Activity starts or stops, use a **Hub Event** or **Activity Event**.

The guide treats Wifi Commands, Wifi Events, and Hub and Activity Events separately because they have different configuration and synchronization requirements.

Open **Automation → Events** to attach Actions to Wifi Events, Hub Events, and Activity Events. Selecting an Action link opens the Home Assistant Action selector; the small × resets it to _do nothing_. A row briefly highlights when its event fires while the Control Panel is open.

Action changes apply immediately and never require a hub sync. Deploying Wifi Commands, defining Wifi Events, or placing them in Activities changes hub configuration and may require synchronization as described below.

<img height="220" alt="Automation tab, Wifi Commands sub-tab" src="images/wifi-commands-devices.png" /> <img height="220" alt="Automation tab, Events sub-tab" src="images/automation-events.png" />

## ◇ Wifi Commands

With Wifi Commands, you build your own Home Assistant device for the remote: a set of commands that each run any Action you like. Put them on favorites and physical buttons, and use them across Activities just like commands from a real device. You can create up to **5 user-managed Wifi Devices** per hub, each with **10 command slots**. The reserved Wifi Events device does not count towards this limit.

### Create and deploy a Wifi Device

1. Open **Automation → Wifi Commands** and select **Add**.
2. Name the device. On eligible X2 setups, also choose **MQTT** or **HTTP** delivery; MQTT is preselected when available. See [HTTP and MQTT delivery](#http-and-mqtt-delivery).
3. Open a command slot, choose **Make Command**, and give the command a display name.
4. Choose where the command should appear or run:
   - as a favorite on the remote display,
   - on a physical button in selected Activities,
   - on a long press of that physical button,
   - when the Wifi Device is powered on or off, or
   - as the Wifi Device's input when an Activity starts.
5. Optionally attach separate Home Assistant Actions for short and long presses. Actions can also be omitted if you plan to automate from `sensor.<hub>_wifi_commands`.
6. Finish the device's configuration, then select **Sync to Hub** once.

The first deployment creates a device and can take several minutes. Hub interactions are blocked while it runs. At the end, the integration asks the physical remote to resynchronize, which can add another few minutes.

Changing only a Home Assistant Action does **not** require a hub sync. The updated Action is used on the next press.

<img height="180" alt="Wifi Command grid and device power controls" src="images/wifi-commands-command-grid.png" /> <img height="180" alt="Wifi Command Activity-start setting" src="images/wifi-commands-slot-advanced.png" /> <img height="180" alt="Wifi Command favorite, button, and Activity settings" src="images/wifi-commands-slot-favorite.png" /> <img height="180" alt="Wifi Command Action editor" src="images/wifi-commands-slot-action.png" />

### What a command slot controls

Each configured slot has one command name and can participate in several hub features:

- **Favorite:** places the command on the remote's display in the selected Activities.
- **Physical button:** binds the command to one button in the selected Activities. Enabling long press creates a separate long-press record and allows a separate Action. These assignments can also make the Wifi Device available as a controller for button groups such as Volume or Playback in the live Activity editor.
- **Power on/off:** one command per Wifi Device can run when the hub powers that device on, and one when it powers it off.
- **Activity start:** one command per Activity can become the Wifi Device's input command and run in that Activity's startup sequence.

A command cannot be both a power command and an Activity-start input. Power and Activity-start commands are unavailable on X1 hubs; see [X1 limitations](#x1-limitations).

### Multiple devices and configuration ownership

Use multiple Wifi Devices to separate logical command groups—for example, lighting scenes and audio presets—or to give those groups different power and input behavior. Each device has its own sync state; syncing one does not rewrite the others.

The Wifi Commands configuration owns the managed device's commands, power/input settings, and button assignments. The live device editor therefore shows these sections as read-only and directs you back to **Automation → Wifi Commands**.

Two exceptions are intentional:

- Renaming the deployed device in **Hub → Devices → Edit** is detected and carried back into the Wifi Commands configuration.
- References created outside Wifi Commands—such as an additional favorite, button binding, or Activity membership added with the Sofabaton app—are preserved by normal in-place syncs.

### HTTP and MQTT delivery

The transport determines how a deployed Wifi Device reports a press to Home Assistant. It does not change how commands, favorites, buttons, power, or Activity inputs are configured.

|                                            | HTTP                                               | MQTT                                                |
| ------------------------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| **Hub support**                            | X1, X1S, and X2                                    | X2 only                                             |
| **Path**                                   | Hub → Sofabaton HTTP listener in this integration  | Hub → MQTT broker → Home Assistant MQTT integration |
| **Default port**                           | TCP `8060` on Home Assistant                       | Broker port, commonly TCP `1883`                    |
| **Hold behavior**                          | Repeats at roughly 4 presses per second while held | Publishes once for the resolved short or long press |
| **Network data stored in command records** | Home Assistant address and listener port           | No Home Assistant address or listener port          |
| **Delivery while Home Assistant is down**  | The hub retries a failed callback                  | QoS 0 messages are not queued and are lost          |

The selected transport is fixed when the device is first deployed. To change it, delete and recreate the Wifi Device. Existing HTTP devices are never migrated automatically.

#### HTTP setup

HTTP is available on every supported hub and is selected automatically when MQTT is unavailable. HTTP-delivered Wifi Commands and all Wifi Events share the integration's callback listener, which uses port `8060` by default.

The integration enables `switch.<hub>_wifi_device` automatically while at least one deployed HTTP device needs the listener and disables it after the last such device is removed. Turning the switch off manually stops HTTP-delivered Actions and sensor updates.

> **Emulated Roku port conflict**
> Emulated Roku commonly uses the same port. If both integrations try to bind `8060`, one listener will fail. The Sofabaton listener port can be changed in the integration's global options for X1S and X2, but changing it breaks X1 compatibility.

The callback listener is intended for a trusted LAN or VLAN, not the public internet. It has no TLS or user authentication. See the [networking and listener security model](networking.md#-security--listener-model) for its source-IP and request validation.

#### MQTT setup on X2

The MQTT option is offered when all of the following are true:

- the hub reports itself as an X2, and
- Home Assistant's MQTT integration is loaded.

Configure the hub's broker host, port, and credentials in the **Sofabaton app**. The hub and Home Assistant MQTT integration must use the same broker, and both must be able to reach it. The integration cannot read or test the hub's broker settings before deployment.

MQTT avoids the Sofabaton HTTP listener and its port `8060`. It does **not** remove the need for broker connectivity: firewall or VLAN rules towards the broker, commonly on TCP `1883`, may still be required. If the broker runs on the Home Assistant host, allow the hub to reach the broker port on that host.

On measured X2 hardware, MQTT reached Home Assistant about **130 ms sooner at the median** than HTTP. Detailed measurements and caveats are recorded in [live hub testing](protocol/live-hub-testing.md#-measured-mqtt-vs-http-callback-latency-x2-2026-08-10).

Broker security is the delivery boundary. Anyone allowed to publish to the hub's press topic can trigger the configured Action. Use broker authentication, give the hub account the narrowest practical ACL, and protect its credentials.

### Wifi Command sync and lifecycle

#### In-place updates

After the first deployment, normal syncs edit only the records that changed. The Wifi Device keeps its hub identity, and external references remain intact. A simple rename or command edit is therefore normally much faster than the first deployment.

#### When a full replacement is required

The integration creates a replacement device, moves the managed references, and then removes the previous device when:

- this is the first deployment,
- this is the first sync after upgrading a deployment created before in-place updates,
- the HTTP listener port changed,
- the managed device was changed in the Sofabaton app after the previous sync, or
- a command was removed from an Activity where the managed Wifi Device was the only remaining device.

Two hub behaviors make replacement or deletion worth planning for:

- **An Activity with no devices is deleted by the hub.** Add another device first or create a backup if a Wifi Device is the only member of an Activity you need to keep.
- **A replaced physical-button binding is not restored automatically.** Removing the Wifi Command clears the binding; it does not restore the function that existed before deployment.

Syncing a configuration with no command slots left removes the deployed hub device without creating a replacement. The empty Wifi Commands configuration remains available in Home Assistant for later reuse, but the same empty-Activity warning applies.

#### Failure and recovery

- A failed first deployment is rolled back, leaving no managed device on the hub.
- When a replacement of an existing managed device is required, the replacement's complete command table is read back before any Activity is changed or the previous device is deleted. If that readback is incomplete, the unreferenced replacement is removed, the existing device is kept unchanged, and the sync reports an error.
- An interrupted in-place update is safe to retry. Completed writes remain, and the next sync continues from the resulting state.
- If a managed Wifi Device is deleted through the Sofabaton app, its saved Wifi Commands configuration remains in Home Assistant. The Control Panel detects the missing device and allows it to be synchronized back to the hub or deleted from the Wifi Commands list.
- Deleting a Wifi Device from **Automation → Wifi Commands** removes both the hub device and its saved command configuration.

Create a hub backup before a large deployment, replacement, or removal.

#### X1 limitations

X1 firmware delivers only one power callback and one Activity-start callback for each Activity transition, regardless of how many Wifi-type devices participate. Power and Activity-start configuration is therefore hidden for X1 hubs. Regular commands, favorites, physical buttons, long presses, and Home Assistant Actions continue to work. X1S and X2 are unaffected.

## ◇ Wifi Events

Wifi Events are named Home Assistant triggers placed inside an Activity as:

- a shortcut on the remote display,
- a short or long physical-button press, or
- a macro step.

They are useful when you want one named trigger without creating and managing a 10-slot Wifi Device. Up to **25 Wifi Events** can exist per hub. Wifi Events work on X1, X1S, and X2.

### Create and deploy a Wifi Event

1. Open **Hub → Activities**, edit an Activity, and open an **Add** dialog for a shortcut, button assignment, or macro step.
2. Choose **Wifi Event**, select an existing event, or choose **Create new Wifi Event…** and enter a name.
3. Save the dialog. The integration stores the event and stages its Activity reference, but nothing is written to the hub yet.
4. Select **Sync** in the Activity editor. The integration deploys or updates the shared Wifi Events device first, then writes the Activity reference.

The first event creates the shared device and can take about a minute. Later updates are normally faster. If the device phase fails, the Activity write does not start and the event remains marked **needs sync**. Retry the Activity sync when the hub is ready.

Leaving the Activity editor without syncing does not discard a newly created event, but it does discard that editor's unsynchronized Activity reference. Add the staged event to an Activity again and sync it.

### Configure Actions and long press

Every staged or deployed event appears under **Automation → Events → Wifi Events**:

- Select its Action link to configure the short-press Action.
- When long press has been enabled for a physical-button binding that targets the event, a second link configures the event's long-press Action.
- Action changes apply immediately and do not require a hub sync.
- A **needs sync** badge describes hub deployment state; it does not prevent you from configuring the Action.

The Events sub-tab manages Actions only. Creating, placing, renaming, and deleting Wifi Events remains part of the live Hub editors and their sync cycle.

### The shared Wifi Events device

All Wifi Events are command records on one reserved hub device named **Wifi Events**. It is hidden from the user-managed Wifi Devices list and does not count towards the five-device limit, but it appears on the remote's device list and in backups.

The shared device currently uses HTTP delivery on every hub model, so it needs the same port `8060` callback listener described under [HTTP setup](#http-setup).

Open **Hub → Devices → Wifi Events → Edit** to maintain deployed definitions:

- Rename the device or an event, then select **Sync**. The Home Assistant configuration follows the hub-side name.
- Delete an event from the Commands section, then select **Sync**. The hub removes its short- and long-press records, shortcuts and button assignments that reference it, its steps from macros, and any macro left with no steps.
- Create new events only from an Activity editor's Add dialogs. Direct command creation on the reserved device is blocked.

### Recover an orphaned Wifi Events configuration

If the shared Wifi Events device is deleted outside the integration—for example by an app synchronization—the integration keeps the event names and Home Assistant Actions rather than discarding them.

The Wifi Events section then offers two recovery paths:

- Add one of the retained events to an Activity and sync that Activity. The integration redeploys the shared device and all retained events before writing the Activity reference.
- Choose **remove this configuration from Home Assistant** to delete all retained Wifi Events and their Actions. This option is available only while the hub-side device is absent.

## ◇ Hub and Activity Events

Unlike Wifi Commands and Wifi Events, these triggers respond to hub state changes rather than remote commands. They live entirely in Home Assistant and need no Wifi Device, callback listener, or hub sync.

### Hub Events

Hub Events provide Actions for hub-wide state changes:

- **When the hub is switched off:** the hub left its Activity and entered the powered-off state.
- **When Off is pressed while already off:** useful for triggering an Action when no Activity is running.
- **When any Activity starts:** runs for every Activity activation.
- **When any Activity stops:** runs when powering off or switching to another Activity.

### Activity Events

Each Activity has independent **start** and **stop** Actions. When switching directly between Activities, the old Activity's stop Action runs before the new Activity's start Action.

Activity Event Actions are stored against the hub's numeric Activity ID. When an authoritative refresh shows that an Activity was deleted, the integration removes the stale Action configuration for that ID.

## ◇ Wifi Commands sensor

`sensor.<hub>_wifi_commands` records the most recent Wifi Command or Wifi Event press, whether the deployed record was activated from the physical remote, the Sofabaton app, or a virtual remote. A configured per-command Action is optional; the sensor can instead be used as an automation trigger.

The state returns to `Waiting for button press` after about 0.3 seconds. Trigger on a change away from the waiting, `unknown`, and `unavailable` states rather than on one fixed command name.

| Attribute          | Example                     | Meaning                                          |
| ------------------ | --------------------------- | ------------------------------------------------ |
| `received_command` | `Scene Movie`               | Configured command or event name                 |
| `from_device`      | `Home Assistant`            | Wifi Device name; `Wifi Events` for a Wifi Event |
| `press_type`       | `short` / `long`            | Resolved press type                              |
| `timestamp`        | `2026-04-28T21:00:00+00:00` | ISO 8601 receipt time                            |
| `source_ip`        | `192.168.1.50`              | Hub IP for HTTP; empty for MQTT                  |
| `transport`        | `http` / `mqtt`             | Delivery transport                               |

State while pressed: `<device>/<command>` or `<device>/<command>/longpress`.

### Sensor automation example

```yaml
triggers:
  - trigger: state
    entity_id: sensor.living_room_wifi_commands

conditions:
  - condition: template
    value_template: >
      {{ trigger.to_state.state not in
         ['Waiting for button press', 'unknown', 'unavailable'] }}

actions:
  - variables:
      command: "{{ trigger.to_state.attributes.received_command }}"

  - choose:
      - conditions:
          - condition: template
            value_template: "{{ command == 'Scene Movie' }}"
        sequence:
          - action: scene.turn_on
            target:
              entity_id: scene.movie_mode

      - conditions:
          - condition: template
            value_template: "{{ command == 'Scene Gaming' }}"
        sequence:
          - action: scene.turn_on
            target:
              entity_id: scene.gaming_mode
```

## ◇ Related entities

The entities most directly related to remote and hub triggers are listed below. See the [entity reference](entities.md) for every entity provided by the integration.

`sensor.<hub>_wifi_commands`  
Records the most recent Wifi Command or Wifi Event press and exposes its name, device, press type, timestamp, source, and transport.

`switch.<hub>_wifi_device`  
Controls the shared HTTP callback listener. It is enabled automatically while an HTTP-delivered Wifi Device or the shared Wifi Events device needs it. MQTT Wifi Devices do not count towards it. Turning it off manually prevents HTTP-delivered Actions and sensor updates.

`button.<hub>_resync_remote`  
Forces the physical remote to resynchronize its hub configuration. Wifi Command and Wifi Event deployments call it automatically after a successful hub sync.

For network paths, firewall rules, and listener validation, see [Networking](networking.md). For low-level hub record details, see the [Wifi Commands protocol notes](protocol/wifi-commands.md).

If a problem persists, [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues) and include [detailed logs](logging.md).

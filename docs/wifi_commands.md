# Trigger Home Assistant from the remote and hub

Use the Sofabaton Control Panel to turn remote commands and hub state changes into Home Assistant Actions. Configuration is split between the **Automation** tab and the Activity and device editors. The Control Panel does not need to remain open.

To control the hub from Home Assistant instead, see the [remote entity guide](remote_entity.md).

## ◇ Choose a workflow

Wifi Commands and Wifi Events overlap: both can connect Home Assistant to remote buttons, display items, macros, Activity power sequences, and inputs. The main difference is where you start and how you navigate the Sofabaton configuration.

| Where are you starting? | Use | How it works |
| --- | --- | --- |
| A Home Assistant behavior you want to make available on the remote | **Wifi Commands** | Define a managed device and its commands, then let the integration translate your choices into Sofabaton configuration. |
| A button, shortcut, macro, sequence, or input you are editing | **Wifi Event** | Place a Home Assistant trigger directly within the Activity editor's Sofabaton hierarchy. |
| The hub turning off or an Activity starting/stopping | **Hub or Activity Event** | Attach an Action to the state transition under **Automation → Events**. |

These are different authoring paths, not strict use-case boundaries. Wifi Commands provide a command-centric abstraction; Wifi Events are editor-native. Their current limits, backing devices, and delivery options also differ as described below.

Selecting an Action link opens Home Assistant's Action selector; the small × resets it to _do nothing_. Action changes apply immediately and never require a hub sync. A row briefly highlights when its event fires while the Control Panel is open.

<img height="220" alt="Automation tab, Wifi Commands sub-tab" src="images/wifi-commands-devices.png" /> <img height="220" alt="Automation tab, Events sub-tab" src="images/automation-events.png" />

## ◇ Wifi Commands

Wifi Commands are the command-centric path: start with a Home Assistant behavior, expose it as a command on a managed Wifi Device, and declare where it should appear or run. The integration batches the required changes across Sofabaton's devices and Activities.

Each hub supports up to **5 user-managed Wifi Devices**, with **10 command slots** per device. The reserved Wifi Events device does not count toward this limit.

### Create and deploy a Wifi Device

1. Open **Automation → Wifi Commands**, select **Add**, and name the device.
2. On eligible X2 setups, choose **MQTT** or **HTTP** delivery. MQTT is preselected when available and the choice cannot be changed after deployment.
3. Open a slot, choose **Make Command**, and name the command.
4. Assign it as needed: favorite, short or long physical-button press, device power on/off, or Activity-start input.
5. Optionally configure separate short- and long-press Actions. You can instead automate from `sensor.<hub>_wifi_commands`.
6. Finish configuring the device, then select **Sync to Hub** once.

The first deployment can take several minutes and blocks hub interactions. The integration then asks the physical remote to resynchronize, which can take a few more minutes. Later in-place updates are normally much faster.

### Command slot options

| Option | Effect |
| --- | --- |
| **Favorite** | Shows the command on the remote in selected Activities. |
| **Physical button** | Binds it to one button in selected Activities. Long press creates a separate record and Action. Assignments may also make the device a controller for groups such as Volume or Playback. |
| **Power on/off** | Runs one selected command when the device powers on and another when it powers off. |
| **Activity start** | Uses one selected command as the device input during an Activity's startup sequence. |

A command cannot be both a power command and an Activity-start input. These two options are unavailable on X1 hubs; regular commands, favorites, physical buttons, long presses, and Actions still work.

Use separate Wifi Devices for logical groups such as lighting scenes and audio presets, or when groups need different power/input behavior. Each device syncs independently.

Wifi Commands owns the managed device's commands, power/input settings, and button assignments, so those sections are read-only in the live device editor. Two kinds of external change are preserved:

- A device rename in **Hub → Devices → Edit** is copied back into Wifi Commands.
- Extra references added elsewhere, such as favorites, button bindings, or Activity membership, survive normal in-place syncs.

### HTTP and MQTT delivery

Transport affects only how a press reaches Home Assistant.

| | HTTP | MQTT |
| --- | --- | --- |
| **Hub support** | X1, X1S, X2 | X2 only |
| **Path** | Hub → integration listener | Hub → broker → Home Assistant MQTT integration |
| **Default port** | TCP `8060` on Home Assistant | Broker port, commonly TCP `1883` |
| **Hold behavior** | Repeats at about 4 presses/second | Publishes once for the resolved short or long press |
| **Command record stores** | Home Assistant address and listener port | No Home Assistant address or port |
| **If Home Assistant is down** | Hub retries a failed callback | QoS 0 messages are not queued |

The transport is fixed at first deployment. To change it, delete and recreate the Wifi Device; existing HTTP devices are never migrated automatically.

#### HTTP setup

HTTP is available on all supported hubs and selected automatically when MQTT is unavailable. HTTP Wifi Commands and all Wifi Events share the callback listener on port `8060` by default. `switch.<hub>_wifi_device` is enabled while an HTTP Wifi Device or the shared Wifi Events device needs it, then disabled after the last one is removed. Turning it off manually stops HTTP Actions and sensor updates.

Emulated Roku commonly uses the same port. If `8060` is already bound, change the Sofabaton listener port in the integration's global options on X1S or X2. A different port is incompatible with X1.

The listener has no TLS or user authentication and must remain on a trusted LAN or VLAN. See the [networking and listener security model](networking.md#-security--listener-model) for validation and firewall details.

#### MQTT setup on X2

MQTT is offered only when the hub identifies as X2 and Home Assistant's MQTT integration is loaded. Configure the broker host, port, and credentials in the **Sofabaton app**. The hub and Home Assistant must use and be able to reach the same broker; the integration cannot read or test the hub's broker settings before deployment.

MQTT avoids port `8060`, but still requires broker connectivity, commonly on TCP `1883`. Use authentication and a narrowly scoped ACL: anyone allowed to publish to the hub's press topic can trigger its Actions. On measured X2 hardware, MQTT's median delivery was about **130 ms faster** than HTTP; see [live hub testing](protocol/live-hub-testing.md#-measured-mqtt-vs-http-callback-latency-x2-2026-08-10).

### Sync, replacement, and recovery

| Change | Result |
| --- | --- |
| Home Assistant Action only | Applies immediately; no sync. |
| Normal command, name, or assignment edit | Updates changed records in place and preserves device identity and external references. |
| No command slots remain | Removes the hub device but keeps the empty Home Assistant configuration for reuse. |
| Delete in **Automation → Wifi Commands** | Removes both the hub device and saved configuration. |
| Delete through the Sofabaton app | Keeps the saved configuration; sync it back to the hub or delete it in Wifi Commands. |

A full replacement is required for the first deployment, the first sync of a legacy deployment, a changed HTTP listener port, a managed device edited in the Sofabaton app since its last sync, or a command removed from an Activity where the managed Wifi Device was the only remaining device.

Before a replacement or deletion, note that:

- The hub deletes an Activity with no devices. Add another device first or create a backup.
- Removing a Wifi Command clears its physical-button binding; the previous binding is not restored.

Failed first deployments are rolled back. During replacement, the integration verifies the new command table before changing Activities or deleting the old device; failed verification removes the unused replacement and keeps the old device. Interrupted in-place updates are safe to retry.

Create a hub backup before a large deployment, replacement, or removal.

#### X1 limitations

X1 firmware sends only one power and one Activity-start callback per Activity transition, regardless of the number of Wifi-type devices. Those options are therefore hidden on X1. X1S and X2 are unaffected.

## ◇ Wifi Events

A Wifi Event is the editor-native path: start from the place where something should happen, then add a named Home Assistant trigger there. Events can be used in Activity shortcuts, short or long physical-button bindings, macros, startup and shutdown sequences, and Activity inputs. The editor batches the dependent Sofabaton changes when you sync.

Each hub supports up to **25 Wifi Events** on X1, X1S, and X2.

### Create and deploy a Wifi Event

1. Open **Hub → Activities** and edit the Activity where the event should run.
2. Open the relevant shortcut, button, macro, power-sequence, or input control.
3. Choose **Wifi Event**, then select an event or **Create new Wifi Event…**.
4. Save the change, then select **Sync** in the Activity editor. The integration deploys the shared Wifi Events device before writing the Activity reference.

The first event can take about a minute; later updates are normally faster. If device deployment fails, the Activity is not changed and the event remains **needs sync**. Retry when the hub is ready.

Leaving without syncing keeps a newly created event but discards its unsynchronized Activity reference. Add it to the Activity again and sync.

### Actions and event maintenance

All staged and deployed events appear under **Automation → Events → Wifi Events**. Configure the short-press Action there; a long-press Action appears after long press is enabled on a physical-button binding. **Needs sync** describes deployment state but does not prevent Action configuration.

All events live on one reserved hub device named **Wifi Events**. It is hidden from the user-managed Wifi Devices list and does not count toward the five-device limit, but appears in the remote's device list and in backups. Wifi Events currently use HTTP on every hub model and therefore need the [shared callback listener](#http-setup).

Use **Hub → Devices → Wifi Events → Edit** to maintain deployed events:

- Rename the device or an event, then select **Sync**. Home Assistant follows the hub-side name.
- Delete an event, then select **Sync**. This also removes its short/long records and references from shortcuts, buttons, macros, power sequences, and inputs, including any macro left empty.
- Create new events only from an Activity editor; direct command creation on this device is blocked.

If the shared device is deleted outside the integration, event names and Actions remain in Home Assistant. Either add a retained event to an Activity and sync to redeploy them all, or choose **remove this configuration from Home Assistant** while the hub device is absent.

## ◇ Hub and Activity Events

These triggers need no Wifi Device, callback listener, or hub sync. Configure them under **Automation → Events**.

| Trigger | When it runs |
| --- | --- |
| **Hub switched off** | The current Activity stops and the hub enters the powered-off state. |
| **Off pressed while already off** | Off is pressed while no Activity is running. |
| **Any Activity starts** | Every Activity activation. |
| **Any Activity stops** | Powering off or switching to another Activity. |
| **Activity start/stop** | The selected Activity starts or stops. During a switch, the old Activity's stop Action runs before the new Activity's start Action. |

Activity Actions are stored by numeric Activity ID and removed when an authoritative refresh shows that the Activity was deleted.

## ◇ Wifi Commands sensor

`sensor.<hub>_wifi_commands` records the latest Wifi Command or Wifi Event activated from the physical remote, Sofabaton app, or virtual remote. A per-command Action is optional.

The state is `<device>/<command>` (or `<device>/<command>/longpress`) and returns to `Waiting for button press` after about 0.3 seconds. Automations should trigger on a change away from the waiting, `unknown`, and `unavailable` states instead of one fixed command name.

| Attribute | Meaning |
| --- | --- |
| `received_command` | Command or event name |
| `from_device` | Wifi Device name; `Wifi Events` for an event |
| `press_type` | `short` or `long` |
| `timestamp` | ISO 8601 receipt time |
| `source_ip` | Hub IP for HTTP; empty for MQTT |
| `transport` | `http` or `mqtt` |

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

## ◇ Related entities and guides

| Entity | Purpose |
| --- | --- |
| `sensor.<hub>_wifi_commands` | Latest Wifi Command or Wifi Event press and its metadata |
| `switch.<hub>_wifi_device` | Shared HTTP callback listener; MQTT devices do not need it |
| `button.<hub>_resync_remote` | Manually resynchronizes the physical remote; deployments also call it automatically |

See the complete [entity reference](entities.md), [networking guide](networking.md), and [Wifi Commands protocol notes](protocol/wifi-commands.md). If a problem persists, [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues) and include [detailed logs](logging.md).

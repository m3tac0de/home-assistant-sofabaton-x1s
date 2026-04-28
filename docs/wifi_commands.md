# Automation Assist: Wifi Commands

Run Home Assistant Actions when buttons are pressed on the physical remote.

In the **Sofabaton Control Panel** card, open the **Wifi Commands** tab. Up to **5 Wifi Devices** can be created per hub, each with 10 command slots.

1. **Add a Wifi Device**: Give it a name. Multiple devices are useful if you want separate logical groups of commands or separate power/input configurations per device.
2. **Make a new command**: Give it a name, assign it to a physical button and/or make it a favorite. Decide which Activities to deploy it to.
3. **Configure power / input** (optional): Mark a command as the device's Power ON or Power OFF command. Alternatively, a command can be configured to be an INPUT of the Wifi Device, and assigned to an Activity. The commands become part of the Activity's startup and shutdown sequences.
4. **Configure an Action** to run whenever a key with the new command is pressed. These Actions run within the Home Assistant backend, the card is only there for configuration. **Configuring an Action is optional**: all Wifi Commands update status in `sensor.<hub>_wifi_commands`, so automations can be built to trigger from it.
5. **Sync to hub** once configuration is completed. This will deploy the configuration directly to the hub.

> - Synchronization may take several minutes. During this time all other interactions with the hub are blocked.
> - Once configuration is successfully deployed to the hub, the physical remote is instructed to synchronize, which may take another few minutes to complete.
> - Due to the above, it is best to create a complete configuration before deploying to the hub. **Note that Actions can be modified without the need to resync; you can add/remove and change them at any time**.

## How this works

Sofabaton hubs support a feature that it calls "Wifi Devices". Different types of these devices are supported on different hub versions, but what they have in common is that they achieve device control by sending HTTP requests, directly to that device.

What **Wifi Commands** does:

- Provides a mechanism for creating a "command configuration", which contains Command names, the physical button to attach it to, whether to create it as a favorite, the Activities to deploy it to and the Action to run whenever the command is triggered.
- Provides an HTTP Listener / Wifi Device to receive HTTP requests inbound from the hub.
- Deploys a Wifi Device to the hub, fully configured to contain the intended Command Names and correctly configured callback URLs. The type of device created depends on hub version.
- Directly runs the configured Action when a command key is pressed on the physical remote, if one was configured.
- Updates the status of `sensor.<hub>_wifi_commands` whenever a command key is pressed on the physical remote.

## Multiple Wifi Devices

Up to **5 Wifi Devices** can be created per hub. Each device has its own name, its own set of 10 command slots, and its own power/input configuration. This is useful for:

- Separating commands by logical group (e.g. one device for lighting scenes, another for audio presets).
- Assigning different power-on/off commands to different activities.

Devices are managed in the **Wifi Commands** tab of the Control Panel card. Each device is independent: syncing one device does not affect the others.

## Power control

Each Wifi Device can have a dedicated **Power ON** command and a **Power OFF** command.

The hub treats the Wifi Device as a real device, and will trigger power commands whenever an Activity change requires it.  
The commands are called in the startup and shutdown sequences of any Activity that has a command assigned from the Wifi Device.

## Input control

One or more commands in a Wifi Device can be designated as **INPUTS** and assigned an Activity.  
These commands are called whenever the Activity is started, as part of its startup sequence.

## Configuration

The **Wifi Commands** feature uses an HTTP listener that will by default attempt to bind to port `8060`.

> **⚠️ Emulated Roku**  
> If you are currently using Emulated Roku, these ports will conflict, causing either Emulated Roku or Wifi Commands to fail.

The port the HTTP listener binds to can be changed in the integration's general config, but doing so will break X1 compatibility. Other hub versions can freely change ports.
Detailed networking documentation is [here](networking.md).

## `sensor.<hub>_wifi_commands`

Updates whenever a Wifi Command key is pressed. Use it to build automations that respond to
any command without configuring individual Actions per command.

**State** resets to `Waiting for button press` after a short delay, so trigger on the
state _changing away_ from that value rather than on a specific command name.

**Attributes** at the moment of the press:

| Attribute          | Example value               | Description                 |
| ------------------ | --------------------------- | --------------------------- |
| `received_command` | `Scene Movie`               | Command name as configured  |
| `from_device`      | `Home Assistant`            | Wifi Device name            |
| `press_type`       | `short` / `long`            | Short or long press         |
| `timestamp`        | `2026-04-28T21:00:00+00:00` | ISO 8601 time of the press  |
| `source_ip`        | `192.168.1.50`              | IP the hub called back from |

**State value** when pressed: `<device>/<command>` or `<device>/<command>/longpress`  
**State value** at rest: `Waiting for button press`

### Automation example

```yaml
trigger:
  - platform: state
    entity_id: sensor.<hub>_wifi_commands
    not_to: "Waiting for button press"
action:
  - if:
      - condition: template
        value_template: "{{ trigger.to_state.attributes.received_command == 'Scene Movie' }}"
    then:
      - action: scene.turn_on
        target:
          entity_id: scene.movie_mode
```

## Relevant entities

`sensor.<hub>_wifi_commands`  
Updates status whenever a Wifi Command key is pressed on the physical remote, the app or the virtual remote. Used for Automation triggers.

`switch.<hub>_wifi_device`  
Enables/Disables the HTTP listener / Wifi Device. Switched off by default. Automatically switched on when deploying Wifi Commands to the hub. Automatically switched off when removing all Wifi Commands.

`button.<hub>_resync_remote`  
Forces a resync of the physical remote. Automatically called at the end of a hub synchronization sequence.

## Recovery

- This feature involves reconfiguring the hub, it is therefore a good idea to create a backup of your hub configuration before using this feature.
- if at any stage deployment of the Wifi Device fails, a rollback is performed and no trace will be left on the hub
- manual removal: this feature creates a Device on the Sofabaton hub. Removing it through the app is safe and removes the Wifi Commands configuration from your hub. The integration will notice hub configuration is no longer in sync, and provides the option to re-sync.

Please [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues) in case of any problems, make sure to [include detailed logs](logging.md).

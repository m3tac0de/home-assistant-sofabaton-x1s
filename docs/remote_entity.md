# Remote entity guide

Each configured Sofabaton hub provides a `remote` entity for controlling it from your own dashboards or custom UIs, automations, and scripts. In the examples below, replace `remote.<hub>_remote` with the entity created for your hub, such as `remote.living_room_remote`.

To go in the other direction and trigger Home Assistant from remote or hub activity, see the [remote and hub trigger guide](wifi_commands.md).

For the `remote` entity and other available control, state, and diagnostic entities, see the [entity reference](entities.md).

## ◇ Send a button in the current Activity

When no `device` is supplied, the command is resolved in the context of the currently active Activity:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: VOL_UP
```

This mode requires an active Activity. If the hub is powered off, the action reports that no Activity is active.

Supported button names are:

```text
UP, DOWN, LEFT, RIGHT, OK, HOME, BACK, MENU,
VOL_UP, VOL_DOWN, MUTE, CH_UP, CH_DOWN,
REW, PLAY, PAUSE, FWD, GUIDE, DVR, EXIT,
RED, GREEN, YELLOW, BLUE, A, B, C,
POWER_ON, POWER_OFF
```

The extended buttons `A`, `B`, `C`, `EXIT`, `DVR`, `PLAY`, and `GUIDE` are intended for X2 hubs. Button names are case-insensitive, but using the uppercase names above makes automations easier to read.

## ◇ Send several buttons

Pass a list to send commands sequentially:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command:
    - HOME
    - MENU
```

## ◇ Wait between commands

`delay_secs` inserts a pause between the commands of a single `remote.send_command` action. It is applied between commands only, so nothing is added before the first or after the last one:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command:
    - HOME
    - MENU
    - OK
  delay_secs: 0.5
```

When `delay_secs` is omitted the commands are sent back-to-back. Use it when a device needs time to react before it accepts the next command, for example when navigating a menu.

## ◇ Send a command directly by ID

Use this form when you know the numeric command ID and the Device or Activity that owns it:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command: 12
  device: 3
```

Important details:

- `command` is the numeric command ID.
- Despite the field name, `device` may contain either a **Device ID** or an **Activity ID**.
- Device IDs start at `1`; Activity IDs start at `101`.
- Supplying `device` bypasses the current Activity.
- Direct targeting requires the numeric command ID; named buttons such as `VOL_UP` belong to the current activity mode.

You can also send several numeric commands to the same target:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  command:
    - 12
    - 15
  device: 3
```

## ◇ Start or switch Activity

```yaml
action: remote.turn_on
target:
  entity_id: remote.<hub>_remote
data:
  activity: Watch a movie
```

The Activity name must match the name on the hub.

## ◇ Power off

```yaml
action: remote.turn_off
target:
  entity_id: remote.<hub>_remote
```

## ◇ Find Device, Activity, and command IDs

Choose whichever method best fits your workflow:

1. **Virtual Remote (recommended):** enable [General Options → Key capture](https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md). Press a key to receive the IDs and ready-to-use YAML in a Home Assistant notification.
2. **Control Panel:** enable persistent cache, browse the Hub tab, and inspect the relevant Activity, Device, or command.

The sending entities are unavailable while the official Sofabaton app is connected to the proxy.

# Entity reference

Each configured hub provides entities for controlling Sofabaton from Home Assistant, using remote and hub activity in automations, and managing the integration. Home Assistant generates default entity IDs from the hub name; the tables use `<hub>` as a placeholder. Entity IDs can be renamed in Home Assistant.

## ◇ Control the hub from Home Assistant

Use these entities in dashboards or custom UIs, automations, and scripts.

| Platform | Default entity                                   | Purpose                              |
| -------- | ------------------------------------------------ | ------------------------------------ |
| Remote   | `remote.<hub>_remote`                            | Send commands and control Activities |
| Select   | `select.<hub>_activity`                          | View or change the current Activity  |
| Button   | `button.<hub>_volume_up`, `button.<hub>_mute`, … | Send Activity-aware commands         |

For `remote.send_command`, `remote.turn_on`, and `remote.turn_off` examples, see the [remote entity guide](remote_entity.md).

## ◇ Use hub and remote activity in automations

These entities expose state changes and received commands to Home Assistant.

| Platform      | Default entity                              | Purpose                                                         |
| ------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Sensor        | `sensor.<hub>_activity`                     | Current Activity, including while the app is connected          |
| Sensor        | `sensor.<hub>_wifi_commands`                | Latest Wifi Command or Wifi Event press                         |
| Binary sensor | `binary_sensor.<hub>_hub_connected`         | Physical hub connection state                                   |
| Binary sensor | `binary_sensor.<hub>_app_connected`         | Official-app proxy connection state                             |

For Wifi Commands, Wifi Events, Hub Events, Activity Events, and a sensor automation example, see the [remote and hub trigger guide](wifi_commands.md).

## ◇ Configuration, maintenance, and diagnostics

| Platform | Default entity                     | Purpose                                                                                                                                          |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sensor   | `sensor.<hub>_index`               | Diagnostic Activity, Device, command, macro, and favorite index                                                                                  |
| Switch   | `switch.<hub>_proxy_enabled`       | Enable or disable proxy discovery and listening                                                                                                  |
| Switch   | `switch.<hub>_hex_logging`         | Enable detailed protocol logging                                                                                                                 |
| Switch   | `switch.<hub>_wifi_device`         | Control the shared HTTP callback listener; re-enables itself while an HTTP-delivered Wifi Device or the Wifi Events device needs it              |
| Button   | `button.<hub>_find_remote`         | Sound the physical remote's buzzer                                                                                                               |
| Button   | `button.<hub>_resync_remote`       | Synchronize the physical remote                                                                                                                  |
| Text     | `text.<hub>_ip_address`            | Override the stored hub IP; disabled by default                                                                                                  |

## ◇ Availability while the Sofabaton app is connected

Entities that write to the hub become unavailable while the official Sofabaton app is connected through the proxy. This prevents competing commands and configuration writes. Diagnostic and state-reporting entities remain available where possible.

Use `binary_sensor.<hub>_app_connected` to check whether the app owns the connection and `binary_sensor.<hub>_hub_connected` to check the physical hub connection. Close the app to return control to Home Assistant.

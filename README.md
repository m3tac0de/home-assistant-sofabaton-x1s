# Sofabaton X for Home Assistant

Local, bidirectional control of Sofabaton **X1**, **X1S**, and **X2** hubs from Home Assistant.

[![HACS Default](https://img.shields.io/badge/HACS-Default-green.svg)](#-installation)
[![Latest release](https://img.shields.io/github/v/release/m3tac0de/home-assistant-sofabaton-x1s)](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/m3tac0de/home-assistant-sofabaton-x1s/total)](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/releases)

**Sofabaton X** connects directly to your hub using local APIs. It can control the hub, expose remote presses and hub events to Home Assistant, edit hub configuration, and let the official Sofabaton app continue to work through a built-in local proxy.

> [!NOTE]
> This is an unofficial community project and is not affiliated with or endorsed by Sofabaton.

## ◇ Start here

- [Install and add your hub](#-installation)
- [Understand the local proxy](#-how-the-local-proxy-works)
- [Add the dashboard cards](#-dashboard-cards)
- [Control the hub from dashboards, automations, and scripts](#control-the-hub-from-home-assistant)
- [Trigger Home Assistant from the remote or hub](#trigger-home-assistant-from-the-remote-and-hub)
- [Back up, restore, and edit your hub](#-advanced-features)
- [Solve discovery, VLAN, or connection problems](#-troubleshooting)

## ◇ Compatibility

| Capability                        | X1  | X1S | X2  |
| --------------------------------- | :-: | :-: | :-: |
| Local hub control                 | Yes | Yes | Yes |
| Automatic discovery               | Yes | Yes | Yes |
| Multiple hubs                     | Yes | Yes | Yes |
| Official-app proxy                | Yes | Yes | Yes |
| HTTP-delivered Wifi Commands      | Yes | Yes | Yes |
| MQTT-delivered Wifi Commands      | No  | No  | Yes |
| Live editing, backup, and restore | Yes | Yes | Yes |

Requirements:

- Home Assistant **2026.1 or newer**
- A Sofabaton X1, X1S, or X2 hub
- Network access between Home Assistant and the hub
- Permission for Home Assistant to accept inbound TCP connections from the hub
- Inbound UDP access if you want to use the official app through the proxy

For ports, firewall rules, containers, VLANs, and iOS discovery behavior, see the [networking guide](docs/networking.md).

## ◇ Installation

> [!IMPORTANT]
> Disconnect or fully close the Sofabaton app before installing the integration and adding the hub.

### HACS (recommended)

1. Open **HACS**.
2. Search for **Sofabaton X**.
3. Select **Download**.
4. Restart Home Assistant.

### Manual installation

1. Download [`sofabaton_x1s.zip`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/releases/latest/download/sofabaton_x1s.zip) from the latest release.
2. Extract it to `/config/custom_components/sofabaton_x1s/`.
3. Confirm that `/config/custom_components/sofabaton_x1s/manifest.json` exists.
4. Restart Home Assistant.

Installing files directly from a source branch may give you unreleased code. Use the release archive unless you are intentionally testing a development version.

### Add a hub

After Home Assistant has restarted:

1. Go to **Settings → Devices & services**.
2. Home Assistant begins discovery only after it has **fully started**. Then, allow up to one minute for hubs to appear. Select the discovered Sofabaton hub and follow the configuration flow.
3. If discovery does not find it, select **Add integration**, search for **Sofabaton X**, and enter the hub IP address manually.

If the hub is on another VLAN or subnet, see the [networking guide](docs/networking.md).

### Disable X2 discovery

X2 discovery is enabled by default. To disable it, add the following to `configuration.yaml` and restart Home Assistant:

```yaml
sofabaton_x1s:
  enable_x2_discovery: false
```

## ◇ How the local proxy works

A Sofabaton hub normally accepts only one client connection at a time. Sofabaton X keeps that connection and presents a virtual hub to the official Sofabaton app:

1. The integration connects to the physical hub.
2. It advertises a virtual hub for the official app.
3. Home Assistant and the app take turns as the active writer.

While the app is connected to the proxy, entities that can write to the hub are intentionally unavailable. This prevents competing commands and configuration writes. Close the app to return control to Home Assistant.

Use `binary_sensor.<hub>_app_connected` to check whether the app owns the connection and `binary_sensor.<hub>_hub_connected` to check the physical hub connection. The current activity sensor remains available in both states.

## ◇ Dashboard cards

The integration includes two dashboard cards and deploys them automatically.

### Sofabaton Virtual Remote

The **Sofabaton Virtual Remote** is the everyday control surface. It can start Activities, send commands, expose favorites and macros, and generate ready-to-use automation YAML through **Automation Assist → Key capture**.  
In the card's **Device mode** the remote controls a single hub device, with that device's own key bindings and full searchable command list, independent of Activities ([documentation](https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/device_mode.md)).

Add the card from the dashboard card picker or use YAML, replacing the entity with the `remote` entity created for your hub:

```yaml
type: custom:sofabaton-virtual-remote
entity: remote.<hub>_remote
```

[Virtual Remote documentation](https://github.com/m3tac0de/sofabaton-virtual-remote#-configuration)

<img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-01.png" width="220" alt="Sofabaton Virtual Remote showing Activity controls"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-02.png" width="220" alt="Sofabaton Virtual Remote showing remote buttons"> <img src="https://raw.githubusercontent.com/m3tac0de/sofabaton-virtual-remote/refs/heads/main/screenshots/virtual-remote-03.png" width="220" alt="Sofabaton Virtual Remote configuration editor">

The card is also available as a separate HACS frontend plugin. If the integration detects that HACS manages the card, it stops deploying its bundled copy after the next Home Assistant restart.

### Sofabaton Control Panel

The **Sofabaton Control Panel** is the management interface for hub configuration, automation hooks, backups, and diagnostics. Add it from the dashboard card picker or use YAML:

```yaml
type: custom:sofabaton-control-panel
card_height: 700
```

Its main areas are:

- **Hub**: browse and edit Activities, Devices, commands, inputs, power behavior, button assignments, shortcuts, and macros.
- **Automation**: configure Home Assistant Actions triggered by Wifi Commands, Wifi Events, Hub Events, and Activity Events.
- **Backup**: create and restore whole-hub or selected device backups.
- **Settings and Logs**: manage caching, network listeners, diagnostic logging, Find Remote, physical remote synchronization, and live hub logs.

Edits are reviewed before synchronization. The card also prevents conflicting writes while the Sofabaton app or another hub operation is active.

<img height="250" alt="Control Panel Hub tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/control-panel-hub-tab.png"> <img height="250" alt="Control Panel Automation tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/automation-events.png"> <img height="250" alt="Control Panel Backup tab" src="https://raw.githubusercontent.com/m3tac0de/home-assistant-sofabaton-x1s/main/docs/images/control-panel-backup-tab.png">

## ◇ Control and automation

Sofabaton X works in both directions: Home Assistant can control the hub, and activity on the remote or hub can trigger Home Assistant.

### Control the hub from Home Assistant

Use the integration's entities and actions in your own dashboards or custom UIs, automations, and scripts. Each configured hub provides a `remote` entity for starting or switching Activities, powering off the hub, and sending one or more commands. Named buttons target the current Activity; numeric IDs can target a Device or Activity directly. Optional delays are supported for command sequences.

For action examples, supported button names, numeric-ID targeting, and ways to find IDs, see the [remote entity guide](docs/remote_entity.md).

The sending entities are unavailable while the official Sofabaton app is connected to the proxy.

### Trigger Home Assistant from the remote and hub

The Control Panel supports several ways for remote and hub activity to trigger Home Assistant Actions.

#### Wifi Commands

Use **Automation → Wifi Commands** to create up to five managed Wifi Devices per hub, each with ten command slots. A command can:

- run a Home Assistant Action;
- appear as a favorite or physical-button assignment;
- participate in Activity power or input behavior; or
- update `sensor.<hub>_wifi_commands` for use in your own automations.

HTTP delivery works on every supported hub. X2 can also deliver new Wifi Commands through Home Assistant's MQTT integration when the hub and Home Assistant use the same MQTT broker.

Action-only changes do not require a hub synchronization. Creating or structurally changing a managed Wifi Device does.

#### Wifi Events

A Wifi Event is a named Home Assistant trigger placed in an Activity shortcut, physical-button assignment, or macro. Wifi Events are useful when you want a single action without creating a complete ten-slot Wifi Device.

Create and place the event from the Activity editor, synchronize the Activity, then attach its Action under **Automation → Events**.

#### Hub and Activity Events

Under **Automation → Events**, Actions can also respond to:

- an Activity starting or stopping;
- the hub being switched off;
- Off being pressed while the hub is already off; or
- individual Activity start and stop transitions.

These Actions run entirely in Home Assistant and are never synchronized to the hub.

For configuration, delivery choices, limits, and automation examples, see the [remote and hub trigger guide](docs/wifi_commands.md).

## ◇ Entities

The integration provides entities for both automation directions: remotes, selects, and buttons control the hub, while sensors expose Activity changes, Wifi Command presses, and connection state as automation inputs. Additional entities manage the proxy, listener, diagnostics, and maintenance tasks.

See the [entity reference](docs/entities.md) for default entity IDs, purposes, and availability behavior.

## ◇ Advanced features

| Feature                                                             | Documentation                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control, automation, configuration, and diagnostic entities         | [Entity reference](docs/entities.md)                                                                                                              |
| Remote entity actions, button names, and numeric-ID targeting       | [Remote entity guide](docs/remote_entity.md)                                                                                                      |
| Wifi Commands, Wifi Events, Hub Events, and Activity Events         | [Remote and hub trigger guide](docs/wifi_commands.md)                                                                                             |
| Whole-hub and selective backup and restore                          | [Backup guide](docs/backup.md)                                                                                                                    |
| Retrieve, test, edit, generate, save, and share IR command payloads | [Command payload guide](docs/command_payloads.md)                                                                                                 |
| VLANs, ports, containers, firewalls, and app discovery              | [Networking guide](docs/networking.md)                                                                                                            |
| Diagnostic logging and issue-report information                     | [Logging guide](docs/logging.md)                                                                                                                  |
| Standalone Python protocol library                                  | [`sofabaton-x`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofabaton-x) and [PyPI](https://pypi.org/project/sofabaton-x/) |

## ◇ Frequently asked questions

<details>
<summary><strong>Can the integration detect every button pressed on the physical remote?</strong></summary>

No. The hub does not provide a general stream of every physical button press.

Use Wifi Commands for selected physical buttons, or place a Wifi Event in an Activity shortcut, button assignment, or macro. You can also respond to hub power and Activity transitions through Automation Events.

</details>

<details>
<summary><strong>Can I use Pronto HEX with my Sofabaton hub?</strong></summary>

Yes. Use the [IrScrutinizer exporters](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/IrScrutinizer) to generate Sofabaton-compatible commands from Pronto HEX signals.

For more information about command payloads on Sofabaton hubs and how this integration interacts with them, see the [command payload guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/command_payloads.md).

</details>

<details>
<summary><strong>How does this differ from the alternative X2 MQTT integration?</strong></summary>

The official [Sofabaton Hub integration](https://github.com/yomonpet/ha-sofabaton-hub) is X2-only and uses MQTT for hub entities and control.

Sofabaton X supports X1, X1S, and X2 through a direct local connection. It also provides live hub editing, local backup and restore, Wifi Events, Automation Events, command-payload tools, and a proxy for the official Sofabaton app. On X2, MQTT is optionally available as the delivery path for Wifi Command presses.

</details>

<details>
<summary><strong>Can both X2 integrations run at the same time?</strong></summary>

Yes. They use different Home Assistant integration domains and can coexist on the same X2 hub. If both use the same MQTT broker, their topic subscriptions do not conflict. Choose which integration's entities to use in each dashboard or automation.

</details>

<details>
<summary><strong>Why are command entities unavailable?</strong></summary>

The official Sofabaton app is probably connected through this integration's proxy. Command entities are disabled while the app owns the hub connection to prevent competing writes.

Check `binary_sensor.<hub>_app_connected` and `binary_sensor.<hub>_hub_connected`, then close the app to return control to Home Assistant.

</details>

## ◇ Troubleshooting

- **Discovery, VLAN, firewall, container, or iOS proxy problem:** read the [networking guide](docs/networking.md).
- **Need useful logs for an issue report:** follow the [logging guide](docs/logging.md).
- **Found a bug or need help:** [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).

When reporting a problem, include your Home Assistant version, integration version, hub model and firmware, installation method, relevant diagnostics, and the smallest reproducible example.

## ◇ Contributing

Development setup, repository structure, test commands, and release information are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## ◇ License

[MIT](LICENSE) © 2026 m3tac0de

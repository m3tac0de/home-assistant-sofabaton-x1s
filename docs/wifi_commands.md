# Automation Assist: Wifi Commands

Run Home Assistant Actions when buttons are pressed on the physical remote.  


In the **Sofabaton Virtual Remote** card's configuration editor, under **Automation Assist > Wifi Commands** 10 slots are available for custom commands.
These commands are deployed to the hub, from the UI, after which physical keypresses trigger Home Assistant Actions directly.

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

## How this works
Sofabaton hubs support a feature that it calls "Wifi Devices". Different types of these devices are supported on different hub versions, but what they have in common is that they achieve device control by sending HTTP requests, directly to that device.
  
What **Wifi Commands** does:
- Provides a mechanism for creating a "command configuration", which contains Command names, the physical button to attach it to, whether to create it as a favorite, the Activities to deploy it to and the Action to run whenever the command is triggered.
- Provides an HTTP Listener / Wifi Device to receive HTTP requests inbound from the hub.
- Deploys a Wifi Device to the hub, fully configured to contain the intended Command Names and correctly configured callback URLs. The type of device created depends on hub version.
- Directly runs the configured Action when a command key is pressed on the physical remote, if one was configured.
- Updates the status of `sensor.<hub>_wifi_commands` whenever a command key is pressed on the physical remote.

## Configuration
The **Wifi Commands** feature uses an HTTP listener that will by default attempt to bind to port `8060`.  
> **⚠️  Emulated Roku**  
> If you are currently using Emulated Roku, these ports will conflict, causing either Emulated Roku or Wifi Commands to fail.

The port the HTTP listener binds to can be changed in the integration's general config, but doing so will break X1 compatibility. Other hub versions can freely change ports. 
Detailed networking documentation is [here](networking.md).

## Relevant entities
`sensor.<hub>_wifi_commands`  
Updates status whenever a Wifi Command key is pressed on the physical remote, the app or the virtual remote. Used for Automation triggers.

`switch.<hub>_wifi_device`  
Enables/Disables the HTTP listener / Wifi Device. Switched off by default. Automatically switched on when deploying Wifi Commands to the hub. Automatically switched off when removing all Wifi Commands.

`button.<hub>_resync_remote`  
Forces a resync of the physical remote. Automatically called at the end of a hub synchronization sequence.

## State of the feature  
This has been built for robustness and security, and has been extensively tested across all hub versions.
- significantly fortified HTTP listener
- if at any stage deployment of the Wifi Device fails, a rollback is performed and no trace will be left on the hub
- manual removal: this feature creates a Device on the Sofabaton hub. Removing it through the app is safe and removes the Wifi Commands configuration from your hub. The integration will notice hub configuration is no longer in sync, and provides the option to re-sync.

This feature involves reconfiguring the hub, it is therefore a good idea to create a backup of your hub configuration before using this feature.  
Please [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues) in case of any problems, make sure to [include detailed logs](logging.md).

# Logging and diagnostics for Sofabaton X1/X1S

This guide shows how to enable detailed logging for the integration, capture the Home Assistant log file or diagnostics, and safely share them. Paths and menu names match Home Assistant 2024.4+.

## Turn on hex logging on the hub device
1. In Home Assistant, open **Settings → Devices & services**.
2. Select **Sofabaton X1/X1S** and open the hub device.
3. Locate the entity named `switch.<hub>_hex_logging` and toggle it **on**.
4. Reproduce the issue while hex logging is enabled.
5. Toggle `switch.<hub>_hex_logging` **off** after collecting logs to reduce noise.

## Enable debug logging for the integration
Add the following to `configuration.yaml`, then reload logging or restart Home Assistant:

```yaml
logger:
  logs:
    custom_components.sofabaton_x1s: debug
```

You can also set this under **Settings → System → Logs → Configure** by adding `custom_components.sofabaton_x1s` at the `debug` level.

## Collect the Home Assistant log file
1. After reproducing the issue, go to **Settings → System → Logs**.
2. Click **Download full logs** to save `home-assistant.log`.
3. The log file is also stored on disk at `<config>/home-assistant.log` (the `/config` folder for most installations).

## Download integration diagnostics
1. Open **Settings → Devices & services** and select **Sofabaton X1/X1S**.
2. Click the **⋮** menu (three dots) on the integration card.
3. Choose **Download diagnostics** to save a JSON file containing structured diagnostics.

## Redact sensitive data before sharing
Before attaching files to an issue:
- Remove or replace access tokens, user emails, hostnames, IP addresses, and serial numbers.
- Search the files for keywords like `token`, `Authorization`, or your email address to ensure they are masked.
- If in doubt, share only the relevant excerpt rather than the full file.

## Attaching logs to an issue
Include the downloaded `home-assistant.log` and/or diagnostics JSON in your GitHub issue. Mention whether hex logging and debug logging were enabled when the issue occurred.

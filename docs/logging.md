# Logging and diagnostics for Sofabaton X1/X1S

This guide shows how to enable detailed logging for the integration, capture the Home Assistant log file or diagnostics, and safely share them. Paths and menu names match Home Assistant 2024.4+.

## Recommended way to gather logs
1. In Home Assistant, open **Settings → Devices & services**.
2. Select **Sofabaton X1S** and open the hub device.
3. Toggle `switch.<hub>_hex_logging` **on** to capture full hub traffic.
4. Perform the actions that demonstrate the issue while hex logging is enabled.
5. With hex logging still on, open the **⋮** menu (three dots) on the **Sofabaton X1/X1S** integration card and choose **Download diagnostics**. This downloads the log file we need along with structured diagnostics.
6. Toggle `switch.<hub>_hex_logging` **off** when finished to reduce noise.

This workflow ensures the diagnostic download includes the hex logging details needed for troubleshooting.
It also improves anonimity as it exclusively contains log data from the integration and redacts IP and MAC addresses.

## Attaching logs to an issue
Include the downloaded diagnostics JSON in your GitHub issue.

# Logging and diagnostics for Sofabaton X1/X1S/X2

This guide shows how to enable detailed logging for the Home Assistant integration, capture the Home Assistant log file or diagnostics, and safely share them. Paths and menu names match Home Assistant 2025.x.

These Home Assistant diagnostics do not apply to standalone `sofabaton-x` users. If you are opening an issue for `sofabaton-x`, include the command you ran, terminal output or traceback, package version, Python version, and a small reproduction snippet if possible.

## Recommended way to gather Home Assistant logs

1. In Home Assistant, open **Settings -> Devices & services**.
2. Select **Sofabaton X1S** and open the hub device.
3. Toggle `switch.<hub>_hex_logging` **on** to capture full hub traffic.
4. Perform the actions that demonstrate the issue while hex logging is enabled.
5. With hex logging still on, open the three-dot menu on the **Sofabaton X1S** integration card and choose **Download diagnostics**. This downloads the log file we need along with structured diagnostics.
6. Toggle `switch.<hub>_hex_logging` **off** when finished to reduce noise.

This workflow ensures the diagnostic download includes the hex logging details needed for troubleshooting.
It also improves privacy as it exclusively contains log data from the integration and redacts IP and MAC addresses.

## Attaching logs to an issue

[Create an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues) and include the downloaded diagnostics JSON in your GitHub issue if you can.

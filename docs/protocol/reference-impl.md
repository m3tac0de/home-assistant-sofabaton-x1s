# Reference Implementation

The Python reference implementation lives in `/sofabaton_x1/` at the repository
root. It is publishable to PyPI as `sofabaton-x1` (`pip install sofabaton-x1`).

## Source file map

| Protocol concept | Source file | Key symbol |
|-----------------|-------------|------------|
| Frame format, sync bytes, checksum | `sofabaton_x1/transport_bridge.py` | `_sum8()`, `CONNECT_READY_BROADCAST` |
| All opcode constants | `sofabaton_x1/protocol_const.py` | `OP_*` constants, `OPNAMES` dict |
| Hub version constants, mDNS helpers | `sofabaton_x1/protocol_const.py` | `HUB_VERSION_*`, `classify_hub_version()`, `mdns_service_type_for_props()` |
| ButtonName codes | `sofabaton_x1/protocol_const.py` | `ButtonName` class, `BUTTONNAME_BY_CODE` dict |
| Opcode family helpers | `sofabaton_x1/protocol_const.py` | `opcode_family()`, `FAMILY_*` constants |
| TCP/UDP socket management | `sofabaton_x1/transport_bridge.py` | `TransportBridge` class |
| CALL_ME frame construction | `sofabaton_x1/transport_bridge.py` | `_claim_once()` method |
| NOTIFY_ME / CALL_ME demuxing | `sofabaton_x1/notify_demuxer.py` | `NotifyDemuxer` class |
| NOTIFY_ME reply construction | `sofabaton_x1/notify_demuxer.py` | `_build_notify_reply()`, `_build_device_identifiers()` |
| Opcode handler framework | `sofabaton_x1/frame_handlers.py` | `BaseFrameHandler`, `register_handler()` |
| All 50+ opcode handlers | `sofabaton_x1/opcode_handlers.py` | Handler classes decorated with `@register_handler` |
| Device catalog row parsing | `sofabaton_x1/opcode_handlers.py` | `DeviceCatalogRowHandler` |
| Activity catalog row parsing | `sofabaton_x1/opcode_handlers.py` | `ActivityCatalogRowHandler` |
| Keymap record parsing | `sofabaton_x1/state_helpers.py` | `ActivityCache.accumulate_keymap()` |
| Multi-frame command burst reassembly | `sofabaton_x1/commands.py` | `DeviceCommandAssembler` |
| Command record decoding | `sofabaton_x1/commands.py` | `iter_command_records()` |
| Macro burst reassembly | `sofabaton_x1/macros.py` | `MacroAssembler` |
| Macro record decoding | `sofabaton_x1/macros.py` | `decode_macro_records()` |
| In-memory state cache | `sofabaton_x1/state_helpers.py` | `ActivityCache` class |
| Burst scheduling | `sofabaton_x1/state_helpers.py` | `BurstScheduler` class |
| High-level proxy API | `sofabaton_x1/x1_proxy.py` | `X1Proxy` class |
| mDNS advertisement (proxy mode) | `sofabaton_x1/x1_proxy.py` | `_start_mdns()` method |
| CLI / REPL | `sofabaton_x1/cli.py` | `X1Shell` class, `main()` function |

## Running the CLI

```sh
# Install from repo root (local dev)
pip install -e .

# Run CLI
sofabaton-x1 --hub 192.168.1.100 --mdns-txt "NAME=My Hub" "HVER=2"
```

Inside the REPL:
```
x1> status          # hub/proxy/client state, activity/device counts
x1> activities      # list all activities
x1> devices         # list all devices
x1> buttons 101     # list button codes for activity 101
x1> commands 5      # list IR commands for device 5
x1> send 101 VOL_UP # send VOL_UP to activity 101
x1> watch           # stay open and print events
```

## Standalone usage (Python)

```python
from sofabaton_x1.x1_proxy import X1Proxy
from sofabaton_x1.protocol_const import ButtonName

proxy = X1Proxy(
    real_hub_ip="192.168.1.100",
    mdns_txt={"HVER": "2", "NAME": "Living Room"},
    proxy_enabled=True,
)
proxy.start()

# Get activities once hub connects
def on_activities_ready(key):
    acts, _ = proxy.get_activities()
    for aid, info in acts.items():
        print(aid, info["name"])

proxy.on_burst_end("activities", on_activities_ready)

# Send a command
proxy.send_command(101, ButtonName.VOL_UP)

# Clean shutdown
proxy.stop()
```

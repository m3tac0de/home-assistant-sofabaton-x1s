# Reference Implementation

The Python implementation lives in `custom_components/sofabaton_x1s/lib/` inside the
repository. A standalone CLI and publishable package are not yet implemented.

## Source file map

All paths are relative to `custom_components/sofabaton_x1s/lib/`.

| Protocol concept | Source file | Key symbol |
|-----------------|-------------|------------|
| Frame format, sync bytes, checksum | `transport_bridge.py` | `_sum8()`, `CONNECT_READY_BROADCAST` |
| All opcode constants | `protocol_const.py` | `OP_*` constants, `OPNAMES` dict |
| Hub version constants, mDNS helpers | `protocol_const.py` | `HUB_VERSION_*` |
| ButtonName codes | `protocol_const.py` | `ButtonName` class, `BUTTONNAME_BY_CODE` dict |
| Opcode family helpers | `protocol_const.py` | `opcode_family()`, `FAMILY_*` constants |
| TCP/UDP socket management | `transport_bridge.py` | `TransportBridge` class |
| CALL_ME frame construction | `transport_bridge.py` | `_claim_once()` method |
| NOTIFY_ME / CALL_ME demuxing | `notify_demuxer.py` | `NotifyDemuxer` class |
| NOTIFY_ME reply construction | `notify_demuxer.py` | `_build_notify_reply()`, `_build_device_identifiers()` |
| Opcode handler framework | `frame_handlers.py` | `BaseFrameHandler`, `register_handler()` |
| All opcode handlers | `opcode_handlers.py` | Handler classes decorated with `@register_handler` |
| Device catalog row parsing | `opcode_handlers.py` | `DeviceCatalogRowHandler` |
| Activity catalog row parsing | `opcode_handlers.py` | `ActivityCatalogRowHandler` |
| Frame metadata — command bursts | `commands.py` | `CommandBurstFrame`, `parse_command_burst_frame()` |
| Multi-frame command burst reassembly | `commands.py` | `DeviceCommandAssembler` |
| Command record decoding | `commands.py` | `iter_command_records()` |
| Frame metadata — keymap bursts | `commands.py` | `ButtonBurstFrame`, `parse_button_burst_frame()` |
| Keymap burst reassembly | `commands.py` | `DeviceButtonAssembler` |
| Frame metadata — macro bursts | `macros.py` | `MacroBurstFrame`, `parse_macro_burst_frame()` |
| Macro burst reassembly | `macros.py` | `MacroAssembler` |
| Macro record decoding | `macros.py` | `decode_macro_records()` |
| Keymap state replacement | `state_helpers.py` | `ActivityCache.replace_keymap_rows()` |
| In-memory state cache | `state_helpers.py` | `ActivityCache` class |
| Burst scheduling | `state_helpers.py` | `BurstScheduler` class |
| High-level proxy API | `x1_proxy.py` | `X1Proxy` class |
| mDNS advertisement (proxy mode) | `x1_proxy.py` | `_start_mdns()` method |

# Reference Implementation

The Python implementation lives in `custom_components/sofabaton_x1s/lib/` inside the
repository. A standalone CLI and publishable package are not yet implemented.

## Source file map

All paths are relative to `custom_components/sofabaton_x1s/lib/`.

| Protocol concept | Source file | Key symbol |
|-----------------|-------------|------------|
| Frame format, sync bytes, checksum | `transport_bridge.py` | `_sum8()` |
| All opcode constants | `protocol_const.py` | `OP_*` constants, `OPNAMES` dict |
| Hub version constants, mDNS helpers | `../const.py` | `HUB_VERSION_*`, `classify_hub_version()`, `mdns_service_type_for_props()` |
| ButtonName codes | `protocol_const.py` | `ButtonName` class, `BUTTONNAME_BY_CODE` dict |
| Opcode family helpers | `protocol_const.py` | `opcode_family()`, `opcode_family_name()`, `FAMILY_*` constants |
| Device-class normalization | `protocol_const.py`, `state_helpers.py` | `classify_device_class_code()`, `normalize_device_class()`, `normalize_device_entry()` |
| TCP/UDP socket management | `transport_bridge.py` | `TransportBridge` class |
| CALL_ME frame construction | `transport_bridge.py` | `_claim_once()` method |
| NOTIFY_ME / CALL_ME demuxing | `notify_demuxer.py` | `NotifyDemuxer` class |
| NOTIFY_ME reply construction | `notify_demuxer.py` | `_build_notify_reply()`, `_build_device_identifiers()` |
| CONNECT_READY beacon construction | `notify_demuxer.py` | `build_connect_ready_beacon()` |
| Opcode handler framework | `frame_handlers.py` | `BaseFrameHandler`, `register_handler()` |
| All opcode handlers | `opcode_handlers.py` | Handler classes decorated with `@register_handler` |
| Device catalog row parsing | `opcode_handlers.py` | `CatalogDeviceHandler`, `X1CatalogDeviceHandler` |
| Activity catalog row parsing | `opcode_handlers.py` | `CatalogActivityHandler`, `X1CatalogActivityHandler` |
| Frame metadata - command bursts | `commands.py` | `CommandBurstFrame`, `parse_command_burst_frame()` |
| Multi-frame command burst reassembly | `commands.py` | `DeviceCommandAssembler` |
| Command record decoding | `commands.py`, `state_helpers.py` | `iter_command_records_from_assembled()`, `ActivityCache.parse_device_commands()` |
| Frame metadata - IR blob dump pages | `commands.py` | `IrCommandDumpFrame`, `parse_ir_command_dump_frame()` |
| IR blob dump assembly | `x1_proxy.py` | `request_ir_command_dump()`, `_record_ir_dump_frame()`, `_build_ir_dump_result()` |
| IR blob save-page synthesis | `x1_proxy.py` | `_build_persist_ir_blob_payloads()`, `persist_ir_blob()` |
| Descriptive IR blob helpers | `commands.py` | `build_descriptive_ir_blob_body()`, `build_denonk_ir_blob()`, `descriptive_play_blob_text()` |
| Frame metadata - keymap bursts | `commands.py` | `ButtonBurstFrame`, `parse_button_burst_frame()` |
| Keymap burst reassembly | `commands.py`, `state_helpers.py` | `DeviceButtonAssembler`, `iter_keymap_records()`, `ActivityCache.replace_keymap_rows()` |
| Frame metadata - macro bursts | `macros.py` | `MacroBurstFrame`, `parse_macro_burst_frame()` |
| Macro burst reassembly | `macros.py` | `MacroAssembler` |
| Macro record decoding | `macros.py`, `opcode_handlers.py` | `parse_macro_record_from_region()`, `parse_macro_records_from_burst()`, `MacroHandler` |
| In-memory state cache | `state_helpers.py` | `ActivityCache` class |
| Burst scheduling | `state_helpers.py` | `BurstScheduler` class |
| IR blob replay and replay-tail normalization | `x1_proxy.py` | `play_ir_blob()`, `_finalize_play_blob_body()`, `_play_ir_blob_body()`, `_play_blob_total_frames()` |
| High-level proxy API | `x1_proxy.py` | `X1Proxy` class |
| mDNS advertisement (proxy mode) | `x1_proxy.py` | `_start_mdns()` method |

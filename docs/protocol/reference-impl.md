# Reference Implementation

The Python implementation lives in `custom_components/sofabaton_x1s/lib/` inside the
repository. A standalone CLI and publishable package are not yet implemented.

## ◇ Source file map

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
| Per-variant wire-format schema (single source of truth) | `wire_schema.py` | `WireSchema`, `schema_for()`, `InputEntryLayout`, `InputsTrailingLayout` |
| Family-0x46 inputs builder / parser | `inputs.py` | `build_inputs_write()`, `parse_inputs_burst()`, `InputEntry`, `ControlKeyBlock`, `FavoriteSlot`, `InputsRecord` |
| Ack-outcome dataclasses (`acked` / `rejected` / `timeout`) | `ack.py` | `AckOutcome`, `SendStepResult`, `InputsBurstResult` |
| Status-ack classifier | `x1_proxy.py` | `X1Proxy._send_step()` |
| Activity-inputs burst wait (typed result) | `proxy_ack_waiters.py` | `wait_for_activity_inputs_burst()` |
| Unified device/activity-create orchestrator | `device_create.py` | `DeviceCreateRequest`, `DeviceCreateResult`, `run_device_create()` |
| IR / BT / RF create pipeline | `proxy_restore.py` | `_run_ir_device_create()` |
| WiFi-commands create pipeline | `proxy_wifi_device.py` | `_run_network_callback_create()` |
| Activity-create pipeline (family-0x37) | `proxy_restore.py` | `_run_activity_create()` |
| Public adapter — create WiFi device | `proxy_wifi_device.py` | `create_wifi_device()` |
| Public adapter — restore device | `proxy_restore.py` | `restore_device()` |
| Public adapter — restore activity | `proxy_restore.py` | `restore_activity()` |
| Read-side accessor for entity state | `state_helpers.py` | `ActivityCache.entities(kind)` |

---

## ◇ Proxy module layout

`X1Proxy` is composed from per-subsystem mixin modules. Each mixin
covers one cohesive responsibility; `lib/x1_proxy.py` is the
orchestrator (init, identity, frame send/receive, lifecycle).

| Module | Responsibility |
|---|---|
| `lib/x1_proxy.py` | `X1Proxy` class, `Deframer`, init, identity (mDNS / banner), frame send/receive, `_send_step`, hub-state callbacks, lifecycle. |
| `lib/proxy_restore.py` | `restore_device`, `restore_activity`, `_run_ir_device_create`, `_run_activity_create`, every `_restore_*` validator and replay helper. |
| `lib/proxy_wifi_device.py` | `create_wifi_device`, `_run_network_callback_create`, `_run_wifi_create_x1_roku`, `_run_wifi_create_virtual_ip`, wifi-specific build helpers. |
| `lib/proxy_backup.py` | `export_cache_state`, `import_cache_state`, persistent-cache helpers, `get_*_ids` accessors. |
| `lib/proxy_catalog.py` | `request_*` → burst → ingest → commit pipeline, per-entity accessors, IR-dump assembly helpers. |
| `lib/proxy_activity_ops.py` | `delete_device`, `add_device_to_activity`, favorites operations, `command_to_button`. |
| `lib/proxy_ack_waiters.py` | `notify_ack`, `wait_for_ack` / `wait_for_ack_any`, macro-record cache, activity-inputs burst buffer. |
| `lib/proxy_ir_blob.py` | `play_ir_blob`, `persist_ir_blob`, `persist_command_record`, persist driver, playback diagnostics. |

Guards:

- `tests/test_module_boundaries.py::test_x1_proxy_under_2000_lines` keeps the orchestrator file from growing back.
- `tests/test_module_boundaries.py::test_proxy_mixin_imports_form_a_dag` forbids module-load-time imports between mixins. Use function-level imports (or move the helper to the orchestrator) when a mixin needs another mixin's symbol.
- `tests/test_cache_version_bump.py` pins the persistent-cache version constant; any change to `export_cache_state` that reshapes the on-disk schema must bump `CACHE_STORE_VERSION` in `cache_store.py`.

---

## ◇ Activity catalog refreshes

`REQ_ACTIVITIES` collects rows in a pending snapshot. The committed catalog,
active-activity hint, and cache readiness remain available during a refresh.
Only a complete row set, or an explicit empty-catalog `STATUS_ACK 0x07`,
replaces them. A silent or partial burst is discarded without publishing
activity changes or confirming a pending redundant-OFF event.

The burst scheduler also invokes end listeners on timeout, so its notification
alone is not proof of success. `X1Proxy` records whether that burst committed a
snapshot; both active-state evaluation and the HA catalog listener require
that proof. The HA listener captures it before scheduling work on its event
loop, so a later burst cannot turn a discarded refresh into a successful one.

The proxy publishes each complete snapshot's generation and raw contents
together. The HA listener acknowledges that same pair on the event loop;
an explicit refresh requires the acknowledged generation to exceed the
proxy generation observed before its request. An old queued HA callback and
a newer proxy commit whose callback is still pending cannot satisfy each
other. Validation and pruning use the acknowledged snapshot, including its
raw bodies, rather than rereading mutable proxy or HA caches. Callbacks from
a replaced proxy cannot acknowledge a refresh on its replacement.

The refresh raises `TimeoutError` when no matching complete snapshot arrives
before its deadline. The websocket API returns a `timeout`
error and does not persist the cache. Removed activity details are pruned only
after a successful refresh. A complete snapshot with no active row still
reports Powered Off normally; retaining the cache does not debounce Off.

A pending redundant-OFF press owns its queued confirmation request and the
one permitted X2 retry. The send hook binds the press to that request when it
leaves the queue, so earlier reads cannot confirm or cancel it. The intent
expires on disconnect, when its own read fails without a remaining retry,
when an unrelated read replaces its scheduled retry, or after 15 seconds.
The retry can confirm the press within that deadline. A rejected confirmation
request clears its intent as well. A later recovery or a delayed queued read
cannot execute old button
intent; a fresh Off press still fires once after a complete Off response.

---

## ◇ Unified create / restore orchestrator

The user-driven "create WiFi device" path and the backup-driven
"restore device" / "restore activity" paths share one orchestrator.

`lib/device_create.py:DeviceCreateRequest` is the typed input.
Important fields:

- `transport: "ir" | "network_callback"` — picks the per-transport
  pipeline on the device path.
- `entity_kind: "device" | "activity"` — selects the family-`0x07`
  vs family-`0x37` create header.
- `device_block`, `commands`, `button_bindings`, `macros`, `inputs`,
  `favorites` — IR/BT/RF inputs from a backup payload.
- `network_callback_profile` — WiFi-specific dict (device name,
  brand, IP/port, slot map, command-id references).
- `device_id_map` — source→destination device id translation used
  when `entity_kind="activity"` (activity content references
  commands on other devices whose ids may differ in the destination
  namespace).

`lib/device_create.py:DeviceCreateResult` is the typed output.
Counters:

- `restored_commands` / `restored_button_bindings` /
  `restored_macros` / `restored_inputs` — per-step success counts.
- `skipped_favorites` / `skipped_macro_steps` — explicit drop
  counters (each drop is logged at WARNING). Per Ground Rule 7 in
  [refactor-plan.md](refactor-plan.md), no row is silently skipped.
- `command_id_map` — source→destination command-id translation
  built up as command writes are acked.
- `failed_step_label` — set on failure, points at the step that did
  not get a successful ack.

`run_device_create(proxy, request)` dispatches:

```
if entity_kind == "activity":   _run_activity_create
elif transport == "network_callback":   _run_network_callback_create
elif transport == "ir":                _run_ir_device_create
```

Both axes raise `ValueError` on unknown values — no default, no
fallback. Variant resolution inside the WiFi pipeline (Roku-on-X1
vs IP-generic-on-X1S/X2) reads `proxy.hub_version`; it never
sniffs the payload.

The public adapters (`create_wifi_device`, `restore_device`,
`restore_activity`) are thin: validate inputs, build a
`DeviceCreateRequest`, call `run_device_create`, translate the
typed result back to the legacy dict surface the service / WS
layer expects.

---

## ◇ Ack-outcome contract

Wire-level reject signalling is described in
[ack-handling.md](ack-handling.md). The integration's typed surface
for that contract lives in `lib/ack.py`:

```python
class AckOutcome(Enum):
    acked = "acked"
    rejected = "rejected"
    timeout = "timeout"

@dataclass(frozen=True, slots=True)
class SendStepResult:
    outcome: AckOutcome
    ack_opcode: int | None = None
    ack_payload: bytes | None = None

@dataclass(frozen=True, slots=True)
class InputsBurstResult:
    outcome: AckOutcome
    payloads: tuple[bytes, ...] = ()
```

Both result types expose `.ok`, `.rejected`, `.timed_out`
predicates so callers do not have to import `AckOutcome` at every
site.

Classifier rules in `X1Proxy._send_step`:

1. Build the candidate ack set from `(ack_opcode, ack_first_byte)`
   plus any `ack_fallback_opcodes`.
2. If the caller asked for `STATUS_ACK` success
   (`ack_opcode=0x0103`, `ack_first_byte=0x00`), the candidate set
   is widened to include `(0x0103, None)` so the wait wakes on a
   non-zero first byte instead of timing out.
3. On a match, inspect the first payload byte:
   - opcode `0x0103` and a non-zero first byte → `rejected`;
   - anything else → `acked`.
4. Exhausting the retry budget with no reply → `timeout`.

`run_create_sequence` in `device_create.py` applies the same
wildcard expansion; the two classifiers are deliberately kept in
sync so behaviour does not diverge between single-step and
multi-step paths. `tests/test_ack_handling.py` pins each branch.

---

## ◇ State accessor

`ActivityCache.entities(kind)` in `state_helpers.py` is the
read-side accessor for device / activity state maps. Callers should
prefer it over reaching into `state.devices` / `state.activities`
directly; the direct attributes remain for write-side mutation
(`pop`, `clear`, `[k] = ...`, full-replace assignment) until a
typed container migration lands.

`ip_devices` is a separate namespace and is not unified by this
accessor; callers that want the union of devices and ip_devices
still reach into both maps explicitly.

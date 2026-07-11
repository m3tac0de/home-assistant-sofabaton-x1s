# Live Hub Protocol Testing

This note is for future debugging sessions that need to validate a wire-level
idea against a real hub without first wiring it into Home Assistant.

## Setup

Use a hub IP on the local network and run experiments from the repository root.
Keep Home Assistant actions, backups, and command syncs idle while testing so
the hub sees only the frame under test.

```python
import time

from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
from custom_components.sofabaton_x1s.const import HUB_VERSION_X2

proxy = X1Proxy(
    "192.168.x.y",
    hub_version=HUB_VERSION_X2,
    proxy_enabled=False,
    diag_dump=True,
    diag_parse=True,
)

proxy.start()
try:
    time.sleep(2.0)
    print(proxy.poll_x2_remote_battery(timeout=2.0))
finally:
    proxy.stop()
```

For product code, keep hub requests flowing through `enqueue_cmd` or a higher
level hub method that uses it. Direct `_send_cmd_frame` calls are useful for
short experiments only.

### Capturing what the official app does (app-attached proxy)

To learn an opcode the app uses but we don't, run the proxy with mDNS
mirroring so the official app attaches *through* us, and log every frame.
The proxy relays app↔hub traffic transparently while `diag_dump=True`
records hex + parsed frames. Use the `sofabaton-x` async facade:

```python
import asyncio
from custom_components.sofabaton_x1s.lib.aio import AsyncXProxy, async_discover_hubs
from custom_components.sofabaton_x1s.lib.hub_versions import HVER_BY_HUB_VERSION

async def main():
    # Mirror the hub's own mDNS instance name + TXT so the app treats the
    # proxy as its paired hub (else the app finds the real hub directly).
    inst, txt = "X1-HUB-PROXY", {"HVER": HVER_BY_HUB_VERSION["X1"]}
    for h in await async_discover_hubs(timeout=6.0):
        if h.host == "192.168.x.y" and not h.is_proxy:
            inst, txt = h.name, dict(h.txt); break
    proxy = AsyncXProxy(hub_ip="192.168.x.y", hub_version="X1",
                        mdns_instance=inst, mdns_txt=txt,
                        diag_dump=True, diag_parse=True)
    async with proxy:
        await proxy.wait_connected(timeout=120)
        await proxy.wait_until_discoverable(timeout=10.0)
        # ... now open the app; it lists "X1 HUB" = us. Perform the edit.
        # While the app is attached the proxy is in OBSERVE mode
        # (can_issue_commands()==False); detach the app to regain control
        # and read state back (e.g. get_macros_for_activity + _macros_complete).
        while True:
            await asyncio.sleep(2)

asyncio.run(main())
```

The library needs Python ≥ 3.11 and `zeroconf`. Frames log at DEBUG under
logger `x1proxy`; `[WIRE]` lines are raw hex, `[FRAME]` lines are the
proxy's own decode (opcode name + family). Detach the app before any
proxy-issued read/write — `can_issue_commands()` is false while the app
owns the session.

## X2 Remote Battery

X2 hubs expose a remote status row through `OP_REQ_REMOTE_STATUS` with payload
`00`. The current implementation polls that row only when the command scheduler
is idle, then caches `decoded.battery` as the remote battery percentage.

X1 and X1S hubs do not currently expose a confirmed live remote battery value
through the same request path. Do not surface a battery sensor for those models
unless a separate live network behavior is verified.

## Logging Checklist

- Capture request opcode, payload, and raw reply hex.
- Record hub model, hub firmware version when known, and whether a mobile app
  or Home Assistant operation was connected.
- Repeat the same request after a known state change when testing a value that
  should vary, such as battery level.
- Prefer neutral field names in notes and code until the field meaning is
  validated by behavior.

## Validated: activity-edit write flows (X1, 2026-07-07)

Captured by attaching the official app through the proxy (method above)
and performing each edit on a sacrificial activity, then reading state
back with the app detached. These back the live-activity-editor sync
engine (`docs/internal/live-activity-editor-plan.md`, items V1–V6). Hub
model X1 (firmware 17); byte layouts below are X1 — X1S/X2 use UTF-16BE
names and larger fixed records.

Frame recap: `a5 5a <len> <family> <payload...> <sum8>`; opcode high byte
= payload length, so the full opcode changes with payload size. Write
acks: `0x0112` (echoes macro key id) or the generic `0x0103`
(`payload[0]==0x00` = accepted). Hub delays on deletes were multi-second
(~8 s observed) — budget generous ack timeouts.

### Macro save = whole-record replace (family 0x12)

Payload = `[0x01][outer_seq_be2]` then body
`[0x01][total_pages_be2][act_id][key_id][step_count]` + N×10-byte step
rows + label slot (30 B X1, ASCII) + 1 B body checksum. Step row (10 B) =
`[device_id][key_id][00 00 00 00 00][fid][hold][delay]`.

- **Create** a user macro: write with `key_id = 0x00` ("assign one").
  The hub assigns a real key and **returns it in the `0x0112` ACK
  payload byte** (observed: assigned `0x04`). The app then writes a
  family-0x61 key-sort page and commits (`0x0165`).
- **Replace / shrink**: write again addressing the assigned `key_id`
  with a shorter body. Confirmed truncating: a 5-step macro rewritten to
  2 steps read back as exactly 2 steps, no stale tail. So the sync
  engine may rewrite POWER_ON/OFF and user macros at any length ≤ hub
  max with no separate "trim" step. (Item V1.)

Example (create then shrink, act 0x65, assigned key 0x04):
```
A→H a5 5a 5a 12 01 00 01 01 00 01 65 00 05 <5 rows> "test 5 step" ...   (create, key_id 0x00, count 5)
H→A a5 5a 01 12 04 16                                                     (0x0112 ACK, assigned key = 0x04)
A→H a5 5a 3c 12 01 00 01 01 00 01 65 04 02 <2 rows> "test 5 step" ...     (replace, key_id 0x04, count 2)
```

### Delete a key-row = 0x0210 (+ 0x61 reorder + 0x65 commit)

One primitive covers **button-binding removal, favorite removal, and
user-macro deletion** — the hub's KeyToKey table is uniform, so all
three are "delete the row for (activity, key code)".

- `0x0210` (family `0x10`, `FAMILY_FAV_DELETE`) payload `[act][key]`,
  ACK `0x0103`.
- If the deleted key participated in the favorite/macro sort order, a
  family-`0x61` key-sort rewrite of the *remaining* keys follows, then a
  family-`0x65` commit (`0x0165`). A plain hard-button binding removal
  needs no reorder (nothing in the sort changed) — just the delete +
  commit.

```
Button binding (UP=0xAE) removed from act 0x67:
  A→H a5 5a 02 10 67 ae 26     0x0210 delete [act 0x67][key 0xAE]   → 0x0103
  A→H a5 5a 01 65 67 cc        0x0165 commit                        → 0x0103

User macro (key 0x04) deleted from act 0x65:
  A→H a5 5a 01 62 65 c7                              0x0162 read current order
  A→H a5 5a 02 10 65 04 7a                           0x0210 delete [act][key]   → 0x0103
  A→H a5 5a 0e 61 01 00 01 01 00 01 65 01 01 02 02 03 03  family 0x61 key-sort (keys 1,2,3) → 0x0103
  A→H a5 5a 01 65 65 ca                              0x0165 commit               → 0x0103
```

`delete_favorite` (`proxy_activity_ops.py`) already sends exactly this
3-step sequence; it just restricts the id to favorites via
`_validate_favorite_fav_id`. Generalizing that guard to accept any key
id (button code or macro id) yields binding/macro delete for free.
(Items V2, V3.)

### Membership removal = rewrite power macros (no 0x024F)

Removing a device from an activity is **not** a dedicated opcode. The
app re-reads and **rewrites POWER_ON and POWER_OFF via family 0x12**,
dropping that device's power/input ref steps (`key 0xC6` power-on,
`0xC5` input, `0xC7` power-off). Observed: removing device `0x09`
dropped POWER_ON 8→6 steps and POWER_OFF 4→3 steps. Any bindings or
favorites pointing at the device would additionally be removed via the
`0x0210` delete above.

Note the add/remove asymmetry: **add** uses `0x024F`
`OP_ACTIVITY_DEVICE_CONFIRM` (full ordered member replay, see
`add_device_to_activity`); **remove** is pure reference rewriting.
Membership is derived from references, matching the offline
`reconcileActivityPowerMacros` model. (Item V4.)

2026-07-11 addendum: the hub does the reference cleanup itself.
Rewriting **one** power macro so it no longer references a device is
enough — the firmware cascade-removes the device from the activity,
stripping its rows from the *other* power macro and deleting its
keymap bindings, and acks that save with an off-key `0x0112` (see
"Validated: activity-edit engine emissions" below). The app's rewrite
of both macros + explicit `0x0210` deletes is thus belt-and-braces on
top of firmware behavior.

### Activity rename = 0x7B38 full-record write

`OP_ACTIVITY_CONFIRM` (`0x7B38`) writes the whole fixed-size activity
record (128 B on X1) with the new name in the label field. It is a
read-modify-write: preserve the trailing `fc XX fc YY` tail-token block
(needs-confirm flag etc.) or the hub rejects the save. Name is ASCII on
X1, UTF-16BE on X1S/X2. ACK `0x0103`.

```
A→H a5 5a 7b 38 01 00 01 01 00 01 00 65 01 01 00...00 "Watch Apple TV rename" 00... fc 00 fc 00 ... <sum>
```
(Item V5.)

### Command rename: unsupported by the app

The official app exposes no command-rename affordance, so there is no
trace to derive an in-place `0x0E` update opcode. Live editing hides the
command/favorite-rename affordance; offline backup editing keeps it
(restore rewrites the whole family-0x0E command record). (Item V6 —
resolved as "not offered live".)

## Validated: device-edit write flows (X1 + X1S, 2026-07-11)

Bench-validated the live *device* sync engine (`sync_device`,
`build_device_sync_plan`) end-to-end against both hub models by issuing
each write through the production engine on a sacrificial device
(X1 fw dev `0x09`, X1S dev `0x0A`) and re-reading the device
(`backup_device`, blob-free) after every leg. Both devices were synced
back to their pre-bench baselines and verified equal. Full frame logs
were captured with `diag_dump=True`.

Confirmed on **both** X1 and X1S:

- **Binding upsert on an existing device** — the family-`0x3E` keymap row
  write addressed with the device id as the entity id, including the
  long-press pair and in-place overwrite of an existing row. Stored rows
  read back as `{device_id: <self>, command_id, long_press_device_id:
  <self>, long_press_command_id}` — identical in shape to app-created
  reference rows.
- **Key-row delete at device scope** — `0x0210 [dev][key]` + `0x0165`
  commit, previously proven only for activities. The hub's KeyToKey
  table treats device and activity ids uniformly (split purely by the
  id range, `>= 0x65` = activity).
- **Device macro writes (power sequences 198/199)** — the single-page
  family-`0x12` write (`build_macro_step`, the device-create/restore
  builder; *not* the paged activity macro save). Step rows carry the
  device's own id as the device byte and the synthetic `0x4E20 + cmd`
  code as the 48-bit fid — app-written X1S baseline steps carry exactly
  that synthetic code, confirming the convention. Delay rows are the
  all-`0xFF` sentinel with the pause length in the final byte; they
  round-trip through write → hub → re-read. Grow, truncating shrink,
  and zero-step writes all land exactly; the label slot (30 B ASCII on
  X1, 60 B UTF-16BE on X1S) is preserved across rewrites.
- **Idle / automatic-power byte** — `0x0241` per-device write, both
  directions.
- **Multi-category plans** — one sync carrying macro + binding + idle
  writes executes serially ack-gated in plan order, and the differ
  emits only steps that actually changed.

Notes:

- Devices with no input record / key-sort configured capture as
  `complete=False`, which makes the stale pre-flight log a "skipped"
  warning instead of comparing. Harmless for the write paths, but such
  devices get a weaker pre-flight.
- The scope guard's immutable signature must exclude capture metadata
  (`captured_at`, `fetched_at`, `complete`, `payload_profile`,
  `key_sort`) — two captures of identical hub state differ in those.

## Validated: activity-edit engine emissions (X1 + X1S, 2026-07-11)

Bench-validated the live *activity* sync engine (`sync_activity`,
`build_activity_sync_plan`) end-to-end against both hub models — the
engine's **own emissions**, closing the §10 gate left open when the
opcodes/shapes were proven from app traces (2026-07-07). Every write
went through the production engine against a sacrificial activity
("Bench Test", `0x68` on both hubs, itself created live through
`restore_activity` — which validated the family-0x37 activity-create
path as a bonus) and was verified by re-reading the activity
(`backup_activity`) after each leg. Both hubs were synced back to their
captured baselines and verified equal (X1 byte-equal; X1S equal except
hub-stamped label-slot trailer metadata, below). Harness:
`scripts/hub-bench/bench_{10,11,20,30,40,50}_*.py`; frame logs captured
with `diag_dump=True`.

Confirmed on **both** X1 and X1S:

- **Favorites** — add (`command_to_favorite`; the hub assigns the next
  free fav_id from 1, and the engine's post-add re-read resolution maps
  content → live fav_id correctly), delete, and reorder
  (`favorite_order` content pairs resolved to current fav_ids; hub 0x63
  order table confirms the new order).
- **Paged activity macro save** (`build_macro_save_payload` →
  `_send_paged_macro_save`) — POWER_ON grow/shrink with a delay row
  (all-0xFF sentinel + pause byte) round-trips exactly; 48-bit step
  fids round-trip intact; `raw_label_slot` passthrough for 198/199 is
  byte-preserved across every save (X1 30 B ASCII, X1S 60 B UTF-16BE).
- **User-macro creation via direct fresh-key write** — writing the
  editor's `button_id` as-is (e.g. key `0x01`) is accepted by both
  hubs; the app's key-`0x00` assign-one path (hub assigns the key in
  the 0x0112 ack) is NOT required. User-macro delete via
  `0x0210 [act][key]` + `0x65` commit removes the row cleanly.
- **Bindings at activity scope** — write, in-place overwrite (incl.
  adding a long-press pair), and delete through the family-0x3E /
  0x0210 primitives round-trip exactly.
- **`member_replay`** (`add_device_to_activity`) — 0x024F member
  confirms + power-macro replays land; combined multi-category plans
  (member_replay → macro_write ×2 → binding_write → favorite_add →
  remote_sync) execute serially ack-gated in plan order.

Hub behaviors discovered (both firmwares unless noted):

- **Cascading member removal**: a macro save that drops a device's
  last power-macro reference makes the hub remove that device from the
  activity entirely — it strips the device's rows from the *other*
  power macro and deletes its keymap bindings, then acks `0x0112` with
  a payload byte that is NOT the macro key (observed `0x01`, ~1.2 s
  late). The final-page ack waiter must accept any `0x0112`;
  rejections still arrive as `0x0103` with a non-zero status.
- Keymap-derived favorites do not appear in the 0x63 favorites-order
  table until a reorder writes them; an activity whose favorites are
  all keymap-derived gets no 0x63 reply at all. Read favorites via the
  keymap; use 0x63 only as ordering evidence.
- **X1S only**: the duration byte on power-ref macro rows (0xC5/0xC6/
  0xC7) is hub-owned — the firmware rewrites it from the target
  device's power config (wrote 0, read back 1). Diffs must not treat
  that byte as editor-controlled on power-ref rows.
- **X1S only**: member operations stamp non-zero metadata into the
  reserved trailer of the 198/199 label slots (observed `d4 d4`); the
  raw_label_slot passthrough preserves it through subsequent saves, and
  baseline comparisons must treat the trailer region as hub-owned.

Engine bugs the bench caught (all fixed 2026-07-11):

1. `_activity_sync_current_favorite_fav_ids` refreshed the mapping
   fire-and-forget; the in-flight burst collided with the 0x0162 order
   request sent next and the hub dropped it (no 0x63 reply → spurious
   `favorite_order` failure). Now a synchronous keymap re-read.
2. `_macro_key_sequence_from_steps` truncated 48-bit step fids to one
   byte (`& 0xFF`).
3. `_send_paged_macro_save` pinned the final-page 0x0112 ack payload to
   the macro key, failing successful cascade-removal saves (above).

## Pending validation: HA-action blobs without inner-record trailer

The backup editor synthesizes `wifi_ip` command blobs for Home Assistant
actions (`renderHaActionDataHex` in `www/src/tabs/backup-state.ts`) with
NO 1-byte inner-record trailer — real hub-dumped records carry one (see
`tests/test_wifi_ip_apps_backup_roundtrip.py`), computed over the outer
command record by the hub. Replay is length-prefixed (`data[6:8]`
declares the HTTP text length), so the trailer should be inert for
sending, but two things need a live-hub check after restoring a bundle
containing an editor-provisioned HA action:

1. The family-0x0E save pages are acked `0x0103/0x00` (not `0x0C`).
2. Pressing the restored shortcut fires the HTTP callback at the
   configured `host:port` with the expected `/launch/ha/...` path.

If the hub rejects trailer-less records, the fix belongs in the restore
path (compute the outer-record checksum in `build_command_write_steps`),
not in the TS writer.

## Pending validation: cross-activity chain steps

This is the one remaining open gate (item V7) for the live activity
editor — it blocks only cross-activity chain editing, not the tab or the
core sync engine (V1–V5 above are validated).

Stage 1 restore plumbing (activity_id_map, dependency-ordered activity
restore) supports macro steps whose `device_id` is another ACTIVITY
(>= 0x65) — the "activity A's power-off starts activity B" pattern.
Firmware behavior is unvalidated; on a live hub confirm:

1. The family-0x12 macro write is acked (`0x0112`) when a step row's
   device byte is an activity id.
2. Ending activity A actually starts activity B when A's POWER_OFF
   carries a `{device_id: B, key 0xC6}` step.
3. Restore of a bundle containing the chain lands with the remapped
   activity id (check via a fresh backup of the restored hub).

The backup editor has no UI for this yet (stage 2 of the proposal in
the activity-editor plan); test bundles are hand-edited.

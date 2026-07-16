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
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1S

proxy = X1Proxy(
    "192.168.x.y",
    hub_version=HUB_VERSION_X1S,
    proxy_enabled=False,
    diag_dump=True,
    diag_parse=True,
)

proxy.start()
try:
    time.sleep(2.0)
    print(proxy.get_devices(force_refresh=True))
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

## X2 Remote Status Row (battery)

X2 hubs expose a remote status row through `OP_REQ_REMOTE_STATUS` with payload
`00`; byte 9 of the reply is a battery percentage. A remote-battery sensor
built on this was removed in 2026-07 because the hub does not reliably provide
the data. The opcode constants and the `REMOTE_STATUS` reply decode remain in
`protocol_const.py` / `opcode_handlers.py` as protocol knowledge.

X1 and X1S hubs do not expose a confirmed live remote battery value through
the same request path. Do not surface a battery sensor for any model unless a
separate live network behavior is verified.

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

## Validated: backup/restore write flows (X1 + X1S, 2026-07-11/12)

Bench-validated the whole backup → restore pipeline live on both hub
models (`restore_device` for every present device class,
`restore_activity` rich, `restore_hub_bundle` append and replace modes,
`delete_device`, activity delete, `erase_configuration`). Program plan
and per-chunk logs: `docs/internal/backup-restore-bench-plan.md`;
harness `scripts/hub-bench/bench_6x/7x_*.py`. Every restore was verified
by re-reading the restored entity and comparing content against the
source with ids remapped and hub-owned bytes excluded
(`scripts/hub-bench/bench_compare.py`).

Confirmed:

- **Device restore round-trip byte-perfect** on X1 `ir` + `wifi_roku`
  and X1S `wifi_ip`: command blobs byte-equal, bindings (incl.
  long-press), power macros, input page, idle byte, key-sort.
- **`delete_device` (family 0x09)** — the per-activity confirm sweep is
  a correct no-op for a device in no activity; **the same family with
  an id >= 0x65 deletes that activity** (the delete path used for all
  bench cleanup; see opcodes.md).
- **Rich activity restore round-trip byte-perfect** (multi-member,
  14–18 bindings, up to 17 favorites, delay rows, user macros).
  Favorites replay through the live add path (0x3E map → 0x61 stage →
  0x65 commit); display slots are assigned dense over the lowest FREE
  keys — user macros share the favorite key space, so slots must skip
  macro/binding keys or the 0x3E map overwrites the macro row (live
  finding, chunk 6).
- **Bundle restore, append mode**: device-id remap, per-device
  command-id maps, dependency-ordered activities, `0xC5` "set input"
  ordinal re-resolution through source input → command map →
  destination input index.
- **Cross-activity chain steps (former item V7)**: a POWER_OFF step
  whose device byte references another activity is accepted by the
  family-0x12 write and restores with the byte remapped through
  `activity_id_map` (proven non-trivially: source 0x80 → assigned
  0x69). Runtime behavior (ending A actually starting B) has not been
  behaviorally observed live — only the write/remap path is validated.
  Known gap: the bundle orchestrator builds `activity_id_map` from
  in-bundle activities only, so a bundle activity chaining to an
  activity already on the hub but absent from the bundle is rejected;
  standalone `restore_activity` handles it via an explicit
  `activity_id_map={id: id}`.
- **HA-action blobs without inner-record trailer (former pending
  gate)**: the hub accepts the editor's trailer-less `wifi_ip` records
  as-is — every family-0x0E page acked `0x0103/0x00`, the record is
  stored verbatim (re-read byte-equal, still trailer-less; the 0x020C
  dump adds only the persist tail), and triggering the restored command
  fires the HTTP POST at the configured `host:port` with the exact
  `/launch/ha/...` path. No writer change needed on either side.
- **`erase_configuration` (0x001D)**: acked in ~20 s on both hubs,
  catalogs empty afterwards, no session drop observed (the documented
  reconnect tolerance went unused). Replace-mode bundle restore onto
  the erased hub rebuilt both hubs fully (X1 9 devices + 4 activities,
  X1S 13 + 4) with every entity content-equal to the pre-erase capture;
  on an empty hub the allocators reproduce the source ids exactly.

Hub behaviors discovered:

- **Single-member activities are GC'd by the device-delete sweep**:
  deleting *any* device purges every activity with exactly one member
  device, app-created or restored, regardless of binding count. Real
  multi-member activities are untouched. The purge can land *after* an
  immediately-post-delete catalog snapshot — don't trust one for purge
  conclusions.
- **`REQ_ACTIVATE` (0x023F) on a `wifi_ip` command delivers exactly
  one HTTP callback per frame — the earlier "infinite repeat" was a
  delivery-retry loop, not key-repeat** (settled X1S 2026-07-12,
  wifi-commands bench chunk 2, response-mode matrix). Against the
  integration's exact response shape (`HTTP/1.1 200` + body +
  `Connection: close`): one callback, then silence. Against the
  chunk-5 replica (`HTTP/1.0 200`, empty body): the storm reproduces
  (83 identical POSTs in 10 s, ~8.3/s) and **stops within ~5 s of the
  live listener switching to the accepted shape** — the hub retries
  delivery of the *same* callback until it gets a response it
  accepts. A well-formed `HTTP/1.1 404` + body is accepted as
  delivered (single callback — status code is not the criterion).
  Connection refused: the hub gives up, no queue — nothing arrived
  after the port reopened 15 s later. The exact accept discriminator
  (HTTP version vs body vs headers) was not isolated.
- The hub silently **drops any frame sent while it is streaming a read
  burst** — every write must quiesce reads first
  (`wait_for_read_burst_quiesce`).
- Family-0x0E saved records persist as `blob_body + 1-byte
  write-context tail`; backups must split the tail off `data_hex` or
  every backup→restore cycle grows the record by one byte
  (data-structures.md "Save-specific trailing checksum").

Engine bugs the program caught (all fixed, regression-tested):

1. Empty-keymap devices stamped `complete=False` on good captures
   (bare STATUS_ACK 0x07 never recorded the entity in
   `state.buttons`).
2. A dropped catalog request was committed as an *empty* catalog,
   wiping local state.
3. Write steps fired mid read-burst were silently dropped by the hub
   (device-create 0x0107 timeout).
4. Backup→restore grew non-IR records one byte per cycle (persist
   tail replayed verbatim).
5. X1S favorite restore rejected non-sequential display slots
   (0x013E echoes the slot; the 0x61 stage length derives from it).
6. `0xC5` input re-resolution never ran on real bundles (resolver read
   a `payload["inputs"]` key no producer emits; a unit test faked it).
7. Dense favorite-slot reassignment clobbered user macros at keys 1–2
   (favorite 0x3E map writes a keymap row at the slot's key; slots now
   skip occupied keys).

## Validated: Wifi Commands deploy pipeline (X1 + X1S, 2026-07-12)

Bench-validated the whole Wifi Commands hub-facing pipeline live on
both hub models: per-variant `create_wifi_device` (X1 Roku-replay,
X1S/X2 virtual-IP), the full `hub.async_sync_command_config` deploy
wire order (create → `add_device_to_activity` → `command_to_favorite`
+ `reorder_favorites` → `command_to_button` → `resync_remote`), the
re-sync/rollback cycle, and HTTP callback delivery. Program plan and
per-chunk logs: `docs/internal/wifi-commands-bench-plan.md`; harness
`scripts/hub-bench/bench_8x_*.py`, callback listener
`scripts/hub-bench/bench_wifi_listener.py` (mirrors
`roku_listener._write_response` byte-for-byte). Deploy-side
verification was by re-read (`backup_device` for the created device,
`backup_activity` for every touched activity); untouched activities
were required byte-identical.

Confirmed:

- **`create_wifi_device` both variants**: the full deploy profile
  (10 named slots → 20 command records with short + long-press,
  `power_on/off_command_id`, `input_command_ids`) writes and re-reads
  correctly. X1S virtual-IP records carry the callback `host:port`;
  the X1 Roku device record carries the callback IP. Every record's
  path is `/launch/<hub_action_id>/<device_id>/<command_index>/<short
  |long>`. Live-firing a command produces exactly one callback.
- **X1 command-id remapping**: the X1 Roku pipeline *writes* its
  family-0x0E records at key ids `0x18..0x2B`, but the hub re-exposes
  them in the command table as ids `1..20` — the same numbering the
  X1S writes directly, and the id space `REQ_ACTIVATE` and the
  power/input binding rows address on both variants.
- **Full deploy interplay** (both hubs): the device joins each
  activity's member table (prior members preserved); the activity
  POWER_ON/POWER_OFF macros gain `(dev, 0xC6)` / `(dev, 0xC7)` steps
  resolved through the device's family-0x12 power bindings; the
  POWER_ON macro also gains a `(dev, 0xC5, input_index)` step for
  every member (index 0 = no input); favorites beyond the 4th get a
  display slot via the explicit reorder (new favorites tail the
  pre-existing ones in add order); short + long-press button bindings
  land. Untouched activities stay byte-identical.
- **Re-sync heals exactly**: after the managed-device delete that
  opens a re-sync, recreate + re-deploy restores the activities with
  no duplicate members, exactly the deployed favorites/bindings, and
  correct macro step counts.
- **Rollback is clean**: `add_device_to_activity` against a
  nonexistent activity fails without partial writes; deleting the
  half-deployed device returns the catalog to baseline.

Hub behaviors discovered:

- **`REQ_ACTIVATE` runs the activity power macros, but only on a real
  state transition.** Driving activity on/off over TCP (`send_command
  [act, POWER_ON/OFF]`, HA's own production path) delivers the wifi
  device's power-on + input callbacks on idle→active and the power-off
  callback on active→idle — one each. A `REQ_ACTIVATE` that does not
  change state (already-active activity) is a no-op and emits nothing.
- **The activity input fires on a direct A→B switch of a shared
  device** (`bench_107_input_switch`, X1S 2026-07-15). With one wifi
  device a member of both activities (input cmd 3 on A, cmd 4 on B):
  idle→A delivers power-on + input-3; **A→B delivers only input-4 —
  no power rows**, the shared device is not power-cycled across the
  switch; B→idle delivers power-off. Per-activity inputs therefore
  cover the "always-on device, per-activity source" use case
  (issue #258) at the hub level. Reproduction note: the realtime
  current-activity emit (`proxy.state.current_activity`) is the only
  reliable activation signal for TCP-driven transitions — the catalog
  rows' `state` field reads empty on X1S, and an unverified first
  activation can silently no-op, turning an intended A→B probe into
  idle→B.
  Every re-sync begins by deleting the managed device, and any device
  delete GC's every one-device activity (backup/restore finding,
  re-confirmed here on both hubs). See the user-facing caveat in
  `docs/wifi_commands.md`.
- **The delete sweep does not restore overwritten bindings.** Deploy
  overwrites whatever a target hard button held; the subsequent
  re-sync delete removes the row, leaving the button unbound rather
  than returning it to its old function — a pre-existing binding on a
  deploy-target button is permanently lost across a re-sync cycle.
- **X1 quick-access order table keeps dangling ids after a delete.**
  The 0x0162 order table still lists a deleted device's favorite ids;
  a re-deploy's favorite-stage (family 0x61) is rejected `status=0x06`
  until the 0x3E map steps re-bind every dangling id, after which the
  stage + explicit reorder commit correct slots. X1S assigns fresh
  fav ids and shows none of this. Untested watch item: an X1 re-sync
  deploying *fewer* favorites than the prior deploy could leave order
  ids dangling with no map step to re-bind them.

Engine bug the program caught (fixed, regression-tested):

1. `_flush_buffer` sent directly from the shared `_local_to_hub`
   bytearray; `socket.send(bytearray)` holds a buffer-protocol export
   for the syscall, so a concurrent `send_local()` → `extend()` on
   another thread died with `BufferError: Existing exports of data:
   object cannot be re-sized`. Now sends from a snapshot copy
   (`transport_bridge._flush_buffer`).

## Validated: live-editor rename executors (X1 + X1S, 2026-07-13)

The Activities-tab live editor grew in-place rename of an activity or
device (deployed through the normal Sync) and immediate delete of either
(a device-delete family-0x09 write by id — activities live in the same
id table, so the one primitive covers both). Delete reused the existing
`delete_device`; the two rename executors were built and bench-validated
here against the sacrificial `Bench Test` activity and `test` device on
both hubs (rename → re-read → assert only the name changed, every sibling
and every other record field byte-identical → restore).

### Activity rename — `_sync_step_activity_rename`

Read-modify-write of the activity row the confirm/finalize opcode carries.
The name field sits at **offset 32** in the row payload — ASCII on X1
(60-byte field), UTF-16BE on X1S/X2 (the zero-padded region up to the tail
token block at offset 152). Patch the name in place, clear the X1S
needs-confirm flag, send via `OP_ACTIVITY_CONFIRM 0x7B38` (X1) /
`OP_ACTIVITY_ASSIGN_FINALIZE 0xD538` (X1S/X2), ACK `0x0103`. (Item V5,
now implemented.)

### Device rename — `_sync_step_device_rename`

Device rename is a device-record update via `FAMILY_DEVICE_UPDATE`
(`0x7B08` — the same commit the create flow ends with). The catalog
read-row body (120 B X1 / 210 B X1S) is **not** a drop-in write body: the
canonical write body is 123 B (X1), so the opcode-hi (= payload length)
only lands on `0x7B` when the full body is rebuilt. The reliable path is
therefore `parse_device_record` → swap the name → `build_device_create_payload`
(which reseals the trailing body checksum), then send for the device's own
id. Name at offset 29, ASCII on X1 / UTF-16BE on X1S. ACK `0x0103`. A raw
byte-patch of the read-row body is rejected (wrong length → wrong opcode);
the parser/builder round-trip is the fix. (Resolves the open device-rename
opcode item.)

## Validated: in-place command-payload overwrite (X1 + X1S, 2026-07-13)

Re-issuing a family-`0x0E` command-record write to an **already-occupied**
`(device_id, command_id)` **overwrites that command's payload in place** — it
does not allocate a new slot or duplicate the command. This is the write that
backs live command-payload editing (Hub tab → Devices → Edit → Commands → edit
payload, folded into device Sync). It settles item **V6**: while the app has no
command *rename* affordance to trace, the in-place `0x0E` *payload* update is now
directly proven, so the earlier "no way to derive an in-place `0x0E` update"
caveat no longer blocks a payload overwrite.

Bench-validated via the production primitive `IrBlobMixin.overwrite_command_payload`
(`bench_93_command_payload_overwrite.py`) on the X1 `Xbox` device (`0x06`) and the
X1S `Sonytst` device (`0x09`):

- **Idempotent overwrite** — writing a command's own bytes back leaves the whole
  device byte-identical (every command's `data_hex`, `button_code`,
  `library_type`, name) and creates no new slot.
- **Content overwrite** — writing a *different* real IR blob (sourced from another
  command on the same device) into the slot changes **only** the target's
  `data_hex`; its `button_code`, `library_type`, name, the command-id set, and
  every other command stay identical. Preserving the 48-bit `button_code` is what
  keeps bindings/macros that reference the command resolving.
- **Restore** — writing the original bytes back returns the device to baseline.

Preservation mechanics: the write reuses `build_command_write_steps` with
`button_id = command_id` (the device-command convention) and the command's
existing `button_code` / `library_type` read from `state.command_metadata`
(populated by the command-list fetch), with the label from the command label
map. `overwrite_command_payload` deliberately skips `_allocate_command_id` (which
refuses an existing id) and the sort-registration step (the slot already has a
display position). Observed `button_code` values are small ids (e.g. `0x01` for
`Power`), not the `0x4E20 + id` synthetic codes; both hubs preserved them
exactly.

The full device-Sync chain was also validated end-to-end
(`bench_94_command_payload_sync.py`, X1 + X1S): a blob-free structural baseline
plus an edited bundle carrying a `restore_data.edited` marker, run through the
production `sync_device` (`build_device_sync_plan` →
`_device_immutable_signature` scope guard → stale pre-flight →
`_sync_step_command_payload`). One `command_payload` step is planned and
dispatched, the target payload lands, everything else is preserved, and a
fetched-but-unedited payload (no marker) produces an empty plan — confirming the
planner keys on the edit marker, not a baseline-vs-edited byte diff.

**Non-IR classes overwrite the same way (X1 + X1S, 2026-07-13).** The full sync
chain was re-run on the sacrificial **wifi** devices (X1S `0x0A` wifi_ip, X1
`0x09` wifi_roku) and lands identically: overwriting by `command_id` hits the
right slot and changes `data_hex`, everything else preserved. This refutes the
earlier worry that X1's wifi records (stored at hub keys `0x18..` but re-exposed
as command ids `1..20`) would need special addressing — both the read and the
`0x0E` write go through the `1..20` command-table space, so they stay
consistent. Live payload editing is therefore offered for **all** device classes
(raw hex, or the structured form where a parser exists); only the *Test* button
stays IR-only (it uses `play_ir_blob`). One shape note: the wifi restore_data
export does not carry `button_code`, so the executor reads it (and
`library_type`) from `state.command_metadata`, not from the bundle row.

### Command rename rides the same record write (X1 + X1S, 2026-07-13)

The `0x0E` record carries the command's **label** slot alongside the payload
(30-byte ASCII on X1, 60-byte UTF-16BE on X1S/X2), so a rename is the identical
in-place rewrite with a *changed label and unchanged payload*.
`bench_95_command_rename_probe.py` rewrote one command's record with a new name
and its original bytes on both hubs: the hub **re-exposes the new label** (round-
trips through UTF-16BE on X1S) while the payload, `button_code`, `library_type`,
the command-id set, and every other command stay intact. Restore returns the
original name. Because bindings/macros reference the 48-bit `button_code`, not
the label, a rename cannot break references — it is reference-safe.

This settles item **V6** (command rename). Live command rename now ships:
`_sync_step_command_rename` fetches the command's current blob
(`request_ir_command_dump` + `split_play_blob_tail` — the record rewrite needs
the existing `library_data`, which the command-list fetch does not carry), reads
`button_code`/`library_type` from `state.command_metadata`, and rewrites the
record with the new label via `overwrite_command_payload`. The full Sync chain
(`sync_device` → `command_rename` step → fetch → relabel) is validated on both
hubs (`bench_96_command_rename_sync.py`, X1 `Xbox`/`0x06` + X1S `Sonytst`/`0x09`):
one `command_rename` step lands, the hub re-exposes the new name, and the
payload / code / type / id-set / other commands are untouched. A command with
*both* a rename and a payload edit is written once — the `command_payload` step
carries the new label — so no double write.

## Validated: command_add — new command via device Sync (X1 + X1S, 2026-07-13)

Persisting a **brand-new command record** from the live device editor's
"Add command" dialog is validated end-to-end through the production
`sync_device` chain (`build_device_sync_plan` → scope guard → stale
pre-flight → `_sync_step_command_add`). All runs were isolated on a
*clone* of a sacrificial device (`restore_device` → adds → `delete_device`),
so nothing permanent changed on either hub
(`bench_98_command_add_sync.py`: X1 `TCL C8K 2`/`0x07` clone + X1S
`Sonytst`/`0x09` clone; `bench_99_command_add_wifi.py`: X1 `test`/`0x09`
wifi_roku clone + X1S `Lights`/`0x0A` wifi_ip clone; 50/50 checks OK):

- **IR descriptor add** — a new-flagged row whose `restore_data.decoded`
  carries `class: ir` + a descriptor synthesizes the record via
  `build_descriptive_ir_blob_body` and lands through `persist_ir_blob` at
  the frontend's provisional command id. The stored bytes read back equal
  the synthesized body exactly (declared-length + magic + descriptor +
  four trailing nulls), `library_type` is IR-DB `0x0D`, and every
  pre-existing command stays byte-identical.
- **Raw-hex add** — a new-flagged row with only `data_hex` lands through
  `persist_command_record` with `library_type` **cloned from an existing
  command's cached metadata** (a device's commands share one codec) and
  `command_code 0` (no canonical button code asserted; the hub assigns on
  accept — readback shows `button_code 0` until then). The executor then
  runs the family-0x61 sort registration explicitly (persist_command_record,
  unlike persist_ir_blob, leaves it to the caller).
- **Decoded wifi add (cloned trailer)** — a new-flagged row whose decoded
  block carries the class fields plus a template command's `trailer_hex`
  re-encodes through `encode_decoded_blob` (round-trip verified by
  `_edited_command_data_hex`) and lands correctly for both `wifi_roku`
  (edited ECP path) and `wifi_ip` (full HTTP request shape). Readback
  decodes to the edited fields with the template trailer byte-for-byte.
  Shape note: captured wifi records on both hubs carry an **empty**
  trailer (the canonical backup body already strips the per-record
  checksum), so the template-trailer clone is a fidelity safeguard, not a
  load-bearing requirement in practice.
- **Display-sort registration** — after each add, the hub's family-0x61
  key-sort blob (read back via `fetch_device_key_sort`) lists the new
  command id. Devices without a prior key-sort blob get one created by
  the write: existing commands appear as `(id, 0xFF)` ("unset" — id-order
  display) and the new commands take positions `0, 1, …`. This matches
  the behavior the shipped `persist_ir_blob` service always had.
- **Scope guard** — an added command row *without* the dialog's
  `restore_data.new` flag fails the plan
  ("outside the live-editable fields"), on the hub, before any write.
  Command deletes still trip the guard (deleting stays in Backup → Edit).

## Validated: device head IP edit via device Sync (X1 + X1S, 2026-07-14)

The live device editor's Network-section IP edit is validated end-to-end
through the production `sync_device` chain (`build_device_sync_plan` →
scope guard → stale pre-flight → `_sync_step_device_ip`) with
`bench_100_device_ip_sync.py` — X1 `test`/`0x09` (wifi_roku) and X1S
`Philips hue 2`/`0x02` (wifi_hue, restored byte-identically). On both hubs:

- **Head IP rewrite** — the same `parse_device_record` → swap
  `ip_address` → `build_device_create_payload` → `FAMILY_DEVICE_UPDATE`
  record rewrite as device rename. The re-read record body differs from
  the original **only** in the tail IP marker window (6 bytes at
  `29 + 2*slot`: `FC 55` + 4 IP bytes) plus the trailing checksum; name,
  commands, and every other device are byte-identical.
- **No-op plan** — an identical baseline/edited pair plans zero steps.
- **Rename + IP compose** — one plan carrying `device_rename` *then*
  `device_ip` lands both head writes: each executor writes its rebuilt
  body back to the cached `raw_body`, so the second record rewrite builds
  on the first instead of a stale snapshot.
- **Round-trip restore** — syncing the original IP (and name) back leaves
  the record body byte-identical to the pre-bench baseline.

## Validated: activity display-order write — family 0x51 (X1 + X1S, 2026-07-14)

The activity list re-order (tools-card "Change order") is validated
end-to-end with `bench_101_reorder_capture.py` (app capture through the
proxy) and `bench_102_reorder_write.py` (our own write + read-back):

- **App capture (X1S)** — the official app's re-order sends ONE frame,
  opcode `0x1051` (family `0x51`, `FAMILY_ACTIVITY_SORT`), not
  per-activity row rewrites: 3-byte outer wrapper `01 00 01`, body header
  `01 00 01`, one `(0x00, activity_id, sort_position)` row per activity in
  display order, trailing body checksum (`sum(body[:-1]) & 0xFF`). Hub
  answers `STATUS_ACK 0x00`; the app follows with `REMOTE_SYNC (0x0064)`.
  Captured example (order 0x67→1, 0x66→2, 0x65→3):
  `a5 5a 10 51 01 00 01 01 00 01 00 67 01 00 66 02 00 65 03 3a d6`.
- **Sort byte read-back** — after the write, `CATALOG_ROW_ACTIVITY` rows
  report the new positions in the record's sort byte (body[6], i.e.
  payload[9]); the persistent cache and the frontend list order follow it.
- **Our writer (X1S + X1)** — `X1Proxy.reorder_activities` reproduces the
  frame byte-identically (golden-tested against the capture). Live: X1S
  write + read-back MATCH (and restored the pre-bench order); X1 reverse →
  MATCH, restore → MATCH. Same opcode works on both firmware generations;
  X1 rows carry the same sort byte.
- **Guards** — partial orders (not covering every catalog activity) and
  unknown ids are refused before any write; live-confirmed on X1.

**Blank activity create (X1S)** — `X1Proxy.create_activity` (the
tools-card "Add Activity" flow; `restore_activity` with an empty
synthetic payload) validated live: hub assigned the next id, the catalog
re-reported the new name, and the hub itself stamped the next sort
position (existing 1..3 → new row sort=4), so a fresh activity lands at
the end of the display order. Cleaned up via the standard delete. The
underlying family-0x37 create pipeline was already validated on X1 in
the backup/restore program; the zero-member variant has only been
exercised on X1S.

## Validated: device display-order write — family 0x11 (X1 + X1S, 2026-07-16)

The device list re-order (tools-card "Change order" under Hub → Devices)
is validated with `bench_110_device_reorder_write.py` (our own write +
read-back on both hubs):

- **Frame** — the device-side analog of the family-`0x51` activity write:
  ONE frame, family `0x11` (`FAMILY_DEVICE_SORT`), identical paged-write
  body, except each row leads with the device record's kind byte
  (record body[3], `0x00` on every record observed on X1/X1S — including
  Wifi devices) instead of the activities' fixed `0x00`:
  `(record_kind, device_id, sort_position)`. Hub answers
  `STATUS_ACK 0x00`; followed by `REMOTE_SYNC (0x0064)`. Live X1 example
  (reverse order 0x06→1 … 0x01→6):
  `a5 5a 19 11 01 00 01 01 00 01 00 06 01 00 05 02 00 04 03 00 03 04 00 02 05 00 01 06 2c 83`.
- **Sort byte read-back** — after the write, `CATALOG_ROW_DEVICE` rows
  report the new positions in the record's sort byte (body[6]); the
  persistent cache and the frontend list order follow it.
- **Our writer (X1 + X1S)** — `X1Proxy.reorder_devices` golden-tested
  against the live frame. X1: reverse → MATCH, restore → MATCH. X1S
  (13 devices, IR + BLE + Wifi mix): permute → MATCH, restore → MATCH.
- **Ties** — hubs that were never (or only partially) reordered carry
  duplicate sort bytes (devices added since the last reorder all share
  the next value); the write restamps every record with unique 1-based
  positions, so a full-coverage write "normalizes" ties. Display-order
  ties resolve by id, which matches the observed remote behavior.
- **Guards** — same as activities: partial orders and unknown ids are
  refused before any write.

## Role-page keymap slots are hub-derived and bistable (X1S, 2026-07-14)

Investigation of UI-bench BUG #4 (activity 107, FWD `0xBD`, FireTV dev 4:
slot flipped `(4,0)` → `(4,21)` → `(4,0)` over minutes, false-positiving
the activity stale preflight). Benches `bench_103_roleslot_recon.py`,
`bench_104_roleslot_probe.py`, `bench_105_roleslot_fwd_write.py`,
`bench_106_roleslot_member_add.py` on the sacrificial X1S.

**What the slots are.** An activity keymap "role page" slot is a row the
hub maintains for a role-assigned device: it mirrors that device's own
device-mode keymap page for the same button. The BUG #4 flip values
bracket exactly dev 4's device page (`0xBD → cmd 21`, present in the P0
recovery bundle and in every capture today): `(4,0)` is the unmaterialized
placeholder (dropped from bundle exports since the BUG #3 fix), `(4,21)`
the materialized mirror. Device-page rows carry real BT button codes in
bytes [7..8] of the 18-byte record; rows written by our 0x3E writer carry
synthetic `0x4E xx` codes.

**What does NOT trigger the recompute** (all probed live, 10–25 min
observation windows, 15 s keymap polls):

- bare `0x3E` binding writes (with and without a follow-up
  `REMOTE_SYNC`) — rows store immediately and exactly as written,
  including an explicit `0xBD → (4,21)` that matched the device page
  (never demoted to `(4,0)`);
- key-row deletes (`0x0210` + `0x65` commit) of sibling role-group rows;
- an unrelated channel-group binding add + remove (the exact BUG #4
  perturbation) — the FireTV playback rows never moved;
- `add_device_to_activity` member replay + `REMOTE_SYNC`;
- keymap reads themselves. The FireTV device-mode page also stayed
  byte-stable throughout.

**Conclusion.** The recompute is not reachable from the TCP client. The
remaining trigger — consistent with every BUG #4 observation happening
while the physical remote was actively syncing after editor writes, and
with nothing flipping during today's harness-only session — is the
remote's BLE sync processing BT-profile keymap pages: the hub
re-derives role-page slots from the role device's page when the remote
syncs, on the remote's own schedule (minutes, or never while the remote
is idle). The settled state therefore cannot be modeled or awaited by
the integration.

**Fix.** The activity stale preflight and the post-sync settle loop
(`lib/proxy_activity_sync.py`) now exclude binding rows that mirror the
target device's own device-mode page (same button → same command,
long-press consistent, reference built from the baseline bundle's device
blocks merged with live proxy state) from the staleness comparison, on
both sides. Favorites, macros, and any binding that does not mirror a
device page still compare byte-for-byte, so real foreign edits stay
caught; a vendor-app edit that exactly reproduces a device-page mapping
is indistinguishable from the hub's own derivation by construction and
is deliberately tolerated.

## Validated: UI end-to-end bench (X1S, 2026-07-14/15) — programs P0–P6

Browser-driven end-to-end bench against a live HA instance and the
sacrificial X1S: every flow exercised through the tools card exactly as
a user would, verified against the wire log and hub read-backs. Plan and
per-chunk log: `docs/internal/ui-bench-plan.md` (gitignored). Programs:
P0 bootstrap/baseline, P1 cache & capture surfaces, P2 activity
lifecycle, P3 activity content editing, P4 device editing, P5 backup &
restore UI (+ editor-correctness extension), P6 Wifi Commands deploy.
P7 (remote surfaces smoke) deliberately skipped — proven in the field,
may be revisited. X1 was baselined in P0 and verified untouched at
close-out (fresh export identical to the P0 bundle modulo capture
timestamps); the X1S closed each program restored, and closed P6
bit-exact at its recovery baseline (same modulo).

**Bug ledger** (all eight fixed and re-verified live on the X1S):

1. `reset_ack_queues()` wiped the shared macro cache hub-wide on every
   write flow (root cause of bystander-validation failures on fresh
   activities). Fix: transient wait-map split from persistent
   `_macro_records_cache`.
2. Post-sync stale false-positives: local baseline promotion missed the
   hub's async power-duration canonicalization. Fix: backend rebase from
   a settled post-sync capture + duration-normalized signatures.
3. Export emitted keymap placeholder rows (`command_id == 0`). Fix:
   skipped in `build_activity_button_rows`.
4. Role-page keymap slots are hub-derived and bistable (see the
   dedicated section above). Fix: preflight/settle tolerance for
   device-page-mirroring rows.
5. Favorites and macro shortcuts share one fav-id namespace per activity
   on the hub, but the card renumbers client-side → a new macro shortcut
   silently overwrote a favorite. Fix: executor-side allocation against
   live hub occupancy, plus content-checked favorite/macro deletes.
6. Device restore failed on a degenerate key-sort table (all
   `0xFF`/`0x00` "unpositioned" sentinels rejected by the hub with
   status 0x06) and left a partial device. Fix: skip the key-sort
   finalize write for position-free tables (positions are 1-based;
   `0x00` = unset) + rollback of the created device on finalize failure.
7. Backup-editor command delete cascaded bindings but not the owning
   device's own power/user macros (dangling steps, no impact warning).
   Fix: device-macro pruning + "power sequence step" impact count.
8. New-member sync dropped the chosen input: `member_replay` carried no
   `input_cmd_id`, and fresh-activity power macros were mis-flagged as
   new. Fix: input ordinal resolved from the edited bundle and threaded
   through `add_device_to_activity`; power macros (198/199) exempt from
   quick-access id allocation.

**Wifi Commands deploy through the UI (P6, X1S).** Full pipeline
validated: device + command creation in the card, deploy (8 steps,
hub device created with 10 short + 10 long-press command records),
callback delivery (`REQ_ACTIVATE` → hub HTTP POST to the listener →
sensor pulse → 200), three re-syncs, UI delete, hub restored bit-exact.
Findings:

- **Device-delete GC semantics sharpened** (three data points, plus one
  from P5): the hub sweeps only activities left with **zero devices**
  after a delete. An activity whose sole member was the deleted wifi
  device is removed; unrelated single-member activities survive.
  `docs/wifi_commands.md` corrected accordingly (its earlier wording —
  any single-device activity dies — was overbroad).
- **Overwritten-binding drop confirmed exactly as documented**: deploying
  a wifi command onto a bound button overwrites the binding; unassigning
  and re-syncing leaves the button unbound — the original binding is not
  restored.
- Immediately after a deploy's closing remote-resync, an activity's
  role-page rows can read back empty until the remote's BLE sync
  rematerializes them (the bug-#4 bistability window); the shipped
  tolerance covers it.
- A stale/unknown activity id in the command config is defended:
  `sync_command_config` drops it with an info log and deploys cleanly,
  so a mid-deploy activity-add failure is not reachable via that vector
  (failure rollback remains covered by the 2026-07-12 lib-level
  program).
- Minor, tracked as tasks: a leftover `[WIFI_ACTION_DEBUG]` warning logs
  on every callback (`hub.py`), and the editor's hard-button conflict
  hint checks other wifi slots but not existing hub bindings in the
  target activities.

**Hub facts collected along the way** (details in the plan's chunk log):
hub reuses freed device/activity ids; activity catalog rows stay in
creation order with display order carried by the per-row sort token
(family 0x51); key-sort positions are 1-based with `0x00` and `0xFF`
both meaning "unpositioned"; non-erase device restore is additive
(erase mode is the replace path); the wifi-commands sensor pulse resets
after 0.3 s by design.

## Validated: quick-access reorder with macro shortcuts (X1 + X1S, 2026-07-16)

The live Activities editor's quick-access list mixes command favorites and
macro shortcuts, which share **one** fav-id/key-id namespace on the hub. The
reorder fix (matches editable macros baseline↔edit by content, so a pure move
emits no macro rewrite; carries the whole mixed order through the family-0x61
sort page) is validated end-to-end. Plan:
`docs/internal/macro-reorder-bench-plan.md`. Benches
`bench_108_macro_order_probe.py` (protocol probe) and
`bench_109_macro_reorder_sync.py` (`sync_activity` S1–S5), on the sacrificial
Bench Test activity (`0x68`).

- **Mixed family-0x61 sort page is accepted written by us.** A page listing a
  macro **key id** alongside favorite **fav_ids** (`reorder_favorites(act,
  [macro, fav1, fav2])`) → `STATUS_ACK 0x00` + `0x65` commit. The 0x0162
  order read-back is `[(macro,1),(fav1,2),(fav2,3)]` on BOTH hubs — the macro
  takes slot 1. Our writer previously sent favorite-only pages, silently
  dropping macros from the order table; it no longer does.
- **0x61 is slot-table, NOT renumber (ids stable).** Across a non-identity
  reorder the macro key id and the favorite fav_ids are unchanged; only the
  slot assignment moves. Cached macro key ids and macro-target binding refs
  therefore stay valid after our reorder — **no cache-refresh / binding-rewrite
  follow-up is needed.** (0x0162 returns only favorites, so a *macro-only*
  single-entry page reads back as an empty favorites order — and an empty
  order makes `request_favorites_order` return `None`, which trips the
  order-fetch guard in `reorder_favorites`/`delete_favorite`; only reachable by
  writing a macro-only page, benign for the fix, worked around in the benches.)
- **Single-entry 0x61 page is accepted** (new-macro registration when the macro
  is the only editable quick-access entry).
- **`sync_activity` engine (S1–S5, X1 + X1S), asserted at plan and hub level:**
  - *Pure move* — no `macro_write`/`macro_delete`; only `favorite_order` +
    `remote_sync`; the macro record is byte-identical (key id, label slot, step
    count unchanged).
  - *Move + rename* — exactly one `macro_write` at the **baseline** key id (not
    a delete+recreate at a new id), no delete; steps byte-identical.
  - *New macro mid-list at a proposal id already held by a live favorite* — the
    executor allocates a **free** id (never the favorite's), the record is
    readable, and the `new` order entry follows the allocator's remap to its
    slot.
  - *Macro-target binding* (`command_to_button` UP→macro) survives a reorder:
    no `binding_write`, the hub row still reads `device_id=activity,
    command_id=<macro key>`.
  - *Stale regression (the reported symptom)* — a move followed immediately by
    a recapture + second sync no longer fails at `stale_check`; the old
    delete+recreate that mutated the activity is gone.
- **X1 quirk:** `command_to_favorite`/`delete_favorite` occasionally return
  `None` even though the write lands — verify favorite ops by re-read on X1,
  not by the return value.

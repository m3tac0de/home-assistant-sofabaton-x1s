# Hub-erase opcode (`0x001D`)

The "erase configuration" / "restore factory settings" wire operation
is a single, payload-less frame. It is identical across the three
observed hub variants -- X1, X1S, and X2 -- and the same opcode is
used both as the user-facing "Restore factory settings" button on the
remote-app side and as the implicit clear-and-restore preamble before
a backup is rewritten onto the hub.

## Frame layout

```
A5 5A 00 1D <checksum>
```

| Offset | Bytes | Field | Notes |
|-------:|------:|-------|-------|
| 0 | 2 | magic | `A5 5A`, same frame magic used by every other request opcode |
| 2 | 1 | payload_hi | `0x00` -- no body bytes follow |
| 3 | 1 | opcode_lo | `0x1D` |
| 4 | 1 | trailing_checksum | computed over the preceding 4 bytes using the canonical 8-bit checksum used by every other request frame |

The full opcode is therefore `0x001D`. There is no payload, no
device id selector, no scope selector: the operation always erases
*everything* in the hub's user-visible configuration table (devices,
activities, button bindings, macros, favourites, inputs). It is the
single-shot equivalent of deleting every device individually.

## Variant coverage

| Hub variant | Opcode | Frame shape | Notes |
|-------------|--------|-------------|-------|
| X1          | `0x001D` | `A5 5A 00 1D <ck>` | |
| X1S         | `0x001D` | `A5 5A 00 1D <ck>` | identical to X1 |
| X2          | `0x001D` | `A5 5A 00 1D <ck>` | identical to X1 |

No per-variant divergence has been observed. A single builder is
sufficient.

## Response and timing

Observed behaviour after the frame is sent:

- The hub eventually emits a single response frame on the same
  channel. The response contents are not consumed beyond "did
  anything arrive after the send?" -- the operation is treated as
  fire-and-forget once an ack of any kind comes back. Treat any
  first response frame after the send as success.
- **No firm wire-level timeout is documented in the upstream client.**
  The clear-and-restore flow (the one bundle restore mirrors) waits
  indefinitely until either an ack, a disconnect, or a transport
  interrupt arrives. Two unrelated user-facing flows (the
  "Restore factory settings" buttons in the per-variant setting
  screens) wrap the send in a UI loading dialog that dismisses
  after a fixed duration (~20 s BLE, ~30 s TCP), but those are
  UX-level spinner watchdogs -- they do not cancel the wire-level
  wait. The actual time the operation takes is bounded by the hub,
  not by the client.
- For the integration we should therefore pick a generous wire-level
  timeout (suggested starting point: **2 minutes**) rather than the
  20-30 s spinner numbers. Embedded controllers that wipe persistent
  configuration tables routinely take that long, and the upstream
  client's clear-and-restore path explicitly accepts unbounded waits.
  The exact value should be confirmed against a captured run; bump
  it on first observed timeout-on-success.
- The hub commonly drops or briefly cycles the network/BLE session
  immediately after the response. Handle this identically across
  variants:
  - A disconnect arriving *before* an ack is failure.
  - A disconnect arriving *after* the ack is the expected post-erase
    state and the client is expected to reconnect.

## Pre-flight and post-flight

The erase opcode has no documented pre-flight requirement. It can be
sent without first quiescing in-flight catalog requests or pending
writes; any unfinished operations are implicitly cancelled when the
underlying tables are wiped.

After a successful erase the integration should treat the hub state
as fully unknown:

- Drop any cached `devices` / `activities` / `commands` / `buttons`
  / `macros` / `favorites` / `inputs` tables.
- Reset every "complete" / "in-flight" marker.
- Re-request the device and activity catalogs from scratch on the
  next opportunity.

The hub may take up to several seconds after the ack before it is
ready to accept the next request. A short settle delay (1-2 s) before
issuing the first post-erase request avoids spurious "no answer"
classifications.

## Sequence used by the bundle-restore "replace" mode

When a bundle that contains activities is restored, the wire
sequence the integration must issue is:

1. `0x001D` -- erase the hub's configuration tables.
2. Wait for the ack (≤ 30 s) and the post-erase settle delay.
3. Walk `bundle.devices` and issue the per-device create flow for
   each one. The hub assigns fresh device ids; the orchestrator
   builds the source → new id map as it goes.
4. Walk `bundle.activities` and issue the per-activity create flow
   for each one, using the auto-built device-id map plus the per
   source-device command-id map for ``0xC5`` ordinal resolution.

The pure "device append" mode -- a bundle whose `activities` list is
empty -- does **not** issue `0x001D`; existing devices stay on the
hub and the bundle's devices are added alongside them.

## Implementation note for the integration

`SofabatonHub.async_erase_configuration()` is the single entry point.
It should:

- Build the 5-byte frame using the shared frame builder (magic +
  `payload_hi=0x00` + `opcode_lo=0x1D` + checksum) -- no new
  framing code, just `_send_cmd_frame` (or its equivalent) with
  opcode `0x001D` and an empty payload.
- Use a generous ack window (suggested: 2 minutes; the upstream
  client uses no enforced wire-level timeout at all for this
  operation). Any first response from the hub on the same channel
  within the window is success; a hub-initiated disconnect *before*
  any ack is failure. Bump the window if a real run times out
  with the hub still working.
- On success, clear the proxy's catalog/cache mirrors (see
  `proxy_backup.py`'s `clear_*_catalog` and
  `clear_persistent_cache_for` helpers -- they already exist for
  per-entity invalidation and can be reused for the full wipe).
- On success, sleep briefly (1-2 s) before returning so the caller
  can safely issue the next request immediately.
- On failure, raise; the bundle-restore orchestrator surfaces this
  as the bundle's first failure with no devices created.

The `NotImplementedError` stub currently in
`SofabatonHub.async_erase_configuration` is the placeholder for this
implementation. Replace-mode bundle restores (the only callers) will
start succeeding the moment this method is wired up.

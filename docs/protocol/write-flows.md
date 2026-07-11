# Create and update write flows

This document covers the observed write-side families used to create or update
IR, Bluetooth, RF, and activity records on the hub. It stays at the wire level:
payload layouts, ack families, and step ordering.

WiFi/IP device creation has additional transport-specific stages and remains
documented separately in [wifi-commands.md](wifi-commands.md).

---

## Common write families

| Family / opcode | Direction | Purpose | Ack |
|-----------------|-----------|---------|-----|
| family `0x07` | `A->H` | Create device record | `0x0107`, `payload[0] = assigned device id` |
| family `0x37` | `A->H` | Create activity record | assigned-id create ack observed as `0x0137` on X1 |
| family `0x08` | `A->H` | Update/finalize existing device record | `0x0103` |
| family `0x0E` | `A->H` | Write one command/code record, paged as needed | `0x0103` |
| family `0x3E` | `A->H` | Write one button-binding row | `0x013E`, `payload[0] = echoed button id` |
| `0x0241` | `A->H` | Set idle/power behavior for one device | `0x0103` |
| family `0x12` | `A->H` | Write one macro record | `0x0112`, `payload[0]` usually echoes the macro key id — but not always; see note below |
| family `0x46` | `A->H` | Write one inputs page | `0x0103` |
| family `0x61` | `A->H` | Write one device key-sort page | `0x0103` |
| `0x0064` | `A->H` | Remote sync / refresh trigger | `0x0103` |

The generic status ack is described in [ack-handling.md](ack-handling.md). For
these write families, `payload[0] == 0x00` means accepted and a non-zero first
byte means rejected.

**Macro-save ack caveat (family `0x12`)**: when a macro save at activity
scope drops a device's last power-macro reference, the hub cascade-removes
that device from the activity (strips its rows from the other power macro
and deletes its keymap bindings) and acks the successful save with a
`0x0112` whose `payload[0]` is NOT the written key (observed `0x01`,
~1.2 s late, X1 2026-07-11). Wait for any `0x0112`; rejections arrive as
`0x0103` with a non-zero status.

**User-macro creation at activity scope**: writing a family-`0x12` record
directly at a fresh key id (e.g. `0x01`) is accepted by both X1 and X1S —
the official app's create flow (write key `0x00`, hub assigns the real key
in the `0x0112` ack) is *not* required for a client that picks a free key
itself. Bench-validated 2026-07-11.

---

## Standard device-create sequence

For non-WiFi devices, the observed create/update pipeline is:

1. Send the family-`0x07` create header and capture the assigned `device_id`
   from the `0x0107` reply.
2. Send zero or more family-`0x0E` command/code writes for that new device.
3. Send zero or more family-`0x3E` button-binding writes.
4. Optionally send `0x0241` to set idle/power behavior.
5. Optionally send family-`0x12` macro writes.
6. Optionally send one family-`0x46` inputs page.
7. Send the family-`0x08` update/finalize record for the assigned device id.
8. Send `0x0064` to trigger remote refresh.

Observed properties:
- the sequence is strictly serial: each step waits for its ack before the next
  write is sent
- command, macro, and inputs writes may page internally, but still behave as
  one logical step each
- the family-`0x08` finalize step reuses the same 120-byte (X1) or 210-byte
  (X1S/X2) record body as family `0x07`; the main semantic difference is that
  it targets the real assigned `device_id`

---

## Standard activity-create sequence

Observed activity creation reuses the same fixed-size record body as device
creation, but on family `0x37` instead of family `0x07`.

The observed write order is:

1. Send the family-`0x37` activity-create header and capture the assigned
   activity id from the create ack (observed as `0x0137` on X1).
2. Send zero or more family-`0x3E` button-binding writes against that activity.
3. Send zero or more family-`0x12` macro writes against that activity.
4. Send `0x0064` to refresh the remote view.

Observed differences from device creation:
- activities do not own command-code rows, so family `0x0E` is not part of the
  activity-create path itself
- activities do not use the family-`0x08` device-finalize record
- favorite writes are a separate flow, not part of the `0x37` create header

Membership-save opcodes that appear in later activity-edit flows are documented
in [opcodes.md](opcodes.md).

---

## Paging conventions for write families

Observed paged write families use a shared outer wrapper:

```
payload[0]   = page marker / sequence marker (`0x01` in observed traffic)
payload[1:3] = page number, big-endian
payload[3:]  = page-local chunk of the write body
```

Observed by family:
- family `0x0E` command writes use `[command_seq, page_no_be]` instead of
  `[0x01, page_no_be]` in the 3-byte page header
- family `0x46` inputs writes use `[0x01, page_no_be]`
- family `0x61` key-sort writes use `[0x01, page_no_be]`

As on the read side, opcode high byte equals payload length, so the full opcode
changes with page size.

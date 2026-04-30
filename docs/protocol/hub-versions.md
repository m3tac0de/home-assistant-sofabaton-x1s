# Hub Versions

The Sofabaton hub family has three hardware generations with different firmware
behaviours. The version is conveyed in the mDNS TXT record `HVER`.

---

## Version identification

| HVER value | Hub model | Constant   |
|------------|-----------|------------|
| `"1"`      | X1        | `HUB_VERSION_X1`  |
| `"2"`      | X1S       | `HUB_VERSION_X1S` |
| `"3"`      | X2        | `HUB_VERSION_X2`  |

If `HVER` is absent or unrecognised, default to X1 behaviour.

---

## mDNS service type

| Hub        | mDNS service type              |
|------------|-------------------------------|
| X1         | `_x1hub._udp.local.`          |
| X1S        | `_x1hub._udp.local.`          |
| X2 (native)| `_sofabaton_hub._udp.local.`  |
| X2 (proxy) | `_x1hub._udp.local.`          |

This repository's proxy intentionally advertises X2 as `_x1hub._udp.local.` for
compatibility with existing clients and tooling.

---

## NOTIFY_ME reply format differences

The proxy reply to an app NOTIFY_ME probe differs by hub version:

| Field           | X1 / X2           | X1S                       |
|-----------------|-------------------|---------------------------|
| Frame type byte | `0x1A`            | `0x1D`                    |
| Device ID suffix| `0x4B`            | `0x45`                    |
| Version block   | `64 01 20 21 06 09 11 00 00` | `64 02 20 22 11 20 05 01 00` |
| Name field size | up to 12 bytes    | up to 14 bytes (zero-padded) |
| Trailer byte    | (none)            | `0xBE`                    |
| Total reply length | 28 bytes       | 32 bytes                  |

---

## Opcode variants by hub version

### Catalog response opcodes

| Opcode   | Hub versions | Name                    |
|----------|-------------|-------------------------|
| `0xD50B` | X1S, X2     | `CATALOG_ROW_DEVICE`    |
| `0x7B0B` | X1          | `X1_DEVICE`             |
| `0xD53B` | X1S, X2     | `CATALOG_ROW_ACTIVITY`  |
| `0x7B3B` | X1          | `X1_ACTIVITY`           |

### Activity favorites mapping

| Opcode   | Hub versions | Name                      |
|----------|-------------|---------------------------|
| `0x7B6D` | X1          | `ACTIVITY_MAP_PAGE`       |
| `0xD56D` | X1S, X2     | `ACTIVITY_MAP_PAGE_X1S`   |

### Remote control

| Opcode   | Hub versions | Name              | Notes |
|----------|-------------|-------------------|-------|
| `0x0023` | X1, X1S     | `FIND_REMOTE`     | empty payload observed in this implementation |
| `0x0323` | X2          | `FIND_REMOTE_X2`  | `[0x00, 0x00, 0x08]` payload |
| `0x0064` | X1, X1S     | `REMOTE_SYNC`     | Force remote↔hub sync |
| `0x012E` | X2          | `X2_REMOTE_LIST`  | List connected remotes |
| `0x332F` | X2          | `X2_REMOTE_LIST_ROW` | One row per connected remote |
| `0x0464` | X2          | `X2_REMOTE_SYNC`  | Sync a specific remote by ID |

### Activity assignment

| Opcode   | Hub versions | Name                        |
|----------|--------------|-----------------------------|
| `0x7B38` | X1           | `ACTIVITY_CONFIRM`          |
| `0xD538` | X1S, X2      | `ACTIVITY_ASSIGN_FINALIZE`  |
| `0x0265` | X2           | `ACTIVITY_ASSIGN_COMMIT`    |

Observed follow-up for `DELETE_DEVICE`:

- all observed versions use `DELETE_DEVICE` (`0x0109`) for the delete request itself
- X1 follows with `ACTIVITY_CONFIRM` (`0x7B38`) when affected activities must be saved
- X1S / X2 follow with `ACTIVITY_ASSIGN_FINALIZE` (`0xD538`)

### Keepalive

| Opcode   | Hub versions | Name         | Notes |
|----------|-------------|--------------|-------|
| `0x0140` | All          | `PING2`      | Client → Hub keepalive |
| `0x0242` | X1S, X2     | `PING2_ACK`  | Hub → Client response |

X1 hubs do not respond to `PING2` with `PING2_ACK`.

---

## Activity inputs

`REQ_ACTIVITY_INPUTS` (`0x0148`) is used as the request opcode across all observed
versions in this repository. The important version difference is the response layout:

- X1 uses the older activity-inputs payload shape
- X1S / X2 use the newer `0x47` payload layout with subtype-specific record sizes

So the protocol distinction here is primarily in **response parsing**, not in the
request opcode itself.

---

## Parser selection flag (X1 vs X1S/X2)

Several response parsers switch behaviour based on a "looks_like_x1s" heuristic
derived from the observed opcode set. A client can detect which firmware stream it
is receiving from the first catalog opcode seen:

```
if first_opcode in (0xD50B, 0xD53B):
    hub is X1S or X2
elif first_opcode in (0x7B0B, 0x7B3B):
    hub is X1
```

This avoids relying solely on the `HVER` mDNS property, which may not always be
present in third-party implementations.

---

## X2 remote ID format

X2 hubs support multiple physical remotes. Each remote has a 3-byte ID embedded in
`X2_REMOTE_LIST_ROW` (`0x332F`) response frames. This 3-byte ID is used verbatim in
the `X2_REMOTE_SYNC` (`0x0464`) payload:

```
X2_REMOTE_SYNC payload: [remote_id byte 0][remote_id byte 1][remote_id byte 2][0x01]
```

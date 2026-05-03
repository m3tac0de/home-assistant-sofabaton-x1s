# Hub Versions

The Sofabaton hub family has three observed hardware generations. The version is
usually exposed in the mDNS TXT record `HVER`.

---

## Version identification

| `HVER` | Model |
|--------|-------|
| `1` | X1 |
| `2` | X1S |
| `3` | X2 |

If `HVER` is unavailable, the first catalog opcode seen on the wire also
distinguishes X1 from X1S/X2:

| First catalog opcode | Interpretation |
|----------------------|----------------|
| `0x7B0B` or `0x7B3B` | X1 |
| `0xD50B` or `0xD53B` | X1S or X2 |

---

## mDNS service types

Observed physical hub advertisements:

| Model | Service type |
|-------|--------------|
| X1 | `_x1hub._udp.local.` |
| X1S | `_x1hub._udp.local.` |
| X2 | `_sofabaton_hub._udp.local.` |

Third-party bridges may choose to advertise a different compatible service type,
but the physical X2 hardware has been observed using `_sofabaton_hub._udp.local.`

---

## NOTIFY_ME reply differences

The UDP discovery reply differs by hub line.

| Field | X1 / X2 | X1S |
|-------|---------|-----|
| Frame-type byte | `0x1A` | `0x1D` |
| Device-id suffix byte | `0x4B` | `0x45` |
| Version block | `64 01 20 21 06 09 11 00 00` | `64 02 20 22 11 20 05 01 00` |
| Name field size | up to 12 bytes | 14 bytes, zero-padded |
| Trailer byte | none observed | `0xBE` |

---

## Major opcode-family differences

### Catalog rows

| Family | X1 | X1S/X2 |
|--------|----|---------|
| Device catalog | `0x7B0B` | `0xD50B` |
| Activity catalog | `0x7B3B` | `0xD53B` |

### Activity membership

| Purpose | X1 | X1S/X2 |
|---------|----|---------|
| `REQ_ACTIVITY_MAP` reply | `0x7B6D` | `0xD56D` |

### Activity save / confirm

| Purpose | X1 | X1S/X2 |
|---------|----|---------|
| Save affected activity after membership change | `0x7B38` | `0xD538` |

### Remote-specific operations

| Opcode | X1 | X1S | X2 |
|--------|----|-----|----|
| `FIND_REMOTE` | `0x0023` | `0x0023` | `0x0323` |
| `REMOTE_SYNC` | `0x0064` | `0x0064` | `0x0464` plus remote-list flow |
| `X2_REMOTE_LIST` | no | no | `0x012E` / `0x332F` |

### Keepalive

| Opcode | X1 | X1S/X2 |
|--------|----|---------|
| `PING2` request | `0x0140` | `0x0140` |
| `PING2_ACK` reply | not observed | `0x0242` |

---

## Activity-input responses

The request opcode is the same on all observed hub lines:

| Purpose | Opcode |
|---------|--------|
| Request activity inputs | `0x0148` |

The response layout differs:

- X1 uses an older fixed-record layout
- X1S/X2 use `0x47` pages with subtype-specific payloads and embedded ordinals

---

## Text encoding differences by family

The protocol does not use one universal string encoding.

Observed patterns:

| Family / flow | X1 | X1S/X2 |
|---------------|----|---------|
| Device/activity catalog rows | mostly UTF-8 / ASCII-compatible | commonly UTF-16BE |
| `REQ_COMMANDS` page and single replies (`0x5D`) | ASCII / UTF-8 common | UTF-16BE |
| Activity membership names (`0x6D`) | ASCII / UTF-8 common | commonly UTF-16BE |
| Activity macros (`0x13`) | ASCII common | commonly UTF-16BE |
| WiFi input-refresh reply (`0x020C -> 0xCD0D`) | not observed | UTF-16LE |
| IP-command sync rows (`0x0Dxx`) | not fully characterized | UTF-16LE for observed name fields |

This means clients should choose decoding rules per family and layout, not per
hub version alone.

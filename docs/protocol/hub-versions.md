# Hub Versions

The Sofabaton hub family has three observed hardware generations. The model is
usually exposed in the mDNS TXT record `HVER`. The hub firmware version is also
exposed in the mDNS TXT record `AVER`.

---

## Version identification

| `HVER` | Model |
|--------|-------|
| `1` | X1 |
| `2` | X1S |
| `3` | X2 |

Observed `AVER` values:

| Model | Example `AVER` | Meaning |
|-------|----------------|---------|
| X1 | `17` | Hub firmware version `17` |
| X1S | `5` | Hub firmware version `5` |
| X2 | `8` | Hub firmware version `8` |

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

## Banner / version block differences

The same core version block appears in:

- UDP `NOTIFY_ME` discovery replies
- TCP family-`0x02` banner replies after `REQ_BANNER (0x0001)`

Stable field meanings:

| Offset within block | Meaning |
|---------------------|---------|
| byte 0 | leading marker (`0x64` in observed UDP discovery replies, `0x00` or `0x64` in observed TCP banners) |
| byte 1 | model code (`0x01` X1, `0x02` X1S, `0x03` X2) |
| bytes 2-5 | production batch as packed date bytes |
| byte 6 | hub firmware version |
| bytes 7-8 | hub/firmware-dependent flag bytes (e.g. `00 00` on observed X1 banners, `01 00` on observed X1S/X2 banners, but other values such as `01 03` occur). These vary across hub models and revisions and must **not** be used to validate or gate the banner — rely on a recognised model code, the BCD-packed production date, and the frame checksum instead. |

Representative observed blocks:

| Model | Observed block | Interpreted as |
|-------|----------------|----------------|
| X1 | `64 01 20 21 06 09 11 00 00` | model `X1`, batch `20210609`, hub fw `17` |
| X1S | `64 02 20 22 11 20 05 01 00` in UDP discovery, `00 02 20 22 11 20 05 01 00` in TCP banners | model `X1S`, batch `20221120`, hub fw `5` |
| X2 | `64 03 20 22 11 20 08 01 00` in UDP discovery, `00 03 20 22 11 20 08 01 00` in TCP banners | model `X2`, batch `20221120`, hub fw `8` |

---

## NOTIFY_ME reply differences

The UDP discovery reply is structurally shared across all observed hub lines:

- byte `2` is a dynamic length byte, not a family marker
- the length is `6-byte device-id tail + 9-byte version block + UTF-8 name length`
- the final byte is a sum8 checksum of all preceding bytes

The main per-family differences are the device-id tail and the version block contents.

| Field | X1 | X1S | X2 |
|-------|----|-----|----|
| Length byte example | `0x1A` for 11-byte name, `0x2D` for 30-byte name | `0x16` for 7-byte name, `0x2D` for 30-byte name | `0x15` for 6-byte name, `0x2D` for 30-byte name |
| Device-id tail | `MAC[0:5] + 0x4B` | `MAC[0:5] + 0x45` | full `MAC[0:6]` |
| Representative version block | `64 01 20 21 06 09 11 00 00` | `64 02 20 22 11 20 05 01 00` | `64 03 20 22 11 20 08 01 00` |
| Name field behavior | variable UTF-8, observed up to 30 bytes | variable UTF-8, observed from 7 to 30 bytes | variable UTF-8, observed from 6 to 30 bytes |
| Final byte | sum8 checksum in observed reply | sum8 checksum in observed replies | sum8 checksum in observed reply |

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

---

## Per-variant record dimensions

X1S and X2 share the same record layouts across every observed
family; X1 uses narrower fixed slots and ASCII labels.

| Field | X1 | X1S / X2 |
|---|---|---|
| Device record body length (families `0x07` / `0x37`, including trailing checksum) | 120 bytes | 210 bytes |
| Device record name / brand / tail slot width | 30 bytes | 60 bytes |
| Device record label encoding | ASCII | UTF-16BE |
| Command record stride (family `0x0E` assembled records) | 40 bytes | 70 bytes |
| Command record label slot width | 30 bytes | 60 bytes |
| Command record label encoding | ASCII | UTF-16BE |
| Macro label slot width (family `0x12`) | 30 bytes | 60 bytes |
| Macro label encoding | ASCII | UTF-16BE |
| Inputs entry stride (family `0x46`) | 27 bytes | 48 bytes |
| Inputs entry label encoding | ASCII (20-byte slot) | UTF-16BE (40-byte slot) |
| Inputs entry ordinal byte present? | no | yes (1 byte) |
| Inputs trailing region (4 control-key rows + 10 favorite rows + 1 state byte) | 107 bytes | 107 bytes |

The trailing region of the family-`0x46` inputs page is identical
across variants. See [inputs.md](inputs.md) for the full page
layout.

Clients targeting an unknown future firmware lineage should treat
the variant as unknown and refuse to write, rather than defaulting
to either of the layouts above — writes using the wrong stride
produce silently-acked but structurally invalid records.

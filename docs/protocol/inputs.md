# Inputs page (family `0x46`)

Family-`0x46` carries one device's input list (HDMI 1, HDMI 2, "Roku",
etc.) plus four control-key bindings (input list, up, down, confirm)
and ten favorite-slot rows.

This document describes observed wire behavior. Implementation notes
belong in [reference-impl.md](reference-impl.md), not here.

---

## ◇ Page layout

Total page size for a single-page write is

```
3 + 8 + entry_count * entry_stride + 107 + 1
```

bytes. Bodies that exceed the per-page chunk limit are split across
multiple pages; the body header's `total_pages` field counts the
actual number of pages written.

### Outer wrapper (3 bytes)

```
byte 0       page marker (0x01)
byte 1..2    outer page sequence, big-endian (single-page = 1)
```

### Body header (8 bytes)

```
byte 0       body marker (0x01)
byte 1..2    total_pages, big-endian
byte 3       device_id
byte 4       source_id_byte
                0x00 = "no inputs configured"
                0x01 = direct-inputs
                0x02 = "no input switching"
byte 5       entry_count (= number of entry rows)
byte 6       flag_a (start position; observed 0)
byte 7       flag_b (restart position; observed 0)
```

### Entry region

`entry_count` rows of variant-specific stride.

#### X1 — 27 bytes per row

```
byte 0       key_id              (1-byte command id)
byte 1..6    fid                 (6-byte big-endian opaque id)
byte 7..26   label               (20 bytes, ASCII, null-padded)
```

#### X1S / X2 — 48 bytes per row

```
byte 0       key_id              (1-byte command id)
byte 1..6    fid                 (6-byte big-endian opaque id)
byte 7       ordinal             (1-based position; redundant with
                                  the row index but emitted on the wire)
byte 8..47   label               (40 bytes, UTF-16BE, null-padded)
```

The `fid` is opaque at this layer; consumers that need to correlate
it with command records do so via the catalog or command-list family.

### Trailing region (107 bytes total)

Identical across all observed hub variants:

```
4 control-key rows   = 4 * 9 bytes = 36
10 favorite rows     = 10 * 7 bytes = 70
1 state byte         = 1
```

Control-key rows appear in this order: `input_list`, `input_up`,
`input_down`, `input_confirm`. Each is an opaque 9-byte binding
descriptor; unbound slots are zero-padded.

Favorite-slot rows are 7 bytes each. The structured field layout
inside one row is treated as opaque at this layer; real captures
carry favorite metadata in this region but its internal structure
has not been fully characterized.

### Body checksum (1 byte)

```
checksum = sum(body[:-1]) & 0xFF
```

`body` here is the body header through the state byte. The outer
wrapper is excluded from the checksum.

---

## ◇ Empty-page shape

A write that means "no inputs configured for this device" uses
`source_id_byte = 0x00`, `entry_count = 0`, an empty entry region,
and the standard 107-byte trailing region of zeros. This shape is
also observed as a "sync stage" payload during WiFi/IP device
creation.

---

## ◇ Acks

Inputs-page writes are acknowledged via the generic `STATUS_ACK`
family (`0x0103`). See [ack-handling.md](ack-handling.md) for the
reject-byte semantic.

The `REQ_ACTIVITY_INPUTS` (`0x0148`) burst is a separate read flow;
its per-variant response layout is summarised in
[hub-versions.md](hub-versions.md) and the row shapes are documented
in [data-structures.md](data-structures.md).

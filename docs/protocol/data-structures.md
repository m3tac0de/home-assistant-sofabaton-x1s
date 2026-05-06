# Data Structures

This document describes recurring wire-level data structures observed in the
protocol. It intentionally avoids implementation-specific parser details.

---

## Entity ID space

The hub uses a shared 8-bit namespace for devices and activities.

| Range | Meaning | Notes |
|-------|---------|-------|
| `0x01` - `0x63` | Device ids | Physical or virtual devices |
| `0x65` - `0xFF` | Activity ids | Activity index is often `id - 100` in UI code, but the wire protocol uses the raw low byte |

When a 16-bit entity reference appears in a request, the low byte is the
meaningful identifier.

Example:

```
REQ_ACTIVATE payload = [entity_lo, key_code]
```

---

## Catalog rows

### Device catalog row (`0xD50B` / `0x7B0B`)

One frame corresponds to one device.

Observed stable fields:
- `payload[0]` = 1-based row index
- `payload[3]` = total device rows in the burst
- `payload[6:8]` = device id
- some captures also repeat the row index / total near `payload[9:11]`
- X1S/X2 text regions are commonly UTF-16BE
- X1 text regions are commonly UTF-8 or ASCII-compatible

The exact meaning of several surrounding control bytes is still incomplete, but
the rows behave as fixed-position records rather than short TLV structures.
In observed X1 and X1S/X2 traffic, the burst can be treated as complete once
all row indexes `1..payload[3]` have been received.

### Activity catalog row (`0xD53B` / `0x7B3B`)

One frame corresponds to one activity.

Observed stable fields:
- `payload[6:8]` = activity id
- a status byte is often present around offset `35`
- X1S/X2 labels are commonly UTF-16BE
- X1 labels are commonly UTF-8 or ASCII-compatible

---

## Command list records (`REQ_COMMANDS`, family `0x5D`)

Command-list bursts return one or more command records per page. The exact page
layout varies by hub line, but the repeated command unit has a consistent shape.
The burst should be treated as a paged byte stream: page boundaries are not
guaranteed to align to command-record boundaries.

### Repeated command unit

```
byte 0      device id
byte 1      command id
byte 2..8   control block
byte 9..    label region
```

Observed control-block behavior:
- IR/RF devices use non-zero control bytes that identify protocol-specific command
  data
- virtual/IP devices often use mostly-zero control blocks
- format markers observed in this family include `0x03`, `0x0D`, `0x1A`, and `0x1C`
- `0x0A` and `0x20` are also observed as command-format markers on some devices

### Label encodings

There is no single global string encoding across the protocol.

Observed command-label encodings:
- X1S/X2 `0x5D` page and single-command labels: UTF-16BE
- X1 labels: ASCII/UTF-8 are common
- some labels can legitimately contain raw byte `0xFF` as part of UTF-16BE text
  (for example `U+00FF`), so consumers must not split records on bare `0xFF`
  unless a full record separator pattern is present

Observed separator behavior:
- many X1S/X2 bursts use `0xFF` before follow-on records
- some X1 bursts do not use `0xFF` separators at all
- absence of `0xFF` does not imply that the page contains only one command
- some X1 single-page bursts pack multiple ASCII command records back-to-back
  with no explicit separator bytes

### Paging behavior

Observed paging behavior:
- command records may span page boundaries
- non-header pages should be treated primarily as continuations of the current
  command burst, not as self-contained command lists
- record decoding is safest after concatenating the page bodies for the burst

Observed X1 packed-record behavior:
- some one-page X1 command bursts are a contiguous ASCII record stream
- those records are structurally delimited by repeated
  `[dev_id, command_id, fmt, 0x00, 0x00, 0x00, 0x00, ...]` starts rather than
  by `0xFF`
- the amount of zero padding inside the record can vary slightly, so consumers
  should not assume a fixed record width even when the page has no `0xFF`
  separators

Observed single-page X1 header quirk:
- some one-page X1 header bursts begin with the same early prefix as targeted
  single-command replies: `01 00 01 01 00 01`
- the distinguishing byte is the next one:
  - targeted single-command reply: `payload[6] == 0x01`
  - one-page X1 command header: `payload[6] == total_command_count`, which can
    be greater than `1`
- consumers should not classify a frame as a targeted single-command response
  from the shared prefix alone

### Input-config refresh labels (`0x020C -> 0xCD0D`)

The `0xCD0D` reply is not a normal command-list page, but it also carries a
single label for a `(device, slot)` pair.

Observed payload layout:

```
payload[0:6]   = 01 00 01 01 00 01
payload[6]     = device id
payload[7]     = input slot / command slot
payload[8]     = format marker
payload[16:76] = fixed-width label region, UTF-16LE
payload[76:]   = device-specific metadata, observed as IP/port + HTTP template
```

This response is used as a readback/confirmation step after WiFi input
configuration changes.

---

## Activity keymap and favorite rows (`REQ_BUTTONS`, family `0x3D`)

`REQ_BUTTONS` yields a stream of fixed 18-byte rows.

Observed semantics:
- leading rows describe activity favorite slots
- later rows identify which hardcoded remote buttons are enabled for the activity

This family is authoritative for:
- enabled buttons in an activity
- favorite slot references

This family is not a reliable source for:
- the true target of ordinary hard-button bindings
- long-press metadata for ordinary hard buttons

### Generic 18-byte row

```
byte 0   activity id
byte 1   row id:
         - favorite slot id, or
         - hardcoded remote button code
byte 2   device id or row-specific subtype value
byte 3..8   row-specific metadata
byte 9   command id or row-specific value
byte 10..17 row-specific metadata / padding
```

### Paging behavior

Observed paging behavior:
- the family is a paged byte stream of 18-byte rows
- page boundaries are not guaranteed to align to row boundaries
- a non-header page may contain:
  - several complete rows
  - the start of a row that finishes on the next page
  - only the tail bytes of a row that started on the previous page

Observed X1 edge case:
- a final `REQ_BUTTONS` page can be shorter than one full 18-byte row
- in that shape, the page is only a continuation fragment and does not contain a
  trustworthy activity id or total-row count of its own

Client guidance:
- trust burst totals and activity id from the header page
- treat later pages as row-stream continuations first
- do not assume that every non-header page can be parsed independently into
  complete 18-byte rows
- do not treat zero-valued total-frame fields on non-header pages as an
  authoritative new burst total

### Favorite rows

Observed stable fields:
- `byte 0` = activity id
- `byte 1` = hub-internal favorite slot id
- `byte 2` = device id
- `byte 9` = command id

These rows are enough to recover favorite references. Labels must be resolved
through `REQ_COMMANDS`.

### Hard-button rows

Observed stable fields:
- `byte 0` = activity id
- `byte 1` = hardcoded button code such as `0xB0` (`OK`) or `0xB3` (`BACK`)

For ordinary hard buttons, the rest of the row is not sufficient to derive the
full underlying binding target reliably. The safe interpretation is that the
button is enabled in the activity keymap.

### Color-button rows

Color buttons (`RED`, `GREEN`, `YELLOW`, `BLUE`) often use a distinct subtype and
may expose more target-like structure than ordinary hard buttons. They should
still be treated cautiously unless the consuming client specifically needs that
additional detail.

### Activity-local macro button rows

Some rows for hard buttons bound to activity-local macros use a distinct subtype
where the row refers back to the activity rather than to a device command.
These should not be interpreted as normal `(device_id, command_id)` bindings.

---

## Activity membership rows (`REQ_ACTIVITY_MAP`, family `0x6D`)

`REQ_ACTIVITY_MAP` returns one member row per frame.

Observed stable fields:
- `payload[0]` = 1-based member row index
- `payload[3]` = total member rows
- `payload[6:8]` = member device id

Observed row classes:
- IR
- Bluetooth
- Roku/WiFi
- Hue/WiFi
- IP/WiFi
- MQTT-style rows

The text fields and metadata vary by hub line and member type, but the family is
best understood as an activity membership roster rather than a favorites table.

---

## Macro records (`REQ_MACRO_LABELS`, family `0x13`)

Macro replies are multi-fragment bursts. Each fragment that starts a new record
contains enough metadata to identify the activity and macro id.
As with `REQ_COMMANDS`, fragments should be treated as pieces of one assembled
byte stream rather than as independently decodable record pages.

### Fragment header

Observed stable fields in record-start fragments:
- `payload[0]` = fragment index
- `payload[3]` = total fragments
- `payload[6]` = activity id
- `payload[7]` = macro id for the record that starts here

The high byte of the opcode equals the payload length for the observed `0x13`
family variants.

### User-visible macro ids vs built-in macro ids

Observed built-in system macro ids:
- `0xC6` = `POWER_ON`
- `0xC7` = `POWER_OFF`

These are returned in the same burst as user-visible macros and should usually be
treated separately from user-defined macros.

### Label encodings

Observed label encodings:
- X1: ASCII is common
- X1S/X2: UTF-16BE is common

### Empty power-macro variant on X1S

Some X1S `POWER_ON` / `POWER_OFF` records for empty power sequences carry a
leading control byte before the visible UTF-16BE text. Consumers should ignore
leading control characters before deciding whether a label is `POWER_ON` or
`POWER_OFF`.

### Paging behavior

Observed paging behavior:
- one macro record may span multiple fragments
- record starts are identified by fragment metadata, but label decoding is
  safest after concatenating fragment bodies for the burst

---

## Activity input candidate rows (`REQ_ACTIVITY_INPUTS`, family `0x47`)

The request opcode is the same across observed hub lines (`0x0148`), but the
response layout differs.

### X1

Observed X1 entries are fixed-size rows carrying:
- a slot id
- a command id
- a label

### X1S/X2

Observed X1S/X2 responses use subtype-specific page layouts. The important
client-visible fields are:
- slot id
- ordinal within the activity-input list
- label

For X1S/X2, the ordinal is transmitted directly and should be used instead of
deriving order by record position alone.

---

## IP-command synchronization rows (family `0x0D`)

The `REQ_IPCMD_SYNC` reply uses multiple row opcodes in family `0x0D`.

Observed row types:
- `0x0DD3`
- `0x0DAC`
- `0x0D9B`
- `0x0DAE`

These rows collectively describe one HTTP-backed command.

Observed content includes:
- command/button name
- HTTP method
- destination address or host metadata
- URL/path fragments
- body or request-template bytes

Observed text encoding for the name fields in this family:
- UTF-16LE

---

## Favorite ordering response (family `0x63`)

Observed payload shape:

```
01 00 01 01 00 01 [act_lo] [favorite_id slot]...
```

Each trailing pair assigns one hub-internal favorite identifier to one display
slot.

---

## WiFi/IP command definition payload (`0x0ED3`)

Observed payload structure:

```
UTF-16LE fixed-width label block
method_len    (1 byte)
method        (ASCII)
url_len       (1 byte)
url           (ASCII)
headers_len   (1 byte)
headers       (ASCII)
body          (remaining bytes)
```

This is the structure used to define one HTTP-backed command on the hub.

---

## Button code table

Known hardcoded remote button codes:

| Hex | Decimal | Name |
|-----|---------|------|
| `0x97` | 151 | `C` |
| `0x98` | 152 | `B` |
| `0x99` | 153 | `A` |
| `0x9A` | 154 | `EXIT` |
| `0x9B` | 155 | `DVR` |
| `0x9C` | 156 | `PLAY` |
| `0x9D` | 157 | `GUIDE` |
| `0xAE` | 174 | `UP` |
| `0xAF` | 175 | `LEFT` |
| `0xB0` | 176 | `OK` |
| `0xB1` | 177 | `RIGHT` |
| `0xB2` | 178 | `DOWN` |
| `0xB3` | 179 | `BACK` |
| `0xB4` | 180 | `HOME` |
| `0xB5` | 181 | `MENU` |
| `0xB6` | 182 | `VOL_UP` |
| `0xB7` | 183 | `CH_UP` |
| `0xB8` | 184 | `MUTE` |
| `0xB9` | 185 | `VOL_DOWN` |
| `0xBA` | 186 | `CH_DOWN` |
| `0xBB` | 187 | `REW` |
| `0xBC` | 188 | `PAUSE` |
| `0xBD` | 189 | `FWD` |
| `0xBE` | 190 | `RED` |
| `0xBF` | 191 | `GREEN` |
| `0xC0` | 192 | `YELLOW` |
| `0xC1` | 193 | `BLUE` |
| `0xC6` | 198 | `POWER_ON` |
| `0xC7` | 199 | `POWER_OFF` |

Observed note:
- `0x97` - `0x9D` appear only on X2 remote layouts
- `0xAE` - `0xC7` are shared across X1, X1S, and X2

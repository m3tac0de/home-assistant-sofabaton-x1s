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
- `payload[10]` = observed device-class / device-type code
- some captures also repeat the row index / total near `payload[9:11]`
- X1S/X2 text regions are commonly UTF-16BE
- X1 text regions are commonly UTF-8 or ASCII-compatible

Observed device-class codes:

| Code | Normalized class | Notes |
|------|------------------|-------|
| `0x03` | `bluetooth` | Bluetooth device rows |
| `0x0A` | `wifi_roku` | Roku / WiFi rows |
| `0x0D` | `ir` | Learned or catalog IR devices |
| `0x1A` | `wifi_hue` | Hue / WiFi rows |
| `0x1C` | `wifi_ip` | Virtual IP / HTTP rows |
| `0x20` | `wifi_mqtt` | MQTT-style rows |

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

Command-list bursts should be treated as one assembled command-record stream per
request. Page boundaries are transport artifacts and are not guaranteed to align
to record boundaries.

Observed assembled-record layouts:

| Hub line | Record size | Label slot |
|----------|-------------|------------|
| X1 | 40 bytes | `record[9:39]`, ASCII / UTF-8-compatible |
| X1S/X2 | 70 bytes | `record[9:69]`, UTF-16BE |

Observed assembled-body behavior:
- the page-1 header carries the command count for the burst
- after page-local headers are stripped, the assembled body begins directly with
  the first record byte
- record decoding is safest after concatenating the page bodies for the burst
- raw `0xFF` bytes can appear inside label data or at record tails, so page-local
  delimiter scanning is not a safe primary parser strategy

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
- on strict fixed-width X1 captures, byte `39` is commonly `0xFF`

### Label encodings

There is no single global string encoding across the protocol.

Observed command-label encodings:
- X1S/X2 `0x5D` page and single-command labels: UTF-16BE
- X1 labels: ASCII/UTF-8 are common
- some labels can legitimately contain raw byte `0xFF` as part of UTF-16BE text
  (for example `U+00FF`), so consumers must not split records on bare `0xFF`
  unless a full record separator pattern is present

### Paging behavior

Observed paging behavior:
- command records may span page boundaries
- non-header pages should be treated primarily as continuations of the current
  command burst, not as self-contained command lists
- after assembly, observed real-wire bursts can be decoded as fixed-width records
  using the hub-family-specific stride above

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

### Assembled record layout

Observed assembled macro regions have this structure:

```
byte 0        macro id
byte 1        key-entry count
byte 2..      repeated 10-byte key entries
...           trailing fixed-width label slot
last byte     trailing terminator / checksum-like byte
```

Observed key-entry layout:

```
byte 0        device id
byte 1        key id
byte 2..7     opaque 6-byte control / fid block
byte 8        duration
byte 9        delay
```

Observed label-slot sizes:
- X1: 30 trailing bytes before the final terminator
- X1S/X2: 60 trailing bytes before the final terminator

Client guidance:
- decode the label from the trailing fixed-width slot, not from the first
  printable bytes encountered in the region
- if the declared key-entry count would overlap the trailing label slot, clamp
  to the entries that fit inside the region

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

## IR command dump pages (`REQ_BLOB`, families `0x0D` / `0x0E`)

`REQ_BLOB` (`0x020C`) is reused for two distinct flows:
- WiFi/input-config label refresh for one `(device, slot)` pair
- multi-page command/blob dump retrieval for one command or a full device
  snapshot

This section covers the blob-dump variant.

### Request shapes

Observed request payloads:
- `[dev_lo, cmd_lo]` = dump one command/blob record
- `[dev_lo, 0xFF]` = dump all command/blob records for the device

### Common page fields

Observed dump pages in families `0x0D` and `0x0E` share:

```
payload[0] = response index
payload[2] = page number
```

Observed behavior:
- `response index` identifies one record within the snapshot returned by the
  request
- `page number` is 1-based within that record
- later pages do not repeat the actual command id, so consumers must map the
  response index from continuation pages back to the page-1 metadata for the
  same record

### Page-1 metadata layout

Observed stable fields on page 1:

```
payload[0]    = response index
payload[2]    = page number (= 1)
payload[3]    = total commands in the device snapshot
payload[5]    = total pages for this one command/blob record
payload[6]    = device id
payload[7]    = command id
payload[8]    = format marker / device-class-like marker
payload[13:15] = 2-byte label-side metadata field
payload[15:]  = fixed-width label slot followed by the first blob slice
```

Observed label encodings:
- X1 page 1 uses a compact ASCII/Latin-1 label slot
- X1S/X2 page 1 uses a wider UTF-16BE label slot

Observed page-1 blob starts:
- X1: first blob byte at offset `43`
- X1S/X2: first blob byte typically at offset `73`

Observed X1S/X2 page-1 blob prefixes at the blob start include:
- `01 20 00 10`
- `01 30 00 10`
- `03 20 00 00`
- `01 00 00 00`

These prefixes are part of the dumped blob body, not separate transport
metadata.

### Continuation pages

Observed continuation/final dump pages use:

```
payload[0] = response index
payload[1] = 0x00
payload[2] = page number (2..N)
payload[3:] = continuation blob slice
```

Observed behavior:
- continuation pages do not carry label text
- continuation pages do not repeat total-command or total-page metadata
- the page payload after byte `2` should be concatenated directly onto the
  page-1 blob bytes for the same response index

### Assembly guidance

Observed assembly rules:
- `payload[3]` on page 1 is the device snapshot's total command count, not this
  record's page count
- `payload[5]` on page 1 is the expected page count for this one record
- the assembled blob for a command is the concatenation of:
  - page 1 blob bytes starting at the family-specific page-1 blob start
  - each later page's `payload[3:]` in page-number order
- a full-device snapshot is complete only when all observed response indexes
  have been matched to page-1 metadata and each record has received its full
  page count

---

## Favorite ordering response (family `0x63`)

Observed payload shape:

```
01 00 01 01 00 01 [act_lo] [favorite_id slot]...
```

Each trailing pair assigns one hub-internal favorite identifier to one display
slot.

---

## IR blob save pages (family `0x0E`, `A->H`)

Observed app-originated blob-save uploads use family `0x0E` pages whose payload
shape mirrors the dump flow but carries a save-specific trailing checksum.

### Page-1 save layout

Observed page-1 save payload:

```
payload[0:15] = 01 00 01 01 00 total_pages dev_lo 00 0D 00 00 00 00 00 00
payload[15:]  = fixed-width label slot followed by the first blob slice
```

Observed label slots:
- X1: bytes `15..42` hold a 28-byte ASCII/Latin-1 command label
- X1S/X2: bytes `15..72` hold a 58-byte UTF-16BE command label

### Continuation save pages

Observed continuation/final save pages use:

```
payload[0:3] = 01 00 page_no
payload[3:]  = continuation blob slice
```

### Save-specific trailing checksum

Before paging, the saved blob body carries one additional trailing byte that is
distinct from the replay-tail checksum used by family `0x0F` playback:

```
persist_tail = (sum8(page_one_prefix) + sum8(label_slot) + sum8(blob_body) - 2) & 0xFF
```

Observed behavior:
- the persisted bytes are `blob_body + persist_tail`
- `total_pages` counts the page-1 payload and all continuation pages needed to
  carry that persisted byte stream
- page acknowledgments are observed through `0x0103`, with `payload[0] == 0x00`
  for accept and `payload[0] == 0x0C` for reject

---

## IR blob replay bodies (family `0x0F`)

The app's "Test" flow replays raw IR blobs through family `0x0F` frames. These
blobs are not self-describing rows like `REQ_COMMANDS` or `REQ_BUTTONS`; they
are opaque byte bodies that the hub consumes as one-shot replay data.

### Replay frame layout

Observed replay payload structure:

- first page of a replay burst:

```
payload[0:3]   = 01 00 seq
payload[3:13]  = 01 00 total_frames 00 00 00 00 00 00 00
payload[13:]   = first blob slice
```

- continuation/final replay page:

```
payload[0:3]   = 01 00 seq
payload[3:]    = continuation blob slice
```

Observed behavior:
- `seq` is 1-based
- `total_frames` is present only on the first page
- the opcode high byte equals the payload length for that page
- page boundaries are transport artifacts; the replay source is the assembled
  blob body

### Declared-length header in dumped blobs

Many dumped replay blobs begin with a small blob-local header. Two observed
families are:

```
00 00 <declared_len_be16> 00 00 00 00 94 cf ...
00 00 <declared_len_be16> 00 00 00 00 9c 40 ...
00 00 <declared_len_be16> 00 00 00 00 94 74 ...
```

Observed behavior:
- the first four bytes are commonly `00 00 <len_hi> <len_lo>`
- for those blobs, the declared body length often excludes the final trailing
  checksum/tail byte
- the blob body itself is replayed across one or more family-`0x0F` pages

### Two broad blob classes

Current captures support a useful first split:

1. Descriptive blobs
2. Captured/database blobs

#### Descriptive blobs

These embed a human-readable ASCII protocol description inside the blob body.
Observed examples include:

```text
P:DenonK R:37000 C0:84 C1:50 C2:0 D:4 S:1 F:5 CHECKSUM:17
P:Sony12 R:40000 D:1 F:18 MUL:2
P:NEC R:38400 D:0 S:206 F:11
```

Observed behavior:
- the blob begins with a compact descriptor-style header such as:

```
00 00 <declared_len_be16> 00 00 11 00 94 70 ...
```

- the ASCII text begins with `P:` and then carries protocol-specific fields
- different descriptive protocols expose different field sets
- `CHECKSUM:` is **not** what makes a blob descriptive; it is just one field
  used by some descriptor families such as `DenonK`

#### Captured/database blobs

These are opaque binary replay bodies rather than self-describing ASCII
protocol records.

Observed examples include:

```
00 00 <declared_len_be16> 00 00 00 00 94 cf ...
00 00 <declared_len_be16> 00 00 00 00 9c 40 ...
00 00 <declared_len_be16> 00 00 00 00 94 74 ...
```

Observed behavior:
- these commonly contain pulse/codeset data rather than text
- they may be one-frame or multi-frame replays
- page boundaries are transport artifacts; the replay source is still the
  assembled blob body

### Trailing-byte normalization

Observed `dump_ir_blob` / replay behavior is not uniform across all blob
families. Some dumped blobs replay successfully as-is, while others require the
final blob byte to be rewritten before the hub accepts playback.

Validated observed replay-tail rule so far:

1. `DenonK`-style descriptive blobs containing embedded `CHECKSUM:` text
2. Non-descriptor X1/X1S database-style blobs with headers such as `9c40`,
   `94cf`, or `9474`

```
tail = (sum8(blob[:-1]) + total_frames + 1) & 0xFF
```

Where:
- `sum8(blob[:-1])` is the 8-bit sum of every blob byte except the final tail
  byte
- `total_frames` is the number of family-`0x0F` pages required to replay the
  blob

Observed on:
- long multi-frame X1 command blobs
- short single-frame database-style blobs

Examples validated from captures:
- 4-frame replay blobs: `sum8 + 5`
- 3-frame replay blobs: `sum8 + 4`
- 1-frame replay blobs: `sum8 + 2`

Important scope note:
- not every descriptive protocol has been validated yet
- descriptive families such as `Sony12` and `NEC` are observed, but their
  replay-tail rewrite behavior should not be assumed without matching replay
  captures

Client guidance:
- do not assume the trailing byte returned by a blob-dump flow is always the
  replay-ready value
- if a blob family matches one of the validated classes above, normalize the
  final byte before replay
- if the hub returns `0x0103/0x0C`, treat the replay frame as rejected

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

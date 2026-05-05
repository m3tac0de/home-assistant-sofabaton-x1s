# Opcodes

All opcodes are 16-bit values, big-endian in the frame. The low byte is the
opcode family: opcodes that share a low byte belong to the same semantic group.

Direction:
- `A->H` = client/app to hub
- `H->A` = hub to client/app
- `<->` = observed in both directions

This document describes observed wire behavior. Implementation notes belong in
`reference-impl.md`, not here.

---

## A->H requests

| Opcode   | Name | Payload shape | Hub versions | Purpose |
|----------|------|---------------|--------------|---------|
| `0x000A` | `REQ_DEVICES` | none observed | All | Request device catalog |
| `0x003A` | `REQ_ACTIVITIES` | none observed | All | Request activity catalog |
| `0x023C` | `REQ_BUTTONS` | `[act_lo, 0xFF]` | All | Request activity keymap and favorite rows |
| `0x025C` | `REQ_COMMANDS` | `[dev_lo, 0xFF]` or `[dev_lo, cmd_lo]` | All | Request full command list or one command label |
| `0x023F` | `REQ_ACTIVATE` | `[entity_lo, key_code]` | All | Activate an activity or send a device command |
| `0x016C` | `REQ_ACTIVITY_MAP` | `[act_lo]` | All observed | Request activity membership roster |
| `0x024D` | `REQ_MACRO_LABELS` | `[act_lo, 0xFF]` or `[act_lo, macro_id]` | All observed | Request activity macro labels or one macro payload |
| `0x0148` | `REQ_ACTIVITY_INPUTS` | `[dev_lo]` | All observed | Request input candidates for one device |
| `0x0162` | `FAV_ORDER_REQ` | `[act_lo]` | All observed | Request current favorite ordering |
| `0x0210` | `FAV_DELETE` | activity/favorite ids | All observed | Delete one favorite |
| `0x0109` | `DELETE_DEVICE` | `[dev_lo]` | All observed | Delete one device |
| `0x0058` | `REQ_VERSION` | none observed | All observed | Request firmware/version banners |
| `0x0140` | `PING2` | none observed | All observed | Keepalive probe |
| `0x024F` | `ACTIVITY_DEVICE_CONFIRM` | `[dev_lo, include_flag]` | All observed | Confirm device membership during activity assignment |
| `0x0265` | `ACTIVITY_ASSIGN_COMMIT` | variable | X1S, X2 observed | Post-save commit marker in some activity/device flows |
| `0x0023` | `FIND_REMOTE` | none observed | X1, X1S | Trigger remote buzzer |
| `0x0323` | `FIND_REMOTE_X2` | `[0x00, 0x00, 0x08]` | X2 observed | Trigger remote buzzer |
| `0x0064` | `REMOTE_SYNC` | none observed | X1, X1S | Force remote/hub sync |
| `0x012E` | `X2_REMOTE_LIST` | `[0x00]` | X2 observed | Request connected remote list |
| `0x0464` | `X2_REMOTE_SYNC` | `[remote_id:3][0x01]` | X2 observed | Force sync for one remote |

### WiFi/IP device provisioning and refresh

| Opcode   | Name | Payload shape | Purpose |
|----------|------|---------------|---------|
| `0x07D5` | `CREATE_DEVICE_HEAD` | UTF-16LE name block | Begin virtual WiFi/IP device creation |
| `0x0ED3` | `DEFINE_IP_CMD` | variable | Define one HTTP-backed command |
| `0x0EAE` | `DEFINE_IP_CMD_EXISTING` | variable | Add one HTTP-backed command to an existing device |
| `0x4102` | `PREPARE_SAVE` | variable | Begin save transaction |
| `0x4677` | `FINALIZE_DEVICE` | variable | Complete WiFi/IP device creation |
| `0x6501` | `SAVE_COMMIT` | variable | Commit save transaction |
| `0x0C02` | `REQ_IPCMD_SYNC` | none observed | Request synced IP-command metadata rows |
| `0x020C` | `REQ_INPUT_CONFIG_LABEL` | `[dev_lo, slot_lo]` | Refresh one WiFi/input-config label after input configuration changes |

### Activity assignment

| Opcode   | Name | Payload shape | Hub versions | Purpose |
|----------|------|---------------|--------------|---------|
| `0x7B38` | `ACTIVITY_CONFIRM` | variable | X1 | Save affected activity after a membership change |
| `0xD538` | `ACTIVITY_ASSIGN_FINALIZE` | variable | X1S, X2 | Save affected activity after a membership change |

### Favorites write flow

| Opcode / family | Name | Direction | Purpose |
|-----------------|------|-----------|---------|
| family `0x61` | `SET_FAVORITES_ORDER` | `A->H` | Write favorite ordering |
| family `0x63` | `FAV_ORDER_RESP` | `H->A` | Current `(favorite_id, slot)` ordering |
| family `0x65` | `FAV_COMMIT` | `A->H` | Commit reorder/delete |

---

## H->A responses

### Catalog rows

| Opcode   | Name | Notes |
|----------|------|-------|
| `0xD50B` | `CATALOG_ROW_DEVICE` | One device per frame on X1S/X2 |
| `0x7B0B` | `X1_DEVICE` | One device per frame on X1 |
| `0xD53B` | `CATALOG_ROW_ACTIVITY` | One activity per frame on X1S/X2 |
| `0x7B3B` | `X1_ACTIVITY` | One activity per frame on X1 |

### Command list and single-command responses (family `0x5D`)

Observed `REQ_COMMANDS` responses use family `0x5D` on all hub lines. The high
byte varies by payload size and device class, so clients should not key on a
fixed list of full opcodes. The stable protocol concepts are:

| Role | Notes | Representative examples |
|------|-------|-------------------------|
| Header page | Starts a multi-page command burst and carries burst totals | `0xD95D` on X1S/X2, `0xF75D` on X1 |
| Body page | Carries one or more command records | `0xD55D` on X1S/X2, `0xF35D` on X1 |
| Final data page | Last data-bearing page of the burst | `0x495D`, `0x8F5D` on X1S/X2; several high-byte variants on X1 |
| Single-command response | Targeted reply for `[dev_lo, cmd_lo]` requests | `0x4D5D` |

For X1, multiple full opcodes have been observed for page/final roles. They are
best treated as payload-layout variants within family `0x5D`, not as separate
protocol concepts.

#### Standard single-command layout (`0x4D5D`)

Observed on X1S/X2, and also on some X1 traffic.

```
payload[0:6]  = 01 00 01 01 00 01
payload[6]    = frame-local constant / page marker
payload[7]    = device id
payload[8]    = command id
payload[9]    = format marker
payload[16:]  = fixed-width label region
```

Notes:
- On X1S/X2, labels in this layout are observed as UTF-16BE.
- Targeted requests of the form `[dev_lo, cmd_lo]` return this layout.

#### WiFi input-config refresh layout (`0xCD0D` and related family `0x0D`)

This is not a normal command-list response. It is the reply to
`REQ_INPUT_CONFIG_LABEL` (`0x020C`).

```
payload[0:6]  = 01 00 01 01 00 01
payload[6]    = device id
payload[7]    = input slot / command slot
payload[8]    = format marker
payload[16:76] = fixed-width label region
payload[76:]   = device-specific metadata (observed IP/port + HTTP request template)
```

Notes:
- Labels in this layout are observed as UTF-16LE.
- This reply is useful as a confirmation/readback step after changing WiFi input
  configuration.

#### Multi-frame header/page structure

Observed roles:
- `header` = first frame of a multi-page burst
- `page` = intermediate data page
- `final` = last data-bearing page
- `single` = targeted one-command response

Observed header layouts:

| Hub line | Detection | Device id | Total pages | Total commands | Row data starts |
|----------|-----------|-----------|-------------|----------------|-----------------|
| X1S/X2 standard | frame 1, `payload[4] == 0x00` | `payload[7]` | `payload[4:6]` big-endian | `payload[6]` | `payload[7:]` |
| X1 classic | frame 1, same field arrangement as X1S/X2 | `payload[7]` | `payload[4:6]` big-endian | `payload[6]` | `payload[7:]` |
| X1 WiFi/Hue | frame 1, `payload[4] != 0x00` | `payload[6]` | `payload[4]` | `payload[5]` | `payload[6:]` |

Observed X1 continuation-page variants:
- standard page form: `payload[3] = device id`, `payload[4] = first command id`
- duplicated-device form: `payload[3] = payload[4] = device id`, then command
  tuple starts at `payload[5]`

### Activity keymap / favorite rows (family `0x3D`)

Observed `REQ_BUTTONS` responses use family `0x3D`. As with `0x5D`, the high
byte varies and should not be treated as the protocol abstraction. The stable
roles are:

| Role | Notes | Representative examples |
|------|-------|-------------------------|
| Header page | Starts the burst and carries total-row metadata | `0xFA3D` on X1S/X2; `0x733D` on some X1 single-page bursts |
| Data page | Carries 18-byte keymap/favorite rows | `0x543D` on X1S/X2; multiple high-byte variants on X1 |
| Final data page | Last row-bearing page in the burst | `0x233D` on X1S/X2; several high-byte variants on X1 |
| Marker page | Segment boundary with no row data | `0x0C3D` |

Several additional full opcodes have been observed in this family, especially on
X1. They are best treated as high-byte variants of the same row-bearing roles.

Observed semantics:
- the burst yields a stream of fixed 18-byte rows
- the leading rows describe activity favorite slots
- later rows identify which hardcoded remote buttons are enabled in the activity
- this family is reliable for:
  - enabled buttons in the activity keymap
  - favorite slot references
- this family is not a reliable source for:
  - the true underlying target of ordinary hard-button bindings
  - long-press metadata for ordinary hard buttons

Observed paging behavior:
- page boundaries do not necessarily align to 18-byte row boundaries
- a final page may contain only the tail bytes needed to complete a row that
  started on the previous page
- later pages may omit trustworthy local burst metadata even though they still
  carry row-stream bytes

Client guidance:
- derive burst totals and activity id from the header when available
- concatenate row bytes across pages before assuming row boundaries
- treat very short non-header pages as continuation fragments, not as fresh
  self-contained row pages

### Activity membership roster (family `0x6D`)

| Opcode   | Name | Hub versions | Notes |
|----------|------|--------------|-------|
| `0x7B6D` | `ACTIVITY_MAP_PAGE` | X1 | One member row per frame |
| `0xD56D` | `ACTIVITY_MAP_PAGE_X1S_X2` | X1S, X2 | One member row per frame |

Observed semantics:
- `REQ_ACTIVITY_MAP` returns the devices/endpoints that belong to an activity
- one frame corresponds to one activity member
- `payload[0]` = 1-based member row index
- `payload[3]` = total member rows
- `payload[6:8]` = member device id

Observed row classes include:
- IR
- Bluetooth
- Roku/WiFi
- Hue/WiFi
- IP/WiFi
- MQTT-style rows

### Macro labels and payloads (family `0x13`)

Observed `REQ_MACRO_LABELS` replies use family `0x13`. The high byte tracks the
payload length, so full opcodes such as `0x6E13`, `0x5A13`, `0x8213`, and
`0x6413` are examples rather than separate semantic message types.

Observed semantics:
- `REQ_MACRO_LABELS` returns one burst per activity
- `payload[0]` = fragment index
- `payload[3]` = total fragments
- `payload[6]` = activity id
- `payload[7]` = macro id for the record that starts in this fragment
- the high byte of the opcode matches the payload length

Observed built-in macro ids:
- `0xC6` = `POWER_ON`
- `0xC7` = `POWER_OFF`

Notes:
- X1 user-visible labels are commonly ASCII.
- X1S/X2 user-visible labels are commonly UTF-16BE.
- Bursts return both user-visible macros and built-in power macros.
- Some X1S empty power-macro records place a control byte before the visible
  `POWER_ON` / `POWER_OFF` text. Consumers should ignore leading control bytes
  before deciding whether a label is a built-in power macro.

### Activity inputs (family `0x47`)

| Opcode   | Name | Hub versions | Notes |
|----------|------|--------------|-------|
| `0xFA47` | `ACTIVITY_INPUTS_PAGE_A` | X1S, X2 | First or intermediate page |
| `0xC947` | `ACTIVITY_INPUTS_PAGE_B` | X1S, X2 | Final page |

Observed semantics:
- request opcode is `0x0148` on all observed hub lines
- response layout differs between X1 and X1S/X2
- X1S/X2 uses subtype-specific payloads with embedded input ordinals

### IP command synchronization and input-refresh rows (family `0x0D`)

Observed family `0x0D` traffic includes:
- IP-command sync rows returned after `REQ_IPCMD_SYNC` (`0x0C02`)
- WiFi/input-config label refresh replies returned after `REQ_INPUT_CONFIG_LABEL` (`0x020C`)

Representative examples:
- `0x0DD3`, `0x0DAC`, `0x0D9B`, `0x0DAE` for IP-command sync rows
- `0xCD0D` for a single input-refresh reply

Observed text encoding:
- command/button names in the `0x0Dxx` sync rows are UTF-16LE

### Acknowledgments and informational frames

| Opcode   | Name | Direction | Notes |
|----------|------|-----------|-------|
| `0x0301` | `ACK_SUCCESS` | `H->A` | General acknowledgment |
| `0x0160` | `ACK_READY` | `H->A` | Hub ready for next command |
| `0x0242` | `PING2_ACK` | `H->A` | Keepalive reply on X1S/X2 |
| `0x1D02` | `BANNER` | `H->A` | Hub identity/banner |
| `0x0359` | `WIFI_FW` | `H->A` | WiFi firmware string |
| `0x112F` | `INFO_BANNER` | `H->A` | Additional version/build data |

---

## Family summary

| Low byte | Family | Examples |
|----------|--------|----------|
| `0x0B` | Device catalog | `0xD50B`, `0x7B0B` |
| `0x3B` | Activity catalog | `0xD53B`, `0x7B3B` |
| `0x13` | Macro fragments | variable high byte; examples include `0x6E13`, `0x5A13` |
| `0x3D` | Activity keymap / favorites | variable high byte; examples include `0xFA3D`, `0x543D`, `0x0C3D` |
| `0x5D` | Command pages and single-command labels | variable high byte; examples include `0xD95D`, `0xD55D`, `0x4D5D` |
| `0x6D` | Activity membership roster | `0x7B6D`, `0xD56D` |
| `0x47` | Activity input candidates | `0xFA47`, `0xC947` |
| `0x0D` | IP-command sync and input-refresh labels | variable high byte; examples include `0x0DD3`, `0x0DAC`, `0xCD0D` |
| `0x63` | Favorite ordering | variable high byte |

---

## Multi-frame burst pattern

Many hub responses are bursts rather than single frames. The most common shape is:

```
header -> one or more data pages -> final data-bearing page
```

Important notes:
- final pages often still contain data
- some families insert marker-only frames between data pages
- the frame number is commonly carried in `payload[2]`
- total page count is family-specific

Not every family uses the same header layout, and not every family exposes an
explicit empty terminator. Burst completion must be determined from the observed
family-specific fields, not from opcode family alone.

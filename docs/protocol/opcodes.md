# Opcodes

All opcodes are 16-bit values, big-endian in the frame. The **low byte** is the
**family** — all opcodes sharing a low byte belong to the same semantic group.

Direction: **A→H** = app/client to hub, **H→A** = hub to app/client, **↔** = both.

---

## A→H requests (client to hub)

| Opcode   | Name                    | Payload shape | Hub versions | Notes |
|----------|-------------------------|---------------|--------------|-------|
| `0x000A` | `REQ_DEVICES`           | (none)        | All          | Yields `CATALOG_ROW_DEVICE` rows |
| `0x003A` | `REQ_ACTIVITIES`        | (none)        | All          | Yields `CATALOG_ROW_ACTIVITY` rows |
| `0x023C` | `REQ_BUTTONS`           | `[act_lo, 0xFF]` | All       | Fetch button↔command keymap for an activity |
| `0x025C` | `REQ_COMMANDS`          | `[ent_lo, 0xFF]` or `[ent_lo, cmd_id]` | All | Full command list or single command |
| `0x023F` | `REQ_ACTIVATE`          | `[id_lo, key_code]` | All     | Activate activity or send command |
| `0x016C` | `REQ_ACTIVITY_MAP`      | `[act_lo]`    | X1           | Request activity membership roster (one member row per device/endpoint) |
| `0x024D` | `REQ_MACRO_LABELS`      | `[act_lo, 0xFF]` or `[act_lo, macro_button]` | All | Fetch macro labels or a specific macro payload |
| `0x0148` | `REQ_ACTIVITY_INPUTS`   | `[device_lo]` | All observed | Request activity input candidates for one device; response layout differs between X1 and X1S/X2 |
| `0x0109` | `DELETE_DEVICE`         | `[dev_lo]`    | All observed | Remove device from hub; follow-up activity confirmation opcode differs by hub version |
| `0x0023` | `FIND_REMOTE`           | (none observed) | X1, X1S    | Trigger remote buzzer |
| `0x0323` | `FIND_REMOTE_X2`        | `[0x00, 0x00, 0x08]` | X2  | Trigger remote buzzer (X2) |
| `0x0064` | `REMOTE_SYNC`           | (none)        | X1, X1S      | Force remote ↔ hub re-sync |
| `0x012E` | `X2_REMOTE_LIST`        | `[0x00]`      | X2           | List connected remotes |
| `0x0464` | `X2_REMOTE_SYNC`        | `[remote_id:3][0x01]` | X2  | Sync a specific remote |
| `0x0058` | `REQ_VERSION`           | (none)        | All          | Hub firmware info (yields WIFI_FW, INFO_BANNER) |
| `0x0140` | `PING2`                 | (none)        | All          | Keepalive probe |
| `0x024F` | `ACTIVITY_DEVICE_CONFIRM` | `[dev_lo, include_flag]` | All | Confirm device in activity assignment |
| `0x0265` | `ACTIVITY_ASSIGN_COMMIT`| (see note)    | X1S, X2      | Post-save commit after activity assignment |
| `0x0162` | `FAV_ORDER_REQ`         | `[act_lo]`    | All          | Request current favorites ordering |
| `0x0210` | `FAV_DELETE`            | (act/fav ids) | All          | Delete a favorite from an activity |

### Wifi Device creation sequence

These opcodes are used in order to create a virtual "Wifi Device" (see [wifi-commands.md](wifi-commands.md)):

| Opcode   | Name                    | Direction | Notes |
|----------|-------------------------|-----------|-------|
| `0x07D5` | `CREATE_DEVICE_HEAD`    | A→H       | UTF-16LE device name in payload |
| `0x0ED3` | `DEFINE_IP_CMD`         | A→H       | HTTP method / URL / headers |
| `0x0EAE` | `DEFINE_IP_CMD_EXISTING`| A→H       | Add IP command to existing device |
| `0x4102` | `PREPARE_SAVE`          | A→H       | Begin device save transaction |
| `0x4677` | `FINALIZE_DEVICE`       | A→H       | Complete device creation |
| `0x6501` | `SAVE_COMMIT`           | A→H       | Finalize transaction |

### IP command synchronization

| Opcode   | Name              | Direction | Notes |
|----------|-------------------|-----------|-------|
| `0x0C02` | `REQ_IPCMD_SYNC`  | A→H       | Request existing IP command definitions |

### Activity assignment (X1S / X2)

| Opcode   | Name                        | Direction | Notes |
|----------|-----------------------------|-----------|-------|
| `0xD538` | `ACTIVITY_ASSIGN_FINALIZE`  | A→H       | Save activity after macro assignment |
| `0x7B38` | `ACTIVITY_CONFIRM`          | A→H       | Confirm activity assignment row (X1) |

### Cross-version workflow notes

- `DELETE_DEVICE` (`0x0109`) is followed by an activity confirmation step when the
  deletion changes an activity:
  - X1 uses `ACTIVITY_CONFIRM` (`0x7B38`)
  - X1S / X2 use `ACTIVITY_ASSIGN_FINALIZE` (`0xD538`)
- `REQ_ACTIVITY_INPUTS` (`0x0148`) is used as the request opcode across all observed
  versions in this repository, but the returned `0x47` payload layout differs between
  X1 and X1S/X2

### Favorites write flow

| Family / Opcode | Name                 | Direction | Notes |
|-----------------|----------------------|-----------|-------|
| family `0x63`   | `FAV_ORDER_RESP`     | H→A       | Current `(fav_id, slot)` ordering, response to `0x0162` |
| family `0x61`   | `SET_FAVORITES_ORDER`| A→H       | Writes a new order list |
| family `0x65`   | `FAV_COMMIT`         | A→H       | Commit step after reorder/delete |

---

## H→A responses (hub to client)

### Catalog rows

| Opcode   | Name                    | Notes |
|----------|-------------------------|-------|
| `0xD50B` | `CATALOG_ROW_DEVICE`    | One device per frame |
| `0xD53B` | `CATALOG_ROW_ACTIVITY`  | One activity per frame |
| `0x7B0B` | `X1_DEVICE`             | Same as CATALOG_ROW_DEVICE but on X1 firmware |
| `0x7B3B` | `X1_ACTIVITY`           | Same as CATALOG_ROW_ACTIVITY but on X1 firmware |

### Device button / command pages (family `0x5D`)

These form a multi-frame `REQ_COMMANDS` burst: header page → one or more data pages → a
data-bearing final page. X1S/X2 and X1 share family `0x5D`, but use different opcode sets
and header layouts.

| Opcode   | Name                    | Notes |
|----------|-------------------------|-------|
| `0xD95D` | `REQ_COMMANDS_HEADER_X1S_X2` | Header page on X1S/X2; payload carries total pages, total commands, and device id |
| `0xD55D` | `REQ_COMMANDS_PAGE_X1S_X2`   | Body page on X1S/X2; typically 3 command entries per full page |
| `0xF75D` | `REQ_COMMANDS_HEADER_X1`     | Header page on X1; observed in both classic and WiFi/Hue header layouts |
| `0xA35D` | `REQ_COMMANDS_FINAL_X1_A35D` | Final data page variant on X1 |
| `0x2F5D` | `REQ_COMMANDS_PAGE_X1_2F5D`  | Observed X1 page variant |
| `0xF35D` | `REQ_COMMANDS_PAGE_X1`       | Main body page on X1; typically 6 command entries per full page |
| `0x7B5D` | `REQ_COMMANDS_PAGE_OR_FINAL_X1_7B5D` | Observed X1 page/final variant |
| `0xCB5D` | `REQ_COMMANDS_FINAL_X1_CB5D` | Final data page variant on X1 |
| `0x535D` | `REQ_COMMANDS_FINAL_X1_535D` | Final data page variant on X1 |
| `0x4D5D` | `REQ_COMMANDS_SINGLE`        | Single-command metadata (targeted REQ_COMMANDS) |
| `0x495D` | `REQ_COMMANDS_FINAL_X1S_X2_495D` | Final data page variant on X1S/X2 |
| `0x8F5D` | `REQ_COMMANDS_FINAL_X1S_X2_8F5D` | Final data page variant on X1S/X2 |

Current parser model (`parse_command_burst_frame()` in `commands.py`):

**Frame roles:**
- `"header"` — frame_no==1 with a recognized total_frames value; sets burst metadata (device_id, total_frames, total_commands)
- `"page"` — continuation frame carrying command records
- `"final"` — final data-bearing page (distinguished by opcode, not by being empty)
- `"single"` — targeted single-command response

**Header layout variants** (standard frames start with `payload[:2] == \x01\x00`):

| `layout_kind` | Detection | `device_id` | `total_frames` | `total_commands` | `data_start` |
|---|---|---|---|---|---|
| `x1s_x2` / `x1_classic` | frame_no==1 AND `payload[4]==0x00` | `payload[7]` | `payload[4:6]` big-endian | `payload[6]` | 7 |
| `x1_wifi` | frame_no==1 AND `payload[4]!=0x00` AND len>8 | `payload[6]` | `payload[4]` (1 byte) | `payload[5]` | 6 |

**Single-command layout:**
- opcode == `0x4D5D` (OP_DEVBTN_SINGLE) OR `payload[:6] == \x01\x00\x01\x01\x00\x01`
- `device_id=payload[7]` (signature-match case), `data_start=7`; total_frames forced to 1

**Page frame variants:**

| `layout_kind` | Detection | `device_id` | `data_start` | Notes |
|---|---|---|---|---|
| `x1_page_dupdev` | `payload[3]==payload[4]` AND `payload[5] in (0x03, 0x0D, 0x1A, 0x1C)` AND `payload[6:10]==\x00*4` | `payload[3]` | 4 | X1 WiFi/Hue variant with duplicated device byte |
| `page` (standard) | all other continuation frames | `payload[3]` | 3 | `first_command_id=payload[4]`, `format_marker=payload[5]` |

Classification is delegated entirely to `parse_command_burst_frame()`; `DeviceCommandAssembler.feed()`
calls it on every frame to determine dev_id, role, and data_start. New high-byte variants with a
`0x5D` low byte are accepted automatically when their payload layout matches a known shape.

### `REQ_BUTTONS` / keymap pages (family `0x3D`)

| Opcode   | Name              | Notes |
|----------|-------------------|-------|
| `0xF13D` | `REQ_BUTTONS_PAGE_A`    | Observed `0x3D` family page variant |
| `0xFA3D` | `REQ_BUTTONS_HEADER_OR_PAGE` | Header / first page, and X1S/X2 continuation in some bursts |
| `0x3D3D` | `REQ_BUTTONS_PAGE_C`    | Observed `0x3D` family page variant |
| `0x1E3D` | `REQ_BUTTONS_PAGE_D`    | Observed `0x3D` family page variant |
| `0xBB3D` | `REQ_BUTTONS_PAGE_E`    | Observed `0x3D` family page variant |
| `0x783D` | `REQ_BUTTONS_PAGE_F`    | Observed `0x3D` family page variant |
| `0xCD3D` | `REQ_BUTTONS_PAGE_G`    | Observed `0x3D` family page variant |
| `0x543D` | `REQ_BUTTONS_PAGE_X1S_X2` | X1S/X2 continuation/data page |
| `0xC03D` | `REQ_BUTTONS_PAGE_X1S_X2_C03D` | X2 continuation/data page |
| `0x233D` | `REQ_BUTTONS_FINAL_X1S_X2_233D` | X1S/X2 short final data page |
| `0x0C3D` | `REQ_BUTTONS_MARKER_X1S_X2` | X1S/X2 marker-only trailing page |
| `0x663D` | `REQ_BUTTONS_PAGE_X1_663D` | X1 continuation/data page |
| `0x733D` | `REQ_BUTTONS_OVERLAY_X1` | X1 single-page overlay-heavy burst |
| `0xAE3D` | `REQ_BUTTONS_PAGE_X1_AE3D` | X1 continuation/data page |
| `0xE43D` | `REQ_BUTTONS_PAGE_X1_E43D` | X1 continuation/data page |
| `0x303D` | `REQ_BUTTONS_PAGE_EXTRA`   | Small follow-up page occasionally appended after the main burst |

Current parser model (`parse_button_burst_frame()` in `commands.py`):

**Frame roles:**
- `"header"` — frame_no==1, total_frames>0, len(payload)>7
  - `activity_id = payload[7]`, `data_start = 7`
  - `layout_kind = "x1_overlay"` for opcode `0x733D` or X1 hub with total_frames==1; `"header"` otherwise
- `"marker"` — opcode `0x0C3D` (OP_MARKER), or when activity_id cannot be extracted from the payload
  - `has_row_data = False`; `layout_kind = "x1s_marker"` or `"marker_like"`
  - X1S/X2 hubs send an `OP_MARKER` frame as a segment boundary before continuation pages
- `"page"` — data-bearing frame where frame_no < total_frames
- `"final"` — data-bearing last frame where frame_no >= total_frames

**Activity ID on non-header frames** (`_extract_button_activity_id()`):
- scans `payload[3:]` for 18-byte row signatures by checking for four zero bytes at `[offset+3:offset+7]`
- prefers rows whose `byte[1]` is in range `0xAE–0xC1` (known ButtonName codes); falls back to `0x01–0x20`

**Data start offsets:**
- header: `data_start=7` (row data begins after `activity_id` byte)
- page / final: `data_start=3`
- marker: `data_start=len(payload)` (no row data)

**Assembly:** `DeviceButtonAssembler` (in `commands.py`) accumulates frames keyed by `activity_id`.
Completed bursts are delivered as `(activity_id, row_stream, total_rows)` tuples and passed to
`ActivityCache.replace_keymap_rows()`, which processes the assembled stream as fixed 18-byte records.

### Activity membership pages

| Opcode   | Name                    | Hub versions | Notes |
|----------|-------------------------|--------------|-------|
| `0x7B6D` | `ACTIVITY_MAP_PAGE`     | X1           | Activity member row on X1 |
| `0xD56D` | `ACTIVITY_MAP_PAGE_X1S` | X1S, X2      | Activity member row on X1S/X2 |

Current parser model:
- `REQ_ACTIVITY_MAP` is treated as an activity membership roster, not a favorites or macros table.
- One frame corresponds to one activity member device/endpoint.
- `payload[0]` = row index (1-based)
- `payload[3]` = total member rows in the roster
- `payload[6:8]` = member device id
- X1 and X1S/X2 share the same semantics but use different row layouts and text encodings.
- Observed row subtypes include IR, Bluetooth, Roku/WiFi, Hue/WiFi, IP/WiFi, and MQTT-style device rows.
- Observed member-row device classes so far:
  - X1: IR, Bluetooth, Roku/WiFi, Hue/WiFi
  - X1S: IR, console/device rows, Roku/WiFi-style, Hue/WiFi
  - X2: IR, IP/WiFi, MQTT-style
- Favorites, keybindings, labels, and macros are resolved through other families:
  - `REQ_BUTTONS` (`0x3D`) for favorite/keybinding references
  - `REQ_COMMANDS` (`0x5D`) for labels
  - `FAV_ORDER_RESP` (`0x63`) for hub ordering
  - macro family (`0x13`) for activity macros

### Macro pages (family `0x13`)

| Opcode   | Name          | Notes |
|----------|---------------|-------|
| `0x6E13` | `MACROS_A1`   | Macro definition page |
| `0x5A13` | `MACROS_B1`   | Macro definition page |
| `0x8213` | `MACROS_A2`   | Macro definition page |
| `0x6413` | `MACROS_B2`   | Macro definition page |

Current parser model (`parse_macro_burst_frame()` in `macros.py`):

**Frame roles:**
- `"record_start"` — detected when `payload[2]==0x01 AND payload[5] in (0x01, 0x02) AND payload[6]!=0x00`
  - `fragment_index = payload[0]` (defaults to 1 if zero)
  - `total_fragments = payload[3]` (range-validated 1–64; `None` if outside range)
  - `activity_id = payload[6]`
  - `start_command_id = payload[7]` (when payload length > 7)
  - `data_start = 7`
- `"continuation"` — all other frames belonging to the family
  - no activity_id or fragment_index derivable from this frame alone
  - `data_start = 7` (or `len(payload)` for short payloads)

**payload_length_matches_hi:** the high byte of any family-`0x13` opcode equals the observed payload
length. This is a per-frame validity signal; no separate length field is present.

**Assembly:** `MacroAssembler` accumulates frames keyed by activity_id derived from `record_start`
frames; continuation frames are appended in sequence. Record boundaries (byte offsets into the
assembled payload) are tracked from each `record_start` frame position and passed to
`decode_macro_records()` for accurate label extraction.

- Bursts return both user-visible macros and built-in power lifecycle macros.
- Observed built-in system macro ids:
  - `0xC6` = `POWER_ON`
  - `0xC7` = `POWER_OFF`
- User-facing macro lists should filter out `POWER_*` labels.
- X1 labels are often ASCII; X1S/X2 labels are often UTF-16LE.

### Remote and input discovery

| Opcode   | Name                      | Hub versions | Notes |
|----------|---------------------------|--------------|-------|
| `0x332F` | `X2_REMOTE_LIST_ROW`      | X2           | One connected remote per frame |
| `0xFA47` | `ACTIVITY_INPUTS_PAGE_A`  | X1S, X2      | Activity input candidates (intermediate) |
| `0xC947` | `ACTIVITY_INPUTS_PAGE_B`  | X1S, X2      | Activity input candidates (final page) |

### IP command synchronization rows

| Opcode   | Name           | Notes |
|----------|----------------|-------|
| `0x0DD3` | `IPCMD_ROW_A`  | IP command row type A |
| `0x0DAC` | `IPCMD_ROW_B`  | IP command row type B |
| `0x0D9B` | `IPCMD_ROW_C`  | IP command row type C |
| `0x0DAE` | `IPCMD_ROW_D`  | IP command row type D |
| `0x8D5D` | `DEVICE_SAVE_HEAD` | Hub assigns device ID during Wifi Device creation |

### Acknowledgments and control

| Opcode   | Name            | Direction | Notes |
|----------|-----------------|-----------|-------|
| `0x0301` | `ACK_SUCCESS`   | H→A       | General acknowledgment of a request |
| `0x0160` | `ACK_READY`     | H→A       | Hub ready for next command |
| `0x0242` | `PING2_ACK`     | H→A       | Keepalive response (X1S, X2) |

### Informational

| Opcode   | Name           | Notes |
|----------|----------------|-------|
| `0x1D02` | `BANNER`       | Hub ident, name, firmware version (pushed on connect) |
| `0x0359` | `WIFI_FW`      | WiFi firmware version string |
| `0x112F` | `INFO_BANNER`  | Vendor tag, batch date, remote fw, etc. |

---

## Bidirectional

| Opcode   | Name       | Notes |
|----------|------------|-------|
| `0x0CC3` | `CALL_ME`  | Used in both directions for UDP discovery (see [connection-flow.md](connection-flow.md)) |

---

## Opcode family table

The **low byte** groups related opcodes:

| Low byte | Family name    | Member opcodes (examples) |
|----------|----------------|---------------------------|
| `0x0B`   | Device rows    | `0xD50B`, `0x7B0B` |
| `0x3B`   | Activity rows  | `0xD53B`, `0x7B3B` |
| `0x13`   | Macro pages    | `0x6E13`, `0x5A13`, `0x8213`, `0x6413` |
| `0x3D`   | `REQ_BUTTONS` pages | `0xF13D`, `0xFA3D`, `0x3D3D`, `0x543D`, `0xC03D`, `0x233D`, `0x0C3D`, `0x303D`, `0x663D`, `0x733D`, `0xAE3D`, `0xE43D` |
| `0x5D`   | Dev-button pages | `0xD95D`, `0xD55D`, `0x495D`, `0x4D5D`, `0x8F5D`, ALT1–7 |
| `0x10`   | Fav delete     | `0x0210` |
| `0x62`   | Fav order req  | `0x0162` |
| `0x63`   | Fav order resp | (variable high byte) |

---

## Multi-frame burst pattern

Hub responses to data requests follow a consistent burst pattern:

```
Hub → Client: HEADER frame (contains total_frames count)
Hub → Client: PAGE frame 1
Hub → Client: PAGE frame 2
    …
Hub → Client: PAGE frame N
Hub → Client: TAIL frame (or MARKER + continuation burst)
```

For X1S/X2, the header frame `0xD95D` uses:
- payload bytes 4–5 (big-endian): total pages
- payload byte 6: total commands
- payload byte 7: device id

For X1, two header layouts are observed:
- classic / Bluetooth / IR: `00 <pages> <commands> <dev>`
- WiFi / Hue: `<pages> <commands> <dev> 01`

Each page carries a **frame number** at payload byte 2 (1-indexed). The burst is
complete primarily when the received `frame_no` reaches the header's `total_pages`;
the final-page opcodes (`0x495D`, `0x8F5D`, `0xCB5D`, `0x535D`, `0xA35D`, and other
observed X1 finals) act as validation and fallback cues rather than empty terminators.

Not every data family follows this exact header/page/tail structure. Favorites-order
responses, for example, are currently treated as single payload frames in family
`0x63`.

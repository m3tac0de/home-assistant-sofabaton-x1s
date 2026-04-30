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
| `0x016C` | `REQ_ACTIVITY_MAP`      | `[act_lo]`    | X1           | Request activity favorites mapping |
| `0x024D` | `REQ_MACRO_LABELS`      | `[act_lo, 0xFF]` | All       | Request macro definitions for an activity |
| `0x0148` | `REQ_ACTIVITY_INPUTS`   | `[0x01]`      | X1S, X2      | Request activity input candidates |
| `0x0109` | `DELETE_DEVICE`         | `[dev_lo]`    | X1           | Remove device from hub |
| `0x0023` | `FIND_REMOTE`           | `[0x01]`      | X1, X1S      | Trigger remote buzzer |
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

These form a multi-frame burst: `DEVBTN_HEADER` → one or more body pages → `DEVBTN_TAIL`.

| Opcode   | Name                    | Notes |
|----------|-------------------------|-------|
| `0xD95D` | `DEVBTN_HEADER`         | Opens a device-button burst; contains total frame count |
| `0xD55D` | `DEVBTN_PAGE`           | Body page with 2–3 command entries |
| `0xF75D` | `DEVBTN_PAGE_ALT1`      | Variant page layout (earlier payload offset) |
| `0xA35D` | `DEVBTN_PAGE_ALT2`      | Variant page layout |
| `0x2F5D` | `DEVBTN_PAGE_ALT3`      | Variant page layout |
| `0xF35D` | `DEVBTN_PAGE_ALT4`      | Variant page layout |
| `0x7B5D` | `DEVBTN_PAGE_ALT5`      | Variant page layout |
| `0xCB5D` | `DEVBTN_PAGE_ALT6`      | Variant page layout |
| `0x535D` | `DEVBTN_PAGE_ALT7`      | Variant page layout |
| `0x4D5D` | `DEVBTN_SINGLE`         | Single-command metadata (targeted REQ_COMMANDS) |
| `0x495D` | `DEVBTN_TAIL`           | Burst terminator, type 1 |
| `0x303D` | `KEYMAP_EXTRA`          | Small follow-up page (keymap family) |
| `0x8F5D` | `DEVBTN_MORE`           | Small follow-up page |

### Keymap / continuation pages (family `0x3D`)

| Opcode   | Name              | Notes |
|----------|-------------------|-------|
| `0xF13D` | `KEYMAP_TBL_A`    | Activity button keymap |
| `0xFA3D` | `KEYMAP_TBL_B`    | Activity button keymap variant |
| `0x3D3D` | `KEYMAP_TBL_C`    | Returned when Hue buttons requested |
| `0x1E3D` | `KEYMAP_TBL_D`    | Observed variant |
| `0xBB3D` | `KEYMAP_TBL_E`    | Observed variant |
| `0x783D` | `KEYMAP_TBL_F`    | Observed variant |
| `0xCD3D` | `KEYMAP_TBL_G`    | Observed variant |
| `0x543D` | `KEYMAP_CONT`     | Continuation page after MARKER |

### Activity mapping pages (favorites)

| Opcode   | Name                    | Hub versions | Notes |
|----------|-------------------------|--------------|-------|
| `0x7B6D` | `ACTIVITY_MAP_PAGE`     | X1           | Activity favorites mapping |
| `0xD56D` | `ACTIVITY_MAP_PAGE_X1S` | X1S, X2      | Activity favorites mapping variant |

### Macro pages (family `0x13`)

| Opcode   | Name          | Notes |
|----------|---------------|-------|
| `0x6E13` | `MACROS_A1`   | Macro definition page |
| `0x5A13` | `MACROS_B1`   | Macro definition page |
| `0x8213` | `MACROS_A2`   | Macro definition page |
| `0x6413` | `MACROS_B2`   | Macro definition page |

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
| `0x0C3D` | `MARKER`        | H→A       | Segment boundary before continuation |
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
| `0x3D`   | Keymap pages   | `0xF13D`, `0xFA3D`, `0x3D3D`, `0x543D`, `0x0C3D` |
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

The `DEVBTN_HEADER` frame (`0xD95D`) payload bytes 4–5 (big-endian) contain the
total number of frames to expect. The burst is complete when either:
- The number of received frames equals `total_frames`, or
- A TAIL opcode (`0x495D`, `0x303D`, or `0x8F5D`) is received.

Each PAGE frame carries a **frame number** at payload byte 2 (1-indexed).

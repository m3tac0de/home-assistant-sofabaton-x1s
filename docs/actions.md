# Actions reference (Sofabaton X1/X1S/X2)

This page documents the custom actions exposed by the integration.
Find them in Home Assistant at **Settings -> Developer Tools -> Actions**, then
filter by `sofabaton_x1s`.

---

## Quick reference

| Action | What it does | Returns data? |
| ------ | ------------ | :-----------: |
| `sofabaton_x1s.fetch_device_commands` | Fetch command list for a device or activity into the Index sensor | No |
| `sofabaton_x1s.dump_ir_commands` | Read raw `0x020C` blob pages for one command or a full device | Yes |
| `sofabaton_x1s.fetch_blob` | Read normalized IR blob bodies suitable for replay or save | Yes |
| `sofabaton_x1s.play_ir_blob` | One-shot test-play an IR blob without saving it | No |
| `sofabaton_x1s.persist_ir_blob` | Save a new IR command blob onto an existing IR device | Yes |
| `sofabaton_x1s.get_favorites` | Read the current ordered favorites list for an activity | Yes |
| `sofabaton_x1s.command_to_button` | Map a command, with optional long-press, to a physical button | No |
| `sofabaton_x1s.command_to_favorite` | Add a command as a quick-access favorite in an activity | No |
| `sofabaton_x1s.reorder_favorites` | Change the display order of an activity's favorites | No |
| `sofabaton_x1s.delete_favorite` | Remove a single favorite from an activity | No |
| `sofabaton_x1s.create_wifi_device` | Create a Wifi Device on the hub | No |
| `sofabaton_x1s.sync_command_config` | Deploy the saved Wifi Commands configuration to the hub | No |
| `sofabaton_x1s.device_to_activity` | Add a device to an activity | No |
| `sofabaton_x1s.delete_device` | Delete a device from the hub | No |

> **Sync guard:** several actions that modify the hub raise an error if a
> `sync_command_config` is currently in progress.
> Wait for the sync to complete before running other write actions.

---

## `sofabaton_x1s.fetch_device_commands`

Fetches the command list for a single device or activity and stores the result
in `sensor.<hub>_index`.

Commands are not fetched automatically on startup because that is too slow and
too noisy, so this action is the on-demand trigger.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Select your Sofabaton hub from the dropdown. |
| `ent_id` | int (1-255) | Yes | Sofabaton entity id: device id (1-99) or activity id (101+). |

```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  ent_id: 5
```

After it completes, inspect `sensor.<hub>_index` attributes for the populated
command, macro, and favorites lists.

For a full guide see [fetch_command.md](/D:/CODE/x1s-hass-root/docs/fetch_command.md).

---

## `sofabaton_x1s.dump_ir_commands`

Requests the raw `0x020C [device_id, command_id]` dump flow and returns the
parsed page structure for the selected device.
Leave `command_id` empty to request the full blob snapshot for that device.

This action returns data and is mainly useful for low-level troubleshooting.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_id` | int (1-255) | Yes | Hub device id to query through `0x020C [device_id, command_id]`. |
| `command_id` | int (1-255) | No | Optional command id. Omit to request all blob records using `0xFF`. |

**Response**

| Field | Description |
| ----- | ----------- |
| `device_id` | Device id the dump was requested from. |
| `requested_command_id` | Requested command id, or `null` when the full device snapshot was requested. |
| `total_commands` | Command count reported by the snapshot header, when available. |
| `received_command_count` | Number of command records assembled from the dump pages. |
| `complete` | Whether all expected dump pages were received. |
| `commands` | List of parsed raw dump records. |

Each `commands[]` entry includes raw page details such as `command_id`,
`label`, `format_marker`, `expected_page_count`, `page_count`, `complete`,
`ir_blob_hex`, and `pages`.

```yaml
action: sofabaton_x1s.dump_ir_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_id: 5
response_variable: dump
```

---

## `sofabaton_x1s.fetch_blob`

Fetches normalized command blob records suitable for later use with
`play_ir_blob` or `persist_ir_blob`.

Compared with `dump_ir_commands`, this action strips the replay-tail checksum
byte, classifies descriptive blobs, and returns a cleaner payload for
automations.

This action returns data and can be used inline in scripts and automations.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_id` | int (1-255) | Yes | Hub device id to query through `0x020C [device_id, command_id]`. |
| `command_id` | int (1-255) | No | Optional command id. Omit to request all blob records using `0xFF`. |

**Response**

| Field | Description |
| ----- | ----------- |
| `device_id` | Device id the blob fetch was requested from. |
| `requested_command_id` | Requested command id, or `null` when the full device snapshot was requested. |
| `total_commands` | Command count reported by the snapshot header, when available. |
| `received_command_count` | Number of command records returned. |
| `complete` | Whether the blob snapshot completed successfully. |
| `commands` | List of normalized command blob records. |

Each `commands[]` entry includes:

| Field | Description |
| ----- | ----------- |
| `command_label` | Best-known label for the command. |
| `device_id` | Owning device id. |
| `command_id` | Hub command id. |
| `device_class` | Cached device class such as `ir`, `wifi_ip`, or `wifi_roku`. |
| `blob_kind` | `raw` or `descriptive`. |
| `command_blob` | Canonical blob body as a spaced hex string, without the final replay-tail checksum byte. |
| `parsed_blob` | Human-readable descriptor text when the blob is descriptive. |
| `replay_tail_checksum` | Removed trailing checksum byte from the stored blob, useful for debugging. |

```yaml
action: sofabaton_x1s.fetch_blob
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_id: 5
  command_id: 7
response_variable: blobs
```

Tip: the returned `command_blob` value is the canonical input for
`play_ir_blob` and `persist_ir_blob`.

---

## `sofabaton_x1s.play_ir_blob`

Streams one canonical IR blob body to the hub for one-shot playback.
Nothing is persisted on the hub.

Input can be either:
- a hex string containing the canonical blob body without the final replay-tail
  checksum byte
- a descriptive protocol string beginning with `P:`, such as
  `P:Sony12 R:40000 D:1 F:18 MUL:2`

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `blob` | string | Yes | Blob body as hex, or a descriptor string beginning with `P:`. Whitespace is ignored for hex input. |

```yaml
action: sofabaton_x1s.play_ir_blob
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  blob: "00 00 00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30 30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00"
```

Or with a descriptor:

```yaml
action: sofabaton_x1s.play_ir_blob
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  blob: "P:Sony12 R:40000 D:1 F:18 MUL:2"
```

---

## `sofabaton_x1s.persist_ir_blob`

Adds a new command to an existing **IR** device by uploading a canonical blob
body and saving it on the hub.

This action is intended for learned or synthesized IR commands. It rejects
non-IR devices when the integration already knows the device class.

Input can be either:
- a hex string containing the canonical blob body without the final replay-tail
  checksum byte
- a descriptive protocol string beginning with `P:`

This action returns data and can be used inline in scripts and automations.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_id` | int (1-255) | Yes | Existing IR device id that should receive the new command. |
| `command_name` | string | Yes | Label to save on the hub for the new command. |
| `blob` | string | Yes | Blob body as hex, or a descriptor string beginning with `P:`. Whitespace is ignored for hex input. |

**Response**

| Field | Description |
| ----- | ----------- |
| `status` | `success` on a completed save. |
| `device_id` | Device id that received the new command. |
| `command_id` | Newly assigned hub command id. |
| `command_name` | Saved display label. |
| `page_count` | Number of upload pages sent to the hub. |

```yaml
action: sofabaton_x1s.persist_ir_blob
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_id: 5
  command_name: Input Blu-ray
  blob: "P:Sony12 R:40000 D:1 F:18 MUL:2"
response_variable: saved_blob
```

---

## `sofabaton_x1s.get_favorites`

Reads the current ordered favorites list for an activity directly from the hub.
This action returns data and can be used inline in scripts and automations.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Sofabaton activity id. |

**Response** - a `favorites` list where each entry contains:

| Field | Description |
| ----- | ----------- |
| `fav_id` | Hub-order id used for `reorder_favorites` and `delete_favorite`. |
| `slot` | Display slot or position within the activity's quick-access list. |
| `type` | Entry type, either `favorite` or `macro`. |
| `label` | Best-known display name. May be absent if not yet cached. |

```yaml
action: sofabaton_x1s.get_favorites
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
response_variable: favs
```

Use the returned `fav_id` values as input to `reorder_favorites` and
`delete_favorite`.

---

## `sofabaton_x1s.command_to_button`

Maps a command to a physical button for a given activity.
Optionally a second command can be assigned to a long-press on the same button.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Activity id the mapping is created in. |
| `button_id` | int (1-255) | Yes | Physical button code. See [Button ID reference](#button-id-reference). |
| `device_id` | int (1-99) | Yes | Device id the command belongs to. |
| `command_id` | int (1-255) | Yes | Command id within that device. |
| `long_press_device_id` | int (1-99) | No | Device id for the long-press command. Must be used together with `long_press_command_id`. |
| `long_press_command_id` | int (1-255) | No | Command id for the long-press action. Must be used together with `long_press_device_id`. |

```yaml
action: sofabaton_x1s.command_to_button
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  button_id: 182
  device_id: 2
  command_id: 5
  long_press_device_id: 2
  long_press_command_id: 8
```

---

## `sofabaton_x1s.command_to_favorite`

Adds a command as a quick-access favorite for an activity.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Activity id to add the favorite to. |
| `device_id` | int (1-99) | Yes | Device id the command belongs to. |
| `command_id` | int (1-255) | Yes | Command id within that device. |
| `slot_id` | int (0-255) | No | Optional slot or index for the favorite order position in the hub mapping payload. Default `0`, which puts it at the top. |

```yaml
action: sofabaton_x1s.command_to_favorite
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  device_id: 2
  command_id: 5
```

---

## `sofabaton_x1s.reorder_favorites`

Changes the display order of favorites within an activity.
Use `get_favorites` first to retrieve the `fav_id` values, then supply them in
the desired order.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Activity id. |
| `ordered_fav_ids` | list of int | Yes | Hub-order `fav_id` values in the desired display order. |

```yaml
action: sofabaton_x1s.reorder_favorites
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  ordered_fav_ids: [3, 1, 2]
```

---

## `sofabaton_x1s.delete_favorite`

Removes a single favorite from an activity.
Use `get_favorites` first to find the correct `fav_id`.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Activity id. |
| `fav_id` | int (1-255) | Yes | Hub-order id of the favorite to delete, from `get_favorites`. |

```yaml
action: sofabaton_x1s.delete_favorite
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  fav_id: 2
```

---

## `sofabaton_x1s.create_wifi_device`

Low-level action that creates a Wifi Device on the hub with a set of named
command slots.
The Sofabaton hub then calls back into the integration's HTTP listener whenever
one of those commands is triggered.

> **Note:** If you are using the **Wifi Commands** feature through the Control
> Panel card, you do not need to call this action directly.
> `sync_command_config` handles the full lifecycle.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_name` | string | Yes | Name for the Wifi Device as it will appear on the hub. Letters, numbers, and spaces only. Default `Home Assistant`. |
| `commands` | list of string | Yes | 1-10 command names. Letters, numbers, and spaces only. |
| `power_on_command_id` | int (1-10) | No | 1-based position in `commands` to use as the device power-on command. Not a final hub command id. |
| `power_off_command_id` | int (1-10) | No | 1-based position in `commands` to use as the device power-off command. Not a final hub command id. |
| `input_command_ids` | list of int | No | Ordered list of 1-based positions in `commands` to register as input switchers. Not final hub command ids. |

```yaml
action: sofabaton_x1s.create_wifi_device
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_name: Home Assistant
  commands:
    - Scene Movie
    - Scene Gaming
    - Lights Off
  input_command_ids:
    - 2
    - 3
```

See [wifi_commands.md](/D:/CODE/x1s-hass-root/docs/wifi_commands.md) for the full
Wifi Commands guide.

---

## `sofabaton_x1s.sync_command_config`

Deploys the saved Wifi Commands configuration to the hub.
This recreates the managed Wifi Device with the current command-slot settings
and applies all activity button mappings.

Normally triggered by the **Sync to hub** button in the Control Panel card's
Wifi Commands tab, but can also be called directly from automations or scripts.

> This operation reconfigures the hub. It can take several minutes.
> All other hub interactions are blocked while it runs.
> The physical remote is automatically instructed to sync at the end.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_name` | string | No | Optional override for the Wifi Device name. Default `Home Assistant`. |

```yaml
action: sofabaton_x1s.sync_command_config
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
```

---

## `sofabaton_x1s.device_to_activity`

Adds a device to an activity on the hub, so the activity can use that device's
commands.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `activity_id` | int (101-255) | Yes | Activity id. |
| `device_id` | int (1-99) | Yes | Device id. |
| `input_command_id` | int (1-255) | No | Optional device command id to set as the input for the activity. |

```yaml
action: sofabaton_x1s.device_to_activity
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  device_id: 2
  input_command_id: 4
```

---

## `sofabaton_x1s.delete_device`

Deletes a device from the hub and confirms all impacted activities.

> This is a destructive hub operation. Use with caution.

| Parameter | Type | Required | Description |
| --------- | ---- | :------: | ----------- |
| `device` | HA Device | Yes | Your Sofabaton hub. |
| `device_id` | int (1-99) | Yes | Device id to delete. |

```yaml
action: sofabaton_x1s.delete_device
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_id: 5
```

---

## Button ID reference

Used by `command_to_button`.
Buttons marked **X2 only** are not present on X1 or X1S remotes.

| Button | ID (decimal) | X2 only |
| ------ | :----------: | :-----: |
| C | 151 | Yes |
| B | 152 | Yes |
| A | 153 | Yes |
| EXIT | 154 | Yes |
| DVR | 155 | Yes |
| PLAY | 156 | Yes |
| GUIDE | 157 | Yes |
| UP | 174 | |
| LEFT | 175 | |
| OK | 176 | |
| RIGHT | 177 | |
| DOWN | 178 | |
| BACK | 179 | |
| HOME | 180 | |
| MENU | 181 | |
| VOL_UP | 182 | |
| CH_UP | 183 | |
| MUTE | 184 | |
| VOL_DOWN | 185 | |
| CH_DOWN | 186 | |
| REW | 187 | |
| PAUSE | 188 | |
| FWD | 189 | |
| RED | 190 | |
| GREEN | 191 | |
| YELLOW | 192 | |
| BLUE | 193 | |
| POWER_ON | 198 | |
| POWER_OFF | 199 | |

---

## Workflows

### Build a custom button layout for an activity

Use `fetch_device_commands` to explore what commands are available on each
device, then call `command_to_button` once per physical button to set up
exactly which command fires when each key is pressed.

```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: <hub_device_id>
  ent_id: 2

action: sofabaton_x1s.command_to_button
data:
  device: <hub_device_id>
  activity_id: 103
  button_id: 182
  device_id: 2
  command_id: 5
  long_press_device_id: 2
  long_press_command_id: 6
```

---

### Fetch, test, then save an IR blob

Use `fetch_blob` to retrieve a canonical blob body from an existing command,
`play_ir_blob` to verify it immediately, and `persist_ir_blob` to save it as a
new command.

```yaml
action: sofabaton_x1s.fetch_blob
data:
  device: <hub_device_id>
  device_id: 5
  command_id: 7
response_variable: blob_result

action: sofabaton_x1s.play_ir_blob
data:
  device: <hub_device_id>
  blob: "{{ blob_result.commands[0].command_blob }}"

action: sofabaton_x1s.persist_ir_blob
data:
  device: <hub_device_id>
  device_id: 5
  command_name: New Learned Command
  blob: "{{ blob_result.commands[0].command_blob }}"
```

---

### Manage favorites programmatically

Read the current state, remove a stale favorite, add a new one, then put them
in the right order.

```yaml
action: sofabaton_x1s.get_favorites
data:
  device: <hub_device_id>
  activity_id: 103
response_variable: result

action: sofabaton_x1s.delete_favorite
data:
  device: <hub_device_id>
  activity_id: 103
  fav_id: 2

action: sofabaton_x1s.command_to_favorite
data:
  device: <hub_device_id>
  activity_id: 103
  device_id: 2
  command_id: 7

action: sofabaton_x1s.reorder_favorites
data:
  device: <hub_device_id>
  activity_id: 103
  ordered_fav_ids: [4, 1, 3]
```

---

### Trigger a hub resync after modifying Wifi Commands

If you update Wifi Command configuration outside the Control Panel card, call
`sync_command_config` to push the changes to the hub.

```yaml
action: sofabaton_x1s.sync_command_config
data:
  device: <hub_device_id>
```

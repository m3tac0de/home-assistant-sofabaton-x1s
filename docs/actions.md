# Actions reference (Sofabaton X1/X1S/X2)

This page documents all custom Actions (services) provided by the integration.
Find them in Home Assistant at **Settings → Developer Tools → Actions**, then filter by `sofabaton_x1s`.

---

## Quick reference

| Action                                | What it does                                                      | Returns data? |
| ------------------------------------- | ----------------------------------------------------------------- | :-----------: |
| `sofabaton_x1s.fetch_device_commands` | Fetch command list for a device or activity into the Index sensor |       –       |
| `sofabaton_x1s.get_favorites`         | Read the current ordered favorites list for an activity           |       ✓       |
| `sofabaton_x1s.command_to_button`     | Map a command (with optional long-press) to a physical button     |       –       |
| `sofabaton_x1s.command_to_favorite`   | Add a command as a quick-access favorite in an activity           |       –       |
| `sofabaton_x1s.reorder_favorites`     | Change the display order of an activity's favorites               |       –       |
| `sofabaton_x1s.delete_favorite`       | Remove a single favorite from an activity                         |       –       |
| `sofabaton_x1s.create_wifi_device`    | Create a Wifi Device on the hub (raw, low-level)                  |       –       |
| `sofabaton_x1s.sync_command_config`   | Deploy the saved Wifi Commands configuration to the hub           |       –       |
| `sofabaton_x1s.device_to_activity`    | Add a device to an activity                                       |       –       |
| `sofabaton_x1s.delete_device`         | Delete a device from the hub                                      |       –       |

> **Sync guard:** several actions that modify the hub raise an error if a `sync_command_config` is currently in progress.
> Wait for the sync to complete before running other write actions.

---

## `sofabaton_x1s.fetch_device_commands`

Fetches the command list for a single device or activity and stores the result in `sensor.<hub>_index`.

Commands are not fetched automatically on startup (too slow/noisy), so this action is the on-demand trigger.

| Parameter | Type        | Required | Description                                                        |
| --------- | ----------- | :------: | ------------------------------------------------------------------ |
| `device`  | HA Device   |    ✓     | Select your Sofabaton hub from the dropdown (UI mode recommended). |
| `ent_id`  | int (1–255) |    ✓     | Sofabaton entity id: device id (1–99) or activity id (101+).       |


```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e # select hub in UI mode
  ent_id: 5 # device id or activity id
```

After it completes, inspect `sensor.<hub>_index` attributes for the populated command/macro/favorites lists.

For a full guide see [`docs/fetch_command.md`](fetch_command.md).

---

## `sofabaton_x1s.get_favorites`

Reads the current ordered favorites list for an activity directly from the hub.
This action **returns data** and can be used inline in scripts and automations.

| Parameter     | Type          | Required | Description            |
| ------------- | ------------- | :------: | ---------------------- |
| `device`      | HA Device     |    ✓     | Your Sofabaton hub.    |
| `activity_id` | int (101–255) |    ✓     | Sofabaton activity id. |

**Response** — a `favorites` list where each entry contains:

| Field    | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `fav_id` | Hub-order id used for `reorder_favorites` and `delete_favorite`. |
| `slot`   | Display slot / position within the activity's quick-access list. |
| `type`   | Entry type (`favorite` or `macro`).                              |
| `label`  | Best-known display name (may be absent if not yet cached).       |

```yaml
action: sofabaton_x1s.get_favorites
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
response_variable: favs
```

Use the returned `fav_id` values as input to `reorder_favorites` and `delete_favorite`.

---

## `sofabaton_x1s.command_to_button`

Maps a command to a physical button for a given activity.
Optionally a second command can be assigned to a long-press on the same button.

| Parameter               | Type          | Required | Description                                                                           |
| ----------------------- | ------------- | :------: | ------------------------------------------------------------------------------------- |
| `device`                | HA Device     |    ✓     | Your Sofabaton hub.                                                                   |
| `activity_id`           | int (101–255) |    ✓     | Activity id the mapping is created in.                                                |
| `button_id`             | int (1–255)   |    ✓     | Physical button code (see [Button ID table](#button-id-reference) below).             |
| `device_id`             | int (1-99)    |    ✓     | Device id the command belongs to.                                                     |
| `command_id`            | int (1–255)   |    ✓     | Command id within that device.                                                        |
| `long_press_device_id`  | int (1–99)    |    –     | Device id for the long-press command. Required together with `long_press_command_id`. |
| `long_press_command_id` | int (1–255)   |    –     | Command id for the long-press action. Required together with `long_press_device_id`.  |

```yaml
# Map VOL_UP (button 182) in activity 103 to device 2, command 5
# Long-press on the same button triggers device 2, command 8
action: sofabaton_x1s.command_to_button
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  button_id: 182 # VOL_UP
  device_id: 2
  command_id: 5
  long_press_device_id: 2
  long_press_command_id: 8
```

---

## `sofabaton_x1s.command_to_favorite`

Adds a command as a quick-access favorite for an activity.

| Parameter     | Type          | Required | Description                                                                                |
| ------------- | ------------- | :------: | ------------------------------------------------------------------------------------------ |
| `device`      | HA Device     |    ✓     | Your Sofabaton hub.                                                                        |
| `activity_id` | int (101–255) |    ✓     | Activity id to add the favorite to.                                                        |
| `device_id`   | int (1–99)    |    ✓     | Device id the command belongs to.                                                          |
| `command_id`  | int (1–255)   |    ✓     | Command id within that device.                                                             |
| `slot_id`     | int (0–255)   |    –     | Optional slot/index for the favorite position in the hub's mapping payload (default: `0`). |

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
Use `get_favorites` first to retrieve the `fav_id` values, then supply them in the desired order.

| Parameter         | Type          | Required | Description                                             |
| ----------------- | ------------- | :------: | ------------------------------------------------------- |
| `device`          | HA Device     |    ✓     | Your Sofabaton hub.                                     |
| `activity_id`     | int (101–255) |    ✓     | Activity id.                                            |
| `ordered_fav_ids` | list of int   |    ✓     | Hub-order `fav_id` values in the desired display order. |

```yaml
action: sofabaton_x1s.reorder_favorites
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  ordered_fav_ids: [3, 1, 2] # fav_ids from get_favorites, in new order
```

---

## `sofabaton_x1s.delete_favorite`

Removes a single favorite from an activity.
Use `get_favorites` first to find the correct `fav_id`.

| Parameter     | Type          | Required | Description                                                    |
| ------------- | ------------- | :------: | -------------------------------------------------------------- |
| `device`      | HA Device     |    ✓     | Your Sofabaton hub.                                            |
| `activity_id` | int (101–255) |    ✓     | Activity id.                                                   |
| `fav_id`      | int (1–255)   |    ✓     | Hub-order id of the favorite to delete (from `get_favorites`). |

```yaml
action: sofabaton_x1s.delete_favorite
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  fav_id: 2
```

---

## `sofabaton_x1s.create_wifi_device`

Low-level action that creates a Wifi Device on the hub with a set of named command slots.
The Sofabaton hub then calls back into the integration's HTTP listener whenever one of those commands is triggered.

> **Note:** If you are using the **Wifi Commands** feature through the Virtual Remote card, you do not need to call this action directly — `sync_command_config` handles the full lifecycle. Use `create_wifi_device` only if you are building a fully custom integration without the card UI.

| Parameter     | Type           | Required | Description                                                                                                          |
| ------------- | -------------- | :------: | -------------------------------------------------------------------------------------------------------------------- |
| `device`      | HA Device      |    ✓     | Your Sofabaton hub.                                                                                                  |
| `device_name` | string         |    ✓     | Name for the Wifi Device as it will appear on the hub. Letters, numbers, and spaces only. Default: `Home Assistant`. |
| `commands`    | list of string |    ✓     | 1–10 command names. Letters, numbers, and spaces only.                                                               |

| `power_on_command_id` | int |    –     | Optional 1-based position in `commands` to use as the device power-on command. This is not a final hub command id. |
| `power_off_command_id` | int |    –     | Optional 1-based position in `commands` to use as the device power-off command. This is not a final hub command id. |
| `input_command_ids` | list of int |    –     | Optional ordered list of 1-based positions in `commands` to register as device input switchers. Currently applied on X1 hubs only. |

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

See [`docs/wifi_commands.md`](wifi_commands.md) for the full Wifi Commands guide.

---

## `sofabaton_x1s.sync_command_config`

Deploys the saved Wifi Commands configuration to the hub.
This recreates the managed Wifi Device with the current command-slot settings and applies all activity button mappings.

Normally triggered by the **Sync to hub** button in the Virtual Remote card's Wifi Commands editor, but can also be called directly from automations or scripts.

> This operation reconfigures the hub. It can take several minutes. All other hub interactions are blocked while it runs. The physical remote is automatically instructed to sync at the end.

| Parameter     | Type      | Required | Description                                                            |
| ------------- | --------- | :------: | ---------------------------------------------------------------------- |
| `device`      | HA Device |    ✓     | Your Sofabaton hub.                                                    |
| `device_name` | string    |    –     | Optional override for the Wifi Device name. Default: `Home Assistant`. |

```yaml
action: sofabaton_x1s.sync_command_config
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
```

---

## `sofabaton_x1s.device_to_activity`

Adds a device to an activity on the hub, so the activity can use that device's commands.

| Parameter     | Type          | Required | Description         |
| ------------- | ------------- | :------: | ------------------- |
| `device`      | HA Device     |    ✓     | Your Sofabaton hub. |
| `activity_id` | int (101–200) |    ✓     | Activity id (101+). |
| `device_id`   | int (1–99)    |    ✓     | Device id (1–99).   |

```yaml
action: sofabaton_x1s.device_to_activity
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  activity_id: 103
  device_id: 2
```

---

## `sofabaton_x1s.delete_device`

Deletes a device from the hub and confirms all impacted activities.

> This is a destructive hub operation. Use with caution.

| Parameter   | Type        | Required | Description          |
| ----------- | ----------- | :------: | -------------------- |
| `device`    | HA Device   |    ✓     | Your Sofabaton hub.  |
| `device_id` | int (1–255) |    ✓     | Device id to delete. |

```yaml
action: sofabaton_x1s.delete_device
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e
  device_id: 5
```

---

## Button ID reference

Used by `command_to_button`. Buttons marked **X2 only** are not present on X1/X1S remotes.

| Button    | ID (decimal) | X2 only |
| --------- | :----------: | :-----: |
| C         |     151      |    ✓    |
| B         |     152      |    ✓    |
| A         |     153      |    ✓    |
| EXIT      |     154      |    ✓    |
| DVR       |     155      |    ✓    |
| PLAY      |     156      |    ✓    |
| GUIDE     |     157      |    ✓    |
| UP        |     174      |         |
| LEFT      |     175      |         |
| OK        |     176      |         |
| RIGHT     |     177      |         |
| DOWN      |     178      |         |
| BACK      |     179      |         |
| HOME      |     180      |         |
| MENU      |     181      |         |
| VOL_UP    |     182      |         |
| CH_UP     |     183      |         |
| MUTE      |     184      |         |
| VOL_DOWN  |     185      |         |
| CH_DOWN   |     186      |         |
| REW       |     187      |         |
| PAUSE     |     188      |         |
| FWD       |     189      |         |
| RED       |     190      |         |
| GREEN     |     191      |         |
| YELLOW    |     192      |         |
| BLUE      |     193      |         |
| POWER_ON  |     198      |         |
| POWER_OFF |     199      |         |

---

## Workflows

### Build a custom button layout for an activity

Use `fetch_device_commands` to explore what commands are available on each device, then call `command_to_button` once per physical button to set up exactly which command fires when each key is pressed.

```yaml
# Step 1 — discover commands on device 2 (run once, then read sensor.<hub>_index)
action: sofabaton_x1s.fetch_device_commands
data:
  device: <hub_device_id>
  ent_id: 2

# Step 2 — map the found commands to buttons in activity 103
action: sofabaton_x1s.command_to_button
data:
  device: <hub_device_id>
  activity_id: 103
  button_id: 182   # VOL_UP
  device_id: 2
  command_id: 5    # e.g. "Surround Sound"
  long_press_device_id: 2
  long_press_command_id: 6   # e.g. "Surround Off" on long press
```

---

### Manage favorites programmatically

Read the current state, remove a stale favorite, add a new one, then put them in the right order.

```yaml
# 1. Read what is there
action: sofabaton_x1s.get_favorites
data:
  device: <hub_device_id>
  activity_id: 103
response_variable: result

# 2. Delete the one you no longer want (fav_id from step 1)
action: sofabaton_x1s.delete_favorite
data:
  device: <hub_device_id>
  activity_id: 103
  fav_id: 2

# 3. Add a new command as a favorite
action: sofabaton_x1s.command_to_favorite
data:
  device: <hub_device_id>
  activity_id: 103
  device_id: 2
  command_id: 7

# 4. Reorder so the new favorite is first
action: sofabaton_x1s.reorder_favorites
data:
  device: <hub_device_id>
  activity_id: 103
  ordered_fav_ids: [4, 1, 3]   # updated fav_ids from a fresh get_favorites call
```

---

### Trigger a hub resync after modifying Wifi Commands

If you update Wifi Command configuration outside the Virtual Remote card, call `sync_command_config` to push the changes to the hub. No need to touch the card UI.

```yaml
action: sofabaton_x1s.sync_command_config
data:
  device: <hub_device_id>
```

# Index Sensor & Fetch Action Guide (Sofabaton X1/X1S/X2)

This guide explains how to use:

- `sofabaton_x1s.fetch_device_commands` (Action / service)
- `sensor.<hub>_index` (Diagnostic Index sensor)

…to discover **device/activity IDs** and **command IDs** for use with `remote.send_command`.

If you just want to capture a single button press quickly, the **Recorded Keypress sensor** is usually faster:
- `sensor.<hub>_recorded_keypress` (see main README)

---

## Mental model (what you’re doing)

Your Sofabaton hub assigns a number to each device and activity you add to it.
Within each of those devices and activities exists a list of commands, favorites and macros. These are also each given a number.

- **`ent_id`** = Sofabaton “entity id” on the hub  
  - device ids usually start at **1**
  - activity ids usually start at **101**
- **`command_id`** = the numeric command id *inside* that entity’s command list

Once you have those numbers, you can call:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  device: <ent_id>
  command: <command_id>
```

> Note: In this integration, the `device:` field of `remote.send_command` is used to target **either a device or an activity** (same id space on the hub).

---

## What `sensor.<hub>_index` contains

Open **Developer Tools → States → `sensor.<hub>_index`** and inspect the **attributes**.

The Index sensor is a structured map that can contain:

- `devices` → map keyed by device id (`"1"`, `"2"`, …)
  - each device can have `brand`, `name`
  - and after fetching: `commands: [{ name, command }, ...]`
- `activities` → map keyed by activity id (`"101"`, `"102"`, …)
  - each activity can have `name`, `active`
  - and after fetching (depending on hub config):  
    - `macros: [{ name, command }, ...]`  
    - `favorites: [{ name, command, device }, ...]`

The device/activity list is populated always, but **commands/macros/favorites populate on demand** via the fetch action.

---

## The fetch action

### Action name

- `sofabaton_x1s.fetch_device_commands`

### Parameters

- `device`  
  This is the **Home Assistant Device** representing your Sofabaton hub entry (NOT the Sofabaton device id).  
  Use **Developer Tools → Actions → UI mode** to select it from the dropdown.

- `ent_id`  
  This is the **Sofabaton entity id** you want to fetch commands for:  
  either a device id (1+) or activity id (101+).

### Recommended: run in UI mode once

Go to **Developer Tools → Actions**, select `sofabaton_x1s.fetch_device_commands`, then switch to **UI mode**.

- Pick the hub (the HA Device dropdown)
- Enter `ent_id` for the device/activity you want

This avoids guessing the HA “Device id” string.

### YAML example

```yaml
action: sofabaton_x1s.fetch_device_commands
data:
  device: 89c3874a93f1e9ee0f49e24a2710535e  # select hub device in UI mode
  ent_id: 5                                 # Sofabaton device id (or 101+ activity id)
```

After it completes, check `sensor.<hub>_index`.

---

## Step-by-step workflow

### 1) Pick what you want to control

Examples:
- A device command like **“Guide”** on your projector
- An activity macro like **“Dim lights”**
- A favorite like **“Exit”**

### 2) Find the entity id (`ent_id`)

Open `sensor.<hub>_index` attributes and look under:

- `devices:` (keys like `"1"`, `"2"`) for device ids
- `activities:` (keys like `"101"`, `"103"`) for activity ids

Pick the id that corresponds to the device/activity name you want.

### 3) Fetch commands for that entity

Run `sofabaton_x1s.fetch_device_commands` with that `ent_id`.

### 4) Read the populated command list

Depending on what you fetched, look in:

- `devices["<id>"].commands[]` (device commands)
- `activities["<id>"].macros[]` (activity macros)
- `activities["<id>"].favorites[]` (favorites)

Copy the numeric `command` value you need.

### 5) Use it in `remote.send_command`

Use the patterns below.

---

## Turning Index entries into `remote.send_command`

### A) Send a device command

From Index:

```yaml
devices:
  "1":
    name: Projector
    commands:
      - name: Guide
        command: 3
```

Automation:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  device: 1
  command: 3   # Guide
```

### B) Run an activity macro

From Index:

```yaml
activities:
  "103":
    name: Movie Time
    macros:
      - name: Dim lights
        command: 1
```

Automation:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  device: 103
  command: 1   # Dim lights (macro)
```

### C) Use an activity favorite

From Index:

```yaml
activities:
  "103":
    favorites:
      - name: Exit
        command: 2
        device: 1
```

Automation:

```yaml
action: remote.send_command
target:
  entity_id: remote.<hub>_remote
data:
  device: 1
  command: 2   # Exit
```

If a favorite entry does **not** include a `device` field, treat it like a macro and send it with `device: <activity id>`.

---

## FAQ / Common pitfalls

### “My Index has devices/activities, but no commands”
That’s expected until you run `sofabaton_x1s.fetch_device_commands` for a specific `ent_id`.

### “What’s the difference between `device` and `ent_id` in the fetch action?”
- `device` = **Home Assistant Device** representing your Sofabaton hub (chosen from UI mode dropdown)
- `ent_id` = **Sofabaton entity id** (device or activity id on the hub)

### “The command entities are unavailable”
If the official Sofabaton app is connected to the proxy, “writer” entities can become unavailable by design. Disconnect the app from the virtual hub to allow HA to send commands.

### “IDs are strings in the Index”
Yes. In the Index sensor attributes they appear as keys like `"103"`.  
When calling `remote.send_command`, you can use them as numbers (e.g. `device: 103`).

---

## Tips

- Use the Index method when you want to build several automations and need a **full list**.
- Use Recorded Keypress when you want a **single button** quickly.

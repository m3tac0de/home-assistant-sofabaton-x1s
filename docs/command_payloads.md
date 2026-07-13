# Sofabaton Command Payloads

This page explains **command payloads**: the actual data the hub stores for
each command, how to view, test, and save them, and the payload data you may
see in backup files.

> Terminology: command payloads used to be called **"Blobs"** in this
> integration. The old name survives in the HA action names
> (`fetch_blob`, `play_ir_blob`, `persist_ir_blob`) and their `blob`
> request/response fields, but the documentation now says "command payload".

It is written for users of the integration. It does not describe the internal
decoder implementation.

## What is a command payload?

At the Sofabaton UI level, you normally think in terms of devices and commands:
`Power`, `Volume Up`, `HDMI 1`, and so on.

Under the hood, the hub stores a payload for each command. Think of it like
this:

- **Command name**: what you see in the UI
- **Command id**: the hub's index for that command
- **Command payload**: the real command data behind it

That idea is not limited to IR. The hub stores command payloads for all device
types (IR, RF, BT, Wifi etc). In this integration payloads for all device
types can be viewed, but **only IR payloads should be Tested or Saved**.

## Working with payloads in the Hub tab

Open the **Hub** tab in the Control Panel card, select a device, and click
**Edit device**. From the device editor you can:

1. **View a command's stored payload** — open a command's payload editor to
   fetch the payload from the hub on demand. Descriptive-protocol payloads are
   shown decoded; raw payloads are shown as hex.
2. **Test a payload** — for IR devices, the **Test** button plays the current
   bytes on the hub once, without saving anything.
3. **Save a payload** — save the edited payload; the change is written to the
   hub through the device's next Sync.

This makes payloads useful for both learning and real-world command creation.

Examples:

- You can fetch a known-good IR command from your own hub and keep it as a
  backup.
- You can share an IR command payload with another user.
- You can take IR data from online databases, use IrScrutinizer to turn it
  into a usable payload, then test and save it to the hub.

## Important rule: IR only for Test and Save

This is the most important rule on this page:

**Only test and save payloads that belong to IR devices.**

- It is fine to **view** payloads to learn how the hub stores commands.
- Only **Test** and **Save** payloads on **IR devices**.
- Do not treat Wifi, Bluetooth, Roku, Hue, IP, or MQTT payloads as if they
  were interchangeable with IR commands.

The integration in its current form cannot reliably block you from Testing or
Saving a non-IR payload, so this is all you.

## Two IR payload formats

There are 2 main ways that a Sofabaton hub stores IR command payloads:

- The **raw IR format** describes the signal by its actual transmitted timings: carrier frequency plus the sequence of mark/space durations. It is a low-level recording of what the hub should send. The **raw IR format** is supported on **all hubs**.
- The **descriptive format** describes the same signal by its decoded protocol and parameter values, like `P:Sony12 R:40000 D:1 F:18 MUL:2`. It is a higher-level, human-readable representation of what the signal means. The **descriptive format** is supported on the **X2 hub only**.

Users can build entirely new IR payloads from published IR protocol data
instead of only reusing commands already stored on the hub.

In practice, this means the Control Panel card can work with:

- payloads fetched from an existing hub command
- payloads shared by other users
- payloads derived from online IR databases with [IrScrutinizer](../IrScrutinizer/README.md)

## Sharing payloads with other users

One of the most useful things about IR command payloads is that they are easy
to share.

When sharing a payload, it helps to include:

- device brand and model
- what the command does
- whether it came from a learned command, an online database, or a generated
  IrScrutinizer export

## Using online IR databases and IrScrutinizer

Payload editing is also useful when the command is not already on your hub.

A possible workflow is:

1. Find IR protocol data in an online database
2. Use [IrScrutinizer](../IrScrutinizer/README.md) to turn that data into a payload-friendly IR representation
3. Paste it into the payload editor and **Test** it
4. If it works, **Save** it

[More information is here](../IrScrutinizer/README.md)

## Raw and decoded forms

A command payload may appear in two forms:

- `data_hex`: the raw bytes stored by the hub
- `decoded`: a structured, human-readable view of the same payload when the
  integration knows how to describe it

The raw `data_hex` value is always the exact payload. The `decoded` block is a
more readable representation for supported command classes.

## Where you will see this

- In the **Hub** tab's device editor when you open a command's payload
- In backup JSON files under a command row's `restore_data`

Not every command has a readable decoded form. Many command types remain
raw-only.

## Supported decoded classes

The integration can expose decoded payloads for these classes:

- `wifi_ip`
- `wifi_roku`
- `wifi_hue`
- `wifi_sonos`
- `ir` for the descriptive IR variant only

Other command classes, including Bluetooth, RF-style payloads, and
non-descriptive IR payloads, should be treated as raw `data_hex` only.

## The `decoded` block shape

When present, a decoded payload has this shape:

```json
"decoded": {
  "class": "wifi_ip",
  "trailer_hex": "4e",
  "fields": {
    "host": "192.168.2.88",
    "port": 6666,
    "method": "GET",
    "path": "/freddy/e26a44861b45/11/0/short",
    "header": "",
    "content_type": "application/x-www-form-urlencoded",
    "body": ""
  }
}
```

`class` identifies the payload family. `fields` contains the readable values.
`trailer_hex` is an opaque trailing byte region that belongs to the payload and
should normally be left alone when editing.

## Field meanings by class

### `wifi_ip`

Fields:

- `host`: destination IPv4 address
- `port`: destination TCP port
- `method`: HTTP method such as `GET` or `POST`
- `path`: request path
- `header`: extra HTTP headers as plain text
- `content_type`: HTTP content type, when present
- `body`: request body text

This class represents a complete HTTP-style command.

### `wifi_roku`

Fields:

- `path`: Roku command path such as `keypress/Home`

### `wifi_hue`

Fields:

- `path`: request path
- `body_block`: request body text

### `wifi_sonos`

Fields:

- `path`: request path
- `body_block`: request body text

This class uses the same general shape as `wifi_hue`, but the body content is
typically a Sonos SOAP-style request.

### `ir`

Fields:

- `descriptor`: descriptive IR text such as `P:Sony12 R:40000 D:1 F:18 MUL:2`

This decoded form only exists for the descriptive IR variant, which is
supported on X2 hubs only. Learned raw IR payloads do not become editable
descriptive text automatically.

## Editing in backup files

If you are editing a backup JSON file manually, the `decoded` block is the part
meant to be human-readable.

For supported decoded rows:

- edit values under `restore_data.decoded.fields`
- leave `restore_data.decoded.class` unchanged
- leave `restore_data.decoded.trailer_hex` unchanged unless you understand the
  wire format well enough to change it deliberately
- set `restore_data.decoded.edited` to `true` so restore knows to rebuild the
  raw payload from the edited fields

If `edited` is absent or false, restore uses the stored `data_hex` as-is.

If a row has no decoded block, treat it as raw-only.

## Limits and expectations

- A decoded block is a convenience view, not a promise that every payload type
  is editable.
- `trailer_hex` is not intended as a user-facing setting.
- Raw-only payloads should not be hand-converted into made-up decoded blocks.
- Hub editing is unavailable while the Sofabaton app is connected to the hub
  through the proxy.
- The device editor relies on the Control Panel card cache, so enable
  persistent cache and keep the cached device/command data current.
- Not every valid payload will be human-readable.
- A command id is not the payload itself; it is just the reference to that
  stored payload.
- Test first, then save.

## Related docs

- Backup and restore: [backup.md](./backup.md)

# Sofabaton Command Payloads

This page explains the command payload data (shown as "Blobs" in the Control Panel
card) you may see in fetched blobs and backup files.

It is written for users of the integration. It does not describe the internal
decoder implementation.

## Raw and decoded forms

A command payload may appear in two forms:

- `data_hex`: the raw bytes stored by the hub
- `decoded`: a structured, human-readable view of the same payload when the
  integration knows how to describe it

The raw `data_hex` value is always the exact payload. The `decoded` block is a
more readable representation for supported command classes.

## Where you will see this

- In the **Blobs** tab when you fetch a command from the hub
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
non-descriptive IR blobs, should be treated as raw `data_hex` only.

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

## Related docs

- Backup and restore: [backup.md](./backup.md)
- Blob workflow: [blobs.md](./blobs.md)

# Sofabaton Control Panel: Backup and Restore

The **Backup** tab in the **Sofabaton Control Panel** lets you export a hub
configuration to a JSON file and restore that file later.

This feature is meant for rebuilding hub configuration: devices, activities,
commands, macros, inputs, favorites, button bindings, and related metadata. It
is not a snapshot of live runtime state, so it does not preserve whether a
device happened to be on, off, or mid-activity when the backup was taken.

## Before you start

To create a backup from the card, **persistent cache must be enabled**. The
backup UI uses the cached hub catalog to show devices and activities and to
build the bundle.

Backup, restore, and blobs are also unavailable while the Sofabaton app is
connected to the hub through the proxy.

## Which backup should you make?

There are two useful cases:

- **Whole hub** backs up all devices and all activities.
- **Selected devices** backs up only the devices you choose.

If you may want to restore activities later, use **Whole hub**. Activities
refer to devices and commands, so they only restore cleanly when the bundle
includes the full device side they depend on.

Device-only backups are best for copying or archiving a few devices. They do
not include activities.

## What happens when you create a backup

The card starts the job, but the work runs in the integration backend. If you
close the card or move around Home Assistant, the backup keeps running. When
you come back, the card reattaches to the active operation and shows its
current progress.

When the backup completes, the integration keeps a temporary in-memory copy for
download. That server-side copy lasts **5 minutes**. If you miss that window,
just create a new backup.

Once you have downloaded the file, it is yours to keep. The 5-minute limit only
applies to the temporary copy held by the integration, not to the JSON file you
saved locally.

Downloads use Home Assistant's normal authenticated signed-download flow. The
integration does not write backup files into the Home Assistant filesystem or
maintain its own backup archive.

## What gets restored

Restore works from a single `hub_bundle` JSON file. Devices are restored first.
If the bundle also contains activities, those are restored second using the new
device ids assigned on the destination hub.

The file carries the source hub model and an exact `schema_version`. Restore
requires the bundle's exact schema version (currently `5`); bundles with any
other schema version — older or newer — are rejected, and no migrator is
provided. The UI also refuses to restore a backup onto an **older** hub model.
For example, a backup created on an `X2` hub will not restore onto an `X1S`.

Bundles also carry a `payload_profile` field: `full_backup` for real backups
(command payloads included) and `structural` for the blob-free cache shape the
activity editor reads. Structural bundles cannot be restored or loaded into the
backup editor — they carry no command payloads — and both the UI and the
backend reject them. Files without the field are older full backups and keep
restoring as before.

The important detail is that this compatibility check is about the Sofabaton
hub **model/version family** recorded in the bundle's `hub.version` field:
`X1`, `X1S`, or `X2`. It is not comparing firmware build numbers.

In practice, transporting a backup between hub versions works like this:

- Backup from `X1`: can restore onto `X1`, `X1S`, or `X2`
- Backup from `X1S`: can restore onto `X1S` or `X2`
- Backup from `X2`: can restore only onto `X2`

So the rule is: **same model is allowed, moving upward is allowed, moving
downward is blocked**.

## How restore behaves

By default, restore adds the selected backup items alongside what is already on
the hub.

The card also provides a checkbox labeled **Delete existing devices and
activities**. If you turn that on, the integration erases the destination hub
first and then restores the backup onto a clean hub.

Use the default behavior if you only want to bring in a few devices and keep
the current hub contents. Turn on **Delete existing devices and activities** if
you want the destination hub to match the backup as closely as possible.

When you select an activity for restore, the UI automatically includes any
devices that activity depends on. You do not need to work out those
dependencies by hand.

When the delete-existing option is enabled, the integration also attempts to
restore the saved hub name from the backup.

## What can fail, and what that means

If the delete-existing option is enabled, restore starts with a full hub erase.
If that erase fails, restore stops before writing anything from the backup.

If restore fails partway through devices or activities, the integration does
**not** roll back earlier work. Anything already restored stays on the hub, and
the result reports where the failure happened. In other words, restore is
all-or-nothing only up to the initial erase step when the delete-existing
option is turned on.

## Editing backup files

The **Edit** section in the card opens a loaded backup bundle for in-place
edits before you download it again. It works on the bundle in memory, so
nothing on the hub changes until you restore.

What you can do in the editor:

- **Rename** the hub, devices, activities, activity macros, activity
  favorites, and device commands. Command renames propagate everywhere the
  command is referenced.
- **Reorder** devices and activities to match how they appear on the hub, and
  reorder macros and favorites inside an activity. Drag handles are available
  where the browser supports them; move buttons are provided as a fallback.
- **Edit the head IP address** of `wifi_hue`, `wifi_roku`, and `wifi_sonos`
  devices. (For `wifi_ip` devices, the IP lives inside each command blob and
  is edited per-command via the structured-payload form below.)
- **Edit structured command payloads** ("Blobs" in the Control Panel card) for
  command rows whose class has a decoder. The supported classes and fields are:
  - `wifi_ip`: `host`, `port`, `method`, `path`, extra `header` lines,
    `content_type`, `body`
  - `wifi_roku`: `path`
  - `wifi_hue`: `path`, `body_block`
  - `wifi_sonos`: `path`, `body_block`
  - `ir`: `descriptor` (descriptive-protocol IR only — raw learned-IR
    blobs are not editable)

  When you save changes to a decoded payload, the editor marks that row as
  edited so restore re-encodes the payload from your fields instead of
  replaying the original `data_hex`.

Rows that do not carry a supported `decoded` block remain raw-only. That
includes Bluetooth, RF-style payloads, non-descriptive IR blobs, and any
other command row without a decoder.

After editing, download the bundle from the card and restore it like any
other backup file.

## Advanced: editing the JSON manually

The same payload-edit mechanism is exposed in the bundle JSON, so anything
the card editor does can also be done by hand. This is only needed when you
want a workflow the card does not cover (scripted edits, bulk find/replace,
etc.).

Command payloads ("Blobs" in the Control Panel card) are stored in backups as raw
`data_hex`. That raw payload is
the authoritative restore source and is written back to the hub as-is during
restore. For some command classes, the backup also includes a `decoded` block
with a more readable view of the same payload.

If a command row contains `restore_data.decoded.edited: true`, restore
re-encodes `data_hex` from the `decoded` block first and then restores that
newly encoded payload. If `edited` is absent or false, restore ignores the
decoded view and uses the stored `data_hex` unchanged.

To apply a manual payload change:

1. Create and download a backup JSON file.
2. Open the file in a text editor.
3. Find the command row you want to change.
4. Edit only the values under `restore_data.decoded.fields`.
5. Set `restore_data.decoded.edited` to `true`.
6. Leave `restore_data.decoded.class` and `restore_data.decoded.trailer_hex`
   alone.
7. Restore from that edited backup file.

Example:

```json
"restore_data": {
  "data_hex": "1e6c61756e63682f6362333833353339363834622f31302f302f73686f7274d3",
  "decoded": {
    "class": "wifi_roku",
    "trailer_hex": "d3",
    "edited": true,
    "fields": {
      "path": "keypress/Home"
    }
  }
}
```

## What restore validates

Restore does not trust edited payloads blindly.

- It re-encodes raw bytes from `decoded`.
- It decodes those bytes again as a self-check.
- It verifies that the decoded fields and `trailer_hex` still match what you
  asked for.

If any of those checks fail, restore raises an error for that command row
instead of silently falling back to the old `data_hex`. This is deliberate:
failed edits should be visible, not partially ignored.

## Important limits

- Do not edit `data_hex` and `decoded` independently. If you are editing a
  supported decoded row, treat `decoded` as the source of truth and set
  `edited: true`.
- Do not add a made-up `decoded` block to a raw-only command row. Restore only
  supports manual editing for rows whose class already has a real decoder and
  encoder.
- Do not restructure the bundle, delete required keys, or change ids unless
  you are prepared to debug schema or restore errors yourself.

## Related docs

- Service/API details: [actions.md](./actions.md)
- Blob workflow overview: [blobs.md](./blobs.md)
- Command payload reference: [command_payloads.md](./command_payloads.md)

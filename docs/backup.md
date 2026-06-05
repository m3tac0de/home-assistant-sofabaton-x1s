# Sofabaton Control Panel: Backup and Restore

Use the **Backup** tab in the **Sofabaton Control Panel** card to create a
backup bundle of your hub configuration and restore it later.

The short version:

- Backups cover the hub configuration that matters for recreating devices and
  activities.
- Backup and restore work runs in the integration backend, not in the card UI.
- Backup files are kept in integration memory only, for 5 minutes.
- Downloads use Home Assistant's native signed download flow.
- Command payloads are stored as raw `data_hex`, with optional decoded metadata
  added for the classes we currently understand structurally.

## What a backup includes

The backup feature is built around a single `hub_bundle` JSON payload.

For **devices**, the bundle captures the stored configuration needed to rebuild
the device, including:

- device schema fields
- command labels and command payloads
- button bindings
- macros
- inputs
- key sort / ordering metadata
- power and idle-behavior configuration carried in the device record

For **activities**, the bundle captures the activity configuration needed to
rebuild it, including:

- activity schema fields
- button bindings
- favorites
- macros
- references to the source devices and commands those activity rows point at

In practice, this means backups are intended to cover the real configuration
surface users care about: macros, inputs, idle behavior, favorites, command
payloads, and the related device/activity metadata needed to restore them.

Transient runtime state is not the goal here. The backup is for recreating the
stored configuration, not for snapshotting whether a device happened to be on,
off, or idle at that moment.

## Whole-hub vs device-only backups

There are two backup scopes in the card:

- **Whole hub** backs up all devices and all activities.
- **Selected devices** backs up only the chosen devices.

This distinction matters because activities reference devices. A whole-hub
backup can preserve and restore those cross-links directly. A device-only backup
does not include activities.

## Backup and restore run in the backend

The **Control Panel** card starts the operation and shows progress, but the
actual backup or restore runs in the integration backend.

That means the operation keeps running even if you close the card or navigate
elsewhere in Home Assistant.

When you return to the card, it re-subscribes to the operation state and shows
the current result or progress again.

## Backup lifetime and security

Backups are **not** written to the Home Assistant filesystem by this feature.

Instead, when a backup completes:

- the bundle is stored in the integration's RAM
- it stays available for **5 minutes**
- after that, the in-memory copy expires and the download is no longer valid

This is intentionally short-lived. The feature does not persist backup files on
disk and does not keep a server-side backup archive.

When you click **Download backup**, the card uses Home Assistant's built-in
download mechanism:

- the backend serves the bundle from an authenticated HA endpoint
- the frontend requests a signed download URL from Home Assistant
- the resulting download is protected by Home Assistant's normal signed-path
  security model

So the integration is not inventing its own ad-hoc file-sharing or storage
scheme here. It is using Home Assistant's native download flow.

## What expires after 5 minutes

The **server-side in-memory copy** expires after 5 minutes.

That means:

- if you do not download the backup in time, you need to create a new backup
- if the first download attempt did not land, you can download again while that
  5-minute window is still open
- once the window closes, the backend discards the bundle from memory

## About `data_hex` and decoded blob metadata

Many command payloads in Sofabaton are stored as opaque binary blobs. In backup
files, the raw command body is preserved in the `data_hex` field.

`data_hex` is the authoritative restore source.

That is important because restore should replay the same bytes the hub stored,
without depending on a higher-level interpretation being available.

For some blob classes, the integration also knows how to decode the blob into a
structured `decoded` block. Today that is used for:

- `wifi_ip`
- `wifi_roku`
- `wifi_hue`
- `wifi_sonos`
- descriptive IR blobs

For those classes, backups can carry both:

- `data_hex`: the original wire-faithful bytes
- `decoded`: a structured, human-meaningful view of the same payload

Examples of what the decoded view can expose:

- host, port, method, path, headers, and body for `wifi_ip`
- path fragments for `wifi_roku`
- path and body blocks for `wifi_hue` and `wifi_sonos`
- protocol descriptors such as `P:Sony12 ...` for descriptive IR blobs

## How `data_hex` is used during restore

Current restore behavior is deliberately conservative:

- restore reads `data_hex`
- restore writes those bytes back to the hub
- `decoded` is additive metadata, not the primary restore source

This gives us two benefits:

- backups stay byte-faithful to what the hub actually stored
- restore continues to work even for rows that have no decoder yet

If a blob class is not currently decoded, the backup still keeps the raw
`data_hex` so it remains restorable.

## Related docs

- Service/API details: [actions.md](./actions.md)
- Blob workflow overview: [blobs.md](./blobs.md)
- Decoder specification: [command-blob-decoders.md](./protocol/command-blob-decoders.md)

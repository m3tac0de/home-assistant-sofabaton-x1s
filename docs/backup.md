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

The file carries the source hub model and an exact `schema_version`. The UI
rejects backups from newer schema versions, and it also refuses to restore a
backup onto an **older** hub model. For example, a backup created on an `X2`
hub will not restore onto an `X1S`.

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

The **Edit** section in the card lets you rename the hub, devices, and
activities inside a backup file before downloading it again.

That editor is intentionally narrow. The backup format is schema-checked on
restore, and the integration expects the bundle structure to match exactly, so
manual structural edits are best treated as an advanced workflow.

## About command payloads

Command payloads are stored in backups as raw `data_hex`. That raw payload is
the authoritative restore source and is written back to the hub as-is during
restore.

For some command classes, the backup may also include a `decoded` block with a
more readable view of the same payload. That extra metadata is informative, but
restore still depends on `data_hex`, not on the decoded view.

## Related docs

- Service/API details: [actions.md](./actions.md)
- Blob workflow overview: [blobs.md](./blobs.md)
- Decoder details: [command-blob-decoders.md](./protocol/command-blob-decoders.md)

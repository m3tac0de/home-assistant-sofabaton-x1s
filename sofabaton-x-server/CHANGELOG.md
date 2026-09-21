# Changelog

Changes to `sofabaton-x-server`, compared against its own release tags.
Protocol-library changes are recorded in the
[library changelog](../sofabaton-x/CHANGELOG.md).

## 0.2.1 (Unreleased)

Changes since `sofabaton-x-server-v0.2.0`. The release date will be set when
publishing. Requires **sofabaton-x >=0.2.1,<0.3**; publish the library first.
The API prefix and advertised API generation remain `/api/v1` and `1`.

### Upgrade notes

- **Regenerate clients from this release's `openapi.json`.** Stored payload
  GET responses can now have `kind: "network"` or `"record"`, as well as
  `"raw"` / `"descriptive"`, and include nullable `decoded` fields.
  Bluetooth/MQTT records can now return a payload where 0.2.0 returned 404.
  Only IR formats are accepted by `/play`, command-create and command-payload
  PUT. Edit non-IR command rows through device/document PUT routes.
- **Download backups promptly.** Fetch `result.bundle` from the individual
  job GET, or the bundle itself from the new download route. WebSocket job events,
  job lists and embedded hub jobs omit it. Bundles are held in memory for
  five minutes, or until a new backup starts on that hub or the client drops
  the bundle. Check `bundle_available`; expired downloads return
  `410 bundle_expired`. There is no server-side backup archive.
- **Device PUT can delete commands.** Omitted command rows are removed and
  the hub cascades their references. Send the complete edited device
  element, preserving commands you want to keep.
- **Callback records have transport and key fields.** `target` and
  `effective_destination` are null for MQTT. Presses include `device_key`
  and may have `transport: "mqtt"` with an empty `source`. The existing
  `/callback-device` routes still address only key `default` and create
  HTTP devices. Existing stored HTTP records remain readable.
- A replacing restore that erases the hub and then fails before rebuilding
  any entity now reports `error.status: 502`, `error.type: "restore_failed"`
  and `result.erased: true`, instead of a 409 implying
  nothing was written. Inspect both job error and partial result.

### Added

- **Control panel editing:** device and activity editors, command/payload
  editing, command deletion, favorites, buttons, macros, membership,
  power sequences and activity inputs. The Hub view replaces the old
  read-only Catalog view; registration/discovery live in the hub picker.
- **Backup panel:** create and download whole-hub or device-only backups,
  edit a backup locally, select entities for restore and optionally erase
  before restoring. A selected activity brings its required devices.
- `GET` / `DELETE /hubs/{id}/jobs/{job_id}/bundle`, download filenames and
  backup availability/expiry/download metadata. Bundle availability changes
  are announced on the job stream.
- **Wifi Commands panel and API:** up to five managed Wifi Devices per hub,
  including `default`; keyed create/read/update/delete/redeploy routes;
  per-slot favorites, buttons, long presses, activities and activity inputs.
  Managed references update with the spec. Preserve the complete spec on PUT.
- **X2 MQTT presses:** optional broker configuration through flags or
  environment, credentials/password-file and TLS options, reconnect/backoff,
  and `GET /server/mqtt`. The server subscribes to managed devices' hub
  topics and ignores retained presses and unrecognized devices. It does
  not publish commands. MQTT settings are not accepted in `server.json`.
- Hub views include `hub_name`, `active_job` and `last_job`. The hub name
  learned from its banner is retained for display while disabled.
- Host-side listener ports can be changed through `GET` / `PUT
  /server/settings` and the panel's Server page. Changes apply on restart;
  environment/CLI overrides are pinned and cannot be changed through the API.
- Activity edit and plan bodies accept a `devices` list for associated input
  records, idle behavior and command-name edits in the same job.
- `POST /hubs/{id}/resync-remote` makes the physical remotes run a full sync
  with the hub, and the panel's hub settings have a **Sync remote** button.
  The hub pushes writes to its remotes on its own; this is the manual
  trigger for a remote that missed them. Refused with `409 hub_job_running`
  while a job holds the hub.

### Fixed

- Control-panel layout, remote-layout editing, job/status reconciliation,
  device/activity editing and payload displays for non-IR classes.
- New activity inputs are written and verified on the hub through the
  library fix. Removing/reordering existing input entries remains unapplied,
  even if the job succeeds; activities reference inputs by position.
- Uncached reads wait for exclusive configuration operations rather than
  interrupting restore/write pages; a timeout reports `504 hub_timeout`.
- MQTT device updates preserve the hub's class and icon.
- Wifi Device deploys and updates end with one remote-sync trigger after
  their last write, through the library fix. Updates and MQTT deploys sent
  none before; an HTTP deploy with slot assignments sent it too early.

The [guides](docs/getting-started.md) and examples target this release.
The Hubitat example still consumes only the default callback device;
it does not create button devices for the keyed Wifi Devices.
See the [live-hub notes](../docs/protocol/live-hub-testing.md) for hardware
coverage, including the X1S activity-input editor and X2 MQTT lifecycle.

## 0.2.0 (2026-09-16)

First standalone server release, based on sofabaton-x 0.2.x.

- REST API 1 and a committed OpenAPI document for hub discovery,
  registration, enable/disable, catalogs, status and control.
- WebSocket hub, job and server events; managed HTTP callback device,
  short/long press events and bounded press history.
- Cached snapshots, entity editing, whole-document plans and writes,
  persistent apply records, jobs and cancellation where supported.
- IR payload conversion/play/learn/save, backup, restore and erase.
- Persistent hub registrations and library cache documents; configurable
  server settings, mDNS advertisement and reverse-proxy support.
- Browser control panel and web remote with a saved per-hub layout.
- Python starter/edit examples and a Hubitat integration example.
- PyPI packaging, Docker/Compose setup, tests and generated-client smoke checks.

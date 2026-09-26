# Changelog

Changes to `sofabaton-x-server`, compared against its own release tags.
Protocol-library changes are recorded in the
[library changelog](../sofabaton-x/CHANGELOG.md).

## Unreleased

**The remote as a web component for other dashboards.** The server
serves `<sofabaton-remote>` at `/ui/embed/sofabaton-remote.js`: place
the element on any page whose origin is in `allowed_origins`, and the
card loads that hub's saved layout, inherits the page's colours and
follows the event stream. The same element is published to npm as
`sofabaton-x-remote` for dashboards with a build step. See
[Embed the remote](docs/web-remote.md#embed-the-remote-in-your-own-dashboard).

- The embed script is the one asset served with
  `Access-Control-Allow-Origin: *`, so an unlisted dashboard still gets
  the notice that names the origin to add; the API keeps the
  listed-origin rule.
- A listed origin's CORS preflight that asks for Chrome's Private
  Network Access is granted.

## 0.2.2 (2026-09-25)

Changes since `sofabaton-x-server-v0.2.1`. Requires
**sofabaton-x >=0.2.2,<0.3**; publish the library first.
The API prefix and advertised API generation remain `/api/v1` and `1`.

**Access control: an admin account for the control panel and write
tokens for integrations.** Existing configuration writes remain open until
you set up access; browser-origin checks apply immediately. See
[Security](docs/running-server.md#security) and the
[API reference](docs/api-reference.md#access).

- **Hub/server reads stay free**, as does the `/api/v1/events` stream.
  Token and session lists require the admin's panel sign-in.
- **Control stays free:** start and stop an activity, send a command,
  find remote, resync remote, play an IR payload, the discovery scan. The
  web remote needs no token.
- **Configuration writes** need a token or the panel's sign-in once access
  is set up. Account/token/session management and MQTT broker changes or
  tests require the panel's sign-in; integration tokens cannot use them.
- **Web pages on other origins can no longer fire requests at the
  server.** Browser requests that change state or start operations,
  control included, must come from the server's own origin or one listed
  in the new `allowed_origins`
  setting.

### Upgrade notes

- **Access setup is optional.** A server upgraded from 0.2.1 or earlier
  has no admin account, and existing configuration writes still need no
  credential. Browser-origin checks apply even before setup. The panel
  shows a banner; **Set up access** there (or **Server settings →
  Access**) creates the account. Setup is accepted only from a loopback,
  private or link-local address. Behind a reverse proxy, set it up before
  you expose the server, and set `--advertise-url` and `--trusted-proxy`
  as the proxy section already asks.
- **Integrations that write need a token after that.** Make one in
  **Server settings → Access** and send it as `Authorization: Bearer
  sbx_...`, or as `X-Sofabaton-Token` when a proxy's basic auth holds the
  `Authorization` header. Writes include snapshot refresh, the `.../plan`
  previews, learn, backup, hub registration and enable/disable, and
  callback and Wifi Device provisioning. Control-only integrations need
  nothing. The Python examples read `SOFABATON_TOKEN` from the environment.
- **A browser UI on another origin** (a dashboard calling the API from
  its own page) must be listed in `allowed_origins`; until then its
  state-changing requests get `403 cross_origin_refused`. Framing the web
  remote needs no change. Listed origins get CORS headers without
  credentials, so they read and use control calls; configuration writes
  need a token once access is set up.
- Plain HTTP carries tokens and the sign-in cookie in the clear; use
  `--tls-cert` / `--tls-key` or a TLS reverse proxy where that matters.
  Exposure beyond the LAN still needs the proxy's own authentication,
  because reads and control stay free.
- Update installation pins to `sofabaton-x-server>=0.2.2,<0.3` and restart
  with the same data directory. Pip installs the required library version.
  Reload open panel and remote pages to load the new frontend.
- Regenerate clients from this release's `openapi.json` for firmware
  status, catalog `sort` fields, update checks, app-proxy controls, MQTT
  broker configuration/test routes, `ServerSettingsView.allowed_origins` and
  access (the security schemes `bearerAuth`, `tokenHeader` and
  `sessionCookie`, `security` per operation, `401` / `403` on writes, the
  `auth` routes and `ServerInfo.auth`).
  Activities and devices now arrive in display order; sort explicitly
  by ID if your client requires the previous order.
- The panel blocks device/activity editors, Wifi Commands and Backup on
  firmware below the supported floor. Update the hub through the official
  app. API clients must enforce the firmware verdict themselves; the
  server API does not reject requests based on it.
- Update checks are optional and off by default. Existing hub registrations,
  saved layouts and callback devices need no manual conversion.
- When upgrading from 0.2.0, also follow the
  [0.2.1 upgrade notes](#021-2026-09-22), especially payload response types,
  backup expiry and complete-device PUT behavior.

### Added

- `/api/v1/auth` routes: `GET /auth` (`claimed`, `signed_in`,
  `username`, `via`), `POST /auth/setup`, `POST /auth/login`
  (`remember`: 90 days, renewed with use; otherwise the browser session
  and 12 hours idle), `POST /auth/logout`, `PUT /auth/admin` (signs out
  every other session), `GET` / `POST /auth/tokens`, `PATCH` / `DELETE
  /auth/tokens/{id}`, `GET` / `DELETE /auth/sessions` and `DELETE
  /auth/sessions/{id}`. Account, token and session routes take the
  panel's sign-in only; a token gets `403 admin_required`.
- **The MQTT broker in the control panel.** **Server settings → MQTT
  broker** sets, tests and removes the broker for X2 Wifi Devices on the
  mqtt transport, applied at once. Admin only (the panel's sign-in, never a
  token, nothing before access is set up). Stored in `mqtt.json` (0600 on
  filesystems that support it) in
  the data directory with the password **in plain text**, so backups of
  the data directory contain it; flags and `SOFABATON_MQTT_*` still win and
  make the page read-only. The password is write-only, and changing where
  it is sent without entering it again drops it. Routes: `GET` / `PUT` /
  `DELETE /server/mqtt/config`, `POST /server/mqtt/test`; Problem type
  `422 invalid_mqtt_config`.
- A `server_event` of kind `mqtt_config` (empty `hub_id`) announces a
  saved or removed broker. Re-read `/server/mqtt/config` and `/server/mqtt`.
- `auth.json` in the data directory: the admin password (scrypt), tokens
  and sessions (SHA-256), never in the clear. Tokens (`sbx_...`) are shown
  once and never expire.
- The panel's **Server settings → Access**: set up access, change the
  username and password, create, rename and revoke tokens (with a
  ready-made `curl` line), list and sign out sessions, edit the allowed
  origins. A claimed panel shows a sign-in screen first.
- `allowed_origins` setting: `server.json`, `SOFABATON_ALLOWED_ORIGINS`
  (comma separated), `--allowed-origin` (repeatable), and `GET` / `PUT
  /server/settings`. Applies live; pinned when set by the environment or
  a flag.
- `--reset-password`: prints a new generated admin password, signs every
  browser out, keeps the username and the tokens, and exits. Works while
  the server runs, and in Docker as `docker exec <container>
  sofabaton-x-server --reset-password`. Deleting `auth.json` is the last
  resort and reopens writes until access is set up again.
- `GET /server` carries `auth: {claimed}`; the mDNS TXT carries `auth=1`
  once claimed. A `server_event` of kind `auth` (empty `hub_id`) tells
  open panels to re-read `GET /auth`.
- Configuration writes are logged with who made them (`by token '<name>'`, `by
  admin`). Secrets, the `Authorization` header and the cookie are never
  logged.
- Problem types: `401 auth_required` (with `WWW-Authenticate: Bearer
  realm="sofabaton-x-server"`), `401 invalid_credentials`, `403
  admin_required`, `403 cross_origin_refused`, `403 setup_local_only`,
  `403 wrong_password`, `404 token_not_found` / `session_not_found`,
  `409 already_claimed` / `not_claimed` / `token_name_taken`, `422
  weak_password` (fewer than 8 characters) / `invalid_origin`, `429
  login_throttled` (with `Retry-After`; five free failures, then a
  doubling wait capped at 60 s, never a lockout).
- **X2 number pad in the web remote and editors.** Number keys 0–9,
  dash and Enter are available for X2 button assignments. The remote
  shows a dialpad toggle on the Direction Pad when number keys are bound;
  tap it to open the keypad and tap outside to return. The keypad can be
  disabled per layout and appears on its own when the Direction Pad is
  hidden. See the [web remote guide](docs/web-remote.md#x2-number-pad).
- **Firmware floor on the hub row.** `HubStatus` (in `GET /hubs`,
  `GET /hubs/{id}/status` and the stream's hub rows) carries the
  library's `firmware_version`, `firmware_min_supported`,
  `firmware_unsupported` and `firmware_outdated`; `GET /hubs/{id}/info`
  adds `firmware_min_recommended`. The server refuses nothing on them:
  older firmware can ACK writes and drop them, so a
  client should block its own write surfaces. The panel now does, like
  the Home Assistant card: the device and activity editors, the Wifi
  Commands tab and the Backup tab show "update the hub" in their place
  while `firmware_unsupported` is set (the editors previously compared
  `/info` against a copy of the floor table; the two tabs were open).
- **Update check.** `GET /server/updates`, `POST /server/updates/check`
  and `PUT /server/updates` (and **Updates** on the panel's Server page:
  **Check for updates**, **Automatically check once a day**) ask PyPI
  whether a newer `sofabaton-x-server` release exists and compare versions
  locally. Off by default; the daily check is the `update_check` setting
  (`server.json`, `SOFABATON_UPDATE_CHECK`), kept with its last outcome
  in `update-check.json`. A check sends nothing about the installation,
  installs nothing, and a failed one never reads as up to date. `GET
  /server` carries the result as `update`; a finished check is announced
  as a `server_event` of kind `update_check` with an empty `hub_id`. A
  found update shows as a dot on the panel's cog menu.
- **App proxy switch per hub.** `POST /hubs/{id}/proxy/disable` and
  `/proxy/enable` (and **Turn app proxy off/on** in the panel's Hub
  settings) decide whether the official app can reach a hub through the
  server, without disconnecting the hub. Stored as the record's
  `config.proxy_enabled`, announced as `hub_proxy_disabled` /
  `hub_proxy_enabled`. With the proxy off for every hub, the app
  discovery listener (UDP 8102) closes.

### Changed

- The Python writing examples accept `SOFABATON_TOKEN` and refuse to
  edit or provision a hub that reports unsupported firmware. The starter
  and Hubitat control flows still need no server token.
- Favorites in the web remote can show their device names to distinguish
  commands with the same label. The panel's remote layout editor has
  clearer grouping and drag handles, and hub removal uses an inline
  confirmation.
- **Documentation:** lead with browser-based hub management, add a user
  getting-started guide and management guide, and separate the integration
  starter, deployment and API references. The integration guide now follows
  activity controls and state synchronization before optional commands and
  triggers. Its Python client adds activity start/stop and status inspection;
  legacy callback setup moves to `examples/provision_callback.py` for the
  Hubitat example (replacing the starter's `setup-presses` action).

### Fixed

- **`GET .../activities` and `GET .../devices` list in the hub's display
  order** (what `PUT .../order` writes, as the remote and the app show
  it) instead of id order, and each row carries that position as `sort`
  (`0` when the record has none). The bundled web remote showed
  reordered hubs in id order because it renders these lists as-is; it now
  matches the physical remote and the Home Assistant card. Regenerate
  clients from `openapi.json` to pick up the field; it is optional in
  the schema so existing clients keep working.
- **The official app finds the server's proxies again.** The server never
  asked a hub's proxy to advertise itself over mDNS, so a hub fronted by
  the server disappeared from the Sofabaton app. Each proxy now publishes
  its advertisement once the hub's connect-time sync has read the banner,
  the same way the Home Assistant integration does.
- Panel layout and editor behavior, including remote preview sizing,
  selection styling and touch reordering.

## 0.2.1 (2026-09-22)

Changes since `sofabaton-x-server-v0.2.0`. Requires
**sofabaton-x >=0.2.1,<0.3**; publish the library first.
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
- Job progress events can report `phase: "reading_back"` after the write
  phases, while the server reads the changed entities back from the hub.
  Treat the phase word as open-ended.
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
- Every write job reads the entities it changed back from the hub before
  it completes, so hub views and snapshots match the hub. A Wifi Device
  deploy with slot assignments previously left its activities showing
  zero favorites in the Hub view until a manual refresh.
- X1 activities no longer list a favorite twice, or carry the order slots
  of favorites removed by a cascade, after Wifi Device and favorite edits;
  a favorite delete waits 30 s for the hub's ack instead of reporting
  failure while the hub applied it.

The [guides](docs/first-integration.md) and examples target this release.
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

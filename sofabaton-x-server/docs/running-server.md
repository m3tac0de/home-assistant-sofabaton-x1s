# Running Sofabaton X Server

Installation, deployment and settings for the computer hosting the server.
For your first setup, follow [Getting started](getting-started.md).

[Install](#run) · [Docker](#docker) · [Reverse proxy](#behind-a-reverse-proxy-tls) ·
[Settings](#settings) · [Security](#security) · [Set up access](#set-up-access) ·
[Tokens](#tokens) · [Recovery](#recovery) · [Storage and upgrades](#storage-and-upgrades)

## Run

**Run one server for all your hubs.** Register each hub in its control
panel; all hubs share the same server URL and WebSocket endpoint.

**Close the official Sofabaton app on all phones/tablets before initial
setup.** A hub connected directly to the app stops advertising, so the
server cannot discover it. Keep the app closed until the hub is registered
and you have tested control. Disable any existing proxy for that hub first.

Install from PyPI (Python 3.11+; the library comes with it):

```
python -m pip install "sofabaton-x-server>=0.2.2,<0.3"
sofabaton-x-server
```

From a checkout, install both packages from the repository root instead:
`python -m pip install . ./sofabaton-x-server`.

Open the control panel at `http://<server>:8480/` (it lives at `/ui/`).
Use `localhost` when browsing on the server host. Open the hub picker to
see registered hubs and hubs discovered on the LAN. Add a discovered hub
with its Add button, or choose **Add by address…** for manual registration.
Each registered hub's **⋯** actions enable, disable or remove it (see
[hub management guide](managing-hubs.md)). If the hub is missing, make sure the app
is fully closed and scan again. Keep the data directory (default `./data`)
across restarts. `--hub <physical IP>` is an alternative for seeding the
first startup, not for adding hubs to an existing data directory.

After setup, the app can connect through the proxy; the server then observes
the session but refuses control commands until the app disconnects.

The server must sit on the same network segment as the phones running
the official app (mDNS and UDP broadcast); in Docker that means host
networking on a Linux host. Ports on the host: TCP 8200 (hub connect-
back, shared by all hubs), UDP 8102 (app discovery), UDP 5353 (mDNS),
and the API port.

### Docker

Build from the repository root (both distributions come from one repo)
or use the [Compose file](../docker-compose.yml):

```
docker build -f sofabaton-x-server/Dockerfile -t sofabaton-x-server .
docker run -d --name sofabaton-x-server --network host -v ./data:/data \
  sofabaton-x-server
```

```
cd sofabaton-x-server && docker compose up -d
```

The supplied Compose file uses Linux **host networking** so mDNS, the
app's UDP broadcast and the hub's TCP dial-back can reach the LAN interface.
Docker Desktop compatibility with this project's discovery and dial-back
requirements is unverified; this is a Linux deployment recipe.

Callback devices also need the hub to reach the separate HTTP callback
listener (TCP 8060 by default). A bridge deployment would need a reachable
`SOFABATON_CALLBACK_HOST` and callback-port publication, as well as working
discovery and hub dial-back; those two callback settings alone are not a
complete bridge-network deployment recipe.

`GET /api/v1/hubs/{hub_id}/callback-device` reports `target`, the address
already written to that device, and `effective_destination`, the address a
new deploy would use with the current settings. These can differ after a
settings change. `GET /api/v1/server` reports callback listener state, not
`effective_destination`. `/data` holds `hubs.json`, `server.json`,
`auth.json` (the admin account, tokens and sessions, once
[access is set up](#set-up-access)), `mqtt.json` (the MQTT broker when
the control panel set it, password in plain text), one `state-<hub_id>.json` cache
document per hub, and the [apply records](api-reference.md#recovery-and-retention).

### Behind a reverse proxy (TLS)

Terminate TLS in a reverse proxy; that is where certificates are
manageable. Three things to set on the server, then a snippet per proxy.

- `--advertise-url https://sofabaton.home.example`: what clients must
  use. Published in the mDNS TXT record as `base_url` and as the OpenAPI
  document's server URL, so discovery and generated clients both point
  at the proxy. The [Origin check](#browser-origins) also accepts this
  origin as the server's own, so the control panel can write through the
  proxy. Without it, a proxy on a non-default port (nginx's `$host` drops
  the port) makes the panel's writes fail with `403 cross_origin_refused`.
- `--trusted-proxy 127.0.0.1` (or the proxy's address): honours
  `X-Forwarded-*` from that source, so logs show the real client and
  redirects keep the public scheme. The access checks depend on it too:
  the sign-in cookie is only marked `Secure` when the server knows the
  browser used https (the proxy's `X-Forwarded-Proto`), and sign-in
  throttling and the [local-network rule for setting up access](#set-up-access)
  only see the real client address through it.
- `--bind 127.0.0.1` when the proxy runs on the same host, so plain
  HTTP is not also reachable directly.

Caddy (WebSocket upgrade is automatic):

```
sofabaton.home.example {
    reverse_proxy 127.0.0.1:8480
}
```

nginx:

```
location / {
    proxy_pass         http://127.0.0.1:8480;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    # /api/v1/events is a WebSocket:
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_read_timeout 3600s;
}
```

Mounting under a prefix (`https://home.example/sofabaton/`): configure the
proxy to strip `/sofabaton` when forwarding, add `--root-path /sofabaton`,
and set `--advertise-url https://home.example/sofabaton`. The API then lives
at `https://home.example/sofabaton/api/v1`; do not include `/api/v1` in
`--advertise-url`.

**Set up access before you expose the server.** Until an admin account
exists, anyone who reaches the server can create one. The server only
accepts that from a loopback, private or link-local address, but
without `--trusted-proxy` every request through the proxy comes from the
proxy's own (private) address, so the rule cannot help there.

Exposing the server beyond the LAN through a proxy still means the
**proxy must add authentication** (forward-auth or basic auth). The
server's [access control](#security) only guards writes: reads and
control calls stay free, so an exposed server without proxy
authentication lets anyone read the setup and press buttons. Configure
authentication for both HTTP requests and WebSocket upgrades, and ensure
your clients support the proxy's authentication method.

With proxy basic auth, the proxy forwards the client's `Authorization:
Basic ...` header. The server ignores any `Authorization` scheme other
than `Bearer`: it counts as no credential, never as a wrong one, so
reads and control keep working through the proxy. An
integration that must send basic auth to the proxy puts its server token
in `X-Sofabaton-Token: sbx_...` instead of `Authorization: Bearer`.
Forward-auth (Authelia and similar) uses its own cookies; you then sign
in twice, once at the proxy and once in the control panel.

## Settings

Defaults, then `server.json` in the data directory, then environment
variables, then flags; each layer overrides the one before.

| flag | environment | default | meaning |
| --- | --- | --- | --- |
| `--bind` | `SOFABATON_BIND` | `0.0.0.0` | address to listen on |
| `--port` | `SOFABATON_PORT` | `8480` | API port |
| `--data-dir` | `SOFABATON_DATA_DIR` | `./data` | `server.json`, `hubs.json`, `auth.json`, `mqtt.json` |
| `--hub HOST` (repeatable) | `SOFABATON_HUBS=a,b` | none | hubs registered on first start, only when `hubs.json` does not exist |
| `--advertise-url` | `SOFABATON_ADVERTISE_URL` | none | public base URL behind a reverse proxy; published as mDNS TXT `base_url` and as the OpenAPI `servers[0].url` |
| `--root-path` | `SOFABATON_ROOT_PATH` | none | path prefix a reverse proxy mounts the API under |
| `--trusted-proxy ADDR` (repeatable) | `SOFABATON_TRUSTED_PROXIES=a,b` | none | sources whose `X-Forwarded-*` headers are honoured |
| `--allowed-origin ORIGIN` (repeatable) | `SOFABATON_ALLOWED_ORIGINS=a,b` | none | browser origins on another host or port (a dashboard such as `http://nas:8123`) whose pages may call the API; exact origins, no path, no wildcard; see [Browser origins](#browser-origins). Also `allowed_origins` in `server.json`, and editable in the control panel |
| `--tls-cert` / `--tls-key` | `SOFABATON_TLS_CERT` / `_KEY` | none | bring your own certificate (a reverse proxy is the usual way) |
| `--callback-host` | `SOFABATON_CALLBACK_HOST` | routed local IP per hub | IPv4 address the hubs call back on for callback devices (see [button events](api-reference.md#button-events)); set the host's LAN address inside a container on a bridge network |
| `--callback-port` | `SOFABATON_CALLBACK_PORT` | `8060` | port of the callback listener; the X1 can call no other |
| `--hub-listen-port` | `SOFABATON_HUB_LISTEN_PORT` | `8200` | TCP port the hubs connect back to, shared by every hub |
| `--app-discovery-port` | `SOFABATON_APP_DISCOVERY_PORT` | `8102` | UDP port the official app discovers and calls the proxies on; keep it for iOS |
| no flag (`server.json`: `apply_keep`) | `SOFABATON_APPLY_KEEP` | `20` | retained terminal apply records per hub, including stopped/cancelled ones |
| no flag (`server.json`: `update_check`) | `SOFABATON_UPDATE_CHECK` | `false` | check PyPI once a day for a newer server release, see [Update check](#update-check); the control panel's Server page writes it |
| `--log-level` | `SOFABATON_LOG_LEVEL` | `info` | |
| `--mqtt-host` | `SOFABATON_MQTT_HOST` | none | the MQTT broker an X2 publishes button presses to (the one set in the Sofabaton app); setting it offers the `mqtt` transport for X2 hubs, see [MQTT](api-reference.md#mqtt) |
| `--mqtt-port` | `SOFABATON_MQTT_PORT` | `1883`, `8883` with TLS | broker port |
| `--mqtt-username` | `SOFABATON_MQTT_USERNAME` | none | broker user name |
| `--mqtt-password` | `SOFABATON_MQTT_PASSWORD` | none | broker password; prefer the environment variable or the file, a flag shows in the process list |
| `--mqtt-password-file` | `SOFABATON_MQTT_PASSWORD_FILE` | none | file whose first line is the password (Docker and Kubernetes secrets) |
| `--mqtt-tls` | `SOFABATON_MQTT_TLS=true` | off | connect over TLS |
| `--mqtt-tls-ca` | `SOFABATON_MQTT_TLS_CA` | system store | CA certificate file to verify the broker with |
| `--mqtt-tls-insecure` | `SOFABATON_MQTT_TLS_INSECURE=true` | off | do not verify the broker's certificate |
| `--mqtt-client-id` | `SOFABATON_MQTT_CLIENT_ID` | `sofabaton-x-server-<random>` | MQTT client id |

The broker can be set in two places:

- **The control panel**, under **Server settings → MQTT broker**, once
  [access is set up](#set-up-access). Only the signed-in admin can change
  or test it (never a token). The panel stores it in `mqtt.json` in the
  data directory, with owner-only permissions where the filesystem supports
  them; on Windows or shared volumes, restrict access to that directory.
  **The password is
  stored in plain text there**: the server has to present it to the
  broker, so it cannot be hashed, and backups of the data directory
  contain it. Changes apply at once, no restart. Changing where the
  password is sent (host, port, user name, TLS, CA file, certificate
  check) without entering it again drops the stored password, so it never
  goes to a new place by itself. **Test connection** tries the settings
  without saving them.
- **These flags and environment variables.** When any of them is set,
  they own the broker: `mqtt.json` is ignored and the panel shows the
  settings read-only. Use them, with `--mqtt-password-file` or the
  environment, to keep the password out of the server's data directory.

`server.json` never carries the broker (a file that does stops the server
with a message saying so). The password is in nothing the server prints,
logs or serves: `--print-settings` says `mqtt_password_set`,
`GET /server/mqtt` and `GET /server/mqtt/config` have no password field
(the latter says `password_set`).

For example, save this as `server.json` in the selected data directory:

```json
{
  "port": 8480,
  "callback_port": 8060,
  "initial_hubs": ["192.168.1.50"],
  "apply_keep": 20,
  "log_level": "info"
}
```

Choose that directory with `--data-dir` or `SOFABATON_DATA_DIR` before the
file is loaded. An existing empty `hubs.json` is respected: seed hubs are
not re-added. `--print-settings` prints effective settings and exits.
`--reset-password` sets a new admin password and exits; see
[Recovery](#recovery).

The three host-side ports (`hub_listen_port`, `app_discovery_port`,
`callback_port`) are also editable from the control panel's Server page,
over `GET /server/settings` and `PUT /server/settings`. A change is
written to `server.json` and applies on the next start. A port set by an
environment variable or a flag wins over the file, so it shows as pinned
and the API refuses to change it (409 `setting_pinned`). The server ports
replace the per-hub `hub_listen_port` / `app_discovery_port` values: one
listener serves every hub.

`allowed_origins` goes through the same routes and the same pinning, and
the control panel edits it under **Server settings → Access**. Unlike the
ports it applies at once, with no restart. A value that is not a bare
origin is refused with `422 invalid_origin`.

## Security

The server is a LAN service. Anyone who can reach its port can read the
hub configuration and use the remote. Changing the configuration can be
limited to people and integrations you trust with an admin account and
write tokens. The API uses these access classes:

| class | what | needs |
| --- | --- | --- |
| read | `GET`/`HEAD` except the admin routes below, and the `/api/v1/events` stream | nothing |
| control | start or stop an activity, send a command, find remote, resync remote, play an IR payload, the discovery scan | nothing |
| public | access setup, sign-in and sign-out | setup/login validate the submitted account details; setup is local-network only |
| write | edits and their plan previews, snapshot refresh, backup, restore, erase, IR learn, hub registration, enable/disable and the app-proxy switch, server settings and update checks, Wifi Devices and the callback device, job cancel, apply records, the web remote's layout | a token or the control panel's sign-in, once access is set up |
| admin | account changes, token/session management (including their lists), and MQTT broker changes/removal/tests | the control panel's sign-in; a token is refused (`403 admin_required`); unavailable before access setup (`409 not_claimed`) |

**Access setup is optional.** A new installation, or one upgraded from
0.2.1 or earlier, has no admin account: existing configuration writes
remain open to anyone on the network, and the panel shows a banner saying
so. The browser-origin checks below apply even before setup. Admin-only
features, including panel-managed MQTT configuration, require setup first.

Configuration writes are logged with the caller's address and who made them (`by
token 'Hubitat'`, `by admin`, or `by anyone (unclaimed)`). Token secrets,
the `Authorization` header and the cookie are never logged.
Configuration writes run as jobs whose records name the operation;
transient control and IR play calls return their acceptance immediately.

### Set up access

Open the control panel and choose **Set up access** in the banner, or
open **Server settings → Access** from the cog menu. Pick a username and
a password (at least 8 characters). From then on:

- The panel shows a sign-in screen until someone signs in. With
  **Remember me** the sign-in lasts 90 days and renews itself with use;
  without it, it ends when the browser closes, or after 12 hours without
  a request.
- Writes need a [token](#tokens) or the panel's sign-in. Reads and
  control stay free, so the web remote and control-only integrations
  keep working with no change.
- The mDNS record carries `auth=1` and `GET /api/v1/server` reports
  `auth.claimed: true`, so integrations know to ask for a token.

Setting up access is only accepted from a loopback, private or
link-local client address (`403 setup_local_only` otherwise). Behind a
reverse proxy, [set it up before you expose the server](#behind-a-reverse-proxy-tls).

**Server settings → Access** also changes the username and password (the
current password is required; every other signed-in browser is signed
out), lists the signed-in browsers and signs out the others. Failed
sign-ins from one address are slowed down after five attempts, with a
wait that doubles up to 60 seconds; there is no lockout.

The sign-in is a cookie named `sbx_session_<install id>`, `HttpOnly`,
`SameSite=Strict`, limited to the API path (`<root path>/api/`), and
`Secure` whenever the browser reached the server over https (built-in
TLS, or a trusted proxy's `X-Forwarded-Proto`). Browsers share cookies
between ports of one host, so another web application on the same host
(Home Assistant on `nas:8123`, say) receives it on its own `/api/`
requests. Its scripts cannot read it, and the server stores only a hash.

### Tokens

Integrations (the Hubitat example, scripts, a platform app) write with a
token. In **Server settings → Access**, choose **Create token** and give
it a name that says what it is for. The token (`sbx_...`) is shown
**once**, with a ready-made `curl` line; copy it into the integration
right away. Tokens never expire. Rename or revoke them in the same list,
which shows each token's last four characters and when it was last used.
A revoked token stops working at once.

Send the token on every write:

```sh
curl -X PUT -H "Authorization: Bearer sbx_..." -H "Content-Type: application/json" \
  -d '{"name": "Living room"}' http://<server>:8480/api/v1/hubs/<hub id>/name
```

When a reverse proxy's basic auth already occupies the `Authorization`
header, send `X-Sofabaton-Token: sbx_...` instead. A token can make
configuration writes but cannot manage the admin account, tokens,
sessions or MQTT broker settings: those need the panel's sign-in.
A leaked integration token cannot mint more tokens or lock you out.
Tokens, the password and sessions are stored
hashed in `auth.json` in the data directory.

### Browser origins

For requests other than `GET`, `HEAD` and `OPTIONS`, the server checks
the browser's `Origin` header when present. It refuses the request
(`403 cross_origin_refused`)
unless the origin is the server itself (the host and port the request
was sent to, or `--advertise-url`'s origin) or is listed in
`allowed_origins`. This applies to control calls too, so a web page you
happen to visit cannot start an activity or erase a hub behind your back.
Clients that are not browsers send no `Origin` and are not affected.

A dashboard on another origin that should call the API from its page
(for example a Home Assistant or Node-RED dashboard at
`http://nas:8123`) needs its exact origin in `allowed_origins`: scheme,
host and port, no path, no wildcard. Add it in **Server settings →
Access** (applies at once), in `server.json`, with
`SOFABATON_ALLOWED_ORIGINS=a,b` or with `--allowed-origin` (repeatable;
the last two pin the value, and the panel then shows it read-only).
A listed origin gets CORS headers, without credentials: its pages can
read and use control calls, and once access is set up can write only
with a token. The server ignores the panel's session cookie on these
writes, even on the same host. Unlisted origins get no
CORS headers. Framing the [web remote](web-remote.md) in a dashboard
needs none of this: the framed page is the server's own.

### Recovery

Forgot the password? On the server's host, run:

```sh
sofabaton-x-server --data-dir <data directory> --reset-password
```

It prints a new generated password for the existing username, signs
every browser out, keeps every token, and exits. It works while the
server runs: the server notices the changed file. The server stays set
up throughout, so writes are never open in between. In Docker the image
already sets the data directory:

```sh
docker exec sofabaton-x-server sofabaton-x-server --reset-password
```

(`sofabaton-x-server` first is the container name from the examples
above; use yours.)

Sign in with the printed password and change it under **Server settings
→ Access**. As a last resort, stopping the server and deleting
`auth.json` from the data directory removes the admin account, the tokens
and the sessions: the server is then unclaimed and writes are open again
until someone sets up access.

### What access control does not cover

- **The hub itself.** Anyone on the LAN can still change or erase a hub
  directly with the official Sofabaton app, or through the server's app
  proxy. The server guards the server, not the hub.
- **Plain HTTP.** Tokens and the sign-in cookie cross the network in the
  clear. Use `--tls-cert` / `--tls-key` or a
  [TLS reverse proxy](#behind-a-reverse-proxy-tls) where that matters.
- **Reads and control.** They stay free by design. Do not expose the
  server beyond your LAN; never through NAT or an internet-facing
  reverse proxy without the proxy adding authentication.
- **DNS rebinding.** A web page that points its own host name at the
  server's LAN address passes the origin check. It can then read and use
  control calls. Once access is set up, it cannot make configuration
  writes without a token or session; the sign-in cookie belongs to the
  server's real host name. An unclaimed server still allows writes. Many
  routers and DNS filters refuse such answers.

## Storage and upgrades

Keep the server running whenever you want browser control, integrations or
access through the official-app proxy. Stop it cleanly before restarting
or upgrading, and let any hub operation finish first.

The default data directory is `./data`, relative to the directory from
which you start the server. Use `--data-dir` with a fixed directory for a
persistent installation, and reuse that directory on every start. Docker
uses `/data` inside the container; keep the mounted host directory when
replacing the container.

The data directory holds hub registrations, server settings, the admin
account and write tokens (`auth.json`), the MQTT broker set in the panel
with its password in plain text (`mqtt.json`), saved remote layouts, cached hub
data and retained configuration-write records. Copy it
while the server is stopped when moving the installation or saving its
state. **It is not a hub backup.** Use **Backup → Make** and download the
result to keep a restorable copy of the hub, including command payloads.
The server does not maintain a backup archive.

Before upgrading, read the [changelog and upgrade notes](../CHANGELOG.md),
save a hub backup, and retain a copy of the server's data directory. Stop
the server, install the selected release in the same Python environment
(or rebuild the Docker image), then restart with the same data directory
and settings. Confirm your hubs reconnect and test the web remote.

For the 0.2.2 release, after stopping the server:

```sh
python -m pip install --upgrade "sofabaton-x-server>=0.2.2,<0.3"
```

This also installs `sofabaton-x>=0.2.2,<0.3`. Existing registrations,
callback devices and saved layouts require no manual conversion. Reload
open browser pages after restarting. Integrations should regenerate
clients from the new OpenAPI document; the API prefix remains `/api/v1`.

From 0.2.2 the server can require tokens for writes (see
[Security](#security)). Existing configuration writes stay open until you
set up access; after that integrations that write need a token. The new
[browser-origin checks](#browser-origins) apply immediately on upgrade,
including to control calls and unclaimed servers. List the origins of
browser clients that call the API directly; embedding the server's web
remote in an iframe needs no change.

### Update check

The server can tell you when a newer release is on PyPI; it never
installs one. On the control panel's Server page, **Check for updates**
performs one check, and **Automatically check once a day** turns on a
daily check (`update_check` in `server.json`; `SOFABATON_UPDATE_CHECK=true`
in the environment sets it too, and then pins it). Off by default: the
server then makes no update-related request on its own, not at startup
and not when the panel opens, and the button enables nothing.

A check fetches the project's public release list from
[PyPI's JSON API](https://docs.pypi.org/api/json/) and compares versions
locally. Nothing about the installation is sent: no hub information, no
configuration, not the installed version, no identifier. Pre-releases and
yanked releases never count. The outcome is kept in `update-check.json`
in the data directory, so a restart keeps the last-checked time and the
daily cadence (an hour after a failed check, a day after a good one).

The status is one of not checked, no newer release found as of the last
check, update available (with links to the changelog, the upgrade steps
above and the release on PyPI) and could not check. A failed check never
reads as up to date. A found update shows as a dot on the panel's cog
menu and a badge on its Server entry.

Over the API: `GET /server/updates` reports the last check and the
schedule, `POST /server/updates/check` performs one check now, and `PUT
/server/updates` with `{"automatic": true}` or `false` sets the daily
check (409 `setting_pinned` when the environment set it). `GET /server`
carries the same block as `update`, and a finished check is announced on
the event stream as a `server_event` of kind `update_check` with an empty
`hub_id`.

For connection problems, start with the
[setup troubleshooting table](getting-started.md#if-something-does-not-work).

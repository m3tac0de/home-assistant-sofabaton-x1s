# Running Sofabaton X Server

Installation, deployment and settings for the computer hosting the server.
For your first setup, follow [Getting started](getting-started.md).

[Install](#run) · [Docker](#docker) · [Reverse proxy](#behind-a-reverse-proxy-tls) ·
[Settings](#settings) · [Security](#security) · [Storage and upgrades](#storage-and-upgrades)

## Run

**Run one server for all your hubs.** Register each hub in its control
panel; all hubs share the same server URL and WebSocket endpoint.

**Close the official Sofabaton app on all phones/tablets before initial
setup.** A hub connected directly to the app stops advertising, so the
server cannot discover it. Keep the app closed until the hub is registered
and you have tested control. Disable any existing proxy for that hub first.

Install from PyPI (Python 3.11+; the library comes with it):

```
python -m pip install "sofabaton-x-server>=0.2.1,<0.3"
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
`effective_destination`. `/data` holds `hubs.json`, `server.json`, one
`state-<hub_id>.json` cache document per hub, and the [apply records](api-reference.md#recovery-and-retention).

### Behind a reverse proxy (TLS)

Terminate TLS in a reverse proxy; that is where certificates are
manageable. Three things to set on the server, then a snippet per proxy.

- `--advertise-url https://sofabaton.home.example`: what clients must
  use. Published in the mDNS TXT record as `base_url` and as the OpenAPI
  document's server URL, so discovery and generated clients both point
  at the proxy.
- `--trusted-proxy 127.0.0.1` (or the proxy's address): honours
  `X-Forwarded-*` from that source, so control-call logs show the real
  client and redirects keep the public scheme.
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

Exposing the server beyond the LAN through a proxy means the **proxy
must add authentication** (forward-auth or basic auth): the server has
none in v1. Configure authentication for both HTTP requests and WebSocket
upgrades, and ensure your clients support the proxy's authentication method.

## Settings

Defaults, then `server.json` in the data directory, then environment
variables, then flags; each layer overrides the one before.

| flag | environment | default | meaning |
| --- | --- | --- | --- |
| `--bind` | `SOFABATON_BIND` | `0.0.0.0` | address to listen on |
| `--port` | `SOFABATON_PORT` | `8480` | API port |
| `--data-dir` | `SOFABATON_DATA_DIR` | `./data` | `server.json`, `hubs.json` |
| `--hub HOST` (repeatable) | `SOFABATON_HUBS=a,b` | none | hubs registered on first start, only when `hubs.json` does not exist |
| `--advertise-url` | `SOFABATON_ADVERTISE_URL` | none | public base URL behind a reverse proxy; published as mDNS TXT `base_url` and as the OpenAPI `servers[0].url` |
| `--root-path` | `SOFABATON_ROOT_PATH` | none | path prefix a reverse proxy mounts the API under |
| `--trusted-proxy ADDR` (repeatable) | `SOFABATON_TRUSTED_PROXIES=a,b` | none | sources whose `X-Forwarded-*` headers are honoured |
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

The `mqtt` settings are flags and environment variables **only**. They
hold a secret, so `server.json` never carries them (a file that does stops
the server with a message saying so), the control panel cannot write them,
and the password is in nothing the server prints, logs or serves:
`--print-settings` says `mqtt_password_set`, `GET /server/mqtt` has no
password field.

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

The three host-side ports (`hub_listen_port`, `app_discovery_port`,
`callback_port`) are also editable from the control panel's Server page,
over `GET /server/settings` and `PUT /server/settings`. A change is
written to `server.json` and applies on the next start. A port set by an
environment variable or a flag wins over the file, so it shows as pinned
and the API refuses to change it (409 `setting_pinned`). The server ports
replace the per-hub `hub_listen_port` / `app_discovery_port` values: one
listener serves every hub.

## Security

**No authentication in v1.** The server is a LAN service in the same
class as the hub protocol it fronts: anyone who can reach the port can
read the catalogs, send commands and change the hub's
configuration, including `POST /hubs/{id}/erase` and a replacing
restore. Do not expose it beyond your LAN; never through NAT or an
internet-facing reverse proxy without the proxy adding authentication.
Control calls are logged with the caller's address. Configuration writes
run as jobs whose records name the operation; transient control and IR
play calls return their acceptance immediately.

## Storage and upgrades

Keep the server running whenever you want browser control, integrations or
access through the official-app proxy. Stop it cleanly before restarting
or upgrading, and let any hub operation finish first.

The default data directory is `./data`, relative to the directory from
which you start the server. Use `--data-dir` with a fixed directory for a
persistent installation, and reuse that directory on every start. Docker
uses `/data` inside the container; keep the mounted host directory when
replacing the container.

The data directory holds hub registrations, server settings, saved remote
layouts, cached hub data and retained configuration-write records. Copy it
while the server is stopped when moving the installation or saving its
state. **It is not a hub backup.** Use **Backup → Make** and download the
result to keep a restorable copy of the hub, including command payloads.
The server does not maintain a backup archive.

Before upgrading, read the [changelog and upgrade notes](../CHANGELOG.md),
save a hub backup, and retain a copy of the server's data directory. Stop
the server, install the selected release in the same Python environment
(or rebuild the Docker image), then restart with the same data directory
and settings. Confirm your hubs reconnect and test the web remote.

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

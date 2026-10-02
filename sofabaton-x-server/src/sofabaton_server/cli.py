"""``sofabaton-x-server``: parse flags, compose settings, run uvicorn.

Flags mirror the environment variables (``SOFABATON_<FIELD>``) and win
over them; both win over ``server.json`` in the data directory.
"""

from __future__ import annotations

import argparse
import logging
import ssl
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional, Sequence

from . import __version__
from .config import DEFAULT_PORT, Settings, load_settings

if TYPE_CHECKING:
    from .tls import CertificateReloader


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="sofabaton-x-server",
        description="REST + WebSocket server over the sofabaton-x library.",
    )
    ap.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    ap.add_argument("--bind", help="address to listen on (default 0.0.0.0)")
    ap.add_argument("--port", type=int, help=f"API port (default {DEFAULT_PORT})")
    ap.add_argument("--data-dir", type=Path, help="directory for server.json and hubs.json (default ./data)")
    ap.add_argument(
        "--hub",
        action="append",
        dest="initial_hubs",
        metavar="HOST",
        help="hub host to register on first start (repeatable; only when hubs.json does not exist)",
    )
    ap.add_argument(
        "--advertise-url",
        help="public base URL clients should use (behind a reverse proxy); published in mDNS and OpenAPI",
    )
    ap.add_argument("--root-path", help="path prefix the reverse proxy mounts the API under")
    ap.add_argument(
        "--trusted-proxy",
        action="append",
        dest="trusted_proxies",
        metavar="ADDR",
        help="proxy address/CIDR whose X-Forwarded-* headers are trusted (repeatable)",
    )
    ap.add_argument(
        "--allowed-origin",
        action="append",
        dest="allowed_origins",
        metavar="ORIGIN",
        help="browser origin on another host/port allowed to use the API from a page, e.g. http://nas:8123 (repeatable)",
    )
    ap.add_argument("--tls-cert", type=Path, help="certificate file (bring your own TLS; a reverse proxy is the usual way)")
    ap.add_argument("--tls-key", type=Path, help="private key file for --tls-cert")
    ap.add_argument(
        "--callback-host",
        help="IPv4 address the hubs call back on for callback devices (default: the routed local IP per hub; "
             "set the host's LAN address inside a container on a bridge network)",
    )
    ap.add_argument("--callback-port", type=int, help="port the callback listener binds (default 8060; the X1 can call no other)")
    ap.add_argument("--hub-listen-port", type=int,
                    help="TCP port the hubs connect back to, shared by every hub (default 8200)")
    ap.add_argument("--app-discovery-port", type=int,
                    help="UDP port the official app discovers and calls the proxies on (default 8102; keep it for iOS)")
    mqtt = ap.add_argument_group(
        "MQTT (X2 Wifi Devices)",
        "The broker an X2 publishes button presses to, the one set in the Sofabaton app. Also settable in the "
        "control panel (stored in mqtt.json); any of these flags or SOFABATON_MQTT_* variables override that and make "
        "the panel read-only. Never read from or written to server.json. Prefer the environment or "
        "--mqtt-password-file for the password; a flag is visible in the process list.",
    )
    mqtt.add_argument("--mqtt-host", help="broker address; setting it offers the mqtt transport for X2 hubs")
    mqtt.add_argument("--mqtt-port", type=int, help="broker port (default 1883, 8883 with --mqtt-tls)")
    mqtt.add_argument("--mqtt-username", help="broker user name")
    mqtt.add_argument("--mqtt-password", help="broker password (better: SOFABATON_MQTT_PASSWORD or --mqtt-password-file)")
    mqtt.add_argument("--mqtt-password-file", type=Path, help="file whose first line is the broker password (container secrets)")
    mqtt.add_argument("--mqtt-tls", action="store_true", default=None, help="connect over TLS")
    mqtt.add_argument("--mqtt-tls-ca", type=Path, help="CA certificate file to verify the broker with (default: the system store)")
    mqtt.add_argument("--mqtt-tls-insecure", action="store_true", default=None, help="do not verify the broker's certificate")
    mqtt.add_argument("--mqtt-client-id", help="MQTT client id (default: sofabaton-x-server-<random>)")
    ap.add_argument("--log-level", choices=("debug", "info", "warning", "error"), help="log level (default info)")
    ap.add_argument("--print-settings", action="store_true", help="print the effective settings as JSON and exit")
    ap.add_argument(
        "--reset-password",
        action="store_true",
        help="set a new generated admin password, print it, sign every browser out and exit "
             "(the username and the tokens are kept; works while the server runs)",
    )
    return ap


def settings_from_args(args: argparse.Namespace) -> Settings:
    cli: dict[str, Any] = {
        "bind": args.bind,
        "port": args.port,
        "data_dir": args.data_dir,
        "initial_hubs": tuple(args.initial_hubs) if args.initial_hubs else None,
        "advertise_url": args.advertise_url,
        "root_path": args.root_path,
        "trusted_proxies": tuple(args.trusted_proxies) if args.trusted_proxies else None,
        "allowed_origins": tuple(args.allowed_origins) if args.allowed_origins else None,
        "tls_cert": args.tls_cert,
        "tls_key": args.tls_key,
        "log_level": args.log_level,
        "callback_host": args.callback_host,
        "callback_port": args.callback_port,
        "hub_listen_port": args.hub_listen_port,
        "app_discovery_port": args.app_discovery_port,
        "mqtt_host": args.mqtt_host,
        "mqtt_port": args.mqtt_port,
        "mqtt_username": args.mqtt_username,
        "mqtt_password": args.mqtt_password,
        "mqtt_password_file": args.mqtt_password_file,
        "mqtt_tls": args.mqtt_tls,
        "mqtt_tls_ca": args.mqtt_tls_ca,
        "mqtt_tls_insecure": args.mqtt_tls_insecure,
        "mqtt_client_id": args.mqtt_client_id,
    }
    return load_settings(cli=cli)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = settings_from_args(args)
    except ValueError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    if args.reset_password:
        return _reset_password(settings)

    if args.print_settings:
        import json

        print(json.dumps(settings.to_dict(), indent=2))
        return 0

    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    import uvicorn

    from .app import create_app

    tls_reloader = None
    if settings.tls_cert and settings.tls_key:
        from .tls import CertificateReloader

        try:
            tls_reloader = CertificateReloader(settings.tls_cert, settings.tls_key)
        except (OSError, ssl.SSLError, ValueError) as err:
            print(f"error: cannot load the TLS certificate ({settings.tls_cert}, {settings.tls_key}): {err}",
                  file=sys.stderr)
            return 2

    app = create_app(settings, tls_reloader=tls_reloader)
    uvicorn.run(
        app,
        host=settings.bind,
        port=settings.port,
        log_level=settings.log_level,
        # Forwarded headers are honoured only from the operator's proxies
        # (plan section 8); with none configured they are ignored.
        proxy_headers=bool(settings.trusted_proxies),
        forwarded_allow_ips=",".join(settings.trusted_proxies) or None,
        **tls_kwargs(settings, tls_reloader),
    )
    return 0


def tls_kwargs(settings: Settings, reloader: Optional["CertificateReloader"]) -> dict[str, Any]:
    """uvicorn's TLS arguments. With a reloader, uvicorn serves with the
    reloader's context (``ssl_context_factory``, uvicorn 0.47+), so a
    renewed certificate is picked up without a restart; the file
    arguments stay set because uvicorn reads them to decide it is https.
    An older uvicorn gets the files only and a warning."""

    if reloader is None:
        return {}
    kwargs: dict[str, Any] = {"ssl_certfile": str(settings.tls_cert), "ssl_keyfile": str(settings.tls_key)}
    import inspect

    import uvicorn

    if "ssl_context_factory" in inspect.signature(uvicorn.Config.__init__).parameters:
        kwargs["ssl_context_factory"] = reloader.ssl_context_factory
    else:
        logging.getLogger(__name__).warning(
            "tls: this uvicorn (%s) cannot take the server's certificate context; a renewed certificate "
            "needs a restart (uvicorn 0.47 or newer reloads it)", getattr(uvicorn, "__version__", "?"))
    return kwargs


def _reset_password(settings: Settings) -> int:
    """Only the data directory matters here: nothing starts, no port opens."""

    from .auth import AuthError, AuthStore

    store = AuthStore(settings.data_dir)
    try:
        password = store.reset_password()
    except AuthError as err:
        print(f"error: {err} (in {store.path})", file=sys.stderr)
        return 1
    print(f"New password for {store.username!r}: {password}")
    print("Every browser was signed out; tokens are unchanged. Change the password in the control panel.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

#!/usr/bin/env python3
"""sofabaton CLI — discover hubs and drive a proxy interactively.

``sofabaton discover``  one-shot mDNS scan for hubs.
``sofabaton run``       start a proxy and open an interactive shell.

The shell is a thin UI over :class:`AsyncX1Proxy`: it reads input on the
executor so the event loop keeps running, so live hub/app/activity
events print as they happen, and every command maps to a facade call.
"""

import argparse
import asyncio
import logging
import sys
from typing import Awaitable, Callable, Dict, Optional

from .aio import AsyncX1Proxy, async_discover_hubs
from .hub_versions import HVER_BY_HUB_VERSION
from .protocol_const import BUTTONNAME_BY_CODE, ButtonName

# ----------------- helpers -----------------


def parse_int(s: str) -> int:
    """Parse decimal or 0x..."""
    s = s.strip()
    if s.lower().startswith("0x"):
        return int(s, 16)
    return int(s, 10)


def resolve_button(code_or_name: str) -> int | None:
    """Accept either numeric (e.g. 0xB0) or name (e.g. OK)."""
    try:
        return parse_int(code_or_name)
    except ValueError:
        pass
    upper = code_or_name.upper()
    if hasattr(ButtonName, upper):
        return getattr(ButtonName, upper)
    for code, name in BUTTONNAME_BY_CODE.items():
        if name.upper() == upper:
            return code
    return None


def _kv_list_to_dict(items) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for it in items or []:
        if "=" in it:
            k, v = it.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            out[it.strip()] = ""
    return out


def _parse_shell_args(rest: str) -> tuple[Optional[str], Dict[str, str], set[str]]:
    """Split a REPL argument string into (path, key=value opts, bare flags).

    Tokens shaped ``key=value`` land in the opts dict; a bare ``erase``
    token becomes a flag; the first remaining token is treated as the
    file path. This keeps ``backup``/``restore`` feeling like a CLI
    without pulling argparse into the interactive loop.
    """

    path: Optional[str] = None
    opts: Dict[str, str] = {}
    flags: set[str] = set()
    for tok in rest.split():
        if "=" in tok:
            key, value = tok.split("=", 1)
            opts[key.strip().lower()] = value.strip()
        elif tok.lower() == "erase":
            flags.add("erase")
        elif path is None:
            path = tok
    return path, opts, flags


def _parse_id_csv(value: Optional[str]) -> list[int]:
    """Parse ``5,7,0x0A`` into a de-duplicated list of 8-bit ids."""

    ids: list[int] = []
    for part in (value or "").split(","):
        part = part.strip()
        if not part:
            continue
        ident = parse_int(part) & 0xFF
        if ident and ident not in ids:
            ids.append(ident)
    return ids


def _bundle_entity_id(entry: Dict) -> int:
    """Read the source id off a bundle device/activity payload."""

    block = entry.get("device") if isinstance(entry, dict) else None
    return int((block or {}).get("device_id", 0)) & 0xFF


def _activity_referenced_device_ids(activity: Dict) -> set[int]:
    """Source device ids an activity payload points at (buttons/macros/favs).

    Mirrors the library's own reference walk so the CLI can warn when a
    selective restore would drop a device an activity still needs.
    """

    refs: set[int] = set()

    def _add(raw) -> None:
        try:
            value = int(raw) & 0xFF
        except (TypeError, ValueError):
            return
        if value and value != 0xFF:  # 0 = unset, 0xFF = delay sentinel
            refs.add(value)

    for row in activity.get("button_bindings") or []:
        if isinstance(row, dict):
            _add(row.get("device_id"))
            _add(row.get("long_press_device_id"))
    for row in activity.get("macros") or []:
        if isinstance(row, dict):
            for step in row.get("steps") or []:
                if isinstance(step, dict):
                    _add(step.get("device_id"))
    for row in activity.get("favorite_slots") or []:
        if isinstance(row, dict):
            _add(row.get("device_id"))
    return refs


def _filter_bundle(
    bundle: Dict, device_ids: list[int], activity_ids: list[int]
) -> Dict:
    """Return a copy of a hub_bundle keeping only the selected entities.

    An empty id list means "keep all" for that kind, so callers can
    subset devices, activities, or both. The bundle is plain JSON, so
    this is just list filtering — no library round-trip needed.
    """

    filtered = dict(bundle)
    devices = list(bundle.get("devices") or [])
    activities = list(bundle.get("activities") or [])
    if device_ids:
        devices = [d for d in devices if _bundle_entity_id(d) in device_ids]
    if activity_ids:
        activities = [a for a in activities if _bundle_entity_id(a) in activity_ids]
    filtered["devices"] = devices
    filtered["activities"] = activities
    return filtered


async def _ainput(prompt: str) -> Optional[str]:
    """Read a line without blocking the event loop. None on EOF."""

    def _read() -> Optional[str]:
        try:
            return input(prompt)
        except EOFError:
            return None

    return await asyncio.get_running_loop().run_in_executor(None, _read)


# ----------------- interactive shell -----------------


class AsyncShell:
    """A small REPL over :class:`AsyncX1Proxy`."""

    prompt = "x1> "

    def __init__(self, proxy: AsyncX1Proxy) -> None:
        self.p = proxy
        self._stop = False
        self._commands: Dict[str, Callable[[str], Awaitable[None]]] = {
            "help": self.cmd_help,
            "?": self.cmd_help,
            "status": self.cmd_status,
            "activities": self.cmd_activities,
            "devices": self.cmd_devices,
            "commands": self.cmd_commands,
            "buttons": self.cmd_buttons,
            "macros": self.cmd_macros,
            "favorites": self.cmd_favorites,
            "press": self.cmd_press,
            "send": self.cmd_press,  # alias
            "start": self.cmd_start,
            "stop": self.cmd_stop,
            "find": self.cmd_find,
            "proxy": self.cmd_proxy,
            "backup": self.cmd_backup,
            "restore": self.cmd_restore,
            "quit": self.cmd_quit,
            "exit": self.cmd_quit,
        }

        # Live events (delivered on the loop) print as they happen.
        proxy.on_hub_state_change(lambda up: print(f"\n[event] hub {'CONNECTED' if up else 'DISCONNECTED'}"))
        proxy.on_client_state_change(lambda up: print(f"\n[event] app {'CONNECTED' if up else 'GONE'}"))
        proxy.on_activity_change(
            lambda new, old, name: print(f"\n[event] activity -> {name or '?'} ({old} -> {new})")
        )

    # ----- read commands ----------------------------------------------------
    #
    # Browsing is for retrieving the (entity_id, command_id) pairs you send
    # with ``press``/``send``. IDs are shown as decimal ints throughout.

    async def _safe(self, label: str, coro):
        try:
            return await coro
        except (RuntimeError, TimeoutError) as err:
            print(f"[{label}] {err}")
            return None

    async def cmd_status(self, _args: str) -> None:
        p = self.p.sync
        acts, _ = p.get_activities(force_refresh=False)
        devs, _ = p.get_devices(force_refresh=False)
        print("== status ==")
        print(f"hub connected   : {p.transport.is_hub_connected}")
        print(f"app connected   : {p.transport.is_client_connected}")
        print(f"controllable    : {p.can_issue_commands()}")
        print(f"hub version     : {p.hub_version}")
        print(f"activities      : {len(acts)} cached")
        print(f"devices         : {len(devs)} cached")

    async def cmd_activities(self, _args: str) -> None:
        acts = await self._safe("activities", self.p.activities())
        if not acts:
            print("no activities (need control mode?)")
            return
        print("activity_id  active  name")
        for act_id, info in sorted(acts.items()):
            print(f"{act_id:<11}  {'*' if info.get('active') else ' ':^6}  {info.get('name', '')}")

    async def cmd_devices(self, _args: str) -> None:
        devs = await self._safe("devices", self.p.devices())
        if not devs:
            print("no devices (need control mode?)")
            return
        print("device_id  name  (brand)")
        for dev_id, info in sorted(devs.items()):
            print(f"{dev_id:<9}  {info.get('name', '?')}  ({info.get('brand', '')})")

    async def cmd_commands(self, args: str) -> None:
        if not args.strip():
            print("usage: commands <device_id>")
            return
        dev = parse_int(args)
        cmds = await self._safe("commands", self.p.commands(dev))
        if not cmds:
            print("no commands (need control mode?)")
            return
        print(f"send with: press {dev} <command_id>")
        for c in cmds:
            print(f"  command_id={c['command_id']:<5} {c['label']}")

    async def cmd_buttons(self, args: str) -> None:
        if not args.strip():
            print("usage: buttons <activity_or_device_id>")
            return
        ent = parse_int(args)
        btns = await self._safe("buttons", self.p.buttons(ent))
        if not btns:
            print("no buttons (need control mode?)")
            return
        print(f"send with: press {ent} <button_code>")
        for b in btns:
            target = ""
            if b.get("device_id") and b.get("command_id") is not None:
                target = f"   -> device_id={b['device_id']} command_id={b['command_id']}"
            print(f"  button_code={b['button_code']:<5} {b.get('name') or '':<10}{target}")

    async def cmd_macros(self, args: str) -> None:
        if not args.strip():
            print("usage: macros <activity_id>")
            return
        act = parse_int(args)
        macros = await self._safe("macros", self.p.macros(act))
        if not macros:
            print("no macros (need control mode?)")
            return
        print(f"send with: press {act} <command_id>")
        for m in macros:
            print(f"  command_id={m['command_id']:<5} {m.get('label') or ''}")

    async def cmd_favorites(self, args: str) -> None:
        if not args.strip():
            print("usage: favorites <activity_id>")
            return
        act = parse_int(args)
        favs = await self._safe("favorites", self.p.favorites(act))
        if not favs:
            print("no favorites (need control mode?)")
            return
        print("send with: press <device_id> <command_id>")
        for f in favs:
            print(f"  device_id={f['device_id']:<5} command_id={f['command_id']:<5} {f.get('label') or ''}")

    # ----- control commands -------------------------------------------------

    async def cmd_press(self, args: str) -> None:
        parts = args.split()
        if len(parts) != 2:
            print("usage: press <entity_id> <button_name_or_code>   (e.g. press 101 POWER_ON)")
            return
        ent = parse_int(parts[0])
        btn = resolve_button(parts[1])
        if btn is None:
            print(f"unknown button {parts[1]!r}")
            return
        ok = await self.p.press(ent, btn)
        print("sent" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_start(self, args: str) -> None:
        if not args.strip():
            print("usage: start <activity_id>")
            return
        ok = await self.p.start_activity(parse_int(args))
        print("started" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_stop(self, args: str) -> None:
        if not args.strip():
            print("usage: stop <activity_id>")
            return
        ok = await self.p.stop_activity(parse_int(args))
        print("stopped" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_find(self, _args: str) -> None:
        ok = await self.p.find_remote()
        print("sent find-remote" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_proxy(self, args: str) -> None:
        arg = args.strip().lower()
        if arg == "on":
            await self.p.enable_proxy()
            print("proxy enabled")
        elif arg == "off":
            await self.p.disable_proxy()
            print("proxy disabled")
        else:
            print("usage: proxy on|off")

    async def cmd_backup(self, args: str) -> None:
        import json

        path, opts, _flags = _parse_shell_args(args)
        path = path or "hub_backup.json"
        # device_ids=None backs up the whole hub; a list narrows to those
        # devices (the library omits activities for a device-only bundle).
        device_ids = _parse_id_csv(opts.get("devices"))
        if device_ids:
            print(f"backing up devices {device_ids} only (no activities)...")
        else:
            print("backing up the whole hub (this fetches every device + activity)...")
        bundle = await self._safe(
            "backup", self.p.backup_hub_bundle(device_ids=device_ids or None)
        )
        if bundle is None:
            return
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=2)
        print(
            f"wrote {path}: schema v{bundle['schema_version']}, "
            f"{len(bundle['devices'])} devices, {len(bundle['activities'])} activities, "
            f"complete={bundle['complete']}"
        )

    async def cmd_restore(self, args: str) -> None:
        import json

        path, opts, flags = _parse_shell_args(args)
        if not path:
            print(
                "usage: restore <file.json> [devices=ID,..] "
                "[activities=ID,..] [erase]"
            )
            return
        try:
            with open(path, encoding="utf-8") as fh:
                bundle = json.load(fh)
        except (OSError, ValueError) as err:
            print(f"cannot read {path}: {err}")
            return

        # Selective restore is just pruning the (plain-JSON) bundle before
        # handing it to the library; the restore engine is unchanged.
        device_ids = _parse_id_csv(opts.get("devices"))
        activity_ids = _parse_id_csv(opts.get("activities"))
        if device_ids or activity_ids:
            bundle = _filter_bundle(bundle, device_ids, activity_ids)
            kept_devices = {_bundle_entity_id(d) for d in bundle["devices"]}
            dangling: set[int] = set()
            for activity in bundle["activities"]:
                dangling |= _activity_referenced_device_ids(activity) - kept_devices
            if dangling:
                missing = ", ".join(str(d) for d in sorted(dangling))
                print(
                    f"warning: selected activities reference devices not in the "
                    f"restore set ({missing}); the hub may reject them — add them "
                    f"to devices=..."
                )
            print(
                f"restoring subset: {len(bundle['devices'])} device(s), "
                f"{len(bundle['activities'])} activity(ies)"
            )

        # erase first = "replace" semantics: wipe the hub's tables, then
        # lay the (possibly subset) bundle down on a clean slate.
        if "erase" in flags:
            print("erasing the hub's configuration first (wipes all devices + activities)...")
            erased = await self._safe("erase", self.p.erase_configuration())
            if not erased:
                print("erase failed or refused (need control mode) — restore aborted")
                return

        print(f"restoring {path} onto the hub...")
        result = await self._safe("restore", self.p.restore_hub_bundle(bundle))
        if result is not None:
            print("restore result:", result)

    # ----- meta -------------------------------------------------------------

    async def cmd_help(self, _args: str) -> None:
        print("commands:")
        print("  status                         hub/app state, version, cached counts")
        print("  activities | devices           list catalogs (-> ids)")
        print("  commands <dev>                 device commands (-> command_id)")
        print("  buttons <ent>                  buttons + their device/command mapping")
        print("  macros <act> | favorites <act> activity detail (-> device_id/command_id)")
        print("  press <ent> <id-or-button>     send a command/button (alias: send)")
        print("  start <act> | stop <act>       switch activity power")
        print("  find                           find-my-remote")
        print("  proxy on|off                   toggle pass-through")
        print("  backup [file] [devices=ID,..]  back up the hub (subset = devices only)")
        print("  restore <file> [devices=ID,..] [activities=ID,..] [erase]")
        print("                                 restore a bundle; optionally a subset / erase-first")
        print("  quit                           exit")
        print("\nBrowse to get (entity_id, command_id); send with: press <entity_id> <command_id>.")
        print("Reads/sends need control mode (no app attached through the proxy).")

    async def cmd_quit(self, _args: str) -> None:
        self._stop = True

    # ----- REPL loop --------------------------------------------------------

    async def loop(self) -> None:
        await self.cmd_help("")
        while not self._stop:
            line = await _ainput(self.prompt)
            if line is None:
                break
            line = line.strip()
            if not line:
                continue
            cmd, _, rest = line.partition(" ")
            handler = self._commands.get(cmd)
            if handler is None:
                print(f"unknown command {cmd!r}; type 'help'")
                continue
            try:
                await handler(rest.strip())
            except Exception as err:  # keep the shell alive on command errors
                print(f"error: {err}")


# ----------------- subcommands -----------------


def _main_discover(argv: list[str]) -> None:
    """One-shot mDNS scan for physical hubs (and optionally proxies).

    Synchronous on purpose: ``discover_hubs`` spins up its own ``Zeroconf``
    and blocks, which does not work inside a running asyncio loop.
    """

    ap = argparse.ArgumentParser(
        prog="sofabaton discover",
        description="Discover Sofabaton hubs on the local network via mDNS",
    )
    ap.add_argument("--timeout", type=float, default=5.0, help="scan duration in seconds (default 5)")
    ap.add_argument("--include-proxies", action="store_true", help="also list proxy advertisements")
    ap.add_argument("--json", action="store_true", help="emit one JSON object per hub")
    args = ap.parse_args(argv)

    # One-shot scan: the blocking discover_hubs is fine here (nothing else
    # runs on the loop). Imported at call time so it stays monkeypatchable.
    from .discovery import discover_hubs

    hubs = discover_hubs(timeout=args.timeout, include_proxies=args.include_proxies)
    if args.json:
        import json as _json

        for hub in hubs:
            print(
                _json.dumps(
                    {
                        "host": hub.host,
                        "port": hub.port,
                        "name": hub.name,
                        "mac": hub.mac,
                        "hub_version": hub.hub_version,
                        "is_proxy": hub.is_proxy,
                        "service_type": hub.service_type,
                        "txt": hub.txt,
                    }
                )
            )
        return

    if not hubs:
        print(f"no hubs found in {args.timeout:g}s")
        return
    print(f"{'host':15}  {'port':5}  {'ver':4}  {'proxy':5}  name")
    for hub in hubs:
        print(
            f"{hub.host:15}  {hub.port:5d}  {hub.hub_version or '?':4}  "
            f"{'yes' if hub.is_proxy else 'no':5}  {hub.name}"
        )


async def _main_run(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(
        prog="sofabaton run",
        description="Proxy a hub + interactive shell",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "ports: the proxy has two faces (see docs/networking.md).\n"
            "  hub-facing  --hub-ip / --hub-port (we CALL_ME the hub on UDP)\n"
            "              --hub-listen-port      (the hub connects back on TCP)\n"
            "  app-facing  --app-discovery-port   (the app finds + calls us on UDP)\n"
        ),
    )
    # The arguments you commonly touch.
    ap.add_argument("--hub-ip", help="the hub's IP; omit to auto-discover the first hub")
    ap.add_argument(
        "--hub-listen-port",
        type=int,
        default=8200,
        help="TCP port on THIS host the hub connects back to (change to avoid a port clash; default 8200)",
    )
    # Protocol-fixed ports you should rarely need to change.
    ap.add_argument(
        "--hub-port",
        type=int,
        default=8102,
        help="UDP port ON THE HUB we send CALL_ME to (protocol-fixed; default 8102)",
    )
    ap.add_argument(
        "--app-discovery-port",
        type=int,
        default=8102,
        help="UDP port on THIS host the app discovers/calls us on (keep 8102 for iOS; default 8102)",
    )
    ap.add_argument(
        "--hub-version",
        choices=["X1", "X1S", "X2"],
        help="hub model; confirmed from the connect banner, so only needed to force a guess before connect",
    )
    ap.add_argument("--mdns-txt", action="append", help="raw TXT kv pair, e.g. HVER=2 (repeatable)")
    ap.add_argument("--mdns-name", default="X1-HUB-PROXY")
    ap.add_argument("--disable-proxy", action="store_true", help="start with pass-through disabled")
    ap.add_argument(
        "--connect-timeout",
        type=float,
        default=40.0,
        help="seconds to wait for the hub to connect (the hub's CALL_ME cycle can take ~30s)",
    )
    ap.add_argument("--debug", action="store_true", help="verbose engine logging")
    ap.add_argument("--no-dump", dest="diag_dump", action="store_false")
    ap.add_argument("--no-parse", dest="diag_parse", action="store_false")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.WARNING,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    # The version is authoritative from the connect banner, so we do not
    # need mDNS to learn it. A scan is only needed to *pick* a hub when
    # --hub-ip is omitted; with an explicit hub we connect straight away.
    hub_version = args.hub_version  # explicit pre-connect guess (banner wins)

    if args.hub_ip:
        hub_ip = args.hub_ip
        mdns_instance = args.mdns_name
        mdns_txt = _kv_list_to_dict(args.mdns_txt)
        print(f"connecting to {hub_ip} (hub version is confirmed from the connect banner)")
    else:
        print("discovering hubs...")
        found = await async_discover_hubs(timeout=6.0)
        physical = [h for h in found if not h.is_proxy] or found
        if not physical:
            print("no hubs found; pass --hub-ip ADDRESS")
            return
        hub = physical[0]
        hub_ip = hub.host
        mdns_txt = dict(hub.txt)
        mdns_instance = hub.name
        if hub_version is None:
            hub_version = hub.hub_version
        print(f"using {hub.name} ({hub_version}) at {hub.host}")

    # Keep the advertisement's HVER consistent with any known version.
    if hub_version and "HVER" not in mdns_txt:
        mdns_txt["HVER"] = HVER_BY_HUB_VERSION[hub_version]

    proxy = AsyncX1Proxy(
        hub_ip=hub_ip,
        hub_port=args.hub_port,
        app_discovery_port=args.app_discovery_port,
        hub_listen_port=args.hub_listen_port,
        mdns_txt=mdns_txt,
        mdns_instance=mdns_instance,
        hub_version=hub_version,
        proxy_enabled=not args.disable_proxy,
        diag_dump=args.diag_dump,
        diag_parse=args.diag_parse,
    )

    async with proxy:
        print("proxy started; waiting for the hub...")
        if await proxy.wait_connected(timeout=args.connect_timeout):
            # Make the proxy discoverable so the official app can attach to
            # it. This reads the hub's connect banner (authoritative for the
            # version and name) and brings the mDNS advertisement up.
            await proxy.wait_until_discoverable(timeout=5.0)
            version = proxy.sync.hub_version
            mode = "control mode" if proxy.sync.can_issue_commands() else "observe mode — an app is attached"
            print(f"hub connected — version {version} ({mode})")
        else:
            print("hub not connected yet (the shell still works; events appear when it connects)")
        try:
            await AsyncShell(proxy).loop()
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass


_SUBCOMMANDS = ("run", "discover")


def main(argv: list[str] | None = None) -> None:
    """Entry point. ``run`` (default) opens the shell; ``discover`` scans."""

    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] in (["-h"], ["--help"]):
        print(
            "usage: sofabaton [run|discover] ...\n\n"
            "subcommands:\n"
            "  run       proxy a hub + interactive shell (default; see 'run -h')\n"
            "  discover  scan the LAN for Sofabaton hubs (see 'discover -h')"
        )
        return
    command = "run"
    if args and args[0] in _SUBCOMMANDS:
        command = args.pop(0)
    try:
        if command == "discover":
            _main_discover(args)  # sync: blocking zeroconf, no event loop
        else:
            asyncio.run(_main_run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

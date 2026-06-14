#!/usr/bin/env python3
"""sofapython CLI — discover hubs and drive a proxy interactively.

``sofapython discover``  one-shot mDNS scan for hubs.
``sofapython run``       start a proxy and open an interactive shell.

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
            "quit": self.cmd_quit,
            "exit": self.cmd_quit,
        }

        # Live events (delivered on the loop) print as they happen.
        proxy.on_hub_state_change(lambda up: print(f"\n[event] hub {'CONNECTED' if up else 'DISCONNECTED'}"))
        proxy.on_client_state_change(lambda up: print(f"\n[event] app {'CONNECTED' if up else 'GONE'}"))
        proxy.on_activity_change(
            lambda new, old, name: print(f"\n[event] activity -> {name or '?'} ({old} -> {new})")
        )

    # ----- read commands (facade-first, cached fallback in observe mode) ---

    async def _read(self, label: str, fresh, cached):
        try:
            return await fresh()
        except RuntimeError as err:
            print(f"[{label}] {err}; showing cached")
            return cached()
        except TimeoutError as err:
            print(f"[{label}] {err}")
            return None

    async def cmd_status(self, _args: str) -> None:
        p = self.p.sync
        acts, _ = p.get_activities(fetch_if_missing=False)
        devs, _ = p.get_devices(fetch_if_missing=False)
        print("== status ==")
        print(f"hub connected   : {p.transport.is_hub_connected}")
        print(f"app connected   : {p.transport.is_client_connected}")
        print(f"controllable    : {p.can_issue_commands()}")
        print(f"activities      : {len(acts)} cached")
        print(f"devices         : {len(devs)} cached")

    async def cmd_activities(self, _args: str) -> None:
        acts = await self._read(
            "activities",
            self.p.activities,
            lambda: self.p.sync.get_activities(fetch_if_missing=False)[0],
        )
        if not acts:
            print("no activities")
            return
        print("id   active  name")
        for act_id, info in sorted(acts.items()):
            print(f"{act_id:<4} {'*' if info.get('active') else ' ':^6}  {info.get('name', '')}")

    async def cmd_devices(self, _args: str) -> None:
        devs = await self._read(
            "devices",
            self.p.devices,
            lambda: self.p.sync.get_devices(fetch_if_missing=False)[0],
        )
        if not devs:
            print("no devices")
            return
        print("id   name (brand)")
        for dev_id, info in sorted(devs.items()):
            print(f"{dev_id:<4} {info.get('name', '?')} ({info.get('brand', '')})")

    async def cmd_commands(self, args: str) -> None:
        if not args.strip():
            print("usage: commands <device_id>")
            return
        dev = parse_int(args)
        cmds = await self._read(
            "commands",
            lambda: self.p.commands(dev),
            lambda: self.p.sync.get_commands_for_entity(dev, fetch_if_missing=False)[0],
        )
        if not cmds:
            print("no commands")
            return
        for code, label in sorted(cmds.items()):
            print(f"  0x{code:04X}  {label}")

    async def cmd_buttons(self, args: str) -> None:
        if not args.strip():
            print("usage: buttons <activity_or_device_id>")
            return
        ent = parse_int(args)
        btns = await self._read(
            "buttons",
            lambda: self.p.buttons(ent),
            lambda: self.p.sync.get_buttons_for_entity(ent, fetch_if_missing=False)[0],
        )
        if not btns:
            print("no buttons")
            return
        for b in btns:
            print(f"  {b:3d} ({BUTTONNAME_BY_CODE.get(b, f'0x{b:02X}')})")

    async def cmd_macros(self, args: str) -> None:
        if not args.strip():
            print("usage: macros <activity_id>")
            return
        act = parse_int(args)
        macros = await self._read(
            "macros",
            lambda: self.p.macros(act),
            lambda: self.p.sync.get_macros_for_activity(act, fetch_if_missing=False)[0],
        )
        if not macros:
            print("no macros")
            return
        for m in macros:
            print(f"  {m.get('label', '')} (id={m.get('command_id')})")

    async def cmd_favorites(self, args: str) -> None:
        if not args.strip():
            print("usage: favorites <activity_id>")
            return
        act = parse_int(args)
        try:
            favs = await self.p.favorites(act)
        except (RuntimeError, TimeoutError) as err:
            print(f"[favorites] {err}")
            return
        if not favs:
            print("no favorites")
            return
        print("  " + ", ".join(f"slot {slot}=0x{fid:02X}" for fid, slot in favs))

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

    # ----- meta -------------------------------------------------------------

    async def cmd_help(self, _args: str) -> None:
        print("commands:")
        print("  status                         hub/app state + cached counts")
        print("  activities | devices           list catalogs")
        print("  commands <dev> | buttons <ent> per-entity detail")
        print("  macros <act> | favorites <act> activity detail")
        print("  press <ent> <button>           send a button (alias: send)")
        print("  start <act> | stop <act>       switch activity power")
        print("  find                           find-my-remote")
        print("  proxy on|off                   toggle pass-through")
        print("  quit                           exit")
        print("\nreads need control mode (no app attached); otherwise cached is shown.")

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


async def _main_discover(argv: list[str]) -> None:
    """One-shot mDNS scan for physical hubs (and optionally proxies)."""

    ap = argparse.ArgumentParser(
        prog="sofapython discover",
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
    ap = argparse.ArgumentParser(prog="sofapython run", description="Proxy a hub + interactive shell")
    ap.add_argument("--hub", help="real hub IP; omit to auto-discover the first hub")
    ap.add_argument("--hub-udp", type=int, default=8102)
    ap.add_argument("--proxy-udp", type=int, default=8102, help="CALL_ME/NOTIFY_ME UDP port (8102 for iOS)")
    ap.add_argument("--listen-base", type=int, default=8200)
    ap.add_argument("--mdns-txt", action="append", help="TXT kv pair, e.g. HVER=2 (repeatable); used with --hub")
    ap.add_argument("--mdns-name", default="X1-HUB-PROXY")
    ap.add_argument("--disable-proxy", action="store_true", help="start with pass-through disabled")
    ap.add_argument("--connect-timeout", type=float, default=15.0, help="seconds to wait for the hub to connect")
    ap.add_argument("--debug", action="store_true", help="verbose engine logging")
    ap.add_argument("--no-dump", dest="diag_dump", action="store_false")
    ap.add_argument("--no-parse", dest="diag_parse", action="store_false")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.WARNING,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    if args.hub:
        real_hub_ip = args.hub
        mdns_txt = _kv_list_to_dict(args.mdns_txt)
        mdns_instance = args.mdns_name
        hub_version = None
    else:
        print("discovering hubs...")
        found = await async_discover_hubs(timeout=5.0)
        if not found:
            print("no hubs found; pass --hub IP")
            return
        hub = found[0]
        real_hub_ip = hub.host
        mdns_txt = dict(hub.txt)
        mdns_instance = hub.name
        hub_version = hub.hub_version
        print(f"using {hub.name} ({hub.hub_version}) at {hub.host}")

    proxy = AsyncX1Proxy(
        real_hub_ip=real_hub_ip,
        real_hub_udp_port=args.hub_udp,
        proxy_udp_port=args.proxy_udp,
        hub_listen_base=args.listen_base,
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
            controllable = proxy.sync.can_issue_commands()
            print(f"hub connected ({'control mode' if controllable else 'observe mode — an app is attached'})")
        else:
            print("hub not connected yet (the shell still works; events will appear when it connects)")
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
            "usage: sofapython [run|discover] ...\n\n"
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
            asyncio.run(_main_discover(args))
        else:
            asyncio.run(_main_run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

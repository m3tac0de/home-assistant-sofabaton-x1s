#!/usr/bin/env python3
"""
x1cli.py – tiny command-line client for proxy.py

- starts the X1Proxy
- prints hub/app connect/disconnect
- lets you inspect activities, devices, buttons, commands
- lets you send a command to an activity/device
- optional "watch" command to stay open and show incoming updates
"""

import argparse
import logging
import sys
import threading
import time
from typing import Dict

from .protocol_const import BUTTONNAME_BY_CODE, ButtonName
from .x1_proxy import X1Proxy

# ----------------- helpers -----------------


def parse_int(s: str) -> int:
    """Parse decimal or 0x..."""
    s = s.strip()
    if s.lower().startswith("0x"):
        return int(s, 16)
    return int(s, 10)


def resolve_button(code_or_name: str) -> int | None:
    """Accept either numeric (e.g. 0xB0) or name (e.g. OK)"""
    try:
        return parse_int(code_or_name)
    except ValueError:
        pass

    upper = code_or_name.upper()
    # try enum-style name
    if hasattr(ButtonName, upper):
        return getattr(ButtonName, upper)
    # try reverse map (already upper)
    for code, name in BUTTONNAME_BY_CODE.items():
        if name.upper() == upper:
            return code
    return None


def _kv_list_to_dict(items):
    out: Dict[str, str] = {}
    if not items:
        return out
    for it in items:
        if "=" in it:
            k, v = it.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            out[it.strip()] = ""
    return out
    
# ----------------- CLI -----------------


class X1Shell:
    """
    Very simple REPL.
    """

    prompt = "x1> "

    def __init__(self, proxy: X1Proxy):
        self.p = proxy
        self._stop = False

        # hook into events so we see changes as they happen
        self.p.on_hub_state_change(self._on_hub_state)
        self.p.on_client_state_change(self._on_client_state)
        self.p.on_activity_change(self._on_activity_change)
        self.p.on_burst_end("devices", self._on_devices_update)
        self.p.on_burst_end("activities", self._on_activities_update)
        self.p.on_burst_end("commands", self._on_commands_update)
        self.p.on_burst_end("buttons", self._on_buttons_update)

    # ----- event handlers -----

    def _on_hub_state(self, connected: bool) -> None:
        print(f"[event] hub: {'CONNECTED' if connected else 'DISCONNECTED'}")

    def _on_client_state(self, connected: bool) -> None:
        print(f"[event] app: {'CONNECTED' if connected else 'DISCONNECTED'}")

    def _on_activity_change(self, new_id, old_id, name) -> None:
        print(
            f"[event] activity: {old_id} -> {new_id} ({name or 'unknown'})"
        )

    def _on_devices_update(self, *args, **kwargs) -> None:
        print("[event] devices updated")

    def _on_activities_update(self, *args, **kwargs) -> None:
        print("[event] activities updated")

    def _on_commands_update(self, *args, **kwargs) -> None:
        print("[event] commands updated")

    def _on_buttons_update(self, *args, **kwargs) -> None:
        print("[event] buttons updated")

    # ----- command implementations -----

    def do_status(self, _args: str) -> None:
        print("== status ==")
        print(f"hub connected   : {self.p._hub_connected}")
        print(f"proxy enabled   : {self.p._proxy_enabled}")
        print(f"client connected: {self.p._client_connected}")
        acts, ready_acts = self.p.get_activities()
        devs, ready_devs = self.p.get_devices()
        print(f"activities      : {len(acts)} ({'ready' if ready_acts else 'fetching...'})")
        print(f"devices         : {len(devs)} ({'ready' if ready_devs else 'fetching...'})")

    def do_activities(self, _args: str) -> None:
        acts, ready = self.p.get_activities()
        if not acts:
            print("no activities cached; requested from hub (needs hub + no client).")
            return
        print("id  active  name")
        for act_id, info in sorted(acts.items()):
            print(
                f"{act_id:3d}  {'*' if info.get('active') else ' '}      {info.get('name','')}"
            )

    def do_devices(self, _args: str) -> None:
        devs, ready = self.p.get_devices()
        if not devs:
            print("no devices cached; requested from hub (needs hub + no client).")
            return
        print("id  type  brand  name")
        for dev_id, info in sorted(devs.items()):
            print(
                f"[{dev_id:3d}] {info.get('name','?'):6} ({info.get('brand','')})"
            )

    def do_buttons(self, args: str) -> None:
        if not args.strip():
            print("usage: buttons <activity_or_device_id>")
            return
        ent = parse_int(args)
        btns, ready = self.p.get_buttons_for_entity(ent)
        if not btns:
            print("no buttons yet; requested from hub.")
            return
        print(f"buttons for {ent}:")
        for b in btns:
            name = BUTTONNAME_BY_CODE.get(b, f"0x{b:02X}")
            print(f"  {b:3d} ({name})")

    def do_commands(self, args: str) -> None:
        if not args.strip():
            print("usage: commands <device_id>")
            return
        ent = parse_int(args)
        cmds, ready = self.p.get_commands_for_entity(ent)
        if not cmds:
            print("no commands yet; requested from hub.")
            return
        print(f"commands for {ent}:")
        for code, label in sorted(cmds.items()):
            print(f"  0x{code:04X}  {label}")

    def do_send(self, args: str) -> None:
        """
        send <entity_id> <button_name_or_code>

        examples:
          send 101 POWER_ON
          send 101 0xC6
        """
        parts = args.split()
        if len(parts) != 2:
            print(self.do_send.__doc__)
            return
        ent = parse_int(parts[0])
        btn = resolve_button(parts[1])
        if btn is None:
            print(f"unknown button {parts[1]!r}")
            return
        ok = self.p.send_command(ent, btn)
        if not ok:
            print("proxy refused to send (is a real client connected?)")
        else:
            print("sent")

    def do_find_remote(self, _args: str) -> None:
        ok = self.p.find_remote()
        if ok:
            print("sent find-remote signal")
        else:
            print("proxy refused to send (is a real client connected?)")

    def do_watch(self, _args: str) -> None:
        """
        Just keep the CLI alive and let event callbacks print stuff.
        Ctrl+C to exit.
        """
        print("watching – press Ctrl+C to stop")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print()

    def do_quit(self, _args: str) -> None:
        self._stop = True

    def do_exit(self, _args: str) -> None:
        self._stop = True

    def do_proxy_on(self, _args: str):
        self.p.enable_proxy()
        print("[HINT] proxy enabled")
        
    def do_proxy_off(self, _args: str):
        self.p.disable_proxy()
        print("[HINT] proxy disabled")

    # ----- REPL loop -----

    def loop(self) -> None:
        while not self._stop:
            try:
                line = input(self.prompt)
            except EOFError:
                break
            line = line.strip()
            if not line:
                continue
            cmd, *rest = line.split(" ", 1)
            rest = rest[0] if rest else ""
            meth = getattr(self, f"do_{cmd}", None)
            if not meth:
                print("commands: status, activities, devices, buttons, commands, send, watch, quit")
                continue
            meth(rest)


def _main_discover(argv: list[str]) -> None:
    """One-shot mDNS scan for physical hubs (and optionally proxies)."""

    ap = argparse.ArgumentParser(
        prog="sofapython discover",
        description="Discover Sofabaton hubs on the local network via mDNS",
    )
    ap.add_argument("--timeout", type=float, default=5.0, help="scan duration in seconds (default 5)")
    ap.add_argument(
        "--include-proxies",
        action="store_true",
        help="also list proxy advertisements (TXT %s=1)" % "HA_PROXY",
    )
    ap.add_argument("--json", action="store_true", help="emit one JSON object per hub")
    args = ap.parse_args(argv)

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


def _main_run(argv: list[str]) -> None:
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    ap = argparse.ArgumentParser(prog="sofapython run", description="X1 proxy CLI")
    ap.add_argument("--hub", required=True, help="real hub IP (the real device)")
    ap.add_argument("--hub-udp", type=int, default=8102)
    ap.add_argument(
        "--proxy-udp",
        type=int,
        default=8102,
        help="Single CALL_ME/NOTIFY_ME UDP port for all proxies (8102 recommended for iOS)",
    )
    ap.add_argument("--listen-base", type=int, default=8200)
    ap.add_argument("--mdns-txt", action="append", help="add TXT record kv pair, e.g. NAME=YourHub (repeatable)")
    ap.add_argument("--disable-proxy", action="store_true", help="start with proxy disabled")
    ap.add_argument("--mdns-name", default="X1-HUB-PROXY")
    ap.add_argument("--no-dump", dest="diag_dump", action="store_false")
    ap.add_argument("--no-parse", dest="diag_parse", action="store_false")
    args = ap.parse_args(argv)

    mdns_txt = _kv_list_to_dict(args.mdns_txt)

    proxy = X1Proxy(
        real_hub_ip=args.hub,
        real_hub_udp_port=args.hub_udp,
        proxy_udp_port=args.proxy_udp,
        hub_listen_base=args.listen_base,
        mdns_txt=mdns_txt,
        mdns_instance=args.mdns_name,
        proxy_enabled=not args.disable_proxy,
        diag_dump=args.diag_dump,
        diag_parse=args.diag_parse,
    )

    proxy.start()
    print("proxy started; type 'status'")

    shell = X1Shell(proxy)
    try:
        shell.loop()
    finally:
        proxy.stop()


_SUBCOMMANDS = ("run", "discover")


def main(argv: list[str] | None = None) -> None:
    """Entry point with subcommands.

    ``sofapython discover [...]`` scans for hubs; ``sofapython run
    --hub IP [...]`` starts the proxy shell. For backward compatibility
    a missing subcommand defaults to ``run`` (so the historical
    ``--hub IP`` invocation keeps working).
    """

    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] in (["-h"], ["--help"]):
        print(
            "usage: sofapython [run|discover] ...\n\n"
            "subcommands:\n"
            "  run       start the proxy + interactive shell (default; see 'run -h')\n"
            "  discover  scan the LAN for Sofabaton hubs (see 'discover -h')"
        )
        return
    command = "run"
    if args and args[0] in _SUBCOMMANDS:
        command = args.pop(0)
    if command == "discover":
        _main_discover(args)
    else:
        _main_run(args)


if __name__ == "__main__":
    main()

"""Disable/enable a sofabaton_x1s config entry via the HA WebSocket API.

Used to honor the single-client rule before a bench session (the harness
cannot connect while HA owns the hub connection). Token comes from
scripts/.ha-token.

Usage:
    python ha_entry.py list
    python ha_entry.py disable <title-substring>
    python ha_entry.py enable <title-substring>
"""

from __future__ import annotations

import asyncio
import json
import ssl
import sys
from pathlib import Path

import websockets

BASE = "wss://YOUR-HA-HOST:8123/api/websocket"
TOKEN = (Path(__file__).resolve().parents[1] / ".ha-token").read_text(encoding="utf-8").strip()


async def _call(ws, msg_id: int, payload: dict) -> dict:
    await ws.send(json.dumps({"id": msg_id, **payload}))
    while True:
        reply = json.loads(await ws.recv())
        if reply.get("id") == msg_id:
            return reply


async def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "list"
    needle = sys.argv[2].lower() if len(sys.argv) > 2 else ""

    ctx = ssl.create_default_context()
    async with websockets.connect(BASE, ssl=ctx, max_size=8 * 1024 * 1024) as ws:
        hello = json.loads(await ws.recv())
        assert hello.get("type") == "auth_required", hello
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        authed = json.loads(await ws.recv())
        assert authed.get("type") == "auth_ok", authed

        entries = await _call(ws, 1, {"type": "config_entries/get", "domain": "sofabaton_x1s"})
        rows = entries.get("result") or []
        if action == "list":
            for row in rows:
                print(json.dumps({k: row.get(k) for k in ("entry_id", "title", "state", "disabled_by")}))
            return

        matches = [r for r in rows if needle in str(r.get("title", "")).lower()]
        if len(matches) != 1:
            print(f"need exactly one match for {needle!r}, got {len(matches)}:")
            for row in rows:
                print(" ", row.get("title"), row.get("entry_id"), row.get("disabled_by"))
            sys.exit(2)
        entry = matches[0]
        disabled_by = "user" if action == "disable" else None
        result = await _call(ws, 2, {
            "type": "config_entries/disable",
            "entry_id": entry["entry_id"],
            "disabled_by": disabled_by,
        })
        print(json.dumps({"title": entry.get("title"), "action": action, "reply": result}))


if __name__ == "__main__":
    asyncio.run(main())

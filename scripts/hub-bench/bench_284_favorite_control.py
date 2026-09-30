"""Code review CR-L4b-5 / CR-L4b-7 (bench program BP1): does a favorite map land?

Wave 1 made a STATUS_ACK rejection of the favorite map a failure (it used
to count as success). A throwaway device then got status 0x09. This adds
one favorite for a member device's command on a real activity, reads the
favorites back, and removes the favorite again.

Usage:
    python bench_284_favorite_control.py <ip> <X1S|X2> <activity-id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
ACT = int(sys.argv[3], 0)

log_path = setup_logging(f"favorite-control-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
added = None
try:
    before = proxy.backup_activity(ACT) or {}
    favs = before.get("favorite_slots") or []
    members = sorted(set(before.get("referenced_source_device_ids") or []))
    print(f"members {members}; favorites before:")
    for fav in favs:
        print(f"  {fav}")
    taken = {(f.get("device_id"), f.get("command_id")) for f in favs}
    choice = None
    for dev in members:
        commands, _ = proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        time.sleep(2)
        commands, _ = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        for cmd in sorted(commands or {}):
            if (dev, cmd) not in taken:
                choice = (dev, cmd, commands[cmd])
                break
        if choice:
            break
    print(f"favoriting {choice}")
    added = proxy.command_to_favorite(ACT, choice[0], choice[1])
    print(f"result: {added}")
    after = proxy.backup_activity(ACT) or {}
    for fav in after.get("favorite_slots") or []:
        print(f"  after: {fav}")
    save_json(f"favorite-control-{HUB_VERSION}", {"before": favs, "choice": choice, "result": added,
                                                  "after": after.get("favorite_slots")})
finally:
    if added and added.get("fav_id") is not None:
        print(f"cleanup: {proxy.delete_favorite(ACT, int(added['fav_id']))}")
        time.sleep(1)
        final = proxy.backup_activity(ACT) or {}
        print(f"favorites after cleanup: {len(final.get('favorite_slots') or [])} (before: {len(favs)})")
    proxy.stop()

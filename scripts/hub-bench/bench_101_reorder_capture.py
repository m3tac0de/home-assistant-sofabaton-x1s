"""Capture the official app's activity re-order writes through the proxy.

Program: activity reorder + create (see memory/live plan). The app DOES have
an activity re-order feature; this bench starts an app-facing proxy against
the sacrificial hub, snapshots the activity rows (names + sort bytes) while
we still hold control mode, then idles while the user attaches the official
app and performs the re-order. Every relayed frame lands in the hex log, so
the app's actual write sequence can be diffed against our
``reorder_activities`` hypothesis (row rewrite with sort byte at payload[9]).

Run:

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_101_reorder_capture.py <ip> <X1|X1S|X2> <tag>

Stop with Ctrl+C once the app is closed again; the script then re-reads the
activity catalog and prints a before/after sort-byte diff.
"""

from __future__ import annotations

import sys
import time

from bench_common import LOG_DIR, save_json, setup_logging  # noqa: F401
import bench_common
from x1slib.x1_proxy import X1Proxy  # noqa: E402  (aliased by bench_common)
from x1slib.discovery import discover_hubs  # noqa: E402
from x1slib.hub_versions import HVER_BY_HUB_VERSION  # noqa: E402


def _snapshot(proxy: X1Proxy) -> dict:
    """Activity rows keyed by id: name + the record sort byte (body[6])."""

    rows: dict[str, dict] = {}
    for act_lo, details in sorted(proxy.state.activities.items()):
        if not isinstance(details, dict):
            continue
        raw_body = details.get("raw_body")
        sort_byte = None
        if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
            sort_byte = int(raw_body[6])
        row_payload = proxy._activity_row_payloads.get(act_lo)
        payload_sort = None
        if isinstance(row_payload, (bytes, bytearray)) and len(row_payload) > 9:
            payload_sort = int(row_payload[9])
        rows[f"0x{act_lo:02X}"] = {
            "id": act_lo,
            "name": details.get("name"),
            "sort_byte_body6": sort_byte,
            "sort_byte_payload9": payload_sort,
            "row_payload_hex": bytes(row_payload).hex() if row_payload else None,
        }
    return rows


def _refresh_catalog(proxy: X1Proxy, *, timeout: float = 20.0) -> bool:
    if not proxy.request_activities():
        return False
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proxy._burst.active and proxy._burst.kind == "activities":
            break
        time.sleep(0.05)
    while time.monotonic() < deadline:
        if not proxy._burst.active:
            return True
        time.sleep(0.05)
    return not proxy._burst.active


def main() -> None:
    if len(sys.argv) < 4:
        print(__doc__)
        raise SystemExit(2)
    host, hub_version, tag = sys.argv[1], sys.argv[2], sys.argv[3]

    log_path = setup_logging(f"reorder-capture-{tag}")
    print(f"frame log: {log_path}")

    # Discover the real hub's mDNS TXT so the proxy advertisement matches
    # what the app expects (MAC suffix, HVER, ...).
    mdns_txt: dict[str, str] = {}
    mdns_instance = "X1-HUB-PROXY"
    print("discovering hub mDNS identity...")
    try:
        for hub in discover_hubs(timeout=6.0, include_proxies=False):
            if hub.host == host:
                mdns_txt = dict(hub.txt)
                mdns_instance = hub.name
                print(f"  matched {hub.name} at {hub.host}")
                break
        else:
            print("  no mDNS match for that IP; advertising with defaults")
    except Exception as err:  # noqa: BLE001
        print(f"  discovery failed ({err}); advertising with defaults")
    if "HVER" not in mdns_txt:
        mdns_txt["HVER"] = HVER_BY_HUB_VERSION[hub_version]

    proxy = X1Proxy(
        host,
        hub_version=hub_version,
        proxy_enabled=True,
        diag_dump=True,
        diag_parse=True,
        mdns_txt=mdns_txt,
        mdns_instance=mdns_instance,
    )
    proxy.start()

    try:
        print("waiting for the hub to connect...")
        deadline = time.time() + 60.0
        while time.time() < deadline and not proxy.can_issue_commands():
            time.sleep(0.5)
        if not proxy.can_issue_commands():
            raise RuntimeError("hub not controllable within 60s")
        print(f"hub connected (version {proxy.hub_version})")

        # The proxy only advertises over mDNS once it has the hub's banner
        # identity (model + name + firmware). In control mode nothing asks
        # the hub who it is, so fetch the banner ourselves and realign the
        # advertisement to it — mirrors AsyncXProxy.wait_until_discoverable.
        print("fetching banner identity so the proxy can advertise...")
        deadline = time.time() + 15.0
        while time.time() < deadline and not proxy.has_banner_identity():
            proxy.fetch_banner_info()
            time.sleep(1.0)
        if not proxy.has_banner_identity():
            raise RuntimeError("hub banner identity did not arrive; cannot advertise")
        info = proxy.get_banner_info()
        model = info.get("model") or proxy.hub_version
        txt = dict(proxy.mdns_txt)
        hver = HVER_BY_HUB_VERSION.get(model)
        if hver:
            txt["HVER"] = hver
        banner_name = str(info.get("name") or "").strip()
        if banner_name:
            txt["NAME"] = banner_name
        proxy.update_discovery_identity(mdns_txt=txt, hub_version=model)
        if not proxy._adv_started:
            raise RuntimeError("mDNS advertisement did not start")
        print(f"advertising as {proxy.mdns_instance} (txt={txt})")

        print("snapshotting activities (before)...")
        if not _refresh_catalog(proxy):
            raise RuntimeError("activities catalog did not load")
        before = _snapshot(proxy)
        save_json(f"reorder-before-{tag}", before)
        print(f"  {len(before)} activities:")
        for key, row in before.items():
            print(f"    {key} sort={row['sort_byte_body6']} name={row['name']!r}")

        print()
        print("=" * 70)
        print("Proxy is advertising. Connect the OFFICIAL APP now and perform")
        print("the activity re-order. Every frame is being logged.")
        print("Close the app when done, then press Ctrl+C here.")
        print("=" * 70)

        stop_file = bench_common.BENCH_DIR / f"STOP-{tag}"
        stop_file.unlink(missing_ok=True)
        print(f"(or create {stop_file} to finish)")
        app_attached = False
        while True:
            if stop_file.exists():
                stop_file.unlink(missing_ok=True)
                raise KeyboardInterrupt
            attached = not proxy.can_issue_commands()
            if attached != app_attached:
                app_attached = attached
                stamp = time.strftime("%H:%M:%S")
                print(f"[{stamp}] app {'ATTACHED' if attached else 'DETACHED'}", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nstopping; taking the after-snapshot...")
        try:
            wait_until = time.time() + 15.0
            while time.time() < wait_until and not proxy.can_issue_commands():
                time.sleep(0.5)
            if proxy.can_issue_commands() and _refresh_catalog(proxy):
                after = _snapshot(proxy)
                save_json(f"reorder-after-{tag}", after)
                print("after:")
                for key, row in after.items():
                    print(f"    {key} sort={row['sort_byte_body6']} name={row['name']!r}")
            else:
                print("could not re-read the catalog (app still attached?)")
        except Exception as err:  # noqa: BLE001
            print(f"after-snapshot failed: {err}")
    finally:
        proxy.stop()
        print(f"done. frame log: {log_path}")


if __name__ == "__main__":
    main()

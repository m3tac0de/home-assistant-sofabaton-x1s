"""SofaBaton X1S hub provisioning example — nuke & repopulate via Pyscript.

This script demonstrates how to use the ``create_ip_button``,
``add_ip_button_to_device``, ``create_activity``, ``delete_device`` and
``delete_activity`` services added by this integration to fully manage a
SofaBaton X1S hub programmatically from Home Assistant, without ever opening
the SofaBaton app.

Requirements
------------
- `Pyscript <https://github.com/custom-components/pyscript>`_ custom integration
- This file placed at ``<config>/pyscript/sofabaton_provision.py``
- Pyscript ``allow_all_imports: true`` in ``configuration.yaml``

Usage
-----
1. Close the SofaBaton app (hub only accepts direct commands when app is disconnected).
2. In Developer Tools → Services, call ``pyscript.sofabaton_provision``.
3. A persistent notification appears with the full result log.

The script is safe to re-run at any time — it nukes all existing devices and
activities first, then recreates them from the ``DEVICES``/``ACTIVITIES``
config dicts below.

X1S icon IDs (nicon_1 … nicon_16)
----------------------------------
  1=Monitor   2=Photo       3=Music       4=3D-glasses   5=Clapperboard
  6=Handheld  7=Controller  8=STB/Router  9=AV-Receiver  10=Projector
  11=Speakers 12=Lightbulb  13=Apple      14=Roku         15=Amazon
  16=Nvidia/N
"""

import json as _json
from functools import partial as _partial


# ---------------------------------------------------------------------------
#  Configuration — edit to match your setup
# ---------------------------------------------------------------------------

# Base URL for Home Assistant webhooks.
# Adjust if HA is on a different address or port.
HA_WEBHOOK_BASE = "http://192.168.1.1:8123/api/webhook"
DEFAULT_HEADERS = {"Content-Type": "application/json"}
DEFAULT_METHOD = "POST"

# Map of virtual device name → button list and metadata.
# Each button press sends:
#   POST <webhook_base>/<webhook>  body: {"<body_key>": "<button_name>"}
DEVICES = {
    "Projector": {
        "webhook": "cinema-projector",
        "body_key": "cmd",
        "icon": 10,   # Projector icon
        "buttons": [
            "PowerOn", "PowerOff",
            "UP", "DOWN", "LEFT", "RIGHT", "ENTER", "RETURN",
            "HOME", "MENU",
            "VOLUP", "VOLDOWN", "MUTE",
            "InputSource", "Settings",
            "YouTube", "Netflix", "PrimeVideo", "DisneyPlus",
        ],
    },
    "Apple TV": {
        "webhook": "cinema-appletv",
        "body_key": "cmd",
        "icon": 13,   # Apple icon
        "buttons": [
            "PowerOn", "PowerOff",
            "Home", "DirectionUp", "DirectionDown",
            "DirectionLeft", "DirectionRight", "Select",
            "Back", "Menu",
            "Play", "Pause", "PlayPause",
            "Rewind", "FastForward",
            "VolumeUp", "VolumeDown", "VolumeMute",
        ],
    },
    "Soundbar": {
        "webhook": "cinema-soundbar",
        "body_key": "cmd",
        "icon": 11,   # Speakers icon
        "buttons": [
            "PowerOn", "PowerOff",
            "VolumeUp", "VolumeDown", "VolumeMute",
            "Source", "SoundMode",
            "BassUp", "BassDown",
            "Settings", "Info",
        ],
    },
    # "Cinema" is a special control device whose buttons are used as
    # power-on/off macros in activities. Its webhook notifies HA which
    # activity to launch/tear down.
    "Cinema": {
        "webhook": "cinema-activity",
        "body_key": "act",
        "icon": 12,   # Lightbulb icon
        "buttons": [
            "appletv", "off",
        ],
    },
}

# Activities map activity name → member devices + power macro config.
# ``power_on_btn`` must be a button name from the "Cinema" device.
# ``power_off_btn`` must also be a button name from the "Cinema" device.
ACTIVITIES = {
    "Apple TV": {
        "member_devices": ["Projector", "Soundbar", "Apple TV", "Cinema"],
        "power_on_btn": "appletv",
        "power_off_btn": "off",
        "icon": 13,   # Apple icon
        "color_id": 0,
    },
}

# Timing (seconds) — reduce if your hub is fast, increase if you see failures
INTER_DEVICE_SETTLE = 8   # pause between creating each device
INTER_BUTTON_DELAY = 0.5  # pause between adding each button


# ---------------------------------------------------------------------------
#  Internal state
# ---------------------------------------------------------------------------

_provision_running = False


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _get_hub():
    """Return the first SofaBaton hub instance from hass.data."""
    dd = hass.data.get("sofabaton_x1s", {})
    for v in dd.values():
        if hasattr(v, "_proxy") and hasattr(v, "entry_id"):
            return v
    return None


def _notify(msg, title="SofaBaton Provision"):
    """Create or update a persistent notification."""
    persistent_notification.create(
        message=msg, title=title, notification_id="sofabaton_provision",
    )


def _make_body(body_key, btn_name):
    """Build a compact JSON body string for a button webhook."""
    return _json.dumps({body_key: btn_name}, separators=(",", ":"))


def _cinema_btn_index(btn_name):
    """Return the 1-based index of *btn_name* in the Cinema device button list."""
    buttons = DEVICES["Cinema"]["buttons"]
    return buttons.index(btn_name) + 1  # hub uses 1-based slots


# ---------------------------------------------------------------------------
#  Pyscript services
# ---------------------------------------------------------------------------

@service
def sofabaton_diag():
    """Show hub connectivity and known device/activity IDs in a notification."""
    hub = _get_hub()
    if hub is None:
        _notify("ERROR: no hub found in hass.data")
        return

    proxy = hub._proxy
    can_cmd = task.executor(proxy.can_issue_commands)
    known = sorted(task.executor(proxy.get_known_device_ids))
    act_ids = sorted(task.executor(proxy.get_known_activity_ids))
    devices, cached = task.executor(proxy.get_devices)

    lines = [
        f"can_issue_commands: {can_cmd}",
        f"known device IDs: {known}",
        f"known activity IDs: {act_ids}",
        f"devices cached: {cached}",
    ]
    for dev_id, dev in sorted(devices.items()):
        lines.append(f"  [{dev_id}] {dev.get('name', '?')}")

    text = "\n".join(lines)
    _notify(text, title="SofaBaton Diagnostics")
    log.info("sofabaton_provision diag:\n%s", text)


@service
def sofabaton_nuke():
    """Delete every device and activity from the hub."""
    hub = _get_hub()
    if hub is None:
        _notify("ERROR: no hub found")
        return

    proxy = hub._proxy
    if not task.executor(proxy.can_issue_commands):
        _notify("BLOCKED: close the SofaBaton app first")
        return

    msgs = []

    # Delete activities first (activities reference devices)
    act_ids = sorted(task.executor(proxy.get_known_activity_ids))
    if act_ids:
        msgs.append(f"Deleting {len(act_ids)} activities: {act_ids}")
        for act_id in act_ids:
            ok = task.executor(proxy.delete_activity, act_id)
            msgs.append(f"  {'OK' if ok else 'FAIL'} delete activity {act_id}")
            task.sleep(0.5)

    # Force-refresh device list in case cache is stale
    known_ids = sorted(task.executor(proxy.get_known_device_ids))
    if not known_ids:
        task.executor(_partial(proxy.get_devices, force_refresh=True))
        task.sleep(5)
        known_ids = sorted(task.executor(proxy.get_known_device_ids))

    if known_ids:
        msgs.append(f"Deleting {len(known_ids)} devices: {known_ids}")
        for dev_id in known_ids:
            ok = task.executor(proxy.delete_device, dev_id)
            msgs.append(f"  {'OK' if ok else 'FAIL'} delete device {dev_id}")
            task.sleep(0.5)
    else:
        msgs.append("No devices to delete")

    _notify("\n".join(msgs), title="SofaBaton Nuke Complete")


@service
def sofabaton_provision():
    """Nuke all hub devices/activities, then recreate from the config dicts above."""
    global _provision_running
    if _provision_running:
        _notify("Provision already running — ignoring duplicate call")
        return
    _provision_running = True
    try:
        _do_provision()
    finally:
        _provision_running = False


# ---------------------------------------------------------------------------
#  Core provisioning logic
# ---------------------------------------------------------------------------

def _do_provision():
    hub = _get_hub()
    if hub is None:
        _notify("ERROR: no hub found")
        return

    proxy = hub._proxy
    if not task.executor(proxy.can_issue_commands):
        _notify("BLOCKED: close the SofaBaton app first")
        return

    msgs = ["**Nuke**"]

    # ----- nuke -----
    act_ids = sorted(task.executor(proxy.get_known_activity_ids))
    if act_ids:
        msgs.append(f"Deleting {len(act_ids)} activities: {act_ids}")
        for act_id in act_ids:
            ok = task.executor(proxy.delete_activity, act_id)
            msgs.append(f"  {'OK' if ok else 'FAIL'} delete activity {act_id}")
            task.sleep(0.5)

    known_ids = sorted(task.executor(proxy.get_known_device_ids))
    if not known_ids:
        task.executor(_partial(proxy.get_devices, force_refresh=True))
        task.sleep(5)
        known_ids = sorted(task.executor(proxy.get_known_device_ids))

    if known_ids:
        msgs.append(f"Deleting {len(known_ids)} devices: {known_ids}")
        for dev_id in known_ids:
            ok = task.executor(proxy.delete_device, dev_id)
            msgs.append(f"  {'OK' if ok else 'FAIL'} delete device {dev_id}")
            task.sleep(0.5)
    else:
        msgs.append("No devices to delete")

    _notify("\n".join(msgs) + "\n\n_Waiting for hub to settle…_")
    task.sleep(10)

    if not task.executor(proxy.can_issue_commands):
        _notify("\n".join(msgs) + "\n\n**BLOCKED** after nuke — reopen app then close it again")
        return

    # ----- create devices -----
    msgs.append("")
    msgs.append("**Create Devices**")

    # Suppress background OP_REQ_DEVICES polling while we are creating
    proxy.native_creating = True
    device_id_map: dict[str, int] = {}

    try:
        for dev_name, cfg in DEVICES.items():
            buttons = cfg["buttons"]
            url = f"{HA_WEBHOOK_BASE}/{cfg['webhook']}"
            method = cfg.get("method", DEFAULT_METHOD)
            headers = cfg.get("headers", DEFAULT_HEADERS)
            body_key = cfg.get("body_key", "cmd")
            icon = cfg.get("icon", 1)

            # Create the device with its first button
            try:
                result = task.executor(
                    _partial(
                        proxy.create_ip_button,
                        device_name=dev_name,
                        button_name=buttons[0],
                        method=method,
                        url=url,
                        headers=headers,
                        body=_make_body(body_key, buttons[0]),
                        icon=icon,
                    )
                )
            except Exception as e:
                msgs.append(f"EXCEPTION '{dev_name}': {e}")
                task.sleep(INTER_DEVICE_SETTLE)
                continue

            device_id = (result or {}).get("device_id")
            if device_id is None:
                msgs.append(f"FAIL '{dev_name}' — no device_id")
                task.sleep(INTER_DEVICE_SETTLE)
                continue

            device_id_map[dev_name] = device_id

            # Add remaining buttons (key_index starts at 2 — first button is 1)
            fail_count = 0
            for idx, btn_name in enumerate(buttons[1:], start=2):
                task.sleep(INTER_BUTTON_DELAY)
                try:
                    task.executor(
                        _partial(
                            proxy.add_ip_button_to_device,
                            device_id=device_id,
                            button_name=btn_name,
                            method=method,
                            url=url,
                            headers=headers,
                            key_index=idx,
                            device_name=dev_name,
                            body=_make_body(body_key, btn_name),
                            icon=icon,
                        )
                    )
                except Exception as e:
                    fail_count += 1
                    log.error("sofabaton_provision: add '%s' to '%s' failed: %s", btn_name, dev_name, e)

            suffix = f" ({fail_count} fails)" if fail_count else ""
            msgs.append(
                f"OK '{dev_name}' id={device_id} icon={icon} ({len(buttons)} btns){suffix}"
            )
            task.sleep(INTER_DEVICE_SETTLE)
    finally:
        proxy.native_creating = False

    # ----- create activities -----
    msgs.append("")
    msgs.append("**Create Activities**")

    proxy.native_creating = True
    try:
        cinema_id = device_id_map.get("Cinema")
        if cinema_id is None:
            msgs.append("SKIP all activities — Cinema device not created")
        else:
            for act_name, act_cfg in ACTIVITIES.items():
                member_ids = []
                missing = []
                for name in act_cfg["member_devices"]:
                    did = device_id_map.get(name)
                    if did is not None:
                        member_ids.append(did)
                    else:
                        missing.append(name)

                if missing:
                    msgs.append(f"SKIP '{act_name}' — missing devices: {missing}")
                    continue

                on_btn = act_cfg["power_on_btn"]
                off_btn = act_cfg.get("power_off_btn", "off")

                # Steps: (type, device_id, 1-based key_index)
                power_on_steps = [("cmd", cinema_id, _cinema_btn_index(on_btn))]
                power_off_steps = [("cmd", cinema_id, _cinema_btn_index(off_btn))]

                try:
                    result = task.executor(
                        _partial(
                            proxy.create_activity,
                            activity_name=act_name,
                            member_device_ids=member_ids,
                            power_on_steps=power_on_steps,
                            power_off_steps=power_off_steps,
                            icon=act_cfg.get("icon", 1),
                            color_id=act_cfg.get("color_id", 0),
                        )
                    )
                except Exception as e:
                    msgs.append(f"EXCEPTION '{act_name}': {e}")
                    task.sleep(5)
                    continue

                act_id = (result or {}).get("activity_id")
                if act_id is not None:
                    msgs.append(
                        f"OK '{act_name}' id={act_id} icon={act_cfg.get('icon', 1)} "
                        f"members={member_ids} on=Cinema[{on_btn}] off=Cinema[{off_btn}]"
                    )
                else:
                    msgs.append(f"FAIL '{act_name}' — no activity_id")

                task.sleep(5)
    finally:
        proxy.native_creating = False

    summary = "\n".join(msgs)
    _notify(summary, title="SofaBaton Provision Complete")
    log.info("sofabaton_provision: DONE\n%s", summary)

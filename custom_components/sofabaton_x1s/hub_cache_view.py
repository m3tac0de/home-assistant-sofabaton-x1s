"""Read-only projections of the engine's cached hub state (R6, CR-H1-13).

The methods here only read the proxy's state and the hub's catalog maps;
they never touch the wire. Mixed into SofabatonHub.
"""

from __future__ import annotations

from typing import Any

from .command_config import is_wifi_events_device_key
from .lib.backup_export import build_device_button_rows
from .wifi_deploy import _parse_managed_wifi_brand


class HubCacheViewMixin:
    """Read-only projections of the engine's cached hub state (R6, CR-H1-13)."""

    async def async_get_cache_contents(self) -> dict[str, Any]:
        data = await self.async_export_cache_state()
        data["entry_id"] = self.entry_id
        data["name"] = self.name
        data["cache_generation"] = self.cache_generation
        data["activities"] = self._build_cache_activity_list(data)
        data["activity_favorites"] = self._build_cache_activity_favorites()
        data["devices_list"] = self._build_cache_devices_list(data)
        return data

    def _cache_activity_ids(self, data: dict[str, Any]) -> list[int]:
        catalog_ids: set[int] = set()
        catalog_ids.update(int(act_id) & 0xFF for act_id in self.activities.keys())
        state_activities = getattr(self._proxy.state, "activities", {})
        if isinstance(state_activities, dict):
            catalog_ids.update(int(act_id) & 0xFF for act_id in state_activities.keys())

        activity_ids: set[int] = set(catalog_ids)

        for key in (
            "activity_macros",
            "activity_favorite_slots",
            "activity_favorite_labels",
            "activity_members",
        ):
            rows = data.get(key, {})
            if not isinstance(rows, dict):
                continue
            for act_id in rows:
                try:
                    activity_ids.add(int(act_id) & 0xFF)
                except (TypeError, ValueError):
                    continue

        visible_ids = catalog_ids if catalog_ids else activity_ids
        return sorted(activity_id for activity_id in visible_ids if 1 <= activity_id <= 255)

    def _get_cached_activity_name(self, act_id: int) -> str | None:
        act_lo = act_id & 0xFF
        activity = self.activities.get(act_lo)
        if isinstance(activity, dict):
            name = str(activity.get("name") or "").strip()
            if name:
                return name

        state_activities = getattr(self._proxy.state, "activities", {})
        if isinstance(state_activities, dict):
            cached_activity = state_activities.get(act_lo)
            if isinstance(cached_activity, dict):
                name = str(cached_activity.get("name") or "").strip()
                if name:
                    return name

        return None

    def _get_cached_device_name(self, device_id: int) -> str | None:
        dev_lo = device_id & 0xFF
        device = self.devices.get(dev_lo)
        if isinstance(device, dict):
            name = str(device.get("name") or "").strip()
            if name:
                return name

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            cached_device = source.get(dev_lo)
            if isinstance(cached_device, dict):
                name = str(
                    cached_device.get("name")
                    or cached_device.get("device_name")
                    or cached_device.get("label")
                    or ""
                ).strip()
                if name:
                    return name

        return None

    def _get_cached_device_class(self, device_id: int) -> str | None:
        dev_lo = device_id & 0xFF
        device = self.devices.get(dev_lo)
        if isinstance(device, dict):
            device_class = str(device.get("device_class") or "").strip()
            if device_class:
                return device_class

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            cached_device = source.get(dev_lo)
            if isinstance(cached_device, dict):
                device_class = str(cached_device.get("device_class") or "").strip()
                if device_class:
                    return device_class

        return None

    def _build_cache_activity_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        favorites = self._build_cache_activity_favorites()
        macros_raw = data.get("activity_macros", {})
        macros_by_activity = macros_raw if isinstance(macros_raw, dict) else {}

        activities: list[dict[str, Any]] = []
        for act_id in self._cache_activity_ids(data):
            act_key = str(act_id)
            macros = macros_by_activity.get(act_key, [])
            activity = self.activities.get(act_id) or getattr(self._proxy.state, "activities", {}).get(act_id, {})
            # The hub stores a display order in the record's sort byte
            # (body[6] of the shared device-record schema). Expose it so the
            # frontend list can follow the hub's stored order; rows without a
            # cached record body (or with sort still 0) fall back to id order.
            # raw_body is stripped from the hub-level activity views, so read
            # it straight from proxy state.
            sort_value = 0
            state_activity = getattr(self._proxy.state, "activities", {}).get(act_id)
            raw_body = state_activity.get("raw_body") if isinstance(state_activity, dict) else None
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            activities.append(
                {
                    "id": act_id,
                    "name": self._get_cached_activity_name(act_id) or f"Activity {act_id}",
                    "is_active": bool(activity.get("active", False)) if isinstance(activity, dict) else False,
                    "sort": sort_value,
                    "favorite_count": len(favorites.get(act_key, [])),
                    "keybinding_count": 0,
                    "macro_count": len(macros) if isinstance(macros, list) else 0,
                }
            )

        return activities

    def _build_cache_activity_favorites(self) -> dict[str, list[dict[str, Any]]]:
        favorites_by_activity: dict[str, list[dict[str, Any]]] = {}
        activity_ids = (
            set(int(act_id) & 0xFF for act_id in self.activities.keys())
            | set(int(act_id) & 0xFF for act_id in self._proxy.state.activity_favorite_slots.keys())
        )

        for act_id in sorted(activity_id for activity_id in activity_ids if 1 <= activity_id <= 255):
            act_lo = act_id & 0xFF
            slots = self._proxy.state.get_activity_favorite_slots(act_lo)
            labels = {
                (int(row.get("device_id", 0)) & 0xFF, int(row.get("command_id", 0)) & 0xFF): str(row.get("name") or "").strip()
                for row in self._proxy.state.get_activity_favorite_labels(act_lo)
                if isinstance(row, dict)
            }
            if not slots:
                continue

            rows: list[dict[str, Any]] = []
            for slot in slots:
                device_id = int(slot.get("device_id", 0)) & 0xFF
                command_id = int(slot.get("command_id", 0)) & 0xFF
                button_id = int(slot.get("button_id", 0)) & 0xFF
                # Prefer the device command catalog: it is refreshed whenever
                # records change, while the per-activity label map is a
                # resolved copy that can lag behind a rename/redeploy until
                # the activity itself is re-read.
                label = self._proxy.state.commands.get(device_id, {}).get(command_id) or labels.get((device_id, command_id))
                rows.append(
                    {
                        "button_id": button_id,
                        "device_id": device_id,
                        "device_name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                        "command_id": command_id,
                        "label": str(label).strip() if label else f"Command {command_id}",
                        "source": str(slot.get("source", "cache")),
                    }
                )

            # Apply hub-defined display order if available.
            # activity_favorites_order stores [(fav_id, slot), ...] where fav_id
            # matches button_id and slot is the 1-based display position.
            order = self._proxy.state.activity_favorites_order.get(act_lo)
            if order:
                slot_by_fav: dict[int, int] = {fav_id: slot for fav_id, slot in order}
                rows.sort(key=lambda r: slot_by_fav.get(r["button_id"], 0xFFFF))

            favorites_by_activity[str(act_lo)] = rows

        return favorites_by_activity

    def _cache_device_ids(self, data: dict[str, Any]) -> list[int]:
        catalog_ids: set[int] = set()
        catalog_ids.update(int(dev_id) & 0xFF for dev_id in self.devices.keys())

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            catalog_ids.update(int(dev_id) & 0xFF for dev_id in source.keys())

        device_ids: set[int] = set(catalog_ids)
        commands_raw = data.get("commands", {})
        if isinstance(commands_raw, dict):
            for device_id in commands_raw:
                try:
                    device_ids.add(int(device_id) & 0xFF)
                except (TypeError, ValueError):
                    continue

        visible_ids = catalog_ids if catalog_ids else device_ids
        return sorted(device_id for device_id in visible_ids if 1 <= device_id <= 255)

    def _build_cache_devices_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        devices_raw = data.get("devices", {})
        ip_devices_raw = data.get("ip_devices", {})
        commands_raw = data.get("commands", {})

        def _device_meta_for(device_id: int) -> dict[str, Any]:
            for source in (devices_raw, ip_devices_raw):
                if not isinstance(source, dict):
                    continue
                meta = source.get(str(device_id))
                if isinstance(meta, dict):
                    return meta
            return {}

        devices_list: list[dict[str, Any]] = []
        for device_id in self._cache_device_ids(data):
            commands = commands_raw.get(str(device_id), {})
            device_meta = _device_meta_for(device_id)
            # Same shared record schema as activities: the hub stores the
            # display order in the record body's sort byte (body[6]). Expose
            # it so the frontend can mirror the remote's device-list order.
            # raw_body is stripped from the hub-level device views, so read
            # it straight from proxy state.
            sort_value = 0
            state_device = self._proxy.state.entities("device").get(device_id)
            raw_body = state_device.get("raw_body") if isinstance(state_device, dict) else None
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            row = {
                "id": device_id,
                "name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                "sort": sort_value,
                "command_count": len(commands) if isinstance(commands, dict) else 0,
                "has_commands": bool(commands) if isinstance(commands, dict) else False,
            }
            if device_meta.get("device_class") is not None:
                row["device_class"] = device_meta.get("device_class")
            if device_meta.get("device_class_code") is not None:
                row["device_class_code"] = device_meta.get("device_class_code")
            devices_list.append(row)

        return devices_list

    def describe_favorites_order(
        self,
        activity_id: int,
        order: list[tuple[int, int]],
    ) -> list[dict[str, Any]]:
        """Decorate hub-order entries with cached labels and entry types.

        The hub order uses a shared identifier space for quick-access entries.
        Favorite commands and macros can therefore appear interleaved in the
        same ordered list. On X1S, the hub's 0x63 response may contain only a
        partial ordering even though the activity keymap/macros caches expose
        additional visible quick-access ids. This helper enriches the hub
        entries with cached metadata and backfills any remaining visible ids so
        the returned list better matches the app UI.
        """

        act_lo = activity_id & 0xFF

        favorite_by_id: dict[int, dict[str, Any]] = {}
        for slot in self._proxy.state.get_activity_favorite_slots(act_lo):
            entry_id = int(slot.get("button_id", 0)) & 0xFF
            if entry_id == 0:
                continue
            device_id = int(slot.get("device_id", 0)) & 0xFF
            command_id = int(slot.get("command_id", 0)) & 0xFF
            # The device command catalog is refreshed whenever records change;
            # the activity-scoped label map is only a resolved copy and can lag
            # briefly after an editor sync.  Prefer the catalog and keep a
            # useful fallback so a transient label miss never hides the slot.
            label = (
                self._proxy.state.commands.get(device_id, {}).get(command_id)
                or self._proxy.state.get_favorite_label(
                    act_lo, device_id, command_id
                )
                or f"Command {command_id}"
            )
            favorite_by_id[entry_id] = {
                "fav_id": entry_id,
                "button_id": entry_id,
                "favorite_button_id": entry_id,
                "activity_map_button_id": entry_id,
                "slot": None,
                "type": "favorite",
                "name": label,
                "device_id": device_id,
                "command_id": command_id,
            }

        macro_by_id: dict[int, dict[str, Any]] = {}
        for macro in self._proxy.state.get_activity_macros(act_lo):
            entry_id = int(macro.get("command_id", 0)) & 0xFF
            if entry_id == 0:
                continue
            macro_by_id[entry_id] = {
                "fav_id": entry_id,
                "button_id": entry_id,
                "slot": None,
                "type": "macro",
                "name": str(macro.get("label") or ""),
                "command_id": entry_id,
            }

        described: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        for entry_id, slot in sorted(order, key=lambda pair: pair[1]):
            entry_lo = entry_id & 0xFF
            info = dict(
                favorite_by_id.get(entry_lo)
                or macro_by_id.get(entry_lo)
                or {
                    "fav_id": entry_lo,
                    "button_id": entry_lo,
                    "type": "unknown",
                    "name": None,
                }
            )
            info["slot"] = slot & 0xFF
            described.append(info)
            seen_ids.add(entry_lo)

        next_slot = max((int(entry.get("slot", 0)) for entry in described), default=0) + 1
        remaining_ids = sorted(
            (set(favorite_by_id) | set(macro_by_id)) - seen_ids
        )
        for entry_id in remaining_ids:
            info = dict(favorite_by_id.get(entry_id) or macro_by_id.get(entry_id) or {})
            if not info:
                continue
            info["slot"] = next_slot & 0xFF
            described.append(info)
            next_slot += 1

        return described

    def get_all_cached_buttons(self) -> dict[int, list[int]]:
        """Return all button lists we know are ready, from proxy cache."""
        result: dict[int, list[int]] = {}
        for ent_id in self._buttons_ready_for:
            btns, ready = self._proxy.get_buttons_for_entity(
                ent_id,
                fetch_if_missing=False,  # do NOT queue
            )
            if ready and btns:
                result[ent_id] = btns
        return result

    def get_all_cached_button_details(self) -> dict[int, dict[int, dict[str, int]]]:
        """Return per-button mapping details (short + long press) from proxy cache."""
        return dict(self._proxy.state.button_details)

    def get_all_cached_commands(self) -> dict[int, dict[int, str]]:
        """Build a view from the proxy's cache, without triggering new fetches."""
        result: dict[int, dict[int, str]] = {}
        for ent_id in self._command_entities:
            cmds, ready = self._proxy.get_commands_for_entity(
                ent_id,
                fetch_if_missing=False,  # <- important: no queueing
            )
            if ready and cmds:
                result[ent_id] = cmds
        return result

    def get_ui_activity_list(self) -> list[dict[str, Any]]:
        """Activities for the remote entity's ``activities`` attribute.

        Presentation-layer view mirroring ``get_ui_device_list``: ordered
        like the physical remote and the app, i.e. by the record's sort
        byte (body[6] of the shared device-record schema) first, rows
        without a stored sort falling back to id order at the end. The
        remote card renders this list as-is, so the order has to be settled
        here. ``raw_body`` is stripped from the hub-level activity views, so
        the sort byte is read straight from proxy state.
        """

        rows: list[dict[str, Any]] = []
        state_activities = getattr(self._proxy.state, "activities", {})
        if not isinstance(state_activities, dict):
            state_activities = {}
        for act_id, activity in self.activities.items():
            if not isinstance(activity, dict):
                continue
            sort_value = 0
            state_activity = state_activities.get(act_id)
            raw_body = (
                state_activity.get("raw_body")
                if isinstance(state_activity, dict)
                else None
            )
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            rows.append(
                {
                    "id": act_id,
                    "name": activity.get("name"),
                    "sort": sort_value,
                }
            )

        rows.sort(key=lambda r: (0, r["sort"], r["id"]) if r["sort"] else (1, 0, r["id"]))
        return rows

    def get_ui_device_list(self) -> list[dict[str, Any]]:
        """Devices for frontend dropdowns (remote-card device mode).

        Presentation-layer view: the hidden Wifi Events device is filtered
        here, never in the command-config store's ``async_list_hub_devices``
        (the listener guard, deploy reconciliation and diagnostics iterate
        that). Ordered like the physical remote: record sort byte first,
        rows without a stored sort fall back to id order at the end.
        """

        rows: list[dict[str, Any]] = []
        state_devices = self._proxy.state.entities("device")
        for dev_id, device in self.devices.items():
            if not isinstance(device, dict):
                continue
            dev_lo = int(dev_id) & 0xFF
            device_key, _brand_hash = _parse_managed_wifi_brand(
                str(device.get("brand") or "")
            )
            if is_wifi_events_device_key(device_key):
                continue
            name = str(device.get("name") or "").strip()
            sort_value = 0
            state_device = state_devices.get(dev_lo)
            raw_body = (
                state_device.get("raw_body") if isinstance(state_device, dict) else None
            )
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            row: dict[str, Any] = {
                "id": dev_lo,
                "name": name or f"Device {dev_lo}",
                "sort": sort_value,
            }
            if device.get("device_class") is not None:
                row["device_class"] = device.get("device_class")
            rows.append(row)

        rows.sort(key=lambda r: (0, r["sort"], r["id"]) if r["sort"] else (1, 0, r["id"]))
        return rows

    def get_device_keymap(self, device_id: int) -> dict[str, Any] | None:
        """Project one device's cached keymap + command list (device mode).

        Pure cache read: nothing is queued or fetched. Returns ``None``
        until a structural fetch (whole-hub refresh, per-device refresh, or
        a persistent-cache restore carrying the freshness stamp) has covered
        the device; the card then points the user at a control-panel
        refresh instead of waiting on hub I/O here.
        """

        dev_lo = int(device_id) & 0xFF
        fetched_at = self._proxy.state.detail_fetched_at.get("device", {}).get(dev_lo)
        if not fetched_at:
            return None

        commands, _commands_ready = self._proxy.get_commands_for_entity(
            dev_lo, fetch_if_missing=False
        )
        buttons, _buttons_ready = self._proxy.get_buttons_for_entity(
            dev_lo, fetch_if_missing=False
        )
        label_map = {
            int(cmd_id) & 0xFF: str(name) for cmd_id, name in (commands or {}).items()
        }
        bindings = build_device_button_rows(
            button_codes=sorted(int(code) & 0xFF for code in (buttons or [])),
            button_details=dict(self._proxy.state.button_details.get(dev_lo, {})),
            label_map=label_map,
        )

        device_row: dict[str, Any] = {"device_id": dev_lo}
        device = self.devices.get(dev_lo)
        idle_behavior: int | None = None
        if isinstance(device, dict):
            name = str(device.get("name") or "").strip()
            if name:
                device_row["name"] = name
            if device.get("device_class") is not None:
                device_row["device_class"] = device.get("device_class")
            raw_idle = device.get("idle_behavior")
            if isinstance(raw_idle, int):
                idle_behavior = raw_idle & 0xFF

        # Power-key capability gate for the card's device-mode power
        # button: the idle-behavior byte (0x0242, fetched per device
        # during structural reads) is the authoritative signal. Modes
        # 1-3 mean the device has power configured; 4 means no power
        # key, 0 never set up, and a missing value fails closed. The
        # record-tail power_mode byte is NOT usable here (it reads 1
        # on every real hub device, configured or not).
        power_configured = idle_behavior in (1, 2, 3)

        return {
            "device": device_row,
            "buttons": sorted(int(code) & 0xFF for code in (buttons or [])),
            "bindings": bindings,
            "commands": [
                {"command_id": cmd_id, "name": label_map[cmd_id]}
                for cmd_id in sorted(label_map)
            ],
            "power_configured": power_configured,
            "fetched_at": fetched_at,
        }

    def get_all_cached_macros(self) -> dict[int, list[dict[str, int | str]]]:
        """Return cached macros in the physical remote's display order.

        Activity macros and favorites share the family-0x61 quick-access
        namespace.  Their numeric ids are stable identities, not necessarily
        their current screen positions, so filtering the combined ordered view
        is the only reliable way to order either drawer after a reorder.
        """

        result: dict[int, list[dict[str, int | str]]] = {}
        for ent_id in self.activities:
            macros, ready = self._proxy.get_macros_for_activity(
                ent_id, fetch_if_missing=False
            )
            if ready and macros:
                order = self._proxy.state.activity_favorites_order.get(
                    ent_id & 0xFF, []
                )
                result[ent_id] = [
                    {
                        "command_id": int(row.get("command_id", 0)) & 0xFF,
                        "label": str(row.get("name") or ""),
                    }
                    for row in self.describe_favorites_order(ent_id, order)
                    if row.get("type") == "macro"
                    and int(row.get("command_id", 0)) & 0xFF
                ]

        return result

    def get_activity_favorites(self) -> dict[int, list[dict[str, int | str]]]:
        """Return favorites in the physical remote's display order.

        Build from favorite slots rather than the label-only projection.  A
        structural refresh can briefly have live slots before all targeted
        command-label reads complete; retaining those rows (with the same
        fallback label used by the cache export) prevents the Virtual Remote
        from incorrectly presenting an empty Favorites drawer.
        """

        favorites: dict[int, list[dict[str, int | str]]] = {}

        for act_id in self.activities:
            order = self._proxy.state.activity_favorites_order.get(
                act_id & 0xFF, []
            )
            rows = [
                {
                    "button_id": int(row.get("button_id", 0)) & 0xFF,
                    "name": str(row.get("name") or ""),
                    "device_id": int(row.get("device_id", 0)) & 0xFF,
                    "command_id": int(row.get("command_id", 0)) & 0xFF,
                }
                for row in self.describe_favorites_order(act_id, order)
                if row.get("type") == "favorite"
                and int(row.get("command_id", 0)) & 0xFF
            ]
            if rows:
                favorites[act_id] = rows

        return favorites

    def get_index_state(self) -> str:
        if not self.hub_connected:
            return "offline"

        if not (self.activities_ready and self.devices_ready):
            return "loading"

        if self._commands_in_flight or self._pending_button_fetch:
            return "loading"

        return "ready"

    def get_buttons_for_current(self) -> tuple[list[int], bool]:
        # entities call this often; keep it cheap
        if self.current_activity is None:
            return ([], True)
        return self._proxy.get_buttons_for_entity(self.current_activity, fetch_if_missing=False)

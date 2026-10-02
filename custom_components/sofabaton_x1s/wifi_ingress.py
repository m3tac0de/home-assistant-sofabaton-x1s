"""Wifi Commands ingress for SofabatonHub (R6, CR-H1-13).

Presses arriving over the Roku HTTP listener or MQTT, their action
dispatch, the MQTT activity-state ingress, and the IP-command and IR
emission records the sensors read.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    CONF_BANNER_MAC,
    HUB_VERSION_X2,
    signal_ip_commands,
    signal_ir_intercept,
)
from .command_config import (
    async_get_command_config_store,
    DEFAULT_WIFI_DEVICE_KEY,
    map_wifi_mqtt_key,
    normalize_command_name,
    WIFI_TRANSPORT_MQTT,
    wifi_device_requires_listener,
)
from .hub_identity import real_hub_mac


class WifiIngressMixin:
    """Wifi Commands ingress for SofabatonHub (R6, CR-H1-13)."""

    def get_roku_action_id(self) -> str:
        raw_mac = str(self.mac or "").strip()
        normalized_mac = "".join(ch for ch in raw_mac if ch.lower() in "0123456789abcdef").lower()
        if normalized_mac:
            return normalized_mac
        return str(self.entry_id).strip()

    async def async_handle_roku_http_post(
        self,
        *,
        path: str,
        headers: dict[str, str],
        body: bytes,
        source_ip: str,
    ) -> None:
        parts = [part for part in path.strip("/").split("/") if part]
        device_id = -1
        command_label = ""
        device_name = None
        press_type = "short"
        command_index: int | None = None
        resolved_slot: dict[str, Any] | None = None

        if len(parts) >= 4 and parts[0] == "launch":
            try:
                device_id = int(parts[2])
            except ValueError:
                device_id = -1

            if parts[3].isdigit():
                # New format: launch/{hub_id}/{device_id}/{command_index}/{press_type}
                # Resolve command from the deployed snapshot (independent of staged config).
                command_index = int(parts[3])
                if len(parts) >= 5 and parts[4] in ("short", "long"):
                    press_type = parts[4]
                store = await async_get_command_config_store(self.hass)
                deployed = store.get_deployed_wifi_commands(self.entry_id, hub_device_id=device_id)
                if 0 <= command_index < len(deployed):
                    resolved_slot = deployed[command_index]
                    command_label = str(resolved_slot.get("name", ""))
            else:
                # Old format (backwards compat):
                # launch/{hub_id}/{device_id}/{command_name}/{device_name}/{press_type}
                command_label = unquote(parts[3]).replace("_", " ")
                trailing_parts = parts[4:]
                if trailing_parts and trailing_parts[-1] in ("short", "long"):
                    press_type = trailing_parts[-1]
                    trailing_parts = trailing_parts[:-1]
                if trailing_parts:
                    device_name = unquote("/".join(trailing_parts)).replace("_", " ")

        timestamp = datetime.now(timezone.utc)
        resolved_device_name = (
            device_name
            or (self._get_cached_device_name(device_id) if device_id >= 0 else None)
            or (self.devices.get(device_id, {}).get("name") if device_id >= 0 else None)
        )
        record = {
            "entity_id": device_id,
            "entity_kind": "device",
            "entity_name": resolved_device_name,
            "command_id": command_label,
            "command_index": command_index,
            "command_label": command_label,
            "button_label": command_label,
            "press_type": press_type,
            "timestamp": timestamp.timestamp(),
            "iso_time": timestamp.isoformat(),
            "source_ip": source_ip,
            "path": path,
            "body": body.decode("utf-8", errors="ignore"),
            "headers": headers,
            "transport": "http",
        }
        self._log.info(
            "[WIFI_HTTP] mapped listener request source_ip=%s device_id=%s device_name=%s command=%s press_type=%s path=%s",
            source_ip or "unknown",
            device_id,
            resolved_device_name or "<unknown>",
            command_label or "<unresolved>",
            press_type,
            path,
        )
        await self._async_dispatch_wifi_press(
            record=record,
            resolved_slot=resolved_slot,
            command_index=command_index,
            device_id=device_id,
            command_label=command_label,
            press_type=press_type,
        )

    async def _async_dispatch_wifi_press(
        self,
        *,
        record: dict[str, Any],
        resolved_slot: dict[str, Any] | None,
        command_index: int | None,
        device_id: int,
        command_label: str,
        press_type: str,
    ) -> None:
        """Shared delivery tail for wifi presses.

        HTTP callbacks and MQTT publishes converge here: sensor record,
        dispatcher signal, and
        the slot-action runner are transport-agnostic.
        """

        if press_type == "long" and device_id >= 0:
            store = await async_get_command_config_store(self.hass)
            if store.is_wifi_events_hub_device(self.entry_id, device_id):
                # A Wifi Event is one record with one action. A long
                # record still on the hub from before that model is an
                # alias of its event until the user's Sync retires it
                # (wifi-events-single-record-plan §3.2).
                press_type = "short"
                record["press_type"] = "short"

        self._last_ip_command = record
        async_dispatcher_send(self.hass, signal_ip_commands(self.entry_id))
        if resolved_slot is not None and command_index is not None:
            await self._async_maybe_run_live_wifi_slot_action(
                command_index=command_index,
                hub_device_id=device_id if device_id >= 0 else None,
                fallback_slot=resolved_slot,
                command_label=command_label,
                press_type=press_type,
            )
        else:
            await self._async_maybe_run_configured_ip_action(command_label, press_type=press_type)

    async def _async_execute_action_config(self, action_config: dict[str, Any]) -> None:
        self._log.debug("[WIFI_ACTION] action_config=%r", action_config)
        action = str(action_config.get("action") or "").lower().strip()
        implicit_service = (not action or action == "default") and (
            action_config.get("service") or action_config.get("perform_action")
        )
        if action == "none":
            return

        if action in ("call-service", "perform-action") or implicit_service:
            svc = str(
                action_config.get("service") or action_config.get("perform_action") or ""
            ).strip()
            if "." not in svc:
                return
            domain, service = svc.split(".", 1)
            service_data = action_config.get("service_data") or action_config.get("data") or {}
            target = (
                action_config.get("target")
                if isinstance(action_config.get("target"), dict)
                else None
            )
            # Not blocking: the hub waits for the callback's answer, and a
            # long script (delays) held it back and invited a re-delivery
            # that ran the action twice (CR-H3-9).
            await self.hass.services.async_call(
                domain,
                service,
                service_data,
                target=target,
                blocking=False,
            )

    async def _async_run_wifi_slot_action(
        self,
        slot: dict[str, Any],
        command_label: str,
        *,
        press_type: str = "short",
    ) -> None:
        """Execute the configured action from a resolved command slot dict."""
        if press_type == "long":
            if not bool(slot.get("long_press_enabled")):
                return
            action = (
                slot.get("long_press_action")
                if isinstance(slot.get("long_press_action"), dict)
                else {}
            )
        else:
            action = slot.get("action") if isinstance(slot.get("action"), dict) else {}
        try:
            await self._async_execute_action_config(action)
        except Exception as err:  # pragma: no cover - service boundary
            self._log.warning(
                "[%s] Failed executing configured IP action for '%s': %s",
                self.entry_id,
                command_label,
                err,
            )

    async def _async_maybe_run_configured_ip_action(
        self,
        command_label: str,
        *,
        press_type: str = "short",
    ) -> None:
        store = await async_get_command_config_store(self.hass)
        payload = await store.async_get_hub_config(self.entry_id, device_key=DEFAULT_WIFI_DEVICE_KEY)
        command_key = normalize_command_name(command_label)
        for slot in payload.get("commands", []):
            if normalize_command_name(slot.get("name")) != command_key:
                continue
            await self._async_run_wifi_slot_action(slot, command_label, press_type=press_type)
            return

    async def _async_maybe_run_live_wifi_slot_action(
        self,
        *,
        command_index: int,
        hub_device_id: int | None,
        fallback_slot: dict[str, Any],
        command_label: str,
        press_type: str = "short",
    ) -> None:
        store = await async_get_command_config_store(self.hass)
        live_slot = store.get_live_wifi_command_slot(
            self.entry_id,
            command_index=command_index,
            hub_device_id=hub_device_id,
        )
        await self._async_run_wifi_slot_action(
            live_slot if isinstance(live_slot, dict) else fallback_slot,
            command_label,
            press_type=press_type,
        )

    async def _async_wifi_listener_needed(self) -> bool:
        store = await async_get_command_config_store(self.hass)
        devices = await store.async_list_hub_devices(self.entry_id)
        return any(wifi_device_requires_listener(device) for device in devices)

    # ------------------------------------------------------------------
    # MQTT press ingress
    # ------------------------------------------------------------------

    def _wifi_mqtt_mac(self) -> str | None:
        """The MAC to build the press topic from, in preference order.

        1. The hub's SELF-REPORTED MAC from the connect banner
           (payload[0:6], bench-verified on X1/X1S/X2) — ground truth,
           deliberately exempt from the OUI heuristic because real
           Sofabaton MACs can carry the locally-administered or even
           multicast bit (X1/X1S captures).
        2. The banner MAC persisted in entry data by a previous session,
           so a restart subscribes before the first TCP connect.
        3. The discovery MAC through :func:`real_hub_mac`, whose only
           remaining job is rejecting the manual-add synthetic identity.
        """

        if self.banner_mac:
            return self.banner_mac
        config_entries = getattr(self.hass, "config_entries", None)
        entry = (
            config_entries.async_get_entry(self.entry_id)
            if config_entries is not None and hasattr(config_entries, "async_get_entry")
            else None
        )
        stored = str(entry.data.get(CONF_BANNER_MAC) or "") if entry is not None else ""
        normalized = "".join(
            ch for ch in stored if ch.lower() in "0123456789abcdef"
        ).upper()
        if len(normalized) == 12 and set(normalized) != {"0"}:
            self.banner_mac = normalized
            return normalized
        return real_hub_mac(self.mac)

    def wifi_mqtt_available(self) -> bool:
        """Whether MQTT transport may be offered for this hub.

        X2, MQTT integration loaded, and the hub's MAC known: the press
        topic is the hub's own MAC, so without it the transport cannot
        work. The banner self-report covers manually-added hubs from
        their first TCP connect onward (see :meth:`_wifi_mqtt_mac`).
        """

        return (
            self.version == HUB_VERSION_X2
            and "mqtt" in self.hass.config.components
            and self._wifi_mqtt_mac() is not None
        )

    def _wifi_mqtt_press_topic(self) -> str | None:
        """``<MAC>/up`` with the MAC as uppercase bare hex.

        The hub publishes on the uppercase form (bench 2026-08-10; the
        lowercase subscription stayed silent). ``None`` when no credible
        MAC is known — never subscribe on a synthetic manual-add MAC.
        """

        normalized = self._wifi_mqtt_mac()
        if normalized is None:
            return None
        return f"{normalized}/up"

    async def _async_wifi_mqtt_ingress_needed(self) -> bool:
        store = await async_get_command_config_store(self.hass)
        devices = await store.async_list_hub_devices(self.entry_id)
        return any(
            device.get("deployed_transport") == WIFI_TRANSPORT_MQTT
            for device in devices
        )

    async def async_update_wifi_mqtt_ingress(self) -> None:
        """Align the ``<MAC>/up`` subscription with the store state.

        Mirrors the HTTP listener's refcount rule: subscribed while at
        least one record is deployed over MQTT, torn down when none
        remain. Safe to call at any time; a no-op when nothing changed
        or when the MQTT integration is unavailable.
        """

        try:
            needed = await self._async_wifi_mqtt_ingress_needed()
        except Exception:  # noqa: BLE001 - never let ingress upkeep raise
            self._log.debug(
                "[%s] mqtt ingress store check failed", self.entry_id, exc_info=True
            )
            needed = False
        topic = self._wifi_mqtt_press_topic()
        if not needed or topic is None or "mqtt" not in self.hass.config.components:
            await self.async_stop_wifi_mqtt_ingress()
            return
        if self._mqtt_press_unsub is not None and self._mqtt_press_topic == topic:
            return
        await self.async_stop_wifi_mqtt_ingress()
        try:
            from homeassistant.components import mqtt as ha_mqtt

            self._mqtt_press_unsub = await ha_mqtt.async_subscribe(
                self.hass, topic, self._async_handle_wifi_mqtt_message
            )
            self._mqtt_press_topic = topic
            self._log.info("[WIFI_MQTT] subscribed to %s", topic)
        except Exception as err:  # noqa: BLE001 - broker/integration not ready
            self._mqtt_press_unsub = None
            self._mqtt_press_topic = None
            self._log.warning("[WIFI_MQTT] subscribe to %s failed: %s", topic, err)

    async def async_stop_wifi_mqtt_ingress(self) -> None:
        unsub, self._mqtt_press_unsub = self._mqtt_press_unsub, None
        self._mqtt_press_topic = None
        if unsub is not None:
            try:
                unsub()
            except Exception:  # noqa: BLE001
                self._log.debug("[WIFI_MQTT] unsubscribe failed", exc_info=True)

    async def _async_handle_wifi_mqtt_message(self, msg: Any) -> None:
        # Hard retain drop: a broker, bridge, or user tooling can retain
        # even though the hub does not (F6) — a replayed press must never
        # run an Action on restart (§6 step 1).
        if getattr(msg, "retain", False):
            return
        payload_raw = msg.payload
        if isinstance(payload_raw, (bytes, bytearray)):
            payload_raw = payload_raw.decode("utf-8", "replace")
        try:
            data = json.loads(payload_raw)
        except (TypeError, ValueError):
            return
        if not isinstance(data, dict):
            return
        try:
            device_id = int(data.get("device_id"))
            key_id = int(data.get("key_id"))
        except (TypeError, ValueError):
            return

        # Unmanaged-device guard (§6 step 3): only devices we deployed
        # over MQTT may fire Actions — app-created MQTT devices stay
        # invisible here.
        store = await async_get_command_config_store(self.hass)
        devices = await store.async_list_hub_devices(self.entry_id)
        record_payload = next(
            (
                device
                for device in devices
                if device.get("deployed_device_id") == device_id
                and device.get("deployed_transport") == WIFI_TRANSPORT_MQTT
            ),
            None,
        )
        if record_payload is None:
            self._log.debug(
                "[WIFI_MQTT] dropping unmanaged press device_id=%s key_id=%s",
                device_id,
                key_id,
            )
            return

        deployed = store.get_deployed_wifi_commands(
            self.entry_id, hub_device_id=device_id
        )
        slot_count = len(deployed) or int(record_payload.get("slot_count") or 0)
        mapped = map_wifi_mqtt_key(key_id, slot_count)
        if mapped is None:
            self._log.info(
                "[WIFI_MQTT] dropping out-of-range key_id=%s (slot_count=%s) device_id=%s",
                key_id,
                slot_count,
                device_id,
            )
            return
        command_index, press_type = mapped
        resolved_slot = (
            deployed[command_index] if 0 <= command_index < len(deployed) else None
        )
        command_label = str((resolved_slot or {}).get("name") or "")

        timestamp = datetime.now(timezone.utc)
        resolved_device_name = (
            self._get_cached_device_name(device_id)
            or self.devices.get(device_id, {}).get("name")
        )
        record = {
            "entity_id": device_id,
            "entity_kind": "device",
            "entity_name": resolved_device_name,
            "command_id": command_label,
            "command_index": command_index,
            "command_label": command_label,
            "button_label": command_label,
            "press_type": press_type,
            "timestamp": timestamp.timestamp(),
            "iso_time": timestamp.isoformat(),
            # No source ip exists for a broker delivery; left empty rather
            # than faked (plan §6 sensor note).
            "source_ip": "",
            "path": "",
            "body": "",
            "headers": {},
            "transport": "mqtt",
        }
        self._log.info(
            "[WIFI_MQTT] press device_id=%s key_id=%s -> index=%s press=%s command=%s",
            device_id,
            key_id,
            command_index,
            press_type,
            command_label or "<unresolved>",
        )
        await self._async_dispatch_wifi_press(
            record=record,
            resolved_slot=resolved_slot,
            command_index=command_index,
            device_id=device_id,
            command_label=command_label,
            press_type=press_type,
        )

    # ------------------------------------------------------------------
    # MQTT activity-state ingress (X2 fast path)
    # ------------------------------------------------------------------
    #
    # The X2 publishes every activity transition on
    # activity/<MAC>/activity_control_up with the new id in the payload,
    # which beats the TCP ACK_READY → REQ_ACTIVITIES round-trip (and, when
    # ACK_READY lands after the power macro, can lead by seconds). The
    # push is applied through the proxy's hint pipeline immediately; the
    # TCP path stays untouched behind it as reconciliation, so a missed,
    # stale, or unknown-id push degrades to today's behavior instead of
    # failing. The proxy holds hub-bound user commands until that
    # ACK_READY (bounded; see _wait_external_settle) so automations firing
    # on the early state change cannot reach the hub mid-power-macro.

    def _activity_state_topic(self) -> str | None:
        """``activity/<MAC>/activity_control_up`` with the press-topic MAC.

        Same MAC rendering as ``_wifi_mqtt_press_topic`` (uppercase bare
        hex, hub self-report preferred); ``None`` when no credible MAC is
        known.
        """

        normalized = self._wifi_mqtt_mac()
        if normalized is None:
            return None
        return f"activity/{normalized}/activity_control_up"

    async def async_update_activity_state_ingress(self) -> None:
        """Align the activity-state subscription with the hub identity.

        Unlike the press ingress there is no store refcount: the
        subscription is on whenever MQTT transport is available for this
        hub at all (X2, MQTT integration loaded, MAC known). Safe to call
        at any time; a no-op when nothing changed.
        """

        try:
            available = self.wifi_mqtt_available()
        except Exception:  # noqa: BLE001 - never let ingress upkeep raise
            self._log.debug(
                "[MQTT_ACT] availability check failed", exc_info=True
            )
            available = False
        topic = self._activity_state_topic() if available else None
        if topic is None:
            await self.async_stop_activity_state_ingress()
            return
        if self._mqtt_activity_unsub is not None and self._mqtt_activity_topic == topic:
            return
        await self.async_stop_activity_state_ingress()
        try:
            from homeassistant.components import mqtt as ha_mqtt

            self._mqtt_activity_unsub = await ha_mqtt.async_subscribe(
                self.hass, topic, self._async_handle_activity_state_message
            )
            self._mqtt_activity_topic = topic
            self._log.info("[MQTT_ACT] subscribed to %s", topic)
        except Exception as err:  # noqa: BLE001 - broker/integration not ready
            self._mqtt_activity_unsub = None
            self._mqtt_activity_topic = None
            self._log.warning("[MQTT_ACT] subscribe to %s failed: %s", topic, err)

    async def async_stop_activity_state_ingress(self) -> None:
        unsub, self._mqtt_activity_unsub = self._mqtt_activity_unsub, None
        self._mqtt_activity_topic = None
        if unsub is not None:
            try:
                unsub()
            except Exception:  # noqa: BLE001
                self._log.debug("[MQTT_ACT] unsubscribe failed", exc_info=True)

    async def _async_handle_activity_state_message(self, msg: Any) -> None:
        # Retain drop, mirroring the press ingress: the hub itself never
        # retains, but a broker/bridge can — a replayed transition must
        # never flip state on restart.
        if getattr(msg, "retain", False):
            return
        payload_raw = msg.payload
        if isinstance(payload_raw, (bytes, bytearray)):
            payload_raw = payload_raw.decode("utf-8", "replace")
        try:
            data = json.loads(payload_raw)
        except (TypeError, ValueError):
            return
        if not isinstance(data, dict):
            return
        # The hub publishes flat {"activity_id", "state"}; tolerate the
        # request-side {"data": {...}} envelope as well.
        if "activity_id" not in data and isinstance(data.get("data"), dict):
            data = data["data"]
        try:
            activity_id = int(data.get("activity_id"))
        except (TypeError, ValueError):
            return
        state = str(data.get("state") or "").strip().lower()

        if not self.hub_connected or not self.activities_ready:
            # No TCP link to verify (or send commands) against, or the
            # activities baseline is not read yet: the initial sync is
            # the safer source in both cases.
            return

        if activity_id == 0xFF:
            # 255 = all activities off (OFF press).
            new_id: int | None = None
        elif state == "on":
            new_id = activity_id
        elif state == "off":
            if self.current_activity != (activity_id & 0xFF):
                # An individual off for a non-current activity carries no
                # state we track.
                return
            new_id = None
        else:
            self._log.debug(
                "[MQTT_ACT] unhandled payload activity_id=%s state=%s",
                activity_id,
                state,
            )
            return

        applied = await self.hass.async_add_executor_job(
            self._proxy.apply_external_activity_state, new_id
        )
        if applied:
            self._log.info(
                "[MQTT_ACT] applied activity=%s (from activity_id=%s state=%s)",
                new_id,
                activity_id,
                state or "<none>",
            )

    def get_last_ip_command(self) -> dict[str, Any] | None:
        if self._last_ip_command is None:
            return None
        return dict(self._last_ip_command)

    def record_ir_emission(
        self, *, command: Any, timings: list[int], carrier_hz: int, blob: bytes
    ) -> None:
        """Ring-buffer a command sent through the infrared emitter (IR5).

        Consecutive identical sends (same blob) collapse into one entry
        with a bumped ``count`` and refreshed timestamp. Feeds the IR
        intercept sensor via its dispatcher signal.
        """

        from . import ir_intercept  # local import: keeps hub import light

        record = ir_intercept.build_emission_record(
            command=command, timings=timings, carrier_hz=carrier_hz, blob=blob
        )
        last = self._ir_emissions[-1] if self._ir_emissions else None
        if last is not None and last["payload_hex"] == record["payload_hex"]:
            last["count"] += 1
            last["when"] = record["when"]
        else:
            self._ir_emissions.append(record)
        async_dispatcher_send(self.hass, signal_ir_intercept(self.entry_id))

    def get_ir_emissions(self) -> list[dict[str, Any]]:
        """Recent emitter sends, oldest first (copies)."""

        return [dict(record) for record in self._ir_emissions]

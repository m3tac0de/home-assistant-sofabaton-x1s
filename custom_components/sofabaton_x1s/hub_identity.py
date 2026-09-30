"""The hub's identity for SofabatonHub (R6, CR-H1-13).

Model, display name and MAC helpers, the banner-driven identity sync, the
device-registry name and the firmware-floor repair issue.
"""

from __future__ import annotations

from functools import partial
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    CONF_MDNS_TXT,
    CONF_MDNS_VERSION,
    CONF_BANNER_MAC,
    HVER_BY_HUB_VERSION,
    MIN_RECOMMENDED_FIRMWARE,
    firmware_is_outdated,
    classify_hub_version,
    format_hub_entry_title,
)

if TYPE_CHECKING:
    from .hub import SofabatonHub


def real_hub_mac(value: Any) -> str | None:
    """Normalize a hub MAC to uppercase bare hex, rejecting synthetic ones.

    Manually-added hubs get a stable MAC-LIKE identity from
    ``config_flow.generate_static_mac`` (MD5 of ``host:port`` with the
    locally-administered bit forced on). That value is fine as an entry
    id but is NOT the hub's MAC, and the MQTT press topic is the hub's
    real MAC — subscribing on the synthetic one connects cleanly and
    then never receives anything. Production hub MACs are OUI-assigned
    (locally-administered bit clear), so that bit separates the two.
    Returns ``None`` for missing, malformed, multicast, or
    locally-administered values.
    """

    raw = str(value or "").strip()
    normalized = "".join(ch for ch in raw if ch.lower() in "0123456789abcdef").upper()
    if len(normalized) != 12:
        return None
    first_byte = int(normalized[:2], 16)
    if first_byte & 0x03:
        return None
    return normalized


def get_hub_model(entry: ConfigEntry) -> str:
    """Return the model string for this hub, preferring detected mDNS metadata."""

    mdns_txt = entry.data.get("mdns_txt", {})
    if isinstance(mdns_txt, dict):
        try:
            return classify_hub_version(mdns_txt)
        except ValueError:
            # Fall through to the stored config-entry value when the
            # advertisement is missing/unrecognised; the banner will
            # repair it on first connect.
            pass

    model = entry.options.get(CONF_MDNS_VERSION) or entry.data.get(CONF_MDNS_VERSION)
    if isinstance(model, str) and model:
        return model

    return "X1"


def hub_device_info(hub: "SofabatonHub", entry: ConfigEntry) -> DeviceInfo:
    """The hub's device-registry record, the same from every platform.

    The model is the hub model alone: a platform adding "via proxy" made
    the registry model flip with platform setup order (CR-H3-12).
    """

    firmware = getattr(hub, "hub_firmware_version", None)
    return DeviceInfo(
        identifiers={(DOMAIN, entry.data[CONF_MAC])},
        name=get_hub_display_name(hub, entry),
        manufacturer="Sofabaton",
        model=get_hub_model(entry),
        sw_version=str(firmware) if firmware is not None else None,
    )


def get_hub_display_name(hub: "SofabatonHub", entry: ConfigEntry | None = None) -> str:
    """Return the current authoritative hub name for UI and discovery."""

    name = str(getattr(hub, "name", "") or "").strip()
    if name:
        return name

    if entry is not None:
        fallback = str(entry.data.get(CONF_NAME) or "").strip()
        if fallback:
            return fallback

    return "Sofabaton Hub"


class HubIdentityMixin:
    """The hub's identity for SofabatonHub (R6, CR-H1-13)."""

    def _apply_banner_info(self, banner_info: dict[str, Any] | None) -> bool:
        info = banner_info if isinstance(banner_info, dict) else {}
        next_model = str(info.get("model") or "").strip() or None
        next_batch = str(info.get("production_batch") or "").strip() or None
        firmware_value = info.get("firmware_version")
        next_firmware = int(firmware_value) if isinstance(firmware_value, (int, float)) else None
        # Self-reported MAC (banner payload[0:6]). Deliberately NOT run
        # through real_hub_mac(): real Sofabaton MACs can carry the
        # locally-administered / multicast bits (X1 and X1S captures),
        # and the banner cannot contain the manual-add synthetic value.
        raw_mac = str(info.get("mac") or "")
        normalized_mac = "".join(
            ch for ch in raw_mac if ch.lower() in "0123456789abcdef"
        ).upper()
        next_banner_mac = (
            normalized_mac if len(normalized_mac) == 12 and set(normalized_mac) != {"0"} else None
        )
        # A missing banner never clears a previously learned MAC.
        if next_banner_mac is None:
            next_banner_mac = self.banner_mac

        changed = (
            self.banner_model != next_model
            or self.production_batch != next_batch
            or self.hub_firmware_version != next_firmware
            or self.banner_mac != next_banner_mac
        )
        if not changed:
            return False

        self.banner_model = next_model
        self.production_batch = next_batch
        self.hub_firmware_version = next_firmware
        self.banner_mac = next_banner_mac
        return True

    def _build_authoritative_mdns_txt(
        self,
        *,
        name: str,
        version: str,
        firmware_version: int,
    ) -> dict[str, str]:
        next_txt = dict(self.mdns_txt)
        next_txt.pop("HA_PROXY", None)
        next_txt["NAME"] = name
        next_txt["HVER"] = HVER_BY_HUB_VERSION[version]
        next_txt["AVER"] = str(int(firmware_version))
        return next_txt

    async def _async_update_device_registry_name(self, next_name: str) -> None:
        """Keep the HA device registry aligned with the authoritative hub name."""

        normalized_name = str(next_name or "").strip()
        if not normalized_name:
            return

        device_registry = dr.async_get(self.hass)
        if device_registry is None:
            return

        device = self._async_hub_device(device_registry)
        if device is None:
            return

        if str(getattr(device, "name_by_user", "") or "").strip():
            return

        current_name = str(getattr(device, "name", "") or "").strip()
        if current_name == normalized_name:
            return

        device_registry.async_update_device(device.id, name=normalized_name)

    def _async_hub_device(self, device_registry: "dr.DeviceRegistry"):
        """Look up this hub's device-registry entry, or None if not found."""

        config_entries = getattr(self.hass, "config_entries", None)
        entry = (
            config_entries.async_get_entry(self.entry_id)
            if config_entries is not None and hasattr(config_entries, "async_get_entry")
            else None
        )
        hub_mac = str(
            self.mac or (entry.data.get(CONF_MAC) if entry is not None else "") or ""
        ).strip()
        if (
            not hub_mac
            or not hasattr(device_registry, "async_get_device")
            or not hasattr(device_registry, "async_update_device")
        ):
            return None
        return device_registry.async_get_device(
            identifiers={(DOMAIN, hub_mac)},
            connections=set(),
        )

    async def _async_update_firmware_state(self) -> None:
        """Publish the hub firmware version and raise/clear the outdated-firmware repair.

        Several tracker reports (integration issues #270, #271 and #272)
        traced back to bugs already fixed in newer hub firmware, so we
        surface the installed version on the hub's device page and prompt
        the user through Home Assistant's Repairs panel when it falls below
        the minimum we recommend. The prompt is informational: the hub
        is updated from the Sofabaton app, not from Home
        Assistant, so there is nothing for us to "fix" automatically.
        """

        installed = self.hub_firmware_version
        hub_version = self.version

        if installed is not None:
            device_registry = dr.async_get(self.hass)
            if device_registry is not None:
                device = self._async_hub_device(device_registry)
                if device is not None and str(
                    getattr(device, "sw_version", "") or ""
                ) != str(installed):
                    device_registry.async_update_device(
                        device.id, sw_version=str(installed)
                    )

        issue_id = f"outdated_firmware_{self.entry_id}"
        if firmware_is_outdated(hub_version, installed):
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                issue_id,
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="outdated_firmware",
                translation_placeholders={
                    "name": str(self.name or hub_version or "hub"),
                    "model": str(hub_version or ""),
                    "installed": str(installed),
                    "recommended": str(MIN_RECOMMENDED_FIRMWARE.get(hub_version, "")),
                },
            )
        else:
            ir.async_delete_issue(self.hass, DOMAIN, issue_id)

    async def _async_sync_authoritative_identity(
        self,
        banner_info: dict[str, Any] | None,
    ) -> bool:
        banner_changed = self._apply_banner_info(banner_info)
        if not isinstance(banner_info, dict):
            return banner_changed

        next_name = str(banner_info.get("name") or "").strip()
        next_version = self.banner_model
        next_firmware = self.hub_firmware_version
        if not next_name or not next_version or next_firmware is None:
            if banner_changed:
                # The banner MAC may have just arrived even when the rest
                # of the identity is incomplete; both MQTT subscriptions
                # depend on it.
                await self.async_update_wifi_mqtt_ingress()
                await self.async_update_activity_state_ingress()
            await self._async_update_firmware_state()
            return banner_changed

        next_txt = self._build_authoritative_mdns_txt(
            name=next_name,
            version=next_version,
            firmware_version=next_firmware,
        )
        runtime_txt = dict(next_txt)
        runtime_txt["HA_PROXY"] = "1"

        previous_name = str(self.name or "").strip()
        identity_changed = (
            previous_name != next_name
            or self.version != next_version
            or dict((k, v) for k, v in self.mdns_txt.items() if k != "HA_PROXY") != next_txt
        )

        self.name = next_name
        self.version = next_version
        self.mdns_txt = runtime_txt
        self.mac = runtime_txt.get("MAC") or runtime_txt.get("mac") or None
        await self.hass.async_add_executor_job(
            partial(
                self._proxy.update_discovery_identity,
                mdns_txt=self.mdns_txt,
                hub_version=self.version,
            )
        )
        # A manually-added hub that mDNS just identified gains its REAL
        # MAC here; re-point (or first-establish) the MQTT subscriptions.
        await self.async_update_wifi_mqtt_ingress()
        await self.async_update_activity_state_ingress()

        config_entries = getattr(self.hass, "config_entries", None)
        entry = (
            config_entries.async_get_entry(self.entry_id)
            if config_entries is not None and hasattr(config_entries, "async_get_entry")
            else None
        )
        if entry is not None:
            data = dict(entry.data)
            options = dict(entry.options)
            changed = False
            if data.get(CONF_NAME) != next_name:
                data[CONF_NAME] = next_name
                changed = True
            if data.get(CONF_MDNS_TXT) != next_txt:
                data[CONF_MDNS_TXT] = next_txt
                changed = True
            if data.get(CONF_MDNS_VERSION) != next_version:
                data[CONF_MDNS_VERSION] = next_version
                changed = True
            if options.get(CONF_MDNS_VERSION) != next_version:
                options[CONF_MDNS_VERSION] = next_version
                changed = True
            if self.banner_mac and data.get(CONF_BANNER_MAC) != self.banner_mac:
                # Persist the self-reported MAC so MQTT ingress can
                # subscribe right at setup after a restart, before the
                # hub's first TCP connect delivers a fresh banner.
                data[CONF_BANNER_MAC] = self.banner_mac
                changed = True
            expected_title = format_hub_entry_title(
                next_version,
                data.get("host"),
                data.get(CONF_MAC),
            )
            update_kwargs: dict[str, Any] = {}
            if changed:
                update_kwargs["data"] = data
                update_kwargs["options"] = options
            if entry.title != expected_title:
                update_kwargs["title"] = expected_title
            if update_kwargs:
                self.hass.config_entries.async_update_entry(entry, **update_kwargs)

        if previous_name != next_name:
            await self._async_update_device_registry_name(next_name)

        await self._async_update_firmware_state()

        return banner_changed or identity_changed

    async def async_set_hub_name(
        self,
        name: str,
        *,
        timeout: float = 5.0,
        sync_identity: bool = True,
    ) -> bool:
        """Persist a new hub name and refresh our cached identity."""

        next_name = str(name or "").strip()
        if not next_name:
            return False

        ok = await self.hass.async_add_executor_job(
            partial(self._proxy.set_hub_name, next_name, timeout=timeout)
        )
        if not ok:
            return False

        info = dict(self._proxy.get_banner_info() or {})
        info["name"] = next_name
        if not info.get("model"):
            info["model"] = self.banner_model or self.version
        if info.get("firmware_version") is None and self.hub_firmware_version is not None:
            info["firmware_version"] = self.hub_firmware_version
        if not info.get("production_batch") and self.production_batch:
            info["production_batch"] = self.production_batch

        if sync_identity:
            await self._async_sync_authoritative_identity(info)
        self.name = next_name
        return True

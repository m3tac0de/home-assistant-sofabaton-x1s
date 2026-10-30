"""The X2 hub's own MQTT broker link: its status and its setup.

The X2 publishes Wifi Device presses and activity changes to an MQTT broker
that is normally set in the Sofabaton app. Two commands reach that link
over the hub session (candidates, not benched yet; Wifi webhook transport
plan, gates B5 and B11):

* status: family ``0x74`` with no payload; the hub answers family ``0x74``
  ``[1]`` connected or ``[0]`` not connected.
* setup: family ``0x73`` with ``[length BE16]`` + broker IPv4 + port BE16 +
  the hub's MAC + username + password (each a character count and
  UTF-16BE text, up to 60 characters). The hub tries to connect for up to
  15 s and answers family ``0x74`` ``[1]`` or ``[0]``.

The setup carries a password: frame logging masks every family-``0x73``
payload (:func:`redact_wire_hex`), and nothing here logs the values.
"""

from __future__ import annotations

import ipaddress
import re
import time
from typing import TYPE_CHECKING, Any, Optional

from .hub_versions import HUB_VERSION_X2
from .protocol_const import FAMILY_HUB_MQTT_SETUP, FAMILY_HUB_MQTT_STATUS

if TYPE_CHECKING:
    from .proxy_host import _ProxyHost

#: Longest username or password the hub takes, in characters.
HUB_MQTT_MAX_TEXT = 60
#: The frame length is one byte.
_MAX_FRAME_PAYLOAD = 0xFF
#: How long the hub keeps trying a new broker before it answers.
HUB_MQTT_CONNECT_TIMEOUT = 15.0


class HubMqttValidationError(ValueError):
    """Invalid broker settings, with a stable code for localized clients."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _utf16_field(text: str, what: str) -> bytes:
    encoded = str(text or "").encode("utf-16-be")
    units = len(encoded) // 2
    if units > HUB_MQTT_MAX_TEXT:
        raise HubMqttValidationError(
            f"broker_{what}_too_long",
            f"the broker {what} is longer than {HUB_MQTT_MAX_TEXT} UTF-16 code units",
        )
    return bytes([units]) + encoded


def _mac_bytes(hub_mac: str) -> bytes:
    digits = re.sub(r"[^0-9A-Fa-f]", "", str(hub_mac or ""))
    if len(digits) != 12 or set(digits) == {"0"}:
        raise ValueError(f"the hub's MAC is not known ({hub_mac!r})")
    return bytes.fromhex(digits)


def build_hub_mqtt_setup_payload(
    *,
    broker_ip: str,
    broker_port: int,
    hub_mac: str,
    username: str,
    password: str,
) -> bytes:
    """The family-``0x73`` payload that points the hub at a broker.

    ``broker_ip`` must be an IPv4 address (the hub stores four bytes; the
    caller resolves names). Raises ``ValueError`` for anything the hub
    could not take, before a byte is sent.
    """

    try:
        ip = ipaddress.IPv4Address(str(broker_ip or "").strip()).packed
    except (ipaddress.AddressValueError, ValueError) as err:
        raise HubMqttValidationError("broker_invalid_host", "the broker address must be an IPv4 address") from err
    port = broker_port
    if isinstance(port, bool) or not isinstance(port, int) or not (0 < port < 65536):
        raise HubMqttValidationError("broker_invalid_port", "the broker port must be 1..65535")
    data = (
        ip
        + port.to_bytes(2, "big")
        + _mac_bytes(hub_mac)
        + _utf16_field(username, "username")
        + _utf16_field(password, "password")
    )
    payload = len(data).to_bytes(2, "big") + data
    if len(payload) > _MAX_FRAME_PAYLOAD:
        raise HubMqttValidationError(
            "broker_credentials_too_long", "the broker username and password together are too long for the hub"
        )
    return payload


def parse_hub_mqtt_status(payload: bytes) -> Optional[bool]:
    """``True``/``False`` from a family-``0x74`` reply, ``None`` if empty."""

    data = bytes(payload or b"")
    if not data:
        return None
    return data[0] == 1


def redact_wire_hex(data: bytes) -> str:
    """Hex of raw wire bytes with every broker-setup payload masked.

    Frames are found by their ``A5 5A <len> <family>`` header; a
    family-``0x73`` frame keeps its header and shows ``**`` for each
    payload and checksum byte. Everything else is plain hex. Works on a
    single frame or a socket chunk holding several.
    """

    raw = bytes(data or b"")
    tokens = [f"{byte:02x}" for byte in raw]
    index = 0
    while index + 3 < len(raw):
        if raw[index] == 0xA5 and raw[index + 1] == 0x5A:
            length = raw[index + 2]
            if raw[index + 3] == FAMILY_HUB_MQTT_SETUP:
                for masked in range(index + 4, min(len(raw), index + 4 + length + 1)):
                    tokens[masked] = "**"
            index += 4 + length + 1
            continue
        index += 1
    return " ".join(tokens)


class HubMqttMixin(_ProxyHost if TYPE_CHECKING else object):
    """Read and set the X2 hub's MQTT broker link."""

    def query_hub_mqtt_status(self, *, timeout: float = 3.0) -> Optional[bool]:
        """Whether the hub reports a connected broker; ``None`` when it does
        not answer (another model, an older firmware) or cannot be asked."""

        if self.hub_version != HUB_VERSION_X2 or not self.can_issue_commands():
            return None
        with self.exchange("hub_mqtt_status"):
            self.clear_ack_queue()
            send_ts = time.monotonic()
            self._send_family_frame(FAMILY_HUB_MQTT_STATUS, b"")
            matched = self.wait_for_ack_family_low(FAMILY_HUB_MQTT_STATUS, timeout=timeout, not_before=send_ts)
        if matched is None:
            self._log.info("[MQTT] the hub did not answer the broker status query")
            return None
        status = parse_hub_mqtt_status(matched[1])
        if status is None:
            self._log.info("[MQTT] hub broker link: unknown (empty reply)")
        else:
            self._log.info("[MQTT] hub broker link: %s", "connected" if status else "not connected")
        return status

    def set_hub_mqtt_broker(
        self,
        *,
        broker_ip: str,
        broker_port: int,
        username: str,
        password: str,
        timeout: float = HUB_MQTT_CONNECT_TIMEOUT + 5.0,
    ) -> dict[str, Any] | None:
        """Point the hub at a broker and wait for its verdict.

        Returns ``{"connected": bool}`` (the hub's own answer after trying),
        or ``None`` when it could not be sent or the hub did not answer.
        Raises ``ValueError`` for values the hub could not take. Replaces
        whatever broker the hub had; the hub cannot report the old one.
        """

        if self.hub_version != HUB_VERSION_X2:
            raise ValueError(f"the broker setup exists on the X2 only; this hub is {self.hub_version or 'unknown'}")
        if not self.can_issue_commands():
            self._log.info("[MQTT] broker setup ignored: proxy client is connected")
            return None
        payload = build_hub_mqtt_setup_payload(
            broker_ip=broker_ip,
            broker_port=broker_port,
            hub_mac=str((self.get_banner_info() or {}).get("mac") or ""),
            username=username,
            password=password,
        )
        with self.exchange("hub_mqtt_setup"):
            self.clear_ack_queue()
            send_ts = time.monotonic()
            self._log.info("[MQTT] pointing the hub at a broker (credentials not logged)")
            self._send_family_frame(FAMILY_HUB_MQTT_SETUP, payload)
            matched = self.wait_for_ack_family_low(FAMILY_HUB_MQTT_STATUS, timeout=timeout, not_before=send_ts)
        if matched is None:
            self._log.warning("[MQTT] the hub gave no verdict on the broker setup")
            return None
        connected = parse_hub_mqtt_status(matched[1])
        if connected is None:
            return None
        self._log.info("[MQTT] broker setup: the hub %s", "connected" if connected else "could not connect")
        return {"connected": connected}


__all__ = [
    "HUB_MQTT_CONNECT_TIMEOUT",
    "HUB_MQTT_MAX_TEXT",
    "HubMqttMixin",
    "build_hub_mqtt_setup_payload",
    "parse_hub_mqtt_status",
    "redact_wire_hex",
]

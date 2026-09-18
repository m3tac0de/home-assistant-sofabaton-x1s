# payloads.py: the command payload value types of the asyncio facade.
#
# A command's payload is its ``library_data`` body (the bytes the hub stores
# and replays; the same bytes a blob dump returns, without the replay-tail
# checksum byte), typed by what the device class makes of it: ``IrPayload``
# for IR, ``NetworkCommand`` for the structured network classes, and
# ``CommandRecord`` for every other body (a Bluetooth key, a ``wifi_mqtt``
# record). All three expose ``blob`` / ``hex`` / ``to_command_row`` /
# ``to_dict``; ``read_payload`` returns whichever fits (``payload_from_body``).
# New source formats are new constructors, never new facade methods (phase 3
# plan, W3).
from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Optional, Sequence, Union

from .blob_decoders import (
    build_raw_ir_blob_body,
    encode_decoded_blob,
    looks_like_descriptive_ir_blob,
    parse_pronto_hex,
    try_decode_blob,
)
from .commands import build_descriptive_ir_blob_body
from .protocol_const import (
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_BY_CODE,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    normalize_device_class,
)

__all__ = ["IrPayload", "NetworkCommand", "CommandRecord", "CommandPayload", "payload_from_body", "MIN_PAYLOAD_BYTES"]

# The persist path refuses anything shorter (proxy_ir_blob.persist_ir_blob).
MIN_PAYLOAD_BYTES = 10
# Raw-blob layout: declared length (BE16), zeros, carrier Hz (BE16 at 6:8).
_RAW_CARRIER_OFFSET = slice(6, 8)
_DESCRIPTOR_OFFSET = 8

IrPayloadKind = Literal["raw", "descriptive"]


def _parse_hex(text: str) -> bytes:
    """Bytes from pasted hex: space/newline pairs, contiguous, commas, ``0x``."""

    tokens = str(text or "").replace(",", " ").split()
    cleaned = "".join(t[2:] if t.lower().startswith("0x") else t for t in tokens)
    if not cleaned:
        raise ValueError("empty hex payload")
    return bytes.fromhex(cleaned)


@dataclass(frozen=True)
class IrPayload:
    """One IR command payload as the hub stores it.

    ``blob`` is the ``library_data`` body. ``kind`` is ``"descriptive"`` for
    a protocol descriptor the hub renders itself (``P:NEC1 D:... F:...``)
    and ``"raw"`` for mark/space timings with a carrier.
    """

    blob: bytes

    def __post_init__(self) -> None:
        if not isinstance(self.blob, (bytes, bytearray)):
            raise TypeError("IrPayload.blob must be bytes")
        object.__setattr__(self, "blob", bytes(self.blob))
        if len(self.blob) < MIN_PAYLOAD_BYTES:
            raise ValueError(
                f"payload too short ({len(self.blob)} bytes) to be a stored IR payload"
            )

    # -- constructors -----------------------------------------------------

    @classmethod
    def from_bytes(cls, blob: bytes) -> "IrPayload":
        """A body exactly as the hub stores it (a blob dump, a learn capture)."""

        return cls(bytes(blob))

    @classmethod
    def from_hex(cls, text: str) -> "IrPayload":
        """The hub body as hex text, in any of the layouts payloads circulate in."""

        return cls(_parse_hex(text))

    @classmethod
    def from_pronto(cls, text: str) -> "IrPayload":
        """A learned-format (``0000``) Pronto hex code."""

        timings, carrier_hz = parse_pronto_hex(text)
        return cls(build_raw_ir_blob_body(timings, carrier_hz))

    @classmethod
    def from_raw_timings(cls, timings_us: Sequence[int], carrier_hz: int) -> "IrPayload":
        """Alternating mark/space durations in microseconds, mark first, plus the carrier."""

        return cls(build_raw_ir_blob_body(timings_us, int(carrier_hz)))

    @classmethod
    def from_descriptor(cls, descriptor: str) -> "IrPayload":
        """A descriptive protocol line (``P:NEC1 D:4 S:5 F:21`` ...)."""

        return cls(build_descriptive_ir_blob_body(descriptor))

    # -- views -------------------------------------------------------------

    @property
    def kind(self) -> IrPayloadKind:
        return "descriptive" if looks_like_descriptive_ir_blob(self.blob) else "raw"

    @property
    def descriptor(self) -> Optional[str]:
        """The protocol descriptor of a descriptive payload, else None."""

        if self.kind != "descriptive":
            return None
        length = int.from_bytes(self.blob[0:2], "big")
        raw = self.blob[_DESCRIPTOR_OFFSET:_DESCRIPTOR_OFFSET + length]
        return raw.decode("ascii", errors="replace")

    @property
    def carrier_hz(self) -> Optional[int]:
        """The carrier of a raw payload, else None."""

        if self.kind != "raw":
            return None
        return int.from_bytes(self.blob[_RAW_CARRIER_OFFSET], "big") or None

    @property
    def hex(self) -> str:
        return self.blob.hex(" ")

    def to_command_row(self, command_id: int, name: str) -> dict[str, Any]:
        """The ``commands`` row a ``sync_device`` command add takes.

        Append it to the edited device's ``commands`` (with a command id not
        on the device yet) and sync; the planner recognises the
        ``restore_data.new`` marker and persists the payload.
        """

        restore_data: dict[str, Any] = {
            "transport": "hub_code_record",
            "library_type": 0x0D,
            "button_code": 0,
            "data_hex": self.blob.hex(),
            "new": True,
        }
        descriptor = self.descriptor
        if descriptor is not None:
            restore_data["decoded"] = {"class": "ir", "fields": {"descriptor": descriptor}}
        return {
            "command_id": int(command_id) & 0xFF,
            "name": str(name or "").strip() or f"Command {int(command_id) & 0xFF}",
            "restore_data": restore_data,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "hex": self.hex,
            "descriptor": self.descriptor,
            "carrier_hz": self.carrier_hz,
        }


# ---------------------------------------------------------------------------
# Network command payloads (wifi_ip / wifi_roku / wifi_hue / wifi_sonos)
# ---------------------------------------------------------------------------

_NETWORK_CLASSES = (
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_SONOS,
)
_HTTP_METHODS = ("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS")


def _ascii(text: Any, *, what: str, allow_empty: bool = False) -> str:
    value = str(text if text is not None else "")
    if not allow_empty and not value.strip():
        raise ValueError(f"{what} must not be empty")
    try:
        value.encode("ascii")
    except UnicodeEncodeError as err:
        raise ValueError(f"{what} must be ASCII") from err
    return value


@dataclass(frozen=True)
class NetworkCommand:
    """One network command as the hub stores it, in its structured form.

    The hub renders these itself at press time; the library stores the
    request text (``wifi_ip``), the Roku ECP path (``wifi_roku``) or the
    path plus body block (``wifi_hue`` / ``wifi_sonos``). Build one with
    the constructors, then :meth:`to_command_row` for an ``add_command``
    or hand it to ``set_command_payload``. The row carries the structured
    ``decoded`` block the sync executor re-encodes through the same
    canonical writers backups round-trip against, so the bytes on the
    hub are the bytes a backup would show.

    ``device_class`` must match the device the command goes on; the
    edit helpers refuse a mismatch before anything is planned.
    ``trailer_hex`` holds the opaque bytes a stored record may carry after
    its fields; a command read from the hub keeps them so its ``blob`` is
    the stored body, a built one leaves it empty.
    """

    device_class: str
    fields: Mapping[str, Any]
    trailer_hex: str = ""

    def __post_init__(self) -> None:
        cls = normalize_device_class(self.device_class)
        if cls not in _NETWORK_CLASSES:
            raise ValueError(
                f"{self.device_class!r} is not a network command class "
                f"(one of {', '.join(_NETWORK_CLASSES)})"
            )
        object.__setattr__(self, "device_class", cls)
        object.__setattr__(self, "fields", dict(self.fields))
        try:
            trailer = bytes.fromhex(str(self.trailer_hex or "").replace(" ", ""))
        except ValueError as err:
            raise ValueError(f"trailer_hex {self.trailer_hex!r} is not hex") from err
        object.__setattr__(self, "trailer_hex", trailer.hex(" "))
        # Encode once so a malformed command fails here, not in a sync job.
        self.blob  # noqa: B018 - validation through the property

    # -- constructors ---------------------------------------------------------

    @classmethod
    def http(
        cls,
        *,
        host: str,
        port: int,
        method: str,
        path: str,
        header: str = "",
        content_type: str = "",
        body: str = "",
    ) -> "NetworkCommand":
        """A ``wifi_ip`` command (X1S / X2): a full plain-HTTP request.

        ``host`` is a dotted IPv4 address (the record stores it packed),
        ``path`` gets its leading slash if missing, ``header`` is one
        extra header line (``Name: value``), ``body`` is sent with a
        ``Content-Length`` when non-empty.
        """

        try:
            ipaddress.IPv4Address(str(host or "").strip())
        except (ipaddress.AddressValueError, ValueError) as err:
            raise ValueError(f"host {host!r} is not a dotted-decimal IPv4 address") from err
        port_value = int(port)
        if not 0 < port_value < 65536:
            raise ValueError(f"port must be 1..65535, got {port!r}")
        method_value = _ascii(method, what="method").strip().upper()
        if method_value not in _HTTP_METHODS:
            raise ValueError(f"method {method!r} is not one of {', '.join(_HTTP_METHODS)}")
        path_value = _ascii(path, what="path").strip()
        if not path_value.startswith("/"):
            path_value = "/" + path_value
        return cls(
            DEVICE_CLASS_WIFI_IP,
            {
                "host": str(host).strip(),
                "port": port_value,
                "method": method_value,
                "path": path_value,
                "header": _ascii(header, what="header", allow_empty=True),
                "content_type": _ascii(content_type, what="content_type", allow_empty=True),
                "body": _ascii(body, what="body", allow_empty=True),
            },
        )

    @classmethod
    def roku(cls, path: str) -> "NetworkCommand":
        """A ``wifi_roku`` command: a Roku ECP path such as ``keypress/Home``.

        The target host lives on the device head and the hub always
        POSTs to port 8060; the path is stored without a leading slash.
        """

        path_value = _ascii(path, what="path").strip().lstrip("/")
        if not path_value:
            raise ValueError("path must not be empty")
        return cls(DEVICE_CLASS_WIFI_ROKU, {"path": path_value})

    @classmethod
    def hue(cls, path: str, body_block: str = "") -> "NetworkCommand":
        """A ``wifi_hue`` command: a REST path and the body block the hub
        injects after its own request line and Host header."""

        return cls(
            DEVICE_CLASS_WIFI_HUE,
            {"path": _ascii(path, what="path").strip().lstrip("/"),
             "body_block": _ascii(body_block, what="body_block", allow_empty=True)},
        )

    @classmethod
    def sonos(cls, path: str, body_block: str = "") -> "NetworkCommand":
        """A ``wifi_sonos`` command: a UPnP control path and its SOAP block."""

        return cls(
            DEVICE_CLASS_WIFI_SONOS,
            {"path": _ascii(path, what="path").strip().lstrip("/"),
             "body_block": _ascii(body_block, what="body_block", allow_empty=True)},
        )

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "NetworkCommand":
        """The inverse of :meth:`to_dict` (``{"device_class", "fields", "trailer_hex"}``,
        the trailer optional)."""

        if not isinstance(data, Mapping):
            raise ValueError("a network command is a {device_class, fields} mapping")
        fields = data.get("fields")
        if not isinstance(fields, Mapping):
            raise ValueError("a network command needs a 'fields' mapping")
        return cls(str(data.get("device_class") or ""), fields, str(data.get("trailer_hex") or ""))

    # -- views ----------------------------------------------------------------

    @property
    def decoded(self) -> dict[str, Any]:
        """The ``restore_data.decoded`` block (marked edited, so a sync writes it)."""

        return {
            "class": self.device_class,
            "fields": dict(self.fields),
            "trailer_hex": self.trailer_hex,
            "edited": True,
        }

    @property
    def blob(self) -> bytes:
        """The record body the canonical writer produces for these fields."""

        return encode_decoded_blob(self.decoded)

    @property
    def hex(self) -> str:
        return self.blob.hex(" ")

    @property
    def library_type(self) -> int:
        for code, name in DEVICE_CLASS_BY_CODE.items():
            if name == self.device_class:
                return int(code) & 0xFF
        raise ValueError(f"no class code for {self.device_class!r}")  # pragma: no cover

    def to_command_row(self, command_id: int, name: str) -> dict[str, Any]:
        """The ``commands`` row a ``sync_device`` command add takes."""

        return {
            "command_id": int(command_id) & 0xFF,
            "name": str(name or "").strip() or f"Command {int(command_id) & 0xFF}",
            "restore_data": {
                "transport": "hub_code_record",
                "library_type": self.library_type,
                "button_code": 0,
                "data_hex": self.blob.hex(),
                "decoded": self.decoded,
                "new": True,
            },
        }

    def to_dict(self) -> dict[str, Any]:
        return {"device_class": self.device_class, "fields": dict(self.fields), "trailer_hex": self.trailer_hex}


# ---------------------------------------------------------------------------
# Every other stored body (bluetooth, wifi_mqtt, undecodable records)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CommandRecord:
    """A stored command body no richer type describes.

    A Bluetooth key, a two-byte ``wifi_mqtt`` record (whose bytes the hub
    ignores), or a network-class body that does not decode. ``fields`` is
    the structured form where the class has one (``wifi_mqtt``:
    ``device_id`` / ``command_id``), else None; ``blob`` is authoritative.
    Save it on a device of the same class with :meth:`to_command_row` or
    ``set_command_payload``.
    """

    device_class: Optional[str]
    blob: bytes

    def __post_init__(self) -> None:
        if not isinstance(self.blob, (bytes, bytearray)):
            raise TypeError("CommandRecord.blob must be bytes")
        if not self.blob:
            raise ValueError("a command record has at least one byte")
        object.__setattr__(self, "blob", bytes(self.blob))
        object.__setattr__(self, "device_class", normalize_device_class(self.device_class))

    @classmethod
    def from_hex(cls, device_class: Optional[str], text: str) -> "CommandRecord":
        """A stored body as hex text, for a device of ``device_class``."""

        return cls(device_class, _parse_hex(text))

    @property
    def fields(self) -> Optional[dict[str, Any]]:
        decoded = try_decode_blob(self.device_class, self.blob) if self.device_class else None
        return dict(decoded["fields"]) if decoded else None

    @property
    def hex(self) -> str:
        return self.blob.hex(" ")

    @property
    def library_type(self) -> int:
        for code, name in DEVICE_CLASS_BY_CODE.items():
            if name == self.device_class:
                return int(code) & 0xFF
        raise ValueError(f"no class code for {self.device_class or 'an unknown class'}")

    def to_command_row(self, command_id: int, name: str) -> dict[str, Any]:
        """The ``commands`` row a ``sync_device`` command add takes (the bytes as stored)."""

        return {
            "command_id": int(command_id) & 0xFF,
            "name": str(name or "").strip() or f"Command {int(command_id) & 0xFF}",
            "restore_data": {
                "transport": "hub_code_record",
                "library_type": self.library_type,
                "button_code": 0,
                "data_hex": self.blob.hex(),
                "new": True,
            },
        }

    def to_dict(self) -> dict[str, Any]:
        return {"device_class": self.device_class, "hex": self.hex, "fields": self.fields}


# What ``AsyncXProxy.read_payload`` returns and the edit helpers take.
CommandPayload = Union[IrPayload, NetworkCommand, CommandRecord]

_RECORD_CLASSES = (DEVICE_CLASS_BLUETOOTH, DEVICE_CLASS_WIFI_MQTT)


def payload_from_body(device_class: Any, body: bytes) -> CommandPayload:
    """Type a stored body by its device's class.

    A network class whose body decodes (and re-encodes to the same bytes)
    is a :class:`NetworkCommand`; Bluetooth, ``wifi_mqtt``, an undecodable
    network body and anything shorter than an IR payload is a
    :class:`CommandRecord`; everything else (IR, RF, an unknown class) is an
    :class:`IrPayload`.
    """

    cls = normalize_device_class(device_class)
    body = bytes(body)
    if cls in _NETWORK_CLASSES:
        decoded = try_decode_blob(cls, body)
        if decoded is not None:
            command = NetworkCommand(cls, decoded["fields"], str(decoded.get("trailer_hex") or ""))
            if command.blob == body:
                return command
        return CommandRecord(cls, body)
    if cls in _RECORD_CLASSES or len(body) < MIN_PAYLOAD_BYTES:
        return CommandRecord(cls, body)
    return IrPayload(body)

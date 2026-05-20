"""Structured builders for device-record payloads sent via family 0x07.

The hub exchanges device records (TV/AVR/WiFi/IP/etc.) using a single
fixed-shape body whose width depends on hub model: the X1 firmware uses
30-byte name/brand/tail slots (120-byte body), and the X1S/X2 firmware
widens those slots to 60 bytes (210-byte body). Both share the same
field order in the header, and both terminate with a 1-byte checksum
that sums every preceding byte modulo 256.

The integration historically built this payload by patching a frozen
hex template via ``payload.find(...)``-style lookups, which made the
write path device-class-specific and impossible to round-trip with a
fetched device row. This module exposes the canonical shape as a
plain dataclass so backup/restore flows can serialise a hub-stored
device, mutate any field, and reconstruct a faithful write payload.

The encoding is the same on both directions of the wire: name and
brand slots are ASCII on X1 and UTF-16BE on X1S/X2 (matching the
existing CatalogDeviceHandler decode path).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2


#: Total body length on X1 firmware (excluding the outer ``[01][seq_be]``
#: wrapper but including the trailing checksum byte).
DEVICE_BODY_LEN_X1: Final[int] = 120

#: Total body length on X1S/X2 firmware.
DEVICE_BODY_LEN_X1S_X2: Final[int] = 210

#: Width of the name/brand/tail slots on X1.
_NARROW_SLOT: Final[int] = 30

#: Width of the name/brand/tail slots on X1S/X2.
_WIDE_SLOT: Final[int] = 60

#: Fixed length of the binary code identifier baked into the header.
DEVICE_CODE_ID_LEN: Final[int] = 16


@dataclass(slots=True, frozen=True)
class DeviceConfig:
    """All fields the hub stores per device record.

    Construct one of these to send a create or update via
    :func:`build_device_create_payload`. The ``device_id`` field is
    ``0xFF`` for create-new (the hub assigns the real id and echoes it
    back in the post-create ACK); set it to the existing id to update.

    The string fields ``name`` and ``brand`` are encoded into the body
    using the hub's slot width and codec. On X1 the slots are 30-byte
    ASCII; on X1S/X2 they are 60-byte UTF-16BE. Strings longer than
    the slot are truncated; shorter strings are zero-padded.
    """

    name: str = ""
    brand: str = ""

    #: Set to ``0xFF`` to create a new record; the real id to update.
    device_id: int = 0xFF

    #: Record kind marker. ``0`` for create, the existing record's
    #: marker for update. Maps to body byte 3 of the header.
    record_kind: int = 0

    #: Icon glyph id rendered on the remote's screen.
    icon: int = 1

    #: Sort order within the activity-device list. Hubs sort by this
    #: when rendering the device picker.
    sort: int = 0

    #: Code-source type: which IRDB / WiFi / RF backend the device's
    #: commands come from. Common values seen on real devices:
    #: ``0x0A`` for WiFi-IP virtual devices, ``0x0D`` for IR-DB,
    #: ``0x10`` for raw-IR learned, plus several RF variants.
    code_type: int = 0x0A

    #: Device category (TV, AVR, set-top box, smart light, etc.).
    device_type: int = 0x10

    #: 16-byte opaque code identifier. Zero-filled for WiFi-IP devices;
    #: an IRDB lookup key for IR/RF devices.
    code_id: bytes = b"\x00" * DEVICE_CODE_ID_LEN

    #: Visibility flag. ``1`` hides the device from the main remote
    #: picker (still usable in activities).
    hide: int = 0

    #: Input-list visibility flag. ``1`` exposes the device's input
    #: list under the activity-inputs view.
    input_flag: int = 0

    #: Hub-defined channel index. Meaning is device-class-specific
    #: (e.g. IR carrier-group selector on RF devices).
    channel: int = 0

    #: Initial power state to display: ``0`` off, ``1`` on.
    power_state: int = 0

    #: IPv4 address as a dotted-decimal string. Encoded into the tail
    #: slot's IP marker. ``None`` leaves the marker empty (used for
    #: non-network devices).
    ip_address: str | None = None

    #: Poll interval (hub-defined, seen in seconds in real captures).
    #: Set to ``-1`` to omit the marker; ``0`` or positive values
    #: emit the marker with a 2-byte big-endian value.
    poll_time: int = -1

    #: Input switching mode (raw value from real captures: ``0`` or
    #: ``2``).
    input_mode: int = 0

    #: Power-button delivery mode: ``0`` discrete, ``1`` toggle,
    #: ``2`` separate on/off. Empirically the integration leaves this
    #: at ``0`` for IP devices and writes the user-chosen mode here
    #: for IR/RF devices.
    power_mode: int = 0

    #: Power-handling style flag (raw value from real captures: ``0``
    #: or ``2``).
    power_style: int = 2

    #: Shared-state flag controlling whether the device's commands are
    #: visible to other apps/integrations.
    share_mode: int = 0

    #: Tail-slot marker byte at offset 17 of the tail region. Empirical
    #: captures show this is ``1`` on WiFi-IP devices and ``0`` on
    #: other classes; the value is round-tripped by this builder.
    tail_marker: int = 0

    #: Optional vendor-extension triple. When ``extras_present`` is
    #: true, the tail region carries an additional ``0xFC`` marker
    #: followed by these three bytes (seen on some X1S build variants).
    extra_a: int = 0
    extra_b: int = 0
    extra_c: int = 0
    extras_present: bool = False


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _slot_widths_for(hub_version: str) -> tuple[int, int, str]:
    """Return (slot_width, body_len, encoding) for the hub variant."""

    if hub_version == HUB_VERSION_X1:
        return _NARROW_SLOT, DEVICE_BODY_LEN_X1, "ascii"
    if hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
        return _WIDE_SLOT, DEVICE_BODY_LEN_X1S_X2, "utf-16-be"
    raise ValueError(
        f"build_device_create_payload: unknown hub_version={hub_version!r}; "
        "expected one of HUB_VERSION_X1 / HUB_VERSION_X1S / HUB_VERSION_X2."
    )


def _encode_text_slot(value: str, *, width: int, encoding: str) -> bytes:
    """Encode a text field into a fixed-width zero-padded slot."""

    encoded = value.encode(encoding, errors="ignore")
    if len(encoded) > width:
        encoded = encoded[:width]
    return encoded + b"\x00" * (width - len(encoded))


def _encode_ip(ip_address: str | None) -> bytes | None:
    """Encode a dotted IPv4 string into 4 packed bytes, or ``None``."""

    if not ip_address:
        return None
    parts = ip_address.split(".")
    if len(parts) != 4:
        return None
    try:
        return bytes(int(part) & 0xFF for part in parts)
    except ValueError:
        return None


def _build_tail_slot(config: DeviceConfig, *, width: int) -> bytes:
    """Build the tail-slot bytes (width 30 on X1, 60 on X1S/X2).

    The first 18 bytes carry the structured device-state markers; the
    remaining bytes are zero (or, when ``extras_present`` is true,
    carry an extra 4-byte marker block in the X1S/X2 variant).
    """

    tail = bytearray(width)

    ip_bytes = _encode_ip(config.ip_address)
    if ip_bytes is not None:
        tail[0] = 0xFC
        tail[1] = 0x55
        tail[2:6] = ip_bytes

    if config.poll_time >= 0:
        tail[6] = 0xFC
        tail[7:9] = (config.poll_time & 0xFFFF).to_bytes(2, "big")

    tail[9] = 0xFC
    tail[10] = config.input_mode & 0xFF
    tail[11] = config.power_mode & 0xFF
    tail[12] = config.power_style & 0xFF
    tail[13] = config.share_mode & 0xFF
    tail[14] = 0xFC
    tail[15] = 0
    tail[16] = 0xFC
    tail[17] = config.tail_marker & 0xFF

    if config.extras_present and width >= 22:
        tail[18] = 0xFC
        tail[19] = config.extra_a & 0xFF
        tail[20] = config.extra_b & 0xFF
        tail[21] = config.extra_c & 0xFF

    return bytes(tail)


def build_device_create_payload(config: DeviceConfig, *, hub_version: str) -> bytes:
    """Serialise a :class:`DeviceConfig` into a family-0x07 payload.

    The returned bytes are the outer-wrapped ``[0x01][seq_be][body]``
    form ready to hand to the family-0x07 sender. The body itself is
    120 bytes on X1 and 210 bytes on X1S/X2, terminated by a single
    checksum byte computed over the preceding body content.

    The payload is always a single page (the body fits well inside the
    247-byte chunk limit), so no paging is required.
    """

    slot_width, body_len, encoding = _slot_widths_for(hub_version)

    code_id = bytes(config.code_id)
    if len(code_id) < DEVICE_CODE_ID_LEN:
        code_id = code_id + b"\x00" * (DEVICE_CODE_ID_LEN - len(code_id))
    elif len(code_id) > DEVICE_CODE_ID_LEN:
        code_id = code_id[:DEVICE_CODE_ID_LEN]

    body = bytearray(body_len)
    body[0] = 0x01
    body[1:3] = (1).to_bytes(2, "big")  # total_pages = 1
    body[3] = config.record_kind & 0xFF
    body[4] = config.device_id & 0xFF
    body[5] = config.icon & 0xFF
    body[6] = config.sort & 0xFF
    body[7] = config.code_type & 0xFF
    body[8] = config.device_type & 0xFF
    body[9:25] = code_id
    body[25] = config.hide & 0xFF
    body[26] = config.input_flag & 0xFF
    body[27] = config.channel & 0xFF
    body[28] = config.power_state & 0xFF

    name_start = 29
    brand_start = name_start + slot_width
    tail_start = brand_start + slot_width
    checksum_index = body_len - 1

    body[name_start : name_start + slot_width] = _encode_text_slot(
        config.name, width=slot_width, encoding=encoding
    )
    body[brand_start : brand_start + slot_width] = _encode_text_slot(
        config.brand, width=slot_width, encoding=encoding
    )
    body[tail_start : tail_start + slot_width] = _build_tail_slot(config, width=slot_width)

    body[checksum_index] = sum(body[:checksum_index]) & 0xFF

    return bytes([0x01, 0x00, 0x01]) + bytes(body)


# ---------------------------------------------------------------------------
# Parser (inverse of the builder)
# ---------------------------------------------------------------------------


def _decode_text_slot(slot: bytes, *, encoding: str) -> str:
    """Decode a fixed-width slot, stripping trailing nulls and whitespace."""

    try:
        if encoding == "utf-16-be":
            raw = slot if len(slot) % 2 == 0 else slot[:-1]
            decoded = raw.decode(encoding, errors="ignore")
        else:
            decoded = slot.decode(encoding, errors="ignore")
    except Exception:
        decoded = ""
    return decoded.rstrip("\x00").strip()


def _decode_ip(tail_prefix: bytes) -> str | None:
    """Extract the IPv4 address from the leading IP-marker bytes of a tail.

    Returns ``None`` when the marker is absent (first byte is not 0xFC,
    or the marker bytes are zero, indicating the device has no IP).
    """

    if len(tail_prefix) < 6 or tail_prefix[0] != 0xFC or tail_prefix[1] != 0x55:
        return None
    if tail_prefix[2:6] == b"\x00\x00\x00\x00":
        return None
    return ".".join(str(b) for b in tail_prefix[2:6])


def parse_device_record(body: bytes, *, hub_version: str) -> DeviceConfig:
    """Decode a hub-stored device record body into a :class:`DeviceConfig`.

    ``body`` is the inner body (with outer ``[01][seq_be]`` wrapper
    already stripped) as received from a CATALOG_ROW_DEVICE frame, an
    OP_REQ_BLOB device response, or any other path that exposes the
    full 120/210-byte record. The returned config is the inverse of
    :func:`build_device_create_payload` and can be passed straight
    back to it to reconstruct the same wire bytes.

    Raises ``ValueError`` if the body length does not match the hub
    variant.
    """

    slot_width, expected_len, encoding = _slot_widths_for(hub_version)
    if len(body) != expected_len:
        raise ValueError(
            f"parse_device_record: body length {len(body)} does not match "
            f"expected {expected_len} for hub_version={hub_version!r}"
        )

    name_start = 29
    brand_start = name_start + slot_width
    tail_start = brand_start + slot_width

    code_id = bytes(body[9:25])
    name = _decode_text_slot(body[name_start : name_start + slot_width], encoding=encoding)
    brand = _decode_text_slot(body[brand_start : brand_start + slot_width], encoding=encoding)

    tail = body[tail_start : tail_start + slot_width]
    ip_address = _decode_ip(tail[:6])

    poll_time = -1
    if len(tail) > 8 and tail[6] == 0xFC:
        poll_time = int.from_bytes(tail[7:9], "big")

    input_mode = tail[10] if len(tail) > 10 else 0
    power_mode = tail[11] if len(tail) > 11 else 0
    power_style = tail[12] if len(tail) > 12 else 0
    share_mode = tail[13] if len(tail) > 13 else 0
    tail_marker = tail[17] if len(tail) > 17 else 0

    extras_present = False
    extra_a = extra_b = extra_c = 0
    if len(tail) > 21 and tail[18] == 0xFC:
        extras_present = True
        extra_a = tail[19]
        extra_b = tail[20]
        extra_c = tail[21]

    return DeviceConfig(
        name=name,
        brand=brand,
        device_id=body[4],
        record_kind=body[3],
        icon=body[5],
        sort=body[6],
        code_type=body[7],
        device_type=body[8],
        code_id=code_id,
        hide=body[25],
        input_flag=body[26],
        channel=body[27],
        power_state=body[28],
        ip_address=ip_address,
        poll_time=poll_time,
        input_mode=input_mode,
        power_mode=power_mode,
        power_style=power_style,
        share_mode=share_mode,
        tail_marker=tail_marker,
        extra_a=extra_a,
        extra_b=extra_b,
        extra_c=extra_c,
        extras_present=extras_present,
    )


__all__ = [
    "DEVICE_BODY_LEN_X1",
    "DEVICE_BODY_LEN_X1S_X2",
    "DEVICE_CODE_ID_LEN",
    "DeviceConfig",
    "build_device_create_payload",
    "parse_device_record",
]

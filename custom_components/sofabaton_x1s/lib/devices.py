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
from typing import Final, Mapping

from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .wire_schema import schema_for


#: Fixed length of the binary code identifier baked into the header.
DEVICE_CODE_ID_LEN: Final[int] = 16


#: Total body length on X1 firmware (excluding the outer ``[01][seq_be]``
#: wrapper but including the trailing checksum byte). Mirrored from the
#: shared :mod:`wire_schema` so legacy imports keep working; the schema
#: module is the source of truth.
DEVICE_BODY_LEN_X1: Final[int] = schema_for(HUB_VERSION_X1).device_body_len

#: Total body length on X1S/X2 firmware.
DEVICE_BODY_LEN_X1S_X2: Final[int] = schema_for(HUB_VERSION_X1S).device_body_len

# Module-load asserts: catch any future drift between the historical
# literals and the per-variant schema. The literals exist only for
# external test fixtures that already imported them.
assert DEVICE_BODY_LEN_X1 == 120
assert DEVICE_BODY_LEN_X1S_X2 == 210
assert schema_for(HUB_VERSION_X1).device_slot_width == 30
assert schema_for(HUB_VERSION_X1S).device_slot_width == 60
assert schema_for(HUB_VERSION_X2).device_slot_width == 60


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

    #: Input-switching configuration. The value identifies which of the
    #: input styles the device uses:
    #:
    #: - ``0`` **needs configuration** -- the user has not picked an
    #:   input style yet. The remote shows "Not configured" in its
    #:   device list and the hub rejects REQ_ACTIVITY_INPUTS with a
    #:   non-success STATUS_ACK.
    #: - ``1`` direct / discrete inputs (each input is its own command).
    #: - ``2`` source-list style -- the device exposes a configured list
    #:   of named sources (typical for WiFi-Roku and similar devices
    #:   where the activity picker cycles through entries). The 0x46
    #:   page carries real entries in this mode.
    #: - ``3`` not yet observed; the remaining configuration choice in
    #:   the app is between menu-based and next-input styles, one of
    #:   which is this value.
    #:
    #: Devices can arrive from the IRDB with a non-zero ``input_mode``
    #: baked into the create payload, so this is **not** purely user-set;
    #: it reflects what the IRDB entry says about the device's input
    #: behaviour by default. See :attr:`is_input_configured`.
    input_mode: int = 0

    #: Power configuration value. ``0`` means **power has not been
    #: configured** on this device (the user has not picked a power
    #: style). A non-zero value indicates power is configured; the
    #: specific value distinguishes between toggle / discrete /
    #: separate-on-off styles, but the encoding here is not fully
    #: decoded yet (real captures show ``0`` unconfigured, ``1``
    #: configured). See :attr:`is_power_configured`.
    power_mode: int = 0

    #: Companion byte to :attr:`power_mode`. Observed values vary per
    #: device (IRDB metadata, not a fixed sentinel): real captures show
    #: ``1`` and ``2`` on freshly-created devices before any user
    #: configuration, and ``3`` once power is configured on the device
    #: that started at ``2``. The exact meaning is not fully decoded.
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

    @property
    def is_input_configured(self) -> bool:
        """``True`` when the device has been configured for inputs.

        Empirically: tail byte 10 (``input_mode``) is ``0`` on devices
        the user has not yet configured for inputs, and non-zero (with
        the value indicating which input style was chosen) once they
        have. When ``False``, REQ_ACTIVITY_INPUTS is rejected by the
        hub with a non-success STATUS_ACK.
        """

        return self.input_mode != 0

    @property
    def is_power_configured(self) -> bool:
        """``True`` when the device has been configured for power.

        Empirically: tail byte 11 (``power_mode``) is ``0`` on devices
        the user has not yet configured for power, and non-zero once
        they have (the specific value encodes the chosen power style).
        """

        return self.power_mode != 0


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _slot_widths_for(hub_version: str) -> tuple[int, int, str]:
    """Return (slot_width, body_len, encoding) for the hub variant.

    Thin wrapper over :func:`schema_for` kept for call-site stability;
    raises ``ValueError`` on unknown variants via the shared schema.
    """

    schema = schema_for(hub_version)
    return schema.device_slot_width, schema.device_body_len, schema.device_label_encoding


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


def parse_device_record(
    body: bytes,
    *,
    hub_version: str,
    entity_kind: str = "device",
) -> DeviceConfig:
    """Decode a hub-stored device record body into a :class:`DeviceConfig`.

    ``body`` is the inner body (with outer ``[01][seq_be]`` wrapper
    already stripped) as received from a CATALOG_ROW_DEVICE frame
    (family ``0x07``), a CATALOG_ROW_ACTIVITY frame (family ``0x37``),
    an OP_REQ_BLOB device response, or any other path that exposes
    the full 120/210-byte record. The returned config is the inverse
    of :func:`build_device_create_payload` and can be passed straight
    back to it to reconstruct the same wire bytes.

    ``entity_kind`` defaults to ``"device"`` and accepts ``"activity"``
    for callers that want to make the activity (family-0x37)
    interpretation explicit at the call site. The body layout is
    identical between the two kinds -- the field is metadata, not a
    parse-time discriminant.

    Raises ``ValueError`` if the body length does not match the hub
    variant, or if ``entity_kind`` is unrecognised.
    """

    if entity_kind not in ("device", "activity"):
        raise ValueError(
            "parse_device_record: entity_kind must be 'device' or 'activity'; "
            f"got {entity_kind!r}"
        )

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


def device_config_from_backup(
    device: Mapping[str, object],
    *,
    for_create: bool = False,
) -> DeviceConfig:
    """Build a :class:`DeviceConfig` from a ``backup_device`` payload block.

    ``device`` is the ``payload["device"]`` dictionary returned by
    :meth:`SofabatonHub.async_backup_device`. When ``for_create`` is true, the
    returned config is shaped for a fresh create transaction: ``device_id`` is
    set to ``0xFF``, ``record_kind`` to ``0``, and ``tail_marker`` to ``0`` so
    the subsequent update/commit step can finalize the record with the
    hub-assigned device id.
    """

    def _as_int(key: str, default: int = 0) -> int:
        value = device.get(key, default)
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    code_id_raw = str(device.get("code_id_hex") or "")
    code_id_hex = "".join(ch for ch in code_id_raw if ch not in " \t\r\n")
    if len(code_id_hex) % 2:
        code_id_hex = code_id_hex[:-1]
    try:
        code_id = bytes.fromhex(code_id_hex) if code_id_hex else b""
    except ValueError:
        code_id = b""

    extras = device.get("extras")
    extras_present = isinstance(extras, Mapping)

    return DeviceConfig(
        name=str(device.get("name") or ""),
        brand=str(device.get("brand") or ""),
        device_id=0xFF if for_create else (_as_int("device_id", 0xFF) & 0xFF),
        record_kind=0 if for_create else (_as_int("record_kind", 0) & 0xFF),
        icon=_as_int("icon", 1) & 0xFF,
        sort=_as_int("sort", 0) & 0xFF,
        code_type=_as_int("code_type", 0x0A) & 0xFF,
        device_type=_as_int("device_type", 0x10) & 0xFF,
        code_id=code_id,
        hide=_as_int("hide", 0) & 0xFF,
        input_flag=_as_int("input_flag", 0) & 0xFF,
        channel=_as_int("channel", 0) & 0xFF,
        power_state=_as_int("power_state", 0) & 0xFF,
        ip_address=str(device.get("ip_address")) if device.get("ip_address") else None,
        poll_time=_as_int("poll_time", -1),
        input_mode=_as_int("input_mode", 0) & 0xFF,
        power_mode=_as_int("power_mode", 0) & 0xFF,
        power_style=_as_int("power_style", 2) & 0xFF,
        share_mode=_as_int("share_mode", 0) & 0xFF,
        tail_marker=0 if for_create else (_as_int("tail_marker", 1) & 0xFF),
        extra_a=_as_int("a", 0) & 0xFF if isinstance(extras, Mapping) else 0,
        extra_b=_as_int("b", 0) & 0xFF if isinstance(extras, Mapping) else 0,
        extra_c=_as_int("c", 0) & 0xFF if isinstance(extras, Mapping) else 0,
        extras_present=extras_present,
    )


__all__ = [
    "DEVICE_BODY_LEN_X1",
    "DEVICE_BODY_LEN_X1S_X2",
    "DEVICE_CODE_ID_LEN",
    "DeviceConfig",
    "build_device_create_payload",
    "device_config_from_backup",
    "parse_device_record",
]

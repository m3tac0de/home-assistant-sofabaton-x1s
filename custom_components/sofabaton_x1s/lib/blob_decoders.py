"""Structural decoders for command-blob device classes.

Five device classes carry user-meaningful structure inside their
stored command blobs:

* ``wifi_ip`` — host + port + full HTTP request text
* ``wifi_roku`` — URL path fragment for Roku ECP
* ``wifi_hue`` — Hue REST URL path + body block
* ``wifi_sonos`` — Sonos UPnP/SOAP path + envelope body
* ``ir`` — descriptive replay blobs (``P:Sony12 R:... etc.``);
  non-descriptive learned-IR blobs fail content-sniff and stay raw

This module provides round-trip decode / encode functions for each so
backup payloads can ship a parallel ``decoded`` block next to the raw
``data_hex`` (purely additive, never replacing the wire bytes), and so
the Fetch Blob tool can offer a descriptive/hex toggle for these
classes through a single uniform path.

Design rules (mirrors docs/protocol/command-blob-decoders.md):

* The decoder reads the structural prefix, then captures everything
  after the body verbatim into ``trailer_hex``. Trailer bytes are
  opaque — checksums, readback framing, padding nulls — and the
  encoder re-emits them unchanged.
* Every public encode/decode pair MUST satisfy
  ``encode(decode(data)) == data`` byte-for-byte.
* ``try_decode_blob`` is the high-level entry point: it runs decode,
  runs encode on the result, and only returns a structured block when
  the round-trip is exact. Any mismatch returns ``None``, allowing
  callers to fall back to raw ``data_hex`` without thinking about why.
* The IR decoder is *content-sniffed* — it only succeeds when the
  blob carries the descriptive-protocol magic prefix. Non-descriptive
  (raw learned-IR / database) blobs return ``None`` so the caller
  keeps the existing raw-hex behavior.

This module does not import anything from the rest of the integration
and has no I/O. It is safe to import from both the device-backup path
and the Fetch Blob result builder.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

from .protocol_const import (
    DEVICE_CLASS_IR,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    normalize_device_class,
)


# Classes this module knows how to round-trip. Anything else returns
# ``None`` from :func:`try_decode_blob` and the caller treats the row
# as undecoded.
#
# Note: ``ir`` is in this list but the decoder is *content-sniffed*,
# not class-gated — non-descriptive IR blobs will still return ``None``
# and fall back to raw hex. ``is_decodable_class("ir")`` therefore
# means "this class *can* carry decoded structure," not "every blob in
# this class does."
DECODABLE_CLASSES: Tuple[str, ...] = (
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_SONOS,
    DEVICE_CLASS_IR,
)


# ---------------------------------------------------------------------------
# Per-class decoders / encoders
# ---------------------------------------------------------------------------


def _coerce_blob_bytes(data: Any) -> bytes:
    """Accept bytes / bytearray / hex-string forms and return raw bytes.

    The hex form is what every caller in this codebase actually has —
    backup rows carry ``data_hex`` and the Fetch Blob result carries
    ``command_blob`` as a space-separated hex string. Accepting both
    forms means the decoder can be invoked uniformly from either site.
    """

    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        cleaned = data.replace(" ", "").replace("\n", "").replace("\r", "")
        if not cleaned:
            return b""
        try:
            return bytes.fromhex(cleaned)
        except ValueError as exc:
            raise ValueError(f"invalid hex blob string: {data!r}") from exc
    raise TypeError(f"unsupported blob input type: {type(data).__name__}")


def _bytes_to_hex(data: bytes) -> str:
    """Render bytes as the space-separated lowercase hex this project uses."""

    return data.hex(" ")


# ---- wifi_ip (class 0x1C) -------------------------------------------------
#
# Wire body layout:
#   [0..4]   = IPv4 octets (network order)
#   [4..6]   = port (big-endian)
#   [6..8]   = HTTP text length N (big-endian)
#   [8..8+N] = HTTP request text (ASCII)
#   [8+N..]  = opaque trailer
#
# HTTP text rendering rule (must round-trip exactly):
#
#   "{method} {path} HTTP/1.1\r\n"
#   "Host:{host}:{port}\r\n"
#   "{header}\r\n"                          (only if header non-empty)
#   "Content-Type:{content_type}\r\n"       (only if content_type non-empty)
#   "Content-Length:{len(body)}\r\n\r\n{body}"  (only if body non-empty)
#   "\r\n"                                  (unconditional terminator)
#
# Notes:
#   * When ``body`` is empty there is no Content-Length line and no
#     blank-line separator; the text ends with the unconditional "\r\n"
#     terminator (so a bodyless request ending in a Content-Type line
#     finishes with "\r\n\r\n" — one from the line itself, one from
#     the terminator).
#   * The decoder stores neither ``Host`` nor ``Content-Length`` in the
#     fields: ``Host`` is reconstructed from ``host`` + ``port`` on
#     encode (and verified against the structural prefix on decode),
#     and ``Content-Length`` is recomputed from ``len(body)`` on encode.


def _decode_wifi_ip(data: bytes) -> Dict[str, Any]:
    if len(data) < 8:
        raise ValueError("wifi_ip blob too short for IP/port/length header")
    host = "{0}.{1}.{2}.{3}".format(data[0], data[1], data[2], data[3])
    port = int.from_bytes(data[4:6], "big")
    text_len = int.from_bytes(data[6:8], "big")
    if len(data) < 8 + text_len:
        raise ValueError("wifi_ip blob shorter than declared HTTP text length")
    try:
        text = data[8 : 8 + text_len].decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("wifi_ip HTTP text region is not ASCII") from exc
    trailer = data[8 + text_len :]

    method, path, header, content_type, body = _parse_wifi_ip_http_text(
        text, host=host, port=port
    )

    return {
        "host": host,
        "port": port,
        "method": method,
        "path": path,
        "header": header,
        "content_type": content_type,
        "body": body,
        "trailer_hex": _bytes_to_hex(trailer),
    }


def _parse_wifi_ip_http_text(
    text: str, *, host: str, port: int
) -> Tuple[str, str, str, str, str]:
    """Split the HTTP text into ``(method, path, header, content_type, body)``.

    The hub's text always ends with an unconditional "\r\n" terminator.
    When there is a body, that terminator follows the body. When there
    is no body, it follows the last header line.

    The function does NOT enforce any structural rule beyond what the
    encoder will round-trip — that means the inner round-trip check in
    :func:`try_decode_blob` is the real gate.
    """

    # The encoder always uses "\r\n\r\n" between Content-Length and the
    # body. For bodyless requests, "\r\n\r\n" appears at the very end
    # (Content-Type-line CRLF + terminator CRLF). The decision rule is:
    # the first "\r\n\r\n" occurrence separates the header section
    # from the body section; everything after it is either empty
    # (bodyless) or "<body>\r\n" (with body — the trailing CRLF is the
    # unconditional terminator).
    separator = "\r\n\r\n"
    sep_index = text.find(separator)
    if sep_index < 0:
        raise ValueError("wifi_ip HTTP text missing CRLFCRLF separator")
    header_section = text[:sep_index]
    body_section = text[sep_index + len(separator) :]

    header_lines = header_section.split("\r\n")
    if not header_lines:
        raise ValueError("wifi_ip HTTP text has no request line")
    request_line = header_lines[0]
    remaining_header_lines = header_lines[1:]

    # Request line: "METHOD PATH HTTP/1.1". Split off the HTTP-version
    # from the right so PATH can theoretically contain spaces.
    rsplit = request_line.rsplit(" ", 1)
    if len(rsplit) != 2 or rsplit[1] != "HTTP/1.1":
        raise ValueError(f"wifi_ip request line malformed: {request_line!r}")
    method, _, path = rsplit[0].partition(" ")
    if not method or not path:
        raise ValueError(f"wifi_ip request line missing method or path: {request_line!r}")

    # Walk header lines, pulling Host / Content-Type / Content-Length
    # into structured slots and accumulating everything else into the
    # free-form ``header`` field. Order within ``header`` is preserved
    # so re-encoded text matches the original.
    expected_host_line = "Host:{0}:{1}".format(host, port)
    saw_host = False
    content_type = ""
    declared_content_length: int | None = None
    extra_header_lines: list[str] = []
    for line in remaining_header_lines:
        if not saw_host and line == expected_host_line:
            saw_host = True
            continue
        if line.startswith("Content-Type:"):
            # First Content-Type wins; subsequent ones would have been
            # written by the user into ``header`` originally, so route
            # extras to the free-form bucket.
            if content_type == "":
                content_type = line[len("Content-Type:") :]
                continue
            extra_header_lines.append(line)
            continue
        if line.startswith("Content-Length:"):
            try:
                declared_content_length = int(line[len("Content-Length:") :])
            except ValueError as exc:
                raise ValueError(
                    f"wifi_ip Content-Length not an integer: {line!r}"
                ) from exc
            continue
        extra_header_lines.append(line)

    if not saw_host:
        raise ValueError(
            f"wifi_ip Host header missing or disagrees with prefix bytes "
            f"(expected {expected_host_line!r})"
        )

    # The body section is either "" (bodyless: terminator only) or
    # "<body>\r\n" (with-body: body + terminator). Anything else means
    # the encoder rule has been violated.
    if body_section == "":
        body = ""
        if declared_content_length is not None:
            raise ValueError(
                "wifi_ip Content-Length present but body section is empty"
            )
    else:
        if not body_section.endswith("\r\n"):
            raise ValueError(
                "wifi_ip body section missing the trailing CRLF terminator"
            )
        body = body_section[:-2]
        if declared_content_length is None:
            raise ValueError(
                "wifi_ip body present but no Content-Length header was found"
            )
        if declared_content_length != len(body):
            raise ValueError(
                "wifi_ip Content-Length disagrees with body length "
                f"(declared {declared_content_length}, actual {len(body)})"
            )

    header_field = "\r\n".join(extra_header_lines)
    return method, path, header_field, content_type, body


def _encode_wifi_ip(decoded: Dict[str, Any]) -> bytes:
    host = str(decoded["host"])
    port = int(decoded["port"])
    method = str(decoded["method"])
    path = str(decoded["path"])
    header = str(decoded.get("header") or "")
    content_type = str(decoded.get("content_type") or "")
    body = str(decoded.get("body") or "")
    trailer = bytes.fromhex(str(decoded.get("trailer_hex") or "").replace(" ", ""))

    # Render IP bytes.
    host_parts = host.split(".")
    if len(host_parts) != 4:
        raise ValueError(f"wifi_ip host is not a dotted quad: {host!r}")
    try:
        ip_bytes = bytes(int(part) & 0xFF for part in host_parts)
    except ValueError as exc:
        raise ValueError(f"wifi_ip host octet not an int: {host!r}") from exc
    if not all(0 <= b <= 255 for b in ip_bytes):
        raise ValueError(f"wifi_ip host octet out of range: {host!r}")
    if port < 0 or port > 0xFFFF:
        raise ValueError(f"wifi_ip port out of range: {port}")

    # Render HTTP text per the writer rule (see module-level comment).
    chunks: list[str] = []
    chunks.append("{0} {1} HTTP/1.1\r\n".format(method, path))
    chunks.append("Host:{0}:{1}\r\n".format(host, port))
    if header:
        chunks.append(header + "\r\n")
    if content_type:
        chunks.append("Content-Type:" + content_type + "\r\n")
    if body:
        chunks.append("Content-Length:{0}\r\n\r\n".format(len(body)) + body)
    chunks.append("\r\n")
    text = "".join(chunks)
    text_bytes = text.encode("ascii")

    out = bytearray()
    out += ip_bytes
    out += port.to_bytes(2, "big")
    out += len(text_bytes).to_bytes(2, "big")
    out += text_bytes
    out += trailer
    return bytes(out)


# ---- wifi_roku (class 0x0A) ----------------------------------------------
#
# Wire body layout:
#   [0]      = path length L
#   [1..1+L] = URL path fragment (ASCII), e.g. "launch/<appid>"
#   [1+L..]  = opaque trailer


def _decode_wifi_roku(data: bytes) -> Dict[str, Any]:
    if len(data) < 1:
        raise ValueError("wifi_roku blob is empty")
    path_len = data[0]
    if len(data) < 1 + path_len:
        raise ValueError("wifi_roku blob shorter than declared path length")
    try:
        path = data[1 : 1 + path_len].decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("wifi_roku path is not ASCII") from exc
    trailer = data[1 + path_len :]
    return {
        "path": path,
        "trailer_hex": _bytes_to_hex(trailer),
    }


def _encode_wifi_roku(decoded: Dict[str, Any]) -> bytes:
    path = str(decoded["path"])
    trailer = bytes.fromhex(str(decoded.get("trailer_hex") or "").replace(" ", ""))
    path_bytes = path.encode("ascii")
    if len(path_bytes) > 0xFF:
        raise ValueError(f"wifi_roku path too long ({len(path_bytes)} bytes)")
    out = bytearray()
    out.append(len(path_bytes))
    out += path_bytes
    out += trailer
    return bytes(out)


# ---- wifi_hue (class 0x1A) and wifi_sonos (class 0x1B) -------------------
#
# These two classes share the same wire layout. The semantic difference
# (Hue REST vs Sonos UPnP/SOAP) lives in what the user puts into
# ``path`` and ``body_block``; the encoder/decoder is one routine.
#
# Wire body layout:
#   [0]                  = path length P (1 byte)
#   [1..3]               = body-block length B (big-endian, 2 bytes)
#   [3..3+P]             = URL path fragment (ASCII)
#   [3+P..3+P+B]         = body block (ASCII)
#   [3+P+B..]            = opaque trailer
#
# ``body_block`` is a single ASCII region the hub injects between the
# request-line/Host headers (built from the device-level IP/port at
# replay time) and the network write. It contains, in observed
# samples, any extra header lines followed by a Content-Length line, a
# blank line, and the request body. The line terminator inside
# body_block is bare "\n", not "\r\n". Decoding treats it as a flat
# string; editors that want sub-structure can layer their own parser
# on top.


def _decode_wifi_hue_like(data: bytes) -> Dict[str, Any]:
    if len(data) < 3:
        raise ValueError("hue/sonos blob too short for length header")
    path_len = data[0]
    body_len = int.from_bytes(data[1:3], "big")
    end = 3 + path_len + body_len
    if len(data) < end:
        raise ValueError(
            "hue/sonos blob shorter than declared path + body length"
        )
    try:
        path = data[3 : 3 + path_len].decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("hue/sonos path is not ASCII") from exc
    try:
        body_block = data[3 + path_len : end].decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("hue/sonos body block is not ASCII") from exc
    trailer = data[end:]
    return {
        "path": path,
        "body_block": body_block,
        "trailer_hex": _bytes_to_hex(trailer),
    }


def _encode_wifi_hue_like(decoded: Dict[str, Any]) -> bytes:
    path = str(decoded["path"])
    body_block = str(decoded.get("body_block") or "")
    trailer = bytes.fromhex(str(decoded.get("trailer_hex") or "").replace(" ", ""))

    path_bytes = path.encode("ascii")
    body_bytes = body_block.encode("ascii")
    if len(path_bytes) > 0xFF:
        raise ValueError(f"hue/sonos path too long ({len(path_bytes)} bytes)")
    if len(body_bytes) > 0xFFFF:
        raise ValueError(
            f"hue/sonos body block too long ({len(body_bytes)} bytes)"
        )

    out = bytearray()
    out.append(len(path_bytes))
    out += len(body_bytes).to_bytes(2, "big")
    out += path_bytes
    out += body_bytes
    out += trailer
    return bytes(out)


# ---- ir descriptive replay blobs -----------------------------------------
#
# Wire body layout (descriptive variant only):
#   [0..2]               = declared length L (big-endian, 2 bytes)
#   [2..6]               = magic marker 00 00 11 00
#   [6..8]               = magic marker 94 70
#   [8..8+L]             = descriptor ASCII (e.g. "P:Sony12 R:40000 D:1 F:18 MUL:2")
#   [8+L..]              = opaque trailer (typically 4 trailing nulls
#                          from the hub's writer, captured verbatim)
#
# The decoder is content-sniffed via the magic bytes — non-descriptive
# IR blobs (raw learned-IR captures, database-style binary blobs) do
# not match and the decoder returns None so the caller falls back to
# raw hex. This preserves the existing behavior for IR rows that did
# not have a structured form before.
#
# IMPORTANT — round-trip fidelity:
#   The descriptor is stored as raw bytes [8..8+L] without any
#   normalization. The hub's own write-side builder canonicalizes
#   DenonK descriptors (adds a CHECKSUM: field when missing), but
#   running that canonicalizer on a dumped descriptor would change the
#   bytes and break round-trip. The encoder here re-emits whatever the
#   decoder captured.


_DESCRIPTIVE_IR_MAGIC = b"\x00\x00\x11\x00\x94\x70"


def _decode_descriptive_ir(data: bytes) -> Dict[str, Any]:
    if len(data) < 8:
        raise ValueError("ir blob too short for descriptive header")
    if data[2:8] != _DESCRIPTIVE_IR_MAGIC:
        # Content sniff fails — caller falls back to raw hex via the
        # None return from try_decode_blob.
        raise ValueError("ir blob is not a descriptive replay payload")
    declared_len = int.from_bytes(data[0:2], "big")
    if declared_len <= 0:
        raise ValueError("ir descriptor declared length is zero")
    text_end = 8 + declared_len
    if text_end > len(data):
        raise ValueError("ir descriptor runs past end of blob")
    try:
        descriptor = data[8:text_end].decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("ir descriptor is not ASCII") from exc
    trailer = data[text_end:]
    return {
        "descriptor": descriptor,
        "trailer_hex": _bytes_to_hex(trailer),
    }


def _encode_descriptive_ir(decoded: Dict[str, Any]) -> bytes:
    descriptor = str(decoded["descriptor"])
    trailer = bytes.fromhex(str(decoded.get("trailer_hex") or "").replace(" ", ""))
    descriptor_bytes = descriptor.encode("ascii")
    if len(descriptor_bytes) > 0xFFFF:
        raise ValueError(
            f"ir descriptor too long ({len(descriptor_bytes)} bytes)"
        )
    out = bytearray()
    out += len(descriptor_bytes).to_bytes(2, "big")
    out += _DESCRIPTIVE_IR_MAGIC
    out += descriptor_bytes
    out += trailer
    return bytes(out)


# ---------------------------------------------------------------------------
# Registry + high-level entry points
# ---------------------------------------------------------------------------


_DECODERS: Dict[str, Callable[[bytes], Dict[str, Any]]] = {
    DEVICE_CLASS_WIFI_IP: _decode_wifi_ip,
    DEVICE_CLASS_WIFI_ROKU: _decode_wifi_roku,
    DEVICE_CLASS_WIFI_HUE: _decode_wifi_hue_like,
    DEVICE_CLASS_WIFI_SONOS: _decode_wifi_hue_like,
    DEVICE_CLASS_IR: _decode_descriptive_ir,
}

_ENCODERS: Dict[str, Callable[[Dict[str, Any]], bytes]] = {
    DEVICE_CLASS_WIFI_IP: _encode_wifi_ip,
    DEVICE_CLASS_WIFI_ROKU: _encode_wifi_roku,
    DEVICE_CLASS_WIFI_HUE: _encode_wifi_hue_like,
    DEVICE_CLASS_WIFI_SONOS: _encode_wifi_hue_like,
    DEVICE_CLASS_IR: _encode_descriptive_ir,
}


def is_decodable_class(device_class: Any) -> bool:
    """Return True for a device-class string this module can round-trip."""

    return normalize_device_class(device_class) in DECODABLE_CLASSES


def try_decode_blob(device_class: Any, data: Any) -> Dict[str, Any] | None:
    """Decode + round-trip-verify a virtual-device command blob.

    Returns a structured ``{"class", "fields", "trailer_hex"}`` mapping
    on success, ``None`` on any failure. Callers MUST treat a ``None``
    return as "this row stays raw" — no exception is raised.

    The shape of the returned dict mirrors
    ``docs/protocol/command-blob-decoders.md``:

    .. code-block:: yaml

        class: wifi_ip
        trailer_hex: "f1"
        fields:
          host: "192.168.2.77"
          port: 8060
          method: "POST"
          path: "/launch/.../short"
          header: ""
          content_type: "application/x-www-form-urlencoded"
          body: ""

    """

    normalized = normalize_device_class(device_class)
    if normalized not in _DECODERS:
        return None
    try:
        raw = _coerce_blob_bytes(data)
    except (TypeError, ValueError):
        return None
    if not raw:
        return None

    try:
        decoded = _DECODERS[normalized](raw)
    except (ValueError, KeyError, IndexError, TypeError):
        return None

    # Separate trailer_hex from the structural fields for the public
    # shape: external readers (backup format, UI) want
    #   {class, trailer_hex, fields: {...}}
    # while the per-class encoder takes a flat dict because that is
    # easier to write. Keep both shapes in sync.
    trailer_hex = decoded.pop("trailer_hex", "")
    flat_for_encode = dict(decoded)
    flat_for_encode["trailer_hex"] = trailer_hex

    try:
        round_trip = _ENCODERS[normalized](flat_for_encode)
    except (ValueError, KeyError, TypeError):
        return None
    if round_trip != raw:
        return None

    return {
        "class": normalized,
        "trailer_hex": trailer_hex,
        "fields": decoded,
    }


def encode_decoded_blob(decoded_block: Dict[str, Any]) -> bytes:
    """Re-encode a structured ``decoded`` block back to raw bytes.

    Inverse of :func:`try_decode_blob` for the success path. Raises
    ``ValueError`` on any class / shape mismatch; this is the editor
    entry point and a malformed input should not be silently dropped.
    """

    class_name = normalize_device_class(decoded_block.get("class"))
    if class_name not in _ENCODERS:
        raise ValueError(
            f"encode_decoded_blob: unknown class {decoded_block.get('class')!r}"
        )
    fields = decoded_block.get("fields")
    if not isinstance(fields, dict):
        raise ValueError("encode_decoded_blob: missing or non-dict 'fields'")
    flat = dict(fields)
    flat["trailer_hex"] = decoded_block.get("trailer_hex", "")
    return _ENCODERS[class_name](flat)


# ---------------------------------------------------------------------------
# Display rendering (used by the Fetch Blob tools card)
# ---------------------------------------------------------------------------


def format_decoded_for_display(decoded_block: Dict[str, Any]) -> str:
    """Render a structured ``decoded`` block as the text shown in the
    Fetch Blob tool's "Descriptor" view.

    The output is intentionally compact and aligned with the structural
    fields, not the original wire bytes. The trailer is omitted from
    the rendering — it carries no user-meaningful information.
    """

    class_name = normalize_device_class(decoded_block.get("class"))
    fields = decoded_block.get("fields")
    if not isinstance(fields, dict):
        return ""

    if class_name == DEVICE_CLASS_WIFI_IP:
        lines = [
            "host: {0}".format(fields.get("host", "")),
            "port: {0}".format(fields.get("port", "")),
            "method: {0}".format(fields.get("method", "")),
            "path: {0}".format(fields.get("path", "")),
        ]
        header = str(fields.get("header") or "")
        if header:
            lines.append("header:")
            for line in header.split("\r\n"):
                lines.append("  {0}".format(line))
        content_type = str(fields.get("content_type") or "")
        if content_type:
            lines.append("content_type: {0}".format(content_type))
        body = str(fields.get("body") or "")
        if body:
            lines.append("body:")
            for line in body.split("\n"):
                lines.append("  {0}".format(line))
        return "\n".join(lines)

    if class_name == DEVICE_CLASS_WIFI_ROKU:
        return "path: {0}".format(fields.get("path", ""))

    if class_name in (DEVICE_CLASS_WIFI_HUE, DEVICE_CLASS_WIFI_SONOS):
        lines = ["path: {0}".format(fields.get("path", ""))]
        body_block = str(fields.get("body_block") or "")
        if body_block:
            lines.append("body_block:")
            for line in body_block.split("\n"):
                lines.append("  {0}".format(line))
        return "\n".join(lines)

    if class_name == DEVICE_CLASS_IR:
        # Match the historical Fetch Blob descriptor view: the raw
        # ``P:Sony12 R:... etc.`` text, unadorned. Existing UI tests
        # and the tools card depend on this rendering being verbatim.
        return str(fields.get("descriptor") or "")

    return ""


__all__ = [
    "DECODABLE_CLASSES",
    "encode_decoded_blob",
    "format_decoded_for_display",
    "is_decodable_class",
    "try_decode_blob",
]

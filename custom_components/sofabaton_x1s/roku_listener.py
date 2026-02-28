from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from urllib.parse import urlsplit
from typing import Any

from .const import DOMAIN, DEFAULT_ROKU_LISTEN_PORT

_LOGGER = logging.getLogger(__name__)

DEFAULT_MAX_REQUEST_LINE_BYTES = 4096
DEFAULT_MAX_HEADER_BYTES = 16384
DEFAULT_MAX_HEADER_COUNT = 100
DEFAULT_MAX_BODY_BYTES = 1024
DEFAULT_READ_TIMEOUT_SECONDS = 1.0
DEFAULT_MAX_PATH_SEGMENT_LENGTH = 30


@dataclass
class _HubRegistration:
    hub: Any
    action_id: str
    enabled: bool
    allowed_ips: set[str]


class RokuListenerManager:
    """Singleton listener that accepts Roku-style POST callbacks."""

    def __init__(self, hass: Any) -> None:
        self._hass = hass
        self._server: asyncio.AbstractServer | None = None
        self._hubs: dict[str, _HubRegistration] = {}
        self._state_lock = asyncio.Lock()
        self._listen_port = DEFAULT_ROKU_LISTEN_PORT
        self._bound_port: int | None = None
        self._max_request_line_bytes = DEFAULT_MAX_REQUEST_LINE_BYTES
        self._max_header_bytes = DEFAULT_MAX_HEADER_BYTES
        self._max_header_count = DEFAULT_MAX_HEADER_COUNT
        self._max_body_bytes = DEFAULT_MAX_BODY_BYTES
        self._read_timeout_seconds = DEFAULT_READ_TIMEOUT_SECONDS
        self._max_path_segment_length = DEFAULT_MAX_PATH_SEGMENT_LENGTH
        self._last_start_error: str | None = None

    def get_last_start_error(self) -> str | None:
        return self._last_start_error

    async def async_set_listen_port(self, listen_port: int) -> None:
        new_port = int(listen_port)
        if new_port < 1 or new_port > 65535:
            raise ValueError("roku_listen_port must be between 1 and 65535")

        if new_port == self._listen_port:
            return

        self._listen_port = new_port
        await self._async_ensure_server_state()

    async def async_register_hub(self, hub: Any, *, enabled: bool) -> None:
        action_id = hub.get_roku_action_id()
        allowed_ips = {str(hub.host)} if getattr(hub, "host", None) else set()
        self._hubs[hub.entry_id] = _HubRegistration(
            hub=hub,
            action_id=action_id,
            enabled=enabled,
            allowed_ips=allowed_ips,
        )
        await self._async_ensure_server_state()

    async def async_set_hub_enabled(self, entry_id: str, enabled: bool) -> None:
        registration = self._hubs.get(entry_id)
        if registration is None:
            return
        registration.enabled = enabled
        await self._async_ensure_server_state()

    async def async_remove_hub(self, entry_id: str) -> None:
        self._hubs.pop(entry_id, None)
        await self._async_ensure_server_state()

    async def _async_ensure_server_state(self) -> None:
        async with self._state_lock:
            wants_listener = any(reg.enabled for reg in self._hubs.values())
            if not wants_listener and self._server is not None:
                self._server.close()
                await self._server.wait_closed()
                self._server = None
                self._bound_port = None
                self._last_start_error = None
                _LOGGER.info("[%s] Wifi Device listener stopped", DOMAIN)
                return

            if not wants_listener:
                return

            if self._server is not None and self._bound_port == self._listen_port:
                self._last_start_error = None
                return

            if self._server is not None:
                self._server.close()
                await self._server.wait_closed()
                self._server = None
                self._bound_port = None

            try:
                self._server = await asyncio.start_server(
                    self._async_handle_client,
                    host="0.0.0.0",
                    port=self._listen_port,
                )
            except OSError as err:
                self._last_start_error = str(err) or repr(err)
                _LOGGER.error(
                    "[%s] Failed to start Wifi Device listener on port %s: %s",
                    DOMAIN,
                    self._listen_port,
                    err,
                )
                return

            self._bound_port = self._listen_port
            self._last_start_error = None
            _LOGGER.info("[%s] Wifi Device listener started on port %s", DOMAIN, self._listen_port)

    async def _async_handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        source_ip = str(peer[0]) if isinstance(peer, tuple) and peer else ""

        try:
            request_line = await asyncio.wait_for(reader.readline(), timeout=self._read_timeout_seconds)
            if not request_line:
                self._write_response(writer, 400, b"bad request")
                return
            if len(request_line) > self._max_request_line_bytes:
                self._write_response(writer, 431, b"request headers too large")
                return

            decoded_request_line = request_line.decode("utf-8", errors="ignore").strip()
            request_parts = decoded_request_line.split()
            if len(request_parts) != 3:
                self._write_response(writer, 400, b"bad request")
                return

            method, path, version = request_parts
            if version not in ("HTTP/1.0", "HTTP/1.1"):
                self._write_response(writer, 400, b"bad request")
                return

            headers: dict[str, str] = {}
            header_bytes = 0
            header_count = 0
            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=self._read_timeout_seconds)
                if not line or line in (b"\r\n", b"\n"):
                    break

                header_count += 1
                header_bytes += len(line)
                if header_count > self._max_header_count or header_bytes > self._max_header_bytes:
                    self._write_response(writer, 431, b"request headers too large")
                    return

                key, _, value = line.decode("utf-8", errors="ignore").partition(":")
                headers[key.strip().lower()] = value.strip()

            content_length_raw = headers.get("content-length", "0")
            try:
                content_length = int(content_length_raw)
            except (TypeError, ValueError):
                self._write_response(writer, 400, b"bad request")
                return

            if content_length < 0:
                self._write_response(writer, 400, b"bad request")
                return

            if content_length > self._max_body_bytes:
                self._write_response(writer, 413, b"payload too large")
                return

            # Path carries the actionable payload for Sofabaton requests.
            # We do not consume request bodies; we only enforce a small max size
            # based on declared Content-Length to guard against abuse.

            status, payload = await self.async_handle_post(
                method=method,
                path=path,
                headers=headers,
                body=b"",
                source_ip=source_ip,
            )
            self._write_response(writer, status, payload)
        except asyncio.TimeoutError:
            self._write_response(writer, 408, b"request timeout")
        except Exception:  # pragma: no cover - defensive network boundary
            _LOGGER.exception("[%s] Wifi Device listener failed to process request", DOMAIN)
            self._write_response(writer, 500, b"internal error")
        finally:
            writer.close()
            await writer.wait_closed()

    async def async_handle_post(
        self,
        *,
        method: str,
        path: str,
        headers: dict[str, str],
        body: bytes,
        source_ip: str,
    ) -> tuple[int, bytes]:
        if method.upper() != "POST":
            return (405, b"method not allowed")

        normalized_path = self._normalize_request_path(path)
        parts = [part for part in normalized_path.strip("/").split("/") if part]
        if any(len(part) > self._max_path_segment_length for part in parts):
            return (400, b"bad request")
        if len(parts) < 4 or parts[0] != "launch":
            return (404, b"not found")

        action_id = parts[1]
        target = None
        for registration in self._hubs.values():
            if registration.enabled and registration.action_id == action_id:
                target = registration
                break

        if target is None:
            return (404, b"unknown hub")

        if target.allowed_ips and source_ip and source_ip not in target.allowed_ips:
            _LOGGER.warning(
                "[%s] Rejected Wifi Device request for hub=%s from unexpected IP=%s",
                DOMAIN,
                target.hub.entry_id,
                source_ip,
            )
            return (403, b"forbidden")

        await target.hub.async_handle_roku_http_post(
            path=normalized_path,
            headers=headers,
            body=body,
            source_ip=source_ip,
        )
        return (200, b"ok")

    @staticmethod
    def _normalize_request_path(path: str) -> str:
        candidate = (path or "").strip()
        if not candidate:
            return "/"

        if "://" in candidate:
            parsed = urlsplit(candidate)
            if parsed.path:
                candidate = parsed.path
                if parsed.query:
                    candidate = f"{candidate}?{parsed.query}"

        if not candidate.startswith("/"):
            candidate = f"/{candidate}"

        return candidate

    def _write_response(self, writer: asyncio.StreamWriter, status: int, body: bytes) -> None:
        reason = {
            200: "OK",
            400: "Bad Request",
            403: "Forbidden",
            404: "Not Found",
            405: "Method Not Allowed",
            408: "Request Timeout",
            413: "Payload Too Large",
            431: "Request Header Fields Too Large",
            500: "Internal Server Error",
        }.get(status, "OK")
        response = (
            f"HTTP/1.1 {status} {reason}\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Content-Type: text/plain\r\n"
            "Connection: close\r\n\r\n"
        ).encode("utf-8") + body
        writer.write(response)


async def async_get_roku_listener(hass: Any) -> RokuListenerManager:
    domain_data = hass.data.setdefault(DOMAIN, {})
    listener = domain_data.get("roku_listener")
    if listener is None:
        listener = RokuListenerManager(hass)
        domain_data["roku_listener"] = listener
    return listener

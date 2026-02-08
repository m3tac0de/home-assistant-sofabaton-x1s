from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


@dataclass
class _HubRegistration:
    hub: Any
    action_id: str
    enabled: bool
    allowed_ips: set[str]


class RokuListenerManager:
    """Singleton listener that accepts Roku-style POST callbacks on port 8060."""

    def __init__(self, hass: Any) -> None:
        self._hass = hass
        self._server: asyncio.AbstractServer | None = None
        self._hubs: dict[str, _HubRegistration] = {}
        self._state_lock = asyncio.Lock()

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
            if wants_listener and self._server is None:
                try:
                    self._server = await asyncio.start_server(
                        self._async_handle_client,
                        host="0.0.0.0",
                        port=8060,
                    )
                except OSError as err:
                    _LOGGER.error(
                        "[%s] Failed to start Roku listener on port 8060: %s",
                        DOMAIN,
                        err,
                    )
                    return

                _LOGGER.info("[%s] Roku listener started on port 8060", DOMAIN)
            elif not wants_listener and self._server is not None:
                self._server.close()
                await self._server.wait_closed()
                self._server = None
                _LOGGER.info("[%s] Roku listener stopped", DOMAIN)

    async def _async_handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        source_ip = str(peer[0]) if isinstance(peer, tuple) and peer else ""

        try:
            request_line = await reader.readline()
            if not request_line:
                self._write_response(writer, 400, b"bad request")
                return

            method, path, _ = request_line.decode("utf-8", errors="ignore").strip().split(" ", 2)
            headers: dict[str, str] = {}
            while True:
                line = await reader.readline()
                if not line or line in (b"\r\n", b"\n"):
                    break
                key, _, value = line.decode("utf-8", errors="ignore").partition(":")
                headers[key.strip().lower()] = value.strip()

            content_length = int(headers.get("content-length", "0"))
            body = await reader.readexactly(content_length) if content_length else b""

            status, payload = await self.async_handle_post(
                method=method,
                path=path,
                headers=headers,
                body=body,
                source_ip=source_ip,
            )
            self._write_response(writer, status, payload)
        except Exception:  # pragma: no cover - defensive network boundary
            _LOGGER.exception("[%s] Roku listener failed to process request", DOMAIN)
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

        parts = [part for part in path.strip("/").split("/") if part]
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
                "[%s] Rejected Roku request for hub=%s from unexpected IP=%s",
                DOMAIN,
                target.hub.entry_id,
                source_ip,
            )
            return (403, b"forbidden")

        await target.hub.async_handle_roku_http_post(
            path=path,
            headers=headers,
            body=body,
            source_ip=source_ip,
        )
        return (200, b"ok")

    def _write_response(self, writer: asyncio.StreamWriter, status: int, body: bytes) -> None:
        reason = {
            200: "OK",
            400: "Bad Request",
            403: "Forbidden",
            404: "Not Found",
            405: "Method Not Allowed",
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

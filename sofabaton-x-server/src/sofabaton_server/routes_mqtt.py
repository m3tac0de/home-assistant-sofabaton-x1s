"""``/server/mqtt/config``: the MQTT broker as the control panel manages it.

Reading the settings is free like every read (they never carry the
password; ``GET /server/mqtt`` already shows host and user). Changing,
removing and testing them are ``admin`` routes (access.py): the panel's
sign-in only, never a token, and nothing at all before access is set up.
Settings from the command line or the environment own the broker; the
panel then shows them read-only (``source: startup``). See
``mqtt_config.py`` for the storage and the rule that a new destination
drops the stored password.
"""

from __future__ import annotations

import logging
import time
from dataclasses import replace
from typing import Literal, Optional

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

from . import API_PREFIX
from .callbacks import CallbackService
from .models import Problem
from .mqtt_client import MqttError, probe
from .mqtt_config import MqttConfig, MqttConfigError, validate
from .problems import ApiProblem

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/server/mqtt", tags=["server"])


class MqttConfigView(BaseModel):
    """The broker settings, never the password."""

    source: Literal["none", "panel", "startup"] = Field(
        description="none: no broker; panel: stored by the control panel (mqtt.json); "
                    "startup: set by command-line flags or environment variables, read-only here")
    editable: bool = Field(description="false when the command line or the environment set the broker")
    host: Optional[str] = None
    port: Optional[int] = Field(None, description="as configured; null = the default for the TLS choice")
    effective_port: Optional[int] = None
    username: Optional[str] = None
    password_set: bool = False
    tls: bool = False
    tls_ca: Optional[str] = Field(None, description="a CA certificate file on the server's host")
    tls_insecure: bool = False
    client_id: Optional[str] = None
    devices_using: int = Field(0, description="Wifi Devices on the mqtt transport, across hubs")
    password_dropped: bool = Field(False, description="this change moved the destination without a new password, "
                                                      "so the stored password was dropped")


class MqttConfigBody(BaseModel):
    """The broker. Leave ``password`` out to keep the stored one (only while the
    destination stays the same); send it empty or null to remove it."""

    host: str = Field(max_length=253)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=256)
    password: Optional[str] = Field(None, max_length=1024)
    tls: bool = False
    tls_ca: Optional[str] = Field(None, max_length=1024)
    tls_insecure: bool = False
    client_id: Optional[str] = Field(None, max_length=64)


class MqttTestResult(BaseModel):
    ok: bool
    error: Optional[str] = None
    elapsed_ms: int


def _service(request: Request) -> CallbackService:
    return request.app.state.callbacks


def _view(service: CallbackService, *, dropped: bool = False) -> MqttConfigView:
    config = service.mqtt_config
    return MqttConfigView(
        source=service.mqtt_source, editable=service.mqtt_editable, host=config.host, port=config.port,
        effective_port=config.effective_port if config.configured else None, username=config.username,
        password_set=bool(config.password), tls=config.tls, tls_ca=config.tls_ca, tls_insecure=config.tls_insecure,
        client_id=config.client_id, devices_using=service.mqtt_device_count(), password_dropped=dropped,
    )


def _resolve(service: CallbackService, body: MqttConfigBody) -> tuple[MqttConfig, bool]:
    """The config the body asks for, and whether a stored password was dropped for a new destination."""

    try:
        wanted = validate(MqttConfig(host=body.host, port=body.port, username=body.username, tls=body.tls,
                                     tls_ca=body.tls_ca, tls_insecure=body.tls_insecure, client_id=body.client_id))
        current = service.mqtt_config
        dropped = False
        if "password" in body.model_fields_set:
            password = body.password or None
        elif current.configured and current.password and wanted.same_destination(current):
            password = current.password
        else:
            password = None
            dropped = bool(current.configured and current.password)
        return validate(replace(wanted, password=password)), dropped
    except MqttConfigError as err:
        raise ApiProblem(422, "invalid_mqtt_config", "Invalid broker settings", detail=str(err)) from None


def _announce(request: Request) -> None:
    relay = getattr(request.app.state, "event_relay", None)
    if relay is not None:
        from .ws import WsServerEvent

        relay.publish("", WsServerEvent(hub_id="", kind="mqtt_config"))


def _refuse_startup(service: CallbackService) -> None:
    if not service.mqtt_editable:
        raise ApiProblem(409, "setting_pinned", "Set by an environment variable or CLI flag",
                         detail="the MQTT broker was set where the server starts (--mqtt-* or SOFABATON_MQTT_*); "
                                "change it there")


@router.get("/config", operation_id="getMqttConfig", response_model=MqttConfigView,
            summary="The MQTT broker settings (never the password)")
async def get_mqtt_config(request: Request) -> MqttConfigView:
    return _view(_service(request))


@router.put("/config", operation_id="updateMqttConfig", response_model=MqttConfigView,
            summary="Store the MQTT broker settings and reconnect (control panel sign-in only)",
            responses={409: {"model": Problem}, 422: {"model": Problem}})
async def update_mqtt_config(request: Request, body: MqttConfigBody) -> MqttConfigView:
    service = _service(request)
    _refuse_startup(service)
    config, dropped = _resolve(service, body)
    await service.apply_mqtt_config(config)
    log.warning("mqtt: broker set in the control panel to %s:%s (user %s, tls %s, password %s)%s",
                config.host, config.effective_port, config.username or "none", config.tls,
                "set" if config.password else "none", "; the old password was dropped" if dropped else "")
    _announce(request)
    return _view(service, dropped=dropped)


@router.delete("/config", operation_id="removeMqttConfig", status_code=status.HTTP_204_NO_CONTENT,
               summary="Forget the panel's MQTT broker (control panel sign-in only)",
               responses={409: {"model": Problem}})
async def remove_mqtt_config(request: Request) -> Response:
    service = _service(request)
    _refuse_startup(service)
    await service.apply_mqtt_config(None)
    log.warning("mqtt: broker removed in the control panel")
    _announce(request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", operation_id="testMqttConfig", response_model=MqttTestResult,
             summary="Try to connect with these settings, without saving them (control panel sign-in only)",
             responses={422: {"model": Problem}})
async def test_mqtt_config(request: Request, body: MqttConfigBody) -> MqttTestResult:
    config, _dropped = _resolve(_service(request), body)
    started = time.monotonic()
    try:
        await probe(host=config.host or "", port=config.effective_port, username=config.username,
                    password=config.password, tls=config.tls, tls_ca=config.tls_ca,
                    tls_insecure=config.tls_insecure, client_id=config.client_id)
        error = None
    except MqttError as err:
        error = str(err)
    except TimeoutError:
        error = "no answer from the broker (timed out)"
    except OSError as err:
        error = err.strerror or str(err) or type(err).__name__
    except Exception as err:  # noqa: BLE001  (an ssl error on a bad CA file, for one)
        error = str(err) or type(err).__name__
    return MqttTestResult(ok=error is None, error=error, elapsed_ms=int((time.monotonic() - started) * 1000))

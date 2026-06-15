"""sofabaton — unofficial Sofabaton X1/X1S/X2 protocol library and proxy.

This module is the curated public API: every name exported here (see
``__all__``) is semver-stable for the ``sofabaton-x`` distribution.
Submodule internals (``opcode_handlers``, frame parsing, wire schemas,
the ``proxy_*`` mixins, ...) remain importable but are NOT a stable
surface and may change between minor releases.

The library raises stdlib exceptions (``ValueError`` for unclassifiable
or malformed input, ``RuntimeError``/``TimeoutError`` for transport and
ack failures) rather than custom exception types.

In-tree, this package doubles as ``custom_components.sofabaton_x1s.lib``
for the Home Assistant integration; the wheel build remaps it to the
top-level ``sofabaton`` package (see pyproject.toml).
"""

from .version import __version__  # noqa: F401

# Protocol constants (ButtonName, BUTTONNAME_BY_CODE, DEVICE_CLASS_*,
# opcode helpers, ...). Star re-export predates the curated API and is
# kept for backward compatibility; protocol_const defines __all__.
from . import protocol_const as _protocol_const
from .protocol_const import *  # noqa: F401,F403

# Hub-variant classification and shared defaults.
from .hub_versions import (  # noqa: F401
    ACTIVITY_BACKUP_SCHEMA_VERSION,
    DEFAULT_HUB_LISTEN_BASE,
    DEFAULT_PROXY_UDP_PORT,
    DEVICE_BACKUP_SCHEMA_VERSION,
    HUB_BUNDLE_SCHEMA_VERSION,
    HUB_VERSION_BY_HVER,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    HVER_BY_HUB_VERSION,
    HVER_X1,
    HVER_X1S,
    HVER_X2,
    MDNS_SERVICE_TYPE_BY_VERSION,
    MDNS_SERVICE_TYPE_X1,
    MDNS_SERVICE_TYPE_X2,
    MDNS_SERVICE_TYPES,
    PROXY_TXT_KEY,
    PROXY_TXT_VALUE,
    classify_hub_version,
    is_proxy_advertisement,
    mdns_service_type_for_props,
)

# Per-hub logging helper. LogTag/HubLogger remain importable from
# sofabaton.hub_logging but are internal plumbing, not public API.
from .hub_logging import get_hub_logger  # noqa: F401

# The proxy engine.
from .x1_proxy import X1Proxy  # noqa: F401

# LAN discovery of physical hubs.
from .discovery import (  # noqa: F401
    DEFAULT_DISCOVERY_TIMEOUT,
    DiscoveredHub,
    HubBrowser,
    decode_txt_properties,
    discover_hubs,
    normalize_advertisement,
)

# Device catalog records and provisioning flows.
from .devices import DeviceConfig, device_config_from_backup, parse_device_record  # noqa: F401
from .device_create import (  # noqa: F401
    DeviceCreateRequest,
    DeviceCreateResult,
    run_device_create,
)

# Step/ack result types surfaced by proxy operations.
from .ack import AckOutcome, InputsBurstResult, SendStepResult  # noqa: F401

# Asyncio facade over the threaded core.
from .aio import AsyncHubBrowser, AsyncXProxy, async_discover_hubs  # noqa: F401

_CURATED = [
    "__version__",
    # hub_versions
    "ACTIVITY_BACKUP_SCHEMA_VERSION",
    "DEFAULT_HUB_LISTEN_BASE",
    "DEFAULT_PROXY_UDP_PORT",
    "DEVICE_BACKUP_SCHEMA_VERSION",
    "HUB_BUNDLE_SCHEMA_VERSION",
    "HUB_VERSION_BY_HVER",
    "HUB_VERSION_X1",
    "HUB_VERSION_X1S",
    "HUB_VERSION_X2",
    "HVER_BY_HUB_VERSION",
    "HVER_X1",
    "HVER_X1S",
    "HVER_X2",
    "MDNS_SERVICE_TYPE_BY_VERSION",
    "MDNS_SERVICE_TYPE_X1",
    "MDNS_SERVICE_TYPE_X2",
    "MDNS_SERVICE_TYPES",
    "PROXY_TXT_KEY",
    "PROXY_TXT_VALUE",
    "classify_hub_version",
    "is_proxy_advertisement",
    "mdns_service_type_for_props",
    # hub_logging
    "get_hub_logger",
    # proxy
    "X1Proxy",
    # discovery
    "DEFAULT_DISCOVERY_TIMEOUT",
    "DiscoveredHub",
    "HubBrowser",
    "decode_txt_properties",
    "discover_hubs",
    "normalize_advertisement",
    # devices / provisioning
    "DeviceConfig",
    "device_config_from_backup",
    "parse_device_record",
    "DeviceCreateRequest",
    "DeviceCreateResult",
    "run_device_create",
    # ack results
    "AckOutcome",
    "InputsBurstResult",
    "SendStepResult",
    # asyncio facade
    "AsyncHubBrowser",
    "AsyncXProxy",
    "async_discover_hubs",
]

__all__ = list(getattr(_protocol_const, "__all__", [])) + _CURATED

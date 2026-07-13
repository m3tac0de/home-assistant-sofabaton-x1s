"""Guard the curated public API of the standalone sofabaton-x package.

Names exported from the package root (``__all__``) are the semver-stable
surface. This test fails when an export goes missing (breaking change —
needs a deliberate decision) and when the package can no longer be
imported standalone.
"""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_package() -> types.ModuleType:
    name = "sofabaton_public_api_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# The frozen stable surface. Removing or renaming any of these is a
# breaking change for sofabaton-x consumers; additions are fine (add them
# here when you add them to lib/__init__.py).
CURATED_EXPORTS = {
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
    # protocol constants (curated public subset)
    "ButtonName",
    "BUTTONNAME_BY_CODE",
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
    # live-edit sync planners
    "SyncStep",
    "build_activity_sync_plan",
    "build_device_sync_plan",
    # asyncio facade
    "AsyncHubBrowser",
    "AsyncXProxy",
    "async_discover_hubs",
}

# Protocol_const names that are NOT part of the advertised public surface
# (not in __all__) but must stay importable from the package root via the
# star re-export, so older code doing ``from sofabaton import <const>``
# keeps working. The HA integration imports these from the submodule
# (``from .lib.protocol_const import ...``), not the root.
PROTOCOL_CONST_BACK_COMPAT = {
    "DEVICE_CLASS_IR",
    "DEVICE_CLASS_BLUETOOTH",
    "OPNAMES",
}


def test_curated_exports_present_and_resolvable() -> None:
    pkg = _load_package()
    exported = set(pkg.__all__)
    missing = CURATED_EXPORTS - exported
    assert not missing, f"curated names missing from __all__: {sorted(missing)}"

    unresolvable = [name for name in pkg.__all__ if not hasattr(pkg, name)]
    assert not unresolvable, f"__all__ names that do not resolve: {unresolvable}"


def test_protocol_const_back_compat_importable_but_not_advertised() -> None:
    pkg = _load_package()
    exported = set(pkg.__all__)
    # Still importable from the root (star re-export keeps them in the namespace)...
    unresolvable = [n for n in PROTOCOL_CONST_BACK_COMPAT if not hasattr(pkg, n)]
    assert not unresolvable, f"back-compat names no longer importable: {unresolvable}"
    # ...but deliberately kept out of the advertised public surface.
    leaked = PROTOCOL_CONST_BACK_COMPAT & exported
    assert not leaked, f"internal protocol_const names leaked into __all__: {sorted(leaked)}"


def test_public_surface_is_small_and_curated() -> None:
    # Guards the __all__ cleanup: the advertised surface is the curated
    # list only, not the full ~128-name protocol_const star export.
    pkg = _load_package()
    assert set(pkg.__all__) == CURATED_EXPORTS


def test_version_matches_version_module() -> None:
    pkg = _load_package()
    version_mod = importlib.import_module(f"{pkg.__name__}.version")
    assert pkg.__version__ == version_mod.__version__

import sys
import types
from pathlib import Path


def _install_homeassistant_stubs() -> None:
    ha = types.ModuleType("homeassistant")
    sys.modules.setdefault("homeassistant", ha)

    config_entries = types.ModuleType("homeassistant.config_entries")

    class ConfigEntry:  # pragma: no cover - only used as stub
        pass

    config_entries.ConfigEntry = ConfigEntry
    sys.modules.setdefault("homeassistant.config_entries", config_entries)

    core = types.ModuleType("homeassistant.core")

    class HomeAssistant:  # pragma: no cover - only used as stub
        pass

    class ServiceCall:  # pragma: no cover - only used as stub
        pass

    core.HomeAssistant = HomeAssistant
    core.ServiceCall = ServiceCall
    sys.modules.setdefault("homeassistant.core", core)

    helpers = types.ModuleType("homeassistant.helpers")
    sys.modules.setdefault("homeassistant.helpers", helpers)

    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    device_registry.async_get = lambda hass=None: None
    sys.modules.setdefault("homeassistant.helpers.device_registry", device_registry)

    entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    entity_registry.async_get = lambda hass=None: None
    sys.modules.setdefault("homeassistant.helpers.entity_registry", entity_registry)


_install_homeassistant_stubs()

# Ensure custom_components is importable when running tests directly
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

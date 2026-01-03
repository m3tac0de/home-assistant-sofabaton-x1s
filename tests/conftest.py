import sys
import types
from pathlib import Path


def _install_homeassistant_stubs() -> None:
    vol = types.ModuleType("voluptuous")

    class _Schema:  # pragma: no cover - only used as stub
        def __init__(self, schema=None, **kwargs) -> None:
            self.schema = schema
            self.kwargs = kwargs

        def __call__(self, *args, **kwargs):
            return self

    vol.Schema = _Schema
    vol.Required = lambda key, default=None: key  # type: ignore[assignment]
    vol.All = lambda *args, **kwargs: args  # type: ignore[assignment]
    vol.Range = lambda **kwargs: kwargs  # type: ignore[assignment]
    sys.modules.setdefault("voluptuous", vol)

    ha = types.ModuleType("homeassistant")
    sys.modules.setdefault("homeassistant", ha)

    config_entries = types.ModuleType("homeassistant.config_entries")

    class ConfigEntry:  # pragma: no cover - only used as stub
        pass

    class ConfigFlow:  # pragma: no cover - only used as stub
        def __init_subclass__(cls, **kwargs):
            super().__init_subclass__()

        async def async_set_unique_id(self, *args, **kwargs):
            return None

        def _abort_if_unique_id_configured(self, *args, **kwargs):
            return False

        def async_show_form(self, *args, **kwargs):
            return {"type": "form", **kwargs}

        def async_abort(self, *args, **kwargs):
            return {"type": "abort", **kwargs}

        def async_create_entry(self, *args, **kwargs):
            return {"type": "create_entry", **kwargs}

        def _async_current_entries(self):
            return []

    class OptionsFlow:  # pragma: no cover - only used as stub
        def __init_subclass__(cls, **kwargs):
            super().__init_subclass__()

        def async_show_form(self, *args, **kwargs):
            return {"type": "form", **kwargs}

        def async_create_entry(self, *args, **kwargs):
            return {"type": "create_entry", **kwargs}

    config_entries.ConfigEntry = ConfigEntry
    config_entries.ConfigFlow = ConfigFlow
    config_entries.OptionsFlow = OptionsFlow
    sys.modules.setdefault("homeassistant.config_entries", config_entries)

    core = types.ModuleType("homeassistant.core")

    class HomeAssistant:  # pragma: no cover - only used as stub
        pass

    class ServiceCall:  # pragma: no cover - only used as stub
        pass

    core.HomeAssistant = HomeAssistant
    core.ServiceCall = ServiceCall
    core.callback = lambda func: func  # type: ignore[assignment]
    sys.modules.setdefault("homeassistant.core", core)

    helpers = types.ModuleType("homeassistant.helpers")
    sys.modules.setdefault("homeassistant.helpers", helpers)

    service_info = types.ModuleType("homeassistant.helpers.service_info")
    sys.modules.setdefault("homeassistant.helpers.service_info", service_info)

    zeroconf_service_info = types.ModuleType("homeassistant.helpers.service_info.zeroconf")

    class ZeroconfServiceInfo:  # pragma: no cover - only used as stub
        def __init__(
            self,
            *,
            host: str | None = None,
            port: int | None = None,
            name: str | None = None,
            properties: dict | None = None,
            type: str | None = None,
        ) -> None:
            self.host = host
            self.port = port
            self.name = name
            self.properties = properties
            self.type = type

    zeroconf_service_info.ZeroconfServiceInfo = ZeroconfServiceInfo
    sys.modules.setdefault("homeassistant.helpers.service_info.zeroconf", zeroconf_service_info)

    dispatcher = types.ModuleType("homeassistant.helpers.dispatcher")
    dispatcher.async_dispatcher_send = lambda hass=None, signal=None, *args, **kwargs: None
    dispatcher.async_dispatcher_connect = lambda hass=None, signal=None, target=None: None
    dispatcher.dispatcher_send = lambda *args, **kwargs: None
    dispatcher.dispatcher_connect = lambda *args, **kwargs: None
    sys.modules.setdefault("homeassistant.helpers.dispatcher", dispatcher)

    exceptions = types.ModuleType("homeassistant.exceptions")
    class HomeAssistantError(Exception):
        pass

    exceptions.HomeAssistantError = HomeAssistantError
    sys.modules.setdefault("homeassistant.exceptions", exceptions)

    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    device_registry.async_get = lambda hass=None: None
    sys.modules.setdefault("homeassistant.helpers.device_registry", device_registry)

    entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    entity_registry.async_get = lambda hass=None: None
    sys.modules.setdefault("homeassistant.helpers.entity_registry", entity_registry)

    components = types.ModuleType("homeassistant.components")
    sys.modules.setdefault("homeassistant.components", components)

    zeroconf = types.ModuleType("homeassistant.components.zeroconf")
    zeroconf.async_get_instance = lambda *args, **kwargs: None
    sys.modules.setdefault("homeassistant.components.zeroconf", zeroconf)


_install_homeassistant_stubs()

# Ensure custom_components is importable when running tests directly
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

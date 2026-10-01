"""The optional "Sofabaton X" sidebar panel.

The Control Panel card's global "Sidebar panel" setting (off by default)
adds a panel to Home Assistant's sidebar that hosts the card full-page.
The panel is a plain custom panel: the frontend loads ``tools-card.js``
(the same module the Lovelace card ships in, at the same versioned URL, so
the browser fetches it once) and mounts the ``sofabaton-x-panel`` element
that module defines. Registration follows the stored setting: at every
hub setup, when the setting flips, and the panel goes when the last hub
unloads, together with the Lovelace resources.
"""

from __future__ import annotations

import logging

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from . import frontend_resources, runtime
from .const import DOMAIN

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)

SIDEBAR_PANEL_URL_PATH = "sofabaton-x"
SIDEBAR_PANEL_TITLE = "Sofabaton X"
SIDEBAR_PANEL_ICON = "mdi:remote-tv"
# The full-page host element tools-card.js defines next to the card.
SIDEBAR_PANEL_ELEMENT = "sofabaton-x-panel"

_REGISTERED_KEY = "sidebar_panel_registered"


def sidebar_panel_registered(hass: HomeAssistant) -> bool:
    return bool(hass.data.get(DOMAIN, {}).get(_REGISTERED_KEY))


async def async_sync_sidebar_panel(hass: HomeAssistant) -> bool:
    """Register or remove the panel to match the stored setting.

    Returns whether the panel is registered afterwards.
    """
    ui_settings = await runtime._async_get_ui_settings_store(hass)
    if ui_settings.sidebar_panel_enabled:
        await async_register_sidebar_panel(hass)
    else:
        async_remove_sidebar_panel(hass)
    return sidebar_panel_registered(hass)


async def async_register_sidebar_panel(hass: HomeAssistant) -> None:
    """Register (or refresh) the sidebar panel.

    ``update=True`` keeps a repeat registration (a second hub setting up, a
    flip of the setting while already on) from raising; the frontend
    re-reads the panel list either way.
    """
    domain_data = hass.data.setdefault(DOMAIN, {})
    version = await frontend_resources._async_get_integration_version(hass)
    module_url = frontend_resources._frontend_resource_url(
        frontend_resources._TOOLS_CARD_FILENAME, version
    )
    frontend.async_register_built_in_panel(
        hass,
        "custom",
        sidebar_title=SIDEBAR_PANEL_TITLE,
        sidebar_icon=SIDEBAR_PANEL_ICON,
        frontend_url_path=SIDEBAR_PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": SIDEBAR_PANEL_ELEMENT,
                "embed_iframe": False,
                "trust_external": False,
                "module_url": module_url,
            }
        },
        require_admin=False,
        update=True,
    )
    if not domain_data.get(_REGISTERED_KEY):
        _LOGGER.info(
            "[%s] Registered the %s sidebar panel (%s)", DOMAIN, SIDEBAR_PANEL_TITLE, module_url
        )
    domain_data[_REGISTERED_KEY] = True


def async_remove_sidebar_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel if this integration registered it."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get(_REGISTERED_KEY):
        return
    frontend.async_remove_panel(hass, SIDEBAR_PANEL_URL_PATH, warn_if_unknown=False)
    domain_data[_REGISTERED_KEY] = False
    _LOGGER.info("[%s] Removed the %s sidebar panel", DOMAIN, SIDEBAR_PANEL_TITLE)

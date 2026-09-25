"""sofabaton-x-server: REST + WebSocket over the sofabaton-x library.

The server is a consumer of the library exactly like the Home Assistant
integration is. It owns persistence, discovery policy and network
exposure; everything it does against a hub goes through ``sofabaton``
root names, never the engine. Plan: docs/internal/sofabaton-x-server-plan.md.
"""

__version__ = "0.2.2"

# The API contract version advertised in mDNS TXT and reported by
# GET /api/v1/server. Tracks the API generation, not each schema revision;
# clients should regenerate types from the OpenAPI document for a new release.
API_VERSION = "1"
API_PREFIX = "/api/v1"

# hub_versions.py — hub-variant classification and shared protocol-level
# constants. This module is the library-side source of truth; the Home
# Assistant integration's const.py re-exports these names for its own
# call sites. Nothing here may import outside the library package.
from __future__ import annotations

MDNS_SERVICE_TYPES: tuple[str, ...] = (
    "_x1hub._udp.local.",
    "_sofabaton_hub._udp.local.",
)
MDNS_SERVICE_TYPE_X1 = MDNS_SERVICE_TYPES[0]
MDNS_SERVICE_TYPE_X2 = MDNS_SERVICE_TYPES[1]

# Hub version classification
HVER_X1 = "1"
HVER_X1S = "2"
HVER_X2 = "3"

HUB_VERSION_X1 = "X1"
HUB_VERSION_X1S = "X1S"
HUB_VERSION_X2 = "X2"

# Backup-format schema versions. These gate restore: a payload whose
# schema_version does not match is rejected so the slim, hand-editable
# format stays an exact contract (no silent reads of a stale verbose
# dump). Bump the matching constant whenever the corresponding export
# shape changes, and update the restore gate + fixtures together.
DEVICE_BACKUP_SCHEMA_VERSION = 4
ACTIVITY_BACKUP_SCHEMA_VERSION = 4
HUB_BUNDLE_SCHEMA_VERSION = 5

HUB_VERSION_BY_HVER = {
    HVER_X1: HUB_VERSION_X1,
    HVER_X1S: HUB_VERSION_X1S,
    HVER_X2: HUB_VERSION_X2,
}

HVER_BY_HUB_VERSION = {
    HUB_VERSION_X1: HVER_X1,
    HUB_VERSION_X1S: HVER_X1S,
    HUB_VERSION_X2: HVER_X2,
}

MDNS_SERVICE_TYPE_BY_VERSION = {
    HUB_VERSION_X1: MDNS_SERVICE_TYPE_X1,
    HUB_VERSION_X1S: MDNS_SERVICE_TYPE_X1,
    # X2 hubs continue to use the legacy _x1hub._udp.local. advertisement for compatibility
    HUB_VERSION_X2: MDNS_SERVICE_TYPE_X1,
}

DEFAULT_PROXY_UDP_PORT = 8102
DEFAULT_HUB_LISTEN_BASE = 8200

# TXT record marker carried by proxy advertisements so discovery can
# tell a proxy apart from a physical hub. The key spells "HA_PROXY" for
# historical reasons (the Home Assistant integration shipped it first);
# renaming would orphan existing installs, so it stays vendor-named.
PROXY_TXT_KEY = "HA_PROXY"
PROXY_TXT_VALUE = "1"


def is_proxy_advertisement(props: dict[str, str]) -> bool:
    """True when TXT properties mark the advertiser as one of our proxies."""

    return props.get(PROXY_TXT_KEY) == PROXY_TXT_VALUE


def classify_hub_version(props: dict[str, str]) -> str:
    """Determine hub version from advertised mDNS / banner properties.

    Raises :class:`ValueError` when ``props`` carries no ``HVER`` key
    or its value does not map to a known hub line. The integration
    deliberately refuses to default to a previously-known variant in
    that case: a missing or unfamiliar advertisement signals either an
    upstream firmware change or a misconfigured manual entry, and
    silently inheriting the X1 layout would corrupt every write to
    that hub. Callers that cannot guarantee an ``HVER`` (e.g. fully
    manual entry before first connect) must pick a known variant
    explicitly rather than relying on this helper.
    """

    hver = props.get("HVER")
    if hver is None:
        raise ValueError(
            "classify_hub_version: advertisement is missing HVER; "
            "cannot identify hub variant."
        )
    version = HUB_VERSION_BY_HVER.get(str(hver).strip())
    if not version:
        known = ", ".join(sorted(HUB_VERSION_BY_HVER))
        raise ValueError(
            f"classify_hub_version: unknown HVER={hver!r}; "
            f"expected one of {known}."
        )
    return version


def mdns_service_type_for_props(props: dict[str, str]) -> str:
    """Map hub properties to the correct mDNS service type.

    The integration advertises the same service type for every known
    variant, so an unclassifiable advertisement falls back to the
    shared narrow-line type rather than refusing to advertise -- the
    transport envelope is byte-compatible across the family and the
    connect banner reclassifies authoritatively.
    """

    try:
        version = classify_hub_version(props)
    except ValueError:
        return MDNS_SERVICE_TYPE_X1
    return MDNS_SERVICE_TYPE_BY_VERSION.get(version, MDNS_SERVICE_TYPE_X1)

"""Unit tests for the hub-firmware recommendation helper.

The integration raises a Home Assistant repair issue when a connected hub
reports firmware below :data:`MIN_RECOMMENDED_FIRMWARE`. These tests pin
the pure comparison so the "nag" decision stays predictable and never
fires on hubs we cannot classify.
"""

import pytest

from custom_components.sofabaton_x1s.lib.hub_versions import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    MIN_RECOMMENDED_FIRMWARE,
    MIN_SUPPORTED_FIRMWARE,
    firmware_is_outdated,
    firmware_is_unsupported,
)


@pytest.mark.parametrize(
    "hub_version",
    [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2],
)
def test_below_floor_is_outdated(hub_version):
    floor = MIN_RECOMMENDED_FIRMWARE[hub_version]
    assert firmware_is_outdated(hub_version, floor - 1) is True


@pytest.mark.parametrize(
    "hub_version",
    [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2],
)
def test_at_or_above_floor_is_current(hub_version):
    floor = MIN_RECOMMENDED_FIRMWARE[hub_version]
    assert firmware_is_outdated(hub_version, floor) is False
    assert firmware_is_outdated(hub_version, floor + 5) is False


def test_unknown_hub_version_never_nags():
    # An unclassifiable line (e.g. a future model or a third-party bridge)
    # must not be prompted to update against a floor we do not have.
    assert firmware_is_outdated("X9", 1) is False
    assert firmware_is_outdated(None, 1) is False


def test_missing_firmware_never_nags():
    # Firmware is unknown until the connect banner arrives; until then we
    # make no claim about whether an update is available.
    assert firmware_is_outdated(HUB_VERSION_X1, None) is False


@pytest.mark.parametrize(
    "hub_version",
    [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2],
)
def test_below_supported_floor_is_unsupported(hub_version):
    floor = MIN_SUPPORTED_FIRMWARE[hub_version]
    assert firmware_is_unsupported(hub_version, floor - 1) is True
    assert firmware_is_unsupported(hub_version, floor) is False


def test_unsupported_never_fires_without_confident_comparison():
    # Same fail-open shape as the recommended-floor helper: blocking is
    # strictly worse than nagging when we cannot classify the hub.
    assert firmware_is_unsupported("X9", 1) is False
    assert firmware_is_unsupported(None, 1) is False
    assert firmware_is_unsupported(HUB_VERSION_X1S, None) is False


def test_supported_floor_never_exceeds_recommended_floor():
    # An "unsupported but not outdated" hub would be blocked without ever
    # being nagged toward an update, which is a contradiction: the block
    # message promises an update fixes it, so the nag floor must be at
    # least as high as the block floor for every line.
    for hub_version, supported in MIN_SUPPORTED_FIRMWARE.items():
        assert supported <= MIN_RECOMMENDED_FIRMWARE[hub_version]

"""The mixin host contract stays true to :class:`X1Proxy` (R6, CR-L3a-17).

``lib/proxy_host.py`` declares what the ``proxy_*`` mixins borrow from the
proxy they are mixed into. Pyright is report-only, so a renamed or dropped
member would otherwise only show up as a runtime AttributeError on some
rarely taken path. These tests fail as soon as the declaration and the
real proxy drift apart.
"""

from __future__ import annotations

import inspect

import pytest

from custom_components.sofabaton_x1s.lib.proxy_host import (
    _CacheHost,
    _OpsHost,
    _ProxyHost,
    _WireHost,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

PARTS = (_WireHost, _CacheHost, _OpsHost)


def _declared(protocol: type) -> tuple[set[str], set[str]]:
    """(data members, callables and properties) a Protocol class declares itself."""
    data = set(protocol.__dict__.get("__annotations__", {}))
    methods = {
        name
        for name, value in vars(protocol).items()
        if not name.startswith("__") and (inspect.isfunction(value) or isinstance(value, property))
    }
    return data, methods


@pytest.fixture(scope="module")
def proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def test_every_declared_member_exists_on_a_real_proxy(proxy: X1Proxy) -> None:
    missing = []
    for part in PARTS:
        data, methods = _declared(part)
        assert data or methods, f"{part.__name__} declares nothing"
        missing += [f"{part.__name__}.{name}" for name in sorted(data) if not hasattr(proxy, name)]
        missing += [
            f"{part.__name__}.{name}"
            for name in sorted(methods)
            if not callable(getattr(type(proxy), name, None)) and not isinstance(getattr(type(proxy), name, None), property)
        ]
    assert missing == []


def test_the_parts_do_not_overlap() -> None:
    seen: dict[str, str] = {}
    for part in PARTS:
        data, methods = _declared(part)
        for name in data | methods:
            assert name not in seen, f"{name} is declared by both {seen[name]} and {part.__name__}"
            seen[name] = part.__name__


def test_the_host_base_is_for_the_type_checker_only() -> None:
    # The mixins name _ProxyHost only under TYPE_CHECKING: at runtime
    # nothing changes and no mixin module imports proxy_host (L-A5).
    assert _ProxyHost not in X1Proxy.__mro__
    for cls in X1Proxy.__mro__[1:]:
        if cls.__name__.endswith("Mixin"):
            assert cls.__bases__ == (object,), cls.__name__

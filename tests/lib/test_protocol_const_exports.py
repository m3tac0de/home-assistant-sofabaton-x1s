"""protocol_const.__all__ must list every public name (CR-L1-7).

The library root re-exports protocol_const with a star import for
compatibility (ledger L-A6), so a constant missing from __all__ is silently
missing from ``sofabaton.*`` while its neighbours are there.
"""

from __future__ import annotations

import inspect

from custom_components.sofabaton_x1s.lib import protocol_const


def test_every_public_constant_is_exported():
    public = {
        name
        for name, value in vars(protocol_const).items()
        if name.isupper() and not name.startswith("_") and not inspect.ismodule(value)
    }
    assert sorted(public - set(protocol_const.__all__)) == []
    assert [name for name in protocol_const.__all__ if not hasattr(protocol_const, name)] == []

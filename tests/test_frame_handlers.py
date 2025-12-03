"""Tests for frame handler registry predicate support."""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.frame_handlers import (
    BaseFrameHandler,
    FrameHandlerRegistry,
    register_handler,
)


def test_frame_handler_matches_family_predicate() -> None:
    """Handlers can register family predicates alongside explicit opcodes."""

    registry = FrameHandlerRegistry()

    @register_handler(
        opcodes=(lambda op: (op & 0xFF00) == 0x0D00,), directions=("H→A",), registry=registry
    )
    class FamilyHandler(BaseFrameHandler):
        pass

    handlers = list(registry.iter_for(0x0DAE, "H→A"))
    assert handlers and isinstance(handlers[0], FamilyHandler)

    assert not list(registry.iter_for(0x0C02, "H→A"))

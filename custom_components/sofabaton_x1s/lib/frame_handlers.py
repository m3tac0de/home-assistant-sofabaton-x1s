"""Utilities for decoding framed hub traffic.

This module centralizes the registration of opcode-specific frame handlers so
``X1Proxy._log_frames`` can simply route frames to the appropriate handler. To
add support for a new opcode simply:

1. Subclass :class:`BaseFrameHandler` (or implement the :class:`FrameHandler`
   protocol) and override :meth:`BaseFrameHandler.handle`.
2. Decorate the handler with :func:`register_handler`, specifying one or more
   opcodes and (optionally) the directions that should trigger it.
3. Access the :class:`FrameContext` passed to ``handle`` to introspect the frame
   payload and mutate the :class:`~.x1_proxy.X1Proxy` state.

Because handlers are registered via decorators, ``_log_frames`` never needs to
change when new opcodes are implemented. Direction-specific handling is achieved
by passing ``directions=("A→H",)`` (or ``("H→A",)``) to ``register_handler``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import (
    Callable,
    Protocol,
    Sequence,
    Iterator,
    Optional,
    runtime_checkable,
    TYPE_CHECKING,
)

if TYPE_CHECKING:
    from .x1_proxy import X1Proxy


@dataclass(slots=True)
class FrameContext:
    """State passed to each handler invocation."""

    proxy: "X1Proxy"
    opcode: int
    direction: str
    payload: bytes
    raw: bytes
    name: str


OpcodeMatcher = int | Callable[[int], bool]


@runtime_checkable
class FrameHandler(Protocol):
    """Interface implemented by opcode handlers."""

    def matches(self, opcode: int, direction: str) -> bool:  # pragma: no cover - protocol
        """Return ``True`` when this handler should process the frame."""

    def handle(self, frame: FrameContext) -> None:  # pragma: no cover - protocol
        """Decode the frame and mutate ``frame.proxy`` as needed."""


class BaseFrameHandler(FrameHandler):
    """Convenience base class implementing ``matches`` via attributes."""

    opcodes: tuple[OpcodeMatcher, ...] | None = None
    directions: tuple[str, ...] | None = None

    def _matches_opcode(self, opcode: int) -> bool:
        if self.opcodes is None:
            return True

        for candidate in self.opcodes:
            if callable(candidate):
                try:
                    if candidate(opcode):
                        return True
                except Exception:
                    continue
            elif opcode == candidate:
                return True

        return False

    def matches(self, opcode: int, direction: str) -> bool:
        opcode_match = self._matches_opcode(opcode)
        direction_match = True if self.directions is None else direction in self.directions
        return opcode_match and direction_match


class FrameHandlerRegistry:
    """Collection of registered handlers."""

    def __init__(self) -> None:
        self._handlers: list[FrameHandler] = []

    def register(self, handler: FrameHandler) -> FrameHandler:
        self._handlers.append(handler)
        return handler

    def iter_for(self, opcode: int, direction: str) -> Iterator[FrameHandler]:
        for handler in self._handlers:
            try:
                if handler.matches(opcode, direction):
                    yield handler
            except Exception:
                continue


frame_handler_registry = FrameHandlerRegistry()


def register_handler(
    handler: Optional[type[BaseFrameHandler] | FrameHandler] = None,
    *,
    opcodes: Sequence[OpcodeMatcher] | None = None,
    directions: Sequence[str] | None = None,
    registry: FrameHandlerRegistry = frame_handler_registry,
):
    """Decorator used to register ``FrameHandler`` implementations."""

    def _decorator(obj):
        instance = obj() if isinstance(obj, type) else obj
        if opcodes is not None:
            instance.opcodes = tuple(opcodes)  # type: ignore[attr-defined]
        if directions is not None:
            instance.directions = tuple(directions)  # type: ignore[attr-defined]
        registry.register(instance)
        return obj

    if handler is not None:
        return _decorator(handler)
    return _decorator


__all__ = [
    "BaseFrameHandler",
    "FrameContext",
    "FrameHandler",
    "FrameHandlerRegistry",
    "frame_handler_registry",
    "register_handler",
]

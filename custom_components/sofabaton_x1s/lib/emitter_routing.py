"""X2 IR emitter routing: which emitters send a device's IR.

An X2 device record carries a ``0xFC`` marker at tail[18] and three bytes
after it (``DeviceConfig.extra_a`` / ``extra_b`` / ``extra_c``), one
big-endian 24-bit mask:

* ``c`` (tail[21]): bit 0 the hub's built-in emitter, bits 1 and 2 the
  cables in IR ports 1 and 2, bits 3-7 paired remotes 1-5 (a remote keeps a
  copy of the codes and sends them from its own buttons);
* ``b`` (tail[20]): two bits per paired repeater 1-4, its built-in emitter
  then its IR port (repeater n at bits 2(n-1) and 2(n-1)+1);
* ``a`` (tail[19]): single-button RF devices. Carried, never edited here.

The bit of a remote's or a repeater's built-in emitter is the same bit that
device has in its paired-list row (:attr:`X2PairedDevice.slot`), so a row
maps straight onto the mask.

The hub choices are the four the vendor app offers: everything (``all``),
the built-in emitter alone, or one port alone. Any other mix of the three
hub bits reads as ``custom``: kept as it is until a choice replaces it.

Bench-validated on the X2 (2026-10-28): commands sent to a device go out
from the emitters its routing names (a port alone, a remote alone); a
one-shot ``0x0F`` play ignores the routing and uses the hub's emitters.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Literal, Optional

__all__ = [
    "EMITTER_REMOTE_COUNT",
    "EMITTER_REPEATER_COUNT",
    "EmitterRouting",
    "HubEmitters",
    "RepeaterEmitters",
    "remote_number",
    "repeater_number",
]

HubEmitters = Literal["all", "builtin", "port1", "port2", "custom", "none"]
RepeaterEmitters = Literal["all", "builtin", "port"]

EMITTER_REMOTE_COUNT = 5
EMITTER_REPEATER_COUNT = 4

_HUB_BITS: dict[str, int] = {"none": 0x00, "builtin": 0x01, "port1": 0x02, "port2": 0x04, "all": 0x07}
_HUB_CHOICE_BY_BITS = {bits: choice for choice, bits in _HUB_BITS.items()}
_HUB_MASK = 0x07
_REMOTE_SHIFT = 3
_REPEATER_BITS: dict[str, int] = {"builtin": 0b01, "port": 0b10, "all": 0b11}
_REPEATER_CHOICE_BY_BITS = {bits: choice for choice, bits in _REPEATER_BITS.items()}


def remote_number(slot: int) -> Optional[int]:
    """Remote 1-5 for a paired-list remote bit (``0x08`` .. ``0x80``)."""

    for number in range(1, EMITTER_REMOTE_COUNT + 1):
        if slot == 1 << (_REMOTE_SHIFT + number - 1):
            return number
    return None


def repeater_number(slot: int) -> Optional[int]:
    """Repeater 1-4 for a paired-list repeater bit (``0x01``, ``0x04``,
    ``0x10``, ``0x40``: the bit of its built-in emitter)."""

    for number in range(1, EMITTER_REPEATER_COUNT + 1):
        if slot == 1 << (2 * (number - 1)):
            return number
    return None


@dataclass(frozen=True)
class EmitterRouting:
    """The emitters that send one X2 device's IR.

    ``hub`` is the hub's choice (``custom`` keeps a mix the four choices
    cannot name, in ``hub_bits``). ``remotes`` lists remote numbers 1-5,
    ``repeaters`` maps repeater numbers 1-4 to their choice, both
    ascending. ``rf_byte`` is the first byte, carried unchanged.
    """

    hub: HubEmitters
    remotes: tuple[int, ...] = ()
    repeaters: tuple[tuple[int, RepeaterEmitters], ...] = ()
    hub_bits: int = 0
    rf_byte: int = 0

    @classmethod
    def decode(cls, a: int, b: int, c: int) -> "EmitterRouting":
        """The routing in the three bytes after the ``0xFC`` marker."""

        hub_bits = c & _HUB_MASK
        remotes = tuple(
            number
            for number in range(1, EMITTER_REMOTE_COUNT + 1)
            if c & (1 << (_REMOTE_SHIFT + number - 1))
        )
        repeaters: list[tuple[int, RepeaterEmitters]] = []
        for number in range(1, EMITTER_REPEATER_COUNT + 1):
            bits = (b >> (2 * (number - 1))) & 0b11
            if bits:
                repeaters.append((number, _REPEATER_CHOICE_BY_BITS[bits]))  # type: ignore[arg-type]
        hub: HubEmitters = _HUB_CHOICE_BY_BITS.get(hub_bits, "custom")  # type: ignore[assignment]
        return cls(hub=hub, remotes=remotes, repeaters=tuple(repeaters), hub_bits=hub_bits, rf_byte=a & 0xFF)

    @classmethod
    def from_bytes(cls, data: bytes) -> "EmitterRouting":
        a, b, c = bytes(data)[:3]
        return cls.decode(a, b, c)

    def encode(self) -> tuple[int, int, int]:
        """``(a, b, c)`` as the record stores them."""

        hub_bits = self.hub_bits if self.hub == "custom" else _HUB_BITS[self.hub]
        c = hub_bits & _HUB_MASK
        for number in self.remotes:
            c |= 1 << (_REMOTE_SHIFT + number - 1)
        b = 0
        for number, choice in self.repeaters:
            b |= _REPEATER_BITS[choice] << (2 * (number - 1))
        return self.rf_byte & 0xFF, b & 0xFF, c & 0xFF

    def to_bytes(self) -> bytes:
        return bytes(self.encode())

    @property
    def is_empty(self) -> bool:
        """No hub emitter, remote or repeater sends the device's IR."""

        _a, b, c = self.encode()
        return b == 0 and c == 0

    @property
    def is_remote_only(self) -> bool:
        """Only remotes send it: neither the hub nor a repeater."""

        return self.hub == "none" and not self.repeaters and bool(self.remotes)

    def repeater(self, number: int) -> Optional[RepeaterEmitters]:
        return dict(self.repeaters).get(number)

    def with_hub(self, choice: HubEmitters) -> "EmitterRouting":
        """The hub set to one of the four choices, or ``none``."""

        if choice not in _HUB_BITS:
            raise ValueError(f"hub emitters must be one of {sorted(_HUB_BITS)}; got {choice!r}")
        return replace(self, hub=choice, hub_bits=_HUB_BITS[choice])

    def with_remote(self, number: int, on: bool) -> "EmitterRouting":
        if not 1 <= number <= EMITTER_REMOTE_COUNT:
            raise ValueError(f"remote number must be 1-{EMITTER_REMOTE_COUNT}; got {number}")
        remotes = set(self.remotes)
        if on:
            remotes.add(number)
        else:
            remotes.discard(number)
        return replace(self, remotes=tuple(sorted(remotes)))

    def with_repeater(self, number: int, choice: Optional[RepeaterEmitters]) -> "EmitterRouting":
        """Repeater ``number`` set to a choice, or dropped with ``None``."""

        if not 1 <= number <= EMITTER_REPEATER_COUNT:
            raise ValueError(f"repeater number must be 1-{EMITTER_REPEATER_COUNT}; got {number}")
        if choice is not None and choice not in _REPEATER_BITS:
            raise ValueError(f"repeater emitters must be one of {sorted(_REPEATER_BITS)}; got {choice!r}")
        repeaters = dict(self.repeaters)
        if choice is None:
            repeaters.pop(number, None)
        else:
            repeaters[number] = choice
        return replace(self, repeaters=tuple(sorted(repeaters.items())))

    def to_dict(self) -> dict[str, Any]:
        return {
            "hub": self.hub,
            "remotes": list(self.remotes),
            "repeaters": {str(number): choice for number, choice in self.repeaters},
            "bytes": self.to_bytes().hex(),
        }

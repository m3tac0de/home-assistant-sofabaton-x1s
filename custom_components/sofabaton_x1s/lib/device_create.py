"""Device-create / device-restore step machinery.

The hub's device-create flow is a strictly serialised sequence of
``(opcode, payload, ack)`` exchanges. Each phase -- create-header,
per-command IR-blob pages, button bindings, idle behaviour, macros,
inputs slot, device-update commit, remote sync -- follows the same
transport pattern, differing only in opcode and ack-correlation.

This module factors that pattern into two layers so the IR-restore
flow and the existing WiFi-create flow can eventually share code:

- :class:`CreateStep` (Layer 2): one frame to send and one ack to
  wait for. Carries the family byte, the payload bytes, the expected
  ack opcode, and an optional ack-correlation byte (set when the ack
  echoes a request-side byte such as a button id).
- :func:`run_create_sequence` (Layer 2): drives a list of steps in
  order against a duck-typed proxy. Captures the assigned device id
  from a flagged step's ack payload so subsequent steps can target
  the new device. Aborts on first failure.
- Step builders (Layer 3): pure functions that produce
  :class:`CreateStep` (or lists of them) for each phase. Frame layout
  is locked in here, isolated from transport concerns.

The proxy is duck-typed: callers pass anything that exposes
``_send_family_frame(family, payload)`` and
``wait_for_roku_ack_any(candidates, *, timeout, not_before)``. That
lets tests substitute a lightweight fake without spinning up the full
:class:`X1Proxy`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Iterable, Protocol

from .devices import DeviceConfig, build_device_create_payload


# ---------------------------------------------------------------------------
# Wire-format constants
#
# Each constant carries a short note pointing to where it was observed on
# the wire (frame numbers refer to the user's full IR-create capture).
# ---------------------------------------------------------------------------


#: Family byte for the device-create header (A->H). Wire example:
#: ``OP_7B07`` on frame #191. Hub assigns ``device_id`` and replies on
#: :data:`ACK_OPCODE_DEVICE_CREATE`.
FAMILY_DEVICE_CREATE = 0x07

#: Family byte for the device-update commit (A->H, sent at the end of
#: the create flow with the real ``device_id`` and ``tail_marker=1``).
#: Wire example: ``OP_7B08`` on frame #485. Acked via the generic
#: STATUS_ACK family.
FAMILY_DEVICE_UPDATE = 0x08

#: Family byte for IR command writes (A->H, paged). The opcode-hi byte
#: equals the payload length so a full page is ``OP_FA0E`` (250-byte
#: payload) and a final short page is e.g. ``OP_6C0E`` (108-byte
#: payload). Family observed on frames #193, #195, #197, #199.
FAMILY_IR_COMMAND = 0x0E

#: Family byte for button bindings (A->H). Wire example: ``OP_193E``
#: on frame #445. Acked via :data:`ACK_OPCODE_BUTTON_BINDING` with the
#: request's button id echoed at ``payload[0]``.
FAMILY_BUTTON_BINDING = 0x3E

#: Family byte for ``SET_IDLE_BEHAVIOR`` (A->H). Wire example:
#: ``OP_0241`` on frame #477. Acked via the generic STATUS_ACK family.
FAMILY_SET_IDLE_BEHAVIOR = 0x41

#: Family byte for macro placeholder writes (A->H). Wire example:
#: ``OP_3212`` on frames #479, #481 (``POWER_ON``, ``POWER_OFF``).
#: Acked via :data:`ACK_OPCODE_MACRO` with the macro's key id echoed
#: at ``payload[0]``.
FAMILY_MACRO = 0x12

#: Family byte for the inputs slot write (A->H). Wire example:
#: ``OP_7746`` on frame #483 (all-zeros body == "no input switching").
#: Acked via the generic STATUS_ACK family.
FAMILY_INPUTS = 0x46

#: Family byte for ``REMOTE_SYNC`` (A->H). Wire example: ``OP_0064``
#: on frame #487. Acked via the generic STATUS_ACK family.
FAMILY_REMOTE_SYNC = 0x64


#: Full ack opcode the hub returns for a device-create. ``payload[0]``
#: carries the freshly assigned ``device_id``.
ACK_OPCODE_DEVICE_CREATE = 0x0107

#: Full ack opcode for a button-binding write. ``payload[0]`` echoes
#: the request's button id.
ACK_OPCODE_BUTTON_BINDING = 0x013E

#: Full ack opcode for a macro write. ``payload[0]`` echoes the
#: request's macro key id.
ACK_OPCODE_MACRO = 0x0112

#: Full ack opcode for a generic STATUS_ACK (used by most other write
#: steps). The success rule is ``payload[0] == 0x00``.
ACK_OPCODE_STATUS = 0x0103

#: Status byte value that indicates "accepted" on the generic ack.
ACK_STATUS_BYTE_OK = 0x00


# ---------------------------------------------------------------------------
# Layer 2 -- step sequencer
# ---------------------------------------------------------------------------


class _ProxyLike(Protocol):
    """Subset of :class:`X1Proxy` the sequencer needs."""

    def _send_family_frame(self, family: int, payload: bytes) -> None: ...

    def wait_for_roku_ack_any(
        self,
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None: ...


@dataclass(frozen=True, slots=True)
class CreateStep:
    """One create-flow exchange: send a frame, wait for a specific ack.

    Attributes:
        label: Human-readable identifier shown in logs ("device-create",
            "button-binding btn=0xBD", etc.). Has no semantic meaning.
        family: Opcode low byte. The high byte is derived from the
            payload length by :meth:`_send_family_frame`, so we never
            store an explicit opcode-hi.
        payload: Bytes to send as the frame body (no checksum, no magic).
        ack_opcode: Full opcode of the ack frame we wait for. ``0x0103``
            for STATUS_ACK, ``0x0107`` for device-create ack, etc.
        ack_first_byte: Optional ``payload[0]`` correlation. ``None``
            means "any byte"; an integer matches only when the ack's
            first payload byte equals it. Used for STATUS_ACK success
            checks (``ack_first_byte=0``) and for correlation acks that
            echo a request id (button id, macro key id).
        capture_device_id: When ``True``, the sequencer reads the ack
            ``payload[0]`` as the freshly-assigned device id. Set on the
            device-create step.
        timeout: Per-attempt ack-wait timeout in seconds.
        retries: Number of additional resend attempts on ack timeout
            (default ``0`` = send once).
        retry_delay: Seconds to sleep between retries.
    """

    label: str
    family: int
    payload: bytes
    ack_opcode: int
    ack_first_byte: int | None = None
    capture_device_id: bool = False
    timeout: float = 5.0
    retries: int = 0
    retry_delay: float = 0.0


@dataclass(frozen=True, slots=True)
class CreateSequenceResult:
    """Outcome of :func:`run_create_sequence`.

    On success, ``failed_step`` and ``failed_index`` are ``None`` and
    ``assigned_device_id`` is set iff one of the steps had
    ``capture_device_id=True``.

    On failure, ``failed_step`` and ``failed_index`` point at the first
    step that did not receive a matching ack within its retry budget.
    Steps after the failing one are not attempted.
    """

    success: bool
    assigned_device_id: int | None
    failed_step: CreateStep | None
    failed_index: int | None


def run_create_sequence(
    proxy: _ProxyLike,
    steps: Iterable[CreateStep],
) -> CreateSequenceResult:
    """Drive a serial sequence of :class:`CreateStep` exchanges.

    For each step:

    1. Send the frame via ``proxy._send_family_frame(family, payload)``.
    2. Wait for an ack matching ``(ack_opcode, ack_first_byte)``.
    3. On match, advance. If ``capture_device_id`` is set, record the
       ack's ``payload[0]`` as :attr:`CreateSequenceResult.assigned_device_id`.
    4. On timeout, retry up to ``retries`` times. If still no ack, abort
       the sequence and return a failure result pointing at this step.

    The caller is responsible for clearing any leftover ack state before
    calling (typically via ``proxy.start_roku_create()``). This function
    deliberately does not touch proxy lifecycle so the same sequencer
    can be reused mid-session if needed.
    """

    assigned_device_id: int | None = None
    steps_list = list(steps)

    for index, step in enumerate(steps_list):
        candidates: list[tuple[int, int | None]] = [
            (step.ack_opcode, step.ack_first_byte)
        ]
        attempts_left = max(1, int(step.retries) + 1)
        matched: tuple[int, bytes] | None = None

        while attempts_left > 0:
            attempts_left -= 1
            send_ts = time.monotonic()
            proxy._send_family_frame(step.family, step.payload)
            matched = proxy.wait_for_roku_ack_any(
                candidates,
                timeout=step.timeout,
                not_before=send_ts,
            )
            if matched is not None:
                break
            if attempts_left > 0 and step.retry_delay > 0:
                time.sleep(step.retry_delay)

        if matched is None:
            return CreateSequenceResult(
                success=False,
                assigned_device_id=assigned_device_id,
                failed_step=step,
                failed_index=index,
            )

        if step.capture_device_id:
            _ack_opcode, ack_payload = matched
            if ack_payload:
                assigned_device_id = ack_payload[0] & 0xFF

    return CreateSequenceResult(
        success=True,
        assigned_device_id=assigned_device_id,
        failed_step=None,
        failed_index=None,
    )


# ---------------------------------------------------------------------------
# Layer 3 -- step builders for the IR-create flow
#
# Each builder is a pure function: same inputs -> same bytes -> testable
# against captured wire frames without any proxy involvement.
# ---------------------------------------------------------------------------


# Common 6-byte header observed at payload[0..5] of nearly every A->H
# write in the create flow: button bindings, macros, inputs, etc. The
# meaning of the trailing ``01 00 01`` isn't fully decoded; treating it
# as a fixed constant matches every captured frame.
_COMMON_WRITE_PREAMBLE = bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01])


def build_device_create_step(
    config: DeviceConfig,
    *,
    hub_version: str,
) -> CreateStep:
    """Build the device-create step (``OP_7B07`` on X1).

    ``config`` should carry ``device_id=0xFF`` (the create sentinel) and
    ``tail_marker=0`` (the pre-commit value -- the device-update step
    later in the flow sets it to ``1``). The hub assigns the real
    ``device_id`` and returns it via the :data:`ACK_OPCODE_DEVICE_CREATE`
    ack.
    """

    payload = build_device_create_payload(config, hub_version=hub_version)
    return CreateStep(
        label="device-create",
        family=FAMILY_DEVICE_CREATE,
        payload=payload,
        ack_opcode=ACK_OPCODE_DEVICE_CREATE,
        ack_first_byte=None,  # any byte -- the device id is captured, not matched
        capture_device_id=True,
    )


def build_device_update_step(
    config: DeviceConfig,
    *,
    hub_version: str,
) -> CreateStep:
    """Build the device-update / commit step (``OP_7B08`` on X1).

    Sent at the end of the create flow with the real ``device_id``
    assigned by the hub and ``tail_marker=1`` (the "device is committed"
    value). The body shape is identical to the create body.
    """

    payload = build_device_create_payload(config, hub_version=hub_version)
    return CreateStep(
        label="device-update",
        family=FAMILY_DEVICE_UPDATE,
        payload=payload,
        ack_opcode=ACK_OPCODE_STATUS,
        ack_first_byte=ACK_STATUS_BYTE_OK,
    )


def _body_checksum(body: bytes) -> int:
    """Compute the internal body-checksum byte.

    Every multi-byte write body in this family ends with a 1-byte
    checksum at the last position; the hub validates it before
    accepting the write. The reduction is ``sum(body[:-1]) & 0xFF``
    (the same algorithm the transport uses for the outer frame
    checksum). Pass the body **without** the trailing checksum byte
    or with that byte zeroed; both produce the same result.
    """

    return sum(body[:-1] if body else b"") & 0xFF


def _seal_body(body: bytearray) -> bytes:
    """Write the body checksum into ``body[-1]`` and return as bytes."""

    body[-1] = sum(body[:-1]) & 0xFF
    return bytes(body)


def synthesize_command_code(command_id: int) -> int:
    """Return the X1 synthetic command-code used by keymap/input writes."""

    if command_id < 0 or command_id > 0xFF:
        raise ValueError(f"command_id {command_id} out of byte range")
    return 0x4E20 + (command_id & 0xFF)


def build_macro_step_record(
    *,
    device_id: int,
    command_id: int,
    fid: int = 0,
    duration: int = 0,
    delay: int = 0xFF,
) -> bytes:
    """Build one 10-byte macro-step record for :func:`build_macro_step`."""

    if device_id < 0 or device_id > 0xFF:
        raise ValueError(f"device_id {device_id} out of byte range")
    if command_id < 0 or command_id > 0xFF:
        raise ValueError(f"command_id {command_id} out of byte range")
    if fid < 0 or fid > 0xFFFFFFFFFFFF:
        raise ValueError(f"fid {fid} out of 48-bit range")
    if duration < 0 or duration > 0xFF:
        raise ValueError(f"duration {duration} out of byte range")
    if delay < 0 or delay > 0xFF:
        raise ValueError(f"delay {delay} out of byte range")

    return (
        bytes([device_id & 0xFF, command_id & 0xFF])
        + fid.to_bytes(6, "big")
        + bytes([duration & 0xFF, delay & 0xFF])
    )


def build_x1_input_entry(
    *,
    command_id: int,
    label: str,
) -> bytes:
    """Build one 27-byte X1 direct-input entry for :func:`build_inputs_step`."""

    if command_id < 0 or command_id > 0xFF:
        raise ValueError(f"command_id {command_id} out of byte range")
    label_bytes = label.encode("ascii", errors="replace")[:20].ljust(20, b"\x00")
    return (
        bytes([command_id & 0xFF])
        + b"\x00\x00\x00\x00"
        + synthesize_command_code(command_id).to_bytes(2, "big")
        + label_bytes
    )


#: Per-page payload capacity for IR-command pages. 250 bytes maxes out
#: the opcode-hi byte (``0xFA``) which equals payload length on the wire.
_IR_PAGE_FULL_PAYLOAD = 250

#: Per-page header size: ``[command_seq, page_num_be]``. 3 bytes,
#: present on every page of every command.
_IR_PAGE_HEADER_LEN = 3

#: Pre-label body-header size (size + total_pages + dev + btn + lib +
#: button_code). 12 bytes.
_IR_BODY_PRELABEL_LEN = 12

#: Label slot width on X1 (ASCII). X1S/X2 widens to 60.
_IR_LABEL_SLOT_X1 = 30


def build_ir_command_steps(
    *,
    command_seq: int,
    command_burst_size: int,
    device_id: int,
    button_id: int,
    library_type: int,
    button_code: int,
    label: str,
    library_data: bytes,
) -> list[CreateStep]:
    """Build the paged IR-command write for one command (family ``0x0E``).

    Wire layout (X1, 30-byte label slot). The "body" is what would be
    a single logical record; it's chunked across one or more pages,
    each page prefixed with ``[command_seq, page_num_be]``::

        body[0]         size               (== command_burst_size)
        body[1..2]      total_pages_be     (for *this* command)
        body[3]         device_id
        body[4]         button_id          (default key-slot, 0 = unbound)
        body[5]         library_type       (IR codec selector)
        body[6..11]     button_code (BE)   (6-byte / 48-bit identifier)
        body[12..41]    label slot         (30 bytes ASCII, null-padded)
        body[42..-2]    library_data       (raw IR blob bytes)
        body[-1]        body checksum

    Arguments:
        command_seq: 1-based index of this command within the enclosing
            burst. Appears in ``payload[0]`` of every page of this
            command. (For the user's full-device-create capture, the
            burst writes 42 commands sequentially with ``command_seq``
            running 1..42.)
        command_burst_size: Total number of commands in the burst the
            app intends to write. Written verbatim into ``body[0]`` of
            every page of every command in the burst.
        device_id: 1-byte hub-assigned device id (returned by the
            preceding device-create ack).
        button_id: Default remote key slot the command should land on.
            Often ``0`` (unbound at write time; bound later via the
            button-binding step).
        library_type: IR codec selector. Observed values: ``0x0D`` on
            IR-DB sourced devices. Different codecs use different
            ``library_data`` formats.
        button_code: 48-bit canonical command identifier (the
            "buttoncode" / "fid" used by the binding and macro flows
            to reference this command).
        label: User-visible command label, ASCII, truncated to 30
            bytes.
        library_data: Opaque IR blob bytes appended after the label
            slot. Format depends on ``library_type``.
    """

    if command_seq < 1 or command_seq > 0xFF:
        raise ValueError(f"command_seq {command_seq} out of byte range")
    if command_burst_size < 1 or command_burst_size > 0xFF:
        raise ValueError(f"command_burst_size {command_burst_size} out of byte range")
    if device_id < 0 or device_id > 0xFF:
        raise ValueError(f"device_id {device_id} out of byte range")
    if button_id < 0 or button_id > 0xFF:
        raise ValueError(f"button_id {button_id} out of byte range")
    if library_type < 0 or library_type > 0xFF:
        raise ValueError(f"library_type {library_type} out of byte range")
    if button_code < 0 or button_code > 0xFFFFFFFFFFFF:
        raise ValueError(f"button_code {button_code} out of 48-bit range")
    if not library_data:
        raise ValueError("library_data must not be empty")

    label_bytes = label.encode("ascii", errors="replace")[:_IR_LABEL_SLOT_X1]
    label_slot = label_bytes + b"\x00" * (_IR_LABEL_SLOT_X1 - len(label_bytes))

    # Body content excluding final checksum byte. Pages chunk this
    # buffer; the checksum is computed over the whole sealed body and
    # written at the last position before paging.
    body_content_len = (
        _IR_BODY_PRELABEL_LEN
        + _IR_LABEL_SLOT_X1
        + len(library_data)
    )
    body = bytearray(body_content_len + 1)  # +1 for trailing body checksum

    # Total pages is computed from final body length divided by the
    # page-chunk capacity. The page chunk capacity is full-payload
    # minus the 3-byte page header.
    page_chunk_capacity = _IR_PAGE_FULL_PAYLOAD - _IR_PAGE_HEADER_LEN
    total_pages = (len(body) + page_chunk_capacity - 1) // page_chunk_capacity

    body[0] = command_burst_size & 0xFF
    body[1:3] = total_pages.to_bytes(2, "big")
    body[3] = device_id & 0xFF
    body[4] = button_id & 0xFF
    body[5] = library_type & 0xFF
    body[6:12] = button_code.to_bytes(6, "big")
    body[12:42] = label_slot
    body[42 : 42 + len(library_data)] = library_data
    body_bytes = _seal_body(body)

    steps: list[CreateStep] = []
    for page_index in range(total_pages):
        page_no = page_index + 1
        start = page_index * page_chunk_capacity
        chunk = body_bytes[start : start + page_chunk_capacity]
        header = bytes([command_seq & 0xFF]) + page_no.to_bytes(2, "big")
        steps.append(
            CreateStep(
                label=(
                    f"ir-command code=0x{button_code:012X} "
                    f"page={page_no}/{total_pages}"
                ),
                family=FAMILY_IR_COMMAND,
                payload=header + chunk,
                ack_opcode=ACK_OPCODE_STATUS,
                ack_first_byte=ACK_STATUS_BYTE_OK,
            )
        )
    return steps


def build_button_binding_step(
    *,
    device_id: int,
    button_id: int,
    short_press_device_id: int,
    short_press_button_code: int,
    short_press_button_id: int = 0,
    long_press_device_id: int = 0,
    long_press_button_code: int = 0,
    long_press_button_id: int = 0,
) -> CreateStep:
    """Build a button-binding write (``OP_193E``).

    Writes one ``button_id`` slot on ``device_id`` with full short-
    and long-press triples. Each triple is
    ``(target_device_id, button_code, button_id)`` where
    ``button_code`` is the 6-byte / 48-bit canonical command
    identifier and ``button_id`` is an optional remote-key slot
    reference (often ``0`` when the bound command is not also assigned
    a default key slot).

    Wire layout (3-byte outer wrapper + 22-byte body)::

        payload[0..2]     [01, 0, 1]              outer wrapper
        body[0..2]        [01, 0, 1]              page constants
        body[3]           device_id               keymap entity
        body[4]           button_id               slot being written
        body[5]           short_press_device_id
        body[6..11]       short_press_button_code (BE)
        body[12]          short_press_button_id
        body[13]          long_press_device_id
        body[14..19]      long_press_button_code (BE)
        body[20]          long_press_button_id
        body[21]          body checksum

    Total payload = 25 bytes. The ack on :data:`ACK_OPCODE_BUTTON_BINDING`
    carries ``button_id`` echoed at ``payload[0]`` for correlation.
    """

    for name, value in (
        ("button_id", button_id),
        ("device_id", device_id),
        ("short_press_device_id", short_press_device_id),
        ("short_press_button_id", short_press_button_id),
        ("long_press_device_id", long_press_device_id),
        ("long_press_button_id", long_press_button_id),
    ):
        if value < 0 or value > 0xFF:
            raise ValueError(f"{name}={value} out of byte range")
    for name, value in (
        ("short_press_button_code", short_press_button_code),
        ("long_press_button_code", long_press_button_code),
    ):
        if value < 0 or value > 0xFFFFFFFFFFFF:
            raise ValueError(f"{name}={value} out of 48-bit range")

    body = bytearray(22)
    body[0:3] = bytes([0x01, 0x00, 0x01])
    body[3] = device_id & 0xFF
    body[4] = button_id & 0xFF
    body[5] = short_press_device_id & 0xFF
    body[6:12] = short_press_button_code.to_bytes(6, "big")
    body[12] = short_press_button_id & 0xFF
    body[13] = long_press_device_id & 0xFF
    body[14:20] = long_press_button_code.to_bytes(6, "big")
    body[20] = long_press_button_id & 0xFF
    body_bytes = _seal_body(body)

    payload = bytes([0x01, 0x00, 0x01]) + body_bytes
    assert len(payload) == 25, (
        f"button-binding payload is {len(payload)} bytes, expected 25"
    )

    return CreateStep(
        label=(
            f"button-binding btn=0x{button_id:02X} "
            f"-> dev=0x{short_press_device_id:02X} "
            f"code=0x{short_press_button_code:012X}"
        ),
        family=FAMILY_BUTTON_BINDING,
        payload=payload,
        ack_opcode=ACK_OPCODE_BUTTON_BINDING,
        ack_first_byte=button_id & 0xFF,
    )


def build_set_idle_behavior_step(*, device_id: int, mode: int) -> CreateStep:
    """Build a ``SET_IDLE_BEHAVIOR`` write (``OP_0241``).

    Two-byte payload: ``[device_id, mode]``. Acked via STATUS_ACK with
    ``payload[0] == 0x00``.
    """

    return CreateStep(
        label=f"set-idle-behavior dev=0x{device_id:02X} mode={mode}",
        family=FAMILY_SET_IDLE_BEHAVIOR,
        payload=bytes([device_id & 0xFF, mode & 0xFF]),
        ack_opcode=ACK_OPCODE_STATUS,
        ack_first_byte=ACK_STATUS_BYTE_OK,
    )


#: Width of one macro-step record. Observed at 10 bytes.
MACRO_STEP_RECORD_SIZE = 10


def build_macro_step(
    *,
    device_id: int,
    key_id: int,
    label: str,
    step_records: bytes = b"",
) -> CreateStep:
    """Build a macro write (``OP_3212``).

    Single-page write. Body layout (X1, 30-byte label slot)::

        body[0..2]      [01, 00, 01]                 page header (page 1 of 1)
        body[3]         device_id
        body[4]         key_id            (macro key id, e.g. 0xC6 POWER_ON)
        body[5]         step_count
        body[6 .. 6 + 10*step_count - 1]            step records (10 bytes each)
        body[next .. next + 29]                     label slot (30 bytes ASCII)
        body[next + 30]                              body checksum

    ``step_records`` is the concatenated step-bytes blob (size must be
    a multiple of :data:`MACRO_STEP_RECORD_SIZE`). Pass ``b""`` to
    write a zero-step record (the hub then stores the macro as label
    only, no playback).

    Earlier notes in apk-refactor-log Phase 7 called the
    ``POWER_ON`` / ``POWER_OFF`` writes "placeholders". That framing
    was incomplete -- the auto-written macros do carry one step. The
    backup flow still skips ``REQ_MACROS`` for unconfigured-power
    devices because those auto-written macros are not user content,
    but the wire write does include a real step.
    """

    if key_id < 0 or key_id > 0xFF:
        raise ValueError(f"key_id {key_id} out of byte range")
    if device_id < 0 or device_id > 0xFF:
        raise ValueError(f"device_id {device_id} out of byte range")
    if len(step_records) % MACRO_STEP_RECORD_SIZE != 0:
        raise ValueError(
            f"step_records length {len(step_records)} is not a multiple of "
            f"MACRO_STEP_RECORD_SIZE ({MACRO_STEP_RECORD_SIZE})"
        )
    step_count = len(step_records) // MACRO_STEP_RECORD_SIZE
    if step_count > 0xFF:
        raise ValueError(f"too many steps ({step_count}); max 255")

    label_bytes = label.encode("ascii", errors="replace")[:30]
    label_slot = label_bytes + b"\x00" * (30 - len(label_bytes))

    # body layout: 6-byte preamble + steps + 30-byte label slot + 1-byte checksum
    body_len = 6 + len(step_records) + 30 + 1
    body = bytearray(body_len)
    body[0:3] = bytes([0x01, 0x00, 0x01])
    body[3] = device_id & 0xFF
    body[4] = key_id & 0xFF
    body[5] = step_count & 0xFF
    body[6 : 6 + len(step_records)] = step_records
    label_start = 6 + len(step_records)
    body[label_start : label_start + 30] = label_slot
    body_bytes = _seal_body(body)

    # Outer 3-byte page wrapper: [page_const=1, page_num_be=1].
    payload = bytes([0x01, 0x00, 0x01]) + body_bytes

    return CreateStep(
        label=f"macro key=0x{key_id:02X} label={label!r} steps={step_count}",
        family=FAMILY_MACRO,
        payload=payload,
        ack_opcode=ACK_OPCODE_MACRO,
        ack_first_byte=key_id & 0xFF,
    )


#: Fixed-tail block sizes inside the inputs body (X1).
_INPUTS_KEY_BLOCK_LEN_X1 = 9   # key_start, key_up, key_down
_INPUTS_KEY_NUM_LEN_X1 = 71    # key_num (X1-only number-pad keymap block)
_INPUTS_PER_ENTRY_LEN_X1 = 27  # per-input entry stride on X1

#: Reserved tail padding between key_num and the body checksum on X1.
#: The encoder leaves these 9 bytes zero; preserved here for wire
#: fidelity.
_INPUTS_RESERVED_TAIL_LEN_X1 = 9


def build_inputs_step(
    *,
    device_id: int,
    source_type: int = 0,
    source_count: int = 0,
    start_position: int = 0,
    restart_position: int = 0,
    entries: bytes = b"",
    key_start: bytes = b"",
    key_up: bytes = b"",
    key_down: bytes = b"",
    key_num: bytes = b"",
) -> CreateStep:
    """Build the inputs-slot write (``OP_7746``).

    Single-page write. X1 body layout::

        body[0..2]      [01, 00, 01]            page header
        body[3]         device_id
        body[4]         source_type             (= input_mode from the device record)
        body[5]         source_count
        body[6]         start_position
        body[7]         restart_position
        body[8..]       per-input entries       (source_count * 27 bytes)
        ...             key_start  (9 bytes)
        ...             key_up     (9 bytes)
        ...             key_down   (9 bytes)
        ...             key_num    (71 bytes, X1 number-pad keymap)
        body[-1]        body checksum

    For ``source_type = 2`` ("no input switching", as on the Bose case),
    pass ``source_count=0`` and leave the rest defaulted; the trailing
    key blocks are emitted as 9+9+9+71 zero bytes, matching real
    captures.
    """

    if device_id < 0 or device_id > 0xFF:
        raise ValueError(f"device_id {device_id} out of byte range")
    if source_type < 0 or source_type > 0xFF:
        raise ValueError(f"source_type {source_type} out of byte range")
    if source_count < 0 or source_count > 0xFF:
        raise ValueError(f"source_count {source_count} out of byte range")
    if start_position < 0 or start_position > 0xFF:
        raise ValueError(f"start_position {start_position} out of byte range")
    if restart_position < 0 or restart_position > 0xFF:
        raise ValueError(f"restart_position {restart_position} out of byte range")
    expected_entries_len = source_count * _INPUTS_PER_ENTRY_LEN_X1
    if len(entries) != expected_entries_len:
        raise ValueError(
            f"entries length {len(entries)} does not match "
            f"source_count={source_count} * {_INPUTS_PER_ENTRY_LEN_X1}"
        )

    def _fixed_block(value: bytes, *, width: int) -> bytes:
        if len(value) > width:
            raise ValueError(f"block too long: {len(value)} > {width}")
        return value + b"\x00" * (width - len(value))

    key_start_block = _fixed_block(key_start, width=_INPUTS_KEY_BLOCK_LEN_X1)
    key_up_block = _fixed_block(key_up, width=_INPUTS_KEY_BLOCK_LEN_X1)
    key_down_block = _fixed_block(key_down, width=_INPUTS_KEY_BLOCK_LEN_X1)
    key_num_block = _fixed_block(key_num, width=_INPUTS_KEY_NUM_LEN_X1)

    body_len = (
        8                       # fixed header
        + expected_entries_len
        + _INPUTS_KEY_BLOCK_LEN_X1 * 3
        + _INPUTS_KEY_NUM_LEN_X1
        + _INPUTS_RESERVED_TAIL_LEN_X1
        + 1                     # body checksum byte
    )
    body = bytearray(body_len)
    body[0:3] = bytes([0x01, 0x00, 0x01])
    body[3] = device_id & 0xFF
    body[4] = source_type & 0xFF
    body[5] = source_count & 0xFF
    body[6] = start_position & 0xFF
    body[7] = restart_position & 0xFF
    cursor = 8
    body[cursor : cursor + expected_entries_len] = entries
    cursor += expected_entries_len
    body[cursor : cursor + _INPUTS_KEY_BLOCK_LEN_X1] = key_start_block
    cursor += _INPUTS_KEY_BLOCK_LEN_X1
    body[cursor : cursor + _INPUTS_KEY_BLOCK_LEN_X1] = key_up_block
    cursor += _INPUTS_KEY_BLOCK_LEN_X1
    body[cursor : cursor + _INPUTS_KEY_BLOCK_LEN_X1] = key_down_block
    cursor += _INPUTS_KEY_BLOCK_LEN_X1
    body[cursor : cursor + _INPUTS_KEY_NUM_LEN_X1] = key_num_block
    # The 9 bytes of `_INPUTS_RESERVED_TAIL_LEN_X1` between key_num
    # and the checksum stay zero (bytearray default).
    body_bytes = _seal_body(body)

    # Outer 3-byte page wrapper: [page_const=1, page_num_be=1].
    payload = bytes([0x01, 0x00, 0x01]) + body_bytes

    return CreateStep(
        label=(
            f"inputs dev=0x{device_id:02X} type={source_type} "
            f"count={source_count}"
        ),
        family=FAMILY_INPUTS,
        payload=payload,
        ack_opcode=ACK_OPCODE_STATUS,
        ack_first_byte=ACK_STATUS_BYTE_OK,
    )


def build_remote_sync_step() -> CreateStep:
    """Build the terminal ``REMOTE_SYNC`` step (``OP_0064``).

    Sent at the very end of the create flow with an empty payload.
    Tells the remote to refresh its local view of the hub state.
    """

    return CreateStep(
        label="remote-sync",
        family=FAMILY_REMOTE_SYNC,
        payload=b"",
        ack_opcode=ACK_OPCODE_STATUS,
        ack_first_byte=ACK_STATUS_BYTE_OK,
    )


__all__ = [
    "ACK_OPCODE_BUTTON_BINDING",
    "ACK_OPCODE_DEVICE_CREATE",
    "ACK_OPCODE_MACRO",
    "ACK_OPCODE_STATUS",
    "ACK_STATUS_BYTE_OK",
    "CreateSequenceResult",
    "CreateStep",
    "FAMILY_BUTTON_BINDING",
    "FAMILY_DEVICE_CREATE",
    "FAMILY_DEVICE_UPDATE",
    "FAMILY_INPUTS",
    "FAMILY_IR_COMMAND",
    "FAMILY_MACRO",
    "FAMILY_REMOTE_SYNC",
    "FAMILY_SET_IDLE_BEHAVIOR",
    "MACRO_STEP_RECORD_SIZE",
    "build_button_binding_step",
    "build_device_create_step",
    "build_device_update_step",
    "build_inputs_step",
    "build_ir_command_steps",
    "build_macro_step_record",
    "build_macro_step",
    "build_remote_sync_step",
    "build_set_idle_behavior_step",
    "build_x1_input_entry",
    "run_create_sequence",
    "synthesize_command_code",
]

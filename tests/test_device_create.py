"""Tests for ``lib/device_create.py``.

Two layers under test:

- The step-builders (Layer 3). Each test reconstructs the relevant
  region of a real wire frame from the user's IR-create capture and
  asserts the builder produces matching bytes -- including the
  internal body-checksum at the last position. Where the wire layout
  has multi-byte fields (short/long-press button codes,
  library_data, etc.), the inputs are passed explicitly rather than
  inferred from synthetic blobs.

- The sequencer (Layer 2). A minimal fake proxy exposes the two
  methods the sequencer uses. The fake's ack-queue is scripted by
  each test, so we can verify the sequencer drives steps in order,
  captures the assigned device id, and aborts cleanly on timeout.
"""

from __future__ import annotations

import sys
import types
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s",
    ROOT / "custom_components" / "sofabaton_x1s",
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1
from custom_components.sofabaton_x1s.lib.device_create import (
    ACK_OPCODE_BUTTON_BINDING,
    ACK_OPCODE_DEVICE_CREATE,
    ACK_OPCODE_MACRO,
    ACK_OPCODE_STATUS,
    ACK_STATUS_BYTE_OK,
    CreateStep,
    FAMILY_BUTTON_BINDING,
    FAMILY_DEVICE_CREATE,
    FAMILY_DEVICE_UPDATE,
    FAMILY_INPUTS,
    FAMILY_COMMAND_WRITE,
    FAMILY_MACRO,
    FAMILY_REMOTE_SYNC,
    FAMILY_SET_IDLE_BEHAVIOR,
    MACRO_STEP_RECORD_SIZE,
    build_button_binding_step,
    build_device_create_step,
    build_device_update_step,
    build_command_write_steps,
    build_macro_step_record,
    build_macro_step,
    build_remote_sync_step,
    build_set_idle_behavior_step,
    run_create_sequence,
    synthesize_command_code,
)
from custom_components.sofabaton_x1s.lib.inputs import InputEntry, build_inputs_write
from custom_components.sofabaton_x1s.lib.devices import DeviceConfig


# ---------------------------------------------------------------------------
# Fixtures: real captures from the user's IR-create trace.
# ---------------------------------------------------------------------------


def _frame_to_payload(frame_hex: str) -> bytes:
    """Strip magic / opcode / checksum to return just the payload bytes."""

    raw = bytes.fromhex(frame_hex.replace(" ", "").replace("\n", ""))
    return raw[4:-1]


#: Bose device-create header. 128 bytes total.
BOSE_CREATE_FRAME = (
    "a5 5a 7b 07 01 00 01 01 00 01 00 ff 16 00 0d 03 3f b3 1f 0f 15 c2 4c cc b3 c3 c4 f7 db 3c b4 d8 "
    "00 00 00 00 42 6f 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 42 6f 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 fc 00 00 fc 02 00 01 00 fc 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 0f a1"
)

#: Bose device-update / commit. 128 bytes total. Differs from create
#: in body[4] (device_id 0xFF -> 0x0D), tail[17] (tail_marker 0 -> 1),
#: body checksum at body[119].
BOSE_UPDATE_FRAME = (
    "a5 5a 7b 08 01 00 01 01 00 01 00 0d 16 00 0d 03 3f b3 1f 0f 15 c2 4c cc b3 c3 c4 f7 db 3c b4 d8 "
    "00 00 00 00 42 6f 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 42 6f 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 fc 00 00 fc 02 00 01 00 fc 00 fc 01 00 00 00 00 00 00 00 00 00 00 00 00 1e c0"
)

BOSE_BASE_FIELDS = dict(
    name="Bose",
    brand="Bose",
    icon=0x16,
    sort=0,
    code_type=0x0D,
    device_type=0x03,
    code_id=bytes.fromhex("3fb31f0f15c24cccb3c3c4f7db3cb4d8"),
    hide=0,
    input_flag=0,
    channel=0,
    power_state=0,
    ip_address=None,
    poll_time=0,
    input_mode=2,
    power_mode=0,
    power_style=1,
    share_mode=0,
)


# ---------------------------------------------------------------------------
# Device create / update -- byte-for-byte against wire fixtures
# ---------------------------------------------------------------------------


def test_build_device_create_step_matches_bose_capture() -> None:
    config = DeviceConfig(
        device_id=0xFF, record_kind=0, tail_marker=0, **BOSE_BASE_FIELDS,
    )
    step = build_device_create_step(config, hub_version=HUB_VERSION_X1)

    assert step.family == FAMILY_DEVICE_CREATE
    assert step.ack_opcode == ACK_OPCODE_DEVICE_CREATE
    assert step.ack_first_byte is None
    assert step.capture_device_id is True
    assert step.payload == _frame_to_payload(BOSE_CREATE_FRAME)


def test_build_device_update_step_matches_bose_capture() -> None:
    config = DeviceConfig(
        device_id=0x0D, record_kind=0, tail_marker=1, **BOSE_BASE_FIELDS,
    )
    step = build_device_update_step(config, hub_version=HUB_VERSION_X1)

    assert step.family == FAMILY_DEVICE_UPDATE
    assert step.ack_opcode == ACK_OPCODE_STATUS
    assert step.ack_first_byte == ACK_STATUS_BYTE_OK
    assert step.capture_device_id is False
    assert step.payload == _frame_to_payload(BOSE_UPDATE_FRAME)


def test_create_vs_update_differ_only_in_id_marker_and_checksum() -> None:
    create_config = DeviceConfig(
        device_id=0xFF, record_kind=0, tail_marker=0, **BOSE_BASE_FIELDS,
    )
    update_config = DeviceConfig(
        device_id=0x0D, record_kind=0, tail_marker=1, **BOSE_BASE_FIELDS,
    )
    p1 = build_device_create_step(create_config, hub_version=HUB_VERSION_X1).payload
    p2 = build_device_update_step(update_config, hub_version=HUB_VERSION_X1).payload

    diffs = [i for i in range(len(p1)) if p1[i] != p2[i]]
    # body[4] is at payload[7] (device_id); tail[17] at payload[109]
    # (tail_marker); body checksum at payload[122].
    assert diffs == [7, 109, 122]


# ---------------------------------------------------------------------------
# Button binding -- byte-for-byte against the user's frame #445
# ---------------------------------------------------------------------------


def test_button_binding_step_matches_capture_frame_445() -> None:
    """Frame #445: bind button 0xBD on device 0x0D, short-press target
    is the same device, short-press button code 0x1B46 (low 16 bits of
    the 48-bit canonical identifier). No long-press configured.
    """

    step = build_button_binding_step(
        device_id=0x0D,
        button_id=0xBD,
        short_press_device_id=0x0D,
        short_press_button_code=0x1B46,
    )

    expected_payload = bytes.fromhex(
        "01 00 01"                             # outer wrapper
        " 01 00 01"                            # body page constants
        " 0d bd 0d"                            # device, button, sp_dev
        " 00 00 00 00 1b 46"                   # sp button code (6 BE)
        " 00"                                  # sp button id
        " 00"                                  # lp device id
        " 00 00 00 00 00 00"                   # lp button code (6 BE)
        " 00"                                  # lp button id
        " 3a"                                  # body checksum
        .replace(" ", "")
    )
    assert step.family == FAMILY_BUTTON_BINDING
    assert step.ack_opcode == ACK_OPCODE_BUTTON_BINDING
    assert step.ack_first_byte == 0xBD
    assert step.payload == expected_payload


def test_button_binding_step_round_trips_long_press_fields() -> None:
    """Long-press fields write through unchanged; body checksum
    recomputes from the actual bytes.
    """

    step = build_button_binding_step(
        device_id=0x0D,
        button_id=0xBD,
        short_press_device_id=0x0D,
        short_press_button_code=0x0000_0000_1B46,
        short_press_button_id=0x11,
        long_press_device_id=0x0E,
        long_press_button_code=0x0000_0000_AB12,
        long_press_button_id=0x22,
    )
    # body[12] short_press_button_id at payload[15]
    assert step.payload[15] == 0x11
    # body[13] long_press_device_id at payload[16]
    assert step.payload[16] == 0x0E
    # body[14..19] long_press_button_code at payload[17..22]
    assert step.payload[17:23] == bytes.fromhex("0000 0000 ab12".replace(" ", ""))
    # body[20] long_press_button_id at payload[23]
    assert step.payload[23] == 0x22
    # body checksum at payload[24] is sum(payload[3..23]) mod 256
    assert step.payload[24] == sum(step.payload[3:24]) & 0xFF


def test_button_binding_step_rejects_oversized_button_code() -> None:
    with pytest.raises(ValueError):
        build_button_binding_step(
            device_id=0,
            button_id=0,
            short_press_device_id=0,
            short_press_button_code=1 << 48,  # too big for 6 bytes
        )


# ---------------------------------------------------------------------------
# Idle behavior, remote sync (small fixed-shape steps)
# ---------------------------------------------------------------------------


def test_set_idle_behavior_step_matches_capture_frame_477() -> None:
    step = build_set_idle_behavior_step(device_id=0x0D, mode=1)

    assert step.family == FAMILY_SET_IDLE_BEHAVIOR
    assert step.ack_opcode == ACK_OPCODE_STATUS
    assert step.ack_first_byte == ACK_STATUS_BYTE_OK
    assert step.payload == bytes.fromhex("0d 01".replace(" ", ""))


def test_remote_sync_step_is_empty_payload() -> None:
    step = build_remote_sync_step()

    assert step.family == FAMILY_REMOTE_SYNC
    assert step.payload == b""
    assert step.ack_opcode == ACK_OPCODE_STATUS
    assert step.ack_first_byte == ACK_STATUS_BYTE_OK


# ---------------------------------------------------------------------------
# Macros -- byte-for-byte against frame #479 (POWER_ON, 1 step)
# ---------------------------------------------------------------------------


def test_macro_step_matches_capture_frame_479_power_on() -> None:
    """Frame #479: POWER_ON macro for the Bose device. Carries one
    10-byte step record (not a zero-step "placeholder" as we earlier
    documented).
    """

    step_record = bytes.fromhex("0d 00 00 00 00 00 00 01 00 ff".replace(" ", ""))
    step = build_macro_step(
        hub_version=HUB_VERSION_X1,
        device_id=0x0D,
        key_id=0xC6,
        label="POWER_ON",
        step_records=step_record,
    )

    expected_payload = bytes.fromhex(
        "01 00 01"                                  # outer page wrapper
        " 01 00 01"                                 # body page header
        " 0d c6 01"                                 # device, key_id, step_count
        " 0d 00 00 00 00 00 00 01 00 ff"            # 10-byte step record
        " 50 4f 57 45 52 5f 4f 4e"                  # "POWER_ON"
        " 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"  # padding
        " 6c"                                       # body checksum
        .replace(" ", "")
    )
    assert step.family == FAMILY_MACRO
    assert step.ack_opcode == ACK_OPCODE_MACRO
    assert step.ack_first_byte == 0xC6
    assert step.payload == expected_payload


def test_macro_step_with_zero_steps_writes_label_only() -> None:
    step = build_macro_step(
        hub_version=HUB_VERSION_X1,
        device_id=0x0D,
        key_id=0xC7,
        label="EMPTY",
        step_records=b"",
    )
    # Outer wrapper [01, 00, 01] occupies payload[0..2]; body[5] is the
    # step_count byte, at payload[8].
    assert step.payload[8] == 0
    # No step bytes -- label starts at body[6] = payload[9].
    assert step.payload[9:14] == b"EMPTY"


def test_macro_step_rejects_step_record_length_not_multiple_of_ten() -> None:
    with pytest.raises(ValueError):
        build_macro_step(
            hub_version=HUB_VERSION_X1,
            device_id=0,
            key_id=0,
            label="x",
            step_records=b"\x00" * 9,
        )


# ---------------------------------------------------------------------------
# Inputs -- byte-for-byte against frame #483 ("no input switching")
# ---------------------------------------------------------------------------


def test_synthesize_command_code_matches_x1_keymap_convention() -> None:
    assert synthesize_command_code(0x01) == 0x4E21
    assert synthesize_command_code(0x06) == 0x4E26


# Inputs builder/parser tests now live in ``tests/lib/test_inputs.py``;
# the legacy ``build_inputs_step`` / ``build_x1_input_entry`` shape was
# rewritten in Phase 3 of the protocol refactor and the canonical
# layout (4 control-key rows + 10 favorite slots + state byte) is
# pinned there instead of here.


def test_build_macro_step_record_serializes_ten_byte_row() -> None:
    record = build_macro_step_record(
        device_id=0x0D,
        command_id=0x12,
        fid=0x4E32,
        duration=0x01,
        delay=0xFF,
    )

    assert len(record) == MACRO_STEP_RECORD_SIZE
    assert record == bytes.fromhex("0d 12 00 00 00 00 4e 32 01 ff")


# ---------------------------------------------------------------------------
# IR command pagination
# ---------------------------------------------------------------------------


def test_ir_command_steps_single_page_when_body_fits() -> None:
    """A small library_data yields a single page; total_pages_be is 1
    and the body checksum closes the page.
    """

    library_data = bytes.fromhex("02 20 00 00 00 00 12 34 00 00 56 78 00 00".replace(" ", ""))
    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=1,
        command_burst_size=1,
        device_id=0x0D,
        button_id=0,
        library_type=0x0D,
        button_code=0x000000000001,
        label="Power",
        library_data=library_data,
    )

    assert len(steps) == 1
    payload = steps[0].payload
    # Per-page header
    assert payload[0] == 1                                     # command_seq
    assert payload[1:3] == (1).to_bytes(2, "big")              # page 1 of 1
    # Body header
    assert payload[3] == 1                                     # size (burst size)
    assert payload[4:6] == (1).to_bytes(2, "big")              # total_pages_be
    assert payload[6] == 0x0D                                  # device_id
    assert payload[7] == 0                                     # button_id
    assert payload[8] == 0x0D                                  # library_type
    assert payload[9:15] == (1).to_bytes(6, "big")             # button_code BE
    assert payload[15:20] == b"Power"                          # label start
    assert payload[20:45] == b"\x00" * 25                      # label padding
    assert payload[45 : 45 + len(library_data)] == library_data
    # Body checksum is at the last byte; equals sum of everything before.
    body_start_in_payload = 3
    body = payload[body_start_in_payload:]
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_ir_command_steps_replicates_capture_frame_193_prelude() -> None:
    """The first 47 bytes of page 1 of the user's Power command are
    fixed structure (no library_data byte that depends on codec
    specifics). We assert byte-for-byte against the capture for that
    prelude, plus the total_pages_be field which depends on the full
    blob length used in the original write.
    """

    # The user's #193/#195/#197 sequence had a 556-byte library_data.
    # The exact blob bytes are not needed here: total_pages_be derives
    # from len(body) once header + label + data + 1 checksum are laid
    # out, and total_pages should land at 3 for that original.
    library_data = b"\x02\x20\x00\x00\x00\x00" + b"\x00" * 550
    assert len(library_data) == 556

    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=1,
        command_burst_size=42,            # observed: 42 commands in the burst
        device_id=0x0D,
        button_id=0,
        library_type=0x0D,
        button_code=0x000000000001,
        label="Power",
        library_data=library_data,
    )
    page1 = steps[0].payload

    # First 6 bytes of payload (page header + size + total_pages_be)
    # must match the wire exactly.
    assert page1[0:6] == bytes.fromhex("01 00 01 2a 00 03".replace(" ", ""))
    # Body header up through start of label slot.
    assert page1[6:15] == bytes.fromhex("0d 00 0d 00 00 00 00 00 01".replace(" ", ""))
    # Label "Power" + padding.
    assert page1[15:20] == b"Power"
    assert page1[20:45] == b"\x00" * 25
    # Three pages total.
    assert len(steps) == 3


def test_ir_command_steps_splits_long_blob_at_247_byte_chunks() -> None:
    """Pages 2..N use the 3-byte page header + 247-byte body chunks.
    The final page is short; its opcode-hi is derived from payload
    length by the proxy and not stored on the CreateStep.
    """

    # Use a library_data that forces exactly 3 pages. The pre-data
    # header is 42 bytes + label slot 30 bytes + 1 checksum byte = 73
    # body bytes of overhead. Page chunk capacity is 247. For 3 pages:
    # 247*2 < total_body <= 247*3  →  494 < total_body <= 741.
    # Use total_body = 600 (library_data = 600 - 73 = 527 bytes).
    library_data = bytes(range(256))[:200] + bytes(range(256))[:200] + bytes(range(256))[:127]
    assert len(library_data) == 527

    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=2,
        command_burst_size=5,
        device_id=0x0D,
        button_id=0,
        library_type=0x0D,
        button_code=0x000000000038,
        label="X",
        library_data=library_data,
    )

    assert len(steps) == 3
    # Pages 1 and 2 are full (250-byte payload = 3 header + 247 chunk).
    assert len(steps[0].payload) == 250
    assert len(steps[1].payload) == 250
    # Page 3 is short.
    assert len(steps[2].payload) < 250
    # Per-page command_seq is stamped on every page.
    assert all(s.payload[0] == 2 for s in steps)
    # Page numbers run 1..3.
    for i, s in enumerate(steps, start=1):
        assert s.payload[1:3] == i.to_bytes(2, "big")


def test_ir_command_steps_validates_byte_ranges() -> None:
    with pytest.raises(ValueError):
        build_command_write_steps(
            hub_version=HUB_VERSION_X1,
            command_seq=0,                  # invalid: must be >= 1
            command_burst_size=1,
            device_id=0,
            button_id=0,
            library_type=0,
            button_code=0,
            label="x",
            library_data=b"\x01",
        )
    with pytest.raises(ValueError):
        build_command_write_steps(
            hub_version=HUB_VERSION_X1,
            command_seq=1,
            command_burst_size=1,
            device_id=0,
            button_id=0,
            library_type=0,
            button_code=1 << 48,            # invalid: 49-bit
            label="x",
            library_data=b"\x01",
        )
    with pytest.raises(ValueError):
        build_command_write_steps(
            hub_version=HUB_VERSION_X1,
            command_seq=1,
            command_burst_size=1,
            device_id=0,
            button_id=0,
            library_type=0,
            button_code=0,
            label="x",
            library_data=b"",               # invalid: empty
        )


# ---------------------------------------------------------------------------
# Layer 2 -- sequencer tests against a fake proxy
# ---------------------------------------------------------------------------


@dataclass
class _FakeProxy:
    send_log: list[tuple[int, bytes]] = field(default_factory=list)
    ack_script: list[tuple[int, bytes] | None] = field(default_factory=list)
    wait_calls: list[list[tuple[int, int | None]]] = field(default_factory=list)

    def _send_family_frame(self, family: int, payload: bytes) -> None:
        self.send_log.append((family, bytes(payload)))

    def wait_for_ack_any(
        self,
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        self.wait_calls.append(list(candidates))
        if not self.ack_script:
            return None
        return self.ack_script.pop(0)


def _step(label: str, family: int, payload: bytes, ack_opcode: int, **kw) -> CreateStep:
    return CreateStep(label=label, family=family, payload=payload, ack_opcode=ack_opcode, **kw)


def test_run_create_sequence_drives_steps_in_order_and_succeeds() -> None:
    steps = [
        _step("create", 0x07, b"\x01", ACK_OPCODE_DEVICE_CREATE, capture_device_id=True),
        _step("status", 0x41, b"\xAA\x01", ACK_OPCODE_STATUS, ack_first_byte=0),
    ]
    proxy = _FakeProxy(
        ack_script=[
            (ACK_OPCODE_DEVICE_CREATE, b"\x0D"),
            (ACK_OPCODE_STATUS, b"\x00"),
        ],
    )

    result = run_create_sequence(proxy, steps)

    assert result.success is True
    assert result.assigned_device_id == 0x0D
    assert result.failed_step is None
    assert proxy.send_log == [(0x07, b"\x01"), (0x41, b"\xAA\x01")]


def test_run_create_sequence_aborts_on_first_timeout() -> None:
    steps = [
        _step("first", 0x07, b"\x01", ACK_OPCODE_DEVICE_CREATE, capture_device_id=True),
        _step("never-reached", 0x41, b"\x02", ACK_OPCODE_STATUS, ack_first_byte=0),
    ]
    proxy = _FakeProxy(ack_script=[None])

    result = run_create_sequence(proxy, steps)

    assert result.success is False
    assert result.assigned_device_id is None
    assert result.failed_step is steps[0]
    assert result.failed_index == 0
    assert proxy.send_log == [(0x07, b"\x01")]


def test_run_create_sequence_retries_on_timeout_then_succeeds() -> None:
    steps = [
        _step(
            "retry",
            0x41,
            b"\xAA\x01",
            ACK_OPCODE_STATUS,
            ack_first_byte=0,
            retries=1,
        ),
    ]
    proxy = _FakeProxy(
        ack_script=[None, (ACK_OPCODE_STATUS, b"\x00")],
    )

    result = run_create_sequence(proxy, steps)

    assert result.success is True
    assert proxy.send_log == [(0x41, b"\xAA\x01"), (0x41, b"\xAA\x01")]


def test_run_create_sequence_captures_device_id_only_from_flagged_step() -> None:
    steps = [
        _step("noise", 0x41, b"\x00", ACK_OPCODE_STATUS, ack_first_byte=0),
        _step("create", 0x07, b"\x01", ACK_OPCODE_DEVICE_CREATE, capture_device_id=True),
        _step("noise2", 0x41, b"\x00", ACK_OPCODE_STATUS, ack_first_byte=0),
    ]
    proxy = _FakeProxy(
        ack_script=[
            (ACK_OPCODE_STATUS, b"\x00"),
            (ACK_OPCODE_DEVICE_CREATE, b"\x0E"),
            (ACK_OPCODE_STATUS, b"\x00"),
        ],
    )

    result = run_create_sequence(proxy, steps)

    assert result.success is True
    assert result.assigned_device_id == 0x0E


def test_run_create_sequence_distinguishes_rejection_from_timeout() -> None:
    """When the hub answers with a byte in ``ack_reject_first_bytes``,
    the result must report ``rejected=True`` (not a timeout)."""

    rejected_step = _step(
        "reject",
        0x0E,
        b"\x01\x02",
        ACK_OPCODE_STATUS,
        ack_first_byte=0,
        ack_reject_first_bytes=(0x0C,),
    )
    proxy = _FakeProxy(ack_script=[(ACK_OPCODE_STATUS, b"\x0C")])

    result = run_create_sequence(proxy, [rejected_step])

    assert result.success is False
    assert result.rejected is True
    assert result.reject_payload == b"\x0C"
    assert result.failed_step is rejected_step


def test_run_create_sequence_treats_any_nonzero_status_ack_as_rejection() -> None:
    """STATUS_ACK steps that ask for success on ``payload[0]==0x00`` must
    also fail fast on any non-zero first byte. STATUS_ACK is a binary
    verdict (zero=accepted, anything else=rejected with a status code),
    so a non-zero first byte is always a rejection of the in-flight
    write -- waiting out the per-step timeout would just turn a fast,
    diagnosable rejection into a slow "timeout".
    """

    step = _step(
        "inputs",
        0x46,
        b"\x00",
        ACK_OPCODE_STATUS,
        ack_first_byte=0,
        # No explicit reject byte list -- wildcard behaviour must kick in.
    )
    proxy = _FakeProxy(ack_script=[(ACK_OPCODE_STATUS, b"\x09")])

    result = run_create_sequence(proxy, [step])

    assert result.success is False
    assert result.rejected is True
    assert result.reject_payload == b"\x09"
    assert result.failed_step is step


def test_run_create_sequence_pages_oversized_family_46_payloads() -> None:
    entries = [
        InputEntry(
            key_id=0x33 + idx,
            fid=0x0000_0000_4E33 + idx,
            ordinal=idx + 1,
            label=f"Input {idx + 1}",
        )
        for idx in range(12)
    ]
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x05,
        entries=entries,
    )
    step = _step(
        "inputs",
        FAMILY_INPUTS,
        payload,
        ACK_OPCODE_STATUS,
        ack_first_byte=0,
    )
    proxy = _FakeProxy(
        ack_script=[
            (ACK_OPCODE_STATUS, b"\x00"),
            (ACK_OPCODE_STATUS, b"\x00"),
        ],
    )

    result = run_create_sequence(proxy, [step])

    assert result.success is True
    assert len(proxy.send_log) == 2

    first_family, first_payload = proxy.send_log[0]
    second_family, second_payload = proxy.send_log[1]
    assert first_family == FAMILY_INPUTS
    assert second_family == FAMILY_INPUTS
    assert len(first_payload) == 250
    assert len(second_payload) == 196
    assert first_payload[:3] == bytes.fromhex("01 00 01")
    assert second_payload[:3] == bytes.fromhex("01 00 02")
    assert b"".join(sent_payload[3:] for _family, sent_payload in proxy.send_log) == payload[3:]
    assert len(proxy.wait_calls) == 2


# ---------------------------------------------------------------------------
# Source-faithful single-command save: the canonical builder writes the
# same 30-byte ASCII label slot the app's encoder uses, regardless of
# whether the caller is doing a fresh-create burst (size=N) or a
# single-command save (size=1).
# ---------------------------------------------------------------------------


_SOURCE_FAITHFUL_IR_SAVE_PAGE = (
    # outer page header + body: size=1, total_pages=1, dev=0x12,
    # cmd_id=0x07, library_type=0x0D, button_code=0, 30-byte label
    # 'Input\0...', 10 bytes of library_data 00..09, body checksum.
    "01000101000112070d000000000000"
    "496e70757400000000000000000000000000000000000000000000000000"
    "00010203040506070809"
    "65"
)


def test_single_command_save_writes_source_faithful_30_byte_label_slot() -> None:
    """A burst of size 1 (the single-command save path) emits the same
    30-byte ASCII label slot the source app uses for the multi-command
    create burst. There is no per-call slot-width customization."""

    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=1,
        command_burst_size=1,
        device_id=0x12,
        button_id=0x07,
        library_type=0x0D,
        button_code=0,
        label="Input",
        library_data=bytes(range(10)),
    )

    assert len(steps) == 1
    assert steps[0].family == FAMILY_COMMAND_WRITE
    assert steps[0].payload.hex() == _SOURCE_FAITHFUL_IR_SAVE_PAGE


_SOURCE_FAITHFUL_CMDREC_SAVE_PAGE = (
    "010001010001120703000000004e25"
    "426c7565746f6f7468000000000000000000000000000000000000000000"
    "aabbccdd"
    "55"
)


def test_single_command_save_non_ir_codec_writes_library_type_and_button_code() -> None:
    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=1,
        command_burst_size=1,
        device_id=0x12,
        button_id=0x07,
        library_type=0x03,
        button_code=0x4E25,
        label="Bluetooth",
        library_data=bytes.fromhex("aabbccdd"),
    )

    assert len(steps) == 1
    assert steps[0].payload.hex() == _SOURCE_FAITHFUL_CMDREC_SAVE_PAGE


_SOURCE_FAITHFUL_IR_SAVE_PAGES_MULTI = [
    "01000101000205090d000000000000426967000000000000000000000000000000000000000000000000000000000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcc",
    "010002cdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b62",
]


def test_single_command_save_pages_a_long_blob_at_247_byte_chunks() -> None:
    """Multi-page single-command save (300-byte blob, label 'Big',
    source-faithful 30-byte slot)."""

    steps = build_command_write_steps(
        hub_version=HUB_VERSION_X1,
        command_seq=1,
        command_burst_size=1,
        device_id=0x05,
        button_id=0x09,
        library_type=0x0D,
        button_code=0,
        label="Big",
        library_data=bytes((i & 0xFF) for i in range(300)),
    )

    assert [step.payload.hex() for step in steps] == _SOURCE_FAITHFUL_IR_SAVE_PAGES_MULTI
    # Each page advertises the rejection byte to the sequencer.
    for step in steps:
        assert step.ack_reject_first_bytes == (0x0C,)

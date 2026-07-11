"""Device-create / device-restore step machinery.

The hub's device-create flow is a strictly serialised sequence of
``(opcode, payload, ack)`` exchanges. Each phase -- create-header,
per-command record pages, button bindings, idle behaviour, macros,
inputs slot, device-update commit, remote sync -- follows the same
transport pattern, differing only in opcode and ack-correlation.

This module factors that pattern into two layers so the device-restore
flow and the existing WiFi-create flow can share code:

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
``wait_for_ack_any(candidates, *, timeout, not_before)``. That
lets tests substitute a lightweight fake without spinning up the full
:class:`X1Proxy`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Protocol

from .devices import DeviceConfig, build_device_create_payload
from .wire_schema import schema_for


#: Discriminant for :class:`DeviceCreateRequest.transport`. ``"ir"`` covers
#: every record-shaped device class -- IR, Bluetooth, RF -- that uses the
#: canonical ``build_device_create_step`` / ``build_command_write_steps``
#: pipeline. ``"network_callback"`` covers WiFi-commands devices whose
#: writes are wifi-create-shape payloads bound to a callback service on
#: the integration; the Roku-on-X1 vs IP-generic-on-X1S/X2 split is an
#: internal variant of this transport, resolved from ``hub_version`` /
#: ``device_class_code`` inside the orchestrator rather than from the
#: request.
TransportKind = Literal["ir", "network_callback"]


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

#: Family byte for the activity-create header (A->H). Mirrors the
#: device-create flow but writes the same 120/210-byte body to a
#: different opcode family. Acked via :data:`ACK_OPCODE_DEVICE_CREATE`
#: with the assigned activity id in ``payload[0]`` (the hub uses the
#: same id space for devices and activities).
FAMILY_ACTIVITY_CREATE = 0x37

#: Family byte for per-command record writes (A->H, paged). Used for
#: all device classes -- IR-DB, BT, RF, learned codes -- with the codec
#: selected by the ``library_type`` field inside the body, not by
#: opcode. The opcode-hi byte equals the payload length so a full page
#: is ``OP_FA0E`` (250-byte payload) and a final short page is e.g.
#: ``OP_6C0E`` (108-byte payload).
FAMILY_COMMAND_WRITE = 0x0E

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

#: Family byte for device key-sort writes.
FAMILY_KEY_SORT = 0x61

#: Family byte for ``REMOTE_SYNC`` (A->H). Wire example: ``OP_0064``
#: on frame #487. Acked via the generic STATUS_ACK family.
FAMILY_REMOTE_SYNC = 0x64


#: Full ack opcode the hub returns for a device-create. ``payload[0]``
#: carries the freshly assigned ``device_id``.
ACK_OPCODE_DEVICE_CREATE = 0x0107

#: Full ack opcode the X1 returns for an activity-create. Observed as an
#: immediate reply to family-0x37 writes, with ``payload[0]`` carrying the
#: freshly assigned activity id.
ACK_OPCODE_ACTIVITY_CREATE = 0x0137

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


_PAGED_WRITE_OUTER_WRAPPER_LEN = 3
_PAGED_WRITE_BODY_CHUNK = 247


class _ProxyLike(Protocol):
    """Subset of :class:`X1Proxy` the sequencer needs."""

    def _send_family_frame(self, family: int, payload: bytes) -> None: ...

    def wait_for_ack_any(
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
        ack_reject_first_bytes: ``payload[0]`` values that indicate the
            hub *explicitly rejected* this write. The sequencer accepts
            these as ack-arrivals (so it does not time out waiting) but
            reports them as a rejection rather than success. The
            classic example is STATUS_ACK with ``payload[0] == 0x0C``
            for a malformed save page.
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
    ack_reject_first_bytes: tuple[int, ...] = ()
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
    step that did not get a successful ack. ``rejected`` distinguishes
    "hub said no" (an ack arrived with a byte listed in
    ``ack_reject_first_bytes``) from "no ack at all within the retry
    budget" (a timeout). ``reject_payload`` carries the rejection ack's
    full payload when ``rejected`` is True, for diagnostics.
    """

    success: bool
    assigned_device_id: int | None
    failed_step: CreateStep | None
    failed_index: int | None
    rejected: bool = False
    reject_payload: bytes | None = None


def _page_create_step_payloads(step: CreateStep) -> list[bytes]:
    """Return one or more wire payloads for a create step.

    Most create-step payloads already fit in one family frame. The
    family-0x46 inputs writer is different: ``build_inputs_write``
    returns the full canonical payload with ``total_pages`` already
    populated in the body header, and callers rely on the transport
    layer to split oversized bodies into 247-byte chunks with a fresh
    3-byte ``[0x01][page_no_be]`` wrapper on each page.
    """

    if (
        step.family != FAMILY_INPUTS
        or len(step.payload) <= 250
        or len(step.payload) <= _PAGED_WRITE_OUTER_WRAPPER_LEN
    ):
        return [step.payload]

    body = step.payload[_PAGED_WRITE_OUTER_WRAPPER_LEN:]
    payloads: list[bytes] = []
    total_pages = max(1, (len(body) + _PAGED_WRITE_BODY_CHUNK - 1) // _PAGED_WRITE_BODY_CHUNK)
    for seq in range(1, total_pages + 1):
        chunk = body[(seq - 1) * _PAGED_WRITE_BODY_CHUNK : seq * _PAGED_WRITE_BODY_CHUNK]
        payloads.append(bytes([0x01]) + seq.to_bytes(2, "big") + bytes(chunk))
    return payloads


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
    calling (typically via ``proxy.reset_ack_queues()``). This function
    deliberately does not touch proxy lifecycle so the same sequencer
    can be reused mid-session if needed.
    """

    assigned_device_id: int | None = None
    steps_list = list(steps)

    for index, step in enumerate(steps_list):
        # Build the list of (opcode, first_byte) candidates the wait
        # call should accept. We include both the success-first-byte
        # and any rejection-first-bytes so the wait returns as soon as
        # the hub answers either way; the sequencer then classifies.
        #
        # Special case: a STATUS_ACK step that expects success on
        # ``payload[0]==0x00`` should also wake up on any non-zero
        # first byte. STATUS_ACK frames carry a binary verdict in
        # ``payload[0]`` (``0x00`` = accepted, anything else = rejected
        # with a status code), so a non-zero byte is always a
        # rejection of the in-flight write. Without this, a rejection
        # silently waits out the per-step timeout (5 s by default)
        # instead of failing fast with the status code in the log.
        candidates: list[tuple[int, int | None]] = [
            (step.ack_opcode, step.ack_first_byte)
        ]
        wildcard_status_reject = (
            step.ack_opcode == ACK_OPCODE_STATUS
            and step.ack_first_byte == ACK_STATUS_BYTE_OK
        )
        if wildcard_status_reject:
            candidates.append((step.ack_opcode, None))
        for reject_byte in step.ack_reject_first_bytes:
            candidates.append((step.ack_opcode, reject_byte & 0xFF))

        matched: tuple[int, bytes] | None = None
        page_payloads = _page_create_step_payloads(step)

        for page_payload in page_payloads:
            attempts_left = max(1, int(step.retries) + 1)
            matched = None

            while attempts_left > 0:
                attempts_left -= 1
                # Let any in-flight read burst finish before writing: the
                # hub drops frames that arrive mid-burst (e.g. a queued
                # catalog refresh answered between two steps).
                quiesce = getattr(proxy, "wait_for_read_burst_quiesce", None)
                if callable(quiesce):
                    quiesce()
                send_ts = time.monotonic()
                proxy._send_family_frame(step.family, page_payload)
                matched = proxy.wait_for_ack_any(
                    candidates,
                    timeout=step.timeout,
                    not_before=send_ts,
                )
                if matched is not None:
                    break
                if attempts_left > 0 and step.retry_delay > 0:
                    time.sleep(step.retry_delay)

            if matched is None:
                break

        if matched is None:
            return CreateSequenceResult(
                success=False,
                assigned_device_id=assigned_device_id,
                failed_step=step,
                failed_index=index,
                rejected=False,
                reject_payload=None,
            )

        _ack_opcode, ack_payload = matched
        first_byte = ack_payload[0] if ack_payload else None
        is_explicit_reject = (
            step.ack_reject_first_bytes
            and first_byte is not None
            and (first_byte & 0xFF) in step.ack_reject_first_bytes
        )
        is_status_wildcard_reject = (
            wildcard_status_reject
            and first_byte is not None
            and (first_byte & 0xFF) != ACK_STATUS_BYTE_OK
        )
        if is_explicit_reject or is_status_wildcard_reject:
            return CreateSequenceResult(
                success=False,
                assigned_device_id=assigned_device_id,
                failed_step=step,
                failed_index=index,
                rejected=True,
                reject_payload=bytes(ack_payload),
            )

        if step.capture_device_id and ack_payload:
            assigned_device_id = ack_payload[0] & 0xFF

    return CreateSequenceResult(
        success=True,
        assigned_device_id=assigned_device_id,
        failed_step=None,
        failed_index=None,
        rejected=False,
        reject_payload=None,
    )


# ---------------------------------------------------------------------------
# Layer 1 -- unified device-create request / orchestrator
#
# Phase 7 of the protocol refactor folds the four previously-parallel
# entry points -- ``create_wifi_device`` (X1 Roku), ``_create_virtual_ip_wifi_device``
# (X1S/X2 IP), ``_restore_network_callback_device`` and the IR/BT/RF
# branch of ``restore_device`` -- into a single :func:`run_device_create`
# orchestrator that takes a typed :class:`DeviceCreateRequest`. The
# orchestrator dispatches on :attr:`DeviceCreateRequest.transport`;
# per-transport details (variant selection inside ``network_callback``,
# command-class selection inside ``ir``) live on the proxy mixins so
# this module stays free of wire layout for the wifi family-0x07 body.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DeviceCreateRequest:
    """Unified input for :func:`run_device_create`.

    Both the user-driven "create wifi device" entry point and the
    backup-driven "restore device" entry point construct one of these
    and hand it to the orchestrator. The orchestrator decides which
    on-the-wire sequence to issue based on :attr:`transport`; everything
    else in this dataclass is the data the chosen pipeline needs.

    Field groupings:

    - **Always set:** :attr:`transport`.
    - **IR transport:** :attr:`device_block` (full backup device block
      including ``device_class``, ``device_class_code``, body fields),
      :attr:`commands` (rows with ``restore_data`` carrying
      ``library_type`` / ``button_code`` / ``data_hex``),
      :attr:`button_bindings`, :attr:`macros`, :attr:`inputs`,
      :attr:`favorites`.
    - **Network-callback transport:** :attr:`network_callback_profile`
      (carries ``device_name``, ``brand_name``, ``ip_address``,
      ``request_port``, ``slots``, ``input_command_ids``,
      ``power_on_command_id``, ``power_off_command_id``,
      ``device_class``, ``device_class_code``). The orchestrator
      reads everything wifi-specific from this dict so the top-level
      dataclass shape stays the same across transports.

    :attr:`entity_kind` reserves a slot for Phase 8's activity-restore
    unification: ``"device"`` writes the family-0x07 create body,
    ``"activity"`` writes family-0x37. Phase 7 ships only the
    ``"device"`` path; passing ``"activity"`` raises until Phase 8.
    """

    transport: TransportKind
    device_block: dict[str, Any] = field(default_factory=dict)
    commands: list[dict[str, Any]] = field(default_factory=list)
    button_bindings: list[dict[str, Any]] = field(default_factory=list)
    macros: list[dict[str, Any]] = field(default_factory=list)
    inputs: list[dict[str, Any]] = field(default_factory=list)
    input_record: dict[str, Any] | None = None
    favorites: list[dict[str, Any]] = field(default_factory=list)
    key_sort: dict[str, Any] | None = None
    network_callback_profile: dict[str, Any] | None = None
    entity_kind: Literal["device", "activity"] = "device"
    #: Source-device-id -> destination-device-id translation used when
    #: ``entity_kind="activity"``. Activity content references commands
    #: on *other* devices, and the destination hub will have assigned
    #: those devices new ids at restore time. Empty for device-create
    #: requests (which have no cross-device references).
    device_id_map: dict[int, int] = field(default_factory=dict)
    #: Source-activity-id -> destination-activity-id translation for
    #: cross-activity references (e.g. a power-off macro step that
    #: starts another activity). The bundle orchestrator restores
    #: activities in dependency order and threads this map in; the
    #: activity's OWN id maps through a dedicated branch instead.
    activity_id_map: dict[int, int] = field(default_factory=dict)
    #: Source-device-id -> {source_command_id: new_command_id} mapping
    #: captured during a bundle restore's devices phase. Used by the
    #: activity-create path to resolve macro steps whose ``key_id`` is
    #: ``0xC5`` (the "switch input on device" marker): the step's
    #: ``duration`` byte is a 1-based ordinal into the *source* device's
    #: input list, which has to be re-resolved against the *destination*
    #: device's freshly-assigned command ids. Empty outside the
    #: bundle-restore code path.
    command_id_maps_by_source_device_id: dict[int, dict[int, int]] = field(
        default_factory=dict
    )
    #: Per-device backup payloads from the bundle currently being
    #: restored, keyed by source device_id. The activity-create path
    #: uses this to look up each step's source-device input table when
    #: resolving ``0xC5`` ordinals. Empty outside the bundle-restore
    #: code path; the per-entity restore_activity entry point never
    #: populates this.
    bundle_devices_by_source_id: dict[int, dict[str, Any]] = field(
        default_factory=dict
    )


@dataclass(frozen=True, slots=True)
class DeviceCreateResult:
    """Outcome of :func:`run_device_create`.

    On success, ``device_id`` carries the freshly assigned id and the
    ``restored_*`` / ``skipped_*`` counters describe what the
    orchestrator wrote (or chose to skip with a log line). The
    ``command_id_map`` translates source-side command ids (from a
    backup payload) to the ids the destination hub assigned at write
    time -- empty for fresh-create calls that didn't reference any
    backup ids.

    On failure, ``success`` is ``False`` and ``failed_step_label``
    points at the step that didn't get a successful ack.
    """

    success: bool
    device_id: int | None = None
    restored_commands: int = 0
    restored_button_bindings: int = 0
    restored_macros: int = 0
    restored_inputs: int = 0
    skipped_favorites: int = 0
    skipped_macro_steps: int = 0
    #: Bundle-restore specific: macro 0xC5 ("set input on device") rows
    #: whose source-ordinal could not be re-resolved against the
    #: destination device's freshly-assigned command ids. Always 0
    #: outside the bundle-restore code path.
    skipped_input_ordinals: int = 0
    command_id_map: dict[int, int] = field(default_factory=dict)
    failed_step_label: str | None = None


class _DeviceCreateProxyLike(Protocol):
    """Subset of :class:`X1Proxy` the unified orchestrator needs.

    Each pipeline lives on a proxy mixin so the wire-layout code stays
    close to the rest of the mixin family (wifi-create stays with the
    wifi flow, IR restore stays with the rest of the restore
    plumbing). The orchestrator only dispatches.
    """

    def _run_network_callback_create(
        self, request: "DeviceCreateRequest"
    ) -> "DeviceCreateResult": ...

    def _run_ir_device_create(
        self, request: "DeviceCreateRequest"
    ) -> "DeviceCreateResult": ...

    def _run_activity_create(
        self, request: "DeviceCreateRequest"
    ) -> "DeviceCreateResult": ...


def run_device_create(
    proxy: _DeviceCreateProxyLike,
    request: DeviceCreateRequest,
) -> DeviceCreateResult:
    """Drive the unified device-create pipeline.

    Both ``create_wifi_device`` and ``restore_device`` route through
    this entry point; the public methods are thin adapters that build
    a :class:`DeviceCreateRequest` from their callers' inputs (live
    user kwargs vs a backup payload) and hand it off here.

    The orchestrator dispatches in two layers:

    - ``entity_kind="activity"`` -- the activity-create pipeline on
      the restore mixin. Activities always use the canonical
      schema-driven record path (family ``0x37``) and reference
      commands on other devices via :attr:`DeviceCreateRequest.device_id_map`;
      transport is therefore implicit.
    - ``entity_kind="device"`` -- dispatch by transport:

      - ``"network_callback"`` -- the wifi-create flow on the wifi
        mixin. Variant resolution between Roku-on-X1 and
        IP-generic-on-X1S/X2 is internal to that pipeline.
      - ``"ir"`` -- the IR / Bluetooth / RF restore flow on the
        restore mixin. Command persistence goes through the
        codec-aware :meth:`persist_command_record` /
        :meth:`persist_ir_blob` writers; the post-create step
        sequence is the canonical bindings/macros/inputs/update/sync
        sequence built from schema-driven step builders.
    """

    if request.entity_kind == "activity":
        return proxy._run_activity_create(request)
    if request.entity_kind != "device":
        raise ValueError(
            f"run_device_create received unsupported entity_kind={request.entity_kind!r}; "
            "expected 'device' or 'activity'"
        )

    if request.transport == "network_callback":
        return proxy._run_network_callback_create(request)
    if request.transport == "ir":
        return proxy._run_ir_device_create(request)
    raise ValueError(
        f"run_device_create received unsupported transport={request.transport!r}; "
        "expected one of 'ir', 'network_callback'"
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
    family: int = FAMILY_DEVICE_CREATE,
) -> CreateStep:
    """Build the device-create step (``OP_7B07`` on X1).

    ``config`` should carry ``device_id=0xFF`` (the create sentinel) and
    ``tail_marker=0`` (the pre-commit value -- the device-update step
    later in the flow sets it to ``1``). The hub assigns the real
    ``device_id`` and returns it via the :data:`ACK_OPCODE_DEVICE_CREATE`
    ack.

    Pass ``family=FAMILY_ACTIVITY_CREATE`` (``0x37``) to write an
    activity record instead of a device record. The body layout is the
    same 120/210-byte schema; only the opcode family changes. The hub
    assigns activity ids out of the same id space and returns them on
    the same ack opcode.
    """

    payload = build_device_create_payload(config, hub_version=hub_version)
    label = (
        "activity-create" if family == FAMILY_ACTIVITY_CREATE else "device-create"
    )
    ack_opcode = (
        ACK_OPCODE_ACTIVITY_CREATE
        if family == FAMILY_ACTIVITY_CREATE
        else ACK_OPCODE_DEVICE_CREATE
    )

    return CreateStep(
        label=label,
        family=family,
        payload=payload,
        ack_opcode=ack_opcode,
        ack_first_byte=None,  # any byte -- the assigned id is captured, not matched
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


# NOTE: ``build_x1_input_entry`` and ``build_inputs_step`` were removed
# in Phase 3 of the protocol refactor. The unified family-0x46 builder
# lives in :mod:`custom_components.sofabaton_x1s.lib.inputs`
# (:func:`~custom_components.sofabaton_x1s.lib.inputs.build_inputs_write`)
# and replaces the X1-only entry/page builders that used to live here.


#: Per-page payload capacity for command-record pages. 250 bytes maxes
#: out the opcode-hi byte (``0xFA``) which equals payload length on the
#: wire.
_COMMAND_PAGE_FULL_PAYLOAD = 250

#: Per-page header size: ``[command_seq, page_num_be]``. 3 bytes,
#: present on every page of every command.
_COMMAND_PAGE_HEADER_LEN = 3

#: Pre-label body-header size (size + total_pages + dev + btn + lib +
#: button_code). 12 bytes.
_COMMAND_BODY_PRELABEL_LEN = 12


#: Default rejection byte the hub sends on STATUS_ACK to indicate a
#: malformed or otherwise unacceptable save page. Used by command
#: writes so the sequencer can surface "hub said no" distinctly from
#: "no ack arrived".
_REJECT_BYTE_BAD_SAVE = 0x0C


def build_command_write_steps(
    *,
    hub_version: str,
    command_seq: int,
    command_burst_size: int,
    device_id: int,
    button_id: int,
    library_type: int,
    button_code: int,
    label: str,
    library_data: bytes,
    ack_timeout: float = 5.0,
    inter_page_retry_delay: float = 0.0,
) -> list[CreateStep]:
    """Build the paged command-record write for one command (family ``0x0E``).

    The same wire shape carries IR-DB blobs, RF blobs, BT blobs, and
    learned codes. The codec is selected by ``library_type``; the
    payload bytes are opaque ``library_data``.

    Wire layout. The "body" is a single logical record chunked across
    one or more pages, each page prefixed with ``[command_seq,
    page_num_be]``. The label slot width and encoding follow the hub
    variant: 30-byte ASCII on X1, 60-byte UTF-16BE on X1S/X2 (read
    from :func:`schema_for`)::

        body[0]         size               (== command_burst_size)
        body[1..2]      total_pages_be     (for *this* command)
        body[3]         device_id
        body[4]         button_id          (default key-slot, 0 = unbound)
        body[5]         library_type       (codec selector)
        body[6..11]     button_code (BE)   (6-byte / 48-bit identifier)
        body[12..label_end]
                         label slot        (30 ASCII / 60 UTF-16BE,
                                            null-padded)
        body[label_end..-2]
                         library_data       (opaque codec bytes)
        body[-1]        body checksum

    Arguments:
        command_seq: 1-based index of this command within the enclosing
            burst. Appears in ``payload[0]`` of every page of this
            command.
        command_burst_size: Total number of commands in the burst the
            caller intends to write. Written verbatim into ``body[0]``
            of every page of every command in the burst.
        device_id: 1-byte hub-assigned device id (returned by the
            preceding device-create ack).
        button_id: Default remote key slot the command should land on.
            Often ``0`` (unbound at write time; bound later via the
            button-binding step).
        library_type: Codec selector. Observed values: ``0x0D`` on
            IR-DB sourced devices, others for BT / RF / learned codes.
        button_code: 48-bit canonical command identifier used by
            binding and macro flows to reference this command.
        label: User-visible command label, ASCII, truncated to 30
            bytes.
        library_data: Opaque codec bytes appended after the label
            slot. Format depends on ``library_type``.
        ack_timeout: Per-page ack timeout. Defaults to 5 s, matching
            the hub's typical command-write turnaround.
        inter_page_retry_delay: Sleep between page retries on the
            sequencer. Defaults to ``0`` -- pages do not retry by
            default; the caller can pass a positive value to enable a
            single-retry pattern.
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

    schema = schema_for(hub_version)
    label_slot_len = schema.command_label_slot_len
    label_encoding = schema.command_label_encoding
    label_bytes = label.encode(label_encoding, errors="replace")[:label_slot_len]
    label_slot_bytes = label_bytes + b"\x00" * (label_slot_len - len(label_bytes))

    # Body content excluding final checksum byte. Pages chunk this
    # buffer; the checksum is computed over the whole sealed body and
    # written at the last position before paging.
    body_content_len = (
        _COMMAND_BODY_PRELABEL_LEN
        + len(label_slot_bytes)
        + len(library_data)
    )
    body = bytearray(body_content_len + 1)  # +1 for trailing body checksum

    # Total pages is computed from final body length divided by the
    # page-chunk capacity. The page chunk capacity is full-payload
    # minus the 3-byte page header.
    page_chunk_capacity = _COMMAND_PAGE_FULL_PAYLOAD - _COMMAND_PAGE_HEADER_LEN
    total_pages = (len(body) + page_chunk_capacity - 1) // page_chunk_capacity

    body[0] = command_burst_size & 0xFF
    body[1:3] = total_pages.to_bytes(2, "big")
    body[3] = device_id & 0xFF
    body[4] = button_id & 0xFF
    body[5] = library_type & 0xFF
    body[6:12] = button_code.to_bytes(6, "big")
    label_end = 12 + len(label_slot_bytes)
    body[12:label_end] = label_slot_bytes
    body[label_end : label_end + len(library_data)] = library_data
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
                    f"command-write code=0x{button_code:012X} "
                    f"page={page_no}/{total_pages}"
                ),
                family=FAMILY_COMMAND_WRITE,
                payload=header + chunk,
                ack_opcode=ACK_OPCODE_STATUS,
                ack_first_byte=ACK_STATUS_BYTE_OK,
                ack_reject_first_bytes=(_REJECT_BYTE_BAD_SAVE,),
                timeout=ack_timeout,
                retry_delay=inter_page_retry_delay,
            )
        )
    return steps


def encode_command_sort_body(
    ordered_pairs: list[tuple[int, int]],
) -> bytes:
    """Encode the inner key-sort body as a flat stream of ``(command_id,
    sort_id)`` pairs.

    The hub stores a per-device display ordering for the physical
    remote's device-browse screen as a sequence of 2-byte pairs --
    ``(command_id, sort_position)`` -- carried inside the family-0x61
    paged write body (the portion between the device id and the
    trailing checksum byte). Each entry is byte-clamped to fit the
    wire field width.
    """

    out = bytearray(len(ordered_pairs) * 2)
    for index, (command_id, sort_id) in enumerate(ordered_pairs):
        out[index * 2] = command_id & 0xFF
        out[index * 2 + 1] = sort_id & 0xFF
    return bytes(out)


def build_key_sort_steps(
    *,
    device_id: int,
    msg_hex: str,
    ack_timeout: float = 5.0,
) -> list[CreateStep]:
    """Build the app-style family-0x61 device key-sort write."""

    if device_id < 0 or device_id > 0xFF:
        raise ValueError(f"device_id {device_id} out of byte range")
    raw_hex = str(msg_hex or "").strip()
    try:
        msg_bytes = bytes.fromhex(raw_hex) if raw_hex else b""
    except ValueError as exc:
        raise ValueError(f"invalid key-sort msg_hex: {msg_hex!r}") from exc

    page_chunk_capacity = _COMMAND_PAGE_FULL_PAYLOAD - _COMMAND_PAGE_HEADER_LEN
    body = bytearray(len(msg_bytes) + 5)
    total_pages = max(1, (len(body) + page_chunk_capacity - 1) // page_chunk_capacity)
    body[0] = 0x01
    body[1:3] = total_pages.to_bytes(2, "big")
    body[3] = device_id & 0xFF
    if msg_bytes:
        body[4 : 4 + len(msg_bytes)] = msg_bytes
    body_bytes = _seal_body(body)

    steps: list[CreateStep] = []
    for page_index in range(total_pages):
        page_no = page_index + 1
        start = page_index * page_chunk_capacity
        chunk = body_bytes[start : start + page_chunk_capacity]
        payload = bytes([0x01]) + page_no.to_bytes(2, "big") + chunk
        steps.append(
            CreateStep(
                label=f"key-sort page={page_no}/{total_pages}",
                family=FAMILY_KEY_SORT,
                payload=payload,
                ack_opcode=ACK_OPCODE_STATUS,
                ack_first_byte=ACK_STATUS_BYTE_OK,
                timeout=ack_timeout,
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
    # body[0..2] is the inner-page header: [marker, total_pages_be=1].
    # Button-binding is always a single-page write across X1 / X1S /
    # X2 (the body never exceeds the per-page chunk), so [0x01, 0x00,
    # 0x01] is correct on every variant -- not just an X1 coincidence.
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
    hub_version: str,
    device_id: int,
    key_id: int,
    label: str,
    step_records: bytes = b"",
) -> CreateStep:
    """Build a macro write (``OP_3212``).

    Single-page write. The label slot width and encoding follow the
    hub variant (30-byte ASCII on X1, 60-byte UTF-16BE on X1S/X2,
    read from :func:`schema_for`)::

        body[0..2]      [01, 00, 01]                 page header (page 1 of 1)
        body[3]         device_id
        body[4]         key_id            (macro key id, e.g. 0xC6 POWER_ON)
        body[5]         step_count
        body[6 .. 6 + 10*step_count - 1]            step records (10 bytes each)
        body[next .. next + L - 1]                  label slot (L=30/60)
        body[next + L]                              body checksum

    ``step_records`` is the concatenated step-bytes blob (size must be
    a multiple of :data:`MACRO_STEP_RECORD_SIZE`). Pass ``b""`` to
    write a zero-step record (the hub then stores the macro as label
    only, no playback).

    The hub's auto-written ``POWER_ON`` / ``POWER_OFF`` macros also
    use this builder; they always carry one step. The backup flow
    skips ``REQ_MACROS`` for unconfigured-power devices because those
    auto-written macros are not user content, but the wire write does
    include a real step.
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

    schema = schema_for(hub_version)
    label_slot_len = schema.macro_label_slot_len
    label_encoding = schema.macro_label_encoding
    label_bytes = label.encode(label_encoding, errors="replace")[:label_slot_len]
    label_slot = label_bytes + b"\x00" * (label_slot_len - len(label_bytes))

    # body layout: 6-byte preamble + steps + L-byte label slot + 1-byte checksum
    body_len = 6 + len(step_records) + label_slot_len + 1
    body = bytearray(body_len)
    body[0:3] = bytes([0x01, 0x00, 0x01])
    body[3] = device_id & 0xFF
    body[4] = key_id & 0xFF
    body[5] = step_count & 0xFF
    body[6 : 6 + len(step_records)] = step_records
    label_start = 6 + len(step_records)
    body[label_start : label_start + label_slot_len] = label_slot
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
    "DeviceCreateRequest",
    "DeviceCreateResult",
    "FAMILY_ACTIVITY_CREATE",
    "FAMILY_BUTTON_BINDING",
    "FAMILY_DEVICE_CREATE",
    "FAMILY_DEVICE_UPDATE",
    "FAMILY_INPUTS",
    "FAMILY_KEY_SORT",
    "FAMILY_COMMAND_WRITE",
    "FAMILY_MACRO",
    "FAMILY_REMOTE_SYNC",
    "FAMILY_SET_IDLE_BEHAVIOR",
    "MACRO_STEP_RECORD_SIZE",
    "build_button_binding_step",
    "build_device_create_step",
    "build_device_update_step",
    "build_command_write_steps",
    "build_key_sort_steps",
    "encode_command_sort_body",
    "build_macro_step_record",
    "build_macro_step",
    "build_remote_sync_step",
    "build_set_idle_behavior_step",
    "run_create_sequence",
    "run_device_create",
    "synthesize_command_code",
]

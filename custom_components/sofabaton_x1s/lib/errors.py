# errors.py: the facade's typed failures.
#
# The library's contract is that it raises stdlib exceptions. These are
# stdlib *subclasses*: every existing ``except RuntimeError`` /
# ``except TimeoutError`` keeps working, while a consumer that needs to
# dispatch (a REST layer mapping failures to responses) can catch the
# specific class instead of matching message text.
#
# Only the asyncio facade (aio.py) raises these; the engine below it is
# unchanged.
from __future__ import annotations

from typing import Sequence

__all__ = [
    "HubNotConnectedError",
    "HubBusyError",
    "FetchTimeoutError",
    "SnapshotIncompleteError",
    "SnapshotOutdatedError",
    "StateDocumentError",
    "HubRejectedError",
    "WifiUpdateDeclined",
    "WifiUpdateFailed",
    "IrLearnError",
]


class HubNotConnectedError(RuntimeError):
    """A read needed a hub fetch, but the hub is not connected.

    Wait for :meth:`AsyncXProxy.wait_connected` (observe mode) or
    :meth:`AsyncXProxy.wait_until_controllable` (control mode) first.
    """


class HubBusyError(RuntimeError):
    """A read needed a hub fetch, but an app client holds the hub.

    The proxy is in observe mode: cached data is still served, fresh
    fetches are refused until the app disconnects
    (:meth:`AsyncXProxy.wait_until_controllable`).
    """


class FetchTimeoutError(TimeoutError):
    """A hub fetch was issued but its reply burst never landed."""


class SnapshotIncompleteError(ValueError):
    """A sync was asked to use a baseline entity that is not editable.

    The entity was never fetched, or its last fetch was incomplete, so the
    engine's stale preflight would have nothing to compare against.
    Refresh the entity (:meth:`AsyncXProxy.refresh`) and edit again.
    """


class SnapshotOutdatedError(ValueError):
    """A sync carried a ``snapshot_id`` that is not the current projection.

    The edit was made on an older snapshot. Take a new
    :meth:`AsyncXProxy.snapshot`, re-apply the edit and sync again. The
    check is cheap (no hub traffic); the engine's stale preflight still
    runs afterwards as the authoritative check against the hub.
    """


class StateDocumentError(ValueError):
    """:meth:`AsyncXProxy.import_state` was given a document it cannot read."""


class HubRejectedError(RuntimeError):
    """A write reached the hub but was refused, not acknowledged, or timed out.

    The hub held the session and the request was valid; the engine's log
    carries the step that failed. Retrying is safe for idempotent writes
    (rename, reorder, sync); check the snapshot first for the others.
    """


class WifiUpdateDeclined(RuntimeError):
    """:meth:`AsyncXProxy.update_wifi_device` refused before any write.

    ``reason`` is ``"drift"`` (live records match neither the deployed
    nor the desired labels; ``command_ids`` names them), ``"missing"``
    (records the deployment wrote are gone; ``command_ids``),
    ``"device"`` (the device is not on the hub or is not the deployed
    one), ``"activity"`` (a slot names an activity the hub does not have;
    ``detail`` lists them) or ``"planner"`` (the in-place planner declined the diff;
    ``detail`` carries its words). Nothing was written; the consumer
    resolves it explicitly, typically by removing and deploying again.
    """

    def __init__(self, reason: str, *, command_ids: Sequence[int] = (), detail: str | None = None) -> None:
        self.reason = str(reason)
        self.command_ids = tuple(int(c) for c in command_ids)
        self.detail = detail
        text = detail or f"the in-place update was declined ({self.reason})"
        if self.command_ids:
            text += f": command ids {list(self.command_ids)}"
        super().__init__(text)


class WifiUpdateFailed(HubRejectedError):
    """:meth:`AsyncXProxy.update_wifi_device` started writing and a step was
    refused. ``failed_at`` is the step kind, ``completed_steps`` how many
    landed before it. The device is partly updated; the next update with
    the same spec resumes (the drift gate accepts a record that already
    carries the desired label).
    """

    def __init__(self, failed_at: str, *, completed_steps: int = 0, message: str | None = None) -> None:
        self.failed_at = str(failed_at)
        self.completed_steps = int(completed_steps)
        super().__init__(message or f"the hub rejected the in-place update at {self.failed_at}")


class IrLearnError(RuntimeError):
    """:meth:`AsyncXProxy.learn_ir` ended without a capture.

    ``state`` is ``"timed_out"`` (nothing was received within the
    window), ``"interrupted"`` (other hub traffic knocked the hub out of
    learn mode), ``"cancelled"`` (:meth:`AsyncXProxy.cancel_learn`), or
    ``"undecodable"`` (a capture arrived but no payload could be
    extracted).
    """

    def __init__(self, state: str, message: str | None = None) -> None:
        super().__init__(message or f"IR learn ended: {state}")
        self.state = state

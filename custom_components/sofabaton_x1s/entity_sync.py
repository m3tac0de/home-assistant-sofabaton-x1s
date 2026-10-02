"""Live activity and device sync for the editors and services (R6, CR-H2-13).

Input validation, the managed-Wifi rename and Wifi Events reconcile, the
operation runner and its preparation. Transport-neutral: the WS editor
handlers and the sync_from_snapshot service both use it.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    signal_command_sync,
)
from .hub import SofabatonHub, _parse_managed_wifi_brand
from .command_config import (
    COMMAND_BRAND_PREFIX,
    WIFI_EVENTS_DEVICE_KEY,
    compute_commands_hash,
    is_wifi_events_device_key,
    record_hash_listen_port,
)
from .lib.activity_sync import build_device_sync_plan
from .lib.bundle_validation import validate_hub_bundle_for_model
from .lib.hub_versions import HUB_BUNDLE_SCHEMA_VERSION
from .lib.wifi_inplace_plan import REFERENCED_RECORD_STEP_KINDS
from . import operations
from . import runtime

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


# ── Live activity sync (Phase L4) ───────────────────────────────────────
# Reuses the backup operation registry (kind="activity_sync") and the shared
# progress_subscribe / state / clear_result surface. The engine diffs the
# captured baseline against the edited working bundle and issues targeted
# in-place writes against the existing activity id.

# failed_at values that mean no wire writes happened — these are dismissed
# like restore's pre-flight failures so a card refresh cannot snap a stale
# failure back onto the UI.
_ACTIVITY_SYNC_PREWRITE_FAILURES = {"plan", "unavailable", "stale_check"}


class _EntitySyncRejected(HomeAssistantError):
    """Raised by :func:`_async_prepare_entity_sync` when a sync request is
    rejected before any write reaches the hub — busy, locked, or failing
    payload validation.

    ``code`` mirrors the WS ``connection.send_error`` vocabulary (``busy``
    / ``unavailable`` / ``invalid_payload``) so ``_handle_entity_sync_ws``
    can reproduce its original error codes after the shared prep step; the
    ``sync_from_snapshot`` service collapses it to a plain
    ``HomeAssistantError`` (services don't have a separate error-code
    channel). ``stale_baseline`` belongs to the service-only
    ``expected_generation`` guard and never reaches the WS path, which
    does not send an expected generation.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _validate_entity_sync_inputs(
    msg: dict[str, Any],
    *,
    entity_kind: str,
    hub_version: str | None = None,
) -> tuple[dict, dict, int]:
    baseline = msg.get("baseline")
    edited = msg.get("edited")
    id_key = f"{entity_kind}_id"
    entity_id = int(msg.get(id_key) or 0)
    for name, payload in (("baseline", baseline), ("edited", edited)):
        if not isinstance(payload, dict):
            raise ValueError(f"{name} must be a hub_bundle object")
        if payload.get("kind") != "hub_bundle":
            raise ValueError(f"{name} must declare kind == 'hub_bundle'")
        if int(payload.get("schema_version", 0)) != HUB_BUNDLE_SCHEMA_VERSION:
            raise ValueError(
                f"{name} schema_version must be {HUB_BUNDLE_SCHEMA_VERSION}"
            )
    if not (0 < entity_id <= 0xFF):
        raise ValueError(f"{id_key} out of range")

    bundle_key = "activities" if entity_kind == "activity" else "devices"

    def _has_entity(bundle: dict) -> bool:
        return any(
            int((entry.get("device") or {}).get("device_id") or 0) == entity_id
            for entry in bundle.get(bundle_key) or []
        )

    if not _has_entity(baseline) or not _has_entity(edited):
        raise ValueError(f"{id_key} is missing from one of the bundles")

    # Editor invariants apply to the sync target plus every entity that
    # differs from the baseline — the entities a plan can actually write.
    # Entities passing through unchanged are hub truth; a stale cache entry
    # or hub quirk elsewhere in the bundle must not block this sync.
    def _entities_by_id(bundle: dict, key: str) -> dict[int, Any]:
        return {
            int((entry.get("device") or {}).get("device_id") or 0): entry
            for entry in bundle.get(key) or []
            if isinstance(entry, dict)
        }

    strict_entity_ids = {entity_id}
    for key in ("devices", "activities"):
        baseline_entries = _entities_by_id(baseline, key)
        for ent_id, entry in _entities_by_id(edited, key).items():
            if baseline_entries.get(ent_id) != entry:
                strict_entity_ids.add(ent_id)

    # Quirks already present in the captured baseline are hub truth (vendor
    # apps and cloud deploys write rows our editor never would) — grandfather
    # them in both bundles so they cannot block a sync, while an edit that
    # newly introduces the same quirk still fails validation.
    baseline_model = validate_hub_bundle_for_model(
        baseline,
        hub_version=hub_version,
        payload_name="baseline",
        enforce_editor_invariants=False,
        grandfather_baseline=baseline,
    )
    edited_model = validate_hub_bundle_for_model(
        edited,
        hub_version=hub_version,
        payload_name="edited",
        enforce_editor_invariants=True,
        strict_entity_ids=strict_entity_ids,
        grandfather_baseline=baseline,
    )
    if baseline_model != edited_model:
        raise ValueError("baseline and edited bundles declare different hub models")
    return baseline, edited, entity_id


def _find_bundle_device_block(bundle: dict[str, Any], entity_id: int) -> dict[str, Any] | None:
    for entry in bundle.get("devices") or []:
        if not isinstance(entry, dict):
            continue
        block = entry.get("device")
        if isinstance(block, dict) and int(block.get("device_id") or 0) == entity_id:
            return block
    return None


async def _async_prepare_managed_wifi_rename(
    hass: HomeAssistant,
    hub: SofabatonHub,
    *,
    baseline: dict[str, Any],
    edited: dict[str, Any],
    entity_id: int,
) -> dict[str, Any] | None:
    """Detect a live-editor rename of a deployed managed Wifi Device.

    When the renamed hub device carries a managed ``m3-<key>-<hash>`` brand,
    the command-config store must follow the new name — otherwise the Wifi
    Commands tab keeps showing the old name and the next deploy silently
    reverts the rename. The commands hash covers the device name, so for a
    record that is currently in sync the refreshed hash is stamped into the
    edited bundle's brand slot here (the rename record-rewrite carries it to
    the hub) and returned for the post-sync store update; the record then
    stays in sync instead of demanding a redeploy for a mere rename.

    Returns the pending store update (applied only after the sync succeeds),
    or None when the edit is not a managed Wifi Device rename.
    """

    base_block = _find_bundle_device_block(baseline, entity_id)
    edit_block = _find_bundle_device_block(edited, entity_id)
    if base_block is None or edit_block is None:
        return None
    old_name = str(base_block.get("name") or "").strip()
    new_name = str(edit_block.get("name") or "").strip()
    if not new_name or new_name == old_name:
        return None

    device_key, _brand_hash = _parse_managed_wifi_brand(str(base_block.get("brand") or ""))

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    stored_devices = await store.async_list_hub_devices(
        hub.entry_id, roku_listen_port=roku_listen_port
    )
    record = None
    if device_key:
        record = next(
            (item for item in stored_devices if str(item.get("device_key") or "") == device_key),
            None,
        )
    if record is None:
        matches = [
            item for item in stored_devices if item.get("deployed_device_id") == entity_id
        ]
        record = matches[0] if len(matches) == 1 else None
    if record is None:
        return None

    record_key = str(record.get("device_key") or "")
    commands_hash = str(record.get("commands_hash") or "").strip()
    deployed_hash = str(record.get("deployed_commands_hash") or "").strip()
    in_sync = bool(deployed_hash) and commands_hash == deployed_hash
    new_hash: str | None = None
    if in_sync:
        try:
            record_slot_count = int(record.get("slot_count"))
        except (TypeError, ValueError):
            record_slot_count = 10
        new_hash = compute_commands_hash(
            list(record.get("commands") or []),
            device_name=new_name,
            roku_listen_port=record_hash_listen_port(record, roku_listen_port),
            power_on_command_id=record.get("power_on_command_id"),
            power_off_command_id=record.get("power_off_command_id"),
            slot_count=record_slot_count,
            # In sync means the deployed layout is the current one.
            single_record=is_wifi_events_device_key(record_key),
        )
        # The reconcile pass mirrors the hub-side brand hash back into the
        # store on every device burst, so the brand must be rewritten along
        # with the name or the refreshed store hash would be clobbered and
        # the device flagged out of sync again.
        edit_block["brand"] = f"{COMMAND_BRAND_PREFIX}-{record_key}-{new_hash}"

    return {
        "device_key": record_key,
        "device_name": new_name,
        "deployed_commands_hash": new_hash,
    }


async def _async_stamp_wifi_events_brand(
    hass: HomeAssistant,
    hub: SofabatonHub,
    *,
    edited: dict[str, Any],
    entity_id: int,
    renames: dict[int, str],
    removals: list[int],
    pending_wifi_rename: dict[str, Any] | None,
) -> None:
    """Keep the Wifi Events record in step across a device-editor sync.

    The store follows the hub after the sync (renamed and removed records),
    but the reconcile pass mirrors the hub-side brand hash back into the
    store on every device read. So the hash the store will hold afterwards
    is stamped into the edited brand here, and the device_rename step writes
    it to the hub with the other edits, as a managed device rename does.
    Left alone when the record is out of step: that sync must not make it
    read deployed.
    """

    edit_block = _find_bundle_device_block(edited, entity_id)
    if edit_block is None:
        return
    store = await runtime._async_get_command_config_store(hass)
    new_hash = store.wifi_events_hash_after_device_sync(
        hub.entry_id,
        renames=renames,
        removals=removals,
        # The store takes the hub-side name only on a rename.
        device_name=(pending_wifi_rename or {}).get("device_name"),
        roku_listen_port=runtime._resolve_roku_listen_port(hass, hub.entry_id),
    )
    if new_hash is None:
        return
    edit_block["brand"] = f"{COMMAND_BRAND_PREFIX}-{WIFI_EVENTS_DEVICE_KEY}-{new_hash}"
    if pending_wifi_rename is not None:
        pending_wifi_rename["deployed_commands_hash"] = new_hash


def _bundle_device_is_wifi_events(bundle: dict[str, Any], entity_id: int) -> bool:
    """True when the bundle's device block carries the Wifi Events brand."""

    block = _find_bundle_device_block(bundle, entity_id)
    if block is None:
        return False
    device_key, _brand_hash = _parse_managed_wifi_brand(str(block.get("brand") or ""))
    return device_key == WIFI_EVENTS_DEVICE_KEY


def _collect_command_removals(
    baseline: dict[str, Any],
    edited: dict[str, Any],
    entity_id: int,
) -> list[int]:
    """Command ids present on the device in the baseline but absent from
    the edited bundle — the W7 event-delete staging shape."""

    def _ids(bundle: dict[str, Any]) -> set[int]:
        for device in bundle.get("devices") or []:
            if int((device.get("device") or {}).get("device_id") or 0) == int(entity_id):
                return {
                    int(cmd.get("command_id"))
                    for cmd in device.get("commands") or []
                    if cmd.get("command_id") is not None
                }
        return set()

    return sorted(_ids(baseline) - _ids(edited))


def _collect_short_command_renames(
    baseline: dict[str, Any],
    edited: dict[str, Any],
    entity_id: int,
) -> dict[int, str]:
    """Map command id -> new label for every renamed command on the device.

    Long-record ids are included as-is; the store reconcile ignores ids
    beyond the record's slot_count (short names are authoritative).
    """

    def _names(bundle: dict[str, Any]) -> dict[int, str]:
        for device in bundle.get("devices") or []:
            if int((device.get("device") or {}).get("device_id") or 0) == int(entity_id):
                return {
                    int(cmd.get("command_id")): str(cmd.get("name") or "")
                    for cmd in device.get("commands") or []
                    if cmd.get("command_id") is not None
                }
        return {}

    base_names = _names(baseline)
    renames: dict[int, str] = {}
    for command_id, name in _names(edited).items():
        if command_id in base_names and base_names[command_id] != name:
            renames[command_id] = name
    return renames


@runtime._hub_operation
async def _run_entity_sync_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
    baseline: dict[str, Any],
    edited: dict[str, Any],
    entity_kind: str,
    entity_id: int,
) -> dict[str, Any]:
    """Run one activity/device sync to completion against the registry.

    Shared engine entry point for both transports: the WS handler fires
    this as a background task (progress flows through the operation
    registry a subscriber polls); the ``sync_from_snapshot`` service
    awaits it directly and uses the returned outcome dict as its response
    or failure message, since a service call has no separate progress
    channel to subscribe to.
    """

    registry = operations._backup_operation_registry(hass)

    pending_wifi_rename: dict[str, Any] | None = None
    events_command_renames: dict[int, str] | None = None
    events_command_removals: list[int] | None = None
    if entity_kind == "device":
        try:
            pending_wifi_rename = await _async_prepare_managed_wifi_rename(
                hass,
                hub,
                baseline=baseline,
                edited=edited,
                entity_id=entity_id,
            )
        except Exception:  # pragma: no cover - propagation must never block a sync
            _LOGGER.exception("[device_sync] managed wifi rename detection failed")

        if _bundle_device_is_wifi_events(baseline, entity_id):
            # §6a: the Hub tab's device editor is the events device's only
            # hub-side editing UI, but command ADD is blocked — a hub-only
            # record would have no slot, no callback payload discipline,
            # and no deployable snapshot entry. Events are added through
            # the activity editor's Add dialogs. Command REMOVAL follows
            # the same plan step every device gets (below); what is
            # events-specific is the reconcile after the sync, which
            # resets the freed store slots so the record follows the hub.
            try:
                planned = build_device_sync_plan(
                    baseline, edited, entity_id, allow_command_removal=True
                )
            except ValueError:
                planned = []
            if any(step.kind == "command_add" for step in planned):
                message = (
                    "Commands cannot be added to the Wifi Events device here — "
                    "create Wifi Events from the activity editor instead."
                )
                registry.update(
                    operation_id,
                    status="failed",
                    phase="plan",
                    message=message,
                    error=message,
                    transient=True,
                )
                registry.retire_transient(operation_id)
                return {"status": "failed", "failed_at": "plan", "message": message}
            events_command_renames = _collect_short_command_renames(
                baseline, edited, entity_id
            )
            events_command_removals = _collect_command_removals(
                baseline, edited, entity_id
            )
            if events_command_renames or events_command_removals:
                await _async_stamp_wifi_events_brand(
                    hass,
                    hub,
                    edited=edited,
                    entity_id=entity_id,
                    renames=events_command_renames or {},
                    removals=events_command_removals or [],
                    pending_wifi_rename=pending_wifi_rename,
                )

    # Scanned before the write, as the facade does: a failed record delete
    # may already have cascaded the references a later scan would miss.
    referencing_before: list[int] = []
    if entity_kind == "device":
        try:
            referencing_before = list(
                await hass.async_add_executor_job(
                    hub._proxy.activities_referencing_device, entity_id
                )
            )
        except Exception:  # noqa: BLE001 - the re-read list is best-effort
            _LOGGER.debug("[device_sync] referencing scan failed", exc_info=True)

    def _progress(**payload: Any) -> None:
        registry.update_from_thread(operation_id, **payload)

    try:
        if entity_kind == "device":
            # Command removal is in scope for EVERY device: a command the
            # editor dropped becomes a command_delete step, ordered last in
            # the plan, and the hub cascades the favorites/bindings/macro
            # steps that referenced it. The plan runs behind the stale
            # preflight, so a removal is only ever applied against the
            # device as it currently reads on the hub. The scope guard
            # still rejects an unflagged command ADD.
            result = await hub.async_sync_device(
                baseline=baseline,
                edited=edited,
                device_id=entity_id,
                progress_callback=_progress,
                allow_command_removal=True,
            )
        else:
            result = await hub.async_sync_activity(
                baseline=baseline,
                edited=edited,
                activity_id=entity_id,
                progress_callback=_progress,
            )
    except Exception as err:  # pragma: no cover - defensive; executor traps its own
        outcome = {"status": "failed", "message": str(err) or "Sync failed", "transient": True}
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=outcome["message"],
            error=outcome["message"],
            transient=True,
        )
        registry.retire_transient(operation_id)
        return outcome

    if isinstance(result, dict) and str(result.get("status") or "") == "failed":
        failed_at = str(result.get("failed_at") or "")
        message = str(result.get("message") or f"Sync failed at {failed_at!r}.")
        if failed_at in _ACTIVITY_SYNC_PREWRITE_FAILURES:
            registry.update(
                operation_id,
                status="failed",
                phase=failed_at or "failed",
                message=message,
                error=message,
                failed_at=failed_at,
                result=result,
                transient=True,
            )
            registry.retire_transient(operation_id)
            return result
        # Writes happened before the failure: read the entity (and, for a
        # device, the activities naming it) back so the cache shows what
        # the hub holds, not what the aborted plan left cleared (CR-X1-1).
        # The operation stays running until then, like the success tail.
        try:
            await hub.async_refresh_entity_structure(kind=entity_kind, ent_id=entity_id)
            if entity_kind == "device":
                await hub.async_refresh_activities_referencing_device(
                    entity_id, also=referencing_before
                )
            await runtime._async_persist_hub_cache(hass, hub)
        except Exception:  # pragma: no cover - the read-back is best-effort
            _LOGGER.exception("[%s_sync] read-back after a failed sync failed", entity_kind)
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=message,
            error=message,
            failed_at=failed_at,
            completed_steps=int(result.get("completed_steps") or 0),
            result=result,
        )
        return result

    # Success tail: refresh the persistent cache so cache_generation bumps and
    # the remote card / Hub tab pick up the new names, macros, and bindings
    # without a manual refresh (same path as catalog/refresh). The synced
    # entity itself needs no re-read: the engine's settle loop already read
    # it back after the writes, as the facade relies on (CR-X1-8).
    #
    # This runs BEFORE the success publish: the editor rebases its baseline
    # from the structural bundle the moment it sees status == "success", and
    # a referencing-activity re-warm clears that activity's cached detail
    # before refetching it. Keeping the operation "running" also keeps the
    # busy-guard closed until on-demand bundles are trustworthy again.
    if pending_wifi_rename is not None:
        # The hub-side rename is committed; make the wifi-commands store
        # follow so the Wifi Commands tab shows the new name and the next
        # deploy doesn't revert it. Best-effort: the sync itself succeeded.
        try:
            store = await runtime._async_get_command_config_store(hass)
            await store.async_rename_hub_device(
                hub.entry_id,
                pending_wifi_rename["device_key"],
                pending_wifi_rename["device_name"],
                deployed_commands_hash=pending_wifi_rename["deployed_commands_hash"],
            )
            async_dispatcher_send(hass, signal_command_sync(hub.entry_id))
        except Exception:  # pragma: no cover - propagation must never fail the sync
            _LOGGER.exception("[device_sync] managed wifi rename propagation failed")

    if events_command_renames:
        # §6a store-follows-hub: command renames on the Wifi Events device
        # mirror into the matching slot + deployed snapshot + hash so the
        # record never reads out-of-step from its own editor. Attached
        # actions stay with the slot. Best-effort like the rename above.
        try:
            store = await runtime._async_get_command_config_store(hass)
            await store.async_reconcile_wifi_events_command_renames(
                hub.entry_id,
                events_command_renames,
                roku_listen_port=runtime._resolve_roku_listen_port(hass, hub.entry_id),
            )
            async_dispatcher_send(hass, signal_command_sync(hub.entry_id))
        except Exception:  # pragma: no cover - propagation must never fail the sync
            _LOGGER.exception("[device_sync] wifi events command-rename reconcile failed")

    if events_command_removals:
        # W7 stage 2: the plan's command_delete steps removed the records
        # (hub cascaded the refs); reset the freed store slots in place so
        # the record follows — short id -> default slot, long id -> flag
        # off — and the deployed snapshot/hash stay coherent.
        try:
            store = await runtime._async_get_command_config_store(hass)
            await store.async_reconcile_wifi_events_command_removals(
                hub.entry_id,
                events_command_removals,
                roku_listen_port=runtime._resolve_roku_listen_port(hass, hub.entry_id),
            )
            async_dispatcher_send(hass, signal_command_sync(hub.entry_id))
        except Exception:  # pragma: no cover - propagation must never fail the sync
            _LOGGER.exception("[device_sync] wifi events command-removal reconcile failed")

    completed_steps = int((result or {}).get("total_steps") or 0)
    registry.update(
        operation_id,
        status="running",
        phase="cache_refresh",
        message="Refreshing the cached hub state…",
        completed_steps=completed_steps,
        total_steps=completed_steps,
    )
    try:
        await hub.async_request_catalog("activities" if entity_kind == "activity" else "devices")
        if entity_kind == "device":
            # Command-record rewrites also change labels held by every
            # referencing activity's cached favorite maps;
            # refreshing only the device would leave those stale until an
            # unrelated activity re-read.
            counters = (result or {}).get("counters") or {}
            if any(counters.get(kind) for kind in REFERENCED_RECORD_STEP_KINDS):
                await hub.async_refresh_activities_referencing_device(entity_id)
        store = await runtime._async_get_persistent_cache_store(hass)
        if store.enabled:
            payload = await hub.async_export_cache_state()
            await store.async_set_hub_cache(hub.entry_id, payload)
    except Exception:  # pragma: no cover - cache refresh is best-effort
        _LOGGER.exception("[%s_sync] post-sync cache refresh failed", entity_kind)

    registry.update(
        operation_id,
        status="success",
        phase="completed",
        message="Synced to hub.",
        completed_steps=completed_steps,
        total_steps=completed_steps,
        result=result or {"status": "success"},
    )
    return result or {"status": "success"}


async def _async_prepare_entity_sync(
    hass: HomeAssistant,
    *,
    hub: SofabatonHub,
    entity_kind: str,
    sync_input: Mapping[str, Any],
    operation_label: str,
    expected_generation: int | None = None,
) -> tuple[str, dict[str, Any], dict[str, Any], int]:
    """Busy-guard, lock-guard, validate, and register one entity sync.

    The half of ``_handle_entity_sync_ws`` that has nothing to do with the
    websocket transport, split out so the ``sync_from_snapshot`` service
    can run the identical pre-write gauntlet — same busy/lock checks,
    same :func:`_validate_entity_sync_inputs` payload validation, same
    operation-registry bookkeeping — before handing off to
    :func:`_run_entity_sync_operation` (the engine entry point both
    transports share).

    ``expected_generation`` is the service path's baseline-freshness gate:
    when supplied, the hub's ``cache_generation`` must still equal it or
    the sync is refused. The WS editor never passes it — it re-exports its
    baseline from the structural bundle after every sync and relies on the
    engine's own stale-check preflight, which stays the wire-level
    authority for both transports.

    Returns ``(operation_id, baseline, edited, entity_id)``. Raises
    :class:`_EntitySyncRejected` for every rejection reason (busy, stale
    baseline, locked, invalid payload); callers translate ``.code`` /
    ``str(err)`` into their own transport's error shape.
    """

    registry = operations._backup_operation_registry(hass)
    if runtime._hub_is_busy(hass, hub):
        raise _EntitySyncRejected(
            "busy",
            "Another backup, restore, or sync operation is already running for this hub",
        )

    # The generation compare sits after the busy guard (no registry-tracked
    # operation is mid-flight for this entry, so no sync tail is about to
    # bump the generation) and before ``registry.create`` (a stale request
    # must not consume an operation slot other callers would see as busy).
    # Everything from here through ``create`` is await-free, so the value
    # read cannot move before the operation is registered; the successful
    # sync's own bump happens later, inside ``_run_entity_sync_operation``'s
    # tail, and is never re-checked against this snapshot.
    if expected_generation is not None:
        current_generation = int(hub.cache_generation)
        if current_generation != expected_generation:
            raise _EntitySyncRejected(
                "stale_baseline",
                f"stale baseline: expected generation {expected_generation}, "
                f"hub cache is at {current_generation} - re-export the snapshot",
            )

    try:
        runtime._raise_if_hub_operation_locked(hass, hub, operation_label)
        baseline, edited, entity_id = _validate_entity_sync_inputs(
            sync_input,
            entity_kind=entity_kind,
            hub_version=getattr(hub, "version", None),
        )
    except HomeAssistantError as err:
        raise _EntitySyncRejected("unavailable", str(err)) from err
    except (ValueError, TypeError, AttributeError) as err:
        # A malformed bundle (schema_version null, a non-dict entry) is a
        # payload error too, not an unknown one (CR-H2-10).
        raise _EntitySyncRejected("invalid_payload", str(err)) from err

    operation_id = registry.create(
        kind=f"{entity_kind}_sync",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting sync…",
            "completed_steps": 0,
            "total_steps": 0,
            f"current_{entity_kind}_id": entity_id,
        },
    )
    return operation_id, baseline, edited, entity_id

from custom_components.sofabaton_x1s.lib.helpers import ActivityCache, BurstScheduler


def test_burst_scheduler_drains_queue_after_idle():
    scheduler = BurstScheduler(idle_seconds=0.0, grace_period=0.0)
    sent: list[tuple[int, bytes]] = []

    def can_issue() -> bool:
        return True

    def queue_frame(opcode: int, payload: bytes) -> None:
        sent.append((opcode, payload))

    scheduler.enqueue(0x1234, b"first", expects_burst=True, burst_kind="test", can_issue=can_issue, queue_frame=queue_frame)
    scheduler.enqueue(0x5678, b"second", expects_burst=False, burst_kind=None, can_issue=can_issue, queue_frame=queue_frame)

    scheduler.drain_if_idle(can_issue=can_issue, queue_frame=queue_frame)

    assert sent == [(0x1234, b"first"), (0x5678, b"second")]


def test_activity_cache_notifies_on_change():
    cache = ActivityCache()
    events: list[tuple[int | None, int | None, str | None]] = []

    cache.on_activity_change(lambda new_id, old_id, name: events.append((new_id, old_id, name)))
    cache.update_activity(1, {"name": "Watch TV"})
    cache.set_hint(1)
    cache.handle_active_state()

    assert events == [(1, None, "Watch TV")]

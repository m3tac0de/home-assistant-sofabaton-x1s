from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def test_get_activities_forces_refresh_by_default(monkeypatch):
    proxy = X1Proxy("127.0.0.1")
    proxy.state.activities[0x10] = {"name": "Watch TV", "active": True}

    calls = []

    def fake_enqueue(*args, **kwargs):
        calls.append((args, kwargs))
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    activities, ready = proxy.get_activities()

    assert ready is False
    assert activities == {}
    assert len(calls) == 1


def test_get_activities_can_use_cached_values_without_refresh():
    proxy = X1Proxy("127.0.0.1")
    proxy.state.activities[0x11] = {"name": "Movie", "active": False}

    activities, ready = proxy.get_activities(force_refresh=False)

    assert ready is True
    assert activities == {0x11: {"name": "Movie", "active": False}}

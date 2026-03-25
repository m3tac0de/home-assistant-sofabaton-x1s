from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def test_export_import_roundtrip_preserves_activity_favorites():
    source = X1Proxy("127.0.0.1")

    source.state.activity_favorite_slots[0x41] = [
        {"button_id": 0x11, "device_id": 0x21, "command_id": 0x31, "source": "activity_map"},
        {"button_id": 0x12, "device_id": 0x22, "command_id": 0x32, "source": "keymap"},
    ]
    source.state.activity_favorite_labels[0x41][(0x21, 0x31)] = "Netflix"
    source.state.activity_keybinding_slots[0x41] = [
        {"button_id": 0xB9, "device_id": 0x22, "command_id": 0x32, "source": "keymap"}
    ]
    source.state.activity_keybinding_labels[0x41][(0x22, 0x32)] = "Prime Video"
    source.state.activity_command_refs[0x41].add((0x21, 0x31))
    source.state.activity_command_refs[0x41].add((0x22, 0x32))
    source.state.activity_members[0x41].add(0x21)
    source.state.activity_members[0x41].add(0x22)

    payload = source.export_cache_state()

    restored = X1Proxy("127.0.0.1")
    restored.import_cache_state(payload)

    assert restored.state.get_activity_favorite_slots(0x41) == source.state.get_activity_favorite_slots(0x41)
    assert restored.state.get_activity_favorite_labels(0x41) == source.state.get_activity_favorite_labels(0x41)
    assert restored.state.get_activity_keybinding_slots(0x41) == source.state.get_activity_keybinding_slots(0x41)
    assert restored.state.get_activity_keybinding_labels(0x41) == source.state.get_activity_keybinding_labels(0x41)
    assert restored.state.get_activity_members(0x41) == source.state.get_activity_members(0x41)
    assert restored.state.get_activity_command_refs(0x41) == source.state.get_activity_command_refs(0x41)


def test_clear_persistent_cache_for_activity_removes_favorites_only_for_activity():
    proxy = X1Proxy("127.0.0.1")

    proxy.state.activity_favorite_slots[0x41] = [{"button_id": 1, "device_id": 2, "command_id": 3, "source": "activity_map"}]
    proxy.state.activity_favorite_labels[0x41][(2, 3)] = "Netflix"
    proxy.state.activity_keybinding_slots[0x41] = [{"button_id": 0xB9, "device_id": 2, "command_id": 4, "source": "keymap"}]
    proxy.state.activity_keybinding_labels[0x41][(2, 4)] = "Volume Down"
    proxy.state.activity_command_refs[0x41].add((2, 3))
    proxy.state.activity_members[0x41].add(2)
    proxy.state.activity_favorite_slots[0x42] = [{"button_id": 1, "device_id": 4, "command_id": 5, "source": "activity_map"}]

    proxy.clear_persistent_cache_for(0x41, kind="activity")

    assert 0x41 not in proxy.state.activity_favorite_slots
    assert 0x41 not in proxy.state.activity_favorite_labels
    assert 0x41 not in proxy.state.activity_keybinding_slots
    assert 0x41 not in proxy.state.activity_keybinding_labels
    assert 0x41 not in proxy.state.activity_command_refs
    assert 0x41 not in proxy.state.activity_members
    assert 0x42 in proxy.state.activity_favorite_slots

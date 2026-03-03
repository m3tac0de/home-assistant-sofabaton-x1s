import asyncio
from types import SimpleNamespace

from custom_components.sofabaton_x1s.select import SofabatonHubVersionSelect


class DummyHub:
    def __init__(self):
        self.entry_id = "entry-1"
        self.host = "127.0.0.1"
        self.calls: list[str] = []

    async def async_set_hub_version(self, version: str) -> None:
        self.calls.append(version)


def test_hub_version_select_reads_from_mdns_hver_and_writes_to_hub() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hub = DummyHub()
    entry = SimpleNamespace(
        data={"mac": "aa:bb:cc", "name": "Hub", "mdns_txt": {"HVER": "2"}, "mdns_version": "X1"},
        options={"mdns_version": "X1"},
    )
    entity = SofabatonHubVersionSelect(hub, entry)

    assert entity.current_option == "X1S"

    loop.run_until_complete(entity.async_select_option("X2"))

    assert hub.calls == ["X2"]

    loop.close()

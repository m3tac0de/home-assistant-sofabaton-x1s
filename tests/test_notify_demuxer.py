from custom_components.sofabaton_x1s.lib.notify_demuxer import (
    NotifyDemuxer,
    NotifyRegistration,
    _broadcast_ip,
)


def test_build_notify_reply_matches_capture():
    mdns_txt = {
        "MAC": "e2:6a:44:86:1b:45",
        "MODEL": "0x6402",
        "BUILD": "0x20221120",
        "FW": "5.1.0",
        "NAME": "Souterrain hub",
    }
    reg = NotifyRegistration("proxy", "192.168.2.151", mdns_txt, 8100)

    demuxer = NotifyDemuxer()
    frame = demuxer._build_notify_reply(reg)

    assert frame is not None
    assert frame.hex() == (
        "a55a1dc2e26a44861b45640220221120050100536f757465727261696e20687562be"
    )


def test_broadcast_ip():
    assert _broadcast_ip("192.168.2.151") == "192.168.2.255"
    assert _broadcast_ip("invalid") == "255.255.255.255"

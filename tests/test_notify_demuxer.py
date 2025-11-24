import threading

from custom_components.sofabaton_x1s.lib.notify_demuxer import (
    NOTIFY_ME_PAYLOAD,
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
        "a55a1de26a44861b4545640220221120050100536f757465727261696e20687562be"
    )


def test_broadcast_ip():
    assert _broadcast_ip("192.168.2.151") == "192.168.2.255"
    assert _broadcast_ip("invalid") == "255.255.255.255"


def test_notify_me_reply_targets_source_port():
    mdns_txt = {
        "MAC": "e2:6a:44:86:1b:45",
        "NAME": "Souterrain hub",
    }
    reg = NotifyRegistration("proxy", "192.168.2.151", mdns_txt, 8100)

    demuxer = NotifyDemuxer()
    demuxer._registrations = {"proxy": reg}
    demuxer._stop_event = threading.Event()

    class FakeSocket:
        def __init__(self) -> None:
            self.sent = []
            self.recv_called = False

        def recvfrom(self, _max: int):
            if self.recv_called:
                raise OSError()
            self.recv_called = True
            return NOTIFY_ME_PAYLOAD, ("192.168.2.10", 12345)

        def sendto(self, data: bytes, addr):
            self.sent.append((data, addr))

    demuxer._sock = FakeSocket()
    demuxer._notify_loop()

    assert demuxer._sock.sent
    assert demuxer._sock.sent[0][1] == ("192.168.2.255", 12345)

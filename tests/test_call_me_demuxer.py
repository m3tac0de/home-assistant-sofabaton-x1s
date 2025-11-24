import socket
import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _ensure_stub_package(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    module.__path__ = [str(path)]
    sys.modules[name] = module


import types


_ensure_stub_package("custom_components", ROOT / "custom_components")
_ensure_stub_package("custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s")
_ensure_stub_package("custom_components.sofabaton_x1s.lib", ROOT / "custom_components" / "sofabaton_x1s" / "lib")

from custom_components.sofabaton_x1s.lib.call_me_demuxer import CallMeDemuxer, CallMeRegistration
from custom_components.sofabaton_x1s.lib.protocol_const import OP_CALL_ME, SYNC0, SYNC1


def _frame(payload: bytes) -> bytes:
    frame = bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF]) + payload
    checksum = sum(frame) & 0xFF
    return frame + bytes([checksum])


def test_extract_app_endpoint_from_payload():
    payload = b"\xAA\xBB\xCC\xDD\xEE\xFF" + socket.inet_aton("1.2.3.4") + struct.pack(">H", 9000)
    pkt = _frame(payload)

    app_ip, app_port, advertised = CallMeDemuxer._extract_app_endpoint(pkt, "10.0.0.2", 8100)

    assert advertised is True
    assert app_ip == "1.2.3.4"
    assert app_port == 9000


def test_extract_app_endpoint_without_payload_falls_back_to_source():
    pkt = _frame(b"")

    app_ip, app_port, advertised = CallMeDemuxer._extract_app_endpoint(pkt, "10.0.0.2", 8100)

    assert advertised is False
    assert (app_ip, app_port) == ("10.0.0.2", 8100)


def test_build_call_me_frame_contains_expected_parts():
    frame = CallMeDemuxer._build_call_me_frame(b"\xAA\xBB\xCC\xDD\xEE\xFF", "10.0.0.10", 9000)

    # sync + opcode + mac + ip + port + checksum
    assert frame[:4] == bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF])
    assert frame[4:10] == b"\xAA\xBB\xCC\xDD\xEE\xFF"
    assert frame[10:14] == socket.inet_aton("10.0.0.10")
    assert frame[14:16] == struct.pack(">H", 9000)
    assert len(frame) == 17


def test_ios_discovery_reply_uses_source_endpoint_and_throttle():
    class _FakeSocket:
        def __init__(self) -> None:
            self.sent = []

        def sendto(self, data: bytes, dest):
            self.sent.append((data, dest))

    demuxer = CallMeDemuxer(throttle=10.0)
    fake_sock = _FakeSocket()
    demuxer._sock = fake_sock
    demuxer._registrations = {
        "k": CallMeRegistration(
            key="k",
            name="Test",
            mac=b"\x01\x02\x03\x04\x05\x06",
            get_udp_port=lambda: 8200,
            connect_handler=lambda _addr: None,
            is_enabled=lambda: True,
        )
    }

    demuxer._handle_ios_discovery("192.0.2.1", 8100)

    assert len(fake_sock.sent) == 1
    frame, dest = fake_sock.sent[0]
    assert dest == ("192.0.2.1", 8100)
    # second call throttles
    demuxer._handle_ios_discovery("192.0.2.1", 8100)
    assert len(fake_sock.sent) == 1

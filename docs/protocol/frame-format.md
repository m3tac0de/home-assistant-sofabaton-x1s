# Frame Format

Most protocol messages exchanged over TCP use the same binary frame structure. The
UDP `CALL_ME` handshake also uses this structure. The app's `NOTIFY_ME` discovery
probe is best treated as a fixed 5-byte magic probe that happens to match the same
sync/opcode/checksum pattern.

---

## Wire layout

```
 Offset  Size  Field
 ------  ----  -----
    0      1   Sync byte 0   — always 0xA5
    1      1   Sync byte 1   — always 0x5A
    2      1   Opcode high byte
    3      1   Opcode low byte
    4    N≥0   Payload (variable length, may be zero bytes)
  4+N      1   Checksum
```

**Minimum frame size:** 5 bytes (sync 2 + opcode 2 + checksum 1, zero-length payload).

---

## Fields

### Sync bytes

The two-byte sequence `0xA5 0x5A` marks the start of every frame. Frame boundaries
are found by scanning for this pair in the byte stream; there is no explicit length
field in the frame header.

### Opcode

A 16-bit value encoded as two consecutive bytes in **big-endian** order:

```
opcode = (byte[2] << 8) | byte[3]
```

The high byte and low byte carry independent semantic meaning. The **low byte** is
the **family** identifier — all opcodes that belong to the same logical group (e.g.,
device button pages) share the same low byte. See [opcodes.md](opcodes.md) for the
full opcode list and family table.

### Payload

Arbitrary bytes specific to each opcode. Some frames have no payload (zero bytes
between opcode and checksum). The payload length is determined by scanning for the
next `0xA5 0x5A` sync pair in the byte stream.

> **Note:** The hub does not prefix frames with an explicit payload-length field.
> A deframer must scan the stream for sync bytes to locate frame boundaries. If
> payload bytes happen to contain `0xA5 0x5A`, the framer must rely on checksum
> validation to distinguish real sync markers from data.

### Checksum

A single byte appended after the payload:

```
checksum = sum(frame[0 .. frame_len-2]) & 0xFF
```

That is, the arithmetic sum (truncated to 8 bits) of every byte from the first sync
byte up to (but not including) the checksum byte itself.

---

## Frame construction example

Request hub to list activities (`OP_REQ_ACTIVITIES = 0x003A`, no payload):

```
A5 5A          ← sync
00 3A          ← opcode 0x003A
79             ← checksum: (0xA5+0x5A+0x00+0x3A) & 0xFF = 0x79
```

CALL_ME frame (UDP discovery, see [connection-flow.md](connection-flow.md)):

```
A5 5A          ← sync
0C C3          ← opcode 0x0CC3 (CALL_ME)
00 00 00 00    ← reserved / zeroed (6 bytes)
00 00
C0 A8 01 64    ← local IP in network byte order (192.168.1.100)
20 08          ← listen port big-endian (0x2008 = 8200)
??             ← checksum
```

---

## Direction notation

Throughout this documentation frames are labelled:

- **A→H** — from the app/client to the hub (request)
- **H→A** — from the hub to the app/client (response or push)

The same notation is used in the [opcodes.md](opcodes.md) tables.

---

## Byte order

All multi-byte integers are **big-endian** unless noted otherwise.

String/text encodings are **record-dependent**:

- X1 catalog names are often **UTF-8**
- X1S/X2 catalog names are often **UTF-16 BE**
- Command labels are observed as **ASCII**, **UTF-16 BE**, and some other variants
- Macro labels are commonly **UTF-16 BE** on X1S/X2 and **ASCII** on X1
- mDNS TXT records and HTTP callback payloads are **UTF-8**

Do not assume a single text encoding applies across the entire protocol.

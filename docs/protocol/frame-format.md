# Frame Format

Most protocol messages exchanged over TCP use the same binary frame structure. The
UDP `CALL_ME` handshake also uses this structure. The `NOTIFY_ME` discovery probe
is best treated as a fixed 5-byte magic probe that happens to match the same
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

### Opcode-hi is the payload length (invariant)

The **high byte of the opcode is always equal to the number of payload bytes**.
Clients may therefore read exactly `byte[2] + 5` bytes per frame when the stream
is aligned, with no separate payload-length field. This means:

```
frame_length = 5 + byte[2]
             = 5 + opcode_hi
             = 4 (sync + opcode) + opcode_hi (payload) + 1 (checksum)
```

Every observed opcode in this codebase obeys the invariant. Examples:

- `OP_REQ_BANNER = 0x0001`     → payload length 0, frame is 5 bytes
- `OP_X2_REMOTE_LIST = 0x012E` → payload length 1, frame is 6 bytes
- `OP_REQ_BUTTONS = 0x023C`    → payload length 2, frame is 7 bytes
- `OP_FIND_REMOTE_X2 = 0x0323` → payload length 3, frame is 8 bytes
- `OP_X2_REMOTE_SYNC = 0x0464` → payload length 4, frame is 9 bytes

Deframers may either scan for sync (slow path, robust against single-frame
corruption) or trust `byte[2]` as an O(1) length oracle (fast path, requires
the stream to actually be aligned at a frame boundary).

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
0C C3          ← opcode 0x0CC3 (CALL_ME; opcode_hi 0x0C = 12 payload bytes)
XX XX XX XX    ← client MAC (6 bytes; the official app puts its Wi-Fi MAC
XX XX            here. The HA proxy currently writes zeros; the hub appears
                 not to enforce the value — informational only.)
?? ?? ?? ??    ← local IP (4 bytes). Byte order is ambiguous:
                 - The HA proxy writes network byte order (e.g.
                   C0 A8 01 64 for 192.168.1.100, via socket.inet_aton).
                 - The official app writes the raw little-endian int
                   returned by Android's WifiManager.getIpAddress().
                 The hub responds correctly to both, which suggests it
                 sources the IP from the UDP source-address header rather
                 than from this field.
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

For paged response families such as `REQ_COMMANDS`, `REQ_BUTTONS`, and
`REQ_MACRO_LABELS`, also do not assume that each frame carries a self-contained
set of complete records. In observed traffic, page boundaries can split records
or rows, so clients should often concatenate page bodies for a burst before
performing record-level decoding.

For `REQ_COMMANDS` specifically, do not assume that command records are always
separated by a dedicated delimiter byte. Observed traffic includes:
- UTF-16BE command labels that legitimately contain raw `0xFF` bytes
- X1 one-page ASCII bursts that contain several command records back-to-back
  with no `0xFF` separators at all

The safest model is:
- use header metadata to identify the burst
- concatenate page bodies in order
- then recover record boundaries from the record structure itself rather than
  from page boundaries or bare delimiter bytes alone

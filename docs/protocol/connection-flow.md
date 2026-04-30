# Connection Flow

The Sofabaton ecosystem uses two distinct **hub discovery** mechanisms before the
normal `CALL_ME` / TCP session begins:

1. **mDNS discovery** — the hub advertises itself via mDNS and a client learns its IP
   address from that advertisement
2. **UDP broadcast discovery** — the app sends a `NOTIFY_ME` broadcast, hubs reply
   with their own broadcast, and the client then proceeds with the normal `CALL_ME`
   pattern

These are not two different protocols from the hub's point of view. Any third-party
implementation that talks to the hub is simply acting as a client of the same hub
protocol.

In practice:

- the official **Android app** is known to use the mDNS path successfully
- the official **iOS app** appears to rely on the UDP `NOTIFY_ME` broadcast path and
  does not appear to support mDNS discovery
- a proxy implementation re-uses these same mechanisms when exposing a virtual hub to
  the official app

---

## Part 1 — mDNS discovery path

### 1.1 Hub mDNS advertisement

The hub advertises via **mDNS** (Multicast DNS, RFC 6762):

| Model | mDNS service type              |
|-------|-------------------------------|
| X1    | `_x1hub._udp.local.`          |
| X1S   | `_x1hub._udp.local.`          |
| X2    | `_sofabaton_hub._udp.local.` (observed on physical hubs) |

> **Note:** In this repository's proxy implementation, X2 is re-advertised as
> `_x1hub._udp.local.` for compatibility. Physical X2 hubs have been observed using
> `_sofabaton_hub._udp.local.`.

TXT records of interest:

| Key   | Example value | Meaning              |
|-------|---------------|----------------------|
| `HVER`| `1`, `2`, `3` | Hub version (1=X1, 2=X1S, 3=X2) |
| `MAC` | `AA:BB:CC:DD:EE:FF` | Hub MAC address |
| `NAME`| `Living Room` | Human-readable hub name |

### 1.2 Client sends CALL_ME (UDP)

Once the client knows the hub's IP address (from mDNS or manual config), it sends a
`CALL_ME` frame (`opcode 0x0CC3`) to the hub on **UDP port 8102**:

```
CALL_ME frame layout (17 bytes):

 Byte   Size  Value
    0     2   Sync: 0xA5 0x5A
    2     2   Opcode: 0x0C 0xC3
    4     6   Reserved zeros (hub ignores these bytes)
   10     4   Client IP address (network byte order)
   14     2   Client TCP listen port (big-endian)
   16     1   Checksum
```

The hub responds with its own `CALL_ME` frame (same opcode) to acknowledge, then
immediately **opens a TCP connection** to the IP:port that the client embedded in the
frame.

> The client must have a TCP listen socket open before sending the CALL_ME frame.
> The hub's TCP connect-back arrives typically within a few hundred milliseconds.

### 1.3 Hub TCP connect-back

The hub connects to `(client_ip, client_port)` over TCP. Once the TCP session is
established, the session is full-duplex: both sides can send frames at any time.

The client binds to a port in the range `8200–8263` (default base 8200, up to 64
slots for multiple hubs).

### 1.4 Initial data exchange

After TCP connects, the client immediately requests all hub data:

```
Client → Hub: REQ_ACTIVITIES (0x003A)
Hub → Client: CATALOG_ROW_ACTIVITY rows (0xD53B) + MARKER (0x0C3D) + more rows
              … until all activities sent …

Client → Hub: REQ_DEVICES (0x000A)
Hub → Client: CATALOG_ROW_DEVICE rows (0xD50B) + MARKER (0x0C3D) + more rows
              … until all devices sent …
```

The hub may also proactively push `ACK_READY (0x0160)` frames between response
segments to indicate it is ready for more commands.

---

## Part 2 — UDP broadcast discovery path

The official app can also discover hubs through a UDP broadcast exchange. This is the
same hub-discovery concept as above, but using broadcast instead of mDNS.

When a proxy exposes a virtual hub to the official app, it re-implements this same
broadcast discovery flow so the app can discover the proxy as if it were a hub.

### 2.1 NOTIFY_ME (UDP broadcast) — app looking for hubs

The app broadcasts a 5-byte probe packet to the local subnet on **UDP port 8102**:

```
NOTIFY_ME probe: A5 5A 00 C1 C0  (5 bytes, no opcode framing — raw payload)
```

> In practice this is handled as a fixed magic probe, not as a normal request with a
> semantic payload, even though the bytes also satisfy the normal sync/opcode/checksum
> framing rule.

### 2.2 Hub (or proxy) NOTIFY_ME reply

When a hub receives the `NOTIFY_ME` probe, it broadcasts a reply to **UDP port
8100** on the subnet broadcast address (e.g. `192.168.1.255`).

When a proxy is impersonating a hub for the official app, it emits the same style of
reply.

The reply format varies by hub version:

**X1 / X2 reply (28 bytes total):**

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x1A (frame type marker)
    3     7   Device ID: 0xC2 + MAC[0:5] + 0x4B
   10     9   Version block: 64 01 20 21 06 09 11 00 00
   19     up to 12 bytes  Hub name (UTF-8, truncated to 12)
```

**X1S reply (32 bytes total):**

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x1D (frame type marker)
    3     7   Device ID: 0xC2 + MAC[0:5] + 0x45
   10     9   Version block: 64 02 20 22 11 20 05 01 00
   19    14   Hub name (UTF-8, zero-padded to 14)
   33     1   Trailer byte: 0xBE
```

**Device ID construction:**

```
device_id[0]   = 0xC2  (fixed required prefix)
device_id[1:6] = MAC[0:5]  (first 5 bytes of hub MAC address)
device_id[6]   = 0x4B  (X1 / X2)
                 0x45  (X1S)
```

The **CALL_ME hint** (used by a proxy implementation to match subsequent `CALL_ME`
frames back to the correct virtual hub) is
`MAC[0:5] + suffix_byte` (the same as `device_id[1:7]`).

### 2.3 Client sends CALL_ME after discovery

After receiving the `NOTIFY_ME` reply, the client sends a `CALL_ME` frame (`opcode
0x0CC3`) to the discovered endpoint on its UDP port.

For a real hub, this is followed by the normal hub TCP connect-back described in
Part 1.

For a proxy impersonating a hub to the official app, the roles are inverted at the
transport layer: the proxy extracts the app's IP address and port from the `CALL_ME`
frame and opens a TCP connection **to** the app.

### 2.4 CONNECT_READY_BROADCAST

Immediately after a proxy establishes the TCP session with the app, it broadcasts a
fixed 12-byte beacon to port `8100` on the subnet broadcast address:

```
CONNECT_READY_BROADCAST: A5 5A 07 C4 E2 6A 44 86 1B 45 00 40
```

This tells the app that the hub connection is now live.

---

## Session lifecycle summary

```
CLIENT                               HUB
   |                                     |
   |-- UDP CALL_ME (port 8102) --------> |
   |                                     |
   |<------- UDP CALL_ME response ------ |
   |                                     |
   |<------- TCP connect-back ---------- |  (hub connects to embedded IP:port)
   |                                     |
   |-- REQ_ACTIVITIES -----------------> |
   |<-- CATALOG_ROW_ACTIVITY (N rows) -- |
   |-- REQ_DEVICES -------------------> |
   |<-- CATALOG_ROW_DEVICE (N rows) ---- |
   |                                     |
   |  … bidirectional command/response …  |
```

```
APP / CLIENT                         HUB
   |                                     |
   |-- UDP NOTIFY_ME probe -----------> |  (broadcast to subnet:8102)
   |                                     |
   |<-- UDP NOTIFY_ME reply -- (bcast) --|  (hub broadcasts to subnet:8100)
   |                                     |
   |-- UDP CALL_ME -------------------> |  (client sends CALL_ME to discovered hub)
   |                                     |
   |<------- TCP connect-back ---------- |  (hub connects to client IP:port from CALL_ME)
   |                                     |
   |  … normal framed TCP session …      |
```

```
PROXY                                APP
   |                                     |
   |<-- UDP NOTIFY_ME probe ----------- |  (app broadcasts to subnet:8102)
   |                                     |
   |-- UDP NOTIFY_ME reply --> (bcast) -> |  (proxy broadcasts to subnet:8100)
   |                                     |
   |<-- UDP CALL_ME ------------------- |  (app sends CALL_ME to proxy)
   |                                     |
   |-- TCP connect -------------------- >|  (proxy connects to app IP:port from CALL_ME)
   |                                     |
   |-- CONNECT_READY_BROADCAST (bcast) ->|  (UDP broadcast to subnet:8100)
   |                                     |
   |  … proxy relays all hub traffic …   |
```

---

## Port summary

| Port  | Protocol | Direction      | Purpose |
|-------|----------|----------------|---------|
| 8102  | UDP      | Client → Hub   | CALL_ME request to hub |
| 8102  | UDP      | Client → Hub   | `NOTIFY_ME` broadcast probe |
| 8100  | UDP      | Hub → Client   | `NOTIFY_ME` broadcast reply |
| 8200+ | TCP      | Hub → Client   | Hub TCP connect-back (client listen port, 8200–8263) |
| 8102  | UDP      | App → Proxy    | `NOTIFY_ME` probe / `CALL_ME` when proxying for the app |
| 8100  | UDP      | Proxy → App    | `NOTIFY_ME` reply, `CONNECT_READY_BROADCAST` |
| varies| TCP      | Proxy → App    | Proxy connects to app IP:port from `CALL_ME` |

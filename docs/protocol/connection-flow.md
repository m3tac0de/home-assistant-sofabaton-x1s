# Connection Flow

The hub protocol involves two independent discovery mechanisms — one for **hub
discovery** (the hub announces itself to clients) and one for **app discovery** (the
proxy announces itself to the official Sofabaton app).

---

## Part 1 — Client discovers hub and establishes a TCP session

### 1.1 Hub mDNS advertisement

The hub advertises via **mDNS** (Multicast DNS, RFC 6762):

| Model | mDNS service type              |
|-------|-------------------------------|
| X1    | `_x1hub._udp.local.`          |
| X1S   | `_x1hub._udp.local.`          |
| X2    | `_sofabaton_hub._udp.local.`  |

> **Note:** X2 hubs also respond on `_x1hub._udp.local.` for backwards compatibility
> when a proxy re-advertises on that service type.

TXT records of interest:

| Key   | Example value | Meaning              |
|-------|---------------|----------------------|
| `HVER`| `1`, `2`, `3` | Hub version (1=X1, 2=X1S, 3=X2) |
| `MAC` | `AA:BB:CC:DD:EE:FF` | Hub MAC address |
| `NAME`| `Living Room` | Human-readable hub name |

### 1.2 CALL_ME (UDP) — client requests a hub connection

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
established, the hub becomes the "app" side and the client is the "hub" side in terms
of who initiates each request/response exchange.

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

## Part 2 — App discovers the proxy

The official Sofabaton iOS/Android app uses a separate discovery flow to find hubs
on the network. A proxy that wants to intercept app traffic re-implements this
discovery on behalf of the real hub.

### 2.1 NOTIFY_ME (UDP broadcast) — app looking for hubs

The app broadcasts a 5-byte probe packet to the local subnet on **UDP port 8102**:

```
NOTIFY_ME probe: A5 5A 00 C1 C0  (5 bytes, no opcode framing — raw payload)
```

> This is **not** a standard framed message — it does not begin with sync bytes
> followed by an opcode. It is a fixed magic sequence the app sends to solicit
> hub announcements.

### 2.2 Proxy NOTIFY_ME reply

When the proxy receives the NOTIFY_ME probe, it broadcasts a reply to **UDP port
8100** on the subnet broadcast address (e.g. `192.168.1.255`).

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

The **CALL_ME hint** (used to match subsequent CALL_ME frames back to the proxy) is
`MAC[0:5] + suffix_byte` (the same as `device_id[1:7]`).

### 2.3 App sends CALL_ME to proxy

After receiving the NOTIFY_ME reply, the app sends a `CALL_ME` frame (`opcode
0x0CC3`) directly to the proxy on its UDP port. The proxy extracts the app's IP
address and port from the CALL_ME frame and opens a TCP connection **to** the app.

> Unlike the hub flow where the hub connects back to the client, here the proxy is
> the one that connects to the app.

### 2.4 CONNECT_READY_BROADCAST

Immediately after the proxy establishes the TCP session with the app, it broadcasts
a fixed 12-byte beacon to port `8100` on the subnet broadcast address:

```
CONNECT_READY_BROADCAST: A5 5A 07 C4 E2 6A 44 86 1B 45 00 40
```

This tells the app that the hub connection is now live.

---

## Session lifecycle summary

```
CLIENT (proxy)                         HUB
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
CLIENT (proxy)                         APP
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
| 8102  | UDP      | App → Proxy    | NOTIFY_ME probe / CALL_ME from app |
| 8100  | UDP      | Proxy → App    | NOTIFY_ME reply, CONNECT_READY_BROADCAST |
| 8200+ | TCP      | Hub → Client   | Hub TCP connect-back (client listen port, 8200–8263) |
| varies| TCP      | Proxy → App    | Proxy connects to app IP:port from CALL_ME |

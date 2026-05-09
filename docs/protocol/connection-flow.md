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
- a third-party bridge can re-use these same mechanisms when exposing a virtual
  hub to the official app

---

## Part 1 — mDNS discovery path

### 1.1 Hub mDNS advertisement

The hub advertises via **mDNS** (Multicast DNS, RFC 6762):

| Model | mDNS service type              |
|-------|-------------------------------|
| X1    | `_x1hub._udp.local.`          |
| X1S   | `_x1hub._udp.local.`          |
| X2    | `_sofabaton_hub._udp.local.` (observed on physical hubs) |

> Compatibility note: some third-party bridges re-advertise X2-compatible
> endpoints as `_x1hub._udp.local.`. Physical X2 hubs have been observed using
> `_sofabaton_hub._udp.local.`.

TXT records of interest:

| Key   | Example value | Meaning              |
|-------|---------------|----------------------|
| `HVER`| `1`, `2`, `3` | Hub version (1=X1, 2=X1S, 3=X2) |
| `AVER`| `17`, `5`, `8` | Hub firmware version |
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

After TCP connects, the client typically requests banner/version metadata first,
then the full catalog:

```
Client → Hub: REQ_BANNER (0x0001)
Hub → Client: family-0x02 BANNER
              (observed full opcodes: 0x1A02 X1, 0x1D02 X1S, 0x1502 X2)
              carries model, production batch, hub firmware, hub name

Client → Hub: REQ_ACTIVITIES (0x003A)
Hub → Client: CATALOG_ROW_ACTIVITY rows (0xD53B) + MARKER (0x0C3D) + more rows
              … until all activities sent …

Client → Hub: REQ_DEVICES (0x000A)
Hub → Client: CATALOG_ROW_DEVICE rows (0xD50B) + MARKER (0x0C3D) + more rows
              … until all devices sent …
```

The hub may also proactively push `ACK_READY (0x0160)` frames between response
segments to indicate a material state change has taken place. Clients typically respond by refreshing the Activity list to learn the running Activity.

When the official app opens the version screen, an additional exchange is commonly
observed:

```
Client → Hub: REQ_VERSION (0x0058)
Hub → Client: WIFI_FW (0x0359)
Hub → Client: INFO_BANNER (0x112F)
```

Observed meaning:
- `WIFI_FW` carries the WiFi firmware version (`major.minor.patch`)
- `INFO_BANNER` repeats model/batch and, on X1/X1S, carries remote firmware
- hub firmware is more directly exposed by the family-`0x02` banner and by the
  mDNS `AVER` TXT record

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

The reply format is mostly shared across hub versions:

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   Variable length byte
               = 6-byte device-id tail + 9-byte version block + name length
               (does not count the fixed leading 0xC2 or the trailing checksum)
    3     7   Device ID: 0xC2 + 6-byte device-id tail
   10     9   Version block
   19     N   Hub name (UTF-8, observed max 30 bytes)
  19+N    1   Checksum (sum8 of all preceding bytes)
```

Observed device-id tail differences:

- X1: `MAC[0:5] + 0x4B`
- X1S: `MAC[0:5] + 0x45`
- X2: full `MAC[0:6]`

Observed version-block differences:

- X1: `64 01 20 21 06 09 11 00 00`
- X1S: `64 02 20 22 11 20 05 01 00`
- X2: `64 03 20 22 11 20 08 01 00`

Representative observed replies:

**X1 reply (31 bytes total in observed sample):**

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x1A (= 6 + 9 + 11)
    3     7   Device ID: 0xC2 + MAC[0:5] + 0x4B
   10     9   Version block: 64 01 20 21 06 09 11 00 00
   19    11   Hub name (UTF-8, observed sample: `X1 HUB test`)
   30     1   Checksum (sum8 of all preceding bytes)
```

The observed X1 reply name matches the earlier TCP banner text exactly (`X1 HUB test`).

**X2 reply (26 bytes total in observed sample):**

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x15 (= 6 + 9 + 6)
    3     7   Device ID: 0xC2 + MAC[0:6]
   10     9   Version block: 64 03 20 22 11 20 08 01 00
   19     6   Hub name (UTF-8, observed: `X2 HUB`)
   25     1   Checksum
```

**X1S reply (27 bytes total in short observed sample):**

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x16 (= 6 + 9 + 7)
    3     7   Device ID: 0xC2 + MAC[0:5] + 0x45
   10     9   Version block: 64 02 20 22 11 20 05 01 00
   19     7   Hub name (UTF-8, observed: `X1S HUB`)
   26     1   Checksum (sum8 of all preceding bytes)
```

Longer X1S names have been observed growing the packet exactly the same way as X1/X2.

**Device ID construction:**

```
device_id[0]   = 0xC2  (fixed required prefix)
device_id[1:6] = MAC[0:5]  (X1 / X1S)
device_id[6]   = 0x4B  (X1)
                 0x45  (X1S)

X2 uses a different observed layout:

device_id[0]   = 0xC2
device_id[1:7] = MAC[0:6]  (full 6-byte MAC address)
```

The **CALL_ME hint** (useful when matching subsequent `CALL_ME` frames back to the
correct virtual hub) matches the device-id tail:

- X1 / X1S: `MAC[0:5] + suffix_byte`
- X2: full `MAC[0:6]`

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
12-byte beacon to port `8100` on the subnet broadcast address:

```
X1 example:  A5 5A 07 C4 CB 38 35 39 68 4B 00 EE
X1S example: A5 5A 07 C4 E2 6A 44 86 1B 45 00 40
```

Observed structure:

```
 Byte   Size  Value
    0     1   0xA5 (sync 0)
    1     1   0x5A (sync 1)
    2     1   0x07
    3     1   0xC4
    4     6   CALL_ME hint
   10     1   0x00
   11     1   Checksum (sum8 of all preceding bytes)
```

The beacon reuses the same **CALL_ME hint** observed in discovery:

- X1: `MAC[0:5] + 0x4B`
- X1S: `MAC[0:5] + 0x45`
- X2: full `MAC[0:6]`

This appears to signal that the hub connection is live, but current testing suggests
it is **not required** for successful operation of the official app. Removing it did
not change connection behavior in observed X1 testing.

### 2.5 Discovery-path name query

When the user changes hubs through the app's discovery overlay, an additional
application-level query may appear that is not normally seen when reconnecting
directly to the previously selected hub:

```
Client -> Hub: OP_0032
Hub    -> Client: OP_0631 <UTF-8 hub name>
```

Observed X1 example:

```
Request:  A5 5A 00 32 31
Response: A5 5A 06 31 58 31 20 48 55 42 BE
```

The response payload is a UTF-8 hub name (`X1 HUB` in the observed sample) plus a
trailing checksum byte.

### 2.6 X1 default-name quirk

Observed X1 behavior in the official app:

- if the hub advertises the default name `X1 HUB`, the app may open the
  "name your hub" dialog when connecting through the discovery-driven hub switch flow
- the same hub can still connect normally when the app reconnects directly to the
  last-used hub without discovery
- changing the X1 to a non-default name avoids the observed rename prompt

This appears to be an app quirk tied to the default X1 name rather than a transport
or framing error in discovery or banner handling.

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
   |-- REQ_DEVICES ------------------->  |
   |<-- CATALOG_ROW_DEVICE (N rows) ---- |
   |                                     |
   |  … bidirectional command/response … |
```

```
APP / CLIENT                         HUB
   |                                     |
   |-- UDP NOTIFY_ME probe ----------->  |  (broadcast to subnet:8102)
   |                                     |
   |<-- UDP NOTIFY_ME reply -- (bcast) --|  (hub broadcasts to subnet:8100)
   |                                     |
   |-- UDP CALL_ME ------------------->  |  (client sends CALL_ME to discovered hub)
   |                                     |
   |<------- TCP connect-back ---------- |  (hub connects to client IP:port from CALL_ME)
   |                                     |
   |  … normal framed TCP session …      |
```

```
PROXY                                APP
   |                                     |
   |<-- UDP NOTIFY_ME probe -----------  |  (app broadcasts to subnet:8102)
   |                                     |
   |-- UDP NOTIFY_ME reply --> (bcast) ->|  (proxy broadcasts to subnet:8100)
   |                                     |
   |<-- UDP CALL_ME -------------------  |  (app sends CALL_ME to proxy)
   |                                     |
   |-- TCP connect -------------------- >|  (proxy connects to app IP:port from CALL_ME)
   |                                     |
   |-- CONNECT_READY_BROADCAST (bcast) ->|  (optional/observed UDP broadcast to subnet:8100)
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

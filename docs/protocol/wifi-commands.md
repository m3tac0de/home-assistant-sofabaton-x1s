# Wifi Commands — Wifi Devices and HTTP Callbacks

The hub supports **Wifi Devices**: virtual devices that send HTTP requests instead
of IR signals when a remote button is pressed. This enables local-network integration
with HTTP-controllable devices (smart plugs, media players, etc.).

The proxy creates these virtual devices on the hub, and the hub calls back to the
proxy's HTTP server when commands are triggered.

---

## Concepts

- **Wifi Device**: A virtual device record stored on the hub, with a name and a set
  of commands. Each command contains an HTTP method, URL, and optional headers.
- **Wifi Command**: One slot in a Wifi Device. Up to ~10 commands per device.
- **HTTP callback**: When the user presses a remote button mapped to a Wifi Command,
  the hub sends an HTTP request to the URL configured in that command. The proxy
  listens on port `8060` for these callbacks.

---

## Wifi Device creation flow

Creating a Wifi Device requires a specific opcode sequence. All frames are sent A→H:

```
1. CREATE_DEVICE_HEAD (0x07D5)
   Payload: device name as UTF-16 LE (up to 64 bytes)

2. DEFINE_IP_CMD (0x0ED3)  [one per command slot]
   Payload: HTTP method + URL + headers + callback URL

3. PREPARE_SAVE (0x4102)
   Payload: save transaction trigger

4. Hub responds: DEVICE_SAVE_HEAD (0x8D5D)
   Payload contains the hub-assigned device_id for this new device

5. FINALIZE_DEVICE (0x4677)
   Payload: (device-specific, see note below)

6. SAVE_COMMIT (0x6501)
   Payload: commit marker

7. Hub responds: ACK_SUCCESS (0x0301)
   Device is now available on the hub.
```

> **Note:** The full PREPARE_SAVE / FINALIZE_DEVICE payload structure is partially
> opaque. The reference implementation constructs these frames empirically based on
> observed hub traffic.

---

## DEFINE_IP_CMD payload format (`0x0ED3`)

```
 Field         Type    Notes
 method_len    uint8   Byte count of method string
 method        bytes   HTTP method (e.g. "POST", ASCII)
 url_len       uint8   Byte count of URL string
 url           bytes   Full URL (e.g. "http://192.168.1.5:8060/sofabaton/callback?...")
 headers_len   uint8   Byte count of headers string
 headers       bytes   HTTP headers in "Key: Value\n" format (ASCII)
 body          bytes   Remaining bytes are the HTTP request body (may be empty)
```

---

## HTTP callback URL

The proxy configures each Wifi Command to call back to its own HTTP server:

```
http://<proxy_host>:<port>/sofabaton/callback?device_id=<N>&command_id=<M>
```

Default port: `8060`

When the hub fires a Wifi Command, it sends an HTTP POST (or GET) to this URL. The
proxy receives the request, identifies the command by `device_id` and `command_id`,
and triggers the associated automation or Home Assistant action.

---

## IP command synchronization

To retrieve existing Wifi Device definitions from the hub:

```
Client → Hub: REQ_IPCMD_SYNC (0x0C02)
Hub → Client: IPCMD_ROW_A (0x0DD3)   — device header row
Hub → Client: IPCMD_ROW_B (0x0DAC)   — command definition row
Hub → Client: IPCMD_ROW_C (0x0D9B)   — URL/headers row
Hub → Client: IPCMD_ROW_D (0x0DAE)   — additional metadata row
              (rows repeat for each command)
```

---

## Adding a command to an existing device

Use `DEFINE_IP_CMD_EXISTING` (`0x0EAE`) instead of `DEFINE_IP_CMD` when adding
commands to a Wifi Device that already exists on the hub. The opcode and flow are
similar to `DEFINE_IP_CMD` but the target device ID is included in the payload.

---

## Capacity

- Up to **5 Wifi Devices** per hub (observed limit)
- Up to **10 commands** per device
- Power ON/OFF and INPUT commands are configurable separately
- Wifi Devices can be assigned to specific activities, making their buttons appear
  in the activity's remote layout

---

## HTTP callback details (proxy side)

The proxy's HTTP listener receives callbacks from the hub:

- **Method:** POST (or GET, depending on command configuration)
- **URL:** as configured in the Wifi Device command definition
- **Parameters:**
  - `device_id` — integer, the hub's internal ID for the Wifi Device
  - `command_id` — integer, which command slot was activated
- **Press type:** short press vs long press — conveyed in the request body or as
  an additional query parameter (implementation-dependent)

The response code returned to the hub is `200 OK` to acknowledge receipt.

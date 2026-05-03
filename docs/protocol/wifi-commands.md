# WiFi/IP Devices

The hub supports virtual devices whose commands are backed by HTTP requests
instead of IR or Bluetooth signals. This document describes the protocol used to
create, synchronize, and refresh those devices.

---

## Concepts

- WiFi/IP device: a virtual device stored on the hub
- WiFi/IP command: one command slot on that device
- callback URL: the HTTP endpoint the hub will call when that command is invoked

Observed uses include:
- Home Assistant style callback endpoints
- media-player launch commands
- HTTP-based smart-home integrations

---

## Device creation flow

Observed request sequence:

1. `CREATE_DEVICE_HEAD` (`0x07D5`)
2. `DEFINE_IP_CMD` (`0x0ED3`) once per command, or `DEFINE_IP_CMD_EXISTING`
3. `PREPARE_SAVE` (`0x4102`)
4. hub replies with `DEVICE_SAVE_HEAD` (`0x8D5D`) containing the assigned device id
5. `FINALIZE_DEVICE` (`0x4677`)
6. `SAVE_COMMIT` (`0x6501`)
7. hub replies with `ACK_SUCCESS` (`0x0301`)

Some payload regions in this flow are still only partially characterized, but the
sequence itself is stable in observed traffic.

---

## `DEFINE_IP_CMD` payload structure (`0x0ED3`)

Observed layout:

```
UTF-16LE fixed-width label block
method_len     (1 byte)
method         (ASCII)
url_len        (1 byte)
url            (ASCII)
headers_len    (1 byte)
headers        (ASCII)
body           (remaining bytes)
```

Observed HTTP methods include `POST` and `GET`.

---

## Hub-assigned device id (`0x8D5D`)

During save, the hub emits `DEVICE_SAVE_HEAD` (`0x8D5D`). The payload includes the
hub-assigned device id for the newly created WiFi/IP device. Subsequent save and
refresh steps refer to that id.

---

## IP-command synchronization (`0x0C02 -> family 0x0D`)

To enumerate the existing HTTP-backed commands on a device:

```
client -> hub: 0x0C02
hub -> client: 0x0DD3, 0x0DAC, 0x0D9B, 0x0DAE rows
```

These rows collectively describe the command name and its HTTP request metadata.

Observed text encoding:
- command/button names in these sync rows are UTF-16LE

---

## Input-configuration save and refresh

Some WiFi/IP devices expose a separate "input" configuration. After input-config
entries are written, the hub can be asked to materialize one input label at a
time.

### Refresh request

```
client -> hub: 0x020C
payload = [device_id, slot_id]
```

### Refresh reply

Observed reply opcode family:
- `0xCD0D` and related family-`0x0D` variants

Observed payload layout:

```
payload[0:6]   = 01 00 01 01 00 01
payload[6]     = device id
payload[7]     = slot id
payload[8]     = format marker
payload[16:76] = UTF-16LE label region
payload[76:]   = request metadata, observed as IP/port + HTTP template
```

This reply is best understood as a readback/refresh confirmation for one input
slot, not as a normal `REQ_COMMANDS` reply.

---

## Capacity and observed constraints

Observed constraints from field traffic:
- up to about 10 commands per WiFi/IP device
- power and input behavior can be configured separately
- WiFi/IP devices can be assigned to activities like other devices

Exact hard limits may vary by firmware.

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

---

## Command id space (X1 vs X1S/X2)

Live-validated 2026-07-12 (both hub models). The integration deploys
each of the 10 user slots as two command records — a short-press and a
long-press variant — so a full device holds 20 records.

- **X1S / X2 (virtual-IP)**: records are written *and* read back at
  command ids `1..20`.
- **X1 (Roku-replay)**: records are *written* in the family-0x0E
  payloads at key ids `0x18..0x2B`, but the hub re-exposes them in its
  command table (and everywhere else) as ids `1..20`. The `0x18..`
  ids exist only inside the write payloads.

On both variants the `1..20` space is what `REQ_ACTIVATE` (`0x023F`)
and the power/input binding rows address — activating key `0x18` on an
X1 hits nothing. Callback paths are
`/launch/<hub_action_id>/<device_id>/<command_index>/<short|long>`,
where `command_index` is the 0-based slot the user configured.

## Callback delivery and activity macros

- One `REQ_ACTIVATE` on a WiFi/IP command delivers exactly one HTTP
  callback, provided the listener returns a response the hub accepts;
  an unacceptable response triggers a delivery-retry loop. See the
  `REQ_ACTIVATE` (`0x023F`) row in [opcodes.md](opcodes.md).
- The hub runs an activity's power macros on a real state transition,
  so activating/deactivating an activity that contains a WiFi/IP
  device fires that device's power-on/input and power-off callbacks
  through the same path.

Full deploy-pipeline validation (create → add-to-activity → favorites
→ bindings → re-sync/rollback, both hub models) is recorded in
[live-hub-testing.md](live-hub-testing.md) under "Validated: Wifi
Commands deploy pipeline".

## Virtual MQTT devices (`wifi_mqtt`, class `0x20`, X2 only)

The X2 firmware supports a virtual device class whose command
activations publish to the hub's MQTT broker instead of issuing an
HTTP request. The facts below were established against real X2
hardware in captures from 2026-07 and the committed 2026-08-10
latency benchmark.

**Device head.** `device_class_code` / `code_type` `0x20`,
`device_type` `0x10`, `icon` 8, `idle_behavior` 4, `input_mode` 2,
`power_mode` 1, `ip_address` null, `poll_time` 0, `code_id_hex` all
zero, `tail_marker` 1. Whatever the hub needs to reach the broker
lives at hub scope, written by the vendor app; no read-back opcode is
known to exist.

**Command records.** Plain family-`0x0E` `hub_code_record` rows,
`library_type` `0x20`, `command_code` six zero bytes, and a body of
**exactly two bytes** (nominally `(device_id, command_id)` as the app
writes them) plus the standard per-record checksum. The hub **ignores
the two bytes**: at press time it publishes its own actual device and
key ids. A restored or synthesized record with any byte content
publishes correctly. There is no topic, broker address, QoS, or retain
flag anywhere in the records.

**Publish shape.** On activation the hub publishes
`{"device_id": <int>, "key_id": <int>}` to `<MAC>/up`, where the MAC
is the hub's MAC as UPPERCASE bare hex (the lowercase topic stays
silent), QoS 0, retain false. `key_id` is the command id of the record
the hub executed; short vs. hold resolution happens hub-side against
the binding and record tables, so a long press arrives as the
long-record's command id (our layout: `short + slot_count`). There is
no press-type field. Only virtual MQTT device activations reach the
broker; the hub does not mirror other key presses (no free ingress).

**Behavioral parity.** An MQTT virtual device is otherwise a fully
normal device: power commands, inputs/activity-start, macros,
favorites, and hard buttons all work, with no X1-style carve-outs.
Capacity matches HTTP wifi devices. Hold does NOT repeat (one publish
per press), unlike the ~4 Hz HTTP repeat.

**Broker behavior.** The hub retains nothing and registers no LWT; a
dead hub→broker link is silent from the subscriber's side. The hub
does answer the app's hub-scoped request topics
(`activity/{mac}/list_request` → `activity/{mac}/list`, payload
`{"data": "activity_list"}`) even with no MQTT device deployed, which
the official vendor integration uses as its bootstrap.

**Latency.** Activation→delivery measured on the same X2, interleaved
trials: MQTT p50 259 ms vs HTTP p50 447 ms (paired median diff
-131 ms). Both are quantized by a firmware queue-service tick
(~130-150 ms grain). Details in [live-hub-testing.md](live-hub-testing.md)
under "Measured: MQTT vs HTTP callback latency".

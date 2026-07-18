# Ack handling

This document describes how the hub signals the outcome of a write
that the client expects an ack for. It is protocol-level only; the
typed result surface used by the integration's transport code lives
in [reference-impl.md](reference-impl.md).

---

## Status-ack opcode

The hub answers most writes with a frame on opcode `0x0103`
(`STATUS_ACK`). The payload's first byte encodes the outcome:

| First byte | Meaning |
|---|---|
| `0x00` | Success. The write was accepted. |
| non-zero | Reject. The hub refused the write; later steps in a multi-step sequence will not be processed. |

Specific reject byte values observed include `0x0C` on IR blob
save-page rejects (see [data-structures.md](data-structures.md) "IR
blob save pages"). Other reject bytes have been observed but their
exhaustive meaning is not yet characterised; clients should treat
"first byte is non-zero" as the generic reject signal.

Some flows acknowledge with a family-specific ack opcode instead of
`STATUS_ACK` (for example device-create, button-binding, and macro
writes echo a request-side correlation byte in their reply). Those
ack opcodes are documented alongside their wire family in
[opcodes.md](opcodes.md) and [data-structures.md](data-structures.md);
the convention is the same: a present reply with a zero / matching
first byte means accept, and any non-zero or non-matching first byte
means reject.

**Exception — macro-save ack `0x0112`** (bench-observed on X1,
2026-07-11): a macro save that removes a device's last power-macro
reference triggers a hub-side cascade (the device is removed from the
activity entirely) and the hub acks the *successful* save with a
`0x0112` whose first byte is NOT the written macro key (observed
`0x01`, arriving ~1.2 s after the write instead of immediately).
Clients must accept any `0x0112` reply as the save ack and rely on
`STATUS_ACK` non-zero bytes for rejection signaling; treating the
non-matching correlation byte as a reject misreports a completed
write. See [live-hub-testing.md](live-hub-testing.md) "Validated:
activity-edit engine emissions".

---

## Three-way outcome

A client driving a multi-step sequence must distinguish:

1. **Accepted** — the hub answered, and the answer encoded success.
   Continue with the next step.
2. **Rejected** — the hub answered, and the answer encoded a refusal
   (non-zero first byte on `STATUS_ACK`, or a non-matching
   correlation byte on a family-specific ack). The hub has already
   declined; later steps in the sequence will not be processed. The
   client should abort the in-flight sequence rather than waiting
   out a full per-step timeout for each remaining step.
3. **Timed out** — no reply arrived within the client's wait
   window. This may be transient (network delay, ack loss on a
   parallel burst) and is distinct from the explicit-refusal case
   above.

Conflating reject and timeout multiplies user-visible latency by the
remaining step count on a refused multi-step write, because the
client waits out a full timeout per step after the hub has already
declined.

---

## Activity-inputs burst rejects

The `REQ_ACTIVITY_INPUTS` (`0x0148`) flow normally answers with a
family-`0x47` burst of input candidate rows. A hub-side refusal of
this read surfaces as a `STATUS_ACK` reply with a non-zero first
byte instead of the expected burst. Clients should treat "no burst
within timeout + a `STATUS_ACK` reject observed" as a rejected read
and surface it separately from a plain timeout.

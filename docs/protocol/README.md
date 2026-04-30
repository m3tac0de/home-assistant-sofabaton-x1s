# Sofabaton Hub Protocol — Reference Documentation

> **Disclaimer:** This documentation is based on reverse-engineering of undisclosed
> Sofabaton hub firmware. It is unofficial and may become inaccurate as firmware
> evolves. There is no warranty of correctness or completeness.

This directory documents the binary protocol used by the Sofabaton X1, X1S, and X2
remote control hubs. The documentation is implementation-agnostic — no Python, no
Home Assistant, no specific library required. Any language can implement a client from
this specification.

The reference implementation (Python, MIT license) lives in `/sofabaton_x1/` in the
repository root. See [reference-impl.md](reference-impl.md) for a map from protocol
concepts to source files.

---

## Tested firmware

| Model | Hub version property (`HVER`) |
|-------|-------------------------------|
| X1    | `1`                           |
| X1S   | `2`                           |
| X2    | `3`                           |

---

## Table of contents

| Document | Contents |
|----------|----------|
| [frame-format.md](frame-format.md) | Wire format: sync bytes, opcode layout, checksum |
| [connection-flow.md](connection-flow.md) | Discovery, CALL_ME/NOTIFY_ME, TCP connect-back, session lifecycle |
| [opcodes.md](opcodes.md) | All known opcodes with direction, payload shape, hub version support |
| [data-structures.md](data-structures.md) | Entity IDs, device/activity/command/button record layouts |
| [hub-versions.md](hub-versions.md) | X1 vs X1S vs X2 differences, opcode variant tables |
| [wifi-commands.md](wifi-commands.md) | Wifi Device creation, HTTP callback protocol |
| [reference-impl.md](reference-impl.md) | Source file map for the Python reference implementation |

---

## Quick orientation

The Sofabaton hub speaks a proprietary binary protocol over TCP and UDP. There is
**no authentication** — the protocol assumes a trusted local network. The general
operating model is:

1. The hub advertises itself via mDNS on the local network.
2. A client (app or proxy) opens a UDP socket and sends a `CALL_ME` frame to the hub's
   UDP port (`8102` by default).
3. The hub responds and immediately opens a **TCP connection back** to the IP address
   and port that were embedded in the `CALL_ME` frame.
4. The client now has a full-duplex TCP session and begins exchanging framed binary
   messages.

All hub data — devices, activities, commands — is returned in multi-frame **burst**
responses. A single request triggers a header frame, one or more body pages, and a
tail frame that signals completion.

See [connection-flow.md](connection-flow.md) for the full picture.

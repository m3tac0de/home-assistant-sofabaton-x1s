# Sofabaton Hub Protocol Reference

> This documentation reflects observed protocol behavior and may become
> inaccurate as firmware changes.

This directory documents the Sofabaton X1, X1S, and X2 hub protocol at the wire
level. The goal is that a client can be implemented from these documents without
depending on a particular language, library, or Home Assistant integration.

Implementation notes for this repository's Python code are kept separate in
[reference-impl.md](reference-impl.md).

---

## ◇ Scope

These documents focus on:
- frame layout
- discovery and session setup
- opcode meanings
- recurring payload structures
- hub-version differences
- WiFi/IP device flows

They intentionally avoid:
- parser method names
- class names
- cache-layout details
- assumptions that are specific to this repository

---

## ◇ Tested hub lines

| Model | `HVER` |
|-------|--------|
| X1 | `1` |
| X1S | `2` |
| X2 | `3` |

---

## ◇ Contents

| Document | Purpose |
|----------|---------|
| [frame-format.md](frame-format.md) | Sync bytes, opcode encoding, checksum |
| [connection-flow.md](connection-flow.md) | Discovery, `CALL_ME`, TCP session establishment |
| [opcodes.md](opcodes.md) | Known request and response opcodes |
| [data-structures.md](data-structures.md) | Repeated payload structures and row layouts |
| [inputs.md](inputs.md) | Family-0x46 inputs page (entry region + control keys + favorites) |
| [write-flows.md](write-flows.md) | Create/update write families and their end-to-end sequencing |
| [hub-versions.md](hub-versions.md) | X1 vs X1S vs X2 differences, including per-variant record dimensions |
| [wifi-commands.md](wifi-commands.md) | WiFi/IP device creation, sync, and refresh flows |
| [ack-handling.md](ack-handling.md) | How the hub signals accept / reject / timeout |
| [erase.md](erase.md) | Whole-hub erase / factory-reset opcode and post-erase expectations |
| [reference-impl.md](reference-impl.md) | Mapping from protocol concepts to this repository's code (orchestrator, mixin layout, ack-outcome dataclasses, state accessor) |

Planning notes that happen to live in this directory are not part of the wire
reference. Treat the documents above as the normative protocol set.

---

## ◇ Quick orientation

At a high level:

1. The hub is discovered through mDNS or UDP broadcast.
2. The client sends `CALL_ME` over UDP.
3. The hub opens a TCP connection back to the client.
4. Most data is exchanged as framed binary messages on that TCP session.
5. Many requests return multi-frame bursts rather than one self-contained reply.

One important protocol characteristic is that text encoding is family-specific:
- many modern X1S/X2 families use UTF-16BE
- some WiFi/IP-specific flows use UTF-16LE
- older X1 traffic often uses ASCII or UTF-8-compatible text

Clients should therefore select string decoding based on the opcode family and
payload layout, not from a single global encoding rule.

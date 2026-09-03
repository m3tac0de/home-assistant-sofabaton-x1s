# Sofabaton X2 descriptive-payload protocol reference

Working notes for `IrScrutinizer/sofabaton-x2.xml`. The X2 hub stores some IR
codes as ASCII strings of the form

```
P:<token> R:<carrier-Hz> <field>:<value> <field>:<value> ...
```

These strings come from **Sofabaton's cloud catalog**, not from on-hub
processing. The X2 hub's learn-from-physical-remote flow stores codes in
**raw timing form only** (see `sofabaton-x.xml`); it does not promote learned
signals to the descriptive `P:` form. Descriptive strings exist only because
the cloud catalog ships them down to the hub when a user adds a known device
from Sofabaton's catalog.

The descriptive-format generator lives on Sofabaton's servers,
not in any client we can inspect.

## ◇ Implications for validation

> **Superseded 2026-09-03.** A second hub in IR learn mode facing the X2
> gives the paired-capture path this section says we lack: the X2 plays a
> descriptive string, the learner captures the photons, IrpTransmogrifier
> decodes them. See "Photon-verified results" and "Sharp family, solved"
> below; the paragraphs here are kept as the historical reasoning.

Because the hub cannot itself convert a raw capture into the descriptive form,
we have **no paired-capture path**. We cannot point an IR receiver at a
physical button and obtain both an IrScrutinizer IRP decode _and_ an X2
descriptive string for the same emission. Every descriptive string we see was
matched in Sofabaton's database to "this remote/this button" — and we
correlate it to an IrScrutinizer decode only by _separately_ looking up the
same remote model in IrScrutinizer's protocol/parameter database, hoping the
two databases agree on the capture.

The end-to-end validation for the exporter is therefore:

1. Take an IrScrutinizer/Pronto source signal.
2. Run it through the exporter to produce a descriptive string.
3. Push the string to the hub (payload editor Save, or the `persist_ir_blob` action).
4. Confirm the **physical device actually responds**.

Byte-equal matching against a known-good descriptive string from the cloud
catalog is a useful but lower-trust check, because cloud-catalog and
IrScrutinizer captures of the same remote model may legitimately differ.

That means there is no authoritative public mapping from IrScrutinizer's IRP
protocol names + parameter names to the X2 tokens and field set. We build it
empirically:

1. Capture a known-protocol signal on the X2 hub (or fetch one via the HA
   integration's `fetch_blob` action).
2. Decode the same source signal in IrScrutinizer to obtain its IRP form.
3. Diff the two representations. Record:
   - Token name on the X2 side (e.g. `Sharp` vs current XSL guess `Sharp3`).
   - Which fields are emitted, in what order.
   - For each computed field (checksum-style), the formula expressed in terms
     of the IRP parameters.

Two samples per protocol with deliberately different `D` and `F` values are
usually enough to pin down 8-bit one's-complement checksums and packed-field
shapes. Add a third if anything stays ambiguous.

## ◇ General format observations

- Order of fields appears stable per protocol but varies between protocols.
- `R:` is the carrier frequency in Hz (matches Girr's `@frequency`).
- Numeric fields are plain decimal, no leading zeros.
- Boolean-ish flags (`C0`, `C1`, `T`) appear when the protocol has multiple
  frame halves or a toggle bit.
- The X2 hub also accepts the raw X-series timing format (see
  `sofabaton-x.xml`). The descriptive format is preferred when the hub can
  decode the signal against a protocol it recognizes.

## ◇ Per-protocol status

Legend:

- 🟢 **verified** — sample-confirmed against the current XSL emission
- 🟡 **partial** — emitted by XSL, fields look plausible, no hub sample yet
- 🔴 **mismatch / unknown** — at least one known-sample discrepancy with XSL
- ⚪ **untouched** — XSL doesn't emit this protocol yet

### Sharp family — SOLVED 🟢 (2026-09-03, photon-verified)

Three cloud-catalog Sharp devices (TV, audio, Blu-ray) on the X2 gave
69 distinct `P:Sharp2` and 66 `P:SharpDVD` strings. Every one was
played through the loopback rig and decoded from photons; a bit-level
fit of the X2 fields against the transmitted frame, plus synthesized
probes, gives the exact mapping. See "Sharp family, solved" at the end
of this file for the transform and the token semantics. The XSL emits:

- IRP `Sharp` / `Sharp{1}` / `Sharp{2}` with **odd D** -> `P:Sharp2`
- IRP `Denon` with **even D** -> `P:Sharp`
- IRP `SharpDVD` -> `P:SharpDVD`

The other parity is not expressible with any X2 token (the token pins
the first frame bit); those signals fall through to the raw exporter.
The notes below are the historical working record; the "Sharp3" token
(single frame, first bit 1) is not used by the exporter.

The X2 emits **two different protocol tokens for Sharp-family signals**, with
different field sets. The current XSL only emits `Sharp3`.

**`P:Sharp3` (simple form, 3 fields)** — confirmed against two samples:

```
P:Sharp3 R:38000 D:3 F:250 C0:1
P:Sharp3 R:38000 D:3 F:118 C0:0
```

XSL emits exactly this field set. ✓

**`P:Sharp` (extended form, 7 fields)** — one sample, IRP source not yet
cross-referenced:

```
P:Sharp R:38000 D:1 F:61 C0:0 D_CHECKSUM:17 F_CHECKSUM:194 C1:1 D0:17
```

Field analysis (from the single sample):

- `F_CHECKSUM:194` with `F:61` → `255 - 61 = 194`, matches `sb-not8`.
- `D0:17` with `D:1` → 17 = `0b00010001`. Probably the wire-encoded address
  byte (D5 + expansion bit + check bit). Need a second sample with `D > 1`
  to confirm the bit packing.
- `D_CHECKSUM:17` equals `D0:17` for D=1. Coincidence-suspect at low D.
- `C0:0 C1:1` plausibly identify the check-bit pair across Sharp's double
  frames.

Open question: **which IRP protocol name(s) trigger `Sharp` vs `Sharp3` on the
X2?** Current XSL maps `Sharp`, `Sharp{1}`, `Sharp{2}` all to `Sharp3`. One of
those (most likely the unqualified `Sharp` with its double-frame structure)
should probably emit the extended `P:Sharp` form instead.

**`P:Sharp2` (extended form, 7 fields)** — one sample with paired IRP decode:

```
X2:           P:Sharp2 R:38000 D:16 F:116 C0:2 D0:0 F0:139 C1:1
IrScrutinizer: Sharp {D=1, F=23},
               IRP {38k,277,msb}<...>(A:15,1,-46m,B:15,1,-46m,C:15,1,-46m)
                   {A=0x43a2, B=0x405d, C=0x43a2}
```

**Major finding — bit packing of the wire word.** Decomposing
`A = 0x43a2 = 0b100_00110_111010_0010` as **D(5) + F(8) + C0(2)** MSB-first:

```
1 0000 | 0111 0100 | 10
D=16     F=116       C0=2
```

That matches the X2's `D:16 F:116 C0:2` exactly. So **Sharp2's `D` and `F`
are the raw wire-bit fields**, not bit-reversed.

IrScrutinizer's `D=1, F=23` for the same signal are a _different_ convention.
`D=1` is the 5-bit reverse of 16 (`10000 ↔ 00001`). `F=23 = 0010111` is the
7-bit reverse of `116 = 1110100`. So IrScrutinizer is using LSB-first /
bit-reversed reporting, while the X2 reports the MSB-first packed value.

Direct conversion rule (provisional, one sample):

- `D_x2 = bit_reverse_5(D_irp)`
- `F_x2 = bit_reverse_8(F_irp)` (the 7-bit reverse coincidence above is
  presumably the 8-bit reverse with the high bit zero — needs a second
  sample with `F > 127` to confirm)
- `C0_x2` is the low 2 bits of the first frame's wire word. Not derivable
  from `D`/`F` alone; depends on the protocol's literal-bit fields. We don't
  yet know what determines this from the IRP parameters (it's `2` for A in
  this sample; could be a fixed protocol marker or a frame index).
- `D0`, `F0`, `C1` derive from the second frame `B = 0x405d`. The bit
  decomposition of B does not obviously yield `D0:0 F0:139 C1:1`, so we
  need at least one more Sharp2 sample to figure out the second-frame
  encoding.

Open: which IRP names trigger which X2 token? Hypothesis based on shape:

- IrpTransmogrifier `Sharp` (the double-frame variant) → likely X2 `Sharp` or
  `Sharp2`.
- IrpTransmogrifier `Sharp{1}` / `Sharp{2}` (single-half) → likely X2
  `Sharp3` (simple form, just `D F C0`).
- The Sharp2 IRP in this sample is **three-frame**
  `(A:15,1,-46m,B:15,1,-46m,C:15,1,-46m)` — not standard double Sharp.
  This appears to be `Sharp2` in IrpTransmogrifier's naming as well, but
  we should confirm by looking up the protocol in the IrScrutinizer protocol
  list.

Paired-capture is **not possible** — the hub never produces descriptive
strings from learned signals (see "Implications for validation" at the top
of this document). So the only path forward for Sharp is:

1. Collect more `P:Sharp` / `P:Sharp2` / `P:Sharp3` strings from the cloud
   catalog (looking up different Sharp remote models in the Sofabaton app)
   alongside the same models' Pronto/Girr entries from IrScrutinizer's
   database. Each gives us a candidate paired sample, modulo
   database-mismatch risk.
2. Once we have enough samples to propose a `bit_reverse_5(D)` /
   `bit_reverse_8(F)` mapping plus second-frame derivation rules, prototype
   the XSL emission and **send the result to a real Sharp TV via
   `persist_ir_blob`** — physical response is the truth test.

Action: do not modify the XSL Sharp mapping yet. Collect 1–2 more
`P:Sharp2` samples (different `D` and `F`, ideally with `F > 127`) and at
least one matched `P:Sharp` sample (the original extended 7-field form)
before changing anything. The current XSL emits `P:Sharp3` for everything
Sharp-shaped, which is correct for Sharp3-shaped IRPs but silently produces
the wrong token for IRPs that should map to `Sharp` or `Sharp2`.

### NEC 🟡

XSL emits `P:NEC D:<D> S:<S> F:<F>`. No NEC sample yet (NECx confirmed
separately). NEC is the most commonly captured protocol; should be easy to
confirm with a TV power button. Likely correct given NECx is.

### NECx 🟢

XSL emits `P:NECx D:<D> S:<S> F:<F>`. Confirmed against two samples:

```
P:NECx R:38400 D:7 S:7 F:96
P:NECx R:38400 D:7 S:7 F:26
```

### Sony12 🟢

XSL emits `P:Sony12 D:<D> F:<F> MUL:2`. Confirmed against three samples:

```
P:Sony12 R:40000 D:1 F:116 MUL:2
P:Sony12 R:40000 D:1 F:117 MUL:2
```

`MUL:2` appears to be a fixed protocol-level constant, not a configurable
repeat count.

### Sony15 🟡

XSL emits `P:Sony15 D:<D> F:<F> MUL:2`. No sample yet. Plausibly correct by
analogy with Sony12.

### Sony20 🟢

XSL emits `P:Sony20 D:<D> S:<S> F:<F> MUL:2`. Confirmed:

```
P:Sony20 R:40000 D:26 S:226 F:59 MUL:2
```

### Denon-K 🟡

XSL emits `P:DenonK R:<freq> C0:84 C1:50 C2:0 D:<D> S:<S> F:<F> CHECKSUM:<x>`
with `CHECKSUM` computed via `sb-denonk-checksum`. The `C0:84 C1:50 C2:0`
constants are suspect — they look like an artifact from one particular
example capture rather than protocol invariants. Need a hub sample to
confirm whether those are universal or vary per command.

### Panasonic 🟢 (photon-verified without `MUL:1`)

XSL emits `P:Panasonic C0:2 C1:32 D:<D> S:<S> F:<F> CHECKSUM:<x>` since
2026-09-03: the cloud-sample form with a trailing `MUL:1` is never acked
by the hub's play path (7/7 rejections), while the same string without
it is acked and emits exactly Panasonic {D,S,F}. Cloud samples for
byte comparison:

```
P:Panasonic R:37000 C0:2 C1:32 D:128 S:0 F:74 CHECKSUM:202 MUL:1
P:Panasonic R:37000 C0:2 C1:32 D:128 S:0 F:79 CHECKSUM:207 MUL:1
```

Checksum is `D ⊕ S ⊕ F` (matches `sb-panasonic-checksum`):

- 128 ⊕ 0 ⊕ 74 = 0xCA = 202 ✓
- 128 ⊕ 0 ⊕ 79 = 0xCF = 207 ✓

`C0:2 C1:32` are genuine protocol-level constants.

### Kaseikyo 🟡

XSL emits `P:Kaseikyo M:<M> N:<N> X:<X> D:<D> S:<S> F:<F> E:<E> C:<C>`. No
hub sample yet.

### Bose 🟢 (photon-verified as `F:` only)

XSL emits `P:Bose F:<F>` since 2026-09-03: with `F_CHECKSUM` present the
hub emits a stale F (loopback bench), the bare form emits exactly
Bose {F}. Cloud samples for byte comparison:

```
P:Bose R:38000 F:1  F_CHECKSUM:254
P:Bose R:38000 F:84 F_CHECKSUM:171
P:Bose R:38000 F:76 F_CHECKSUM:179
```

`F_CHECKSUM` is `255 - F` (8-bit one's complement), matching the `sb-not8`
helper.

### Logitech 🟡

XSL emits `P:Logitech D:<D> D_CHECKSUM:<~D 4-bit> F:<F> F_CHECKSUM:<~F 8-bit>`.
The same field names appear in the Sharp sample, suggesting these are X2-wide
field-naming conventions. Need a Logitech sample to confirm.

### DirecTV1 🟢

XSL emits `P:DirecTV1 D:<D> F:<F> CHECKSUM:<x>` with the `sb-directv-checksum`
helper. Confirmed:

```
P:DirecTV1 R:40000 D:12 F:32 CHECKSUM:10
```

Verification: for F=32, `b6=0, b4=2, b2=0, b0=0`, so
`7·0 + 5·2 + 3·0 + 0 = 10` ✓.

### RC5 🟢

XSL emits `P:RC5 CHECKSUM:1 T:<T or 0> D:<D> F:<F> MUL:1`. Confirmed against
three samples:

```
P:RC5 R:36000 CHECKSUM:1 T:0 D:0 F:28 MUL:1
P:RC5 R:36000 CHECKSUM:1 T:0 D:0 F:46 MUL:1
P:RC5 R:36000 CHECKSUM:1 T:1 D:0 F:32 MUL:1
```

`CHECKSUM:1` does appear hardcoded; `T` varies as expected.

### RC6 🟢

XSL emits `P:RC6 D:<D> F:<F> MUL:1`. Confirmed against two samples:

```
P:RC6 R:36000 D:4 F:90  MUL:1
P:RC6 R:36000 D:4 F:131 MUL:1
```

### RC6620 🟢

XSL emits `P:RC6620 C0:1 M:6 T:<T or 0> D:<D> S:<S> F:<F>`. Confirmed against
two samples:

```
P:RC6620 R:36000 C0:1 M:6 T:0 D:5 S:12 F:88
P:RC6620 R:36000 C0:1 M:6 T:0 D:5 S:12 F:90
```

`C0:1 M:6` are genuine protocol-level constants (not artifacts), as suspected
above is now refuted.

### Samsung20 🟢 / Samsung32 → NECx

Samsung20: XSL emits `D:<D> S:<S> F:<F>`; photon-verified exact for
F = 23, 24, 33, 100 (F:2 reproducibly emits F=222, open).

Samsung32: the `P:Samsung32` token is silent on the hub (seven attempts,
2026-09-03). The signal is NECx with S = D, so the XSL maps the
Samsung32 IRP to the `NECx` token since 2026-09-03 (photon-verified
exact as NECx-f16).

### Samsung36 🟢

XSL emits `P:Samsung36 D:<D> S:<S> E:<E> F:<F> CHECKSUM:<~F>`. Confirmed:

```
P:Samsung36 R:37900 D:32 S:0 E:7 F:24 CHECKSUM:231
P:Samsung36 R:37900 D:32 S:0 E:7 F:23 CHECKSUM:232
```

`CHECKSUM` is `255 - F` (same as `F_CHECKSUM` in Bose/Sharp; the field name
just differs).

### SamsungSMTG 🟢

XSL emits `P:SamsungSMTG D:<D> S:<S> F:<F>`. Confirmed:

```
P:SamsungSMTG R:38500 D:1024 S:14 F:6375
P:SamsungSMTG R:38500 D:1024 S:14 F:50235
```

### JVC 🟡

XSL emits `P:JVC D:<D> F:<F>`. JVC has a known repeat-frame quirk; verify
no extra field is needed.

### Protocols not currently emitted ⚪

XSL silently drops anything not in `map-protocol-name`. Known to exist on the
X2 (from anecdotal mentions) but unverified: Mitsubishi, Pioneer, Toshiba,
Sharp{1}/Sharp{2} variants, NEC42 / NEC42ext, Apple. Treat each as untouched
until a hub sample arrives.

## ◇ Workflow for adding a new sample

1. Capture or fetch the descriptive string from the hub. Note the
   device/button (helps disambiguate identical-looking strings).
2. Run the source Pronto/Girr through IrScrutinizer's "Analyze → Decode IR"
   to get the IRP form and parameter set.
3. Add a row to the relevant section above:
   - "Sample N (<device/button>): `P:... R:...`"
   - "IRP: `<protocol> {D=<d>, F=<f>, ...}`"
   - Note any field that doesn't match the current XSL formula.
4. If the new sample contradicts a 🟡 entry, downgrade to 🔴 and document the
   discrepancy. Update `sofabaton-x2.xml` only after 2+ confirming samples.

## ◇ Things we know definitively

- Token names use IrpTransmogrifier-style names with hyphens stripped (best
  evidence: `Samsung-SMT-G` → likely `SamsungSMTG`, `Denon-K` → likely
  `DenonK`), but exceptions exist (`Sharp` is bare, not `Sharp3` as the XSL
  guesses).
- `R:` is carrier frequency in Hz, matching Girr `@frequency`.
- `F_CHECKSUM` is 8-bit one's complement of `F` (verified by Sharp sample).
- `D_CHECKSUM` / `F_CHECKSUM` field names are reused across multiple
  protocols, so the same helper templates in the XSL should be reusable.
- The X2 also accepts the raw timing format from `sofabaton-x.xml` as a
  fallback for any signal that doesn't decode to a known protocol.

## ◇ Things we explicitly do NOT know

- Whether the X2 hub validates field order or treats it as an unordered map.
- Whether unknown/extra fields are tolerated or rejected.
- The exact bit packing for `D0` in Sharp (and analogous fields in other
  protocols).
- Whether `MUL:` is the X2 repeat count or a fixed protocol-level constant.
- The full list of tokens the X2 accepts.

## ◇ Photon-verified results (loopback bench, 2026-09-03)

The "no paired-capture path" premise above is now obsolete for
validation purposes: with the X2 emitting into an X1S in IR learn mode
(`scripts/hub-bench/bench_160_ir_loopback.py`, `descrsweep` mode), a
descriptive string is judged by what actually leaves the LED, decoded
by IrpTransmogrifier. Results below come from the clean-state protocol
(a raw-blob play before every string, a known-good NECx canary after
it); see "Parser state" first, because it invalidates naive sweeps.

### Parser state (hub firmware behaviour, important)

- The X2's descriptor parser keeps field values **across one-shot plays**
  (family 0x0F). Some strings leave stale fields behind: every later
  string then emits with the correct token and `D` but the previous
  `S`/`F` (observed: NECx D:7 S:7 F:96 emitting D=7 S=0 F=74 after a
  Panasonic/Kaseikyo string; Samsung20 emitting F=74 for F:1/3/22/23).
- Strings that left the parser clean: NEC, NECx, Sony12/15, JVC, RC6,
  DirecTV1, Sharp, Sharp2, Sharp3, Samsung20, and an unknown token.
- Strings that left it wedged: Panasonic (with `MUL:1`), Kaseikyo,
  DenonK, Bose, RC5, RC6620, Samsung36, SamsungSMTG, Logitech, Sony20
  (`MUL:2` carried over: the next NECx went out as 3 frames).
- **A raw-timing blob play clears the state** (all fields re-parse
  correctly immediately after). Field order inside a string does not
  matter (`F S D` and `D S F R` parsed identically).
- **Stored commands are NOT affected** (established with the cloud Sharp
  devices, 2026-09-03): firing stored commands via `send_command` (the
  remote's path) always emitted the right code, before and after a
  wedging one-shot play, and a stored multi-field command (SharpDVD)
  did not wedge a following one-shot play. Stored commands do not
  clear a wedge either. The state is confined to the family-0x0F
  one-shot play path, i.e. the payload editor's Test button and the
  bench; the HA emitter entity sends raw timing blobs and is never
  touched by it.
- **A reboot does not change it** (2026-09-03, X2 power-cycled by the
  user): the first one-shot play after boot was clean, a one-shot
  SharpDVD then wedged the next play exactly as before, a stored
  command in between was exact and did not clear it, and a raw play
  did. Firmware behaviour of the play path, not a corrupted state.
- **A silent reset exists** (2026-09-03). What clears the state is a raw
  play with at least **8 timing words**; content and carrier are
  irrelevant (6 words, 4 words, 1 word and an empty body do not clear it;
  8, 10, 12 words of anything do). Marks of 1 us must be avoided: they
  radiate a burst and left the *next* emission undecodable. The chosen
  reset payload is four 20 us blips 5 ms apart at a 65 kHz carrier:

  ```
  00 20 00 00 00 00 fd e8  00 00 00 14 00 00 13 88  00 00 00 14 00 00 13 88
  00 00 00 14 00 00 13 88  00 00 00 14 00 00 13 88  00 00 00 00
  ```

  Verified 3/3 after a wedge (the next NECx play exact), harmless on a
  clean parser, and the plays after it (NECx, Sony12 at 40 kHz) were
  exact. A 38 kHz receiver in learn mode reports only "energy,
  undecodable" for it: no frame, no protocol, nothing a device decoder
  can act on, and the carrier is outside every consumer IR band.
- **Shipped** (2026-09-03): `play_ir_blob` plays this reset before every
  `P:` payload when the hub is an X2 (`X2_PARSER_RESET_TIMINGS_US` in
  lib/blob_decoders.py, `x2_parser_reset_blob()` in lib/proxy_ir_blob.py;
  raw payloads and X1/X1S are untouched). Validated on the deployed HA:
  a NECx played right after a SharpDVD through the `play_ir_blob`
  action decodes exactly, where it inherited SharpDVD's fields before.

### Per-token results (clean state)

| Descriptor | Photons | Decode (IrpTransmogrifier) | Note |
| --- | --- | --- | --- |
| `P:NECx R:38400 D:7 S:7 F:96` | yes | NECx-f16 D=7 S=7 F=96 | exact, canary string |
| `P:NEC R:38000 D:4 S:251 F:8` | yes | NEC1 D=4 F=8 | exact (silent only in a wedged state) |
| `P:NEC R:38000 D:4 S:200 F:8` | yes | NEC1 D=4 S=200 F=8 | extended address honoured |
| `P:Samsung32 R:38000 D:7 S:7 F:2` | **no** | - | token silent on 7 attempts; use NECx |
| `P:Samsung20 R:38000 D:7 S:7 F:23` | yes | Samsung20 D=7 S=7 F=23 | exact (also 24, 33, 100) |
| `P:Samsung20 R:38000 D:7 S:7 F:2` | yes | Samsung20 D=7 S=7 F=222 | F:2 reproducibly emits 222 (open) |
| `P:JVC R:38000 D:3 F:23` | yes | JVC D=3 F=23 | exact (also 100) |
| `P:Sony12 R:40000 D:1 F:116 MUL:2` | yes | Sony12 D=1 F=116, 3 frames | `MUL:2` = 2 repeats (3 frames) |
| `P:Sony15 R:40000 D:1 F:116 MUL:2` | yes | Sony15 D=1 F=116, 3 frames | exact |
| `P:Sony20 R:40000 D:26 S:226 F:59 MUL:2` | yes | Sony20 D=26 S=226 F=59, 3 frames | exact; repeat count leaks to next string |
| `P:Panasonic R:37000 C0:2 C1:32 D:128 S:0 F:74 CHECKSUM:202 MUL:1` | **rejected** | - | hub never acks the play (7/7, also with a 4 s ack wait) |
| `P:Panasonic R:37000 C0:2 C1:32 D:128 S:0 F:74 CHECKSUM:202` | yes | Panasonic D=128 S=0 F=74 | exact once `MUL:1` is dropped; wedges parser |
| `P:Panasonic R:37000 D:128 S:0 F:74 CHECKSUM:202 MUL:1` | yes | Panasonic D=128 S=0 F=74, 2 frames | `MUL:1` fine without C0/C1 |
| `P:Kaseikyo R:37000 M:2 N:32 X:0 D:128 S:0 F:74 E:0 C:0` | **no** | - | XSL form silent; wedges parser |
| `P:DenonK R:37000 C0:84 C1:50 C2:0 D:4 S:1 F:949 CHECKSUM:42` | yes | Denon-K D=4 S=1 F=949 | exact (XSL header sample) |
| `P:Bose R:38000 F:84 F_CHECKSUM:171` | yes | Bose F=74 (stale) | `F_CHECKSUM` breaks F parsing: emits a stale F; `P:Bose R:38000 F:84` alone is exact and clean |
| `P:DirecTV1 R:40000 D:12 F:32 CHECKSUM:10` | yes | DirecTV_P1 D=12 F=32 | exact |
| `P:RC5 R:36000 CHECKSUM:1 T:0 D:0 F:28 MUL:1` | state-dependent | RC5 D=0 F=28 when it fires | silent from a clean state (also without CHECKSUM/MUL); fired once after DirecTV1; leaves F=28 + 2 frames behind |
| `P:RC6 R:36000 D:4 F:90 MUL:1` | yes | RC6 D=4 F=90 | exact (also 91, 131, 218); T alternates per send |
| `P:RC6620 R:36000 C0:1 M:6 T:0 D:5 S:12 F:88` | yes | RC6-6-20 D=5 S=12 F=88 | exact; wedges parser |
| `P:Samsung36 R:37900 D:32 S:0 E:7 F:24 CHECKSUM:231` | yes | Samsung36 D=32 S=0 E=7 F=24 | exact; wedges parser |
| `P:SamsungSMTG R:38500 D:1024 S:14 F:6375` | yes | Samsung-SMT-G D=1024 S=14 F=6375 | exact (same signal as the Samsung36 sample) |
| `P:Logitech R:38000 D:1 D_CHECKSUM:14 F:5 F_CHECKSUM:250` | yes | Logitech D=1 F=5 | exact; wedges parser |
| `P:Sharp3 R:38000 D:3 F:118 C0:0` | yes | Sharp D=7 F=18 | NOT the IRP values, see below |
| `P:Sharp3 R:38000 D:5 F:100 C0:0` | yes | Sharp D=11 F=54 | " |
| `P:Sharp3 R:38000 D:3 F:250 C0:1` | yes | Sharp D=7 F=244 / Denon D=7 F=10 | " (two runs, complementary F) |
| `P:Sharp R:38000 D:1 F:61 C0:0 ...` | yes | Denon D=2 F=122, both halves | D and F doubled |
| `P:Sharp2 R:38000 D:16 F:116 C0:2 ...` | yes | Sharp D=1 F=23 | matches the paired IrScrutinizer decode above |
| `P:Bogus R:38000 D:1 F:2` | no | - | unknown token: acked, silent, parser clean |

### Sharp3 is not IRP `Sharp {D,F}` (XSL mapping is wrong on-air)

Transmitted bit strings (mark then space, 15 data bits + stop) for the
Sharp3 strings above:

```
D:3 F:250 C0:1 -> 11100 00101111 101
D:3 F:118 C0:0 -> 11100 01001000 101
D:5 F:100 C0:0 -> 11010 01101100 101
```

Read LSB-first as IrpTransmogrifier does: D = 2*D_x2 + 1 (3 -> 7,
5 -> 11) and F = (2*F_x2 mod 256), complemented in bits 1..7 when
`C0:0` (118 -> 236 ^ 254 = 18, 100 -> 200 ^ 254 = 54, 250 -> 244). The
`P:Sharp` 7-field form gives D = 2*D_x2, F = 2*F_x2 with both half
frames. So the X2 tokens carry the wire word shifted one bit relative
to the IRP parameters, with `C0` selecting the normal or complemented
half. This analysis was superseded the same day by the cloud-sample fit; the
exact mapping and the tokens the XSL now emits are in "Sharp family,
solved" at the end of this file.

### Consequences for the exporter

- `P:Samsung32` is dead on the hub: emit `P:NECx` for Samsung32 IRPs
  (identical signal) or fall back to raw.
- `P:Panasonic ... MUL:1` in the exact cloud-sample form is rejected by
  the play path; drop `MUL:1` (or the `C0/C1` pair) - verify what the
  stored-command path accepts before changing the XSL.
- Kaseikyo's XSL guess produces nothing; keep it raw until a hub sample
  arrives.
- Bose: drop `F_CHECKSUM` (the bare `F:` form is exact); with it the
  hub emits a stale F. RC5 fires only from some parser states; treat
  the XSL form as unverified and prefer raw for now.
- Photon-verified as emitted by the XSL forms: NECx, NEC, Sony12/15/20,
  JVC, RC6, RC6-6-20, DirecTV1, Denon-K, Samsung20 (F != 2), Samsung36,
  Samsung-SMT-G, Logitech, Panasonic (without MUL:1).

## ◇ Sharp family, solved (2026-09-03)

Source: three cloud-catalog Sharp devices added to the X2 (TV -> 69
distinct `P:Sharp2` strings; audio + Blu-ray -> 66 `P:SharpDVD`
strings), dumped with `scripts/hub-bench/bench_162_x2_cloud_dump.py`,
every string played on the X2 and captured by an X1S in learn mode
(`bench_160_ir_loopback.py descrsweep --reset-raw`), decoded with
IrpTransmogrifier, then a bit-level fit of the X2 fields against the
transmitted bits, confirmed with synthesized strings (canary-checked).

### The 15-bit family: one segmentation, three tokens

IRP `Sharp`: `{38k,264}<1,-3|1,-7>(D:5,F:8,1:2,1,^67m,(D:5,~F:8,2:2,1,^67m,D:5,F:8,1:2,...)`.
IRP `Denon`: same bits with trailer `0:2` and second frame `D, ~F, 3:2`.
Frame bits in transmit order (LSB-first per IRP): tx0..tx4 = D,
tx5..tx12 = F, tx13..tx14 = trailer.

The X2 fields are a one-bit-offset reading of that frame (bit fit over
69 cloud strings, both frames):

| X2 field | frame-1 bits |
| --- | --- |
| `D` bit k (k = 0..3) | tx[1+k] (= IRP D bits 1..4) |
| `D` bit 4 | tx5 (= IRP F bit 0) |
| `F` bits 0..6 | NOT tx[6..12] (= ~IRP F bits 1..7) for Sharp2; tx[6..12] un-inverted for `Sharp` |
| `F` bit 7, `C0` bit 0 | tx14 (trailer check bit) |
| `C0` bit 1 | tx0 (= IRP D bit 0) - but pinned by the token, see below |
| `D0`, `F0`, `C1` | the same reading of frame 2 (D0 = D xor 16, F0 = 255 - F, C1 = 1) |

The token pins tx0 and the trailer:

| Token | tx0 (IRP D bit 0) | trailer | frames | = IRP |
| --- | --- | --- | --- | --- |
| `P:Sharp2` | 1 (whatever C0 says) | 1:2 / 2:2 | 2 | **Sharp, odd D** |
| `P:Sharp` | 0 | 0:2 / 3:2 | 2 | **Denon, even D** |
| `P:Sharp3` | 1 | 1:2 | 1 | single Sharp half, odd D (not used) |

Synthesized probes: Sharp2 with C0:0 still emitted odd D (D=2 -> 3,
D=0 -> 1, D=12 -> 13); `P:Sharp` with the same fields emitted the even
D exactly, decoded as Denon (D=2, 12, 0, 30 all exact).

### Inverse transform (what the XSL emits)

IRP Sharp {D odd, F}:

```
Dx = ((D >> 1) & 15) | ((F & 1) << 4)
Fx = 127 - ((F >> 1) & 127)
P:Sharp2 R:38000 D:Dx F:Fx C0:2 D0:(Dx ^ 16) F0:(255 - Fx) C1:1
```

IRP Denon {D even, F}:

```
Dx = ((D >> 1) & 15) | ((F & 1) << 4)
Fx = (F >> 1) & 127
P:Sharp R:38000 D:Dx F:Fx C0:0 D_CHECKSUM:(Dx ^ 16) F_CHECKSUM:(255 - Fx) C1:1 D0:(Dx ^ 16)
```

Check against the paired sample recorded above: Sharp {D=1, F=23} ->
`P:Sharp2 R:38000 D:16 F:116 C0:2 D0:0 F0:139 C1:1`, byte-identical to
the cloud's "Power toggle". The inverse reproduces all 63 decodable
cloud strings; the 6 cloud strings with `C0:3 C1:0` (F >= 128 in X2
terms) carry the complemented half first and do not decode as Sharp
in IrpTransmogrifier, though the hub emits them as stored.

Photon-verified synthesized cases: Sharp {1,23} {17,75} {1,200}
{31,255} {5,64}; Denon {2,23} {12,129} {0,0} {30,255}. Sharp2 and
Sharp leave the descriptor parser clean.

### SharpDVD

`P:SharpDVD R:38000 C0:170 C1:90 C2:15 D:<D> S:<S> F:<F> E:<E> CHECKSUM:<C>`
maps 1:1 onto IRP `SharpDVD`
(`{38k,400}<1,-1|1,-3>(8,-4,170:8,90:8,15:4,D:4,S:8,F:8,E:4,C:4,1,-48)*`,
`C = D ^ S:4:0 ^ S:4:4 ^ F:4:0 ^ F:4:4 ^ E`). C0/C1/C2 are the
protocol's fixed header, CHECKSUM is the nibble XOR. 28 cloud strings
(two devices, S = 116 and 48) plus synthesized {D=3,S=200,F=77,E=2} and
{D=15,S=1,F=255,E=0} decoded exactly. The token leaves the descriptor
parser wedged (stale D/S/F for the next one-shot play), like the
other multi-field tokens.

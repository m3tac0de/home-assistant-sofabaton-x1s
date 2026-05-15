# Sofabaton X2 descriptive-blob protocol reference

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

This was confirmed by exhausting the decompiled APK for protocol-name strings
(none found) and for `P:` / `CHECKSUM:` / `D_CHECKSUM` / `F_CHECKSUM` literals
(none found). The descriptive-format generator lives on Sofabaton's servers,
not in any client we can inspect.

## Implications for validation

Because the hub cannot itself convert a raw capture into the descriptive form,
we have **no paired-capture path**. We cannot point an IR receiver at a
physical button and obtain both an IrScrutinizer IRP decode *and* an X2
descriptive string for the same emission. Every descriptive string we see was
matched in Sofabaton's database to "this remote/this button" — and we
correlate it to an IrScrutinizer decode only by *separately* looking up the
same remote model in IrScrutinizer's protocol/parameter database, hoping the
two databases agree on the capture.

The honest end-to-end validation for the exporter is therefore:

1. Take an IrScrutinizer/Pronto source signal.
2. Run it through the exporter to produce a descriptive string.
3. Push the string to the hub via `persist_ir_blob`.
4. Confirm the **physical device actually responds**.

Byte-equal matching against a known-good descriptive string from the cloud
catalog is a useful but lower-trust check, because cloud-catalog and
IrScrutinizer captures of the same remote model may legitimately differ.

That means there is no authoritative public mapping from IrScrutinizer's IRP
protocol names + parameter names to the X2 tokens and field set. We build it
empirically:

1. Capture a known-protocol signal on the X2 hub (or fetch one via the HA
   integration's `fetch_blob` action / proxy logs).
2. Decode the same source signal in IrScrutinizer to obtain its IRP form.
3. Diff the two representations. Record:
   - Token name on the X2 side (e.g. `Sharp` vs current XSL guess `Sharp3`).
   - Which fields are emitted, in what order.
   - For each computed field (checksum-style), the formula expressed in terms
     of the IRP parameters.

Two samples per protocol with deliberately different `D` and `F` values are
usually enough to pin down 8-bit one's-complement checksums and packed-field
shapes. Add a third if anything stays ambiguous.

## General format observations

- Order of fields appears stable per protocol but varies between protocols.
- `R:` is the carrier frequency in Hz (matches Girr's `@frequency`).
- Numeric fields are plain decimal, no leading zeros.
- Boolean-ish flags (`C0`, `C1`, `T`) appear when the protocol has multiple
  frame halves or a toggle bit.
- The X2 hub also accepts the raw X-series timing format (see
  `sofabaton-x.xml`). The descriptive format is preferred when the hub can
  decode the signal against a protocol it recognizes.

## Per-protocol status

Legend:

- 🟢 **verified** — sample-confirmed against the current XSL emission
- 🟡 **partial** — emitted by XSL, fields look plausible, no hub sample yet
- 🔴 **mismatch / unknown** — at least one known-sample discrepancy with XSL
- ⚪ **untouched** — XSL doesn't emit this protocol yet

### Sharp family — at least THREE distinct X2 tokens 🟡

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

IrScrutinizer's `D=1, F=23` for the same signal are a *different* convention.
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

### Panasonic 🟢

XSL emits `P:Panasonic C0:2 C1:32 D:<D> S:<S> F:<F> CHECKSUM:<x> MUL:1`.
Confirmed against two samples:

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

### Bose 🟢

XSL emits `P:Bose F:<F> F_CHECKSUM:<~F>`. Confirmed against three samples:

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

### Samsung20 / Samsung32 🟡

XSL emits both with `D:<D> S:<S> F:<F>`. No samples yet.

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

## Workflow for adding a new sample

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

## Things we know definitively

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

## Things we explicitly do NOT know

- Whether the X2 hub validates field order or treats it as an unordered map.
- Whether unknown/extra fields are tolerated or rejected.
- The exact bit packing for `D0` in Sharp (and analogous fields in other
  protocols).
- Whether `MUL:` is the X2 repeat count or a fixed protocol-level constant.
- The full list of tokens the X2 accepts.

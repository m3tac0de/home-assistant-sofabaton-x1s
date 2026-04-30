# Data Structures

---

## Entity ID space

The hub uses a unified 8-bit entity ID namespace:

| Range    | Entity type | Notes |
|----------|-------------|-------|
| 1 – 99   | Devices     | Physical or virtual IR/IP devices |
| 101 – 255| Activities  | Activity index = ID − 100 |

IDs are transmitted as the **low byte** of the entity (8-bit). When a 16-bit entity
reference appears in a request frame, only the low byte is meaningful:

```
REQ_ACTIVATE payload: [entity_id_lo, key_code]
```

---

## Device catalog row (`CATALOG_ROW_DEVICE`, `0xD50B` / `0x7B0B`)

One frame per device, in a burst response to `REQ_DEVICES`:

```
 Byte  Field
    0  device_id   (1–99)
    1  brand_code  (brand classification byte)
    2  name_length (byte count of name that follows)
  3..  name        (UTF-8, length bytes)
    …  padding / additional metadata
```

The brand code is an internal Sofabaton classification; it is opaque in the
protocol (no known public mapping).

---

## Activity catalog row (`CATALOG_ROW_ACTIVITY`, `0xD53B` / `0x7B3B`)

One frame per activity, in a burst response to `REQ_ACTIVITIES`:

```
 Byte  Field
    0  activity_id  (101–255, low byte)
    1  active_flag  (0x01 = currently active, 0x00 = inactive)
    2  name_length
  3..  name (UTF-8)
    …  member device IDs and metadata
```

---

## Device button / command record

Command records are embedded in `DEVBTN_PAGE` frames. Multiple records can be packed
into a single frame, separated by `0xFF` bytes:

```
One chunk (between 0xFF separators):

 Byte   Field
    0   device_id   (lo byte of owning device)
    1   command_id  (1–255)
  2..8  control_block (7 bytes: IR code, protocol type, or zeros for IP commands)
  9..   label (UTF-16-LE or ASCII, zero-terminated or padded)
```

The **control block** format:
- For IR commands: bytes encode the raw IR signal protocol and address
- For IP commands: typically `\x00\x00\x00\x00\x00\x00\x00`
- The first byte `0x03` or `0x0D` indicates specific IR protocol variants
- All-zero bytes 0–4 indicate no IR code (virtual/IP device)

Label encoding heuristics (in priority order):
1. UTF-32-LE (detected by every 4th byte being `0x00`)
2. ASCII (bytes 0x20–0x7E, no nulls)
3. UTF-16-LE (interleaved nulls)
4. UTF-16-BE (fallback)
5. Latin-1 (last resort)

---

## Keymap record (from `REQ_BUTTONS` / KEYMAP_TBL responses)

Each record maps one remote button to a device command for a specific activity.
Records are 18 bytes, packed contiguously:

```
 Byte  Field
    0  act_lo          (activity ID low byte — validates record alignment)
    1  button_id       (ButtonName code, see button-codes table below)
    2  device_id       (device the button controls in this activity)
  3..9 padding / control bytes
    9  command_id      (command to send when button pressed)
   10  long_press_device_id  (0 if no long-press action)
 11..14 zeros (when long_press present)
   15  0x4E            (marker byte when long_press present)
   16  unused
   17  long_press_command_id (0 if no long-press action)
```

---

## Macro record

Macro records are returned as multi-frame bursts to `REQ_MACRO_LABELS`. Each record
associates a macro command ID with a human-readable label:

```
activity_id  (1 byte — the activity this macro belongs to)
command_id   (1 byte — macro slot number, 1-indexed)
label        (UTF-16-LE or ASCII, variable length)
```

Records are separated by parsing heuristics in the reassembled burst payload (no
explicit separator bytes).

---

## Activity favorites / keybinding slot

A favorites slot maps a remote button position to a device command for display in
the app's activity view:

```
button_id   (position on remote, may be 0 if unassigned)
device_id   (device that owns the command)
command_id  (the command to invoke)
source      ("keymap" or "activity_map" — which frame provided this data)
```

---

## IP command definition (Wifi Device creation)

Sent with `DEFINE_IP_CMD` (`0x0ED3`) during Wifi Device creation:

```
method_len   (1 byte)
method       (HTTP method, e.g. "POST", ASCII)
url_len      (1 byte)
url          (full HTTP URL, ASCII)
headers_len  (1 byte)
headers      (HTTP headers as key:value\n pairs, ASCII)
payload      (remaining bytes — HTTP request body)
```

Callback URL format used by the integration:
```
http://<proxy_host>:8060/sofabaton/callback?device_id=<N>&command_id=<M>
```

---

## ButtonName code table

Known button codes (decimal / hex):

| Hex    | Decimal | Name       |
|--------|---------|------------|
| `0x97` | 151     | C          |
| `0x98` | 152     | B          |
| `0x99` | 153     | A          |
| `0x9A` | 154     | EXIT       |
| `0x9B` | 155     | DVR        |
| `0x9C` | 156     | PLAY       |
| `0x9D` | 157     | GUIDE      |
| `0xAE` | 174     | UP         |
| `0xAF` | 175     | LEFT       |
| `0xB0` | 176     | OK         |
| `0xB1` | 177     | RIGHT      |
| `0xB2` | 178     | DOWN       |
| `0xB3` | 179     | BACK       |
| `0xB4` | 180     | HOME       |
| `0xB5` | 181     | MENU       |
| `0xB6` | 182     | VOL_UP     |
| `0xB7` | 183     | CH_UP      |
| `0xB8` | 184     | MUTE       |
| `0xB9` | 185     | VOL_DOWN   |
| `0xBA` | 186     | CH_DOWN    |
| `0xBB` | 187     | REW        |
| `0xBC` | 188     | PAUSE      |
| `0xBD` | 189     | FWD        |
| `0xBE` | 190     | RED        |
| `0xBF` | 191     | GREEN      |
| `0xC0` | 192     | YELLOW     |
| `0xC1` | 193     | BLUE       |
| `0xC6` | 198     | POWER_ON   |
| `0xC7` | 199     | POWER_OFF  |

Codes `0x97`–`0x9D` appear only on X2 remotes (extended button set). All others are
shared across X1 / X1S / X2.

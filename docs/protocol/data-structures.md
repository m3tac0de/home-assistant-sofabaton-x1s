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

One frame per device, in a burst response to `REQ_DEVICES`.

Observed layouts are **version-specific** and should be parsed as fixed-position
records rather than short `[id][len][name]` tuples:

- X1S / X2 (`0xD50B`): device ID is observed at payload bytes `6..7`; name and brand
  are stored in fixed-width text regions and are commonly decoded as **UTF-16 BE**
- X1 (`0x7B0B`): device ID is also observed at payload bytes `6..7`; name and brand
  are stored in later fixed-width regions and are commonly decoded as **UTF-8**

The exact meaning of several surrounding bytes remains undocumented.

---

## Activity catalog row (`CATALOG_ROW_ACTIVITY`, `0xD53B` / `0x7B3B`)

One frame per activity, in a burst response to `REQ_ACTIVITIES`.

Observed layouts are again **version-specific**:

- activity ID is observed at payload bytes `6..7`
- an active-state byte is observed near offset `35`
- X1S / X2 activity labels are commonly decoded from a fixed text region using
  **UTF-16 BE**
- X1 activity labels are commonly decoded from a later **UTF-8** region

Some rows also carry a `needs_confirm` style flag, but its exact schema is still
heuristic.

---

## Device button / command record

Command records are embedded in `DEVBTN_PAGE` frames. Multiple records are often
packed into a single frame, commonly separated by `0xFF` bytes, but there are
important variants.

```
One chunk (between 0xFF separators):

 Byte   Field
    0   device_id   (lo byte of owning device)
    1   command_id  (1–255)
  2..8  control_block (7 bytes: IR code, protocol type, or zeros for IP commands)
  9..   label (encoding varies by record type)
```

The **control block** format:
- For IR commands: bytes encode the raw IR signal protocol and address
- For IP commands: typically `\x00\x00\x00\x00\x00\x00\x00`
- The first byte `0x03` or `0x0D` indicates specific IR protocol variants
- All-zero bytes 0–4 indicate no IR code (virtual/IP device)

Observed label encoding heuristics:
1. UTF-32-LE (detected by every 4th byte being `0x00`)
2. ASCII (bytes 0x20–0x7E, no nulls)
3. UTF-16-BE
4. Other misaligned or padded variants
5. Latin-1 (last resort)

Known variants:

- some command pages use alternate opcodes with shifted payload offsets
- some X2 Wifi-device command pages use fixed-width 70-byte records with no `0xFF`
  separators
- labels are not uniformly UTF-16 LE

---

## Keymap record (from `REQ_BUTTONS` / KEYMAP_TBL responses)

The `REQ_BUTTONS` burst is assembled by `DeviceButtonAssembler` into a contiguous row stream
delivered to `ActivityCache.replace_keymap_rows()`. The stream contains two distinct row types
in order: **activity favorite slots first**, then **physical-button mappings**. Both types
share the same 18-byte layout; the parser distinguishes them by `button_id`.

### Row type 1 — Activity favorite slot

`button_id` is **not** a known ButtonName code (i.e. not in `0x97–0x9D` or `0xAE–0xC7`).
It is a hub-internal slot index, typically in the range `0x01–0x20`. These rows appear before
any physical-button rows in the assembled stream. Once the first physical-button row is seen,
no further favorite rows are parsed.

### Row type 2 — Physical button mapping

`button_id` is a known ButtonName code. These rows populate `state.buttons[act_lo]` and
`button_details[act_lo]` for the activity.

### Byte layout (both row types)

```
 Byte   Field
    0   act_lo               (activity ID low byte — validates record alignment)
    1   button_id            (ButtonName code or hub slot index; determines row type)
    2   device_id            (device the button controls in this activity)
  3..8  control bytes        (purpose not yet fully characterized)
    9   command_id           (command to send when button is pressed)
   10   long_press_device_id (0 if no long-press action is configured)
 11..14 zeros                (required when a long-press action is present)
   15   0x4E                 (marker byte, present when long-press is configured)
   16   long_press_marker    (non-zero when long-press is configured)
   17   long_press_command_id (0 if no long-press action is configured)
```

`replace_keymap_rows()` also handles a trailing partial record at the end of the assembled
stream: if the final bytes start with the correct `act_lo` and a known ButtonName code, they
are padded to 18 bytes and parsed as a physical-button row.

---

## Macro record

Macro records are returned as multi-frame bursts to `REQ_MACRO_LABELS`. Two request
forms are currently known:

- `[act_lo, 0xFF]` — fetch macro labels for the activity as a burst
- `[act_lo, macro_button]` — fetch the backing payload for a specific macro button
  such as `POWER_ON` (`0xC6`) or `POWER_OFF` (`0xC7`)

The burst is assembled by `MacroAssembler` from frames classified as `"record_start"` or
`"continuation"` by `parse_macro_burst_frame()`. Record boundaries (byte offsets into the
assembled payload) are tracked from each `"record_start"` frame position and passed to
`decode_macro_records()` for label extraction.

Each macro record occupies a region of the assembled payload starting at a tracked boundary:

```
offset+0  command_id  (1 byte — macro slot number, 1-indexed within the activity)
offset+1+ record body (variable length — contains an 0xFF separator followed by a label)
```

Within the record body, the label is located after the last `0xFF` byte:
- If the byte immediately after `0xFF` is `0x00` with a non-zero following byte, the label
  is decoded as **UTF-16BE**.
- Otherwise, if the byte after `0xFF` is non-zero, the label is decoded as **ASCII**.
- If no `0xFF` is found, or these conditions are not met, a heuristic scan of the record
  body is used to locate a UTF-16LE, UTF-16BE, or ASCII label sequence.

`activity_id` is derived from the `"record_start"` frame's payload (byte 6), not from
within the record body itself.

---

## Activity favorites / keybinding slot

A cached favorite or keybinding slot maps a remote button position to a device
command for display in the app's activity view:

```
button_id   (position on remote, may be 0 if unassigned)
device_id   (device that owns the command)
command_id  (the command to invoke)
source      ("keymap" or "activity_map" — which frame provided this data;
             current protocol findings suggest new favorite slots primarily come
             from REQ_BUTTONS/keymap rows, while activity_map is mainly a
             membership roster)
```

---

## Favorites order response

The hub exposes a separate favorites-order response family used for reorder/delete
flows:

```
[01 00 01 01 00 01] [act_lo] [fav_id slot] × N
```

Each pair describes which hub-internal favorite identifier occupies which display
slot. This response belongs to family `0x63` and is triggered by `FAV_ORDER_REQ`
(`0x0162`).

---

## IP command definition (Wifi Device creation)

Sent with `DEFINE_IP_CMD` (`0x0ED3`) during Wifi Device creation. In observed
traffic this payload is preceded by a fixed-width UTF-16LE button label block, after
which the HTTP fields are encoded as:

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

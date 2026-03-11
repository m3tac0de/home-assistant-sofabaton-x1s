# Design: Power Corner & Persistent Hub Cache

**Status:** Design / Specification (no code yet)
**Branch:** `claude/restructure-lovelace-card-ZSP3L`

---

## 1. Goals

| Goal | Today | After |
|------|-------|-------|
| Access Key Capture | Requires edit mode | Corner long-press |
| Configure WiFi commands | Requires edit mode | Corner long-press |
| Add / delete / reorder favorites | No UI | Corner long-press |
| Map commands to physical buttons | No UI | Corner long-press |
| See hub state without 20-second wait | No cache | Persistent cache |

The **Power Corner** is a configurable corner zone on the card that, on long-press, opens a **Power Tools modal**. The modal hosts navigable tools that replace every reason a user needs to enter edit mode for day-to-day operation.

A **Persistent Cache** is the prerequisite: without it, loading command lists and keymap data from the hub is too slow (10–30 seconds per request) for any interactive editor to feel usable.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  SofabatonRemoteCard (Lovelace card)                    │
│                                                         │
│  ┌───────────────────┐  ┌─────────────────────────────┐ │
│  │  Remote buttons   │  │  .pt-corner (corner zone)   │ │
│  │  (unchanged)      │  │  long-press 600ms → modal   │ │
│  └───────────────────┘  └─────────────────────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  .pt-modal  (Power Tools modal, z-index 999)        │ │
│  │                                                     │ │
│  │  Tool List (root view):                             │ │
│  │    📶 Command Manager  →  Unified editor (see §6)   │ │
│  │    🎯 Key Capture      →  Automation assist (§7)    │ │
│  │    🔄 Sync Remote      →  Quick sync (§8)           │ │
│  │    📡 Find Remote      →  Hub beep (§9)             │ │
│  │    💾 Cache Manager    →  Refresh / status (§10)    │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

           ↕ WebSocket (new endpoints)

┌─────────────────────────────────────────────────────────┐
│  HA Backend  (sofabaton_x1s integration)                │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐ │
│  │  Persistent      │  │  Hub Proxy (x1_proxy.py)     │ │
│  │  Cache           │  │  • accumulate_keymap() ← NEW  │ │
│  │  (HA Store)      │  │    stores button→cmd targets  │ │
│  │                  │  │  • existing: devices, cmds,  │ │
│  │  device list     │  │    favorites, activities      │ │
│  │  cmds per device │  └──────────────────────────────┘ │
│  │  keymap per act  │                                   │
│  │  favorites/act   │  ┌──────────────────────────────┐ │
│  │  activity list   │  │  New WS endpoints (§11)      │ │
│  └─────────────────┘  │  sofabaton_x1s/cache/*        │ │
│                        │  sofabaton_x1s/find_remote    │ │
│                        └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Persistent Cache

### 3.1 Why It's Needed

- `REQ_COMMANDS` for a device with many commands takes 15–30 seconds
- `REQ_BUTTONS` (keymap per activity) takes 3–10 seconds
- `REQ_ACTIVITY_MAP` (favorites per activity) takes 2–5 seconds
- Hub fetches are sequential — a full hub scan (all devices × all activities) can take minutes
- Result: without caching, no interactive editor is feasible

The cache is populated **on demand** (user presses "Refresh Cache"), stored in HA's persistent storage, and reused until explicitly invalidated.

### 3.2 Cache Storage Schema

**Location:** `homeassistant.helpers.storage.Store`
- Key: `sofabaton_x1s.cache.{entry_id}` (one per hub/config entry)
- Format: JSON, versioned

```json
{
  "version": 1,
  "hub_mac": "AA:BB:CC:DD:EE:FF",
  "populated_at": "2025-10-15T12:34:56Z",
  "entities_populated": ["remote.living_room_hub"],

  "activities": {
    "101": { "name": "Watch TV" },
    "102": { "name": "Listen to Music" }
  },

  "devices": {
    "1": { "brand": "Samsung",  "name": "TV" },
    "2": { "brand": "Yamaha",   "name": "Receiver" }
  },

  "commands": {
    "1": {
      "populated_at": "2025-10-15T12:35:10Z",
      "commands": {
        "201": "Power",
        "202": "Volume Up",
        "203": "Volume Down"
      }
    }
  },

  "keymap": {
    "101": {
      "populated_at": "2025-10-15T12:35:15Z",
      "buttons": {
        "182": { "device_id": 1, "command_id": 201 },
        "185": { "device_id": 1, "command_id": 202 }
      }
    }
  },

  "favorites": {
    "101": {
      "populated_at": "2025-10-15T12:35:20Z",
      "slots": [
        { "slot": 0, "device_id": 1, "command_id": 201, "label": "Power" },
        { "slot": 1, "device_id": 2, "command_id": 301, "label": "Volume Up" }
      ]
    }
  },

  "activity_members": {
    "101": [1, 2],
    "102": [2]
  }
}
```

**Field notes:**
- `activities` and `devices` are cheap to populate (always available from startup)
- `commands[dev_id]` has its own `populated_at` so per-device staleness can be tracked
- `keymap[act_id]` and `favorites[act_id]` similarly timestamped per activity
- `slot` in favorites = the 0-indexed position in the activity's favorites list (for reordering)

### 3.3 Cache Population Flow

```
User taps "Refresh Cache"
    │
    ▼
WS: sofabaton_x1s/cache/refresh  {entity_id, scope: "full" | "commands" | "keymap" | "favorites"}
    │
    ▼
Backend starts async job, pushes progress via WS events:
  sofabaton_x1s/cache/progress  {step, total, message, status: "running"|"done"|"failed"}
    │
    ├─ Step 1: Activities + Devices (already in hub state, no fetch needed)
    │
    ├─ Step 2: Commands per device
    │    For each dev_id in devices:
    │      await hub._async_fetch_device_commands(dev_id)   ← existing method
    │      store in cache
    │
    ├─ Step 3: Keymap + Activity members per activity
    │    For each act_id in activities:
    │      await proxy.request_buttons(act_id)
    │      read enhanced_keymap[act_id]                      ← NEW state field
    │      store in cache
    │
    └─ Step 4: Favorites per activity
         For each act_id in activities:
           await proxy.request_activity_mapping(act_id)     ← existing call
           read activity_favorite_slots[act_id]              ← existing data
           store in cache
    │
    ▼
Cache saved to HA Store
WS push: sofabaton_x1s/cache/progress {status: "done"}
```

**Scope parameter** allows partial refresh (e.g., after the user adds a favorite, only refresh `favorites` scope).

### 3.4 Cache Invalidation

- **Manual only** (no TTL): the hub doesn't push change notifications to HA
- "Refresh" always overwrites the previous cache
- Editing via Power Tools → we update the cache optimistically on successful service call
- Cache is NOT cleared on integration restart (that would defeat the purpose)

### 3.5 Cache Status

WS endpoint `sofabaton_x1s/cache/status` returns:

```json
{
  "populated": true,
  "populated_at": "2025-10-15T12:34:56Z",
  "activities_count": 5,
  "devices_count": 8,
  "commands_devices_populated": 6,
  "commands_devices_total": 8,
  "keymap_activities_populated": 5,
  "keymap_activities_total": 5,
  "favorites_activities_populated": 5,
  "favorites_activities_total": 5
}
```

---

## 4. Backend: Enhanced Keymap Parsing

### 4.1 Current State

`state_helpers.py` maintains:
```python
self.buttons: Dict[int, set[int]] = {}
# activity_lo → set of button codes that have a mapping
```

`accumulate_keymap()` already parses 18-byte keymap records (from `OP_KEYMAP_TBL_*` responses). Each record contains:
- `act_lo` — activity ID (low byte)
- `button_id` — physical button code (e.g., 182 = VOL_UP)
- `device_id` — device that handles the button
- `command_id` — specific command on that device

Currently the handler stores only the button code (into `self.buttons`), discarding the device/command target.

### 4.2 Required Change: `enhanced_keymap`

**In `state_helpers.py`, add:**
```python
self.enhanced_keymap: dict[int, dict[int, dict]] = defaultdict(dict)
# {act_lo: {button_code: {"device_id": int, "command_id": int}}}
```

**In `accumulate_keymap()` (or alongside it), when processing each 18-byte record:**

If the button code is a known physical button (in `BUTTONNAME_BY_CODE`):
```python
self.enhanced_keymap[act_lo][button_id] = {
    "device_id": device_id,   # parsed from record bytes
    "command_id": command_id  # parsed from record bytes
}
```

If it's a favorite slot (button_id not in physical button set):
- already handled by `activity_favorite_slots` — no change needed

**Note:** The exact byte offsets for device_id and command_id within the 18-byte record need to be confirmed by reading `accumulate_keymap()` in detail. The explore report shows: `[act_lo, button_id, device_id, ?, ?, ?, ?, marker, ?, ?, ?, ?, pad..., command_id, pad...]` — review the parsing code carefully to confirm offsets before implementing.

### 4.3 New Getter

```python
def get_enhanced_keymap(self, act_lo: int) -> dict[int, dict]:
    """Return {button_code: {device_id, command_id}} for an activity."""
    return dict(self.enhanced_keymap.get(act_lo, {}))
```

---

## 5. Power Corner (Card Config & UX)

### 5.1 New Config Properties

Added to `SofabatonRemoteCard.setConfig()` defaults:

```js
show_power_tools: false,          // Enable Power Corner zone
power_tools_corner: 'br',         // 'tl' | 'tr' | 'bl' | 'br'
```

**Deprecation:** `show_automation_assist` is removed. Migration in `setConfig()`:
```js
if (this._config.show_automation_assist) {
  this._config.show_power_tools = true;
}
delete this._config.show_automation_assist;
```

### 5.2 Corner Zone DOM

Appended to `this._wrap` (the main card container):

```html
<div class="pt-corner pt-corner-br" aria-label="Power Tools">
  <ha-icon icon="mdi:wrench"></ha-icon>
</div>
```

**Positioning CSS:**
```css
.pt-corner {
  position: absolute;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; border-radius: 50%;
  opacity: 0.28; transition: opacity 180ms ease;
  z-index: 4;
  color: var(--primary-text-color);
  touch-action: none;  /* prevent scroll during long-press */
}
.pt-corner:hover, .pt-corner:focus-visible { opacity: 0.55; }
.pt-corner-tl { top: 6px; left: 6px; }
.pt-corner-tr { top: 6px; right: 6px; }
.pt-corner-bl { bottom: 6px; left: 6px; }
.pt-corner-br { bottom: 6px; right: 6px; }

/* Ring animation while holding */
@keyframes pt-ring-expand {
  from { transform: scale(1);   opacity: 0.6; }
  to   { transform: scale(2.5); opacity: 0;   }
}
.pt-corner.pt-holding::after {
  content: '';
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid var(--primary-color);
  animation: pt-ring-expand 600ms ease-out forwards;
}
```

### 5.3 Long-Press Detection

```js
_attachPtCorner(el) {
  let timer = null;
  let startX, startY;

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.classList.add('pt-holding');
    timer = setTimeout(() => {
      el.classList.remove('pt-holding');
      this._openPtModal();
    }, 600);
  });

  const cancel = (e) => {
    // Cancel if moved more than 8px (user is scrolling)
    if (e.type === 'pointermove') {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < 8) return;
    }
    clearTimeout(timer);
    el.classList.remove('pt-holding');
  };

  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointermove', cancel);
}
```

**Corner visibility:** controlled in `_update()` based on `this._config.show_power_tools`. Hidden in edit mode (edit mode is for layout-only config now).

---

## 6. Power Tools Modal

### 6.1 Structure

Appended directly to the card host element (outside `ha-card`), so it overlays correctly:

```html
<div class="pt-modal" role="dialog" aria-modal="true">
  <div class="pt-backdrop"></div>
  <div class="pt-dialog">
    <div class="pt-dialog-header">
      <button class="pt-back-btn" aria-label="Back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
      </button>
      <div class="pt-dialog-title">Power Tools</div>
      <button class="pt-close-btn" aria-label="Close">
        <ha-icon icon="mdi:close"></ha-icon>
      </button>
    </div>
    <div class="pt-dialog-body">
      <!-- rendered by _renderPtModal() -->
    </div>
  </div>
</div>
```

### 6.2 Navigation State

```js
this._ptView = null;  // null = tool list; string = current tool name
```

State transitions:
- `null` → `'commands'` → back → `null`
- `null` → `'keycap'` → back → `null`
- `null` → `'sync'` → back → `null`
- `null` → `'find'` → back → `null`
- `null` → `'cache'` → back → `null`

### 6.3 Tool List (root view)

```
┌─────────────────────────────────┐
│ [·] Power Tools             [✕] │
├─────────────────────────────────┤
│ 📶  Command Manager         [›] │ ← WiFi + native commands, favorites, keymaps
│ 🎯  Key Capture             [›] │ ← Automation assist / snippet generator
│ 🔄  Sync Remote             [›] │ ← sync_command_config (shows pending badge)
│ 📡  Find Remote             [›] │ ← hub.async_find_remote()
│ 💾  Cache Manager           [›] │ ← refresh, status, last-updated
└─────────────────────────────────┘
```

"Sync Remote" shows a dot/badge if sync is needed (can check `command_sync_state.sync_needed`).

### 6.4 Modal CSS (abbreviated)

```css
.pt-modal { position: fixed; inset: 0; z-index: 999; display: none; align-items: flex-end; justify-content: center; }
.pt-modal.open { display: flex; }
.pt-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.pt-dialog { position: relative; width: min(480px, 100%); max-height: 80vh; background: var(--ha-card-background); border-radius: 20px 20px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -4px 24px rgba(0,0,0,0.25); }
.pt-dialog-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--divider-color); }
.pt-back-btn { /* hidden when _ptView === null */ }
.pt-dialog-title { flex: 1; font-size: 16px; font-weight: 700; }
.pt-dialog-body { flex: 1; overflow-y: auto; padding: 12px 0; }
.pt-tool-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
.pt-tool-row:hover { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
.pt-tool-row-icon { --mdc-icon-size: 22px; opacity: 0.75; }
.pt-tool-row-text { flex: 1; }
.pt-tool-row-name { font-size: 15px; font-weight: 500; }
.pt-tool-row-desc { font-size: 12px; color: var(--secondary-text-color); margin-top: 1px; }
.pt-tool-row-chevron { color: var(--secondary-text-color); }
```

---

## 7. Command Manager (Unified Editor)

### 7.1 Mental Model

A **command** is the atomic unit. Commands come from two sources:
- **Hub-native**: existing commands on devices already in the hub database
- **WiFi command**: commands created by this integration (the managed Wifi Device with up to 10 slots)

For any command, the user can configure:
- **Favorite**: yes/no
- **Which activities**: the activities where this command appears as a favorite or is key-mapped
- **Key mapping**: which physical button (if any) triggers this command in which activities

The unified editor replaces the current "WiFi Commands" tab in the editor. It combines:
- Creating/managing WiFi command slots (existing functionality)
- Browsing hub-native commands from persistent cache
- Setting favorites, key mappings, and activity membership in one place

### 7.2 UI Flow

```
Command Manager (root list)
├── [+ New WiFi Command]   →  WiFi Command slot editor (10 slots, existing flow)
├── [Browse Hub Commands]  →  Device list → Command list → Command config
└── [Existing config list] →  All currently configured commands (from cache)
     └── Tap any command   →  Command config view
```

### 7.3 Command Config View

```
┌─────────────────────────────────┐
│ [←] "Volume Up" (Samsung TV)   │
├─────────────────────────────────┤
│ Source: Hub native              │
│ Device: Samsung TV (id: 1)      │
│ Command: Volume Up (id: 202)    │
│                                 │
│ ─── Favorite ───────────────── │
│ [toggle]  Add as favorite       │
│                                 │
│ Activities: (chips, multi-sel.) │
│ [Watch TV] [Music] [+ more...]  │
│                                 │
│ ─── Key Mapping ─────────────── │
│ Map to physical button:         │
│ [VOL+] [VOL-] [MUTE] [→ more]  │
│                                 │
│ Activities where mapped:        │
│ [Watch TV] [Music] [+ more...]  │
│                                 │
│            [Save]  [Cancel]     │
└─────────────────────────────────┘
```

**Notes:**
- Activities for favorite and activities for key mapping are independent selections
- "Source: Hub native" vs "Source: WiFi Command (slot 3)"
- WiFi Command source also shows the command slot name (editable)
- Physical button selector shows button icons (same as existing `HARD_BUTTON_ICONS` map)

### 7.4 Deploy Flow

On Save:
1. If command is new WiFi Command slot → save to `sofabaton_x1s/command_config/set` + update cache
2. If `is_favorite` changed → call `command_to_favorite` service for each added activity, or new `command_unfavorite` WS endpoint to remove
3. If key mapping changed → call `command_to_button` service for each mapped activity button
4. Optimistic cache update for immediate UI feedback

### 7.5 Reorder / Delete Favorites

Within Command Manager, a "Manage Favorites" sub-view per activity:

```
┌─────────────────────────────────┐
│ [←] Watch TV Favorites     [✕] │
├─────────────────────────────────┤
│ ≡  Power (Samsung TV)       [×] │ ← drag handle, delete button
│ ≡  Volume Up (Yamaha)       [×] │
│ ≡  Play (Apple TV)          [×] │
│                                 │
│ [+ Add favorite]                │
└─────────────────────────────────┘
```

Reorder via drag (using existing drag pattern from `_renderGroupOrderEditor()`) or up/down buttons.
On reorder/delete: deploy immediately via new hub protocol (see §11.5).

---

## 8. Key Capture (Power Tools tool)

### 8.1 Relocating the Existing UI

Currently:
- Main card body renders the automation assist row when `show_automation_assist: true`
- Editor renders a toggle to enable/disable it

After:
- Main card body has NO automation assist DOM
- Key Capture is rendered by `_renderPtKeyCapture(container)` inside the Power Tools modal body
- All underlying logic (`_setAutomationAssistActive`, MQTT handling, etc.) stays in `SofabatonRemoteCard`
- `_updateAutomationAssistUI()` updates refs that now point to modal elements

### 8.2 Changes in `_render()`

Remove lines 3707–3735 (the `.automationAssist` section). Remove `this._automationAssistRow`, `this._automationAssistLabel`, `this._automationAssistStatus` from main render.

These refs are set instead by `_renderPtKeyCapture(container)` when the user navigates to Key Capture in Power Tools.

### 8.3 Editor Impact

Remove the Key Capture toggle (lines 6162–6218 in `_renderCommandsEditor`). The `show_automation_assist` config key is deprecated (see §5.1 migration).

---

## 9. Sync Remote (Power Tools tool)

Uses existing machinery:
- `_loadCommandSyncProgress()` (moved from editor to main card in §7's WiFi Command refactor)
- WS: `sofabaton_x1s/command_sync/progress`
- The sync trigger: need to confirm — either a new WS endpoint or calling `sync_command_config` service

**New WS endpoint** (small addition to `__init__.py`):
```python
# sofabaton_x1s/command_sync/start
```
If `sync_command_config` service is already triggerable via `callService`, this endpoint may not be needed — evaluate during implementation.

**UI:** Status display + "Sync to Hub" button. Polls progress while `status === 'running'`.

---

## 10. Find Remote (Power Tools tool)

**Backend:** `hub.async_find_remote()` exists. The find_remote button entity (`button.py:100`) exposes it as an HA button.

Rather than pressing the button entity (requires entity discovery), add a direct WS endpoint:

```python
# sofabaton_x1s/find_remote  {entity_id: str}
# → calls hub.async_find_remote()
# → returns {ok: true} or error
```

**Frontend:** One button. On press → `callWS({type: 'sofabaton_x1s/find_remote', entity_id})`. Shows "✓ Signal sent" or error for 3 seconds.

---

## 11. Cache Manager (Power Tools tool)

```
┌─────────────────────────────────┐
│ [←] Cache Manager          [✕] │
├─────────────────────────────────┤
│ Status: ✓ Ready                 │
│ Last refresh: Oct 15, 12:34     │
│                                 │
│ Activities:    5 / 5            │
│ Devices:       8 / 8            │
│ Commands:      6 / 8 devices    │
│ Keymaps:       5 / 5 activities │
│ Favorites:     5 / 5 activities │
│                                 │
│ [  Refresh All  ]               │
│ [  Refresh Commands Only  ]     │
│ [  Refresh Keymaps Only   ]     │
│                                 │
│ (Progress bar while running)    │
└─────────────────────────────────┘
```

Status is fetched via `sofabaton_x1s/cache/status` on open. Refresh calls `sofabaton_x1s/cache/refresh`.

---

## 12. Editor Changes

After refactoring, `SofabatonRemoteCardEditor` becomes simpler:

### 12.1 Retained

- Entity selector (the `ha-form` with entity filter)
- **Styling Options** section (unchanged: theme, max_width, background override)
- **Layout Options** section (unchanged: group_order drag-to-reorder)

### 12.2 Removed

- `_renderCommandsEditor()` and its entire DOM
- All WiFi Commands methods (moved to `SofabatonRemoteCard`)
- The Key Capture toggle row
- `_commandsWrap` element

### 12.3 Added

**Power Corner section** added to Styling Options (or as its own accordion):

```js
// Added to ha-form schema in _renderStylingOptionsEditor():
{ name: 'show_power_tools', selector: { boolean: {} } },
...(config.show_power_tools ? [{
  name: 'power_tools_corner',
  selector: { select: { options: [
    { value: 'br', label: 'Bottom-Right (default)' },
    { value: 'bl', label: 'Bottom-Left' },
    { value: 'tr', label: 'Top-Right' },
    { value: 'tl', label: 'Top-Left' },
  ]}}
}] : []),
```

Labels:
```js
show_power_tools: 'Enable Power Corner',
power_tools_corner: 'Corner position',
```

---

## 13. New WebSocket API Contracts

All new endpoints added in `custom_components/sofabaton_x1s/__init__.py`, registered alongside existing four handlers.

### 13.1 `sofabaton_x1s/cache/status`

**Request:**
```json
{ "type": "sofabaton_x1s/cache/status", "entity_id": "remote.living_room" }
```

**Response:**
```json
{
  "populated": true,
  "populated_at": "2025-10-15T12:34:56Z",
  "activities_count": 5,
  "devices_count": 8,
  "commands_devices_populated": 6,
  "commands_devices_total": 8,
  "keymap_activities_populated": 5,
  "keymap_activities_total": 5,
  "favorites_activities_populated": 5,
  "favorites_activities_total": 5
}
```

### 13.2 `sofabaton_x1s/cache/get`

**Request:**
```json
{
  "type": "sofabaton_x1s/cache/get",
  "entity_id": "remote.living_room",
  "sections": ["activities", "devices", "commands", "keymap", "favorites"]
}
```

**Response:** the JSON cache object (§3.2), filtered to requested sections.

### 13.3 `sofabaton_x1s/cache/refresh`

**Request:**
```json
{
  "type": "sofabaton_x1s/cache/refresh",
  "entity_id": "remote.living_room",
  "scope": "full"  // "full" | "commands" | "keymap" | "favorites"
}
```

**Response:** `{ "started": true }`

Progress is pushed as HA events (`sofabaton_x1s_cache_progress`) that the frontend subscribes to:
```json
{ "step": 3, "total": 10, "message": "Fetching commands for Samsung TV...", "status": "running" }
{ "step": 10, "total": 10, "message": "Done", "status": "done" }
```

Frontend subscribes via `hass.connection.subscribeEvents(callback, 'sofabaton_x1s_cache_progress')`.

### 13.4 `sofabaton_x1s/find_remote`

**Request:**
```json
{ "type": "sofabaton_x1s/find_remote", "entity_id": "remote.living_room" }
```

**Response:** `{ "ok": true }` or error.

### 13.5 Favorite Management (new WS endpoints)

> These endpoints handle the operations the card needs that aren't covered by existing services.
> The existing `command_to_favorite` service handles *adding* a favorite but not deleting or reordering.

**`sofabaton_x1s/favorites/reorder`**
```json
{
  "type": "sofabaton_x1s/favorites/reorder",
  "entity_id": "remote.living_room",
  "activity_id": 101,
  "order": [2, 0, 1]  // new order as slot indices
}
```

**`sofabaton_x1s/favorites/remove`**
```json
{
  "type": "sofabaton_x1s/favorites/remove",
  "entity_id": "remote.living_room",
  "activity_id": 101,
  "device_id": 1,
  "command_id": 201
}
```

**Note:** Whether the hub protocol supports explicit reorder/remove needs to be confirmed by reviewing hub protocol docs or testing. If not supported atomically, we may need to clear + re-add all favorites in the desired order.

### 13.6 Command Manager Data Endpoints

**`sofabaton_x1s/commands/list`** — list all commands from cache (for Command Manager browser)
```json
// Request
{ "type": "sofabaton_x1s/commands/list", "entity_id": "remote.living_room" }

// Response
{
  "from_cache": true,
  "devices": [
    {
      "id": 1,
      "name": "Samsung TV",
      "brand": "Samsung",
      "commands": [
        { "id": 201, "name": "Power" },
        { "id": 202, "name": "Volume Up" }
      ]
    }
  ]
}
```

---

## 14. Files to Modify

| File | Change type |
|------|------------|
| `www/remote-card.js` | Largest change: Power Corner, modal, Command Manager frontend, Key Capture move, WiFi Commands move from editor to main card |
| `__init__.py` | Add 5+ new WS endpoints |
| `hub.py` | Add cache management methods, `async_find_remote` WS wrapper |
| `lib/state_helpers.py` | Add `enhanced_keymap` field, update `accumulate_keymap()` |
| `lib/x1_proxy.py` | Add getter for `enhanced_keymap` |
| New file: `lib/cache_store.py` | `CacheStore` class wrapping HA Store |
| `services.yaml` | Possibly add new services (favorites/reorder, etc.) |

---

## 15. Open Questions (Resolve Before Implementing)

1. **Keymap record byte layout**: Confirm exact byte offsets for `device_id` and `command_id` within the 18-byte keymap records in `accumulate_keymap()` (state_helpers.py lines 45–115).

2. **Favorite delete/reorder protocol**: Does the hub support removing or reordering individual favorites, or does it require clear-and-replace? Clarify by reviewing hub protocol or testing.

3. **Command sync trigger**: Can the existing `sync_command_config` service be called from the card, or do we need a new WS `command_sync/start` endpoint?

4. **Activity membership write**: The `device_to_activity` service exists. Is there a corresponding `remove_device_from_activity`? The user mentioned "not adding the same device twice" — what's the write-back flow?

5. **WiFi Command methods in main card**: The `_renderCommandsEditor()` and related editor methods are deeply coupled to editor-specific DOM refs (`this._commandsWrap`). Audit all refs before moving to main card class.

6. **Sync between editor WS state and Power Tools WS state**: Currently `_commandConfigLoadedFor`, `_commandsData`, etc. are on the editor instance. Once moved to the main card, these will persist across edit mode sessions. Verify this is desirable.

---

## 16. Implementation Phases

Given complexity, suggested phasing:

**Phase 1 (this branch):** Backend cache infrastructure
- `CacheStore` class
- Enhanced keymap parsing in `accumulate_keymap()`
- New WS endpoints: `cache/status`, `cache/get`, `cache/refresh`, `find_remote`
- HA event push for refresh progress

**Phase 2 (follow-up branch):** Power Corner + Key Capture migration
- Power Corner zone + long-press in `remote-card.js`
- Power Tools modal shell
- Key Capture moved to Power Tools
- Editor: remove Key Capture toggle, add Power Corner settings

**Phase 3 (follow-up branch):** Command Manager
- WiFi Commands moved from editor to main card
- Command Manager frontend (browse, config, save)
- Favorites: add, delete, reorder UI
- New WS endpoints: `favorites/reorder`, `favorites/remove`, `commands/list`

**Phase 4 (follow-up branch):** Polish + additional tools
- Sync Remote tool
- Find Remote tool
- Cache Manager tool
- Full editor cleanup

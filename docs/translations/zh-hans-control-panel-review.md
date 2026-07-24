# Simplified Chinese Control Panel review

Status: **complete implementation; native Mainland Chinese sign-off pending**

## Implemented scope

- Complete `zh-Hans` Control Panel catalogue with compile-time completeness
  checking
- Registration through the Control Panel translation index
- Coverage for dynamic counts, progress states, backup/restore copy, activity
  and device editing, Wi-Fi Commands, events, validation, and decoded payloads
- Shared terminology aligned with the existing Virtual Remote catalogue
- Concise primary tabs and action buttons for mobile layouts
- Locale-specific frontend assertions

## Translation approach

The translation was written from the current English reference with UI context,
not produced by copying complete sentences from the SofaBaton app. The official
Mainland Chinese app resources were used to establish brand terminology,
especially `Hub`, `活动`, `设备`, `命令`, `按键`, `信源`, `宏按键`, `收藏键`,
`备份`, `电源设置`, `同步遥控器`, and `寻找遥控器`.

SofaBaton's app strings were deliberately not treated as editorially final.
The inspected version sometimes retains English `Activity`, leaves sync labels
untranslated, varies `Hub`/`hub` and `WiFi`/`Wifi`, and contains occasional
sentence-level defects.

SofaBaton's [`yomonpet/ha-sofabaton-hub`](https://github.com/yomonpet/ha-sofabaton-hub)
integration was used as a second first-party reference. Its Simplified Chinese
documentation consistently uses `动作` for a Home Assistant Action and `仪表板`
for Dashboard. The relevant repository commit is authored from a
`@sofabaton.com` address. It also confirms `活动`, `设备`, `按键`, `宏按键`, and
`收藏按键`. It does not contain enough relevant UI copy to settle the remaining
specialist terms below.

## Native reviewer brief

The reviewer should use Home Assistant with language set to `简体中文`
(`zh-Hans`) and answer the following.

### Highest-priority terminology decisions

1. Is `信源` natural throughout the activity and power editors, including
   fallback labels such as `信源 3`, or should any explanatory occurrences use
   `输入源`?
2. Is `持久缓存` the clearest user-facing term for Persistent Cache?
3. Is `快捷项` a natural umbrella term for commands and macros shown on the
   remote screen?
4. Is `有效载荷` appropriate for the advanced payload editor, or would Mainland
   technical users expect the English `Payload` or the shorter `载荷`?

### Fluency review

- Flag any sentence that sounds translated rather than originally written in
  Chinese.
- Check that warnings clearly distinguish immediate Hub changes, changes made
  on the next sync, and changes applied only during restore.
- Check power-control language for unambiguous on/off behavior.
- Check whether subject omission makes any progress or error message unclear.
- Verify that `按键` consistently means a remote key and `按钮` an on-screen
  control.
- Verify punctuation and spacing around `Hub`, `Home Assistant`, `Wi-Fi`,
  model names, numbers, and code terms.

### UI review

- Test widths of 320, 360, and 390 CSS pixels.
- Inspect the five primary tabs: `Hub`, `自动化`, `备份`, `设置`, `日志`.
- Inspect all compact buttons in Hub, Backup, and Automation.
- Open every add, rename, delete, sync, power, binding, macro, event, payload,
  backup, and restore dialog.
- Exercise success, empty, loading, unavailable, conflict, and failure states.
- Confirm that mixed Chinese and Latin text wraps at sensible boundaries.

## Acceptance criteria

The translation can be considered production-reviewed after:

- A native Mainland Chinese reviewer has resolved the four terminology
  decisions above.
- Every primary workflow has been inspected in the rendered card.
- No accidental English fallback appears outside deliberately preserved terms.
- Placeholder values, product names, protocol identifiers, and code samples
  remain intact.
- Reviewer corrections are applied to both cards when shared terminology is
  affected.

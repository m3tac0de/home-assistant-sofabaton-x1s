# Simplified Chinese (`zh-Hans`) terminology

This glossary governs the Sofabaton Control Panel and Virtual Remote cards.
It targets Mainland Chinese users and uses concise UI wording rather than
word-for-word translations of the English source.

## Sources and precedence

1. SofaBaton's Mainland Chinese Android resource catalogue
   (`res/values-zh-rCN/strings.xml` from app version 3.4.6).
2. SofaBaton's Simplified Chinese documentation in the
   [`yomonpet/ha-sofabaton-hub`](https://github.com/yomonpet/ha-sofabaton-hub)
   Home Assistant integration.
3. Home Assistant's established Simplified Chinese product terminology.
4. Conventional Mainland Chinese consumer-electronics and technical usage.

The inspected SofaBaton catalogue is from app version 3.4.6 and contains 1,466
Simplified Chinese strings for 1,548 base strings. It is authoritative for
product vocabulary, but not for complete sentences: the source contains
untranslated labels, inconsistent capitalization, and occasional awkward
wording.

## Approved core terminology

| English concept | Simplified Chinese | Usage note |
| --- | --- | --- |
| Hub | `Hub` | SofaBaton leaves this product term in English. |
| Activity | `活动` | Do not retain `Activity` or substitute `场景`. |
| Device | `设备` | |
| Command | `命令` | Use `按键` only when the source means a physical key. |
| Physical remote button/key | `按键` | SofaBaton's hardware terminology. |
| On-screen UI button | `按钮` | Distinguishes UI controls from remote keys. |
| Favorite | `收藏` | Short tab/list noun. |
| Favorite key | `收藏键` | Use in explanatory copy about the remote screen. |
| Macro | `宏` | Short tab/list noun. |
| Macro key | `宏按键` | Use when specifically describing a remote key. |
| Source / input selection | `信源` | SofaBaton's preferred home-entertainment term. |
| Source configuration | `信源配置` | |
| Power settings | `电源设置` | |
| Power on / off | `开机` / `关机` | Use for device power actions. |
| Backup | `备份` | |
| Restore | `恢复` | |
| Synchronize / Sync | `同步` | |
| Sync Remote | `同步遥控器` | |
| Find Remote | `寻找遥控器` | Matches the official app. |
| Remote control | `遥控器` | |
| Settings | `设置` | |
| Logs | `日志` | |
| Cache | `缓存` | |
| Persistent cache | `持久缓存` | Pending native editorial confirmation. |
| Automation | `自动化` | Home Assistant concept. |
| Entity | `实体` | Home Assistant concept. |
| Action | `动作` | Configured Home Assistant action. Keep generic operations as `操作`. |
| Service call | `服务调用` | Preserve the distinction from a general action. |
| Dashboard | `仪表板` | Home Assistant concept; also used by SofaBaton's integration. |
| Event | `事件` | |
| Shortcut | `快捷项` | Umbrella term for command and macro items on the remote screen. |
| Payload | `有效载荷` | Technical editing and validation screens. |

## Terms kept unchanged

Keep product names, protocol identifiers, code identifiers, and stored values
unchanged. This includes:

- `Sofabaton`, `Home Assistant`, `Hub`, `Automation Assist`, `Lovelace`
- `MQTT`, `MQTT Discovery`, `Wi-Fi`, `HTTP`, `WebSocket`
- `JSON`, `YAML`, `IP`, `IPv4`, `URL`, `ECP`, `REST`, `UPnP`
- `Roku`, `Hue`, `Sonos`
- Entity IDs, service/action IDs, URLs, schema keys, hexadecimal values, and
  user- or Hub-supplied names

## Style rules

- Use Mainland Simplified Chinese characters and punctuation.
- Prefer short verb labels for buttons: `添加`, `保存`, `同步`, `恢复`.
- Do not add English-style singular/plural distinctions. Use a number plus an
  appropriate classifier such as `个` or `项`.
- Use Chinese quotation marks (`“…”`) for user-visible names.
- Use the Chinese ellipsis (`…`) for progress labels.
- Insert a space between Chinese text and embedded Latin product or protocol
  terms when it improves readability, for example `Hub 设置` and
  `Home Assistant 日志`.
- Avoid pronouns when the object is already clear from the control or dialog.
- Translate by UI function and context; do not mirror English word order.

## Cross-card consistency

The Control Panel and Virtual Remote must use the same short nouns:

- `活动`
- `设备`
- `命令`
- `按键`
- `宏`
- `收藏`

Any future change to these terms must be applied to both catalogues and their
tests.

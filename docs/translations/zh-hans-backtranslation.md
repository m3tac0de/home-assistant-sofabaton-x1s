# Simplified Chinese back-translation review

This report treats the Simplified Chinese locale as the source and translates
its meaning back into plain English. It tests semantic preservation; it does
not replace proofreading by a native Chinese speaker or visual testing in
Home Assistant.

This pass is not fully blind because the same working session had access to the
English reference. A stronger future review should give only `zh-hans.ts` to a
fresh reviewer and reveal the English source after the back-translation is
complete.

## Back-translation sample

| Area | Literal English recovered from Chinese | Comparison with the source |
| --- | --- | --- |
| Entity error | Please select a Sofabaton remote-control entity. | Same meaning. |
| Availability | The remote control is unavailable, possibly because the Sofabaton app is connected. | Same meaning. |
| Empty activities | No activities were found in the remote control's attributes. | Same meaning. |
| Powered off | Already powered off. | Same state; Chinese naturally marks it as completed. |
| Default layout | Default layout. | Exact meaning. |
| Key capture | Key/button-press capture. | Same meaning. |
| Waiting | Waiting for a key press. | Same meaning. |
| Edit-mode guard | You can begin after leaving editing mode. | Same instruction, expressed as a result. |
| Trigger action | Create MQTT Discovery triggers. | Same meaning; feature name preserved. |
| Activity option | At the same time, create triggers for activity changes. | Same meaning. |
| Session opt-out | Do not show this prompt again for this device in this session. | Adds the implied word “prompt”; no behavioral change. |
| Existing triggers | Existing MQTT automation triggers were found. | Same meaning. |
| Creation result | N MQTT Discovery triggers were created for [device]. | Same meaning; Chinese requires no plural inflection. |
| Lovelace heading | Lovelace button code. | Same meaning. |
| Service heading | Service call (automation). | Same meaning. |
| Direction pad | Direction keys. | Same function. |
| Rockers field | Volume/channel adjustment keys. | Preserves the adjustment function without a literal hardware borrowing. |
| Key-capture help | Send key operations to the Hub to generate ready-to-use YAML for dashboard buttons and automations. | Removes repetition without losing meaning. |
| Styling options | Style options. | Exact meaning. |
| Macros/favorites layout | Display macros/favorites as rows. | Adds the implied verb “display.” |
| Default-layout note | Used for activities without a separate layout. | Same meaning. |
| Guide key | Program guide. | More explicit than “Guide.” |

## Finding produced by the reverse pass

The first draft translated “Reset to card default” as `重置为卡片默认值`, whose
literal return is “reset to the card's default value.” That sounded abstract
and did not identify what was being reset. The final locale uses
`重置卡片默认布局` (“reset the card's default layout”) and keeps the separate
activity action as `恢复默认布局` (“restore the default layout”).

No other warning, state, or action changed meaning. Two terminology choices are
deliberate:

- Physical remote keys use `按键`, while Lovelace/dashboard buttons use
  `按钮`. English often calls both “buttons,” but Chinese distinguishes them.
- “Volume/channel rockers” becomes “volume/channel adjustment keys,” which
  communicates their function more naturally.

## Remaining validation

A native review should focus on terminology consistency with the current Home
Assistant Simplified Chinese frontend, whether `活动` matches Sofabaton users'
expectation for “Activity,” and text fit. A visual pass should also confirm the
mixed Chinese/Latin strings such as MQTT Discovery and Automation Assist.

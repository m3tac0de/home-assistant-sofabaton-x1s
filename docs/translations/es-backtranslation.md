# Spanish back-translation review

This report treats the Spanish locale as the source and translates its meaning
back into plain English. It tests semantic preservation; it does not replace
proofreading by a native Spanish speaker or visual testing in Home Assistant.

The locale uses neutral international Spanish where practical. This pass is
not fully blind because the same working session had access to the English
reference. A stronger future review should give only `es.ts` to a fresh
reviewer and compare with English afterward.

## Back-translation sample

| Area | Literal English recovered from Spanish | Comparison with the source |
| --- | --- | --- |
| Entity error | Select a Sofabaton remote-control entity. | Same meaning. |
| Availability | The remote control is unavailable, possibly because the Sofabaton app is connected. | Same meaning. |
| Empty activities | No activities were found in the remote control's attributes. | Same meaning. |
| Powered off | Turned off. | Same meaning. |
| Default layout | Default design/layout. | Same meaning; “diseño” is more natural than a literal borrowing. |
| Key capture | Button capture. | More explicit about the physical remote. |
| Waiting | Waiting for a button to be pressed. | Same meaning. |
| Edit-mode guard | Leave editing mode to begin. | Same meaning. |
| Trigger action | Create MQTT Discovery triggers. | Same meaning; feature name preserved. |
| Activity option | Also create triggers for activity changes. | Same meaning. |
| Session opt-out | Do not show this again for this device during this session. | Same meaning. |
| Existing triggers | Existing MQTT automation triggers were found. | Same meaning. |
| Creation result | N MQTT Discovery trigger(s) created for [device]. | Same meaning and number agreement preserved. |
| Lovelace heading | Lovelace button code. | Same meaning. |
| Service heading | Service call (automation). | Same meaning. |
| Direction pad | Directional control. | Same function, slightly broader wording. |
| Rockers field | Volume and channel controls. | The mechanical “rocker” detail is generalized. |
| Key-capture help | Send button presses to the hub to generate ready-to-use YAML for dashboard buttons and automations. | Removes repetition without losing meaning. |
| Styling options | Style options. | Same meaning. |
| Default-layout note | Used for activities without their own design/layout. | Same meaning. |
| Guide key | Program guide. | More explicit than “Guide.” |

## Finding produced by the reverse pass

The first Spanish draft used `Guía de programación`. Its literal return could
also mean “programming guide,” suggesting software instructions rather than a
television program guide. The locale was corrected to `Guía de programas`
before completion.

No other warning, state, or action changed meaning. The remaining differences
are deliberate naturalizations:

- “Remote” becomes “control remoto,” which is broadly understood across
  Spanish-speaking regions.
- “Layout” becomes “diseño,” the concise UI term.
- “Key” becomes “button” where the physical remote is meant.
- “Volume/channel rockers” becomes “volume and channel controls.”

## Remaining validation

A native review should focus on regional preferences—especially Spain's
`mando a distancia` versus Latin American `control remoto`—terminology
consistency with the current Home Assistant Spanish frontend, and text fit.

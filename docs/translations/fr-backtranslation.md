# French back-translation review

This report treats the French locale as the source and translates its meaning
back into plain English. It tests semantic preservation; it does not replace
proofreading by a native French speaker or visual testing in Home Assistant.

This pass is not fully blind because the same working session had access to the
English reference. A stronger future review should give only `fr.ts` to a fresh
reviewer and reveal the English source after the back-translation is complete.

## Back-translation sample

| Area | Literal English recovered from French | Comparison with the source |
| --- | --- | --- |
| Entity error | Select a Sofabaton remote-control entity. | Same meaning. |
| Availability | The remote control is unavailable, perhaps because the Sofabaton app is connected. | Same meaning. |
| Empty activities | No activity was found in the remote control's attributes. | Same meaning; French uses a singular generic after “none.” |
| Powered off | Switched off. | Same state; the feminine form refers to the remote control. |
| Default layout | Default arrangement/layout. | Same meaning; “disposition” is natural French UI terminology. |
| Key capture | Capture of keys/button presses. | Same meaning. |
| Waiting | Waiting for a key to be pressed. | Same meaning. |
| Edit-mode guard | Exit editing mode to begin. | Same meaning. |
| Trigger action | Create the MQTT Discovery triggers. | Same meaning; feature name preserved. |
| Activity option | Also create triggers for activity changes. | Same meaning. |
| Session opt-out | Do not show this again for this device during this session. | Same meaning. |
| Creation result | N MQTT Discovery trigger(s) created for [device]. | Same meaning and number agreement preserved. |
| Lovelace heading | Lovelace button code. | Same meaning. |
| Service heading | Service call (automation). | Same meaning. |
| Direction pad | Directional pad. | Same meaning. |
| Rockers field | Volume and channel keys. | The mechanical “rocker” detail is generalized. |
| Key-capture help | Send key presses to the hub to generate ready-to-use YAML for dashboard buttons and automations. | Removes repetition without losing meaning. |
| Styling options | Style options. | Same meaning. |
| Default-layout note | Used for activities without their own layout. | Same meaning. |
| Guide key | Program guide. | More explicit than “Guide.” |

## Findings

No warning, state, or action changed meaning. The differences are deliberate
French naturalizations:

- “Layout” becomes “disposition,” the conventional term in this UI context.
- “Key” and “button” become “touche” where the physical remote is meant.
- “Volume/channel rockers” becomes “volume and channel keys,” avoiding an
  unnatural literal hardware translation.
- Generic empty-state phrases may use a singular noun in French even where the
  English source uses a plural.

## Remaining validation

A native review should focus on France-versus-Canada preferences, the level of
formality in instructions, terminology consistency with the current Home
Assistant French frontend, and whether longer labels fit the editor controls.

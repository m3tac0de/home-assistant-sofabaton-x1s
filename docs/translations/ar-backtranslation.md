# Arabic back-translation review

This report treats the Arabic locale as the source and translates its meaning
back into plain English. It is a semantic smoke test: it can reveal missing,
reversed, or narrowed meaning, but it cannot prove that the Arabic sounds
natural to a native speaker.

This first pass is not blind because the same translation session had access
to the English reference. For stronger future checks, give only the completed
target-language file to a fresh reviewer and hide the English source until the
back-translation is finished.

## Back-translation sample

| Area | Literal English recovered from Arabic | Comparison with the source |
| --- | --- | --- |
| Entity error | Choose a remote-control entity from Sofabaton. | Same meaning. |
| Availability | The remote control is unavailable, perhaps because the Sofabaton app is connected. | Same meaning. |
| Empty activities | No activities were found in the remote control's attributes. | Same meaning. |
| Powered off | Powered off. | Same meaning. |
| Key capture | Capture button presses. | More explicit than “Key capture”; appropriate for a remote. |
| Waiting | Waiting for a button press. | Same meaning. |
| Edit-mode guard | Exit editing mode to begin. | Same meaning. |
| Trigger action | Create MQTT Discovery triggers. | Same meaning; feature name preserved. |
| Activity option | Also create triggers when the activity changes. | Same meaning. |
| Session opt-out | Do not show this again for this device in this session. | Same meaning. |
| Existing triggers | Previously existing MQTT automation triggers were found. | Same meaning. |
| Creation result | N MQTT Discovery triggers were created for [device]. | Same meaning. |
| Lovelace heading | Code for a Lovelace button. | Same meaning. |
| Service heading | Service call (automation). | Same meaning. |
| Theme field | Apply a theme to the card. | Same meaning. |
| Direction pad | Direction pad. | Same meaning. |
| Rockers field | Volume and channel buttons. | “Rocker” detail is generalized; clearer than a literal Arabic hardware term. |
| Key-capture help | Send button presses to the hub to create ready-to-use YAML for dashboard buttons and automations. | Removes the source's repeated “button presses” without losing the instruction. |
| Styling options | Appearance options. | Slightly broader, but correct in this UI. |
| Macros/favorites layout | Display macros/favorites as rows. | Adds an implied “display”; same behavior. |
| Default-layout note | Used for activities that do not have their own layout. | Same meaning. |
| Guide key | Program guide. | More explicit than “Guide.” |
| Fast-forward key | Fast forward. | Same meaning. |

## Findings

No instruction, warning, action, or state changed meaning in the
back-translation. The few differences are deliberate naturalizations rather
than semantic drift:

- “Key” becomes “button” where the UI refers to a physical remote button.
- “Volume/channel rockers” becomes “volume and channel buttons”; Arabic has no
  equally natural concise hardware label for “rocker” in this context.
- “Styling” becomes “appearance,” which is the conventional UI meaning.
- The repetitive English key-capture description becomes one direct clause.

Dynamic names and IDs are surrounded by Unicode bidirectional isolates in the
locale. Those invisible markers preserve the order of Latin device names,
numbers, and nearby punctuation inside right-to-left Arabic text.

## Remaining validation

Back-translation does not assess tone, terminology preferences across Arabic
regions, text fit, or actual right-to-left layout. Those need an Arabic speaker
and a visual pass in Home Assistant with an Arabic locale.

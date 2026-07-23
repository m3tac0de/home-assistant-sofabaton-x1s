# Control Panel translation back-review

The Dutch, German, French, and Spanish Control Panel catalogues were reviewed
in two semantic passes:

1. Translate each English catalogue section into the target language while
   preserving placeholders, product names, protocol terms, and destructive
   action semantics.
2. Read the target copy as a separate pass and restate its meaning in English.
   Accept it only when the restatement carries the same actor, action, timing,
   object, condition, and data-loss consequence as the source.

This is a pragmatic language-quality check, not a substitute for review by
native speakers. The complete-catalogue TypeScript type checks structure and
function parameters; it cannot judge natural language.

## High-risk semantic samples

| Locale | Target copy | Back-translation | Result |
| --- | --- | --- | --- |
| Dutch | `Dit wordt onmiddellijk op de hub toegepast.` | This is applied to the hub immediately. | Same timing and target. |
| Dutch | `Verwijderingen bereiken de hub alleen bij een herstelbewerking met Vervangen.` | Deletions reach the hub only during a Replace restore. | Same conditional destructive effect. |
| German | `Diese Änderung wird bei der nächsten Synchronisierung auf den Hub geschrieben.` | This change is written to the hub on the next synchronization. | Same deferred timing. |
| German | `Deine nicht gespeicherten Änderungen werden verworfen.` | Your unsaved changes will be discarded. | Same data-loss warning. |
| French | `Cette modification est appliquée immédiatement au hub.` | This change is applied to the hub immediately. | Same timing and target. |
| French | `Les suppressions n’atteignent le hub que lors d’une restauration avec remplacement.` | Deletions reach the hub only during a restore with replacement. | Same conditional destructive effect. |
| Spanish | `Este cambio se escribe en el hub durante la próxima sincronización.` | This change is written to the hub during the next synchronization. | Same deferred timing. |
| Spanish | `Se descartarán tus cambios sin guardar.` | Your unsaved changes will be discarded. | Same data-loss warning. |

## Corrections found by the reverse pass

- Dutch: changed a result summary that back-translated as merely “saved” to
  explicitly say the activities and devices were included in the backup;
  corrected singular agreement for linked devices.
- German: corrected singular agreement, a plural rename label, and an
  incomplete “none customised” label.
- French: corrected activity/device gender agreement and rewrote the backup
  result so both activities and devices are unambiguously included.
- Spanish: corrected gender in dynamic “load it” text, the activity/device
  rename article, and selected-count agreement.

## What back-translation cannot catch

A back-translation round-trip is blind to a calqued term, because the calque
round-trips perfectly. The Dutch "Power" section was translated as `Voeding`,
which back-translates to "Power" and passes the reverse pass — but `Voeding`
means the electrical supply (and, in ordinary use, nutrition), while the
section is about *when the hub switches devices on and off*. German, Spanish,
and French had made the same substitution independently (`Stromversorgung`,
`Alimentación`, `Alimentation`).

Catching this needs a **forward-only pass**: read the target string with the
screen in view and no English visible, then ask whether the word names what
the panel actually does. If the answer needs the English original to make
sense, the term is wrong.

Run that pass over any English source term that is short, polysemous, or a
noun standing in for a behaviour. In this catalogue those are:

| English | Trap | What the term must name |
| --- | --- | --- |
| Power | electricity vs. on/off behaviour | the switching behaviour |
| Sequence | ordering vs. list of steps | the list of actions to run |
| Input | keyboard input vs. HDMI source | the source the device switches to |
| Key | cryptographic key vs. remote button | the physical button |
| Wait | waiting state vs. inserted pause | the pause step in a sequence |

Resolved 2026-07-24: the power family now names the behaviour in every
catalogue — `Aan/uit-beheer` (nl), `Ein/Aus-Steuerung` (de), `Encendido y
apagado` (es), `Marche/Arrêt` (fr). Dutch and German also dropped the
`-volgorde` / `-sequenz` calques in favour of "actions when switching on/off";
Spanish `secuencia` and French `séquence` are natural and were kept.

## Acceptance criteria

- All source keys and parameter signatures are present in every complete
  catalogue.
- Regional variants such as `nl-BE`, `de-CH`, `fr-CA`, and `es-MX` resolve to
  their base-language catalogue.
- Safety-critical text preserves whether an action is immediate, deferred to
  the next sync, or conditional on a Replace restore.
- Unknown or new partial-locale entries still fall back safely to English.
- Terms from the trap table above have had a forward-only pass, not just a
  back-translation.
- Copy that names another part of the UI ("Automation → Events") uses that
  part's *translated* label, not the English one.

# Translating the Sofabaton Virtual Remote card

The Virtual Remote card renders every user-facing string through a central
string table, keyed by Home Assistant's UI language (`hass.locale.language`).
English is the complete reference; translations are **partial overlays** — any
key a language does not provide automatically falls back to English, so an
incomplete translation is safe to ship and improves incrementally.

## How it works

- [`remote-card-strings.ts`](../custom_components/sofabaton_x1s/www/src/remote-card-strings.ts)
  holds the English reference table (`REMOTE_CARD_STRINGS_EN`) and the language
  registry.
- The card calls `setRemoteCardLanguage(hass.locale.language)` whenever Home
  Assistant hands it a `hass` object; all rendering code reads strings through
  `str()`.
- Regional codes fall back to their base language (`de-CH` → `de`), and unknown
  languages fall back to English.

## Contributing a language

1. Create `custom_components/sofabaton_x1s/www/src/remote-card-translations/<lang>.ts`
   that registers a table mirroring the shape of `REMOTE_CARD_STRINGS_EN`.
   [`nl.ts`](../custom_components/sofabaton_x1s/www/src/remote-card-translations/nl.ts)
   is a complete example; a partial table is equally valid:

   ```ts
   import { registerRemoteCardTranslation } from "../remote-card-strings";

   registerRemoteCardTranslation("de", {
     card: {
       poweredOff: "Ausgeschaltet",
       noMacros: "Keine Makros verfügbar",
       activityFallback: (id) => `Aktivität ${id}`,
     },
     // ...any subset of the English table
   });
   ```

2. Add `import "./<lang>";` to
   `remote-card-translations/index.ts`. (Do not import translation files from
   `remote-card-strings.ts` itself — that is a circular import.)
3. Run `npm run build:remote-card` and `npm run test:frontend`.

Entries with parameters are functions — translate the sentence around the
placeholder, keep the parameter.

## What is deliberately NOT translated

- Names coming from your hub (activities, devices, commands, favorites, macros).
- Generated YAML (keys/values consumed by Home Assistant) and MQTT discovery
  payloads — only the explanatory text around them is translatable.
- Protocol/state values such as `powered_off` (`POWERED_OFF_LABELS`); the
  *display* label "Powered Off" is translatable and the card recognizes both.
- Documentation URLs and stored config defaults.

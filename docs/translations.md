# Translating the Sofabaton cards

Both frontend cards follow the same localization rules: Home Assistant's UI
language selects a deep-partial translation overlay, regional codes fall back
to their base language, and missing entries safely fall back to English.

## Control Panel card

The Control Panel English reference and registry live in
[`strings.ts`](../custom_components/sofabaton_x1s/www/src/strings.ts). All
rendered copy, attributes, validation text, status fallbacks, and editor form
descriptions must pass through `TOOLS_CARD_STRINGS`.

Bundled Control Panel locales are `en-GB`, `nl`, `de`, `fr`, `es`, and
Simplified Chinese (`zh-Hans`). The five complete non-English catalogues use
`CompleteToolsCardTranslation`, so TypeScript
reports every missing key when the English reference grows. The translation
and back-translation review is recorded in
[`control-panel-translation-back-review.md`](control-panel-translation-back-review.md).
The Simplified Chinese terminology and native-review brief are recorded in
[`translations/zh-hans-glossary.md`](translations/zh-hans-glossary.md) and
[`translations/zh-hans-control-panel-review.md`](translations/zh-hans-control-panel-review.md).

To add a language:

1. Create
   `custom_components/sofabaton_x1s/www/src/control-panel-translations/<lang>.ts`.
2. Register any translated subset with `registerToolsCardTranslation`. For a
   catalogue intended to be complete, also declare it with
   `satisfies CompleteToolsCardTranslation`:

   ```ts
   import { registerToolsCardTranslation } from "../strings";

   registerToolsCardTranslation("nl", {
     tabs: {
       cache: "Hub",
       backup: "Back-up",
     },
     common: {
       cancel: "Annuleren",
       save: "Opslaan",
     },
   });
   ```

3. Import the module from
   [`control-panel-translations/index.ts`](../custom_components/sofabaton_x1s/www/src/control-panel-translations/index.ts).
4. Run `npm run typecheck`, `npm run build:tools-card`, and
   `npm run test:frontend`.

Parameterized entries remain functions so each language controls word order
and pluralization. The frontend test suite also rejects newly introduced
literal UI text outside the English table.

## Virtual Remote card

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

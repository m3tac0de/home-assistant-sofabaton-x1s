# Translating the Sofabaton cards

Both frontend cards follow the same localization rules: Home Assistant's UI
language selects a translation overlay, regional codes fall back to their base
language, and missing entries safely fall back to English.

## ◇ Supported languages

| Language | Control Panel | Virtual Remote |
| --- | --- | --- |
| English (`en`, `en-GB`) | Yes | Yes |
| German (`de`) | Yes | Yes |
| Spanish (`es`) | Yes | Yes |
| French (`fr`) | Yes | Yes |
| Dutch (`nl`) | Yes | Yes |
| Simplified Chinese (`zh-Hans`) | Yes | Yes |
| Arabic (`ar`) | English fallback | Yes, including RTL layout |

Support is intentionally recorded per card. In particular, Arabic currently
has a reviewed Virtual Remote catalogue but no complete Control Panel
catalogue. The Control Panel therefore uses its complete English fallback
instead of shipping a large, unreviewed machine translation. Add `ar` to the
Control Panel manifest only together with a complete, native-reviewed
catalogue and RTL browser coverage.

## ◇ Control Panel card

The Control Panel English reference and registry live in
[`strings.ts`](../custom_components/sofabaton_x1s/www/src/strings.ts). All
rendered copy, attributes, validation text, status fallbacks, and editor form
descriptions must pass through `TOOLS_CARD_STRINGS`.

Supported Control Panel locales are `en-GB`, `nl`, `de`, `fr`, `es`, and Simplified Chinese (`zh-Hans`). The five complete non-English catalogues use `CompleteToolsCardTranslation`, so TypeScript reports every missing key when the English reference grows.

Only the English reference is bundled into `tools-card.js`. The selected
non-default catalogue is loaded once from
`www/tools-card-locales/<lang>.js`, using the same frontend version query as
the main card. Requests and failures are cached for the browser session;
unsupported or unavailable catalogues safely fall back to English.

To add a language:

1. Create
   `custom_components/sofabaton_x1s/www/src/control-panel-translations/<lang>.ts`.
2. Export the translated subset as the module's default export. For a
   catalogue intended to be complete, declare it with
   `satisfies CompleteToolsCardTranslation`:

   ```ts
   import type { CompleteToolsCardTranslation } from "../strings";

   const translation = {
     tabs: {
       cache: "Hub",
       backup: "Back-up",
     },
     common: {
       cancel: "Annuleren",
       save: "Opslaan",
     },
   } satisfies CompleteToolsCardTranslation;

   export default translation;
   ```

3. Add the locale code to `TOOLS_CARD_LOCALES` in
   [`control-panel-language-loader.ts`](../custom_components/sofabaton_x1s/www/src/control-panel-language-loader.ts)
   and register its default export in the eager test helper
   [`control-panel-translations/index.ts`](../custom_components/sofabaton_x1s/www/src/control-panel-translations/index.ts).
   The build discovers catalogue source files automatically.
4. Run `npm run typecheck`, `npm run build:tools-card`, and
   `npm run test:frontend`.

Parameterized entries remain functions so each language controls word order
and pluralization. The frontend test suite also rejects newly introduced
literal UI text outside the English table.

## ◇ Style and space constraints

- Keep product and feature names unchanged: `Sofabaton`, `Home Assistant`,
  `Wifi Commands`, `Wifi Events`, and `MQTT Discovery`.
- Use **button assignment** for user-facing English copy. Choose one equivalent
  assignment term per locale and use it throughout both cards; internal keys
  such as `binding*` are implementation details, not translation guidance.
- Call the callback component the **HTTP listener**, never the HTTP service.
- Reuse each locale's editor label for **automatic power control** in progress
  messages instead of introducing a second translation for the same feature.
- Use **Playback** for the generic media-button section. Reserve *transport* for
  delivery methods such as MQTT and HTTP.
- Use **Fast forward** for the physical key. Compact key-face abbreviations such
  as `Fwd`, `Rew`, `Vol +`, and `Ch +` are allowed where space is constrained.
- Translate generic uses of *event*, *action*, *activity*, *device*, and
  *synchronization*. A product name such as `Wifi Events` does not make every
  surrounding use of “event” a product name.
- Use sentence case. Use the single-character ellipsis (`…`) for progress text,
  not three periods (`...`). French uses a non-breaking space before `:`, `;`,
  `?`, and `!` so punctuation cannot wrap onto a line by itself.
- Treat tabs, pills, chips, and buttons as compact copy. Prefer a direct verb
  when the surrounding UI already supplies the object. Put a longer
  explanation in helper text, a tooltip, or an `aria-label` rather than in the
  visible control.
- Judge compact copy by rendered width, not character count. The browser
  harness exercises every supported Control Panel locale at narrow card widths
  and rejects horizontally overflowing controls.

## ◇ Virtual Remote card

The Virtual Remote card renders every user-facing string through a central
string table, keyed by Home Assistant's UI language (`hass.locale.language`).
English is the complete reference; translations are **partial overlays** — any
key a language does not provide automatically falls back to English, so an
incomplete translation is safe to ship and improves incrementally.

## ◇ How it works

- [`remote-card-strings.ts`](../custom_components/sofabaton_x1s/www/src/remote-card-strings.ts)
  holds the English reference table (`REMOTE_CARD_STRINGS_EN`) and the language
  registry.
- The card calls `setRemoteCardLanguage(hass.locale.language)` whenever Home
  Assistant hands it a `hass` object; all rendering code reads strings through
  `str()`.
- Regional codes fall back to their base language (`de-CH` → `de`), and unknown
  languages fall back to English.

## ◇ Contributing a language

1. Create `custom_components/sofabaton_x1s/www/src/remote-card-translations/<lang>.ts`
   that registers a table mirroring the shape of `REMOTE_CARD_STRINGS_EN`.
   [`nl.ts`](../custom_components/sofabaton_x1s/www/src/remote-card-translations/nl.ts)
   is a complete example. Complete catalogues must use
   `satisfies RemoteCardStrings`; a deliberately partial table may omit it and
   rely on English fallback:

   ```ts
   import {
     registerRemoteCardTranslation,
     type RemoteCardStrings,
   } from "../remote-card-strings";

   const translation = {
     card: {
       poweredOff: "Ausgeschaltet",
       noMacros: "Keine Makros verfügbar",
       activityFallback: (id) => `Aktivität ${id}`,
     },
   } satisfies RemoteCardStrings;

   registerRemoteCardTranslation("de", translation);
   ```

2. Add `import "./<lang>";` to
   `remote-card-translations/index.ts`. (Do not import translation files from
   `remote-card-strings.ts` itself — that is a circular import.)
3. Run `npm run build:remote-card` and `npm run test:frontend`.

Entries with parameters are functions — translate the sentence around the
placeholder, keep the parameter.

## ◇ What is deliberately NOT translated

- Names coming from your hub (activities, devices, commands, favorites, macros).
- Generated YAML (keys/values consumed by Home Assistant) and MQTT discovery
  payloads — only the explanatory text around them is translatable.
- Protocol/state values such as `powered_off` (`POWERED_OFF_LABELS`); the
  *display* label "Powered Off" is translatable and the card recognizes both.
- Documentation URLs and stored config defaults.

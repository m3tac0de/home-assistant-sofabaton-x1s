// Registry of bundled translations for the Sofabaton Virtual Remote card.
//
// Each language module registers itself on import. This index is imported
// from remote-card.ts (the bundle entry) — NOT from remote-card-strings.ts,
// because ESM import hoisting would run the translation modules before the
// registry in remote-card-strings.ts is initialized (circular import).
//
// To add a language: create <lang>.ts next to this file (see nl.ts for a
// complete example) and add its import below.

import "./ar";
import "./en-gb";
import "./de";
import "./es";
import "./fr";
import "./nl";
import "./zh-hans";

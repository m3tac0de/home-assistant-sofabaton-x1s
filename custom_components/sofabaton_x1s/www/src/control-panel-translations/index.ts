// Eager registry used by unit tests and other source-level consumers.
//
// The production card does not import this module: it loads one standalone
// locale module on demand through control-panel-language-loader.ts.

import { registerToolsCardTranslation } from "../strings";
import de from "./de";
import enGb from "./en-gb";
import es from "./es";
import fr from "./fr";
import nl from "./nl";
import zhHans from "./zh-hans";

registerToolsCardTranslation("en-gb", enGb);
registerToolsCardTranslation("de", de);
registerToolsCardTranslation("es", es);
registerToolsCardTranslation("fr", fr);
registerToolsCardTranslation("nl", nl);
registerToolsCardTranslation("zh-hans", zhHans);

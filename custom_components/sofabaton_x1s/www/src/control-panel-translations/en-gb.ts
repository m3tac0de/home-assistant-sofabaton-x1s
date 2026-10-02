// English (en-GB) translation for the Sofabaton Control Panel card.
//
// Deliberately partial: only copy whose spelling differs from the American
// English reference table is overridden. All other keys fall back to that
// American English base.

import type { ToolsCardTranslation } from "../strings";

export const TOOLS_CARD_STRINGS_EN_GB = {
  common: {
    favoriteFallback: (id: number | string) => `Favourite ${id}`,
  },
  settings: {
    hubClickActionDescription:
      "Choose what happens when you click a command, favourite, macro, or button in the Hub tab lists.",
  },
  cache: {
    favoriteFallback: (commandId: number) => `Favourite ${commandId}`,
    favorites: "Favourites",
  },
  backendState: {
    backupFinalizing: "Finalising backup…",
    cacheFinalizing: "Finalising hub cache…",
  },
  hubClick: {
    kindLabels: {
      favorite: "Favourite",
    },
  },
  activities: {
  },
  backup: {
    roleCustomized: (name: string) => `${name} (customised)`,
    customizeButtonsToggle: "Customise individual buttons",
    bindingsNoneConfigured: "None customised",
    renameFavorite: "Rename favourite",
    buttonCatalog: {
      colour: "Colour",
    },
  },
  wifiCommands: {
    colorGroup: "Colour",
    favorite: "Set as favourite",
  },
} satisfies ToolsCardTranslation;

export default TOOLS_CARD_STRINGS_EN_GB;

// British English (en-GB) translation for the Sofabaton Control Panel card.
//
// Deliberately partial: only copy whose spelling differs from the American
// English reference table is overridden. All other keys fall back to English.

import { registerToolsCardTranslation } from "../strings";

registerToolsCardTranslation("en-gb", {
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
  hubClick: {
    kindLabels: {
      favorite: "Favourite",
    },
  },
  activities: {
    review: {
      roleCustomized: (group: string) => `${group} customised.`,
      idleChanged: (device: string, label: string) => `"${device}" idle behaviour → ${label}.`,
    },
  },
  backup: {
    powerNoDevices: "No devices yet. Add a favourite, binding, or macro that uses one.",
    roleCustomized: (name: string) => `${name} (customised)`,
    customizeButtonsToggle: "Customise individual buttons",
    bindingsNoneConfigured: "None customised",
    renameFavorite: "Rename Favourite",
  },
  wifiCommands: {
    colorGroup: "Colour",
    favorite: "Set as Favourite",
  },
});

// custom_components/sofabaton_x1s/www/src/control-panel-translations/en-gb.ts
var TOOLS_CARD_STRINGS_EN_GB = {
  common: {
    favoriteFallback: (id) => `Favourite ${id}`
  },
  settings: {
    hubClickActionDescription: "Choose what happens when you click a command, favourite, macro, or button in the Hub tab lists."
  },
  cache: {
    favoriteFallback: (commandId) => `Favourite ${commandId}`,
    favorites: "Favourites"
  },
  backendState: {
    backupFinalizing: "Finalising backup\u2026",
    cacheFinalizing: "Finalising hub cache\u2026"
  },
  hubClick: {
    kindLabels: {
      favorite: "Favourite"
    }
  },
  activities: {},
  backup: {
    roleCustomized: (name) => `${name} (customised)`,
    customizeButtonsToggle: "Customise individual buttons",
    bindingsNoneConfigured: "None customised",
    renameFavorite: "Rename favourite",
    buttonCatalog: {
      colour: "Colour"
    }
  },
  wifiCommands: {
    colorGroup: "Colour",
    favorite: "Set as favourite"
  }
};
var en_gb_default = TOOLS_CARD_STRINGS_EN_GB;
export {
  TOOLS_CARD_STRINGS_EN_GB,
  en_gb_default as default
};

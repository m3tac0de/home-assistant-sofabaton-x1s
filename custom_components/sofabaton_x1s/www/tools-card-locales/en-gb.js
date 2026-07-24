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
    activityCounts: (favourites, macros, buttons) => `${favourites} ${favourites === 1 ? "fav" : "favs"} / ${macros} ${macros === 1 ? "macro" : "macros"} / ${buttons} ${buttons === 1 ? "button" : "buttons"}`,
    favorites: "Favourites"
  },
  hubClick: {
    kindLabels: {
      favorite: "Favourite"
    }
  },
  activities: {
    review: {
      roleCustomized: (group) => `${group} customised.`,
      idleChanged: (device, label) => `"${device}" idle behaviour \u2192 ${label}.`
    }
  },
  backup: {
    powerNoDevices: "No devices yet. Add a favourite, binding, or macro that uses one.",
    activityMeta: (favourites, macros) => `${favourites} ${favourites === 1 ? "favourite" : "favourites"} \xB7 ${macros} ${macros === 1 ? "macro" : "macros"}`,
    roleCustomized: (name) => `${name} (customised)`,
    customizeButtonsToggle: "Customise individual buttons",
    bindingsNoneConfigured: "None customised",
    renameFavorite: "Rename Favourite"
  },
  wifiCommands: {
    colorGroup: "Colour",
    favorite: "Set as Favourite"
  }
};
var en_gb_default = TOOLS_CARD_STRINGS_EN_GB;
export {
  TOOLS_CARD_STRINGS_EN_GB,
  en_gb_default as default
};

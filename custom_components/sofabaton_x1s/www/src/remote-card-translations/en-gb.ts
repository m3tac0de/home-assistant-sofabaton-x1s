// British English (en-GB) translation for the Sofabaton Virtual Remote card.
//
// Deliberately partial: only the keys whose spelling differs from the
// American English base table (favourites, colour, customise). Everything
// else falls back to REMOTE_CARD_STRINGS_EN key by key.

import { registerRemoteCardTranslation } from "../remote-card-strings";

registerRemoteCardTranslation("en-gb", {
  card: {
    favoritesTab: "Favourites >",
    noFavorites: "No favourites available",
  },
  editor: {
    fieldLabels: {
      use_background_override: "Customise background colour",
      background_override: "Select Background Colour",
      show_favorites_button: "Favourites Button",
    },
    favorites: "Favourites",
    macrosFavoritesAsRows: "Macros/Favourites as rows",
  },
  groups: {
    macro_favorites: "Macros/Favourites",
    favorites_row: "Favourites Row",
    colors: "Colour Buttons",
  },
});

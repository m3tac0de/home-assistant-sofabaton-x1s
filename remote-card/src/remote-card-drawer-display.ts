import { macroFavoriteDisplayState } from "./remote-card-runtime-display";

export function drawerVisibilityState({
  activeDrawer,
  showMacrosButton,
  showFavoritesButton,
  editMode,
  macros,
  favorites,
  customFavorites,
  disableAllButtons,
}: {
  activeDrawer: string | null;
  showMacrosButton: boolean;
  showFavoritesButton: boolean;
  editMode: boolean;
  macros: any[];
  favorites: any[];
  customFavorites: any[];
  disableAllButtons: boolean;
}) {
  const display = macroFavoriteDisplayState({
    editMode,
    showMacrosButton,
    showFavoritesButton,
    macros,
    favorites,
    customFavorites,
    disableAllButtons,
  });

  let nextActiveDrawer = activeDrawer;
  if (!display.showMF && nextActiveDrawer) nextActiveDrawer = null;
  if (nextActiveDrawer === "macros" && !showMacrosButton) nextActiveDrawer = null;
  if (nextActiveDrawer === "favorites" && !showFavoritesButton) nextActiveDrawer = null;

  return {
    ...display,
    nextActiveDrawer,
    closedByVisibility: Boolean(activeDrawer && !nextActiveDrawer),
  };
}

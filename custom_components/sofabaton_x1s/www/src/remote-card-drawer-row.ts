export function buildMacroFavoritesSection({
  createActionButton,
  onMacrosClick,
  onFavoritesClick,
}: {
  createActionButton: (options: {
    label: string;
    onClick: () => void;
  }) => { wrap: HTMLDivElement; btn: HTMLElement };
  onMacrosClick: () => void;
  onFavoritesClick: () => void;
}) {
  const container = document.createElement("div");
  container.className = "mf-container";

  const row = document.createElement("div");
  row.className = "macroFavorites";

  const grid = document.createElement("div");
  grid.className = "macroFavoritesGrid";

  const macrosButton = createActionButton({
    label: "Macros >",
    onClick: onMacrosClick,
  });
  const favoritesButton = createActionButton({
    label: "Favorites >",
    onClick: onFavoritesClick,
  });

  grid.appendChild(macrosButton.wrap);
  grid.appendChild(favoritesButton.wrap);
  row.appendChild(grid);
  container.appendChild(row);

  const macrosOverlayEl = document.createElement("div");
  macrosOverlayEl.className = "mf-overlay mf-overlay--macros";
  const macrosOverlayGrid = document.createElement("div");
  macrosOverlayGrid.className = "mf-grid";
  macrosOverlayEl.appendChild(macrosOverlayGrid);
  container.appendChild(macrosOverlayEl);

  const favoritesOverlayEl = document.createElement("div");
  favoritesOverlayEl.className = "mf-overlay mf-overlay--favorites";
  const favoritesOverlayGrid = document.createElement("div");
  favoritesOverlayGrid.className = "mf-grid";
  favoritesOverlayEl.appendChild(favoritesOverlayGrid);
  container.appendChild(favoritesOverlayEl);

  return {
    container,
    row,
    grid,
    macrosButtonWrap: macrosButton.wrap,
    macrosButton: macrosButton.btn,
    favoritesButtonWrap: favoritesButton.wrap,
    favoritesButton: favoritesButton.btn,
    macrosOverlayEl,
    macrosOverlayGrid,
    favoritesOverlayEl,
    favoritesOverlayGrid,
  };
}

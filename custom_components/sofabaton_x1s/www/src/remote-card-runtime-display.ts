export function midModeState({
  showVolume,
  showChannel,
  isX2,
}: {
  showVolume: boolean;
  showChannel: boolean;
  isX2: boolean;
}) {
  const midMode =
    showVolume && showChannel
      ? "dual"
      : showVolume
        ? "volume"
        : showChannel
          ? "channel"
          : "off";
  return {
    midMode,
    classMap: {
      "mid--dual": midMode === "dual",
      "mid--volume": midMode === "volume",
      "mid--channel": midMode === "channel",
      "mid--x2": isX2,
      "mid--x1": !isX2,
    },
  };
}

export function mediaModeState({
  isX2,
  showMedia,
  showDvr,
}: {
  isX2: boolean;
  showMedia: boolean;
  showDvr: boolean;
}) {
  const mediaMode = isX2
    ? showMedia && showDvr
      ? "both"
      : showMedia
        ? "play"
        : showDvr
          ? "dvr"
          : "off"
    : showMedia || showDvr
      ? "play"
      : "off";
  return {
    mediaMode,
    classMap: {
      "media--play": mediaMode === "play",
      "media--dvr": mediaMode === "dvr",
      "media--both": mediaMode === "both",
      "media--x2": isX2,
      "media--x1": !isX2,
    },
  };
}

export function runtimeButtonVisibility({
  isX2,
  showVolume,
  showChannel,
  showMedia,
  showDvr,
}: {
  isX2: boolean;
  showVolume: boolean;
  showChannel: boolean;
  showMedia: boolean;
  showDvr: boolean;
}) {
  const showPause = showDvr || (!isX2 && showMedia);
  return {
    volup: showVolume,
    voldn: showVolume,
    mute: showVolume,
    guide: isX2 && showChannel,
    chup: showChannel,
    chdn: showChannel,
    rew: showMedia,
    play: showMedia && isX2,
    fwd: showMedia,
    dvr: isX2 && showDvr,
    pause: showPause,
    exit: isX2 && showDvr,
  };
}

export function macroFavoriteDisplayState({
  editMode,
  showMacrosButton,
  showFavoritesButton,
  macros,
  favorites,
  customFavorites,
  disableAllButtons,
}: {
  editMode: boolean;
  showMacrosButton: boolean;
  showFavoritesButton: boolean;
  macros: any[];
  favorites: any[];
  customFavorites: any[];
  disableAllButtons: boolean;
}) {
  const showMF = showMacrosButton || showFavoritesButton;
  const visibleCount = (showMacrosButton ? 1 : 0) + (showFavoritesButton ? 1 : 0);
  const macrosEnabled = editMode ? true : macros.length > 0;
  const favoritesEnabled = editMode
    ? true
    : favorites.length + customFavorites.length > 0;
  return {
    showMF,
    visibleCount,
    macrosDisabled: disableAllButtons || !macrosEnabled,
    favoritesDisabled: disableAllButtons || !favoritesEnabled,
  };
}

export function combinedFavoritesSignature(customFavoritesSig: string, favoritesSig: string) {
  return `${customFavoritesSig}||${favoritesSig}`;
}

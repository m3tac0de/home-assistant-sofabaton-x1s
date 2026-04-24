export function buildRemoteGroups({
  createHuiButton,
  createColorKey,
  ids,
}: {
  createHuiButton: (options: Record<string, any>) => HTMLDivElement;
  createColorKey: (options: Record<string, any>) => HTMLDivElement;
  ids: Record<string, number>;
}) {
  const dpadEl = document.createElement("div");
  dpadEl.className = "dpad";
  dpadEl.appendChild(
    createHuiButton({
      key: "up",
      label: "",
      icon: "mdi:chevron-up",
      id: ids.UP,
      cmd: ids.UP,
      extraClass: "area-up",
    }),
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "left",
      label: "",
      icon: "mdi:chevron-left",
      id: ids.LEFT,
      cmd: ids.LEFT,
      extraClass: "area-left",
    }),
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "ok",
      label: "OK",
      icon: "",
      id: ids.OK,
      cmd: ids.OK,
      extraClass: "area-ok okKey",
      size: "big",
    }),
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "right",
      label: "",
      icon: "mdi:chevron-right",
      id: ids.RIGHT,
      cmd: ids.RIGHT,
      extraClass: "area-right",
    }),
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "down",
      label: "",
      icon: "mdi:chevron-down",
      id: ids.DOWN,
      cmd: ids.DOWN,
      extraClass: "area-down",
    }),
  );

  const navRowEl = document.createElement("div");
  navRowEl.className = "row3";
  navRowEl.appendChild(
    createHuiButton({
      key: "back",
      label: "",
      icon: "mdi:arrow-u-left-top",
      id: ids.BACK,
      cmd: ids.BACK,
    }),
  );
  navRowEl.appendChild(
    createHuiButton({
      key: "home",
      label: "",
      icon: "mdi:home",
      id: ids.HOME,
      cmd: ids.HOME,
    }),
  );
  navRowEl.appendChild(
    createHuiButton({
      key: "menu",
      label: "",
      icon: "mdi:menu",
      id: ids.MENU,
      cmd: ids.MENU,
    }),
  );

  const midEl = document.createElement("div");
  midEl.className = "mid";
  const midButtons = {
    volup: createHuiButton({
      key: "volup",
      label: "",
      icon: "mdi:volume-plus",
      id: ids.VOL_UP,
      cmd: ids.VOL_UP,
      extraClass: "mid-btn mid-btn-volup",
    }),
    voldn: createHuiButton({
      key: "voldn",
      label: "",
      icon: "mdi:volume-minus",
      id: ids.VOL_DOWN,
      cmd: ids.VOL_DOWN,
      extraClass: "mid-btn mid-btn-voldn",
    }),
    guide: createHuiButton({
      key: "guide",
      label: "Guide",
      icon: "",
      id: ids.GUIDE,
      cmd: ids.GUIDE,
      extraClass: "mid-btn mid-btn-guide",
    }),
    mute: createHuiButton({
      key: "mute",
      label: "",
      icon: "mdi:volume-mute",
      id: ids.MUTE,
      cmd: ids.MUTE,
      extraClass: "mid-btn mid-btn-mute",
    }),
    chup: createHuiButton({
      key: "chup",
      label: "",
      icon: "mdi:chevron-up",
      id: ids.CH_UP,
      cmd: ids.CH_UP,
      extraClass: "mid-btn mid-btn-chup",
    }),
    chdn: createHuiButton({
      key: "chdn",
      label: "",
      icon: "mdi:chevron-down",
      id: ids.CH_DOWN,
      cmd: ids.CH_DOWN,
      extraClass: "mid-btn mid-btn-chdn",
    }),
  };
  Object.values(midButtons).forEach((btn) => midEl.appendChild(btn));

  const mediaEl = document.createElement("div");
  mediaEl.className = "media";
  const mediaButtons = {
    rew: createHuiButton({
      key: "rew",
      label: "",
      icon: "mdi:rewind",
      id: ids.REW,
      cmd: ids.REW,
      extraClass: "area-rew",
    }),
    play: createHuiButton({
      key: "play",
      label: "",
      icon: "mdi:play",
      id: ids.PLAY,
      cmd: ids.PLAY,
      extraClass: "area-play",
    }),
    fwd: createHuiButton({
      key: "fwd",
      label: "",
      icon: "mdi:fast-forward",
      id: ids.FWD,
      cmd: ids.FWD,
      extraClass: "area-fwd",
    }),
    dvr: createHuiButton({
      key: "dvr",
      label: "DVR",
      icon: "",
      id: ids.DVR,
      cmd: ids.DVR,
      extraClass: "area-dvr",
    }),
    pause: createHuiButton({
      key: "pause",
      label: "",
      icon: "mdi:pause",
      id: ids.PAUSE,
      cmd: ids.PAUSE,
      extraClass: "area-pause",
    }),
    exit: createHuiButton({
      key: "exit",
      label: "Exit",
      icon: "",
      id: ids.EXIT,
      cmd: ids.EXIT,
      extraClass: "area-exit",
    }),
  };
  Object.values(mediaButtons).forEach((btn) => mediaEl.appendChild(btn));

  const colorsEl = document.createElement("div");
  colorsEl.className = "colors";
  const colorsGrid = document.createElement("div");
  colorsGrid.className = "colorsGrid";
  colorsGrid.appendChild(
    createColorKey({
      key: "red",
      id: ids.RED,
      cmd: ids.RED,
      color: "#d32f2f",
    }),
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "green",
      id: ids.GREEN,
      cmd: ids.GREEN,
      color: "#388e3c",
    }),
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "yellow",
      id: ids.YELLOW,
      cmd: ids.YELLOW,
      color: "#fbc02d",
    }),
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "blue",
      id: ids.BLUE,
      cmd: ids.BLUE,
      color: "#1976d2",
    }),
  );
  colorsEl.appendChild(colorsGrid);

  const abcEl = document.createElement("div");
  abcEl.className = "abc";
  const abcGrid = document.createElement("div");
  abcGrid.className = "abcGrid";
  abcGrid.appendChild(
    createHuiButton({
      key: "a",
      label: "A",
      icon: "",
      id: ids.A,
      cmd: ids.A,
      size: "small",
    }),
  );
  abcGrid.appendChild(
    createHuiButton({
      key: "b",
      label: "B",
      icon: "",
      id: ids.B,
      cmd: ids.B,
      size: "small",
    }),
  );
  abcGrid.appendChild(
    createHuiButton({
      key: "c",
      label: "C",
      icon: "",
      id: ids.C,
      cmd: ids.C,
      size: "small",
    }),
  );
  abcEl.appendChild(abcGrid);

  return {
    dpadEl,
    navRowEl,
    midEl,
    midButtons,
    mediaEl,
    mediaButtons,
    colorsEl,
    abcEl,
  };
}

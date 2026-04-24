export function buildDrawerButtonElement({
  model,
  rawItem,
  itemType,
  attachPrimaryAction,
  onTrigger,
}: {
  model: {
    label: string;
    commandId: number;
    deviceId: number;
    icon: string | null;
    commandType: string;
  };
  rawItem: any;
  itemType: string;
  attachPrimaryAction: (target: EventTarget | EventTarget[], handler: () => void) => void;
  onTrigger: (args: {
    model: {
      label: string;
      commandId: number;
      deviceId: number;
      icon: string | null;
      commandType: string;
    };
    itemType: string;
    rawItem: any;
  }) => void;
}) {
  const card = document.createElement("ha-card");
  card.classList.add("drawer-btn");
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const inner = document.createElement("div");
  inner.className = "drawer-btn__inner drawer-btn__inner--stack";

  if (model.icon) {
    const ic = document.createElement("ha-icon");
    ic.className = "drawer-btn__icon";
    ic.setAttribute("icon", model.icon);
    inner.appendChild(ic);
  }

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = model.label;
  inner.appendChild(name);

  card.appendChild(inner);

  attachPrimaryAction(card, () => {
    if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) return;
    onTrigger({ model, itemType, rawItem });
  });

  return card;
}

export function buildCustomFavoriteButtonElement({
  model,
  rawFavorite,
  attachPrimaryAction,
  onTrigger,
}: {
  model: {
    label: string;
    icon: string | null;
    action: any;
    commandId: number;
    deviceId: number;
  };
  rawFavorite: any;
  attachPrimaryAction: (target: EventTarget | EventTarget[], handler: () => void) => void;
  onTrigger: (args: {
    model: {
      label: string;
      icon: string | null;
      action: any;
      commandId: number;
      deviceId: number;
    };
    rawFavorite: any;
  }) => void;
}) {
  const card = document.createElement("ha-card");
  card.classList.add("drawer-btn", "drawer-btn--custom");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.style.gridColumn = "1 / -1";

  const inner = document.createElement("div");
  inner.className = "drawer-btn__inner drawer-btn__inner--row";

  if (model.icon) {
    const ic = document.createElement("ha-icon");
    ic.className = "drawer-btn__icon";
    ic.setAttribute("icon", model.icon);
    inner.appendChild(ic);
  }

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = model.label;
  inner.appendChild(name);

  card.appendChild(inner);

  attachPrimaryAction(card, () => {
    onTrigger({ model, rawFavorite });
  });

  return card;
}

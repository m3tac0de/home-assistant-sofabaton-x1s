export function buildHuiButtonElement({
  model,
  hass,
}: {
  model: {
    wrapClassName: string;
    buttonConfig: Record<string, any>;
  };
  hass: any;
}) {
  const wrap = document.createElement("div");
  wrap.className = model.wrapClassName;

  const btn = document.createElement("hui-button-card") as any;
  btn.hass = hass;
  btn.setConfig(model.buttonConfig);
  wrap.appendChild(btn);

  return { wrap, btn };
}

export function buildColorKeyElement({
  model,
  hass,
}: {
  model: {
    wrapClassName: string;
    color: string;
    buttonConfig: Record<string, any>;
  };
  hass: any;
}) {
  const wrap = document.createElement("div");
  wrap.className = model.wrapClassName;
  wrap.style.setProperty("--sb-color", model.color);

  const btn = document.createElement("hui-button-card") as any;
  btn.hass = hass;
  btn.setConfig(model.buttonConfig);
  wrap.appendChild(btn);

  const bar = document.createElement("div");
  bar.className = "colorBar";
  wrap.appendChild(bar);

  return { wrap, btn };
}

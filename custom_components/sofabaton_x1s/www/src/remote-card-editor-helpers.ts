export function normalizeCustomFavorite(item: any, idx = 0) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? item.label ?? "").trim();
  if (!name) return null;

  const icon =
    item.icon != null && String(item.icon).trim()
      ? String(item.icon).trim()
      : null;

  const action =
    item.action && typeof item.action === "object"
      ? item.action
      : item.tap_action && typeof item.tap_action === "object"
        ? item.tap_action
        : null;

  const rawCmd =
    item.command_id ??
    item.key_id ??
    item.command ??
    item.key ??
    item.id ??
    null;
  const rawDev =
    item.device_id ??
    item.activity_id ??
    item.device ??
    item.activity ??
    null;

  const cmd = rawCmd != null ? Number(rawCmd) : null;
  const dev = rawDev != null ? Number(rawDev) : null;

  const hasIds =
    Number.isFinite(cmd) && (rawDev == null || Number.isFinite(dev));
  const hasAction = !!(
    action &&
    (action.action ||
      action.service ||
      action.perform_action ||
      action.navigation_path ||
      action.url_path)
  );

  if (!hasIds && !hasAction) return null;

  return {
    __custom: true,
    name,
    icon,
    action: hasAction ? action : null,
    command_id: Number.isFinite(cmd) ? cmd : null,
    device_id: Number.isFinite(dev) ? dev : null,
    _idx: idx,
    _raw: item,
  };
}

export function customFavoritesSignature(items: any[]) {
  const list = Array.isArray(items) ? items : [];
  const parts = list.map((it) => {
    const n = String(it?.name ?? "");
    const ic = String(it?.icon ?? "");
    const cmd = String(it?.command_id ?? "");
    const dev = String(it?.device_id ?? "");
    let act = "";
    try {
      act = it?.action ? JSON.stringify(it.action) : "";
    } catch (e) {
      act = "[unserializable]";
    }
    return `${n}|${ic}|${cmd}|${dev}|${act}`;
  });
  return `${parts.length}:${parts.join(";;")}`;
}

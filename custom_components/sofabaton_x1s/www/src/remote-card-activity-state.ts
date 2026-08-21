import { isPoweredOffLabel } from "./remote-card-state";
import { str } from "./remote-card-strings";

export function buildActivitySelectState({
  editMode,
  preview,
  activities,
  currentActivityLabel,
  pendingActivity,
  pendingExpired,
}: {
  editMode: boolean;
  preview: any;
  activities: Array<{ id: number; name: string }>;
  currentActivityLabel: string;
  pendingActivity: string | null;
  pendingExpired: boolean;
}) {
  const options = [
    ...(editMode ? [str().card.defaultLayout] : []),
    str().card.poweredOff,
    ...activities.map((activity) => activity.name),
  ];

  const previewLabel = preview
    ? preview.poweredOff
      ? str().card.poweredOff
      : preview.label || str().card.activityFallback(preview.activityId)
    : null;

  if (previewLabel && !options.includes(previewLabel)) {
    options.push(previewLabel);
  }

  const current = previewLabel || currentActivityLabel || str().card.poweredOff;
  const poweredOff = preview
    ? preview.poweredOff
    : isPoweredOffLabel(current);
  const resolvedValue =
    pendingActivity && !pendingExpired && pendingActivity !== current
      ? pendingActivity
      : current;
  const disabled = editMode || (preview ? true : options.length <= 1);

  return {
    options,
    previewLabel,
    current,
    poweredOff,
    resolvedValue,
    disabled,
    clearPending: Boolean(pendingActivity && (pendingExpired || current === pendingActivity)),
  };
}

/**
 * Device-mode dropdown state. Unlike the activity select (which keys options
 * by display name), device options carry explicit id values so duplicate
 * device names never collide. The empty value is the "Select device"
 * placeholder — devices have no equivalent of "current activity state" to
 * open on.
 */
export function buildDeviceSelectState({
  editMode,
  preview,
  devices,
  currentDeviceId,
}: {
  editMode: boolean;
  preview: { mode?: string; deviceId?: number | null; label?: string } | null;
  devices: Array<{ id: number; name: string }>;
  currentDeviceId: number | null;
}) {
  const options: Array<{ value: string; label: string }> = [
    { value: "", label: str().card.selectDevice },
    ...devices.map((device) => ({
      value: String(device.id),
      label: device.name,
    })),
  ];

  let resolvedValue = currentDeviceId != null ? String(currentDeviceId) : "";
  if (editMode && preview?.mode === "device") {
    if (preview.deviceId == null) {
      // "All devices (default)" preview: surface its label as a synthetic
      // option so the select shows what is being edited.
      options.push({ value: "device:default", label: str().card.allDevicesLayout });
      resolvedValue = "device:default";
    } else {
      resolvedValue = String(preview.deviceId);
      if (!options.some((option) => option.value === resolvedValue)) {
        options.push({
          value: resolvedValue,
          label: str().card.deviceFallback(preview.deviceId),
        });
      }
    }
  }

  return {
    options,
    resolvedValue,
    disabled: editMode,
  };
}

export function noActivitiesWarning(
  isUnavailable: boolean,
  activitiesLength: number,
  loadState: unknown,
) {
  if (!isUnavailable && activitiesLength === 0 && loadState !== "loading") {
    return str().card.noActivitiesWarning;
  }
  return "";
}

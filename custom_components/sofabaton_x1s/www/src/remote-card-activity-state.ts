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

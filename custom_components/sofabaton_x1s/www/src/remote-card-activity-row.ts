export function buildActivityRow({
  onSelect,
  onMenuOpened,
  onMenuClosed,
  openEvents,
  closeEvents,
}: {
  onSelect: (event: Event) => void;
  onMenuOpened: () => void;
  onMenuClosed: () => void;
  openEvents: string[];
  closeEvents: string[];
}) {
  const row = document.createElement("div");
  row.className = "activityRow";

  const select = document.createElement("ha-select") as any;
  select.label = "Activity";
  select.classList.add("sb-activity-select");
  select.addEventListener("selected", onSelect);
  select.addEventListener("change", onSelect);

  openEvents.forEach((eventName) => {
    select.addEventListener(eventName, onMenuOpened, true);
  });
  closeEvents.forEach((eventName) => {
    select.addEventListener(eventName, onMenuClosed, true);
  });
  select.addEventListener("change", onMenuClosed, true);
  select.addEventListener("blur", onMenuClosed, true);

  row.appendChild(select);

  const loadIndicator = document.createElement("div");
  loadIndicator.className = "loadIndicator";
  row.appendChild(loadIndicator);

  return {
    row,
    select,
    loadIndicator,
  };
}

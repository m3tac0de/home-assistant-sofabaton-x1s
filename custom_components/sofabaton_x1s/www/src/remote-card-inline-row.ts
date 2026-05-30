export function buildInlineDrawerRow(kind: "macros" | "favorites") {
  const container = document.createElement("div");
  container.className = `inline-drawer-row inline-drawer-row--${kind}`;

  const scroller = document.createElement("div");
  scroller.className = "inline-drawer-row__scroller";

  const grid = document.createElement("div");
  grid.className = "inline-drawer-row__grid mf-grid";

  scroller.appendChild(grid);
  container.appendChild(scroller);

  return { container, scroller, grid };
}

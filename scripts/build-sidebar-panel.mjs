import { build } from "esbuild";

// The "Sofabaton X" sidebar panel: the panel shell + the sidebar remote.
// tools-card.js (the control panel) is NOT bundled here; the panel
// import()s it by URL when an admin opens the control panel.
await build({
  entryPoints: ["remote-card/src/sidebar-panel.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "custom_components/sofabaton_x1s/www/sidebar-panel.js",
  sourcemap: false,
  legalComments: "none",
});

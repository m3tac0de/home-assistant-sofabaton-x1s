import { build } from "esbuild";

await build({
  entryPoints: ["custom_components/sofabaton_x1s/www/src/remote-card.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "custom_components/sofabaton_x1s/www/remote-card.js",
  sourcemap: false,
  legalComments: "none",
});

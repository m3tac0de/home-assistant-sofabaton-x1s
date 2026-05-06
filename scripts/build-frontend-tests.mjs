import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("tests/frontend-dist", { recursive: true });

await build({
  entryPoints: [
    "tests/frontend/control-panel-store.test.ts",
    "tests/frontend/wifi-commands-state.test.ts",
  ],
  outdir: "tests/frontend-dist",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
});

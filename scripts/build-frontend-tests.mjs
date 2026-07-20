import { build } from "esbuild";
import { mkdir, readdir } from "node:fs/promises";

await mkdir("tests/frontend-dist", { recursive: true });

const entryPoints = (await readdir("tests/frontend"))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => `tests/frontend/${name}`);

await build({
  entryPoints,
  outdir: "tests/frontend-dist",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
});

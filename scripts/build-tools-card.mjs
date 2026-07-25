import { build } from "esbuild";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

const wwwDir = "custom_components/sofabaton_x1s/www";
const translationSourceDir = join(wwwDir, "src/control-panel-translations");
const localeOutputDir = join(wwwDir, "tools-card-locales");
const localeEntryPoints = Object.fromEntries(
  (await readdir(translationSourceDir))
    .filter((filename) => filename.endsWith(".ts") && filename !== "index.ts")
    .map((filename) => [
      basename(filename, ".ts"),
      join(translationSourceDir, filename),
    ]),
);

// This directory contains generated assets only. Removing it first also drops
// stale locale files after a source catalogue is renamed or removed.
await rm(localeOutputDir, { recursive: true, force: true });
await mkdir(localeOutputDir, { recursive: true });

const sharedBuildOptions = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
};

await build({
  ...sharedBuildOptions,
  entryPoints: [join(wwwDir, "src/tools-card.ts")],
  outfile: join(wwwDir, "tools-card.js"),
});

await build({
  ...sharedBuildOptions,
  entryPoints: localeEntryPoints,
  outdir: localeOutputDir,
  entryNames: "[name]",
});

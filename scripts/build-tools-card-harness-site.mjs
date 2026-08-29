import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const DIST_ROOT = resolve(ROOT, "dist");
const OUTPUT_DIR = resolve(DIST_ROOT, "tools-card-harness-site");
const HARNESS_SOURCE = join(ROOT, "tests", "tools-card-harness.html");
const WWW_SOURCE = join(
  ROOT,
  "custom_components",
  "sofabaton_x1s",
  "www",
);
const PUBLISHED_BUNDLE_PATH =
  "../custom_components/sofabaton_x1s/www/tools-card.js";

function assertSafeOutputDirectory(outputDir) {
  const relativeOutput = relative(DIST_ROOT, outputDir);
  if (
    !relativeOutput
    || relativeOutput === ".."
    || relativeOutput.startsWith(`..${sep}`)
  ) {
    throw new Error(`Refusing to replace unsafe output directory: ${outputDir}`);
  }
}

function assetVersion() {
  const value = String(process.env.HARNESS_ASSET_VERSION || "local").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(
      "HARNESS_ASSET_VERSION may contain only letters, numbers, dots, underscores, and hyphens.",
    );
  }
  return value;
}

function rootIndex() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sofabaton Control Panel — Test Harness</title>
</head>
<body>
  <p>
    Opening the
    <a id="harness-link" href="./tests/tools-card-harness.html">Sofabaton Control Panel test harness</a>…
  </p>
  <script>
    const target = new URL("./tests/tools-card-harness.html", window.location.href);
    target.search = window.location.search;
    target.hash = window.location.hash;
    document.getElementById("harness-link").href = target.href;
    window.location.replace(target.href);
  </script>
</body>
</html>
`;
}

async function build() {
  assertSafeOutputDirectory(OUTPUT_DIR);
  const version = assetVersion();
  const harness = await readFile(HARNESS_SOURCE, "utf8");
  const bundleReference = `${PUBLISHED_BUNDLE_PATH}?v=harness`;
  if (!harness.includes(bundleReference)) {
    throw new Error(
      `Harness no longer contains the expected bundle reference: ${bundleReference}`,
    );
  }

  const publishedHarness = harness.replace(
    bundleReference,
    `${PUBLISHED_BUNDLE_PATH}?v=${version}`,
  );
  const publishedTestsDir = join(OUTPUT_DIR, "tests");
  const publishedFixturesDir = join(publishedTestsDir, "fixtures");
  const publishedWwwDir = join(
    OUTPUT_DIR,
    "custom_components",
    "sofabaton_x1s",
    "www",
  );

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(publishedFixturesDir, { recursive: true });
  await mkdir(publishedWwwDir, { recursive: true });
  await writeFile(join(OUTPUT_DIR, "index.html"), rootIndex(), "utf8");
  await writeFile(
    join(publishedTestsDir, "tools-card-harness.html"),
    publishedHarness,
    "utf8",
  );
  // HA theme fixture (base palette + community themes) the harness's theme
  // switcher is driven by; regenerate with scripts/fetch-ha-themes.mjs.
  await cp(
    join(ROOT, "tests", "fixtures", "ha-themes.js"),
    join(publishedFixturesDir, "ha-themes.js"),
  );
  await cp(
    join(ROOT, "tests", "fixtures", "ha-theme-engine.js"),
    join(publishedFixturesDir, "ha-theme-engine.js"),
  );
  await cp(
    join(WWW_SOURCE, "tools-card.js"),
    join(publishedWwwDir, "tools-card.js"),
  );
  await cp(
    join(WWW_SOURCE, "tools-card-locales"),
    join(publishedWwwDir, "tools-card-locales"),
    { recursive: true },
  );

  console.log(`Built tools-card harness site at ${OUTPUT_DIR}`);
  console.log(`Asset version: ${version}`);
}

await build();

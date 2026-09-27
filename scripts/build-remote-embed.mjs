// Builds the embeddable remote (docs/internal/remote-embed-plan.md, E3 + E6):
// <sofabaton-remote> for other people's dashboards. Two outputs from the
// same source, minified, Lit and the icon set bundled, every internal tag
// prefixed (scripts/tag-prefix.mjs) so the element never collides with a
// host page's own `ha-icon` or with the HA card:
//
//   server build -> sofabaton_server/ui/embed/sofabaton-remote.js, served
//     at /ui/embed/; committed like the other bundles, the frontend CI
//     drift check covers the directory and
//     tests/frontend/remote-embed-bundle.test.ts audits the prefixing.
//   npm build -> packages/sofabaton-x-remote/dist/sofabaton-remote.js,
//     not committed (dist/ is ignored); the release workflow builds and
//     publishes it. It requires the `server` attribute and checks the
//     server's version against MIN_SERVER_VERSION.

import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { tagPrefixPlugin } from "./tag-prefix.mjs";

export const EMBED_OUTFILE = "sofabaton-x-server/src/sofabaton_server/ui/embed/sofabaton-remote.js";
export const NPM_PACKAGE_DIR = "packages/sofabaton-x-remote";
export const NPM_OUTFILE = `${NPM_PACKAGE_DIR}/dist/sofabaton-remote.js`;

const packageVersion = JSON.parse(readFileSync(`${NPM_PACKAGE_DIR}/package.json`, "utf8")).version;

const common = {
  entryPoints: ["remote-card/src/remote-embed.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  plugins: [tagPrefixPlugin()],
};

await build({
  ...common,
  outfile: EMBED_OUTFILE,
  define: { __SBX_EMBED_DIST__: '"server"', __SBX_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
});

await build({
  ...common,
  outfile: NPM_OUTFILE,
  define: { __SBX_EMBED_DIST__: '"npm"', __SBX_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
});

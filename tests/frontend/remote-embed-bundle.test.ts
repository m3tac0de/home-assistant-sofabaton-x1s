// The embed build's tag prefixing (docs/internal/remote-embed-plan.md,
// decision 4 and E3): the rewrite rules on small inputs, and the committed
// bundle (kept in step with the sources by the CI drift check) checked for
// no unprefixed internal tag, every prefixed one defined, the public tag
// defined, the HA-version probe left alone and every custom property name
// intact.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { EMBED_TAG_MAP, findUnprefixedTags, prefixTags } from "../../scripts/tag-prefix.mjs";

const BUNDLE = path.resolve("sofabaton-x-server/src/sofabaton_server/ui/embed/sofabaton-remote.js");
const NPM_DIR = path.resolve("packages/sofabaton-x-remote");
const NPM_BUNDLE = path.join(NPM_DIR, "dist/sofabaton-remote.js");

test("markup, registry strings and CSS compound selectors are rewritten", () => {
  const out = prefixTags(`
    html\`<ha-card><ha-icon icon="mdi:power"></ha-icon><sb-key-button></sb-key-button></ha-card>\`
    customElements.define("ha-select", X); customElements.get('mwc-list-item'); document.createElement(\`ha-icon\`)
    export const TYPE = "sofabaton-virtual-remote"; export const EDITOR = "sofabaton-virtual-remote-editor";
    ha-card { width: 100% }
    .sb-notice ha-icon { --mdc-icon-size: 16px; }
    .sb-activity-select mwc-list-item[selected], .x > ha-select:focus, :host(ha-card) {}
  `);
  assert.match(out, /<sbx-ha-card><sbx-ha-icon icon="mdi:power"><\/sbx-ha-icon><sbx-key-button><\/sbx-key-button><\/sbx-ha-card>/);
  assert.match(out, /define\("sbx-ha-select"/);
  assert.match(out, /get\('sbx-mwc-list-item'\)/);
  assert.match(out, /createElement\(`sbx-ha-icon`\)/);
  assert.match(out, /TYPE = "sbx-virtual-remote";/);
  assert.match(out, /EDITOR = "sbx-virtual-remote-editor";/);
  assert.match(out, /\n\s+sbx-ha-card \{ width/);
  assert.match(out, /\.sb-notice sbx-ha-icon \{/);
  assert.match(out, /\.sb-activity-select sbx-mwc-list-item\[selected\], \.x > sbx-ha-select:focus, :host\(sbx-ha-card\)/);
  assert.deepEqual(findUnprefixedTags(out), []);
});

test("look-alikes stay: custom property names, longer names, the probe, prose and paths", () => {
  const source = `
    var(--ha-card-background) var(--ha-card-border-radius, 12px) --ha-color-form-background
    vars?.["ha-card-background"] .sb-key-button-label { } "ha-dropdown-item"
    import "../components/sb-key-button"; // ha-card's bounds; sb-key-button's rule
    "https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md"
    console.error("[sofabaton-virtual-remote] failed")
    <sofabaton-remote hub="x"></sofabaton-remote>
  `;
  const out = prefixTags(source);
  assert.equal(out.includes("sbx-"), false, out);
  assert.equal(out, source);
});

test("the committed embed bundle defines only prefixed internal tags and keeps the variable names", () => {
  const bundle = readFileSync(BUNDLE, "utf8");
  const registryUse = (tag: string) =>
    new RegExp(`(define|get|whenDefined|createElement|closest)\\(["'\`]${tag}["'\`]`).test(bundle);
  const markup = (tag: string) => new RegExp(`<\\/?${tag}(?![\\w-])`).test(bundle);
  for (const [tag, renamed] of Object.entries(EMBED_TAG_MAP)) {
    assert.equal(registryUse(tag), false, `${tag} is still used with the registry`);
    assert.equal(markup(tag), false, `${tag} is still used in markup`);
    // The minifier passes the card's tag constant to define() as a variable,
    // so the literal is what the bundle must carry.
    assert.ok(bundle.includes(`"${renamed}"`), `${renamed} is not in the bundle`);
    assert.equal(bundle.includes(`"${tag}"`), false, `${tag} is still a string literal`);
  }
  // Only the prefixed internals reach the registry by literal; the card and
  // the public tag go through their constants.
  const defined = [...bundle.matchAll(/customElements\.define\(["'`]([a-z0-9-]+)["'`]/g)].map((m) => m[1]).sort();
  assert.deepEqual(defined, ["sbx-ha-card", "sbx-ha-icon", "sbx-ha-select", "sbx-key-button", "sbx-mwc-list-item"]);
  assert.ok(bundle.includes('"sofabaton-remote"'), "the public tag");
  assert.equal(/define\(["'`]sbx-virtual-remote-editor["'`]/.test(bundle), false, "the embed never defines the editor");
  assert.ok(/get\(["'`]ha-dropdown-item["'`]\)/.test(bundle), "the HA-version probe must stay unprefixed");
  // Custom property names are untouched: the card's own theming reads them.
  assert.ok(bundle.includes("--ha-card-background"), "--ha-card-background");
  assert.ok(bundle.includes("--ha-card-border-radius"), "--ha-card-border-radius");
  assert.equal(bundle.includes("--sbx-"), false, "a custom property name was prefixed");
  // Whatever is left unprefixed is a URL, a log label or prose in a CSS
  // comment (esbuild keeps template-literal content), never a tag.
  const leftovers = findUnprefixedTags(bundle).filter(
    (hit) => !/github\.com|\[sofabaton-virtual-remote\]/.test(hit.context) && !hit.context.includes(`${hit.tag}'s`),
  );
  assert.deepEqual(leftovers, []);
  // The served build never checks the server's version (same commit) and
  // carries no package banner.
  assert.equal(bundle.includes("needs sofabaton-x-server"), false);
});

// The npm build is not committed (dist/ is ignored); `npm run build:remote-embed`
// writes it next to the served one and CI builds before testing.
test("the npm build is the same prefixed element with its package version and the server check", {
  skip: existsSync(NPM_BUNDLE) ? false : "packages/sofabaton-x-remote/dist is not built",
}, () => {
  const bundle = readFileSync(NPM_BUNDLE, "utf8");
  const version = JSON.parse(readFileSync(path.join(NPM_DIR, "package.json"), "utf8")).version as string;
  assert.ok(bundle.includes(`"${version}"`), "the package version is embedded");
  assert.ok(bundle.includes("needs sofabaton-x-server"), "the package banner names the server floor");
  assert.ok(bundle.includes("this package needs sofabaton-x-server"), "the server_too_old notice");
  assert.ok(bundle.includes('"sofabaton-remote"'));
  const leftovers = findUnprefixedTags(bundle).filter(
    (hit) => !/github\.com|\[sofabaton-virtual-remote\]/.test(hit.context) && !hit.context.includes(`${hit.tag}'s`),
  );
  assert.deepEqual(leftovers, []);
  assert.equal(bundle.includes("--sbx-"), false);
  // What the package ships.
  const manifest = JSON.parse(readFileSync(path.join(NPM_DIR, "package.json"), "utf8"));
  assert.equal(manifest.name, "sofabaton-x-remote");
  assert.equal(manifest.type, "module");
  assert.equal(manifest.exports["."].default, "./dist/sofabaton-remote.js");
  assert.equal(manifest.exports["."].types, "./index.d.ts");
  for (const file of ["index.d.ts", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(manifest.files.includes(file), file);
    assert.ok(existsSync(path.join(NPM_DIR, file)), file);
  }
  const notices = readFileSync(path.join(NPM_DIR, "THIRD_PARTY_NOTICES.md"), "utf8");
  assert.match(notices, /## Lit .*BSD-3-Clause/);
  assert.match(notices, /## @mdi\/js .*Pictogrammers Free License/);
});

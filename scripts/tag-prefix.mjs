// Tag prefixing for the embeddable remote (docs/internal/remote-embed-plan.md,
// decision 4 and E3): the embed build renames every internal custom
// element so a host page that defines its own `ha-icon` (or loads the HA
// card next to the embed) never collides with the remote's shims. The
// public tag `<sofabaton-remote>` keeps its name; the HA card and the
// server's own /ui/remote/ page are built without this plugin.
//
// Three contexts are rewritten, in the TypeScript source before esbuild
// sees it (an onLoad plugin), so template literals, `customElements` calls
// and CSS strings are all covered by rules over plain text:
//
//   1. markup: `<tag` and `</tag` in Lit / innerHTML templates;
//   2. a string literal that is exactly the tag: `"tag"`, `'tag'`, `` `tag` ``
//      (customElements.get / define / whenDefined, createElement, the
//      tag constants, selectItemTagName's literal);
//   3. CSS: the tag at the start of any compound selector, that is after
//      whitespace, `{`, `,`, `>`, `+`, `~`, `(` or the start of the text,
//      and followed by whitespace, `{`, `,`, `.`, `#`, `[`, `:`, `>`, `+`,
//      `~`, `)` or the end (`.sb-notice ha-icon`, `ha-card {`).
//
// A tag is only matched as a whole name (never inside `--ha-card-background`
// or `sofabaton-virtual-remote-editor`, which is its own entry), so custom
// property names stay intact. `ha-dropdown-item` is a probe for HA's own
// element and is not renamed.

export const EMBED_TAG_PREFIX = "sbx-";

/** Internal tag → embed tag. Longer names first, though the rules never match a prefix. */
export const EMBED_TAG_MAP = Object.freeze({
  "sofabaton-virtual-remote-editor": "sbx-virtual-remote-editor",
  "sofabaton-virtual-remote": "sbx-virtual-remote",
  "sb-key-button": "sbx-key-button",
  "mwc-list-item": "sbx-mwc-list-item",
  "ha-select": "sbx-ha-select",
  "ha-icon": "sbx-ha-icon",
  "ha-card": "sbx-ha-card",
});

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rewrite one source text. `map` defaults to the embed's tag map. */
export function prefixTags(source, map = EMBED_TAG_MAP) {
  let out = source;
  for (const [tag, renamed] of Object.entries(map)) {
    const name = escapeRegExp(tag);
    // 1. markup
    out = out.replace(new RegExp(`(<\\/?)${name}(?![\\w-])`, "g"), `$1${renamed}`);
    // 2. exact string literal
    out = out.replace(new RegExp(`(["'\`])${name}\\1`, "g"), `$1${renamed}$1`);
    // 3. CSS compound-selector start
    out = out.replace(
      new RegExp(`(^|[\\s{,>+~(])${name}(?=$|[\\s{,.#\\[:>+~)])`, "gm"),
      `$1${renamed}`,
    );
  }
  return out;
}

/** Every whole-name occurrence of an unprefixed tag left in `text`, with context. */
export function findUnprefixedTags(text, map = EMBED_TAG_MAP) {
  const hits = [];
  for (const tag of Object.keys(map)) {
    const pattern = new RegExp(`(?<![\\w-])${escapeRegExp(tag)}(?![\\w-])`, "g");
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      hits.push({ tag, at, context: text.slice(Math.max(0, at - 30), at + tag.length + 20) });
    }
  }
  return hits;
}

/** esbuild plugin: rewrite the remote card's sources for the embed build. */
export function tagPrefixPlugin(map = EMBED_TAG_MAP) {
  return {
    name: "sofabaton-embed-tag-prefix",
    setup(build) {
      build.onLoad({ filter: /remote-card[\\/]src[\\/].*\.ts$/ }, async (args) => {
        const { readFile } = await import("node:fs/promises");
        const source = await readFile(args.path, "utf8");
        return { contents: prefixTags(source, map), loader: "ts" };
      });
    },
  };
}

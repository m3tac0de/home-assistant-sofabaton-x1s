// Types for tag-prefix.mjs, so the frontend test suite (TypeScript, strict)
// can import the rewriter the embed build uses.

import type { Plugin } from "esbuild";

export const EMBED_TAG_PREFIX: string;
export const EMBED_TAG_MAP: Readonly<Record<string, string>>;
export function prefixTags(source: string, map?: Readonly<Record<string, string>>): string;
export function findUnprefixedTags(
  text: string,
  map?: Readonly<Record<string, string>>,
): Array<{ tag: string; at: number; context: string }>;
export function tagPrefixPlugin(map?: Readonly<Record<string, string>>): Plugin;

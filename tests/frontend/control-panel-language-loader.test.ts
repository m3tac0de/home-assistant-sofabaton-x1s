import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import test, { afterEach } from "node:test";

import {
  resolveToolsCardLocale,
  ToolsCardLocaleLoader,
  TOOLS_CARD_LOCALES,
  type ToolsCardLocale,
} from "../../custom_components/sofabaton_x1s/www/src/control-panel-language-loader";
import {
  registerToolsCardTranslation,
  setToolsCardLanguage,
  toolsStr,
  type ToolsCardTranslation,
} from "../../custom_components/sofabaton_x1s/www/src/strings";

afterEach(() => {
  setToolsCardLanguage("en");
});

test("locale resolver handles regional languages, aliases, and English fallback", () => {
  assert.equal(resolveToolsCardLocale("de-DE"), "de");
  assert.equal(resolveToolsCardLocale("nl_BE"), "nl");
  assert.equal(resolveToolsCardLocale("zh-Hans"), "zh-hans");
  assert.equal(resolveToolsCardLocale("zh-CN"), "zh-hans");
  assert.equal(resolveToolsCardLocale("en-US"), null);
  assert.equal(resolveToolsCardLocale("unsupported"), null);
  assert.deepEqual(
    [...TOOLS_CARD_LOCALES],
    ["en-gb", "de", "es", "fr", "nl", "zh-hans"],
  );
});

test("runtime locale manifest matches the source catalogues emitted by the build", () => {
  const sourceDir = path.join(
    process.cwd(),
    "custom_components/sofabaton_x1s/www/src/control-panel-translations",
  );
  const sourceLocales = readdirSync(sourceDir)
    .filter((filename) => filename.endsWith(".ts") && filename !== "index.ts")
    .map((filename) => filename.slice(0, -3))
    .sort();

  assert.deepEqual([...TOOLS_CARD_LOCALES].sort(), sourceLocales);
});

test("locale loader deduplicates concurrent requests and activates the translation", async () => {
  let imports = 0;
  let resolveImport: ((module: { default: ToolsCardTranslation }) => void) | undefined;
  const imported = new Promise<{ default: ToolsCardTranslation }>((resolve) => {
    resolveImport = resolve;
  });
  const loader = new ToolsCardLocaleLoader(
    async () => {
      imports += 1;
      return imported;
    },
    (locale) => `/locales/${locale}.js?v=test`,
  );

  setToolsCardLanguage("de-DE");
  const first = loader.ensure("de-DE");
  const second = loader.ensure("de");
  assert.equal(loader.needsLoad("de-DE"), true);
  assert.equal(imports, 1);

  resolveImport?.({ default: { tabs: { cache: "Geladener Hub" } } });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(imports, 1);
  assert.equal(loader.needsLoad("de"), false);
  assert.equal(toolsStr().tabs.cache, "Geladener Hub");
});

test("failed locale loads fall back to English and are not retried every update", async () => {
  let imports = 0;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const loader = new ToolsCardLocaleLoader(
      async () => {
        imports += 1;
        throw new Error("network unavailable");
      },
      (locale) => `/locales/${locale}.js?v=test`,
    );

    setToolsCardLanguage("fr-FR");
    assert.equal(await loader.ensure("fr-FR"), false);
    assert.equal(toolsStr().tabs.cache, "Hub");
    assert.equal(loader.needsLoad("fr-FR"), false);
    assert.equal(await loader.ensure("fr-FR"), false);
    assert.equal(imports, 1);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("a late locale response does not replace a newer active language", async () => {
  let resolveImport: ((module: { default: ToolsCardTranslation }) => void) | undefined;
  const loader = new ToolsCardLocaleLoader(
    () => new Promise((resolve) => {
      resolveImport = resolve;
    }),
    (locale) => `/locales/${locale}.js?v=test`,
  );

  setToolsCardLanguage("es");
  const spanishLoad = loader.ensure("es");

  const dutch: ToolsCardTranslation = { tabs: { cache: "Nieuwste taal" } };
  registerToolsCardTranslation("nl", dutch);
  setToolsCardLanguage("nl");

  resolveImport?.({ default: { tabs: { cache: "Respuesta tardía" } } });
  assert.equal(await spanishLoad, true);
  assert.equal(toolsStr().tabs.cache, "Nieuwste taal");
});

test("locale URL builders receive the canonical emitted filename", async () => {
  const seen: Array<{ url: string; locale: ToolsCardLocale }> = [];
  const loader = new ToolsCardLocaleLoader(
    async (url, locale) => {
      seen.push({ url, locale });
      return { default: { tabs: { cache: "British Hub" } } };
    },
    (locale) => `/tools-card-locales/${locale}.js?v=1.2.3`,
  );

  await loader.ensure("en-GB");
  assert.deepEqual(seen, [{
    url: "/tools-card-locales/en-gb.js?v=1.2.3",
    locale: "en-gb",
  }]);
});

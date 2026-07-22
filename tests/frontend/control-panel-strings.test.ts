import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  TOOLS_CARD_STRINGS,
  TOOLS_CARD_STRINGS_EN,
  registerToolsCardTranslation,
  setToolsCardLanguage,
  toolsCardLanguage,
  toolsStr,
} from "../../custom_components/sofabaton_x1s/www/src/strings";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";

test("control-panel strings default to the complete English table", () => {
  setToolsCardLanguage("en");
  assert.equal(toolsCardLanguage(), "en");
  assert.equal(toolsStr().tabs.cache, TOOLS_CARD_STRINGS_EN.tabs.cache);
  assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), "Activity 7");
});

test("partial translations overlay English and regional locales use their base language", () => {
  const cachedBackupTable = TOOLS_CARD_STRINGS.backup;
  registerToolsCardTranslation("xx", {
    tabs: { cache: "Centrale" },
    backup: { complete: "Klaar" },
  });

  setToolsCardLanguage("xx-BE");
  assert.equal(TOOLS_CARD_STRINGS.tabs.cache, "Centrale");
  assert.equal(cachedBackupTable.complete, "Klaar");
  assert.equal(TOOLS_CARD_STRINGS.tabs.logs, TOOLS_CARD_STRINGS_EN.tabs.logs);

  setToolsCardLanguage("en");
  assert.equal(cachedBackupTable.complete, TOOLS_CARD_STRINGS_EN.backup.complete);
});

test("unknown control-panel languages fall back to English", () => {
  setToolsCardLanguage("zz-ZZ");
  assert.equal(TOOLS_CARD_STRINGS.card.pickerName, TOOLS_CARD_STRINGS_EN.card.pickerName);
  assert.equal(TOOLS_CARD_STRINGS.errors.noHubSelected, TOOLS_CARD_STRINGS_EN.errors.noHubSelected);
  setToolsCardLanguage("en");
});

test("bundled British English uses en-GB spelling and English fallback", () => {
  setToolsCardLanguage("en-GB");

  assert.equal(TOOLS_CARD_STRINGS.cache.favorites, "Favourites");
  assert.equal(TOOLS_CARD_STRINGS.common.favoriteFallback(3), "Favourite 3");
  assert.equal(TOOLS_CARD_STRINGS.activities.review.idleChanged("TV", "on"), '"TV" idle behaviour → on.');
  assert.equal(TOOLS_CARD_STRINGS.backup.customizeButtonsToggle, "Customise individual buttons");
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.colorGroup, "Colour");
  assert.equal(TOOLS_CARD_STRINGS.tabs.backup, TOOLS_CARD_STRINGS_EN.tabs.backup);

  setToolsCardLanguage("en");
});

test("bundled complete control-panel translations select regional locales and preserve dynamic meaning", () => {
  const cases = [
    {
      locale: "nl-NL",
      favorites: "Favorieten",
      activity: "Activiteit 7",
      immediate: "Dit wordt onmiddellijk op de hub toegepast.",
      replace: "Verwijderingen bereiken de hub alleen bij een herstelbewerking met Vervangen.",
    },
    {
      locale: "de-DE",
      favorites: "Favoriten",
      activity: "Aktivität 7",
      immediate: "Dies wird sofort auf dem Hub angewendet.",
      replace: "Löschungen gelangen nur bei einer Wiederherstellung mit Ersetzen auf den Hub.",
    },
    {
      locale: "fr-FR",
      favorites: "Favoris",
      activity: "Activité 7",
      immediate: "Cette modification est appliquée immédiatement au hub.",
      replace: "Les suppressions n’atteignent le hub que lors d’une restauration avec remplacement.",
    },
    {
      locale: "es-ES",
      favorites: "Favoritos",
      activity: "Actividad 7",
      immediate: "Esto se aplica al hub inmediatamente.",
      replace: "Las eliminaciones solo llegan al hub durante una restauración con Reemplazar.",
    },
  ];

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.equal(TOOLS_CARD_STRINGS.cache.favorites, item.favorites);
    assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), item.activity);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteImmediateNote, item.immediate);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteReplaceNote, item.replace);
  }

  setToolsCardLanguage("en");
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function tagName(node: ts.TaggedTemplateExpression): string {
  return node.tag.getText();
}

function templateText(node: ts.TaggedTemplateExpression): string {
  const template = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  return template.head.text
    + template.templateSpans.map((span) => `__EXPR__${span.literal.text}`).join("");
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/__EXPR__/g, " ")
    .replace(/&(?:amp|nbsp|mdash|hellip);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksUserVisible(value: string): boolean {
  const text = normalizeVisibleText(value);
  return /[A-Za-z]{2}/.test(text);
}

function isInsideHtmlExpression(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isTaggedTemplateExpression(parent) && tagName(parent) === "html") return true;
  }
  return false;
}

function isTechnicalHtmlExpressionLiteral(node: ts.StringLiteralLike): boolean {
  const value = node.text.trim();
  if (value.includes("<") || value.includes(">")) return true;
  if (/^[a-z-]+\s*:\s*[^;]+;?$/i.test(value)) return true;

  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isPropertyAssignment(parent)) {
      const propertyName = parent.name.getText().replace(/["']/g, "");
      if (propertyName === "class" || propertyName.endsWith("ClassName")) return true;
    }
    if (ts.isTaggedTemplateExpression(parent)) break;
  }
  return false;
}

test("control-panel UI source does not introduce literal user-facing strings", () => {
  const root = path.resolve("custom_components/sofabaton_x1s/www/src");
  const files = sourceFiles(root).filter((file) => {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    return file.endsWith(".ts")
      && relative !== "strings.ts"
      && !relative.startsWith("control-panel-translations/")
      && !relative.startsWith("remote-card")
      && !relative.startsWith("remote-card-translations/")
      && !relative.startsWith("editor-sections/")
      && !relative.startsWith("sections/")
      && relative !== "state/remote-card-store.ts"
      && !relative.endsWith("-styles.ts");
  });

  const offenders: string[] = [];
  const uiProperties = new Set(["label", "title", "subtitle", "helper", "message", "placeholder"]);

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const relative = path.relative(root, file).replaceAll("\\", "/");

    const report = (node: ts.Node, kind: string, value: string) => {
      offenders.push(`${relative}:${lineOf(source, node)} ${kind}: ${normalizeVisibleText(value)}`);
    };

    const visit = (node: ts.Node) => {
      if (ts.isTaggedTemplateExpression(node) && tagName(node) === "html") {
        const raw = templateText(node);
        for (const match of raw.matchAll(/(?:aria-label|title|placeholder)\s*=\s*["']([^"']+)["']/gi)) {
          if (looksUserVisible(match[1])) report(node, "attribute", match[1]);
        }
        for (const match of raw.matchAll(/>([^<>]+)</g)) {
          if (looksUserVisible(match[1])) report(node, "text", match[1]);
        }
      }

      if (ts.isNewExpression(node)
        && node.expression.getText(source) === "Error"
        && node.arguments?.length
        && ts.isStringLiteralLike(node.arguments[0])
        && looksUserVisible(node.arguments[0].text)) {
        report(node.arguments[0], "error", node.arguments[0].text);
      }

      if (ts.isPropertyAssignment(node)
        && ts.isIdentifier(node.name)
        && uiProperties.has(node.name.text)
        && ts.isStringLiteralLike(node.initializer)
        && looksUserVisible(node.initializer.text)) {
        report(node.initializer, `property ${node.name.text}`, node.initializer.text);
      }

      if (ts.isStringLiteralLike(node)
        && isInsideHtmlExpression(node)
        && !isTechnicalHtmlExpressionLiteral(node)
        && normalizeVisibleText(node.text).includes(" ")
        && looksUserVisible(node.text)) {
        report(node, "template expression", node.text);
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

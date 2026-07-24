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
      replace: "Verwijderingen worden alleen op de hub toegepast als ‘Bestaande apparaten en activiteiten wissen’ tijdens het herstellen is ingeschakeld.",
      volumeChannel: "Volume en kanaal",
      playback: "Afspelen",
    },
    {
      locale: "de-DE",
      favorites: "Favoriten",
      activity: "Aktivität 7",
      immediate: "Dies wird sofort auf dem Hub angewendet.",
      replace: "Löschungen werden nur auf den Hub angewendet, wenn „Vorhandene Geräte und Aktivitäten löschen“ bei der Wiederherstellung aktiviert ist.",
      volumeChannel: "Lautstärke & Kanal",
      playback: "Medienwiedergabe",
    },
    {
      locale: "fr-FR",
      favorites: "Favoris",
      activity: "Activité 7",
      immediate: "Cette modification est appliquée immédiatement au hub.",
      replace: "Les suppressions ne sont appliquées au hub que si l’option « Effacer les appareils et activités existants » est activée pendant la restauration.",
      volumeChannel: "Volume et chaînes",
      playback: "Lecture",
    },
    {
      locale: "es-ES",
      favorites: "Favoritos",
      activity: "Actividad 7",
      immediate: "Esto se aplica al hub inmediatamente.",
      replace: "Las eliminaciones solo se aplican al hub si se activa «Borrar los dispositivos y actividades existentes» durante la restauración.",
      volumeChannel: "Volumen y canal",
      playback: "Reproducción",
    },
  ];

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.equal(TOOLS_CARD_STRINGS.cache.favorites, item.favorites);
    assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), item.activity);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteImmediateNote, item.immediate);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteReplaceNote, item.replace);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.transportGroup, item.volumeChannel);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.mediaGroup, item.playback);
  }

  setToolsCardLanguage("en");
});

test("Spanish power section labels describe both on and off behavior", () => {
  setToolsCardLanguage("es-ES");
  assert.equal(TOOLS_CARD_STRINGS.activities.deviceReview.sectionPower, "Encendido y apagado");
  assert.equal(TOOLS_CARD_STRINGS.backup.detailPower, "Encendido y apagado");
  setToolsCardLanguage("en");
});

test("control-panel count copy uses real singular and plural forms", () => {
  const cases = [
    {
      locale: "en",
      expected: [
        "0 favorites / 1 macro / 2 buttons",
        "1 command",
        "2 commands",
        "1 favorite · 2 macros",
        "1 linked device",
        "1 of 1 button mapped",
        "1 of 2 buttons mapped",
        "1 configured",
        "2 configured",
        "The hub will also remove 1 shortcut and 0 button assignments that reference it, and the step is removed from 1 macro (a macro left with no steps is removed).",
        "The hub will also remove 2 shortcuts and 2 button assignments that reference it, and the step is removed from 2 macros (a macro left with no steps is removed).",
      ],
    },
    {
      locale: "en-GB",
      expected: [
        "0 favourites / 1 macro / 2 buttons",
        "1 command",
        "2 commands",
        "1 favourite · 2 macros",
        "1 linked device",
        "1 of 1 button mapped",
        "1 of 2 buttons mapped",
        "1 configured",
        "2 configured",
        "The hub will also remove 1 shortcut and 0 button assignments that reference it, and the step is removed from 1 macro (a macro left with no steps is removed).",
        "The hub will also remove 2 shortcuts and 2 button assignments that reference it, and the step is removed from 2 macros (a macro left with no steps is removed).",
      ],
    },
    {
      locale: "nl",
      expected: [
        "0 favorieten / 1 macro / 2 knoppen",
        "1 commando",
        "2 commando's",
        "1 favoriet · 2 macro's",
        "1 gekoppeld apparaat",
        "1 van 1 knop gekoppeld",
        "1 van 2 knoppen gekoppeld",
        "1 geconfigureerd",
        "2 geconfigureerd",
        "De hub verwijdert ook 1 snelkoppeling en 0 knoptoewijzingen die ernaar verwijzen; de stap wordt uit 1 macro verwijderd (een macro zonder stappen wordt verwijderd).",
        "De hub verwijdert ook 2 snelkoppelingen en 2 knoptoewijzingen die ernaar verwijzen; de stap wordt uit 2 macro's verwijderd (een macro zonder stappen wordt verwijderd).",
      ],
    },
    {
      locale: "de",
      expected: [
        "0 Favoriten / 1 Makro / 2 Tasten",
        "1 Befehl",
        "2 Befehle",
        "1 Favorit · 2 Makros",
        "1 verknüpftes Gerät",
        "1 von 1 Taste belegt",
        "1 von 2 Tasten belegt",
        "1 konfiguriert",
        "2 konfiguriert",
        "Der Hub entfernt außerdem 1 Verknüpfung und 0 Tastenzuweisungen, die darauf verweisen; der Schritt wird aus 1 Makro entfernt (ein Makro ohne Schritte wird gelöscht).",
        "Der Hub entfernt außerdem 2 Verknüpfungen und 2 Tastenzuweisungen, die darauf verweisen; der Schritt wird aus 2 Makros entfernt (ein Makro ohne Schritte wird gelöscht).",
      ],
    },
    {
      locale: "fr",
      expected: [
        "0 favoris / 1 macro / 2 touches",
        "1 commande",
        "2 commandes",
        "1 favori · 2 macros",
        "1 appareil lié",
        "1 touche attribuée sur 1",
        "1 touche attribuée sur 2",
        "1 configurée",
        "2 configurées",
        "Le hub supprimera aussi 1 raccourci et 0 affectations de touches qui y font référence ; l’étape est retirée de 1 macro (une macro sans étapes est supprimée).",
        "Le hub supprimera aussi 2 raccourcis et 2 affectations de touches qui y font référence ; l’étape est retirée de 2 macros (une macro sans étapes est supprimée).",
      ],
    },
    {
      locale: "es",
      expected: [
        "0 favoritos / 1 macro / 2 botones",
        "1 comando",
        "2 comandos",
        "1 favorito · 2 macros",
        "1 dispositivo vinculado",
        "1 de 1 botón asignado",
        "1 de 2 botones asignados",
        "1 configurado",
        "2 configurados",
        "El hub también eliminará 1 acceso directo y 0 asignaciones de botones que hacen referencia al evento; el paso se elimina de 1 macro (una macro sin pasos se elimina).",
        "El hub también eliminará 2 accesos directos y 2 asignaciones de botones que hacen referencia al evento; el paso se elimina de 2 macros (una macro sin pasos se elimina).",
      ],
    },
  ];

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    const actual = [
      TOOLS_CARD_STRINGS.cache.activityCounts(0, 1, 2),
      TOOLS_CARD_STRINGS.cache.deviceCommandCount(1),
      TOOLS_CARD_STRINGS.cache.deviceCommandCount(2),
      TOOLS_CARD_STRINGS.backup.activityMeta(1, 2),
      TOOLS_CARD_STRINGS.backup.linkedDevices(1),
      TOOLS_CARD_STRINGS.backup.roleMappedNote(1, 1),
      TOOLS_CARD_STRINGS.backup.roleMappedNote(1, 2),
      TOOLS_CARD_STRINGS.backup.bindingsConfiguredCount(1),
      TOOLS_CARD_STRINGS.backup.bindingsConfiguredCount(2),
      TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(1, 0, 1),
      TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(2, 2, 2),
    ];
    assert.deepEqual(actual, item.expected, item.locale);
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

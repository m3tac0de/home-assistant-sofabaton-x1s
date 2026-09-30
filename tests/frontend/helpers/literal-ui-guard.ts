import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// The literal-UI-text guard shared by the tools card and the remote card
// (CR-X7-7). User-visible English belongs in the string tables; this scan
// reports a literal that reaches the UI without them:
// - html text nodes and aria-label/title/placeholder attribute values;
// - a literal bound to a UI attribute or property (`.label=${"Name"}`,
//   `aria-label=${cond ? "Open" : "Close"}`), single words included;
// - a literal in an html text position, directly or as a branch of a
//   ternary / `??` / `||` (`${ready ? "required" : "command"}`);
// - other literals inside html expressions that contain a space;
// - `new Error("...")`, `label:`/`title:`-style properties, and
//   `const label = ...`-style declarations whose value is a literal.

const UI_ATTRIBUTES = new Set([
  "label", "title", "aria-label", "aria-description", "placeholder", "heading", "helper", "subtitle",
  "message", "header", "alt", "tooltip", "text", "caption", "secondary", "primary", "description",
]);
const UI_PROPERTIES = new Set(["label", "title", "subtitle", "helper", "message", "placeholder"]);
const UI_NAME = /(?:^|[a-z])(?:Label|Title|Text|Chip|Heading|Caption|Message|Placeholder)$|^(?:label|title|text|chip|heading|caption|message|placeholder)$/;

export interface LiteralGuardOptions {
  /** Root directory, relative to the repository. */
  root: string;
  /** True for a file (path relative to root, forward slashes) the guard skips. */
  skip: (relative: string) => boolean;
  /** Visible values that are not English copy (brand names, protocol tokens). */
  allowedValues?: ReadonlySet<string>;
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function isHtml(node: ts.TaggedTemplateExpression): boolean {
  return node.tag.getText() === "html";
}

function templateText(node: ts.TaggedTemplateExpression): string {
  const template = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  return template.head.text
    + template.templateSpans.map((span) => `__EXPR__${span.literal.text}`).join("");
}

export function normalizeVisibleText(value: string): string {
  return value
    .replace(/__EXPR__/g, " ")
    .replace(/&(?:amp|nbsp|mdash|hellip);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksUserVisible(value: string): boolean {
  return /[A-Za-z]{2}/.test(normalizeVisibleText(value));
}

function isInsideHtmlExpression(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isTaggedTemplateExpression(parent) && isHtml(parent)) return true;
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

/** The literal is the value itself: the expression, or a branch of a ternary / `??` / `||` / parens that is. */
function valueRoot(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return current;
    if (ts.isParenthesizedExpression(parent)) current = parent;
    else if (ts.isConditionalExpression(parent) && parent.condition !== current) current = parent;
    else if (ts.isBinaryExpression(parent) && parent.right === current
      && (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)) current = parent;
    else return current;
  }
}

type SpanPosition = { kind: "attribute"; name: string } | { kind: "text" } | null;

/** Where an html template span puts its value: a named attribute/property, or text. */
function spanPosition(span: ts.TemplateSpan): SpanPosition {
  const template = span.parent;
  if (!ts.isTemplateExpression(template)) return null;
  const index = template.templateSpans.indexOf(span);
  const before = [template.head.text, ...template.templateSpans.slice(0, index).map((item) => item.literal.text)];
  const preceding = before[before.length - 1];
  const attribute = preceding.match(/([.?@]?[\w-]+)\s*=\s*["']?[^"'<>=]*$/);
  if (attribute && !/>[^<]*$/.test(preceding.slice(attribute.index))) return { kind: "attribute", name: attribute[1] };
  const joined = before.join("\u0000");
  return joined.lastIndexOf(">") > joined.lastIndexOf("<") ? { kind: "text" } : null;
}

export function literalUiOffenders(options: LiteralGuardOptions): string[] {
  const root = path.resolve(options.root);
  const allowed = options.allowedValues ?? new Set<string>();
  const files = sourceFiles(root).filter((file) => file.endsWith(".ts")
    && !options.skip(path.relative(root, file).replaceAll("\\", "/")));
  const offenders: string[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const seen = new Set<ts.Node>();
    const report = (node: ts.Node, kind: string, value: string) => {
      if (seen.has(node) || allowed.has(normalizeVisibleText(value))) return;
      seen.add(node);
      offenders.push(`${relative}:${lineOf(source, node)} ${kind}: ${normalizeVisibleText(value)}`);
    };

    const visit = (node: ts.Node) => {
      if (ts.isTaggedTemplateExpression(node) && isHtml(node)) {
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
        && UI_PROPERTIES.has(node.name.text)
        && ts.isStringLiteralLike(node.initializer)
        && looksUserVisible(node.initializer.text)) {
        report(node.initializer, `property ${node.name.text}`, node.initializer.text);
      }

      if (ts.isStringLiteralLike(node) && looksUserVisible(node.text)) {
        const rootNode = valueRoot(node);
        const parent = rootNode.parent;
        if (parent && ts.isTemplateSpan(parent) && parent.expression === rootNode
          && ts.isTemplateExpression(parent.parent) && ts.isTaggedTemplateExpression(parent.parent.parent) && isHtml(parent.parent.parent)) {
          const position = spanPosition(parent);
          if (position?.kind === "text") report(node, "text binding", node.text);
          else if (position?.kind === "attribute" && UI_ATTRIBUTES.has(position.name.replace(/^[.?]/, "").toLowerCase())) {
            report(node, `binding ${position.name}`, node.text);
          }
        } else if (parent && ts.isVariableDeclaration(parent) && parent.initializer === rootNode
          && ts.isIdentifier(parent.name) && UI_NAME.test(parent.name.text)
          && !/^[a-z0-9]+(?:[-_:./][a-z0-9]+)+$/i.test(node.text)) {
          report(node, `declaration ${parent.name.text}`, node.text);
        }
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
  return offenders;
}

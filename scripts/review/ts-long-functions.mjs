// Lists long or deeply nested functions in the three frontends, for the
// code review baseline (docs/internal/code-review-plan.md, R0).
//
//   node scripts/review/ts-long-functions.mjs [minLines] [--json]
//
// Uses the TypeScript compiler API already in devDependencies; nothing is
// type-checked, files are only parsed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = [
  "custom_components/sofabaton_x1s/www/src",
  "remote-card/src",
  "server-panel/src",
];
const args = process.argv.slice(2);
const minLines = Number(args.find((a) => /^\d+$/.test(a)) ?? 150);
const asJson = args.includes("--json");
const MAX_DEPTH = 5;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!name.includes("translations")) yield* walk(p);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      yield p;
    }
  }
}

function fnName(node, sf) {
  if (node.name) return node.name.getText(sf);
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(sf);
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(sf);
  return "<anonymous>";
}

const NESTING = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement, ts.SyntaxKind.TryStatement,
]);

function maxNesting(node) {
  let best = 0;
  const visit = (n, depth) => {
    if (n !== node && ts.isFunctionLike(n)) return; // nested functions are measured on their own
    const d = NESTING.has(n.kind) ? depth + 1 : depth;
    if (d > best) best = d;
    ts.forEachChild(n, (c) => visit(c, d));
  };
  visit(node, 0);
  return best;
}

const results = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    const visit = (node) => {
      if (ts.isFunctionLike(node) && node.body) {
        const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const lines = end - start + 1;
        const depth = maxNesting(node);
        if (lines >= minLines || depth >= MAX_DEPTH) {
          results.push({
            file: relative(process.cwd(), file).replaceAll("\\", "/"),
            line: start,
            name: fnName(node, sf),
            lines,
            depth,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

results.sort((a, b) => b.lines - a.lines);
if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`${String(r.lines).padStart(5)}  depth ${r.depth}  ${r.file}:${r.line}  ${r.name}`);
  }
  console.log(`${results.length} functions >= ${minLines} lines or nesting >= ${MAX_DEPTH}`);
}

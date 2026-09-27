import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../frontend/src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function annotateFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  let cleaned = sourceText.replace(/^\/\/\s*@ts-nocheck\s*\n+/, "");
  const sf = ts.createSourceFile(
    filePath,
    cleaned,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  /** @type {{ pos: number, insert: string }[]} */
  const edits = [];

  /** True when single-param arrow is written as `x =>` rather than `(x) =>`. */
  function arrowNeedsParenWrap(param) {
    let j = param.end;
    while (j < cleaned.length && /\s/.test(cleaned[j])) j++;
    // Already parenthesized: `)` before `=>`. Bare: `=>` right after param.
    return cleaned.slice(j, j + 2) === "=>";
  }

  function addAnyToParam(param, parent) {
    if (param.type) return;
    if (
      param.name.kind === ts.SyntaxKind.Identifier &&
      param.name.text === "this"
    ) {
      return;
    }

    const nameEnd = param.questionToken
      ? param.questionToken.end
      : param.name.end;

    if (
      ts.isArrowFunction(parent) &&
      parent.parameters.length === 1 &&
      arrowNeedsParenWrap(param)
    ) {
      const start = param.getStart(sf);
      edits.push({ pos: start, insert: "(" });
      edits.push({ pos: nameEnd, insert: ": any)" });
      return;
    }

    edits.push({ pos: nameEnd, insert: ": any" });
  }

  function visit(node) {
    if (ts.isFunctionLike(node) && node.parameters) {
      for (const p of node.parameters) addAnyToParam(p, node);
    }
    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration &&
      !node.variableDeclaration.type
    ) {
      edits.push({
        pos: node.variableDeclaration.name.end,
        insert: ": unknown",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length && cleaned === sourceText) return 0;

  edits.sort((a, b) => b.pos - a.pos || b.insert.length - a.insert.length);
  let text = cleaned;
  let count = 0;
  for (const e of edits) {
    const after = text.slice(e.pos, e.pos + 12);
    if (
      (e.insert === ": any" || e.insert === ": any)") &&
      after.trimStart().startsWith(":")
    ) {
      continue;
    }
    text = text.slice(0, e.pos) + e.insert + text.slice(e.pos);
    count++;
  }
  if (count || cleaned !== sourceText) fs.writeFileSync(filePath, text);
  return count;
}

const files = walk(root);
let total = 0;
for (const f of files) total += annotateFile(f);
console.log("annotated", total, "edits across", files.length, "files");

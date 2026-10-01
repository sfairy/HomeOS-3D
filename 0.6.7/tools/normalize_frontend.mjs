// normalize_frontend.mjs -- P1 mechanical normalization pass.
//
// Deterministic, name-agnostic rewrites applied to every produced .js file:
//   (a) computed member access with an identifier-safe StringLiteral key -> dot
//       access (keeps optional chaining: o?.["x"] -> o?.x)
//   (b) object/class property keys that are identifier-safe StringLiterals ->
//       bare identifiers
//   (c) hex/octal/binary numeric literals -> decimal
//   (d) !<numeric> / !<boolean> -> the boolean it denotes
//   (e) \\xNN / \\uNNNN escapes -> the real characters
//   (f) prettier last, with the 0.6.6 pipeline's options
//
// (c) and (e) both fall out of dropping the parser's \`extra.raw\` on numeric and
// string literals: @babel/generator re-emits those from the value, so a hex
// literal prints as decimal and an escaped space prints as a space.
//
// usage: node normalize_frontend.mjs [--dir <d>] [--filter <s>] [--dry]

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const require = createRequire(path.join(ROOT, "recovered", ".tools-node") + path.sep);
const parser = require("@babel/parser");
const tr = require("@babel/traverse");
const traverse = tr.default || tr;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const prettier = require("prettier");

const IDENT_OK = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const PRETTIER_OPTS = {
  parser: "babel",
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  arrowParens: "always",
  bracketSpacing: true,
  quoteProps: "preserve",
  endOfLine: "lf",
};

const PLUGIN_SETS = [
  ["importAttributes", "topLevelAwait", "classProperties", "classPrivateProperties", "classPrivateMethods", "classStaticBlock", "dynamicImport", "exportDefaultFrom", "exportNamespaceFrom", "objectRestSpread", "optionalChaining", "nullishCoalescingOperator", "numericSeparator", "logicalAssignment", "bigInt", "importMeta", "asyncGenerators", "regexpUnicodeSets"],
  ["importAttributes", "topLevelAwait", "jsx", "classProperties", "classPrivateProperties", "classPrivateMethods", "classStaticBlock", "dynamicImport", "exportDefaultFrom", "exportNamespaceFrom", "objectRestSpread", "optionalChaining", "nullishCoalescingOperator", "numericSeparator", "logicalAssignment", "bigInt", "importMeta", "asyncGenerators", "regexpUnicodeSets"],
  ["importAttributes", "topLevelAwait", "flow", "classProperties", "classPrivateProperties", "classPrivateMethods", "classStaticBlock", "dynamicImport", "exportDefaultFrom", "exportNamespaceFrom", "objectRestSpread", "optionalChaining", "nullishCoalescingOperator", "numericSeparator", "logicalAssignment", "bigInt", "importMeta", "asyncGenerators", "regexpUnicodeSets"],
  ["importAttributes", "topLevelAwait", "jsx", "flow", "classProperties", "classPrivateProperties", "classPrivateMethods", "classStaticBlock", "dynamicImport", "exportDefaultFrom", "exportNamespaceFrom", "objectRestSpread", "optionalChaining", "nullishCoalescingOperator", "numericSeparator", "logicalAssignment", "bigInt", "importMeta", "asyncGenerators", "regexpUnicodeSets"],
];

export function parseAny(src) {
  for (const plugins of PLUGIN_SETS) {
    try {
      const ast = parser.parse(src, {
        sourceType: "module",
        plugins,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowUndeclaredExports: true,
        allowSuperOutsideMethod: true,
        allowNewTargetOutsideFunction: true,
        errorRecovery: false,
      });
      return { ast, plugins, err: null };
    } catch (e) { /* try next plugin set */ }
  }
  return { ast: null, plugins: null, err: new Error("parse failed") };
}

const isDotAccess = (n) =>
  (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
  n.computed && t.isStringLiteral(n.property) && IDENT_OK.test(n.property.value);

const isQuotedIdentKey = (n) =>
  !n.computed && t.isStringLiteral(n.key) && IDENT_OK.test(n.key.value);

/** Apply the (a)-(e) rewrites to an AST in place. Returns counters. */
export function normalizeAst(ast) {
  const counts = { dotAccess: 0, bareKey: 0, rawStripped: 0, boolFolded: 0 };
  traverse(ast, {
    MemberExpression(p) {
      if (isDotAccess(p.node)) {
        p.node.computed = false;
        p.node.property = t.identifier(p.node.property.value);
        counts.dotAccess++;
      }
    },
    OptionalMemberExpression(p) {
      if (isDotAccess(p.node)) {
        p.node.computed = false;
        p.node.property = t.identifier(p.node.property.value);
        counts.dotAccess++;
      }
    },
    ObjectProperty(p) {
      if (isQuotedIdentKey(p.node)) { p.node.key = t.identifier(p.node.key.value); counts.bareKey++; }
    },
    ObjectMethod(p) {
      if (isQuotedIdentKey(p.node)) { p.node.key = t.identifier(p.node.key.value); counts.bareKey++; }
    },
    ClassProperty(p) {
      if (isQuotedIdentKey(p.node)) { p.node.key = t.identifier(p.node.key.value); counts.bareKey++; }
    },
    ClassMethod(p) {
      if (isQuotedIdentKey(p.node)) { p.node.key = t.identifier(p.node.key.value); counts.bareKey++; }
    },
    StringLiteral(p) {
      if (p.node.extra) { delete p.node.extra; counts.rawStripped++; }
    },
    NumericLiteral(p) {
      // Decimal re-emission is only faithful for integers narrower than 2^53;
      // beyond that the AST number has already lost digits and the raw text is
      // the only exact spelling.
      const v = p.node.value;
      if (p.node.extra && !(Number.isInteger(v) && Math.abs(v) >= 2 ** 53)) {
        delete p.node.extra;
        counts.rawStripped++;
      }
    },
    UnaryExpression(p) {
      if (p.node.operator !== "!") {
        if (p.node.operator === "void" && t.isNumericLiteral(p.node.argument) &&
            !p.scope.getBinding("undefined")) {
          p.replaceWith(t.identifier("undefined"));
        }
        return;
      }
      const a = p.node.argument;
      if (t.isNumericLiteral(a)) { p.replaceWith(t.booleanLiteral(a.value === 0)); counts.boolFolded++; }
      else if (t.isBooleanLiteral(a)) { p.replaceWith(t.booleanLiteral(!a.value)); counts.boolFolded++; }
    },
  });
  return counts;
}

export function generateCode(ast) {
  return generate(ast, {
    comments: true, retainLines: false, compact: false, concise: false,
    jsescOption: { minimal: true }, decoratorsBeforeExport: false,
  }).code;
}

export async function normalizeAndFormat(code) {
  const { ast, err } = parseAny(code);
  if (!ast) return { code, counts: null, error: err };
  const counts = normalizeAst(ast);
  const out = generateCode(ast);
  try {
    return { code: await prettier.format(out, PRETTIER_OPTS), counts, error: null };
  } catch (e) {
    return { code: out, counts, error: e };
  }
}

/* ---------------- CLI ---------------- */
function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (ent.isDirectory()) walk(abs, base, out);
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

const IS_MAIN = (() => {
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || ""); }
  catch { return false; }
})();

if (IS_MAIN) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : path.join(ROOT, "recovered", "frontend");
  const filter = args.includes("--filter") ? args[args.indexOf("--filter") + 1] : null;
  const files = walk(dirArg, dirArg, [])
    .filter((f) => f.endsWith(".js") && !/(^|\/)vendor\//.test(f) && !/\.min\.js$/.test(f))
    .filter((f) => !filter || f.includes(filter))
    .sort();
  const totals = { files: 0, dotAccess: 0, bareKey: 0, rawStripped: 0, boolFolded: 0, failed: [] };
  for (const rel of files) {
    const abs = path.join(dirArg, rel);
    const before = fs.readFileSync(abs, "utf8");
    const res = await normalizeAndFormat(before);
    if (!res.counts) { totals.failed.push(rel); continue; }
    if (!dry && res.code !== before) fs.writeFileSync(abs, res.code);
    totals.files++;
    for (const k of ["dotAccess", "bareKey", "rawStripped", "boolFolded"]) totals[k] += res.counts[k];
  }
  console.log(JSON.stringify(totals, null, 1));
}

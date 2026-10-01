// count_residue.mjs -- per-file count of residual obfuscator member syntax.
//   computed  obj["prop"] / obj?.["prop"] with an identifier-safe string
//   quotedKey { "prop": v } / class { "prop"() {} } with an identifier-safe key
// usage: node count_residue.mjs [dir]
import fs from "node:fs";
import path from "node:path";
import { parseAny } from "../normalize_frontend.mjs";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const DIR = process.argv[2] || path.join(ROOT, "recovered", "frontend");
const IDENT_OK = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (e.isDirectory()) { if (e.name === "vendor") continue; walk(abs, base, out); }
    else if (e.isFile() && e.name.endsWith(".js") && !e.name.endsWith(".min.js")) out.push(rel);
  }
  return out;
}

function walkNodes(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments" || k === "innerComments") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") walkNodes(c, fn); }
    else if (v && typeof v.type === "string") walkNodes(v, fn);
  }
}

const files = walk(DIR, DIR, []).sort();
const per = [];
let tc = 0, tq = 0;
for (const rel of files) {
  const src = fs.readFileSync(path.join(DIR, rel), "utf8");
  const { ast } = parseAny(src);
  if (!ast) { per.push({ rel, parseFail: true }); continue; }
  let c = 0, q = 0;
  walkNodes(ast.program, (n) => {
    if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
        n.computed && n.property && n.property.type === "StringLiteral" && IDENT_OK.test(n.property.value)) c++;
    if ((n.type === "ObjectProperty" || n.type === "ObjectMethod" || n.type === "ClassProperty" || n.type === "ClassMethod") &&
        !n.computed && n.key && n.key.type === "StringLiteral" && IDENT_OK.test(n.key.value)) q++;
  });
  tc += c; tq += q;
  if (c || q) per.push({ rel, computed: c, quotedKey: q });
}
console.log(JSON.stringify({ dir: DIR, files: files.length, totalComputed: tc, totalQuotedKey: tq, offenders: per.length, per }, null, 1));

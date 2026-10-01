// validate_js.mjs -- independent verification of AC-F1..AC-F6.
//
// usage: node validate_js.mjs [--verbose]

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parseAny } from "./deobfuscate_js.mjs";
import { createRequire } from "module";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const SRC = path.join(ROOT, "frontend");
const DST = path.join(ROOT, "recovered", "frontend");
const WORK = path.join(ROOT, "recovered", ".work");
const require = createRequire(path.join(ROOT, "recovered", ".tools-node") + path.sep);
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

const IDENT_OBF = /^_0x[0-9a-f]{4,}$/;
const ANY_OBF = /_0x[0-9a-f]{4,}/;

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (ent.isDirectory()) walk(abs, base, out);
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* --- local, deliberately simple re-implementations (independent of transformer) --- */

function exportedNames(ast) {
  const names = [];
  for (const n of ast.program.body) {
    if (n.type === "ExportDefaultDeclaration") names.push("*default*");
    else if (n.type === "ExportAllDeclaration") names.push("*all*" + (n.exported ? ":" + (n.exported.name || n.exported.value) : ""));
    else if (n.type === "ExportNamedDeclaration") {
      if (n.declaration) {
        const d = n.declaration;
        if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") { if (d.id) names.push(d.id.name); }
        else if (d.type === "VariableDeclaration") for (const dd of d.declarations) for (const k of Object.keys(t.getBindingIdentifiers(dd.id))) names.push(k);
      }
      for (const s of n.specifiers || []) {
        const e = s.exported;
        names.push(e.type === "Identifier" ? e.name : e.value);
      }
    }
  }
  return names.sort();
}

function importKeys(ast) {
  const keys = [];
  for (const n of ast.program.body) {
    if (n.type !== "ImportDeclaration") continue;
    const parts = [];
    for (const s of n.specifiers) {
      if (s.type === "ImportDefaultSpecifier") parts.push("default");
      else if (s.type === "ImportNamespaceSpecifier") parts.push("*");
      else parts.push((s.importKind || "value") + ":" + (s.imported.type === "Identifier" ? s.imported.name : s.imported.value));
    }
    keys.push(n.source.value + "#" + (n.importKind || "value") + "#" + parts.join(","));
  }
  return keys.sort();
}

function allStringLiterals(ast) {
  const out = new Set();
  traverse(ast, { StringLiteral(p) { out.add(p.node.value); }, DirectiveLiteral(p) { out.add(p.node.value); } });
  return out;
}

/**
 * Every string a reader can still SEE in the file.
 *
 * The P1 normalisation folds `obj["x"]` onto `obj.x` and `{ "x": v }` onto
 * `{ x: v }`. Both rewrites are value-identical but delete the string literal,
 * so a check that only looks at StringLiteral nodes would report the property
 * name as "lost" when it is in fact still present, spelled as an identifier.
 * This inventory is the union of string literals and the property/key names of
 * non-computed member access, object/class members and computed string keys.
 */
function observableStrings(ast) {
  const out = new Set();
  walkNodes(ast.program, (n) => {
    if (n.type === "StringLiteral" || n.type === "DirectiveLiteral") out.add(n.value);
    else if (n.type === "TemplateElement") out.add(n.value.cooked);
    else if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
      if (!n.computed && n.property.type === "Identifier") out.add(n.property.name);
    } else if (n.type === "ObjectProperty" || n.type === "ObjectMethod" || n.type === "ClassProperty" || n.type === "ClassMethod") {
      if (!n.computed) { if (n.key.type === "Identifier") out.add(n.key.name); else if (n.key.type === "StringLiteral") out.add(n.key.value); }
    }
  });
  return out;
}

/**
 * Global names the P1 literal pass may legitimately introduce into a file:
 *   void <anything>  -> undefined      (void always evaluates to undefined)
 *   1e999 / n / 0    -> Infinity       (a numeric literal already past the
 *                                       double range, or a /0 division)
 * Anything else newly free is still a failure, so a deleted binding cannot
 * hide behind this allowance.
 */
function introducedGlobals(ast) {
  const out = new Set();
  walkNodes(ast.program, (n) => {
    if (n.type === "UnaryExpression" && n.operator === "void") out.add("undefined");
    if (n.type === "NumericLiteral" && !Number.isFinite(n.value)) out.add(n.value > 0 ? "Infinity" : "-Infinity");
    if (n.type === "BinaryExpression" && n.operator === "/" && n.right.type === "NumericLiteral" && n.right.value === 0) { out.add("Infinity"); out.add("NaN"); }
    if (n.type === "Identifier" && (n.name === "undefined" || n.name === "Infinity" || n.name === "NaN")) out.add(n.name);
  });
  return out;
}

/** plain recursive walk (no @babel/traverse) -- independent call-site scan */
function walkNodes(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const c of node) walkNodes(c, visit); return; }
  if (typeof node.type === "string") visit(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments" || k === "innerComments") continue;
    const v = node[k];
    if (v && typeof v === "object") walkNodes(v, visit);
  }
}

function foldNum(node) {
  if (!node) return null;
  if (node.type === "NumericLiteral") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") return -node.argument.value;
  if (node.type === "UnaryExpression" && node.operator === "+" && node.argument.type === "NumericLiteral") return node.argument.value;
  return null;
}

/**
 * Strings the output is required to still contain: every string literal that
 * lives OUTSIDE the recognizable obfuscator preamble of the original file.
 * Deliberately re-derives "preamble" with a much simpler rule set than the
 * transformer, so a transformer mistake cannot hide here too.
 */
function requiredOriginalStrings(ast) {
  const out = new Set();
  const isIife = (n) =>
    n && n.type === "CallExpression" &&
    (n.callee.type === "FunctionExpression" || n.callee.type === "ArrowFunctionExpression");
  const skipStmt = (n) => {
    if (n.type === "FunctionDeclaration") return !!n.id && IDENT_OBF.test(n.id.name);
    if (n.type === "VariableDeclaration")
      return n.declarations.length > 0 && n.declarations.every((d) =>
        d.id.type === "Identifier" && IDENT_OBF.test(d.id.name) &&
        (!d.init || (d.init.type === "Identifier" && IDENT_OBF.test(d.init.name))));
    return false;
  };
  for (const n of ast.program.body) {
    if (skipStmt(n)) continue;
    if (n.type === "ExpressionStatement") {
      let e = n.expression;
      if (e.type === "SequenceExpression") {
        // only the IIFE elements are preamble; the rest is module code
        for (const el of e.expressions) if (!isIife(el)) walkNodes(el, (x) => { if (x.type === "StringLiteral") out.add(x.value); else if (x.type === "DirectiveLiteral") out.add(x.value); });
        continue;
      }
      if (isIife(e)) continue;
    }
    walkNodes(n, (x) => {
      if (x.type === "StringLiteral") out.add(x.value);
      else if (x.type === "DirectiveLiteral") out.add(x.value);
    });
  }
  return out;
}

/** Identifiers referenced with no binding in scope (free variables / globals). */
function freeIdentifierNames(ast) {
  const free = new Set();
  traverse(ast, {
    ReferencedIdentifier(p) {
      if (p.scope.getBinding(p.node.name)) return;
      free.add(p.node.name);
    },
  });
  return free;
}

async function main() {
  const problems = [];
  const verbose = process.argv.includes("--verbose");

  const srcJs = walk(SRC, SRC, []).filter((f) => f.endsWith(".js")).sort();
  const dstAll = walk(DST, DST, []);
  const dstJs = dstAll.filter((f) => f.endsWith(".js")).sort();

  const report = JSON.parse(fs.readFileSync(path.join(WORK, "frontend_report.json"), "utf8"));
  const decoded = JSON.parse(fs.readFileSync(path.join(WORK, "frontend_decoded.json"), "utf8"));
  const copyMap = JSON.parse(fs.readFileSync(path.join(WORK, "frontend_copy_map.json"), "utf8"));
  const reportByRel = new Map(report.map((r) => [r.rel, r]));

  /* -------- AC-F1 / F2 / F3 / F4 over produced JS -------- */
  const f1 = { checked: 0, ok: 0, fail: [] };
  const f2 = { checked: 0, ok: 0, fail: [], rawHits: 0, idHits: 0, perFile: {} };
  const f3 = { checked: 0, exportsOk: 0, importsOk: 0, bothOk: 0, fail: [] };
  const f4 = { filesWithStrings: 0, stringsChecked: 0, ok: 0, fail: [], invented: [], inventedCount: 0 };
  const f6 = { present: true, entries: report.length, missingFields: [], missingEntries: [] };
  const f4b = { checked: 0, ok: 0, fail: [] };
  const f7 = { checked: 0, ok: 0, fail: [] };

  const REQUIRED_FIELDS = ["rel", "sourcePath", "outputPath", "bytesIn", "bytesOut", "mode", "parseOkBefore", "parseOkAfter", "stringsDecoded", "decoderCallsInlined", "renamings", "exportsBefore", "exportsAfter", "importsBefore", "importsAfter", "notes", "leftovers"];

  for (const rel of srcJs) {
    const srcPath = path.join(SRC, rel);
    const dstPath = path.join(DST, rel);
    const srcCode = fs.readFileSync(srcPath, "utf8");
    if (!fs.existsSync(dstPath)) { f1.fail.push({ rel, why: "output missing" }); continue; }
    const outCode = fs.readFileSync(dstPath, "utf8");

    const po = parseAny(outCode);
    f1.checked++;
    if (!po.ast) { f1.fail.push({ rel, why: String(po.err && po.err.message).slice(0, 200) }); continue; }
    f1.ok++;

    // F2
    f2.checked++;
    const raw = (outCode.match(/_0x[0-9a-f]{4,}/g) || []).length;
    f2.rawHits += raw;
    let idCount = 0;
    const ids = new Set();
    traverse(po.ast, { Identifier(p) { if (IDENT_OBF.test(p.node.name)) { idCount++; ids.add(p.node.name); } } });
    f2.idHits += idCount;
    f2.perFile[rel] = { raw, ids: idCount, names: Array.from(ids).slice(0, 10) };
    if (idCount === 0) f2.ok++;
    else f2.fail.push({ rel, raw, ids: idCount, names: Array.from(ids).slice(0, 10) });

    // F3
    const ps = parseAny(srcCode);
    if (ps.ast) {
      f3.checked++;
      const eb = exportedNames(ps.ast), ea = exportedNames(po.ast);
      const ib = importKeys(ps.ast), ia = importKeys(po.ast);
      const eOk = JSON.stringify(eb) === JSON.stringify(ea);
      const iOk = JSON.stringify(ib) === JSON.stringify(ia);
      if (eOk) f3.exportsOk++;
      if (iOk) f3.importsOk++;
      if (eOk && iOk) f3.bothOk++;
      else f3.fail.push({ rel, exportsBefore: eb, exportsAfter: ea, importsBefore: ib, importsAfter: ia });
    }

    // F4
    const outLits = allStringLiterals(po.ast);
    const outObs = observableStrings(po.ast);
    const want = decoded[rel] || [];
    if (want.length) {
      f4.filesWithStrings++;
      const missing = want.filter((s) => !outObs.has(s));
      f4.stringsChecked += want.length;
      if (missing.length) f4.fail.push({ rel, missing: missing.slice(0, 20), missingCount: missing.length });
      else f4.ok++;
    }

    // no-invented-strings check
    if (ps.ast) {
      const origLits = allStringLiterals(ps.ast);
      const decodedSet = new Set(want);
      const bad = [];
      for (const s of outLits) if (!origLits.has(s) && !decodedSet.has(s)) bad.push(s);
      if (bad.length) { f4.invented.push({ rel, samples: bad.slice(0, 10), count: bad.length }); f4.inventedCount += bad.length; }
    }

    // F4b: every original string outside the preamble must survive
    if (ps.ast) {
      const required = requiredOriginalStrings(ps.ast);
      f4b.checked++;
      const lost = Array.from(required).filter((s) => !outObs.has(s));
      if (lost.length) f4b.fail.push({ rel, lost: lost.slice(0, 20), lostCount: lost.length });
      else f4b.ok++;
    }

    // F7: no dangling/newly-free identifier introduced by the transform
    if (ps.ast) {
      f7.checked++;
      const freeBefore = freeIdentifierNames(ps.ast);
      const freeAfter = freeIdentifierNames(po.ast);
      const allowed = introducedGlobals(ps.ast);
      const all = Array.from(freeAfter).filter((n) => !freeBefore.has(n));
      const added = all.filter((n) => !allowed.has(n));
      f7.excused = (f7.excused || 0) + (all.length - added.length);
      if (added.length) f7.fail.push({ rel, added: added.slice(0, 20) });
      else f7.ok++;
    }
  }

  /* -------- AC-F5 byte-identical assets -------- */
  const f5 = { entries: copyMap.entries.length, ok: 0, fail: [], missing: [] };
  for (const e of copyMap.entries) {
    const s = path.join(ROOT, e.source);
    const d = path.join(ROOT, e.dest);
    if (!fs.existsSync(d)) { f5.missing.push(e.dest); continue; }
    const a = sha256File(s), b = sha256File(d);
    if (a === b && a === e.sha256) f5.ok++;
    else f5.fail.push({ source: e.source, dest: e.dest, srcSha: a, dstSha: b, mapSha: e.sha256 });
  }
  // completeness: every non-JS file in src has a map entry and an output file
  const srcAssets = walk(SRC, SRC, []).filter((f) => !f.endsWith(".js"));
  const mapSet = new Set(copyMap.entries.map((e) => e.source.replace(/^frontend\//, "")));
  const missingFromMap = srcAssets.filter((f) => !mapSet.has(f));
  const dstSet = new Set(dstAll);
  const missingFromDst = srcAssets.filter((f) => !dstSet.has(f));

  /* -------- AC-F6 report table -------- */
  for (const rel of srcJs) {
    const e = reportByRel.get(rel);
    if (!e) { f6.missingEntries.push(rel); continue; }
    for (const k of REQUIRED_FIELDS) if (!(k in e)) f6.missingFields.push(rel + ":" + k);
  }
  f6.present = f6.missingEntries.length === 0 && f6.missingFields.length === 0;

  /* -------- extra: no output outside recovered/ -------- */
  const extra = {
    srcJsCount: srcJs.length,
    dstJsCount: dstJs.length,
    dstOnlyJs: dstJs.filter((f) => !srcJs.includes(f)),
    srcJsMissingFromDst: srcJs.filter((f) => !dstJs.includes(f)),
    reportEntries: report.length,
    decodedFiles: Object.keys(decoded).length,
  };

  const summary = {
    "AC-F1 parse as ESM": { checked: f1.checked, pass: f1.ok, fail: f1.fail.length, failures: f1.fail.slice(0, 20) },
    "AC-F2 zero _0x identifiers": { checked: f2.checked, pass: f2.ok, fail: f2.fail.length, rawHits: f2.rawHits, identifierHits: f2.idHits, failures: f2.fail.slice(0, 20) },
    "AC-F3 exports+imports identical": { checked: f3.checked, exportsOk: f3.exportsOk, importsOk: f3.importsOk, pass: f3.bothOk, fail: f3.fail.length, failures: f3.fail.slice(0, 10) },
    "AC-F4 decoded strings present": { filesWithStrings: f4.filesWithStrings, stringsChecked: f4.stringsChecked, pass: f4.ok, fail: f4.fail.length, failures: f4.fail.slice(0, 10), inventedStrings: f4.inventedCount, invented: f4.invented.slice(0, 10) },
    "AC-F5 assets byte-identical": { entries: f5.entries, pass: f5.ok, fail: f5.fail.length, missing: f5.missing.length, missingFromMap: missingFromMap.length, missingFromDst: missingFromDst.length, failures: f5.fail.slice(0, 10) },
    "AC-F6 report table": { present: f6.present, entries: f6.entries, missingEntries: f6.missingEntries.slice(0, 10), missingFields: f6.missingFields.slice(0, 20) },
    "AC-F4b originals outside preamble survive": { checked: f4b.checked, pass: f4b.ok, fail: f4b.fail.length, failures: f4b.fail.slice(0, 10) },
    "AC-F7b no dangling references": { checked: f7.checked, pass: f7.ok, fail: f7.fail.length, excused: f7.excused || 0, failures: f7.fail.slice(0, 10) },
    extra,
  };
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, "frontend_validation.json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));

  const allPass =
    f1.fail.length === 0 &&
    f2.fail.length === 0 &&
    f3.fail.length === 0 &&
    f4.fail.length === 0 && f4.inventedCount === 0 &&
    f5.fail.length === 0 && f5.missing.length === 0 && missingFromMap.length === 0 && missingFromDst.length === 0 &&
    f6.present && extra.dstOnlyJs.length === 0 && extra.srcJsMissingFromDst.length === 0 &&
    f4b.fail.length === 0 && f7.fail.length === 0;
  console.log("VALIDATION: " + (allPass ? "ALL PASS" : "FAILURES PRESENT"));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });

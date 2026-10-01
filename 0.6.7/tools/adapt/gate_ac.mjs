// gate_ac.mjs -- the parent's extra gates on the produced tree.
//   AC-F7  zero identifier-safe computed string accesses (obj["prop"]) and zero
//          identifier-safe quoted object/class keys ({ "prop": v }).
//          vendor/** and *.min.js are copied verbatim from the original and are
//          reported separately (they are never rewritten by design).
//   AC-F8  every produced file is already prettier-clean under the shared
//          prettier options (vendor/** and *.min.js excluded by design).
//   AC-F9  the per-file adoption verdict table with canonical token sizes.
// Writes recovered/.work/frontend_ac_gates.json. Exit 1 if any gate fails.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRETTIER_OPTS, parseAny } from "../normalize_frontend.mjs";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const require = createRequire(path.join(ROOT, "recovered", ".tools-node") + path.sep);
const prettier = require("prettier");
const FRONTEND = path.join(ROOT, "recovered", "frontend");
const WORK = path.join(ROOT, "recovered", ".work");
const IDENT_SAFE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const KEY_NODES = new Set(["ObjectProperty", "ObjectMethod", "ClassProperty", "ClassMethod", "ClassPrivateProperty", "ClassPrivateMethod", "ClassAccessorProperty"]);

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile() && e.name.endsWith(".js")) out.push(rel);
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

const isExempt = (rel) => /(^|\/)vendor\//.test(rel) || rel.endsWith(".min.js");

const rels = walk(FRONTEND, FRONTEND, []).sort();
const f7 = { scanned: 0, computed: 0, quotedKeys: 0, offenders: [] };
const f7x = { scanned: 0, computed: 0, quotedKeys: 0, offenders: [] };
const f8 = { checked: 0, clean: 0, dirty: [] };
const failed = [];

for (const rel of rels) {
  const src = fs.readFileSync(path.join(FRONTEND, rel), "utf8");
  const pa = parseAny(src);
  if (!pa.ast) { failed.push({ rel, why: "parse failed for AC-F7" }); continue; }
  let computed = 0, quoted = 0;
  walkNodes(pa.ast.program, (n) => {
    if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") && n.computed && n.property && n.property.type === "StringLiteral" && IDENT_SAFE.test(n.property.value)) computed++;
    if (KEY_NODES.has(n.type) && !n.computed && n.key && n.key.type === "StringLiteral" && IDENT_SAFE.test(n.key.value)) quoted++;
  });
  f7.scanned++; f7.computed += computed; f7.quotedKeys += quoted;
  if (computed || quoted) f7.offenders.push({ rel, computed, quotedKeys: quoted });
  if (!isExempt(rel)) {
    f7x.scanned++; f7x.computed += computed; f7x.quotedKeys += quoted;
    if (computed || quoted) f7x.offenders.push({ rel, computed, quotedKeys: quoted });
    f8.checked++;
    let out = null;
    try { out = await prettier.format(src, PRETTIER_OPTS); } catch { out = null; }
    if (out === src) f8.clean++;
    else f8.dirty.push({ rel, prettierFailed: out === null });
  }
}

const verdictsPath = path.join(WORK, "frontend_verdicts.json");
const donorMapPath = path.join(WORK, "frontend_donor_map.json");
const verdicts = fs.existsSync(verdictsPath) ? JSON.parse(fs.readFileSync(verdictsPath, "utf8")) : null;
const donorMap = fs.existsSync(donorMapPath) ? JSON.parse(fs.readFileSync(donorMapPath, "utf8")) : null;
const files = (verdicts && verdicts.files) || (donorMap && donorMap.files) || [];
const byVerdict = {};
for (const f of files) { const v = f.verdict || "unknown"; byVerdict[v] = (byVerdict[v] || 0) + 1; }
const f9 = {
  table: files.map((f) => ({ rel: f.rel, verdict: f.verdict, donorTokens: f.tokDonor ?? null, myTokens: f.tokMine ?? null, adopted: !!f.adopted, cacheBustStringsReplaced: f.bustReplaced || 0, canonicalVerified: f.verified ?? null })),
  byVerdict,
  donorFiles: files.length,
  producedJs: rels.length,
  noDonorCounterpart: rels.filter((r) => !files.some((f) => f.rel === r))
};

const acF7 = f7x.computed === 0 && f7x.quotedKeys === 0;
const acF8 = f8.dirty.length === 0 && f8.clean === f8.checked;
const acF9 = Array.isArray(f9.table) && f9.table.length > 0 && Object.keys(byVerdict).length > 0;
if (!acF7) failed.push({ gate: "AC-F7", note: f7x.offenders.slice(0, 10) });
if (!acF8) failed.push({ gate: "AC-F8", note: f8.dirty.slice(0, 10) });
if (!acF9) failed.push({ gate: "AC-F9" });

const summary = {
  "AC-F7 residue (excl vendor/**, *.min.js)": { computedIdentifierSafe: f7x.computed, quotedIdentifierKeys: f7x.quotedKeys, filesScanned: f7x.scanned, offenders: f7x.offenders.length, pass: acF7 },
  "AC-F7 residue (whole produced tree)": { computedIdentifierSafe: f7.computed, quotedIdentifierKeys: f7.quotedKeys, filesScanned: f7.scanned, offenders: f7.offenders.length, exemptNote: "vendor/** and *.min.js are copied verbatim and excluded from the gate" },
  "AC-F8 prettier clean": { checked: f8.checked, clean: f8.clean, dirty: f8.dirty.length, dirtySamples: f8.dirty.slice(0, 10), pass: acF8 },
  "AC-F9 per-file verdict table": { donorFiles: f9.donorFiles, producedJs: f9.producedJs, byVerdict: f9.byVerdict, noDonorCounterpart: f9.noDonorCounterpart, pass: acF9 },
  failures: failed
};
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "frontend_ac_gates.json"), JSON.stringify({ summary, f7, f7x, f8, f9 }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log(acF7 && acF8 && acF9 ? "AC-F7/F8/F9: ALL PASS" : "AC-F7/F8/F9: FAILURES PRESENT");
process.exit(acF7 && acF8 && acF9 ? 0 : 1);

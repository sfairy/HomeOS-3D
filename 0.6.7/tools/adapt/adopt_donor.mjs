// adopt_donor.mjs -- adopt the proven 0.6.6 restored frontend wherever it is
// provably the same program as the 0.6.7 file, and transplant 0.6.7's ?v=
// cache-bust strings back on top.
//
// Comparison uses verify_frontend_rename.mjs's canonical token stream, which
// folds obfuscator artefacts (obj["x"] -> K:x, 0x78 -> N:120, !0x0 -> true,
// bindings -> B:<source-order id>). Because the P1 pass folds identifier-safe
// quoted keys ({ "x": v } -> { x: v }), which the stock stream spells
// differently (S:"x" vs K:x), the DONOR side is put through the same P1
// normaliser in memory before comparing -- so the verdict is name-agnostic and
// spelling-agnostic. Names are never touched by normalisation, so the adopted
// file keeps 0.6.6's naming.
//
// Verdicts:
//   byte-identical   donor bytes == my bytes
//   alpha-equivalent donor and mine render the same canonical stream -> adopt
//   cache-bust-only  streams differ ONLY in ?v= strings -> adopt, then re-apply
//                    the 0.6.7 ?v= strings taken from the ORIGINAL 0.6.7 file
//                    (module specifiers AND body strings, e.g. a CSS href), so
//                    AC-F3 (imports byte-exact) and AC-F4 (decoded strings
//                    survive) both still hold
//   mismatch         genuinely different program (a 0.6.7 feature) -> keep mine
//
// usage: node adopt_donor.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "./canon.mjs";
import { parseAny, normalizeAndFormat, PRETTIER_OPTS } from "../normalize_frontend.mjs";
import { createRequire } from "node:module";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const require = createRequire(path.join(ROOT, "recovered", ".tools-node") + path.sep);
const prettier = require("prettier");

const DONOR = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.6/frontend";
const MINE = path.join(ROOT, "recovered", "frontend");
const ORIG = path.join(ROOT, "frontend");
const WORK = path.join(ROOT, "recovered", ".work");
const DRY = process.argv.includes("--dry");

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile() && e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

const mask = (toks) => toks.map((t) => (t.startsWith('S:"') && t.includes("?v=") ? "S:<CACHEBUST>" : t));
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function moduleSources(ast) {
  const out = [];
  for (const n of ast.program.body) {
    if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source) out.push(n.source.value);
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

/** Re-apply ORIG's ?v= strings (module specifiers and body strings) onto donor text. */
function patchBust(donorText, origText, decodedList) {
  const pa = parseAny(donorText);
  const pb = parseAny(origText);
  if (!pa.ast) return { text: donorText, replaced: 0, unmatched: ["<donor parse failed>"] };

  const donorLits = [];
  walkNodes(pa.ast.program, (n) => {
    if (n.type === "StringLiteral" && n.value.includes("?v=")) donorLits.push(n);
  });
  if (!donorLits.length) return { text: donorText, replaced: 0, unmatched: [] };

  const origVals = new Set();
  if (pb.ast) {
    for (const s of moduleSources(pb.ast)) origVals.add(s);
    walkNodes(pb.ast.program, (n) => {
      if (n.type === "StringLiteral") origVals.add(n.value);
      else if (n.type === "DirectiveLiteral") origVals.add(n.value);
    });
  }
  for (const s of decodedList || []) if (typeof s === "string") origVals.add(s);

  const byPrefix = new Map();
  for (const v of origVals) {
    if (!v.includes("?v=")) continue;
    const p = v.split("?")[0];
    if (!byPrefix.has(p)) byPrefix.set(p, new Set());
    byPrefix.get(p).add(v);
  }

  const edits = [];
  const unmatched = [];
  for (const lit of donorLits) {
    const prefix = lit.value.split("?")[0];
    const set = byPrefix.get(prefix);
    const list = set ? Array.from(set) : [];
    let want = null;
    if (list.length === 1) want = list[0];
    else if (list.length > 1) {
      const starts = list.filter((v) => v.startsWith(lit.value));
      if (starts.length === 1) want = starts[0];
    }
    if (!want) { unmatched.push(lit.value); continue; }
    if (want !== lit.value) edits.push({ start: lit.start, end: lit.end, text: JSON.stringify(want) });
  }
  let text = donorText;
  for (const e of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return { text, replaced: edits.length, unmatched };
}

const decoded = JSON.parse(fs.readFileSync(path.join(WORK, "frontend_decoded.json"), "utf8"));
const rels = walk(DONOR, DONOR, []).sort();
const report = [];
const totals = { donorFiles: rels.length, byteIdentical: 0, alphaEquivalent: 0, cacheBustOnly: 0, mismatch: 0, written: 0, cacheBustStringsReplaced: 0, verifyFailed: [], missingInMine: [], unmatchedBust: [] };

for (const rel of rels) {
  const dRaw = fs.readFileSync(path.join(DONOR, rel), "utf8");
  const mPath = path.join(MINE, rel);
  if (!fs.existsSync(mPath)) { totals.missingInMine.push(rel); continue; }
  const mText = fs.readFileSync(mPath, "utf8");

  let verdict, text, tokDonor = null, tokMine = null, bustReplaced = 0, unmatched = [];
  if (dRaw === mText) {
    verdict = "byte-identical";
    text = dRaw;
  } else {
    const nd = await normalizeAndFormat(dRaw);
    const dText = nd.counts ? nd.code : dRaw;
    const nm = await normalizeAndFormat(mText);
    const mNorm = nm.counts ? nm.code : mText;
    const ta = canonicalize(dText);
    const tb = canonicalize(mNorm);
    tokDonor = ta.length; tokMine = tb.length;
    if (eq(ta, tb)) { verdict = "alpha-equivalent"; text = dText; }
    else if (eq(mask(ta), mask(tb))) {
      verdict = "cache-bust-only";
      const origPath = path.join(ORIG, rel);
      const res = fs.existsSync(origPath) ? patchBust(dText, fs.readFileSync(origPath, "utf8"), decoded[rel]) : { text: dText, replaced: 0, unmatched: ["<no original>"] };
      text = res.text; bustReplaced = res.replaced; unmatched = res.unmatched;
      if (bustReplaced) { try { text = await prettier.format(text, PRETTIER_OPTS); } catch { /* keep splice */ } }
    } else { verdict = "mismatch"; text = null; }
  }

  if (verdict === "byte-identical") totals.byteIdentical++;
  else if (verdict === "alpha-equivalent") totals.alphaEquivalent++;
  else if (verdict === "cache-bust-only") totals.cacheBustOnly++;
  else totals.mismatch++;
  totals.cacheBustStringsReplaced += bustReplaced;
  if (unmatched.length) totals.unmatchedBust.push({ rel, unmatched });

  let verified = null;
  if (text !== null && verdict !== "byte-identical") {
    const nd = await normalizeAndFormat(dRaw);
    const dText = nd.counts ? nd.code : dRaw;
    verified = eq(mask(canonicalize(text)), mask(canonicalize(dText)));
    if (!verified) totals.verifyFailed.push(rel);
  }

  if (text !== null && text !== mText) {
    if (!DRY) fs.writeFileSync(mPath, text);
    totals.written++;
  }
  report.push({ rel, verdict, tokDonor, tokMine, adopted: text !== null, bustReplaced, unmatched, verified });
}

fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "frontend_donor_map.json"), JSON.stringify({ donorRoot: DONOR, dry: DRY, totals, files: report }, null, 1));
console.log(JSON.stringify(totals, null, 1));

// annotate the per-file report with adoption verdicts (AC-F9 carries this table)
try {
  const repPath = path.join(WORK, "frontend_report.json");
  const rep = JSON.parse(fs.readFileSync(repPath, "utf8"));
  const byRel = new Map(report.map((r) => [r.rel, r]));
  let merged = 0;
  for (const e of rep) {
    const v = byRel.get(e.rel);
    if (v) {
      e.adoption = { verdict: v.verdict, adopted: v.adopted, donorTokens: v.tokDonor, myTokens: v.tokMine, cacheBustStringsReplaced: v.bustReplaced, canonicalVerified: v.verified };
      merged++;
    } else {
      e.adoption = { verdict: "no-donor-counterpart", adopted: false, donorTokens: null, myTokens: null, cacheBustStringsReplaced: 0, canonicalVerified: null };
    }
  }
  fs.writeFileSync(repPath, JSON.stringify(rep, null, 1));
  console.log("report entries annotated with adoption verdicts: " + merged + " adopted of " + rep.length);
} catch (e) { console.log("report annotation skipped: " + e.message); }

if (!totals.verifyFailed.length) console.log("POST-COPY CANONICAL VERIFICATION: all adopted files still match");

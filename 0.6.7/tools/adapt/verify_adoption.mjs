// verify_adoption.mjs -- final per-file equivalence proof against the 0.6.6 donor.
//
// The P1 pass folds identifier-safe quoted keys ({ "x": v } -> { x: v }), and the
// stock canonical stream spells those differently (S:"x" vs K:x) even though they
// denote the same property. So BOTH sides are put through the same P1 normalizer
// in memory first (names are never touched by normalisation), and the stock
// comparator then decides. This yields the per-file verdict table (AC-F9).
//
// usage: node verify_adoption.mjs [--out <json>] [--quiet]

import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "./canon.mjs";
import { normalizeAndFormat } from "../normalize_frontend.mjs";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const DONOR = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.6/frontend";
const MINE = path.join(ROOT, "recovered", "frontend");
const outArg = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(ROOT, "recovered", ".work", "frontend_verdicts.json");

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile() && e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}
const mask = (t) => t.map((x) => (x.startsWith('S:"') && x.includes("?v=") ? "S:<CACHEBUST>" : x));
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const prior = JSON.parse(fs.readFileSync(path.join(ROOT, "recovered", ".work", "frontend_donor_map.json"), "utf8"));
const priorByRel = new Map(prior.files.map((f) => [f.rel, f]));

const rels = walk(DONOR, DONOR, []).sort();
const files = [];
const totals = { donorFiles: rels.length, byteIdentical: 0, alphaEquivalent: 0, cacheBustOnly: 0, mismatch: 0, disagreements: [], missingInMine: [] };

for (const rel of rels) {
  const dText = fs.readFileSync(path.join(DONOR, rel), "utf8");
  const mPath = path.join(MINE, rel);
  if (!fs.existsSync(mPath)) { totals.missingInMine.push(rel); continue; }
  const mText = fs.readFileSync(mPath, "utf8");
  let verdict;
  let tokDonor = null, tokMine = null;
  if (dText === mText) verdict = "byte-identical";
  else {
    const nd = await normalizeAndFormat(dText);
    const ta = canonicalize(nd.counts ? nd.code : dText);
    const tb = canonicalize(mText);
    tokDonor = ta.length; tokMine = tb.length;
    if (eq(ta, tb)) verdict = "alpha-equivalent";
    else if (eq(mask(ta), mask(tb))) verdict = "cache-bust-only";
    else verdict = "mismatch";
  }
  if (verdict === "byte-identical") totals.byteIdentical++;
  else if (verdict === "alpha-equivalent") totals.alphaEquivalent++;
  else if (verdict === "cache-bust-only") totals.cacheBustOnly++;
  else totals.mismatch++;
  const p = priorByRel.get(rel);
  const agreed = p ? (p.verdict === verdict || (p.verdict === "byte-identical" && verdict === "alpha-equivalent")) : null;
  if (agreed === false) totals.disagreements.push({ rel, before: p.verdict, after: verdict });
  files.push({ rel, verdict, priorVerdict: p ? p.verdict : null, tokDonor, tokMine, agreed });
}

fs.mkdirSync(path.dirname(outArg), { recursive: true });
fs.writeFileSync(outArg, JSON.stringify({ donorRoot: DONOR, mine: MINE, totals, files }, null, 1));
console.log(JSON.stringify({ ...totals, out: outArg }, null, 1));
const mm = files.filter((f) => f.verdict === "mismatch");
console.log("MISMATCH (" + mm.length + "):");
for (const f of mm) console.log("  " + f.rel + "  donor=" + f.tokDonor + " mine=" + f.tokMine + (f.priorVerdict === "mismatch" ? "" : "  [WAS " + f.priorVerdict + "]"));

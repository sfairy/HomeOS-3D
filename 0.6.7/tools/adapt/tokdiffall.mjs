import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "./canon.mjs";
const [donorDir, mineDir, listFile] = process.argv.slice(2);
const rels = fs.readFileSync(listFile, "utf8").split("\n").filter(Boolean);
const out = [];
for (const rel of rels) {
  let ta, tb;
  try {
    ta = canonicalize(fs.readFileSync(path.join(donorDir, rel), "utf8"));
    tb = canonicalize(fs.readFileSync(path.join(mineDir, rel), "utf8"));
  } catch (e) { out.push({ rel, err: String(e.message).slice(0, 120) }); continue; }
  const diffs = [];
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n && diffs.length < 4; i++) if (ta[i] !== tb[i]) diffs.push({ i, A: ta[i] ?? null, B: tb[i] ?? null });
  out.push({ rel, tokA: ta.length, tokB: tb.length, firstDiff: diffs });
}
console.log(JSON.stringify(out, null, 1));

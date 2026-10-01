import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "./canon.mjs";
const [donorDir, mineDir, listFile] = process.argv.slice(2);
const rels = fs.readFileSync(listFile, "utf8").split("\n").filter(Boolean);
const mask = (toks) => toks.map((t) => (t.startsWith('S:"') && t.includes("?v=") ? "S:<CACHEBUST>" : t));
const out = [];
for (const rel of rels) {
  const ta = canonicalize(fs.readFileSync(path.join(donorDir, rel), "utf8"));
  const tb = canonicalize(fs.readFileSync(path.join(mineDir, rel), "utf8"));
  const ma = mask(ta), mb = mask(tb);
  const maskedEqual = ma.length === mb.length && ma.every((x, i) => x === mb[i]);
  let firstReal = null;
  const n = Math.max(ma.length, mb.length);
  for (let i = 0; i < n; i++) if (ma[i] !== mb[i]) { firstReal = { i, A: ma[i] ?? null, B: mb[i] ?? null }; break; }
  // cache-bust strings that differ
  const bustA = ta.filter((t) => t.startsWith('S:"') && t.includes("?v="));
  const bustB = tb.filter((t) => t.startsWith('S:"') && t.includes("?v="));
  const onlyA = bustA.filter((x) => !bustB.includes(x));
  const onlyB = bustB.filter((x) => !bustA.includes(x));
  out.push({ rel, tokA: ta.length, tokB: tb.length, maskedEqual, firstReal, onlyA: onlyA.length, onlyB: onlyB.length });
}
console.log(JSON.stringify(out, null, 1));

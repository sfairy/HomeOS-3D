// normalize_frontend_list.mjs -- P1-normalize an explicit list of rel paths.
import fs from "node:fs";
import path from "node:path";
import { normalizeAndFormat } from "./normalize_frontend.mjs";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const FRONTEND = path.join(ROOT, "recovered", "frontend");
const listFile = process.argv[2];
const rels = fs.readFileSync(listFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const totals = { files: 0, dotAccess: 0, bareKey: 0, rawStripped: 0, boolFolded: 0, parseFail: [] };
for (const rel of rels) {
  const abs = path.join(FRONTEND, rel);
  const before = fs.readFileSync(abs, "utf8");
  const res = await normalizeAndFormat(before);
  if (!res.counts) { totals.parseFail.push(rel); continue; }
  if (res.code !== before) fs.writeFileSync(abs, res.code);
  totals.files++;
  for (const k of ["dotAccess", "bareKey", "rawStripped", "boolFolded"]) totals[k] += res.counts[k];
}
console.log(JSON.stringify(totals, null, 1));

import fs from "node:fs";
import { canonicalize } from "./canon.mjs";
const [a, b] = process.argv.slice(2);
const ta = canonicalize(fs.readFileSync(a, "utf8"));
const tb = canonicalize(fs.readFileSync(b, "utf8"));
console.log("tokens", ta.length, tb.length);
let shown = 0;
const n = Math.max(ta.length, tb.length);
for (let i = 0; i < n && shown < 12; i++) {
  if (ta[i] !== tb[i]) {
    shown++;
    console.log("--- first diff at " + i);
    for (let j = Math.max(0, i - 6); j < Math.min(n, i + 6); j++)
      console.log((j === i ? ">> " : "   ") + j + "  A=" + JSON.stringify(ta[j]) + "   B=" + JSON.stringify(tb[j]));
    break;
  }
}

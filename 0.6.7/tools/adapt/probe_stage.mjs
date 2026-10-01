
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/.tools-node/");
const parser = require("@babel/parser");

function lits(file) {
  const src = fs.readFileSync(file, "utf8");
  const ast = parser.parse(src, { sourceType: "module", errorRecovery: true, plugins: ["importAttributes","topLevelAwait","classProperties","dynamicImport","optionalChaining","nullishCoalescingOperator"] });
  const out = [];
  (function w(n){ if(!n||typeof n.type!=="string")return;
    if(n.type==="StringLiteral") out.push({v:n.value, computed:n.computed, pt:null});
    if(n.type==="TemplateElement") out.push({v:n.value.cooked, t:true});
    for(const k of Object.keys(n)){ if(k==="loc"||k==="start"||k==="end"||k==="extra")continue; const v=n[k];
      if(Array.isArray(v)){for(const c of v) if(c&&typeof c.type==="string") w(c);} else if(v&&typeof v.type==="string") w(v); } })(ast.program);
  return out.map(o=>o.v).filter(v=>typeof v==="string" && v.includes("interaction3d/stage.js"));
}
const sets = {
  orig: lits("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/frontend/static/3d-studio/stage-startup.js"),
  mine: lits("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/frontend/static/3d-studio/stage-startup.js"),
  donor: lits("/Users/sfairy/项目/HA-Bridge/源代码/0.6.6/frontend/static/3d-studio/stage-startup.js"),
};
for (const [k,v] of Object.entries(sets)) {
  for (const s of v) console.log(k, "len="+s.length, JSON.stringify(s.slice(0,60)), "...", JSON.stringify(s.slice(-50)));
}
const o = sets.orig[0]||"", m = sets.mine[0]||"", d = sets.donor[0]||"";
console.log("orig===mine?", o===m, "| orig===donor?", o===d, "| mine===donor?", m===d);
console.log("orig has floor-shadow token:", o.includes("20260930-floor-shadow-device-pose-v1"));
console.log("mine has floor-shadow token:", m.includes("20260930-floor-shadow-device-pose-v1"));
console.log("donor has floor-shadow token:", d.includes("20260930-floor-shadow-device-pose-v1"));
console.log("orig len", o.length, "mine len", m.length, "donor len", d.length);

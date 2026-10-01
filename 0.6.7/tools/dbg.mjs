
import { createRequire } from "module";
const require = createRequire("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/.tools-node/");
const { parseAny, analyzePreamble, collectLiveIdentifierNodes } = await import("./deobfuscate_js.mjs");
const tr = require("@babel/traverse");
const traverse = tr.default || tr;
import fs from "node:fs";

const rel = process.argv[2];
const src = fs.readFileSync("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/frontend/" + rel, "utf8");
const p = parseAny(src);
const pre = analyzePreamble(p.ast);
const live = collectLiveIdentifierNodes(p.ast);
console.log("decoder:", pre.decoderName, "provider:", pre.providers.map(f=>f.id.name).join(","), "iifes:", pre.iifes.length);
traverse(p.ast, { Program(prog){
  const names = [pre.decoderName, ...(pre.aliasDeclarations||[]).flatMap(s=>s.declarations.map(d=>d.id.name))];
  for (const nm of names) {
    const b = prog.scope.getBinding(nm);
    if (!b) { console.log(nm, "-> no binding"); continue; }
    const byType = {};
    for (const rp of b.referencePaths) {
      const k = (rp.node ? rp.node.type : "null") + (rp.node && live.has(rp.node) ? " LIVE" : " DEAD");
      byType[k] = (byType[k]||0)+1;
    }
    console.log(nm, "bindings:", "refs:", JSON.stringify(byType), "cv:", b.constantViolations.length);
  }
}});

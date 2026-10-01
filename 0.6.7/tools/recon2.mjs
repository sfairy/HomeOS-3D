
import { createRequire } from "module";
const require = createRequire("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/.tools-node/");
const parser = require("@babel/parser");
import fs from "fs";
const WS = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const targets = [
 "frontend/modules/interaction3d/television-panel.js",
 "frontend/modules/interaction3d/television-state.js",
 "frontend/static/3d-studio/background-import.js",
 "frontend/static/3d-studio/courtyard-drawing-editor.js",
 "frontend/static/3d-studio/model-asset-loader.js",
 "frontend/static/3d-studio/studio-fan.js",
];
for (const t of targets) {
  const src = fs.readFileSync(WS+"/"+t, "utf8");
  const ast = parser.parse(src, {sourceType:"module", plugins:["importAttributes","topLevelAwait","jsx"], errorRecovery:true});
  console.log("\n########", t, src.length, "bytes");
  for (const n of ast.program.body) {
    if (n.type==="FunctionDeclaration" && n.id && /^_0x[0-9a-f]+$/.test(n.id.name)) {
      console.log("--- FN", n.id.name, "params="+n.params.length, (n.end-n.start), "bytes");
      console.log(src.slice(n.start, Math.min(n.end, n.start+420)).replace(/\n/g," "));
    }
    if (n.type==="ExpressionStatement" && n.expression.type==="CallExpression" && n.expression.callee.type==="FunctionExpression") {
      console.log("--- IIFE", (n.end-n.start), "bytes");
    }
    if (n.type==="VariableDeclaration") {
      const d=n.declarations[0];
      if(d&&d.id.type==="Identifier"&&/^_0x/.test(d.id.name)&&d.init&&d.init.type==="Identifier") console.log("--- ALIAS", src.slice(n.start,n.end));
    }
  }
}

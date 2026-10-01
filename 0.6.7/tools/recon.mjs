
import { createRequire } from "module";
const require = createRequire("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/.tools-node/");
const parser = require("@babel/parser");
import fs from "fs";
import path from "path";

const WS = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const FE = path.join(WS, "frontend");

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const files = walk(FE).sort();

const shapes = {};
const rows = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(WS, f);
  let ast;
  try {
    ast = parser.parse(src, {sourceType:"module", plugins:["importAttributes","topLevelAwait","classProperties","classPrivateProperties","classPrivateMethods","dynamicImport","exportDefaultFrom","exportNamespaceFrom","objectRestSpread","optionalChaining","nullishCoalescingOperator","numericSeparator","logicalAssignment","bigInt","importMeta","asyncGenerators","jsx","topLevelAwait"], errorRecovery:true});
  } catch(e) {
    rows.push({rel, err: e.message});
    continue;
  }
  const kinds = [];
  let aliasConst = 0, iife = 0, decl0 = [], decl2 = [];
  for (const n of ast.program.body) {
    let t = n.type;
    if (t === "ExpressionStatement" && n.expression.type === "CallExpression" && (n.expression.callee.type==="FunctionExpression"||n.expression.callee.type==="ArrowFunctionExpression")) { iife++; t="IIFE"; 
      // count decoder calls in iife
    }
    else if (t === "VariableDeclaration") {
      const d = n.declarations[0];
      if (d && d.id.type==="Identifier" && /^_0x[0-9a-f]+$/.test(d.id.name) && d.init && d.init.type==="Identifier" && /^_0x[0-9a-f]+$/.test(d.init.name)) { aliasConst++; t="ALIAS"; }
      else t = "VAR:"+n.kind+":"+(d&&d.id.type);
    }
    else if (t === "FunctionDeclaration") {
      if (n.id && /^_0x[0-9a-f]+$/.test(n.id.name)) {
        if (n.params.length===2) { decl2.push(n.id.name); t="DEC2"; }
        else if (n.params.length===0) { decl0.push(n.id.name); t="DEC0"; }
        else t="FN"+n.params.length;
      } else t="FN:"+(n.id&&n.id.name);
    }
    else if (t === "ImportDeclaration") t="IMPORT";
    else if (t === "ExportNamedDeclaration" || t === "ExportDefaultDeclaration" || t==="ExportAllDeclaration") t="EXPORT";
    else if (t === "EmptyStatement") t="EMPTY";
    else if (t === "VariableDeclaration") t="VAR";
    kinds.push(t);
  }
  const head = kinds.slice(0,6).join(",");
  shapes[head] = (shapes[head]||0)+1;
  rows.push({rel, bytes: src.length, kinds: kinds.slice(0,8), decl2, decl0, total: kinds.length, err:null, b64: /atob|charCodeAt|fromCharCode|base64/i.test(src)});
}
console.log("TOTAL FILES:", files.length);
console.log("PARSE ERRORS:", rows.filter(r=>r.err).length);
for (const r of rows.filter(r=>r.err)) console.log("  ERR", r.rel, r.err);
console.log("\n=== SHAPE HEAD HISTOGRAM ===");
for (const [k,v] of Object.entries(shapes).sort((a,b)=>b[1]-a[1])) console.log(String(v).padStart(4), k);
console.log("\n=== FILES WITH b64/charCode markers ===");
for (const r of rows.filter(r=>r.b64 && !r.err)) console.log("  ", r.rel);
console.log("\n=== FILES WITH MULTIPLE DEC2 ===");
for (const r of rows.filter(r=>r.decl2 && r.decl2.length>1 && !r.err)) console.log("  ", r.rel, r.decl2.join(","));
console.log("\n=== FILES WITH decl0 but no decl2 ===");
for (const r of rows.filter(r=>r.decl0.length && !r.decl2.length && !r.err).slice(0,20)) console.log("  ", r.rel, r.decl0.join(","));
console.log("count:", rows.filter(r=>r.decl0.length && !r.decl2.length && !r.err).length);
fs.writeFileSync(path.join(WS,"recovered/.work/recon.json"), JSON.stringify(rows,null,1));

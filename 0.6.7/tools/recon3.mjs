
import { createRequire } from "module";
const require = createRequire("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7/recovered/.tools-node/");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
import fs from "fs"; import path from "path";
const WS = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.name.endsWith(".js"))out.push(p);}return out;}
const files = walk(path.join(WS,"frontend")).sort();
let exportClash=[], importClash=[], total=0;
const perFile=[];
for (const f of files) {
  const src = fs.readFileSync(f,"utf8");
  const rel = path.relative(WS,f);
  let ast; try{ ast=parser.parse(src,{sourceType:"module",plugins:["importAttributes","topLevelAwait","jsx"],errorRecovery:true}); }catch(e){ continue; }
  const msg = (src.match(/_0x[0-9a-f]{4,}/g)||[]).length;
  total += msg;
  const ex=[], im=[];
  for (const n of ast.program.body) {
    if (n.type==="ExportNamedDeclaration" && n.declaration) {
      const d=n.declaration;
      if (d.type==="FunctionDeclaration"||d.type==="ClassDeclaration") if(d.id) ex.push(d.id.name);
      if (d.type==="VariableDeclaration") for(const dd of d.declarations){ if(dd.id.type==="Identifier") ex.push(dd.id.name); else if(dd.id.type==="ObjectPattern") for(const p of dd.id.properties) if(p.value&&p.value.type==="Identifier") ex.push(p.value.name); }
    }
    if (n.type==="ExportNamedDeclaration" && n.specifiers) for(const s of n.specifiers){ const name = s.local? (s.local.name||"") : ""; const exp = s.exported? (s.exported.name||s.exported.value||"") : ""; ex.push(name); ex.push(exp); }
    if (n.type==="ExportDefaultDeclaration") ex.push("default");
    if (n.type==="ExportAllDeclaration") ex.push("*");
    if (n.type==="ImportDeclaration") for(const s of n.specifiers) im.push(s.local.name);
  }
  const exBad = ex.filter(x=>/^_0x[0-9a-f]{4,}$/.test(x));
  const imBad = im.filter(x=>/^_0x[0-9a-f]{4,}$/.test(x));
  if (exBad.length) exportClash.push([rel,exBad]);
  if (imBad.length) importClash.push([rel,imBad]);
  perFile.push({rel, msg, exBad:exBad.length, imBad:imBad.length, ex:ex.length, bytes:src.length});
}
console.log("total _0x[4+] occurrences:", total);
console.log("\n=== EXPORT NAMES matching _0x ===", exportClash.length);
for(const [r,b] of exportClash) console.log("  ",r, b.join(","));
console.log("\n=== IMPORT LOCAL NAMES matching _0x ===", importClash.length);
for(const [r,b] of importClash) console.log("  ",r, b.join(","));
console.log("\n=== top files by _0x count ===");
perFile.sort((a,b)=>b.msg-a.msg);
for(const p of perFile.slice(0,15)) console.log("  ", String(p.msg).padStart(7), p.bytes.toString().padStart(8), p.rel);
console.log("\n=== files with 0 _0x ===", perFile.filter(p=>p.msg===0).length);

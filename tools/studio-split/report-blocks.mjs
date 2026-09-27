import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(path.join(ROOT, "node_modules/typescript"));
const F = process.argv[2] || path.join(ROOT, "homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts");
const src = fs.readFileSync(F, "utf8");
const sf = ts.createSourceFile(F, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = o => sf.getLineAndCharacterOfPosition(o).line + 1;
const rows = [];
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) continue;
  const a = lineOf(st.getStart(sf)), b = lineOf(st.getEnd());
  let name = "(statement)";
  if (ts.isFunctionDeclaration(st) && st.name) name = st.name.text + "()";
  else if (ts.isVariableStatement(st)) name = st.declarationList.declarations.map(d => d.name.getText(sf)).join(", ");
  rows.push({ a, b, n: b - a + 1, name });
}
rows.sort((x, y) => y.n - x.n);
console.log(`总文件 ${src.split("\n").length} 行 / 顶层语句 ${rows.length} 条\n`);
for (const r of rows.slice(0, 16)) console.log(`  L${String(r.a).padStart(5)}-${String(r.b).padStart(5)}  ${String(r.n).padStart(5)} 行  ${r.name.slice(0, 70)}`);

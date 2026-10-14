/**
 * 值级不变量检查：白名单式核对「非字面量初值没有丢」。
 *
 * 上一版 `verify_state_context.mjs` 只检查宿主里**存在** `ctx.x = …` 赋值，
 * 会被依赖袋 setter（`set x(v) { ctx.x = v }`）误判为「已写回」。这一版按**初值文本**核对：
 * 对每个「工厂里是占位值（非字面量搬不动）」的字段，宿主必须存在
 * `ctx.<name> = <原初值文本>`（空白折叠后逐字相等）。
 *
 * 用法: node ops/studio/verify_ctx_values.mjs <pristine.ts> <current.ts> <ctx.ts> <ctxVar>
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [origFile, curFile, ctxFile, ctxVar] = process.argv.slice(2);
const collapse = (s) => s.replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
const read = (f) => ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

// 1) 原文件：字段 -> 初值文本（同名取第一次声明）
const origSf = read(origFile);
const inits = new Map();
(function walk(n) {
  if (ts.isVariableStatement(n)) {
    for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && !inits.has(d.name.text)) {
        inits.set(d.name.text, collapse(d.initializer.getText(origSf)));
      }
    }
  }
  ts.forEachChild(n, walk);
})(origSf);

// 2) 上下文工厂：字段 -> 值文本
const ctxSf = read(ctxFile);
const vals = new Map();
(function walk(n) {
  if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
    for (const p of n.expression.properties) {
      if (ts.isPropertyAssignment(p)) vals.set(p.name.text, collapse(p.initializer.getText(ctxSf)));
    }
  }
  ts.forEachChild(n, walk);
})(ctxSf);

// 断言（`x as any` / `x as any[]`）不改变运行时值：生成器会剥掉它，核对时两边都归一化。
// （宽松文本规则：校验器的误判方向必须是「更严格」，这里只影响 `as any` 这种自足断言。）
const stripAny = (t) => t.replace(/\s+as\s+any(\[\])?(?=\s*[,)\]}]|$)/g, "");
const same = (a, b) => stripAny(a) === stripAny(b);

const curText = collapse(fs.readFileSync(curFile, "utf8"));
const fieldNames = [...vals.keys()];
/** 初值里引用到的**已迁移**变量会被改写成 `ctx.<name>`，核对时两种写法都要认。 */
const renameAware = (text) =>
  fieldNames.reduce(
    (acc, n) => acc.replace(new RegExp(`(?<![.\\w$])${esc(n)}(?![\\w$])`, "g"), `${ctxVar}.${n}`),
    text,
  );

const lost = [];
let placeholders = 0;
for (const [name, init] of inits) {
  if (!vals.has(name)) continue; // 未迁移
  const val = vals.get(name);
  const isPlaceholder = val === "undefined" || val.startsWith("undefined as unknown as");
  if (!isPlaceholder) {
    // 字面量已搬进工厂：必须与原初值一致（断言归一化后）
    if (!same(val, init)) lost.push({ name, kind: "工厂值与初值不符", init, val });
    continue;
  }
  placeholders++;
  const candidates = [init, renameAware(init)];
  if (!candidates.some((c) => new RegExp(`${ctxVar}\\.${esc(name)}\\s*=\\s*${esc(c)}`).test(curText))) {
    lost.push({ name, kind: "宿主里找不到初值写回", init, val })
  }
}

const anyFields = [...vals.keys()].filter((n) => {
  const m = fs.readFileSync(ctxFile, "utf8").match(new RegExp(`^\\s+${n}:\\s*(.+?);\\s*$`, "m"));
  return m && m[1].trim() === "any";
});
console.log(`\n=== ${path.basename(curFile)} / ${path.basename(ctxFile)} ===`);
console.log(`字段=${vals.size} 占位(需写回)=${placeholders} 违规=${lost.length} 退 any=${anyFields.length}`);
for (const l of lost) console.log(`  ✗ ${l.name} [${l.kind}]\n      初值=${l.init.slice(0, 90)}\n      工厂=${l.val.slice(0, 90)}`);
if (!lost.length) console.log("✓ 占位字段全部在宿主里按原初值写回（运行时语义不变）");

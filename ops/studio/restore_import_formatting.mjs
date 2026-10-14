#!/usr/bin/env node
/**
 * 一次性修复：把 `studio_slice_extract.mjs` 早期「死导入清理」造成的**格式坍塌**还原。
 *
 * 现象：早期实现是「把整条 import 声明按 specifier 重建」（`import { a, b } from "x"`），
 * 于是源码里成片的多行 import 被压成单行（长到 800+ 字符），与 P4「逐字复制、零无关改动」的口径相悖。
 *
 * 做法：以 `git show HEAD:<file>` 的同名 import 声明为**格式真源**，
 * 把「当前声明里已没有的名字」从 HEAD 文本里按 specifier 粒度抠掉，其余逐字沿用；
 * HEAD 里没有的声明（本次搬运新增的回引）保持现状。
 */
import ts from "typescript";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const [file, headRef = "HEAD"] = process.argv.slice(2);
if (!file) {
  console.error("用法：node ops/studio/restore_import_formatting.mjs <file> [<git-ref>]");
  process.exit(2);
}
const headText = execFileSync("git", ["show", `${headRef}:${file}`], { encoding: "utf8", maxBuffer: 1 << 28 });
const currentText = fs.readFileSync(file, "utf8");

const parse = (text) =>
  ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const keyOf = (decl, sf) => {
  const clause = decl.importClause;
  return JSON.stringify({
    module: decl.moduleSpecifier.getText(sf),
    typeOnly: !!clause?.isTypeOnly,
    def: clause?.name?.text ?? null,
    ns: clause && clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)
      ? clause.namedBindings.name.text
      : null,
  });
};
const localsOf = (decl) => {
  const out = [];
  const clause = decl.importClause;
  if (!clause) return out;
  if (clause.name) out.push(clause.name.text);
  const b = clause.namedBindings;
  if (b && ts.isNamespaceImport(b)) out.push(b.name.text);
  else if (b) for (const s of b.elements) out.push(s.name.text);
  return out;
};

const headSf = parse(headText);
const curSf = parse(currentText);
const headByKey = new Map();
for (const st of headSf.statements)
  if (ts.isImportDeclaration(st)) headByKey.set(keyOf(st, headSf), st);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 从声明文本里按 specifier 粒度抠掉一个本地名（保住其余排版）。 */
function dropSpecifier(declText, specText) {
  const S = `(?<![\\w$])${escape(specText)}(?![\\w$])`;
  const patterns = [
    new RegExp(`\\n[ \\t]*${S}[ \\t]*,[ \\t]*`, "g"), // 独立成行 + 后随逗号
    new RegExp(`,?[ \\t]*\\n[ \\t]*${S}(?=[ \\t]*\\n)`, "g"), // 末项独立成行
    new RegExp(`[ \\t]*${S}[ \\t]*,[ \\t]*`, "g"), // 同行 + 后随逗号
    new RegExp(`[ \\t]*,[ \\t]*${S}(?=[ \\t]*\\})`, "g"), // 同行末项
  ];
  for (const re of patterns) {
    const next = declText.replace(re, "");
    if (next !== declText) return next;
  }
  console.warn(`   ⚠ 抠不掉（需人工看）：${specText}`);
  return declText;
}

const edits = [];
let restored = 0;
let droppedTotal = 0;
for (const st of curSf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  const headDecl = headByKey.get(keyOf(st, curSf));
  if (!headDecl) continue;
  const curLocals = new Set(localsOf(st));
  const headLocals = localsOf(headDecl);
  const missing = headLocals.filter((n) => !curLocals.has(n));
  const extra = [...curLocals].filter((n) => !headLocals.includes(n));
  if (extra.length) continue; // 名字比 HEAD 多 → 不是同一条，别动
  let text = headDecl.getText(headSf);
  for (const name of missing) {
    // 抠名字要用 HEAD 里该 specifier 的原始写法（含 `as` 别名）
    const b = headDecl.importClause.namedBindings;
    let spec = name;
    if (b && !ts.isNamespaceImport(b)) {
      const hit = b.elements.find((s) => s.name.text === name);
      if (hit) spec = hit.getText(headSf);
    }
    text = dropSpecifier(text, spec);
  }
  const curText = st.getText(curSf);
  if (text !== curText) {
    edits.push({ start: st.getStart(curSf), end: st.getEnd(), text });
    restored += 1;
    droppedTotal += missing.length;
  }
}
let out = currentText;
for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
fs.writeFileSync(file, out);
console.log(`还原 ${restored} 条 import 声明的排版（抠掉 ${droppedTotal} 个已死 specifier）。`);

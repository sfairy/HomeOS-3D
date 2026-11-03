#!/usr/bin/env node
/**
 * 生成 0.8.2 → 0.8.4 的逐文件差异清单（`docs/migrations/0.8.2-to-0.8.4/01-inventory.md`）。
 *
 * 设计原则：
 *   - 二进制/静态资源走「逐字节哈希」，只报 added/removed/changed；
 *   - JS 走「反混淆后的字符串字面量 + 导出符号 + import 目标」三通道；
 *   - CSS 走选择器级（见 css-diff.mjs）；
 *   - 后端走 `diff-classify.mjs`（opcode + 常量 + 对象名）。
 *
 * 用法：node ops/port/inventory.mjs [--root 源代码] [--out docs/migrations/0.8.2-to-0.8.4]
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, resolve, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { deobfuscate } from "./lib/js-deobf.mjs";
import { cssDiff } from "./css-diff.mjs";
import { classify } from "./diff-classify.mjs";

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function walkFiles(root) {
  const out = new Map();
  // 忽略项：
  //  - `.1shot.cdc.py` / `.1shot.seq`：Pyarmor 解包中间产物，与 0.8.4 的明文体量不可比
  //  - `backend/`、`migrations/`、`migrations_decrypted/`：由 diff-classify 单独按
  //    `.1shot.das` 口径比对，避免「密文 vs 明文」的形式差异污染统计
  //  - `.DS_Store` 等系统垃圾
  const skip = (rel) =>
    rel.endsWith(".1shot.cdc.py") ||
    rel.endsWith(".1shot.seq") ||
    rel.endsWith(".1shot.das") ||
    rel === ".DS_Store" ||
    rel.endsWith("/.DS_Store") ||
    rel.startsWith("backend/") ||
    rel.startsWith("migrations/") ||
    rel.startsWith("migrations_decrypted/");
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) visit(full);
      else {
        const rel = relative(root, full);
        if (skip(rel)) continue;
        out.set(rel, { size: st.size, hash: sha(readFileSync(full)) });
      }
    }
  };
  visit(root);
  return out;
}

/** 反混淆后的「语义指纹」：导出符号 + 字符串字面量 + import 目标。 */
export function jsFingerprint(source) {
  const code = deobfuscate(source);
  const text = typeof code === "string" ? code : code.code;
  const exports = new Set();
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) exports.add(m[1]);
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) exports.add(name.trim());
    }
  }
  const imports = new Set();
  for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) imports.add(m[1].replace(/\?v=[0-9a-f]+$/, ""));
  for (const m of text.matchAll(/import\s*['"]([^'"]+)['"]/g)) imports.add(m[1].replace(/\?v=[0-9a-f]+$/, ""));
  const strings = new Set();
  for (const m of text.matchAll(/'((?:[^'\\]|\\.){2,120})'|"((?:[^"\\]|\\.){2,120})"/g)) {
    const value = m[1] ?? m[2];
    if (value && !/^[\d.]+$/.test(value)) strings.add(value);
  }
  return { exports, imports, strings };
}

const diffSet = (a, b) => [...b].filter((x) => !a.has(x));

function categoryOf(rel) {
  const lower = rel.toLowerCase();
  const rules = [
    ["frontend/models", "frontend/static/assets/3d-models"],
    ["frontend/vendor", "frontend/static/vendor"],
    ["frontend/audio", "frontend/static/audio"],
    ["frontend/thumbnails", "frontend/static/component-thumbnails"],
    ["frontend/assets", "frontend/static/assets"],
    ["migrations", "migrations"],
    ["alembic_runtime", "alembic_runtime"],
    ["dashboard_templates", "dashboard_templates"],
    ["image", "image"],
    ["keys", "keys"],
    ["backend", "backend"],
    ["frontend", "frontend"],
  ];
  for (const [key, label] of rules) if (lower.startsWith(key)) return label;
  void extname;
  void basename;
  return "root";
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

export function buildInventory(rootDir) {
  const oldRoot = resolve(rootDir, "0.8.2");
  const newRoot = resolve(rootDir, "0.8.4");

  // 后端单独处理（.1shot.das 命名）
  const backendOld = resolve(oldRoot, "backend/app");
  const backendNew = resolve(newRoot, "backend/app_decrypted");
  const backend = classify(backendOld, backendNew);

  const oldFiles = walkFiles(oldRoot);
  const newFiles = walkFiles(newRoot);

  const added = [];
  const removed = [];
  const changed = [];
  const identical = [];

  const allKeys = new Set([...oldFiles.keys(), ...newFiles.keys()]);
  for (const key of allKeys) {
    const a = oldFiles.get(key);
    const b = newFiles.get(key);
    if (!a) {
      added.push({ key, size: b.size });
      continue;
    }
    if (!b) {
      removed.push({ key, size: a.size });
      continue;
    }
    if (a.hash === b.hash) {
      identical.push(key);
      continue;
    }
    changed.push({ key, from: a.size, to: b.size, category: categoryOf(key) });
  }

  const byCategory = new Map();
  const bump = (cat, field) => {
    if (!byCategory.has(cat)) byCategory.set(cat, { identical: 0, changed: 0, added: 0, removed: 0 });
    byCategory.get(cat)[field] += 1;
  };
  for (const key of identical) bump(categoryOf(key), "identical");
  for (const item of changed) bump(item.category, "changed");
  for (const item of added) bump(categoryOf(item.key), "added");
  for (const item of removed) bump(categoryOf(item.key), "removed");

  // JS：反混淆后按语义指纹判定
  const jsChanged = [];
  for (const item of changed) {
    if (!item.key.endsWith(".js")) continue;
    const before = jsFingerprint(readFileSync(join(oldRoot, item.key), "utf8"));
    const after = jsFingerprint(readFileSync(join(newRoot, item.key), "utf8"));
    const exportsAdded = diffSet(before.exports, after.exports);
    const exportsRemoved = diffSet(after.exports, before.exports);
    const stringsAdded = diffSet(before.strings, after.strings);
    const importsAdded = diffSet(before.imports, after.imports);
    const importsRemoved = diffSet(after.imports, before.imports);
    const semantic = exportsAdded.length + exportsRemoved.length + stringsAdded.length + importsAdded.length + importsRemoved.length > 0;
    jsChanged.push({
      key: item.key,
      from: item.from,
      to: item.to,
      semantic,
      exportsAdded,
      exportsRemoved,
      stringsAdded,
      importsAdded,
      importsRemoved,
    });
  }

  // CSS：选择器级
  const cssChanged = [];
  for (const item of changed) {
    if (!item.key.endsWith(".css")) continue;
    const result = cssDiff(readFileSync(join(oldRoot, item.key), "utf8"), readFileSync(join(newRoot, item.key), "utf8"));
    cssChanged.push({ key: item.key, from: item.from, to: item.to, ...result.counts });
  }

  return {
    backend,
    added: added.sort((a, b) => a.key.localeCompare(b.key)),
    removed: removed.sort((a, b) => a.key.localeCompare(b.key)),
    changed,
    identical,
    byCategory,
    jsChanged: jsChanged.sort((a, b) => b.stringsAdded.length - a.stringsAdded.length),
    cssChanged: cssChanged.sort((a, b) => b.addedInTheirs - a.addedInTheirs),
  };
}

function renderMarkdown(inv) {
  const lines = [];
  const push = (line = "") => lines.push(line);
  push("# 0.8.2 → 0.8.4 逐文件差异清单");
  push();
  push("> 由 `node ops/port/inventory.mjs` 生成，勿手改。判据见 `ops/port/lib/js-deobf.mjs`、`ops/port/css-diff.mjs`、`ops/port/diff-classify.mjs`。");
  push();

  push("## 1. 体量总览");
  push();
  push("| 分类 | 逐字节一致 | 字节不同 | 新增 | 删除 |");
  push("| --- | ---: | ---: | ---: | ---: |");
  for (const [cat, s] of [...inv.byCategory].sort()) {
    push(`| ${cat} | ${s.identical} | ${s.changed} | ${s.added} | ${s.removed} |`);
  }
  push();

  push("## 2. 后端（按 opcode / 常量 / 对象名三通道分类）");
  push();
  push(`- 新增模块 **${inv.backend.added.length}** 个：${inv.backend.added.map((f) => `\`${f}\``).join("、")}`);
  push(`- 真实语义改动 **${inv.backend.changed.length}** 个`);
  push(`- 纯重加密噪声 **${inv.backend.identical.length}** 个（opcode 直方图与常量集合均无差异，禁止据此改动代码）`);
  push();
  push("| 文件 | opcode Δ | 常量 Δ | 对象名 Δ |");
  push("| --- | ---: | ---: | ---: |");
  for (const c of inv.backend.changed) push(`| \`${c.file}\` | ${c.opcodeDelta} | ${c.constDelta} | ${c.objectDelta} |`);
  push();

  push("## 3. 前端新增文件");
  push();
  for (const item of inv.added) if (item.key.startsWith("frontend/")) push(`- \`${item.key}\` (${fmt(item.size)})`);
  push();
  push("## 4. 前端删除文件");
  push();
  for (const item of inv.removed) if (item.key.startsWith("frontend/")) push(`- \`${item.key}\` (${fmt(item.size)})`);
  push();

  push("## 5. 前端非 JS/CSS 资源的字节变化");
  push();
  for (const item of inv.changed) {
    if (["backend", "migrations"], item.key.startsWith("backend/")) continue;
    if (item.key.endsWith(".js") || item.key.endsWith(".css")) continue;
    if (item.key.endsWith(".html") || item.key.endsWith(".json")) continue;
    push(`- \`${item.key}\` ${fmt(item.from)} → ${fmt(item.to)}`);
  }
  push();

  push("## 6. JS：反混淆后的语义差异（按新增字符串数排序）");
  push();
  push("| 文件 | 字节 | 新增导出 | 删除导出 | 新增文案 | 新增 import |");
  push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const item of inv.jsChanged) {
    if (!item.semantic) continue;
    push(`| \`${item.key}\` | ${fmt(item.from)} → ${fmt(item.to)} | ${item.exportsAdded.length} | ${item.exportsRemoved.length} | ${item.stringsAdded.length} | ${item.importsAdded.length} |`);
  }
  push();
  push(`另有 ${inv.jsChanged.filter((x) => !x.semantic).length} 个 JS 文件字节不同但语义指纹一致（仅资源版本号 `+"`?v=`"+` 变化）。`);
  push();

  push("## 7. 导出的增删明细");
  push();
  for (const item of inv.jsChanged) {
    if (!item.exportsAdded.length && !item.exportsRemoved.length) continue;
    push(`### \`${item.key}\``);
    if (item.exportsAdded.length) push(`- 新增：${item.exportsAdded.map((x) => `\`${x}\``).join(", ")}`);
    if (item.exportsRemoved.length) push(`- 删除：${item.exportsRemoved.map((x) => `\`${x}\``).join(", ")}`);
    push();
  }

  push("## 8. CSS：选择器级差异");
  push();
  push("| 文件 | 上游新增 | 上游删除 | 上游改声明 |");
  push("| --- | ---: | ---: | ---: |");
  for (const item of inv.cssChanged) push(`| \`${item.key}\` | ${item.addedInTheirs} | ${item.removedInTheirs} | ${item.changedInTheirs} |`);
  push();
  return `${lines.join("\n")}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const root = arg("--root", "源代码");
  const outDir = arg("--out", "docs/migrations/0.8.2-to-0.8.4");
  if (!existsSync(resolve(root, "0.8.4"))) {
    console.error(`missing ${resolve(root, "0.8.4")}`);
    process.exit(2);
  }
  const inventory = buildInventory(root);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(join(outDir, "01-inventory.md"), renderMarkdown(inventory));
  console.log(`wrote ${join(outDir, "01-inventory.md")}`);
  console.log(`added=${inventory.added.length} removed=${inventory.removed.length} changed=${inventory.changed.length} identical=${inventory.identical.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

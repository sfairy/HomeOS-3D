#!/usr/bin/env node
/**
 * 覆盖率复核（严格版）：只保留「可移植字面量」，逐文件对比 0.8.2 → 0.8.4，
 * 再看本项目语料里是否存在。
 *
 * 可移植字面量 = 下面几类之一：
 *   - 样式类名      hb-xxx / i3d-xxx / is-xxx / has-xxx
 *   - 标识符        camelCase / snake_case / PascalCase（长度 ≥ 6）
 *   - 常量          FULL_CAPS（长度 ≥ 4）
 *   - 中文文案      ≥ 3 个汉字
 *   - URL / 路径    /api/... 、./xxx.js
 *   - data-* / aria-* 属性名
 *   - 模型 / 实体 id 形如 kind:xxx
 *
 * 反混淆产物里的 `"](Math["` 这类碎片会被过滤掉。
 *
 * 用法：node ops/port/coverage.mjs [--json out.json] [--rebuild]
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { deobfuscate } from "./lib/js-deobf.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const OLD = resolve(ROOT, "源代码/0.8.2/frontend");
const NEW = resolve(ROOT, "源代码/0.8.4/frontend");
const CACHE = "/tmp/cov-cache";
const CORPUS_DIRS = [
  resolve(ROOT, "homeos/frontend/src"),
  resolve(ROOT, "homeos/frontend/public/static"),
  resolve(ROOT, "homeos/backend/src"),
];

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---------------- 语料索引 ---------------- */

const corpusFiles = CORPUS_DIRS.flatMap((dir) => {
  try {
    return walk(dir);
  } catch {
    return [];
  }
}).filter((f) => /\.(ts|js|vue|css|html|py|json)$/.test(f));
const corpusText = corpusFiles.map((f) => readFileSync(f, "utf8")).join("\n");
console.log(`corpus: ${corpusFiles.length} files, ${(corpusText.length / 1024 / 1024).toFixed(1)}MB`);

/* ---------------- 指纹（带缓存） ---------------- */

function cachedFingerprint(path) {
  const digest = createHash("sha1").update(path + statSync(path).mtimeMs).digest("hex");
  const file = join(CACHE, `${digest}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const raw = deobfuscate(readFileSync(path, "utf8"));
  const text = typeof raw === "string" ? raw : raw.code;
  const strings = new Set();
  for (const m of text.matchAll(/'((?:[^'\\]|\\.){2,200})'|"((?:[^"\\]|\\.){2,200})"/g)) {
    const value = m[1] ?? m[2];
    if (value) strings.add(value);
  }
  const exports = new Set();
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) exports.add(m[1]);
  const imports = new Set();
  for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) imports.add(m[1].replace(/\?v=[0-9a-f]+$/, ""));
  const out = { strings: [...strings], exports: [...exports], imports: [...imports] };
  writeFileSync(file, JSON.stringify(out));
  return out;
}

/* ---------------- 可移植字面量判定 ---------------- */

const CJK = /[\u4e00-\u9fff]/;
const portable = (s) => {
  if (!s || s.length < 3) return false;
  if (s.includes("\\") || s.includes("](") || s.includes("=[")) return false;
  if (/^[\d.%-]+$/.test(s)) return false;
  if (/^(hb|i3d|is|has|i3d2)-[\w-]+$/.test(s)) return true;          // 样式类
  if (/^(data|aria)-[\w-]+$/.test(s)) return true;                    // 属性名
  if (/^[a-z][a-zA-Z0-9]*(?:[A-Z][\w]*)+$/.test(s) && s.length >= 6) return true; // camelCase
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s) && s.length >= 6) return true;    // snake_case
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(s)) return true;         // FULL_CAPS
  if (CJK.test(s) && (s.match(/[\u4e00-\u9fff]/g) ?? []).length >= 3) return true;
  if (/^(https?:)?\/[\w./-]+$/.test(s)) return true;
  if (/^\/[a-z][\w/{}.:-]+$/.test(s)) return true;
  if (/^\.{1,2}\/[\w./-]+$/.test(s)) return true;
  if (/^[a-z][a-z0-9_]*:[^:\s]+$/.test(s)) return true;               // kind:name
  return false;
};

/* ---------------- 主流程 ---------------- */

const oldFiles = new Map(walk(OLD).map((f) => [relative(OLD, f), f]));
const newFiles = new Map(walk(NEW).map((f) => [relative(NEW, f), f]));

const added = [];
const changed = [];

for (const [rel, full] of newFiles) {
  if (!rel.endsWith(".js")) continue;
  if (rel.includes("/vendor/")) continue;
  const before = oldFiles.get(rel);
  const b = cachedFingerprint(full);
  if (!before) {
    const strings = b.strings.filter(portable);
    added.push({
      rel,
      strings,
      exports: b.exports,
      missing: strings.filter((s) => !corpusText.includes(s)),
      missingExports: b.exports.filter((e) => !new RegExp(`\\b${e}\\b`).test(corpusText)),
    });
    continue;
  }
  const a = cachedFingerprint(before);
  const aSet = new Set(a.strings);
  const bSet = new Set(b.strings);
  const strings = b.strings.filter((s) => portable(s) && !aSet.has(s));
  const exportsRemoved = a.exports.filter((e) => !b.exports.includes(e));
  const exportsAdded = b.exports.filter((e) => !a.exports.includes(e));
  const importsAdded = b.imports.filter((i) => !a.imports.includes(i));
  if (!strings.length && !exportsAdded.length && !importsAdded.length) continue;
  void bSet;
  changed.push({
    rel,
    strings,
    exports: exportsAdded,
    imports: importsAdded,
    exportsRemoved,
    missing: strings.filter((s) => !corpusText.includes(s)),
  });
}

const byMissing = (x, y) => y.missing.length - x.missing.length;
added.sort(byMissing);
changed.sort(byMissing);

const totals = {
  addedFiles: added.length,
  changedFiles: changed.length,
  addedPortable: added.reduce((n, f) => n + f.strings.length, 0),
  addedMissing: added.reduce((n, f) => n + f.missing.length, 0),
  changedPortable: changed.reduce((n, f) => n + f.strings.length, 0),
  changedMissing: changed.reduce((n, f) => n + f.missing.length, 0),
};
console.log(JSON.stringify(totals, null, 2));

const report = { totals, added, changed };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));

const show = (list, label, limit) => {
  const withGap = list.filter((f) => f.missing.length || (f.missingExports ?? []).length);
  console.log(`\n## ${label}：${withGap.length} 个文件有缺口`);
  for (const f of withGap.slice(0, limit)) {
    const exp = (f.missingExports ?? []).length ? ` exports=${f.missingExports.join(",")}` : "";
    console.log(`\n### ${f.rel}  missing ${f.missing.length}/${f.strings.length}${exp}`);
    console.log(f.missing.slice(0, 10).map((s) => `  - ${JSON.stringify(s)}`).join("\n"));
  }
};
show(added, "新增文件缺口", 40);
show(changed, "改动文件缺口", 40);

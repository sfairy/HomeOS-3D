#!/usr/bin/env node
/**
 * 选择器级 CSS 三方对比。
 *
 * 上游 0.8.4 的 renderer.css（279KB）/ app.css（124KB）/ studio.css 与本项目
 * 的同名文件不是「同一份文件的两个版本」——本项目在其上做了二次开发
 * （renderer.css 329KB vs 上游 271KB，studio.css 106KB vs 62KB）。
 * 直接整文件覆盖会丢二次开发，所以移植时以**选择器**为单位三方合并：
 *
 *   base   = 0.8.2 上游
 *   theirs = 0.8.4 上游
 *   ours   = 本项目当前文件
 *
 * 判定：
 *   - 选择器在 theirs 里新增            → 需要补进 ours
 *   - 选择器在 theirs 里被删            → 提示人工确认（可能本项目仍需要）
 *   - 选择器两侧都有但声明不同          → 冲突，输出双方声明供人工裁决
 *   - ours 独有                         → 保留（二次开发）
 *
 * 用法：
 *   node ops/port/css-diff.mjs --base a.css --theirs b.css [--ours c.css] [--json out.json] [--quiet]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 把 CSS 拆成 [选择器, 声明原文] 的有序表（保留 @media 前缀作为作用域）。 */
export function parseRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = new Map();
  let i = 0;
  const readBlock = (start) => {
    let depth = 0;
    for (let j = start; j < text.length; j += 1) {
      if (text[j] === "{") depth += 1;
      else if (text[j] === "}") {
        depth -= 1;
        if (depth === 0) return j;
      }
    }
    return text.length - 1;
  };
  while (i < text.length) {
    const brace = text.indexOf("{", i);
    if (brace < 0) break;
    let prelude = text.slice(i, brace).trim();
    // `@import "..";.foo` 这类「语句 + 选择器」连写：把语句部分单独入表
    const lastSemicolon = prelude.lastIndexOf(";");
    if (lastSemicolon >= 0) {
      for (const statement of prelude.slice(0, lastSemicolon).split(";")) {
        const trimmed = statement.trim();
        if (trimmed) rules.set(trimmed, "");
      }
      prelude = prelude.slice(lastSemicolon + 1).trim();
    }
    const close = readBlock(brace);
    const body = normalizeDeclarations(text.slice(brace + 1, close));
    if (prelude.startsWith("@")) {
      if (/@(media|supports|layer|container)\b/.test(prelude)) {
        const inner = parseRules(text.slice(brace + 1, close));
        for (const [sel, decl] of inner) rules.set(`${prelude} :: ${sel}`, decl);
      } else {
        rules.set(prelude, body);
      }
    } else if (prelude) {
      for (const sel of prelude.split(",")) {
        const key = sel.trim().replace(/\s+/g, " ");
        if (key) rules.set(key, body);
      }
    }
    i = close + 1;
  }
  return rules;
}

/** 声明归一：去注释、去多余空白、去掉末尾分号，避免「只有格式化差异」被判成冲突。 */
function normalizeDeclarations(body) {
  return body
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*;\s*/g, ";")
    .replace(/;\s*$/, "")
    .trim();
}

export function cssDiff(baseSrc, theirsSrc, oursSrc) {
  const base = parseRules(baseSrc);
  const theirs = parseRules(theirsSrc);
  const ours = oursSrc === undefined ? new Map() : parseRules(oursSrc);

  const addedInTheirs = [...theirs.keys()].filter((k) => !base.has(k));
  const removedInTheirs = [...base.keys()].filter((k) => !theirs.has(k));
  const changedInTheirs = [...theirs.keys()].filter((k) => base.has(k) && base.get(k) !== theirs.get(k));

  const missingFromOurs = oursSrc === undefined ? [] : addedInTheirs.filter((k) => !ours.has(k));
  const conflicting = oursSrc === undefined ? [] : changedInTheirs.filter((k) => ours.has(k) && ours.get(k) !== theirs.get(k) && ours.get(k) !== base.get(k));
  const oursOnly = oursSrc === undefined ? [] : [...ours.keys()].filter((k) => !theirs.has(k));

  return {
    counts: {
      base: base.size,
      theirs: theirs.size,
      ours: ours.size,
      addedInTheirs: addedInTheirs.length,
      removedInTheirs: removedInTheirs.length,
      changedInTheirs: changedInTheirs.length,
      missingFromOurs: missingFromOurs.length,
      conflicting: conflicting.length,
      oursOnly: oursOnly.length,
    },
    addedInTheirs,
    removedInTheirs,
    changedInTheirs,
    missingFromOurs,
    conflicting,
    oursOnly,
    details: Object.fromEntries(
      [...addedInTheirs, ...changedInTheirs].map((k) => [k, { base: base.get(k) ?? null, theirs: theirs.get(k), ours: ours.get(k) ?? null }]),
    ),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const basePath = arg("--base");
  const theirsPath = arg("--theirs");
  const oursPath = arg("--ours");
  if (!basePath || !theirsPath) {
    console.error("usage: node ops/port/css-diff.mjs --base <0.8.2.css> --theirs <0.8.4.css> [--ours <project.css>] [--json out.json]");
    process.exit(2);
  }
  const result = cssDiff(readFileSync(basePath, "utf8"), readFileSync(theirsPath, "utf8"), oursPath ? readFileSync(oursPath, "utf8") : undefined);
  const jsonPath = arg("--json");
  if (jsonPath) {
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
    writeFileSync(resolve(jsonPath), `${JSON.stringify(result, null, 2)}\n`);
  }
  if (argv.includes("--quiet")) {
    console.log(JSON.stringify(result.counts));
    return;
  }
  for (const key of result.missingFromOurs) console.log(`  MISSING  ${key}`);
  for (const key of result.conflicting) console.log(`  CONFLICT ${key}`);
  for (const key of result.removedInTheirs) console.log(`  UPSTREAM-REMOVED ${key}`);
  console.log(JSON.stringify(result.counts));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

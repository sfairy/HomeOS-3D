#!/usr/bin/env node
/**
 * 符号级差异：上游 0.8.1 的**导出名 / 契约串 / 常量值**在本项目里有没有对应物。
 *
 * 前几轮的对比停在「文件在不在」这一层，于是出现两类漏判：
 *   1. 上游 0.8.1 在**已有文件**里新增了导出（`haControlTimeout`、`createScaledPopupMenu`
 *      这类），文件对齐了但导出没移植 —— 文件级比对看不出来；
 *   2. 常量值被悄悄改过（上传上限、超时预算），结构完全一样，行为不同。
 *
 * 本脚本把这三类抽出来，对着 `project-map.json` 的落点做「全仓符号检索」：
 * 不看位置、只看有没有 —— 位置由 project-map 负责，本项目允许拆文件与改名。
 * 命中的判定：原样名 / 大驼峰 / 短横线 三种写法任一出现即算命中。
 *
 * 用法：node ops/port/symbol-diff.mjs [--version 0.8.1] [--prev 0.8.0]
 * 产物：docs/port/<version>/symbol-gap.json
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const VERSION = arg("--version", "0.8.1");
const PREV_VERSION = arg("--prev", "0.8.0");

const CACHE = join(ROOT, ".port-cache");
const FRONTEND_ROOT = join(ROOT, "homeos/frontend");

/** 上游导出声明（`export function x` / `export const X =` / `export class X`）。 */
const EXPORT_DECL = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
/** 上游导出清单（`export { a as b, c }`）；默认导出 `default as x` 取 x。 */
const EXPORT_LIST = /\bexport\s*\{([^}]*)\}/g;
/** 契约串：本项目与上游约定的请求头 / 事件名。 */
const CONTRACT_TOKEN = /\bx-hb-[a-z0-9-]+/g;
/** 全大写常量 + 数字字面量：用于发现「名字在、值被改了」。 */
const NUMERIC_CONST = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{3,})\s*=\s*(-?\d+(?:\.\d+)?(?:e\+?\d+)?)\b/g;

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, base, out);
    } else {
      out.push(relative(base, full));
    }
  }
  return out;
}

/** `LIGHT_STATISTICS_ENTITY_LIMIT` → `lightStatisticsEntityLimit`。 */
export function camelCase(name) {
  return name
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

/** `createScaledPopupMenu` → `create-scaled-popup-menu`。 */
export function kebabCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

/** 三种可接受的写法：原样、大驼峰、短横线。名字本身很短的（≤3 字符）只用原样，避免误命中。 */
export function symbolVariants(name) {
  if (name.length <= 3) return [name];
  return [...new Set([name, camelCase(name), kebabCase(name)])];
}

/**
 * 从一个上游（已反混淆）文件里抽符号。
 *
 * 只认**模块顶层导出**：混淆产物里 `export` 只会出现在顶层，类方法 / 对象属性不会带
 * `export` 前缀，所以按正则抓不会误抓方法名。
 */
export function extractUpstreamSymbols(source) {
  const exports = new Set();
  for (const match of source.matchAll(EXPORT_DECL)) exports.add(match[1]);
  for (const match of source.matchAll(EXPORT_LIST)) {
    for (const entry of match[1].split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      // `a as b` 的对外名字是 b；`a` 与 `default as a` 取最后一段。
      const parts = trimmed.split(/\s+as\s+/);
      const publicName = (parts[1] ?? parts[0]).replace(/^default$/, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(publicName)) exports.add(publicName);
    }
  }
  const contracts = new Set();
  for (const match of source.matchAll(CONTRACT_TOKEN)) contracts.add(match[0]);
  const numericConsts = new Map();
  for (const match of source.matchAll(NUMERIC_CONST)) numericConsts.set(match[1], Number(match[2]));
  return { exports: [...exports].sort(), contracts: [...contracts].sort(), numericConsts };
}

/** 0.8.0 → 0.8.1 新增了哪些导出 / 契约串（用于给缺口标「本轮新增」）。 */
export function diffSymbols(before, after) {
  const beforeExports = new Set(before.exports);
  const beforeContracts = new Set(before.contracts);
  return {
    newExports: after.exports.filter((name) => !beforeExports.has(name)),
    newContracts: after.contracts.filter((token) => !beforeContracts.has(token)),
  };
}

function readIfExists(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** 全仓语料：符号检索只看「有没有」，所以拼成两段文本即可。 */
function buildCorpus() {
  const sourceRoot = join(FRONTEND_ROOT, "src");
  const code = [];
  const assets = [];
  for (const rel of walk(sourceRoot)) {
    if (!/\.(ts|tsx|vue)$/.test(rel)) continue;
    code.push(readFileSync(join(sourceRoot, rel), "utf8"));
  }
  const staticRoot = join(FRONTEND_ROOT, "public/static");
  for (const rel of walk(staticRoot)) {
    if (!/\.(css|json|html)$/.test(rel)) continue;
    assets.push(readFileSync(join(staticRoot, rel), "utf8"));
  }
  return { code: code.join("\n"), assets: assets.join("\n") };
}

function containsSymbol(corpus, name) {
  return symbolVariants(name).some(
    (variant) => corpus.code.includes(variant) || corpus.assets.includes(variant),
  );
}

function main() {
  const projectMapPath = join(ROOT, `docs/port/${VERSION}/project-map.json`);
  const projectMap = JSON.parse(readFileSync(projectMapPath, "utf8"));
  const corpus = buildCorpus();

  const exportsMissing = [];
  const contractsMissing = [];
  const valueDrift = [];
  let exportsChecked = 0;
  let contractsChecked = 0;
  let filesScanned = 0;
  const skipped = [];

  for (const row of projectMap.rows) {
    if (!row.project.length) continue;
    const upstreamPath = join(CACHE, VERSION, "frontend", row.upstream);
    const source = readIfExists(upstreamPath);
    if (source === null) {
      skipped.push(row.upstream);
      continue;
    }
    filesScanned += 1;
    const current = extractUpstreamSymbols(source);
    const previousSource = readIfExists(join(CACHE, PREV_VERSION, "frontend", row.upstream));
    const previous = previousSource === null ? { exports: [], contracts: [] } : extractUpstreamSymbols(previousSource);
    const { newExports, newContracts } = diffSymbols(previous, current);

    for (const name of current.exports) {
      exportsChecked += 1;
      if (containsSymbol(corpus, name)) continue;
      exportsMissing.push({
        upstream: row.upstream,
        project: row.project,
        name,
        newInRelease: newExports.includes(name),
      });
    }
    for (const token of current.contracts) {
      contractsChecked += 1;
      if (corpus.code.includes(token) || corpus.assets.includes(token)) continue;
      contractsMissing.push({ upstream: row.upstream, project: row.project, token, newInRelease: newContracts.includes(token) });
    }
    for (const [name, value] of current.numericConsts) {
      const previousValue = previous.numericConsts?.get(name);
      // 只看「本轮改过值」或「值在项目里查不到同名常量」的项，否则噪声太大。
      const projectMatch = new RegExp(`\\b${name}\\b\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`).exec(corpus.code);
      if (projectMatch && Number(projectMatch[1]) !== value) {
        valueDrift.push({
          upstream: row.upstream,
          project: row.project,
          name,
          upstreamValue: value,
          projectValue: Number(projectMatch[1]),
          changedInRelease: previousValue !== undefined && previousValue !== value,
        });
      }
    }
  }


  const out = join(ROOT, `docs/port/${VERSION}/symbol-gap.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        meta: {
          generatedAt: new Date().toISOString(),
          from: PREV_VERSION,
          to: VERSION,
          note: "由 ops/port/symbol-diff.mjs 生成；命中判定为「原样名 / 大驼峰 / 短横线」任一出现。",
        },
        summary: {
          filesScanned,
          skipped: skipped.length,
          exportsChecked,
          exportsMissing: exportsMissing.length,
          newInReleaseMissing: exportsMissing.filter((item) => item.newInRelease).length,
          contractsChecked,
          contractsMissing: contractsMissing.length,
          valueDrift: valueDrift.length,
        },
        exportsMissing,
        contractsMissing,
        valueDrift,
        skipped,
      },
      null,
      2,
    ),
  );

  console.log(`[symbol] 扫描 ${filesScanned} 个上游文件（跳过 ${skipped.length} 个无反混淆副本）`);
  console.log(
    `[symbol] 导出 ${exportsChecked} 个，本地无对应 ${exportsMissing.length}（其中本轮新增 ${exportsMissing.filter((i) => i.newInRelease).length}）`,
  );
  console.log(`[symbol] 契约串 ${contractsChecked} 个，本地无对应 ${contractsMissing.length}`);
  console.log(`[symbol] 常量值漂移 ${valueDrift.length}`);
  for (const item of exportsMissing.slice(0, 40)) {
    console.log(`  ${item.newInRelease ? "NEW " : "    "}${item.upstream}  →  ${item.name}`);
  }
  console.log(`[symbol] → ${relative(ROOT, out)}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

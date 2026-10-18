#!/usr/bin/env node
/**
 * 前端首屏 / 运行时体积预算。
 *
 * 为什么需要它：HomeOS 的首屏成本主要不是业务代码，而是「引导脚本 + 模块预载 +
 * 全部 pane 样式 + 3D 运行时 chunk」。这些数字在每次构建里都会漂移，靠肉眼 review
 * 看不出来；本脚本把 Phase 0 基线固化成可执行的预算，超出即失败。
 *
 * 运行：bun ops/checks/check_bundle_budget.mjs
 * 前置：bun run --cwd homeos/frontend build（或 bash ops/ci/build_frontend_verify.sh）
 *
 * 口径：
 * - preload：index.html 里 <link rel="modulepreload"> 指向的本地文件，raw + gzip；
 * - entry：index.html 的第一个 <script type="module" src> 指向的 JS；
 * - styles：index.html 里所有 <link rel="stylesheet"> 指向的本地 CSS；
 * - runtime：dist/homeos/frontend/modules/runtime 下所有 .js 的 ESM chunk；
 * - hls：index.html 是否还有同步 <script src=...hls...>（Phase 1 已改为按需加载，应为 0）。
 *
 * 阈值放在 ops/checks/bundle-budget.json，调整阈值必须在 PR 说明里写清原因。
 */
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const DIST = join(ROOT, "dist/homeos/frontend");
const BUDGET_PATH = join(HERE, "bundle-budget.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readBudget() {
  try {
    return JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
  } catch (error) {
    fail(`读取预算文件失败：${BUDGET_PATH}\n${error.message}`);
  }
}

function walk(dir, predicate, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function gzipBytes(file) {
  return gzipSync(readFileSync(file), { level: 6 }).length;
}

function localPathForUrl(url) {
  const clean = decodeURIComponent(url.split("?")[0].split("#")[0]);
  if (clean.startsWith("/static/")) return join(DIST, clean);
  if (clean.startsWith("/modules/")) return join(DIST, clean);
  if (clean.startsWith("/")) return join(DIST, clean.slice(1));
  return "";
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

function statFile(file) {
  try {
    return { bytes: statSync(file).size, gzip: gzipBytes(file) };
  } catch {
    fail(`预算引用的构建产物不存在：${file}`);
  }
}

if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
  fail(`缺少构建产物：${DIST}\n先运行：bun run --cwd homeos/frontend build`);
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const preloadTsgs = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>/gi)].map((m) => m[0]);
const preloadFiles = [...new Set(preloadTsgs.map((tag) => localPathForUrl(attr(tag, "href"))).filter(Boolean))];
const preload = preloadFiles.reduce(
  (acc, file) => {
    const one = statFile(file);
    acc.bytes += one.bytes;
    acc.gzip += one.gzip;
    return acc;
  },
  { bytes: 0, gzip: 0 }
);

const moduleScripts = [...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/gi)].map((m) => m[0]);
const entryUrl = moduleScripts.length ? attr(moduleScripts[0], "src") : "";
const entryFile = entryUrl ? localPathForUrl(entryUrl) : "";
const entry = entryFile ? statFile(entryFile) : { bytes: 0, gzip: 0 };

const styleTsgs = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => m[0]);
const styleFiles = [...new Set(styleTsgs.map((tag) => localPathForUrl(attr(tag, "href"))).filter(Boolean))];
const styles = styleFiles.reduce(
  (acc, file) => {
    const one = statFile(file);
    acc.bytes += one.bytes;
    acc.gzip += one.gzip;
    return acc;
  },
  { bytes: 0, gzip: 0 }
);

const runtimeRoot = join(DIST, "modules/runtime");
const runtimeFiles = statSync(runtimeRoot, { throwIfNoEntry: false })?.isDirectory()
  ? walk(runtimeRoot, (file) => file.endsWith(".js"))
  : [];
const runtime = runtimeFiles.reduce(
  (acc, file) => {
    const one = statFile(file);
    acc.bytes += one.bytes;
    acc.gzip += one.gzip;
    return acc;
  },
  { bytes: 0, gzip: 0 }
);

const hlsScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']*hls[^"']*)["'][^>]*>/gi)].map((m) => m[1]);
const metrics = {
  indexHtmlBytes: statSync(join(DIST, "index.html")).size,
  preloadRawBytes: preload.bytes,
  preloadGzipBytes: preload.gzip,
  entryJsBytes: entry.bytes,
  appCssRawBytes: styles.bytes,
  appCssGzipBytes: styles.gzip,
  runtimeChunkCount: runtimeFiles.length,
  runtimeRawBytes: runtime.bytes,
  runtimeGzipBytes: runtime.gzip,
  hlsScriptCount: hlsScripts.length,
};

const budget = readBudget();
const rows = [
  ["index.html (raw)", metrics.indexHtmlBytes, budget.indexHtmlBytes],
  ["首屏 modulepreload (raw)", metrics.preloadRawBytes, budget.preloadRawBytes],
  ["首屏 modulepreload (gzip)", metrics.preloadGzipBytes, budget.preloadGzipBytes],
  ["入口 chunk (raw)", metrics.entryJsBytes, budget.entryJsBytes],
  ["首屏 CSS (raw)", metrics.appCssRawBytes, budget.appCssRawBytes],
  ["首屏 CSS (gzip)", metrics.appCssGzipBytes, budget.appCssGzipBytes],
  ["runtime chunk 数", metrics.runtimeChunkCount, budget.runtimeChunkCount],
  ["runtime 总字节 (raw)", metrics.runtimeRawBytes, budget.runtimeRawBytes],
  ["index 内 HLS 同步脚本数", metrics.hlsScriptCount, budget.hlsScriptCount],
];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), metrics, budget }, null, 2));
  process.exit(0);
}

let failed = false;
console.log("HomeOS 前端体积预算");
console.log("-------------------");
for (const [label, actual, limit] of rows) {
  const ok = actual <= limit;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual.toLocaleString("en-US")} / 预算 ${Number(limit).toLocaleString("en-US")}`
  );
}
console.log("-------------------");
if (failed) {
  console.error("体积预算失败。若这是有意的结构变化，请更新 ops/checks/bundle-budget.json 并在提交说明里解释原因。");
  process.exit(1);
}
console.log("体积预算通过。");

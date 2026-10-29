#!/usr/bin/env node
/**
 * 把上游发行树（`源代码/<ver>/`）整体还原成可读副本，落到 `.port-cache/<ver>/`。
 *
 * 为什么先落盘而不是边比边还原：差异清单要跨版本对照（0.8.0 vs 0.8.1），而混淆后的
 * 文本连「改没改」都看不出来；先各自还原成一份稳定产物，后面的清单、遗漏复查、报告
 * 全部基于这两份副本，口径只定义一次。
 *
 * 用法：
 *   node ops/port/deobf.mjs --version 0.8.1            # 前端 JS + 后端 Python
 *   node ops/port/deobf.mjs --version 0.8.1 --only 3d-studio
 *   node ops/port/deobf.mjs --version 0.8.0 --version 0.8.1   # 两版一起跑
 *
 * 产物目录结构镜像上游：`.port-cache/<ver>/frontend/...`、`.port-cache/<ver>/backend/...`。
 * 非 JS/Python 文件（CSS/HTML/JSON/GLB）原样复制，保证副本可直接对照上游目录树。
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { deobfuscate, looksObfuscated } from "./lib/js-deobf.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SOURCE = join(ROOT, "源代码");
const CACHE = join(ROOT, ".port-cache");

/** 递归列出目录下所有文件（相对路径）。 */
function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__pycache__") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

function parseArgs(argv) {
  const versions = [];
  let only = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--version") versions.push(argv[++i]);
    else if (argv[i] === "--only") only = argv[++i];
  }
  // 默认比对「上一次移植的基线」与「本次目标版本」。
  return { versions: versions.length ? versions : ["0.8.1", "0.8.2"], only };
}

/**
 * 副本只留「可比对的文本」。GLB/PNG 这类二进制几十 MB，比对时直接读 `源代码/` 原件
 * 更省事，复制过来只会让缓存膨胀到 200MB+，还会拖慢每一轮 inventory。
 */
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".css", ".html", ".htm", ".json", ".json5", ".txt", ".md",
  ".xml", ".yml", ".yaml", ".webmanifest", ".map", ".svg", ".csv", ".gz", ".ini", ".toml",
]);

function isText(rel) {
  const dot = rel.lastIndexOf(".");
  return dot >= 0 && TEXT_EXT.has(rel.slice(dot).toLowerCase());
}

/** 前端：JS 走反混淆，其余文本原样复制，二进制直接跳过。 */
function deobfFrontend(version, only) {
  const from = join(SOURCE, version, "frontend");
  const to = join(CACHE, version, "frontend");
  const files = walk(from).filter((rel) => (!only || rel.includes(only)) && isText(rel));
  let rewritten = 0;
  let copied = 0;
  for (const rel of files) {
    const source = join(from, rel);
    const target = join(to, rel);
    mkdirSync(dirname(target), { recursive: true });
    if (!rel.endsWith(".js")) {
      cpSync(source, target);
      copied += 1;
      continue;
    }
    const src = readFileSync(source, "utf8");
    if (!looksObfuscated(src)) {
      cpSync(source, target);
      copied += 1;
      continue;
    }
    const { code } = deobfuscate(src);
    writeFileSync(target, code);
    rewritten += 1;
  }
  return { rewritten, copied, total: files.length };
}

/** 后端：交给 py-deobf.py（Pyarmor 三件套的逻辑在那边）。 */
function deobfBackend(version, only) {
  const script = join(HERE, "lib/py-deobf.py");
  const args = [script, "--version", version];
  if (only) args.push("--only", only);
  const run = spawnSync("python3", args, { cwd: ROOT, encoding: "utf8", stdio: "inherit" });
  if (run.status !== 0) throw new Error(`py-deobf.py 退出码 ${run.status}`);
}

/** 其余顶层目录（HTML/清单等）原样复制文本文件，副本要能整体对照。 */
function copyRest(version, only) {
  const from = join(SOURCE, version);
  const to = join(CACHE, version);
  let copied = 0;
  for (const rel of walk(from)) {
    if (rel.startsWith("frontend/") || rel.startsWith("backend/")) continue;
    if (only && !rel.includes(only)) continue;
    if (!isText(rel)) continue;
    const target = join(to, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(from, rel), target);
    copied += 1;
  }
  return copied;
}

const { versions, only } = parseArgs(process.argv.slice(2));
for (const version of versions) {
  const started = Date.now();
  const fe = deobfFrontend(version, only);
  const copied = copyRest(version, only);
  console.log(`[deobf] ${version} 前端：还原 ${fe.rewritten} / 原样 ${fe.copied}（共 ${fe.total}）`);
  console.log(`[deobf] ${version} 顶层：原样 ${copied} 个目录`);
  deobfBackend(version, only);
  console.log(`[deobf] ${version} 完成，用时 ${Date.now() - started}ms → ${relative(ROOT, join(CACHE, version))}`);
}

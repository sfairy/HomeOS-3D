#!/usr/bin/env bun
/**
 * 入户场景静态资源真源在 ``packages/shared/scene/static/``（CSS + fonts）。
 * 两个前端的 ``public/`` 只是部署路径不同的**生成物**，不入库 —— 本脚本把真源同步过去，
 * 避免再各改一份、也避免「真源里删掉的文件还留在副本里继续出货」。
 *
 * 用法：
 *   bun run --cwd packages/shared sync:scene        # 写盘（build / dev 前置）
 *   bun run --cwd packages/shared check:scene       # 只比对，不写盘，不一致就非 0 退出
 *   node packages/shared/scripts/sync-scene-static.mjs --tracked-only
 *                                                  # 只查「生成物被 git 跟踪」（pre-commit 用）
 *
 * 目标是**镜像**真源，不是「往真源里加文件」：
 * - 真源有的文件 → 拷过去（内容一致时跳过写入，避免制造无意义的 mtime 抖动）
 * - 目标里多出来的文件/目录 → 删掉
 *
 * 为什么要删：只拷不删时，真源里删掉一个文件后两个副本会永久滞留 —— 浏览器照样按 URL
 * 命中，于是「真源里已经没有了的东西」继续出货；而副本现在连 git 都不跟踪，谁也发现不了。
 *
 * 目标：
 * - homeos/frontend/public/static/auth/scene/
 * - homeos-store/frontend/public/static/scene/
 *
 * 例外（真源里没有、但必须留在副本里的文件）：见 KEEP_IN_TARGET。
 *
 * 副本**不进 git**（见 .gitignore）。所以这里还有一条反向断言：目标目录里只要还有被
 * git 跟踪的文件（`scene-depth.js` 除外），就说明有人把生成物提交回来了 —— 直接失败。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(sharedRoot, "../..");
const sourceDir = path.join(sharedRoot, "scene/static");

const checkOnly = process.argv.includes("--check");
/**
 * 只跑「生成物不该被 git 跟踪」这一条断言。
 *
 * 给 pre-commit 用（见 `.githooks/pre-commit`）：干净检出上副本**本来就不存在**，全量
 * 比对会把「还没跑过 sync」误判成错误，把与场景无关的提交也拦下；而「副本被 `git add`
 * 进来」这件事在任何状态下都该拦。
 */
const trackedOnly = process.argv.includes("--tracked-only");

const targets = [
  path.join(monorepoRoot, "homeos/frontend/public/static/auth/scene"),
  path.join(monorepoRoot, "homeos-store/frontend/public/static/scene"),
];

/**
 * 目标副本里**不受真源管理、必须原样保留**的文件名（按 basename 匹配，任意层级）。
 *
 * ``scene-depth.js`` 是主应用保留的兜底手抄件：它是 ``index.html`` 里的**阻塞脚本**，
 * public/ 下不经打包、不能 import，只能各存一份。它由 ``homeos/frontend`` 提交进仓库，
 * 因此是这条「生成物不入库」规则唯一的例外。
 */
const KEEP_IN_TARGET = new Set(["scene-depth.js"]);

function isKept(relPath) {
  return KEEP_IN_TARGET.has(path.basename(relPath));
}

/** 递归列出 root 下所有文件的相对路径（正斜杠），按字典序。 */
function collectFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/** 删掉 root 下已经空了的子目录（只往下走，不动 root 本身）。 */
function pruneEmptyDirs(root) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      walk(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    }
  };
  if (fs.existsSync(root)) walk(root);
}

/**
 * 目标目录里被 git 跟踪的文件（相对仓库根）。
 *
 * 非 git 检出（源码分发包解压出来没有 .git）时不拦：那时根本没有「入库」这回事。
 */
function trackedFiles(dir) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", path.relative(monorepoRoot, dir)], {
      cwd: monorepoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`缺少场景静态真源：${sourceDir}`);
  process.exit(1);
}

const wanted = collectFiles(sourceDir).filter((rel) => !isKept(rel));
const wantedSet = new Set(wanted);
let failed = false;

for (const target of targets) {
  const label = path.relative(monorepoRoot, target);

  if (!trackedOnly) {
    const existing = collectFiles(target);
    const missing = wanted.filter((rel) => !existing.includes(rel));
    const differs = wanted.filter(
      (rel) =>
        existing.includes(rel) &&
        !fs.readFileSync(path.join(sourceDir, rel)).equals(fs.readFileSync(path.join(target, rel))),
    );
    const extra = existing.filter((rel) => !wantedSet.has(rel) && !isKept(rel));

    if (checkOnly) {
      if (missing.length || differs.length || extra.length) {
        failed = true;
        console.error(`✗ ${label} 与真源不一致（跑 bun run --cwd packages/shared sync:scene）`);
        for (const rel of missing) console.error(`    缺失  ${rel}`);
        for (const rel of differs) console.error(`    内容不同  ${rel}`);
        for (const rel of extra) console.error(`    多余  ${rel}`);
      }
    } else {
      fs.mkdirSync(target, { recursive: true });
      let written = 0;
      for (const rel of wanted) {
        const src = path.join(sourceDir, rel);
        const dest = path.join(target, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const next = fs.readFileSync(src);
        // 内容一致就不写：sync 在每次 `build:shared` 里跑，无脑 copy 会让全仓 mtime 抖动、
        // 也会让「有没有真的变」这件事看不出来。
        if (fs.existsSync(dest) && fs.readFileSync(dest).equals(next)) continue;
        fs.writeFileSync(dest, next);
        written += 1;
      }
      for (const rel of extra) fs.rmSync(path.join(target, rel), { force: true });
      pruneEmptyDirs(target);
      const detail = [
        written > 0 ? `写入 ${written}` : null,
        extra.length > 0 ? `删除 ${extra.length}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
      console.log(`synced scene static → ${label}${detail ? `（${detail}）` : "（无变化）"}`);
    }
  }

  // 生成物必须留在 git 之外：被跟踪的副本会随每次 sync 变成「未提交的修改」，
  // 也可能在真源删文件后继续以旧内容留在历史里。
  const offenders = trackedFiles(target).filter((p) => !KEEP_IN_TARGET.has(path.basename(p)));
  if (offenders.length > 0) {
    failed = true;
    console.error(
      `✗ ${label} 里有 ${offenders.length} 个文件被 git 跟踪 —— 这棵树是生成物，不该入库：\n` +
        offenders.map((p) => `    ${p}`).join("\n") +
        "\n  修法：git rm -r --cached <上面的路径>（保留 scene-depth.js），并确认 .gitignore 已忽略本目录。",
    );
  }
}

if (failed) process.exit(1);

#!/usr/bin/env bun
/**
 * 入户场景静态资源真源在 ``packages/shared/scene/static/``（CSS + fonts）。
 * 两个前端的 ``public/`` 只是部署路径不同的副本 —— 本脚本把真源同步过去，避免再各改一份。
 *
 * 目标是**镜像**真源，不是「往真源里加文件」：
 * - 真源有的文件 → 拷过去（内容一致时跳过写入，避免制造无意义的 mtime 抖动）
 * - 目标里多出来的文件/目录 → 删掉
 *
 * 为什么要删：只拷不删时，真源里删掉一个文件后两个副本会永久滞留 —— 它们仍是提交进仓库的
 * 静态资源，浏览器照样按 URL 命中，于是「真源里已经没有了的东西」继续出货，且两边越漂越远
 * （删掉的那个文件在 A 副本里删了、B 副本里忘了删，谁也发现不了）。这条路径以前确实一致，
 * 但「一致」靠的是每次改完都记得手动删，不是结构保证。
 *
 * 目标：
 * - homeos/frontend/public/static/auth/scene/
 * - homeos-store/frontend/public/static/scene/
 *
 * 例外（真源里没有、但必须留在副本里的文件）：见 KEEP_IN_TARGET。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(sharedRoot, "../..");
const sourceDir = path.join(sharedRoot, "scene/static");

const targets = [
  path.join(monorepoRoot, "homeos/frontend/public/static/auth/scene"),
  path.join(monorepoRoot, "homeos-store/frontend/public/static/scene"),
];

/**
 * 目标副本里**不受真源管理、必须原样保留**的文件名（按 basename 匹配，任意层级）。
 *
 * 这两个是提交进仓库的目标侧文件 —— 真源树里没有它们，所以「不在真源里就删掉」这条规则
 * 会把它们误伤：
 *   - scene-depth.js  主应用保留的兜底手抄件（真源树里没有它，也不该由真源覆盖）
 *   - SYNCED_FROM_SHARED.txt  告诉读代码的人「这棵树是副本，改真源 + 跑 sync:scene」
 */
const KEEP_IN_TARGET = new Set(["scene-depth.js", "SYNCED_FROM_SHARED.txt"]);

function syncTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const wanted = new Set();
  let copied = 0;
  let removed = 0;

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (KEEP_IN_TARGET.has(entry.name)) continue;
    wanted.add(entry.name);
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      const nested = syncTree(src, dest);
      copied += nested.copied;
      removed += nested.removed;
      continue;
    }
    if (!entry.isFile()) continue;
    // 内容一致就不写：sync 在每次 `build:shared` 里跑，无脑 copyFile 会让全仓 mtime 抖动、
    // 也会让「有没有真的变」这件事看不出来。
    const next = fs.readFileSync(src);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(next)) continue;
    fs.writeFileSync(dest, next);
    copied += 1;
  }

  for (const entry of fs.readdirSync(to, { withFileTypes: true })) {
    if (wanted.has(entry.name) || KEEP_IN_TARGET.has(entry.name)) continue;
    fs.rmSync(path.join(to, entry.name), { recursive: true, force: true });
    removed += 1;
  }

  return { copied, removed };
}

if (!fs.existsSync(sourceDir)) {
  console.error(`缺少场景静态真源：${sourceDir}`);
  process.exit(1);
}

for (const target of targets) {
  const { copied, removed } = syncTree(sourceDir, target);
  const detail = [copied > 0 ? `写入 ${copied}` : null, removed > 0 ? `删除 ${removed}` : null]
    .filter(Boolean)
    .join(" / ");
  console.log(
    `synced scene static → ${path.relative(monorepoRoot, target)}${detail ? `（${detail}）` : "（无变化）"}`,
  );
}

#!/usr/bin/env bun
/**
 * 入户场景静态资源真源在 ``packages/shared/scene/static/``（CSS + fonts）。
 * 两个前端的 ``public/`` 只是部署路径不同的副本 —— 本脚本把真源同步过去，避免再各改一份。
 *
 * 目标：
 * - homeos/frontend/public/static/auth/scene/
 * - homeos-store/frontend/public/static/scene/
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

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dest);
      continue;
    }
    if (!entry.isFile()) continue;
    // 主应用保留 scene-depth.js 兜底手抄件，不由本树覆盖/删除。
    if (entry.name === "scene-depth.js") continue;
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`缺少场景静态真源：${sourceDir}`);
  process.exit(1);
}

for (const target of targets) {
  copyTree(sourceDir, target);
  console.log(`synced scene static → ${path.relative(monorepoRoot, target)}`);
}

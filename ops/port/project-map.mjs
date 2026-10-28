#!/usr/bin/env node
/**
 * 上游前端文件 ↔ 本项目源文件的对齐表。
 *
 * 上游是 `frontend/static/*.js` 的平铺结构，本项目是 `homeos/frontend/src/studio/**` 的
 * 分层结构，同名不代表同位置（`modules/interaction3d/core/stage.js` 对应
 * `src/studio/runtime/core/stage.ts`）。移植时最容易犯的错是「按目录结构照搬」，
 * 所以先把对齐关系算出来、落成一张表，后面每个移植任务都按这张表找目标文件。
 *
 * 匹配分级（用 basename 归一后比对，`-`/`_`/大小写忽略）：
 *   - mechanical：本项目有同名 `.ts/.tsx/.vue/.css`
 *   - renamed    ：同名但被拆到多个文件（一个上游文件命中多个本地文件）
 *   - missing    ：本项目无同名文件（上游新文件，或本地已重构掉）
 *
 * 用法：node ops/port/project-map.mjs [--version 0.8.1]
 * 产物：docs/port/0.8.1/project-map.json
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const VERSION = process.argv.includes("--version") ? process.argv[process.argv.indexOf("--version") + 1] : "0.8.1";

const UPSTREAM = join(ROOT, "源代码", VERSION, "frontend");
const PROJECT_SRC = join(ROOT, "homeos/frontend/src");

/** 归一化 basename：去掉扩展名与 `-`/`_`，转小写。 */
function normalize(rel) {
  const base = rel.split("/").pop();
  return base.replace(/\.(ts|tsx|vue|js|css|mjs)$/i, "").replace(/[-_]/g, "").toLowerCase();
}

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

const upstreamFiles = walk(UPSTREAM).filter((rel) => /\.(js|css)$/.test(rel));
const projectFiles = walk(PROJECT_SRC).filter((rel) => /\.(ts|tsx|vue|css)$/.test(rel));

const projectIndex = new Map();
for (const rel of projectFiles) {
  const key = normalize(rel);
  if (!projectIndex.has(key)) projectIndex.set(key, []);
  projectIndex.get(key).push(rel);
}

const rows = [];
for (const rel of upstreamFiles.sort()) {
  const key = normalize(rel);
  const hits = projectIndex.get(key) ?? [];
  rows.push({
    upstream: rel,
    kind: rel.endsWith(".css") ? "css" : "js",
    project: hits,
    status: hits.length === 0 ? "missing" : hits.length === 1 ? "mechanical" : "renamed",
  });
}

const counts = rows.reduce(
  (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
  {},
);
const usedProject = new Set(rows.flatMap((row) => row.project));
const projectOnly = projectFiles.filter((rel) => !usedProject.has(rel));

const out = join(ROOT, "docs/port/0.8.1/project-map.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      version: VERSION,
      summary: {
        upstream: rows.length,
        js: rows.filter((r) => r.kind === "js").length,
        css: rows.filter((r) => r.kind === "css").length,
        ...counts,
        projectFiles: projectFiles.length,
        projectOnly: projectOnly.length,
      },
      rows,
      projectOnly,
    },
    null,
    2,
  ),
);

console.log(`[map] 上游 ${rows.length} 个（js ${rows.filter((r) => r.kind === "js").length} / css ${rows.filter((r) => r.kind === "css").length}）`);
console.log(`[map] 机械对齐 ${counts.mechanical ?? 0} / 一拆多 ${counts.renamed ?? 0} / 本地无同名 ${counts.missing ?? 0}`);
console.log(`[map] 本项目 src 下 ${projectFiles.length} 个文件，其中 ${projectOnly.length} 个没有被任何上游文件命中`);
console.log(`[map] → ${relative(ROOT, out)}`);

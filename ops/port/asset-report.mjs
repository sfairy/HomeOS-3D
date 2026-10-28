#!/usr/bin/env node
/**
 * 上游模型 ↔ 本项目落盘的对齐表。
 *
 * 上游是英文 kebab id 的平铺目录，本项目是「中文目录 / 中文文件名」，两边对不上号是
 * 资产同步最容易出错的地方（放错目录、放了但没被 specs 收录）。这里把对齐结果落成
 * `docs/port/0.8.1/asset-map.json`，三分类：
 *   - matched    上游 id 在本项目有对应文件
 *   - upstream-only  上游有、本项目没有
 *   - project-only   本项目有、上游没有（本地新增的模型）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProjectIndex, buildUpstreamIndex } from "./lib/asset-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const VERSION = "0.8.1";

const upstream = buildUpstreamIndex(join(ROOT, "源代码", VERSION, "frontend/static/3d-studio/models"));
const project = buildProjectIndex(ROOT);

const rows = [];
for (const [key, file] of upstream) {
  const local = project.byId.get(file.id);
  rows.push({
    id: key,
    upstream: file.relPath,
    project: local ? local.files.map((f) => f.relPath) : [],
    status: local ? "matched" : "upstream-only",
  });
}
for (const [id, entry] of project.byId) {
  if (!upstream.has(id)) {
    rows.push({ id, upstream: [], project: entry.files.map((f) => f.relPath), status: "project-only" });
  }
}

const summary = {
  upstream: upstream.size,
  project: project.total,
  matched: rows.filter((r) => r.status === "matched").length,
  upstreamOnly: rows.filter((r) => r.status === "upstream-only").length,
  projectOnly: rows.filter((r) => r.status === "project-only").length,
  unresolvedProjectFiles: project.unresolved.length,
};

const out = join(ROOT, "docs/port/0.8.1/asset-map.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ version: VERSION, summary, rows, unresolvedProjectFiles: project.unresolved }, null, 2));

console.log(`[map] 上游 ${summary.upstream} / 本项目 ${summary.project}：对齐 ${summary.matched}，仅上游 ${summary.upstreamOnly}，仅本项目 ${summary.projectOnly}`);
if (project.unresolved.length) console.log(`[map] 本项目 ${project.unresolved.length} 个文件无法反查 id（见 asset-map.json）`);
console.log(`[map] → ${out}`);

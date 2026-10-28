/**
 * 资产 id ↔ 磁盘文件名的双向映射。
 *
 * 上游模型是英文 kebab id（`kitchensink.glb`），本项目落盘是中文目录 + 中文文件名
 * （`电器/地柜带水盆.glb`），唯一权威映射在 `homeos/frontend/scripts/models/specs/
 * model-file-names.json` 的 `stems` 表里。
 *
 * 一次资产比对要做三件事，都靠这张表：
 * 1. 把上游 654 个 `.glb` 归一到模型 id，才能跟本项目对上号；
 * 2. 认出 `-lite` 变体（上游有 `3d-printer-lite.glb`，对应同一 id 的低模）；
 * 3. 反向查本项目路径，供「选择性同步」把文件放回正确的中文目录。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const MODEL_ROOT = "homeos/frontend/public/static/3d-studio/models";
const NAME_TABLE = "homeos/frontend/scripts/models/specs/model-file-names.json";

/** 读 stems 表；同时返回反查表（中文主干 → id）。 */
export function loadStemTable(root) {
  const raw = JSON.parse(readFileSync(join(root, NAME_TABLE), "utf8"));
  const stems = raw.stems ?? {};
  const byStem = new Map();
  for (const [id, stem] of Object.entries(stems)) byStem.set(stem, id);
  return { stems, byStem };
}

/** `3d-printer-lite.glb` → `{ id: "3d-printer", lite: true }`。 */
export function parseModelFile(fileName) {
  const base = fileName.replace(/\.glb$/i, "");
  const lite = /-lite$/.test(base);
  return { id: lite ? base.slice(0, -"-lite".length) : base, lite };
}

/** 递归列出 `.glb`，返回 `{ relPath, absPath, fileName }`。 */
export function listGlbFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listGlbFiles(full, base, out);
    else if (name.toLowerCase().endsWith(".glb")) {
      out.push({ relPath: full.slice(base.length + 1), absPath: full, fileName: name });
    }
  }
  return out;
}

/**
 * 把本项目的中文落盘反查成 id。
 *
 * 文件名的形态不止一种：`地柜带水盆.glb`、`地柜带水盆-lite.glb`、
 * 以及带变体后缀的 `沙发·三人.glb`（`·` 之后是变体，主干仍是前者）。
 * 所以按「先精确、再前缀最长」两级匹配。
 */
export function buildProjectIndex(root) {
  const { stems, byStem } = loadStemTable(root);
  const files = listGlbFiles(join(root, MODEL_ROOT));
  const byId = new Map();
  const unresolved = [];

  for (const file of files) {
    const base = file.fileName.replace(/\.glb$/i, "");
    const lite = /-lite$/i.test(base);
    const stemWithVariant = lite ? base.slice(0, -5) : base;
    const [stem] = stemWithVariant.split("·");
    let id = byStem.get(stemWithVariant) ?? byStem.get(stem);
    if (!id) {
      // 前缀最长匹配：`地柜带水盆（左）` 这类带括号补充说明的写法。
      const hit = [...byStem.keys()]
        .filter((candidate) => stemWithVariant.startsWith(candidate))
        .sort((a, b) => b.length - a.length)[0];
      if (hit) id = byStem.get(hit);
    }
    if (!id) {
      unresolved.push(file.relPath);
      continue;
    }
    const entry = byId.get(id) ?? { id, stems: stems[id] ?? null, files: [] };
    entry.files.push({ ...file, lite });
    byId.set(id, entry);
  }

  return { byId, unresolved, total: files.length };
}

/** 上游 flat 目录：`kitchensink.glb` → id。返回 `Map<id, {lite, absPath, relPath}>`。 */
export function buildUpstreamIndex(dir) {
  const out = new Map();
  for (const file of listGlbFiles(dir)) {
    const { id, lite } = parseModelFile(file.fileName);
    const key = lite ? `${id}#lite` : id;
    out.set(key, { ...file, id, lite });
  }
  return out;
}

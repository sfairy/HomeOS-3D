#!/usr/bin/env bun
/**
 * 模型目录分类校验 / 迁移。
 *
 * 3D Studio 的模型按模型库类目分两级目录（`<大类>/<分区>/`），映射的唯一真值是
 * `src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts`。本脚本用同一张表
 * 校验磁盘布局，并（`--write`）把文件搬进对应目录，避免手工 `mv` 出现「文件搬了、URL 没改」
 * 或「注册表登记了、文件还在根目录」这类半迁移状态。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun homeos/frontend/scripts/models/organize-models.mjs            # 只校验，等同 --check
 * bun homeos/frontend/scripts/models/organize-models.mjs --check    # 校验（门禁用）
 * bun homeos/frontend/scripts/models/organize-models.mjs --write    # 打印清单后迁移
 * bun homeos/frontend/scripts/models/organize-models.mjs --json     # 机读结果
 * ```
 *
 * 校验项：
 * 1. 映射表里没有重复 id、没有指向不存在文件的 id；
 * 2. 磁盘上每个 GLB 都在映射表里（新增模型忘了登记会在这里失败）；
 * 3. 每个文件都在映射指定的目录（根目录遗留同样算未分类）；
 * 4. `-lite` / 完整件的成对与否只作提示（有些款天生单件）；
 * 5. 注册表（`ALL_ITEM_MODELS` / `EXTERNAL_ITEM_MODELS` / `COLLECTION_MODELS`）引用的每个
 *    GLB 文件名主干都能解析到目录 —— 这一条防的是「URL 拼错但文件存在」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
/** `homeos/frontend`：脚本位于 `<frontend>/scripts/models/`。 */
const frontendDir = path.resolve(hereDir, '../..');
const repoRoot = path.resolve(frontendDir, '../..');
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models');

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const asJson = args.includes('--json');

const loadModule = (relativePath) =>
  import(pathToFileURL(path.join(frontendDir, relativePath)).href);

const { MODEL_ASSETS_BY_FOLDER, modelAssetFolder } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts',
);
const { ALL_ITEM_MODELS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/all-item-models.ts',
);
const { EXTERNAL_ITEM_MODELS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/_shared.ts',
);
const { COLLECTION_MODELS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/collection-models.ts',
);

/** 递归列出 `models/` 下所有 GLB 的相对路径（分隔符统一为 `/`）。 */
function listGlbFiles(dir, relativePrefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listGlbFiles(path.join(dir, entry.name), relativePath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(relativePath);
  }
  return files.sort();
}

/** `home/living/sofa-lite.glb` → `{ id: 'sofa', variant: 'lite', folder: 'home/living' }`。 */
function parseModelPath(relativePath) {
  const slash = relativePath.lastIndexOf('/');
  const folder = slash >= 0 ? relativePath.slice(0, slash) : '';
  const fileName = relativePath.slice(slash + 1);
  const isLite = fileName.toLowerCase().endsWith('-lite.glb');
  return {
    folder,
    id: fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, ''),
    variant: isLite ? 'lite' : 'full',
  };
}

/** 期望的相对路径：`<folder>/<id><-lite>.glb`。 */
function expectedPath(assetId, variant) {
  const folder = modelAssetFolder(assetId);
  if (!folder) return null;
  return `${folder}/${assetId}${variant === 'lite' ? '-lite' : ''}.glb`;
}

/** 自底向上删除空目录，返回是否已删除。 */
function removeEmptyDirectories(dir) {
  let empty = true;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && removeEmptyDirectories(path.join(dir, entry.name))) continue;
    empty = false;
  }
  if (empty) {
    fs.rmdirSync(dir);
    return true;
  }
  return false;
}

const errors = [];
const warnings = [];
const moves = [];

/* -------------------------------- 1. 映射表自检 -------------------------------- */

const folderByMappedId = new Map();
for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER)) {
  for (const assetId of assetIds) {
    const previous = folderByMappedId.get(assetId);
    if (previous) {
      errors.push(`映射表重复登记：\`${assetId}\` 同时出现在 \`${previous}\` 与 \`${folder}\``);
      continue;
    }
    folderByMappedId.set(assetId, folder);
  }
}

/* -------------------------------- 2. 磁盘扫描 --------------------------------- */

const files = listGlbFiles(modelsDir);
const filesById = new Map();
for (const relativePath of files) {
  const parsed = parseModelPath(relativePath);
  const entry = filesById.get(parsed.id) ?? { variants: new Map() };
  entry.variants.set(parsed.variant, relativePath);
  filesById.set(parsed.id, entry);
}

for (const assetId of folderByMappedId.keys()) {
  if (!filesById.has(assetId)) errors.push(`映射表登记了 \`${assetId}\`，但磁盘上没有对应 GLB`);
}

for (const [assetId, entry] of filesById) {
  if (!folderByMappedId.has(assetId)) {
    errors.push(`磁盘上的 \`${assetId}*.glb\` 没有登记到映射表（新增模型请补 model-asset-folders.ts）`);
    continue;
  }
  if (entry.variants.has('lite') !== entry.variants.has('full')) {
    // 少数款只有单件（`suv` / `scooter` 只有降面版，`floating-stairs` / `floor-lamp` 只有完整件），
    // 不是错误，但要在输出里露出来，避免以后误以为成对文件丢了。
    warnings.push(`\`${assetId}\` 只有一个变体（${entry.variants.has('lite') ? '-lite' : '完整件'}）`);
  }
  for (const [variant, relativePath] of entry.variants) {
    const expected = expectedPath(assetId, variant);
    if (expected && expected !== relativePath) moves.push({ from: relativePath, to: expected });
  }
}

/* ------------------------------ 3. 注册表 URL 自检 ------------------------------ */

/** 从描述符里取出 GLB 文件名主干（去掉目录、`-lite` 后缀与 `?v=` 查询串）。 */
function urlStem(url) {
  if (typeof url !== 'string' || !url) return null;
  const pathname = url.split('?')[0];
  const fileName = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (!fileName.toLowerCase().endsWith('.glb')) return null;
  return fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '');
}

for (const [registryName, registry] of [
  ['ALL_ITEM_MODELS', ALL_ITEM_MODELS],
  ['EXTERNAL_ITEM_MODELS', EXTERNAL_ITEM_MODELS],
]) {
  for (const [itemType, descriptor] of Object.entries(registry)) {
    for (const [kind, url] of [
      ['url', descriptor?.url],
      ['fallbackUrl', descriptor?.fallbackUrl],
    ]) {
      const stem = urlStem(url);
      if (!stem) continue;
      if (!modelAssetFolder(stem)) {
        errors.push(`${registryName}.${itemType}.${kind} 指向 \`${stem}\`，该文件没有登记到映射表`);
      }
    }
  }
}
for (const collectionId of Object.keys(COLLECTION_MODELS)) {
  if (!modelAssetFolder(collectionId)) {
    errors.push(`COLLECTION_MODELS.${collectionId} 没有登记到映射表`);
  }
}

/* --------------------------------- 4. 输出 / 迁移 -------------------------------- */

const summary = {
  modelsDir: path.relative(repoRoot, modelsDir),
  mappedIds: folderByMappedId.size,
  glbFiles: files,
  pendingMoves: moves,
  warnings,
  errors,
};

if (writeMode) {
  if (errors.length) {
    console.error('目录布局仍有错误，先修正再迁移：');
    for (const message of errors) console.error(`  - ${message}`);
    process.exit(1);
  }
  for (const move of moves) {
    const source = path.join(modelsDir, move.from);
    const target = path.join(modelsDir, move.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      // `git mv` 保留文件历史；未跟踪的文件（刚落地的新 GLB）回落到普通 rename。
      execFileSync('git', ['mv', source, target], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      fs.renameSync(source, target);
    }
    console.log(`${move.from} → ${move.to}`);
  }
  // 迁移后空目录不留在 models 根下。
  for (const entry of fs.readdirSync(modelsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(modelsDir, entry.name));
  }
  console.log(`\n迁移完成：${moves.length} 个文件。`);
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else if (errors.length) {
  console.error(`目录布局有 ${errors.length} 项问题：`);
  for (const message of errors) console.error(`  - ${message}`);
  if (moves.length) console.error(`\n另有 ${moves.length} 个文件待迁移。`);
} else if (moves.length) {
  console.error(`${moves.length} 个 GLB 未分类到位，运行 \`--write\` 迁移：`);
  for (const move of moves.slice(0, 5)) console.error(`  - ${move.from} → ${move.to}`);
  if (moves.length > 5) console.error(`  …… 其余 ${moves.length - 5} 个同理`);
} else {
  console.log(
    `模型目录布局正常：${folderByMappedId.size} 个模型 / ${files.length} 个 GLB，全部分类到位。`,
  );
  for (const message of warnings) console.log(`  · ${message}`);
}

process.exit(errors.length || moves.length ? 1 : 0);

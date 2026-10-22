#!/usr/bin/env bun
/**
 * GLB 材质属性修复（**会写文件**，默认 dry-run）。
 *
 * 与 `audit_glb_materials.mjs` 的关系：审计只读、只出报告；本脚本按同一套运行时真值
 * （`resolveModelMaterialRole` → `materialRoleRecipeForRole`）把报告里的**可机械修复项**
 * 写回 GLB 的 JSON chunk。BIN chunk、节点、几何、动画一律原样保留。
 *
 * 修什么（规则编号与审计报告一一对应）：
 * - `A2` MASK 缺 `alphaCutoff` → 补 0.5；
 * - `A3` 非发光角色带 `emissiveFactor` → 删掉（发光只留给 glow / lit / indicator）；
 * - `A4` OPAQUE 却 `doubleSided` → 置 false（叶片 / 布片 / 薄片类保留）；
 * - `A6` 残留 `KHR_materials_pbrSpecularGlossiness` → 参数并入 MR 后删除；
 * - `A7` 不透明角色用 BLEND → 改 OPAQUE、alpha 置 1；
 * - `M1` 无 `baseColorFactor` / 贴图 → 按表面族补兜底色；
 * - `M2` 无 `roughnessFactor` → 按表面族补；
 * - `M4` 透明角色（glass / water / mirror）却没有 alpha 通道 → 设 BLEND + opacity；
 * - `C7` `metallicFactor` / `roughnessFactor` 与配方不一致 → 回填配方值（`--no-pbr` 可关）。
 *
 * 不改的（需要重出 / 产品决策，见审计报告附录）：
 * - `M3` 法线 / 遮蔽 / 金属粗糙度贴图全库缺失：**未实现**运行时共享法线图，
 *   且 `createPaletteMaterial` / `applyDefaultPaletteMaterial` 新建材质时不会带任何贴图，
 *   所以「只往 GLB 里写贴图」也不会生效 —— 要先补贴图烘焙 + 让调色板材质转发
 *   `normalMap` / `normalScale` / `aoMap`，属于渲染外观决策，不在本脚本机械修复范围；
 * - `C3` 死材质、`C4` lite / 完整件漂移、`C5` 文件名错位、`C6` 孤儿文件；
 * - `N1`/`N3` 槽位改名：**当前被 21 处遗留取色分支阻塞**（见下），需要先迁移那些分支。
 *
 * ⚠️ 槽位改名（`--rename-slots` / `--rules=N1`）默认拒绝执行：
 * `studio-external-models.ts` 仍有 21 处按 `material-<n>` 下标或原始材质名取色的分支
 * （柜门双色 shader、窗帘自发光、楼梯踏步地板色、鞋柜台面、钢琴漆面、NAS 透光板、
 * 电梯门板、floorlamp 调色板…）。改了名这些分支会**静默失效**、外观退化但不报错。
 * 确认已迁移后加 `--force-rename` 才放行。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/repair_glb_materials.mjs                 # dry-run：只打印计划
 * bun ops/checks/studio/repair_glb_materials.mjs --write         # 真正写回 GLB
 * bun ops/checks/studio/repair_glb_materials.mjs --write --no-pbr # 不碰 C7（保留原 metal/rough）
 * bun ops/checks/studio/repair_glb_materials.mjs --rules=A2,A3 --write
 * bun ops/checks/studio/repair_glb_materials.mjs --json          # 机读计划
 * ```
 *
 * 写回后会自动重新解析每个文件做校验：JSON 必须可解析、材质条数必须不变。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hereDir, '../../..');
const frontendDir = path.join(repoRoot, 'homeos/frontend');
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models');
const reportDir = path.join(repoRoot, 'docs/architecture/2026-10-22');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const writeMode = flag('write');
const asJson = flag('json');
const pbrBackfill = !flag('no-pbr');
const renameSlots = flag('rename-slots') || String(option('rules', '')).toUpperCase().includes('N1');
if (renameSlots) {
  const renameWarnings = [
    '槽位改名前请确认：遗留取色分支仍按 `material-<n>` 下标 / 原始材质名读名，改名会让它们静默失效。',
    '受影响分支（studio-external-models.ts）：',
    '  · 柜门双色 / 门面 shader        cabinetDoorMaterialIndex + endsWith("material-<n>") + "cabinet-material-0"',
    '  · 窗帘被片自发光                curtain_* + material-(1|2|3|5)',
    '  · 楼梯踏步地板色                stairs material-1 / steelstairs ^004$ / floatingstairs B-1 / sacfdsa010',
    '  · 鞋柜台面 shader               shoecabinet material-3',
    '  · 厨房台面 / 金属件取色         kitchenbase|kitchensink|kitchencooktop 下标表',
    '  · 书柜书脊循环配色              bookcase >= 11',
    '  · 边柜 / 床头柜 / 柜门色        sideboard|nightstand|cabinet 下标',
    '  · NAS 透光板 / 描边             nas material-0/2/4 与 nas-material-4',
    '  · 电梯门板                      /Color_00[34]/',
    '  · 钢琴漆面                      color_009 / blinds_weave',
    '  · 落地灯调色板                  floorlamp material-3（结构族，绕过角色表）',
  ];
  console.error(renameWarnings.join('\n'));
  if (!flag('force-rename')) {
    console.error('\n先迁移这些分支为「角色判断」或「旧名别名表」，确认后再加 --force-rename。已中止。');
    process.exit(2);
  }
  console.error('\n--force-rename 已指定：继续改名。改完务必逐个复核上面这些外观分支。\n');
}
const onlyRules = new Set(
  String(
    option('rules', '') ||
      (args.find((entry) => entry.startsWith('--rules=')) ?? '').slice('--rules='.length),
  )
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean),
);
const want = (rule) => !onlyRules.size || onlyRules.has(rule);

/* ------------------------------------------------------------------ *
 * 运行时真值
 * ------------------------------------------------------------------ */

const loadModule = async (relativePath) =>
  import(pathToFileURL(path.join(frontendDir, relativePath)).href);

const [allItemModelsModule, sharedModule, rolesModule] = await Promise.all([
  loadModule('src/studio/app/3d-studio/loaders/external-models/all-item-models.ts'),
  loadModule('src/studio/app/3d-studio/loaders/external-models/_shared.ts'),
  loadModule('src/studio/app/3d-studio/materials/studio-model-material-roles.ts'),
]);

const { resolveModelMaterialRole, materialRoleRecipeForRole } = rolesModule;
const { hasSemanticSlotRoles } = await loadModule(
  'src/studio/app/3d-studio/materials/model-slot-roles.ts',
);

const urlStem = (url) =>
  String(url || '')
    .split('?')[0]
    .split('/')
    .pop()
    .replace(/-lite\.glb$/i, '')
    .replace(/\.glb$/i, '');

/** 文件 stem → itemType[]（与审计脚本同一套反查，不做文件名猜测）。 */
const stemToItemTypes = new Map();
const itemDefinitions = new Map();
for (const source of [sharedModule.EXTERNAL_ITEM_MODELS, allItemModelsModule.ALL_ITEM_MODELS]) {
  for (const [itemType, definition] of Object.entries(source || {})) {
    if (!definition?.url || itemDefinitions.has(itemType)) continue;
    itemDefinitions.set(itemType, definition);
  }
}
for (const [itemType, definition] of itemDefinitions) {
  for (const url of [definition.url, definition.fallbackUrl]) {
    const stem = urlStem(url);
    if (!stem) continue;
    if (!stemToItemTypes.has(stem)) stemToItemTypes.set(stem, new Set());
    stemToItemTypes.get(stem).add(itemType);
  }
}

/** 去掉连字符 / 下划线，用于 `floor-lamp` ↔ `floorlamp` 这类历史别名。 */
const normalizeStem = (stem) => String(stem || '').toLowerCase().replace(/[-_]/g, '');

const normalizedItemTypes = new Map();
for (const itemType of itemDefinitions.keys()) {
  const key = normalizeStem(itemType);
  if (!normalizedItemTypes.has(key)) normalizedItemTypes.set(key, itemType);
}

/**
 * 文件 stem → { itemType, via }。
 * 注册表 url 反查优先；孤儿文件（`floor-lamp.glb` / `kitchen-island.glb`）再按规范化别名
 * 对到已有 itemType —— 它们没被注册表引用是 C6 问题，但材质仍应按同一套真值修好，
 * 否则一旦被登记/替换就会带着占位值上线。
 */
function resolveItemType(modelStem) {
  const own = itemDefinitions.get(modelStem);
  if (own && urlStem(own.url) === modelStem) return { itemType: modelStem, via: 'registry' };
  const mapped = stemToItemTypes.get(modelStem);
  if (mapped?.size) return { itemType: [...mapped].sort()[0], via: 'registry-url' };
  // 孤儿文件本身已经登记了槽位表（`kitchen-island` / `floor-lamp`）时，按文件 stem 解析：
  // 它的材质名本来就是 `kitchen-island-stone` 这种语义命名，别硬套到注册表里的无连字符 itemType。
  if (hasSemanticSlotRoles(modelStem)) return { itemType: modelStem, via: 'stem-table' };
  const alias = normalizedItemTypes.get(normalizeStem(modelStem));
  if (alias) return { itemType: alias, via: 'normalized-alias' };
  return { itemType: null, via: null };
}

/* ------------------------------------------------------------------ *
 * 判定用的白名单
 * ------------------------------------------------------------------ */

/** 薄片 / 布片类：双面是必需行为，不能按 A4 关掉。 */
const KEEP_DOUBLE_SIDED_SURFACE = new Set(['fabric', 'foliage']);
const KEEP_DOUBLE_SIDED_ROLE =
  /(leaf|foliage|fabric|linen|curtain|drape|rug|throw|tent|paper|banner|flag|shadow)/;

/**
 * 透明判定与审计脚本同源：只认 `recipe.transparent === true`。
 * 不要用「角色名像玻璃」去猜 —— `garden-*-water` 是水景、`container` 是玻璃罐，
 * 一旦猜错就会把整排园艺件改成半透明。
 */

/** 自发光角色（`recipe.emissive` 未声明时的兜底）。 */
const EMISSIVE_ROLE = /(glow|lit|indicator|emissive|light)/;

/** 表面族兜底色（线性空间，仅用于 M1 这类「连兜底色都没有」的材质）。 */
const SURFACE_FALLBACK_COLOR = {
  fabric: [0.32, 0.34, 0.37],
  leather: [0.24, 0.13, 0.07],
  wood: [0.38, 0.26, 0.15],
  marble: [0.82, 0.81, 0.78],
  stone: [0.5, 0.48, 0.44],
  metal: [0.48, 0.5, 0.53],
  lacquer: [0.7, 0.69, 0.67],
  glass: [0.72, 0.8, 0.83],
  ceramic: [0.88, 0.87, 0.85],
  foliage: [0.07, 0.18, 0.06],
  paint: [0.7, 0.69, 0.66],
};
const DEFAULT_FALLBACK_COLOR = [0.7, 0.69, 0.66];

/** 收集被 primitive / KHR_materials_variants 引用的材质下标。 */
function collectReferencedMaterials(json) {
  const used = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (Number.isInteger(primitive.material)) used.add(primitive.material);
      const variants = primitive.extensions?.KHR_materials_variants?.mappings;
      if (Array.isArray(variants)) {
        for (const mapping of variants) {
          if (Number.isInteger(mapping.material)) used.add(mapping.material);
        }
      }
    }
  }
  return used;
}

/**
 * 删除没有任何 primitive 引用的材质，并重映射下标。
 * 只删「确定没人引用」的：任何未知扩展里出现的 material 下标都无法枚举，因此保守跳过整份文件。
 */
function pruneDeadMaterials(json) {
  const materials = json.materials ?? [];
  if (materials.length < 2) return null;
  const used = collectReferencedMaterials(json);
  if (!used.size) return null;
  const dead = materials
    .map((material, index) => ({ material, index }))
    .filter(({ index }) => !used.has(index));
  if (!dead.length) return null;

  const keep = materials.map((material, index) => ({ material, index })).filter(({ index }) => used.has(index));
  const remap = new Map(keep.map(({ index }, next) => [index, next]));
  json.materials = keep.map(({ material }) => material);

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (Number.isInteger(primitive.material) && remap.has(primitive.material)) {
        primitive.material = remap.get(primitive.material);
      }
      const variants = primitive.extensions?.KHR_materials_variants?.mappings;
      if (Array.isArray(variants)) {
        for (const mapping of variants) {
          if (Number.isInteger(mapping.material) && remap.has(mapping.material)) {
            mapping.material = remap.get(mapping.material);
          }
        }
      }
    }
  }
  return dead.map(({ material, index }) => ({ index, name: material.name ?? null }));
}

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const round = (value) => Math.round(clamp01(value) * 1000) / 1000;

/* ------------------------------------------------------------------ *
 * GLB 读写
 * ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('不是 GLB（magic 不符）');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`不支持的 glTF 版本 ${version}`);
  const total = buffer.readUInt32LE(8);
  if (total > buffer.length) throw new Error(`头部长度 ${total} 超过文件长度 ${buffer.length}`);

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) throw new Error(`chunk 越界（${offset}）`);
    const data = buffer.subarray(start, end);
    if (type === CHUNK_JSON) {
      json = JSON.parse(data.toString('utf8'));
    } else if (type === CHUNK_BIN) {
      bin = Buffer.from(data);
    }
    offset = end;
  }
  if (!json) throw new Error('缺少 JSON chunk');
  return { json, bin, originalLength: total };
}

function serializeGlb(json, bin) {
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPadding) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);

  let binBuffer = bin ?? Buffer.alloc(0);
  const binPadding = (4 - (binBuffer.length % 4)) % 4;
  if (binPadding) binBuffer = Buffer.concat([binBuffer, Buffer.alloc(binPadding, 0)]);

  const hasBin = binBuffer.length > 0;
  const total = 12 + 8 + jsonBuffer.length + (hasBin ? 8 + binBuffer.length : 0);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);

  if (!hasBin) return Buffer.concat([header, jsonHeader, jsonBuffer]);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer]);
}

/* ------------------------------------------------------------------ *
 * 单材质修复计划
 * ------------------------------------------------------------------ */

function isEmissiveRole(recipe, role) {
  if (recipe?.emissive !== undefined) return true;
  if ((recipe?.emissiveIntensity ?? 0) > 0) return true;
  return EMISSIVE_ROLE.test(role);
}

const isTransparentRecipe = (recipe) => recipe?.transparent === true;

/**
 * 材质名是否「无语义」：纯序号（`bar-material-0`）、历史遗留名（`*5` / `[Color_008]1`）、
 * 或尾词是序号。这类名字只能靠顺序表解析，改名收益最大。
 */
function isNonSemanticName(materialName, itemType, index) {
  const lower = String(materialName || '').toLowerCase();
  if (!lower) return false;
  if (/material-\d+$/.test(lower)) return true;
  if (/^[^a-z]*$/.test(lower)) return true;
  if (/[^a-z0-9._-]/.test(lower)) return true;
  // 小写字母 / 数字 / 下划线 / 连字符 以外的写法（`om.cn_1336` 的点、`B-1` 的大写）都要改。
  if (!/^[a-z0-9][a-z0-9_]*(?:-[a-z0-9][a-z0-9_]*)*$/.test(lower)) return true;
  const result = resolveModelMaterialRole(itemType, lower, index);
  return result.source !== 'name';
}

/** `bookcase-material-3` → `bookcase-shelf`，与同文件内已有名字去重。 */
function planSlotRename({ material, itemType, index, role, taken, via }) {
  if (!renameSlots) return null;
  // 孤儿文件（没进注册表）只修属性不改名：名字改了也没人读，反而丢掉原名里的信息。
  if (via === 'normalized-alias') return null;
  if (!isNonSemanticName(material.name, itemType, index)) return null;
  const base = `${itemType}-${role}`;
  for (let suffix = 1; suffix < 40; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (taken.has(candidate)) continue;
    const resolved = resolveModelMaterialRole(itemType, candidate, index);
    if (resolved.role === role && resolved.source === 'name') {
      return candidate;
    }
  }
  return null;
}

/** @returns {{ patches: Array<[string, string]>, changed: boolean, role: string }} */
function planMaterialFix({ material, itemType, index }) {
  const patches = [];
  const roleResult = resolveModelMaterialRole(itemType, material.name, index);
  const role = roleResult.role;
  const recipe = materialRoleRecipeForRole(itemType, role, null, roleResult.slot ?? index);
  const surface = recipe?.surface ?? null;

  if (!material.pbrMetallicRoughness) material.pbrMetallicRoughness = {};
  const pbr = material.pbrMetallicRoughness;

  // ── A6 旧工作流双通道 ──────────────────────────────────────────
  if (want('A6') && material.extensions?.KHR_materials_pbrSpecularGlossiness) {
    const sg = material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (!pbr.baseColorFactor && Array.isArray(sg.diffuseFactor)) {
      pbr.baseColorFactor = sg.diffuseFactor.slice(0, 4);
    }
    if (!pbr.baseColorTexture && sg.diffuseTexture) pbr.baseColorTexture = sg.diffuseTexture;
    if (pbr.metallicFactor === undefined) pbr.metallicFactor = 0;
    if (pbr.roughnessFactor === undefined && typeof sg.glossinessFactor === 'number') {
      pbr.roughnessFactor = round(1 - sg.glossinessFactor);
    }
    delete material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (!Object.keys(material.extensions).length) delete material.extensions;
    patches.push(['A6', '删除 KHR_materials_pbrSpecularGlossiness（参数已并入 MR）']);
  }

  // ── A2 MASK 缺 alphaCutoff ────────────────────────────────────
  if (want('A2') && material.alphaMode === 'MASK' && material.alphaCutoff === undefined) {
    material.alphaCutoff = 0.5;
    patches.push(['A2', '补 alphaCutoff=0.5']);
  }

  // ── A3 非发光角色带自发光 ─────────────────────────────────────
  if (want('A3') && !material.emissiveTexture && !isEmissiveRole(recipe, role)) {
    const emissive = material.emissiveFactor;
    if (Array.isArray(emissive) && emissive.some((channel) => (channel || 0) > 0)) {
      delete material.emissiveFactor;
      patches.push(['A3', `清空 emissiveFactor（${role} 非发光角色）`]);
    }
  }

  // ── A7 不透明角色用 BLEND ────────────────────────────────────
  if (want('A7') && material.alphaMode === 'BLEND' && !isTransparentRecipe(recipe)) {
    material.alphaMode = 'OPAQUE';
    if (Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.length === 4) {
      pbr.baseColorFactor[3] = 1;
    }
    patches.push(['A7', `alphaMode=OPAQUE（${role} 不是透明角色）`]);
  }

  // ── M4 透明角色没有 alpha 通道 ───────────────────────────────
  // 缺省 alphaMode 规范上就是 OPAQUE，所以要按 `?? 'OPAQUE'` 判。
  if (want('M4') && (material.alphaMode ?? 'OPAQUE') === 'OPAQUE' && isTransparentRecipe(recipe)) {
    const opacity = round(recipe?.opacity ?? 0.34);
    const base = Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor.slice(0, 4) : null;
    if (base && base.length === 4) {
      base[3] = opacity;
      pbr.baseColorFactor = base;
    } else if (!pbr.baseColorTexture) {
      pbr.baseColorFactor = [
        ...(SURFACE_FALLBACK_COLOR[surface] ?? DEFAULT_FALLBACK_COLOR),
        opacity,
      ];
    }
    material.alphaMode = 'BLEND';
    // 玻璃 / 水面的背面必须保留，否则侧看会消失
    material.doubleSided = true;
    patches.push(['M4', `alphaMode=BLEND、alpha=${opacity}（${role} 是透明角色）`]);
  }

  // ── M1 连兜底色都没有 ────────────────────────────────────────
  if (want('M1') && !pbr.baseColorFactor && !pbr.baseColorTexture) {
    pbr.baseColorFactor = [...(SURFACE_FALLBACK_COLOR[surface] ?? DEFAULT_FALLBACK_COLOR), 1];
    patches.push(['M1', `补 baseColorFactor（${surface ?? '默认'} 兜底色）`]);
  }

  // ── M2 粗糙度缺失 / C7 与配方不一致 ──────────────────────────
  const hasMrTexture = Boolean(pbr.metallicRoughnessTexture);
  if (!hasMrTexture) {
    if (want('M2') && pbr.roughnessFactor === undefined && typeof recipe?.roughness === 'number') {
      pbr.roughnessFactor = round(recipe.roughness);
      patches.push(['M2', `补 roughnessFactor=${pbr.roughnessFactor}`]);
    }
    if (pbrBackfill && want('C7')) {
      const drift = [];
      if (typeof recipe?.roughness === 'number' && pbr.roughnessFactor !== undefined) {
        const next = round(recipe.roughness);
        if (Math.abs((pbr.roughnessFactor ?? 0) - next) > 0.01) {
          drift.push(`roughness ${pbr.roughnessFactor}→${next}`);
          pbr.roughnessFactor = next;
        }
      }
      if (typeof recipe?.metalness === 'number') {
        const next = round(recipe.metalness);
        if (pbr.metallicFactor === undefined || Math.abs((pbr.metallicFactor ?? 0) - next) > 0.01) {
          drift.push(`metallic ${pbr.metallicFactor ?? '缺'}→${next}`);
          pbr.metallicFactor = next;
        }
      }
      if (drift.length) patches.push(['C7', `回填配方：${drift.join('，')}`]);
    }
  }

  // ── A4 不透明实体件被标双面（放在最后：alphaMode 已定稿） ────
  // 只判 OPAQUE：`MASK` + 双面是叶片 / 镂空卡片的正常用法，不能动。
  if (want('A4') && (material.alphaMode ?? 'OPAQUE') === 'OPAQUE' && material.doubleSided === true) {
    const keepDouble =
      isTransparentRecipe(recipe) ||
      (surface && KEEP_DOUBLE_SIDED_SURFACE.has(surface)) ||
      KEEP_DOUBLE_SIDED_ROLE.test(role) ||
      KEEP_DOUBLE_SIDED_ROLE.test(String(material.name || ''));
    if (!keepDouble) {
      material.doubleSided = false;
      patches.push(['A4', 'doubleSided=false（不透明实体件）']);
    }
  }

  // 清理空对象，避免写出 `pbrMetallicRoughness: {}`
  if (!Object.keys(pbr).length) delete material.pbrMetallicRoughness;

  return { patches, changed: patches.length > 0, role };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const files = fs
  .readdirSync(modelsDir)
  .filter((name) => name.toLowerCase().endsWith('.glb'))
  .sort();

const manifest = { generatedAt: new Date().toISOString(), writeMode, files: [] };
const ruleCounts = {};
let changedFiles = 0;
let changedMaterials = 0;
let skipped = 0;
const failures = [];

for (const fileName of files) {
  const fullPath = path.join(modelsDir, fileName);
  const modelStem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '');
  const resolved = resolveItemType(modelStem);
  const itemType = resolved.itemType;

  let parsed;
  try {
    parsed = parseGlb(fs.readFileSync(fullPath));
  } catch (error) {
    failures.push({ fileName, error: error.message });
    continue;
  }

  if (!itemType) {
    skipped += 1;
    manifest.files.push({ fileName, itemType: null, skipped: '孤儿文件（注册表未引用且无同名别名）' });
    continue;
  }
  if (!Array.isArray(parsed.json.materials) || !parsed.json.materials.length) {
    skipped += 1;
    manifest.files.push({ fileName, itemType, skipped: '无材质' });
    continue;
  }

  const before = JSON.stringify(parsed.json.materials);
  const changes = [];
  const takenNames = new Set(
    parsed.json.materials.map((material) => String(material.name || '').toLowerCase()),
  );
  parsed.json.materials.forEach((material, index) => {
    // N1 槽位改名：先定角色 → 生成可直读的新名字 → 校验解析结果不变 → 改名
    const rename = planSlotRename({
      material,
      itemType,
      index,
      role: resolveModelMaterialRole(itemType, material.name, index).role,
      taken: takenNames,
      via: resolved.via,
    });
    const renamePatches = [];
    if (rename) {
      takenNames.delete(String(material.name || '').toLowerCase());
      takenNames.add(rename);
      renamePatches.push(['N1', `${material.name} → ${rename}`]);
      material.name = rename;
    }
    const plan = planMaterialFix({ material, itemType, index });
    plan.patches.unshift(...renamePatches);
    plan.changed = plan.patches.length > 0;
    if (!plan.changed) return;
    for (const [rule] of plan.patches) {
      ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1;
    }
    changes.push({
      index,
      name: material.name ?? null,
      role: plan.role,
      rules: plan.patches.map(([rule]) => rule),
      detail: plan.patches.map(([, detail]) => detail),
    });
  });

  // ── C3 死材质（没有任何 primitive 引用的材质） ────────────────
  // 默认**不删**：这批死槽位可能是调色板 UI 的候选槽位，删掉会让面板少项。
  // 确认不需要后显式 `--rules=C3` 或 `--prune-dead` 再执行。
  let deadMaterials = [];
  if (want('C3') && (flag('prune-dead') || onlyRules.has('C3'))) {
    deadMaterials = pruneDeadMaterials(parsed.json) ?? [];
    for (const dead of deadMaterials) {
      ruleCounts.C3 = (ruleCounts.C3 ?? 0) + 1;
      changes.push({
        index: dead.index,
        name: dead.name,
        role: null,
        rules: ['C3'],
        detail: ['删除无 primitive 引用的死材质并重映射下标'],
      });
    }
  }

  if (!changes.length || before === JSON.stringify(parsed.json.materials)) continue;

  changedFiles += 1;
  changedMaterials += changes.length;

  if (writeMode) {
    fs.writeFileSync(fullPath, serializeGlb(parsed.json, parsed.bin));
    const verify = parseGlb(fs.readFileSync(fullPath));
    if (verify.json.materials.length !== parsed.json.materials.length) {
      failures.push({ fileName, error: '写回后材质条数变化' });
    }
  }

  manifest.files.push({
    fileName,
    itemType,
    itemTypeVia: resolved.via,
    materialCount: parsed.json.materials.length,
    changes,
  });
}

const summary = {
  scannedFiles: files.length,
  changedFiles,
  changedMaterials,
  skippedFiles: skipped,
  writeMode,
  pbrBackfill,
  ruleCounts,
  failures,
};

if (asJson) {
  process.stdout.write(`${JSON.stringify({ summary, manifest }, null, 2)}\n`);
} else {
  const verb = writeMode ? '已写回' : '（dry-run，未写文件）将修复';
  console.log(
    `${verb}：${changedFiles} 个 GLB / ${changedMaterials} 条材质（扫描 ${files.length} 个文件，跳过 ${skipped}）`,
  );
  for (const [rule, count] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${count}`);
  }
  if (!pbrBackfill) console.log('  （--no-pbr：C7 金属度 / 粗糙度回填已关闭）');
  for (const failure of failures) console.log(`  ✗ ${failure.fileName}: ${failure.error}`);
  if (!writeMode) console.log('加 --write 才会真正落盘。');
}

if (writeMode && !asJson) {
  fs.mkdirSync(reportDir, { recursive: true });
  const manifestPath = path.join(reportDir, 'glb-material-repair.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ summary, manifest }, null, 2)}\n`);
  console.log(`→ ${path.relative(repoRoot, manifestPath)}`);
}

if (failures.length) process.exit(1);

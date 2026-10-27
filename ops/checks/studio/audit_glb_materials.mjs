#!/usr/bin/env bun
/**
 * GLB 材质属性审计（只读）。
 *
 * 为什么需要它：3D Studio 的模型材质分**两层**——
 * 1. GLB 内嵌的 `pbrMetallicRoughness`：多数批次只烘了占位值（0.7.6 批次粗糙度一律 0.82、
 *    金属度 0），仅作兜底；
 * 2. 运行时的「角色 → 配方」覆盖层（`studio-model-material-roles.ts`）：颜色、粗糙度、
 *    金属度、透明度由角色决定，才是设计真值。
 *
 * 只看 GLB 会把占位值误判成错误，只看配方又发现不了贴图 / alpha / 命名的问题，所以本脚本把
 * 两层都读出来对齐，逐模型给出「问题项 → 修复建议 → 完善后的属性值」。
 *
 * 真值口径：
 * - 角色与配方不重新实现，直接 import 运行时解析器（`resolveModelMaterialRole` /
 *   `materialRoleRecipeForRole`），保证报告与线上渲染同源；
 * - 配方用 `palette = null` 解析，得到的是**默认主题兜底色**（运行时由 itemPalette 覆盖）；
 *   粗糙度 / 金属度 / 透明度是稳定真值，可直接回填 GLB；
 * - 文件 → itemType 的映射取注册表的 `url`（`ALL_ITEM_MODELS` / `EXTERNAL_ITEM_MODELS`），
 *   不用文件名猜，避免 `air-outlet` / `airoutlet` 这类历史命名错位被误判。
 *
 * 判定分级：
 * - `missing`    缺失：必需通道 / 属性没配；
 * - `anomaly`    异常：越界、类型不符、贴图不可解析、alpha 语义错用；
 * - `inconsistent` 不一致：模型内角色塌陷、lite 与完整件漂移、内嵌值与配方冲突、命名错位等。
 *
 * 严重度：
 * - `systemic` 全局性（例如全库 3067 条材质都没有法线贴图），计入报告「系统性问题」，
 *   **不参与**单模型 status 判定，否则 332 个模型会全红、失去区分度；
 * - `model` 单模型问题，参与 status。
 *
 * 两类「不是问题」的口径（都要留痕，不能静默放过）：
 * - **契约登记的缺席槽位**：`specs/model-slot-contracts.json` 里 `required: false` 的槽位，
 *   是已审过「本模型没有这个构件」的槽位。重建器刻意沿用源材质数组（运行期还有按旧名 /
 *   `material-<n>` 下标取色的分支），所以它们必然没有 primitive 引用 —— C3 不再报，
 *   改在报告「契约登记的缺席槽位」一行汇总。
 * - **已审资源例外**：`DECLARED_ASSET_EXCEPTIONS`（C5 命名错位 / C6 孤儿件），逐条带
 *   id 与保留原因，命中时只进报告注记与附录 B，不参与 status。新出现的孤儿件仍会被报。
 *
 * 两类「已落实的策略」也单独成文（`note` 级别，不进任何计数）：
 * - **M3 / S1 细节图（bumpMap）**：GLB **故意不内嵌**贴图，细节高度图由运行时按表面族挂共享程序化纹理
 *   （`materials/studio-surface-normal-maps.ts` + `studio-box-uv.ts`）。所以「GLB 里没有
 *   `normalTexture`」是策略而非缺陷。本脚本每次仍会**验证这条链路**：两边的表面族清单与
 *   `SURFACE_DETAIL_SCALE` 是否一致、加载器有没有真的调用补 UV 与挂 `bumpMap`；任一处断链就退回按模型报
 *   M3（`missing`），并把断点写进报告。
 * - **命名等价别名**：文件名与 itemType 只差 `-` / `_` 风格（`air-outlet` ↔ `airoutlet`），
 *   是机械等价的，注册表 url 与磁盘反查都能对上。单独列出、不计入不一致；真正不同名的错位
 *   （`car` ↔ `smallcar`）仍然报 C5。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/audit_glb_materials.mjs              # 写报告（md + json）
 * bun ops/checks/studio/audit_glb_materials.mjs --stdout     # 只打摘要，不写文件
 * bun ops/checks/studio/audit_glb_materials.mjs --json       # 机读 JSON 到 stdout
 * bun ops/checks/studio/audit_glb_materials.mjs --check      # 覆盖度 + 角色基线门禁，漂移则退出码 1
 * bun ops/checks/studio/audit_glb_materials.mjs --write-role-baseline  # 刻意调整角色后重写基线
 * ```
 *
 * 角色基线（`material-role-baseline.json`）故意**不含槽位名**：改名不影响指纹，
 * 只有「解析出的角色变了」才算漂移（重导出导致下标位移 / token 表误改）。
 *
 * 本脚本**不修改任何 GLB**，只读文件系统。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hereDir, '../../..');
const frontendDir = path.join(repoRoot, 'homeos/frontend');
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models');
const reportDir = path.join(repoRoot, 'docs/architecture/2026-10-22');

/**
 * 递归列出 `models/` 下的 GLB 相对路径。
 *
 * 模型按模型库类目分两级中文子目录（`家居/客厅家具/沙发-lite.glb`），因此所有扫描
 * 都必须递归；报告用磁盘中文文件名，注册表 / 基线仍用英文 id，两者由
 * `model-asset-folders.ts` 的映射表翻译。
 */
function listModelFiles(dir = modelsDir, relativePrefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listModelFiles(path.join(dir, entry.name), relativePath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(relativePath);
  }
  return files.sort();
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const asJson = flag('json');
const checkMode = flag('check');
const writeRoleBaseline = flag('write-role-baseline');
const stdoutOnly = flag('stdout') || checkMode || writeRoleBaseline;
const outDir = path.resolve(repoRoot, option('out-dir', reportDir));
const reportPath = path.join(outDir, 'glb-material-audit.md');
const jsonPath = path.join(outDir, 'glb-material-audit.json');

/* ------------------------------------------------------------------ *
 * GLB 解析：只读 JSON chunk（不走 three.js，避免把渲染依赖带进检查脚本）
 * ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

/**
 * 解析 GLB 头部与 JSON chunk。
 * @returns {{version: number, gltf: any, binLength: number, declaredLength: number, byteLength: number}}
 */
function parseGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 12) throw new Error('文件不足 12 字节，不是 GLB');
  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) throw new Error(`magic 不是 glTF（0x${magic.toString(16)}）`);
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length) {
    throw new Error(`头部声明 ${declaredLength} 字节，实际只有 ${buffer.length} 字节（文件被截断）`);
  }
  let offset = 12;
  let gltf = null;
  let binLength = 0;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (bodyStart + chunkLength > buffer.length) throw new Error('chunk 长度越界（文件被截断）');
    chunks.push({ type: chunkType, length: chunkLength });
    if (chunkType === CHUNK_JSON) {
      const text = buffer.subarray(bodyStart, bodyStart + chunkLength).toString('utf8');
      try {
        gltf = JSON.parse(text);
      } catch (error) {
        throw new Error(`JSON chunk 解析失败：${error.message}`);
      }
    } else if (chunkType === CHUNK_BIN) {
      binLength = chunkLength;
    }
    offset = bodyStart + chunkLength;
  }
  if (!gltf) throw new Error('没有 JSON chunk');
  return { version, gltf, binLength, declaredLength, byteLength: buffer.length, chunks };
}

/* ------------------------------------------------------------------ *
 * 数值 / 颜色工具
 * ------------------------------------------------------------------ */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const inUnitRange = (value) => isFiniteNumber(value) && value >= 0 && value <= 1;
const round = (value, digits = 4) => Number(value.toFixed(digits));
const num = (value, digits = 3) => (isFiniteNumber(value) ? String(round(value, digits)) : '—');
const hexOf = (value) =>
  isFiniteNumber(value) ? `#${(value >>> 0).toString(16).padStart(6, '0').toUpperCase()}` : '—';

/** 0xRRGGBB → `[r, g, b, a]`（0–1，glTF 口径）。 */
function colorToFactor(colorValue, alpha = 1) {
  if (!isFiniteNumber(colorValue)) return null;
  return [
    round(((colorValue >> 16) & 0xff) / 255),
    round(((colorValue >> 8) & 0xff) / 255),
    round((colorValue & 0xff) / 255),
    round(alpha),
  ];
}

/** 表面族 → 建议细节强度（`SURFACE_DETAIL_SCALE` 的运行时副本；布艺最弱、枝叶最强，金属居中）。 */
const DETAIL_SCALE_BY_SURFACE = Object.freeze({
  fabric: 0.35,
  leather: 0.45,
  wood: 0.5,
  marble: 0.25,
  stone: 0.55,
  metal: 0.4,
  lacquer: 0.2,
  glass: 0.15,
  ceramic: 0.25,
  foliage: 0.7,
  paint: 0.3,
});

/** 允许自带自发光的角色（其余角色带 `emissiveFactor` 一律视为异常）。 */
const EMISSIVE_ROLES = new Set(['glow', 'lit', 'emissive', 'indicator', 'display', 'led']);

/** 双面渲染有正当理由的表面族（叶片 / 布片）。 */
/**
 * 双面渲染的合法场景：叶片 / 布片这类**单层薄片**，背面必须可见。
 * `MASK` 的镂空卡片同理，已在规则里排除（A4 只判 OPAQUE）。
 */
const DOUBLE_SIDED_OK_SURFACES = new Set(['foliage', 'fabric']);
/** 角色名兜底：`throwBlanket` / `curtain` / `rugPile` 这类即便表面族标成 paint 也该双面。 */
const DOUBLE_SIDED_OK_ROLE = /(leaf|foliage|fabric|linen|curtain|drape|rug|throw|tent|paper|banner|flag|shadow)/;

/* ------------------------------------------------------------------ *
 * 规则目录（报告附录与逐模型问题项共用同一份文案）
 * ------------------------------------------------------------------ */

const RULE_CATALOG = Object.freeze({
  M1: { kind: 'missing', title: '基础色缺失', fix: '补 `pbrMetallicRoughness.baseColorFactor`（取角色配方色）或挂 baseColorTexture' },
  M2: { kind: 'missing', title: '粗糙度缺失', fix: '补 `roughnessFactor`（取表面族配方）或挂 metallicRoughnessTexture' },
  M3: { kind: 'missing', title: '法线 / 遮蔽 / 金属粗糙度贴图缺失', fix: '按表面族挂共享程序化高度图（S1 策略），并按族设 bumpScale' },
  M4: { kind: 'missing', title: '透明角色没有 alpha 通道', fix: '设 alphaMode=BLEND 且 baseColorFactor[3]=opacity' },
  M5: { kind: 'missing', title: '高金属度材质没有环境贴图（金属发黑）', fix: '由 `studio-metal-environment.ts` 给 metalness ≥ 0.5 的材质挂共享程序化 `envMap`（IBL 替身）' },
  M6: { kind: 'inconsistent', title: '档位把结构 / 软装角色刷成金属', fix: '`definePreset` 的 `sanitizeStructuralMetalRoles` 收口：结构件走 `lacquer` / 软装走 `fabric`，只保留 `metal / handle / grating / grille / leg / trim / frame` 为金属' },
  M7: { kind: 'anomaly', title: '细节贴图周期密度过密', fix: '降低 `MAX_DETAIL_CYCLES` 或提高纹理边长，保证一个细节周期 ≥ 16 纹素' },
  A1: { kind: 'anomaly', title: '属性值越界或类型不符', fix: '钳制到合法区间（颜色 / 透明度 0–1，金属度 / 粗糙度 0–1）' },
  A2: { kind: 'anomaly', title: 'alphaMode=MASK 但没有 alphaCutoff', fix: '补 `alphaCutoff`（默认 0.5）或改回 OPAQUE' },
  A3: { kind: 'anomaly', title: '非发光角色带自发光', fix: '清空 `emissiveFactor` 为 [0,0,0]，自发光只留给 glow/lit/indicator' },
  A4: { kind: 'anomaly', title: 'OPAQUE 材质被标双面', fix: '`doubleSided=false`（叶片 / 布片例外，保留并记录）' },
  A5: { kind: 'anomaly', title: '贴图无法解析', fix: '修正 texture→image 索引，或补回缺失的外部贴图文件' },
  A6: { kind: 'anomaly', title: '残留 specular-glossiness 双通道', fix: '删除 `KHR_materials_pbrSpecularGlossiness`，参数并入 metallic-roughness' },
  A7: { kind: 'anomaly', title: '不透明角色却用了 BLEND', fix: 'alphaMode=OPAQUE、baseColorFactor[3]=1（只有玻璃 / 水体 / 镜面可保留 BLEND）' },
  A8: { kind: 'anomaly', title: 'alpha 值 <1 但 alphaMode=OPAQUE', fix: '要么把 alpha 置 1，要么改成 BLEND（alpha 在 OPAQUE 下不生效）' },
  C1: { kind: 'inconsistent', title: '角色解析穿透到家族兜底', fix: '在 `model-slot-roles.ts` 登记该材质名 → 语义角色（见建议角色）' },
  C2: { kind: 'inconsistent', title: '一个模型所有槽位同角色', fix: '拆开语义角色，避免整件一个颜色 / 一个表面' },
  C3: { kind: 'inconsistent', title: '声明了但没有任何 primitive 引用的材质', fix: '删除死材质，或把对应构件指回该材质；契约里 `required: false` 的缺席槽位不计入（见附录 B）' },
  C4: { kind: 'inconsistent', title: 'lite 与完整件材质集漂移', fix: '用同一份导出配置重出 lite / 完整件，保证材质名与参数一致' },
  C5: { kind: 'inconsistent', title: 'GLB 文件名与 itemType 不一致', fix: '统一命名（改名或加别名映射），避免靠猜路径' },
  C6: { kind: 'inconsistent', title: 'GLB 未被任何注册表引用', fix: '要么登记进注册表，要么删除（二选一，见附录 B）' },
  C7: { kind: 'inconsistent', title: '内嵌值与运行时配方冲突', fix: '把配方值回填 GLB（metal / rough），消除两层不一致' },
  C8: { kind: 'inconsistent', title: '角色没有可用配方', fix: '补语义角色外观或家族配方，否则该构件只能沿用内嵌色' },
  N1: { kind: 'inconsistent', title: '槽位名无语义（纯序号 / 历史遗留名）', fix: '语义由 `model-slot-roles.ts` 的 token → 角色表接管；GLB 改名前必须先迁移 `studio-external-models.ts` 里 21 处按 `material-<n>` / 原始名取色的遗留分支（柜门 shader、窗帘自发光、楼梯踏步、鞋柜台面、钢琴、NAS、电梯门板…），否则会静默丢效果' },
  N2: { kind: 'inconsistent', title: '槽位名有构件词但未登记语义（含明度候选）', fix: '登记 `model-slot-roles.ts` 的 token → 角色；或按建议改名' },
  N3: { kind: 'inconsistent', title: '槽位名前缀与 itemType 不符', fix: '改名对齐 itemType，或在注册表显式登记共享关系' },
  N4: { kind: 'inconsistent', title: '槽位名含非规范字符', fix: '统一小写字母 / 数字 / 连字符（去空格、方括号、星号、点）' },
});

/**
 * 全局项（不参与单模型 status）。
 *
 * M3 / M5 只有**退化路径**：运行时链路核验通过时根本不会产生这两项；
 * 只有对应 strategy 发现断链，才退回按模型报，并因此进入全局计数。
 */
const SYSTEMIC_RULES = new Set(['M3', 'M5']);

/* ------------------------------------------------------------------ *
 * 槽位契约：`required: false` 的槽位是「已审过的缺席构件」
 * ------------------------------------------------------------------ */

/**
 * 契约（`specs/model-slot-contracts.json`）是槽位身份的单一真值，由 `build-slot-contracts.mjs`
 * 从本脚本的报告 + GLB 几何指纹生成。这里读它只为一件事：**区分「漏绑」与「登记过的缺席」**。
 *
 * 重建器（`model-builder.mjs`）刻意原样保留源文件的 `materials` 数组 —— 运行期还有按
 * `material-<n>` 下标取色的遗留分支，删材质会让这些分支静默串色。于是新配方只绑 3–5 个
 * group 时，剩下的槽位天然没有 primitive 引用。契约把这类槽位标成 `required: false`
 * （槽位审计据此放行），C3 必须用同一口径，否则两份审计互相打架。
 */
const SLOT_CONTRACTS_PATH = path.join(
  frontendDir,
  'scripts/models/specs/model-slot-contracts.json',
);

/** modelId → Set<小写槽位名>，只收 `required === false` 的槽位。 */
const declaredAbsentSlots = new Map();
if (fs.existsSync(SLOT_CONTRACTS_PATH)) {
  try {
    const contracts = JSON.parse(fs.readFileSync(SLOT_CONTRACTS_PATH, 'utf8'));
    for (const contract of contracts.models ?? []) {
      declaredAbsentSlots.set(
        contract.id,
        new Set(
          (contract.slots ?? [])
            .filter((slot) => slot.required === false)
            .map((slot) => String(slot.name ?? '').toLowerCase()),
        ),
      );
    }
  } catch (error) {
    console.error(`✗ 槽位契约解析失败（C3 将按「全部死材质都算问题」处理）：${error.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 已审过的资源命名例外
 * ------------------------------------------------------------------ */

/**
 * 资源层（不是材质层）的例外：文件名与 itemType 对不上、或文件没有注册表引用，
 * 但**已经审过并决定保留**。命中即降级为报告注记，不参与单模型 status。
 *
 * 为什么需要这张表而不是直接放行：`C5` / `C6` 本来是用来发现「孤儿件 / 错位命名」的，
 * 一旦静默放过，真正新出现的孤儿件也会被吞掉。所以例外必须逐条带 id + 原因，
 * 新增条目要在 code review 里过一遍。
 */
const DECLARED_ASSET_EXCEPTIONS = Object.freeze({
  car: {
    kind: 'naming',
    itemType: 'smallcar',
    reason:
      '注册表 `smallcar` 的 url 指向 `car.glb`（SimLab 导出的原始名）；改名要同时动 registry url、' +
      '`model-file-names.generated.ts` 与质量基线，收益只是好看，故保持现状',
  },
  'floor-lamp': {
    kind: 'orphan',
    reason:
      '`落地灯（旧版）.glb` 是 SimLab 原模型，保留作 `compare_model_quality.mjs` ' +
      '的质量基线；不进设计目录（设计用的是 `floorlamp`），也不参与运行时加载',
  },
});

/** 取该 modelId 的已审例外（按 kind 过滤）。 */
const declaredAssetException = (modelId, kind) => {
  const entry = DECLARED_ASSET_EXCEPTIONS[modelId];
  return entry?.kind === kind ? entry : null;
};

/* ------------------------------------------------------------------ *
 * 注册表：GLB 文件 stem → itemType
 * ------------------------------------------------------------------ */

const loadModule = async (relativePath) =>
  import(pathToFileURL(path.join(frontendDir, relativePath)).href);

const [allItemModelsModule, sharedModule, rolesModule, slotRolesModule, collectionModule, modelAssetFoldersModule] =
  await Promise.all([
    loadModule('src/studio/app/3d-studio/loaders/external-models/all-item-models.ts'),
    loadModule('src/studio/app/3d-studio/loaders/external-models/_shared.ts'),
    loadModule('src/studio/app/3d-studio/materials/studio-model-material-roles.ts'),
    loadModule('src/studio/app/3d-studio/materials/model-slot-roles.ts'),
    loadModule('src/studio/app/3d-studio/loaders/external-models/collection-models.ts'),
    loadModule('src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts'),
  ]);

const { modelAssetFolderFromPath, modelAssetIdForStem } = modelAssetFoldersModule;

/* ------------------------------------------------------------------ *
 * M3 / S1：GLB 不内嵌细节图，运行时按表面族补（bumpMap）
 * ------------------------------------------------------------------ */

/**
 * 验证「细节图由运行时补齐」这条链路**当前确实成立**，而不是一句注释。
 *
 * 断点（任一断掉就退回按模型报 M3，并把断点原样写进报告）：
 * 1. 运行时表面族清单覆盖审计清单（少一族 = 有模型挂不上细节）；
 * 2. 两边的 `SURFACE_DETAIL_SCALE` 逐族相等（不一致 = 报告失真）；
 * 3. 加载器真的调用了 `ensureSceneBoxUvs`（没有 UV 的几何体没补 UV，`bumpMap` 会采样到 (0,0)）；
 * 4. 加载器真的调用了 `createSurfaceDetailTexture` / `applySurfaceDetailFinish`；
 * 5. `applySurfaceDetailFinish` **显式清空**了 `normalMap`（否则旧法线 + 新 bump 双份扰动，
 *    波浪纹会以另一条路径回来）；
 * 6. 细节走的是 `bumpMap` 而不是 `normalMap`（W 键值直接决定有没有屏幕导数滤波）。
 */
async function auditSurfaceDetailStrategy() {
  const [detailMaps, boxUv] = await Promise.all([
    loadModule('src/studio/app/3d-studio/materials/studio-surface-normal-maps.ts'),
    loadModule('src/studio/app/3d-studio/materials/studio-box-uv.ts'),
  ]);
  const runtimeScales = detailMaps.SURFACE_DETAIL_SCALE ?? {};
  const runtimeSurfaces = Object.keys(runtimeScales).sort();
  const auditSurfaces = Object.keys(DETAIL_SCALE_BY_SURFACE).sort();
  const missingInRuntime = auditSurfaces.filter((surface) => !(surface in runtimeScales));
  const extraInRuntime = runtimeSurfaces.filter((surface) => !(surface in DETAIL_SCALE_BY_SURFACE));
  const scaleDrift = auditSurfaces
    .filter((surface) => surface in runtimeScales && runtimeScales[surface] !== DETAIL_SCALE_BY_SURFACE[surface])
    .map((surface) => ({ surface, audit: DETAIL_SCALE_BY_SURFACE[surface], runtime: runtimeScales[surface] }));
  const loaderSource = fs.readFileSync(
    path.join(frontendDir, 'src/studio/app/3d-studio/loaders/studio-external-models.ts'),
    'utf8',
  );
  const wired = {
    boxUv: /(^|[^\w.])ensureSceneBoxUvs\s*\(/m.test(loaderSource),
    detailFinish: /(^|[^\w.])applySurfaceDetailFinish\s*\(/m.test(loaderSource),
    factory: typeof detailMaps.createSurfaceDetailTexture === 'function',
    legacyFactory: typeof detailMaps.createSurfaceNormalTexture === 'function',
    boxUvFactory: typeof boxUv.ensureSceneBoxUvs === 'function',
    bumpMap: /\.bumpMap\s*=/.test(loaderSource),
    bumpScale: /\.bumpScale\s*=/.test(loaderSource),
    normalMapCleared: /\.normalMap\s*=\s*null/.test(loaderSource),
  };
  const breaks = [
    ...missingInRuntime.map((surface) => `运行时缺少表面族 ${surface}`),
    ...scaleDrift.map(
      (drift) =>
        `表面族 ${drift.surface} 的 SURFACE_DETAIL_SCALE 不一致（审计 ${drift.audit} / 运行时 ${drift.runtime}）`,
    ),
    ...(wired.boxUv ? [] : ['加载器没有调用 ensureSceneBoxUvs（无 UV 模型补不了 UV）']),
    ...(wired.detailFinish ? [] : ['加载器没有调用 applySurfaceDetailFinish（细节图挂不上去）']),
    ...(wired.factory ? [] : ['studio-surface-normal-maps.ts 没有导出 createSurfaceDetailTexture']),
    ...(wired.boxUvFactory ? [] : ['studio-box-uv.ts 没有导出 ensureSceneBoxUvs']),
    ...(wired.bumpMap ? [] : ['applySurfaceDetailFinish 没有写 material.bumpMap（细节退化为无）']),
    ...(wired.bumpScale ? [] : ['applySurfaceDetailFinish 没有写 material.bumpScale（细节深度为 0）']),
    ...(wired.normalMapCleared
      ? []
      : ['applySurfaceDetailFinish 没有清空 material.normalMap（旧法线 + 新 bump 双份扰动）']),
  ];
  return {
    ready: breaks.length === 0,
    surfaces: runtimeSurfaces,
    extraInRuntime,
    scaleDrift,
    wired,
    tileMeters: detailMaps.SURFACE_TILE_METERS ?? {},
    bumpUnit: detailMaps.SURFACE_DETAIL_BUMP_UNIT ?? null,
    textureSize: detailMaps.SURFACE_DETAIL_TEXTURE_SIZE ?? null,
    maxDetailCycles: detailMaps.SURFACE_DETAIL_MAX_CYCLES ?? null,
    breaks,
  };
}

const surfaceDetailStrategy = await auditSurfaceDetailStrategy();

/**
 * M5 / S3：金属环境贴图链路核验。
 *
 * 「金属发黑」的根因是**场景没有 IBL**（没有 `scene.environment` / PMREM），
 * 而 `SURFACE_FINISH.metal` 是 `metalness 0.72`。修法是给高金属度材质挂共享程序化
 * `envMap`（`studio-metal-environment.ts`）。这里核验：
 * 1. 模块导出 `createMetalEnvironmentTexture` / `applyMetalEnvironmentFinish`；
 * 2. 加载器在材质链尾部真的调用了它；
 * 3. 贴图真的设了 `envMap` + `envMapIntensity`，且带 `homeosMetalEnvironment` 标记；
 * 4. 强度常量在 0.3–1.5（过暗等于没修，过亮金属发白）。
 */
async function auditMetalEnvironmentStrategy() {
  const metalEnvironment = await loadModule(
    'src/studio/app/3d-studio/materials/studio-metal-environment.ts',
  );
  const loaderSource = fs.readFileSync(
    path.join(frontendDir, 'src/studio/app/3d-studio/loaders/studio-external-models.ts'),
    'utf8',
  );
  const moduleSource = fs.readFileSync(
    path.join(frontendDir, 'src/studio/app/3d-studio/materials/studio-metal-environment.ts'),
    'utf8',
  );
  const intensity = metalEnvironment.METAL_ENVIRONMENT_INTENSITY;
  const minMetalness = metalEnvironment.METAL_ENVIRONMENT_MIN_METALNESS;
  const wired = {
    finish: /(^|[^\w.])applyMetalEnvironmentFinish\s*\(/m.test(loaderSource),
    factory: typeof metalEnvironment.createMetalEnvironmentTexture === 'function',
    painter: typeof metalEnvironment.paintMetalEnvironmentPixels === 'function',
    envMap: /\.envMap\s*=/.test(moduleSource),
    envMapIntensity: /\.envMapIntensity\s*=/.test(moduleSource),
    equirect: /EquirectangularReflectionMapping/.test(moduleSource),
    marker: /homeosMetalEnvironment/.test(moduleSource),
  };
  const breaks = [
    ...(wired.finish ? [] : ['加载器没有调用 applyMetalEnvironmentFinish（金属仍然没有 IBL）']),
    ...(wired.factory ? [] : ['studio-metal-environment.ts 没有导出 createMetalEnvironmentTexture']),
    ...(wired.painter ? [] : ['studio-metal-environment.ts 没有可测试的 paintMetalEnvironmentPixels']),
    ...(wired.envMap ? [] : ['applyMetalEnvironmentFinish 没有写 material.envMap']),
    ...(wired.envMapIntensity ? [] : ['applyMetalEnvironmentFinish 没有写 material.envMapIntensity']),
    ...(wired.equirect ? [] : ['环境贴图没有设 EquirectangularReflectionMapping（three 不会转 PMREM）']),
    ...(wired.marker ? [] : ['材质缺少 homeosMetalEnvironment 标记（无法审计追溯）']),
    ...(isFiniteNumber(intensity) && intensity >= 0.3 && intensity <= 1.5
      ? []
      : [`METAL_ENVIRONMENT_INTENSITY=${intensity} 不在 0.3–1.5（过暗等于没修，过亮金属发白）`]),
    ...(isFiniteNumber(minMetalness) && minMetalness === 0.5
      ? []
      : [`METAL_ENVIRONMENT_MIN_METALNESS=${minMetalness} 应为 0.5（与本规则同一口径）`]),
  ];
  return {
    ready: breaks.length === 0,
    intensity: isFiniteNumber(intensity) ? intensity : null,
    minMetalness: isFiniteNumber(minMetalness) ? minMetalness : null,
    exemptItemTypes: [...(metalEnvironment.METAL_ENVIRONMENT_EXEMPT_ITEM_TYPES ?? [])],
    wired,
    breaks,
  };
}

const metalEnvironmentStrategy = await auditMetalEnvironmentStrategy();

/**
 * M6：档位表是否把**结构 / 软装角色**刷成 `surface: "metal"`。
 *
 * `definePreset` 里已经在定义期做了一次收口（`sanitizeStructuralMetalRoles`），
 * 正常情况下本规则应为 0 命中；这里遍历同一份档位表逐条复核，任何绕过收口的写法
 * （例如直接 new 一个 preset、或改了收口词表却漏了档位）都会被抓到。
 */
async function auditPresetStructuralMetal() {
  const presetsModule = await loadModule('src/studio/app/3d-studio/materials/studio-material-presets.ts');
  const groups = presetsModule.MATERIAL_STYLE_PRESET_GROUPS ?? {};
  const structuralRoles = presetsModule.STRUCTURAL_OR_SOFT_ROLES ?? new Set();
  const presetCount = Object.values(groups).reduce((sum, presets) => sum + presets.length, 0);
  const hits = [];
  for (const [group, presets] of Object.entries(groups)) {
    for (const preset of presets) {
      for (const [role, recipe] of Object.entries(preset.roles ?? {})) {
        if (recipe?.surface !== 'metal') continue;
        if (!structuralRoles.has(role)) continue;
        hits.push({ group, preset: preset.id, role });
      }
    }
  }
  return {
    ready: hits.length === 0,
    groups: Object.keys(groups).length,
    presets: presetCount,
    structuralRoles: [...structuralRoles],
    hits,
    breaks: hits
      .slice(0, 40)
      .map((hit) => `档位 \`${hit.preset}\`（${hit.group}）把结构角色 \`${hit.role}\` 刷成了 metal`),
  };
}

const presetStructuralMetalStrategy = await auditPresetStructuralMetal();

/**
 * M7：细节贴图的**周期密度**。
 *
 * `normalMap` 时代没有屏幕导数滤波，只能靠限频压莫尔带；换成 `bumpMap` 之后
 * 条带风险大幅下降，但「一个周期只占几个纹素」仍会在缩小时丢细节、在放大时出锯齿。
 * 判据：`纹素/周期 = 纹理边长 / 每单元最高周期数`，低于 16 视为过密。
 */
function auditDetailCycleDensity() {
  const textureSize = surfaceDetailStrategy.textureSize;
  const maxCycles = surfaceDetailStrategy.maxDetailCycles;
  const tileMeters = surfaceDetailStrategy.tileMeters ?? {};
  if (!isFiniteNumber(textureSize) || !isFiniteNumber(maxCycles) || maxCycles <= 0) {
    return {
      ready: false,
      textureSize,
      maxCycles,
      texelsPerCycle: null,
      densities: [],
      breaks: ['运行时没有导出 SURFACE_DETAIL_TEXTURE_SIZE / SURFACE_DETAIL_MAX_CYCLES（无法换算周期密度）'],
    };
  }
  const texelsPerCycle = textureSize / maxCycles;
  const densities = Object.entries(tileMeters).map(([surface, tile]) => ({
    surface,
    tileMeters: tile,
    cyclesPerMeter: isFiniteNumber(tile) && tile > 0 ? round(maxCycles / tile, 2) : null,
  }));
  const breaks = [];
  if (texelsPerCycle < 16) {
    breaks.push(
      `一个细节周期只占 ${round(texelsPerCycle, 1)} 个纹素（< 16），缩小时会丢细节 / 出锯齿；降低 MAX_DETAIL_CYCLES 或提高纹理边长`,
    );
  }
  return { ready: breaks.length === 0, textureSize, maxCycles, texelsPerCycle: round(texelsPerCycle, 1), densities, breaks };
}

const detailCycleStrategy = auditDetailCycleDensity();

/**
 * 磁盘文件 → 英文模型 id。
 *
 * 目录与文件名都是中文，靠映射表反查；`folder` 也参与反查（跨分区同名不串）。
 */
function parseAssetPath(relativePath) {
  const slash = relativePath.lastIndexOf('/');
  const folderPath = slash >= 0 ? relativePath.slice(0, slash) : '';
  const fileName = relativePath.slice(slash + 1);
  const stem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '');
  const folder = folderPath ? modelAssetFolderFromPath(folderPath) : undefined;
  return {
    fileName,
    stem,
    folder,
    id: modelAssetIdForStem(stem, folder) ?? stem,
    kind: /-lite\.glb$/i.test(fileName) ? 'lite' : 'full',
    filePath: path.join(modelsDir, relativePath),
    relativePath,
  };
}

/** 英文 id → { lite, full } 的磁盘信息。 */
const modelAssetsById = new Map();
/** `sofa-lite.glb`（英文名）→ 磁盘信息；角色基线按英文名存键，改名不影响基线。 */
const assetByEnglishFileName = new Map();
for (const relativePath of listModelFiles()) {
  const asset = parseAssetPath(relativePath);
  const entry = modelAssetsById.get(asset.id) ?? {};
  entry[asset.kind] = asset;
  modelAssetsById.set(asset.id, entry);
  assetByEnglishFileName.set(
    asset.id + (asset.kind === 'lite' ? '-lite.glb' : '.glb'),
    asset,
  );
}


/**
 * 与运行时同一份判定：`true` 表示该槽位会被 `applyItemDetailMaterial` 整块重建，
 * GLB 内嵌的 `metallicFactor` / `roughnessFactor` 不会被读取，C7 不应报、也不应回填。
 */
const { materialPbrIsReplaced } = await loadModule(
  'src/studio/app/3d-studio/materials/material-pipeline.ts',
);

const {
  resolveModelMaterialRole,
  materialRoleRecipeForRole,
  resolveModelFamily,
} = rolesModule;
const { resolveSemanticSlotRole } = slotRolesModule;

/** 模型 URL → 英文模型 id（中文文件名经映射表反查）。 */
const urlAssetId = (url) => {
  const raw = String(url || '').split('?')[0];
  if (!raw) return '';
  const segments = decodeURIComponent(raw).split('/').filter(Boolean);
  const fileName = segments.pop() ?? '';
  if (!/\.glb$/i.test(fileName)) return '';
  const folder = segments.length ? modelAssetFolderFromPath(segments.slice(-2).join('/')) : undefined;
  const stem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '');
  return modelAssetIdForStem(stem, folder) ?? stem;
};

/** itemType → { url, fallbackUrl }。ALL_ITEM_MODELS 已含收藏 / approved 批。 */
const itemDefinitions = new Map();
for (const source of [sharedModule.EXTERNAL_ITEM_MODELS, allItemModelsModule.ALL_ITEM_MODELS]) {
  for (const [itemType, definition] of Object.entries(source || {})) {
    if (!definition?.url || itemDefinitions.has(itemType)) continue;
    itemDefinitions.set(itemType, definition);
  }
}

/** 文件 id → itemType[]（一个文件可能被多个 itemType 复用）。 */
const stemToItemTypes = new Map();
for (const [itemType, definition] of itemDefinitions) {
  for (const url of [definition.url, definition.fallbackUrl]) {
    const stem = urlAssetId(url);
    if (!stem) continue;
    if (!stemToItemTypes.has(stem)) stemToItemTypes.set(stem, new Set());
    stemToItemTypes.get(stem).add(itemType);
  }
}

const collectionGroups = collectionModule.COLLECTION_MODELS || {};

/**
 * 解析某 GLB 模型 id 对应的 itemType：
 * 1. 自身是注册表 itemType 且 url 指回同名文件（首选，`floorlamp` / `kitchenisland`）；
 * 2. 否则按注册表 url 反查（修 `air-outlet` → `airoutlet`、`car` → `smallcar`）；
 * 3. 都没有 → 孤儿文件。
 */
function resolveItemTypes(modelId) {
  const own = itemDefinitions.get(modelId);
  if (own && urlAssetId(own.url) === modelId) return [modelId];
  const mapped = stemToItemTypes.get(modelId);
  if (mapped?.size) return [...mapped].sort();
  return [];
}

/* ------------------------------------------------------------------ *
 * 逐材质审计
 * ------------------------------------------------------------------ */

/**
 * 审计单个 GLB 文件。
 * @returns 结构化结果，供逐模型聚合与报告渲染共用。
 */
function auditFile({ fileName, filePath }) {
  const result = {
    fileName,
    bytes: 0,
    ok: false,
    error: null,
    version: null,
    generator: null,
    extensionsUsed: [],
    materials: [],
    primitiveCount: 0,
    usedMaterialIndices: [],
    meshCount: 0,
    nodeCount: 0,
    hasUv: false,
    hasTangent: false,
    imageProblems: [],
    imageCount: 0,
    textureCount: 0,
    declaresNoMaterial: false,
  };
  let parsed;
  try {
    parsed = parseGlb(filePath);
  } catch (error) {
    result.error = error.message;
    return result;
  }
  const { gltf, version, byteLength } = parsed;
  result.ok = true;
  result.bytes = byteLength;
  result.version = version;
  result.generator = gltf.asset?.generator ?? null;
  result.extensionsUsed = [...(gltf.extensionsUsed || [])].sort();
  const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  result.meshCount = meshes.length;
  result.nodeCount = nodes.length;

  const usedIndices = new Set();
  let missingMaterialIndex = false;
  const attributes = new Set();
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives || []) {
      result.primitiveCount += 1;
      for (const key of Object.keys(primitive.attributes || {})) attributes.add(key);
      if (typeof primitive.material === 'number') usedIndices.add(primitive.material);
      else missingMaterialIndex = true;
    }
  }
  result.usedMaterialIndices = [...usedIndices].sort((a, b) => a - b);
  result.declaresNoMaterial = missingMaterialIndex;
  result.hasUv = attributes.has('TEXCOORD_0');
  result.hasTangent = attributes.has('TANGENT');

  // 贴图链路：material → texture → image → bufferView / uri。全库只有 3 个文件带图，
  // 但后面会加图集，这条链路必须能报错而不是静默降级。
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
  const bufferViews = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : [];
  result.imageCount = images.length;
  result.textureCount = textures.length;

  images.forEach((image, index) => {
    if (image.uri && !String(image.uri).startsWith('data:')) {
      const external = path.resolve(path.dirname(filePath), decodeURIComponent(String(image.uri)));
      if (!fs.existsSync(external)) {
        result.imageProblems.push({ index, problem: `外部贴图不存在：${image.uri}` });
      }
      return;
    }
    if (typeof image.bufferView === 'number') {
      const view = bufferViews[image.bufferView];
      if (!view) {
        result.imageProblems.push({ index, problem: `bufferView ${image.bufferView} 不存在` });
      } else if (!(view.byteLength > 0)) {
        result.imageProblems.push({ index, problem: `bufferView ${image.bufferView} 长度为 0` });
      }
      return;
    }
    if (!image.uri) {
      result.imageProblems.push({ index, problem: '既没有 uri 也没有 bufferView' });
    }
  });

  const textureProblem = (textureInfo) => {
    if (!textureInfo || typeof textureInfo.index !== 'number') return null;
    const texture = textures[textureInfo.index];
    if (!texture) return `texture ${textureInfo.index} 不存在`;
    if (typeof texture.source === 'number') {
      if (!images[texture.source]) return `texture ${textureInfo.index} 的 source ${texture.source} 不存在`;
      const imageProblem = result.imageProblems.find((item) => item.index === texture.source);
      if (imageProblem) return imageProblem.problem;
    }
    return null;
  };

  materials.forEach((material, index) => {
    const pbr = material.pbrMetallicRoughness || {};
    const extensions = material.extensions || {};
    const emissiveFactor = Array.isArray(material.emissiveFactor) ? material.emissiveFactor : null;
    const textureProblems = [];
    for (const [slot, info] of Object.entries({
      baseColorTexture: pbr.baseColorTexture,
      metallicRoughnessTexture: pbr.metallicRoughnessTexture,
      normalTexture: material.normalTexture,
      occlusionTexture: material.occlusionTexture,
      emissiveTexture: material.emissiveTexture,
    })) {
      const problem = textureProblem(info);
      if (problem) textureProblems.push(`${slot}: ${problem}`);
    }
    result.materials.push({
      index,
      name: material.name || `material-${index}`,
      hasPbrBlock: Boolean(material.pbrMetallicRoughness),
      baseColorFactor: Array.isArray(pbr.baseColorFactor) ? [...pbr.baseColorFactor] : null,
      baseColorFactorPresent: Array.isArray(pbr.baseColorFactor),
      baseColorTexturePresent: Boolean(pbr.baseColorTexture),
      metallicRoughnessTexturePresent: Boolean(pbr.metallicRoughnessTexture),
      normalTexturePresent: Boolean(material.normalTexture),
      occlusionTexturePresent: Boolean(material.occlusionTexture),
      emissiveTexturePresent: Boolean(material.emissiveTexture),
      roughnessFactor: isFiniteNumber(pbr.roughnessFactor) ? pbr.roughnessFactor : null,
      metallicFactor: isFiniteNumber(pbr.metallicFactor) ? pbr.metallicFactor : null,
      metallicFactorPresent: isFiniteNumber(pbr.metallicFactor),
      roughnessFactorPresent: isFiniteNumber(pbr.roughnessFactor),
      alphaMode: material.alphaMode || 'OPAQUE',
      alphaCutoff: isFiniteNumber(material.alphaCutoff) ? material.alphaCutoff : null,
      doubleSided: material.doubleSided === true,
      emissiveFactor,
      extensions: Object.keys(extensions).sort(),
      specularGlossiness: Boolean(extensions.KHR_materials_pbrSpecularGlossiness),
      textureProblems,
      used: usedIndices.has(index) || missingMaterialIndex,
    });
  });

  return result;
}

/* ------------------------------------------------------------------ *
 * 建议角色（人工校正表，只用于 C1 的修复建议）
 * ------------------------------------------------------------------ */

/**
 * 角色穿透模型的**建议语义角色**。
 *
 * 只登记 `MODEL_SLOT_ROLES_SEMANTIC` / `MODEL_ROLE_BY_MATERIAL_NAME` 尚缺的构件；
 * 取值都已在运行时验证过能解析出配方（脚本会再验一遍，解析不到会显式标注）。
 */
const SUGGESTED_ROLE_BY_MATERIAL = Object.freeze({
  'aroma-diffuser': {
    'aroma-diffuser-bottle': 'container',
    'aroma-diffuser-liquid': 'water',
    'aroma-diffuser-tube': 'trim',
    'aroma-diffuser-detail': 'base',
  },
  'bar-stool': { 'bar-stool-detail': 'metal' },
  'ceiling-fan': { 'ceiling-fan-blade': 'wood' },
  'drying-rack': { 'drying-rack-rail': 'metal', 'drying-rack-plastic': 'panel' },
  'electric-valve': {
    'valve-coupling': 'base',
    'valve-casing': 'shell',
    'valve-detail': 'trim',
  },
  'kitchen-island': {
    'kitchen-island-front': 'carcass',
    'kitchen-island-case': 'carcass',
    'kitchen-island-stone': 'countertop',
    'kitchen-island-vein': 'countertop',
    'kitchen-island-detail': 'trim',
    'kitchen-island-foliage': 'foliage',
  },
  ps5: { 'ps5-detail': 'base' },
  'side-table': { 'side-table-foot': 'leg' },
  'single-rail-rack': {
    'single-rail-rack-plastic': 'panel',
    'single-rail-rack-rail': 'metal',
  },
  'smart-display': {
    'smart-display-icon': 'indicator',
    'smart-display-ui': 'lit',
    'smart-display-speaker': 'grille',
  },
  'smart-display-wall': {
    'smart-display-icon': 'indicator',
    'smart-display-ui': 'lit',
    'smart-display-speaker': 'grille',
  },
  toilet: { 'toilet-sanitary-detail': 'metal' },
  squattoilet: { 'squattoilet-sanitary-detail': 'metal' },
  'storage-cart': { 'storage-cart-tray': 'shelf', 'storage-cart-wheel': 'metal' },
  'switch-console': {
    'switch-console-detail': 'trim',
    'switch-console-left': 'panel',
    'switch-console-right': 'accent',
  },
  'xbox-series-x': { 'xbox-series-x-detail': 'grille' },
  pillar: { 'pillar-material-0': 'body' },
  'floor-lamp': {
    'frosted-white': 'lit',
    metal_corrogated_shiny: 'metal',
    white_ppc1: 'body',
    '[<0011_seashell>]': 'trim',
    '*5': 'base',
    '[color_008]1': 'base',
  },
});

/** 材质名尾词 → 建议角色（显式表没覆盖时的兜底）。 */
const SUGGESTED_ROLE_BY_TOKEN = Object.freeze({
  bottle: 'container',
  liquid: 'water',
  rail: 'metal',
  plastic: 'panel',
  wheel: 'metal',
  blade: 'wood',
  detail: 'trim',
  coupling: 'base',
  casing: 'shell',
  stone: 'countertop',
  vein: 'countertop',
  foot: 'leg',
  speaker: 'grille',
  icon: 'indicator',
  ui: 'lit',
  left: 'panel',
  right: 'accent',
  tray: 'shelf',
  front: 'carcass',
  case: 'carcass',
});

/** 取建议角色；返回值可能为 null（无法推断）。 */
function suggestRole(itemType, materialName) {
  const lower = String(materialName || '').toLowerCase();
  const explicit = SUGGESTED_ROLE_BY_MATERIAL[itemType]?.[lower];
  if (explicit) return explicit;
  const segments = lower.split(/[-_]/).filter(Boolean);
  const token = segments[segments.length - 1];
  return SUGGESTED_ROLE_BY_TOKEN[token] ?? null;
}

/* ------------------------------------------------------------------ *
 * 槽位名称语义化
 * ------------------------------------------------------------------ */

/**
 * 槽位名分两类语义：
 * - **构件语义**（`faucet` / `countertop` / `carcass` / `cushion`）：名字直接说明这是哪个构件；
 * - **明度候选**（`body` / `dark` / `light` / `soft` / `accent`）：名字只说明“这是第几档颜色”，
 *   真实构件语义要靠 `model-slot-roles.ts` 的表还原 —— 表里没登记就会塌成家族兜底。
 *
 * 后者是 20261013 批次（110 款收藏模型）的导出习惯，本身不是错，但**语义不在名字里**，
 * 所以审计要单独标出来：能靠表还原的记 `lightness-remapped`，表里没有的记 `lightness-unmapped`。
 */
const LIGHTNESS_TOKENS = new Set(['body', 'dark', 'light', 'soft', 'accent']);

/** 已知的中缀（`<模型>-<中缀>-<token>`）：语义槽位解析器就按这些中缀切尾词。 */
const NAMING_INFIXES = Object.freeze([
  'candidate',
  'foliage',
  'sanitary',
  'detail',
  'furniture',
  'aquatic',
  'tea',
  'garden',
  'decor',
]);

/** 从 `model-slot-roles.ts` 里抽全部 token 键，作为「可反查语义 token」的候选集。 */
const slotRoleSource = fs.readFileSync(
  path.join(frontendDir, 'src/studio/app/3d-studio/materials/model-slot-roles.ts'),
  'utf8',
);
const SLOT_TOKEN_CANDIDATES = [
  ...new Set(
    [...slotRoleSource.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:\s*"[A-Za-z][A-Za-z0-9]*"/g)].map(
      (match) => match[1],
    ),
  ),
].sort();

/**
 * 合法材质名：小写字母 / 数字 / 下划线 / 连字符。
 * 允许下划线与数字开头：itemType 本身就有 `curtain_left`、`3d-printer` 这类命名，
 * 它们是对的，不该被判成「非规范字符」。真正要拦的是大写、空格、方括号、`*`、`.`。
 */
const CANONICAL_NAME_PATTERN = /^[a-z0-9][a-z0-9_]*(?:-[a-z0-9][a-z0-9_]*)*$/;

/**
 * 槽位名 → { token, infix, namingSystem }。
 * `namingSystem` 对应项目里并存的几套导出习惯，改名建议按体系给。
 */
function classifySlotName(materialName, itemType, modelId) {
  const raw = String(materialName || '');
  const lower = raw.toLowerCase();
  const infixHit = NAMING_INFIXES.map((infix) => ({
    infix,
    index: lower.lastIndexOf(`-${infix}-`),
  }))
    .filter((hit) => hit.index >= 0)
    .sort((a, b) => b.index - a.index)[0];

  const afterInfix = infixHit ? lower.slice(infixHit.index + infixHit.infix.length + 2) : lower;
  const indexOnly = afterInfix.match(/^material-(\d+)$/);
  const indexedRole = afterInfix.match(/^material-(\d+)-([a-z][a-z0-9]*)$/);
  const prefixedIndex = lower.match(/^(.+?)-material-(\d+)$/);
  const segments = afterInfix.split(/[-_]/).filter(Boolean);
  const token = indexOnly
    ? indexOnly[1]
    : prefixedIndex
      ? prefixedIndex[2]
      : indexedRole
        ? indexedRole[2]
        : segments[segments.length - 1] || lower;

  const hasModelPrefix = lower.startsWith(`${itemType.toLowerCase()}-`) || lower.startsWith(`${modelId.toLowerCase()}-`);
  let namingSystem;
  if (prefixedIndex) namingSystem = 'model-material-index';
  else if (indexOnly) namingSystem = 'material-index';
  else if (indexedRole) namingSystem = 'material-index-role';
  else if (infixHit?.infix === 'candidate') namingSystem = 'candidate';
  else if (infixHit) namingSystem = `infix-${infixHit.infix}`;
  else if (hasModelPrefix && CANONICAL_NAME_PATTERN.test(lower)) namingSystem = 'model-role';
  else if (!hasModelPrefix) namingSystem = 'legacy-foreign';
  else namingSystem = 'noncanonical';

  return { raw, lower, token, infix: infixHit?.infix ?? null, namingSystem, hasModelPrefix };
}

/**
 * 语义级别（判定依据是**运行时的实际解析来源**，不是名字里像不像构件词）：
 * - `semantic`           名字本身就解析成功（`roleSource = name`），且尾词不是明度候选；
 * - `lightness-remapped` 尾词是明度候选，但表里登记过，能还原真实构件；
 * - `lightness-unmapped` 尾词是明度候选，表里没有 → 会塌成家族兜底；
 * - `unresolved-token`   尾词是个正常的构件词，但表里没登记 → 语义存在，解析拿不到；
 * - `indexed`            只有材质序号（`material-2`）；
 * - `opaque`             尾词是序号 / 缩写 / 符号（`*5`、`003]`、`tms`），无法当 token 用。
 */
function classifySlotSemantics(slot, itemType, family, role, roleSource) {
  if (slot.namingSystem === 'material-index-role') return 'semantic';
  const isLightness = LIGHTNESS_TOKENS.has(slot.token);
  if (roleSource === 'name') return isLightness ? 'lightness-remapped' : 'semantic';
  if (slot.namingSystem === 'material-index' || slot.namingSystem === 'model-material-index') return 'indexed';
  if (isLightness) return 'lightness-unmapped';
  if (isWordToken(slot.token)) return 'unresolved-token';
  return 'opaque';
}

/** 能否直接当 token 键写进 `MODEL_SLOT_ROLES_SEMANTIC`（纯字母、长度 ≥3）。 */
function isWordToken(token) {
  return /^[a-z]{3,}$/.test(String(token || ''));
}

/**
 * 建议的语义化槽位名。
 *
 * 规则：
 * - 已经是构件语义名 → 保持；
 * - `register`（尾词是正常构件词、只是没登记）→ **名字不用改**，只补表，改 TS 即可；
 * - `rename`（尾词是序号 / 符号）→ 换成 `<itemType>-<token>`（有中缀的保留中缀），
 *   新尾词优先取「家族表里能映回同一角色」的 token，其次退回角色名（标注需登记）。
 */
function suggestSlotName({ itemType, family, slot, role, action }) {
  if (action === 'keep' || action === 'register') {
    return { names: [slot.raw], verified: true, viaToken: slot.token };
  }
  const parts = slot.infix ? `-${slot.infix}-` : '-';
  const names = [];
  // 先试「角色名」：`frame` / `panel` / `trim` 这类在 suffix 词表里，改名后能直接命中；
  // 再试「家族 token」：`dark` / `light` / `accent` 这类要经过家族表，作为兜底。
  if (role) names.push(`${itemType}${parts}${role}`);
  const familyToken = SLOT_TOKEN_CANDIDATES.find(
    (candidate) =>
      resolveSemanticSlotRole('__audit_probe__', family, `x-candidate-${candidate}`) === role,
  );
  if (familyToken) names.push(`${itemType}${parts}${familyToken}`);
  return { names: [...new Set(names)], verified: false, viaToken: familyToken ?? role ?? null };
}

/**
 * 单个槽位的语义化结论：语义级别 + 动作（keep / register / rename）。
 * 动作决定修复成本：`register` 只改 TS 表，`rename` 要改 GLB 并同步表。
 */
function analyzeSlotNaming({ itemType, family, modelId, material, role, roleSource, isOrphan }) {
  const slot = classifySlotName(material.name, itemType, modelId);
  const semantics = classifySlotSemantics(slot, itemType, family, role, roleSource);
  const suggestedRole = suggestRole(itemType, material.name);
  let action;
  if (semantics === 'semantic' || semantics === 'lightness-remapped') action = 'keep';
  else if (semantics === 'indexed' || semantics === 'opaque') action = 'rename';
  else action = 'register'; // unresolved-token / lightness-unmapped：名字里的词还能用，补表即可
  // 登记表是对的方向，孤儿文件也一样（先把 itemType 登记上，token 表才生效）；
  // 只有名字本身是序号 / 符号时才需要改名。
  if (action === 'register' && !suggestedRole) action = 'rename';
  const suggestion = suggestSlotName({ itemType, family, slot, role: suggestedRole ?? role, action });
  return {
    raw: slot.raw,
    token: slot.token,
    infix: slot.infix,
    namingSystem: slot.namingSystem,
    semantics,
    suggestedRole: suggestedRole ?? null,
    action,
    isOrphan,
    suggestedName: suggestion.names[0] ?? null,
    suggestedCandidates: suggestion.names,
    suggestedNameVerified: suggestion.verified,
    canonicalCharacters: CANONICAL_NAME_PATTERN.test(slot.lower),
  };
}

/* ------------------------------------------------------------------ *
 * 逐模型审计
 * ------------------------------------------------------------------ */

const issue = (rule, { severity = 'model', location, detail, fix, suggestion } = {}) => ({
  rule,
  kind: RULE_CATALOG[rule]?.kind ?? 'inconsistent',
  severity: SYSTEMIC_RULES.has(rule) ? 'systemic' : severity,
  location: location ?? '',
  detail: detail ?? '',
  fix: fix ?? RULE_CATALOG[rule]?.fix ?? '',
  suggestion: suggestion ?? null,
});

/** 目标（完善后）属性值：角色配方 → glTF 可写入的取值。 */
function targetOf(recipe, role) {
  if (!recipe) return null;
  const transparent = recipe.transparent === true;
  const opacity = transparent ? (isFiniteNumber(recipe.opacity) ? recipe.opacity : 0.5) : 1;
  const baseColorFactor = colorToFactor(recipe.colorValue, opacity);
  const emissiveColor = isFiniteNumber(recipe.emissiveValue) ? recipe.emissiveValue : null;
  return {
    role,
    surface: recipe.surface ?? null,
    baseColorFactor,
    baseColorHex: hexOf(recipe.colorValue),
    metallicFactor: isFiniteNumber(recipe.metalness) ? round(recipe.metalness) : null,
    roughnessFactor: isFiniteNumber(recipe.roughness) ? round(recipe.roughness) : null,
    alphaMode: transparent ? 'BLEND' : 'OPAQUE',
    opacity: round(opacity),
    emissiveFactor: emissiveColor !== null ? colorToFactor(emissiveColor, 1).slice(0, 3) : [0, 0, 0],
    emissiveHex: hexOf(emissiveColor),
    emissiveIntensity: isFiniteNumber(recipe.emissiveIntensity) ? recipe.emissiveIntensity : null,
    detailScale: recipe.surface ? (DETAIL_SCALE_BY_SURFACE[recipe.surface] ?? 0.3) : 0.3,
    doubleSided: Boolean(recipe.surface && DOUBLE_SIDED_OK_SURFACES.has(recipe.surface)),
  };
}

/** 单个材质的规则判定。 */
function auditMaterial({ material, itemType, variant, family, modelId, isOrphan }) {
  const issues = [];
  const roleResult = resolveModelMaterialRole(itemType, material.name, material.index);
  const role = roleResult.role;
  const recipe = materialRoleRecipeForRole(itemType, role, null, roleResult.slot ?? material.index);
  const target = targetOf(recipe, role);
  const location = `${variant}:${material.name}`;
  const base = material.baseColorFactor;
  const naming = analyzeSlotNaming({
    itemType,
    family,
    modelId,
    material,
    role,
    roleSource: roleResult.source,
    isOrphan,
  });

  // M1 基础色
  if (!material.baseColorFactorPresent && !material.baseColorTexturePresent) {
    issues.push(
      issue('M1', {
        location,
        detail: '`baseColorFactor` 与 `baseColorTexture` 都没有，颜色完全依赖运行时角色配方',
      }),
    );
  }

  // M2 粗糙度
  if (!material.roughnessFactorPresent && !material.metallicRoughnessTexturePresent) {
    issues.push(
      issue('M2', {
        location,
        detail: '`roughnessFactor` 缺失，glTF 默认 1.0（全哑光），与角色配方不一致',
      }),
    );
  }

  // M4 透明角色没有 alpha
  if (recipe?.transparent === true && material.alphaMode === 'OPAQUE') {
    issues.push(
      issue('M4', {
        location,
        detail: `角色 \`${role}\` 配方要求透明（opacity ${num(target?.opacity)}），但 alphaMode=OPAQUE`,
      }),
    );
  }

  // A1 越界 / 类型不符
  const rangeProblems = [];
  if (base) {
    base.forEach((component, componentIndex) => {
      if (!isFiniteNumber(component)) rangeProblems.push(`baseColorFactor[${componentIndex}] 不是数值`);
      else if (!inUnitRange(component)) rangeProblems.push(`baseColorFactor[${componentIndex}]=${component} 超出 0–1`);
    });
    if (base.length !== 4) rangeProblems.push(`baseColorFactor 长度 ${base.length}，应为 4`);
  }
  for (const [key, value] of [
    ['metallicFactor', material.metallicFactor],
    ['roughnessFactor', material.roughnessFactor],
    ['alphaCutoff', material.alphaCutoff],
  ]) {
    if (value !== null && !inUnitRange(value)) rangeProblems.push(`${key}=${value} 超出 0–1`);
  }
  if (material.emissiveFactor) {
    material.emissiveFactor.forEach((component, componentIndex) => {
      if (!inUnitRange(component)) {
        rangeProblems.push(`emissiveFactor[${componentIndex}]=${num(component, 4)} 超出 0–1`);
      }
    });
  }
  if (rangeProblems.length) {
    issues.push(issue('A1', { location, detail: rangeProblems.join('；') }));
  }

  // A2 MASK 无 alphaCutoff
  if (material.alphaMode === 'MASK' && material.alphaCutoff === null) {
    issues.push(issue('A2', { location, detail: 'alphaMode=MASK 但没有 `alphaCutoff`（规范默认 0.5，被隐式套用）' }));
  }

  // A3 非发光角色带自发光
  const emissiveNonZero = material.emissiveFactor?.some((value) => value > 0);
  if (emissiveNonZero && !EMISSIVE_ROLES.has(role)) {
    issues.push(
      issue('A3', {
        location,
        detail: `角色 \`${role}\` 不是发光角色，但 emissiveFactor=[${material.emissiveFactor
          .slice(0, 3)
          .map((value) => num(value, 3))
          .join(', ')}]，会在暗场景自亮`,
      }),
    );
  }

  // A4 OPAQUE + doubleSided
  if (material.doubleSided && material.alphaMode === 'OPAQUE') {
    const excused =
      (recipe?.surface && DOUBLE_SIDED_OK_SURFACES.has(recipe.surface)) ||
      DOUBLE_SIDED_OK_ROLE.test(role) ||
      DOUBLE_SIDED_OK_ROLE.test(String(material.name || ''));
    if (!excused) {
      issues.push(
        issue('A4', {
          location,
          detail: `alphaMode=OPAQUE 却声明 doubleSided=true（背面多一倍绘制，且无裁剪意义）`,
        }),
      );
    }
  }

  // A5 贴图不可解析
  if (material.textureProblems.length) {
    issues.push(issue('A5', { location, detail: material.textureProblems.join('；') }));
  }

  // A6 specular-glossiness 双通道
  if (material.specularGlossiness) {
    issues.push(
      issue('A6', {
        location,
        detail: '同时带 `KHR_materials_pbrSpecularGlossiness`（旧工作流残留，三.js 已弃用该扩展）',
      }),
    );
  }

  // A7 不透明角色用 BLEND
  if (material.alphaMode === 'BLEND' && recipe && recipe.transparent !== true) {
    issues.push(
      issue('A7', {
        location,
        detail: `角色 \`${role}\`（${recipe.surface ?? '未声明表面'}）不是透明材质，但 alphaMode=BLEND、alpha=${num(base?.[3])}`,
      }),
    );
  }

  // A8 alpha<1 但 OPAQUE
  if (base && isFiniteNumber(base[3]) && base[3] < 1 && material.alphaMode === 'OPAQUE') {
    issues.push(
      issue('A8', { location, detail: `baseColorFactor[3]=${num(base[3])} < 1，但 alphaMode=OPAQUE，alpha 不生效` }),
    );
  }

  // C8 配方缺失
  if (!recipe) {
    issues.push(
      issue('C8', {
        location,
        detail: `角色 \`${role}\` 解析不到任何配方（家族 / 通用 / 语义层都没有）`,
      }),
    );
  }

  // C7 内嵌值与配方冲突（只看角色能确定的情况，默认兜底由 C1 负责）
  // 会被运行时整块重建的槽位（`paletteOverrideItemTypes` / `-furniture-` 中缀等）
  // 里 GLB 数值根本不会被读，报出来只会诱导脚本去覆盖作者手调的分件粗糙度。
  if (recipe && roleResult.source !== 'default' && !materialPbrIsReplaced(itemType, material.name)) {
    const drift = [];
    if (isFiniteNumber(material.metallicFactor) && isFiniteNumber(recipe.metalness)) {
      const delta = Math.abs(material.metallicFactor - recipe.metalness);
      if (delta > 0.25) drift.push(`metallic ${num(material.metallicFactor)} vs 配方 ${num(recipe.metalness)}`);
    }
    if (isFiniteNumber(material.roughnessFactor) && isFiniteNumber(recipe.roughness)) {
      const delta = Math.abs(material.roughnessFactor - recipe.roughness);
      if (delta > 0.25) drift.push(`roughness ${num(material.roughnessFactor)} vs 配方 ${num(recipe.roughness)}`);
    }
    if (drift.length) {
      const placeholder = material.metallicFactor === 0 && material.roughnessFactor === 0.82;
      issues.push(
        issue('C7', {
          severity: placeholder ? 'systemic' : 'model',
          location,
          detail: `${drift.join('；')}${placeholder ? '（0.7.6 批次占位值 0 / 0.82）' : ''}`,
        }),
      );
    }
  }

  // ── 槽位名语义化 ────────────────────────────────────────────────
  if (naming.semantics === 'opaque') {
    issues.push(
      issue('N1', {
        location,
        detail:
          `槽位名 \`${material.name}\` 的尾词 \`${naming.token}\` 是序号 / 缩写 / 符号，不是可登记的构件词` +
          `（命名体系 \`${naming.namingSystem}\`，角色来源 ${roleResult.source}）`,
        fix: naming.suggestedName
          ? `语义已由 token 表接管；改名为 \`${naming.suggestedName}\`${
              naming.suggestedNameVerified ? '（已用运行时解析器验证可命中）' : '（需同时在 model-slot-roles.ts 登记该 token）'
            } 属于外观耦合变更：先迁移 studio-external-models.ts 里按 material-<n> 下标取色的遗留分支${
              naming.isOrphan ? '；该文件未被注册表引用，先按 C6 决定登记或删除' : ''
            }`
          : '人工确认构件后改名并登记角色',
        suggestion: naming.suggestedRole,
      }),
    );
  } else if (naming.semantics === 'indexed') {
    issues.push(
      issue('N1', {
        location,
        detail: `槽位名 \`${material.name}\` 只有材质序号，构件语义完全由下标 / 表决定`,
        fix: naming.suggestedName
          ? `语义已由 token 表接管；改名为 \`${naming.suggestedName}\`${
              naming.suggestedNameVerified ? '（已用运行时解析器验证可命中）' : '（需同时登记 token）'
            } 属于外观耦合变更：先迁移 studio-external-models.ts 里按 material-<n> 下标取色的遗留分支`
          : '人工确认构件后改名',
        suggestion: naming.suggestedRole,
      }),
    );
  } else if (
    (naming.semantics === 'unresolved-token' || naming.semantics === 'lightness-unmapped') &&
    roleResult.source !== 'default'
  ) {
    // roleSource = default 时 C1 已经报过同一条（角色塌成家族兜底），这里不再重复。
    issues.push(
      issue('N2', {
        location,
        detail:
          naming.semantics === 'unresolved-token'
            ? `槽位名 \`${material.name}\` 的尾词 \`${naming.token}\` 是正常的构件词，但表里没登记，解析落到 \`${role}\`（${roleResult.source}）`
            : `槽位名 \`${material.name}\` 的尾词 \`${naming.token}\` 只是明度候选，真实构件语义不在名字里，表里也没登记`,
        fix: `在 \`MODEL_SLOT_ROLES_SEMANTIC["${itemType}"]\` 补 \`${naming.token}: "${
          naming.suggestedRole ?? '<角色>'
        }"\`（只改 TS，名字不用动、GLB 不用重出）${
          naming.isOrphan ? '；注意该文件未被注册表引用（C6），必须先登记 itemType，否则表里写了也不生效' : ''
        }`,
        suggestion: naming.suggestedRole,
      }),
    );
  }
  if (naming.namingSystem === 'legacy-foreign' && naming.semantics !== 'opaque') {
    issues.push(
      issue('N3', {
        location,
        detail: `槽位名 \`${material.name}\` 不带 \`${itemType}-\` 前缀（共享 / 历史命名），改名会连带影响其他模型`,
        fix: '在 `model-slot-roles.ts` 的完整材质名覆盖表里登记，或确认独占后再改名',
      }),
    );
  }
  if (!naming.canonicalCharacters) {
    issues.push(
      issue('N4', {
        location,
        detail: `槽位名 \`${material.name}\` 含大写 / 空格 / 方括号 / 星号 / 点等非规范字符`,
        fix: '统一为小写字母、数字、连字符，避免纹理缓存键与角色正则失配',
      }),
    );
  }

  return {
    material,
    role,
    roleSource: roleResult.source,
    recipe,
    target,
    naming,
    issues,
  };
}

/** 审计一个模型（lite + 完整件两份变体）。 */
function auditModel(modelId) {
  const variants = [];
  const assets = modelAssetsById.get(modelId) ?? {};
  for (const kind of ['lite', 'full']) {
    const asset = assets[kind];
    if (!asset) continue;
    variants.push({ kind, fileName: asset.fileName, audit: auditFile(asset) });
  }
  const itemTypes = resolveItemTypes(modelId);
  const itemType = itemTypes[0] ?? modelId;
  const family = resolveModelFamily(itemType);
  const group = collectionGroups[itemType]?.group ?? null;
  /** 注册表没引用该文件（C6）：命名建议要让位给「先决定登记或删除」。 */
  const isOrphan = itemTypes.length === 0;

  const model = {
    id: modelId,
    itemType,
    itemTypes,
    family,
    group,
    files: variants.map(({ kind, fileName, audit }) => ({
      kind,
      fileName,
      bytes: audit.bytes,
      ok: audit.ok,
      error: audit.error,
      generator: audit.generator,
      materialCount: audit.materials.length,
      primitiveCount: audit.primitiveCount,
      hasUv: audit.hasUv,
      hasTangent: audit.hasTangent,
      textureCount: audit.textureCount,
      imageProblems: audit.imageProblems,
    })),
    status: 'ok',
    issues: [],
    materials: [],
    variants: {},
    naming: { systems: {}, semantics: {}, actions: {}, renameTargets: [] },
    counts: { missing: 0, anomaly: 0, inconsistent: 0, systemic: 0 },
    /** 契约 `required: false` 且确实没有被引用的槽位数（不计入 C3）。 */
    declaredDeadMaterials: 0,
    /** 命中 `DECLARED_ASSET_EXCEPTIONS` 时的注记（`{ kind, reason }`），不参与 status。 */
    assetException: null,
    unreadableReason: null,
  };

  const readable = variants.filter(({ audit }) => audit.ok);
  if (!readable.length) {
    model.status = 'unreadable';
    model.unreadableReason = variants.map(({ fileName, audit }) => `${fileName}: ${audit.error}`).join('；');
    return model;
  }

  // 主变体：有 lite 用 lite（运行时优先取它），否则用完整件。
  const primary = readable.find(({ kind }) => kind === 'lite') ?? readable[0];
  if (primary.audit.materials.length === 0) {
    model.status = 'no-material';
    model.unreadableReason =
      'GLB 可解析，但 materials 数组为空（几何没有绑定任何材质，颜色只能由运行时按槽位兜底）';
    return model;
  }

  // 每个变体逐材质判定
  for (const { kind, audit } of readable) {
    model.variants[kind] = {
      fileName: audit.fileName,
      materialCount: audit.materials.length,
      materials: [],
    };
    for (const material of audit.materials) {
      const row = auditMaterial({ material, itemType, variant: kind, family, modelId, isOrphan });
      model.variants[kind].materials.push({
        name: row.material.name,
        role: row.role,
        roleSource: row.roleSource,
        target: row.target,
        alphaMode: row.material.alphaMode,
        used: row.material.used,
        naming: row.naming,
      });
      if (kind !== primary.kind) continue;
      model.materials.push({
        index: row.material.index,
        name: row.material.name,
        role: row.role,
        roleSource: row.roleSource,
        surface: row.recipe?.surface ?? null,
        baseColorFactor: row.material.baseColorFactor,
        metallicFactor: row.material.metallicFactor,
        roughnessFactor: row.material.roughnessFactor,
        alphaMode: row.material.alphaMode,
        alphaCutoff: row.material.alphaCutoff,
        doubleSided: row.material.doubleSided,
        emissiveFactor: row.material.emissiveFactor,
        extensions: row.material.extensions,
        used: row.material.used,
        target: row.target,
        naming: row.naming,
      });
      for (const entry of row.issues) {
        model.issues.push(entry);
        model.counts[entry.kind] += 1;
        if (entry.severity === 'systemic') model.counts.systemic += 1;
      }
    }
  }

  const primaryMaterials = primary.audit.materials;

  // 全局项 M3：GLB **故意不内嵌**贴图，法线图由运行时按表面族补（见 `auditSurfaceDetailStrategy`）。
  // 链路成立时只记录每个模型的贴图来源，不产生问题项；链路断掉才退回按模型报 M3（回归保护）。
  const missingNormal = primaryMaterials.filter((material) => !material.normalTexturePresent).length;
  const missingOcclusion = primaryMaterials.filter((material) => !material.occlusionTexturePresent).length;
  const missingMr = primaryMaterials.filter((material) => !material.metallicRoughnessTexturePresent).length;
  model.normalMap = {
    materials: primaryMaterials.length,
    missingNormal,
    missingOcclusion,
    missingMr,
    hasTangent: primary.audit.hasTangent,
    hasUv: primary.audit.hasUv,
    source: missingNormal === 0 ? 'embedded' : surfaceDetailStrategy.ready ? 'runtime' : 'none',
  };
  if (!surfaceDetailStrategy.ready) {
    model.issues.push(
      issue('M3', {
        severity: 'systemic',
        location: `${primary.kind}:${primary.audit.fileName}`,
        detail:
          `法线贴图缺失 ${missingNormal}/${primaryMaterials.length}、遮蔽贴图缺失 ${missingOcclusion}/${primaryMaterials.length}、` +
          `金属粗糙度贴图缺失 ${missingMr}/${primaryMaterials.length}；` +
          `TANGENT ${primary.audit.hasTangent ? '有' : '无'}、TEXCOORD_0 ${primary.audit.hasUv ? '有' : '无'}；` +
          `运行时法线链路断点：${surfaceDetailStrategy.breaks.join('；')}`,
      }),
    );
    model.counts.missing += 1;
    model.counts.systemic += 1;
  }

  /**
   * 全局项 M5：**高金属度材质必须有环境贴图**（否则只反射不发光 = 黑板子）。
   *
   * 链路核验通过时不产生问题项（`source: 'runtime'`）；断链时按模型报，
   * 并把「有多少个金属材质」写进 detail，方便一屏看出回归范围。
   */
  const metalMinimum = metalEnvironmentStrategy.minMetalness ?? 0.5;
  const metallicMaterials = model.materials.filter((row) => {
    const metallic = row.target?.metallicFactor ?? row.material?.metallicFactor ?? 0;
    return isFiniteNumber(metallic) && metallic >= metalMinimum;
  });
  model.metalEnvironment = {
    materials: primaryMaterials.length,
    metallicMaterials: metallicMaterials.length,
    source:
      metallicMaterials.length === 0 ? 'none' : metalEnvironmentStrategy.ready ? 'runtime' : 'missing',
  };
  if (!metalEnvironmentStrategy.ready && metallicMaterials.length) {
    model.issues.push(
      issue('M5', {
        severity: 'systemic',
        location: `${primary.kind}:${primary.audit.fileName}`,
        detail:
          `模型有 ${metallicMaterials.length}/${primaryMaterials.length} 个材质 metalness ≥ ${metalMinimum}` +
          `（${metallicMaterials
            .slice(0, 6)
            .map((row) => `\`${row.name}\` ${num(row.target?.metallicFactor ?? row.material?.metallicFactor)}`)
            .join('、')}${metallicMaterials.length > 6 ? '…' : ''}）；` +
          `场景没有 IBL，高金属度 = 只反射不发光，屏幕上是黑板子；` +
          `金属环境链路断点：${metalEnvironmentStrategy.breaks.join('；')}`,
      }),
    );
    model.counts.missing += 1;
    model.counts.systemic += 1;
  }

  // C1 角色穿透到家族兜底
  const fallback = primaryMaterials
    .map((material, index) => ({ material, row: model.materials[index] }))
    .filter(({ row }) => row.roleSource === 'default');
  if (fallback.length) {
    for (const { material, row } of fallback) {
      const suggestion = suggestRole(itemType, material.name);
      const suggestionRecipe = suggestion ? materialRoleRecipeForRole(itemType, suggestion, null, 0) : null;
      const recipeNote = suggestion
        ? suggestionRecipe
          ? `（${suggestionRecipe.surface ?? '未声明表面'}，rough ${num(suggestionRecipe.roughness)} / metal ${num(
              suggestionRecipe.metalness,
            )}）`
          : '，但该角色还没有配方，需先补语义外观'
        : '，需人工指定角色';
      const registerHint =
        row.naming?.action === 'register' && suggestion
          ? `在 \`MODEL_SLOT_ROLES_SEMANTIC["${itemType}"]\` 补 \`${row.naming.token}: "${suggestion}"\`（名字不用动）；`
          : `建议登记 \`${material.name}\` → \`${suggestion ?? '<角色>'}\`；`;
      const suggestionNote = `${registerHint}目标角色 \`${suggestion ?? '—'}\`${recipeNote}`;
      model.issues.push(
        issue('C1', {
          location: `${primary.kind}:${material.name}`,
          detail: `角色解析落到家族默认 \`${row.role}\`（source=default），构件语义丢失`,
          fix: suggestionNote,
          suggestion,
        }),
      );
      model.counts.inconsistent += 1;
    }
  }

  // C2 全槽位同角色
  const roles = model.materials.map((row) => row.role);
  if (model.materials.length > 1 && new Set(roles).size === 1) {
    model.issues.push(
      issue('C2', {
        location: `${primary.kind}:${primary.audit.fileName}`,
        detail: `${model.materials.length} 条材质全部解析成 \`${roles[0]}\`，整件同色同表面`,
        fix: '按构件拆语义角色（见 C1 的建议角色），或确认该件本就单材质并合并几何',
      }),
    );
    model.counts.inconsistent += 1;
  }

  // C3 声明未引用的材质
  // 契约里 `required: false` 的槽位 = 已审过「本模型没有这个构件」，且重建器刻意保留
  // 材质数组，所以它们必然没有 primitive 引用 —— 这不算漏绑，只有契约没登记的死材质才报。
  const absentSlots = declaredAbsentSlots.get(modelId) ?? new Set();
  const unusedMaterials = primaryMaterials.filter((material) => !material.used);
  const unused = unusedMaterials
    .filter((material) => !absentSlots.has(String(material.name).toLowerCase()))
    .map((material) => material.name);
  const declaredDeadCount = unusedMaterials.length - unused.length;
  model.declaredDeadMaterials = declaredDeadCount;
  if (unused.length) {
    model.issues.push(
      issue('C3', {
        location: `${primary.kind}:${primary.audit.fileName}`,
        detail:
          `${unused.length} 条材质没有任何 primitive 引用：${unused.map((name) => `\`${name}\``).join('、')}` +
          (declaredDeadCount
            ? `（另 ${declaredDeadCount} 条契约已登记为缺席槽位，不计入）`
            : ''),
        fix: '删除死材质；若构件漏绑材质，把对应 primitive 的 material 指回来',
      }),
    );
    model.counts.inconsistent += 1;
  }

  // C4 lite / 完整件漂移
  const lite = variants.find(({ kind }) => kind === 'lite');
  const full = variants.find(({ kind }) => kind === 'full');
  if (lite?.audit.ok && full?.audit.ok) {
    /**
     * glTF 的缺省值必须显式归一，否则「lite 被导出器删掉默认值」会被误判成参数漂移：
     * `baseColorFactor` 缺省 `[1,1,1,1]`、`metallicFactor` / `roughnessFactor` 缺省 `1`、
     * `alphaMode` 缺省 `OPAQUE`、`doubleSided` 缺省 `false`。
     * `落地灯（旧版）` 的 `Metal_Corrogated_Shiny` 就是这样一直被报 C4 —— 两边其实一模一样。
     */
    const signature = (audit) =>
      new Map(
        audit.materials.map((material) => [
          material.name,
          JSON.stringify([
            material.baseColorFactor ?? [1, 1, 1, 1],
            material.roughnessFactor ?? 1,
            material.metallicFactor ?? 1,
            material.alphaMode ?? 'OPAQUE',
            material.doubleSided === true,
            material.emissiveFactor ?? [0, 0, 0],
          ]),
        ]),
      );
    const liteSignature = signature(lite.audit);
    const fullSignature = signature(full.audit);
    const onlyLite = [...liteSignature.keys()].filter((name) => !fullSignature.has(name));
    const onlyFull = [...fullSignature.keys()].filter((name) => !liteSignature.has(name));
    const valueDiff = [...liteSignature.keys()].filter(
      (name) => fullSignature.has(name) && liteSignature.get(name) !== fullSignature.get(name),
    );
    if (onlyLite.length || onlyFull.length || valueDiff.length) {
      const parts = [];
      if (onlyFull.length) parts.push(`完整件多出 ${onlyFull.map((name) => `\`${name}\``).join('、')}`);
      if (onlyLite.length) parts.push(`lite 多出 ${onlyLite.map((name) => `\`${name}\``).join('、')}`);
      if (valueDiff.length) parts.push(`同名材质参数不同 ${valueDiff.map((name) => `\`${name}\``).join('、')}`);
      model.issues.push(
        issue('C4', {
          location: `${lite.fileName} ↔ ${full.fileName}`,
          detail: parts.join('；'),
          fix: '用同一份导出配置重出两份；运行时优先取 lite，缺的槽位在 lite 里会直接消失',
        }),
      );
      model.counts.inconsistent += 1;
    }
  }

  // C5 文件名与 itemType 不一致 / C6 孤儿件
  // 已审过的资源例外（`DECLARED_ASSET_EXCEPTIONS`）不参与 status，只进报告注记。
  const orphanException = declaredAssetException(modelId, 'orphan');
  const namingException = declaredAssetException(modelId, 'naming');
  if (!itemTypes.length) {
    if (orphanException) {
      model.assetException = { kind: 'orphan', reason: orphanException.reason };
    } else {
      model.issues.push(
        issue('C6', {
          location: model.files.map(({ fileName }) => fileName).join('、'),
          detail: '没有任何注册表（ALL_ITEM_MODELS / EXTERNAL_ITEM_MODELS）的 url 指向该文件',
          fix: '二选一：① 登记进注册表并接上目录；② 确认是历史遗留件后删除（见附录 B 的最小修复步骤）',
        }),
      );
      model.counts.inconsistent += 1;
    }
  } else if (itemType !== modelId) {
    /**
     * 只差 `-` / `_` 风格（`air-outlet` ↔ `airoutlet`）：机械等价，注册表 url 与磁盘反查
     * 都能对上，属于**命名等价别名**，不进不一致，但逐个列进报告（附录 B）留痕。
     * 真正不同名的错位（`car` ↔ `smallcar`）仍按模型级 C5 报。
     */
    const normalizedEqual = itemType.replace(/[-_]/g, '') === modelId.replace(/[-_]/g, '');
    if (namingException && namingException.itemType === itemType) {
      model.assetException = { kind: 'naming', reason: namingException.reason };
    } else if (normalizedEqual) {
      model.namingAlias = { itemType, file: `${modelId}.glb`, reason: '连字符 / 下划线风格不同，规范化后同名' };
    } else {
      model.issues.push(
        issue('C5', {
          severity: 'model',
          location: `${modelId}.glb → itemType \`${itemType}\``,
          detail: '文件名与 itemType 不是同一套命名（靠注册表 url 才指对，改文件名会连带断链）',
          fix: '在注册表里显式登记别名（DECLARED_ASSET_EXCEPTIONS），或统一命名后再改 url',
        }),
      );
      model.counts.inconsistent += 1;
    }
  }

  // 模型级贴图问题（image chunk 损坏 / 外部文件丢失）
  for (const { kind, audit } of readable) {
    if (audit.imageProblems.length) {
      model.issues.push(
        issue('A5', {
          location: `${kind}:${audit.fileName}`,
          detail: audit.imageProblems.map((item) => `image[${item.index}] ${item.problem}`).join('；'),
        }),
      );
      model.counts.anomaly += 1;
    }
  }

  // 槽位名语义化汇总（主变体）
  // 先给建议名去重（同一模型里 `[Color_003]` 与 `[Color_001]` 可能都映射到 `panel`），
  // 再用**真实解析器**验证新名字是否真的能解析回目标角色 —— 这是“改名会不会失效”的唯一判据。
  const naming = { systems: {}, semantics: {}, actions: {}, renameTargets: [] };
  const occupiedNames = new Set(
    model.materials.filter((row) => row.naming.action === 'keep').map((row) => row.naming.raw),
  );
  for (const row of model.materials) {
    const info = row.naming;
    if (info.action === 'keep') continue;
    if (info.action === 'register') {
      // 登记表：名字不动，补 `token → 角色` 即可
      info.suggestedName = info.raw;
      info.suggestedNameVerified = true;
      continue;
    }
    const candidates = info.suggestedCandidates?.length
      ? info.suggestedCandidates
      : [`${itemType}-${info.token}`];
    let chosen = null;
    for (const candidate of candidates) {
      let unique = candidate;
      let suffix = 2;
      while (occupiedNames.has(unique)) {
        unique = `${candidate}-${suffix}`;
        suffix += 1;
      }
      const resolved = resolveModelMaterialRole(itemType, unique, row.index ?? 0);
      if (resolved.role === (info.suggestedRole ?? row.role) && resolved.source === 'name') {
        chosen = { name: unique, verified: true };
        break;
      }
      chosen ??= { name: unique, verified: false };
    }
    if (!chosen || chosen.name === info.raw) {
      // 名字本来就是这个语义 token（只是没登记），改名无意义 → 回到登记表路线
      info.action = 'register';
      info.suggestedName = info.raw;
      info.suggestedNameVerified = true;
      continue;
    }
    occupiedNames.add(chosen.name);
    info.suggestedName = chosen.name;
    info.suggestedNameVerified = chosen.verified;
  }
  for (const row of model.materials) {
    const info = row.naming;
    naming.systems[info.namingSystem] = (naming.systems[info.namingSystem] ?? 0) + 1;
    naming.semantics[info.semantics] = (naming.semantics[info.semantics] ?? 0) + 1;
    naming.actions[info.action] = (naming.actions[info.action] ?? 0) + 1;
    if (info.action !== 'keep') {
      naming.renameTargets.push({
        from: info.raw,
        to: info.suggestedName,
        action: info.action,
        role: info.suggestedRole ?? row.role,
        verified: info.suggestedNameVerified,
        semantics: info.semantics,
        token: info.token,
      });
    }
  }
  model.naming = naming;

  const blocking = model.issues.filter((entry) => entry.severity === 'model');
  model.status = blocking.length ? 'issues' : 'ok';
  return model;
}

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */

const allFiles = listModelFiles().map((relativePath) => path.basename(relativePath));
const modelIds = [...modelAssetsById.keys()].sort();

const models = modelIds.map(auditModel);

/* ------------------------------------------------------------------ *
 * 角色快照（`--write-role-baseline` 写、`--check` 比）
 *
 * 只比「(文件, 槽位下标) → 解析出的角色」，不比对槽位名：
 * - 目的是守住「重导出 GLB 导致 primitive 下标位移」和「误改 token 表导致角色漂移」；
 * - 故意把名字移出指纹，改名（N1）只要解析结果不变就能通过；
 * - 任何刻意的角色调整，都要重跑 `--write-role-baseline` 并 review diff。
 *
 * 比对**只在 `--check` 里做**：此前还有一个独立的 `--check-roles` 模式，与 `--check` 的
 * 角色段完全重复（同样的 roleDrift / roleBaselineMissing，只是错误条数上限不同）。`--check`
 * 已经覆盖它，多一个模式只意味着多一条没人调用的分支，故删除。
 * ------------------------------------------------------------------ */
const ROLE_BASELINE_PATH = path.join(hereDir, 'material-role-baseline.json');

/** 当前解析结果：`{ "<英文 id>.glb": ["body", "panel", ...] }`，数组下标 = 材质下标。 */
const roleSnapshot = {};
for (const model of models) {
  for (const [kind, variant] of Object.entries(model.variants || {})) {
    if (!variant?.materials?.length) continue;
    // 键沿用**英文 id**（与基线一致）：中文文件名只是磁盘表现，不该让基线整份重写。
    roleSnapshot[`${model.id}${kind === 'lite' ? '-lite' : ''}.glb`] = variant.materials.map(
      (entry) => entry.role ?? null,
    );
  }
}

function diffRoleSnapshot(baselineFiles, currentFiles) {
  const drift = [];
  for (const fileName of Object.keys(baselineFiles).sort()) {
    const before = baselineFiles[fileName];
    const after = currentFiles[fileName];
    if (!after) {
      drift.push({ fileName, index: null, before: `${before.length} 条角色`, after: '文件缺失 / 不可解析' });
      continue;
    }
    const file =
      assetByEnglishFileName.get(fileName)?.filePath ?? path.join(modelsDir, fileName);
    const names = (() => {
      try {
        return parseGlb(file).gltf.materials?.map((entry) => entry.name ?? '') ?? [];
      } catch {
        return [];
      }
    })();
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      if (before[index] === after[index]) continue;
      drift.push({
        fileName,
        index,
        name: names[index] ?? '',
        before: before[index] ?? '（无此槽位）',
        after: after[index] ?? '（无此槽位）',
      });
    }
  }
  for (const fileName of Object.keys(currentFiles).sort()) {
    if (baselineFiles[fileName]) continue;
    drift.push({
      fileName,
      index: null,
      before: '基线里没有',
      after: `${currentFiles[fileName].length} 条角色`,
    });
  }
  return drift;
}

let roleDrift = null;
let roleBaselineMissing = false;
if (fs.existsSync(ROLE_BASELINE_PATH)) {
  try {
    const baseline = JSON.parse(fs.readFileSync(ROLE_BASELINE_PATH, 'utf8'));
    roleDrift = diffRoleSnapshot(baseline.files || {}, roleSnapshot);
  } catch (error) {
    console.error(`✗ 角色基线 ${path.relative(repoRoot, ROLE_BASELINE_PATH)} 解析失败：${error.message}`);
    if (checkMode) process.exit(1);
  }
} else {
  roleBaselineMissing = true;
}

const summary = {
  generatedAt: new Date().toISOString(),
  modelsDir: path.relative(repoRoot, modelsDir),
  fileCount: allFiles.length,
  modelCount: modelIds.length,
  materialCount: models.reduce(
    (sum, model) => sum + (model.variants.lite?.materialCount ?? model.variants.full?.materialCount ?? 0),
    0,
  ),
  materialCountAllFiles: models.reduce(
    (sum, model) => sum + model.files.reduce((filesSum, file) => filesSum + file.materialCount, 0),
    0,
  ),
  statusCounts: {},
  kindCounts: { missing: 0, anomaly: 0, inconsistent: 0 },
  systemicCounts: { missing: 0, anomaly: 0, inconsistent: 0 },
  ruleCounts: {},
  naming: { systems: {}, semantics: {}, actions: {} },
  fileStatus: { ok: 0, unreadable: 0 },
};

for (const model of models) summary.statusCounts[model.status] = (summary.statusCounts[model.status] ?? 0) + 1;
for (const model of models) {
  for (const [key, value] of Object.entries(model.naming.systems)) {
    summary.naming.systems[key] = (summary.naming.systems[key] ?? 0) + value;
  }
  for (const [key, value] of Object.entries(model.naming.semantics)) {
    summary.naming.semantics[key] = (summary.naming.semantics[key] ?? 0) + value;
  }
  for (const [key, value] of Object.entries(model.naming.actions)) {
    summary.naming.actions[key] = (summary.naming.actions[key] ?? 0) + value;
  }
}
for (const model of models) {
  for (const entry of model.issues) {
    const bucket = entry.severity === 'systemic' ? summary.systemicCounts : summary.kindCounts;
    bucket[entry.kind] += 1;
    summary.ruleCounts[entry.rule] = (summary.ruleCounts[entry.rule] ?? 0) + 1;
  }
}
for (const model of models) {
  for (const file of model.files) {
    if (file.ok) summary.fileStatus.ok += 1;
    else summary.fileStatus.unreadable += 1;
  }
}
/** 契约登记为缺席（`required: false`）且确实没被引用的槽位数：解释 C3 为何是 0。 */
summary.declaredDeadMaterials = models.reduce((sum, model) => sum + (model.declaredDeadMaterials ?? 0), 0);
/** 命中已审资源例外的模型（C5 / C6 不计入 status，但必须在报告里留痕）。 */
summary.assetExceptions = models
  .filter((model) => model.assetException)
  .map((model) => ({ id: model.id, itemType: model.itemType, ...model.assetException }));

/** 命名等价别名（只差 `-` / `_`）：机械等价，不进不一致，逐个列进附录 B。 */
summary.namingAliases = models
  .filter((model) => model.namingAlias)
  .map((model) => ({ id: model.id, itemType: model.itemType, ...model.namingAlias }));

/**
 * M3 / S1：细节（bump）链路核验结果 + 贴图来源分布。
 *
 * `note` 是给报告用的「已落实策略」段：链路成立时全库都走运行时细节，
 * 只有 `embedded > 0` 的模型才真的自带贴图。
 */
summary.surfaceDetailStrategy = {
  ...surfaceDetailStrategy,
  embedded: models.filter((model) => model.normalMap?.source === 'embedded').length,
  runtime: models.filter((model) => model.normalMap?.source === 'runtime').length,
  none: models.filter((model) => model.normalMap?.source === 'none').length,
  withoutUv: models.filter((model) => model.normalMap && !model.normalMap.hasUv).length,
};

/** M5 / S3：金属环境贴图链路 + 运行覆盖面（有多少模型真的有金属件）。 */
summary.metalEnvironmentStrategy = {
  ...metalEnvironmentStrategy,
  runtime: models.filter((model) => model.metalEnvironment?.source === 'runtime').length,
  missing: models.filter((model) => model.metalEnvironment?.source === 'missing').length,
  withoutMetal: models.filter((model) => model.metalEnvironment?.source === 'none').length,
  metallicMaterialCount: models.reduce(
    (sum, model) => sum + (model.metalEnvironment?.metallicMaterials ?? 0),
    0,
  ),
};

/** M6：档位把结构 / 软装角色刷成金属的复核结果（正常应为 0 命中）。 */
summary.presetStructuralMetalStrategy = presetStructuralMetalStrategy;

/** M7：细节贴图的周期密度（纹素 / 周期）。 */
summary.detailCycleStrategy = detailCycleStrategy;

/* ------------------------------------------------------------------ *
 * 报告渲染
 * ------------------------------------------------------------------ */

const FAMILY_ORDER = [
  'joinery',
  'woodwork',
  'upholstery',
  'rug',
  'ceramic',
  'appliance',
  'device',
  'media',
  'tableware',
  'lamp',
  'stair',
  'vehicle',
  'door',
  'tea',
  'garden',
  'plant',
  'decor',
  'pillar',
  'curtain',
  'fitness',
  'kids',
  'pet',
  'furniture',
  'structure',
  'misc',
];

const FAMILY_LABEL = {
  joinery: '柜体 / 木作柜类',
  woodwork: '木器家具',
  upholstery: '软装（沙发 / 椅 / 床）',
  rug: '地毯',
  ceramic: '卫浴 / 洁具',
  appliance: '家电整机',
  device: '数码 / 办公',
  media: '影音 / 媒体',
  tableware: '厨具器物',
  lamp: '灯具',
  stair: '楼梯',
  vehicle: '车辆',
  door: '门 / 门套',
  tea: '茶台组合',
  garden: '庭院 / 绿化',
  plant: '室内绿植 / 花艺',
  decor: '摆件',
  pillar: '柱',
  curtain: '窗帘',
  fitness: '健身器械',
  kids: '儿童',
  pet: '宠物',
  furniture: '家具通用件',
  structure: '结构件',
  misc: '未归族 / 混合',
};

const STATUS_LABEL = {
  ok: '通过（仅受全局项影响）',
  issues: '有问题项',
  'no-material': '无材质数据',
  unreadable: '无法读取',
};

const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|');
const code = (value) => `\`${escapeCell(value)}\``;

function renderTargetTable(model) {
  const rows = model.materials.map((material) => {
    const target = material.target;
    if (!target) {
      return `| ${code(material.name)} | — | — | — | — | — | — | — |`;
    }
    const factor = target.baseColorFactor
      ? `[${target.baseColorFactor.map((value) => num(value, 4)).join(', ')}]`
      : '—';
    const alpha =
      target.alphaMode === 'BLEND' ? `BLEND / ${num(target.opacity, 3)}` : target.alphaMode;
    const emissive =
      target.emissiveHex && target.emissiveFactor.some((value) => value > 0)
        ? `${target.emissiveHex}${target.emissiveIntensity !== null ? ` ×${num(target.emissiveIntensity, 2)}` : ''}`
        : '—';
    return `| ${code(material.name)} | ${code(target.role)} | ${target.baseColorHex} ${factor} | ${num(
      target.metallicFactor,
    )} | ${num(target.roughnessFactor)} | ${alpha} | ${emissive} | ${num(target.detailScale, 2)} |`;
  });
  return [
    '| 材质 | 角色 | baseColorFactor（hex + 0–1） | metallicFactor | roughnessFactor | alphaMode / opacity | emissive | 细节强度 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderModelSection(model) {
  const lines = [];
  const filesLabel = model.files
    .map((file) => `${file.kind === 'lite' ? 'lite' : '完整件'} ${code(file.fileName)}（${file.materialCount} 条材质）`)
    .join(' + ');
  lines.push(`#### ${code(model.id)}`);
  lines.push('');
  lines.push(
    `1. **模型名称**：${code(model.id)} ｜ itemType ${code(model.itemType)}${
      model.itemTypes.length > 1 ? `（另见 ${model.itemTypes.slice(1).map(code).join('、')}）` : ''
    } ｜ 材质家族 ${code(model.family)}（${FAMILY_LABEL[model.family] ?? '未标注'}）${
      model.group ? ` ｜ 目录分组 ${code(model.group)}` : ''
    } ｜ 文件 ${filesLabel}`,
  );
  lines.push('');

  if (model.status === 'unreadable' || model.status === 'no-material') {
    lines.push('2. **问题项**：');
    lines.push('');
    lines.push(`   - [缺失] 无法取得材质属性：${model.unreadableReason}`);
    lines.push('');
    lines.push('3. **修复建议**：');
    lines.push('');
    lines.push('   - 缺失原因：' + (model.status === 'unreadable' ? 'GLB 无法解析（截断 / 头部损坏 / 非 glTF）' : 'GLB 内没有 materials，几何未绑定材质'));
    lines.push('   - 最小修复步骤：① 用导出脚本重出该模型（保留材质槽位名）；② 或按下方最小属性集手工补一份材质并绑到 primitive。');
    lines.push('   - 建议补齐的最小属性集：`baseColorFactor` / `metallicFactor` / `roughnessFactor` / `alphaMode`，见第 4 项。');
    lines.push('');
    lines.push('4. **完善后的属性值**：按 PBR 默认集给最小可用值：');
    lines.push('');
    lines.push('| 材质 | 角色 | baseColorFactor | metallicFactor | roughnessFactor | alphaMode / opacity |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    lines.push('| `（新增）body` | `body` | #7D8089 [0.4902, 0.5020, 0.5373, 1] | 0 | 0.55 | OPAQUE |');
    lines.push('');
    return lines;
  }

  // 2. 问题项
  lines.push('2. **问题项**：');
  lines.push('');
  if (!model.issues.length) {
    lines.push('   - 无。');
  } else {
    for (const entry of model.issues) {
      const tag = entry.severity === 'systemic' ? `${RULE_LABEL[entry.kind]}·全局` : RULE_LABEL[entry.kind];
      lines.push(`   - **[${tag}] ${entry.rule} ${RULE_CATALOG[entry.rule]?.title ?? ''}** — ${entry.location}`);
      lines.push(`     - 现状：${entry.detail}`);
      if (entry.suggestion) lines.push(`     - 推断：建议角色 ${code(entry.suggestion)}`);
    }
  }
  if (model.assetException) {
    lines.push(
      `   - **[已审例外] ${model.assetException.kind === 'orphan' ? 'C6 孤儿件' : 'C5 命名错位'}** — ${code(model.id)}`,
    );
    lines.push(`     - 保留原因：${model.assetException.reason}`);
  }
  if (model.declaredDeadMaterials) {
    lines.push(
      `   - **[契约登记] ${model.declaredDeadMaterials} 条槽位标记为缺席（\`required: false\`）**，未绑 primitive 属预期，不计入 C3。`,
    );
  }
  lines.push('');

  // 3. 修复建议
  lines.push('3. **修复建议**：');
  lines.push('');
  if (!model.issues.length) {
    lines.push(
      '   - 无需修复。细节通道由运行时按表面族补齐（S1，见附录 A，`bumpMap`）：' +
        (model.normalMap?.source === 'embedded'
          ? '本模型自带 `normalTexture`，运行时不再覆盖。'
          : `本模型 GLB 不内嵌细节图，加载期挂共享高度图（bumpMap，${model.normalMap?.hasUv ? '自带 UV' : '盒式补 UV'}）。`),
    );
  } else {
    const seen = new Set();
    for (const entry of model.issues) {
      const key = `${entry.rule}|${entry.fix}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`   - ${entry.rule} → ${entry.fix}`);
    }
  }
  lines.push('');

  // 4. 完善后的属性值
  lines.push('4. **完善后的属性值**（运行时角色配方解析，默认主题配色；粗糙度 / 金属度 / 透明度为稳定真值）：');
  lines.push('');
  lines.push(renderTargetTable(model));
  lines.push('');
  const roleChanges = model.issues.filter((entry) => entry.rule === 'C1' && entry.suggestion).length;
  if (roleChanges) {
    lines.push(
      `> 上表只改「当前能解析到的角色」的目标值；${roleChanges} 条 C1 材质在补登记语义角色后，目标值会随新角色变化（见第 3 项）。`,
    );
    lines.push('');
  }
  lines.push(renderSlotNamingTable(model));
  return lines;
}

const SEMANTICS_LABEL = {
  semantic: '构件语义',
  'lightness-remapped': '明度候选（已还原）',
  'lightness-unmapped': '明度候选（未登记）',
  'unresolved-token': '构件词（未登记）',
  indexed: '仅序号',
  opaque: '无语义',
};

const ACTION_LABEL = {
  keep: '保持',
  register: '登记表',
  rename: '改名',
};

const NAMING_SYSTEM_LABEL = {
  candidate: '`<模型>-candidate-<token>`',
  'material-index': '`material-<n>`',
  'model-material-index': '`<模型>-material-<n>`',
  'material-index-role': '`material-<n>-<role>`',
  'model-role': '`<模型>-<角色>`',
  'legacy-foreign': '历史遗留名',
  noncanonical: '非规范分隔符',
  'infix-furniture': '`<模型>-furniture-<token>`',
  'infix-detail': '`<模型>-detail-<token>`',
  'infix-sanitary': '`<模型>-sanitary-<token>`',
  'infix-foliage': '`<模型>-foliage-<token>`',
  'infix-aquatic': '`<模型>-aquatic-<token>`',
  'infix-tea': '`<模型>-tea-<token>`',
  'infix-garden': '`<模型>-garden-<token>`',
  'infix-decor': '`<模型>-decor-<token>`',
};

const NAMING_SYSTEM_NOTE = {
  candidate: '批量导出（110 款收藏）的明度候选槽位，语义全靠表',
  'material-index': '只有序号，语义靠 `MODEL_MATERIAL_ORDER_ROLES` 或下标猜',
  'model-material-index': '模型名 + 纯序号，导出器没带材质名，语义只能靠槽位顺序表',
  'material-index-role': '序号 + 角色，语义明确',
  'model-role': '模型名 + 角色，语义明确',
  'legacy-foreign': '不带模型前缀的历史名（`*5`、`om.cn_1342` 等）',
  noncanonical: '含大写 / 空格 / 方括号 / 星号，正则与缓存键易失配',
  'infix-garden': '园艺批次的槽位名，token 覆盖 base/leaf/water/dark',
  'infix-furniture': '家具批次的槽位名，token 覆盖 frame/fabric/surface',
  'infix-detail': '电器批次的槽位名，token 覆盖 body/dark/soft/light',
  'infix-foliage': '绿植批次的槽位名，token 覆盖 leaf/pot/soil',
  'infix-aquatic': '水族批次的槽位名，token 覆盖 water/glass/base',
  'infix-sanitary': '卫浴批次的槽位名，token 覆盖 ceramic/seat/trim',
  'infix-tea': '茶室批次的槽位名',
  'infix-decor': '装饰批次的槽位名',
};

const SEMANTICS_NOTE = {
  semantic: '尾词即构件 / 材质语义，解析不依赖表',
  'lightness-remapped': '尾词是明度候选，表里已登记，当前出图正确',
  'lightness-unmapped': '尾词是明度候选且未登记，会塌成家族兜底',
  'unresolved-token': '尾词是正常构件词，但表里没登记，解析拿不到',
  indexed: '只有材质序号，无语义',
  opaque: '尾词是序号 / 缩写 / 符号，无法当 token 用',
};

/**
 * 槽位名语义化对照表（每个模型一张）。
 *
 * 语义化的目标不是「把名字改好看」，而是**让角色解析不依赖表**：名字里的 token 落在
 * `model-slot-roles.ts` 的 token 表里（家族级或模型级）就能直接还原本构件；名字是
 * `*5` / `[Color_008]1` / `om.cn_1342` 这类时，只能靠 `MODEL_MATERIAL_ORDER_ROLES`
 * 的下标顺序猜，一换导出顺序就失配。
 */
function renderSlotNamingTable(model) {
  if (!model.materials.length) return '';
  const lines = [];
  const systems = Object.entries(model.naming.systems)
    .map(([key, value]) => `${NAMING_SYSTEM_LABEL[key] ?? key} ×${value}`)
    .join('、');
  lines.push(
    `**槽位名语义化**（命名体系：${systems || '—'}；语义级别：${Object.entries(model.naming.semantics)
      .map(([key, value]) => `${SEMANTICS_LABEL[key] ?? key} ×${value}`)
      .join('、')}）：`,
  );
  lines.push('');
  lines.push(
    '| 原槽位名 | 槽位 token | 命名体系 | 语义级别 | 解析角色 | 解析来源 | 动作 | 建议槽位名 |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const material of model.materials) {
    const naming = material.naming;
    const action = ACTION_LABEL[naming.action] ?? naming.action;
    const actionDetail =
      naming.action === 'register'
        ? `${action} → ${code(naming.suggestedRole ?? '待定')}`
        : naming.action === 'rename'
          ? action
          : action;
    lines.push(
      `| ${code(naming.raw)} | ${code(naming.token)} | ${NAMING_SYSTEM_LABEL[naming.namingSystem] ?? naming.namingSystem} | ${
        SEMANTICS_LABEL[naming.semantics] ?? naming.semantics
      } | ${code(material.role)} | ${material.roleSource} | ${actionDetail} | ${
        naming.action === 'keep' ? '（不变）' : `${code(naming.suggestedName ?? '—')}${naming.suggestedNameVerified ? '' : ' ⚠需登记'}`
      } |`,
    );
  }
  lines.push('');
  const renameCount = model.naming.renameTargets.length;
  if (renameCount) {
    const registerCount = model.naming.renameTargets.filter((target) => target.action === 'register').length;
    const renameOnly = model.naming.renameTargets.filter((target) => target.action === 'rename').length;
    const parts = [];
    if (registerCount) parts.push(`登记表 ${registerCount} 个（只改 TS、不动 GLB）`);
    if (renameOnly) parts.push(`改名 ${renameOnly} 个（需重出 GLB 并同步 \`MODEL_ROLE_BY_MATERIAL_NAME\` / \`MODEL_SLOT_ROLES_SEMANTIC\`）`);
    lines.push(`> 该模型有 ${renameCount} 个槽位建议调整：${parts.join('；')}。`);
    lines.push('');
  }
  return lines.join('\n');
}

const RULE_LABEL = { missing: '缺失', anomaly: '异常', inconsistent: '不一致' };

function renderReport() {
  const lines = [];
  const s = summary;
  lines.push('# GLB 材质属性审计与修复方案');
  lines.push('');
  lines.push(`> 生成时间：${s.generatedAt}`);
  lines.push('> 生成方式：`bun ops/checks/studio/audit_glb_materials.mjs`（只读，未修改任何 GLB 字节）');
  lines.push(`> 审计范围：\`${s.modelsDir}\``);
  lines.push('');
  lines.push('## 0. 覆盖与处理状态');
  lines.push('');
  lines.push('| 项目 | 数量 |');
  lines.push('| --- | --- |');
  lines.push(`| GLB 文件 | ${s.fileCount}（可解析 ${s.fileStatus.ok} / 无法解析 ${s.fileStatus.unreadable}）|`);
  lines.push(`| 模型（含 lite 与完整件归并） | ${s.modelCount} |`);
  lines.push(`| 材质（按运行时优先变体计） | ${s.materialCount} |`);
  lines.push(`| 材质（全部文件累加） | ${s.materialCountAllFiles} |`);
  lines.push(
    `| 契约登记的缺席槽位（\`required: false\`，未绑 primitive 属预期） | ${s.declaredDeadMaterials ?? 0} |`,
  );
  lines.push(`| 已审资源例外（C5 / C6 不计入 status） | ${s.assetExceptions?.length ?? 0} |`);
  lines.push(
    `| 法线图来源（M3 / S1） | 运行时 ${s.surfaceDetailStrategy.runtime} / 内嵌 ${s.surfaceDetailStrategy.embedded} / 无 ` +
      `${s.surfaceDetailStrategy.none}（链路 ${s.surfaceDetailStrategy.ready ? '✓ 已核验' : '✗ 断链'}） |`,
  );
  lines.push(
    `| 金属环境贴图（M5 / S5） | 运行时 ${s.metalEnvironmentStrategy.runtime} / 无金属件 ${s.metalEnvironmentStrategy.withoutMetal} / 断链 ${s.metalEnvironmentStrategy.missing}` +
      `（金属材质 ${s.metalEnvironmentStrategy.metallicMaterialCount} 条，链路 ${s.metalEnvironmentStrategy.ready ? '✓ 已核验' : '✗ 断链'}） |`,
  );
  lines.push(
    `| 档位结构件金属化（M6 / S6） | ${s.presetStructuralMetalStrategy.hits.length} 处命中` +
      `（遍历 ${s.presetStructuralMetalStrategy.presets} 个档位 / 守卫 ${s.presetStructuralMetalStrategy.structuralRoles.length} 个角色） |`,
  );
  lines.push(
    `| 细节周期密度（M7 / S7） | ${s.detailCycleStrategy.texelsPerCycle ?? '—'} 纹素 / 周期` +
      `（${s.detailCycleStrategy.ready ? '✓ ≥ 16' : '✗ 过密'}） |`,
  );
  lines.push(`| 命名等价别名（C5，不计入不一致） | ${s.namingAliases?.length ?? 0} |`);
  lines.push(
    `| 槽位名语义化 | 构件语义 ${s.naming.semantics.semantic ?? 0}、明度候选已还原 ${
      s.naming.semantics['lightness-remapped'] ?? 0
    }、构件词未登记 ${s.naming.semantics['unresolved-token'] ?? 0}、仅序号 ${
      s.naming.semantics.indexed ?? 0
    }、无语义 ${s.naming.semantics.opaque ?? 0} |`,
  );
  lines.push(
    `| 槽位处理动作 | 保持 ${s.naming.actions.keep ?? 0}、登记表 ${s.naming.actions.register ?? 0}、改名 ${
      s.naming.actions.rename ?? 0
    } |`,
  );
  for (const status of ['ok', 'issues', 'no-material', 'unreadable']) {
    lines.push(`| 状态 ${STATUS_LABEL[status]} | ${s.statusCounts[status] ?? 0} |`);
  }
  lines.push('');
  lines.push('状态判定：`ok` = 没有单模型级问题（全局项不算）；`issues` = 至少一条单模型级缺失/异常/不一致；`no-material` / `unreadable` = 见附录 B。');
  lines.push('');
  lines.push('## 1. 判定标准与真值口径');
  lines.push('');
  lines.push('**判定标准**：');
  lines.push('');
  lines.push('- **缺失（missing）**：必需材质通道或必备属性未配置。PBR 模型至少需要基础色（`baseColorFactor`/`baseColorTexture`）、金属度、粗糙度、法线；透明材质还需要 opacity / alpha；非 PBR 模型按其所用体系（本库有 17 个文件残留 specular-glossiness，按该体系的 diffuse/specular/glossiness 判）。');
  lines.push('- **异常（anomaly）**：数值越界（颜色 / 透明度 / 金属度 / 粗糙度不在 0–1，或颜色不是 0–255 的整型写法）、贴图指向不存在的文件或解析不到 image、数据类型与预期不符、alpha 语义错用。');
  lines.push('- **不一致（inconsistent）**：模型内属性互相矛盾（如金属度很高却没有反射环境、角色塌陷导致整件同色）、lite 与完整件漂移、命名错位、内嵌值与运行时配方冲突。');
  lines.push('');
  lines.push('**真值口径（重要）**：本项目的材质是两层结构，GLB 内嵌值大量是占位值（0.7.6 批次粗糙度一律 `0.82`、金属度 `0`）。因此“完善后的属性值”以**运行时角色配方**为准（`studio-model-material-roles.ts` 的 `resolveModelMaterialRole` → 角色 → `SURFACE_FINISH`），再换算成应写回 GLB 的 `baseColorFactor` / `metallicFactor` / `roughnessFactor` / `alphaMode`。');
  lines.push('');
  lines.push('**槽位名口径（语义化判定）**：槽位 token 的取法是「先切中缀、再取尾词」——`<模型>-candidate-<token>` / `<模型>-furniture-<token>` / `<模型>-sanitary-<token>` / `<模型>-detail-<token>` 取中缀后的词，`<模型>-material-<n>` 取序号，其余取最后一个 `-` / `_` 分段。token 能映回角色，名字才算「语义化」；映射来自三处，优先级从高到低：逐材质全名覆盖（`MODEL_ROLE_BY_MATERIAL_NAME`）→ 逐模型 token 表（`MODEL_SLOT_ROLES_SEMANTIC`）→ 家族 token 表（`FAMILY_TOKEN_ROLES`）→ 尾词兜底词表（`MODEL_SUFFIX_ROLE_VOCABULARY`，只有 19 个词）。');
  lines.push('');
  lines.push('> 这就是为什么 `toilet-sanitary-detail` 会退化成 `body`：`detail` 不在尾词词表里，也不在卫浴家族的表里；同理 `kitchen-island-stone` 退化成 `body` 是因为该 model 压根没在注册表里登记（见 C6）。语义化修复因此分成「补表」和「改名」两条路，逐模型第 4 项会给出该走哪条。');
  lines.push('');
  lines.push('');
  lines.push('表面族 → 粗糙度 / 金属度真值：');
  lines.push('');
  lines.push('| 表面族 | roughness | metalness | 细节强度 |');
  lines.push('| --- | --- | --- | --- |');
  for (const [surface, finish] of [
    ['fabric', { roughness: 0.94, metalness: 0 }],
    ['leather', { roughness: 0.62, metalness: 0.02 }],
    ['wood', { roughness: 0.72, metalness: 0.02 }],
    ['marble', { roughness: 0.3, metalness: 0.04 }],
    ['stone', { roughness: 0.66, metalness: 0.02 }],
    ['metal', { roughness: 0.32, metalness: 0.72 }],
    ['lacquer', { roughness: 0.36, metalness: 0.06 }],
    ['glass', { roughness: 0.14, metalness: 0.06 }],
    ['ceramic', { roughness: 0.3, metalness: 0.02 }],
    ['foliage', { roughness: 0.9, metalness: 0 }],
    ['paint', { roughness: 0.55, metalness: 0.02 }],
  ]) {
    lines.push(`| ${surface} | ${finish.roughness} | ${finish.metalness} | ${DETAIL_SCALE_BY_SURFACE[surface]} |`);
  }
  lines.push('');
  lines.push('## 2. 汇总');
  lines.push('');
  lines.push('| 类别 | 单模型级 | 全局级 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 缺失 | ${s.kindCounts.missing} | ${s.systemicCounts.missing} |`);
  lines.push(`| 异常 | ${s.kindCounts.anomaly} | ${s.systemicCounts.anomaly} |`);
  lines.push(`| 不一致 | ${s.kindCounts.inconsistent} | ${s.systemicCounts.inconsistent} |`);
  lines.push('');
  lines.push('已落实 / 已登记、**不计入上表**的项（逐条可核对）：');
  lines.push('');
  lines.push('| 项 | 数量 | 当前口径 |');
  lines.push('| --- | --- | --- |');
  lines.push(
    `| 法线图（M3 / S1） | ${s.surfaceDetailStrategy.runtime} 个模型走运行时 | ` +
      (s.surfaceDetailStrategy.ready
        ? `不把贴图写进 GLB，由 \`studio-surface-normal-maps.ts\` 按 ${s.surfaceDetailStrategy.surfaces.length} 个表面族挂共享程序化**高度图**（\`bumpMap\`），无 UV 的模型由 \`studio-box-uv.ts\` 在加载期补盒式 UV；链路核验通过`
        : `**链路断点**：${s.surfaceDetailStrategy.breaks.join('；')}`) +
      ' |',
  );
  lines.push(
    `| 金属环境贴图（M5 / S5） | ${s.metalEnvironmentStrategy.runtime} 个模型走运行时 | ` +
      (s.metalEnvironmentStrategy.ready
        ? `metalness ≥ ${s.metalEnvironmentStrategy.minMetalness} 的材质统一挂共享程序化 \`envMap\`（强度 ${s.metalEnvironmentStrategy.intensity}），不设 \`scene.environment\`，非金属件明暗完全不变`
        : `**链路断点**：${s.metalEnvironmentStrategy.breaks.join('；')}`) +
      ' |',
  );
  lines.push(
    `| 档位结构件金属化（M6 / S6） | ${s.presetStructuralMetalStrategy.hits.length} 处 | 结构 / 软装角色由 \`sanitizeStructuralMetalRoles\` 收口成 \`lacquer\` / \`fabric\` / \`ceramic\` / \`wood\`，只保留真五金为金属 |`,
  );
  lines.push(
    `| 细节周期密度（M7 / S7） | ${s.detailCycleStrategy.texelsPerCycle ?? '—'} 纹素 / 周期 | 一个细节周期 ≥ 16 纹素，缩小时不会塌成条带；逐族每米周期数见 S7 |`,
  );
  lines.push(
    `| 命名等价别名（C5） | ${s.namingAliases.length} 个模型 | 文件名与 itemType 只差 \`-\` / \`_\`，规范化后同名，注册表 url 已对上；逐个列在附录 B |`,
  );
  lines.push(`| 契约登记的缺席槽位（C3） | ${s.declaredDeadMaterials} 个槽位 | \`required: false\`，契约已审过“本模型没有这个构件”，重建时沿用以保住旧下标取色 |`);
  lines.push(`| 已审资源例外（C5 / C6） | ${s.assetExceptions.length} 条 | 逐条带保留原因，列在附录 B |`);
  lines.push('');
  lines.push('覆盖口径：材质总数按「每个文件的材质」累加为 ' + s.materialCountAllFiles +
    ' 条；下表与逐模型第 4 项按「运行时优先取 lite」口径统计为 ' + s.materialCount + ' 条（两者差额是完整件里未被 lite 复用的槽位）。');
  lines.push('');
  const ruleEntries = Object.entries(s.ruleCounts).sort((a, b) => b[1] - a[1]);
  if (ruleEntries.length) {
    lines.push('| 规则 | 命中次数 | 含义 |');
    lines.push('| --- | --- | --- |');
    for (const [rule, count] of ruleEntries) {
      lines.push(`| ${rule} | ${count} | ${RULE_CATALOG[rule]?.title ?? ''} |`);
    }
  } else {
    lines.push('**本轮没有任何命中规则**：单模型级与全局级均已归零（M3 由运行时法线链路接管，C5 只剩命名等价别名）。');
  }
  lines.push('');

  // 系统性问题
  lines.push('## 3. 系统性问题（全局，不参与单模型状态）');
  lines.push('');
  const strategy = s.surfaceDetailStrategy;
  lines.push('### S1 法线 / 遮蔽 / 金属粗糙度贴图：**已由运行时接管**（GLB 故意不内嵌）');
  lines.push('');
  if (strategy.ready) {
    lines.push(
      `- 现状：${s.modelCount} 个模型里 ${strategy.embedded} 个自带 \`normalTexture\`，其余 ${strategy.runtime} 个由运行时挂共享程序化**高度图**（\`bumpMap\`）；` +
        `${strategy.withoutUv} 个模型原本连 \`TEXCOORD_0\` 都没有，靠加载期的盒式 UV 补上。`,
    );
    lines.push(
      `- 为什么不写进 GLB：11 张可平铺程序化贴图全局共享（\`studio-surface-normal-maps.ts\`，` +
        `\`CanvasTexture\` + 进程内缓存，显存常数），GLB 体积 / 导出流程 / 审计基线都不受影响；而逐模型烘焙会造成几十种建模来源的贴图体积与维护成本失控。`,
    );
    lines.push(
      `- 表面族与强度：${strategy.surfaces.map((surface) => `${surface} ${DETAIL_SCALE_BY_SURFACE[surface]}`).join('、')}（与本报告第 1 项同一张表，逐族核验一致）。`,
    );
    lines.push(
      `- 链路核验（每次审计都跑）：补 UV \`ensureSceneBoxUvs\` ${strategy.wired.boxUv ? '✓ 已接线' : '✗ 未接线'}、` +
        `挂细节 \`applySurfaceDetailFinish\` ${strategy.wired.detailFinish ? '✓ 已接线' : '✗ 未接线'}、` +
        `写 \`bumpMap\`/\`bumpScale\` ${strategy.wired.bumpMap && strategy.wired.bumpScale ? '✓' : '✗'}、` +
        `清空旧 \`normalMap\` ${strategy.wired.normalMapCleared ? '✓' : '✗'}、` +
        `表面族清单 ${strategy.scaleDrift.length ? `✗ ${strategy.scaleDrift.length} 族强度漂移` : '✓ 11 族全覆盖且强度一致'}。`,
    );
    lines.push('- 这一项**不再是缺陷**：只有上面任一处断链，才会退回按模型报 M3，并把断点写进 detail。');
    lines.push('');
  } else {
    lines.push(`- **运行时链路断链**，M3 仍按模型报缺失：${strategy.breaks.join('；')}`);
    lines.push('- 修复：先恢复 `studio-surface-normal-maps.ts` / `studio-box-uv.ts` 的导出与加载器调用，再重跑本审计。');
    lines.push('');
  }
  const placeholders = models.filter((model) =>
    model.issues.some((entry) => entry.rule === 'C7' && entry.severity === 'systemic'),
  );
  lines.push('### S2 内嵌占位值与运行时配方冲突');
  lines.push('');
  if (placeholders.length) {
    lines.push(
      `- 命中：${placeholders.length} 个模型（材质内嵌 \`metallicFactor=0\` + \`roughnessFactor=0.82\`，而配方要求 metal 最高 0.72）。`,
    );
    lines.push('- 影响：任何绕过角色覆盖的路径（离线导出、第三方预览器、GLTFLoader 直读）都会看到“全哑光无金属”的模型。');
    lines.push('- 修复策略：以本报告第 4 项的目标值回填 GLB；回填脚本只改 `materials[i].pbrMetallicRoughness`，不动几何与节点。');
  } else {
    lines.push('- 现状：0 个模型。GLB 内嵌的 `metallicFactor` / `roughnessFactor` 已与运行时配方一致，`C7` 不再命中。');
    lines.push('- 回归保护：任何重导出把占位值（metal 0 / rough 0.82）带回来，`C7` 会立刻按模型报，不需要额外人工核对。');
  }
  lines.push('');
  lines.push('### S3 命名体系三套并存');
  lines.push('');
  lines.push(
    `- 现状：${s.namingAliases.length} 个模型的 GLB 文件名与 itemType 只差 \`-\` / \`_\`（` +
      s.namingAliases.map((alias) => `\`${alias.id}\` ↔ \`${alias.itemType}\``).join('、') +
      '），规范化后同名，注册表 url 已对上——属于**命名等价别名**，不计入不一致，逐个列在附录 B。',
  );
  lines.push(
    `- 真正不同名的错位：${s.ruleCounts.C5 ?? 0} 个模型（` +
      (s.assetExceptions.length
        ? s.assetExceptions
            .filter((entry) => entry.kind === 'naming')
            .map((entry) => `\`${entry.id}\` ↔ \`${entry.itemType}\``)
            .join('、') || '无'
        : '无') +
      '），已逐条登记进 `DECLARED_ASSET_EXCEPTIONS`（附录 B）。',
  );
  lines.push('- 影响：材质角色只能靠注册表 url 反查，任何“按文件名推断 itemType”的新代码都会静默失配；新代码必须走 `resolveItemTypes` / `modelAssetIdForStem`。');
  lines.push('- 处理：短期在注册表集中维护别名（本脚本的 `resolveItemTypes` 即是参照实现）；中期统一为 itemType 名，改文件名与 url 同批提交。');
  lines.push('');
  lines.push('### S4 槽位名语义化程度不均');
  lines.push('');
  lines.push('槽位名能否直接还原本构件，决定了角色解析要不要依赖外部表。现状分布：');
  lines.push('');
  lines.push('| 命名体系 | 槽位数量 | 说明 |');
  lines.push('| --- | --- | --- |');
  for (const [key, value] of Object.entries(s.naming.systems).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${NAMING_SYSTEM_LABEL[key] ?? key} | ${value} | ${NAMING_SYSTEM_NOTE[key] ?? ''} |`);
  }
  lines.push('');
  lines.push('| 语义级别 | 槽位数量 | 含义 |');
  lines.push('| --- | --- | --- |');
  for (const [key, value] of Object.entries(s.naming.semantics).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${SEMANTICS_LABEL[key] ?? key} | ${value} | ${SEMANTICS_NOTE[key] ?? ''} |`);
  }
  lines.push('');
  lines.push(
    `处理动作：保持 ${s.naming.actions.keep ?? 0}、登记表 ${s.naming.actions.register ?? 0}、改名 ${
      s.naming.actions.rename ?? 0
    }。`,
  );
  const noSemanticModels = models.filter(
    (model) => model.materials.length && model.materials.every((row) => ['opaque', 'indexed'].includes(row.naming.semantics)),
  );
  lines.push('');
  lines.push(
    `- 最严重的一档：**${noSemanticModels.length} 个模型的槽位名 100% 无语义**（` +
      '`bar-material-0` … `bookcase-material-16` 这类导出器自动编号），角色完全压在 `MODEL_SLOT_ROLES` 的槽位顺序上 —— 重新导出一次、顺序一变，整件家具就会按错的角色上色；' +
      '名单见附录 C.2。',
  );
  lines.push(
    `- 第二档：${s.naming.semantics['unresolved-token'] ?? 0} 个槽位名字里其实写了构件词（` +
      '`bottle` / `liquid` / `stone` / `front`），只是表里没登记 → 只要补 `MODEL_SLOT_ROLES_SEMANTIC`，不用重出 GLB 就能修好。',
  );
  lines.push(
    `- 第三档：${s.naming.semantics['lightness-remapped'] ?? 0} 个明度候选槽位（` +
      '`-candidate-body` / `-furniture-accent`）已经由表还原，出图正确；语义不在名字里，但属于可接受的导出习惯，不建议为它重出 110 个 GLB。',
  );
  lines.push('');
  lines.push('**目标命名规范**（三层，按成本递增）：');
  lines.push('');
  lines.push('1. **保持现状即可**：`<模型>-furniture-<token>` / `<模型>-sanitary-<token>` / `<模型>-detail-<token>` 与 `<模型>-candidate-<明度>` 只要 token 已在表里登记，出图就是对的。');
  lines.push('2. **登记表（零成本，推荐先做）**：把「明度候选 / 仅序号」的 token 登记进 `MODEL_SLOT_ROLES_SEMANTIC[itemType]`，例如 `kitchen-island: { stone: "countertop", vein: "countertop" }`。不改 GLB、不改名、立刻生效。');
  lines.push('3. **改名（彻底语义化）**：把无语义槽位改成 `<itemType>-<token>`，token 取「家族表里能映回同一角色」的那个词 —— 例如 `*5` → `floor-lamp-base`、`M03_Pewter_Shine` → `air-outlet-grille`、`om.cn_1342` → `tea-bar-machine-panel`、`B-1` → `floating-stairs-tread`。这类名字解析器直接命中，不需要再查表。');
  lines.push('');
  lines.push('约束（改名时必须同步）：`resolveSemanticSlotRole` 读的是中缀后的尾词，尾词必须落在 token 表里；`resolveModelMaterialRole` 的 suffix 通道只认 `MODEL_SUFFIX_ROLE_VOCABULARY` 里的 19 个词，`carcass` / `countertop` / `grille` 这类角色名不在词表内，直接改名叫 `<模型>-carcass` 是**解析不到**的 —— 要么用家族 token，要么同时在 `model-slot-roles.ts` 登记。');
  lines.push('');
  lines.push('### S5 金属发黑：**高金属度 + 没有 IBL**（已由共享环境贴图接管）');
  lines.push('');
  const metalStrategy = s.metalEnvironmentStrategy;
  if (metalStrategy.ready) {
    lines.push(
      `- 根因：\`SURFACE_FINISH.metal\` 是 \`metalness 0.72 / roughness 0.32\`，而全前端没有任何 \`scene.environment\` / PMREM。` +
        `金属度越高漫反射越接近 0，没有环境可反射时屏幕上只剩方向光的高光条 —— 就是「冰箱 / 油烟机 / 衣柜 / 电梯发黑」。`,
    );
    lines.push(
      `- 现状：${metalStrategy.metallicMaterialCount} 个材质（分布在 ${metalStrategy.runtime} 个模型）由 \`studio-metal-environment.ts\` 挂**同一张**程序化等距柱状环境图，` +
        `\`envMapIntensity = ${metalStrategy.intensity}\`；${metalStrategy.withoutMetal} 个模型没有金属件，完全不挂（墙面 / 地面 / 布艺明暗不变）。`,
    );
    lines.push(
      `- 豁免：${metalStrategy.exemptItemTypes.map((itemType) => `\`${itemType}\``).join('、')}（车漆自带假环境、金属楼梯显式不要 IBL、透明玻璃件）。`,
    );
    lines.push(
      `- 链路核验（每次审计都跑）：\`applyMetalEnvironmentFinish\` ${metalStrategy.wired.finish ? '✓ 已接线' : '✗ 未接线'}、` +
        `\`envMap\` ${metalStrategy.wired.envMap ? '✓' : '✗'}、\`envMapIntensity\` ${metalStrategy.wired.envMapIntensity ? '✓' : '✗'}、` +
        `\`EquirectangularReflectionMapping\` ${metalStrategy.wired.equirect ? '✓' : '✗'}、标记 \`homeosMetalEnvironment\` ${metalStrategy.wired.marker ? '✓' : '✗'}。`,
    );
    lines.push('- 判定：链路成立时 M5 不产生问题项；任一处断链才退回按模型报，并把断点写进 detail。');
  } else {
    lines.push(`- **链路断链**，M5 按模型报「金属没有环境贴图」：${metalStrategy.breaks.join('；')}`);
  }
  lines.push('');
  lines.push('### S6 档位把结构 / 软装角色刷成金属（已由定义期收口）');
  lines.push('');
  const presetStrategy = s.presetStructuralMetalStrategy;
  lines.push(
    `- 遍历 ${presetStrategy.presets} 个内置档位（${presetStrategy.groups} 个组），用守卫词表（${presetStrategy.structuralRoles.length} 个结构 / 软装角色）复核：` +
      `**${presetStrategy.hits.length} 处命中**。`,
  );
  lines.push(
    '- 收口规则：结构件（`body` / `door` / `panel` / `top` / `drawer` / `interior` / `carcass` / `back` / `side` / `dark` …）' +
      '一律不再拿 `surface: "metal"`，改走 `lacquer`（钢色漆面，**颜色不变**）；软装回 `fabric`、陶件回 `ceramic`、木作回 `wood`。',
  );
  lines.push('- 仍然允许金属的角色：`metal` / `handle` / `grating` / `grille` / `burner` / `faucet` / `leg` / `trim` / `base` / `frame` / `sink` / `cooktop` 等真正的五金件。');
  if (presetStrategy.hits.length) {
    for (const breakLine of presetStrategy.breaks) lines.push(`- **命中**：${breakLine}`);
  } else {
    lines.push('- 回归保护：任何新增档位绕过 `definePreset` 的收口，M6 会立刻按「档位 id + 角色名」报出来。');
  }
  lines.push('');
  lines.push('### S7 波浪状细纹：**程序化细节从 normalMap 换成 bumpMap**');
  lines.push('');
  const cycleStrategy = s.detailCycleStrategy;
  if (cycleStrategy.ready) {
    lines.push(
      `- 根因：three 的 \`normalMap\` 没有屏幕导数滤波，按米平铺的高频假细节在大平板上缩小时按像素选 mip，` +
        `相邻像素落在不同 mip 而幅度不衰减 → 一层层跟随透视的波浪条带（电梯门 38 道、衣柜门 25 道、2m 出风口最明显）。`,
    );
    lines.push(
      `- 修法：同一批高度场改出**灰度高度图**喂 \`bumpMap\`（\`perturbNormalArb\` 用 \`dFdx\`/\`dFdy\` 取屏幕空间差分，mip 变粗时扰动同步收敛），` +
        `并显式清空旧的 \`normalMap\`，杜绝双份扰动。`,
    );
    lines.push(
      `- 密度：纹理边长 ${cycleStrategy.textureSize}px、每单元最高 ${cycleStrategy.maxCycles} 个周期 → **${cycleStrategy.texelsPerCycle} 纹素 / 周期**（阈值 ≥ 16）。` +
        `逐族每米周期数：${cycleStrategy.densities
          .filter((density) => density.cyclesPerMeter !== null)
          .map((density) => `${density.surface} ${density.cyclesPerMeter}`)
          .join('、')}。`,
    );
    lines.push('- 可逐槽位收口：`RoleRecipe.surfaceDetailScale = 0`（出风口等大平板钣金件），旧键 `surfaceNormalScale` 仍然读。');
  } else {
    lines.push(`- **密度核验不通过**：${cycleStrategy.breaks.join('；')}`);
  }
  lines.push('');

  // 逐模型
  lines.push('## 4. 逐模型审计');
  lines.push('');
  lines.push('字段顺序固定：1 模型名称 → 2 问题项（标注缺失 / 异常 / 不一致）→ 3 修复建议 → 4 完善后的属性值。');
  lines.push('');
  const byFamily = new Map();
  for (const model of models) {
    if (!byFamily.has(model.family)) byFamily.set(model.family, []);
    byFamily.get(model.family).push(model);
  }
  const families = [...byFamily.keys()].sort((a, b) => {
    const ia = FAMILY_ORDER.indexOf(a);
    const ib = FAMILY_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  for (const family of families) {
    const list = byFamily.get(family).sort((a, b) => a.id.localeCompare(b.id));
    lines.push(`### 4.${families.indexOf(family) + 1} 家族：${FAMILY_LABEL[family] ?? family}（\`${family}\`，${list.length} 个模型）`);
    lines.push('');
    for (const model of list) lines.push(...renderModelSection(model));
  }

  // 附录
  lines.push('## 附录 A 细节图集落地清单（bumpMap）');
  lines.push('');
  lines.push(
    '贴图由 `materials/studio-surface-normal-maps.ts` 在**加载期按表面族生成一次并缓存**（128²、可平铺、`NoColorSpace`、' +
      '`repeat = 1 / SURFACE_TILE_METERS`），磁盘上**没有** PNG 文件，也不写进 GLB —— 这是 M3 的既定策略，' +
      '所以本表只有族 / 强度 / 覆盖米数，没有“待产出的贴图”一列。',
  );
  lines.push('');
  lines.push('| 表面族 | 一个纹理单元覆盖 | normalScale | 适用角色示例 |');
  lines.push('| --- | --- | --- | --- |');
  const examples = {
    fabric: 'cushion / upholstery / linen',
    leather: 'seat / stash',
    wood: 'carcass / cabinetDoor / leg / wood',
    marble: 'countertop / surface（slab 大理石）',
    stone: 'soil / sculpture / rock',
    metal: 'faucet / handle / metal / railing',
    lacquer: 'shell / panel / screen / cooktop',
    glass: 'glass / mirror / water',
    ceramic: 'ceramic / bowl / rim / mug',
    foliage: 'foliage / leaf / grassTuft',
    paint: 'wall / playBody / bodywork',
  };
  for (const surface of Object.keys(DETAIL_SCALE_BY_SURFACE)) {
    const tile = summary.surfaceDetailStrategy.tileMeters?.[surface];
    lines.push(
      `| ${surface} | ${tile ? `${tile} m` : '—'} | ${DETAIL_SCALE_BY_SURFACE[surface]} | ${examples[surface] ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## 附录 B 无法读取 / 孤儿模型的统一修复模板');
  lines.push('');
  lines.push('本次审计中：');
  const unreadableModels = models.filter((model) => model.status === 'unreadable' || model.status === 'no-material');
  lines.push(
    `- 无法读取 / 无材质：${unreadableModels.length} 个${unreadableModels.length ? `（${unreadableModels.map((model) => model.id).join('、')}）` : '（无）'}。`,
  );
  const orphans = models.filter((model) => model.issues.some((entry) => entry.rule === 'C6'));
  lines.push(
    orphans.length
      ? `- 孤儿 GLB（无注册表引用）：${orphans.length} 个 — ${orphans.map((model) => `\`${model.id}\``).join('、')}。`
      : '- 孤儿 GLB（无注册表引用）：0 个。',
  );
  lines.push(
    `- 契约登记的缺席槽位（\`required: false\`、未绑 primitive 属预期）：${summary.declaredDeadMaterials} 条，` +
      '**不计入 C3**。重建器刻意沿用源材质数组（运行期有 30 处按旧名 / `material-<n>` 下标取色的分支），' +
      '新配方只绑实际存在的构件，因此每次重建都会留下这批槽位；它们的角色由 `model-slot-roles.ts` 接管，不参与渲染。',
  );
  if (summary.namingAliases.length) {
    lines.push('');
    lines.push(
      `**命名等价别名**（文件名与 itemType 只差 \`-\` / \`_\`，规范化后同名；注册表 url 已对上，` +
        `不计入不一致）：${summary.namingAliases.length} 个`,
    );
    lines.push('');
    lines.push('| 模型 | GLB 文件 | itemType | 判据 |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of summary.namingAliases) {
      lines.push(`| ${code(entry.id)} | \`${entry.file}\` | ${code(entry.itemType)} | ${entry.reason} |`);
    }
  }
  if (summary.assetExceptions.length) {
    lines.push('');
    lines.push('**已登记的保留例外**（`audit_glb_materials.mjs → DECLARED_ASSET_EXCEPTIONS`，不计入 status）：');
    lines.push('');
    lines.push('| 模型 | 例外 | 保留原因 |');
    lines.push('| --- | --- | --- |');
    for (const entry of summary.assetExceptions) {
      lines.push(
        `| ${code(entry.id)} | ${entry.kind === 'orphan' ? 'C6 无注册表引用' : `C5 文件名 → itemType ${code(entry.itemType)}`} | ${entry.reason} |`,
      );
    }
  }
  lines.push('');
  lines.push('**缺失原因**（按模型二选一）：');
  lines.push('');
  lines.push('- 孤儿件：注册表 url 指向了另一份同义文件（如 `floorlamp` 指向 `floorlamp-lite.glb`），本文件已不再被加载，材质问题不会在运行时暴露，但会随打包一起发布。');
  lines.push('- 无材质件：几何导出时没带材质槽位，颜色只能由运行时按槽位兜底。');
  lines.push('');
  lines.push('**可执行的最小修复步骤**：');
  lines.push('');
  lines.push('1. 确认该文件是否仍被引用：`rg "floor-lamp\\.glb|kitchen-island\\.glb" homeos/frontend/src`；');
  lines.push('2. 若仍有引用 → 在 `ALL_ITEM_MODELS` 登记并补目录尺寸，然后按第 4 项目标值补材质；');
  lines.push('3. 若已无引用 → 删除文件（连同 `dist/` 构建产物一起重出），避免 495KB 死资源进包；');
  lines.push('4. 若必须保留但不确定材质 → 按下表最小属性集补一条材质并绑到所有 primitive。');
  lines.push('');
  lines.push('**建议补齐的最小属性集及取值**：');
  lines.push('');
  lines.push('| 属性 | 取值 | 依据 |');
  lines.push('| --- | --- | --- |');
  lines.push('| `baseColorFactor` | `[0.4902, 0.5020, 0.5373, 1]`（#7D8089） | 家族 `misc` 兜底色，作为占位可被运行时配方覆盖 |');
  lines.push('| `metallicFactor` | `0` | 未知构件按非金属处理，避免无环境贴图时发黑 |');
  lines.push('| `roughnessFactor` | `0.55` | `paint` 族真值 |');
  lines.push('| `alphaMode` | `OPAQUE` | 未知构件默认不透明，避免排序问题 |');
  lines.push(`| \`normalTexture\` | 不需要写进 GLB | 表面法线由运行时按表面族共享（S1，见附录 A）；这里补贴图反而会和运行时那张打架 |`);
  lines.push('');
  lines.push('> 说明：`floor-lamp.glb` 的 6 条历史材质名（`frosted-white`、`Metal_Corrogated_Shiny`、`*5` …）在 `MODEL_ROLE_BY_MATERIAL_NAME.floorlamp` 里已有映射，可直接照抄到别名表，属于“能推断但当前文件名对不上”的情形。');
  lines.push('');
  lines.push('## 附录 C 槽位名语义化清单（可直接照抄进 `model-slot-roles.ts`）');
  lines.push('');
  lines.push('### C.1 登记表（只改 TS，立刻生效，不动 GLB）');
  lines.push('');
  lines.push('把下列 `token → 角色` 补进 `MODEL_SLOT_ROLES_SEMANTIC[itemType]`：');
  lines.push('');
  lines.push('```ts');
  const registerModels = models.filter((model) =>
    model.naming.renameTargets.some((target) => target.action === 'register'),
  );
  for (const model of registerModels) {
    const entries = model.naming.renameTargets.filter((target) => target.action === 'register');
    const tokenPairs = entries
      .map((target) => {
        const token = model.materials.find((material) => material.name === target.from)?.naming.token;
        return token ? `    ${token}: "${target.role}",` : null;
      })
      .filter(Boolean);
    lines.push(`  "${model.itemType}": {`);
    lines.push(...[...new Set(tokenPairs)]);
    lines.push('  },');
  }
  lines.push('```');
  lines.push('');
  lines.push('### C.2 改名清单（需重出 GLB + 同步材质表）');
  lines.push('');
  lines.push('| 模型 | 原槽位名 | 建议槽位名 | 角色 | 可直接命中 |');
  lines.push('| --- | --- | --- | --- | --- |');
  let renameRows = 0;
  for (const model of models) {
    for (const target of model.naming.renameTargets.filter((entry) => entry.action === 'rename')) {
      renameRows += 1;
      lines.push(
        `| ${code(model.id)} | ${code(target.from)} | ${code(target.to ?? '—')} | ${code(target.role)} | ${
          target.verified ? '是' : '否（需登记）'
        } |`,
      );
    }
  }
  if (!renameRows) lines.push('| — | — | — | — | — |');
  lines.push('');
  lines.push('> 「可直接命中」= 新名字的尾词已在家族 token 表里，改完不用再补登记；「需登记」= 尾词是角色名（如 `countertop`），必须先补 `MODEL_SLOT_ROLES_SEMANTIC` 才能解析。');
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

const report = renderReport();
const jsonPayload = {
  summary,
  ruleCatalog: RULE_CATALOG,
  models: models.map((model) => ({
    id: model.id,
    itemType: model.itemType,
    itemTypes: model.itemTypes,
    family: model.family,
    group: model.group,
    status: model.status,
    files: model.files,
    counts: model.counts,
    naming: model.naming,
    declaredDeadMaterials: model.declaredDeadMaterials,
    assetException: model.assetException,
    namingAlias: model.namingAlias,
    normalMap: model.normalMap,
    unreadableReason: model.unreadableReason,
    issues: model.issues,
    materials: model.materials,
  })),
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(jsonPayload, null, 2)}\n`);
} else {
  console.log(`审计完成：${summary.fileCount} 个 GLB / ${summary.modelCount} 个模型 / ${summary.materialCount} 条材质`);
  console.log(
    `状态：ok ${summary.statusCounts.ok ?? 0}、issues ${summary.statusCounts.issues ?? 0}、no-material ${
      summary.statusCounts['no-material'] ?? 0
    }、unreadable ${summary.statusCounts.unreadable ?? 0}`,
  );
  console.log(
    `单模型级：缺失 ${summary.kindCounts.missing}、异常 ${summary.kindCounts.anomaly}、不一致 ${summary.kindCounts.inconsistent}`,
  );
  console.log(
    `全局级：缺失 ${summary.systemicCounts.missing}、异常 ${summary.systemicCounts.anomaly}、不一致 ${summary.systemicCounts.inconsistent}`,
  );
  const normalStrategy = summary.surfaceDetailStrategy;
  console.log(
    `· 细节图（M3 / S1，bumpMap）：运行时补齐 ${normalStrategy.ready ? '✓' : '✗'}（内嵌 ${normalStrategy.embedded} / 运行时 ${normalStrategy.runtime} / 无 ${normalStrategy.none}，表面族 ${normalStrategy.surfaces.length}，无 UV ${normalStrategy.withoutUv}）` +
      (normalStrategy.ready ? '' : `；断点：${normalStrategy.breaks.join('；')}`),
  );
  const metalStrategy = summary.metalEnvironmentStrategy;
  console.log(
    `· 金属环境贴图（M5 / S5）：${metalStrategy.ready ? '✓' : '✗'}（金属材质 ${metalStrategy.metallicMaterialCount} 条 / 运行时 ${metalStrategy.runtime} 个模型 / 无金属件 ${metalStrategy.withoutMetal}，强度 ${metalStrategy.intensity}）` +
      (metalStrategy.ready ? '' : `；断点：${metalStrategy.breaks.join('；')}`),
  );
  const presetStrategy = summary.presetStructuralMetalStrategy;
  console.log(
    `· 档位结构件金属化（M6 / S6）：${presetStrategy.hits.length === 0 ? '✓ 0 命中' : `✗ ${presetStrategy.hits.length} 处`}（遍历 ${presetStrategy.presets} 个档位）`,
  );
  const cycleStrategy = summary.detailCycleStrategy;
  console.log(
    `· 细节周期密度（M7 / S7）：${cycleStrategy.ready ? '✓' : '✗'} ${cycleStrategy.texelsPerCycle ?? '—'} 纹素 / 周期（阈值 ≥ 16）`,
  );
  console.log(`· 命名等价别名（C5，只差 -/_，不计入不一致）：${summary.namingAliases.length} 个`);
  if (!stdoutOnly) {
    fs.mkdirSync(outDir, { recursive: true });
    const mdPath = reportPath;
    fs.writeFileSync(mdPath, report);
    fs.writeFileSync(jsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
    console.log(`→ ${path.relative(repoRoot, mdPath)}`);
    console.log(`→ ${path.relative(repoRoot, jsonPath)}`);
  }
}

if (writeRoleBaseline) {
  const payload = {
    format: 1,
    note:
      'GLB 材质「槽位下标 → 语义角色」快照：故意不含槽位名，改名不影响指纹；' +
      '角色本身变化（重导出位移 / token 表误改）会让 check:materials 失败。',
    generatedAt: new Date().toISOString(),
    modelCount: models.length,
    fileCount: Object.keys(roleSnapshot).length,
    materialCount: Object.values(roleSnapshot).reduce((sum, roles) => sum + roles.length, 0),
    files: roleSnapshot,
  };
  fs.writeFileSync(ROLE_BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `→ 角色基线已写入 ${path.relative(repoRoot, ROLE_BASELINE_PATH)}（${payload.fileCount} 个文件 / ${payload.materialCount} 条）`,
  );
  roleDrift = [];
}

if (checkMode) {
  // `--check` 是**覆盖度回归门**，不是「缺陷归零门」：
  // 现阶段缺失 / 异常 / 命名不一致本来就有存量，把它们当失败只会让门禁永远红。
  // 真正要守住的是：660 个 GLB 全部可解析、模型/材质计数不漂移、报告与脚本同步、
  // 以及「(文件, 槽位下标) → 角色」的解析结果不漂移。
  const problems = [];
  const unreadable = summary.fileStatus.unreadable ?? 0;
  if (unreadable > 0) problems.push(`${unreadable} 个 GLB 无法解析`);
  if ((summary.statusCounts['no-material'] ?? 0) > 0) {
    problems.push(`${summary.statusCounts['no-material']} 个模型没有材质`);
  }
  if (fs.existsSync(jsonPath)) {
    try {
      const baseline = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).summary;
      for (const key of ['fileCount', 'modelCount', 'materialCount', 'materialCountAllFiles']) {
        if (baseline[key] !== summary[key]) {
          problems.push(`${key} 从 ${baseline[key]} 变为 ${summary[key]}（先跑 audit:materials 更新报告）`);
        }
      }
    } catch (error) {
      problems.push(`基线 ${path.relative(repoRoot, jsonPath)} 解析失败：${error.message}`);
    }
  }
  if (roleBaselineMissing) {
    problems.push(
      `缺少角色基线 ${path.relative(repoRoot, ROLE_BASELINE_PATH)}` +
        '（刻意调整角色后跑 `bun ops/checks/studio/audit_glb_materials.mjs --write-role-baseline` 重写）',
    );
  } else if (roleDrift && roleDrift.length) {
    for (const entry of roleDrift.slice(0, 12)) {
      const where =
        entry.index === null
          ? entry.fileName
          : `${entry.fileName} #${entry.index}${entry.name ? ` (${entry.name})` : ''}`;
      problems.push(`角色漂移：${where} ${entry.before} → ${entry.after}`);
    }
    if (roleDrift.length > 12) problems.push(`…另有 ${roleDrift.length - 12} 处角色漂移`);
    problems.push(
      '如为刻意调整，跑 `bun ops/checks/studio/audit_glb_materials.mjs --write-role-baseline` 重写基线并 review diff',
    );
  }
  if (!summary.surfaceDetailStrategy.ready) {
    problems.push(`细节图运行时链路断链：${summary.surfaceDetailStrategy.breaks.join('；')}`);
  }
  if (!summary.metalEnvironmentStrategy.ready) {
    problems.push(`金属环境贴图链路断链：${summary.metalEnvironmentStrategy.breaks.join('；')}`);
  }
  if (summary.presetStructuralMetalStrategy.hits.length) {
    for (const hit of summary.presetStructuralMetalStrategy.hits.slice(0, 12)) {
      problems.push(`档位 \`${hit.preset}\`（${hit.group}）把结构角色 \`${hit.role}\` 刷成了金属`);
    }
    problems.push('结构 / 软装角色只允许走 lacquer / fabric / ceramic / wood（见 STRUCTURAL_OR_SOFT_ROLES）');
  }
  if (!summary.detailCycleStrategy.ready) {
    problems.push(`细节周期密度过密：${summary.detailCycleStrategy.breaks.join('；')}`);
  }
  if (problems.length) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }
  console.log(
    `✓ 覆盖度正常：${summary.fileCount} 个 GLB / ${summary.modelCount} 个模型 / ${summary.materialCount} 条材质（全部文件 ${summary.materialCountAllFiles} 条）`,
  );
  console.log(
    `✓ 角色基线一致：${Object.keys(roleSnapshot).length} 个文件 / ${Object.values(roleSnapshot).reduce((sum, roles) => sum + roles.length, 0)} 条「槽位下标 → 角色」`,
  );
  console.log(
    `· 存量待修：缺失 ${summary.kindCounts.missing}、异常 ${summary.kindCounts.anomaly}、不一致 ${summary.kindCounts.inconsistent}（不计入退出码）`,
  );
  console.log(
    `· 已落实策略：细节图运行时补齐 ${summary.surfaceDetailStrategy.ready ? '✓' : '✗'}、金属环境贴图 ${summary.metalEnvironmentStrategy.ready ? '✓' : '✗'}、` +
      `档位结构件金属化 ${summary.presetStructuralMetalStrategy.hits.length === 0 ? '✓ 0 命中' : `✗ ${summary.presetStructuralMetalStrategy.hits.length} 处`}、` +
      `命名等价别名 ${summary.namingAliases.length} 个（均不计入不一致）`,
  );
  console.log(
    `· 槽位名：语义 ${summary.naming.semantics.semantic ?? 0}、明度候选 ${
      summary.naming.semantics['lightness-remapped'] ?? 0
    }、未登记 ${summary.naming.semantics['unresolved-token'] ?? 0}、仅序号 ${
      summary.naming.semantics.indexed ?? 0
    }、无语义 ${summary.naming.semantics.opaque ?? 0}`,
  );
}

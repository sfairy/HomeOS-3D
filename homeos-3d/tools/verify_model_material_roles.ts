/**
 * 外部模型材质角色表的 CI 级回归校验（只读）。
 *
 * 背景：`frontend/src/app/3d-studio/materials/studio-model-material-roles.ts` 用
 * 「槽位角色表 + 家族配方」接管全部外部模型的材质，替代 GLB 的烘焙占位色。一旦
 * GLB 重新导出、图元顺序变化、或加载器分发闸门被改动，就会出现「模型默默回到
 * 占位色」的静默回归。本脚本把四层断言固化下来：
 *
 *   L1 覆盖：每个非灯光模型的每条材质都能解析出角色，并在「默认 / 暖木」两套色板
 *            下取到健全配方（颜色非纯黑、通道在 [0,1]、透明度在 (0,1]）。
 *   L2 分发：回放 studio-external-models.ts 的 resolveSharedMaterial 闸门，断言每个
 *            非灯光模型在两种主题下都会进入 applyItemDetailMaterial（角色表或专用函数）。
 *   L3 槽位：MODEL_SLOT_ROLES 每个模型的表长必须覆盖该模型真实材质数，且区间内无空洞；
 *            否则新增图元会静默落到家族默认角色。
 *   L4 对齐：把新 GLB 图元按归一化几何指纹与 0.6.5 同名模型配对，比对角色是否一致；
 *            0.6.5 参考目录不存在时自动跳过（CI 上通常没有）。
 *
 * 用法：
 *   bun tools/verify_model_material_roles.ts [--verbose] [--model=shelf] [--no-parity]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODEL_SLOT_ROLES,
  isStoneSlabFlavor,
  isStructuralModelFamily,
  materialRoleRecipeFor,
  resolveModelFamily,
  resolveModelMaterialRole,
  usesNamedMaterialRole,
  MATERIAL_ROLE_VOCABULARY,
} from "../frontend/src/app/3d-studio/materials/studio-model-material-roles";
import {
  MATERIAL_STYLE_AUTO,
  MATERIAL_STYLE_CUSTOM_PREFIX,
  MATERIAL_STYLE_PRESET_LIST,
  MATERIAL_STYLE_SUMMARY,
  buildCustomMaterialStyleRecord,
  customMaterialStyleId,
  isMaterialStyleCapable,
  materialStyleCollapsedRoles,
  materialStyleGroupFor,
  materialStyleOptionsFor,
  materialStylePresetFor,
  materialStylePresetSwatchColors,
  materialStyleRecipeFor,
  normalizeMaterialStyle,
  registerCustomMaterialStyles,
} from "../frontend/src/app/3d-studio/materials/studio-material-presets";
import { WARM_WOOD_STYLE } from "../frontend/src/app/3d-studio/studio/studio-scene-style";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MODELS_DIR = join(PROJECT_ROOT, "frontend/public/static/3d-studio/models");
/** 0.6.5 参考项目（同级目录）。CI 上通常不存在，L4 会自动跳过。 */
const REFERENCE_DIR = join(PROJECT_ROOT, "../homeos-3d 0.6.5/frontend/public/static/3d-studio/models");

const verbose = process.argv.includes("--verbose");
const skipParity = process.argv.includes("--no-parity");
const only = process.argv.find((a) => a.startsWith("--model="))?.slice(8);

/* -------------------------------------------------------------------------- */
/* 行类型                                                                      */
/* -------------------------------------------------------------------------- */

type MaterialFacts = {
  name: string;
  index: number;
  baseColor: [number, number, number] | null;
  /** glTF 材质数组里的位置：运行时 `describeItemMaterials` 传的就是它。 */
  position: number;
  /** 是否被某个图元引用（GLB 里常挂着图元没用的空材质，色卡不该被它们带偏）。 */
  rendered: boolean;
};
type ModelFacts = { basename: string; itemType: string; path: string; materials: MaterialFacts[] };

/* -------------------------------------------------------------------------- */
/* 常量：与加载器 / studio-app 保持一致                                        */
/* -------------------------------------------------------------------------- */

/** GLB basename → 运行时 itemType。 */
const ITEM_TYPE_OVERRIDES: Record<string, string> = {
  "air-outlet": "airoutlet",
  "pipeline-water-purifier": "pipelinewaterpurifier",
  "tea-bar-machine": "tea_bar_machine",
  "steel-stairs": "steelstairs",
  "glass-stairs": "glassstairs",
  "floating-stairs": "floatingstairs",
  "floor-lamp": "floorlamp",
};

/** 灯光走灯具分支，只断言角色数据齐全，不做配色健全性判定。 */
const LIGHT_ITEM_TYPES = new Set([
  "floorlamp",
  "walllamp",
  "downlight",
  "ceilinglight",
  "striplight",
]);

/** 颜色由 garden / decor 主题表决定，不走 itemPalette 配方。 */
const THEME_TABLE_FAMILIES = new Set(["garden", "decor"]);

/** 与 0.6.5 的几何/命名差异已核定的白名单，每项必须写明依据。 */
const PARITY_EXEMPTIONS: ReadonlyArray<{ model: string; slot: number; reason: string }> = [
  {
    model: "laptop",
    slot: 2,
    reason:
      "新资产按 <type>-detail-<role> 规范导出（body/panel/recess/trim/control），角色取自材质名并命中加载器 applianceDetailRoleColors；0.6.5 用 material-N-body 旧命名，几何配对（Δ14%）属巧合。",
  },
  {
    model: "nas",
    slot: 2,
    reason:
      "nas 材质名不含角色，加载器 nas 分支按索引配色（index2 = applianceDark×0.48 凹陷）；槽位表已逐槽复刻该配色，0.6.5 的 body 名不生效。",
  },
  {
    model: "rounddiningtable",
    slot: 1,
    reason: "新资产把 0.6.5 的 cushion 更名为 fabric；woodwork 家族内二者同色同表面。",
  },
  {
    model: "rounddiningtable_turntable",
    slot: 1,
    reason: "同上：cushion → fabric，woodwork 家族内同配方同色。",
  },
];
const exemptionFor = (model: string, slot: number) =>
  PARITY_EXEMPTIONS.find((e) => e.model === model && e.slot === slot);

/**
 * 默认（蓝灰）主题色板：照抄 studio-app.ts 的 `defaultViewSettings`（未导出）。
 * 它没有 wood / cabinetWood / countertop / sofaFabric 等暖木专用键，
 * 这些要靠 PALETTE_KEY_FALLBACK 回落——所以这里只用它验「取得到且健全」。
 */
const DEFAULT_PALETTE = {
  warmWood: false,
  background: 1120029,
  ground: 1382690,
  floor: 5792116,
  floorEdge: 16163146,
  grid: 5331300,
  wall: 9476522,
  wallTop: 13095134,
  furniture: 8226713,
  furnitureSoft: 10332346,
  furnitureLight: 12634839,
  furnitureDark: 5397873,
  appliance: 10134967,
  applianceSoft: 11911118,
  applianceDark: 6845576,
  glass: 11126227,
  frame: 12172999,
  doorLeaf: 10988725,
  accent: 16758886,
} as Record<string, unknown>;
const WARM_PALETTE = { ...WARM_WOOD_STYLE } as Record<string, unknown>;
const PALETTES = [
  ["default", DEFAULT_PALETTE],
  ["warm", WARM_PALETTE],
] as const;

/** 角色词表（Set 形态，供档位表校验角色名是否合法）。 */
const MATERIAL_ROLE_VOCABULARY_SET = new Set<string>(MATERIAL_ROLE_VOCABULARY as readonly string[]);
/** 档位可以覆盖的调色板键：两套色板的并集 + 只由档位表声明的派生键。 */
const PALETTE_KEY_NAMES = new Set<string>([
  ...Object.keys(DEFAULT_PALETTE),
  ...Object.keys(WARM_PALETTE),
  // 这两支键只由档位表 / 家族底表使用，靠 PALETTE_KEY_FALLBACK 回落到 furniture*。
  "cabinetBody",
  "cabinetDoor",
  "runnerColor",
]);

/* -------------------------------------------------------------------------- */
/* GLB 解析                                                                    */
/* -------------------------------------------------------------------------- */

function readGlbJson(path: string): any {
  const buf = readFileSync(path);
  let offset = 12;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(offset, offset + length).toString("utf8"));
    offset += length;
  }
  throw new Error(`no JSON chunk: ${path}`);
}

function collectGlbs(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name.endsWith(".glb") && !entry.name.includes("-lite")) {
        const key = basename(entry.name, ".glb");
        if (!found.has(key)) found.set(key, full);
      }
    }
  };
  walk(dir);
  return found;
}

function loadModel(key: string, path: string): ModelFacts {
  const json = readGlbJson(path);
  const usedPositions = new Set<number>();
  for (const mesh of json.meshes ?? [])
    for (const primitive of mesh.primitives ?? [])
      if (typeof primitive.material === "number") usedPositions.add(primitive.material);
  const materials: MaterialFacts[] = (json.materials ?? []).map((material: any, position: number) => {
    const factor = material.pbrMetallicRoughness?.baseColorFactor;
    const explicitIndex = Number((material.name || "").match(/material-(\d+)/)?.[1]);
    return {
      name: material.name ?? "",
      index: Number.isFinite(explicitIndex) ? explicitIndex : position,
      baseColor: factor ? [factor[0], factor[1], factor[2]] : null,
      position,
      rendered: usedPositions.has(position),
    };
  });
  return {
    basename: key,
    itemType: ITEM_TYPE_OVERRIDES[key] ?? key,
    path,
    materials,
  };
}

/* -------------------------------------------------------------------------- */
/* L2：加载器分发闸门回放                                                      */
/* -------------------------------------------------------------------------- */

const loaderSource = readFileSync(
  join(PROJECT_ROOT, "frontend/src/app/3d-studio/loaders/studio-external-models.ts"),
  "utf8",
);
const codecSource = readFileSync(
  join(PROJECT_ROOT, "frontend/src/app/3d-studio/model-template-codec.ts"),
  "utf8",
);
const ROLES_SOURCE = join(
  PROJECT_ROOT,
  "frontend/src/app/3d-studio/materials/studio-model-material-roles.ts",
);

/** 粗解析 `NAME = new Set([ "a", "b" ])` 里的字符串字面量。 */
function parseStringSet(source: string, name: string): Set<string> {
  const match = new RegExp(`(?:const\\s+)?\\b${name}\\s*[:=]\\s*new Set\\(\\[`).exec(source);
  if (!match) throw new Error(`set not found in loader: ${name}`);
  const open = source.indexOf("[", match.index);
  const close = source.indexOf("])", open);
  return new Set([...source.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

const paletteOverrideItemTypes = parseStringSet(loaderSource, "paletteOverrideItemTypes");
const warmWoodFurnitureItemTypes = parseStringSet(loaderSource, "warmWoodFurnitureItemTypes");
const applianceItemTypes = parseStringSet(loaderSource, "applianceItemTypes");
const gardenItemTypes = parseStringSet(loaderSource, "gardenItemTypes");
const pillarShapes = parseStringSet(loaderSource, "PILLAR_ASSET_SHAPES");

/** roleTableItemTypes = Object.keys(MODEL_SLOT_ROLES) + 字面量补充项。 */
const roleTableExtrasSource = loaderSource.slice(
  loaderSource.indexOf("roleTableItemTypes = new Set(["),
  loaderSource.indexOf("]),", loaderSource.indexOf("roleTableItemTypes = new Set([")),
);
const roleTableItemTypes = new Set([
  ...Object.keys(MODEL_SLOT_ROLES),
  ...[...roleTableExtrasSource.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
]);

/** COURTYARD_MODELS 的键是 `"garden-" + modelKey` 拼出来的。 */
function parseCourtyardKeys(): Set<string> {
  const source = readFileSync(join(PROJECT_ROOT, "frontend/src/app/3d-studio/plan/courtyard-models.ts"), "utf8");
  const start = source.indexOf("COURTYARD_MODELS");
  const end = source.indexOf('"garden-" + modelKey', start);
  const keys = [...source.slice(start, end).matchAll(/\["([a-z0-9-]+)",\s*"/g)].map((m) => m[1]);
  return new Set(keys.map((key) => `garden-${key}`));
}

function parseDecorKeys(): Set<string> {
  const source = readFileSync(join(PROJECT_ROOT, "frontend/src/app/3d-studio/studio/decor-models.ts"), "utf8");
  const start = source.indexOf("DECOR_MODELS = Object.freeze({");
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n  });", open);
  const body = source.slice(open, close < 0 ? source.length : close);
  return new Set([...body.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1]));
}

const courtyardKeys = parseCourtyardKeys();
const decorKeys = parseDecorKeys();

const DEDICATED_ITEM_TYPES = new Set([
  "stairs",
  "steelstairs",
  "glassstairs",
  "floatingstairs",
  "pillar",
  ...[...pillarShapes].map((shape) => `pillar_${shape}`),
  ...[...pillarShapes].map((shape) => `pillar-${shape}`),
  "car",
  "smallcar",
  "suv",
  "scooter",
  "elevator",
  ...LIGHT_ITEM_TYPES,
]);

const isDispatched = (itemType: string, materialName: string, warm: boolean) =>
  paletteOverrideItemTypes.has(itemType) ||
  (itemType === "aquarium" && materialName.startsWith("aquarium-aquatic-")) ||
  courtyardKeys.has(itemType) ||
  decorKeys.has(itemType) ||
  materialName.includes("-furniture-") ||
  gardenItemTypes.has(itemType) ||
  applianceItemTypes.has(itemType) ||
  (roleTableItemTypes.has(itemType) && !isStructuralModelFamily(resolveModelFamily(itemType))) ||
  (warm && warmWoodFurnitureItemTypes.has(itemType));

/**
 * 上面的 `isDispatched` 是**手写镜像**；它只能证明「按当前集合应当分发」，不能证明加载器
 * 真的这么做。所以额外对加载器源码做存在性断言，防止闸门被删/被弱化后镜像继续自嗨。
 */
function auditLoaderSource(push: (message: string) => void): void {
  const gateFunctionStart = loaderSource.indexOf("function usesDetailMaterialPipeline("),
    gateFunction = loaderSource.slice(
      gateFunctionStart,
      gateFunctionStart + 1800,
    ),
    resolvedMaterialExpression = loaderSource.slice(
      loaderSource.indexOf("const resolvedMaterial ="),
      loaderSource.indexOf("applyItemDetailMaterial(sourceMaterial, palette, itemType)"),
    );
  if (gateFunctionStart < 0 || !gateFunction.includes("roleTableItemTypes.has(itemType)")) {
    push(
      "L2 加载器分发闸门缺失：usesDetailMaterialPipeline 里没有 roleTableItemTypes.has(itemType)（默认主题会退回 GLB 烘焙色）",
    );
  }
  if (gateFunctionStart < 0 || !gateFunction.includes("isStructuralModelFamily(resolveModelFamily(itemType))")) {
    push("L2 加载器分发闸门缺少结构型模型排除条件（楼梯 / 柱族会被误纳入角色表）");
  }
  if (!resolvedMaterialExpression.includes("usesDetailMaterialPipeline(itemType, sourceMaterial.name, palette)")) {
    push(
      "L2 resolveSharedMaterial 没有走 usesDetailMaterialPipeline：闸门可能被重新内联成另一套判据，检查面板会与画面不一致",
    );
  }
  const overrideCallIndex = loaderSource.indexOf(
      "applyMaterialOverride(resolvedMaterial, sourceMaterial.name, palette)",
    ),
    resolvedSignatureIndex = loaderSource.indexOf("const resolvedSignature = materialSignature(resolvedMaterial)");
  if (overrideCallIndex < 0) {
    push("L2 逐物件材质覆盖色没有落到 resolveSharedMaterial（item.materialOverrides 将静默失效）");
  } else if (resolvedSignatureIndex > 0 && overrideCallIndex > resolvedSignatureIndex) {
    push(
      "L2 applyMaterialOverride 必须在 materialSignature 之前执行：放在之后会让不同覆盖色共用同一份缓存材质",
    );
  }
  const overrideColorFunction = loaderSource.slice(
    loaderSource.indexOf("function materialOverrideColorFor("),
    loaderSource.indexOf("function applyMaterialOverride("),
  );
  if (!overrideColorFunction.includes("/^#[0-9a-f]{6}$/i.test(overrideColor)")) {
    push("L2 materialOverrideColorFor 没有 #rrggbb 形态校验（非法覆盖色会直写 Color）");
  }
  const applyDetailStart = loaderSource.indexOf("function applyItemDetailMaterial(");
  const applyDetailBody = loaderSource.slice(applyDetailStart, applyDetailStart + 2000);
  if (!applyDetailBody.includes("materialRoleRecipeFor(detailItemType")) {
    push("L2 applyItemDetailMaterial 内部缺少角色表分支（materialRoleRecipeFor）");
  }
  if (!applyDetailBody.includes("usesNamedMaterialRole(detailMaterial.name)")) {
    push("L2 applyItemDetailMaterial 内部缺少「材质名已带角色则跳过」的判定");
  }
}

/**
 * L1b：`multiply` 必须逐通道缩放。
 *
 * 曾经的实现是 `resolvePaletteColor(...) * (recipe.multiply ?? 1)`：色号是 0xRRGGBB
 * 打包整数，直接乘系数会让低位通道向高位借位 —— `0x687488 * 0.45` 得 `0x2f013d`（紫红），
 * 暖木 `0x4b5455 * 0.45` 得 `0x21e5f3`（亮青）。这里做两道断言：
 *   1. 源码里不允许再出现「打包整数 × multiply」的写法；
 *   2. 已知 `recess` 角色的成品色号金标准（nas 默认 #2f343d / 暖木 #222626）。
 */
function auditMultiplyScaling(push: (message: string) => void): void {
  const rolesSource = readFileSync(ROLES_SOURCE, "utf8"),
    // 逐物件档位表（studio-material-presets）也要走同一条逐通道缩放，不能自己乘整型。
    presetsSource = readFileSync(PRESETS_SOURCE_PATH, "utf8");
  if (/resolveMaterialPaletteColor\([^)]*\)\s*\*\s*\(?\s*recipe\.multiply/.test(rolesSource)) {
    push("L1b 角色表把 multiply 直接乘在打包色号上（会串道：紫红 / 亮青），必须逐通道缩放");
  }
  if (!rolesSource.includes("export function scaleMaterialColorChannels(")) {
    push("L1b 角色表缺少 scaleMaterialColorChannels（逐通道缩放 multiply）实现");
  }
  if (!presetsSource.includes("scaleMaterialColorChannels(")) {
    push("L1b 档位表没有走 scaleMaterialColorChannels（档位里的 multiply 会串道）");
  }
  for (const [label, palette, expected] of [
    ["default", DEFAULT_PALETTE, 0x2f343d],
    ["warm", WARM_PALETTE, 0x222626],
  ] as const) {
    const recipe = materialRoleRecipeFor("nas", "nas-material-2", palette, 2);
    if (!recipe) {
      push(`L1b nas #2 recess 在 ${label} 色板下取不到配方`);
      continue;
    }
    if (recipe.colorValue !== expected) {
      push(`L1b nas #2 recess 色号串道/${label}: 期望 ${hex(expected)}，实际 ${hex(recipe.colorValue)}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* L5：逐物件材质覆盖色（检查面板 ↔ 加载器 ↔ 存档）的接线                        */
/* -------------------------------------------------------------------------- */

const STUDIO_SOURCE_PATH = join(
    PROJECT_ROOT,
    "frontend/src/app/3d-studio/studio/studio-app.ts",
  ),
  STUDIO_HTML_PATH = join(PROJECT_ROOT, "frontend/pages/3d-studio.html"),
  STUDIO_CSS_PATH = join(PROJECT_ROOT, "frontend/public/static/3d-studio/studio.css"),
  PRESETS_SOURCE_PATH = join(
    PROJECT_ROOT,
    "frontend/src/app/3d-studio/materials/studio-material-presets.ts",
  );

/**
 * 「材质属性」检查面板把覆盖色写进 `item.materialOverrides`，渲染时才在加载器里生效。
 * 这条链跨了四个文件，任何一环被删掉都只会表现为「面板能点但画面不变」——没有报错、
 * 没有类型错误，所以在这里做存在性断言。
 */
function auditMaterialOverrideWiring(push: (message: string) => void): void {
  const studioSource = readFileSync(STUDIO_SOURCE_PATH, "utf8"),
    studioHtml = readFileSync(STUDIO_HTML_PATH, "utf8"),
    studioCss = readFileSync(STUDIO_CSS_PATH, "utf8"),
    rolesSource = readFileSync(ROLES_SOURCE, "utf8");
  if (!studioSource.includes("materialLoadOptionsForItem(itemRecordRef)")) {
    push("L5 applyItemOptimization 没有把 item.materialOverrides 并进模型加载选项（覆盖色到不了加载器）");
  }
  if (!studioSource.includes("materialOverrides = itemMaterialOverrides")) {
    push("L5 materialLoadOptionsForItem 没有产出 materialOverrides 键（optionsSignature 也不会随之变化）");
  }
  if (!studioSource.includes("normalizeMaterialOverrides(rawItemRecord?.materialOverrides)")) {
    push("L5 normalizeScenePayload 没有净化 item.materialOverrides（覆盖色存不住，重新打开就丢）");
  }
  if (!studioSource.includes("describeItemMaterials(")) {
    push("L5 studio-app 没有调用 loader.describeItemMaterials（检查面板拿不到槽位）");
  }
  if (!studioSource.includes("setItemMaterialOverride(")) {
    push("L5 studio-app 缺少 setItemMaterialOverride（面板改色没有落盘入口）");
  }
  for (const requiredHtmlId of ["material-fields", "material-slot-list", "material-reset-all"]) {
    if (!studioHtml.includes(`id="${requiredHtmlId}"`)) {
      push(`L5 3d-studio.html 缺少 #${requiredHtmlId}（检查面板没有挂载点）`);
    }
  }
  for (const requiredCssClass of [".material-fields", ".material-slot", ".material-slot-color"]) {
    if (!studioCss.includes(requiredCssClass)) {
      push(`L5 studio.css 缺少 ${requiredCssClass}（检查面板会没有样式）`);
    }
  }
  // 角色词表必须全部有中文标签：漏一个，面板上就会出现英文角色名。
  const vocabularyMatch = /MATERIAL_ROLE_VOCABULARY = Object\.freeze\(\[([\s\S]*?)\] as const\)/.exec(
      rolesSource,
    ),
    labelBlockMatch = /MATERIAL_ROLE_LABELS: Readonly<Record<string, string>> = Object\.freeze\(\{([\s\S]*?)\n\}\)/.exec(
      rolesSource,
    );
  if (!vocabularyMatch || !labelBlockMatch) {
    push("L5 角色词表 / 中文标签表解析失败（materialRoleLabel 覆盖不全无法校验）");
    return;
  }
  const vocabularyRoles = [...vocabularyMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]),
    labelledRoles = new Set(
      [...labelBlockMatch[1].matchAll(/^\s*([A-Za-z]+)\s*:/gm)].map((m) => m[1]),
    ),
    unlabelledRoles = vocabularyRoles.filter((role) => !labelledRoles.has(role)),
    staleLabels = [...labelledRoles].filter((role) => !vocabularyRoles.includes(role));
  // 词表解析塌成 0 条时上面的差集也会是空集，等于闸门自己失效：这里先钉住下限。
  if (vocabularyRoles.length < 40 || labelledRoles.size < 40) {
    push(
      `L5 角色词表 / 中文标签表解析结果异常（词表 ${vocabularyRoles.length} 条 / 标签 ${labelledRoles.size} 条）`,
    );
  }
  if (unlabelledRoles.length) {
    push(`L5 角色缺中文标签：${unlabelledRoles.sort().join("/")}（检查面板会显示英文角色名）`);
  }
  if (staleLabels.length) {
    push(`L5 中文标签表有词表外的角色：${staleLabels.sort().join("/")}（多半是角色改名后的残留）`);
  }
}

/* -------------------------------------------------------------------------- */
/* L4：与 0.6.5 的几何指纹配对                                                  */
/* -------------------------------------------------------------------------- */

const NAME_ALIASES: Record<string, string> = {
  bunkbed: "bunk-bed",
  chestdrawer: "drawer-chest",
  armchair: "sofa-single",
  computertable: "desk",
  booktower: "shelf",
};

type Fingerprint = { count: number; dims: number[] };

type PrimFacts = {
  count: number;
  box: number[];
  meshIndex: number;
  role: string | null;
  materialName: string;
  materialIndex: number;
};

function primitivesOf(path: string): PrimFacts[] {
  const json = readGlbJson(path);
  const out: PrimFacts[] = [];
  const nodeRoleByMesh = new Map<number, string>();
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    const role = String(node.name ?? "").match(/material-\d+-([a-z][a-z0-9]*)/)?.[1];
    if (role) nodeRoleByMesh.set(node.mesh, role);
  }
  (json.meshes ?? []).forEach((mesh: any, meshIndex: number) => {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      const materialIndex = primitive.material ?? -1;
      const materialName = String(json.materials?.[materialIndex]?.name ?? "");
      const named = materialName.match(/material-\d+-([a-z][a-z0-9]*)/)?.[1];
      out.push({
        count: accessor.count ?? 0,
        box: [...accessor.min, ...accessor.max],
        meshIndex,
        role: named ?? nodeRoleByMesh.get(meshIndex) ?? null,
        materialName,
        materialIndex,
      });
    }
  });
  return out;
}

const modelExtent = (prims: { box: number[] }[]) => {
  let max = 0;
  for (const prim of prims) {
    for (let axis = 0; axis < 3; axis += 1) {
      max = Math.max(max, Math.abs(prim.box[3 + axis] - prim.box[axis]));
    }
  }
  return max;
};

const fingerprint = (extent: number) => (count: number, box: number[]): Fingerprint => ({
  count,
  dims: [box[3] - box[0], box[4] - box[1], box[5] - box[2]]
    .map((value) => Math.abs(value) / extent)
    .sort((a, b) => b - a),
});

function matchScore(a: Fingerprint, b: Fingerprint, tolerance = 0.09): number {
  const countGap = Math.abs(a.count - b.count) / Math.max(a.count, b.count, 1);
  if (countGap > 0.3) return -1;
  let worst = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const base = Math.max(a.dims[axis], b.dims[axis]);
    if (base < 1e-6) return -1;
    worst = Math.max(worst, Math.abs(a.dims[axis] - b.dims[axis]) / base);
  }
  if (worst > tolerance) return -1;
  return worst + countGap * 0.2;
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */

const problems: string[] = [];
const notes: string[] = [];
const hex = (value: number) => "#" + (value >>> 0).toString(16).padStart(6, "0");

if (!existsSync(MODELS_DIR)) {
  console.error(`✗ 找不到模型目录：${MODELS_DIR}`);
  process.exit(1);
}

const glbs = collectGlbs(MODELS_DIR);
auditLoaderSource((message) => problems.push(message));
auditMultiplyScaling((message) => problems.push(message));
auditMaterialOverrideWiring((message) => problems.push(message));
const models: ModelFacts[] = [];
for (const [key, path] of glbs) {
  if (only && key !== only) continue;
  models.push(loadModel(key, path));
}

let materialCount = 0;
let lightModels = 0;
let coverageChecks = 0;

for (const model of models) {
  const { itemType } = model;
  const family = resolveModelFamily(itemType);
  const isLight = LIGHT_ITEM_TYPES.has(itemType);
  if (isLight) lightModels += 1;

  /* L1 覆盖 + 配方健全性 */
  for (const material of model.materials) {
    materialCount += 1;
    const resolution = resolveModelMaterialRole(itemType, material.name, material.index);
    if (!resolution.role) problems.push(`L1 角色缺失 ${itemType} :: ${material.name}`);
    for (const [label, palette] of PALETTES) {
      coverageChecks += 1;
      const recipe = materialRoleRecipeFor(itemType, material.name, palette, material.index);
      if (!recipe) {
        problems.push(`L1 配方缺失/${label} ${itemType} :: ${material.name}`);
        continue;
      }
      if (isLight) continue;
      const value = recipe.colorValue;
      const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
      const invalid =
        !Number.isFinite(value) ||
        value === 0 ||
        channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255);
      if (invalid && !THEME_TABLE_FAMILIES.has(family)) {
        problems.push(`L1 颜色异常/${label} ${itemType} :: ${material.name} -> ${hex(value)}`);
      }
      if (recipe.transparent && !(recipe.opacity > 0 && recipe.opacity <= 1)) {
        problems.push(`L1 透明度异常/${label} ${itemType} :: ${material.name} -> ${recipe.opacity}`);
      }
    }
  }

  /* L2 分发闸门 */
  if (!isLight) {
    const structural = isStructuralModelFamily(family);
    const dedicated = DEDICATED_ITEM_TYPES.has(itemType);
    for (const [label, palette] of PALETTES) {
      const warm = palette.warmWood === true;
      const dispatched = model.materials.some((material) => isDispatched(itemType, material.name, warm));
      if (!dispatched && !dedicated) {
        problems.push(`L2 未分发/${label} ${itemType} (family=${family})`);
      }
      // 角色表集合内的模型：确认角色表分支真的会命中。
      if (roleTableItemTypes.has(itemType) && !structural && !dedicated && dispatched) {
        const hits = model.materials.filter(
          (material) =>
            !usesNamedMaterialRole(material.name) &&
            materialRoleRecipeFor(itemType, material.name, palette, material.index) != null,
        );
        if (!hits.length) problems.push(`L2 角色表未生效/${label} ${itemType}`);
      }
      // 结构型 / 专用型：角色数据仍必须可解析。
      if ((structural || dedicated) && dispatched) {
        for (const material of model.materials) {
          if (!resolveModelMaterialRole(itemType, material.name, material.index).role) {
            problems.push(`L2 结构模型缺角色/${label} ${itemType} :: ${material.name}`);
          }
        }
      }
    }

    /* L3 槽位表必须覆盖真实材质数，且区间无空洞 */
    const slotRoles = MODEL_SLOT_ROLES[itemType];
    if (slotRoles) {
      if (slotRoles.length < model.materials.length) {
        problems.push(
          `L3 槽位表偏短 ${itemType}: 表 ${slotRoles.length} 槽 < GLB ${model.materials.length} 材质`,
        );
      }
      model.materials.forEach((material, position) => {
        const role = slotRoles[position];
        if (role == null) {
          problems.push(`L3 槽位空洞 ${itemType} #${position} (${material.name})`);
        }
      });
      for (const [position, role] of slotRoles.entries()) {
        if (role == null) continue;
        const slotName = `${itemType}-material-${position}`;
        const resolved = resolveModelMaterialRole(itemType, slotName, position);
        if (resolved.source !== "role-table" || resolved.role !== role) {
          problems.push(
            `L3 解析不一致 ${itemType} #${position}: 期望 ${role}，实际 ${resolved.role}/${resolved.source}`,
          );
        }
      }
    }
  }
}

/* L4 与 0.6.5 对齐（参考目录可选） */
let parityCompared = 0;
let parityExempted = 0;
let paritySkipped = 0;
let parityModelsPaired = 0;
let parityModelsCommon = 0;
let roleSetCompared = 0;
let roleSetLost = 0;
let roleSetLostAuthoritative = 0;
if (!skipParity && existsSync(REFERENCE_DIR)) {
  const referenceGlbs = collectGlbs(REFERENCE_DIR);
  for (const model of models) {
    const referenceName =
      Object.entries(NAME_ALIASES).find(([, value]) => value === model.basename)?.[0] ?? model.basename;
    const referencePath = referenceGlbs.get(referenceName);
    if (!referencePath) continue;
    const oldPrims = primitivesOf(referencePath).filter((prim) => prim.role);
    if (!oldPrims.length) continue;
    const newPrims = primitivesOf(model.path);
    const oldFingerprint = fingerprint(modelExtent(oldPrims));
    const newFingerprint = fingerprint(modelExtent(newPrims));
    const candidates = oldPrims.map((prim) => ({ prim, fp: oldFingerprint(prim.count, prim.box) }));
    const used = new Set<(typeof oldPrims)[number]>();
    for (const prim of newPrims) {
      let best: (typeof candidates)[number] | null = null;
      let bestScore = Infinity;
      for (const candidate of candidates) {
        if (used.has(candidate.prim)) continue;
        const score = matchScore(newFingerprint(prim.count, prim.box), candidate.fp);
        if (score >= 0 && score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) {
        paritySkipped += 1;
        continue;
      }
      used.add(best.prim);
      parityCompared += 1;
      const actual = resolveModelMaterialRole(
        model.itemType,
        prim.materialName,
        prim.materialIndex,
      ).role;
      if (actual === best.prim.role) continue;
      if (exemptionFor(model.basename, prim.materialIndex)) {
        parityExempted += 1;
        notes.push(
          `L4 豁免 ${model.basename} #${prim.materialIndex}（表=${actual} / 0.6.5=${best.prim.role}）`,
        );
        continue;
      }
      problems.push(
        `L4 与 0.6.5 不一致 ${model.basename} #${prim.materialIndex}: 角色表=${actual} vs 0.6.5=${best.prim.role}`,
      );
    }

    /* L4b：几何指纹会因新 GLB 重新导出（顶点数 / 朝向 / 合并粒度变化）而配不上，
     * 因此再补一层「角色集合」对齐，覆盖全部同名模型：0.6.5 里出现过的语义角色，
     * 新表里必须有落点，否则说明某个语义在迁移中丢了。 */
    parityModelsCommon += 1;
    if (used.size) parityModelsPaired += 1;
    const oldRoles = new Set(oldPrims.map((prim) => prim.role).filter(Boolean));
    const newRoles = new Set(
      model.materials
        .map((material) => resolveModelMaterialRole(model.itemType, material.name, material.index).role)
        .filter(Boolean),
    );
    const lost = [...oldRoles].filter((role) => !newRoles.has(role));
    roleSetCompared += oldRoles.size;
    roleSetLost += lost.length;
    if (lost.length) {
      // 分歧归因：材质名自带角色（`<type>-furniture-role` 等）时角色由**资产**决定，
      // 代码无法干预；只有 `<type>-material-N` 这类无角色命名的模型，槽位角色表才是权威。
      const tableAuthoritative = model.materials.every((material) => !usesNamedMaterialRole(material.name));
      const comparable = model.materials.length >= oldRoles.size;
      const tag = tableAuthoritative ? "A" : "B";
      if (tableAuthoritative) roleSetLostAuthoritative += lost.length;
      notes.push(
        `L4b${tag}${comparable ? "[槽位足够]" : ""} ${model.basename}: ` +
          `0.6.5 有而新表无 -> ${lost.join(", ")}` +
          `（新槽 ${model.materials.length} / 0.6.5 角色 ${oldRoles.size}` +
          ` | 0.6.5=${[...oldRoles].sort().join("/")} | 新=${[...newRoles].sort().join("/")}）`,
      );
    }
  }
} else if (!skipParity) {
  notes.push(`L4 跳过：参考目录不存在（${REFERENCE_DIR}）`);
}

auditMaterialStylePresets(
  models,
  (message) => problems.push(message),
  (message) => notes.push(message),
);

/* -------------------------------------------------------------------------- */
/* L6：逐物件「材质风格」档位（预设）                                            */
/* -------------------------------------------------------------------------- */

/**
 * L6 把「老版本的预设值」这条链钉住。档位表本身可以改内容，但四件事不许退化：
 *
 *   L6a 目录：id 全局唯一、中文标签齐、角色都在词表内、每档至少给出角色配方或调色板覆盖；
 *   L6b 接线：加载器里档位配方必须落在逐槽覆盖色**之前**；studio-app / HTML / CSS 的
 *             档位下拉、入库净化、options 合并各环节都要在（任一环被删＝面板能选但画面不变）；
 *   L6c 生效：对每个支持档位的模型，至少有一档能覆盖它 ≥60% 的材质槽位（下拉不是摆设）；
 *   L6d 出图：档位的每个角色配方在默认 / 暖木两套色板下都能解析出健全颜色与表面参数。
 */
function auditMaterialStylePresets(
  modelList: ModelFacts[],
  push: (message: string) => void,
  note: (message: string) => void,
): void {
  const presetsSource = readFileSync(PRESETS_SOURCE_PATH, "utf8"),
    studioSource = readFileSync(STUDIO_SOURCE_PATH, "utf8"),
    studioHtml = readFileSync(STUDIO_HTML_PATH, "utf8"),
    studioCss = readFileSync(STUDIO_CSS_PATH, "utf8");

  // ── L6a 目录健全性 ────────────────────────────────────────────────────────
  if (MATERIAL_STYLE_SUMMARY.groupCount < 15 || MATERIAL_STYLE_SUMMARY.presetCount < 40) {
    push(
      `L6a 档位目录疑似被删档：${MATERIAL_STYLE_SUMMARY.groupCount} 组 / ` +
        `${MATERIAL_STYLE_SUMMARY.presetCount} 档（0.6.5 全套为 17 组 / 50+ 档）`,
    );
  }
  const seenPresetIds = new Set<string>(),
    duplicatedPresetIds = new Set<string>(),
    groupByPresetId = new Map<string, string>();
  for (const [groupName, presetIds] of Object.entries(MATERIAL_STYLE_SUMMARY.groups)) {
    if (!presetIds.length) push(`L6a 档位组 ${groupName} 是空的（下拉会只剩「跟随全局风格」）`);
    for (const presetId of presetIds) {
      if (seenPresetIds.has(presetId)) duplicatedPresetIds.add(presetId);
      seenPresetIds.add(presetId);
      groupByPresetId.set(presetId, groupName);
    }
  }
  if (duplicatedPresetIds.size) {
    push(
      `L6a 档位 id 跨组重复：${[...duplicatedPresetIds].sort().join("/")}` +
        "（id 是落进草稿的键，重复会让同一份草稿在不同模型上解析到不同档位）",
    );
  }
  // 逐档体检：直接读档位定义本体，而不是按「组名 → 模型类型」反查（反查不到会静默跳过整段校验）。
  for (const preset of MATERIAL_STYLE_PRESET_LIST) {
    const presetGroupName = groupByPresetId.get(preset.id) || "?";
    if (!preset.label || !/[\u4e00-\u9fff]/.test(preset.label)) {
      push(`L6a 档位 ${preset.id}（组 ${presetGroupName}）缺少中文标签（下拉显示会空白）`);
    }
    const roleNames = Object.keys(preset.roles),
      colorKeys = Object.keys(preset.colors);
    if (!roleNames.length && !colorKeys.length) {
      push(`L6a 档位 ${preset.id} 既没有角色配方也没有调色板覆盖（选了不会有任何变化）`);
    }
    for (const roleName of roleNames) {
      if (!MATERIAL_ROLE_VOCABULARY_SET.has(roleName)) {
        push(`L6a 档位 ${preset.id} 用了词表外的角色 ${roleName}（resolveModelMaterialRole 永不产出该角色）`);
      }
    }
    for (const colorKey of colorKeys) {
      if (!PALETTE_KEY_NAMES.has(colorKey)) {
        push(`L6a 档位 ${preset.id} 覆盖了未知调色板键 ${colorKey}（合并后不生效）`);
      }
    }
    if (!preset.id || !/^[a-z0-9-]+$/.test(preset.id)) {
      push(`L6a 档位 id 「${preset.id}」不是稳定的 kebab-case（写进草稿后容易漂移）`);
    }
  }
  if (MATERIAL_STYLE_PRESET_LIST.length < 40) {
    push(`L6a 档位定义只有 ${MATERIAL_STYLE_PRESET_LIST.length} 档（不足 40 档说明被误删）`);
  }

  // ── L6b 接线存在性 ────────────────────────────────────────────────────────
  const styleCallIndex = loaderSource.indexOf(
      "applyMaterialStyleRecipe(resolvedMaterial, sourceMaterial.name, itemType, palette)",
    ),
    overrideCallIndex = loaderSource.indexOf(
      "applyMaterialOverride(resolvedMaterial, sourceMaterial.name, palette)",
    );
  if (!loaderSource.includes('from "../materials/studio-material-presets"')) {
    push("L6b 加载器没有引用 studio-material-presets（档位到不了渲染）");
  }
  if (styleCallIndex < 0) {
    push("L6b resolveSharedMaterial 缺少 applyMaterialStyleRecipe 调用（选了档位画面不变）");
  } else if (overrideCallIndex >= 0 && styleCallIndex > overrideCallIndex) {
    push("L6b 档位配方落在逐槽覆盖色之后（手工挑的颜色会被档位盖掉，层级反了）");
  }
  for (const [requiredSnippet, message] of [
    [
      "materialStylePaletteColors(itemModelType, itemMaterialStyle)",
      "L6b materialLoadOptionsForItem 没有合并档位调色板（档位色彩进不了 optionsSignature）",
    ],
    [
      "itemMaterialStyle !== MATERIAL_STYLE_AUTO && (itemLoadOptions.materialStyle = itemMaterialStyle)",
      "L6b 档位 id 没有并进模型加载选项（加载器读不到 palette.materialStyle）",
    ],
    [
      "normalizeItemMaterialStyle(rawItemRecord)",
      "L6b normalizeScenePayload 没有净化 item.materialStyle（档位存不住，重新打开就丢）",
    ],
    ["setItemMaterialStyle(", "L6b studio-app 缺少 setItemMaterialStyle（色卡条没有落盘入口）"],
    ["resetItemMaterialAll()", "L6b 「全部跟随主题」没有复位档位（按钮只会清颜色）"],
    [
      'materialStyleStripElement.addEventListener("click"',
      "L6b 档位色卡条没有 click 监听（点了不生效）",
    ],
    ["syncMaterialStyleStrip(", "L6b 缺少档位色卡条的填充函数（面板不会按模型类型重建档位）"],
    // L6e 的三项能力同样要有接线：存预设 / 应用到同类 / 逐槽表面参数。
    [
      "saveCurrentItemMaterialStyle(",
      "L6b studio-app 缺少 saveCurrentItemMaterialStyle（「存为我的预设」点了不落盘）",
    ],
    [
      "applyMaterialToSameModelItems(",
      "L6b studio-app 缺少 applyMaterialToSameModelItems（「应用到同类」点了不动）",
    ],
    [
      "setItemMaterialSurfaceOverride(",
      "L6b studio-app 缺少 setItemMaterialSurfaceOverride（逐槽表面参数改了不生效）",
    ],
    [
      "materialSurfaceOverrides",
      "L6b 加载器没有读 materialSurfaceOverrides（表面参数改不动物件）",
    ],
  ] as const) {
    if (!studioSource.includes(requiredSnippet)) {
      push(message);
    } else if (requiredSnippet.startsWith("materialStylePaletteColors")) {
      // 合并必须发生在 materialLoadOptionsForItem 内部，不能被搬到别处后再也传不进加载器。
      const optionsFunctionStart = studioSource.indexOf("function materialLoadOptionsForItem("),
        optionsFunctionEnd = studioSource.indexOf("\nfunction ", optionsFunctionStart + 1);
      if (
        optionsFunctionStart < 0 ||
        studioSource.slice(optionsFunctionStart, optionsFunctionEnd).indexOf(requiredSnippet) < 0
      ) {
        push("L6b 档位调色板合并不在 materialLoadOptionsForItem 内（optionsSignature 不会随档位变化）");
      }
    }
  }
  for (const requiredHtmlId of [
    "material-fields",
    "material-style-field",
    "material-style-strip",
    "material-slot-list",
    "material-slot-groups",
  ]) {
    if (!studioHtml.includes(`id="${requiredHtmlId}"`)) {
      push(`L6b 3d-studio.html 缺少 #${requiredHtmlId}（材质面板没有挂载点）`);
    }
  }
  for (const requiredCssClass of [
    ".material-style-field",
    ".material-style-chip",
    ".material-slot-hex",
    ".material-slot-surface-field",
    ".inspector-group-header",
  ]) {
    if (!studioCss.includes(requiredCssClass)) {
      push(`L6b studio.css 缺少 ${requiredCssClass}（新面板会没有样式）`);
    }
  }
  if (!presetsSource.includes("MATERIAL_STYLE_AUTO")) {
    push("L6b 档位模块缺少 auto 常量（「跟随全局风格」档位名无从表达）");
  }

  // ── L6c 逐模型生效性 ──────────────────────────────────────────────────────
  let capableModels = 0,
    presetResolvedSlots = 0,
    thinCoverageModels = 0,
    uncapableBecauseStructural = 0;
  for (const model of modelList) {
    if (!model.materials.length) continue;
    const capable = isMaterialStyleCapable(model.itemType);
    const family = resolveModelFamily(model.itemType);
    if (!capable) {
      if (
        !isStructuralModelFamily(family) &&
        !["garden", "tea", "misc", "decor", "stair", "vehicle"].includes(family)
      ) {
        // 家族有档位组却没给这个模型挂上：多半是新模型忘了登记。
        push(`L6c ${model.basename}（家族 ${family}）没有档位组，下拉会整块消失`);
      } else if (isStructuralModelFamily(family)) {
        uncapableBecauseStructural += 1;
      }
      continue;
    }
    capableModels += 1;
    const presetList = materialStyleOptionsFor(model.itemType);
    if (!presetList.length) {
      push(`L6c ${model.basename} 声明支持档位却一档都没有（下拉只剩 auto）`);
      continue;
    }
    let bestCoverage = 0,
      bestPresetId = "";
    for (const preset of presetList) {
      let coveredCount = 0;
      for (const material of model.materials) {
        const coveredInEitherPalette = PALETTES.some(([, palette]) =>
          Boolean(
            materialStyleRecipeFor(model.itemType, material.name, {
              ...palette,
              ...preset.colors,
              materialStyle: preset.id,
            }),
          ),
        );
        if (coveredInEitherPalette) {
          coveredCount += 1;
          presetResolvedSlots += 1;
        }
      }
      if (coveredCount / model.materials.length > bestCoverage) {
        ((bestCoverage = coveredCount / model.materials.length), (bestPresetId = preset.id));
      }
    }
    // 只改调色板键的档位（如石材台面）没有角色配方，靠家族底表读色生效，不参与覆盖率断言。
    const roleBearingPresets = presetList.filter((preset) => Object.keys(preset.roles).length);
    if (roleBearingPresets.length && bestCoverage < 0.6) {
      thinCoverageModels += 1;
      push(
        `L6c ${model.basename}（${model.itemType}）最优档位只覆盖 ` +
          `${Math.round(bestCoverage * 100)}% 槽位（最优=${bestPresetId}）；选档位对这件基本无效`,
      );
    }
  }
  if (capableModels < 30) {
    push(`L6c 支持档位的模型只有 ${capableModels} 个（档位覆盖面疑似被收窄）`);
  }
  // 档位组可达性：任何一组都至少要有一个真实模型能选到，否则就是「死档位」（0.6.5 里
  // 石材台面组就曾因没挂模型而整组不可达，这里把它钉住）。
  const reachablePresetIds = new Set<string>();
  for (const model of modelList) {
    if (!isMaterialStyleCapable(model.itemType)) continue;
    for (const preset of materialStyleOptionsFor(model.itemType)) reachablePresetIds.add(preset.id);
  }
  for (const [groupName, presetIds] of Object.entries(MATERIAL_STYLE_SUMMARY.groups)) {
    if (!presetIds.some((presetId) => reachablePresetIds.has(presetId))) {
      push(`L6c 档位组 ${groupName} 没有任何模型能选到（整组死档位，界面永远不显示）`);
    }
  }
  note(
    `L6c 档位覆盖：支持档位模型 ${capableModels} 个；两套色板下解析出配方 ${presetResolvedSlots} 次；` +
      `覆盖率不足 60% 的模型 ${thinCoverageModels} 个；结构件（按 0.6.5 排除表不带档位）${uncapableBecauseStructural} 个`,
  );

  // ── L6d 出图健全性 + 归一 ────────────────────────────────────────────────
  const isHealthyColor = (value: number) =>
    Number.isFinite(value) && value >= 0 && value <= 0xffffff && value !== 0;
  let recipeChecks = 0;
  for (const model of modelList) {
    if (!isMaterialStyleCapable(model.itemType)) continue;
    for (const preset of materialStyleOptionsFor(model.itemType)) {
      for (const [paletteName, palette] of PALETTES) {
        const styledPalette = { ...palette, ...preset.colors, materialStyle: preset.id };
        for (const material of model.materials) {
          const recipe = materialStyleRecipeFor(model.itemType, material.name, styledPalette);
          if (!recipe) continue;
          recipeChecks += 1;
          if (recipe.colorValue !== undefined && !isHealthyColor(recipe.colorValue)) {
            push(
              `L6d 档位 ${preset.id} 在 ${paletteName} 色板下把 ${model.basename}#${material.index}` +
                `（${recipe.role}）算成了 ${hex(recipe.colorValue)}`,
            );
          }
          if (
            recipe.roughness !== undefined &&
            (!(recipe.roughness >= 0) || !(recipe.roughness <= 1))
          ) {
            push(`L6d 档位 ${preset.id} 的角色 ${recipe.role} 粗糙度越界（${recipe.roughness}）`);
          }
          if (
            recipe.metalness !== undefined &&
            (!(recipe.metalness >= 0) || !(recipe.metalness <= 1))
          ) {
            push(`L6d 档位 ${preset.id} 的角色 ${recipe.role} 金属度越界（${recipe.metalness}）`);
          }
        }
      }
    }
  }
  if (recipeChecks < 500) {
    push(`L6d 档位配方解析次数只有 ${recipeChecks} 次（闸门自己疑似失效）`);
  }
  // 归一：非法 id / 不支持的模型都必须落回 auto，否则会把垃圾值写进文档。
  const firstCapable = modelList.find((model) => isMaterialStyleCapable(model.itemType)),
    firstCapableId = firstCapable && materialStyleOptionsFor(firstCapable.itemType)[0]?.id;
  if (!firstCapable || !firstCapableId) {
    push("L6d 找不到可校验的档位模型（归一校验无从进行）");
  } else {
    if (normalizeMaterialStyle(firstCapable.itemType, firstCapableId) !== firstCapableId) {
      push(`L6d 合法档位 ${firstCapableId} 被 normalizeMaterialStyle 归一成了 auto`);
    }
    if (normalizeMaterialStyle(firstCapable.itemType, "not-a-preset") !== MATERIAL_STYLE_AUTO) {
      push("L6d 非法档位 id 没有被归一成 auto（会被写进文档）");
    }
    if (normalizeMaterialStyle("smallcar", firstCapableId) !== MATERIAL_STYLE_AUTO) {
      push("L6d 不支持档位的模型（smallcar）也接受了档位（归一失效）");
    }
  }
  note(`L6d 档位配方出图校验 ${recipeChecks} 次（两套色板 × 全部档位 × 全部槽位）`);

  // ── L6g 档位色卡与物件一致 ────────────────────────────────────────────────
  {
    /**
     * 色卡（下拉里那几格缩略色）必须**逐格都能在这件物件上找到**。
     *
     * 曾经的做法是「拿一份写死的调色板键去合并主题色板」：柜类真正的料键
     * （cabinetWood/cabinetBody/cabinetDoor）不在那份键表里，于是「木柜白门」的色卡显示的
     * 是家具暖木色 #c49a6c，而柜体实际刷的是 #5a3a22 深木 + #f5f3ef 白门；档位没声明的键
     * （木器四档都不写 countertop）又会漏进当前主题色，四档色卡最后一格完全相同。
     * 用户看到的就是「预设值与实际不匹配」。
     */
    let swatchChecked = 0,
      swatchMismatched = 0,
      swatchEmpty = 0;
    for (const model of modelList) {
      if (!isMaterialStyleCapable(model.itemType)) continue;
      // 与运行时 `describeItemMaterials` 一致：只取被图元引用的槽位，用材质数组位置当槽号。
      const renderedSlots = model.materials.filter((material) => material.rendered);
      if (!renderedSlots.length) continue;
      const slotRoles = renderedSlots.map(
        (material) =>
          resolveModelMaterialRole(model.itemType, material.name, material.position).role,
      );
      for (const preset of materialStyleOptionsFor(model.itemType)) {
        for (const [paletteName, palette] of PALETTES) {
          const styledPalette = { ...palette, ...preset.colors, materialStyle: preset.id };
          const objectColors = new Set(
            renderedSlots
              .map((material) => {
                // 加载器是「角色表先上色 → 档位配方最后覆盖」，所以档位没覆盖的槽位
                // 保留角色表颜色：这里必须两段都算，否则会把色卡误判成不符。
                const recipe =
                  materialStyleRecipeFor(
                    model.itemType,
                    material.name,
                    styledPalette,
                    material.position,
                  ) ??
                  materialRoleRecipeFor(
                    model.itemType,
                    material.name,
                    styledPalette,
                    material.position,
                  );
                return recipe?.colorValue === undefined ? null : hex(recipe.colorValue);
              })
              .filter((value): value is string => value !== null),
          );
          const swatchColors = materialStylePresetSwatchColors(
            preset,
            styledPalette,
            { roles: slotRoles, modelType: model.itemType },
          );
          swatchChecked += 1;
          if (!swatchColors.length || swatchColors[0] === "#6b7280") {
            swatchEmpty += 1;
            push(
              `L6g 档位 ${preset.id} 在 ${model.basename}（${paletteName}）上取不到色卡颜色` +
                "（色卡会是一条占位灰，看不出这档长什么样）",
            );
            continue;
          }
          const offObject = swatchColors.filter((swatchColor) => !objectColors.has(swatchColor));
          if (offObject.length) {
            swatchMismatched += 1;
            push(
              `L6g 档位 ${preset.id} 在 ${model.basename}（${paletteName}）的色卡有 ` +
                `${offObject.join("/")} 不在物件上：色卡 [${swatchColors.join(" ")}] vs 实际出图 ` +
                `[${[...objectColors].join(" ")}]（预设值与实际不匹配）`,
            );
          }
        }
      }
    }
    if (swatchChecked < 200) {
      push(`L6g 色卡校验只跑了 ${swatchChecked} 次（闸门自己疑似失效）`);
    }
    note(
      `L6g 色卡一致性：校验 ${swatchChecked} 次（两套色板 × 全部档位 × 支持档位的模型）；` +
        `与物件不符 ${swatchMismatched} 处；取不到色 ${swatchEmpty} 处`,
    );
  }

  // ── L6h 档位之间必须能看出差别 ────────────────────────────────────────────
  {
    /**
     * 「选另一档位，画面一模一样」是用户报过的第二类症状。成因有两类：
     *   1) 两档给同一条可见面用了同一个值（木柜白门的柜体色抄了胡桃木的）；
     *   2) 某模型的槽位全部落到同一个角色上（`lamp` 家族原先没有槽位表时，落地灯 / 壁灯的
     *      全部槽位都解析成 `base`，整盏灯刷成配重底板的颜色，暖铜和胡桃木画出来一样）。
     * 这里按「渲染中槽位 → 颜色」的排序签名两两比对，签名相同即判失败。
     */
    let pairChecked = 0,
      identicalPairs = 0;
    for (const model of modelList) {
      if (!isMaterialStyleCapable(model.itemType)) continue;
      const renderedSlots = model.materials.filter((material) => material.rendered);
      const presetOptions = materialStyleOptionsFor(model.itemType);
      if (!renderedSlots.length || presetOptions.length < 2) continue;
      const signatureByPreset = new Map<string, string[]>();
      for (const preset of presetOptions) {
        const styledPalette = { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id };
        const signature = renderedSlots
          .map((material) => {
            const recipe =
              materialStyleRecipeFor(
                model.itemType,
                material.name,
                styledPalette,
                material.position,
              ) ??
              materialRoleRecipeFor(
                model.itemType,
                material.name,
                styledPalette,
                material.position,
              );
            return recipe?.colorValue === undefined ? "-" : hex(recipe.colorValue);
          })
          .join("|");
        signatureByPreset.set(signature, [
          ...(signatureByPreset.get(signature) ?? []),
          preset.label,
        ]);
      }
      for (const labels of signatureByPreset.values()) {
        if (labels.length < 2) continue;
        identicalPairs += 1;
        push(
          `L6h ${model.basename} 的档位 ${labels.join(" / ")} 渲染出的槽位颜色完全相同：` +
            "换档位画面不会有任何变化（「选了档位风格没变化」）",
        );
      }
      pairChecked += 1;
    }
    if (pairChecked < 60) push(`L6h 档位可比对只跑了 ${pairChecked} 个模型（闸门自己疑似失效）`);
    note(
      `L6h 档位可分辨：比对 ${pairChecked} 个模型；画面零变化的档位组 ${identicalPairs} 组`,
    );
  }

  // ── L6e 新增能力：个人预设 / 逐槽表面参数 / 槽位分族 ──────────────────────
  {
    const snapshotModel = modelList.find(
        (model) => isMaterialStyleCapable(model.itemType) && model.materials.length,
      ),
      snapshotGroup = snapshotModel ? materialStyleGroupFor(snapshotModel.itemType) : "";
    if (!snapshotModel || !snapshotGroup) {
      push("L6e 找不到可做个人预设往返校验的模型");
    } else {
      const snapshotSlots = snapshotModel.materials.map((material, materialIndex) => ({
          role: resolveModelMaterialRole(snapshotModel.itemType, material.name, materialIndex).role,
          color:
            "#" +
            ((0x334455 + materialIndex * 0x10101) & 0xffffff).toString(16).padStart(6, "0"),
          roughness: 0.3,
          metalness: 0.2,
        })),
        customId = customMaterialStyleId(snapshotGroup, "校验用预设"),
        customRecord = buildCustomMaterialStyleRecord(
          customId,
          "校验用预设",
          snapshotGroup,
          snapshotSlots,
          materialStylePresetFor(snapshotModel.itemType, MATERIAL_STYLE_AUTO),
        );
      if (!customRecord) {
        push("L6e buildCustomMaterialStyleRecord 拒绝了一份合法采样（「存为我的预设」会直接失败）");
      } else {
        const acceptedRecords = registerCustomMaterialStyles([customRecord]),
          // 档位按角色下料：同一角色多个槽位时，后采样的那个决定颜色（与存档循环一致）。
          pinnedRole = resolveModelMaterialRole(
            snapshotModel.itemType,
            snapshotModel.materials[0].name,
            0,
          ).role,
          pinnedSlot =
            [...snapshotSlots].reverse().find((slot) => slot.role === pinnedRole) ??
            snapshotSlots[0],
          // 用「首槽材质名 → 角色」走完整解析：个人预设必须能钉住采样时的颜色。
          pinnedRecipe = materialStyleRecipeFor(
            snapshotModel.itemType,
            snapshotModel.materials[0].name,
            { ...PALETTES[0][1], materialStyle: customId },
          );
        if (!customId.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX)) {
          push("L6e 个人预设 id 没有 custom: 前缀（会和内置档位撞命名空间）");
        }
        if (acceptedRecords.length !== 1) {
          push("L6e registerCustomMaterialStyles 丢掉了合法记录（个人预设存不住）");
        }
        if (!materialStyleOptionsFor(snapshotModel.itemType).some((p) => p.id === customId)) {
          push(`L6e 个人预设没有出现在组 ${snapshotGroup} 的档位表里（存了也选不到）`);
        }
        if (normalizeMaterialStyle(snapshotModel.itemType, customId) !== customId) {
          push("L6e 个人预设 id 被归一成 auto（选了会被静默清掉）");
        }
        // 采样里的每一个角色都必须进档位表：掉一个角色 = 那类槽位复用后回落到主题色。
        const sampledRoles = new Set(snapshotSlots.map((slot) => slot.role)),
          missingRoles = [...sampledRoles].filter((roleName) => !customRecord.roles[roleName]);
        if (missingRoles.length) {
          push(`L6e 采样角色没有全部落进个人预设（丢了 ${missingRoles.join(" / ")}）`);
        }
        if (!pinnedRecipe) {
          push("L6e 个人预设对该模型的首个槽位解析不出配方（选了画面不变）");
        } else if (pinnedRecipe.colorValue !== Number.parseInt(pinnedSlot.color.slice(1), 16)) {
          push(
            `L6e 个人预设没有按采样钉住颜色（期望 ${pinnedSlot.color}，实得 ${hex(
              pinnedRecipe.colorValue,
            )}）｜模型 ${snapshotModel.basename}(${snapshotModel.itemType})` +
              `｜槽位 ${snapshotModel.materials[0].name} 角色 ${pinnedRecipe.role}`,
          );
        }
        // 「存为我的预设」的取舍必须和面板提示一致：共用角色的槽位会被合并成一种颜色。
        const collapsedRoles = materialStyleCollapsedRoles(snapshotSlots);
        if (
          collapsedRoles.some(
            (roleName) => snapshotSlots.filter((slot) => slot.role === roleName).length < 2,
          )
        ) {
          push("L6e materialStyleCollapsedRoles 把只占一个槽位的角色也算成了合并（提示会误报）");
        }
        for (const collapsedRole of collapsedRoles) {
          const collapsedSlots = snapshotSlots.filter((slot) => slot.role === collapsedRole);
          if (new Set(collapsedSlots.map((slot) => slot.color)).size < 2) continue;
          // 颜色本来就一致：合并无副作用，不该提示。
          const collapsedColor = customRecord.roles[collapsedRole].color;
          if (collapsedColor !== Number.parseInt(collapsedSlots.at(-1)!.color.slice(1), 16)) {
            push(`L6e 角色 ${collapsedRole} 合并后没有取用最后一个槽位的颜色（所见与所存不一致）`);
          }
        }
      }
      // 脏记录必须被挡在渲染链外，而且不能把内置档位一起带走。
      if (registerCustomMaterialStyles([null, { id: "custom:broken" }, 42]).length) {
        push("L6e 脏个人预设记录没有被拦下（会被写进渲染链）");
      }
      if (!materialStyleOptionsFor(snapshotModel.itemType).length) {
        push("L6e 清空个人预设后内置档位也一起没了");
      }
    }
    registerCustomMaterialStyles([]);

    // 槽位分族的角色必须都在词表内：拼错一个角色名，整族会静默落进「其它部件」。
    const slotGroupSourceStart = studioSource.indexOf("const MATERIAL_SLOT_GROUPS = ["),
      slotGroupSourceEnd = studioSource.indexOf(
        "const MATERIAL_SLOT_GROUP_ROLE_INDEX",
        slotGroupSourceStart,
      ),
      slotGroupSource =
        slotGroupSourceStart < 0 || slotGroupSourceEnd < 0
          ? ""
          : studioSource.slice(slotGroupSourceStart, slotGroupSourceEnd),
      roleVocabulary = new Set<string>(MATERIAL_ROLE_VOCABULARY);
    if (!slotGroupSource) {
      push("L6e studio-app 找不到 MATERIAL_SLOT_GROUPS（槽位分族表被删了）");
    } else {
      const slotGroupIds = [...slotGroupSource.matchAll(/id:\s*"([^"]+)"/g)].map(
          (idMatch) => idMatch[1],
        ),
        assignedRoles = new Set<string>();
      if (new Set(slotGroupIds).size !== slotGroupIds.length) {
        push("L6e 槽位分族的族 id 有重复（界面会出现两枚同名芯片）");
      }
      if (slotGroupIds.length < 3) {
        push(`L6e 槽位分族只有 ${slotGroupIds.length} 族（分组闸门疑似失效）`);
      }
      for (const rolesMatch of slotGroupSource.matchAll(/roles:\s*\[([^\]]*)\]/g))
        for (const roleMatch of rolesMatch[1].matchAll(/"([^"]+)"/g)) {
          const roleName = roleMatch[1];
          if (!roleVocabulary.has(roleName)) {
            push(`L6e 槽位分族表的 ${roleName} 不在角色词表内（该族会静默落进「其它部件」）`);
          }
          if (assignedRoles.has(roleName)) {
            push(`L6e 角色 ${roleName} 被登记进了多个族（分组结果会取决于顺序）`);
          }
          assignedRoles.add(roleName);
        }
      if (assignedRoles.size < 20) {
        push(`L6e 槽位分族表只登记了 ${assignedRoles.size} 个角色（分组闸门疑似失效）`);
      }
      note(
        `L6e 槽位分族 ${slotGroupIds.length} 族 / 登记角色 ${assignedRoles.size} 个` +
          `（词表共 ${MATERIAL_ROLE_VOCABULARY.length} 个，未登记角色走「其它部件」兜底）`,
      );
    }
    if (!loaderSource.includes("applyMaterialSurfaceOverride(")) {
      push("L6e 加载器缺少 applyMaterialSurfaceOverride（逐槽粗糙 / 金属改了不生效）");
    }
    if (!studioSource.includes("materialSurfaceOverrides")) {
      push("L6e studio-app 没有读写 item.materialSurfaceOverrides（表面参数存不住）");
    }
  }

  // ── L6f 石材板：大理石的整图纹路 ──────────────────────────────────────────
  {
    // 大理石档位必须给出石材板色号：只换颜色的「大理石」档位在画面上是一块纯色板，
    // 名称就成了谎 —— 这正是「大理石风格没有纹理」那类回归的入口。
    const marbleStyleExpectations: ReadonlyArray<
      [string, string, string, string | null]
    > = [
      ["coffeetable", "stone-white-black", "material-0-top", "marble"],
      ["coffeetable", "stone-white-black", "material-1-base", "marble-dark"],
      ["coffeetable", "stone-all-white", "material-0-top", "marble"],
      ["coffeetable", "stone-all-white", "material-1-base", "marble"],
      ["coffeetable", "stone-all-black", "material-0-top", "marble-dark"],
      ["coffeetable", "stone-all-black", "material-1-base", "marble-dark"],
      ["coffeetable", "stone-marble", "material-0-top", "marble"],
    ];
    for (const [modelType, presetId, materialName, expectedSlab] of marbleStyleExpectations) {
      if (!materialStylePresetFor(modelType, presetId)) {
        push(`L6f 模型 ${modelType} 找不到档位 ${presetId}（大理石档位被删了）`);
        continue;
      }
      const styleRecipe = materialStyleRecipeFor(modelType, materialName, {
        ...PALETTES[0][1],
        materialStyle: presetId,
      });
      if (!styleRecipe) {
        push(`L6f ${presetId} 在 ${modelType}/${materialName} 上解析不出配方（选了画面不变）`);
        continue;
      }
      if (styleRecipe.slab !== expectedSlab) {
        push(
          `L6f ${presetId} 在 ${modelType}/${materialName}（角色 ${styleRecipe.role}）上的石材板` +
            `期望 ${String(expectedSlab)}，实得 ${String(styleRecipe.slab)}（大理石纹会缺失或串料）`,
        );
      }
    }

    // 反例：不是大理石的档位不能顶着角色表的大理石纹出图。角色表的台面声明了 slab marble，
    // 所以「木器桌面 / 黑色岩板 / 水磨石」这些档位必须能在自己的角色配方里把纹路摘掉 ——
    // 摘不掉的话，胡桃木餐桌上会飘着白云纹。
    const nonMarbleStyleExpectations: ReadonlyArray<[string, string, readonly string[]]> = [
      ["table", "wood-walnut", ["table-furniture-surface", "table-furniture-frame"]],
      ["coffeetable", "stone-black", ["material-0-top"]],
      ["coffeetable", "stone-terrazzo", ["material-0-top"]],
      ["coffeetable", "stone-travertine", ["material-0-top", "material-1-base"]],
    ];
    for (const [modelType, presetId, materialNames] of nonMarbleStyleExpectations) {
      for (const materialName of materialNames) {
        const styleRecipe = materialStyleRecipeFor(modelType, materialName, {
            ...PALETTES[0][1],
            materialStyle: presetId,
          }),
          slabFlavor = styleRecipe?.slab;
        if (isStoneSlabFlavor(slabFlavor)) {
          push(
            `L6f ${presetId} 在 ${modelType}/${materialName} 上仍带着石材板 ${slabFlavor}` +
              `（这不是石材档位，纹路会顶掉本来的材质观感）`,
          );
        }
      }
    }

    // 派生角色不能**顺带**继承石材板：`wood ← top`、`shadow ← base` 这类跨材质派生一旦带上
    // slab，木腿 / 踢脚会被贴上大理石整图。只有 `surface ← top`、`slab ← top` 允许继承。
    for (const preset of MATERIAL_STYLE_PRESET_LIST) {
      for (const [roleName, roleRecipe] of Object.entries(preset.roles)) {
        if (!isStoneSlabFlavor(roleRecipe.slab)) continue;
        // 石材板的角色一定落在石作族里：台面 / 板面 / 石座 / 石抽面 / 层板 / 收边。
        if (["top", "surface", "slab", "base", "drawer", "shelf", "trim"].includes(roleName))
          continue;
        push(
          `L6f 档位 ${preset.id} 的角色 ${roleName} 被派生出石材板 ${roleRecipe.slab}` +
            `（跨材质派生不该带 slab，木腿 / 沙面会变成大理石）`,
        );
      }
      // 石材板的角色必须有石材系的表面：金属 / 织物上贴大理石纹是明显的错配。
      for (const [roleName, roleRecipe] of Object.entries(preset.roles)) {
        if (!isStoneSlabFlavor(roleRecipe.slab)) continue;
        const surface = roleRecipe.surface ?? preset.surface;
        if (!["stone", "marble"].includes(String(surface))) {
          push(
            `L6f 档位 ${preset.id} 的角色 ${roleName} 声明了石材板却挂着 ${String(surface)} 表面` +
              "（大理石纹会出现在错误的材质上）",
          );
        }
      }
    }

    // 装载期补的平面 UV 必须真的接在模板准备流程上：几何 UV 跟着模板缓存走，
    // 少了这一手，石材整图会被立方体 UV 铺成六份小图，接缝落在台面正中间。
    if (!loaderSource.includes("applyStoneSlabPlanarUv(threeNamespace, templateScene"))
      push("L6f 加载器没有在模板准备流程里补石材板平面 UV（纹路会按立方体六面各铺一遍）");
    if (!codecSource.includes("stone-slab-uv")) {
      push(
        "L6f 模板缓存指纹没有跟着石材板 UV 变更（旧缓存里的立方体 UV 会让纹路一直糊）",
      );
    }
    for (const [requiredLoaderSnippet, snippetMessage] of [
      ["createStoneSlabTexture(", "L6f 加载器没有取石材板整图（大理石档位只剩纯色）"],
      ["stoneSlabSurfaceFinish(", "L6f 加载器没有用石材板的抛光面参数（石板会读成哑光砖）"],
      ["applyStoneSlabFinish(", "L6f 加载器没有把石材板收口成贴图材质（纹路进不了画面）"],
      ["materialStyleStoneSlabRoles(", "L6f 加载器没有按档位角色判断石材板（UV 判据会被收窄）"],
      ["stoneSlabFlavorForMaterial(", "L6f 加载器没有读角色表的石材板声明"],
      ["homeosStoneSlab", "L6f 石材板材质没有留标记（下游无法识别石板）"],
    ] as const) {
      if (!loaderSource.includes(requiredLoaderSnippet)) push(snippetMessage);
    }
    if (!presetsSource.includes("materialStyleStoneSlabRoles(")) {
      push("L6f 档位模块缺少 materialStyleStoneSlabRoles（石材板角色并集无从查询）");
    }
    // 个人预设必须连贴图一起采样：只钉颜色的话，大理石台面存回来会变成一块没纹路的白板。
    const slabSnapshotRecord = buildCustomMaterialStyleRecord(
      customMaterialStyleId("marbleTable", "石材板往返"),
      "石材板往返",
      "marbleTable",
      [
        { role: "top", color: "#f2f1ed", roughness: 0.24, metalness: 0.03, slab: "marble-dark" },
      ],
      null,
    );
    if (!slabSnapshotRecord || slabSnapshotRecord.roles.top?.slab !== "marble-dark") {
      push("L6f 个人预设丢掉了石材板色号（存回来的是没有纹路的白板）");
    }
    if (!studioSource.includes("slab: slotEntry.slab")) {
      push("L6f studio-app 打个人预设时没有采样 slab（石材板存不进个人预设）");
    }
    if (!studioSource.includes("materialSlabLabel(")) {
      push("L6f studio-app 没有在材质面板上标出石材板（用户看不出这一槽有纹路）");
    }
    if (!studioCss.includes(".material-slot-slab")) {
      push("L6f studio.css 缺少 .material-slot-slab（石材板标记会没有样式）");
    }
    note(
      `L6f 石材板：大理石档位 ${marbleStyleExpectations.length} 组 / 反例 ${nonMarbleStyleExpectations.length} 组；` +
        `色号 ${Object.keys({ marble: 0, "marble-dark": 0 }).join(" / ")}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* 报告                                                                        */
/* -------------------------------------------------------------------------- */

console.log("─".repeat(100));
console.log(
  `L1 覆盖：模型 ${models.length} / 材质 ${materialCount}；两套色板配方校验 ${coverageChecks} 次；` +
    `灯光模型 ${lightModels}（跳过配色健全性）`,
);
console.log(
  `L4 对齐：配对 ${parityCompared} 槽（豁免 ${parityExempted} / 未配对 ${paritySkipped}）；` +
    `同名模型 ${parityModelsCommon} 个（几何可配 ${parityModelsPaired} 个）` +
    (existsSync(REFERENCE_DIR) && !skipParity ? "" : "（参考目录缺失，已跳过）"),
);
if (existsSync(REFERENCE_DIR) && !skipParity) {
  console.log(
    `L4b 角色集合：比对 ${parityModelsCommon} 个同名模型 / ${roleSetCompared} 个 0.6.5 角色；` +
      `新表缺失 ${roleSetLost} 个（其中槽位角色表权威 ${roleSetLostAuthoritative} 个）；` +
      `另有 ${roleSetLost - roleSetLostAuthoritative} 个由资产命名自带的角色决定（见 -v 明细）`,
  );
}
console.log(
  `L6 档位：${MATERIAL_STYLE_SUMMARY.groupCount} 组 / ${MATERIAL_STYLE_SUMMARY.presetCount} 档预设（逐物件「材质风格」）；` +
    `接线 / 生效 / 出图见 -v 明细`,
);
console.log("─".repeat(100));
if (problems.length) {
  for (const problem of problems) console.log("✗ " + problem);
  console.log(`✗ 共 ${problems.length} 项未通过`);
} else {
  console.log("✓ 全部通过：角色 / 配方 / 分发 / 槽位表 / 覆盖色接线 / 材质档位 / 0.6.5 对齐");
}
if (verbose) for (const note of notes) console.log(note);
process.exit(problems.length ? 1 : 0);

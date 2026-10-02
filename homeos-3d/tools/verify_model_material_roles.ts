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
 *   bun tools/verify_model_material_roles.ts --audit [--model=fridge]
 *
 * `--audit` 打印「角色 ↔ 几何 ↔ 逐档位出图」的逐模型对照表（见 `printModelFitReport`）。
 * 它与 `--model=<名>` 联用时只加载那一件模型，因此**全局覆盖类闸门**（L6c 的档位覆盖面、
 * 档位组可达性等）会因样本不足而报错 —— 那是查看单件模型的正常代价，看表格本身即可。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOOR_MATERIAL_PART_ROLES_BY_TYPE,
  DOOR_MATERIAL_PARTS,
  MODEL_SLOT_ROLES,
  doorMaterialPartIndex,
  doorMaterialPartRoleFor,
  doorPlanMaterialRoleFor,
  isStoneSlabFlavor,
  isStructuralModelFamily,
  materialRoleRecipeFor,
  resolveModelFamily,
  resolveModelMaterialRole,
  stoneSlabFlavorForMaterial,
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
  materialStyleStoneSlabRoles,
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
/** 逐模型打印「角色 ↔ 几何 ↔ 档位」报告（L7 审计的可复现依据）。 */
const audit = process.argv.includes("--audit");

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

/**
 * 程序化（没有 GLB 资产）的材质宿主。
 *
 * 档位组不只挂在 GLB 模型上：户型里的**门**是程序化拼出来的几何，没有 GLB 可扫，它的
 * 材质槽由各门型的部件表（`DOOR_MATERIAL_PART_ROLES_BY_TYPE`）登记（门框 / 门扇 / 玻璃 /
 * 五金 / 卷帘 / 帘片 / 装饰线）。资产目录扫不出它，所以这里补一份等价事实 —— 否则 L6c 会
 * 把 door 档位组误判成「整组死档位」，L6h 也会漏掉门的档位可分辨性（正是「换档位没变化」
 * 那类回归）。
 */
const PROCEDURAL_MATERIAL_HOSTS: readonly string[] = ["door"];

/**
 * 程序化宿主的材质槽：命名约定与运行时一致（`<type>-material-<n>`，见 MODEL_SLOT_ROLES）。
 *
 * **一个门型 = 一条事实**：门型的部件集合互不相同（实木门只有门框 + 五金，卷帘门是门框 +
 * 卷帘 + 帘片），拿「所有部件并起来」当分母会把每个门型都判成覆盖不足。槽位号取
 * `DOOR_MATERIAL_PARTS` 的全局下标 —— 运行时 `door-material-<n>` 就是这么编号的。
 */
function proceduralHostFacts(): ModelFacts[] {
  return PROCEDURAL_MATERIAL_HOSTS.flatMap((itemType) =>
    Object.entries(DOOR_MATERIAL_PART_ROLES_BY_TYPE).map(([hostVariant, partRoles]) => ({
      basename: `${itemType}:${hostVariant}`,
      itemType,
      path: "",
      materials: partRoles.map((role) => {
        const index = doorMaterialPartIndex(role);
        return {
          name: `${itemType}-material-${index}`,
          index,
          baseColor: null,
          position: index,
          rendered: true,
        };
      }),
    })),
  );
}

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
 * 默认主题色板：照抄 studio-app.ts 的 `defaultViewSettings`（未导出）。
 * 墙 / 窗框 / 地板已朝「暖阳原木」的暖调靠（暖白墙 / 暖橡地板 / 暖铜木窗框），
 * 其余键仍是默认的冷灰调；它没有 wood / cabinetWood / countertop / sofaFabric 等暖木专用键，
 * 这些要靠 PALETTE_KEY_FALLBACK 回落——所以这里只用它验「取得到且健全」。
 */
const DEFAULT_PALETTE = {
  warmWood: false,
  background: 1120029,
  ground: 1382690,
  floor: 15920610,
  floorEdge: 16163146,
  grid: 5331300,
  wall: 16052972,
  wallTop: 16184817,
  windowFrame: 11515315,
  furniture: 8226713,
  furnitureSoft: 10332346,
  furnitureLight: 12634839,
  furnitureDark: 5397873,
  appliance: 10134967,
  applianceSoft: 11911118,
  applianceDark: 6845576,
  glass: 10604733,
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
  /**
   * 储物柜（`cabinet.glb`）把柜体与两扇柜门并进**同一个闭合箱**（`cabinet-material-0`），
   * 没有独立柜体槽。选了档位时它必须靠「柜门返边」按面法线把非前脸刷成**该档位的 `body`
   * 角色色**（与同档吊柜的柜体同源）—— 缺任意一环，「木柜白门」的储物柜都会整只变成门色
   * （全白），与同档吊柜（木柜体 + 白门）配不成套。这条链横跨档位模块与加载器两处，
   * 断掉只会表现为画面不对、没有报错 / 类型错误，故在此钉住。
   */
  if (
    !readFileSync(PRESETS_SOURCE_PATH, "utf8").includes(
      "export function materialStyleRoleColorFor(",
    )
  ) {
    push("L2 档位模块缺少 materialStyleRoleColorFor（储物柜的柜体色无从按档位取）");
  }
  if (
    !loaderSource.includes("isStyledCabinetDoorMaterial") ||
    !loaderSource.includes('materialStyleRoleColorFor("cabinet", "body", palette)')
  ) {
    push(
      "L2 储物柜（cabinet）缺少「按档位柜体色返边」的接线：选了木柜白门会整只刷成门色、与吊柜配不成套",
    );
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
/* L7：角色 / 表面 / 档位与模型特色的语义贴合                                    */
/* -------------------------------------------------------------------------- */

/**
 * L6 只保证「档位能生效、彼此可分辨、色卡与物件一致」，不保证**档位语义与这件模型相符**：
 * 木器档位能把台球桌的台呢刷成米色、joinery 档位能把梳妆台的镜子刷成陶土摆件 —— 覆盖率与
 * 可分辨性全过，画面却是错的。L7 把这类「语义错配」钉住：
 *
 *   L7a 薄木顶面：书架 / 床头柜 / 电视柜 / 鞋柜 / 餐边柜 / 方茶几 / 台球桌的 `top`(`surface`)
 *       都是 0.02~0.06m 的木板，在 auto 与全部档位下都不得带石材板（大理石整图）。
 *   L7b 梳妆台镜面：`accent` 是立式镜，在所有档位下都必须保持透明（不能被刷成陶土摆件）。
 *   L7c 台球桌台呢：四档的绒面色两两不同（换档位要看得出来）。
 *   L7d 新组可达：poolTable / shower / teaTable / ornament 都要有真实模型，且 decor-* 有档位。
 *   L7e 台面几何：给 `top` 贴石材板的模型，那条槽位必须真的是「板」（两条平面边够长、厚度是
 *       最薄的一条）—— 台面被挂到细条 / 小件上时，石材档位在画面上什么也看不到。
 *   L7f 缸景不跟柜框：鱼缸的底砂 / 造景石 / 水草 / 鱼在三种缸框档位下颜色必须一致，且不得
 *       与缸框同色（它们是缸里的内容物，不是柜体的一部分）。
 *   L7g 键盘不跟漆色：钢琴的白键 / 黑键与内板 / 黄铜五金在三种漆色下必须是同一批件，
 *       且白键为浅色、黑键为深色。
 *   L7h 纸张不跟漆色：打印机出纸口那张纸在所有档位下都必须是浅色（耗材不该被机身漆色染黑）。
 */
function auditSemanticFit(
  modelList: ModelFacts[],
  push: (message: string) => void,
  note: (message: string) => void,
): void {
  const modelByType = new Map(modelList.map((model) => [model.itemType, model]));

  /* L7a 薄木顶面不得贴石材板 */
  const woodTopSlots: ReadonlyArray<readonly [string, string]> = [
    ["shelf", "top"],
    ["nightstand", "top"],
    ["tvstand", "surface"],
    ["shoecabinet", "top"],
    ["sideboard", "top"],
    ["squarecoffeetable", "surface"],
    ["pool-table", "surface"],
  ];
  let woodTopChecks = 0;
  for (const [modelType, roleName] of woodTopSlots) {
    const model = modelByType.get(modelType);
    if (!model) {
      push(`L7a 找不到模型 ${modelType}（木质顶面断言无从进行）`);
      continue;
    }
    const topSlots = model.materials.filter(
      (material) =>
        resolveModelMaterialRole(modelType, material.name, material.index).role === roleName,
    );
    if (!topSlots.length) {
      push(`L7a ${modelType} 没有 ${roleName} 槽位（槽位表可能改名）`);
      continue;
    }
    for (const [paletteLabel, palette] of PALETTES) {
      for (const slot of topSlots) {
        woodTopChecks += 1;
        const autoSlab = stoneSlabFlavorForMaterial(modelType, slot.name, slot.index);
        if (isStoneSlabFlavor(autoSlab)) {
          push(
            `L7a ${modelType}#${slot.index} 的木质 ${roleName} 在 auto/${paletteLabel} 下` +
              `带着石材板 ${autoSlab}（自动档就贴了大理石整图）`,
          );
        }
      }
      for (const preset of materialStyleOptionsFor(modelType)) {
        for (const slot of topSlots) {
          woodTopChecks += 1;
          const styleRecipe = materialStyleRecipeFor(
            modelType,
            slot.name,
            { ...palette, ...preset.colors, materialStyle: preset.id },
            slot.index,
          );
          if (styleRecipe && isStoneSlabFlavor(styleRecipe.slab)) {
            push(
              `L7a ${modelType}#${slot.index} 的木质 ${roleName} 在档位 ${preset.id}/${paletteLabel} 下` +
                `带着石材板 ${styleRecipe.slab}（木顶板会飘大理石纹）`,
            );
          }
        }
      }
    }
  }
  if (woodTopChecks < 40) push(`L7a 木质顶面只校验了 ${woodTopChecks} 次（闸门自己疑似失效）`);

  /* L7b 梳妆台 accent 必须是透明镜面 */
  const vanity = modelByType.get("vanity");
  if (vanity) {
    const mirrorSlots = vanity.materials.filter(
      (material) =>
        resolveModelMaterialRole("vanity", material.name, material.index).role === "accent",
    );
    if (!mirrorSlots.length) push("L7b vanity 没有 accent（镜面）槽位");
    let mirrorChecks = 0;
    for (const preset of materialStyleOptionsFor("vanity")) {
      for (const slot of mirrorSlots) {
        mirrorChecks += 1;
        const styleRecipe = materialStyleRecipeFor(
          "vanity",
          slot.name,
          { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id },
          slot.index,
        );
        if (!styleRecipe) {
          push(`L7b vanity.accent 在档位 ${preset.id} 下取不到配方`);
        } else if (styleRecipe.transparent !== true) {
          push(
            `L7b vanity.accent（立式镜）在档位 ${preset.id} 下不是透明镜面（会被刷成实心色块）`,
          );
        }
      }
    }
    note(`L7b 梳妆台镜面：校验 ${mirrorChecks} 次`);
  }

  /* L7c 台球桌台呢档位可分辨 */
  const poolTable = modelByType.get("pool-table");
  if (poolTable) {
    const fabricSlots = poolTable.materials.filter(
      (material) =>
        resolveModelMaterialRole("pool-table", material.name, material.index).role === "fabric",
    );
    if (!fabricSlots.length) push("L7c pool-table 没有 fabric（台呢）槽位");
    const clothByPreset = new Map<string, string>();
    for (const preset of materialStyleOptionsFor("pool-table")) {
      const signature = fabricSlots
        .map((slot) =>
          materialStyleRecipeFor(
            "pool-table",
            slot.name,
            { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id },
            slot.index,
          )?.colorValue,
        )
        .join("|");
      const duplicate = clothByPreset.get(signature);
      if (duplicate) {
        push(
          `L7c 台球桌档位 ${preset.id} 与 ${duplicate} 的台呢颜色完全相同（换档位看不出变化）`,
        );
      }
      clothByPreset.set(signature, preset.id);
    }
  }

  /* L7d 新档位组的可达性与 decor 覆盖 */
  for (const groupName of ["poolTable", "shower", "teaTable", "ornament"] as const) {
    const reachable = modelList.some(
      (model) => materialStyleGroupFor(model.itemType) === groupName,
    );
    if (!reachable) push(`L7d 档位组 ${groupName} 没有任何模型可达（整组死档位）`);
  }
  for (const decorType of [
    "decor-books",
    "decor-vase",
    "decor-tea-tray",
    "decor-tissue-box",
    "decor-small-plant",
  ]) {
    if (!modelList.some((model) => model.itemType === decorType)) continue;
    if (!isMaterialStyleCapable(decorType)) {
      push(`L7d 摆件 ${decorType} 没有档位组（无法换风格）`);
    }
  }
  /* L7e 石材台面必须落在「板状」几何上 */
  // 台面角色一旦被挂到细条 / 小件上（台盆的 `top` 曾经落在一条 1.2cm 宽的竖收边上），
  // 石作档位在画面上什么都看不到 —— 覆盖率 / 可分辨性 / 色卡全过，用户看到的是「选了没反应」。
  // 这里用图元实测三围钉住：台面必须是「一条薄轴 + 两条够长的平面边」。
  let countertopShapeChecked = 0;
  for (const model of modelList) {
    if (!materialStyleStoneSlabRoles(model.itemType).has("top")) continue;
    // 槽位名从资产事实里取，不写死：槽位号会随资产重排。
    const countertopSlot = model.materials.find(
      (material) =>
        resolveModelMaterialRole(model.itemType, material.name, material.position).role === "top",
    );
    if (!countertopSlot) {
      push(
        `L7e 模型 ${model.itemType} 的档位给 \`top\` 贴石材板，资产里却找不到 \`top\` 槽位` +
          "（台面档位会落到别的料上）",
      );
      continue;
    }
    const modelPrimitives = primitivesOf(model.path);
    const countertopDims = [0, 1, 2]
      .map((axis) => {
        let extent = 0;
        for (const primitive of modelPrimitives)
          if (primitive.materialName === countertopSlot.name)
            extent = Math.max(extent, Math.abs(primitive.box[3 + axis] - primitive.box[axis]));
        return extent;
      })
      .sort((a, b) => a - b);
    countertopShapeChecked += 1;
    const dimsText = countertopDims.map((value) => value.toFixed(3)).join("×");
    if (countertopDims[0] > countertopDims[1] * 0.5) {
      push(
        `L7e ${model.itemType} 的台面 ${countertopSlot.name} 不是板状（三围 ${dimsText}）：` +
          "石材整图会贴在一块方料 / 细条上，看不出是台面",
      );
    }
    if (countertopDims[1] < 0.3) {
      push(
        `L7e ${model.itemType} 的台面 ${countertopSlot.name} 的平面边太短（三围 ${dimsText}）：` +
          "石材档位在画面上几乎看不见",
      );
    }
  }

  /**
   * 某（模型，角色）在**每个档位**下解析出的色值。L7f / L7g 共用：档位配方要么逐档给出
   * 同一支色（＝这个角色不跟档位走），要么随档位变化（＝它就是这档要换的那件）。
   */
  const styleColorsByRole = (modelType: string, roleName: string): Set<number> => {
    const model = modelByType.get(modelType);
    if (!model) return new Set();
    const slots = model.materials.filter(
      (material) =>
        resolveModelMaterialRole(modelType, material.name, material.index).role === roleName,
    );
    const colors = new Set<number>();
    for (const preset of materialStyleOptionsFor(modelType)) {
      for (const slot of slots) {
        const styleRecipe = materialStyleRecipeFor(
          modelType,
          slot.name,
          { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id },
          slot.index,
        );
        if (styleRecipe?.colorValue !== undefined) colors.add(styleRecipe.colorValue);
      }
    }
    return colors;
  };

  /* L7f 缸内造景与活体不随柜体 / 缸框变色 */
  // 底砂 / 造景石 / 水草 / 鱼是缸里的**内容物**。派生表原本把它们接到 `interior`（深青背板）
  // 与 `frame`（柜框）上：白框缸因此得到白色的造景石与白色的鱼、木框缸得到棕色的鱼，
  // 底砂与水草在三种缸框下都变成 `#1b3a40` 的深青。判据：这四支色在所有缸框档位下必须
  // **完全相同**（几何分别是缸底 0.03m 的砂层、0.65m 的石、0.46m 的水草、0.32m 的鱼）。
  const aquarium = modelByType.get("aquarium");
  if (aquarium) {
    let aquascapeChecks = 0;
    for (const aquascapeRole of ["sand", "rock", "foliage", "fish"]) {
      const colors = styleColorsByRole("aquarium", aquascapeRole);
      if (!colors.size) {
        push(`L7f aquarium 的 ${aquascapeRole}（缸景）在所有档位下都取不到配方`);
        continue;
      }
      aquascapeChecks += 1;
      if (colors.size > 1) {
        push(
          `L7f aquarium 的 ${aquascapeRole}（缸景 / 活体）在不同缸框档位下颜色不同` +
            `（${[...colors].map((c) => hex(c)).join("/")}）：换柜框不该换缸里的内容物`,
        );
      }
    }
    // 缸景不得与缸框同色：同色意味着又被接回柜体了。
    const frameColors = styleColorsByRole("aquarium", "frame");
    for (const aquascapeRole of ["sand", "rock", "foliage", "fish"]) {
      const colors = styleColorsByRole("aquarium", aquascapeRole);
      const shared = [...colors].filter((c) => frameColors.has(c));
      if (shared.length) {
        push(
          `L7f aquarium 的 ${aquascapeRole} 与缸框同色（${shared.map((c) => hex(c)).join("/")}）：` +
            "缸景又接回了柜体 / 缸框的配色",
        );
      }
    }
    note(
      `L7f 鱼缸缸景：校验 ${aquascapeChecks} 个缸内角色在所有缸框档位下保持不变`,
    );
  }

  /* L7g 钢琴的键盘与五金不随漆色变 */
  // 「亮光黑 / 亮光白 / 暖木色」换的是**琴身漆色**：`trim` 是那 42 根白键、`dark` 是黑键与
  // 铸铁内板、`accent` 是踏板 / 铰链的黄铜件 —— 三者在三种漆色下都该是同一批件。
  // 原先把它们接到 `body` 派生，暖木钢琴会得到一排**棕色的白键**、亮光黑钢琴得到黑键盘。
  const piano = modelByType.get("piano");
  if (piano) {
    let keyboardChecks = 0;
    for (const [pianoRole, label] of [
      ["trim", "白键"],
      ["accent", "黄铜五金"],
      ["dark", "黑键与内板"],
    ] as const) {
      const colors = styleColorsByRole("piano", pianoRole);
      if (!colors.size) {
        push(`L7g piano 的 ${pianoRole}（${label}）在所有档位下都取不到配方`);
        continue;
      }
      keyboardChecks += 1;
      if (colors.size > 1) {
        push(
          `L7g piano 的 ${pianoRole}（${label}）随漆色档位变色` +
            `（${[...colors].map((c) => hex(c)).join("/")}）：换琴身漆色不该换键盘 / 五金`,
        );
      }
    }
    // 白键必须是浅色、黑键必须是深色（两条都反了才算错配，避免只钉具体色号）。
    const keyColor = [...styleColorsByRole("piano", "trim")][0],
      darkColor = [...styleColorsByRole("piano", "dark")][0];
    if (keyColor !== undefined && darkColor !== undefined) {
      const luma = (value: number) => {
        const r = (value >> 16) & 0xff,
          g = (value >> 8) & 0xff,
          b = value & 0xff;
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };
      if (luma(keyColor) < 180) {
        push(`L7g piano 的白键（trim=${hex(keyColor)}）不是浅色：键盘会被漆色染成深色`);
      }
      if (luma(darkColor) > 90) {
        push(`L7g piano 的黑键 / 内板（dark=${hex(darkColor)}）不是深色`);
      }
    }
    note(`L7g 钢琴键盘 / 五金：校验 ${keyboardChecks} 个角色不随漆色变化`);
  }

  /* L7h 纸张 / 耗材不跟机身漆色变 */
  // 打印机出纸口那张纸是**耗材**：在「石墨黑 / 金属灰」档位下不能变成深灰纸。派生表原本把它
  // 接到 `panel`（＝机身色）上，于是黑色的打印机配一张黑纸。
  const printer = modelByType.get("printer");
  if (printer) {
    const paperSlots = printer.materials.filter(
      (material) =>
        resolveModelMaterialRole("printer", material.name, material.index).role === "paper",
    );
    if (!paperSlots.length) {
      push("L7h printer 没有 paper（出纸）槽位（纸张断言无从进行）");
    } else {
      const luma = (value: number) => {
        const r = (value >> 16) & 0xff,
          g = (value >> 8) & 0xff,
          b = value & 0xff;
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };
      let paperChecks = 0;
      for (const preset of materialStyleOptionsFor("printer")) {
        for (const slot of paperSlots) {
          const styleRecipe = materialStyleRecipeFor(
            "printer",
            slot.name,
            { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id },
            slot.index,
          );
          if (styleRecipe?.colorValue === undefined) continue;
          paperChecks += 1;
          if (luma(styleRecipe.colorValue) < 180) {
            push(
              `L7h printer 的出纸（paper）在档位 ${preset.id} 下是深色` +
                `（${hex(styleRecipe.colorValue)}）：纸张被机身漆色染黑了`,
            );
          }
        }
      }
      note(`L7h 打印机纸张：校验 ${paperChecks} 次为浅色耗材`);
    }
  }

  /* L7i 家电 / 设备的「机身层次」不得在档位下塌成一个色 */
  // 角色表（FAMILY_ROLE_RECIPES 的 appliance / device）早就写明「箱体最亮、门脸中间、
  // 控制面板与底座最暗」，可档位表原先只给 `body` 一支料 —— `applianceCombo` 的
  // `door ?? body` / `panel ?? body` / `base ?? body` 三条回落链把整机刷成一个颜色：
  // 三档不锈钢选下来只有整体深浅变化，冰箱的门缝、洗衣机的控制条、洗碗机的踢脚、
  // 热水器的显示窗、蒸箱的门板压边全部消失（`recess` 是唯一还深的槽位）。
  // 修法是在档位侧补 `applianceShellTones` / `deviceShellTones`：门脸 / 抽屉面 / 台面取本档
  // 调色板 `applianceSoft`，控制面板 / 底座取 `applianceDark`，表面处理沿用本档箱体。
  // 这里把结论钉住 —— **结构件必须与箱体不同色**。
  {
    const shellGroups = ["steelAppliance", "device"];
    /**
     * 必须与箱体分色的角色。
     *
     * 不含 `trim`：部分型号（落地空调 / 燃气热水器 / 储水式热水器）的 `trim` 就是外壳本身，
     * 与箱体同料是刻意的；也不含 `metal` / `handle`（五金本来就是钢色，与漆色不同源）。
     */
    const shellRoles = ["door", "drawer", "panel", "base", "top"];
    let shellChecks = 0;
    let shellCollapsedModels = 0;
    for (const model of modelList) {
      if (!shellGroups.includes(materialStyleGroupFor(model.itemType))) continue;
      const slots = model.materials.filter((material) => material.rendered);
      if (slots.length < 2) continue;
      const roleOf = (slot: ModelFacts["materials"][number]) =>
        resolveModelMaterialRole(model.itemType, slot.name, slot.index).role;
      const bodySlots = slots.filter((slot) => roleOf(slot) === "body");
      if (!bodySlots.length) continue;
      let collapsedThisModel = false;
      for (const preset of materialStyleOptionsFor(model.itemType)) {
        const styledPalette = { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id };
        const colorFor = (slot: ModelFacts["materials"][number]) => {
          const recipe =
            materialStyleRecipeFor(model.itemType, slot.name, styledPalette, slot.index) ??
            materialRoleRecipeFor(model.itemType, slot.name, styledPalette, slot.index);
          return recipe?.colorValue;
        };
        const bodyColors = new Set(bodySlots.map((slot) => colorFor(slot)));
        for (const roleName of shellRoles) {
          const roleSlots = slots.filter((slot) => roleOf(slot) === roleName);
          if (!roleSlots.length) continue;
          shellChecks += 1;
          const sameAsBody = roleSlots.filter((slot) => bodyColors.has(colorFor(slot)));
          if (sameAsBody.length === roleSlots.length) {
            collapsedThisModel = true;
            push(
              `L7i ${model.basename} 的 ${roleName}（${String(roleSlots.length)} 个槽位）在档位 ` +
                `${preset.id} 下与箱体同色（${hex(colorFor(roleSlots[0]))}）：` +
                "门脸 / 控制面板 / 底座被刷进了箱体，整机只剩一个颜色",
            );
          }
        }
      }
      if (collapsedThisModel) shellCollapsedModels += 1;
    }
    if (shellChecks < 40) {
      push(`L7i 家电 / 设备机身层次只校验了 ${shellChecks} 个角色槽位（闸门自己疑似失效）`);
    }
    note(
      `L7i 家电 / 设备机身层次：校验 ${shellChecks} 个角色槽位；整机塌成一个色的模型 ` +
        `${shellCollapsedModels} 个`,
    );
  }

  /* L7j 软装的「第二层」不得与主体软包同色 */
  // 沙发 / 床 / 办公椅的 `accent` 是靠背枕 / 搭毯 / 床品那一条（几何见 `--audit`：沙发上
  // 1.90×0.32×0.15 的靠背枕、床上 1.87×0.31×1.56 的被子、办公椅上 0.37×0.08×0.08 的腰托）。
  // 皮革三档原先没给 accent，`fabricCombo` 的 `accent ?? upholstery` 就把它接回主体皮革：
  // 焦糖皮 / 干邑棕 / 墨黑皮整件只有一个色，靠背枕与坐垫之间没有缝。
  // 判据：有 accent 槽位的软装模型，在每一档下 accent 都必须与主体软包不同色。
  {
    const bodyUpholsteryRoles = ["fabric", "surface", "upholstery", "cushion"];
    let layerChecks = 0;
    let layerMergedModels = 0;
    for (const model of modelList) {
      if (resolveModelFamily(model.itemType) !== "upholstery") continue;
      const slots = model.materials.filter((material) => material.rendered);
      const roleOf = (slot: ModelFacts["materials"][number]) =>
        resolveModelMaterialRole(model.itemType, slot.name, slot.index).role;
      const accentSlots = slots.filter((slot) => roleOf(slot) === "accent");
      if (!accentSlots.length) continue;
      const bodySlots = slots.filter((slot) => bodyUpholsteryRoles.includes(roleOf(slot)));
      if (!bodySlots.length) continue;
      let mergedThisModel = false;
      for (const preset of materialStyleOptionsFor(model.itemType)) {
        const styledPalette = { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id };
        const colorFor = (slot: ModelFacts["materials"][number]) => {
          const recipe =
            materialStyleRecipeFor(model.itemType, slot.name, styledPalette, slot.index) ??
            materialRoleRecipeFor(model.itemType, slot.name, styledPalette, slot.index);
          return recipe?.colorValue;
        };
        const bodyColors = new Set(bodySlots.map((slot) => colorFor(slot)));
        layerChecks += accentSlots.length;
        const sameAsBody = accentSlots.filter((slot) => bodyColors.has(colorFor(slot)));
        if (sameAsBody.length === accentSlots.length) {
          mergedThisModel = true;
          push(
            `L7j ${model.basename} 的 accent（靠背枕 / 搭毯 / 床品）在档位 ${preset.id} 下与主体` +
              `软包同色（${hex(colorFor(accentSlots[0]))}）：整件只有一个颜色，看不出第二层`,
          );
        }
      }
      if (mergedThisModel) layerMergedModels += 1;
    }
    if (layerChecks < 15) {
      push(`L7j 软装第二层只校验了 ${layerChecks} 个槽位（闸门自己疑似失效）`);
    }
    note(`L7j 软装第二层：校验 ${layerChecks} 个 accent 槽位；与主体同色的模型 ${layerMergedModels} 个`);
  }

  note(`L7a 木质顶面：校验 ${woodTopChecks} 次；L7d 新档位组可达性 / 摆件档位已校验`);
  note(`L7e 石材台面几何：校验 ${countertopShapeChecked} 个模型的台面槽位是板状`);
}

/**
 * `--audit`：逐模型打印「角色 ↔ 几何 ↔ 档位出图」报告，作为 L7 的手工复核依据。
 *
 * 列的含义：
 *   - `auto=` 跟随全局风格（角色表）时这一槽取到的色 —— 它是「这槽到底是什么」的第一手依据；
 *   - `dims=` 该槽位图元的包围盒（单元与资产一致，多是米）—— 判断「这一槽是门板还是层板、
 *     是控制条还是外壳」靠它，不能只看角色名；
 *   - `档位` 段按 `presetIds` 的顺序列出**每一档**下这一槽解析出的色号 —— 这一段就是
 *     「逐模型核对该模型的预设值」的入口：同一件模型横着读，能看出这一档到底动了哪些槽；
 *     竖着读，能看出这一槽是否所有档位都一样（＝档位没接到这件料上）。
 */
function printModelFitReport(modelList: ModelFacts[]): void {
  for (const model of modelList) {
    if (LIGHT_ITEM_TYPES.has(model.itemType)) continue;
    const renderedSlots = model.materials.filter((material) => material.rendered);
    if (!renderedSlots.length) continue;
    const dimsByMaterial = new Map<number, number[]>();
    for (const primitive of primitivesOf(model.path)) {
      const dims = dimsByMaterial.get(primitive.materialIndex) ?? [0, 0, 0];
      for (let axis = 0; axis < 3; axis += 1) {
        dims[axis] = Math.max(dims[axis], Math.abs(primitive.box[3 + axis] - primitive.box[axis]));
      }
      dimsByMaterial.set(primitive.materialIndex, dims);
    }
    const presets = materialStyleOptionsFor(model.itemType);
    console.log(
      `[${model.itemType}] family=${resolveModelFamily(model.itemType)} ` +
        `style=${materialStyleGroupFor(model.itemType) || "-"} slots=${renderedSlots.length}` +
        (presets.length ? ` presetIds=[${presets.map((preset) => preset.id).join(" ")}]` : ""),
    );
    for (const slot of renderedSlots) {
      const resolution = resolveModelMaterialRole(model.itemType, slot.name, slot.index);
      const recipe = materialRoleRecipeFor(model.itemType, slot.name, PALETTES[0][1], slot.index);
      const slab = stoneSlabFlavorForMaterial(model.itemType, slot.name, slot.index);
      const dims = (
        dimsByMaterial.get(slot.position) ??
        dimsByMaterial.get(slot.index) ?? [0, 0, 0]
      )
        .map((value) => value.toFixed(2))
        .join("×");
      // 每一档下这一槽的色号（含石材板 / 透明标记）：这是「预设值是否匹配这件模型」的证据。
      const presetColors = presets.map((preset) => {
        const styleRecipe = materialStyleRecipeFor(
          model.itemType,
          slot.name,
          { ...PALETTES[0][1], ...preset.colors, materialStyle: preset.id },
          slot.index,
        );
        if (styleRecipe?.colorValue === undefined) return "--".padEnd(9);
        return (
          hex(styleRecipe.colorValue) +
          (styleRecipe.slab ? `[${styleRecipe.slab}]` : "") +
          (styleRecipe.transparent ? "(g)" : "")
        ).padEnd(9);
      });
      console.log(
        `    #${slot.position} ${resolution.role.padEnd(10)} ${(slot.name || "").padEnd(34)}` +
          ` dims=${dims.padEnd(18)} auto=${(recipe ? hex(recipe.colorValue) : "-").padEnd(9)}` +
          `${slab ? `slab=${slab.padEnd(11)}` : "".padEnd(16)}` +
          (presetColors.length ? `| ${presetColors.join(" ")}` : ""),
      );
    }
  }
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

auditSemanticFit(
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
  // 程序化宿主（门）与 GLB 模型同权：档位覆盖与可分辨性都要一起判。
  for (const model of [...modelList, ...proceduralHostFacts()]) {
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
  // 门（程序化宿主）另有一条比 60% 更严的规矩：**门型登记的每一个部件，每档都要显式声明**。
  // 角色表回落能让 `materialStyleRecipeFor` 永远返回非空（所以上面的覆盖率对门恒为 100%），
  // 但 `transparent` / `opacity` 只从档位配方来 —— 不显式声明，玻璃门的「玻璃」行就不报
  // 透明档位，面板看着不透明而画面是透明玻璃。玻璃门 3 槽里漏 1 槽也压不到 60% 阈值以下，
  // 所以这条必须单独钉住（2026-10 白色烤漆门等 4 档就是这么漏掉 glass 的）。
  const doorPresets = materialStyleOptionsFor("door");
  for (const [doorType, partRoles] of Object.entries(DOOR_MATERIAL_PART_ROLES_BY_TYPE)) {
    for (const preset of doorPresets) {
      if (!Object.keys(preset.roles).length) continue;
      const undeclaredRoles = partRoles.filter((role) => !(role in preset.roles));
      if (undeclaredRoles.length) {
        push(
          `L6c 门型 ${doorType} 的部件 ${undeclaredRoles.join(" / ")} 在档位 ${preset.id} 里没有显式配方：` +
            `会退回角色表，透明 / 表面档位随之丢失（面板与画面不一致）`,
        );
      }
    }
  }
  // 档位组可达性：任何一组都至少要有一个真实模型能选到，否则就是「死档位」（0.6.5 里
  // 石材台面组就曾因没挂模型而整组不可达，这里把它钉住）。
  const reachablePresetIds = new Set<string>();
  for (const model of [...modelList, ...proceduralHostFacts()]) {
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
     * 是家具暖木色 #c49a6c，而柜体实际刷的是 #3d2818 深木 + #e9e4da 白门；档位没声明的键
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
    for (const model of [...modelList, ...proceduralHostFacts()]) {
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

  // ── L6i 门的出图取色必须落到「本门型真实登记」的部件上 ────────────────────
  // 出图代码是固定写法（U 形门框取 frame、门扇填面取 door、玻璃取 glass…），而每个门型只登记
  // 自己拥有的部件（实木门只有门框 + 五金）。两条线对不上时 `partMaterials[role]` 是 undefined，
  // 而 `new Color(undefined)` 取 three.js 的初始值 —— **纯白**：实木门最大那块可见面（门扇填面）
  // 取的是 door，于是「改成胡桃木门，门还是白的」。这里钉住两件事：
  //   · 取角色必须经过 doorMaterialPartRoleFor 回落，不许直接 doorParts[role]；
  //   · 逐门型 × 逐出图语义，回落后的角色在两套色板 × 全部门档位下都要推得出生效颜色。
  {
    if (studioSource.includes("doorParts[roleName]")) {
      push("L6i 门出图直接取 doorParts[roleName]（本门型没有该部件时是 undefined，会画成纯白）");
    }
    if (!studioSource.includes("doorMaterialPartRoleFor(doorType, roleName)")) {
      push("L6i 门出图没有经过 doorMaterialPartRoleFor 回落（未登记部件会画成纯白）");
    }
    // 平面图也是这条链的消费者：代表部件必须登记过（否则平面图拿不到材质色、退回示意色），
    // 且取色要走 doorPlanColor（不许回到那套写死的示意色）。
    if (!studioSource.includes("doorPlanMaterialRoleFor(doorType)")) {
      push("L6i 平面图没有用 doorPlanMaterialRoleFor 取代表部件（档位在平面图上不生效）");
    }
    if (!studioSource.includes("function doorPlanColor(")) {
      push("L6i 平面图没有 doorPlanColor（门色会退回写死的示意色，档位看不出来）");
    }
    let doorPartResolutions = 0,
      doorPartFailures = 0;
    for (const [doorType, declaredRoles] of Object.entries(DOOR_MATERIAL_PART_ROLES_BY_TYPE)) {
      const planRole = doorPlanMaterialRoleFor(doorType);
      if (!declaredRoles.includes(planRole)) {
        push(
          `L6i 门型 ${doorType} 的平面图代表部件 ${planRole} 未登记在该门型部件表里` +
            "（平面图取不到材质色）",
        );
      }
      // 出图语义 + 平面图代表部件：两者都要在「本门型登记的部件」里取得到色。
      for (const requestedRole of new Set([...DOOR_MATERIAL_PARTS, planRole])) {
        const resolvedRole = doorMaterialPartRoleFor(doorType, requestedRole);
        if (!declaredRoles.includes(resolvedRole)) {
          doorPartFailures += 1;
          push(
            `L6i 门型 ${doorType} 取部件 ${requestedRole} 回落到未登记的 ${resolvedRole}` +
              "（出图拿不到材质，会画成纯白）",
          );
          continue;
        }
        const resolvedMaterialName = `door-material-${doorMaterialPartIndex(resolvedRole)}`;
        for (const doorPreset of materialStyleOptionsFor("door")) {
          for (const [paletteName, palette] of PALETTES) {
            const styledPalette = {
                ...palette,
                ...doorPreset.colors,
                materialStyle: doorPreset.id,
              },
              resolvedPartRecipe =
                materialStyleRecipeFor("door", resolvedMaterialName, styledPalette) ??
                materialRoleRecipeFor("door", resolvedMaterialName, palette);
            doorPartResolutions += 1;
            if (
              resolvedPartRecipe?.colorValue === undefined ||
              !isHealthyColor(resolvedPartRecipe.colorValue)
            ) {
              doorPartFailures += 1;
              push(
                `L6i 门型 ${doorType} 的 ${requestedRole}→${resolvedRole} 在档位 ${doorPreset.id} / ` +
                  `${paletteName} 色板下算不出颜色（出图会画成纯白）`,
              );
            }
          }
        }
      }
    }
    if (doorPartFailures) {
      push(`L6i 门部件取色有 ${doorPartFailures} 处落空（画面会出现纯白部件）`);
    }
    note(
      `L6i 门部件取色：${Object.keys(DOOR_MATERIAL_PART_ROLES_BY_TYPE).length} 个门型 × ` +
        `${DOOR_MATERIAL_PARTS.length} 种出图语义 + 平面图代表部件，解析 ${doorPartResolutions} 次` +
        "全部落到本门型登记的部件上",
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
      // 台盆的台面是第 1 个图元（`basin-material-1`，0.90×0.065×0.50 的薄板）：
      // 「白色 / 黑色大理石台面」的整图必须贴在这块料上（几何形状另见 L7e）。
      ["basin", "basin-marble-white", "basin-material-1", "marble"],
      ["basin", "basin-marble-black", "basin-material-1", "marble-dark"],
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
if (audit) printModelFitReport(models);
if (verbose) for (const note of notes) console.log(note);
process.exit(problems.length ? 1 : 0);

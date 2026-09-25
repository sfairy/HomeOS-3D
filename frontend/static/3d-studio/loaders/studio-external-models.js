/**
 * 外部模型（家具 / 家电）的资产表，以及加载、材质替换与落地管线。
 *
 * 每种类型对应两个 GLB：主资源是构建产出的 -lite.glb，fallbackUrl 是同目录完整版，两条路径
 * 都走同一个 GLTFLoader，因此这里只关心「用哪个 URL」。
 * 素材按类型分目录存放（models/furniture · appliance · bath · electronics · decor · structure · vehicle），
 * 路径一律经 modelAssetUrl() 拼装，「子目录 + 文件基名」在每个条目里显式写出 —— 文件基名与类型名并非
 * 总能互相拼出，推导规则一旦写错就是静默 404（物件退回过程几何，不报错、只难看）。
 * 单位与坐标：模型 scaleBasis 与物件规格的宽 / 高 / 深一律是米，模型以作者原点（通常底面中心）为基准；
 * 平面像素→场景米的换算在 studio-app.js 完成，本文件只处理场景米。
 * 生命周期：模型按类型缓存、克隆体共享几何与贴图，等价材质收敛成一份并缓存，重复副本立即 dispose，
 * 避免显存随物件数量线性增长（销毁逻辑靠实例上的 externalModelShared* 标记判断）。
 */
import { finite } from "./studio-normalization.js?v=2609252203";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../utils/debug-log.js?v=2609252203";
// 模型模板的跨会话持久缓存与它的信封编解码：同一份 -lite.glb 在同一个浏览器里会被反复解析
// （每次进编辑器 / 舞台都要重来一遍下载 + GLTF 解析 + 材质构建），命中缓存就直接还原上一会话
// 准备好的模板。两个模块必须同一条戳 —— 缓存键里带着编解码版本，两者错开就是「存得进、读不出」。
import { createModelPersistentCache } from "../model-persistent-cache.js?v=2609252203";
import { modelTemplateKey } from "../model-template-codec.js?v=2609252203";
// 主题专用的两个模块：地板材质着色器增强（场景，看 palette.warmWood）与树叶几何放大
// （家居，看 palette.warmFurniture）。两者都只在对应开关为真时被调用，其它情况下不产生任何效果。
import { decorateWarmFloor } from "../studio/studio-scene-style.js?v=2609252203";
import { enlargeWarmLeaves } from "../materials/studio-warm-foliage.js?v=2609252203";
// 石材板整图（茶几的两块石板、餐桌台面）：与背景墙的「大理石」共用白色色号那张缓存贴图，
// 另加一个黑金大理石色号（背景墙没有这一档，见 createStoneSlabTexture 的注释）。
import { createStoneSlabTexture } from "../materials/studio-surface-textures.js?v=2609252203";
// 逐物件「材质风格」的质感贴图（均值≈1 的细节图）：走调色板上的 materialSurface 键。
import {
  createMaterialSurfaceTexture,
  hasMaterialSurfaceTexture
} from "../materials/studio-surface-fabrics.js?v=2609252203";
// 柜类名单与「取色」共用一份（studio-app.js 的 paletteForItemType 也读它）：
// 名单一旦两处各写一份，模型加载中的占位几何与到位后的成品就会是两个颜色。
// 不锈钢家电的名单同理：材质替换要知道哪些类型该保留红蓝水管的原色。
import {
  APPLIANCE_FINISH_BY_ITEM_TYPE,
  JOINERY_ITEM_TYPES
} from "../studio/studio-item-types.js?v=2609252203";
const HOME_LITE_MODEL_VERSION = "2609252203";
const APPLIANCE_LITE_MODEL_VERSION = "2609252203";
/**
 * 模型素材按类型分目录存放（models/ 下：furniture / appliance / bath / electronics / decor /
 * structure / vehicle）。分类目录只是收纳手段，对加载与缓存都不透明：后端缓存白名单用的是
 * 目录前缀 `/static/3d-studio/models/`（backend/main.py），子目录同样命中强缓存。
 *
 * 每个条目都显式给出「子目录 + 文件基名」，**不按类型名推导**：文件基名与类型名并非总能互相
 * 拼出（steelstairs → steel-stairs，smallcar → car，rounddiningtable_turntable 又保留了下划线，
 * pillar_round → pillar-round）。推导规则一旦写错就是静默 404，而静默降级只会让物件悄悄退回
 * 过程几何，极难发现，所以宁可多写一个字符串。variant 只有 "lite" / "full" 两种。
 */
function modelAssetUrl(modelDir, fileKey, version, variant) {
  return (
    "/static/3d-studio/models/" +
    modelDir +
    "/" +
    fileKey +
    (variant === "lite" ? "-lite" : "") +
    ".glb?v=" +
    version
  );
}
/**
 * 自带独立 GLB 资源的异形柱形：方形柱沿用原先烘焙好的方盒，因此仍留在普通的
 * "pillar" 模型上，物件本身的行为保持不变。
 */
const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
/**
 * 柱族的全部**模型类型**键（含方柱）：`pillar` 与 `pillar_<形状>`。
 *
 * 为什么要单独拉一张表：柱子的材质与反射角色是按「它属于墙的一部分」定的（见
 * applyAppliancePalette 的柱分支与 addExternalItemModel 里的 reflectionRole），而异形柱
 * 在 modelTypeForItem 里会被拼成 `pillar_round` 这种派生键 —— 判据写成 `=== "pillar"` 会让
 * 四种异形柱悄悄落回普通家具那一支（换墙色时偏偏是它们不变色）。
 */
const PILLAR_MODEL_ITEM_TYPES = new Set([
  "pillar",
  ...[...PILLAR_ASSET_SHAPES].map(pillarShape => "pillar_" + pillarShape)
]);
/**
 * 给一块「石材板」几何写一份平面 UV：餐桌那几个模型只有 POSITION / NORMAL，直接贴石材会采到
 * (0,0) 一个点。板面近似水平，所以取几何的水平包围盒做正交投影 —— 把较长的一边归一化到 0~1，
 * 让整张石材纹完整落在板面上，而不是被拉伸成条纹（短边方向留白由 wrap 重复补上，比例不失真）。
 *
 * **已有 UV 也会覆盖**：流水线模型带的是生成器给的立方体 UV（每个面各贴一遍 0~1），
 * 石材纹会在六个面上各缩一遍、接缝处对不上；石材是一整块料，纹路必须沿整块板面走。
 */
function ensureStoneSlabPlanarUv(threeLib, slabGeometry) {
  if (!slabGeometry?.attributes?.position) {
    return;
  }
  slabGeometry.computeBoundingBox();
  const geometryBounds = slabGeometry.boundingBox;
  const centerX = (geometryBounds.min.x + geometryBounds.max.x) / 2;
  const centerZ = (geometryBounds.min.z + geometryBounds.max.z) / 2;
  const horizontalSpan = Math.max(
    geometryBounds.max.x - geometryBounds.min.x,
    geometryBounds.max.z - geometryBounds.min.z,
    0.001
  );
  const slabPosition = slabGeometry.attributes.position;
  const planarUv = new Float32Array(slabPosition.count * 2);
  for (let vertexIndex = 0; vertexIndex < slabPosition.count; vertexIndex += 1) {
    planarUv[vertexIndex * 2] = (slabPosition.getX(vertexIndex) - centerX) / horizontalSpan + 0.5;
    planarUv[vertexIndex * 2 + 1] =
      (slabPosition.getZ(vertexIndex) - centerZ) / horizontalSpan + 0.5;
  }
  slabGeometry.setAttribute("uv", new threeLib.BufferAttribute(planarUv, 2));
}
/**
 * 按模型类型给石材板部件写平面 UV。判据与材质替换期共用 STONE_SLAB_FLAVOR_BY_MODEL_SLOT
 * （槽位号是建模约定，不能凭外观猜）；多材质网格与不在表里的部件一律跳过。
 *
 * 这里按**槽位**判而不是按色号判：色号可能随档位变（同一块网格在甲档位是整块石材、
 * 在乙档位是细节层石纹），但「哪一块是板」是几何事实，不随档位变。
 */
function applyStoneSlabPlanarUv(threeLib, modelRoot, modelType) {
  const slotFlavors = STONE_SLAB_FLAVOR_BY_MODEL_SLOT[modelType];
  if (!slotFlavors) {
    return;
  }
  modelRoot.traverse(modelMesh => {
    if (!modelMesh.isMesh || Array.isArray(modelMesh.material)) {
      return;
    }
    const { slot } = parseMaterialSlotAndRole(modelMesh.material?.name);
    if (slot === undefined || slotFlavors[Number(slot)] === undefined) {
      return;
    }
    ensureStoneSlabPlanarUv(threeLib, modelMesh.geometry);
  });
}
/**
 * 生成「家居类」模型定义：主资源用 -lite 轻量版，回退到完整版。
 * 两个 URL 都带 ?v= 版本戳（破缓存），版本号由调用方按发布时间传入，换模型必须同步更新，否则浏览器会继续
 * 用旧资源。返回前 Object.freeze 冻结：这张表是模块级常量、被多处按类型查表，冻结可避免意外改写。
 */
function defineHomeItemModel(modelDir, fileKey, homeModelOverrides) {
  return Object.freeze({
    url: modelAssetUrl(modelDir, fileKey, HOME_LITE_MODEL_VERSION, "lite"),
    fallbackUrl: modelAssetUrl(modelDir, fileKey, HOME_LITE_MODEL_VERSION, "full"),
    ...homeModelOverrides
  });
}
/**
 * 生成「电器类」模型定义：与家居类同构，区别只是轻量版与完整版共用一个版本常量（APPLIANCE_LITE_MODEL_VERSION，而非各自传入），因为两者由同一次构建产出。
 * 单独一个函数是为了让日后家电与家具分开更新时不必回头改表结构。
 */
function defineApplianceItemModel(modelDir, fileKey, applianceModelOverrides) {
  return Object.freeze({
    url: modelAssetUrl(modelDir, fileKey, APPLIANCE_LITE_MODEL_VERSION, "lite"),
    fallbackUrl: modelAssetUrl(modelDir, fileKey, APPLIANCE_LITE_MODEL_VERSION, "full"),
    ...applianceModelOverrides
  });
}
const EXTERNAL_ITEM_MODELS = Object.freeze({
  // 沙发：流水线产物（tools/models/model-specs.mjs 的 sofa），底面精确落在 y=0，
  // 因此只留 preserveOrigin —— 旧资产那份 groundAlign + groundOffset 是给「底面浮在 0.115m」的
  // 旧几何打的补丁，留着会把新模型再往下摁 8mm。
  sofa: defineHomeItemModel("furniture", "sofa", {
    scaleBasis: [2.2, 0.82, 0.9],
    preserveOrigin: true
  }),
  coffeetable: defineHomeItemModel("furniture", "coffeetable", {
    scaleBasis: [1.9, 0.5, 1.05],
    preserveOrigin: true
  }),
  squarecoffeetable: defineHomeItemModel("furniture", "squarecoffeetable", {
    // 流水线产物（tools/models/model-specs.mjs 的 squarecoffeetable）：厚台面 + 望板 + 四条方腿 +
    // 下层置物板，四块各自有角色（top / trim / leg / shelf），不再靠材质名后缀认部件。
    scaleBasis: [1.4, 0.46, 0.7],
    preserveOrigin: true
  }),
  tvstand: defineHomeItemModel("furniture", "tvstand", {
    // 流水线产物（tools/models/model-specs.mjs 的 tvstand）。重建前是既有资产：实测 1.80 × 0.44，
    // 比声明的 0.42 深 7%，运行侧按分轴缩放会把箱体压薄一圈。
    scaleBasis: [1.8, 0.48, 0.42],
    preserveOrigin: true
  }),
  rug: defineHomeItemModel("decor", "rug", {
    // 流水线产物（tools/models/model-specs.mjs 的 rug）。旧资产实测 0.013 而声明 0.012，
    // 1mm 的差在 13mm 的厚度上是 8%，按分轴缩放会把包边压掉一半；重建后逐值对齐。
    scaleBasis: [2, 0.013, 1.4],
    preserveOrigin: true
  }),
  plant: defineHomeItemModel("decor", "plant", {
    // 流水线产物。旧资产实测只有 0.647 × 1.622 × 0.375 —— 进深比声明的 0.75 少了整整一半，
    // 运行侧按分轴缩放把它横向拉宽一倍（审计里偏差最大的一条）。重建后冠幅真的铺到 0.75 × 0.75。
    scaleBasis: [0.75, 1.6, 0.75],
    preserveOrigin: true
  }),
  bed: defineHomeItemModel("furniture", "bed", {
    // 流水线产物（tools/models/model-specs.mjs 的 bed）。这里原先还挂着
    // geometryRevision: "20260908-base-inset-v1" —— 那是给旧资产的底座做 0.4% 内缩补丁的标记，
    // 而标记本身没有任何地方读，补丁的包围盒判据在新几何上也永不命中，已一并删除。
    // 高度 0.62 → 1.05：整件最高的一件是床头板（软包床头实物的顶面就在 1.0~1.1m），
    // 旧值只到床垫面之上 14cm，于是床头板在成品里读不出来。
    scaleBasis: [1.8, 1.05, 2],
    preserveOrigin: true
  }),
  nightstand: defineHomeItemModel("furniture", "nightstand", {
    // 流水线产物（tools/models/model-specs.mjs 的 nightstand）。旧资产实测 0.52 × 0.45，宽深各差 4% / 8%。
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("furniture", "vanity", {
    // 流水线产物（tools/models/model-specs.mjs 的 vanity）：四条金属细腿 + 双抽屉箱 + 立式梳妆镜。
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("furniture", "desk", {
    // 流水线产物（tools/models/model-specs.mjs 的 desk）：薄台面 + 单层抽屉箱 + 四条收分腿 +
    // 背面挡板；抽屉面一根横向长拉手（`metal` 角色，不再是按材质名后缀猜的）。
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("furniture", "bookcase", {
    // 流水线产物（tools/models/model-specs.mjs 的 bookcase）。旧资产实测 1.20 × 0.35，深 8%。
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  smallcar: defineHomeItemModel("vehicle", "car", {
    // 流水线产物（tools/models/model-specs.mjs 的 smallcar）：+z 是车头、底面精确落在 y=0、
    // 六个极值全由轴对齐零件定下。重建前那件是第三方车模（Z 朝上、车漆效果整段挂在贴图集上），
    // 注册条目给不出 scaleBasis，运行侧只能拿实测包围盒当基准 —— 车长 5.01m 也就无从校准。
    scaleBasis: [2.19, 1.43, 5.01],
    preserveOrigin: true
  }),
  // 线性出风口：口长沿 Z（environment-airflow.js 按 modelBox.max.x 出风、绕 Y 转 90°），
  // 宽 0.188 是进深而不是「面宽」—— 这份基准曾被旧资产的英寸单位搅乱（旧 GLB 是 0.30 × 2.00 ×
  // 0.19 且长边在 Y 上），运行侧于是按三轴各不相同的倍率硬拉，风口被压成一片薄板。流水线重建后
  // 三轴倍率都是 1，风口不再被拉变形。
  airoutlet: defineApplianceItemModel("appliance", "airoutlet", {
    scaleBasis: [0.188, 0.3, 2],
    preserveOrigin: true
  }),
  pipelinewaterpurifier: defineApplianceItemModel("appliance", "pipelinewaterpurifier", {
    scaleBasis: [0.48, 0.68, 0.24],
    preserveOrigin: true
  }),
  tea_bar_machine: defineApplianceItemModel("appliance", "tea_bar_machine", {
    scaleBasis: [0.62, 1.32, 0.48],
    preserveOrigin: true
  }),
  // 家用电梯轿厢：2026-09 按流水线规格重建（见 model-specs.mjs 的 elevator）。
  // 重建前是厘米单位、原点漂着、材质名一串 `[Color_003]` 的既有资产，注册条目连
  // scaleBasis 都给不出 —— 运行侧只能拿 GLB 自己的包围盒当基准，占地多大由资产自己说了算。
  elevator: defineHomeItemModel("structure", "elevator", {
    scaleBasis: [1.4, 2.2, 1.52],
    preserveOrigin: true
  }),
  // 钢 / 玻璃楼梯原先是 mm 单位、原点在角落、材质名来路不明的既有资产，注册条目连
  // scaleBasis 都没写 —— 运行侧只好拿 GLB 自己的包围盒当基准，于是「占地多大」这件事
  // 由资产自己说了算（改一次导出，物件在平面图上的占位就跟着变）。
  // 2026-09 按流水线规格重建（U 形双跑，见 model-specs.mjs 的 uStairLayout）：两跑各 10 级、
  // 平台贴 -z 端，升满整个层高；**不含扶手**，包围盒顶面就是顶层踏面。
  steelstairs: defineHomeItemModel("structure", "steel-stairs", {
    scaleBasis: [1.86, 3.45, 2.93],
    preserveOrigin: true
  }),
  glassstairs: defineHomeItemModel("structure", "glass-stairs", {
    scaleBasis: [2.51, 3.41, 2.84],
    preserveOrigin: true
  }),
  // 悬空楼梯（1 字型直跑）：流水线产物（tools/models/model-specs.mjs 的 floatingstairs）。
  // 与上面三件不同，它**只有 10 级悬挑踏板**，没有斜梁 / 立柱 / 平台 —— 支承在实物里藏在
  // 墙内，模型刻意一根可见的承重件都不做。scaleBasis 逐值等于规格 size，否则运行侧按
  // 非等比缩放会把这 0.97 × 2.25 的窄梯拉扁。
  floatingstairs: defineHomeItemModel("structure", "floating-stairs", {
    scaleBasis: [0.97254264, 2.59010673, 2.2483418],
    preserveOrigin: true
  }),
  piano: defineHomeItemModel("furniture", "piano", {
    // 流水线产物（tools/models/model-specs.mjs 的 piano）。重建前那件是第三方素材：
    // 单位厘米、底面在 y = −0.502、材质名是「金色金属材料 / [Color_009]1」这种，
    // 注册条目只能写 preserveAspect（等比缩放）而给不出 scaleBasis —— 于是它虽然一直挂着
    // 一份 GLB，却从没被加载过（画面上是兜底方块），也不会跟着材质风格换色。
    scaleBasis: [1.5, 0.99, 1.5],
    preserveOrigin: true
  }),
  armchair: defineHomeItemModel("furniture", "armchair", {
    scaleBasis: [0.85, 0.75, 0.80],
    preserveOrigin: true
  }),
  loungechair: defineHomeItemModel("furniture", "loungechair", {
    scaleBasis: [0.70, 0.85, 1.60],
    preserveOrigin: true
  }),
  ottoman: defineHomeItemModel("furniture", "ottoman", {
    scaleBasis: [0.60, 0.40, 0.45],
    preserveOrigin: true
  }),
  bench: defineHomeItemModel("furniture", "bench", {
    scaleBasis: [1.40, 0.45, 0.42],
    preserveOrigin: true
  }),
  barstool: defineHomeItemModel("furniture", "barstool", {
    scaleBasis: [0.42, 0.95, 0.42],
    preserveOrigin: true
  }),
  sidetable: defineHomeItemModel("furniture", "sidetable", {
    scaleBasis: [0.45, 0.55, 0.45],
    preserveOrigin: true
  }),
  console: defineHomeItemModel("furniture", "console", {
    scaleBasis: [1.20, 0.80, 0.35],
    preserveOrigin: true
  }),
  chestdrawer: defineHomeItemModel("furniture", "chestdrawer", {
    scaleBasis: [1.00, 1.10, 0.45],
    preserveOrigin: true
  }),
  entrycabinet: defineHomeItemModel("furniture", "entrycabinet", {
    scaleBasis: [1.00, 1.10, 0.38],
    preserveOrigin: true
  }),
  displaycabinet: defineHomeItemModel("furniture", "displaycabinet", {
    scaleBasis: [0.90, 1.80, 0.40],
    preserveOrigin: true
  }),
  bunkbed: defineHomeItemModel("furniture", "bunkbed", {
    scaleBasis: [1.00, 1.70, 1.95],
    preserveOrigin: true
  }),
  kidsbed: defineHomeItemModel("furniture", "kidsbed", {
    scaleBasis: [0.95, 0.65, 1.60],
    preserveOrigin: true
  }),
  chaise: defineHomeItemModel("furniture", "chaise", {
    scaleBasis: [0.75, 0.72, 1.65],
    preserveOrigin: true
  }),
  nestingtable: defineHomeItemModel("furniture", "nestingtable", {
    scaleBasis: [0.55, 0.5, 0.55],
    preserveOrigin: true
  }),
  roundcoffeetable: defineHomeItemModel("furniture", "roundcoffeetable", {
    scaleBasis: [0.9, 0.42, 0.9],
    preserveOrigin: true
  }),
  screenspan: defineHomeItemModel("furniture", "screenspan", {
    scaleBasis: [1.6, 1.75, 0.35],
    preserveOrigin: true
  }),
  coatrail: defineHomeItemModel("furniture", "coatrail", {
    scaleBasis: [0.45, 1.75, 0.45],
    preserveOrigin: true
  }),
  stool: defineHomeItemModel("furniture", "stool", {
    scaleBasis: [0.36, 0.45, 0.36],
    preserveOrigin: true
  }),
  locker: defineHomeItemModel("furniture", "locker", {
    scaleBasis: [0.9, 1.8, 0.4],
    preserveOrigin: true
  }),
  laundrycabinet: defineHomeItemModel("furniture", "laundrycabinet", {
    scaleBasis: [0.65, 0.85, 0.6],
    preserveOrigin: true
  }),
  balconycabinet: defineHomeItemModel("furniture", "balconycabinet", {
    scaleBasis: [0.8, 1.2, 0.4],
    preserveOrigin: true
  }),
  winecabinet: defineHomeItemModel("furniture", "winecabinet", {
    scaleBasis: [0.6, 1.6, 0.45],
    preserveOrigin: true
  }),
  kitchenisland: defineHomeItemModel("furniture", "kitchenisland", {
    scaleBasis: [1.6, 0.9, 0.8],
    preserveOrigin: true
  }),
  pantry: defineHomeItemModel("furniture", "pantry", {
    scaleBasis: [0.9, 1.9, 0.42],
    preserveOrigin: true
  }),
  daybed: defineHomeItemModel("furniture", "daybed", {
    scaleBasis: [1.2, 0.55, 2],
    preserveOrigin: true
  }),
  cot: defineHomeItemModel("furniture", "cot", {
    scaleBasis: [0.7, 0.95, 1.35],
    preserveOrigin: true
  }),
  computertable: defineHomeItemModel("furniture", "computertable", {
    scaleBasis: [1.2, 0.75, 0.6],
    preserveOrigin: true
  }),
  officestool: defineHomeItemModel("furniture", "officestool", {
    scaleBasis: [0.6, 1, 0.6],
    preserveOrigin: true
  }),
  filecabinet: defineHomeItemModel("furniture", "filecabinet", {
    scaleBasis: [0.8, 1.3, 0.45],
    preserveOrigin: true
  }),
  booktower: defineHomeItemModel("furniture", "booktower", {
    scaleBasis: [0.5, 1.6, 0.3],
    preserveOrigin: true
  }),
});
/**
 * 全部可在画面上出现的模型条目。
 *
 * `...EXTERNAL_ITEM_MODELS` 之后**不要再重复声明**同一类型的条目：那是「先铺一层再把同值的
 * 条目盖回去」，两头一旦改得不一致（改了下面漏了上面，或反过来），生效的永远是后者，
 * 而护栏只按「注册表 ↔ models/ 目录」两端对账、查不出**同一条目被同一份表声明了两遍**。
 * 原先 bed / nightstand / vanity / desk / bookcase 这五条就是这种影子条目
 * （值与 EXTERNAL_ITEM_MODELS 逐字相同，纯冗余），已删掉；要改这几个类型请去上面那一份改。
 * 这里只保留 EXTERNAL_ITEM_MODELS 里没有的条目。
 */
export const ALL_ITEM_MODELS = Object.freeze({
  ...EXTERNAL_ITEM_MODELS,
  aquarium: defineHomeItemModel("decor", "aquarium", {
    scaleBasis: [1.5, 1.4, 0.55],
    preserveOrigin: true
  }),
  table: defineHomeItemModel("furniture", "table", {
    // 流水线产物（tools/models/model-specs.mjs 的 table）：木台面 + 望板 + 四条收分腿，
    // 六张餐椅由 diningChair 助手生成、各带 leg / trim / cushion 角色。
    // 旧资产把六张椅子与桌面烘进同一批材质（材质名只有槽位号），只能整件按调色板取色 ——
    // 桌面与椅垫必然同色，也就没有「木桌 + 软包椅」这层关系。
    scaleBasis: [2.4, 0.82, 1.8],
    preserveOrigin: true
  }),
  rounddiningtable: defineHomeItemModel("furniture", "rounddiningtable", {
    // 流水线产物：车削中柱 + 落地底盘 + 台面围边 + 圆台面 + 四张软包餐椅。
    // 与带转盘那一件共用同一段骨架（同一个生成函数），两件的 scaleBasis 逐值相等。
    scaleBasis: [2.2, 0.78, 2.2],
    preserveOrigin: true
  }),
  chair: defineHomeItemModel("furniture", "chair", {
    scaleBasis: [0.5, 0.86, 0.5],
    preserveOrigin: true
  }),
  bar: defineHomeItemModel("furniture", "bar", {
    // 流水线产物：吧台柜 + 踏脚横杆 + 三格敞开酒格 + 三张无靠背吧凳。
    // 旧资产把三张吧凳并进吧台 GLB，凳腿与柜台共用材质；重建后吧凳的金属腿（leg）与
    // 座面（cushion）各自独立。
    scaleBasis: [2.2, 1.05, 0.65],
    preserveOrigin: true
  }),
  sideboard: defineHomeItemModel("furniture", "sideboard", {
    scaleBasis: [1.6, 2.2, 0.45],
    preserveOrigin: true
  }),
  shoecabinet: defineHomeItemModel("furniture", "shoecabinet", {
    // 2026-09 从既有资产迁进流水线（见 tools/models/model-specs.mjs 的 shoecabinet 那一段）。
    // 旧资产实测包围盒 1.809 × 2.205 × 0.449，与这里声明的 1.8 × 2.25 × 0.42 差 7%（深 0.449 对
    // 0.42）—— 运行侧按分轴缩放把它拉成声明尺寸，于是**门板比柜体多出来的 2cm 被压成 1.8cm**、
    // 台面那条石色带也被压偏。迁进流水线之后几何就是按 1.8 / 2.25 / 0.42 烘的，缩放变成 1:1，
    // 这条 scaleBasis 从此描述的是「成品多大」**同时也是**「资产本来就多大」。
    scaleBasis: [1.8, 2.25, 0.42],
    preserveOrigin: true
  }),
  cabinet: defineHomeItemModel("furniture", "cabinet", {
    scaleBasis: [1.6, 1.9, 0.45],
    preserveOrigin: true
  }),
  glasscabinet: defineHomeItemModel("furniture", "glasscabinet", {
    // 流水线产物（tools/models/model-specs.mjs 的 glasscabinet）：玻璃门是 `glass` 角色，
    // 不再靠槽位号认门（旧资产 1/2/12 号那套编号已随重建作废）。
    scaleBasis: [1.2, 1.9, 0.4],
    preserveOrigin: true
  }),
  shelf: defineHomeItemModel("furniture", "shelf", {
    // 流水线产物（tools/models/model-specs.mjs 的 shelf）：敞开置物架，侧板直接落地，没有踢脚。
    scaleBasis: [1.2, 1.8, 0.45],
    preserveOrigin: true
  }),
  wallcabinet: defineHomeItemModel("furniture", "wallcabinet", {
    // 流水线产物（tools/models/model-specs.mjs 的 wallcabinet）。重建前实测 1.53 × 0.38，深 8%。
    scaleBasis: [1.5, 0.82, 0.35],
    preserveOrigin: true
  }),
  kitchenbase: defineHomeItemModel("furniture", "kitchenbase", {
    // 流水线产物（tools/models/model-specs.mjs 的 kitchenbase）：踢脚 + 柜体 + 四扇门 + 通长台面。
    // 三件厨房地柜（这一件与下面两件）共用同一段柜体骨架，差别只在台面上那件事。
    // 旧资产把柜体与台面烘在同一片深灰里（材质名只有槽位号），而这三件在实物上恰恰是
    // 「木柜体 + 石台面 + 不锈钢盆 / 灶具」的三料组合，整件一色等于把厨房最要紧的材质关系抹掉了。
    scaleBasis: [2.4, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchensink: defineHomeItemModel("furniture", "kitchensink", {
    // 流水线产物：与地柜同一套柜体，台面开孔嵌一只不锈钢台下盆（盆体是独立的 `sink` 角色）。
    // 旧资产实测进深 0.648（声明 0.6）、高 1.038（把龙头烘进了模型），运行侧只能按分轴缩放去凑。
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchencooktop: defineHomeItemModel("furniture", "kitchencooktop", {
    // 流水线产物：与地柜同一套柜体，台面开孔里坐着一块低于台面 1cm 的灶面板（下嵌灶），
    // 灶面与火盖是独立的 `cooktop` / `metal` 角色。台面高度必须与另外两件逐值相等 ——
    // 成排的地柜一旦不等高，接缝处就会错台。
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  basin: defineHomeItemModel("bath", "basin", {
    scaleBasis: [0.9, 0.88, 0.5],
    preserveOrigin: true
  }),
  toilet: defineHomeItemModel("bath", "toilet", {
    scaleBasis: [0.42, 0.52, 0.7],
    preserveOrigin: true
  }),
  squattoilet: defineHomeItemModel("bath", "squattoilet", {
    scaleBasis: [0.45, 0.18, 0.65],
    preserveOrigin: true
  }),
  urinal: defineHomeItemModel("bath", "urinal", {
    scaleBasis: [0.38, 0.72, 0.34],
    preserveOrigin: true
  }),
  shower: defineHomeItemModel("bath", "shower", {
    scaleBasis: [0.9, 2.1, 0.9],
    preserveOrigin: true
  }),
  bathtub: defineHomeItemModel("bath", "bathtub", {
    scaleBasis: [1.7, 0.58, 0.78],
    preserveOrigin: true
  }),
  glasspartition: defineHomeItemModel("bath", "glasspartition", {
    scaleBasis: [1.2, 2, 0.08],
    preserveOrigin: true
  }),
  stairs: defineHomeItemModel("structure", "stairs", {
    scaleBasis: [1, 1.65, 2.8],
    preserveOrigin: true
  }),
  pillar: defineHomeItemModel("structure", "pillar", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  // 异形柱必须有真实资源：替换外部模型时，程序化生成的柱体会被加载进来的 GLB 顶掉，而一个烘焙成方盒的模型会悄悄把所有非方形柱形都变成方形。
  // 这些网格与 studio-app.js 构建出的几何同源（见 gen-pillars.mjs），并共用柱体的 scaleBasis，因此物件仍保持 0.45 × 2.8 × 0.45 的占地与「底面在原点」的摆放约定。
  pillar_round: defineHomeItemModel("structure", "pillar-round", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  pillar_semicircle: defineHomeItemModel("structure", "pillar-semicircle", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  pillar_quarter: defineHomeItemModel("structure", "pillar-quarter", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  pillar_quarterinner: defineHomeItemModel("structure", "pillar-quarterinner", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  curtain_left: defineHomeItemModel("decor", "curtain_left", {
    // 流水线产物（tools/models/model-specs.mjs 的 curtainSpec("left")）。三段的 scaleBasis 相同，
    // 因为它们的差别只在**帘布怎么分**（单幅带前缘 / 两幅对开），占地与高度是同一个窗口的尺寸。
    // 旧资产把下摆抬到离地 6cm、原点留在半空（y 0.060…2.394），流水线产物是落地帘（底面 y=0），
    // 因此这里不再需要给窗帘留任何悬空的余地。
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_right: defineHomeItemModel("decor", "curtain_right", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_split: defineHomeItemModel("decor", "curtain_split", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  rounddiningtable_turntable: defineHomeItemModel(
    "furniture",
    "rounddiningtable_turntable",
    {
      scaleBasis: [2.2, 0.78, 2.2],
      preserveOrigin: true
    }
  ),
  tv_standard: defineApplianceItemModel("electronics", "tv_standard", {
    scaleBasis: [1.5, 0.92, 0.06],
    preserveOrigin: true
  }),
  tv_tabletop: defineApplianceItemModel("electronics", "tv_tabletop", {
    scaleBasis: [1.5, 0.92, 0.18],
    preserveOrigin: true
  }),
  tv_mobile: defineApplianceItemModel("electronics", "tv_mobile", {
    scaleBasis: [1.5, 1.55, 0.55],
    preserveOrigin: true
  }),
  wallac: defineApplianceItemModel("appliance", "wallac", {
    scaleBasis: [0.9, 0.28, 0.22],
    preserveOrigin: true
  }),
  floorac: defineApplianceItemModel("appliance", "floorac", {
    scaleBasis: [0.42, 1.75, 0.42],
    preserveOrigin: true
  }),
  airpurifier: defineApplianceItemModel("appliance", "airpurifier", {
    scaleBasis: [0.34, 0.7, 0.34],
    preserveOrigin: true
  }),
  robotvacuum: defineApplianceItemModel("appliance", "robotvacuum", {
    scaleBasis: [0.55, 0.85, 0.5],
    preserveOrigin: true
  }),
  floorlamp: defineApplianceItemModel("decor", "floorlamp", {
    scaleBasis: [1.35, 1.8, 0.5],
    preserveOrigin: true
  }),
  walllamp: defineApplianceItemModel("decor", "walllamp", {
    scaleBasis: [0.3, 0.34, 0.22],
    preserveOrigin: true
  }),
  fridge: defineApplianceItemModel("appliance", "fridge", {
    scaleBasis: [0.75, 1.85, 0.72],
    preserveOrigin: true
  }),
  rangehood: defineApplianceItemModel("appliance", "rangehood", {
    scaleBasis: [0.9, 0.55, 0.45],
    preserveOrigin: true
  }),
  dishwasher: defineApplianceItemModel("appliance", "dishwasher", {
    scaleBasis: [0.6, 0.82, 0.6],
    preserveOrigin: true
  }),
  steamoven: defineApplianceItemModel("appliance", "steamoven", {
    scaleBasis: [0.6, 0.6, 0.55],
    preserveOrigin: true
  }),
  microwave: defineApplianceItemModel("appliance", "microwave", {
    scaleBasis: [0.52, 0.32, 0.42],
    preserveOrigin: true
  }),
  ricecooker: defineApplianceItemModel("appliance", "ricecooker", {
    scaleBasis: [0.28, 0.25, 0.32],
    preserveOrigin: true
  }),
  washer: defineApplianceItemModel("appliance", "washer", {
    scaleBasis: [0.6, 0.85, 0.65],
    preserveOrigin: true
  }),
  dryer: defineApplianceItemModel("appliance", "dryer", {
    scaleBasis: [0.6, 0.85, 0.65],
    preserveOrigin: true
  }),
  storagewaterheater: defineApplianceItemModel("appliance", "storagewaterheater", {
    scaleBasis: [0.86, 0.48, 0.46],
    preserveOrigin: true
  }),
  gaswaterheater: defineApplianceItemModel("appliance", "gaswaterheater", {
    scaleBasis: [0.42, 0.72, 0.22],
    preserveOrigin: true
  }),
  desktop: defineApplianceItemModel("electronics", "desktop", {
    scaleBasis: [0.72, 0.5, 0.32],
    preserveOrigin: true
  }),
  laptop: defineApplianceItemModel("electronics", "laptop", {
    scaleBasis: [0.36, 0.22, 0.28],
    preserveOrigin: true
  }),
  nas: defineApplianceItemModel("electronics", "nas", {
    scaleBasis: [0.28, 0.34, 0.24],
    preserveOrigin: true
  }),
  soundbar: defineApplianceItemModel("electronics", "soundbar", {
    scaleBasis: [0.95, 0.08, 0.12],
    preserveOrigin: true
  }),
  speaker: defineApplianceItemModel("electronics", "speaker", {
    scaleBasis: [0.28, 1.05, 0.28],
    preserveOrigin: true
  }),
  projector: defineApplianceItemModel("electronics", "projector", {
    scaleBasis: [0.30, 0.10, 0.24],
    preserveOrigin: true
  }),
  fan: defineApplianceItemModel("appliance", "fan", {
    scaleBasis: [0.40, 1.15, 0.40],
    preserveOrigin: true
  }),
  humidifier: defineApplianceItemModel("appliance", "humidifier", {
    scaleBasis: [0.30, 0.55, 0.30],
    preserveOrigin: true
  }),
  dehumidifier: defineApplianceItemModel("appliance", "dehumidifier", {
    scaleBasis: [0.35, 0.60, 0.28],
    preserveOrigin: true
  }),
  freshair: defineApplianceItemModel("appliance", "freshair", {
    scaleBasis: [0.60, 0.30, 0.30],
    preserveOrigin: true
  }),
  thermostat: defineApplianceItemModel("electronics", "thermostat", {
    scaleBasis: [0.10, 0.10, 0.02],
    preserveOrigin: true
  }),
  smartpanel: defineApplianceItemModel("electronics", "smartpanel", {
    scaleBasis: [0.12, 0.12, 0.02],
    preserveOrigin: true
  }),
  smartlock: defineApplianceItemModel("electronics", "smartlock", {
    scaleBasis: [0.08, 0.28, 0.05],
    preserveOrigin: true
  }),
  doorbell: defineApplianceItemModel("electronics", "doorbell", {
    scaleBasis: [0.06, 0.13, 0.03],
    preserveOrigin: true
  }),
  gateway: defineApplianceItemModel("electronics", "gateway", {
    scaleBasis: [0.12, 0.05, 0.12],
    preserveOrigin: true
  }),
  gameconsole: defineApplianceItemModel("electronics", "gameconsole", {
    scaleBasis: [0.3, 0.08, 0.24],
    preserveOrigin: true
  }),
  avreceiver: defineApplianceItemModel("electronics", "avreceiver", {
    scaleBasis: [0.44, 0.16, 0.35],
    preserveOrigin: true
  }),
  screenpanel: defineApplianceItemModel("electronics", "screenpanel", {
    scaleBasis: [2.2, 1.25, 0.08],
    preserveOrigin: true
  }),
  smartspeaker: defineApplianceItemModel("electronics", "smartspeaker", {
    scaleBasis: [0.12, 0.18, 0.12],
    preserveOrigin: true
  }),
  router: defineApplianceItemModel("electronics", "router", {
    scaleBasis: [0.22, 0.15, 0.16],
    preserveOrigin: true
  }),
  printer: defineApplianceItemModel("electronics", "printer", {
    scaleBasis: [0.4, 0.3, 0.35],
    preserveOrigin: true
  }),
  ceilingfan: defineApplianceItemModel("appliance", "ceilingfan", {
    scaleBasis: [1.1, 0.4, 1.1],
    preserveOrigin: true
  }),
  heater: defineApplianceItemModel("appliance", "heater", {
    scaleBasis: [0.6, 0.55, 0.25],
    preserveOrigin: true
  }),
  ceilingac: defineApplianceItemModel("appliance", "ceilingac", {
    scaleBasis: [0.9, 0.3, 0.9],
    preserveOrigin: true
  }),
  vacuumcleaner: defineApplianceItemModel("appliance", "vacuumcleaner", {
    scaleBasis: [0.28, 1.15, 0.3],
    preserveOrigin: true
  }),
  floorwasher: defineApplianceItemModel("appliance", "floorwasher", {
    scaleBasis: [0.3, 1.1, 0.3],
    preserveOrigin: true
  }),
  dryingrack: defineApplianceItemModel("appliance", "dryingrack", {
    scaleBasis: [1.8, 0.5, 0.35],
    preserveOrigin: true
  }),
  garmentcare: defineApplianceItemModel("appliance", "garmentcare", {
    scaleBasis: [0.6, 1.85, 0.6],
    preserveOrigin: true
  }),
  airer: defineApplianceItemModel("appliance", "airer", {
    scaleBasis: [1.2, 0.3, 0.3],
    preserveOrigin: true
  }),
  integratedstove: defineApplianceItemModel("appliance", "integratedstove", {
    scaleBasis: [0.9, 1.35, 0.6],
    preserveOrigin: true
  }),
  sterilizer: defineApplianceItemModel("appliance", "sterilizer", {
    scaleBasis: [0.6, 0.65, 0.5],
    preserveOrigin: true
  }),
  oven: defineApplianceItemModel("appliance", "oven", {
    scaleBasis: [0.6, 0.6, 0.55],
    preserveOrigin: true
  }),
  coffeemaker: defineApplianceItemModel("appliance", "coffeemaker", {
    scaleBasis: [0.28, 0.38, 0.35],
    preserveOrigin: true
  }),
  kettle: defineApplianceItemModel("appliance", "kettle", {
    scaleBasis: [0.2, 0.26, 0.2],
    preserveOrigin: true
  }),
  airfryer: defineApplianceItemModel("appliance", "airfryer", {
    scaleBasis: [0.3, 0.34, 0.34],
    preserveOrigin: true
  }),
  blender: defineApplianceItemModel("appliance", "blender", {
    scaleBasis: [0.22, 0.45, 0.24],
    preserveOrigin: true
  }),
  waterpurifier: defineApplianceItemModel("appliance", "waterpurifier", {
    scaleBasis: [0.3, 1.2, 0.3],
    preserveOrigin: true
  }),
  trashbin: defineApplianceItemModel("appliance", "trashbin", {
    scaleBasis: [0.28, 0.45, 0.28],
    preserveOrigin: true
  }),
});
const FURNITURE_PALETTE_ITEM_TYPES = new Set([
  "sofa",
  "coffeetable",
  "squarecoffeetable",
  // 钢琴：2026-09 迁进流水线之后加进来。它在 CUSTOM_MATERIAL_ITEM_TYPES 里早就有，
  // 但那张表只决定「要不要换材质」；落到哪一支要看这里 —— 不加的后果不是没颜色，而是
  // 掉进最末尾那条亮度分档兜底（按琴身亮度取色 + 0.46 自发光），整件会发灰发光。
  "piano",
  "tvstand",
  "rug",
  "plant",
  "bed",
  "nightstand",
  "vanity",
  "desk",
  "bookcase",
  "aquarium",
  "table",
  "rounddiningtable",
  "chair",
  "bar",
  "sideboard",
  "shoecabinet",
  "cabinet",
  "glasscabinet",
  "shelf",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "basin",
  "toilet",
  "squattoilet",
  "urinal",
  "shower",
  "bathtub",
  "glasspartition",
  "stairs",
  // 悬空楼梯与直行 stairs 同族（建筑本体、木质踏面），调色板归属也照它走：进 FURNITURE_PALETTE
  // 但被下面 HOME_PALETTE 的过滤排除，颜色表达的是房子本身而不是家居风格。
  "floatingstairs",
  "pillar",
  "curtain_left",
  "curtain_right",
  "curtain_split",
  "rounddiningtable_turntable",
  "tv_standard",
  "tv_tabletop",
  "tv_mobile",
  "wallac",
  "floorac",
  "airpurifier",
  "robotvacuum",
  "floorlamp",
  "walllamp",
  "fridge",
  "rangehood",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "washer",
  "dryer",
  "storagewaterheater",
  "gaswaterheater",
  "desktop",
  "laptop",
  "nas",
  "armchair",
  "loungechair",
  "ottoman",
  "bench",
  "barstool",
  "sidetable",
  "console",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "bunkbed",
  "kidsbed",
  "chaise",
  "nestingtable",
  "roundcoffeetable",
  "screenspan",
  "coatrail",
  "stool",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "daybed",
  "cot",
  "computertable",
  "officestool",
  "filecabinet",
  "booktower",
]);
/**
 * 「家居」类型的调色板门槛：与 FURNITURE_PALETTE_ITEM_TYPES 同源，去掉建筑本体
 * stairs / floatingstairs / pillar —— 它们虽然也有自己的木色分支，但颜色表达的是房子本身，
 * 默认风格下不该跟着家居一起变暖。
 * 家居换色分支统一改认这个集合 + palette.warmFurniture，场景与建筑本体仍看 palette.warmWood。
 */
const HOME_PALETTE_ITEM_TYPES = new Set(
  [...FURNITURE_PALETTE_ITEM_TYPES].filter(
    furnitureItemType =>
      furnitureItemType !== "stairs" &&
      furnitureItemType !== "floatingstairs" &&
      furnitureItemType !== "pillar"
  )
);
const LUMINANCE_BANDED_ITEM_TYPES = new Set([
  "bed",
  "nightstand",
  "vanity",
  "desk",
  "bookcase",
  "table",
  "rounddiningtable",
  "chair",
  "bar",
  "sideboard",
  "shoecabinet",
  "cabinet",
  "glasscabinet",
  "shelf",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "console",
  "sidetable",
  "bench",
  "armchair",
  "loungechair",
  "ottoman",
  "bench",
  "barstool",
  "sidetable",
  "console",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "bunkbed",
  "kidsbed",
  "chaise",
  "nestingtable",
  "roundcoffeetable",
  "screenspan",
  "coatrail",
  "stool",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "daybed",
  "cot",
  "computertable",
  "officestool",
  "filecabinet",
  "booktower",
]);
/** 家具五金的统一取色：**深色金属**，见 applyFurniturePalette 里那条按角色的五金分支。 */
const FURNITURE_HARDWARE_TONE = 5462356;
/**
 * 「调色板路径」上每个材质角色的**出口登记表**（默认档位「跟随全局风格」走的就是这条路径）。
 *
 * 为什么要有这张表：这条路径的末尾有一条「按烘焙亮度分三档」的兜底，它是给**整件同一种主料**
 * 的家具准备的（柜体 / 门 / 台面 / 层板…全是木作）。内容物与五金落进那条兜底会被刷成主料色 ——
 * 书柜里的书与柜体同色、鞋柜敞开格里的鞋读成一堆木方块、梳妆台的镜面是一块木头。这三件事
 * `joineryCombo`（studio-material-styles.js）里那批「不跟木色走」的配方各自挡过一次，但那只在
 * **手动选了材质档位**时才生效 —— 默认档位下没有任何东西管它们，而默认档位恰恰是绝大多数
 * 场景里那一种。
 *
 * 三份名单互不重叠，合起来要盖住规格里出现过的**全部**角色；漏掉一个，那个角色就会静默落进
 * 亮度兜底（它的后果是「颜色有点怪」而不是报错，见 tools/check_invariants.mjs 第 23 条）。
 */
// 1. 本来就是主料：跟着调色板三档走（这是「整件同一块木料」那条既有取舍，不动）。
const CARCASS_MATERIAL_ROLE_SET = new Set([
  "body",
  "door",
  "top",
  "base",
  "shelf",
  "interior",
  "panel",
  "trim",
  "drawer",
  "leg",
  "frame"
]);
// 2. 内容物 / 撞色陈设件 / 镜面：取规格里烘焙的原色（槽位色就是「未套用风格时的底色」），
//    值只写**需要覆盖的质感**，空配方表示颜色与质感都照规格。
//    值刻意写成裸标识符而不是内联对象字面量：tools/check_invariants.mjs 第 23 条是按字符扫
//    这一层的键，值里嵌一对花括号会让它把后面的键整片漏读（同一个坑 joineryCombo 上也踩过）。
const AUTHORED_COLOR_ONLY_RECIPE = Object.freeze({});
// 镜面是镀银的：跟着木作那套 0.72 粗糙度会读成一块亚光塑料，所以质感要覆盖。
const MIRROR_MATERIAL_RECIPE = Object.freeze({ roughness: 0.08, metalness: 0.35 });
const AUTHORED_COLOR_MATERIAL_ROLE_RECIPES = Object.freeze({
  book: AUTHORED_COLOR_ONLY_RECIPE,
  stash: AUTHORED_COLOR_ONLY_RECIPE,
  accent: AUTHORED_COLOR_ONLY_RECIPE,
  mirror: MIRROR_MATERIAL_RECIPE
});
// 3. 另有专管，默认档位下不经过亮度兜底：五金（下面那条按角色的五金分支）、玻璃（透明分支）、
//    布艺（床 / 沙发 / 椅 / 地毯 / 窗帘的类型分支）、琴键与绿植（钢琴 / 绿植分支）、
//    厨房水槽与灶面（暖木作块）、屏面 / 格栅 / 指示灯（家电角色档表 —— 家电根本不走这条路径）。
const NON_CARCASS_MATERIAL_ROLE_SET = new Set([
  "metal",
  "handle",
  "glass",
  "upholstery",
  "cushion",
  "fabric",
  "key",
  "pot",
  "foliage",
  "sink",
  "cooktop",
  "screen",
  "grating",
  "lit"
]);
const APPLIANCE_PALETTE_ITEM_TYPES = new Set([
  "tv_standard",
  "tv_tabletop",
  "tv_mobile",
  "wallac",
  "floorac",
  "airpurifier",
  "robotvacuum",
  "floorlamp",
  "walllamp",
  "fridge",
  "rangehood",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "washer",
  "dryer",
  "storagewaterheater",
  "gaswaterheater",
  "desktop",
  "laptop",
  "nas",
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "airoutlet",
  "soundbar",
  "speaker",
  "projector",
  "fan",
  "humidifier",
  "dehumidifier",
  "freshair",
  "thermostat",
  "smartpanel",
  "smartlock",
  "doorbell",
  "gateway",
  "gameconsole",
  "avreceiver",
  "screenpanel",
  "smartspeaker",
  "router",
  "printer",
  "ceilingfan",
  "heater",
  "ceilingac",
  "vacuumcleaner",
  "floorwasher",
  "dryingrack",
  "garmentcare",
  "airer",
  "integratedstove",
  "sterilizer",
  "oven",
  "coffeemaker",
  "kettle",
  "airfryer",
  "blender",
  "waterpurifier",
  "trashbin",
]);
/**
 * 电视三件共用的「一身深色」角色档（屏面另有专门的贴图通道，不走这里）。
 */
const TV_ROLE_TONES = Object.freeze({
  body: "dark",
  trim: "dark",
  metal: "dark",
  leg: "dark",
  base: "dark"
});
/**
 * 电子设备与灯具里**按材质角色逐件取色**的表：键是物件类型，值是「角色 → 取哪一档色」。
 * 档位名对应 applyAppliancePalette 里的四个色（appliance 亮档 / soft 柔光档 / dark 暗档 /
 * accent 强调色），角色名是建模时写死的部件语义（body 机身 / screen 屏面 / trim 镶边 /
 * grating 格栅与键面 / metal 五金 / lit 透光与指示灯 / drawer 盘位）。
 *
 * 为什么要有这张表：这几件原先靠**槽位号**认部件（`applianceMaterialIndex === "1"` 那种写法）。
 * 槽位号会随重建漂移 —— 显示器重建后 1 号从「屏框」变成了「支架」，于是「屏面被刷成银色」
 * 这类错配在画面上只表现为「颜色有点怪」，很难归因。角色名重排槽位不会变。
 *
 * 未列出的家电（银黑厨电那一大片）不走这张表，仍按原材质亮度分三档，理由见函数末尾的注释。
 */
const APPLIANCE_ROLE_TONE_BY_ITEM_TYPE = Object.freeze({
  // 显示器：机身 / 底座 / 键面走柔光银，支架压深。屏面由「screen 统一压暗」那条处理。
  desktop: Object.freeze({ base: "soft", body: "soft", grating: "soft", metal: "dark" }),
  // 笔记本：机身与转轴银，触控板与键面压深（屏面同样交给 screen 那条）。
  laptop: Object.freeze({ body: "soft", metal: "soft", trim: "dark", grating: "dark" }),
  // 网络存储器：箱体与盘位柔光银，屏面压暗；状态灯（lit）刻意不列 —— 见函数里「lit 保留原色」那条，
  // 它要的是原来的绿色 LED，写进表里反而会被刷成银的。
  nas: Object.freeze({ body: "soft", drawer: "soft" }),
  // 电视三件：整件一族深色（屏面另有专门的贴图通道，不走这里）。显式列出来是为了让
  // 「电视就是一身黑」写在表上，而不是靠 `startsWith("tv_")` 这种字符串巧合。
  tv_standard: TV_ROLE_TONES,
  tv_tabletop: TV_ROLE_TONES,
  tv_mobile: TV_ROLE_TONES
});
const CUSTOM_MATERIAL_ITEM_TYPES = new Set([
  "sofa",
  "coffeetable",
  "squarecoffeetable",
  "tvstand",
  "rug",
  "plant",
  "bed",
  "nightstand",
  "vanity",
  "desk",
  "bookcase",
  // 桌案第三批（餐桌组合 / 圆餐桌 / 圆餐桌带转盘 / 吧台）与厨房地柜三件：迁进流水线后
  // 材质名带角色，必须走进 applyAppliancePalette 才能命中「按角色的配方」。
  "table",
  "rounddiningtable",
  "rounddiningtable_turntable",
  "bar",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "elevator",
  "steelstairs",
  "glassstairs",
  // 小车：2026-09 按流水线规格重建后加进来。它的车漆 / 轮毂 / 轮胎 / 灯 / 格栅要按**角色**
  // 取料（见 applyAppliancePalette 的 smallcar 分支），不进这一支的话整件只会保持 GLB 自带的
  // 灰白，换主题时全屋只有车不变色 —— 与柱族当初漏掉时是同一个病。
  "smallcar",
  "piano",
  // 柱族五件：材质要跟着**墙色**走（见 applyAppliancePalette 的柱分支）。它们原先不进
  // 这一支，于是 GLB 一直用自带的灰白 —— 换墙色时整间屋子只有柱子不变色，而占位几何
  // 是用墙材质画的，模型加载前后本来就是两种颜色。
  ...PILLAR_MODEL_ITEM_TYPES,
  "armchair",
  "loungechair",
  "ottoman",
  "bench",
  "barstool",
  "sidetable",
  "console",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "bunkbed",
  "kidsbed",
  "chaise",
  "nestingtable",
  "roundcoffeetable",
  "screenspan",
  "coatrail",
  "stool",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "daybed",
  "cot",
  "computertable",
  "officestool",
  "filecabinet",
  "booktower",
]);
/**
 * 「暖阳原木」主题下餐桌 / 餐椅的材质语义：键是家具类型，值是**按材质角色**给出的语义
 * （wood / linen / sage / ceramic）。
 *
 * 餐桌是一进门的视觉中心，只有木色 + 亚麻才像一套成品的原木餐桌，所以按角色逐一指定，
 * 而不是沿用家具调色板的三档灰。
 *
 * 为什么按角色而不是槽位号：餐桌组合 / 圆餐桌两件（含带转盘）与餐椅都已迁到流水线，
 * 材质名是 `material-<槽位>-<角色>`。旧表按 `material-N` 的下标排语义，一旦某件重排一次
 * 槽位（重建时就重排过：新餐桌的 2 号是**桌腿**、旧资产的 2 号是椅垫），整张表就静默指错部件
 * ——「亚麻色刷到桌腿上」这种错在画面上看着只是「颜色有点怪」，很难归因。
 * 角色名是建模时就写死的意图（top / trim / leg / cushion），重排槽位不会动它。
 *
 * 顺带说明为什么带转盘那一件也在这里逐条列出：它与圆餐桌共用同一套骨架（同一个函数生成），
 * 角色完全一样，只是多了转盘面（`top` 角色）与中轴盖（`metal`，无木色语义、留给下面的兜底分支）。
 */
const WARM_DINING_MATERIAL_ROLE_TABLE = Object.freeze({
  table: Object.freeze({ top: "wood", trim: "wood", leg: "wood", cushion: "linen" }),
  rounddiningtable: Object.freeze({
    top: "wood",
    base: "wood",
    body: "wood",
    trim: "wood",
    leg: "wood",
    cushion: "linen"
  }),
  rounddiningtable_turntable: Object.freeze({
    top: "wood",
    base: "wood",
    body: "wood",
    trim: "wood",
    leg: "wood",
    cushion: "linen"
  }),
  // 单张餐椅的坐垫取鼠尾草绿：这与旧表的意图一致 —— 旧表给餐桌的亚麻色是给**烘进餐桌模型里
  // 那六把椅子**的（旧资产把椅子并进了餐桌 GLB），而独立放置的餐椅是另一件商品，坐垫另有一色。
  chair: Object.freeze({ leg: "wood", frame: "wood", upholstery: "sage" })
});
/**
 * 上面那张角色表的**老资产回落**：还没有迁进流水线的餐桌 / 餐椅（没有角色后缀）按槽位号取语义。
 * 表里只剩没角色的类型；一旦某件迁进流水线，就把它的条目从这里删掉，改到角色表里写。
 */
const WARM_DINING_MATERIAL_TABLE = Object.freeze({});
/**
 * 「石材板」所在的材质槽位与**默认色号**：键是模型类型，值是「槽位下标 → 色号」。
 *
 * 石材板 = 整块石材（自带颜色的整图，见 studio-surface-textures.js 的 createStoneSlabTexture），
 * 与「细节层」不是一回事：细节层是均值≈1 的中性灰图，只能压暗不能提亮，所以黑底白纹的石材
 * 在那条路上做不出来。这几件模型的关键面（茶几的两块石板、餐桌台面）要的正是整块石材。
 *
 * 色号是**默认值**，档位（material styles）可以在角色配方里用 `slab` 覆盖；
 * 自动档（未选风格）就按这里的默认走，于是「实物照片长什么样」直接烘焙在这张表里。
 *
 * 槽位号允许带角色后缀（`material-0-top`）。
 */
const STONE_SLAB_FLAVOR_BY_MODEL_SLOT = Object.freeze({
  table: Object.freeze({ 0: "marble" }),
  // 组合茶几：上白石、下黑石 —— 与实物照片一致（白石板压在黑石座上）。
  coffeetable: Object.freeze({ 0: "marble", 1: "marble-dark" }),
  rounddiningtable: Object.freeze({ 0: "marble" }),
  rounddiningtable_turntable: Object.freeze({ 0: "marble", 3: "marble", 4: "marble" }),
  desk: Object.freeze({ 1: "marble" })
});
/**
 * 抛光石材的默认表面参数：整图自带颜色，这里只给光泽。粗糙度刻意压得很低 ——
 * 抛光大理石的高光正是它区别于哑光岩板的地方。几何命中后调用方可以在配方里覆盖。
 */
const STONE_SLAB_FINISH_BY_FLAVOR = Object.freeze({
  marble: Object.freeze({ roughness: 0.24, metalness: 0.03 }),
  "marble-dark": Object.freeze({ roughness: 0.18, metalness: 0.04 })
});
/**
 * 某个模型是否有关键部件要走石材板。装载期（补 UV）与材质替换期（换材质）都先问这里，
 * 免得「补 UV 的类型」与「换材质的类型」两张表各写一份而慢慢对不上。
 */
function hasStoneSlab(modelType) {
  return STONE_SLAB_FLAVOR_BY_MODEL_SLOT[modelType] !== undefined;
}
/**
 * 取某一块网格的石材规格；不是石材板则返回 null。装载期补 UV 与材质替换期换材质必须走同一判据：
 * 两边一旦不一致，石板就会拿到一份没补 UV 的几何，整块采样到 (0,0) 变成一坨。
 *
 * 判定顺序是「档位配方 → 表里默认」：
 *   - 配方里给了 `slab` → 用配方那个色号（可选 color 当染色、roughness / metalness 覆盖光泽）；
 *   - 配方里没给 `slab`（例如「米黄洞石」那一档改用细节层走石纹）→ **明确按非石材板处理**，
 *     不再回落到默认 —— 否则档位永远压不住默认值，等于选了没反应；
 *   - 没有配方（自动档 / 既有资产）→ 用表里烘焙的默认色号。
 */
function stoneSlabSpecFor(materialPalette, modelType, materialName) {
  const slotFlavors = STONE_SLAB_FLAVOR_BY_MODEL_SLOT[modelType];
  if (!slotFlavors) {
    return null;
  }
  const { slot, role } = parseMaterialSlotAndRole(materialName);
  const recipe = role ? materialPalette?.materialRoles?.[role] : null;
  if (recipe) {
    if (!recipe.slab) {
      return null;
    }
    return {
      flavor: recipe.slab,
      tint: recipe.color,
      roughness: recipe.roughness,
      metalness: recipe.metalness
    };
  }
  const defaultFlavor = slot === undefined ? undefined : slotFlavors[Number(slot)];
  return defaultFlavor ? { flavor: defaultFlavor } : null;
}
/**
 * 各柜类「门板 / 抽屉面板」的判据：`material-<槽位>-door` 就是门板。
 *
 * 门板在建模时就是独立材质 —— 它是一层贴在正面的薄板（厚 1~3cm、位于模型 +z 最外沿），
 * 与柜体那只大箱体分开，所以只换门板的色就能得到「木柜体 + 白门」，不必动柜体。
 *
 * 判据只写这一处：门板刷白（applyFurniturePalette）与门板回边压暗（resolveSharedMaterial）
 * 都调它，各写一份就会慢慢对不上。
 *
 * 依旧刻意不在判据里的类型：
 *   - cabinet（衣柜）是一整块木色箱体、没有独立门板几何，走 resolveSharedMaterial 里的正面着色器；
 *   - shelf（货架）是敞开层架，本来就没有门。
 *
 * 鞋柜原先还有一条「按 4 号槽位认门」的回落（它是既有资产、材质名没有角色后缀）；2026-09 迁进
 * 流水线后它的门板就是 `material-4-door`，回落分支与那张 LEGACY_SHOECABINET_SLOT 表一并删除 ——
 * 判据从此只剩角色一条，`modelType` 参数（三处调用点仍在传）已不再参与判断，留着是为了不改调用点。
 */
function isCabinetDoorMaterial(modelType, materialName) {
  return parseMaterialSlotAndRole(materialName).role === "door";
}
/**
 * 「暖阳原木」主题下的台面判据：`material-<槽位>-top` 就是台面。
 *
 * 台面要单独压平粗糙度并换成石材色（countertop），否则会和柜门一起被染成木色、
 * 整件柜子看上去像一整块木头。
 *
 * 迁进流水线的柜类一律带 `top` 角色，判据只剩角色这一条。鞋柜是最后一个补上角色的
 * （原先要靠一张槽位号表回落它的 2 号槽位），补完之后这个函数不再认识任何槽位号 ——
 * `modelType` 参数只剩调用点还在传，判断里已用不到。
 */
function isWarmCountertopMaterial(modelType, materialName) {
  return parseMaterialSlotAndRole(materialName).role === "top";
}
/**
 * 从材质名里取出「槽位号 + 角色」。
 *
 * 角色由建模流水线按 tools/models/model-roles.mjs 的词表写进材质名（`material-<槽位>-<角色>`，
 * 例如 `material-0-body` / `material-1-door`）；没有角色的既有资产取到 undefined，
 * 于是它们继续走下面的亮度分档逻辑，完全不受影响。
 *
 * 注意 `material-3-soft` / `material-2-dark` 这类既有写法同样会被这个正则匹配到后缀，
 * 所以**后缀算不算角色，由「该档位有没有为它给出配方」决定**（见 materialRoleRecipe）——
 * 前端因此不必再同步一份角色词表，也不会把亮度分档误当成角色。
 */
function parseMaterialSlotAndRole(materialName) {
  const matched = String(materialName || "")
    .toLowerCase()
    .match(/material-(\d+)(?:-([a-z][a-z0-9]*))?$/);
  return { slot: matched?.[1], role: matched?.[2] };
}
/**
 * 「档位即组合」：取某块网格**自己那个角色**的配方。
 *
 * 只有调色板里带 materialRoles（即该物件选了风格、且该风格按角色给了组合）时才可能命中；
 * 命中后这一块网格的颜色与质感全部由角色配方决定 —— 这正是「同一个衣柜里柜体是胡桃木、
 * 柜面是哑光白」成立的地方，也是「整件一个颜色」的替代方案。
 */
function materialRoleRecipe(materialPalette, materialName) {
  const roles = materialPalette?.materialRoles;
  if (!roles) {
    return null;
  }
  const { role } = parseMaterialSlotAndRole(materialName);
  return (role && roles[role]) || null;
}
/**
 * 创建外部模型管理器：负责按需加载、并发排队、材质复用与实例落地。
 * 依赖注入的用意：THREE 必须用主模块命名空间（否则出现两份 three），loader 必须是已挂 DRACO 解码器的 GLTFLoader；isModelInUse 与 requestRender 让管理器在装载完成 / 失败时主动触发一次重绘，无需轮询。
 * @param {number} [managerOptions.maxConcurrentLoads] 并发加载上限（默认 2，解压占 Worker 与带宽）。@param {number} [managerOptions.loadTimeoutMs] 单次加载超时（默认 12s，弱网下 1MB 级模型的容忍上限）。
 * @param {object} [managerOptions.persistentCache] 模型模板持久缓存（默认自建；测试可注入替身）。
 */
export function createExternalModelManager({
  THREE: THREE,
  loader: loader,
  stairItemTypes: stairItemTypes,
  isModelInUse: isModelInUse,
  requestRender: requestRender,
  onLoadStateChange: onLoadStateChange = () => {},
  maxConcurrentLoads: maxConcurrentLoads = 2,
  loadTimeoutMs: loadTimeoutMs = 12000,
  deferralHost: deferralHost = null,
  persistentCache: persistentCache = createModelPersistentCache({
    THREE: THREE
  })
}) {
  // 五个缓存各司其职：已加载（类型 → {source, size}）、GLTF 在飞（类型 → Promise，
  // 用来合并同一类型的并发请求）、持久缓存在飞（类型 → Promise，避免同一类型读两遍 IndexedDB）、
  // 待加载队列、以及「字段完全等价的材质」缓存 ——
  // 最后这个把大量外观相同的部件收敛成同一份材质，直接减少 GPU program 数量。
  const loadedModelByType = new Map();
  const pendingLoadByType = new Map();
  const preparedRestoreByType = new Map();
  const loadQueue = [];
  const materialCacheByKey = new Map();
  // 并发至少为 1（否则队列永远不会被泵动），超时至少 50ms（防止误传 0 时每次加载
  // 都立刻超时失败）；finite() 负责把 NaN / undefined 换成默认值。
  const concurrencyLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2)));
  const effectiveTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  // 持久缓存最多等这么久（毫秒）：命中就省掉一次下载 + 解析，读不出来也必须立刻转回真实加载器 ——
  // 缓存是加分项，不能让首屏为了它多等。取 160ms 是因为 IndexedDB 的本地读通常在 10ms 量级，
  // 超过这个数多半说明库被占住或磁盘忙，再等下去只会拖慢首屏。
  const preparedRestoreTimeoutMs = 160;
  let activeLoadCount = 0;
  let materialReuseCount = 0;
  /**
   * 汇总当前的加载与材质缓存状态（供「正在载入模型」提示与导出前的等待使用）。
   */
  function getModelLoadState() {
    return {
      active: activeLoadCount,
      queued: loadQueue.length,
      limit: concurrencyLimit,
      timeoutMs: effectiveTimeoutMs,
      materials: materialCacheByKey.size,
      materialReuses: materialReuseCount
    };
  }
  /**
   * 把最新状态推给注入的回调（默认是个空函数，调用方可以完全不关心）。
   */
  function emitLoadStateChange() {
    onLoadStateChange(getModelLoadState());
  }
  /**
   * 按并发上限启动排队中的加载任务。
   * 每启动一个就把状态推出去让加载计数及时更新；任务收尾（无论成败）都在 finally 里递减计数并递归再泵一次， 所以队列不会因某次失败卡死。用 Promise.resolve().then(...) 而非直接调用，是为了让任务在本轮同步代码结束后
   * 才开始执行，避免递归泵把调用栈越堆越深。
   */
  function pumpLoadQueue() {
    while (activeLoadCount < concurrencyLimit && loadQueue.length) {
      const queuedTask = loadQueue.shift();
      activeLoadCount += 1;
      emitLoadStateChange();
      Promise.resolve()
        .then(queuedTask.run)
        .then(queuedTask.resolve, queuedTask.reject)
        .finally(() => {
          activeLoadCount -= 1;
          pumpLoadQueue();
          emitLoadStateChange();
        });
    }
  }
  /**
   * 把加载动作排进队列并返回它的 Promise。
   * 入队后立刻尝试泵一次队列：若当前并发未满，调用方拿到的 Promise 会在本轮事件循环内就开始执行，不必等下一次状态变化或用户操作。
   */
  function enqueueLoadTask(runLoad) {
    return new Promise((resolveTask, rejectTask) => {
      loadQueue.push({
        run: runLoad,
        resolve: resolveTask,
        reject: rejectTask
      });
      emitLoadStateChange();
      pumpLoadQueue();
    });
  }
  /**
   * 按「主资源 → 回退资源」的顺序加载一个模型，并给每次加载加上超时。
   * 两层兜底：Promise.race + 计时器保证弱网下不会永久挂住（超时文案带模型类型，便于定位哪张资源慢）；主资源 (-lite) 失败时静默回退完整版，因为轻量版是构建产物，缺失或损坏不该让家具整个消失。不做自动重试：失败
   * 通常是资源缺失或格式问题，重试只会拖慢队列。finally 里清掉计时器，否则超时后即便加载成功也会留下定时器。
   *
   * 持久缓存先行：命中就干脆不碰网络，直接返回 `{preparedTemplate}`（形状与 `{scene}` 分支不同，
   * 由 loadExternalModel 分辨）。`skipPersistentRestore` 供调用方在「已经自己读过一遍、确定未命中」
   * 时跳过这次重复读（IndexedDB 的读也要排队，同一类型读两遍纯属浪费）。返回的 GLTF 结果上会挂
   * `preparedCacheKey`：装载完成后的写入用的是**同一个键**，键只算一次，避免两处各算一份、悄悄错开。
   * @throws 两个地址都失败或定义里没有可用资源时抛出（中文文案）。
   */
  async function loadModelWithFallback(modelDefinition, modelTypeLabel, { skipPersistentRestore = false } = {}) {
    const preparedCacheKey = modelTemplateKey(THREE, modelTypeLabel, modelDefinition);
    if (!skipPersistentRestore) {
      const cachedTemplate = await persistentCache.restore(preparedCacheKey);
      if (cachedTemplate) {
        return { preparedTemplate: cachedTemplate };
      }
    }
    let timeoutId = null;
    // 发起一次带超时的加载：与 loadAsync 赛跑的计时器写入外层的 timeoutId 变量，
    // 让 loadModelWithFallback 的 finally 能统一清除（闭包共享同一个变量，只留一个定时器）。
    // 超时错误带上模型类型，便于定位是哪种家具的资源慢。
    const loadFromUrl = resourceUrl =>
      Promise.race([
        loader.loadAsync(resourceUrl),
        new Promise((resolveTimeout, rejectTimeout) => {
          timeoutId = setTimeout(
            () => rejectTimeout(new Error("模型 " + modelTypeLabel + " 加载超时")),
            effectiveTimeoutMs
          );
        })
      ]).finally(() => clearTimeout(timeoutId));
    if (!modelDefinition?.url) {
      throw new Error("模型 " + modelTypeLabel + " 没有可用资源");
    }
    // 只在这里展开一次结果对象（GLTF 结果是普通对象字面量），把键带出去给写入方用。
    return loadFromUrl(modelDefinition.url)
      .catch(loadError => {
        if (!modelDefinition.fallbackUrl) {
          throw loadError;
        }
        return loadFromUrl(modelDefinition.fallbackUrl);
      })
      .then(gltfResult => ({ ...gltfResult, preparedCacheKey: preparedCacheKey }));
  }
  /**
   * 把场景物件映射成具体的模型类型键。
   * 带子状态的类型（窗帘、柱子、圆桌转盘、电视安装方式）会拼出后缀。
   * 对未知取值一律回落到一个确定的默认项（split / pillar / standard），保证任何脏数据都能查到模型，而不是静默丢件（丢件在满屏家具里很难被用户描述清楚）。
   */
  function modelTypeForItem(item) {
    if (item.type === "curtain") {
      return (
        "curtain_" +
        (["left", "right", "split"].includes(item.curtainPosition) ? item.curtainPosition : "split")
      );
    } else if (item.type === "pillar") {
      return PILLAR_ASSET_SHAPES.has(item.pillarShape) ? "pillar_" + item.pillarShape : "pillar";
    } else if (
      item.type === "rounddiningtable" &&
      (item.roundTableTurntable === true || item.type === "rounddiningtableturntable")
    ) {
      return "rounddiningtable_turntable";
    } else if (item.type === "tv") {
      return (
        "tv_" +
        (["standard", "tabletop", "mobile"].includes(item.tvMountStyle)
          ? item.tvMountStyle
          : "standard")
      );
    } else {
      return item.type;
    }
  }
  /**
   * 加载（或复用）指定类型的模型，包含延迟放行、请求去重、持久缓存命中与按类型的几何修订。
   * 延迟加载声明生效且非用户主动要模型时只登记需求并同步返回 null，让本次先用过程几何顶上；已加载直接返回 缓存，正在加载则复用同一个 Promise；解析成功后按类型做几何修订（玻璃柜背板、吊柜侧板、车漆法线、床底内缩，
   * 车漆按源几何缓存并 dispose 旧几何以免泄漏），只缓存 scene 与实测尺寸；失败时记日志并返回 null（不抛错），调用方继续用过程几何 —— 这是降级而非中断。
   *
   * 持久缓存与真实加载是**赛跑**关系（见 pendingRestore）：命中就完全跳过网络，未命中或读得太慢
   * 就走原来的管线，两条路的产物形状完全相同（都是 `{source, size}`），上层分辨不出差别。
   */
  function loadExternalModel(modelType) {
    if (deferralHost?.isDeferred() && !deferralHost.isReleasing()) {
      // 首屏延后加载：只登记需求并立刻返回 null，让调用方本次先用过程几何渲染。
      // isReleasing() 为真表示这是用户主动要模型（例如切到该楼层），此时必须放行，
      // 不能继续延后 —— 否则那个楼层永远等不到自己的模型。
      deferralHost.defer(modelType);
      return Promise.resolve(null);
    }
    if (loadedModelByType.has(modelType)) {
      return Promise.resolve(loadedModelByType.get(modelType));
    }
    if (pendingLoadByType.has(modelType)) {
      return pendingLoadByType.get(modelType);
    }
    const definition = ALL_ITEM_MODELS[modelType];
    if (!definition) {
      return Promise.resolve(null);
    }
    // 持久缓存键：类型 + 定义（URL / 尺寸 / 覆盖项）+ 编解码版本 + three 版本
    // （见 model-template-codec.js 的 modelTemplateKey）。同一类型并发请求共用同一次读取。
    const preparedCacheKey = modelTemplateKey(THREE, modelType, definition);
    let pendingRestore = preparedRestoreByType.get(modelType);
    if (!pendingRestore) {
      pendingRestore = Promise.resolve()
        .then(() => persistentCache.restore(preparedCacheKey))
        .catch(() => null);
      preparedRestoreByType.set(modelType, pendingRestore);
      // 「在飞」只活到读完为止：结果本身由每次调用的 preparedPromise 各自处理，这里只负责合并并发读。
      pendingRestore.then(() => {
        if (preparedRestoreByType.get(modelType) === pendingRestore) {
          preparedRestoreByType.delete(modelType);
        }
      });
    }
    // 等缓存的同时把网络那一路准备好：一旦超时就立刻开跑，让磁盘与网络并行，而不是串行。
    let loaderLoadPromise = null;
    const startLoaderLoad = () => {
      if (!loaderLoadPromise) {
        loaderLoadPromise = enqueueLoadTask(() =>
          loadModelWithFallback(definition, modelType, { skipPersistentRestore: true })
        );
      }
      return loaderLoadPromise;
    };
    const preparedPromise = new Promise((resolvePrepared, rejectPrepared) => {
      let settled = false;
      let restoreTimer = null;
      const fallBackToLoader = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(restoreTimer);
        startLoaderLoad().then(resolvePrepared, rejectPrepared);
      };
      // 缓存是加分项：读得慢就先去加载，不能让它成为新的等待点。
      restoreTimer = setTimeout(fallBackToLoader, preparedRestoreTimeoutMs);
      pendingRestore.then(cachedTemplate => {
        if (settled) {
          return;
        }
        clearTimeout(restoreTimer);
        if (!cachedTemplate) {
          fallBackToLoader();
          return;
        }
        settled = true;
        resolvePrepared({ preparedTemplate: cachedTemplate });
      }, fallBackToLoader);
    });
    const loadPromise = preparedPromise
      .then(loaded => {
        // 命中持久缓存：模板就是上一会话准备好的完整结果（含实测尺寸），直接落进缓存表。
        if (loaded.preparedTemplate) {
          loadedModelByType.set(modelType, loaded.preparedTemplate);
          if (isModelInUse(modelType)) {
            requestRender({
              force: true
            });
          }
          return loaded.preparedTemplate;
        }
        const loadedScene = loaded.scene || loaded.scenes?.[0];
        if (!loadedScene) {
          throw new Error("模型 " + modelType + " 没有可显示的场景");
        }
        // 原先这里有三条「按类型的几何修订」：玻璃柜背板补板、吊柜补侧板 / 顶板、床底座与
        // 床垫共面消闪。它们针对的都是旧资产的已知缺陷，判据则是旧导出脚本的材质名
        // （`glasscabinet-material-0` / `wallcabinet-material-1` / …），而流水线产物一律是
        // `material-<槽位>-<角色>`：判据永不命中、修补静默失效。
        // 更重要的是**新几何本来就带这些件** —— 玻璃柜的背板（interior）、吊柜的双侧板与顶板
        // 都是规格里的独立零件（见 tools/models/model-specs.mjs），床也在规格里把床架与床垫
        // 错开了 2cm。修订模块与这三处调用一并删除（`materials/studio-cabinet-back.js`）。
        if (hasStoneSlab(modelType)) {
          // 石材板要贴整块石材整图，而这些模型要么没有 UV、要么带的是「每面各贴一遍」的立方体 UV：
          // 装载时统一改写成水平面投影（applyStoneSlabPlanarUv），材质侧才谈得上用 map。
          applyStoneSlabPlanarUv(THREE, loadedScene, modelType);
        }
        loadedScene.updateMatrixWorld(true);
        const modelSize = new THREE.Box3().setFromObject(loadedScene).getSize(new THREE.Vector3());
        // 尺寸无效（NaN / 0 / 负值）说明模型是空壳或缩放为 0，按加载失败处理：
        // 放进场景也看不见，却仍会参与阴影与拾取，事后极难排查。
        if (
          ![modelSize.x, modelSize.y, modelSize.z].every(
            dimension => Number.isFinite(dimension) && dimension > 0.001
          )
        ) {
          throw new Error("模型 " + modelType + " 的尺寸无效");
        }
        // 缓存条目刻意只放 scene 与实测尺寸：克隆、材质替换与摆位都留到落地阶段做，
        // 这样同一份 scene 可以被任意多个实例共享。
        const modelCacheEntry = {
          source: loadedScene,
          size: modelSize
        };
        loadedModelByType.set(modelType, modelCacheEntry);
        // 写回持久缓存：下一次打开就不必再下载与解析这份几何。空闲时执行、失败静默，
        // 写不进去只表现为「下次还要重新加载」，不影响本次渲染。
        persistentCache.schedule(loaded.preparedCacheKey, modelCacheEntry);
        if (isModelInUse(modelType)) {
          requestRender({
            force: true
          });
        }
        return modelCacheEntry;
      })
      .catch(loadFailure => {
        // 失败一律降级：记日志并返回 null，调用方继续用原来的（过程）模型。
        globalThis.window?.HABridgeLog?.error(
          loadFailure,
          {
            phase: "studio-model-load"
          },
          "无法载入外部模型 " + modelType + "：" + (loadFailure?.message || loadFailure)
        );
        if (String(loadFailure?.message || loadFailure).includes("加载超时")) {
          // 超时已经由上面的 HABridgeLog 上报（同一句中文文案），控制台这份只在 ?debug=1 时出现。
          debugLog("debug", "外部模型 " + modelType + " 加载超时，继续使用原模型");
        } else {
          debugLog("error", "无法载入外部模型 " + modelType, loadFailure);
        }
        if (isModelInUse(modelType)) {
          requestRender({
            force: true
          });
        }
        return null;
      })
      // 无论成功失败都要摘掉「在飞」记录，否则该类型会永远复用同一个已失败的 Promise。
      .finally(() => pendingLoadByType.delete(modelType));
    pendingLoadByType.set(modelType, loadPromise);
    return loadPromise;
  }
/**
 * 按原材质的亮度把它归入调色板的某个明度档，生成家具用的标准材质。
 * 亮度用 Rec.709 权重（0.2126 / 0.7152 / 0.0722）计算；档位边界 0.1 / 0.42 / 0.72 对应调色板四档（深 / 中 / 柔 / 浅）的观感。最终色是调色板色 × 0.34 再配 emissive 0.46 抬亮，抵消场景色调映射对深色的压暗。
 * 透明度与深度写入沿用原材质，但 transparent 强制 false —— 这条路径只服务不透明家具。
 */
  function createLuminanceBandedMaterial(sourceMaterial, palette) {
    if (!sourceMaterial) {
      return sourceMaterial;
    }
    const baseColor = sourceMaterial.color?.clone?.() || new THREE.Color(16777215);
    const luminance = baseColor.r * 0.2126 + baseColor.g * 0.7152 + baseColor.b * 0.0722;
    const paletteColor =
      luminance < 0.1
        ? palette.furnitureDark
        : luminance < 0.42
          ? palette.furniture
          : luminance < 0.72
            ? palette.furnitureSoft
            : palette.furnitureLight;
    const tintedColor = new THREE.Color(paletteColor).multiplyScalar(0.34);
    const paletteMaterial = new THREE.MeshStandardMaterial({
      color: tintedColor,
      roughness: luminance < 0.1 ? 0.34 : luminance < 0.42 ? 0.52 : 0.58,
      metalness: luminance < 0.1 ? 0.22 : 0.04,
      emissive: paletteColor,
      emissiveIntensity: 0.46,
      side: sourceMaterial.side ?? THREE.FrontSide,
      transparent: false,
      opacity: 1,
      depthWrite: sourceMaterial.depthWrite ?? true,
      depthTest: sourceMaterial.depthTest ?? true,
      toneMapped: true
    });
    paletteMaterial.name = (sourceMaterial.name || "external-model") + " · HomeOS palette";
    return paletteMaterial;
  }
/**
 * 生成家具用的标准材质，并为未显式指定的属性留出可覆盖的默认值。
 * 默认值（粗糙度 0.58、金属度 0.04、不透明）面向室内的木质 / 布艺家具；调用方按需覆盖 roughness / metalness / transparent / polygonOffset 等。depthWrite 与 depthTest 默认沿用模板材质，只有明确要求才改 ——
 * 这两项改错会直接造成遮挡关系错乱（透明件写深度、或丢掉深度测试）；polygonOffset 仅地毯这类贴地薄片会开。
 */
  function createFurnitureMaterial(templateMaterial, colorValue, materialOptions = {}) {
    if (!templateMaterial) {
      return templateMaterial;
    }
    const furnitureMaterial = new THREE.MeshStandardMaterial({
      color: colorValue,
      roughness: materialOptions.roughness ?? 0.58,
      metalness: materialOptions.metalness ?? 0.04,
      flatShading: materialOptions.flatShading ?? false,
      emissive: 0,
      emissiveIntensity: 0,
      side: templateMaterial.side ?? THREE.FrontSide,
      transparent: materialOptions.transparent ?? false,
      opacity: materialOptions.opacity ?? 1,
      depthWrite: materialOptions.depthWrite ?? templateMaterial.depthWrite ?? true,
      depthTest: templateMaterial.depthTest ?? true,
      toneMapped: true
    });
    furnitureMaterial.name =
      (templateMaterial.name || "external-model") + " · HomeOS furniture material";
    furnitureMaterial.polygonOffset = materialOptions.polygonOffset === true;
    furnitureMaterial.polygonOffsetFactor = materialOptions.polygonOffsetFactor ?? 0;
    furnitureMaterial.polygonOffsetUnits = materialOptions.polygonOffsetUnits ?? 0;
    return furnitureMaterial;
  }
  // 大理石台面贴图只在第一次用到时克隆一份并缓存：clone 出独立的一份是为了单独设
  // wrap/repeat（不能改背景墙那张共享贴图的平铺方式），缓存则是为了所有餐桌共用同一份
  // 材质键里的 texture.uuid —— 否则每张桌子都会生成一份等价材质，材质缓存直接失效。
  // 石材板整图按**色号**缓存：一块板上的纹路要跨实例一致（同一件家具摆两份，石材应当一模一样），
  // 但 clone 出来的贴图各自持有 repeat / wrap，所以这里存的是底图、每次 clone 一份再用。
  const stoneSlabTextureByFlavor = new Map();
  /**
   * 生成（或复用）石材板材质：整块石材自带颜色，材质基色取白（配方给了 color 就当作染色），
   * 因此**不需要**再按调色板取色 —— 石头的颜色在贴图里。
   * 板面几何的 UV 已在装载时写成平面投影（applyStoneSlabPlanarUv），可以直接用 map。
   */
  function createStoneSlabMaterial(templateMaterial, slabSpec) {
    const flavor = slabSpec.flavor;
    if (!stoneSlabTextureByFlavor.has(flavor)) {
      const slabTexture = createStoneSlabTexture(THREE, flavor, 8)?.clone?.() ?? null;
      if (slabTexture) {
        slabTexture.wrapS = THREE.RepeatWrapping;
        slabTexture.wrapT = THREE.RepeatWrapping;
        slabTexture.needsUpdate = true;
      }
      stoneSlabTextureByFlavor.set(flavor, slabTexture);
    }
    const stoneFinish = STONE_SLAB_FINISH_BY_FLAVOR[flavor] ?? { roughness: 0.3, metalness: 0.03 };
    const slabMaterial = createFurnitureMaterial(templateMaterial, slabSpec.tint ?? 16777215, {
      roughness: Number.isFinite(slabSpec.roughness) ? slabSpec.roughness : stoneFinish.roughness,
      metalness: Number.isFinite(slabSpec.metalness) ? slabSpec.metalness : stoneFinish.metalness
    });
    const slabTexture = stoneSlabTextureByFlavor.get(flavor);
    if (slabTexture) {
      slabMaterial.map = slabTexture;
    }
    // 打上标记：下游（自发光补偿 / 整件质感层 / 角色配方）见到它一律让路 ——
    // 石材板的外观已经由整图决定，再叠任何一层都会把它改回「一块纯色」。
    slabMaterial.userData.homeosStoneSlab = flavor;
    return slabMaterial;
  }
/**
 * 给家具类材质挑调色板颜色：依据「材质名 + 类型 + 原色亮度」三路信息决定。
 * 材质名编码了部件语义（material-N、-dark / -soft / -light、foliage 等），是与建模流水线约定死的字段，因此 命名是最主要的分支依据，不能凭外观猜；亮度只在没有命名线索时兜底。细节：窗帘 / 桌 / 橱柜按 material-N
 * 下标挑档；地毯的 -soft 面开 polygonOffset 压住 z-fighting；半透明件保持 transparent 并关 depthWrite；暖阳原木下额外按槽位覆盖木色 / 布艺 / 台面 / 玻璃色。
 */
  function applyFurniturePalette(meshMaterial, inputPalette, furnitureItemType) {
    // 暖阳原木：柜类整件走柜体木色而不是基础家具灰，先把 wood 兜到 cabinetWood，
    // 这样下面所有分支读到的都是同一块木料。非暖色主题下 isWarmJoinery 恒为 false，
    // paletteColors 与入参是同一个对象，下游分支的取值完全不变。
    let paletteColors = inputPalette;
    const isWarmJoinery =
      paletteColors.warmFurniture && JOINERY_ITEM_TYPES.has(furnitureItemType);
    if (isWarmJoinery) {
      paletteColors = {
        ...paletteColors,
        wood: paletteColors.cabinetWood ?? paletteColors.wood
      };
    }
    if (paletteColors.warmFurniture) {
      // 暖阳原木：除沙发 / 床 / 椅 / 地毯 / 窗帘这些以布艺为主体的类型外，
      // 「柔光档」整体提到浅色档，否则大面积中灰木色会把暖色背景压暗。
      if (
        !["sofa", "bed", "chair", "rug", "curtain_left", "curtain_right", "curtain_split"].includes(
          furnitureItemType
        )
      ) {
        paletteColors = {
          ...paletteColors,
          furnitureSoft: paletteColors.furnitureLight
        };
      }
      // 暖阳原木：柜类的中 / 柔 / 深三档一起收敛到木色 —— 一件柜子上出现三种明度的
      // 木色会显得像拼接，收敛后整体才像同一块木料。
      if (
        [
          "cabinet",
          "wallcabinet",
          "shoecabinet",
          "sideboard",
          "bookcase",
          "shelf",
          "nightstand",
          "tvstand",
          "kitchenbase",
          "desk",
          "vanity",
          "glasscabinet"
        ].includes(furnitureItemType)
      ) {
        paletteColors = {
          ...paletteColors,
          furniture: paletteColors.wood,
          furnitureSoft: paletteColors.wood,
          furnitureDark: paletteColors.wood
        };
      }
    }
    // 材质名统一转小写后再匹配：建模工具导出的大小写并不稳定。
    const materialName = (meshMaterial?.name || "").toLowerCase();
    // 暖阳原木：淋浴五金换成暖色金属。showerMetal 只在暖色色卡里定义，
    // 因此这个判断本身等价于「暖色主题」；默认主题下会落到下面的常规分支。
    if (furnitureItemType === "shower" && paletteColors.showerMetal !== undefined) {
      return createFurnitureMaterial(meshMaterial, paletteColors.showerMetal, {
        roughness: 0.48,
        metalness: 0.3
      });
    }
    // 石材板：整块石材（茶几的两块石板、餐桌台面）。位置放在木色槽位表**之前** ——
    // 转盘款第 4 号槽位才能从「陶面」改判成石材。
    const stoneSlabSpec = paletteColors.warmFurniture
      ? stoneSlabSpecFor(paletteColors, furnitureItemType, materialName)
      : null;
    if (stoneSlabSpec) {
      return createStoneSlabMaterial(meshMaterial, stoneSlabSpec);
    }
    // 暖阳原木：餐桌 / 餐椅按**角色**换成木色或亚麻，而不是沿用家具三档灰。
    // 命中后直接返回：这类物件的槽位语义已被表完全决定，不需要再走下面的兜底分支。
    // 先查角色表（流水线产物），再回落到槽位表（还没迁进流水线的老资产，见上面两张表的说明）。
    // 两层都要试：角色是从材质名后缀取的，而老资产的后缀（`material-0-dark`）也会被取成一个
    // 「角色」，角色表里当然没有它 —— 只查角色表就会让这些老资产丢掉暖阳处理。
    const { slot: warmDiningSlot, role: warmDiningRole } = parseMaterialSlotAndRole(materialName);
    const warmDiningMaterialKey = paletteColors.warmFurniture
      ? (warmDiningRole && WARM_DINING_MATERIAL_ROLE_TABLE[furnitureItemType]?.[warmDiningRole]) ??
        (warmDiningSlot === undefined
          ? undefined
          : WARM_DINING_MATERIAL_TABLE[furnitureItemType]?.[Number(warmDiningSlot)])
      : null;
    if (warmDiningMaterialKey) {
      const warmDiningColors = {
        wood: paletteColors.wood,
        linen: paletteColors.diningLinen ?? 15919316,
        sage: paletteColors.diningSage ?? 10926731,
        ceramic: paletteColors.applianceSoft
      };
      const isWarmDiningFabric =
        warmDiningMaterialKey === "linen" || warmDiningMaterialKey === "sage";
      const warmDiningMaterial = createFurnitureMaterial(
        meshMaterial,
        warmDiningColors[warmDiningMaterialKey],
        {
          // 布艺面最糙（0.94），陶面上釉（0.3），木面取常规 0.58。
          roughness: isWarmDiningFabric ? 0.94 : warmDiningMaterialKey === "ceramic" ? 0.3 : 0.58,
          metalness: 0
        }
      );
      // 记下材质语义：resolveSharedMaterial 据此再补一次自发光强度（布艺比木面更吃光）。
      warmDiningMaterial.userData.warmDiningFabric = isWarmDiningFabric;
      warmDiningMaterial.userData.warmDiningMaterial = warmDiningMaterialKey;
      return warmDiningMaterial;
    }
    // 默认档位（跟随全局风格）下的**角色出口**：见文件上面三份登记表的说明。角色从材质名后缀
    // 读（`material-<槽位>-<角色>`），只有流水线产物才带 —— 也因此下面几条判据全部按角色，
    // 不再按槽位号（槽位号是导出时的偶然编号，重建一次就换）。
    const { role: paletteRole } = parseMaterialSlotAndRole(materialName);
    const authoredColorRecipe =
      paletteRole === undefined ? null : AUTHORED_COLOR_MATERIAL_ROLE_RECIPES[paletteRole] ?? null;
    // 「取规格原色」这条只在颜色确实来自规格时才带上配方里的质感：后段的类型分支（洁具整件走
    // 陶瓷白、沙发整件走布艺）会覆盖颜色，那时质感也必须回到默认档 —— 靠颜色对象同一性判断。
    let authoredColorOverride = null;
    let chosenColor = paletteColors.furniture;
    if (/^curtain_(left|right|split)$/.test(furnitureItemType)) {
      // 按角色分：帘布是织物（柔光档），顶轨与支架是五金（压深一档）。
      // 这里原先按**槽位号**分（0/4 取深、1/5/2/3 取柔），那是既有资产的偶然编号 ——
      // 流水线产物的槽位号是 0 = 帘布、1 = 顶轨，照旧判就会正好取反。
      const { role: curtainRole } = parseMaterialSlotAndRole(materialName);
      chosenColor = curtainRole === "fabric" ? paletteColors.furnitureSoft : paletteColors.furnitureDark;
    } else if (furnitureItemType === "squarecoffeetable") {
      // 方茶几只有一个「台面 + 四腿」的构造，仍按命名分档取色。
      // 组合茶几（coffeetable）**不在这一支**：它上下两块都是石材板，早在上面的石材板
      // 分支就整块返回了，颜色在贴图里，不走这里 —— 留着这支只会是一段永不可达的死代码。
      chosenColor = materialName.endsWith("-dark")
        ? paletteColors.furnitureDark
        : materialName.endsWith("-light") || materialName.endsWith("-soft")
          ? paletteColors.furnitureSoft
          : paletteColors.furniture;
    } else if (furnitureItemType === "piano") {
      // 钢琴：琴身 / 顶盖 / 腰线 / 琴腿取深档（实物不是亮光黑就是深木），白键是整件唯一的亮面，
      // 黑键与五金各自压深。这一支只在**没选风格档位**时生效（选了档位就走 PIANO_STYLES 的角色配方），
      // 作用是别让键盘被家具色卡刷成一片同色 —— 一整块深色键床 + 一块浅色键面才读得出是琴。
      const { role: pianoRole } = parseMaterialSlotAndRole(materialName);
      chosenColor =
        pianoRole === "key"
          ? paletteColors.furnitureLight ?? paletteColors.furnitureSoft
          : pianoRole === "metal"
            ? (paletteColors.applianceDark ?? paletteColors.furnitureDark)
            : paletteColors.furnitureDark;
    } else if (furnitureItemType === "tvstand") {
      const standColor = meshMaterial?.color?.clone?.() || new THREE.Color(16777215);
      const tvStandLuminance =
        standColor.r * 0.2126 + standColor.g * 0.7152 + standColor.b * 0.0722;
      chosenColor =
        materialName.endsWith("-dark") || tvStandLuminance < 0.16
          ? paletteColors.furnitureDark
          : materialName.endsWith("-soft") ||
              materialName.endsWith("-light") ||
              tvStandLuminance >= 0.3
            ? paletteColors.furnitureSoft
            : paletteColors.furniture;
    } else if (
      ["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)
    ) {
      // 餐桌组合 / 圆餐桌：台面与椅垫取柔光档（浅色），其余木构件取中档。
      // 判据从「槽位号 0（圆餐桌带转盘再加 3）」改成读**角色** —— 旧编号是既有资产的偶然号，
      // 重建后的餐桌里 2 号是桌腿、3 号才是椅垫，照旧判会把亚麻色刷到桌腿上。
      const { role: diningTableRole } = parseMaterialSlotAndRole(materialName);
      chosenColor =
        diningTableRole === "top" || diningTableRole === "cushion"
          ? paletteColors.furnitureSoft
          : paletteColors.furniture;
    } else if (furnitureItemType === "basin") {
      // 台盆：陶瓷盆体是整件最白的一块（`body` 角色），石材台面次之，五金拉手与龙头走钢色。
      // 原先是「槽位 1 取中档、其余按原色亮度分档」，槽位号在重建后已改（新资产 1 号是门板）。
      const { role: basinRole } = parseMaterialSlotAndRole(materialName);
      chosenColor =
        basinRole === "body"
          ? (paletteColors.applianceSoft ?? paletteColors.furnitureLight)
          : basinRole === "top"
            ? paletteColors.furnitureSoft
            : basinRole === "handle" || basinRole === "metal"
              ? (paletteColors.appliance ?? paletteColors.furniture)
              : paletteColors.furniture;
    } else if (["kitchenbase", "kitchensink", "kitchencooktop"].includes(furnitureItemType)) {
      // 厨房地柜三件：柜体 / 门板按角色分档取色。
      //   - 门板与台面取柔光档（白门 + 浅台面是这三件的标准样）；
      //   - 踢脚压深一档（落地那一圈在实物上总是最暗的）；
      //   - 水槽盆体 / 灶面走五金档，不跟柜体木色走 —— 它们是不锈钢与银黑玻璃。
      const { role: kitchenRole } = parseMaterialSlotAndRole(materialName);
      chosenColor =
        kitchenRole === "top" || kitchenRole === "door"
          ? paletteColors.furnitureSoft
          : kitchenRole === "base"
            ? paletteColors.furnitureDark
            : kitchenRole === "sink" || kitchenRole === "cooktop" || kitchenRole === "metal"
              ? (paletteColors.appliance ?? paletteColors.furniture)
              : paletteColors.furniture;
    } else if (furnitureItemType === "stairs" || furnitureItemType === "floatingstairs") {
      // 建筑本体的楼梯族（含悬空楼梯）：不吃家居档位，整件回主料色。实际路径由上面的
      // HOME_PALETTE 过滤挡掉，这一支是给「日后谁把它们收进家居」留的安全网 —— 没有它，
      // 这两位会落进末尾的亮度兜底，整段楼梯按踏板亮度分档变色。
      chosenColor = paletteColors.furniture;
    } else if (
      furnitureItemType === "plant" &&
      (materialName.endsWith("-soft") || materialName.endsWith("-dark"))
    ) {
      chosenColor = paletteColors.furniture;
    } else if (materialName.includes("foliagesoft")) {
      chosenColor = 7835779;
    } else if (materialName.includes("foliage")) {
      chosenColor = 6257261;
    } else if (materialName.endsWith("-soft") || materialName.endsWith("-light")) {
      chosenColor = paletteColors.furnitureSoft;
    } else if (materialName.endsWith("-dark")) {
      chosenColor = paletteColors.furnitureDark;
    } else if (paletteRole === "metal" || paletteRole === "handle") {
      // 五金（拉手 / 滑轨 / 合页 / 顶轨）：整件统一深色金属。原先只有衣柜 / 床头柜 / 电视柜
      // 三支各自写过一次这个值，其余柜类（书柜 / 鞋柜 / 吊柜 / 玻璃柜 / 置物架…）的拉手没有
      // 任何分支认领，于是跟着柜体木色走 —— 浅色柜子上那几条拉手整片消失，深色柜子上就是
      // 几条看不见的木条。放到这里之后，凡是没有专门分支的类型都由这一条兜住。
      chosenColor = FURNITURE_HARDWARE_TONE;
    } else if (authoredColorRecipe) {
      chosenColor = meshMaterial.color?.clone?.() || new THREE.Color(16777215);
      authoredColorOverride = { ...authoredColorRecipe, color: chosenColor };
    } else if (
      paletteRole !== undefined &&
      !CARCASS_MATERIAL_ROLE_SET.has(paletteRole) &&
      !NON_CARCASS_MATERIAL_ROLE_SET.has(paletteRole)
    ) {
      // 没登记过的角色：按原色放行，**不猜**。「猜」的具体形式就是下面那条亮度分档，而它对
      // 内容物 / 附件是错的（会刷成主料色）；宁可留一块原色，也不要赌一块内容物的颜色。
      // 今天这份名单是齐的（护栏第 23 条离线盯住），这一支是给下一个新角色准备的兜底。
      chosenColor = meshMaterial.color?.clone?.() || new THREE.Color(16777215);
    } else if (LUMINANCE_BANDED_ITEM_TYPES.has(furnitureItemType)) {
      const cabinetColor = meshMaterial.color?.clone?.() || new THREE.Color(16777215);
      const cabinetLuminance =
        cabinetColor.r * 0.2126 + cabinetColor.g * 0.7152 + cabinetColor.b * 0.0722;
      chosenColor =
        cabinetLuminance < 0.2
          ? paletteColors.furnitureDark
          : cabinetLuminance < 0.55
            ? paletteColors.furniture
            : paletteColors.furnitureSoft;
    }
    if (paletteColors.warmFurniture) {
      // 暖阳原木：逐件按**材质角色**指定木色 / 布艺 / 五金，而不是套用家具三档灰 ——
      // 各角色的语义（床架、床品、坐垫、桌面、拉手…）是建模时写进材质名的意图，
      // 只有按角色取色才能既保住木质主体，又让布艺与金属件各归其位。
      //
      // 这里原先还留着一个 `const warmOverrideMaterialIndex = materialName.match(/material-(\d+)/)`
      // 供下面各分支按槽位号认件。槽位号是旧资产的偶然编号，重建一次就作废（床的 1 号从床品
      // 变成床架、窗帘的 1 号从布面变成顶轨、床头柜的 2 号从拉手变成抽屉面），
      // 各分支现在一律读角色，这个变量随之删除。
      if (furnitureItemType === "bed") {
        // 木脚与床架箱体是木作，床垫 / 床头板 / 被褥 / 枕头都是织物。
        // 判据从「槽位号 1 / 3 是床品」改成读**材质名里的角色**：槽位号是旧资产的偶然编号，
        // 床一分件就作废（床架会变浅色、枕头会变木色），角色才是实物的语义。
        const { role: bedRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          bedRole === "leg" || bedRole === "frame" ? paletteColors.wood : paletteColors.furnitureLight;
      }
      if (furnitureItemType === "sofa") {
        // 木脚与座台木框是木作，其余（座箱 / 靠背 / 扶手 / 坐垫 / 抱枕）是织物。
        // 同理不再用 materialName.includes("cushion")：那样抱枕（accent）会落到木色上。
        const { role: sofaRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          sofaRole === "leg" || sofaRole === "frame"
            ? paletteColors.wood
            : paletteColors.sofaFabric ?? paletteColors.furnitureLight;
      }
      if (furnitureItemType === "cabinet") {
        // 按**角色**分料：拉手是五金、踢脚压深一档、柜体（含中缝 trim）走棕褐柜体色。
        // 白色门板不在这里 —— 门是独立槽位（角色 door），由下面的 isCabinetDoorMaterial 统一刷白，
        // 于是「棕褐柜体 + 白门 + 五金拉手」这个组合由三块真几何各自成立。
        // 旧判据是 `槽位 2 号 = 五金拉手`，那是 cabient 老资产的偶然编号：槽位一重排，
        // 拉手色就落到别的部件上（衣柜重建后 2 号仍是五金，纯属巧合）。
        const { role: cabinetRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          cabinetRole === "metal"
            ? FURNITURE_HARDWARE_TONE
            : cabinetRole === "base"
              ? 7830384
              : paletteColors.cabinetBody ?? paletteColors.wood;
      }
      if (furnitureItemType === "nightstand") {
        // 同上：五金（拉手 / 滑轨）走深色金属，柜体、抽屉面、搁板走木色。
        // 旧判据 `槽位 2 号 = 五金拉手` 在重建后的床头柜上指到的是**抽屉面** ——
        // 拉手没上色、抽屉反而被刷成金属色，正好反过来。
        const { role: nightstandRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = nightstandRole === "metal" ? FURNITURE_HARDWARE_TONE : paletteColors.wood;
      }
      if (["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)) {
        // 餐桌 / 圆餐桌 / 转盘款由 WARM_DINING_MATERIAL_ROLE_TABLE 按角色整件接管（函数在上面
        // 就 return 了），能落到这里的只剩角色表没写的那些件 —— 圆餐桌的 7 号「中轴盖」（角色 metal）
        // 是唯一一处。旧判据是 `槽位 0 / 3 号是木色、其余浅色`：那是既有资产的偶然编号，重建后
        // 0 号是台面、3 号是**椅垫**，于是亚麻色被刷到桌腿上、椅垫反而变木色。
        const { role: diningFallbackRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = diningFallbackRole === "metal" ? paletteColors.applianceSoft : paletteColors.wood;
      }
      if (furnitureItemType === "tvstand") {
        // 按角色分料：五金件（拉手 / 脚）走深色，其余（柜体、踢脚、抽屉面、内衬、搁板）走木色，
        // 台面由 isWarmCountertop 单独换成石材色。旧行为是整件一个木色 —— 金属脚因此也成了木头。
        const { role: tvStandRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = tvStandRole === "metal" ? FURNITURE_HARDWARE_TONE : paletteColors.wood;
      }
      if (furnitureItemType === "sideboard") {
        chosenColor = paletteColors.wood;
      }
      // 原先这里还有一条 `bookcase && 槽位号 >= 11` 的分支：老资产的 11 号往后是书脊 / 摆件
      // 一类的小色块，按木作强调色 / 装饰色 / 浅木色轮转。重建后的书柜只有 5 个槽位
      // （柜体 / 踢脚 / 搁板 / 内衬 / 台面），11 号**永远不存在**，整段已成死代码，故删除。
      // 书柜现在的暖色语义：整体柜体木色（JOINERY_ITEM_TYPES 那条收敛），台面由角色 top 换成石材色。
      if (furnitureItemType === "plant") {
        // 2026-09 起 plant 是流水线产物，材质名带角色。旧判据读的全是既有资产的命名
        // （foliagesoft / -soft），在新几何上一条都不命中 —— 叶片、花盆、盆土、主干会一起落到
        // 家具深灰，一株绿植看上就是一坨灰色的铁。
        const { role: plantRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          plantRole === "foliage"
            ? paletteColors.leafColor
            : // 花盆取陶土色（暖色卡里的 decorAccent 本来就是陶土那一支），
              // 盆托与主干、盆土一律压到深色：实物上花盆是唯一该跳出来的那一块。
              plantRole === "pot"
              ? paletteColors.decorAccent
              : paletteColors.furnitureDark;
      }
      if (furnitureItemType === "rug") {
        // 同上：毯面 / 包边 / 防滑底三块必须分色。旧判据只认 `-soft`，新几何上不命中，
        // 于是三块同为 joineryAccent —— 包边那道高出 1.5mm 的织带就完全看不出来了，
        // 地毯会读成一块纯色板。
        const { role: rugRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          rugRole === "fabric"
            ? paletteColors.furnitureLight
            : rugRole === "trim"
              ? paletteColors.joineryAccent
              : paletteColors.furnitureDark;
      }
      if (furnitureItemType.startsWith("curtain_")) {
        // 同上：旧判据按**槽位号**分（1 / 2 / 3 / 5 号算布面），那是既有资产的偶然编号。
        // 新几何的槽位号是 0 = 帘布、1 = 顶轨，于是帘布被判成深木色、顶轨反被判成暖米白，
        // 正好反过来 —— 一根发光的白杆子挑着一幅深褐色布。
        const { role: curtainRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = curtainRole === "fabric" ? 16776696 : paletteColors.furnitureDark;
      }
      if (furnitureItemType === "aquarium") {
        // 鱼缸原先一条暖色覆盖都没有：柜体、踢脚、缸框、拉手会一起落进基础家具灰，
        // 而四面玻璃是真的透明件（走下面那条独立分支），于是画面上只剩一块灰箱子里透出个洞。
        const { role: aquariumRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          aquariumRole === "handle"
            ? paletteColors.furnitureSoft
            : aquariumRole === "base" || aquariumRole === "frame"
              ? paletteColors.furnitureDark
              : aquariumRole === "lit"
                ? paletteColors.applianceSoft
                : // 缸内背板固定深青：它必须比柜体更冷更深，「里面有水」才立得住。
                  // 不取木色是因为那不是木料 —— 它是水体的底色。
                  aquariumRole === "interior"
                  ? 0x1b3a40
                  : paletteColors.furniture;
      }
      if (furnitureItemType === "chair") {
        // 木脚与靠背立柱 / 上横档是木作，坐垫与靠背软垫是织物。
        // 判据从「0 号是椅面」改成读材质名里的角色：槽位号是旧资产的偶然编号。
        const { role: chairRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          chairRole === "leg" || chairRole === "frame"
            ? paletteColors.wood
            : paletteColors.chairFabric ?? paletteColors.furnitureSoft;
      }
      if (["toilet", "squattoilet", "urinal", "bathtub", "basin"].includes(furnitureItemType)) {
        chosenColor = paletteColors.applianceSoft;
      }
    }
    // 暖阳原木：柜类的台面与金属水槽 / 灶面另有专门色板，这里按**角色**单独覆盖；
    // 只有暖色主题的柜类才走这一块，其它情况下两个标记恒为 false。
    let isWarmCountertop = false;
    let isWarmMetalSink = false;
    let isWarmSteelPanel = false;
    if (isWarmJoinery) {
      const joineryMaterialRole = parseMaterialSlotAndRole(materialName).role;
      isWarmCountertop = isWarmCountertopMaterial(furnitureItemType, materialName);
      if (["kitchensink", "kitchencooktop"].includes(furnitureItemType)) {
        chosenColor = paletteColors.wood;
      }
      if (
        (furnitureItemType === "kitchenbase" ||
          furnitureItemType === "kitchensink" ||
          furnitureItemType === "kitchencooktop") &&
        joineryMaterialRole === "metal"
      ) {
        // 拉手与火盖：银黑五金。柜体木色那条分支会把金属度归零，这里要抬回来，
        // 否则不锈钢会渲染成一块哑光深灰。
        chosenColor = paletteColors.steelBlackBright ?? 6976381;
        isWarmSteelPanel = true;
      }
      if (furnitureItemType === "kitchensink" && joineryMaterialRole === "sink") {
        // 水槽盆体：不锈钢，同样要求高金属度反光。
        chosenColor = paletteColors.steelSink ?? 11450548;
        isWarmMetalSink = true;
      }
      if (furnitureItemType === "kitchencooktop" && joineryMaterialRole === "cooktop") {
        // 燃气灶面板：整块银黑玻璃，压到近黑 —— 与亮一档的火盖叠起来才有不锈钢灶具的层次。
        chosenColor = paletteColors.steelBlackDark ?? 2501424;
        isWarmSteelPanel = true;
      }
      if (
        (furnitureItemType === "kitchenbase" ||
          furnitureItemType === "kitchensink" ||
          furnitureItemType === "kitchencooktop") &&
        joineryMaterialRole === "base"
      ) {
        // 踢脚 / 落地压条：暖色木作里最深的那一档，柜子才有「落地」的重量。
        chosenColor = 7830384;
      }
      if (isWarmCountertop) {
        chosenColor = paletteColors.countertop ?? 16117989;
      }
    }
    // 柜门统一刷白：门板是独立材质，单独取白色，柜体仍是木料，「木柜体 + 白门」才成立。
    // 放在 isWarmJoinery 之后：厨房几件在地面按槽位定过木色，门板要能盖回来。
    // 衣柜（cabinet）没有独立门板几何，走 resolveSharedMaterial 里的正面着色器，不在此列。
    const isCabinetDoor =
      paletteColors.warmFurniture && isCabinetDoorMaterial(furnitureItemType, materialName);
    if (isCabinetDoor) {
      chosenColor = paletteColors.cabinetDoor ?? 16777215;
    }
    // isSoftRug 原先在这里：给地毯那块**贴花内衬**材质加 polygonOffset，压住它与毯底之间的
    // 深度闪烁。判据是 `materialName.endsWith("-soft")` —— 既有资产的 `ha-rug-soft`。
    // 地毯 2026-09 改成流水线产物后，毯面 / 包边 / 防滑底已是各自独立的网格与角色，
    // 没有任何贴花叠在毯面上，这个判据在新几何上永不命中，整段已成死代码，一并删除。
    const isTransparentMaterial =
      materialName.endsWith("-glass") ||
      meshMaterial?.transparent === true ||
      (meshMaterial?.opacity ?? 1) < 1;
    // 暖阳原木：玻璃等透明件换成暖色玻璃，避免冷灰玻璃在暖色场景里显得脏。
    if (paletteColors.warmFurniture && isTransparentMaterial) {
      chosenColor = paletteColors.glass;
    }
    // 「取规格原色」的角色（内容物 / 陈设撞色件 / 镜面）还各自带质感。只在颜色确实还是规格
    // 原色时才生效：下面的类型分支若覆盖过颜色（洁具整件走陶瓷白、沙发整件走布艺…），
    // 质感也必须跟着回到默认档，否则会得到「陶瓷白 + 镜面级低粗糙度」这种半对半错的组合。
    const authoredColorApplied = authoredColorOverride !== null && chosenColor === authoredColorOverride.color;
    const defaultRoughness = isWarmCountertop
      ? 0.65
      : isWarmMetalSink
        ? 0.36
        : isWarmSteelPanel
          ? 0.26
          : paletteColors.warmFurniture && isTransparentMaterial
            ? 0.18
            : materialName.includes("foliage") || furnitureItemType === "rug"
              ? 0.9
              : 0.72;
    const defaultMetalness = isWarmMetalSink
      ? 0.55
      : isWarmSteelPanel
        ? 0.62
        : isWarmJoinery || materialName.includes("foliage") || furnitureItemType === "rug"
          ? 0
          : 0.02;
    return createFurnitureMaterial(meshMaterial, chosenColor, {
      roughness:
        authoredColorApplied && authoredColorOverride.roughness !== undefined
          ? authoredColorOverride.roughness
          : defaultRoughness,
      metalness:
        authoredColorApplied && authoredColorOverride.metalness !== undefined
          ? authoredColorOverride.metalness
          : defaultMetalness,
      transparent: isTransparentMaterial,
      // 暖阳原木：透明件保留原材质的不透明度（暖玻璃本来就调过半透明），
      // 其它主题仍用统一的 0.42。
      opacity: isTransparentMaterial ? (paletteColors.warmFurniture ? meshMaterial.opacity : 0.42) : 1,
      depthWrite: !isTransparentMaterial
    });
  }
/**
 * 生成楼梯专用材质：玻璃件走半透明，其余走框架色。
 *
 * **判据全部换成角色**（`material-<槽位>-<角色>`）：钢 / 玻璃楼梯 2026-09 迁进流水线之后，
 * 材质名里带的是 `top`（踏板）/ `metal`（斜梁）/ `glass`（玻璃踏板）这些语义，
 * 原先那套按第三方资产的编号认件（`004` = 钢楼梯踏面、`sacfdsa010` = 玻璃楼梯踏面、
 * 「透明且不透明度 < 0.5」= 玻璃）从此全部失配 —— 而失配的表现是「整段楼梯变成一种灰」，
 * 浏览器里零报错。玻璃的判据尤其要紧：流水线产物的玻璃槽位是**不透明**落盘的
 * （角色 glass 的透明化由 resolveSharedMaterial 统一收口），所以「源材质透明」这条永远为假。
 *
 * 钢楼梯用更高的金属度与更低的粗糙度（0.42 / 0.38）表现金属反射，其余用 0.08 / 0.58 的
 * 哑光框架，都加极低 emissive 0.07 提亮暗部。
 */
  function createStairMaterial(existingMaterial, stairPalette, stairItemType) {
    if (!existingMaterial) {
      return existingMaterial;
    }
    const { role: stairRole } = parseMaterialSlotAndRole(existingMaterial.name);
    if (stairItemType === "glassstairs" && stairRole === "glass") {
      const glassStairMaterial = new THREE.MeshStandardMaterial({
        // 暖阳原木：玻璃楼梯改用暖色玻璃，避免冷灰玻璃在暖色楼梯井里发灰。
        color: stairPalette.warmWood ? stairPalette.glass : stairPalette.furnitureSoft,
        roughness: 0.12,
        metalness: 0.04,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: true
      });
      glassStairMaterial.name = (existingMaterial.name || "stair-glass") + " · HomeOS glass";
      return glassStairMaterial;
    }
    const isSteelStairs = stairItemType === "steelstairs";
    if (stairPalette.warmWood) {
      // 暖阳原木：踏面（角色 top）换成地板色，并注入与地板相同的拼板着色器，
      // 楼梯才会与地板看起来是同一种木料；其余框架件统一用深色 7567993 压住踏面，
      // 避免整段楼梯一起发飘。判据原先按第三方编号认件，见函数头的说明。
      const isWarmStairTread = stairRole === "top";
      const warmStairMaterial = createFurnitureMaterial(
        existingMaterial,
        isWarmStairTread ? stairPalette.floor : 7567993,
        {
          roughness: isWarmStairTread ? 0.84 : 0.38,
          metalness: isWarmStairTread ? 0 : 0.5
        }
      );
      if (isWarmStairTread) {
        decorateWarmFloor(warmStairMaterial, stairPalette);
        // 标记踏面：resolveSharedMaterial 据此把自发光强度压到 0.075。
        warmStairMaterial.userData.warmFloorTread = true;
      }
      return warmStairMaterial;
    }
    const frameColor = stairPalette.furnitureSoft;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: isSteelStairs ? 0.38 : 0.58,
      metalness: isSteelStairs ? 0.42 : 0.08,
      emissive: frameColor,
      emissiveIntensity: 0.07,
      side: existingMaterial.side ?? THREE.FrontSide,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      toneMapped: true
    });
    frameMaterial.name = (existingMaterial.name || "stair-frame") + " · HomeOS palette";
    return frameMaterial;
  }
/**
 * 家电 / 家具材质的统一分发入口：按类型挑这条链上最合适的替换策略。
 * 分发顺序不可调换，原则是「先专门、后通用」：纯色家电 → 家具（含 sofa）→ 电梯 → 楼梯 → 其余按亮度分档兜底。三处特殊处理：拿不到 MeshStandardMaterial 构造器（精简版 three 或测试替身）时直接克隆原材质放行，
 * 宁可保真也不报错；茶几机的自发光被显式清零，否则替换后再叠场景灯光会明显发白；
 * 钢琴原先在这条链上有两支「按第三方素材的材质名（Color_009 / 金色）认部件」的分流，
 * 2026-09 它按流水线规格重建、槽位改成角色之后这两支一并删掉 —— 它现在与其它家居一样走家具那一支。
 */
  function applyAppliancePalette(baseMaterial, appliancePalette, applianceItemType) {
    if (typeof THREE.MeshStandardMaterial != "function") {
      return baseMaterial.clone?.() || baseMaterial;
    }
    if (APPLIANCE_PALETTE_ITEM_TYPES.has(applianceItemType)) {
      // 家电材质名同样来自建模约定（`material-<槽位>`，重建后带角色后缀 `-<角色>`）。
      const applianceMaterialName = (baseMaterial?.name || "").toLowerCase();
      const { role: applianceRole } = parseMaterialSlotAndRole(applianceMaterialName);
      const applianceBaseColor = baseMaterial?.color?.clone?.() || new THREE.Color(16777215);
      const applianceLuminance =
        applianceBaseColor.r * 0.2126 +
        applianceBaseColor.g * 0.7152 +
        applianceBaseColor.b * 0.0722;
      const applianceColor = appliancePalette.appliance ?? appliancePalette.furniture;
      const applianceSoftColor = appliancePalette.applianceSoft ?? appliancePalette.furnitureSoft;
      const applianceDarkColor = appliancePalette.applianceDark ?? appliancePalette.furnitureDark;
      // 不锈钢家电里有色彩语义的小件不刷成钢色：热水器的红 / 蓝进出水管、显示屏 ——
      // 全刷成银黑就读不出冷热水了。判据是原色的彩度，彩度高的原样留下。
      // 分档用的亮度也是同一套线性分量，与下面的 applianceLuminance 取自同一个 clone。
      const applianceChroma =
        Math.max(applianceBaseColor.r, applianceBaseColor.g, applianceBaseColor.b) -
        Math.min(applianceBaseColor.r, applianceBaseColor.g, applianceBaseColor.b);
      const keepsOriginalColor =
        APPLIANCE_FINISH_BY_ITEM_TYPE[applianceItemType] !== undefined && applianceChroma > 0.2;
      // 两盏灯（壁灯 / 落地灯）的取色单独走：壁灯的灯罩内面取强调色，
      // 落地灯在暖色主题下整支走暖木色（floorLampBody）、只有灯罩走柔光档。判据是角色 lit
      // 而不是槽位号 —— 灯具重建时槽位号变过一轮（旧资产 2 号是灯罩、新的 3 号才是）。
      const lampColor =
        applianceItemType === "walllamp"
          ? applianceRole === "lit"
            ? appliancePalette.accent
            : applianceColor
          : appliancePalette.floorLampBody
            ? applianceRole === "lit"
              ? applianceSoftColor
              : appliancePalette.floorLampBody
            : applianceColor;
      // 角色档表里查到的取色档名（见 APPLIANCE_ROLE_TONE_BY_ITEM_TYPE 的注释）。
      const toneColorByTone = {
        appliance: applianceColor,
        soft: applianceSoftColor,
        dark: applianceDarkColor,
        accent: appliancePalette.accent
      };
      const roleTone =
        APPLIANCE_ROLE_TONE_BY_ITEM_TYPE[applianceItemType]?.[applianceRole] ?? null;
      // 彩色小件保留原色：指示灯与 LED 点阵（lit，以及路由器 / 垃圾桶那两块绿点阵屏）本身
      // 就是「有颜色的东西」，刷成银黑就读不出来了。判据是原色的彩度，与上面那条
      // keepsOriginalColor 同一个思路，只是不受不锈钢族名单限制。
      const keepsIndicatorColor =
        (applianceRole === "lit" || applianceRole === "screen") && applianceChroma > 0.2;
      const selectedColor =
        applianceItemType === "walllamp" || applianceItemType === "floorlamp"
          ? lampColor
          : keepsIndicatorColor
            ? applianceBaseColor
            : // 屏面统一压到暗档：显示器 / 网络存储器 / 音响面板的屏在规格里都是近黑的中性色，
              // 但按亮度分档时 0x31353A 这一档会落到「柔光银」上（台式机与智能面板的屏整个是银的）。
              applianceRole === "screen" && applianceChroma < 0.2
              ? applianceDarkColor
              : roleTone
                ? toneColorByTone[roleTone] ?? applianceColor
                : applianceItemType === "tea_bar_machine"
                  ? // 茶几机只有「深 / 浅」两档，没有专门的深色件。
                    applianceLuminance < 0.16
                    ? applianceColor
                    : applianceSoftColor
                  : // 其余家电按原材质亮度分三档归位：亮档是箱体、中档是次要面板、
                    // 暗档是滤网 / 控制面板。不锈钢家电的三档由 applyItemFinish 换成
                    // 同一族色的明度变体，这里不必知道具体是什么颜色。
                    applianceMaterialName.endsWith("-dark") || applianceLuminance < 0.16
                    ? applianceDarkColor
                    : applianceMaterialName.endsWith("-soft") || applianceLuminance < 0.45
                      ? applianceSoftColor
                      : applianceColor;
      // 彩度高的小件（红蓝水管 / 显示屏）保留原色，其余按上面的分档取钢色。
      const finalColor = keepsOriginalColor ? applianceBaseColor : selectedColor;
      // 不锈钢家电不能沿用那套 0.82 / 0 的哑光参数（那是给暖米白家电的），否则银灰 / 银黑
      // 会渲染成一块塑料：压低粗糙度、给一点金属度，靠三盏灯的镜面高光读出不锈钢。
      // 金属度刻意不超过 0.35 —— 场景没有环境贴图，金属度一高漫反射就没了，反而发黑。
      const isSteelFinish = APPLIANCE_FINISH_BY_ITEM_TYPE[applianceItemType] !== undefined;
      const applianceMaterial = createFurnitureMaterial(baseMaterial, finalColor, {
        roughness: isSteelFinish ? (keepsOriginalColor ? 0.3 : 0.34) : 0.82,
        metalness: isSteelFinish ? (keepsOriginalColor ? 0.45 : 0.3) : 0,
        flatShading: false
      });
      if (applianceItemType === "tea_bar_machine") {
        applianceMaterial.emissive = new THREE.Color(0);
        applianceMaterial.emissiveIntensity = 0;
      }
      return applianceMaterial;
    }
    if (FURNITURE_PALETTE_ITEM_TYPES.has(applianceItemType)) {
      return applyFurniturePalette(baseMaterial, appliancePalette, applianceItemType);
    }
    if (applianceItemType === "sofa") {
      const isCushionMaterial = /cushion/i.test(baseMaterial?.name || "");
      return createFurnitureMaterial(
        baseMaterial,
        isCushionMaterial ? appliancePalette.furnitureSoft : appliancePalette.furniture,
        {
          roughness: 0.8,
          metalness: 0.01
        }
      );
    }
    if (PILLAR_MODEL_ITEM_TYPES.has(applianceItemType)) {
      // 立柱是**墙的一部分**：占位几何用墙材质画、反射角色也归 wall，所以流水线产物的
      // 三段（柱身 / 柱脚 / 柱帽）按角色取墙色族 —— 柱身取墙色、柱脚压深一档、
      // 柱帽提亮一档（柱帽在实物上正好接天花板，比墙身更吃顶光）。
      // 判据是角色而不是槽位号：柱族的槽位号换了形状就会变（异形柱多一道轮廓拉体），
      // 而「柱脚 / 柱身 / 柱帽」这套语义是建模时死的。
      const { role: pillarRole } = parseMaterialSlotAndRole(baseMaterial?.name);
      const pillarWallColor = new THREE.Color(appliancePalette.wall);
      const pillarColor =
        pillarRole === "base"
          ? pillarWallColor.clone().multiplyScalar(0.92)
          : pillarRole === "trim"
            ? pillarWallColor.clone().lerp(new THREE.Color(16777215), 0.35)
            : pillarWallColor;
      return createFurnitureMaterial(baseMaterial, pillarColor, {
        roughness: pillarRole === "base" ? 0.74 : 0.66,
        metalness: 0.02
      });
    }
    if (applianceItemType === "elevator") {
      // 电梯轿厢按角色分件（2026-09 迁进流水线，见 model-specs.mjs 的 elevator 规格）。
      // 判据从「材质名里有没有 Color_003 / Color_004」换成角色 —— 那套名字是第三方资产的
      // 内部编号，换一份资产就整件同色，浏览器里零报错。
      //
      // 取色跟着「这是房子的一部分」走（与柱族同源）：
      //   - 壁板 / 顶板 / 门楣（panel）取**墙色**，换墙色时轿厢壁要跟着变；
      //   - 轿门（door）取不锈钢一档（发丝面，粗糙度压低、金属度给足）；
      //   - 门槛 / 扶手 / 按钮（metal）取深一档五金色；
      //   - 地板（base）压深成石面（深色 + 低金属度，与墙色形成地面／立面的分界）；
      //   - 操作面板（screen）与顶灯（lit）保留各自烘焙的色（深色玻璃面板 / 暖白灯板）——
      //     这两块在实物上是「玻璃」和「光源」，跟着调色板刷会丢掉它们的语义。
      const { role: elevatorRole } = parseMaterialSlotAndRole(baseMaterial?.name);
      if (elevatorRole === "screen" || elevatorRole === "lit") {
        return baseMaterial.clone?.() || baseMaterial;
      }
      const elevatorWallColor = new THREE.Color(appliancePalette.wall);
      const elevatorColor =
        elevatorRole === "panel"
          ? elevatorWallColor
          : elevatorRole === "door"
            ? new THREE.Color(appliancePalette.applianceSoft ?? appliancePalette.furnitureSoft)
            : elevatorRole === "metal"
              ? new THREE.Color(appliancePalette.applianceDark ?? appliancePalette.furnitureDark)
              : elevatorWallColor.clone().multiplyScalar(0.32);
      return createFurnitureMaterial(baseMaterial, elevatorColor, {
        roughness:
          elevatorRole === "door" ? 0.26 : elevatorRole === "metal" ? 0.32 : elevatorRole === "panel" ? 0.6 : 0.5,
        metalness: elevatorRole === "door" ? 0.42 : elevatorRole === "metal" ? 0.5 : 0.06
      });
    }
    if (applianceItemType === "smallcar") {
      // 小车按角色分件（2026-09 迁进流水线，见 model-specs.mjs 的 smallcar 规格）。
      //
      // 原先这一支是**整件**套一层车漆着色器（materials/studio-car-finish.js）：那段着色器
      // 是为第三方车模的**贴图集**写的 —— 拿贴图里的玻璃岛、灯位、漆面亮度来分区，而着色器里
      // 所有分区判断都包在 `#ifdef USE_MAP` 里，程序化车没有贴图，于是整段退化成「按 z 分前后
      // 半」的一层蓝反光（更糟的是它还拿 position.z 当高度用，那是旧资产 Z 朝上的后遗症）。
      // 分件之后车漆 / 玻璃 / 轮毂 / 轮胎 / 灯 / 格栅各拿各的那份，运行侧不必再猜。
      const { role: carRole } = parseMaterialSlotAndRole(baseMaterial?.name);
      if (carRole === "glass") {
        // 玻璃的透明与颜色由 resolveSharedMaterial 的玻璃分支统一收口（这一支只负责透明标记），
        // 这里先按原色放行，不要在调色板里给它一个不透明的家具色。
        return baseMaterial.clone?.() || baseMaterial;
      }
      if (carRole === "lit") {
        // 前大灯 / 尾灯：保留烘焙的暖白，并让它自己发一点光（车灯是光源，不是被照亮的塑料）。
        const carLampMaterial = createFurnitureMaterial(
          baseMaterial,
          baseMaterial?.color?.clone?.() || new THREE.Color(16773328),
          { roughness: 0.2, metalness: 0 }
        );
        carLampMaterial.emissive = carLampMaterial.color.clone();
        carLampMaterial.emissiveIntensity = 0.55;
        return carLampMaterial;
      }
      const carColor =
        carRole === "body"
          ? // 车漆：暖阳原木下走珍珠白（与原先那层着色器同色），默认风格走冷调银。
            new THREE.Color(
              materialPalette.warmWood === true ? 16776696 : appliancePalette.applianceSoft
            )
          : carRole === "metal"
            ? new THREE.Color(appliancePalette.appliance)
            : carRole === "grating"
              ? new THREE.Color(appliancePalette.applianceDark)
              : // 轮胎（trim）与尚未补角色的老资产：保持烘焙的深橡胶色。
                baseMaterial?.color?.clone?.() || new THREE.Color(2237995);
      const carMaterial = createFurnitureMaterial(baseMaterial, carColor, {
        roughness: carRole === "body" ? 0.28 : carRole === "metal" ? 0.26 : carRole === "trim" ? 0.86 : 0.5,
        metalness: carRole === "body" ? 0.34 : carRole === "metal" ? 0.6 : carRole === "trim" ? 0.02 : 0.3
      });
      if (carRole === "body") {
        // 车漆的高光靠「低粗糙度 + 中金属度 + 一点与基色同色的自发光」在无环境贴图的场景里
        // 读出来（与车漆着色器当初想做的事同一件，只是不再依赖贴图）。
        carMaterial.emissive = carMaterial.color.clone();
        carMaterial.emissiveIntensity = materialPalette.warmWood === true ? 0.1 : 0.06;
      }
      return carMaterial;
    }
    if (stairItemTypes.has(applianceItemType)) {
      return createStairMaterial(baseMaterial, appliancePalette, applianceItemType);
    } else {
      return createLuminanceBandedMaterial(baseMaterial, appliancePalette);
    }
  }
/**
 * 克隆几何并重算法线，修正「按平面烘焙」带来的生硬着色。
 * 只给少数几类用（茶几机、洗碗机）：它们带明显圆角面却没有平滑法线，直接渲染会出现一圈圈棱线。重算后要把
 * 法线属性标记 needsUpdate 并重建包围盒 / 包围球，否则光线投射与视锥剔除仍用旧值；没有 clone / computeVertexNormals 时原样返回，不强行改。
 */
  function cloneGeometryWithNormals(inputGeometry) {
    const clonedGeometry = inputGeometry?.clone?.();
    if (clonedGeometry?.computeVertexNormals) {
      clonedGeometry.computeVertexNormals();
      if (clonedGeometry.attributes?.normal) {
        clonedGeometry.attributes.normal.needsUpdate = true;
      }
      clonedGeometry.computeBoundingBox?.();
      clonedGeometry.computeBoundingSphere?.();
      return clonedGeometry;
    } else {
      return inputGeometry;
    }
  }
  // 白名单而不是遍历材质全部字段：three.js 的材质字段会随版本增删，逐字段遍历既慢，
  // 又会把 uuid 之类与外观无关的字段卷进缓存键，导致等价材质被判成不同。
  const TEXTURE_MAP_KEYS = Object.freeze([
    "alphaMap",
    "anisotropyMap",
    "aoMap",
    "bumpMap",
    "clearcoatMap",
    "clearcoatNormalMap",
    "clearcoatRoughnessMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "gradientMap",
    "iridescenceMap",
    "iridescenceThicknessMap",
    "lightMap",
    "map",
    "matcap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
    "sheenColorMap",
    "sheenRoughnessMap",
    "specularColorMap",
    "specularIntensityMap",
    "thicknessMap",
    "transmissionMap"
  ]);
  // 与贴图白名单同理：这里列出的才是真正影响外观与渲染状态的字段。
  const MATERIAL_PROPERTY_KEYS = Object.freeze([
    "alphaHash",
    "alphaTest",
    "alphaToCoverage",
    "anisotropy",
    "aoMapIntensity",
    "attenuationColor",
    "attenuationDistance",
    "blendAlpha",
    "blendColor",
    "blendDst",
    "blendDstAlpha",
    "blendEquation",
    "blendEquationAlpha",
    "blending",
    "blendSrc",
    "blendSrcAlpha",
    "bumpScale",
    "clearcoat",
    "clearcoatNormalScale",
    "clearcoatRoughness",
    "clipIntersection",
    "clipShadows",
    "color",
    "colorWrite",
    "depthFunc",
    "depthTest",
    "depthWrite",
    "displacementBias",
    "displacementScale",
    "dithering",
    "emissive",
    "emissiveIntensity",
    "envMapIntensity",
    "flatShading",
    "fog",
    "forceSinglePass",
    "ior",
    "iridescence",
    "iridescenceIOR",
    "iridescenceThicknessRange",
    "lightMapIntensity",
    "metalness",
    "normalMapType",
    "normalScale",
    "opacity",
    "polygonOffset",
    "polygonOffsetFactor",
    "polygonOffsetUnits",
    "precision",
    "premultipliedAlpha",
    "reflectivity",
    "refractionRatio",
    "roughness",
    "shadowSide",
    "sheen",
    "sheenColor",
    "sheenRoughness",
    "side",
    "specularColor",
    "specularIntensity",
    "stencilFail",
    "stencilFunc",
    "stencilFuncMask",
    "stencilRef",
    "stencilWrite",
    "stencilWriteMask",
    "stencilZFail",
    "stencilZPass",
    "thickness",
    "toneMapped",
    "transmission",
    "vertexColors",
    "visible",
    "wireframe",
    "wireframeLinecap",
    "wireframeLinejoin",
    "wireframeLinewidth"
  ]);
/**
 * 把材质属性值归一化成可稳定 JSON 序列化的表示，供缓存键使用。
 * 两份外观等价的材质可能得到「数值相等但位模式不同」的值（-0 与 0、NaN、±Infinity、纹理对象、Color、 Vector、数组），直接 JSON.stringify 会得出不同的键，材质缓存随即失效、GPU program 数量膨胀。特殊值统一用
 * 字符串标记，纹理取 uuid，颜色 / 向量摊成数字数组，其余退化成 String() —— 宁可偶尔键冲突，也不要键爆炸。
 */
  function normalizeMaterialValue(rawValue) {
    if (rawValue === undefined) {
      return "undefined";
    } else if (rawValue === null) {
      return null;
    } else if (typeof rawValue == "number") {
      if (Number.isNaN(rawValue)) {
        return "NaN";
      } else if (Number.isFinite(rawValue)) {
        if (Object.is(rawValue, -0)) {
          return 0;
        } else {
          return rawValue;
        }
      } else if (rawValue > 0) {
        return "Infinity";
      } else {
        return "-Infinity";
      }
    } else if (["string", "boolean"].includes(typeof rawValue)) {
      return rawValue;
    } else if (rawValue.isTexture) {
      return ["texture", rawValue.uuid ?? rawValue.id ?? "anonymous"];
    } else if (rawValue.isColor) {
      return [rawValue.r, rawValue.g, rawValue.b];
    } else if (Array.isArray(rawValue)) {
      return rawValue.map(normalizeMaterialValue);
    } else if (typeof rawValue.toArray == "function") {
      return rawValue.toArray().map(normalizeMaterialValue);
    } else if (["x", "y", "z", "w"].some(axisKey => typeof rawValue[axisKey] == "number")) {
      return [rawValue.x, rawValue.y, rawValue.z, rawValue.w].map(normalizeMaterialValue);
    } else {
      return String(rawValue);
    }
  }
/**
 * 由材质实例构造缓存键，用于跨物件复用等价材质。
 * 键由三部分组成：着色器类型与 customProgramCacheKey（决定 GPU program 能否共享）、MATERIAL_PROPERTY_KEYS （渲染状态与数值属性）、TEXTURE_MAP_KEYS（贴图引用）。ShaderMaterial 直接按 uuid 判等并打 "unique" 标记：
 * 自定义着色器的等价性无法从字段推断，宁可不复用也不能错用。
 */
  function buildMaterialCacheKey(material) {
    if (material?.isShaderMaterial || material?.isRawShaderMaterial) {
      return JSON.stringify([
        material.type || "ShaderMaterial",
        "unique",
        material.uuid || material.id
      ]);
    }
    const customCacheKey =
      typeof material?.customProgramCacheKey == "function" ? material.customProgramCacheKey() : "";
    return JSON.stringify([
      material?.type || material?.constructor?.name || "Material",
      customCacheKey,
      MATERIAL_PROPERTY_KEYS.map(propertyName => [
        propertyName,
        normalizeMaterialValue(material?.[propertyName])
      ]),
      TEXTURE_MAP_KEYS.map(mapPropertyName => [
        mapPropertyName,
        normalizeMaterialValue(material?.[mapPropertyName])
      ])
    ]);
  }
/**
 * 取得可在多个物件实例间共享的材质：必要时替换外观，并做缓存去重。
 * 流程：按类型决定「整体换材质」（家电 / 自定义材质类，暖阳原木下还包括家具）还是克隆 → 暖阳原木的后处理（自发光、地板 / 台面 / 门板回边的着色器，以及按角色的木色 / 布艺覆盖）→ 修正透明标记 → 用材质键查缓存。
 * 命中缓存时把本次生成的等价材质立刻 dispose 并返回缓存那份，否则会按「每个物件的每个部件」生成材质、显存线性膨胀；缓存的材质存活到场景销毁，单个物件删除时绝不能 dispose（靠实例上的 externalModelSharedMaterial 标记判断）。
 */
  function resolveSharedMaterial(inputMaterial, materialPalette, modelTypeName) {
    if (!inputMaterial) {
      return inputMaterial;
    }
    // 暖阳原木：家具类（不只是家电与自定义材质类）也要按件换材质 —— 暖色主题给每种
    // 家具都写了专门的木色 / 布艺分支，只有走进 applyAppliancePalette 才能命中。
    const preparedMaterial =
      CUSTOM_MATERIAL_ITEM_TYPES.has(modelTypeName) ||
      APPLIANCE_PALETTE_ITEM_TYPES.has(modelTypeName) ||
      (materialPalette.warmFurniture && HOME_PALETTE_ITEM_TYPES.has(modelTypeName))
        ? applyAppliancePalette(inputMaterial, materialPalette, modelTypeName)
        : inputMaterial.clone?.() || inputMaterial;
    // 石材板：外观已由整块石材整图决定（颜色在贴图里，材质基色只是白或一层薄染色），
    // 下游那几层「按调色板改色 / 补自发光 / 叠质感」对它全是破坏 —— 尤其自发光，
    // 黑石座会因此被提亮成深灰，白纹也就压不住了。这里打一次标记，后面几处一起让路。
    const isStoneSlab = Boolean(preparedMaterial.userData?.homeosStoneSlab);
    // 暖阳原木：给不透明材质补一层与基色同色的微弱自发光，抵消暖色环境光把木色
    // 压灰的问题。布艺（沙发 / 床 / 地毯 / 椅）给 0.12、窗帘浅色布面给 0.38，
    // 其余部件 0.065；透明件不加，否则玻璃会整块糊掉。
    if (
      materialPalette.warmFurniture &&
      preparedMaterial.color &&
      !preparedMaterial.transparent &&
      !isStoneSlab
    ) {
      preparedMaterial.emissive = preparedMaterial.color.clone();
      // 窗帘的「浅色布面」判据按**角色**取（`fabric`），不再是槽位号：
      // 旧判据 `["1","2","3","5"]` 是既有资产的偶然编号，而流水线窗帘的 1 号槽位恰恰是
      // **顶轨**（角色 metal）—— 于是这条自发光打在了金属杆上：帘布只有 0.065、顶轨 0.38，
      // 画面上是一根发光的白杆子挑着一幅暗布。角色换色那条分支早已改成按角色判，
      // 这条自发光漏掉了，症状与它成对出现。
      preparedMaterial.emissiveIntensity =
        modelTypeName.startsWith("curtain_") &&
        parseMaterialSlotAndRole(inputMaterial.name).role === "fabric"
          ? 0.38
          : ["sofa", "bed", "rug", "chair"].includes(modelTypeName)
            ? 0.12
            : 0.065;
    }
    if (
      materialPalette.warmWood &&
      (modelTypeName === "stairs" || modelTypeName === "floatingstairs")
    ) {
      // 暖阳原木：楼梯的木质件换成地板 / 地板描边色，踏面还要自带地板拼板纹理 ——
      // 否则楼梯会是整个场景里唯一一块「没铺地板」的地面。悬空楼梯与直行 stairs 同族，
      // 一并处理，免得它成了画面里唯一一件不跟木色的木质构件。
      // 判据是**角色**：踏面是 top。这里原先按槽位号判（`material-1` 或 `-soft` 后缀），
      // 那是既有资产的偶然编号 —— 楼梯 2026-09 分件重建后踏面仍在 1 号槽位，但那只是巧合，
      // 改一次分件顺序就会把防滑条认成踏面（地板纹理贴到那 2cm 的窄条上）。
      const isWarmFloorTread = parseMaterialSlotAndRole(inputMaterial.name).role === "top";
      preparedMaterial.color?.set?.(
        isWarmFloorTread ? materialPalette.floor : materialPalette.floorEdge
      );
      preparedMaterial.emissive?.copy?.(preparedMaterial.color);
      preparedMaterial.metalness = 0;
      if (isWarmFloorTread) {
        decorateWarmFloor(preparedMaterial, materialPalette);
        preparedMaterial.userData.warmFloorTread = true;
      }
    }
    if (preparedMaterial.userData?.warmFloorTread) {
      // 踏面已由地板着色器负责提亮，自发光再强会过曝，这里单独压低。
      preparedMaterial.emissiveIntensity = 0.075;
    }
    if (preparedMaterial.userData?.warmDiningMaterial) {
      // 餐桌布艺比木面更吃光，给更高的自发光才能在同一盏灯下保持同样的明度。
      preparedMaterial.emissiveIntensity = preparedMaterial.userData.warmDiningFabric ? 0.1 : 0.05;
    }
    // 暖阳原木：柜门侧面（回边）在侧光下会亮成一条白边，注入一段着色器按法线朝向压暗。
    //
    // 判据直接复用 isCabinetDoorMaterial：它与「门板刷白」共用一处定义，两边不会走散。
    if (materialPalette.warmFurniture && isCabinetDoorMaterial(modelTypeName, inputMaterial.name)) {
      preparedMaterial.onBeforeCompile = warmDoorReturnShader => {
        warmDoorReturnShader.vertexShader = warmDoorReturnShader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nwarmDoorFace = abs(normal.z);"
          );
        warmDoorReturnShader.fragmentShader = warmDoorReturnShader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.70, 1.0, smoothstep(0.45, 0.85, warmDoorFace));"
          );
      };
      preparedMaterial.customProgramCacheKey = () => "warm-cabinet-door-returns-v1";
    }
    // 暖阳原木：鞋柜台面曾经要一段着色器切出来 —— 旧资产里它与柜体**共用 3 号槽位**
    //（跨 0~2.205 全高），无法靠换色区分，于是按局部坐标（x ≥ −0.002、y 0.932~0.970）把台面
    // 那一条涂成石材色。那段写死了三个坐标，而这三个数是**按旧几何标定的**：2026-09 鞋柜迁进
    // 流水线后，台面（坐板与敞开中格底面）就是 `material-6-top` 两个真槽位，
    // `isWarmCountertopMaterial` 的角色判据直接命中，着色器与它的三个坐标一并删除。 
    // 原先这里有一段「衣柜白门」着色器：cabinet.glb 当年是一整块木色箱体、没有独立门板几何，
    // 只能在正面按固定尺寸（0.744 / 1.845 写死在 GLSL 里，改尺寸即错位）切出两扇白门。
    // 衣柜 2026-09 分件重建后门板是独立槽位（`material-1-door`），`role === "door"` 这一条
    // 已把它刷成柜门色 —— 那段着色器的判据 `/material-0$/` 在新材质名上永不命中，
    // 已成死代码（且注释还在说「模型里没有独立门板几何」，与现状相反），一并删除。
    //
    // 同一条线上删掉的还有三段：鞋柜台面着色器（`/material-3$/`）、床尾搭毯着色器
    // （`/material-1$/`，床的 1 号现在是**床架**、被褥另有 `fabric` 角色）、
    // 以及玻璃柜 / 书柜背板的槽位判据（见下面那条，已改成按角色）。
    // 它们的共同点：判据按旧资产的槽位号认件，而重建后的材质名一律带角色后缀
    // —— 判据永不命中、静默失效，注释却还在描述旧资产的结构。
    // 原先这里有一段 `modelTypeName === "smallcar"` 的整件车漆分支：暖色主题换暖白漆、
    // 其余情况套 materials/studio-car-finish.js 那层「车漆 / 玻璃 / 车灯」着色器。
    // 那段着色器是为**第三方车模的贴图集**写的（拿贴图里的玻璃岛、灯位、漆面亮度分区，
    // 而且用 position.z 当高度 —— 旧资产 Z 朝上的后遗症），2026-09 小车按流水线规格重建后
    // 既没有贴图、坐标也回到了 Y 朝上，整段判断全部失效：只剩「按 z 分前后半」一层蓝反光。
    // 现在车漆 / 玻璃 / 轮毂 / 轮胎 / 灯 / 格栅各按**角色**取料（见 applyAppliancePalette
    // 的 smallcar 分支），着色器模块与它的法线修订一并删除。
    if (
      (modelTypeName === "glasscabinet" || modelTypeName === "bookcase") &&
      parseMaterialSlotAndRole(inputMaterial.name).role === "interior"
    ) {
      // 暖阳原木：玻璃柜 / 书柜的背板改用柜体木色，避免背板透出基础的冷灰家具色。
      //
      // 判据是**角色 interior**（玻璃柜 2 号槽、书柜 3 号槽），不再是槽位号：
      // 原先写的是 `/^glasscabinet-material-(0|10)$/`（玻璃柜）与 `/^bookcase-material-(0|7)$/`
      // （书柜），那两个槽位号来自旧资产，重建后 0 号是**柜体**、10 与 7 号根本不存在 ——
      // 于是「背板变柜体木色」这件事静默失效，背板一直保持烘焙时的冷灰木色（role interior 的
      // 原色 8a6a4a 与柜体 5a3a22 差得不多，画面上几乎看不出来，所以一直没人发现）。
      preparedMaterial.color?.set?.(
        materialPalette.warmFurniture
          ? materialPalette.cabinetWood ?? materialPalette.wood
          : materialPalette.furniture
      );
      preparedMaterial.transparent = false;
      preparedMaterial.opacity = 1;
      preparedMaterial.depthWrite = true;
      preparedMaterial.depthTest = true;
    }
    // 「档位即组合」：带角色的网格按**自己的角色**取色与质感。计算提前到这里，
    // 是因为下面那层「整件质感」要靠它来判**这一块网格**有没有自己的配方。
    //
    // 石材板例外：它的角色配方（`slab` 色号、染色与光泽）早在 applyFurniturePalette 里就被
    // createStoneSlabMaterial 消费掉了，这里若再套一遍，就会把整块石材改回「一个纯色 +
    // 一层灰纹」—— 正是「黑石座看着不像黑石」的原因。
    const roleRecipe = isStoneSlab ? null : materialRoleRecipe(materialPalette, inputMaterial.name);
    // 逐物件「材质风格」的整件质感层。调色板里带 materialSurface 键时才处理 —— 未选风格（auto）的物件
    // 调色板里根本没有这个键，整段直接跳过，与加这个属性之前逐字节一致。
    // 贴图是均值≈1 的中性灰细节图（见 studio-surface-fabrics.js），乘上去只加纹理、不改色相。
    //
    // 判据是**这一块网格**有没有角色配方，而不是整件物件有没有 materialRoles：
    // materialSurface 的契约本来就是「整件兜底，只对没有角色的网格生效」（见 studio-app.js 的
    // paletteForItemType 注释）。早先按 materialRoles 整件拦，副作用是「只要这个档位按角色写了
    // 组合，连没有角色的老资产也一并失去质感层」—— 那些物件的颜色变了、手感却没变，
    // 看起来就像档位只生效了一半。石材板同样让路：细节层是均值≈1 的灰图，只能压暗不能提亮，
    // 叠到整块石材上等于把纹路洗掉。
    if (materialPalette.materialSurface && !roleRecipe && !isStoneSlab) {
      const surfaceTexture = hasMaterialSurfaceTexture(materialPalette.materialSurface)
        ? createMaterialSurfaceTexture(THREE, materialPalette.materialSurface, {
            maxAnisotropy: 8,
            repeat: 2
          })
        : null;
      if (surfaceTexture) {
        preparedMaterial.map = surfaceTexture;
      }
      if (Number.isFinite(materialPalette.materialRoughness)) {
        preparedMaterial.roughness = materialPalette.materialRoughness;
      }
      if (Number.isFinite(materialPalette.materialMetalness)) {
        preparedMaterial.metalness = materialPalette.materialMetalness;
      }
      // 换了 map 与参数，材质缓存键会跟着变（贴图 uuid 与数值属性都在键里），无需手工失效。
      preparedMaterial.needsUpdate = true;
    }
    // 玻璃件（role = glass）单独收口：玻璃必须**保留自己的玻璃色并保持透明**，不能被上面几层
    // 调色板当成「不透明的家具色」刷掉 —— 这正是先前餐边柜 / 酒柜 / 衣物护理机的玻璃门在暖色
    // 主题下会变成一块实木色板子的原因（warmFurniture 的补色与自发光都只照顾不透明件）。
    //
    // 判据取材质名里的角色（material-N-glass），所以只有流水线按角色分件的资产命中；老资产
    // （材质名里没有角色）走不到这里，行为与加这段之前逐字节相同。
    //
    // 位置在 roleRecipe 之前是刻意的：先还原「槽位基色 + 透明 + 去自发光」，再让风格档位的
    // glass 配方覆盖颜色 —— 透明与光泽归这里，颜色归档位。
    if (parseMaterialSlotAndRole(inputMaterial.name).role === "glass") {
      // 基色回到建模时烘进 GLB 的槽位色（玻璃柜同款的蓝灰），而不是调色板里的木色 / 家具色。
      const bakedGlassColor = inputMaterial.color?.getHex?.();
      if (Number.isFinite(bakedGlassColor)) {
        preparedMaterial.color?.setHex?.(bakedGlassColor);
      }
      preparedMaterial.transparent = true;
      // 与玻璃柜那扇玻璃门取同一个不透明度（0.28）：0.45 那档太实，白门中间的玻璃会读成一块板。
      preparedMaterial.opacity = 0.28;
      // 玻璃双面渲染且不写深度：单面会让门板背面的玻璃消失，写深度则会把柜内挡成一块实色。
      preparedMaterial.depthWrite = false;
      preparedMaterial.depthTest = true;
      preparedMaterial.side = THREE.DoubleSide;
      // 玻璃要亮面反光，不能用柜体木料那套粗糙度。
      preparedMaterial.roughness = 0.12;
      preparedMaterial.metalness = 0.04;
      // 暖阳原木给不透明件补的「与基色同色」自发光会让玻璃自己发亮、整块糊掉，清掉。
      if (preparedMaterial.emissive?.setHex) {
        preparedMaterial.emissive.setHex(0x000000);
        preparedMaterial.emissiveIntensity = 1;
      }
      preparedMaterial.needsUpdate = true;
    }
    // 「档位即组合」：带角色的网格按**自己的角色**取色与质感。
    //
    // 位置是刻意的 —— 放在所有既有分支与整件质感层之后，于是：
    //   - 既有资产与尚未补角色的流水线物件在这里必然不命中，行为与加这段之前逐字节相同；
    //   - 按实物分件的流水线物件（柜体 / 柜面 / 台面 / 拉手各是一个槽位），每一块都拿到自己那份，
    //     整件不再被一个标量刷成一个颜色、一种材质。
    // map 在这里是**显式赋值**（包括赋 null）：烤漆门板必须把上一段整件质感可能留下的木纹清掉，
    // 否则「哑光白门」会带着木纹，比不处理更糟。
    if (roleRecipe) {
      if (Number.isFinite(roleRecipe.color)) {
        preparedMaterial.color?.set?.(roleRecipe.color);
        // 暖阳原木给不透明件补的自发光是「与基色同色」的，换了颜色必须跟着换，
        // 否则新色会被旧自发光压脏（这层自发光正是暖色主题下木色不显灰的原因）。
        if (preparedMaterial.emissive && materialPalette.warmFurniture && !preparedMaterial.transparent) {
          preparedMaterial.emissive = preparedMaterial.color.clone();
        }
      }
      if (Number.isFinite(roleRecipe.roughness)) {
        preparedMaterial.roughness = roleRecipe.roughness;
      }
      if (Number.isFinite(roleRecipe.metalness)) {
        preparedMaterial.metalness = roleRecipe.metalness;
      }
      if (roleRecipe.surface) {
        preparedMaterial.map =
          hasMaterialSurfaceTexture(roleRecipe.surface)
            ? createMaterialSurfaceTexture(THREE, roleRecipe.surface, {
                maxAnisotropy: 8,
                repeat: roleRecipe.repeat ?? 2
              })
            : null;
      }
      preparedMaterial.needsUpdate = true;
    }
    const materialCacheKey = buildMaterialCacheKey(preparedMaterial);
    if (materialCacheByKey.has(materialCacheKey)) {
      materialReuseCount += 1;
      if (preparedMaterial !== inputMaterial) {
        preparedMaterial.dispose?.();
      }
      return materialCacheByKey.get(materialCacheKey);
    } else {
      materialCacheByKey.set(materialCacheKey, preparedMaterial);
      return preparedMaterial;
    }
  }
/**
 * 把一个外部模型实例化并放进场景，成功返回 true。
 * 落地顺序不可调换：模型未加载则先发起加载并返回 false（本次先用过程几何渲染，加载完再重绘）→ 克隆缓存的 scene（共享几何与贴图，只复制节点结构）→ 逐 mesh 处理材质、阴影与渲染顺序（选中态额外克隆材质，避免高亮污染
 * 其它实例）→ 缩放（有 scaleBasis 就按「物件尺寸 / 基准尺寸」分轴缩放，preserveAspect 如钢琴取三轴最小值等比，没配则退回实测尺寸）→ 摆位（preserveOrigin 只做地面贴合，groundAlign 时把包围盒底面抬到 y = 0 再叠 groundOffset；否则重新居中到 XZ 中心、底面贴地）。
 */
  function addExternalItemModel(
    parentObject,
    itemSpec,
    itemPalette,
    { selected: isSelected = false } = {}
  ) {
    const resolvedModelType = modelTypeForItem(itemSpec);
    const modelEntry = loadedModelByType.get(resolvedModelType);
    if (!modelEntry) {
      loadExternalModel(resolvedModelType);
      return false;
    }
    const placedObject = modelEntry.source.clone(true);
    const curtainPosition = /^curtain_(left|right|split)$/.exec(resolvedModelType)?.[1];
    if (curtainPosition) {
      placedObject.userData.curtainRigRoot = true;
    }
    // 原先这里有一段笔记本「屏幕面板贴合」的预处理：老资产把翻盖与屏面做成两块独立几何，
    // 闭合时与机身共面、翻开时沿转轴贴合，作者在参考部件上留了轮廓采样点，
    // 于是运行侧按采样点重映射屏面的顶点（conformGeometryToReference）。
    // 那条路依赖「槽位 1 号 = 屏幕面板、2 号 = 翻盖」这套老资产的编号，而重建后的笔记本
    // 1 号是**转轴**、2 号是**触控板** —— 这条路会把触控板按转轴的轮廓重排顶点
    // （Y 区间被拉伸、Z 被推到斜面偏移上），是一处真实的几何破坏，故整段删除。
    // 新几何的翻盖是规格里自带 -12° 旋转的方盒、屏面各就各位，不需要任何贴合修正。
    placedObject.traverse(mesh => {
      if (!mesh.isMesh) {
        return;
      }
      const originalGeometry = mesh.geometry;
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // 暖阳原木：植物的叶片整簇放大到 1.85 倍 —— 暖色主题的观感偏茂密，
      // 而模型里的叶片是按原尺寸烘死的，只有放大几何才能让树冠站得住。
      if (resolvedModelType === "plant" && itemPalette.warmFurniture) {
        mesh.geometry = enlargeWarmLeaves(mesh.geometry, materialList);
      }
      if (curtainPosition) {
        const curtainPartIndex = Number(/material-(\d+)$/.exec(materialList[0]?.name || "")?.[1]);
        mesh.userData.curtainPart =
          curtainPartIndex === 0
            ? "rod"
            : curtainPartIndex === (curtainPosition === "split" ? 1 : 3)
              ? "cap"
              : (curtainPosition === "split" ? [2, 3] : [4, 5]).includes(curtainPartIndex)
                ? "cloth"
                : "band";
      }
      if (resolvedModelType === "tea_bar_machine" || resolvedModelType === "dishwasher") {
        mesh.geometry = cloneGeometryWithNormals(mesh.geometry);
      }
      /**
       * 选中态额外克隆一份材质用于高亮，未选中则直接共享缓存材质。
       */
      const resolveMeshMaterial = meshMaterialInput => {
        const sharedMaterial = resolveSharedMaterial(
          meshMaterialInput,
          itemPalette,
          resolvedModelType
        );
        return (isSelected && sharedMaterial?.clone?.()) || sharedMaterial;
      };
      // 玻璃件（role = glass）不投影也不接收阴影：three 的阴影通道按**不透明**处理带 transparent
      // 的材质（没有 alphaMap 就没有镂空），一块茶玻门会在台面上盖出一块实心暗矩形。
      // 判据取的是**源材质**（下面换材质之前）的名字，角色名不受调色板影响。
      const hasGlassRole = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(
        meshMaterial => parseMaterialSlotAndRole(meshMaterial?.name).role === "glass"
      );
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(resolveMeshMaterial)
        : resolveMeshMaterial(mesh.material);
      if (
        FURNITURE_PALETTE_ITEM_TYPES.has(resolvedModelType) &&
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(
          materialItem => materialItem?.transparent && materialItem.opacity < 1
        )
      ) {
        // 半透明部件统一排到不透明物之后绘制（renderOrder ≥ 6）：否则同一深度上
        // 它会与身后的不透明面互相穿插，出现一块块斑驳。
        mesh.renderOrder = Math.max(mesh.renderOrder, 6);
      }
      // 地毯是贴地薄片，投影只会多一次无意义的阴影绘制并在地面留下一圈假影，
      // 所以不投影；玻璃楼梯 / 茶玻门的透明件既不投影也不接收阴影，否则透明件上会盖出
      // 一块不透明的暗斑（玻璃件在阴影通道里按不透明走）。
      mesh.castShadow = resolvedModelType !== "rug" && !hasGlassRole;
      mesh.receiveShadow =
        !hasGlassRole &&
        (resolvedModelType !== "glassstairs" || mesh.material?.transparent !== true);
      if (resolvedModelType === "rug") {
        const rugMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // 只有开了 polygonOffset 的贴地地毯才抬到 1：让它在不透明队列里先画，
        // 保证薄片不会盖住地板；未开偏移的地毯保持默认顺序。
        mesh.renderOrder = rugMaterials.some(rugMaterial => rugMaterial?.polygonOffset) ? 1 : 0;
      }
      // 记录几何 / 贴图 / 材质是否与缓存中的源 scene 共享：销毁逻辑据此跳过 dispose，
      // 只释放本实例独有的资源，否则会把仍在被其它实例使用的资源一起释放。
      mesh.userData.externalModelSharedGeometry = mesh.geometry === originalGeometry;
      mesh.userData.externalModelSharedTextures = true;
      mesh.userData.externalModelSharedMaterial = !isSelected;
      if (PILLAR_MODEL_ITEM_TYPES.has(resolvedModelType)) {
        // 立柱在户型里属于**墙**：占位几何把 reflectionRole 标成 wall，于是室内那趟反射
        // 会把柱子连同墙一起隐藏（否则镜面里会立着一根挡视线的柱子）。模型到位后占位几何
        // 整个被顶掉，这个标记也跟着丢了 —— 交出去的柱子会在室内反射里冒出来。
        // 标记必须落在每个网格上：反射那趟是逐节点看的，挂在组上只会命中组节点本身。
        mesh.userData.reflectionRole = "wall";
      }
    });
    const itemDefinition = ALL_ITEM_MODELS[resolvedModelType];
    const scaleBasis =
      Array.isArray(itemDefinition?.scaleBasis) && itemDefinition.scaleBasis.length === 3
        ? {
            x: itemDefinition.scaleBasis[0],
            y: itemDefinition.scaleBasis[1],
            z: itemDefinition.scaleBasis[2]
          }
        : modelEntry.size;
    if (itemDefinition?.preserveAspect) {
      // 等比缩放取三轴最小值：宁可整体略小，也不能让某一轴超出门洞或与邻件穿插。
      const uniformScale = Math.min(
        itemSpec.width / scaleBasis.x,
        itemSpec.height / scaleBasis.y,
        itemSpec.depth / scaleBasis.z
      );
      placedObject.scale.setScalar(uniformScale);
    } else {
      placedObject.scale.set(
        itemSpec.width / scaleBasis.x,
        itemSpec.height / scaleBasis.y,
        itemSpec.depth / scaleBasis.z
      );
    }
    if (itemDefinition?.preserveOrigin) {
      if (itemDefinition?.groundAlign) {
        placedObject.updateMatrixWorld(true);
        const placedBounds = new THREE.Box3().setFromObject(placedObject);
        placedObject.position.y -= placedBounds.min.y;
        placedObject.position.y += finite(itemDefinition.groundOffset, 0);
      }
    } else {
      placedObject.updateMatrixWorld(true);
      const objectBounds = new THREE.Box3().setFromObject(placedObject);
      const objectCenter = objectBounds.getCenter(new THREE.Vector3());
      placedObject.position.set(-objectCenter.x, -objectBounds.min.y, -objectCenter.z);
    }
    parentObject.add(placedObject);
    // 标记外挂模型根：电视要在「机身高度带」里量前脸来定屏幕位置（见 studio-app 的
    // measureTelevisionBodyFrontZ），只该量这个子树 —— 占位几何还留在同一父级下，
    // 移动支架的粗立柱会把屏幕顶到前面去。
    placedObject.userData.externalModelRoot = true;
    return true;
  }
  return {
    addExternalItemModel: addExternalItemModel,
    loadExternalItemModel: loadExternalModel,
    modelTypeForItem: modelTypeForItem,
    modelLoadState: getModelLoadState,
    /**
     * 汇总「这批物件会用到哪些模型类型、各自是否已就绪」，供预加载与测试断言。
     */
    cacheRepresentation(requestedItems) {
      return [...new Set(requestedItems.map(modelTypeForItem).filter(Boolean))]
        .sort()
        .map(modelTypeKey => ({
          type: modelTypeKey,
          definition: ALL_ITEM_MODELS[modelTypeKey],
          loaded: loadedModelByType.has(modelTypeKey)
        }));
    }
  };
}

/**
 * 外部模型（家具 / 家电）的资产表，以及加载、材质替换与落地管线。
 */
import { finite } from "./studio-normalization.js?v=2609271411";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../utils/debug-log.js?v=2609271411";
// 模型模板的跨会话持久缓存与它的信封编解码：同一份 -lite.glb 在同一个浏览器里会被反复解析
import { createModelPersistentCache } from "../model-persistent-cache.js?v=2609271411";
import { modelTemplateKey } from "../model-template-codec.js?v=2609271411";
// 主题专用的两个模块：地板材质着色器增强（场景，看 palette.warmWood）与树叶几何放大
import { decorateWarmFloor } from "../studio/studio-scene-style.js?v=2609271411";
import { enlargeWarmLeaves } from "../materials/studio-warm-foliage.js?v=2609271411";
// 小汽车（上游第三方车模）的整件车漆着色器与法线修订：这台车只有一块网格、一个贴图集材质
import {
  applyCarFinish,
  smoothCarSceneSurface
} from "../materials/studio-car-finish.js?v=2609271411";
// 石材板整图（茶几的两块石板、餐桌台面）：与背景墙的「大理石」共用白色色号那张缓存贴图，
import { createStoneSlabTexture } from "../materials/studio-surface-textures.js?v=2609271411";
// 逐物件「材质风格」的质感贴图（均值≈1 的细节图）：走调色板上的 materialSurface 键。
import {
  createMaterialSurfaceTexture,
  hasMaterialSurfaceTexture
} from "../materials/studio-surface-fabrics.js?v=2609271411";
// 柜类名单与「取色」共用一份（studio-app.js 的 paletteForItemType 也读它）：
import {
  APPLIANCE_FINISH_BY_ITEM_TYPE,
  JOINERY_ITEM_TYPES
} from "../studio/studio-item-types.js?v=2609271411";
// 破缓存只认 URL：模型文件换了内容而**文件名不变**时（重建某个物件就是这么改的），
const HOME_LITE_MODEL_VERSION = "2609271411";
const APPLIANCE_LITE_MODEL_VERSION = "2609271411";
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
 */
const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
/**
 * 柱族的全部**模型类型**键（含方柱）：`pillar` 与 `pillar_<形状>`。
 */
const PILLAR_MODEL_ITEM_TYPES = new Set([
  "pillar",
  ...[...PILLAR_ASSET_SHAPES].map(pillarShape => "pillar_" + pillarShape)
]);
/**
 * 给一块「石材板」几何写一份平面 UV：餐桌那几个模型只有 POSITION / NORMAL，直接贴石材会采到
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
function defineHomeItemModel(modelDir, fileKey, homeModelOverrides) {
  return Object.freeze({
    url: modelAssetUrl(modelDir, fileKey, HOME_LITE_MODEL_VERSION, "lite"),
    fallbackUrl: modelAssetUrl(modelDir, fileKey, HOME_LITE_MODEL_VERSION, "full"),
    ...homeModelOverrides
  });
}
function defineApplianceItemModel(modelDir, fileKey, applianceModelOverrides) {
  return Object.freeze({
    url: modelAssetUrl(modelDir, fileKey, APPLIANCE_LITE_MODEL_VERSION, "lite"),
    fallbackUrl: modelAssetUrl(modelDir, fileKey, APPLIANCE_LITE_MODEL_VERSION, "full"),
    ...applianceModelOverrides
  });
}
const EXTERNAL_ITEM_MODELS = Object.freeze({
  // 沙发：流水线产物（tools/models/model-specs.mjs 的 sofa），底面精确落在 y=0，
  sofa: defineHomeItemModel("furniture", "sofa", {
    scaleBasis: [2.2, 0.82, 0.9],
    preserveOrigin: true
  }),
  coffeetable: defineHomeItemModel("furniture", "coffeetable", {
    scaleBasis: [1.9, 0.5, 1.05],
    preserveOrigin: true
  }),
  squarecoffeetable: defineHomeItemModel("furniture", "squarecoffeetable", {
    scaleBasis: [1.4, 0.46, 0.7],
    preserveOrigin: true
  }),
  tvstand: defineHomeItemModel("furniture", "tvstand", {
    scaleBasis: [1.8, 0.48, 0.42],
    preserveOrigin: true
  }),
  rug: defineHomeItemModel("decor", "rug", {
    scaleBasis: [2, 0.013, 1.4],
    preserveOrigin: true
  }),
  plant: defineHomeItemModel("decor", "plant", {
    // 流水线产物。旧资产实测只有 0.647 × 1.622 × 0.375 —— 进深比声明的 0.75 少了整整一半，
    scaleBasis: [0.75, 1.6, 0.75],
    preserveOrigin: true
  }),
  bed: defineHomeItemModel("furniture", "bed", {
    // 流水线产物（tools/models/model-specs.mjs 的 bed）。这里原先还挂着
    scaleBasis: [1.8, 1.05, 2],
    preserveOrigin: true
  }),
  nightstand: defineHomeItemModel("furniture", "nightstand", {
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("furniture", "vanity", {
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("furniture", "desk", {
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("furniture", "bookcase", {
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  // 小车：**上游第三方车模**（贴图集 + lite 走 Draco），不是流水线产物 —— 它既没有
  smallcar: defineHomeItemModel("vehicle", "car", {
    preserveOrigin: true
  }),
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
  elevator: defineHomeItemModel("structure", "elevator", {
    scaleBasis: [1.4, 2.2, 1.52],
    preserveOrigin: true
  }),
  steelstairs: defineHomeItemModel("structure", "steel-stairs", {
    scaleBasis: [1.86, 3.45, 2.93],
    preserveOrigin: true
  }),
  glassstairs: defineHomeItemModel("structure", "glass-stairs", {
    scaleBasis: [2.51, 3.41, 2.84],
    preserveOrigin: true
  }),
  floatingstairs: defineHomeItemModel("structure", "floating-stairs", {
    scaleBasis: [0.97254264, 2.59010673, 2.2483418],
    preserveOrigin: true
  }),
  piano: defineHomeItemModel("furniture", "piano", {
    // 流水线产物（tools/models/model-specs.mjs 的 piano）。重建前那件是第三方素材：
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
    scaleBasis: [2.4, 0.9, 0.8],
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
 */
export const ALL_ITEM_MODELS = Object.freeze({
  ...EXTERNAL_ITEM_MODELS,
  aquarium: defineHomeItemModel("decor", "aquarium", {
    scaleBasis: [1.5, 1.4, 0.55],
    preserveOrigin: true
  }),
  table: defineHomeItemModel("furniture", "table", {
    scaleBasis: [2.4, 0.82, 1.8],
    preserveOrigin: true
  }),
  rounddiningtable: defineHomeItemModel("furniture", "rounddiningtable", {
    // 流水线产物：车削中柱 + 落地底盘 + 台面围边 + 圆台面 + 四张软包餐椅。
    scaleBasis: [2.2, 0.78, 2.2],
    preserveOrigin: true
  }),
  chair: defineHomeItemModel("furniture", "chair", {
    scaleBasis: [0.5, 0.86, 0.5],
    preserveOrigin: true
  }),
  bar: defineHomeItemModel("furniture", "bar", {
    // 流水线产物：吧台柜 + 踏脚横杆 + 三格敞开酒格 + 三张无靠背吧凳。
    scaleBasis: [2.2, 1.05, 0.65],
    preserveOrigin: true
  }),
  sideboard: defineHomeItemModel("furniture", "sideboard", {
    scaleBasis: [1.6, 2.2, 0.45],
    preserveOrigin: true
  }),
  shoecabinet: defineHomeItemModel("furniture", "shoecabinet", {
    scaleBasis: [1.8, 2.25, 0.42],
    preserveOrigin: true
  }),
  cabinet: defineHomeItemModel("furniture", "cabinet", {
    scaleBasis: [1.6, 1.9, 0.45],
    preserveOrigin: true
  }),
  glasscabinet: defineHomeItemModel("furniture", "glasscabinet", {
    scaleBasis: [1.2, 1.9, 0.4],
    preserveOrigin: true
  }),
  shelf: defineHomeItemModel("furniture", "shelf", {
    scaleBasis: [1.2, 1.8, 0.45],
    preserveOrigin: true
  }),
  wallcabinet: defineHomeItemModel("furniture", "wallcabinet", {
    scaleBasis: [1.5, 0.82, 0.35],
    preserveOrigin: true
  }),
  kitchenbase: defineHomeItemModel("furniture", "kitchenbase", {
    scaleBasis: [2.4, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchensink: defineHomeItemModel("furniture", "kitchensink", {
    // 流水线产物：与地柜同一套柜体，台面开孔嵌一只不锈钢台下盆（盆体是独立的 `sink` 角色）。
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchencooktop: defineHomeItemModel("furniture", "kitchencooktop", {
    // 流水线产物：与地柜同一套柜体，台面开孔里坐着一块低于台面 1cm 的灶面板（下嵌灶），
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
  freezer: defineApplianceItemModel("appliance", "freezer", {
    scaleBasis: [1.05, 0.85, 0.6],
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
  "floatingstairs",
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
  "freezer",
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
 */
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
const AUTHORED_COLOR_ONLY_RECIPE = Object.freeze({});
const MIRROR_MATERIAL_RECIPE = Object.freeze({ roughness: 0.08, metalness: 0.35 });
const AUTHORED_COLOR_MATERIAL_ROLE_RECIPES = Object.freeze({
  book: AUTHORED_COLOR_ONLY_RECIPE,
  stash: AUTHORED_COLOR_ONLY_RECIPE,
  accent: AUTHORED_COLOR_ONLY_RECIPE,
  mirror: MIRROR_MATERIAL_RECIPE
});
// 3. 另有专管，默认档位下不经过亮度兜底：五金（下面那条按角色的五金分支）、玻璃（透明分支）、
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
  "freezer",
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
 */
const APPLIANCE_ROLE_TONE_BY_ITEM_TYPE = Object.freeze({
  // 显示器：机身 / 底座 / 键面走柔光银，支架压深。屏面由「screen 统一压暗」那条处理。
  desktop: Object.freeze({ base: "soft", body: "soft", grating: "soft", metal: "dark" }),
  // 笔记本：机身与转轴银，触控板与键面压深（屏面同样交给 screen 那条）。
  laptop: Object.freeze({ body: "soft", metal: "soft", trim: "dark", grating: "dark" }),
  nas: Object.freeze({ body: "soft", drawer: "soft" }),
  // 电视三件：整件一族深色（屏面另有专门的贴图通道，不走这里）。显式列出来是为了让
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
  "smallcar",
  "piano",
  // 柱族五件：材质要跟着**墙色**走（见 applyAppliancePalette 的柱分支）。它们原先不进
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
  chair: Object.freeze({ leg: "wood", frame: "wood", upholstery: "sage" })
});
/**
 * 上面那张角色表的**老资产回落**：还没有迁进流水线的餐桌 / 餐椅（没有角色后缀）按槽位号取语义。
 */
const WARM_DINING_MATERIAL_TABLE = Object.freeze({});
/**
 * 「石材板」所在的材质槽位与**默认色号**：键是模型类型，值是「槽位下标 → 色号」。
 */
const STONE_SLAB_FLAVOR_BY_MODEL_SLOT = Object.freeze({
  table: Object.freeze({ 0: "marble" }),
  // 组合茶几：上白石、下黑石 —— 与实物照片一致（白石板压在黑石座上）。
  coffeetable: Object.freeze({ 0: "marble", 1: "marble-dark" }),
  rounddiningtable: Object.freeze({ 0: "marble" }),
  rounddiningtable_turntable: Object.freeze({ 0: "marble", 3: "marble", 4: "marble" }),
  desk: Object.freeze({ 1: "marble" })
});
const STONE_SLAB_FINISH_BY_FLAVOR = Object.freeze({
  marble: Object.freeze({ roughness: 0.24, metalness: 0.03 }),
  "marble-dark": Object.freeze({ roughness: 0.18, metalness: 0.04 })
});
/**
 * 某个模型是否有关键部件要走石材板。装载期（补 UV）与材质替换期（换材质）都先问这里，
 */
function hasStoneSlab(modelType) {
  return STONE_SLAB_FLAVOR_BY_MODEL_SLOT[modelType] !== undefined;
}
/**
 * 取某一块网格的石材规格；不是石材板则返回 null。装载期补 UV 与材质替换期换材质必须走同一判据：
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
 */
function isCabinetDoorMaterial(modelType, materialName) {
  return parseMaterialSlotAndRole(materialName).role === "door";
}
/**
 * 「暖阳原木」主题下的台面判据：`material-<槽位>-top` 就是台面。
 */
function isWarmCountertopMaterial(modelType, materialName) {
  return parseMaterialSlotAndRole(materialName).role === "top";
}
/**
 * 从材质名里取出「槽位号 + 角色」。
 */
function parseMaterialSlotAndRole(materialName) {
  const matched = String(materialName || "")
    .toLowerCase()
    .match(/material-(\d+)(?:-([a-z][a-z0-9]*))?$/);
  return { slot: matched?.[1], role: matched?.[2] };
}
/**
 * 「档位即组合」：取某块网格**自己那个角色**的配方。
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
  const loadedModelByType = new Map();
  const pendingLoadByType = new Map();
  const preparedRestoreByType = new Map();
  const loadQueue = [];
  const materialCacheByKey = new Map();
  const concurrencyLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2)));
  const effectiveTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  // 持久缓存最多等这么久（毫秒）：命中就省掉一次下载 + 解析，读不出来也必须立刻转回真实加载器 ——
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
   */
  function loadExternalModel(modelType) {
    if (deferralHost?.isDeferred() && !deferralHost.isReleasing()) {
      // 首屏延后加载：只登记需求并立刻返回 null，让调用方本次先用过程几何渲染。
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
        if (hasStoneSlab(modelType)) {
          // 石材板要贴整块石材整图，而这些模型要么没有 UV、要么带的是「每面各贴一遍」的立方体 UV：
          applyStoneSlabPlanarUv(THREE, loadedScene, modelType);
        }
        if (modelType === "smallcar") {
          // 小车：上游第三方车模的法线按**平面**烘焙，车顶与翼子板直接渲染会出现一圈圈硬棱线，
          smoothCarSceneSurface(THREE, loadedScene);
        }
        loadedScene.updateMatrixWorld(true);
        const modelSize = new THREE.Box3().setFromObject(loadedScene).getSize(new THREE.Vector3());
        // 尺寸无效（NaN / 0 / 负值）说明模型是空壳或缩放为 0，按加载失败处理：
        if (
          ![modelSize.x, modelSize.y, modelSize.z].every(
            dimension => Number.isFinite(dimension) && dimension > 0.001
          )
        ) {
          throw new Error("模型 " + modelType + " 的尺寸无效");
        }
        const modelCacheEntry = {
          source: loadedScene,
          size: modelSize
        };
        loadedModelByType.set(modelType, modelCacheEntry);
        // 写回持久缓存：下一次打开就不必再下载与解析这份几何。空闲时执行、失败静默，
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
      .finally(() => pendingLoadByType.delete(modelType));
    pendingLoadByType.set(modelType, loadPromise);
    return loadPromise;
  }
/**
 * 按原材质的亮度把它归入调色板的某个明度档，生成家具用的标准材质。
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
  const stoneSlabTextureByFlavor = new Map();
  /**
   * 生成（或复用）石材板材质：整块石材自带颜色，材质基色取白（配方给了 color 就当作染色），
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
    slabMaterial.userData.homeosStoneSlab = flavor;
    return slabMaterial;
  }
/**
 * 给家具类材质挑调色板颜色：依据「材质名 + 类型 + 原色亮度」三路信息决定。
 */
  function applyFurniturePalette(meshMaterial, inputPalette, furnitureItemType) {
    // 暖阳原木：柜类整件走柜体木色而不是基础家具灰，先把 wood 兜到 cabinetWood，
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
    if (furnitureItemType === "shower" && paletteColors.showerMetal !== undefined) {
      return createFurnitureMaterial(meshMaterial, paletteColors.showerMetal, {
        roughness: 0.48,
        metalness: 0.3
      });
    }
    // 石材板：整块石材（茶几的两块石板、餐桌台面）。位置放在木色槽位表**之前** ——
    const stoneSlabSpec = paletteColors.warmFurniture
      ? stoneSlabSpecFor(paletteColors, furnitureItemType, materialName)
      : null;
    if (stoneSlabSpec) {
      return createStoneSlabMaterial(meshMaterial, stoneSlabSpec);
    }
    // 暖阳原木：餐桌 / 餐椅按**角色**换成木色或亚麻，而不是沿用家具三档灰。
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
    const { role: paletteRole } = parseMaterialSlotAndRole(materialName);
    const authoredColorRecipe =
      paletteRole === undefined ? null : AUTHORED_COLOR_MATERIAL_ROLE_RECIPES[paletteRole] ?? null;
    // 「取规格原色」这条只在颜色确实来自规格时才带上配方里的质感：后段的类型分支（洁具整件走
    let authoredColorOverride = null;
    let chosenColor = paletteColors.furniture;
    if (/^curtain_(left|right|split)$/.test(furnitureItemType)) {
      // 按角色分：帘布是织物（柔光档），顶轨与支架是五金（压深一档）。
      const { role: curtainRole } = parseMaterialSlotAndRole(materialName);
      chosenColor = curtainRole === "fabric" ? paletteColors.furnitureSoft : paletteColors.furnitureDark;
    } else if (furnitureItemType === "squarecoffeetable") {
      // 方茶几只有一个「台面 + 四腿」的构造，仍按命名分档取色。
      chosenColor = materialName.endsWith("-dark")
        ? paletteColors.furnitureDark
        : materialName.endsWith("-light") || materialName.endsWith("-soft")
          ? paletteColors.furnitureSoft
          : paletteColors.furniture;
    } else if (furnitureItemType === "piano") {
      // 钢琴：琴身 / 顶盖 / 腰线 / 琴腿取深档（实物不是亮光黑就是深木），白键是整件唯一的亮面，
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
      const { role: diningTableRole } = parseMaterialSlotAndRole(materialName);
      chosenColor =
        diningTableRole === "top" || diningTableRole === "cushion"
          ? paletteColors.furnitureSoft
          : paletteColors.furniture;
    } else if (furnitureItemType === "basin") {
      // 台盆：陶瓷盆体是整件最白的一块（`body` 角色），石材台面次之，五金拉手与龙头走钢色。
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
      if (furnitureItemType === "bed") {
        // 木脚与床架箱体是木作，床垫 / 床头板 / 被褥 / 枕头都是织物。
        const { role: bedRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          bedRole === "leg" || bedRole === "frame" ? paletteColors.wood : paletteColors.furnitureLight;
      }
      if (furnitureItemType === "sofa") {
        // 木脚与座台木框是木作，其余（座箱 / 靠背 / 扶手 / 坐垫 / 抱枕）是织物。
        const { role: sofaRole } = parseMaterialSlotAndRole(materialName);
        chosenColor =
          sofaRole === "leg" || sofaRole === "frame"
            ? paletteColors.wood
            : paletteColors.sofaFabric ?? paletteColors.furnitureLight;
      }
      if (furnitureItemType === "cabinet") {
        // 按**角色**分料：拉手是五金、踢脚压深一档、柜体（含中缝 trim）走棕褐柜体色。
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
        const { role: nightstandRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = nightstandRole === "metal" ? FURNITURE_HARDWARE_TONE : paletteColors.wood;
      }
      if (["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)) {
        const { role: diningFallbackRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = diningFallbackRole === "metal" ? paletteColors.applianceSoft : paletteColors.wood;
      }
      if (furnitureItemType === "tvstand") {
        // 按角色分料：五金件（拉手 / 脚）走深色，其余（柜体、踢脚、抽屉面、内衬、搁板）走木色，
        const { role: tvStandRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = tvStandRole === "metal" ? FURNITURE_HARDWARE_TONE : paletteColors.wood;
      }
      if (furnitureItemType === "sideboard") {
        chosenColor = paletteColors.wood;
      }
      // 原先这里还有一条 `bookcase && 槽位号 >= 11` 的分支：老资产的 11 号往后是书脊 / 摆件
      if (furnitureItemType === "plant") {
        // 2026-09 起 plant 是流水线产物，材质名带角色。旧判据读的全是既有资产的命名
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
        const { role: curtainRole } = parseMaterialSlotAndRole(materialName);
        chosenColor = curtainRole === "fabric" ? 16776696 : paletteColors.furnitureDark;
      }
      if (furnitureItemType === "aquarium") {
        // 鱼缸原先一条暖色覆盖都没有：柜体、踢脚、缸框、拉手会一起落进基础家具灰，
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
    const isCabinetDoor =
      paletteColors.warmFurniture && isCabinetDoorMaterial(furnitureItemType, materialName);
    if (isCabinetDoor) {
      chosenColor = paletteColors.cabinetDoor ?? 16777215;
    }
    // isSoftRug 原先在这里：给地毯那块**贴花内衬**材质加 polygonOffset，压住它与毯底之间的
    const isTransparentMaterial =
      materialName.endsWith("-glass") ||
      meshMaterial?.transparent === true ||
      (meshMaterial?.opacity ?? 1) < 1;
    if (paletteColors.warmFurniture && isTransparentMaterial) {
      chosenColor = paletteColors.glass;
    }
    // 「取规格原色」的角色（内容物 / 陈设撞色件 / 镜面）还各自带质感。只在颜色确实还是规格
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
      opacity: isTransparentMaterial ? (paletteColors.warmFurniture ? meshMaterial.opacity : 0.42) : 1,
      depthWrite: !isTransparentMaterial
    });
  }
/**
 * 生成楼梯专用材质：玻璃件走半透明，其余走框架色。
 */
  function createStairMaterial(existingMaterial, stairPalette, stairItemType) {
    if (!existingMaterial) {
      return existingMaterial;
    }
    const { role: stairRole } = parseMaterialSlotAndRole(existingMaterial.name);
    if (stairItemType === "glassstairs" && stairRole === "glass") {
      const glassStairMaterial = new THREE.MeshStandardMaterial({
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
      const applianceChroma =
        Math.max(applianceBaseColor.r, applianceBaseColor.g, applianceBaseColor.b) -
        Math.min(applianceBaseColor.r, applianceBaseColor.g, applianceBaseColor.b);
      const keepsOriginalColor =
        APPLIANCE_FINISH_BY_ITEM_TYPE[applianceItemType] !== undefined && applianceChroma > 0.2;
      // 两盏灯（壁灯 / 落地灯）的取色单独走：壁灯的灯罩内面取强调色，
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
                  ?
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
      // 小车。两条互斥的路：
      const { role: carRole } = parseMaterialSlotAndRole(baseMaterial?.name);
      if (!carRole) {
        return baseMaterial.clone?.() || baseMaterial;
      }
      if (carRole === "glass") {
        // 玻璃的透明与颜色由 resolveSharedMaterial 的玻璃分支统一收口（这一支只负责透明标记），
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
            // 调色板参数名是 appliancePalette（全文件唯一调用点传的就是 materialPalette，
            // 见 resolveSharedMaterial）—— 这里曾误写成 materialPalette，函数里没有那个绑定，
            // 小车一走这一支就 ReferenceError。
            new THREE.Color(
              appliancePalette.warmWood === true ? 16776696 : appliancePalette.applianceSoft
            )
          : carRole === "metal"
            ? new THREE.Color(appliancePalette.appliance)
            : carRole === "grating"
              ? new THREE.Color(appliancePalette.applianceDark)
              :
                baseMaterial?.color?.clone?.() || new THREE.Color(2237995);
      const carMaterial = createFurnitureMaterial(baseMaterial, carColor, {
        roughness: carRole === "body" ? 0.28 : carRole === "metal" ? 0.26 : carRole === "trim" ? 0.86 : 0.5,
        metalness: carRole === "body" ? 0.34 : carRole === "metal" ? 0.6 : carRole === "trim" ? 0.02 : 0.3
      });
      if (carRole === "body") {
        // 车漆的高光靠「低粗糙度 + 中金属度 + 一点与基色同色的自发光」在无环境贴图的场景里
        carMaterial.emissive = carMaterial.color.clone();
        carMaterial.emissiveIntensity = appliancePalette.warmWood === true ? 0.1 : 0.06;
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
 */
  function resolveSharedMaterial(inputMaterial, materialPalette, modelTypeName) {
    if (!inputMaterial) {
      return inputMaterial;
    }
    // 暖阳原木：家具类（不只是家电与自定义材质类）也要按件换材质 —— 暖色主题给每种
    const preparedMaterial =
      CUSTOM_MATERIAL_ITEM_TYPES.has(modelTypeName) ||
      APPLIANCE_PALETTE_ITEM_TYPES.has(modelTypeName) ||
      (materialPalette.warmFurniture && HOME_PALETTE_ITEM_TYPES.has(modelTypeName))
        ? applyAppliancePalette(inputMaterial, materialPalette, modelTypeName)
        : inputMaterial.clone?.() || inputMaterial;
    // 石材板：外观已由整块石材整图决定（颜色在贴图里，材质基色只是白或一层薄染色），
    const isStoneSlab = Boolean(preparedMaterial.userData?.homeosStoneSlab);
    // 暖阳原木：给不透明材质补一层与基色同色的微弱自发光，抵消暖色环境光把木色
    if (
      materialPalette.warmFurniture &&
      preparedMaterial.color &&
      !preparedMaterial.transparent &&
      !isStoneSlab
    ) {
      preparedMaterial.emissive = preparedMaterial.color.clone();
      // 窗帘的「浅色布面」判据按**角色**取（`fabric`），不再是槽位号：
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
    if (
      (modelTypeName === "glasscabinet" || modelTypeName === "bookcase") &&
      parseMaterialSlotAndRole(inputMaterial.name).role === "interior"
    ) {
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
    const roleRecipe = isStoneSlab ? null : materialRoleRecipe(materialPalette, inputMaterial.name);
    // 逐物件「材质风格」的整件质感层。调色板里带 materialSurface 键时才处理 —— 未选风格（auto）的物件
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
    if (roleRecipe) {
      if (Number.isFinite(roleRecipe.color)) {
        preparedMaterial.color?.set?.(roleRecipe.color);
        // 暖阳原木给不透明件补的自发光是「与基色同色」的，换了颜色必须跟着换，
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
    // 小车（上游第三方车模 `car_tms`）：整件套一层车漆 / 玻璃 / 车灯着色器。
    if (modelTypeName === "smallcar" && !parseMaterialSlotAndRole(inputMaterial?.name).role) {
      if (materialPalette.warmWood) {
        // 暖阳原木：车漆换暖白（0xfffdf8 = 255/253/248），并把贴图兼作自发光 —— 让车在暖色场景
        preparedMaterial.color?.set?.(0xfffdf8);
        preparedMaterial.roughness = 0.38;
        preparedMaterial.metalness = 0.02;
        preparedMaterial.emissiveMap = preparedMaterial.map;
        preparedMaterial.emissiveIntensity = 0.08;
        // 上面「不透明件补同色自发光」是按换色**之前**的基色（白）写的，换了漆色必须跟着换 ——
        if (preparedMaterial.emissive?.copy && preparedMaterial.color) {
          preparedMaterial.emissive.copy(preparedMaterial.color);
        }
      }
      applyCarFinish(preparedMaterial, { pearlWhite: materialPalette.warmWood === true });
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
    placedObject.traverse(mesh => {
      if (!mesh.isMesh) {
        return;
      }
      const originalGeometry = mesh.geometry;
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // 暖阳原木：植物的叶片整簇放大到 1.85 倍 —— 暖色主题的观感偏茂密，
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
        mesh.renderOrder = Math.max(mesh.renderOrder, 6);
      }
      // 地毯是贴地薄片，投影只会多一次无意义的阴影绘制并在地面留下一圈假影，
      mesh.castShadow = resolvedModelType !== "rug" && !hasGlassRole;
      mesh.receiveShadow =
        !hasGlassRole &&
        (resolvedModelType !== "glassstairs" || mesh.material?.transparent !== true);
      if (resolvedModelType === "rug") {
        const rugMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // 只有开了 polygonOffset 的贴地地毯才抬到 1：让它在不透明队列里先画，
        mesh.renderOrder = rugMaterials.some(rugMaterial => rugMaterial?.polygonOffset) ? 1 : 0;
      }
      // 记录几何 / 贴图 / 材质是否与缓存中的源 scene 共享：销毁逻辑据此跳过 dispose，
      mesh.userData.externalModelSharedGeometry = mesh.geometry === originalGeometry;
      mesh.userData.externalModelSharedTextures = true;
      mesh.userData.externalModelSharedMaterial = !isSelected;
      if (PILLAR_MODEL_ITEM_TYPES.has(resolvedModelType)) {
        // 立柱在户型里属于**墙**：占位几何把 reflectionRole 标成 wall，于是室内那趟反射
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

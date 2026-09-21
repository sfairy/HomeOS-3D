/**
 * 外部模型（家具 / 家电）的资产表，以及加载、材质替换与落地管线。
 *
 * 每种类型对应两个 GLB：主资源是构建产出的 -lite.glb（Draco 压缩），fallbackUrl 是同目录完整版，两条路径
 * 都走同一个 GLTFLoader、解压在同源 Worker 里完成，因此这里只关心「用哪个 URL」。
 * 单位与坐标：模型 scaleBasis 与物件规格的宽 / 高 / 深一律是米，模型以作者原点（通常底面中心）为基准；
 * 平面像素→场景米的换算在 studio-app.js 完成，本文件只处理场景米。
 * 生命周期：模型按类型缓存、克隆体共享几何与贴图，等价材质收敛成一份并缓存，重复副本立即 dispose，
 * 避免显存随物件数量线性增长（销毁逻辑靠实例上的 externalModelShared* 标记判断）。
 */
import {
  applyCarFinish,
  smoothCarSurfaceNormals
} from "../materials/studio-car-finish.js?v=2609212100";
import {
  repairGlassCabinetBack,
  repairWallCabinetSides
} from "../materials/studio-cabinet-back.js?v=2609212100";
import { finite } from "./studio-normalization.js?v=2609212100";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../utils/debug-log.js?v=2609212100";
// 暖阳原木（warm-wood）主题专用的两个模块：地板材质着色器增强与树叶几何放大。
// 两者都只在 palette.warmWood 为真时被调用，其它主题下不产生任何效果。
import { decorateWarmFloor } from "../studio/studio-scene-style.js?v=2609212100";
import { enlargeWarmLeaves } from "../materials/studio-warm-foliage.js?v=2609212100";
const HOME_LITE_MODEL_VERSION = "2609212100";
const APPLIANCE_LITE_MODEL_VERSION = "2609212100";
/**
 * 自带独立 GLB 资源的异形柱形：方形柱沿用原先烘焙好的方盒，因此仍留在普通的
 * "pillar" 模型上，物件本身的行为保持不变。
 */
const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
/**
 * 把床的底座几何在水平方向内缩 0.4%，消除与床垫共面导致的闪烁（z-fighting）。
 * 只对「已知那一版床模型」生效：先校验包围盒（高 0.186m、宽 1.8m、深 2m，容差 0.002m），不符合就原样返回 —— 这条修订按旧版床的比例写死，上游换模型必须重新标定，宁可不动也不能凭尺寸猜着缩。内缩用「平移到中心
 * → 缩放 → 平移回去」，因为 BufferGeometry.scale 以原点为中心，直接缩放会把底座原有的偏移一起放大。
 */
function insetBedBaseGeometry(bedBaseGeometry) {
  if (!bedBaseGeometry?.attributes?.position) {
    return bedBaseGeometry;
  }
  bedBaseGeometry.computeBoundingBox();
  const { min: boundingBoxMin, max: boundingBoxMax } = bedBaseGeometry.boundingBox;
  if (
    Math.abs(boundingBoxMin.y) > 0.002 ||
    Math.abs(boundingBoxMax.y - 0.186) > 0.002 ||
    Math.abs(boundingBoxMax.x - boundingBoxMin.x - 1.8) > 0.002 ||
    Math.abs(boundingBoxMax.z - boundingBoxMin.z - 2) > 0.002
  ) {
    return bedBaseGeometry;
  }
  const insetGeometry = bedBaseGeometry.clone();
  // 先平移到几何中心再缩放、最后平移回去：BufferGeometry.scale 以原点为中心，
  // 直接缩放会把底座原有的偏移也一起放大。
  const centerX = (boundingBoxMin.x + boundingBoxMax.x) / 2;
  // Z 方向同理，与 X 一起构成在床垫下方的一次均匀内缩。
  const centerZ = (boundingBoxMin.z + boundingBoxMax.z) / 2;
  insetGeometry
    .translate(-centerX, 0, -centerZ)
    .scale(0.996, 1, 0.996)
    .translate(centerX, 0, centerZ);
  insetGeometry.computeBoundingBox();
  insetGeometry.computeBoundingSphere();
  return insetGeometry;
}
/**
 * 生成「家居类」模型定义：主资源用 -lite 轻量版，回退到完整版。
 * 两个 URL 都带 ?v= 版本戳（破缓存），版本号由调用方按发布时间传入，换模型必须同步更新，否则浏览器会继续
 * 用旧资源。返回前 Object.freeze 冻结：这张表是模块级常量、被多处按类型查表，冻结可避免意外改写。
 */
function defineHomeItemModel(homeModelKey, homeFallbackVersion, homeModelOverrides) {
  return Object.freeze({
    url:
      "/static/3d-studio/models/" + homeModelKey + "-lite.glb?v=" + HOME_LITE_MODEL_VERSION,
    fallbackUrl:
      "/static/3d-studio/models/" + homeModelKey + ".glb?v=" + homeFallbackVersion,
    ...homeModelOverrides
  });
}
/**
 * 生成「电器类」模型定义：与家居类同构，区别只是轻量版与完整版共用一个版本常量（APPLIANCE_LITE_MODEL_VERSION，而非各自传入），因为两者由同一次构建产出。
 * 单独一个函数是为了让日后家电与家具分开更新时不必回头改表结构。
 */
function defineApplianceItemModel(applianceModelKey, applianceModelOverrides) {
  return Object.freeze({
    url:
      "/static/3d-studio/models/" +
      applianceModelKey +
      "-lite.glb?v=" +
      APPLIANCE_LITE_MODEL_VERSION,
    fallbackUrl:
      "/static/3d-studio/models/" +
      applianceModelKey +
      ".glb?v=2609212100",
    ...applianceModelOverrides
  });
}
const EXTERNAL_ITEM_MODELS = Object.freeze({
  sofa: {
    url: "/static/3d-studio/models/sofa-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/sofa.glb?v=2609212100",
    scaleBasis: [2.2, 0.82, 0.9],
    preserveOrigin: true,
    groundAlign: true,
    groundOffset: -0.008
  },
  coffeetable: defineHomeItemModel("coffeetable", "2609212100", {
    scaleBasis: [1.7, 0.5, 1.25],
    preserveOrigin: true
  }),
  squarecoffeetable: defineHomeItemModel("squarecoffeetable", "2609212100", {
    url: "/static/3d-studio/models/squarecoffeetable-lite.glb?v=2609212100",
    fallbackUrl:
      "/static/3d-studio/models/squarecoffeetable.glb?v=2609212100",
    scaleBasis: [1.4, 0.46, 0.7],
    preserveOrigin: true
  }),
  tvstand: defineHomeItemModel("tvstand", "2609212100", {
    url: "/static/3d-studio/models/tvstand-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/tvstand.glb?v=2609212100",
    scaleBasis: [1.8, 0.48, 0.42],
    preserveOrigin: true
  }),
  rug: defineHomeItemModel("rug", "2609212100", {
    scaleBasis: [2, 0.012, 1.4],
    preserveOrigin: true
  }),
  plant: defineHomeItemModel("plant", "2609212100", {
    scaleBasis: [0.75, 1.6, 0.75],
    preserveOrigin: true
  }),
  bed: defineHomeItemModel("bed", "2609212100", {
    scaleBasis: [1.8, 0.62, 2],
    preserveOrigin: true,
    geometryRevision: "20260908-base-inset-v1"
  }),
  nightstand: defineHomeItemModel("nightstand", "2609212100", {
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("vanity", "2609212100", {
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("desk", "2609212100", {
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("bookcase", "2609212100", {
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  smallcar: {
    url: "/static/3d-studio/models/car-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/car.glb?v=2609212100"
  },
  airoutlet: {
    url: "/static/3d-studio/models/air-outlet-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/air-outlet.glb?v=2609212100"
  },
  pipelinewaterpurifier: {
    url: "/static/3d-studio/models/pipeline-water-purifier-lite.glb?v=2609212100",
    fallbackUrl:
      "/static/3d-studio/models/pipeline-water-purifier.glb?v=2609212100"
  },
  tea_bar_machine: {
    url: "/static/3d-studio/models/tea-bar-machine-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/tea-bar-machine.glb?v=2609212100"
  },
  elevator: {
    url: "/static/3d-studio/models/elevator-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/elevator.glb?v=2609212100"
  },
  steelstairs: {
    url: "/static/3d-studio/models/steel-stairs-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/steel-stairs.glb?v=2609212100"
  },
  glassstairs: {
    url: "/static/3d-studio/models/glass-stairs-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/glass-stairs.glb?v=2609212100"
  },
  piano: {
    url: "/static/3d-studio/models/piano-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/piano.glb?v=2609212100",
    materialRevision: "20260914-piano-surface-shadow-v1",
    preserveAspect: true
  }
});
export const ALL_ITEM_MODELS = Object.freeze({
  ...EXTERNAL_ITEM_MODELS,
  bed: defineHomeItemModel("bed", "2609212100", {
    scaleBasis: [1.8, 0.62, 2],
    preserveOrigin: true,
    geometryRevision: "20260908-base-inset-v1"
  }),
  nightstand: defineHomeItemModel("nightstand", "2609212100", {
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("vanity", "2609212100", {
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("desk", "2609212100", {
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("bookcase", "2609212100", {
    url: "/static/3d-studio/models/bookcase-lite.glb?v=2609212100",
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  aquarium: defineHomeItemModel("aquarium", "2609212100", {
    scaleBasis: [1.5, 1.4, 0.55],
    preserveOrigin: true
  }),
  table: defineHomeItemModel("table", "2609212100", {
    scaleBasis: [2.4, 0.82, 1.8],
    preserveOrigin: true
  }),
  rounddiningtable: defineHomeItemModel("rounddiningtable", "2609212100", {
    scaleBasis: [2.2, 0.78, 2.2],
    preserveOrigin: true
  }),
  chair: defineHomeItemModel("chair", "2609212100", {
    scaleBasis: [0.5, 0.86, 0.5],
    preserveOrigin: true
  }),
  bar: defineHomeItemModel("bar", "2609212100", {
    scaleBasis: [2.2, 1.05, 0.65],
    preserveOrigin: true
  }),
  sideboard: defineHomeItemModel("sideboard", "2609212100", {
    scaleBasis: [1.6, 2.2, 0.45],
    preserveOrigin: true
  }),
  shoecabinet: defineHomeItemModel("shoecabinet", "2609212100", {
    scaleBasis: [1.8, 2.25, 0.42],
    preserveOrigin: true
  }),
  cabinet: defineHomeItemModel("cabinet", "2609212100", {
    scaleBasis: [1.6, 1.9, 0.45],
    preserveOrigin: true
  }),
  glasscabinet: defineHomeItemModel("glasscabinet", "2609212100", {
    url: "/static/3d-studio/models/glasscabinet-lite.glb?v=2609212100",
    scaleBasis: [1.2, 1.9, 0.4],
    preserveOrigin: true
  }),
  shelf: defineHomeItemModel("shelf", "2609212100", {
    scaleBasis: [1.2, 1.8, 0.45],
    preserveOrigin: true
  }),
  wallcabinet: defineHomeItemModel("wallcabinet", "2609212100", {
    url: "/static/3d-studio/models/wallcabinet-lite.glb?v=2609212100",
    scaleBasis: [1.5, 0.82, 0.35],
    preserveOrigin: true
  }),
  kitchenbase: defineHomeItemModel("kitchenbase", "2609212100", {
    scaleBasis: [2.4, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchensink: defineHomeItemModel("kitchensink", "2609212100", {
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchencooktop: defineHomeItemModel("kitchencooktop", "2609212100", {
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  basin: defineHomeItemModel("basin", "2609212100", {
    scaleBasis: [0.9, 0.88, 0.5],
    preserveOrigin: true
  }),
  toilet: defineHomeItemModel("toilet", "2609212100", {
    scaleBasis: [0.42, 0.52, 0.7],
    preserveOrigin: true
  }),
  squattoilet: defineHomeItemModel("squattoilet", "2609212100", {
    scaleBasis: [0.45, 0.18, 0.65],
    preserveOrigin: true
  }),
  urinal: defineHomeItemModel("urinal", "2609212100", {
    scaleBasis: [0.38, 0.72, 0.34],
    preserveOrigin: true
  }),
  shower: defineHomeItemModel("shower", "2609212100", {
    scaleBasis: [0.9, 2.1, 0.9],
    preserveOrigin: true
  }),
  bathtub: defineHomeItemModel("bathtub", "2609212100", {
    scaleBasis: [1.7, 0.58, 0.78],
    preserveOrigin: true
  }),
  glasspartition: defineHomeItemModel("glasspartition", "2609212100", {
    scaleBasis: [1.2, 2, 0.08],
    preserveOrigin: true
  }),
  stairs: defineHomeItemModel("stairs", "2609212100", {
    scaleBasis: [1, 1.65, 2.8],
    preserveOrigin: true
  }),
  pillar: defineHomeItemModel("pillar", "2609212100", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  // 异形柱必须有真实资源：替换外部模型时，程序化生成的柱体会被加载进来的 GLB 顶掉，而一个烘焙成方盒的模型会悄悄把所有非方形柱形都变成方形。
  // 这些网格与 studio-app.js 构建出的几何同源（见 gen-pillars.mjs），并共用柱体的 scaleBasis，因此物件仍保持 0.45 × 2.8 × 0.45 的占地与「底面在原点」的摆放约定。
  pillar_round: {
    url: "/static/3d-studio/models/pillar-round-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/pillar-round.glb?v=2609212100",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_semicircle: {
    url: "/static/3d-studio/models/pillar-semicircle-lite.glb?v=2609212100",
    fallbackUrl:
      "/static/3d-studio/models/pillar-semicircle.glb?v=2609212100",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_quarter: {
    url: "/static/3d-studio/models/pillar-quarter-lite.glb?v=2609212100",
    fallbackUrl: "/static/3d-studio/models/pillar-quarter.glb?v=2609212100",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_quarterinner: {
    url: "/static/3d-studio/models/pillar-quarterinner-lite.glb?v=2609212100",
    fallbackUrl:
      "/static/3d-studio/models/pillar-quarterinner.glb?v=2609212100",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  curtain_left: defineHomeItemModel("curtain_left", "2609212100", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_right: defineHomeItemModel("curtain_right", "2609212100", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_split: defineHomeItemModel("curtain_split", "2609212100", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  rounddiningtable_turntable: defineHomeItemModel(
    "rounddiningtable_turntable",
    "2609212100",
    {
      scaleBasis: [2.2, 0.78, 2.2],
      preserveOrigin: true
    }
  ),
  tv_standard: defineApplianceItemModel("tv_standard", {
    scaleBasis: [1.5, 0.92, 0.18],
    preserveOrigin: true
  }),
  tv_tabletop: defineApplianceItemModel("tv_tabletop", {
    scaleBasis: [1.5, 0.92, 0.18],
    preserveOrigin: true
  }),
  tv_mobile: defineApplianceItemModel("tv_mobile", {
    scaleBasis: [1.5, 0.92, 0.18],
    preserveOrigin: true
  }),
  wallac: defineApplianceItemModel("wallac", {
    scaleBasis: [0.9, 0.28, 0.22],
    preserveOrigin: true
  }),
  floorac: defineApplianceItemModel("floorac", {
    scaleBasis: [0.42, 1.75, 0.42],
    preserveOrigin: true
  }),
  airpurifier: defineApplianceItemModel("airpurifier", {
    scaleBasis: [0.34, 0.7, 0.34],
    preserveOrigin: true
  }),
  robotvacuum: defineApplianceItemModel("robotvacuum", {
    scaleBasis: [0.55, 0.85, 0.5],
    preserveOrigin: true
  }),
  floorlamp: defineApplianceItemModel("floorlamp", {
    scaleBasis: [1.35, 1.8, 0.5],
    preserveOrigin: true
  }),
  walllamp: defineApplianceItemModel("walllamp", {
    scaleBasis: [0.3, 0.34, 0.22],
    preserveOrigin: true
  }),
  fridge: defineApplianceItemModel("fridge", {
    scaleBasis: [0.75, 1.85, 0.72],
    preserveOrigin: true
  }),
  rangehood: defineApplianceItemModel("rangehood", {
    scaleBasis: [0.9, 0.55, 0.45],
    preserveOrigin: true
  }),
  dishwasher: defineApplianceItemModel("dishwasher", {
    scaleBasis: [0.6, 0.82, 0.6],
    preserveOrigin: true
  }),
  steamoven: defineApplianceItemModel("steamoven", {
    scaleBasis: [0.6, 0.6, 0.55],
    preserveOrigin: true
  }),
  microwave: defineApplianceItemModel("microwave", {
    scaleBasis: [0.52, 0.32, 0.42],
    preserveOrigin: true
  }),
  ricecooker: defineApplianceItemModel("ricecooker", {
    scaleBasis: [0.28, 0.25, 0.32],
    preserveOrigin: true
  }),
  washer: defineApplianceItemModel("washer", {
    scaleBasis: [0.6, 0.85, 0.65],
    preserveOrigin: true
  }),
  dryer: defineApplianceItemModel("dryer", {
    scaleBasis: [0.6, 0.85, 0.65],
    preserveOrigin: true
  }),
  storagewaterheater: defineApplianceItemModel("storagewaterheater", {
    scaleBasis: [0.86, 0.48, 0.46],
    preserveOrigin: true
  }),
  gaswaterheater: defineApplianceItemModel("gaswaterheater", {
    scaleBasis: [0.42, 0.72, 0.22],
    preserveOrigin: true
  }),
  desktop: defineApplianceItemModel("desktop", {
    scaleBasis: [0.72, 0.5, 0.32],
    preserveOrigin: true
  }),
  laptop: defineApplianceItemModel("laptop", {
    scaleBasis: [0.36, 0.22, 0.28],
    preserveOrigin: true
  }),
  nas: defineApplianceItemModel("nas", {
    scaleBasis: [0.28, 0.34, 0.24],
    preserveOrigin: true
  })
});
const FURNITURE_PALETTE_ITEM_TYPES = new Set([
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
  "nas"
]);
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
  "kitchencooktop"
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
  "airoutlet"
]);
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
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "elevator",
  "steelstairs",
  "glassstairs",
  "piano"
]);
/**
 * 「暖阳原木」主题下按整块木料重做的柜类（含吊柜 / 鞋柜 / 书柜等）。
 * 这些类型的中 / 柔 / 深三档家具色会一起收敛到木色：一件柜子上出现三种明度的木色会显得像拼接，收敛后整体才像同一块木料。
 * 清单同时决定台面、门板回边等部件是否走木色分支，因此单独提出来共用，而不是在各个分支里各写一份。
 */
const WARM_JOINERY_ITEM_TYPES = new Set([
  "cabinet",
  "wallcabinet",
  "shoecabinet",
  "sideboard",
  "bookcase",
  "shelf",
  "nightstand",
  "tvstand",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "glasscabinet"
]);
/**
 * 「暖阳原木」主题下餐桌 / 餐椅的材质槽位表：键是家具类型，值是按 material-N 下标排列的材质语义。
 * 餐桌是一进门的视觉中心，只有木色 + 亚麻 + 鼠尾草绿（wood / linen / sage / ceramic）才像一套成品的原木
 * 餐桌，所以按槽位逐一指定而不是沿用家具调色板的三档灰；下标越界取到 undefined，调用方按没有专门语义处理。
 */
const WARM_DINING_MATERIAL_TABLE = Object.freeze({
  table: ["wood", "wood", "linen"],
  rounddiningtable: ["wood", "wood", "wood", "linen", "wood"],
  rounddiningtable_turntable: ["wood", "wood", "wood", "wood", "ceramic", "linen", "wood"],
  chair: ["sage", "wood"]
});
/**
 * 「暖阳原木」主题下各柜类「台面」所在的材质槽位。
 * 台面要单独压平粗糙度并换成石材色（countertop），否则会和柜门一起被染成木色、整件柜子看上去像一整块木头；槽位值来自建模约定，不能凭外观猜。
 */
const WARM_COUNTERTOP_MATERIAL_INDEX_BY_ITEM_TYPE = Object.freeze({
  sideboard: "0",
  shoecabinet: "2",
  nightstand: "1",
  kitchenbase: "2",
  kitchensink: "2",
  kitchencooktop: "2"
});
/**
 * 「暖阳原木」主题下各柜类「门板回边」所在的材质槽位。
 * 门板侧面（回边）在暖色侧光下会亮成一条白边，需要注入着色器按法线朝向压暗，所以要精确知道哪一号材质是回边 —— 同样来自建模约定。
 */
const WARM_DOOR_RETURN_MATERIAL_INDEX_BY_ITEM_TYPE = Object.freeze({
  sideboard: "3",
  shoecabinet: "4",
  kitchenbase: "3",
  kitchensink: "7",
  kitchencooktop: "4"
});
/**
 * 创建外部模型管理器：负责按需加载、并发排队、材质复用与实例落地。
 * 依赖注入的用意：THREE 必须用主模块命名空间（否则出现两份 three），loader 必须是已挂 DRACO 解码器的 GLTFLoader；isModelInUse 与 requestRender 让管理器在装载完成 / 失败时主动触发一次重绘，无需轮询。
 * @param {number} [managerOptions.maxConcurrentLoads] 并发加载上限（默认 2，解压占 Worker 与带宽）。@param {number} [managerOptions.loadTimeoutMs] 单次加载超时（默认 12s，弱网下 1MB 级模型的容忍上限）。
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
  deferralHost: deferralHost = null
}) {
  // 四个缓存各司其职：已加载（类型 → {source, size}）、在飞（类型 → Promise，
  // 用来合并同一类型的并发请求）、待加载队列、以及「字段完全等价的材质」缓存 ——
  // 最后这个把大量外观相同的部件收敛成同一份材质，直接减少 GPU program 数量。
  const loadedModelByType = new Map();
  const pendingLoadByType = new Map();
  const loadQueue = [];
  const materialCacheByKey = new Map();
  // 并发至少为 1（否则队列永远不会被泵动），超时至少 50ms（防止误传 0 时每次加载
  // 都立刻超时失败）；finite() 负责把 NaN / undefined 换成默认值。
  const concurrencyLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2)));
  const effectiveTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
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
   * 通常是资源缺失或格式问题，重试只会拖慢队列。finally 里清掉计时器，否则超时后即便加载成功也会留下定时器。@throws 两个地址都失败或定义里没有可用资源时抛出（中文文案）。
   */
  function loadModelWithFallback(modelDefinition, modelTypeLabel) {
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
    if (modelDefinition?.url) {
      return loadFromUrl(modelDefinition.url).catch(loadError => {
        if (!modelDefinition.fallbackUrl) {
          throw loadError;
        }
        return loadFromUrl(modelDefinition.fallbackUrl);
      });
    } else {
      return Promise.reject(new Error("模型 " + modelTypeLabel + " 没有可用资源"));
    }
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
   * 加载（或复用）指定类型的模型，包含延迟放行、请求去重与按类型的几何修订。
   * 延迟加载声明生效且非用户主动要模型时只登记需求并同步返回 null，让本次先用过程几何顶上；已加载直接返回 缓存，正在加载则复用同一个 Promise；解析成功后按类型做几何修订（玻璃柜背板、吊柜侧板、车漆法线、床底内缩，
   * 车漆按源几何缓存并 dispose 旧几何以免泄漏），只缓存 scene 与实测尺寸；失败时记日志并返回 null（不抛错），调用方继续用过程几何 —— 这是降级而非中断。
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
    const loadPromise = enqueueLoadTask(() => loadModelWithFallback(definition, modelType))
      .then(gltf => {
        const loadedScene = gltf.scene || gltf.scenes?.[0];
        if (!loadedScene) {
          throw new Error("模型 " + modelType + " 没有可显示的场景");
        }
        // 按类型的几何修订：都是针对具体模型已知缺陷的修补（玻璃柜背板透光、
        // 吊柜缺侧板、车漆法线生硬、床底座与床垫共面闪烁），必须精确匹配类型，
        // 不能泛化到其它模型。
        if (modelType === "glasscabinet" || modelType === "bookcase") {
          repairGlassCabinetBack(THREE, loadedScene, modelType);
        }
        if (modelType === "wallcabinet") {
          repairWallCabinetSides(THREE, loadedScene);
        }
        if (modelType === "smallcar") {
          const smoothedGeometryBySource = new Map();
          loadedScene.traverse(carMesh => {
            if (!carMesh.isMesh) {
              return;
            }
            const meshGeometry = carMesh.geometry;
            if (!smoothedGeometryBySource.has(meshGeometry)) {
              smoothedGeometryBySource.set(
                meshGeometry,
                smoothCarSurfaceNormals(THREE, meshGeometry)
              );
            }
            carMesh.geometry = smoothedGeometryBySource.get(meshGeometry);
          });
          // 平滑后的几何会顶替原几何，被替换掉的那份必须显式 dispose，
          // 否则它会一直占着显存（克隆体共享的是替换后的那份）。
          for (const [sourceGeometry, smoothedGeometry] of smoothedGeometryBySource) {
            if (sourceGeometry !== smoothedGeometry) {
              sourceGeometry.dispose();
            }
          }
        }
        if (modelType === "bed") {
          loadedScene.traverse(bedMesh => {
            if (bedMesh.isMesh) {
              bedMesh.geometry = insetBedBaseGeometry(bedMesh.geometry);
            }
          });
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
      paletteColors.warmWood && WARM_JOINERY_ITEM_TYPES.has(furnitureItemType);
    if (isWarmJoinery) {
      paletteColors = {
        ...paletteColors,
        wood: paletteColors.cabinetWood ?? paletteColors.wood
      };
    }
    if (paletteColors.warmWood) {
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
    // 暖阳原木：餐桌 / 餐椅按槽位换成木色、亚麻、鼠尾草绿或陶面，而不是沿用家具三档灰。
    // 命中后直接返回：这类物件的槽位语义已被表完全决定，不需要再走下面的兜底分支。
    const warmDiningMaterialKey = paletteColors.warmWood
      ? WARM_DINING_MATERIAL_TABLE[furnitureItemType]?.[
          Number(materialName.match(/material-(\d+)$/)?.[1])
        ]
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
    let chosenColor = paletteColors.furniture;
    if (/^curtain_(left|right|split)$/.test(furnitureItemType)) {
      const curtainMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      if (["0", "4"].includes(curtainMaterialIndex)) {
        chosenColor = paletteColors.furnitureDark;
      } else if (["1", "5", "2", "3"].includes(curtainMaterialIndex)) {
        chosenColor = paletteColors.furnitureSoft;
      } else {
        chosenColor = paletteColors.furniture;
      }
    } else if (furnitureItemType === "coffeetable" || furnitureItemType === "squarecoffeetable") {
      chosenColor = materialName.endsWith("-dark")
        ? paletteColors.furnitureDark
        : materialName.endsWith("-light") || materialName.endsWith("-soft")
          ? paletteColors.furnitureSoft
          : paletteColors.furniture;
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
      const tableMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      const softFinishIndexes =
        furnitureItemType === "rounddiningtable_turntable" ? ["0", "3"] : ["0"];
      const tableColor = meshMaterial?.color?.clone?.() || new THREE.Color(16777215);
      const tableLuminance = tableColor.r * 0.2126 + tableColor.g * 0.7152 + tableColor.b * 0.0722;
      chosenColor = softFinishIndexes.includes(tableMaterialIndex)
        ? paletteColors.furnitureSoft
        : tableLuminance < 0.2
          ? paletteColors.furnitureDark
          : tableLuminance < 0.55
            ? paletteColors.furniture
            : paletteColors.furnitureSoft;
    } else if (
      ["kitchenbase", "kitchensink", "kitchencooktop", "basin"].includes(furnitureItemType)
    ) {
      const kitchenMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      const expectedMaterialIndex = furnitureItemType === "basin" ? "1" : "2";
      const kitchenColor = meshMaterial?.color?.clone?.() || new THREE.Color(16777215);
      const kitchenLuminance =
        kitchenColor.r * 0.2126 + kitchenColor.g * 0.7152 + kitchenColor.b * 0.0722;
      chosenColor =
        kitchenMaterialIndex === expectedMaterialIndex
          ? paletteColors.furniture
          : kitchenLuminance < 0.2
            ? paletteColors.furnitureDark
            : kitchenLuminance < 0.55
              ? paletteColors.furniture
              : paletteColors.furnitureSoft;
    } else if (furnitureItemType === "stairs") {
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
    if (paletteColors.warmWood) {
      // 暖阳原木：按材质槽位逐件指定木色 / 布艺 / 五金，而不是套用家具三档灰 ——
      // 这几类物件的槽位语义（床架、床品、坐垫、桌面、踏面…）在建模时就是约定死的，
      // 只有按件取色才能既保住木质主体，又让布艺与金属件各归其位。
      const warmOverrideMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      if (furnitureItemType === "bed") {
        // 1 / 3 号是床品（浅色），其余是床架木色。
        chosenColor = ["1", "3"].includes(warmOverrideMaterialIndex)
          ? paletteColors.furnitureLight
          : paletteColors.wood;
      }
      if (furnitureItemType === "sofa") {
        // 坐垫用沙发布，框架用木色；沙发布缺失时退回浅色档（这里已在暖色分支内）。
        chosenColor = materialName.includes("cushion")
          ? paletteColors.sofaFabric ??
            (paletteColors.warmWood ? paletteColors.furnitureLight : paletteColors.furnitureSoft)
          : paletteColors.wood;
      }
      if (furnitureItemType === "cabinet") {
        chosenColor = warmOverrideMaterialIndex === "2" ? 5462356 : paletteColors.wood;
      }
      if (furnitureItemType === "nightstand") {
        chosenColor = warmOverrideMaterialIndex === "2" ? 5462356 : paletteColors.wood;
      }
      if (["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)) {
        chosenColor = ["0", "3"].includes(warmOverrideMaterialIndex)
          ? paletteColors.wood
          : paletteColors.furnitureLight;
      }
      if (furnitureItemType === "tvstand") {
        chosenColor = paletteColors.wood;
      }
      if (furnitureItemType === "sideboard") {
        chosenColor = paletteColors.wood;
      }
      if (furnitureItemType === "bookcase" && Number(warmOverrideMaterialIndex) >= 11) {
        // 书柜第 11 号往后的材质是书脊 / 摆件一类的小色块：按木作强调色、装饰色、
        // 浅木色轮转，避免整格书架都是一种颜色而显得空。
        chosenColor = [
          paletteColors.joineryAccent,
          paletteColors.decorAccent,
          paletteColors.furnitureLight
        ][Number(warmOverrideMaterialIndex) % 3];
      }
      if (furnitureItemType === "plant") {
        chosenColor = materialName.includes("foliagesoft")
          ? 9877369
          : materialName.includes("foliage")
            ? paletteColors.leafColor
            : materialName.endsWith("-soft")
              ? paletteColors.decorAccent
              : paletteColors.furnitureDark;
      }
      if (furnitureItemType === "rug") {
        chosenColor = materialName.endsWith("-soft")
          ? paletteColors.furnitureLight
          : paletteColors.joineryAccent;
      }
      if (furnitureItemType.startsWith("curtain_")) {
        // 1 / 2 / 3 / 5 号是布面（暖米白），其余是轨道与端盖（深木色）。
        chosenColor = ["2", "3", "5", "1"].includes(warmOverrideMaterialIndex)
          ? 16776696
          : paletteColors.furnitureDark;
      }
      if (furnitureItemType === "chair") {
        chosenColor =
          warmOverrideMaterialIndex === "0"
            ? paletteColors.chairFabric ?? paletteColors.furnitureSoft
            : paletteColors.wood;
      }
      if (["toilet", "squattoilet", "urinal", "bathtub", "basin"].includes(furnitureItemType)) {
        chosenColor = paletteColors.applianceSoft;
      }
    }
    // 暖阳原木：柜类的台面与金属水槽 / 灶面另有专门色板，这里按槽位单独覆盖；
    // 只有暖色主题的柜类才走这一块，其它情况下两个标记恒为 false。
    let isWarmCountertop = false;
    let isWarmMetalSink = false;
    if (isWarmJoinery) {
      const joineryMaterialIndex = materialName.match(/material-(\d+)$/)?.[1];
      isWarmCountertop =
        WARM_COUNTERTOP_MATERIAL_INDEX_BY_ITEM_TYPE[furnitureItemType] !== undefined &&
        joineryMaterialIndex === WARM_COUNTERTOP_MATERIAL_INDEX_BY_ITEM_TYPE[furnitureItemType];
      if (furnitureItemType === "tvstand") {
        // 电视柜没有台面槽位表，改按「柔光面，或原模型本身就是浅色」判台面。
        const tvStandSourceColor = meshMaterial?.color;
        const tvStandSourceLuminance = tvStandSourceColor
          ? tvStandSourceColor.r * 0.2126 +
            tvStandSourceColor.g * 0.7152 +
            tvStandSourceColor.b * 0.0722
          : 0;
        isWarmCountertop =
          materialName.endsWith("-soft") ||
          (!materialName.includes("ha-tvstand-") && tvStandSourceLuminance >= 0.3);
      }
      if (["kitchensink", "kitchencooktop"].includes(furnitureItemType)) {
        chosenColor = paletteColors.wood;
      }
      if (
        furnitureItemType === "kitchensink" &&
        ["3", "4", "5", "6"].includes(joineryMaterialIndex)
      ) {
        // 水槽盆体：3 / 4 号是深色石材，5 / 6 号是浅色石材，且都要求高金属度反光。
        chosenColor = ["3", "4"].includes(joineryMaterialIndex) ? 10200481 : 11450548;
        isWarmMetalSink = true;
      }
      if (
        furnitureItemType === "kitchencooktop" &&
        ["3", "6", "7"].includes(joineryMaterialIndex)
      ) {
        chosenColor = 4212549;
      }
      if (
        (furnitureItemType === "kitchenbase" && joineryMaterialIndex === "4") ||
        (furnitureItemType === "kitchensink" && joineryMaterialIndex === "8") ||
        (furnitureItemType === "kitchencooktop" && joineryMaterialIndex === "5")
      ) {
        chosenColor = 7830384;
      }
      if (furnitureItemType === "cabinet" && joineryMaterialIndex === "1") {
        chosenColor = 9794135;
      }
      if (isWarmCountertop) {
        chosenColor = paletteColors.countertop ?? 16117989;
      }
    }
    const isSoftRug = furnitureItemType === "rug" && materialName.endsWith("-soft");
    const isTransparentMaterial =
      materialName.endsWith("-glass") ||
      meshMaterial?.transparent === true ||
      (meshMaterial?.opacity ?? 1) < 1;
    // 暖阳原木：玻璃等透明件换成暖色玻璃，避免冷灰玻璃在暖色场景里显得脏。
    if (paletteColors.warmWood && isTransparentMaterial) {
      chosenColor = paletteColors.glass;
    }
    return createFurnitureMaterial(meshMaterial, chosenColor, {
      roughness: isWarmCountertop
        ? 0.65
        : isWarmMetalSink
          ? 0.36
          : paletteColors.warmWood && isTransparentMaterial
            ? 0.18
            : materialName.includes("foliage") || furnitureItemType === "rug"
              ? 0.9
              : 0.72,
      metalness: isWarmMetalSink
        ? 0.55
        : isWarmJoinery || materialName.includes("foliage") || furnitureItemType === "rug"
          ? 0
          : 0.02,
      polygonOffset: isSoftRug,
      polygonOffsetFactor: isSoftRug ? -2 : 0,
      polygonOffsetUnits: isSoftRug ? -4 : 0,
      transparent: isTransparentMaterial,
      // 暖阳原木：透明件保留原材质的不透明度（暖玻璃本来就调过半透明），
      // 其它主题仍用统一的 0.42。
      opacity: isTransparentMaterial ? (paletteColors.warmWood ? meshMaterial.opacity : 0.42) : 1,
      depthWrite: !isTransparentMaterial
    });
  }
/**
 * 生成楼梯专用材质：玻璃楼梯走半透明，其余走框架色。
 * 玻璃判据是「原材质本身透明且不透明度 < 0.5」—— 只有建模时就标成玻璃的部件才会被重做成 0.3 不透明度的 双面玻璃，否则整段楼梯都会变玻璃；玻璃件关 depthWrite（避免同层玻璃互遮出现黑边）但保留 depthTest。
 * 钢楼梯用更高的金属度与更低的粗糙度（0.42 / 0.38）表现金属反射，其余用 0.08 / 0.58 的哑光框架，都加极低 emissive 0.07 提亮暗部。
 */
  function createStairMaterial(existingMaterial, stairPalette, stairItemType) {
    if (!existingMaterial) {
      return existingMaterial;
    }
    if (
      stairItemType === "glassstairs" &&
      existingMaterial.transparent === true &&
      finite(existingMaterial.opacity, 1) < 0.5
    ) {
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
      // 暖阳原木：只有踏面（模型里名称恰为 004 / sacfdsa010 的那块）换成地板色，
      // 并注入与地板相同的拼板着色器，楼梯才会与地板看起来是同一种木料；
      // 其余框架件统一用深色 7567993 压住踏面，避免整段楼梯一起发飘。
      const isWarmStairTread = isSteelStairs
        ? /^004$/.test(existingMaterial.name || "")
        : /^sacfdsa010$/.test(existingMaterial.name || "");
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
 * 分发顺序不可调换，原则是「先专门、后通用」：纯色家电 → 家具（含 sofa）→ 电梯 → 钢琴 → 楼梯 → 其余按亮度 分档兜底。三处特殊处理：拿不到 MeshStandardMaterial 构造器（精简版 three 或测试替身）时直接克隆原材质放行，
 * 宁可保真也不报错；暖阳原木下钢琴提前分流（亮光黑琴身在暖色场景里是死黑，改走暖木 / 黄铜色板）；茶几机的自发光被显式清零，否则替换后再叠场景灯光会明显发白。
 */
  function applyAppliancePalette(baseMaterial, appliancePalette, applianceItemType) {
    if (typeof THREE.MeshStandardMaterial != "function") {
      return baseMaterial.clone?.() || baseMaterial;
    }
    if (appliancePalette.warmWood && applianceItemType === "piano") {
      // 暖阳原木：钢琴整件改成暖木 / 黄铜一族 —— 亮光黑琴身在暖色场景里是一块死黑。
      // 按材质名区分黄铜件（金色）、琴身饰面（color_009 / blinds_weave）与高光条（*1），
      // 各给一组暖色，并保持低金属度让木质感出来。
      const warmPianoMaterialName = (baseMaterial?.name || "").toLowerCase();
      const isWarmPianoBrass = warmPianoMaterialName.includes("金色");
      const warmPianoColor = isWarmPianoBrass
        ? 12296558
        : warmPianoMaterialName.includes("color_009") ||
            warmPianoMaterialName.includes("blinds_weave")
          ? 3423034
          : warmPianoMaterialName.includes("*1")
            ? 16315885
            : 9991250;
      const warmPianoMaterial = createFurnitureMaterial(baseMaterial, warmPianoColor, {
        roughness: isWarmPianoBrass ? 0.4 : 0.55,
        metalness: isWarmPianoBrass ? 0.5 : 0
      });
      // 与下方常规钢琴分支一致：关掉 Plan2 接触阴影，否则镜面高光会出现硬边。
      warmPianoMaterial.userData.plan2SurfaceContact = false;
      return warmPianoMaterial;
    }
    if (APPLIANCE_PALETTE_ITEM_TYPES.has(applianceItemType)) {
      // 家电材质名同样来自建模约定（material-N 表示部件槽位），统一小写后匹配。
      const applianceMaterialName = (baseMaterial?.name || "").toLowerCase();
      const applianceBaseColor = baseMaterial?.color?.clone?.() || new THREE.Color(16777215);
      const applianceLuminance =
        applianceBaseColor.r * 0.2126 +
        applianceBaseColor.g * 0.7152 +
        applianceBaseColor.b * 0.0722;
      const applianceMaterialIndex = applianceMaterialName.match(/material-(\d+)/)?.[1];
      const applianceColor = appliancePalette.appliance ?? appliancePalette.furniture;
      const applianceSoftColor = appliancePalette.applianceSoft ?? appliancePalette.furnitureSoft;
      const applianceDarkColor = appliancePalette.applianceDark ?? appliancePalette.furnitureDark;
      const isDarkDeviceMaterial =
        ["desktop", "laptop", "nas"].includes(applianceItemType) && applianceMaterialIndex === "0";
      const selectedColor =
        applianceItemType === "walllamp"
          ? applianceMaterialIndex === "2"
            ? appliancePalette.accent
            : applianceColor
          : applianceItemType === "floorlamp"
            ? // 暖阳原木：落地灯的灯杆单独走暖木色（floorLampBody），
              // 该色只在暖色色卡里定义，因此这个判断等价于「暖色主题且杆件槽位」。
              appliancePalette.floorLampBody
              ? applianceMaterialIndex === "3"
                ? applianceSoftColor
                : appliancePalette.floorLampBody
              : applianceColor
            : applianceItemType === "desktop"
              ? applianceMaterialIndex === "1"
                ? applianceDarkColor
                : applianceSoftColor
              : applianceItemType === "laptop" && applianceMaterialIndex === "2"
                ? applianceDarkColor
                : (applianceItemType === "laptop" && applianceMaterialIndex === "1") ||
                    isDarkDeviceMaterial
                  ? applianceSoftColor
                  : applianceItemType.startsWith("tv_")
                    ? applianceDarkColor
                    : applianceItemType === "pipelinewaterpurifier" ||
                        applianceItemType === "tea_bar_machine"
                      ? applianceLuminance < 0.16
                        ? applianceColor
                        : applianceSoftColor
                      : applianceMaterialName.endsWith("-dark") || applianceLuminance < 0.16
                        ? applianceDarkColor
                        : applianceMaterialName.endsWith("-soft") || applianceLuminance < 0.45
                          ? applianceSoftColor
                          : applianceColor;
      const applianceMaterial = createFurnitureMaterial(baseMaterial, selectedColor, {
        roughness: 0.82,
        metalness: 0,
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
    if (applianceItemType === "elevator") {
      const isElevatorAccentColor = /Color_00[34]/i.test(baseMaterial?.name || "");
      const elevatorColor = isElevatorAccentColor
        ? new THREE.Color(appliancePalette.wall)
        : new THREE.Color(appliancePalette.furniture);
      return createFurnitureMaterial(
        baseMaterial,
        elevatorColor,
        isElevatorAccentColor
          ? {
              roughness: 0.82,
              metalness: 0.01
            }
          : {}
      );
    }
    if (applianceItemType === "piano") {
      // 钢琴的材质名同样是约定死的：Color_009 是琴身，金色 / blinds_weave / *1 是饰面。
      const pianoMaterialName = (baseMaterial?.name || "").toLowerCase();
      const pianoColor = pianoMaterialName.includes("color_009")
        ? appliancePalette.furnitureDark
        : pianoMaterialName.includes("blinds_weave") ||
            pianoMaterialName.includes("金色") ||
            pianoMaterialName.includes("*1")
          ? appliancePalette.furnitureSoft
          : appliancePalette.furniture;
      const pianoMaterial = new THREE.MeshStandardMaterial({
        color: pianoColor,
        roughness: 0.72,
        metalness: 0.06,
        emissive: pianoColor,
        emissiveIntensity: 0.08,
        side: baseMaterial?.side ?? THREE.FrontSide,
        transparent: false,
        opacity: 1,
        depthWrite: baseMaterial?.depthWrite ?? true,
        depthTest: baseMaterial?.depthTest ?? true,
        toneMapped: true
      });
      pianoMaterial.userData.plan2SurfaceContact = false;
      pianoMaterial.name = (baseMaterial?.name || "piano") + " · HomeOS furniture palette";
      return pianoMaterial;
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
/**
 * 收集某个材质分组（或整个几何）用到的顶点下标。
 * 多材质模型的一个 mesh 会按材质 group 切片，几何本身并不区分部件，所以要改某个部件的顶点必须先挑出该 group 覆盖的顶点：有索引时经 index 映射，无索引时顶点顺序与位置一一对应。groupMaterialIndex 传 null 表示
 * 整个几何；分组存在但没匹配到顶点时返回空集，由调用方决定兜底。
 */
  function collectGroupVertexIndices(geometry, groupMaterialIndex = null) {
    const vertexIndices = new Set();
    const meshPositionAttribute = geometry?.attributes?.position;
    if (!meshPositionAttribute) {
      return vertexIndices;
    }
    const geometryIndex = geometry.index;
    const matchingGroups = Number.isInteger(groupMaterialIndex)
      ? (geometry.groups || []).filter(
          geometryGroup => geometryGroup.materialIndex === groupMaterialIndex
        )
      : [];
    if (matchingGroups.length) {
      for (const materialGroup of matchingGroups) {
        const groupEndIndex = materialGroup.start + materialGroup.count;
        for (
          let groupVertexIndex = materialGroup.start;
          groupVertexIndex < groupEndIndex;
          groupVertexIndex += 1
        ) {
          vertexIndices.add(
            geometryIndex ? geometryIndex.getX(groupVertexIndex) : groupVertexIndex
          );
        }
      }
    } else if (groupMaterialIndex === null) {
      for (let vertexIndex = 0; vertexIndex < meshPositionAttribute.count; vertexIndex += 1) {
        vertexIndices.add(vertexIndex);
      }
    }
    return vertexIndices;
  }
/**
 * 统计给定顶点集合在 Y 轴上的取值范围。
 * 初始值取 ±Infinity，空集合会原样返回，因此调用方必须自己用 Number.isFinite 判断、不能把 Infinity 当尺寸使用；只统计 Y 是因为调用方都在做「高度对齐」。
 */
  function measureVertexYRange(positionAttribute, vertexIndexSet) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const vertexId of vertexIndexSet) {
      const vertexY = positionAttribute.getY(vertexId);
      minY = Math.min(minY, vertexY);
      maxY = Math.max(maxY, vertexY);
    }
    return {
      min: minY,
      max: maxY
    };
  }
/**
 * 让目标几何（笔记本的屏幕面板）贴合参考几何给出的倾斜轮廓。
 * 翻盖是独立几何，闭合时与机身共面、翻开时沿转轴贴合，作者在参考部件上留了轮廓采样点，这里按它们定义的 高度区间重映射目标顶点：高度按比例落在底 / 顶轮廓之间，底部留 4%、顶部留 7% 余量以避开穿插；沿 Z（厚度）
 * 按斜面插值，再整体前移 profileHeight × 0.008 并叠加按顶点深度相对位置加权的 0.022 补偿，避免整块面板被平移的僵硬感。任一环节不满足都原样返回，宁可不动也不产出畸形几何。
 */
  function conformGeometryToReference(
    targetGeometry,
    referenceGeometry,
    targetMaterialIndex = null,
    referenceMaterialIndex = null
  ) {
    if (!targetGeometry?.attributes?.position) {
      return targetGeometry;
    }
    const targetPositionAttribute = targetGeometry.attributes.position;
    const conformedGeometry = targetGeometry.clone?.();
    if (!conformedGeometry?.attributes?.position) {
      return targetGeometry;
    }
    const conformedPositionAttribute = conformedGeometry.attributes.position;
    const targetVertexIndices = collectGroupVertexIndices(targetGeometry, targetMaterialIndex);
    if (!targetVertexIndices.size) {
      return targetGeometry;
    }
    const { min: targetMinY, max: targetMaxY } = measureVertexYRange(
      targetPositionAttribute,
      targetVertexIndices
    );
    if (
      !Number.isFinite(targetMinY) ||
      !Number.isFinite(targetMaxY) ||
      targetMaxY - targetMinY < 0.001
    ) {
      return targetGeometry;
    }
    const referencePositionAttribute = referenceGeometry?.attributes?.position;
    const referenceVertexIndices = collectGroupVertexIndices(
      referenceGeometry,
      referenceMaterialIndex
    );
    if (!referencePositionAttribute || !referenceVertexIndices.size) {
      return targetGeometry;
    }
    const referenceRange = measureVertexYRange(referencePositionAttribute, referenceVertexIndices);
    if (!Number.isFinite(referenceRange.min) || !Number.isFinite(referenceRange.max)) {
      return targetGeometry;
    }
    // 以参考部件 Y 区间的中点为界把顶点分成上下两半：下半取 Z 最大（最靠外）的点
    // 作底面轮廓采样，上半同理取顶面轮廓采样，两者连起来就是面板要贴合的斜线。
    const referenceMidY = (referenceRange.min + referenceRange.max) / 2;
    let bottomProfileVertex = null;
    let topProfileVertex = null;
    for (const referenceVertexIndex of referenceVertexIndices) {
      const profileSample = {
        y: referencePositionAttribute.getY(referenceVertexIndex),
        z: referencePositionAttribute.getZ(referenceVertexIndex)
      };
      if (
        profileSample.y <= referenceMidY &&
        (!bottomProfileVertex || profileSample.z > bottomProfileVertex.z)
      ) {
        bottomProfileVertex = profileSample;
      }
      if (
        profileSample.y > referenceMidY &&
        (!topProfileVertex || profileSample.z > topProfileVertex.z)
      ) {
        topProfileVertex = profileSample;
      }
    }
    if (
      !bottomProfileVertex ||
      !topProfileVertex ||
      topProfileVertex.y - bottomProfileVertex.y < 0.001
    ) {
      return targetGeometry;
    }
    const profileHeight = topProfileVertex.y - bottomProfileVertex.y;
    const bottomTargetY = bottomProfileVertex.y + profileHeight * 0.04;
    const topTargetY = topProfileVertex.y - profileHeight * 0.07;
    const targetHeight = targetMaxY - targetMinY;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const targetVertexId of targetVertexIndices) {
      const vertexZ = targetPositionAttribute.getZ(targetVertexId);
      minZ = Math.min(minZ, vertexZ);
      maxZ = Math.max(maxZ, vertexZ);
    }
    const targetDepth = Math.max(maxZ - minZ, 0.001);
    const maxDepthShift = Math.min(targetDepth, profileHeight * 0.022);
    const baseDepthOffset = profileHeight * 0.008;
    for (const conformVertexIndex of targetVertexIndices) {
      const sourceY = targetPositionAttribute.getY(conformVertexIndex);
      const targetY =
        bottomTargetY + ((sourceY - targetMinY) / targetHeight) * (topTargetY - bottomTargetY);
      const targetZ =
        bottomProfileVertex.z +
        ((targetY - bottomProfileVertex.y) / profileHeight) *
          (topProfileVertex.z - bottomProfileVertex.z) +
        baseDepthOffset;
      // 顶点在目标几何深度范围内的相对位置（0 = 最靠内，1 = 最靠外），
      // 用来给深度补偿加权：越靠外的顶点前移越多，避免整块面板被平移。
      const depthRatio = (targetPositionAttribute.getZ(conformVertexIndex) - minZ) / targetDepth;
      conformedPositionAttribute.setY(conformVertexIndex, targetY);
      conformedPositionAttribute.setZ(
        conformVertexIndex,
        targetZ - maxDepthShift * (1 - depthRatio)
      );
    }
    conformedPositionAttribute.needsUpdate = true;
    conformedGeometry.computeVertexNormals?.();
    conformedGeometry.computeBoundingBox?.();
    conformedGeometry.computeBoundingSphere?.();
    return conformedGeometry;
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
 * 流程：按类型决定「整体换材质」（家电 / 自定义材质类，暖阳原木下还包括家具）还是克隆 → 暖阳原木的后处理 （自发光、地板 / 台面 / 门板回边着色器、床尾搭毯）→ 模型特有后处理（汽车漆面）→ 修正透明标记 → 用材质键查缓存。
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
      (materialPalette.warmWood && FURNITURE_PALETTE_ITEM_TYPES.has(modelTypeName))
        ? applyAppliancePalette(inputMaterial, materialPalette, modelTypeName)
        : inputMaterial.clone?.() || inputMaterial;
    // 暖阳原木：给不透明材质补一层与基色同色的微弱自发光，抵消暖色环境光把木色
    // 压灰的问题。布艺（沙发 / 床 / 地毯 / 椅）给 0.12、窗帘浅色布面给 0.38，
    // 其余部件 0.065；透明件不加，否则玻璃会整块糊掉。
    if (materialPalette.warmWood && preparedMaterial.color && !preparedMaterial.transparent) {
      preparedMaterial.emissive = preparedMaterial.color.clone();
      preparedMaterial.emissiveIntensity =
        modelTypeName.startsWith("curtain_") &&
        ["1", "2", "3", "5"].includes((inputMaterial.name || "").match(/material-(\d+)/)?.[1])
          ? 0.38
          : ["sofa", "bed", "rug", "chair"].includes(modelTypeName)
            ? 0.12
            : 0.065;
    }
    if (materialPalette.warmWood && modelTypeName === "stairs") {
      // 暖阳原木：楼梯的木质件换成地板 / 地板描边色，踏面还要自带地板拼板纹理 ——
      // 否则楼梯会是整个场景里唯一一块「没铺地板」的地面。
      const isWarmFloorTread = /(?:material-1|-soft)$/.test(inputMaterial.name || "");
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
    const warmDoorReturnMaterialIndex =
      WARM_DOOR_RETURN_MATERIAL_INDEX_BY_ITEM_TYPE[modelTypeName];
    if (
      materialPalette.warmWood &&
      warmDoorReturnMaterialIndex !== undefined &&
      (inputMaterial.name || "").endsWith("material-" + warmDoorReturnMaterialIndex)
    ) {
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
      materialPalette.warmWood &&
      modelTypeName === "shoecabinet" &&
      /material-3$/.test(inputMaterial.name || "")
    ) {
      // 暖阳原木：鞋柜台面在模型里与柜门共用同一块材质，无法靠换色区分，于是注入
      // 一段着色器按局部坐标把最上面那条切出来涂成石材台面色。
      const warmShoeTopColor = new THREE.Color(materialPalette.countertop);
      preparedMaterial.onBeforeCompile = warmShoeTopShader => {
        warmShoeTopShader.uniforms.warmShoeTopColor = {
          value: warmShoeTopColor
        };
        warmShoeTopShader.vertexShader = warmShoeTopShader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 warmShoePosition;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nwarmShoePosition = position;"
          );
        warmShoeTopShader.fragmentShader = warmShoeTopShader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 warmShoePosition;\nuniform vec3 warmShoeTopColor;"
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat warmShoeTop = step(-0.002, warmShoePosition.x) * step(0.932, warmShoePosition.y) * (1.0 - step(0.970, warmShoePosition.y));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmShoeTopColor, warmShoeTop);"
          )
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmShoeTopColor * 0.065, warmShoeTop);"
          );
      };
      preparedMaterial.customProgramCacheKey = () =>
        "warm-shoe-countertop-v1-" + warmShoeTopColor.getHexString();
    }
    if (
      materialPalette.warmWood &&
      modelTypeName === "bed" &&
      /material-1$/.test(inputMaterial.name || "")
    ) {
      // 暖阳原木：床尾的搭毯（material-1）与床体共用材质，这里改成更糙的布面，
      // 再用着色器按 z 区间切出一条搭毯，让床在暖色主题下多一层织物层次。
      const warmBedRunnerColor = new THREE.Color(
        materialPalette.runnerColor ?? materialPalette.furnitureSoft
      );
      preparedMaterial.roughness = 0.94;
      preparedMaterial.onBeforeCompile = warmBedRunnerShader => {
        warmBedRunnerShader.uniforms.warmBedRunner = {
          value: warmBedRunnerColor
        };
        warmBedRunnerShader.vertexShader = warmBedRunnerShader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float warmBedZ;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nwarmBedZ = position.z;");
        warmBedRunnerShader.fragmentShader = warmBedRunnerShader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying float warmBedZ;\nuniform vec3 warmBedRunner;"
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat warmRunner = smoothstep(0.40, 0.415, warmBedZ) * (1.0 - smoothstep(0.86, 0.875, warmBedZ));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmBedRunner, warmRunner);"
          )
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmBedRunner * 0.12, warmRunner);"
          );
      };
      preparedMaterial.customProgramCacheKey = () =>
        "warm-bed-runner-v1-" + warmBedRunnerColor.getHexString();
    }
    if (modelTypeName === "smallcar") {
      if (materialPalette.warmWood) {
        // 暖阳原木：车漆换成暖白并把贴图兼作自发光，让车在暖色场景里保持干净的
        // 浅色亮点，而不是跟着环境光一起变黄。
        preparedMaterial.color?.set?.(16776696);
        preparedMaterial.roughness = 0.38;
        preparedMaterial.metalness = 0.02;
        preparedMaterial.emissiveMap = preparedMaterial.map;
        preparedMaterial.emissiveIntensity = 0.08;
      }
      // 暖阳原木下走珍珠白漆面：默认珍珠白偏冷，在暖色场景里会显灰。
      applyCarFinish(preparedMaterial, {
        pearlWhite: materialPalette.warmWood === true
      });
    }
    if (
      (modelTypeName === "glasscabinet" &&
        /^glasscabinet-material-(0|10)$/.test(inputMaterial.name)) ||
      (modelTypeName === "bookcase" && /^bookcase-material-(0|7)$/.test(inputMaterial.name))
    ) {
      // 暖阳原木：玻璃柜 / 书柜的背板改用柜体木色，避免背板透出基础的冷灰家具色。
      preparedMaterial.color?.set?.(
        materialPalette.warmWood
          ? materialPalette.cabinetWood ?? materialPalette.wood
          : materialPalette.furniture
      );
      preparedMaterial.transparent = false;
      preparedMaterial.opacity = 1;
      preparedMaterial.depthWrite = true;
      preparedMaterial.depthTest = true;
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
    let laptopPanelReference = null;
    if (resolvedModelType === "laptop") {
      placedObject.traverse(laptopMesh => {
        if (!laptopMesh.isMesh || laptopPanelReference) {
          return;
        }
        // 找到笔记本「屏幕面板」（material-1）所在的材质下标：翻盖几何要贴合它的
        // 轮廓，所以下标必须与材质数组的位置对应；单材质模型记为 null 表示不分组。
        const laptopMaterialIndex = (
          Array.isArray(laptopMesh.material) ? laptopMesh.material : [laptopMesh.material]
        ).findIndex(
          meshMaterialEntry =>
            (meshMaterialEntry?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "1"
        );
        if (!(laptopMaterialIndex < 0)) {
          laptopPanelReference = {
            geometry: laptopMesh.geometry,
            materialIndex: Array.isArray(laptopMesh.material) ? laptopMaterialIndex : null
          };
        }
      });
    }
    placedObject.traverse(mesh => {
      if (!mesh.isMesh) {
        return;
      }
      const originalGeometry = mesh.geometry;
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // 暖阳原木：植物的叶片整簇放大到 1.85 倍 —— 暖色主题的观感偏茂密，
      // 而模型里的叶片是按原尺寸烘死的，只有放大几何才能让树冠站得住。
      if (resolvedModelType === "plant" && itemPalette.warmWood) {
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
      const frontPanelMaterialIndex = materialList.findIndex(
        candidateMaterial =>
          (candidateMaterial?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "2"
      );
      if (resolvedModelType === "laptop" && frontPanelMaterialIndex >= 0 && laptopPanelReference) {
        mesh.geometry = conformGeometryToReference(
          mesh.geometry,
          laptopPanelReference.geometry,
          Array.isArray(mesh.material) ? frontPanelMaterialIndex : null,
          laptopPanelReference.materialIndex
        );
      } else if (resolvedModelType === "tea_bar_machine" || resolvedModelType === "dishwasher") {
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
      // 所以不投影；玻璃楼梯的透明件不接收阴影，否则玻璃上会盖出一块不透明的暗斑。
      mesh.castShadow = resolvedModelType !== "rug";
      mesh.receiveShadow =
        resolvedModelType !== "glassstairs" || mesh.material?.transparent !== true;
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

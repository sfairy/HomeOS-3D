import { COURTYARD_MODELS } from "../../plan/courtyard-models";
import { DECOR_MODELS } from "../../authoring/items/decor-models";
import {
  MODEL_SLOT_ROLES,
  resolveModelMaterialRole,
  stoneSlabFlavorForMaterial,
} from "../../materials/studio-model-material-roles";
import { MODEL_SLOT_ROLES_SEMANTIC, FAMILY_TOKEN_MODEL_IDS } from "../../materials/model-slot-roles";
import { COLLECTION_MODELS } from "./collection-models";
import { modelAssetUrl } from "./model-asset-folders";
import {
  materialStyleStoneSlabRoles,
} from "../../materials/studio-material-presets";

const sofaFamilyItemTypes = new Set(["sofa", "sofa-single", "sofa-l", "sofa-l-left"]),
  preparedRestoreTimeoutMs = 160;
export {
  sofaFamilyItemTypes,
  preparedRestoreTimeoutMs,
};

/**
 * 模型 GLB 的 **HTTP 缓存键**。
 *
 * 模型重写后文件路径不变，浏览器会继续命中旧字节。做法是给**字节真的变过的批次**
 * 换 URL（`?v=<批次>`），没动过的模型保持原 URL，继续吃已有缓存、不制造无谓回源。
 *
 * 本仓库把同一批次的模型合并成 4 个键：减面重写批、卫浴重写批、家用收藏批、参考模型批。
 */
export const MODEL_ASSET_CACHE_KEYS = Object.freeze({
  /** 减面/合批重写批：床、钢琴、钢楼梯、茶吧机、前置净水器、滑板车、庭院躺椅。 */
  modelOptimization: "20261013-model-optimization-v1",
  /** 卫浴重写批：坐便器、蹲便器（`-lite` 与完整件都换了形）。 */
  sanitary: "20261013-sanitary-v1",
  /** 家用收藏批：98 款新增 + 12 款重绘（`collection-models.ts` 的 `assetVersion`）。 */
  household: "20261013-household-v2",
  /**
   * 庭院植被/家具批：2026-10-24 那 15 款乔木 / 松 / 灌木 / 绿篱 / 竹 / 草全部重建，
   * 路径没变、字节变了 —— 不换键浏览器与模板缓存都会继续给旧件。
   */
  garden: "20261025-garden-v6",
  /** 茶台套装批：字节未变，沿用既有键。 */
  teaTable: "20260927-tea-table-v1",
  /** approved 外购模型批：字节未变，沿用既有键。 */
  approved: "20261009-approved-v1",
  /** 0.7.9 参考模型批：5 个新模型 + 重烤的茶几/方柱，落地时间同一批。 */
  reference: "20261020-reference-v1",
  /** 0.8.0 柜体上下两节变体批（衣柜 / 储物柜两节）。 */
  storageSections: "20261022-storage-sections-v4",
  /** 0.8.0 窄高置物柜（独立模型）。 */
  slimCabinet: "20261022-slim-cabinet-v1",
  /** 0.8.0 排气扇批（建模 + 吸墙开洞 + 气幕同批）。 */
  exhaust: "20261022-exhaust-v4",
  /**
   * 2026-10-23 全库回滚与精选修复批：`basin` 恢复原厂件、`freezer-lite` 重出、
   * `floorlamp-lite` 重出。
   *
   * 这一批的文件路径没变、字节变了 —— 不换 URL 的话浏览器会继续命中旧字节，
   * 表现就是「改了模型但画面还是旧的那版」（`basin` 就踩过：回滚后仍看到重做版）。
   */
  modelRestore: "20261023-model-restore-v1",
  /**
   * 2026-10-24 厨柜重建批：`kitchensink`（1200 台下盆水盆柜）与 `kitchencooktop`
   * （600 双眼燃气灶柜）由 `kitchen-parts.mjs` 重出，**1 个根网格 → 8 个槽位子节点**。
   *
   * 这两个描述符此前压根没挂缓存键，重建后路径不变 → 模板缓存键（`modelTemplateKey`
   * 只含 revision + 描述符）也没变，画面继续是「三块实心箱子」的旧件。
   * 同类踩坑记录见上面 `modelRestore` 与 `basin`。
   */
  kitchenRebuild: "20261025-kitchen-rebuild-v1",
});

/** 给模型资源 URL 挂上缓存键；`cacheKey` 为空时原样返回。 */
export function withModelAssetCacheKey(modelUrl: string, cacheKey: string) {
  return cacheKey ? modelUrl + "?v=" + cacheKey : modelUrl;
}
export function insetBedBaseGeometry(bedGeometry: any) {
  if (!bedGeometry?.attributes?.position) return bedGeometry;
  bedGeometry.computeBoundingBox();
  const { min: bedBoxMin, max: bedBoxMax } = bedGeometry.boundingBox;
  if (
    Math.abs(bedBoxMin.y) > 0.002 ||
    Math.abs(bedBoxMax.y - 0.186) > 0.002 ||
    Math.abs(bedBoxMax.x - bedBoxMin.x - 1.8) > 0.002 ||
    Math.abs(bedBoxMax.z - bedBoxMin.z - 2) > 0.002
  )
    return bedGeometry;
  const bedInsetGeometry = bedGeometry.clone(),
    bedCenterX = (bedBoxMin.x + bedBoxMax.x) / 2,
    bedCenterZ = (bedBoxMin.z + bedBoxMax.z) / 2;
  return (
    bedInsetGeometry
      .translate(-bedCenterX, 0, -bedCenterZ)
      .scale(0.996, 1, 0.996)
      .translate(bedCenterX, 0, bedCenterZ),
    bedInsetGeometry.computeBoundingBox(),
    bedInsetGeometry.computeBoundingSphere(),
    bedInsetGeometry
  );
}
/** 给石材板部件补一套**平面投影 UV**（平铺坐标 = XZ 平面归一化）。 */
function ensureStoneSlabPlanarUv(threeLib: any, slabGeometry: any) {
  if (!slabGeometry?.attributes?.position) return;
  slabGeometry.computeBoundingBox();
  const geometryBounds = slabGeometry.boundingBox;
  if (!geometryBounds) return;
  const centerX = (geometryBounds.min.x + geometryBounds.max.x) / 2,
    centerZ = (geometryBounds.min.z + geometryBounds.max.z) / 2,
    horizontalSpan = Math.max(
      geometryBounds.max.x - geometryBounds.min.x,
      geometryBounds.max.z - geometryBounds.min.z,
      0.001,
    ),
    slabPosition = slabGeometry.attributes.position,
    planarUv = new Float32Array(slabPosition.count * 2);
  for (let vertexIndex = 0; vertexIndex < slabPosition.count; vertexIndex += 1) {
    planarUv[vertexIndex * 2] = (slabPosition.getX(vertexIndex) - centerX) / horizontalSpan + 0.5;
    planarUv[vertexIndex * 2 + 1] =
      (slabPosition.getZ(vertexIndex) - centerZ) / horizontalSpan + 0.5;
  }
  slabGeometry.setAttribute("uv", new threeLib.BufferAttribute(planarUv, 2));
}
/** 按模型给石材板部件补平面 UV。 */
export function applyStoneSlabPlanarUv(threeLib: any, modelRoot: any, modelType: any) {
  const styleSlabRoles = materialStyleStoneSlabRoles(modelType);
  modelRoot.traverse((modelMesh: any) => {


    if (!modelMesh.isMesh || Array.isArray(modelMesh.material) || !modelMesh.geometry) return;
    const materialName = modelMesh.material?.name,
      role = resolveModelMaterialRole(modelType, materialName).role;
    if (!styleSlabRoles.has(role) && !stoneSlabFlavorForMaterial(modelType, materialName)) return;
    ensureStoneSlabPlanarUv(threeLib, modelMesh.geometry);
  });
}
export function createHomeAssetDescriptor(
  homeAssetId: any,
  homeAssetOverrides: any,
  modelAssetCacheKey: string = "",
) {
  return Object.freeze({
    url: withModelAssetCacheKey(modelAssetUrl(homeAssetId, "lite"), modelAssetCacheKey),
    fallbackUrl: withModelAssetCacheKey(modelAssetUrl(homeAssetId, "full"), modelAssetCacheKey),
    ...homeAssetOverrides,
  });
}
export function createApplianceAssetDescriptor(
  applianceAssetId: any,
  applianceAssetOverrides: any,
  modelAssetCacheKey: string = "",
) {
  return Object.freeze({
    url: withModelAssetCacheKey(modelAssetUrl(applianceAssetId, "lite"), modelAssetCacheKey),
    fallbackUrl: withModelAssetCacheKey(
      modelAssetUrl(applianceAssetId, "full"),
      modelAssetCacheKey,
    ),
    ...applianceAssetOverrides,
  });
}
export function createFurnitureAssetDescriptor(
  furnitureAssetId: any,
  furnitureAssetScaleBasis: any,
  modelAssetCacheKey: string = "",
) {
  return Object.freeze({
    url: withModelAssetCacheKey(modelAssetUrl(furnitureAssetId, "lite"), modelAssetCacheKey),
    fallbackUrl: withModelAssetCacheKey(
      modelAssetUrl(furnitureAssetId, "full"),
      modelAssetCacheKey,
    ),
    scaleBasis: furnitureAssetScaleBasis,
    preserveOrigin: true,
  });
}
export const paletteOverrideItemTypes = new Set([
  "drawer-chest",
  "smart-socket-86",
  "bed",
  "router",
  "humidifier",
  "wardrobe",
  "office-chair",
  "dehumidifier",
  "heater",
  "bunk-bed",
  "pool-table",


  "coffeetable",
  "kitchenisland",
  "kitchen-island",
]);
export function createIndoorAssetDescriptor(indoorAssetId: any, indoorAssetScaleBasis: any) {
  return Object.freeze({
    url: modelAssetUrl(indoorAssetId, "lite"),
    fallbackUrl: modelAssetUrl(indoorAssetId, "full"),
    scaleBasis: indoorAssetScaleBasis,
    preserveOrigin: true,
  });
}
export function createPillarAssetDescriptor(pillarAssetId: any, modelAssetCacheKey: string = "") {
  return Object.freeze({
    url: withModelAssetCacheKey(modelAssetUrl(pillarAssetId, "lite"), modelAssetCacheKey),
    fallbackUrl: withModelAssetCacheKey(modelAssetUrl(pillarAssetId, "full"), modelAssetCacheKey),
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true,
  });
}
/** 自带独立 GLB 资源的异形柱形：方形柱沿用原先烘焙好的方盒，因此仍留在普通的`pillar` 模型键上； */
export const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
/** 柱族的全部**模型类型**键（含方柱）：`pillar` 与 `pillar_<形状>`。 */
export const PILLAR_MODEL_ITEM_TYPES = new Set([
  "pillar",
  ...[...PILLAR_ASSET_SHAPES].map((pillarShape) => "pillar_" + pillarShape),
]);
export const EXTERNAL_ITEM_MODELS = Object.freeze({
    "drawer-chest": createIndoorAssetDescriptor("drawer-chest", [1.05, 0.94, 0.45]),
    "smart-socket-86": createIndoorAssetDescriptor("smart-socket-86", [0.086, 0.086, 0.012]),
    router: createIndoorAssetDescriptor("router", [0.287, 0.205, 0.177]),
    humidifier: createIndoorAssetDescriptor("humidifier", [0.206, 0.323, 0.218]),
    wardrobe: createIndoorAssetDescriptor("wardrobe", [1.8, 2.2, 0.637]),
    "office-chair": createIndoorAssetDescriptor("office-chair", [0.64, 1.18, 0.66]),
    dehumidifier: createIndoorAssetDescriptor("dehumidifier", [0.34, 0.53, 0.26]),
    heater: createIndoorAssetDescriptor("heater", [0.515, 0.59, 0.29]),
    "bunk-bed": createIndoorAssetDescriptor("bunk-bed", [1.18, 1.845, 2.06]),
    "pool-table": createIndoorAssetDescriptor("pool-table", [2.54, 0.823, 1.42]),
    "tea-table-set": Object.freeze({
      url: withModelAssetCacheKey(
        modelAssetUrl("tea-table-set", "lite"),
        MODEL_ASSET_CACHE_KEYS.teaTable,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("tea-table-set", "full"),
        MODEL_ASSET_CACHE_KEYS.teaTable,
      ),
      scaleBasis: [1.61, 0.94, 1.4],
      preserveOrigin: true,
    }),
    ...Object.fromEntries(
      Object.entries(COURTYARD_MODELS).map(([courtyardModelId, courtyardModelDefinition]) => [
        courtyardModelId,
        Object.freeze({
          url: withModelAssetCacheKey(
            modelAssetUrl(courtyardModelId, "lite"),
            courtyardModelId === "garden-lounger"
              ? MODEL_ASSET_CACHE_KEYS.modelOptimization
              : MODEL_ASSET_CACHE_KEYS.garden,
          ),
          fallbackUrl: withModelAssetCacheKey(
            modelAssetUrl(courtyardModelId, "full"),
            courtyardModelId === "garden-lounger"
              ? MODEL_ASSET_CACHE_KEYS.modelOptimization
              : MODEL_ASSET_CACHE_KEYS.garden,
          ),
          // 只有躺椅做了减面，其余庭院款沿用既有资源。
          optimized: courtyardModelId === "garden-lounger",
          scaleBasis: courtyardModelDefinition.size,
          preserveOrigin: true,
        }),
      ]),
    ),
    ...Object.fromEntries(
      ["sofa-single", "sofa-l", "sofa-l-left"].map((sofaVariantModelId) => [
        sofaVariantModelId,
        Object.freeze({
          url: modelAssetUrl(sofaVariantModelId, "lite"),
          fallbackUrl: modelAssetUrl(sofaVariantModelId, "full"),
          scaleBasis: sofaVariantModelId === "sofa-single" ? [1.05, 0.82, 0.9] : [2.8, 0.82, 1.6],
          preserveOrigin: true,
        }),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(DECOR_MODELS).map(([decorModelId, decorModelDefinition]) => [
        decorModelId,
        Object.freeze({
          url: modelAssetUrl(decorModelId, "lite"),
          fallbackUrl: modelAssetUrl(decorModelId, "full"),
          scaleBasis: decorModelDefinition.size,
          preserveOrigin: true,
        }),
      ]),
    ),
    sofa: createFurnitureAssetDescriptor("sofa", [2.2, 0.82, 0.9]),
    coffeetable: createFurnitureAssetDescriptor(
      "coffeetable",
      [1.9, 0.5, 1.05],
      MODEL_ASSET_CACHE_KEYS.reference,
    ),
    kitchenisland: createFurnitureAssetDescriptor("kitchenisland", [2.4, 0.9, 0.8]),
    /**
     * 真实岛台模型（4794 三角面，7 条语义槽位）。
     * `kitchenisland` 那份是 108 面的占位方盒，两者并存：目录里「岛台」卡片
     * （`data-item-type="kitchen-island"`）此前因为没登记而拖不进场景。
     */
    "kitchen-island": createFurnitureAssetDescriptor("kitchen-island", [2.143, 1.195, 0.78]),
    squarecoffeetable: createFurnitureAssetDescriptor("squarecoffeetable", [1.4, 0.46, 0.7]),
    tvstand: createFurnitureAssetDescriptor("tvstand", [1.8, 0.48, 0.42]),
    rug: createHomeAssetDescriptor("rug", {
      scaleBasis: [2, 0.012, 1.4],
      preserveOrigin: true,
    }),
    plant: createHomeAssetDescriptor("plant", {
      scaleBasis: [0.75, 1.6, 0.75],
      preserveOrigin: true,
    }),
    bed: createIndoorAssetDescriptor("bed", {
      url: withModelAssetCacheKey(
        modelAssetUrl("bed", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("bed", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      scaleBasis: [1.92, 1.02, 2.18],
      preserveOrigin: true,
      optimized: true,
    }),
    nightstand: createHomeAssetDescriptor("nightstand", {
      scaleBasis: [0.5, 0.55, 0.42],
      preserveOrigin: true,
    }),
    vanity: createFurnitureAssetDescriptor("vanity", [1.2, 1.55, 0.5]),
    desk: createHomeAssetDescriptor("desk", {
      scaleBasis: [1.4, 0.76, 0.65],
      preserveOrigin: true,
    }),
    bookcase: createHomeAssetDescriptor("bookcase", {
      scaleBasis: [1.2, 1.9, 0.32],
      preserveOrigin: true,
    }),
    /**
     * 越野车 / 踏板车 / 悬空楼梯：两档精度已经在磁盘上，之前注册表只登记
     * 了一档，另一半就成了「磁盘上有、运行时永远取不到」的孤儿文件（踏板车与越野车缺完整件
     * 兜底，悬空楼梯缺 lite 首选档）。这里一律按「lite 首选 + 完整件兜底」接线，和其余
     * 家具件同一口径：lite 走 Draco，加载快；lite 坏了自动回退，不会整件不出来。
     */
    suv: {
      url: modelAssetUrl("suv", "lite"),
      fallbackUrl: modelAssetUrl("suv", "full"),
    },
    scooter: {
      url: withModelAssetCacheKey(
        modelAssetUrl("scooter", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("scooter", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      optimized: true,
    },
    smallcar: {
      url: modelAssetUrl("car", "lite"),
      fallbackUrl: modelAssetUrl("car", "full"),
    },
    airoutlet: {
      url: modelAssetUrl("air-outlet", "lite"),
      fallbackUrl: modelAssetUrl("air-outlet", "full"),
    },
    pipelinewaterpurifier: {
      url: withModelAssetCacheKey(
        modelAssetUrl("pipeline-water-purifier", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("pipeline-water-purifier", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      optimized: true,
    },
    tea_bar_machine: {
      url: withModelAssetCacheKey(
        modelAssetUrl("tea-bar-machine", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("tea-bar-machine", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      optimized: true,
    },
    elevator: {
      url: modelAssetUrl("elevator", "lite"),
      fallbackUrl: modelAssetUrl("elevator", "full"),
    },
    steelstairs: {
      url: withModelAssetCacheKey(
        modelAssetUrl("steel-stairs", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("steel-stairs", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      optimized: true,
    },
    glassstairs: {
      url: modelAssetUrl("glass-stairs", "lite"),
      fallbackUrl: modelAssetUrl("glass-stairs", "full"),
    },
    floatingstairs: {
      url: modelAssetUrl("floating-stairs", "lite"),
      fallbackUrl: modelAssetUrl("floating-stairs", "full"),
      scaleBasis: [0.97254264, 2.59010673, 2.2483418],
      preserveOrigin: true,
    },
    piano: {
      url: withModelAssetCacheKey(
        modelAssetUrl("piano", "lite"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      fallbackUrl: withModelAssetCacheKey(
        modelAssetUrl("piano", "full"),
        MODEL_ASSET_CACHE_KEYS.modelOptimization,
      ),
      materialRevision: MODEL_ASSET_CACHE_KEYS.modelOptimization,
      preserveAspect: true,
      optimized: true,
    },
  });
const warmWoodFurnitureItemTypes = new Set([
    "sofa",
    "coffeetable",
    "kitchenisland",
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

    ...PILLAR_MODEL_ITEM_TYPES,
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
    "printer",
  ]),
  /** 「角色表优先」的模型集合：材质名只有 `<type>-material-N`（不带角色），由 studio-model-material-roles.ts 的槽位角色表接管。 */
  roleTableItemTypes = new Set([
    ...Object.keys(MODEL_SLOT_ROLES),
    ...Object.keys(MODEL_SLOT_ROLES_SEMANTIC),
    ...FAMILY_TOKEN_MODEL_IDS,
    ...Object.keys(COLLECTION_MODELS),
    "plant",
    "rug",
    "airoutlet",
    "pipelinewaterpurifier",
    "tea_bar_machine",
  ]),
  diningMaterialRolesByItemType = Object.freeze({
    table: ["wood", "wood", "linen"],
    rounddiningtable: ["wood", "wood", "wood", "linen", "wood"],
    rounddiningtable_turntable: ["wood", "wood", "wood", "wood", "ceramic", "linen", "wood"],
    chair: ["sage", "wood"],
  }),
  warmCabinetItemTypes = new Set([
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
    "glasscabinet",
  ]),
  countertopMaterialIndexByItemType = Object.freeze({
    sideboard: "0",
    shoecabinet: "2",
    nightstand: "1",
    kitchenbase: "2",
    kitchensink: "2",
    kitchencooktop: "2",
  }),
  luminancePaletteItemTypes = new Set([
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
  ]),
  applianceItemTypes = new Set([
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
    "printer",
  ]),
  gardenItemTypes = new Set([
    "tea-table-set",
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
    "floatingstairs",
    "piano",
  ]);
export {
  warmWoodFurnitureItemTypes,
  roleTableItemTypes,
  diningMaterialRolesByItemType,
  warmCabinetItemTypes,
  countertopMaterialIndexByItemType,
  luminancePaletteItemTypes,
  applianceItemTypes,
  gardenItemTypes,
};

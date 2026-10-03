import { COURTYARD_MODELS, courtyardPalette } from "../plan/courtyard-models";
import {
  prepareVehicleChargeGeometry,
  applyVehicleFinish,
} from "../studio/studio-vehicle-models";
import { decorateWarmFloor } from "../studio/studio-scene-style";
import { enlargeWarmLeaves } from "../materials/studio-warm-foliage";
import {
  applyCarFinish,
  smoothCarSurfaceNormals,
} from "../materials/studio-car-finish";
import {
  repairGlassCabinetBack,
  repairWallCabinetSides,
  repairSideboardJoints,
  repairSideboardGlassDoor,
} from "../materials/studio-cabinet-back";
import { finite } from "./studio-normalization";
import { createModelPersistentCache } from "../model-persistent-cache";
import { modelTemplateKey } from "../model-template-codec";
import { releaseModelAsset } from "./model-asset-loader";
import { DECOR_MODELS, DECOR_THEMES } from "../studio/decor-models";
import {
  MODEL_SLOT_ROLES,
  isStoneSlabFlavor,
  isStructuralModelFamily,
  materialRoleRecipeFor,
  resolveModelFamily,
  resolveModelMaterialRole,
  stoneSlabFlavorForMaterial,
  stoneSlabSurfaceFinish,
  usesNamedMaterialRole,
} from "../materials/studio-model-material-roles";
import { createStoneSlabTexture } from "../materials/studio-surface-textures";
import {
  materialStyleRecipeFor,
  materialStyleRoleColorFor,
  materialStyleStoneSlabRoles,
} from "../materials/studio-material-presets";
import {
  createFurnitureBatchCache,
  compactFurnitureIndices,
} from "../studio/studio-furniture-batching";
const homeLiteAssetVersion = "20260903-home-lite-v1",
  // 柱族换成了「一形一模型」的整套资源（含方柱），单独给一版指纹，避免整批家居模型被迫重新下载。
  pillarAssetVersion = "20261002-pillar-shapes-v1",
  applianceLiteAssetVersion = "20260921-appliance-lite-clean-guides-v2",
  sofaFamilyItemTypes = new Set(["sofa", "sofa-single", "sofa-l", "sofa-l-left"]),
  preparedRestoreTimeoutMs = 160;
function insetBedBaseGeometry(bedGeometry) {
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
/**
 * 给石材板部件补一套**平面投影 UV**（平铺坐标 = XZ 平面归一化）。
 *
 * 石材整图是按「一块整板」画的（云斑、主纹、细纹一次铺满），要贴在一次投影上才不会
 * 出现接缝。GLB 里这些板件要么没有 UV，要么带的是「立方体每面各贴一遍」的 UV —— 后者
 * 会让同一块台面上出现 6 份缩小的纹路，接缝正好落在最显眼的边上。所以这里整体改写 UV。
 *
 * XZ 平面投影的取舍：餐桌 / 茶几 / 橱柜台面都是水平板，投影上去比例正确；立柱式的石座
 * 侧面会被压成一条窄带（0.6.5 同样如此），换来的是台面那一大片纹路正确。
 */
function ensureStoneSlabPlanarUv(threeLib, slabGeometry) {
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
/**
 * 按模型给石材板部件补平面 UV。
 *
 * 判据是**纯函数**（不依赖当前选中档位）：几何 UV 会跟着模板缓存走，不能随用户换档位而变，
 * 所以只要「角色表声明了 slab」或「该模型的档位组里任何一档会给石材板」就补。多补的槽位
 * 只有在真被贴上石材图时才会用到这套 UV，其余情况是无害的占位。
 */
function applyStoneSlabPlanarUv(threeLib, modelRoot, modelType) {
  const styleSlabRoles = materialStyleStoneSlabRoles(modelType);
  modelRoot.traverse((modelMesh) => {
    // 多材质网格（材质数组）的槽位号在 mesh 内，这里按整体判断会错位，直接跳过：
    // 石材板部件都是单材质网格。
    if (!modelMesh.isMesh || Array.isArray(modelMesh.material) || !modelMesh.geometry) return;
    const materialName = modelMesh.material?.name,
      role = resolveModelMaterialRole(modelType, materialName).role;
    if (!styleSlabRoles.has(role) && !stoneSlabFlavorForMaterial(modelType, materialName)) return;
    ensureStoneSlabPlanarUv(threeLib, modelMesh.geometry);
  });
}
function createHomeAssetDescriptor(homeAssetId, homeFallbackVersion, homeAssetOverrides) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + homeAssetId + "-lite.glb?v=" + homeLiteAssetVersion,
    fallbackUrl: "/static/3d-studio/models/" + homeAssetId + ".glb?v=" + homeFallbackVersion,
    ...homeAssetOverrides,
  });
}
function createApplianceAssetDescriptor(applianceAssetId, applianceAssetOverrides) {
  return Object.freeze({
    url:
      "/static/3d-studio/models/" +
      applianceAssetId +
      "-lite.glb?v=" +
      applianceLiteAssetVersion,
    fallbackUrl:
      "/static/3d-studio/models/" +
      applianceAssetId +
      ".glb?v=20260901-all-appliance-models-v1",
    ...applianceAssetOverrides,
  });
}
function createFurnitureAssetDescriptor(furnitureAssetId, furnitureAssetScaleBasis) {
  // coffeetable / kitchenisland 在 2026-10-01 换成了 homeos-3d 的模型，单独给一版指纹，
  // 避免整批家具模型被迫重新下载。
  const furnitureAssetShippedFresh =
    furnitureAssetId === "coffeetable" || furnitureAssetId === "kitchenisland";
  return Object.freeze({
    url:
      "/static/3d-studio/models/" +
      furnitureAssetId +
      "-lite.glb?v=" +
      (furnitureAssetShippedFresh
        ? "20261001-coffeetable-island-v1"
        : furnitureAssetId === "vanity"
          ? "20260925-furniture-v1"
          : "20260926-furniture-draco-v1"),
    fallbackUrl:
      "/static/3d-studio/models/" +
      furnitureAssetId +
      ".glb?v=" +
      (furnitureAssetShippedFresh ? "20261001-coffeetable-island-v1" : "20260925-furniture-v1"),
    scaleBasis: furnitureAssetScaleBasis,
    preserveOrigin: true,
  });
}
const paletteOverrideItemTypes = new Set([
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
  // coffeetable / kitchenisland 的材质名从 <type>-furniture-<role> 换成了 material-<n>-<role>，
  // 不再命中上面的 "-furniture-" 名称判断，改为按类型显式纳入，避免非暖木配色下丢失石材质感。
  "coffeetable",
  "kitchenisland",
]);
function createIndoorAssetDescriptor(indoorAssetId, indoorAssetScaleBasis) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + indoorAssetId + "-lite.glb?v=20260928-indoor-v1",
    fallbackUrl: "/static/3d-studio/models/" + indoorAssetId + ".glb?v=20260928-indoor-v1",
    scaleBasis: indoorAssetScaleBasis,
    preserveOrigin: true,
  });
}
function createPillarAssetDescriptor(pillarAssetId) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + pillarAssetId + "-lite.glb?v=" + pillarAssetVersion,
    fallbackUrl: "/static/3d-studio/models/" + pillarAssetId + ".glb?v=" + pillarAssetVersion,
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true,
  });
}
/**
 * 自带独立 GLB 资源的异形柱形：方形柱沿用原先烘焙好的方盒，因此仍留在普通的
 * `pillar` 模型键上；其余四种造型各有独立模型。
 */
const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
/**
 * 柱族的全部**模型类型**键（含方柱）：`pillar` 与 `pillar_<形状>`。
 */
const PILLAR_MODEL_ITEM_TYPES = new Set([
  "pillar",
  ...[...PILLAR_ASSET_SHAPES].map((pillarShape) => "pillar_" + pillarShape),
]);
const EXTERNAL_ITEM_MODELS = Object.freeze({
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
      url: "/static/3d-studio/models/tea-table-set-lite.glb",
      fallbackUrl: "/static/3d-studio/models/tea-table-set.glb",
      scaleBasis: [1.61, 0.94, 1.4],
      preserveOrigin: true,
    }),
    ...Object.fromEntries(
      Object.entries(COURTYARD_MODELS).map(([courtyardModelId, courtyardModelDefinition]) => [
        courtyardModelId,
        Object.freeze({
          url:
            "/static/3d-studio/models/" +
            courtyardModelId +
            "-lite.glb?v=20260927-garden-v5",
          fallbackUrl:
            "/static/3d-studio/models/" + courtyardModelId + ".glb?v=20260927-garden-v5",
          scaleBasis: courtyardModelDefinition.size,
          preserveOrigin: true,
        }),
      ]),
    ),
    ...Object.fromEntries(
      ["sofa-single", "sofa-l", "sofa-l-left"].map((sofaVariantModelId) => [
        sofaVariantModelId,
        Object.freeze({
          url:
            "/static/3d-studio/models/" +
            sofaVariantModelId +
            "-lite.glb?v=20260926-sofa-variants-v1",
          fallbackUrl:
            "/static/3d-studio/models/" +
            sofaVariantModelId +
            ".glb?v=20260926-sofa-variants-v1",
          scaleBasis: sofaVariantModelId === "sofa-single" ? [1.05, 0.82, 0.9] : [2.8, 0.82, 1.6],
          preserveOrigin: true,
        }),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(DECOR_MODELS).map(([decorModelId, decorModelDefinition]) => [
        decorModelId,
        Object.freeze({
          url: "/static/3d-studio/models/" + decorModelId + "-lite.glb?v=20260926-decor-v1",
          fallbackUrl:
            "/static/3d-studio/models/" + decorModelId + ".glb?v=20260926-decor-v1",
          scaleBasis: decorModelDefinition.size,
          preserveOrigin: true,
        }),
      ]),
    ),
    sofa: createFurnitureAssetDescriptor("sofa", [2.2, 0.82, 0.9]),
    coffeetable: createFurnitureAssetDescriptor("coffeetable", [1.9, 0.5, 1.05]),
    kitchenisland: createFurnitureAssetDescriptor("kitchenisland", [2.4, 0.9, 0.8]),
    squarecoffeetable: createFurnitureAssetDescriptor("squarecoffeetable", [1.4, 0.46, 0.7]),
    tvstand: createFurnitureAssetDescriptor("tvstand", [1.8, 0.48, 0.42]),
    rug: createHomeAssetDescriptor("rug", "20260901-home-assets-v1", {
      scaleBasis: [2, 0.012, 1.4],
      preserveOrigin: true,
    }),
    plant: createHomeAssetDescriptor("plant", "20260901-home-assets-v1", {
      scaleBasis: [0.75, 1.6, 0.75],
      preserveOrigin: true,
    }),
    bed: createIndoorAssetDescriptor("bed", [1.92, 1.02, 2.18]),
    nightstand: createHomeAssetDescriptor("nightstand", "20260901-home-furniture-v1", {
      scaleBasis: [0.5, 0.55, 0.42],
      preserveOrigin: true,
    }),
    vanity: createFurnitureAssetDescriptor("vanity", [1.2, 1.55, 0.5]),
    desk: createHomeAssetDescriptor("desk", "20260901-home-furniture-v1", {
      scaleBasis: [1.4, 0.76, 0.65],
      preserveOrigin: true,
    }),
    bookcase: createHomeAssetDescriptor("bookcase", "20260901-home-furniture-v1", {
      scaleBasis: [1.2, 1.9, 0.32],
      preserveOrigin: true,
    }),
    suv: {
      url: "/static/3d-studio/models/suv-lite.glb",
    },
    scooter: {
      url: "/static/3d-studio/models/scooter-lite.glb",
    },
    smallcar: {
      url: "/static/3d-studio/models/car-lite.glb",
      fallbackUrl: "/static/3d-studio/models/car.glb",
    },
    airoutlet: {
      url: "/static/3d-studio/models/air-outlet-lite.glb",
      fallbackUrl: "/static/3d-studio/models/air-outlet.glb",
    },
    pipelinewaterpurifier: {
      url: "/static/3d-studio/models/pipeline-water-purifier-lite.glb",
      fallbackUrl:
        "/static/3d-studio/models/pipeline-water-purifier.glb",
    },
    tea_bar_machine: {
      url: "/static/3d-studio/models/tea-bar-machine-lite.glb",
      fallbackUrl: "/static/3d-studio/models/tea-bar-machine.glb",
    },
    elevator: {
      url: "/static/3d-studio/models/elevator-lite.glb",
      fallbackUrl: "/static/3d-studio/models/elevator.glb",
    },
    steelstairs: {
      url: "/static/3d-studio/models/steel-stairs-lite.glb",
      fallbackUrl: "/static/3d-studio/models/steel-stairs.glb",
    },
    glassstairs: {
      url: "/static/3d-studio/models/glass-stairs-lite.glb",
      fallbackUrl: "/static/3d-studio/models/glass-stairs.glb",
    },
    floatingstairs: {
      url: "/static/3d-studio/models/floating-stairs.glb",
      scaleBasis: [0.97254264, 2.59010673, 2.2483418],
      preserveOrigin: true,
    },
    piano: {
      url: "/static/3d-studio/models/piano-lite.glb",
      fallbackUrl: "/static/3d-studio/models/piano.glb",
      materialRevision: "20260914-piano-surface-shadow-v1",
      preserveAspect: true,
    },
  });
export const ALL_ITEM_MODELS = Object.freeze({
    ...EXTERNAL_ITEM_MODELS,
    bed: createIndoorAssetDescriptor("bed", [1.92, 1.02, 2.18]),
    nightstand: createHomeAssetDescriptor("nightstand", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.5, 0.55, 0.42],
      preserveOrigin: true,
    }),
    vanity: createFurnitureAssetDescriptor("vanity", [1.2, 1.55, 0.5]),
    desk: createHomeAssetDescriptor("desk", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.4, 0.76, 0.65],
      preserveOrigin: true,
    }),
    bookcase: createHomeAssetDescriptor("bookcase", "20260912-cabinet-back-v4", {
      url: "/static/3d-studio/models/bookcase-lite.glb",
      scaleBasis: [1.2, 1.9, 0.32],
      preserveOrigin: true,
    }),
    aquarium: createHomeAssetDescriptor("aquarium", "20260928-aquarium-v2", {
      url: "/static/3d-studio/models/aquarium-lite.glb",
      scaleBasis: [1.5, 1.4, 0.55],
      preserveOrigin: true,
    }),
    table: createFurnitureAssetDescriptor("table", [2.4, 0.82, 1.8]),
    rounddiningtable: createFurnitureAssetDescriptor("rounddiningtable", [2.2, 0.78, 2.2]),
    chair: createFurnitureAssetDescriptor("chair", [0.5, 0.86, 0.5]),
    bar: createHomeAssetDescriptor("bar", "20260901-all-home-furniture-v1", {
      scaleBasis: [2.2, 1.05, 0.65],
      preserveOrigin: true,
    }),
    sideboard: createHomeAssetDescriptor("sideboard", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.6, 2.2, 0.45],
      preserveOrigin: true,
      geometryRevision: "20260925-sideboard-joints-v1",
    }),
    shoecabinet: createHomeAssetDescriptor("shoecabinet", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.8, 2.25, 0.42],
      preserveOrigin: true,
    }),
    cabinet: createHomeAssetDescriptor("cabinet", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.6, 1.9, 0.45],
      preserveOrigin: true,
    }),
    glasscabinet: createHomeAssetDescriptor("glasscabinet", "20260912-cabinet-back-v2", {
      url: "/static/3d-studio/models/glasscabinet-lite.glb",
      scaleBasis: [1.2, 1.9, 0.4],
      preserveOrigin: true,
    }),
    shelf: createHomeAssetDescriptor("shelf", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.2, 1.8, 0.45],
      preserveOrigin: true,
    }),
    wallcabinet: createHomeAssetDescriptor("wallcabinet", "20260912-cabinet-sides-v1", {
      url: "/static/3d-studio/models/wallcabinet-lite.glb",
      scaleBasis: [1.5, 0.82, 0.35],
      preserveOrigin: true,
    }),
    kitchenbase: createHomeAssetDescriptor("kitchenbase", "20260901-all-home-furniture-v1", {
      scaleBasis: [2.4, 0.85, 0.6],
      preserveOrigin: true,
    }),
    kitchensink: createHomeAssetDescriptor("kitchensink", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.2, 0.85, 0.6],
      preserveOrigin: true,
    }),
    kitchencooktop: createHomeAssetDescriptor("kitchencooktop", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.2, 0.85, 0.6],
      preserveOrigin: true,
    }),
    basin: createHomeAssetDescriptor("basin", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.9, 0.88, 0.5],
      preserveOrigin: true,
    }),
    toilet: createHomeAssetDescriptor("toilet", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.42, 0.52, 0.7],
      preserveOrigin: true,
    }),
    squattoilet: createHomeAssetDescriptor("squattoilet", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.45, 0.18, 0.65],
      preserveOrigin: true,
    }),
    urinal: createHomeAssetDescriptor("urinal", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.38, 0.72, 0.34],
      preserveOrigin: true,
    }),
    shower: createHomeAssetDescriptor("shower", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.9, 2.1, 0.9],
      preserveOrigin: true,
    }),
    bathtub: createHomeAssetDescriptor("bathtub", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.7, 0.58, 0.78],
      preserveOrigin: true,
    }),
    glasspartition: createHomeAssetDescriptor("glasspartition", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.2, 2, 0.08],
      preserveOrigin: true,
    }),
    stairs: createHomeAssetDescriptor("stairs", "20260901-all-home-furniture-v1", {
      scaleBasis: [1, 1.65, 2.8],
      preserveOrigin: true,
    }),
    pillar: createPillarAssetDescriptor("pillar"),
    pillar_round: createPillarAssetDescriptor("pillar-round"),
    pillar_semicircle: createPillarAssetDescriptor("pillar-semicircle"),
    pillar_quarter: createPillarAssetDescriptor("pillar-quarter"),
    pillar_quarterinner: createPillarAssetDescriptor("pillar-quarterinner"),
    curtain_left: createHomeAssetDescriptor("curtain_left", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.8, 2.4, 0.18],
      preserveOrigin: true,
    }),
    curtain_right: createHomeAssetDescriptor("curtain_right", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.8, 2.4, 0.18],
      preserveOrigin: true,
    }),
    curtain_split: createHomeAssetDescriptor("curtain_split", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.8, 2.4, 0.18],
      preserveOrigin: true,
    }),
    rounddiningtable_turntable: createFurnitureAssetDescriptor(
      "rounddiningtable_turntable",
      [2.2, 0.78, 2.2],
    ),
    tv_standard: createApplianceAssetDescriptor("tv_standard", {
      scaleBasis: [1.5, 0.92, 0.18],
      preserveOrigin: true,
    }),
    tv_tabletop: createApplianceAssetDescriptor("tv_tabletop", {
      scaleBasis: [1.5, 0.92, 0.18],
      preserveOrigin: true,
    }),
    tv_mobile: createApplianceAssetDescriptor("tv_mobile", {
      scaleBasis: [1.5, 0.92, 0.18],
      preserveOrigin: true,
    }),
    wallac: createApplianceAssetDescriptor("wallac", {
      scaleBasis: [0.9, 0.28, 0.22],
      preserveOrigin: true,
    }),
    floorac: createApplianceAssetDescriptor("floorac", {
      url: "/static/3d-studio/models/floorac-lite.glb",
      fallbackUrl: "/static/3d-studio/models/floorac.glb",
      scaleBasis: [0.42, 1.75, 0.42],
      preserveOrigin: true,
    }),
    airpurifier: createApplianceAssetDescriptor("airpurifier", {
      url: "/static/3d-studio/models/airpurifier-lite.glb",
      fallbackUrl: "/static/3d-studio/models/airpurifier.glb",
      scaleBasis: [0.34, 0.7, 0.34],
      preserveOrigin: true,
    }),
    robotvacuum: createApplianceAssetDescriptor("robotvacuum", {
      url: "/static/3d-studio/models/robotvacuum-lite.glb",
      fallbackUrl: "/static/3d-studio/models/robotvacuum.glb",
      scaleBasis: [0.55, 0.85, 0.5],
      preserveOrigin: true,
    }),
    floorlamp: createApplianceAssetDescriptor("floorlamp", {
      scaleBasis: [1.35, 1.8, 0.5],
      preserveOrigin: true,
    }),
    walllamp: createApplianceAssetDescriptor("walllamp", {
      scaleBasis: [0.3, 0.34, 0.22],
      preserveOrigin: true,
    }),
    fridge: createApplianceAssetDescriptor("fridge", {
      scaleBasis: [0.75, 1.85, 0.72],
      preserveOrigin: true,
    }),
    // 卧式冰柜：占地方向是「宽 × 深」的长边在前，与它顶开盖的造型一致。
    freezer: createApplianceAssetDescriptor("freezer", {
      scaleBasis: [1.05, 0.85, 0.6],
      preserveOrigin: true,
    }),
    rangehood: createApplianceAssetDescriptor("rangehood", {
      scaleBasis: [0.9, 0.55, 0.45],
      preserveOrigin: true,
    }),
    dishwasher: createApplianceAssetDescriptor("dishwasher", {
      scaleBasis: [0.6, 0.82, 0.6],
      preserveOrigin: true,
    }),
    steamoven: createApplianceAssetDescriptor("steamoven", {
      scaleBasis: [0.6, 0.6, 0.55],
      preserveOrigin: true,
    }),
    microwave: createApplianceAssetDescriptor("microwave", {
      scaleBasis: [0.52, 0.32, 0.42],
      preserveOrigin: true,
    }),
    ricecooker: createApplianceAssetDescriptor("ricecooker", {
      scaleBasis: [0.28, 0.25, 0.32],
      preserveOrigin: true,
    }),
    washer: createApplianceAssetDescriptor("washer", {
      scaleBasis: [0.6, 0.85, 0.65],
      preserveOrigin: true,
    }),
    dryer: createApplianceAssetDescriptor("dryer", {
      scaleBasis: [0.6, 0.85, 0.65],
      preserveOrigin: true,
    }),
    storagewaterheater: createApplianceAssetDescriptor("storagewaterheater", {
      url: "/static/3d-studio/models/storagewaterheater-lite.glb",
      fallbackUrl:
        "/static/3d-studio/models/storagewaterheater.glb",
      scaleBasis: [0.86, 0.48, 0.46],
      preserveOrigin: true,
    }),
    gaswaterheater: createApplianceAssetDescriptor("gaswaterheater", {
      url: "/static/3d-studio/models/gaswaterheater-lite.glb",
      fallbackUrl: "/static/3d-studio/models/gaswaterheater.glb",
      scaleBasis: [0.42, 0.72, 0.22],
      preserveOrigin: true,
    }),
    desktop: createApplianceAssetDescriptor("desktop", {
      url: "/static/3d-studio/models/desktop-lite.glb",
      fallbackUrl: "/static/3d-studio/models/desktop.glb",
      scaleBasis: [0.72, 0.5, 0.32],
      preserveOrigin: true,
    }),
    laptop: createApplianceAssetDescriptor("laptop", {
      url: "/static/3d-studio/models/laptop-lite.glb",
      fallbackUrl: "/static/3d-studio/models/laptop.glb",
      scaleBasis: [0.36, 0.22, 0.28],
      preserveOrigin: true,
    }),
    printer: createApplianceAssetDescriptor("printer", {
      url: "/static/3d-studio/models/printer-lite.glb",
      fallbackUrl: "/static/3d-studio/models/printer.glb",
      scaleBasis: [0.44, 0.3, 0.36],
      preserveOrigin: true,
    }),
    nas: createApplianceAssetDescriptor("nas", {
      url: "/static/3d-studio/models/nas-lite.glb",
      fallbackUrl: "/static/3d-studio/models/nas.glb",
      scaleBasis: [0.28, 0.205, 0.24],
      preserveOrigin: true,
    }),
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
    // 柱族五件：材质要跟着**墙色**走（见 applyWarmWoodFurnitureMaterial 的柱分支）。
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
  /**
   * 「角色表优先」的模型集合：材质名只有 `<type>-material-N`（不带角色），
   * 之前靠亮度 / 槽位号启发式着色，现在由 studio-model-material-roles.ts 的槽位角色表接管。
   * 楼梯 / 车辆 / 柱族 / 灯具等结构型模型仍走各自专用函数（角色表只提供数据）。
   */
  roleTableItemTypes = new Set([
    ...Object.keys(MODEL_SLOT_ROLES),
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
/** 外模型加载状态；onLoadStateChange 回调与 collectLoadState 共用同一形状。 */
type ExternalModelLoadState = {
  /** 正在加载的数量。 */
  active: number;
  /** 已开始加载（去重后）的条目数。 */
  pending: number;
  /** 队列里等待的数量。 */
  queued: number;
  /** 并发上限。 */
  limit: number;
  /** 单项加载超时（毫秒）。 */
  timeoutMs: number;
  /** 材质缓存条目数。 */
  materials: number;
  /** 材质复用命中次数。 */
  materialReuses: number;
};

/** createPaletteMaterial 的材质覆盖项。 */
type PaletteMaterialOptions = {
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  /** 启用 polygonOffset（避免细节件与主体 z-fighting）。 */
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
};

/**
 * 外模型附加样式选项。既当开关用（warmWood），也当暖木色板用：
 * 色板键由 studio-scene-style / studio-vehicle-models 等子系统各自消费，
 * 所以除 warmWood 外保持开放键（签名去重也依赖“键集合”本身）。
 */
type ExternalModelStyleOptions = {
  /** 其余样式键：各子系统的调色板字段。 */
  [styleKey: string]: any;
  /** 暖木色系家具材质总开关。 */
  warmWood?: boolean;
};

export function createExternalModelManager({
  THREE: threeNamespace,
  loader: assetLoader,
  stairItemTypes: stairItemTypes,
  isModelInUse: isModelInUse,
  requestRender: requestRender,
  onLoadStateChange = (_loadState: ExternalModelLoadState) => {},
  maxConcurrentLoads = 2,
  loadTimeoutMs = 12000,
  retryDelayMs = 5000,
  maxAutomaticRetries = 2,
  lifecycle: lifecycleTarget = globalThis.window,
  persistentCache = createModelPersistentCache({
    THREE: threeNamespace,
  }),
}) {
  const preparedTemplatesByItemType = new Map(),
    inflightLoadsByItemType = new Map(),
    restorePromisesByItemType = new Map(),
    loadQueue = [],
    activeItemTypes = new Set(),
    retryStateByItemType = new Map(),
    pendingCancelResolvers = new Set<(inFlightResult: any) => void>(),
    activeTimeoutHandles = new Set<ReturnType<typeof setTimeout>>();
  let isDisposed = false;
  const materialCacheBySignature = new Map(),
    materialVariantsBySource = new WeakMap(),
    geometryVariantsBySource = new WeakMap(),
    furnitureBatchCache = createFurnitureBatchCache(threeNamespace),
    effectiveConcurrentLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2))),
    effectiveLoadTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  let activeLoadCount = 0,
    materialReuseCount = 0;
  function collectLoadState(): ExternalModelLoadState {
    return {
      active: activeLoadCount,
      pending: activeItemTypes.size,
      queued: loadQueue.length,
      limit: effectiveConcurrentLimit,
      timeoutMs: effectiveLoadTimeoutMs,
      materials: materialCacheBySignature.size,
      materialReuses: materialReuseCount,
    };
  }
  function notifyLoadStateChange() {
    isDisposed || onLoadStateChange(collectLoadState());
  }
  function pumpLoadQueue() {
    for (; !isDisposed && activeLoadCount < effectiveConcurrentLimit && loadQueue.length;) {
      const queuedLoadEntry = loadQueue.shift();
      ((activeLoadCount += 1),
        notifyLoadStateChange(),
        Promise.resolve()
          .then(() => (isDisposed ? null : queuedLoadEntry.run()))
          .then(queuedLoadEntry.resolve, queuedLoadEntry.reject)
          .finally(() => {
            ((activeLoadCount -= 1), pumpLoadQueue(), notifyLoadStateChange());
          }));
    }
  }
  function enqueueLoadTask(loadTaskRunner) {
    return isDisposed
      ? Promise.resolve(null)
      : new Promise((resolveLoadTask, rejectLoadTask) => {
          (loadQueue.push({
            run: loadTaskRunner,
            resolve: resolveLoadTask,
            reject: rejectLoadTask,
          }),
            notifyLoadStateChange(),
            pumpLoadQueue());
        });
  }
  async function loadTemplateForItem(
    itemDefinition,
    itemTypeName,
    { skipPersistentRestore = false } = {},
  ) {
    const templateCacheKey = modelTemplateKey(threeNamespace, itemTypeName, itemDefinition),
      restoredPreparedTemplate = skipPersistentRestore
        ? null
        : await persistentCache.restore(templateCacheKey);
    if (restoredPreparedTemplate)
      return {
        preparedTemplate: restoredPreparedTemplate,
      };
    if (!itemDefinition?.url) throw new Error("模型 " + itemTypeName + " 没有可用资源");
    try {
      return {
        ...(await assetLoader.loadAsync(itemDefinition.url)),
        preparedCacheKey: templateCacheKey,
      };
    } catch (primaryLoadError) {
      if (isDisposed || !itemDefinition.fallbackUrl) throw primaryLoadError;
      try {
        return await assetLoader.loadAsync(itemDefinition.fallbackUrl);
      } catch (fallbackLoadError) {
        throw new AggregateError(
          [primaryLoadError, fallbackLoadError],
          "模型 " + itemTypeName + " 的主资源和备用资源均不可用",
        );
      }
    }
  }
  function scheduleTimeout(onTimeoutElapsed, timeoutDelayMs) {
    const scheduledTimeoutHandle = setTimeout(() => {
      (activeTimeoutHandles.delete(scheduledTimeoutHandle), onTimeoutElapsed());
    }, timeoutDelayMs);
    return (activeTimeoutHandles.add(scheduledTimeoutHandle), scheduledTimeoutHandle);
  }
  function cancelScheduledTimeout(timeoutHandleToCancel) {
    (clearTimeout(timeoutHandleToCancel), activeTimeoutHandles.delete(timeoutHandleToCancel));
  }
  function isPermanentAssetFailure(assetLoadError) {
    return Array.isArray(assetLoadError?.errors)
      ? assetLoadError.errors.every(isPermanentAssetFailure)
      : [404, 410].includes(Number(assetLoadError?.response?.status ?? assetLoadError?.status));
  }
  function recordLoadFailure(failedItemTypeName, failureCause) {
    const attemptCount = (retryStateByItemType.get(failedItemTypeName)?.attempts || 0) + 1,
      isPermanentFailure = isPermanentAssetFailure(failureCause),
      retryDelayForAttemptMs = isPermanentFailure
        ? 300000
        : Math.min(60000, Math.max(50, retryDelayMs) * 3 ** (attemptCount - 1)),
      retryStateEntry = {
        attempts: attemptCount,
        permanent: isPermanentFailure,
        retryAt: Date.now() + retryDelayForAttemptMs,
        timer: null,
      };
    (retryStateByItemType.set(failedItemTypeName, retryStateEntry),
      !isPermanentFailure &&
        attemptCount <= Math.max(0, maxAutomaticRetries) &&
        ((retryStateEntry.timer = scheduleTimeout(() => {
          ((retryStateEntry.timer = null),
            (retryStateEntry.retryAt = 0),
            !isDisposed &&
              isModelInUse(failedItemTypeName) &&
              lifecycleTarget?.navigator?.onLine !== false &&
              loadExternalItemModel(failedItemTypeName));
        }, retryDelayForAttemptMs)),
        retryStateEntry.timer.unref?.()),
      globalThis.window?.HomeOSLog?.error(
        failureCause,
        {
          phase: "studio-model-load",
        },
        "无法载入外部模型 " + failedItemTypeName + "：" + (failureCause?.message || failureCause),
      ),
      console.error("无法载入外部模型 " + failedItemTypeName, failureCause));
  }
  function retryPendingModels() {
    if (!isDisposed) {
      for (const [retryItemType, retryEntry] of retryStateByItemType)
        retryEntry.permanent ||
          (cancelScheduledTimeout(retryEntry.timer),
          retryStateByItemType.delete(retryItemType),
          isModelInUse(retryItemType) && loadExternalItemModel(retryItemType));
    }
  }
  function disposeModelManager() {
    if (!isDisposed) {
      ((isDisposed = true),
        assetLoader.dispose?.(),
        furnitureBatchCache.dispose(),
        lifecycleTarget?.removeEventListener?.("online", retryPendingModels),
        lifecycleTarget?.removeEventListener?.("pagehide", disposeModelManager));
      for (const timeoutHandleToClear of activeTimeoutHandles) clearTimeout(timeoutHandleToClear);
      activeTimeoutHandles.clear();
      for (const cancelResolver of pendingCancelResolvers) cancelResolver(null);
      pendingCancelResolvers.clear();
      for (const discardedQueueEntry of loadQueue.splice(0)) discardedQueueEntry.resolve(null);
      (activeItemTypes.clear(),
        retryStateByItemType.clear(),
        inflightLoadsByItemType.clear(),
        restorePromisesByItemType.clear());
    }
  }
  (lifecycleTarget?.addEventListener?.("online", retryPendingModels),
    lifecycleTarget?.addEventListener?.("pagehide", disposeModelManager, {
      once: true,
    }));
  function resolveModelTypeForItem(item: any): string {
    return item.type === "sofa-l"
      ? item.sofaChaiseSide === "left"
        ? "sofa-l-left"
        : "sofa-l"
      : item.type === "pillar"
        ? PILLAR_ASSET_SHAPES.has(item.pillarShape)
          ? "pillar_" + item.pillarShape
          : "pillar"
        : item.type === "curtain"
          ? "curtain_" +
            (["left", "right", "split"].includes(item.curtainPosition)
              ? item.curtainPosition
              : "split")
          : item.type === "rounddiningtable" &&
              (item.roundTableTurntable === true || item.type === "rounddiningtableturntable")
            ? "rounddiningtable_turntable"
            : item.type === "tv"
              ? "tv_" +
                (["standard", "tabletop", "mobile"].includes(item.tvMountStyle)
                  ? item.tvMountStyle
                  : "standard")
              : item.type;
  }
  function preloadPersistentModels(itemTypeList = []) {
    if (isDisposed) return Promise.resolve([]);
    const restoredTemplatePromises = [...new Set(itemTypeList)]
      .filter((requestedItemType) => ALL_ITEM_MODELS[requestedItemType])
      .map((resolvedItemType) => {
        if (preparedTemplatesByItemType.has(resolvedItemType))
          return Promise.resolve(preparedTemplatesByItemType.get(resolvedItemType));
        if (inflightLoadsByItemType.has(resolvedItemType))
          return inflightLoadsByItemType.get(resolvedItemType);
        if (restorePromisesByItemType.has(resolvedItemType))
          return restorePromisesByItemType.get(resolvedItemType);
        const cachedModelDefinition = ALL_ITEM_MODELS[resolvedItemType],
          pendingRestorePromise = Promise.resolve()
            .then(() =>
              persistentCache.restore(
                modelTemplateKey(threeNamespace, resolvedItemType, cachedModelDefinition),
              ),
            )
            .then((restoredTemplate) =>
              isDisposed
                ? (releaseModelAsset(restoredTemplate), null)
                : (restoredTemplate &&
                    !preparedTemplatesByItemType.has(resolvedItemType) &&
                    !inflightLoadsByItemType.has(resolvedItemType) &&
                    (compactFurnitureIndices(
                      threeNamespace,
                      restoredTemplate.source,
                      resolvedItemType,
                    ),
                    preparedTemplatesByItemType.set(resolvedItemType, restoredTemplate)),
                  restoredTemplate),
            )
            .catch(() => null)
            .finally(() => {
              restorePromisesByItemType.get(resolvedItemType) === pendingRestorePromise &&
                restorePromisesByItemType.delete(resolvedItemType);
            });
        return (
          restorePromisesByItemType.set(resolvedItemType, pendingRestorePromise),
          pendingRestorePromise
        );
      });
    return Promise.all(restoredTemplatePromises);
  }
  function applyLoadedTemplate(loadedItemType, loadResult) {
    if (isDisposed) return (releaseModelAsset(loadResult), null);
    if (!loadResult) return null;
    if (loadResult.preparedTemplate)
      return (
        compactFurnitureIndices(threeNamespace, loadResult.preparedTemplate.source, loadedItemType),
        retryStateByItemType.delete(loadedItemType),
        preparedTemplatesByItemType.set(loadedItemType, loadResult.preparedTemplate),
        isModelInUse(loadedItemType) &&
          requestRender({
            force: true,
          }),
        loadResult.preparedTemplate
      );
    const templateScene = loadResult.scene || loadResult.scenes?.[0];
    if (!templateScene) throw new Error("模型 " + loadedItemType + " 没有可显示的场景");
    // 石材板补平面 UV 必须在压紧图元索引**之前**：那一步会合并 / 重建几何，
    // 之后再补 UV 就得为每个合并后的几何单独算一遍。
    applyStoneSlabPlanarUv(threeNamespace, templateScene, loadedItemType);
    if (
      (compactFurnitureIndices(threeNamespace, templateScene, loadedItemType),
      (loadedItemType === "glasscabinet" || loadedItemType === "bookcase") &&
        repairGlassCabinetBack(threeNamespace, templateScene, loadedItemType),
      loadedItemType === "wallcabinet" && repairWallCabinetSides(threeNamespace, templateScene),
      loadedItemType === "sideboard" && repairSideboardJoints(threeNamespace, templateScene),
      loadedItemType === "sideboard" && repairSideboardGlassDoor(threeNamespace, templateScene),
      ["suv", "scooter"].includes(loadedItemType) &&
        prepareVehicleChargeGeometry(threeNamespace, templateScene),
      loadedItemType === "smallcar")
    ) {
      const smoothedGeometryByOriginal = new Map();
      templateScene.traverse((carMesh) => {
        if (!carMesh.isMesh) return;
        const originalGeometry = carMesh.geometry;
        (smoothedGeometryByOriginal.has(originalGeometry) ||
          smoothedGeometryByOriginal.set(
            originalGeometry,
            smoothCarSurfaceNormals(threeNamespace, originalGeometry),
          ),
          (carMesh.geometry = smoothedGeometryByOriginal.get(originalGeometry)));
      });
      for (const [cachedGeometry, smoothedGeometry] of smoothedGeometryByOriginal)
        cachedGeometry !== smoothedGeometry && cachedGeometry.dispose();
    }
    (loadedItemType === "bed" &&
      templateScene.traverse((bedMesh) => {
        bedMesh.isMesh && (bedMesh.geometry = insetBedBaseGeometry(bedMesh.geometry));
      }),
      templateScene.updateMatrixWorld(true));
    const modelSize = new threeNamespace.Box3()
      .setFromObject(templateScene)
      .getSize(new threeNamespace.Vector3());
    if (
      ![modelSize.x, modelSize.y, modelSize.z].every(
        (sizeAxis) => Number.isFinite(sizeAxis) && sizeAxis > 0.001,
      )
    )
      throw new Error("模型 " + loadedItemType + " 的尺寸无效");
    const loadedModelEntry = {
      source: templateScene,
      size: modelSize,
    };
    if (
      (retryStateByItemType.delete(loadedItemType),
      preparedTemplatesByItemType.set(loadedItemType, loadedModelEntry),
      loadResult.preparedCacheKey)
    )
      try {
        persistentCache.schedule(loadResult.preparedCacheKey, loadedModelEntry);
      } catch {}
    return (
      isModelInUse(loadedItemType) &&
        requestRender({
          force: true,
        }),
      loadedModelEntry
    );
  }
  function loadExternalItemModel(modelItemType) {
    if (isDisposed) return Promise.resolve(null);
    if (
      typeof window < "u" &&
      window.externalModelLoadsDeferred &&
      !window.__homeosReleasingDeferredModels
    )
      return (window.__homeosDeferExternalModel?.(modelItemType), Promise.resolve(null));
    if (preparedTemplatesByItemType.has(modelItemType))
      return Promise.resolve(preparedTemplatesByItemType.get(modelItemType));
    if (inflightLoadsByItemType.has(modelItemType))
      return inflightLoadsByItemType.get(modelItemType);
    const targetModelDefinition = ALL_ITEM_MODELS[modelItemType];
    if (!targetModelDefinition) return Promise.resolve(null);
    const retryState = retryStateByItemType.get(modelItemType);
    if (retryState && Date.now() < retryState.retryAt) return Promise.resolve(null);
    retryState && cancelScheduledTimeout(retryState.timer);
    const sharedRestorePromise = restorePromisesByItemType.get(modelItemType),
      restoreCacheKey = modelTemplateKey(threeNamespace, modelItemType, targetModelDefinition),
      restorePromise =
        sharedRestorePromise ||
        Promise.resolve()
          .then(() => persistentCache.restore(restoreCacheKey))
          .catch(() => null);
    let queuedTaskPromise = null;
    const startQueuedLoad = () =>
      (queuedTaskPromise ||= enqueueLoadTask(async () => {
        const preparedTemplateFromLoad = await loadTemplateForItem(
          targetModelDefinition,
          modelItemType,
          {
            skipPersistentRestore: true,
          },
        );
        try {
          return applyLoadedTemplate(modelItemType, preparedTemplateFromLoad);
        } catch (applyPreparedError) {
          throw (releaseModelAsset(preparedTemplateFromLoad), applyPreparedError);
        }
      }));
    let settleInFlightLoad;
    const inFlightLoadPromise = new Promise((resolveInFlightLoad) => {
      settleInFlightLoad = (inFlightResult) => {
        pendingCancelResolvers.delete(settleInFlightLoad) &&
          (activeItemTypes.delete(modelItemType),
          cancelScheduledTimeout(hardTimeoutHandle),
          resolveInFlightLoad(inFlightResult),
          notifyLoadStateChange());
      };
    });
    (pendingCancelResolvers.add(settleInFlightLoad),
      inflightLoadsByItemType.set(modelItemType, inFlightLoadPromise),
      activeItemTypes.add(modelItemType));
    const hardTimeoutHandle = scheduleTimeout(
      () => settleInFlightLoad(null),
      effectiveLoadTimeoutMs,
    );
    return (
      notifyLoadStateChange(),
      new Promise((resolveOuterLoad, rejectOuterLoad) => {
        let isLoadSettled = false,
          restoreTimeoutHandle = null;
        const completeLoad = () => {
          if (!isLoadSettled) {
            if (
              ((isLoadSettled = true), cancelScheduledTimeout(restoreTimeoutHandle), isDisposed)
            ) {
              resolveOuterLoad(null);
              return;
            }
            startQueuedLoad().then(resolveOuterLoad, rejectOuterLoad);
          }
        };
        ((restoreTimeoutHandle = scheduleTimeout(completeLoad, preparedRestoreTimeoutMs)),
          restorePromise.then((preparedTemplateResult) => {
            if (isLoadSettled) {
              preparedTemplateResult &&
                preparedTemplatesByItemType.get(modelItemType) !== preparedTemplateResult &&
                releaseModelAsset(preparedTemplateResult);
              return;
            }
            if ((cancelScheduledTimeout(restoreTimeoutHandle), preparedTemplateResult)) {
              isLoadSettled = true;
              try {
                resolveOuterLoad(
                  applyLoadedTemplate(modelItemType, {
                    preparedTemplate: preparedTemplateResult,
                  }),
                );
              } catch (preparedApplyError) {
                (releaseModelAsset(preparedTemplateResult), rejectOuterLoad(preparedApplyError));
              }
            } else completeLoad();
          }, completeLoad));
      })
        .catch(
          (loadAttemptError) => (
            isDisposed || recordLoadFailure(modelItemType, loadAttemptError),
            null
          ),
        )
        .then(settleInFlightLoad)
        .finally(() => inflightLoadsByItemType.delete(modelItemType)),
      inFlightLoadPromise
    );
  }
  function applyDefaultPaletteMaterial(originalMaterial, paletteColors) {
    if (!originalMaterial) return originalMaterial;
    const baseColor = originalMaterial.color?.clone?.() || new threeNamespace.Color(16777215),
      baseLuminance = baseColor.r * 0.2126 + baseColor.g * 0.7152 + baseColor.b * 0.0722,
      paletteColor =
        baseLuminance < 0.1
          ? paletteColors.furnitureDark
          : baseLuminance < 0.42
            ? paletteColors.furniture
            : baseLuminance < 0.72
              ? paletteColors.furnitureSoft
              : paletteColors.furnitureLight,
      emissiveBaseColor = new threeNamespace.Color(paletteColor).multiplyScalar(0.34),
      defaultPaletteMaterial = new threeNamespace.MeshStandardMaterial({
        color: emissiveBaseColor,
        roughness: baseLuminance < 0.1 ? 0.34 : baseLuminance < 0.42 ? 0.52 : 0.58,
        metalness: baseLuminance < 0.1 ? 0.22 : 0.04,
        emissive: paletteColor,
        emissiveIntensity: 0.46,
        side: originalMaterial.side ?? threeNamespace.FrontSide,
        transparent: false,
        opacity: 1,
        depthWrite: originalMaterial.depthWrite ?? true,
        depthTest: originalMaterial.depthTest ?? true,
        toneMapped: true,
      });
    return (
      (defaultPaletteMaterial.name =
        (originalMaterial.name || "external-model") + " · HomeOS palette"),
      defaultPaletteMaterial
    );
  }
  function createPaletteMaterial(
    templateMaterial,
    materialColor,
    materialOptions: PaletteMaterialOptions = {},
  ) {
    if (!templateMaterial) return templateMaterial;
    const derivedMaterial = new threeNamespace.MeshStandardMaterial({
      color: materialColor,
      roughness: materialOptions.roughness ?? 0.58,
      metalness: materialOptions.metalness ?? 0.04,
      flatShading: materialOptions.flatShading ?? false,
      emissive: 0,
      emissiveIntensity: 0,
      side: templateMaterial.side ?? threeNamespace.FrontSide,
      transparent: materialOptions.transparent ?? false,
      opacity: materialOptions.opacity ?? 1,
      depthWrite: materialOptions.depthWrite ?? templateMaterial.depthWrite ?? true,
      depthTest: templateMaterial.depthTest ?? true,
      toneMapped: true,
    });
    return (
      (derivedMaterial.name =
        (templateMaterial.name || "external-model") + " · HomeOS furniture material"),
      (derivedMaterial.polygonOffset = materialOptions.polygonOffset === true),
      (derivedMaterial.polygonOffsetFactor = materialOptions.polygonOffsetFactor ?? 0),
      (derivedMaterial.polygonOffsetUnits = materialOptions.polygonOffsetUnits ?? 0),
      derivedMaterial
    );
  }
  function applyWarmWoodFurnitureMaterial(meshMaterial, warmPalette, furnitureItemType) {
    const isWarmCabinetItem = warmPalette.warmWood && warmCabinetItemTypes.has(furnitureItemType);
    (isWarmCabinetItem &&
      (warmPalette = {
        ...warmPalette,
        wood: warmPalette.cabinetWood ?? warmPalette.wood,
      }),
      warmPalette.warmWood &&
        (["sofa", "bed", "chair", "rug", "curtain_left", "curtain_right", "curtain_split"].includes(
          furnitureItemType,
        ) ||
          (warmPalette = {
            ...warmPalette,
            furnitureSoft: warmPalette.furnitureLight,
          }),
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
          "glasscabinet",
        ].includes(furnitureItemType) &&
          (warmPalette = {
            ...warmPalette,
            furniture: warmPalette.wood,
            furnitureSoft: warmPalette.wood,
            furnitureDark: warmPalette.wood,
          })));
    const materialName = (meshMaterial?.name || "").toLowerCase();
    if (furnitureItemType === "shower" && warmPalette.showerMetal !== undefined)
      return createPaletteMaterial(meshMaterial, warmPalette.showerMetal, {
        roughness: 0.48,
        metalness: 0.3,
      });
    if (PILLAR_MODEL_ITEM_TYPES.has(furnitureItemType)) {
      // 柱族在户型里属于**墙**：柱体 / 底座 / 压顶都从墙色派生，靠材质名末段的角色区分
      // （material-<n>-body / -base / -trim）；认不出角色时按柱体处理。
      const pillarRole = materialName.match(/material-\d+-([a-z][a-z0-9]*)$/)?.[1],
        pillarWallColor = new threeNamespace.Color(
          warmPalette.wall ?? warmPalette.furniture ?? 16777215,
        ),
        pillarColor =
          pillarRole === "base"
            ? pillarWallColor.clone().multiplyScalar(0.92)
            : pillarRole === "trim"
              ? pillarWallColor.clone().lerp(new threeNamespace.Color(16777215), 0.35)
              : pillarWallColor;
      return createPaletteMaterial(meshMaterial, pillarColor, {
        roughness: pillarRole === "base" ? 0.74 : 0.66,
        metalness: 0.02,
      });
    }
    const diningMaterialRole = warmPalette.warmWood
      ? diningMaterialRolesByItemType[furnitureItemType]?.[
          Number(materialName.match(/material-(\d+)$/)?.[1])
        ]
      : null;
    if (diningMaterialRole) {
      const diningRoleColors = {
          wood: warmPalette.wood,
          linen: warmPalette.diningLinen ?? 15919316,
          sage: warmPalette.diningSage ?? 10926731,
          ceramic: warmPalette.applianceSoft,
        },
        isFabricRole = diningMaterialRole === "linen" || diningMaterialRole === "sage",
        diningFabricMaterial = createPaletteMaterial(
          meshMaterial,
          diningRoleColors[diningMaterialRole],
          {
            roughness: isFabricRole ? 0.94 : diningMaterialRole === "ceramic" ? 0.3 : 0.58,
            metalness: 0,
          },
        );
      return (
        (diningFabricMaterial.userData.warmDiningFabric = isFabricRole),
        (diningFabricMaterial.userData.warmDiningMaterial = diningMaterialRole),
        diningFabricMaterial
      );
    }
    let resolvedMaterialColor = warmPalette.furniture;
    if (/^curtain_(left|right|split)$/.test(furnitureItemType)) {
      const curtainMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      ["0", "4"].includes(curtainMaterialIndex)
        ? (resolvedMaterialColor = warmPalette.furnitureDark)
        : ["1", "5", "2", "3"].includes(curtainMaterialIndex)
          ? (resolvedMaterialColor = warmPalette.furnitureSoft)
          : (resolvedMaterialColor = warmPalette.furniture);
    } else {
      if (
        furnitureItemType === "coffeetable" ||
        furnitureItemType === "kitchenisland" ||
        furnitureItemType === "squarecoffeetable"
      ) {
        // homeos-3d 的组合茶几是两块叠合石板、岛台是「浅色台面 + 深色木体」，
        // 材质命名从 <type>-furniture-<role> 换成了 material-<n>-<role>：
        // 先按角色分工取色，认不出角色的（方茶几仍是旧命名）再退回原来的后缀判断。
        const slabPartRole = materialName.match(/material-\d+-([a-z]+)$/)?.[1];
        resolvedMaterialColor =
          slabPartRole === "top"
            ? warmPalette.furnitureSoft
            : slabPartRole === "base" || slabPartRole === "body" || slabPartRole === "leg"
              ? warmPalette.furnitureDark
              : slabPartRole === "door"
                ? warmPalette.furnitureSoft
                : slabPartRole === "metal"
                  ? warmPalette.furniture
                  : materialName.endsWith("-dark")
                    ? warmPalette.furnitureDark
                    : materialName.endsWith("-light") || materialName.endsWith("-soft")
                      ? warmPalette.furnitureSoft
                      : warmPalette.furniture;
      } else {
        if (furnitureItemType === "tvstand") {
          const tvstandBaseColor =
              meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
            tvstandBaseLuminance =
              tvstandBaseColor.r * 0.2126 +
              tvstandBaseColor.g * 0.7152 +
              tvstandBaseColor.b * 0.0722;
          resolvedMaterialColor =
            materialName.endsWith("-dark") || tvstandBaseLuminance < 0.16
              ? warmPalette.furnitureDark
              : materialName.endsWith("-soft") ||
                  materialName.endsWith("-light") ||
                  tvstandBaseLuminance >= 0.3
                ? warmPalette.furnitureSoft
                : warmPalette.furniture;
        } else {
          if (
            ["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)
          ) {
            const tableMaterialIndex = materialName.match(/material-(\d+)/)?.[1],
              tableSoftMaterialIndices =
                furnitureItemType === "rounddiningtable_turntable" ? ["0", "3"] : ["0"],
              tableBaseColor = meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
              tableBaseLuminance =
                tableBaseColor.r * 0.2126 + tableBaseColor.g * 0.7152 + tableBaseColor.b * 0.0722;
            resolvedMaterialColor = tableSoftMaterialIndices.includes(tableMaterialIndex)
              ? warmPalette.furnitureSoft
              : tableBaseLuminance < 0.2
                ? warmPalette.furnitureDark
                : tableBaseLuminance < 0.55
                  ? warmPalette.furniture
                  : warmPalette.furnitureSoft;
          } else {
            if (
              ["kitchenbase", "kitchensink", "kitchencooktop", "basin"].includes(furnitureItemType)
            ) {
              const kitchenMaterialIndex = materialName.match(/material-(\d+)/)?.[1],
                kitchenCounterMaterialIndex = furnitureItemType === "basin" ? "1" : "2",
                kitchenBaseColor =
                  meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
                kitchenBaseLuminance =
                  kitchenBaseColor.r * 0.2126 +
                  kitchenBaseColor.g * 0.7152 +
                  kitchenBaseColor.b * 0.0722;
              resolvedMaterialColor =
                kitchenMaterialIndex === kitchenCounterMaterialIndex
                  ? warmPalette.furniture
                  : kitchenBaseLuminance < 0.2
                    ? warmPalette.furnitureDark
                    : kitchenBaseLuminance < 0.55
                      ? warmPalette.furniture
                      : warmPalette.furnitureSoft;
            } else {
              if (furnitureItemType === "stairs") resolvedMaterialColor = warmPalette.furniture;
              else {
                if (
                  furnitureItemType === "plant" &&
                  (materialName.endsWith("-soft") || materialName.endsWith("-dark"))
                )
                  resolvedMaterialColor = warmPalette.furniture;
                else {
                  if (materialName.includes("foliagesoft")) resolvedMaterialColor = 7835779;
                  else {
                    if (materialName.includes("foliage")) resolvedMaterialColor = 6257261;
                    else {
                      if (materialName.endsWith("-soft") || materialName.endsWith("-light"))
                        resolvedMaterialColor = warmPalette.furnitureSoft;
                      else {
                        if (materialName.endsWith("-dark"))
                          resolvedMaterialColor = warmPalette.furnitureDark;
                        else {
                          if (luminancePaletteItemTypes.has(furnitureItemType)) {
                            const solidPaletteColor =
                                meshMaterial.color?.clone?.() || new threeNamespace.Color(16777215),
                              solidPaletteLuminance =
                                solidPaletteColor.r * 0.2126 +
                                solidPaletteColor.g * 0.7152 +
                                solidPaletteColor.b * 0.0722;
                            resolvedMaterialColor =
                              solidPaletteLuminance < 0.2
                                ? warmPalette.furnitureDark
                                : solidPaletteLuminance < 0.55
                                  ? warmPalette.furniture
                                  : warmPalette.furnitureSoft;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (warmPalette.warmWood) {
      const warmWoodMaterialIndex = materialName.match(/material-(\d+)/)?.[1];
      (furnitureItemType === "bed" &&
        (resolvedMaterialColor = ["1", "3"].includes(warmWoodMaterialIndex)
          ? warmPalette.furnitureLight
          : warmPalette.wood),
        furnitureItemType === "sofa" &&
          (resolvedMaterialColor = materialName.includes("cushion")
            ? (warmPalette.sofaFabric ??
              (warmPalette.warmWood ? warmPalette.furnitureLight : warmPalette.furnitureSoft))
            : warmPalette.wood),
        furnitureItemType === "cabinet" &&
          (resolvedMaterialColor = warmWoodMaterialIndex === "2" ? 5462356 : warmPalette.wood),
        furnitureItemType === "nightstand" &&
          (resolvedMaterialColor = warmWoodMaterialIndex === "2" ? 5462356 : warmPalette.wood),
        ["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType) &&
          (resolvedMaterialColor = ["0", "3"].includes(warmWoodMaterialIndex)
            ? warmPalette.wood
            : warmPalette.furnitureLight),
        furnitureItemType === "tvstand" && (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "sideboard" && (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "bookcase" &&
          Number(warmWoodMaterialIndex) >= 11 &&
          (resolvedMaterialColor = [
            warmPalette.joineryAccent,
            warmPalette.decorAccent,
            warmPalette.furnitureLight,
          ][Number(warmWoodMaterialIndex) % 3]),
        furnitureItemType === "plant" &&
          (resolvedMaterialColor = materialName.includes("foliagesoft")
            ? 9877369
            : materialName.includes("foliage")
              ? warmPalette.leafColor
              : materialName.endsWith("-soft")
                ? warmPalette.decorAccent
                : warmPalette.furnitureDark),
        furnitureItemType === "rug" &&
          (resolvedMaterialColor = materialName.endsWith("-soft")
            ? warmPalette.furnitureLight
            : warmPalette.joineryAccent),
        furnitureItemType.startsWith("curtain_") &&
          (resolvedMaterialColor = ["2", "3", "5", "1"].includes(warmWoodMaterialIndex)
            ? 16776696
            : warmPalette.furnitureDark),
        furnitureItemType === "chair" &&
          (resolvedMaterialColor =
            warmWoodMaterialIndex === "0"
              ? (warmPalette.chairFabric ?? warmPalette.furnitureSoft)
              : warmPalette.wood),
        ["toilet", "squattoilet", "urinal", "bathtub", "basin"].includes(furnitureItemType) &&
          (resolvedMaterialColor = warmPalette.applianceSoft));
    }
    let isCountertopMaterial = false,
      isMetalFinish = false;
    if (isWarmCabinetItem) {
      const warmCabinetMaterialIndex = materialName.match(/material-(\d+)$/)?.[1];
      if (
        ((isCountertopMaterial =
          countertopMaterialIndexByItemType[furnitureItemType] !== undefined &&
          warmCabinetMaterialIndex === countertopMaterialIndexByItemType[furnitureItemType]),
        furnitureItemType === "tvstand")
      ) {
        const tvstandMaterialColor = meshMaterial.color,
          tvstandMaterialLuminance = tvstandMaterialColor
            ? tvstandMaterialColor.r * 0.2126 +
              tvstandMaterialColor.g * 0.7152 +
              tvstandMaterialColor.b * 0.0722
            : 0;
        isCountertopMaterial =
          materialName.endsWith("-soft") ||
          (!materialName.includes("ha-tvstand-") && tvstandMaterialLuminance >= 0.3);
      }
      (["kitchensink", "kitchencooktop"].includes(furnitureItemType) &&
        (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "kitchensink" &&
          ["3", "4", "5", "6"].includes(warmCabinetMaterialIndex) &&
          ((resolvedMaterialColor = ["3", "4"].includes(warmCabinetMaterialIndex)
            ? 10200481
            : 11450548),
          (isMetalFinish = true)),
        furnitureItemType === "kitchencooktop" &&
          ["3", "6", "7"].includes(warmCabinetMaterialIndex) &&
          (resolvedMaterialColor = 4212549),
        ((furnitureItemType === "kitchenbase" && warmCabinetMaterialIndex === "4") ||
          (furnitureItemType === "kitchensink" && warmCabinetMaterialIndex === "8") ||
          (furnitureItemType === "kitchencooktop" && warmCabinetMaterialIndex === "5")) &&
          (resolvedMaterialColor = 7830384),
        furnitureItemType === "cabinet" &&
          warmCabinetMaterialIndex === "1" &&
          (resolvedMaterialColor = 9794135),
        isCountertopMaterial && (resolvedMaterialColor = warmPalette.countertop ?? 16117989));
    }
    const usePolygonOffset = furnitureItemType === "rug" && materialName.endsWith("-soft"),
      isTransparentFinish =
        materialName.endsWith("-glass") ||
        meshMaterial?.transparent === true ||
        (meshMaterial?.opacity ?? 1) < 1;
    return (
      warmPalette.warmWood && isTransparentFinish && (resolvedMaterialColor = warmPalette.glass),
      createPaletteMaterial(meshMaterial, resolvedMaterialColor, {
        roughness: isCountertopMaterial
          ? 0.65
          : isMetalFinish
            ? 0.36
            : warmPalette.warmWood && isTransparentFinish
              ? 0.18
              : materialName.includes("foliage") || furnitureItemType === "rug"
                ? 0.9
                : 0.72,
        metalness: isMetalFinish
          ? 0.55
          : isWarmCabinetItem || materialName.includes("foliage") || furnitureItemType === "rug"
            ? 0
            : 0.02,
        polygonOffset: usePolygonOffset,
        polygonOffsetFactor: usePolygonOffset ? -2 : 0,
        polygonOffsetUnits: usePolygonOffset ? -4 : 0,
        transparent: isTransparentFinish,
        opacity: isTransparentFinish ? (warmPalette.warmWood ? meshMaterial.opacity : 0.42) : 1,
        depthWrite: !isTransparentFinish,
      })
    );
  }
  function applyStairMaterial(stairMaterial, stairPalette, stairItemTypeName) {
    if (!stairMaterial) return stairMaterial;
    if (
      ["glassstairs", "floatingstairs"].includes(stairItemTypeName) &&
      stairMaterial.transparent === true &&
      finite(stairMaterial.opacity, 1) < 0.5
    ) {
      const stairGlassMaterial = new threeNamespace.MeshStandardMaterial({
        color: stairPalette.warmWood ? stairPalette.glass : stairPalette.furnitureSoft,
        roughness: 0.12,
        metalness: 0.04,
        transparent: true,
        opacity: 0.3,
        side: threeNamespace.DoubleSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: true,
      });
      return (
        (stairGlassMaterial.name = (stairMaterial.name || "stair-glass") + " · HomeOS glass"),
        stairGlassMaterial
      );
    }
    const isSteelStair = stairItemTypeName === "steelstairs";
    if (stairPalette.warmWood) {
      const isTreadMaterial =
          stairItemTypeName === "floatingstairs"
            ? stairMaterial.name === "B-1"
            : isSteelStair
              ? /^004$/.test(stairMaterial.name || "")
              : /^sacfdsa010$/.test(stairMaterial.name || ""),
        stairTreadMaterial = createPaletteMaterial(
          stairMaterial,
          isTreadMaterial ? stairPalette.floor : 7567993,
          {
            roughness: isTreadMaterial ? 0.84 : 0.38,
            metalness: isTreadMaterial ? 0 : 0.5,
          },
        );
      return (
        isTreadMaterial &&
          (decorateWarmFloor(stairTreadMaterial, stairPalette),
          (stairTreadMaterial.userData.warmFloorTread = true)),
        stairTreadMaterial
      );
    }
    const stairFrameColor = stairPalette.furnitureSoft,
      stairFrameMaterial = new threeNamespace.MeshStandardMaterial({
        color: stairFrameColor,
        roughness: isSteelStair ? 0.38 : 0.58,
        metalness: isSteelStair ? 0.42 : 0.08,
        emissive: stairFrameColor,
        emissiveIntensity: 0.07,
        side: stairMaterial.side ?? threeNamespace.FrontSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
        toneMapped: true,
      });
    return (
      (stairFrameMaterial.name = (stairMaterial.name || "stair-frame") + " · HomeOS palette"),
      stairFrameMaterial
    );
  }
  function applyItemDetailMaterial(detailMaterial, itemPalette, detailItemType) {
    if (typeof threeNamespace.MeshStandardMaterial != "function")
      return detailMaterial.clone?.() || detailMaterial;
    // 「角色表优先」：<type>-material-N 这类无角色命名的模型，先按 studio-model-material-roles.ts
    // 的槽位角色表取配方，绕开下面的亮度 / 槽位号启发式；材料名已自带角色的（-furniture-/-detail-/
    // -aquatic-/… 与 material-N-role）以及楼梯 / 车辆 / 柱族等结构件仍走各自的专用分支。
    if (
      roleTableItemTypes.has(detailItemType) &&
      !isStructuralModelFamily(resolveModelFamily(detailItemType)) &&
      !usesNamedMaterialRole(detailMaterial.name)
    ) {
      const roleTableRecipe = materialRoleRecipeFor(detailItemType, detailMaterial.name, itemPalette);
      if (roleTableRecipe) {
        const roleTableMaterial = createPaletteMaterial(detailMaterial, roleTableRecipe.colorValue, {
          roughness: roleTableRecipe.roughness,
          metalness: roleTableRecipe.metalness,
          flatShading: roleTableRecipe.flatShading,
          transparent: roleTableRecipe.transparent,
          opacity: roleTableRecipe.opacity,
          depthWrite: roleTableRecipe.depthWrite,
          polygonOffset: roleTableRecipe.polygonOffset,
        });
        if (roleTableRecipe.emissiveValue !== undefined) {
          roleTableMaterial.emissive.setHex(roleTableRecipe.emissiveValue);
          roleTableMaterial.emissiveIntensity = roleTableRecipe.emissiveIntensity ?? 0.5;
        }
        if (roleTableRecipe.fabricLike) roleTableMaterial.userData.warmDiningFabric = true;
        return roleTableMaterial;
      }
    }
    if (paletteOverrideItemTypes.has(detailItemType)) {
      const detailRole = detailMaterial.name?.split(/-(?:furniture|detail)-/)[1],
        isWarmWoodItem = itemPalette.warmWood,
        lightAccentColor = itemPalette.furnitureLight ?? itemPalette.furnitureSoft,
        isCompactApplianceItem = [
          "smart-socket-86",
          "router",
          "humidifier",
          "dehumidifier",
          "heater",
        ].includes(detailItemType);
      let detailRoleColors;
      isCompactApplianceItem
        ? (detailRoleColors = {
            body: itemPalette.appliance ?? itemPalette.furniture,
            panel: itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
            recess: itemPalette.applianceDark ?? itemPalette.furnitureDark,
            indicator: isWarmWoodItem ? itemPalette.furnitureSoft : lightAccentColor,
            water: itemPalette.glass ?? lightAccentColor,
            control: lightAccentColor,
          })
        : ["wardrobe", "drawer-chest"].includes(detailItemType)
          ? (detailRoleColors = {
              frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
              panel: isWarmWoodItem ? itemPalette.cabinetWood : itemPalette.furnitureSoft,
              shadow: isWarmWoodItem ? itemPalette.woodDark : itemPalette.furnitureDark,
              handle: isWarmWoodItem ? itemPalette.furnitureDark : lightAccentColor,
            })
          : detailItemType === "office-chair"
            ? (detailRoleColors = {
                frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
                fabric: isWarmWoodItem ? itemPalette.sofaFabric : itemPalette.furnitureSoft,
                shadow: itemPalette.applianceDark ?? itemPalette.furnitureDark,
                surface: lightAccentColor,
                accent: itemPalette.furnitureSoft,
              })
            : (detailRoleColors = {
                frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
                fabric:
                  detailItemType === "pool-table"
                    ? itemPalette.furnitureSoft
                    : isWarmWoodItem
                      ? lightAccentColor
                      : itemPalette.furnitureSoft,
                shadow: isWarmWoodItem ? itemPalette.woodDark : itemPalette.furnitureDark,
                surface: lightAccentColor,
                accent: isWarmWoodItem ? itemPalette.furnitureSoft : itemPalette.furniture,
              });
      const detailRoleMaterial = createPaletteMaterial(
        detailMaterial,
        detailRoleColors[detailRole] ?? itemPalette.furniture,
        {
          roughness: ["fabric", "surface", "accent"].includes(detailRole)
            ? 0.91
            : detailRole === "water"
              ? 0.26
              : 0.72,
          metalness: 0,
        },
      );
      return (
        detailItemType === "bed" &&
          detailRole === "fabric" &&
          (detailRoleMaterial.userData.plan2SurfaceSlope = true),
        detailRoleMaterial
      );
    }
    if (detailItemType === "aquarium" && detailMaterial.name?.startsWith("aquarium-aquatic-")) {
      const aquariumRole = detailMaterial.name.split("-aquatic-")[1],
        isWarmWoodAquarium = itemPalette.warmWood,
        aquariumRoleColors = {
          frame: isWarmWoodAquarium ? itemPalette.cabinetWood : itemPalette.furniture,
          shadow: itemPalette.furnitureDark,
          sand:
            (isWarmWoodAquarium ? itemPalette.countertop : itemPalette.furnitureLight) ??
            itemPalette.furnitureSoft,
          rock: isWarmWoodAquarium ? itemPalette.applianceDark : itemPalette.furnitureSoft,
          foliage: isWarmWoodAquarium ? itemPalette.leafColor : itemPalette.furniture,
          fish:
            (isWarmWoodAquarium ? itemPalette.decorAccent : itemPalette.furnitureLight) ??
            itemPalette.furnitureSoft,
          glass: itemPalette.glass ?? itemPalette.furnitureSoft,
          water: itemPalette.glass ?? itemPalette.furnitureSoft,
        },
        isGlassAquariumRole = aquariumRole === "glass" || aquariumRole === "water";
      return createPaletteMaterial(detailMaterial, aquariumRoleColors[aquariumRole], {
        roughness: isGlassAquariumRole ? 0.18 : 0.78,
        metalness: 0,
        flatShading: aquariumRole === "rock",
        transparent: isGlassAquariumRole,
        opacity: isGlassAquariumRole ? detailMaterial.opacity : 1,
        depthWrite: !isGlassAquariumRole,
      });
    }
    if (detailItemType === "tea-table-set") {
      const teaTableRole = detailMaterial.name?.split("-tea-")[1],
        teaTableRoleColors = itemPalette.warmWood
          ? {
              frame: itemPalette.wood,
              panel: itemPalette.woodLight,
              recess: itemPalette.furnitureDark,
              ceramic: itemPalette.furnitureLight,
              accent: itemPalette.decorAccent,
            }
          : {
              frame: 8226713,
              panel: 10332346,
              recess: 5397873,
              ceramic: 12634839,
              accent: 10332346,
            };
      return createPaletteMaterial(
        detailMaterial,
        teaTableRoleColors[teaTableRole] ?? teaTableRoleColors.frame,
        {
          roughness: teaTableRole === "ceramic" ? 0.6 : 0.82,
          metalness: 0,
        },
      );
    }
    if (COURTYARD_MODELS[detailItemType]) {
      const gardenRole = detailMaterial.name?.split("-garden-")[1],
        gardenPalette = courtyardPalette(detailItemType, itemPalette.warmWood ? "warm" : "default");
      return createPaletteMaterial(
        detailMaterial,
        gardenPalette[gardenRole] ?? gardenPalette.base,
        {
          roughness: gardenRole === "water" ? 0.3 : 0.82,
          metalness: 0,
        },
      );
    }
    if (DECOR_MODELS[detailItemType]) {
      const decorRoleIndex = Number(detailMaterial.name?.split("-decor-")[1]),
        decorRole = DECOR_MODELS[detailItemType].roles[decorRoleIndex],
        decorThemePalette = DECOR_THEMES[itemPalette.warmWood ? "warm" : "default"];
      return createPaletteMaterial(
        detailMaterial,
        decorThemePalette[decorRole] ?? decorThemePalette.base,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailMaterial.name?.includes("-furniture-")) {
      const furnitureRole = detailMaterial.name.split("-furniture-")[1],
        isDiningItem = [
          "chair",
          "table",
          "rounddiningtable",
          "rounddiningtable_turntable",
        ].includes(detailItemType),
        isSofaFamilyItem = sofaFamilyItemTypes.has(detailItemType) || detailItemType === "bed",
        isWarmWoodStyle = itemPalette.warmWood,
        furnitureFrameColor = isWarmWoodStyle
          ? detailItemType === "tvstand"
            ? itemPalette.cabinetWood
            : itemPalette.wood
          : itemPalette.furniture,
        furnitureFabricColor = isWarmWoodStyle
          ? detailItemType === "sofa"
            ? itemPalette.sofaFabric
            : isDiningItem
              ? itemPalette.diningLinen
              : itemPalette.furnitureLight
          : itemPalette.furnitureSoft,
        furnitureSurfaceColor = isWarmWoodStyle
          ? isSofaFamilyItem
            ? itemPalette.furnitureLight
            : itemPalette.countertop
          : itemPalette.furnitureSoft,
        furnitureAccentColor = isDiningItem
          ? isWarmWoodStyle
            ? itemPalette.wood
            : itemPalette.furnitureSoft
          : isWarmWoodStyle
            ? itemPalette.furnitureSoft
            : itemPalette.furnitureDark,
        furnitureRoleColors = {
          frame: furnitureFrameColor,
          fabric: furnitureFabricColor,
          surface: furnitureSurfaceColor,
          accent: furnitureAccentColor,
          shadow: isWarmWoodStyle ? itemPalette.woodDark : itemPalette.furnitureDark,
        };
      if (
        (!isWarmWoodStyle &&
          (detailItemType === "bed" ||
            isDiningItem ||
            ["coffeetable", "squarecoffeetable"].includes(detailItemType)) &&
          (furnitureRoleColors.frame = itemPalette.furnitureDark),
        !isWarmWoodStyle &&
          detailItemType === "bed" &&
          ((furnitureRoleColors.frame = itemPalette.furniture),
          (furnitureRoleColors.accent = itemPalette.furniture)),
        !isWarmWoodStyle &&
          detailItemType === "rounddiningtable_turntable" &&
          (furnitureRoleColors.surface = itemPalette.furniture),
        sofaFamilyItemTypes.has(detailItemType) &&
          ((furnitureRoleColors.fabric = isWarmWoodStyle
            ? itemPalette.wood
            : itemPalette.furniture),
          (furnitureRoleColors.surface = isWarmWoodStyle
            ? itemPalette.sofaFabric
            : itemPalette.furnitureSoft),
          (furnitureRoleColors.accent = isWarmWoodStyle
            ? itemPalette.furnitureSoft
            : itemPalette.furniture)),
        detailItemType === "vanity")
      ) {
        const vanityRoleColors = {
          frame: isWarmWoodStyle ? itemPalette.wood : itemPalette.furnitureDark,
          fabric: isWarmWoodStyle ? itemPalette.cabinetWood : itemPalette.furniture,
          shadow: isWarmWoodStyle ? itemPalette.woodDark : itemPalette.furnitureDark,
          surface: isWarmWoodStyle ? itemPalette.countertop : itemPalette.furnitureSoft,
          accent: itemPalette.glass,
        };
        return createPaletteMaterial(detailMaterial, vanityRoleColors[furnitureRole], {
          roughness: furnitureRole === "accent" ? 0.18 : 0.73,
          metalness: furnitureRole === "accent" ? 0.18 : 0,
          transparent: furnitureRole === "accent",
          opacity: furnitureRole === "accent" ? 0.42 : 1,
          depthWrite: furnitureRole !== "accent",
        });
      }
      const isSoftFurnitureRole =
        furnitureRole === "fabric" ||
        (isSofaFamilyItem && ["surface", "accent"].includes(furnitureRole));
      return createPaletteMaterial(
        detailMaterial,
        furnitureRoleColors[furnitureRole] ?? furnitureFrameColor,
        {
          roughness: isSoftFurnitureRole ? 0.94 : furnitureRole === "surface" ? 0.64 : 0.73,
          metalness: 0,
        },
      );
    }
    if (itemPalette.warmWood && detailItemType === "piano") {
      const pianoMaterialName = (detailMaterial.name || "").toLowerCase(),
        isGoldenPiano = pianoMaterialName.includes("金色"),
        pianoBaseColor = isGoldenPiano
          ? 12296558
          : pianoMaterialName.includes("color_009") || pianoMaterialName.includes("blinds_weave")
            ? 3423034
            : pianoMaterialName.includes("*1")
              ? 16315885
              : 9991250,
        pianoMaterial = createPaletteMaterial(detailMaterial, pianoBaseColor, {
          roughness: isGoldenPiano ? 0.4 : 0.55,
          metalness: isGoldenPiano ? 0.5 : 0,
        });
      return ((pianoMaterial.userData.plan2SurfaceContact = false), pianoMaterial);
    }
    if (
      ["storagewaterheater", "gaswaterheater"].includes(detailItemType) &&
      detailMaterial.name?.startsWith(detailItemType + "-detail-")
    ) {
      const heaterDetailRole = detailMaterial.name.split("-detail-")[1],
        heaterSoftColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
        heaterBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        heaterDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark;
      return createPaletteMaterial(
        detailMaterial,
        {
          body: heaterSoftColor,
          panel: heaterDarkColor,
          recess: heaterDarkColor,
          trim: heaterBodyColor,
          control: heaterSoftColor,
        }[heaterDetailRole] ?? heaterSoftColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (
      detailItemType === "robotvacuum" &&
      detailMaterial.name?.startsWith("robotvacuum-detail-")
    ) {
      const vacuumDetailRole = detailMaterial.name.split("-detail-")[1],
        vacuumBodyColor = itemPalette.appliance ?? itemPalette.furniture ?? 10134967,
        vacuumPanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        vacuumDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        vacuumRoleColors = {
          body: vacuumBodyColor,
          panel: vacuumPanelColor,
          dark: new threeNamespace.Color(vacuumDarkColor).multiplyScalar(0.42),
          trim: vacuumDarkColor,
          indicator: vacuumPanelColor,
        };
      return createPaletteMaterial(
        detailMaterial,
        vacuumRoleColors[vacuumDetailRole] ?? vacuumBodyColor,
        {
          roughness: 0.82,
          metalness: 0,
          flatShading: false,
        },
      );
    }
    if (
      ["airpurifier", "floorac", "desktop", "laptop"].includes(detailItemType) &&
      detailMaterial.name?.includes("-detail-")
    ) {
      const applianceDetailRole = detailMaterial.name.split("-detail-")[1],
        appliancePanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        applianceDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        applianceDetailRoleColors = {
          body: appliancePanelColor,
          panel: applianceDarkColor,
          recess: new threeNamespace.Color(applianceDarkColor).multiplyScalar(0.42),
          trim: itemPalette.appliance ?? appliancePanelColor,
          control: appliancePanelColor,
        };
      return createPaletteMaterial(
        detailMaterial,
        applianceDetailRoleColors[applianceDetailRole] ?? appliancePanelColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailItemType === "printer" && detailMaterial.name?.startsWith("printer-detail-")) {
      const printerDetailRole = detailMaterial.name.split("-detail-")[1],
        printerBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        printerRoleColors = {
          body: printerBodyColor,
          panel: itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
          recess: itemPalette.applianceDark ?? itemPalette.furnitureDark,
          paper: itemPalette.furnitureLight,
        };
      return createPaletteMaterial(
        detailMaterial,
        printerRoleColors[printerDetailRole] ?? printerBodyColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailItemType === "nas") {
      const nasMaterialIndex = Number((detailMaterial?.name || "").match(/material-(\d+)/)?.[1]),
        nasPanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        nasDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        nasRecessColor = new threeNamespace.Color(nasDarkColor).multiplyScalar(0.48),
        nasRoleColorList = [
          nasPanelColor,
          nasDarkColor,
          nasRecessColor,
          itemPalette.appliance ?? nasPanelColor,
          8702858,
        ],
        nasRoleMaterial = createPaletteMaterial(
          detailMaterial,
          nasRoleColorList[nasMaterialIndex] ?? nasDarkColor,
          {
            roughness: 0.82,
            metalness: 0,
          },
        );
      return (
        nasMaterialIndex === 4 &&
          (nasRoleMaterial.emissive.set(6798195), (nasRoleMaterial.emissiveIntensity = 0.5)),
        nasRoleMaterial
      );
    }
    if (applianceItemTypes.has(detailItemType)) {
      const applianceMaterialName = (detailMaterial?.name || "").toLowerCase(),
        applianceBaseColor = detailMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
        applianceLuminance =
          applianceBaseColor.r * 0.2126 +
          applianceBaseColor.g * 0.7152 +
          applianceBaseColor.b * 0.0722,
        applianceMaterialIndex = applianceMaterialName.match(/material-(\d+)/)?.[1],
        applianceBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        applianceSoftBodyColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
        applianceDarkBodyColor = itemPalette.applianceDark ?? itemPalette.furnitureDark,
        isTranslucentPanel =
          ["desktop", "laptop", "nas"].includes(detailItemType) && applianceMaterialIndex === "0",
        applianceResolvedColor =
          detailItemType === "walllamp"
            ? applianceMaterialIndex === "2"
              ? itemPalette.accent
              : applianceBodyColor
            : detailItemType === "floorlamp"
              ? itemPalette.floorLampBody
                ? applianceMaterialIndex === "3"
                  ? applianceSoftBodyColor
                  : itemPalette.floorLampBody
                : applianceBodyColor
              : detailItemType === "desktop"
                ? applianceMaterialIndex === "1"
                  ? applianceDarkBodyColor
                  : applianceSoftBodyColor
                : detailItemType === "laptop" && applianceMaterialIndex === "2"
                  ? applianceDarkBodyColor
                  : (detailItemType === "laptop" && applianceMaterialIndex === "1") ||
                      isTranslucentPanel
                    ? applianceSoftBodyColor
                    : detailItemType.startsWith("tv_")
                      ? applianceDarkBodyColor
                      : detailItemType === "pipelinewaterpurifier" ||
                          detailItemType === "tea_bar_machine"
                        ? applianceLuminance < 0.16
                          ? applianceBodyColor
                          : applianceSoftBodyColor
                        : applianceMaterialName.endsWith("-dark") || applianceLuminance < 0.16
                          ? applianceDarkBodyColor
                          : applianceMaterialName.endsWith("-soft") || applianceLuminance < 0.45
                            ? applianceSoftBodyColor
                            : applianceBodyColor,
        applianceRoleMaterial = createPaletteMaterial(detailMaterial, applianceResolvedColor, {
          roughness: 0.82,
          metalness: 0,
          flatShading: false,
        });
      return (
        ((detailItemType === "laptop" && applianceMaterialIndex === "2") ||
          (detailItemType === "nas" && ["2", "4"].includes(applianceMaterialIndex))) &&
          ((applianceRoleMaterial.polygonOffset = true),
          (applianceRoleMaterial.polygonOffsetFactor = -1),
          (applianceRoleMaterial.polygonOffsetUnits = -1)),
        detailItemType === "tea_bar_machine" &&
          ((applianceRoleMaterial.emissive = new threeNamespace.Color(0)),
          (applianceRoleMaterial.emissiveIntensity = 0)),
        applianceRoleMaterial
      );
    }
    if (warmWoodFurnitureItemTypes.has(detailItemType))
      return applyWarmWoodFurnitureMaterial(detailMaterial, itemPalette, detailItemType);
    if (detailItemType === "sofa") {
      const isSofaCushion = /cushion/i.test(detailMaterial?.name || "");
      return createPaletteMaterial(
        detailMaterial,
        isSofaCushion ? itemPalette.furnitureSoft : itemPalette.furniture,
        {
          roughness: 0.8,
          metalness: 0.01,
        },
      );
    }
    if (detailItemType === "elevator") {
      const isElevatorPanelMaterial = /Color_00[34]/i.test(detailMaterial?.name || ""),
        elevatorPanelColor = isElevatorPanelMaterial
          ? new threeNamespace.Color(itemPalette.wall)
          : new threeNamespace.Color(itemPalette.furniture);
      return createPaletteMaterial(
        detailMaterial,
        elevatorPanelColor,
        isElevatorPanelMaterial
          ? {
              roughness: 0.82,
              metalness: 0.01,
            }
          : {},
      );
    }
    if (detailItemType === "piano") {
      const pianoName = (detailMaterial?.name || "").toLowerCase(),
        pianoColor = pianoName.includes("color_009")
          ? itemPalette.furnitureDark
          : pianoName.includes("blinds_weave") ||
              pianoName.includes("金色") ||
              pianoName.includes("*1")
            ? itemPalette.furnitureSoft
            : itemPalette.furniture,
        pianoSurfaceMaterial = new threeNamespace.MeshStandardMaterial({
          color: pianoColor,
          roughness: 0.72,
          metalness: 0.06,
          emissive: pianoColor,
          emissiveIntensity: 0.08,
          side: detailMaterial?.side ?? threeNamespace.FrontSide,
          transparent: false,
          opacity: 1,
          depthWrite: detailMaterial?.depthWrite ?? true,
          depthTest: detailMaterial?.depthTest ?? true,
          toneMapped: true,
        });
      return (
        (pianoSurfaceMaterial.userData.plan2SurfaceContact = false),
        (pianoSurfaceMaterial.name =
          (detailMaterial?.name || "piano") + " · HomeOS furniture palette"),
        pianoSurfaceMaterial
      );
    }
    return stairItemTypes.has(detailItemType)
      ? applyStairMaterial(detailMaterial, itemPalette, detailItemType)
      : applyDefaultPaletteMaterial(detailMaterial, itemPalette);
  }
  function smoothGeometryNormals(sourceGeometry) {
    const clonedGeometry = sourceGeometry?.clone?.();
    return clonedGeometry?.computeVertexNormals
      ? (clonedGeometry.computeVertexNormals(),
        clonedGeometry.attributes?.normal && (clonedGeometry.attributes.normal.needsUpdate = true),
        clonedGeometry.computeBoundingBox?.(),
        clonedGeometry.computeBoundingSphere?.(),
        clonedGeometry)
      : sourceGeometry;
  }
  function collectVertexSet(geometry, materialIndex = null) {
    const vertexIndices = new Set(),
      positionAttribute = geometry?.attributes?.position;
    if (!positionAttribute) return vertexIndices;
    const indexAttribute = geometry.index,
      matchingGroups = Number.isInteger(materialIndex)
        ? (geometry.groups || []).filter(
            (geometryGroup) => geometryGroup.materialIndex === materialIndex,
          )
        : [];
    if (matchingGroups.length)
      for (const geometryGroupEntry of matchingGroups) {
        const groupEndIndex = geometryGroupEntry.start + geometryGroupEntry.count;
        for (
          let vertexIndex = geometryGroupEntry.start;
          vertexIndex < groupEndIndex;
          vertexIndex += 1
        )
          vertexIndices.add(indexAttribute ? indexAttribute.getX(vertexIndex) : vertexIndex);
      }
    else {
      if (materialIndex === null) {
        for (
          let sequentialVertexIndex = 0;
          sequentialVertexIndex < positionAttribute.count;
          sequentialVertexIndex += 1
        )
          vertexIndices.add(sequentialVertexIndex);
      }
    }
    return vertexIndices;
  }
  function measureYRange(geometryAttribute, vertexIndexIterable) {
    let minY = Infinity,
      maxY = -Infinity;
    for (const measuredVertexIndex of vertexIndexIterable) {
      const vertexY = geometryAttribute.getY(measuredVertexIndex);
      ((minY = Math.min(minY, vertexY)), (maxY = Math.max(maxY, vertexY)));
    }
    return {
      min: minY,
      max: maxY,
    };
  }
  function alignLaptopScreenGeometry(
    screenGeometry,
    screenSourceGeometry,
    screenMaterialIndex = null,
    sourceMaterialIndex = null,
  ) {
    if (!screenGeometry?.attributes?.position) return screenGeometry;
    const screenPositionAttribute = screenGeometry.attributes.position,
      screenVertexIndices = collectVertexSet(screenGeometry, screenMaterialIndex);
    if (!screenVertexIndices.size) return screenGeometry;
    const { min: screenMinY, max: screenMaxY } = measureYRange(
      screenPositionAttribute,
      screenVertexIndices,
    );
    if (
      !Number.isFinite(screenMinY) ||
      !Number.isFinite(screenMaxY) ||
      screenMaxY - screenMinY < 0.001
    )
      return screenGeometry;
    const sourcePositionAttribute = screenSourceGeometry?.attributes?.position,
      sourceVertexIndices = collectVertexSet(screenSourceGeometry, sourceMaterialIndex);
    if (!sourcePositionAttribute || !sourceVertexIndices.size) return screenGeometry;
    const sourceYRange = measureYRange(sourcePositionAttribute, sourceVertexIndices);
    if (!Number.isFinite(sourceYRange.min) || !Number.isFinite(sourceYRange.max))
      return screenGeometry;
    const midY = (sourceYRange.min + sourceYRange.max) / 2;
    let lowerVertex = null,
      upperVertex = null;
    for (const vertexLoopIndex of sourceVertexIndices) {
      const vertexPosition = {
        y: sourcePositionAttribute.getY(vertexLoopIndex),
        z: sourcePositionAttribute.getZ(vertexLoopIndex),
      };
      (vertexPosition.y <= midY &&
        (!lowerVertex || vertexPosition.z > lowerVertex.z) &&
        (lowerVertex = vertexPosition),
        vertexPosition.y > midY &&
          (!upperVertex || vertexPosition.z > upperVertex.z) &&
          (upperVertex = vertexPosition));
    }
    if (!lowerVertex || !upperVertex || upperVertex.y - lowerVertex.y < 0.001)
      return screenGeometry;
    const screenHeight = upperVertex.y - lowerVertex.y,
      lowerY = lowerVertex.y + screenHeight * 0.04,
      upperY = upperVertex.y - screenHeight * 0.07,
      screenHeightRange = screenMaxY - screenMinY;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const zVertexIndex of screenVertexIndices) {
      const vertexZ = screenPositionAttribute.getZ(zVertexIndex);
      ((minZ = Math.min(minZ, vertexZ)), (maxZ = Math.max(maxZ, vertexZ)));
    }
    const zRange = Math.max(maxZ - minZ, 0.001),
      zInset = Math.min(zRange, screenHeight * 0.022),
      zOffset = screenHeight * 0.008,
      alignedGeometry = screenGeometry.clone?.();
    if (!alignedGeometry?.attributes?.position) return screenGeometry;
    const alignedPositionAttribute = alignedGeometry.attributes.position;
    for (const alignVertexIndex of screenVertexIndices) {
      const alignVertexY = screenPositionAttribute.getY(alignVertexIndex),
        alignedY = lowerY + ((alignVertexY - screenMinY) / screenHeightRange) * (upperY - lowerY),
        alignedZ =
          lowerVertex.z +
          ((alignedY - lowerVertex.y) / screenHeight) * (upperVertex.z - lowerVertex.z) +
          zOffset,
        zRatio = (screenPositionAttribute.getZ(alignVertexIndex) - minZ) / zRange;
      (alignedPositionAttribute.setY(alignVertexIndex, alignedY),
        alignedPositionAttribute.setZ(alignVertexIndex, alignedZ - zInset * (1 - zRatio)));
    }
    return (
      (alignedPositionAttribute.needsUpdate = true),
      alignedGeometry.computeVertexNormals?.(),
      alignedGeometry.computeBoundingBox?.(),
      alignedGeometry.computeBoundingSphere?.(),
      alignedGeometry
    );
  }
  const TEXTURE_MAP_PROPERTY_NAMES = Object.freeze([
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
      "transmissionMap",
    ]),
    MATERIAL_PROPERTY_NAMES = Object.freeze([
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
      "wireframeLinewidth",
    ]);
  /** 普通字面量对象（调色板 / 覆盖表这类）：交给签名函数逐键展开。 */
function isPlainRecord(recordValue: any): boolean {
  if (!recordValue || typeof recordValue != "object" || Array.isArray(recordValue)) return false;
  const recordPrototype = Object.getPrototypeOf(recordValue);
  return recordPrototype === Object.prototype || recordPrototype === null;
}
function normalizeMaterialValue(materialValue) {
    return materialValue === undefined
      ? "undefined"
      : materialValue === null
        ? null
        : typeof materialValue == "number"
          ? Number.isNaN(materialValue)
            ? "NaN"
            : Number.isFinite(materialValue)
              ? Object.is(materialValue, -0)
                ? 0
                : materialValue
              : materialValue > 0
                ? "Infinity"
                : "-Infinity"
          : ["string", "boolean"].includes(typeof materialValue)
            ? materialValue
            : materialValue.isTexture
              ? ["texture", materialValue.uuid ?? materialValue.id ?? "anonymous"]
              : materialValue.isColor
                ? [materialValue.r, materialValue.g, materialValue.b]
                : Array.isArray(materialValue)
                  ? materialValue.map(normalizeMaterialValue)
                  : typeof materialValue.toArray == "function"
                    ? materialValue.toArray().map(normalizeMaterialValue)
                    : ["x", "y", "z", "w"].some(
                          (axisName) => typeof materialValue[axisName] == "number",
                        )
                      ? [materialValue.x, materialValue.y, materialValue.z, materialValue.w].map(
                          normalizeMaterialValue,
                        )
                      : isPlainRecord(materialValue)
                        ? // 普通对象（如 materialOverrides）逐键递归：不能落到 String()，
                          // 否则不同覆盖值会签成同一个 "[object Object]"，材质变体会被错误复用。
                          Object.keys(materialValue)
                            .sort()
                            .map((recordKey) => [
                              recordKey,
                              normalizeMaterialValue(materialValue[recordKey]),
                            ])
                        : String(materialValue);
  }
  function materialSignature(materialToSign) {
    if (materialToSign?.isShaderMaterial || materialToSign?.isRawShaderMaterial)
      return JSON.stringify([
        materialToSign.type || "ShaderMaterial",
        "unique",
        materialToSign.uuid || materialToSign.id,
      ]);
    const customProgramKey =
      typeof materialToSign?.customProgramCacheKey == "function"
        ? materialToSign.customProgramCacheKey()
        : "";
    return JSON.stringify([
      materialToSign?.type || materialToSign?.constructor?.name || "Material",
      customProgramKey,
      materialToSign?.userData?.plan2SurfaceContact !== false,
      materialToSign?.userData?.plan2SurfaceSlope === true,
      MATERIAL_PROPERTY_NAMES.map((propertyName) => [
        propertyName,
        normalizeMaterialValue(materialToSign?.[propertyName]),
      ]),
      TEXTURE_MAP_PROPERTY_NAMES.map((texturePropertyName) => [
        texturePropertyName,
        normalizeMaterialValue(materialToSign?.[texturePropertyName]),
      ]),
    ]);
  }
  function optionsSignature(optionsObject) {
    return JSON.stringify(
      Object.keys(optionsObject)
        .sort()
        .map((optionName) => [optionName, normalizeMaterialValue(optionsObject[optionName])]),
    );
  }
  /**
   * 该（模型，材质名）是否走 `applyItemDetailMaterial` 的调色板 / 角色表出图。
   * 判据与 resolveSharedMaterial 的选材三元式必须完全一致：检查面板要按同一条规则报出
   * 「这个槽位到底由谁上色」，否则界面显示的会和画面不一致。
   */
  function usesDetailMaterialPipeline(itemType, materialName, palette) {
    return (
      paletteOverrideItemTypes.has(itemType) ||
      (itemType === "aquarium" && materialName?.startsWith("aquarium-aquatic-")) ||
      COURTYARD_MODELS[itemType] ||
      DECOR_MODELS[itemType] ||
      materialName?.includes("-furniture-") ||
      gardenItemTypes.has(itemType) ||
      applianceItemTypes.has(itemType) ||
      // 角色表驱动的模型（柜体 / 洁具 / 木器 / 设备 / 摆件…）：两种主题都统一由
      // studio-model-material-roles.ts 出图，避免默认主题直接吃 GLB 的烘焙占位色。
      (roleTableItemTypes.has(itemType) &&
        !isStructuralModelFamily(resolveModelFamily(itemType))) ||
      (palette.warmWood && warmWoodFurnitureItemTypes.has(itemType))
    );
  }
  /**
   * 净化器 / 立柜空调的**导引面**：整块网格只挂一张 `*-material-2|3`，挂载时会被隐藏。
   * 检查面板要跳过它，否则会多报一行用户根本看不见的材质。
   */
  function isHiddenApplianceGuideMesh(modelType, meshMaterials) {
    return (
      (modelType === "airpurifier" || modelType === "floorac") &&
      meshMaterials.every(
        (guideMaterial) =>
          guideMaterial?.name ===
          modelType + "-material-" + (modelType === "airpurifier" ? 3 : 2),
      )
    );
  }
  /**
   * 取某个材质名上的**逐物件覆盖色**（`item.materialOverrides`）。
   * 覆盖是整条选材链的最后一手：无论该槽位原本由角色表、调色板还是 GLB 烘焙色决定，
   * 用户显式指定的颜色都赢，所以它不挂在任何专用分支里。
   */
  function materialOverrideColorFor(palette, materialName) {
    const overridePalette = palette?.materialOverrides;
    if (!materialName || !overridePalette || typeof overridePalette != "object") return null;
    const overrideColor = overridePalette[materialName];
    return typeof overrideColor == "string" && /^#[0-9a-f]{6}$/i.test(overrideColor)
      ? overrideColor.toLowerCase()
      : null;
  }
  function applyMaterialOverride(resolvedMaterial, materialName, palette) {
    const overrideColor = materialOverrideColorFor(palette, materialName);
    if (!overrideColor || !resolvedMaterial?.color) return resolvedMaterial;
    const previousColorHex = resolvedMaterial.color.getHex();
    // 暖木系的「自发光=本体色」是把 emissive 复制成 color 的；这里同步跟一次，
    // 否则改完色会留下旧色的自发光残影。
    resolvedMaterial.emissive?.isColor &&
      resolvedMaterial.emissive.getHex() === previousColorHex &&
      resolvedMaterial.emissive.set(overrideColor);
    resolvedMaterial.color.set(overrideColor);
    return resolvedMaterial;
  }
  /**
   * 取某个材质名上的**逐槽表面覆盖**（`item.materialSurfaceOverrides`）。
   *
   * 颜色之外只开放粗糙度与金属度：透明 / 自发光 / 深度写入属于结构语义，跟着角色走才安全，
   * 让用户改会把玻璃、灯罩、屏幕这类部件改坏。
   */
  function materialSurfaceOverrideFor(palette, materialName) {
    const surfaceOverridePalette = palette?.materialSurfaceOverrides;
    if (!materialName || !surfaceOverridePalette || typeof surfaceOverridePalette != "object")
      return null;
    const surfaceOverride = surfaceOverridePalette[materialName];
    if (!surfaceOverride || typeof surfaceOverride != "object") return null;
    const roughness = normalizeSurfaceOverrideValue(surfaceOverride.roughness),
      metalness = normalizeSurfaceOverrideValue(surfaceOverride.metalness);
    return roughness === null && metalness === null ? null : { roughness, metalness };
  }
  function normalizeSurfaceOverrideValue(surfaceValue) {
    return typeof surfaceValue == "number" && Number.isFinite(surfaceValue)
      ? Math.min(1, Math.max(0, surfaceValue))
      : null;
  }
  function applyMaterialSurfaceOverride(resolvedMaterial, materialName, palette) {
    const surfaceOverride = materialSurfaceOverrideFor(palette, materialName);
    if (!surfaceOverride || !resolvedMaterial) return resolvedMaterial;
    surfaceOverride.roughness !== null && (resolvedMaterial.roughness = surfaceOverride.roughness);
    surfaceOverride.metalness !== null && (resolvedMaterial.metalness = surfaceOverride.metalness);
    return resolvedMaterial;
  }
  /**
   * 石材板贴图：整块石材按**一张整图**贴到板面上（配合装载期补的平面 UV，见
   * `applyStoneSlabPlanarUv`）。色号决定画法，材质基色只作一层薄染色 —— 纹路与色相
   * 都在贴图里，所以染色通常是「白色」或接近白，其余档位只是想压一点色温。
   */
  const stoneSlabTextureByFlavor = new Map();
  function stoneSlabTextureFor(flavor) {
    if (!stoneSlabTextureByFlavor.has(flavor)) {
      // clone 一份：要单独设平铺方式并触发 needsUpdate，不能改到背景墙共用那份缓存实例上。
      const slabTexture = createStoneSlabTexture(threeNamespace, flavor, 8)?.clone?.() ?? null;
      slabTexture &&
        ((slabTexture.wrapS = threeNamespace.RepeatWrapping),
        (slabTexture.wrapT = threeNamespace.RepeatWrapping),
        (slabTexture.needsUpdate = true));
      stoneSlabTextureByFlavor.set(flavor, slabTexture);
    }
    return stoneSlabTextureByFlavor.get(flavor);
  }
  /**
   * 把某槽位按「石材板」或「非石材板」收口。
   *
   *  · flavor 是合法色号 → 贴整图 + 抛光面（大理石纹路就在这一步出现）；
   *  · flavor 为 null → **摘掉**上游（角色表）打上的石材图：档位明说了这一槽不是石作
   *    （黑色岩板 / 水磨石 / 一切木器档位），不能顶着大理石云纹出图。
   *
   * 一律**不动自发光**：暖木给不透明件补的「与基色同色」自发光在石材板上一开始就被跳过
   * （见 resolveSharedMaterial 里的判据），换档时走的是同一趟材质解析，不需要在这里补。
   */
  function applyStoneSlabFinish(slabMaterial, flavor) {
    if (!slabMaterial) return slabMaterial;
    const isSlab = isStoneSlabFlavor(flavor),
      wasSlab = isStoneSlabFlavor(slabMaterial.userData?.homeosStoneSlab);
    // 既不是石材板、也从来不是：整支流程与它无关，直接放行（避免无谓地写 needsUpdate）。
    if (!isSlab && !wasSlab) return slabMaterial;
    const previousTexture = slabMaterial.map;
    if (isSlab) {
      const slabTexture = stoneSlabTextureFor(flavor);
      if (slabTexture) slabMaterial.map = slabTexture;
      const slabFinish = stoneSlabSurfaceFinish(flavor);
      slabFinish &&
        ((slabMaterial.roughness = slabFinish.roughness),
        (slabMaterial.metalness = slabFinish.metalness));
      slabMaterial.userData && (slabMaterial.userData.homeosStoneSlab = flavor);
    } else {
      slabMaterial.map = null;
      delete slabMaterial.userData?.homeosStoneSlab;
    }
    if (previousTexture !== slabMaterial.map) slabMaterial.needsUpdate = true;
    return slabMaterial;
  }
  /** 某槽位的石材板色号：只认**显式声明**（角色表或档位配方），不按槽位号猜。 */
  function stoneSlabFlavorFor(palette, itemType, materialName, materialIndex = 0) {
    const styleRecipe = materialStyleRecipeFor(itemType, materialName, palette, materialIndex);
    // 档位一旦出手，这一槽是不是石材板就由档位说了算（auto 时 styleRecipe 为 null，
    // 落到角色表的声明上）。两个来源都没有 = 不是石材板。
    return styleRecipe
      ? (isStoneSlabFlavor(styleRecipe.slab) ? styleRecipe.slab : null)
      : stoneSlabFlavorForMaterial(itemType, materialName, materialIndex);
  }
  /**
   * 逐物件「材质风格」档位（`item.materialStyle`）的最后一手，**紧挨在逐槽覆盖色之前**：
   *
   *  · 档位 = 整套角色换料，所以它要盖住家族底表 / 模型专用配方 / 暖木收尾算出来的颜色；
   *  · 逐槽覆盖色（用户在某一行手工挑的颜色）比档位更具体，仍旧赢。
   *
   * 档位为 auto / 非法 / 该模型不提供档位时（`materialStyleRecipeFor` 返回 null）本函数不动材质。
   */
  function applyMaterialStyleRecipe(resolvedMaterial, materialName, itemType, palette) {
    const styleRecipe = materialStyleRecipeFor(itemType, materialName, palette);
    if (!styleRecipe || !resolvedMaterial) return resolvedMaterial;
    if (styleRecipe.colorValue !== undefined && resolvedMaterial.color?.setHex) {
      const previousColorHex = resolvedMaterial.color.getHex();
      resolvedMaterial.color.setHex(styleRecipe.colorValue);
      // 暖木系把 emissive 复制成了本体色：改色时同步跟一次，否则留旧色残影。
      resolvedMaterial.emissive?.isColor &&
        resolvedMaterial.emissive.getHex() === previousColorHex &&
        resolvedMaterial.emissive.setHex(styleRecipe.colorValue);
    }
    if (styleRecipe.emissiveValue !== undefined && resolvedMaterial.emissive?.setHex) {
      resolvedMaterial.emissive.setHex(styleRecipe.emissiveValue);
      resolvedMaterial.emissiveIntensity = styleRecipe.emissiveIntensity ?? 0.5;
    }
    styleRecipe.roughness !== undefined && (resolvedMaterial.roughness = styleRecipe.roughness);
    styleRecipe.metalness !== undefined && (resolvedMaterial.metalness = styleRecipe.metalness);
    styleRecipe.transparent !== undefined && (resolvedMaterial.transparent = styleRecipe.transparent);
    styleRecipe.opacity !== undefined && (resolvedMaterial.opacity = styleRecipe.opacity);
    styleRecipe.depthWrite !== undefined && (resolvedMaterial.depthWrite = styleRecipe.depthWrite);
    if (
      styleRecipe.flatShading !== undefined &&
      resolvedMaterial.flatShading !== styleRecipe.flatShading
    ) {
      ((resolvedMaterial.flatShading = styleRecipe.flatShading),
        (resolvedMaterial.needsUpdate = true));
    }
    styleRecipe.fabricLike &&
      resolvedMaterial.userData &&
      (resolvedMaterial.userData.warmDiningFabric = true);
    // 石材板最后收口：档位一旦在这一槽出手，是不是大理石就由档位说了算 —— 声明了色号就贴整图，
    // 没声明就把角色表打上的石材图摘掉（木器档位的桌面不该顶着大理石云纹）。
    applyStoneSlabFinish(
      resolvedMaterial,
      isStoneSlabFlavor(styleRecipe.slab) ? styleRecipe.slab : null,
    );
    return resolvedMaterial;
  }
  function resolveSharedMaterial(sourceMaterial, palette, itemType, styleKey, partKey = "") {
    if (!sourceMaterial) return sourceMaterial;
    let variantCacheByStyle = materialVariantsBySource.get(sourceMaterial);
    variantCacheByStyle ||
      ((variantCacheByStyle = new Map()),
      materialVariantsBySource.set(sourceMaterial, variantCacheByStyle));
    const sourceSignature = JSON.stringify([
        sourceMaterial.version,
        sourceMaterial.name,
        normalizeMaterialValue(sourceMaterial.color),
        sourceMaterial.side,
        sourceMaterial.transparent,
        sourceMaterial.opacity,
        sourceMaterial.depthWrite,
        sourceMaterial.depthTest,
      ]),
      variantCacheKey = partKey ? itemType + ":" + partKey : itemType,
      cachedVariant = variantCacheByStyle.get(variantCacheKey);
    if (cachedVariant?.styleKey === styleKey && cachedVariant.sourceKey === sourceSignature)
      return ((materialReuseCount += 1), cachedVariant.material);
    const resolvedMaterial =
      usesDetailMaterialPipeline(itemType, sourceMaterial.name, palette)
        ? applyItemDetailMaterial(sourceMaterial, palette, itemType)
        : sourceMaterial.clone?.() || sourceMaterial;
    // 石材板（角色表声明的那一层）：**不挂在任何一支选材分支里** —— 餐桌 / 茶几走的是
    // 「按角色命名」的分支而不走角色表，把这一步放在外面，两支才有同一个判据。
    // 档位层（applyMaterialStyleRecipe）在最后收口，可以推翻这一手。
    applyStoneSlabFinish(resolvedMaterial, stoneSlabFlavorForMaterial(itemType, sourceMaterial.name));
    if (
      (palette.warmWood &&
        !DECOR_MODELS[itemType] &&
        resolvedMaterial.color &&
        !resolvedMaterial.transparent &&
        !(itemType === "nas" && /^nas-material-4(?:$|\s)/.test(sourceMaterial.name || "")) &&
        // 石材板不补这层「与基色同色」的微光：它会把深浅纹路之间的对比压平，黑金大理石的
        // 白纹会被糊成一块灰。判据与贴图那一手同源（档位优先，其次角色表）。
        !stoneSlabFlavorFor(palette, itemType, sourceMaterial.name) &&
        ((resolvedMaterial.emissive = resolvedMaterial.color.clone()),
        (resolvedMaterial.emissiveIntensity =
          itemType.startsWith("curtain_") &&
          ["1", "2", "3", "5"].includes((sourceMaterial.name || "").match(/material-(\d+)/)?.[1])
            ? 0.38
            : sofaFamilyItemTypes.has(itemType) || ["bed", "rug", "chair"].includes(itemType)
              ? 0.12
              : 0.065)),
      palette.warmWood && itemType === "stairs")
    ) {
      const isFloorTreadMaterial = /(?:material-1|-soft)$/.test(sourceMaterial.name || "");
      (resolvedMaterial.color?.set?.(isFloorTreadMaterial ? palette.floor : palette.floorEdge),
        resolvedMaterial.emissive?.copy?.(resolvedMaterial.color),
        (resolvedMaterial.metalness = 0),
        isFloorTreadMaterial &&
          (decorateWarmFloor(resolvedMaterial, palette),
          (resolvedMaterial.userData.warmFloorTread = true)));
    }
    (resolvedMaterial.userData?.warmFloorTread && (resolvedMaterial.emissiveIntensity = 0.075),
      resolvedMaterial.userData?.warmDiningMaterial &&
        (resolvedMaterial.emissiveIntensity = resolvedMaterial.userData.warmDiningFabric
          ? 0.1
          : 0.05));
    const cabinetDoorMaterialIndex = {
      sideboard: "3",
      shoecabinet: "4",
      wallcabinet: "3",
      kitchenbase: "3",
      kitchensink: "7",
      kitchencooktop: "4",
    }[itemType],
      /**
       * 储物柜（`cabinet.glb`）是唯一把**柜体与两扇柜门并进同一个闭合箱**的柜类：整个
       * 1.60×1.90×0.45 的箱体就是 `cabinet-material-0`，正脸那 ±z 两面是柜门面（拉手装在这面上），
       * 顶 / 侧 / 底 / 背也是这一支料 —— 它没有独立柜体槽。所以「木柜白门」这类档位会把整只柜子
       * 刷成门色（全白），而同档位的吊柜是**木色柜体 + 白门**，两件配不成套。
       *
       * 修法与 sideboard / shoecabinet / wallcabinet 的「柜门返边」同源（按面法线把非前脸刷成
       * 柜体色），但**触发条件与返边色不同**：其余柜类的返边是暖木主题的既有做法，只在暖木下生效；
       * 储物柜则要在**选了档位**时就返边（默认主题下选「木柜白门」同样不能整只全白），且返边色取
       * 该档位给 `body` 角色的配方色（吊柜的柜体正是这一支料），而不是主题固定的 woodDark ——
       * 档位之间柜体色各不相同（木柜白门 #3d2818 / 浅橡木 #c49a6c / 胡桃木 #5a3a22 / 深色烤漆
       * #2e2a28），只有逐档取柜体色才能和同档吊柜对上。auto 档不介入：此时 material-0 本来就是
       * 柜体色（暖木）或主题门色，无需返边。
       */
      isStyledCabinetDoorMaterial =
        itemType === "cabinet" &&
        palette.materialStyle !== undefined &&
        (sourceMaterial.name || "").endsWith("cabinet-material-0");
    if (
      (palette.warmWood &&
        cabinetDoorMaterialIndex !== undefined &&
        (sourceMaterial.name || "").endsWith("material-" + cabinetDoorMaterialIndex)) ||
      isStyledCabinetDoorMaterial
    ) {
      const styledCabinetBodyColorValue = isStyledCabinetDoorMaterial
          ? materialStyleRoleColorFor("cabinet", "body", palette)
          : undefined,
        doorEdgeColor =
          styledCabinetBodyColorValue !== undefined
            ? new threeNamespace.Color(styledCabinetBodyColorValue)
            : ["sideboard", "shoecabinet", "wallcabinet"].includes(itemType)
              ? new threeNamespace.Color(palette.woodDark ?? palette.furnitureDark)
              : null;
      ((resolvedMaterial.onBeforeCompile = (shaderProgram) => {
        ((shaderProgram.vertexShader = shaderProgram.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nwarmDoorFace = abs(normal.z);",
          )),
          doorEdgeColor
            ? ((shaderProgram.uniforms.warmDoorEdgeColor = {
                value: doorEdgeColor,
              }),
              (shaderProgram.fragmentShader = shaderProgram.fragmentShader
                .replace(
                  "#include <common>",
                  "#include <common>\nvarying float warmDoorFace;\nuniform vec3 warmDoorEdgeColor;",
                )
                .replace(
                  "#include <color_fragment>",
                  "#include <color_fragment>\nif (warmDoorFace < 0.85) diffuseColor.rgb = warmDoorEdgeColor;",
                )
                .replace(
                  "#include <emissivemap_fragment>",
                  "#include <emissivemap_fragment>\nif (warmDoorFace < 0.85) totalEmissiveRadiance = warmDoorEdgeColor * 0.065;",
                )))
            : (shaderProgram.fragmentShader = shaderProgram.fragmentShader
                .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
                .replace(
                  "#include <color_fragment>",
                  "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.70, 1.0, smoothstep(0.45, 0.85, warmDoorFace));",
                )));
      }),
        (resolvedMaterial.customProgramCacheKey = () =>
          doorEdgeColor
            ? "warm-cabinet-door-returns-v2-" + doorEdgeColor.getHexString()
            : "warm-cabinet-door-returns-v1"),
        doorEdgeColor && (resolvedMaterial.userData.warmCabinetDoorReturns = true));
    }
    if (
      palette.warmWood &&
      itemType === "shoecabinet" &&
      /material-3$/.test(sourceMaterial.name || "")
    ) {
      const shoeTopColor = new threeNamespace.Color(palette.countertop);
      ((resolvedMaterial.onBeforeCompile = (shoeShaderProgram) => {
        ((shoeShaderProgram.uniforms.warmShoeTopColor = {
          value: shoeTopColor,
        }),
          (shoeShaderProgram.vertexShader = shoeShaderProgram.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 warmShoePosition;")
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nwarmShoePosition = position;",
            )),
          (shoeShaderProgram.fragmentShader = shoeShaderProgram.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 warmShoePosition;\nuniform vec3 warmShoeTopColor;",
            )
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\nfloat warmShoeTop = step(-0.002, warmShoePosition.x) * step(0.932, warmShoePosition.y) * (1.0 - step(0.970, warmShoePosition.y));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmShoeTopColor, warmShoeTop);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmShoeTopColor * 0.065, warmShoeTop);",
            )));
      }),
        (resolvedMaterial.customProgramCacheKey = () =>
          "warm-shoe-countertop-v1-" + shoeTopColor.getHexString()));
    }
    if (palette.warmWood && itemType === "bed" && /material-1$/.test(sourceMaterial.name || "")) {
      const bedRunnerColor = new threeNamespace.Color(palette.runnerColor ?? palette.furnitureSoft);
      ((resolvedMaterial.roughness = 0.94),
        (resolvedMaterial.onBeforeCompile = (bedShaderProgram) => {
          ((bedShaderProgram.uniforms.warmBedRunner = {
            value: bedRunnerColor,
          }),
            (bedShaderProgram.vertexShader = bedShaderProgram.vertexShader
              .replace("#include <common>", "#include <common>\nvarying float warmBedZ;")
              .replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nwarmBedZ = position.z;",
              )),
            (bedShaderProgram.fragmentShader = bedShaderProgram.fragmentShader
              .replace(
                "#include <common>",
                "#include <common>\nvarying float warmBedZ;\nuniform vec3 warmBedRunner;",
              )
              .replace(
                "#include <color_fragment>",
                "#include <color_fragment>\nfloat warmRunner = smoothstep(0.40, 0.415, warmBedZ) * (1.0 - smoothstep(0.86, 0.875, warmBedZ));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmBedRunner, warmRunner);",
              )
              .replace(
                "#include <emissivemap_fragment>",
                "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmBedRunner * 0.12, warmRunner);",
              )));
        }),
        (resolvedMaterial.customProgramCacheKey = () =>
          "warm-bed-runner-v1-" + bedRunnerColor.getHexString()));
    }
    (itemType === "smallcar" &&
      (palette.warmWood &&
        (resolvedMaterial.color?.set?.(16776696),
        (resolvedMaterial.roughness = 0.38),
        (resolvedMaterial.metalness = 0.02),
        (resolvedMaterial.emissiveMap = resolvedMaterial.map),
        (resolvedMaterial.emissiveIntensity = 0.08)),
      applyCarFinish(resolvedMaterial, {
        pearlWhite: palette.warmWood === true,
      })),
      ((itemType === "glasscabinet" &&
        /^glasscabinet-material-(0|10)$/.test(sourceMaterial.name)) ||
        (itemType === "bookcase" && /^bookcase-material-(0|7)$/.test(sourceMaterial.name))) &&
        (resolvedMaterial.color?.set?.(
          palette.warmWood ? (palette.cabinetWood ?? palette.wood) : palette.furniture,
        ),
        (resolvedMaterial.transparent = false),
        (resolvedMaterial.opacity = 1),
        (resolvedMaterial.depthWrite = true),
        (resolvedMaterial.depthTest = true)),
      ["suv", "scooter"].includes(itemType) &&
        applyVehicleFinish(threeNamespace, resolvedMaterial, sourceMaterial, palette),
      itemType === "steelstairs" &&
        ((resolvedMaterial.metalness = 0),
        (resolvedMaterial.roughness = 0.9),
        (resolvedMaterial.envMap = null),
        (resolvedMaterial.envMapIntensity = 0)),
      itemType === "steelstairs" &&
        partKey === "handrail" &&
        (resolvedMaterial.color?.set?.(palette.furnitureDark),
        resolvedMaterial.emissive?.copy?.(resolvedMaterial.color),
        (resolvedMaterial.onBeforeCompile = threeNamespace.Material.prototype.onBeforeCompile),
        (resolvedMaterial.customProgramCacheKey =
          threeNamespace.Material.prototype.customProgramCacheKey),
        delete resolvedMaterial.userData.warmFloorTread));
    // 逐物件档位（材质风格）先落，逐槽覆盖色次之，逐槽表面参数最后 —— 越具体的越靠后。
    applyMaterialStyleRecipe(resolvedMaterial, sourceMaterial.name, itemType, palette);
    // 逐物件覆盖色必须在 materialSignature 之前落下：签名决定材质缓存的复用，
    // 覆盖后签名才会跟着变色，不同覆盖值的两个物件不会共用同一份材质。
    applyMaterialOverride(resolvedMaterial, sourceMaterial.name, palette);
    // 逐槽表面参数同理：粗糙 / 金属度也在 materialSignature 里，覆盖后缓存自然分叉。
    applyMaterialSurfaceOverride(resolvedMaterial, sourceMaterial.name, palette);
    const resolvedSignature = materialSignature(resolvedMaterial);
    if (materialCacheBySignature.has(resolvedSignature)) {
      ((materialReuseCount += 1),
        resolvedMaterial !== sourceMaterial && resolvedMaterial.dispose?.());
      const cachedSharedMaterial = materialCacheBySignature.get(resolvedSignature);
      return (
        variantCacheByStyle.set(variantCacheKey, {
          styleKey: styleKey,
          sourceKey: sourceSignature,
          material: cachedSharedMaterial,
        }),
        cachedSharedMaterial
      );
    }
    return (
      materialCacheBySignature.set(resolvedSignature, resolvedMaterial),
      variantCacheByStyle.set(variantCacheKey, {
        styleKey: styleKey,
        sourceKey: sourceSignature,
        material: resolvedMaterial,
      }),
      resolvedMaterial
    );
  }
  function getCachedGeometryVariant(cacheOwner, baseGeometry, variantKey, buildVariant) {
    if (!baseGeometry) return baseGeometry;
    let variantsBySourceGeometry = geometryVariantsBySource.get(cacheOwner);
    variantsBySourceGeometry ||
      ((variantsBySourceGeometry = new WeakMap()),
      geometryVariantsBySource.set(cacheOwner, variantsBySourceGeometry));
    let variantsByBaseGeometry = variantsBySourceGeometry.get(baseGeometry);
    return (
      variantsByBaseGeometry ||
        ((variantsByBaseGeometry = new Map()),
        variantsBySourceGeometry.set(baseGeometry, variantsByBaseGeometry)),
      variantsByBaseGeometry.has(variantKey) ||
        variantsByBaseGeometry.set(variantKey, buildVariant()),
      variantsByBaseGeometry.get(variantKey)
    );
  }
  function addExternalItemModel(
    parentGroup,
    targetSize,
    addOptions: ExternalModelStyleOptions = {},
    { selected: isSelected = false, staticMaterialKey = null, staticVertexTint = true } = {},
  ) {
    const modelType = resolveModelTypeForItem(targetSize),
      loadedModel = preparedTemplatesByItemType.get(modelType);
    if (!loadedModel) return (loadExternalItemModel(modelType), false);
    const optionsKey = optionsSignature(addOptions),
      modelClone = loadedModel.source.clone(true),
      curtainPart = /^curtain_(left|right|split)$/.exec(modelType)?.[1];
    curtainPart && (modelClone.userData.curtainRigRoot = true);
    let screenReference = null;
    (modelType === "laptop" &&
      modelClone.traverse((laptopMesh) => {
        if (!laptopMesh.isMesh || screenReference) return;
        const screenMaterialIndexInMesh = (
          Array.isArray(laptopMesh.material) ? laptopMesh.material : [laptopMesh.material]
        ).findIndex(
          (meshMaterialEntry) =>
            (meshMaterialEntry?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "1",
        );
        screenMaterialIndexInMesh < 0 ||
          (screenReference = {
            geometry: laptopMesh.geometry,
            materialIndex: Array.isArray(laptopMesh.material) ? screenMaterialIndexInMesh : null,
          });
      }),
      modelClone.traverse((modelMesh) => {
        if (!modelMesh.isMesh) return;
        const meshMaterials = Array.isArray(modelMesh.material)
          ? modelMesh.material
          : [modelMesh.material];
        if (
          ((modelMesh.userData.externalModelSharedGeometry = true),
          (modelMesh.userData.externalModelSharedTextures = true),
          // 立柱在户型里属于**墙**：地面反射据此把它和墙面归到同一趟里处理。
          PILLAR_MODEL_ITEM_TYPES.has(modelType) &&
            (modelMesh.userData.reflectionRole = "wall"),
          isHiddenApplianceGuideMesh(modelType, meshMaterials))
        ) {
          ((modelMesh.visible = false),
            (modelMesh.userData.hiddenApplianceGuide = true),
            (modelMesh.userData.externalModelSharedMaterial = true));
          return;
        }
        if (modelType === "plant" && addOptions.warmWood) {
          const leafMaterialKey =
            "warm-leaves:" +
            meshMaterials
              .map((leafMaterialEntry) => (/foliage/i.test(leafMaterialEntry?.name || "") ? 1 : 0))
              .join(",");
          modelMesh.geometry = getCachedGeometryVariant(
            loadedModel,
            modelMesh.geometry,
            leafMaterialKey,
            () => enlargeWarmLeaves(modelMesh.geometry, meshMaterials),
          );
        }
        if (curtainPart) {
          const curtainMaterialNumber = Number(
            /material-(\d+)$/.exec(meshMaterials[0]?.name || "")?.[1],
          );
          modelMesh.userData.curtainPart =
            curtainMaterialNumber === 0
              ? "rod"
              : curtainMaterialNumber === (curtainPart === "split" ? 1 : 3)
                ? "cap"
                : (curtainPart === "split" ? [2, 3] : [4, 5]).includes(curtainMaterialNumber)
                  ? "cloth"
                  : "band";
        }
        const panelMaterialIndex = meshMaterials.findIndex(
          (panelMaterialEntry) =>
            (panelMaterialEntry?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "2",
        );
        if (modelType === "laptop" && panelMaterialIndex >= 0 && screenReference) {
          const screenPanelMaterialIndex = Array.isArray(modelMesh.material)
              ? panelMaterialIndex
              : null,
            screenGeometryKey = JSON.stringify([
              "laptop-screen",
              screenReference.geometry.uuid,
              screenPanelMaterialIndex,
              screenReference.materialIndex,
            ]);
          modelMesh.geometry = getCachedGeometryVariant(
            loadedModel,
            modelMesh.geometry,
            screenGeometryKey,
            () =>
              alignLaptopScreenGeometry(
                modelMesh.geometry,
                screenReference.geometry,
                screenPanelMaterialIndex,
                screenReference.materialIndex,
              ),
          );
        } else
          (modelType === "tea_bar_machine" || modelType === "dishwasher") &&
            (modelMesh.geometry = getCachedGeometryVariant(
              loadedModel,
              modelMesh.geometry,
              "smooth-appliance",
              () => smoothGeometryNormals(modelMesh.geometry),
            ));
        const resolveMeshMaterial = (meshSourceMaterial) => {
          const steelStairPartKey =
              modelType === "steelstairs" && ["Geom3D_8", "Geom3D_61"].includes(modelMesh.name)
                ? "handrail"
                : "",
            sharedMaterial = resolveSharedMaterial(
              meshSourceMaterial,
              addOptions,
              modelType,
              optionsKey,
              steelStairPartKey,
            ),
            materialForMesh = (isSelected && sharedMaterial?.clone?.()) || sharedMaterial;
          return (
            isSelected &&
              [
                "sideboard",
                "shoecabinet",
                "wallcabinet",
                // 储物柜的「柜门返边」（见 resolveSharedMaterial 的 isStyledCabinetDoorMaterial）
                // 同样挂在 onBeforeCompile 上，选中态克隆材质会丢掉它 —— 不补这一手，选中的
                // 储物柜会整只变回全白，与未选中时不是同一件东西。
                "cabinet",
                "suv",
                "scooter",
              ].includes(modelType) &&
              ((materialForMesh.onBeforeCompile = sharedMaterial.onBeforeCompile),
              (materialForMesh.customProgramCacheKey = sharedMaterial.customProgramCacheKey)),
            materialForMesh
          );
        };
        if (
          ((modelMesh.material = Array.isArray(modelMesh.material)
            ? modelMesh.material.map(resolveMeshMaterial)
            : resolveMeshMaterial(modelMesh.material)),
          warmWoodFurnitureItemTypes.has(modelType) &&
            (Array.isArray(modelMesh.material) ? modelMesh.material : [modelMesh.material]).some(
              (transparentMaterialEntry) =>
                transparentMaterialEntry?.transparent && transparentMaterialEntry.opacity < 1,
            ) &&
            (modelMesh.renderOrder = Math.max(modelMesh.renderOrder, 6)),
          (modelMesh.castShadow = modelType !== "rug"),
          (modelMesh.receiveShadow =
            !["glassstairs", "floatingstairs"].includes(modelType) ||
            modelMesh.material?.transparent !== true),
          modelType === "laptop" || modelType === "nas")
        ) {
          const meshMaterialList = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          for (const opaqueMaterial of meshMaterialList)
            opaqueMaterial &&
              !opaqueMaterial.transparent &&
              opaqueMaterial.opacity >= 0.999 &&
              ((opaqueMaterial.depthWrite = true),
              (opaqueMaterial.depthTest = true),
              (opaqueMaterial.forceSinglePass = true));
        }
        if (modelType === "rug") {
          const rugMaterialList = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          modelMesh.renderOrder = rugMaterialList.some(
            (rugMaterialEntry) => rugMaterialEntry?.polygonOffset,
          )
            ? 1
            : 0;
        }
        modelMesh.userData.externalModelSharedMaterial = !isSelected;
      }),
      isSelected ||
        furnitureBatchCache.prepare(
          modelClone,
          loadedModel,
          modelType,
          staticMaterialKey,
          staticVertexTint,
        ));
    const catalogDefinition = ALL_ITEM_MODELS[modelType],
      scaleBasisSize =
        Array.isArray(catalogDefinition?.scaleBasis) && catalogDefinition.scaleBasis.length === 3
          ? {
              x: catalogDefinition.scaleBasis[0],
              y: catalogDefinition.scaleBasis[1],
              z: catalogDefinition.scaleBasis[2],
            }
          : loadedModel.size;
    if (catalogDefinition?.preserveAspect) {
      const fitScale = Math.min(
        targetSize.width / scaleBasisSize.x,
        targetSize.height / scaleBasisSize.y,
        targetSize.depth / scaleBasisSize.z,
      );
      modelClone.scale.setScalar(fitScale);
    } else
      modelClone.scale.set(
        targetSize.width / scaleBasisSize.x,
        targetSize.height / scaleBasisSize.y,
        targetSize.depth / scaleBasisSize.z,
      );
    if (catalogDefinition?.preserveOrigin) {
      if (catalogDefinition?.groundAlign) {
        modelClone.updateMatrixWorld(true);
        const groundBox = new threeNamespace.Box3().setFromObject(modelClone);
        ((modelClone.position.y -= groundBox.min.y),
          (modelClone.position.y += finite(catalogDefinition.groundOffset, 0)));
      }
    } else {
      modelClone.updateMatrixWorld(true);
      const boundsBox = new threeNamespace.Box3().setFromObject(modelClone),
        boundsCenter = boundsBox.getCenter(new threeNamespace.Vector3());
      modelClone.position.set(-boundsCenter.x, -boundsBox.min.y, -boundsCenter.z);
    }
    return (parentGroup.add(modelClone), true);
  }
  /**
   * 该物件是否挂外部 GLB 模型（`3d-studio` 检查面板据此决定要不要显示「材质属性」）。
   * 程序化物件（帘轨 / 晾衣架 / 风扇 / 喇叭 / 画作 / 饰面墙 / 铭牌…）返回 false。
   */
  function hasExternalModelForItem(targetSize) {
    return Boolean(targetSize?.type && ALL_ITEM_MODELS[resolveModelTypeForItem(targetSize)]);
  }
  /**
   * 列出物件模型的**材质槽位检查表**：每个槽位的角色、当前实际显色与表面参数。
   *
   * 这里刻意复用渲染时的选材函数（resolveSharedMaterial），因此：
   *  · 颜色 / 粗糙度 / 金属度 / 透明度与画面**同源**，不走另一套估算；
   *  · 逐物件覆盖色（item.materialOverrides）已包含在内 —— 传进来的 addOptions 里带着它，
   *    所以 overrideColor 为空的槽位就是「跟随主题」的槽位；
   *  · 模型还没准备好时返回 null，调用方应显示「模型加载中」并在加载完成后重画。
   */
  function describeItemMaterials(targetSize, addOptions: ExternalModelStyleOptions = {}) {
    const modelType = resolveModelTypeForItem(targetSize),
      preparedModel = preparedTemplatesByItemType.get(modelType);
    if (!preparedModel) return null;
    const optionsKey = optionsSignature(addOptions),
      slotEntries = [];
    preparedModel.source.traverse((templateMesh) => {
      if (!templateMesh.isMesh) return;
      const meshMaterials = Array.isArray(templateMesh.material)
        ? templateMesh.material
        : [templateMesh.material];
      if (isHiddenApplianceGuideMesh(modelType, meshMaterials)) return;
      meshMaterials.forEach((templateMaterial, materialIndexInMesh) => {
        const slotName = templateMaterial?.name;
        if (!slotName || slotEntries.some((slotEntry) => slotEntry.name === slotName)) return;
        const resolvedMaterial = resolveSharedMaterial(
            templateMaterial,
            addOptions,
            modelType,
            optionsKey,
          ),
          roleResolution = resolveModelMaterialRole(modelType, slotName, materialIndexInMesh);
        slotEntries.push({
          name: slotName,
          role: roleResolution.role,
          roleSource: roleResolution.source,
          slot: roleResolution.slot ?? materialIndexInMesh,
          /** 该槽位是否由角色表 / 调色板出图；false = 直接沿用 GLB 烘焙色（或专用结构件分支）。 */
          fromPalette: usesDetailMaterialPipeline(modelType, slotName, addOptions),
          color: resolvedMaterial?.color ? "#" + resolvedMaterial.color.getHexString() : "",
          roughness: finite(resolvedMaterial?.roughness, 0),
          metalness: finite(resolvedMaterial?.metalness, 0),
          transparent: resolvedMaterial?.transparent === true,
          opacity: finite(resolvedMaterial?.opacity, 1),
          emissive: resolvedMaterial?.emissive?.isColor
            ? "#" + resolvedMaterial.emissive.getHexString()
            : "",
          emissiveIntensity: finite(resolvedMaterial?.emissiveIntensity, 0),
          depthWrite: resolvedMaterial?.depthWrite !== false,
          overrideColor: materialOverrideColorFor(addOptions, slotName) || "",
          surfaceOverride: materialSurfaceOverrideFor(addOptions, slotName),
          /** 该槽位实际用的石材板色号（"" = 不是石材板）。 */
          slab: isStoneSlabFlavor(resolvedMaterial?.userData?.homeosStoneSlab)
            ? resolvedMaterial.userData.homeosStoneSlab
            : "",
        });
      });
    });
    return slotEntries.sort((slotEntryA, slotEntryB) => {
      const slotIndexA = Number.isFinite(slotEntryA.slot) ? slotEntryA.slot : Number.MAX_SAFE_INTEGER,
        slotIndexB = Number.isFinite(slotEntryB.slot) ? slotEntryB.slot : Number.MAX_SAFE_INTEGER;
      return (
        slotIndexA - slotIndexB ||
        slotEntryA.name.localeCompare(slotEntryB.name, "en", { numeric: true })
      );
    });
  }
  return {
    addExternalItemModel: addExternalItemModel,
    loadExternalItemModel: loadExternalItemModel,
    preloadPersistentModels: preloadPersistentModels,
    modelTypeForItem: resolveModelTypeForItem,
    modelLoadState: collectLoadState,
    persistentCacheState: () => persistentCache.stats(),
    retryFailedModels: retryPendingModels,
    dispose: disposeModelManager,
    hasExternalModelForItem: hasExternalModelForItem,
    describeItemMaterials: describeItemMaterials,
    cacheRepresentation(itemTypeArray: any[]) {
      return [...new Set(itemTypeArray.map(resolveModelTypeForItem).filter(Boolean))]
        .sort()
        .map((typeName) => ({
          type: typeName,
          definition: ALL_ITEM_MODELS[typeName],
          loaded: preparedTemplatesByItemType.has(typeName),
          rendererRevision: new URL(import.meta.url).search,
        }));
    },
  };
}

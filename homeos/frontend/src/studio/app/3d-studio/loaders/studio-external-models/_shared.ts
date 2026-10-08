import { COURTYARD_MODELS } from "../../plan/courtyard-models";
import { DECOR_MODELS } from "../../studio/decor-models";
import {
  MODEL_SLOT_ROLES,
  resolveModelMaterialRole,
  stoneSlabFlavorForMaterial,
} from "../../materials/studio-model-material-roles";
import {
  materialStyleStoneSlabRoles,
} from "../../materials/studio-material-presets";

const homeLiteAssetVersion = "20260903-home-lite-v1",

  pillarAssetVersion = "20261002-pillar-shapes-v1",
  applianceLiteAssetVersion = "20260921-appliance-lite-clean-guides-v2",
  sofaFamilyItemTypes = new Set(["sofa", "sofa-single", "sofa-l", "sofa-l-left"]),
  preparedRestoreTimeoutMs = 160;
export {
  homeLiteAssetVersion,
  pillarAssetVersion,
  applianceLiteAssetVersion,
  sofaFamilyItemTypes,
  preparedRestoreTimeoutMs,
};
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
export function ensureStoneSlabPlanarUv(threeLib: any, slabGeometry: any) {
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
export function createHomeAssetDescriptor(homeAssetId: any, homeFallbackVersion: any, homeAssetOverrides: any) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + homeAssetId + "-lite.glb?v=" + homeLiteAssetVersion,
    fallbackUrl: "/static/3d-studio/models/" + homeAssetId + ".glb?v=" + homeFallbackVersion,
    ...homeAssetOverrides,
  });
}
export function createApplianceAssetDescriptor(applianceAssetId: any, applianceAssetOverrides: any) {
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
export function createFurnitureAssetDescriptor(furnitureAssetId: any, furnitureAssetScaleBasis: any) {


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
]);
export function createIndoorAssetDescriptor(indoorAssetId: any, indoorAssetScaleBasis: any) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + indoorAssetId + "-lite.glb?v=20260928-indoor-v1",
    fallbackUrl: "/static/3d-studio/models/" + indoorAssetId + ".glb?v=20260928-indoor-v1",
    scaleBasis: indoorAssetScaleBasis,
    preserveOrigin: true,
  });
}
export function createPillarAssetDescriptor(pillarAssetId: any) {
  return Object.freeze({
    url: "/static/3d-studio/models/" + pillarAssetId + "-lite.glb?v=" + pillarAssetVersion,
    fallbackUrl: "/static/3d-studio/models/" + pillarAssetId + ".glb?v=" + pillarAssetVersion,
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

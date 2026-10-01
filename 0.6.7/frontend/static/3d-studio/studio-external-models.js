import { COURTYARD_MODELS, courtyardPalette } from "./courtyard-models.js?v=20260927-garden-v5";
import {
  prepareVehicleChargeGeometry,
  applyVehicleFinish,
} from "./studio-vehicle-models.js?v=20260926-vehicles-v3";
import { decorateWarmFloor } from "./studio-scene-style.js?v=20260916-warm-v1";
import { enlargeWarmLeaves } from "./studio-warm-foliage.js";
import {
  applyCarFinish,
  smoothCarSurfaceNormals,
} from "./studio-car-finish.js?v=20260926-car-v1-20260917-pearl-white-v2-shadow-20260918-review-1234-v2";
import {
  repairGlassCabinetBack,
  repairWallCabinetSides,
  repairSideboardJoints,
} from "./studio-cabinet-back.js?v=20260925-sideboard-joints-v1";
import { finite } from "./studio-normalization.js?v=20260903-studio-normalization-v2-20260918-review-1234-v2";
import { createModelPersistentCache } from "./model-persistent-cache.js?v=20260923-prepared-v2";
import { modelTemplateKey } from "./model-template-codec.js?v=20260923-prepared-v2";
import { releaseModelAsset } from "./model-asset-loader.js?v=20260926-hard-timeout-v1";
import { DECOR_MODELS, DECOR_THEMES } from "./decor-models.js?v=20260926-decor-v1";
import {
  createFurnitureBatchCache,
  compactFurnitureIndices,
} from "./studio-furniture-batching.js?v=20260928-duvet-shadow-v2-20260928-drawer-chest-v1-20260928-scene-batch-v1-20260928-indoor-v1-20260927-all-model-cache-v1";
const homeLiteAssetVersion = "20260903-home-lite-v1",
  applianceLiteAssetVersion = "20260921-appliance-lite-clean-guides-v2",
  sofaFamilyItemTypes = new Set(["sofa", "sofa-single", "sofa-l", "sofa-l-left"]),
  preparedRestoreTimeoutMs = 160;
export function insetBedBaseGeometry(bedGeometry) {
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
function createHomeAssetDescriptor(homeAssetId, homeFallbackVersion, homeAssetOverrides) {
  return Object.freeze({
    url: "/bridge-static/3d-studio/models/" + homeAssetId + "-lite.glb?v=" + homeLiteAssetVersion,
    fallbackUrl: "/bridge-static/3d-studio/models/" + homeAssetId + ".glb?v=" + homeFallbackVersion,
    ...homeAssetOverrides,
  });
}
function createApplianceAssetDescriptor(applianceAssetId, applianceAssetOverrides) {
  return Object.freeze({
    url:
      "/bridge-static/3d-studio/models/" +
      applianceAssetId +
      "-lite.glb?v=" +
      applianceLiteAssetVersion,
    fallbackUrl:
      "/bridge-static/3d-studio/models/" +
      applianceAssetId +
      ".glb?v=20260901-all-appliance-models-v1",
    ...applianceAssetOverrides,
  });
}
function createFurnitureAssetDescriptor(furnitureAssetId, furnitureAssetScaleBasis) {
  return Object.freeze({
    url:
      "/bridge-static/3d-studio/models/" +
      furnitureAssetId +
      "-lite.glb?v=" +
      (furnitureAssetId === "vanity" ? "20260925-furniture-v1" : "20260926-furniture-draco-v1"),
    fallbackUrl:
      "/bridge-static/3d-studio/models/" + furnitureAssetId + ".glb?v=20260925-furniture-v1",
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
]);
function createIndoorAssetDescriptor(indoorAssetId, indoorAssetScaleBasis) {
  return Object.freeze({
    url: "/bridge-static/3d-studio/models/" + indoorAssetId + "-lite.glb?v=20260928-indoor-v1",
    fallbackUrl: "/bridge-static/3d-studio/models/" + indoorAssetId + ".glb?v=20260928-indoor-v1",
    scaleBasis: indoorAssetScaleBasis,
    preserveOrigin: true,
  });
}
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
      url: "/bridge-static/3d-studio/models/tea-table-set-lite.glb?v=20260927-tea-table-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/tea-table-set.glb?v=20260927-tea-table-v1",
      scaleBasis: [1.61, 0.94, 1.4],
      preserveOrigin: true,
    }),
    ...Object.fromEntries(
      Object.entries(COURTYARD_MODELS).map(([courtyardModelId, courtyardModelDefinition]) => [
        courtyardModelId,
        Object.freeze({
          url:
            "/bridge-static/3d-studio/models/" +
            courtyardModelId +
            "-lite.glb?v=20260927-garden-v5",
          fallbackUrl:
            "/bridge-static/3d-studio/models/" + courtyardModelId + ".glb?v=20260927-garden-v5",
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
            "/bridge-static/3d-studio/models/" +
            sofaVariantModelId +
            "-lite.glb?v=20260926-sofa-variants-v1",
          fallbackUrl:
            "/bridge-static/3d-studio/models/" +
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
          url: "/bridge-static/3d-studio/models/" + decorModelId + "-lite.glb?v=20260926-decor-v1",
          fallbackUrl:
            "/bridge-static/3d-studio/models/" + decorModelId + ".glb?v=20260926-decor-v1",
          scaleBasis: decorModelDefinition.size,
          preserveOrigin: true,
        }),
      ]),
    ),
    sofa: createFurnitureAssetDescriptor("sofa", [2.2, 0.82, 0.9]),
    coffeetable: createFurnitureAssetDescriptor("coffeetable", [1.7, 0.5, 1.25]),
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
      url: "/bridge-static/3d-studio/models/suv-lite.glb?v=20260926-vehicles-v3",
    },
    scooter: {
      url: "/bridge-static/3d-studio/models/scooter-lite.glb?v=20260926-vehicles-v3",
    },
    smallcar: {
      url: "/bridge-static/3d-studio/models/car-lite.glb?v=20260912-car-surface-v5",
      fallbackUrl: "/bridge-static/3d-studio/models/car.glb?v=20260912-car-surface-v5",
    },
    airoutlet: {
      url: "/bridge-static/3d-studio/models/air-outlet-lite.glb?v=20260902-air-outlet-lite-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/air-outlet.glb?v=20260812-air-outlet1",
    },
    pipelinewaterpurifier: {
      url: "/bridge-static/3d-studio/models/pipeline-water-purifier-lite.glb?v=20260928-detail-target-v1",
      fallbackUrl:
        "/bridge-static/3d-studio/models/pipeline-water-purifier.glb?v=20260928-detail-target-v1",
    },
    tea_bar_machine: {
      url: "/bridge-static/3d-studio/models/tea-bar-machine-lite.glb?v=20260902-tea-bar-machine-lite-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/tea-bar-machine.glb?v=20260821-glb-material-v1",
    },
    elevator: {
      url: "/bridge-static/3d-studio/models/elevator-lite.glb?v=20260902-elevator-lite-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/elevator.glb?v=20260825-elevator-material-v1",
    },
    steelstairs: {
      url: "/bridge-static/3d-studio/models/steel-stairs-lite.glb?v=20260928-detail-target-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/steel-stairs.glb?v=20260928-detail-target-v1",
    },
    glassstairs: {
      url: "/bridge-static/3d-studio/models/glass-stairs-lite.glb?v=20260902-glass-stairs-lite-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/glass-stairs.glb?v=20260821-stairs-v1",
    },
    floatingstairs: {
      url: "/bridge-static/3d-studio/models/floating-stairs.glb?v=20260924-glass-ten-steps-v5",
      scaleBasis: [0.97254264, 2.59010673, 2.2483418],
      preserveOrigin: true,
    },
    piano: {
      url: "/bridge-static/3d-studio/models/piano-lite.glb?v=20260902-piano-lite-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/piano.glb?v=20260824-piano-v3",
      materialRevision: "20260914-piano-surface-shadow-v1",
      preserveAspect: true,
    },
  }),
  ALL_ITEM_MODELS = Object.freeze({
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
      url: "/bridge-static/3d-studio/models/bookcase-lite.glb?v=20260912-cabinet-back-v4",
      scaleBasis: [1.2, 1.9, 0.32],
      preserveOrigin: true,
    }),
    aquarium: createHomeAssetDescriptor("aquarium", "20260928-aquarium-v2", {
      url: "/bridge-static/3d-studio/models/aquarium-lite.glb?v=20260928-aquarium-v2",
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
      url: "/bridge-static/3d-studio/models/glasscabinet-lite.glb?v=20260912-cabinet-back-v2",
      scaleBasis: [1.2, 1.9, 0.4],
      preserveOrigin: true,
    }),
    shelf: createHomeAssetDescriptor("shelf", "20260901-all-home-furniture-v1", {
      scaleBasis: [1.2, 1.8, 0.45],
      preserveOrigin: true,
    }),
    wallcabinet: createHomeAssetDescriptor("wallcabinet", "20260912-cabinet-sides-v1", {
      url: "/bridge-static/3d-studio/models/wallcabinet-lite.glb?v=20260912-cabinet-sides-v1",
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
    pillar: createHomeAssetDescriptor("pillar", "20260901-all-home-furniture-v1", {
      scaleBasis: [0.45, 2.8, 0.45],
      preserveOrigin: true,
    }),
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
      url: "/bridge-static/3d-studio/models/floorac-lite.glb?v=20260925-detail-v3-surfaces",
      fallbackUrl: "/bridge-static/3d-studio/models/floorac.glb?v=20260925-detail-v3-surfaces",
      scaleBasis: [0.42, 1.75, 0.42],
      preserveOrigin: true,
    }),
    airpurifier: createApplianceAssetDescriptor("airpurifier", {
      url: "/bridge-static/3d-studio/models/airpurifier-lite.glb?v=20260925-detail-v3-surfaces",
      fallbackUrl: "/bridge-static/3d-studio/models/airpurifier.glb?v=20260925-detail-v3-surfaces",
      scaleBasis: [0.34, 0.7, 0.34],
      preserveOrigin: true,
    }),
    robotvacuum: createApplianceAssetDescriptor("robotvacuum", {
      url: "/bridge-static/3d-studio/models/robotvacuum-lite.glb?v=20260925-vacuum-detail-v3",
      fallbackUrl: "/bridge-static/3d-studio/models/robotvacuum.glb?v=20260925-vacuum-detail-v3",
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
      url: "/bridge-static/3d-studio/models/storagewaterheater-lite.glb?v=20260925-water-heater-v2",
      fallbackUrl:
        "/bridge-static/3d-studio/models/storagewaterheater.glb?v=20260925-water-heater-v2",
      scaleBasis: [0.86, 0.48, 0.46],
      preserveOrigin: true,
    }),
    gaswaterheater: createApplianceAssetDescriptor("gaswaterheater", {
      url: "/bridge-static/3d-studio/models/gaswaterheater-lite.glb?v=20260925-water-heater-v2",
      fallbackUrl: "/bridge-static/3d-studio/models/gaswaterheater.glb?v=20260925-water-heater-v2",
      scaleBasis: [0.42, 0.72, 0.22],
      preserveOrigin: true,
    }),
    desktop: createApplianceAssetDescriptor("desktop", {
      url: "/bridge-static/3d-studio/models/desktop-lite.glb?v=20260925-detail-v3-surfaces",
      fallbackUrl: "/bridge-static/3d-studio/models/desktop.glb?v=20260925-detail-v3-surfaces",
      scaleBasis: [0.72, 0.5, 0.32],
      preserveOrigin: true,
    }),
    laptop: createApplianceAssetDescriptor("laptop", {
      url: "/bridge-static/3d-studio/models/laptop-lite.glb?v=20260925-detail-v3-surfaces",
      fallbackUrl: "/bridge-static/3d-studio/models/laptop.glb?v=20260925-detail-v3-surfaces",
      scaleBasis: [0.36, 0.22, 0.28],
      preserveOrigin: true,
    }),
    printer: createApplianceAssetDescriptor("printer", {
      url: "/bridge-static/3d-studio/models/printer-lite.glb?v=20260926-printer-v1",
      fallbackUrl: "/bridge-static/3d-studio/models/printer.glb?v=20260926-printer-v1",
      scaleBasis: [0.44, 0.3, 0.36],
      preserveOrigin: true,
    }),
    nas: createApplianceAssetDescriptor("nas", {
      url: "/bridge-static/3d-studio/models/nas-lite.glb?v=20260925-four-bay-v2",
      fallbackUrl: "/bridge-static/3d-studio/models/nas.glb?v=20260925-four-bay-v2",
      scaleBasis: [0.28, 0.205, 0.24],
      preserveOrigin: true,
    }),
  });
const warmWoodFurnitureItemTypes = new Set([
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
    "nas",
    "printer",
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
export function createExternalModelManager({
  THREE: threeNamespace,
  loader: assetLoader,
  stairItemTypes: stairItemTypes,
  isModelInUse: isModelInUse,
  requestRender: requestRender,
  onLoadStateChange = () => {},
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
    pendingCancelResolvers = new Set(),
    activeTimeoutHandles = new Set();
  let isDisposed = false;
  const materialCacheBySignature = new Map(),
    materialVariantsBySource = new WeakMap(),
    geometryVariantsBySource = new WeakMap(),
    furnitureBatchCache = createFurnitureBatchCache(threeNamespace),
    effectiveConcurrentLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2))),
    effectiveLoadTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  let activeLoadCount = 0,
    materialReuseCount = 0;
  function collectLoadState() {
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
      globalThis.window?.HABridgeLog?.error(
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
  function resolveModelTypeForItem(item) {
    return item.type === "sofa-l"
      ? item.sofaChaiseSide === "left"
        ? "sofa-l-left"
        : "sofa-l"
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
    if (
      (compactFurnitureIndices(threeNamespace, templateScene, loadedItemType),
      (loadedItemType === "glasscabinet" || loadedItemType === "bookcase") &&
        repairGlassCabinetBack(threeNamespace, templateScene, loadedItemType),
      loadedItemType === "wallcabinet" && repairWallCabinetSides(threeNamespace, templateScene),
      loadedItemType === "sideboard" && repairSideboardJoints(threeNamespace, templateScene),
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
      !window.__haBridgeReleasingDeferredModels
    )
      return (window.__haBridgeDeferExternalModel?.(modelItemType), Promise.resolve(null));
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
        (originalMaterial.name || "external-model") + " · HA Bridge palette"),
      defaultPaletteMaterial
    );
  }
  function createPaletteMaterial(templateMaterial, materialColor, materialOptions = {}) {
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
        (templateMaterial.name || "external-model") + " · HA Bridge furniture material"),
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
      if (furnitureItemType === "coffeetable" || furnitureItemType === "squarecoffeetable")
        resolvedMaterialColor = materialName.endsWith("-dark")
          ? warmPalette.furnitureDark
          : materialName.endsWith("-light") || materialName.endsWith("-soft")
            ? warmPalette.furnitureSoft
            : warmPalette.furniture;
      else {
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
        (stairGlassMaterial.name = (stairMaterial.name || "stair-glass") + " · HA Bridge glass"),
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
      (stairFrameMaterial.name = (stairMaterial.name || "stair-frame") + " · HA Bridge palette"),
      stairFrameMaterial
    );
  }
  function applyItemDetailMaterial(detailMaterial, itemPalette, detailItemType) {
    if (typeof threeNamespace.MeshStandardMaterial != "function")
      return detailMaterial.clone?.() || detailMaterial;
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
          (detailMaterial?.name || "piano") + " · HA Bridge furniture palette"),
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
      paletteOverrideItemTypes.has(itemType) ||
      (itemType === "aquarium" && sourceMaterial.name?.startsWith("aquarium-aquatic-")) ||
      COURTYARD_MODELS[itemType] ||
      DECOR_MODELS[itemType] ||
      sourceMaterial.name?.includes("-furniture-") ||
      gardenItemTypes.has(itemType) ||
      applianceItemTypes.has(itemType) ||
      (palette.warmWood && warmWoodFurnitureItemTypes.has(itemType))
        ? applyItemDetailMaterial(sourceMaterial, palette, itemType)
        : sourceMaterial.clone?.() || sourceMaterial;
    if (
      (palette.warmWood &&
        !DECOR_MODELS[itemType] &&
        resolvedMaterial.color &&
        !resolvedMaterial.transparent &&
        !(itemType === "nas" && /^nas-material-4(?:$|\s)/.test(sourceMaterial.name || "")) &&
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
    }[itemType];
    if (
      palette.warmWood &&
      cabinetDoorMaterialIndex !== undefined &&
      (sourceMaterial.name || "").endsWith("material-" + cabinetDoorMaterialIndex)
    ) {
      const doorEdgeColor = ["sideboard", "shoecabinet", "wallcabinet"].includes(itemType)
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
    addOptions = {},
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
          (modelType === "airpurifier" || modelType === "floorac") &&
            meshMaterials.every(
              (guideMaterial) =>
                guideMaterial?.name ===
                modelType + "-material-" + (modelType === "airpurifier" ? 3 : 2),
            ))
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
              ["sideboard", "shoecabinet", "wallcabinet", "suv", "scooter"].includes(modelType) &&
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
  return {
    addExternalItemModel: addExternalItemModel,
    loadExternalItemModel: loadExternalItemModel,
    preloadPersistentModels: preloadPersistentModels,
    modelTypeForItem: resolveModelTypeForItem,
    modelLoadState: collectLoadState,
    persistentCacheState: () => persistentCache.stats(),
    retryFailedModels: retryPendingModels,
    dispose: disposeModelManager,
    cacheRepresentation(itemTypeArray) {
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

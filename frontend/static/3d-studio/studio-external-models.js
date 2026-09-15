import {
  applyCarFinish,
  smoothCarSurfaceNormals
} from "./studio-car-finish.js?v=20260915211726";
import {
  repairGlassCabinetBack,
  repairWallCabinetSides
} from "./studio-cabinet-back.js?v=20260915211726";
import { finite } from "./studio-normalization.js?v=20260915211726";
const HOME_LITE_MODEL_VERSION = "20260915211726";
const APPLIANCE_LITE_MODEL_VERSION = "20260915211726";
/**
 * Pillar shapes that ship their own GLB asset. "square" keeps the original baked box, so it stays on
 * the plain "pillar" model and the item is otherwise unchanged.
 */
const PILLAR_ASSET_SHAPES = new Set(["round", "semicircle", "quarter", "quarterinner"]);
export function insetBedBaseGeometry(bedBaseGeometry) {
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
  const centerX = (boundingBoxMin.x + boundingBoxMax.x) / 2;
  const centerZ = (boundingBoxMin.z + boundingBoxMax.z) / 2;
  insetGeometry
    .translate(-centerX, 0, -centerZ)
    .scale(0.996, 1, 0.996)
    .translate(centerX, 0, centerZ);
  insetGeometry.computeBoundingBox();
  insetGeometry.computeBoundingSphere();
  return insetGeometry;
}
function defineHomeItemModel(homeModelKey, homeFallbackVersion, homeModelOverrides) {
  return Object.freeze({
    url:
      "/static/3d-studio/models/" + homeModelKey + "-lite.glb?v=" + HOME_LITE_MODEL_VERSION,
    fallbackUrl:
      "/static/3d-studio/models/" + homeModelKey + ".glb?v=" + homeFallbackVersion,
    ...homeModelOverrides
  });
}
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
      ".glb?v=20260915211726",
    ...applianceModelOverrides
  });
}
export const EXTERNAL_ITEM_MODELS = Object.freeze({
  sofa: {
    url: "/static/3d-studio/models/sofa-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/sofa.glb?v=20260915211726",
    scaleBasis: [2.2, 0.82, 0.9],
    preserveOrigin: true,
    groundAlign: true,
    groundOffset: -0.008
  },
  coffeetable: defineHomeItemModel("coffeetable", "20260915211726", {
    scaleBasis: [1.7, 0.5, 1.25],
    preserveOrigin: true
  }),
  squarecoffeetable: defineHomeItemModel("squarecoffeetable", "20260915211726", {
    url: "/static/3d-studio/models/squarecoffeetable-lite.glb?v=20260915211726",
    fallbackUrl:
      "/static/3d-studio/models/squarecoffeetable.glb?v=20260915211726",
    scaleBasis: [1.4, 0.46, 0.7],
    preserveOrigin: true
  }),
  tvstand: defineHomeItemModel("tvstand", "20260915211726", {
    url: "/static/3d-studio/models/tvstand-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/tvstand.glb?v=20260915211726",
    scaleBasis: [1.8, 0.48, 0.42],
    preserveOrigin: true
  }),
  rug: defineHomeItemModel("rug", "20260915211726", {
    scaleBasis: [2, 0.012, 1.4],
    preserveOrigin: true
  }),
  plant: defineHomeItemModel("plant", "20260915211726", {
    scaleBasis: [0.75, 1.6, 0.75],
    preserveOrigin: true
  }),
  bed: defineHomeItemModel("bed", "20260915211726", {
    scaleBasis: [1.8, 0.62, 2],
    preserveOrigin: true,
    geometryRevision: "20260908-base-inset-v1"
  }),
  nightstand: defineHomeItemModel("nightstand", "20260915211726", {
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("vanity", "20260915211726", {
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("desk", "20260915211726", {
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("bookcase", "20260915211726", {
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  smallcar: {
    url: "/static/3d-studio/models/car-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/car.glb?v=20260915211726"
  },
  airoutlet: {
    url: "/static/3d-studio/models/air-outlet-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/air-outlet.glb?v=20260915211726"
  },
  pipelinewaterpurifier: {
    url: "/static/3d-studio/models/pipeline-water-purifier-lite.glb?v=20260915211726",
    fallbackUrl:
      "/static/3d-studio/models/pipeline-water-purifier.glb?v=20260915211726"
  },
  tea_bar_machine: {
    url: "/static/3d-studio/models/tea-bar-machine-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/tea-bar-machine.glb?v=20260915211726"
  },
  elevator: {
    url: "/static/3d-studio/models/elevator-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/elevator.glb?v=20260915211726"
  },
  steelstairs: {
    url: "/static/3d-studio/models/steel-stairs-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/steel-stairs.glb?v=20260915211726"
  },
  glassstairs: {
    url: "/static/3d-studio/models/glass-stairs-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/glass-stairs.glb?v=20260915211726"
  },
  piano: {
    url: "/static/3d-studio/models/piano-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/piano.glb?v=20260915211726",
    materialRevision: "20260914-piano-surface-shadow-v1",
    preserveAspect: true
  }
});
export const ALL_ITEM_MODELS = Object.freeze({
  ...EXTERNAL_ITEM_MODELS,
  bed: defineHomeItemModel("bed", "20260915211726", {
    scaleBasis: [1.8, 0.62, 2],
    preserveOrigin: true,
    geometryRevision: "20260908-base-inset-v1"
  }),
  nightstand: defineHomeItemModel("nightstand", "20260915211726", {
    scaleBasis: [0.5, 0.55, 0.42],
    preserveOrigin: true
  }),
  vanity: defineHomeItemModel("vanity", "20260915211726", {
    scaleBasis: [1.2, 1.55, 0.5],
    preserveOrigin: true
  }),
  desk: defineHomeItemModel("desk", "20260915211726", {
    scaleBasis: [1.4, 0.76, 0.65],
    preserveOrigin: true
  }),
  bookcase: defineHomeItemModel("bookcase", "20260915211726", {
    url: "/static/3d-studio/models/bookcase-lite.glb?v=20260915211726",
    scaleBasis: [1.2, 1.9, 0.32],
    preserveOrigin: true
  }),
  aquarium: defineHomeItemModel("aquarium", "20260915211726", {
    scaleBasis: [1.5, 1.4, 0.55],
    preserveOrigin: true
  }),
  table: defineHomeItemModel("table", "20260915211726", {
    scaleBasis: [2.4, 0.82, 1.8],
    preserveOrigin: true
  }),
  rounddiningtable: defineHomeItemModel("rounddiningtable", "20260915211726", {
    scaleBasis: [2.2, 0.78, 2.2],
    preserveOrigin: true
  }),
  chair: defineHomeItemModel("chair", "20260915211726", {
    scaleBasis: [0.5, 0.86, 0.5],
    preserveOrigin: true
  }),
  bar: defineHomeItemModel("bar", "20260915211726", {
    scaleBasis: [2.2, 1.05, 0.65],
    preserveOrigin: true
  }),
  sideboard: defineHomeItemModel("sideboard", "20260915211726", {
    scaleBasis: [1.6, 2.2, 0.45],
    preserveOrigin: true
  }),
  shoecabinet: defineHomeItemModel("shoecabinet", "20260915211726", {
    scaleBasis: [1.8, 2.25, 0.42],
    preserveOrigin: true
  }),
  cabinet: defineHomeItemModel("cabinet", "20260915211726", {
    scaleBasis: [1.6, 1.9, 0.45],
    preserveOrigin: true
  }),
  glasscabinet: defineHomeItemModel("glasscabinet", "20260915211726", {
    url: "/static/3d-studio/models/glasscabinet-lite.glb?v=20260915211726",
    scaleBasis: [1.2, 1.9, 0.4],
    preserveOrigin: true
  }),
  shelf: defineHomeItemModel("shelf", "20260915211726", {
    scaleBasis: [1.2, 1.8, 0.45],
    preserveOrigin: true
  }),
  wallcabinet: defineHomeItemModel("wallcabinet", "20260915211726", {
    url: "/static/3d-studio/models/wallcabinet-lite.glb?v=20260915211726",
    scaleBasis: [1.5, 0.82, 0.35],
    preserveOrigin: true
  }),
  kitchenbase: defineHomeItemModel("kitchenbase", "20260915211726", {
    scaleBasis: [2.4, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchensink: defineHomeItemModel("kitchensink", "20260915211726", {
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  kitchencooktop: defineHomeItemModel("kitchencooktop", "20260915211726", {
    scaleBasis: [1.2, 0.85, 0.6],
    preserveOrigin: true
  }),
  basin: defineHomeItemModel("basin", "20260915211726", {
    scaleBasis: [0.9, 0.88, 0.5],
    preserveOrigin: true
  }),
  toilet: defineHomeItemModel("toilet", "20260915211726", {
    scaleBasis: [0.42, 0.52, 0.7],
    preserveOrigin: true
  }),
  squattoilet: defineHomeItemModel("squattoilet", "20260915211726", {
    scaleBasis: [0.45, 0.18, 0.65],
    preserveOrigin: true
  }),
  urinal: defineHomeItemModel("urinal", "20260915211726", {
    scaleBasis: [0.38, 0.72, 0.34],
    preserveOrigin: true
  }),
  shower: defineHomeItemModel("shower", "20260915211726", {
    scaleBasis: [0.9, 2.1, 0.9],
    preserveOrigin: true
  }),
  bathtub: defineHomeItemModel("bathtub", "20260915211726", {
    scaleBasis: [1.7, 0.58, 0.78],
    preserveOrigin: true
  }),
  glasspartition: defineHomeItemModel("glasspartition", "20260915211726", {
    scaleBasis: [1.2, 2, 0.08],
    preserveOrigin: true
  }),
  stairs: defineHomeItemModel("stairs", "20260915211726", {
    scaleBasis: [1, 1.65, 2.8],
    preserveOrigin: true
  }),
  pillar: defineHomeItemModel("pillar", "20260915211726", {
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  }),
  // Shaped pillars need real assets: the external-model swap replaces the procedural solid with the
  // loaded GLB, so a baked box would silently override every non-square shape. These meshes are
  // exported from the same geometry studio-app.js builds (see gen-pillars.mjs) and share the pillar's
  // scaleBasis, so the item keeps its 0.45 x 2.8 x 0.45 footprint and base-at-origin placement.
  pillar_round: {
    url: "/static/3d-studio/models/pillar-round-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/pillar-round.glb?v=20260915211726",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_semicircle: {
    url: "/static/3d-studio/models/pillar-semicircle-lite.glb?v=20260915211726",
    fallbackUrl:
      "/static/3d-studio/models/pillar-semicircle.glb?v=20260915211726",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_quarter: {
    url: "/static/3d-studio/models/pillar-quarter-lite.glb?v=20260915211726",
    fallbackUrl: "/static/3d-studio/models/pillar-quarter.glb?v=20260915211726",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  pillar_quarterinner: {
    url: "/static/3d-studio/models/pillar-quarterinner-lite.glb?v=20260915211726",
    fallbackUrl:
      "/static/3d-studio/models/pillar-quarterinner.glb?v=20260915211726",
    scaleBasis: [0.45, 2.8, 0.45],
    preserveOrigin: true
  },
  curtain_left: defineHomeItemModel("curtain_left", "20260915211726", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_right: defineHomeItemModel("curtain_right", "20260915211726", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  curtain_split: defineHomeItemModel("curtain_split", "20260915211726", {
    scaleBasis: [1.8, 2.4, 0.18],
    preserveOrigin: true
  }),
  rounddiningtable_turntable: defineHomeItemModel(
    "rounddiningtable_turntable",
    "20260915211726",
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
export function createExternalModelManager({
  THREE: THREE,
  loader: loader,
  stairItemTypes: stairItemTypes,
  isModelInUse: isModelInUse,
  requestRender: requestRender,
  onLoadStateChange: onLoadStateChange = () => {},
  maxConcurrentLoads: maxConcurrentLoads = 2,
  loadTimeoutMs: loadTimeoutMs = 12000
}) {
  const loadedModelByType = new Map();
  const pendingLoadByType = new Map();
  const loadQueue = [];
  const materialCacheByKey = new Map();
  const concurrencyLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2)));
  const effectiveTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  let activeLoadCount = 0;
  let materialReuseCount = 0;
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
  function emitLoadStateChange() {
    onLoadStateChange(getModelLoadState());
  }
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
  function loadModelWithFallback(modelDefinition, modelTypeLabel) {
    let timeoutId = null;
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
  function loadExternalModel(modelType) {
    if (
      typeof window !== "undefined" &&
      window.externalModelLoadsDeferred &&
      !window.__haBridgeReleasingDeferredModels
    ) {
      window.__haBridgeDeferExternalModel?.(modelType);
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
        if (isModelInUse(modelType)) {
          requestRender({
            force: true
          });
        }
        return modelCacheEntry;
      })
      .catch(loadFailure => {
        globalThis.window?.HABridgeLog?.error(
          loadFailure,
          {
            phase: "studio-model-load"
          },
          "无法载入外部模型 " + modelType + "：" + (loadFailure?.message || loadFailure)
        );
        if (String(loadFailure?.message || loadFailure).includes("加载超时")) {
          console.debug("外部模型 " + modelType + " 加载超时，继续使用原模型");
        } else {
          console.error("无法载入外部模型 " + modelType, loadFailure);
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
  function applyFurniturePalette(meshMaterial, paletteColors, furnitureItemType) {
    const materialName = (meshMaterial?.name || "").toLowerCase();
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
    const isSoftRug = furnitureItemType === "rug" && materialName.endsWith("-soft");
    const isTransparentMaterial =
      materialName.endsWith("-glass") ||
      meshMaterial?.transparent === true ||
      (meshMaterial?.opacity ?? 1) < 1;
    return createFurnitureMaterial(meshMaterial, chosenColor, {
      roughness: materialName.includes("foliage") || furnitureItemType === "rug" ? 0.9 : 0.72,
      metalness: materialName.includes("foliage") || furnitureItemType === "rug" ? 0 : 0.02,
      polygonOffset: isSoftRug,
      polygonOffsetFactor: isSoftRug ? -2 : 0,
      polygonOffsetUnits: isSoftRug ? -4 : 0,
      transparent: isTransparentMaterial,
      opacity: isTransparentMaterial ? 0.42 : 1,
      depthWrite: !isTransparentMaterial
    });
  }
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
        color: stairPalette.furnitureSoft,
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
  function applyAppliancePalette(baseMaterial, appliancePalette, applianceItemType) {
    if (typeof THREE.MeshStandardMaterial != "function") {
      return baseMaterial.clone?.() || baseMaterial;
    }
    if (APPLIANCE_PALETTE_ITEM_TYPES.has(applianceItemType)) {
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
            ? applianceColor
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
  function resolveSharedMaterial(inputMaterial, materialPalette, modelTypeName) {
    if (!inputMaterial) {
      return inputMaterial;
    }
    const preparedMaterial =
      CUSTOM_MATERIAL_ITEM_TYPES.has(modelTypeName) ||
      APPLIANCE_PALETTE_ITEM_TYPES.has(modelTypeName)
        ? applyAppliancePalette(inputMaterial, materialPalette, modelTypeName)
        : inputMaterial.clone?.() || inputMaterial;
    if (modelTypeName === "smallcar") {
      applyCarFinish(preparedMaterial);
    }
    if (
      (modelTypeName === "glasscabinet" &&
        /^glasscabinet-material-(0|10)$/.test(inputMaterial.name)) ||
      (modelTypeName === "bookcase" && /^bookcase-material-(0|7)$/.test(inputMaterial.name))
    ) {
      preparedMaterial.color?.set?.(materialPalette.furniture);
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
        mesh.renderOrder = Math.max(mesh.renderOrder, 6);
      }
      mesh.castShadow = resolvedModelType !== "rug";
      mesh.receiveShadow =
        resolvedModelType !== "glassstairs" || mesh.material?.transparent !== true;
      if (resolvedModelType === "rug") {
        const rugMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.renderOrder = rugMaterials.some(rugMaterial => rugMaterial?.polygonOffset) ? 1 : 0;
      }
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

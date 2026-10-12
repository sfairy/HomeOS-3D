import { APPROVED_ITEM_MODELS } from "./approved-item-models";
import {
  EXTERNAL_ITEM_MODELS,
  createIndoorAssetDescriptor,
  createHomeAssetDescriptor,
  createFurnitureAssetDescriptor,
  createApplianceAssetDescriptor,
  createPillarAssetDescriptor,
} from "./_shared";

export const ALL_ITEM_MODELS = Object.freeze({
    ...EXTERNAL_ITEM_MODELS,
    ...APPROVED_ITEM_MODELS,
    bed: createIndoorAssetDescriptor("bed", [1.92, 1.02, 2.18]),
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
      url: "/static/3d-studio/models/bookcase-lite.glb",
      scaleBasis: [1.2, 1.9, 0.32],
      preserveOrigin: true,
    }),
    aquarium: createHomeAssetDescriptor("aquarium", {
      url: "/static/3d-studio/models/aquarium-lite.glb",
      scaleBasis: [1.5, 1.4, 0.55],
      preserveOrigin: true,
    }),
    table: createFurnitureAssetDescriptor("table", [2.4, 0.82, 1.8]),
    rounddiningtable: createFurnitureAssetDescriptor("rounddiningtable", [2.2, 0.78, 2.2]),
    chair: createFurnitureAssetDescriptor("chair", [0.5, 0.86, 0.5]),
    bar: createHomeAssetDescriptor("bar", {
      scaleBasis: [2.2, 1.05, 0.65],
      preserveOrigin: true,
    }),
    sideboard: createHomeAssetDescriptor("sideboard", {
      scaleBasis: [1.6, 2.2, 0.45],
      preserveOrigin: true,
      geometryRevision: "20260925-sideboard-joints-v1",
    }),
    shoecabinet: createHomeAssetDescriptor("shoecabinet", {
      scaleBasis: [1.8, 2.25, 0.42],
      preserveOrigin: true,
    }),
    cabinet: createHomeAssetDescriptor("cabinet", {
      scaleBasis: [1.6, 1.9, 0.45],
      preserveOrigin: true,
    }),
    glasscabinet: createHomeAssetDescriptor("glasscabinet", {
      url: "/static/3d-studio/models/glasscabinet-lite.glb",
      scaleBasis: [1.2, 1.9, 0.4],
      preserveOrigin: true,
    }),
    shelf: createHomeAssetDescriptor("shelf", {
      scaleBasis: [1.2, 1.8, 0.45],
      preserveOrigin: true,
    }),
    wallcabinet: createHomeAssetDescriptor("wallcabinet", {
      url: "/static/3d-studio/models/wallcabinet-lite.glb",
      scaleBasis: [1.5, 0.82, 0.35],
      preserveOrigin: true,
    }),
    kitchenbase: createHomeAssetDescriptor("kitchenbase", {
      scaleBasis: [2.4, 0.85, 0.6],
      preserveOrigin: true,
    }),
    kitchensink: createHomeAssetDescriptor("kitchensink", {
      scaleBasis: [1.2, 0.85, 0.6],
      preserveOrigin: true,
    }),
    kitchencooktop: createHomeAssetDescriptor("kitchencooktop", {
      scaleBasis: [1.2, 0.85, 0.6],
      preserveOrigin: true,
    }),
    basin: createHomeAssetDescriptor("basin", {
      scaleBasis: [0.9, 0.88, 0.5],
      preserveOrigin: true,
    }),
    toilet: createHomeAssetDescriptor("toilet", {
      scaleBasis: [0.42, 0.52, 0.7],
      preserveOrigin: true,
    }),
    squattoilet: createHomeAssetDescriptor("squattoilet", {
      scaleBasis: [0.45, 0.18, 0.65],
      preserveOrigin: true,
    }),
    urinal: createHomeAssetDescriptor("urinal", {
      scaleBasis: [0.38, 0.72, 0.34],
      preserveOrigin: true,
    }),
    shower: createHomeAssetDescriptor("shower", {
      scaleBasis: [0.9, 2.1, 0.9],
      preserveOrigin: true,
    }),
    bathtub: createHomeAssetDescriptor("bathtub", {
      scaleBasis: [1.7, 0.58, 0.78],
      preserveOrigin: true,
    }),
    glasspartition: createHomeAssetDescriptor("glasspartition", {
      scaleBasis: [1.2, 2, 0.08],
      preserveOrigin: true,
    }),
    stairs: createHomeAssetDescriptor("stairs", {
      scaleBasis: [1, 1.65, 2.8],
      preserveOrigin: true,
    }),
    pillar: createPillarAssetDescriptor("pillar"),
    pillar_round: createPillarAssetDescriptor("pillar-round"),
    pillar_semicircle: createPillarAssetDescriptor("pillar-semicircle"),
    pillar_quarter: createPillarAssetDescriptor("pillar-quarter"),
    pillar_quarterinner: createPillarAssetDescriptor("pillar-quarterinner"),
    curtain_left: createHomeAssetDescriptor("curtain_left", {
      scaleBasis: [1.8, 2.4, 0.18],
      preserveOrigin: true,
    }),
    curtain_right: createHomeAssetDescriptor("curtain_right", {
      scaleBasis: [1.8, 2.4, 0.18],
      preserveOrigin: true,
    }),
    curtain_split: createHomeAssetDescriptor("curtain_split", {
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

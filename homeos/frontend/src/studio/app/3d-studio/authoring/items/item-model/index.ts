import type { ItemModelFamily } from "./types";
import { buildMisc } from "./misc";
import { buildLiving } from "./living";
import { buildStorageLower } from "./storage-lower";
import { buildStorageUpper } from "./storage-upper";
import { buildKitchen } from "./kitchen";
import { buildWaterTea } from "./water-tea";
import { buildLaundry } from "./laundry";
import { buildClimateSecurity } from "./climate-security";
import { buildMediaBath } from "./media-bath";
import { buildWorkspace } from "./workspace";
import { buildBath } from "./bath";
import { buildLightingGlass } from "./lighting-glass";
import { buildShowerBasin } from "./shower-basin";
import { buildDecor } from "./decor";

export const ITEM_MODEL_FAMILIES: ReadonlyArray<ItemModelFamily> = [
  buildMisc,
  buildLiving,
  buildStorageLower,
  buildStorageUpper,
  buildKitchen,
  buildWaterTea,
  buildLaundry,
  buildClimateSecurity,
  buildMediaBath,
  buildWorkspace,
  buildBath,
  buildLightingGlass,
  buildShowerBasin,
  buildDecor,
];

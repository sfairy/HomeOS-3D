/**
 * 「这个材质最终会不会被运行时**重建**」的唯一判定。
 *
 * 为什么单独成模块：`ops/checks/studio/{audit,repair}_glb_materials.mjs` 需要知道某个槽位
 * 的 `metallicFactor` / `roughnessFactor` 到底会不会被读取 —— 会重建的槽位，GLB 里写什么
 * 都不生效；不会重建的槽位（走 `sourceMaterial.clone()`）才需要与配方对齐。
 *
 * 此前这个判定只以闭包形式存在于 `studio-external-models.ts` 的 `usesDetailMaterialPipeline`
 * 里，脚本侧只能靠「名字里有没有 `-furniture-`」去猜，于是把 `coffeetable` 这类
 * 手工调过分件粗糙度、但运行时根本不读的槽位也回填了配方值（既产生无意义二进制变更，
 * 又抹掉作者意图）。现在脚本与运行时共用这一份，判定不再漂移。
 */

import { DECOR_MODELS } from "../authoring/items/decor-models";
import { COURTYARD_MODELS } from "../plan/courtyard-models";
import { COLLECTION_MODELS } from "../loaders/external-models/collection-models";
import { hasSemanticSlotRoles } from "./model-slot-roles";
import { isStructuralModelFamily, resolveModelFamily } from "./studio-model-material-roles";
import {
  applianceItemTypes,
  gardenItemTypes,
  paletteOverrideItemTypes,
  roleTableItemTypes,
  warmWoodFurnitureItemTypes,
} from "../loaders/external-models/_shared";

/**
 * 车辆家族：材质收尾由 `applyCarFinish` / `applyVehicleFinish` 接管，不吃调色板重建。
 */
function isVehicleMaterialFamily(itemType: any): boolean {
  return resolveModelFamily(itemType) === "vehicle";
}

/**
 * @param itemType 注册表里的物件类型（不是文件名）
 * @param materialName GLB 里的原始材质名（大小写不敏感）
 * @param warmWood 当前配色档位是否为暖木色；这是唯一与调色板有关的条件，
 *   判「值会不会被读」时应两种档位都试一遍（`true` 命中即视为会重建）。
 */
export function usesDetailMaterialPipeline(
  itemType: any,
  materialName: any,
  warmWood: boolean,
): boolean {
  const lowerName = String(materialName || "").toLowerCase();
  return (
    paletteOverrideItemTypes.has(itemType) ||
    (itemType === "aquarium" && lowerName.startsWith("aquarium-aquatic-")) ||
    Boolean((COURTYARD_MODELS as any)[itemType]) ||
    Boolean((DECOR_MODELS as any)[itemType]) ||
    lowerName.includes("-furniture-") ||
    gardenItemTypes.has(itemType) ||
    applianceItemTypes.has(itemType) ||
    // 车辆（`smallcar`/`suv`/`scooter`）虽然登记了语义角色，但车漆、车窗、车灯、轮毂
    // 全部来自 GLB 的 `car_tms` 图集，收尾一律在**原始材质**上做（`applyCarFinish` /
    // `applyVehicleFinish`）。一旦按调色板整块重建，`map` 就丢了，车只剩一坨纯色壳。
    // 这里的登记只服务角色标签 / 检查面板，不代表要重建材质。
    (hasSemanticSlotRoles(itemType) && !isVehicleMaterialFamily(itemType)) ||
    (!isStructuralModelFamily(resolveModelFamily(itemType)) &&
      (roleTableItemTypes.has(itemType) || Boolean((COLLECTION_MODELS as any)[itemType]))) ||
    (warmWood && warmWoodFurnitureItemTypes.has(itemType))
  );
}

/**
 * 审计 / 修复侧用：只要**任意**配色档位下会被重建，该槽位的 PBR 数值就不该被脚本改写
 * （两种档位都走 clone 的槽位才真正吃 GLB 里的值）。
 */
export function materialPbrIsReplaced(itemType: any, materialName: any): boolean {
  return (
    usesDetailMaterialPipeline(itemType, materialName, true) ||
    usesDetailMaterialPipeline(itemType, materialName, false)
  );
}

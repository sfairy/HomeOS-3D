/**
 * 物品模型分派族：water-tea。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import type { ItemModelScope } from "./types";

/**
 * 管线机（含「矩形双出水」外观变体）共用的机身形体族。
 *
 * 物品类型在切换款式后仍是 `pipelinewaterpurifier`，变体只通过模型类型体现；
 * 这里把变体类型一并纳入，保证按模型类型分派的路径也落在同一族里。
 */
const PIPELINE_DISPENSER_MODEL_TYPES: ReadonlySet<string> = new Set([
  "pipelinewaterpurifier",
  "rectangular-pipeline-dispenser",
]);

export function buildWaterTea(scope: ItemModelScope): boolean {
  const {
    addCylinderMesh,
    applyAccentEmissive,
    createSelectionRef,
    createPlanLabel,
    addLightModel,
    addRugMeshes,
    addStripLightPreview,
    disposeObjectTree,
    mergeMeshesByType,
    createWallSideMaterial,
    createWallTopMaterial,
    applyItemOptimization,
    getPixelsPerMeter,
    closedWallLoops,
    backgroundSettings,
    studioState,
    studioTelevisionDeps,
    activeFloorId,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    lampsLayerIndex,
    meshStatsByType,
    nextTenItemTypeSet,
    optimizationItemTypeSet,
    applianceOptimizationTypeSet,
    itemModelNode,
    modelItem,
    modelShadowIds,
    width6,
    depth,
    height6,
    yt4,
    furniture,
    appliance,
    furnitureSoft,
    furnitureLight,
    furnitureDark,
  } = scope;

  if (PIPELINE_DISPENSER_MODEL_TYPES.has(modelItem.type)) {
    const purifierBodyHeight =
      height6 * 0.9;
    (addBoxMesh(
      itemModelNode,
      width6,
      purifierBodyHeight,
      depth,
      0,
      purifierBodyHeight * 0.5,
      0,
      furnitureLight,
      {
        rounded: false,
        metalness: 0.04,
        roughness: 0.4,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.92,
        purifierBodyHeight * 0.27,
        0.028,
        0,
        height6 * 0.76,
        depth * 0.515,
        furnitureDark,
        {
          rounded: false,
          metalness: 0.16,
          roughness: 0.18,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.34,
        purifierBodyHeight * 0.045,
        0.014,
        -width6 * 0.08,
        height6 * 0.79,
        depth * 0.54,
        10470608,
        {
          rounded: false,
          emissive: 10470608,
          emissiveIntensity: 0.2,
          roughness: 0.22,
        },
      ));
    for (const purifierValveOffset of [
      -0.26, 0, 0.26,
    ])
      addCylinderMesh(
        itemModelNode,
        Math.min(width6, depth) * 0.055,
        Math.min(width6, depth) * 0.055,
        0.018,
        width6 * purifierValveOffset,
        height6 * 0.66,
        depth * 0.535,
        furnitureSoft,
        {
          segments: 24,
          rotationX: Math.PI / 2,
          metalness: 0.22,
          roughness: 0.28,
        },
      );
    for (const purifierFootX of [
      -width6 * 0.2,
      width6 * 0.2,
    ])
      (addCylinderMesh(
        itemModelNode,
        0.014,
        0.014,
        height6 * 0.12,
        purifierFootX,
        height6 * 0.49,
        depth * 0.48,
        furnitureDark,
        {
          segments: 18,
          metalness: 0.46,
          roughness: 0.22,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          0.024,
          0.018,
          0.035,
          purifierFootX,
          height6 * 0.425,
          depth * 0.52,
          furnitureDark,
          {
            segments: 18,
            rotationX: Math.PI / 2,
            metalness: 0.46,
            roughness: 0.22,
          },
        ));
    (addBoxMesh(
      itemModelNode,
      width6 * 0.68,
      height6 * 0.045,
      depth * 0.52,
      0,
      height6 * 0.11,
      depth * 0.16,
      furnitureDark,
      {
        rounded: false,
        metalness: 0.2,
        roughness: 0.3,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.42,
        0.028,
        depth * 0.28,
        0,
        height6 * 0.16,
        depth * 0.28,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.34,
        },
      ));
    return true;
  } else if (modelItem.type === "tea_bar_machine") {
    const teabarBaseHeight =
        height6 * 0.67,
      teabarCounterY =
        teabarBaseHeight +
        height6 * 0.045,
      teabarBackHeight =
        height6 - teabarCounterY;
    (addBoxMesh(
      itemModelNode,
      width6,
      teabarBaseHeight,
      depth,
      0,
      teabarBaseHeight * 0.5,
      0,
      furnitureLight,
      {
        rounded: false,
        roughness: 0.5,
        metalness: 0.04,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.94,
        0.028,
        depth * 1.02,
        0,
        teabarBaseHeight * 0.5,
        depth * 0.515,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.94,
        0.032,
        depth * 1.02,
        0,
        teabarBaseHeight,
        0,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.42,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.94,
        height6 * 0.04,
        depth * 1.04,
        0,
        teabarCounterY,
        0,
        furnitureLight,
        {
          rounded: false,
          roughness: 0.36,
          metalness: 0.1,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.92,
        teabarBackHeight,
        0.032,
        0,
        teabarCounterY +
          teabarBackHeight * 0.5,
        -depth * 0.46,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.56,
        },
      ));
    for (const teabarPillarX of [
      -width6 * 0.46,
      width6 * 0.46,
    ])
      addBoxMesh(
        itemModelNode,
        width6 * 0.075,
        teabarBackHeight,
        depth * 0.78,
        teabarPillarX,
        teabarCounterY +
          teabarBackHeight * 0.5,
        0,
        furnitureLight,
        {
          rounded: false,
          roughness: 0.48,
        },
      );
    addBoxMesh(
      itemModelNode,
      width6 * 0.86,
      height6 * 0.14,
      depth * 0.18,
      0,
      height6 * 0.9,
      depth * 0.48,
      furnitureDark,
      {
        rounded: false,
        metalness: 0.32,
        roughness: 0.22,
      },
    );
    for (const teabarBottleX of [
      -width6 * 0.22,
      width6 * 0.22,
    ]) {
      (addCylinderMesh(
        itemModelNode,
        Math.min(width6, depth) * 0.035,
        Math.min(width6, depth) * 0.035,
        0.018,
        teabarBottleX,
        height6 * 0.9,
        depth * 0.585,
        furnitureSoft,
        {
          segments: 20,
          rotationX: Math.PI / 2,
          metalness: 0.2,
          roughness: 0.25,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          0.012,
          0.012,
          height6 * 0.11,
          teabarBottleX,
          height6 * 0.79,
          depth * 0.5,
          furnitureDark,
          {
            segments: 18,
            metalness: 0.48,
            roughness: 0.22,
          },
        ));
      const teabarBottleSize =
        Math.min(width6, depth) * 0.16;
      (addCylinderMesh(
        itemModelNode,
        teabarBottleSize * 0.9,
        teabarBottleSize,
        height6 * 0.13,
        teabarBottleX,
        height6 * 0.75,
        depth * 0.12,
        teabarBottleX < 0
          ? 8752009
          : furnitureSoft,
        {
          segments: 28,
          metalness: 0.08,
          roughness: 0.34,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          teabarBottleSize * 0.84,
          teabarBottleSize * 0.84,
          0.016,
          teabarBottleX,
          height6 * 0.82,
          depth * 0.12,
          furnitureDark,
          {
            segments: 28,
            metalness: 0.18,
            roughness: 0.28,
          },
        ),
        addBoxMesh(
          itemModelNode,
          width6 * 0.12,
          height6 * 0.06,
          0.016,
          teabarBottleX,
          height6 * 0.77,
          depth * 0.3,
          furnitureDark,
          {
            radius: 0.012,
            metalness: 0.24,
            roughness: 0.24,
          },
        ));
    }
    addBoxMesh(
      itemModelNode,
      width6 * 0.92,
      height6 * 0.055,
      depth * 0.82,
      0,
      0.028,
      0,
      furnitureDark,
      {
        rounded: false,
        roughness: 0.36,
      },
    );
    return true;
  }
  return false;
}

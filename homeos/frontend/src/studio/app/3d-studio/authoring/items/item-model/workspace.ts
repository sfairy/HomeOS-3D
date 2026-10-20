/**
 * 物品模型分派族：workspace。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import type { ItemModelScope } from "./types";

export function buildWorkspace(scope: ItemModelScope): boolean {
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

  if (modelItem.type ===
      "desk") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6 *
        0.1,
      depth,
      0,
      height6 *
        0.93,
      0,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.05,
        height6 *
          0.88,
        depth *
          0.82,
        -width6 *
          0.44,
        height6 *
          0.44,
        0,
        furnitureDark,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.05,
        height6 *
          0.88,
        depth *
          0.82,
        width6 *
          0.44,
        height6 *
          0.44,
        0,
        furnitureDark,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.34,
        height6 *
          0.18,
        depth *
          0.78,
        width6 *
          0.22,
        height6 *
          0.74,
        0,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.27,
        0.018,
        depth *
          0.04,
        width6 *
          0.22,
        height6 *
          0.73,
        depth *
          0.41,
        furnitureLight,
        {
          metalness: 0.35,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "desktop") {
    const desktopScreenWidth =
        width6 *
        0.72,
      desktopScreenHeight =
        height6 *
        0.58;
    (addBoxMesh(
      itemModelNode,
      desktopScreenWidth,
      desktopScreenHeight,
      0.035,
      -width6 *
        0.06,
      height6 *
        0.66,
      -depth *
        0.25,
      furnitureDark,
      {
        rounded: false,
        roughness: 0.24,
      },
    ),
      addBoxMesh(
        itemModelNode,
        desktopScreenWidth *
          0.9,
        desktopScreenHeight *
          0.84,
        0.01,
        -width6 *
          0.06,
        height6 *
          0.66,
        -depth *
          0.19,
        659481,
        {
          rounded: false,
          roughness: 0.18,
          emissive: 1517112,
          emissiveIntensity: 0.35,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.035,
        height6 *
          0.24,
        0.035,
        -width6 *
          0.06,
        height6 *
          0.25,
        -depth *
          0.25,
        furnitureDark,
        {
          metalness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.28,
        0.025,
        depth *
          0.3,
        -width6 *
          0.06,
        0.02,
        -depth *
          0.22,
        furnitureDark,
        {
          metalness: 0.42,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.58,
        0.022,
        depth *
          0.38,
        -width6 *
          0.08,
        0.025,
        depth *
          0.24,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.1,
        0.035,
        depth *
          0.22,
        width6 *
          0.36,
        0.028,
        depth *
          0.24,
        furnitureSoft,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) *
            0.035,
          roughness: 0.46,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "laptop") {
    addBoxMesh(
      itemModelNode,
      width6,
      0.025,
      depth *
        0.72,
      0,
      0.018,
      depth *
        0.08,
      furniture,
      {
        metalness: 0.28,
        roughness: 0.36,
      },
    );
    const laptopScreenMesh =
      addBoxMesh(
        itemModelNode,
        width6 *
          0.96,
        height6 *
          0.78,
        0.018,
        0,
        height6 *
          0.43,
        -depth *
          0.29,
        furnitureDark,
        {
          rounded: false,
          metalness: 0.22,
          roughness: 0.25,
        },
      );
    ((laptopScreenMesh.rotation.x =
      -Math.PI *
      0.08),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.86,
        height6 *
          0.63,
        0.01,
        0,
        height6 *
          0.43,
        -depth *
          0.278,
        659740,
        {
          rounded: false,
          emissive: 1585226,
          emissiveIntensity: 0.38,
          roughness: 0.18,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.62,
        0.009,
        depth *
          0.34,
        0,
        0.035,
        depth *
          0.12,
        furnitureDark,
        {
          rounded: false,
        },
      ));
    return true;
  }
  return false;
}

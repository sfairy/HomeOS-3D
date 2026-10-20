/**
 * 物品模型分派族：shower-basin。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildShowerBasin(scope: ItemModelScope): boolean {
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
      "shower") {
    const showerMetal =
        yt4.showerMetal ??
        furnitureLight,
      showerRailZ =
        -depth *
        0.42,
      showerRailBottomY =
        height6 *
        0.13,
      showerRailTopY =
        height6 *
        0.9,
      showerRailHeight =
        showerRailTopY -
        showerRailBottomY,
      showerMetalOptions =
        {
          rounded: false,
          metalness: 0.68,
          roughness: 0.22,
        };
    addBoxMesh(
      itemModelNode,
      0.045,
      showerRailHeight,
      0.045,
      0,
      (showerRailBottomY +
        showerRailTopY) *
        0.5,
      showerRailZ,
      showerMetal,
      showerMetalOptions,
    );
    for (const showerHingeY of [
      showerRailBottomY,
      height6 *
        0.47,
      height6 *
        0.78,
      showerRailTopY,
    ])
      addBoxMesh(
        itemModelNode,
        0.085,
        0.085,
        0.065,
        0,
        showerHingeY,
        showerRailZ,
        showerMetal,
        showerMetalOptions,
      );
    for (const showerBracketY of [
      showerRailBottomY,
      showerRailTopY,
    ])
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.055,
        width6 *
          0.055,
        0.04,
        0,
        showerBracketY,
        -depth *
          0.47,
        showerMetal,
        {
          segments: 28,
          rotationX:
            Math.PI /
            2,
          metalness: 0.7,
          roughness: 0.2,
        },
      );
    const showerHeadY =
      height6 *
      0.12;
    addBoxMesh(
      itemModelNode,
      width6 *
        0.36,
      0.065,
      0.065,
      0,
      showerHeadY,
      showerRailZ +
        depth *
          0.08,
      showerMetal,
      showerMetalOptions,
    );
    for (const showerHeadX of [
      -width6 *
        0.2,
      width6 *
        0.2,
    ])
      (addCylinderMesh(
        itemModelNode,
        width6 *
          0.055,
        width6 *
          0.055,
        0.045,
        showerHeadX,
        showerHeadY,
        -depth *
          0.45,
        showerMetal,
        {
          segments: 28,
          rotationX:
            Math.PI /
            2,
          metalness: 0.7,
          roughness: 0.2,
        },
      ),
        addBoxMesh(
          itemModelNode,
          0.05,
          0.05,
          depth *
            0.13,
          showerHeadX,
          showerHeadY,
          showerRailZ +
            depth *
              0.01,
          showerMetal,
          showerMetalOptions,
        ));
    addBoxMesh(
      itemModelNode,
      0.045,
      height6 *
        0.12,
      0.045,
      0,
      showerHeadY -
        height6 *
          0.045,
      showerRailZ +
        depth *
          0.13,
      showerMetal,
      showerMetalOptions,
    );
    const showerRailTopPoint =
        new ns2.Vector3(
          0,
          showerRailTopY,
          showerRailZ,
        ),
      showerHeadPoint =
        new ns2.Vector3(
          0,
          height6 *
            0.76,
          depth *
            0.08,
        ),
      showerSpoutDeltaY =
        showerHeadPoint.y -
        showerRailTopPoint.y,
      showerSpoutDeltaZ =
        showerHeadPoint.z -
        showerRailTopPoint.z,
      hypot4 =
        Math.hypot(
          showerSpoutDeltaY,
          showerSpoutDeltaZ,
        ),
      showerSpoutMesh =
        addBoxMesh(
          itemModelNode,
          0.055,
          hypot4,
          0.055,
          0,
          (showerRailTopPoint.y +
            showerHeadPoint.y) *
            0.5,
          (showerRailTopPoint.z +
            showerHeadPoint.z) *
            0.5,
          showerMetal,
          showerMetalOptions,
        );
    ((showerSpoutMesh.rotation.x =
      Math.atan2(
        showerSpoutDeltaZ,
        showerSpoutDeltaY,
      )),
      addBoxMesh(
        itemModelNode,
        0.055,
        height6 *
          0.13,
        0.055,
        0,
        height6 *
          0.705,
        showerHeadPoint.z,
        showerMetal,
        showerMetalOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.34,
        0.035,
        depth *
          0.3,
        0,
        height6 *
          0.64,
        showerHeadPoint.z +
          depth *
            0.03,
        showerMetal,
        {
          rounded: false,
          metalness: 0.64,
          roughness: 0.24,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "basin") {
    (addBoxMesh(
      itemModelNode,
      width6 *
        0.92,
      height6 *
        0.72,
      depth *
        0.9,
      0,
      height6 *
        0.36,
      0,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        0.065,
        depth,
        0,
        height6 *
          0.75,
        0,
        furnitureLight,
        {
          roughness: 0.3,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.25,
        width6 *
          0.21,
        0.08,
        0,
        height6 *
          0.8,
        depth *
          0.02,
        furnitureSoft,
        {
          roughness: 0.28,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        0.018,
        0.018,
        height6 *
          0.2,
        0,
        height6 *
          0.9,
        -depth *
          0.2,
        furnitureDark,
        {
          metalness: 0.78,
          roughness: 0.18,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        0.018,
        0.018,
        depth *
          0.2,
        0,
        height6 *
          0.99,
        -depth *
          0.11,
        furnitureDark,
        {
          rotationX:
            Math.PI /
            2,
          metalness: 0.78,
          roughness: 0.18,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.012,
        height6 *
          0.62,
        depth *
          0.02,
        0,
        height6 *
          0.34,
        depth *
          0.46,
        furnitureDark,
        {
          rounded: false,
        },
      ));
    const basinMirrorTopY =
        height6 *
        1.05,
      basinMirrorWidth =
        width6 *
        0.72,
      basinMirrorHeight = 0.72,
      basinMirrorZ =
        -depth *
        0.46;
    (addBoxMesh(
      itemModelNode,
      basinMirrorWidth,
      basinMirrorHeight,
      0.018,
      0,
      basinMirrorTopY +
        basinMirrorHeight *
          0.5,
      basinMirrorZ,
      yt4.glass,
      {
        rounded: false,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        metalness: 0.26,
        roughness: 0.12,
        castShadow: false,
        renderOrder: 6,
      },
    ),
      addBoxMesh(
        itemModelNode,
        basinMirrorWidth +
          0.055,
        0.035,
        0.045,
        0,
        basinMirrorTopY,
        basinMirrorZ,
        furnitureDark,
        {
          metalness: 0.35,
        },
      ),
      addBoxMesh(
        itemModelNode,
        basinMirrorWidth +
          0.055,
        0.035,
        0.045,
        0,
        basinMirrorTopY +
          basinMirrorHeight,
        basinMirrorZ,
        furnitureDark,
        {
          metalness: 0.35,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.035,
        basinMirrorHeight,
        0.045,
        -basinMirrorWidth *
          0.5,
        basinMirrorTopY +
          basinMirrorHeight *
            0.5,
        basinMirrorZ,
        furnitureDark,
        {
          metalness: 0.35,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.035,
        basinMirrorHeight,
        0.045,
        basinMirrorWidth *
          0.5,
        basinMirrorTopY +
          basinMirrorHeight *
            0.5,
        basinMirrorZ,
        furnitureDark,
        {
          metalness: 0.35,
        },
      ));
    return true;
  }
  return false;
}

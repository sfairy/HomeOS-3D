/**
 * 物品模型分派族：lighting-glass。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildLightingGlass(scope: ItemModelScope): boolean {
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
      "walllamp") {
    const walllampMountZ =
        -depth *
          0.5 +
        0.018,
      walllampBracketOptions =
        {
          rounded: false,
          metalness: 0.64,
          roughness: 0.22,
        };
    (addBoxMesh(
      itemModelNode,
      width6 *
        0.68,
      height6 *
        0.5,
      0.035,
      0,
      height6 *
        0.52,
      walllampMountZ,
      yt4.furniture,
      {
        radius: 0.02,
        metalness: 0.18,
        roughness: 0.46,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.11,
        width6 *
          0.11,
        0.035,
        0,
        height6 *
          0.57,
        walllampMountZ -
          0.012,
        yt4.furnitureSoft,
        {
          segments: 24,
          rotationX:
            Math.PI /
            2,
          metalness: 0.3,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.04,
        height6 *
          0.2,
        depth *
          0.28,
        0,
        height6 *
          0.57,
        -depth *
          0.3,
        yt4.furniture,
        {
          ...walllampBracketOptions,
          metalness: 0.18,
          roughness: 0.46,
        },
      ));
    const walllampShadeMesh =
      new ns2.Mesh(
        new ns2.CylinderGeometry(
          width6 *
            0.3,
          width6 *
            0.19,
          height6 *
            0.38,
          24,
          1,
          true,
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              furnitureLight,
            roughness: 0.3,
            metalness: 0.04,
            emissive: 16767386,
            emissiveIntensity: 0.24,
            side: ns2.DoubleSide,
          },
        ),
      );
    (walllampShadeMesh.position.set(
      0,
      height6 *
        0.4,
      -depth *
        0.16,
    ),
      (walllampShadeMesh.castShadow = true),
      (walllampShadeMesh.receiveShadow = true),
      itemModelNode.add(
        walllampShadeMesh,
      ),
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.15,
        width6 *
          0.15,
        0.025,
        0,
        height6 *
          0.19,
        -depth *
          0.16,
        16769707,
        {
          segments: 24,
          emissive: 16760156,
          emissiveIntensity: 0.38,
          roughness: 0.24,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "glasspartition") {
    const glasspartitionFrameWidth =
        Math.min(
          Math.max(
            width6 *
              0.018,
            0.018,
          ),
          0.035,
        ),
      glasspartitionFrameDepth =
        Math.max(
          depth,
          0.045,
        ),
      glasspartitionGlassWidth =
        Math.max(
          width6 -
            glasspartitionFrameWidth *
              2.4,
          glasspartitionFrameWidth,
        ),
      glasspartitionGlassHeight =
        Math.max(
          height6 -
            glasspartitionFrameWidth *
              2.4,
          glasspartitionFrameWidth,
        ),
      glasspartitionFrameOptions =
        {
          rounded: false,
          metalness: 0.58,
          roughness: 0.24,
          castShadow: false,
          receiveShadow: false,
        };
    (addBoxMesh(
      itemModelNode,
      glasspartitionGlassWidth,
      glasspartitionGlassHeight,
      Math.max(
        depth *
          0.24,
        0.012,
      ),
      0,
      height6 *
        0.5,
      0,
      yt4.glass,
      {
        rounded: false,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: ns2.DoubleSide,
        metalness: 0.04,
        roughness: 0.08,
        castShadow: false,
        receiveShadow: false,
        renderOrder: 6,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        glasspartitionFrameWidth,
        glasspartitionFrameDepth,
        0,
        glasspartitionFrameWidth *
          0.5,
        0,
        yt4.frame,
        glasspartitionFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        glasspartitionFrameWidth,
        glasspartitionFrameDepth,
        0,
        height6 -
          glasspartitionFrameWidth *
            0.5,
        0,
        yt4.frame,
        glasspartitionFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        glasspartitionFrameWidth,
        height6,
        glasspartitionFrameDepth,
        -width6 *
          0.5 +
          glasspartitionFrameWidth *
            0.5,
        height6 *
          0.5,
        0,
        yt4.frame,
        glasspartitionFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        glasspartitionFrameWidth,
        height6,
        glasspartitionFrameDepth,
        width6 *
          0.5 -
          glasspartitionFrameWidth *
            0.5,
        height6 *
          0.5,
        0,
        yt4.frame,
        glasspartitionFrameOptions,
      ));
    for (const glasspartitionHingeX of [
      -width6 *
        0.34,
      width6 *
        0.34,
    ])
      addBoxMesh(
        itemModelNode,
        glasspartitionFrameWidth *
          1.7,
        glasspartitionFrameWidth *
          2.2,
        glasspartitionFrameDepth *
          1.18,
        glasspartitionHingeX,
        glasspartitionFrameWidth *
          1.3,
        0,
        furnitureSoft,
        glasspartitionFrameOptions,
      );
    return true;
  }
  return false;
}

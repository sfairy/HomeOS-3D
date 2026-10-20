/**
 * 物品模型分派族：media-bath。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import { computeTelevisionProportions } from "../studio-television-model";
import type { ItemModelScope } from "./types";

export function buildMediaBath(scope: ItemModelScope): boolean {
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
      "tv") {
    const {
        bodyHeight:
          ag4,
        centerY:
          ag5,
      } =
        computeTelevisionProportions(
          modelItem,
          height6,
        ),
      tvStandTopY =
        ag5 -
        ag4 *
          0.5;
    if (
      modelItem.tvMountStyle ===
      "mobile"
    ) {
      const tvBaseThickness =
          Math.max(
            height6 *
              0.045,
            0.055,
          ),
        tvBaseWidth =
          width6 *
          0.7,
        tvBaseDepth =
          Math.max(
            depth *
              0.78,
            0.3,
          ),
        tvNeckHeight =
          Math.max(
            tvStandTopY -
              tvBaseThickness *
                0.7,
            height6 *
              0.22,
          ),
        tvNeckY =
          tvBaseThickness *
            0.7 +
          tvNeckHeight *
            0.5;
      (addBoxMesh(
        itemModelNode,
        tvBaseWidth,
        tvBaseThickness,
        tvBaseDepth,
        0,
        tvBaseThickness *
          0.72,
        0,
        furnitureDark,
        {
          radius:
            Math.min(
              tvBaseThickness,
              tvBaseDepth,
            ) *
            0.22,
          metalness: 0.18,
          roughness: 0.32,
        },
      ),
        addBoxMesh(
          itemModelNode,
          width6 *
            0.075,
          tvNeckHeight,
          Math.max(
            depth *
              0.2,
            0.06,
          ),
          -width6 *
            0.035,
          tvNeckY,
          -depth *
            0.03,
          furnitureDark,
          {
            rounded: false,
            metalness: 0.2,
            roughness: 0.3,
          },
        ),
        addBoxMesh(
          itemModelNode,
          width6 *
            0.105,
          tvNeckHeight *
            0.86,
          Math.max(
            depth *
              0.12,
            0.04,
          ),
          width6 *
            0.025,
          tvNeckY +
            tvNeckHeight *
              0.02,
          depth *
            0.015,
          furnitureSoft,
          {
            rounded: false,
            metalness: 0.35,
            roughness: 0.28,
          },
        ),
        addBoxMesh(
          itemModelNode,
          width6 *
            0.34,
          Math.max(
            height6 *
              0.018,
            0.025,
          ),
          Math.max(
            depth *
              0.5,
            0.2,
          ),
          0,
          tvStandTopY *
            0.76,
          depth *
            0.04,
          furnitureDark,
          {
            radius: 0.012,
            metalness: 0.22,
            roughness: 0.3,
          },
        ));
      const tvFootSize =
        Math.max(
          Math.min(
            width6,
            depth,
          ) *
            0.045,
          0.025,
        );
      for (const tvFootX of [
        -tvBaseWidth *
          0.42,
        tvBaseWidth *
          0.42,
      ])
        for (const tvFootZ of [
          -tvBaseDepth *
            0.34,
          tvBaseDepth *
            0.34,
        ])
          addCylinderMesh(
            itemModelNode,
            tvFootSize,
            tvFootSize,
            Math.max(
              tvFootSize *
                0.56,
              0.018,
            ),
            tvFootX,
            tvFootSize,
            tvFootZ,
            1448479,
            {
              segments: 20,
              rotationZ:
                Math.PI /
                2,
              roughness: 0.38,
              metalness: 0.1,
            },
          );
    } else {
      if (
        modelItem.tvMountStyle ===
        "tabletop"
      ) {
        const tvTabletopThickness =
            Math.max(
              height6 *
                0.035,
              0.028,
            ),
          tvTabletopBaseWidth =
            width6 *
            0.34,
          tvTabletopBaseDepth =
            Math.max(
              depth *
                0.72,
              0.16,
            ),
          tvTabletopNeckHeight =
            Math.max(
              tvStandTopY -
                tvTabletopThickness,
              height6 *
                0.12,
            );
        (addBoxMesh(
          itemModelNode,
          tvTabletopBaseWidth,
          tvTabletopThickness,
          tvTabletopBaseDepth,
          0,
          tvTabletopThickness *
            0.5,
          0,
          furnitureDark,
          {
            radius:
              Math.min(
                tvTabletopThickness,
                tvTabletopBaseDepth,
              ) *
              0.26,
            metalness: 0.2,
            roughness: 0.3,
          },
        ),
          addBoxMesh(
            itemModelNode,
            width6 *
              0.075,
            tvTabletopNeckHeight,
            Math.max(
              depth *
                0.24,
              0.05,
            ),
            0,
            tvTabletopThickness +
              tvTabletopNeckHeight *
                0.5,
            -depth *
              0.03,
            furnitureSoft,
            {
              rounded: false,
              metalness: 0.34,
              roughness: 0.28,
            },
          ),
          addBoxMesh(
            itemModelNode,
            width6 *
              0.18,
            Math.max(
              height6 *
                0.025,
              0.022,
            ),
            Math.max(
              depth *
                0.34,
              0.08,
            ),
            0,
            tvStandTopY,
            0,
            furnitureDark,
            {
              radius: 0.008,
              metalness: 0.22,
              roughness: 0.3,
            },
          ));
      }
    }
    addBoxMesh(
      itemModelNode,
      width6,
      ag4,
      Math.max(
        depth *
          0.28,
        0.05,
      ),
      0,
      ag5,
      0,
      furnitureDark,
      {
        radius:
          Math.min(
            width6,
            ag4,
          ) *
          0.012,
        roughness: 0.28,
      },
    );
    return true;
  } else if (modelItem.type ===
      "vanity") {
    const vanityCounterY =
      Math.min(
        0.76,
        height6 *
          0.5,
      );
    (addBoxMesh(
      itemModelNode,
      width6,
      0.075,
      depth,
      0,
      vanityCounterY,
      0,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.27,
        vanityCounterY *
          0.82,
        depth *
          0.88,
        -width6 *
          0.34,
        vanityCounterY *
          0.42,
        0,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.27,
        vanityCounterY *
          0.82,
        depth *
          0.88,
        width6 *
          0.34,
        vanityCounterY *
          0.42,
        0,
        furniture,
      ));
    for (const vanityFrontX of [
      -0.34,
      0.34,
    ])
      for (const vanityFrontY of [
        0.23,
        0.48,
      ])
        addBoxMesh(
          itemModelNode,
          width6 *
            0.22,
          0.012,
          depth *
            0.02,
          width6 *
            vanityFrontX,
          vanityCounterY *
            vanityFrontY,
          depth *
            0.46,
          furnitureDark,
          {
            rounded: false,
          },
        );
    const vanityMirrorHeight =
      Math.max(
        height6 -
          vanityCounterY -
          0.08,
        0.45,
      );
    (addBoxMesh(
      itemModelNode,
      width6 *
        0.54,
      vanityMirrorHeight,
      0.025,
      0,
      vanityCounterY +
        vanityMirrorHeight *
          0.5,
      -depth *
        0.43,
      yt4.glass,
      {
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        metalness: 0.22,
        roughness: 0.16,
        renderOrder: 6,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.59,
        0.045,
        0.05,
        0,
        vanityCounterY +
          vanityMirrorHeight,
        -depth *
          0.43,
        furnitureLight,
        {
          metalness: 0.12,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.59,
        0.045,
        0.05,
        0,
        vanityCounterY,
        -depth *
          0.43,
        furnitureLight,
        {
          metalness: 0.12,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.045,
        vanityMirrorHeight,
        0.05,
        -width6 *
          0.295,
        vanityCounterY +
          vanityMirrorHeight *
            0.5,
        -depth *
          0.43,
        furnitureLight,
        {
          metalness: 0.12,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.045,
        vanityMirrorHeight,
        0.05,
        width6 *
          0.295,
        vanityCounterY +
          vanityMirrorHeight *
            0.5,
        -depth *
          0.43,
        furnitureLight,
        {
          metalness: 0.12,
        },
      ));
    return true;
  }
  return false;
}

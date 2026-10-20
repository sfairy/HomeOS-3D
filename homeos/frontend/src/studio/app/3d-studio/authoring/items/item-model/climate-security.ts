/**
 * 物品模型分派族：climate-security。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import { addSecurityModel as addSecurityModel2 } from "../../../loaders/studio-security-models";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildClimateSecurity(scope: ItemModelScope): boolean {
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
      "wallac") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6,
      depth,
      0,
      height6 * 0.5,
      0,
      furnitureLight,
      {
        roughness: 0.46,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.9,
        height6 * 0.08,
        depth * 0.18,
        0,
        height6 * 0.18,
        depth * 0.46,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.3,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.12,
        height6 * 0.08,
        depth * 0.05,
        width6 * 0.34,
        height6 * 0.68,
        depth * 0.51,
        furnitureSoft,
        {
          rounded: false,
          emissive:
            furnitureSoft,
          emissiveIntensity: 0.18,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "floorac") {
    (addCylinderMesh(
      itemModelNode,
      width6 * 0.46,
      width6 * 0.48,
      height6,
      0,
      height6 * 0.5,
      0,
      furnitureLight,
      {
        segments: 32,
        roughness: 0.48,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.5,
        height6 * 0.42,
        0.025,
        0,
        height6 * 0.68,
        depth * 0.48,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.3,
        },
      ));
    for (const flooracVaneRatio of [
      0.58, 0.68, 0.78,
    ])
      addBoxMesh(
        itemModelNode,
        width6 * 0.36,
        0.012,
        0.006,
        0,
        height6 *
          flooracVaneRatio,
        depth * 0.505,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.42,
        },
      );
    return true;
  } else if (modelItem.type ===
      "robotvacuum") {
    (addBoxMesh(
      itemModelNode,
      width6 * 0.82,
      0.035,
      depth * 0.92,
      0,
      0.018,
      0,
      furnitureSoft,
      {
        radius:
          Math.min(
            width6,
            depth,
          ) * 0.05,
        roughness: 0.58,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.68,
        height6 * 0.82,
        depth * 0.48,
        0,
        height6 * 0.47,
        -depth * 0.23,
        furnitureLight,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) * 0.12,
          roughness: 0.48,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.44,
        height6 * 0.16,
        0.03,
        0,
        height6 * 0.2,
        depth * 0.02,
        furnitureSoft,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) * 0.04,
          roughness: 0.42,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.34,
        height6 * 0.07,
        0.035,
        0,
        height6 * 0.14,
        depth * 0.04,
        furnitureDark,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) * 0.025,
          roughness: 0.28,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        width6 * 0.31,
        width6 * 0.32,
        height6 * 0.12,
        0,
        height6 * 0.07,
        depth * 0.2,
        furnitureLight,
        {
          segments: 32,
          roughness: 0.42,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        width6 * 0.085,
        width6 * 0.09,
        height6 * 0.055,
        -width6 * 0.08,
        height6 * 0.16,
        depth * 0.15,
        furnitureSoft,
        {
          segments: 24,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.36,
        height6 * 0.045,
        0.025,
        0,
        height6 * 0.08,
        depth * 0.52,
        furnitureDark,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) * 0.025,
          roughness: 0.24,
        },
      ));
    return true;
  } else if (modelItem.type ===
        "camera" ||
      modelItem.type ===
        "presence") {
    addSecurityModel2(
      ns2,
      itemModelNode,
      modelItem,
      yt4,
    );
    return true;
  } else if (modelItem.type ===
      "nas") {
    const applianceSoft =
        yt4.applianceSoft ??
        furnitureSoft,
      applianceDark =
        yt4.applianceDark ??
        furnitureDark;
    (addBoxMesh(
      itemModelNode,
      width6,
      height6 *
        0.94,
      depth * 0.94,
      0,
      height6 *
        0.53,
      -depth * 0.03,
      applianceSoft,
      {
        radius:
          Math.min(
            width6,
            height6,
            depth,
          ) * 0.025,
        roughness: 0.82,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.94,
        height6 *
          0.84,
        depth *
          0.04,
        0,
        height6 *
          0.52,
        depth *
          0.46,
        applianceDark,
        {
          rounded: false,
          roughness: 0.82,
        },
      ));
    for (const nasDriveOffset of [
      -0.34, -0.14,
      0.06, 0.26,
    ])
      (addBoxMesh(
        itemModelNode,
        width6 *
          0.18,
        height6 *
          0.71,
        depth *
          0.02,
        width6 *
          nasDriveOffset,
        height6 *
          0.52,
        depth *
          0.49,
        applianceDark,
        {
          rounded: false,
          roughness: 0.82,
        },
      ),
        addBoxMesh(
          itemModelNode,
          width6 *
            0.11,
          height6 *
            0.035,
          depth *
            0.01,
          width6 *
            nasDriveOffset,
          height6 *
            0.38,
          depth *
            0.495,
          applianceSoft,
          {
            rounded: false,
            roughness: 0.82,
          },
        ));
    for (const nasFootX of [
      -0.38, 0.38,
    ])
      for (const nasFootZ of [
        -0.33, 0.33,
      ])
        addBoxMesh(
          itemModelNode,
          width6 *
            0.12,
          height6 *
            0.06,
          depth *
            0.12,
          width6 *
            nasFootX,
          height6 *
            0.03,
          depth *
            nasFootZ,
          applianceDark,
          {
            rounded: false,
          },
        );
    ((addBoxMesh(
      itemModelNode,
      width6 *
        0.016,
      height6 *
        0.022,
      depth * 0.01,
      width6 * 0.44,
      height6 *
        0.82,
      depth * 0.495,
      8702858,
      {
        rounded: false,
        emissive: 6798195,
        emissiveIntensity: 0.5,
      },
    ).userData.nasIndicator =
      true),
      (itemModelNode.userData.nasStatusAnchor =
        [
          width6 *
            0.44,
          height6 *
            0.82,
          depth *
            0.5,
        ]));
    return true;
  } else if (modelItem.type ===
      "airpurifier") {
    const airpurifierBodyRadius =
      Math.min(
        width6,
        depth,
      ) * 0.47;
    (addCylinderMesh(
      itemModelNode,
      airpurifierBodyRadius *
        0.96,
      airpurifierBodyRadius,
      height6 *
        0.92,
      0,
      height6 *
        0.46,
      0,
      furnitureLight,
      {
        segments: 36,
        roughness: 0.5,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        airpurifierBodyRadius *
          0.92,
        airpurifierBodyRadius *
          0.92,
        height6 *
          0.055,
        0,
        height6 *
          0.965,
        0,
        furnitureDark,
        {
          segments: 36,
          metalness: 0.18,
          roughness: 0.3,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        airpurifierBodyRadius *
          0.62,
        airpurifierBodyRadius *
          0.62,
        height6 *
          0.012,
        0,
        height6 *
          0.998,
        0,
        furnitureDark,
        {
          segments: 32,
          metalness: 0.12,
          roughness: 0.48,
        },
      ));
    return true;
  }
  return false;
}

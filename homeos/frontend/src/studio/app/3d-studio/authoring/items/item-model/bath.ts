/**
 * 物品模型分派族：bath。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import { buildPressProfile } from "../studio-sanitary-models";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildBath(scope: ItemModelScope): boolean {
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
      "toilet") {
    const toiletBaseMesh =
      new ns2.Mesh(
        buildPressProfile(
          width6,
          depth,
          height6,
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              furnitureLight,
            roughness: 0.4,
            metalness: 0.02,
          },
        ),
      );
    ((toiletBaseMesh.castShadow = true),
      (toiletBaseMesh.receiveShadow = true),
      itemModelNode.add(
        toiletBaseMesh,
      ));
    const toiletSeatShape =
      new ns2.Shape();
    (toiletSeatShape.moveTo(
      -width6 *
        0.46,
      -depth *
        0.44,
    ),
      toiletSeatShape.lineTo(
        width6 *
          0.46,
        -depth *
          0.44,
      ),
      toiletSeatShape.bezierCurveTo(
        width6 *
          0.49,
        -depth *
          0.05,
        width6 *
          0.49,
        depth *
          0.29,
        0,
        depth *
          0.47,
      ),
      toiletSeatShape.bezierCurveTo(
        -width6 *
          0.49,
        depth *
          0.29,
        -width6 *
          0.49,
        -depth *
          0.05,
        -width6 *
          0.46,
        -depth *
          0.44,
      ),
      toiletSeatShape.closePath());
    const toiletSeatMesh =
      new ns2.Mesh(
        new ns2.ExtrudeGeometry(
          toiletSeatShape,
          {
            depth:
              height6 *
              0.085,
            bevelEnabled: true,
            bevelSegments: 2,
            bevelSize: 0.012,
            bevelThickness: 0.01,
            steps: 1,
          },
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              furnitureSoft,
            roughness: 0.34,
            metalness: 0.01,
          },
        ),
      );
    ((toiletSeatMesh.rotation.x =
      Math.PI /
      2),
      toiletSeatMesh.position.set(
        0,
        height6 *
          0.82,
        0,
      ),
      (toiletSeatMesh.castShadow = true),
      (toiletSeatMesh.receiveShadow = true),
      itemModelNode.add(
        toiletSeatMesh,
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.9,
        height6 *
          0.095,
        depth *
          0.2,
        0,
        height6 *
          0.775,
        -depth *
          0.34,
        furnitureLight,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) *
            0.035,
          roughness: 0.36,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.016,
        height6 *
          0.38,
        0.024,
        -width6 *
          0.42,
        height6 *
          0.38,
        -depth *
          0.18,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.46,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.035,
        width6 *
          0.035,
        0.018,
        -width6 *
          0.46,
        height6 *
          0.66,
        depth *
          0.12,
        furnitureSoft,
        {
          segments: 24,
          rotationZ:
            Math.PI /
            2,
          metalness: 0.08,
          roughness: 0.3,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "squattoilet") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6 *
        0.58,
      depth,
      0,
      height6 *
        0.29,
      0,
      furnitureLight,
      {
        radius:
          Math.min(
            width6,
            depth,
          ) *
          0.08,
        roughness: 0.38,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.28,
        height6 *
          0.12,
        depth *
          0.58,
        -width6 *
          0.34,
        height6 *
          0.66,
        0,
        furnitureSoft,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) *
            0.035,
          roughness: 0.4,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.28,
        height6 *
          0.12,
        depth *
          0.58,
        width6 *
          0.34,
        height6 *
          0.66,
        0,
        furnitureSoft,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) *
            0.035,
          roughness: 0.4,
        },
      ));
    const squattoiletTrapMesh =
      new ns2.Mesh(
        new ns2.CylinderGeometry(
          width6 *
            0.16,
          width6 *
            0.2,
          height6 *
            0.18,
          28,
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              furnitureDark,
            roughness: 0.34,
            metalness: 0.02,
          },
        ),
      );
    ((squattoiletTrapMesh.scale.z = 1.75),
      (squattoiletTrapMesh.position.y =
        height6 *
        0.67),
      itemModelNode.add(
        squattoiletTrapMesh,
      ));
    return true;
  } else if (modelItem.type ===
      "urinal") {
    addBoxMesh(
      itemModelNode,
      width6 *
        0.78,
      height6 *
        0.88,
      depth *
        0.72,
      0,
      height6 *
        0.5,
      -depth *
        0.06,
      furnitureLight,
      {
        radius:
          Math.min(
            width6,
            depth,
          ) *
          0.16,
        roughness: 0.32,
      },
    );
    const urinalBowlMesh =
      new ns2.Mesh(
        new ns2.SphereGeometry(
          Math.min(
            width6,
            depth,
          ) *
            0.3,
          24,
          16,
          0,
          Math.PI *
            2,
          0,
          Math.PI *
            0.58,
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              furnitureSoft,
            roughness: 0.28,
            metalness: 0.02,
            side: ns2.DoubleSide,
          },
        ),
      );
    (urinalBowlMesh.scale.set(
      0.9,
      1.1,
      0.62,
    ),
      (urinalBowlMesh.rotation.x =
        Math.PI),
      urinalBowlMesh.position.set(
        0,
        height6 *
          0.53,
        depth *
          0.17,
      ),
      itemModelNode.add(
        urinalBowlMesh,
      ),
      addCylinderMesh(
        itemModelNode,
        0.018,
        0.018,
        height6 *
          0.22,
        0,
        height6 *
          0.95,
        -depth *
          0.18,
        furnitureDark,
        {
          segments: 16,
          metalness: 0.72,
          roughness: 0.22,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "bathtub") {
    const bathtubOuterHeight =
        height6 *
        0.84,
      bathtubWallThickness =
        Math.min(
          width6,
          depth,
        ) *
        0.11,
      bathtubInnerHeight =
        bathtubOuterHeight *
        0.8,
      bathtubInnerWidth =
        Math.max(
          width6 -
            bathtubWallThickness *
              2,
          width6 *
            0.48,
        ),
      bathtubInnerDepth =
        Math.max(
          depth -
            bathtubWallThickness *
              2,
          depth *
            0.42,
        );
    (addBoxMesh(
      itemModelNode,
      bathtubInnerWidth,
      bathtubOuterHeight *
        0.16,
      bathtubInnerDepth,
      0,
      bathtubOuterHeight *
        0.14,
      0,
      furnitureSoft,
      {
        radius:
          Math.min(
            width6,
            depth,
          ) *
          0.16,
        roughness: 0.33,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        bathtubInnerHeight,
        bathtubWallThickness,
        0,
        bathtubInnerHeight *
          0.5,
        -depth *
          0.5 +
          bathtubWallThickness *
            0.5,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.5,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        bathtubInnerHeight,
        bathtubWallThickness,
        0,
        bathtubInnerHeight *
          0.5,
        depth *
          0.5 -
          bathtubWallThickness *
            0.5,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.5,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        bathtubWallThickness,
        bathtubInnerHeight,
        bathtubInnerDepth,
        -width6 *
          0.5 +
          bathtubWallThickness *
            0.5,
        bathtubInnerHeight *
          0.5,
        0,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.5,
          roughness: 0.34,
        },
      ),
      addBoxMesh(
        itemModelNode,
        bathtubWallThickness,
        bathtubInnerHeight,
        bathtubInnerDepth,
        width6 *
          0.5 -
          bathtubWallThickness *
            0.5,
        bathtubInnerHeight *
          0.5,
        0,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.5,
          roughness: 0.34,
        },
      ));
    const bathtubRimHeight =
        bathtubOuterHeight *
        0.075,
      bathtubRimY =
        bathtubInnerHeight +
        bathtubRimHeight *
          0.5;
    (addBoxMesh(
      itemModelNode,
      width6,
      bathtubRimHeight,
      bathtubWallThickness,
      0,
      bathtubRimY,
      -depth *
        0.5 +
        bathtubWallThickness *
          0.5,
      furnitureLight,
      {
        radius:
          bathtubWallThickness *
          0.45,
        roughness: 0.29,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        bathtubRimHeight,
        bathtubWallThickness,
        0,
        bathtubRimY,
        depth *
          0.5 -
          bathtubWallThickness *
            0.5,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.45,
          roughness: 0.29,
        },
      ),
      addBoxMesh(
        itemModelNode,
        bathtubWallThickness,
        bathtubRimHeight,
        bathtubInnerDepth,
        -width6 *
          0.5 +
          bathtubWallThickness *
            0.5,
        bathtubRimY,
        0,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.45,
          roughness: 0.29,
        },
      ),
      addBoxMesh(
        itemModelNode,
        bathtubWallThickness,
        bathtubRimHeight,
        bathtubInnerDepth,
        width6 *
          0.5 -
          bathtubWallThickness *
            0.5,
        bathtubRimY,
        0,
        furnitureLight,
        {
          radius:
            bathtubWallThickness *
            0.45,
          roughness: 0.29,
        },
      ));
    for (const bathtubFootX of [
      -width6 *
        0.38,
      width6 *
        0.38,
    ])
      for (const bathtubFootZ of [
        -depth *
          0.3,
        depth *
          0.3,
      ])
        addCylinderMesh(
          itemModelNode,
          0.026,
          0.026,
          height6 *
            0.16,
          bathtubFootX,
          height6 *
            0.08,
          bathtubFootZ,
          yt4.furnitureDark,
          {
            segments: 12,
            metalness: 0.42,
            roughness: 0.3,
          },
        );
    (addCylinderMesh(
      itemModelNode,
      0.016,
      0.016,
      height6 *
        0.25,
      width6 *
        0.34,
      height6 *
        0.96,
      -depth *
        0.22,
      furnitureDark,
      {
        segments: 16,
        metalness: 0.72,
        roughness: 0.2,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        0.016,
        0.016,
        depth *
          0.28,
        width6 *
          0.34,
        height6 *
          1.08,
        -depth *
          0.08,
        furnitureDark,
        {
          segments: 16,
          rotationX:
            Math.PI /
            2,
          metalness: 0.72,
          roughness: 0.2,
        },
      ));
    return true;
  }
  return false;
}

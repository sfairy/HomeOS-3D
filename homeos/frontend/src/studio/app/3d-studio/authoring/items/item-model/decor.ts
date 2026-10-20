/**
 * 物品模型分派族：decor。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import { clamp as clamp2 } from "../../../plan/geometry";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildDecor(scope: ItemModelScope): boolean {
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
      "rug") {
    if (
      !addRugMeshes(
        itemModelNode,
        modelItem,
        furniture,
        furnitureSoft,
      )
    ) {
      const rugPileThickness =
        clamp2(
          height6,
          0.004,
          0.018,
        );
      addBoxMesh(
        itemModelNode,
        width6,
        rugPileThickness,
        depth,
        0,
        rugPileThickness *
          0.5,
        0,
        furniture,
        {
          radius:
            Math.min(
              width6,
              depth,
            ) *
            0.018,
          roughness: 1,
          metalness: 0,
          castShadow: false,
          receiveShadow: true,
        },
      );
      const modelShadowIdsRugInsetMesh =
        new ns2.Mesh(
          new ns2.PlaneGeometry(
            width6 *
              0.88,
            depth *
              0.84,
          ),
          new ns2.MeshStandardMaterial(
            {
              color:
                furnitureSoft,
              roughness: 1,
              metalness: 0,
              polygonOffset: true,
              polygonOffsetFactor:
                -2,
              polygonOffsetUnits:
                -4,
            },
          ),
        );
      ((modelShadowIdsRugInsetMesh.rotation.x =
        -Math.PI /
        2),
        (modelShadowIdsRugInsetMesh.position.y =
          rugPileThickness +
          0.001),
        (modelShadowIdsRugInsetMesh.castShadow = false),
        (modelShadowIdsRugInsetMesh.receiveShadow = true),
        (modelShadowIdsRugInsetMesh.renderOrder = 1),
        itemModelNode.add(
          modelShadowIdsRugInsetMesh,
        ));
    }
    return true;
  } else if (modelItem.type ===
      "tvstand") {
    addBoxMesh(
      itemModelNode,
      width6,
      height6 *
        0.76,
      depth,
      0,
      height6 *
        0.42,
      0,
      furniture,
    );
    const tvstandTopThickness =
        height6 *
        0.08,
      tvstandTopY =
        height6 *
        0.8;
    (addBoxMesh(
      itemModelNode,
      width6 *
        0.98,
      tvstandTopThickness,
      depth,
      0,
      tvstandTopY +
        tvstandTopThickness *
          0.5,
      0,
      furnitureSoft,
    ),
      addBoxMesh(
        itemModelNode,
        0.018,
        height6 *
          0.58,
        depth *
          1.01,
        0,
        height6 *
          0.43,
        depth *
          0.01,
        furnitureDark,
        {
          rounded: false,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 *
          0.91,
        0.015,
        depth *
          1.01,
        0,
        height6 *
          0.43,
        depth *
          0.01,
        furnitureDark,
        {
          rounded: false,
        },
      ));
    for (const tvstandFootOffset of [
      -0.4,
      0.4,
    ])
      addBoxMesh(
        itemModelNode,
        0.055,
        height6 *
          0.2,
        0.055,
        width6 *
          tvstandFootOffset,
        height6 *
          0.1,
        0,
        furnitureDark,
        {
          metalness: 0.32,
        },
      );
    return true;
  } else if (modelItem.type ===
      "floorlamp") {
    const floorLampBody =
        yt4.floorLampBody ??
        furnitureDark,
      floorLampBody2 =
        yt4.floorLampBody ??
        furnitureSoft,
      floorlampBaseX =
        -width6 *
        0.34,
      floorlampShadeX =
        width6 *
        0.31,
      floorlampBaseRadius =
        Math.min(
          width6 *
            0.13,
          depth *
            0.34,
        ),
      floorlampShadeRadius =
        Math.min(
          width6 *
            0.18,
          depth *
            0.46,
        ),
      floorlampShadeHeight =
        height6 *
        0.115,
      floorlampShadeY =
        height6 *
        0.76,
      floorlampShadeTopY =
        floorlampShadeY +
        floorlampShadeHeight;
    addCylinderMesh(
      itemModelNode,
      floorlampBaseRadius *
        0.82,
      floorlampBaseRadius,
      0.045,
      floorlampBaseX,
      0.0225,
      0,
      floorLampBody,
      {
        segments: 32,
        metalness: 0.38,
        roughness: 0.3,
      },
    );
    const floorlampTubeCurve =
        new ns2.CubicBezierCurve3(
          new ns2.Vector3(
            floorlampBaseX,
            0.045,
            0,
          ),
          new ns2.Vector3(
            floorlampBaseX,
            height6 *
              0.72,
            0,
          ),
          new ns2.Vector3(
            width6 *
              0.02,
            height6 *
              1.01,
            0,
          ),
          new ns2.Vector3(
            floorlampShadeX,
            floorlampShadeTopY,
            0,
          ),
        ),
      floorlampTubeMesh =
        new ns2.Mesh(
          new ns2.TubeGeometry(
            floorlampTubeCurve,
            48,
            Math.max(
              0.012,
              width6 *
                0.012,
            ),
            8,
            false,
          ),
          new ns2.MeshStandardMaterial(
            {
              color:
                floorLampBody,
              roughness: 0.3,
              metalness: 0.48,
            },
          ),
        );
    ((floorlampTubeMesh.castShadow = true),
      itemModelNode.add(
        floorlampTubeMesh,
      ));
    const floorlampShadeMesh =
      new ns2.Mesh(
        new ns2.SphereGeometry(
          floorlampShadeRadius,
          32,
          16,
          0,
          Math.PI *
            2,
          0,
          Math.PI /
            2,
        ),
        new ns2.MeshStandardMaterial(
          {
            color:
              floorLampBody2,
            roughness: 0.62,
            metalness: 0.04,
          },
        ),
      );
    (floorlampShadeMesh.scale.set(
      1,
      floorlampShadeHeight /
        floorlampShadeRadius,
      1,
    ),
      floorlampShadeMesh.position.set(
        floorlampShadeX,
        floorlampShadeY,
        0,
      ),
      (floorlampShadeMesh.castShadow = true),
      itemModelNode.add(
        floorlampShadeMesh,
      ),
      addCylinderMesh(
        itemModelNode,
        floorlampShadeRadius *
          0.94,
        floorlampShadeRadius *
          0.98,
        0.025,
        floorlampShadeX,
        floorlampShadeY,
        0,
        yt4.floorLampBody
          ? yt4.applianceSoft
          : furnitureDark,
        {
          segments: 32,
          metalness: 0.12,
          roughness: 0.5,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        Math.max(
          0.018,
          width6 *
            0.014,
        ),
        Math.max(
          0.022,
          width6 *
            0.018,
        ),
        0.045,
        floorlampShadeX,
        floorlampShadeTopY +
          0.012,
        0,
        floorLampBody,
        {
          segments: 20,
          metalness: 0.42,
          roughness: 0.28,
        },
      ));
    return true;
  } else if (modelItem.type ===
      "plant") {
    (addCylinderMesh(
      itemModelNode,
      width6 *
        0.25,
      width6 *
        0.21,
      height6 *
        0.22,
      0,
      height6 *
        0.11,
      0,
      furnitureSoft,
      {
        segments: 24,
        roughness: 0.82,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        width6 *
          0.22,
        width6 *
          0.22,
        0.035,
        0,
        height6 *
          0.22,
        0,
        furnitureDark,
        {
          segments: 24,
          roughness: 0.96,
        },
      ));
    const plantLeafBranches =
      [
        [
          new ns2.Vector3(
            0,
            height6 *
              0.21,
            0,
          ),
          new ns2.Vector3(
            -width6 *
              0.06,
            height6 *
              0.58,
            0,
          ),
          new ns2.Vector3(
            -width6 *
              0.27,
            height6 *
              0.78,
            0,
          ),
        ],
        [
          new ns2.Vector3(
            width6 *
              0.03,
            height6 *
              0.21,
            0,
          ),
          new ns2.Vector3(
            width6 *
              0.06,
            height6 *
              0.64,
            0,
          ),
          new ns2.Vector3(
            width6 *
              0.12,
            height6 *
              0.94,
            0,
          ),
        ],
        [
          new ns2.Vector3(
            0,
            height6 *
              0.28,
            0,
          ),
          new ns2.Vector3(
            width6 *
              0.18,
            height6 *
              0.62,
            0,
          ),
          new ns2.Vector3(
            width6 *
              0.31,
            height6 *
              0.79,
            0,
          ),
        ],
      ];
    for (const plantLeafBranch of plantLeafBranches) {
      const plantLeafTubeMesh =
        new ns2.Mesh(
          new ns2.TubeGeometry(
            new ns2.CatmullRomCurve3(
              plantLeafBranch,
            ),
            20,
            0.014,
            7,
            false,
          ),
          new ns2.MeshStandardMaterial(
            {
              color:
                furnitureDark,
              roughness: 0.86,
            },
          ),
        );
      ((plantLeafTubeMesh.castShadow = true),
        itemModelNode.add(
          plantLeafTubeMesh,
        ));
    }
    const plantBerryAnchorPoints =
      [
        [
          -0.27,
          0.78,
          0,
        ],
        [
          -0.1,
          0.61,
          0.02,
        ],
        [
          0.12,
          0.94,
          0,
        ],
        [
          0.31,
          0.79,
          0,
        ],
        [
          0.18,
          0.63,
          -0.02,
        ],
        [
          0.02,
          0.46,
          0.03,
        ],
      ];
    for (const [
      plantBerryX,
      plantBerryY,
      plantBerryZ,
    ] of plantBerryAnchorPoints)
      for (
        let plantBerryIndex = 0;
        plantBerryIndex <
        5;
        plantBerryIndex += 1
      ) {
        const plantBerryAngle =
            (plantBerryIndex /
              5) *
            Math.PI *
            2,
          plantBerryMesh =
            new ns2.Mesh(
              new ns2.SphereGeometry(
                0.5,
                10,
                6,
              ),
              new ns2.MeshStandardMaterial(
                {
                  color:
                    plantBerryIndex %
                    2
                      ? 7835779
                      : 6257261,
                  roughness: 0.9,
                },
              ),
            ),
          plantWarmWoodScale =
            yt4.warmWood
              ? 1.85
              : 1;
        (plantBerryMesh.scale.set(
          width6 *
            0.045 *
            plantWarmWoodScale,
          height6 *
            0.085 *
            plantWarmWoodScale,
          depth *
            0.025 *
            plantWarmWoodScale,
        ),
          plantBerryMesh.position.set(
            width6 *
              plantBerryX +
              Math.cos(
                plantBerryAngle,
              ) *
                width6 *
                0.08,
            height6 *
              plantBerryY +
              Math.sin(
                plantBerryAngle,
              ) *
                height6 *
                0.035,
            depth *
              plantBerryZ +
              Math.sin(
                plantBerryAngle,
              ) *
                depth *
                0.06,
          ),
          (plantBerryMesh.rotation.z =
            plantBerryAngle -
            Math.PI /
              2),
          (plantBerryMesh.rotation.y =
            plantBerryAngle *
            0.6),
          (plantBerryMesh.castShadow = true),
          itemModelNode.add(
            plantBerryMesh,
          ));
      }
    return true;
  }
  return false;
}

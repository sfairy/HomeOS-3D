/**
 * 物品模型分派族：kitchen。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import type { ItemModelScope } from "./types";

export function buildKitchen(scope: ItemModelScope): boolean {
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

  if ([
        "kitchenbase",
        "kitchensink",
        "kitchencooktop",
      ].includes(modelItem.type)) {
    const kitchenToeKickHeight = height6 * 0.1,
      kitchenCounterThickness = height6 * 0.07,
      kitchenBodyHeight =
        height6 -
        kitchenToeKickHeight -
        kitchenCounterThickness,
      kitchenBodyCenterY =
        kitchenToeKickHeight +
        kitchenBodyHeight * 0.5;
    (addBoxMesh(
      itemModelNode,
      width6 * 0.96,
      kitchenToeKickHeight,
      depth * 0.8,
      0,
      kitchenToeKickHeight * 0.5,
      -depth * 0.06,
      furnitureDark,
      {
        rounded: false,
        roughness: 0.52,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        kitchenBodyHeight,
        depth,
        0,
        kitchenBodyCenterY,
        0,
        furniture,
        {
          rounded: false,
          roughness: 0.58,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 1.02,
        kitchenCounterThickness,
        depth * 1.04,
        0,
        height6 - kitchenCounterThickness * 0.5,
        0,
        furnitureLight,
        {
          rounded: false,
          roughness: 0.42,
        },
      ));
    const kitchenDoorCount = Math.max(
        2,
        Math.min(6, Math.round(width6 / 0.6)),
      ),
      kitchenDoorWidth = width6 / kitchenDoorCount;
    for (
      let kitchenDoorIndex = 0;
      kitchenDoorIndex < kitchenDoorCount;
      kitchenDoorIndex += 1
    ) {
      const kitchenDoorX =
        -width6 * 0.5 +
        kitchenDoorWidth * (kitchenDoorIndex + 0.5);
      (addBoxMesh(
        itemModelNode,
        kitchenDoorWidth * 0.92,
        kitchenBodyHeight * 0.9,
        0.025,
        kitchenDoorX,
        kitchenBodyCenterY,
        depth * 0.515,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.46,
        },
      ),
        addBoxMesh(
          itemModelNode,
          kitchenDoorWidth * 0.28,
          0.022,
          0.03,
          kitchenDoorX,
          kitchenToeKickHeight +
            kitchenBodyHeight * 0.83,
          depth * 0.535,
          furnitureDark,
          {
            rounded: false,
            metalness: 0.28,
            roughness: 0.3,
          },
        ));
    }
    if (modelItem.type === "kitchensink")
      (addBoxMesh(
        itemModelNode,
        width6 * 0.42,
        0.025,
        depth * 0.52,
        0,
        height6 + 0.008,
        0,
        furnitureDark,
        {
          rounded: false,
          metalness: 0.42,
          roughness: 0.28,
        },
      ),
        addBoxMesh(
          itemModelNode,
          width6 * 0.34,
          0.02,
          depth * 0.4,
          0,
          height6 + 0.022,
          0,
          furnitureSoft,
          {
            rounded: false,
            metalness: 0.18,
            roughness: 0.34,
          },
        ),
        addCylinderMesh(
          itemModelNode,
          0.018,
          0.018,
          height6 * 0.22,
          width6 * 0.22,
          height6 + height6 * 0.11,
          -depth * 0.17,
          furnitureDark,
          {
            segments: 20,
            metalness: 0.65,
            roughness: 0.2,
          },
        ),
        addBoxMesh(
          itemModelNode,
          width6 * 0.16,
          0.035,
          0.035,
          width6 * 0.14,
          height6 + height6 * 0.2,
          -depth * 0.17,
          furnitureDark,
          {
            rounded: false,
            metalness: 0.65,
            roughness: 0.2,
          },
        ));
    else {
      if (modelItem.type === "kitchencooktop") {
        addBoxMesh(
          itemModelNode,
          width6 * 0.48,
          0.025,
          depth * 0.55,
          0,
          height6 + 0.008,
          0,
          furnitureDark,
          {
            rounded: false,
            metalness: 0.32,
            roughness: 0.25,
          },
        );
        for (const kitchenBurnerX of [
          -width6 * 0.13,
          width6 * 0.13,
        ])
          for (const kitchenBurnerZ of [
            -depth * 0.14,
            depth * 0.14,
          ])
            (addCylinderMesh(
              itemModelNode,
              width6 * 0.06,
              width6 * 0.06,
              0.018,
              kitchenBurnerX,
              height6 + 0.028,
              kitchenBurnerZ,
              furnitureSoft,
              {
                segments: 28,
                metalness: 0.42,
                roughness: 0.26,
              },
            ),
              addCylinderMesh(
                itemModelNode,
                width6 * 0.025,
                width6 * 0.025,
                0.025,
                kitchenBurnerX,
                height6 + 0.045,
                kitchenBurnerZ,
                furnitureDark,
                {
                  segments: 24,
                  metalness: 0.5,
                  roughness: 0.22,
                },
              ));
      }
    }
    return true;
  } else if (modelItem.type === "fridge") {
    if (
      (addBoxMesh(
        itemModelNode,
        width6,
        height6,
        depth,
        0,
        height6 / 2,
        0,
        furnitureLight,
        {
          metalness: 0.18,
          roughness: 0.5,
        },
      ),
      modelItem.fridgeStyle === "double")
    ) {
      const fridgeDoorZ = depth * 0.5,
        fridgeDoorThickness = Math.min(
          0.025,
          depth * 0.04,
        );
      addBoxMesh(
        itemModelNode,
        width6 * 0.96,
        height6 * 0.96,
        fridgeDoorThickness,
        0,
        height6 * 0.5,
        fridgeDoorZ,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.65,
        },
      );
      for (const fridgeDoorSide of [-1, 1])
        (addBoxMesh(
          itemModelNode,
          width6 * 0.466,
          height6 * 0.945,
          fridgeDoorThickness,
          fridgeDoorSide * width6 * 0.239,
          height6 * 0.5,
          fridgeDoorZ +
            fridgeDoorThickness * 0.65,
          furnitureLight,
          {
            metalness: 0.22,
            roughness: 0.42,
          },
        ),
          addBoxMesh(
            itemModelNode,
            Math.min(0.018, width6 * 0.024),
            height6 * 0.3,
            0.028,
            fridgeDoorSide * width6 * 0.055,
            height6 * 0.56,
            fridgeDoorZ +
              fridgeDoorThickness * 1.3,
            furnitureDark,
            {
              metalness: 0.65,
              roughness: 0.3,
            },
          ));
    } else
      (addBoxMesh(
        itemModelNode,
        width6 * 0.88,
        0.018,
        depth * 1.01,
        0,
        height6 * 0.42,
        depth * 0.01,
        furnitureDark,
        {
          metalness: 0.5,
        },
      ),
        addBoxMesh(
          itemModelNode,
          0.025,
          height6 * 0.27,
          0.035,
          width6 * 0.35,
          height6 * 0.65,
          depth * 0.515,
          furnitureDark,
          {
            metalness: 0.7,
          },
        ));
    return true;
  } else if (modelItem.type === "storagewaterheater") {
    const waterheaterTankRadius = Math.min(
        depth * 0.43,
        height6 * 0.44,
      ),
      waterheaterTankY = height6 * 0.52;
    (addBoxMesh(
      itemModelNode,
      width6 * 0.78,
      height6 * 0.12,
      depth * 0.22,
      0,
      height6 * 0.1,
      -depth * 0.36,
      furnitureDark,
      {
        rounded: false,
        metalness: 0.55,
        roughness: 0.3,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        waterheaterTankRadius,
        waterheaterTankRadius,
        width6 * 0.82,
        0,
        waterheaterTankY,
        0,
        furnitureLight,
        {
          segments: 36,
          rotationZ: Math.PI / 2,
          metalness: 0.2,
          roughness: 0.42,
        },
      ));
    for (const waterheaterPipeX of [
      -width6 * 0.43,
      width6 * 0.43,
    ])
      addCylinderMesh(
        itemModelNode,
        waterheaterTankRadius * 1.03,
        waterheaterTankRadius * 1.03,
        0.025,
        waterheaterPipeX,
        waterheaterTankY,
        0,
        furnitureSoft,
        {
          segments: 36,
          rotationZ: Math.PI / 2,
          metalness: 0.28,
          roughness: 0.34,
        },
      );
    (addBoxMesh(
      itemModelNode,
      width6 * 0.31,
      height6 * 0.23,
      0.026,
      0,
      height6 * 0.51,
      depth * 0.44,
      furnitureDark,
      {
        rounded: false,
        metalness: 0.18,
        roughness: 0.25,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.16,
        height6 * 0.045,
        0.018,
        0,
        height6 * 0.58,
        depth * 0.46,
        7706534,
        {
          rounded: false,
          emissive: 7706534,
          emissiveIntensity: 0.18,
          roughness: 0.2,
        },
      ));
    for (const waterheaterLegX of [
      -width6 * 0.28,
      width6 * 0.28,
    ])
      (addCylinderMesh(
        itemModelNode,
        0.022,
        0.022,
        height6 * 0.16,
        waterheaterLegX,
        height6 * 0.08,
        depth * 0.12,
        waterheaterLegX < 0
          ? 4885698
          : 12868184,
        {
          segments: 18,
          metalness: 0.55,
          roughness: 0.24,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          0.04,
          0.04,
          0.028,
          waterheaterLegX,
          0.015,
          depth * 0.12,
          furnitureDark,
          {
            segments: 20,
            metalness: 0.45,
            roughness: 0.28,
          },
        ));
    return true;
  } else if (modelItem.type === "gaswaterheater") {
    const gasheaterBodyHeight =
      height6 * 0.82;
    (addBoxMesh(
      itemModelNode,
      width6,
      gasheaterBodyHeight,
      depth,
      0,
      height6 * 0.47,
      0,
      furnitureLight,
      {
        rounded: false,
        metalness: 0.12,
        roughness: 0.46,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.86,
        gasheaterBodyHeight * 0.42,
        0.026,
        0,
        height6 * 0.55,
        depth * 0.515,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.36,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.44,
        gasheaterBodyHeight * 0.18,
        0.018,
        0,
        height6 * 0.67,
        depth * 0.54,
        furnitureDark,
        {
          rounded: false,
          metalness: 0.14,
          roughness: 0.22,
        },
      ));
    for (
      let gasheaterGrilleIndex = 0;
      gasheaterGrilleIndex < 5;
      gasheaterGrilleIndex += 1
    )
      addBoxMesh(
        itemModelNode,
        width6 * 0.62,
        0.012,
        0.02,
        0,
        height6 *
          (0.24 +
            gasheaterGrilleIndex * 0.07),
        depth * 0.525,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.3,
        },
      );
    (addCylinderMesh(
      itemModelNode,
      depth * 0.17,
      depth * 0.17,
      height6 * 0.18,
      0,
      height6 * 0.91,
      0,
      furnitureDark,
      {
        segments: 24,
        metalness: 0.58,
        roughness: 0.24,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        depth * 0.22,
        depth * 0.22,
        0.035,
        0,
        height6 * 0.84,
        0,
        furnitureSoft,
        {
          segments: 24,
          metalness: 0.5,
          roughness: 0.25,
        },
      ));
    for (const [
      gasheaterKnobX,
      gasheaterKnobColor,
    ] of [
      [-width6 * 0.28, 4885698],
      [0, 9410205],
      [width6 * 0.28, 12868184],
    ])
      (addCylinderMesh(
        itemModelNode,
        0.018,
        0.018,
        height6 * 0.18,
        gasheaterKnobX,
        height6 * 0.09,
        depth * 0.12,
        gasheaterKnobColor,
        {
          segments: 18,
          metalness: 0.62,
          roughness: 0.22,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          0.034,
          0.034,
          0.025,
          gasheaterKnobX,
          0.014,
          depth * 0.12,
          furnitureDark,
          {
            segments: 18,
            metalness: 0.5,
            roughness: 0.25,
          },
        ));
    return true;
  }
  return false;
}

/**
 * 物品模型分派族：storage-lower。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildStorageLower(scope: ItemModelScope): boolean {
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

  if (modelItem.type === "sideboard") {
    const sideboardNominalHeight = Math.max(height6, 1.8),
      sideboardLowerBlockHeight = sideboardNominalHeight * 0.39,
      sideboardNicheHeight = sideboardNominalHeight * 0.22,
      sideboardNicheTop =
        sideboardLowerBlockHeight + sideboardNicheHeight,
      sideboardUpperBlockHeight =
        sideboardNominalHeight - sideboardNicheTop,
      sideboardDoorFrontColor = furnitureSoft,
      sideboardDoorPanelWidth = width6 * 0.31,
      sideboardLowerDoorHeight = sideboardLowerBlockHeight * 0.88,
      sideboardUpperDoorHeight = sideboardUpperBlockHeight * 0.86,
      sideboardCounterThickness = 0.045,
      sideboardCounterBottom =
        sideboardLowerBlockHeight - sideboardCounterThickness * 0.5,
      sideboardCounterTop =
        sideboardLowerBlockHeight + sideboardCounterThickness * 0.5;
    (addBoxMesh(
      itemModelNode,
      width6,
      sideboardCounterBottom,
      depth,
      0,
      sideboardCounterBottom * 0.5,
      0,
      furniture,
      {
        roughness: 0.58,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        0.045,
        depth,
        0,
        sideboardLowerBlockHeight,
        0,
        furnitureSoft,
        {
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        sideboardNicheTop - sideboardCounterTop,
        0.045,
        0,
        (sideboardCounterTop + sideboardNicheTop) * 0.5,
        -depth * 0.46,
        furniture,
        {
          rounded: false,
          roughness: 0.62,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        sideboardUpperBlockHeight,
        depth,
        0,
        sideboardNicheTop + sideboardUpperBlockHeight * 0.5,
        0,
        furniture,
        {
          roughness: 0.58,
        },
      ));
    for (const sideboardDoorOffset of [-0.33, 0, 0.33])
      (addBoxMesh(
        itemModelNode,
        sideboardDoorPanelWidth,
        sideboardLowerDoorHeight,
        0.026,
        width6 * sideboardDoorOffset,
        sideboardLowerBlockHeight * 0.48,
        depth * 0.515,
        sideboardDoorFrontColor,
        {
          rounded: false,
          roughness: 0.45,
        },
      ),
        addBoxMesh(
          itemModelNode,
          sideboardDoorPanelWidth,
          sideboardUpperDoorHeight,
          0.026,
          width6 * sideboardDoorOffset,
          sideboardNicheTop + sideboardUpperBlockHeight * 0.5,
          depth * 0.515,
          sideboardDoorFrontColor,
          {
            rounded: false,
            roughness: 0.45,
          },
        ));
    return true;
  } else if (modelItem.type === "shoecabinet") {
    const shoecabinetNominalHeight = Math.max(height6, 1.9),
      shoecabinetBoardColor = furnitureSoft,
      shoecabinetTopColor = furnitureSoft,
      shoecabinetLeftColumnWidth = width6 * 0.5,
      shoecabinetRightColumnWidth = width6 * 0.5,
      shoecabinetLeftColumnX = -width6 * 0.25,
      shoecabinetRightColumnX = width6 * 0.25,
      shoecabinetBenchBlockHeight =
        shoecabinetNominalHeight * 0.22,
      shoecabinetUpperBlockHeight =
        shoecabinetNominalHeight * 0.43,
      shoecabinetMidBlockHeight = shoecabinetNominalHeight * 0.21,
      shoecabinetTopBlockHeight = shoecabinetNominalHeight * 0.37;
    (addBoxMesh(
      itemModelNode,
      width6 * 0.98,
      shoecabinetNominalHeight * 0.93,
      0.045,
      0,
      shoecabinetNominalHeight * 0.48,
      -depth * 0.47,
      furniture,
      {
        rounded: false,
        roughness: 0.62,
      },
    ),
      addBoxMesh(
        itemModelNode,
        shoecabinetLeftColumnWidth,
        shoecabinetBenchBlockHeight * 0.56,
        depth * 0.92,
        shoecabinetLeftColumnX,
        shoecabinetBenchBlockHeight * 0.35,
        0,
        furniture,
        {
          roughness: 0.56,
        },
      ),
      addBoxMesh(
        itemModelNode,
        shoecabinetLeftColumnWidth * 1.02,
        0.055,
        depth * 1.04,
        shoecabinetLeftColumnX,
        shoecabinetBenchBlockHeight * 0.67,
        0,
        shoecabinetTopColor,
        {
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        shoecabinetRightColumnWidth,
        shoecabinetUpperBlockHeight,
        depth,
        shoecabinetRightColumnX,
        shoecabinetUpperBlockHeight * 0.5,
        0,
        furniture,
        {
          roughness: 0.58,
        },
      ));
    for (const shoecabinetBenchHandleOffset of [-0.245, 0.245])
      addBoxMesh(
        itemModelNode,
        shoecabinetRightColumnWidth * 0.47,
        shoecabinetUpperBlockHeight * 0.84,
        0.026,
        shoecabinetRightColumnX +
          shoecabinetRightColumnWidth *
            shoecabinetBenchHandleOffset,
        shoecabinetUpperBlockHeight * 0.48,
        depth * 0.515,
        shoecabinetBoardColor,
        {
          rounded: false,
          roughness: 0.45,
        },
      );
    const shoecabinetMidBlockY =
      shoecabinetNominalHeight -
      shoecabinetMidBlockHeight -
      0.045;
    addBoxMesh(
      itemModelNode,
      shoecabinetLeftColumnWidth,
      shoecabinetMidBlockHeight,
      depth,
      shoecabinetLeftColumnX,
      shoecabinetMidBlockY + shoecabinetMidBlockHeight * 0.5,
      0,
      furniture,
      {
        roughness: 0.58,
      },
    );
    for (const shoecabinetMidHandleOffset of [-0.245, 0.245])
      addBoxMesh(
        itemModelNode,
        shoecabinetLeftColumnWidth * 0.47,
        shoecabinetMidBlockHeight * 0.86,
        0.026,
        shoecabinetLeftColumnX +
          shoecabinetLeftColumnWidth * shoecabinetMidHandleOffset,
        shoecabinetMidBlockY + shoecabinetMidBlockHeight * 0.5,
        depth * 0.515,
        shoecabinetBoardColor,
        {
          rounded: false,
          roughness: 0.45,
        },
      );
    const shoecabinetTopBlockY =
      shoecabinetNominalHeight -
      shoecabinetTopBlockHeight -
      0.045;
    addBoxMesh(
      itemModelNode,
      shoecabinetRightColumnWidth,
      shoecabinetTopBlockHeight,
      depth,
      shoecabinetRightColumnX,
      shoecabinetTopBlockY + shoecabinetTopBlockHeight * 0.5,
      0,
      furniture,
      {
        roughness: 0.58,
      },
    );
    for (const shoecabinetTopHandleOffset of [-0.245, 0.245])
      addBoxMesh(
        itemModelNode,
        shoecabinetRightColumnWidth * 0.47,
        shoecabinetTopBlockHeight * 0.9,
        0.026,
        shoecabinetRightColumnX +
          shoecabinetRightColumnWidth *
            shoecabinetTopHandleOffset,
        shoecabinetTopBlockY + shoecabinetTopBlockHeight * 0.5,
        depth * 0.515,
        shoecabinetBoardColor,
        {
          rounded: false,
          roughness: 0.45,
        },
      );
    return true;
  } else if (modelItem.type === "cabinet") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6,
      depth,
      0,
      height6 / 2,
      0,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        0.018,
        height6 * 0.9,
        depth * 1.01,
        0,
        height6 * 0.52,
        depth * 0.01,
        furnitureDark,
      ),
      addBoxMesh(
        itemModelNode,
        0.025,
        0.16,
        0.035,
        -0.08,
        height6 * 0.55,
        depth * 0.515,
        furnitureLight,
        {
          metalness: 0.55,
        },
      ),
      addBoxMesh(
        itemModelNode,
        0.025,
        0.16,
        0.035,
        0.08,
        height6 * 0.55,
        depth * 0.515,
        furnitureLight,
        {
          metalness: 0.55,
        },
      ));
    return true;
  } else if (modelItem.type === "glasscabinet") {
    const glasscabinetFrameThickness = Math.min(
        Math.max(Math.min(width6, depth) * 0.1, 0.032),
        0.058,
      ),
      glasscabinetBackThickness = Math.min(
        Math.max(depth * 0.075, 0.018),
        0.032,
      ),
      glasscabinetMullionWidth = Math.min(
        Math.max(width6 * 0.014, 0.016),
        0.03,
      ),
      glasscabinetInnerWidth = Math.max(
        width6 - glasscabinetFrameThickness * 2,
        width6 * 0.7,
      ),
      glasscabinetLowerRatio = 0.13,
      glasscabinetTowerRatio = 0.3,
      glasscabinetShelfCount = 4,
      glasscabinetLowerShelfY =
        height6 * glasscabinetLowerRatio,
      glasscabinetTowerBaseY =
        height6 * glasscabinetTowerRatio,
      glasscabinetTowerHeight =
        height6 -
        glasscabinetFrameThickness -
        glasscabinetTowerBaseY,
      glasscabinetShelfSpacing =
        glasscabinetTowerHeight / glasscabinetShelfCount,
      glasscabinetColumnRatios = [0.56, 0.24, 0.2],
      glasscabinetColumnOffsets = [
        0,
        glasscabinetColumnRatios[0],
        glasscabinetColumnRatios[0] +
          glasscabinetColumnRatios[1],
      ],
      slice = glasscabinetColumnOffsets.slice(1),
      glasscabinetDoorGap = Math.max(width6 * 0.005, 0.005),
      glasscabinetFrontZ = depth * 0.5 + 0.012,
      glasscabinetFrameOptions = {
        rounded: false,
        roughness: 0.62,
        metalness: 0.015,
      },
      glasscabinetShelfOptions = {
        rounded: false,
        roughness: 0.48,
        metalness: 0.035,
      },
      glasscabinetGlassOptions = {
        rounded: false,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: ns2.DoubleSide,
        roughness: 0.08,
        metalness: 0.08,
        castShadow: false,
        receiveShadow: false,
        renderOrder: 7,
      },
      glasscabinetHighlightOptions = {
        rounded: false,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 0.12,
        metalness: 0,
        castShadow: false,
        receiveShadow: false,
        renderOrder: 8,
      };
    (addBoxMesh(
      itemModelNode,
      glasscabinetFrameThickness,
      height6,
      depth,
      -width6 * 0.5 + glasscabinetFrameThickness * 0.5,
      height6 * 0.5,
      0,
      furniture,
      glasscabinetFrameOptions,
    ),
      addBoxMesh(
        itemModelNode,
        glasscabinetFrameThickness,
        height6,
        depth,
        width6 * 0.5 - glasscabinetFrameThickness * 0.5,
        height6 * 0.5,
        0,
        furniture,
        glasscabinetFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        height6,
        glasscabinetBackThickness + 0.004,
        0,
        height6 * 0.5,
        -depth * 0.5 +
          glasscabinetBackThickness * 0.5 -
          0.002,
        furniture,
        glasscabinetFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        glasscabinetFrameThickness,
        depth,
        0,
        height6 - glasscabinetFrameThickness * 0.5,
        0,
        furniture,
        glasscabinetFrameOptions,
      ));
    for (
      let glasscabinetShelfIndex = 0;
      glasscabinetShelfIndex < glasscabinetShelfCount;
      glasscabinetShelfIndex += 1
    )
      addBoxMesh(
        itemModelNode,
        glasscabinetInnerWidth,
        glasscabinetFrameThickness * 0.72,
        depth * 0.9,
        0,
        glasscabinetTowerBaseY +
          glasscabinetShelfSpacing * glasscabinetShelfIndex,
        -depth * 0.025,
        furnitureSoft,
        glasscabinetFrameOptions,
      );
    addBoxMesh(
      itemModelNode,
      glasscabinetInnerWidth,
      glasscabinetFrameThickness * 0.72,
      depth * 0.9,
      0,
      glasscabinetLowerShelfY,
      -depth * 0.025,
      furnitureSoft,
      glasscabinetFrameOptions,
    );
    for (const glasscabinetDividerRatio of slice) {
      const glasscabinetDividerX =
        -glasscabinetInnerWidth * 0.5 +
        glasscabinetInnerWidth * glasscabinetDividerRatio;
      addBoxMesh(
        itemModelNode,
        glasscabinetFrameThickness * 0.72,
        height6 - glasscabinetFrameThickness,
        depth * 0.9,
        glasscabinetDividerX,
        (height6 - glasscabinetFrameThickness) * 0.5,
        -depth * 0.025,
        furniture,
        glasscabinetFrameOptions,
      );
    }
    const glasscabinetTowerGlassHeight =
        glasscabinetTowerBaseY -
        glasscabinetLowerShelfY -
        glasscabinetFrameThickness * 0.9,
      glasscabinetDoorWidths = [
        glasscabinetInnerWidth * glasscabinetColumnRatios[0],
        glasscabinetInnerWidth *
          (1 - glasscabinetColumnRatios[0]),
      ];
    let glasscabinetDoorCursor =
      -glasscabinetInnerWidth * 0.5;
    for (
      let glasscabinetDoorIndex = 0;
      glasscabinetDoorIndex < glasscabinetDoorWidths.length;
      glasscabinetDoorIndex += 1
    ) {
      const glasscabinetDoorWidth =
          glasscabinetDoorWidths[glasscabinetDoorIndex] -
          glasscabinetDoorGap,
        glasscabinetDoorX =
          glasscabinetDoorCursor +
          glasscabinetDoorWidths[glasscabinetDoorIndex] * 0.5;
      (addBoxMesh(
        itemModelNode,
        glasscabinetDoorWidth,
        glasscabinetTowerGlassHeight,
        0.03,
        glasscabinetDoorX,
        glasscabinetLowerShelfY +
          (glasscabinetTowerBaseY - glasscabinetLowerShelfY) *
            0.5,
        glasscabinetFrontZ,
        glasscabinetDoorIndex ? furnitureSoft : furniture,
        {
          ...glasscabinetShelfOptions,
          roughness: 0.56,
        },
      ),
        (glasscabinetDoorCursor +=
          glasscabinetDoorWidths[glasscabinetDoorIndex]));
    }
    for (
      let glasscabinetColumnIndex = 0;
      glasscabinetColumnIndex <
      glasscabinetColumnRatios.length;
      glasscabinetColumnIndex += 1
    ) {
      const glasscabinetColumnX =
          -glasscabinetInnerWidth * 0.5 +
          glasscabinetInnerWidth *
            glasscabinetColumnOffsets[
              glasscabinetColumnIndex
            ],
        glasscabinetColumnWidth =
          glasscabinetInnerWidth *
          glasscabinetColumnRatios[glasscabinetColumnIndex],
        glasscabinetColumnCenterX =
          glasscabinetColumnX + glasscabinetColumnWidth * 0.5,
        glasscabinetWindowWidth = Math.max(
          glasscabinetColumnWidth -
            glasscabinetMullionWidth * 1.65,
          glasscabinetColumnWidth * 0.76,
        ),
        glasscabinetWindowHeight = Math.max(
          glasscabinetTowerHeight -
            glasscabinetMullionWidth * 1.55,
          glasscabinetTowerHeight * 0.86,
        );
      (addBoxMesh(
        itemModelNode,
        glasscabinetWindowWidth,
        glasscabinetWindowHeight,
        0.018,
        glasscabinetColumnCenterX,
        glasscabinetTowerBaseY +
          glasscabinetTowerHeight * 0.5,
        glasscabinetFrontZ,
        yt4.glass,
        glasscabinetGlassOptions,
      ),
        addBoxMesh(
          itemModelNode,
          glasscabinetMullionWidth,
          glasscabinetTowerHeight,
          0.032,
          glasscabinetColumnX +
            glasscabinetMullionWidth * 0.5,
          glasscabinetTowerBaseY +
            glasscabinetTowerHeight * 0.5,
          glasscabinetFrontZ + 0.009,
          furniture,
          glasscabinetShelfOptions,
        ),
        glasscabinetColumnIndex ===
          glasscabinetColumnRatios.length - 1 &&
          addBoxMesh(
            itemModelNode,
            glasscabinetMullionWidth,
            glasscabinetTowerHeight,
            0.032,
            glasscabinetColumnX +
              glasscabinetColumnWidth -
              glasscabinetMullionWidth * 0.5,
            glasscabinetTowerBaseY +
              glasscabinetTowerHeight * 0.5,
            glasscabinetFrontZ + 0.009,
            furniture,
            glasscabinetShelfOptions,
          ));
      const glasscabinetHandleWidth = Math.max(
        glasscabinetWindowWidth * 0.025,
        0.007,
      );
      (addBoxMesh(
        itemModelNode,
        glasscabinetHandleWidth,
        glasscabinetWindowHeight * 0.88,
        0.006,
        glasscabinetColumnCenterX -
          glasscabinetWindowWidth * 0.37,
        glasscabinetTowerBaseY +
          glasscabinetTowerHeight * 0.52,
        glasscabinetFrontZ + 0.014,
        14282227,
        glasscabinetHighlightOptions,
      ),
        addBoxMesh(
          itemModelNode,
          glasscabinetWindowWidth * 0.34,
          Math.max(glasscabinetMullionWidth * 0.11, 0.004),
          0.006,
          glasscabinetColumnCenterX -
            glasscabinetWindowWidth * 0.18,
          glasscabinetTowerBaseY +
            glasscabinetTowerHeight * 0.88,
          glasscabinetFrontZ + 0.014,
          15267578,
          glasscabinetHighlightOptions,
        ));
    }
    (addBoxMesh(
      itemModelNode,
      glasscabinetInnerWidth,
      glasscabinetMullionWidth,
      0.032,
      0,
      glasscabinetTowerBaseY + glasscabinetMullionWidth * 0.5,
      glasscabinetFrontZ + 0.009,
      furniture,
      glasscabinetShelfOptions,
    ),
      addBoxMesh(
        itemModelNode,
        glasscabinetInnerWidth,
        glasscabinetMullionWidth,
        0.032,
        0,
        height6 -
          glasscabinetFrameThickness -
          glasscabinetMullionWidth * 0.5,
        glasscabinetFrontZ + 0.009,
        furniture,
        glasscabinetShelfOptions,
      ));
    const glasscabinetBottleColors = [
        14736852,
        13025203,
        10327434,
        7301474,
        furnitureSoft,
        furnitureLight,
      ],
      glasscabinetBottleRow = (
        glasscabinetBottleColumnIndex: any,
        glasscabinetBottleRowIndex: any,
        glasscabinetBottleCount = 5,
        glasscabinetBottleSeed = 0,
      ) => {
        const glasscabinetBottleZoneWidth =
            glasscabinetInnerWidth *
            glasscabinetColumnRatios[
              glasscabinetBottleColumnIndex
            ],
          glasscabinetBottleZoneX =
            -glasscabinetInnerWidth * 0.5 +
            glasscabinetInnerWidth *
              glasscabinetColumnOffsets[
                glasscabinetBottleColumnIndex
              ],
          glasscabinetBottleBaseY =
            glasscabinetTowerBaseY +
            glasscabinetShelfSpacing *
              glasscabinetBottleRowIndex +
            glasscabinetFrameThickness * 0.42,
          glasscabinetBottleGap = Math.max(
            glasscabinetBottleZoneWidth * 0.022,
            0.004,
          ),
          glasscabinetBottleWidth =
            (glasscabinetBottleZoneWidth * 0.72 -
              glasscabinetBottleGap *
                (glasscabinetBottleCount - 1)) /
            glasscabinetBottleCount;
        let glasscabinetBottleCursor =
          glasscabinetBottleZoneX +
          glasscabinetBottleZoneWidth * 0.13;
        for (
          let glasscabinetBottleIndex = 0;
          glasscabinetBottleIndex < glasscabinetBottleCount;
          glasscabinetBottleIndex += 1
        ) {
          const glasscabinetBottleEachWidth =
              glasscabinetBottleWidth *
              [0.8, 1.05, 0.9, 0.72, 0.96][
                (glasscabinetBottleIndex +
                  glasscabinetBottleSeed) %
                  5
              ],
            glasscabinetBottleEachHeight =
              glasscabinetShelfSpacing *
              [0.48, 0.58, 0.52, 0.64, 0.55][
                (glasscabinetBottleIndex * 2 +
                  glasscabinetBottleSeed) %
                  5
              ];
          (addBoxMesh(
            itemModelNode,
            glasscabinetBottleEachWidth,
            glasscabinetBottleEachHeight,
            depth * 0.42,
            glasscabinetBottleCursor +
              glasscabinetBottleEachWidth * 0.5,
            glasscabinetBottleBaseY +
              glasscabinetBottleEachHeight * 0.5,
            depth * 0.12,
            glasscabinetBottleColors[
              (glasscabinetBottleIndex +
                glasscabinetBottleSeed) %
                glasscabinetBottleColors.length
            ],
            {
              radius: Math.min(
                glasscabinetBottleEachWidth * 0.12,
                0.009,
              ),
              roughness: 0.78,
              metalness: 0,
            },
          ),
            (glasscabinetBottleCursor +=
              glasscabinetBottleEachWidth +
              glasscabinetBottleGap));
        }
      },
      glasscabinetPlatterRow = (
        glasscabinetPlatterColumnIndex: any,
        glasscabinetPlatterRowIndex: any,
        glasscabinetPlatterCount = 3,
        glasscabinetPlatterSeed = 0,
      ) => {
        const glasscabinetPlatterZoneWidth =
            glasscabinetInnerWidth *
            glasscabinetColumnRatios[
              glasscabinetPlatterColumnIndex
            ],
          glasscabinetPlatterZoneX =
            -glasscabinetInnerWidth * 0.5 +
            glasscabinetInnerWidth *
              glasscabinetColumnOffsets[
                glasscabinetPlatterColumnIndex
              ] +
            glasscabinetPlatterZoneWidth * 0.5,
          glasscabinetPlatterBaseY =
            glasscabinetTowerBaseY +
            glasscabinetShelfSpacing *
              glasscabinetPlatterRowIndex +
            glasscabinetFrameThickness * 0.42;
        for (
          let glasscabinetPlatterIndex = 0;
          glasscabinetPlatterIndex < glasscabinetPlatterCount;
          glasscabinetPlatterIndex += 1
        )
          addBoxMesh(
            itemModelNode,
            glasscabinetPlatterZoneWidth * 0.56,
            glasscabinetFrameThickness * 0.48,
            depth * 0.4,
            glasscabinetPlatterZoneX,
            glasscabinetPlatterBaseY +
              glasscabinetFrameThickness *
                (0.3 + glasscabinetPlatterIndex * 0.52),
            depth * 0.12,
            glasscabinetBottleColors[
              (glasscabinetPlatterIndex +
                glasscabinetPlatterSeed) %
                glasscabinetBottleColors.length
            ],
            {
              radius: 0.006,
              roughness: 0.78,
              metalness: 0,
            },
          );
      };
    (glasscabinetBottleRow(0, 1, 7, 0),
      glasscabinetBottleRow(2, 2, 4, 2),
      glasscabinetPlatterRow(0, 0, 3, 2),
      glasscabinetPlatterRow(1, 2, 3, 4));
    for (const [
      glasscabinetJarColumnIndex,
      glasscabinetJarRowIndex,
      glasscabinetJarScale,
      glasscabinetJarColor,
    ] of [
      [1, 1, 0.16, 12169895],
      [0, 2, 0.075, 9406334],
      [2, 3, 0.14, 13749184],
    ]) {
      const glasscabinetJarZoneWidth =
          glasscabinetInnerWidth *
          glasscabinetColumnRatios[
            glasscabinetJarColumnIndex
          ],
        glasscabinetJarX =
          -glasscabinetInnerWidth * 0.5 +
          glasscabinetInnerWidth *
            glasscabinetColumnOffsets[
              glasscabinetJarColumnIndex
            ] +
          glasscabinetJarZoneWidth * 0.5,
        glasscabinetJarY =
          glasscabinetTowerBaseY +
          glasscabinetShelfSpacing * glasscabinetJarRowIndex +
          glasscabinetFrameThickness * 0.42;
      addCylinderMesh(
        itemModelNode,
        glasscabinetJarZoneWidth *
          glasscabinetJarScale *
          0.72,
        glasscabinetJarZoneWidth * glasscabinetJarScale,
        glasscabinetShelfSpacing * 0.46,
        glasscabinetJarX,
        glasscabinetJarY + glasscabinetShelfSpacing * 0.23,
        depth * 0.12,
        glasscabinetJarColor,
        {
          segments: 24,
          roughness: 0.68,
        },
      );
    }
    return true;
  }
  return false;
}

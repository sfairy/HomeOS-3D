/**
 * 物品模型分派族：storage-upper。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh } from "../studio-mesh-primitives";
import { buildPillarSolidGeometry as buildPillarSolidGeometry2, normalizePillarShape as normalizePillarShape2 } from "../studio-item-posture";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { setWallGradientHeight as setWallGradientHeight2 } from "../../../materials/studio-wall-materials";
import type { ItemModelScope } from "./types";

export function buildStorageUpper(scope: ItemModelScope): boolean {
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

  if (modelItem.type === "bookcase") {
    const bookcaseFrameThickness = Math.min(
        Math.max(Math.min(width6, depth) * 0.11, 0.032),
        0.062,
      ),
      bookcaseBackThickness = Math.min(
        Math.max(depth * 0.075, 0.018),
        0.032,
      ),
      bookcaseInnerWidth = Math.max(
        width6 - bookcaseFrameThickness * 2,
        width6 * 0.72,
      ),
      bookcaseUpperRatio = 0.255,
      bookcaseShelfRatios = [
        bookcaseUpperRatio,
        0.47,
        0.59,
        0.79,
      ],
      bookcaseTopInnerY =
        height6 - bookcaseFrameThickness * 0.5,
      bookcaseWingWidth = bookcaseInnerWidth * 0.27,
      bookcaseLeftWingX =
        width6 * 0.5 -
        bookcaseFrameThickness * 1.5 -
        bookcaseWingWidth,
      bookcaseRightBayWidth =
        bookcaseInnerWidth -
        bookcaseWingWidth -
        bookcaseFrameThickness,
      bookcaseRightBayX =
        -bookcaseInnerWidth * 0.5 +
        bookcaseRightBayWidth * 0.5,
      bookcaseRightBayCenterX =
        bookcaseInnerWidth * 0.5 - bookcaseWingWidth * 0.5,
      bookcaseFrameOptions = {
        rounded: false,
        roughness: 0.62,
        metalness: 0.015,
      },
      bookcaseFrontZ = depth * 0.5 + 0.013;
    (addBoxMesh(
      itemModelNode,
      bookcaseFrameThickness,
      height6,
      depth,
      -width6 * 0.5 + bookcaseFrameThickness * 0.5,
      height6 * 0.5,
      0,
      furniture,
      bookcaseFrameOptions,
    ),
      addBoxMesh(
        itemModelNode,
        bookcaseFrameThickness,
        height6,
        depth,
        width6 * 0.5 - bookcaseFrameThickness * 0.5,
        height6 * 0.5,
        0,
        furniture,
        bookcaseFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        height6,
        bookcaseBackThickness + 0.004,
        0,
        height6 * 0.5,
        -depth * 0.5 + bookcaseBackThickness * 0.5 - 0.002,
        furniture,
        bookcaseFrameOptions,
      ),
      addBoxMesh(
        itemModelNode,
        bookcaseInnerWidth,
        height6 * bookcaseUpperRatio -
          bookcaseFrameThickness * 0.5,
        depth * 0.9,
        0,
        height6 * bookcaseUpperRatio * 0.5,
        -depth * 0.025,
        furnitureSoft,
        {
          ...bookcaseFrameOptions,
          roughness: 0.66,
        },
      ));
    for (const bookcaseShelfRatio of bookcaseShelfRatios)
      addBoxMesh(
        itemModelNode,
        bookcaseInnerWidth,
        bookcaseFrameThickness,
        depth,
        0,
        height6 * bookcaseShelfRatio,
        0,
        furnitureSoft,
        bookcaseFrameOptions,
      );
    addBoxMesh(
      itemModelNode,
      width6,
      bookcaseFrameThickness,
      depth,
      0,
      bookcaseTopInnerY,
      0,
      furniture,
      bookcaseFrameOptions,
    );
    const bookcaseMidRailBottom =
        height6 * bookcaseShelfRatios[1] +
        bookcaseFrameThickness * 0.5,
      bookcaseMidRailTop = height6 - bookcaseFrameThickness;
    addBoxMesh(
      itemModelNode,
      bookcaseFrameThickness,
      bookcaseMidRailTop - bookcaseMidRailBottom,
      depth,
      bookcaseLeftWingX,
      (bookcaseMidRailTop + bookcaseMidRailBottom) * 0.5,
      0,
      furniture,
      bookcaseFrameOptions,
    );
    const bookcaseDividerCount = 3,
      bookcaseDividerWidth = bookcaseFrameThickness * 0.72,
      bookcaseDividerTopY =
        height6 * bookcaseUpperRatio -
        bookcaseFrameThickness * 0.5,
      bookcaseDividerHeight = Math.max(
        bookcaseDividerTopY - bookcaseDividerWidth,
        height6 * 0.16,
      ),
      bookcaseDividerGap = Math.max(width6 * 0.008, 0.008),
      bookcaseDividerOffsetX = -bookcaseInnerWidth * 0.18,
      bookcaseLeftDividerWidth =
        bookcaseDividerOffsetX +
        bookcaseInnerWidth * 0.5 -
        bookcaseDividerGap * 0.5,
      bookcaseRightDividerWidth =
        bookcaseInnerWidth -
        bookcaseLeftDividerWidth -
        bookcaseDividerGap,
      bookcaseDividerEachHeight =
        (bookcaseDividerHeight -
          bookcaseDividerGap * (bookcaseDividerCount - 1)) /
        bookcaseDividerCount;
    for (
      let bookcaseDividerIndex = 0;
      bookcaseDividerIndex < bookcaseDividerCount;
      bookcaseDividerIndex += 1
    ) {
      const bookcaseDividerY =
        bookcaseDividerWidth +
        bookcaseDividerEachHeight * 0.5 +
        bookcaseDividerIndex *
          (bookcaseDividerEachHeight + bookcaseDividerGap);
      (addBoxMesh(
        itemModelNode,
        bookcaseLeftDividerWidth,
        bookcaseDividerEachHeight,
        0.026,
        -bookcaseInnerWidth * 0.5 +
          bookcaseLeftDividerWidth * 0.5,
        bookcaseDividerY,
        bookcaseFrontZ,
        furniture,
        {
          ...bookcaseFrameOptions,
          roughness: 0.55,
        },
      ),
        addBoxMesh(
          itemModelNode,
          bookcaseRightDividerWidth,
          bookcaseDividerEachHeight,
          0.026,
          bookcaseDividerOffsetX +
            bookcaseDividerGap * 0.5 +
            bookcaseRightDividerWidth * 0.5,
          bookcaseDividerY,
          bookcaseFrontZ,
          furnitureSoft,
          {
            ...bookcaseFrameOptions,
            roughness: 0.55,
          },
        ));
    }
    const bookcaseBackBraceHeight =
      height6 *
        (bookcaseShelfRatios[2] - bookcaseShelfRatios[1]) -
      bookcaseFrameThickness * 1.15;
    addBoxMesh(
      itemModelNode,
      bookcaseRightBayWidth * 0.97,
      bookcaseBackBraceHeight,
      0.028,
      bookcaseRightBayX,
      height6 *
        (bookcaseShelfRatios[1] + bookcaseShelfRatios[2]) *
        0.5,
      bookcaseFrontZ,
      furniture,
      {
        ...bookcaseFrameOptions,
        roughness: 0.54,
      },
    );
    const bookcaseBookColors = [
        14276045,
        12499117,
        10459536,
        7828334,
        furnitureLight,
        furnitureSoft,
      ],
      bookcaseBookRow = ({
        startX: bookcaseRowStartX,
        maxWidth: bookcaseRowMaxWidth,
        shelfY: bookcaseRowShelfY,
        availableHeight: bookcaseRowHeight,
        count: bookcaseRowCount = 6,
        seed: bookcaseRowSeed = 0,
      }: any) => {
        const bookcaseBookGap = Math.max(
            bookcaseRowMaxWidth * 0.018,
            0.006,
          ),
          bookcaseBookWidth = Math.max(
            (bookcaseRowMaxWidth -
              bookcaseBookGap * (bookcaseRowCount + 1)) /
              bookcaseRowCount,
            0.026,
          );
        let bookcaseBookCursor =
          bookcaseRowStartX + bookcaseBookGap;
        for (
          let bookcaseBookIndex = 0;
          bookcaseBookIndex < bookcaseRowCount;
          bookcaseBookIndex += 1
        ) {
          const bookcaseBookWidthRatio = [
              0.72, 0.9, 0.78, 1.04, 0.82, 0.68,
            ][(bookcaseBookIndex + bookcaseRowSeed) % 6],
            bookcaseBookWidthValue =
              bookcaseBookWidth * bookcaseBookWidthRatio,
            bookcaseBookHeightRatio = [
              0.72, 0.88, 0.78, 0.94, 0.82, 0.68,
            ][
              (bookcaseBookIndex * 2 + bookcaseRowSeed) % 6
            ],
            bookcaseBookHeightValue =
              bookcaseRowHeight * bookcaseBookHeightRatio;
          if (
            bookcaseBookCursor + bookcaseBookWidthValue >
            bookcaseRowStartX +
              bookcaseRowMaxWidth -
              bookcaseBookGap
          )
            break;
          const bookcaseBookMesh = addBoxMesh(
            itemModelNode,
            bookcaseBookWidthValue,
            bookcaseBookHeightValue,
            depth *
              (0.47 +
                ((bookcaseBookIndex + bookcaseRowSeed) %
                  3) *
                  0.045),
            bookcaseBookCursor +
              bookcaseBookWidthValue * 0.5,
            bookcaseRowShelfY +
              bookcaseBookHeightValue * 0.5,
            depth * 0.15,
            bookcaseBookColors[
              (bookcaseBookIndex + bookcaseRowSeed) %
                bookcaseBookColors.length
            ],
            {
              radius: Math.min(
                bookcaseBookWidthValue * 0.14,
                0.012,
              ),
              roughness: 0.78,
              metalness: 0,
            },
          );
          (bookcaseBookIndex === bookcaseRowCount - 1 &&
            bookcaseRowSeed % 2 === 1 &&
            (bookcaseBookMesh.rotation.z = -0.07),
            (bookcaseBookCursor +=
              bookcaseBookWidthValue + bookcaseBookGap));
        }
      },
      bookcaseJarRow = (
        bookcaseJarX: any,
        bookcaseJarY: any,
        bookcaseJarWidth: any,
        bookcaseJarCount = 3,
        bookcaseJarSeed = 0,
      ) => {
        for (
          let bookcaseJarIndex = 0;
          bookcaseJarIndex < bookcaseJarCount;
          bookcaseJarIndex += 1
        )
          addBoxMesh(
            itemModelNode,
            bookcaseJarWidth,
            bookcaseFrameThickness * 0.54,
            depth * 0.48,
            bookcaseJarX,
            bookcaseJarY +
              bookcaseFrameThickness *
                (0.38 + bookcaseJarIndex * 0.56),
            depth * 0.15,
            bookcaseBookColors[
              (bookcaseJarIndex + bookcaseJarSeed) %
                bookcaseBookColors.length
            ],
            {
              radius: 0.007,
              roughness: 0.78,
              metalness: 0,
            },
          );
      },
      bookcaseFirstShelfY =
        height6 * bookcaseShelfRatios[0] +
        bookcaseFrameThickness * 0.5;
    (bookcaseBookRow({
      startX: -bookcaseInnerWidth * 0.47,
      maxWidth: bookcaseInnerWidth * 0.29,
      shelfY: bookcaseFirstShelfY,
      availableHeight: height6 * 0.15,
      count: 5,
      seed: 2,
    }),
      bookcaseBookRow({
        startX: bookcaseInnerWidth * 0.04,
        maxWidth: bookcaseInnerWidth * 0.38,
        shelfY: bookcaseFirstShelfY,
        availableHeight: height6 * 0.16,
        count: 7,
        seed: 4,
      }));
    const bookcaseSecondShelfY =
      height6 * bookcaseShelfRatios[1] +
      bookcaseFrameThickness * 0.5;
    bookcaseBookRow({
      startX:
        bookcaseLeftWingX + bookcaseFrameThickness * 0.6,
      maxWidth: bookcaseWingWidth * 0.82,
      shelfY: bookcaseSecondShelfY,
      availableHeight: height6 * 0.075,
      count: 4,
      seed: 1,
    });
    const bookcaseThirdShelfY =
      height6 * bookcaseShelfRatios[2] +
      bookcaseFrameThickness * 0.5;
    (bookcaseBookRow({
      startX: -bookcaseInnerWidth * 0.47,
      maxWidth: bookcaseRightBayWidth * 0.42,
      shelfY: bookcaseThirdShelfY,
      availableHeight: height6 * 0.14,
      count: 6,
      seed: 0,
    }),
      addBoxMesh(
        itemModelNode,
        bookcaseRightBayWidth * 0.17,
        height6 * 0.12,
        0.022,
        bookcaseRightBayX + bookcaseRightBayWidth * 0.27,
        bookcaseThirdShelfY + height6 * 0.065,
        depth * 0.22,
        11972517,
        {
          rounded: false,
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        bookcaseRightBayWidth * 0.125,
        height6 * 0.085,
        0.026,
        bookcaseRightBayX + bookcaseRightBayWidth * 0.27,
        bookcaseThirdShelfY + height6 * 0.065,
        depth * 0.235,
        7762283,
        {
          rounded: false,
          roughness: 0.42,
        },
      ),
      bookcaseJarRow(
        bookcaseRightBayCenterX,
        bookcaseThirdShelfY,
        bookcaseWingWidth * 0.48,
        3,
        3,
      ));
    const bookcaseFourthShelfY =
      height6 * bookcaseShelfRatios[3] +
      bookcaseFrameThickness * 0.5;
    (bookcaseJarRow(
      bookcaseRightBayX - bookcaseRightBayWidth * 0.22,
      bookcaseFourthShelfY,
      bookcaseRightBayWidth * 0.24,
      2,
      1,
    ),
      addCylinderMesh(
        itemModelNode,
        bookcaseRightBayWidth * 0.055,
        bookcaseRightBayWidth * 0.075,
        height6 * 0.12,
        bookcaseRightBayX - bookcaseRightBayWidth * 0.08,
        bookcaseFourthShelfY + height6 * 0.06,
        depth * 0.12,
        5196615,
        {
          segments: 22,
          roughness: 0.66,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        bookcaseRightBayWidth * 0.045,
        bookcaseRightBayWidth * 0.064,
        height6 * 0.15,
        bookcaseRightBayX + bookcaseRightBayWidth * 0.08,
        bookcaseFourthShelfY + height6 * 0.075,
        depth * 0.12,
        6643802,
        {
          segments: 22,
          roughness: 0.66,
        },
      ),
      bookcaseJarRow(
        bookcaseRightBayCenterX,
        bookcaseFourthShelfY,
        bookcaseWingWidth * 0.5,
        2,
        4,
      ));
    return true;
  } else if (modelItem.type === "shelf") {
    const shelfPostSize = Math.min(
        Math.max(Math.min(width6, depth) * 0.07, 0.028),
        0.052,
      ),
      shelfBoardThickness = Math.min(
        Math.max(height6 * 0.022, 0.028),
        0.052,
      ),
      shelfBoardDepth = Math.max(
        depth - shelfPostSize * 1.4,
        depth * 0.78,
      ),
      shelfPostOptions = {
        rounded: false,
        metalness: 0.62,
        roughness: 0.28,
      },
      shelfBoardOptions = {
        rounded: false,
        metalness: 0.18,
        roughness: 0.48,
      };
    for (const shelfPostX of [
      -width6 * 0.5 + shelfPostSize * 0.5,
      width6 * 0.5 - shelfPostSize * 0.5,
    ])
      for (const shelfPostZ of [
        -depth * 0.5 + shelfPostSize * 0.5,
        depth * 0.5 - shelfPostSize * 0.5,
      ])
        addBoxMesh(
          itemModelNode,
          shelfPostSize,
          height6,
          shelfPostSize,
          shelfPostX,
          height6 * 0.5,
          shelfPostZ,
          furniture,
          shelfPostOptions,
        );
    for (const shelfHeightRatio of [
      0.04, 0.26, 0.49, 0.72, 0.96,
    ])
      (addBoxMesh(
        itemModelNode,
        width6,
        shelfBoardThickness,
        shelfBoardDepth,
        0,
        height6 * shelfHeightRatio,
        0,
        shelfHeightRatio === 0.96
          ? furnitureLight
          : furnitureSoft,
        shelfBoardOptions,
      ),
        addBoxMesh(
          itemModelNode,
          width6,
          shelfPostSize * 0.65,
          shelfPostSize,
          0,
          height6 * shelfHeightRatio,
          -depth * 0.5 + shelfPostSize * 0.5,
          furniture,
          shelfPostOptions,
        ));
    const shelfClearWidth = Math.max(
        width6 - shelfPostSize * 2,
        shelfPostSize,
      ),
      shelfTotalHeight = height6 * 0.84,
      hypot3 = Math.hypot(
        shelfClearWidth,
        shelfTotalHeight,
      );
    for (const shelfBraceSign of [-1, 1]) {
      const shelfDiagonalBrace = addBoxMesh(
        itemModelNode,
        shelfPostSize * 0.48,
        hypot3,
        shelfPostSize * 0.42,
        0,
        height6 * 0.5,
        -depth * 0.5 + shelfPostSize * 0.18,
        furniture,
        {
          ...shelfPostOptions,
          castShadow: false,
        },
      );
      shelfDiagonalBrace.rotation.z =
        shelfBraceSign *
        Math.atan2(shelfClearWidth, shelfTotalHeight);
    }
    return true;
  } else if (modelItem.type === "pillar") {
    /**
     * 方柱是**闭合盒子**、`createWallSideMaterial` 又是 `DoubleSide` + `depthWrite: false`：
     * 同一个像素会先后叠到近面与远面两层，所以每层直接用 `wallOpacity`，
     * 叠出来的浓度正好等于墙面的膜厚（`1 - (1 - wallOpacity)²`，与 `wallFilmOpacity` 同值）。
     *
     * 旧值 `min(wallOpacity * 1.75, 0.55)` 是「把盒子当成单层面片」估出来的：两层叠完是
     * 0.80，比墙（0.59）浓一大截，配墙后柱体成了画面里最实的一块。
     * 异形柱（GLB）是单面实体，那一侧取 `wallFilmOpacity`，两条路径因此落到同一个浓度。
     */
    const pillarWallOpacity = yt4.wallOpacity,
      hg2 = createWallSideMaterial(
        yt4.wall,
        pillarWallOpacity,
        {
          depthWrite: false,
          depthFunc: ns2.LessDepth,
        },
      ),
      fg2 = createWallTopMaterial(
        yt4.wall,
        pillarWallOpacity,
        {
          topColor: yt4.wallTop ?? yt4.wall,
        },
      ),
      pillarShape = normalizePillarShape2(
        modelItem.pillarShape,
      ),
      pillarGeometry =
        pillarShape === "square"
          ? new ns2.BoxGeometry(width6, height6, depth)
          : buildPillarSolidGeometry2(
              pillarShape,
              width6,
              depth,
              height6,
            ),
      pillarMesh = new ns2.Mesh(
        pillarGeometry,
        pillarShape === "square"
          ? [hg2, hg2, fg2, hg2, hg2, hg2]
          : [fg2, hg2],
      );
    ((pillarMesh.position.y = height6 * 0.5),
      setWallGradientHeight2(
        ns2,
        pillarMesh.geometry,
        "y",
        height6 * 0.5,
        1,
        height6,
      ),
      (pillarMesh.castShadow = true),
      (pillarMesh.receiveShadow = true),
      (pillarMesh.renderOrder = 4),
      (pillarMesh.userData.reflectionRole = "wall"),
      pillarMesh.layers.set(lampsLayerIndex),
      itemModelNode.add(pillarMesh));
    return true;
  } else if (modelItem.type === "wallcabinet") {
    const wallcabinetLowerHeight = height6 * 0.28,
      wallcabinetUpperHeight =
        height6 - wallcabinetLowerHeight,
      wallcabinetCounterY =
        1.4 + wallcabinetLowerHeight,
      wallcabinetPanelThickness = Math.min(
        0.045,
        width6 * 0.15,
        depth * 0.2,
        wallcabinetLowerHeight * 0.2,
      ),
      wallcabinetInnerWidth =
        width6 - wallcabinetPanelThickness * 2,
      wallcabinetBottomY =
        1.4 - wallcabinetPanelThickness / 2,
      wallcabinetTopY = 1.4 + height6,
      wallcabinetCeilingY =
        wallcabinetCounterY +
        wallcabinetPanelThickness / 2;
    (addBoxMesh(
      itemModelNode,
      wallcabinetInnerWidth,
      wallcabinetTopY - wallcabinetCeilingY,
      depth,
      0,
      (wallcabinetTopY + wallcabinetCeilingY) / 2,
      0,
      furniture,
      {
        rounded: false,
      },
    ),
      addBoxMesh(
        itemModelNode,
        wallcabinetInnerWidth,
        wallcabinetCeilingY -
          wallcabinetBottomY -
          wallcabinetPanelThickness * 2,
        wallcabinetPanelThickness,
        0,
        (wallcabinetBottomY + wallcabinetCeilingY) /
          2,
        -depth / 2 + wallcabinetPanelThickness / 2,
        furniture,
        {
          rounded: false,
          roughness: 0.62,
        },
      ),
      addBoxMesh(
        itemModelNode,
        wallcabinetInnerWidth,
        wallcabinetPanelThickness,
        depth,
        0,
        1.4,
        0,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        wallcabinetInnerWidth,
        wallcabinetPanelThickness,
        depth,
        0,
        wallcabinetCounterY,
        0,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        wallcabinetPanelThickness,
        wallcabinetTopY - wallcabinetBottomY,
        depth,
        -(width6 - wallcabinetPanelThickness) / 2,
        (wallcabinetBottomY + wallcabinetTopY) / 2,
        0,
        furniture,
        {
          rounded: false,
        },
      ),
      addBoxMesh(
        itemModelNode,
        wallcabinetPanelThickness,
        wallcabinetTopY - wallcabinetBottomY,
        depth,
        (width6 - wallcabinetPanelThickness) / 2,
        (wallcabinetBottomY + wallcabinetTopY) / 2,
        0,
        furniture,
        {
          rounded: false,
        },
      ));
    const wallcabinetDoorWidth = width6 * 0.31;
    for (const wallcabinetDoorOffset of [
      -0.33, 0, 0.33,
    ])
      addBoxMesh(
        itemModelNode,
        wallcabinetDoorWidth,
        wallcabinetUpperHeight * 0.9,
        0.026,
        width6 * wallcabinetDoorOffset,
        wallcabinetCounterY +
          wallcabinetUpperHeight * 0.5,
        depth * 0.515,
        furnitureSoft,
        {
          rounded: false,
          roughness: 0.45,
        },
      );
    return true;
  }
  return false;
}

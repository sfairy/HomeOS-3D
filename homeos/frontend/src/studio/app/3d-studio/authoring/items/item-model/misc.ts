/**
 * 物品模型分派族：misc。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { ALL_ITEM_MODELS as ALL_ITEM_MODELS2 } from "../../../loaders/studio-external-models";
import { needsExternalModelAsset } from "../../../loaders/external-models/all-item-models";
import { addBoxMesh } from "../studio-mesh-primitives";
import { addChargingPadModel } from "../studio-charging-pad";
import { applianceItemTypeSet, lampItemTypeSet, stairItemTypeSet } from "../item-catalog";
import type { ItemModelScope } from "./types";

export function buildMisc(scope: ItemModelScope): boolean {
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

  if (lampItemTypeSet.has(modelItem.type)) {
    (addLightModel(itemModelNode, modelItem, modelShadowIds),
      addStripLightPreview(itemModelNode, modelItem));
    return true;
  } else if (modelItem.type === "planlabel") {
    itemModelNode.add(createPlanLabel(modelItem));
    return true;
  } else if ((modelItem.offlineModelExport !== true || needsExternalModelAsset(modelItem.type)) &&
      (ALL_ITEM_MODELS2 as any)[modelItem.type] &&
      !(modelItem.type === "fridge" && modelItem.fridgeStyle === "double") &&
      !["smallcar", "suv", "scooter"].includes(modelItem.type)) {
    applyItemOptimization(itemModelNode, modelItem) ||
      addBoxMesh(
        itemModelNode,
        width6,
        height6,
        depth,
        0,
        height6 * 0.5,
        0,
        applianceItemTypeSet.has(modelItem.type) ? appliance : furniture,
        {
          rounded: false,
          roughness: 0.6,
          metalness: 0.1,
        },
      );
    return true;
  } else if (["smallcar", "suv", "scooter"].includes(modelItem.type)) {
    if (!applyItemOptimization(itemModelNode, modelItem)) {
      (addBoxMesh(
        itemModelNode,
        width6 * 0.96,
        height6 * 0.38,
        depth * 0.9,
        0,
        height6 * 0.28,
        0,
        furniture,
        {
          roughness: 0.46,
          metalness: 0.18,
        },
      ),
        addBoxMesh(
          itemModelNode,
          width6 * 0.78,
          height6 * 0.42,
          depth * 0.48,
          0,
          height6 * 0.62,
          -depth * 0.03,
          furnitureSoft,
          {
            roughness: 0.38,
            metalness: 0.12,
          },
        ));
      for (const curtainOffsetX of [-0.48, 0.48])
        for (const curtainOffsetZ of [-0.3, 0.3])
          addBoxMesh(
            itemModelNode,
            width6 * 0.1,
            height6 * 0.22,
            depth * 0.17,
            curtainOffsetX * width6,
            height6 * 0.17,
            curtainOffsetZ * depth,
            furnitureDark,
            {
              rounded: false,
              roughness: 0.82,
            },
          );
    }
    isEmbeddedStage || addChargingPadModel(itemModelNode, modelItem, width6, depth, height6, isEmbeddedStage);
    return true;
  } else if (modelItem.type === "curtain") {
    const curtainPosition2 = ["left", "right", "split"].includes(modelItem.curtainPosition)
        ? modelItem.curtainPosition
        : "split",
      modelChildCount = itemModelNode.children.length;
    isEmbeddedStage &&
      ((itemModelNode.userData.curtainRigRoot = true),
      (itemModelNode.userData.curtainRigBasis = [width6, height6, depth]));
    const frameBarSize = Math.min(Math.max(depth * 0.09, 0.012), 0.028),
      frameTopY = height6 - frameBarSize * 1.8,
      frameLowerY = frameTopY - frameBarSize * 1.8,
      frameInset = Math.max(height6 * 0.025, 0.025),
      framePanelHeight = Math.max(frameLowerY - frameInset, height6 * 0.72);
    addCylinderMesh(
      itemModelNode,
      frameBarSize,
      frameBarSize,
      width6 * 1.06,
      0,
      frameTopY,
      0,
      furnitureDark,
      {
        segments: 18,
        rotationZ: Math.PI / 2,
        metalness: 0.68,
        roughness: 0.22,
      },
    );
    for (const frameSideX of [-width6 * 0.52, width6 * 0.52])
      addCylinderMesh(
        itemModelNode,
        frameBarSize * 1.45,
        frameBarSize * 1.45,
        frameBarSize * 0.9,
        frameSideX,
        frameTopY,
        0,
        furnitureLight,
        {
          segments: 18,
          rotationZ: Math.PI / 2,
          metalness: 0.52,
          roughness: 0.26,
        },
      );
    const addPanelRow = (panelStartX: any, panelTotalWidth: any) => {
      const panelStep = panelTotalWidth / 7;
      for (let panelIndex = 0; panelIndex < 7; panelIndex += 1) {
        const panelX = panelStartX + panelStep * (panelIndex + 0.5),
          panelZ = panelIndex % 2 === 0 ? depth * 0.1 : -depth * 0.1;
        addBoxMesh(
          itemModelNode,
          panelStep * 1.24,
          framePanelHeight,
          depth * 0.62,
          panelX,
          frameInset + framePanelHeight * 0.5,
          panelZ,
          furnitureLight,
          {
            radius: Math.min(panelStep * 0.34, 0.035),
            roughness: 0.94,
            metalness: 0,
          },
        );
      }
      (addBoxMesh(
        itemModelNode,
        panelTotalWidth * 1.03,
        Math.max(height6 * 0.018, 0.025),
        depth * 0.74,
        panelStartX + panelTotalWidth * 0.5,
        frameInset + height6 * 0.015,
        0,
        furnitureDark,
        {
          radius: 0.01,
          roughness: 0.72,
          metalness: 0.02,
        },
      ),
        addBoxMesh(
          itemModelNode,
          panelTotalWidth * 1.06,
          Math.max(height6 * 0.025, 0.035),
          depth * 0.82,
          panelStartX + panelTotalWidth * 0.5,
          frameInset + framePanelHeight * 0.52,
          0,
          furnitureLight,
          {
            radius: 0.012,
            roughness: 0.48,
            metalness: 0.08,
          },
        ));
    };
    (curtainPosition2 === "left"
      ? addPanelRow(-width6 * 0.5, width6 * 0.24)
      : curtainPosition2 === "right"
        ? addPanelRow(width6 * 0.26, width6 * 0.24)
        : (addPanelRow(-width6 * 0.5, width6 * 0.16),
          addPanelRow(width6 * 0.34, width6 * 0.16)),
      isEmbeddedStage &&
        itemModelNode.children
          .slice(modelChildCount)
          .forEach((curtainChild: any, curtainChildIndex: any) => {
            curtainChild.userData.curtainPart =
              curtainChildIndex === 0
                ? "rod"
                : curtainChildIndex < 3
                  ? "cap"
                  : (curtainChildIndex - 3) % 9 < 7
                    ? "cloth"
                    : "band";
          }));
    return true;
  } else if (stairItemTypeSet.has(modelItem.type)) {
    const slatStep = depth / 10;
    for (
      let modelShadowIdsSlatIndex = 0;
      modelShadowIdsSlatIndex < 10;
      modelShadowIdsSlatIndex += 1
    ) {
      const slatY = (height6 * (modelShadowIdsSlatIndex + 1)) / 10,
        slatZ = -depth * 0.5 + slatStep * (modelShadowIdsSlatIndex + 0.5);
      (addBoxMesh(
        itemModelNode,
        width6,
        slatY,
        slatStep * 1.015,
        0,
        slatY * 0.5,
        slatZ,
        modelShadowIdsSlatIndex % 2 ? furniture : furnitureSoft,
        {
          rounded: false,
          roughness: 0.82,
        },
      ),
        addBoxMesh(
          itemModelNode,
          width6 * 1.01,
          0.018,
          slatStep * 0.94,
          0,
          slatY + 0.009,
          slatZ,
          furnitureLight,
          {
            rounded: false,
            castShadow: false,
            roughness: 0.72,
          },
        ));
    }
    return true;
  }
  return false;
}

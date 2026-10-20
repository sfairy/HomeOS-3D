/**
 * 物品模型总装（`buildItemModel`）：按物品类型分派到各构件（墙体 / 家具 / 灯具 / 卫浴 /
 * 影音 / 安防 / 幕布 / 部件族），再统一做姿态、强调发光与性能诊断统计。
 *
 * 从 studio-app.ts 单体整体切出（P4）。它是宿主里最大的单块（约 7.5k 行），
 * 依赖面全部是**只读**句柄：要么是宿主里的兄弟构件函数，要么是宿主持有的可变状态
 * （`studioState` / `activeFloorId` / 诊断统计表 / 主题视图设置）。这些一律经
 * `StudioItemModelDeps` 显式传入，在本文件顶部解构成本地名，正文与迁出前逐字一致。
 */

import { addTelevisionModel } from "./studio-television-model";
import { addTrackCurtain as addTrackCurtain2 } from "../../loaders/studio-curtain-track";
import { squareEdgeItemTypeSet } from "./item-catalog";
import { applyItemPosture as applyItemPosture2 } from "./studio-item-posture";
import { batchFurnitureMeshes } from "./studio-furniture-batching";
import { buildingFootprints as buildingFootprints2, fenceOpenings as fenceOpenings2, surfaceExclusions as surfaceExclusions2 } from "../../plan/courtyard-drawing";
import { createAirerModel as createAirerModel2 } from "./studio-airer";
import { createCourtyardDrawingModel as createCourtyardDrawingModel2 } from "../../plan/courtyard-drawing-model";
import { createFanModel as createFanModel2 } from "./studio-fan";
import { createFeaturewallModel } from "../../materials/studio-feature-wall";
import { createMuralModel } from "../../materials/studio-mural";
import { createSpeakerModel as createSpeakerModel2 } from "./studio-speaker";
import { isCourtyardDrawing as isCourtyardDrawing2 } from "../../loaders/studio-normalization";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope, StudioItemModelDeps } from "./item-model/types";
import { ITEM_MODEL_FAMILIES } from "./item-model";

/**
 * 物品模型总装需要的外部句柄（**全部只读**：体量最大的那 25 个残留依赖，实测在切片区间内
 * 无一处重新赋值）。函数成员是宿主里的兄弟构件（网格 / 灯具 / 铭牌 / 材质 / 释放 / 合批），
 * 值成员是宿主持有的可变状态（项目文档、当前楼层、诊断统计表、主题视图设置）。
 */


export function buildItemModel(
  deps: StudioItemModelDeps,
  modelItem: any,
  modelShadowIds: any = null,
) {
  // 解构成本地名后，正文与迁出前逐字一致；25 个句柄在切片区间内均只读。
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
  } = deps;
  if (isCourtyardDrawing2(modelItem)) {
    const surfaceExclusions =
        modelItem.type === "courtyard-area"
          ? surfaceExclusions2(
              modelItem,
              studioState.items,
              buildingFootprints2(
                studioState.walls,
                closedWallLoops(getPixelsPerMeter()),
                getPixelsPerMeter(),
              ),
              getPixelsPerMeter(),
            )
          : [],
      courtyardOptions =
        modelItem.type === "courtyard-fence"
          ? {
              ...modelItem,
              drawing: {
                ...modelItem.drawing,
                openings: fenceOpenings2(modelItem, studioState.items),
              },
            }
          : modelItem,
      courtyardModel = createCourtyardDrawingModel2(
        ns2,
        mergeGeometries2,
        courtyardOptions,
        backgroundSettings(),
        surfaceExclusions,
      );
    return (
      courtyardModel.traverse((courtyardPart: any) => {
        ((courtyardPart.userData.exportRole = "plan"),
          courtyardPart.isMesh && (courtyardPart.userData.regionFloorId = activeFloorId));
      }),
      applyAccentEmissive(courtyardModel, createSelectionRef("item", modelItem.id)),
      courtyardModel
    );
  }
  const itemModelNode = new ns2.Group();
  ((itemModelNode.userData.squareEdges = squareEdgeItemTypeSet.has(modelItem.type)),
    nextTenItemTypeSet.has(modelItem.type) &&
      (itemModelNode.userData.optimizationBatch = "v1-next-ten"));
  const width6 = modelItem.width,
    depth = modelItem.depth,
    height6 = modelItem.height,
    yt4 = backgroundSettings(),
    furniture = yt4.furniture,
    appliance = yt4.appliance ?? furniture,
    furnitureSoft =
      modelItem.type === "sofa" ? (yt4.sofaFabric ?? yt4.furnitureSoft) : yt4.furnitureSoft,
    furnitureLight = yt4.furnitureLight,
    furnitureDark = yt4.furnitureDark;
  if (modelItem.type === "airer")
    return (
      itemModelNode.add(createAirerModel2(ns2, modelItem, yt4)),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  if (modelItem.type === "fan")
    return (
      itemModelNode.add(createFanModel2(ns2, mergeGeometries2, modelItem, yt4)),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  if (modelItem.type === "speaker")
    return (
      itemModelNode.add(createSpeakerModel2(ns2, modelItem, yt4)),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  if (modelItem.type === "mural")
    return (
      itemModelNode.add(createMuralModel(ns2, modelItem, yt4)),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  if (modelItem.type === "featurewall")
    return (
      itemModelNode.add(createFeaturewallModel(ns2, modelItem)),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  if (modelItem.type === "curtain" && modelItem.offlineModelExport !== true)
    return (
      addTrackCurtain2(ns2, itemModelNode, modelItem, {
        dark: furnitureDark,
        light: furnitureLight,
      }),
      yt4.warmWood &&
        itemModelNode.traverse((curtainPart: any) => {
          curtainPart.userData.curtainPart === "cloth" &&
            curtainPart.material &&
            (curtainPart.material.color.set(16776696),
            (curtainPart.material.emissive = new ns2.Color(16776696)),
            (curtainPart.material.emissiveIntensity = 0.38));
        }),
      applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
      itemModelNode
    );
  const itemModelScope: ItemModelScope = {
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
  };
  for (const buildFamily of ITEM_MODEL_FAMILIES) {
    if (buildFamily(itemModelScope)) break;
  }
  if (
    (optimizationItemTypeSet.has(modelItem.type) ||
      applianceOptimizationTypeSet.has(modelItem.type)) &&
    !(modelItem.type === "fridge" && modelItem.fridgeStyle === "double") &&
    modelItem.offlineModelExport !== true
  ) {
    const offlinePrunedChildren = [...itemModelNode.children];
    applyItemOptimization(itemModelNode, modelItem) &&
      offlinePrunedChildren.forEach((prunedChild) => {
        (itemModelNode.remove(prunedChild), disposeObjectTree(prunedChild));
      });
  }
  if (
    (modelItem.type === "tv" &&
      modelItem.offlineModelExport !== true &&
      addTelevisionModel(studioTelevisionDeps(), itemModelNode, modelItem, width6, depth, height6),
    mergeMeshesByType(itemModelNode, modelItem.type),
    batchFurnitureMeshes(itemModelNode, modelItem.type),
    isPerformanceDiagnostics)
  ) {
    let triangleCount = 0,
      externalMeshCount = 0;
    (itemModelNode.traverse((countedMesh: any) => {
      countedMesh.isMesh &&
        ((triangleCount +=
          (countedMesh.geometry.index?.count ?? countedMesh.geometry.attributes.position.count) /
          3),
        countedMesh.userData.externalModelSharedGeometry && externalMeshCount++);
    }),
      meshStatsByType.set(modelItem.type, {
        triangles: triangleCount,
        externalMeshes: externalMeshCount,
        offlineExport: modelItem.offlineModelExport === true,
      }));
  }
  return (
    applyItemPosture2(itemModelNode, modelItem),
    applyAccentEmissive(itemModelNode, createSelectionRef("item", modelItem.id)),
    itemModelNode
  );
}

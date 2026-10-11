/**
 * 物品模型总装（`buildItemModel`）：按物品类型分派到各构件（墙体 / 家具 / 灯具 / 卫浴 /
 * 影音 / 安防 / 幕布 / 部件族），再统一做姿态、强调发光与性能诊断统计。
 *
 * 从 studio-app.ts 单体整体切出（P4）。它是宿主里最大的单块（约 7.5k 行），
 * 依赖面全部是**只读**句柄：要么是宿主里的兄弟构件函数，要么是宿主持有的可变状态
 * （`studioState` / `activeFloorId` / 诊断统计表 / 主题视图设置）。这些一律经
 * `StudioItemModelDeps` 显式传入，在本文件顶部解构成本地名，正文与迁出前逐字一致。
 */

import { ALL_ITEM_MODELS as ALL_ITEM_MODELS2 } from "../../loaders/studio-external-models";
import { addBoxMesh, addFurnitureAssembly } from "./studio-mesh-primitives";
import { addChargingPadModel } from "./studio-charging-pad";
import { addSecurityModel as addSecurityModel2 } from "../../loaders/studio-security-models";
import { addTelevisionModel, computeTelevisionProportions } from "./studio-television-model";
import { addTrackCurtain as addTrackCurtain2 } from "../../loaders/studio-curtain-track";
import { applianceItemTypeSet, lampItemTypeSet, roundTableTypeSet, squareEdgeItemTypeSet, stairItemTypeSet } from "./item-catalog";
import { applyItemPosture as applyItemPosture2, buildPillarSolidGeometry as buildPillarSolidGeometry2, normalizePillarShape as normalizePillarShape2 } from "../studio-item-posture";
import { batchFurnitureMeshes } from "./studio-furniture-batching";
import { buildPressProfile } from "./studio-sanitary-models";
import { buildingFootprints as buildingFootprints2, fenceOpenings as fenceOpenings2, surfaceExclusions as surfaceExclusions2 } from "../../plan/courtyard-drawing";
import { clamp as clamp2 } from "../../plan/geometry";
import { createAirerModel as createAirerModel2 } from "../studio-airer";
import { createCourtyardDrawingModel as createCourtyardDrawingModel2 } from "../../plan/courtyard-drawing-model";
import { createFanModel as createFanModel2 } from "../studio-fan";
import { createFeaturewallModel } from "../../materials/studio-feature-wall";
import { createMuralModel } from "../../materials/studio-mural";
import { createSpeakerModel as createSpeakerModel2 } from "../studio-speaker";
import { isCourtyardDrawing as isCourtyardDrawing2 } from "../../loaders/studio-normalization";
import { isTurntableRoundTable } from "../studio-app-helpers";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import * as ns2 from "/static/vendor/three/0.186.0/three.module.min.js";
import { setWallGradientHeight as setWallGradientHeight2 } from "../../materials/studio-wall-materials";

/**
 * 物品模型总装需要的外部句柄（**全部只读**：体量最大的那 25 个残留依赖，实测在切片区间内
 * 无一处重新赋值）。函数成员是宿主里的兄弟构件（网格 / 灯具 / 铭牌 / 材质 / 释放 / 合批），
 * 值成员是宿主持有的可变状态（项目文档、当前楼层、诊断统计表、主题视图设置）。
 */
export interface StudioItemModelDeps {
  /** 圆柱网格构件（宿主兄弟函数，切片内 69 处调用）。 */
  addCylinderMesh: (
    cylinderParent: any,
    cylinderRadiusTop: any,
    cylinderRadiusBottom: any,
    cylinderHeight: any,
    cylinderX: any,
    cylinderY: any,
    cylinderZ: any,
    cylinderColor: any,
    cylinderOptions?: any,
  ) => any;
  /** 强调发光（选中态自发光的开关与强度）。 */
  applyAccentEmissive: (accentRoot: any, isAccentActive: any) => any;
  /** 选中态判定（由选中种类 + id 生成 `userData` 引用）。 */
  createSelectionRef: (selectionKind: any, selectionId: any) => any;
  /** 平面铭牌（地面文字贴图）。 */
  createPlanLabel: (labelSpec: any) => any;
  /** 灯具模型（点 / 聚 / 带灯的光源与灯罩）。 */
  addLightModel: (lightModelParent: any, lightModelItem: any, shadowLightIdSet: any) => any;
  /** 地毯网格。 */
  addRugMeshes: (rugParent: any, rugItem: any, rugBaseColor: any, rugInsetColor: any) => any;
  /** 灯带预览（导出用光源示意，不进平面图）。 */
  addStripLightPreview: (stripPreviewParent: any, stripLightItem: any) => any;
  /** 递归释放几何 / 材质 / 贴图。 */
  disposeObjectTree: (disposedRoot: any) => any;
  /** 按类型合批子网格（合批前的材质签名去重也在里面）。 */
  mergeMeshesByType: (mergeRoot: any, mergeItemType: any) => any;
  /** 墙面侧材质。 */
  createWallSideMaterial: (wallSideColor: any, wallSideOpacity: any, wallSideOptions?: any) => any;
  /** 墙顶材质。 */
  createWallTopMaterial: (wallTopBaseColor: any, wallTopOpacity: any, wallTopOptions?: any) => any;
  /** 外部模型优化（几何合并 / 顶点着色 / 命中盒裁剪）。 */
  applyItemOptimization: (
    modelSource: any,
    itemRecordRef: any,
    modelLoadOptions?: any,
  ) => any;
  /** 标定比例（像素 / 米）。 */
  getPixelsPerMeter: () => number;
  /** 封闭墙体回路（缓存进 `studioState.walls`）。 */
  closedWallLoops: (wallLoopList: any) => any;
  /** 当前主题的视图设置。 */
  backgroundSettings: () => { warmWood?: boolean } & Record<string, any>;
  /** 项目文档（只读遍历；可变的是它的字段，不是这个绑定）。 */
  studioState: any;
  /** 电视模型构件的 deps 工厂（见 `./studio-television-model`），按需透传。 */
  studioTelevisionDeps: () => any;
  /** 当前楼层 id。 */
  activeFloorId: string;
  /** 嵌入舞台开关（影响灯光亮度上限与静态顶点着色）。 */
  isEmbeddedStage: boolean;
  /** 是否开启性能诊断（决定是否统计三角面 / 外部网格）。 */
  isPerformanceDiagnostics: boolean;
  /** 灯具图层序号。 */
  lampsLayerIndex: number;
  /** 诊断统计表（`type -> 三角面数 / 外部网格数`）。 */
  meshStatsByType: Map<string, any>;
  /** 十条起步的物品类型集合。 */
  nextTenItemTypeSet: Set<string>;
  /** 可合批优化类型集合。 */
  optimizationItemTypeSet: Set<string>;
  /** 家电类可优化类型集合。 */
  applianceOptimizationTypeSet: Set<string>;
}

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
  if (lampItemTypeSet.has(modelItem.type))
    (addLightModel(itemModelNode, modelItem, modelShadowIds),
      addStripLightPreview(itemModelNode, modelItem));
  else {
    if (modelItem.type === "planlabel") itemModelNode.add(createPlanLabel(modelItem));
    else {
      if (
        modelItem.offlineModelExport !== true &&
        (ALL_ITEM_MODELS2 as any)[modelItem.type] &&
        !(modelItem.type === "fridge" && modelItem.fridgeStyle === "double") &&
        !["smallcar", "suv", "scooter"].includes(modelItem.type)
      )
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
      else {
        if (["smallcar", "suv", "scooter"].includes(modelItem.type)) {
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
        } else {
          if (modelItem.type === "curtain") {
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
          } else {
            if (stairItemTypeSet.has(modelItem.type)) {
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
            } else {
              if (modelItem.type === "sofa") {
                const handleOffset = height6 * 0.14,
                  handlePositionY = (handleHeight: any) => handleHeight - handleOffset + -0.008;
                (addBoxMesh(
                  itemModelNode,
                  width6 * 0.92,
                  height6 * 0.28,
                  depth * 0.72,
                  0,
                  handlePositionY(height6 * 0.28),
                  depth * 0.06,
                  furniture,
                ),
                  addBoxMesh(
                    itemModelNode,
                    width6 * 0.92,
                    height6 * 0.55,
                    depth * 0.18,
                    0,
                    handlePositionY(height6 * 0.56),
                    -depth * 0.35,
                    furniture,
                  ),
                  addBoxMesh(
                    itemModelNode,
                    width6 * 0.1,
                    height6 * 0.48,
                    depth * 0.75,
                    -width6 * 0.46,
                    handlePositionY(height6 * 0.39),
                    depth * 0.03,
                    furniture,
                  ),
                  addBoxMesh(
                    itemModelNode,
                    width6 * 0.1,
                    height6 * 0.48,
                    depth * 0.75,
                    width6 * 0.46,
                    handlePositionY(height6 * 0.39),
                    depth * 0.03,
                    furniture,
                  ),
                  addBoxMesh(
                    itemModelNode,
                    width6 * 0.42,
                    height6 * 0.12,
                    depth * 0.55,
                    -width6 * 0.22,
                    handlePositionY(height6 * 0.47),
                    depth * 0.07,
                    furnitureSoft,
                  ),
                  addBoxMesh(
                    itemModelNode,
                    width6 * 0.42,
                    height6 * 0.12,
                    depth * 0.55,
                    width6 * 0.22,
                    handlePositionY(height6 * 0.47),
                    depth * 0.07,
                    furnitureSoft,
                  ));
              } else {
                if (modelItem.type === "bed")
                  (addBoxMesh(
                    itemModelNode,
                    width6 * 0.996,
                    height6 * 0.3,
                    depth * 0.996,
                    0,
                    height6 * 0.15,
                    0,
                    furnitureDark,
                  ),
                    addBoxMesh(
                      itemModelNode,
                      width6 * 0.96,
                      height6 * 0.32,
                      depth * 0.92,
                      0,
                      height6 * 0.43,
                      depth * 0.03,
                      furnitureSoft,
                    ),
                    addBoxMesh(
                      itemModelNode,
                      width6,
                      height6 * 0.95,
                      depth * 0.09,
                      0,
                      height6 * 0.48,
                      -depth * 0.455,
                      furniture,
                    ),
                    addBoxMesh(
                      itemModelNode,
                      width6 * 0.38,
                      height6 * 0.14,
                      depth * 0.22,
                      -width6 * 0.23,
                      height6 * 0.66,
                      -depth * 0.29,
                      furnitureLight,
                    ),
                    addBoxMesh(
                      itemModelNode,
                      width6 * 0.38,
                      height6 * 0.14,
                      depth * 0.22,
                      width6 * 0.23,
                      height6 * 0.66,
                      -depth * 0.29,
                      furnitureLight,
                    ));
                else {
                  if (modelItem.type === "nightstand") {
                    (addBoxMesh(
                      itemModelNode,
                      width6,
                      height6 * 0.78,
                      depth,
                      0,
                      height6 * 0.49,
                      0,
                      furniture,
                    ),
                      addBoxMesh(
                        itemModelNode,
                        width6 * 1.04,
                        height6 * 0.07,
                        depth * 1.05,
                        0,
                        height6 * 0.91,
                        0,
                        furnitureSoft,
                        {
                          roughness: 0.5,
                        },
                      ),
                      addBoxMesh(
                        itemModelNode,
                        width6 * 0.9,
                        0.014,
                        depth * 1.01,
                        0,
                        height6 * 0.63,
                        depth * 0.01,
                        furnitureDark,
                        {
                          rounded: false,
                        },
                      ),
                      addBoxMesh(
                        itemModelNode,
                        width6 * 0.9,
                        0.014,
                        depth * 1.01,
                        0,
                        height6 * 0.38,
                        depth * 0.01,
                        furnitureDark,
                        {
                          rounded: false,
                        },
                      ),
                      addBoxMesh(
                        itemModelNode,
                        width6 * 0.22,
                        0.022,
                        0.032,
                        0,
                        height6 * 0.5,
                        depth * 0.52,
                        furnitureLight,
                        {
                          metalness: 0.5,
                        },
                      ));
                    for (const drawerOffsetX of [-0.38, 0.38])
                      for (const drawerOffsetZ of [-0.35, 0.35])
                        addBoxMesh(
                          itemModelNode,
                          0.035,
                          height6 * 0.2,
                          0.035,
                          width6 * drawerOffsetX,
                          height6 * 0.1,
                          depth * drawerOffsetZ,
                          furnitureDark,
                          {
                            metalness: 0.18,
                          },
                        );
                  } else {
                    if (modelItem.type === "table") {
                      const topPanelWidth = width6 * 0.64,
                        topPanelDepth = depth * 0.48;
                      addBoxMesh(
                        itemModelNode,
                        topPanelWidth,
                        height6 * 0.1,
                        topPanelDepth,
                        0,
                        height6 * 0.93,
                        0,
                        furniture,
                      );
                      for (const knobOffsetX of [-0.43, 0.43])
                        for (const knobOffsetZ of [-0.38, 0.38])
                          addBoxMesh(
                            itemModelNode,
                            0.07,
                            height6 * 0.9,
                            0.07,
                            topPanelWidth * knobOffsetX,
                            height6 * 0.45,
                            topPanelDepth * knobOffsetZ,
                            furnitureDark,
                          );
                      const doorWidth = Math.min(width6 * 0.2, 0.5),
                        doorDepth = Math.min(depth * 0.27, 0.5),
                        doorHeight = height6 * 1.18;
                      (addFurnitureAssembly(
                        itemModelNode,
                        doorWidth,
                        doorDepth,
                        doorHeight,
                        -width6 * 0.37,
                        0,
                        Math.PI / 2,
                        furnitureSoft,
                        furnitureDark,
                      ),
                        addFurnitureAssembly(
                          itemModelNode,
                          doorWidth,
                          doorDepth,
                          doorHeight,
                          width6 * 0.37,
                          0,
                          -Math.PI / 2,
                          furnitureSoft,
                          furnitureDark,
                        ),
                        addFurnitureAssembly(
                          itemModelNode,
                          doorWidth,
                          doorDepth,
                          doorHeight,
                          0,
                          -depth * 0.35,
                          0,
                          furnitureSoft,
                          furnitureDark,
                        ),
                        addFurnitureAssembly(
                          itemModelNode,
                          doorWidth,
                          doorDepth,
                          doorHeight,
                          0,
                          depth * 0.35,
                          Math.PI,
                          furnitureSoft,
                          furnitureDark,
                        ));
                    } else {
                      if (roundTableTypeSet.has(modelItem.type)) {
                        const sinkRadius = Math.min(width6, depth) * 0.32,
                          sinkDepth = Math.max(height6 * 0.07, 0.045),
                          sinkTopY = height6 * 0.92;
                        (addCylinderMesh(
                          itemModelNode,
                          sinkRadius,
                          sinkRadius,
                          sinkDepth,
                          0,
                          sinkTopY,
                          0,
                          furnitureLight,
                          {
                            segments: 48,
                            roughness: 0.5,
                            metalness: 0.08,
                          },
                        ),
                          addCylinderMesh(
                            itemModelNode,
                            Math.min(width6, depth) * 0.22,
                            Math.min(width6, depth) * 0.3,
                            height6 * 0.68,
                            0,
                            height6 * 0.43,
                            0,
                            furniture,
                            {
                              segments: 36,
                              roughness: 0.55,
                              metalness: 0.06,
                            },
                          ),
                          addCylinderMesh(
                            itemModelNode,
                            Math.min(width6, depth) * 0.34,
                            Math.min(width6, depth) * 0.34,
                            height6 * 0.07,
                            0,
                            height6 * 0.045,
                            0,
                            furnitureDark,
                            {
                              segments: 40,
                              roughness: 0.42,
                              metalness: 0.12,
                            },
                          ),
                          isTurntableRoundTable(modelItem) &&
                            (addCylinderMesh(
                              itemModelNode,
                              sinkRadius * 0.58,
                              sinkRadius * 0.58,
                              Math.max(height6 * 0.035, 0.025),
                              0,
                              sinkTopY + sinkDepth * 0.58,
                              0,
                              furnitureSoft,
                              {
                                segments: 48,
                                roughness: 0.48,
                                metalness: 0.08,
                              },
                            ),
                            addCylinderMesh(
                              itemModelNode,
                              sinkRadius * 0.44,
                              sinkRadius * 0.44,
                              0.018,
                              0,
                              sinkTopY + sinkDepth * 0.58 + 0.036,
                              0,
                              furnitureDark,
                              {
                                segments: 48,
                                roughness: 0.32,
                                metalness: 0.12,
                              },
                            )));
                        const burnerWidth = Math.min(width6 * 0.17, 0.42),
                          burnerDepth = Math.min(depth * 0.19, 0.44),
                          burnerHeight = height6 * 1.15;
                        (addFurnitureAssembly(
                          itemModelNode,
                          burnerWidth,
                          burnerDepth,
                          burnerHeight,
                          -width6 * 0.38,
                          0,
                          Math.PI / 2,
                          furnitureSoft,
                          furnitureDark,
                        ),
                          addFurnitureAssembly(
                            itemModelNode,
                            burnerWidth,
                            burnerDepth,
                            burnerHeight,
                            width6 * 0.38,
                            0,
                            -Math.PI / 2,
                            furnitureSoft,
                            furnitureDark,
                          ),
                          addFurnitureAssembly(
                            itemModelNode,
                            burnerWidth,
                            burnerDepth,
                            burnerHeight,
                            0,
                            -depth * 0.38,
                            0,
                            furnitureSoft,
                            furnitureDark,
                          ),
                          addFurnitureAssembly(
                            itemModelNode,
                            burnerWidth,
                            burnerDepth,
                            burnerHeight,
                            0,
                            depth * 0.38,
                            Math.PI,
                            furnitureSoft,
                            furnitureDark,
                          ));
                      } else {
                        if (modelItem.type === "bar") {
                          (addBoxMesh(
                            itemModelNode,
                            width6,
                            height6 * 0.12,
                            depth,
                            0,
                            height6 * 0.94,
                            0,
                            furnitureSoft,
                            {
                              roughness: 0.5,
                            },
                          ),
                            addBoxMesh(
                              itemModelNode,
                              width6 * 0.92,
                              height6 * 0.78,
                              depth * 0.46,
                              0,
                              height6 * 0.45,
                              -depth * 0.18,
                              furniture,
                              {
                                roughness: 0.65,
                              },
                            ),
                            addBoxMesh(
                              itemModelNode,
                              width6 * 0.86,
                              height6 * 0.48,
                              0.035,
                              0,
                              height6 * 0.42,
                              depth * 0.28,
                              furnitureDark,
                              {
                                rounded: false,
                                roughness: 0.48,
                              },
                            ));
                          for (const burnerOffsetX of [-0.3, 0, 0.3])
                            (addCylinderMesh(
                              itemModelNode,
                              depth * 0.14,
                              depth * 0.14,
                              0.045,
                              width6 * burnerOffsetX,
                              height6 * 0.66,
                              depth * 0.52,
                              furnitureSoft,
                              {
                                segments: 28,
                                roughness: 0.52,
                              },
                            ),
                              addCylinderMesh(
                                itemModelNode,
                                0.025,
                                0.025,
                                height6 * 0.62,
                                width6 * burnerOffsetX,
                                height6 * 0.34,
                                depth * 0.52,
                                furnitureDark,
                                {
                                  segments: 18,
                                  metalness: 0.38,
                                  roughness: 0.28,
                                },
                              ),
                              addCylinderMesh(
                                itemModelNode,
                                depth * 0.1,
                                depth * 0.12,
                                0.035,
                                width6 * burnerOffsetX,
                                0.018,
                                depth * 0.52,
                                furnitureDark,
                                {
                                  segments: 24,
                                  metalness: 0.3,
                                  roughness: 0.34,
                                },
                              ));
                        } else {
                          if (modelItem.type === "aquarium") {
                            const baseCabinetHeight = Math.max(height6 * 0.52, 0.45),
                              baseCabinetTopY = baseCabinetHeight,
                              upperCabinetHeight = Math.max(height6 - baseCabinetHeight, 0.2),
                              cabinetFrameSize = Math.min(
                                Math.max(Math.min(width6, depth) * 0.025, 0.012),
                                0.028,
                              ),
                              cabinetOptions = {
                                rounded: false,
                                transparent: true,
                                opacity: 0.22,
                                depthWrite: false,
                                side: ns2.DoubleSide,
                                roughness: 0.06,
                                metalness: 0.02,
                                castShadow: false,
                                receiveShadow: false,
                                renderOrder: 6,
                              };
                            (addBoxMesh(
                              itemModelNode,
                              width6,
                              baseCabinetHeight,
                              depth,
                              0,
                              baseCabinetHeight * 0.5,
                              0,
                              furniture,
                              {
                                rounded: false,
                                roughness: 0.56,
                              },
                            ),
                              addBoxMesh(
                                itemModelNode,
                                width6,
                                0.035,
                                depth,
                                0,
                                baseCabinetHeight,
                                0,
                                yt4.frame,
                                {
                                  rounded: false,
                                  metalness: 0.34,
                                  roughness: 0.3,
                                },
                              ),
                              addBoxMesh(
                                itemModelNode,
                                width6 - cabinetFrameSize * 2,
                                upperCabinetHeight,
                                cabinetFrameSize,
                                0,
                                baseCabinetTopY + upperCabinetHeight * 0.5,
                                -depth * 0.5 + cabinetFrameSize * 0.5,
                                yt4.glass,
                                cabinetOptions,
                              ),
                              addBoxMesh(
                                itemModelNode,
                                width6 - cabinetFrameSize * 2,
                                upperCabinetHeight,
                                cabinetFrameSize,
                                0,
                                baseCabinetTopY + upperCabinetHeight * 0.5,
                                depth * 0.5 - cabinetFrameSize * 0.5,
                                yt4.glass,
                                cabinetOptions,
                              ),
                              addBoxMesh(
                                itemModelNode,
                                cabinetFrameSize,
                                upperCabinetHeight,
                                depth - cabinetFrameSize * 2,
                                -width6 * 0.5 + cabinetFrameSize * 0.5,
                                baseCabinetTopY + upperCabinetHeight * 0.5,
                                0,
                                yt4.glass,
                                cabinetOptions,
                              ),
                              addBoxMesh(
                                itemModelNode,
                                cabinetFrameSize,
                                upperCabinetHeight,
                                depth - cabinetFrameSize * 2,
                                width6 * 0.5 - cabinetFrameSize * 0.5,
                                baseCabinetTopY + upperCabinetHeight * 0.5,
                                0,
                                yt4.glass,
                                cabinetOptions,
                              ));
                          } else {
                            if (modelItem.type === "coffeetable") {
                              const handleKnobRadius = Math.min(width6 * 0.34, depth * 0.42),
                                handleSmallKnobRadius = Math.min(width6 * 0.23, depth * 0.29),
                                knobX = -width6 * 0.16,
                                knobZ = depth * 0.08,
                                smallKnobX = width6 * 0.24,
                                smallKnobZ = -depth * 0.2,
                                knobBaseY = height6 * 0.58,
                                smallKnobBaseY = height6 * 0.76;
                              addCylinderMesh(
                                itemModelNode,
                                handleKnobRadius * 0.3,
                                handleKnobRadius * 0.5,
                                knobBaseY,
                                knobX,
                                knobBaseY * 0.5,
                                knobZ,
                                furniture,
                                {
                                  segments: 40,
                                  roughness: 0.82,
                                },
                              );
                              const knobBarDiameter = height6 * 0.07,
                                knobCapDiameter = height6 * 0.055,
                                knobBarCenterY = knobBaseY + knobBarDiameter * 0.5 + 0.001,
                                knobCapCenterY =
                                  knobBarCenterY +
                                  (knobBarDiameter + knobCapDiameter) * 0.5 +
                                  0.001;
                              (addCylinderMesh(
                                itemModelNode,
                                handleKnobRadius * 1.02,
                                handleKnobRadius * 1.02,
                                knobBarDiameter,
                                knobX,
                                knobBarCenterY,
                                knobZ,
                                furnitureDark,
                                {
                                  segments: 48,
                                  roughness: 0.72,
                                },
                              ),
                                addCylinderMesh(
                                  itemModelNode,
                                  handleKnobRadius,
                                  handleKnobRadius,
                                  knobCapDiameter,
                                  knobX,
                                  knobCapCenterY,
                                  knobZ,
                                  furnitureLight,
                                  {
                                    segments: 48,
                                    roughness: 0.9,
                                  },
                                ),
                                addCylinderMesh(
                                  itemModelNode,
                                  handleSmallKnobRadius * 0.32,
                                  handleSmallKnobRadius * 0.52,
                                  smallKnobBaseY,
                                  smallKnobX,
                                  smallKnobBaseY * 0.5,
                                  smallKnobZ,
                                  furnitureSoft,
                                  {
                                    segments: 40,
                                    roughness: 0.82,
                                  },
                                ));
                              const smallKnobBarDiameter = height6 * 0.07,
                                smallKnobCapDiameter = height6 * 0.055,
                                smallKnobBarCenterY =
                                  smallKnobBaseY + smallKnobBarDiameter * 0.5 + 0.001,
                                smallKnobCapCenterY =
                                  smallKnobBarCenterY +
                                  (smallKnobBarDiameter + smallKnobCapDiameter) * 0.5 +
                                  0.001;
                              (addCylinderMesh(
                                itemModelNode,
                                handleSmallKnobRadius * 1.02,
                                handleSmallKnobRadius * 1.02,
                                smallKnobBarDiameter,
                                smallKnobX,
                                smallKnobBarCenterY,
                                smallKnobZ,
                                furnitureDark,
                                {
                                  segments: 48,
                                  roughness: 0.72,
                                },
                              ),
                                addCylinderMesh(
                                  itemModelNode,
                                  handleSmallKnobRadius,
                                  handleSmallKnobRadius,
                                  smallKnobCapDiameter,
                                  smallKnobX,
                                  smallKnobCapCenterY,
                                  smallKnobZ,
                                  furnitureLight,
                                  {
                                    segments: 48,
                                    roughness: 0.9,
                                  },
                                ));
                            } else {
                              if (modelItem.type === "squarecoffeetable") {
                                const drawerFrontHeight = Math.max(height6 * 0.22, 0.085),
                                  drawerGapHeight = Math.max(height6 * 0.16, 0.065),
                                  drawerTopOffset = drawerFrontHeight + 0.012,
                                  drawerPanelHeight = Math.max(
                                    height6 - drawerTopOffset - drawerGapHeight,
                                    0.16,
                                  ),
                                  drawerSideWidth = Math.max(width6 * 0.075, 0.045),
                                  drawerFrontDepth = Math.max(depth * 0.035, 0.018),
                                  drawerFrontPanelHeight = drawerPanelHeight * 0.72,
                                  drawerFrontPanelY = drawerTopOffset + drawerPanelHeight * 0.48,
                                  drawerHandleWidth = width6 * 0.27,
                                  drawerHandleOffset = width6 * 0.34,
                                  drawerFrontColor = furniture,
                                  drawerHandleColor = furnitureSoft;
                                (addBoxMesh(
                                  itemModelNode,
                                  width6 * 0.98,
                                  drawerGapHeight,
                                  depth * 1.03,
                                  0,
                                  drawerTopOffset + drawerPanelHeight + drawerGapHeight * 0.5,
                                  0,
                                  drawerHandleColor,
                                  {
                                    radius: Math.min(width6, depth) * 0.035,
                                    roughness: 0.5,
                                    metalness: 0.02,
                                  },
                                ),
                                  addBoxMesh(
                                    itemModelNode,
                                    drawerSideWidth,
                                    drawerPanelHeight,
                                    depth * 0.92,
                                    -width6 * 0.5 + drawerSideWidth * 0.5,
                                    drawerTopOffset + drawerPanelHeight * 0.5,
                                    0,
                                    drawerFrontColor,
                                    {
                                      rounded: false,
                                      roughness: 0.6,
                                    },
                                  ),
                                  addBoxMesh(
                                    itemModelNode,
                                    drawerSideWidth,
                                    drawerPanelHeight,
                                    depth * 0.92,
                                    width6 * 0.5 - drawerSideWidth * 0.5,
                                    drawerTopOffset + drawerPanelHeight * 0.5,
                                    0,
                                    drawerFrontColor,
                                    {
                                      rounded: false,
                                      roughness: 0.6,
                                    },
                                  ),
                                  addBoxMesh(
                                    itemModelNode,
                                    width6 * 0.86,
                                    drawerPanelHeight * 0.9,
                                    0.035,
                                    0,
                                    drawerTopOffset + drawerPanelHeight * 0.52,
                                    -depth * 0.45,
                                    drawerFrontColor,
                                    {
                                      rounded: false,
                                      roughness: 0.75,
                                    },
                                  ),
                                  addBoxMesh(
                                    itemModelNode,
                                    width6 * 0.86,
                                    drawerPanelHeight * 0.1,
                                    depth * 0.9,
                                    0,
                                    drawerTopOffset + drawerPanelHeight * 0.08,
                                    0,
                                    drawerFrontColor,
                                    {
                                      rounded: false,
                                      roughness: 0.58,
                                    },
                                  ));
                                for (const drawerHandleX of [
                                  -drawerHandleOffset,
                                  0,
                                  drawerHandleOffset,
                                ]) {
                                  addBoxMesh(
                                    itemModelNode,
                                    drawerHandleWidth,
                                    drawerFrontPanelHeight,
                                    drawerFrontDepth,
                                    drawerHandleX,
                                    drawerFrontPanelY,
                                    depth * 0.48,
                                    drawerHandleColor,
                                    {
                                      radius: Math.min(width6, depth) * 0.025,
                                      roughness: 0.52,
                                    },
                                  );
                                  const handleBarY =
                                    drawerHandleX === 0
                                      ? 0
                                      : drawerHandleX +
                                        (drawerHandleX < 0
                                          ? drawerHandleWidth * 0.3
                                          : -drawerHandleWidth * 0.3);
                                  addBoxMesh(
                                    itemModelNode,
                                    0.022,
                                    drawerFrontPanelHeight * 0.2,
                                    0.025,
                                    handleBarY,
                                    drawerFrontPanelY,
                                    depth * 0.505,
                                    furnitureDark,
                                    {
                                      radius: 0.009,
                                      metalness: 0.22,
                                      roughness: 0.3,
                                    },
                                  );
                                }
                                const legRadius = Math.max(Math.min(width6, depth) * 0.055, 0.035);
                                for (const legOffsetX of [-width6 * 0.4, width6 * 0.4])
                                  for (const legOffsetZ of [-depth * 0.36, depth * 0.36]) {
                                    const legMesh = addBoxMesh(
                                      itemModelNode,
                                      legRadius,
                                      drawerFrontHeight,
                                      legRadius,
                                      legOffsetX,
                                      drawerFrontHeight * 0.5,
                                      legOffsetZ,
                                      furnitureDark,
                                      {
                                        radius: legRadius * 0.22,
                                        roughness: 0.55,
                                        metalness: 0.02,
                                      },
                                    );
                                    ((legMesh.rotation.z = (legOffsetX < 0 ? -1 : 1) * 0.09),
                                      (legMesh.rotation.x = (legOffsetZ < 0 ? -1 : 1) * 0.06));
                                  }
                              } else {
                                if (modelItem.type === "chair")
                                  addFurnitureAssembly(
                                    itemModelNode,
                                    width6,
                                    depth,
                                    height6,
                                    0,
                                    0,
                                    0,
                                    furniture,
                                    furnitureDark,
                                  );
                                else {
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
                                  } else {
                                    if (modelItem.type === "shoecabinet") {
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
                                    } else {
                                      if (modelItem.type === "cabinet")
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
                                      else {
                                        if (modelItem.type === "glasscabinet") {
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
                                        } else {
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
                                          } else {
                                            if (modelItem.type === "shelf") {
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
                                            } else {
                                              if (modelItem.type === "pillar") {
                                                const pillarWallOpacity = Math.min(
                                                    yt4.wallOpacity * 1.75,
                                                    0.55,
                                                  ),
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
                                              } else {
                                                if (modelItem.type === "wallcabinet") {
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
                                                } else {
                                                  if (
                                                    [
                                                      "kitchenbase",
                                                      "kitchensink",
                                                      "kitchencooktop",
                                                    ].includes(modelItem.type)
                                                  ) {
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
                                                  } else {
                                                    if (modelItem.type === "fridge") {
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
                                                    } else {
                                                      if (modelItem.type === "storagewaterheater") {
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
                                                      } else {
                                                        if (modelItem.type === "gaswaterheater") {
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
                                                        } else {
                                                          if (
                                                            modelItem.type ===
                                                            "pipelinewaterpurifier"
                                                          ) {
                                                            const purifierBodyHeight =
                                                              height6 * 0.9;
                                                            (addBoxMesh(
                                                              itemModelNode,
                                                              width6,
                                                              purifierBodyHeight,
                                                              depth,
                                                              0,
                                                              purifierBodyHeight * 0.5,
                                                              0,
                                                              furnitureLight,
                                                              {
                                                                rounded: false,
                                                                metalness: 0.04,
                                                                roughness: 0.4,
                                                              },
                                                            ),
                                                              addBoxMesh(
                                                                itemModelNode,
                                                                width6 * 0.92,
                                                                purifierBodyHeight * 0.27,
                                                                0.028,
                                                                0,
                                                                height6 * 0.76,
                                                                depth * 0.515,
                                                                furnitureDark,
                                                                {
                                                                  rounded: false,
                                                                  metalness: 0.16,
                                                                  roughness: 0.18,
                                                                },
                                                              ),
                                                              addBoxMesh(
                                                                itemModelNode,
                                                                width6 * 0.34,
                                                                purifierBodyHeight * 0.045,
                                                                0.014,
                                                                -width6 * 0.08,
                                                                height6 * 0.79,
                                                                depth * 0.54,
                                                                10470608,
                                                                {
                                                                  rounded: false,
                                                                  emissive: 10470608,
                                                                  emissiveIntensity: 0.2,
                                                                  roughness: 0.22,
                                                                },
                                                              ));
                                                            for (const purifierValveOffset of [
                                                              -0.26, 0, 0.26,
                                                            ])
                                                              addCylinderMesh(
                                                                itemModelNode,
                                                                Math.min(width6, depth) * 0.055,
                                                                Math.min(width6, depth) * 0.055,
                                                                0.018,
                                                                width6 * purifierValveOffset,
                                                                height6 * 0.66,
                                                                depth * 0.535,
                                                                furnitureSoft,
                                                                {
                                                                  segments: 24,
                                                                  rotationX: Math.PI / 2,
                                                                  metalness: 0.22,
                                                                  roughness: 0.28,
                                                                },
                                                              );
                                                            for (const purifierFootX of [
                                                              -width6 * 0.2,
                                                              width6 * 0.2,
                                                            ])
                                                              (addCylinderMesh(
                                                                itemModelNode,
                                                                0.014,
                                                                0.014,
                                                                height6 * 0.12,
                                                                purifierFootX,
                                                                height6 * 0.49,
                                                                depth * 0.48,
                                                                furnitureDark,
                                                                {
                                                                  segments: 18,
                                                                  metalness: 0.46,
                                                                  roughness: 0.22,
                                                                },
                                                              ),
                                                                addCylinderMesh(
                                                                  itemModelNode,
                                                                  0.024,
                                                                  0.018,
                                                                  0.035,
                                                                  purifierFootX,
                                                                  height6 * 0.425,
                                                                  depth * 0.52,
                                                                  furnitureDark,
                                                                  {
                                                                    segments: 18,
                                                                    rotationX: Math.PI / 2,
                                                                    metalness: 0.46,
                                                                    roughness: 0.22,
                                                                  },
                                                                ));
                                                            (addBoxMesh(
                                                              itemModelNode,
                                                              width6 * 0.68,
                                                              height6 * 0.045,
                                                              depth * 0.52,
                                                              0,
                                                              height6 * 0.11,
                                                              depth * 0.16,
                                                              furnitureDark,
                                                              {
                                                                rounded: false,
                                                                metalness: 0.2,
                                                                roughness: 0.3,
                                                              },
                                                            ),
                                                              addBoxMesh(
                                                                itemModelNode,
                                                                width6 * 0.42,
                                                                0.028,
                                                                depth * 0.28,
                                                                0,
                                                                height6 * 0.16,
                                                                depth * 0.28,
                                                                furnitureSoft,
                                                                {
                                                                  rounded: false,
                                                                  roughness: 0.34,
                                                                },
                                                              ));
                                                          } else {
                                                            if (
                                                              modelItem.type === "tea_bar_machine"
                                                            ) {
                                                              const teabarBaseHeight =
                                                                  height6 * 0.67,
                                                                teabarCounterY =
                                                                  teabarBaseHeight +
                                                                  height6 * 0.045,
                                                                teabarBackHeight =
                                                                  height6 - teabarCounterY;
                                                              (addBoxMesh(
                                                                itemModelNode,
                                                                width6,
                                                                teabarBaseHeight,
                                                                depth,
                                                                0,
                                                                teabarBaseHeight * 0.5,
                                                                0,
                                                                furnitureLight,
                                                                {
                                                                  rounded: false,
                                                                  roughness: 0.5,
                                                                  metalness: 0.04,
                                                                },
                                                              ),
                                                                addBoxMesh(
                                                                  itemModelNode,
                                                                  width6 * 0.94,
                                                                  0.028,
                                                                  depth * 1.02,
                                                                  0,
                                                                  teabarBaseHeight * 0.5,
                                                                  depth * 0.515,
                                                                  furnitureDark,
                                                                  {
                                                                    rounded: false,
                                                                    roughness: 0.34,
                                                                  },
                                                                ),
                                                                addBoxMesh(
                                                                  itemModelNode,
                                                                  width6 * 0.94,
                                                                  0.032,
                                                                  depth * 1.02,
                                                                  0,
                                                                  teabarBaseHeight,
                                                                  0,
                                                                  furnitureSoft,
                                                                  {
                                                                    rounded: false,
                                                                    roughness: 0.42,
                                                                  },
                                                                ),
                                                                addBoxMesh(
                                                                  itemModelNode,
                                                                  width6 * 0.94,
                                                                  height6 * 0.04,
                                                                  depth * 1.04,
                                                                  0,
                                                                  teabarCounterY,
                                                                  0,
                                                                  furnitureLight,
                                                                  {
                                                                    rounded: false,
                                                                    roughness: 0.36,
                                                                    metalness: 0.1,
                                                                  },
                                                                ),
                                                                addBoxMesh(
                                                                  itemModelNode,
                                                                  width6 * 0.92,
                                                                  teabarBackHeight,
                                                                  0.032,
                                                                  0,
                                                                  teabarCounterY +
                                                                    teabarBackHeight * 0.5,
                                                                  -depth * 0.46,
                                                                  furnitureSoft,
                                                                  {
                                                                    rounded: false,
                                                                    roughness: 0.56,
                                                                  },
                                                                ));
                                                              for (const teabarPillarX of [
                                                                -width6 * 0.46,
                                                                width6 * 0.46,
                                                              ])
                                                                addBoxMesh(
                                                                  itemModelNode,
                                                                  width6 * 0.075,
                                                                  teabarBackHeight,
                                                                  depth * 0.78,
                                                                  teabarPillarX,
                                                                  teabarCounterY +
                                                                    teabarBackHeight * 0.5,
                                                                  0,
                                                                  furnitureLight,
                                                                  {
                                                                    rounded: false,
                                                                    roughness: 0.48,
                                                                  },
                                                                );
                                                              addBoxMesh(
                                                                itemModelNode,
                                                                width6 * 0.86,
                                                                height6 * 0.14,
                                                                depth * 0.18,
                                                                0,
                                                                height6 * 0.9,
                                                                depth * 0.48,
                                                                furnitureDark,
                                                                {
                                                                  rounded: false,
                                                                  metalness: 0.32,
                                                                  roughness: 0.22,
                                                                },
                                                              );
                                                              for (const teabarBottleX of [
                                                                -width6 * 0.22,
                                                                width6 * 0.22,
                                                              ]) {
                                                                (addCylinderMesh(
                                                                  itemModelNode,
                                                                  Math.min(width6, depth) * 0.035,
                                                                  Math.min(width6, depth) * 0.035,
                                                                  0.018,
                                                                  teabarBottleX,
                                                                  height6 * 0.9,
                                                                  depth * 0.585,
                                                                  furnitureSoft,
                                                                  {
                                                                    segments: 20,
                                                                    rotationX: Math.PI / 2,
                                                                    metalness: 0.2,
                                                                    roughness: 0.25,
                                                                  },
                                                                ),
                                                                  addCylinderMesh(
                                                                    itemModelNode,
                                                                    0.012,
                                                                    0.012,
                                                                    height6 * 0.11,
                                                                    teabarBottleX,
                                                                    height6 * 0.79,
                                                                    depth * 0.5,
                                                                    furnitureDark,
                                                                    {
                                                                      segments: 18,
                                                                      metalness: 0.48,
                                                                      roughness: 0.22,
                                                                    },
                                                                  ));
                                                                const teabarBottleSize =
                                                                  Math.min(width6, depth) * 0.16;
                                                                (addCylinderMesh(
                                                                  itemModelNode,
                                                                  teabarBottleSize * 0.9,
                                                                  teabarBottleSize,
                                                                  height6 * 0.13,
                                                                  teabarBottleX,
                                                                  height6 * 0.75,
                                                                  depth * 0.12,
                                                                  teabarBottleX < 0
                                                                    ? 8752009
                                                                    : furnitureSoft,
                                                                  {
                                                                    segments: 28,
                                                                    metalness: 0.08,
                                                                    roughness: 0.34,
                                                                  },
                                                                ),
                                                                  addCylinderMesh(
                                                                    itemModelNode,
                                                                    teabarBottleSize * 0.84,
                                                                    teabarBottleSize * 0.84,
                                                                    0.016,
                                                                    teabarBottleX,
                                                                    height6 * 0.82,
                                                                    depth * 0.12,
                                                                    furnitureDark,
                                                                    {
                                                                      segments: 28,
                                                                      metalness: 0.18,
                                                                      roughness: 0.28,
                                                                    },
                                                                  ),
                                                                  addBoxMesh(
                                                                    itemModelNode,
                                                                    width6 * 0.12,
                                                                    height6 * 0.06,
                                                                    0.016,
                                                                    teabarBottleX,
                                                                    height6 * 0.77,
                                                                    depth * 0.3,
                                                                    furnitureDark,
                                                                    {
                                                                      radius: 0.012,
                                                                      metalness: 0.24,
                                                                      roughness: 0.24,
                                                                    },
                                                                  ));
                                                              }
                                                              addBoxMesh(
                                                                itemModelNode,
                                                                width6 * 0.92,
                                                                height6 * 0.055,
                                                                depth * 0.82,
                                                                0,
                                                                0.028,
                                                                0,
                                                                furnitureDark,
                                                                {
                                                                  rounded: false,
                                                                  roughness: 0.36,
                                                                },
                                                              );
                                                            } else {
                                                              if (
                                                                modelItem.type === "washer" ||
                                                                modelItem.type === "dryer"
                                                              ) {
                                                                const isDryer =
                                                                    modelItem.type === "dryer",
                                                                  washerDrumRadius =
                                                                    width6 *
                                                                    (isDryer ? 0.32 : 0.29);
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
                                                                    rounded: false,
                                                                    metalness: 0.1,
                                                                    roughness: 0.48,
                                                                  },
                                                                ),
                                                                  addBoxMesh(
                                                                    itemModelNode,
                                                                    width6 * 0.92,
                                                                    height6 * 0.18,
                                                                    0.035,
                                                                    0,
                                                                    height6 * 0.86,
                                                                    depth * 0.505,
                                                                    furnitureSoft,
                                                                    {
                                                                      rounded: false,
                                                                      roughness: 0.4,
                                                                    },
                                                                  ),
                                                                  addCylinderMesh(
                                                                    itemModelNode,
                                                                    washerDrumRadius,
                                                                    washerDrumRadius,
                                                                    0.045,
                                                                    0,
                                                                    height6 * 0.47,
                                                                    depth * 0.515,
                                                                    furnitureDark,
                                                                    {
                                                                      segments: 40,
                                                                      rotationX: Math.PI / 2,
                                                                      metalness: 0.32,
                                                                      roughness: 0.28,
                                                                    },
                                                                  ),
                                                                  addCylinderMesh(
                                                                    itemModelNode,
                                                                    washerDrumRadius * 0.74,
                                                                    washerDrumRadius * 0.74,
                                                                    0.03,
                                                                    0,
                                                                    height6 * 0.47,
                                                                    depth * 0.545,
                                                                    isDryer ? 2502715 : 3622485,
                                                                    {
                                                                      segments: 40,
                                                                      rotationX: Math.PI / 2,
                                                                      metalness: 0.08,
                                                                      roughness: 0.22,
                                                                    },
                                                                  ),
                                                                  addCylinderMesh(
                                                                    itemModelNode,
                                                                    width6 * 0.055,
                                                                    width6 * 0.055,
                                                                    0.035,
                                                                    width6 * 0.27,
                                                                    height6 * 0.86,
                                                                    depth * 0.535,
                                                                    furnitureDark,
                                                                    {
                                                                      segments: 24,
                                                                      rotationX: Math.PI / 2,
                                                                      metalness: 0.4,
                                                                      roughness: 0.25,
                                                                    },
                                                                  ),
                                                                  addBoxMesh(
                                                                    itemModelNode,
                                                                    width6 * 0.25,
                                                                    height6 * 0.035,
                                                                    0.026,
                                                                    -width6 * 0.23,
                                                                    height6 * 0.86,
                                                                    depth * 0.535,
                                                                    furnitureDark,
                                                                    {
                                                                      rounded: false,
                                                                      roughness: 0.3,
                                                                    },
                                                                  ),
                                                                  isDryer ||
                                                                    addBoxMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.2,
                                                                      height6 * 0.055,
                                                                      0.025,
                                                                      -width6 * 0.3,
                                                                      height6 * 0.12,
                                                                      depth * 0.525,
                                                                      furnitureSoft,
                                                                      {
                                                                        rounded: false,
                                                                        roughness: 0.42,
                                                                      },
                                                                    ));
                                                              } else {
                                                                if (
                                                                  modelItem.type === "dishwasher"
                                                                ) {
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
                                                                      rounded: false,
                                                                      metalness: 0.12,
                                                                      roughness: 0.48,
                                                                    },
                                                                  ),
                                                                    addBoxMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.93,
                                                                      height6 * 0.74,
                                                                      0.028,
                                                                      0,
                                                                      height6 * 0.46,
                                                                      depth * 0.515,
                                                                      furnitureSoft,
                                                                      {
                                                                        rounded: false,
                                                                        metalness: 0.08,
                                                                        roughness: 0.44,
                                                                      },
                                                                    ),
                                                                    addBoxMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.93,
                                                                      height6 * 0.14,
                                                                      0.032,
                                                                      0,
                                                                      height6 * 0.87,
                                                                      depth * 0.52,
                                                                      furnitureDark,
                                                                      {
                                                                        rounded: false,
                                                                        metalness: 0.18,
                                                                        roughness: 0.3,
                                                                      },
                                                                    ),
                                                                    addBoxMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.58,
                                                                      height6 * 0.026,
                                                                      0.034,
                                                                      0,
                                                                      height6 * 0.78,
                                                                      depth * 0.54,
                                                                      furnitureDark,
                                                                      {
                                                                        rounded: false,
                                                                        metalness: 0.5,
                                                                        roughness: 0.22,
                                                                      },
                                                                    ),
                                                                    addBoxMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.9,
                                                                      height6 * 0.075,
                                                                      depth * 0.78,
                                                                      0,
                                                                      height6 * 0.038,
                                                                      -depth * 0.04,
                                                                      furnitureDark,
                                                                      {
                                                                        rounded: false,
                                                                        roughness: 0.4,
                                                                      },
                                                                    ));
                                                                  for (const dishwasherKnobRatio of [
                                                                    0.22, 0.31, 0.4,
                                                                  ])
                                                                    addCylinderMesh(
                                                                      itemModelNode,
                                                                      width6 * 0.018,
                                                                      width6 * 0.018,
                                                                      0.012,
                                                                      width6 * dishwasherKnobRatio,
                                                                      height6 * 0.88,
                                                                      depth * 0.545,
                                                                      furnitureSoft,
                                                                      {
                                                                        segments: 18,
                                                                        rotationX: Math.PI / 2,
                                                                        metalness: 0.26,
                                                                        roughness: 0.24,
                                                                      },
                                                                    );
                                                                } else {
                                                                  if (
                                                                    modelItem.type === "steamoven"
                                                                  ) {
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
                                                                        rounded: false,
                                                                        metalness: 0.16,
                                                                        roughness: 0.42,
                                                                      },
                                                                    ),
                                                                      addBoxMesh(
                                                                        itemModelNode,
                                                                        width6 * 0.94,
                                                                        height6 * 0.9,
                                                                        0.026,
                                                                        0,
                                                                        height6 * 0.5,
                                                                        depth * 0.515,
                                                                        furnitureDark,
                                                                        {
                                                                          rounded: false,
                                                                          metalness: 0.18,
                                                                          roughness: 0.25,
                                                                        },
                                                                      ),
                                                                      addBoxMesh(
                                                                        itemModelNode,
                                                                        width6 * 0.78,
                                                                        height6 * 0.56,
                                                                        0.018,
                                                                        -width6 * 0.03,
                                                                        height6 * 0.42,
                                                                        depth * 0.54,
                                                                        1515819,
                                                                        {
                                                                          rounded: false,
                                                                          metalness: 0.12,
                                                                          roughness: 0.18,
                                                                        },
                                                                      ),
                                                                      addBoxMesh(
                                                                        itemModelNode,
                                                                        width6 * 0.72,
                                                                        height6 * 0.035,
                                                                        0.038,
                                                                        -width6 * 0.03,
                                                                        height6 * 0.74,
                                                                        depth * 0.56,
                                                                        furnitureSoft,
                                                                        {
                                                                          rounded: false,
                                                                          metalness: 0.52,
                                                                          roughness: 0.22,
                                                                        },
                                                                      ),
                                                                      addBoxMesh(
                                                                        itemModelNode,
                                                                        width6 * 0.24,
                                                                        height6 * 0.075,
                                                                        0.022,
                                                                        0,
                                                                        height6 * 0.86,
                                                                        depth * 0.545,
                                                                        7706534,
                                                                        {
                                                                          rounded: false,
                                                                          emissive: 7706534,
                                                                          emissiveIntensity: 0.18,
                                                                          roughness: 0.2,
                                                                        },
                                                                      ));
                                                                    for (const steamovenHandleRatio of [
                                                                      -0.36, 0.36,
                                                                    ])
                                                                      addCylinderMesh(
                                                                        itemModelNode,
                                                                        width6 * 0.045,
                                                                        width6 * 0.045,
                                                                        0.026,
                                                                        width6 *
                                                                          steamovenHandleRatio,
                                                                        height6 * 0.86,
                                                                        depth * 0.55,
                                                                        furnitureSoft,
                                                                        {
                                                                          segments: 24,
                                                                          rotationX: Math.PI / 2,
                                                                          metalness: 0.4,
                                                                          roughness: 0.24,
                                                                        },
                                                                      );
                                                                  } else {
                                                                    if (
                                                                      modelItem.type === "microwave"
                                                                    ) {
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
                                                                          rounded: false,
                                                                          metalness: 0.12,
                                                                          roughness: 0.44,
                                                                        },
                                                                      ),
                                                                        addBoxMesh(
                                                                          itemModelNode,
                                                                          width6 * 0.93,
                                                                          height6 * 0.82,
                                                                          0.025,
                                                                          0,
                                                                          height6 * 0.49,
                                                                          depth * 0.515,
                                                                          furnitureDark,
                                                                          {
                                                                            rounded: false,
                                                                            metalness: 0.16,
                                                                            roughness: 0.24,
                                                                          },
                                                                        ),
                                                                        addBoxMesh(
                                                                          itemModelNode,
                                                                          width6 * 0.62,
                                                                          height6 * 0.63,
                                                                          0.018,
                                                                          -width6 * 0.13,
                                                                          height6 * 0.48,
                                                                          depth * 0.54,
                                                                          1515819,
                                                                          {
                                                                            rounded: false,
                                                                            metalness: 0.12,
                                                                            roughness: 0.18,
                                                                          },
                                                                        ),
                                                                        addBoxMesh(
                                                                          itemModelNode,
                                                                          width6 * 0.035,
                                                                          height6 * 0.54,
                                                                          0.03,
                                                                          width6 * 0.19,
                                                                          height6 * 0.48,
                                                                          depth * 0.55,
                                                                          furnitureSoft,
                                                                          {
                                                                            rounded: false,
                                                                            metalness: 0.46,
                                                                            roughness: 0.22,
                                                                          },
                                                                        ),
                                                                        addBoxMesh(
                                                                          itemModelNode,
                                                                          width6 * 0.17,
                                                                          height6 * 0.1,
                                                                          0.02,
                                                                          width6 * 0.36,
                                                                          height6 * 0.72,
                                                                          depth * 0.54,
                                                                          7706534,
                                                                          {
                                                                            rounded: false,
                                                                            emissive: 7706534,
                                                                            emissiveIntensity: 0.16,
                                                                            roughness: 0.2,
                                                                          },
                                                                        ));
                                                                      for (const microwaveKnobRatio of [
                                                                        0.48, 0.34, 0.2,
                                                                      ])
                                                                        addBoxMesh(
                                                                          itemModelNode,
                                                                          width6 * 0.13,
                                                                          height6 * 0.055,
                                                                          0.018,
                                                                          width6 * 0.36,
                                                                          height6 *
                                                                            microwaveKnobRatio,
                                                                          depth * 0.545,
                                                                          furnitureSoft,
                                                                          {
                                                                            rounded: false,
                                                                            roughness: 0.3,
                                                                          },
                                                                        );
                                                                    } else {
                                                                      if (
                                                                        modelItem.type ===
                                                                        "ricecooker"
                                                                      ) {
                                                                        const ricecookerPotRadius =
                                                                          Math.min(width6, depth) *
                                                                          0.47;
                                                                        (addCylinderMesh(
                                                                          itemModelNode,
                                                                          ricecookerPotRadius * 0.9,
                                                                          ricecookerPotRadius,
                                                                          height6 * 0.68,
                                                                          0,
                                                                          height6 * 0.38,
                                                                          0,
                                                                          furnitureLight,
                                                                          {
                                                                            segments: 36,
                                                                            roughness: 0.46,
                                                                          },
                                                                        ),
                                                                          addCylinderMesh(
                                                                            itemModelNode,
                                                                            ricecookerPotRadius *
                                                                              0.94,
                                                                            ricecookerPotRadius *
                                                                              0.94,
                                                                            height6 * 0.12,
                                                                            0,
                                                                            height6 * 0.77,
                                                                            0,
                                                                            furnitureSoft,
                                                                            {
                                                                              segments: 36,
                                                                              roughness: 0.38,
                                                                            },
                                                                          ),
                                                                          addCylinderMesh(
                                                                            itemModelNode,
                                                                            ricecookerPotRadius *
                                                                              0.72,
                                                                            ricecookerPotRadius *
                                                                              0.74,
                                                                            height6 * 0.035,
                                                                            0,
                                                                            height6 * 0.85,
                                                                            0,
                                                                            furnitureDark,
                                                                            {
                                                                              segments: 32,
                                                                              metalness: 0.12,
                                                                              roughness: 0.28,
                                                                            },
                                                                          ),
                                                                          addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.5,
                                                                            height6 * 0.16,
                                                                            0.026,
                                                                            0,
                                                                            height6 * 0.42,
                                                                            depth * 0.47,
                                                                            furnitureDark,
                                                                            {
                                                                              radius:
                                                                                Math.min(
                                                                                  width6,
                                                                                  depth,
                                                                                ) * 0.04,
                                                                              roughness: 0.28,
                                                                            },
                                                                          ),
                                                                          addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.24,
                                                                            height6 * 0.06,
                                                                            0.018,
                                                                            0,
                                                                            height6 * 0.43,
                                                                            depth * 0.49,
                                                                            7706534,
                                                                            {
                                                                              rounded: false,
                                                                              emissive: 7706534,
                                                                              emissiveIntensity: 0.16,
                                                                              roughness: 0.2,
                                                                            },
                                                                          ),
                                                                          addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.05,
                                                                            height6 * 0.16,
                                                                            depth * 0.1,
                                                                            -width6 * 0.27,
                                                                            height6 * 0.86,
                                                                            0,
                                                                            furnitureDark,
                                                                            {
                                                                              roughness: 0.3,
                                                                            },
                                                                          ),
                                                                          addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.05,
                                                                            height6 * 0.16,
                                                                            depth * 0.1,
                                                                            width6 * 0.27,
                                                                            height6 * 0.86,
                                                                            0,
                                                                            furnitureDark,
                                                                            {
                                                                              roughness: 0.3,
                                                                            },
                                                                          ),
                                                                          addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.58,
                                                                            height6 * 0.055,
                                                                            depth * 0.1,
                                                                            0,
                                                                            height6 * 0.94,
                                                                            0,
                                                                            furnitureDark,
                                                                            {
                                                                              roughness: 0.3,
                                                                            },
                                                                          ));
                                                                      } else {
                                                                        if (
                                                                          modelItem.type ===
                                                                          "rangehood"
                                                                        )
                                                                          (addBoxMesh(
                                                                            itemModelNode,
                                                                            width6 * 0.34,
                                                                            height6 * 0.72,
                                                                            depth * 0.42,
                                                                            0,
                                                                            height6 * 0.6,
                                                                            -depth * 0.18,
                                                                            furniture,
                                                                            {
                                                                              rounded: false,
                                                                              metalness: 0.22,
                                                                              roughness: 0.42,
                                                                            },
                                                                          ),
                                                                            addBoxMesh(
                                                                              itemModelNode,
                                                                              width6,
                                                                              height6 * 0.22,
                                                                              depth,
                                                                              0,
                                                                              height6 * 0.18,
                                                                              0,
                                                                              furnitureLight,
                                                                              {
                                                                                rounded: false,
                                                                                metalness: 0.2,
                                                                                roughness: 0.4,
                                                                              },
                                                                            ),
                                                                            addBoxMesh(
                                                                              itemModelNode,
                                                                              width6 * 0.9,
                                                                              height6 * 0.07,
                                                                              depth * 0.8,
                                                                              0,
                                                                              height6 * 0.055,
                                                                              depth * 0.02,
                                                                              furnitureDark,
                                                                              {
                                                                                rounded: false,
                                                                                metalness: 0.35,
                                                                                roughness: 0.28,
                                                                              },
                                                                            ),
                                                                            addBoxMesh(
                                                                              itemModelNode,
                                                                              width6 * 0.22,
                                                                              height6 * 0.035,
                                                                              0.025,
                                                                              width6 * 0.3,
                                                                              height6 * 0.2,
                                                                              depth * 0.515,
                                                                              furnitureSoft,
                                                                              {
                                                                                rounded: false,
                                                                                emissive:
                                                                                  furnitureSoft,
                                                                                emissiveIntensity: 0.12,
                                                                                roughness: 0.3,
                                                                              },
                                                                            ));
                                                                        else {
                                                                          if (
                                                                            modelItem.type ===
                                                                            "wallac"
                                                                          )
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
                                                                          else {
                                                                            if (
                                                                              modelItem.type ===
                                                                              "floorac"
                                                                            ) {
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
                                                                            } else {
                                                                              if (
                                                                                modelItem.type ===
                                                                                "robotvacuum"
                                                                              )
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
                                                                              else {
                                                                                if (
                                                                                  modelItem.type ===
                                                                                    "camera" ||
                                                                                  modelItem.type ===
                                                                                    "presence"
                                                                                )
                                                                                  addSecurityModel2(
                                                                                    ns2,
                                                                                    itemModelNode,
                                                                                    modelItem,
                                                                                    yt4,
                                                                                  );
                                                                                else {
                                                                                  if (
                                                                                    modelItem.type ===
                                                                                    "nas"
                                                                                  ) {
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
                                                                                  } else {
                                                                                    if (
                                                                                      modelItem.type ===
                                                                                      "airpurifier"
                                                                                    ) {
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
                                                                                    } else {
                                                                                      if (
                                                                                        modelItem.type ===
                                                                                        "tv"
                                                                                      ) {
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
                                                                                      } else {
                                                                                        if (
                                                                                          modelItem.type ===
                                                                                          "vanity"
                                                                                        ) {
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
                                                                                        } else {
                                                                                          if (
                                                                                            modelItem.type ===
                                                                                            "desk"
                                                                                          )
                                                                                            (addBoxMesh(
                                                                                              itemModelNode,
                                                                                              width6,
                                                                                              height6 *
                                                                                                0.1,
                                                                                              depth,
                                                                                              0,
                                                                                              height6 *
                                                                                                0.93,
                                                                                              0,
                                                                                              furniture,
                                                                                            ),
                                                                                              addBoxMesh(
                                                                                                itemModelNode,
                                                                                                width6 *
                                                                                                  0.05,
                                                                                                height6 *
                                                                                                  0.88,
                                                                                                depth *
                                                                                                  0.82,
                                                                                                -width6 *
                                                                                                  0.44,
                                                                                                height6 *
                                                                                                  0.44,
                                                                                                0,
                                                                                                furnitureDark,
                                                                                              ),
                                                                                              addBoxMesh(
                                                                                                itemModelNode,
                                                                                                width6 *
                                                                                                  0.05,
                                                                                                height6 *
                                                                                                  0.88,
                                                                                                depth *
                                                                                                  0.82,
                                                                                                width6 *
                                                                                                  0.44,
                                                                                                height6 *
                                                                                                  0.44,
                                                                                                0,
                                                                                                furnitureDark,
                                                                                              ),
                                                                                              addBoxMesh(
                                                                                                itemModelNode,
                                                                                                width6 *
                                                                                                  0.34,
                                                                                                height6 *
                                                                                                  0.18,
                                                                                                depth *
                                                                                                  0.78,
                                                                                                width6 *
                                                                                                  0.22,
                                                                                                height6 *
                                                                                                  0.74,
                                                                                                0,
                                                                                                furniture,
                                                                                              ),
                                                                                              addBoxMesh(
                                                                                                itemModelNode,
                                                                                                width6 *
                                                                                                  0.27,
                                                                                                0.018,
                                                                                                depth *
                                                                                                  0.04,
                                                                                                width6 *
                                                                                                  0.22,
                                                                                                height6 *
                                                                                                  0.73,
                                                                                                depth *
                                                                                                  0.41,
                                                                                                furnitureLight,
                                                                                                {
                                                                                                  metalness: 0.35,
                                                                                                },
                                                                                              ));
                                                                                          else {
                                                                                            if (
                                                                                              modelItem.type ===
                                                                                              "desktop"
                                                                                            ) {
                                                                                              const desktopScreenWidth =
                                                                                                  width6 *
                                                                                                  0.72,
                                                                                                desktopScreenHeight =
                                                                                                  height6 *
                                                                                                  0.58;
                                                                                              (addBoxMesh(
                                                                                                itemModelNode,
                                                                                                desktopScreenWidth,
                                                                                                desktopScreenHeight,
                                                                                                0.035,
                                                                                                -width6 *
                                                                                                  0.06,
                                                                                                height6 *
                                                                                                  0.66,
                                                                                                -depth *
                                                                                                  0.25,
                                                                                                furnitureDark,
                                                                                                {
                                                                                                  rounded: false,
                                                                                                  roughness: 0.24,
                                                                                                },
                                                                                              ),
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  desktopScreenWidth *
                                                                                                    0.9,
                                                                                                  desktopScreenHeight *
                                                                                                    0.84,
                                                                                                  0.01,
                                                                                                  -width6 *
                                                                                                    0.06,
                                                                                                  height6 *
                                                                                                    0.66,
                                                                                                  -depth *
                                                                                                    0.19,
                                                                                                  659481,
                                                                                                  {
                                                                                                    rounded: false,
                                                                                                    roughness: 0.18,
                                                                                                    emissive: 1517112,
                                                                                                    emissiveIntensity: 0.35,
                                                                                                  },
                                                                                                ),
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  0.035,
                                                                                                  height6 *
                                                                                                    0.24,
                                                                                                  0.035,
                                                                                                  -width6 *
                                                                                                    0.06,
                                                                                                  height6 *
                                                                                                    0.25,
                                                                                                  -depth *
                                                                                                    0.25,
                                                                                                  furnitureDark,
                                                                                                  {
                                                                                                    metalness: 0.5,
                                                                                                  },
                                                                                                ),
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  width6 *
                                                                                                    0.28,
                                                                                                  0.025,
                                                                                                  depth *
                                                                                                    0.3,
                                                                                                  -width6 *
                                                                                                    0.06,
                                                                                                  0.02,
                                                                                                  -depth *
                                                                                                    0.22,
                                                                                                  furnitureDark,
                                                                                                  {
                                                                                                    metalness: 0.42,
                                                                                                  },
                                                                                                ),
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  width6 *
                                                                                                    0.58,
                                                                                                  0.022,
                                                                                                  depth *
                                                                                                    0.38,
                                                                                                  -width6 *
                                                                                                    0.08,
                                                                                                  0.025,
                                                                                                  depth *
                                                                                                    0.24,
                                                                                                  furnitureSoft,
                                                                                                  {
                                                                                                    rounded: false,
                                                                                                    roughness: 0.5,
                                                                                                  },
                                                                                                ),
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  width6 *
                                                                                                    0.1,
                                                                                                  0.035,
                                                                                                  depth *
                                                                                                    0.22,
                                                                                                  width6 *
                                                                                                    0.36,
                                                                                                  0.028,
                                                                                                  depth *
                                                                                                    0.24,
                                                                                                  furnitureSoft,
                                                                                                  {
                                                                                                    radius:
                                                                                                      Math.min(
                                                                                                        width6,
                                                                                                        depth,
                                                                                                      ) *
                                                                                                      0.035,
                                                                                                    roughness: 0.46,
                                                                                                  },
                                                                                                ));
                                                                                            } else {
                                                                                              if (
                                                                                                modelItem.type ===
                                                                                                "laptop"
                                                                                              ) {
                                                                                                addBoxMesh(
                                                                                                  itemModelNode,
                                                                                                  width6,
                                                                                                  0.025,
                                                                                                  depth *
                                                                                                    0.72,
                                                                                                  0,
                                                                                                  0.018,
                                                                                                  depth *
                                                                                                    0.08,
                                                                                                  furniture,
                                                                                                  {
                                                                                                    metalness: 0.28,
                                                                                                    roughness: 0.36,
                                                                                                  },
                                                                                                );
                                                                                                const laptopScreenMesh =
                                                                                                  addBoxMesh(
                                                                                                    itemModelNode,
                                                                                                    width6 *
                                                                                                      0.96,
                                                                                                    height6 *
                                                                                                      0.78,
                                                                                                    0.018,
                                                                                                    0,
                                                                                                    height6 *
                                                                                                      0.43,
                                                                                                    -depth *
                                                                                                      0.29,
                                                                                                    furnitureDark,
                                                                                                    {
                                                                                                      rounded: false,
                                                                                                      metalness: 0.22,
                                                                                                      roughness: 0.25,
                                                                                                    },
                                                                                                  );
                                                                                                ((laptopScreenMesh.rotation.x =
                                                                                                  -Math.PI *
                                                                                                  0.08),
                                                                                                  addBoxMesh(
                                                                                                    itemModelNode,
                                                                                                    width6 *
                                                                                                      0.86,
                                                                                                    height6 *
                                                                                                      0.63,
                                                                                                    0.01,
                                                                                                    0,
                                                                                                    height6 *
                                                                                                      0.43,
                                                                                                    -depth *
                                                                                                      0.278,
                                                                                                    659740,
                                                                                                    {
                                                                                                      rounded: false,
                                                                                                      emissive: 1585226,
                                                                                                      emissiveIntensity: 0.38,
                                                                                                      roughness: 0.18,
                                                                                                    },
                                                                                                  ),
                                                                                                  addBoxMesh(
                                                                                                    itemModelNode,
                                                                                                    width6 *
                                                                                                      0.62,
                                                                                                    0.009,
                                                                                                    depth *
                                                                                                      0.34,
                                                                                                    0,
                                                                                                    0.035,
                                                                                                    depth *
                                                                                                      0.12,
                                                                                                    furnitureDark,
                                                                                                    {
                                                                                                      rounded: false,
                                                                                                    },
                                                                                                  ));
                                                                                              } else {
                                                                                                if (
                                                                                                  modelItem.type ===
                                                                                                  "toilet"
                                                                                                ) {
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
                                                                                                } else {
                                                                                                  if (
                                                                                                    modelItem.type ===
                                                                                                    "squattoilet"
                                                                                                  ) {
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
                                                                                                  } else {
                                                                                                    if (
                                                                                                      modelItem.type ===
                                                                                                      "urinal"
                                                                                                    ) {
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
                                                                                                    } else {
                                                                                                      if (
                                                                                                        modelItem.type ===
                                                                                                        "bathtub"
                                                                                                      ) {
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
                                                                                                      } else {
                                                                                                        if (
                                                                                                          modelItem.type ===
                                                                                                          "walllamp"
                                                                                                        ) {
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
                                                                                                        } else {
                                                                                                          if (
                                                                                                            modelItem.type ===
                                                                                                            "glasspartition"
                                                                                                          ) {
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
                                                                                                          } else {
                                                                                                            if (
                                                                                                              modelItem.type ===
                                                                                                              "shower"
                                                                                                            ) {
                                                                                                              const showerMetal =
                                                                                                                  yt4.showerMetal ??
                                                                                                                  furnitureLight,
                                                                                                                showerRailZ =
                                                                                                                  -depth *
                                                                                                                  0.42,
                                                                                                                showerRailBottomY =
                                                                                                                  height6 *
                                                                                                                  0.13,
                                                                                                                showerRailTopY =
                                                                                                                  height6 *
                                                                                                                  0.9,
                                                                                                                showerRailHeight =
                                                                                                                  showerRailTopY -
                                                                                                                  showerRailBottomY,
                                                                                                                showerMetalOptions =
                                                                                                                  {
                                                                                                                    rounded: false,
                                                                                                                    metalness: 0.68,
                                                                                                                    roughness: 0.22,
                                                                                                                  };
                                                                                                              addBoxMesh(
                                                                                                                itemModelNode,
                                                                                                                0.045,
                                                                                                                showerRailHeight,
                                                                                                                0.045,
                                                                                                                0,
                                                                                                                (showerRailBottomY +
                                                                                                                  showerRailTopY) *
                                                                                                                  0.5,
                                                                                                                showerRailZ,
                                                                                                                showerMetal,
                                                                                                                showerMetalOptions,
                                                                                                              );
                                                                                                              for (const showerHingeY of [
                                                                                                                showerRailBottomY,
                                                                                                                height6 *
                                                                                                                  0.47,
                                                                                                                height6 *
                                                                                                                  0.78,
                                                                                                                showerRailTopY,
                                                                                                              ])
                                                                                                                addBoxMesh(
                                                                                                                  itemModelNode,
                                                                                                                  0.085,
                                                                                                                  0.085,
                                                                                                                  0.065,
                                                                                                                  0,
                                                                                                                  showerHingeY,
                                                                                                                  showerRailZ,
                                                                                                                  showerMetal,
                                                                                                                  showerMetalOptions,
                                                                                                                );
                                                                                                              for (const showerBracketY of [
                                                                                                                showerRailBottomY,
                                                                                                                showerRailTopY,
                                                                                                              ])
                                                                                                                addCylinderMesh(
                                                                                                                  itemModelNode,
                                                                                                                  width6 *
                                                                                                                    0.055,
                                                                                                                  width6 *
                                                                                                                    0.055,
                                                                                                                  0.04,
                                                                                                                  0,
                                                                                                                  showerBracketY,
                                                                                                                  -depth *
                                                                                                                    0.47,
                                                                                                                  showerMetal,
                                                                                                                  {
                                                                                                                    segments: 28,
                                                                                                                    rotationX:
                                                                                                                      Math.PI /
                                                                                                                      2,
                                                                                                                    metalness: 0.7,
                                                                                                                    roughness: 0.2,
                                                                                                                  },
                                                                                                                );
                                                                                                              const showerHeadY =
                                                                                                                height6 *
                                                                                                                0.12;
                                                                                                              addBoxMesh(
                                                                                                                itemModelNode,
                                                                                                                width6 *
                                                                                                                  0.36,
                                                                                                                0.065,
                                                                                                                0.065,
                                                                                                                0,
                                                                                                                showerHeadY,
                                                                                                                showerRailZ +
                                                                                                                  depth *
                                                                                                                    0.08,
                                                                                                                showerMetal,
                                                                                                                showerMetalOptions,
                                                                                                              );
                                                                                                              for (const showerHeadX of [
                                                                                                                -width6 *
                                                                                                                  0.2,
                                                                                                                width6 *
                                                                                                                  0.2,
                                                                                                              ])
                                                                                                                (addCylinderMesh(
                                                                                                                  itemModelNode,
                                                                                                                  width6 *
                                                                                                                    0.055,
                                                                                                                  width6 *
                                                                                                                    0.055,
                                                                                                                  0.045,
                                                                                                                  showerHeadX,
                                                                                                                  showerHeadY,
                                                                                                                  -depth *
                                                                                                                    0.45,
                                                                                                                  showerMetal,
                                                                                                                  {
                                                                                                                    segments: 28,
                                                                                                                    rotationX:
                                                                                                                      Math.PI /
                                                                                                                      2,
                                                                                                                    metalness: 0.7,
                                                                                                                    roughness: 0.2,
                                                                                                                  },
                                                                                                                ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.05,
                                                                                                                    0.05,
                                                                                                                    depth *
                                                                                                                      0.13,
                                                                                                                    showerHeadX,
                                                                                                                    showerHeadY,
                                                                                                                    showerRailZ +
                                                                                                                      depth *
                                                                                                                        0.01,
                                                                                                                    showerMetal,
                                                                                                                    showerMetalOptions,
                                                                                                                  ));
                                                                                                              addBoxMesh(
                                                                                                                itemModelNode,
                                                                                                                0.045,
                                                                                                                height6 *
                                                                                                                  0.12,
                                                                                                                0.045,
                                                                                                                0,
                                                                                                                showerHeadY -
                                                                                                                  height6 *
                                                                                                                    0.045,
                                                                                                                showerRailZ +
                                                                                                                  depth *
                                                                                                                    0.13,
                                                                                                                showerMetal,
                                                                                                                showerMetalOptions,
                                                                                                              );
                                                                                                              const showerRailTopPoint =
                                                                                                                  new ns2.Vector3(
                                                                                                                    0,
                                                                                                                    showerRailTopY,
                                                                                                                    showerRailZ,
                                                                                                                  ),
                                                                                                                showerHeadPoint =
                                                                                                                  new ns2.Vector3(
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.76,
                                                                                                                    depth *
                                                                                                                      0.08,
                                                                                                                  ),
                                                                                                                showerSpoutDeltaY =
                                                                                                                  showerHeadPoint.y -
                                                                                                                  showerRailTopPoint.y,
                                                                                                                showerSpoutDeltaZ =
                                                                                                                  showerHeadPoint.z -
                                                                                                                  showerRailTopPoint.z,
                                                                                                                hypot4 =
                                                                                                                  Math.hypot(
                                                                                                                    showerSpoutDeltaY,
                                                                                                                    showerSpoutDeltaZ,
                                                                                                                  ),
                                                                                                                showerSpoutMesh =
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.055,
                                                                                                                    hypot4,
                                                                                                                    0.055,
                                                                                                                    0,
                                                                                                                    (showerRailTopPoint.y +
                                                                                                                      showerHeadPoint.y) *
                                                                                                                      0.5,
                                                                                                                    (showerRailTopPoint.z +
                                                                                                                      showerHeadPoint.z) *
                                                                                                                      0.5,
                                                                                                                    showerMetal,
                                                                                                                    showerMetalOptions,
                                                                                                                  );
                                                                                                              ((showerSpoutMesh.rotation.x =
                                                                                                                Math.atan2(
                                                                                                                  showerSpoutDeltaZ,
                                                                                                                  showerSpoutDeltaY,
                                                                                                                )),
                                                                                                                addBoxMesh(
                                                                                                                  itemModelNode,
                                                                                                                  0.055,
                                                                                                                  height6 *
                                                                                                                    0.13,
                                                                                                                  0.055,
                                                                                                                  0,
                                                                                                                  height6 *
                                                                                                                    0.705,
                                                                                                                  showerHeadPoint.z,
                                                                                                                  showerMetal,
                                                                                                                  showerMetalOptions,
                                                                                                                ),
                                                                                                                addBoxMesh(
                                                                                                                  itemModelNode,
                                                                                                                  width6 *
                                                                                                                    0.34,
                                                                                                                  0.035,
                                                                                                                  depth *
                                                                                                                    0.3,
                                                                                                                  0,
                                                                                                                  height6 *
                                                                                                                    0.64,
                                                                                                                  showerHeadPoint.z +
                                                                                                                    depth *
                                                                                                                      0.03,
                                                                                                                  showerMetal,
                                                                                                                  {
                                                                                                                    rounded: false,
                                                                                                                    metalness: 0.64,
                                                                                                                    roughness: 0.24,
                                                                                                                  },
                                                                                                                ));
                                                                                                            } else {
                                                                                                              if (
                                                                                                                modelItem.type ===
                                                                                                                "basin"
                                                                                                              ) {
                                                                                                                (addBoxMesh(
                                                                                                                  itemModelNode,
                                                                                                                  width6 *
                                                                                                                    0.92,
                                                                                                                  height6 *
                                                                                                                    0.72,
                                                                                                                  depth *
                                                                                                                    0.9,
                                                                                                                  0,
                                                                                                                  height6 *
                                                                                                                    0.36,
                                                                                                                  0,
                                                                                                                  furniture,
                                                                                                                ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    width6,
                                                                                                                    0.065,
                                                                                                                    depth,
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.75,
                                                                                                                    0,
                                                                                                                    furnitureLight,
                                                                                                                    {
                                                                                                                      roughness: 0.3,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addCylinderMesh(
                                                                                                                    itemModelNode,
                                                                                                                    width6 *
                                                                                                                      0.25,
                                                                                                                    width6 *
                                                                                                                      0.21,
                                                                                                                    0.08,
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.8,
                                                                                                                    depth *
                                                                                                                      0.02,
                                                                                                                    furnitureSoft,
                                                                                                                    {
                                                                                                                      roughness: 0.28,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addCylinderMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.018,
                                                                                                                    0.018,
                                                                                                                    height6 *
                                                                                                                      0.2,
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.9,
                                                                                                                    -depth *
                                                                                                                      0.2,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      metalness: 0.78,
                                                                                                                      roughness: 0.18,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addCylinderMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.018,
                                                                                                                    0.018,
                                                                                                                    depth *
                                                                                                                      0.2,
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.99,
                                                                                                                    -depth *
                                                                                                                      0.11,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      rotationX:
                                                                                                                        Math.PI /
                                                                                                                        2,
                                                                                                                      metalness: 0.78,
                                                                                                                      roughness: 0.18,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.012,
                                                                                                                    height6 *
                                                                                                                      0.62,
                                                                                                                    depth *
                                                                                                                      0.02,
                                                                                                                    0,
                                                                                                                    height6 *
                                                                                                                      0.34,
                                                                                                                    depth *
                                                                                                                      0.46,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      rounded: false,
                                                                                                                    },
                                                                                                                  ));
                                                                                                                const basinMirrorTopY =
                                                                                                                    height6 *
                                                                                                                    1.05,
                                                                                                                  basinMirrorWidth =
                                                                                                                    width6 *
                                                                                                                    0.72,
                                                                                                                  basinMirrorHeight = 0.72,
                                                                                                                  basinMirrorZ =
                                                                                                                    -depth *
                                                                                                                    0.46;
                                                                                                                (addBoxMesh(
                                                                                                                  itemModelNode,
                                                                                                                  basinMirrorWidth,
                                                                                                                  basinMirrorHeight,
                                                                                                                  0.018,
                                                                                                                  0,
                                                                                                                  basinMirrorTopY +
                                                                                                                    basinMirrorHeight *
                                                                                                                      0.5,
                                                                                                                  basinMirrorZ,
                                                                                                                  yt4.glass,
                                                                                                                  {
                                                                                                                    rounded: false,
                                                                                                                    transparent: true,
                                                                                                                    opacity: 0.46,
                                                                                                                    depthWrite: false,
                                                                                                                    metalness: 0.26,
                                                                                                                    roughness: 0.12,
                                                                                                                    castShadow: false,
                                                                                                                    renderOrder: 6,
                                                                                                                  },
                                                                                                                ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    basinMirrorWidth +
                                                                                                                      0.055,
                                                                                                                    0.035,
                                                                                                                    0.045,
                                                                                                                    0,
                                                                                                                    basinMirrorTopY,
                                                                                                                    basinMirrorZ,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      metalness: 0.35,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    basinMirrorWidth +
                                                                                                                      0.055,
                                                                                                                    0.035,
                                                                                                                    0.045,
                                                                                                                    0,
                                                                                                                    basinMirrorTopY +
                                                                                                                      basinMirrorHeight,
                                                                                                                    basinMirrorZ,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      metalness: 0.35,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.035,
                                                                                                                    basinMirrorHeight,
                                                                                                                    0.045,
                                                                                                                    -basinMirrorWidth *
                                                                                                                      0.5,
                                                                                                                    basinMirrorTopY +
                                                                                                                      basinMirrorHeight *
                                                                                                                        0.5,
                                                                                                                    basinMirrorZ,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      metalness: 0.35,
                                                                                                                    },
                                                                                                                  ),
                                                                                                                  addBoxMesh(
                                                                                                                    itemModelNode,
                                                                                                                    0.035,
                                                                                                                    basinMirrorHeight,
                                                                                                                    0.045,
                                                                                                                    basinMirrorWidth *
                                                                                                                      0.5,
                                                                                                                    basinMirrorTopY +
                                                                                                                      basinMirrorHeight *
                                                                                                                        0.5,
                                                                                                                    basinMirrorZ,
                                                                                                                    furnitureDark,
                                                                                                                    {
                                                                                                                      metalness: 0.35,
                                                                                                                    },
                                                                                                                  ));
                                                                                                              } else {
                                                                                                                if (
                                                                                                                  modelItem.type ===
                                                                                                                  "rug"
                                                                                                                ) {
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
                                                                                                                } else {
                                                                                                                  if (
                                                                                                                    modelItem.type ===
                                                                                                                    "tvstand"
                                                                                                                  ) {
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
                                                                                                                  } else {
                                                                                                                    if (
                                                                                                                      modelItem.type ===
                                                                                                                      "floorlamp"
                                                                                                                    ) {
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
                                                                                                                    } else {
                                                                                                                      if (
                                                                                                                        modelItem.type ===
                                                                                                                        "plant"
                                                                                                                      ) {
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
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
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

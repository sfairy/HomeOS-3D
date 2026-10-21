/**
 * 物品模型总装的显式依赖与共享局部量。
 *
 * `StudioItemModelDeps` 全部为只读句柄；`ItemModelLocals` 是分派前
 * 由 `buildItemModel` 计算出的局部量。两者合并为 `ItemModelScope`，
 * 供 `items/item-model/*` 的各族构建函数共享。
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

interface ItemModelLocals {
  itemModelNode: any;
  modelItem: any;
  modelShadowIds: any;
  width6: any;
  depth: any;
  height6: any;
  yt4: any;
  furniture: any;
  appliance: any;
  furnitureSoft: any;
  furnitureLight: any;
  furnitureDark: any;
}

export type ItemModelScope = StudioItemModelDeps & ItemModelLocals;

/** 单个物品族的分派函数：命中返回 true，未命中返回 false。 */
export type ItemModelFamily = (scope: ItemModelScope) => boolean;

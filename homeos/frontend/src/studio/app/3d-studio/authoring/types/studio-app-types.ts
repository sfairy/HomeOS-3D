/**
 * studio-app.ts 的纯类型定义集合。
 *
 * 自包含类型声明（不引用闭包变量），
 * 仅依赖全局 DOM 类型（HTMLElement / DOMRect / RequestInit / ImageData / Blob）。
 * 类型在运行时被擦除。
 */

/** 网格材质通用选项：盒体 / 圆柱 / 建筑体块 / 墙侧墙顶都复用这一组。 */
export type MeshMaterialOptions = {
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  /** three 的 DepthFunc 常量。 */
  depthFunc?: number;
  /** three 的 Side 常量。 */
  side?: number;
  emissive?: number;
  emissiveIntensity?: number;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
  /** 顶面色 / 顶面透明度（墙顶材质用）。 */
  topColor?: number;
  topOpacity?: number;
};

/** 盒体网格选项。 */
export type BoxMeshOptions = MeshMaterialOptions & {
  /** 圆角半径（未显式给时按最小边长推算）。 */
  radius?: number;
  /** 显式关闭圆角。 */
  rounded?: boolean;
  /** 圆角细分段数。 */
  segments?: number;
};

/** 圆柱网格选项。 */
export type CylinderMeshOptions = MeshMaterialOptions & {
  segments?: number;
  rotationX?: number;
  rotationZ?: number;
};

/** 建筑体块（合并盒几何）选项。 */
export type ArchitectureMeshOptions = MeshMaterialOptions & {
  radius?: number;
  rounded?: boolean;
  segments?: number;
};

/** 墙侧 / 墙顶材质选项。 */
export type WallSurfaceMaterialOptions = MeshMaterialOptions;

/** 墙裙网格选项。 */
export type WallBandOptions = MeshMaterialOptions & {
  /** 是否把墙裙放进灯具图层，作为遮光体。 */
  lightOccluder?: boolean;
};

/** 墙顶盖面选项。 */
export type WallTopSurfaceOptions = MeshMaterialOptions;

/** 墙跨度的收放边距（米，两端各自可调）。 */
export type WallSpanPadding = { start?: number; end?: number };

/** 场景重建选项。 */
export type SceneRebuildOptions = {
  /** 强制重建，跳过缓存判断。 */
  force?: boolean;
  /** 只重建外模型（家具模型就绪后走这条）。 */
  externalModelsOnly?: boolean;
  /** 重建范围； */
  scope?: string | string[];
  /** 瞬时重建：不改脏文档状态。 */
  transient?: boolean;
  /** 重建后立刻编译着色器。 */
  precompile?: boolean;
  /** 保留灯光缓存。 */
  preserveLightCache?: boolean;
};

/** 导出位图选项。 */
export type ExportImageOptions = { pixels?: boolean; blob?: boolean };

/** 导出位图结果：按请求的开关选择性带上 imageData / blob。 */
export type ExportImageResult = { imageData?: ImageData; blob?: Blob };

/** 应用相机快照的选项。 */
export type CameraSnapshotOptions = { recordChange?: boolean; silent?: boolean };

/** 切换相机模式的选项。 */
export type CameraModeOptions = { preserveView?: boolean; deferControlUpdate?: boolean };

/** 切换相机视角的选项。 */
export type CameraViewChangeOptions = { force?: boolean };

/** 打开导出弹窗的选项。 */
export type ExportDialogOptions = { silent?: boolean };

/** 应用导出存档的选项。 */
export type ApplyExportOptions = { silent?: boolean };

/** 更新相机视角的选项。 */
export type UpdateCameraViewOptions = { view?: string };

/** 灯光效果刷新选项。 */
export type LightEffectOptions = { partial?: boolean; immediate?: boolean };

/** 相机交互设置（setCameraInteraction）。 */
export type CameraInteractionOptions = {
  rotationMode?: string;
  enabled?: boolean;
  panEnabled?: boolean;
  zoomEnabled?: boolean;
  focusEditing?: boolean;
  focusPoint?: number[];
};

/** 面板控件元素。 */
export type StudioControlElement = HTMLElement & {
  value?: any;
  disabled?: boolean;
  checked?: any;
  step?: string;
  min?: string;
  max?: string;
  /** 事件处理器：多处直接 onclick?.() 触发，所以参数放宽成任意长度。 */
  onclick?: (...args: any[]) => any;
};

/** 列表拖拽放置目标。 */
export type ListDragDropTarget = {
  kind: string;
  id: string;
  areaId: string;
  rowElement: HTMLElement;
  rowRect: DOMRect;
  sectionRect: DOMRect;
};

/** 列表拖拽放置结果。 */
export type ListDragDropResult = {
  kind: string;
  targetId?: string;
  anchorGroupId?: string;
  areaId?: string;
  insertAfter?: boolean;
};

/** 列表拖拽会话状态。 */
export type ListDragRowSession = {
  kind: string;
  id: string;
  name: string;
  rowElement: HTMLElement;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  armed: boolean;
  active: boolean;
  holdTimeoutId: ReturnType<typeof setTimeout> | null;
  ghostElement: HTMLElement | null;
  dropTargets: ListDragDropTarget[];
  pendingDrop: ListDragDropResult | null;
};

/** PlanEditPreviewFlags：平面图重绘时标记“这是预览态”，用于换色 / 隐藏标注。 */
export type PlanEditPreviewFlags = { preview?: boolean };

/** fetchStudioApi 的请求选项：RequestInit + HomeOS 日志上下文。 */
export type StudioApiRequestOptions = RequestInit & { hbLogContext?: Record<string, any> };

/** 门部件的解析结果（出图与面板共用的那一份）。 */
export type DoorPartMaterial = {
  role: string;
  /** 逐门覆盖色 / 表面参数在 `door.materialOverrides` 里用的键（`door-material-<n>`）。 */
  materialName: string;
  /** 画面用色：逐门覆盖色 > 档位配方 > 主题键（不含选中高亮）。 */
  colorValue: number;
  overrideColor: string;
  /** 只有档位 / 逐门表面参数给过才有值； */
  roughness?: number;
  metalness?: number;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  emissiveValue?: number;
  emissiveIntensity?: number;
};

/** createSceneItem 的尺寸覆盖（拖动排序 / 拖拽生成洞口时用）。 */
export type SceneItemSizeOverrides = { width?: number; depth?: number };

/** refreshSceneRender 的重建范围。 */
export type SceneRefreshOptions = {
  /** 重建场景内容（地面 / 家具等）。 */
  scene?: boolean;
  /** 重建阴影贴图。 */
  shadows?: boolean;
  /** 保留已有灯光缓存。 */
  preserveLightCache?: boolean;
};

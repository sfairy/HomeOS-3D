/** renderer 构造选项：一直是开放结构，只有少数几个字段有固定语义。 */
export type PanelRendererOptions = {
  editable?: boolean;
  onError?: (error: any) => void;
  onRuntimeButtonPress?: (element: Element) => void;
  [key: string]: any;
};

/** 详情对话框的状态同步句柄（对话框形态随组件类型而变）。 */
export type RendererDetailsStateSync = {
  dialog?: any;
  [key: string]: any;
};

/** 组件详情 / 可视化控制器元素。 */
export type ComponentControllerHooks = {
  syncCapabilityState?: (...args: any[]) => any;
  cleanupCapabilityDetails?: () => void;
  resizeInteraction3d?: (...args: any[]) => any;
  stateHandlers?: any;
  relatedEntityIds?: any;
  syncClimateState?: (...args: any[]) => any;
  syncClimateGrid?: (...args: any[]) => any;
  cleanupClimateDetails?: () => void;
  syncLightState?: (...args: any[]) => any;
  cleanupLightDetails?: () => void;
  syncBathLightState?: (...args: any[]) => any;
  toggleBathLight?: (...args: any[]) => any;
  syncLineChartState?: (...args: any[]) => any;
  cleanupLineChartHover?: () => void;
  setDreamCurtainRetracted?: (...args: any[]) => any;
  isDreamCurtainRetracted?: () => boolean;
  beginCoverMotion?: (...args: any[]) => any;
  cancelCoverMotion?: (...args: any[]) => any;
  stopCoverMotion?: () => void;
  holdCoverPosition?: (...args: any[]) => any;
  syncCoverState?: (...args: any[]) => any;
  syncCoverPositionState?: (...args: any[]) => any;
  syncCoverPositionCommandState?: (...args: any[]) => any;
  syncAirerMotorState?: (...args: any[]) => any;
  beginDreamCurtainMotion?: (...args: any[]) => any;
  cancelDreamCurtainMotion?: (...args: any[]) => any;
  cleanupCoverDetails?: () => void;
  waterHeaterControlPanel?: any;
};

/** 普通容器元素（section/div 等）承载组件控制钩子。 */
export type ComponentControllerElement = HTMLElement & ComponentControllerHooks;

/** 对话框元素（dialog）承载组件控制钩子。 */
export type ComponentDialogElement = HTMLDialogElement & ComponentControllerHooks;

/** 组件属性 / 状态载荷。 */
export type ComponentPayload = Record<string, any>;

/** 气候可视化同步载荷（视觉模式 / 运行态 / 强调色 / 目标温度）。 */
export type ClimateVisualSyncPayload = {
  mode?: string;
  visualMode?: string;
  running?: boolean;
  accentColor?: string;
  targetTemperature?: number | string;
};

/** 拖拽条目：首次手势复用宿主条目，复制手势时使用复制出来的条目。 */
export type DraggedComponentEntry = {
  component: any;
  host?: HTMLElement;
  initialX: number;
  initialY: number;
  width: number;
  height: number;
  parentId?: any;
  parentTransform: any;
  worldCenter?: { x: number; y: number };
};

/** 实体状态控件：可点击时创建 button、只读时创建 div，这里用两者的交集描述「同一位置在不同分支下的两种形态」。 */
export type EntityStateControlElement = HTMLButtonElement & HTMLDivElement;

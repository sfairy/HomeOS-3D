/**
 * 2D 面板渲染器的共享类型（从 register-all.ts 抽出，供各家族模块复用）。
 */

export type RenderPropertyBag = any;
export type ComponentControllerHooks = {
  syncFloorplanAutoDiagramState?: () => void;
  hbSyncVacuumMap?: () => void;
  syncLineChartState?: (...stateArgs: any[]) => any;
  cleanupLineChartHover?: () => void;
  pushEvent?: (...eventArgs: any[]) => any;
};


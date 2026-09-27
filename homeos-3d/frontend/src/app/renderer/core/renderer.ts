
type AnyObj = Record<string, any>;
/*
 * 控件渲染层主体：把仪表盘文档里的控件描述渲成真实 DOM，并在运行期跟随实体状态增量刷新。
 */

import { setBuiltinAssetVersions } from "./registry.js";
import { randomUuid } from "../../utils/random-id.js";
import { airflowCanvasOffsetBounds } from "../geometry/transform-geometry.js";
import {
  HistoryRefreshCoordinator,
  RuntimeEffectImageLoader,
  RuntimeStaticImageCache,
  RuntimeVacuumMapImagePreloader
} from "./runtime-caches.js";
import { syncedLineChartProperties } from "./runtime-document.js";

import { documentCoreMethods } from "./panel-renderer/document-core.js";
import { selectionTransformMethods } from "./panel-renderer/selection-transform.js";
import { runtimeBridgeMethods } from "./panel-renderer/runtime-bridge.js";
import { runtimeDialogMethods } from "./panel-renderer/runtime-dialogs.js";
import {
  attachDeviceControlPreparers,
  installDeviceControlMounter,
  runDeviceControlMethod
} from "./panel-renderer/device-controls/lazy-modules.js";
import { customPopupMethods } from "./panel-renderer/device-controls/custom-popup.js";
import { entityDetailsMethods } from "./panel-renderer/device-controls/entity-details.js";

// 下面三处是仍被外部模块按 renderer.js 这个路径导入的实现转发：实现本身在各自的旁路模块里
export {
  setBuiltinAssetVersions as setBuiltinAssetVersions,
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds,
  syncedLineChartProperties as syncedLineChartProperties
};

/**
 * 控件渲染器：一个仪表盘文档对应一个实例，实例持有宿主元素、已渲染的控件索引与运行期订阅。
 */
export class PanelRenderer {
  [key: string]: any;
  /**
   * 建立渲染器实例：接管根容器，初始化缓存、索引与全局监听（只装配，不渲染内容，文档等 setDocument 装载）。
   * @param {Function} [rendererOptions.onRuntimeAvailabilityChange] 可用性回调：订阅建立时 `(true)`，服务端以 4400 永久停掉订阅时 `(false, message)`（此后不再自动重连）；刻意只报「彻底不可用」以免把重连抖动显示成故障。
   */
  constructor(rootContainer: any, rendererOptions: any = {}) {
    this.container = rootContainer;
    this.options = {
      ...rendererOptions,
      onError: (errorObject: any) => {
        (window as any).HABridgeLog?.error(errorObject, {
          phase: "runtime-operation"
        });
        rendererOptions.onError?.(errorObject);
      }
    };
    // 按键音用「捕获阶段 + 事件委托」挂在根容器上，而不是给每个按钮绑监听：
    this.boundRuntimeButtonSound = (clickEvent: any) => {
      // 编辑态下点击是「选中」，不该出按键音，这里直接放行。
      if (this.options.editable) {
        return;
      }
      const pressedButton =
        typeof Element !== "undefined" && clickEvent.target instanceof Element
          ? clickEvent.target.closest('button, [role="button"]')
          : null;
      if (!!pressedButton && !!this.container.contains(pressedButton)) {
        this.options.onRuntimeButtonPress?.(pressedButton);
      }
    };
    this.container.addEventListener("click", this.boundRuntimeButtonSound, true);
    // 每个实例一个命名空间，编辑器里同时挂着多个预览实例时，
    this.renderNamespace = "renderer-" + randomUuid().replace(/[^a-z0-9]/gi, "");
    this.document = null;
    this.page = null;
    this.states =
      rendererOptions.runtimeStateCache instanceof Map
        ? rendererOptions.runtimeStateCache
        : new Map<any, any>();
    this.virtualEntityStates =
      rendererOptions.virtualEntityStateCache instanceof Map
        ? rendererOptions.virtualEntityStateCache
        : new Map<any, any>();
    this.entityMetadata = new Map<any, any>();
    this.deviceMetadata = new Map<any, any>();
    this.entityCatalogReady = false;
    this.entityTranslations = {};
    this.historySeries = new Map<any, any>();
    this.historySeriesCache =
      rendererOptions.historySeriesCache instanceof Map
        ? rendererOptions.historySeriesCache
        : new Map<any, any>();
    this.historyFetches = new Set<any>();
    this.historyRefreshCoordinator = new HistoryRefreshCoordinator();
    this.historyRetryTimer = 0;
    this.historyRetryAttempt = 0;
    this.historyDocumentGeneration = 0;
    this.historyPopupGeneration = 0;
    this.historyChartRefreshers = new Set<any>();
    this.runtimeStateHandlers = new Map<any, any>();
    this.runtimeRenderEntityIds = new Set<any>();
    this.runtimeRenderTimer = 0;
    this.runtimeStaticImageCache = new RuntimeStaticImageCache({
      maxConcurrent: 2,
      maxDecoded: 32,
      idleDelay: 120
    });
    this.runtimeEffectImageLoader = new RuntimeEffectImageLoader({
      maxConcurrent: 4,
      idleDelay: 160
    });
    this.runtimeVacuumMapImagePreloader = new RuntimeVacuumMapImagePreloader({
      maxConcurrent: 1
    });
    this.vacuumMapEntityIds = new Set<any>();
    this.cleanups = [];
    this.componentCleanups = new Map<any, any>();
    this.cameraCleanups = new Map<any, any>();
    this.runtimeEntityComponentIndex = new Map<any, any>();
    this.componentParentIds = new Map<any, any>();
    this.componentHosts = new Map<any, any>();
    this.componentRecords = new Map<any, any>();
    this.componentAirflowLayers = new Map<any, any>();
    this.componentEffectLayers = new Map<any, any>();
    this.componentSelectionOverlays = new Map<any, any>();
    this.componentSelectionLayers = new Map<any, any>();
    this.componentPreviewStates = new Map<any, any>();
    this.themeVariableNames = new Set<any>();
    this.detailsStateSync = null;
    this.activePopupId = null;
    this.replacingDocument = false;
    this.pendingEntityDetails = null;
    this.runtimeDialogScaleContext = null;
    this.selectedComponentId = null;
    this.selectedComponentIds = new Set<any>();
    this.activeGroupId = null;
    this.socket = null;
    this.runtimeSubscription = null;
    this.socketGeneration = 0;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.runtimeHydrationRetryTimer = null;
    this.runtimeHydrationRetryAttempt = 0;
    this.lastRuntimeResumeAt = 0;
    this.runtimeEntityLimitSignature = "";
    this.removedRuntimeEntityIds = new Set<any>();
    this.pendingOptimisticStates = new Map<any, any>();
    this.confirmedLightVisualStates = new Map<any, any>();
    this.destroyed = false;
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.resizeObserver.observe(rootContainer);
    // 同一帧里的多次尺寸变化只跑一遍 resize：手机滚动时地址栏收起、双指缩放都会
    this.resizeFrameId = 0;
    this.boundResize = () => this.scheduleResize();
    this.boundReconnect = () => {
      if (!this.destroyed && (!this.socket || this.socket.readyState >= WebSocket.CLOSING)) {
        this.connectRuntime();
      }
    };
    this.boundVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const resumeTimeMs = Date.now();
        if (this.document && resumeTimeMs - this.lastRuntimeResumeAt >= 1500) {
          this.lastRuntimeResumeAt = resumeTimeMs;
          this.connectRuntime({
            force: true
          });
        }
        this.refreshHistorySeries();
        return;
      }
      if (this.historyRetryTimer) {
        window.clearTimeout(this.historyRetryTimer);
        this.historyRetryTimer = 0;
      }
    };
    this.historyPollTimer = window.setInterval(() => this.refreshHistorySeries(), 30000);
    window.visualViewport?.addEventListener("resize", this.boundResize);
    window.addEventListener("orientationchange", this.boundResize);
    window.addEventListener("online", this.boundReconnect);
    document.addEventListener("visibilitychange", this.boundVisibilityChange);
  }

  /**
   * 按需加载某一类设备控件模块，然后调用它的方法（副作用型调用点用）。
   * @param {Array<string>} kinds 设备种类（见 device-controls/lazy-modules.js）
   * @param {string} methodName 方法名（由那一类模块提供）
   * @param {Array<unknown>} args 原样转交的实参
   * @returns {Promise<unknown>}
   */
  runDeviceControlMethod(kinds: any, methodName: any, args: any) {
    return runDeviceControlMethod(kinds, this, methodName, args, (error: any) =>
      this.options.onError?.(error)
    );
  }
}

/**
 * 把各区块导出的方法表挂到原型上。
 * @param {Array<object>} methodSets 各区块导出的「方法名 → 函数」表，顺序即覆盖顺序。
 * @returns {void}
 */
function definePanelRendererMethods(methodSets: any) {
  const descriptors: AnyObj = {};
  for (const methods of methodSets) {
    for (const [name, value] of Object.entries(methods)) {
      // 惰性挂载必须与「已经挂在原型上的那一批」一起查重：只查本批的话，
      if (
        Object.prototype.hasOwnProperty.call(descriptors, name) ||
        Object.prototype.hasOwnProperty.call(PanelRenderer.prototype, name)
      ) {
        throw new Error(`PanelRenderer 方法 ${name} 被重复定义`);
      }
      descriptors[name] = { value, writable: true, enumerable: false, configurable: true };
    }
  }
  Object.defineProperties(PanelRenderer.prototype, descriptors);
}

// 惰性挂载走同一条挂载路径（同一个重名检查），只是时机推迟到「第一次真的用到那一类」。
installDeviceControlMounter((methodSets: any) => definePanelRendererMethods(methodSets));
// 三个「预取入口」也挂到原型上：这样三个枢纽文件的调用点各只要 1 行。
attachDeviceControlPreparers(PanelRenderer.prototype);

definePanelRendererMethods([
  documentCoreMethods,
  selectionTransformMethods,
  runtimeBridgeMethods,
  runtimeDialogMethods,
  customPopupMethods,
  entityDetailsMethods
]);

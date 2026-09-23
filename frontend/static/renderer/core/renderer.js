/*
 * 控件渲染层主体：把仪表盘文档里的控件描述渲成真实 DOM，并在运行期跟随实体状态增量刷新。
 * 编辑器与中控展示页共用同一个 PanelRenderer，两条路径的绘制结果必须完全一致；文档解析、实体目录、
 * 图标与静态资源地址、动作派发都收在这一层，页面脚本只经由公开方法交互，不直接摸 DOM。
 * registry.js 的 import 必须与本文件写同一条 `registry.js?v=` 版本戳：版本戳不同会被浏览器当成两个模块
 * 各执行一遍，注册表出现两份，表现为控件渲染错乱、或新控件在展示页上不生效。
 * 命名约定：DOM class 用 `hb-` 前缀、运行期状态类用 `is-` 前缀；组件字段 camelCase（componentId /
 * entityId / properties）；HA 侧字段名保持下划线原样（与 Home Assistant 约定死，改名取不到）；组件类型
 * 字符串是文档与注册表的约定键，新增或改名必须同步 registry.js 的 registerComponent。
 *
 * 本文件现在只留「类声明 + 装配」：137 个方法按职责拆到 panel-renderer/ 下四个区块，
 * 每个区块导出方法表，由文件末尾统一挂到 PanelRenderer.prototype 上（挂法见那里的注释）：
 *   - panel-renderer/document-core.js      文档生命周期与组件渲染（含构造器依赖的索引与刷新）
 *   - panel-renderer/selection-transform.js 选中、多选与变换手势
 *   - panel-renderer/runtime-bridge.js      WebSocket、订阅、状态缓存、动作派发
 *   - panel-renderer/runtime-dialogs.js     详情弹窗的公共外壳
 *   - panel-renderer/device-controls/*.js   各设备类型的详情内容
 *   - panel-renderer/primitives.js          各区块共用的小工具与阈值
 * 对外形态不变：仍然只导出 PanelRenderer 这一个类，页面依旧 `new PanelRenderer(hostElement, options)`。
 */

import { setBuiltinAssetVersions } from "./registry.js?v=2609231046";
import { randomUuid } from "../../utils/random-id.js?v=2609231046";
import { airflowCanvasOffsetBounds } from "../geometry/transform-geometry.js?v=2609231046";
import {
  HistoryRefreshCoordinator,
  RuntimeEffectImageLoader,
  RuntimeStaticImageCache,
  RuntimeVacuumMapImagePreloader
} from "./runtime-caches.js?v=2609231046";
import { syncedLineChartProperties } from "./runtime-document.js?v=2609231046";

import { documentCoreMethods } from "./panel-renderer/document-core.js?v=2609231046";
import { selectionTransformMethods } from "./panel-renderer/selection-transform.js?v=2609231046";
import { runtimeBridgeMethods } from "./panel-renderer/runtime-bridge.js?v=2609231046";
import { runtimeDialogMethods } from "./panel-renderer/runtime-dialogs.js?v=2609231046";
import { customPopupMethods } from "./panel-renderer/device-controls/custom-popup.js?v=2609231046";
import { entityDetailsMethods } from "./panel-renderer/device-controls/entity-details.js?v=2609231046";
import { capabilityDetailsMethods } from "./panel-renderer/device-controls/capability.js?v=2609231046";
import { airPurifierDetailsMethods } from "./panel-renderer/device-controls/air-purifier.js?v=2609231046";
import { mediaPlayerDetailsMethods } from "./panel-renderer/device-controls/media-player.js?v=2609231046";
import { lightDetailsMethods } from "./panel-renderer/device-controls/light.js?v=2609231046";
import { coverDetailsMethods } from "./panel-renderer/device-controls/cover.js?v=2609231046";
import { climateDetailsMethods } from "./panel-renderer/device-controls/climate.js?v=2609231046";
import { waterHeaterDetailsMethods } from "./panel-renderer/device-controls/water-heater.js?v=2609231046";
import { electricBedDetailsMethods } from "./panel-renderer/device-controls/electric-bed.js?v=2609231046";
import { vacuumDetailsMethods } from "./panel-renderer/device-controls/vacuum.js?v=2609231046";
import { presenceDetailsMethods } from "./panel-renderer/device-controls/presence.js?v=2609231046";
import { cameraDetailsMethods } from "./panel-renderer/device-controls/camera.js?v=2609231046";

// 下面三处是仍被外部模块按 renderer.js 这个路径导入的实现转发：实现本身在各自的旁路模块里
// （transform-geometry.js / asset-version.js 等），这里继续原路径转出，调用方无需改动，
// 也避免出现两套同名实现。
// 其余同名转发，以及几个定义在本文件、外部却已无人导入的函数，都已随本次清理删去 ——
// 要用时再 export 回来，成本一行。
export {
  setBuiltinAssetVersions as setBuiltinAssetVersions,
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds,
  syncedLineChartProperties as syncedLineChartProperties
};

/**
 * 控件渲染器：一个仪表盘文档对应一个实例，实例持有宿主元素、已渲染的控件索引与运行期订阅。
 * 构造器只做「记参数 + 建缓存 + 绑窗口事件」，所有文档内容由 setDocument 灌进来；
 * 其余方法按职责分在 panel-renderer/ 的四个区块里，通过原型挂载（见文件末尾）。
 */
export class PanelRenderer {
  /**
   * 建立渲染器实例：接管根容器，初始化缓存、索引与全局监听（只装配，不渲染内容，文档等 setDocument 装载）。
   * 构造期就挂 resize / 可见性 / 网络恢复监听，是因为展示页长期挂机，中途断网 / 息屏 / 旋屏都要能自愈。
   * @param {Function} [rendererOptions.onRuntimeAvailabilityChange] 可用性回调：订阅建立时 `(true)`，服务端以 4400 永久停掉订阅时 `(false, message)`（此后不再自动重连）；刻意只报「彻底不可用」以免把重连抖动显示成故障。
   */
  constructor(rootContainer, rendererOptions = {}) {
    // 包一层 onError 是刻意的：渲染运行期的异常也要进全局日志，
    // 否则展示页上只会表现为「某个控件不刷新」，排查时无线索。
    this.container = rootContainer;
    this.options = {
      ...rendererOptions,
      onError: errorObject => {
        window.HABridgeLog?.error(errorObject, {
          phase: "runtime-operation"
        });
        rendererOptions.onError?.(errorObject);
      }
    };
    // 按键音用「捕获阶段 + 事件委托」挂在根容器上，而不是给每个按钮绑监听：
    // 控件是运行期反复重建的，逐个绑定会漏绑、也会在刷新后留下悬挂引用。
    this.boundRuntimeButtonSound = clickEvent => {
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
    // 组件 ID 与样式作用域不会互相串。
    this.renderNamespace = "renderer-" + randomUuid().replace(/[^a-z0-9]/gi, "");
    this.document = null;
    this.page = null;
    this.states =
      rendererOptions.runtimeStateCache instanceof Map
        ? rendererOptions.runtimeStateCache
        : new Map();
    this.virtualEntityStates =
      rendererOptions.virtualEntityStateCache instanceof Map
        ? rendererOptions.virtualEntityStateCache
        : new Map();
    this.entityMetadata = new Map();
    this.deviceMetadata = new Map();
    this.entityCatalogReady = false;
    this.entityTranslations = {};
    this.historySeries = new Map();
    this.historySeriesCache =
      rendererOptions.historySeriesCache instanceof Map
        ? rendererOptions.historySeriesCache
        : new Map();
    this.historyFetches = new Set();
    this.historyRefreshCoordinator = new HistoryRefreshCoordinator();
    this.historyRetryTimer = 0;
    this.historyRetryAttempt = 0;
    this.historyDocumentGeneration = 0;
    this.historyPopupGeneration = 0;
    this.historyChartRefreshers = new Set();
    this.runtimeStateHandlers = new Map();
    this.runtimeRenderEntityIds = new Set();
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
    this.vacuumMapEntityIds = new Set();
    this.cleanups = [];
    this.componentCleanups = new Map();
    this.cameraCleanups = new Map();
    this.runtimeEntityComponentIndex = new Map();
    this.componentParentIds = new Map();
    this.componentHosts = new Map();
    this.componentRecords = new Map();
    this.componentAirflowLayers = new Map();
    this.componentEffectLayers = new Map();
    this.componentSelectionOverlays = new Map();
    this.componentSelectionLayers = new Map();
    this.componentPreviewStates = new Map();
    this.themeVariableNames = new Set();
    this.detailsStateSync = null;
    this.activePopupId = null;
    this.replacingDocument = false;
    this.pendingEntityDetails = null;
    this.runtimeDialogScaleContext = null;
    this.selectedComponentId = null;
    this.selectedComponentIds = new Set();
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
    this.removedRuntimeEntityIds = new Set();
    this.pendingOptimisticStates = new Map();
    this.confirmedLightVisualStates = new Map();
    this.destroyed = false;
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.resizeObserver.observe(rootContainer);
    // 同一帧里的多次尺寸变化只跑一遍 resize：手机滚动时地址栏收起、双指缩放都会
    // 让 visualViewport 连续派发 resize，而每一遍 resize 都要把全部手柄宿主量一遍
    // 再写一遍样式。合并不改变「一遍的结果」，只把遍数从「每事件一遍」压到「每帧一遍」。
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
      }
    };
    this.historyPollTimer = window.setInterval(() => this.refreshHistorySeries(), 30000);
    window.visualViewport?.addEventListener("resize", this.boundResize);
    window.addEventListener("orientationchange", this.boundResize);
    window.addEventListener("online", this.boundReconnect);
    document.addEventListener("visibilitychange", this.boundVisibilityChange);
  }
}

/**
 * 把各区块导出的方法表挂到原型上。
 *
 * 用 defineProperties 而不是 Object.assign：类方法在原型上不可枚举，Object.assign 挂出来的是
 * 可枚举属性，会让 for...in / Object.keys(实例) 突然多出上百项。同名方法直接抛错 —— 两个区块
 * 不小心定义了同名方法时，后者静默覆盖前者是最难查的一类回归。
 *
 * @param {Array<object>} methodSets 各区块导出的「方法名 → 函数」表，顺序即覆盖顺序。
 * @returns {void}
 */
function definePanelRendererMethods(methodSets) {
  const descriptors = {};
  for (const methods of methodSets) {
    for (const [name, value] of Object.entries(methods)) {
      if (Object.prototype.hasOwnProperty.call(descriptors, name)) {
        throw new Error(`PanelRenderer 方法 ${name} 被重复定义`);
      }
      descriptors[name] = { value, writable: true, enumerable: false, configurable: true };
    }
  }
  Object.defineProperties(PanelRenderer.prototype, descriptors);
}

definePanelRendererMethods([
  documentCoreMethods,
  selectionTransformMethods,
  runtimeBridgeMethods,
  runtimeDialogMethods,
  customPopupMethods,
  entityDetailsMethods,
  capabilityDetailsMethods,
  airPurifierDetailsMethods,
  mediaPlayerDetailsMethods,
  lightDetailsMethods,
  coverDetailsMethods,
  climateDetailsMethods,
  waterHeaterDetailsMethods,
  electricBedDetailsMethods,
  vacuumDetailsMethods,
  presenceDetailsMethods,
  cameraDetailsMethods
]);

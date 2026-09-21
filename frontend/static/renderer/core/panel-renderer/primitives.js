/*
 * PanelRenderer 各区块共用的小工具与阈值：调色、弹窗尺寸、乐观开关超时、控件视觉等。
 *
 * 这些原先都写在 renderer.js 顶部。拆块之后它们被多个区块共用（例如 createSwitchVisual
 * 同时服务于能力详情、组合弹窗与实体详情），留在任意一个区块里都会让另外两个反向依赖它，
 * 所以单独成文件 —— 依赖方向是「各区块 → primitives」，不成环。
 *
 * 这里只放纯函数、常量与品牌无关的 DOM 片段构造；任何需要 this（渲染器实例状态）的逻辑
 * 都不属于本文件。
 */

import { randomUuid } from "../../../utils/random-id.js?v=2609220023";
import { paletteColor } from "../../../utils/colors.js?v=2609220023";
import { componentActionIsSupported } from "../../../shared/action-rules.js?v=2609220023";

// 一次订阅最多带上的实体数量：再多后端就不受理整批订阅，需要分批。
export const RUNTIME_SUBSCRIPTION_ENTITY_LIMIT = 1000;

/**
 * 空气质量四档读色 + 各档的半透明底色。
 *
 * 十二个色值原先在两个渲染函数里各写了一遍（净化器详情弹窗与 3D 弹窗预览模块），
 * 两边必须逐字相同才不会「同一个读数两个颜色」，而这种约束没有任何东西在守。
 * 现在只有这一份。
 *
 * 色值走 paletteColor() 而不是直接给 var()：这两个映射会被 setProperty 写成
 * **内联自定义属性**（`--hb-air-purifier-accent` / `-accent-soft`），内联值再被
 * 别处的 var() 消费。写 var() 也成立，但取实际色值更短，也不会在两条自定义属性
 * 之间再套一层变量间接 —— 出问题时 computed 面板里直接就是最终颜色。
 * 取不到调色板（页面未加载）时回落到与调色板同值的字面量。
 */
const AIR_QUALITY_TONES = {
  excellent: { token: "--hos-eco", fallback: "#4ed6a8", rgbFallback: "78, 214, 168" },
  good: { token: "--hos-eco", fallback: "#4ed6a8", rgbFallback: "78, 214, 168" },
  warning: { token: "--hos-lumen", fallback: "#ffb86e", rgbFallback: "255, 184, 110" },
  poor: { token: "--hos-alert", fallback: "#f07a7e", rgbFallback: "240, 122, 126" },
  unknown: { token: "--hos-sensor", fallback: "#9eb0c4", rgbFallback: "158, 176, 196" }
};

/** 未知 / 缺档一律按「好」渲染：读数缺失不该显示成故障色。 */
function airQualityTone(level) {
  return AIR_QUALITY_TONES[level] || AIR_QUALITY_TONES.excellent;
}

export function airQualityAccent(level) {
  const tone = airQualityTone(level);
  return paletteColor(tone.token, tone.fallback);
}

export function airQualityAccentSoft(level, alpha) {
  const tone = airQualityTone(level);
  const channels = paletteColor(`${tone.token}-rgb`, tone.rgbFallback);
  return `rgba(${channels}, ${alpha})`;
}

// 弹窗默认占画布短边的比例（0.76）：留出四周的呼吸边距，视觉上不顶边。
export const DEFAULT_DIALOG_TARGET_OCCUPANCY = 0.76;

// 紧凑弹窗（如纯文字提示）用更小的占比，避免小块内容被放大得过大。
export const COMPACT_DIALOG_TARGET_OCCUPANCY = 0.7;

// 弹窗放大上限：超过 1.6 倍时位图与文字会明显发虚，宁可留白也不再放大。
const MAX_DIALOG_PREFERRED_SCALE = 1.6;

// fillAvailable（内容自适应填满）模式允许的上限，比默认上限更高。
const FILL_DIALOG_SCALE_LIMIT = 2;

// tightFill（紧凑内容填满）模式的上限，再高一档，用于单行控件这类小体量内容。
const TIGHT_FILL_DIALOG_SCALE_LIMIT = 2.12;

// 乐观开关的确认等待上限：交互时先本地变色、等 HA 推送确认，超过这个时间没等到就回滚。
// 取 8 秒是「慢设备也给够余量」与「不让界面长期停在错误状态」之间的折中；
// 这个值同时用于写下 expiresAt 与排回滚定时器，提成常量是为了不让两处各写一个 8000。
export const OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS = 8000;

// 运行时弹窗里「会响应 Tab」的元素：disabled 与 tabindex="-1" 的不算，
// 焦点循环就是按这份清单首尾相接的。
export const RUNTIME_DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * 计算运行期弹窗的可用尺寸与缩放比例。
 * 纯函数不碰 DOM，编辑器与展示页复用同一套尺寸口径。
 */
export function runtimeDialogLayout({
  layerWidth: layerWidthPx,
  layerHeight: layerHeightPx,
  layoutWidth: layoutWidthPx,
  layoutHeight: layoutHeightPx,
  fillAvailable: fillAvailable = false,
  tightFill: tightFill = false,
  targetOccupancy: targetOccupancyRatio = DEFAULT_DIALOG_TARGET_OCCUPANCY
}) {
  // 所有入参先做「非数即 1」的兜底：调用方常在布局尚未测量完时传入 undefined，
  // 这里不放行 NaN，否则后面算出的 scale 会污染成 NaN 并写进 CSS。
  const boundedLayerWidthPx = Math.max(1, Number(layerWidthPx) || 1);
  const boundedLayerHeightPx = Math.max(1, Number(layerHeightPx) || 1);
  const boundedLayoutWidthPx = Math.max(1, Number(layoutWidthPx) || 1);
  const boundedLayoutHeightPx = Math.max(1, Number(layoutHeightPx) || 1);
  // 安全内边距按内容体量分三档，且都随画布短边等比缩放再夹取上下限，
  // 目的是小屏上不浪费空间、大屏上不让弹窗顶到边缘。
  const dialogSafeInsetPx = tightFill
    ? Math.min(40, Math.max(24, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.03))
    : fillAvailable
      ? Math.min(80, Math.max(32, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.075))
      : Math.min(64, Math.max(24, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.05));
  const availableWidthPx = Math.max(1, boundedLayerWidthPx - dialogSafeInsetPx * 2);
  const availableHeightPx = Math.max(1, boundedLayerHeightPx - dialogSafeInsetPx * 2);
  const fitScale = Math.min(
    availableWidthPx / boundedLayoutWidthPx,
    availableHeightPx / boundedLayoutHeightPx
  );
  // 目标占比夹在 0.2~1：传 0 会让弹窗缩到看不见，传大于 1 会溢出被裁切。
  const occupancyRatio = Math.max(
    0.2,
    Math.min(1, Number(targetOccupancyRatio) || DEFAULT_DIALOG_TARGET_OCCUPANCY)
  );
  const occupancyScale = Math.min(
    (boundedLayerWidthPx * occupancyRatio) / boundedLayoutWidthPx,
    (boundedLayerHeightPx * occupancyRatio) / boundedLayoutHeightPx
  );
  const preferredScale = Math.min(MAX_DIALOG_PREFERRED_SCALE, occupancyScale);
  // fillAvailable / tightFill 只是提高上限，最终仍要与 fitScale 取小，
  // 保证任何配置下内容都不会超出可用区域。
  const resolvedScale = Math.min(
    fillAvailable
      ? tightFill
        ? TIGHT_FILL_DIALOG_SCALE_LIMIT
        : FILL_DIALOG_SCALE_LIMIT
      : preferredScale,
    fitScale
  );
  return {
    availableWidth: availableWidthPx,
    availableHeight: availableHeightPx,
    fitScale: fitScale,
    preferredScale: preferredScale,
    safeInset: dialogSafeInsetPx,
    // 下限 0.08：再小文字已无法辨认，宁可溢出也不给出一个「看不见的弹窗」。
    scale: Math.max(0.08, resolvedScale)
  };
}

/**
 * 计算弹窗层与仪表盘矩形的交集，得出真正可见的视口。
 * 仪表盘只占弹窗层一部分，弹窗要居中在可见区域上；参数缺失时退化成整层。
 */
export function runtimeDialogViewport({
  layerLeft: layerLeftPx = 0,
  layerTop: layerTopPx = 0,
  layerWidth: viewportLayerWidthPx,
  layerHeight: viewportLayerHeightPx,
  dashboardLeft: dashboardLeftPx,
  dashboardTop: dashboardTopPx,
  dashboardWidth: dashboardWidthPx,
  dashboardHeight: dashboardHeightPx
}) {
  const viewportLeftPx = Number(layerLeftPx) || 0;
  const viewportTopPx = Number(layerTopPx) || 0;
  const viewportWidthPx = Math.max(1, Number(viewportLayerWidthPx) || 1);
  const viewportHeightPx = Math.max(1, Number(viewportLayerHeightPx) || 1);
  const viewportRightPx = viewportLeftPx + viewportWidthPx;
  const viewportBottomPx = viewportTopPx + viewportHeightPx;
  const resolvedDashboardLeftPx = Number.isFinite(Number(dashboardLeftPx))
    ? Number(dashboardLeftPx)
    : viewportLeftPx;
  const resolvedDashboardTopPx = Number.isFinite(Number(dashboardTopPx))
    ? Number(dashboardTopPx)
    : viewportTopPx;
  const resolvedDashboardWidthPx = Math.max(1, Number(dashboardWidthPx) || viewportWidthPx);
  const resolvedDashboardHeightPx = Math.max(1, Number(dashboardHeightPx) || viewportHeightPx);
  // 交集 = 左/上取较大者、右/下取较小者；直接写四行而不是封装函数，
  // 是为了让这里的坐标口径与 CSS 定位的 origin 一眼对应。
  const overlapLeftPx = Math.max(viewportLeftPx, resolvedDashboardLeftPx);
  const overlapTopPx = Math.max(viewportTopPx, resolvedDashboardTopPx);
  const overlapRightPx = Math.min(
    viewportRightPx,
    resolvedDashboardLeftPx + resolvedDashboardWidthPx
  );
  const overlapBottomPx = Math.min(
    viewportBottomPx,
    resolvedDashboardTopPx + resolvedDashboardHeightPx
  );
  // 至少 1px：两块区域完全不相交时差值为负，后续中心点与缩放的计算会得到负数或 NaN。
  const visibleWidthPx = Math.max(1, overlapRightPx - overlapLeftPx);
  const visibleHeightPx = Math.max(1, overlapBottomPx - overlapTopPx);
  return {
    width: visibleWidthPx,
    height: visibleHeightPx,
    centerX: overlapLeftPx - viewportLeftPx + visibleWidthPx / 2,
    centerY: overlapTopPx - viewportTopPx + visibleHeightPx / 2
  };
}

/**
 * 乐观开关等不到状态确认时的错误对象。
 *
 * 单独抽出来是为了让文案与实体 id 的组装可测，也避免这段文字在两处漂。
 */
export function createOptimisticToggleTimeoutError(entityId) {
  const timeoutError = new Error(
    "设备没有在 " +
      OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS / 1000 +
      " 秒内回报状态，开关已恢复为设备上报的状态（" +
      entityId +
      "）。请确认设备在线，或稍后重试。"
  );
  timeoutError.name = "OptimisticToggleTimeoutError";
  return timeoutError;
}

/**
 * 递归给组件及子组件补上运行期 ID（`component-` + 随机 UUID），就地写回传入对象。
 * 运行期刷新要按 ID 反查宿主元素；只在内存文档上做，不回写服务端。
 */
export function assignComponentIds(component) {
  component.id = "component-" + randomUuid();
  for (const childComponent of component.children || []) {
    assignComponentIds(childComponent);
  }
  return component;
}

/**
 * 判断键盘事件是否按下了修饰键（Alt / Ctrl，Apple 设备上还包括 Command）。
 * 编辑态按住修饰键表示多选与框选；平台判断收在这里，免得各处重复做 userAgent 检测。
 */
export function isModifierKeyPressed(keyboardEvent) {
  const platformName = navigator.userAgentData?.platform || navigator.platform || "";
  const isAppleDevice = /mac|iphone|ipad|ipod/i.test(platformName);
  return keyboardEvent.altKey || keyboardEvent.ctrlKey || (isAppleDevice && keyboardEvent.metaKey);
}

/**
 * 判断控件动作是否受支持（转发到 action-rules.js 的统一口径）。
 *
 * 校验层与运行期共用同一条规则，避免「保存时合法、点下去没反应」这类不一致。
 */
export function isSupportedComponentAction(targetComponent, actionConfig) {
  return componentActionIsSupported(targetComponent, actionConfig);
}

/**
 * 取组件弹窗的标题：优先组件自身 label，空则用调用方给的兜底标题。
 */
export function componentDialogTitle(titleComponent, fallbackTitle) {
  const componentProperties = titleComponent?.properties || {};
  return String(componentProperties.label || "").trim() || fallbackTitle;
}

/**
 * 取弹窗模块标题，四级回退：组件 title → 调用方兜底 → HA friendly_name → 实体 ID。
 * friendly_name 是 HA 约定字段名；末级兜底保证标题永远非空。
 */
export function popupModuleDialogTitle(popupComponent, popupEntityState, fallbackTitleText = "") {
  return (
    String(popupComponent?.title || "").trim() ||
    String(fallbackTitleText || "").trim() ||
    String(popupEntityState?.attributes?.friendly_name || "").trim() ||
    String(popupComponent?.entityId || "").trim()
  );
}

/**
 * 往宿主元素里追加晾衣机的纯装饰图形（结构写死，升降/照明由 class 另行切换）。
 * 用 createElement + ownerDocument 避免跨文档报错，且这些节点无文本、无需 HTML 解析。
 */
export function appendAirerVisual(hostElement) {
  const ownerDocument = hostElement.ownerDocument;
  const airerElement = ownerDocument.createElement("span");
  airerElement.className = "hb-airer-visual";
  const glowElement = ownerDocument.createElement("i");
  glowElement.className = "hb-airer-visual-glow";
  const bodyElement = ownerDocument.createElement("span");
  bodyElement.className = "hb-airer-visual-body";
  const lampElement = ownerDocument.createElement("i");
  lampElement.className = "hb-airer-visual-lamp";
  bodyElement.append(lampElement);
  const liftsElement = ownerDocument.createElement("span");
  liftsElement.className = "hb-airer-visual-lifts";
  liftsElement.append(ownerDocument.createElement("i"), ownerDocument.createElement("i"));
  const rackElement = ownerDocument.createElement("span");
  rackElement.className = "hb-airer-visual-rack";
  for (let liftIndex = 0; liftIndex < 4; liftIndex += 1) {
    rackElement.append(ownerDocument.createElement("i"));
  }
  airerElement.append(glowElement, bodyElement, liftsElement, rackElement);
  hostElement.append(airerElement);
}

/**
 * 把晾衣机升降状态换成中文文案。
 * 未知状态返回空串而非「未知」：调用方据此省略该行，避免数据未就绪时显示错误文案。
 */
export function airerPositionLabel(positionState) {
  return (
    {
      open: "已升起",
      closed: "已下降",
      opening: "正在升起",
      closing: "正在下降"
    }[positionState] || ""
  );
}

/**
 * 创建通用的开关可视件（摇板 + 指示灯 + 可选文案区）。
 * 交互与视觉解耦：返回的 sync 只把状态映射成 class 与 aria 属性，何时调用由调用方决定。
 */
export function createSwitchVisual({
  label: labelText = "开关",
  interactive: interactive = true,
  onToggle: onToggle = null,
  compact: compact = false,
  momentary: momentary = false
} = {}) {
  const switchElement = document.createElement("button");
  switchElement.type = "button";
  switchElement.className = "hb-switch-visual";
  switchElement.classList.toggle("is-momentary", momentary);
  // 不可交互时同时用 inert 与 aria-disabled：前者挡住鼠标与键盘，后者让读屏软件
  // 知道原因，只做视觉置灰（class）会让辅助设备仍能聚焦到这个按钮。
  switchElement.inert = !interactive;
  switchElement.setAttribute("aria-disabled", String(!interactive));
  const auraElement = document.createElement("i");
  auraElement.className = "hb-switch-visual-aura";
  const plateElement = document.createElement("span");
  plateElement.className = "hb-switch-visual-plate";
  const indicatorElement = document.createElement("i");
  indicatorElement.className = "hb-switch-visual-indicator";
  const rockerElement = document.createElement("span");
  rockerElement.className = "hb-switch-visual-rocker";
  const offMarkElement = document.createElement("i");
  offMarkElement.className = "hb-switch-visual-mark off";
  offMarkElement.textContent = "○";
  const onMarkElement = document.createElement("i");
  onMarkElement.className = "hb-switch-visual-mark on";
  onMarkElement.textContent = "┃";
  rockerElement.append(offMarkElement, onMarkElement);
  plateElement.append(indicatorElement, rockerElement);
  switchElement.append(auraElement, plateElement);
  const copyElement = compact ? document.createElement("span") : null;
  const copyLabelElement = compact ? document.createElement("strong") : null;
  const copyStateElement = compact ? document.createElement("output") : null;
  if (compact) {
    copyElement.className = "hb-switch-visual-copy";
    copyLabelElement.className = "hb-switch-visual-copy-label";
    copyStateElement.className = "hb-switch-visual-copy-state";
    copyLabelElement.textContent = labelText;
    copyElement.append(copyLabelElement, copyStateElement);
    switchElement.append(copyElement);
    switchElement.classList.add("is-compact");
  }
  // sync 的入参统一走一个对象：pending / success / unavailable 是三个彼此独立的
  // 运行期维度（等待中 / 刚成功 / 不可用），平铺成位置参数极易传错顺序。
  const syncVisual = (
    isSwitchActive,
    { unavailable: unavailable = false, pending: pending = false, success: success = false } = {}
  ) => {
    // 点动开关没有稳定的开态，点亮只能表示「请求执行中」，因此用 pending 而不是状态值；
    // unavailable 优先级最高，任何情况下都不点亮。
    const resolvedActive = (momentary ? pending : !!isSwitchActive) && !unavailable;
    switchElement.classList.toggle("is-on", resolvedActive);
    switchElement.classList.toggle("is-unavailable", unavailable);
    switchElement.classList.toggle("is-pending", pending);
    switchElement.classList.toggle("is-success", success);
    switchElement.setAttribute("aria-pressed", String(resolvedActive));
    switchElement.setAttribute("aria-busy", String(pending));
    switchElement.setAttribute(
      "aria-label",
      unavailable
        ? labelText + "当前不可用"
        : momentary
          ? "" + labelText + (success ? "执行成功" : pending ? "正在执行" : "，点击执行")
          : "" + labelText + (resolvedActive ? "已开启，点击关闭" : "已关闭，点击开启")
    );
    if (copyStateElement) {
      copyStateElement.textContent = unavailable
        ? "当前不可用"
        : momentary
          ? success
            ? "执行成功"
            : pending
              ? "执行中"
              : "点击执行"
          : resolvedActive
            ? "运行中"
            : "已关闭";
    }
  };
  // 这里再查一遍 is-pending / is-unavailable 而不是只靠 disabled：
  // 按钮需要在等待期间仍可聚焦（否则焦点会丢失、读屏中断），因此不能真禁用，
  // 只能在点击回调里把重复触发挡掉。
  switchElement.addEventListener("click", () => {
    if (
      interactive &&
      !switchElement.classList.contains("is-pending") &&
      !switchElement.classList.contains("is-unavailable")
    ) {
      onToggle?.();
    }
  });
  return {
    visual: switchElement,
    sync: syncVisual
  };
}

/**
 * 附加面板的公共小工具。
 *
 * 0.7.8 的附加面板按实体域拆成 10 个模块，但它们的宿主契约一致：
 * `createXxxExtraPanel({ element, feedbackSlot?, onControl?, ... })` 返回
 * `{ root, update(model), dispose() }`。这里只收拢重复的 DOM / 反馈 / 可见性逻辑。
 */
import { attributesOf } from "../device/entity-capabilities";

/** 面板视图模型：由 `purifier-extras` 注入，字段来自运行时状态袋。 */
export type ExtraPanelViewModel = {
  item?: any;
  state?: any;
  states?: any;
  editing?: any;
  active?: boolean;
  /** 实体 → HA 显示精度（`number-formats` 通道下发）；缺省时数值原样显示。 */
  numberFormats?: Record<string, number>;
};

/** 面板反馈槽（`createPopupFeedback` 的实例）；面板只用到 attach。 */
export type FeedbackSlot = {
  attach?: (node: any, options?: any) => (() => void) | undefined;
  begin?: (source: string) => void;
  clear?: () => void;
  root?: any;
};

export function createPanelElement(ownerDocument: Document, tagName: string, textContent = "") {
  const element = ownerDocument.createElement(tagName);
  element.textContent = textContent;
  return element;
}

/** 反馈节点卸载函数的安全包装：反馈槽可缺省，卸载可重复调用。 */
export function attachFeedback(
  feedbackSlot: FeedbackSlot | undefined,
  node: any,
  options: any,
): () => void {
  const release = feedbackSlot?.attach?.(node, options);
  return () => release?.();
}

/** 读取实体实时状态（兼容 `state.newState` 包装）。 */
function liveStateOf(viewModel: ExtraPanelViewModel | null | undefined) {
  return viewModel?.state?.newState || viewModel?.state;
}

/** 实体属性（统一走 entity-capabilities，避免各处重复判空）。 */
export function liveAttributesOf(viewModel: ExtraPanelViewModel | null | undefined) {
  return attributesOf(liveStateOf(viewModel));
}

function modelEntityId(viewModel: ExtraPanelViewModel | null | undefined) {
  return String(viewModel?.item?.entityId || "");
}

export function modelDomain(viewModel: ExtraPanelViewModel | null | undefined) {
  return modelEntityId(viewModel).split(".")[0];
}

/** 面板是否处于"可交互"态：未编辑、模型可用、实体可用、未在提交。 */
export function panelEntityUsable(
  viewModel: ExtraPanelViewModel | null | undefined,
  options: { allowStatelessUnknown?: boolean } = {},
) {
  if (!viewModel || viewModel.item?.modelAvailable === false) return false;
  const state = liveStateOf(viewModel);
  if (!state || state.available === false) return false;
  if (state.state === "unknown" && options.allowStatelessUnknown) return true;
  return !["unknown", "unavailable", "", undefined].includes(state.state);
}

/**
 * 滚动到可视区才加载重型内容（摄像头 / 图片 / 列表）。
 *
 * 返回 `visible` 读取器与 `dispose()`；没有 `IntersectionObserver` 时视为一直可见。
 */
export function createVisibilityGate(hostElement: any, onChange: () => void) {
  const view = hostElement?.ownerDocument?.defaultView;
  const Observer = view?.IntersectionObserver || (globalThis as any).IntersectionObserver;
  if (!Observer) {
    return { visible: () => true, observe: () => {}, dispose: () => {} };
  }
  let visible = false;
  const observer = new Observer((entries: any[]) => {
    const nextVisible = entries.some((entry) => entry.isIntersecting);
    if (nextVisible === visible) return;
    visible = nextVisible;
    onChange();
  });
  observer.observe(hostElement);
  return {
    visible: () => visible,
    observe: () => observer.observe(hostElement),
    dispose: () => observer.disconnect?.(),
  };
}

/** 统一的状态词表（复合设备 / 服务设备共用）。 */
export const EXTRA_STATE_LABELS: Record<string, string> = {
  on: "已开启",
  off: "已关闭",
  open: "已打开",
  closed: "已关闭",
  opening: "正在打开",
  closing: "正在关闭",
  cleaning: "清扫中",
  docked: "已停靠",
  returning: "返回中",
  paused: "已暂停",
  idle: "待机",
  mowing: "割草中",
  error: "设备故障",
  disarmed: "已撤防",
  armed_home: "在家布防",
  armed_away: "离家布防",
  armed_night: "夜间布防",
  armed_vacation: "假期布防",
  armed_custom_bypass: "自定义布防",
  pending: "等待触发",
  arming: "正在布防",
  disarming: "正在撤防",
  triggered: "已触发警报",
  listening: "正在聆听",
  processing: "正在处理",
  responding: "正在回复",
};

export function extraStateText(viewModel: ExtraPanelViewModel | null | undefined) {
  const state = liveStateOf(viewModel);
  if (!state) return "设备不可用";
  if (state.state === "unknown") return "状态未知";
  return EXTRA_STATE_LABELS[state.state] || String(state.state || "");
}

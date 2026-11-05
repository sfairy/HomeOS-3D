/**
 * 附加面板的公共小工具。
 *
 * 0.7.8 的附加面板按实体域拆成 10 个模块，但它们的宿主契约一致：
 * `createXxxExtraPanel({ element, feedbackSlot?, onControl?, ... })` 返回
 * `{ root, update(model), dispose() }`。这里只收拢重复的反馈槽 / 可见性 / 状态词表逻辑。
 */

/** 面板视图模型：由 `purifier-extras` 注入，字段来自运行时状态袋。 */
export type ExtraPanelViewModel = {
  item?: any
  state?: any
  states?: any
  editing?: any
  active?: boolean
  /** 实体 → HA 显示精度（`number-formats` 通道下发）；缺省时数值原样显示。 */
  numberFormats?: Record<string, number>
}

/** 面板反馈槽（`createPopupFeedback` 的实例）；面板只用到 attach。 */
export type FeedbackSlot = {
  attach?: (node: any, options?: any) => (() => void) | undefined
  begin?: (source: string) => void
  clear?: () => void
  root?: any
}

export function attachFeedback(feedbackSlot: FeedbackSlot | undefined, node: any, options: any): () => void {
  const release = feedbackSlot?.attach?.(node, options)
  return () => release?.()
}

/**
 * 滚动到可视区才加载重型内容（摄像头 / 图片 / 列表）。
 *
 * 返回 `visible` 读取器与 `dispose()`；没有 `IntersectionObserver` 时视为一直可见。
 */
export function createVisibilityGate(hostElement: any, onChange: () => void) {
  const view = hostElement?.ownerDocument?.defaultView
  const Observer = view?.IntersectionObserver || (globalThis as any).IntersectionObserver
  if (!Observer) {
    return { visible: () => true, observe: () => {}, dispose: () => {} }
  }
  let visible = false
  const observer = new Observer((entries: any[]) => {
    const nextVisible = entries.some((entry) => entry.isIntersecting)
    if (nextVisible === visible) return
    visible = nextVisible
    onChange()
  })
  observer.observe(hostElement)
  return {
    visible: () => visible,
    observe: () => observer.observe(hostElement),
    dispose: () => observer.disconnect?.(),
  }
}

/** 统一的状态词表（复合设备 / 服务设备共用）。 */
export const EXTRA_STATE_LABELS: Record<string, string> = {
  on: '已开启',
  off: '已关闭',
  open: '已打开',
  closed: '已关闭',
  opening: '正在打开',
  closing: '正在关闭',
  cleaning: '清扫中',
  docked: '已停靠',
  returning: '返回中',
  paused: '已暂停',
  idle: '待机',
  mowing: '割草中',
  error: '设备故障',
  disarmed: '已撤防',
  armed_home: '在家布防',
  armed_away: '离家布防',
  armed_night: '夜间布防',
  armed_vacation: '假期布防',
  armed_custom_bypass: '自定义布防',
  pending: '等待触发',
  arming: '正在布防',
  disarming: '正在撤防',
  triggered: '已触发警报',
  listening: '正在聆听',
  processing: '正在处理',
  responding: '正在回复',
}

/**
 * 户型图灯光手势显式状态机
 *
 * 职责：
 * - 维护灯光手势的阶段（idle / armed / long_press / swipe_dim / drag_edit / consumed）
 *   与快按 / 长按 / 竖滑调光的阈值常量。
 * - 提供手势状态机工具：armed / tryEnterSwipeDim / shouldQuickToggle 等，
 *   让单击切换 / 长按弹窗 / 竖滑调光互斥，避免阈值竞态。
 *
 * 依赖：无外部依赖，纯函数 + 常量。
 *
 * 注意：手势阶段 key（idle / armed / long_press / ...）为状态机标识符，不翻译；
 *   阈值常量为运行时数值，不翻译。
 */

/** 手势阶段 */
type FloorplanGesturePhase =
  | 'idle'
  | 'armed'
  | 'long_press'
  | 'swipe_dim'
  | 'drag_edit'
  | 'consumed'

const FLOORPLAN_QUICK_CLICK_MS = 300
/** FLOORPLAN_LONG_PRESS_MS：常量，取值语义见定义处。 */
export const FLOORPLAN_LONG_PRESS_MS = 750
/** 竖滑调光判定阈值（px） */
export const FLOORPLAN_SWIPE_DIM_THRESHOLD_PX = 12

export type FloorplanGestureSnapshot = {
  phase: FloorplanGesturePhase
  widgetId: string | null
  startClientX: number
  startClientY: number
  startTs: number
}

export function createIdleGesture(): FloorplanGestureSnapshot {
  return {
    phase: 'idle',
    widgetId: null,
    startClientX: 0,
    startClientY: 0,
    startTs: 0,
  }
}

export function armGesture(
  widgetId: string,
  clientX: number,
  clientY: number,
  now = Date.now(),
): FloorplanGestureSnapshot {
  return {
    phase: 'armed',
    widgetId,
    startClientX: clientX,
    startClientY: clientY,
    startTs: now,
  }
}

/**
 * 在 armed 阶段根据位移判定是否进入竖滑调光。
 * 垂直位移超过阈值且主导方向为竖向时进入 swipe_dim。
 */
export function tryEnterSwipeDim(
  gesture: FloorplanGestureSnapshot,
  clientX: number,
  clientY: number,
  thresholdPx = FLOORPLAN_SWIPE_DIM_THRESHOLD_PX,
): FloorplanGestureSnapshot {
  if (gesture.phase !== 'armed') return gesture
  const dy = clientY - gesture.startClientY
  const dx = clientX - gesture.startClientX
  if (Math.abs(dy) > thresholdPx && Math.abs(dy) > Math.abs(dx)) {
    return { ...gesture, phase: 'swipe_dim' }
  }
  return gesture
}

/** 是否应触发短按切换（仅 armed 且未超时） */
export function shouldQuickToggle(
  gesture: FloorplanGestureSnapshot,
  now = Date.now(),
  quickMs = FLOORPLAN_QUICK_CLICK_MS,
): boolean {
  return (
    gesture.phase === 'armed' &&
    !!gesture.widgetId &&
    gesture.startTs > 0 &&
    now - gesture.startTs < quickMs
  )
}

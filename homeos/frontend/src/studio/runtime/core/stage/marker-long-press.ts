/**
 * 逐灯「长按打开弹窗」的运行时接线（0.8.8 `stage.js` 的 pointerdown 分支）。
 *
 * 从 `stage-handlers.ts` 单独切出来有两个原因：
 * 1. 判定条件有 5 个前置（模块 / 编辑态 / 相机运动 / 调层 / 范围编辑）+ 3 个元素态，
 *    塞回标记创建闭包会把那个已经有 10+ 分支的函数再顶高一档；
 * 2. 这段逻辑只依赖宿主的少量成员，独立成文件后可以直接对着它写断言。
 */
import { lightLongPressSeconds } from '@app/shared/util/light-long-press'

/** 长按接线只需要宿主上的这些成员（`StageHandlersHost` 的索引签名满足它）。 */
export interface MarkerLongPressHost {
  activeModule?: string
  isEditing?: boolean
  isCameraMoving?: boolean
  isAwaitingFloorViewAdjust?: boolean
  panelDisplayMode?: string
  isRangeEditorOpen?: boolean
  map: Map<string, HTMLElement>
  findBindingById: (
    markerId: string,
  ) => { longPressOpensPanel?: boolean; longPressSeconds?: unknown } | null | undefined
  markerHold?: { start: (event: unknown, seconds: number, fire: () => void) => void }
  openMarkerPanel: (markerId: string) => void
}

/**
 * 该标记是否允许长按（0.8.8 `_0x264522`）。
 *
 * 返回 `null` 表示「这一盏不接受长按」，调用方据此不做任何事（也不吞点击）。
 */
export function resolveLongPressLight(host: MarkerLongPressHost, markerId: string) {
  if (!isLongPressModeReady(host)) return null
  const lightEntry = findInteractiveLightEntry(host, markerId)
  return lightEntry?.longPressOpensPanel === true ? lightEntry : null
}

/** 模式前置：只有「灯光」模块且不在编辑 / 相机运动 / 调层 / 范围编辑中才允许长按。 */
function isLongPressModeReady(host: MarkerLongPressHost) {
  if (host.activeModule !== 'light') return false
  if (host.isEditing || host.isCameraMoving || host.isAwaitingFloorViewAdjust) return false
  return !(host.panelDisplayMode === 'edit' || host.isRangeEditorOpen)
}

/** 元素前置：标记必须真实可见、可交互且未落在 `[inert]` 子树里。 */
function findInteractiveLightEntry(host: MarkerLongPressHost, markerId: string) {
  const markerElement = host.map.get(markerId)
  if (!markerElement || markerElement.hidden || (markerElement as HTMLButtonElement).disabled) return null
  if (markerElement.closest('[inert]')) return null
  return host.findBindingById(markerId)
}

/** 给一个标记挂上长按计时；计时器本身住在舞台根节点（`host.markerHold`）。 */
export function bindMarkerLongPress(host: MarkerLongPressHost, markerElement: HTMLElement, markerId: string) {
  markerElement.addEventListener('pointerdown', (downEvent: PointerEvent) => {
    const lightEntry = resolveLongPressLight(host, markerId)
    if (!lightEntry) return
    host.markerHold?.start(downEvent, lightLongPressSeconds(lightEntry.longPressSeconds), () => {
      // 触发前再判一次：按住期间可能已切模块 / 离开该层 / 被锁定。
      if (resolveLongPressLight(host, markerId)) host.openMarkerPanel(markerId)
    })
  })
}

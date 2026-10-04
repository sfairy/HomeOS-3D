/**
 * 户型图灯光滚轮/滑动调光（FloorplanCanvas 拆分模块）
 *
 * 职责：
 *   1. 监听灯光热点的滚轮事件，按步长调整亮度；
 *   2. 监听触摸滑动事件，按垂直滑动距离调整亮度；
 *   3. 显示调光 HUD（百分比提示），并在防抖窗口内合并调用 HA 服务。
 *
 * 依赖：vue、@homeos/shared（getEntityDomain）、@/services/notify、entities.store。
 */
import { ref, type Ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { notifyError } from '@/services/notify'
import {
  FLOORPLAN_SWIPE_DIM_THRESHOLD_PX,
} from '@/utils/floorplan/gesture-machine.util'
import type { useEntitiesStore } from '@/stores/entities.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>

/** 灯光调光 composable 的依赖参数 */
interface FloorplanLightDimDeps {
  /** 实体 store */
  entitiesStore: EntitiesStore
  /** 是否处于编辑模式（编辑模式下禁用调光） */
  isEditMode: Ref<boolean>
  /** 当前拖拽中的 widget id（拖拽中禁用调光） */
  draggingWidgetId: Ref<string | null>
  /** 取消长按的回调（滑动调光触发时取消长按进度） */
  clearLongPress: () => void
}

/**
 * 户型图灯光滚轮/滑动调光 composable。
 *
 * 调用场景：FloorplanCanvas 中注入依赖，返回调光 HUD 状态与事件处理器。
 *
 * @param deps 依赖参数
 * @returns dimHud、滚轮/触摸事件处理器、dispose
 */
export function useFloorplanLightDim(deps: FloorplanLightDimDeps) {
  const { entitiesStore, isEditMode, draggingWidgetId, clearLongPress } = deps

  /** 调光 HUD 状态（widgetId + 百分比），null 表示隐藏 */
  const dimHud = ref<{ widgetId: string; pct: number } | null>(null)

  /** HUD 自动隐藏定时器 */
  let dimHudTimer: ReturnType<typeof setTimeout> | null = null
  /** 调用 HA 服务的防抖定时器（80ms 窗口内合并） */
  let dimDebounceTimer: ReturnType<typeof setTimeout> | null = null
  /** 滑动调光起始 Y 坐标 */
  let swipeDimStartY = 0
  /** 滑动调光起始 X 坐标（用于判定主方向） */
  let swipeDimStartX = 0
  /** 当前滑动调光的 widget */
  let swipeDimWidget: { id: string } | null = null
  /** 滑动调光起始亮度百分比 */
  let swipeDimStartPct = 50
  /** 是否已进入滑动调光状态（达到阈值后置 true） */
  let swipeDimActive = false

  /**
   * 获取灯光当前亮度百分比。
   * @param entityId 实体 id
   * @returns 0-100 的亮度百分比（无 brightness 属性时按 on/off 推断）
   */
  function getLightBrightnessPct(entityId: string) {
    const e = entitiesStore.getEntity(entityId)
    const b = e?.attributes?.brightness
    if (b != null) return Math.round((Number(b) / 255) * 100)
    return e?.state === 'on' ? 100 : 0
  }

  /**
   * 应用灯光亮度：防抖调用 HA light.turn_on 服务并更新 HUD。
   *
   * 副作用：会设置防抖定时器与 HUD 显示/隐藏定时器；服务调用失败时弹出通知。
   *
   * @param entityId 实体 id
   * @param pct 目标亮度百分比（会被 clamp 到 1-100）
   */
  function applyLightBrightness(entityId: string, pct: number) {
    const clamped = Math.max(1, Math.min(100, Math.round(pct)))
    if (dimDebounceTimer) clearTimeout(dimDebounceTimer)
    // 80ms 防抖窗口合并连续滚轮/滑动产生的多次调用
    dimDebounceTimer = setTimeout(() => {
      Promise.resolve(
        entitiesStore.callService(
          'light',
          'turn_on',
          entityId,
          { brightness_pct: clamped },
          false,
          { quiet: true },
        ),
      ).catch((e) => notifyError(e, '亮度调节失败'))
    }, 80)
    dimHud.value = { widgetId: entityId, pct: clamped }
    // HUD 显示 1.2s 后自动隐藏
    if (dimHudTimer) clearTimeout(dimHudTimer)
    dimHudTimer = setTimeout(() => {
      dimHud.value = null
    }, 1200)
  }

  /**
   * 滚轮调光：非编辑模式下灯光热点按滚轮方向 ±4% 调整。
   * @param widget 热点
   * @param event 滚轮事件
   */
  function onWidgetWheel(widget: { id: string }, event: WheelEvent) {
    if (isEditMode.value || getEntityDomain(widget.id) !== 'light') return
    if (event.cancelable) event.preventDefault()
    const delta = event.deltaY > 0 ? -4 : 4
    applyLightBrightness(widget.id, getLightBrightnessPct(widget.id) + delta)
  }

  /**
   * 开始滑动调光：记录起始坐标与起始亮度。
   * @param widget 热点
   * @param event 鼠标/触摸事件
   */
  function beginSwipeDim(widget: { id: string }, event: MouseEvent | TouchEvent) {
    swipeDimWidget = widget
    swipeDimActive = false
    const pt = 'touches' in event ? event.touches[0] : event
    swipeDimStartX = pt.clientX
    swipeDimStartY = pt.clientY
    if (getEntityDomain(widget.id) === 'light') {
      swipeDimStartPct = getLightBrightnessPct(widget.id)
    }
  }

  /**
   * 触摸移动调光：垂直滑动超过阈值后进入调光状态，按滑动距离调整亮度。
   * @param widget 热点
   * @param event 触摸事件
   */
  function onWidgetTouchMove(widget: { id: string }, event: TouchEvent) {
    if (isEditMode.value || draggingWidgetId.value) return
    const t = event.touches?.[0]
    if (!t) return
    // 首次移动时判定是否进入滑动调光（垂直位移 > 12px 且大于水平位移）
    if (!swipeDimActive && swipeDimWidget?.id === widget.id) {
      const dy = t.clientY - swipeDimStartY
      const dx = t.clientX - swipeDimStartX
      if (Math.abs(dy) > FLOORPLAN_SWIPE_DIM_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
        swipeDimActive = true
        clearLongPress()
      }
    }
    if (!swipeDimActive || getEntityDomain(widget.id) !== 'light') return
    event.preventDefault()
    // 向上滑动增加亮度（dy 为负 -> delta 为正）
    const dy = swipeDimStartY - t.clientY
    const delta = Math.round(dy / 8)
    applyLightBrightness(widget.id, swipeDimStartPct + delta)
  }

  /**
   * 结束滑动调光。
   * @returns 是否曾处于滑动调光状态（用于上层判断是否抑制点击）
   */
  function endSwipeDim(): boolean {
    const wasSwipeDim = swipeDimActive
    swipeDimWidget = null
    swipeDimActive = false
    return wasSwipeDim
  }

  /** 释放资源：清理所有定时器 */
  function dispose() {
    if (dimHudTimer) clearTimeout(dimHudTimer)
    if (dimDebounceTimer) clearTimeout(dimDebounceTimer)
    dimHudTimer = null
    dimDebounceTimer = null
  }

  return {
    dimHud,
    onWidgetWheel,
    onWidgetTouchMove,
    beginSwipeDim,
    endSwipeDim,
    dispose,
  }
}
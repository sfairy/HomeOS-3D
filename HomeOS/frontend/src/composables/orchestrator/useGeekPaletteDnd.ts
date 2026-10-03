/**
 * @file useGeekPaletteDnd.ts
 * @module composables/orchestrator
 * @description Geek 画布左侧投放栏 → 舞台拖放 composable（Flow / Scene 共用）。
 *
 * 职责：
 * - 监听投放栏 pointerdown，超过阈值时进入拖拽态；
 * - 拖拽过程中更新位置；pointerup 时若在舞台内则调用 onDrop 投放；
 * - 提供 clientToFlowCoordinate 把客户端坐标转换为画布坐标；
 * - 拖放完成后吞掉一次投放栏 click，避免误触打开抽屉。
 *
 * 依赖：
 * - vue（onUnmounted、reactive、Ref）
 */
import { onUnmounted, reactive, type Ref } from 'vue'

/** 投放栏项的最小数据形状 */
type GeekPaletteDndItem = {
  badge?: string
  label?: string
  kind?: string
  [key: string]: unknown
}

/** 画布坐标点 */
type GeekPaletteDndPosition = { x: number; y: number }

/** 拖放配置：舞台 ref、坐标转换、视口、投放回调、阈值等 */
type UseGeekPaletteDndOptions = {
  stageRef: Ref<HTMLElement | null | undefined>
  /** Vue Flow screenToFlowCoordinate({x,y}) 或等价 */
  screenToFlowCoordinate?: ((pt: { x: number; y: number }) => GeekPaletteDndPosition) | null
  /** 部分版本暴露的 (x,y) => point */
  screenToFlow?: ((clientX: number, clientY: number) => GeekPaletteDndPosition) | null
  viewport?: Ref<{ x?: number; y?: number; zoom?: number } | undefined> | null
  onDrop: (item: GeekPaletteDndItem, position: GeekPaletteDndPosition) => void
  /** 返回 false 则忽略本次 pointerdown */
  canStart?: (item: GeekPaletteDndItem) => boolean
  dropOffset?: { w: number; h: number }
  threshold?: number
}

// 默认投放尺寸偏移：投放位置减去节点宽高的一半，使节点中心对齐指针
const DEFAULT_DROP = { w: 132, h: 40 }
// 默认拖拽阈值：移动超过 6px 才进入拖拽态
const DEFAULT_THRESHOLD = 6

/**
 * 投放栏拖放 composable。
 *
 * @param options 配置项（见 UseGeekPaletteDndOptions）
 * @returns dnd 拖拽状态 reactive；onPalettePointerDown 投放栏 pointerdown 处理；consumeRailClickSkip 吞掉 click；
 *          clientToFlowCoordinate 坐标转换；isPointInStage 是否在舞台内；stopPaletteDndListeners/resetDnd 清理方法
 */
export function useGeekPaletteDnd(options: UseGeekPaletteDndOptions) {
  const dropOffset = options.dropOffset || DEFAULT_DROP
  const threshold = options.threshold ?? DEFAULT_THRESHOLD

  // 拖拽状态：active 是否进入拖拽、item 当前项、originX/Y 起点、x/y 当前位置
  const dnd = reactive({
    active: false,
    item: null as GeekPaletteDndItem | null,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  })

  // 标记位：拖放完成后吞掉一次投放栏 click，避免误触
  let skipRailClick = false
  let dndMoveHandler: ((e: PointerEvent) => void) | null = null
  let dndUpHandler: ((e: PointerEvent) => void) | null = null

  /**
   * 把客户端坐标转换为画布坐标：优先用 screenToFlow / screenToFlowCoordinate，
   * 都不可用时回退到手动计算（基于 stageRef 边界与 viewport）。
   */
  function clientToFlowPosition(clientX: number, clientY: number): GeekPaletteDndPosition {
    try {
      const fn = options.screenToFlow
      if (typeof fn === 'function') {
        const p = fn(clientX, clientY)
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p
      }
    } catch {
      /* 仓库未就绪 */
    }
    try {
      const fn = options.screenToFlowCoordinate
      if (typeof fn === 'function') {
        const p = fn({ x: clientX, y: clientY })
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p
      }
    } catch {
      /* 仓库未就绪 */
    }
    // 兜底：基于 stageRef 边界手动换算
    const el =
      options.stageRef.value?.querySelector?.('.vue-flow') || options.stageRef.value || null
    const bounds = el?.getBoundingClientRect?.()
    if (!bounds) return { x: clientX, y: clientY }
    const vp = options.viewport?.value || { x: 0, y: 0, zoom: 1 }
    const zoom = vp.zoom || 1
    return {
      x: (clientX - bounds.left - (vp.x || 0)) / zoom,
      y: (clientY - bounds.top - (vp.y || 0)) / zoom,
    }
  }

  /** 判断客户端坐标是否在舞台边界内。 */
  function isPointInStage(clientX: number, clientY: number): boolean {
    const bounds = options.stageRef.value?.getBoundingClientRect?.()
    if (!bounds) return false
    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    )
  }

  /** 移除 pointermove / pointerup / pointercancel 监听并清空 handler 引用。 */
  function stopPaletteDndListeners() {
    if (dndMoveHandler) {
      window.removeEventListener('pointermove', dndMoveHandler)
      dndMoveHandler = null
    }
    if (dndUpHandler) {
      window.removeEventListener('pointerup', dndUpHandler)
      window.removeEventListener('pointercancel', dndUpHandler)
      dndUpHandler = null
    }
  }

  /** 重置拖拽状态：active=false、item=null、移除拖拽 class。 */
  function resetDnd() {
    dnd.active = false
    dnd.item = null
    document.body.classList.remove('geek-dnd-dragging')
  }

  /**
   * 投放栏 pointerdown 处理：仅左键、无 Ctrl/Meta；
   * 注册 pointermove/up 监听；移动超过阈值进入拖拽态；
   * pointerup 时若在舞台内则调用 onDrop 投放（位置减去节点一半尺寸）。
   *
   * @param ev pointer 事件
   * @param item 投放栏项
   */
  function onPalettePointerDown(ev: PointerEvent, item: GeekPaletteDndItem) {
    // 仅响应左键且无修饰键
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey) return
    if (options.canStart && !options.canStart(item)) return
    stopPaletteDndListeners()
    dnd.item = item
    dnd.active = false
    dnd.originX = ev.clientX
    dnd.originY = ev.clientY
    dnd.x = ev.clientX
    dnd.y = ev.clientY

    dndMoveHandler = (e) => {
      if (!dnd.item) return
      dnd.x = e.clientX
      dnd.y = e.clientY
      if (!dnd.active) {
        // 移动距离未达阈值时不进入拖拽态
        const dx = e.clientX - dnd.originX
        const dy = e.clientY - dnd.originY
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
        dnd.active = true
        document.body.classList.add('geek-dnd-dragging')
      }
    }

    dndUpHandler = (e) => {
      const itemToDrop = dnd.item
      const wasDragging = dnd.active
      stopPaletteDndListeners()
      resetDnd()
      // 未拖拽或无项：不投放
      if (!wasDragging || !itemToDrop) return
      // 标记吞掉一次 click，避免拖放完成后误触打开抽屉
      skipRailClick = true
      // 不在舞台内：放弃投放
      if (!isPointInStage(e.clientX, e.clientY)) return
      const pos = clientToFlowPosition(e.clientX, e.clientY)
      // 投放位置减去节点宽高一半，使节点中心对齐指针
      options.onDrop(itemToDrop, {
        x: pos.x - dropOffset.w / 2,
        y: pos.y - dropOffset.h / 2,
      })
    }

    window.addEventListener('pointermove', dndMoveHandler, { passive: true })
    window.addEventListener('pointerup', dndUpHandler)
    window.addEventListener('pointercancel', dndUpHandler)
  }

  /**
   * 投放栏 click：若刚完成拖放则吞掉一次 click。
   * @returns 是否吞掉（true=应阻止后续 click 行为）
   */
  function consumeRailClickSkip(): boolean {
    if (!skipRailClick) return false
    skipRailClick = false
    return true
  }

  // 组件卸载时清理监听与状态，避免内存泄漏
  onUnmounted(() => {
    stopPaletteDndListeners()
    resetDnd()
  })

  return {
    dnd,
    onPalettePointerDown,
    consumeRailClickSkip,
    clientToFlowPosition,
    isPointInStage,
    stopPaletteDndListeners,
    resetDnd,
  }
}

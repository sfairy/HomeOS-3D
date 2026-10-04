/**
 * @file 下拉定位 Composable
 * @module composables/ui/useDropdownPosition
 *
 * 职责：
 *  - useDropdownPosition：实体/搜索下拉的 Teleport 定位，兼容整页等比缩放画布，自动上下翻转。
 *
 * 依赖：
 *  - vue 的 ref / computed / onMounted / onUnmounted / watch / nextTick / Ref。
 *  - usePopupPosition 的 rectToDropdownPosition / buildDropdownFixedStyle / expandDropdownMaxHeight / measureDropdownFitWidth。
 *    锚定下拉挂 #teleport-target，关闭 viewportCoords，走画布坐标换算以与主 UI 同比例缩放。
 *  - popup-position-shared.util 的 collectOverflowScrollParents。
 *  - popup-position-dropdown.util 的 DropdownPosition 类型。
 *  - useKeepAliveGate / useShellTeleportTarget（壳挂载点就绪后再 Teleport）
 *  - useExclusiveDropdown（全局同时仅一个锚定下拉打开）。
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue'
import {
  rectToDropdownPosition,
  buildDropdownFixedStyle,
  expandDropdownMaxHeight,
  measureDropdownFitWidth,
} from '@/composables/ui/usePopupPosition'
import { collectOverflowScrollParents, getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import type { DropdownPosition } from '@/utils/ui/popup-position-dropdown.util'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

/** 数值型选项：可为常量或取值函数（支持响应式） */
type NumericOpt = number | (() => number)

/** 下拉定位选项 */
type DropdownOptions = {
  /** 锚点与下拉的间距（像素），默认 4 */
  gap?: number
  /** 下拉最小宽度（像素），默认 200 */
  minWidth?: NumericOpt
  /** 下拉最大高度（像素），默认 320 */
  maxHeight?: NumericOpt
  /** 视口边缘安全间距（像素），默认 8 */
  margin?: NumericOpt
  /** 下拉头部 chrome 高度（像素），默认 44 */
  chromeHeight?: NumericOpt
  /** 列表最小高度（像素），默认 136 */
  minListHeight?: NumericOpt
  /** 单行最小高度（像素），默认 68 */
  minRowHeight?: NumericOpt
  /** 下拉 DOM 元素引用（用于测量实际高度） */
  dropdownRef?: Ref<HTMLElement | null>
  /** 是否参与全局互斥，默认 true；嵌套子菜单传 false */
  exclusive?: boolean
  /**
   * 宽度随内容自适应：以 minWidth 为下限，按 dropdownRef 实测内容宽度扩张，
   * 并限制在视口安全边距内。
   */
  fitContent?: boolean
  /**
   * 强制使用纯 viewport 坐标（不进行缩放壳内画布单位换算）。
   * 当 Teleport 目标为 document.body 而非缩放壳 #teleport-target 时必须传 true，
   * 否则 fixed 定位的 containing block 为 viewport 而坐标被除以 scale，导致位置偏移。
   * 默认 false（随 #teleport-target 缩放壳自动决定是否换算）。
   */
  viewportCoords?: boolean
}

/**
 * 实体/搜索下拉：Teleport 定位（兼容整页等比缩放画布，自动上下翻转）。
 *
 * 调用场景：实体选择器、搜索下拉等需要脱离父级 overflow 限制的下拉浮层。
 *
 * @param anchorRef - 锚点元素引用
 * @param isOpenRef - 下拉是否打开的响应式引用
 * @param options - 下拉定位选项
 * @returns ddPos - 下拉位置信息；dropdownStyle - fixed 定位样式；teleportTarget - Teleport 目标；teleportDisabled - 是否禁用 Teleport；placement - 当前放置方向；updatePosition - 触发位置更新
 */
export function useDropdownPosition(
  anchorRef: Ref<HTMLElement | null>,
  isOpenRef: Ref<boolean>,
  options: DropdownOptions = {},
) {
  const gap = options.gap ?? 4
  const dropdownRef = options.dropdownRef

  /** 解析数值型选项：支持常量与取值函数，未提供时使用 fallback */
  const resolveOpt = <K extends keyof DropdownOptions>(
    key: K,
    fallback: number,
  ): number => {
    const value = options[key]
    if (typeof value === 'function') return (value as () => number)()
    return (value as number | undefined) ?? fallback
  }

  /** 下拉位置信息（响应式） */
  const ddPos = ref<DropdownPosition>({
    left: 0,
    top: 0,
    bottom: null,
    width: 0,
    placement: 'bottom',
    maxHeight: resolveOpt('maxHeight', 320),
  })
  const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
  /** 全局互斥：打开本下拉时关闭其它已登记菜单 */
  useExclusiveDropdown(isOpenRef, { exclusive: options.exclusive })
  const {
    teleportTarget,
    shellTeleportPending,
    refreshShellTeleport,
  } = useShellTeleportTarget()
  /** 壳未就绪或 keep-alive 失活时禁用 Teleport，避免挂到 null / 残留遮罩 */
  const teleportDisabled = computed(
    () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
  )
  /** 当前放置方向（top/bottom），默认 bottom */
  const placement = computed(() => ddPos.value.placement || 'bottom')
  /** 下拉 fixed 定位样式 */
  const dropdownStyle = computed(() =>
    buildDropdownFixedStyle(ddPos.value, { fitContent: options.fitContent === true }),
  )

  // keep-alive 失活时关掉下拉，避免 Teleport 残留遮挡其它页面
  watch(keepAliveTeleportDisabled, (disabled) => {
    if (disabled && isOpenRef.value) isOpenRef.value = false
  })

  // 打开时再探测一次壳挂载点（ScaledViewport 可能刚完成挂载）
  watch(isOpenRef, (open) => {
    if (open) refreshShellTeleport()
  })

  let resizeObserver: ResizeObserver | null = null
  let anchorResizeObserver: ResizeObserver | null = null
  /** 滚动父级监听器列表（用于解绑） */
  let scrollParentListeners: Array<{ el: HTMLElement; handler: () => void }> = []
  /** 绑定所有 overflow 滚动父级的 scroll 事件，触发位置更新 */
  function bindScrollParents() {
    unbindScrollParents()
    const el = anchorRef.value
    if (!el) return
    for (const parent of collectOverflowScrollParents(el)) {
      const handler = onViewportChange
      parent.addEventListener('scroll', handler, { passive: true })
      scrollParentListeners.push({ el: parent, handler })
    }
  }

  /** 解绑所有滚动父级的 scroll 事件 */
  function unbindScrollParents() {
    for (const { el, handler } of scrollParentListeners) el.removeEventListener('scroll', handler)
    scrollParentListeners = []
  }

  /** 核心定位计算：根据锚点 rect 与各项尺寸约束计算下拉位置与最大高度 */
  function updatePosition() {
    const el = anchorRef.value
    if (!el) return
    const resolvedMaxHeight = resolveOpt('maxHeight', 320)
    let resolvedMinWidth = resolveOpt('minWidth', 200)
    const resolvedMargin = resolveOpt('margin', 8)
    const resolvedChromeHeight = resolveOpt('chromeHeight', 44)
    const resolvedMinListHeight = resolveOpt('minListHeight', 136)
    const resolvedMinRowHeight = resolveOpt('minRowHeight', 68)
    if (options.fitContent) {
      const { cw } = getTeleportContainerSize()
      resolvedMinWidth = measureDropdownFitWidth(dropdownRef?.value, {
        minWidth: resolvedMinWidth,
        maxWidth: Math.max(resolvedMinWidth, cw - resolvedMargin * 2),
      })
    }
    const measured = dropdownRef?.value?.offsetHeight
    const minContent = resolvedChromeHeight + resolvedMinRowHeight
    // 估算高度：优先用实测值（不小于最小内容高度），否则用 maxHeight
    const estimatedHeight = Math.min(
      measured && measured >= minContent ? measured : resolvedMaxHeight,
      resolvedMaxHeight,
    )
    const pos = rectToDropdownPosition(el.getBoundingClientRect(), gap, resolvedMinWidth, {
      estimatedHeight,
      margin: resolvedMargin,
      chromeHeight: resolvedChromeHeight,
      minListHeight: resolvedMinListHeight,
      minRowHeight: resolvedMinRowHeight,
      viewportCoords: options.viewportCoords,
    })
    // 尝试扩展最大高度（基于实际 scrollHeight），失败则保留原 pos
    ddPos.value =
      expandDropdownMaxHeight(pos, el.getBoundingClientRect(), {
        gap,
        maxHeight: resolvedMaxHeight,
        margin: resolvedMargin,
        scrollHeight: dropdownRef?.value?.scrollHeight ?? 0,
      }) ?? pos
  }

  /** 调度位置更新：立即更新一次，nextTick 与 rAF 中再各更新一次确保布局稳定 */
  function scheduleUpdate() {
    updatePosition()
    nextTick(() => {
      updatePosition()
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(updatePosition)
      }
    })
  }

  /** 视口变化（滚动/缩放）时若下拉打开则调度更新 */
  function onViewportChange() {
    if (isOpenRef?.value) scheduleUpdate()
  }
  // 下拉打开/关闭时绑定/解绑监听器
  watch(isOpenRef, (open) => {
    if (open) {
      scheduleUpdate()
      if (typeof ResizeObserver !== 'undefined') {
        // 清理旧 observer 后重新创建，分别监听下拉与锚点的尺寸变化
        resizeObserver?.disconnect()
        anchorResizeObserver?.disconnect()
        resizeObserver = new ResizeObserver(() => {
          if (isOpenRef?.value) updatePosition()
        })
        anchorResizeObserver = new ResizeObserver(() => {
          if (isOpenRef?.value) updatePosition()
        })
        nextTick(() => {
          bindScrollParents()
          if (dropdownRef?.value) resizeObserver?.observe(dropdownRef.value)
          if (anchorRef?.value) anchorResizeObserver?.observe(anchorRef.value)
        })
      } else {
        // 不支持 ResizeObserver 时仅绑定滚动父级
        nextTick(bindScrollParents)
      }
      return
    }
    // 关闭时解绑所有监听
    unbindScrollParents()
    resizeObserver?.disconnect()
    resizeObserver = null
    anchorResizeObserver?.disconnect()
    anchorResizeObserver = null
  })

  onMounted(() => {
    window.addEventListener('resize', onViewportChange, { passive: true })
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    window.visualViewport?.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('scroll', onViewportChange)
  })

  onUnmounted(() => {
    unbindScrollParents()
    resizeObserver?.disconnect()
    resizeObserver = null
    anchorResizeObserver?.disconnect()
    anchorResizeObserver = null
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange, { capture: true })
    window.visualViewport?.removeEventListener('resize', onViewportChange)
    window.visualViewport?.removeEventListener('scroll', onViewportChange)
  })

  return {
    ddPos,
    dropdownStyle,
    teleportTarget,
    teleportDisabled,
    placement,
    updatePosition: scheduleUpdate,
  }
}
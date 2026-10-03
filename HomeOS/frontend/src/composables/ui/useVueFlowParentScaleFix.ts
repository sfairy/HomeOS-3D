/**
 * @file useVueFlowParentScaleFix.ts
 * @module composables/ui
 * @description 纠正整页 transform:scale 下 Vue Flow 连线锚点偏移。
 *
 * Vue Flow 用 getBoundingClientRect 差 / viewport.zoom 计算 handleBounds；
 * 祖先再有 CSS scale 时，差会被多乘一次 scale，连线缩进到节点内侧。
 * 本 composable 在每次测量后把 handle.x/y 除回 parent scale，并提供画布坐标换算。
 */
import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { currentScale, scalingEnabled } from '@/composables/ui/useScaling'

const FIXED_AT_SCALE = '__hosParentScale'

/** useVueFlowParentScaleFix：函数，按签名入参返回处理结果。 */
export function useVueFlowParentScaleFix(flowId?: string) {
  const { getNodes, updateNodeInternals, screenToFlowCoordinate, vueFlowRef, viewport } =
    useVueFlow(flowId)

  function parentScale() {
    if (!scalingEnabled.value) return 1
    const s = Number(currentScale.value)
    return Number.isFinite(s) && s > 0 ? s : 1
  }

  function compensateHandleBounds() {
    const s = parentScale()
    const nodes = getNodes.value || []
    let needsRemeasure = false
    for (const node of nodes) {
      if (!node.handleBounds) continue
      for (const key of ['source', 'target'] as const) {
        const handles = node.handleBounds[key]
        if (!handles?.length) continue
        if (Math.abs(s - 1) < 0.001) {
          if (handles.some((h) => (h as unknown as Record<string, unknown>)[FIXED_AT_SCALE] != null)) {
            needsRemeasure = true
          }
          continue
        }
        let changed = false
        const next = handles.map((h) => {
          const mark = h as unknown as Record<string, unknown>
          if (mark[FIXED_AT_SCALE] === s) return h
          changed = true
          const fixed = {
            ...h,
            x: typeof h.x === 'number' ? h.x / s : h.x,
            y: typeof h.y === 'number' ? h.y / s : h.y,
          }
          ;(fixed as unknown as Record<string, unknown>)[FIXED_AT_SCALE] = s
          return fixed
        })
        if (changed) node.handleBounds[key] = next
      }
    }
    if (needsRemeasure) {
      try {
        updateNodeInternals?.()
      } catch {
        /* 忽略 */
      }
    }
  }

  function scheduleFix() {
    nextTick(() => {
      compensateHandleBounds()
      requestAnimationFrame(() => compensateHandleBounds())
    })
  }

  function refresh() {
    try {
      updateNodeInternals?.()
    } catch {
      /* flow 未就绪 */
    }
    scheduleFix()
  }

  /** 视口坐标 → flow 坐标（整页 scale 时先换算为画布像素） */
  function screenToFlow(clientX: number, clientY: number) {
    const s = parentScale()
    if (Math.abs(s - 1) < 0.001 && typeof screenToFlowCoordinate === 'function') {
      return screenToFlowCoordinate({ x: clientX, y: clientY })
    }
    const el = vueFlowRef?.value as HTMLElement | undefined
    const rect = el?.getBoundingClientRect?.()
    if (!rect) {
      return typeof screenToFlowCoordinate === 'function'
        ? screenToFlowCoordinate({ x: clientX, y: clientY })
        : { x: 0, y: 0 }
    }
    const vp = viewport?.value || { x: 0, y: 0, zoom: 1 }
    const zoom = vp.zoom || 1
    const x = (clientX - rect.left) / s
    const y = (clientY - rect.top) / s
    return {
      x: (x - (vp.x || 0)) / zoom,
      y: (y - (vp.y || 0)) / zoom,
    }
  }

  watch(
    () => {
      const nodes = getNodes.value || []
      return nodes
        .map((n) => {
          const src = n.handleBounds?.source?.[0]
          const tgt = n.handleBounds?.target?.[0]
          return `${n.id}:${src?.x},${src?.y},${tgt?.x},${tgt?.y},${n.dimensions?.width}`
        })
        .join('|')
    },
    () => scheduleFix(),
  )

  watch([currentScale, scalingEnabled], () => refresh())

  function onScalingChange() {
    refresh()
  }

  onMounted(() => {
    window.addEventListener('homeos-scaling-change', onScalingChange)
    refresh()
  })
  onUnmounted(() => {
    window.removeEventListener('homeos-scaling-change', onScalingChange)
  })

  return { screenToFlow, refresh, compensateHandleBounds, parentScale }
}

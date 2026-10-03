/**
 * @file Geek Vue Flow 安全 fitView（避免未测尺寸 / NaN 视口）
 */
import { nextTick, type Ref } from 'vue'

type GeekFitViewOpts = {
  padding?: number
  duration?: number
  maxZoom?: number
  /** 仅适配这些节点 id */
  nodeIds?: string[]
}

type FlowNodeLike = {
  id?: string
  position?: { x?: number; y?: number }
  dimensions?: { width?: number; height?: number }
  width?: number
  height?: number
}

type SafeGeekFitViewArgs = {
  stageEl: HTMLElement | null | undefined
  nodes: FlowNodeLike[]
  getNodes: Ref<FlowNodeLike[]> | (() => FlowNodeLike[]) | FlowNodeLike[] | null | undefined
  fitView: (opts: Record<string, unknown>) => Promise<unknown> | unknown
  setViewport?: ((vp: { x: number; y: number; zoom: number }) => Promise<unknown> | unknown) | null
  viewport?: Ref<{ x?: number; y?: number; zoom?: number } | undefined> | null
  refreshScaleFix?: (() => void) | null
  /** 若节点坐标非法，返回净化后的节点；调用方决定是否写回 */
  sanitizeNodes?: ((nodes: FlowNodeLike[]) => FlowNodeLike[]) | null
  applySanitized?: ((nodes: FlowNodeLike[]) => void) | null
  defaultViewport?: { x: number; y: number; zoom: number } | null
  /** 视口非法时的判定：Flow 要求 zoom>0；Scene/Template 仅检查 finite */
  requirePositiveZoom?: boolean
  fit?: GeekFitViewOpts
}

function resolveNodeList(
  getNodes: SafeGeekFitViewArgs['getNodes'],
  fallback: FlowNodeLike[],
): FlowNodeLike[] {
  try {
    if (getNodes && typeof getNodes === 'object' && 'value' in getNodes) {
      const v = (getNodes as Ref<FlowNodeLike[]>).value
      return Array.isArray(v) ? v : fallback
    }
    if (typeof getNodes === 'function') {
      const v = getNodes()
      return Array.isArray(v) ? v : fallback
    }
    if (Array.isArray(getNodes)) return getNodes
  } catch {
    /* 仓库未就绪 */
  }
  return fallback
}

/**
 * 在节点已测到宽高且舞台尺寸有效时再 fitView，失败时回退 defaultViewport。
 */
export async function safeGeekFitView(args: SafeGeekFitViewArgs): Promise<void> {
  await nextTick()
  const rect = args.stageEl?.getBoundingClientRect?.()
  if (!rect || rect.width < 8 || rect.height < 8) return

  let current = Array.isArray(args.nodes) ? args.nodes : []
  if (!current.length) return

  if (
    args.sanitizeNodes &&
    current.some((n) => !Number.isFinite(n?.position?.x) || !Number.isFinite(n?.position?.y))
  ) {
    current = args.sanitizeNodes(current)
    args.applySanitized?.(current)
  }

  await nextTick()
  try {
    const list = resolveNodeList(args.getNodes, current)
    const hasReady = list.some((n) => {
      const w = Number(n?.dimensions?.width ?? n?.width ?? 0)
      const h = Number(n?.dimensions?.height ?? n?.height ?? 0)
      return w > 0 && h > 0
    })
    if (!hasReady) return

    const fit = args.fit || {}
    const nodesToFit = fit.nodeIds?.length
      ? list.filter((n) => n.id && fit.nodeIds!.includes(n.id))
      : undefined

    await args.fitView({
      padding: fit.padding ?? 0.2,
      duration: fit.duration ?? 220,
      maxZoom: fit.maxZoom ?? 1.05,
      ...(nodesToFit?.length ? { nodes: nodesToFit } : {}),
    })
  } catch {
    /* Vue Flow 未就绪 */
  }

  args.refreshScaleFix?.()

  const vp = args.viewport?.value
  const requireZoom = args.requirePositiveZoom !== false
  const invalid =
    !vp ||
    !Number.isFinite(vp.x) ||
    !Number.isFinite(vp.y) ||
    !Number.isFinite(vp.zoom) ||
    (requireZoom && (vp.zoom ?? 0) <= 0)

  if (invalid && args.defaultViewport && args.setViewport) {
    try {
      await args.setViewport(args.defaultViewport)
    } catch {
      /* 忽略 */
    }
  }
}

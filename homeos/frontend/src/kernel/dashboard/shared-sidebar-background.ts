/**
 * 「共享组件 → Vue 侧边栏」的桥接（0.9.0）。
 *
 * ## 为什么需要这一层
 *
 * 0.9.0 的侧边栏背景是**文档里的共享组件**：`sharedComponents` 顶层的
 * `type: 'page-background'` 会和其它共享控件一起渲染在页面上，且对所有页面生效。
 * 本项目的侧边栏是 Vue 部件树（`RightSidebar.vue`），与面板渲染器是两个 DOM 世界，
 * 所以需要把「当前仪表盘文档里的共享背景」搬进 Vue 侧边栏。
 *
 * 数据流是单向的：
 *
 * ```
 *   /projects/{id}/draft ──► display.ts ──► publishSharedSidebarBackground()
 *                                                   │
 *                                    （订阅，无 Vue 依赖）
 *                                                   ▼
 *                                          RightSidebar.vue
 * ```
 *
 * 为什么用「快照 + 订阅」而不是 Pinia：这个 store 由 `studio/app/display/display.ts`
 * 写入，而 display 引导脚本不依赖 Vue 运行时（它是纯 DOM 引导）。放一个无框架的
 * 小 store 在 kernel，两边都能用，也不用把 Vue 拉进展示端的首屏。
 *
 * ## 与 0.9.0 的映射
 *
 * - `layoutMode = 'fill'`：铺满侧边栏（共享层在画布上也是整页铺满）；
 * - `layoutMode = 'free'`：把组件 `position`（画布 px）折算成**侧边栏内的百分比**，
 *   这样「右下角一块图」在小侧边栏里仍是右下角，而不是被裁成铺满；
 * - 透明度 / 预设 / 素材 id 原样透传，两个宿主共用 `normalizePageBackground` 的夹取。
 *
 * ## 回退规则
 *
 * 文档里没有共享背景时，Vue 侧边栏继续用 `layoutConfig.sidebarBackground`
 * （0.8.9 时代的本地设置）。两者都不存在则不铺背景 —— 保持旧观感。
 */
import {
  normalizePageBackground,
  type PageBackground,
  type PageBackgroundLegacyPosition,
} from '@/kernel/widget/page-background'

/** 文档里的页面背景组件类型（与 `PAGE_BACKGROUND_TYPE` 同值，这里不反向依赖 studio）。 */
const PAGE_BACKGROUND_COMPONENT_TYPE = 'page-background'

/** 侧边栏背景快照：`background` 为 `null` 表示当前仪表盘没有共享背景。 */
export type SharedSidebarBackgroundSnapshot = {
  /** 已折算成「侧边栏坐标系」的背景配置；`null` = 没有共享背景。 */
  background: PageBackground | null
  /** 来源仪表盘 id（切项目时用于指纹去重，也方便排查）。 */
  projectId: string
}

const EMPTY_SNAPSHOT: SharedSidebarBackgroundSnapshot = Object.freeze({
  background: null,
  projectId: '',
})

let snapshot: SharedSidebarBackgroundSnapshot = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

function clampPercent(value: unknown, min: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(min, parsed))
}

/** 画布尺寸（缺省与 0.9.0 渲染器一致）。 */
function canvasSize(canvas?: { width?: number; height?: number }) {
  return {
    width: Math.max(1, Number(canvas?.width || 2778)),
    height: Math.max(1, Number(canvas?.height || 1940)),
  }
}

/**
 * 组件 `position`（画布 px）→ 百分比盒。
 *
 * 与检查器的换算口径一致：`x/y` 是左上角，宽度/高度按画布折算。侧边栏尺寸未知，
 * 所以只保留相对比例 —— 百分比是相对量，天然免疫容器尺寸差异。
 */
export function sharedSidebarPositionPercentages(
  position: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null | undefined,
  canvas?: { width?: number; height?: number },
): PageBackgroundLegacyPosition | undefined {
  if (!position || typeof position !== 'object') return undefined
  const { width: canvasWidth, height: canvasHeight } = canvasSize(canvas)
  const width = Number(position.width)
  const height = Number(position.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  const x = Number(position.x)
  const y = Number(position.y)
  return {
    x: clampPercent((Number.isFinite(x) ? x : 0) / (canvasWidth / 100), 0, 0),
    y: clampPercent((Number.isFinite(y) ? y : 0) / (canvasHeight / 100), 0, 0),
    width: clampPercent(width / (canvasWidth / 100), 0.1, 100),
    height: clampPercent(height / (canvasHeight / 100), 0.1, 100),
  }
}

/**
 * 从仪表盘文档里取「共享组件顶层的页面背景」，折算成侧边栏用的配置。
 *
 * 只认 `sharedComponents` 顶层：0.9.0 的后端也只允许共享组件顶层与页面顶层，
 * 嵌套的那一份会被保存期校验拒绝，前端没必要替它兜底。
 */
export function sidebarBackgroundFromSharedComponent(
  documentPayload: unknown,
  canvas?: { width?: number; height?: number },
): PageBackground | null {
  const documentRecord = documentPayload as { sharedComponents?: unknown } | null | undefined
  const sharedComponents: unknown[] = Array.isArray(documentRecord?.sharedComponents)
    ? documentRecord.sharedComponents
    : []
  const component = sharedComponents.find(
    (candidate) => (candidate as { type?: unknown } | null)?.type === PAGE_BACKGROUND_COMPONENT_TYPE,
  ) as { properties?: unknown; position?: unknown } | undefined
  if (!component) return null

  const background = normalizePageBackground(component.properties)
  if (background.layoutMode !== 'free') return background
  const percentages = sharedSidebarPositionPercentages(
    component.position as Record<string, unknown> | undefined,
    canvas ?? (documentRecord as { canvas?: { width?: number; height?: number } } | null | undefined)?.canvas,
  )
  // 自由布局但组件盒本身不可用（缺 width/height）时退回铺满：
  // 在侧边栏里画一块「尺寸未知」的图，用户只会以为背景坏了。
  return percentages ? normalizePageBackground({ ...background, legacyPosition: percentages }) : background
}

/** 当前快照（供首帧读取与外部排查）。 */
export function getSharedSidebarBackground(): SharedSidebarBackgroundSnapshot {
  return snapshot
}

/** 订阅快照变化；返回取消订阅函数。 */
export function subscribeSharedSidebarBackground(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(next: SharedSidebarBackgroundSnapshot) {
  const previous = snapshot
  const unchanged =
    previous.projectId === next.projectId && JSON.stringify(previous.background) === JSON.stringify(next.background)
  if (unchanged) return
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * 发布「当前仪表盘」的共享背景（展示端每次拿到草稿后调用）。
 *
 * 不传 `document` 时视为「这个项目没有共享背景」，会清空快照并让侧边栏回退到
 * `layoutConfig.sidebarBackground`。
 */
export function publishSharedSidebarBackground(
  projectId: string,
  documentPayload?: unknown,
  canvas?: { width?: number; height?: number },
): void {
  publish({
    projectId: String(projectId || ''),
    background: sidebarBackgroundFromSharedComponent(documentPayload, canvas),
  })
}

/** 离开展示页（或加载失败）时清空：侧边栏立刻回退到本地设置。 */
export function clearSharedSidebarBackground(): void {
  publish(EMPTY_SNAPSHOT)
}

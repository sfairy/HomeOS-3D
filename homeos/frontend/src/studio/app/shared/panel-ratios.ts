/**
 * 绘制台面板比例的首帧缓存。
 *
 * 真值在场景 settings（`detailsPanelWidthRatio` / `previewPanelRatio`，随场景 payload
 * 从后端到达），`applyDetailsRatio` / `applyPanelRatios` 把最终（已夹紧的）比例写进
 * CSS 变量。问题在于 payload 到达之前，`.studio-shell` 只能按 CSS 兜底排一帧
 * （右栏 `29vw`、预览 `52%`），随后才换成用户上次的宽度 —— 从仪表盘编辑器切进
 * 户型图绘制时，那一两帧的列宽跳变就是「样式不对的瞬间」。
 *
 * 这里只做**首帧提示**：进入绘制台时先按上次落地的比例排布，payload 到达后仍以
 * 服务端 settings 为准（比例被夹紧、或换了项目导致不同，都只是把这一跳推回正常语义）。
 *
 * 纯 localStorage，不依赖任何运行期对象：`authoring/ui/workspace.ts`（写）与
 * `entries/StudioView.vue`（首帧读）都要用，放 `app/shared` 这个叶子层避免成环。
 */

const STORAGE_KEY = 'homeos.studio-floorplan.panel-ratios'

export interface StudioPanelRatios {
  /** 右栏（平面 / 3D 预览那一列）宽度占比，0..1。 */
  detailsPanelWidthRatio: number
  /** 右栏内 3D 预览的高度占比，0..1。 */
  previewPanelRatio: number
}

/** 与引擎 `getPanelRatioLimits()` 的夹紧区间同口径；超出的旧值不参与首帧排布。 */
const WIDTH_RANGE = [0.08, 0.86] as const
const HEIGHT_RANGE = [0.08, 0.94] as const

const FALLBACK: StudioPanelRatios = { detailsPanelWidthRatio: 0.29, previewPanelRatio: 0.52 }

function clampRatio(value: unknown, [min, max]: readonly [number, number]): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

/** 读出上次落地的比例；没有缓存或缓存损坏时返回 `null`（调用方落回 CSS 兜底）。 */
export function readStudioPanelRatios(): StudioPanelRatios | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StudioPanelRatios> | null
    if (!parsed || typeof parsed !== 'object') return null
    const width = clampRatio(parsed.detailsPanelWidthRatio, WIDTH_RANGE)
    const height = clampRatio(parsed.previewPanelRatio, HEIGHT_RANGE)
    if (width === null || height === null) return null
    return { detailsPanelWidthRatio: width, previewPanelRatio: height }
  } catch {
    return null
  }
}

/**
 * 记录一次落地（场景 settings 生效 / 用户拖拽分隔条）的比例。
 *
 * 拖拽期间每次都调，因此只有值真的变了才写 localStorage —— 否则每一帧都有一次同步
 * 读改写。`patch` 允许只更新一个字段（两个 apply 函数各自只负责自己那个）。
 */
export function writeStudioPanelRatios(patch: Partial<StudioPanelRatios>): void {
  if (typeof localStorage === 'undefined') return
  const stored = readStudioPanelRatios()
  const current = stored ?? FALLBACK
  const next: StudioPanelRatios = {
    detailsPanelWidthRatio:
      clampRatio(patch.detailsPanelWidthRatio ?? current.detailsPanelWidthRatio, WIDTH_RANGE) ??
      current.detailsPanelWidthRatio,
    previewPanelRatio:
      clampRatio(patch.previewPanelRatio ?? current.previewPanelRatio, HEIGHT_RANGE) ?? current.previewPanelRatio,
  }
  const unchanged =
    stored !== null &&
    Math.abs(next.detailsPanelWidthRatio - stored.detailsPanelWidthRatio) < 0.0005 &&
    Math.abs(next.previewPanelRatio - stored.previewPanelRatio) < 0.0005
  if (unchanged) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式 / 配额满：首帧退回 CSS 兜底即可，不影响功能 */
  }
}

/**
 * 首帧排布：把缓存的比例写到壳层与右栏上（与引擎写的变量、单位完全一致）。
 *
 * 必须在浏览器绘制第一帧之前调用（`onMounted` 里、第一个 `await` 之前）；
 * 之后这两个变量由引擎接管，Vue 不再参与，避免重新渲染时把用户刚拖的宽度盖回旧值。
 *
 * 宽度要按引擎同一条下限（右栏不小于 360px）夹一次：缓存里存的是服务端原值，
 * 而引擎最终写进 CSS 的是夹紧后的值，不先夹就会出现「首帧 349px → 引擎 355px」的小跳。
 */
export function applyStudioPanelRatios(
  studioShell: HTMLElement | null | undefined,
  detailsPanel: HTMLElement | null | undefined,
): void {
  const ratios = readStudioPanelRatios()
  if (!ratios) return
  const shellWidth =
    studioShell?.getBoundingClientRect().width || (typeof window === 'undefined' ? 0 : window.innerWidth)
  // 与引擎 `getPanelRatioLimits()` 同口径：右栏不小于 360px，也不把中间画布压到 320px 以下。
  const libraryWidth = studioShell?.querySelector('.library-panel')?.getBoundingClientRect().width ?? 204
  const minimumWidthRatio = shellWidth > 0 ? Math.min(0.45, Math.max(WIDTH_RANGE[0], 360 / shellWidth)) : WIDTH_RANGE[0]
  const maximumWidthRatio =
    shellWidth > 0
      ? Math.min(WIDTH_RANGE[1], Math.max(0.45, (shellWidth - libraryWidth - 20 - 320) / shellWidth))
      : WIDTH_RANGE[1]
  const width = Math.min(maximumWidthRatio, Math.max(minimumWidthRatio, ratios.detailsPanelWidthRatio))

  const detailsHeight = detailsPanel?.getBoundingClientRect().height || 0
  const minimumHeightRatio =
    detailsHeight > 0 ? Math.min(0.5, Math.max(HEIGHT_RANGE[0], 320 / detailsHeight)) : HEIGHT_RANGE[0]
  const maximumHeightRatio =
    detailsHeight > 0
      ? Math.min(HEIGHT_RANGE[1], Math.max(0.5, (detailsHeight - 14 - 170) / detailsHeight))
      : HEIGHT_RANGE[1]
  const height = Math.min(maximumHeightRatio, Math.max(minimumHeightRatio, ratios.previewPanelRatio))

  studioShell?.style.setProperty('--details-panel-width', `${(width * 100).toFixed(2)}%`)
  detailsPanel?.style.setProperty('--preview-panel-height', `${(height * 100).toFixed(2)}%`)
}

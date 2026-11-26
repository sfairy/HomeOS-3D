/**
 * 页面背景模型（0.8.9 `page-background.js`）—— **主页面与侧边栏共用的唯一真相**。
 *
 * 为什么要有双宿主（决策见升级文档 §12.6）：
 *
 * - 主页面是 studio 文档，按页渲染，所以背景是**文档组件**（`type: 'page-background'`，
 *   每页独立、可撤销/复制/导出）；
 * - 侧边栏是 `layoutConfig.rightPanelWidgets` 的 Vue 部件系统，全局唯一，所以背景落在
 *   `layoutConfig.sidebarBackground`。
 *
 * 两者共用本文件的**预设表 + 归一化 + 取图地址**，保证「同一种背景」在两处长得一样、
 * 字段取值范围一致、切换预设后不会一处生效一处不生效。
 *
 * 放在 `shared/utils` 而不是 `studio/`：布局 store（`create-layout-persistence`）也要
 * 归一化侧边栏背景，而 store 不能反向依赖 `studio/**` —— 那会把 3D 子图拉进首屏。
 * `studio/app/shared/page-background.ts` 只是对本文件的**转发**。
 *
 * 与 0.8.9 的差异（有意，需在验收中登记）：
 * 1. 侧边栏背景是全局配置，不随页切换；
 * 2. 侧边栏背景从「外观设置」编辑，不出现在仪表盘编辑器的组件列表里；
 * 3. 主页面背景仍是文档组件，与 0.8.9 一致。
 */

import type {
  PageBackgroundConfig,
  PageBackgroundLayout,
  PageBackgroundPosition,
  PageBackgroundSource,
} from '@/kernel/types/page-background'

/** 文档组件类型（主页面宿主）。 */
export const PAGE_BACKGROUND_TYPE = 'page-background'

/** 背景来源枚举（用于检查器渲染下拉/分段按钮）。 */
export const PAGE_BACKGROUND_SOURCES = ['preset', 'image'] as const

/** 布局方式枚举。 */
export const PAGE_BACKGROUND_LAYOUTS = ['fill', 'free'] as const

/** 内置预设 id → 中文名 → 图片名主干。顺序即选择器顺序。 */
export const PAGE_BACKGROUND_PRESETS = [
  ['default/grid', '经典网格', 'grid'],
  ['default/dots', '微光星尘', 'dots'],
  ['warm-wood/warm-sunlight', '暖阳微光', 'warm-sunlight'],
  ['warm-wood/warm-dusk', '暖阳暮色', 'warm-dusk'],
  ['natural-wood/warm-sunlight', '纸上林庭', 'paper-garden'],
  ['natural-wood/warm-dusk', '暮林静影', 'evening-garden'],
] as const

/** 默认预设（未显式指定时使用）。 */
export const DEFAULT_PAGE_BACKGROUND = 'default/grid'

/** 纯类型契约在 `shared/types`（store 层也要引用），这里原样对外转出。 */
export type {
  PageBackgroundConfig,
  PageBackgroundLayout,
  PageBackgroundPosition,
  PageBackgroundSource,
} from '@/kernel/types/page-background'

/** 文档组件形态：在纯配置之上多 `id` / `type`（主页面宿主使用）。 */
export type PageBackground = PageBackgroundConfig & {
  /** 文档组件 id；侧边栏宿主不使用。 */
  id?: string
  type?: typeof PAGE_BACKGROUND_TYPE
}

/** 预设 id 集合（用于快速判定）。 */
const PRESET_IDS = new Set<string>(PAGE_BACKGROUND_PRESETS.map(([id]) => id))

/** 备注长度上限（与后端 `panel/schema.py` 同口径）。 */
export const PAGE_BACKGROUND_LABEL_LIMIT = 128

/** 铺满时的位置：占满整块画布。 */
export const PAGE_BACKGROUND_FILL_POSITION: PageBackgroundPosition = Object.freeze({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
})

/** 新建背景时的默认值。 */
export function createPageBackground(overrides: Partial<PageBackground> = {}): PageBackground {
  return {
    source: 'preset',
    preset: DEFAULT_PAGE_BACKGROUND,
    assetId: '',
    opacity: 100,
    layoutMode: 'fill',
    position: { ...PAGE_BACKGROUND_FILL_POSITION },
    ...overrides,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed < min ? min : parsed > max ? max : parsed
}

/** 是不是页面背景组件 / 配置。 */
export function isPageBackground(value: unknown): value is PageBackground {
  return !!value && typeof value === 'object' && (value as PageBackground).type === PAGE_BACKGROUND_TYPE
}

/** 解析预设：未知 id 回落到第一个预设（与 0.8.9 的 `pageBackgroundPreset` 一致）。 */
export function pageBackgroundPreset(presetId: unknown) {
  const found = PAGE_BACKGROUND_PRESETS.find(([id]) => id === presetId)
  return found ?? PAGE_BACKGROUND_PRESETS[0]
}

/**
 * 预设的实际图片地址：按容器宽高比挑横 / 竖 / 方三套图。
 *
 * 三档阈值与 0.8.9 一致：宽高比 > 1.33 用 landscape，< 0.75 用 portrait，其余用 square。
 * 这样同一预设在不同形状的容器里都不会被拉伸到失真。
 */
export function pageBackgroundPresetSource(presetId: unknown, width = 1600, height = 900): string {
  const ratio = Number(width) / Math.max(1, Number(height))
  const variant = ratio > 1.33 ? 'landscape' : ratio < 0.75 ? 'portrait' : 'square'
  const [, , stem] = pageBackgroundPreset(presetId)
  return `/static/page-backgrounds/${stem}-${variant}.webp`
}

/**
 * 位置归一化。
 *
 * - 铺满模式**忽略**自定义 position：否则会出现「选了铺满却只铺了一小块」；
 * - 自由模式宽高最小 0.1%：0 会让元素彻底消失，用户会以为「点了没反应」。
 */
function normalizePosition(
  rawPosition: Record<string, unknown>,
  layoutMode: PageBackgroundLayout,
): PageBackgroundPosition {
  if (layoutMode === 'fill') return { ...PAGE_BACKGROUND_FILL_POSITION }
  return {
    x: clampNumber(rawPosition.x, 0, 100, 0),
    y: clampNumber(rawPosition.y, 0, 100, 0),
    width: clampNumber(rawPosition.width, 0.1, 100, 100),
    height: clampNumber(rawPosition.height, 0.1, 100, 100),
  }
}

/** 安全取对象（非对象一律当空对象，避免调用点各写一次 `&& typeof`）。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readSource(value: unknown): PageBackgroundSource {
  return value === 'image' ? 'image' : 'preset'
}

function readLayout(value: unknown): PageBackgroundLayout {
  return value === 'free' ? 'free' : 'fill'
}

function readPreset(value: unknown): string {
  return typeof value === 'string' && PRESET_IDS.has(value) ? value : DEFAULT_PAGE_BACKGROUND
}

function readText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

/** 归一化：任何入口（文档、布局配置、导入备份）都先过这里。 */
export function normalizePageBackground(raw: unknown): PageBackground {
  const source = asRecord(raw)
  const layoutMode = readLayout(source.layoutMode)
  const label = readText(source.label, PAGE_BACKGROUND_LABEL_LIMIT)
  return {
    source: readSource(source.source),
    preset: readPreset(source.preset),
    assetId: readText(source.assetId, 128),
    opacity: clampNumber(source.opacity, 0, 100, 100),
    layoutMode,
    position: normalizePosition(asRecord(source.position), layoutMode),
    ...(label ? { label } : {}),
  }
}

/**
 * 计算渲染用的 CSS（宿主直接铺到背景层上）。
 *
 * - `imageUrl` 由宿主提供（预设走 `pageBackgroundPresetSource`，图片走素材 URL）；
 *   为空时返回 `null`，宿主应隐藏背景层而不是画一块空白。
 * - 铺满用 `100% 100%`（`stretch`），因为用户选的是「铺满整块画布」而不是「保持比例留黑边」；
 *   自由布局用 `100% 100%` + 精确的百分比盒，等价于「保留原位置和尺寸」。
 */
export function pageBackgroundCss(background: PageBackground, imageUrl: string | null): Record<string, string> | null {
  if (!imageUrl) return null
  return {
    backgroundImage: `url('${imageUrl}')`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    opacity: String(clampNumber(background.opacity, 0, 100, 100) / 100),
    left: `${background.position.x}%`,
    top: `${background.position.y}%`,
    width: `${background.position.width}%`,
    height: `${background.position.height}%`,
  }
}

/** 两份配置是否等价（保存前跳过无变化写入）。 */
export function samePageBackground(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizePageBackground(left)) === JSON.stringify(normalizePageBackground(right))
}

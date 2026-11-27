/**
 * 页面背景模型（0.9.0 `page-background.js`）—— **主页面与侧边栏共用的唯一真相**。
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
 * 0.9.0 字段口径（与 `page-background-editor.js` / `renderer/registry.js` 逐项对齐）：
 *
 * - 来源键是 `backgroundSource`（**不是** `source`）；
 * - `opacity` 存 **0–1**，检查器显示时才乘 100；
 * - 自由布局的位置在**组件自身的 `position`（px）**上，`properties` 里没有 `position`。
 *   旧移植期文档的 `properties.position`（百分比）仍可读，归一化后保留在 `legacyPosition`，
 *   首次编辑位置后由检查器改写成组件 `position`。
 *
 * 放在 `shared/utils` 而不是 `studio/`：布局 store（`create-layout-persistence`）也要
 * 归一化侧边栏背景，而 store 不能反向依赖 `studio/**` —— 那会把 3D 子图拉进首屏。
 * `studio/app/shared/page-background.ts` 只是对本文件的**转发**。
 */

import type {
  PageBackgroundConfig,
  PageBackgroundLayout,
  PageBackgroundLegacyPosition,
  PageBackgroundPosition,
  PageBackgroundSource,
} from '@/kernel/page-background'

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

/** 默认透明度：0.9.0 文档存 0–1，缺省即完全不透明。 */
export const DEFAULT_PAGE_BACKGROUND_OPACITY = 1

/** 纯类型契约在 `shared/types`（store 层也要引用），这里原样对外转出。 */
export type {
  PageBackgroundConfig,
  PageBackgroundLayout,
  PageBackgroundLegacyPosition,
  PageBackgroundPosition,
  PageBackgroundSource,
} from '@/kernel/page-background'

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

/** 新建背景时的默认值（与 0.9.0 模板 `create` 逐字段一致）。 */
export function createPageBackground(overrides: Partial<PageBackground> = {}): PageBackground {
  return {
    backgroundSource: 'preset',
    preset: DEFAULT_PAGE_BACKGROUND,
    assetId: '',
    opacity: DEFAULT_PAGE_BACKGROUND_OPACITY,
    layoutMode: 'fill',
    ...overrides,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed < min ? min : parsed > max ? max : parsed
}

/**
 * 透明度归一化：0.9.0 文档是 0–1。
 *
 * 旧移植期文档写的是 0–100（`opacity: 60`），这里按「大于 1 即百分数」折算，
 * 避免导入旧备份后背景变成全透明。
 */
export function normalizePageBackgroundOpacity(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_BACKGROUND_OPACITY
  const ratio = parsed > 1 ? parsed / 100 : parsed
  return clampNumber(ratio, 0, 1, DEFAULT_PAGE_BACKGROUND_OPACITY)
}

/** 是不是页面背景组件 / 配置。 */
export function isPageBackground(value: unknown): value is PageBackground {
  return !!value && typeof value === 'object' && (value as PageBackground).type === PAGE_BACKGROUND_TYPE
}

/** 解析预设：未知 id 回落到第一个预设（与 0.9.0 的 `pageBackgroundPreset` 一致）。 */
export function pageBackgroundPreset(presetId: unknown) {
  const found = PAGE_BACKGROUND_PRESETS.find(([id]) => id === presetId)
  return found ?? PAGE_BACKGROUND_PRESETS[0]
}

/**
 * 预设的实际图片地址：按容器宽高比挑横 / 竖 / 方三套图。
 *
 * 三档阈值与 0.9.0 一致：宽高比 > 1.33 用 landscape，< 0.75 用 portrait，其余用 square。
 * 这样同一预设在不同形状的容器里都不会被拉伸到失真。
 */
export function pageBackgroundPresetSource(presetId: unknown, width = 1600, height = 900): string {
  const ratio = Number(width) / Math.max(1, Number(height))
  const variant = ratio > 1.33 ? 'landscape' : ratio < 0.75 ? 'portrait' : 'square'
  const [, , stem] = pageBackgroundPreset(presetId)
  return `/static/page-backgrounds/${stem}-${variant}.webp`
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

/** 旧移植期 `properties.position`（百分比盒）：只读兼容，新数据不再写。 */
function readLegacyPosition(
  raw: Record<string, unknown>,
  layoutMode: PageBackgroundLayout,
): PageBackgroundLegacyPosition | undefined {
  if (layoutMode !== 'free') return undefined
  const position = raw.position ?? raw.legacyPosition
  if (!position || typeof position !== 'object') return undefined
  const source = position as Record<string, unknown>
  return {
    x: clampNumber(source.x, 0, 100, 0),
    y: clampNumber(source.y, 0, 100, 0),
    width: clampNumber(source.width, 0.1, 100, 100),
    height: clampNumber(source.height, 0.1, 100, 100),
  }
}

/** 归一化：任何入口（文档、布局配置、导入备份）都先过这里。 */
export function normalizePageBackground(raw: unknown): PageBackground {
  const source = asRecord(raw)
  const layoutMode = readLayout(source.layoutMode)
  const label = readText(source.label, PAGE_BACKGROUND_LABEL_LIMIT)
  const legacyPosition = readLegacyPosition(source, layoutMode)
  return {
    backgroundSource: readSource(source.backgroundSource ?? source.source),
    preset: readPreset(source.preset),
    assetId: readText(source.assetId, 128),
    opacity: normalizePageBackgroundOpacity(source.opacity),
    layoutMode,
    ...(label ? { label } : {}),
    ...(legacyPosition ? { legacyPosition } : {}),
  }
}

/**
 * 计算渲染用的 CSS（宿主直接铺到背景层上）。
 *
 * 0.9.0 的渲染器改用 `img` / `canvas` 子节点，本函数只保留给侧边栏/测试这类
 * 「没有组件盒」的宿主使用；`box` 缺省时由 CSS 铺满宿主。
 */
export function pageBackgroundCss(
  background: PageBackground,
  imageUrl: string | null,
  box?: PageBackgroundPosition,
): Record<string, string> | null {
  if (!imageUrl) return null
  const style: Record<string, string> = {
    backgroundImage: `url('${imageUrl}')`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    opacity: String(clampNumber(background.opacity, 0, 1, DEFAULT_PAGE_BACKGROUND_OPACITY)),
  }
  if (box) {
    style.left = `${box.x}px`
    style.top = `${box.y}px`
    style.width = `${box.width}px`
    style.height = `${box.height}px`
  }
  return style
}

/** 两份配置是否等价（保存前跳过无变化写入）。 */
export function samePageBackground(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizePageBackground(left)) === JSON.stringify(normalizePageBackground(right))
}

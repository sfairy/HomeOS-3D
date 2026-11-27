/**
 * 页面背景的**检查器字段表**（0.9.0）—— 主页面检查器与侧边栏设置共用。
 *
 * 为什么把字段元数据单独抽出来：0.9.0 的检查器有 6 个控件（来源 / 预设 / 图片 / 透明度 /
 * 布局 / 位置四格），侧边栏设置也要同样一套。字段范围（`opacity` 0–100 显示、文档存 0–1、
 * 位置 0.1–100%）若在两个宿主里各写一遍，用户会看到「侧边栏能填 0%、主页面最小 0.1%」
 * 这类不一致。
 *
 * 位置四格不在 `properties` 里：0.9.0 把它换算成**组件 `position` 的 px**（x/y 是中心点
 * 百分比，width/height 是尺寸百分比）。换算函数放在本文件，宿主只负责把结果写到组件上。
 *
 * 本模块只做**纯数据 + 纯函数**：给检查器读字段表、把一次编辑合并进配置、判断某个
 * 字段当前是否可用，以及位置百分比与组件 px 的互算。它不碰 DOM，因此可以在 node 里直接断言。
 */

import {
  PAGE_BACKGROUND_LABEL_LIMIT,
  PAGE_BACKGROUND_PRESETS,
  normalizePageBackground,
  normalizePageBackgroundOpacity,
  type PageBackground,
  type PageBackgroundPosition,
} from '@app/shared/page-background'

/** 检查器里的一行输入描述（宿主据此渲染 input / select / 分段按钮）。 */
export type PageBackgroundField = {
  key: string
  label: string
  kind: 'text' | 'number' | 'percent' | 'select' | 'segmented'
  /** 数值输入的范围与步长（`kind` 为 number/percent 时有效）。 */
  min?: number
  max?: number
  step?: number
  /** 当前配置下这一行是否应显示。 */
  visible: (background: PageBackground) => boolean
}

/** 位置四格的分组名（检查器按「布局与位置」分区显示）。 */
export const PAGE_BACKGROUND_POSITION_FIELDS = ['x', 'y', 'width', 'height'] as const
export type PageBackgroundPositionAxis = (typeof PAGE_BACKGROUND_POSITION_FIELDS)[number]

/** 位置字段的中文标签。x/y 是**中心点**百分比，width/height 是尺寸百分比。 */
export const PAGE_BACKGROUND_POSITION_LABELS: Record<PageBackgroundPositionAxis, string> = {
  x: '左侧（%）',
  y: '顶部（%）',
  width: '宽度（%）',
  height: '高度（%）',
}

/** 画布尺寸（缺省与 0.9.0 渲染器一致：2778×1940）。 */
export type PageBackgroundCanvas = { width?: number; height?: number }

/** 预设下拉的选项（value → 中文名）。 */
export function pageBackgroundPresetOptions(): Array<{ value: string; label: string }> {
  return PAGE_BACKGROUND_PRESETS.map(([value, label]) => ({ value, label }))
}

/** 检查器字段表。顺序即界面顺序。 */
export const PAGE_BACKGROUND_FIELDS: readonly PageBackgroundField[] = Object.freeze([
  {
    key: 'label',
    label: '备注',
    kind: 'text',
    visible: () => true,
  },
  {
    key: 'backgroundSource',
    label: '背景来源',
    kind: 'segmented',
    visible: () => true,
  },
  {
    key: 'preset',
    label: '背景主题',
    kind: 'select',
    // 选了「图片」时预设没有意义：显示出来只会让人以为两处都生效。
    visible: (background) => background.backgroundSource === 'preset',
  },
  {
    key: 'assetId',
    label: '选择背景图片',
    kind: 'text',
    visible: (background) => background.backgroundSource === 'image',
  },
  {
    key: 'opacity',
    label: '透明度（%）',
    kind: 'percent',
    min: 0,
    max: 100,
    step: 1,
    visible: () => true,
  },
  {
    key: 'layoutMode',
    label: '背景布局',
    kind: 'segmented',
    visible: () => true,
  },
  {
    key: 'position',
    label: '布局与位置',
    kind: 'number',
    // 铺满模式下位置由布局决定，四个输入框应当整组隐藏（而不是禁用）。
    visible: (background) => background.layoutMode === 'free',
  },
])

/** 某个字段在当前配置下是否可见。未知字段一律可见（避免新增字段默认被藏起来）。 */
export function pageBackgroundFieldVisible(key: string, background: unknown): boolean {
  const field = PAGE_BACKGROUND_FIELDS.find((candidate) => candidate.key === key)
  if (!field) return true
  return field.visible(normalizePageBackground(background))
}

/** 一次编辑：字段名 + 新值。 */
export type PageBackgroundEdit = {
  key: string
  value: unknown
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed < min ? min : parsed > max ? max : parsed
}

/** 位置四格的百分比：x/y 是中心点，width/height 是尺寸（与 0.9.0 检查器一致）。 */
export function pageBackgroundPositionPercentages(
  position: PageBackgroundPosition | undefined,
  canvas?: PageBackgroundCanvas,
): Record<PageBackgroundPositionAxis, number> {
  const box = position ?? { x: 0, y: 0, width: 100, height: 100 }
  const canvasWidth = Number(canvas?.width || 2778)
  const canvasHeight = Number(canvas?.height || 1940)
  return {
    x: round1(((box.x + box.width / 2) / canvasWidth) * 100),
    y: round1(((box.y + box.height / 2) / canvasHeight) * 100),
    width: round1((box.width / canvasWidth) * 100),
    height: round1((box.height / canvasHeight) * 100),
  }
}

/**
 * 把一格百分比换算成组件 `position` 的 px 值（与 0.9.0 检查器一致）。
 *
 * - x/y：百分比是**中心点**，换算后减去一半尺寸得到左上角；
 * - width/height：直接按画布尺寸折算，最小 0.1%（0 会让元素彻底消失）。
 */
export function pageBackgroundPositionAxisValue(
  axis: PageBackgroundPositionAxis,
  percent: unknown,
  position: PageBackgroundPosition | undefined,
  canvas?: PageBackgroundCanvas,
): number {
  const isHorizontal = axis === 'x' || axis === 'width'
  const canvasSize = Number((isHorizontal ? canvas?.width : canvas?.height) || (isHorizontal ? 2778 : 1940))
  const box = position ?? { x: 0, y: 0, width: 100, height: 100 }
  const clamped = clampNumber(percent, axis === 'width' || axis === 'height' ? 0.1 : 0, 100, 0)
  if (axis === 'width' || axis === 'height') return (canvasSize * clamped) / 100
  const offset = axis === 'x' ? box.width / 2 : box.height / 2
  return (canvasSize * clamped) / 100 - offset
}

/**
 * 旧移植期 `properties.position`（百分比盒）换算成组件 px 盒。
 *
 * 新数据没有 `legacyPosition`；只有从旧备份读出来的背景会带着它，渲染/检查器
 * 用画布尺寸把它落成 px，用户第一次拖动位置后就改写成组件 `position`。
 */
export function pageBackgroundLegacyBox(
  background: PageBackground,
  canvas?: PageBackgroundCanvas,
): PageBackgroundPosition | undefined {
  const legacy = background.legacyPosition
  if (!legacy) return undefined
  const canvasWidth = Number(canvas?.width || 2778)
  const canvasHeight = Number(canvas?.height || 1940)
  return {
    x: (canvasWidth * legacy.x) / 100,
    y: (canvasHeight * legacy.y) / 100,
    width: (canvasWidth * legacy.width) / 100,
    height: (canvasHeight * legacy.height) / 100,
  }
}

/** 单字段编辑（位置四格除外）。查表而不是 switch：新字段只加一行，主函数不增长。 */
const SIMPLE_EDITORS: Record<string, (background: PageBackground, value: unknown) => PageBackground> = {
  // `source` 是旧字段名，保留别名让旧调用点不至于静默失败。
  backgroundSource: (background, value) => ({
    ...background,
    backgroundSource: value === 'image' ? 'image' : 'preset',
  }),
  source: (background, value) => ({
    ...background,
    backgroundSource: value === 'image' ? 'image' : 'preset',
  }),
  layoutMode: (background, value) => ({ ...background, layoutMode: value === 'free' ? 'free' : 'fill' }),
  preset: (background, value) => ({ ...background, preset: String(value ?? '') }),
  assetId: (background, value) => ({ ...background, assetId: String(value ?? '') }),
  // UI 输入的是 0–100，文档存 0–1；两者都接受，>1 视为百分数。
  opacity: (background, value) => ({ ...background, opacity: normalizePageBackgroundOpacity(value) }),
  label: (background, value) => ({
    ...background,
    label: String(value ?? '').slice(0, PAGE_BACKGROUND_LABEL_LIMIT),
  }),
}

/**
 * 把一次编辑合并进配置，返回**归一化后**的新对象。
 *
 * 只改当前编辑的字段，其余交给 `normalizePageBackground` 统一夹取 ——
 * 两处各写一套范围正是两个宿主会分叉的根因。
 */
export function applyPageBackgroundEdit(background: unknown, edit: PageBackgroundEdit): PageBackground {
  const current = normalizePageBackground(background)
  const editor = SIMPLE_EDITORS[edit.key]
  return editor ? normalizePageBackground(editor(current, edit.value)) : current
}

export function applyPageBackgroundEdits(background: unknown, edits: readonly PageBackgroundEdit[]): PageBackground {
  return edits.reduce<PageBackground>(
    (accumulated, edit) => applyPageBackgroundEdit(accumulated, edit),
    normalizePageBackground(background),
  )
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

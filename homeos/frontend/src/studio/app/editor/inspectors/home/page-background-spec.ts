/**
 * 页面背景的**检查器字段表**（0.8.9）—— 主页面检查器与侧边栏设置共用。
 *
 * 为什么把字段元数据单独抽出来：0.8.9 的检查器有 6 个控件（来源 / 预设 / 图片 / 透明度 /
 * 布局 / 位置四格），侧边栏设置也要同样一套。字段范围（`opacity` 0–100、位置 0.1–100%、
 * 备注 ≤128）若在两个宿主里各写一遍，用户会看到「侧边栏能填 0%、主页面最小 0.1%」
 * 这类不一致。
 *
 * 本模块只做**纯数据 + 纯函数**：给检查器读字段表、把一次编辑合并进配置、判断某个
 * 字段当前是否可用。它不碰 DOM，因此可以在 node 里直接断言。
 */

import {
  PAGE_BACKGROUND_LABEL_LIMIT,
  PAGE_BACKGROUND_PRESETS,
  type PageBackground,
  normalizePageBackground,
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

/** 位置字段的中文标签。x/y 是左上角百分比，width/height 是尺寸百分比。 */
export const PAGE_BACKGROUND_POSITION_LABELS: Record<PageBackgroundPositionAxis, string> = {
  x: '左侧（%）',
  y: '顶部（%）',
  width: '宽度（%）',
  height: '高度（%）',
}

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
    key: 'source',
    label: '背景来源',
    kind: 'segmented',
    visible: () => true,
  },
  {
    key: 'preset',
    label: '背景主题',
    kind: 'select',
    // 选了「图片」时预设没有意义：显示出来只会让人以为两处都生效。
    visible: (background) => background.source === 'preset',
  },
  {
    key: 'assetId',
    label: '选择背景图片',
    kind: 'text',
    visible: (background) => background.source === 'image',
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

/** 一次编辑：字段名 + 新值。位置四格用 `position.x` 这类点路径。 */
export type PageBackgroundEdit = {
  key: string
  value: unknown
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed < min ? min : parsed > max ? max : parsed
}

/** 位置轴的单格编辑：夹到 0.1–100%（x/y 是 0–100%）。 */
function applyPositionAxis(
  background: PageBackground,
  axis: PageBackgroundPositionAxis,
  value: unknown,
): PageBackground {
  const isSize = axis === 'width' || axis === 'height'
  const clamp = (raw: unknown) => clampNumber(raw, isSize ? 0.1 : 0, 100, background.position[axis])
  return {
    ...background,
    position: { ...background.position, [axis]: clamp(value) },
  }
}

/**
 * 把一次编辑合并进配置，返回**归一化后**的新对象。
 *
 * 切换来源 / 布局时会顺手整理另一侧字段（例如选了图片就把 `preset` 保持原值但隐藏，
 * 因为它可能随时被切回来）—— 只改当前编辑的字段，其余交给 `normalizePageBackground`
 * 统一夹取，避免两处各写一套范围。
 */
/** 单字段编辑（除位置轴外）。查表而不是 switch：新字段只加一行，主函数不增长。 */
const SIMPLE_EDITORS: Record<string, (background: PageBackground, value: unknown) => PageBackground> = {
  source: (background, value) => ({ ...background, source: value === 'image' ? 'image' : 'preset' }),
  layoutMode: (background, value) => ({ ...background, layoutMode: value === 'free' ? 'free' : 'fill' }),
  preset: (background, value) => ({ ...background, preset: String(value ?? '') }),
  assetId: (background, value) => ({ ...background, assetId: String(value ?? '') }),
  opacity: (background, value) => ({ ...background, opacity: value as number }),
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
  if (edit.key.startsWith('position.')) {
    const axis = edit.key.slice('position.'.length)
    if (!PAGE_BACKGROUND_POSITION_FIELDS.includes(axis as PageBackgroundPositionAxis)) return current
    return normalizePageBackground(applyPositionAxis(current, axis as PageBackgroundPositionAxis, edit.value))
  }
  const editor = SIMPLE_EDITORS[edit.key]
  return editor ? normalizePageBackground(editor(current, edit.value)) : current
}

export function applyPageBackgroundEdits(background: unknown, edits: readonly PageBackgroundEdit[]): PageBackground {
  return edits.reduce<PageBackground>(
    (accumulated, edit) => applyPageBackgroundEdit(accumulated, edit),
    normalizePageBackground(background),
  )
}

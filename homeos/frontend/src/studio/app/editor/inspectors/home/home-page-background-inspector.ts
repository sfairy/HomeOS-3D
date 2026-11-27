/**
 * 页面背景检查器的**宿主绑定**（0.9.0 `createPageBackgroundInspector`）。
 *
 * 字段表 / 编辑合并已经在 `page-background-spec.ts`（纯函数，可断言）。这里只做三件事：
 *
 * 1. 按选中组件填充控件（预设下拉只在首次构建，之后只改 value —— 每次重建会把焦点与
 *    滚轮位置一起冲掉）；
 * 2. 绑定「来源 / 布局 / 预设 / 透明度 / 位置四格」的**改属性**事件；
 * 3. 与上游一致的两条**关键行为**：
 *    - 透明度拖动时先走 `previewOpacity` 做实时预览、松手（`change`）才写入文档；
 *    - 位置四格显示的是**百分比**，写入的是**组件 `position` 的 px**（x/y 是中心点）。
 *
 * 透明度文档口径是 **0–1**（0.9.0），输入框显示 0–100；位置由组件 `position` 承载，
 * `properties` 里不再写 `position`。
 */
import {
  PAGE_BACKGROUND_PRESETS,
  normalizePageBackground,
  type PageBackground,
  type PageBackgroundPosition,
} from '@app/shared/page-background'

import {
  applyPageBackgroundEdit,
  pageBackgroundLegacyBox,
  pageBackgroundPositionAxisValue,
  pageBackgroundPositionPercentages,
  type PageBackgroundPositionAxis,
} from './page-background-spec'

/** 检查器用到的宿主能力（显式传入，避免依赖宽类型上下文）。 */
export type PageBackgroundInspectorHost = {
  /** 当前选中的组件；不是页面背景时同步函数整体 no-op。 */
  component: unknown
  /** 当前画布尺寸（位置百分比换算的基准，缺省 2778×1940）。 */
  canvas?: { width?: number; height?: number }
  /** 改属性（走文档 + undo）。 */
  changeProperties: (componentId: string, properties: Record<string, unknown>) => void
  /** 改组件 `position`（位置四格，px）。 */
  changePosition?: (componentId: string, position: Partial<PageBackgroundPosition>) => void
  /** 只预览、不落文档（透明度拖动中，取值 0–1）。 */
  previewOpacity?: (componentId: string, opacity: number) => void
  /** 素材 id → 展示名（图片按钮文案）。 */
  assetName?: (assetId: string) => string
  /** 打开素材选择器。 */
  pickAsset?: () => void
}

const FIELD_IDS = {
  label: 'page-background-label',
  preset: 'page-background-preset',
  opacity: 'page-background-opacity',
  presetField: 'page-background-preset-field',
  imageField: 'page-background-image-field',
  assetButton: 'page-background-asset-button',
  position: 'page-background-position',
  sources: 'page-background-sources',
  layouts: 'page-background-layouts',
} as const

/** 绑定标记：同一个容器只绑一次（每次同步都绑会让一次点击触发 N 次写入）。 */
const BOUND_FLAG = 'pageBackgroundInspectorBound'

/** 位置四格的缺省画布尺寸（0.9.0 同值）。 */
const DEFAULT_CANVAS_WIDTH = 2778
const DEFAULT_CANVAS_HEIGHT = 1940

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

/** 位置四格（`data-background-position`）。 */
function positionInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('[data-background-position]')]
}

/** 按 `data-*` 值同步分段按钮的选中态（`aria-pressed` 同时驱动样式与读屏）。 */
function syncPressed(group: HTMLElement | null, attribute: string, activeValue: string): void {
  if (!group) return
  for (const button of group.querySelectorAll<HTMLButtonElement>('button')) {
    const pressed = button.dataset[attribute] === activeValue
    button.classList.toggle('active', pressed)
    button.setAttribute('aria-pressed', String(pressed))
  }
}

/**
 * 同步检查器到当前组件。返回 `true` 表示「这个组件由本检查器负责」。
 *
 * 返回值用于宿主的 `hasInspector` 判定 —— 没有它，选中页面背景时会显示
 * 「专属属性尚未实现」的空态，而实际上属性就在下面。
 */
export function syncPageBackgroundInspector(host: PageBackgroundInspectorHost): boolean {
  const component = host.component as
    | { id?: string; type?: string; properties?: Record<string, unknown>; position?: PageBackgroundPosition }
    | null
    | undefined
  const isPageBackgroundComponent = component?.type === 'page-background'
  const form = element<HTMLFormElement>('page-background-inspector')
  if (form) form.hidden = !isPageBackgroundComponent
  if (!isPageBackgroundComponent || !component?.id) return isPageBackgroundComponent

  const background = normalizePageBackground(component.properties)
  installControls(host, component.id)

  fillContentFields(host, component.properties ?? {}, background)
  fillPositionFields(component, background, host.canvas)
  return true
}

/**
 * 内容区：备注 / 预设下拉 / 图片按钮 / 透明度 / 来源分段按钮。
 */
function fillContentFields(
  host: PageBackgroundInspectorHost,
  properties: Record<string, unknown>,
  background: PageBackground,
): void {
  const label = element<HTMLInputElement>(FIELD_IDS.label)
  if (label) label.value = typeof properties.label === 'string' ? properties.label : ''

  const presetSelect = element<HTMLSelectElement>(FIELD_IDS.preset)
  if (presetSelect) {
    ensurePresetOptions(presetSelect)
    presetSelect.value = background.preset
  }
  const isImageSource = background.backgroundSource === 'image'
  setHidden(FIELD_IDS.presetField, isImageSource)
  setHidden(FIELD_IDS.imageField, !isImageSource)
  const assetButton = element<HTMLButtonElement>(FIELD_IDS.assetButton)
  if (assetButton) {
    assetButton.textContent = (background.assetId && host.assetName?.(background.assetId)) || '选择图片'
  }
  syncPressed(element(FIELD_IDS.sources), 'backgroundSource', background.backgroundSource)
  const opacity = element<HTMLInputElement>(FIELD_IDS.opacity)
  if (opacity) opacity.value = String(Math.round(clamp(background.opacity, 0, 1) * 100))
}

/**
 * 位置区：布局分段按钮 + 四格百分比。
 *
 * `fill` 模式下四格整体隐藏且禁用 —— 藏起来但仍可 Tab 到会把焦点送到看不见的输入框。
 * 优先读组件 `position`；旧移植期文档没有可用的组件盒时回落到 `properties.position`
 * （百分比），这样老备份的「自由布局」不会突然变成铺满。
 */
function fillPositionFields(
  component: { position?: PageBackgroundPosition },
  background: PageBackground,
  canvas?: { width?: number; height?: number },
): void {
  syncPressed(element(FIELD_IDS.layouts), 'backgroundLayout', background.layoutMode)
  const isFree = background.layoutMode === 'free'
  setHidden(FIELD_IDS.position, !isFree)
  const position = resolvePositionBox(component, background, canvas)
  const percentages = pageBackgroundPositionPercentages(position, canvas)
  for (const input of positionInputs()) {
    input.disabled = !isFree
    const axis = input.dataset.backgroundPosition as PageBackgroundPositionAxis | undefined
    if (axis) input.value = String(percentages[axis])
  }
}

/** 组件 `position` → 旧百分比盒 → 缺省铺满画布。 */
function resolvePositionBox(
  component: { position?: PageBackgroundPosition },
  background: PageBackground,
  canvas?: { width?: number; height?: number },
): PageBackgroundPosition | undefined {
  const componentPosition = readPosition(component.position)
  const legacyPosition = pageBackgroundLegacyBox(background, canvas)
  // 旧文档的组件盒还是「铺满画布」；此时百分比盒才是用户真正设过的位置。
  if (legacyPosition && (!componentPosition || isFullCanvas(componentPosition, canvas))) return legacyPosition
  return componentPosition
}

function readPosition(value: unknown): PageBackgroundPosition | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const x = Number(source.x)
  const y = Number(source.y)
  const width = Number(source.width)
  const height = Number(source.height)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined
  return { x, y, width, height }
}

function isFullCanvas(position: PageBackgroundPosition, canvas?: { width?: number; height?: number }): boolean {
  const canvasWidth = Number(canvas?.width || DEFAULT_CANVAS_WIDTH)
  const canvasHeight = Number(canvas?.height || DEFAULT_CANVAS_HEIGHT)
  return (
    Math.abs(position.x) < 0.5 &&
    Math.abs(position.y) < 0.5 &&
    Math.abs(position.width - canvasWidth) < 0.5 &&
    Math.abs(position.height - canvasHeight) < 0.5
  )
}

function setHidden(id: string, hidden: boolean): void {
  const target = element(id)
  if (target) target.hidden = hidden
}

/** 只在首次构建预设下拉：选项集合是静态的，重建没有收益还会丢焦点。 */
function ensurePresetOptions(select: HTMLSelectElement): void {
  if (select.options.length === PAGE_BACKGROUND_PRESETS.length) return
  select.replaceChildren(
    ...PAGE_BACKGROUND_PRESETS.map(([value, label]) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      return option
    }),
  )
}

/**
 * 绑定改属性事件（每个容器只绑一次）。
 *
 * 兼容上游的两段式提交：`input` 只预览透明度，`change` 才落文档。
 * 注意不能用 `?.addEventListener` 串起来 —— 没有 `previewOpacity` 时要退化成
 * 「input 就落文档」，否则拖动透明度会毫无反馈。
 */
function installControls(host: PageBackgroundInspectorHost, componentId: string): void {
  const form = element<HTMLFormElement>('page-background-inspector')
  if (!form || form.dataset[BOUND_FLAG] === '1') return
  form.dataset[BOUND_FLAG] = '1'
  // `<form>` 里回车会触发表单提交并刷新页面（编辑器是 SPA，看起来就是「闪一下全没了」）。
  form.addEventListener('submit', (submitEvent) => submitEvent.preventDefault())

  form.addEventListener('click', (clickEvent) => {
    const target = clickEvent.target
    const button =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-background-source], [data-background-layout]')
        : null
    if (!button || button.getAttribute('aria-pressed') === 'true') return
    const { backgroundSource, backgroundLayout } = button.dataset
    commitProperties(host, componentId, backgroundSource ? { backgroundSource } : { layoutMode: backgroundLayout })
  })

  element(FIELD_IDS.assetButton)?.addEventListener('click', () => host.pickAsset?.())
  bindPresetAndOpacity(host, componentId)
  bindPositionInputs(host, componentId)
}

/** 预设下拉 + 透明度（拖动只预览、松手才落文档）。 */
function bindPresetAndOpacity(host: PageBackgroundInspectorHost, componentId: string): void {
  element<HTMLSelectElement>(FIELD_IDS.preset)?.addEventListener('change', (changeEvent) => {
    commitProperties(host, componentId, { preset: (changeEvent.target as HTMLSelectElement).value })
  })
  const opacity = element<HTMLInputElement>(FIELD_IDS.opacity)
  if (!opacity) return
  opacity.addEventListener('input', () => {
    // 没有 live-preview 通道时**什么都不做**：拖动中每帧写一次会把撤销栈拖满，
    // 而「松手才生效」是用户能接受的最小代价。
    const value = Number(opacity.valueAsNumber)
    if (Number.isFinite(value)) host.previewOpacity?.(componentId, clamp(value, 0, 100) / 100)
  })
  // 松手才落文档：拖动过程中的每一帧都写一次会把撤销栈拖满。
  opacity.addEventListener('change', () => {
    const value = Number(opacity.valueAsNumber)
    if (Number.isFinite(value)) commitProperties(host, componentId, { opacity: value })
  })
}

/** 位置四格（每格一条 `change`，只提交自己那一轴）。 */
function bindPositionInputs(host: PageBackgroundInspectorHost, componentId: string): void {
  for (const input of positionInputs()) {
    input.addEventListener('change', () => {
      const axis = input.dataset.backgroundPosition as PageBackgroundPositionAxis | undefined
      const value = Number(input.valueAsNumber)
      if (!axis || !Number.isFinite(value)) return
      commitPosition(host, componentId, axis, value)
    })
  }
}

/** 属性编辑：只提交改动的字段，范围统一由字段表 / 归一化夹取。 */
function commitProperties(host: PageBackgroundInspectorHost, componentId: string, edit: Record<string, unknown>): void {
  const [key, rawValue] = Object.entries(edit)[0] ?? []
  if (!key) return
  const currentProperties = (host.component as { properties?: Record<string, unknown> })?.properties ?? {}
  const next = applyPageBackgroundEdit(currentProperties, { key, value: rawValue })
  const nextKey = key === 'source' ? 'backgroundSource' : key
  host.changeProperties(componentId, { [nextKey]: (next as Record<string, unknown>)[nextKey] })
}

/** 位置编辑：百分比 → 组件 `position` 的 px（x/y 是中心点，写回左上角）。 */
function commitPosition(
  host: PageBackgroundInspectorHost,
  componentId: string,
  axis: PageBackgroundPositionAxis,
  percent: number,
): void {
  const component = host.component as { properties?: Record<string, unknown>; position?: PageBackgroundPosition }
  const background = normalizePageBackground(component?.properties)
  const position = resolvePositionBox(component, background, host.canvas) ?? defaultCanvasBox(host.canvas)
  const nextValue = pageBackgroundPositionAxisValue(axis, percent, position, host.canvas)
  // 一次写全四格：旧文档只有百分比盒时，第一格编辑就把整盒迁到组件 `position`，
  // 否则其余三轴会退回「铺满画布」。
  host.changePosition?.(componentId, {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    [axis]: nextValue,
  })
}

function defaultCanvasBox(canvas?: { width?: number; height?: number }): PageBackgroundPosition {
  return {
    x: 0,
    y: 0,
    width: Number(canvas?.width || DEFAULT_CANVAS_WIDTH),
    height: Number(canvas?.height || DEFAULT_CANVAS_HEIGHT),
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

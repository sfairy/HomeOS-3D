/**
 * 页面背景检查器的**宿主绑定**（0.8.9 `createPageBackgroundInspector`）。
 *
 * 字段表 / 编辑合并已经在 `page-background-spec.ts`（纯函数，可断言）。这里只做三件事：
 *
 * 1. 按选中组件填充控件（预设下拉只在首次构建，之后只改 value —— 每次重建会把焦点与
 *    滚轮位置一起冲掉）；
 * 2. 绑定「来源 / 布局 / 预设 / 透明度 / 位置四格」的**改属性**事件；
 * 3. 与上游一致的一条**关键行为**：透明度拖动时先走 `previewOpacity` 做实时预览、
 *    松手（`change`）才写入文档 —— 否则每一帧都打一次 undo 快照，撤销栈会被拖满。
 *
 * 位置四格的换算口径与上游一致：**存储用百分比**（0–100），不引入画布像素中间量。
 * 早期版本按「画布 px → 百分比」换算，结果是换画布尺寸后同一个百分比会指到不同位置；
 * 百分比是相对量，天然免疫。
 */
import { PAGE_BACKGROUND_PRESETS, normalizePageBackground, type PageBackground } from '@app/shared/page-background'

import { applyPageBackgroundEdit } from './page-background-spec'

/** 检查器用到的宿主能力（显式传入，避免依赖宽类型上下文）。 */
export type PageBackgroundInspectorHost = {
  /** 当前选中的组件；不是页面背景时同步函数整体 no-op。 */
  component: unknown
  /** 改属性（走文档 + undo）。 */
  changeProperties: (componentId: string, properties: Record<string, unknown>) => void
  /** 只预览、不落文档（透明度拖动中）。 */
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
    | { id?: string; type?: string; properties?: Record<string, unknown> }
    | null
    | undefined
  const isPageBackgroundComponent = component?.type === 'page-background'
  const form = element<HTMLFormElement>('page-background-inspector')
  if (form) form.hidden = !isPageBackgroundComponent
  if (!isPageBackgroundComponent || !component?.id) return isPageBackgroundComponent

  const properties = component.properties ?? {}
  const background = normalizePageBackground(properties)
  installControls(host, component.id)

  fillContentFields(host, background)
  fillPositionFields(background)
  return true
}

/**
 * 内容区：备注 / 预设下拉 / 图片按钮 / 透明度 / 来源分段按钮。
 *
 * 拆出来是为了让 `syncPageBackgroundInspector` 只负责「这是不是页面背景」这一件事 ——
 * 两个函数各自都低于复杂度阈值，改动时也不必在 60 行里找某一格。
 */
function fillContentFields(host: PageBackgroundInspectorHost, background: PageBackground): void {
  const properties = (host.component as { properties?: Record<string, unknown> })?.properties ?? {}
  const label = element<HTMLInputElement>(FIELD_IDS.label)
  if (label) label.value = typeof properties.label === 'string' ? properties.label : ''

  const presetSelect = element<HTMLSelectElement>(FIELD_IDS.preset)
  if (presetSelect) {
    ensurePresetOptions(presetSelect)
    presetSelect.value = background.preset
  }
  const isImageSource = background.source === 'image'
  setHidden(FIELD_IDS.presetField, isImageSource)
  setHidden(FIELD_IDS.imageField, !isImageSource)
  const assetButton = element<HTMLButtonElement>(FIELD_IDS.assetButton)
  if (assetButton) {
    assetButton.textContent = (background.assetId && host.assetName?.(background.assetId)) || '选择图片'
  }
  syncPressed(element(FIELD_IDS.sources), 'backgroundSource', background.source)
  const opacity = element<HTMLInputElement>(FIELD_IDS.opacity)
  if (opacity) opacity.value = String(Math.round(clamp(background.opacity, 0, 100)))
}

/**
 * 位置区：布局分段按钮 + 四格百分比。
 *
 * `fill` 模式下四格整体隐藏且禁用 —— 藏起来但仍可 Tab 到会把焦点送到看不见的输入框。
 */
function fillPositionFields(background: PageBackground): void {
  syncPressed(element(FIELD_IDS.layouts), 'backgroundLayout', background.layoutMode)
  const isFree = background.layoutMode === 'free'
  setHidden(FIELD_IDS.position, !isFree)
  for (const input of positionInputs()) {
    input.disabled = !isFree
    const axis = input.dataset.backgroundPosition as keyof PageBackground['position'] | undefined
    if (axis) input.value = String(round1(background.position[axis]))
  }
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
    commit(host, componentId, backgroundSource ? { source: backgroundSource } : { layoutMode: backgroundLayout })
  })

  element(FIELD_IDS.assetButton)?.addEventListener('click', () => host.pickAsset?.())
  bindPresetAndOpacity(host, componentId)
  bindPositionInputs(host, componentId)
}

/** 预设下拉 + 透明度（拖动只预览、松手才落文档）。 */
function bindPresetAndOpacity(host: PageBackgroundInspectorHost, componentId: string): void {
  element<HTMLSelectElement>(FIELD_IDS.preset)?.addEventListener('change', (changeEvent) => {
    commit(host, componentId, { preset: (changeEvent.target as HTMLSelectElement).value })
  })
  const opacity = element<HTMLInputElement>(FIELD_IDS.opacity)
  if (!opacity) return
  opacity.addEventListener('input', () => {
    // 没有 live-preview 通道时**什么都不做**：拖动中每帧写一次会把撤销栈拖满，
    // 而「松手才生效」是用户能接受的最小代价。
    const value = Number(opacity.valueAsNumber)
    if (Number.isFinite(value)) host.previewOpacity?.(componentId, clamp(value, 0, 100))
  })
  // 松手才落文档：拖动过程中的每一帧都写一次会把撤销栈拖满。
  opacity.addEventListener('change', () => {
    const value = Number(opacity.valueAsNumber)
    if (Number.isFinite(value)) commit(host, componentId, { opacity: value })
  })
}

/** 位置四格（每格一条 `change`，只提交自己那一轴）。 */
function bindPositionInputs(host: PageBackgroundInspectorHost, componentId: string): void {
  for (const input of positionInputs()) {
    input.addEventListener('change', () => {
      const axis = input.dataset.backgroundPosition
      const value = Number(input.valueAsNumber)
      if (!axis || !Number.isFinite(value)) return
      commit(host, componentId, { [`position.${axis}`]: value })
    })
  }
}

/** 走同一份 `applyPageBackgroundEdit`，避免宿主与字段表各写一套范围。 */
function commit(host: PageBackgroundInspectorHost, componentId: string, edit: Record<string, unknown>): void {
  const [key, rawValue] = Object.entries(edit)[0] ?? []
  if (!key) return
  if (key.startsWith('position.')) {
    const axis = key.slice('position.'.length)
    const next = applyPageBackgroundEdit({}, { key: `position.${axis}`, value: rawValue })
    host.changeProperties(componentId, { position: { ...next.position } })
    return
  }
  const next = applyPageBackgroundEdit({}, { key, value: rawValue })
  // 只提交改动的字段。**透明度保持 0–100**：本仓文档与渲染层都按百分数存，
  // 这里若像上游那样除以 100，背景会变成几乎全透明（上游文档存的是 0–1）。
  host.changeProperties(componentId, { [key]: (next as Record<string, unknown>)[key] })
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

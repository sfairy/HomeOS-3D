/**
 * 灯带工具条的 DOM（从 `editor-light-toolbar` 拆出）。
 *
 * 外层仍是 0.8.7 的 `div.editor-light-toolbar`（`role=group`、`aria-label=灯光三维操作`），
 * 但内部按**三行**组织，而不是把九个节点平铺在一行里：
 *
 * 1. `.editor-light-toolbar-row.is-tools` —— `移动 / 旋转 / 世界轴 / 自身轴`；
 * 2. `.editor-light-toolbar-row.is-axes`  —— `旋转轴` 标签 + 三个 `button[data-light-axis]`；
 * 3. `output.editor-light-status`         —— 静止高度 / 拖动中的即时读数。
 *
 * 为什么分行：早先用一个 `flex: 0 0 100%` 的空 span 当换行占位，在 `width: max-content`
 * 的容器里它会吃掉全部可用宽度，工具条被撑到画布整宽、两侧留白。真实的行容器让根节点
 * 的宽度只由最宽那一行的内容决定。`closest('.editor-light-toolbar')` / 避让排版不受影响。
 *
 * 这里只建节点、绑最基础的点击回调，不碰状态机。
 */
import type { LightAxis } from '../interaction/editor-light-gizmo'
import { LIGHT_AXIS_LABELS } from '../interaction/editor-light-gizmo'
import { LIGHT_AXIS_COLORS } from '../interaction/editor-light-gizmo-paths'
import type { LightMode, LightSpace } from './editor-light-toolbar-types'

export interface ToolbarDom {
  root: HTMLElement
  modeButtons: Map<LightMode, HTMLButtonElement>
  spaceButtons: Map<LightSpace, HTMLButtonElement>
  axisButtons: Map<LightAxis, HTMLButtonElement>
  /** 轴按钮上的实时角度读数（0–360°，例如 `45°`）。 */
  axisValues: Map<LightAxis, HTMLSpanElement>
  status: HTMLOutputElement
  /** 「旋转轴」分组标签。 */
  axisLabel: HTMLSpanElement
}

export const AXIS_ORDER: readonly LightAxis[] = ['rotation', 'verticalRotation', 'stripRollRotation']

/** 四个工具按钮的顺序与文案（上游数组顺序，含「旋转」）。 */
const MODE_ITEMS: ReadonlyArray<readonly [LightMode, string]> = [
  ['move', '移动'],
  ['rotate', '旋转'],
]
const SPACE_ITEMS: ReadonlyArray<readonly [LightSpace, string]> = [
  ['world', '世界轴'],
  ['local', '自身轴'],
]

interface ShellCallbacks {
  onMode: (mode: LightMode) => void
  onSpace: (space: LightSpace) => void
  onAxis: (axis: LightAxis) => void
}

/** 建一个按钮（统一的 type / dataset / 点击回调）。 */
function createButton(documentNode: Document, datasetKey: string, datasetValue: string, label: string, title?: string) {
  const button = documentNode.createElement('button')
  button.type = 'button'
  button.dataset[datasetKey] = datasetValue
  button.textContent = label
  button.setAttribute('aria-pressed', 'false')
  if (title) button.title = title
  return button
}

/** 工具按钮：移动 / 旋转 / 世界轴 / 自身轴（顺序与上游一致）。 */
function createToolButtons(documentNode: Document, callbacks: ShellCallbacks) {
  const modeButtons = new Map<LightMode, HTMLButtonElement>()
  const spaceButtons = new Map<LightSpace, HTMLButtonElement>()
  const MODE_TITLES: Record<LightMode, string> = {
    move: '移动模式：拖动三根箭头平移灯具',
    rotate: '旋转模式：拖动彩色圆环调整角度',
  }
  const SPACE_TITLES: Record<LightSpace, string> = {
    world: '按世界坐标轴移动',
    local: '按灯具自身轴向移动',
  }
  for (const [mode, label] of MODE_ITEMS) {
    const button = createButton(documentNode, 'lightTool', mode, label, MODE_TITLES[mode])
    button.addEventListener('click', () => callbacks.onMode(mode))
    modeButtons.set(mode, button)
  }
  for (const [space, label] of SPACE_ITEMS) {
    const button = createButton(documentNode, 'lightTool', space, label, SPACE_TITLES[space])
    button.addEventListener('click', () => callbacks.onSpace(space))
    spaceButtons.set(space, button)
  }
  return { modeButtons, spaceButtons }
}

/** 三个旋转轴按钮（平面方向 / 安装倾斜 / 出光方向），带颜色点和角度读数。 */
function createAxisButtons(documentNode: Document, callbacks: ShellCallbacks) {
  const axisButtons = new Map<LightAxis, HTMLButtonElement>()
  const axisValues = new Map<LightAxis, HTMLSpanElement>()
  for (const axis of AXIS_ORDER) {
    const label = LIGHT_AXIS_LABELS[axis]
    const button = documentNode.createElement('button')
    button.type = 'button'
    button.dataset.lightAxis = axis
    button.style.setProperty('--light-axis-color', LIGHT_AXIS_COLORS[axis])
    button.title = `选择${label}轴（自动进入旋转模式），拖动圆环即可调整`
    button.setAttribute('aria-label', `选择${label}旋转轴`)
    button.setAttribute('aria-pressed', 'false')
    const name = documentNode.createElement('span')
    name.className = 'editor-light-toolbar-axis-name'
    name.textContent = label
    const value = documentNode.createElement('span')
    value.className = 'editor-light-toolbar-axis-value'
    button.append(name, value)
    button.addEventListener('click', () => callbacks.onAxis(axis))
    button.addEventListener('keydown', (event: KeyboardEvent) => {
      // 方向键交给全局快捷键（否则调轴时会顺带把物件挪 5cm）。
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault()
    })
    axisButtons.set(axis, button)
    axisValues.set(axis, value)
  }
  return { axisButtons, axisValues }
}

/** 一行横排容器。`width: max-content` 的根节点靠它算出真实宽度，不再靠 100% 占位撑满。 */
function createRow(documentNode: Document, className: string) {
  const row = documentNode.createElement('div')
  row.className = `editor-light-toolbar-row ${className}`
  return row
}

/** 建整套工具条 DOM 并挂到宿主上。 */
export function createToolbarDom(documentNode: Document, host: HTMLElement, callbacks: ShellCallbacks): ToolbarDom {
  const root = documentNode.createElement('div')
  root.className = 'editor-light-toolbar'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', '灯光三维操作')
  root.hidden = true
  const tools = createToolButtons(documentNode, callbacks)
  const axes = createAxisButtons(documentNode, callbacks)
  const status = documentNode.createElement('output')
  status.className = 'editor-light-status'
  status.setAttribute('aria-live', 'off')
  const axisLabel = documentNode.createElement('span')
  axisLabel.className = 'editor-light-toolbar-group-label'
  axisLabel.textContent = '旋转轴'
  const toolsRow = createRow(documentNode, 'is-tools')
  toolsRow.append(...tools.modeButtons.values(), ...tools.spaceButtons.values())
  const axesRow = createRow(documentNode, 'is-axes')
  axesRow.append(axisLabel, ...axes.axisButtons.values())
  /*
   * 三行：工具 / 旋转轴 / 状态。
   *
   * 早先用 `flex: 0 0 100%` 的「换行占位」在 `width: max-content` 的容器里会退化成
   * 「把可用宽度全吃掉」——工具条因此被撑到画布整宽，两侧留出大片空白。改成真实的行
   * 容器后，根节点的宽度由最宽那一行的内容决定，边框自然贴合内容。
   */
  root.append(toolsRow, axesRow, status)
  host.append(root)
  return {
    root,
    modeButtons: tools.modeButtons,
    spaceButtons: tools.spaceButtons,
    axisButtons: axes.axisButtons,
    axisValues: axes.axisValues,
    status,
    axisLabel,
  }
}

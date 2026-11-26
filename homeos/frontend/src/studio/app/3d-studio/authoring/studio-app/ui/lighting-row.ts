/**
 * 3D 预览的**光影模式切换行**与**单件柔光范围内联入口**（0.8.9）。
 *
 * 对应上游两段交互：
 * - `#drawing-lighting-row`：标准光影 / 轻量柔光二选一，写 `lightingMode`（+ 版本号）；
 * - `#drawing-fixture-lighting`：选中一盏灯时显示「柔光覆盖 · 自动 / 已调整」+ 一个
 *   「编辑柔光范围」按钮，点了打开光区编辑器并定位到该灯。
 *
 * 为什么单独成文件：这两块都挂在右侧属性栏，但数据源不同（一个是场景设置、
 * 一个是当前选中件 + `lightRegionOverrides`）。放在一起是因为它们**同显同隐**——
 * 只有「轻量柔光」才谈得上逐灯柔光范围。
 *
 * 关键行为：切到标准光影时必须**隐藏**逐灯入口，而不是留着按钮点了没反应。
 */

/** 光影模式。与后端 `lightingMode` 白名单同口径。 */
export type StageLightingMode = 'standard' | 'region'

/** `lightingModeVersion`：上游每次切换 +1，用于让旧组件知道要迁移。 */
export const LIGHTING_MODE_VERSION = 2

/** 覆盖表里一条分区描述（只读用到的字段）。 */
type OverrideEntry = { adjusted?: boolean } | undefined

export type FixtureLightingHost = {
  /** 当前光影模式。 */
  lightingMode: StageLightingMode
  /**
   * 整行隐藏（嵌入舞台 / 自动导图）。
   *
   * 上游 `yl.hidden = B || Me`：这两种宿主里没有「切光影」这回事 —— 舞台管线由 URL 固定，
   * 自动导图只负责截图。留着按钮只会让一次误点把一个导出中的场景整篇重建。
   */
  hideModeRow?: boolean
  /** 当前选中的物品（非灯具传 `null`）。 */
  fixture: { id?: string; type?: string } | null
  /** 是否是灯具（由目录判定，避免这里重复一份类型表）。 */
  isLamp: boolean
  /** 该灯的柔光覆盖（`lightRegionOverrides[floorId|fixtureId]`）。 */
  override?: OverrideEntry
  /** 切光影模式。 */
  setLightingMode: (mode: StageLightingMode, version: number) => void
  /** 打开光区编辑器并定位到该灯。 */
  editFixtureRange: (fixtureId: string) => void
}

const ROW_ID = 'drawing-lighting-row'
const FIXTURE_ROW_ID = 'drawing-fixture-lighting'
const STATUS_ID = 'drawing-fixture-range-status'
const EDIT_ID = 'edit-drawing-fixture-range'
const BOUND_FLAG = 'lightingRowBound'

/** 一次同步的**纯判定结果**（可脱离 DOM 断言）。 */
export type FixtureLightingView = {
  /** 光影模式行是否显示（0.8.9 起常显）。 */
  showModeRow: boolean
  /** 逐灯柔光入口是否显示。 */
  showFixtureRow: boolean
  /** 状态文案；不显示时为 `null`。 */
  statusLabel: string | null
}

/**
 * 纯判定：给定模式与选中件，算出两行该不该显示。
 *
 * 与 DOM 分离的原因：宿主里没有 `document`（单测 / SSR 预处理）时也要能验证
 * 「标准光影下逐灯入口必须消失」这条规则 —— 它错的表现是「按钮还在、点了没反应」。
 */
export function fixtureLightingView(host: FixtureLightingHost): FixtureLightingView {
  const showModeRow = host.hideModeRow !== true,
    showFixtureRow = showModeRow && host.lightingMode === 'region' && host.isLamp && Boolean(host.fixture?.id)
  return {
    showModeRow,
    showFixtureRow,
    statusLabel: showFixtureRow ? (host.override?.adjusted ? '柔光覆盖 · 已调整' : '柔光覆盖 · 自动') : null,
  }
}

/**
 * 同步两行的显隐与高亮，并（首次）绑定点击。
 *
 * 返回 `true` 表示「当前有逐灯柔光入口」——宿主据此决定是否保留属性栏那一行空间。
 */
export function syncFixtureLightingRow(host: FixtureLightingHost): boolean {
  const view = fixtureLightingView(host)
  if (typeof document === 'undefined') return view.showFixtureRow
  const modeRow = document.getElementById(ROW_ID)
  if (modeRow) {
    modeRow.hidden = !view.showModeRow
    // 上游用 `body` 上的类把「已切到柔光」传到画布（墙面/地面着色据此微调）。
    // 行被隐藏时（舞台 / 自动导图）不能带这个类：那两个宿主没有「切光影」这回事，
    // 类名却会照常改掉墙面着色，等于用一个看不见的开关改了导出结果。
    document.body.classList.toggle('is-region-lighting', view.showModeRow && host.lightingMode === 'region')
  }
  paintLightingModeButtons(host.lightingMode)

  const fixtureRow = document.getElementById(FIXTURE_ROW_ID)
  if (fixtureRow) fixtureRow.hidden = !view.showFixtureRow
  if (!view.showFixtureRow) return false

  const status = document.getElementById(STATUS_ID)
  if (status) status.textContent = view.statusLabel ?? ''
  bindOnce(host)
  return true
}

/**
 * 分段按钮：`aria-pressed` 同时驱动样式与读屏。
 *
 * 导出给 `lighting-row-install.ts` 做**乐观上屏**：切换光影要重编整套 shader
 * （实测 ~0.4s），如果等重活干完再改按钮，浏览器在这段时间里根本不会重绘 ——
 * 用户看到的是「按下去没反应，然后按钮和画面一起跳」。先在当前任务里把选中态画上，
 * 再把重活推到下一帧之后，按下即有反馈。
 */
export function paintLightingModeButtons(mode: StageLightingMode): void {
  const row = document.getElementById(ROW_ID)
  if (!row) return
  for (const button of row.querySelectorAll<HTMLButtonElement>('[data-drawing-lighting]')) {
    const pressed = button.dataset.drawingLighting === mode
    button.classList.toggle('active', pressed)
    button.setAttribute('aria-pressed', String(pressed))
  }
}

/**
 * 最近一次同步的宿主。
 *
 * 点击时读**当时**的宿主而不是绑定时闭包里的快照：宿主每次同步都会传新对象，
 * 闭包上的旧宿主会让按钮操作读到过期的选中件 / 过期模式。
 */
const bound: { host: FixtureLightingHost | null } = { host: null }

/**
 * 事件只绑一次。
 *
 * 这里**只**绑逐灯柔光入口那个按钮：光影模式的两个分段按钮由
 * `ui/lighting-row-install.ts` 负责（它还要写草稿、换管线、重建、失败回滚）。
 * 两处都绑会在同一元素上挂两个 click —— 一个空转一个真切，排查时极难看出来。
 */
function bindOnce(host: FixtureLightingHost): void {
  bound.host = host
  const editButton = document.getElementById(EDIT_ID)
  if (editButton && editButton.dataset[BOUND_FLAG] !== '1') {
    editButton.dataset[BOUND_FLAG] = '1'
    editButton.addEventListener('click', () => {
      const current = bound.host
      const fixtureId = current?.fixture?.id
      if (current && fixtureId) current.editFixtureRange(fixtureId)
    })
  }
}

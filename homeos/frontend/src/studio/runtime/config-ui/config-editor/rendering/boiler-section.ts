/**
 * 「采暖」配置段（0.8.9 取暖壁挂炉）。
 *
 * ## 为什么单独一段而不是塞进「环境设备」
 *
 * 壁挂炉在 HA 里是 `climate` 主实体，但它的**配置形态**和环境设备不同：
 * 它没有自己的 3D 卡片集合（一台户型通常只有一个采暖源），而是往
 * `environment.heatingBoilers[]` 里写一条「主实体 + 两个开关」。混进环境设备列表会让
 * 「同一层有两台壁挂炉」这种输入变成可保存的脏数据（后端只校验字段，不校验数量）。
 *
 * ## 三个字段的语义（与 `config_sections_environment.py` 的校验一一对应）
 *
 * | 字段 | 约束 | 写错的后果 |
 * | --- | --- | --- |
 * | `deviceId` | 必须是 `climate.*` | 后端 422，保存失败 |
 * | `underfloorHeating` | 布尔 | 前端 `=== true` 判定失效，盘管永远不显示（静默） |
 * | `heatingPanelStyle` | `thermostat` / `climate` | 面板渲染成空白（枚举外取值） |
 */
import { BOILER_COPY } from '../../../climate/boiler-copy'

/**
 * 本段真正用到的宿主句柄（**窄接口**）。
 *
 * 为什么不直接复用 `PanelSectionsDeps`：那是「所有分区」的并集，包含吸尘器快捷面板与
 * 批量对话框等本段完全不需要的成员；用它会让调用方（`panel-assembly`）因为少几个
 * 无关成员而类型不兼容。窄接口也让「本段依赖什么」一眼可见。
 */
/** 一条壁挂炉绑定记录（与后端 `heatingBoilers[]` 的字段一一对应）。 */
export type BoilerBinding = {
  deviceId: string
  deviceName: string
  floorId: string
  /** `thermostat` | `air-conditioner`（后端同枚举）。 */
  heatingPanelStyle: string
  /** 制热时显示本层地暖盘管（必须是布尔，写字符串会让前端 `=== true` 失效）。 */
  underfloorHeating: boolean
}

/** 只声明本段真正读写的宿主能力（不是全集，见下方注释）。 */
type BoilerEditorHost = {
  deviceKind?: string
  floorSelection?: string
  sceneMetadata?: { floors?: ReadonlyArray<{ id?: string }> } | null
  structuredClone2: { environment?: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown> }
  entities: ReadonlyArray<{ entityId?: string; name?: string }>
  errorMessageElement: { textContent: string }
  pickerGeneration: number
  pickerHandle: { close?: () => void } | null
  isDisposed: boolean
  isAccessAllowed: boolean
  pickers?: {
    entity?: (options: {
      trigger: unknown
      current: string
      deviceKind: string
      domain: string
      title: string
      onSelect: (entityId: string) => void
    }) => Promise<{ close?: () => void } | null | undefined>
  }
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createButton: (label: string, onClick: () => unknown) => HTMLButtonElement & { className?: string }
}

export type BoilerSectionDeps = {
  editorHost: BoilerEditorHost
  createConfigSection: (sectionTitle: string) => HTMLElement
  createConfigRow: (parentSectionElement: HTMLElement) => HTMLElement
  createSettingRow: (rowContainer: HTMLElement, rowLabel: string, rowControl: HTMLElement) => HTMLElement
  /** 下拉行（参数较多，按不透明回调保留）。 */
  createSelectRow: (...args: unknown[]) => unknown
  refreshEditorPreview: (markChanged?: boolean) => unknown
  /** 整面板重绘（选择实体后要刷新分段标题）。 */
  renderPanel: () => unknown
}

/** 可选的面板形态（与后端 `{thermostat, air-conditioner}` 同枚举）。 */
const PANEL_STYLES: ReadonlyArray<[string, string]> = [
  ['thermostat', BOILER_COPY.heatingPanelStyleThermostat],
  ['climate', BOILER_COPY.heatingPanelStyleClimate],
]

/**
 * 取本层的壁挂炉绑定记录（**只读**；不存在时返回 null）。
 *
 * 只在渲染时读、不在渲染时建：`buildRuntimeProperties` 会把 `structuredClone2` 整份展开，
 * 所以「打开配置面板」不该让文档变成脏的（否则用户什么都没改也会看到「有未保存修改」）。
 */
export function boilerBindingFor(
  environment: { heatingBoilers?: BoilerBinding[] } | null | undefined,
  floorId: string,
): BoilerBinding | null {
  const boilers = Array.isArray(environment?.heatingBoilers) ? environment.heatingBoilers : []
  return boilers.find((boiler) => (boiler.floorId || '') === floorId) || null
}

/**
 * 取或补建本层的壁挂炉绑定记录（**写操作**：只在用户真正改动某个字段时调用）。
 *
 * 默认值取「与后端同一口径」的那一套：温控卡 + 制热时显示盘管。
 * 默认关会让人以为功能没做，默认开才是公告「制热时可显示本层盘管」的语义。
 */
export function ensureBoilerBinding(
  environment: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown>,
  floorId: string,
): BoilerBinding {
  const existing = boilerBindingFor(environment, floorId)
  if (existing) return existing
  const created: BoilerBinding = {
    deviceId: '',
    deviceName: '',
    floorId,
    heatingPanelStyle: 'thermostat',
    underfloorHeating: true,
  }
  environment.heatingBoilers = [
    ...(Array.isArray(environment.heatingBoilers) ? environment.heatingBoilers : []),
    created,
  ]
  return created
}

/**
 * 渲染「采暖」段。
 *
 * `deps` 与其它分区共用同一套行控件工厂；这里只用 `createConfigSection` /
 * `createSettingRow` / `createSelectRow` / `refreshEditorPreview`，
 * 因此不会引入新的宿主依赖。
 */
export function renderBoilerSection(deps: BoilerSectionDeps): void {
  // 自身判定设备种类：宿主可以无条件调用，条件放在这里就不必给面板总装加分支
  // （它的圈复杂度已在棘轮基线上）。
  if (deps.editorHost.deviceKind !== 'heating-boiler') return
  const sectionElement = deps.createConfigSection('采暖')
  const { environment, floorId, boiler } = resolveBoilerContext(deps.editorHost)
  appendPrimaryEntityRow(deps, sectionElement, environment, floorId, boiler)
  appendUnderfloorToggle(deps, sectionElement, environment, floorId, boiler)
  appendPanelStyleRow(deps, sectionElement, environment, floorId, boiler)
  // 空行容器：与其它分区保持同样的底部间距（不新写 CSS）。
  deps.createConfigRow(sectionElement)
}

/** 本次渲染的上下文：环境对象 / 当前楼层 / 只读绑定快照（含默认值）。 */
function resolveBoilerContext(editorHost: BoilerEditorHost) {
  const environment = (editorHost.structuredClone2.environment ??= {}) as {
    heatingBoilers?: BoilerBinding[]
  } & Record<string, unknown>
  const floorId = String(editorHost.floorSelection || editorHost.sceneMetadata?.floors?.[0]?.id || '')
  // 渲染读**只读快照**：没有记录时用默认值显示，真正落库发生在用户改动之后。
  const boiler: BoilerBinding = boilerBindingFor(environment, floorId) || {
    deviceId: '',
    deviceName: '',
    floorId,
    heatingPanelStyle: 'thermostat',
    underfloorHeating: true,
  }
  return { environment, floorId, boiler }
}

/** 主实体行：只允许 `climate.*`（后端同口径，选错域会 422）。 */
function appendPrimaryEntityRow(
  deps: BoilerSectionDeps,
  sectionElement: HTMLElement,
  environment: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown>,
  floorId: string,
  boiler: BoilerBinding,
): void {
  const { editorHost, createSettingRow, refreshEditorPreview } = deps
  const primaryEntityButton = editorHost.createButton(
    boiler.deviceId
      ? editorHost.entities.find((catalogEntry) => catalogEntry.entityId === boiler.deviceId)?.name || boiler.deviceId
      : BOILER_COPY.pickPrimaryEntity,
    () => openPrimaryEntityPicker(deps, primaryEntityButton, environment, floorId, boiler),
  )
  primaryEntityButton.className = 'i3d-picker-button'
  createSettingRow(sectionElement, BOILER_COPY.pickPrimaryEntity, primaryEntityButton)
  sectionElement.append(editorHost.createElement('p', 'i3d-note', BOILER_COPY.primaryEntityHint))
  void refreshEditorPreview
}

/** 打开实体选择器并写回绑定（单独成函数：一次点击的完整流程不该挤在渲染里）。 */
async function openPrimaryEntityPicker(
  deps: BoilerSectionDeps,
  trigger: HTMLElement,
  environment: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown>,
  floorId: string,
  boiler: BoilerBinding,
): Promise<void> {
  const { editorHost, refreshEditorPreview } = deps
  const pickerGeneration = ++editorHost.pickerGeneration
  editorHost.errorMessageElement.textContent = ''
  try {
    if (!editorHost.pickers?.entity) throw new Error('实体选择器尚未准备好，请刷新页面。')
    editorHost.pickerHandle?.close?.()
    const pickerHandle = await editorHost.pickers.entity({
      trigger,
      current: boiler.deviceId || '',
      deviceKind: 'heating-boiler',
      // 壁挂炉在 HA 里一定是 climate 域：选错域会让后端保存直接 422。
      domain: 'climate',
      title: BOILER_COPY.pickPrimaryEntity,
      onSelect(pickedEntityId: string) {
        if (editorHost.isDisposed || !editorHost.isAccessAllowed) return
        if (pickerGeneration !== editorHost.pickerGeneration) return
        const liveBoiler = ensureBoilerBinding(environment, floorId)
        liveBoiler.deviceId = pickedEntityId || ''
        liveBoiler.deviceName =
          editorHost.entities.find((catalogEntry) => catalogEntry.entityId === pickedEntityId)?.name || ''
        refreshEditorPreview()
        deps.renderPanel()
      },
    })
    editorHost.isDisposed || !editorHost.isAccessAllowed || pickerGeneration !== editorHost.pickerGeneration
      ? pickerHandle?.close?.()
      : (editorHost.pickerHandle = pickerHandle ?? null)
  } catch (pickerFailure: unknown) {
    if (editorHost.isDisposed) return
    editorHost.errorMessageElement.textContent =
      pickerFailure instanceof Error ? pickerFailure.message : String(pickerFailure)
  }
}

/** 地暖盘管开关：写**本层**记录，与「地面分区」检查器里的楼层开关同一语义。 */
function appendUnderfloorToggle(
  deps: BoilerSectionDeps,
  sectionElement: HTMLElement,
  environment: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown>,
  floorId: string,
  boiler: BoilerBinding,
): void {
  const { editorHost, createSettingRow, refreshEditorPreview } = deps
  const underfloorCheckbox = editorHost.createElement('input')
  underfloorCheckbox.type = 'checkbox'
  underfloorCheckbox.checked = boiler.underfloorHeating !== false
  underfloorCheckbox.addEventListener('change', () => {
    ensureBoilerBinding(environment, floorId).underfloorHeating = underfloorCheckbox.checked
    refreshEditorPreview()
  })
  createSettingRow(sectionElement, BOILER_COPY.underfloorToggle, underfloorCheckbox)
}

/** 面板形态：只接受后端同枚举的两种值。 */
function appendPanelStyleRow(
  deps: BoilerSectionDeps,
  sectionElement: HTMLElement,
  environment: { heatingBoilers?: BoilerBinding[] } & Record<string, unknown>,
  floorId: string,
  boiler: BoilerBinding,
): void {
  const { createSelectRow, refreshEditorPreview } = deps
  createSelectRow(
    sectionElement,
    '面板形态',
    PANEL_STYLES,
    boiler.heatingPanelStyle || 'thermostat',
    (picked: string) => {
      const isKnown = PANEL_STYLES.some(([styleKey]) => styleKey === picked)
      ensureBoilerBinding(environment, floorId).heatingPanelStyle = isKnown ? picked : 'thermostat'
      refreshEditorPreview()
    },
  )
}

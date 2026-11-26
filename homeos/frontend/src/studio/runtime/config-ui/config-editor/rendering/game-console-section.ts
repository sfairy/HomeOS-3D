/**
 * 游戏机（Switch / PlayStation）的「主实体」分区（0.8.9 上游通用设备分支里的 `gameMain`）。
 *
 * ## 为什么主实体行取代「状态灯规则」
 *
 * 游戏机的状态灯由**主实体**回报：灰色离线/休眠、蓝色在线、绿色运行中。上游在进入这条
 * 分支时会直接 `delete item.statusRules`，避免面板与状态灯各读一份来源；这里保持同口径。
 *
 * ## 为什么抽成文件
 *
 * 这段带种类分支（PS4 与 Switch 的说明、候选过滤）的分区原来内联在面板总装函数里，
 * 让那个长函数更难读。抽出来以后总装只剩一行调用。
 */

import { gameMainEntityAllowed, isGameConsoleKind, preferredGameMainEntity } from '../../../device/game-console-state'
import { genericDeviceProfile } from '../../../device/generic-device-catalog'

/** 本段真正用到的宿主能力（窄接口）。 */
type GameConsoleEditorHost = {
  deviceKind: string
  entities: ReadonlyArray<{ entityId?: string; name?: string }>
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createButton: (label: string, onClick: () => unknown) => HTMLButtonElement
}

/** 游戏机条目：主实体与旧版状态灯规则互斥。 */
export type GameConsoleItem = {
  mainEntityId?: string
  statusRules?: unknown
}

export type GameConsoleSectionDeps = {
  editorHost: GameConsoleEditorHost
  createSettingRow: (rowContainer: HTMLElement, rowLabel: string, rowControl: HTMLElement) => unknown
}

/** 主实体选择器的标题（上游按种类分开写）。 */
function gameMainPickerTitle(deviceKind: string): string {
  return deviceKind === 'playstation' ? '选择 PS4 本地主实体' : '选择 Switch 玩家状态实体'
}

/** 主实体说明：PSN / Switch Presence 的差异只在这两句里。 */
function gameMainHint(deviceKind: string): string {
  return deviceKind === 'playstation'
    ? '选择 PS4 本地集成的 media_player。显示封面、游戏或应用名称，以及实体支持的唤醒、休眠和切换来源。PSN 可在附加功能中作为关联设备添加。'
    : '选择 Nintendo Switch Presence 的玩家状态（profile）传感器，读取头像、游戏封面、名称和累计时长。主面板只展示信息。'
}

/** 渲染主实体行与两条说明；`statusRules` 在这里就地清掉。 */
export function appendGameConsoleSection(
  deps: GameConsoleSectionDeps,
  sectionElement: HTMLElement,
  item: GameConsoleItem,
  openMainEntityPicker: (trigger: HTMLElement) => Promise<unknown> | unknown,
): void {
  const { editorHost, createSettingRow } = deps
  if (!isGameConsoleKind(editorHost.deviceKind)) return
  delete item.statusRules
  const boundEntity = editorHost.entities.find((entry) => entry.entityId === item.mainEntityId),
    mainEntityButton = editorHost.createButton(
      boundEntity?.name || item.mainEntityId || '选择游戏机主实体',
      () => void openMainEntityPicker(mainEntityButton),
    )
  mainEntityButton.className = 'i3d-picker-button'
  mainEntityButton.title = gameMainPickerTitle(editorHost.deviceKind)
  createSettingRow(sectionElement, '游戏机主实体', mainEntityButton)
  sectionElement.append(
    editorHost.createElement('p', 'i3d-note', gameMainHint(editorHost.deviceKind)),
    editorHost.createElement(
      'p',
      'i3d-note',
      '状态灯由主实体回报：灰色离线/休眠、蓝色在线、绿色运行中；数据不可用时熄灭。附加来源不改变状态灯。',
    ),
  )
}

/** 游戏机主实体选择器（整段独立：`openItemPicker` 的分支已经很多，不能再往里塞）。 */
export type GameMainPickerDeps = {
  editorHost: {
    deviceKind: string
    entities: ReadonlyArray<{ entityId?: string; name?: string }>
    pickers?: { entity?: (options: Record<string, unknown>) => Promise<{ close?: () => void } | null | undefined> }
    errorMessageElement: { textContent: string }
    pickerGeneration: number
    pickerHandle: { close?: () => void } | null
    isDisposed: boolean
    isAccessAllowed: boolean
    defaultIcon?: string
  }
  item: GameConsoleItem & { deviceId?: string; extraControls?: Array<{ entityId?: string }> }
  trigger: HTMLElement
  /** 本次选择代次（调用方已经自增过）。 */
  pickerGeneration: number
  /** 实体 → 所属设备 id（用来校验「主实体必须属于当前游戏机设备」）。 */
  deviceIdOfEntity: (entityId: string) => string
  refreshEditorPreview: () => void
  renderPanel: () => void
}

export async function openGameMainEntityPicker(deps: GameMainPickerDeps): Promise<void> {
  const { editorHost, item } = deps
  editorHost.errorMessageElement.textContent = ''
  if (!item.deviceId) {
    editorHost.errorMessageElement.textContent = '请先选择游戏机设备。'
    return
  }
  const entityPicker = editorHost.pickers?.entity
  if (!entityPicker) throw new Error('选择器尚未准备好，请保存后刷新页面。')
  const pickerHandle = await entityPicker({
    trigger: deps.trigger,
    deviceIcon: editorHost.defaultIcon,
    deviceKind: 'device-status',
    title: gameMainPickerTitle(editorHost.deviceKind),
    // 只列本设备、且域符合类型（PS4 → media_player，Switch → sensor）的实体。
    entityFilter: (candidate: { deviceId?: string; device_id?: string; entityId?: string }) =>
      (candidate.deviceId || candidate.device_id) === item.deviceId &&
      gameMainEntityAllowed(editorHost.deviceKind, candidate),
    current: item.mainEntityId || '',
    onSelect(pickedEntityId: string) {
      if (editorHost.isDisposed || !editorHost.isAccessAllowed) return
      if (deps.pickerGeneration !== editorHost.pickerGeneration) return
      if (!pickedEntityId) {
        delete item.mainEntityId
        deps.renderPanel()
        return
      }
      const pickedDeviceId = deps.deviceIdOfEntity(pickedEntityId)
      if (pickedDeviceId && pickedDeviceId !== item.deviceId) {
        editorHost.errorMessageElement.textContent = '主实体必须属于当前游戏机设备。'
        return
      }
      item.mainEntityId = pickedEntityId
      // 同一实体不能既是主实体又是附加功能（状态灯会读两份来源）。
      item.extraControls = (item.extraControls || []).filter((control) => control.entityId !== pickedEntityId)
      deps.refreshEditorPreview()
      deps.renderPanel()
    },
  })
  editorHost.isDisposed || !editorHost.isAccessAllowed || deps.pickerGeneration !== editorHost.pickerGeneration
    ? pickerHandle?.close?.()
    : (editorHost.pickerHandle = pickerHandle ?? null)
}

/** 状态灯分区：上游 `else` 分支（`statusIndicator === false` 的种类直接清掉旧规则）。 */ export type StatusSectionDeps =
  GameConsoleSectionDeps & {
    createConfigSection: (sectionTitle: string) => HTMLElement
    renderStatusRuleSection: (sectionElement: HTMLElement, item: GameConsoleItem) => unknown
  }

/**
 * 「状态灯 / 游戏机主实体」二选一：游戏机读主实体，其余按档案决定是否给状态灯规则。
 *
 * 总装只调用这一个函数（一个分支都不加），种类判定留在本文件里。
 */
export function appendStatusOrGameMainSection(
  deps: StatusSectionDeps,
  sectionElement: HTMLElement,
  item: GameConsoleItem,
  openMainEntityPicker: (trigger: HTMLElement) => Promise<unknown> | unknown,
): void {
  if (isGameConsoleKind(deps.editorHost.deviceKind)) {
    appendGameConsoleSection(deps, sectionElement, item, openMainEntityPicker)
    return
  }
  const statusIndicatorEnabled = genericDeviceProfile(deps.editorHost.deviceKind).statusIndicator !== false
  if (!statusIndicatorEnabled) {
    delete item.statusRules
    return
  }
  const statusSection = deps.createConfigSection('状态灯（可选）')
  deps.renderStatusRuleSection(statusSection, item)
}

/**
 * 绑定设备后自动挑主实体（上游 `preferredGameMainEntity` 同口径）。
 *
 * 唯一候选才自动选中；多候选留空让用户自己选。同时把它从附加功能里摘掉 ——
 * 同一实体既当主实体又当附加功能会让状态灯读两份来源。
 */
export function autoPickGameMainEntity(
  item: GameConsoleItem & { deviceId?: string; extraControls?: Array<{ entityId?: string }> },
  deviceKind: string,
  pickedEntities: ReadonlyArray<{ entityId?: string; platform?: string; attributes?: unknown }> = [],
): void {
  if (!isGameConsoleKind(deviceKind) || item.mainEntityId) return
  const autoMainEntity = preferredGameMainEntity(deviceKind, pickedEntities as never[])
  if (!autoMainEntity) return
  item.mainEntityId = autoMainEntity
  item.extraControls = (item.extraControls || []).filter((control) => control.entityId !== autoMainEntity)
}

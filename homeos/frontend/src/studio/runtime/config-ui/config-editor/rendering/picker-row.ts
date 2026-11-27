/**
 * 配置面板「列表型」下拉 → 弹窗触发器（上游 0.8.1 `v516` / `v285`）。
 *
 * 为什么改：设备 / 模型 / 类别这类列表动辄几十项，`<select>` 在 3D 舞台的窄面板里既看不清
 * 户型备注，也没法标「已配置 / 缺失 / 当前关联」。0.8.1 把它们统一换成
 * `openConfigurationPicker` 弹窗，原生 `<select>` 只留给 2-5 项的短枚举
 * （设备类型、开合方向、帘布类型、弹窗布局…），本模块的触发器与上游 `v516` 等价：
 * `<label><span>标签</span><button class="i3d-picker-button" aria-haspopup="dialog">当前值</button></label>`。
 */

import { genericDeviceProfile } from '../../../device/device'
import { mediaDeviceProfile } from '@app/bridge/presets'
import { configurationProgress, type ConfigurationProgress } from '../../configuration-progress'
import { openConfigurationPicker } from '../../configuration-picker'
import { deviceCategoryGroups, resolveDeviceCategoryProfile } from './device-category-choices'

/**
 * 环境类别：顺序、文案、图标都对齐上游 0.8.9（`environmentCategoryKinds`）。
 *
 * 0.8.9 把 0.8.8 的 7 类扩到 9 类：新增「浴霸」（`bath-heater`，与 `climate` 共用
 * `airConditioners` 模型库，只是按 `climateType` 分桶）和「取暖壁挂炉」
 * （`heating-boiler`，写 `environment.heatingBoilers`）。本仓此前两轮移植都只补了
 * 数据层 / 配置段，没把类别入口补进选择器，所以弹窗里一直只有 6 项。
 */
export const ENVIRONMENT_CATEGORY_LABELS: ReadonlyArray<readonly [string, string, string]> = [
  ['climate', '空调/浴霸', 'mdi:air-conditioner'],
  ['bath-heater', '浴霸', 'mdi:heating-coil'],
  ['heating-boiler', '取暖壁挂炉', 'mdi:water-boiler'],
  ['cover', '窗帘', 'mdi:curtains'],
  ['window-opener', '开窗器', 'mdi:window-open'],
  ['fan', '风扇 / 吊扇', 'mdi:fan'],
  ['exhaust-fan', '排气扇', 'mdi:fan'],
  ['purifier', '空气净化器', 'mdi:air-purifier'],
  ['temperature-humidity', '环境标签', 'mdi:thermometer'],
]

/** 面板/泳道里的条目与模型：只声明本模块读到的字段，避免类型退化成宽松记录。 */
interface PickerRecord {
  id?: string | number
  label?: string
  icon?: string
  name?: string
  modelId?: string
  floorId?: string
}

/** `editorHost` 在本模块用到的面（配置编辑器上下文对象）。 */
export interface PickerEditorHost {
  createElement: (tagName: string, className?: string, textContent?: string) => HTMLElement
  deviceKind: string
  /** 面板上的种类名（「开窗器」「风扇 / 吊扇」…）：模型列表与按钮文案共用。 */
  kindLabel?: string
  /** 走通用设备目录（含 NAS / 电视 / 游戏机等）。 */
  isGenericDeviceMode?: boolean
  /** 电视 / 投影仪。 */
  isMediaDeviceMode?: boolean
  /** 空调 / 浴霸 / 风扇 / 排气扇 / 净化器 / 热水器 / 壁挂炉。 */
  isClimateMode?: boolean
  isDisposed: boolean
  isAccessAllowed: boolean
  pickerGeneration: number
  pickerHandle: { close(): void } | null
  editorDialogElement: { ownerDocument: Document }
  floorSelection: string
  sceneMetadata?: {
    floors?: ReadonlyArray<Record<string, unknown>>
    environment?: Record<string, unknown>
  } | null
  structuredClone2?: {
    devices?: Record<string, unknown>
    environment?: Record<string, unknown>
    /** 灯光条目（`groupId` 是灯组归属，列表进度按它算「已配置」）。 */
    lights?: ReadonlyArray<{ floorId?: string; groupId?: string; modelId?: string }>
  } | null
  getItemList: () => ReadonlyArray<PickerRecord>
}

export interface PickerRowOptions {
  /** 行容器（`createSettingRow` 会往里 append）。 */
  rowContainer: unknown
  /** 行标签（也会写进按钮的 `aria-label`）。 */
  rowLabel: string
  /** 按钮上显示的当前值。 */
  currentLabel: string
  /** 无可选项时禁用（上游 `v911.disabled = !v910.length`）。 */
  disabled?: boolean
  /** 点击按钮；入参是按钮本身（定位/焦点恢复用）。 */
  onOpen: (triggerButton: HTMLElement) => void
}

/** 把 `editorHost` / `createSettingRow` 收进闭包，调用点只留「容器 + 标签 + 当前值 + 回调」。 */
export function bindPickerRow(
  editorHost: { createElement: PickerEditorHost['createElement'] },
  createSettingRow: (rowContainer: unknown, rowLabel: string, rowControl: unknown) => unknown,
): (options: PickerRowOptions) => unknown {
  return ({ rowContainer, rowLabel, currentLabel, disabled = false, onOpen }: PickerRowOptions) => {
    const triggerButton = editorHost.createElement('button') as HTMLButtonElement
    return (
      (triggerButton.type = 'button'),
      (triggerButton.className = 'i3d-picker-button'),
      triggerButton.setAttribute('aria-haspopup', 'dialog'),
      triggerButton.setAttribute('aria-label', rowLabel),
      (triggerButton.title = currentLabel || ''),
      (triggerButton.disabled = disabled),
      triggerButton.append(editorHost.createElement('span', '', currentLabel)),
      triggerButton.addEventListener('click', () => {
        if (triggerButton.disabled) return
        onOpen(triggerButton)
      }),
      createSettingRow(rowContainer, rowLabel, triggerButton)
    )
  }
}

/**
 * 型号 → 场景集合键（`panel-assembly` 里 `editorHost.collectionKey` 的同款映射）。
 * 用来给「设备类别 / 环境类别」每一项算配置进度：进度要按**目标类别**的模型库算，
 * 不能拿当前会话的 `collectionKey` 顶替。
 */
const DEVICE_KIND_COLLECTIONS: Readonly<Record<string, string>> = Object.freeze({
  airer: 'airers',
  speaker: 'speakers',
  'temperature-humidity': 'temperatureHumidity',
  vacuum: 'vacuums',
  'vacuum-shortcut': 'vacuums',
  nas: 'nas',
  cover: 'curtains',
  'window-opener': 'windowOpeners',
  'heating-boiler': 'heatingBoilers',
  'water-heater': 'waterHeaters',
  fan: 'fans',
  'exhaust-fan': 'exhaustFans',
  purifier: 'airPurifiers',
  // `climate` 与 0.8.9 的 `bath-heater` 共用空调模型库，靠条目的 `climateType` 分桶。
  climate: 'airConditioners',
  'bath-heater': 'airConditioners',
})

export function deviceKindCollectionKey(deviceKind: string): string {
  return (
    DEVICE_KIND_COLLECTIONS[deviceKind] ||
    genericDeviceProfile(deviceKind)?.collection ||
    mediaDeviceProfile(deviceKind)?.collection ||
    'airConditioners'
  )
}

/** 环境标签不需要选模型（上游 `requiresModel: kind !== 'temperature-humidity'`）。 */
export function deviceKindRequiresModel(deviceKind: string): boolean {
  return deviceKind !== 'temperature-humidity'
}

/** 目标类别的模型库是否落在 `scene.environment` 而不是 `scene.devices`。 */
function deviceKindUsesEnvironment(deviceKind: string): boolean {
  return [
    'climate',
    'bath-heater',
    'heating-boiler',
    'fan',
    'exhaust-fan',
    'purifier',
    'cover',
    'window-opener',
    'temperature-humidity',
  ].includes(deviceKind)
}

/**
 * `climate` / `bath-heater` 在数据上共用 `airConditioners`：本仓没有独立的浴霸 3D 卡片，
 * 浴霸是挂在空调模型上的 `climateType`（0.8.9 上游是独立模型类型 + 模型库过滤）。
 * 两个类别必须各看一半，否则同一台设备会在两个分类里各算一次。
 */
function isBathHeaterBinding(binding: unknown): boolean {
  return (binding as { climateType?: unknown } | null)?.climateType === 'bath-heater'
}

function bindingsForKind(bindings: ReadonlyArray<PickerRecord>, deviceKind: string): ReadonlyArray<PickerRecord> {
  if (deviceKind === 'climate') return bindings.filter((binding) => !isBathHeaterBinding(binding))
  if (deviceKind === 'bath-heater') return bindings.filter((binding) => isBathHeaterBinding(binding))
  return bindings
}

function asRecordList(value: unknown): ReadonlyArray<PickerRecord> {
  return Array.isArray(value) ? (value as ReadonlyArray<PickerRecord>) : []
}

/** 进度对应的楼层：选中「全部」时退回第一层（与上游 `v446` 同口径）。 */
function selectedFloorRecord(editorHost: PickerEditorHost): Record<string, unknown> | undefined {
  const floorRecords = (editorHost.sceneMetadata?.floors ?? []) as ReadonlyArray<Record<string, unknown>>,
    floorSelection = editorHost.floorSelection
  return floorSelection && floorSelection !== 'all'
    ? floorRecords.find((floorRecord) => floorRecord.id === floorSelection)
    : floorRecords[0]
}

/** 本层该类别可用的模型库（`climate` / `bath-heater` 共用空调模型库）。 */
function progressModels(
  editorHost: PickerEditorHost,
  deviceKind: string,
  targetFloor: Record<string, unknown> | undefined,
  collectionKey: string,
): ReadonlyArray<PickerRecord> {
  if (!targetFloor) return []
  const environmentSide =
      deviceKindUsesEnvironment(deviceKind) || collectionKey === 'airConditioners'
        ? editorHost.sceneMetadata?.environment
        : undefined,
    planSide = targetFloor.plan as Record<string, unknown> | undefined
  return asRecordList(targetFloor[collectionKey] ?? environmentSide?.[collectionKey] ?? planSide?.[collectionKey])
}

/** 本类别已配置条目：按草稿集合分桶，壁挂炉再按本层过滤。 */
function progressBindings(
  editorHost: PickerEditorHost,
  deviceKind: string,
  targetFloor: Record<string, unknown> | undefined,
  collectionKey: string,
): ReadonlyArray<PickerRecord> {
  const configurationDraft = editorHost.structuredClone2,
    draftBindings = configurationDraft?.environment?.[collectionKey] ?? configurationDraft?.devices?.[collectionKey],
    rawBindings = draftBindings
      ? asRecordList(draftBindings)
      : editorHost.deviceKind === deviceKind
        ? editorHost.getItemList()
        : []
  return bindingsForKind(rawBindings, deviceKind).filter(
    (binding) => deviceKind !== 'heating-boiler' || binding?.floorId === targetFloor?.id,
  )
}

/**
 * 目标类别的配置进度（上游 `v446`）：模型库取当前楼层的对应集合，
 * 已配置取**该类别在草稿里的集合**。灯组 / 环境标签按「已配置数」统计。
 */
export function kindConfigurationProgress(editorHost: PickerEditorHost, deviceKind: string): ConfigurationProgress {
  const targetFloor = selectedFloorRecord(editorHost),
    // 壁挂炉没有「模型 → 卡片」的集合（本仓走采暖段单条绑定），不显示模型计数。
    requiresModel = deviceKindRequiresModel(deviceKind) && deviceKind !== 'heating-boiler',
    collectionKey = deviceKindCollectionKey(deviceKind)
  return configurationProgress({
    ready: Boolean(targetFloor),
    requiresModel,
    models: requiresModel ? progressModels(editorHost, deviceKind, targetFloor, collectionKey) : [],
    bindings: progressBindings(editorHost, deviceKind, targetFloor, collectionKey),
    modelKey: (model) => model?.id,
    bindingKey: (binding) => (binding?.floorId === targetFloor?.id && requiresModel ? binding?.modelId : ''),
  })
}

/** 浴霸类别没有可用模型时的指引（上游 `v386` 的 `hint`）。 */
function categoryHint(deviceKind: string, progress: ConfigurationProgress): string {
  return deviceKind === 'bath-heater' && progress.disabled ? '请先在本层添加浴霸模型' : ''
}

/**
 * 设备类别 / 环境类别选择器（上游 `v386`）。每一项带该类别在当前楼层的配置进度，
 * 没有模型也没有条目的类别直接禁用，避免点进空配置。
 */
export function openDeviceCategoryPicker(
  editorHost: PickerEditorHost,
  {
    environmentCategory,
    onPicked,
  }: {
    environmentCategory: boolean
    onPicked: (deviceKind: string) => void
  },
): void {
  const categorySections = environmentCategory
      ? [
          {
            label: undefined,
            options: ENVIRONMENT_CATEGORY_LABELS.map(([kind, label, icon]) => ({ kind, label, icon })),
          },
        ]
      : deviceCategoryGroups().map(([groupLabel, groupKinds]) => ({
          label: groupLabel,
          options: groupKinds.map((kind) => {
            const categoryProfile = resolveDeviceCategoryProfile(kind)
            return { kind, label: categoryProfile.label, icon: categoryProfile.icon }
          }),
        })),
    pickerGeneration = ++editorHost.pickerGeneration
  editorHost.pickerHandle?.close()
  const pickerHandle = openConfigurationPicker({
    document: editorHost.editorDialogElement.ownerDocument,
    title: environmentCategory ? '选择环境类别' : '选择设备类别',
    kicker: environmentCategory ? 'ENVIRONMENT CATEGORY' : 'DEVICE CATEGORY',
    unit: '模型',
    // 上游 `v386`：类别页要说明「已配置/未配置」的含义，否则用户不知道点进去会怎样。
    description:
      '当前楼层：' +
      (String(
        ((editorHost.sceneMetadata?.floors || []) as ReadonlyArray<Record<string, unknown>>).find(
          (floorProbe) => floorProbe.id === editorHost.floorSelection,
        )?.name ?? '',
      ).trim() || '未知楼层') +
      '。已配置表示已添加到 3D 交互，未配置表示尚未添加。',
    selectedId: editorHost.deviceKind,
    emptyMessage: '当前楼层没有可选类别。',
    sections: categorySections.map((categorySection) => ({
      label: categorySection.label,
      options: categorySection.options.map((categoryChoice) => {
        const categoryProgress = kindConfigurationProgress(editorHost, categoryChoice.kind)
        return {
          id: categoryChoice.kind,
          label: categoryChoice.label,
          icon: categoryChoice.icon,
          wrapLabel: true,
          progress: categoryProgress,
          disabled: categoryProgress.disabled,
          // 上游 `v386`：浴霸类别没有可用模型时给出「先加浴霸模型」的指引。
          hint: categoryHint(categoryChoice.kind, categoryProgress),
        }
      }),
    })),
    async onSelect(pickedDeviceCategory: string) {
      if (editorHost.isDisposed || !editorHost.isAccessAllowed || pickerGeneration !== editorHost.pickerGeneration)
        throw new Error('该配置已变更，请重新选择。')
      pickedDeviceCategory !== editorHost.deviceKind && onPicked(pickedDeviceCategory)
    },
    onClose() {
      editorHost.pickerHandle === pickerHandle && (editorHost.pickerHandle = null)
    },
  })
  editorHost.isDisposed || !editorHost.isAccessAllowed || pickerGeneration !== editorHost.pickerGeneration
    ? pickerHandle.close()
    : (editorHost.pickerHandle = pickerHandle)
}

/**
 * 配置面板「列表」区的配置进度行（0.8.8 灯光列表口径，推广到其它类别）。
 *
 * 上游只在灯光列表里常驻「灯组 N · 已配置 X · 未配置 Y」；其它类别（模型列表、
 * 环境标签、扫地机快捷指令、安防卡片）此前只有「点进选择器」才看得到进度，
 * 面板上看不出本层还剩多少没配。这里把同一份口径抬到列表头上：
 *
 *   - 灯光：楼层灯组是总量，草稿里本层灯的 `groupId` 是已配置（与 0.8.8 完全一致）；
 *   - 其余按模型配置的类别：直接复用类别弹窗的 `kindConfigurationProgress`，
 *     保证「面板上的数字」与「类别弹窗里的数字」永远是同一个；
 *   - 环境标签 / 扫地机快捷指令没有模型库，只数本层已配置条目。
 *
 * 数字配色与分隔符沿用 `configurationSummary`（已配置 = 绿、未配置 = 强调色、
 * 缺失 = 告警色、零值压暗），样式落在 `runtime.css` 的 `.i3d-configuration-*`。
 */

import { domElement } from '@app/shared/util/dom-factory'
import { configurationProgress, type ConfigurationProgress } from './configuration-progress'
import { configurationSummary } from './configuration-picker'
import { kindConfigurationProgress, type PickerEditorHost } from './config-editor/rendering/picker-row'

/** 不按模型库统计、只数已配置条目的类别。 */
const FLAT_COUNT_DEVICE_KINDS: ReadonlySet<string> = new Set(['temperature-humidity', 'vacuum-shortcut'])

/** 进度行前缀文案：灯光说「灯组」，其余按模型配置的类别说「模型」。 */
function progressUnit(deviceKind: string): string {
  if (deviceKind === 'light') return '灯组'
  if (deviceKind === 'temperature-humidity') return '环境标签'
  if (deviceKind === 'vacuum-shortcut') return '快捷指令'
  return '模型'
}

/** 空列表时的建组 / 建模指引（只有灯光与 0.8.8 的文案对齐）。 */
function progressEmptyHint(deviceKind: string): string {
  return deviceKind === 'light' ? '请先在户型图中创建灯组。' : ''
}

/** 灯光：本层灯组为总量，草稿里本层灯的 `groupId` 为已配置。 */
function lightGroupProgress(host: PickerEditorHost): ConfigurationProgress {
  const floorRecord = host.sceneMetadata?.floors?.find((floorProbe) => floorProbe.id === host.floorSelection),
    lightGroupModels = (floorRecord?.groups as ReadonlyArray<{ id?: string }> | undefined) || []
  return configurationProgress({
    ready: Boolean(floorRecord),
    models: lightGroupModels,
    bindings: host.structuredClone2?.lights || [],
    // 别的楼层的灯不算本层「已配置」，回空串让进度只统计当前楼层。
    bindingKey: (lightBinding: { floorId?: string; groupId?: string }) =>
      lightBinding.floorId === host.floorSelection ? lightBinding.groupId : '',
  })
}

/** 当前面板列表的配置进度（灯光 / 模型 / 纯计数三类口径）。 */
export function configListProgress(host: PickerEditorHost): ConfigurationProgress {
  if (host.deviceKind === 'light') return lightGroupProgress(host)
  if (FLAT_COUNT_DEVICE_KINDS.has(host.deviceKind)) {
    const listItems = host.getItemList() || []
    return configurationProgress({
      ready: Boolean(host.sceneMetadata),
      requiresModel: false,
      // 环境标签带 `floorId`，只数本层；快捷指令属于已选定的那台扫地机（无 `floorId`），全数计入。
      bindings:
        host.deviceKind === 'vacuum-shortcut'
          ? listItems
          : listItems.filter((itemProbe: { floorId?: string }) => itemProbe.floorId === host.floorSelection),
    })
  }
  return kindConfigurationProgress(host, host.deviceKind)
}

/**
 * 把进度行挂到列表容器上。`container` 一定是列表所在的 section：`.i3d-compact-list`
 * 与 `.i3d-security-model-list` 都是双列网格，样式里已让计数行独占一行。
 */
export function appendConfigurationCounts(
  container: Element,
  progress: ConfigurationProgress,
  {
    document: ownerDocument,
    unit = '模型',
    emptyHint = '',
  }: {
    document: Document
    unit?: string
    /** 列表彻底为空时的指引；仅在 `progress.disabled` 时显示。 */
    emptyHint?: string
  },
): void {
  container.append(configurationSummary(progress, { document: ownerDocument, unit }))
  emptyHint && progress.disabled && container.append(domElement(ownerDocument, 'p', 'i3d-note', emptyHint))
}

/** 面板列表头一行搞定：算进度 + 按类别取文案 + 挂上去。 */
export function appendConfigListSummary(host: PickerEditorHost, container: Element): void {
  appendConfigurationCounts(container, configListProgress(host), {
    document: host.editorDialogElement.ownerDocument,
    unit: progressUnit(host.deviceKind),
    emptyHint: progressEmptyHint(host.deviceKind),
  })
}

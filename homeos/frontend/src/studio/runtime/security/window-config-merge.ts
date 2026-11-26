/**
 * 推拉窗「整组配置」合并弹窗（0.8.9 `security-editor.js` 的 `选择整组使用的配置`）。
 *
 * ## 为什么需要它
 *
 * 0.8.2 的窗磁 / 开窗器配置是**按扇**存的（`window:<窗>:<面板>`），0.8.4 起推拉组改成
 * **整组一条**（`window:<窗>:<组>`）。老户型升级后，同一组推拉窗会同时存在组配置和若干
 * 扇配置 —— 面板里会看到重复条目，删掉哪一条都会丢一部分绑定（窗磁 / 电量 / 标签）。
 *
 * 这里按上游做法给一次「合并」机会：从重复项里挑一条保留，其余移除，并把保留那条的
 * `modelId` 归一到整组 id。
 *
 * ## 触发条件（与上游同口径）
 *
 * 只有当这条窗扇模型的 `legacyModels` 非空、**且**本层确实存在 >1 条解析到同一组的配置时
 * 才弹。数据干净时它不会出现，所以这是纯迁移路径。
 */

import { openConfigurationPicker, type ConfigurationChoice } from '../config-ui/configuration-picker'

/** 一条窗户安防配置（只声明本段读到的字段）。 */
export type WindowSecurityConfig = {
  id: string
  modelId?: string
  floorId?: string
  label?: string
  doorEntityId?: string
  batteryEntityId?: string
  [key: string]: unknown
}

/** 窗扇模型（只声明本段读到的字段）。 */
export type WindowModelEntry = {
  modelId?: string
  id?: string
  name?: string
  legacyModels?: ReadonlyArray<{ modelId?: string; id?: string }>
}

/** 同一条窗模型可接受的身份集合（整组 id + 旧扇 id）。 */
export function windowModelIdSet(windowModel: WindowModelEntry | null | undefined): Set<string> {
  const ids = new Set<string>()
  const groupId = String(windowModel?.modelId || windowModel?.id || '')
  groupId && ids.add(groupId)
  for (const legacyModel of windowModel?.legacyModels || []) {
    const legacyId = String(legacyModel?.modelId || legacyModel?.id || '')
    legacyId && ids.add(legacyId)
  }
  return ids
}

/** 本层解析到同一组推拉窗的全部配置（>1 条即有重复需要合并）。 */
export function duplicateWindowConfigs(
  windows: ReadonlyArray<WindowSecurityConfig>,
  floorId: string,
  windowModel: WindowModelEntry | null | undefined,
): WindowSecurityConfig[] {
  const ids = windowModelIdSet(windowModel)
  return ids.size
    ? windows.filter(
        (windowConfig) => (windowConfig.floorId || '') === floorId && ids.has(String(windowConfig.modelId || '')),
      )
    : []
}

/** 选项明细行：`窗磁：<实体或未绑定>；电量：<实体或未绑定>`。 */
function configDetail(windowConfig: WindowSecurityConfig): string {
  return '窗磁：' + (windowConfig.doorEntityId || '未绑定') + '；电量：' + (windowConfig.batteryEntityId || '未绑定')
}

export type WindowConfigMergeOptions = {
  document: Document
  /** 本层全部窗户配置（合并会从这里移除未保留的项）。 */
  windows: WindowSecurityConfig[]
  floorId: string
  windowModel: WindowModelEntry
  /** 合并完成：`kept` 是被保留并已归一 `modelId` 的那条。 */
  onMerged: (kept: WindowSecurityConfig) => void
  /** 弹窗关闭（含取消）。 */
  onClose?: () => void
}

/**
 * 打开「选择整组使用的配置」。返回弹窗句柄；没有重复项时返回 `null`（不弹）。
 */
export function openWindowConfigMergeDialog({
  document,
  windows,
  floorId,
  windowModel,
  onMerged,
  onClose,
}: WindowConfigMergeOptions) {
  const duplicates = duplicateWindowConfigs(windows, floorId, windowModel)
  if (duplicates.length < 2) return null
  const snapshot = JSON.stringify(duplicates),
    choices: ConfigurationChoice[] = duplicates.map((windowConfig) => ({
      id: windowConfig.id,
      label: windowConfig.label || '窗户配置',
      wrapLabel: true,
      detail: configDetail(windowConfig),
    }))
  let isMerging = false
  return openConfigurationPicker({
    document,
    title: '选择整组使用的配置',
    kicker: 'SLIDING WINDOW',
    description:
      '这组推拉窗现有 ' +
      duplicates.length +
      ' 份配置。选择要保留的窗磁、电量和标签设置后，合并为一条整组配置；其他重复项将移除。点击“保存配置”后应用，也可以关闭本窗口取消。',
    sections: [{ options: choices }],
    async onSelect(keptConfigId: string) {
      if (isMerging) return
      isMerging = true
      try {
        // 弹窗打开期间数据变了（另开窗口删了配置 / 改了窗型）：让用户重来，不要按旧快照合并。
        if (JSON.stringify(duplicateWindowConfigs(windows, floorId, windowModel)) !== snapshot)
          throw new Error('窗户配置已变化，请关闭后重新选择。')
        const keptConfig = duplicates.find((windowConfig) => windowConfig.id === keptConfigId)
        if (!keptConfig) throw new Error('窗户配置已变化，请关闭后重新选择。')
        const groupModelId = String(windowModel.modelId || windowModel.id || ''),
          removedIds = new Set(duplicates.filter((windowConfig) => windowConfig !== keptConfig).map(({ id }) => id))
        keptConfig.modelId = groupModelId
        // 就地替换数组内容：调用方持有的是同一份 `security.windows` 引用。
        windows.splice(0, windows.length, ...windows.filter((windowConfig) => !removedIds.has(windowConfig.id)))
        onMerged(keptConfig)
      } finally {
        isMerging = false
      }
    },
    onClose,
  })
}

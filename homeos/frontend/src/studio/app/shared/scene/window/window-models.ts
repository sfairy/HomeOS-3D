/**
 * 窗扇「模型」列表（0.8.4）：给开窗器 / 窗磁的选择器提供可选窗扇。
 *
 * 一扇自定义窗可能同时是：
 * - 一个推拉组（整组一起滑）→ **一条**模型，身份是组 id；
 * - 若干个平开 / 上悬 / 下悬窗格 → 每格一条模型；
 * - 固定扇 → 不产生模型（选了也动不了）。
 *
 * 推拉组只暴露组模型：`panelIds` 是几何分片，不是可绑定的身份。按扇各存一条配置是
 * 0.8.2 的旧做法（整组滑动却只有一个面板会动），新系统从场景树现算的绑定一律落在组 id 上。
 *
 * `x` / `y` 是**平面图坐标**（厘米），`height` 是窗格中心离地高度（米），
 * 用于在 3D 配置面板里把控件摆到对应窗格上。
 */

import { normalizeModelRemark } from '@app/shared/model-remarks'

import { entries, isCustomWindow, type WindowLeaf, type WindowRecord } from './layout'

/** 窗扇的模型身份：两段都做 URL 转义，和后端 `window_model_id` 完全一致。 */
export const windowModelId = (windowId: unknown, sashId: unknown): string =>
  'window:' + encodeURIComponent(String(windowId)) + ':' + encodeURIComponent(String(sashId))

/** 一条窗侧绑定（开窗器 / 安防窗磁共用的最小形状）。 */
type WindowBindingRecord = {
  floorId?: string
  modelId?: string
  /** 开窗器侧的主实体。 */
  entityId?: string
  /** 安防窗磁侧的检测实体。 */
  doorEntityId?: string
}

/** 一份配置里可能出现窗侧绑定的两个位置。 */
type WindowBindingProperties =
  | {
      environment?: { windowOpeners?: ReadonlyArray<WindowBindingRecord> }
      security?: { windows?: ReadonlyArray<WindowBindingRecord> }
    }
  | null
  | undefined

/** 这条窗扇模型可接受的身份集合：整组 id + 0.8.2 的旧扇 id。 */
export function windowModelIdSet(windowModel: {
  modelId?: string
  id?: string
  legacyModels?: ReadonlyArray<{ modelId?: string; id?: string }>
}): Set<string> {
  const ids = new Set<string>()
  const groupId = String(windowModel.modelId || windowModel.id || '')
  groupId && ids.add(groupId)
  for (const legacyModel of windowModel.legacyModels || []) {
    const legacyId = String(legacyModel?.modelId || legacyModel?.id || '')
    legacyId && ids.add(legacyId)
  }
  return ids
}

/** 该设备种类**对面**那侧的绑定列表：开窗器看安防窗磁，窗磁看开窗器。 */
function oppositeSideBindings(
  properties: WindowBindingProperties,
  deviceKind: string,
): ReadonlyArray<WindowBindingRecord> {
  return deviceKind === 'window-opener'
    ? properties?.security?.windows || []
    : properties?.environment?.windowOpeners || []
}

/** 一条绑定是否「已经占了这扇窗」：本层 + 同一身份 + 那一侧确实绑了实体。 */
function bindingOccupiesWindow(
  binding: WindowBindingRecord,
  floorId: string,
  modelIdSet: Set<string>,
  /**
   * 对面那侧绑的是哪个字段：开窗器用 `entityId`，安防窗磁用 `doorEntityId`。
   * 传「当前侧」时这里要反过来取 —— 当前是开窗器，对面就是窗磁。
   */
  oppositeIsOpener: boolean,
): boolean {
  const boundEntity = oppositeIsOpener ? binding.entityId : binding.doorEntityId
  return binding.floorId === floorId && !!boundEntity && modelIdSet.has(String(binding.modelId || ''))
}

/**
 * 这条窗扇模型在**另一侧**已经配了什么（0.8.9 `windowBindingHint`）。
 *
 * 同一扇窗可能在**安防**里配了窗磁、又在**环境**里配了开窗器；选择器必须提示「对面配过了」，
 * 否则用户会在这里再选一次，得到两条抢同一扇窗的配置。
 *
 * - `window-opener` 侧 → `已配安防窗户传感器`；
 * - `window`（安防窗磁）侧 → `已配开窗器`。
 */
export function windowBindingHint(
  windowModel: Parameters<typeof windowModelIdSet>[0] | null,
  floorId: string,
  deviceKind: string,
  properties: WindowBindingProperties,
): string {
  if (!windowModel || !['window-opener', 'window'].includes(deviceKind)) return ''
  const isOpenerKind = deviceKind === 'window-opener',
    modelIdSet = windowModelIdSet(windowModel)
  // 对面那侧是不是开窗器：当前是窗磁时对面才是开窗器。
  const oppositeIsOpener = !isOpenerKind
  const hasOppositeSideBinding = oppositeSideBindings(properties, deviceKind).some((binding) =>
    bindingOccupiesWindow(binding, floorId, modelIdSet, oppositeIsOpener),
  )
  if (!hasOppositeSideBinding) return ''
  return isOpenerKind ? '已配安防窗户传感器' : '已配开窗器'
}

/** 列出一层楼里所有可绑定的窗扇。 */
export function windowModels(floor: any): any[] {
  if (!floor?.scene)
    return (floor?.windowSashes || []).map((sash: any) => ({ ...sash, modelId: sash.modelId || sash.id }))

  const scene = floor.scene
  const pixelsPerMeter = scene.calibration?.pixelsPerMeter || 100
  return (scene.windows || []).flatMap((window: WindowRecord, windowIndex: number) => {
    const wall = scene.walls?.find((candidate: any) => candidate.id === window.wallId)
    if (!wall || !isCustomWindow(window)) return []
    const deltaX = wall.end.x - wall.start.x
    const deltaY = wall.end.y - wall.start.y
    const wallLength = Math.hypot(deltaX, deltaY)
    if (!wallLength) return []
    const wallDirection = window.windowDesign?.wallDirection ?? 1
    return entries(window)
      .filter((entry) => !entry.node.children)
      .flatMap((entry, entryIndex) => {
        const node = entry.node
        if ((node as WindowLeaf).kind === 'fixed') return []
        const buildModel = (sashId: string, positionRatio: number, suffix: string, remark: unknown) => {
          // 窗格中心到整窗中心的偏移（厘米），再沿墙方向投影出平面坐标。
          const offset = (entry.x + entry.width * positionRatio - window.width / 2) * pixelsPerMeter * wallDirection
          const baseName = normalizeModelRemark(window.remark) || '窗户 ' + (windowIndex + 1)
          return {
            id: windowModelId(window.id, sashId),
            modelId: windowModelId(window.id, sashId),
            windowId: window.id,
            sashId,
            name: baseName + ' · 窗格 ' + (entryIndex + 1) + suffix,
            remark: normalizeModelRemark(remark),
            kind: (node as WindowLeaf).kind,
            x: wall.start.x + deltaX * (window.t ?? 0) + (offset * deltaX) / wallLength,
            y: wall.start.y + deltaY * (window.t ?? 0) + (offset * deltaY) / wallLength,
            height: (window.sill || 0) + window.height - entry.y - entry.height / 2,
          }
        }
        const leaf = node as WindowLeaf,
          // 推拉组只暴露组模型，但要带上它的**扇身份**（`panelIds`）—— 0.8.2 的旧配置是按扇
          // 各存一条，`legacyModels` 让「迁移 / 合并」这类逻辑能认出那些旧 modelId。
          groupModel: {
            legacyModels?: Array<ReturnType<typeof buildModel>>
          } & ReturnType<typeof buildModel> = buildModel(
            leaf.id,
            0.5,
            leaf.kind === 'sliding' ? ' 推拉窗组' : '',
            (window.windowDesign?.sashRemarks || {})[leaf.id],
          )
        if (leaf.kind === 'sliding' && Array.isArray(leaf.panelIds) && leaf.panelIds.length > 1)
          groupModel.legacyModels = leaf.panelIds.map((panelId: string, panelIndex: number) =>
            buildModel(
              panelId,
              (panelIndex + 0.5) / leaf.panelIds.length,
              ' 第 ' + (panelIndex + 1) + ' 扇',
              (window.windowDesign?.sashRemarks || {})[panelId],
            ),
          )
        return [groupModel]
      })
  })
}

import {
  climateIsPoweredOn as climateIsPoweredOn2,
  resolveClimateDeviceType as resolveClimateDeviceType2,
} from '@app/shared/device/climate'

const onOffDomainSet = new Set(['light', 'switch', 'input_boolean', 'fan', 'humidifier', 'siren']),
  runningStateDomainSet = new Set(['climate', 'water_heater'])

/**
 * 开合类设备（窗帘 / 车库门 / 开窗器 / 晾衣架）的状态集合（0.8.9）。
 *
 * 口径：**未完全关闭计入数量**。因此 `opening` / `closing` 也算「开」——
 * 用户问「几扇窗开着」，正在关的那扇还没关完，算开着更符合直觉。
 */
const COVER_ON_STATES = new Set(['open', 'opening', 'closing', 'opened'])
const COVER_OFF_STATES = new Set(['closed', 'off'])

/** HA 属性表：只读、形状不可信，按 `unknown` 收进来再逐字段窄化。 */
type AttributesLike = Record<string, unknown>

function readCoverPosition(attributes: AttributesLike | null | undefined): number | null {
  const rawPosition = attributes?.current_position ?? attributes?.currentPosition
  if (rawPosition === null || rawPosition === undefined || rawPosition === '') return null
  const parsed = Number(rawPosition)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 开合设备的开关判定。
 *
 * 状态字符串优先（HA 的 cover 一定给 `open`/`closed`），只有在状态不可用时才回落到
 * `current_position`。`assumed_state` 是 HA 用来标记「这个状态是推测的」——
 * 推测态仍然可用，不因此判成异常（否则无位置回传的设备会永远统计不出来）。
 */
function coverStateStatus(
  normalizedState: string,
  attributes: AttributesLike | null | undefined,
): 'on' | 'off' | 'abnormal' {
  if (COVER_ON_STATES.has(normalizedState)) return 'on'
  if (COVER_OFF_STATES.has(normalizedState)) return 'off'
  const position = readCoverPosition(attributes)
  if (position !== null) return position > 0 ? 'on' : 'off'
  return 'abnormal'
}

function resolveEntityDomain(entityRef: any) {
  const resolvedEntityId =
    typeof entityRef == 'string' ? entityRef : String(entityRef?.entityId || entityRef?.entity_id || '')
  return (
    String(typeof entityRef == 'string' ? '' : entityRef?.domain || '')
      .trim()
      .toLowerCase() || resolvedEntityId.split('.', 1)[0].toLowerCase()
  )
}
function isBluetoothOnlineStatusSensor(sensorEntityRef: any) {
  const sensorEntityId =
    typeof sensorEntityRef == 'string'
      ? sensorEntityRef
      : String(sensorEntityRef?.entityId || sensorEntityRef?.entity_id || '')
  return (
    resolveEntityDomain(sensorEntityRef) === 'sensor' &&
    /(?:^|_)bt_online_status(?:_p_\d+_\d+)?(?:_\d+)?$/i.test(sensorEntityId.split('.').slice(1).join('.'))
  )
}
export function lightStatisticsEntitySupport(supportEntity: any) {
  const entityDomain = resolveEntityDomain(supportEntity)
  return entityDomain === 'virtual' || supportEntity?.virtual
    ? {
        supported: true,
        message: '虚拟实体按当前显示状态统计。',
      }
    : entityDomain === 'group'
      ? {
          supported: true,
          message: '群组将作为 1 个实体统计。',
        }
      : onOffDomainSet.has(entityDomain)
        ? {
            supported: true,
            message: '按开启/关闭状态统计。',
          }
        : entityDomain === 'cover'
          ? {
              supported: true,
              message: '按开合状态统计，未完全关闭计入数量。',
            }
          : runningStateDomainSet.has(entityDomain)
            ? {
                supported: true,
                message: '按关闭/运行状态统计。',
              }
            : isBluetoothOnlineStatusSensor(supportEntity)
              ? {
                  supported: true,
                  message: '按在线/离线状态统计，在线计入数量。',
                }
              : {
                  supported: false,
                  message: '该实体没有明确的开启/关闭状态。',
                }
}
/** 控件/实体标识的最小形状（只读这几个键，其余交给 climate 判定函数）。 */
type EntityLike =
  | string
  | null
  | undefined
  | { entityId?: unknown; entity_id?: unknown; name?: unknown; originalName?: unknown }

/** 控件引用 → 实体 id（字符串直接用，否则读 `entityId` / `entity_id`）。 */
function entityIdOf(statusEntity: EntityLike): string {
  if (typeof statusEntity === 'string') return statusEntity
  return String(statusEntity?.entityId || statusEntity?.entity_id || '')
}

/** 控件引用 → 展示名（用于 climate 形态判定里按名称匹配「浴霸」这类规则）。 */
function entityLabelOf(statusEntity: EntityLike): unknown {
  if (typeof statusEntity !== 'object' || statusEntity === null) return ''
  return statusEntity.name || statusEntity.originalName || ''
}

/** 浴霸按 climate 能力判定（0.7.9 F5）：吹风、换气等非 on 状态也算开启。 */
function bathHeaterStatus(
  statusEntity: EntityLike,
  normalizedState: string,
  stateSource: { attributes?: Record<string, unknown> } | null | undefined,
): 'on' | 'off' | null {
  const climateStateSnapshot = { state: normalizedState, attributes: stateSource?.attributes || {} }
  const climateDeviceComponent = { properties: { label: entityLabelOf(statusEntity) } }
  const deviceType = resolveClimateDeviceType2(climateDeviceComponent, climateStateSnapshot, entityIdOf(statusEntity))
  if (deviceType !== 'bath-heater') return null
  return climateIsPoweredOn2(climateStateSnapshot, 'bath-heater') ? 'on' : 'off'
}

/** 蓝牙在线状态传感器的中文/英文状态 → on/off（其它一律 abnormal）。 */
function bluetoothStatus(normalizedState: string): 'on' | 'off' | 'abnormal' {
  const sensorState = normalizedState.replace(/^设备\s*\d+\s*-\s*/, '')
  if (['在线', 'online', 'on'].includes(sensorState)) return 'on'
  if (['离线', 'offline', 'off'].includes(sensorState)) return 'off'
  return 'abnormal'
}

export function lightStatisticsEntityStateStatus(statusEntity: any, stateSource: any) {
  if (!lightStatisticsEntitySupport(statusEntity).supported) return 'abnormal'
  const statusEntityDomain = resolveEntityDomain(statusEntity),
    normalizedState = String(stateSource?.state ?? stateSource ?? '')
      .trim()
      .toLowerCase()
  if (!normalizedState || ['unknown', 'unavailable'].includes(normalizedState)) return 'abnormal'
  // 开合类设备（0.8.9）：`opening`/`closing` 也算开，`current_position` 作为兜底。
  if (statusEntityDomain === 'cover')
    return coverStateStatus(normalizedState, stateSource?.attributes as AttributesLike | undefined)
  if (statusEntityDomain === 'climate' || statusEntityDomain === 'fan') {
    const heaterStatus = bathHeaterStatus(statusEntity, normalizedState, stateSource)
    if (heaterStatus) return heaterStatus
  }
  if (isBluetoothOnlineStatusSensor(statusEntity)) return bluetoothStatus(normalizedState)
  if (normalizedState === 'off') return 'off'
  if (normalizedState === 'on' || runningStateDomainSet.has(statusEntityDomain)) return 'on'
  return 'abnormal'
}

function readLookupEntry(lookupStore: any, lookupKey: any) {
  return typeof lookupStore?.get == 'function'
    ? lookupStore.get(lookupKey) || null
    : (lookupStore && typeof lookupStore == 'object' && lookupStore[lookupKey]) || null
}
function readEntityState(stateStore: any, stateKey: any) {
  const rawStateEntry = typeof stateStore?.get == 'function' ? stateStore.get(stateKey) : stateStore?.[stateKey]
  return rawStateEntry && typeof rawStateEntry == 'object' && Object.hasOwn(rawStateEntry, 'newState')
    ? rawStateEntry.newState || null
    : rawStateEntry || null
}
export function lightStatisticsSummary(entityIds: any, stateByEntityId = new Map(), metadataByEntityId = new Map()) {
  const uniqueEntityIds: any[] = [],
    seenEntityIdSet = new Set()
  for (const rawEntityId of Array.isArray(entityIds) ? entityIds : []) {
    const candidateEntityId = String(rawEntityId || '').trim()
    !candidateEntityId ||
      seenEntityIdSet.has(candidateEntityId) ||
      (seenEntityIdSet.add(candidateEntityId), uniqueEntityIds.push(candidateEntityId))
  }
  const entitySummaries = uniqueEntityIds.map((entityId) => {
    const metadataEntry = readLookupEntry(metadataByEntityId, entityId) || {},
      stateEntry = readEntityState(stateByEntityId, entityId),
      stateText = String(stateEntry?.state || '')
        .trim()
        .toLowerCase(),
      supportResult = lightStatisticsEntitySupport({
        ...metadataEntry,
        entityId: entityId,
      }),
      stateStatus = lightStatisticsEntityStateStatus(
        {
          ...metadataEntry,
          entityId: entityId,
        },
        stateEntry,
      )
    return {
      entityId: entityId,
      label: String(
        stateEntry?.attributes?.friendly_name || metadataEntry.name || metadataEntry.originalName || entityId,
      ),
      state: stateText,
      status: stateStatus,
      message: stateStatus === 'abnormal' && supportResult.supported ? '当前状态无法判断' : supportResult.message,
    }
  })
  return {
    total: entitySummaries.length,
    on: entitySummaries.filter((onEntry) => onEntry.status === 'on').length,
    off: entitySummaries.filter((offEntry) => offEntry.status === 'off').length,
    abnormal: entitySummaries.filter((abnormalEntry) => abnormalEntry.status === 'abnormal').length,
    items: entitySummaries,
  }
}

/**
 * 统计状态（0.8.9 `lightStatisticsState`）：把三个纯函数收口成上游形状。
 *
 * 上游是一个大函数返回整块状态；本项目拆成「支持判定 / 单实体状态 / 汇总」三块，
 * 便于对每一层单独断言（尤其是 `assumed_state` 与 `abnormal` 的边界）。
 */
export function lightStatisticsState(entityIds: unknown, stateByEntityId = new Map(), metadataByEntityId = new Map()) {
  return lightStatisticsSummary(entityIds, stateByEntityId, metadataByEntityId)
}

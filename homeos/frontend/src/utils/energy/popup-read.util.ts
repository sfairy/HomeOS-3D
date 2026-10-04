/**
 * @module energy-popup-read.util
 * @description 能源弹窗字段读取工具模块。
 *
 * 职责：在能源弹窗中根据当前激活的实体 ID（activeEntityId）读取字段值或属性值，
 * 兼容用户点击非主实体（如分账户实体、图表实体）的场景。
 *
 * 依赖：
 * - `energy-fields`：字段定义与能源类别。
 * - `energy-entity-read.util`：实体属性读取。
 * - `energy-account.util`：账户索引反查。
 * - `energy-source.util`：能源源规范化、字段解析、余额实体 ID 解析等。
 */
import { getFieldDef, balanceAttrCandidatesForField, type EnergyCategory } from '@/constants/energy-fields'
import { readEntityAttr } from '@/utils/energy/entity-read.util'
import { resolveAccountIndexForEntityId } from '@/utils/energy/account.util'
import type { HaEntityState } from '@/types/entity-store'
import {
  normalizeEnergySource,
  resolveFieldRaw,
  resolvePopupBalanceId,
  parseJsonValue,
  readEntityState,
  resolveEntityPrefix,
} from '@/utils/energy/source.util'

type StatsSensors = Record<string, unknown>
type EntityMap = Record<string, HaEntityState | undefined>

/**
 * 弹窗场景：根据 activeEntityId 读取字段值（兼容点击非主实体）。
 *
 * 处理逻辑：
 * 1. entity 模式且激活实体即主实体、或 multi 模式：直接走 `resolveFieldRaw`。
 * 2. 无激活实体：同样走 `resolveFieldRaw`（使用主账户索引）。
 * 3. list / object 类型字段：在余额实体的候选属性中查找；约定模式还会尝试拼接
 *    `prefix + conventionSuffix` 得到图表实体并读取回退属性。
 * 4. balance 字段：优先读激活实体的 state，其次读余额实体的 state。
 * 5. 其他字段：尝试约定模式的同源实体 state，再尝试余额实体的候选属性，
 *    最终回退到 `resolveFieldRaw`。
 *
 * @param cat 能源类别。
 * @param fieldKey 字段 key。
 * @param statsSensors 能源源配置数据。
 * @param entities 实体 ID 到实体状态的映射表。
 * @param activeEntityId 当前激活的实体 ID。
 * @param cfgOverride 已规范化的能源配置；传入时可跳过重复 normalize。
 * @returns 字段值；无法解析时返回 undefined。
 */
export function readPopupField(
  cat: EnergyCategory | string,
  fieldKey: string,
  statsSensors: StatsSensors | null | undefined,
  entities: EntityMap,
  activeEntityId: string | null | undefined,
  cfgOverride?: ReturnType<typeof normalizeEnergySource>,
) {
  const cfg = cfgOverride ?? normalizeEnergySource(statsSensors, cat)
  const def = getFieldDef(cat as EnergyCategory, fieldKey)
  if (!def) return undefined
  const mainId = cfg.entityId?.trim()
  const accountIndex = resolveAccountIndexForEntityId(cfg, cat, activeEntityId)
  const useResolver =
    (cfg.mode === 'entity' && mainId && activeEntityId === mainId) || cfg.mode === 'multi'
  if (useResolver) {
    return resolveFieldRaw(cat, fieldKey, statsSensors, entities, accountIndex, cfg)
  }
  if (!activeEntityId) {
    return resolveFieldRaw(cat, fieldKey, statsSensors, entities, accountIndex, cfg)
  }
  if (def.type === 'list' || def.type === 'object') {
    const balanceId = resolvePopupBalanceId(cat, statsSensors, activeEntityId)
    for (const key of balanceAttrCandidatesForField(cat, fieldKey, def)) {
      const val = parseJsonValue(readEntityAttr(entities, balanceId, key))
      if (val != null && val !== '') return val
    }
    if (def.conventionSuffix) {
      const prefix = resolveEntityPrefix(cat, statsSensors, activeEntityId)
      const chartEnt = prefix ? prefix + def.conventionSuffix : ''
      if (chartEnt && entities[chartEnt]) {
        const chartAttr = def.listAttrFallback || def.defaultAttr
        return parseJsonValue(readEntityAttr(entities, chartEnt, chartAttr))
      }
    }
    return resolveFieldRaw(cat, fieldKey, statsSensors, entities, accountIndex, cfg)
  }
  if (fieldKey === 'balance') {
    const st = readEntityState(entities, activeEntityId)
    if (st !== undefined) return st
    const balanceId = resolvePopupBalanceId(cat, statsSensors, activeEntityId)
    return readEntityState(entities, balanceId)
  }
  const prefix = resolveEntityPrefix(cat, statsSensors, activeEntityId)
  if (prefix && def.conventionSuffix) {
    const sibling = readEntityState(entities, prefix + def.conventionSuffix)
    if (sibling !== undefined) return sibling
  }
  const balanceId = resolvePopupBalanceId(cat, statsSensors, activeEntityId)
  for (const key of balanceAttrCandidatesForField(cat, fieldKey, def)) {
    const val = readEntityAttr(entities, balanceId, key)
    if (val !== undefined && val !== null && val !== '') return val
  }
  return resolveFieldRaw(cat, fieldKey, statsSensors, entities, accountIndex, cfg)
}

/**
 * 弹窗场景：根据 activeEntityId 读取单个属性值。
 *
 * - entity 模式且激活实体即主实体：从主实体读取属性。
 * - 存在激活实体：从激活实体读取属性。
 * - 无激活实体：返回 undefined。
 *
 * @param cat 能源类别。
 * @param attrName 属性名。
 * @param statsSensors 能源源配置数据。
 * @param entities 实体映射表。
 * @param activeEntityId 当前激活的实体 ID。
 * @param cfgOverride 已规范化的能源配置；传入时可跳过重复 normalize。
 * @returns 属性值；无法读取时返回 undefined。
 */
export function readPopupAttr(
  cat: EnergyCategory | string,
  attrName: string,
  statsSensors: StatsSensors | null | undefined,
  entities: EntityMap,
  activeEntityId: string | null | undefined,
  cfgOverride?: ReturnType<typeof normalizeEnergySource>,
) {
  const cfg = cfgOverride ?? normalizeEnergySource(statsSensors, cat)
  const mainId = cfg.entityId?.trim()
  if (cfg.mode === 'entity' && mainId && activeEntityId === mainId) {
    return readEntityAttr(entities, mainId, attrName)
  }
  if (activeEntityId) {
    return readEntityAttr(entities, activeEntityId, attrName)
  }
  return undefined
}

/**
 * 仪表板底部信息栏组合式函数。
 *
 * 职责：
 *   - 解析仪表板底部信息栏配置项并读取绑定/实体数值；
 *   - 按能源字段定义与账户绑定解析每项的标签与格式化数值；
 *   - 派生可见项列表供底部信息栏组件渲染。
 * 依赖：
 *   - vue（computed）
 *   - @/stores/entities.store / layout.store
 *   - @/constants/energy-fields / @/constants/dashboard-footer / @/constants/account-binding-meta
 *   - @/utils/energy/* 与 @/utils/entity/derived.util（数值解析与显示名）
 *   - @homeos/shared（hasEnergyConfig）
 */
import { computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  ENERGY_FIELD_DEFS,
  getFieldDef,
  type EnergyCategory,
  type EnergyFieldDef,
} from '@/constants/energy-fields'
import { hasEnergyConfig, getEntityLeaf } from '@homeos/shared'
import {
  resolveFieldRaw,
  resolveFieldRawAggregated,
  formatNum,
} from '@/utils/energy/source.util'
import { readEntityAttr } from '@/utils/energy/entity-read.util'
import { collectFooterAccountSources } from '@/constants/account-binding-meta'
import {
  hasEnabledFooterItems,
  normalizeDashboardFooter,
  resolveFooterAccountIndex,
  resolveFooterPrimaryLabel,
  resolveFooterSecondaryLabel,
} from '@/constants/dashboard-footer'
import { FOOTER_ACCOUNT_INDEX_ALL } from '@/utils/energy/account.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { DashboardFooterItem, FooterFieldOption } from '@/types/dashboard-footer'
import type { EntitiesMap } from '@/types/entity-store'

function formatRawValue(raw: unknown, type = 'number') {
  if (raw == null || raw === '' || raw === 'unavailable' || raw === 'unknown') return '--'
  if (type === 'string') return String(raw)
  const num = parseFloat(String(raw))
  if (Number.isNaN(num)) return String(raw)
  if (type === 'number') {
    return Number.isInteger(num) ? String(num) : formatNum(num, Math.abs(num) >= 100 ? 1 : 2)
  }
  return String(num)
}
function formatCost(raw: unknown) {
  if (raw == null || raw === '') return null
  const formatted = formatNum(raw, parseFloat(String(raw)) >= 100 ? 1 : 2)
  return formatted === '--' ? null : formatted
}
/** 解析单个底部信息项的标签与格式化数值：按配置读取实体属性或统计传感器值，返回主/次标签与原始值 */
export function resolveFooterItemValue(
  item: DashboardFooterItem | null | undefined,
  statsSensors: Record<string, unknown>,
  entities: EntitiesMap,
  _labelFn: (label: string) => string,
) {
  if (!item?.enabled) return null
  const fieldOpts = (source: string): FooterFieldOption[] =>
    ((ENERGY_FIELD_DEFS as Record<string, EnergyFieldDef[]>)[source] || [])
      .filter((f) => f.type === 'number' || f.type === 'string')
      .map((f) => ({ value: f.key, label: f.label }))
  if (item.kind === 'entity') {
    const eid = item.entityId?.trim()
    if (!eid) return null
    const ent = entities[eid]
    if (!ent) return null
    const attr = item.attrName?.trim()
    const raw = attr ? readEntityAttr(entities, eid, attr) : ent.state
    const unit = item.unit || (ent.attributes?.unit_of_measurement as string | undefined) || ''
    return {
      id: item.id,
      label:
        resolveFooterPrimaryLabel(item, fieldOpts) ||
        getEntityDisplayName(eid, ent) ||
        getEntityLeaf(eid),
      value: formatRawValue(raw, 'string'),
      secondary: null,
      secondaryName: '',
      unit,
      icon: item.icon || '📡',
      color: item.color || 'yellow',
      showProgress: false,
      progressValue: 0,
      progressMax: item.progressMax || 100,
      isDate: false,
      hasData: raw != null && raw !== '' && raw !== 'unavailable' && raw !== 'unknown',
    }
  }
  const cat = (item.source || 'grid') as EnergyCategory
  const accountIndex = resolveFooterAccountIndex(item, statsSensors)
  const primaryKey = item.primaryField?.trim()
  if (!primaryKey) return null
  const def = getFieldDef(cat, primaryKey)
  const readField = (key: string) =>
    accountIndex === FOOTER_ACCOUNT_INDEX_ALL
      ? resolveFieldRawAggregated(cat, key, statsSensors, entities)
      : resolveFieldRaw(cat, key, statsSensors, entities, accountIndex)
  const primaryRaw = readField(primaryKey)
  let secondaryRaw = null
  if (item.secondaryField?.trim()) {
    secondaryRaw = readField(item.secondaryField)
  }
  const isDate =
    def?.type === 'string' &&
    (primaryKey.includes('Date') || primaryKey.includes('Time') || primaryKey === 'refreshTime')
  const unit = item.unit?.trim() || def?.unit || ''
  const label = resolveFooterPrimaryLabel(item, fieldOpts, statsSensors)
  const secondaryName = item.secondaryField?.trim()
    ? resolveFooterSecondaryLabel(item, fieldOpts)
    : ''
  const valueNum = parseFloat(String(primaryRaw))
  const showProgress =
    item.showProgress !== undefined ? !!item.showProgress : primaryKey === 'balance'
  const progressMax = item.progressMax || 200
  return {
    id: item.id,
    label,
    value: isDate
      ? formatRawValue(primaryRaw, 'string')
      : formatRawValue(primaryRaw, def?.type || 'number'),
    secondary: secondaryRaw != null ? formatCost(secondaryRaw) : null,
    secondaryName,
    unit: isDate ? '' : unit,
    icon: item.icon || '⚡',
    color: item.color || 'yellow',
    showProgress,
    progressValue:
      showProgress && !Number.isNaN(valueNum)
        ? Math.min(100, Math.max(0, (valueNum / progressMax) * 100))
        : 0,
    progressMax,
    balanceNum: showProgress ? valueNum : null,
    isDate,
    hasData:
      primaryRaw != null &&
      primaryRaw !== '' &&
      primaryRaw !== 'unavailable' &&
      primaryRaw !== 'unknown',
  }
}
/** 仪表板底部信息栏：派生归一化配置与可见项列表（含标签与数值），供底部信息栏组件渲染 */
export function useDashboardFooter() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const config = computed(() => normalizeDashboardFooter(layoutStore.layoutConfig.dashboardFooter))
  const visibleItems = computed(() => {
    const stats = (layoutStore.layoutConfig.statsSensors || {}) as Record<string, unknown>
    const entities = entitiesStore.entities
    return config.value.items
      .filter((it) => it.enabled)
      .map((it) => resolveFooterItemValue(it, stats, entities, (label) => label))
      .filter(Boolean)
  })
  const hasEnabledItems = computed(() => hasEnabledFooterItems(config.value.items))
  const requiredAccountSources = computed(() => collectFooterAccountSources(config.value.items))
  const hasAccountBinding = computed(() => {
    const stats = layoutStore.layoutConfig.statsSensors || {}
    return requiredAccountSources.value.every((cat) => hasEnergyConfig(cat, stats))
  })
  const missingAccountSources = computed(() => {
    const stats = layoutStore.layoutConfig.statsSensors || {}
    return requiredAccountSources.value.filter((cat) => !hasEnergyConfig(cat, stats))
  })
  const needsAccountBinding = computed(() => requiredAccountSources.value.length > 0)
  const hasDisplayData = computed(() => visibleItems.value.some((it) => it?.hasData))
  const showFooter = computed(() => !layoutStore.isEditMode && config.value.enabled)
  const footerFieldsForSource = (source: string) =>
    ((ENERGY_FIELD_DEFS as Record<string, EnergyFieldDef[]>)[source] || []).filter(
      (f) => f.type === 'number' || f.type === 'string',
    )
  return {
    config,
    visibleItems,
    hasEnabledItems,
    needsAccountBinding,
    hasAccountBinding,
    missingAccountSources,
    hasDisplayData,
    showFooter,
    footerFieldsForSource,
    resolveFooterItemValue,
  }
}

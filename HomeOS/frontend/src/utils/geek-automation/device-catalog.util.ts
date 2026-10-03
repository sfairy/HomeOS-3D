/**
 * 极客自动化「设备目录」构建
 *
 * 职责：
 * - 按房间 → 设备（实体） → 能力 构建设备目录条目。
 * - 复用实体 store / area 属性，不另建设备表。
 * - 提供目录条目构建、按设备分组、触发/条件常用域筛选等工具。
 *
 * 依赖：
 * - @homeos/shared 的 entityMatchesAreaFilter / getEntityDomain / resolveEntityArea。
 * - @/utils/entity/derived.util 的 getEntityDisplayName。
 * - ./capabilities.util 的 labelForDomain。
 *
 * 注意：
 * - 域 key（light / switch / ...）为 HA domain，不翻译。
 * - `GeekCatalogMode`（trigger / condition / action）为模式标识符，不翻译。
 * - 仅面向用户的设备名 / 分组标签使用简体中文。
 */
import { entityMatchesAreaFilter, getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { labelForDomain } from './capabilities.util'

/** 触发/条件常用域（含传感） */
const GEEK_CATALOG_TRIGGER_DOMAINS = [
  'light',
  'switch',
  'binary_sensor',
  'sensor',
  'cover',
  'climate',
  'fan',
  'lock',
  'media_player',
  'person',
  'device_tracker',
  'input_boolean',
  'input_number',
  'vacuum',
  'humidifier',
] as const

/** 动作控制常用域 */
const GEEK_CATALOG_ACTION_DOMAINS = [
  'light',
  'switch',
  'cover',
  'climate',
  'fan',
  'lock',
  'media_player',
  'scene',
  'script',
  'input_boolean',
  'input_number',
  'input_select',
  'vacuum',
  'humidifier',
  'water_heater',
  'alarm_control_panel',
  'valve',
] as const

/** GeekCatalogMode：类型定义，字段语义见声明。 */
export type GeekCatalogMode = 'trigger' | 'condition' | 'action'

/** GeekCatalogEntry：类型定义，字段语义见声明。 */
export type GeekCatalogEntry = {
  entityId: string
  name: string
  domain: string
  domainLabel: string
  areaId: string
  areaName: string
  deviceId: string
  state: string
}

type GeekCatalogDeviceGroup = {
  key: string
  title: string
  areaName: string
  domain: string
  domainLabel: string
  primaryEntityId: string
  entities: GeekCatalogEntry[]
}

type EntityLike = {
  entity_id?: string
  state?: string
  attributes?: Record<string, unknown> | null
}

/** domainsForCatalogMode：函数，按签名入参返回处理结果。 */
export function domainsForCatalogMode(mode: GeekCatalogMode): string[] {
  if (mode === 'action') return [...GEEK_CATALOG_ACTION_DOMAINS]
  return [...GEEK_CATALOG_TRIGGER_DOMAINS]
}

/** buildGeekCatalogEntries：函数，按签名入参返回处理结果。 */
export function buildGeekCatalogEntries(
  entities: Iterable<EntityLike> | Record<string, EntityLike>,
  opts?: { domains?: string[] | null },
): GeekCatalogEntry[] {
  const domainSet = opts?.domains?.length ? new Set(opts.domains) : null
  let list: EntityLike[]
  if (Array.isArray(entities)) {
    list = entities
  } else if (entities && typeof (entities as Iterable<EntityLike>)[Symbol.iterator] === 'function') {
    list = [...(entities as Iterable<EntityLike>)]
  } else {
    list = Object.values(entities as Record<string, EntityLike>)
  }

  const out: GeekCatalogEntry[] = []
  for (const ent of list) {
    const entityId = String(ent?.entity_id || '').trim()
    if (!entityId) continue
    const domain = getEntityDomain(entityId) || domainFromId(entityId)
    if (domainSet && !domainSet.has(domain)) continue
    const attrs = (ent.attributes || {}) as Record<string, unknown>
    const area = resolveEntityArea(attrs)
    out.push({
      entityId,
      name: getEntityDisplayName(entityId, ent as never) || entityId,
      domain,
      domainLabel: labelForDomain(domain),
      areaId: area?.id || '',
      areaName: area?.name || area?.display || '未分区',
      deviceId: String(attrs.device_id || '').trim(),
      state: String(ent.state ?? ''),
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return out
}

function domainFromId(entityId: string): string {
  const i = entityId.indexOf('.')
  return i > 0 ? entityId.slice(0, i) : ''
}

/** filterGeekCatalogEntries：函数，按签名入参返回处理结果。 */
export function filterGeekCatalogEntries(
  entries: GeekCatalogEntry[],
  opts: {
    areaId?: string
    domain?: string
    query?: string
  } = {},
): GeekCatalogEntry[] {
  const areaId = String(opts.areaId || '').trim()
  const domain = String(opts.domain || '').trim()
  const q = String(opts.query || '')
    .trim()
    .toLowerCase()

  return entries.filter((e) => {
    if (domain && e.domain !== domain) return false
    if (areaId) {
      const attrs = { area_id: e.areaId, area_name: e.areaName }
      if (!entityMatchesAreaFilter(attrs, areaId)) return false
    }
    if (!q) return true
    return (
      e.name.toLowerCase().includes(q) ||
      e.entityId.toLowerCase().includes(q) ||
      e.areaName.toLowerCase().includes(q) ||
      e.domainLabel.toLowerCase().includes(q)
    )
  })
}

/**
 * 按 HA device_id 聚合；无 device_id 时每个实体自成一组。
 * 组内优先展示可控域实体作为 primary。
 */
export function groupGeekCatalogByDevice(
  entries: GeekCatalogEntry[],
): GeekCatalogDeviceGroup[] {
  const map = new Map<string, GeekCatalogEntry[]>()
  for (const e of entries) {
    const key = e.deviceId ? `dev:${e.deviceId}` : `ent:${e.entityId}`
    const list = map.get(key)
    if (list) list.push(e)
    else map.set(key, [e])
  }

  const prefer = new Set<string>(GEEK_CATALOG_ACTION_DOMAINS)
  const groups: GeekCatalogDeviceGroup[] = []
  for (const [key, ents] of map) {
    const sorted = [...ents].sort((a, b) => {
      const pa = prefer.has(a.domain) ? 0 : 1
      const pb = prefer.has(b.domain) ? 0 : 1
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name, 'zh')
    })
    const primary = sorted[0]
    groups.push({
      key,
      title: primary.name,
      areaName: primary.areaName,
      domain: primary.domain,
      domainLabel: primary.domainLabel,
      primaryEntityId: primary.entityId,
      entities: sorted,
    })
  }
  groups.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  return groups
}

/** uniqueCatalogDomains：函数，按签名入参返回处理结果。 */
export function uniqueCatalogDomains(entries: GeekCatalogEntry[]): { id: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const e of entries) {
    if (!seen.has(e.domain)) seen.set(e.domain, e.domainLabel)
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
}

/** uniqueCatalogAreas：函数，按签名入参返回处理结果。 */
export function uniqueCatalogAreas(entries: GeekCatalogEntry[]): { id: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const e of entries) {
    if (!e.areaId) continue
    if (!seen.has(e.areaId)) seen.set(e.areaId, e.areaName || e.areaId)
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

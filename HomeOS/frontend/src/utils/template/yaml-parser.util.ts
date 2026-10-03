/**
 * 模板实体 YAML 解析工具。
 *
 * 职责：
 * - 判断 YAML 是否为 trigger-based 模板
 * - 从模板 YAML 提取表单字段（名称/platform/unique_id/扩展属性/引用实体）
 * - 将引用实体 ID 按槽位 domain 映射到 slot key
 * - 从 unique_id/名称/YAML 结构推断家电联动类型与编辑模式
 *
 * 关键算法：APPLIANCE_TYPE_HINTS / CN_APPLIANCE_HINTS 关键词命中 + PLATFORM_APPLIANCE_CANDIDATES
 * 平台兜底，结合 isApplianceCompositeYaml 判断聚合类模板。
 *
 * 依赖：@homeos/shared 的 loadHaYaml / 实体/模板解析 helper，./template-trigger-sensor.util。
 */

import { loadHaYaml } from '@homeos/shared'
import {
  extractFirstTemplateItemFromParsed,
  getEntityDomain,
  isTriggerBasedTemplateParsed,
  mapYamlToSlotsByKey,
  normalizeTemplateRoot,
} from '@homeos/shared'
import {
  canVisualEditTriggerYaml,
  isIncompleteTemplateYaml,
  isLikelyTriggerSensorPattern,
  parseTriggerSensorYaml,
} from './trigger-sensor.util'

/** 全局匹配 Jinja2 states/is_state/state_attr 调用中引用的 entity_id */
const ENTITY_REF_RE = /(?:states|is_state|state_attr)\s*\(\s*['"]([^'"]+)['"]/g
/** 全局匹配 entity_id: 行中的 entity_id（含可选引号） */
const ENTITY_ID_LINE_RE = /entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?/gi

/** 家电类型 ID 候选清单（用于 unique_id/名称文本命中匹配） */
const APPLIANCE_TYPE_HINTS = [
  'range_hood',
  'washing_machine',
  'dryer',
  'refrigerator',
  'oven',
  'dishwasher',
  'water_purifier',
  'water_dispenser',
  'air_purifier',
  'air_conditioner',
  'robot_vacuum',
  'dehumidifier',
  'ceiling_fan',
  'smart_curtain',
  'smart_lock',
  'tv',
  'microwave',
  'rice_cooker',
  'fresh_air',
  'floor_heating',
  'smart_plug',
  'water_heater',
  'humidifier_ha',
]

/** 家电类型 ID 集合（O(1) 查询某类型是否属于家电聚合类） */
const APPLIANCE_SLOT_TYPES = new Set(APPLIANCE_TYPE_HINTS)

/** 中文名关键词 → 家电类型 ID 映射表（名称含中文关键词时优先命中） */
const CN_APPLIANCE_HINTS = [
  ['吸油烟', 'range_hood'],
  ['油烟', 'range_hood'],
  ['洗衣', 'washing_machine'],
  ['烘干', 'dryer'],
  ['冰箱', 'refrigerator'],
  ['烤箱', 'oven'],
  ['蒸烤', 'oven'],
  ['洗碗', 'dishwasher'],
  ['净水', 'water_purifier'],
  ['管线', 'water_dispenser'],
  ['饮水', 'water_dispenser'],
  ['空气净化', 'air_purifier'],
  ['净化器', 'air_purifier'],
  ['空调', 'air_conditioner'],
  ['扫地', 'robot_vacuum'],
  ['除湿', 'dehumidifier'],
  ['加湿', 'humidifier_ha'],
  ['热水器', 'water_heater'],
  ['壁挂炉', 'water_heater'],
  ['风扇', 'ceiling_fan'],
  ['吊扇', 'ceiling_fan'],
  ['窗帘', 'smart_curtain'],
  ['门锁', 'smart_lock'],
  ['电视', 'tv'],
  ['dian_shi', 'tv'],
  ['dianshi', 'tv'],
  ['微波', 'microwave'],
  ['电饭', 'rice_cooker'],
  ['新风', 'fresh_air'],
  ['地暖', 'floor_heating'],
  ['插座', 'smart_plug'],
  ['排插', 'smart_plug'],
]

/** HA platform → 候选家电类型 ID 列表（结构推断时按平台回退到候选） */
const PLATFORM_APPLIANCE_CANDIDATES: Record<string, string[]> = {
  fan: ['range_hood', 'air_purifier', 'ceiling_fan'],
  media_player: ['tv'],
  vacuum: ['robot_vacuum'],
  cover: ['smart_curtain'],
  lock: ['smart_lock'],
  humidifier: ['humidifier_ha'],
  water_heater: ['water_heater'],
  climate: ['air_conditioner', 'floor_heating'],
  switch: [
    'dishwasher',
    'water_purifier',
    'water_dispenser',
    'smart_plug',
    'microwave',
    'rice_cooker',
    'dehumidifier',
  ],
  sensor: ['washing_machine', 'dryer', 'refrigerator', 'oven'],
}

/** 是否为 trigger-based template（含 trigger: 段） */
export function isTriggerBasedTemplateYaml(yamlStr: unknown) {
  const text = String(yamlStr ?? '')
  if (!text.trim()) return false
  try {
    const parsed = loadHaYaml(text)
    return isTriggerBasedTemplateParsed(parsed, text)
  } catch {
    return /\btrigger\s*:/m.test(text)
  }
}

/** 从 template YAML 提取表单字段与引用的实体 ID */
function parseTemplateYamlToForm(yamlStr: unknown) {
  const text = String(yamlStr ?? '')
  const result = {
    entName: '',
    platform: '',
    uniqueId: '',
    extraUnit: '',
    extraDeviceClass: '',
    extraIcon: '',
    entityIds: [] as string[],
    hasTrigger: false,
    rawYaml: text,
  }
  if (!text.trim()) return result

  result.hasTrigger = isTriggerBasedTemplateYaml(text)

  try {
    const parsed = loadHaYaml(text) as Record<string, unknown>
    const hit = extractFirstTemplateItemFromParsed({
      template: parsed?.template ?? parsed,
    })
    if (hit) {
      result.platform = hit.platform
      result.entName = String(hit.item.name || hit.item.friendly_name || '')
      result.uniqueId = String(hit.item.unique_id || '')
      if (hit.item.unit_of_measurement != null)
        result.extraUnit = String(hit.item.unit_of_measurement)
      if (hit.item.device_class) result.extraDeviceClass = String(hit.item.device_class)
      if (hit.item.icon) result.extraIcon = String(hit.item.icon).trim()
    } else if (!result.hasTrigger) {
      try {
        const root = normalizeTemplateRoot(parsed?.template ? parsed : { template: parsed })
        for (const [platform, items] of Object.entries(root)) {
          if (!Array.isArray(items) || !items.length) continue
          const item = items[0] as Record<string, unknown>
          if (!item || typeof item !== 'object') continue
          result.platform = platform
          result.entName = String(item.name || item.friendly_name || '')
          result.uniqueId = String(item.unique_id || '')
          if (item.unit_of_measurement != null) result.extraUnit = String(item.unit_of_measurement)
          if (item.device_class) result.extraDeviceClass = String(item.device_class)
          if (item.icon) result.extraIcon = String(item.icon).trim()
          break
        }
      } catch {
        /* 回退到文本扫描 */
      }
    }
  } catch {
    /* 回退到文本扫描 */
  }

  const seen = new Set<string>()
  const addId = (id: unknown) => {
    const clean = String(id || '')
      .replace(/['"]/g, '')
      .trim()
    if (!clean.includes('.') || seen.has(clean)) return
    seen.add(clean)
    result.entityIds.push(clean)
  }

  for (const m of text.matchAll(ENTITY_ID_LINE_RE)) addId(m[1])
  for (const m of text.matchAll(ENTITY_REF_RE)) addId(m[1])

  return result
}

/** 按槽位 domain 将实体 ID 映射到 slot key（优先 YAML 上下文解析） */
export function mapEntityIdsToSlots(entityIds: string[], slotDefs: Array<{ key: string; domain?: string; [k: string]: unknown }>, yamlStr = '', typeId = '') {
  if (yamlStr?.trim() && slotDefs?.length) {
    const byKey = mapYamlToSlotsByKey(yamlStr, slotDefs as never, typeId || undefined)
    if (Object.keys(byKey).length) return byKey
  }
  const slots: Record<string, string> = {}
  const used = new Set<string>()
  if (!slotDefs?.length) return slots

  for (const def of slotDefs) {
    const match = entityIds.find((id: string) => {
      if (used.has(id)) return false
      const dom = getEntityDomain(id)
      return dom === def.domain
    })
    if (match) {
      slots[def.key] = match
      used.add(match)
    }
  }
  return slots
}

/** 从 unique_id / 名称推断家电联动类型 */
function inferAppTypeFromHints(uniqueId: unknown, entName: unknown) {
  const raw = `${uniqueId || ''} ${entName || ''}`
  const hay = raw.toLowerCase()
  if (isLikelyTriggerSensorPattern(uniqueId, entName)) return ''
  for (const [cn, type] of CN_APPLIANCE_HINTS) {
    if (type === 'tv' && isLikelyTriggerSensorPattern(uniqueId, entName)) continue
    if (hay.includes(String(cn).toLowerCase()) || raw.includes(cn)) return type
  }
  for (const t of APPLIANCE_TYPE_HINTS) {
    if (t === 'tv' && /power_state|_power_|electric_power/.test(hay)) continue
    if (hay.includes(t)) return t
  }
  return ''
}

/**
 * 由已存 item 与已解析结果组装 trigger 传感器解析所需的 meta（名称/haConfigId/触发实体/已引用实体）。
 * @param item 已存记录
 * @param parsed parseTemplateYamlToForm 的输出
 * @returns meta 对象
 */
function buildTriggerParseMeta(
  item: Record<string, unknown> | null | undefined,
  parsed: { entityIds?: string[] } | Record<string, unknown> | null | undefined,
) {
  const entityIds = Array.isArray(parsed?.entityIds)
    ? (parsed.entityIds as unknown[]).map(String)
    : []
  return {
    name: item?.name,
    yamlComplete: item?.yamlComplete,
    haConfigId: item?.haConfigId,
    haEntityId: item?.haEntityId,
    triggerEntityId: item?.trigger_entity_id || item?.triggerEntityId || '',
    entityIds,
  }
}

/** 是否应使用触发式模板传感器可视化（含占位导入） */
function shouldUseTriggerSensorMode(item: Record<string, unknown> | null | undefined, parsed: Record<string, unknown> | null | undefined, yamlStr: unknown) {
  if (parsed?.hasTrigger) return true
  const meta = buildTriggerParseMeta(item, parsed)
  if (canVisualEditTriggerYaml(yamlStr, meta)) return true
  if (
    isIncompleteTemplateYaml(yamlStr, item?.yamlComplete) &&
    isLikelyTriggerSensorPattern(parsed?.uniqueId || item?.haConfigId, item?.name, yamlStr)
  ) {
    return true
  }
  return false
}

/** 是否为家电聚合模板（多实体映射 / turn_on 等，非 trigger 单传感器） */
function isApplianceCompositeYaml(yamlStr: unknown) {
  const text = String(yamlStr ?? '')
  if (!text.trim() || isTriggerBasedTemplateYaml(text)) return false
  if (
    /turn_on:|turn_off:|set_percentage:|open_cover:|volume_set:|start:|return_to_base:/m.test(
      text,
    )
  ) {
    return true
  }
  if (/service:\s*[a-z_]+\.[a-z_]+/m.test(text)) return true
  const parsed = parseTemplateYamlToForm(text)
  const compositePlatforms = new Set([
    'fan',
    'climate',
    'switch',
    'vacuum',
    'cover',
    'lock',
    'humidifier',
    'water_heater',
    'media_player',
  ])
  return compositePlatforms.has(parsed.platform) && parsed.entityIds.length >= 2
}

/**
 * 按 HA platform 与命名/文本特征从候选列表中挑选家电类型。
 * 对 fan/switch/climate/sensor 等平台分别按关键词细分，未命中细分规则时回退到候选首项。
 * @param platform HA platform 名
 * @param uniqueId 唯一 ID
 * @param entName 名称
 * @param yamlStr YAML 文本
 * @returns 家电类型 ID 或空串
 */
function inferFromPlatform(platform: string, uniqueId: unknown, entName: unknown, yamlStr: unknown) {
  const candidates = PLATFORM_APPLIANCE_CANDIDATES[platform]
  if (!candidates?.length) return ''
  const byHint = inferAppTypeFromHints(uniqueId, entName)
  if (byHint && candidates.includes(byHint)) return byHint
  const hay = `${uniqueId || ''} ${entName || ''} ${yamlStr || ''}`.toLowerCase()
  if (platform === 'fan') {
    if (/pm25|油烟|hood|range/.test(hay)) return 'range_hood'
    if (/filter|净化|purifier/.test(hay)) return 'air_purifier'
    if (/ceiling|吊扇/.test(hay)) return 'ceiling_fan'
    return candidates[0]
  }
  if (platform === 'switch') {
    if (/child_lock|energy|voltage|current|power_template|插座|排插/.test(hay)) return 'smart_plug'
    if (/tds|净水|purifier/.test(hay)) return 'water_purifier'
    if (/微波|microwave/.test(hay)) return 'microwave'
    if (/洗碗|dishwasher/.test(hay)) return 'dishwasher'
    if (/管线|饮水|dispenser/.test(hay)) return 'water_dispenser'
  }
  if (platform === 'climate') {
    if (/冰箱|fridge|refrigerat/.test(hay)) return 'refrigerator'
    if (/烤箱|oven/.test(hay)) return 'oven'
    if (/空调|air_condition/.test(hay)) return 'air_conditioner'
    if (/地暖|floor/.test(hay)) return 'floor_heating'
  }
  if (platform === 'sensor') {
    if (/冰箱|fridge|freezer|refrigerat/.test(hay)) return 'refrigerator'
    if (/烤箱|oven/.test(hay)) return 'oven'
    if (/洗衣|wash|washing/.test(hay)) return 'washing_machine'
    if (/烘干|dryer/.test(hay)) return 'dryer'
    if (/电饭|rice/.test(hay)) return 'rice_cooker'
    return ''
  }
  return candidates[0] || ''
}

/** 从 YAML 结构推断家电联动类型 */
function inferAppTypeFromYaml(parsed: Record<string, unknown> | null | undefined, yamlStr: unknown, entName: unknown = '') {
  if (!parsed) return ''
  const triggerParsed = parseTriggerSensorYaml(yamlStr)
  if (triggerParsed.recognized && !isApplianceCompositeYaml(yamlStr)) return ''
  const fromHint = inferAppTypeFromHints(parsed.uniqueId, entName || parsed.entName)
  if (fromHint && (isApplianceCompositeYaml(yamlStr) || parsed.platform === 'media_player'))
    return fromHint
  if (parsed.platform) {
    const fromPlatform = inferFromPlatform(
      String(parsed.platform),
      parsed.uniqueId,
      entName || parsed.entName,
      yamlStr,
    )
    if (fromPlatform && isApplianceCompositeYaml(yamlStr))
      return fromPlatform
  }
  if (fromHint && !parsed.hasTrigger && parsed.platform !== 'sensor') return fromHint
  return ''
}

/**
 * 编辑时解析应展示的类型（优先保留已存家电类型，再推断 trigger / 家电 / YAML）
 */
function resolveEditEntityType(item: Record<string, unknown> | null | undefined, parsed: Record<string, unknown> | null | undefined, _triggerParsed: Record<string, unknown>) {
  const stored = String(item?.type || '')
  const yamlStr = String(item?.yaml || '')

  if (stored === 'trigger_sensor') return 'trigger_sensor'

  if (
    shouldUseTriggerSensorMode(item, parsed, yamlStr) &&
    !isApplianceCompositeYaml(yamlStr)
  ) {
    return 'trigger_sensor'
  }

  if (stored && APPLIANCE_SLOT_TYPES.has(stored)) {
    return stored
  }

  const inferred = inferAppTypeFromYaml(parsed, yamlStr, item?.name)
  if (inferred) return inferred

  if (stored === 'yaml_import' || !stored) return 'yaml_import'
  if (APPLIANCE_SLOT_TYPES.has(stored)) return stored
  return 'yaml_import'
}

/** 导入/编辑时解析类型（含 meta，供 parseTriggerSensorYaml 使用） */
export function resolveEditEntityTypeFromItem(item: Record<string, unknown> | null | undefined) {
  const yamlStr = String(item?.yaml || '')
  const parsed = parseTemplateYamlToForm(yamlStr)
  const meta = buildTriggerParseMeta(item, parsed)
  const triggerParsed = parseTriggerSensorYaml(yamlStr, meta)
  const type = resolveEditEntityType(item, parsed, triggerParsed)
  return { type, parsed, triggerParsed, meta }
}

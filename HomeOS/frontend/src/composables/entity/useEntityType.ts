/**
 * 实体类型识别与状态预设模块。
 *
 * 职责：
 * - 通过 entity_id 前缀/关键字识别特殊实体类型（电力/燃气/水务/通讯/净水/管线机/冰箱等）；
 * - 提供各 Widget 类型对应的状态默认列表、户型图状态图标默认资源映射、通用 HA 状态集合；
 * - 从 HA 实体 attributes 中提取可作为热区状态图标的候选值；
 * - 构建"添加状态"下拉选项（类型预设 + 设备实报 + 通用状态）。
 *
 * 依赖：entity-derived 名称解析、entity-state-labels 状态文案格式化、HaEntityState/EntityLookup 类型。
 */
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { formatEntityStateOptionLabel } from '@/constants/entity-state-labels'
import type { HaEntityView } from '@/types/entity-store'

/** 读取实体展示名（小写），无 entities 时返回空串；同 entities+id 连续调用复用结果 */
type EntityLookup = Record<string, HaEntityView | undefined>
let entityNameLowerCacheEntities: EntityLookup | undefined
let entityNameLowerCacheId = ''
let entityNameLowerCacheValue = ''

function entityNameLower(id: string, entities?: EntityLookup): string {
  if (!entities) return ''
  if (entities === entityNameLowerCacheEntities && id === entityNameLowerCacheId) {
    return entityNameLowerCacheValue
  }
  entityNameLowerCacheEntities = entities
  entityNameLowerCacheId = id
  entityNameLowerCacheValue = getEntityDisplayName(id, entities[id]).toLowerCase()
  return entityNameLowerCacheValue
}

/**
 * 判断是否为电力实体（entity_id 以 sensor.ele_ 开头）。
 * @param id entity_id
 * @returns 是否为电力实体
 */
export function isElectricityEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.ele_')
}

/**
 * 判断是否为燃气实体（entity_id 以 sensor.gas_ 开头）。
 * @param id entity_id
 * @returns 是否为燃气实体
 */
export function isGasEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.gas_')
}

/**
 * 判断是否为水务实体（entity_id 以 sensor.water_ 开头）。
 * @param id entity_id
 * @returns 是否为水务实体
 */
export function isWaterEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.water_')
}

/**
 * 判断是否为通讯实体（entity_id 以 sensor.ct_/sensor.cu_ 开头）。
 * @param id entity_id
 * @returns 是否为通讯实体
 */
export function isCommEntity(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('sensor.ct_') || id.startsWith('sensor.cu_'))
}

/**
 * 判断是否为公用事业实体（电力/燃气/水务/通讯任一）。
 * @param id entity_id
 * @returns 是否为公用事业实体
 */
export function isUtilityEntity(id: string | null | undefined): boolean {
  return isElectricityEntity(id) || isGasEntity(id) || isWaterEntity(id) || isCommEntity(id)
}

/**
 * 判断是否为净水器实体。
 *
 * 规则：entity_id 含 water_purifier 或 _purifier_；若提供 entities，则进一步通过
 * 名称（含"净水"/"水净"，或含 purifier 且不含 air）辅助判定。
 *
 * @param id entity_id
 * @param entities 实体表（可选，用于名称辅助判定）
 * @returns 是否为净水器实体
 */
export function isWaterPurifierEntity(
  id: string | null | undefined,
  entities?: EntityLookup,
): boolean {
  if (!id) return false
  // 空气净化器优先排除，避免 air_purifier_* 命中 _purifier_
  if (isAirPurifierEntity(id, entities)) return false
  const eid = id.toLowerCase()
  if (eid.includes('water_purifier')) return true
  if (eid.includes('_purifier_') && !eid.includes('air_purifier')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('净水') || name.includes('水净')) return true
  if (name.includes('purifier') && !name.includes('air') && !name.includes('空气')) return true
  return false
}
/**
 * Widget 类型 → 默认状态列表映射。
 * 用于"添加状态"下拉的类型预设选项与状态图标匹配。
 */
const DEFAULT_STATE_MAP: Record<string, readonly string[]> = {
  ToggleWidget: ['on', 'off'],
  BadgeWidget: [],
  ClimateWidget: ['cool', 'heat', 'auto', 'dry', 'fan_only', 'off'],
  FanWidget: ['on', 'off'],
  WaterHeaterWidget: ['gas', 'on', 'off'],
  CoverWidget: ['open', 'closed', 'opening', 'closing'],
  MediaWidget: ['playing', 'paused', 'idle', 'off'],
  WaterPurifierWidget: ['on', 'off'],
  AirPurifierWidget: ['on', 'off'],
  DispenserWidget: ['on', 'off'],
  FridgeWidget: ['on', 'off'],
  FreshAirWidget: ['on', 'off'],
  HumidifierWidget: ['on', 'off'],
  WashingMachineWidget: ['on', 'off'],
  RangeHoodWidget: ['on', 'off'],
  GasStoveWidget: ['on', 'off'],
  MotionSensorWidget: ['on', 'off', 'detected', 'clear'],
  LeakSensorWidget: ['on', 'off', 'detected', 'clear'],
  GasSensorWidget: ['on', 'off', 'detected', 'clear'],
  SmokeSensorWidget: ['on', 'off', 'detected', 'clear'],
  EnvironmentSensorWidget: ['on', 'off'],
  CoSensorWidget: ['on', 'off', 'detected', 'clear'],
  LockWidget: ['locked', 'unlocked', 'unlocking', 'locking', 'jammed'],
  VacuumWidget: ['docked', 'cleaning', 'paused', 'returning', 'idle', 'off', 'error'],
  CameraWidget: ['streaming', 'idle', 'recording', 'off'],
  SceneWidget: [],
  AlarmWidget: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'triggered'],
  SirenWidget: ['on', 'off', 'sounding'],
  ValveWidget: ['open', 'closed', 'opening', 'closing'],
  RemoteWidget: ['on', 'off'],
}

/** 户型图状态图标默认资源（相对 /icons/，含分类目录） */
const DEFAULT_WIDGET_STATE_ICONS: Partial<Record<string, Record<string, string>>> = {
  VacuumWidget: {
    docked: '扫地机/vacuum_docked.svg',
    cleaning: '扫地机/vacuum_cleaning.svg',
    paused: '扫地机/vacuum_paused.svg',
    returning: '扫地机/vacuum_returning.svg',
    idle: '扫地机/vacuum_idle.svg',
    off: '扫地机/vacuum_off.svg',
    error: '扫地机/vacuum_error.svg',
  },
  MediaWidget: {
    playing: '多媒体/media_playing.svg',
    paused: '多媒体/media_paused.svg',
    idle: '多媒体/media_idle.svg',
    off: '多媒体/media_off.svg',
  },
  ClimateWidget: {
    cool: '空调/climate_cool.svg',
    heat: '空调/climate_heat.svg',
    auto: '空调/climate_auto.svg',
    dry: '空调/climate_dry.svg',
    fan_only: '空调/climate_fan.svg',
    off: '空调/climate_off.svg',
  },
  CoverWidget: {
    open: '窗帘/cover_open.svg',
    closed: '窗帘/cover_closed.svg',
    opening: '窗帘/cover_opening.svg',
    closing: '窗帘/cover_closing.svg',
  },
  LockWidget: {
    locked: '门锁/lock_locked.svg',
    unlocked: '门锁/lock_unlocked.svg',
    locking: '门锁/lock_locking.svg',
    unlocking: '门锁/lock_unlocking.svg',
    jammed: '门锁/lock_jammed.svg',
  },
  CameraWidget: {
    streaming: '摄像/camera_streaming.svg',
    idle: '摄像/camera_idle.svg',
    recording: '摄像/camera_recording.svg',
    off: '摄像/camera_off.svg',
  },
  AlarmWidget: {
    disarmed: '安防/alarm_disarmed.svg',
    armed_home: '安防/alarm_armed_home.svg',
    armed_away: '安防/alarm_armed_away.svg',
    armed_night: '安防/alarm_armed_night.svg',
    triggered: '安防/alarm_triggered.svg',
  },
  SirenWidget: {
    on: '安防/siren_on.svg',
    off: '安防/siren_off.svg',
    sounding: '安防/siren_sounding.svg',
  },
  ValveWidget: {
    open: '阀门/valve_open.svg',
    closed: '阀门/valve_closed.svg',
    opening: '阀门/valve_opening.svg',
    closing: '阀门/valve_closing.svg',
  },
  RemoteWidget: {
    on: '开关/remote_on.svg',
    off: '开关/remote_off.svg',
  },
  HumidifierWidget: {
    on: '家电/humidifier_on.svg',
    off: '家电/humidifier_off.svg',
  },
  ToggleWidget: {
    on: '开关/toggle_on.svg',
    off: '开关/toggle_off.svg',
  },
  FanWidget: {
    on: '风扇/fan_on.svg',
    off: '风扇/fan_off.svg',
  },
  AirPurifierWidget: {
    on: '家电/air_purifier_on.svg',
    off: '家电/air_purifier_off.svg',
  },
  DispenserWidget: {
    on: '家电/dispenser_on.svg',
    off: '家电/dispenser_off.svg',
  },
  FridgeWidget: {
    on: '家电/fridge_on.svg',
    off: '家电/fridge_off.svg',
  },
  FreshAirWidget: {
    on: '家电/erv_on.svg',
    off: '家电/erv_off.svg',
  },
  WaterHeaterWidget: {
    gas: '家电/water_heater_gas.svg',
    on: '家电/water_heater_on.svg',
    off: '家电/water_heater_off.svg',
  },
  WaterPurifierWidget: {
    on: '家电/water_purifier_on.svg',
    off: '家电/water_purifier_off.svg',
  },
  WashingMachineWidget: {
    on: '家电/washing_machine_on.svg',
    off: '家电/washing_machine_off.svg',
  },
  RangeHoodWidget: {
    on: '家电/range_hood_on.svg',
    off: '家电/range_hood_off.svg',
  },
  GasStoveWidget: {
    on: '家电/gas_stove_on.svg',
    off: '家电/gas_stove_off.svg',
  },
  /** 徽章默认：人体传感（可按实体改选其他传感器图标） */
  BadgeWidget: {
    on: '传感器/motion_sensor_on.svg',
    off: '传感器/motion_sensor_off.svg',
    detected: '传感器/motion_sensor_on.svg',
    clear: '传感器/motion_sensor_off.svg',
  },
  MotionSensorWidget: {
    on: '传感器/motion_sensor_on.svg',
    off: '传感器/motion_sensor_off.svg',
    detected: '传感器/motion_sensor_on.svg',
    clear: '传感器/motion_sensor_off.svg',
  },
  LeakSensorWidget: {
    on: '传感器/leak_sensor_on.svg',
    off: '传感器/leak_sensor_off.svg',
    detected: '传感器/leak_sensor_on.svg',
    clear: '传感器/leak_sensor_off.svg',
  },
  GasSensorWidget: {
    on: '传感器/gas_sensor_on.svg',
    off: '传感器/gas_sensor_off.svg',
    detected: '传感器/gas_sensor_on.svg',
    clear: '传感器/gas_sensor_off.svg',
  },
  SmokeSensorWidget: {
    on: '传感器/smoke_sensor_on.svg',
    off: '传感器/smoke_sensor_off.svg',
    detected: '传感器/smoke_sensor_on.svg',
    clear: '传感器/smoke_sensor_off.svg',
  },
  EnvironmentSensorWidget: {
    on: '传感器/environment_sensor_on.svg',
    off: '传感器/environment_sensor_off.svg',
  },
  CoSensorWidget: {
    on: '传感器/co_sensor_on.svg',
    off: '传感器/co_sensor_off.svg',
    detected: '传感器/co_sensor_on.svg',
    clear: '传感器/co_sensor_off.svg',
  },
}
/** 无类型预设时（徽章/场景等）可选的通用 HA 状态 */
const COMMON_STATES = [
  'on',
  'off',
  'open',
  'closed',
  'opening',
  'closing',
  'locked',
  'unlocked',
  'locking',
  'unlocking',
  'jammed',
  'playing',
  'paused',
  'idle',
  'unavailable',
  'unknown',
  'home',
  'not_home',
  'detected',
  'clear',
  'charging',
  'cool',
  'heat',
  'auto',
  'dry',
  'fan_only',
  'docked',
  'cleaning',
  'returning',
  'streaming',
  'recording',
  'disarmed',
  'armed_home',
  'armed_away',
  'armed_night',
  'triggered',
  'sounding',
  'gas',
]

/**
 * 将状态值格式化为展示文案。
 * @param state 状态原始值
 * @returns 展示文案
 */
export function formatStateLabel(state: string | null | undefined): string {
  return formatEntityStateOptionLabel(state)
}

/** HA attributes 中可表示"模式/选项列表"的数组类 key */
const ENTITY_STATE_ARRAY_KEYS = [
  'hvac_modes',
  'fan_modes',
  'swing_modes',
  'preset_modes',
  'options',
  'operation_list',
  'available_modes',
  'effect_list',
  'sound_mode_list',
  'source_list',
]

/** HA attributes 中可表示"当前模式/状态"的标量类 key */
const ENTITY_STATE_SCALAR_KEYS = [
  'operation_mode',
  'hvac_mode',
  'fan_mode',
  'preset_mode',
  'status',
]

/**
 * 从 HA 实体提取可作为热区状态图标的候选值（当前 state + 设备上报的模式/选项列表）。
 *
 * 提取范围：entity.state + 数组类 attributes（去重保序）+ 标量类 attributes。
 *
 * @param entity HA 实体
 * @param options.excludeFanSpeed 为 true 时跳过 fan_modes / fan_mode（空调风量档位，不进状态图标）
 * @returns 候选状态字符串数组（已去重）
 */
export function extractEntityStateCandidates(
  entity: HaEntityView | null | undefined,
  options?: { excludeFanSpeed?: boolean },
): string[] {
  if (!entity) return []
  const out = new Set<string>()
  /** 安全推入候选值（自动 trim + 去重 + 空值过滤） */
  const push = (v: unknown) => {
    if (v == null || v === '') return
    const s = String(v).trim()
    if (s) out.add(s)
  }
  push(entity.state)
  const attrs = entity.attributes || {}
  const arrayKeys = options?.excludeFanSpeed
    ? ENTITY_STATE_ARRAY_KEYS.filter((k) => k !== 'fan_modes')
    : ENTITY_STATE_ARRAY_KEYS
  const scalarKeys = options?.excludeFanSpeed
    ? ENTITY_STATE_SCALAR_KEYS.filter((k) => k !== 'fan_mode')
    : ENTITY_STATE_SCALAR_KEYS
  for (const key of arrayKeys) {
    const arr = attrs[key]
    if (Array.isArray(arr)) arr.forEach(push)
  }
  for (const key of scalarKeys) {
    push(attrs[key])
  }
  return [...out]
}

/**
 * 类型预设 + 设备实报状态（去重合并，设备值优先排在类型预设之后）。
 *
 * 调用场景：为户型图状态图标配置提供"建议状态"集合。
 * ClimateWidget 会排除风量档位（fan_modes / fan_mode），仅保留 HVAC 模式等。
 *
 * @param widgetType Widget 类型
 * @param entity HA 实体
 * @returns 合并后的状态字符串数组
 */
export function mergeSuggestedStates(
  widgetType: string,
  entity: HaEntityView | null | undefined,
): string[] {
  const typeStates = DEFAULT_STATE_MAP[widgetType] ?? []
  const deviceStates = extractEntityStateCandidates(entity, {
    excludeFanSpeed: widgetType === 'ClimateWidget',
  })
  const merged = [...typeStates]
  for (const s of deviceStates) {
    if (!merged.includes(s)) merged.push(s)
  }
  return merged
}

/**
 * 将 entityStates 规范化为字符串数组（兼容单值/数组/null）。
 * @param entityStates 单值或数组
 * @returns 字符串数组
 */
function normalizeEntityStates(entityStates: string | string[] | null | undefined): string[] {
  if (Array.isArray(entityStates)) return entityStates
  if (entityStates != null && entityStates !== '') return [entityStates]
  return []
}

/**
 * 构建「添加状态」下拉选项（已配置的状态会排除）。
 *
 * 输出分三类：typeOptions（类型预设）、deviceOptions（设备实报，去除已存在与类型预设重叠），
 * commonOptions（通用 HA 状态，去除前两类已使用的）。
 *
 * @param widgetType Widget 类型
 * @param existingKeys 已配置的状态 key 列表
 * @param entityStates 设备实报的状态（字符串或数组）
 * @returns {{ typeOptions: string[], deviceOptions: string[], commonOptions: string[] }}
 */
export function buildAddStateOptions(
  widgetType: string,
  existingKeys: string[] = [],
  entityStates: string | string[] | null | undefined = [],
) {
  const typeStates = DEFAULT_STATE_MAP[widgetType] ?? []
  const existing = new Set(Array.isArray(existingKeys) ? existingKeys : [])
  // 规范化设备实报状态：trim + 去重 + 去空
  const normalized = [
    ...new Set(
      normalizeEntityStates(entityStates)
        .map((s) => String(s).trim())
        .filter(Boolean),
    ),
  ]
  // 类型预设选项：排除已配置
  const typeOptions = typeStates.filter((s) => !existing.has(s))
  const typeSet = new Set(typeStates)
  // 设备实报选项：排除已配置与类型预设重叠
  const deviceOptions = normalized.filter((s) => !existing.has(s) && !typeSet.has(s))
  const used = new Set([...existing, ...typeStates, ...normalized])
  // 通用状态选项：排除已使用
  const commonOptions = COMMON_STATES.filter((s) => !used.has(s))
  return { typeOptions, deviceOptions, commonOptions }
}

/**
 * 判断是否为管线机/饮水机实体。
 *
 * 规则：entity_id 含 _dispenser 或 pipeline；若提供 entities，则通过名称
 * （含"管线"/"饮水"）辅助判定。
 *
 * @param id entity_id
 * @param entities 实体表（可选）
 * @returns 是否为管线机/饮水机实体
 */
export function isDispenserEntity(id: string | null | undefined, entities?: EntityLookup): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('_dispenser') || eid.includes('pipeline')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('管线') || name.includes('饮水')) return true
  return false
}

/**
 * 判断是否为冰箱/冰柜实体。
 *
 * 规则：entity_id 含 _fridge/_refrigerator/freezer；若提供 entities，则通过名称
 * （含"冰箱"/"冰柜"/"refrigerator"）辅助判定。
 *
 * @param id entity_id
 * @param entities 实体表（可选）
 * @returns 是否为冰箱/冰柜实体
 */
export function isFridgeEntity(id: string | null | undefined, entities?: EntityLookup): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('_fridge') || eid.includes('_refrigerator') || eid.includes('freezer'))
    return true
  const name = entityNameLower(id, entities)
  if (name.includes('冰箱') || name.includes('冰柜') || name.includes('refrigerator')) return true
  return false
}

/**
 * 判断是否为全热交换器 / 新风系统实体。
 *
 * 规则：entity_id 含 erv/hrv/fresh_air/heat_exchanger/xin_feng；
 * 若提供 entities，则通过名称（含「新风」「全热」「热交换」「ERV」「HRV」）辅助判定。
 */
export function isFreshAirEntity(id: string | null | undefined, entities?: EntityLookup): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (
    eid.includes('_erv') ||
    eid.includes('erv_') ||
    eid.includes('_hrv') ||
    eid.includes('hrv_') ||
    eid.includes('fresh_air') ||
    eid.includes('heat_exchanger') ||
    eid.includes('xin_feng') ||
    eid.includes('xinfeng')
  ) {
    return true
  }
  const name = entityNameLower(id, entities)
  if (
    name.includes('新风') ||
    name.includes('全热') ||
    name.includes('热交换') ||
    name.includes('erv') ||
    name.includes('hrv')
  ) {
    return true
  }
  return false
}

/**
 * 判断是否为洗衣机 / 烘干机实体。
 */
export function isWashingMachineEntity(
  id: string | null | undefined,
  entities?: EntityLookup,
): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('dishwasher')) return false
  if (
    eid.includes('washing_machine') ||
    eid.includes('washer_') ||
    eid.includes('_washer') ||
    eid.includes('_dryer') ||
    eid.includes('dryer_')
  ) {
    return true
  }
  const name = entityNameLower(id, entities)
  if (name.includes('洗碗')) return false
  if (name.includes('洗衣') || name.includes('烘干') || name.includes('烘干机')) return true
  return false
}

/**
 * 判断是否为吸油烟机实体。
 */
export function isRangeHoodEntity(id: string | null | undefined, entities?: EntityLookup): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('range_hood') || eid.includes('_hood') || eid.includes('hood_')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('油烟') || name.includes('烟机') || name.includes('抽油烟')) return true
  return false
}

/**
 * 判断是否为燃气灶实体。
 */
export function isGasStoveEntity(id: string | null | undefined, entities?: EntityLookup): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('gas_stove') || eid.includes('_stove') || eid.includes('stove_')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('燃气灶') || name.includes('灶具') || name.includes('煤气灶')) return true
  return false
}

/**
 * 判断是否为空气净化器实体。
 */
export function isAirPurifierEntity(
  id: string | null | undefined,
  entities?: EntityLookup,
): boolean {
  if (!id) return false
  const eid = id.toLowerCase()
  if (eid.includes('air_purifier') || eid.includes('airpurifier')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('空气净') || name.includes('空气净化器')) return true
  if (name.includes('air purifier')) return true
  // 「净化器」且非净水
  if (name.includes('净化器') && !name.includes('净水') && !name.includes('水净')) return true
  return false
}

/**
 * 判断是否为加湿器实体（domain=humidifier 或名称/ID 关键词）。
 */
export function isHumidifierEntity(
  id: string | null | undefined,
  entities?: EntityLookup,
): boolean {
  if (!id) return false
  if (getEntityDomain(id) === 'humidifier') return true
  const eid = id.toLowerCase()
  if (eid.includes('humidifier') || eid.includes('humidifi')) return true
  const name = entityNameLower(id, entities)
  if (name.includes('加湿')) return true
  return false
}

/**
 * 按 binary_sensor 的 device_class 解析户型图传感器部件类型。
 * 未识别的 device_class 返回 null（由调用方回退 BadgeWidget）。
 */
export function resolveBinarySensorWidgetType(
  id: string | null | undefined,
  entities?: EntityLookup,
): string | null {
  if (!id || getEntityDomain(id) !== 'binary_sensor') return null
  const ent = entities?.[id]
  const dc = String(ent?.attributes?.device_class || '').toLowerCase()
  if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'MotionSensorWidget'
  if (dc === 'moisture') return 'LeakSensorWidget'
  if (dc === 'gas') return 'GasSensorWidget'
  if (dc === 'smoke') return 'SmokeSensorWidget'
  if (dc === 'carbon_monoxide') return 'CoSensorWidget'
  return null
}

/** light 域 Toggle：按实体名/id 推断灯具造型，默认吸顶灯 */
const LIGHT_TOGGLE_ICON_VARIANTS: Record<string, Record<'on' | 'off', string>> = {
  ceiling: { on: '灯光/light_ceiling_on.svg', off: '灯光/light_ceiling_off.svg' },
  chandelier: { on: '灯光/light_chandelier_on.svg', off: '灯光/light_chandelier_off.svg' },
  panel: { on: '灯光/light_panel_on.svg', off: '灯光/light_panel_off.svg' },
  spot: { on: '灯光/light_spot_on.svg', off: '灯光/light_spot_off.svg' },
  strip: { on: '灯光/light_strip_on.svg', off: '灯光/light_strip_off.svg' },
  track: { on: '灯光/light_track_on.svg', off: '灯光/light_track_off.svg' },
}

const FAN_STAND_ICONS: Record<string, string> = {
  on: '风扇/fan_stand_on.svg',
  off: '风扇/fan_stand_off.svg',
}

const MEDIA_TV_ICONS: Record<string, string> = {
  playing: '多媒体/media_tv_on.svg',
  paused: '多媒体/media_paused.svg',
  idle: '多媒体/media_idle.svg',
  off: '多媒体/media_tv_off.svg',
}

const MEDIA_MUSIC_ICONS: Record<string, string> = {
  playing: '多媒体/media_music.svg',
  paused: '多媒体/media_paused.svg',
  idle: '多媒体/media_idle.svg',
  off: '多媒体/media_off.svg',
}

/** 合并 entity_id 与展示名，便于关键字匹配 */
function entityMatchText(id: string, entities?: EntityLookup): string {
  return `${id} ${entityNameLower(id, entities)}`.toLowerCase()
}

function resolveLightToggleIcons(entityId: string, entities?: EntityLookup): Record<string, string> {
  const t = entityMatchText(entityId, entities)
  let key: keyof typeof LIGHT_TOGGLE_ICON_VARIANTS = 'ceiling'
  if (/chandelier|吊灯|水晶/.test(t)) key = 'chandelier'
  else if (/track|磁吸|轨道/.test(t)) key = 'track'
  else if (/strip|灯带|灯条|lightbar|线性/.test(t)) key = 'strip'
  else if (/spot|射灯|筒灯/.test(t)) key = 'spot'
  else if (/panel|面板|平板/.test(t)) key = 'panel'
  else if (/ceiling|吸顶/.test(t)) key = 'ceiling'
  return { ...LIGHT_TOGGLE_ICON_VARIANTS[key] }
}

function resolveFanIcons(entityId: string, entities?: EntityLookup): Record<string, string> {
  const t = entityMatchText(entityId, entities)
  if (/stand|落地|塔扇|柱扇|pedestal/.test(t)) return { ...FAN_STAND_ICONS }
  return { ...(DEFAULT_WIDGET_STATE_ICONS.FanWidget || {}) }
}

function resolveMediaIcons(entityId: string, entities?: EntityLookup): Record<string, string> {
  const t = entityMatchText(entityId, entities)
  if (/tv|television|电视|投影仪|projector/.test(t)) return { ...MEDIA_TV_ICONS }
  if (/music|音箱|音响|speaker|sonos|播放器/.test(t)) return { ...MEDIA_MUSIC_ICONS }
  return { ...(DEFAULT_WIDGET_STATE_ICONS.MediaWidget || {}) }
}

/**
 * 取部件类型默认状态图标。
 * light / fan / media 会按实体 id/名称选用更贴合的造型变体。
 */
export function getDefaultStateIcons(
  widgetType: string,
  entityId?: string | null,
  entities?: EntityLookup,
): Record<string, string> {
  if (widgetType === 'ToggleWidget' && entityId && getEntityDomain(entityId) === 'light') {
    return resolveLightToggleIcons(entityId, entities)
  }
  if (widgetType === 'FanWidget' && entityId) {
    return resolveFanIcons(entityId, entities)
  }
  if (widgetType === 'MediaWidget' && entityId) {
    return resolveMediaIcons(entityId, entities)
  }
  return { ...(DEFAULT_WIDGET_STATE_ICONS[widgetType] || {}) }
}
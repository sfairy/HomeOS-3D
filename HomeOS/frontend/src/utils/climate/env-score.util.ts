/**
 * 环境评分工具：统一 IAQ 污染指数（越高越差）与健康分（越高越好）的展示语义。
 * 后端 IAQ 参考 RESET Air / WELL Standard，范围 0–100，0=最优。
 *
 * 所属模块：环境与健康 / IAQ 评分
 * 职责：从 sensorMap 或启发式扫描收集环境读数；计算 IAQ 污染指数与健康分；
 *   提供颜色 / 标签 / 格式化展示工具；构建总览卡指标行。
 * 依赖：entity-derived（实体显示名）、sensor-reading-colors（读数色阶常量）。
 */

import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'

/** 环境传感器原始读数输入（各字段可选，缺失表示无数据） */
interface EnvSensorInput {
  pm25?: number | null
  co2?: number | null
  tvoc?: number | null
  temperature?: number | null
  humidity?: number | null
}

/** IAQ 计算结果：综合污染指数 + 各分项差度分 + 原始读数 + 建议文案 */
export interface EnvIaqResult {
  iaq: number | null
  grade?: string
  /** 各分项差度分 0–100（越高越差） */
  scores?: Record<string, number>
  /** 参与计算的原始读数（带物理量） */
  readings?: EnvSensorInput
  advice?: string[]
  timestamp?: string
}

/** 房间传感器映射（与 EnvSensorMap 字段对齐的最小形状） */
export type EnvSensorMapLike = Record<
  string,
  | {
      temperature?: string
      humidity?: string
      pm25?: string
      co2?: string
      tvoc?: string
      _hidden?: boolean
    }
  | undefined
>

/** 总览卡单个指标展示项（含标签 / 数值 / 单位 / 差度分 / 告警 / 空态标记） */
interface EnvMetricDisplayItem {
  label: string
  /** 主展示：原始读数 + 单位，或 -- */
  value: string
  /** 数值部分（磁贴布局用） */
  valueNum: string
  /** 单位部分（磁贴布局用） */
  unit: string
  /** 差度分，仅调试/弱提示 */
  score: number | null
  warn: boolean
  empty: boolean
}

/** 实体最小形状（仅需 state 与 attributes.device_class 用于解析） */
type EntityLike = {
  state?: string
  attributes?: { device_class?: string; [key: string]: unknown }
}

/** 室外实体识别正则：匹配 outdoor / outside / weather / 外[室外] / 户外 / 阳台 等关键词 */
const OUTDOOR_HINT =
  /(outdoor|outside|weather|外[室外]|户外|阳台|院子|庭院|屋顶|ambient_outdoor)/i

/**
 * 污染指数 → 健康分（100 - IAQ）。
 *
 * @param iaq 污染指数（0–100，越高越差）
 * @returns 健康分（0–100，越高越好），已夹取到 [0, 100]
 */
export function iaqToHealthScore(iaq: number): number {
  return Math.max(0, Math.min(100, 100 - iaq))
}

/** 健康分颜色（越高越好） */
export function healthScoreColor(score: number): string {
  if (score >= 80) return '#34C759'
  if (score >= 60) return '#FFCC00'
  if (score >= 40) return '#FF9500'
  return '#FF3B30'
}

/** 污染指数颜色（越低越好） */
export function iaqPollutionColor(iaq: number): string {
  if (iaq <= 20) return '#34C759'
  if (iaq <= 40) return '#FFCC00'
  if (iaq <= 60) return '#FF9500'
  if (iaq <= 80) return '#FF3B30'
  return '#8E8E93'
}

/** 健康分标签 */
export function healthScoreLabel(score: number): string {
  if (score >= 80) return '舒适'
  if (score >= 60) return '一般'
  if (score >= 40) return '偏差'
  return '不适'
}

/**
 * 从实体 state 解析数值；unavailable / unknown / 非有限数返回 null。
 *
 * @param entity 实体对象（可能为 undefined）
 * @returns 解析后的数值或 null
 */
function parseEntityNumber(entity: EntityLike | undefined): number | null {
  if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') return null
  const val = parseFloat(String(entity.state))
  return Number.isFinite(val) ? val : null
}

/**
 * 计算数组的算术平均值。
 *
 * @param nums 数值数组
 * @returns 平均值；空数组返回 null
 */
function average(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * 将有限数值压入桶（跳过 null / 非有限值）。
 *
 * @param bucket 目标数值数组
 * @param value 待压入的值
 */
function pushIfNumber(bucket: number[], value: number | null) {
  if (value != null && Number.isFinite(value)) bucket.push(value)
}
/**
 * 从「环境与健康」sensorMap 绑定的实体收集读数（多房间取平均）。
 * 这是 IAQ 的首选数据源，与设置页配置对齐。
 *
 * @param entities 实体表（entity_id → entity）
 * @param sensorMap 房间传感器映射；为空或非对象时返回 null
 * @returns 各维度平均后的读数对象；所有维度均无数据时返回 null
 */
function collectEnvSensorDataFromMap(
  entities: Record<string, EntityLike | undefined>,
  sensorMap: EnvSensorMapLike | null | undefined,
): EnvSensorInput | null {
  if (!sensorMap || typeof sensorMap !== 'object') return null

  const pm25: number[] = []
  const co2: number[] = []
  const tvoc: number[] = []
  const temperature: number[] = []
  const humidity: number[] = []

  for (const entry of Object.values(sensorMap)) {
    if (!entry || entry._hidden) continue
    pushIfNumber(temperature, parseEntityNumber(entities[String(entry.temperature || '').trim()]))
    pushIfNumber(humidity, parseEntityNumber(entities[String(entry.humidity || '').trim()]))
    pushIfNumber(pm25, parseEntityNumber(entities[String(entry.pm25 || '').trim()]))
    pushIfNumber(co2, parseEntityNumber(entities[String(entry.co2 || '').trim()]))
    pushIfNumber(tvoc, parseEntityNumber(entities[String(entry.tvoc || '').trim()]))
  }

  const out: EnvSensorInput = {
    pm25: average(pm25),
    co2: average(co2),
    tvoc: average(tvoc),
    temperature: average(temperature),
    humidity: average(humidity),
  }

  if (
    out.pm25 == null &&
    out.co2 == null &&
    out.tvoc == null &&
    out.temperature == null &&
    out.humidity == null
  ) {
    return null
  }
  return out
}

/**
 * 判断实体是否疑似室外传感器（依据 entity_id 与显示名匹配室外关键词）。
 *
 * @param entityId 实体 id
 * @param entity 实体对象
 * @returns true 表示疑似室外实体（应从 IAQ 计算中排除）
 */
function isLikelyOutdoorEntity(entityId: string, entity: EntityLike): boolean {
  const hay = `${entityId} ${getEntityDisplayName(entityId, entity as HaEntityState)}`
  return OUTDOOR_HINT.test(hay)
}

/**
 * 基于 device_class / entity_id / 单位启发式推断传感器类型。
 *
 * @param entityId 实体 id
 * @param entity 实体对象
 * @returns 匹配到的 EnvSensorInput 键（pm25 / co2 / tvoc / temperature / humidity）；无匹配返回 null
 */
function matchHeuristicType(
  entityId: string,
  entity: EntityLike,
): keyof EnvSensorInput | null {
  const id = entityId.toLowerCase()
  const deviceClass = String(entity.attributes?.device_class || '').toLowerCase()
  const unit = String(entity.attributes?.unit_of_measurement || '').toLowerCase()

  if (deviceClass === 'pm25' || id.includes('pm25') || id.includes('pm2.5') || id.includes('pm_2_5'))
    return 'pm25'
  if (deviceClass === 'carbon_dioxide' || id.includes('co2') || id.includes('carbon_dioxide'))
    return 'co2'
  if (deviceClass === 'volatile_organic_compounds' || id.includes('tvoc')) return 'tvoc'
  if (
    deviceClass === 'temperature' ||
    id.includes('temperature') ||
    /(?:^|_)temp(?:$|_)/.test(id) ||
    unit === '°c' ||
    unit === '℃' ||
    unit === 'c' ||
    unit === '°f' ||
    unit === '℉'
  )
    return 'temperature'
  if (deviceClass === 'humidity' || id.includes('humidity') || unit.includes('%rh') || unit === '% rh')
    return 'humidity'
  return null
}

/**
 * 无 sensorMap 时的兜底扫描：优先 device_class，排除明显室外实体，避免「第一个 temperature」误伤。
 *
 * @param entities 实体表
 * @returns 各维度平均后的读数对象；所有维度均无数据时返回 null
 */
function collectEnvSensorDataHeuristic(
  entities: Record<string, EntityLike | undefined>,
): EnvSensorInput | null {
  const buckets: Record<keyof EnvSensorInput, number[]> = {
    pm25: [],
    co2: [],
    tvoc: [],
    temperature: [],
    humidity: [],
  }

  for (const [key, entity] of Object.entries(entities)) {
    if (!entity) continue
    if (isLikelyOutdoorEntity(key, entity)) continue
    const type = matchHeuristicType(key, entity)
    if (!type) continue
    const val = parseEntityNumber(entity)
    if (val == null) continue
    buckets[type].push(val)
  }

  const out: EnvSensorInput = {
    pm25: average(buckets.pm25),
    co2: average(buckets.co2),
    tvoc: average(buckets.tvoc),
    temperature: average(buckets.temperature),
    humidity: average(buckets.humidity),
  }

  if (
    out.pm25 == null &&
    out.co2 == null &&
    out.tvoc == null &&
    out.temperature == null &&
    out.humidity == null
  ) {
    return null
  }
  return out
}

/**
 * 收集 IAQ 输入：优先 sensorMap，否则启发式兜底。
 *
 * @param entities 实体表
 * @param sensorMap 可选的房间传感器映射
 * @returns 读数对象；两条路径均无数据时返回 null
 */
export function collectEnvSensorData(
  entities: Record<string, EntityLike | undefined>,
  sensorMap?: EnvSensorMapLike | null,
): EnvSensorInput | null {
  const fromMap = collectEnvSensorDataFromMap(entities, sensorMap)
  if (fromMap) return fromMap
  return collectEnvSensorDataHeuristic(entities)
}

/**
 * 与后端建议阈值对齐的原始读数告警。
 *
 * @param kind 传感器类型
 * @param raw 原始读数
 * @returns true 表示读数超阈值（pm25>35 / co2>800 / tvoc>400 / 温度偏离 22℃ 超过 3℃ / 湿度偏离 50% 超过 15%）
 */
function isEnvReadingWarn(kind: keyof EnvSensorInput, raw: number | null | undefined): boolean {
  if (raw == null || !Number.isFinite(raw)) return false
  if (kind === 'pm25') return raw > 35
  if (kind === 'co2') return raw > 800
  if (kind === 'tvoc') return raw > 400
  if (kind === 'temperature') return Math.abs(raw - 22) > 3
  if (kind === 'humidity') return Math.abs(raw - 50) > 15
  return false
}

/**
 * 将原始读数格式化为「数值 + 单位」三元组（value / valueNum / unit）。
 *
 * @param kind 传感器类型
 * @param raw 原始读数
 * @returns value=完整展示文本，valueNum=纯数值文本，unit=单位；无数据时 value / valueNum 为 '--'
 */
function formatEnvReadingParts(
  kind: keyof EnvSensorInput,
  raw: number | null | undefined,
): { value: string; valueNum: string; unit: string } {
  if (raw == null || !Number.isFinite(raw)) return { value: '--', valueNum: '--', unit: '' }
  if (kind === 'pm25') {
    const n = String(Math.round(raw))
    return { value: `${n} μg/m³`, valueNum: n, unit: 'μg/m³' }
  }
  if (kind === 'co2') {
    const n = String(Math.round(raw))
    return { value: `${n} ppm`, valueNum: n, unit: 'ppm' }
  }
  if (kind === 'tvoc') {
    const n = String(Math.round(raw))
    return { value: `${n} ppb`, valueNum: n, unit: 'ppb' }
  }
  if (kind === 'temperature') {
    const n = raw.toFixed(1)
    return { value: `${n} °C`, valueNum: n, unit: '°C' }
  }
  if (kind === 'humidity') {
    const n = String(Math.round(raw))
    return { value: `${n} %`, valueNum: n, unit: '%' }
  }
  const n = String(raw)
  return { value: n, valueNum: n, unit: '' }
}

/**
 * 总览卡指标：优先展示原始读数，告警与后端建议阈值一致
 *
 * @param result IAQ 计算结果（含 readings 与 scores）
 * @returns 5 个指标行（PM2.5 / CO₂ / TVOC / 温度 / 湿度），含标签 / 数值 / 单位 / 差度分 / 告警 / 空态
 */
export function buildEnvMetricDisplayItems(result: EnvIaqResult | null | undefined): EnvMetricDisplayItem[] {
  const readings = result?.readings || {}
  const scores = result?.scores || {}
  const rows: Array<{ kind: keyof EnvSensorInput; label: string; scoreKey: string }> = [
    { kind: 'pm25', label: 'PM2.5', scoreKey: 'pm25' },
    { kind: 'co2', label: 'CO₂', scoreKey: 'co2' },
    { kind: 'tvoc', label: 'TVOC', scoreKey: 'tvoc' },
    { kind: 'temperature', label: '温度', scoreKey: 'temp' },
    { kind: 'humidity', label: '湿度', scoreKey: 'humidity' },
  ]
  return rows.map(({ kind, label, scoreKey }) => {
    const raw = readings[kind]
    const empty = raw == null || !Number.isFinite(raw as number)
    const score = scores[scoreKey] != null ? Math.round(Number(scores[scoreKey])) : null
    const parts = formatEnvReadingParts(kind, raw as number | null | undefined)
    return {
      label,
      value: parts.value,
      valueNum: parts.valueNum,
      unit: parts.unit,
      score,
      warn: isEnvReadingWarn(kind, raw as number | null | undefined),
      empty,
    }
  })
}
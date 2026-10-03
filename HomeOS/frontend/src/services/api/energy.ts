/**
 * 能源模块 REST API 封装：趋势、排名、关联分析、预算与电价等接口。
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装能源趋势、排名、关联分析、预算、电价、节能等接口。
 * 依赖：../api-client 提供的 apiGet / apiPut / apiPost。
 * 端点范围：/energy/trend、/energy/ranking、/energy/solar、/energy/storage-dispatch、
 *           /energy/correlate、/energy/baseline、/energy/compare、/energy/circuit-breakdown、
 *           /energy/budget、/energy/pricing、/energy/savings、/energy/heal、
 *           /energy/usage/daily、/energy/usage/monthly、/system/external/electricity-price。
 */
import { apiGet, apiPut, apiPost } from '../api-client'

/**
 * 获取实体能耗趋势。
 * 对应后端 endpoint：GET /energy/trend
 * @param entityId 实体标识
 * @param hours 统计时长（小时），默认 24
 * @returns 趋势数据
 */
export function getEnergyTrend(entityId: string, hours = 24) {
  return apiGet('/energy/trend', { params: { entityId, hours } })
}

/**
 * 获取能耗排名。
 * 对应后端 endpoint：GET /energy/ranking
 * @returns 排名列表
 */
export function getEnergyRanking(limit = 10) {
  return apiGet('/energy/ranking', { params: { limit } })
}

/** 发电历史聚合点（按日/周） */
interface EnergySolarPoint {
  label: string
  value: number
}

/** 光伏/储能发电监控响应（GET /energy/solar） */
export interface EnergySolarPayload {
  configured: boolean
  message: string
  entities: {
    pvPowerEntityIds: string[]
    pvEnergyEntityIds: string[]
    batteryEntityId: string | null
    chargePowerEntityId: string | null
    gridExportEntityIds: string[]
    meterEntityId: string
  }
  /** 当前发电功率（W） */
  currentPowerW: number
  /** 日累计发电量（kWh） */
  todayGenerationKwh: number
  /** 储能电量百分比 SOC（%） */
  batterySoc: number | null
  /** 当前充电功率（W） */
  chargePowerW: number
  /** 日累计用电量（kWh，用于自消纳率简化计算） */
  todayUsageKwh: number
  /** 自消纳率（%） */
  selfConsumptionRate: number | null
  history: {
    /** 近 7 日发电量（kWh） */
    day: EnergySolarPoint[]
    /** 近 4 周发电量（kWh） */
    week: EnergySolarPoint[]
  }
  redisReady: boolean
}

/**
 * 获取光伏/储能发电监控数据。
 * 对应后端 endpoint：GET /energy/solar
 * @returns 发电-用电-充电三流数据 + 日/周聚合历史
 */
export function getEnergySolar() {
  return apiGet<EnergySolarPayload>('/energy/solar')
}

/** 储能峰谷调度状态（GET /energy/storage-dispatch） */
export interface EnergyStorageDispatchPayload {
  enabled: boolean
  timeOfUseEnabled: boolean
  batteryEntityId: string | null
  soc: number | null
  period: 'peak' | 'valley' | 'flat'
  chargeEntities: string[]
  dischargeEntities: string[]
  chargeSocTarget: number
  dischargeSocThreshold: number
  dischargeSocMin: number
  cooldownMin: number
  lastAction: 'charge' | 'discharge' | 'stop' | null
  lastActionReason: string
  lastActionAt: number
  actionCount: number
  lastDecision: 'charge' | 'discharge' | 'stop' | 'idle' | null
  lastDecisionReason: string
  cooldownRemainingSec: number
}

/**
 * 获取储能峰谷调度状态。
 * 对应后端 endpoint：GET /energy/storage-dispatch
 */
export function getEnergyStorageDispatch() {
  return apiGet<EnergyStorageDispatchPayload>('/energy/storage-dispatch')
}

/** EnergyStorageDispatchRunResult：类型定义，字段语义见声明。 */
export interface EnergyStorageDispatchRunResult {
  action?: string
  reason?: string
  message?: string
}

/**
 * 立即执行一次储能峰谷调度评估。
 * 对应后端 endpoint：POST /energy/storage-dispatch/run（admin）
 */
export function runEnergyStorageDispatch() {
  return apiPost<EnergyStorageDispatchRunResult>('/energy/storage-dispatch/run')
}

/**
 * 获取温度与功率关联分析。
 * 对应后端 endpoint：GET /energy/correlate
 * @param tempEntityId 温度实体标识
 * @param powerEntityIds 功率实体标识（单个或数组）
 * @returns 关联分析结果
 */
export function getEnergyCorrelate(tempEntityId: string, powerEntityIds: string | string[]) {
  const ids = Array.isArray(powerEntityIds) ? powerEntityIds.join(',') : powerEntityIds
  return apiGet('/energy/correlate', { params: { tempEntityId, powerEntityIds: ids } })
}

/**
 * 获取实体能耗基线。
 * 对应后端 endpoint：GET /energy/baseline
 * @param entityId 实体标识
 * @returns 基线数据
 */
export function getEnergyBaseline(entityId: string) {
  return apiGet('/energy/baseline', { params: { entityId } })
}

/**
 * 获取实体能耗对比。
 * 对应后端 endpoint：GET /energy/compare
 * @param entityId 实体标识
 * @returns 对比数据
 */
export function getEnergyCompare(entityId: string) {
  return apiGet('/energy/compare', { params: { entityId } })
}

/**
 * 获取已配置回路的能耗分项。
 * 对应后端 endpoint：GET /energy/circuit-breakdown/configured
 * @returns 回路分项数据
 */
export function getConfiguredCircuitBreakdown(hours = 24) {
  return apiGet('/energy/circuit-breakdown/configured', { params: { hours } })
}

/**
 * 自定义分路 map 试算。
 * 对应后端 endpoint：POST /energy/circuit-breakdown
 */
export function postCircuitBreakdown(
  circuitMap: Record<string, string[]>,
  hours = 24,
) {
  return apiPost('/energy/circuit-breakdown', { circuitMap, hours })
}

/**
 * 外部参考分时电价（峰谷平）。
 * 对应后端 endpoint：GET /system/external/electricity-price
 */
export function getExternalElectricityPrice() {
  return apiGet('/system/external/electricity-price')
}

/**
 * 获取能耗预算。
 * 对应后端 endpoint：GET /energy/budget
 * @returns 预算配置
 */
export function getEnergyBudget() {
  return apiGet('/energy/budget')
}

/**
 * 更新能耗预算。
 * 对应后端 endpoint：PUT /energy/budget
 * @param payload 预算配置
 * @returns 操作结果
 */
export function updateEnergyBudget(payload: Record<string, unknown>) {
  return apiPut('/energy/budget', payload)
}

/**
 * 获取电价配置。
 * 对应后端 endpoint：GET /energy/pricing
 * @returns 电价信息
 */
export function getEnergyPricing() {
  return apiGet('/energy/pricing')
}

/**
 * 获取节能数据。
 * 对应后端 endpoint：GET /energy/savings
 * @returns 节能统计
 */
export function getEnergySavings() {
  return apiGet('/energy/savings')
}

/**
 * 更新电价配置。
 * 对应后端 endpoint：PUT /energy/pricing
 * @param payload 电价配置
 * @returns 操作结果
 */
export function updateEnergyPricing(payload: Record<string, unknown>) {
  return apiPut('/energy/pricing', payload)
}

/** 能源时间线自愈回填结果 */
export interface EnergyHealResult {
  entityId: string
  hours: number
  written: number
  redisReady: boolean
  method: 'ha_history' | 'unavailable' | string
  message?: string
}

/**
 * 从 HA 历史回填 Redis 功率时间线。
 * 对应后端 endpoint：POST /energy/heal
 */
export function postEnergyHeal(entityId: string, hours = 24) {
  return apiPost<EnergyHealResult>('/energy/heal', { entityId, hours })
}

/** 能耗日聚合响应（GET /energy/usage/daily，无 Redis 回退） */
export interface EnergyUsageDailyPayload {
  points: Array<{ day: string; ele: number }>
  meta?: { source?: string }
}

/** 能耗月聚合响应（GET /energy/usage/monthly，无 Redis 回退） */
export interface EnergyUsageMonthlyPayload {
  points: Array<{ month: string; ele: number }>
  meta?: { source?: string }
}

/**
 * 获取能耗日用量聚合（近 N 日，由 EnergyUsageDaily 聚合表供给，无 Redis 也可用）。
 * 对应后端 endpoint：GET /energy/usage/daily
 * @param entityId 计量实体标识
 * @param days 窗口天数（1-62），默认 30
 * @returns 日用量点数组（缺失日期已补 0）
 */
export async function getEnergyUsageDaily(
  entityId: string,
  days = 30,
): Promise<EnergyUsageDailyPayload> {
  const res = await apiGet<EnergyUsageDailyPayload>('/energy/usage/daily', {
    params: { entityId, days },
  })
  return res.data
}

/**
 * 获取能耗月用量聚合（近 N 月，由 EnergyUsageMonthly 聚合表供给，无 Redis 也可用）。
 * 对应后端 endpoint：GET /energy/usage/monthly
 * @param entityId 计量实体标识
 * @param months 窗口月数（1-24），默认 12
 * @returns 月用量点数组（缺失月份已补 0）
 */
export async function getEnergyUsageMonthly(
  entityId: string,
  months = 12,
): Promise<EnergyUsageMonthlyPayload> {
  const res = await apiGet<EnergyUsageMonthlyPayload>('/energy/usage/monthly', {
    params: { entityId, months },
  })
  return res.data
}

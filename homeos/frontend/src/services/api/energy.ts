/** 能耗历史与报表 API。 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet } from './client'

/** 能耗历史窗口：W=近 7 天，M=近 30 天，Y=近 12 个月。 */
export type EnergyHistoryRange = 'W' | 'M' | 'Y'

export interface EnergyHistoryPoint {
  /** 日期 `YYYY-MM-DD`（Y 窗口为 `YYYY-MM`） */
  date: string
  /** 图表短标签（`1/21` 或 `1月`） */
  label: string
  /** 用电量（单位见 `EnergyHistoryResult.unit`） */
  value: number
  /** 该点费用（元）；阶梯口径的日曲线无法逐日计价时为 null */
  cost?: number | null
}

export interface EnergyHistoryResult {
  range: EnergyHistoryRange
  /** 用能单位：电为 kWh，燃气/水为 m³ */
  unit: string
  total: number
  /** daily=读日表，monthly=读月表，daily 兜底或 empty=无数据 */
  source: 'daily' | 'monthly' | 'empty'
  series: EnergyHistoryPoint[]
  /** 窗口内费用（元）；非电或阶梯日曲线时为 null */
  cost?: number | null
  costCurrency?: string
  /**
   * 费用是否为估算值。
   *
   * 峰谷电价需要小时级用量才能精算，而库里的聚合是**日**粒度 —— 峰谷模式下后端按
   * 当日峰/谷/平段时长占比拆分，因此恒为 true。界面必须据此标注「估算」，
   * 不能把它展示成账单金额。
   */
  costEstimated?: boolean
}

/**
 * 查询能耗历史（服务端日/月聚合表）。
 *
 * 与客户端按实体属性折算的区别：这里能拿到 SGCC 30 天日列表落库后的账户级总量，
 * 不依赖前端是否挂载对应实体。
 */
export function getEnergyHistory(range: EnergyHistoryRange = 'W', entityIds?: string[], config?: AxiosRequestConfig) {
  return apiGet<EnergyHistoryResult>('/events/reports/energy/history', {
    params: {
      range,
      ...(entityIds?.length ? { entity_ids: entityIds.join(',') } : {}),
    },
    dedupe: false,
    ...config,
  })
}

export interface EnergyCircuitItem {
  entityId: string
  /** 窗口内用量（单位见 unit） */
  value: number
  /** 占总量比例（0–1） */
  share: number
}

export interface EnergyCircuitResult {
  range: EnergyHistoryRange
  unit: string
  total: number
  items: EnergyCircuitItem[]
  source: 'daily' | 'empty'
}

/**
 * 分回路用电排行（``energy.circuitEntityIds`` 的实际消费方）。
 *
 * 未配置回路时返回空排行，不是错误 —— 「没配回路」是正常状态。
 */
export function getEnergyCircuits(range: EnergyHistoryRange = 'M', entityIds?: string[], config?: AxiosRequestConfig) {
  return apiGet<EnergyCircuitResult>('/events/reports/energy/circuits', {
    params: {
      range,
      ...(entityIds?.length ? { entity_ids: entityIds.join(',') } : {}),
    },
    dedupe: false,
    ...config,
  })
}

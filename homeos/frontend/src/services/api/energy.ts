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
  /** 用电量（kWh） */
  value: number
}

export interface EnergyHistoryResult {
  range: EnergyHistoryRange
  unit: string
  total: number
  /** daily=读日表，monthly=读月表，daily 兜底或 empty=无数据 */
  source: 'daily' | 'monthly' | 'empty'
  series: EnergyHistoryPoint[]
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

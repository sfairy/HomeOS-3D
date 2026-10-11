/**
 * 设备列表与分析相关类型。
 * 依赖：@homeos/shared（EntityAreaInfo 实体所属区域信息）。
 */
import type { EntityAreaInfo } from '@homeos/shared'

/** 设备列表项（设备页展示用） */
export interface DeviceListItem {
  entity_id: string // 实体 ID
  domain: string // 实体域（如 light / switch / sensor）
  name: string // 设备展示名称
  state: string // 当前状态值
  area: EntityAreaInfo | null // 所属区域信息
  unavailable: boolean // 是否不可用
  toggleable: boolean // 是否可开关切换
  controllable: boolean // 是否可控
  batteryLevel: number | null // 电池电量（百分比，无电池时为 null）
  lastChanged: string | undefined // 最近状态变化时间（ISO 字符串）
}

/** 设备列表筛选状态 */
export interface DeviceFilterState {
  status: 'all' | 'online' | 'offline' | 'low-battery' // 状态筛选：all=全部，online=在线，offline=离线，low-battery=低电量
  room: string // 房间筛选
  sort: 'name-asc' | 'name-desc' | 'status' | 'last-changed' // 排序方式：name-asc=名称升序，name-desc=名称降序，status=按状态，last-changed=按最近变化
  controllableOnly: boolean // 是否仅展示可控设备
}

/** 单日设备使用统计 */
interface DeviceUsageDaily {
  day: string // 日期（YYYY-MM-DD）
  onCount: number // 当日开启次数
  totalRuntimeMs: number // 当日总运行时长（毫秒）
  lastOn: string | null // 当日最近一次开启时间（ISO 字符串）
}

/** 设备使用统计汇总 */
interface DeviceUsageSummary {
  onCount: number // 总开启次数
  totalRuntimeMs: number // 总运行时长（毫秒）
  avgDaily: number // 日均开启次数
}

/** 设备使用报告（含每日明细与汇总） */
export interface DeviceUsageReport {
  daily: DeviceUsageDaily[] // 每日统计列表
  summary: DeviceUsageSummary // 汇总信息
}

/** 设备使用排行条目 */
interface DeviceUsageTopEntry {
  entityId: string // 实体 ID
  onCount: number // 开启次数
  totalRuntimeMs: number // 总运行时长（毫秒）
}

/** 每日设备总量统计 */
interface DeviceDailyTotal {
  day: string // 日期（YYYY-MM-DD）
  onCount: number // 当日开启次数
  totalRuntimeMs: number // 当日总运行时长（毫秒）
}

/** 按域分组的设备统计 */
interface DeviceDomainBreakdown {
  domain: string // 实体域
  onCount: number // 该域设备总开启次数
  totalRuntimeMs: number // 该域设备总运行时长（毫秒）
  deviceCount: number // 该域设备数量
}

/** 设备异常提示 */
interface DeviceAnomalyHint {
  entityId: string // 实体 ID
  type: 'spike' | 'forgotten' | 'unused' // 异常类型：spike=使用激增，forgotten=疑似遗忘关闭，unused=长期未使用
  message: string // 异常描述文案
}

/** 排行设备每日明细 */
interface DeviceTopDeviceDaily {
  entityId: string // 实体 ID
  daily: Array<{ day: string; onCount: number }> // 每日开启次数列表
}

/** 设备分析汇总（含排行、每日总量、域分布与异常提示） */
export interface DeviceAnalyticsSummary {
  topDevices: DeviceUsageTopEntry[] // 使用频率排行
  totalDevices: number // 设备总数
  days: number // 统计天数
  dailyTotals: DeviceDailyTotal[] // 每日总量列表
  domainBreakdown: DeviceDomainBreakdown[] // 按域分组统计
  anomalyHints: DeviceAnomalyHint[] // 异常提示列表
  topDeviceDaily?: DeviceTopDeviceDaily[] // 排行设备每日明细（可选）
}

/** 事件日志统计 */
export interface EventLogStats {
  total: number // 事件总数
  byDomain: Record<string, number> // 按域分组的事件计数
  topEntities: Array<{ entityId: string; count: number }> // 事件最多的实体列表
}
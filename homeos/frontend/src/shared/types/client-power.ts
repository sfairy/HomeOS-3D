/**
 * 客户端智能充放电配置类型。
 * 核心契约（ClientPowerClient / ClientPowerSelfCharge / ClientPowerSettings）由
 * @homeos/shared 统一维护（与 backend app-config clientPower 分区对齐），
 * 本文件仅补充前端状态快照相关类型。
 */
import type {
  ClientPowerClient,
  ClientPowerSettings,
} from '@homeos/shared'

export type { ClientPowerClient, ClientPowerSettings }

/** 待确认的客户端（已上报但未配置） */
export interface ClientPowerPendingClient {
  clientId: string // 客户端唯一 ID
  firstSeenAt?: string // 首次上报时间（ISO 字符串）
  lastReportAt?: string // 最近上报时间（ISO 字符串）
  systemInfo?: unknown // 客户端系统信息（透传）
}

/** 客户端智能充放电状态快照（供 UI 展示当前运行态） */
export interface ClientPowerStatusSnapshot {
  enabled: boolean // 全局开关
  clients: unknown[] // 在线客户端状态列表（透传）
  pending: ClientPowerPendingClient[] // 待确认客户端列表
  configuredClients: Omit<ClientPowerClient, 'reportToken'>[] // 已配置客户端（不含上报密钥）
}

/**
 * 共享类型与 Home Assistant 事件名称常量：跨模块引用的 HA 事件总线命名空间与连接快照。
 *
 * 所属模块：shared（modules/* 与 common/* 共享依赖）。
 * 核心职责：
 *  - 导出 HA_EVENTS 常量对象：STATE_CHANGED 系列 / INITIAL_STATES / 连接生命周期 / REDIS_STATUS / AUTOMATION_TRIGGERED；
 *  - HaConnectionStatus：HA 连接健康快照，用于健康检查与 UI 状态面板；
 *  - HaAutomationTriggeredEvent：HA 侧 automation.triggered 回调，回读 runOnHa 自动化的执行来源。
 * 注意：HA_EVENTS 目录中 bridged:true 的事件会被 shared/homeos-events 选中做跨副本桥接。
 */
import type {
  HaEntity,
  HaStateChangeEvent,
  HaStateChangeBatchEvent,
  WsHaStatusPayload,
} from '@homeos/shared';

export type { HaEntity, HaStateChangeEvent, HaStateChangeBatchEvent, WsHaStatusPayload };

/** HA 事件总线命名空间常量（供 EventEmitter 统一管理 HA 连接生命周期事件） */
export const HA_EVENTS = {
  STATE_CHANGED: 'ha.state_changed', // 实体状态变更事件
  /** Ingress 合并窗口 flush：批量状态变更（Hot Path 单次处理） */
  STATE_CHANGED_BATCH: 'ha.state_changed.batch',
  /** Cold Path 小批次一次派发（消费者 for 循环，降低 EventEmitter 扇出） */
  STATE_CHANGED_COLD_BATCH: 'ha.state_changed.cold.batch',
  INITIAL_STATES: 'ha.initial_states', // 初始全量状态同步事件
  CONNECTED: 'ha.connected', // HA 连接成功事件
  DISCONNECTED: 'ha.disconnected', // HA 连接断开事件
  RECONNECTING: 'ha.reconnecting', // HA 重连中事件
  QUEUE_DROPPED: 'ha.queue_dropped', // HA 离线命令队列丢弃
  REDIS_STATUS: 'redis.status',
  /** HA 自动化被触发执行事件（回读 runOnHa 自动化执行结果；仅在 HA WS Leader 收到，非 Redis 桥接） */
  AUTOMATION_TRIGGERED: 'ha.automation.triggered',
} as const;

/** HA 连接健康状态快照：供健康检查与 UI 状态面板使用 */
export interface HaConnectionStatus {
  connected: boolean; // 当前是否已连接
  ha_url: string; // HA 服务的 URL 地址
  ha_version?: string; // HA 版本号
  last_connected_at?: string; // 上次成功连接时间
  reconnect_count: number; // 累计重连次数
  ha_ws_leader?: boolean; // 本实例是否为 HA WebSocket leader
  ha_ws_mode?: 'standalone' | 'leader' | 'follower';
  queue_length?: number;
  queue_dropped_total?: number;
  dropped_commands?: Array<{
    domain: string;
    service: string;
    entityId: string;
    reason: 'ttl' | 'full' | 'restart';
    at: number;
  }>;
}

/** HA 连接成功事件载荷 */
export interface HaConnectedEvent {
  ha_version: string; // HA 版本号
  ha_url: string; // HA 服务 URL
}

/** HA 重连尝试事件载荷 */
export interface HaReconnectingEvent {
  attempt: number; // 当前重连尝试次数
  delay: number; // 下次重连的延迟时间（毫秒）
}

/** HA automation.triggered 事件载荷：用于回读 runOnHa 自动化的执行结果 */
export interface HaAutomationTriggeredEvent {
  /** 自动化名称（HA 侧展示名，可能与 HomeOS 本地 name 一致） */
  name?: string;
  /** 自动化实体 ID（形如 automation.homeos_xxx，对应本地 Automation.haConfigId） */
  entity_id?: string;
  /** 触发来源（如 state / time / event / manual / homeassistant 等） */
  source?: string;
  /** 触发器描述（HA 为字符串或对象，含触发详情） */
  trigger?: unknown;
  /** 事件触发时间（ISO 字符串） */
  time_fired?: string;
}

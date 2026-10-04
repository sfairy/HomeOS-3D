/**
 * @file client-events.ts
 * @module @homeos/shared/ws
 * @brief Socket.IO 客户端线协议事件名与核心 payload（前后端共用）。
 *
 * 职责：
 *  - 收敛所有下发到前端（App / Web / 客户端）的 WS 事件名常量（WS_CLIENT_EVENTS）；
 *  - 定义 HA 连接状态与实体增量推送的 payload 结构。
 *
 * 关键依赖：
 *  - 后端 Socket 网关按本表 emit 事件；
 *  - 前端订阅按本表常量匹配事件名。
 *
 * 约定：
 *  - 与 Nest/Redis 进程内 HOMEOS_EVENTS 命名空间分离，本表仅对外；
 *  - 事件名采用 snake_case，分组仅供阅读，不参与运行时分组逻辑。
 */

export const WS_CLIENT_EVENTS = {
  // 语义分组（仅注释，不改顺序）：HA 连接健康 / 实体同步 / 通知语音 /
  // 模式自动化 / 安防 / 人员在场 / 能耗·AI·地震
  HA_STATUS: 'ha_status', // [HA连接] HA 连接状态变更
  HA_QUEUE_DROPPED: 'ha_queue_dropped', // [HA连接] 队列丢弃告警
  INITIAL_STATES: 'initial_states', // [实体同步] 初始全量状态（兼容旧版入口）
  INITIAL_STATES_BEGIN: 'initial_states_begin', // [实体同步] 全量分片开始
  INITIAL_STATES_CHUNK: 'initial_states_chunk', // [实体同步] 全量分片数据块
  INITIAL_STATES_END: 'initial_states_end', // [实体同步] 全量分片结束
  STATE_CHANGED_BATCH: 'state_changed_batch', // [实体同步] 增量状态批量推送
  STATE_REPLAY: 'state_replay', // [实体同步] 状态重放
  SYNC_ERROR: 'sync_error', // [HA连接] 同步错误
  RESYNC_SUGGESTED: 'resync_suggested', // [HA连接] 建议重新同步
  ENTITIES_STALE: 'entities_stale', // [实体同步] 实体状态过期
  NOTIFICATION: 'notification', // [通知语音] 站内通知
  HOME_MODE: 'home_mode', // [模式自动化] 家庭模式变更
  CHILD_MODE: 'child_mode', // [模式自动化] 儿童模式变更
  AUTOMATION_EXECUTED: 'automation_executed', // [模式自动化] 自动化执行结果
  SECURITY_MODE: 'security_mode', // [安防] 布防模式变更
  SECURITY_ZONES: 'security_zones', // [安防] 安防区域状态
  SECURITY_ALARM: 'security_alarm', // [安防] 安防告警
  SECURITY_EMERGENCY: 'security_emergency', // [安防] 紧急求助触发
  SECURITY_EMERGENCY_COMPLETED: 'security_emergency_completed', // [安防] 紧急求助结束
  PRESENCE_CHANGED: 'presence_changed', // [人员在场] 人员状态变更
  PRESENCE_ALL_LEFT: 'presence_all_left', // [人员在场] 全员离家
  ENERGY_ANOMALY: 'energy_anomaly', // [能耗] 能耗异常
  FRIGATE_DETECTION: 'frigate_detection', // [AI检测] Frigate 检测事件
  TTS_SPEAK: 'tts_speak', // [通知语音] TTS 播报
  ROOM_PRESENCE: 'room_presence', // [人员在场] 房间级在场
  EARTHQUAKE_ALERT: 'earthquake_alert', // [地震] 地震早期预警推送（全屏）
  EARTHQUAKE_CONFIRMATION: 'earthquake_confirmation', // [地震] 台网核定速报 / 迟到确认（公报弹层）
  REDIS_STATUS: 'redis_status', // [HA连接] Redis 连接状态
} as const;

/**
 * 前端 WS 客户端事件名字面量联合：从 WS_CLIENT_EVENTS 常量提取所有 string value 的类型联合，供事件回调/emit 入参类型收窄。
 */
export type WsClientEventName = (typeof WS_CLIENT_EVENTS)[keyof typeof WS_CLIENT_EVENTS];

/**
 * HA 网关连接健康状态字面量联合：connected（在线）/ disconnected（离线）/ reconnecting（重连中）。
 * 与 ha_status 事件 payload.status 字段一一对应，前端据此渲染连接指示灯。
 */
export type WsHaConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

/**
 * ha_status 事件的 payload（HA 连接健康广播）。
 * 前端据此更新状态栏图标、显示重连尝试次数与下次重连延迟，并记录时间戳。
 */
export interface WsHaStatusPayload {
  type: 'ha_status';                   /** 事件类型标志，用于 WS 消息分发型校验 */
  status: WsHaConnectionStatus;        /** 当前连接状态（核心字段） */
  ha_version?: string;                 /** 连接上的 HA 版本号（成功时回传） */
  attempt?: number;                    /** 本轮已重连次数；首次可 undefined */
  delay?: number;                      /** 下次重连前的等待毫秒数；connected 时可省略 */
  timestamp: string;                   /** ISO 时间字符串（服务端生成，便于前端时间线排序） */
}

/** 增量状态推送中的实体快照（可带 _delta 压缩字段） */
export interface WsEntityStatePayload {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  _delta?: boolean;
  changed_attributes?: string[];
}

/**
 * state_changed_batch 事件 payload：实体状态增量批量推送（前端合并进本地 stateMap cache）。
 * _delta 压缩模式下 changed_attributes 列出变动字段名，客户端可只 patch 对应 attributes。
 */
export interface WsStateChangedBatchPayload {
  type?: 'state_changed_batch';       /** 事件类型守卫（某些旧网关可能省略） */
  changes: WsEntityStatePayload[];    /** 本次批量推送的实体快照数组（至少 1 条） */
  timestamp?: string;                 /** 服务端发送时间（可选；缺省由客户端记录接收时间） */
}

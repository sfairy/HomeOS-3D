/** Home Assistant 实体与状态变更核心形状（前后端线协议共用） */

/**
 * HA 实体状态最小形状。
 * 与 HA /api/states 返回的结构子集对齐，仅保留 HomeOS 所需字段。
 */
export interface HaEntity {
  /** 实体 ID，格式 "<domain>.<object_id>" */
  entity_id: string;
  /** 实体状态（HA 约定始终为字符串，如 "on" / "off" / "23.5"） */
  state: string;
  /** 实体属性（HA attributes 对象，结构因 domain 而异） */
  attributes?: Record<string, unknown>;
  /** 状态最近一次变更时间（ISO 8601 字符串） */
  last_changed?: string;
  /** 状态最近一次更新时间（ISO 8601 字符串，含属性变更） */
  last_updated?: string;
}

/**
 * 单条状态变更事件（对应 HA WS event "state_changed"）。
 */
export interface HaStateChangeEvent {
  /** 发生状态变更的 entity_id */
  entity_id: string;
  /** 变更前状态（实体刚创建时为 null） */
  old_state: HaEntity | null;
  /** 变更后状态（实体被删除时为 null） */
  new_state: HaEntity | null;
  /** 变更发生时间（ISO 8601 字符串，由网关补充） */
  changed_at: string;
  /** HomeOS 入站时刻（epoch ms），用于管线 E2E 延迟；可选 */
  pipeline_ts?: number;
}

/**
 * 批量状态变更事件（网关聚合多条变更后一次性推送，减少 WS 消息数）。
 */
export interface HaStateChangeBatchEvent {
  /** 本批次包含的状态变更列表 */
  changes: HaStateChangeEvent[];
}
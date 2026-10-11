/**
 * 家庭模式触发日志条目类型（前后端契约）。
 *
 * 职责：
 *  - 定义"某次家庭模式被触发"的日志结构，前后端按此对齐字段语义。
 *  - 收敛 source 枚举，避免各端自行扩展导致列表标签漂移。
 *
 * 关键依赖：
 *  - 后端 home-mode-log 写入器按本类型落库；
 *  - 前端列表 / 详情 / 分析页消费 HomeModeTriggerLogEntry。
 *
 * 约定：
 *  - source 以后端写入为准；前端推荐 / 分析可用 Partial 形态的 LogLike；
 *  - success 缺省视为成功（向后兼容旧日志）；
 *  - executedAt 为 ISO 字符串，前端按本地时区渲染。
 */

/**
 * 家庭模式触发来源枚举。
 * 与 HOME_MODE_LOG_SOURCE_LABELS 一一对应：
 *  - manual / voice / agent：用户侧主动触发
 *  - trigger / automation / time / calendar：规则类触发
 *  - security / weather_linkage / energy_linkage：跨模块联动
 *  - advisor：智能顾问建议触发
 *  - presence / everyone_left / entity：基于实体状态判定
 *  - deactivate：模式被停用（非典型"切换"语义）
 */
export type HomeModeTriggerLogSource =
  | 'manual'
  | 'trigger'
  | 'calendar'
  | 'deactivate'
  | 'security'
  | 'energy_linkage'
  | 'weather_linkage'
  | 'advisor'
  | 'agent'
  | 'presence'
  | 'voice'
  | 'automation'
  | 'entity'
  | 'everyone_left'
  | 'time';

/**
 * 单条家庭模式触发日志（后端落库 / 前端展示统一形态）。
 */
export interface HomeModeTriggerLogEntry {
  /** 日志主键（后端生成，前端仅用于防重） */
  id: string
  /** 被触发的家庭模式 ID */
  modeId: string
  /** 被触发的家庭模式名称（快照，避免模式重命名后历史日志失语义） */
  modeName: string
  /** 触发来源（与 HomeModeTriggerLogSource 对齐） */
  source: HomeModeTriggerLogSource
  /** 触发原因文案 / 英文 key（前端用 HOME_MODE_LOG_REASON_LABELS 渲染） */
  reason: string
  /** 是否执行成功；缺省视为成功（兼容历史数据） */
  success?: boolean
  /** 执行时间 ISO 字符串（前端按本地时区渲染） */
  executedAt: string
}

/**
 * 前端推荐 / 洞察等宽松输入形态。
 * - 字段全部可选；
 * - source / reason 放宽为 string，允许 API 漂移期消费未登记的来源 key。
 */
export type HomeModeTriggerLogLike = Omit<Partial<HomeModeTriggerLogEntry>, 'source' | 'reason'> & {
  source?: string
  reason?: string
}

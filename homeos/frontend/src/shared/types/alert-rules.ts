/**
 * 应用内告警规则与条件编辑器类型。
 * 依赖：@homeos/shared（AlertLevel 告警级别枚举、AlertRule 规则契约）。
 */
import type { AlertLevel, AlertRule } from '@homeos/shared'

export type { AlertLevel }

/** 收件箱告警规则（持久化结构，契约由 @homeos/shared AlertRule 统一维护） */
export type { AlertRule as InboxAlertRule }

/** 条件编辑模式：visual=可视化，compound=复合条件，raw=原始表达式 */
export type ConditionMode = 'visual' | 'compound' | 'raw'

/** 子条件类型：state=状态比较，contains=包含判断，numeric=数值比较，attr=属性判断 */
type ClauseCondType = 'state' | 'contains' | 'numeric' | 'attr'

/** 复合条件中的单个子句 */
export interface ConditionClause {
  join?: '&&' | '||' | string // 与前一个子句的逻辑连接（且 / 或）
  condType: ClauseCondType | string // 子条件类型
  condAttr: string // 判断的属性名（state 时为 state）
  condOp: string // 比较操作符（如 ==、>、contains）
  condValue: string // 比较目标值
}

/** 告警规则编辑表单（前端编辑态，扩展 AlertRule 契约） */
export interface AlertRuleEditForm extends AlertRule {
  conditionMode: ConditionMode // 当前条件编辑模式
  condType: ClauseCondType | string // 单条件模式下的子条件类型
  condOp: string // 单条件模式下的操作符
  condValue: string // 单条件模式下的目标值
  condAttr: string // 单条件模式下的属性名
  clauses: ConditionClause[] // 复合模式下的子条件列表
}

/** 通知设置解析结果（从系统配置解析） */
export interface NotificationSettingsParsed {
  globalNotifyEnabled: boolean // 全局通知开关
  importantNotifyEnabled: boolean // 非紧急告警开关（不影响 SOS/安防/EEW 等生命安全通知）
  offlineNotifyEnabled: boolean // 设备离线通知开关
  lowBatteryNotifyEnabled: boolean // 低电量通知开关
  dndStart: number // 免打扰开始时间（小时，0-23）
  dndEnd: number // 免打扰结束时间（小时，0-23）
  dndActive: boolean // 当前是否处于免打扰时段
}

/** 免打扰预设（供用户快速选择） */
export interface DndPreset {
  id: string // 预设 ID
  label: string // 预设展示名称
  start: number // 开始时间（小时，0-23）
  end: number // 结束时间（小时，0-23）
}

/** 语音告警快照（编辑器读取/回显用） */
export interface VoiceAlertsSnapshot {
  voice: unknown // 原始 voice 分区配置（透传）
  ttsMediaPlayerId: string // TTS 播放器实体 ID
  speakCooldownMin: number // 语音播报冷却时间（分钟）
  builtinStyleState: Record<string, unknown> // 内置告警样式的当前状态
}
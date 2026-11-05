/**
 * 首装向导 API 响应与门铃配置类型。
 * 用于首装向导流程的状态查询与门铃设备配置。
 */
import type { EnergyMeterGrain, EnergyMeterScope } from '@homeos/shared'

/** 电量统计粒度：日 / 月 / 年（能源页三档曲线）—— 与 shared 同源 */
export type { EnergyMeterGrain }

/** 首装向导步骤 ID：connection=连接，security=安防，energy=能耗，environment=环境，dashboard=户型/收藏（可选），complete=完成 */
export type SetupWizardStepId = 'connection' | 'security' | 'energy' | 'environment' | 'dashboard' | 'complete'

/** 单步状态 */
interface SetupWizardStepStatus {
  done: boolean // 是否已完成
  hint?: string // 步骤提示文案
}

/** 能源绑定现状（后端算好的口径与粒度覆盖，前端只展示不猜规则） */
interface SetupWizardEnergyBinding {
  meterEntityId: string
  meterScope: EnergyMeterScope
  scopeResetLabel: string
  directGrains: EnergyMeterGrain[]
  grains: Record<EnergyMeterGrain, { available: boolean; source: 'meter' | 'aux' | 'derived' }>
  mainPowerEntityId: string
  monthMeterEntityId: string
  dayMeterEntityId: string
  circuitCount: number
  hasRealtimePower: boolean
  advice: string | null
}

/** 首装向导整体状态 */
export interface SetupWizardStatus {
  steps: Record<SetupWizardStepId, SetupWizardStepStatus> // 各步骤状态
  progress: number // 整体进度（0-100）
  ha: { connected: boolean; entityCount: number } // HA 连接状态与实体数
  retentionDays: number // 事件日志保留天数
  circuitCount: number // 已配置电路数
  learningPeriodDays: number // 能耗学习周期天数
  learningStartedAt: string | null // 学习开始时间（ISO 字符串，null=未开始）
  energy?: SetupWizardEnergyBinding // 能源绑定明细（旧后端可能不返回）
}

/** 能源绑定实体类型：energy=累计电量（kWh/Wh）/ power=瞬时功率（W）/ other=其它 */
export type EnergyEntityKind = 'energy' | 'power' | 'other'

/** 实体类型描述（由后端 attributes 判定，供能源绑定给出即时反馈） */
interface EntityTypeInfo {
  kind: EnergyEntityKind
  deviceClass: string
  unit: string
  /** 后端按 entity_id / friendly_name 猜的统计口径（可被用户改写） */
  suggestedScope?: EnergyMeterScope
}

/** 实体校验结果 */
export interface EntityValidateResult {
  valid: string[] // 有效的实体 ID 列表
  missing: string[] // 缺失的实体 ID 列表
  allOk: boolean // 是否全部有效
  empty?: boolean // 输入是否为空
  entities?: Record<string, EntityTypeInfo> // 实体 ID → 类型描述（能源绑定时使用）
}

/** 在家成员信息 */
export interface PresenceMember {
  atHome?: boolean // 是否在家
  [key: string]: unknown // 其它扩展字段
}

/** 在家状态查询响应 */
export interface PresenceHomeResponse {
  anyoneHome?: boolean // 是否有人在家
  atHomeCount?: number // 在家人数
  members?: PresenceMember[] // 成员列表
  autoMode?: boolean // 是否自动模式
  persons?: unknown[] // 人员列表（透传）
  entityIds?: string[] // 关联实体 ID 列表
}

/** 门铃配置 */
export interface DoorbellConfig {
  id: string // 门铃唯一 ID
  label: string // 门铃展示名称
  triggerEntityId: string // 触发实体 ID（按钮/传感器）
  cameraEntityId: string // 摄像头实体 ID
  lockEntityId: string // 门锁实体 ID
}

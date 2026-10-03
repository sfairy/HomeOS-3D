/**
 * 数据保留策略覆盖的业务表清单
 *
 * 所属模块：backend/src/common/database
 * 职责：集中定义 DatabaseRetentionService 清理步骤所覆盖的各表元数据
 *   （配置键 / 物理表名 / 中文显示名），供 retention 配置分区默认值、
 *   配置校验与「数据保留」设置面板共用，避免多处维护同一份表清单。
 * 依赖：无（纯常量/类型模块，供 app-config 与 retention.service 引用，无循环依赖）
 */

/** retention 配置分区与清理步骤共用的表键（与 DatabaseRetentionService 清理步骤一一对应） */
export const RETENTION_TABLE_KEYS = [
  'eventLog',
  'sceneExecution',
  'automationExecution',
  'scriptExecution',
  'commandAudit',
  'notification',
  'securityEvent',
  'environmentRecord',
  'waterRecord',
  'advisorCooldown',
  'loginAudit',
] as const;

/**
 * RetentionTableKey：业务类型别名。
 * - 表示：common/database/retention-tables.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type RetentionTableKey = (typeof RETENTION_TABLE_KEYS)[number];

/** retention 配置分区结构：表键 → 保留天数 */
export type RetentionConfig = Record<RetentionTableKey, number>;

/** 物理表名（未配置 @@map 时 Prisma 模型名即表名，如 "EventLog"） */
export const RETENTION_TABLE_NAMES: Record<RetentionTableKey, string> = {
  eventLog: 'EventLog',
  sceneExecution: 'SceneExecution',
  automationExecution: 'AutomationExecution',
  scriptExecution: 'ScriptExecution',
  commandAudit: 'CommandAudit',
  notification: 'Notification',
  securityEvent: 'SecurityEvent',
  environmentRecord: 'EnvironmentRecord',
  waterRecord: 'WaterRecord',
  advisorCooldown: 'AdvisorCooldown',
  loginAudit: 'LoginAudit',
};

/** 中文显示名（供设置面板展示） */
export const RETENTION_TABLE_LABELS: Record<RetentionTableKey, string> = {
  eventLog: '事件日志',
  sceneExecution: '场景执行',
  automationExecution: '自动化执行',
  scriptExecution: '脚本执行',
  commandAudit: '命令审计',
  notification: '通知记录（按天数；条数上限另见 maxNotifications）',
  securityEvent: '安防事件',
  environmentRecord: '环境记录',
  waterRecord: '用水记录',
  advisorCooldown: '顾问冷却',
  loginAudit: '登录审计',
};

/** 默认保留天数（与 retention.* / 遗留 other.eventlogRetentionDays 默认一致） */
export const RETENTION_DEFAULT_DAYS = 7;

/** 保留天数合法区间 */
export const RETENTION_DAYS_MIN = 1;
/**
 * RETENTION_DAYS_MAX：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const RETENTION_DAYS_MAX = 365;

/**
 * 数据保留策略覆盖的业务表清单
 *
 * 职责：集中定义 DatabaseRetentionService 清理步骤所覆盖的各表元数据
 *   （配置键 / 物理表名 / 中文显示名），供 retention 配置分区默认值、
 *   配置校验与「数据保留」设置面板共用，避免多处维护同一份表清单。
 * 依赖：无（纯常量/类型模块，供 app-config 与 retention.service 引用，无循环依赖）
 */

/** retention 配置分区与清理步骤共用的表键（与 DatabaseRetentionService 清理步骤一一对应） */
export const RETENTION_TABLE_KEYS = [
  'eventLog',
  'commandAudit',
  'notification',
  'securityEvent',
  'loginAudit',
] as const;

export type RetentionTableKey = (typeof RETENTION_TABLE_KEYS)[number];

/** retention 配置分区结构：表键 → 保留天数 */
export type RetentionConfig = Record<RetentionTableKey, number>;

/** 物理表名（未配置 @@map 时 Prisma 模型名即表名，如 "EventLog"） */
export const RETENTION_TABLE_NAMES: Record<RetentionTableKey, string> = {
  eventLog: 'EventLog',
  commandAudit: 'CommandAudit',
  notification: 'Notification',
  securityEvent: 'SecurityEvent',
  loginAudit: 'LoginAudit',
};

/** 中文显示名（供设置面板展示） */
export const RETENTION_TABLE_LABELS: Record<RetentionTableKey, string> = {
  eventLog: '事件日志',
  commandAudit: '命令审计',
  notification: '通知记录（按天数；条数上限另见 maxNotifications）',
  securityEvent: '安防事件',
  loginAudit: '登录审计',
};

/** 默认保留天数（与 retention.* / 遗留 other.eventlogRetentionDays 默认一致） */
export const RETENTION_DEFAULT_DAYS = 7;

/** 保留天数合法区间 */
export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 365;

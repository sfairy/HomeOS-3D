/**
 * @file alert-rule.ts
 * @module @homeos/shared/notification
 * @brief 告警规则契约（backend notification/service 与前端收件箱告警规则共用）。
 *
 * 前端以 `AlertRule as InboxAlertRule` 别名引用，字段以后端持久化结构为准。
 */
import type { AlertLevel } from '../auth/roles';

/** 告警规则定义。绑定实体（可选）、条件表达式、告警级别、投递渠道与冷却时长。 */
export interface AlertRule {
  /** 规则唯一 ID（新建时由后端生成） */
  id?: string;
  /** 规则名称 */
  name: string;
  /** 关联实体 ID（可空表示全局规则） */
  entityId?: string;
  /** 触发条件表达式（原始字符串） */
  condition: string;
  /** 告警级别 */
  level: AlertLevel;
  /** 通知通道：email / webpush / wecom / tts / in_app / socket */
  channels: string[];
  /** 冷却时间（分钟），同规则在该时长内不重复触发 */
  cooldownMinutes: number;
  /** 是否启用 */
  enabled: boolean;
  /** 消息模板（支持变量占位） */
  messageTemplate?: string;
  /** 外部推送标题（Email / WebPush / 企业微信）；为空时由各通道使用内置标题兜底 */
  title?: string;
  /** 条件修订前的旧条件（更新规则时记录，用于边沿触发重置） */
  previousCondition?: string;
}

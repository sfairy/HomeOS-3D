/** - 定义 AlertLevel（info/warn/danger）三级别枚举； */

/**
 * 通知 / 告警级别。
 * - info：信息提示
 * - warn：警告
 * - danger：危险/紧急
 */
export type AlertLevel = 'info' | 'warn' | 'danger';

/**
 * 告警级别集合（只读），顺序即严重程度从低到高，便于排序与比较。
 */
export const ALERT_LEVELS: readonly AlertLevel[] = ['info', 'warn', 'danger'] as const;

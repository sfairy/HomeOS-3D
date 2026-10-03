/**
 * 场景定时调度工具模块
 *
 * 职责：
 *  - 定义场景定时条目结构（cron 5 段表达式 或 at 每日时刻 + days 星期过滤）；
 *  - 判断条目在指定时刻是否到期（复用自动化引擎的 cron 匹配器）；
 *  - 生成按分钟去重的触发 key，避免同一分钟内重复触发。
 *
 * 存储：场景定时配置持久化在 SceneSchedule 表（每场景一行），
 *       由 SceneScheduleService 负责读写与定时扫描。
 */
import {
  homeModeMinuteKey,
  matchCronExpression,
  normalizeHomeModeTimeAt,
  zonedDateParts,
} from '@homeos/shared';

/**
 * 场景定时条目。
 * cron 与 at 至少填一项（cron 优先）；days 为星期过滤（0=周日 … 6=周六），
 * 仅对 at 生效；cron 表达式自身可表达星期。
 */
export interface SceneScheduleItem {
  sceneId: string;
  sceneName?: string;
  /** 5 段 cron（分 时 日 月 周），如 "0 8 * * 1-5" */
  cron?: string;
  /** 每日时刻 "HH:mm"（24 小时制） */
  at?: string;
  /** 星期过滤（0=周日 … 6=周六），仅 at 生效 */
  days?: number[];
  enabled: boolean;
}

/** 校验 cron 表达式是否为合法 5 段（分 时 日 月 周） */
export function isValidCron(cron: string | undefined | null): boolean {
  if (!cron) return false;
  const fields = String(cron).trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => f.length > 0);
}

/**
 * 判断定时条目是否在 now 时刻到期。
 * cron 优先；否则匹配 at 时刻 + days 星期过滤。
 * @param timeZone 可选 IANA 家庭时区（ops.homeTimezone）
 */
export function isSceneScheduleDue(
  item: SceneScheduleItem,
  now: Date,
  timeZone?: string,
): boolean {
  if (!item?.enabled) return false;
  if (item.cron) {
    if (!isValidCron(item.cron)) return false;
    return matchCronExpression(item.cron, now, timeZone);
  }
  const at = normalizeHomeModeTimeAt(item.at);
  if (!at) return false;
  if (homeModeMinuteKey(now, timeZone) !== at) return false;
  if (Array.isArray(item.days) && item.days.length > 0) {
    const weekday = zonedDateParts(now, timeZone).weekday;
    if (!item.days.some((d) => d === weekday)) return false;
  }
  return true;
}

/**
 * 生成按分钟粒度的触发去重 key（sceneId + 年月日时分）。
 * 扫描周期 < 1 分钟时同一分钟多次命中只触发一次。
 */
export function sceneScheduleFireKey(
  item: SceneScheduleItem,
  now: Date,
  timeZone?: string,
): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  if (!timeZone) {
    return `${item.sceneId}:${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
      now.getHours(),
    )}${pad(now.getMinutes())}`;
  }
  const p = zonedDateParts(now, timeZone);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // en-CA 区域格式 → YYYY-MM-DD
  const compact = ymd.replace(/-/g, '');
  return `${item.sceneId}:${compact}${pad(p.hour)}${pad(p.minute)}`;
}

/**
 * 外部日历同步辅助函数
 *
 * 模块：system/ops
 * 职责：
 *  - isAwayDuringCalendar：判断当前是否处于"外出"事件中
 *  - getUpcomingAwayEvents：获取即将发生的外出事件（提前触发准备）
 *  - syncCalendarFromUrl：从 ICS URL 拉取 + 解析 + 外出状态变化回调
 *
 * 关键路径：syncCalendarFromUrl 被 ExternalApiService 周期调用（默认每 60 分钟）。
 * 修改注意：外出状态判定依赖 isAway 标志，由 parseICalendar 在解析时根据 SUMMARY / DTSTART 等字段推断。
 */
import type { ICalendarEvent } from '../../../common/utils/icalendar-parse.util';

/**
 * 检查当前是否处于"外出"事件中。
 * 判定条件：事件 isAway=true 且当前时间在 [start, end] 区间内。
 *
 * @param events 事件列表（需含 start / end ISO 字符串 + isAway 标志）
 * @returns true 表示当前正在外出
 */
export function isAwayDuringCalendar(
  events: Array<{ start: string; end: string; isAway: boolean }>,
): boolean {
  const now = new Date().toISOString();
  return events.some((e) => e.isAway && e.start <= now && e.end >= now);
}

/**
 * 获取即将发生的外出事件（用于提前触发准备，如关闭电器 / 启动安防）。
 *
 * @param events      事件列表
 * @param withinHours 提前窗口（小时），默认 2
 * @returns 在 (now, now+withinHours] 区间内开始的外出事件
 */
export function getUpcomingAwayEvents(
  events: Array<{ title: string; start: string; isAway: boolean }>,
  withinHours = 2,
) {
  const now = Date.now();
  const cutoff = now + withinHours * 3600_000;
  return events.filter((e) => {
    const startTime = new Date(e.start).getTime();
    return e.isAway && startTime > now && startTime <= cutoff;
  });
}

/**
 * 日历同步单次结果（不含事件列表）
 */
interface CalendarSyncFetchResult {
  /** 是否成功同步 */
  synced: boolean;
  /** 事件数量 */
  count?: number;
  /** 当前是否外出 */
  awayNow?: boolean;
  /** 跳过原因（如未配置 URL） */
  reason?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 日历同步依赖注入接口（让 helper 可测试，不直接依赖 HttpService / EventEmitter）
 */
interface CalendarSyncDeps {
  /** 拉取 ICS 原始文本；返回 null 表示服务端 304 未变更（复用上次事件） */
  fetchIcs: (url: string) => Promise<string | null>;
  /** 解析 ICS 文本为事件列表 */
  parseICalendar: (content: string) => ICalendarEvent[];
  /** 外出状态变化回调（旧 → 新） */
  onAwayChanged: (away: boolean, awayEvents: ICalendarEvent[]) => void;
  /** 获取上次外出状态 */
  getLastAwayState: () => boolean;
  /** 记录最新外出状态 */
  setLastAwayState: (away: boolean) => void;
  /** 获取最近一次成功解析的事件列表（增量未变更时复用） */
  getLastEvents?: () => ICalendarEvent[];
  /** 记录最新解析的事件列表 */
  setLastEvents?: (events: ICalendarEvent[]) => void;
}

/**
 * 从 URL 同步日历（关键路径）。
 * 流程：
 *  1. 校验 URL 非空
 *  2. fetchIcs 拉取 ICS 文本（由调用方通过熔断器包装）；返回 null 表示 304 未变更
 *  3. 有变更时 parseICalendar 解析为事件列表并缓存；未变更时复用上次事件
 *  4. 计算当前是否外出，与上次状态比较；变化则触发 onAwayChanged 回调
 *  5. 返回同步结果（含事件列表）
 *
 * @param url  ICS 日历 URL（可为空，空则返回 synced=false + reason）
 * @param deps 依赖接口
 * @returns 同步结果 + events 事件列表
 */
export async function syncCalendarFromUrl(
  url: string | undefined,
  deps: CalendarSyncDeps,
): Promise<CalendarSyncFetchResult & { events?: ICalendarEvent[]; notModified?: boolean }> {
  const trimmed = url?.trim();
  if (!trimmed) return { synced: false, reason: '未配置 calendarUrl' };
  try {
    const content = await deps.fetchIcs(trimmed);
    let events = deps.getLastEvents?.() ?? [];
    let count = events.length;
    let notModified = false;
    if (content != null) {
      events = deps.parseICalendar(content);
      count = events.length;
      deps.setLastEvents?.(events);
    } else {
      notModified = true;
    }
    const awayNow = isAwayDuringCalendar(events);
    // 外出状态变化时通知上层（避免每次同步都 emit）
    if (awayNow !== deps.getLastAwayState()) {
      deps.setLastAwayState(awayNow);
      deps.onAwayChanged(
        awayNow,
        events.filter((e) => e.isAway),
      );
    }
    return { synced: true, count, awayNow, events, notModified };
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }
}
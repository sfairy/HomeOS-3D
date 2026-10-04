/**
 * iCalendar（.ics，RFC 5545）解析器：把日历事件转成 HomeOS 日历结构。
 *
 * 职责：
 *   - parseICalendar：切分 VEVENT 块，提取 SUMMARY/UID/LOCATION/DESCRIPTION/DTSTART/DTEND/RRULE，
 *     支持转义还原（\, → ,、\n → 换行）；
 *   - isAway 启发式：根据标题/位置/描述关键字（外出/出差/旅行/旅游/度假）推断是否「不在家」；
 *   - expandRruleInstances：基础 RRULE 展开（FREQ=DAILY/WEEKLY + COUNT/UNTIL + BYDAY），
 *     把重复事件展开为多个实例；
 *   - parseRruleUntil / parseCalDate：解析 UNTIL 与 DTSTART/DTEND 日期格式（含全天事件）。
 * 输出事件按 start 升序排序；支持 Google Calendar / Apple Calendar / Outlook 导出的 .ics。
 * 关键依赖：无外部依赖，纯函数。
 */
/** 解析后的日历事件结构 */
export interface ICalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
  isAllDay: boolean;
  isAway: boolean;
}

/**
 * 解析 iCalendar（RFC 5545）格式的事件
 * 支持 Google Calendar .ics 导出 / Apple Calendar / Outlook
 *
 * @param icsContent .ics 原文
 * @returns 事件数组，按开始时间升序；重复事件展开为多实例
 */
export function parseICalendar(icsContent: string): ICalendarEvent[] {
  const events: ICalendarEvent[] = [];

  // 按 BEGIN:VEVENT 切分块，首块是日历头，丢弃
  const blocks = icsContent.split(/BEGIN:VEVENT\r?\n/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.indexOf('END:VEVENT');
    if (endIdx === -1) continue;
    const eventBlock = block.substring(0, endIdx);

    // 取属性值：支持 DTSTART;VALUE=DATE:yyyymmdd 这类带参数的写法，正则取冒号后的部分
    const getProp = (name: string): string => {
      const match = eventBlock.match(new RegExp(`^${name}(;.*?)?:(.+)$`, 'm'));
      return match ? match[2].replace(/\\,/g, ',').replace(/\\n/g, '\n').trim() : '';
    };

    const title = getProp('SUMMARY');
    const uid = getProp('UID');
    const location = getProp('LOCATION');
    const description = getProp('DESCRIPTION');
    const dtStart = getProp('DTSTART');
    const dtEnd = getProp('DTEND');
    const rrule = getProp('RRULE');

    // 无标题或开始时间的事件跳过
    if (!title || !dtStart) continue;

    // 全天事件：DTSTART 行带 VALUE=DATE 参数（无具体时间）
    const isAllDay =
      dtStart.includes('VALUE=DATE') ||
      /VALUE=DATE/i.test(eventBlock.match(/DTSTART[^\n]*/)?.[0] || '');
    // 启发式：标题/位置/描述含外出/出差/旅行/旅游/度假等关键字则视为不在家
    const isAway =
      title.includes('外出') ||
      title.includes('出差') ||
      title.includes('旅行') ||
      title.includes('旅游') ||
      title.includes('度假') ||
      location.includes('外') ||
      description.includes('外出') ||
      description.includes('出差');

    const baseStart = parseCalDate(dtStart, isAllDay);
    const baseEnd = parseCalDate(dtEnd, isAllDay);
    const instances = expandRruleInstances(baseStart, baseEnd, rrule);
    if (instances.length === 0) {
      // 非重复事件：UID 缺失则随机生成
      events.push({
        uid: uid || Math.random().toString(36).slice(2),
        title,
        start: baseStart,
        end: baseEnd,
        location,
        description,
        isAllDay,
        isAway,
      });
    } else {
      // 重复事件：每个实例 UID 加 _<序号> 后缀，便于前端去重
      for (let i = 0; i < instances.length; i++) {
        events.push({
          uid: `${uid || Math.random().toString(36).slice(2)}_${i}`,
          title,
          start: instances[i].start,
          end: instances[i].end,
          location,
          description,
          isAllDay,
          isAway,
        });
      }
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * 基础 RRULE 展开：FREQ=DAILY/WEEKLY + COUNT/UNTIL + BYDAY。
 * 不支持 MONTHLY/YEARLY 等复杂规则；最多展开 30 个实例防止恶意输入爆炸。
 *
 * @param baseStart 基础开始时间（ISO 字符串）
 * @param baseEnd   基础结束时间（ISO 字符串），用于计算单实例时长
 * @param rrule     RRULE 原文
 * @returns 实例列表；无 RRULE 或不支持时返回 []；仅 1 个实例时也返回 []
 */
function expandRruleInstances(
  baseStart: string,
  baseEnd: string,
  rrule: string,
): Array<{ start: string; end: string }> {
  if (!rrule?.trim()) return [];
  const parts: Record<string, string> = {};
  for (const seg of rrule.split(';')) {
    const [k, v] = seg.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ;
  if (!freq || !['DAILY', 'WEEKLY'].includes(freq)) return [];

  const count = parseInt(parts.COUNT || '8', 10);
  const maxInstances = Math.min(count || 8, 30);
  const durationMs = new Date(baseEnd).getTime() - new Date(baseStart).getTime();
  const start0 = new Date(baseStart);
  const until = parts.UNTIL ? parseRruleUntil(parts.UNTIL) : null;
  const byDay = parts.BYDAY?.split(',').map((d) => d.trim().slice(-2).toUpperCase()) || [];
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  const out: Array<{ start: string; end: string }> = [];
  const cursor = new Date(start0);
  let added = 0;
  // 安全阀：游标超过 366 天仍无产出则退出，防止 BYDAY 配错导致死循环
  while (added < maxInstances) {
    if (until && cursor.getTime() > until.getTime()) break;
    const dow = cursor.getDay();
    const match =
      freq === 'DAILY' ||
      (freq === 'WEEKLY' &&
        (byDay.length === 0
          ? cursor.getDay() === start0.getDay()
          : byDay.some((d) => dayMap[d] === dow)));
    if (match) {
      const instStart = new Date(cursor);
      const instEnd = new Date(instStart.getTime() + durationMs);
      out.push({ start: instStart.toISOString(), end: instEnd.toISOString() });
      added++;
    }
    cursor.setDate(cursor.getDate() + (freq === 'WEEKLY' && byDay.length ? 1 : 1));
    if (freq === 'WEEKLY' && byDay.length === 0) cursor.setDate(cursor.getDate() + 6);
    if (added === 0 && cursor.getTime() - start0.getTime() > 366 * 86400_000) break;
  }
  // 仅 1 个实例视为无重复，与无 RRULE 同等对待
  return out.length > 1 ? out : [];
}

/**
 * 解析 RRULE UNTIL 日期：支持 yyyymmdd、yyyymmddZ、yyyymmddThhmmss 与 yyyymmddThhmmssZ。
 * 一律取当日 23:59:59Z 作为截止，避免边界条件漏掉当日事件。
 *
 * @returns Date 实例；格式不识别时返回 null
 */
function parseRruleUntil(raw: string): Date | null {
  // Logic fix: 旧实现只认「8 位」或「以 Z 结尾且长度 ≥15」，导致不带 Z 的
  // yyyymmddThhmmss（浮动/带 TZID）被当作非法值直接忽略，重复规则永不截止。
  const m = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?Z?$/.exec(raw.trim());
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59.000Z`);
}

/**
 * 解析 ICS 日期字段为 ISO 字符串。
 * - 全天事件：取 yyyymmdd 转 yyyy-mm-ddT00:00:00.000Z；
 * - 带 Z 后缀：按 UTC 解析 yyyymmddThhmmssZ；
 * - 浮动本地时间 / 带 TZID（无 Z）：按 UTC 墙上时钟确定性解析；
 * - 其余无法识别的格式：兜底用当前时间，保证不抛错。
 *
 * @param raw      DTSTART/DTEND 原始值（可能带 ;VALUE=DATE 参数前缀）
 * @param isAllDay 是否全天事件
 * @returns ISO 字符串
 */
function parseCalDate(raw: string, isAllDay: boolean): string {
  const clean = raw.replace(/;.*?(?=:)/, '');
  if (isAllDay) {
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    return `${y}-${m}-${d}T00:00:00.000Z`;
  }
  if (clean.endsWith('Z')) {
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    const h = clean.substring(9, 11);
    const min = clean.substring(11, 13);
    const s = clean.substring(13, 15);
    return `${y}-${m}-${d}T${h}:${min}:${s}.000Z`;
  }
  // Logic fix: 浮动本地时间 / 带 TZID（参数已由 getProp 剥离）形如 yyyymmddThhmmss，
  // 旧实现直接返回「当前时间」导致事件时间漂移。此处按 UTC 墙上时钟确定性解析
  // （无时区信息时最保守的选择），至少保证日期/时刻稳定不再随解析时刻变化。
  if (/^\d{8}T\d{6}$/.test(clean)) {
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    const h = clean.substring(9, 11);
    const min = clean.substring(11, 13);
    const s = clean.substring(13, 15);
    return `${y}-${m}-${d}T${h}:${min}:${s}.000Z`;
  }
  return new Date().toISOString();
}

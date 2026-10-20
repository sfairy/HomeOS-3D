/** - zonedDateParts：按可选 IANA 时区拆解日期部件（weekday 0=周日 对齐 JS Date.getDay）； */

/**
 * 时区感知的日期拆分项（年/月/日均按目标时区的"墙上时钟"取值）。
 */
export interface ZonedDateParts {
  /** 公历年（如 2025） */
  year: number;
  /** 月份（1-12） */
  month: number;
  /** 日（1-31） */
  day: number;
  /** 小时（0-23，h23 制） */
  hour: number;
  /** 分钟（0-59） */
  minute: number;
  /** 秒（0-59） */
  second: number;
  /** 星期几：0=周日 … 6=周六（对齐 JS Date.getDay） */
  weekday: number;
}

/**
 * 按可选 IANA 时区拆解日期部件。
 *
 * @param now      待拆解时刻（Date = UTC 瞬时）
 * @param timeZone 目标 IANA 时区（如 "Asia/Shanghai"）；缺省用进程本地时区
 * @returns 按目标时区的墙上时钟拆解出的部件（weekday：0=周日 … 6=周六）
 */
export function zonedDateParts(now: Date, timeZone?: string): ZonedDateParts {
  if (!timeZone) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      weekday: now.getDay(),
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const bag = Object.fromEntries(
    fmt.formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(bag.year ?? 0),
    month: Number(bag.month ?? 1),
    day: Number(bag.day ?? 1),
    hour: Number(bag.hour ?? 0),
    minute: Number(bag.minute ?? 0),
    second: Number(bag.second ?? 0),
    weekday: weekdayMap[bag.weekday ?? ''] ?? 0,
  };
}

/**
 * 将「某时区墙上时钟」换算为 Date（UTC 瞬时）。
 * 用于日出日落、自然日桶起点等需要按家庭时区落点的场景。
 *
 * @param timeZone 目标 IANA 时区；缺省按本地时区构造
 * @param year     公历年
 * @param month    月（1-12）
 * @param day      日（1-31）
 * @param hour     时（0-23）
 * @param minute   分（0-59）
 * @param second   秒（0-59，默认 0）
 * @returns 对应 UTC 瞬时的 Date
 *
 * 实现说明：最多进行 4 轮迭代校正（基于 Intl 时区 DST 偏移），避免夏令时切换导致的 ±1h 漂移。
 */
export function dateFromZonedWallClock(
  timeZone: string | undefined,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  if (!timeZone) {
    return new Date(year, month - 1, day, hour, minute, second, 0);
  }
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const zonedParts = zonedDateParts(new Date(utc), timeZone);
    const got = Date.UTC(zonedParts.year, zonedParts.month - 1, zonedParts.day, zonedParts.hour, zonedParts.minute, zonedParts.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = want - got;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

/**
 * 将某日的小数小时（如 6.5 = 06:30）换算为该时区墙上时钟对应的 Date。
 *
 * @param timeZone 目标 IANA 时区；缺省按本地时区
 * @param year     公历年
 * @param month    月（1-12）
 * @param day      日（1-31）
 * @param hourFrac 小时浮点数（如 6.5 = 6 点 30 分；分钟按四舍五入取整，60 分时进位到下一小时）
 * @returns 对应 UTC 瞬时的 Date
 */
export function dateFromZonedHourFraction(
  timeZone: string | undefined,
  year: number,
  month: number,
  day: number,
  hourFrac: number,
): Date {
  let hour = Math.floor(hourFrac);
  let minute = Math.round((hourFrac - hour) * 60);
  if (minute === 60) {
    hour += 1;
    minute = 0;
  }
  return dateFromZonedWallClock(timeZone, year, month, day, hour, minute, 0);
}

/**
 * 判定某时刻是否命中 5 段 cron 表达式。
 *
 * @param cron     5 段 cron 表达式（分 时 日 月 周），空白分隔；段数不为 5 直接返回 false
 * @param now      待判定时刻
 * @param timeZone 可选 IANA 时区；缺省用进程本地时区拆解 now 部件
 * @returns true 表示 now 落在 cron 匹配窗口（每段与对应部件匹配；day-of-month 与 day-of-week 同时受限时按标准 cron 取「或」）
 */
export function matchCronExpression(cron: string, now: Date, timeZone?: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, mon, dow] = fields;
  const parts = zonedDateParts(now, timeZone);
  const matches = (field: string, value: number, start: number): boolean => {
    if (field === '*' || field === '?' || field === '') return true;
    const ranged = /^(\d+)-(\d+)\/(\d+)$/.exec(field);
    if (ranged) {
      const [, low, high, step] = ranged;
      const lowValue = parseInt(low, 10);
      const h = parseInt(high, 10);
      const stepValue = parseInt(step, 10);
      if (stepValue <= 0) return false;
      if (value < lowValue || value > h) return false;
      return (value - lowValue) % stepValue === 0;
    }
    for (const part of field.split(',')) {
      const partValue = part.trim();
      if (partValue === '*') return true;
      if (partValue.startsWith('*/')) {
        const stepSize = parseInt(partValue.slice(2), 10);
        // Logic fix: 步进以字段合法起点为基准（分/时/周从 0，日/月从 1），
        // 否则 "*/2" 在 day/month 上会错位（2,4,6... 而非 1,3,5...）。
        if (stepSize > 0 && (value - start) % stepSize === 0) return true;
        continue;
      }
      if (/^\d+-\d+$/.test(partValue)) {
        const [rangeStart, rangeEnd] = partValue.split('-').map((x) => parseInt(x, 10));
        if (value >= rangeStart && value <= rangeEnd) return true;
        continue;
      }
      if (/^\d+$/.test(partValue) && parseInt(partValue, 10) === value) return true;
    }
    return false;
  };

  // Logic fix: 标准 cron 语义 —— 当 day-of-month 与 day-of-week 同时被限制时二者取「或」，
  // 任一命中即算日期匹配；否则（至少一个为 * / ?）两者都需匹配。
  const domRestricted = dom !== '*' && dom !== '?' && dom !== '';
  const dowRestricted = dow !== '*' && dow !== '?' && dow !== '';
  const timeMatch = matches(min, parts.minute, 0) && matches(hour, parts.hour, 0);
  const monthMatch = matches(mon, parts.month, 1);
  if (domRestricted && dowRestricted) {
    return timeMatch && monthMatch && (matches(dom, parts.day, 1) || matches(dow, parts.weekday, 0));
  }
  return timeMatch && monthMatch && matches(dom, parts.day, 1) && matches(dow, parts.weekday, 0);
}

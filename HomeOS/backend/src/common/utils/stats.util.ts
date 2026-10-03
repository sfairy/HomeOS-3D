/**
 * 本地统计与预测工具集 — 能源 / 用水 / 习惯学习共用。
 *
 * 所属模块：backend/src/common/utils
 * 职责：
 *   - 基础统计量：mean / zScore / bucketHourDow；
 *   - 习惯学习：findDominantHour 找出主导小时（用于「常用时段」推荐）；
 *   - 用量预测：linearForecast（简单线性回归）、weekdayAwareForecast（星期因子 +
 *     气温修正，更贴合工作日/周末差异）、linearForecastWater（用水模块兼容别名）。
 * 关键依赖：无外部依赖，纯函数。
 */
/** 算术平均；空数组返回 0 避免除零 */
export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * z-score 标准化分数：表示 value 相对均值偏离了几个标准差。
 * sd 为 0 时按值大小关系给出 ±3 / 0，避免除零。
 */
export function zScore(value: number, avg: number, sd: number): number {
  if (sd === 0) return value === avg ? 0 : value > avg ? 3 : -3;
  return (value - avg) / sd;
}

/** 把日期分桶到 { 小时, 星期几 }：习惯学习按此桶做统计 */
export function bucketHourDow(date: Date = new Date()): { hour: number; dow: number } {
  return { hour: date.getHours(), dow: date.getDay() };
}

/**
 * 小时频率桶：返回主导小时与占比；不满足阈值时返回 null。
 * 用于「用户最常在 X 点做某事」类习惯推断，需样本与置信度双门槛。
 *
 * @param hours 触发小时序列
 * @param opts  minSamples 最小样本数；minScore 主导占比下限
 * @returns 主导小时信息（hour / count / score）或 null
 */
export function findDominantHour(
  hours: number[],
  opts: { minSamples: number; minScore: number },
): { hour: number; count: number; score: number } | null {
  if (hours.length < opts.minSamples) return null;
  const hourCounts = new Map<number, number>();
  for (const h of hours) hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  let bestHour = 0;
  let bestCount = 0;
  for (const [h, c] of hourCounts) {
    if (c > bestCount) {
      bestHour = h;
      bestCount = c;
    }
  }
  const score = bestCount / hours.length;
  if (score < opts.minScore) return null;
  return { hour: bestHour, count: bestCount, score };
}

/** 线性预测结果：未来 7 / 30 天累计用量与每日斜率 */
interface LinearForecastResult {
  next7Days: number | null;
  next30Days: number | null;
  slopePerDay: number;
  method: string;
  basedOnDays?: number;
}

/**
 * 基于日序列线性回归外推 7/30 天总量。
 * 样本不足 2 天时返回 insufficient_data；用 x = 索引作为自变量，最小二乘求斜率与截距，
 * 每日预测值钳制到 ≥0 后累加，结果保留 3 位小数。
 *
 * @param dailyUsage 按日用量序列
 * @param opts       可自定义结果键名（用于水电不同单位的同结构返回）
 */
export function linearForecast(
  dailyUsage: number[],
  opts: { next7Key?: string; next30Key?: string } = {},
): LinearForecastResult & Record<string, number | null | string | undefined> {
  const next7Key = opts.next7Key ?? 'next7Days';
  const next30Key = opts.next30Key ?? 'next30Days';
  const n = dailyUsage.length;
  if (n < 2) {
    return {
      [next7Key]: null,
      [next30Key]: null,
      next7Days: null,
      next30Days: null,
      slopePerDay: 0,
      method: 'insufficient_data',
    } as LinearForecastResult & Record<string, number | null | string | undefined>;
  }
  const xs = dailyUsage.map((_, i) => i);
  const meanX = mean(xs);
  const meanY = mean(dailyUsage);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (dailyUsage[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const project = (futureDays: number) => {
    let sum = 0;
    for (let d = 1; d <= futureDays; d++) {
      const y = intercept + slope * (n - 1 + d);
      sum += Math.max(0, y);
    }
    return Math.round(sum * 1000) / 1000;
  };
  const next7 = project(7);
  const next30 = project(30);
  return {
    [next7Key]: next7,
    [next30Key]: next30,
    next7Days: next7,
    next30Days: next30,
    slopePerDay: Math.round(slope * 10000) / 10000,
    method: 'linear_regression',
    basedOnDays: n,
  } as LinearForecastResult & Record<string, number | null | string | undefined>;
}

/**
 * 用水模块兼容别名：把字段键替换为 next7DaysM3 / next30DaysM3，
 * 同时回退到 next7Days / next30Days 保证缺字段时仍可用。
 */
export function linearForecastWater(dailyUsageM3: number[]) {
  const r = linearForecast(dailyUsageM3, { next7Key: 'next7DaysM3', next30Key: 'next30DaysM3' });
  return {
    next7DaysM3: r.next7DaysM3 ?? r.next7Days,
    next30DaysM3: r.next30DaysM3 ?? r.next30Days,
    slopePerDay: r.slopePerDay,
    method: r.method,
    basedOnDays: r.basedOnDays,
  };
}

interface WeekdayForecastInput {
  /** 当月日用电量序列（索引 0 = 本月 1 号；未开始的天为 0） */
  dailyUsage: number[];
  /** 当月总天数 */
  daysInMonth: number;
  /** 今天为当月第几天（1-based） */
  currentDay: number;
  /** 今天星期（0-6，Sunday=0） */
  todayDow: number;
  /** 未来时段气温相对基线偏移（℃），缺省不做气温修正 */
  tempDeviationC?: number;
  /** 每偏离基线 1℃ 对日用电量的影响（kWh/℃） */
  tempSensitivityKwh?: number;
}

type WeekdayAwareForecastResult = LinearForecastResult & {
  /** 星期因子：周日均值 / 整体均值（null=该星期无样本） */
  weekdayFactors: Record<number, number | null>;
};

/**
 * 星期因子 + 气温修正的日用量预测。
 * - 按星期几分桶统计均值，未来日按对应星期均值预测（比纯线性外推更贴合
 *   周末/工作日用电差异）。
 * - 气温修正：未来一周平均气温相对当前基线每偏移 1℃，日用电量增减
 *   tempSensitivityKwh（夏季制冷/冬季制热的温感负荷）。
 * - 样本不足时回退简单线性回归。
 */
export function weekdayAwareForecast(input: WeekdayForecastInput): WeekdayAwareForecastResult {
  const { dailyUsage, currentDay, todayDow } = input;
  const n = dailyUsage.length;
  if (n < 2) {
    return { ...linearForecast(dailyUsage), weekdayFactors: {} };
  }

  // 倒推历史每日星期：以今日 todayDow 为锚，往前 n 天逐日反推 dow
  const dowSums = new Array<number>(7).fill(0);
  const dowCounts = new Array<number>(7).fill(0);
  for (let i = 0; i < n; i++) {
    const dow = (((todayDow - (currentDay - 1 - i)) % 7) + 7) % 7;
    dowSums[dow] += dailyUsage[i];
    dowCounts[dow]++;
  }
  const overallMean = dailyUsage.reduce((s, v) => s + v, 0) / n;
  const dowMean: Array<number | null> = dowSums.map((s, d) =>
    dowCounts[d] > 0 ? s / dowCounts[d] : null,
  );
  const weekdayFactors: Record<number, number | null> = {};
  for (let d = 0; d < 7; d++) {
    const mean = dowMean[d];
    weekdayFactors[d] = mean != null && overallMean > 0 ? mean / overallMean : null;
  }

  const sensitivity =
    Number(input.tempSensitivityKwh) > 0 ? Number(input.tempSensitivityKwh) : 0;
  const deviation = Number.isFinite(input.tempDeviationC) ? Number(input.tempDeviationC) : 0;
  const tempCorrection = sensitivity > 0 && deviation !== 0 ? deviation * sensitivity : 0;

  // 未来每日按（今日 dow + k）取对应星期均值；缺失样本时回退整体均值
  const project = (futureDays: number) => {
    let sum = 0;
    for (let k = 1; k <= futureDays; k++) {
      const dow = (todayDow + k) % 7;
      let y = dowMean[dow] ?? overallMean;
      if (tempCorrection) y = Math.max(0, y + tempCorrection);
      sum += Math.max(0, y);
    }
    return Math.round(sum * 1000) / 1000;
  };

  return {
    next7Days: project(7),
    next30Days: project(30),
    slopePerDay: 0,
    method: 'weekday_factor',
    basedOnDays: n,
    weekdayFactors,
  };
}

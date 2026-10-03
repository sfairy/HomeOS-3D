/**
 * 事件日志保留策略与查询参数工具
 *
 * 所属模块：backend/src/common/database
 * 职责：统一计算事件日志（eventLog）的保留天数、最大回溯小时数、查询小时步长等
 *   派生参数，并组装前端 meta（时间线/叠加图参数）。同时附带能耗图表与
 *   联动器执行历史上限的派生计算，避免各 Controller 重复实现。
 * 关键依赖：无（纯函数工具模块）
 */

/** 事件历史页可选的回溯步长（小时），覆盖 3h ~ 7d 的常用区间 */
const EVENT_LOG_QUERY_HOUR_STEPS = [3, 6, 12, 24, 48, 72, 168] as const;

/**
 * 解析事件日志保留天数。
 * @param days     原始配置值（可能为 undefined / null / 非数字）
 * @param fallback 兜底默认天数，默认 7
 * @returns 1~365 之间的整数天数；非法值返回 fallback
 */
function resolveEventLogRetentionDays(
  days: number | undefined | null,
  fallback = 7,
): number {
  const n = Number(days);
  // 限幅：上限 365 天避免极端配置拖累存储
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : fallback;
}

/**
 * 保留天数换算为最大回溯小时数（供前端选择回溯窗口上限）。
 * @param days         原始配置值
 * @param fallbackDays 兜底默认天数，默认 7
 * @returns 最大回溯小时数
 */
function resolveEventLogMaxHours(days: number | undefined | null, fallbackDays = 7): number {
  return resolveEventLogRetentionDays(days, fallbackDays) * 24;
}

/**
 * 将前端传入的查询小时数夹到合法区间 [1, maxHours]。
 *
 * @param hours         原始查询小时数
 * @param retentionDays 当前保留天数（用于推算 maxHours）
 * @param fallbackHours 兜底默认小时数；不传时默认取 maxHours
 * @returns 合法查询小时数
 */
export function clampEventLogQueryHours(
  hours: number | undefined | null,
  retentionDays: number | undefined | null,
  fallbackHours?: number,
): number {
  const max = resolveEventLogMaxHours(retentionDays);
  // fallback 也要夹到 [1, max] 范围内
  const fb = fallbackHours != null ? Math.min(Math.max(Math.floor(fallbackHours), 1), max) : max;
  const n = Number(hours);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fb;
  // 最终再夹一次，确保 [1, max]
  return Math.min(Math.max(base, 1), max);
}

/**
 * 列出前端可选的回溯小时下拉项：从 EVENT_LOG_QUERY_HOUR_STEPS 中筛出 <= maxHours 的项；
 * 若所有预设都超过 maxHours（极短保留期场景），返回 [maxHours] 作为唯一选项。
 *
 * @param retentionDays 当前保留天数
 * @returns 可选小时数数组
 */
function listEventLogQueryHourOptions(retentionDays: number | undefined | null): number[] {
  const max = resolveEventLogMaxHours(retentionDays);
  const opts = EVENT_LOG_QUERY_HOUR_STEPS.filter((h) => h <= max);
  return opts.length ? [...opts] : [max];
}

/**
 * 组装事件日志前端 meta：包含保留天数、最大查询小时数、可选小时项、
 * 时间线长度/窗口、叠加图窗口等参数，供前端一次性拉取渲染所需配置。
 *
 * @param retentionDays 当前保留天数
 * @param opts          可选覆盖项：时间线最大条数 / 时间线窗口小时 / 叠加图窗口小时
 */
export function buildEventLogPublicMeta(
  retentionDays: number | undefined | null,
  opts?: {
    eventLogTimelineMax?: number;
    eventLogTimelineHours?: number;
    eventLogOverlayHours?: number;
  },
) {
  const days = resolveEventLogRetentionDays(retentionDays);
  const maxQueryHours = days * 24;
  // 时间线最大条数：默认 500，<=0 时退回 500
  const timelineMax = opts?.eventLogTimelineMax ?? 500;
  // 时间线回溯窗口：默认 12h，并夹到不超过 maxQueryHours
  const timelineHoursRaw = opts?.eventLogTimelineHours ?? 12;
  const timelineHours = Math.min(
    Number.isFinite(timelineHoursRaw) && timelineHoursRaw > 0 ? Math.floor(timelineHoursRaw) : 12,
    maxQueryHours,
  );
  // 叠加图回溯窗口：默认 2h，并夹到不超过 maxQueryHours
  const overlayRaw = opts?.eventLogOverlayHours ?? 2;
  const overlayHours = Math.min(
    Number.isFinite(overlayRaw) && overlayRaw > 0 ? Math.floor(overlayRaw) : 2,
    maxQueryHours,
  );
  // 兜底：timelineMax 非正时回 500
  const timelineLimit = timelineMax > 0 ? timelineMax : 500;
  return {
    retentionDays: days,
    maxQueryHours,
    hourOptions: listEventLogQueryHourOptions(days),
    timelineHours,
    timelineLimit,
    overlayHours,
  };
}

/**
 * 由学习周期天数解析能耗图表的回溯小时数。
 * 调用场景：能耗图表后端渲染时获取窗口大小。
 *
 * @param learningPeriodDays 学习周期天数
 * @returns 图表回溯小时数
 */
export function resolveEnergyChartHours(learningPeriodDays: number | undefined | null): number {
  return buildEnergyPublicMeta(learningPeriodDays).chartHours;
}

/**
 * 组装能耗图表前端 meta：学习周期天数 + 图表回溯小时数。
 * 学习周期上限 30 天；chartHours = min(days*24, 168)，即最多回溯 7 天。
 *
 * @param learningPeriodDays 学习周期天数
 */
export function buildEnergyPublicMeta(learningPeriodDays: number | undefined | null) {
  const n = Number(learningPeriodDays);
  // 学习周期上限 30 天，默认 7 天
  const days = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 30) : 7;
  return {
    learningPeriodDays: days,
    // 图表最多回溯 168h = 7 天，避免长周期下数据点过多
    chartHours: Math.min(days * 24, 168),
  };
}

/**
 * 解析联动器执行历史返回条数上限。
 *
 * 取 scene 与 script 上限的较大者，并夹到 200 内（防止极端配置导致回包过大）。
 * 默认值：scene=100，script=80，最终上限 200。
 *
 * @param ops 含 sceneExecHistoryMax / scriptExecHistoryMax 的配置对象
 * @returns 历史条数上限
 */
export function resolveOrchestratorHistoryLimit(ops: {
  sceneExecHistoryMax?: number;
  scriptExecHistoryMax?: number;
}): number {
  const scene = Number(ops.sceneExecHistoryMax);
  const script = Number(ops.scriptExecHistoryMax);
  const sceneMax = Number.isFinite(scene) && scene > 0 ? scene : 100;
  const scriptMax = Number.isFinite(script) && script > 0 ? script : 80;
  return Math.min(Math.max(sceneMax, scriptMax), 200);
}
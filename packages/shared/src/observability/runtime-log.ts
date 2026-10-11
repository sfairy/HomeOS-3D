/**
 * @file runtime-log.ts
 * @module @homeos/shared/observability
 * @brief 运行日志契约（backend 环形缓冲与前端 /system/runtime-logs 接口共用）。
 *
 * 后端 runtime-log-buffer.helper 与前端 services/api/system 均引用本文件；
 * 级别值与 Nest Logger 对齐。
 */

/** 运行日志级别（与 Nest Logger 级别一致） */
export type RuntimeLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

/** 单条运行日志条目（环形缓冲内的最小结构） */
export type RuntimeLogEntry = {
  /** 自增序号（进程内单调递增，用于增量拉取） */
  id: number;
  /** 日志级别 */
  level: RuntimeLogLevel;
  /** 日志上下文（通常是 Nest Logger 的 context） */
  context?: string;
  /** 日志正文（已格式化为字符串） */
  message: string;
  /** 写入时间（ISO 字符串） */
  ts: string;
  /** 关联的请求链路 ID（若有） */
  traceId?: string;
};

/** 运行日志查询参数（REST 查询串 / SSE 订阅参数共用） */
export type RuntimeLogQuery = {
  /** 返回条数上限 */
  limit?: number;
  /** 逗号分隔级别过滤，如 error,warn */
  level?: string;
  /** 在 message / context / traceId 中子串匹配（忽略大小写） */
  q?: string;
  /** context 子串匹配（忽略大小写） */
  context?: string;
  /** 仅返回 id 大于该值的条目（增量拉取） */
  afterId?: number;
};

/** 运行日志查询结果（含缓冲区元信息） */
export type RuntimeLogQueryResult = {
  /** 当前页日志条目 */
  items: RuntimeLogEntry[];
  /** 缓冲区容量 */
  capacity: number;
  /** 当前缓冲条数 */
  buffered: number;
  /** 最新一条日志的 id（0 表示缓冲为空） */
  newestId: number;
  /** 因缓冲溢出被丢弃的累计条数 */
  dropped: number;
};

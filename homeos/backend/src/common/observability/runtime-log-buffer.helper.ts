/**
 * @file runtime-log-buffer.helper.ts
 * @module common/observability
 *
 * 进程内运行日志环形缓冲，供管理端 API 查询近期 Nest 日志。
 * 仅保存在内存，进程重启后清空；不替代 stdout/stderr 采集。
 * 类型契约由 @homeos/shared/observability 统一维护（与前端 /system/runtime-logs 对齐）。
 */
import type {
  RuntimeLogEntry,
  RuntimeLogLevel,
  RuntimeLogQuery,
  RuntimeLogQueryResult,
} from '@homeos/shared';

export type { RuntimeLogEntry, RuntimeLogLevel, RuntimeLogQuery, RuntimeLogQueryResult };

/** 环形缓冲默认容量：保留最近 2000 条运行日志 */
const DEFAULT_CAPACITY = 2000;
/** 单次查询返回条数上限，防止前端一次拉取过多撑爆响应 */
const MAX_QUERY_LIMIT = 1000;
/** 未指定 limit 时的默认查询条数 */
const DEFAULT_QUERY_LIMIT = 200;

const capacity = DEFAULT_CAPACITY;
/** 自增序列号，作为日志条目唯一 id（进程级，重启归零） */
let seq = 0;
/** 因缓冲满而被淘汰的日志条数 */
let dropped = 0;
const buffer: RuntimeLogEntry[] = [];

type RuntimeLogListener = (entry: RuntimeLogEntry) => void;
const listeners = new Set<RuntimeLogListener>();

/** 将任意类型的日志 message 规范化为字符串（Error 取 stack，对象 JSON 序列化） */
function formatLogMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.stack || message.message || String(message);
  if (message == null) return String(message);
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/** 将逗号分隔的 level 字符串解析为小写 Set；空输入返回 null（表示不过滤） */
function parseLevelSet(level?: string): Set<string> | null {
  const levelsRaw = level?.trim();
  if (!levelsRaw) return null;
  const levels = new Set(
    levelsRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return levels.size ? levels : null;
}

/** 与 queryRuntimeLogs 相同的单条过滤规则（供 SSE 推送复用） */
export function matchesRuntimeLogFilter(
  entry: RuntimeLogEntry,
  opts: Pick<RuntimeLogQuery, 'level' | 'q' | 'context'> = {},
): boolean {
  const levels = parseLevelSet(opts.level);
  if (levels && !levels.has(entry.level)) return false;

  const contextQ = opts.context?.trim().toLowerCase();
  if (contextQ && !(entry.context || '').toLowerCase().includes(contextQ)) return false;

  const q = opts.q?.trim().toLowerCase();
  if (q) {
    const hay = `${entry.message}\n${entry.context || ''}\n${entry.traceId || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/**
 * 写入一条运行日志（由 Capturing / Structured 日志器调用）。
 */
export function pushRuntimeLog(input: {
  level: RuntimeLogLevel;
  message: unknown;
  context?: string;
  traceId?: string;
  ts?: string;
}): RuntimeLogEntry {
  const entry: RuntimeLogEntry = {
    id: ++seq,
    level: input.level,
    context: input.context || undefined,
    message: formatLogMessage(input.message),
    ts: input.ts || new Date().toISOString(),
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };
  buffer.push(entry);
  while (buffer.length > capacity) {
    buffer.shift();
    dropped += 1;
  }
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // 订阅方异常不影响写缓冲
    }
  }
  return entry;
}

/**
 * 订阅新日志写入（SSE / 测试用）。返回取消订阅函数。
 */
export function subscribeRuntimeLogs(listener: RuntimeLogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 返回缓冲元信息：容量、当前条数、最新条目 id、累计淘汰数（供前端分页与状态展示） */
export function getRuntimeLogMeta(): Pick<
  RuntimeLogQueryResult,
  'capacity' | 'buffered' | 'newestId' | 'dropped'
> {
  return {
    capacity,
    buffered: buffer.length,
    newestId: buffer.length ? buffer[buffer.length - 1].id : 0,
    dropped,
  };
}

/**
 * 查询运行日志，支持增量（afterId 之后）与全量两种模式。
 *
 * - 增量模式（afterId>0）：返回该 id 之后的最早 N 条（时间正序，供 SSE 增量推送）；
 * - 全量模式：返回最近 N 条（时间倒序后截取末尾，即最新 N 条）。
 *
 * @param opts 查询参数（afterId / level / context / q / limit）
 * @returns 匹配的日志条目数组 + 缓冲元信息
 */
export function queryRuntimeLogs(opts: RuntimeLogQuery = {}): RuntimeLogQueryResult {
  let items = buffer.slice();
  const afterId = opts.afterId != null ? Number(opts.afterId) : 0;
  if (Number.isFinite(afterId) && afterId > 0) {
    items = items.filter((e) => e.id > afterId);
  }

  items = items.filter((e) => matchesRuntimeLogFilter(e, opts));

  const limitRaw = opts.limit != null ? Number(opts.limit) : DEFAULT_QUERY_LIMIT;
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_QUERY_LIMIT, 1),
    MAX_QUERY_LIMIT,
  );

  // 全量模式取最近 N 条；增量模式取最早的 N 条（按时间正序）
  if (!(Number.isFinite(afterId) && afterId > 0)) {
    items = items.slice(-limit);
  } else if (items.length > limit) {
    items = items.slice(0, limit);
  }

  return {
    items,
    ...getRuntimeLogMeta(),
  };
}

/** 清空运行日志缓冲，返回被清除的条数 */
export function clearRuntimeLogs(): { cleared: number } {
  const cleared = buffer.length;
  buffer.length = 0;
  return { cleared };
}


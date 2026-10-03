/**
 * 所属模块：backend/common/observability
 * 职责：
 *  - 状态日志去重器：同实体同状态窗口只记一次；
 * 关键依赖：
 *  - structured-logger；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 全局状态日志去重：同一 context + level + 归一化消息在活跃期间只输出一次，
 * 避免轮询 / 配置热重载刷屏。error 级别不走此逻辑。
 *
 * 连接生命周期文案（正在连接/已连接/重连等）始终放行，避免 HA/EEW 重连成功被吞。
 *
 * 抑制期间会刷新 seenAt：只要相同状态仍在被反复打印，就不会因 TTL 到期再次漏出。
 * TTL 仅用于「安静一段时间后允许再确认一次」以及内存裁剪。
 *
 * LOG_STATUS_DEDUPE_MS=0 可关闭；未设置时默认 30 分钟。
 */

const DEFAULT_DEDUPE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 2_000;

type DedupeEntry = { seenAt: number; suppressed: number };

const recent = new Map<string, DedupeEntry>();

/** 解析去重窗口时长：LOG_STATUS_DEDUPE_MS 环境变量（毫秒），非法或未设置回退默认 30 分钟 */
function resolveDedupeMs(): number {
  const raw = process.env.LOG_STATUS_DEDUPE_MS;
  if (raw == null || raw === '') return DEFAULT_DEDUPE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DEDUPE_MS;
  return n;
}

/** 折叠易波动数值，保留较长 ID 类整数，减少误伤。 */
function stabilizeStatusMessage(message: string): string {
  return message
    .replace(/\d+\.\d+/g, '#')
    // 不折叠 km：地震「距离 N km 超过上限」需区分不同事件
    .replace(/\b\d+\s*(ms|s|m|秒|次|条|个|台|房间)\b/gi, '#$1');
}

/** 连接/启停生命周期：允许重复出现，避免重连成功日志被 30 分钟去重吞掉 */
function isLifecycleStatusMessage(text: string): boolean {
  return /正在连接|已连接|连接已建立|已关闭|断开|重连|未连通|将在.*后重试|切换到外网|切换到局域网/.test(
    text,
  );
}

/** 将任意 message 规范化为字符串（对象 JSON 序列化），供去重签名计算 */
function messageToString(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message == null) return String(message);
  if (typeof message === 'object') {
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
  return String(message);
}

/** 裁剪过期与超量的去重条目：超过 MAX_ENTRIES 时按 TTL 清理，仍超则按插入序删除 */
function prune(now: number, ttlMs: number) {
  if (recent.size <= MAX_ENTRIES) return;
  for (const [key, entry] of recent) {
    if (now - entry.seenAt >= ttlMs) recent.delete(key);
    if (recent.size <= MAX_ENTRIES * 0.8) break;
  }
  while (recent.size > MAX_ENTRIES) {
    const first = recent.keys().next().value;
    if (first == null) break;
    recent.delete(first);
  }
}

/**
 * @returns true 应输出；false 应抑制
 */
export function shouldEmitStatusLog(
  level: string,
  context: string | undefined,
  message: unknown,
): boolean {
  if (level === 'error') return true;
  const ttlMs = resolveDedupeMs();
  if (ttlMs <= 0) return true;

  const text = messageToString(message);
  // 空/过短消息不去重
  if (text.length < 4) return true;
  if (isLifecycleStatusMessage(text)) return true;

  const signature = stabilizeStatusMessage(text);
  const key = `${level}|${context || ''}|${signature}`;
  const now = Date.now();
  const prev = recent.get(key);
  if (prev && now - prev.seenAt < ttlMs) {
    prev.suppressed += 1;
    // 轮询期间持续刷新，避免 TTL 与轮询周期对齐时周期性漏出相同状态
    prev.seenAt = now;
    return false;
  }

  recent.set(key, { seenAt: now, suppressed: 0 });
  prune(now, ttlMs);
  return true;
}

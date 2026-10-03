/**
 * 自动化引擎运行态 Redis 持久化助手。
 *
 * 所属模块：backend/modules/automation
 * 职责：将 forPending / lastIntervalFire / lastTimeFireMinute 等去重与计时状态
 *  定期快照到 Redis，重启或 HA 重连后恢复，避免重复触发或计时丢失。
 *  快照 TTL 24h，作为兜底；服务正常停机时也会做一次最终快照。
 * 关键依赖：RedisService（跨副本共享运行态）。
 */
import type { RedisService } from '../../shared/redis/service';

const STATE_KEY = 'homeos:automation:runtime-state';
const SNAPSHOT_TTL_SECONDS = 24 * 3600;

interface AutomationRuntimeSnapshot {
  savedAt: string;
  forPending: Array<[string, number]>;
  lastIntervalFire: Array<[string, number]>;
  lastTimeFireMinute: Array<[string, string]>;
  lastTriggered: Array<[string, number]>;
}

interface AutomationRuntimeStateMaps {
  forPending: Map<string, number>;
  lastIntervalFire: Map<string, number>;
  lastTimeFireMinute: Map<string, string>;
  lastTriggered: Map<string, number>;
}

/** 从 Redis 读取运行态快照；Redis 不可用或损坏时返回 null */
export async function loadAutomationRuntimeSnapshot(
  redis: RedisService,
): Promise<AutomationRuntimeSnapshot | null> {
  try {
    const raw = await redis.get(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutomationRuntimeSnapshot>;
    if (!parsed || !Array.isArray(parsed.forPending)) return null;
    return parsed as AutomationRuntimeSnapshot;
  } catch {
    return null;
  }
}

/**
 * 将运行态快照合并到引擎状态 Map。
 * 过期项（超过 24h 或晚于快照的本地写）不恢复，避免陈旧计时复活。
 */
export function mergeAutomationRuntimeSnapshot(
  snapshot: AutomationRuntimeSnapshot,
  target: AutomationRuntimeStateMaps,
  maxAgeMs = 24 * 3600_000,
): void {
  const savedAt = Date.parse(snapshot.savedAt);
  if (!Number.isFinite(savedAt)) return;
  const now = Date.now();
  const staleCutoff = now - maxAgeMs;

  for (const [key, ts] of snapshot.forPending) {
    if (typeof ts !== 'number' || ts < staleCutoff || ts > now) continue;
    if (!target.forPending.has(key)) target.forPending.set(key, ts);
  }
  for (const [key, ts] of snapshot.lastIntervalFire) {
    if (typeof ts !== 'number' || ts < staleCutoff) continue;
    if (!target.lastIntervalFire.has(key)) target.lastIntervalFire.set(key, ts);
  }
  for (const [key, minute] of snapshot.lastTimeFireMinute) {
    if (typeof minute !== 'string') continue;
    if (!target.lastTimeFireMinute.has(key)) target.lastTimeFireMinute.set(key, minute);
  }
  for (const [key, ts] of snapshot.lastTriggered) {
    if (typeof ts !== 'number' || ts < staleCutoff) continue;
    if (!target.lastTriggered.has(key)) target.lastTriggered.set(key, ts);
  }
}

/** 生成运行态快照对象 */
export function buildAutomationRuntimeSnapshot(
  maps: AutomationRuntimeStateMaps,
): AutomationRuntimeSnapshot {
  return {
    savedAt: new Date().toISOString(),
    forPending: [...maps.forPending.entries()],
    lastIntervalFire: [...maps.lastIntervalFire.entries()],
    lastTimeFireMinute: [...maps.lastTimeFireMinute.entries()],
    lastTriggered: [...maps.lastTriggered.entries()],
  };
}

/** 写入运行态快照（TTL 24h 自动过期，避免长期残留） */
export async function saveAutomationRuntimeSnapshot(
  redis: RedisService,
  snapshot: AutomationRuntimeSnapshot,
): Promise<void> {
  try {
    await redis.set(STATE_KEY, JSON.stringify(snapshot), SNAPSHOT_TTL_SECONDS);
  } catch {
    // Redis 不可用时静默降级：引擎运行态仍保留在内存中
  }
}

/**
 * @file orchestrator-ha-sync-core.util.ts
 * @module backend/src/shared/orchestrator
 */
/** HA 同步核心辅助：id/哈希/规范化 YAML、拉取 upsert、批量同步状态 */
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import type { SyncStatusResult } from './ha-sync.engine';
import { createHash } from 'crypto';

/** 将本地 UUID 转为 HA Config API 用的 config_id 前缀（homeos_ + 下划线替换连字符） */
export function toHaConfigId(localId: string): string {
  return `homeos_${localId.replace(/-/g, '_')}`;
}

/** 对内容做 SHA-256 哈希取前 16 位，用于漂移检测对比 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex').slice(0, 16);
}

/** YAML 经 HA Config 往返规范化，避免 trigger/triggers、action/service 等格式差异误判漂移 */
function canonicalYamlAfterHaRoundTrip(
  yamlStr: string,
  toHaConfig: (yaml: string) => Record<string, unknown>,
  haConfigToYaml: (cfg: Record<string, unknown>) => string,
): string {
  try {
    const cfg = toHaConfig(yamlStr);
    return haConfigToYaml(cfg);
  } catch {
    return yamlStr;
  }
}

/** 场景实体 JSON 经 HA map 往返规范化并按 entityId 排序，供漂移哈希对比（返回规范化字符串） */
export function canonicalEntitiesJson(
  entitiesJson: unknown,
  toHaMap: (json: unknown) => Record<string, Record<string, unknown>>,
  fromHaMap: (map: Record<string, Record<string, unknown>>) => unknown,
): string {
  try {
    const map = toHaMap(entitiesJson);
    const roundTrip = fromHaMap(map);
    const list = (
      Array.isArray(roundTrip)
        ? roundTrip
        : typeof roundTrip === 'string'
          ? JSON.parse(roundTrip || '[]')
          : []
    ) as { entityId?: string; entity_id?: string }[];
    list.sort((a, b) =>
      String(a.entityId || a.entity_id || '').localeCompare(
        String(b.entityId || b.entity_id || ''),
      ),
    );
    return JSON.stringify(list);
  } catch {
    if (typeof entitiesJson === 'string') return entitiesJson;
    try {
      return JSON.stringify(entitiesJson ?? []);
    } catch {
      return '[]';
    }
  }
}

/** 解析 HA 配置目录：系统设置 automation.haConfigDir 优先，其次环境变量 HA_CONFIG_DIR */
export function resolveHaConfigDir(dbPath?: string | null): string | undefined {
  const fromDb = String(dbPath || '').trim();
  const fromEnv = String(process.env.HA_CONFIG_DIR || '').trim();
  return fromDb || fromEnv || undefined;
}

/** automation/script 漂移对比用的本地 YAML 规范化（configId + canonical 内容） */
export function buildOrchestratorYamlLocalContent(
  yaml: string,
  haConfigId: string | null,
  localId: string,
  toHaConfig: (yaml: string, configId: string) => Record<string, unknown>,
  haConfigToYamlFn: (cfg: Record<string, unknown>) => string,
): { configId: string; localContent: string } {
  const configId = haConfigId || toHaConfigId(localId);
  const localContent = canonicalYamlAfterHaRoundTrip(
    yaml,
    (y) => toHaConfig(y, configId),
    haConfigToYamlFn,
  );
  return { configId, localContent };
}

interface OrchestratorPullUpsertResult {
  success: boolean;
  localId?: string;
  message: string;
}

/** automation / scene / script 共用的 pull-from-HA upsert 流程 */
export async function upsertOrchestratorFromHaPull(opts: {
  findExisting: () => Promise<{ id: string } | null>;
  updateExisting: (id: string) => Promise<void>;
  createNew: () => Promise<{ id: string }>;
  updatedMessage: string;
  importedMessage: string;
}): Promise<OrchestratorPullUpsertResult> {
  const existing = await opts.findExisting();
  if (existing) {
    await opts.updateExisting(existing.id);
    return { success: true, localId: existing.id, message: opts.updatedMessage };
  }
  const created = await opts.createNew();
  return { success: true, localId: created.id, message: opts.importedMessage };
}

const DEFAULT_CONCURRENCY = 6;

/** 批量拉取 sync-status，保持 ids 顺序 */
export async function getBulkSyncStatuses(
  ids: string[],
  getSyncStatus: (id: string) => Promise<SyncStatusResult>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<Record<string, SyncStatusResult>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const rows = await mapWithConcurrency(uniqueIds, concurrency, async (id) => {
    try {
      const status = await getSyncStatus(id);
      return { id, status };
    } catch {
      return { id, status: { exists: false } as SyncStatusResult };
    }
  });

  const statuses: Record<string, SyncStatusResult> = {};
  for (const row of rows) {
    statuses[row.id] = row.status;
  }
  return statuses;
}

/** 解析批量 sync-status 的逗号分隔 ID 列表 */
export function parseBulkSyncStatusIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

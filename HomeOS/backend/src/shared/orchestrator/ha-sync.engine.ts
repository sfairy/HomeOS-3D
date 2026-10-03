/**
 * @file ha-sync.engine.ts
 * @module backend/src/shared/orchestrator
 */
/** 联动器 HA 同步引擎：分布式锁、单条/批量推送、拉取、漂移检测与修复 */
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '../app-config/service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import {
  ORCHESTRATOR_HA_CONNECTOR_PORT,
  type OrchestratorHaConnectorPort,
} from './ha-connector.port';
import { hashContent } from './ha-sync.internals';
import { getErrorMessage } from '../../common/utils';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';

/** 批量同步并发上限（mapWithConcurrency 控制） */
const ORCHESTRATOR_BATCH_CONCURRENCY = 8;

/** 判断错误是否为 AbortError（HA REST 请求超时中断） */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** 单条同步结果：成功标记、消息与可选 haConfigId */
export interface SyncResult {
  success: boolean;
  message: string;
}

/**
 * SyncStatusResult：业务接口定义。
 * - 表示：shared/orchestrator/ha-sync.engine.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SyncStatusResult {
  exists: boolean;
  haConfigId?: string | null;
  runOnHa?: boolean;
  haSyncedAt?: string | null;
  synced?: boolean;
  drift?: boolean;
  localHash?: string;
  haHash?: string | null;
  [key: string]: unknown;
}

/** 联动中心 HA 同步共享逻辑（自动化 / 场景 / 脚本 / 模板实体） */
@Injectable()
export class OrchestratorHaSyncEngine implements OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorHaSyncEngine.name);
  private readonly syncErrors = new Map<string, { message: string; at: string }>();
  /** 关机时中止批量 sync/repair/pull，避免进程退出后仍打 HA */
  private readonly lifecycleAbort = new AbortController();

  constructor(
    @Inject(ORCHESTRATOR_HA_CONNECTOR_PORT)
    private readonly haConnector: OrchestratorHaConnectorPort,
    private readonly appConfig: AppConfigService,
    private readonly lockService: DistributedLockService,
  ) {}

  onModuleDestroy() {
    this.lifecycleAbort.abort();
  }

  private get abortSignal(): AbortSignal {
    return this.lifecycleAbort.signal;
  }

  /** F-02：联动器 HA 同步互斥锁（Redis 优先，进程内降级） */
  async runExclusiveSync<T>(scope: string, fn: () => Promise<T>, onBusy?: () => T): Promise<T> {
    try {
      return await this.lockService.runExclusive(`ha-sync:${scope}`, fn, 90_000);
    } catch (e) {
      if (e instanceof ConflictException && onBusy) return onBusy();
      throw e;
    }
  }

  get cfg() {
    return this.appConfig.get('automation');
  }

  recordSyncOutcome(scope: string, success: boolean, message?: string) {
    if (success) {
      this.syncErrors.delete(scope);
      return;
    }
    if (message) {
      this.syncErrors.set(scope, { message, at: new Date().toISOString() });
    }
  }

  getSyncError(scope: string): string | null {
    return this.syncErrors.get(scope)?.message || null;
  }

  getSyncErrorAt(scope: string): string | null {
    return this.syncErrors.get(scope)?.at || null;
  }

  syncStatusErrorFields(scope: string) {
    return {
      lastSyncError: this.getSyncError(scope),
      lastSyncErrorAt: this.getSyncErrorAt(scope),
    };
  }

  /** 仅检查 HA 同步开关（拉取/import 用，不要求 HA 已连接） */
  guardHaSyncEnabled(): SyncResult | null {
    if (!this.cfg.haSyncEnabled) return { success: false, message: 'HA 同步已禁用' };
    return null;
  }

  syncOutcomeFinisher(scope: string) {
    return (result: SyncResult & { haConfigId?: string }, record = true) => {
      if (record) this.recordSyncOutcome(scope, result.success, result.message);
      return result;
    };
  }

  async repairAllDriftLinked(opts: {
    findLinked: () => Promise<{ id: string; name: string }[]>;
    getStatus: (id: string) => Promise<SyncStatusResult>;
    repairOne: (id: string, direction: 'push' | 'pull') => Promise<SyncResult>;
    direction?: 'push' | 'pull';
  }) {
    const list = await opts.findLinked();
    return this.repairAllDrift({
      list,
      getStatus: opts.getStatus,
      repairOne: opts.repairOne,
      direction: opts.direction,
    });
  }

  /** 最近 HA 同步/reload 错误（诊断用） */
  getRecentSyncErrors(limit = 10): Array<{ scope: string; message: string; at: string }> {
    return [...this.syncErrors.entries()]
      .map(([scope, v]) => ({ scope, message: v.message, at: v.at }))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, Math.max(1, limit));
  }

  /** Config API 写入后执行 HA reload；失败时返回警告文案（配置已写入） */
  async tryReloadAfterConfigWrite(
    label: string,
    reload: () => Promise<unknown>,
  ): Promise<string | undefined> {
    try {
      await reload();
      return undefined;
    } catch (e: unknown) {
      const msg = `${label}.reload 失败（Config 已写入）: ${getErrorMessage(e)}`;
      this.logger.warn(msg);
      return msg;
    }
  }

  /** 检查 HA 同步前置条件；通过返回 null */
  async guardHaSync(requireConnected = true): Promise<SyncResult | null> {
    if (!this.cfg.haSyncEnabled) {
      return { success: false, message: 'HA 同步已禁用' };
    }
    if (requireConnected) {
      const status = await this.haConnector.getStatus();
      if (!status.connected) {
        return { success: false, message: 'HA 未连接' };
      }
    }
    return null;
  }

  /** 基于内容哈希的漂移检测 */
  async computeContentDriftStatus(opts: {
    localContent: string;
    haConfigId?: string | null;
    fetchHaConfig: (id: string) => Promise<unknown | null>;
    haContentFromConfig: (cfg: unknown) => string;
    extra?: Record<string, unknown>;
    syncedWhen?: (haFound: boolean, haConfigId: string | null | undefined) => boolean;
  }): Promise<SyncStatusResult> {
    const localHash = hashContent(opts.localContent);
    let haHash: string | null = null;
    let haFound = false;
    if (opts.haConfigId) {
      const cfg = await opts.fetchHaConfig(opts.haConfigId);
      if (cfg) {
        haFound = true;
        haHash = hashContent(opts.haContentFromConfig(cfg));
      }
    }
    const synced = opts.syncedWhen
      ? opts.syncedWhen(haFound, opts.haConfigId)
      : !!opts.haConfigId && haFound;
    // HA 侧配置被删除（haConfigId 存在但 fetch 不到）也视为漂移，
    // 使 repairDrift('push') 能重推被 HA 删除的配置，而非判一致永不重推
    const haMissing = !!opts.haConfigId && !haFound;
    return {
      exists: true,
      synced,
      drift: haMissing || (haHash != null && haHash !== localHash),
      localHash,
      haHash,
      ...opts.extra,
    };
  }

  async repairDrift<T extends SyncResult>(opts: {
    getStatus: (id: string) => Promise<SyncStatusResult>;
    syncFrom: (haConfigId: string) => Promise<T>;
    syncTo: (id: string) => Promise<T>;
    id: string;
    direction: 'push' | 'pull';
    entityLabel: string;
    pullMissingMessage?: string;
  }): Promise<T> {
    const status = await opts.getStatus(opts.id);
    if (!status.exists) return { success: false, message: `${opts.entityLabel}不存在` } as T;
    if (!status.drift) return { success: true, message: '本地与 HA 一致，无需修复' } as T;
    if (opts.direction === 'pull') {
      if (!status.haConfigId) {
        return { success: false, message: opts.pullMissingMessage || '未关联 HA 配置' } as T;
      }
      return opts.syncFrom(status.haConfigId);
    }
    return opts.syncTo(opts.id);
  }

  async repairAllDrift<T extends SyncResult>(opts: {
    list: { id: string; name: string }[];
    getStatus: (id: string) => Promise<SyncStatusResult>;
    repairOne: (id: string, direction: 'push' | 'pull') => Promise<T>;
    direction?: 'push' | 'pull';
  }): Promise<{ repaired: number; failed: number; errors: string[] }> {
    const direction = opts.direction ?? 'push';
    const out = { repaired: 0, failed: 0, errors: [] as string[] };
    const driftRows: typeof opts.list = [];
    try {
      await mapWithConcurrency(
        opts.list,
        ORCHESTRATOR_BATCH_CONCURRENCY,
        async (row) => {
          const st = await opts.getStatus(row.id);
          if (st.drift) driftRows.push(row);
        },
        this.abortSignal,
      );
    } catch (err: unknown) {
      if (isAbortError(err)) {
        out.errors.push('漂移修复已中止（服务关闭）');
        return out;
      }
      throw err;
    }
    try {
      await mapWithConcurrency(
        driftRows,
        ORCHESTRATOR_BATCH_CONCURRENCY,
        async (row) => {
          const r = await opts.repairOne(row.id, direction);
          if (r.success) out.repaired++;
          else {
            out.failed++;
            out.errors.push(`${row.name}: ${r.message}`);
          }
        },
        this.abortSignal,
      );
    } catch (err: unknown) {
      if (isAbortError(err)) {
        out.errors.push('漂移修复已中止（服务关闭）');
        return out;
      }
      throw err;
    }
    return out;
  }

  /** 按本地 ID 删除 HA 配置（未启用同步或无 haConfigId 时静默跳过） */
  async removeFromHAEntry(opts: {
    findHaConfigId: () => Promise<string | null | undefined>;
    removeByConfigId: (haConfigId: string) => Promise<unknown>;
  }): Promise<void> {
    if (!this.cfg.haSyncEnabled) return;
    const haConfigId = await opts.findHaConfigId();
    if (!haConfigId) return;
    await opts.removeByConfigId(haConfigId);
  }

  async syncAll<T extends SyncResult>(opts: {
    domain: string;
    list: { id: string; name: string }[];
    syncOne: (id: string) => Promise<T>;
  }): Promise<{ synced: number; failed: number; errors: string[] }> {
    return this.runExclusiveSync(
      `batch:${opts.domain}`,
      async () => {
        const out = { synced: 0, failed: 0, errors: [] as string[] };
        try {
          await mapWithConcurrency(
            opts.list,
            ORCHESTRATOR_BATCH_CONCURRENCY,
            async (item) => {
              const r = await opts.syncOne(item.id);
              if (r.success) out.synced++;
              else {
                out.failed++;
                out.errors.push(`${item.name}: ${r.message}`);
              }
            },
            this.abortSignal,
          );
        } catch (err: unknown) {
          if (isAbortError(err)) {
            out.errors.push('批量同步已中止（服务关闭）');
            return out;
          }
          throw err;
        }
        return out;
      },
      () => ({ synced: 0, failed: opts.list.length, errors: ['批量同步正在进行中，请稍后重试'] }),
    );
  }

  /** 按 HA domain 实体列表批量拉取（script / scene / automation 等） */
  async pullAllByDomain(opts: {
    domain: string;
    filterConfigId?: (configId: string) => boolean;
    syncFrom: (configId: string) => Promise<SyncResult>;
    findExisting: (configId: string) => Promise<unknown | null>;
  }): Promise<{ imported: number; updated: number; errors: string[] }> {
    return this.runExclusiveSync(
      `pull:${opts.domain}`,
      async () => {
        const result = { imported: 0, updated: 0, errors: [] as string[] };
        const guard = await this.guardHaSync(true);
        if (guard) {
          result.errors.push(guard.message);
          return result;
        }
        const entities = await this.haConnector.fetchEntitiesByDomain(opts.domain);
        try {
          await mapWithConcurrency(
            entities,
            ORCHESTRATOR_BATCH_CONCURRENCY,
            async (entity) => {
              const attrs = (entity.attributes || {}) as Record<string, unknown>;
              const configId = String(attrs.id || entity.entity_id.replace(`${opts.domain}.`, ''));
              if (!configId) return;
              if (opts.filterConfigId && !opts.filterConfigId(configId)) return;
              try {
                const before = await opts.findExisting(configId);
                const r = await opts.syncFrom(configId);
                if (r.success) {
                  if (before) result.updated++;
                  else result.imported++;
                } else if (r.message) {
                  result.errors.push(`${configId}: ${r.message}`);
                }
              } catch (e: unknown) {
                result.errors.push(`${configId}: ${getErrorMessage(e)}`);
              }
            },
            this.abortSignal,
          );
        } catch (err: unknown) {
          if (isAbortError(err)) {
            result.errors.push('批量拉取已中止（服务关闭）');
          } else {
            throw err;
          }
        }
        return result;
      },
      () => ({ imported: 0, updated: 0, errors: ['批量拉取正在进行中，请稍后重试'] }),
    );
  }

  /** 通过 Config API 删除 HA 配置并清理本地关联 */
  async removeByConfigId(opts: {
    haDomain: 'automation' | 'script' | 'scene';
    haConfigId: string;
    entityId?: string;
    name?: string;
    entityLabel: string;
    deleteConfig: (resolvedId: string) => Promise<unknown>;
    reload: () => Promise<unknown>;
    clearLocal: (haConfigId: string, resolvedId: string) => Promise<unknown>;
    formatError?: (msg: string, resolvedId: string, haConfigId: string) => string;
  }): Promise<SyncResult> {
    if (!this.cfg.haSyncEnabled) {
      return { success: false, message: 'HA 同步未启用' };
    }
    if (!opts.haConfigId?.trim()) {
      return { success: false, message: `缺少${opts.entityLabel}配置 ID` };
    }
    const label = opts.name || opts.haConfigId;
    const resolvedId = await this.haConnector.resolveConfigIdForDelete(
      opts.haDomain,
      opts.haConfigId,
      opts.entityId,
    );
    try {
      await opts.deleteConfig(resolvedId);
      try {
        await opts.reload();
      } catch (e: unknown) {
        this.logger.warn(`${opts.haDomain}.reload 失败(配置已删除): ${getErrorMessage(e)}`);
      }
      await opts.clearLocal(opts.haConfigId, resolvedId);
      this.logger.log(`已从 HA 删除${opts.entityLabel} ${resolvedId}`);
      return { success: true, message: `已从 HA 删除${opts.entityLabel}「${label}」` };
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      const full = opts.formatError ? opts.formatError(msg, resolvedId, opts.haConfigId) : msg;
      this.logger.warn(`从 HA 删除${opts.entityLabel}失败: ${full}`);
      return { success: false, message: full };
    }
  }
}

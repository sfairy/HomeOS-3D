/**
 * 场景叠加执行快照服务。
 *
 * 所属模块：backend/modules/scene
 * 职责：
 *  - 叠加执行前/后实体状态快照的采集、持久化与过期清理
 *  - POST /scene/:id/cancel 恢复执行前状态
 *  - 执行失败时的实体回滚（rollbackOnFailure）
 * 关键依赖：PrismaService（快照持久化）、HaConnectorService（HA 服务调用恢复状态）、
 *  AppConfigService（快照 TTL 配置）、JobRegistryService（过期快照定时清理）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { HaConnectorService } from '../ha-connector/service';
import { AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import { buildSnapshotRestoreCalls } from '../../shared/orchestrator/snapshot-restore.util';
import { type SceneEntityConfig } from '../../shared/orchestrator/config.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { readJsonObject, toInputJson } from '../../common/utils/json-field.util';

/**
 * 叠加执行快照条目：
 * - state/attributes：场景执行前采集的实体状态（取消恢复目标）；
 * - after：场景执行后采集的目标基线。取消恢复前与当前状态对比——
 *   当前状态与 after 一致说明实体未被外部改动，可安全恢复 before；
 *   不一致说明用户在场景执行后又手动调整过该实体，跳过以免覆盖用户操作。
 */
interface OverlaySnapshotEntity {
  state?: string;
  attributes?: Record<string, unknown>;
  after?: { state?: string; attributes?: Record<string, unknown> } | null;
}

/** 叠加执行快照 Map：实体 ID → 快照条目 */
export type OverlaySnapshotMap = Record<string, OverlaySnapshotEntity>;

@Injectable()
/**
 * SceneOverlayService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class SceneOverlayService
 */
export class SceneOverlayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SceneOverlayService.name);

  /** 叠加执行快照不设限时的远期时间戳（2999-12-31，JSONB 可序列化） */
  private static readonly OVERLAY_SNAPSHOT_UNLIMITED_TS = 32_500_000_000_000;
  /** 叠加执行快照过期清理周期：10 分钟 */
  private static readonly OVERLAY_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
  /** 叠加快照采集/恢复的实体并发上限（与 home-mode 一致） */
  private static readonly OVERLAY_FETCH_CONCURRENCY = 8;
  /**
   * 叠加快照在 RuntimeKv 专用行的 id 前缀（每场景一行，行 id = 前缀 + sceneId）。
   * 快照（实体状态 Map + 过期时间戳）持久化到该行 data（JSONB），
   * 服务重启后由此恢复内存快照，保证 POST /scene/:id/cancel 仍可恢复实体。
   */
  private static readonly OVERLAY_SNAPSHOT_ROW_PREFIX = 'scene-overlay-snapshot:';

  /** 叠加执行快照（sceneId → 执行前声明实体快照），仅 overlay 场景执行时写入；执行时同步持久化到 DB */
  private readonly overlaySnapshots = new Map<
    string,
    {
      snapshot: OverlaySnapshotMap;
      expiresAt: number;
    }
  >();
  /** 快照过期清理定时器 */
  private overlayCleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly jobs: JobRegistryService,
  ) {}

  /** 启动叠加执行快照过期清理定时器，并从 DB 恢复持久化的快照 */
  onModuleInit() {
    this.overlayCleanupTimer = setInterval(() => {
      void this.jobs
        .run(
          'scene-overlay-cleanup',
          {
            description: '场景叠加执行快照过期清理',
            intervalMs: SceneOverlayService.OVERLAY_PRUNE_INTERVAL_MS,
          },
          () => this.pruneOverlaySnapshots(),
        )
        .catch(() => {
          // jobs.run 已记录错误，避免 unhandled rejection
        });
    }, SceneOverlayService.OVERLAY_PRUNE_INTERVAL_MS);
    this.overlayCleanupTimer.unref?.();
    // 服务重启后从 DB 加载未过期的叠加执行快照（过期行顺带清理），保证取消接口仍可用
    void this.restoreOverlaySnapshotsFromDb();
  }

  /** 停止定时器并清空内存快照（快照已持久化到 DB，进程退出不丢数据） */
  onModuleDestroy() {
    if (this.overlayCleanupTimer) {
      clearInterval(this.overlayCleanupTimer);
      this.overlayCleanupTimer = null;
    }
    this.overlaySnapshots.clear();
  }

  /** 叠加执行快照可取消 TTL（分钟，从 ops.sceneOverlayUndoTtlMin 配置读取；0=不设限） */
  private get overlaySnapshotTtlMs(): number {
    const minutes = Number(this.appConfig.get('ops').sceneOverlayUndoTtlMin);
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.min(Math.round(minutes), 24 * 60) * 60 * 1000;
  }

  /** 清理已过期的叠加执行快照（惰性清理 + 定时兜底），并同步清理 DB 中对应的过期行 */
  private pruneOverlaySnapshots() {
    const now = Date.now();
    const expiredRowIds: string[] = [];
    for (const [id, entry] of this.overlaySnapshots) {
      if (entry.expiresAt < now) {
        this.overlaySnapshots.delete(id);
        expiredRowIds.push(this.overlaySnapshotRowId(id));
      }
    }
    if (expiredRowIds.length) {
      // DB 清理为兜底，失败仅告警
      this.prisma.runtimeKv
        .deleteMany({ where: { id: { in: expiredRowIds } } })
        .catch((err) => {
          this.logger.warn(`清理过期叠加执行快照失败: ${getErrorMessage(err)}`);
        });
    }
  }

  /** 叠加快照在 RuntimeKv 的专用行主键（每场景一行） */
  private overlaySnapshotRowId(sceneId: string): string {
    return `${SceneOverlayService.OVERLAY_SNAPSHOT_ROW_PREFIX}${sceneId}`;
  }

  /**
   * 服务启动时从 DB 恢复叠加执行快照到内存。
   * 仅加载未过期的条目；过期/格式非法的行顺带删除，避免残留。
   */
  private async restoreOverlaySnapshotsFromDb() {
    try {
      const rows = await this.prisma.runtimeKv.findMany({
        where: { id: { startsWith: SceneOverlayService.OVERLAY_SNAPSHOT_ROW_PREFIX } },
        take: 1000,
      });
      const now = Date.now();
      const expiredRowIds: string[] = [];
      for (const row of rows) {
        const sceneId = String(row.id).slice(
          SceneOverlayService.OVERLAY_SNAPSHOT_ROW_PREFIX.length,
        );
        const entry = this.parseOverlaySnapshotRow(row.data);
        if (!entry || entry.expiresAt < now) {
          expiredRowIds.push(row.id);
          continue;
        }
        this.overlaySnapshots.set(sceneId, entry);
      }
      if (expiredRowIds.length) {
        await this.prisma.runtimeKv.deleteMany({ where: { id: { in: expiredRowIds } } });
      }
      if (rows.length) {
        this.logger.log(
          `已从 DB 恢复 ${this.overlaySnapshots.size}/${rows.length} 个叠加执行快照`,
        );
      }
    } catch (err) {
      this.logger.warn(`加载叠加执行快照失败: ${getErrorMessage(err)}`);
    }
  }

  /** 解析 RuntimeKv 行 data 为叠加执行快照条目（JSONB 对象直通；格式非法返回 null） */
  private parseOverlaySnapshotRow(
    data: unknown,
  ): {
    snapshot: OverlaySnapshotMap;
    expiresAt: number;
  } | null {
    const raw = readJsonObject(data);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const expiresAt = Number(raw.expiresAt);
    const snapshot = raw.snapshot;
    if (
      !Number.isFinite(expiresAt) ||
      !snapshot ||
      typeof snapshot !== 'object' ||
      Array.isArray(snapshot)
    ) {
      return null;
    }
    return {
      snapshot: snapshot as OverlaySnapshotMap,
      expiresAt,
    };
  }

  /**
   * 将叠加执行快照持久化到 DB（RuntimeKv 专用行，行 id = 前缀 + sceneId）。
   * 失败仅告警，不阻断场景执行（内存快照仍即时生效）。
   */
  private async persistOverlaySnapshotToDb(
    sceneId: string,
    entry: { snapshot: OverlaySnapshotMap; expiresAt: number },
  ) {
    try {
      const data = toInputJson({ snapshot: entry.snapshot, expiresAt: entry.expiresAt }, {});
      await this.prisma.runtimeKv.upsert({
        where: { id: this.overlaySnapshotRowId(sceneId) },
        create: { id: this.overlaySnapshotRowId(sceneId), data },
        update: { data },
      });
    } catch (err) {
      this.logger.warn(`持久化叠加执行快照失败 (${sceneId}): ${getErrorMessage(err)}`);
    }
  }

  /** 清除 DB 中的叠加执行快照（cancel 成功后调用），失败仅告警 */
  private async clearOverlaySnapshotFromDb(sceneId: string) {
    try {
      await this.prisma.runtimeKv.deleteMany({
        where: { id: this.overlaySnapshotRowId(sceneId) },
      });
    } catch (err) {
      this.logger.warn(`清除叠加执行快照失败 (${sceneId}): ${getErrorMessage(err)}`);
    }
  }

  /**
   * 写入叠加执行快照到内存并持久化（含 TTL）。
   * @returns cancelable：快照是否含可恢复实体
   */
  async storeOverlaySnapshot(sceneId: string, snapshot: OverlaySnapshotMap): Promise<boolean> {
    const ttl = this.overlaySnapshotTtlMs;
    const entry = {
      snapshot,
      // TTL 为 0 时使用远期时间戳（2999-12-31），表示不设限
      expiresAt: ttl > 0 ? Date.now() + ttl : SceneOverlayService.OVERLAY_SNAPSHOT_UNLIMITED_TS,
    };
    this.overlaySnapshots.set(sceneId, entry);
    await this.persistOverlaySnapshotToDb(sceneId, entry);
    return Object.keys(snapshot).length > 0;
  }

  /**
   * 场景执行完成后采集「目标基线」并写回内存/DB，供取消接口区分外部改动。
   */
  async refreshOverlayAfterBaseline(sceneId: string, entityConfigs: SceneEntityConfig[]) {
    const entry = this.overlaySnapshots.get(sceneId);
    if (!entry) return;
    await this.captureOverlayAfterBaseline(entityConfigs, entry.snapshot);
    await this.persistOverlaySnapshotToDb(sceneId, entry);
  }

  /**
   * 采集叠加场景「执行前快照」：仅覆盖场景声明的实体（去重），
   * 逐实体抓取 {state, attributes}，供取消接口恢复执行前状态。
   * 单实体采集失败不中断整体（该实体缺失时取消恢复自动跳过）。
   */
  async captureOverlaySnapshot(entityConfigs: SceneEntityConfig[]): Promise<OverlaySnapshotMap> {
    const entityIds = [
      ...new Set(
        entityConfigs
          .map((c) => String(c.entity_id || c.entityId || '').trim())
          .filter(Boolean),
      ),
    ];
    const snapshot: OverlaySnapshotMap = {};
    await mapWithConcurrency(
      entityIds,
      SceneOverlayService.OVERLAY_FETCH_CONCURRENCY,
      async (entityId) => {
        try {
          const s = await this.haConnector.fetchEntityState(entityId);
          if (s) snapshot[entityId] = { state: s.state, attributes: s.attributes };
        } catch {
          this.logger.warn(`采集叠加执行快照失败: ${entityId}`);
        }
      },
    );
    return snapshot;
  }

  /**
   * 场景执行完成后采集「目标基线」：抓取各实体执行后的状态写入快照 after 字段。
   * 取消恢复时若当前状态与 after 一致（实体未被外部改动）才恢复 before，
   * 否则视为用户/其他自动化手动调整过，跳过该实体以免覆盖外部操作。
   * 采集失败或状态未及时同步的实体保留 after=null（退化为指纹去重）。
   */
  private async captureOverlayAfterBaseline(
    entityConfigs: SceneEntityConfig[],
    snapshot: OverlaySnapshotMap,
  ) {
    const entityIds = [
      ...new Set(
        entityConfigs
          .map((c) => String(c.entity_id || c.entityId || '').trim())
          .filter(Boolean),
      ),
    ];
    await mapWithConcurrency(
      entityIds,
      SceneOverlayService.OVERLAY_FETCH_CONCURRENCY,
      async (entityId) => {
        try {
          const s = await this.haConnector.fetchEntityState(entityId);
          if (!s || !snapshot[entityId]) return;
          snapshot[entityId].after = { state: s.state, attributes: s.attributes };
        } catch {
          /* 保持 after=null，取消时退化为指纹去重 */
        }
      },
    );
  }

  /** 当前实体 state+attributes 指纹与给定基线是否一致 */
  private snapshotFingerprintMatches(
    current: { state?: string; attributes?: Record<string, unknown> } | null | undefined,
    baseline: { state?: string; attributes?: Record<string, unknown> } | null | undefined,
  ): boolean {
    if (!current || !baseline) return false;
    if (current.state !== baseline.state) return false;
    return JSON.stringify(current.attributes ?? null) === JSON.stringify(baseline.attributes ?? null);
  }

  /**
   * 将指定实体集合从执行前快照恢复（自动回滚用）。
   * 恢复前读取当前状态：与执行前快照一致则跳过（无需重复下发）；
   * 恢复失败不中断其它实体。
   */
  async rollbackEntitiesFromSnapshot(
    snapshot: OverlaySnapshotMap,
    entityIds: string[],
  ): Promise<number> {
    let restored = 0;
    const targets = [...new Set(entityIds.filter((id) => snapshot[id]))];
    await mapWithConcurrency(
      targets,
      SceneOverlayService.OVERLAY_FETCH_CONCURRENCY,
      async (entityId) => {
        try {
          const snap = snapshot[entityId];
          const current = await this.haConnector.fetchEntityState(entityId);
          if (current && this.snapshotFingerprintMatches(current, snap)) {
            // 已与执行前一致，无需重复下发
            return;
          }
          const calls = buildSnapshotRestoreCalls(entityId, snap);
          for (const call of calls) {
            await this.haConnector.callService(
              call.domain,
              call.service,
              call.entityId,
              call.data,
            );
          }
          restored++;
        } catch {
          this.logger.warn(`场景自动回滚恢复失败: ${entityId}`);
        }
      },
    );
    return restored;
  }

  /**
   * 取消场景执行：恢复到该场景最近一次叠加执行前的快照，并清除快照。
   * 复用 buildSnapshotRestoreCalls（按 domain 计算 HA 服务调用序列），
   * 仅恢复快照中声明的实体，不触碰未声明实体。
   */
  async cancel(id: string) {
    const entry = this.overlaySnapshots.get(id);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) {
        this.overlaySnapshots.delete(id);
        // 过期快照同步清除 DB 行，避免残留
        await this.clearOverlaySnapshotFromDb(id);
      }
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCENE_CANCEL_NO_SNAPSHOT);
    }
    const haStatus = await this.haConnector.getStatus();
    if (!haStatus.connected) {
      throw new ServiceUnavailableException(API_ERROR.HA_SCENE_NOT_CONNECTED);
    }
    const entries = Object.entries(entry.snapshot);
    if (entries.length === 0) {
      this.overlaySnapshots.delete(id);
      // 无实体快照：同步清除 DB 行，取消不可用
      await this.clearOverlaySnapshotFromDb(id);
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCENE_CANCEL_NO_SNAPSHOT);
    }
    let restored = 0;
    let skipped = 0;
    await mapWithConcurrency(
      entries,
      SceneOverlayService.OVERLAY_FETCH_CONCURRENCY,
      async ([entityId, snap]) => {
        try {
          // 恢复前读取当前状态：避免旧快照覆盖用户在场景执行后的手动调整
          const current = await this.haConnector.fetchEntityState(entityId);
          if (current) {
            if (snap.after && !this.snapshotFingerprintMatches(current, snap.after)) {
              // 有目标基线且当前状态与基线不一致 → 实体被外部改动，跳过恢复
              skipped++;
              this.logger.warn(
                `场景取消:${entityId} 在场景执行后已被外部改动,跳过快照恢复`,
              );
              return;
            }
            if (this.snapshotFingerprintMatches(current, snap)) {
              // 已与执行前快照一致，无需重复下发
              return;
            }
          }
          const calls = buildSnapshotRestoreCalls(entityId, snap);
          for (const call of calls) {
            await this.haConnector.callService(
              call.domain,
              call.service,
              call.entityId,
              call.data,
            );
          }
          restored++;
        } catch {
          this.logger.warn(`场景取消恢复失败: ${entityId}`);
        }
      },
    );
    this.overlaySnapshots.delete(id);
    // 取消恢复成功后清除 DB 中的叠加执行快照，避免残留 / 过期后误恢复
    await this.clearOverlaySnapshotFromDb(id);
    this.logger.log(
      `场景 ${id} 执行已取消,恢复 ${restored}/${entries.length} 个实体${skipped ? `，跳过外部改动 ${skipped} 个` : ''}`,
    );
    return { success: true, restored, skipped, total: entries.length };
  }
}

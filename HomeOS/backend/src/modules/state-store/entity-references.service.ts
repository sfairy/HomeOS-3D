/**
 * 实体反向引用查询与解绑服务
 *
 * 所属模块：state-store
 * 职责：
 *  - 编排类资源（自动化/脚本/模板/场景/告警/家庭模式）引用由 entity-references-index 倒排索引覆盖
 *  - 布局 / 系统配置引用由 entity-references-scanners.helper 按实体补扫
 *  - 倒排索引 + 60s TTL 缓存抑制面板重渲染导致的重复扫描
 *  - 委托 entity-references-unlink 执行解绑，并在编排资源变更后触发 HA auto-sync
 * 依赖：PrismaService、AppConfigService、UiConfigService、AlertRuleWatchIndexService、ModuleRef（懒加载 HomeMode/Notification Service）
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { UiConfigService } from '../ui-config/service';
import { AlertRuleWatchIndexService } from '../../shared/ha/watch-index.services';
import type {
  EntityReferenceItem,
  EntityReferenceKind,
  EntityReferenceUnlinkRequest,
  EntityReferenceUnlinkResult,
  EntityReferencesResponse,
} from './entity-references.types';
import { unlinkEntityReference, type OrchestratorUnlinkKind } from './entity-references-unlink';
import { buildEntityReferencesInvertedIndex } from './entity-references-index';
import { scanLayoutAndSystem } from './entity-references-scanners.helper';
import { maybeAutoSyncOnSave } from '../../shared/orchestrator/auto-sync.util';

/**
 * 实体反向引用服务
 *
 * DI 角色：@Injectable，由 StateStoreModule 提供。通过 ModuleRef 懒加载 HomeMode / Notification
 * 等跨模块 Service，避免循环依赖。引用扫描结果按 kind + name 排序，支持短 TTL 缓存。
 */
@Injectable()
export class EntityReferencesService {
  private readonly logger = new Logger(EntityReferencesService.name);

  /** 短 TTL 缓存：抑制同一实体的重复扫描（面板重渲染/多组件并发查询） */
  private readonly refCache = new Map<string, { at: number; data: EntityReferencesResponse }>();
  /** 倒排索引：entityId → 引用项；一次全表扫描服务多次查询 */
  private invertedIndex: Map<string, EntityReferenceItem[]> | null = null;
  private invertedIndexAt = 0;
  private invertedIndexBuild: Promise<void> | null = null;
  private static readonly REF_CACHE_TTL_MS = 60_000;
  private static readonly INDEX_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly uiConfig: UiConfigService,
    private readonly alertRuleWatchIndex: AlertRuleWatchIndexService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * 查询指定实体的反向引用（优先倒排索引 O(1)，未命中时回退单实体扫描）。
   * @param entityId 实体 ID（须含域前缀）
   */
  async findReferences(entityId: string): Promise<EntityReferencesResponse> {
    const id = String(entityId || '').trim();
    if (!id || !id.includes('.')) {
      return { entityId: id, total: 0, counts: {}, items: [] };
    }

    const cached = this.refCache.get(id);
    if (cached && Date.now() - cached.at < EntityReferencesService.REF_CACHE_TTL_MS) {
      return cached.data;
    }

    await this.ensureInvertedIndex();
    const items: EntityReferenceItem[] = [...(this.invertedIndex?.get(id) ?? [])];
    // 布局 / 系统配置异构且体量小，仍按实体补扫并合并
    await scanLayoutAndSystem(
      { prisma: this.prisma, appConfig: this.appConfig, logger: this.logger },
      id,
      items,
    );

    const result = this.toResponse(id, items);
    this.refCache.set(id, { at: Date.now(), data: result });
    return result;
  }

  private toResponse(entityId: string, rawItems: EntityReferenceItem[]): EntityReferencesResponse {
    const items = [...rawItems].sort((a, b) => {
      const kindCmp = a.kind.localeCompare(b.kind);
      if (kindCmp !== 0) return kindCmp;
      return a.name.localeCompare(b.name, 'zh');
    });
    const counts: Partial<Record<EntityReferenceKind, number>> = {};
    for (const item of items) {
      counts[item.kind] = (counts[item.kind] || 0) + 1;
    }
    return { entityId, total: items.length, counts, items };
  }

  /** 失效全部引用缓存与倒排索引（解绑 / 编排变更后） */
  private invalidateReferenceIndex() {
    this.refCache.clear();
    this.invertedIndex = null;
    this.invertedIndexAt = 0;
  }

  private async ensureInvertedIndex(): Promise<void> {
    if (
      this.invertedIndex &&
      Date.now() - this.invertedIndexAt < EntityReferencesService.INDEX_TTL_MS
    ) {
      return;
    }
    if (this.invertedIndexBuild) {
      await this.invertedIndexBuild;
      return;
    }
    this.invertedIndexBuild = buildEntityReferencesInvertedIndex(this.prisma)
      .then((map) => {
        this.invertedIndex = map;
        this.invertedIndexAt = Date.now();
      })
      .catch((err) => {
        this.logger.warn(
          `实体引用倒排索引构建失败: ${getErrorMessage(err)}`,
        );
        this.invertedIndex = this.invertedIndex ?? new Map();
        this.invertedIndexAt = Date.now();
      })
      .finally(() => {
        this.invertedIndexBuild = null;
      });
    await this.invertedIndexBuild;
  }

  /**
   * 从指定配置中移除对实体的引用，并返回剩余引用快照。
   * @param entityId 目标实体 ID
   * @param req 解绑请求
   * @returns 操作结果（含 action / message）与更新后的 remaining 引用列表
   * @remarks 解绑后失效缓存，确保 remaining 反映最新状态。updateHomeMode / deleteAlertRule 回调
   *          通过 ModuleRef 懒加载对应 Service，失败时回退直接写库。
   */
  async removeReference(
    entityId: string,
    req: EntityReferenceUnlinkRequest,
  ): Promise<EntityReferenceUnlinkResult> {
    const id = String(entityId || '').trim();
    const outcome = await unlinkEntityReference(
      {
        prisma: this.prisma,
        appConfig: this.appConfig,
        uiConfig: this.uiConfig,
        alertRuleWatchIndex: this.alertRuleWatchIndex,
        updateHomeMode: async (modeId, data) => {
          try {
            const { HomeModeService } = await import('../home-mode/service');
            const svc = this.moduleRef.get(HomeModeService, { strict: false }) as
              | {
                  update?: (
                    id: string,
                    payload: { config?: unknown; triggers?: unknown },
                  ) => Promise<unknown>;
                }
              | undefined;
            if (svc?.update) return svc.update(modeId, data);
          } catch (err) {
            this.logger.warn(
              `家庭模式服务不可用,回退写库: ${getErrorMessage(err)}`,
            );
          }
          return this.prisma.homeMode.update({
            where: { id: modeId },
            data: {
              ...(data.config !== undefined
                ? { config: data.config as import('../../generated/prisma/client').Prisma.InputJsonValue }
                : {}),
              ...(data.triggers !== undefined
                ? {
                    triggers: data.triggers as import('../../generated/prisma/client').Prisma.InputJsonValue,
                  }
                : {}),
            },
          });
        },
        deleteAlertRule: async (ruleId: string) => {
          try {
            const { NotificationService } = await import('../notification/service');
            const svc = this.moduleRef.get(NotificationService, { strict: false }) as
              | { deleteRule?: (id: string) => Promise<{ success: boolean }> }
              | undefined;
            if (svc?.deleteRule) return svc.deleteRule(ruleId);
          } catch (err) {
            this.logger.warn(
              `通知服务删除规则不可用: ${getErrorMessage(err)}`,
            );
          }
          try {
            await this.prisma.alertRule.delete({ where: { id: ruleId } });
            const remaining = await this.prisma.alertRule.findMany({
              where: { enabled: true },
              select: { entityId: true, enabled: true },
              take: 1000,
            });
            this.alertRuleWatchIndex.updateFromRules(
              remaining.map((r) => ({
                entityId: r.entityId ?? undefined,
                enabled: r.enabled,
              })),
            );
            return { success: true };
          } catch {
            return { success: false };
          }
        },
        afterOrchestratorUpdate: (kind: OrchestratorUnlinkKind, resourceId: string) => {
          void this.triggerOrchestratorHaSync(kind, resourceId);
        },
      },
      id,
      req,
    );

    // 解绑后失效缓存与倒排索引，确保 remaining 反映最新引用
    this.invalidateReferenceIndex();
    const remaining = await this.findReferences(id);
    return {
      entityId: id,
      ok: outcome.ok,
      action: outcome.action,
      message: outcome.message,
      remaining,
    };
  }

  /**
   * 编排资源（自动化/脚本/模板/场景）解绑后触发 HA auto-sync 与引擎重载。
   * @param kind 资源类型
   * @param resourceId 资源 ID
   * @remarks 通过 ModuleRef 懒加载对应 HaSyncService；自动化额外触发 AutomationEngine.reloadRules。
   *          auto-sync 受 automation 配置开关控制（maybeAutoSyncOnSave）。
   */
  private async triggerOrchestratorHaSync(kind: OrchestratorUnlinkKind, resourceId: string) {
    const labels: Record<OrchestratorUnlinkKind, string> = {
      automation: '自动化引用移除后 HA 同步',
      script: '脚本引用移除后 HA 同步',
      scene: '场景引用移除后 HA 同步',
      template: '模板引用移除后 HA 同步',
    };
    const label = labels[kind];

    const scheduleSync = (
      syncToHA?: (id: string) => Promise<{ success: boolean; message?: string }>,
    ) => {
      if (!syncToHA) return;
      maybeAutoSyncOnSave(this.appConfig.get('automation'), this.logger, label, () =>
        syncToHA(resourceId),
      );
    };

    type HaSyncLike = { syncToHA?: (id: string) => Promise<{ success: boolean; message?: string }> };

    try {
      const loaders: Record<
        OrchestratorUnlinkKind,
        () => Promise<{ haSync?: HaSyncLike; after?: () => Promise<void> }>
      > = {
        automation: async () => {
          const { AutomationHaSyncService } = await import(
            '../automation/ha-sync.service'
          );
          const haSync = this.moduleRef.get(AutomationHaSyncService, { strict: false }) as
            | HaSyncLike
            | undefined;
          return {
            haSync,
            after: async () => {
              try {
                const { AutomationEngineService } = await import(
                  '../automation/engine.service'
                );
                const engine = this.moduleRef.get(AutomationEngineService, { strict: false }) as
                  | { reloadRules?: () => Promise<unknown> }
                  | undefined;
                await engine?.reloadRules?.();
              } catch {
                /* 可选 */
              }
            },
          };
        },
        script: async () => {
          const { ScriptHaSyncService } = await import('../script/ha-sync.service');
          return {
            haSync: this.moduleRef.get(ScriptHaSyncService, { strict: false }) as
              | HaSyncLike
              | undefined,
          };
        },
        scene: async () => {
          const { SceneHaSyncService } = await import('../scene/ha-sync.service');
          return {
            haSync: this.moduleRef.get(SceneHaSyncService, { strict: false }) as
              | HaSyncLike
              | undefined,
          };
        },
        template: async () => {
          const { TemplateEntityHaSyncService } = await import(
            '../template-entity/ha-sync.service'
          );
          return {
            haSync: this.moduleRef.get(TemplateEntityHaSyncService, { strict: false }) as
              | HaSyncLike
              | undefined,
          };
        },
      };

      const { haSync, after } = await loaders[kind]();
      scheduleSync(haSync?.syncToHA);
      await after?.();
    } catch (err) {
      this.logger.warn(`${label}不可用: ${getErrorMessage(err)}`);
    }
  }

  /** 去重推入引用项（按 kind:id:role:detail 维度去重） */
}

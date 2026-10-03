/**
 * @file orchestrator-crud-ha-sync.util.ts
 * @module backend/src/shared/orchestrator
 */
/** 联动器 CRUD 的 HA 同步工厂：修复/全量同步/删除/全量拉取 */
import type { OrchestratorHaSyncEngine, SyncResult, SyncStatusResult } from './ha-sync.engine';

type RemoveFromHAOptions = {
  entityId?: string;
  name?: string;
  haConfigEntryId?: string;
};

/** repairDrift / repairAllDrift / syncAllToHA / removeFromHA 共用绑定 */
export function createOrchestratorCrudMethods(deps: {
  syncEngine: OrchestratorHaSyncEngine;
  domain: string;
  entityLabel: string;
  pullMissingMessage?: string;
  findLinked: () => Promise<{ id: string; name: string }[]>;
  findAll: () => Promise<{ id: string; name: string }[]>;
  getSyncStatus: (id: string) => Promise<SyncStatusResult>;
  syncFromHA: (haConfigId: string) => Promise<SyncResult>;
  syncToHA: (id: string) => Promise<SyncResult & { haConfigId?: string }>;
  findHaConfigId: (id: string) => Promise<string | null | undefined>;
  removeFromHAByConfigId: (
    haConfigId: string,
    options?: RemoveFromHAOptions,
  ) => Promise<SyncResult>;
  /** 模板实体等需额外删除上下文（entryId / entityId）时使用 */
  resolveRemoveContext?: (id: string) => Promise<
    | {
        haConfigId: string;
        options?: RemoveFromHAOptions;
      }
    | null
    | undefined
  >;
}) {
  const { syncEngine } = deps;
  const methods = {
    repairDrift(id: string, direction: 'push' | 'pull' = 'push') {
      return syncEngine.repairDrift({
        getStatus: deps.getSyncStatus,
        syncFrom: deps.syncFromHA,
        syncTo: deps.syncToHA,
        id,
        direction,
        entityLabel: deps.entityLabel,
        pullMissingMessage: deps.pullMissingMessage,
      });
    },

    repairAllDrift(direction: 'push' | 'pull' = 'push') {
      return syncEngine.repairAllDriftLinked({
        findLinked: deps.findLinked,
        getStatus: deps.getSyncStatus,
        repairOne: (id, dir) => methods.repairDrift(id, dir),
        direction,
      });
    },

    async syncAllToHA() {
      return syncEngine.syncAll({
        domain: deps.domain,
        list: await deps.findAll(),
        syncOne: deps.syncToHA,
      });
    },

    async removeFromHA(id: string) {
      if (deps.resolveRemoveContext) {
        const ctx = await deps.resolveRemoveContext(id);
        if (!ctx) return;
        await deps.removeFromHAByConfigId(ctx.haConfigId, ctx.options);
        return;
      }
      await syncEngine.removeFromHAEntry({
        findHaConfigId: () => deps.findHaConfigId(id),
        removeByConfigId: deps.removeFromHAByConfigId,
      });
    },
  };
  return methods;
}

/** automation / scene / script 共用的 pullAllFromHA 工厂 */
export function createStandardPullAllFromHA(deps: {
  syncEngine: OrchestratorHaSyncEngine;
  domain: 'automation' | 'scene' | 'script' | string;
  syncFrom: (configId: string) => Promise<SyncResult>;
  findExisting: (configId: string) => Promise<{ id: string } | null>;
  filterConfigId?: (configId: string) => boolean;
}) {
  return (opts?: { allHaScenes?: boolean }) =>
    deps.syncEngine.pullAllByDomain({
      domain: deps.domain,
      filterConfigId: opts?.allHaScenes ? undefined : deps.filterConfigId,
      syncFrom: deps.syncFrom,
      findExisting: deps.findExisting,
    });
}

/** automation / scene / script 共用的 removeFromHAByConfigId 工厂 */
export function createStandardRemoveFromHAByConfigId(deps: {
  syncEngine: OrchestratorHaSyncEngine;
  haDomain: 'automation' | 'script' | 'scene';
  entityLabel: string;
  deleteConfig: (resolvedId: string) => Promise<unknown>;
  reload: () => Promise<unknown>;
  clearLocal: (id: string, resolvedId: string) => Promise<unknown>;
  formatError?: (msg: string, resolvedId: string, id: string) => string;
}) {
  return (haConfigId: string, options?: RemoveFromHAOptions) =>
    deps.syncEngine.removeByConfigId({
      haDomain: deps.haDomain,
      haConfigId,
      entityId: options?.entityId,
      name: options?.name,
      entityLabel: deps.entityLabel,
      deleteConfig: deps.deleteConfig,
      reload: deps.reload,
      clearLocal: deps.clearLocal,
      formatError: deps.formatError,
    });
}

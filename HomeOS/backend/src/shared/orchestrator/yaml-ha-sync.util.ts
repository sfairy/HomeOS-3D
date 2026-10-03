/**
 * @file yaml-ha-sync.util.ts
 * @module backend/src/shared/orchestrator
 */
/** YAML/场景 HA 同步：预览/状态/推送/拉取 + 域门面接线 */
import { getErrorMessage } from '../../common/utils';
import { BusinessException, ErrorCode } from '../../common/utils/business-exception';
import { assembleSyncPreview } from './diff.util';
import type { OrchestratorHaSyncEngine, SyncStatusResult } from './ha-sync.engine';
import {
  buildOrchestratorYamlLocalContent,
  toHaConfigId,
  upsertOrchestratorFromHaPull,
} from './ha-sync-core.util';
import {
  createOrchestratorCrudMethods,
  createStandardPullAllFromHA,
  createStandardRemoveFromHAByConfigId,
} from './crud-ha-sync.util';
import type { Logger } from '@nestjs/common';

/** 支持统一装配模板的域（script / automation / scene） */
type OrchestratorDomain = 'script' | 'automation' | 'scene';
/** 各域 pull-from-HA 返回的本地 ID 键 */
type OrchestratorLocalIdKey = 'scriptId' | 'automationId' | 'sceneId';

type YamlSyncRow = {
  yaml: string | null;
  haConfigId: string | null;
  id: string;
  name: string;
  enabled?: boolean;
  runOnHa: boolean;
  haSyncedAt?: Date | null;
  /** scene 域以 entities 为真相（canonical 往返用） */
  entities?: unknown;
};

interface YamlPushRow {
  id: string;
  name: string;
  haConfigId: string | null;
  yaml: string | null;
  enabled?: boolean;
  runOnHa?: boolean;
  entities?: unknown;
}

/**
 * 域适配契约：把本地行 ↔ HA Config 的域差异收敛为统一装配模板可消费的形式。
 * - yaml 域（script / automation）：本地行以 yaml 为真相，经 toHaConfig↔haConfigToYaml 往返规范化；
 * - scene 域：本地行以 entities 为真相，经 entities ↔ HA scene map 转换（canonical 往返）规范化。
 */
interface OrchestratorDomainAdapter {
  /** 域标识（锁前缀 / 日志 / HA domain） */
  domain: OrchestratorDomain;
  /** 实体中文标签（接口文档与日志） */
  entityLabel: string;
  /** 拉取返回的本地 ID 键 */
  localIdKey: OrchestratorLocalIdKey;
  /** 推送：本地内容（localContentOf 产物）+ 行 → HA Config body */
  toHaConfig: (content: string, configId: string, row: YamlPushRow) => Record<string, unknown>;
  /** 推送前本地内容（YAML 校验 / toHaConfig 入参）；默认 row.yaml */
  localContentOf?: (row: YamlPushRow) => string;
  /** HA Config → 本地 YAML 字符串 */
  haConfigToYaml: (config: unknown) => string;
  /** 本地行 → 规范化内容（drift/preview 哈希）；默认经 toHaConfig↔haConfigToYaml 往返 */
  canonicalLocal?: (row: YamlSyncRow) => string;
  /** HA Config → 规范化内容（drift/preview 哈希）；默认 haConfigToYaml */
  canonicalFromHaConfig?: (config: unknown) => string;
  /** 拉取名提取；默认 String(alias || configId) */
  pullNameFromConfig?: (config: unknown, configId: string) => string;
  /** 拉取时本地行附加字段；默认 { yaml: haConfigToYaml(config) } */
  pullRowData?: (config: unknown, configId: string) => Record<string, unknown>;
  /** 批量拉取过滤器（scene：仅 homeos_ 前缀） */
  filterConfigId?: (configId: string) => boolean;
}

/** script / automation / scene 共用：装配 getSyncPreview + getSyncStatus */
function createDomainSyncAccessors<R extends YamlSyncRow>(opts: {
  findRow: (id: string) => Promise<R | null>;
  syncEngine: OrchestratorHaSyncEngine;
  scopePrefix: OrchestratorDomain;
  canonicalLocal: (row: R) => string;
  canonicalFromHaConfig: (config: unknown) => string;
  fetchHaConfig: (configId: string) => Promise<unknown | null>;
  syncedWhen?: (haFound: boolean, haConfigId: string | null | undefined) => boolean;
  extraFields?: (row: R) => Record<string, unknown>;
}) {
  const syncedWhen =
    opts.syncedWhen ?? ((haFound, haConfigId) => !!haConfigId && haFound);

  const getSyncStatus = (id: string) =>
    opts.findRow(id).then((row) => {
      if (!row) return { exists: false };
      return opts.syncEngine.computeContentDriftStatus({
        localContent: opts.canonicalLocal(row),
        haConfigId: row.haConfigId,
        fetchHaConfig: opts.fetchHaConfig,
        haContentFromConfig: opts.canonicalFromHaConfig,
        extra: {
          haConfigId: row.haConfigId,
          runOnHa: row.runOnHa,
          haSyncedAt: row.haSyncedAt?.toISOString() || null,
          ...(opts.extraFields?.(row) ?? {}),
          ...opts.syncEngine.syncStatusErrorFields(`${opts.scopePrefix}:${row.id}`),
        },
        syncedWhen,
      });
    });

  const getSyncPreview = async (id: string) => {
    const row = await opts.findRow(id);
    if (!row) return { exists: false };
    let haYaml = '';
    if (row.haConfigId) {
      const haCfg = await opts.fetchHaConfig(row.haConfigId);
      if (haCfg) haYaml = opts.canonicalFromHaConfig(haCfg);
    }
    const status = await getSyncStatus(id);
    return assembleSyncPreview(status, opts.canonicalLocal(row), haYaml);
  };

  return { getSyncStatus, getSyncPreview };
}

/** 清除本地 haConfigId / haSyncedAt（removeFromHA 共用） */
function clearLocalOrchestratorHaLink(
  updateMany: (args: {
    where: { OR: Array<{ haConfigId: string }> };
    data: { haConfigId: null; haSyncedAt: null };
  }) => Promise<unknown>,
) {
  return (id: string, resolvedId: string) =>
    updateMany({
      where: { OR: [{ haConfigId: id }, { haConfigId: resolvedId }] },
      data: { haConfigId: null, haSyncedAt: null },
    });
}

/**
 * script / automation / scene 三域同构的 Prisma 行访问器装配。
 *
 * 三域 yamlHaSync.create({...}) 中 findRow / findLinked / findAll / findByHaConfigId /
 * updateRow / createRow / clearLocal 七个访问器结构逐行一致、仅 Prisma 模型不同，
 * 统一在此装配；域差异（toHaConfig / canonical / pullRowData 等）仍由各域自行传入。
 *
 * @param delegate 三域对应的 Prisma 模型 delegate（prisma.script / prisma.automation / prisma.scene）
 */
export function createPrismaRowAccessors(delegate: {
  findUnique(args: { where: { id: string } }): Promise<YamlSyncRow | null>;
  findMany(args: {
    where?: { haConfigId?: { not: null } | string };
    orderBy?: { id: 'asc' };
    take?: number;
  }): Promise<{ id: string; name: string }[]>;
  findFirst(args: { where: { haConfigId: string } }): Promise<{ id: string } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  updateMany(args: {
    where: { OR: Array<{ haConfigId: string }> };
    data: { haConfigId: null; haSyncedAt: null };
  }): Promise<unknown>;
}): Pick<
  CreateOrchestratorDomainHaSyncOpts,
  'findRow' | 'findLinked' | 'findAll' | 'findByHaConfigId' | 'updateRow' | 'createRow' | 'clearLocal'
> {
  return {
    findRow: (id) => delegate.findUnique({ where: { id } }),
    // 确定性 orderBy，避免无排序时 take:1000 选到任意前 1000 条；超 1000 条场景仍受安全上限约束
    findLinked: () =>
      delegate.findMany({ where: { haConfigId: { not: null } }, orderBy: { id: 'asc' }, take: 1000 }),
    findAll: () => delegate.findMany({ orderBy: { id: 'asc' }, take: 1000 }),
    findByHaConfigId: (configId) => delegate.findFirst({ where: { haConfigId: configId } }),
    updateRow: (id, data) => delegate.update({ where: { id }, data }),
    createRow: (data) => delegate.create({ data }),
    clearLocal: clearLocalOrchestratorHaLink((args) => delegate.updateMany(args)),
  };
}

/** script / automation / scene 共用的推送编排（scene 经 localContentOf 派生 YAML 参与校验） */
async function pushYamlOrchestratorToHa(opts: {
  syncEngine: OrchestratorHaSyncEngine;
  logger: Logger;
  domain: OrchestratorDomain;
  localId: string;
  entityNotFoundMessage: string;
  syncBusyMessage: string;
  findRow: (id: string) => Promise<YamlPushRow | null>;
  localContentOf?: (row: YamlPushRow) => string;
  validateLocal: (
    content: string,
  ) => { valid: boolean; message: string } | Promise<{ valid: boolean; message: string }>;
  optionalHaValidate?: (content: string) => Promise<{ valid: boolean; message: string }>;
  buildBody: (row: YamlPushRow, configId: string) => Record<string, unknown>;
  upsertConfig: (configId: string, body: Record<string, unknown>) => Promise<unknown>;
  reloadService: () => Promise<unknown>;
  updateSynced: (id: string, configId: string) => Promise<unknown>;
  afterUpsert?: (row: YamlPushRow, configId: string) => Promise<void>;
  formatSuccessMessage?: (configId: string, reloadWarn?: string) => string;
  /** reload 警告时是否仍记录 sync 成功（automation / scene 为 false） */
  recordSuccessOnReloadWarn?: boolean;
}): Promise<{ success: boolean; haConfigId?: string; message: string }> {
  return opts.syncEngine.runExclusiveSync(
    `${opts.domain}:push:${opts.localId}`,
    async () => {
      const scope = `${opts.domain}:${opts.localId}`;
      const finish = opts.syncEngine.syncOutcomeFinisher(scope);
      const guard = await opts.syncEngine.guardHaSync(true);
      if (guard) return finish(guard);

      const row = await opts.findRow(opts.localId);
      if (!row) return finish({ success: false, message: opts.entityNotFoundMessage });

      const configId = row.haConfigId || toHaConfigId(row.id);
      try {
        const localContent = opts.localContentOf ? opts.localContentOf(row) : (row.yaml ?? '');
        const localCheck = await opts.validateLocal(localContent);
        if (!localCheck.valid) {
          return finish({ success: false, message: `YAML 校验失败: ${localCheck.message}` });
        }

        if (opts.optionalHaValidate) {
          const haCheck = await opts.optionalHaValidate(localContent);
          if (!haCheck.valid) {
            opts.logger.warn(
              `HA check_config 未通过 [${row.name}],仍尝试 Config API 推送: ${haCheck.message}`,
            );
          }
        }

        const body = opts.buildBody(row, configId);
        await opts.upsertConfig(configId, body);
        const reloadWarn = await opts.syncEngine.tryReloadAfterConfigWrite(
          opts.domain,
          opts.reloadService,
        );
        if (reloadWarn) opts.syncEngine.recordSyncOutcome(scope, false, reloadWarn);
        if (opts.afterUpsert) await opts.afterUpsert(row, configId);
        await opts.updateSynced(opts.localId, configId);
        opts.logger.log(`${opts.domain} [${row.name}] 已同步到 HA (${configId})`);

        const message = opts.formatSuccessMessage
          ? opts.formatSuccessMessage(configId, reloadWarn)
          : reloadWarn
            ? `已同步到 HA（${reloadWarn}）`
            : '已同步到 HA';
        const recordSuccess = opts.recordSuccessOnReloadWarn !== false || !reloadWarn;
        return finish({ success: true, haConfigId: configId, message }, recordSuccess);
      } catch (e: unknown) {
        const msg = getErrorMessage(e);
        opts.logger.warn(`同步 ${opts.domain} 到 HA 失败 [${row.name}]: ${msg}`);
        return finish({ success: false, message: msg });
      }
    },
    () => ({ success: false, message: opts.syncBusyMessage }),
  );
}

/** script / automation / scene 共用的从 HA 拉取 YAML */
async function pullYamlOrchestratorFromHa<K extends string>(opts: {
  syncEngine: OrchestratorHaSyncEngine;
  haConfigId: string;
  lockPrefix: 'script' | 'automation' | 'scene';
  busyMessage: string;
  notFoundMessage: string;
  fetchConfig: (id: string) => Promise<unknown | null>;
  pullOpts?: { runOnHa?: boolean };
  localIdKey: K;
  executePull: (
    config: unknown,
    haConfigId: string,
    runOnHa: boolean,
  ) => Promise<{ localId: string; message: string }>;
}): Promise<{ success: boolean; message: string } & Partial<Record<K, string>>> {
  return opts.syncEngine.runExclusiveSync(
    `${opts.lockPrefix}:pull:${opts.haConfigId}`,
    async () => {
      const disabled = opts.syncEngine.guardHaSyncEnabled();
      if (disabled) {
        return disabled as { success: boolean; message: string } & Partial<Record<K, string>>;
      }

      const config = await opts.fetchConfig(opts.haConfigId);
      if (!config) {
        return { success: false, message: opts.notFoundMessage } as {
          success: boolean;
          message: string;
        } & Partial<Record<K, string>>;
      }

      const runOnHa =
        opts.pullOpts?.runOnHa ??
        (['automation', 'script', 'scene'].includes(opts.lockPrefix)
          ? true
          : opts.syncEngine.cfg.defaultRunOnHa);
      const pull = await opts.executePull(config, opts.haConfigId, runOnHa);
      return {
        success: true,
        message: pull.message,
        [opts.localIdKey]: pull.localId,
      } as { success: boolean; message: string } & Partial<Record<K, string>>;
    },
    () =>
      ({ success: false, message: opts.busyMessage }) as {
        success: boolean;
        message: string;
      } & Partial<Record<K, string>>,
  );
}

/** 绑定联动器 HA-sync 服务上的共用 facade（preview/status/repair/remove/pullAll） */
function bindOrchestratorHaSyncFacade<
  TPull extends (
    opts?: { allHaScenes?: boolean },
  ) => Promise<{ imported: number; updated: number; errors: string[] }>,
>(opts: {
  crud: ReturnType<typeof createOrchestratorCrudMethods>;
  syncAccessors?: ReturnType<typeof createDomainSyncAccessors>;
  getSyncPreview?: (id: string) => Promise<unknown>;
  getSyncStatus?: (id: string) => Promise<SyncStatusResult>;
  pullAllFromHA: TPull;
  /** syncAllToHA 后可选自动 repairAllDrift（automation） */
  autoRepairOnSyncAll?: boolean;
  syncEngine?: OrchestratorHaSyncEngine;
}) {
  const getSyncPreview =
    opts.getSyncPreview ??
    ((id: string) => {
      if (!opts.syncAccessors) {
        throw new BusinessException(
          ErrorCode.CONFIG_ERROR,
          'syncAccessors or getSyncPreview required',
        );
      }
      return opts.syncAccessors.getSyncPreview(id);
    });
  const getSyncStatus =
    opts.getSyncStatus ??
    ((id: string) => {
      if (!opts.syncAccessors) {
        throw new BusinessException(
          ErrorCode.CONFIG_ERROR,
          'syncAccessors or getSyncStatus required',
        );
      }
      return opts.syncAccessors.getSyncStatus(id);
    });

  const repairAllDrift = (direction: 'push' | 'pull' = 'push') =>
    opts.crud.repairAllDrift(direction);

  const syncAllToHA = async () => {
    const base = await opts.crud.syncAllToHA();
    if (!opts.autoRepairOnSyncAll) return base;
    const out = { ...base, repaired: 0 };
    if (opts.syncEngine?.cfg.autoRepairDrift) {
      const repair = await repairAllDrift('push');
      out.repaired = repair.repaired;
      out.failed += repair.failed;
      out.errors.push(...repair.errors);
    }
    return out;
  };

  return {
    removeFromHA: (id: string) => opts.crud.removeFromHA(id),
    getSyncPreview,
    getSyncStatus,
    repairDrift: (id: string, direction: 'push' | 'pull' = 'push') =>
      opts.crud.repairDrift(id, direction),
    syncAllToHA,
    repairAllDrift,
    pullAllFromHA: opts.pullAllFromHA,
  };
}

/** script / automation / scene 共用的域 HA-sync 统一装配选项（域适配 + 行访问器） */
export type CreateOrchestratorDomainHaSyncOpts = OrchestratorDomainAdapter & {
  syncEngine: OrchestratorHaSyncEngine;
  logger: Logger;
  findRow: (id: string) => Promise<YamlSyncRow | null>;
  findLinked: () => Promise<{ id: string; name: string }[]>;
  findAll: () => Promise<{ id: string; name: string }[]>;
  findByHaConfigId: (configId: string) => Promise<{ id: string } | null>;
  updateRow: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  createRow: (data: Record<string, unknown>) => Promise<{ id: string }>;
  clearLocal: ReturnType<typeof clearLocalOrchestratorHaLink>;
  validateLocal: (
    content: string,
  ) => { valid: boolean; message: string } | Promise<{ valid: boolean; message: string }>;
  optionalHaValidate?: (content: string) => Promise<{ valid: boolean; message: string }>;
  fetchHaConfig: (id: string) => Promise<unknown | null>;
  upsertConfig: (configId: string, body: Record<string, unknown>) => Promise<unknown>;
  deleteConfig: (resolvedId: string) => Promise<unknown>;
  reloadService: () => Promise<unknown>;
  reloadForRemove?: () => Promise<unknown>;
  afterUpsert?: (row: YamlPushRow, configId: string) => Promise<void>;
  formatSuccessMessage?: (configId: string, reloadWarn?: string) => string;
  recordSuccessOnReloadWarn?: boolean;
  pullMissingMessage?: string;
  extraFields?: (row: YamlSyncRow) => Record<string, unknown>;
  formatRemoveError?: (msg: string, resolvedId: string, id: string) => string;
  /** pull 时解析 enabled（automation 读 HA entity state） */
  resolvePullEnabled?: (configId: string) => Promise<boolean>;
  autoRepairOnSyncAll?: boolean;
  /** 从 HA 更新已有本地行时附加字段（如清空 geekGraph / geekSceneGraph） */
  pullUpdateExtra?: Record<string, unknown>;
};

/** script / automation / scene 共用的域 HA-sync 统一装配模板 */
export function createOrchestratorDomainHaSync(opts: CreateOrchestratorDomainHaSyncOpts) {
  const { syncEngine } = opts;

  /** 本地行 → 规范化内容：yaml 域默认经 toHaConfig↔haConfigToYaml 往返，scene 由适配器覆盖 */
  const canonicalLocal =
    opts.canonicalLocal ??
    ((row: YamlSyncRow) =>
      buildOrchestratorYamlLocalContent(
        row.yaml ?? '',
        row.haConfigId,
        row.id,
        (y, configId) => opts.toHaConfig(y, configId, row),
        opts.haConfigToYaml as (cfg: Record<string, unknown>) => string,
      ).localContent);

  const canonicalFromHaConfig = opts.canonicalFromHaConfig ?? opts.haConfigToYaml;
  const localContentOf = opts.localContentOf ?? ((row: YamlPushRow) => row.yaml ?? '');
  const pullNameFromConfig =
    opts.pullNameFromConfig ??
    ((config: unknown, configId: string) =>
      String((config as { alias?: string }).alias || configId));
  const pullRowData =
    opts.pullRowData ?? ((config: unknown) => ({ yaml: opts.haConfigToYaml(config) }));

  const syncAccessors = createDomainSyncAccessors({
    findRow: opts.findRow,
    syncEngine,
    scopePrefix: opts.domain,
    canonicalLocal,
    canonicalFromHaConfig,
    fetchHaConfig: opts.fetchHaConfig,
    extraFields: opts.extraFields,
  });

  const syncToHA = (localId: string) =>
    pushYamlOrchestratorToHa({
      syncEngine,
      logger: opts.logger,
      domain: opts.domain,
      localId,
      entityNotFoundMessage: `${opts.entityLabel}不存在`,
      syncBusyMessage: `该${opts.entityLabel}正在同步中，请稍后重试`,
      findRow: opts.findRow,
      localContentOf,
      validateLocal: opts.validateLocal,
      optionalHaValidate: opts.optionalHaValidate,
      buildBody: (row, configId) => opts.toHaConfig(localContentOf(row), configId, row),
      upsertConfig: opts.upsertConfig,
      reloadService: opts.reloadService,
      updateSynced: (id, configId) =>
        opts.updateRow(id, { haConfigId: configId, haSyncedAt: new Date() }),
      afterUpsert: opts.afterUpsert,
      formatSuccessMessage: opts.formatSuccessMessage,
      recordSuccessOnReloadWarn: opts.recordSuccessOnReloadWarn,
    });

  const syncFromHA = (haConfigId: string, pullOpts?: { runOnHa?: boolean }) =>
    pullYamlOrchestratorFromHa({
      syncEngine,
      haConfigId,
      lockPrefix: opts.domain,
      busyMessage: `该${opts.entityLabel}正在从 HA 拉取，请稍后重试`,
      notFoundMessage: `HA 中未找到${opts.entityLabel} ${haConfigId}`,
      fetchConfig: opts.fetchHaConfig,
      pullOpts,
      localIdKey: opts.localIdKey,
      executePull: async (config, configId, runOnHa) => {
        const name = pullNameFromConfig(config, configId);
        const rowData = pullRowData(config, configId);
        const enabled = opts.resolvePullEnabled
          ? await opts.resolvePullEnabled(configId)
          : undefined;
        const existing = await opts.findByHaConfigId(configId);
        const pull = await upsertOrchestratorFromHaPull({
          findExisting: async () => existing,
          updateExisting: async (id) => {
            await opts.updateRow(id, {
              name,
              ...rowData,
              haSyncedAt: new Date(),
              ...(enabled !== undefined ? { enabled } : {}),
              ...(opts.pullUpdateExtra || {}),
              // 与新建一致：本次 pull 的 runOnHa=true 时写回（避免旧行卡在 false）
              ...(runOnHa ? { runOnHa: true } : {}),
            });
          },
          createNew: async () =>
            opts.createRow({
              name,
              ...rowData,
              haConfigId: configId,
              runOnHa,
              haSyncedAt: new Date(),
              ...(enabled !== undefined ? { enabled } : {}),
            }),
          updatedMessage: `已从 HA 更新本地${opts.entityLabel}`,
          importedMessage: `已从 HA 导入${opts.entityLabel}`,
        });
        return { localId: pull.localId || '', message: pull.message };
      },
    });

  const removeFromHAByConfigId = createStandardRemoveFromHAByConfigId({
    syncEngine,
    haDomain: opts.domain,
    entityLabel: opts.entityLabel,
    deleteConfig: opts.deleteConfig,
    reload: opts.reloadForRemove ?? opts.reloadService,
    clearLocal: opts.clearLocal,
    formatError: opts.formatRemoveError,
  });

  const crud = createOrchestratorCrudMethods({
    syncEngine,
    domain: opts.domain,
    entityLabel: opts.entityLabel,
    pullMissingMessage: opts.pullMissingMessage,
    findLinked: opts.findLinked,
    findAll: opts.findAll,
    getSyncStatus: (id) => syncAccessors.getSyncStatus(id),
    syncFromHA: (haConfigId) => syncFromHA(haConfigId),
    syncToHA: (id) => syncToHA(id),
    findHaConfigId: async (id) => (await opts.findRow(id))?.haConfigId,
    removeFromHAByConfigId: (haConfigId, options) =>
      removeFromHAByConfigId(haConfigId, options),
  });

  const pullAllFromHAImpl = createStandardPullAllFromHA({
    syncEngine,
    domain: opts.domain,
    syncFrom: (configId) => syncFromHA(configId),
    findExisting: opts.findByHaConfigId,
    filterConfigId: opts.filterConfigId,
  });

  const facade = bindOrchestratorHaSyncFacade({
    crud,
    syncAccessors,
    pullAllFromHA: pullAllFromHAImpl,
    autoRepairOnSyncAll: opts.autoRepairOnSyncAll,
    syncEngine,
  });

  return {
    syncToHA,
    syncFromHA,
    removeFromHAByConfigId,
    ...facade,
  };
}

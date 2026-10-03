/**
 * 所属模块：backend/modules/template-entity
 * 职责：
 *  - 模板 HA 同步适配器工厂；
 * 关键依赖：
 *  - orchestrator-domain-ha-sync.factory；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { HaConnectorService } from '../ha-connector/service';
import { HaSyncService } from '../ha-sync/service';
import { OrchestratorHaSyncBinder } from '../../shared/orchestrator/orchestrator-ha-sync.binder';
import { getErrorMessage } from '../../common/utils';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import { hashContent, toHaConfigId } from '../../shared/orchestrator/ha-sync.internals';
import { assembleSyncPreview } from '../../shared/orchestrator/diff.util';
import {
  canonicalTemplateYamlForDrift,
  extractUniqueIdFromYaml,
} from '../../shared/orchestrator/config.util';
import type { TemplateEntityService } from './service';
import {
  accessTemplateHaConfigDir,
  fetchTemplateHaYamlForDrift,
  findHaEntityStateByUniqueId,
  findTemplateRegistryEntry,
  resolveTemplateConfigEntryId as lookupTemplateConfigEntryId,
  resolveTemplateHaConfigCreds,
  resolveTemplateHaConfigDir,
  tryTemplateReload as runTemplateReload,
  configureHaConfigDir as configureHaConfigDirHelper,
  getHaConfigStatus as getHaConfigStatusHelper,
  pullFromHaConfig as pullFromHaConfigHelper,
  readFromHaConfig as readFromHaConfigHelper,
  writeToHaConfig as writeToHaConfigHelper,
  type TemplateHaSyncFsDeps,
  executeSyncFromHA,
  importPastedYaml as importPastedYamlHelper,
  previewResolve as previewResolveHelper,
  type TemplateHaSyncRestDeps,
  type TemplateImportMeta,
  executeTemplateSyncToHA,
  removeTemplateFromHAByConfigId,
} from './ha-sync.internals';

/** 装配 createTemplateEntityHaSync 所需的依赖集合（由 Nest 注入侧提供） */
interface TemplateEntityHaSyncFactoryOpts {
  logger: Logger;
  prisma: PrismaService;
  templateEntityService: Pick<TemplateEntityService, 'upsertFromHaImport'>;
  haConnector: HaConnectorService;
  appConfig: AppConfigService;
  haSync: HaSyncService;
  haSyncBinder: OrchestratorHaSyncBinder;
}

/**
 * 纯工厂：将依赖聚合与同步编排收敛为单一装配入口。
 * 返回与薄门面对外公共方法签名完全一致的同步 API 对象。
 */
export function createTemplateEntityHaSync(opts: TemplateEntityHaSyncFactoryOpts) {
  const { logger, prisma, templateEntityService, haConnector, appConfig, haSync, haSyncBinder } =
    opts;

  /** 读取 automation 配置 */
  const cfg = () => appConfig.get('automation');

  /** 获取解析后的 HA 配置目录路径 */
  const getHaConfigDir = () => resolveTemplateHaConfigDir(cfg().haConfigDir);

  /** 获取 SMB 凭据 */
  const getHaConfigCreds = () =>
    resolveTemplateHaConfigCreds(cfg().haConfigDirUser, cfg().haConfigDirPassword);

  /** 建立 SMB 会话（UNC 路径 + 用户名时）并返回目录 */
  const accessHaConfigDir = () =>
    accessTemplateHaConfigDir(cfg().haConfigDir, cfg().haConfigDirUser, cfg().haConfigDirPassword);

  /** 按 unique_id / entity_id 查找 HA 实体状态 */
  const findHaEntityByUniqueId = (uniqueId: string, entityId?: string) =>
    findHaEntityStateByUniqueId(haConnector, uniqueId, entityId);

  /** 查找 template 平台的实体注册表条目 */
  const findRegistryEntry = (uniqueId: string, entityId?: string, configEntryId?: string) =>
    findTemplateRegistryEntry(haConnector, uniqueId, entityId, configEntryId);

  /** 从 template 集成 config entry 列表中按 entity_id 反查 entry_id */
  const resolveTemplateConfigEntryId = (entityId?: string, uniqueId?: string) =>
    lookupTemplateConfigEntryId(haConnector, logger, entityId, uniqueId);

  /** 执行 template.reload；失败仅记录 warn，不抛出 */
  const tryTemplateReload = (context: string) => runTemplateReload(haConnector, logger, context);

  /** 文件系统辅助依赖（configuration.yaml 路径） */
  const fsDeps: TemplateHaSyncFsDeps = {
    logger,
    prisma,
    haConnector,
    appConfig,
    getAutomationCfg: cfg,
    accessHaConfigDir,
    getHaConfigDir,
    getHaConfigCreds,
    findHaEntityByUniqueId,
    tryTemplateReload,
  };

  /** REST 辅助依赖（Template Helper / 导入 / 预览 / 移除） */
  const restDeps: TemplateHaSyncRestDeps = {
    logger,
    prisma,
    haConnector,
    accessHaConfigDir,
    findRegistryEntry,
    findHaEntityByUniqueId,
    resolveTemplateConfigEntryId,
    tryTemplateReload,
    upsertImportedTemplate: (input) => templateEntityService.upsertFromHaImport(input),
  };

  /** 从 configuration.yaml 或 HA 解析结果读取 YAML，供漂移哈希对比 */
  const fetchHaYamlForDrift = (
    uniqueId: string,
    row: { haEntityId?: string | null; haConfigEntryId?: string | null; name: string },
  ) => fetchTemplateHaYamlForDrift(haConnector, logger, accessHaConfigDir, uniqueId, row);

  /**
   * 推送单条模板实体到 HA（经 syncEngine 串行化）。
   * 同一 templateId 的推送互斥，并发请求返回"正在同步中"提示。
   */
  const syncToHA = async (
    templateId: string,
  ): Promise<{ success: boolean; haConfigId?: string; message: string }> =>
    haSyncBinder.runExclusiveSync(
      `template:push:${templateId}`,
      () =>
        executeTemplateSyncToHA(
          {
            prisma,
            haSync,
            syncOutcomeFinisher: (scope) => haSyncBinder.syncOutcomeFinisher(scope),
            guardHaSync: (requireConnected) => haSyncBinder.guardHaSync(requireConnected),
            fsDeps,
            restDeps,
            findHaEntityByUniqueId,
            logger,
          },
          templateId,
        ),
      () => ({ success: false, message: '该模板实体正在同步中，请稍后重试' }),
    );

  /** 管理员粘贴 configuration.yaml 原文导入（不依赖 HA_CONFIG_DIR） */
  const importPastedYaml = (body: {
    name: string;
    yaml: string;
    haConfigId?: string;
    entity_id?: string;
  }): Promise<{ success: boolean; templateId?: string; message: string }> =>
    importPastedYamlHelper(restDeps, body);

  /** 预览从 HA 解析 YAML 的结果（调试 / 导入前确认） */
  const previewResolve = (haConfigId: string, entityId?: string) =>
    previewResolveHelper(restDeps, haConfigId, entityId);

  /**
   * 从 HA 拉取单条模板实体到本地（经 syncEngine 串行化）。
   * 同一 haConfigId 的拉取互斥，并发请求返回"正在拉取"提示。
   */
  const syncFromHA = async (
    haConfigId: string,
    opts?: TemplateImportMeta,
  ): Promise<{ success: boolean; templateId?: string; message: string }> =>
    haSyncBinder.runExclusiveSync(
      `template:pull:${haConfigId || opts?.ha_config_entry_id || opts?.entity_id || 'unknown'}`,
      async () => {
        const disabled = haSyncBinder.guardHaSyncEnabled();
        if (disabled) return disabled;
        return executeSyncFromHA(restDeps, haConfigId, opts);
      },
      () => ({ success: false, message: '该模板实体正在从 HA 拉取，请稍后重试' }),
    );

  /**
   * 从 HA 全量拉取模板实体到本地。
   * 先通过 haSync.importTemplatesFromHA 发现全部模板，再以并发 8 逐条 syncFromHA。
   */
  const pullAllFromHA = async (): Promise<{
    imported: number;
    updated: number;
    errors: string[];
  }> => {
    const result = { imported: 0, updated: 0, errors: [] as string[] };
    const status = await haConnector.getStatus();
    if (!status.connected) {
      result.errors.push('HA 未连接');
      return result;
    }

    const discovered = await haSync.importTemplatesFromHA();
    const haConfigIds = discovered
      .map((item) => item.ha_config_id || item.entity_id)
      .filter((id): id is string => Boolean(id));
    // 预查已存在的 haConfigId，用于区分本次是导入还是更新
    const existingRows = haConfigIds.length
      ? await prisma.templateEntity.findMany({
          where: { haConfigId: { in: haConfigIds } },
          select: { haConfigId: true },
          take: 1000,
        })
      : [];
    const existingSet = new Set(existingRows.map((r) => r.haConfigId).filter(Boolean));

    await mapWithConcurrency(discovered, 8, async (item) => {
      const haConfigId = item.ha_config_id || item.entity_id;
      if (!haConfigId) return;
      try {
        const hadBefore = existingSet.has(haConfigId);
        const r = await syncFromHA(haConfigId, {
          name: item.name,
          entity_id: item.entity_id,
          type: 'yaml_import',
          ha_config_entry_id: item.config_entry_id,
        });
        if (r.success) {
          if (hadBefore) result.updated++;
          else result.imported++;
        } else if (r.message) {
          result.errors.push(`${haConfigId}: ${r.message}`);
        }
      } catch (e: unknown) {
        result.errors.push(`${haConfigId}: ${getErrorMessage(e)}`);
      }
    });
    return result;
  };

  /**
   * 按 haConfigId 从 HA 移除模板实体。
   * 依次尝试 config entry 删除、configuration.yaml 删除、注册表移除。
   */
  const removeFromHAByConfigId = async (
    haConfigId: string,
    options?: { haConfigEntryId?: string; name?: string; entityId?: string },
  ): Promise<{ success: boolean; message: string }> =>
    removeTemplateFromHAByConfigId(
      {
        cfg: cfg(),
        restDeps,
        fsDeps,
        findRegistryEntry: async (uniqueId, entityId) =>
          (await findRegistryEntry(uniqueId, entityId)) ?? null,
        resolveTemplateConfigEntryId: (entityId, uniqueId) =>
          resolveTemplateConfigEntryId(entityId, uniqueId),
        logger,
      },
      haConfigId,
      options,
    );

  /**
   * 获取单条模板实体的同步状态（漂移检测）。
   * YAML 不完整或无 configId 时直接返回未同步；否则通过 syncEngine
   * 比对本地与 HA 侧 contentHash 判断是否漂移。
   */
  const getSyncStatus = async (templateId: string) => {
    const row = await prisma.templateEntity.findUnique({ where: { id: templateId } });
    if (!row) return { exists: false };

    const configId = row.haConfigId || extractUniqueIdFromYaml(row.yaml, toHaConfigId(row.id));
    const localContent = canonicalTemplateYamlForDrift(row.yaml, configId);
    const extra = {
      haConfigId: row.haConfigId,
      haEntityId: row.haEntityId,
      haConfigEntryId: row.haConfigEntryId,
      yamlSource: row.yamlSource,
      yamlComplete: row.yamlComplete,
      haSyncedAt: row.haSyncedAt?.toISOString() || null,
      source: row.yamlSource || 'configuration.yaml',
      ...haSyncBinder.syncStatusErrorFields(`template-entity:${templateId}`),
    };

    // YAML 不完整或无 configId：无法做漂移检测，直接返回未同步
    if (row.yamlComplete === false || !configId) {
      return {
        exists: true,
        synced: false,
        drift: false,
        needsAttention: row.yamlComplete === false || Boolean(row.haConfigId && !row.haSyncedAt),
        localHash: hashContent(localContent),
        haHash: null,
        ...extra,
      };
    }

    return haSyncBinder.computeContentDriftStatus({
      localContent,
      haConfigId: configId,
      fetchHaConfig: async (id) => {
        const yaml = await fetchHaYamlForDrift(id, row);
        return yaml ? { yaml } : null;
      },
      haContentFromConfig: (cfg) =>
        canonicalTemplateYamlForDrift(String((cfg as { yaml?: string }).yaml || ''), configId),
      extra,
      syncedWhen: (haFound, haConfigId) => !!haConfigId && (haFound || !!row.haSyncedAt),
    });
  };

  /**
   * 同步前 diff 预览：对比本地与 HA 侧 YAML 规范化结果。
   * @returns 预览结果（含 exists / drift / localHash / haHash 等）
   */
  const getSyncPreview = async (templateId: string) => {
    const row = await prisma.templateEntity.findUnique({ where: { id: templateId } });
    if (!row) return { exists: false };

    const configId = row.haConfigId || extractUniqueIdFromYaml(row.yaml, toHaConfigId(row.id));
    const localContent = canonicalTemplateYamlForDrift(row.yaml, configId);
    let haYaml = '';
    const fetched = await fetchHaYamlForDrift(configId, row);
    if (fetched) {
      haYaml = canonicalTemplateYamlForDrift(fetched, configId);
    }
    const status = await getSyncStatus(templateId);
    return assembleSyncPreview(status, localContent, haYaml);
  };

  /** 通用 CRUD 同步方法（批量推送 / 批量修复 / 移除） */
  const crud = haSyncBinder.createCrud({
    domain: 'template',
    entityLabel: '模板实体',
    pullMissingMessage: '未关联 HA unique_id',
    findLinked: () =>
      prisma.templateEntity.findMany({
        where: { haConfigId: { not: null } },
        take: 1000,
      }),
    findAll: () => prisma.templateEntity.findMany({ take: 1000 }),
    getSyncStatus: (id) => getSyncStatus(id),
    syncFromHA: (id) => syncFromHA(id),
    syncToHA: (id) => syncToHA(id),
    findHaConfigId: async (id) =>
      (await prisma.templateEntity.findUnique({ where: { id } }))?.haConfigId,
    removeFromHAByConfigId: (haConfigId, options) => removeFromHAByConfigId(haConfigId, options),
    resolveRemoveContext: async (id) => {
      const row = await prisma.templateEntity.findUnique({ where: { id } });
      if (!row) return null;
      return {
        haConfigId: row.haConfigId || '',
        options: {
          haConfigEntryId: row.haConfigEntryId || undefined,
          name: row.name,
          entityId: row.haEntityId || undefined,
        },
      };
    },
  });

  return {
    syncToHA,
    importPastedYaml,
    previewResolve,
    syncFromHA,
    pullAllFromHA,
    removeFromHA: (templateId: string) => crud.removeFromHA(templateId),
    removeFromHAByConfigId,
    getSyncPreview,
    getSyncStatus,
    repairAllDrift: (direction: 'push' | 'pull' = 'push') => crud.repairAllDrift(direction),
    repairDrift: (templateId: string, direction: 'push' | 'pull' = 'push') =>
      crud.repairDrift(templateId, direction),
    syncAllToHA: () => crud.syncAllToHA(),
    configureHaConfigDir: (dirPath: string, opts?: { user?: string; password?: string }) =>
      configureHaConfigDirHelper(fsDeps, dirPath, opts),
    getHaConfigStatus: () => getHaConfigStatusHelper(fsDeps),
    readFromHaConfig: (uniqueId: string) => readFromHaConfigHelper(fsDeps, uniqueId),
    writeToHaConfig: (templateId: string) => writeToHaConfigHelper(fsDeps, templateId),
    pullFromHaConfig: (templateId: string) => pullFromHaConfigHelper(fsDeps, templateId),
  };
}

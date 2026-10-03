/**
 * 模板实体 HA 同步内部工具集
 *
 * 本文件保留 config access / registry / drift 工具，并从 sibling util 再导出：
 * - template-entity-ha-sync-fs.util.ts（配置目录读写）
 * - template-entity-ha-sync-rest.util.ts（Template Helper REST）
 * - template-entity-ha-sync-ops.util.ts（推送 / 移除编排）
 *
 * 职责：
 * - SMB / 本地路径形式的 HA 配置目录访问（accessTemplateHaConfigDir）
 * - 模板实体注册表 / config entry / 实体状态查询
 * - configuration.yaml 读写（写入 / 拉取 / 删除 template 块）
 * - Template Helper 推送与回退 configuration.yaml 流程
 * - 单条 / 批量同步到 HA、从 HA 拉取、漂移检测、移除等操作
 *
 * 关键路径说明：
 * - tryPushViaHelper：标准单实体模板优先走 Template Helper，失败回退 configuration.yaml
 * - pushTemplateYamlToHaConfigDir：trigger 模板无 REST 写入接口，必须走配置目录
 * - executeTemplateSyncToHA：单条推送的完整编排（Helper → 配置目录 → 失败提示）
 *
 * 依赖：AppConfigService、HaConnectorService、PrismaService、OrchestratorHaSyncEngine 等
 */
import { ensureHaConfigSmbAccess, resolveHaConfigCredentials } from '../../shared/ha/config-access.util';
import { readTemplateBlockFromHaConfigDir } from '../../shared/ha/template-yaml-resolver';
import { resolveHaConfigDir } from '../../shared/orchestrator/ha-sync.internals';
import { getErrorMessage } from '../../common/utils';
import { HaConnectorService } from '../ha-connector/service';
import { Logger } from '@nestjs/common';

// ── template-entity-ha-sync.util ──

/** HA 配置目录访问结果：dir 为解析后的路径，smb 为 SMB 会话信息 */
export type TemplateHaConfigAccess = {
  dir: string | undefined;
  smb: Awaited<ReturnType<typeof ensureHaConfigSmbAccess>> | undefined;
};

/** 解析 HA 配置目录路径（委托 orchestrator-ha-sync.internals.resolveHaConfigDir） */
export function resolveTemplateHaConfigDir(haConfigDir: string) {
  return resolveHaConfigDir(haConfigDir);
}

/** 解析 SMB 凭据 */
export function resolveTemplateHaConfigCreds(user?: string, password?: string) {
  return resolveHaConfigCredentials(user, password);
}

/**
 * 建立 SMB 会话（UNC 路径 + 用户名时）并返回目录。
 * 本地路径不触发 SMB，直接返回 dir。
 * @returns 包含 dir 与 smb 会话信息的对象
 */
export async function accessTemplateHaConfigDir(
  haConfigDir: string,
  user?: string,
  password?: string,
): Promise<TemplateHaConfigAccess> {
  const dir = resolveTemplateHaConfigDir(haConfigDir);
  if (!dir) return { dir: undefined, smb: undefined };
  const smb = await ensureHaConfigSmbAccess(dir, resolveTemplateHaConfigCreds(user, password));
  return { dir, smb };
}

/**
 * 在 HA 实体注册表中查找 template 平台条目。
 * 优先按 unique_id 匹配，其次 entity_id，最后 config_entry_id。
 * 首次未命中 config_entry_id 时刷新注册表后重试一次。
 * @returns 匹配到的注册表条目，未命中返回 undefined
 */
export async function findTemplateRegistryEntry(
  haConnector: HaConnectorService,
  uniqueId: string,
  entityId?: string,
  configEntryId?: string,
) {
  let registry = await haConnector.fetchEntityRegistry();
  const match = (e: (typeof registry)[number]) =>
    e.platform === 'template' &&
    ((uniqueId && e.unique_id === uniqueId) ||
      (entityId && e.entity_id === entityId) ||
      (configEntryId && e.config_entry_id === configEntryId));
  let hit = registry.find(match);
  if (!hit?.config_entry_id && (entityId || configEntryId)) {
    registry = await haConnector.refreshEntityRegistry();
    hit = registry.find(match) || hit;
  }
  return hit;
}

/**
 * 按 unique_id / entity_id 查找 template 实体状态。
 * 优先从注册表反查 entity_id，找不到则直接用传入的 entityId 查询。
 * @returns 实体状态对象，未找到返回 null
 */
export async function findHaEntityStateByUniqueId(
  haConnector: HaConnectorService,
  uniqueId: string,
  entityId?: string,
) {
  const registry = await haConnector.fetchEntityRegistry();
  const hit = registry.find(
    (e) =>
      e.platform === 'template' &&
      (e.unique_id === uniqueId || (entityId && e.entity_id === entityId)),
  );
  if (hit) return haConnector.fetchEntityState(hit.entity_id);
  if (entityId) return haConnector.fetchEntityState(entityId);
  return null;
}

/**
 * 从 template 集成 config entry 列表中按 entity_id 反查 entry_id。
 * 先查注册表，未命中则列举 template 平台的全部 config entry，
 * 按 title 与 entity_id 的 slug 做模糊匹配。
 * @returns config entry ID，未找到返回 null
 */
export async function resolveTemplateConfigEntryId(
  haConnector: HaConnectorService,
  logger: Logger,
  entityId?: string,
  uniqueId?: string,
): Promise<string | null> {
  const regHit = await findTemplateRegistryEntry(haConnector, uniqueId || '', entityId);
  if (regHit?.config_entry_id) return regHit.config_entry_id;
  if (!entityId) return null;
  try {
    const entries = await haConnector.listConfigEntries('template');
    const slug = entityId.replace(/^[^.]+\./, '');
    for (const entry of entries) {
      const entryId = String(entry.entry_id || '');
      if (!entryId) continue;
      const title = String(entry.title || '');
      if (title === entityId || title.includes(slug) || slug.includes(title)) return entryId;
    }
  } catch (e: unknown) {
    logger.debug(`列举 template config entry 失败: ${getErrorMessage(e)}`);
  }
  return null;
}

/**
 * 执行 template.reload；失败仅记录 warn，不抛出。
 * 用于配置写入 / 删除后通知 HA 重新加载模板集成。
 */
export async function tryTemplateReload(
  haConnector: HaConnectorService,
  logger: Logger,
  context: string,
): Promise<void> {
  try {
    await haConnector.callServiceViaRest('template', 'reload');
  } catch (e: unknown) {
    logger.warn(`模板重载失败(${context}): ${getErrorMessage(e)}`);
  }
}
/**
 * 从 configuration.yaml 或 HA 解析结果读取 YAML，供漂移哈希对比。
 * 优先从本地 / SMB 配置目录读取 template 块；读不到则通过
 * haConnector.resolveTemplateYaml 实时解析（fastConfigOnly 模式）。
 * @returns YAML 文本，无法获取返回 null
 */
export async function fetchTemplateHaYamlForDrift(
  haConnector: HaConnectorService,
  logger: Logger,
  accessHaConfigDir: () => Promise<TemplateHaConfigAccess>,
  uniqueId: string,
  row: { haEntityId?: string | null; haConfigEntryId?: string | null; name: string },
): Promise<string | null> {
  const { dir: cfgDir, smb } = await accessHaConfigDir();
  if (cfgDir && smb?.ok !== false) {
    try {
      const hit = await readTemplateBlockFromHaConfigDir(cfgDir, uniqueId);
      if (hit.found && hit.yaml?.trim()) return hit.yaml;
    } catch (e: unknown) {
      logger.debug(`configuration.yaml 漂移读取失败: ${getErrorMessage(e)}`);
    }
  }

  const regHit = await findTemplateRegistryEntry(
    haConnector,
    uniqueId,
    row.haEntityId || undefined,
  );
  if (!regHit?.unique_id) return null;

  try {
    const resolved = await haConnector.resolveTemplateYaml(
      {
        entity_id: regHit.entity_id,
        platform: 'template',
        unique_id: regHit.unique_id,
        name: regHit.name || row.name,
        config_entry_id: regHit.config_entry_id || row.haConfigEntryId || undefined,
      },
      smb?.ok !== false ? cfgDir : undefined,
      {
        fastConfigOnly: true,
        configDirTimeoutMs: 8_000,
        configEntryTimeoutMs: 10_000,
        skipConfigEntry: !regHit.config_entry_id && !row.haConfigEntryId,
      },
    );
    if (resolved.yaml?.trim() && resolved.complete) return resolved.yaml;
  } catch (e: unknown) {
    logger.debug(`解析模板 YAML 漂移检测失败: ${getErrorMessage(e)}`);
  }
  return null;
}

export * from './ha-sync-fs.util';
export * from './ha-sync-rest.util';
export * from './ha-sync-ops.util';

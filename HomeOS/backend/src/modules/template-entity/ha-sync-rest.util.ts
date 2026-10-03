/**
 * 模板实体 HA 同步 — Template Helper REST 推送 / 导入 / 预览 / 移除。
 *
 * 所属模块：backend/modules/template-entity
 * 职责：封装经 HA REST API 与 Template Helper / 实体注册表交互的能力——
 *  - tryPushViaHelper：标准单实体模板优先走 Template Helper，失败返回 null 触发回退
 *  - importFromRegistryEntry / importPastedYaml / executeSyncFromHA：从 HA 拉取或粘贴导入
 *  - previewResolve：导入前 YAML 解析预览
 *  - removeViaConfigEntry / removeViaEntityRegistry / persistHelperPushResult：移除与回写
 * 关键依赖：
 *  - HaConnectorService：upsertTemplateHelper / resolveTemplateYaml / 注册表与 config entry
 *  - TemplateEntityService.upsertFromHaImport：导入统一落库
 *  - shared/orchestrator/config.util：YAML 校验与 Helper 可推送性判定
 * 由 TemplateHaSyncRestDeps 聚合注入，被 ha-sync.factory / ha-sync-ops.util 调用。
 */
import { probeHaConfigDir } from '../../shared/ha/template-yaml-resolver';
import { extractTriggerEntityIdFromYaml } from '../../shared/ha/template-yaml.internals';
import { canPushViaTemplateHelper, extractUniqueIdFromYaml, shouldSkipTemplateHelper, validateTemplateYamlLocal } from '../../shared/orchestrator/config.util';
import { hashContent } from '../../shared/orchestrator/ha-sync.internals';
import { PrismaService } from '../../shared/prisma/service';
import { getErrorMessage } from '../../common/utils';
import { HaConnectorService } from '../ha-connector/service';
import type { TemplateEntityHaImportInput } from './service';
import type { TemplateHaConfigAccess, findTemplateRegistryEntry } from './ha-sync.internals';
import { Logger } from '@nestjs/common';

// ── template-entity-ha-sync-rest.helper ──

/** 模板导入元信息（从 HA 拉取 / 粘贴 YAML 时携带的可选字段） */
export interface TemplateImportMeta {
  yaml?: string;
  name?: string;
  entity_id?: string;
  type?: string;
  yaml_source?: string;
  yaml_complete?: boolean;
  ha_config_entry_id?: string;
  /** 同步路由 mixin 透传的通用选项（模板域不消费，仅作类型兼容） */
  runOnHa?: boolean;
}

/**
 * REST 辅助函数依赖集合。
 * 与 TemplateHaSyncFsDeps 类似，但面向 REST API 路径的导入 / 解析 / 移除操作。
 */
export type TemplateHaSyncRestDeps = {
  logger: Logger;
  prisma: PrismaService;
  haConnector: HaConnectorService;
  accessHaConfigDir: () => Promise<TemplateHaConfigAccess>;
  findRegistryEntry: (
    uniqueId: string,
    entityId?: string,
    configEntryId?: string,
  ) => ReturnType<typeof findTemplateRegistryEntry>;
  findHaEntityByUniqueId: (
    uniqueId: string,
    entityId?: string,
  ) => ReturnType<HaConnectorService['fetchEntityState']> extends Promise<infer T>
    ? Promise<T | null>
    : never;
  resolveTemplateConfigEntryId: (entityId?: string, uniqueId?: string) => Promise<string | null>;
  tryTemplateReload: (context: string) => Promise<void>;
  upsertImportedTemplate: (input: TemplateEntityHaImportInput) => Promise<{
    success: boolean;
    templateId?: string;
    message: string;
  }>;
};

/**
 * 尝试通过 UI Template Helper 推送（适用于标准单实体 template）。
 * 关键路径判断：
 * - shouldSkipTemplateHelper：含 trigger 或非标准 attributes 时跳过 Helper
 * - canPushViaTemplateHelper：探测 YAML 是否可转为 Helper flowConfig
 * Helper 推送失败时返回 null，由调用方回退到 configuration.yaml 流程。
 * @returns 推送结果，null 表示 Helper 不可用需回退
 */
export async function tryPushViaHelper(
  deps: TemplateHaSyncRestDeps,
  row: { yaml: string; haConfigEntryId?: string | null },
  _uniqueId: string,
): Promise<{ success: boolean; entryId?: string; message: string; skipHelper?: boolean } | null> {
  if (shouldSkipTemplateHelper(row.yaml)) {
    deps.logger.debug(
      'Template Helper 跳过:含 trigger 或非标准 attributes,将走 configuration.yaml',
    );
    return { success: false, skipHelper: true, message: '需通过 configuration.yaml 推送' };
  }
  const probe = canPushViaTemplateHelper(row.yaml);
  if (!probe.ok || !probe.flowConfig) return null;
  try {
    const result = await deps.haConnector.upsertTemplateHelper(
      probe.flowConfig,
      row.haConfigEntryId || null,
    );
    await deps.tryTemplateReload('Helper 已写入');
    return {
      success: true,
      entryId: result.entry_id,
      message: `已通过 Template Helper 同步到 HA (${result.title || result.entry_id})`,
    };
  } catch (e: unknown) {
    deps.logger.debug(
      `Template Helper 推送不可用,回退 configuration.yaml 流程: ${getErrorMessage(e)}`,
    );
    return null;
  }
}
/**
 * 从注册表条目实时解析 YAML（导入/拉取时始终优先于发现列表缓存）。
 * 通过 haConnector.resolveTemplateYaml 解析，fastConfigOnly 模式下
 * 优先从配置目录快速扫描，扫描不到再降级到 config entry API。
 */
async function importFromRegistryEntry(
  deps: TemplateHaSyncRestDeps,
  regHit: { entity_id: string; unique_id?: string; name?: string; config_entry_id?: string },
  opts?: TemplateImportMeta,
) {
  deps.logger.log(
    `开始从 HA 导入 template: unique_id=${regHit.unique_id} entity=${regHit.entity_id}`,
  );
  const entity = await deps.haConnector.fetchEntityState(regHit.entity_id);
  const attrs = (entity?.attributes || {}) as Record<string, unknown>;
  const name = regHit.name || opts?.name || String(attrs.friendly_name || regHit.entity_id);
  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (cfgDir && smb?.ok === false) {
    deps.logger.warn(`HA 配置目录 SMB 连接失败: ${smb.message},将使用占位 YAML 导入`);
  }
  const resolved = await deps.haConnector.resolveTemplateYaml(
    {
      entity_id: regHit.entity_id,
      platform: 'template',
      unique_id: regHit.unique_id,
      name,
      config_entry_id: regHit.config_entry_id,
    },
    smb?.ok !== false ? cfgDir : undefined,
    {
      fastConfigOnly: true,
      configDirTimeoutMs: 8_000,
      configEntryTimeoutMs: 12_000,
      skipConfigEntry: !regHit.config_entry_id,
    },
  );
  deps.logger.log(
    `template 导入解析完成: unique_id=${regHit.unique_id} source=${resolved.source} complete=${resolved.complete}`,
  );
  // YAML 不完整时提示用户：模板可能在子目录 yaml 中，需深度扫描或手动粘贴
  if (!resolved.complete && cfgDir) {
    const probe = await probeHaConfigDir(cfgDir);
    deps.logger.warn(
      `haConfigDir=${cfgDir} 未在快速扫描中找到 unique_id=${regHit.unique_id}` +
        `(configuration.yaml 存在=${probe.configurationYamlExists})` +
        '.模板可能在子目录 yaml 中:请点"从 configuration.yaml 读取"做深度扫描,或"粘贴 YAML"',
    );
  }
  return deps.upsertImportedTemplate({
    name,
    entityId: regHit.entity_id,
    haConfigId: String(regHit.unique_id || ''),
    yaml: resolved.yaml,
    type: opts?.type || 'yaml_import',
    yamlSource: resolved.source,
    yamlComplete: resolved.complete,
    haConfigEntryId: regHit.config_entry_id || opts?.ha_config_entry_id,
  });
}

/**
 * 管理员粘贴 configuration.yaml 原文导入（不依赖 HA_CONFIG_DIR）。
 * 本地校验通过后直接落库，yamlSource 标记为 'manual'。
 */
export async function importPastedYaml(
  deps: TemplateHaSyncRestDeps,
  body: {
    name: string;
    yaml: string;
    haConfigId?: string;
    entity_id?: string;
  },
): Promise<{ success: boolean; templateId?: string; message: string }> {
  const yaml = body.yaml?.trim();
  if (!yaml) return { success: false, message: 'YAML 不能为空' };
  const localCheck = validateTemplateYamlLocal(yaml);
  if (!localCheck.valid) return { success: false, message: `YAML 校验失败: ${localCheck.message}` };

  // 无显式 unique_id/haConfigId 时用 YAML 内容哈希派生唯一 id，避免不同粘贴导入
  // 全部落到固定 'manual_import' 被 findFirst 静默覆盖（数据丢失）
  const uniqueId = extractUniqueIdFromYaml(
    yaml,
    body.haConfigId || `manual_${hashContent(yaml)}`,
  );
  return deps.upsertImportedTemplate({
    name: body.name || uniqueId,
    entityId: body.entity_id || '',
    haConfigId: uniqueId,
    yaml,
    type: 'yaml_import',
    yamlSource: 'manual',
    yamlComplete: true,
  });
}

/**
 * 预览从 HA 解析 YAML 的结果（调试 / 导入前确认）。
 * 返回解析后的 YAML 预览（前 800 字符）、长度、是否含 trigger 等信息。
 */
export async function previewResolve(
  deps: TemplateHaSyncRestDeps,
  haConfigId: string,
  entityId?: string,
) {
  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  const regHit = await deps.findRegistryEntry(haConfigId, entityId);
  if (!regHit?.unique_id) {
    return {
      found: false,
      haConfigDir: cfgDir || null,
      smbMessage: smb?.message || null,
      message: '注册表中未找到 template 实体',
    };
  }
  const resolved = await deps.haConnector.resolveTemplateYaml(
    {
      entity_id: regHit.entity_id,
      platform: 'template',
      unique_id: regHit.unique_id,
      name: regHit.name,
      config_entry_id: regHit.config_entry_id,
    },
    smb?.ok !== false ? cfgDir : undefined,
    {
      configDirTimeoutMs: 10_000,
      configEntryTimeoutMs: 12_000,
      skipConfigEntry: !regHit.config_entry_id,
    },
  );
  return {
    found: true,
    haConfigId: regHit.unique_id,
    entity_id: regHit.entity_id,
    haConfigDir: cfgDir || null,
    smbMessage: smb?.message || null,
    yaml_source: resolved.source,
    yaml_complete: resolved.complete,
    yaml: resolved.complete ? resolved.yaml : undefined,
    yaml_preview: resolved.yaml.slice(0, 800),
    yaml_length: resolved.yaml.length,
    has_trigger: resolved.yaml.includes('trigger:'),
    trigger_entity_id: extractTriggerEntityIdFromYaml(resolved.yaml) || resolved.trigger_entity_id,
  };
}
/**
 * syncFromHA 内部逻辑（不含 runExclusiveSync 包装）。
 * 流程：
 * 1. HA 未连接 → 直接失败
 * 2. 粘贴 YAML（yaml_source='manual'）→ 走 importPastedYaml
 * 3. 注册表命中 → 走 importFromRegistryEntry
 * 4. 实体状态命中 → 走 importFromRegistryEntry
 * 5. 均未命中但有 YAML → 以 stub 落库；否则返回失败
 */
export async function executeSyncFromHA(
  deps: TemplateHaSyncRestDeps,
  haConfigId: string,
  opts?: TemplateImportMeta,
): Promise<{ success: boolean; templateId?: string; message: string }> {
  const status = await deps.haConnector.getStatus();
  if (!status.connected) {
    return { success: false, message: 'HA 未连接，无法导入模板实体' };
  }

  // 手动粘贴的 YAML 优先走 importPastedYaml，不依赖 HA 注册表
  if (opts?.yaml?.trim() && opts.yaml_source === 'manual') {
    return importPastedYaml(deps, {
      name: opts.name || haConfigId,
      yaml: opts.yaml,
      haConfigId,
      entity_id: opts.entity_id,
    });
  }

  const regHit = await deps.findRegistryEntry(
    haConfigId,
    opts?.entity_id,
    opts?.ha_config_entry_id,
  );
  if (regHit?.unique_id || regHit?.entity_id) {
    return importFromRegistryEntry(deps, regHit, opts);
  }

  const entity = await deps.findHaEntityByUniqueId(haConfigId, opts?.entity_id);
  if (!entity) {
    // 注册表和实体状态均未命中：若有 YAML 则以 stub 落库，否则失败
    if (opts?.yaml?.trim()) {
      return deps.upsertImportedTemplate({
        name: opts.name || haConfigId,
        entityId: opts.entity_id || '',
        haConfigId,
        yaml: opts.yaml,
        type: opts.type || 'yaml_import',
        yamlSource: opts.yaml_source || 'stub',
        yamlComplete: opts.yaml_complete ?? !opts.yaml.includes('占位片段'),
        haConfigEntryId: opts.ha_config_entry_id,
      });
    }
    return { success: false, message: `HA 中未找到 unique_id=${haConfigId} 的 template 实体` };
  }

  const attrs = (entity.attributes || {}) as Record<string, unknown>;
  const uniqueId = String(attrs.unique_id || haConfigId);
  const name = String(attrs.friendly_name || entity.entity_id);
  return importFromRegistryEntry(
    deps,
    {
      entity_id: entity.entity_id,
      unique_id: uniqueId,
      name,
    },
    opts,
  );
}

/**
 * removeFromHAByConfigId 中通过 Template Helper config entry 删除。
 * 删除 config entry 后执行 template.reload 并清空数据库关联字段。
 * @returns 成功返回 { success, message }，失败返回 null
 */
export async function removeViaConfigEntry(
  deps: TemplateHaSyncRestDeps,
  params: {
    entryId: string;
    uniqueId: string;
    entityId?: string;
    label: string;
  },
): Promise<{ success: boolean; message: string } | null> {
  try {
    await deps.haConnector.deleteConfigEntry(params.entryId);
    await deps.tryTemplateReload('Helper 已删除');
    await deps.prisma.templateEntity.updateMany({
      where: {
        OR: [
          ...(params.uniqueId ? [{ haConfigId: params.uniqueId }] : []),
          ...(params.entityId ? [{ haEntityId: params.entityId }] : []),
        ],
      },
      data: { haConfigId: null, haConfigEntryId: null, haEntityId: null, haSyncedAt: null },
    });
    deps.logger.log(`已删除 HA Template Helper [${params.label}] entry=${params.entryId}`);
    return { success: true, message: `已从 HA 删除 Template Helper「${params.label}」` };
  } catch (e: unknown) {
    deps.logger.warn(`删除 Template Helper 失败 [${params.label}]: ${getErrorMessage(e)}`);
    return null;
  }
}

/**
 * removeFromHAByConfigId 中从实体注册表移除。
 * 移除后清空数据库关联字段，并提示用户检查 configuration.yaml。
 * @returns 成功返回 { success, message }，失败返回 null
 */
export async function removeViaEntityRegistry(
  deps: TemplateHaSyncRestDeps,
  params: {
    entityId: string;
    uniqueId: string;
    label: string;
    cfgDir: string | undefined;
  },
): Promise<{ success: boolean; message: string } | null> {
  try {
    await deps.haConnector.removeEntityFromRegistry(params.entityId);
    await deps.tryTemplateReload('实体已从注册表移除');
    await deps.prisma.templateEntity.updateMany({
      where: {
        OR: [
          { haEntityId: params.entityId },
          ...(params.uniqueId ? [{ haConfigId: params.uniqueId }] : []),
        ],
      },
      data: { haConfigId: null, haConfigEntryId: null, haEntityId: null, haSyncedAt: null },
    });
    // 根据是否配置了 haConfigDir 给出不同的后续提示
    const yamlHint = params.cfgDir
      ? '若实体仍出现，请检查 configuration.yaml 中是否仍有对应 template 块'
      : '若实体仍出现，请配置 haConfigDir 后从 configuration.yaml 删除对应块';
    deps.logger.log(`已从 HA 实体注册表移除 [${params.entityId}]`);
    return { success: true, message: `已从 HA 移除实体「${params.label}」。${yamlHint}` };
  } catch (e: unknown) {
    deps.logger.warn(`从实体注册表移除 [${params.entityId}] 失败: ${getErrorMessage(e)}`);
    return null;
  }
}

/** Helper 推送成功后更新本地库的 HA 关联字段与 contentHash */
export async function persistHelperPushResult(
  deps: Pick<TemplateHaSyncRestDeps, 'prisma'>,
  params: {
    templateId: string;
    uniqueId: string;
    entryId?: string;
    haEntityId?: string | null;
    yaml: string;
  },
) {
  await deps.prisma.templateEntity.update({
    where: { id: params.templateId },
    data: {
      haConfigId: params.uniqueId,
      haConfigEntryId: params.entryId,
      haEntityId: params.haEntityId,
      haSyncedAt: new Date(),
      contentHash: hashContent(params.yaml),
      yamlSource: 'config_entry',
      yamlComplete: true,
    },
  });
}

/**
 * 模板实体 HA 同步 — 单条推送 / 移除编排。
 *
 * 所属模块：backend/modules/template-entity
 * 职责：编排单条模板实体同步到 HA（executeTemplateSyncToHA）与
 *  按 haConfigId 从 HA 移除（removeTemplateFromHAByConfigId）两条关键流程。
 *  推送按 Helper → configuration.yaml 顺序回退；移除按 config entry →
 *  configuration.yaml → 实体注册表 顺序回退，全失败则给手动指引。
 * 关键依赖：
 *  - ha-sync-rest.util（tryPushViaHelper / removeViaConfigEntry 等）
 *  - ha-sync-fs.util（pushTemplateYamlToHaConfigDir / removeTemplateFromHaConfigDir）
 *  - shared/orchestrator/config.util（YAML 校验、trigger 判定、unique_id 提取）
 *  - OrchestratorHaSyncEngine（syncOutcomeFinisher / guardHaSync 守卫与结果收集）
 * 由 ha-sync.factory 装配并转发调用。
 */
import { extractUniqueIdFromYaml, isTriggerBasedTemplateYaml, validateTemplateYamlLocal, wrapTemplateForHaCheck } from '../../shared/orchestrator/config.util';
import type { OrchestratorHaSyncEngine } from '../../shared/orchestrator/ha-sync.engine';
import { toHaConfigId } from '../../shared/orchestrator/ha-sync.internals';
import { PrismaService } from '../../shared/prisma/service';
import { getErrorMessage } from '../../common/utils';
import type { HaSyncService } from '../ha-sync/service';
import type { TemplateHaSyncFsDeps } from './ha-sync-fs.util';
import { pushTemplateYamlToHaConfigDir, removeTemplateFromHaConfigDir, resolveHaConfigDirForRemoveHint } from './ha-sync-fs.util';
import type { TemplateHaSyncRestDeps } from './ha-sync-rest.util';
import { persistHelperPushResult, removeViaConfigEntry, removeViaEntityRegistry, tryPushViaHelper } from './ha-sync-rest.util';
import { Logger } from '@nestjs/common';

// ── template-entity-ha-sync-ops.helper ──

/** 单条同步到 HA 的依赖集合 */
interface TemplateSyncToHaDeps {
  prisma: PrismaService;
  haSync: HaSyncService;
  syncOutcomeFinisher: OrchestratorHaSyncEngine['syncOutcomeFinisher'];
  guardHaSync: OrchestratorHaSyncEngine['guardHaSync'];
  fsDeps: TemplateHaSyncFsDeps;
  restDeps: TemplateHaSyncRestDeps;
  findHaEntityByUniqueId: (
    uniqueId: string,
    entityId?: string,
  ) => Promise<{ entity_id?: string } | null | undefined>;
  logger: Logger;
}

/**
 * 单条模板实体同步到 HA 的完整编排（关键路径）。
 * 流程：
 * 1. guardHaSync 守卫（HA 同步未启用时直接返回）
 * 2. YAML 不完整 → 失败提示
 * 3. 本地 YAML 校验 + HA check_config 校验
 * 4. 尝试 Template Helper 推送（tryPushViaHelper）
 * 5. Helper 不可用 → 写入 configuration.yaml（pushTemplateYamlToHaConfigDir）
 * 6. 均不可用 → 根据 trigger / 简单模板给出不同的失败提示
 *
 * @returns 同步结果（success / haConfigId / message）
 */
export async function executeTemplateSyncToHA(
  deps: TemplateSyncToHaDeps,
  templateId: string,
): Promise<{ success: boolean; haConfigId?: string; message: string }> {
  const scope = `template-entity:${templateId}`;
  const finish = deps.syncOutcomeFinisher(scope);

  const guard = await deps.guardHaSync(true);
  if (guard) return finish(guard);

  const row = await deps.prisma.templateEntity.findUnique({ where: { id: templateId } });
  if (!row) return finish({ success: false, message: '模板实体不存在' });

  if (row.yamlComplete === false) {
    return finish({
      success: false,
      message:
        'YAML 不完整（导入占位片段）。请补全 configuration.yaml 原文，或在「高级运行参数 → automation.haConfigDir」配置 HA 配置目录后重新导入',
    });
  }

  const configId = row.haConfigId || toHaConfigId(row.id);
  const uniqueId = extractUniqueIdFromYaml(row.yaml, configId);

  try {
    const localCheck = validateTemplateYamlLocal(row.yaml);
    if (!localCheck.valid)
      return finish({ success: false, message: `YAML 校验失败: ${localCheck.message}` });

    const haCheck = await deps.haSync.validateYaml(wrapTemplateForHaCheck(row.yaml));
    if (!haCheck.valid) {
      return finish({ success: false, message: `HA YAML 校验失败: ${haCheck.message}` });
    }

    // 优先尝试 Template Helper（适用于标准单实体模板）
    const helperResult = await tryPushViaHelper(deps.restDeps, row, uniqueId);
    const haEntityRaw = await deps.findHaEntityByUniqueId(uniqueId, row.haEntityId || undefined);
    const haEntity = haEntityRaw?.entity_id ? { entity_id: haEntityRaw.entity_id } : null;

    if (helperResult?.success) {
      await persistHelperPushResult(
        { prisma: deps.prisma },
        {
          templateId,
          uniqueId,
          entryId: helperResult.entryId,
          haEntityId: haEntity?.entity_id || row.haEntityId,
          yaml: row.yaml,
        },
      );
      return finish({ success: true, haConfigId: uniqueId, message: helperResult.message });
    }

    // Helper 不可用时回退到 configuration.yaml 写入
    const fsPush = await pushTemplateYamlToHaConfigDir(deps.fsDeps, {
      templateId,
      uniqueId,
      row,
      haEntity,
    });
    if (fsPush.outcome === 'smb_error') {
      return finish({ success: false, haConfigId: uniqueId, message: fsPush.message });
    }
    if (fsPush.outcome === 'written') {
      return finish({
        success: true,
        haConfigId: uniqueId,
        message: fsPush.message,
      });
    }
    if (fsPush.outcome === 'timeout') {
      return finish({
        success: false,
        haConfigId: uniqueId,
        message: '写入 configuration.yaml 超时，请检查 haConfigDir 路径与 SMB 凭据',
      });
    }

    // 配置目录写入失败：根据 trigger 类型给出不同的手动操作指引
    const cfgDir = fsPush.outcome === 'unavailable' ? undefined : fsPush.cfgDir;
    const cfgHint = cfgDir
      ? '未能写入配置文件（请检查目录权限与 unique_id 是否可解析）'
      : '未配置 automation.haConfigDir，无法自动写入 configuration.yaml';
    const isTriggerTpl = isTriggerBasedTemplateYaml(row.yaml);

    return finish({
      success: false,
      haConfigId: uniqueId,
      message: isTriggerTpl
        ? `${cfgHint}。trigger 模板无 HA REST 写入接口，请在本机配置 haConfigDir 指向 HA 的 config 目录，或手动将 YAML 合并到 configuration.yaml 后执行 template.reload。YAML 校验已通过。`
        : `${cfgHint}。简单模板可尝试 HA「设置 → 设备与服务 → 模板」Helper；否则请手动合并 YAML。YAML 校验已通过。`,
    });
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    deps.logger.warn(`同步模板实体到 HA 失败 [${row.name}]: ${msg}`);
    return finish({ success: false, message: msg });
  }
}
/** 从 HA 移除模板实体的依赖集合 */
interface TemplateRemoveFromHaDeps {
  cfg: { haSyncEnabled: boolean };
  restDeps: TemplateHaSyncRestDeps;
  fsDeps: TemplateHaSyncFsDeps;
  findRegistryEntry: (
    uniqueId: string,
    entityId?: string,
  ) => Promise<{
    unique_id?: string;
    entity_id?: string;
    config_entry_id?: string;
    name?: string;
  } | null>;
  resolveTemplateConfigEntryId: (
    entityId?: string,
    uniqueId?: string,
  ) => Promise<string | null | undefined>;
  logger: Logger;
}

/**
 * 按 haConfigId 从 HA 移除模板实体（关键路径）。
 * 按优先级尝试多种移除方式：
 * 1. 有 config entry ID → 删除 Template Helper config entry
 * 2. 从 configuration.yaml 删除 template 块
 * 3. 从实体注册表移除
 * 4. 均失败 → 返回手动操作指引
 *
 * @param haConfigId HA 侧 unique_id
 * @param options 可选的 haConfigEntryId / name / entityId
 * @returns 移除结果（success / message）
 */
export async function removeTemplateFromHAByConfigId(
  deps: TemplateRemoveFromHaDeps,
  haConfigId: string,
  options?: { haConfigEntryId?: string; name?: string; entityId?: string },
): Promise<{ success: boolean; message: string }> {
  if (!deps.cfg.haSyncEnabled) {
    return { success: false, message: 'HA 同步未启用' };
  }

  const regHit =
    haConfigId || options?.entityId
      ? await deps.findRegistryEntry(haConfigId, options?.entityId)
      : null;
  const uniqueId = regHit?.unique_id || haConfigId;
  const entityId = options?.entityId || regHit?.entity_id;
  const entryId =
    options?.haConfigEntryId ||
    regHit?.config_entry_id ||
    (await deps.resolveTemplateConfigEntryId(entityId, uniqueId));
  const label = options?.name || regHit?.name || entityId || uniqueId || '模板实体';

  // 优先尝试删除 config entry（Template Helper）
  if (entryId) {
    const removed = await removeViaConfigEntry(deps.restDeps, {
      entryId,
      uniqueId,
      entityId,
      label,
    });
    if (removed?.success) return removed;
  }

  if (!uniqueId?.trim() && !entityId) {
    return { success: false, message: '缺少模板 unique_id 或 entity_id' };
  }

  // 回退：从 configuration.yaml 删除 template 块
  const fsRemoved = await removeTemplateFromHaConfigDir(deps.fsDeps, {
    uniqueId,
    entityId,
    label,
  });
  if (fsRemoved?.success) {
    return {
      success: true,
      message: fsRemoved.message || `已从 configuration.yaml 删除「${label}」`,
    };
  }

  const cfgDir = await resolveHaConfigDirForRemoveHint(deps.fsDeps);

  // 再回退：从实体注册表移除
  if (entityId) {
    const registryRemoved = await removeViaEntityRegistry(deps.restDeps, {
      entityId,
      uniqueId,
      label,
      cfgDir,
    });
    if (registryRemoved?.success) return registryRemoved;
  }

  // 全部失败：给出手动操作指引
  const dirHint = cfgDir
    ? '（已在配置目录中搜索但未找到对应块）'
    : '（请配置 automation.haConfigDir 以自动删除 configuration.yaml 中的模板）';
  const idHint = entityId ? `entity_id=${entityId}` : `unique_id=${uniqueId}`;
  const msg = `无法自动删除「${label}」，请手动从 configuration.yaml 删除 ${idHint} 后执行 template.reload${dirHint}`;
  deps.logger.warn(msg);
  return { success: false, message: msg };
}

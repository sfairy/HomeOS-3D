/**
 * 模板实体 HA 同步 — 文件系统 / 配置目录读写（configuration.yaml 路径）。
 *
 * 所属模块：backend/modules/template-entity
 * 职责：封装对 HA configuration.yaml 所在目录（本地路径或 UNC/SMB 远端）的访问与
 *  template 块读写，包括目录状态探测、配置保存、按 unique_id 读取 / 写入 / 拉取 /
 *  删除 template 块，以及 syncToHA 中 Helper 不可用时的 configuration.yaml 回退写入。
 * 关键路径：trigger 模板无 REST 写入接口，必须经此文件写入配置目录。
 * 依赖：
 *  - AppConfigService / PrismaService：配置读写与持久化
 *  - HaConnectorService：template.reload 与实体状态查询
 *  - shared/ha/template-yaml-resolver：configuration.yaml 解析与块读写
 *  - shared/orchestrator/ha-sync.internals：contentHash 计算
 * 由 TemplateHaSyncFsDeps 聚合注入，被 ha-sync.factory / ha-sync-ops.util 调用。
 */
import { AppConfigService } from '../../shared/app-config/service';
import type { AppConfigData } from '../../shared/app-config/types';
import { isUncConfigPath, withAsyncTimeout } from '../../shared/ha/config-access.util';
import { extractTemplateFromLocalHaConfigDir, probeHaConfigDir, readTemplateBlockFromHaConfigDir, removeTemplateBlockFromHaConfigDir, upsertTemplateBlockToHaConfigDir } from '../../shared/ha/template-yaml-resolver';
import { extractUniqueIdFromYaml, validateTemplateYamlLocal } from '../../shared/orchestrator/config.util';
import { hashContent, toHaConfigId } from '../../shared/orchestrator/ha-sync.internals';
import { PrismaService } from '../../shared/prisma/service';
import { getErrorMessage } from '../../common/utils';
import { HaConnectorService } from '../ha-connector/service';
import type { TemplateHaConfigAccess, resolveTemplateHaConfigCreds } from './ha-sync.internals';
import { Logger } from '@nestjs/common';

// ── template-entity-ha-sync-fs.helper ──

/** automation 配置类型别名 */
type AutomationCfg = AppConfigData['automation'];

/**
 * 文件系统辅助函数依赖集合。
 * 采用依赖注入形式，便于 TemplateEntityHaSyncService 聚合调用。
 */
export type TemplateHaSyncFsDeps = {
  logger: Logger;
  prisma: PrismaService;
  haConnector: HaConnectorService;
  appConfig: AppConfigService;
  getAutomationCfg: () => AutomationCfg;
  accessHaConfigDir: () => Promise<TemplateHaConfigAccess>;
  getHaConfigDir: () => string | undefined;
  getHaConfigCreds: () => ReturnType<typeof resolveTemplateHaConfigCreds>;
  findHaEntityByUniqueId: (
    uniqueId: string,
    entityId?: string,
  ) => ReturnType<HaConnectorService['fetchEntityState']> extends Promise<infer T>
    ? Promise<T | null>
    : never;
  tryTemplateReload: (context: string) => Promise<void>;
};

/**
 * HA 配置目录状态（用于 trigger 模板读写 configuration.yaml）。
 * 探测目录是否存在 / 可读 / 可写，并返回 SMB 凭据配置情况。
 */
export async function getHaConfigStatus(deps: TemplateHaSyncFsDeps) {
  const cfg = deps.getAutomationCfg();
  const fromSettings = String(cfg.haConfigDir || '').trim();
  const fromEnv = String(process.env.HA_CONFIG_DIR || '').trim();
  const resolved = deps.getHaConfigDir();
  if (!resolved) {
    return {
      configured: false,
      path: null as string | null,
      source: null as 'settings' | 'env' | null,
      settingsPath: fromSettings || null,
      envPath: fromEnv || null,
      dirExists: false,
      readable: false,
      writable: false,
      configurationYamlPath: null as string | null,
      configurationYamlExists: false,
      smbOk: true,
      message: '未配置 automation.haConfigDir 或环境变量 HA_CONFIG_DIR',
    };
  }
  const { smb } = await deps.accessHaConfigDir();
  const creds = deps.getHaConfigCreds();
  const needsCreds = isUncConfigPath(resolved) && !creds.user;
  const probe = await probeHaConfigDir(resolved);
  const smbOk = smb?.ok !== false;
  const ok = smbOk && probe.dirExists && probe.readable && probe.writable;
  let message = ok
    ? `已配置 HA 配置目录：${resolved}`
    : !smbOk && smb
      ? smb.message
      : `目录 ${resolved} 不可访问（存在=${probe.dirExists} 可读=${probe.readable} 可写=${probe.writable}）`;
  if (needsCreds && !ok) {
    message = `UNC 路径需配置 SMB 用户名与密码：${resolved}`;
  }
  return {
    configured: true,
    path: resolved,
    source: (fromSettings ? 'settings' : 'env') as 'settings' | 'env',
    settingsPath: fromSettings || null,
    envPath: fromEnv || null,
    haConfigDirUser: cfg.haConfigDirUser || null,
    credentialsConfigured: !!creds.user,
    passwordConfigured: !!creds.password,
    needsSmbCredentials: needsCreds,
    smbShare: smb?.share || null,
    smbOk,
    smbMessage: smb?.message || null,
    ...probe,
    message,
  };
}
/**
 * 保存 automation.haConfigDir（及 SMB 凭据）并返回探测结果。
 * 空路径直接返回失败；非空路径更新配置后重新探测目录可访问性。
 */
export async function configureHaConfigDir(
  deps: TemplateHaSyncFsDeps,
  dirPath: string,
  opts?: { user?: string; password?: string },
) {
  const trimmed = String(dirPath || '').trim();
  if (!trimmed) {
    return { success: false, ...(await getHaConfigStatus(deps)), message: '路径不能为空' };
  }
  const cfg = deps.getAutomationCfg();
  const next = { ...cfg, haConfigDir: trimmed };
  if (opts?.user !== undefined) next.haConfigDirUser = String(opts.user || '').trim();
  if (opts?.password !== undefined && opts.password !== '')
    next.haConfigDirPassword = opts.password;
  await deps.appConfig.update({ automation: next });
  const status = await getHaConfigStatus(deps);
  const ok = status.configured && status.readable && status.writable && status.smbOk !== false;
  return {
    success: ok,
    ...status,
    message: ok
      ? `已保存 HA 配置目录：${trimmed}`
      : `路径已保存，但目录不可访问：${status.message}`,
  };
}

/**
 * 从 configuration.yaml 按 unique_id 读取 template 块（不更新数据库）。
 * 用于预览或调试，不产生副作用。
 */
export async function readFromHaConfig(deps: TemplateHaSyncFsDeps, uniqueId: string) {
  const uid = String(uniqueId || '').trim();
  if (!uid) return { found: false, message: 'unique_id 不能为空' };
  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (!cfgDir) {
    return {
      found: false,
      haConfigDir: null,
      message: '未配置 automation.haConfigDir，无法读取 configuration.yaml',
    };
  }
  if (smb?.ok === false) return { found: false, haConfigDir: cfgDir, message: smb.message };
  const hit = await readTemplateBlockFromHaConfigDir(cfgDir, uid);
  return {
    ...hit,
    uniqueId: uid,
    haConfigDir: cfgDir,
  };
}

/**
 * 将本地模板 YAML 写入 configuration.yaml 并 reload（不经过 Template Helper）。
 * 关键路径：trigger 模板无 REST 写入接口，必须通过配置目录写入。
 * @returns 写入结果（success / message / file）
 */
export async function writeToHaConfig(
  deps: TemplateHaSyncFsDeps,
  templateId: string,
): Promise<{ success: boolean; message: string; file?: string; needsAttention?: boolean }> {
  const row = await deps.prisma.templateEntity.findUnique({ where: { id: templateId } });
  if (!row) return { success: false, message: '模板实体不存在' };
  if (row.yamlComplete === false) {
    return { success: false, message: 'YAML 不完整，无法写入 configuration.yaml' };
  }

  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (!cfgDir) {
    return {
      success: false,
      message:
        '未配置 automation.haConfigDir。请在「设置 → 高级运行参数 → automation.haConfigDir」填写本机可读写 HA config 目录路径',
    };
  }
  if (smb?.ok === false) return { success: false, message: smb.message };

  const probe = await probeHaConfigDir(cfgDir);
  if (!probe.dirExists || !probe.writable) {
    return {
      success: false,
      message: `HA 配置目录不可写：${cfgDir}（存在=${probe.dirExists} 可写=${probe.writable}）`,
    };
  }

  const configId = row.haConfigId || toHaConfigId(row.id);
  const uniqueId = extractUniqueIdFromYaml(row.yaml, configId);
  const localCheck = validateTemplateYamlLocal(row.yaml);
  if (!localCheck.valid) return { success: false, message: `YAML 校验失败: ${localCheck.message}` };

  try {
    const written = await upsertTemplateBlockToHaConfigDir(cfgDir, uniqueId, row.yaml);
    if (!written.written) return { success: false, message: written.message };

    // 写入后尝试 template.reload；失败则不算同步成功，避免半态「已同步」
    let reloadOk = true;
    let reloadMsg = '';
    const status = await deps.haConnector.getStatus();
    if (status.connected) {
      try {
        await deps.haConnector.callServiceViaRest('template', 'reload');
        reloadMsg = '，已执行 template.reload';
      } catch (e: unknown) {
        reloadOk = false;
        reloadMsg = `（template.reload 失败: ${getErrorMessage(e)}，请手动重载）`;
      }
    } else {
      reloadOk = false;
      reloadMsg = '（HA 未连接，未执行 template.reload，请连接后手动重载）';
    }

    const haEntity = await deps.findHaEntityByUniqueId(uniqueId, row.haEntityId || undefined);
    await deps.prisma.templateEntity.update({
      where: { id: templateId },
      data: {
        haConfigId: uniqueId,
        haEntityId: haEntity?.entity_id || row.haEntityId,
        // 仅 reload 成功才标记已同步；失败保留 haConfigId 便于重试，haSyncedAt 留空 → needsAttention
        haSyncedAt: reloadOk ? new Date() : null,
        contentHash: hashContent(row.yaml),
        yamlSource: 'configuration_yaml',
        yamlComplete: true,
      },
    });
    return {
      success: reloadOk,
      needsAttention: !reloadOk,
      file: written.file,
      message: `${written.message}${reloadMsg}`,
    };
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    deps.logger.warn(`写入 configuration.yaml 失败 [${row.name}]: ${msg}`);
    return { success: false, message: msg };
  }
}
/**
 * 从 configuration.yaml 拉取 template 块并更新本地库。
 * 按 unique_id 深度扫描配置目录，提取 YAML 后校验并落库。
 * @returns 拉取结果（success / message / yaml）
 */
export async function pullFromHaConfig(
  deps: TemplateHaSyncFsDeps,
  templateId: string,
): Promise<{ success: boolean; message: string; yaml?: string }> {
  const row = await deps.prisma.templateEntity.findUnique({ where: { id: templateId } });
  if (!row) return { success: false, message: '模板实体不存在' };

  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (!cfgDir) {
    return {
      success: false,
      message: '未配置 automation.haConfigDir，无法从 configuration.yaml 读取',
    };
  }
  if (smb?.ok === false) return { success: false, message: smb.message };

  const uniqueId = String(
    row.haConfigId || extractUniqueIdFromYaml(row.yaml, toHaConfigId(row.id)) || '',
  ).trim();
  if (!uniqueId)
    return {
      success: false,
      message: '无法确定 unique_id，请先关联 HA 或保存含 unique_id 的 YAML',
    };

  // UNC 路径网络延迟更高，给 60s 超时；本地路径 30s 足够
  const yamlText = await withAsyncTimeout(
    extractTemplateFromLocalHaConfigDir(cfgDir, uniqueId, row.haEntityId || undefined),
    isUncConfigPath(cfgDir) ? 60_000 : 30_000,
  );
  if (!yamlText?.trim()) {
    const probe = await probeHaConfigDir(cfgDir);
    return {
      success: false,
      message: `未在 ${cfgDir} 找到 unique_id=${uniqueId}（configuration.yaml 存在=${probe.configurationYamlExists}）。请确认 YAML 中含 unique_id 或旧版键名 ${uniqueId}:`,
    };
  }
  const hit = { found: true, yaml: yamlText, message: `已解析 unique_id=${uniqueId}` };

  const localCheck = validateTemplateYamlLocal(hit.yaml);
  if (!localCheck.valid)
    return { success: false, message: `读取的 YAML 校验失败: ${localCheck.message}` };

  await deps.prisma.templateEntity.update({
    where: { id: templateId },
    data: {
      yaml: hit.yaml,
      haConfigId: uniqueId,
      contentHash: hashContent(hit.yaml),
      yamlSource: 'configuration_yaml',
      yamlComplete: true,
      haSyncedAt: new Date(),
    },
  });
  return {
    success: true,
    yaml: hit.yaml,
    message: hit.message,
  };
}

/**
 * syncToHA 中写入 configuration.yaml 的路径。
 * 作为 Template Helper 不可用时的回退方案。
 * 返回不同 outcome 供调用方决定后续策略：
 * - smb_error：SMB 连接失败
 * - written：成功写入并已 reload
 * - timeout：写入超时
 * - unavailable：未配置 haConfigDir
 * - failed：其他写入失败
 */
export async function pushTemplateYamlToHaConfigDir(
  deps: TemplateHaSyncFsDeps,
  params: {
    templateId: string;
    uniqueId: string;
    row: { yaml: string; name: string; haEntityId?: string | null };
    haEntity: { entity_id: string } | null;
  },
): Promise<
  | { outcome: 'smb_error'; message: string }
  | { outcome: 'written'; message: string }
  | { outcome: 'timeout'; cfgDir: string }
  | { outcome: 'unavailable'; cfgDir: undefined }
  | { outcome: 'failed'; cfgDir: string }
> {
  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (cfgDir && smb?.ok === false) {
    return { outcome: 'smb_error', message: smb.message };
  }
  if (!cfgDir) {
    return { outcome: 'unavailable', cfgDir: undefined };
  }
  try {
    // 写入配置目录设 12s 超时，避免网络挂起阻塞同步流程
    const written = await withAsyncTimeout(
      upsertTemplateBlockToHaConfigDir(cfgDir, params.uniqueId, params.row.yaml),
      12_000,
    );
    if (!written) {
      return { outcome: 'timeout', cfgDir };
    }
    if (written.written) {
      await deps.tryTemplateReload('配置已写入');
      await deps.prisma.templateEntity.update({
        where: { id: params.templateId },
        data: {
          haConfigId: params.uniqueId,
          haEntityId: params.haEntity?.entity_id || params.row.haEntityId,
          haSyncedAt: new Date(),
          contentHash: hashContent(params.row.yaml),
          yamlSource: 'configuration_yaml',
          yamlComplete: true,
        },
      });
      return {
        outcome: 'written',
        message: `${written.message}。已执行 template.reload（请确认 HA 读取的是该配置目录）`,
      };
    }
    deps.logger.warn(`写入 HA 配置目录失败 [${params.row.name}]: ${written.message}`);
  } catch (e: unknown) {
    deps.logger.warn(`写入 configuration.yaml 失败 [${params.row.name}]: ${getErrorMessage(e)}`);
  }
  return { outcome: 'failed', cfgDir };
}
/**
 * removeFromHAByConfigId 中从 configuration.yaml 删除 template 块。
 * 删除成功后执行 template.reload 并清空数据库中的 HA 关联字段。
 * @returns 成功返回 { success, message }，未配置目录或 SMB 失败返回 null
 */
export async function removeTemplateFromHaConfigDir(
  deps: TemplateHaSyncFsDeps,
  params: {
    uniqueId: string;
    entityId?: string;
    label: string;
  },
): Promise<{ success: boolean; message?: string } | null> {
  const { dir: cfgDir, smb } = await deps.accessHaConfigDir();
  if (cfgDir && smb?.ok === false) {
    deps.logger.warn(`从 configuration.yaml 删除前 SMB 连接失败: ${smb.message}`);
  }
  if (!cfgDir || smb?.ok === false) return null;

  try {
    const removed = await withAsyncTimeout(
      removeTemplateBlockFromHaConfigDir(cfgDir, params.uniqueId, params.entityId),
      12_000,
    );
    if (removed?.success) {
      await deps.tryTemplateReload('配置已删除');
      await deps.prisma.templateEntity.updateMany({
        where: {
          OR: [
            ...(params.uniqueId ? [{ haConfigId: params.uniqueId }] : []),
            ...(params.entityId ? [{ haEntityId: params.entityId }] : []),
          ],
        },
        data: { haConfigId: null, haConfigEntryId: null, haEntityId: null, haSyncedAt: null },
      });
      deps.logger.log(`模板实体 [${params.label}] ${removed.message}`);
      return {
        success: true,
        message: removed.message || `已从 configuration.yaml 删除「${params.label}」`,
      };
    }
    deps.logger.debug(
      `configuration.yaml 自动删除未命中: ${removed?.message || '未找到对应块或操作超时'}`,
    );
  } catch (e: unknown) {
    deps.logger.warn(`从 configuration.yaml 删除 [${params.label}] 失败: ${getErrorMessage(e)}`);
  }
  return null;
}

/** removeFromHAByConfigId 失败提示中使用的配置目录探测 */
export async function resolveHaConfigDirForRemoveHint(deps: TemplateHaSyncFsDeps) {
  const { dir: cfgDir } = await deps.accessHaConfigDir();
  return cfgDir;
}

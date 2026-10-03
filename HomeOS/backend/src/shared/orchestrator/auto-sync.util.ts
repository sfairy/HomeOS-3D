/**
 * 联动器保存后自动同步 HA 工具。
 *
 * 所属模块：backend/src/shared/orchestrator
 * 职责：
 *   - shouldAutoSyncAutomationRecord：判定自动化是否应在保存时自动推送（禁用/含占位符则不推送）；
 *   - maybeAutoSyncOnSave：若启用 autoSyncOnSave，后台触发 HA 同步（不阻塞 API 响应）。
 * 关键依赖：../../common/resilience/circuit-breaker.helper#scheduleBackgroundTask（后台任务调度）。
 */
import type { Logger } from '@nestjs/common';
import { findReplaceableEntityIdsInYaml } from '@homeos/shared';
import { scheduleBackgroundTask } from '../../common/resilience/circuit-breaker.helper';

/** 联动器 HA 同步配置开关（来自 AppConfigService.automation 分区） */
export interface OrchestratorHaSyncConfig {
  haSyncEnabled?: boolean;
  autoSyncOnSave?: boolean;
}

/** 草案或未启用自动化不应在保存时自动推送到 HA */
export function shouldAutoSyncAutomationRecord(record: {
  enabled?: boolean | null;
  yaml?: string | null;
}): boolean {
  if (record.enabled === false) return false;
  const yaml = String(record.yaml || '');
  if (yaml && findReplaceableEntityIdsInYaml(yaml).length > 0) return false;
  return true;
}


/** 若启用 autoSyncOnSave，则后台触发 HA 同步（不阻塞 API 响应） */
export function maybeAutoSyncOnSave(
  cfg: OrchestratorHaSyncConfig,
  logger: Logger,
  label: string,
  sync: () => Promise<{ success: boolean; message?: string }>,
) {
  if (cfg.haSyncEnabled && cfg.autoSyncOnSave) {
    scheduleOrchestratorHaSync(logger, label, sync);
  }
}

/** 保存后后台 HA 同步：失败写 logger.warn，并尽量回写 sync outcome（不阻塞 API） */
function scheduleOrchestratorHaSync(
  logger: Logger,
  label: string,
  sync: () => Promise<{ success: boolean; message?: string; needsAttention?: boolean }>,
  onResult?: (result: { success: boolean; message?: string; needsAttention?: boolean }) => void,
) {
  scheduleBackgroundTask(logger, label, async () => {
    const result = await sync();
    if (!result.success && result.message) {
      logger.warn(`${label}: ${result.message}`);
    }
    onResult?.(result);
    return result;
  });
}

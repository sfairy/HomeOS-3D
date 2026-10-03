/**
 * @file service.ts
 * @module system/backup
 * @description AppConfig 运行参数备份服务。负责运行参数（AppConfig）的导出、导入、
 * 校验与脱敏，是完整备份包（SystemBundleBackupService）的 appConfig 分区提供方。
 *
 * 关键策略：
 *  - 导出时可选脱敏敏感字段（maskSensitiveFieldsByKey），导入时按 CONFIG_MASK_PLACEHOLDER 校验
 *  - 导入走两阶段：normalizeAppConfigForImport 归一化 → validateAppConfigPartial / validateAppConfigReplaceImport 校验
 *  - 配置摘要（getConfigSummary）按分区统计字段数，用于 UI 展示备份覆盖范围
 *
 * 依赖：
 *  - AppConfigService：原始配置读取与持久化
 *  - app-config/import-normalize.util / validate/*：导入归一化与校验
 *  - app-config/config-mask.util：敏感字段脱敏
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../../common/utils/business-exception';
import {
  AppConfigData,
  AppConfigService,
} from '../../../shared/app-config/service';
import { APP_CONFIG_SCHEMA_VERSION } from '../../../shared/app-config/constants';import { normalizeAppConfigForImport } from '../../../shared/app-config/import-normalize.util';
import { validateAppConfigPartial } from '../../../shared/app-config/validate/core.util';
import { validateAppConfigReplaceImport } from '../../../shared/app-config/validate/replace-import.util';
import {
  CONFIG_MASK_PLACEHOLDER,
  maskSensitiveFieldsByKey,
} from '../../../shared/app-config/config-mask.util';
import { API_ERROR } from '../../../common/errors/api-error-messages';

const APP_CONFIG_BACKUP_SCHEMA = APP_CONFIG_SCHEMA_VERSION;

type AppConfigExportPayload = {
  schemaVersion: number;
  exportedAt: string;
  config: AppConfigData;
};

@Injectable()
/**
 * AppConfigBackupService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AppConfigBackupService
 */
export class AppConfigBackupService {
  private readonly logger = new Logger(AppConfigBackupService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  /** 运行参数各分区字段数（无需全量 export） */
  getConfigSummary() {
    const config = this.appConfig.exportRaw();
    const sections = Object.entries(config).map(([section, value]) => {
      const fieldCount =
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.keys(value as Record<string, unknown>).length
          : 0;
      return { section, fieldCount };
    });
    const totalFields = sections.reduce((sum, s) => sum + s.fieldCount, 0);
    return {
      schemaVersion: APP_CONFIG_BACKUP_SCHEMA,
      sectionCount: sections.length,
      totalFields,
      sections,
    };
  }

  export(maskSecrets = true): AppConfigExportPayload {
    const raw = this.appConfig.exportRaw();
    const config = maskSecrets ? this.maskSecrets(raw) : raw;
    return {
      schemaVersion: APP_CONFIG_BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      config,
    };
  }

  async import(payload: {
    config?: AppConfigData | Record<string, unknown>;
    schemaVersion?: number;
    mode?: 'merge' | 'replace';
    confirm?: boolean;
  }) {
    const config = payload?.config as AppConfigData | undefined;
    if (!config || typeof config !== 'object') {
      badRequest(API_ERROR.BACKUP_CONFIG_MISSING);
    }
    const mode = payload.mode === 'replace' ? 'replace' : 'merge';
    if (mode === 'replace' && !payload.confirm) {
      badRequest(API_ERROR.BACKUP_CONFIG_CONFIRM_REQUIRED);
    }
    if (payload.schemaVersion != null && payload.schemaVersion > APP_CONFIG_SCHEMA_VERSION) {
      badRequest(API_ERROR.BACKUP_SCHEMA_TOO_NEW(payload.schemaVersion, APP_CONFIG_SCHEMA_VERSION));
    }

    const normalized = normalizeAppConfigForImport(
      structuredClone(config) as unknown as Record<string, unknown>,
    );
    if (normalized.changes.length) {
      this.logger.warn(`运行参数导入已自动修正: ${normalized.changes.join('; ')}`);
    }
    const configToImport = normalized.config as unknown as AppConfigData;

    if (mode === 'replace') {
      validateAppConfigReplaceImport(configToImport);
      await this.appConfig.replaceAll(configToImport);
      return { mode, sections: Object.keys(configToImport).length };
    }

    validateAppConfigPartial(configToImport);
    await this.appConfig.update(configToImport);
    return { mode, sections: Object.keys(config).length };
  }

  private maskSecrets(config: AppConfigData): AppConfigData {
    const out = structuredClone(config) as unknown as Record<string, unknown>;
    maskSensitiveFieldsByKey(out, CONFIG_MASK_PLACEHOLDER, 0, 5);
    return out as unknown as AppConfigData;
  }
}

/**
 * @file system-bundle-backup.service.ts
 * @module system/backup
 * @description 完整备份包服务。聚合 UI 配置 / AppConfig / 用户三个分区为统一备份包，
 * 支持按分区白名单选择性导出 / 导入。
 *
 * 关键策略：
 *  - 导出附 kind=homeos-system-bundle 与 schemaVersion=2；可选脱敏（手动备份不脱敏）
 *  - 导入按 normalizeBundleSections 校验白名单分区，未知名直接拒绝
 *
 * 依赖：
 *  - UiConfigService：UI 配置分区
 *  - AppConfigBackupService：AppConfig 分区
 *  - UsersBackupService：用户分区
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../../common/utils/business-exception';
import { UiConfigService } from '../../ui-config/service';
import { AppConfigBackupService } from './service';
import { UsersBackupService, type UserBackupRow } from './users-backup.service';
import type { AppConfigData } from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { API_ERROR } from '../../../common/errors/api-error-messages';

const BUNDLE_BACKUP_KIND = 'homeos-system-bundle';
const BUNDLE_BACKUP_SCHEMA = 2;

/** 标准分区名白名单（未知分区名将被拒绝） */
const BUNDLE_IMPORT_SECTION_WHITELIST: Array<'ui' | 'appConfig' | 'users'> = [
  'ui',
  'appConfig',
  'users',
];

/** 白名单校验导入分区列表 */
function normalizeBundleSections(sections?: string[]): Array<'ui' | 'appConfig' | 'users'> {
  const raw = sections?.length ? sections : SystemBundleBackupService.DEFAULT_IMPORT_SECTIONS;
  return raw.map((section) => {
    const normalized = section as 'ui' | 'appConfig' | 'users';
    if (!BUNDLE_IMPORT_SECTION_WHITELIST.includes(normalized)) {
      badRequest(API_ERROR.BACKUP_BUNDLE_SECTIONS_INVALID);
    }
    return normalized;
  });
}

type EventLogBackupSlice = {
  exportedAt: string;
  rowCount: number;
  rows: Array<{
    entityId: string;
    oldState: unknown;
    newState: unknown;
    stateDiff: string | null;
    createdAt: string;
  }>;
};

type SystemBundleBackup = {
  kind: typeof BUNDLE_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  ui: Awaited<ReturnType<UiConfigService['exportAllConfigs']>>;
  appConfig: ReturnType<AppConfigBackupService['export']>;
  users?: { kind: string; exportedAt: string; users: UserBackupRow[] };
  eventLog?: EventLogBackupSlice;
};

type ExportBundleOptions = {
  /** 是否附带 EventLog 审计切片 */
  includeEventLog?: boolean;
  eventLogLimit?: number;
};

/**
 * SystemBundleBackupService：Nest @Injectable 服务。
 * - 职责：聚合 UI / AppConfig / 用户分区为完整备份包并支持选择性导入；
 * - 装配：由 SystemBackupModule 的 providers 数组注入；
 * - 生命周期：无 onModuleInit/onModuleDestroy 钩子；
 */
@Injectable()
export class SystemBundleBackupService {
  private readonly logger = new Logger(SystemBundleBackupService.name);

  constructor(
    private readonly uiConfig: UiConfigService,
    private readonly appConfigBackup: AppConfigBackupService,
    private readonly usersBackup: UsersBackupService,
    private readonly prisma: PrismaService,
  ) {}

  /** 完整备份包各层数量摘要（不导出大 JSON） */
  async getBackupSummary() {
    const [ui, users] = await Promise.all([
      this.uiConfig.getProfilesSummary(),
      this.usersBackup.exportUsers(),
    ]);
    return {
      kind: BUNDLE_BACKUP_KIND,
      schemaVersion: BUNDLE_BACKUP_SCHEMA,
      ui,
      appConfig: this.appConfigBackup.getConfigSummary(),
      users: { count: users.users.length },
    };
  }

  async exportBundle(
    maskSecrets = true,
    opts: ExportBundleOptions = {},
  ): Promise<SystemBundleBackup> {
    const [ui, users] = await Promise.all([
      this.uiConfig.exportAllConfigs(),
      this.usersBackup.exportUsers(),
    ]);
    const bundle: SystemBundleBackup = {
      kind: BUNDLE_BACKUP_KIND,
      schemaVersion: BUNDLE_BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      ui,
      appConfig: this.appConfigBackup.export(maskSecrets),
      users,
    };
    if (opts.includeEventLog) {
      bundle.eventLog = await this.exportEventLogSlice(opts.eventLogLimit ?? 10_000);
    }
    return bundle;
  }

  private async exportEventLogSlice(limit: number): Promise<EventLogBackupSlice> {
    const take = Math.min(Math.max(limit, 1), 10_000);
    const rows = await this.prisma.eventLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return {
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows: rows.map((r) => ({
        entityId: r.entityId,
        oldState: r.oldState,
        newState: r.newState,
        stateDiff: r.stateDiff,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  normalizeBundleInput(raw: unknown): SystemBundleBackup {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      badRequest(API_ERROR.BACKUP_BUNDLE_INVALID_JSON);
    }
    const obj = raw as Record<string, unknown>;
    const isBundleKind = obj.kind === BUNDLE_BACKUP_KIND;
    const hasLegacyShape = obj.ui != null && obj.appConfig != null;
    if (!isBundleKind && !hasLegacyShape) {
      badRequest(
        '不是 HomeOS 完整备份包（需 kind=homeos-system-bundle 或同时含 ui / appConfig）',
      );
    }

    // 必要顶层字段类型校验：防止畸形数据在导入阶段被静默跳过或触发运行时异常
    if (!Array.isArray(obj.ui)) {
      badRequest(API_ERROR.BACKUP_BUNDLE_INVALID_STRUCTURE);
    }
    if (
      typeof obj.appConfig !== 'object' ||
      obj.appConfig === null ||
      Array.isArray(obj.appConfig)
    ) {
      badRequest(API_ERROR.BACKUP_BUNDLE_INVALID_STRUCTURE);
    }
    if (obj.schemaVersion !== undefined && typeof obj.schemaVersion !== 'number') {
      badRequest(API_ERROR.BACKUP_BUNDLE_INVALID_STRUCTURE);
    }

    return obj as unknown as SystemBundleBackup;
  }

  /** 默认还原分区：与 UI「不含用户账号」一致；users 需显式传入 sections */
  static readonly DEFAULT_IMPORT_SECTIONS: Array<'ui' | 'appConfig' | 'users'> = [
    'ui',
    'appConfig',
  ];

  private async rollbackBundleSnapshot(
    snapshot: {
      ui: Awaited<ReturnType<UiConfigService['exportAllConfigs']>>;
      appConfig: ReturnType<AppConfigBackupService['export']>;
      users?: { users: UserBackupRow[] };
      usersCreated?: string[];
    },
    applied: Array<'appConfig' | 'ui' | 'users'>,
  ) {
    const reverse = [...applied].reverse();
    for (const section of reverse) {
      try {
        if (section === 'ui' && Array.isArray(snapshot.ui) && snapshot.ui.length) {
          const configs = snapshot.ui.map((row) => ({
            projectId: row.projectId,
            layout: row.layout as Record<string, unknown>,
          }));
          await this.uiConfig.importAllConfigs(configs);
        } else if (section === 'appConfig' && snapshot.appConfig?.config) {
          await this.appConfigBackup.import({
            config: snapshot.appConfig.config as AppConfigData,
            mode: 'replace',
            confirm: true,
          });
        } else if (section === 'users') {
          await this.usersBackup.rollbackUsersImport({
            priorUsers: snapshot.users?.users ?? [],
            createdUsernames: snapshot.usersCreated ?? [],
          });
        }
      } catch (rollbackErr) {
        this.logger.error(
          `备份回滚 ${section} 失败: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`,
        );
      }
    }
    this.logger.warn(`备份包导入失败,已尝试回滚: ${applied.join(', ')}`);
  }

  async importBundle(payload: {
    bundle?: unknown;
    appConfigMode?: 'merge' | 'replace';
    confirm?: boolean;
    /** 待导入分区（省略时默认 ui+appConfig） */
    sections?: string[];
  }) {
    const bundle = this.normalizeBundleInput(payload.bundle);
    if (bundle.schemaVersion > BUNDLE_BACKUP_SCHEMA) {
      badRequest(API_ERROR.BUNDLE_SCHEMA_TOO_NEW(bundle.schemaVersion, BUNDLE_BACKUP_SCHEMA));
    }
    if (!payload.confirm) {
      badRequest(API_ERROR.BACKUP_BUNDLE_CONFIRM_REQUIRED);
    }

    // 分区白名单校验：仅应用选定分区，其余分区保持不动
    const want = new Set(normalizeBundleSections(payload.sections));
    const appConfigMode = payload.appConfigMode === 'replace' ? 'replace' : 'merge';
    const result: Record<string, unknown> = { sections: [] as string[] };

    const snapshot = {
      ui: await this.uiConfig.exportAllConfigs(),
      appConfig: this.appConfigBackup.export(false),
      users: want.has('users') ? await this.usersBackup.exportUsers() : undefined,
      usersCreated: [] as string[],
    };
    const applied: Array<'appConfig' | 'ui' | 'users'> = [];

    try {
      if (want.has('appConfig') && bundle.appConfig?.config) {
        result.appConfig = await this.appConfigBackup.import({
          config: bundle.appConfig.config as AppConfigData,
          schemaVersion: bundle.appConfig.schemaVersion,
          mode: appConfigMode,
          confirm: appConfigMode === 'replace',
        });
        applied.push('appConfig');
        (result.sections as string[]).push('appConfig');
      }

      if (want.has('ui') && Array.isArray(bundle.ui) && bundle.ui.length) {
        const configs = bundle.ui
          .filter(
            (row) => row && typeof row === 'object' && (row as { projectId?: string }).projectId,
          )
          .map((row) => {
            const r = row as { projectId: string; layout: unknown };
            return {
              projectId: r.projectId,
              layout: r.layout,
            };
          });
        if (!configs.length) {
          badRequest(API_ERROR.BACKUP_BUNDLE_UI_LAYOUT_INVALID);
        }
        result.ui = await this.uiConfig.importAllConfigs(configs);
        applied.push('ui');
        (result.sections as string[]).push('ui');
      }

      if (want.has('users') && bundle.users?.users?.length) {
        const usersResult = await this.usersBackup.importUsers(bundle.users.users, {
          skipExisting: true,
        });
        result.users = usersResult;
        snapshot.usersCreated = usersResult.createdUsernames;
        applied.push('users');
        (result.sections as string[]).push('users');
      }
    } catch (err) {
      await this.rollbackBundleSnapshot(snapshot, applied);
      throw err;
    }

    this.logger.log(`完整备份包已导入: ${JSON.stringify(result.sections)}`);
    return { success: true, ...result };
  }
}

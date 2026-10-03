/**
 * @file orchestrator-backup.service.ts
 * @module system/backup
 * @description 联动器备份服务。负责自动化 / 场景 / 脚本 / 模板实体 / 家庭模式 /
 * 告警规则 / 房间 / 安防面板 / 能耗基线等联动器表的导出与导入，
 * 是完整备份包（SystemBundleBackupService）的 orchestrator 分区提供方。
 *
 * 关键策略：
 *  - 导出按表清单 ORCHESTRATOR_TABLE_KEYS 顺序序列化，附 schemaVersion 与 exportedAt
 *  - 导入按分区白名单校验，逐表 upsert（toInputJson 兼容 Prisma JSON 字段）
 *  - 列表查询走 buildPaginatedResult 分页
 *
 * 依赖：
 *  - PrismaService：联动器各表读写
 *  - json-field.util：JSON 字段读写兼容
 *  - pagination.util：分页结果构建
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../../common/utils/business-exception';
import { PrismaService } from '../../../shared/prisma/service';
import { buildPaginatedResult } from '../../../common/crud/pagination.util';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { toInputJson } from '../../../common/utils/json-field.util';
import { Prisma } from '../../../generated/prisma/client';

const ORCHESTRATOR_BACKUP_SCHEMA = 3;

const ORCHESTRATOR_TABLE_KEYS = [
  'automations',
  'scenes',
  'scripts',
  'templateEntities',
  'homeModes',
  'alertRules',
  'areas',
  'securityPanel',
  'energyBaselines',
] as const;

type OrchestratorTableKey = (typeof ORCHESTRATOR_TABLE_KEYS)[number];

interface OrchestratorInventoryItem {
  id: string;
  name: string;
  updatedAt: string;
  enabled?: boolean;
}

@Injectable()
/**
 * OrchestratorBackupService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class OrchestratorBackupService
 */
export class OrchestratorBackupService {
  private readonly logger = new Logger(OrchestratorBackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 联动器各表条目数量（无需全量 export） */
  async getInventorySummary() {
    const [auto, scene, script, tpl, mode, alert, area, energy] = await Promise.all([
      this.prisma.automation.count(),
      this.prisma.scene.count(),
      this.prisma.script.count(),
      this.prisma.templateEntity.count(),
      this.prisma.homeMode.count(),
      this.prisma.alertRule.count(),
      this.prisma.area.count(),
      this.prisma.energyBaseline.count(),
    ]);
    const secRow = await this.prisma.runtimeKv.findUnique({
      where: { id: 'security-panel' },
      select: { id: true },
    });
    const counts = [auto, scene, script, tpl, mode, alert, area, secRow ? 1 : 0, energy];
    const tables = Object.fromEntries(
      ORCHESTRATOR_TABLE_KEYS.map((key, i) => [key, { count: counts[i] }]),
    ) as Record<OrchestratorTableKey, { count: number }>;
    const total = counts.reduce((sum, n) => sum + n, 0);
    return {
      schemaVersion: ORCHESTRATOR_BACKUP_SCHEMA,
      tables,
      total,
    };
  }

  /** 分页列出联动器条目（id/name/updatedAt） */
  async listInventory(type: OrchestratorTableKey, page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(Math.max(pageSize, 5), 200);
    const skip = (safePage - 1) * safeSize;
    const orderBy = { updatedAt: 'desc' as const };
    const select = { id: true, name: true, updatedAt: true };

    let items: OrchestratorInventoryItem[] = [];
    let total = 0;

    switch (type) {
      case 'automations': {
        const [rows, count] = await Promise.all([
          this.prisma.automation.findMany({
            select: { ...select, enabled: true },
            orderBy,
            skip,
            take: safeSize,
          }),
          this.prisma.automation.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'scenes': {
        const [rows, count] = await Promise.all([
          this.prisma.scene.findMany({ select, orderBy, skip, take: safeSize }),
          this.prisma.scene.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'scripts': {
        const [rows, count] = await Promise.all([
          this.prisma.script.findMany({ select, orderBy, skip, take: safeSize }),
          this.prisma.script.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'templateEntities': {
        const [rows, count] = await Promise.all([
          this.prisma.templateEntity.findMany({ select, orderBy, skip, take: safeSize }),
          this.prisma.templateEntity.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'homeModes': {
        const [rows, count] = await Promise.all([
          this.prisma.homeMode.findMany({ select, orderBy, skip, take: safeSize }),
          this.prisma.homeMode.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'alertRules': {
        const [rows, count] = await Promise.all([
          this.prisma.alertRule.findMany({
            select: { ...select, enabled: true },
            orderBy,
            skip,
            take: safeSize,
          }),
          this.prisma.alertRule.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'areas': {
        const [rows, count] = await Promise.all([
          this.prisma.area.findMany({ select, orderBy, skip, take: safeSize }),
          this.prisma.area.count(),
        ]);
        items = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
        total = count;
        break;
      }
      case 'securityPanel': {
        const row = await this.prisma.runtimeKv.findUnique({
          where: { id: 'security-panel' },
        });
        if (row) {
          items = [
            {
              id: 'security-panel',
              name: '安防面板区配置',
              updatedAt: row.updatedAt.toISOString(),
            },
          ];
          total = 1;
        }
        break;
      }
      case 'energyBaselines': {
        const [rows, count] = await Promise.all([
          this.prisma.energyBaseline.findMany({
            select: { id: true, entityId: true, updatedAt: true },
            orderBy,
            skip,
            take: safeSize,
          }),
          this.prisma.energyBaseline.count(),
        ]);
        items = rows.map((r) => ({
          id: r.id,
          name: r.entityId,
          updatedAt: r.updatedAt.toISOString(),
        }));
        total = count;
        break;
      }
      default:
        badRequest(API_ERROR.ORCHESTRATOR_UNKNOWN_TYPE(type));
    }

    return buildPaginatedResult(items, total, safePage, safeSize);
  }

  async exportAll() {
    const batchSize = 200;
    const [
      automations,
      scenes,
      scripts,
      templateEntities,
      homeModes,
      alertRules,
      areas,
      energyBaselines,
      securityPanelRow,
    ] = await Promise.all([
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.automation.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.scene.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.script.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.templateEntity.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.homeMode.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.alertRule.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.area.findMany({
            orderBy: { updatedAt: 'desc' },
            skip,
            take,
            include: { entities: { orderBy: { sortOrder: 'asc' } } },
          }),
        batchSize,
      ),
      this.fetchAllBatched(
        (skip, take) =>
          this.prisma.energyBaseline.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
        batchSize,
      ),
      this.prisma.runtimeKv.findUnique({ where: { id: 'security-panel' } }),
    ]);

    const securityPanel = securityPanelRow
      ? [{ id: 'security-panel', data: securityPanelRow.data, updatedAt: securityPanelRow.updatedAt }]
      : [];

    // EnergyBaseline.lastAlert 为 BigInt，直接 JSON.stringify 会 500
    const energyBaselinesJson = energyBaselines.map((row) => ({
      ...row,
      lastAlert:
        typeof row.lastAlert === 'bigint' ? Number(row.lastAlert) : Number(row.lastAlert ?? 0),
    }));

    return {
      schemaVersion: ORCHESTRATOR_BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      automations,
      scenes,
      scripts,
      templateEntities,
      homeModes,
      alertRules,
      areas,
      securityPanel,
      energyBaselines: energyBaselinesJson,
    };
  }

  validateImportPayload(payload: Record<string, unknown>, opts?: { allowEmptyWipe?: boolean }) {
    if (
      payload.schemaVersion != null &&
      Number(payload.schemaVersion) > ORCHESTRATOR_BACKUP_SCHEMA
    ) {
      badRequest(
        `联动器备份 schema ${payload.schemaVersion} 高于当前 ${ORCHESTRATOR_BACKUP_SCHEMA}`,
      );
    }
    const hasArrayKey = ORCHESTRATOR_TABLE_KEYS.some((k) => Array.isArray(payload[k]));
    const hasData = ORCHESTRATOR_TABLE_KEYS.some(
      (k) => Array.isArray(payload[k]) && (payload[k] as unknown[]).length > 0,
    );
    if (!hasArrayKey || (!hasData && !opts?.allowEmptyWipe)) {
      badRequest(API_ERROR.BACKUP_ORCHESTRATOR_EMPTY);
    }
  }

  previewImport(payload: Record<string, unknown>) {
    this.validateImportPayload(payload);
    const counts: Record<string, number> = {};
    for (const key of ORCHESTRATOR_TABLE_KEYS) {
      counts[key] = Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0;
    }
    return {
      schemaVersion: payload.schemaVersion ?? ORCHESTRATOR_BACKUP_SCHEMA,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  async importAll(payload: {
    automations?: unknown[];
    scenes?: unknown[];
    scripts?: unknown[];
    templateEntities?: unknown[];
    homeModes?: unknown[];
    alertRules?: unknown[];
    areas?: unknown[];
    securityPanel?: unknown[];
    energyBaselines?: unknown[];
    schemaVersion?: number;
    confirm?: boolean;
    dryRun?: boolean;
    /** true：备份中出现的表（含空数组）一律先清空再写入，实现真正全量替换 */
    replaceEmptyTables?: boolean;
  }) {
    const record = payload as Record<string, unknown>;
    const replaceEmpty = payload.replaceEmptyTables === true;
    this.validateImportPayload(record, { allowEmptyWipe: replaceEmpty });
    if (payload.dryRun) {
      return { success: true, dryRun: true, preview: this.previewImport(record) };
    }
    if (!payload.confirm) {
      badRequest(API_ERROR.BACKUP_ORCHESTRATOR_CONFIRM_REQUIRED);
    }
    const counts = {
      automations: 0,
      scenes: 0,
      scripts: 0,
      templateEntities: 0,
      homeModes: 0,
      alertRules: 0,
      areas: 0,
      securityPanel: 0,
      energyBaselines: 0,
    };

    const shouldReplace = (key: OrchestratorTableKey) => {
      if (!Array.isArray(payload[key])) return false;
      return replaceEmpty || (payload[key] as unknown[]).length > 0;
    };

    const homeModeActiveByGroup = new Map<string, number>();
    await this.prisma.$transaction(async (tx) => {
      if (shouldReplace('automations')) {
        await tx.automation.deleteMany({});
        const rows = ((payload.automations as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name && row?.yaml)
          .map((row) => ({
            ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
            name: String(row.name),
            yaml: String(row.yaml),
            geekGraph: row.geekGraph ?? undefined,
            enabled: row.enabled !== false,
            haConfigId: row.haConfigId ? String(row.haConfigId) : null,
            runOnHa: Boolean(row.runOnHa),
            haSyncedAt: row.haSyncedAt ? new Date(String(row.haSyncedAt)) : null,
          }));
        if (rows.length) {
          await tx.automation.createMany({ data: rows });
          counts.automations = rows.length;
        }
      }
      if (shouldReplace('scenes')) {
        await tx.scene.deleteMany({});
        const rows = ((payload.scenes as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name && row?.entities)
          .map((row) => ({
            ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
            name: String(row.name),
            entities: toInputJson(row.entities, []),
            yaml: row.yaml != null ? String(row.yaml) : null,
            geekSceneGraph: row.geekSceneGraph ?? undefined,
            haConfigId: row.haConfigId ? String(row.haConfigId) : null,
            runOnHa: Boolean(row.runOnHa),
            haSyncedAt: row.haSyncedAt ? new Date(String(row.haSyncedAt)) : null,
          }));
        if (rows.length) {
          await tx.scene.createMany({ data: rows });
          counts.scenes = rows.length;
        }
      }
      if (shouldReplace('scripts')) {
        await tx.script.deleteMany({});
        const rows = ((payload.scripts as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name && row?.yaml)
          .map((row) => ({
            ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
            name: String(row.name),
            yaml: String(row.yaml),
            geekGraph: row.geekGraph ?? undefined,
            haConfigId: row.haConfigId ? String(row.haConfigId) : null,
            runOnHa: Boolean(row.runOnHa),
            haSyncedAt: row.haSyncedAt ? new Date(String(row.haSyncedAt)) : null,
          }));
        if (rows.length) {
          await tx.script.createMany({ data: rows });
          counts.scripts = rows.length;
        }
      }
      if (shouldReplace('templateEntities')) {
        await tx.templateEntity.deleteMany({});
        const rows = ((payload.templateEntities as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name && row?.yaml)
          .map((row) => ({
            ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
            name: String(row.name),
            type: row.type ? String(row.type) : 'yaml_import',
            yaml: String(row.yaml),
            slotMapping: row.slotMapping ?? undefined,
            haConfigId: row.haConfigId ? String(row.haConfigId) : null,
            haEntityId: row.haEntityId
              ? String(row.haEntityId)
              : row.entityId
                ? String(row.entityId)
                : null,
            haConfigEntryId: row.haConfigEntryId ? String(row.haConfigEntryId) : null,
            yamlSource: row.yamlSource ? String(row.yamlSource) : null,
            yamlComplete: row.yamlComplete !== false,
            contentHash: row.contentHash ? String(row.contentHash) : null,
            haSyncedAt: row.haSyncedAt ? new Date(String(row.haSyncedAt)) : null,
          }));
        if (rows.length) {
          await tx.templateEntity.createMany({ data: rows });
          counts.templateEntities = rows.length;
        }
      }
      if (shouldReplace('homeModes')) {
        await tx.homeMode.deleteMany({});
        // 预处理：每个互斥组仅保留首个 isActive=true，避免多激活状态不一致
        homeModeActiveByGroup.clear();
        const rows = ((payload.homeModes as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name)
          .map((row) => {
            const group = row.exclusiveGroup ? String(row.exclusiveGroup) : 'default';
            const wantActive = Boolean(row.isActive);
            let isActive = false;
            if (wantActive && !homeModeActiveByGroup.has(group)) {
              homeModeActiveByGroup.set(group, 1);
              isActive = true;
            }
            return {
              ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
              name: String(row.name),
              icon: row.icon ? String(row.icon) : 'home',
              config: toInputJson(row.config ?? [], []),
              triggers: row.triggers != null ? toInputJson(row.triggers, []) : Prisma.DbNull,
              deviceSnapshot:
                row.deviceSnapshot != null
                  ? toInputJson(row.deviceSnapshot, {})
                  : Prisma.DbNull,
              isActive,
              sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
              exclusiveGroup: group,
              priority: typeof row.priority === 'number' ? row.priority : 50,
            };
          });
        if (rows.length) {
          await tx.homeMode.createMany({ data: rows });
          counts.homeModes = rows.length;
        }
      }
      if (shouldReplace('alertRules')) {
        await tx.alertRule.deleteMany({});
        const rows = ((payload.alertRules as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.name)
          .map((row) => ({
            ...(typeof row.id === 'string' && row.id.trim() ? { id: String(row.id).trim() } : {}),
            name: String(row.name),
            entityId: row.entityId ? String(row.entityId) : null,
            condition:
              typeof row.condition === 'string'
                ? row.condition
                : JSON.stringify(row.condition ?? {}),
            level: row.level ? String(row.level) : 'warn',
            channels: Array.isArray(row.channels) ? row.channels : [],
            cooldownMinutes: typeof row.cooldownMinutes === 'number' ? row.cooldownMinutes : 60,
            enabled: row.enabled !== false,
            messageTemplate:
              row.messageTemplate != null ? String(row.messageTemplate) : null,
            title: row.title != null ? String(row.title) : null,
          }));
        if (rows.length) {
          await tx.alertRule.createMany({ data: rows });
          counts.alertRules = rows.length;
        }
      }
      if (shouldReplace('areas')) {
        await tx.areaEntity.deleteMany({});
        await tx.area.deleteMany({});
        const areaRows = ((payload.areas as Record<string, unknown>[]) ?? []).filter(
          (row) => row?.name,
        );
        for (const row of areaRows) {
          const preservedAreaId =
            typeof row.id === 'string' && row.id.trim() ? String(row.id).trim() : undefined;
          const created = await tx.area.create({
            data: {
              ...(preservedAreaId ? { id: preservedAreaId } : {}),
              name: String(row.name),
              icon: row.icon ? String(row.icon) : '🏠',
              backgroundUrl: row.backgroundUrl != null ? String(row.backgroundUrl) : null,
              haAreaId: row.haAreaId ? String(row.haAreaId) : null,
              sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
            },
          });
          const entities = Array.isArray(row.entities)
            ? (row.entities as Record<string, unknown>[])
            : [];
          const entityRows = entities
            .filter((e) => e?.entityId)
            .map((e, i) => ({
              ...(typeof e.id === 'string' && e.id.trim() ? { id: String(e.id).trim() } : {}),
              areaId: created.id,
              entityId: String(e.entityId),
              sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : i,
            }));
          if (entityRows.length) {
            await tx.areaEntity.createMany({ data: entityRows });
          }
          counts.areas += 1;
        }
      }
      if (shouldReplace('securityPanel')) {
        const rows = ((payload.securityPanel as Record<string, unknown>[]) ?? []).filter(
          (row) => row?.data != null,
        );
        if (rows.length === 0 && replaceEmpty) {
          await tx.runtimeKv.deleteMany({ where: { id: 'security-panel' } });
        } else if (rows[0]) {
          await tx.runtimeKv.upsert({
            where: { id: 'security-panel' },
            create: {
              id: 'security-panel',
              data: toInputJson(rows[0].data, {}),
            },
            update: {
              data: toInputJson(rows[0].data, {}),
            },
          });
          counts.securityPanel = 1;
        }
      }
      if (shouldReplace('energyBaselines')) {
        await tx.energyBaseline.deleteMany({});
        const rows = ((payload.energyBaselines as Record<string, unknown>[]) ?? [])
          .filter((row) => row?.entityId)
          .map((row) => ({
            entityId: String(row.entityId),
            readings: toInputJson(row.readings, []),
            lastAlert:
              typeof row.lastAlert === 'number' || typeof row.lastAlert === 'bigint'
                ? BigInt(row.lastAlert as number | bigint)
                : typeof row.lastAlert === 'string' && row.lastAlert.trim() !== ''
                  ? BigInt(row.lastAlert)
                  : BigInt(0),
          }));
        if (rows.length) {
          await tx.energyBaseline.createMany({ data: rows });
          counts.energyBaselines = rows.length;
        }
      }
    });

    this.logger.log(`联动器备份已导入: ${JSON.stringify(counts)}`);
    const imported = Object.values(counts).reduce((a, b) => a + b, 0);
    return { success: true, imported, counts };
  }

  /** 分批读取，避免单次 findMany 占用过多 DB 内存 */
  private async fetchAllBatched<T>(
    fetch: (skip: number, take: number) => Promise<T[]>,
    batchSize: number,
  ): Promise<T[]> {
    const all: T[] = [];
    let skip = 0;
    while (true) {
      const batch = await fetch(skip, batchSize);
      all.push(...batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
    return all;
  }
}

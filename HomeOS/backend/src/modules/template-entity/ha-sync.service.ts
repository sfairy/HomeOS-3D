/**
 * 模板实体 HA 同步门面
 *
 * 经 createTemplateEntityHaSync 纯工厂装配（引擎由 OrchestratorHaSyncBinder 经 Nest 注入），
 * 仅保留 DI 与对外方法转发；依赖聚合与同步编排收敛于 ha-sync.factory.ts。
 *
 * 对外职责（行为与重构前一致）：
 * - syncToHA / syncFromHA：单条推送 / 拉取（经 syncEngine 串行化）
 * - syncAllToHA / pullAllFromHA：批量推送 / 拉取
 * - getSyncStatus / getSyncPreview：漂移检测与 diff 预览
 * - writeToHaConfig / pullFromHaConfig / readFromHaConfig：configuration.yaml 读写
 * - configureHaConfigDir / getHaConfigStatus：HA 配置目录管理
 * - removeFromHA / removeFromHAByConfigId：从 HA 移除模板实体
 * - repairDrift / repairAllDrift：漂移修复
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { HaConnectorService } from '../ha-connector/service';
import { HaSyncService } from '../ha-sync/service';
import { OrchestratorHaSyncBinder } from '../../shared/orchestrator/orchestrator-ha-sync.binder';
import { TemplateEntityService } from './service';
import { createTemplateEntityHaSync } from './ha-sync.factory';
import type { TemplateImportMeta } from './ha-sync.internals';

export type { TemplateImportMeta };

/**
 * 模板实体 HA 同步门面（@Injectable）
 *
 * 构造器内通过 createTemplateEntityHaSync 一次性装配全部同步能力，
 * 下方方法仅做转发，与 ScriptHaSyncService 的薄门面范式一致。
 */
@Injectable()
export class TemplateEntityHaSyncService {
  private readonly sync: ReturnType<typeof createTemplateEntityHaSync>;

  /**
   * @param prisma 数据库
   * @param templateEntityService 模板实体本地服务（upsertFromHaImport）
   * @param haConnector HA 连接器
   * @param appConfig 应用配置
   * @param haSync 通用 HA 同步服务（YAML 校验、模板发现）
   * @param haSyncBinder 同步装配（CRUD + 引擎访问）
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEntityService: TemplateEntityService,
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly haSync: HaSyncService,
    haSyncBinder: OrchestratorHaSyncBinder,
  ) {
    this.sync = createTemplateEntityHaSync({
      logger: new Logger(TemplateEntityHaSyncService.name),
      prisma: this.prisma,
      templateEntityService: this.templateEntityService,
      haConnector: this.haConnector,
      appConfig: this.appConfig,
      haSync: this.haSync,
      haSyncBinder,
    });
  }

  syncToHA = (templateId: string) => this.sync.syncToHA(templateId);
  importPastedYaml = (body: {
    name: string;
    yaml: string;
    haConfigId?: string;
    entity_id?: string;
  }) => this.sync.importPastedYaml(body);
  previewResolve = (haConfigId: string, entityId?: string) =>
    this.sync.previewResolve(haConfigId, entityId);
  syncFromHA = (haConfigId: string, opts?: TemplateImportMeta) =>
    this.sync.syncFromHA(haConfigId, opts);
  pullAllFromHA = () => this.sync.pullAllFromHA();
  removeFromHA = (templateId: string) => this.sync.removeFromHA(templateId);
  removeFromHAByConfigId = (
    haConfigId: string,
    options?: { haConfigEntryId?: string; name?: string; entityId?: string },
  ) => this.sync.removeFromHAByConfigId(haConfigId, options);
  getSyncPreview = (templateId: string) => this.sync.getSyncPreview(templateId);
  getSyncStatus = (templateId: string) => this.sync.getSyncStatus(templateId);
  repairAllDrift = (direction: 'push' | 'pull' = 'push') => this.sync.repairAllDrift(direction);
  repairDrift = (templateId: string, direction: 'push' | 'pull' = 'push') =>
    this.sync.repairDrift(templateId, direction);
  syncAllToHA = () => this.sync.syncAllToHA();
  configureHaConfigDir = (dirPath: string, opts?: { user?: string; password?: string }) =>
    this.sync.configureHaConfigDir(dirPath, opts);
  getHaConfigStatus = () => this.sync.getHaConfigStatus();
  readFromHaConfig = (uniqueId: string) => this.sync.readFromHaConfig(uniqueId);
  writeToHaConfig = (templateId: string) => this.sync.writeToHaConfig(templateId);
  pullFromHaConfig = (templateId: string) => this.sync.pullFromHaConfig(templateId);
}

/**
 * 场景模块 - HA 同步服务
 *
 * 职责：场景配置与 Home Assistant 之间的双向同步。
 * - 推送（syncToHA）：将本地场景的 entities 配置序列化为 YAML，写入 HA scene 配置
 * - 拉取（syncFromHA）：从 HA 拉取 scene 配置，反序列化为本地 entities JSON
 * - 批量拉取（pullAllFromHA）：批量导入 HA 中的场景（仅 homeos_ 前缀）
 * - 删除（removeFromHA）：从 HA 删除场景配置并清除本地关联
 * - 偏移检测与修复（getSyncStatus / repairDrift / repairAllDrift）
 * - 同步预览（getSyncPreview）：同步前展示实体配置 diff
 *
 * 架构说明：
 * 场景与 automation / script 共用统一装配模板 —— 经 OrchestratorDomainHaSyncFactory
 * 装配（域差异收敛于 OrchestratorDomainAdapter：toHaConfig / haConfigToYaml / canonicalLocal），
 * 公共转发方法收敛于 OrchestratorDomainHaSyncFacade 基类。
 * 场景保留的域语义：
 * - entities ↔ HA scene map 的 canonical 往返规范化（漂移哈希用）
 * - 拉取时保留 HA 原文 YAML（entities 有损映射后仍可回退）
 * - runOnHa 拉取 + geekSceneGraph 清空（避免旧画布覆盖）
 * - pullAllFromHA 支持 ?all= 透传 allHaScenes（关闭 homeos_ 过滤器）
 *
 * 依赖：
 * - PrismaService：场景数据读写
 * - OrchestratorHaConnectorPort：HA REST API 调用（CRUD 配置、reload 服务）
 * - HaSyncService：YAML 校验
 * - OrchestratorDomainHaSyncFactory：统一域装配模板（引擎由 Nest 注入）
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { HaSyncService } from '../ha-sync/service';
import {
  ORCHESTRATOR_HA_CONNECTOR_PORT,
  type OrchestratorHaConnectorPort,
} from '../../shared/orchestrator/ha-connector.port';
import { canonicalEntitiesJson } from '../../shared/orchestrator/ha-sync.internals';
import { createPrismaRowAccessors } from '../../shared/orchestrator/yaml-ha-sync.util';
import { dumpOrchestratorYaml } from '../../shared/orchestrator/yaml.util';
import { haSceneMapToEntities, builderEntitiesToHaMap } from '../../shared/orchestrator/config.util';
import { OrchestratorDomainHaSyncFactory } from '../../shared/orchestrator/orchestrator-domain-ha-sync.factory';
import { OrchestratorDomainHaSyncFacade } from '../../shared/orchestrator/orchestrator-domain-ha-sync.facade';
import { Prisma } from '../../generated/prisma/client';

/**
 * 场景 HA 同步服务（DI 角色：HA 同步门面）。
 * 经 OrchestratorDomainHaSyncFacade 收敛公共转发，域装配收敛于构造器 create。
 */
@Injectable()
export class SceneHaSyncService extends OrchestratorDomainHaSyncFacade {
  private readonly logger = new Logger(SceneHaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORCHESTRATOR_HA_CONNECTOR_PORT)
    private readonly haConnector: OrchestratorHaConnectorPort,
    private readonly haSync: HaSyncService,
    yamlHaSync: OrchestratorDomainHaSyncFactory,
  ) {
    super(yamlHaSync);
    this.sync = this.yamlHaSync.create({
      logger: this.logger,
      domain: 'scene',
      entityLabel: '场景',
      localIdKey: 'sceneId',
      ...createPrismaRowAccessors(this.prisma.scene),
      // 推送：HA scene body 由 entities 装配（content 为派生 YAML，仅用于校验）
      toHaConfig: (content, configId, row) => ({
        id: configId,
        name: row.name,
        entities: builderEntitiesToHaMap(row.entities),
      }),
      localContentOf: (row) => this.entitiesToYaml(row.name, row.entities),
      // HA Config → 本地 YAML（场景以 entities + 原文 YAML 双轨存储）
      haConfigToYaml: (cfg) => {
        const c = cfg as { name?: string; entities?: Record<string, Record<string, unknown>> };
        return dumpOrchestratorYaml({ name: String(c.name || ''), entities: c.entities || {} });
      },
      // canonical 往返规范化：entities → HA map → entities，保证本地与 HA 的 diff 可靠
      canonicalLocal: (row) => this.canonicalSceneEntities(row.entities),
      canonicalFromHaConfig: (cfg) => this.canonicalHaSceneEntitiesFromConfig(cfg),
      pullNameFromConfig: (config, configId) =>
        String((config as { name?: string }).name || configId),
      // 拉取行：entities 反序列化 + 保留 HA 原文 YAML（序列化失败时省略，避免有损回退）
      pullRowData: (config, configId) => {
        const c = config as { name?: string; entities?: Record<string, Record<string, unknown>> };
        const entities = haSceneMapToEntities(c.entities || {});
        let yaml: string | undefined;
        try {
          yaml = dumpOrchestratorYaml({
            id: configId,
            name: String(c.name || configId),
            entities: c.entities || {},
          });
        } catch {
          yaml = undefined;
        }
        return { entities, ...(yaml != null ? { yaml } : {}) };
      },
      filterConfigId: (configId) => configId.startsWith('homeos_'),
      validateLocal: (yaml) => this.haSync.validateYaml(yaml),
      fetchHaConfig: (id) => this.haConnector.fetchSceneConfig(id),
      upsertConfig: async (configId, body) => {
        await this.haConnector.upsertSceneConfig(configId, body);
      },
      deleteConfig: (resolvedId) => this.haConnector.deleteSceneConfig(resolvedId),
      reloadService: () => this.haConnector.callServiceViaRest('scene', 'reload', '', {}),
      // reload 警告时保持 sync 错误记录（与重构前场景行为一致）
      recordSuccessOnReloadWarn: false,
      // HA 拉取的场景为真相；清空 geekSceneGraph，避免旧画布覆盖
      pullUpdateExtra: { geekSceneGraph: Prisma.DbNull },
    });
  }

  /**
   * 将本地 entities（JSON 字符串或数组）转换为 HA scene 的实体映射（entityId → 属性）。
   */
  entitiesToHaMap(entities: unknown): Record<string, Record<string, unknown>> {
    return builderEntitiesToHaMap(entities);
  }

  /**
   * 将 HA scene 的实体映射转换为本地 entities 数组（可写入 Prisma Json）。
   */
  haMapToEntities(entities: Record<string, Record<string, unknown>>): Prisma.InputJsonValue {
    return haSceneMapToEntities(entities) as unknown as Prisma.InputJsonValue;
  }

  /**
   * 将场景 entities 序列化为 HA YAML（含场景名称）。
   */
  entitiesToYaml(name: string, entities: unknown): string {
    const map = this.entitiesToHaMap(entities);
    return dumpOrchestratorYaml({ name, entities: map });
  }

  /**
   * 规范化场景 entities（用于可靠的 diff 比较）。
   * 通过 entitiesToHaMap → haMapToEntities 的往返转换确保格式一致；返回规范化字符串供哈希。
   */
  private canonicalSceneEntities(json: unknown): string {
    return canonicalEntitiesJson(
      json,
      (j) => this.entitiesToHaMap(j),
      (m) => this.haMapToEntities(m),
    );
  }

  /**
   * 从 HA 配置对象中提取并规范化 entities（哈希用字符串）。
   */
  private canonicalHaSceneEntitiesFromConfig(cfg: unknown): string {
    const entities = (cfg as { entities?: Record<string, Record<string, unknown>> }).entities || {};
    return this.canonicalSceneEntities(this.haMapToEntities(entities));
  }

  /**
   * 批量从 HA 拉取场景；allHaScenes=true 时关闭 homeos_ 过滤器拉取全部 HA 场景。
   */
  pullAllFromHA = (opts?: { allHaScenes?: boolean }) => this.sync.pullAllFromHA(opts);
}

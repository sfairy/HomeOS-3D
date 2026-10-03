/**
 * 脚本 HA 同步服务门面。
 *
 * 所属模块：backend/modules/script
 * 职责：把脚本 YAML ↔ HA script 配置（config_entry）的双向同步收敛为
 *  OrchestratorDomainHaSyncFacade 标准接口，供 ScriptController 走统一的
 *  createWithAutoSync / updateWithAutoSync 流程。
 *  转换器（haConfigToYaml / yamlToHaConfig / validateScriptYamlLocal）由
 *  shared/orchestrator/config.util 提供，DB 行访问由 createPrismaRowAccessors 适配。
 * 关键依赖：HaSyncService（HA REST 推送）、PrismaService（DB 行读写）、HaConnectorService。
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { HaConnectorService } from '../ha-connector/service';
import { HaSyncService } from '../ha-sync/service';
import { OrchestratorDomainHaSyncFactory } from '../../shared/orchestrator/orchestrator-domain-ha-sync.factory';
import { OrchestratorDomainHaSyncFacade } from '../../shared/orchestrator/orchestrator-domain-ha-sync.facade';
import { createPrismaRowAccessors } from '../../shared/orchestrator/yaml-ha-sync.util';
import {
  scriptHaConfigToYaml as haConfigToYaml,
  yamlToScriptHaConfig as yamlToHaConfig,
  validateScriptYamlLocal,
} from '../../shared/orchestrator/config.util';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
/**
 * ScriptHaSyncService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class ScriptHaSyncService
 */
export class ScriptHaSyncService extends OrchestratorDomainHaSyncFacade {
  private readonly logger = new Logger(ScriptHaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly haSync: HaSyncService,
    yamlHaSync: OrchestratorDomainHaSyncFactory,
  ) {
    super(yamlHaSync);
    this.sync = this.yamlHaSync.create({
      logger: this.logger,
      domain: 'script',
      entityLabel: '脚本',
      localIdKey: 'scriptId',
      ...createPrismaRowAccessors(this.prisma.script),
      toHaConfig: (y, configId, row) => yamlToHaConfig(y, configId, row.name),
      haConfigToYaml: (cfg) => haConfigToYaml(cfg as Parameters<typeof haConfigToYaml>[0]),
      validateLocal: validateScriptYamlLocal,
      optionalHaValidate: (yaml) => this.haSync.validateScriptYaml(yaml),
      fetchHaConfig: (id) => this.haConnector.fetchScriptConfig(id),
      upsertConfig: (configId, body) => this.haConnector.upsertScriptConfig(configId, body),
      deleteConfig: (resolvedId) => this.haConnector.deleteScriptConfig(resolvedId),
      reloadService: () => this.haConnector.callServiceViaRest('script', 'reload'),
      formatSuccessMessage: (configId, reloadWarn) =>
        reloadWarn ? `已同步到 HA (${configId})（${reloadWarn}）` : `已同步到 HA (${configId})`,
      // HA 拉取的 YAML 为真相；清空 geekGraph，避免旧画布覆盖
      pullUpdateExtra: { geekGraph: Prisma.DbNull },
    });
  }
}

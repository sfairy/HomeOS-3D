/**
 * 自动化 HA 同步服务门面。
 *
 * 所属模块：backend/modules/automation
 * 职责：把自动化 YAML ↔ HA automation 配置（config_entry）的双向同步收敛为
 *  OrchestratorDomainHaSyncFacade 标准接口，供 AutomationController 走统一的
 *  createWithAutoSync / updateWithAutoSync 流程。
 *  转换器（haConfigToYaml / yamlToHaConfig / validateAutomationYamlLocal）由
 *  yaml-ha-sync.util 提供，DB 行访问由 createPrismaRowAccessors 适配。
 * 关键依赖：HaSyncService（HA REST 推送）、PrismaService（DB 行读写）、HaConnectorService。
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { HaConnectorService } from '../ha-connector/service';
import { HaSyncService } from '../ha-sync/service';
import { OrchestratorDomainHaSyncFactory } from '../../shared/orchestrator/orchestrator-domain-ha-sync.factory';
import { OrchestratorDomainHaSyncFacade } from '../../shared/orchestrator/orchestrator-domain-ha-sync.facade';
import { getErrorMessage } from '../../common/utils';
import { createPrismaRowAccessors } from '../../shared/orchestrator/yaml-ha-sync.util';
import {
  automationHaConfigToYaml as haConfigToYaml,
  yamlToAutomationHaConfig as yamlToHaConfig,
  validateAutomationYamlLocal,
  wrapAutomationForHaCheck,
} from '../../shared/orchestrator/config.util';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
/**
 * AutomationHaSyncService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AutomationHaSyncService
 */
export class AutomationHaSyncService extends OrchestratorDomainHaSyncFacade {
  private readonly logger = new Logger(AutomationHaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly haSync: HaSyncService,
    yamlHaSync: OrchestratorDomainHaSyncFactory,
  ) {
    super(yamlHaSync);
    this.sync = this.yamlHaSync.create({
      logger: this.logger,
      domain: 'automation',
      entityLabel: '自动化',
      localIdKey: 'automationId',
      ...createPrismaRowAccessors(this.prisma.automation),
      toHaConfig: (y, configId, row) =>
        yamlToHaConfig(y, configId, row.name, row.enabled ?? true, row.runOnHa ?? false),
      haConfigToYaml: (cfg) => haConfigToYaml(cfg as Parameters<typeof haConfigToYaml>[0]),
      validateLocal: validateAutomationYamlLocal,
      optionalHaValidate: (yaml) => this.haSync.validateYaml(wrapAutomationForHaCheck(yaml)),
      fetchHaConfig: (id) => this.haConnector.fetchAutomationConfig(id),
      upsertConfig: (configId, body) => this.haConnector.upsertAutomationConfig(configId, body),
      deleteConfig: (resolvedId) => this.haConnector.deleteAutomationConfig(resolvedId),
      reloadService: () => this.haConnector.callServiceViaRest('automation', 'reload'),
      reloadForRemove: () => this.haConnector.callServiceViaRest('automation', 'reload', '', {}),
      pullMissingMessage: '未关联 HA 配置，无法从 HA 拉取',
      extraFields: (r) => ({ enabled: r.enabled }),
      recordSuccessOnReloadWarn: false,
      autoRepairOnSyncAll: true,
      resolvePullEnabled: async (configId) => {
        const entity = await this.haConnector.fetchEntityState(`automation.${configId}`);
        return entity?.state === 'on';
      },
      // HA 拉取的 YAML 为真相；清空 geekGraph，避免旧画布覆盖
      pullUpdateExtra: { geekGraph: Prisma.DbNull },
      afterUpsert: async (row, configId) => {
        const entityId = `automation.${configId}`;
        if (row.runOnHa && row.enabled) {
          try {
            await this.haConnector.callServiceViaRest('automation', 'turn_on', entityId);
          } catch (e: unknown) {
            this.logger.warn(`自动化开启失败 [${entityId}]: ${getErrorMessage(e)}`);
          }
        } else {
          try {
            await this.haConnector.callServiceViaRest('automation', 'turn_off', entityId);
          } catch {
            /* 实体可能尚未生成 */
          }
        }
      },
      formatRemoveError: (msg, resolvedId, id) => {
        const hint = resolvedId !== id ? `（已尝试 config id=${resolvedId}）` : '';
        return msg.includes('400')
          ? `${msg}${hint}。若为 HA UI 创建或 packages 中的自动化，可能无法通过 API 删除，请在 HA 设置中手动删除`
          : `${msg}${hint}`;
      },
    });
  }
}

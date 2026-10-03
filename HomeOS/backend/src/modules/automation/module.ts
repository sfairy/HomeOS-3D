/**
 * 自动化模块（AutomationModule）装配定义。
 *
 * 所属模块：backend/modules/automation
 * 职责：聚合自动化所需的全部 Provider / Service / Controller，
 *  并通过 AutomationPlaceholderService 工厂把 YAML Geek 占位符处理器接入。
 * 依赖：
 *  - PrismaModule：数据库访问
 *  - HaConnectorModule：HA 实体注册表
 *  - StateStoreModule：实体状态缓存
 *  - HaConfigImportModule：HA 配置导入
 *  - SceneModule / ScriptModule：自动化动作调用场景与脚本
 * 暴露：AutomationService / AutomationEngineService / AutomationHaSyncService /
 *  AutomationVariableService / AutomationPlaceholderService。
 */
import { Module } from '@nestjs/common';
import { AutomationController } from './controller';
import { AutomationService } from './service';
import { AutomationEngineService } from './engine.service';
import { AutomationHaSyncService } from './ha-sync.service';
import { AutomationVariableService } from './variable.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { StateStoreModule } from '../state-store/module';
import { StateStoreService } from '../state-store/service';
import { HaConfigImportModule } from '../ha-sync/module';
import { SceneModule } from '../scene/module';
import { ScriptModule } from '../script/module';
import { createYamlGeekPlaceholderHandlers } from '../../shared/orchestrator/placeholder.helper';
import { fingerprintAutomationYaml } from '@homeos/shared';
import { AutomationPlaceholderService } from '../../shared/orchestrator/placeholder-service.base';

@Module({
  imports: [
    PrismaModule,
    HaConnectorModule,
    StateStoreModule,
    HaConfigImportModule,
    SceneModule,
    ScriptModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationEngineService,
    AutomationHaSyncService,
    AutomationVariableService,
    {
      provide: AutomationPlaceholderService,
      useFactory: (automationService: AutomationService, stateStore: StateStoreService) =>
        new AutomationPlaceholderService(
          createYamlGeekPlaceholderHandlers(automationService, stateStore, '自动化不存在', {
            fingerprintYaml: fingerprintAutomationYaml,
          }),
        ),
      inject: [AutomationService, StateStoreService],
    },
  ],
  exports: [
    AutomationService,
    AutomationEngineService,
    AutomationHaSyncService,
    AutomationVariableService,
    AutomationPlaceholderService,
  ],
})
/**
 * AutomationModule：Nest @Module 模块。
 * - 所属域：modules/automation/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class AutomationModule
 */
export class AutomationModule {}

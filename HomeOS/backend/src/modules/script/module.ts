/**
 * 脚本模块（ScriptModule）装配定义。
 *
 * 所属模块：backend/modules/script
 * 职责：管理 YAML 格式的 Home Assistant 脚本。脚本由一系列操作（action）组成，
 *  可以手动触发或被自动化和场景调用。本地执行支持 homeos.scene.execute 等扩展动作。
 * 依赖：
 *  - PrismaModule：脚本数据持久化
 *  - HaConnectorModule：执行脚本时通过 HA 发送设备控制指令
 *  - HaConfigImportModule：脚本与 Home Assistant 的双向同步
 *  - StateStoreModule：提供实体引用列表用于占位符替换建议
 *  - SceneModule：本地执行 homeos.scene.execute 时调用
 *  - ChildModeModule：脚本执行时的儿童模式实体 ACL
 * 暴露：ScriptService / ScriptHaSyncService / ScriptPlaceholderService。
 */
import { Module } from '@nestjs/common';
import { ScriptController } from './controller';
import { ScriptService } from './service';
import { ScriptHaSyncService } from './ha-sync.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { HaConfigImportModule } from '../ha-sync/module';
import { StateStoreModule } from '../state-store/module';
import { StateStoreService } from '../state-store/service';
import { SceneModule } from '../scene/module';
import { ChildModeModule } from '../child-mode/module';
import { createScriptPlaceholderHandlers } from '../../shared/orchestrator/placeholder.helper';
import { ScriptPlaceholderService } from '../../shared/orchestrator/placeholder-service.base';

/**
 * 脚本模块定义（DI 角色：聚合控制器、服务与占位符服务）。
 * ScriptPlaceholderService 通过工厂函数创建，注入 ScriptService 与 StateStoreService。
 * 对外导出 ScriptService、ScriptHaSyncService 与 ScriptPlaceholderService。
 */
@Module({
  imports: [
    PrismaModule,
    HaConnectorModule,
    HaConfigImportModule,
    StateStoreModule,
    // 本地执行 homeos.scene.execute
    SceneModule,
    ChildModeModule,
  ],
  controllers: [ScriptController],
  providers: [
    ScriptService,
    ScriptHaSyncService,
    {
      provide: ScriptPlaceholderService,
      useFactory: (scriptService: ScriptService, stateStore: StateStoreService) =>
        new ScriptPlaceholderService(
          createScriptPlaceholderHandlers(scriptService, stateStore, '脚本不存在'),
        ),
      inject: [ScriptService, StateStoreService],
    },
  ],
  exports: [ScriptService, ScriptHaSyncService, ScriptPlaceholderService],
})
/**
 * ScriptModule：Nest @Module 模块。
 * - 所属域：modules/script/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class ScriptModule
 */
export class ScriptModule {}
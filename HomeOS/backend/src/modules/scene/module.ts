/**
 * 场景模块（SceneModule）装配定义。
 *
 * 所属模块：backend/modules/scene
 * 职责：聚合场景所需的全部 Provider / Service / Controller，
 *  覆盖场景的创建、编辑、删除、执行、HA 同步、叠加执行与定时执行能力，
 *  并通过 ScenePlaceholderService 工厂接入 YAML 占位符处理。
 * 依赖：
 *  - PrismaModule：数据库访问
 *  - HaConnectorModule：HA 实体注册表
 *  - HaConfigImportModule：HA 配置导入
 *  - StateStoreModule：实体状态缓存（用于场景 ACL 校验与上下文）
 *  - AuthModule：场景执行时的实体 ACL
 *  - ChildModeModule：儿童模式下的实体过滤
 * 暴露：SceneService / SceneHaSyncService / ScenePlaceholderService。
 */
import { forwardRef, Module } from '@nestjs/common';
import { SceneController } from './controller';
import { SceneService } from './service';
import { SceneHaSyncService } from './ha-sync.service';
import { SceneOverlayService } from './scene-overlay.service';
import { SceneScheduleService } from './scene-schedule.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { HaConfigImportModule } from '../ha-sync/module';
import { AuthModule } from '../auth/module';
import { StateStoreModule } from '../state-store/module';
import { StateStoreService } from '../state-store/service';
import { createScenePlaceholderHandlers } from './placeholder.handlers';
import { ScenePlaceholderService } from '../../shared/orchestrator/placeholder-service.base';
import { ChildModeModule } from '../child-mode/module';

@Module({
  imports: [
    PrismaModule,
    HaConnectorModule,
    HaConfigImportModule,
    forwardRef(() => AuthModule),
    StateStoreModule,
    ChildModeModule,
  ],
  controllers: [SceneController],
  providers: [
    SceneService,
    SceneOverlayService,
    SceneScheduleService,
    SceneHaSyncService,
    {
      provide: ScenePlaceholderService,
      useFactory: (sceneService: SceneService, stateStore: StateStoreService) =>
        new ScenePlaceholderService(createScenePlaceholderHandlers(sceneService, stateStore)),
      inject: [SceneService, StateStoreService],
    },
  ],
  exports: [SceneService, SceneHaSyncService, ScenePlaceholderService],
})
/**
 * SceneModule：Nest @Module 模块。
 * - 所属域：modules/scene/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class SceneModule
 */
export class SceneModule {}
